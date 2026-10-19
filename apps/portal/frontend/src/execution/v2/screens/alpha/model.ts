/**
 * Alpha 360 models: published rows in, the shapes the screen draws out.
 *
 * Pure functions over the readers' output (`readAlphaFleetItem`,
 * `readProfileEnvelope`, `readFinancialChart`, `readObservedTimeline`, the
 * stage-drift reader). Nothing here fetches, and nothing here computes money:
 * a figure is a published decimal string or it is absent. In particular this
 * file never derives a stage's history, a return, a drawdown or a NAV; the
 * lifecycle facts the spine cannot get stay absent (FE-027/028).
 */
import type { FinancialChartPayload } from "../../../api/financialChart";
import type { ObservedEntry, ObservedTimeline } from "../../../api/observedTimeline";
import type { AlphaFleetDeployment, AlphaFleetItem } from "../../../api/profileRead";
import type { FlagKind } from "../../flagKinds";
import type { StageDrift } from "../../../hifiInsight";
import { readUtcEpochMs, type UtcEpochMs } from "../../../screenDataContract";
import type { ReplayFill, ReplayOrder } from "../../../components/tradeReplayModel";
import { SPINE_STAGE_IDS, type SpineStageId } from "../../blocks";
import type { ChartEvent, ChartSegment, ChartState, SeriesPoint, StageBand } from "../../charts";
import type { ExecEnv } from "../../urlState";

/** DOM cap for any table on this screen (scale-refine, common brief). */
export const ROW_CAP = 200;

/** Tabs, in order. Keys are the V2 keys of `tabAliases.ts` (surface `alpha`). */
export const ALPHA_TABS = [
  { key: "performance", label: "Performance" },
  { key: "deployments", label: "Deployments" },
  { key: "evidence", label: "Research Evidence" },
  { key: "regime", label: "Regime Fit" },
  { key: "orders", label: "Orders & Fills" },
  { key: "activity", label: "Activity & Decisions" },
] as const;
/** Behind the "More" menu, as in the hi-fi (Trade Replay is there too; `?tab=replay` opens it). */
export const ALPHA_MORE_TABS = [
  { key: "replay", label: "Trade Replay" },
  { key: "positions", label: "Positions" },
  { key: "reconciliation", label: "Reconciliation" },
] as const;
export type AlphaTabKey = (typeof ALPHA_TABS)[number]["key"] | (typeof ALPHA_MORE_TABS)[number]["key"];
export const ALPHA_TAB_KEYS: readonly AlphaTabKey[] = [...ALPHA_TABS, ...ALPHA_MORE_TABS].map((tab) => tab.key);
export const isAlphaTab = (value: string): value is AlphaTabKey => (ALPHA_TAB_KEYS as readonly string[]).includes(value);

/* ── text ─────────────────────────────────────────────────────────────────── */

/** The freshness tier of the alpha read, as a flag. Unknown words stay unknown; nothing becomes green by default. */
export function freshnessFlag(freshness: string | null): { kind: "ok" | "stale" | "unknown"; label: string } {
  switch ((freshness ?? "").toUpperCase()) {
    case "FRESH": return { kind: "ok", label: "Fresh" };
    case "STALE": return { kind: "stale", label: "Stale" };
    case "": return { kind: "unknown", label: "Freshness not published" };
    default: return { kind: "unknown", label: humanize(freshness ?? "") };
  }
}

export function humanize(code: string): string {
  const words = code.replace(/[_-]+/g, " ").trim().toLowerCase();
  return words === "" ? code : words.charAt(0).toUpperCase() + words.slice(1);
}

/* ── stages ───────────────────────────────────────────────────────────────── */

/** A published stage word (`PAPER`, `LIVE_CANARY`, `CANARY`, `LIVE_FULL`) to a spine stage. */
export function spineStageOf(code: string | null | undefined): SpineStageId | null {
  const word = (code ?? "").toUpperCase();
  if (word.startsWith("PAPER")) return "paper";
  if (word.startsWith("SANDBOX")) return "sandbox";
  if (word.includes("CANARY")) return "canary";
  if (word.startsWith("LIVE")) return "live";
  return null;
}

/** Paper and Sandbox are their own books; Canary and Live share the Real-funded book. */
export function envOfStage(stage: SpineStageId | null): ExecEnv | null {
  switch (stage) {
    case "paper": return "paper";
    case "sandbox": return "sandbox";
    case "canary":
    case "live": return "live";
    default: return null;
  }
}

/** The stage the source names as current, or `null`. Never the highest stage present. */
export const currentStageOf = (item: AlphaFleetItem | null): SpineStageId | null => (item ? spineStageOf(item.stage) : null);

const ENV_ORDER: readonly ExecEnv[] = ["live", "paper", "sandbox"];

/** Books this alpha has a deployment in, Real-funded first. */
export function deployedEnvs(item: AlphaFleetItem | null): readonly ExecEnv[] {
  if (item === null) return [];
  const seen = new Set<ExecEnv>();
  for (const deployment of item.deployments) {
    const env = envOfStage(spineStageOf(deployment.stage));
    if (env !== null) seen.add(env);
  }
  return ENV_ORDER.filter((env) => seen.has(env));
}

/**
 * The book to read. The URL's `env` wins when the alpha is deployed there;
 * otherwise the first book it is deployed in; with no deployment at all the URL
 * value stands (the reads will say there is nothing).
 */
export function chooseEnv(requested: ExecEnv, deployed: readonly ExecEnv[]): ExecEnv {
  if (deployed.includes(requested)) return requested;
  return deployed[0] ?? requested;
}

/* ── deployments ──────────────────────────────────────────────────────────── */

export interface DeploymentRow {
  id: string;
  stage: SpineStageId | null;
  stageLabel: string;
  accountId: string;
  portfolio: string | null;
  venue: string;
  runtime: { kind: FlagKind; label: string };
  currency: string;
  allocation: string | null;
  netPnl: string;
  exposure: string;
  health: string;
  href: string;
  /** Stage order, so the table reads Paper to Live. */
  rank: number;
}

const STAGE_WORD: Readonly<Record<SpineStageId, string>> = { r1: "R1 gate", r2: "R2 gate", paper: "Paper", sandbox: "Sandbox", canary: "Canary", live: "Live" };
export const stageWord = (stage: SpineStageId): string => STAGE_WORD[stage];

function runtimeOf(deployment: AlphaFleetDeployment): { kind: FlagKind; label: string } {
  const state = deployment.state.toUpperCase();
  if (state === "ACTIVE") return { kind: "ok", label: "Running" };
  if (state === "ENDED" || state === "COMPLETED" || state === "RETIRED") return { kind: "paused", label: humanize(deployment.state) };
  if (state === "FAILED" || state === "HALTED") return { kind: "attention", label: humanize(deployment.state) };
  return { kind: "unknown", label: humanize(deployment.state) };
}

/** Where a deployment's own workbench lives (V1 routes, kept). */
export function deploymentHref(stage: SpineStageId | null, id: string): string {
  const safe = encodeURIComponent(id);
  if (stage === "paper") return `/deployments/paper/${safe}`;
  if (stage === "sandbox") return `/deployments/sandbox/${safe}`;
  return `/deployments/live/${safe}`;
}

export function deploymentRows(item: AlphaFleetItem | null): readonly DeploymentRow[] {
  if (item === null) return [];
  return item.deployments
    .map((d): DeploymentRow => {
      const stage = spineStageOf(d.stage);
      return {
        id: d.deploymentId,
        stage,
        stageLabel: stage === null ? humanize(d.stage) : stageWord(stage),
        accountId: d.accountId,
        portfolio: d.portfolioName,
        venue: d.venue,
        runtime: runtimeOf(d),
        currency: d.currency,
        allocation: d.allocation,
        netPnl: d.netPnl,
        exposure: d.exposure,
        health: d.health,
        href: deploymentHref(stage, d.deploymentId),
        rank: stage === null ? SPINE_STAGE_IDS.length : SPINE_STAGE_IDS.indexOf(stage),
      };
    })
    .sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id));
}

/* ── equity ───────────────────────────────────────────────────────────────── */

const DECIMAL = /^-?\d+(\.\d+)?$/;

/** A JSON number as a decimal string, or `null` when its shortest form is an exponent. */
export function numberToDecimal(value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) return null;
  const text = String(value);
  return DECIMAL.test(text) && !/^-0(\.0+)?$/.test(text) ? text : null;
}

export interface EquityPanelInput {
  key: string;
  label: string;
  currency: string | null;
  points: readonly SeriesPoint[];
  state: ChartState;
  /** Spans drawn hatched: a Paper or Sandbox book is simulated. */
  segments: readonly ChartSegment[];
  /** Counted gaps the source declared. */
  gapCount: number;
  /** Where the points came from, in words. */
  basis: string;
}

const epoch = (ms: number): UtcEpochMs | null => readUtcEpochMs(ms);

/** Insert a null point inside each declared gap, so the line breaks there. */
function withGaps(points: readonly SeriesPoint[], gaps: readonly { fromMs: number; toMs: number }[]): SeriesPoint[] {
  const out: SeriesPoint[] = [...points];
  for (const gap of gaps) {
    const mid = epoch(Math.floor((gap.fromMs + gap.toMs) / 2));
    if (mid === null) continue;
    const before = out.filter((p) => p.t < mid).length;
    const prev = out[before - 1];
    const next = out[before];
    if (prev === undefined || next === undefined || prev.v === null || next.t === mid) continue;
    out.splice(before, 0, { t: mid, v: null });
  }
  return out;
}

function simulatedSegment(env: ExecEnv, points: readonly SeriesPoint[]): readonly ChartSegment[] {
  if (env === "live" || points.length === 0) return [];
  return [{ kind: "simulated", from: points[0].t, to: points[points.length - 1].t }];
}

/** The stage whose own path stands in for a book when its exact series is absent. */
export function stageOfEnv(env: ExecEnv, current: SpineStageId | null): SpineStageId {
  if (env === "paper") return "paper";
  if (env === "sandbox") return "sandbox";
  return current === "canary" ? "canary" : "live";
}

/**
 * One EquityPanel input per published series (one per currency or account:
 * partitions are never merged). `payload` is the exact-decimal chart read; the
 * book's own stage-drift path is the fallback, labelled as daily closes, and
 * `why` (the exact read's failure or emptiness) is printed with it.
 */
export function equityInputs(
  payload: FinancialChartPayload | null,
  drift: StageDrift | null,
  env: ExecEnv,
  current: SpineStageId | null = null,
  why: string | null = null,
): readonly EquityPanelInput[] {
  if (payload !== null && payload.series.length > 0) {
    const gaps = payload.coverage.gaps;
    const state: ChartState = payload.state === "READY" ? { kind: "ready" }
      : payload.state === "PARTIAL" ? { kind: "partial", reason: payload.reasonCode ? humanize(payload.reasonCode) : "The source marked this series partial." }
      : { kind: "stale", reason: payload.reasonCode ? humanize(payload.reasonCode) : `The source marked this series ${payload.state.toLowerCase()}.` };
    return payload.series.slice(0, 4).map((series, index): EquityPanelInput => {
      const raw: SeriesPoint[] = series.points.flatMap(([t, v]) => {
        const at = epoch(t);
        return at === null ? [] : [{ t: at, v }];
      });
      const points = withGaps(raw, gaps);
      return {
        key: `${series.id}:${index}`,
        label: series.label,
        currency: series.currency,
        points,
        state,
        segments: simulatedSegment(env, points),
        gapCount: gaps.length,
        basis: payload.sampling?.algorithm ? `${humanize(payload.sampling.algorithm)}` : "Published equity",
      };
    });
  }
  const stage = stageOfEnv(env, current);
  const path = stagePath(drift, stage);
  if (path !== null && path.points.some((p) => p.v !== null)) {
    return [{
      key: `drift:${path.stage}:${env}`,
      label: stageWord(stage),
      currency: null,
      points: path.points,
      state: {
        kind: "partial",
        reason: `${why ? `${why} ` : ""}Daily closes from the stage-drift read. Its values arrive as JSON numbers, not exact decimal strings.`,
      },
      segments: simulatedSegment(env, path.points),
      gapCount: path.gapDays,
      basis: "Daily close",
    }];
  }
  return [];
}

/* ── stage drift ──────────────────────────────────────────────────────────── */

export interface StagePath {
  stage: "paper" | "sandbox" | "live";
  deployed: boolean;
  reason: string | null;
  /** Calendar days that carry a published close (not the days in the stage). */
  closes: number;
  /** Calendar days inside the window with no published close. */
  gapDays: number;
  values: readonly (string | null)[];
  points: readonly SeriesPoint[];
  first: UtcEpochMs | null;
  last: UtcEpochMs | null;
}

const DRIFT_STAGES = ["paper", "sandbox", "live"] as const;

const DRIFT_REASON: Readonly<Record<string, string>> = {
  NO_DEPLOYMENT_IN_STAGE: "No deployment in this stage",
  NO_EQUITY_IN_WINDOW: "Deployed, but no equity was published in the window",
  HISTORY_MIRROR_NOT_AVAILABLE: "The history mirror is not available",
};

function dayEpoch(day: string): UtcEpochMs | null {
  const ms = Date.parse(`${day}T00:00:00Z`);
  return Number.isNaN(ms) ? null : epoch(ms);
}

export function stagePath(drift: StageDrift | null, stage: SpineStageId): StagePath | null {
  const key = stage === "canary" ? "live" : stage;
  if (drift === null || (key !== "paper" && key !== "sandbox" && key !== "live")) return null;
  const entry = drift.stages[key];
  if (entry === undefined) return null;
  const values = entry.series.map(numberToDecimal);
  const points: SeriesPoint[] = [];
  drift.calendar.forEach((day, i) => {
    const at = dayEpoch(day);
    if (at !== null && i < values.length) points.push({ t: at, v: values[i] });
  });
  const drawn = points.filter((p) => p.v !== null);
  const firstIdx = points.findIndex((p) => p.v !== null);
  const lastIdx = points.length - 1 - [...points].reverse().findIndex((p) => p.v !== null);
  // A gap is an empty close between two published ones; leading and trailing empties are "not in the stage".
  const gapDays = firstIdx < 0 ? 0 : points.slice(firstIdx, lastIdx + 1).filter((p) => p.v === null).length;
  return {
    stage: key,
    deployed: entry.deployed,
    reason: entry.reasonCode === null ? null : DRIFT_REASON[entry.reasonCode] ?? humanize(entry.reasonCode),
    closes: drawn.length,
    gapDays,
    values,
    points,
    first: drawn[0]?.t ?? null,
    last: drawn[drawn.length - 1]?.t ?? null,
  };
}

export function stagePaths(drift: StageDrift | null): readonly StagePath[] {
  return DRIFT_STAGES.flatMap((stage) => {
    const path = stagePath(drift, stage);
    return path === null ? [] : [path];
  });
}

/** Stage presence on the time axis: where each stage published a close. Hatch, outline and solid, never colour alone. */
export function stageBands(paths: readonly StagePath[]): readonly StageBand[] {
  return paths.flatMap((path): StageBand[] => {
    if (path.first === null || path.last === null || path.first === path.last) return [];
    return [{ id: path.stage, kind: path.stage, label: stageWord(path.stage), from: path.first, to: path.last }];
  });
}

/* ── orders and fills ─────────────────────────────────────────────────────── */

const WORKING = ["NEW", "WORKING", "INITIALIZED", "SUBMITTED", "ACCEPTED", "PENDING_UPDATE", "PENDING_CANCEL", "TRIGGERED"];

export function orderFlag(status: string | null): { kind: FlagKind; label: string } {
  const word = (status ?? "").toUpperCase();
  if (word === "FILLED") return { kind: "applied", label: "Filled" };
  if (word === "PARTIALLY_FILLED") return { kind: "partial", label: "Partially filled" };
  if (WORKING.includes(word)) return { kind: "operation", label: "Working" };
  if (word.includes("REJECT") || word.includes("DENIED")) return { kind: "rejected", label: "Rejected" };
  if (word.startsWith("CANCEL") || word === "EXPIRED") return { kind: "paused", label: humanize(word.startsWith("CANCEL") ? "cancelled" : word) };
  if (word === "" || word === "UNKNOWN") return { kind: "unknown", label: "Unknown" };
  return { kind: "unknown", label: humanize(word) };
}

export interface OrderCounts {
  loaded: number;
  working: number;
  rejected: number;
  unknown: number;
}

/** Counts of the rows loaded, not of the population: the caption says so. */
export function loadedOrderCounts(orders: readonly ReplayOrder[]): OrderCounts {
  let working = 0;
  let rejected = 0;
  let unknown = 0;
  for (const o of orders) {
    const kind = orderFlag(o.status).kind;
    if (kind === "operation" || kind === "partial") working += 1;
    else if (kind === "rejected") rejected += 1;
    else if (kind === "unknown") unknown += 1;
  }
  return { loaded: orders.length, working, rejected, unknown };
}

/** `focus=order:<id>` to the order id it names; `fill:<id>` to its fill. */
export function focusTarget(focus: string | null): { kind: "order" | "fill"; id: string } | null {
  if (focus === null) return null;
  const match = /^(order|fill):(\S{1,128})$/.exec(focus);
  return match === null ? null : { kind: match[1] === "fill" ? "fill" : "order", id: match[2] };
}

export const replayHref = (alphaId: string, focus: string): string =>
  `/deployments/alphas/${encodeURIComponent(alphaId)}?tab=replay&focus=${encodeURIComponent(focus)}`;

/** The fill ids behind an order, by client order id (the join the replay itself uses). */
export function fillsOfOrder(order: ReplayOrder, fills: readonly ReplayFill[]): readonly ReplayFill[] {
  return order.clientOrderId === null ? [] : fills.filter((f) => f.clientOrderId === order.clientOrderId);
}

/* ── observed timeline ────────────────────────────────────────────────────── */

export interface FeedKind { kind: FlagKind; label: string }

const FEED_KIND: Readonly<Record<string, FeedKind>> = {
  ORDER_OBSERVED: { kind: "operation", label: "Order" },
  FILL_OBSERVED: { kind: "applied", label: "Fill" },
  SESSION_OBSERVED: { kind: "display", label: "Session" },
  COMMAND_JOURNAL_ROW_OBSERVED: { kind: "paused", label: "Command" },
};

export const feedKind = (type: string): FeedKind => FEED_KIND[type] ?? { kind: "neutral", label: humanize(type.replace(/_OBSERVED$/, "")) };

/** Only the command journal maps to a ribbon lane; order, fill and session rows stay in the feed. */
export function ribbonEvents(entries: readonly ObservedEntry[]): readonly ChartEvent[] {
  return entries.flatMap((entry): ChartEvent[] => {
    if (entry.observationType !== "COMMAND_JOURNAL_ROW_OBSERVED") return [];
    const at = epoch(entry.observedAtMs);
    return at === null ? [] : [{ id: entry.key, t: at, kind: "decision", title: "Command journal row", detail: entry.record.id }];
  });
}

export function timelineEntries(timeline: ObservedTimeline | null): readonly ObservedEntry[] {
  return timeline === null ? [] : timeline.timeline.entries;
}

/* ── positions and reconciliation (resource rows) ─────────────────────────── */

export interface PositionRow {
  key: string;
  symbol: string;
  side: string | null;
  accountId: string | null;
  quantity: string | null;
  entry: string | null;
  mark: string | null;
  unrealized: string | null;
  notional: string | null;
  currency: string | null;
}

const str = (value: unknown): string | null => (typeof value === "string" && value.length > 0 ? value : null);

export function positionRows(rows: readonly Record<string, unknown>[] | undefined): readonly PositionRow[] {
  return (rows ?? []).flatMap((row, index): PositionRow[] => {
    const symbol = str(row.symbol) ?? str(row.instrument_id)?.split(".")[0] ?? null;
    if (symbol === null) return [];
    const side = str(row.position_side) ?? str(row.side);
    return [{
      key: str(row.position_id) ?? `${symbol}:${side ?? "net"}:${index}`,
      symbol,
      side: side === null ? null : humanize(side),
      accountId: str(row.account_id),
      quantity: str(row.quantity),
      entry: str(row.avg_px_open),
      mark: str(row.mark_price),
      unrealized: str(row.unrealized_pnl),
      notional: str(row.notional),
      currency: str(row.currency),
    }];
  });
}

export interface ReconRow {
  key: string;
  venue: string | null;
  kind: string;
  status: { kind: FlagKind; label: string };
  resolvedAt: UtcEpochMs | null;
}

export function reconciliationRows(rows: readonly Record<string, unknown>[] | undefined): readonly ReconRow[] {
  return (rows ?? []).flatMap((row, index): ReconRow[] => {
    const status = (str(row.status) ?? "").toUpperCase();
    const resolved = typeof row.resolved_at === "string" ? Date.parse(row.resolved_at) : NaN;
    return [{
      key: str(row.finding_id) ?? `finding:${index}`,
      venue: str(row.venue),
      kind: humanize(str(row.finding_type) ?? "finding"),
      status: status === "RESOLVED" ? { kind: "applied", label: "Resolved" }
        : status === "OPEN" ? { kind: "attention", label: "Open" }
        : status === "" ? { kind: "unknown", label: "Unknown" }
        : { kind: "unknown", label: humanize(status) },
      resolvedAt: Number.isNaN(resolved) ? null : epoch(resolved),
    }];
  });
}
