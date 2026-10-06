/** Atomic admission and immutable verified receipt; never opens source files. */
import { Inject, Injectable } from "@nestjs/common";
import type { Pool, PoolClient } from "pg";
import { CONTROL_API_POOL } from "../tokens";
import { newUlid } from "../id";
import { RESEARCH_DB_BUDGET, RESEARCH_DB_RUNTIME_ROLE, type ResearchScope } from "./contracts";
import { assertUtilityCapacity, ResearchUtilitySaturated } from "./utility-admission";
import { sha256ResearchJson } from "./preflight.service";
import { PinnedAuditPreparationSchema, PINNED_AUDIT_PROFILE_ID, PINNED_AUDIT_PROFILE_DIGEST,
  ResearchFinalAuditError, type PinnedAuditTarget, type PinnedAuditResult, pinnedAuditTargetDigest,
  pinnedAuditParametersDigest } from "./final-audit.contract";
import { readPinnedAuditProofs } from "./final-audit.read";

export interface AuditParent {
  pins: ReturnType<typeof PinnedAuditPreparationSchema.parse>;
  attemptId: string; legacyRequest: Record<string, unknown>;
  requestedSpecDigest: string; effectiveSpecDigest: string;
  executionProfileId?: string; executionProfileDigest?: string;
}
export interface AdmittedAudit {
  runId: string; jobId: string; legacyRequest: Record<string, unknown>; dispatchState: string; replayed: boolean;
}
const object = (value: unknown): Record<string, unknown> => {
  const result = typeof value === "string" ? JSON.parse(value) : value;
  if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error("invalid metadata object");
  return result as Record<string, unknown>;
};

@Injectable()
export class ResearchFinalAuditRepository {
  constructor(@Inject(CONTROL_API_POOL) private readonly pool: Pool) {}
  async parent(scope: ResearchScope, runId: string): Promise<AuditParent> {
    return this.transaction(scope, true, async client => {
      const rows = await client.query<Record<string, unknown>>(`SELECT producer.*, run.engine_release_id,
          artifact.artifact_id, artifact.artifact_revision, artifact.manifest_digest AS artifact_manifest_digest
        FROM research.run_producers producer
        JOIN research.runs run USING(workspace_id,run_id)
        JOIN LATERAL (SELECT artifact_id,artifact_revision,manifest_digest FROM research.artifacts a
          WHERE a.workspace_id=run.workspace_id AND a.run_id=run.run_id AND a.state='SEALED'
          AND a.artifact_revision>0 ORDER BY artifact_revision DESC LIMIT 1) artifact ON TRUE
        WHERE producer.workspace_id=$1 AND producer.run_id=$2 AND run.state='READY'
        AND run.relationship_kind<>'AUDIT_OF_SELECTION'`, [scope.workspaceId,runId]);
      const row=rows.rows[0];
      if (!row) throw new ResearchFinalAuditError("RESEARCH_FINAL_AUDIT_NOT_FOUND", "Ready retained parent was not found.",404);
      const pins=PinnedAuditPreparationSchema.safeParse({parent_run_id:runId,parent_artifact_id:row.artifact_id,
        parent_artifact_revision:Number(row.artifact_revision),parent_manifest_digest:row.artifact_manifest_digest,
        dataset_binding_digest:row.dataset_binding_digest,snapshot_id:row.snapshot_id,snapshot_content_hash:row.snapshot_content_hash,
        engine_release_id:row.engine_release_id,alpha_version_id:row.alpha_version_id,
        execution_adapter_id:row.execution_adapter_id,adapter_contract_digest:row.adapter_contract_digest});
      if (!pins.success) throw new ResearchFinalAuditError("RESEARCH_FINAL_AUDIT_NOT_APPLICABLE", "Parent is outside the qualified audit profile.",409);
      return {pins:pins.data,attemptId:String(row.attempt_id),legacyRequest:object(row.legacy_request),
        requestedSpecDigest:String(row.requested_spec_digest),effectiveSpecDigest:String(row.effective_spec_digest),
        executionProfileId:String(row.execution_profile_id),executionProfileDigest:String(row.execution_profile_digest)};
    });
  }
  async latest(scope:ResearchScope,parentRunId:string,targetDigest:string) {
    return this.transaction(scope,true, async client => {
      const rows=await client.query<{run_id:string;state:string;result:unknown}>(`SELECT target.run_id,run.state,proof.result
        FROM research.pinned_audit_targets_v1 target JOIN research.runs run USING(workspace_id,run_id)
        LEFT JOIN research.pinned_audit_receipts_v1 proof USING(workspace_id,run_id)
        JOIN research.jobs job ON job.workspace_id=run.workspace_id AND job.run_id=run.run_id
        WHERE target.workspace_id=$1 AND target.parent_run_id=$2 AND target.target_digest=$3
        ORDER BY target.created_at DESC,target.run_id DESC LIMIT 1`,[scope.workspaceId,parentRunId,targetDigest]);
      const row=rows.rows[0];
      const proof = row ? (await readPinnedAuditProofs(client,scope.workspaceId,[row.run_id])).get(row.run_id) ?? null : null;
      return row ? {runId:row.run_id,state:row.state,proof} : null;
    });
  }
  async admit(scope:ResearchScope,parent:AuditParent,target:PinnedAuditTarget,clientIntentId:string,
    legacyRequest:Record<string,unknown>,workDigest:string):Promise<AdmittedAudit> {
    if (Buffer.byteLength(JSON.stringify(legacyRequest),"utf8")>RESEARCH_DB_BUDGET.maxConfigJsonBytes)
      throw new ResearchFinalAuditError("RESEARCH_FINAL_AUDIT_NOT_APPLICABLE","Original target exceeds the producer metadata budget.",409);
    const targetDigest=pinnedAuditTargetDigest(target);
    let parametersDigest: string;
    try { parametersDigest=pinnedAuditParametersDigest(target.source_selection_raw); }
    catch { throw new ResearchFinalAuditError("RESEARCH_FINAL_AUDIT_NOT_APPLICABLE",
      "Original selection lacks the qualified exact-decimal representation.",409); }
    return this.transaction(scope,false,async client=>{
      // Serialize both replay and per-parent allocation before touching the shared utility budget.
      const locked=await client.query(`SELECT 1 FROM research.runs WHERE workspace_id=$1 AND run_id=$2
        AND attempt_id=$3 AND state='READY' FOR UPDATE`,[scope.workspaceId,target.parent_run_id,parent.attemptId]);
      if(locked.rowCount!==1) throw new ResearchFinalAuditError("RESEARCH_FINAL_AUDIT_CONFLICT","Parent readiness changed.",409);
      const old=await client.query<Record<string,unknown>>(`SELECT p.run_id,p.job_id,p.actor_user_id,p.legacy_request,p.dispatch_state,p.work_digest,t.target_digest
        FROM research.run_producers p LEFT JOIN research.pinned_audit_targets_v1 t USING(workspace_id,run_id)
        WHERE p.workspace_id=$1 AND p.client_intent_id=$2`,[scope.workspaceId,clientIntentId]);
      if(old.rows[0]){
        const row=old.rows[0];
        if(row.actor_user_id!==scope.actorUserId || row.work_digest!==workDigest || row.target_digest!==targetDigest)
          throw new ResearchFinalAuditError("RESEARCH_FINAL_AUDIT_CONFLICT","Intent is already bound to another frozen target.",409);
        return {runId:String(row.run_id),jobId:String(row.job_id),legacyRequest:object(row.legacy_request),dispatchState:String(row.dispatch_state),replayed:true};
      }
      const artifact=await client.query(`SELECT 1 FROM research.artifacts WHERE workspace_id=$1 AND artifact_id=$2
        AND run_id=$3 AND artifact_revision=$4 AND manifest_digest=$5 AND state='SEALED'
        AND artifact_revision=(SELECT max(a.artifact_revision) FROM research.artifacts a
          WHERE a.workspace_id=$1 AND a.run_id=$3 AND a.state='SEALED') FOR SHARE`,
        [scope.workspaceId,target.parent_artifact_id,target.parent_run_id,target.parent_artifact_revision,target.parent_manifest_digest]);
      if(artifact.rowCount!==1) throw new ResearchFinalAuditError("RESEARCH_FINAL_AUDIT_CONFLICT","Original artifact changed or is unavailable.",409);
      const busy=await client.query(`SELECT 1 FROM research.pinned_audit_targets_v1 t JOIN research.runs r USING(workspace_id,run_id)
        WHERE t.workspace_id=$1 AND t.parent_run_id=$2 AND r.state IN ('DRAFT','QUEUED','RUNNING','SEALING') LIMIT 1`,
        [scope.workspaceId,target.parent_run_id]);
      if(busy.rowCount) throw new ResearchFinalAuditError("RESEARCH_FINAL_AUDIT_CONFLICT","An audit for this parent is already in flight.",409);
      await assertUtilityCapacity(client,scope.workspaceId,scope.actorUserId);
      const identity=sha256ResearchJson({workspace_id:scope.workspaceId,actor_user_id:scope.actorUserId,client_intent_id:clientIntentId,target_digest:targetDigest});
      const runId=`rrun_${identity.slice(0,32)}`,attemptId=`ratt_${identity.slice(0,32)}`,jobId=`rjob_${identity.slice(0,32)}`;
      const preflightToken=`rpft_audit_${identity.slice(0,32)}`;
      const originalResearch=object(legacyRequest.research);
      const legacy={...legacyRequest,run_id:runId,workspace_id:scope.workspaceId,
        research:{...originalResearch,preflight_token:preflightToken}};
      // An audit reuses the exact historical snapshot/spec, not a new HMD
      // preflight. Give its immutable metadata copy the requesting actor's
      // identity; never impersonate the parent's actor or relax the FK.
      const preflight=await client.query(`INSERT INTO research.preflight_manifests(workspace_id,preflight_token,actor_user_id,
        requested_spec_digest,effective_spec_digest,dataset_binding_digest,manifest_digest,requested_spec,effective_spec,
        dataset_binding,topology,resource_estimate,snapshot,expires_at)
        SELECT old.workspace_id,$3,$4,old.requested_spec_digest,old.effective_spec_digest,old.dataset_binding_digest,
          old.manifest_digest,old.requested_spec,old.effective_spec,old.dataset_binding,old.topology,old.resource_estimate,
          old.snapshot,now()+interval '5 minutes' FROM research.preflight_manifests old
        JOIN research.run_producers p ON p.workspace_id=old.workspace_id AND p.preflight_token=old.preflight_token
          AND p.actor_user_id=old.actor_user_id
        WHERE p.workspace_id=$1 AND p.run_id=$2 AND old.requested_spec_digest=$5 AND old.effective_spec_digest=$6
          AND old.dataset_binding_digest=$7 AND old.snapshot->>'snapshot_content_hash'=$8`,
        [scope.workspaceId,target.parent_run_id,preflightToken,scope.actorUserId,parent.requestedSpecDigest,
          parent.effectiveSpecDigest,target.dataset_binding_digest,target.snapshot_content_hash]);
      if(preflight.rowCount!==1) throw new ResearchFinalAuditError("RESEARCH_FINAL_AUDIT_CONFLICT","Original snapshot declaration changed.",409);
      await client.query(`INSERT INTO research.attempts(workspace_id,attempt_id,alpha_version_id,parent_attempt_id,
        client_intent_id,request_payload_digest,intent_kind,reason,state,created_by_user_id)
        VALUES($1,$2,$3,$4,$5,$6,'DIAGNOSTIC','Pinned final audit; no reselection','QUEUED',$7)`,
        [scope.workspaceId,attemptId,target.alpha_version_id,parent.attemptId,clientIntentId,workDigest,scope.actorUserId]);
      await client.query(`INSERT INTO research.runs(workspace_id,run_id,attempt_id,run_kind,relationship_kind,logical_run_key,
        parent_run_id,request_spec_digest,effective_spec_digest,engine_release_id,dataset_binding_digest,state,submitted_by_user_id)
        VALUES($1,$2,$3,'AUDIT','AUDIT_OF_SELECTION',$4,$5,$6,$7,$8,$9,'QUEUED',$10)`,
        [scope.workspaceId,runId,attemptId,`audit:${identity}`,target.parent_run_id,parent.requestedSpecDigest,parent.effectiveSpecDigest,
          target.engine_release_id,target.dataset_binding_digest,scope.actorUserId]);
      const cost={memory_bytes:4*1024**3,cpu_seconds:120,scratch_bytes:128*1024**2,io_bytes:512*1024**2};
      await client.query(`INSERT INTO research.jobs(workspace_id,job_id,run_id,command_id,logical_work_key,work_digest,
        job_kind,readiness_class,queue_class,cost_estimate,resource_class,attempt_limit,state,requested_by_user_id)
        VALUES($1,$2,$3,$4,$5,$6,'AUDIT','MANDATORY','BACKGROUND',$7::jsonb,'p23-pinned-final-audit-v1',1,'QUEUED',$8)`,
        [scope.workspaceId,jobId,runId,`rcmd_${identity.slice(0,32)}`,`audit:${identity}`,workDigest,JSON.stringify(cost),scope.actorUserId]);
      const copied=await client.query(`INSERT INTO research.run_producers(workspace_id,run_id,attempt_id,job_id,actor_user_id,client_intent_id,
        intent_kind,preflight_token,alpha_id,alpha_version_id,execution_adapter_id,adapter_contract_digest,requested_spec_digest,
        effective_spec_digest,dataset_binding_digest,manifest_digest,snapshot_id,snapshot_content_hash,work_digest,legacy_request,
        execution_profile_id,execution_profile_digest)
        SELECT workspace_id,$3,$4,$5,$14,$6,'DIAGNOSTIC',$20,alpha_id,alpha_version_id,execution_adapter_id,
          adapter_contract_digest,requested_spec_digest,effective_spec_digest,dataset_binding_digest,manifest_digest,snapshot_id,
          snapshot_content_hash,$7,$8::jsonb,$9,$10 FROM research.run_producers WHERE workspace_id=$1 AND run_id=$2
          AND requested_spec_digest=$11 AND effective_spec_digest=$12 AND snapshot_content_hash=$13
          AND alpha_version_id=$15 AND dataset_binding_digest=$16 AND snapshot_id=$17
          AND execution_adapter_id=$18 AND adapter_contract_digest=$19`,
        [scope.workspaceId,target.parent_run_id,runId,attemptId,jobId,clientIntentId,workDigest,JSON.stringify(legacy),
          PINNED_AUDIT_PROFILE_ID,PINNED_AUDIT_PROFILE_DIGEST,parent.requestedSpecDigest,parent.effectiveSpecDigest,target.snapshot_content_hash,
          scope.actorUserId,target.alpha_version_id,target.dataset_binding_digest,target.snapshot_id,target.execution_adapter_id,target.adapter_contract_digest,preflightToken]);
      if(copied.rowCount!==1) throw new ResearchFinalAuditError("RESEARCH_FINAL_AUDIT_CONFLICT","Original producer pins changed.",409);
      const {source_config_raw:_config,source_selection_raw:_selection,...pins}=target;
      const targetPins={...pins,parameters_digest:parametersDigest};
      await client.query(`INSERT INTO research.pinned_audit_targets_v1(workspace_id,run_id,parent_run_id,parent_artifact_id,
        parent_manifest_digest,target_digest,target_pins,requested_by_user_id) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8)`,
        [scope.workspaceId,runId,target.parent_run_id,target.parent_artifact_id,target.parent_manifest_digest,targetDigest,JSON.stringify(targetPins),scope.actorUserId]);
      await client.query(`INSERT INTO research.artifact_references(workspace_id,artifact_id,reference_kind,reference_id)
        VALUES($1,$2,'CHILD_RUN',$3)`,[scope.workspaceId,target.parent_artifact_id,runId]);
      await client.query(`INSERT INTO research.audit_log(workspace_id,audit_id,actor_user_id,action,subject_type,subject_id,metadata)
        VALUES($1,$2,$3,'RESEARCH_PINNED_AUDIT_ADMITTED','run',$4,$5::jsonb)`,
        [scope.workspaceId,newUlid("raud"),scope.actorUserId,runId,JSON.stringify({parent_run_id:target.parent_run_id,target_digest:targetDigest,job_id:jobId,
          preflight_basis:"IMMUTABLE_PARENT_SNAPSHOT_REUSE",preflight_token:preflightToken,parent_preflight_token:originalResearch.preflight_token})]);
      const outbox={job_id:jobId,logical_work_key:`audit:${identity}`,queue_class:"BACKGROUND",run_id:runId,work_digest:workDigest};
      await client.query(`INSERT INTO research.job_outbox(workspace_id,outbox_id,job_id,delivery_generation,event_type,payload_digest,payload,state)
        VALUES($1,$2,$3,1,'RESEARCH_JOB_QUEUED',$4,$5::jsonb,'PENDING')`,
        [scope.workspaceId,newUlid("rout"),jobId,sha256ResearchJson(outbox),JSON.stringify(outbox)]);
      // Dispatch below claims this exact durable job, not an unbounded/global queue.
      return {runId,jobId,legacyRequest:legacy,dispatchState:"PENDING",replayed:false};
    });
  }
  async sealProof(scope:ResearchScope,input:{run_id:string;job_id:string;worker_attempt_id:string;lease_epoch:number;
    artifact_id:string;artifact_revision:number;manifest_digest:string;result:PinnedAuditResult}):Promise<void>{
    return this.transaction(scope,false,async client=>{
      const rows=await client.query<{target_digest:string;target_pins:unknown}>(`SELECT t.target_digest,t.target_pins
        FROM research.pinned_audit_targets_v1 t JOIN research.runs r USING(workspace_id,run_id)
        JOIN research.run_producers p USING(workspace_id,run_id)
        JOIN research.jobs j ON j.workspace_id=t.workspace_id AND j.job_id=p.job_id
        JOIN research.worker_attempts w ON w.workspace_id=j.workspace_id AND w.worker_attempt_id=j.current_worker_attempt_id
        JOIN research.artifacts a ON a.workspace_id=t.workspace_id AND a.artifact_id=$6
        WHERE t.workspace_id=$1 AND t.run_id=$2 AND j.job_id=$3 AND w.worker_attempt_id=$4 AND w.lease_epoch=$5
          AND j.current_lease_epoch=$5 AND w.expires_at>now() AND w.state IN ('CLAIMED','RUNNING')
          AND j.state IN ('CLAIMED','RUNNING') AND p.execution_profile_id=$9
          AND r.run_kind='AUDIT' AND r.relationship_kind='AUDIT_OF_SELECTION'
          AND a.run_id=t.run_id AND a.worker_attempt_id=w.worker_attempt_id AND a.lease_epoch=w.lease_epoch
          AND a.state='SEALED' AND a.artifact_revision=$7 AND a.manifest_digest=$8
        FOR UPDATE OF j`,[scope.workspaceId,input.run_id,input.job_id,input.worker_attempt_id,input.lease_epoch,
          input.artifact_id,input.artifact_revision,input.manifest_digest,PINNED_AUDIT_PROFILE_ID]);
      const row=rows.rows[0];
      if(!row)throw new ResearchFinalAuditError("RESEARCH_FINAL_AUDIT_CONFLICT","Audit seal lease or custody does not verify.",409);
      const pins=object(row.target_pins),result=input.result;
      const keys=["parent_run_id","snapshot_id","snapshot_content_hash","engine_release_id","engine_version",
        "source_config_digest","source_selection_digest","source_selection_kind","source_selection_part_digest","parameters_digest"] as const;
      if(result.run_id!==input.run_id || result.target_digest!==row.target_digest || keys.some(key=>result[key]!==pins[key]))
        throw new ResearchFinalAuditError("RESEARCH_FINAL_AUDIT_CONFLICT","Audit result does not answer its admitted target.",409);
      const inserted=await client.query(`INSERT INTO research.pinned_audit_receipts_v1(workspace_id,run_id,artifact_id,
        artifact_revision,manifest_digest,target_digest,result,result_digest) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8)
        ON CONFLICT(workspace_id,run_id) DO NOTHING`,[scope.workspaceId,input.run_id,input.artifact_id,input.artifact_revision,
          input.manifest_digest,row.target_digest,JSON.stringify(result),sha256ResearchJson(result)]);
      if(!inserted.rowCount){
        const prior=await client.query<{result_digest:string;manifest_digest:string}>(`SELECT result_digest,manifest_digest
          FROM research.pinned_audit_receipts_v1 WHERE workspace_id=$1 AND run_id=$2`,[scope.workspaceId,input.run_id]);
        if(prior.rows[0]?.result_digest!==sha256ResearchJson(result) || prior.rows[0]?.manifest_digest!==input.manifest_digest)
          throw new ResearchFinalAuditError("RESEARCH_FINAL_AUDIT_CONFLICT","Verified audit receipt is immutable.",409);
      }
    });
  }
  private async transaction<T>(scope:ResearchScope,readOnly:boolean,work:(client:PoolClient)=>Promise<T>):Promise<T>{
    const client=await this.pool.connect();
    try{
      await client.query(readOnly?"BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY":"BEGIN");
      await client.query(`SET LOCAL ROLE ${RESEARCH_DB_RUNTIME_ROLE}`);
      await client.query("SELECT set_config('statement_timeout',$1,true),set_config('lock_timeout',$2,true)",
        [`${RESEARCH_DB_BUDGET.statementTimeoutMs}ms`,`${RESEARCH_DB_BUDGET.lockTimeoutMs}ms`]);
      await client.query("SELECT set_config('research.workspace_id',$1,true),set_config('research.actor_user_id',$2,true)",[scope.workspaceId,scope.actorUserId]);
      const member=await client.query("SELECT 1 FROM workspace_members WHERE workspace_id=$1 AND user_id=$2",[scope.workspaceId,scope.actorUserId]);
      if(member.rowCount!==1) throw new ResearchFinalAuditError("RESEARCH_FINAL_AUDIT_FORBIDDEN","Access denied.",403);
      const result=await work(client);await client.query("COMMIT");return result;
    }catch(error){
      await client.query("ROLLBACK").catch(()=>undefined);
      if(error instanceof ResearchFinalAuditError)throw error;
      if(error instanceof ResearchUtilitySaturated)throw new ResearchFinalAuditError("RESEARCH_FINAL_AUDIT_UNAVAILABLE","Shared utility admission is saturated; retry later.",503);
      const wrapped=new ResearchFinalAuditError("RESEARCH_FINAL_AUDIT_UNAVAILABLE","Audit metadata is temporarily unavailable.",503);
      (wrapped as Error & {cause?:unknown}).cause=error;throw wrapped;
    }finally{client.release();}
  }
}
