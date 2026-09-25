/**
 * S08 T17 · a synthetic 32-fold replay, derived from the published real-HMD
 * fixture (CG-P17-01), for tests and the fixture-lane browser probe only.
 *
 * Same schema as `research-current-source.replay.fold0.valid.json`: the
 * real fold-0 window (168 bars) is kept; `execution.fold_capital` is widened
 * to 32 weekly folds of 168 bars after the same 720-bar in-sample span, with
 * a carry-position boundary between each pair; the run overview is rescaled
 * to the 6,096-bar run. Equity chains fold to fold (carry position) from the
 * real fold 0/1 numbers. A fold window read by `at=<start_cursor>` answers the
 * same real bars relabelled with that fold id; the child audit for a fold is
 * the real fold-0 audit relabelled. Nothing here is a claim about a real run.
 */

import type { CurrentSourceReplay, ReplayChildAudit } from "./replayClient";

export const SYNTHETIC_FOLDS = 32;
const BARS = 168;
const IN_SAMPLE = 720;

/** A distinct, schema-valid opaque token per fold (the stub keys on it). */
export function syntheticFoldCursor(fold: number): string {
  return `kc1.query-k1.${`w5bsyntheticfold${String(fold).padStart(2, "0")}`.padEnd(32, "a")}.${"s".repeat(43)}`;
}

export function syntheticFoldOf(url: string): number | null {
  const at = new URL(url, "http://x").searchParams.get("at");
  const match = at ? /w5bsyntheticfold(\d{2})/.exec(at) : null;
  return match ? Number(match[1]) : null;
}

export function scaleToFolds(real: CurrentSourceReplay, folds = SYNTHETIC_FOLDS): CurrentSourceReplay {
  const body = structuredClone(real);
  const [first, second] = real.execution.fold_capital.segments;
  if (!first || !second) throw new Error("the real fixture has two folds");
  const step = Number(second.end_equity) - Number(first.end_equity);
  const total = IN_SAMPLE + folds * BARS;
  let equity = Number(first.start_equity);
  body.replay.source_observation_count = total;
  body.execution.fold_capital.segments = Array.from({ length: folds }, (_, fold) => {
    const start = equity;
    equity = fold === 0 ? Number(first.end_equity) : equity + step * (fold % 3 === 0 ? -1 : 1);
    return {
      ...(fold % 2 === 0 ? first : second),
      fold_id: String(fold),
      first_ordinal: IN_SAMPLE + fold * BARS,
      last_ordinal: IN_SAMPLE + (fold + 1) * BARS - 1,
      bars: BARS,
      start_equity: String(start),
      end_equity: equity.toFixed(9),
      start_cursor: syntheticFoldCursor(fold),
    };
  });
  const event = real.execution.fold_capital.boundary_events[0]!;
  body.execution.fold_capital.boundary_events = Array.from({ length: folds - 1 }, (_, fold) => ({
    ...event,
    previous_fold_id: String(fold),
    fold_id: String(fold + 1),
  }));
  const overview = body.execution.candle_overview;
  if (overview) {
    const scale = total / overview.source_bar_count;
    overview.source_bar_count = total;
    overview.bucket_bars = Math.ceil(total / overview.values.length);
    overview.values = overview.values.map((bucket, index, all) => ({
      ...bucket,
      first_ordinal: Math.floor(bucket.first_ordinal * scale),
      last_ordinal: index === all.length - 1 ? total - 1 : Math.floor((bucket.last_ordinal + 1) * scale) - 1,
    }));
  }
  if (body.execution.child_audit.source_record_count !== null) body.execution.child_audit.source_record_count = folds * 6;
  return body;
}

/** The fold-`fold` window: the real bars, labelled with that fold id. */
export function syntheticFoldWindow(scaled: CurrentSourceReplay, fold: number): CurrentSourceReplay {
  const body = structuredClone(scaled);
  body.replay.rows = body.replay.rows.map((row) => (row.bar ? { ...row, bar: { ...row.bar, fold_id: String(fold) } } : row));
  return body;
}

export function syntheticChildAudit(real: ReplayChildAudit, fold: number): ReplayChildAudit {
  const body = structuredClone(real);
  body.fold_id = String(fold);
  body.records = body.records.map((record) => ({ ...record, fold_id: String(fold) }));
  return body;
}
