import {
  OBSERVED_METHOD_IDS, OBSERVED_NOT_PUBLISHED_FIGURES, OBSERVED_THRESHOLDS,
  type ObservedFigure, type ObservedReadResponse,
} from "./observed-read.contract";
import { managerIntegerOrder } from "../paper-read/manager-records";

type NotPublished = ObservedReadResponse["not_published"][number];

/**
 * Pure figure computation for the Core-observed lane. Input is the stored
 * `account_equity_snapshots` relation of one profile snapshot; nothing here
 * performs I/O, reads a clock (the caller passes `nowMs`) or uses a float.
 * All money arithmetic is BigInt at a fixed scale of 18 fractional digits.
 */
const SCALE = 18;
const UNIT = 10n ** BigInt(SCALE);
const DECIMAL = /^(-?)(0|[1-9]\d*)(?:\.(\d+))?$/;
/** Ratios are truncated toward zero at this many fractional digits. */
const RATIO_DIGITS = 10;

export interface ObservedRelationInput {
  availability: string;
  completeness: string;
  reason_code: string | null;
  window_truncated: boolean;
  freshness?: string;
  items: ReadonlyArray<Record<string, unknown>>;
}

export interface ObservedAccountCensusInput {
  availability: string;
  completeness: string;
  freshness: string;
  items: ReadonlyArray<Record<string, unknown>>;
}

/** No production coverage constants are invented here. The service supplies no
 * policy until an approved sufficiency artifact exists. Explicit pure-vector
 * tests can supply a TEST_ONLY policy, which is never accepted by the service. */
export interface ObservedGridCoveragePolicy {
  qualification: "TEST_ONLY";
  minimum_points: number;
  minimum_duration_ms: number;
  maximum_gap_ms: number;
}

export interface ObservedComputationContext {
  census: ObservedAccountCensusInput | null;
  snapshot_freshness: "FRESH" | "STALE" | "UNKNOWN";
  snapshot_completeness: string;
  cumulative_net_pnl_supported: boolean;
  test_only_grid_coverage?: ObservedGridCoveragePolicy;
}

export interface ObservedComputation {
  figures: ObservedFigure[];
  not_published: NotPublished[];
  quality: { completeness: "COMPLETE" | "PARTIAL" | "UNRESOLVED"; freshness: "FRESH" | "STALE" | "UNKNOWN"; reasons: string[] };
  oldest_figure_ts_ms: number | null;
  newest_figure_ts_ms: number | null;
}

/** Exact decimal string -> scaled BigInt, or null when it is not an exact decimal that fits the scale. */
export function toScaled(value: unknown): bigint | null {
  if (typeof value !== "string") return null;
  const match = DECIMAL.exec(value);
  if (!match || match[0].length !== value.length) return null;
  const [, sign, whole, fraction = ""] = match;
  if (whole!.length > 30 || fraction.length > SCALE) return null;
  const scaled = BigInt(whole! + fraction.padEnd(SCALE, "0"));
  return sign === "-" ? -scaled : scaled;
}

/** Scaled BigInt -> canonical decimal string (no trailing zeros, no "-0"). */
export function fromScaled(value: bigint): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const whole = abs / UNIT;
  const fraction = (abs % UNIT).toString().padStart(SCALE, "0").replace(/0+$/, "");
  const body = fraction ? `${whole}.${fraction}` : `${whole}`;
  return negative && abs !== 0n ? `-${body}` : body;
}

/** (numerator / denominator) as a decimal string, truncated toward zero at RATIO_DIGITS digits. */
export function ratioString(numerator: bigint, denominator: bigint): string | null {
  if (denominator === 0n) return null;
  const scaled = (numerator * 10n ** BigInt(RATIO_DIGITS)) / denominator; // BigInt division truncates toward zero
  const negative = scaled < 0n;
  const abs = negative ? -scaled : scaled;
  const whole = abs / 10n ** BigInt(RATIO_DIGITS);
  const fraction = (abs % 10n ** BigInt(RATIO_DIGITS)).toString().padStart(RATIO_DIGITS, "0").replace(/0+$/, "");
  const body = fraction ? `${whole}.${fraction}` : `${whole}`;
  return negative && abs !== 0n ? `-${body}` : body;
}

interface Row { account: string; currency: string; tsMs: number; order: bigint; equity: bigint; netPnl: bigint | null }
const validText = (value: unknown): value is string => typeof value === "string" && value.length > 0 &&
  value.length <= 256 && !/[\u0000-\u001f\u007f]/u.test(value);

function parseRow(item: Record<string, unknown>): Row | null {
  const fields = item.fields;
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) return null;
  const f = fields as Record<string, unknown>;
  if (!validText(f.account_id) || !validText(f.currency)) return null;
  // A row stamped with another mode is a different population: never fold it in.
  if (f.mode != null && f.mode !== "paper") return null;
  if (typeof f.ts !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(f.ts)) return null;
  const tsMs = Date.parse(f.ts);
  if (!Number.isSafeInteger(tsMs) || tsMs < 0) return null;
  const equity = toScaled(f.equity), netPnl = toScaled(f.net_pnl);
  const order = managerIntegerOrder(f.id);
  if (equity === null || order === null) return null;
  return { account: f.account_id, currency: f.currency, tsMs, order, equity, netPnl };
}

const later = (a: Row, b: Row): boolean => {
  if (a.tsMs !== b.tsMs) return a.tsMs > b.tsMs;
  return a.order > b.order;
};

type Quality = ObservedFigure["quality"];

function figure(base: {
  figure_id: ObservedFigure["figure_id"]; unit: ObservedFigure["unit"]; currency: string; basis: string;
  value: string | null; window: ObservedFigure["window"]; accounts_total: number; accounts_reported: number;
  oldest: number | null; newest: number | null; caveats: string[]; reasons: string[]; unavailable: string | null;
  freshness: Quality["freshness"];
}): ObservedFigure {
  const unavailable = base.unavailable !== null || base.value === null;
  const reasons = [...new Set(base.reasons)];
  const reasonCode = base.unavailable ?? (reasons[0] ?? null);
  const availability: ObservedFigure["availability"] = unavailable ? "UNAVAILABLE" : reasons.length > 0 ? "PARTIAL" : "AVAILABLE";
  const completeness: Quality["completeness"] = unavailable ? "UNRESOLVED" : reasons.length > 0 ? "PARTIAL" : "COMPLETE";
  return {
    figure_id: base.figure_id, method_id: OBSERVED_METHOD_IDS[base.figure_id], value: unavailable ? null : base.value,
    unit: base.unit, currency: base.currency, basis: base.basis, window: base.window, availability,
    reason_code: availability === "AVAILABLE" ? null : reasonCode,
    quality: { completeness, freshness: base.freshness,
      reasons: [...new Set([...(base.unavailable ? [base.unavailable] : []), ...reasons])] },
    accounts_total: base.accounts_total, accounts_reported: base.accounts_reported,
    oldest_ts_ms: base.oldest, newest_ts_ms: base.newest, caveats: base.caveats,
    source_confidence: "UNKNOWN", calculation_revision: "core-observed.v1", policy_revision: "NONE",
  };
}

const constantNotPublished = (): NotPublished[] => OBSERVED_NOT_PUBLISHED_FIGURES.map(name => ({
  figure: name, reason_code: name === "PORTFOLIO_NAV" ? "PORTFOLIO_EQUITY_RELATION_EMPTY_OR_NOT_SERVED" : "NOT_PRODUCED_BY_CORE_OBSERVED_MODE",
}));

/**
 * Compute the observed fund figures of one profile.
 *
 *  - NAV      = sum, per currency, of the latest equity of each account.
 *  - NET_PNL  = sum, per currency, of the latest SOURCE-STATED net_pnl (cumulative since each
 *               account's first source snapshot, verified on a real Paper OKX snapshot).
 *  - RETURN   = NAV equity change between the first and last COMPLETE grid timestamps
 *               (a timestamp where every account of that currency has a row). Not flow adjusted.
 *  - DRAWDOWN = peak-to-trough of that same NAV grid series, a fraction <= 0, truncated toward zero.
 * Never summed across currencies; no forward fill; no interpolation.
 */
export function computeObservedFigures(input: ObservedRelationInput | null, nowMs: number,
  context?: ObservedComputationContext): ObservedComputation {
  const none = (reason: string): ObservedComputation => ({
    figures: [],
    not_published: [
      ...(["NAV", "NET_PNL", "RETURN", "DRAWDOWN"] as const).map((name): NotPublished => ({ figure: name, reason_code: reason })),
      ...constantNotPublished(),
    ],
    quality: { completeness: "UNRESOLVED", freshness: input?.freshness === "STALE" || context?.snapshot_freshness === "STALE" ? "STALE" : "UNKNOWN", reasons: [reason] },
    oldest_figure_ts_ms: null, newest_figure_ts_ms: null,
  });
  if (input === null) return none("EQUITY_RELATION_NOT_SERVED_FOR_PROFILE");
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) return none("OBSERVATION_CLOCK_INVALID");
  if (input.availability !== "AVAILABLE") return none(input.reason_code && /^[A-Z][A-Z0-9_]{2,95}$/.test(input.reason_code)
    ? input.reason_code : "EQUITY_RELATION_UNAVAILABLE");

  // A complete history relation is not an account census: an account may never
  // have produced an equity row. Never manufacture total=reported from it.
  const census = context?.census;
  if (!census || census.availability !== "AVAILABLE") return none("ACCOUNT_CENSUS_NOT_SERVED");
  if (census.completeness !== "COMPLETE") return none("ACCOUNT_CENSUS_NOT_COMPLETE");
  if (census.items.length > 10_000 || input.items.length > 10_000) return none("OBSERVED_INPUT_ROW_BOUND_EXCEEDED");
  const expected = new Map<string, string>();
  for (const item of census.items) {
    const f = item.fields as Record<string, unknown> | undefined;
    if (!f || !validText(f.account_id) || !validText(f.base_currency) || f.mode != null && f.mode !== "paper")
      return none("ACCOUNT_CENSUS_INVALID");
    const previous = expected.get(f.account_id);
    if (previous && previous !== f.base_currency) return none("ACCOUNT_CURRENCY_AMBIGUOUS");
    expected.set(f.account_id, f.base_currency);
  }
  if (expected.size === 0) return none("ACCOUNT_CENSUS_EMPTY");

  const rows: Row[] = [];
  let rejected = 0;
  for (const item of input.items) {
    const row = parseRow(item);
    if (row && expected.get(row.account) === row.currency) rows.push(row); else rejected++;
  }
  if (rows.length === 0) return none(rejected > 0 ? "EQUITY_ROWS_INVALID" : "NO_EQUITY_ROWS");

  const relationReasons: string[] = [];
  if (context!.snapshot_completeness !== "COMPLETE") relationReasons.push("SOURCE_SNAPSHOT_NOT_COMPLETE");
  if (input.completeness !== "COMPLETE") relationReasons.push("SOURCE_RELATION_NOT_COMPLETE");
  if (input.window_truncated) relationReasons.push("WINDOW_TRUNCATED");
  if (rejected > 0) relationReasons.push("ROWS_REJECTED_INVALID");

  const sourceFreshness: Quality["freshness"] =
    context!.snapshot_freshness === "STALE" || input.freshness === "STALE" || census.freshness === "STALE" ? "STALE"
      : context!.snapshot_freshness !== "FRESH" || input.freshness !== "FRESH" || census.freshness !== "FRESH" ? "UNKNOWN" : "FRESH";
  if (sourceFreshness === "STALE") relationReasons.push("SOURCE_INPUT_STALE");
  if (sourceFreshness === "UNKNOWN") relationReasons.push("SOURCE_INPUT_FRESHNESS_UNKNOWN");

  const byCurrency = new Map<string, Row[]>();
  for (const row of rows) {
    const list = byCurrency.get(row.currency) ?? [];
    list.push(row);
    byCurrency.set(row.currency, list);
  }
  // Expected but completely unreported currencies must still be visible.
  for (const currency of expected.values()) if (!byCurrency.has(currency)) byCurrency.set(currency, []);
  if (byCurrency.size > 16) return none("CURRENCY_PARTITION_BOUND_EXCEEDED");

  const figures: ObservedFigure[] = [];
  let oldestAll: number | null = null, newestAll: number | null = null;
  let anyStale = sourceFreshness === "STALE", anyUnknown = sourceFreshness === "UNKNOWN";
  let anyPartial = relationReasons.length > 0;

  for (const currency of [...byCurrency.keys()].sort()) {
    const list = byCurrency.get(currency)!;
    const latest = new Map<string, Row>();
    for (const row of list) {
      const current = latest.get(row.account);
      if (!current || later(row, current)) latest.set(row.account, row);
    }
    const accounts = [...expected].filter(([, unit]) => unit === currency).map(([account]) => account);
    const stamps = [...latest.values()].map(row => row.tsMs);
    const oldest = stamps.length ? Math.min(...stamps) : null, newest = stamps.length ? Math.max(...stamps) : null;
    if (oldest !== null) oldestAll = oldestAll === null ? oldest : Math.min(oldestAll, oldest);
    if (newest !== null) newestAll = newestAll === null ? newest : Math.max(newestAll, newest);

    const reasons = [...relationReasons];
    const stale = oldest !== null && nowMs - oldest > OBSERVED_THRESHOLDS.figure_rows_stale_after_ms;
    if (stale) { reasons.push("FIGURE_ROWS_STALE"); anyStale = true; }
    if (oldest !== null && newest !== null && newest - oldest > OBSERVED_THRESHOLDS.account_timestamp_spread_max_ms)
      reasons.push("ACCOUNT_TIMESTAMP_SPREAD_EXCEEDED");
    if (latest.size !== accounts.length) reasons.push("EXPECTED_ACCOUNTS_NOT_REPORTED");
    if (newest !== null && newest > nowMs) reasons.push("FIGURE_TIMESTAMP_IN_FUTURE");
    if (reasons.length > relationReasons.length) anyPartial = true;
    const freshness: Quality["freshness"] = stale || sourceFreshness === "STALE" ? "STALE"
      : newest === null || newest > nowMs ? "UNKNOWN" : sourceFreshness;
    if (freshness === "UNKNOWN") anyUnknown = true;

    let nav = 0n, pnl = 0n;
    for (const row of latest.values()) { nav += row.equity; pnl += row.netPnl ?? 0n; }
    const common = {
      currency, accounts_total: accounts.length, accounts_reported: latest.size, oldest, newest, freshness,
    };
    const navValue = fromScaled(nav), pnlValue = fromScaled(pnl);
    const outputFits = (value: string) => /^-?(?:0|[1-9]\d{0,29})(?:\.\d{1,18})?$/.test(value);
    const missing = latest.size !== accounts.length;
    figures.push(figure({
      ...common, figure_id: "NAV", unit: "MONEY", value: fromScaled(nav),
      basis: "SUM_OF_LATEST_EQUITY_PER_LOGICAL_ACCOUNT_ONE_CURRENCY", window: oldest !== null && newest !== null ? { from_ts_ms: oldest, to_ts_ms: newest } : null,
      caveats: ["NOT_TS_QUALIFIED", "NOT_CAPITAL_FLOW_ADJUSTED", "LOGICAL_ACCOUNT_SUM_NOT_ECONOMIC_OWNERSHIP_PROOF"], reasons,
      unavailable: latest.size === 0 ? "EXPECTED_ACCOUNTS_NOT_REPORTED" : !outputFits(navValue) ? "OBSERVED_DECIMAL_BOUND_EXCEEDED" : null,
    }));
    figures.push(figure({
      ...common, figure_id: "NET_PNL", unit: "MONEY", value: fromScaled(pnl),
      basis: "SUM_OF_LATEST_SOURCE_CUMULATIVE_NET_PNL_PER_ACCOUNT", window: oldest !== null && newest !== null ? { from_ts_ms: oldest, to_ts_ms: newest } : null,
      caveats: ["NOT_TS_QUALIFIED", "CUMULATIVE_SINCE_EACH_ACCOUNT_FIRST_SOURCE_SNAPSHOT"], reasons,
      unavailable: !context!.cumulative_net_pnl_supported ? "CUMULATIVE_NET_PNL_SEMANTICS_NOT_CONFIRMED"
        : latest.size === 0 ? "EXPECTED_ACCOUNTS_NOT_REPORTED" : [...latest.values()].some(row => row.netPnl === null)
          ? "NET_PNL_ROWS_INVALID" : !outputFits(pnlValue) ? "OBSERVED_DECIMAL_BOUND_EXCEEDED" : null,
    }));

    // Complete grid: only timestamps where EVERY account of this currency has a row.
    const grid = new Map<number, Map<string, Row>>();
    for (const row of list) {
      const at = grid.get(row.tsMs) ?? new Map<string, Row>();
      const current = at.get(row.account);
      if (!current || later(row, current)) at.set(row.account, row);
      grid.set(row.tsMs, at);
    }
    const series = [...grid.entries()].filter(([, at]) => at.size === accounts.length).sort((a, b) => a[0] - b[0])
      .map(([tsMs, at]) => ({ tsMs, nav: [...at.values()].reduce((sum, row) => sum + row.equity, 0n) }));
    const gridWindow = series.length >= 2 ? { from_ts_ms: series[0]!.tsMs, to_ts_ms: series[series.length - 1]!.tsMs } : null;
    const policy = context?.test_only_grid_coverage;
    const validPolicy = policy?.qualification === "TEST_ONLY" && Number.isSafeInteger(policy.minimum_points) && policy.minimum_points >= 2 &&
      Number.isSafeInteger(policy.minimum_duration_ms) && policy.minimum_duration_ms > 0 &&
      Number.isSafeInteger(policy.maximum_gap_ms) && policy.maximum_gap_ms > 0;
    const gridReason = input.window_truncated ? "WINDOW_TRUNCATED"
      : missing ? "EXPECTED_ACCOUNTS_NOT_REPORTED" : series.length === 0 ? "NAV_GRID_INCOMPLETE"
      : series.length === 1 ? "NAV_GRID_TOO_SHORT" : !validPolicy ? "NAV_GRID_COVERAGE_POLICY_PENDING"
      : series.length < policy!.minimum_points || series[series.length - 1]!.tsMs - series[0]!.tsMs < policy!.minimum_duration_ms
        ? "NAV_GRID_COVERAGE_INSUFFICIENT"
      : series.some((point, index) => index > 0 && point.tsMs - series[index - 1]!.tsMs > policy!.maximum_gap_ms)
        ? "NAV_GRID_COVERAGE_INSUFFICIENT" : null;
    const gridOldest = gridWindow?.from_ts_ms ?? null, gridNewest = gridWindow?.to_ts_ms ?? null;
    if (gridOldest !== null) oldestAll = oldestAll === null ? gridOldest : Math.min(oldestAll, gridOldest);
    if (gridNewest !== null) newestAll = newestAll === null ? gridNewest : Math.max(newestAll, gridNewest);
    const gridStale = gridNewest !== null && nowMs - gridNewest > OBSERVED_THRESHOLDS.figure_rows_stale_after_ms;
    const gridFreshness: Quality["freshness"] = gridStale || sourceFreshness === "STALE" ? "STALE"
      : gridNewest === null || gridNewest > nowMs ? "UNKNOWN" : sourceFreshness;
    if (gridStale) anyStale = true;
    if (gridFreshness === "UNKNOWN") anyUnknown = true;
    const gridReasons = [...relationReasons, ...(gridStale ? ["FIGURE_ROWS_STALE"] : [])];
    const gridCommon = { ...common, oldest: gridOldest, newest: gridNewest, freshness: gridFreshness };
    const firstNav = series.length > 0 ? series[0]!.nav : 0n;
    const returnValue = !gridReason && firstNav > 0n ? ratioString(series[series.length - 1]!.nav - firstNav, firstNav) : null;
    figures.push(figure({
      ...gridCommon, figure_id: "RETURN", unit: "FRACTION", value: returnValue,
      basis: "NAV_EQUITY_CHANGE_FIRST_TO_LAST_COMPLETE_GRID_TS", window: gridWindow,
      caveats: ["NOT_TS_QUALIFIED", "NOT_CAPITAL_FLOW_ADJUSTED", "TRUNCATED_TOWARD_ZERO_10_DIGITS"], reasons: gridReasons,
      unavailable: gridReason ?? (returnValue === null ? "FIRST_NAV_NOT_POSITIVE" : !outputFits(returnValue) ? "OBSERVED_DECIMAL_BOUND_EXCEEDED" : null),
    }));
    let drawdown: string | null = null;
    if (!gridReason) {
      // Exact peak-to-trough: keep the most negative gap/peak as a fraction and compare by
      // cross-multiplication (both denominators are positive), never by a float.
      let peak = series[0]!.nav, worstNum = 0n, worstDen = 1n, valid = peak > 0n;
      for (const point of series) {
        if (!valid) break;
        if (point.nav > peak) peak = point.nav;
        const gap = point.nav - peak; // <= 0
        if (gap * worstDen < worstNum * peak) { worstNum = gap; worstDen = peak; }
      }
      drawdown = valid ? ratioString(worstNum, worstDen) : null;
    }
    figures.push(figure({
      ...gridCommon, figure_id: "DRAWDOWN", unit: "FRACTION", value: drawdown,
      basis: "NAV_GRID_PEAK_TO_TROUGH_FRACTION_NON_POSITIVE", window: gridWindow,
      caveats: ["NOT_TS_QUALIFIED", "NOT_THE_SOURCE_DRAWDOWN_COLUMN", "TRUNCATED_TOWARD_ZERO_10_DIGITS"], reasons: gridReasons,
      unavailable: gridReason ?? (drawdown === null ? "NAV_NOT_POSITIVE" : !outputFits(drawdown) ? "OBSERVED_DECIMAL_BOUND_EXCEEDED" : null),
    }));
  }

  const completeness: ObservedComputation["quality"]["completeness"] =
    anyPartial || figures.some(item => item.availability !== "AVAILABLE") ? "PARTIAL" : "COMPLETE";
  const reasons = [...new Set([...relationReasons, ...figures.flatMap(item => item.quality.reasons)])].slice(0, 16);
  return {
    figures,
    not_published: constantNotPublished(),
    quality: { completeness, freshness: anyStale ? "STALE" : anyUnknown ? "UNKNOWN" : "FRESH", reasons },
    oldest_figure_ts_ms: oldestAll, newest_figure_ts_ms: newestAll,
  };
}
