/** Pure publication of existing bound metadata, never a source scan or replay calculation. */
import type { ResearchEnrichedAnalysis } from "./enriched-analysis.contract";
import { ResearchRequestedSpecSchema } from "./preflight.contract";
import { sha256ResearchJson } from "./preflight.service";
import type { ReplayIdentity, ReplayWindowDisclosure } from "./replay-navigation.contract";
import type { WindowExecutionManifest } from "./window-execution.contract";

const PRESENTATION = "research.replay-navigation.v1" as const;
const absent = (reason_code: string) => ({ state: "NOT_PUBLISHED" as const, reason_code });
const available = { state: "AVAILABLE" as const, reason_code: null };
type WindowKind = "IS" | "OOS" | "HOLDOUT";
export interface ReplayRetainedFold {
  fold_id: string;
  train_start_utc_ms: number | null; train_end_utc_ms: number | null;
  test_start_utc_ms: number | null; test_end_utc_ms: number | null;
  fold_facts?: { train_bars: number | null; test_bars: number | null };
}
export function replayAbsentIdentity(reason = "REPLAY_ALPHA_BINDING_NOT_PUBLISHED",
  basis: ReplayIdentity["basis"] = "IMMUTABLE_REQUEST_ALPHA_BINDING"): ReplayIdentity {
  return { alpha_id: null, alpha_version_id: null, basis, availability: absent(reason) };
}
export function replayBoundIdentity(binding: {
  alpha_id: string | null; alpha_version_id: string | null;
  availability: { state: string; reason_code: string | null };
} | undefined): ReplayIdentity {
  if (binding?.availability.state === "AVAILABLE" && binding.alpha_id && binding.alpha_version_id) {
    return { alpha_id: binding.alpha_id, alpha_version_id: binding.alpha_version_id,
      basis: "HUB_BOUND_ALPHA_IDENTITY", availability: available };
  }
  const value = replayAbsentIdentity(binding?.availability.reason_code ?? "REPLAY_ALPHA_BINDING_NOT_PUBLISHED", "HUB_BOUND_ALPHA_IDENTITY");
  return binding?.availability.state === "NOT_APPLICABLE"
    ? { ...value, availability: { state: "NOT_APPLICABLE", reason_code: value.availability.reason_code } } : value;
}
export function replayRequestedIdentity(raw: unknown, expectedDigest: string): ReplayIdentity {
  if (!raw || sha256ResearchJson(raw) !== expectedDigest) return replayAbsentIdentity("REPLAY_ADMITTED_REQUEST_DIGEST_MISMATCH_OR_ABSENT");
  const parsed = ResearchRequestedSpecSchema.safeParse(raw);
  if (!parsed.success) return replayAbsentIdentity("REPLAY_ADMITTED_REQUEST_INCOMPATIBLE");
  if (!parsed.data.alpha_binding) return { ...replayAbsentIdentity(), availability: {
    state: "NOT_APPLICABLE", reason_code: "REPLAY_SCRATCH_RUN_HAS_NO_ALPHA_BINDING" } };
  return { ...parsed.data.alpha_binding, basis: "IMMUTABLE_REQUEST_ALPHA_BINDING", availability: available };
}
function noWindow(window: WindowKind, reason: string): ReplayWindowDisclosure {
  return { window, start_utc_ms: null, end_utc_ms: null, bars: null, bounds_semantics: null,
    count_basis: null, segments: [], basis: "BOUND_WINDOW_METADATA", availability: absent(reason) };
}
function declaredWindow(window: WindowKind, analysis: ResearchEnrichedAnalysis | undefined): ReplayWindowDisclosure {
  const key = window.toLowerCase() as "is" | "oos" | "holdout";
  const head = analysis?.windows[key];
  const value = noWindow(window, window === "HOLDOUT" ? "REPLAY_HOLDOUT_NOT_EXPOSED" : "REPLAY_SEAL_PREDATES_WINDOW_METADATA");
  if (!head || head.start_ms === undefined || head.end_ms === undefined
    || head.bounds_semantics !== "START_INCLUSIVE_END_EXCLUSIVE") return value;
  // These are declaration bounds even when the separate IS analytics payload is absent.
  const bars = window === "HOLDOUT" ? null : window === "IS"
    ? analysis?.by_window?.is.scope.observation_count ?? null
    : analysis?.scope.coverage === "FULL_RETAINED_OOS" ? analysis.scope.observation_count : null;
  return { ...value, start_utc_ms: head.start_ms, end_utc_ms: head.end_ms,
    bounds_semantics: "START_INCLUSIVE_END_EXCLUSIVE", bars,
    count_basis: bars === null ? null : "FULL_SOURCE_WINDOW_OBSERVATIONS",
    basis: window === "IS" ? "DECLARED_IS_WINDOW" : window === "OOS" ? "DECLARED_OOS_WINDOW" : "DECLARED_HOLDOUT_WINDOW",
    availability: bars !== null ? available : absent(window === "HOLDOUT" ? "REPLAY_HOLDOUT_NOT_EXPOSED" : "REPLAY_WINDOW_FULL_SOURCE_BAR_COUNT_NOT_PUBLISHED") };
}
function foldWindow(window: "IS" | "OOS", folds: readonly ReplayRetainedFold[]): ReplayWindowDisclosure {
  const value: ReplayWindowDisclosure = { ...noWindow(window, "REPLAY_RETAINED_FOLD_WINDOW_NOT_PUBLISHED"),
    basis: window === "IS" ? "RETAINED_FOLD_TRAIN_WINDOWS" : "RETAINED_FOLD_TEST_WINDOWS" };
  if (folds.length === 0 || folds.length > 256) return value;
  const segments = folds.map(fold => ({ fold_id: fold.fold_id,
    start_utc_ms: window === "IS" ? fold.train_start_utc_ms : fold.test_start_utc_ms,
    end_utc_ms: window === "IS" ? fold.train_end_utc_ms : fold.test_end_utc_ms,
    bars: window === "IS" ? fold.fold_facts?.train_bars ?? null : fold.fold_facts?.test_bars ?? null }));
  if (segments.some(row => row.start_utc_ms === null || row.end_utc_ms === null || row.start_utc_ms > row.end_utc_ms)) return value;
  const exact = segments.map(row => ({ ...row, start_utc_ms: row.start_utc_ms!, end_utc_ms: row.end_utc_ms! }));
  const bars = exact.every(row => row.bars !== null) ? exact.reduce((sum, row) => sum + row.bars!, 0) : null;
  return { ...value, start_utc_ms: Math.min(...exact.map(row => row.start_utc_ms)),
    end_utc_ms: Math.max(...exact.map(row => row.end_utc_ms)), bars,
    bounds_semantics: "SOURCE_RETAINED_FOLD_BOUNDS", count_basis: bars === null ? null : "SUM_OF_FOLD_WINDOWS_MAY_OVERLAP",
    segments: exact,
    availability: bars !== null ? available : absent("REPLAY_RETAINED_FOLD_BAR_COUNTS_NOT_PUBLISHED") };
}
export function replayNavigation(identity: ReplayIdentity, analysis?: ResearchEnrichedAnalysis, folds?: readonly ReplayRetainedFold[],
  completedCustody?: WindowExecutionManifest["source"], fullSample = false) {
  const facts = { identity,
    is_window: folds ? foldWindow("IS", folds) : declaredWindow("IS", analysis),
    oos_window: folds ? foldWindow("OOS", folds) : declaredWindow("OOS", analysis),
    holdout_window: folds ? noWindow("HOLDOUT", "REPLAY_HOLDOUT_NOT_EXPOSED") : declaredWindow("HOLDOUT", analysis) };
  // Only the completed-run repository may supply this verified P05 companion.
  // Source counts/curves never grant execution access before completion.
  if (fullSample) {
    // Mode5 trains/selects on the same full sample. The separately served
    // split_shape owns that span; old selectors must not call it held-out OOS.
    for (const [key, role] of [["is_window", "IS"], ["oos_window", "OOS"], ["holdout_window", "HOLDOUT"]] as const) {
      facts[key] = { ...noWindow(role, "FULL_SAMPLE_CALIBRATION_HAS_NO_INDEPENDENT_SPLIT_WINDOW"),
        availability: { state: "NOT_APPLICABLE", reason_code: "FULL_SAMPLE_CALIBRATION_HAS_NO_INDEPENDENT_SPLIT_WINDOW" } };
    }
  } else if(completedCustody?.protocol === "three_window_decay") {
    for(const role of ["IS","OOS","HOLDOUT"] as const) {
      const d=completedCustody.windows.find(w=>w.window===role&&w.fold_id===null);
      if(d?.availability.state!=="AVAILABLE")continue;
      const key=role==="IS"?"is_window":role==="OOS"?"oos_window":"holdout_window";
      facts[key]={window:role,start_utc_ms:d.start_utc_ms,end_utc_ms:d.end_exclusive_utc_ms,bars:d.observation_count,
        bounds_semantics:"START_INCLUSIVE_END_EXCLUSIVE",count_basis:"FULL_SOURCE_WINDOW_OBSERVATIONS",segments:[],
        basis:role==="IS"?"DECLARED_IS_WINDOW":role==="OOS"?"DECLARED_OOS_WINDOW":"DECLARED_HOLDOUT_WINDOW",availability:available,
        ...(role==="HOLDOUT"?{access_basis:"COMPLETED_THREE_WINDOW_RETAINED_ACCOUNT" as const}:{})};
    }
  } else if(completedCustody?.protocol === "advanced_walk_forward") {
    facts.holdout_window={...noWindow("HOLDOUT","WFO_PROTOCOL_HAS_NO_INDEPENDENT_HOLDOUT"),
      availability:{state:"NOT_APPLICABLE",reason_code:"WFO_PROTOCOL_HAS_NO_INDEPENDENT_HOLDOUT"}};
  }
  return { ...facts, presentation_revision: PRESENTATION,
    presentation_digest: sha256ResearchJson({ presentation_revision: PRESENTATION, ...facts }) };
}
