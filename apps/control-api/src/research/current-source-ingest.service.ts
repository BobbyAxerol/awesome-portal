/**
 * W1 row H: private RS-02 current-source ingest for the Delta WFO profile.
 *
 * The worker has already sealed its P05 artifact under the live lease. This
 * service admits finite row batches and one final seal into Portal-owned
 * retention, and only for a run whose immutable P10 execution profile is the
 * locked Delta signal-notional WFO profile. Requested/effective/dataset
 * digests are copied from `run_producers`, never from the worker body.
 */

import { Injectable } from "@nestjs/common";

import type {
  ResearchCurrentSourceBatchIngress,
  ResearchCurrentSourceSealIngress,
} from "./artifact-ingress.contract";
import { ResearchCurrentSourceError } from "./current-source.error";
import {
  CurrentSourceSummarySchema,
  currentSourceRowMatchesKind,
} from "./current-source.payload";
import {
  ResearchCurrentSourceRepository,
  type CurrentSourceIngestAuthority,
  type CurrentSourceLanePair,
} from "./current-source.repository";
import { DELTA_WFO_PROFILE, deltaWfoCurrentSourcePair, isDeltaWfoProfile } from "./delta-wfo.profile";
import { DELTA_CAUSAL_INNER_PROFILE, DELTA_CAUSAL_INNER_PROFILE_ID } from "./delta-causal-inner.profile";
import type { ProgressIngressScope } from "./progress.repository";

export interface CurrentSourceBatchReceipt {
  schema_version: "research.current-source-batch-receipt.v1";
  accepted: true;
  replayed: boolean;
  table_kind: ResearchCurrentSourceBatchIngress["table_kind"];
  batch_ordinal: number;
  row_count: number;
}

export interface CurrentSourceSealReceipt {
  schema_version: "research.current-source-seal-receipt.v1";
  sealed: true;
  replayed: boolean;
  artifact_revision: number;
  retained_import_digest: string;
}

@Injectable()
export class ResearchCurrentSourceIngestService {
  constructor(private readonly repository: ResearchCurrentSourceRepository) {}

  async appendBatch(lease: ProgressIngressScope, input: ResearchCurrentSourceBatchIngress): Promise<CurrentSourceBatchReceipt> {
    const scope = { workspaceId: lease.workspaceId, actorUserId: lease.actorUserId };
    const authority = await this.requireAuthority(lease, input);
    for (const row of input.rows) {
      if (!currentSourceRowMatchesKind(input.table_kind, row)) {
        throw new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_INVALID", "Current-source row payload is incompatible with its table kind.", 400);
      }
      if (input.table_kind === "FOLD" && (authority.executionProfileId === DELTA_CAUSAL_INNER_PROFILE_ID
        ? row.payload.causal_selection === undefined : row.payload.causal_selection !== undefined)) {
        throw new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_INVALID", "Per-fold causal selections must match the admitted immutable execution profile.", 400);
      }
    }
    const result = await this.repository.append(scope, {
      runId: input.run_id,
      artifactRevision: input.artifact_revision,
      manifestDigest: input.manifest_digest,
      sourceTransformDigest: input.source_transform_digest,
      tableKind: input.table_kind,
      batchOrdinal: input.batch_ordinal,
      batchDigest: input.batch_digest,
      rows: input.rows.map((row) => ({
        sourceOrdinal: row.sourceOrdinal,
        sourceId: row.sourceId,
        occurredAtUtcMs: row.occurredAtUtcMs,
        payload: row.payload,
      })),
    });
    return {
      schema_version: "research.current-source-batch-receipt.v1",
      accepted: true,
      replayed: result.replayed,
      table_kind: input.table_kind,
      batch_ordinal: input.batch_ordinal,
      row_count: input.rows.length,
    };
  }

  async seal(lease: ProgressIngressScope, input: ResearchCurrentSourceSealIngress): Promise<CurrentSourceSealReceipt> {
    const scope = { workspaceId: lease.workspaceId, actorUserId: lease.actorUserId };
    const authority = await this.requireAuthority(lease, input);
    const pair = deltaWfoCurrentSourcePair(authority.executionProfileId, authority.executionProfileDigest);
    if (!pair || input.source_adapter_id !== pair.source_adapter_id || input.profile_id !== pair.profile_id) {
      throw new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_INVALID", "Current-source seal names a lane pair outside the run execution profile.", 400);
    }
    const lane: CurrentSourceLanePair = pair.profile_id === DELTA_CAUSAL_INNER_PROFILE.current_source.profile_id
      ? { sourceAdapterId: DELTA_CAUSAL_INNER_PROFILE.current_source.source_adapter_id, profileId: DELTA_CAUSAL_INNER_PROFILE.current_source.profile_id }
      : { sourceAdapterId: DELTA_WFO_PROFILE.current_source.source_adapter_id, profileId: DELTA_WFO_PROFILE.current_source.profile_id };
    const summary = CurrentSourceSummarySchema.safeParse(input.summary);
    if (!summary.success) {
      throw new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_INVALID", "Current-source seal summary is incompatible.", 400);
    }
    if (authority.executionProfileId === DELTA_CAUSAL_INNER_PROFILE_ID
      && (summary.data.selection.scope !== "LAST_FOLD_DEPLOYMENT" || summary.data.selection.fold_id === undefined
        || summary.data.source_facts?.search.optimization_schedule !== "per_fold_causal")) {
      throw new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_INVALID", "Causal retention requires the actual last-fold deployment singleton and per-fold source facts.", 400);
    }
    const counts = summary.data.counts;
    if (counts && (counts.folds !== input.table_rows.FOLD || counts.trials !== input.table_rows.TRIAL
      || counts.candidates !== input.table_rows.CANDIDATE)) {
      throw new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_INVALID", "Current-source summary counts disagree with the sealed table rows.", 400);
    }
    const result = await this.repository.seal(scope, {
      runId: input.run_id,
      artifactRevision: input.artifact_revision,
      ...lane,
      manifestDigest: input.manifest_digest,
      sourceTransformDigest: input.source_transform_digest,
      // Never from the body: the run's immutable P10 producer identity.
      requestedSpecDigest: authority.requestedSpecDigest,
      effectiveSpecDigest: authority.effectiveSpecDigest,
      datasetBindingDigest: authority.datasetBindingDigest,
      tableRows: input.table_rows,
      totalRows: input.total_rows,
      summary: input.summary,
      expectedRetainedImportDigest: input.retained_import_digest,
      lease: { workerAttemptId: lease.workerAttemptId, leaseEpoch: lease.leaseEpoch },
    });
    return {
      schema_version: "research.current-source-seal-receipt.v1",
      sealed: true,
      replayed: result.replayed,
      artifact_revision: input.artifact_revision,
      retained_import_digest: result.retainedImportDigest,
    };
  }

  /**
   * Both routes require: a WFO-profile run, and the exact P05 artifact this
   * lease reserved, already SEALED under the same manifest digest/revision.
   */
  private async requireAuthority(
    lease: ProgressIngressScope,
    input: { run_id: string; artifact_id: string; artifact_revision: number; manifest_digest: string },
  ): Promise<CurrentSourceIngestAuthority> {
    const authority = await this.repository.ingestAuthority(
      { workspaceId: lease.workspaceId, actorUserId: lease.actorUserId },
      input.run_id,
      input.artifact_id,
    );
    if (!authority) {
      throw new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_NOT_FOUND", "Research run was not found.", 404);
    }
    if (!isDeltaWfoProfile(authority.executionProfileId, authority.executionProfileDigest)) {
      throw new ResearchCurrentSourceError(
        "RESEARCH_CURRENT_SOURCE_CONFLICT",
        "Only a run admitted under the Delta signal-notional WFO execution profile may retain current-source rows.",
        409,
      );
    }
    const artifact = authority.artifact;
    if (!artifact || artifact.runId !== input.run_id || artifact.state !== "SEALED"
      || artifact.manifestDigest !== input.manifest_digest
      || artifact.artifactRevision !== input.artifact_revision
      || artifact.workerAttemptId !== lease.workerAttemptId
      || artifact.leaseEpoch !== lease.leaseEpoch) {
      throw new ResearchCurrentSourceError(
        "RESEARCH_CURRENT_SOURCE_CONFLICT",
        "Current-source ingest requires this lease's sealed P05 artifact with the same manifest digest and revision.",
        409,
      );
    }
    return authority;
  }
}
