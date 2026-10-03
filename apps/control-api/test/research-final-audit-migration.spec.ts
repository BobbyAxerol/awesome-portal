/** Real metadata/RLS/fencing on disposable PG; synthetic sources, not HMD/product proof. */
import { randomUUID } from "node:crypto";
import { afterAll,beforeAll,describe,expect,it } from "vitest";
import { Pool } from "pg";
import { migrateTestDatabase } from "./harness";
import { auditTarget,auditResult,auditProof } from "./research-final-audit.fixture";
import { ResearchFinalAuditRepository,type AdmittedAudit } from "../src/research/final-audit.repository";
import { ResearchMetadataRepository } from "../src/research/repository";
import { readPinnedAuditProofs } from "../src/research/final-audit.read";
import { pinnedAuditTargetDigest,VerifiedPinnedAuditSchema } from "../src/research/final-audit.contract";
import { sha256ResearchJson } from "../src/research/preflight.service";

const base=process.env.TEST_DATABASE_URL??"postgres://portal:portal@127.0.0.1:5432/portal_control_test";
const name="portal_pinned_audit_"+randomUUID().replaceAll("-","");
const url=(db:string)=>{const value=new URL(base);value.pathname="/"+db;return value.toString();};
const scope={workspaceId:"ws_audit",actorUserId:"usr_audit"};
const intent="audit-pg-intent-20261003",work="9".repeat(64);
describe("pinned audit real migration/admission/immutable proof",()=>{
  let db:Pool,repository:ResearchFinalAuditRepository,child:AdmittedAudit;
  beforeAll(async()=>{
    const admin=new Pool({connectionString:url("postgres")});
    try{await admin.query("CREATE DATABASE "+name);}finally{await admin.end();}
    await migrateTestDatabase(url(name));db=new Pool({connectionString:url(name)});repository=new ResearchFinalAuditRepository(db);
    // Only fixture bootstrap bypasses FK/row triggers. All tested repository
    // writes below use runtime role, RLS and real constraints/triggers.
    await db.query(`SET session_replication_role=replica;
      INSERT INTO portal_users(user_id,username,display_name,role,status,must_change_password) VALUES
        ('usr_source','audit-source','Source','ADMIN','ACTIVE',false),('usr_audit','audit-actor','Auditor','ADMIN','ACTIVE',false);
      INSERT INTO workspaces(workspace_id,name,owner_user_id) VALUES('ws_audit','Audit test','usr_source');
      INSERT INTO workspace_members(workspace_id,user_id,role) VALUES('ws_audit','usr_source','OWNER'),('ws_audit','usr_audit','MEMBER');
      INSERT INTO research.alphas(workspace_id,alpha_id,name,owner_user_id,execution_subject_id)
        VALUES('ws_audit','alpha_original','Original','usr_source','alpha_original');
      INSERT INTO research.alpha_versions(workspace_id,alpha_id,alpha_version_id,code_digest,entrypoint,dependency_ref,declared_contract,lifecycle_state,registered_by_user_id)
        VALUES('ws_audit','alpha_original','av_original',repeat('a',64),'generate_signals','quantbt-engine==1.1.1','{}','ACTIVE','usr_source');
      INSERT INTO research.execution_adapter_bindings(workspace_id,alpha_version_id,adapter_id,contract_digest,installed_by_user_id)
        VALUES('ws_audit','av_original','p04.delta-rsi.v1',$1,'usr_source');
      INSERT INTO research.attempts(workspace_id,attempt_id,alpha_version_id,client_intent_id,request_payload_digest,intent_kind,state,created_by_user_id)
        VALUES('ws_audit','att_parent','av_original','parent-intent',repeat('1',64),'NEW','READY','usr_source');
      INSERT INTO research.runs(workspace_id,run_id,attempt_id,run_kind,relationship_kind,logical_run_key,request_spec_digest,effective_spec_digest,engine_release_id,dataset_binding_digest,state,submitted_by_user_id)
        VALUES('ws_audit','rrun_parent','att_parent','PRIMARY','PRIMARY','parent',repeat('1',64),repeat('2',64),'er_quantbt_111',repeat('b',64),'READY','usr_source');
      INSERT INTO research.jobs(workspace_id,job_id,run_id,command_id,logical_work_key,work_digest,job_kind,queue_class,cost_estimate,resource_class,state,requested_by_user_id)
        VALUES('ws_audit','rjob_parent','rrun_parent','parent-cmd','parent',repeat('9',64),'PRIMARY','HEAVY','{}','p10-delta-wfo-v1','SUCCEEDED','usr_source');
      INSERT INTO research.preflight_manifests(workspace_id,preflight_token,actor_user_id,requested_spec_digest,effective_spec_digest,dataset_binding_digest,manifest_digest,
        requested_spec,effective_spec,dataset_binding,topology,resource_estimate,snapshot,expires_at)
        VALUES('ws_audit','rpft_parent','usr_source',repeat('1',64),repeat('2',64),repeat('b',64),repeat('a',64),'{}','{}','{}','{}','{}',
          jsonb_build_object('snapshot_id',$2::text,'snapshot_content_hash',repeat('d',64),'source_manifest_digest',repeat('a',64)),now()+interval '1 hour');
      INSERT INTO research.run_producers(workspace_id,run_id,attempt_id,job_id,actor_user_id,client_intent_id,intent_kind,preflight_token,alpha_id,alpha_version_id,
        execution_adapter_id,adapter_contract_digest,requested_spec_digest,effective_spec_digest,dataset_binding_digest,manifest_digest,snapshot_id,snapshot_content_hash,work_digest,legacy_request,
        execution_profile_id,execution_profile_digest)
        VALUES('ws_audit','rrun_parent','att_parent','rjob_parent','usr_source','parent-intent','NEW','rpft_parent','alpha_original','av_original','p04.delta-rsi.v1',$1,
          repeat('1',64),repeat('2',64),repeat('b',64),repeat('a',64),$2,repeat('d',64),repeat('9',64),'{"research":{"preflight_token":"rpft_parent"}}',
          'p10.delta-signal-notional-wfo.v1','b86c66fa68c41e76c6106bd06a48b5ba1281bc4b168a915ec2fa7e34ec2a6cca');
      INSERT INTO research.worker_attempts(workspace_id,worker_attempt_id,job_id,ordinal,worker_id,lease_epoch,expires_at,state)
        VALUES('ws_audit','rwrk_parent','rjob_parent',1,'fixture-parent',1,now()+interval '1 hour','SUCCEEDED');
      INSERT INTO research.artifacts(workspace_id,artifact_id,run_id,table_kind,schema_version,manifest_digest,state,retention_class,storage_locator,artifact_revision,worker_attempt_id,lease_epoch)
        VALUES('ws_audit','rart_parent','rrun_parent','research_bundle','research.artifact-manifest.v1',repeat('a',64),'SEALED','RESEARCH_EVIDENCE','artifacts/rart_parent',1,'rwrk_parent',1);
      SET session_replication_role=origin`.replaceAll("$1",`'${auditTarget.adapter_contract_digest}'`)
        .replaceAll("$2",`'${auditTarget.snapshot_id}'`));
  },120000);
  afterAll(async()=>{
    await db?.end();const admin=new Pool({connectionString:url("postgres")});
    try{await admin.query("DROP DATABASE IF EXISTS "+name+" WITH (FORCE)");}finally{await admin.end();}
  });
  it("creates one actor-bound child/outbox and preserves original preflight and seal",async()=>{
    const parent=await repository.parent(scope,auditTarget.parent_run_id);
    child=await repository.admit(scope,parent,auditTarget,intent,{research:{preflight_token:"rpft_parent"}},work);
    const replay=await repository.admit(scope,parent,auditTarget,intent,{research:{}},work);
    expect(replay).toMatchObject({runId:child.runId,jobId:child.jobId,replayed:true});
    const rows=await db.query(`SELECT r.parent_run_id,r.run_kind,r.relationship_kind,p.actor_user_id,p.preflight_token,
      old.actor_user_id AS original_actor,pf.actor_user_id AS snapshot_actor,pf.snapshot=old.snapshot AS same_snapshot,
      p.legacy_request#>>'{research,preflight_token}' AS request_token
      FROM research.runs r JOIN research.run_producers p USING(workspace_id,run_id)
      JOIN research.preflight_manifests pf ON pf.workspace_id=p.workspace_id AND pf.preflight_token=p.preflight_token
      JOIN research.preflight_manifests old ON old.workspace_id=r.workspace_id AND old.preflight_token='rpft_parent'
      WHERE r.run_id=$1`,[child.runId]);
    expect(rows.rows[0]).toEqual({parent_run_id:"rrun_parent",run_kind:"AUDIT",relationship_kind:"AUDIT_OF_SELECTION",actor_user_id:"usr_audit",
      preflight_token:replay.legacyRequest.research && (replay.legacyRequest.research as any).preflight_token,
      original_actor:"usr_source",snapshot_actor:"usr_audit",same_snapshot:true,request_token:(replay.legacyRequest.research as any).preflight_token});
    expect((await db.query("SELECT count(*)::int AS n FROM research.job_outbox WHERE job_id=$1",[child.jobId])).rows[0].n).toBe(1);
    expect((await db.query("SELECT manifest_digest FROM research.artifacts WHERE artifact_id='rart_parent'")).rows[0].manifest_digest).toBe(auditTarget.parent_manifest_digest);
    expect(await repository.latest(scope,"rrun_parent",pinnedAuditTargetDigest(auditTarget))).toMatchObject({state:"QUEUED",proof:null});
  });
  it("rejects other actor replay, changed target, and parallel child allocation without duplicate writes",async()=>{
    const parent=await repository.parent(scope,"rrun_parent");
    await expect(repository.admit({...scope,actorUserId:"usr_source"},parent,auditTarget,intent,{research:{}},work)).rejects.toMatchObject({status:409});
    await expect(repository.admit(scope,parent,{...auditTarget,snapshot_content_hash:"0".repeat(64)},intent,{research:{}},work)).rejects.toMatchObject({status:409});
    await expect(repository.admit(scope,parent,auditTarget,"another-audit-intent-0001",{research:{}},work)).rejects.toMatchObject({status:409});
    await expect(repository.parent({...scope,actorUserId:"unknown"},"rrun_parent")).rejects.toMatchObject({status:403});
    await expect(repository.parent({...scope,workspaceId:"other"},"rrun_parent")).rejects.toMatchObject({status:403});
    expect((await db.query("SELECT count(*)::int AS n FROM research.pinned_audit_targets_v1")).rows[0].n).toBe(1);
  });
  it("fences the verified seal, refuses changed source facts, and never treats the run label as proof",async()=>{
    const metadata=new ResearchMetadataRepository(db);
    const claim=await metadata.claimNextDurableJob(scope,{workerId:"audit-pg-fixture",leaseSeconds:120,jobId:child.jobId});
    expect(claim?.jobId).toBe(child.jobId);
    await metadata.recordRunProducerClaim(scope,{runId:child.runId,jobId:child.jobId,workerAttemptId:claim!.workerAttemptId,leaseEpoch:claim!.leaseEpoch});
    await db.query(`INSERT INTO research.artifacts(workspace_id,artifact_id,run_id,table_kind,schema_version,manifest_digest,state,retention_class,storage_locator,
      artifact_revision,worker_attempt_id,lease_epoch) VALUES('ws_audit','rart_audit_2',$1,'research_bundle','research.artifact-manifest.v1',repeat('f',64),
        'SEALED','RESEARCH_EVIDENCE','artifacts/rart_audit_2',1,$2,$3)`,[child.runId,claim!.workerAttemptId,claim!.leaseEpoch]);
    const input={run_id:child.runId,job_id:child.jobId,worker_attempt_id:claim!.workerAttemptId,lease_epoch:claim!.leaseEpoch,
      artifact_id:"rart_audit_2",artifact_revision:1,manifest_digest:"f".repeat(64),result:{...auditResult,run_id:child.runId}};
    await expect(repository.sealProof(scope,{...input,lease_epoch:claim!.leaseEpoch+1})).rejects.toMatchObject({status:409});
    await expect(repository.sealProof(scope,{...input,result:{...input.result,snapshot_content_hash:"0".repeat(64)}})).rejects.toMatchObject({status:409});
    await repository.sealProof(scope,input);await repository.sealProof(scope,input);
    expect((await repository.latest(scope,"rrun_parent",pinnedAuditTargetDigest(auditTarget)))?.proof).toBeNull();
    await db.query("SET session_replication_role=replica; UPDATE research.runs SET state='READY' WHERE run_kind='AUDIT'; SET session_replication_role=origin");
    const latest=await repository.latest(scope,"rrun_parent",pinnedAuditTargetDigest(auditTarget));
    expect(latest?.proof?.result).toEqual(input.result);VerifiedPinnedAuditSchema.parse(latest!.proof);
    await expect(db.query("UPDATE research.pinned_audit_receipts_v1 SET result_digest=repeat('0',64)")).rejects.toMatchObject({code:"55000"});
    const client=await db.connect();
    try{
      await client.query("BEGIN; SET LOCAL ROLE portal_research_runtime");
      await client.query("SELECT set_config('research.workspace_id',$1,true),set_config('research.actor_user_id',$2,true)",["other",scope.actorUserId]);
      expect((await readPinnedAuditProofs(client,"other",[child.runId])).size).toBe(0);
      await client.query("ROLLBACK");
    }finally{client.release();}
    expect((await db.query("SELECT count(*)::int AS n FROM research.pinned_audit_receipts_v1")).rows[0].n).toBe(1);
  });
  it("P22 accepts only the exact frozen verified child while retaining parent promotion identity",async()=>{
    const proof=(await repository.latest(scope,"rrun_parent",pinnedAuditTargetDigest(auditTarget)))!.proof!;
    async function sealedPack(suffix:string,receipt:unknown){
      const rcId=`rc_${suffix.repeat(26)}`,draftId=`rcd_${"1".repeat(26)}`;
      const core={fields:[{key:"final_audit_run_id",value:child.runId,availability:{state:"AVAILABLE"}}],
        pack:[{key:"FINAL_AUDIT_REPLAY",status:"COMPLETE",availability:{state:"AVAILABLE"}}],
        ...(receipt?{linked_final_audit:receipt}:{})};
      await db.query(`INSERT INTO research.release_candidates(workspace_id,release_candidate_id,run_id,final_audit_run_id,manifest_digest,schema_version,lifecycle_state)
        VALUES('ws_audit',$1,'rrun_parent',$2,$3,'research.release-candidate-pack.v1','SEALED')`,[rcId,child.runId,sha256ResearchJson(core)]);
      await db.query(`INSERT INTO research.release_candidate_drafts_v1(workspace_id,run_id,actor_user_id,draft_id,source_fingerprint,known_limitations,proposed_use_restrictions)
        VALUES('ws_audit','rrun_parent','usr_audit',$1,repeat('8',64),'Synthetic PG metadata test','No product proof')
        ON CONFLICT(workspace_id,run_id,actor_user_id) DO NOTHING`,[draftId]);
      await db.query(`INSERT INTO research.release_candidate_packs_v1(workspace_id,release_candidate_id,run_id,draft_id,pack_digest,source_fingerprint,schema_version,frozen_core,sealed_by_user_id)
        VALUES('ws_audit',$1,'rrun_parent',$2,$3,$5,'research.release-candidate-pack.v1',$4::jsonb,'usr_audit')`,
        [rcId,draftId,sha256ResearchJson(core),JSON.stringify(core),suffix.repeat(64)]);
      return (await db.query("SELECT research.p22_final_audit_source_eligible('ws_audit',$1,'rrun_parent') AS ok",[rcId])).rows[0].ok;
    }
    expect(await sealedPack("1",proof)).toBe(true);
    expect(await sealedPack("2",{...proof,result_digest:"0".repeat(64)})).toBe(false);
    expect(await sealedPack("3",null)).toBe(false);
    expect((await db.query("SELECT research.p22_final_audit_source_eligible('ws_audit',$1,$2) AS ok",[`rc_${"1".repeat(26)}`,child.runId])).rows[0].ok).toBe(false);
  });
  it("shares real actor/workspace utility capacity with diagnostic work before allocating anything",async()=>{
    async function diagnostic(id:string,actor:string){
      await db.query(`INSERT INTO research.jobs(workspace_id,job_id,run_id,command_id,logical_work_key,work_digest,
        job_kind,queue_class,cost_estimate,resource_class,state,requested_by_user_id)
        VALUES('ws_audit',$1,'rrun_parent',$1,$1,repeat('9',64),'DIAGNOSTIC','BACKGROUND','{}','synthetic-capacity-test','QUEUED',$2)`,[id,actor]);
    }
    const parent=await repository.parent(scope,"rrun_parent");
    // The admitted audit still owns one active lease in this fixture. A
    // diagnostic by the same actor consumes their second shared utility slot.
    await diagnostic("rjob_actor_capacity","usr_audit");
    await expect(repository.admit(scope,parent,auditTarget,"actor-capacity-intent-0001",{research:{}},work))
      .rejects.toMatchObject({status:503,code:"RESEARCH_FINAL_AUDIT_UNAVAILABLE"});
    await db.query("UPDATE research.jobs SET state='CANCELLED' WHERE job_id='rjob_actor_capacity'");
    for(let n=1;n<=3;n++)await diagnostic(`rjob_workspace_capacity_${n}`,"usr_source");
    await expect(repository.admit(scope,parent,auditTarget,"workspace-capacity-intent-0001",{research:{}},work))
      .rejects.toMatchObject({status:503,code:"RESEARCH_FINAL_AUDIT_UNAVAILABLE"});
    expect((await db.query("SELECT count(*)::int AS n FROM research.pinned_audit_targets_v1")).rows[0].n).toBe(1);
    expect((await db.query("SELECT count(*)::int AS n FROM research.pinned_audit_receipts_v1")).rows[0].n).toBe(1);
  });
});
