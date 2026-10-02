/** Private authenticated lease ingress; the repository rechecks under locks. */
import { Inject, Injectable } from "@nestjs/common";
import { ResearchCurrentSourceRepository } from "./current-source.repository";
import { ResearchCurrentSourceError } from "./current-source.error";
import type { ProgressIngressScope } from "./progress.repository";
import { FixedReplayCompanionBatchIngressSchema, FixedReplayCompanionSealIngressSchema, isFixedReplayProfile,
  type FixedReplayCompanionBatchIngress, type FixedReplayCompanionSealIngress } from "./fixed-replay-companion.contract";
import { ResearchFixedReplayCompanionRepository } from "./fixed-replay-companion.repository";

@Injectable()
export class ResearchFixedReplayCompanionIngestService {
  constructor(@Inject(ResearchFixedReplayCompanionRepository) private readonly repository:ResearchFixedReplayCompanionRepository,
    @Inject(ResearchCurrentSourceRepository) private readonly source:ResearchCurrentSourceRepository) {}
  async appendBatch(lease:ProgressIngressScope,raw:FixedReplayCompanionBatchIngress) {
    const parsed=FixedReplayCompanionBatchIngressSchema.safeParse(raw);
    if(!parsed.success) this.invalid();
    const input=parsed.data;
    await this.authority(lease,input);
    const result=await this.repository.append({workspaceId:lease.workspaceId,actorUserId:lease.actorUserId},input);
    return {schema_version:"research.fixed-replay-companion-batch-receipt.v1",state:result.replayed ? "REPLAYED" : "ACCEPTED",
      batch_ordinal:input.batch_ordinal,row_count:input.rows.length};
  }
  async seal(lease:ProgressIngressScope,raw:FixedReplayCompanionSealIngress) {
    const parsed=FixedReplayCompanionSealIngressSchema.safeParse(raw);
    if(!parsed.success) this.invalid();
    const input=parsed.data;
    await this.authority(lease,input);
    const result=await this.repository.seal({workspaceId:lease.workspaceId,actorUserId:lease.actorUserId},input);
    return {schema_version:"research.fixed-replay-companion-seal-receipt.v1",state:result.replayed ? "REPLAYED" : "SEALED",
      companion_digest:input.companion_digest};
  }
  private async authority(lease:ProgressIngressScope,input:FixedReplayCompanionBatchIngress|FixedReplayCompanionSealIngress) {
    if(input.workspace_id!==lease.workspaceId || input.job_id!==lease.jobId
      || input.worker_attempt_id!==lease.workerAttemptId || input.lease_epoch!==lease.leaseEpoch) this.conflict();
    const source=await this.source.ingestAuthority({workspaceId:lease.workspaceId,actorUserId:lease.actorUserId},input.run_id,input.artifact_id);
    const m=input.manifest,a=source?.artifact;
    if(!source || !isFixedReplayProfile(source.executionProfileId,source.executionProfileDigest)
      || m.execution_profile_id!==source.executionProfileId || m.execution_profile_digest!==source.executionProfileDigest
      || m.requested_spec_digest!==source.requestedSpecDigest || m.effective_spec_digest!==source.effectiveSpecDigest
      || m.dataset_binding_digest!==source.datasetBindingDigest || !a || a.runId!==input.run_id || a.state!=="SEALED"
      || a.manifestDigest!==input.manifest_digest || a.artifactRevision!==input.artifact_revision
      || a.workerAttemptId!==lease.workerAttemptId || a.leaseEpoch!==lease.leaseEpoch) this.conflict();
  }
  private conflict():never {throw new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_CONFLICT","Replay custody requires the exact admitted profile and fenced P05 seal.",409);}
  private invalid():never {throw new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_INVALID","Invalid bounded fixed replay ingress.",400);}
}
