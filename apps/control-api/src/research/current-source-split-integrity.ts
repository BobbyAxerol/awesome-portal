/**
 * E14 · Screen 05 (HiFi audit rows 5.11, 5.12) — the boundary-integrity gap
 * scan and the stitched OOS provenance of a retained Delta WFO run, from the
 * sealed W5b replay ledger and the retained fold plan, and nothing else.
 *
 * What the seal holds, and therefore what this module may publish:
 *
 *  - `summary.replay.fold_capital.boundary_events` is QuantBT's own
 *    `account_execution_plan.boundary_events`, kept verbatim by the exporter:
 *    one row per crossing from a fold's test window into the next, with the
 *    bars between them (`gap_bars`) and the carry policy. That is the gap
 *    scan. It is a scan of the fold boundaries, not a missing-bar census of
 *    each window: the retained lane publishes no per-window coverage scan, so
 *    none is invented here.
 *  - `summary.replay.fold_segments` is the stitch plan: one segment per fold,
 *    each naming the observation range of that fold's test window in the one
 *    stitched account. QuantBT publishes no digest of the stitched series, so
 *    the digest here is the portal's own sha256 over that plan, and its basis
 *    says exactly that. A reader re-derives it from the same seal; it is
 *    never offered as an engine artifact digest.
 *  - The HiFi's "verified against fold boundaries" is run over retained
 *    values only (`checkAgainstFoldPlan`). Nothing is repaired: a plan that
 *    does not line up is published as MISMATCH with the first failure's code.
 *
 * A seal seal-ed before W5b has no replay ledger at all; both blocks are then
 * a typed absence with that reason, never a zero.
 */

import type { CurrentSourceReplaySummary } from "./current-source.payload";
import { sha256ResearchJson } from "./preflight.service";

export const SPLIT_INTEGRITY_REASONS = {
  /** The seal predates the W5b bar ledger, so it holds no replay summary. */
  sealPredatesReplay: "RS02_SEAL_PREDATES_W5B_REPLAY_LEDGER_V1",
  /** The ledger is there, but QuantBT's execution plan published no boundary event. */
  noBoundaryEvents: "QUANTBT_ACCOUNT_EXECUTION_PLAN_PUBLISHED_NO_BOUNDARY_EVENT",
  /** The ledger is there, but no fold segment was retained. */
  noFoldSegments: "RS02_REPLAY_LEDGER_RETAINED_NO_FOLD_SEGMENT",
  /** One fold plan crossing has no boundary event, so a single-window run has nothing to scan. */
  noCrossing: "RETAINED_FOLD_PLAN_HAS_NO_OUTER_FOLD_CROSSING",
} as const;

export const STITCH_CHECK_REASONS = {
  unknownFold: "RETAINED_STITCH_SEGMENT_NAMES_A_FOLD_THE_PLAN_DOES_NOT_HAVE",
  foldCountDiffers: "RETAINED_STITCH_SEGMENTS_DO_NOT_COVER_EVERY_RETAINED_FOLD_ONCE",
  outOfOrder: "RETAINED_STITCH_SEGMENTS_ARE_NOT_IN_RETAINED_FOLD_PLAN_ORDER",
  overlapping: "RETAINED_STITCH_SEGMENT_OBSERVATION_RANGES_OVERLAP",
  barsDisagree: "RETAINED_STITCH_SEGMENT_BAR_COUNT_DISAGREES_WITH_ITS_OBSERVATION_RANGE",
} as const;

export const STITCH_DIGEST_BASIS = "PORTAL_DIGEST_OF_RETAINED_FOLD_SEGMENTS_V1" as const;
export const GAP_SCAN_BASIS = "QUANTBT_ACCOUNT_EXECUTION_PLAN_BOUNDARY_EVENTS_V1" as const;

type Availability = { state: "AVAILABLE" | "NOT_PUBLISHED"; reason_code: string | null };

function available(): Availability {
  return { state: "AVAILABLE", reason_code: null };
}

function withheld(reasonCode: string): Availability {
  return { state: "NOT_PUBLISHED", reason_code: reasonCode };
}

export interface RetainedFoldWindow {
  fold_id: string;
  test_start_utc_ms: number | null;
  test_end_utc_ms: number | null;
}

export interface SplitGapScan {
  state: "AVAILABLE" | "NOT_PUBLISHED";
  reason_code: string | null;
  basis: typeof GAP_SCAN_BASIS | "NOT_PUBLISHED";
  scope: "OUTER_FOLD_TEST_WINDOW_BOUNDARIES" | "NOT_PUBLISHED";
  boundary_count: number | null;
  expected_boundary_count: number | null;
  measured_count: number | null;
  contiguous_count: number | null;
  max_gap_bars: number | null;
  boundaries: Array<{
    previous_fold_id: string | null;
    fold_id: string | null;
    boundary_utc_ms: number | null;
    next_test_start_utc_ms: number | null;
    gap_bars: number | null;
    policy: string | null;
  }>;
  availability: Availability;
}

export interface SplitStitch {
  state: "AVAILABLE" | "NOT_PUBLISHED";
  reason_code: string | null;
  basis: typeof STITCH_DIGEST_BASIS | "NOT_PUBLISHED";
  digest: string | null;
  segment_count: number | null;
  observation_count: number | null;
  boundary_check: "MATCH" | "MISMATCH" | "NOT_CHECKABLE";
  boundary_check_reason_code: string | null;
  availability: Availability;
}

function absentGapScan(reasonCode: string, expected: number | null): SplitGapScan {
  return {
    state: "NOT_PUBLISHED",
    reason_code: reasonCode,
    basis: "NOT_PUBLISHED",
    scope: "NOT_PUBLISHED",
    boundary_count: null,
    expected_boundary_count: expected,
    measured_count: null,
    contiguous_count: null,
    max_gap_bars: null,
    boundaries: [],
    availability: withheld(reasonCode),
  };
}

function absentStitch(reasonCode: string): SplitStitch {
  return {
    state: "NOT_PUBLISHED",
    reason_code: reasonCode,
    basis: "NOT_PUBLISHED",
    digest: null,
    segment_count: null,
    observation_count: null,
    boundary_check: "NOT_CHECKABLE",
    boundary_check_reason_code: reasonCode,
    availability: withheld(reasonCode),
  };
}

/**
 * 5.11 — QuantBT's boundary events, as served. `expected_boundary_count` is
 * the retained fold plan's own crossing count, so a scan that covered fewer
 * than every crossing says so instead of reading as complete.
 */
export function splitGapScan(
  replay: CurrentSourceReplaySummary | undefined,
  folds: readonly RetainedFoldWindow[],
): SplitGapScan {
  const expected = folds.length > 0 ? Math.max(0, folds.length - 1) : null;
  if (!replay) return absentGapScan(SPLIT_INTEGRITY_REASONS.sealPredatesReplay, expected);
  const events = replay.fold_capital.boundary_events;
  if (events.length === 0) {
    return absentGapScan(
      expected === 0 ? SPLIT_INTEGRITY_REASONS.noCrossing : SPLIT_INTEGRITY_REASONS.noBoundaryEvents,
      expected,
    );
  }
  const measured = events
    .map((event) => event.gap_bars)
    .filter((bars): bars is number => bars !== null);
  return {
    state: "AVAILABLE",
    reason_code: null,
    basis: GAP_SCAN_BASIS,
    scope: "OUTER_FOLD_TEST_WINDOW_BOUNDARIES",
    boundary_count: events.length,
    expected_boundary_count: expected,
    measured_count: measured.length,
    contiguous_count: measured.filter((bars) => bars === 0).length,
    max_gap_bars: measured.length > 0 ? Math.max(...measured) : null,
    boundaries: events.map((event) => ({
      previous_fold_id: event.previous_fold_id,
      fold_id: event.fold_id,
      boundary_utc_ms: event.boundary_utc_ms,
      next_test_start_utc_ms: event.next_test_start_utc_ms,
      gap_bars: event.gap_bars,
      policy: event.policy,
    })),
    availability: available(),
  };
}

/**
 * The HiFi's "verified against fold boundaries", over retained values only:
 * every segment names a fold of the retained plan, each fold has exactly one
 * segment, the segments ascend in fold-plan order with disjoint observation
 * ranges, and each segment's bar count equals the length of its own range.
 */
export function checkAgainstFoldPlan(
  segments: CurrentSourceReplaySummary["fold_segments"],
  folds: readonly RetainedFoldWindow[],
): string | null {
  const order = new Map(folds.map((fold, index) => [fold.fold_id, index]));
  let previousIndex = -1;
  let previousLast = -1;
  for (const segment of segments) {
    const index = order.get(segment.fold_id);
    if (index === undefined) return STITCH_CHECK_REASONS.unknownFold;
    if (index <= previousIndex) return STITCH_CHECK_REASONS.outOfOrder;
    if (segment.first_ordinal <= previousLast) return STITCH_CHECK_REASONS.overlapping;
    if (segment.last_ordinal < segment.first_ordinal) return STITCH_CHECK_REASONS.overlapping;
    if (segment.bars !== segment.last_ordinal - segment.first_ordinal + 1) return STITCH_CHECK_REASONS.barsDisagree;
    previousIndex = index;
    previousLast = segment.last_ordinal;
  }
  if (segments.length !== folds.length) return STITCH_CHECK_REASONS.foldCountDiffers;
  return null;
}

/**
 * 5.12 — the stitch plan's digest and its check. The digest is taken over the
 * retained segments and the retained test windows they claim, in fold-plan
 * order, so it changes when either side of the stitch changes.
 */
export function splitStitch(
  replay: CurrentSourceReplaySummary | undefined,
  folds: readonly RetainedFoldWindow[],
): SplitStitch {
  if (!replay) return absentStitch(SPLIT_INTEGRITY_REASONS.sealPredatesReplay);
  const segments = replay.fold_segments;
  if (segments.length === 0) return absentStitch(SPLIT_INTEGRITY_REASONS.noFoldSegments);
  const windows = new Map(folds.map((fold) => [fold.fold_id, fold]));
  const mismatch = checkAgainstFoldPlan(segments, folds);
  const digest = sha256ResearchJson({
    basis: STITCH_DIGEST_BASIS,
    segments: segments.map((segment) => ({
      fold_id: segment.fold_id,
      first_ordinal: segment.first_ordinal,
      last_ordinal: segment.last_ordinal,
      bars: segment.bars,
      start_basis: segment.start_basis,
      start_equity: segment.start_equity,
      end_equity: segment.end_equity,
      test_start_utc_ms: windows.get(segment.fold_id)?.test_start_utc_ms ?? null,
      test_end_utc_ms: windows.get(segment.fold_id)?.test_end_utc_ms ?? null,
    })),
  });
  return {
    state: "AVAILABLE",
    reason_code: null,
    basis: STITCH_DIGEST_BASIS,
    digest,
    segment_count: segments.length,
    observation_count: segments.reduce((total, segment) => total + segment.bars, 0),
    boundary_check: mismatch === null ? "MATCH" : "MISMATCH",
    boundary_check_reason_code: mismatch,
    availability: available(),
  };
}
