/**
 * Screen 02 · the data declaration, as pure functions (S02_DATA).
 *
 * Everything here reads served catalog facts and the reader's own draft. A
 * comparison of two served/declared values (a window bound against the first
 * and last served month) is not a derived metric; nothing here estimates a
 * bar count, a fold count or a coverage the server did not publish.
 */

import type { CatalogDataset, CatalogSymbol } from "./datasetClient";
import { coverageFor, sortByExpiry, timeframeFacts, utcMonthIndex } from "./dataDeclarationV2";
import {
  type CoveragePlan,
  type RunDraft,
  coverageMonthEdges,
  monthIndex,
  utcMs,
} from "./runDraft";

/* The optional v2 facts (instrument, per-timeframe coverage, quality, profiles, estimate) live in their own module. */
export * from "./dataDeclarationV2";

/** `2020-01 → 2026-10 · 82 mo`, or null when the source published none. */
export function coverageShort(symbol: CatalogSymbol): string | null {
  const coverage = symbol.coverage;
  if (!coverage) return null;
  return `${coverage.first_month} → ${coverage.last_month} · ${coverage.months} mo`;
}

export type SymbolGroupKind = "PERPETUAL" | "QUARTERLY" | "UNCLASSIFIED";

export interface SymbolGroup {
  kind: SymbolGroupKind;
  /** Group heading; the count is the number shown after the filter. */
  label: string;
  items: readonly CatalogSymbol[];
}

const GROUPS: readonly { kind: SymbolGroupKind; label: string }[] = [
  { kind: "PERPETUAL", label: "Perpetual" },
  { kind: "QUARTERLY", label: "Quarterly (dated)" },
  { kind: "UNCLASSIFIED", label: "Contract kind not published" },
];

/** All published symbols grouped by the served `contract_kind`; empty groups are dropped. `query` is a case-insensitive substring. */
export function groupSymbols(items: readonly CatalogSymbol[], query: string | null): readonly SymbolGroup[] {
  const needle = (query ?? "").trim().toUpperCase();
  const shown = needle === "" ? items : items.filter((item) => item.symbol.toUpperCase().includes(needle));
  return GROUPS.map(({ kind, label }) => ({
    kind,
    label,
    items: sortByExpiry(shown.filter((item) => (item.contract_kind ?? "UNCLASSIFIED") === kind)),
  })).filter((group) => group.items.length > 0);
}

/** The month span (inclusive month indexes) every symbol bar is drawn on. */
export interface MonthAxis {
  first: number;
  last: number;
}

export function symbolAxis(items: readonly CatalogSymbol[]): MonthAxis | null {
  let first = Infinity;
  let last = -Infinity;
  for (const item of items) {
    if (!item.coverage) continue;
    const a = monthIndex(item.coverage.first_month);
    const b = monthIndex(item.coverage.last_month);
    if (a === null || b === null || b < a) continue;
    first = Math.min(first, a);
    last = Math.max(last, b);
  }
  return Number.isFinite(first) ? { first, last } : null;
}

/** Percent geometry of one symbol's served month range on the shared axis; null when it has no readable coverage. */
export function barGeometry(
  symbol: CatalogSymbol,
  axis: MonthAxis | null,
  /** v2: when the server published bars for this timeframe, the bar spans its first to last bar instead of the month partitions. */
  timeframe?: string,
): { left: number; width: number } | null {
  if (!axis || !symbol.coverage) return null;
  const frame = timeframe ? coverageFor(symbol, timeframe) : null;
  const served =
    frame && frame.firstBarUtcMs !== null && frame.lastBarUtcMs !== null && frame.lastBarUtcMs >= frame.firstBarUtcMs
      ? { a: utcMonthIndex(frame.firstBarUtcMs), b: utcMonthIndex(frame.lastBarUtcMs) }
      : null;
  const a = served ? Math.max(served.a, axis.first) : monthIndex(symbol.coverage.first_month);
  const b = served ? Math.min(served.b, axis.last) : monthIndex(symbol.coverage.last_month);
  if (a === null || b === null || b < a) return null;
  const span = axis.last - axis.first + 1;
  return { left: ((a - axis.first) / span) * 100, width: Math.max(((b - a + 1) / span) * 100, 1.5) };
}

/** The chosen symbol's served coverage as instants on the window timeline's clock. */
export interface CoverageRange {
  symbol: string;
  firstMonth: string;
  lastMonth: string;
  /** Epoch ms of the first day of `firstMonth`. */
  from: number;
  /** Epoch ms of the first day after `lastMonth`. */
  to: number;
}

export function coverageRange(plan: CoveragePlan): CoverageRange | null {
  if (plan.state !== "ready") return null;
  const edges = coverageMonthEdges(plan.source.firstMonth, plan.source.lastMonth);
  if (!edges) return null;
  const from = utcMs(edges.lower);
  const to = utcMs(edges.upperExclusive);
  if (from === null || to === null) return null;
  return { symbol: plan.source.symbol, firstMonth: plan.source.firstMonth, lastMonth: plan.source.lastMonth, from, to };
}

/** Each declared window as a drawn range; a missing or reversed window is left out. */
export function declaredRanges(
  draft: Pick<RunDraft, "protocol" | "windows" | "walkForward">,
): readonly { label: string; from: number; to: number }[] {
  const pairs: [string, string, string][] =
    draft.protocol === "three_window_decay"
      ? [
          ["IS", draft.windows.is.start, draft.windows.is.endExclusive],
          ["OOS", draft.windows.oos.start, draft.windows.oos.endExclusive],
          ["Holdout", draft.windows.holdout.start, draft.windows.holdout.endExclusive],
        ]
      : [["Analysis", draft.walkForward.start, draft.walkForward.endExclusive]];
  return pairs.flatMap(([label, start, end]) => {
    const from = utcMs(start);
    const to = utcMs(end);
    return from !== null && to !== null && to > from ? [{ label, from, to }] : [];
  });
}

/** The one clock the coverage bar and the window bars share. */
export function sharedAxis(
  draft: Pick<RunDraft, "protocol" | "windows" | "walkForward">,
  coverage: CoverageRange | null,
): { from: number; to: number } | null {
  if (!coverage) return null;
  const ranges = declaredRanges(draft);
  return {
    from: Math.min(coverage.from, ...ranges.map((range) => range.from)),
    to: Math.max(coverage.to, ...ranges.map((range) => range.to)),
  };
}

export interface CoverageWarning {
  /** `IS start`, `Holdout end exclusive`, … */
  bound: string;
  side: "before" | "after";
  /** The draft's own text for the bound. */
  value: string;
}

/**
 * Declared bounds that fall outside the served month coverage. A comparison of
 * two values the form holds; the served first and last month go in the message.
 */
export function coverageWarnings(
  draft: Pick<RunDraft, "protocol" | "windows" | "walkForward">,
  coverage: CoverageRange | null,
): readonly CoverageWarning[] {
  if (!coverage) return [];
  const bounds: [string, string][] =
    draft.protocol === "three_window_decay"
      ? [
          ["IS start", draft.windows.is.start],
          ["IS end", draft.windows.is.endExclusive],
          ["OOS start", draft.windows.oos.start],
          ["OOS end", draft.windows.oos.endExclusive],
          ["Holdout start", draft.windows.holdout.start],
          ["Holdout end", draft.windows.holdout.endExclusive],
        ]
      : [
          ["Analysis start", draft.walkForward.start],
          ["First OOS instant", draft.walkForward.splitMode],
          ["Analysis end", draft.walkForward.endExclusive],
        ];
  return bounds.flatMap(([bound, value]): CoverageWarning[] => {
    const at = utcMs(value);
    if (at === null) return [];
    if (at < coverage.from) return [{ bound, side: "before" as const, value }];
    if (at > coverage.to) return [{ bound, side: "after" as const, value }];
    return [];
  });
}

/** One timeframe chip's state. */
export interface TimeframeChip {
  timeframe: string;
  selected: boolean;
  enabled: boolean;
  /** Why it cannot be chosen; null when it can. */
  disabledReason: "not-declared" | "not-offered" | "declaration-not-published" | "unavailable" | "no-profile" | null;
  /** The server's code when the dataset names this timeframe as unavailable (v2), else null. */
  reasonCode: string | null;
  /** `no-profile`: which admitted profile pins which timeframe (`p04… pins 1h`), as served; else null. */
  detail: string | null;
}

/**
 * Every timeframe the dataset serves, plus any the version declares that the
 * dataset does not (shown disabled), plus the draft's own value if neither
 * lists it, so the form never hides what Review prints.
 */
export function timeframeChips(
  dataset: Pick<CatalogDataset, "timeframes"> | null,
  declared: readonly string[] | null,
  current: string,
  /** A scratch run binds no version, so there is no declaration to wait for: the dataset's own timeframes are the choice. */
  scratch = false,
  /** The timeframes the admitted profiles that fit the declaration cover (`profileTimeframes`); null restricts nothing. */
  profileFit: { timeframes: readonly string[]; profileIds: readonly string[] } | null = null,
): readonly TimeframeChip[] {
  const offered = dataset?.timeframes ?? [];
  const declaredList = declared ?? [];
  const all = [...offered, ...declaredList.filter((tf) => !offered.includes(tf))];
  if (current !== "" && !all.includes(current)) all.push(current);
  const facts = timeframeFacts(dataset);
  return all.map((timeframe) => {
    const isOffered = dataset === null || offered.includes(timeframe);
    const isDeclared = declared === null || declared.length === 0 ? null : declared.includes(timeframe);
    /* v2: the dataset names the timeframe but says it cannot serve it (`TIMEFRAME_NOT_BUILT`, ...). */
    const fact = facts?.find((entry) => entry.timeframe === timeframe);
    const unavailable = fact !== undefined && fact.availability !== "available";
    const disabledReason: TimeframeChip["disabledReason"] =
      unavailable
        ? "unavailable"
        : scratch
        ? isOffered
          ? null
          : "not-offered"
        : declared === null || declared.length === 0
        ? "declaration-not-published"
        : !isOffered
          ? "not-offered"
          : isDeclared
            ? null
            : "not-declared";
    /* The profile fit only narrows a timeframe that was otherwise choosable. */
    const outsideProfile = disabledReason === null && profileFit !== null && !profileFit.timeframes.includes(timeframe);
    const finalReason: TimeframeChip["disabledReason"] = outsideProfile ? "no-profile" : disabledReason;
    return {
      timeframe,
      selected: timeframe === current,
      enabled: finalReason === null,
      disabledReason: finalReason,
      reasonCode: unavailable ? (fact.reasonCode ?? fact.availability) : null,
      detail: outsideProfile && profileFit ? `${profileFit.profileIds.join(", ")} pins ${profileFit.timeframes.join(", ")}` : null,
    };
  });
}

/* ------------------------------------------------------------- fold plan */

export type ProfileFoldBounds = readonly {
  profile_id: string;
  state: "ENABLED" | "DISABLED";
  protocol: string;
  execution_route: string;
  optimization_mode: string;
  optimization_schedule: string;
  fold_bounds: { min: number; max: number } | null;
}[];

export type FoldPlan =
  | { kind: "server-plan"; count: number; source: "preflight" }
  | { kind: "profile-bounds"; min: number; max: number; profileId: string }
  | { kind: "absent"; reason: string };

/**
 * "≈ N outer folds" only from a served value. After a preflight that is its
 * `resource_estimate.outer_fold_count`; before one, the admitted profile's
 * served `fold_bounds` for the declared route x mode x schedule is shown as a
 * range, never as a count. No fold number is computed in the browser.
 */
export function foldPlan(
  draft: Pick<RunDraft, "protocol" | "executionRoute" | "optimizationMode" | "optimizationSchedule">,
  preflightOuterFolds: number | null,
  profiles: ProfileFoldBounds | null,
): FoldPlan {
  if (preflightOuterFolds !== null) return { kind: "server-plan", count: preflightOuterFolds, source: "preflight" };
  if (profiles === null) return { kind: "absent", reason: "server profiles not read" };
  if (draft.optimizationMode === "" || draft.optimizationSchedule === "") {
    return { kind: "absent", reason: "pick a mode and schedule" };
  }
  const match = profiles.find(
    (profile) =>
      profile.state === "ENABLED" &&
      profile.protocol === draft.protocol &&
      profile.execution_route === draft.executionRoute &&
      profile.optimization_mode === draft.optimizationMode &&
      profile.optimization_schedule === draft.optimizationSchedule,
  );
  if (!match) return { kind: "absent", reason: "no admitted profile publishes it" };
  if (match.fold_bounds === null) return { kind: "absent", reason: "profile publishes no fold bounds" };
  return { kind: "profile-bounds", min: match.fold_bounds.min, max: match.fold_bounds.max, profileId: match.profile_id };
}
