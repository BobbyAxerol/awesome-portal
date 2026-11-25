/**
 * Fleet identity model (UXM-07 S1a): what `GET /alphas` (execution.alpha-fleet-list.v2)
 * publishes about WHO an alpha is, turned into what the table prints.
 *
 * Identity only. The money columns of the same row (allocations, balances,
 * position PnL, exposure) and the metric availability map are never read here:
 * they are not part of this slice, and a number that is not drawn cannot be
 * drawn wrong.
 *
 * Pure functions, no React. The three facts a reader must be able to trust:
 * - a stage word comes from the published stage, never from the label;
 * - a lens is a set of stages, and the server filters one stage at a time, so
 *   a lens spanning two stages is narrowed here and says so (see
 *   `serverStageParam`);
 * - nothing the read did not publish is invented: a missing owner is absent,
 *   the readiness x/7 and the archive list are named as not published.
 */
import type { AlphaFleetQuery } from "../../../api/ports";
import type { AlphaFleetItem, AlphaFleetSummary } from "../../../api/profileRead";
import type { FlagKind } from "../../flagKinds";
import { EXEC_STAGES, type ExecStage } from "../../urlState";

/* ── what the backend has not published (FRONTEND_BACKEND_SYNC.md) ─────── */

export const NOT_PUBLISHED = "Not published";
export interface UnpublishedFact { fe: string; what: string }
export const FE = {
  group: { fe: "FE-012", what: "Group by" },
  board: { fe: "FE-012, FE-027", what: "Board" },
  map: { fe: "FE-035", what: "Map" },
  readiness: { fe: "FE-027, FE-028", what: "Readiness" },
  window: { fe: "FE-025", what: "Window" },
  compare: { fe: "FE-033", what: "Compare" },
  archived: { fe: "FE-034", what: "Archived list" },
} as const satisfies Record<string, UnpublishedFact>;

export const notPublished = (fact: UnpublishedFact): string => `${NOT_PUBLISHED}: ${fact.what.toLowerCase()}`;

/* ── lenses ────────────────────────────────────────────────────────────── */

export type FleetLens = "all" | "real" | "sandbox" | "paper" | "archived";

export interface LensSpec { id: FleetLens; label: string; stages: readonly ExecStage[] }

/**
 * Real-funded is the one domain that holds the Canary and Live stages
 * (design D2); Sandbox and Paper are simulated. The URL keeps the stage words
 * (`stage=canary,live`), so a lens is a named set of them, not a new param.
 */
export const FLEET_LENSES: readonly LensSpec[] = [
  { id: "all", label: "All", stages: [] },
  { id: "real", label: "Real-funded", stages: ["canary", "live"] },
  { id: "sandbox", label: "Sandbox", stages: ["sandbox"] },
  { id: "paper", label: "Paper", stages: ["paper"] },
  { id: "archived", label: "Archived", stages: [] },
];

export const ARCHIVED_TAB = "archived";

export function lensForStages(stages: readonly ExecStage[]): FleetLens | null {
  if (stages.length === 0) return "all";
  const key = EXEC_STAGES.filter((s) => stages.includes(s)).join(",");
  return FLEET_LENSES.find((l) => l.id !== "all" && l.id !== "archived" && l.stages.join(",") === key)?.id ?? null;
}

export function stagesForLens(lens: FleetLens): readonly ExecStage[] {
  return FLEET_LENSES.find((l) => l.id === lens)?.stages ?? [];
}

export const lensLabel = (lens: FleetLens): string => FLEET_LENSES.find((l) => l.id === lens)?.label ?? lens;

/* ── words ─────────────────────────────────────────────────────────────── */

const STAGE_LABEL: Readonly<Record<string, string>> = {
  RESEARCH: "Research", PAPER: "Paper", SANDBOX: "Sandbox", CANARY: "Canary", LIVE: "Live",
};

/** `SOURCE_LATEST_WINDOW` becomes `Source latest window`; the code stays on the title. */
export function humanize(code: string): string {
  const words = code.trim().toLowerCase().replace(/[_\s]+/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export const stageLabel = (code: string): string => STAGE_LABEL[code.toUpperCase()] ?? humanize(code);

export interface HealthView { kind: FlagKind; label: string }

/**
 * Alpha health is READY / ATTENTION / RESEARCH_ONLY; a deployment adds FINDING.
 * An unknown word is `unknown` with its own text, never `ok`; the enum is
 * matched exactly, so `ready` is not `READY`.
 */
export function healthView(health: string): HealthView {
  switch (health) {
    case "READY": return { kind: "ok", label: "Ready" };
    case "ATTENTION": return { kind: "attention", label: "Needs attention" };
    case "FINDING": return { kind: "attention", label: "Finding open" };
    case "RESEARCH_ONLY": return { kind: "neutral", label: "Research only" };
    default: return { kind: "unknown", label: humanize(health) };
  }
}

const HEALTH_RANK: Readonly<Record<string, number>> = { READY: 0, FINDING: 1, ATTENTION: 2 };
/** Unknown words rank with FINDING: worse than ready, and not hidden under it. */
const healthRank = (health: string): number => HEALTH_RANK[health] ?? 1;

/* ── rows ──────────────────────────────────────────────────────────────── */

export interface FleetDeploymentView {
  id: string;
  stage: string;
  venue: string;
  state: string;
  health: HealthView;
  portfolio: string | null;
}

/**
 * One money column of a fleet-read row (`GET /alphas`): the per-currency figures the register states, or the typed
 * reason there are none. Never summed across currencies, never a 0 for a missing figure. These are Source-reported
 * values, not Manager-dataset (TS-qualified) ones: the dataset table, when it is published, wins over them.
 */
export type FleetMoney =
  | { state: "reported"; lines: readonly { currency: string; value: string; detail: string | null }[] }
  | { state: "absent"; reason: string | null };

export interface FleetRow {
  key: string;
  alphaId: string;
  label: string;
  version: string;
  owner: string | null;
  portfolios: readonly string[];
  /** The highest stage the alpha is in, as published. */
  stageCode: string;
  stage: string;
  /** Every stage word the alpha is in, highest first; includes `stage`. */
  stageCodes: readonly string[];
  otherStages: readonly string[];
  health: HealthView;
  healthCode: string;
  /** Why the 30-day equity series is not available, as the register states it (`metrics_availability.equity_series_30d`). */
  equityReason: string | null;
  /** Allocation per currency (`allocations`), as the register reports it. */
  allocation: FleetMoney;
  /** Current position Net PnL per currency (`position_pnl.net`): cumulative, not a 7D/30D window. */
  netPnl: FleetMoney;
  /** Account balance per currency (`balances.total`): a balance, not equity. */
  balance: FleetMoney;
  attention: readonly { code: string; label: string }[];
  deployments: { count: number; worst: HealthView | null; items: readonly FleetDeploymentView[] };
  updatedAt: string;
}

/** The V1 route, kept: the Alpha 360 of this alpha. */
export const alphaHref = (alphaId: string): string => `/deployments/alphas/${encodeURIComponent(alphaId)}`;

function moneyOf<T>(
  rows: readonly T[], availability: { state: string; reasonCode: string | null } | undefined,
  line: (row: T) => { currency: string; value: string; detail: string | null },
): FleetMoney {
  // The register's own word wins: a metric it says is unavailable is a typed absence even if a list is present.
  if (availability !== undefined && availability.state !== "AVAILABLE") return { state: "absent", reason: availability.reasonCode ?? availability.state };
  if (rows.length === 0) return { state: "absent", reason: availability === undefined ? null : "NO_FIGURE_IN_THE_READ" };
  return { state: "reported", lines: rows.map(line) };
}

export function toFleetRow(item: AlphaFleetItem): FleetRow {
  const stageCodes = item.stages.map((s) => s.toUpperCase());
  const stageCode = item.stage.toUpperCase();
  const worst = item.deployments.reduce<string | null>(
    (acc, d) => (acc === null || healthRank(d.health) > healthRank(acc) ? d.health : acc), null);
  return {
    key: item.alphaId,
    alphaId: item.alphaId,
    label: item.alphaLabel,
    version: item.version,
    owner: item.owner,
    portfolios: item.portfolios.map((p) => p.name),
    stageCode,
    stage: stageLabel(stageCode),
    stageCodes,
    otherStages: stageCodes.filter((s) => s !== stageCode).map(stageLabel),
    health: healthView(item.health),
    healthCode: item.health,
    equityReason: item.metricsAvailability.equity_series_30d?.reasonCode ?? null,
    // The allocation has no availability key of its own in the register: an empty list is "no figure", not 0.
    allocation: moneyOf(item.allocations, undefined, (a) => ({ currency: a.currency, value: a.value, detail: null })),
    netPnl: moneyOf(item.positionPnl, item.metricsAvailability.current_position_pnl,
      (p) => ({ currency: p.currency, value: p.net, detail: `realized ${p.realized}, unrealized ${p.unrealized}` })),
    balance: moneyOf(item.balances, item.metricsAvailability.account_balance,
      (b) => ({ currency: b.currency, value: b.total, detail: `free ${b.free}, locked ${b.locked}` })),
    attention: item.attentionReasons.map((code) => ({ code, label: humanize(code) })),
    deployments: {
      count: item.deployments.length,
      worst: worst === null ? null : healthView(worst),
      items: item.deployments.map((d) => ({
        id: d.deploymentId, stage: stageLabel(d.stage), venue: d.venue, state: humanize(d.state),
        health: healthView(d.health), portfolio: d.portfolioName,
      })),
    },
    updatedAt: item.updatedAt,
  };
}

/** True when the alpha is in any of the selected stages (empty selection keeps all). */
export function inStages(row: Pick<FleetRow, "stageCodes">, stages: readonly ExecStage[]): boolean {
  return stages.length === 0 || stages.some((s) => row.stageCodes.includes(s.toUpperCase()));
}

/* ── query ─────────────────────────────────────────────────────────────── */

export interface SortOption { id: string; label: string; value: string | null }

/** Fields `GET /alphas` sorts on; `null` is the server default and stays out of the URL. */
export const SORT_OPTIONS: readonly SortOption[] = [
  { id: "default", label: "Highest stage first", value: null },
  { id: "name", label: "Name, A to Z", value: "alpha_label:asc" },
  { id: "updated", label: "Recently updated", value: "updated_at:desc" },
  { id: "health", label: "Needs attention first", value: "health:asc" },
  { id: "stage-asc", label: "Lowest stage first", value: "stage_rank:asc" },
];

export const sortValueOf = (sort: string | null): string | null =>
  SORT_OPTIONS.find((o) => o.value !== null && o.value === sort)?.value ?? null;

/**
 * The server filters ONE stage (`stage_filter contains |X|`). A lens spanning
 * two stages therefore sends none and is narrowed on the loaded rows by
 * `inStages`; the screen prints that, it does not pretend the count is exact.
 */
export function serverStageParam(stages: readonly ExecStage[]): string | undefined {
  return stages.length === 1 ? stages[0]!.toUpperCase() : undefined;
}

export const PAGE_LIMIT = 50;
/** DOM budget for one screen (UXM-07 S1 scale card). */
export const ROW_CAP = 200;

export interface FleetFilters {
  q: string | null;
  stages: readonly ExecStage[];
  owner: string | null;
  health: string | null;
  sort: string | null;
}

export function fleetQuery(filters: FleetFilters, after?: string | null): AlphaFleetQuery {
  const query: AlphaFleetQuery = { limit: PAGE_LIMIT };
  if (filters.q) query.search = filters.q;
  const stage = serverStageParam(filters.stages);
  if (stage) query.stage = stage;
  if (filters.owner) query.owner = filters.owner;
  if (filters.health) query.health = filters.health;
  const sort = sortValueOf(filters.sort);
  if (sort) query.sort = sort;
  if (after) query.after = after;
  return query;
}

/** Stable identity of a query without its cursor: when it changes, the loaded pages are dropped. */
export const queryKey = (filters: FleetFilters): string => JSON.stringify(fleetQuery(filters));

/* ── summary: counts only ──────────────────────────────────────────────── */

export interface Kpi { id: string; label: string; value: number | null; note?: string }

/** The typed failure of the read the counts come from (status and the server's reason), or null when it did not fail. */
export interface CountsReadFailure { status: string; reason: string }

export function fleetKpis(summary: AlphaFleetSummary | null, failure: CountsReadFailure | null = null): readonly Kpi[] {
  const v = (n: number | undefined): number | null => (summary ? n ?? null : null);
  // A count with no summary because the read failed says why, in the server's own typed words (never an invented cause).
  const why = summary === null && failure !== null ? `Not read (${failure.status}): ${humanize(failure.reason)}` : undefined;
  return [
    { id: "alphas", label: "Alphas", value: v(summary?.alphaCount), note: why },
    { id: "deployments", label: "Deployments", value: v(summary?.deploymentCount), note: why },
    { id: "portfolios", label: "Portfolios", value: v(summary?.portfolioCount), note: why },
    { id: "attention", label: "Need attention", value: v(summary?.needsAttentionCount), note: why },
    // The design's two lifecycle tiles. The fleet summary carries neither count (UXM-07 audit: FE-027 readiness, FE-034 archive list), so they
    // are typed absences with their request ids, never a 0 and never a count derived from the loaded rows.
    { id: "exit-review", label: "Ready for exit review", value: null, note: notPublished({ fe: "FE-027", what: FE.readiness.what }) },
    { id: "archive", label: "Archive in progress", value: null, note: notPublished(FE.archived) },
    { id: "research", label: "Research only", value: v(summary?.researchOnlyCount), note: why },
  ];
}

export interface LensCount { text: string | null; approximate: boolean }

/** What a tab prints when the summary does not carry that stage: never a guessed zero (Rules 3.3). */
export const COUNT_NOT_AVAILABLE = "Not available";

/**
 * Tab counts from the summary, which covers every authorized alpha whatever
 * the filters. `stage_counts` counts alphas per stage they are in, so the
 * Real-funded sum can count an alpha in both Canary and Live twice: it is an
 * upper bound and printed with `~`. Archived has no count: it is not published.
 *
 * A stage the summary does not list is "Not available", not 0. The server's meaning is now fixed (FE-048, control-api
 * `fleetStageCounts`): a stage of a source environment it read COMPLETE is listed with its exact count, 0 included; a stage of an
 * environment it did not read, or read PARTIAL, is omitted and states nothing. So absence is exactly "not stated" and a listed 0
 * is a fact. Real-funded needs both Canary and Live, so it is not available when either is missing.
 */
export function lensCounts(summary: AlphaFleetSummary | null): Readonly<Record<FleetLens, LensCount>> {
  const none: LensCount = { text: null, approximate: false };
  if (!summary) return { all: none, real: none, sandbox: none, paper: none, archived: none };
  const missing: LensCount = { text: COUNT_NOT_AVAILABLE, approximate: false };
  const n = (stage: string): number | null => summary.stageCounts[stage] ?? null;
  const canary = n("CANARY");
  const live = n("LIVE");
  const sandbox = n("SANDBOX");
  const paper = n("PAPER");
  return {
    all: { text: String(summary.alphaCount), approximate: false },
    real: canary === null || live === null ? missing : { text: String(canary + live), approximate: canary > 0 && live > 0 },
    sandbox: sandbox === null ? missing : { text: String(sandbox), approximate: false },
    paper: paper === null ? missing : { text: String(paper), approximate: false },
    archived: none,
  };
}

/* ── board (HIFI modules/board.js, partial: loaded rows only) ──────────── */

/** The board's own gap: readiness and days in stage are not in the fleet read. */
export const BOARD_READINESS: UnpublishedFact = { fe: "FE-027", what: "Readiness" };

/**
 * The lanes, in HiFi order (design/hifi/v2/fleet.html `drawBoard`): the four financial stages (backend guide 6.2.1: `financial_stage` is
 * LIVE | CANARY | SANDBOX | PAPER). R1 and R2 are review gates of the lifecycle spine, not stages a deployed alpha runs in: a fleet row
 * never sits in one (BE-P4: an R1/R2 alpha has no deployment and no Manager row), so they are never lanes.
 */
const BOARD_LANES = [
  { code: "PAPER", label: "Paper" },
  { code: "SANDBOX", label: "Sandbox" },
  { code: "CANARY", label: "Canary" },
  { code: "LIVE", label: "Live" },
] as const;

export interface BoardColumn {
  /** The published stage word the column holds. */
  code: string;
  label: string;
  /** Loaded rows that are in this stage (membership: an alpha in two stages is in two lanes). */
  rows: readonly FleetRow[];
  /** The stage count the summary states (alphas in this stage, whatever the filters), or `COUNT_NOT_AVAILABLE`. */
  published: string;
}

/**
 * One lane per stage of the lens (all four on the All lens; Canary and Live on Real-funded; one on Sandbox or Paper), from rows already
 * loaded. A lane holds every loaded row that is IN that stage: the guide groups a stage as membership (section 8.2: "an alpha in several
 * stages may appear in several stage groups; group subtotals are not added to a global total"), so the board does not crown the highest
 * stage (backend guide 6.2.1: do not reduce the set to one badge). The lane count is therefore not an alpha count; the screen says
 * so. A lane with no loaded row is empty and prints the count the summary states, or "Not available" when it states none (the same D4
 * rule as `lensCounts`). A Research row, or a stage word the lanes do not know, gets its own lane ahead of / after the stage lanes
 * only on the All lens and only when a loaded row needs it, so no loaded row is dropped.
 */
export function boardColumns(rows: readonly FleetRow[], summary: AlphaFleetSummary | null, stages: readonly ExecStage[] = []): readonly BoardColumn[] {
  const published = (code: string): string => {
    const n = summary?.stageCounts[code];
    return n === undefined ? COUNT_NOT_AVAILABLE : String(n);
  };
  const wanted = stages.length === 0 ? BOARD_LANES : BOARD_LANES.filter((lane) => stages.some((stage) => stage.toUpperCase() === lane.code));
  const known = new Set<string>(BOARD_LANES.map((lane) => lane.code));
  const extra = stages.length > 0 ? [] : [...new Set(rows.flatMap((r) => r.stageCodes).filter((c) => !known.has(c)))].sort((a, b) => a.localeCompare(b));
  const research = extra.filter((c) => c === "RESEARCH");
  const other = extra.filter((c) => c !== "RESEARCH");
  const column = (code: string, label: string): BoardColumn => ({
    code, label, rows: rows.filter((r) => r.stageCodes.includes(code)), published: published(code),
  });
  return [
    ...research.map((c) => column(c, stageLabel(c))),
    ...wanted.map((lane) => column(lane.code, lane.label)),
    ...other.map((c) => column(c, stageLabel(c))),
  ];
}

/* ── columns popover (HIFI Columns menu) ───────────────────────────────── */

/** The columns a reader can switch off. Alpha is always shown, as in the HIFI. */
export const FLEET_COLUMNS = [
  { key: "owner", label: "Owner" },
  { key: "portfolios", label: "Portfolios" },
  { key: "stage", label: "Stage" },
  { key: "allocation", label: "Allocation" },
  { key: "pnl", label: "Net PnL" },
  { key: "equity", label: "Equity" },
  { key: "health", label: "Health" },
  { key: "deployments", label: "Deployments" },
] as const;

/**
 * Why each money column has no value (hi-fi keeps the column and prints "Not available" in each cell).
 * Allocation is published but its domain is not stated, so it is held back (never mix Real-funded and Simulated), and it has no FE request id.
 */
export const MONEY_COLUMN_WHY = {
  allocation: "The register publishes allocation per alpha as one list per currency but does not say whether that list spans Real-funded and Simulated books, so no figure is printed until the contract says (backend question BQ-FLEET-ALLOC).",
  pnl: `${NOT_PUBLISHED}: windowed Net PnL needs the window.`,
  equity: `${NOT_PUBLISHED}: the equity series is not published.`,
} as const;
/** The honest label under a fleet-read money figure: it is the register's own number, not a Manager-dataset (TS-qualified) one. */
export const SOURCE_REPORTED = "Source-reported, not TS-qualified";
/** What each fleet-read money figure is, so it is never read as a windowed or qualified figure. */
export const MONEY_FIGURE_BASIS = {
  allocation: `${SOURCE_REPORTED}. The register does not say whether it spans Real-funded and Simulated books.`,
  pnl: `${SOURCE_REPORTED}. Current position PnL, cumulative: not a 7D or 30D figure.`,
  balance: `${SOURCE_REPORTED}. Account balance, not equity.`,
} as const;
export type FleetColumnKey = (typeof FLEET_COLUMNS)[number]["key"];

/** The URL names the columns that are switched off, so the default (all on) leaves the URL clean. */
export const HIDDEN_COLUMNS_PARAM = "hide";

export function parseHiddenColumns(value: string | null): ReadonlySet<FleetColumnKey> {
  const known = new Set<string>(FLEET_COLUMNS.map((c) => c.key));
  return new Set((value ?? "").split(",").map((part) => part.trim()).filter((part): part is FleetColumnKey => known.has(part)));
}

export function serializeHiddenColumns(hidden: ReadonlySet<FleetColumnKey>): string | null {
  const keys = FLEET_COLUMNS.map((c) => c.key).filter((key) => hidden.has(key));
  return keys.length === 0 ? null : keys.join(",");
}

/** Columns the HIFI menu lists that need data the backend has not published: shown disabled, with the request id. */
export const UNPUBLISHED_COLUMNS: readonly { label: string; fact: UnpublishedFact }[] = [
  { label: "Readiness", fact: FE.readiness },
];
