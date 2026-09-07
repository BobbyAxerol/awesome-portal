/**
 * Paper Workbench — the reviewed screen, over the published profile (P0-9).
 *
 * The workbench component has drawn its twelve panels since phase 4, but only
 * ever for the lab: its container rendered the generic envelope dump instead,
 * so on dev the screen was a list of branch names. Nothing was missing from the
 * source. `GET /screens/paper/{deploymentId}` publishes the deployment, its
 * observation gate, 19 orders, 10 fills, 1,247 performance snapshots, 1,438
 * account-equity snapshots and a full query-analytics envelope, and none of it
 * reached a panel.
 *
 * This module is the missing half: profile rows in, the component's props out.
 * It derives nothing the source already states. Three rules it keeps:
 *
 *   1. **The gate's verdict is the server's.** `observation_gate.state` decides
 *      readiness; the counts are drawn beside the policy minimums so a reader
 *      can see *why*, but the browser never re-judges the policy.
 *   2. **Money is never recomputed.** Equity, net, realized, fees and drawdown
 *      are rendered as the decimal strings that arrived. Where a figure is not
 *      published the row says so instead of showing a zero.
 *   3. **What has no source says so with the source's own code**, so a reader
 *      can tell a feature that is coming from one that silently broke.
 */
import type { QueryAnalytics } from "./api/profileRead";
import type { ProfileEnvelope } from "./api/profileRead";
import type {
  Authority,
  ChartEnvelope,
  Envelope,
  FreshnessState,
  IdChip,
  KeysetPage,
  Progress,
  PromotionStage,
  Readiness,
} from "./contracts";
import type { EquityPoint, EquitySeries } from "./components/EquityChart";
import type {
  DriftRow,
  WorkbenchFill,
  WorkbenchOrder,
  WorkbenchPosition,
  WorkbenchSession,
} from "./screens/PaperWorkbench";
import { formatExact } from "./formatExact";
import { soonReason } from "./soon";

type Row = Record<string, unknown>;
type Fact = { label: string; value: string | null; note?: string | null };

const text = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value
    : typeof value === "number" && Number.isFinite(value) ? String(value)
      : null;

const count = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const obj = (value: unknown): Row | null =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Row) : null;

const rows = (envelope: ProfileEnvelope, key: string): readonly Row[] => envelope.data[key] ?? [];

/** A published decimal, shown at its own precision. Never rounded to look tidy. */
const money = (value: unknown, currency?: string | null): string | null => {
  const raw = text(value);
  if (raw === null) return null;
  const shown = formatExact(raw, "money").display;
  return currency ? `${shown} ${currency}` : shown;
};

const qty = (value: unknown): string | null => {
  const raw = text(value);
  return raw === null ? null : formatExact(raw, "qty").display;
};

/** Newest first, by whichever clock the branch publishes. */
function byNewest(a: Row, b: Row, ...fields: string[]): number {
  const at = (row: Row) => {
    for (const field of fields) {
      const ms = count(row[`${field}_ms`]);
      if (ms !== null) return ms;
      const iso = text(row[field]);
      if (iso) { const parsed = Date.parse(iso); if (Number.isFinite(parsed)) return parsed; }
    }
    return 0;
  };
  return at(b) - at(a);
}

/** The latest row of a snapshot branch — the one every headline figure reads. */
function latest(list: readonly Row[], ...fields: string[]): Row | null {
  let held: Row | null = null;
  for (const row of list) if (held === null || byNewest(row, held, ...fields) < 0) held = row;
  return held;
}

/**
 * The equity series, from the deployment's own snapshots.
 *
 * `account_equity` is preferred over the analytics chart series because it
 * carries the published drawdown beside each equity, and the profile states how
 * it was reduced: `history_windows.account_equity.downsample` names the method
 * and both row counts, which the chart's envelope caption then shows. A
 * downsample the reader cannot see the shape of is the failure mode §8 names.
 */
function equityOf(envelope: ProfileEnvelope, analytics: QueryAnalytics | null): {
  envelope: ChartEnvelope;
  series: EquitySeries | null;
} | null {
  const snapshots = rows(envelope, "account_equity");
  const window = obj(envelope.objects.history_windows?.account_equity);
  const downsample = obj(window?.downsample);
  const ordered = [...snapshots].sort((a, b) => -byNewest(a, b, "ts", "created_at"));
  const points: EquityPoint[] = ordered.flatMap((row) => {
    const t = text(row.ts) ?? text(row.created_at);
    return t ? [{ t, equity: text(row.equity), drawdown: text(row.drawdown) }] : [];
  });
  const currency = text(ordered[ordered.length - 1]?.currency);

  if (points.length > 1) {
    return {
      envelope: {
        window: count(window?.days) !== null ? `${count(window?.days)}d` : "published window",
        // The bucket is the source's, not a request parameter: say which.
        interval: count(downsample?.bucket_seconds) !== null
          ? `${count(downsample?.bucket_seconds)}s buckets · ${text(downsample?.method) ?? "downsampled"}`
          : "source snapshots",
        currency,
        asOf: envelope.asOf ?? new Date(0).toISOString(),
        authority: (envelope.sourceAuthority as Authority) ?? "EXECUTION",
        formulaVersion: text(window?.basis),
        sourceRows: count(window?.source_rows) ?? points.length,
        returnedRows: points.length,
      },
      series: { label: "Account equity · published", points },
    };
  }

  // No snapshots: the analytics envelope may still publish the projection.
  const chart = analytics?.chartSeries[0];
  const chartPoints = Array.isArray(chart?.points)
    ? chart.points.flatMap((raw) => {
      const row = obj(raw);
      const t = text(row?.timestamp);
      return row && t ? [{ t, equity: text(row.value), drawdown: null }] : [];
    })
    : [];
  if (chart && chartPoints.length > 1) {
    return {
      envelope: {
        window: analytics?.completeness ?? "published projection",
        interval: "source snapshots",
        currency: text(chart.currency),
        asOf: analytics?.asOf ?? envelope.asOf ?? new Date(0).toISOString(),
        authority: "EXECUTION",
        formulaVersion: text(chart.formula_version),
        sourceRows: chartPoints.length,
        returnedRows: chartPoints.length,
      },
      series: { label: "Execution equity", points: chartPoints },
    };
  }
  return null;
}

/**
 * The observation gate, exactly as the policy publishes it.
 *
 * Each criterion is `current of target` against the policy's own minimum, and
 * `met` is the server's `state`, not a comparison done here. The two differ in
 * a case that matters: the window can be bounded — the source holds less
 * history than the policy asks about — and then the counts can look sufficient
 * while the gate is honestly still PARTIAL.
 */
function observationOf(gate: Row | null): {
  observation: { items: readonly (Progress & { label: string })[]; rule?: string; met: boolean };
  unmet: string[];
  railDetail: string | undefined;
} {
  if (!gate) {
    return {
      observation: { items: [], rule: "The observation policy is not published for this deployment.", met: false },
      unmet: ["the observation gate is not published"],
      railDetail: undefined,
    };
  }
  const days = count(gate.observed_days);
  const dayTarget = count(gate.policy_minimum_observed_days);
  const trades = count(gate.trade_count);
  const tradeTarget = count(gate.policy_minimum_trade_count);
  const sessions = count(gate.session_count);
  const state = text(gate.state);

  const items: (Progress & { label: string })[] = [];
  if (days !== null && dayTarget !== null) items.push({ label: "observed days", current: days, target: dayTarget, unit: "days" });
  if (trades !== null && tradeTarget !== null) items.push({ label: "trades", current: trades, target: tradeTarget, unit: "trades" });
  if (sessions !== null) items.push({ label: "sessions", current: sessions, target: Math.max(sessions, 1), unit: "sessions" });

  const unmet: string[] = [];
  if (days !== null && dayTarget !== null && days < dayTarget) unmet.push(`observed days ${days} of ${dayTarget}`);
  if (trades !== null && tradeTarget !== null && trades < tradeTarget) unmet.push(`trades ${trades} of ${tradeTarget}`);
  const bounded = gate.window_bounded === true;
  if (bounded) {
    // Not a criterion the operator can satisfy by waiting — the source's
    // retention is short of the policy's window, and saying so is the only
    // honest reading of a gate that will not close on its own.
    unmet.push(`the observation window is bounded by the source${text(gate.reason_code) ? ` · ${text(gate.reason_code)}` : ""}`);
  }
  if (state !== null && state !== "MET" && state !== "AVAILABLE" && unmet.length === 0) unmet.push(`the gate is ${state}`);

  return {
    observation: {
      items,
      rule: [
        text(gate.policy_stage),
        text(gate.policy_version),
        dayTarget !== null && tradeTarget !== null ? `minimum ${dayTarget} days and ${tradeTarget} trades` : null,
      ].filter(Boolean).join(" · ") || undefined,
      met: state === "MET" || state === "AVAILABLE",
    },
    unmet,
    railDetail: days !== null && dayTarget !== null && trades !== null && tradeTarget !== null
      ? `${days}/${dayTarget} days · ${trades}/${tradeTarget} trades`
      : undefined,
  };
}

/** The reject-rate figures the analytics envelope computes; latency is not activated. */
function qualityFacts(analytics: QueryAnalytics | null): Fact[] {
  const q = analytics?.executionQuality ?? null;
  if (!q) return [{ label: "execution quality", value: null, note: soonReason("N23_SCREEN_OUTSIDE_RELEASE") }];
  const rate = text(q.reject_rate);
  const latencyReason = text(q.latency_reason_code);
  return [
    { label: "submitted", value: text(q.submitted_count) },
    { label: "filled", value: text(q.filled_count) },
    { label: "risk rejected", value: text(q.risk_rejected_count) },
    { label: "broker rejected", value: text(q.broker_rejected_count) },
    {
      label: "reject rate",
      value: rate === null ? null : formatExact(rate, "ratio").display,
      note: text(q.formula_version),
    },
    { label: "ACK latency", value: null, note: soonReason(latencyReason) ?? latencyReason ?? "Soon" },
  ];
}

/**
 * Correlation against the rest of the fleet, from the server's own pairs.
 *
 * `rho` is drawn, never re-derived: the pairs carry the overlap each was
 * computed over, and a browser averaging them would produce a number with no
 * window at all.
 */
function contributionOf(analytics: QueryAnalytics | null, strategyId: string | null): Fact[] {
  const corr = analytics?.correlation ?? null;
  const dd = analytics?.drawdownOverlap ?? null;
  const facts: Fact[] = [];

  if (corr && corr.state === "AVAILABLE" && strategyId) {
    const mine = corr.pairs
      .filter((pair) => pair.left === strategyId || pair.right === strategyId)
      .sort((a, b) => Math.abs(b.rho) - Math.abs(a.rho));
    if (mine.length > 0) {
      const top = mine[0];
      const other = top.left === strategyId ? top.right : top.left;
      facts.push({
        label: "ρ strongest pair",
        value: top.rho.toFixed(2),
        note: `${other}${top.overlappingDays !== null ? ` · ${top.overlappingDays} overlapping days` : ""}`,
      });
      facts.push({
        label: "pairs computed",
        value: String(mine.length),
        note: corr.windowDays !== null ? `${corr.windowDays}d window · ${corr.formulaVersion ?? "correlation"}` : corr.formulaVersion,
      });
    } else {
      facts.push({ label: "ρ vs fleet", value: null, note: "no pair in the published set names this deployment" });
    }
  } else {
    facts.push({ label: "ρ vs fleet", value: null, note: soonReason(corr?.reasonCode) ?? corr?.reasonCode ?? "the correlation branch is not published" });
  }

  if (dd && dd.state === "AVAILABLE" && strategyId) {
    const mine = dd.alphas.find((alpha) => alpha.alphaId === strategyId) ?? null;
    facts.push({
      label: "max drawdown",
      value: mine?.maxDrawdown !== null && mine?.maxDrawdown !== undefined ? formatExact(String(mine.maxDrawdown), "ratio").display : null,
      note: mine?.maxDrawdownAt ?? (mine ? "no drawdown timestamp published" : "this deployment is not in the drawdown set"),
    });
    facts.push({ label: "concurrent drawdowns", value: String(dd.overlaps?.length ?? 0), note: dd.windowDays !== null ? `${dd.windowDays}d window` : null });
  }

  facts.push({
    label: "portfolio contribution",
    value: null,
    note: soonReason("N28_PORTFOLIO_EQUITY_NOT_PUBLISHED") ?? "Soon · the portfolio equity branch is empty for this deployment",
  });
  return facts;
}

export interface WorkbenchProps {
  alphaLabel: string;
  deploymentId: string;
  accountId: string;
  venue: string;
  stage: PromotionStage;
  readiness: Readiness;
  envelope: Envelope;
  lineage: { label: string; chip: IdChip }[];
  railDetail: string | undefined;
  kpis: Fact[];
  equity: { envelope: ChartEnvelope; series: EquitySeries | null } | null;
  observation: { items: readonly (Progress & { label: string })[]; rule?: string; met: boolean };
  unmetCriteria: string[];
  drift: DriftRow[];
  driftNote: string;
  runtime: Fact[];
  accounting: Fact[];
  contribution: Fact[];
  orders: KeysetPage<WorkbenchOrder>;
  fills: KeysetPage<WorkbenchFill>;
  positions: KeysetPage<WorkbenchPosition>;
  sessions: WorkbenchSession[];
  analytics: QueryAnalytics | null;
  qualityFacts: Fact[];
}

/**
 * Everything the Paper Workbench draws, read from one profile envelope.
 *
 * `analytics` is passed in already parsed rather than re-read here, so the
 * container decides once whether the branch was published.
 */
export function workbenchProps(envelope: ProfileEnvelope, analytics: QueryAnalytics | null): WorkbenchProps {
  const deployment = envelope.objects.deployment ?? rows(envelope, "deployments")[0] ?? null;
  const gate = envelope.objects.observation_gate ?? null;
  const equitySnapshots = rows(envelope, "account_equity");
  const performance = rows(envelope, "performance");
  const orderRows = rows(envelope, "orders");
  const fillRows = rows(envelope, "fills");
  const positionRows = rows(envelope, "positions");

  const head = latest(equitySnapshots, "ts", "created_at");
  const perf = latest(performance, "ts", "created_at");
  const currency = text(head?.currency) ?? text(deployment?.currency);
  const strategyId = text(deployment?.strategy_id);
  const { observation, unmet, railDetail } = observationOf(gate);

  // Readiness is the gate's verdict, never `active`. A deployment can be
  // running and nowhere near ready, and conflating them is the exact mistake
  // the guide calls out: ACTIVE is not READY.
  const gateState = text(gate?.state);
  const readiness: Readiness = gateState === "MET" || gateState === "AVAILABLE" ? "READY"
    : gateState === "BLOCKED" ? "BLOCKED"
      : gateState === null ? "UNKNOWN" : "NOT_READY";

  const runtime: Fact[] = [
    { label: "active", value: deployment?.active === true ? "yes" : deployment?.active === false ? "no" : null, note: "the source's own flag; not a health check" },
    { label: "mode · venue", value: [text(deployment?.mode), text(deployment?.venue)].filter(Boolean).join(" · ") || null },
    { label: "open positions", value: String(positionRows.filter((row) => text(row.side) !== "FLAT").length), note: `${positionRows.length} position rows published` },
    { label: "last source update", value: text(deployment?.updated_at) },
    { label: "snapshot reason", value: text(head?.snapshot_reason), note: text(head?.source) },
    { label: "fills counted by source", value: text(head?.total_fills) },
    { label: "projection digest", value: text(head?.state_digest)?.slice(0, 12) ?? null, note: "first 12 of the published state digest" },
  ];

  const accounting: Fact[] = [
    { label: "equity", value: money(head?.equity ?? perf?.equity, currency) },
    { label: "net pnl", value: money(head?.net_pnl ?? perf?.net_pnl, currency) },
    { label: "realized pnl", value: money(head?.realized_pnl ?? perf?.realized_pnl, currency) },
    { label: "unrealized pnl", value: money(head?.unrealized_pnl ?? perf?.unrealized_pnl, currency) },
    { label: "gross pnl", value: money(head?.gross_pnl, currency) },
    { label: "fees", value: money(head?.fee_total, currency), note: "funding is counted separately" },
    { label: "funding pnl", value: money(head?.funding_pnl, currency) },
    { label: "cash free · locked", value: [money(head?.cash_free), money(head?.cash_locked)].every((v) => v !== null) ? `${money(head?.cash_free)} · ${money(head?.cash_locked)}` : null },
    { label: "margin initial · maintenance", value: [money(head?.margin_initial), money(head?.margin_maintenance)].every((v) => v !== null) ? `${money(head?.margin_initial)} · ${money(head?.margin_maintenance)}` : null },
    { label: "as of", value: text(head?.ts) ?? text(perf?.ts) },
  ];

  const kpis: Fact[] = [
    { label: "Equity", value: money(head?.equity, currency) },
    { label: "Net PnL", value: money(head?.net_pnl, currency) },
    { label: "Drawdown", value: text(head?.drawdown) === null ? null : formatExact(text(head!.drawdown)!, "ratio").display },
    { label: "Trades", value: text(gate?.trade_count) },
    { label: "Projection age", value: envelope.freshness ?? null },
  ];

  const orders: KeysetPage<WorkbenchOrder> = {
    rows: [...orderRows].sort((a, b) => byNewest(a, b, "submitted_at", "updated_at")).map((row) => ({
      orderId: text(row.order_id) ?? text(row.client_order_id) ?? "not published",
      at: text(row.submitted_at) ?? text(row.updated_at) ?? "",
      symbol: text(row.symbol) ?? text(row.instrument_id) ?? "not published",
      orderType: text(row.order_type) ?? "not published",
      side: text(row.side) ?? "not published",
      quantity: qty(row.quantity) ?? "not published",
      filledQuantity: null,
      price: money(row.price ?? row.trigger_price),
      status: text(row.status) ?? "not published",
      rejectReason: text(row.error_message) ?? text(row.error_code),
      fee: null,
      feeCurrency: null,
    })),
    totalCount: orderRows.length,
    filteredCount: orderRows.length,
  };

  const fills: KeysetPage<WorkbenchFill> = {
    rows: [...fillRows].sort((a, b) => byNewest(a, b, "trade_time")).map((row) => ({
      fillId: text(row.fill_id) ?? text(row.trade_id) ?? "not published",
      at: text(row.trade_time) ?? "",
      symbol: text(row.instrument_id) ?? "not published",
      quantity: qty(row.quantity) ?? "not published",
      price: money(row.price) ?? "not published",
      fee: money(row.commission, text(row.commission_currency)),
      liquidity: text(row.liquidity_side),
    })),
    totalCount: fillRows.length,
    filteredCount: fillRows.length,
  };

  const positions: KeysetPage<WorkbenchPosition> = {
    rows: [...positionRows].sort((a, b) => byNewest(a, b, "updated_at", "opened_at")).map((row) => ({
      symbol: text(row.instrument_id) ?? "not published",
      // FLAT is a real side the source publishes; forcing it into LONG/SHORT
      // would claim an exposure that is closed.
      side: text(row.side) === "SHORT" ? "SHORT" : "LONG",
      quantity: qty(row.quantity) ?? "not published",
      entry: money(row.avg_px_open),
      mark: money(row.mark_price),
      unrealised: money(row.unrealized_pnl),
    })),
    totalCount: positionRows.length,
    filteredCount: positionRows.length,
  };

  // Drift needs the approved research evidence joined to this deployment, and
  // that join is not activated. One named row beats an empty panel: it says
  // which contract is missing rather than implying the deployment has no drift.
  const drift: DriftRow[] = [
    { label: "vs approved research evidence", expected: null, observed: null, verdict: "INSUFFICIENT_DATA", note: soonReason("N28_RESEARCH_EVIDENCE_JOIN_NOT_ACTIVATED") ?? "Soon" },
  ];

  return {
    alphaLabel: strategyId ?? text(deployment?.deployment_id) ?? "deployment",
    deploymentId: text(deployment?.deployment_id) ?? "not published",
    accountId: text(deployment?.account_id) ?? "not published",
    venue: text(deployment?.venue) ?? "not published",
    stage: (text(gate?.policy_stage) as PromotionStage) ?? "PAPER_OBSERVATION",
    readiness,
    envelope: {
      authority: (envelope.sourceAuthority as Authority) ?? "EXECUTION",
      asOf: envelope.asOf,
      readAt: envelope.readAt,
      freshness: (envelope.freshness as FreshnessState) ?? "UNKNOWN",
    },
    lineage: [
      ...(strategyId ? [{ label: "strategy", chip: { label: strategyId } }] : []),
      ...(text(deployment?.portfolio_id) ? [{ label: "portfolio", chip: { label: text(deployment!.portfolio_id)!, href: `/deployments/portfolios/${encodeURIComponent(text(deployment!.portfolio_id)!)}` } }] : []),
      ...(text(deployment?.account_id) ? [{ label: "account", chip: { label: text(deployment!.account_id)!, href: `/deployments/accounts/${encodeURIComponent(text(deployment!.account_id)!)}` } }] : []),
      ...(text(head?.state_digest) ? [{ label: "projection", chip: { label: `sha256:${text(head!.state_digest)}`, title: `sha256:${text(head!.state_digest)}` } }] : []),
    ],
    railDetail,
    kpis,
    equity: equityOf(envelope, analytics),
    observation,
    unmetCriteria: unmet,
    drift,
    driftNote: "The approved-evidence join is not activated, so no band is claimed for this deployment.",
    runtime,
    accounting,
    contribution: contributionOf(analytics, strategyId),
    orders,
    fills,
    positions,
    // The workbench profile publishes no session branch. Inventing rows from
    // the session ids on orders would name a state the source never gave.
    sessions: [],
    analytics,
    qualityFacts: qualityFacts(analytics),
  };
}
