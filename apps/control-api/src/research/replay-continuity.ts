/** Derivations from an authorized immutable seal, bounded to <=256 folds. */
import type { z } from "zod";
import type { CurrentSourceMethod } from "./current-source-profile";
import type { ReplayBoundaryFactSchema, ReplaySplitShapeSchema, ReplayWindowCursorSchema } from "./replay-continuity.contract";
import { ResearchCurrentSourceError } from "./current-source.error";

interface Segment {
  fold_id: string; first_ordinal: number; last_ordinal: number; bars: number;
  start_basis: "PREVIOUS_OBSERVATION" | "FIRST_WINDOW_OBSERVATION";
  end_equity: string; end_position: string; params_digest: string | null;
  selected_trial_id?: string; study_id?: string;
}
const fail = (): never => { throw new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_SEQUENCE_GAP",
  "Retained replay fold spans are inconsistent; no continuity is invented.", 503); };

export function assertReplaySegments(segments: readonly Segment[], total: number) {
  if (segments.length > 256 || new Set(segments.map(s => s.fold_id)).size !== segments.length
    || segments.some((s, i) => s.first_ordinal < 0 || s.last_ordinal >= total
      || s.last_ordinal - s.first_ordinal + 1 !== s.bars
      || i > 0 && s.first_ordinal <= segments[i - 1]!.last_ordinal)) fail();
}

export function replaySplitShape(method: CurrentSourceMethod | null, segments: readonly Segment[], total: number,
  fullSampleDisclosed: boolean): z.infer<typeof ReplaySplitShapeSchema> {
  const absent = (reason_code: string) => ({ schema_version: "research.replay-split-shape.v1" as const,
    state: "NOT_PUBLISHED" as const, reason_code, window_kind: null, oos_applicable: null, independent_holdout: null,
    ordinal_basis: "SEALED_ACCOUNT_OBSERVATION_ORDINALS" as const, windows: [] });
  assertReplaySegments(segments, total);
  if (!method) return absent("REPLAY_PROTOCOL_NOT_RECORDED");
  if (!segments.length) return absent("REPLAY_SEAL_PREDATES_FOLD_SPANS");
  const full = method === "FULL_SAMPLE";
  // Never infer train=test from a singleton segment. It must be the exact
  // immutable recipe PLUS its retained engine optimizer disclosure.
  if (full && (!fullSampleDisclosed || segments.length !== 1 || segments[0]!.first_ordinal !== 0
    || segments[0]!.bars !== total)) fail();
  return { schema_version: "research.replay-split-shape.v1", state: "AVAILABLE", reason_code: null,
    window_kind: full ? "SINGLE_FULL_WINDOW" : "FOLD_WINDOWS", oos_applicable: !full,
    independent_holdout: method === "THREE_WINDOW", ordinal_basis: "SEALED_ACCOUNT_OBSERVATION_ORDINALS",
    windows: segments.map(s => ({ fold_id: s.fold_id, window: full ? "FULL_SAMPLE" : "OOS",
      first_ordinal: s.first_ordinal, last_ordinal: s.last_ordinal, bars: s.bars })) };
}

export function replayBoundaryFacts(segments: readonly Segment[], policy: string | null,
  global: { trialId: string | null; studyId: string | null; synthetic: boolean }): z.infer<typeof ReplayBoundaryFactSchema>[] {
  const selection = (s: Segment) => {
    const trial = s.selected_trial_id ?? global.trialId, study = s.study_id ?? global.studyId;
    return { params_digest: s.params_digest, selected_trial_id: trial, study_id: study,
      selected_trial_reason_code: trial === null ? global.synthetic ? "SYNTHETIC_SELECTION_HAS_NO_TRIAL" : "RETAINED_SELECTED_TRIAL_NOT_PUBLISHED" : null,
      study_reason_code: study === null ? "RETAINED_STUDY_ID_NOT_PUBLISHED" : null };
  };
  return segments.slice(1).map((s, i) => {
    const prev = segments[i]!, missing = s.params_digest === null || prev.params_digest === null;
    const known = ["carry_position", "close_at_boundary", "reset_flat"].includes(policy ?? "");
    return { previous_fold_id: prev.fold_id, fold_id: s.fold_id, first_ordinal: s.first_ordinal,
      params_digest_changed: missing ? null : prev.params_digest !== s.params_digest,
      params_digest_reason_code: missing ? "RS02_SEAL_DID_NOT_RETAIN_SELECTED_PARAMETERS" : null,
      comparison_basis: "SEALED_SELECTED_PARAMETERS_NOT_RUNTIME_BINDING",
      previous_selection: selection(prev), selection: selection(s),
      previous_end_equity: prev.end_equity, previous_end_position: prev.end_position, start_basis: s.start_basis,
      equity_start_policy: !known ? "NOT_ASSERTED" : policy === "reset_flat" ? "RESET" : "CARRIED",
      position_start_policy: !known ? "NOT_ASSERTED" : policy === "reset_flat" ? "RESET_FLAT"
        : policy === "close_at_boundary" ? "CLOSED_AT_BOUNDARY" : "CARRIED",
      carry_policy_reason_code: known ? null : "QUANTBT_FOLD_CARRY_POLICY_NOT_PUBLISHED",
    };
  });
}

/** Page cursors retain the existing relation/revision/limit/direction binding.
 * They are passed as `cursor` / `before`, not as playhead `at` tokens. */
export function replayWindowCursor(segments: readonly Segment[], rows: readonly { sourceOrdinal: number }[],
  page: { next_cursor: string | null; prev_cursor: string | null },
  anchor?: { ordinal: number; direction: "after" | "before" }): z.infer<typeof ReplayWindowCursorSchema> {
  const owner = (n: number | undefined) => n === undefined ? null
    : segments.find(s => s.first_ordinal <= n && n <= s.last_ordinal)?.fold_id ?? null;
  const first = rows[0]?.sourceOrdinal, last = rows.at(-1)?.sourceOrdinal;
  const firstOwner = owner(first), lastOwner = owner(last);
  const known = segments.length > 0;
  // A page can start with unassigned preparation bars yet contain several
  // folds, or its incoming cursor can be in a gap before a fold. Check the
  // retained boundary ordinals, not only endpoint ownership, in both directions.
  const start = anchor?.direction === "after" ? anchor.ordinal : first;
  const end = anchor?.direction === "before" ? anchor.ordinal : last;
  const crossed = rows.length > 0 && start !== undefined && end !== undefined
    && segments.slice(1).some(s => start < s.first_ordinal && s.first_ordinal <= end);
  return { schema_version: "research.replay-window-cursor.v1", state: known ? "AVAILABLE" : "NOT_PUBLISHED",
    reason_code: known ? null : "REPLAY_SEAL_PREDATES_FOLD_SPANS", order: "SOURCE_TABLE_ORDINAL_ASC",
    crossed_fold_boundary: known ? crossed : null,
    first_fold_id: firstOwner, last_fold_id: lastOwner,
    next_fold_id: page.next_cursor && last !== undefined ? owner(last + 1) : null,
    previous_fold_id: page.prev_cursor && first !== undefined ? owner(first - 1) : null,
    next_window_cursor: page.next_cursor, previous_window_cursor: page.prev_cursor };
}
