/**
 * Portfolio 360 model (UXM-07 S2, flag key `portfolios`): what the EDS-04
 * portfolio resource (`GET /resources/portfolios/{id}`), the EDS-05 capital
 * derivation, the capital ledger, the EDS-07 equity chart and the correlation
 * read publish, turned into what the tabs print.
 *
 * Rules this file keeps:
 * - Every money figure is the published decimal STRING. Nothing is added,
 *   subtracted or converted here: not across accounts, not across currencies,
 *   not across environments. Where the server already summed (the capital
 *   derivation, `allocation_by_currency`), the model carries its string.
 * - A balance belongs to an ACCOUNT, which may serve other portfolios. It is
 *   shown as the account's, beside its row, and never as this portfolio's
 *   capital.
 * - Real-funded (`live`) and Simulated (`paper`, `sandbox`) are separate blocks
 *   everywhere; the model groups by environment and never merges two.
 * - A relation the resource did not carry is `null` / empty, and the tab says
 *   "Not available" or names the request. It is never an empty table.
 *
 * Pure functions, no React.
 */
import type { CapitalLedger, Correlation, LedgerBucket, LedgerEntry } from "../../../../analytics";
import { compareAbsDecimal, correlationAt } from "../../../../analytics";
import type { CurrencyValue, ProfileEnvelope } from "../../../../api/profileRead";
import type { CurrencyBucket, DerivationEnvelope, PortfolioCapitalData } from "../../../../api/derivations";
import type { FinancialChartPayload } from "../../../../api/financialChart";
import { readUtcEpochMs, type UtcEpochMs } from "../../../../screenDataContract";
import { readDecimal } from "../../../boundary";
import type { ChartEvent, ChartState, SeriesPoint, ServerEnvelope } from "../../../charts";
import type { FlagKind } from "../../../flagKinds";
import { domainOf, humanize, type Domain } from "../format";

type Row = Readonly<Record<string, unknown>>;

const text = (value: unknown): string | null => (typeof value === "string" && value.length > 0 ? value : null);
const rows = (value: unknown): readonly Row[] =>
  Array.isArray(value) ? value.filter((v): v is Row => typeof v === "object" && v !== null && !Array.isArray(v)) : [];

/** Rows read from a resource relation; an absent relation is an empty list, and `has` says which. */
function relation(resource: ProfileEnvelope, name: string): { rows: readonly Row[]; carried: boolean } {
  const list = resource.data[name];
  return { rows: list ?? [], carried: list !== undefined };
}

/* ── environments, stages, domain ──────────────────────────────────────── */

export const ENVIRONMENTS = ["live", "paper", "sandbox"] as const;
export type Environment = (typeof ENVIRONMENTS)[number];

export const isEnvironment = (value: string): value is Environment => (ENVIRONMENTS as readonly string[]).includes(value);

/** Live is the one Real-funded environment; paper and sandbox are Simulated. */
export const environmentDomain = (environment: Environment): "real" | "simulated" => (environment === "live" ? "real" : "simulated");

/** Environments the portfolio has a book in, in a fixed order, from the resource's own coverage. */
export function environmentsOf(resource: ProfileEnvelope, deployments: readonly DeploymentView[]): readonly Environment[] {
  const found = new Set<Environment>();
  const coverage = resource.objects.profile_coverage;
  if (coverage) {
    for (const [name, value] of Object.entries(coverage)) {
      const state = typeof value === "object" && value !== null ? text((value as Row).state) : null;
      if (isEnvironment(name) && state === "FOUND") found.add(name);
    }
  }
  for (const dep of deployments) if (dep.environment !== null) found.add(dep.environment);
  if (found.size === 0 && resource.selectedEnvironment !== null) found.add(resource.selectedEnvironment);
  return ENVIRONMENTS.filter((env) => found.has(env));
}

const stageEnvironment = (stage: string): Environment | null => {
  switch (stage.toUpperCase()) {
    case "LIVE": case "CANARY": return "live";
    case "PAPER": return "paper";
    case "SANDBOX": return "sandbox";
    default: return null;
  }
};

/* ── identity ──────────────────────────────────────────────────────────── */

export interface Identity {
  portfolioId: string;
  name: string;
  owner: string | null;
  baseCurrency: string | null;
  state: string | null;
  stateKind: FlagKind;
  stateLabel: string;
  /** The server-counted holdings, when it counted them. */
  holdingsCount: number | null;
  /** `allocation_by_currency` as the server summed it (one entry per currency). */
  allocationByCurrency: readonly CurrencyValue[];
}

function stateView(state: string | null): { kind: FlagKind; label: string } {
  switch ((state ?? "").toUpperCase()) {
    case "ACTIVE": return { kind: "ok", label: "Active" };
    case "PAUSED": case "SUSPENDED": return { kind: "paused", label: humanize(state ?? "") };
    case "": case "UNKNOWN": return { kind: "unknown", label: "Unknown" };
    default: return { kind: "neutral", label: humanize(state ?? "") };
  }
}

export function readIdentity(resource: ProfileEnvelope, portfolioId: string): Identity | null {
  const portfolio = resource.objects.portfolio;
  if (!portfolio) return null;
  const state = text(portfolio.state);
  const view = stateView(state);
  const base = text(portfolio.base_currency);
  const allocation = rows(portfolio.allocation_by_currency).flatMap((row) => {
    const currency = text(row.currency);
    const value = text(row.value);
    return currency !== null && value !== null ? [{ currency, value }] : [];
  });
  return {
    portfolioId: text(portfolio.portfolio_id) ?? portfolioId,
    name: text(portfolio.name) ?? portfolioId,
    owner: text(portfolio.owner),
    baseCurrency: base === null || base === "UNKNOWN" ? null : base,
    state,
    stateKind: view.kind,
    stateLabel: view.label,
    holdingsCount: typeof portfolio.holdings_count === "number" && Number.isSafeInteger(portfolio.holdings_count) ? portfolio.holdings_count : null,
    allocationByCurrency: allocation,
  };
}

/* ── deployments and alphas ────────────────────────────────────────────── */

export interface DeploymentView {
  deploymentId: string;
  strategyId: string | null;
  alphaLabel: string;
  version: string | null;
  owner: string | null;
  stage: string;
  stageLabel: string;
  environment: Environment | null;
  domain: Domain;
  venue: string | null;
  accountId: string | null;
  currency: string | null;
  allocation: string | null;
  /** Realised + unrealised on the deployment's open positions, as the server summed them. A current fact, not a window. */
  positionPnl: string | null;
  exposure: string | null;
  healthKind: FlagKind;
  healthLabel: string;
}

function healthView(health: string | null): { kind: FlagKind; label: string } {
  switch ((health ?? "").toUpperCase()) {
    case "READY": return { kind: "ok", label: "Ready" };
    case "ATTENTION": return { kind: "attention", label: "Needs attention" };
    case "FINDING": return { kind: "partial", label: "Finding open" };
    default: return { kind: "unknown", label: health ? humanize(health) : "Health not published" };
  }
}

export function readDeployments(resource: ProfileEnvelope): readonly DeploymentView[] {
  const fromData = relation(resource, "deployments").rows;
  const source = fromData.length > 0 ? fromData : rows(resource.objects.portfolio?.deployments);
  const strategies = relation(resource, "strategies").rows;
  const strategy = (id: string | null) => (id === null ? undefined : strategies.find((row) => text(row.strategy_id) === id || text(row.alpha_id) === id));
  return source.map((row) => {
    const strategyId = text(row.strategy_id);
    const found = strategy(strategyId);
    const stage = (text(row.stage) ?? text(row.mode) ?? "UNKNOWN").toUpperCase();
    const environment = stageEnvironment(stage);
    const health = healthView(text(row.health));
    return {
      deploymentId: text(row.deployment_id) ?? "deployment not published",
      strategyId,
      alphaLabel: (found && text(found.label)) ?? strategyId ?? "Alpha not published",
      version: (found && text(found.version)) ?? null,
      owner: (found && text(found.trader_id)) ?? null,
      stage,
      stageLabel: humanize(stage),
      environment,
      domain: environment === null ? "unknown" : domainOf([environment]),
      venue: text(row.venue),
      accountId: text(row.account_id),
      currency: text(row.currency),
      allocation: text(row.allocation),
      positionPnl: text(row.net_pnl),
      exposure: text(row.exposure),
      healthKind: health.kind,
      healthLabel: health.label,
    };
  }).sort((a, b) => a.alphaLabel.localeCompare(b.alphaLabel) || a.deploymentId.localeCompare(b.deploymentId));
}

export interface AlphaGroup {
  key: string;
  strategyId: string | null;
  label: string;
  version: string | null;
  owner: string | null;
  deployments: readonly DeploymentView[];
}

/** Counts and members only: no per-alpha money is summed, because a group can span currencies. */
export function groupAlphas(deployments: readonly DeploymentView[]): readonly AlphaGroup[] {
  const groups = new Map<string, DeploymentView[]>();
  for (const dep of deployments) {
    const key = dep.strategyId ?? `unknown:${dep.alphaLabel}`;
    groups.set(key, [...(groups.get(key) ?? []), dep]);
  }
  return [...groups.entries()].map(([key, deps]) => ({
    key,
    strategyId: deps[0].strategyId,
    label: deps[0].alphaLabel,
    version: deps[0].version,
    owner: deps[0].owner,
    deployments: deps,
  })).sort((a, b) => a.label.localeCompare(b.label));
}

/** Position PnL per currency, one row per deployment: the Contribution chart's input. Never summed. */
export function contributionByCurrency(deployments: readonly DeploymentView[]): readonly { currency: string; rows: readonly { id: string; label: string; value: string | null }[] }[] {
  const byCurrency = new Map<string, DeploymentView[]>();
  for (const dep of deployments) {
    if (dep.currency === null) continue;
    byCurrency.set(dep.currency, [...(byCurrency.get(dep.currency) ?? []), dep]);
  }
  return [...byCurrency.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([currency, deps]) => ({
    currency,
    rows: deps.map((dep) => ({ id: dep.deploymentId, label: `${dep.alphaLabel} · ${dep.deploymentId}`, value: dep.positionPnl })),
  }));
}

/* ── accounts, balances, margin, reconciliation ────────────────────────── */

export interface BalanceView { currency: string; total: string | null; free: string | null; locked: string | null; updatedAt: string | null }
export interface MarginView { currency: string; initial: string | null; maintenance: string | null }

export interface AccountView {
  accountId: string;
  venue: string | null;
  mode: string | null;
  profile: string | null;
  baseCurrency: string | null;
  /** Deployments of THIS portfolio on the account: a count of rows in view, nothing about other portfolios. */
  servesHere: number;
  balances: readonly BalanceView[];
  margins: readonly MarginView[];
  syncKind: FlagKind;
  syncLabel: string;
  lastSyncedAt: string | null;
  openFindings: number | null;
}

const latestBy = <T>(items: readonly T[], at: (item: T) => string | null): T | null =>
  items.reduce<T | null>((best, item) => {
    if (best === null) return item;
    return (at(item) ?? "") > (at(best) ?? "") ? item : best;
  }, null);

export function readAccounts(resource: ProfileEnvelope, deployments: readonly DeploymentView[]): readonly AccountView[] {
  const accounts = relation(resource, "accounts").rows;
  const balances = relation(resource, "account_balances").rows;
  const margins = relation(resource, "margin_balances").rows;
  const syncs = relation(resource, "account_sync").rows;
  const findings = relation(resource, "reconciliation");
  const ids = [...new Set([
    ...accounts.flatMap((row) => { const id = text(row.account_id); return id ? [id] : []; }),
    ...deployments.flatMap((dep) => (dep.accountId ? [dep.accountId] : [])),
  ])].sort((a, b) => a.localeCompare(b));
  return ids.map((accountId) => {
    const account = accounts.find((row) => text(row.account_id) === accountId);
    const mine = balances.filter((row) => text(row.account_id) === accountId);
    const currencies = [...new Set(mine.flatMap((row) => { const c = text(row.currency); return c ? [c] : []; }))].sort((a, b) => a.localeCompare(b));
    const sync = latestBy(syncs.filter((row) => text(row.account_id) === accountId), (row) => text(row.synced_at) ?? text(row.created_at));
    const status = (text(sync?.status) ?? "").toUpperCase();
    const mineFindings = findings.rows.filter((row) => text(row.account_id) === accountId);
    return {
      accountId,
      venue: (account && text(account.venue)) ?? deployments.find((dep) => dep.accountId === accountId)?.venue ?? null,
      mode: account ? text(account.mode) : null,
      profile: account ? (text(account.account_type) ?? text(account.label)) : null,
      baseCurrency: account ? text(account.base_currency) : null,
      servesHere: deployments.filter((dep) => dep.accountId === accountId).length,
      balances: currencies.flatMap((currency) => {
        const latest = latestBy(mine.filter((row) => text(row.currency) === currency), (row) => text(row.updated_at));
        return latest ? [{ currency, total: text(latest.total), free: text(latest.free), locked: text(latest.locked), updatedAt: text(latest.updated_at) }] : [];
      }),
      margins: [...new Set(margins.filter((row) => text(row.account_id) === accountId).flatMap((row) => { const c = text(row.currency); return c ? [c] : []; }))]
        .sort((a, b) => a.localeCompare(b))
        .flatMap((currency) => {
          const latest = latestBy(margins.filter((row) => text(row.account_id) === accountId && text(row.currency) === currency), (row) => text(row.updated_at));
          return latest ? [{ currency, initial: text(latest.initial), maintenance: text(latest.maintenance) }] : [];
        }),
      syncKind: status === "SYNCED" || status === "OK" ? "ok" : status === "STALE" ? "stale" : status === "" ? "unknown" : "rejected",
      syncLabel: status === "" ? "Sync not published" : status === "SYNCED" || status === "OK" ? "Synced" : humanize(status),
      lastSyncedAt: sync ? (text(sync.synced_at) ?? text(sync.created_at)) : null,
      // `null` = the relation was not carried (unknown), 0 = carried and nothing open.
      openFindings: findings.carried
        ? mineFindings.filter((row) => !["RESOLVED", "CLOSED", "DISMISSED"].includes((text(row.status) ?? "OPEN").toUpperCase())).length
        : null,
    };
  });
}

/* ── capital derivation (EDS-05) ───────────────────────────────────────── */

export type DerivationPanel = "ok" | "partial" | "empty" | "unavailable" | "denied";

export function derivationStatus(state: DerivationEnvelope<unknown>["state"]): DerivationPanel {
  switch (state) {
    case "READY": return "ok";
    case "PARTIAL": return "partial";
    case "EMPTY": return "empty";
    case "DENIED": return "denied";
    default: return "unavailable";
  }
}

export interface CapitalCurrencyRow {
  currency: string;
  /** Count of accounts or allocations behind the figure, as the server wrote it. */
  population: string | null;
  allocated: string | null;
  max: string | null;
  balanceTotal: string | null;
  balanceFree: string | null;
  balanceLocked: string | null;
}

const bucketValue = (bucket: CurrencyBucket | undefined, key: string): string | null => {
  const value = bucket?.values[key];
  return typeof value === "string" ? value : null;
};

export function capitalRows(data: PortfolioCapitalData): readonly CapitalCurrencyRow[] {
  const currencies = [...new Set([...data.allocationByCurrency.map((b) => b.currency), ...data.accountBalanceByCurrency.map((b) => b.currency)])].sort((a, b) => a.localeCompare(b));
  return currencies.map((currency) => {
    const allocation = data.allocationByCurrency.find((b) => b.currency === currency);
    const balance = data.accountBalanceByCurrency.find((b) => b.currency === currency);
    return {
      currency,
      population: allocation?.population ?? balance?.population ?? null,
      allocated: bucketValue(allocation, "allocated_capital"),
      max: bucketValue(allocation, "max_capital"),
      balanceTotal: bucketValue(balance, "total"),
      balanceFree: bucketValue(balance, "free"),
      balanceLocked: bucketValue(balance, "locked"),
    };
  });
}

/* ── capital ledger ────────────────────────────────────────────────────── */

export const MOVEMENT_LABEL: Readonly<Record<string, string>> = {
  INITIAL_ALLOCATE: "Initial allocation",
  ALLOCATE: "Allocate",
  WITHDRAW: "Withdraw",
  REBALANCE: "Rebalance",
  ADJUST: "Adjust",
};

export const DIRECTION_LABEL: Readonly<Record<string, string>> = { INCREASE: "Increase", DECREASE: "Decrease", UNCHANGED: "Unchanged" };

export interface LedgerRowView {
  key: string;
  entry: LedgerEntry;
  currency: string;
  movement: string;
  direction: string;
}

/** Newest first; an entry with no instant stays after the dated ones, in the order the server sent it. */
export function ledgerRows(ledger: CapitalLedger): readonly LedgerRowView[] {
  const flat = ledger.buckets.flatMap((bucket: LedgerBucket) => bucket.entries.map((entry, index) => ({ bucket, entry, index })));
  const dated = flat.filter((item) => item.entry.occurredAt !== null).sort((a, b) => (b.entry.occurredAt as string).localeCompare(a.entry.occurredAt as string));
  const undated = flat.filter((item) => item.entry.occurredAt === null);
  return [...dated, ...undated].map(({ bucket, entry }) => ({
    key: `${bucket.currency}:${entry.ledgerId}`,
    entry,
    currency: bucket.currency,
    movement: MOVEMENT_LABEL[entry.movementType] ?? humanize(entry.movementType),
    direction: DIRECTION_LABEL[entry.direction] ?? humanize(entry.direction),
  }));
}

/**
 * Entries the server says it returned that the reader could not read (a
 * movement or direction word it does not know, an amount that is not a decimal)
 * and therefore dropped. A ledger that silently loses a movement is a ledger
 * that lies, so the count is said on screen. `null` when the server sent no
 * returned count to compare against.
 */
export function unreadEntries(ledger: CapitalLedger): number | null {
  const { returned } = ledger.bounded;
  if (returned === null) return null;
  const read = ledger.buckets.reduce((count, bucket) => count + bucket.entries.length, 0);
  return returned > read ? returned - read : 0;
}

export function ledgerIsEmpty(ledger: CapitalLedger): boolean {
  return ledger.buckets.every((bucket) => bucket.entries.length === 0);
}

/* ── capital flow ribbon (concept C3): the ledger on the equity's time axis ── */

/** The ribbon's own words for a lane with no published source: one sentence, said on the lane. */
/** The lane word; the request ids (FE-031, FE-032) are said once, in the title of the "Not available" line under the chart. */
export const RIBBON_LANE_NP = "Not published";

/** Lanes the capital ledger cannot place anything on. Recall is here too: no ledger movement word says an entry is a recall. */
export const RIBBON_UNPUBLISHED = { stage: RIBBON_LANE_NP, decision: RIBBON_LANE_NP, incident: RIBBON_LANE_NP, recall: RIBBON_LANE_NP } as const;

export interface LedgerFlowModel {
  /** Flow-lane events, newest first; one per ledger entry that moved allocated capital and has a readable instant. */
  events: readonly ChartEvent[];
  /** The table alternative of the ribbon: the same entries, same order. */
  rows: readonly LedgerRowView[];
  /** Entries read that carry no readable instant, so no place on a time axis. */
  undated: number;
  /** Entries read whose direction is UNCHANGED (a rebalance or adjustment that moved nothing): not a flow. */
  unchanged: number;
  /** Entries the reader kept; `bounded` says how many the server holds. */
  read: number;
}

const ISO_WITH_ZONE = /(?:Z|[+-]\d{2}:\d{2})$/;

function instantOf(iso: string | null): UtcEpochMs | null {
  if (iso === null || !ISO_WITH_ZONE.test(iso)) return null;
  return readUtcEpochMs(Date.parse(iso));
}

/**
 * The flow lane from the published capital ledger and nothing else. One event
 * per entry, titled with the published movement word and the exact amount in
 * ITS OWN currency; no amount is added to another, within or across buckets.
 * The ledger is an allocation ledger (capital allocated to accounts), so the
 * lane is called an allocation flow, not "added funds": the funding statements
 * are FE-017.
 */
export function ledgerFlow(ledger: CapitalLedger): LedgerFlowModel {
  const all = ledgerRows(ledger);
  const events: ChartEvent[] = [];
  const rows: LedgerRowView[] = [];
  let undated = 0;
  let unchanged = 0;
  for (const row of all) {
    if (row.entry.direction === "UNCHANGED") {
      unchanged += 1;
      continue;
    }
    const t = instantOf(row.entry.occurredAt);
    if (t === null) {
      undated += 1;
      continue;
    }
    const amount = readDecimal(row.entry.amount, { unit: "money" });
    const before = readDecimal(row.entry.beforeAllocated, { unit: "money" });
    const after = readDecimal(row.entry.afterAllocated, { unit: "money" });
    events.push({
      id: row.key,
      t,
      kind: "flow",
      title: `${row.movement}, ${row.direction.toLowerCase()}: ${amount?.display ?? "unreadable amount"} ${row.currency}`,
      detail: `Account ${row.entry.accountId}${before && after ? ` · allocated ${before.display} to ${after.display} ${row.currency}` : ""}`,
    });
    rows.push(row);
  }
  return { events, rows, undated, unchanged, read: all.length };
}

/* ── equity chart (EDS-07) ─────────────────────────────────────────────── */

export interface EquitySeriesView {
  id: string;
  label: string;
  currency: string | null;
  accountId: string | null;
  points: readonly SeriesPoint[];
  /** Points the reader refused (an instant it cannot read) and did not draw. */
  unreadable: number;
}

/**
 * The server's gaps, as explicit gap points. A hole between two published
 * points is a `null` value halfway across it, which is what the chart already
 * draws as a hatched break; no value is made up and none is joined.
 */
export function withGaps(points: readonly SeriesPoint[], gaps: readonly { fromMs: number; toMs: number }[]): readonly SeriesPoint[] {
  if (gaps.length === 0) return points;
  const out: SeriesPoint[] = [...points];
  for (const gap of gaps) {
    const mid = Math.trunc((gap.fromMs + gap.toMs) / 2);
    const at = readUtcEpochMs(mid);
    if (at === null || out.some((p) => p.t === at)) continue;
    const before = out.filter((p) => p.t <= gap.fromMs).length;
    const next = out[before];
    if (next === undefined || next.t < gap.toMs || before === 0) continue;
    out.splice(before, 0, { t: at, v: null });
  }
  return out;
}

export function equitySeries(payload: FinancialChartPayload): readonly EquitySeriesView[] {
  return payload.series.map((series) => {
    let unreadable = 0;
    const points: SeriesPoint[] = [];
    for (const [t, v] of series.points) {
      const at = readUtcEpochMs(t);
      if (at === null || (v !== null && readDecimal(v, { unit: "money" }) === null)) {
        unreadable += 1;
        continue;
      }
      points.push({ t: at, v });
    }
    return {
      id: series.id,
      label: series.label,
      currency: series.currency,
      accountId: series.accountId,
      points: withGaps(points, payload.coverage.gaps),
      unreadable,
    };
  });
}

export function chartState(payload: FinancialChartPayload): ChartState {
  const state = payload.state.toUpperCase();
  if (state === "READY" || state === "OK" || state === "AVAILABLE") return { kind: "ready" };
  if (state === "PARTIAL") return { kind: "partial", reason: payload.reasonCode ? humanize(payload.reasonCode) : "Partial series" };
  if (state === "STALE") return { kind: "stale", reason: payload.reasonCode ? humanize(payload.reasonCode) : "Stale series" };
  return { kind: "unavailable", copy: "Not available", reason: payload.reasonCode ? humanize(payload.reasonCode) : "The chart read published no series" };
}

/** The server's own reduction, repeated in the caption; `null` when it sent no sampling block or an unreadable count. */
export function serverEnvelope(payload: FinancialChartPayload): ServerEnvelope | null {
  const sampling = payload.sampling;
  if (!sampling || sampling.returnedRows === null || sampling.sourceRows === null) return null;
  const source = Number(sampling.sourceRows);
  if (!Number.isSafeInteger(source) || source < sampling.returnedRows) return null;
  return {
    sourceCount: source,
    shownCount: sampling.returnedRows,
    method: sampling.algorithm ?? "unnamed method",
    // Absent or unreadable is the cautious answer: the chart then says extrema are not promised.
    keepsExtrema: sampling.preservesExtrema === true,
  };
}

/* ── correlation ───────────────────────────────────────────────────────── */

export interface CorrelationPairView {
  key: string;
  left: string;
  right: string;
  coefficient: string;
  samples: number | null;
}

export interface CorrelationView {
  /** Entities the source described. */
  entities: number;
  /** Pairs the source holds (each pair once, the diagonal excluded). */
  pairCount: number;
  /** The strongest `limit` by magnitude. */
  pairs: readonly CorrelationPairView[];
}

export const CORRELATION_PAIR_LIMIT = 12;

export function correlationView(correlation: Correlation, limit: number = CORRELATION_PAIR_LIMIT): CorrelationView {
  const name = (id: string) => correlation.labels.find((label) => label.entityId === id)?.displayName ?? id;
  if (correlation.kind === "RANKED_PAIRS") {
    return {
      entities: correlation.labels.length,
      pairCount: correlation.pairs.length,
      pairs: correlation.pairs.slice(0, limit).map((pair) => ({
        key: `${pair.leftId}|${pair.rightId}`, left: name(pair.leftId), right: name(pair.rightId), coefficient: pair.coefficient, samples: pair.sampleCount,
      })),
    };
  }
  const all: CorrelationPairView[] = [];
  for (let row = 1; row < correlation.dimension; row += 1) {
    for (let column = 0; column < row; column += 1) {
      const coefficient = correlationAt(correlation, row, column);
      if (coefficient === null) continue;
      const left = correlation.labels[row]?.entityId ?? `entity ${row + 1}`;
      const right = correlation.labels[column]?.entityId ?? `entity ${column + 1}`;
      all.push({ key: `${left}|${right}`, left: name(left), right: name(right), coefficient, samples: correlation.sampleCounts ? (correlation.sampleCounts[(row * (row + 1)) / 2 + column] ?? null) : null });
    }
  }
  all.sort((a, b) => compareAbsDecimal(b.coefficient, a.coefficient));
  return { entities: correlation.dimension, pairCount: all.length, pairs: all.slice(0, limit) };
}
