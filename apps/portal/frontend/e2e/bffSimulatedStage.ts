/**
 * SIMULATED stage bodies (FIXTURE_LAB, WP-F3, register section 2f3): the Paper workbench, Sandbox certification, Canary control room
 * and Live operations answer a LIT body for the deployments the Fleet and Alpha 360 link to, through the SAME routes and read by the
 * SAME readers as the real Edge. Bobby's rule (2026-10-23): where the real API has no data yet, the fixture lane fills the design with
 * rule-bound simulated values so it can be judged; the real read replaces them later.
 *
 * What is lit, and with which published shape (nothing here invents a member name):
 *  - `stage_facts` (runtime, reconciliation, sessions) and the five identity keys of `deployment` (execution-stage-facts.v1);
 *  - Canary: `kpis`, `source_panels`, `envelope_compliance.rows`/`verdict`, `rollback_readiness.items`, `lifecycle.trial`, typed
 *    positions/blotter rows, `source_figures`, `series` members;
 *  - Live: `kpis`, `source_panels`, `broker_consistency`, `projection_continuity`, typed positions/orders, `source_figures`,
 *    `series`, `rollback_readiness`, `open_order_footer`.
 * The V1 schemas of Canary and Live PIN a few members dark (Canary `lifecycle.day_index` null and envelope status DRAFT, panel
 * states, KPI values); a lit body is therefore NOT wire-valid and is labelled so in the register (the unit suites of the screens build
 * the same lit bodies in memory, `canary.testbase.ts`, `live.testbase.ts`). The V2 bodies (`ws_TEST_SCOPED_V2`) are never touched.
 *
 * Variants (deployment id decides, so a link or a typed URL reaches the state; the DEFAULT is the healthy lit body):
 *   `_dark`      the published dark body, unchanged (typed absences everywhere)      all four screens
 *   `_mismatch`  broker and internal figures disagree: broker values are not sent    Live (also `dep_b2`), Sandbox
 *   `_stale`     the broker snapshot is stale                                          Canary, Live (also `dep_c1`)
 *   `_gap`       the projection feed has a hole: the chart is replaced                 Live
 *   `_breach`    one cap is above its approved limit                                   Canary
 *   `_halted`    the runtime is HALTED                                                 all four (also `dep_c1`)
 * Rules: exact decimal strings only, integer (bigint) arithmetic where a figure is derived, one currency (USDT) per figure, no
 * cross-currency sum, a derived figure the real source would publish (a ratio, a difference) is written as the server writes it and
 * asserted by the suite, absence is a typed `NOT_PUBLISHED` fact with a reason code, never a zero.
 */

import { createHash } from "node:crypto";
import { isPositiveMode, positiveDeploymentFact } from "./bffPositiveMode";
import { isRetired, resolveStageDeployment, sandboxRecordIdOf, stageBookOf, userIdOf } from "./bffWorldStage"; // WP-B2-S
import { currentDeploymentOfStage, haltedSinceMs, historyDeploymentId, historyNetSeries, standingOf } from "./bffWorldStage"; // WP-B2-S3
import { approvalHref, approvalOfAlpha, type WorldGate } from "./bffWorldGovernance"; // WP-B2-S3
import { WORLD_INCIDENTS } from "./bffWorld"; // WP-B2-S3
import { costOverRun, limitState } from "./bffWorldBooks"; // WP-B2-C3
import { DAY_MS as WORLD_DAY_MS, deploymentOf, fromCents as worldCents, grossNotional, lifecycleOf, netPnlSeries, positionsOf, toCents as worldToCents, workingOrdersOf } from "./bffWorld";

type Obj = Record<string, unknown>;
const isObj = (value: unknown): value is Obj => typeof value === "object" && value !== null && !Array.isArray(value);
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export const STAGE_VARIANTS = ["dark", "mismatch", "stale", "gap", "breach", "halted", "vn"] as const;
export type StageVariant = (typeof STAGE_VARIANTS)[number] | "ok";

/** Deployments of the review universe that show a non-default state on purpose (so a Fleet link reaches it). */
const NAMED_VARIANT: Readonly<Record<string, StageVariant>> = { dep_b2: "mismatch", dep_c1: "halted" };

export function variantOf(deploymentId: string): StageVariant {
  const named = NAMED_VARIANT[deploymentId];
  if (named !== undefined) return named;
  for (const word of STAGE_VARIANTS) if (deploymentId.endsWith(`_${word}`) || deploymentId.includes(`_${word}_`)) return word;
  return "ok";
}

/* ── who the deployments belong to (identity keys, FE-066) ─────────────────── */

interface Identity {
  alphaId: string;
  alphaName: string;
  portfolioId: string;
  portfolioName: string;
}
const CORE = { portfolioId: "pf_TEST_ONLY_core", portfolioName: "Core" } as const;
const SAT = { portfolioId: "pf_TEST_ONLY_satellite", portfolioName: "Satellite" } as const;
const CAN = { portfolioId: "pf_TEST_ONLY_canary", portfolioName: "Canary" } as const;
const IDENTITY: Readonly<Record<string, Identity>> = {
  dep_live_01: { alphaId: "alpha_a", alphaName: "Carry A", ...CORE },
  dep_paper_01: { alphaId: "alpha_a", alphaName: "Carry A", ...CORE },
  dep_sandbox_01: { alphaId: "alpha_a", alphaName: "Carry A", ...CORE },
  dep_canary_01: { alphaId: "alpha_b", alphaName: "Basis B", ...CORE },
  dep_btc_live: { alphaId: "alpha_btc_trend", alphaName: "BTC Trend", ...CORE },
  dep_btc_paper: { alphaId: "alpha_btc_trend", alphaName: "BTC Trend", ...CORE },
  dep_btc_sandbox: { alphaId: "alpha_btc_trend", alphaName: "BTC Trend", ...CAN },
  dep_b1: { alphaId: "alpha_b", alphaName: "Basis B", ...CORE },
  dep_b2: { alphaId: "alpha_b", alphaName: "Basis B", ...SAT },
  dep_c1: { alphaId: "alpha_c", alphaName: "Momentum C", ...SAT },
  dep_d1: { alphaId: "alpha_d", alphaName: "Grid D", ...CAN },
  dep_d2: { alphaId: "alpha_d", alphaName: "Grid D", ...SAT },
  dep_a1: { alphaId: "alpha_a", alphaName: "Carry A", portfolioId: "pf_main", portfolioName: "Main" },
};

/**
 * ONE lifecycle record: the stage a deployment is in. Every read of it (Paper, Sandbox, Canary, Live) takes its facts from this record, so a
 * deployment that has not reached Live answers no lit Live page, and a live deployment's Canary is a finished trial dated before its activation.
 */
export type DeploymentStage = "paper" | "sandbox" | "canary" | "live";
const STAGE_ORDER: readonly DeploymentStage[] = ["paper", "sandbox", "canary", "live"];
const STAGE_OF: Readonly<Record<string, DeploymentStage>> = {
  dep_live_01: "live", dep_b1: "live", dep_b2: "live", dep_btc_live: "live",
  dep_canary_01: "canary", dep_c1: "canary",
  dep_sandbox_01: "sandbox", dep_d1: "sandbox", dep_btc_sandbox: "sandbox",
  dep_paper_01: "paper", dep_d2: "paper", dep_a1: "paper", dep_btc_paper: "paper",
};
/** The Canary deployment a live deployment was promoted from (its predecessor envelope is THAT deployment's). */
const PREDECESSOR: Readonly<Record<string, string>> = { dep_live_01: "dep_canary_01", dep_btc_live: "dep_canary_01", dep_b1: "dep_canary_01", dep_b2: "dep_canary_01" };
/**
 * The canary deployment a live deployment was promoted from: in the canonical world the alpha's OWN deployment in the Canary stage; `null` when the
 * alpha has none (its trial ended without a deployment of its own on record: no predecessor is claimed, never another alpha's).
 */
export function predecessorCanary(deploymentId: string): string | null {
  const base = baseDeploymentId(deploymentId);
  if (isPositiveMode()) {
    const found = deploymentOf(WORLD_ALIAS[base] ?? base);
    if (found !== null) return found.alpha.deployments.find((x) => x.stage === "CANARY")?.id ?? worldHistoryCanaryOf(found.alpha.id); // WP-B2-S3: a trial the alpha finished without a deployment of its own is a history record, as Alpha 360 shows it
  }
  return PREDECESSOR[base] ?? base;
}

/** The stage of a deployment id; an id the universe does not know is taken to be in the stage of the screen that asked. */
export function stageOf(deploymentId: string, asked: DeploymentStage): DeploymentStage {
  return STAGE_OF[baseDeploymentId(deploymentId)] ?? positiveDeploymentFact(baseDeploymentId(deploymentId))?.stage ?? (isPositiveMode() ? resolveStageDeployment(baseDeploymentId(deploymentId))?.standing.stage : undefined) ?? asked; // WP-P: every id the world emits has a lifecycle record
}
/** A stage page exists (lit) only for a stage the deployment has reached. */
export const reached = (stage: DeploymentStage, asked: DeploymentStage): boolean => STAGE_ORDER.indexOf(asked) <= STAGE_ORDER.indexOf(stage);

/** The universe's own id, with a trailing variant word taken off (`dep_live_01_mismatch` is dep_live_01 in another state). */
export function baseDeploymentId(deploymentId: string): string {
  for (const word of STAGE_VARIANTS) {
    if (deploymentId.endsWith(`_${word}`)) return deploymentId.slice(0, -(word.length + 1));
  }
  return deploymentId;
}

function identityOf(deploymentId: string): Identity | null {
  const fact = positiveDeploymentFact(baseDeploymentId(deploymentId));
  return IDENTITY[baseDeploymentId(deploymentId)] ?? (fact === null ? null : { alphaId: fact.alphaId, alphaName: fact.alphaName, portfolioId: fact.portfolioId, portfolioName: fact.portfolioName }); // WP-P
}

function withIdentity(deployment: Obj, deploymentId: string): void {
  const who = identityOf(deploymentId);
  if (who === null) return;
  deployment.alpha_id = who.alphaId;
  deployment.alpha_name = who.alphaName;
  deployment.portfolio_name = who.portfolioName;
  deployment.alpha_reason_code = null;
  deployment.portfolio_name_reason_code = null;
  if (typeof deployment.portfolio_id === "string" || deployment.portfolio_id === undefined) deployment.portfolio_id = who.portfolioId;
}

/** A stable digest of a label: provenance never shows a placeholder run of one letter. */
const digestOf = (label: string): string => `sha256:${createHash("sha256").update(label).digest("hex")}`;

/* ── small builders ────────────────────────────────────────────────────────── */

/** The ONE `now` of every lit stage body. Every other instant below is an offset from it (WP-P's single world clock replaces this line). */
export const STAGE_NOW_ISO = "2026-10-17T12:04:00.000Z";
const NOW_MS = Date.parse(STAGE_NOW_ISO);
const MIN = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
/** The ISO instant `offsetMs` after (negative: before) now. */
export const at = (offsetMs: number): string => new Date(NOW_MS + offsetMs).toISOString();
export const AS_OF = STAGE_NOW_ISO;
const AS_OF_STALE = at(-12 * MIN);
const BROKER_UNVERIFIED = "VERIFIED";

const avail = (value: unknown): Obj => ({ availability: "AVAILABLE", value, reason_code: null });
const unpub = (reason: string): Obj => ({ availability: "NOT_PUBLISHED", value: null, reason_code: reason });

/** A source panel envelope in the published member order, lit with the schema's own words. */
function panel(id: string, authority: string, state: string, freshness: string, asOf: string | null, extra: Obj = {}): Obj {
  return {
    panel_id: id,
    source_authority: authority,
    panel_state: state,
    freshness_state: freshness,
    delivery_profile: "LIVE_BINANCE_USDM",
    source_verification_state: state === "unavailable" || state === "suppressed" ? "UNAVAILABLE" : BROKER_UNVERIFIED,
    as_of: asOf,
    read_at: AS_OF,
    age_seconds: null,
    lag_ms: null,
    source_cursor: null,
    projection_epoch: null,
    projection_sequence: null,
    capability_snapshot_id: null,
    data: null,
    warnings: [],
    ...extra,
  };
}

/** `-420.5` is canonical (no trailing zero in the fraction); `-0` is not a value. */
export function canonicalDecimal(text: string): string {
  if (!text.includes(".")) return text === "-0" ? "0" : text;
  const trimmed = text.replace(/0+$/, "").replace(/\.$/, "");
  return trimmed === "-0" ? "0" : trimmed;
}

/** Integer cents of a two-place decimal string. */
const cents = (text: string): bigint => {
  const negative = text.startsWith("-");
  const [whole, frac = ""] = (negative ? text.slice(1) : text).split(".");
  const value = BigInt(whole ?? "0") * 100n + BigInt((frac + "00").slice(0, 2));
  return negative ? -value : value;
};
const fromCents = (value: bigint): string => {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  return `${negative ? "-" : ""}${abs / 100n}.${(abs % 100n).toString().padStart(2, "0")}`;
};
/** `internal - broker`, exact, as the SERVER writes a difference (canonical, no trailing zero). */
export const difference = (internal: string, broker: string): string => canonicalDecimal(fromCents(cents(internal) - cents(broker)));

/* ── stage facts ───────────────────────────────────────────────────────────── */

interface FactsSpec {
  runtime: "RUNNING" | "PAUSED" | "HALTED" | "STOPPED";
  since: string;
  verdict: "NO_OPEN_FINDINGS" | "OPEN_FINDINGS";
  open: number;
  unknownOrders: number;
  asOf: string;
  sessions: readonly { id: string; started: string; ended: string | null; state: string }[];
}

function stageFacts(spec: FactsSpec): Obj {
  return {
    schema_version: "execution.stage-facts.v1",
    runtime: { runtime_state: avail(spec.runtime), since: avail(spec.since) },
    reconciliation: {
      basis: "FINDINGS_RELATION_NOT_A_RECONCILIATION_RUN",
      verdict: avail(spec.verdict),
      open_finding_count: avail(spec.open),
      unknown_order_count: avail(spec.unknownOrders),
      as_of: avail(spec.asOf),
    },
    sessions: {
      availability: "AVAILABLE",
      reason_code: null,
      basis: "EXECUTION_SESSIONS_BOUNDED_WINDOW",
      rows: spec.sessions.map((s) => ({ id: s.id, started: s.started, ended: s.ended, state: s.state })),
      returned_count: spec.sessions.length,
      omitted_count: 0,
      source_complete: true,
    },
  };
}

const FIGURE_LABELS = { equity: "Equity", gross_notional: "Gross notional", positions: "Positions", open_orders: "Open orders", fees: "Fees" } as const;
type FigureKey = keyof typeof FIGURE_LABELS;
interface FigureSpec {
  /** Internal and broker values (exact, two places or an integer count). `null` broker = not sent (mismatch). */
  internal: string;
  broker: string | null;
  unit: string | null;
}

/** `source_figures`: five rows in the published order. A broker side that is not sent has its typed reason and so has the difference. */
export function sourceFigures(figures: Readonly<Record<FigureKey, FigureSpec>>, brokerReason = "BROKER_VALUES_SUPPRESSED_ON_MISMATCH"): Obj {
  return {
    basis: "SOURCE_RELATIONS_HELD_BY_THE_PORTAL",
    figures: (Object.keys(FIGURE_LABELS) as FigureKey[]).map((key) => {
      const f = figures[key];
      const count = f.unit === "COUNT";
      const diff = f.broker === null ? null : count ? String(Number(f.internal) - Number(f.broker)) : difference(f.internal, f.broker);
      return {
        key,
        label: FIGURE_LABELS[key],
        unit: f.unit,
        internal: avail(canonicalDecimal(f.internal)),
        broker: f.broker === null ? unpub(brokerReason) : avail(canonicalDecimal(f.broker)),
        difference: diff === null ? unpub("DIFFERENCE_REQUIRES_BOTH_SIDES") : avail(canonicalDecimal(diff)),
      };
    }),
  };
}

/** A deployment-level series as the schema names it: resolution, methodology, unit, exact points. */
function seriesMembers(start: string, stepMs: number, resolution: string, values: readonly string[], unit = "USDT", last?: string): Obj {
  const t0 = Date.parse(start);
  return {
    resolution,
    methodology_ref: "portal.net-pnl.FIXTURE_LAB.v1",
    unit,
    points: values.map((v, i) => ({ t: new Date(last !== undefined && i === values.length - 1 ? Date.parse(last) : t0 + i * stepMs).toISOString(), value: canonicalDecimal(v) })),
  };
}

/* ── typed rows ────────────────────────────────────────────────────────────── */

interface PositionSpec { id: string; symbol: string; side: "long" | "short"; quantity: string; entry: string; mark: string; unrealised: string }

const NO_LEVERAGE = [{ column: "leverage", reason_code: "POSITION_LEVERAGE_NOT_IN_SOURCE_RELATION" }];
const NO_ACK = [{ column: "ack_latency_ms", reason_code: "ORDER_ACK_LATENCY_NOT_IN_SOURCE_RELATION" }];

function typedPositions(rows: readonly PositionSpec[]): Obj {
  return {
    kind: "positions",
    availability: "AVAILABLE",
    reason_code: null,
    rows: rows.map((r) => ({ id: r.id, symbol: r.symbol, side: r.side, quantity: canonicalDecimal(r.quantity), entry: canonicalDecimal(r.entry), mark: canonicalDecimal(r.mark), unrealised: canonicalDecimal(r.unrealised), leverage: null })),
    returned_count: rows.length,
    omitted_count: 0,
    source_complete: true,
    not_published_columns: NO_LEVERAGE,
  };
}

interface OrderSpec { id: string; symbol: string; type: string; side: "buy" | "sell"; quantity: string; price: string; status: string; since: string }
function typedOrders(rows: readonly OrderSpec[]): Obj {
  return {
    kind: "orders",
    availability: "AVAILABLE",
    reason_code: null,
    rows: rows.map((r) => ({ id: r.id, symbol: r.symbol, type: r.type, side: r.side, quantity: canonicalDecimal(r.quantity), price: canonicalDecimal(r.price), status: r.status, since: r.since, ack_latency_ms: null })),
    returned_count: rows.length,
    omitted_count: 0,
    source_complete: true,
    not_published_columns: NO_ACK,
  };
}

/** The V1 collection envelope: a lit panel, the exact total and the free rows (the typed rows replace them on screen). */
function collection(id: string, authority: string, state: string, freshness: string, asOf: string | null, typed: Obj, free: readonly Obj[]): Obj {
  return {
    envelope: panel(id, authority, state, freshness, asOf, { data: { page: "first" } }),
    exact_total: free.length,
    returned_count: free.length,
    next_cursor: null,
    previous_cursor: null,
    rows: free,
    typed,
  };
}

/* ── CANARY ────────────────────────────────────────────────────────────────── */

const CANARY_STARTED = at(-(5 * DAY_MS + 4 * HOUR_MS + 4 * MIN));
const CANARY_REVIEW = at(-(5 * DAY_MS + 4 * HOUR_MS + 4 * MIN) + 14 * DAY_MS);

/**
 * Net PnL (USDT, tenths) of the canary every 4 hours from the start: 32 points, the last at now - 4 min. It rises to 150.1 and gives back 38.6
 * over the last 24 h, so the Daily PnL KPI (-38.60) is exactly the series' last point minus the point 24 h earlier (asserted).
 */
const WIGGLE = [0, 3, -5, 8, -2, 6, -9, 4, 10, -7, 5, -3, 9, -6, 2, 7, -8, 4, -4, 11, -5, 6, -2, 5, -3, 0];
const CANARY_TENTHS: readonly number[] = [...WIGGLE.map((w, i) => Math.floor((1501 * i) / 25) + w), 1473, 1420, 1436, 1352, 1288, 1115];
const tenths = (t: number): string => canonicalDecimal(`${t < 0 ? "-" : ""}${Math.trunc(Math.abs(t) / 10)}.${Math.abs(t) % 10}`);
export const CANARY_PNL: readonly string[] = CANARY_TENTHS.map(tenths);

interface CapSpec { cap: string; unit: string; limit: string; approved: string; consumed: string; ratio: string }
/** consumed / approved at four places (the fixture's one precision rule), ROUND_HALF_UP, canonical. */
export function usedRatio(consumed: string, approved: string): string {
  const scale = (text: string): bigint => {
    const [w, f = ""] = text.split(".");
    return BigInt(w ?? "0") * 1_000_000n + BigInt((f + "000000").slice(0, 6));
  };
  const c = scale(consumed);
  const a = scale(approved);
  // four places, ROUND_HALF_UP: the fixture's one precision rule, so every readout has two places in percent (QA R5-13)
  const q = (c * 10_000n * 2n + a) / (a * 2n);
  return canonicalDecimal(`${q / 10_000n}.${(q % 10_000n).toString().padStart(4, "0")}`);
}
const capRow = (spec: Omit<CapSpec, "ratio">, asOf: string): Obj => ({
  cap: spec.cap,
  unit: spec.unit,
  policy_limit: avail(canonicalDecimal(spec.limit)),
  approved: canonicalDecimal(spec.approved),
  consumed: avail(canonicalDecimal(spec.consumed)),
  used_ratio: avail(usedRatio(spec.consumed, spec.approved)),
  as_of: avail(asOf),
});

/** WP-B2-S: the "sandbox exit" a room links is the SANDBOX record of its alpha (its own sandbox deployment or the history record), never the room's own deployment id. */
function sandboxExitHref(deploymentId: string): string | null {
  const base = baseDeploymentId(deploymentId);
  const record = isPositiveMode() && resolveStageDeployment(base) !== null ? sandboxRecordIdOf(base) : base;
  return record === null ? null : `/deployments/sandbox/${encodeURIComponent(record)}`;
}
function canaryLit(body: Obj, deploymentId: string, variant: StageVariant): Obj {
  const halted = variant === "halted";
  // A deployment that is already Live ran its Canary BEFORE its activation: a finished 14-day trial, dated by the one lifecycle record.
  const finished = stageOf(deploymentId, "canary") === "live" || (isPositiveMode() && isRetired(worldIdOf(deploymentId, "canary"))); // WP-B2-S
  const stale = variant === "stale";
  const breach = variant === "breach";
  const freshness = stale ? "STALE" : "FRESH";
  const brokerAsOf = stale ? AS_OF_STALE : AS_OF;
  const deployment = body.deployment as Obj;
  withIdentity(deployment, deploymentId);

  body.source_integration_state = "SOURCE_BACKED";
  body.delivery_profile = "LIVE_BINANCE_USDM";
  body.lineage = [
    { kind: "ARTIFACT", value: digestOf(`artifact:${baseDeploymentId(deploymentId)}`), href: null },
    { kind: "R1_APPROVAL", value: "AP-118", href: "/governance/approvals?sel=AP-118" },
    { kind: "R2_APPROVAL", value: "AP-152", href: "/governance/approvals?sel=AP-152" },
    { kind: "SANDBOX_EXIT", value: "SX-14", href: sandboxExitHref(deploymentId) },
    { kind: "CANARY_PROMOTION_PLAN", value: "AP-311", href: null },
  ];

  const capital = breach ? "5210.00" : "3820.00";
  const caps: Omit<CapSpec, "ratio">[] = [
    { cap: "capital", unit: "USDT", limit: "10000", approved: "5000", consumed: capital },
    { cap: "gross_notional", unit: "USDT", limit: "20000", approved: "10000", consumed: "6100.00" },
    { cap: "daily_loss", unit: "USDT", limit: "500", approved: "250", consumed: "38.60" },
    { cap: "open_orders", unit: "COUNT", limit: "40", approved: "20", consumed: "1" },
  ];
  const env = body.envelope as Obj;
  env.status = isPositiveMode() && isRetired(worldIdOf(deploymentId, "canary")) ? "COMPLETED" : "ACTIVE"; // WP-B2-S2 W02: the envelope of a trial the alpha has left is no longer active
  env.reason = "Canary envelope approved by the Canary owner for the 14-day trial.";
  const gateCodes = ["PRODUCTION_COMMAND_INACTIVE", "CANARY_OWNER_GATE_REQUIRED", "BASE_RISK_PROFILE_UNVERIFIED"];
  env.blocker_codes = gateCodes;
  env.limits = { capital_cap: "5000", gross_notional_cap: "10000", daily_loss_cap: "250", max_open_orders: 20, duration_days: 14 };

  const life = body.lifecycle as Obj;
  const started = finished ? at(-(30 * DAY_MS + 4 * MIN) - 14 * DAY_MS) : CANARY_STARTED;
  const review = finished ? at(-(30 * DAY_MS + 4 * MIN)) : CANARY_REVIEW;
  // WP-B2-S3 R5-01: a finished Canary trial is still a Canary record: its declared stage stays LIVE_CANARY (the room never says the deployment "does not declare the Canary stage")
  life.day_index = finished ? 14 : 6;
  life.duration_days = 14;
  life.blocker_codes = env.blocker_codes;
  life.trial = { basis: "STARTED_AT_PLUS_DURATION_DAYS", duration_days: 14, started_at: avail(started), exit_review_opens_at: avail(review) };

  body.stage_facts = stageFacts({
    runtime: finished ? "STOPPED" : halted ? "HALTED" : "RUNNING",
    since: finished ? review : halted ? at(-3 * HOUR_MS) : started,
    verdict: "NO_OPEN_FINDINGS",
    open: 0,
    unknownOrders: 0,
    asOf: brokerAsOf,
    sessions: [{ id: "session_FIXTURE_LAB_canary_1", started, ended: finished ? review : null, state: finished ? "COMPLETED" : halted ? "HALTED" : "RUNNING" }],
  });
  body.source_figures = sourceFigures({
    equity: { internal: "5112.40", broker: "5112.40", unit: "USDT" },
    gross_notional: { internal: "6100.00", broker: "6100.00", unit: "USDT" },
    positions: { internal: "2", broker: "2", unit: "COUNT" },
    open_orders: { internal: "1", broker: "1", unit: "COUNT" },
    fees: { internal: "4.25", broker: "4.25", unit: "USDT" },
  });

  const values: Record<string, string> = { capital_consumed: capital, gross_notional: "6100.00", daily_pnl: "-38.60", open_orders: "1", broker_equity: "5112.40" };
  body.kpis = (body.kpis as Obj[]).map((k) => {
    const auth = String((k.envelope as Obj).source_authority);
    return { ...k, value: values[String(k.key)] ?? null, envelope: panel(`kpi-${String(k.key)}`, auth, "ready", freshness, brokerAsOf) };
  });
  body.source_panels = [
    panel("internal", "EXECUTION", "ready", "FRESH", AS_OF),
    panel("broker", "BROKER", stale ? "stale" : "ready", freshness, brokerAsOf),
    panel("difference", "DERIVED", "ready", freshness, brokerAsOf),
  ];

  const compliance = body.envelope_compliance as Obj;
  compliance.envelope = panel("envelope-compliance", "DERIVED", "ready", "FRESH", AS_OF);
  compliance.consumed = { capital_cap: capital, gross_notional_cap: "6100.00", daily_loss_cap: "38.60", max_open_orders: "1" };
  compliance.rows = caps.map((c) => capRow(c, AS_OF));
  compliance.verdict = breach
    ? { state: "BREACH", basis: "CONSUMED_NOT_ABOVE_APPROVED_PER_CAP", undetermined_caps: [] }
    : { state: "WITHIN_ENVELOPE", basis: "CONSUMED_NOT_ABOVE_APPROVED_PER_CAP", undetermined_caps: [] };
  compliance.base_risk_profile_verified = false;

  const positions = [
    // Gross notional 6,100.00 is the sum of these two at their marks: 1.2 x 3,490.5 + 10 x 191.14.
    { id: "pos_FIXTURE_LAB_cny_1", symbol: "ETHUSDT", side: "long", quantity: "1.2", entry: "3410.5", mark: "3490.5", unrealised: "96" },
    { id: "pos_FIXTURE_LAB_cny_2", symbol: "SOLUSDT", side: "long", quantity: "10", entry: "185.14", mark: "191.14", unrealised: "60" },
  ] as const satisfies readonly PositionSpec[];
  body.positions = collection(
    "positions", "EXECUTION", "ready", freshness, brokerAsOf, typedPositions(positions),
    positions.map((p) => ({ symbol: p.symbol, side: p.side.toUpperCase(), qty: p.quantity, entry_price: p.entry })),
  );
  const orders = [
    { id: "ord_FIXTURE_LAB_cny_1", symbol: "ETHUSDT", type: "LIMIT", side: "sell", quantity: "0.6", price: "3560", status: "ACCEPTED", since: at(-23 * MIN) },
  ] as const satisfies readonly OrderSpec[];
  body.blotter = collection(
    "blotter", "EXECUTION", "ready", freshness, brokerAsOf, typedOrders(orders),
    orders.map((o) => ({ order_id: o.id, price: o.price, type: o.type })),
  );

  // A stale screen never shows data newer than its stale stamp: the points after it are not sent.
  const upTo = stale ? Date.parse(AS_OF_STALE) : Number.POSITIVE_INFINITY;
  const grid = CANARY_PNL.map((value, i) => ({ t: Date.parse(CANARY_STARTED) + i * 4 * HOUR_MS, value })).filter((point) => point.t <= upTo);
  const finishedGrid = Array.from({ length: 15 }, (_, d) => CANARY_PNL[Math.round((d * 31) / 14)]!);
  body.series = {
    envelope: panel("series", "DERIVED", "ready", "FRESH", AS_OF),
    ...(finished
      ? seriesMembers(at(-(30 * DAY_MS + 4 * MIN) - 14 * DAY_MS), DAY_MS, "1d", finishedGrid)
      : seriesMembers(CANARY_STARTED, 4 * HOUR_MS, "4h", grid.map((point) => point.value))),
  };

  const rb = body.rollback_readiness as Obj;
  rb.envelope = panel("rollback-readiness", "EXECUTION", "ready", "FRESH", AS_OF);
  rb.ready = !halted;
  rb.blocker_codes = halted ? ["ROLLBACK_BLOCKED_BY_HALT"] : [];
  rb.evidence_hash = `sha256:${"c".repeat(64)}`;
  rb.items = [
    { key: "flatten_plan", ready: avail(!halted), checked_at: avail(at(-34 * MIN)) },
    { key: "paper_twin", ready: avail(true), checked_at: avail(at(-5 * MIN)) },
    { key: "broker_data", ready: avail(!stale), checked_at: avail(brokerAsOf) },
    { key: "rollback_drill", ready: avail(true), checked_at: avail(at(-(6 * DAY_MS + 2 * HOUR_MS + 4 * MIN))) },
  ];

  // The command policy keeps its published flags (no command route exists, every decision is closed; a stale broker blocks scale-up
  // only); its blocker codes say what is true of a LIT canary instead of the dark body's "source unavailable".
  const policy = body.command_policy as Obj;
  (policy.protective as Obj).blocker_codes = ["PRODUCTION_COMMAND_INACTIVE"];
  (policy.scale_up as Obj).blocker_codes = stale ? [...gateCodes, "BROKER_SYNC_STALE"] : gateCodes;
  return body;
}

/* ── LIVE ──────────────────────────────────────────────────────────────────── */

const LIVE_ACTIVATED = at(-(30 * DAY_MS + 4 * MIN));
/** Net PnL (USDT) of the live deployment, daily from 17 Sep 08:00Z, 31 points, the last at 17 Oct 12:00Z (low -900.06, high 7523.04). */
const LIVE_PNL = [
  "0", "-420.5", "-900.06", "-312.4", "240.3", "1850.2", "3720.55", "2790.1", "4270.4", "3010.75", "5520.9", "4410.3", "4750.15", "2890.6", "4630", "3830.25",
  "2760.8", "1630.5", "2810.35", "1930.2", "-240.7", "-310.15", "-90.4", "2105.6", "4480.3", "5830.75", "5790.2", "7523.04", "6610.4", "4740.8", "4210.55",
];

const LIVE_POSITIONS: readonly PositionSpec[] = [
  { id: "pos_FIXTURE_LAB_lv_1", symbol: "BTCUSDT", side: "long", quantity: "0.4", entry: "61120", mark: "66470.5", unrealised: "2140.2" },
  { id: "pos_FIXTURE_LAB_lv_2", symbol: "ETHUSDT", side: "short", quantity: "2.1", entry: "3412.5", mark: "3514.8", unrealised: "-214.83" },
  { id: "pos_FIXTURE_LAB_lv_3", symbol: "SOLUSDT", side: "long", quantity: "18", entry: "148.2", mark: "170.54", unrealised: "402.12" },
  { id: "pos_FIXTURE_LAB_lv_4", symbol: "BNBUSDT", side: "long", quantity: "3.5", entry: "566.4", mark: "591.7", unrealised: "88.55" },
];
const LIVE_ORDERS: readonly OrderSpec[] = [
  { id: "ord_FIXTURE_LAB_lv_1", symbol: "BTCUSDT", type: "LIMIT", side: "sell", quantity: "0.1", price: "67200", status: "ACCEPTED", since: at(-52 * MIN) },
  { id: "ord_FIXTURE_LAB_lv_2", symbol: "SOLUSDT", type: "LIMIT", side: "buy", quantity: "4", price: "166.5", status: "ACCEPTED", since: at(-24 * MIN) },
];

function liveLit(body: Obj, deploymentId: string, variant: StageVariant): Obj {
  const predecessor = predecessorCanary(deploymentId);
  const mismatch = variant === "mismatch";
  const stale = variant === "stale";
  const gap = variant === "gap";
  const halted = variant === "halted";
  const freshness = stale ? "STALE" : "FRESH";
  const brokerAsOf = stale ? AS_OF_STALE : AS_OF;
  const visible = !mismatch;
  withIdentity(body.deployment as Obj, deploymentId);
  (body.deployment as Obj).activated_at = LIVE_ACTIVATED;

  body.source_integration_state = "SOURCE_BACKED";
  body.delivery_profile = "LIVE_BINANCE_USDM";
  const life = body.lifecycle as Obj;
  life.declared_stage = "LIVE_FULL";
  life.activated_at = LIVE_ACTIVATED;
  life.blocker_codes = ["PRODUCTION_COMMAND_INACTIVE"];

  body.lineage = [
    { kind: "ARTIFACT", state: "AVAILABLE", value: digestOf(`artifact:${baseDeploymentId(deploymentId)}`), href: null },
    { kind: "R1_APPROVAL", state: "AVAILABLE", value: "AP-118", href: "/governance/approvals?sel=AP-118" },
    { kind: "R2_APPROVAL", state: "AVAILABLE", value: "AP-152", href: "/governance/approvals?sel=AP-152" },
    { kind: "SANDBOX_EXIT", state: "AVAILABLE", value: "SX-14", href: sandboxExitHref(deploymentId) },
    predecessor === null
      ? { kind: "CANARY_ENVELOPE", state: "UNAVAILABLE", value: null, href: null }
      : { kind: "CANARY_ENVELOPE", state: "AVAILABLE", value: "cenv_FIXTURE_LAB_1", href: `/deployments/live/${encodeURIComponent(predecessor)}/canary` },
    { kind: "CANARY_EXIT", state: "AVAILABLE", value: "Canary exit review", href: null },
    { kind: "LIVE_DUAL_APPROVAL", state: "AVAILABLE", value: "AP-402", href: "/governance/approvals" },
  ];

  body.stage_facts = stageFacts({
    runtime: halted ? "HALTED" : "RUNNING",
    since: LIVE_ACTIVATED,
    verdict: mismatch ? "OPEN_FINDINGS" : "NO_OPEN_FINDINGS",
    open: mismatch ? 1 : 0,
    unknownOrders: 0,
    asOf: brokerAsOf,
    sessions: [{ id: "session_FIXTURE_LAB_live_1", started: LIVE_ACTIVATED, ended: null, state: halted ? "HALTED" : "RUNNING" }],
  });

  const brokerEquity = mismatch ? "60131.12" : "60118.40";
  body.source_figures = sourceFigures({
    equity: { internal: "60118.40", broker: mismatch ? null : "60118.40", unit: "USDT" },
    gross_notional: { internal: "39109.95", broker: mismatch ? null : "39109.95", unit: "USDT" },
    positions: { internal: "4", broker: mismatch ? null : "4", unit: "COUNT" },
    open_orders: { internal: "2", broker: mismatch ? null : "2", unit: "COUNT" },
    fees: { internal: "412.36", broker: mismatch ? null : "412.36", unit: "USDT" },
  });

  const values: Record<string, string | null> = { capital: "60000.00", gross_notional: "39109.95", daily_pnl: "-530.25", open_orders: "2", broker_equity: mismatch ? null : brokerEquity };
  body.kpis = (body.kpis as Obj[]).map((k) => {
    const key = String(k.key);
    const brokerSide = key === "broker_equity";
    // Daily PnL is the internal ledger's figure (after fees), so a broker mismatch does not hide it; only broker equity is broker-authored.
    const auth = key === "daily_pnl" ? "EXECUTION" : String((k.envelope as Obj).source_authority);
    return {
      ...k,
      value: values[key] ?? null,
      envelope: panel(`kpi-${key}`, auth, brokerSide && mismatch ? "suppressed" : "ready", freshness, brokerAsOf),
    };
  });
  const brokerState = mismatch ? "suppressed" : stale ? "stale" : "ready";
  body.source_panels = {
    internal: panel("internal", "EXECUTION", "ready", freshness, brokerAsOf),
    broker: panel("broker", "BROKER", brokerState, freshness, mismatch ? null : brokerAsOf),
    difference: panel("difference", "DERIVED", mismatch ? "suppressed" : "ready", freshness, mismatch ? null : brokerAsOf),
  };
  body.broker_consistency = {
    state: mismatch ? "MISMATCH" : "IN_SYNC",
    mismatch_behavior: "SUPPRESS_ALL_BROKER_VALUES",
    broker_values_visible: visible,
    finding_href: mismatch ? liveFindingHref(deploymentId) : null, // WP-B2-S3 R5-03: the finding of the portfolio this deployment is booked on, in its environment
    dry_run_reconcile_href: mismatch ? `/execution/operations?target_id=${encodeURIComponent(deploymentId)}` : null, // the reconcile targets the deployment the card names
    blocker_codes: [],
  };
  body.projection_continuity = {
    state: gap ? "GAP" : "CONTIGUOUS",
    epoch: "41",
    cursor: null,
    sequence: 88240,
    gap_detected: gap,
    affected_authorities: gap ? ["BROKER", "DERIVED"] : [],
    blocker_codes: [],
    gap_ranges: gap ? avail([{ from: AS_OF_STALE, to: AS_OF }]) : avail([]),
  };

  body.positions = collection(
    "positions", "EXECUTION", "ready", "FRESH", AS_OF, typedPositions(LIVE_POSITIONS),
    LIVE_POSITIONS.map((p) => ({ instrument: p.symbol, side: p.side.toUpperCase(), qty: p.quantity, entry_px: p.entry })),
  );
  body.orders = collection(
    "orders", "EXECUTION", "ready", "FRESH", AS_OF, typedOrders(LIVE_ORDERS),
    LIVE_ORDERS.map((o) => ({ order_id: o.id, instrument: o.symbol, price: o.price, state: o.status })),
  );
  (body.realtime as Obj).blocker_codes = ["REALTIME_INACTIVE"];
  // The canary envelope that governed the trial before this activation: promoted, so Active for Live.
  if (predecessor === null) body.predecessor_canary_envelope = null;
  else {
    const envelope = body.predecessor_canary_envelope as Obj;
    envelope.status = "ACTIVE";
    envelope.active_for_live_full = true;
  }
  body.open_order_footer = { envelope: panel("open-order-footer", "EXECUTION", "ready", "FRESH", AS_OF), exact_open_order_count: 2 };
  body.incidents = {
    envelope: panel("incidents", "EXECUTION", mismatch ? "ready" : "empty", "FRESH", AS_OF),
    exact_total: 0,
    returned_count: 0,
    next_cursor: null,
    previous_cursor: null,
    rows: [],
  };
  body.series = { envelope: panel("series", "DERIVED", "ready", "FRESH", AS_OF), ...seriesMembers(LIVE_ACTIVATED, 86_400_000, "1d", LIVE_PNL, "USDT", stale ? AS_OF_STALE : at(-4 * MIN)) }; // WP-P: a stale screen never draws data newer than its stale stamp

  const rb = body.rollback_readiness as Obj;
  rb.envelope = panel("rollback-readiness", "EXECUTION", "ready", "FRESH", AS_OF);
  rb.ready = !halted && !mismatch;
  rb.blocker_codes = [];
  rb.evidence_hash = `sha256:${"c".repeat(64)}`;
  return body;
}

/* ── SANDBOX ───────────────────────────────────────────────────────────────── */

const SANDBOX_STARTED = at(-(18 * HOUR_MS + 14 * MIN));

function sandboxLit(body: Obj, deploymentId: string, variant: StageVariant): Obj {
  const mismatch = variant === "mismatch";
  const halted = variant === "halted";
  const stale = variant === "stale";
  const freshness = stale ? "STALE" : "FRESH";
  const sandboxAsOf = stale ? at(-44 * MIN) : AS_OF;
  withIdentity(body.certification as Obj, deploymentId);
  body.source_integration_state = "SOURCE_BACKED";
  body.delivery_profile = "LIVE_BINANCE_USDM";

  body.stage_facts = stageFacts({
    runtime: halted ? "HALTED" : "RUNNING",
    since: SANDBOX_STARTED,
    verdict: "OPEN_FINDINGS",
    open: mismatch ? 3 : 2,
    unknownOrders: 0,
    asOf: sandboxAsOf,
    sessions: [{ id: "session_FIXTURE_LAB_sbx_1", started: SANDBOX_STARTED, ended: null, state: halted ? "HALTED" : "RUNNING" }],
  });
  body.source_figures = sourceFigures({
    equity: { internal: "10184.20", broker: mismatch ? "10231.07" : "10184.21", unit: "USDT" },
    gross_notional: { internal: "3044.80", broker: "3044.80", unit: "USDT" },
    positions: { internal: "1", broker: "1", unit: "COUNT" },
    open_orders: { internal: "2", broker: "2", unit: "COUNT" },
    fees: { internal: "12.34", broker: "12.35", unit: "USDT" },
  });
  const panelOf = (id: string, authority: string): Obj => {
    const lit = panel(id, authority, "ready", freshness, sandboxAsOf, { delivery_profile: "LIVE_BINANCE_USDM" });
    // The sandbox panel shape carries its own members (S3 certification body); the common ones are enough for the reader.
    return { ...lit, source_sequence: null, source_completeness: "COMPLETE", poll_interval_ms: 60000, formula_version: id === "difference" ? "sandbox-certification.v1" : null };
  };
  body.source_panels = [panelOf("internal", "EXECUTION"), panelOf("broker", "BROKER"), panelOf("difference", "DERIVED")];
  if (mismatch) {
    // The equity gap is explained by a finding of its own (the double's two findings explain 0.01 and 4 s, not 46.87).
    const findings = body.findings as Obj;
    (findings.rows as Obj[]).unshift({ finding_id: "fnd_FIXTURE_LAB_equity", severity: "WARNING", source_authority: "DERIVED", finding_code: "EQUITY_DIFF", summary: "Equity differs by 46.87 USDT", blocking: false, evidence_hash: null, as_of: null, resolved_at: null, created_at: at(-3 * HOUR_MS) });
    findings.total_count = (findings.rows as Obj[]).length;
    findings.returned_count = (findings.rows as Obj[]).length;
  }
  return body;
}

/* ── PAPER (GET /screens/paper/{id}) ───────────────────────────────────────── */

const PAPER_STARTED = at(-(5 * DAY_MS + 4 * HOUR_MS + 4 * MIN));
const PAPER_AS_OF = at(-(2 * HOUR_MS + 50 * MIN));

/** A published VN equity venue calendar (FE-070): the source states the session, the breaks, the holidays and whether the venue is open. */
function vnCalendar(): Obj {
  return {
    schema_version: "execution.venue-calendar.v1",
    market: "VN_EQUITY",
    basis: "SOURCE_SESSION_CALENDAR_NOT_A_CLIENT_INFERENCE",
    timezone: avail("Asia/Ho_Chi_Minh"),
    windows: avail([
      { name: "Opening auction", kind: "OPENING_AUCTION", open: "09:00", close: "09:15" },
      { name: "Morning session", kind: "TRADING_SESSION", open: "09:15", close: "11:30" },
      { name: "Afternoon session", kind: "TRADING_SESSION", open: "13:00", close: "14:30" },
      { name: "Closing auction", kind: "CLOSING_AUCTION", open: "14:30", close: "14:45" },
    ]),
    breaks: avail([{ name: "BREAK", from: "11:30", to: "13:00", basis: "GAP_BETWEEN_PUBLISHED_WINDOWS" }]),
    holidays: avail([{ date: at(-45 * DAY_MS).slice(0, 10), name: "National Day" }]),
    is_open: avail(false),
    as_of: avail(PAPER_AS_OF),
  };
}

function paperLit(body: Obj, deploymentId: string, variant: StageVariant, vnRoute: boolean): Obj {
  const data = body.data;
  if (!isObj(data)) return body;
  const halted = variant === "halted";
  const who = identityOf(deploymentId);
  const named = (row: Obj): void => {
    withIdentity(row, deploymentId);
    // The double's own strategy id belongs to another universe; for a known deployment it is its alpha, so the page and its links agree.
    if (who !== null) row.strategy_id = who.alphaId;
    if (who !== null) row.portfolio_id = who.portfolioId;
  };
  if (isObj(data.deployment)) named(data.deployment);
  if (Array.isArray(data.deployments)) for (const row of data.deployments) if (isObj(row)) named(row);
  data.stage_facts = stageFacts({
    runtime: halted ? "HALTED" : "RUNNING",
    since: PAPER_STARTED,
    verdict: "OPEN_FINDINGS",
    open: 1,
    unknownOrders: 1,
    asOf: PAPER_AS_OF,
    sessions: [{ id: "session_FIXTURE_LAB_pap_1", started: PAPER_STARTED, ended: null, state: halted ? "HALTED" : "RUNNING" }],
  });
  // A VN deployment publishes its venue calendar: the `/vn-market` read always, and the plain read when the id says so (`_vn`), which is what draws the VN chip.
  if (vnRoute || variant === "vn") data.venue_calendar = vnCalendar();
  return body;
}

function qualityOfBook(body: Obj, deploymentId: string): Obj | null {
  const found = resolveStageDeployment(worldIdOf(deploymentId, "paper"));
  if (found === null || !isObj(body.data)) return null;
  const book = stageBookOf(found.deployment.id); // WP-B2-S: the SAME list the Paper tabs and the gate count
  const orders = book.orders.length;
  const rejected = book.orders.filter((o) => String(o.status).toUpperCase() === "REJECTED").length;
  const filled = book.orders.filter((o) => String(o.status).toUpperCase().includes("FILLED")).length;
  body.data = {
    ...body.data,
    execution_session_population: "1",
    order_population: String(orders),
    fill_population: String(book.fills.length),
    submitted_count: String(orders),
    risk_rejected_count: "0",
    broker_rejected_count: String(rejected),
    filled_count: String(filled),
    rejected_count: String(rejected),
    reject_rate: { numerator: String(rejected), denominator: String(orders) },
  };
  return body;
}

/* ── entry ─────────────────────────────────────────────────────────────────── */

const LEGACY_DEPLOYMENT = /^dep_(?:\d+|a|vnm)$/;

/**
 * `path` is the request path with `/api/v1/execution` removed. Returns the lit body for a V1 stage read of a stage deployment, or
 * `null` when the answer is not one of these (a V2 body, another route, the `_dark` variant, a legacy id): the caller keeps its answer.
 */
export function simulateStage(path: string, answerBody: unknown): Obj | null {
  if (!isObj(answerBody)) return null;
  const seg = path.split("/").filter(Boolean).map((part) => decodeURIComponent(part));
  // The execution-quality derivation of a world deployment counts the SAME book the Paper tabs list (orders, fills, rejected), never its own constants.
  if (seg[0] === "derivations" && seg[1] === "deployments" && seg[3] === "execution-quality" && seg.length === 4 && isPositiveMode() && !LEGACY_DEPLOYMENT.test(seg[2]!)) return qualityOfBook(clone(answerBody), seg[2]!);
  let id: string | undefined;
  let kind: "canary" | "live" | "sandbox" | "paper" | null = null;
  if (seg[0] === "deployments" && seg.length === 3) {
    id = seg[1];
    kind = seg[2] === "canary" ? "canary" : seg[2] === "live" ? "live" : seg[2] === "certification" ? "sandbox" : null;
  } else if (seg[0] === "screens" && seg[1] === "paper" && seg[2] !== undefined && (seg.length === 3 || (seg.length === 4 && seg[3] === "vn-market"))) {
    id = seg[2];
    kind = "paper";
  }
  if (kind === null || id === undefined || LEGACY_DEPLOYMENT.test(id)) return null;
  const variant = variantOf(id);
  if (variant === "dark") {
    // WP-B2-S3 R4-04, R4-05: the dark Sandbox and Paper pages of a deployment of the world carry ITS record (one book); only the source facts are the typed absences
    const darkOwn = isPositiveMode() && (kind === "sandbox" || kind === "paper") ? resolveStageDeployment(baseDeploymentId(id)) : null;
    if (darkOwn !== null && darkOwn.standing.stage === kind) return darkHybrid(kind as "sandbox" | "paper", answerBody, id) ?? darkOfWorld(answerBody, id);
    return darkOfWorld(answerBody, id);
  }
  // A stage page the deployment has not reached is not lit: the published dark body stands (typed absence), whatever the URL says.
  // WP-B2-S: a deployment of the world has ONE stage; its page for any other stage is typed absence (a sandbox page of a canary deployment would put one id in two stages).
  const own = isPositiveMode() ? resolveStageDeployment(baseDeploymentId(id)) : null;
  if (own !== null ? own.standing.stage !== kind : !reached(stageOf(id, kind), kind)) return darkOfWorld(answerBody, id);
  // The Canary page of a deployment that is already Live would have to show a finished trial of ITS OWN: no world source carries one, so it is
  // typed (the published dark body); the way to the trial is the predecessor link of the Live page, which names the canary deployment itself.
  if (kind === "canary" && stageOf(id, kind) === "live") return darkOfWorld(answerBody, id);
  const schema = answerBody.schema_version;
  const body = clone(answerBody);
  switch (kind) {
    case "canary":
      return schema === "execution.canary-control-room.v1" ? worldStage(kind, canaryLit(body, id, variant), id, variant) : null;
    case "live":
      return schema === "execution.live-full-operations.v1" ? worldStage(kind, liveLit(body, id, variant), id, variant) : null;
    case "sandbox":
      return schema === "governance.sandbox-certification.v1" ? worldStage(kind, sandboxLit(body, id, variant), id, variant) : null;
    case "paper":
      return worldStage(kind, paperLit(body, id, variant, seg[3] === "vn-market"), id, variant);
  }
}

// ===== WP-B2-S2 begin: W01b, a deployment of the world has ONE stage; the stage page of any other stage is a typed refusal (404), not a template body
const STAGE_ROUTE = { canary: "canary", live: "live", certification: "sandbox" } as const;
/** The stage a stage-route path asks for (`paper` | `sandbox` | `canary` | `live`) and the deployment id it names, or null for any other path. */
function stageRouteOf(path: string): { id: string; kind: "paper" | "sandbox" | "canary" | "live" } | null {
  const seg = path.split("/").filter(Boolean).map((part) => decodeURIComponent(part));
  if (seg[0] === "deployments" && seg.length === 3 && seg[2]! in STAGE_ROUTE) return { id: seg[1]!, kind: STAGE_ROUTE[seg[2] as keyof typeof STAGE_ROUTE] };
  if (seg[0] === "screens" && seg[1] === "paper" && seg[2] !== undefined && (seg.length === 3 || (seg.length === 4 && seg[3] === "vn-market"))) return { id: seg[2], kind: "paper" };
  return null;
}
/** True when the path is a stage page of a deployment of the world (booked or history record) for a stage that is NOT the deployment's own. The caller answers 404. */
export function stagePageIsForeign(path: string): boolean {
  const route = stageRouteOf(path);
  if (route === null || !isPositiveMode() || LEGACY_DEPLOYMENT.test(route.id) || variantOf(route.id) === "dark") return false;
  const own = resolveStageDeployment(baseDeploymentId(route.id));
  return own !== null && own.standing.stage !== route.kind;
}
// ===== WP-B2-S2 end

/**
 * WORLD: a dark stage page (typed absences) of a deployment the world holds keeps the typed absences but NOT the published fixture's identity (dep_88, pf_crypto,
 * acct_*_grid): the portfolio, the account and the venue it links to are the deployment's own, so no breadcrumb of a dark room is a dead end (QA3 R5-06).
 */
function darkOfWorld(answerBody: Obj, requestedId: string): Obj | null {
  if (!isPositiveMode() || !(isObj(answerBody.deployment) || isObj(answerBody.certification))) return null; // WP-B2-S: the certification body carries its identity under `certification`
  const found = resolveStageDeployment(WORLD_ALIAS[baseDeploymentId(requestedId)] ?? baseDeploymentId(requestedId));
  if (found === null) return null;
  const body = clone(answerBody);
  const deployment = (isObj(body.deployment) ? body.deployment : body.certification) as Obj;
  const { alpha, deployment: d } = found;
  if (Array.isArray(body.lineage)) body.lineage = worldLineage(body.lineage as Obj[], alpha.id, d.id, requestedId); // WP-B2-S3 R5-04, R5-06: the lineage of this alpha, not the published fixture's ids
  if (deployment.alpha_reason_code !== undefined) { deployment.alpha_reason_code = null; deployment.portfolio_name_reason_code = null; }
  if (isObj(deployment.account_binding)) { deployment.account_binding.account_id = d.accountId; if ("external_account_ref" in deployment.account_binding) deployment.account_binding.external_account_ref = d.accountId; }
  deployment.deployment_id = requestedId;
  deployment.portfolio_id = d.portfolioId;
  deployment.portfolio_name = d.portfolioName;
  deployment.alpha_id = alpha.id;
  deployment.alpha_name = alpha.label;
  deployment.account_id = d.accountId;
  deployment.venue = d.venue;
  return body;
}

// ===== WP-P begin (the stage bodies state the WORLD's facts: ONE account, allocation, dates, positions at one mark, orders, series per deployment)
/**
 * In the positive-like scenarios the lit bodies above keep their structure, variants and typed absences, and the FACTS in them are replaced by the
 * world's (e2e/bffWorld.ts): the account the deployment is booked on, its allocation (Capital), the dates of its stage, the positions it holds at the
 * one mark per symbol, its working orders, the gross notional that is the sum of those positions, the equity that is allocation + realized + unrealized,
 * and a net PnL series that ends on realized + unrealized. A deployment the world does not hold keeps the body as it was.
 */
function worldStage(kind: "canary" | "live" | "sandbox" | "paper", body: Obj | null, deploymentId: string, variant: StageVariant): Obj | null {
  if (body === null || !isPositiveMode()) return body;
  const found = resolveStageDeployment(worldIdOf(deploymentId, kind)); // WP-B2-S3: a state variant of a stage the alpha left is read from a deployment that IS in that stage
  if (found === null) return body;
  const { alpha, deployment: d, standing } = found;
  if (Array.isArray(body.lineage)) body.lineage = worldLineage(body.lineage as Obj[], alpha.id, worldIdOf(deploymentId, kind), deploymentId); // WP-B2-S3
  const retired = standing.status === "completed"; // WP-B2-S: the stage the alpha has LEFT: stopped, exited on a date, final figures, nothing open
  const exitMs = standing.exitMs;
  const life = lifecycleOf(alpha.id);
  const stale = variant === "stale";
  const mismatch = variant === "mismatch";
  const haltedAtMs = haltedSinceMs(d.id); // WP-B2-S3: the world's one halt fact
  const halted = variant === "halted" || haltedAtMs !== null;
  const haltedIso = haltedAtMs === null ? null : new Date(haltedAtMs).toISOString();
  const asOf = stale ? AS_OF_STALE : AS_OF;
  const iso = (ms: number): string => new Date(ms).toISOString();
  const alloc = worldToCents(d.allocation);
  const net = worldToCents(d.realized); // WP-B2-S2 W09: the room's Net PnL is the published net_pnl (realized), the same figure Fleet, Alpha 360 and Compare state; the open positions' unrealized stays on the positions
  const equity = worldCents(alloc + net);
  const trialEnded = retired; // closed: a stage the alpha left holds no open position or working order, whichever stage it is // the Canary page of a deployment that is Live now: a finished trial holds nothing open
  const gross = trialEnded ? "0.00" : grossNotional(d.id);
  const positions = (trialEnded ? [] : positionsOf(d.id)).map((p) => ({ id: p.id, symbol: p.symbol, side: p.side, quantity: p.quantity, entry: p.entry, mark: p.mark, unrealised: p.unrealised })) as PositionSpec[];
  const orders = (trialEnded ? [] : workingOrdersOf(d.id)).map((o) => ({ id: o.id, symbol: o.symbol, type: o.type, side: o.side, quantity: o.quantity, price: o.price, status: o.status, since: iso(o.sinceMs) })) as OrderSpec[];
  const fees = worldCents(costOverRun(alloc, "fees")); // WP-B2-C3 (R2-06): the world's one fee model; Alpha 360's cost drag is this, pro rata to the window
  const figures = (brokerEquity: boolean) => sourceFigures({
    equity: { internal: equity, broker: brokerEquity ? equity : null, unit: "USDT" },
    gross_notional: { internal: gross, broker: brokerEquity ? gross : null, unit: "USDT" },
    positions: { internal: String(positions.length), broker: brokerEquity ? String(positions.length) : null, unit: "COUNT" },
    open_orders: { internal: String(orders.length), broker: brokerEquity ? String(orders.length) : null, unit: "COUNT" },
    fees: { internal: fees, broker: brokerEquity ? fees : null, unit: "USDT" },
  });
  const seriesTo = stale ? Date.parse(AS_OF_STALE) : NOW_MS - 4 * MIN;
  const dailyOf = (values: { value: string }[], back: number): string => canonicalDecimal(worldCents(worldToCents(values[values.length - 1]!.value) - worldToCents(values[Math.max(0, values.length - 1 - back)]!.value)));
  const seriesOf = (id: string, fromMs: number, toMs: number, points: number, target: bigint) => { const walk = netPnlSeries(id, fromMs, toMs, points, target); return walk.length > 0 ? walk : historyNetSeries(id, fromMs, toMs, points, target); }; // WP-B2-S3: a history record has no booked deployment
  const setKpis = (values: Record<string, string | null>): void => {
    body.kpis = (body.kpis as Obj[]).map((k) => ({ ...k, value: values[String(k.key)] ?? null }));
  };
  const withIdentityOf = (target: unknown): void => {
    if (!isObj(target)) return;
    target.account_id = d.accountId;
    if ("external_account_ref" in target) target.external_account_ref = d.accountId;
    if (isObj(target.account_binding)) { target.account_binding.account_id = d.accountId; if ("external_account_ref" in target.account_binding) target.account_binding.external_account_ref = d.accountId; }
    target.alpha_id = alpha.id;
    target.alpha_name = alpha.label;
    if ("alpha_reason_code" in target) { target.alpha_reason_code = null; target.portfolio_name_reason_code = null; } // WP-B2-S: the identity is read
    target.portfolio_id = d.portfolioId;
    target.portfolio_name = d.portfolioName;
  };

  if (kind === "live") {
    const started = iso(life.liveFromMs);
    const dep = body.deployment as Obj;
    withIdentityOf(dep);
    dep.activated_at = started;
    (body.lifecycle as Obj).activated_at = started;
    // WP-B2-S3 (QA7 N5-01): the predecessor envelope is the LINKED canary's own record (its caps from its allocation, as its room states them, COMPLETED), never active for live
    const predecessorId = predecessorCanary(d.id);
    const trial = predecessorId === null ? null : resolveStageDeployment(predecessorId);
    if (trial !== null && isObj(body.predecessor_canary_envelope)) {
      const trialAlloc = worldToCents(trial.deployment.allocation);
      const envelope = body.predecessor_canary_envelope as Obj;
      envelope.envelope_id = `cenv_${predecessorId}`;
      envelope.status = "COMPLETED";
      envelope.active_for_live_full = false;
      envelope.limits = { capital_cap: worldCents(trialAlloc), gross_notional_cap: worldCents(trialAlloc * 3n / 2n), daily_loss_cap: worldCents(trialAlloc / 100n), max_open_orders: 20 };
    }
    const series = seriesOf(d.id, life.liveFromMs, seriesTo, Math.max(8, life.liveDays + 1), net);
    body.stage_facts = stageFacts({ runtime: halted ? "HALTED" : "RUNNING", since: halted ? haltedIso ?? started : started, verdict: mismatch ? "OPEN_FINDINGS" : "NO_OPEN_FINDINGS", open: mismatch ? 1 : 0, unknownOrders: 0, asOf,
      sessions: [{ id: `session_${d.id}_live_1`, started, ended: null, state: halted ? "HALTED" : "RUNNING" }] });
    body.source_figures = figures(!mismatch);
    setKpis({ capital: worldCents(alloc), gross_notional: gross, daily_pnl: dailyOf(series, 1), open_orders: String(orders.length), broker_equity: mismatch ? null : equity });
    body.positions = collection("positions", "EXECUTION", "ready", "FRESH", AS_OF, typedPositions(positions), positions.map((p) => ({ instrument: p.symbol, side: p.side.toUpperCase(), qty: p.quantity, entry_px: p.entry })));
    body.orders = collection("orders", "EXECUTION", "ready", "FRESH", AS_OF, typedOrders(orders), orders.map((o) => ({ order_id: o.id, instrument: o.symbol, price: o.price, state: o.status })));
    (body.open_order_footer as Obj).exact_open_order_count = orders.length;
    body.series = { envelope: panel("series", "DERIVED", "ready", "FRESH", AS_OF), ...seriesMembers(started, WORLD_DAY_MS, "1d", series.map((point) => point.value), "USDT", iso(series[series.length - 1]!.t)) };
  } else if (kind === "canary") {
    const finished = retired; // WP-B2-S: a canary the alpha has left is a finished trial of ITS OWN dates (started, exited), never "day N of 14" now
    const startMs = standing.fromMs;
    const endMs = finished ? (exitMs ?? standing.fromMs) : startMs + 14 * WORLD_DAY_MS;
    const started = iso(startMs);
    withIdentityOf(body.deployment);
    const lifecycle = body.lifecycle as Obj;
    lifecycle.day_index = finished ? standing.days : life.canaryDays;
    if (finished) lifecycle.duration_days = standing.days;
    lifecycle.trial = { basis: "STARTED_AT_PLUS_DURATION_DAYS", duration_days: finished ? standing.days : 14, started_at: avail(started), exit_review_opens_at: avail(iso(endMs)) };
    const points = Math.max(8, Math.floor(((finished ? endMs : seriesTo) - startMs) / (4 * HOUR_MS)) + 1);
    const series = seriesOf(d.id, startMs, finished ? endMs : seriesTo, points, net);
    // approved caps from the book: capital = the allocation, gross = 1.5x, daily loss = 1% of it; consumed from the same positions and series
    const breach = variant === "breach";
    const capApproved = worldCents(alloc);
    const grossApproved = worldCents(alloc * 3n / 2n);
    const lossApproved = worldCents(alloc / 100n);
    const dailyPnl = finished ? null : dailyOf(series, 6); // WP-B2-C3 (R5-10): a trial the alpha left has no daily PnL after its exit
    const dailyLoss = dailyPnl !== null && worldToCents(dailyPnl) < 0n ? worldCents(-worldToCents(dailyPnl)) : "0.00";
    const capConsumed = breach ? worldCents(alloc * 11n / 10n) : worldCents(alloc);
    const caps: Omit<CapSpec, "ratio">[] = [
      { cap: "capital", unit: "USDT", limit: worldCents(alloc * 2n), approved: capApproved, consumed: capConsumed },
      { cap: "gross_notional", unit: "USDT", limit: worldCents(alloc * 3n), approved: grossApproved, consumed: gross },
      { cap: "daily_loss", unit: "USDT", limit: worldCents(alloc / 50n), approved: lossApproved, consumed: dailyLoss },
      { cap: "open_orders", unit: "COUNT", limit: "40", approved: "20", consumed: String(orders.length) },
    ];
    const env = body.envelope as Obj;
    env.envelope_id = `cenv_${d.id}`; // WP-B2-S3: one envelope per canary deployment
    env.limits = { capital_cap: capApproved, gross_notional_cap: grossApproved, daily_loss_cap: lossApproved, max_open_orders: 20, duration_days: finished ? standing.days : 14 };
    const compliance = body.envelope_compliance as Obj;
    // the legacy limits member is the APPROVED caps too (never the draft proposal the dark body carries)
    compliance.limits = { capital_cap: capApproved, gross_notional_cap: grossApproved, daily_loss_cap: lossApproved, max_open_orders: 20 };
    compliance.consumed = { capital_cap: capConsumed, gross_notional_cap: gross, daily_loss_cap: dailyLoss, max_open_orders: String(orders.length) };
    compliance.rows = caps.map((c) => capRow(c, AS_OF));
    // The verdict is the rows' own: any consumed figure above its approved limit is a BREACH, else every cap is proven within.
    const above = caps.some((c) => limitState(worldToCents(c.consumed), worldToCents(c.approved)) === "breach"); // WP-B2-C3 (R5-07): exactly at the limit is full, not a breach
    compliance.verdict = { state: above ? "BREACH" : "WITHIN_ENVELOPE", basis: "CONSUMED_NOT_ABOVE_APPROVED_PER_CAP", undetermined_caps: [] };
    body.stage_facts = stageFacts({ runtime: finished ? "STOPPED" : halted ? "HALTED" : "RUNNING", since: finished ? iso(endMs) : halted ? haltedIso ?? started : started, verdict: "NO_OPEN_FINDINGS", open: 0, unknownOrders: 0, asOf,
      sessions: [{ id: `session_${d.id}_canary_1`, started, ended: finished ? iso(endMs) : null, state: finished ? "COMPLETED" : halted ? "HALTED" : "RUNNING" }] });
    body.source_figures = figures(true);
    setKpis({ capital_consumed: capConsumed, gross_notional: gross, daily_pnl: dailyPnl ?? null, open_orders: String(orders.length), broker_equity: equity });
    if (finished) body.kpis = (body.kpis as Obj[]).map((k) => (k.key === "daily_pnl" ? { ...k, envelope: panel("kpi-daily_pnl", "EXECUTION", "unavailable", "FRESH", null) } : k)); // WP-B2-C3 (R5-10): the trial ended, so the daily figure is not available (never the last day's figure under a fresh stamp)
    body.positions = collection("positions", "EXECUTION", "ready", stale ? "STALE" : "FRESH", asOf, typedPositions(positions), positions.map((p) => ({ symbol: p.symbol, side: p.side.toUpperCase(), qty: p.quantity, entry_price: p.entry })));
    body.blotter = collection("blotter", "EXECUTION", "ready", stale ? "STALE" : "FRESH", asOf, typedOrders(orders), orders.map((o) => ({ order_id: o.id, price: o.price, type: o.type })));
    body.series = { envelope: panel("series", "DERIVED", "ready", "FRESH", AS_OF), ...seriesMembers(started, 4 * HOUR_MS, "4h", series.map((point) => point.value)) };
  } else if (kind === "sandbox") {
    const startMs = standing.fromMs; // WP-B2-S: this deployment's own stage dates (one stage history)
    const started = iso(startMs);
    withIdentityOf(body.certification);
    const cert = body.certification as Obj;
    cert.venue = d.venue;
    cert.created_at = iso(startMs - 2 * MIN);
    cert.updated_at = iso(startMs + 90 * MIN);
    // steps are checked after the certification was created and before the page's own as-of
    (body.steps as Obj[]).forEach((step, i) => {
      if (step.as_of !== null) {
        step.as_of = iso(startMs + (i + 1) * MIN);
        step.expires_at = iso(NOW_MS + 5 * DAY_MS);
      }
    });
    // ONE list of findings: the chip, the KPI, step 4 and the Difference column all read it
    const cents = (n: bigint): string => worldCents(n);
    const feeB = cents(worldToCents(fees) + 1n);
    const mismatchCents = 4687n; // the broker reports this much more equity than the internal ledger (the variant's one parameter; the finding's text states the same figure)
    const equityB = mismatch ? cents(worldToCents(equity) + mismatchCents) : equity;
    const finding = (n: number, code: string, summary: string, createdMs: number): Obj => ({ finding_id: `fnd_${d.id}_${n}`, severity: "WARNING", source_authority: "DERIVED", finding_code: code, summary, blocking: false, evidence_hash: null, as_of: null, resolved_at: null, created_at: iso(createdMs) });
    const rows: Obj[] = [
      ...(mismatch ? [{ ...finding(3, "EQUITY_DIFF", `Equity differs by ${cents(mismatchCents)} USDT`, startMs + 60 * MIN), severity: "CRITICAL", blocking: true }] : []), // WP-B2-S3 R4-01: a non-zero equity difference is an open, blocking finding
      finding(1, "FEE_DIFF", "Fee total differs by 0.01 USDT", startMs + 45 * MIN),
      { ...finding(2, "FILL_LATE", "Fill 3 arrived 4 s late", startMs + 30 * MIN), severity: "INFO" },
    ];
    body.findings = { total_count: rows.length, returned_count: rows.length, truncated: false, rows };
    body.stage_facts = stageFacts({ runtime: halted ? "HALTED" : "RUNNING", since: halted ? haltedIso ?? started : started, verdict: "OPEN_FINDINGS", open: rows.length, unknownOrders: 0, asOf: stale ? at(-44 * MIN) : AS_OF,
      sessions: [{ id: `sandbox-session-1`, started, ended: null, state: halted ? "HALTED" : "RUNNING" }] });
    body.source_figures = sourceFigures({
      equity: { internal: equity, broker: equityB, unit: "USDT" },
      gross_notional: { internal: gross, broker: gross, unit: "USDT" },
      positions: { internal: String(positions.length), broker: String(positions.length), unit: "COUNT" },
      open_orders: { internal: String(orders.length), broker: String(orders.length), unit: "COUNT" },
      fees: { internal: fees, broker: feeB, unit: "USDT" },
    });
    // The workflow has not been submitted (the gate is BLOCKED): the timeline holds the creation only, by a named person; the plan is a draft made before the as-of.
    body.timeline = { total_count: 1, returned_count: 1, truncated: false, rows: [{ event_id: `scevt_${d.id}_create`, actor_user_id: "bobby", action: "CREATE", workflow_version_before: 0, workflow_version_after: 1, created_at: iso(startMs - 2 * MIN) }] };
    for (const plan of (body.promotion_plans as Obj[])) {
      plan.plan_id = "PL-0412";
      plan.created_at = iso(NOW_MS - 20 * MIN);
    }
    // WORLD: the alpha has ONE stage history. A sandbox the alpha has left is a COMPLETED record (seven of seven steps passed, approved on the day the next stage began, nothing open);
    // the sandbox the alpha is in is IN PROGRESS (steps passed so far by the days run, none failed).
    const record = { status: standing.status, days: standing.days, toMs: standing.exitMs };
    const sandboxDecider = standing.decidedBy ?? "bobby";
    const sandboxSubmitter = sandboxDecider === "lan" ? "minh" : "lan";
    const steps = body.steps as Obj[];
    const progress = body.progress as Obj;
    const passedTo = record.status === "completed" ? steps.length : Math.min(steps.length - 1, Math.floor(record.days / 2));
    // WP-B2-S3: the steps are checked inside the run (before the submission), the exit-review step at the decision; evidence of a decided record has no expiry, the evidence of a run in progress is valid through the run
    const completedRun = record.status === "completed";
    const runEndMs = record.toMs ?? NOW_MS;
    const submitMs = runEndMs - 3 * HOUR_MS;
    const checkedAt = (i: number): number => (completedRun ? (i === steps.length - 1 ? runEndMs : startMs + Math.floor(((i + 1) * (submitMs - startMs)) / steps.length)) : startMs + (i + 1) * MIN * 90);
    const passedUpTo = mismatch && !completedRun ? 3 : passedTo;
    steps.forEach((step, i) => {
      step.strip_state = i < passedUpTo ? "DONE" : i === passedUpTo ? "CURRENT" : "PENDING";
      step.evaluation_state = i < passedUpTo ? "PASS" : "UNAVAILABLE";
      step.blocker_code = i < passedUpTo ? null : `SANDBOX_STEP_${String(step.step_key)}_PENDING`;
      step.as_of = i < passedUpTo ? iso(checkedAt(i)) : null;
      step.expires_at = i < passedUpTo && !completedRun ? iso(Math.max(checkedAt(i) + 14 * DAY_MS, NOW_MS + (2 + i) * DAY_MS)) : null;
      step.summary = i < passedUpTo ? `Step ${i + 1} evidence accepted.` : step.summary;
    });
    if (mismatch && !completedRun) {
      const recon = steps[3]!;
      recon.strip_state = "CURRENT";
      recon.evaluation_state = "FAIL";
      recon.blocker_code = "SANDBOX_STEP_RECONCILIATION_FAIL";
      recon.summary = `Step 4 failed: ${rows.length} findings are still open, one blocks the gate.`;
    }
    progress.passed_count = passedUpTo;
    progress.total_count = steps.length;
    progress.eligible = passedUpTo === steps.length; // WP-B2-S3 (round D, N4-01): a decided certification publishes the contract's own met state: workflow_state APPROVED, every step PASS / DONE, eligible, no blocker code
    progress.blocker_codes = record.status === "completed" ? [] : steps.filter((step) => step.blocker_code !== null).map((step) => String(step.blocker_code));
    if (record.status === "completed") {
      const endMs = record.toMs ?? startMs;
      cert.workflow_state = "APPROVED";
      cert.submitted_at = iso(endMs - 3 * HOUR_MS);
      cert.submitted_by_user_id = userIdOf(sandboxSubmitter);
      cert.decided_at = iso(endMs);
      cert.decided_by_user_id = userIdOf(sandboxDecider);
      cert.decision_reason = "All seven steps passed; no open finding.";
      cert.updated_at = iso(endMs);
      body.findings = { total_count: 0, returned_count: 0, truncated: false, rows: [] };
      body.source_figures = sourceFigures({ // a closed record with no finding: both sides state the same figure
        equity: { internal: equity, broker: equity, unit: "USDT" },
        gross_notional: { internal: gross, broker: gross, unit: "USDT" },
        positions: { internal: String(positions.length), broker: String(positions.length), unit: "COUNT" },
        open_orders: { internal: String(orders.length), broker: String(orders.length), unit: "COUNT" },
        fees: { internal: fees, broker: fees, unit: "USDT" },
      });
      body.stage_facts = stageFacts({ runtime: "STOPPED", since: iso(endMs), verdict: "NO_OPEN_FINDINGS", open: 0, unknownOrders: 0, asOf: iso(endMs),
        sessions: [{ id: `sandbox-session-1`, started, ended: iso(endMs), state: "COMPLETED" }] });
      body.timeline = { total_count: 3, returned_count: 3, truncated: false, rows: [
        { event_id: `scevt_${d.id}_create`, actor_user_id: "bobby", action: "CREATE", workflow_version_before: 0, workflow_version_after: 1, created_at: iso(startMs - 2 * MIN) },
        { event_id: `scevt_${d.id}_submit`, actor_user_id: sandboxSubmitter, action: "SUBMIT", workflow_version_before: 1, workflow_version_after: 2, created_at: iso(endMs - 3 * HOUR_MS) },
        { event_id: `scevt_${d.id}_approve`, actor_user_id: sandboxDecider, action: "APPROVE", workflow_version_before: 2, workflow_version_after: 3, created_at: iso(endMs) },
      ] };
      body.promotion_plans = [];
    }
  } else {
    const data = body.data;
    if (!isObj(data)) return body;
    const started = iso(standing.fromMs);
    if (isObj(data.deployment)) withIdentityOf(data.deployment);
    if (isObj(data.deployment) && retired) { data.deployment.active = false; data.deployment.updated_at = iso(exitMs ?? NOW_MS); }
    if (Array.isArray(data.deployments)) for (const row of data.deployments) withIdentityOf(row);
    const book = stageBookOf(d.id); // WP-B2-S: inside the stage window; the gate, the quality derivation and the tabs count THIS list
    data.positions = positions.map((p) => ({ instrument_id: p.symbol, side: p.side.toUpperCase(), quantity: p.quantity, avg_px_open: p.entry, mark_price: p.mark, unrealized_pnl: p.unrealised, updated_at: AS_OF }));
    data.orders = book.orders.map((o) => ({ order_id: o.order_id, client_order_id: o.client_order_id, instrument_id: o.symbol, side: o.side, status: o.status, quantity: o.quantity, price: o.price, submitted_at: o.submitted_at }));
    data.fills = book.fills.map((f) => ({ fill_id: f.fill_id, client_order_id: f.client_order_id, order_id: String(f.client_order_id).replace(/^cl-/, "ord_"), quantity: f.quantity, price: f.price, commission: f.commission, commission_currency: f.commission_currency, trade_time: f.trade_time }));
    // the equity line of the paper account: allocation plus the cumulative net PnL of this deployment, ending on allocation + realized + unrealized
    const equityPoints = retired ? seriesOf(d.id, standing.fromMs, exitMs ?? NOW_MS, 200, net) : seriesOf(d.id, NOW_MS - 199 * HOUR_MS, NOW_MS - 4 * MIN, 200, net);
    let peak = 0n;
    data.account_equity = equityPoints.map((pt, i) => {
      const eq = alloc + worldToCents(pt.value);
      if (eq > peak) peak = eq;
      return { ts: new Date(pt.t).toISOString(), currency: "USDT", equity: worldCents(eq), net_pnl: pt.value, fee_total: worldCents(BigInt(i + 1) * alloc / 1_000_000n), funding_pnl: null,
        cash_free: worldCents(eq - alloc / 10n), cash_locked: worldCents(alloc / 10n), total_fills: retired ? book.fills.filter((f) => Date.parse(String(f.trade_time)) <= pt.t).length : Math.min(i + 1, book.fills.length), state_digest: "9c1e04b7a2f1ffff", snapshot_reason: "PERIODIC", source: `paper-${d.id}`,
        drawdown: eq === peak ? "0" : canonicalDecimal(((Number(eq - peak) / Number(peak))).toFixed(4)) };
    });
    // ONE clock: the page's own as-of is the world's now, so nothing on it is dated after it.
    // a stage the alpha left has no source update after its exit: its as-of is the exit; the read is at the world clock (WP-B2-O: the rebase moves it like the blotter)
    body.as_of = retired ? iso(exitMs ?? NOW_MS) : AS_OF;
    body.read_at = AS_OF;
    // WORLD: ONE stage history. A Paper stage the alpha has left is a COMPLETED record (gate met, days and trades over the minimum, the session closed on the day Sandbox began);
    // the Paper stage the alpha is in is in progress, its observed days the days since it began.
    const paperRecord = { status: standing.status, days: standing.days, toMs: standing.exitMs };
    const gate = data.observation_gate as Obj;
    const paperEnd = paperRecord.toMs === null ? null : iso(paperRecord.toMs);
    gate.observed_days = paperRecord.days;
    gate.trade_count = (data.fills as unknown[]).length; // the gate counts the fills the tabs list
    gate.state = paperRecord.status === "completed" ? "MET" : "PARTIAL";
    gate.reason_code = paperRecord.status === "completed" ? null : "OBSERVATION_WINDOW_OPEN";
    data.stage_facts = stageFacts({ runtime: paperEnd !== null ? "STOPPED" : halted ? "HALTED" : "RUNNING", since: paperEnd ?? (halted ? haltedIso ?? started : started), verdict: "NO_OPEN_FINDINGS", open: 0, unknownOrders: 0, asOf: retired ? iso(exitMs ?? NOW_MS) : AS_OF,
      sessions: [{ id: "paper-session-1", started, ended: paperEnd, state: paperEnd !== null ? "COMPLETED" : halted ? "HALTED" : "RUNNING" }] });
  }
  body.read_at = AS_OF; // WP-B2-S3: every stage page is READ at the world's one clock; only a stage the alpha left is as-of its exit
  if (retired && exitMs !== null) capAsOf(body, exitMs); // WP-B2-S3 R4-03, R5-10: a stage the alpha left has no source update after its exit
  // WP-B2-C3 (R5-08): the room's `equity` row is the ledger figure allocation + realized (Net PnL stays the realized figure and the unrealized sits on the positions), so it is NAMED for what it is;
  // the Alpha 360 "Equity" (allocation + realized + unrealized, said on that page) is another figure and is not the same word.
  const figuresOfBody = isObj(body.source_figures) ? (body.source_figures as Obj).figures : isObj(body.data) && isObj((body.data as Obj).source_figures) ? ((body.data as Obj).source_figures as Obj).figures : null;
  if (Array.isArray(figuresOfBody)) for (const row of figuresOfBody as Obj[]) if (row.key === "equity") row.label = "Balance, allocation + realized";
  // ===== WP-B2-C4 begin (QA7 N5-06, N2-04): the room's KPI that holds allocation + realized says so in its own label; the Net PnL series is named realized; the positions say, in a typed
  // warning, that they are the venue's open book, which the retained order window does not rebuild (the blotter holds no opening fill for them)
  if (Array.isArray(body.kpis)) body.kpis = (body.kpis as Obj[]).map((k) => (k.key === "broker_equity" ? { ...k, label: "Broker balance (allocation + realized)" } : k));
  if (isObj(body.series) && typeof (body.series as Obj).methodology_ref === "string") (body.series as Obj).methodology_ref = "portal.net-pnl.realized.FIXTURE_LAB.v1";
  if (isObj(body.positions) && isObj((body.positions as Obj).envelope) && Array.isArray((body.positions as Obj).rows) && ((body.positions as Obj).rows as unknown[]).length > 0) {
    const envelope = (body.positions as Obj).envelope as Obj;
    envelope.warnings = [...(Array.isArray(envelope.warnings) ? (envelope.warnings as unknown[]) : []), { code: "POSITIONS_OPENED_BEFORE_THE_RETAINED_ORDER_WINDOW" }];
  }
  // ===== WP-B2-C4 end
  return body;
}
/** Harness ids that stand for a world deployment (the review index and the audit link dep_canary_01: the canary rollout of Basis B). */
const WORLD_ALIAS: Readonly<Record<string, string>> = {}; // WORLD: one id per deployment; the canary rollout of Basis B is dep_canary_01 everywhere
// ===== WP-P end

// ===== WP-B2-S3 begin: lineage from the world's approvals, one home deployment per state variant, the freshness of a stage the alpha left, the dark pages read the same book
/** The history record of an alpha's finished Canary trial when it has no Canary deployment of its own (the record Alpha 360 lists as Canary done); null when the alpha never left Canary. */
export function worldHistoryCanaryOf(alphaId: string): string | null {
  const id = historyDeploymentId(alphaId, "canary");
  return resolveStageDeployment(id) !== null ? id : null;
}

const STATE_VARIANTS: ReadonlySet<StageVariant> = new Set<StageVariant>(["mismatch", "stale", "gap", "breach", "halted"]);
/**
 * The deployment whose book a stage page reads. A state variant (mismatch, stale, gap, breach, halted) is a state the stage is IN; when the named deployment's stage is over
 * (its alpha has left it) the variant is a state of the first deployment of the world that IS in that stage, so one alpha never has two opposite records of one stage.
 */
export function worldIdOf(deploymentId: string, kind: DeploymentStage): string {
  const base = WORLD_ALIAS[baseDeploymentId(deploymentId)] ?? baseDeploymentId(deploymentId);
  if (!isPositiveMode() || !STATE_VARIANTS.has(variantOf(deploymentId))) return base;
  const standing = standingOf(base);
  if (standing === null || standing.status !== "completed" || standing.stage !== kind) return base;
  return currentDeploymentOfStage(kind) ?? base;
}

const refOf = (alphaId: string, gate: WorldGate): { id: string; href: string } | null => {
  const approval = approvalOfAlpha(alphaId, gate);
  return approval === undefined ? null : { id: approval.id, href: approvalHref(approval) };
};
/**
 * The lineage of a stage page: each approval is the one request of THIS alpha (the world's approvals, the ids and decisions Alpha 360 and the Approvals pages state), each link opens that request,
 * the sandbox exit opens the alpha's own sandbox record and the digest is of this deployment. An approval the alpha has no record of is typed unavailable, never another alpha's.
 */
export function worldLineage(current: readonly Obj[], alphaId: string, worldId: string, pageId: string): Obj[] {
  return current.map((entry) => {
    const kind = String(entry.kind);
    const gate: WorldGate | null = kind === "R1_APPROVAL" ? "R1" : kind === "R2_APPROVAL" ? "R2" : kind === "PAPER_EXIT" ? "PAPER_EXIT" : kind === "CANARY_PROMOTION_PLAN" || kind === "LIVE_DUAL_APPROVAL" ? "LIVE_GATE" : null;
    if (kind === "ARTIFACT") return { ...entry, value: digestOf(`artifact:${pageId}`) };
    if (kind === "PROMOTION_GRANT") return { ...entry, value: `grant_${pageId}` };
    if (kind === "CANARY_ENVELOPE") {
      const predecessor = predecessorCanary(worldId); // the alpha's own finished trial (its deployment or its history record), never another alpha's
      return predecessor === null ? { ...entry, state: "UNAVAILABLE", value: null, href: null } : { ...entry, state: "AVAILABLE", value: `cenv_${predecessor}`, href: `/deployments/live/${encodeURIComponent(predecessor)}/canary` };
    }
    if (kind === "SANDBOX_EXIT") {
      const href = sandboxExitHref(worldId);
      const approval = refOf(alphaId, "SANDBOX_EXIT");
      return { ...entry, ...("state" in entry ? { state: href === null ? "UNAVAILABLE" : "AVAILABLE" } : {}), value: href === null ? null : approval?.id ?? "Sandbox exit record", href }; // an alpha with no sandbox deployment of its own has no exit request: the record is the link
    }
    if (gate === null) return entry;
    const ref = refOf(alphaId, gate);
    return { ...entry, ...("state" in entry ? { state: ref === null ? "UNAVAILABLE" : "AVAILABLE" } : {}), value: ref?.id ?? null, href: ref?.href ?? null };
  });
}

/** No source update of a stage the alpha left is later than its exit: every `as_of` / `checked_at` of the body (strings and typed availabilities) is capped there. */
export function capAsOf(node: unknown, limitMs: number): void {
  if (Array.isArray(node)) { for (const item of node) capAsOf(item, limitMs); return; }
  if (!isObj(node)) return;
  for (const [key, value] of Object.entries(node)) {
    if (key === "as_of" || key === "checked_at") {
      if (typeof value === "string" && Date.parse(value) > limitMs) node[key] = new Date(limitMs).toISOString();
      else if (isObj(value) && typeof value.value === "string" && Date.parse(value.value) > limitMs) value.value = new Date(limitMs).toISOString();
      continue;
    }
    capAsOf(value, limitMs);
  }
}

/**
 * The `_dark` page of a Sandbox or Paper deployment of the world: the record (steps, findings, orders, fills, equity, gate) is the deployment's own, computed from its one book; what the
 * dark body takes away is the SOURCE facts (runtime, reconciliation, sessions, panels, figures), which stay the typed absences of the published dark body.
 */
function darkHybrid(kind: "sandbox" | "paper", answerBody: Obj, id: string): Obj | null {
  const dark = darkOfWorld(answerBody, id) ?? clone(answerBody);
  const lit = worldStage(kind, kind === "sandbox" ? sandboxLit(clone(answerBody), id, "ok") : paperLit(clone(answerBody), id, "ok", false), id, "ok");
  if (lit === null || lit === answerBody) return null;
  if (kind === "paper") {
    const data = lit.data as Obj;
    data.stage_facts = (isObj(dark.data) ? (dark.data as Obj).stage_facts : data.stage_facts) as unknown;
    return lit;
  }
  for (const key of ["stage_facts", "source_figures", "source_panels"]) if (key in dark) lit[key] = dark[key];
  return lit;
}
/** The open incident an unreconciled Live deployment links as its finding: an incident of the portfolio it is booked on, in a Real-funded (LIVE) environment; null when the world holds none. */
function liveFindingHref(deploymentId: string): string | null {
  const found = resolveStageDeployment(worldIdOf(deploymentId, "live"));
  if (found === null) return "/execution/operations/incidents/inc_TEST_ONLY_fx_mismatch";
  const incident = WORLD_INCIDENTS.find((x) => x.target[0] === "PORTFOLIO" && x.target[1] === found.deployment.portfolioId && x.env === "LIVE" && x.resolved === null);
  return incident === undefined ? null : `/execution/operations/incidents/${incident.id}`;
}
// ===== WP-B2-S3 end
