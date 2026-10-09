import {Inject,Injectable} from "@nestjs/common";
import type {Pool,PoolClient} from "pg";
import {CONTROL_API_POOL} from "../tokens";
import {RESEARCH_DB_BUDGET,RESEARCH_DB_RUNTIME_ROLE,type ResearchScope} from "./contracts";
import {acquireResearchPoolClient,BoundedResearchReadAdmission} from "./bounded-read";
import {NativeCustodySchema,type NativeCustody} from "./native-read.contract";
import {sha256ResearchJson} from "./preflight.service";
import {executionRecipe} from "./execution-recipes";
import {ResearchReportError} from "./report.error";
const unavailable=()=>new ResearchReportError("RESEARCH_REPORT_UNAVAILABLE","Native retained evidence is unavailable.",503);
export type NativeStoredRead={custody:NativeCustody;digest:string;checkedAtUtcMs:number};
export type NativeBinding=Omit<NativeCustody,"schema_version"|"engine_version"|"summary"|"source_parts"|"trials"|"selected_parameters_digest"|"selection_evidence"|"verification_scope">;
@Injectable()
export class ResearchNativeReadRepository {
  private readonly admission=new BoundedResearchReadAdmission({maximumActive:2,maximumQueued:18,waitTimeoutMs:RESEARCH_DB_BUDGET.boundedReadQueueWaitMs,unavailable});
  constructor(@Inject(CONTROL_API_POOL)private readonly pool:Pool){}
  private async bound(c:PoolClient,scope:ResearchScope,runId:string):Promise<NativeBinding|null>{
    const r=await c.query(`SELECT a.artifact_id,a.artifact_revision,a.manifest_digest,p.requested_spec_digest,p.effective_spec_digest,
      p.dataset_binding_digest,p.execution_profile_id,p.execution_profile_digest FROM research.artifacts a
      JOIN research.run_producers p ON (p.workspace_id,p.run_id,p.worker_attempt_id,p.lease_epoch)=(a.workspace_id,a.run_id,a.worker_attempt_id,a.lease_epoch)
      WHERE a.workspace_id=$1 AND a.run_id=$2 AND a.state='SEALED' ORDER BY a.artifact_revision DESC LIMIT 1`,[scope.workspaceId,runId]);
    if(!r.rowCount)return null;
    const row=r.rows[0];let recipe;
    try{recipe=executionRecipe(row.execution_profile_id,row.execution_profile_digest);}catch{throw unavailable();}
    if(recipe.descriptor.schema_version!=="research.native-route-profile.v1"||recipe.public_profile.trial_count.max<=1)return null;
    return {...row,workspace_id:scope.workspaceId,run_id:runId,artifact_revision:Number(row.artifact_revision)};
  }
  async binding(scope:ResearchScope,runId:string){return this.tx(scope,false,c=>this.bound(c,scope,runId));}
  async read(scope:ResearchScope,runId:string):Promise<NativeStoredRead|null>{
    const release=await this.admission.acquire();
    try{return await this.tx(scope,false,async c=>{
      const bound=await this.bound(c,scope,runId);if(!bound)return null;
      const r=await c.query(`SELECT projection,projection_digest,floor(extract(epoch FROM prepared_at)*1000)::bigint AS checked
        FROM research.native_read_models_v1 WHERE workspace_id=$1 AND run_id=$2 AND artifact_revision=$3 AND manifest_digest=$4 AND projection_version=2`,
        [scope.workspaceId,runId,bound.artifact_revision,bound.manifest_digest]);
      if(!r.rowCount)return null;
      const custody=NativeCustodySchema.parse(r.rows[0].projection),digest=r.rows[0].projection_digest;
      if(sha256ResearchJson(custody)!==digest||Object.entries(bound).some(([k,v])=>custody[k as keyof NativeCustody]!==v))throw unavailable();
      return {custody,digest,checkedAtUtcMs:Number(r.rows[0].checked)};
    });}finally{release();}
  }
  async store(scope:ResearchScope,raw:unknown):Promise<NativeStoredRead>{
    const custody=NativeCustodySchema.parse(raw),digest=sha256ResearchJson(custody);
    return this.tx(scope,true,async c=>{
      const bound=await this.bound(c,scope,custody.run_id);
      if(!bound||Object.entries(bound).some(([k,v])=>custody[k as keyof NativeCustody]!==v))throw unavailable();
      await c.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`,[`native-read:${scope.workspaceId}:${custody.run_id}`]);
      const prior=await c.query(`SELECT projection_digest FROM research.native_read_models_v1 WHERE workspace_id=$1 AND run_id=$2 AND artifact_revision=$3 AND projection_version=2`,
        [scope.workspaceId,custody.run_id,custody.artifact_revision]);
      if(prior.rowCount&&prior.rows[0].projection_digest!==digest)throw unavailable();
      if(!prior.rowCount)await c.query(`INSERT INTO research.native_read_models_v1(workspace_id,run_id,artifact_id,artifact_revision,manifest_digest,projection_digest,projection,projection_version)
        VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,2)`,[scope.workspaceId,custody.run_id,custody.artifact_id,custody.artifact_revision,custody.manifest_digest,digest,JSON.stringify(custody)]);
      const r=await c.query(`SELECT floor(extract(epoch FROM prepared_at)*1000)::bigint AS checked FROM research.native_read_models_v1 WHERE workspace_id=$1 AND run_id=$2 AND artifact_revision=$3 AND projection_version=2`,
        [scope.workspaceId,custody.run_id,custody.artifact_revision]);
      return {custody,digest,checkedAtUtcMs:Number(r.rows[0].checked)};
    });
  }
  private async tx<T>(scope:ResearchScope,write:boolean,work:(c:PoolClient)=>Promise<T>):Promise<T>{
    const c=await acquireResearchPoolClient(this.pool.connect(),RESEARCH_DB_BUDGET.boundedReadAcquireTimeoutMs,unavailable);let began=false;
    try{await c.query(write?"BEGIN":"BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");began=true;
      await c.query(`SET LOCAL ROLE ${RESEARCH_DB_RUNTIME_ROLE}`);
      await c.query(`SELECT set_config('research.workspace_id',$1,true),set_config('research.actor_user_id',$2,true),
        set_config('statement_timeout',$3,true),set_config('lock_timeout',$4,true),set_config('idle_in_transaction_session_timeout',$5,true)`,
        [scope.workspaceId,scope.actorUserId,`${RESEARCH_DB_BUDGET.statementTimeoutMs}ms`,`${RESEARCH_DB_BUDGET.lockTimeoutMs}ms`,`${RESEARCH_DB_BUDGET.idleTransactionTimeoutMs}ms`]);
      const member=await c.query("SELECT 1 FROM workspace_members WHERE workspace_id=$1 AND user_id=$2",[scope.workspaceId,scope.actorUserId]);
      if(!member.rowCount)throw new ResearchReportError("RESEARCH_REPORT_FORBIDDEN","Access denied.",403);
      const result=await work(c);await c.query("COMMIT");return result;
    }catch(e){if(began)await c.query("ROLLBACK").catch(()=>undefined);if(e instanceof ResearchReportError)throw e;
      const wrapped=unavailable();(wrapped as Error & {cause:unknown}).cause=e;throw wrapped;
    }finally{c.release();}
  }
}
