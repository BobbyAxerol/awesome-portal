/**
 * Alpha 360 across the two bodies the one route can answer (UXM-07 R-3).
 *
 * `GET /resources/alphas/{id}` answers `execution.alpha-resource.v1` in a LEGACY_COMPATIBILITY workspace and
 * `execution.alpha-resource.v2` in a SCOPED_V2 one. The screen draws the same sections from either, so it reads a single
 * `AlphaView`, built here from whichever body arrived:
 *
 * - `legacy`: the V1 `AlphaFleetItem` and envelope, through the existing model functions (nothing about the V1 view changes);
 * - `scoped`: AUTHORIZED RETAINED RAW FACTS. The body carries no alpha label, version, owner, stage, health or money total;
 *   each is a typed absence here (`Not published (FE-xxx)` on the screen, with the reason), never read from a neighbouring
 *   member. Money is the one place the body gives a reason, `SCOPED_RAW_FACTS_ONLY_NO_IMPLIED_TOTALS`, and nothing below sums a
 *   row to get around it. A relation row is shown exactly as stated; a deployment's allocation is the one published
 *   `allocated_capital` row of that deployment, and absent when there are none or several.
 *
 * Pure: nothing fetches. The census of what each variant publishes and what this view consumes is in
 * `evidence/UXM-07/consumer-receipt-alpha-scoped-2026-10-20.md`.
 */
import { marketVenueOf, type MarketVenue } from "../../../api/marketCandles";
import { readAlphaFleetItem, type AlphaFleetItem, type ProfileEnvelope } from "../../../api/profileRead";
import { SPINE_STAGE_IDS, type SpineStageId } from "../../blocks";
import {
  BOUNDED_REASON,
  NO_TOTALS_REASON,
  cellDecimal,
  cellText,
  type AlphaResourceScoped,
  type ScopedEnvironment,
  type ScopedRow,
} from "../../readers/alphaResourceScoped";
import type { ExecEnv } from "../../urlState";
import {
  UNNAMED_ALPHA,
  alphaName,
  alphaTitle,
  alphaTitleWithVersion,
  alphaVersion,
  chooseEnv,
  currentStageOf,
  deployedEnvs,
  deploymentHref,
  deploymentRows,
  envOfStage,
  humanize,
  positionRows,
  reconciliationRows,
  runtimeOfState,
  spineStageOf,
  type DeploymentRow,
  type PositionRow,
  type ReconRow,
} from "./model";

/** What the resource hook hands the screen once a read has landed (an unreadable body is an error read instead). */
export type AlphaResource =
  | { variant: "legacy"; envelope: ProfileEnvelope; item: AlphaFleetItem | null }
  | { variant: "scoped"; scoped: AlphaResourceScoped };

/** The legacy resource from its envelope, exactly as the V1 hook built it. */
export const legacyResource = (envelope: ProfileEnvelope): AlphaResource => ({
  variant: "legacy",
  envelope,
  item: readAlphaFleetItem(envelope.objects.alpha),
});

export interface MoneyFigure { currency: string; value: string }

/** The stated authority of a scoped read, as the contract words it. Nothing here is inferred. */
export interface ScopeLabel {
  workspaceId: string;
  deliveryProfile: string;
  /** `SCOPED` / `AUTHORIZED_ONLY` / `VISIBLE_ROWS_ONLY` / not a full portfolio / completeness. */
  visibility: "SCOPED";
  coverage: "AUTHORIZED_ONLY";
  totalsScope: "VISIBLE_ROWS_ONLY";
  isFullPortfolio: false;
  completeness: "PARTIAL";
  readScope: readonly { book: ScopedEnvironment; policyRevision: string | null }[];
  /** Per relation: rows returned against the source's own total (a string, or `null` when it states none). */
  population: readonly { relation: string; returned: number; sourceTotal: string | null; state: string; reasonCode: string | null }[];
  actor: string;
}

export type OwnerCell = { kind: "value"; value: string } | { kind: "not-available" } | { kind: "not-published"; id: "FE-030"; reason: string };

export interface AlphaView {
  variant: "legacy" | "scoped";
  alphaId: string;
  /** The alpha is in the read (legacy: an alpha row; scoped: the body names the resource and is not empty). */
  present: boolean;
  title: string;
  titleWithVersion: string;
  name: string | null;
  version: string | null;
  /** Shown on the absent name / version (`title`), per variant. */
  nameReason: string;
  versionReason: string;
  owner: OwnerCell;
  portfolioNames: readonly string[];
  current: SpineStageId | null;
  /** Why there is no current stage (scoped only); the legacy line stays as it was. */
  currentNote: string | null;
  rows: readonly DeploymentRow[];
  envs: readonly ExecEnv[];
  /** Per-currency money the body states; `null` + a reason when it states none. */
  money: { published: true; netPnl: readonly MoneyFigure[]; exposure: readonly MoneyFigure[] } | { published: false; reason: string };
  positions: readonly PositionRow[];
  reconciliation: readonly ReconRow[];
  /** Rows the body carried that could not be placed (no id): said, never dropped silently. */
  unplaced: { deployments: number; positions: number };
  state: string;
  freshness: string | null;
  completeness: string | null;
  asOfMs: number | null;
  workspaceId: string | null;
  scope: ScopeLabel | null;
  /** Set when the response is the bounded shape: the relation rows are not in it. */
  withheld: string | null;
  venueOf(env: ExecEnv): MarketVenue | null;
}

/* ── legacy ───────────────────────────────────────────────────────────────── */

function legacyView(envelope: ProfileEnvelope, item: AlphaFleetItem | null, alphaId: string): AlphaView {
  const rows = deploymentRows(item);
  return {
    variant: "legacy",
    alphaId,
    present: item !== null,
    title: alphaTitle(item, alphaId),
    titleWithVersion: alphaTitleWithVersion(item, alphaId),
    name: alphaName(item),
    version: alphaVersion(item),
    nameReason: "ALPHA_NAME_NOT_PUBLISHED",
    versionReason: "UNVERSIONED",
    owner: item?.owner ? { kind: "value", value: item.owner } : { kind: "not-available" },
    portfolioNames: item?.portfolios.map((p) => p.name) ?? [],
    current: item === null ? null : currentStageOf(item),
    currentNote: null,
    rows,
    envs: deployedEnvs(item),
    money: {
      published: true,
      netPnl: item?.positionPnl.map((p) => ({ currency: p.currency, value: p.net })) ?? [],
      exposure: item?.exposure.map((e) => ({ currency: e.currency, value: e.value })) ?? [],
    },
    positions: positionRows(envelope.data.positions),
    reconciliation: reconciliationRows(envelope.data.reconciliation),
    unplaced: { deployments: 0, positions: 0 },
    state: envelope.state,
    freshness: envelope.freshness,
    completeness: envelope.completeness,
    asOfMs: envelope.asOfMs,
    workspaceId: envelope.workspaceId,
    scope: null,
    withheld: null,
    // The same walk as the replay's `venueOf(item, env)`: the first deployment in the book whose venue the Portal can read klines from.
    venueOf: (env) => {
      if (item === null) return null;
      for (const d of item.deployments) {
        if (envOfStage(spineStageOf(d.stage)) !== env) continue;
        const venue = marketVenueOf(d.venue);
        if (venue !== null) return venue;
      }
      return null;
    },
  };
}

/* ── scoped ───────────────────────────────────────────────────────────────── */

const STAGE_OF_BOOK: Readonly<Record<ScopedEnvironment, SpineStageId | null>> = { paper: "paper", sandbox: "sandbox", live: null };
const BOOK_WORD: Readonly<Record<ScopedEnvironment, string>> = { paper: "Paper", sandbox: "Sandbox", live: "Live book" };
const RANK: Readonly<Record<ScopedEnvironment, number>> = {
  paper: SPINE_STAGE_IDS.indexOf("paper"),
  sandbox: SPINE_STAGE_IDS.indexOf("sandbox"),
  live: SPINE_STAGE_IDS.indexOf("canary"),
};

const rowsOf = (scoped: AlphaResourceScoped, relation: keyof NonNullable<AlphaResourceScoped["rows"]>): readonly ScopedRow[] => scoped.rows?.[relation] ?? [];

/** Names by portfolio id: the `portfolios` relation first, then the summary's own list. A name is only ever a stated name. */
function portfolioNames(scoped: AlphaResourceScoped): ReadonlyMap<string, string> {
  const names = new Map<string, string>();
  for (const p of scoped.summary?.portfolios ?? []) {
    const name = p.displayName ?? p.name;
    if (p.portfolioId !== null && name !== null) names.set(p.portfolioId, name);
  }
  for (const row of rowsOf(scoped, "portfolios")) {
    const id = cellText(row, "portfolio_id");
    const name = cellText(row, "name");
    if (id !== null && name !== null) names.set(id, name);
  }
  return names;
}

/** The deployment's allocation: the one stated `allocated_capital` row of its own `deployment_id`; none or several is absent. */
function allocationOf(scoped: AlphaResourceScoped, deploymentId: string): string | null {
  const mine = rowsOf(scoped, "portfolio_allocations").filter((r) => cellText(r, "deployment_id") === deploymentId);
  return mine.length === 1 ? cellDecimal(mine[0], "allocated_capital") : null;
}

function scopedDeploymentRows(scoped: AlphaResourceScoped): { rows: DeploymentRow[]; unplaced: number } {
  const names = portfolioNames(scoped);
  let unplaced = 0;
  const rows: DeploymentRow[] = [];
  const seen = new Set<string>();
  for (const row of rowsOf(scoped, "deployments")) {
    const id = cellText(row, "deployment_id");
    if (id === null || seen.has(`${row.book}:${id}`)) { unplaced += 1; continue; }
    seen.add(`${row.book}:${id}`);
    const stage = STAGE_OF_BOOK[row.book];
    const portfolioId = cellText(row, "portfolio_id");
    rows.push({
      id,
      stage,
      stageLabel: BOOK_WORD[row.book],
      accountId: cellText(row, "account_id"),
      portfolio: portfolioId === null ? null : (names.get(portfolioId) ?? portfolioId),
      venue: cellText(row, "venue"),
      runtime: runtimeOfState(cellText(row, "state")),
      currency: cellText(row, "currency"),
      allocation: allocationOf(scoped, id),
      netPnl: null,
      exposure: null,
      health: null,
      href: deploymentHref(stage, id),
      rank: RANK[row.book],
      env: row.book,
    });
  }
  return { rows: rows.sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id)), unplaced };
}

/** A position exactly as the body states it: the instrument id is not split, the side is its own word. */
function scopedPositionRows(scoped: AlphaResourceScoped): { rows: PositionRow[]; unplaced: number } {
  let unplaced = 0;
  const rows: PositionRow[] = [];
  scoped.rows?.positions.forEach((row, index) => {
    const instrument = cellText(row, "instrument_id");
    if (instrument === null) { unplaced += 1; return; }
    const side = cellText(row, "side");
    rows.push({
      key: cellText(row, "position_id") ?? `${row.book}:${instrument}:${side ?? "net"}:${index}`,
      symbol: instrument,
      side: side === null ? null : humanize(side),
      accountId: cellText(row, "account_id"),
      quantity: cellDecimal(row, "quantity"),
      entry: cellDecimal(row, "avg_px_open"),
      mark: cellDecimal(row, "mark_price"),
      unrealized: cellDecimal(row, "unrealized_pnl"),
      notional: cellDecimal(row, "notional"),
      currency: null,
    });
  });
  return { rows, unplaced };
}

/** A reconciliation row has `status`, `venue`, `account_id`, a created stamp: no finding id, type or resolution time. */
function scopedReconciliationRows(scoped: AlphaResourceScoped): ReconRow[] {
  return (scoped.rows?.reconciliation ?? []).map((row, index): ReconRow => {
    const status = (cellText(row, "status") ?? "").toUpperCase();
    return {
      key: `${row.book}:finding:${index}`,
      venue: cellText(row, "venue"),
      kind: null,
      status: status === "RESOLVED" ? { kind: "applied", label: "Resolved" }
        : status === "OPEN" ? { kind: "attention", label: "Open" }
        : status === "" ? { kind: "unknown", label: "Not published" }
        : { kind: "unknown", label: humanize(status) },
      resolvedAt: null,
    };
  });
}

function scopeLabelOf(scoped: AlphaResourceScoped): ScopeLabel {
  return {
    workspaceId: scoped.workspaceId,
    deliveryProfile: scoped.deliveryProfile,
    visibility: scoped.authority.visibility,
    coverage: scoped.authority.coverage,
    totalsScope: scoped.authority.totalsScope,
    isFullPortfolio: scoped.authority.isFullPortfolio,
    completeness: scoped.completeness,
    readScope: scoped.authority.readScope,
    population: Object.values(scoped.panels)
      .filter((p) => p.name !== "broker_sync")
      .map((p) => ({ relation: p.name, returned: p.returnedCount, sourceTotal: p.sourceTotal, state: p.state, reasonCode: p.reasonCode })),
    actor: scoped.actor.username,
  };
}

function scopedView(scoped: AlphaResourceScoped, alphaId: string): AlphaView {
  const id = scoped.resource.id;
  const published = scoped.summary?.displayName ?? scoped.summary?.name ?? (scoped.resource.label !== UNNAMED_ALPHA ? scoped.resource.label : null);
  const name = published ?? null;
  const placed = scopedDeploymentRows(scoped);
  const positions = scopedPositionRows(scoped);
  const names = [...new Set([...portfolioNames(scoped).values()])];
  const bounded = scoped.shape === "bounded";
  const rows = placed.rows;
  return {
    variant: "scoped",
    alphaId: id,
    present: scoped.shape !== "empty" && scoped.state !== "empty",
    title: name ?? id ?? alphaId,
    titleWithVersion: name ?? id ?? alphaId,
    name,
    version: null,
    nameReason: "execution.alpha-resource.v2 states no alpha name",
    versionReason: "execution.alpha-resource.v2 states no alpha version",
    owner: { kind: "not-published", id: "FE-030", reason: "execution.alpha-resource.v2 states no owner" },
    portfolioNames: names,
    current: null,
    currentNote: "The scoped body carries no alpha-level stage; it states each deployment's book only.",
    rows,
    envs: (["live", "paper", "sandbox"] as const).filter((env) => rows.some((r) => r.env === env)),
    money: { published: false, reason: scoped.summary?.financialSummary.reasonCode ?? NO_TOTALS_REASON },
    positions: positions.rows,
    reconciliation: scopedReconciliationRows(scoped),
    unplaced: { deployments: placed.unplaced, positions: positions.unplaced },
    state: scoped.state,
    freshness: scoped.freshness,
    completeness: scoped.completeness,
    asOfMs: null,
    workspaceId: scoped.workspaceId,
    scope: scopeLabelOf(scoped),
    withheld: bounded ? (scoped.bounded?.reasonCode ?? BOUNDED_REASON) : null,
    venueOf: (env) => {
      for (const row of rows) {
        if (row.env !== env) continue;
        const venue = marketVenueOf(row.venue);
        if (venue !== null) return venue;
      }
      return null;
    },
  };
}

/** The view of whichever body arrived. `alphaId` is the one the URL named. */
export function alphaViewOf(resource: AlphaResource, alphaId: string): AlphaView {
  return resource.variant === "legacy" ? legacyView(resource.envelope, resource.item, alphaId) : scopedView(resource.scoped, alphaId);
}

/** The book a deployment row sits in (`env` on a scoped row, the stage's book on a legacy one). */
export function rowEnv(row: DeploymentRow): ExecEnv | null {
  if (row.env !== undefined) return row.env;
  switch (row.stage) {
    case "paper": return "paper";
    case "sandbox": return "sandbox";
    case "canary":
    case "live": return "live";
    default: return null;
  }
}

/** The book to read, from the view: the URL's `env` wins when the alpha is deployed there (same rule as `chooseEnv`). */
export const viewEnv = (requested: ExecEnv, view: AlphaView | null): ExecEnv => chooseEnv(requested, view?.envs ?? []);

