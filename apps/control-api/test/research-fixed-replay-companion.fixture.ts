/** Synthetic bounded unit observations; not engine qualification evidence. */
import { createHash } from "node:crypto";
import { sha256ResearchJson } from "../src/research/preflight.service";
import { FIXED_REPLAY_SCOPE, type FixedReplayCompanionRow, type FixedReplayCompanionManifest,
  type FixedReplayCompanionSealIngress, type FixedReplayCompanionBatchIngress } from "../src/research/fixed-replay-companion.contract";
export const replayScope={workspaceId:"fixed-replay-workspace",actorUserId:"fixed-replay-user"};
export const replayLease={...replayScope,jobId:"fixed-replay-job",workerAttemptId:"fixed-replay-worker",leaseEpoch:1};
export const replayConfig={FEATURE_RESEARCH_REPLAY:"true",QUERY_CURSOR_ACTIVE_KEY_ID:"query-k1",
  QUERY_CURSOR_KEYS_JSON:'{"query-k1":"fixed-replay-test-key-at-least-32-bytes"}',QUERY_CURSOR_TTL_SECONDS:900};
export function replayRow(ordinal:number):FixedReplayCompanionRow {
  return {source_ordinal:ordinal,at_utc_ms:1_700_000_000_000+ordinal*60_000,open:"100",high:"102",low:"99",close:"101",volume:"2",
    equity:"1000",return_fraction:"0",drawdown_fraction:"0",positions:{BTCUSDT:"0.25"}};
}
export function replaySeal(rows:FixedReplayCompanionRow[],absent=false):FixedReplayCompanionSealIngress {
  const start=1_700_000_000_000,end=start+Math.max(rows.length,1)*60_000;
  const source:FixedReplayCompanionManifest["source"]=absent
    ? {schema_version:"research.fixed-replay-source.v1",state:"NOT_PUBLISHED",reason_code:"FIXED_REPLAY_SOURCE_UNAVAILABLE",oos_start_utc_ms:start,oos_end_exclusive_utc_ms:end}
    : {schema_version:"research.fixed-replay-source.v1",state:"AVAILABLE",reason_code:null,file_name:"fixed-replay.parquet",file_sha256:"f".repeat(64),byte_count:256,
      normalized_rows_sha256:sha256ResearchJson(rows),row_count:rows.length,oos_start_utc_ms:start,oos_end_exclusive_utc_ms:end,
      first_observed_utc_ms:rows[0]!.at_utc_ms,last_observed_utc_ms:rows.at(-1)!.at_utc_ms};
  const digests={requested_spec_digest:"c".repeat(64),effective_spec_digest:"d".repeat(64),dataset_binding_digest:"e".repeat(64)};
  const receipt={run_id:"fixed-replay-run",...digests,fixed_replay_source:source,
    input_scope:"P08_OPTIONAL_WARMUP_PLUS_IS_OOS_ONLY",holdout_rows_exposed_to_child:0};
  const run_receipt_json=JSON.stringify(receipt),hash=(s:string)=>createHash("sha256").update(s).digest("hex");
  const parts=Array.from({length:absent ? 0 : Math.ceil(rows.length/200)},(_,i)=>({table_kind:"fixed_replay",part_ordinal:i+1,
    relative_path:`tables/fixed_replay/part-${String(i+1).padStart(6,"0")}.parquet`,sha256:String(i%10).repeat(64),
    rows:Math.min(200,rows.length-i*200),bytes:128,sequence_min:i*200,sequence_max:Math.min(rows.length,(i+1)*200)-1}));
  const artifact={schema_version:"research.artifact-manifest.v1",workspace_id:replayScope.workspaceId,run_id:receipt.run_id,artifact_id:"fixed-replay-artifact",
    artifact_revision:1,worker_attempt_id:replayLease.workerAttemptId,lease_epoch:replayLease.leaseEpoch,
    input:{request_spec_digest:digests.requested_spec_digest,effective_spec_digest:digests.effective_spec_digest,dataset_binding_digest:digests.dataset_binding_digest},
    tables:absent ? [] : [{table_kind:"fixed_replay",schema_version:"research.fixed-replay-table.v1",rows:rows.length,parts}],
    documents:[{name:"run_receipt",relative_path:"documents/run_receipt.json",sha256:hash(run_receipt_json),bytes:Buffer.byteLength(run_receipt_json)}]};
  const artifact_manifest_json=JSON.stringify(artifact),manifest_digest=hash(artifact_manifest_json);
  const manifest:FixedReplayCompanionManifest={schema_version:"research.fixed-replay-companion-manifest.v1",workspace_id:replayScope.workspaceId,
    run_id:receipt.run_id,artifact_id:artifact.artifact_id,artifact_revision:1,manifest_digest,...digests,
    market_symbol:"BTCUSDT",
    execution_profile_id:"p04.fixed-qualification.v1",execution_profile_digest:null,source,scope:FIXED_REPLAY_SCOPE};
  return {schema_version:"research.fixed-replay-companion-seal.v1",workspace_id:manifest.workspace_id,run_id:manifest.run_id,
    job_id:replayLease.jobId,worker_attempt_id:replayLease.workerAttemptId,lease_epoch:replayLease.leaseEpoch,
    artifact_id:manifest.artifact_id,artifact_revision:1,manifest_digest,manifest,companion_digest:sha256ResearchJson(manifest),artifact_manifest_json,run_receipt_json};
}
export function replayBatch(all:FixedReplayCompanionRow[],ordinal=0):FixedReplayCompanionBatchIngress {
  const rows=all.slice(ordinal*200,ordinal*200+200);
  return {...replaySeal(all),schema_version:"research.fixed-replay-companion-batch.v1",batch_ordinal:ordinal,batch_digest:sha256ResearchJson(rows),rows};
}
export function replayAuthority(m:FixedReplayCompanionManifest) {
  return {executionProfileId:m.execution_profile_id,executionProfileDigest:m.execution_profile_digest,
    requestedSpecDigest:m.requested_spec_digest,effectiveSpecDigest:m.effective_spec_digest,datasetBindingDigest:m.dataset_binding_digest,
    artifact:{runId:m.run_id,state:"SEALED",manifestDigest:m.manifest_digest,artifactRevision:m.artifact_revision,
      workerAttemptId:replayLease.workerAttemptId,leaseEpoch:replayLease.leaseEpoch}};
}
export function replayBinding(m:FixedReplayCompanionManifest) {
  return {...m,requested_spec:{protocol:"three_window_decay",execution_route:"signal_notional",data:{symbol:"BTCUSDT"},
    windows:{oos:{start:new Date(m.source.oos_start_utc_ms).toISOString(),end_exclusive:new Date(m.source.oos_end_exclusive_utc_ms).toISOString()}}}};
}
export function replayParts(seal:FixedReplayCompanionSealIngress) {
  const table=JSON.parse(seal.artifact_manifest_json).tables.find((t:any)=>t.table_kind==="fixed_replay");
  return (table?.parts ?? []).map((p:any)=>({part_ordinal:p.part_ordinal,schema_version:"research.fixed-replay-table.v1",relative_path:p.relative_path,
    part_digest:p.sha256,row_count:p.rows,byte_count:p.bytes,sequence_min:String(p.sequence_min),sequence_max:String(p.sequence_max)}));
}
