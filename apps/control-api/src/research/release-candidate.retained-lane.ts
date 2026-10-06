/**
 * W7 · P21 retained (Delta WFO) lane.
 *
 * A P10 run carries exactly one execution profile. The P04 fixed
 * qualification composes its Release Candidate from the P13–P18 hubs; a
 * Delta signal-notional WFO run never had those hubs and is composed here
 * from the retained current-source facts Screens 04–09 already serve (W1–W6):
 * the RS-02 seal, its sealed FOLD rows (W5b child audit), the recomputed
 * import receipt, the sealed P05 artifact that the seal's manifest names and
 * its part digests, and the W6a report v2 sealed from the same lane.
 *
 * Every identity is compared only with its own authority:
 *  - dataset binding: run ⇄ P10 producer ⇄ retained seal ⇄ retained report;
 *  - manifest: the retained seal's manifest ⇄ the SEALED research.artifacts
 *    row at the same revision ⇄ the retained report (never the preflight
 *    manifest in run_producers, which is a different identity);
 *  - import digest: the seal ⇄ a digest recomputed from the batch receipts;
 *  - parameter digest: the retained selection's P14-rule digest ⇄ the run's
 *    hand-off cursor (both are digests of the same frozen θ*).
 * Nothing here computes, re-selects, or upgrades a claim.
 */

import { createHash } from "node:crypto";

import { foldOrdering, type FoldOrdering } from "./fold-ordering";
import {
  CurrentSourceFoldPayloadSchema,
  CurrentSourceReplaySummarySchema,
  CurrentSourceSummarySchema,
  type CurrentSourceFacts,
} from "./current-source.payload";
import type { CurrentSourceSealRow, CurrentSourceTableKind } from "./current-source.repository";
import { currentSourceReadRevisions } from "./current-source.service";
import { currentSourceExecutionPair, currentSourceRetainedMethod, isCurrentSourceExecutionProfile } from "./current-source-profile";
import { canonicalResearchJson } from "./preflight.service";
import { DEFAULT_PARAMETER_BINDING_REGISTRY } from "./parameter-binding.registry";
import { ExactJsonCalculationMemo } from "./exact-json-calculation-memo";

const DIGEST = /^[0-9a-f]{64}$/;

export interface ReleaseCandidateRetainedFold {
  sourceOrdinal: number;
  sourceId: string;
  payload: unknown;
}

export interface ReleaseCandidateRetainedSeal {
  artifactRevision: number;
  sourceAdapterId: string;
  profileId: string;
  manifestDigest: string;
  sourceTransformDigest: string;
  retainedImportDigest: string;
  requestedSpecDigest: string;
  effectiveSpecDigest: string;
  datasetBindingDigest: string;
  tableRows: Record<CurrentSourceTableKind, number>;
  totalRows: number;
  summary: unknown;
  /** Verified immutable companions from the same authorized seal snapshot. */
  enrichedAnalysis?: CurrentSourceSealRow["enrichedAnalysis"];
  analyticsSidecar?: CurrentSourceSealRow["analyticsSidecar"];
  distributionsSidecar?: CurrentSourceSealRow["distributionsSidecar"];
}

/** The retained-lane facts of one run; `null` on a ReleaseCandidateSource means the P04 lane. */
export interface ReleaseCandidateRetainedLane {
  executionProfileId: string;
  executionProfileDigest: string | null;
  producerDatasetBindingDigest: string | null;
  /** The newest RS-02 seal; null while the run's retained source is pending. */
  seal: ReleaseCandidateRetainedSeal | null;
  /** SEALED research.artifacts row at the seal's revision naming the seal's manifest. */
  sealedArtifactId: string | null;
  /** P05 part digests of that sealed artifact (bounded). */
  partDigests: string[];
  /** Digest recomputed from the retained batch receipts (never the stored seal value). */
  observedImportDigest: string | null;
  folds: ReleaseCandidateRetainedFold[];
  /** Progress snapshot: the run's claim state and hand-off cursor parameter digest. */
  claimState: string | null;
  handoffParamsDigest: string | null;
}

export interface RetainedLaneFacts {
  sealed: boolean;
  sealDigest: string | null;
  evidenceRevision: string | null;
  splitRevision: string | null;
  searchRevision: string | null;
  replayRevision: string | null;
  claims: CurrentSourceFacts["claims"] | null;
  selection: { trialId: string | null; parameters: Record<string, string> } | null;
  parameterDigest: string | null;
  parameterDigestConflict: boolean;
  replayRetained: boolean;
  ordering: FoldOrdering | null;
  foldsValid: boolean;
  laneConsistent: boolean;
  importMatch: boolean;
  partsValid: boolean;
}

function sha(value: unknown): string {
  return createHash("sha256").update(canonicalResearchJson(value), "utf8").digest("hex");
}

const retainedCalculations = new ExactJsonCalculationMemo<RetainedLaneFacts>();
export function retainedLaneFacts(lane: ReleaseCandidateRetainedLane): RetainedLaneFacts {
  return retainedCalculations.calculate(lane, () => calculateRetainedLaneFacts(lane));
}
function calculateRetainedLaneFacts(lane: ReleaseCandidateRetainedLane): RetainedLaneFacts {
  const executionPair = currentSourceExecutionPair(lane.executionProfileId,lane.executionProfileDigest);
  const method = executionPair && currentSourceRetainedMethod(executionPair.profile_id,executionPair.source_adapter_id);
  const causal = method === "CAUSAL_INNER", mode4 = method === "CAUSAL_IS_ONLY", decay = method === "PER_FOLD_DECAY";
  const seal = lane.seal;
  const summary = seal ? CurrentSourceSummarySchema.safeParse(seal.summary) : null;
  const parsed = summary?.success ? summary.data : null;
  const revisionSet = seal && parsed ? currentSourceReadRevisions(["evidence", "split", "search", "replay"],
    { ...seal, summary: seal.summary as Record<string, unknown> }) : null;
  const sealDigest = revisionSet?.sealDigest ?? null;
  const revision = (kind: string) => revisionSet?.revisions[kind] ?? null;
  const selection = parsed && (parsed.selection.trial_id !== null || parsed.optimizer_disclosure?.selection_target.kind === "SYNTHETIC_CENTROID") && Object.keys(parsed.selection.parameters).length > 0
    ? { trialId: parsed.selection.trial_id, parameters: parsed.selection.parameters }
    : null;
  const retainedDigest = selection ? sha(selection.parameters) : null;
  const handoff = lane.handoffParamsDigest;
  const parameterDigestConflict = retainedDigest !== null && handoff !== null && handoff !== retainedDigest;
  const folds = lane.folds.map((row) => ({ row, parsed: CurrentSourceFoldPayloadSchema.safeParse(row.payload) }));
  const foldsValid = seal === null || (
    folds.length === seal.tableRows.FOLD
    && folds.every(({ row, parsed: fold }) => fold.success && fold.data.fold_id === row.sourceId
      && (!causal || fold.data.causal_selection !== undefined) && (!mode4 || fold.data.mode4_selection !== undefined)
      && (!decay || fold.data.fold_selection !== undefined))
  );
  const ordering = parsed && selection && foldsValid && folds.length > 0
    ? foldOrdering(folds.map(({ row, parsed: fold }) => {
      const data = fold.success ? fold.data : null;
      return {
        sourceOrdinal: row.sourceOrdinal,
        foldId: row.sourceId,
        trainStartUtcMs: data?.train_start_utc_ms ?? null,
        trainEndUtcMs: data?.train_end_utc_ms ?? null,
        testStartUtcMs: data?.test_start_utc_ms ?? null,
        testEndUtcMs: data?.test_end_utc_ms ?? null,
        childAudit: data?.child_audit?.records,
        ...(causal ? {
          causalSelection: data?.causal_selection,
        } : {}),
        ...(decay ? { foldSelection: data?.fold_selection } : {}),
        ...(mode4 ? { mode4Selection: data?.mode4_selection } : {}),
      };
    }), parsed.source_facts, selection.parameters,
    DEFAULT_PARAMETER_BINDING_REGISTRY.byProfileDigest(lane.executionProfileDigest)?.candidateParameterKinds,
    undefined, seal?.profileId)
    : null;
  const pair = currentSourceExecutionPair(lane.executionProfileId, lane.executionProfileDigest);
  const laneConsistent = isCurrentSourceExecutionProfile(lane.executionProfileId, lane.executionProfileDigest) && (seal === null || (
    seal.sourceAdapterId === pair?.source_adapter_id
    && seal.profileId === pair?.profile_id
  ));
  return {
    sealed: seal !== null,
    sealDigest,
    evidenceRevision: revision("evidence"),
    splitRevision: revision("split"),
    searchRevision: revision("search"),
    replayRevision: revision("replay"),
    claims: parsed?.source_facts?.claims ?? null,
    selection,
    parameterDigest: parameterDigestConflict ? null : retainedDigest,
    parameterDigestConflict,
    replayRetained: parsed !== null && CurrentSourceReplaySummarySchema.safeParse(parsed.replay).success
      && seal !== null && seal.tableRows.OBSERVATION > 0,
    ordering,
    foldsValid: foldsValid && (seal === null || summary?.success === true),
    laneConsistent,
    importMatch: seal === null || (lane.observedImportDigest !== null && lane.observedImportDigest === seal.retainedImportDigest),
    partsValid: lane.partDigests.every((part) => DIGEST.test(part)),
  };
}
