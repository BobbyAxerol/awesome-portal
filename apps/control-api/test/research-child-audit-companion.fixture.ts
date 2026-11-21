/** Canonical synthetic unit records, never engine/source evidence. */
import { sha256ResearchJson } from "../src/research/preflight.service";
import { DELTA_WFO_PROFILE, DELTA_WFO_PROFILE_DIGEST, DELTA_WFO_PROFILE_ID } from "../src/research/delta-wfo.profile";
import type { ChildAuditCompanionBatchIngress, ChildAuditCompanionManifest, ChildAuditCompanionRow,
  ChildAuditCompanionSealIngress } from "../src/research/child-audit-companion.contract";

export const auditScope = {workspaceId:"audit-workspace",actorUserId:"audit-user"};
export const auditLease = {...auditScope,jobId:"audit-job",workerAttemptId:"audit-worker",leaseEpoch:1};
export function auditRow(ordinal:number): ChildAuditCompanionRow {
  return {audit_ordinal:ordinal,candidate_id:`candidate-${ordinal}`,fold_id:"fold_000",seed:42,
    context:"anti-leakage in-sample search",lifecycle_kind:null,policy:"strict",certified_isolation:null,
    spawned:null,reset_called:null,warmup_called:null,warmup_bars:null,closed:null,state_before:null,
    cutoff_utc_ms:null,train_start_utc_ms:null,train_end_utc_ms:null,test_start_utc_ms:null,test_end_utc_ms:null,
    strategy_fingerprint:null,market_fingerprint:null,run_fingerprint:"synthetic-unit-run"};
}
export function auditManifest(rows: ChildAuditCompanionRow[], dropped:number|null=0): ChildAuditCompanionManifest {
  return {schema_version:"research.child-audit-companion-manifest.v1",workspace_id:auditScope.workspaceId,
    run_id:"audit-run",artifact_id:"audit-artifact",artifact_revision:1,manifest_digest:"a".repeat(64),
    source_transform_digest:"b".repeat(64),requested_spec_digest:"c".repeat(64),effective_spec_digest:"d".repeat(64),
    dataset_binding_digest:"e".repeat(64),execution_profile_id:DELTA_WFO_PROFILE_ID,execution_profile_digest:DELTA_WFO_PROFILE_DIGEST,
    source_adapter_id:DELTA_WFO_PROFILE.current_source.source_adapter_id,profile_id:DELTA_WFO_PROFILE.current_source.profile_id,
    source_file_digest:"f".repeat(64),source_contract_digest:"1".repeat(64),rows_digest:sha256ResearchJson(rows),
    source_record_count:rows.length,records_dropped_by_source:dropped,source_total_count:dropped===null ? null : rows.length+dropped,
    source_run_fingerprint:rows.length ? "synthetic-unit-run" : null,policy:"strict",authority:"SOURCE_LIFECYCLE_OBSERVATIONS_NOT_GENERATION_CLOCK"};
}
export function auditSeal(rows:ChildAuditCompanionRow[]): ChildAuditCompanionSealIngress {
  const manifest=auditManifest(rows);
  return {schema_version:"research.child-audit-companion-seal.v1",workspace_id:auditScope.workspaceId,run_id:manifest.run_id,
    job_id:auditLease.jobId,worker_attempt_id:auditLease.workerAttemptId,lease_epoch:auditLease.leaseEpoch,
    artifact_id:manifest.artifact_id,artifact_revision:manifest.artifact_revision,manifest_digest:manifest.manifest_digest,
    companion_digest:sha256ResearchJson(manifest),manifest};
}
export function auditBatch(all:ChildAuditCompanionRow[],ordinal=0): ChildAuditCompanionBatchIngress {
  const rows=all.slice(ordinal*200,ordinal*200+200);
  return {...auditSeal(all),schema_version:"research.child-audit-companion-batch.v1",batch_ordinal:ordinal,batch_digest:sha256ResearchJson(rows),rows};
}
export function auditAuthority(manifest:ChildAuditCompanionManifest) {
  return {executionProfileId:manifest.execution_profile_id,executionProfileDigest:manifest.execution_profile_digest,
    requestedSpecDigest:manifest.requested_spec_digest,effectiveSpecDigest:manifest.effective_spec_digest,datasetBindingDigest:manifest.dataset_binding_digest,
    artifact:{runId:manifest.run_id,state:"SEALED",manifestDigest:manifest.manifest_digest,artifactRevision:manifest.artifact_revision,
      workerAttemptId:auditLease.workerAttemptId,leaseEpoch:auditLease.leaseEpoch}};
}
export function auditSourceRow(manifest:ChildAuditCompanionManifest) {
  return {...manifest,worker_attempt_id:auditLease.workerAttemptId,lease_epoch:auditLease.leaseEpoch,job_id:auditLease.jobId,
    summary:{replay:{child_audit:{source_record_count:manifest.source_record_count,records_dropped_by_source:manifest.records_dropped_by_source,
      policy:manifest.policy,source_run_fingerprint:manifest.source_run_fingerprint,unmatched_record_count:0}}}};
}
