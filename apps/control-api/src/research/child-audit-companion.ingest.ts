/** Private ingress service. Root controller supplies an authenticated live lease. */
import { Inject, Injectable } from "@nestjs/common";
import { isDeltaWfoProfile, deltaWfoCurrentSourcePair } from "./delta-wfo.profile";
import { ResearchCurrentSourceRepository } from "./current-source.repository";
import { ResearchCurrentSourceError } from "./current-source.error";
import type { ProgressIngressScope } from "./progress.repository";
import { ChildAuditCompanionBatchIngressSchema, ChildAuditCompanionSealIngressSchema,
  type ChildAuditCompanionBatchIngress, type ChildAuditCompanionSealIngress } from "./child-audit-companion.contract";
import { ResearchChildAuditCompanionRepository } from "./child-audit-companion.repository";

@Injectable()
export class ResearchChildAuditCompanionIngestService {
  constructor(@Inject(ResearchChildAuditCompanionRepository) private readonly repository: ResearchChildAuditCompanionRepository,
    @Inject(ResearchCurrentSourceRepository) private readonly source: ResearchCurrentSourceRepository) {}
  async appendBatch(lease: ProgressIngressScope, raw: ChildAuditCompanionBatchIngress) {
    const parsed = ChildAuditCompanionBatchIngressSchema.safeParse(raw);
    if (!parsed.success) this.invalid();
    const input = parsed.data;
    await this.authority(lease,input);
    const result = await this.repository.append({workspaceId:lease.workspaceId,actorUserId:lease.actorUserId},input);
    return {schema_version:"research.child-audit-companion-batch-receipt.v1",accepted:true,...result,
      batch_ordinal:input.batch_ordinal,row_count:input.rows.length};
  }
  async seal(lease: ProgressIngressScope, raw: ChildAuditCompanionSealIngress) {
    const parsed = ChildAuditCompanionSealIngressSchema.safeParse(raw);
    if (!parsed.success) this.invalid();
    const input = parsed.data;
    await this.authority(lease,input);
    const result = await this.repository.seal({workspaceId:lease.workspaceId,actorUserId:lease.actorUserId},input);
    return {schema_version:"research.child-audit-companion-seal-receipt.v1",sealed:true,...result,companion_digest:input.companion_digest};
  }
  private async authority(lease: ProgressIngressScope, input: ChildAuditCompanionBatchIngress | ChildAuditCompanionSealIngress) {
    const a = await this.source.ingestAuthority({workspaceId:lease.workspaceId,actorUserId:lease.actorUserId},input.run_id,input.artifact_id);
    const m=input.manifest, artifact=a?.artifact;
    const pair=a ? deltaWfoCurrentSourcePair(a.executionProfileId,a.executionProfileDigest) : null;
    if (input.workspace_id !== lease.workspaceId || input.job_id !== lease.jobId
      || input.worker_attempt_id !== lease.workerAttemptId || input.lease_epoch !== lease.leaseEpoch
      || !a || !isDeltaWfoProfile(a.executionProfileId,a.executionProfileDigest)
      || m.execution_profile_id !== a.executionProfileId || m.execution_profile_digest !== a.executionProfileDigest
      || m.requested_spec_digest !== a.requestedSpecDigest || m.effective_spec_digest !== a.effectiveSpecDigest
      || m.dataset_binding_digest !== a.datasetBindingDigest
      || !pair || m.source_adapter_id !== pair.source_adapter_id || m.profile_id !== pair.profile_id
      || !artifact || artifact.runId !== input.run_id || artifact.state !== "SEALED"
      || artifact.manifestDigest !== input.manifest_digest || artifact.artifactRevision !== input.artifact_revision
      || artifact.workerAttemptId !== lease.workerAttemptId || artifact.leaseEpoch !== lease.leaseEpoch)
      throw new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_CONFLICT","Audit retention requires the same admitted profile and fenced P05 seal.",409);
  }
  private invalid(): never {
    throw new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_INVALID","Invalid bounded audit companion ingress.",400);
  }
}
