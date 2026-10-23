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
  dep_b3: { alphaId: "alpha_b", alphaName: "Basis B", ...CORE },
  dep_c1: { alphaId: "alpha_c", alphaName: "Momentum C", ...SAT },
  dep_d1: { alphaId: "alpha_d", alphaName: "Grid D", ...CAN },
  dep_d2: { alphaId: "alpha_d", alphaName: "Grid D", ...SAT },
  dep_a1: { alphaId: "alpha_a", alphaName: "Carry A", portfolioId: "pf_main", portfolioName: "Main" },
};

/** The universe's own id, with a trailing variant word taken off (`dep_live_01_mismatch` is dep_live_01 in another state). */
export function baseDeploymentId(deploymentId: string): string {
  for (const word of STAGE_VARIANTS) {
    if (deploymentId.endsWith(`_${word}`)) return deploymentId.slice(0, -(word.length + 1));
  }
  return deploymentId;
}

function identityOf(deploymentId: string): Identity | null {
  return IDENTITY[baseDeploymentId(deploymentId)] ?? null;
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

/* ── small builders ────────────────────────────────────────────────────────── */

export const AS_OF = "2026-10-17T12:04:00.000Z";
const AS_OF_STALE = "2026-10-17T11:52:00.000Z";
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
    rows: rows.map((r) => ({ id: r.id, symbol: r.symbol, side: r.side, quantity: r.quantity, entry: r.entry, mark: r.mark, unrealised: r.unrealised, leverage: null })),
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
    rows: rows.map((r) => ({ id: r.id, symbol: r.symbol, type: r.type, side: r.side, quantity: r.quantity, price: r.price, status: r.status, since: r.since, ack_latency_ms: null })),
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

const CANARY_STARTED = "2026-10-12T08:00:00.000Z";
const CANARY_REVIEW = "2026-10-26T08:00:00.000Z";

/** Hand-written 6-hour net PnL path (USDT) of the canary since 12 Oct 08:00Z: 22 points, last 17 Oct 12:00Z. */
const CANARY_PNL = ["0", "4.2", "9.8", "7.1", "15.6", "22.4", "19.3", "28.9", "35.2", "31.6", "44.8", "52.3", "49.7", "61.4", "68.9", "74.2", "70.8", "88.6", "96.1", "104.7", "109.3", "111.5"];

interface CapSpec { cap: string; unit: string; limit: string; approved: string; consumed: string; ratio: string }
/** consumed / approved at six places, ROUND_HALF_UP, canonical: the SERVER's string. */
export function usedRatio(consumed: string, approved: string): string {
  const scale = (text: string): bigint => {
    const [w, f = ""] = text.split(".");
    return BigInt(w ?? "0") * 1_000_000n + BigInt((f + "000000").slice(0, 6));
  };
  const c = scale(consumed);
  const a = scale(approved);
  const q = (c * 1_000_000n * 2n + a) / (a * 2n);
  return canonicalDecimal(`${q / 1_000_000n}.${(q % 1_000_000n).toString().padStart(6, "0")}`);
}
const capRow = (spec: Omit<CapSpec, "ratio">, asOf: string): Obj => ({
  cap: spec.cap,
  unit: spec.unit,
  policy_limit: avail(spec.limit),
  approved: spec.approved,
  consumed: avail(canonicalDecimal(spec.consumed)),
  used_ratio: avail(usedRatio(spec.consumed, spec.approved)),
  as_of: avail(asOf),
});

function canaryLit(body: Obj, deploymentId: string, variant: StageVariant): Obj {
  const halted = variant === "halted";
  const stale = variant === "stale" || halted;
  const breach = variant === "breach";
  const freshness = stale ? "STALE" : "FRESH";
  const brokerAsOf = stale ? AS_OF_STALE : AS_OF;
  const deployment = body.deployment as Obj;
  withIdentity(deployment, deploymentId);

  body.source_integration_state = "SOURCE_BACKED";
  body.delivery_profile = "LIVE_BINANCE_USDM";
  body.lineage = [
    { kind: "ARTIFACT", value: `sha256:${"a".repeat(64)}`, href: null },
    { kind: "R1_APPROVAL", value: "AP-118", href: "/governance/approvals" },
    { kind: "R2_APPROVAL", value: "AP-152", href: "/governance/approvals" },
    { kind: "SANDBOX_EXIT", value: "SX-14", href: `/deployments/sandbox/${encodeURIComponent(baseDeploymentId(deploymentId))}` },
    { kind: "CANARY_PROMOTION_PLAN", value: "AP-311", href: null },
  ];

  const capital = breach ? "5210.00" : "3820.00";
  const caps: Omit<CapSpec, "ratio">[] = [
    { cap: "capital", unit: "USDT", limit: "10000", approved: "5000", consumed: capital },
    { cap: "gross_notional", unit: "USDT", limit: "20000", approved: "10000", consumed: "6120.40" },
    { cap: "daily_loss", unit: "USDT", limit: "500", approved: "250", consumed: "38.60" },
    { cap: "open_orders", unit: "COUNT", limit: "40", approved: "20", consumed: "1" },
  ];
  const env = body.envelope as Obj;
  env.status = "ACTIVE";
  env.reason = "Canary envelope approved by the Canary owner for the 14-day trial.";
  const gateCodes = ["PRODUCTION_COMMAND_INACTIVE", "CANARY_OWNER_GATE_REQUIRED", "BASE_RISK_PROFILE_UNVERIFIED"];
  env.blocker_codes = gateCodes;
  env.limits = { capital_cap: "5000", gross_notional_cap: "10000", daily_loss_cap: "250", max_open_orders: 20, duration_days: 14 };

  const life = body.lifecycle as Obj;
  life.day_index = 6;
  life.duration_days = 14;
  life.blocker_codes = env.blocker_codes;
  life.trial = { basis: "STARTED_AT_PLUS_DURATION_DAYS", duration_days: 14, started_at: avail(CANARY_STARTED), exit_review_opens_at: avail(CANARY_REVIEW) };

  body.stage_facts = stageFacts({
    runtime: halted ? "HALTED" : "RUNNING",
    since: CANARY_STARTED,
    verdict: "NO_OPEN_FINDINGS",
    open: 0,
    unknownOrders: 0,
    asOf: brokerAsOf,
    sessions: [{ id: "session_FIXTURE_LAB_canary_1", started: CANARY_STARTED, ended: null, state: halted ? "HALTED" : "RUNNING" }],
  });
  body.source_figures = sourceFigures({
    equity: { internal: "5112.40", broker: "5112.40", unit: "USDT" },
    gross_notional: { internal: "6120.40", broker: "6120.40", unit: "USDT" },
    positions: { internal: "1", broker: "1", unit: "COUNT" },
    open_orders: { internal: "1", broker: "1", unit: "COUNT" },
    fees: { internal: "4.25", broker: "4.25", unit: "USDT" },
  });

  const values: Record<string, string> = { capital_consumed: capital, gross_notional: "6120.40", daily_pnl: "-38.60", open_orders: "1", broker_equity: "5112.40" };
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
  compliance.consumed = { capital_cap: capital, gross_notional_cap: "6120.40", daily_loss_cap: "38.60", max_open_orders: "1" };
  compliance.rows = caps.map((c) => capRow(c, AS_OF));
  compliance.verdict = breach
    ? { state: "BREACH", basis: "CONSUMED_NOT_ABOVE_APPROVED_PER_CAP", undetermined_caps: [] }
    : { state: "WITHIN_ENVELOPE", basis: "CONSUMED_NOT_ABOVE_APPROVED_PER_CAP", undetermined_caps: [] };
  compliance.base_risk_profile_verified = false;

  const positions = [
    { id: "pos_FIXTURE_LAB_cny_1", symbol: "ETHUSDT", side: "long", quantity: "1.2", entry: "3410.5", mark: "3490.5", unrealised: "96" },
  ] as const satisfies readonly PositionSpec[];
  body.positions = collection(
    "positions", "EXECUTION", "ready", freshness, brokerAsOf, typedPositions(positions),
    positions.map((p) => ({ symbol: p.symbol, side: p.side.toUpperCase(), qty: p.quantity, entry_price: p.entry })),
  );
  const orders = [
    { id: "ord_FIXTURE_LAB_cny_1", symbol: "ETHUSDT", type: "LIMIT", side: "sell", quantity: "0.6", price: "3560", status: "ACCEPTED", since: "2026-10-17T11:41:00.000Z" },
  ] as const satisfies readonly OrderSpec[];
  body.blotter = collection(
    "blotter", "EXECUTION", "ready", freshness, brokerAsOf, typedOrders(orders),
    orders.map((o) => ({ order_id: o.id, price: o.price, type: o.type })),
  );

  body.series = { envelope: panel("series", "DERIVED", "ready", "FRESH", AS_OF), ...seriesMembers(CANARY_STARTED, 6 * 3_600_000, "6h", CANARY_PNL) };

  const rb = body.rollback_readiness as Obj;
  rb.envelope = panel("rollback-readiness", "EXECUTION", "ready", "FRESH", AS_OF);
  rb.ready = !halted;
  rb.blocker_codes = halted ? ["ROLLBACK_BLOCKED_BY_HALT"] : [];
  rb.evidence_hash = `sha256:${"c".repeat(64)}`;
  rb.items = [
    { key: "flatten_plan", ready: avail(true), checked_at: avail("2026-10-17T11:30:00.000Z") },
    { key: "paper_twin", ready: avail(true), checked_at: avail("2026-10-17T11:59:00.000Z") },
    { key: "broker_data", ready: avail(!stale), checked_at: avail(brokerAsOf) },
    { key: "rollback_drill", ready: avail(true), checked_at: avail("2026-10-11T10:00:00.000Z") },
  ];

  // The command policy keeps its published flags (no command route exists, every decision is closed; a stale broker blocks scale-up
  // only); its blocker codes say what is true of a LIT canary instead of the dark body's "source unavailable".
  const policy = body.command_policy as Obj;
  (policy.protective as Obj).blocker_codes = ["PRODUCTION_COMMAND_INACTIVE"];
  (policy.scale_up as Obj).blocker_codes = stale ? [...gateCodes, "BROKER_SYNC_STALE"] : gateCodes;
  return body;
}

/* ── LIVE ──────────────────────────────────────────────────────────────────── */

const LIVE_ACTIVATED = "2026-09-17T08:00:00.000Z";
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
  { id: "ord_FIXTURE_LAB_lv_1", symbol: "BTCUSDT", type: "LIMIT", side: "sell", quantity: "0.1", price: "67200", status: "ACCEPTED", since: "2026-10-17T11:12:00.000Z" },
  { id: "ord_FIXTURE_LAB_lv_2", symbol: "SOLUSDT", type: "LIMIT", side: "buy", quantity: "4", price: "166.5", status: "ACCEPTED", since: "2026-10-17T11:40:00.000Z" },
];

function liveLit(body: Obj, deploymentId: string, variant: StageVariant): Obj {
  const mismatch = variant === "mismatch";
  const stale = variant === "stale" || variant === "halted";
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
  life.blocker_codes = ["PRODUCTION_COMMAND_INACTIVE", "CANARY_EXIT_EVIDENCE_UNAVAILABLE"];

  body.lineage = [
    { kind: "ARTIFACT", state: "AVAILABLE", value: `sha256:${"a".repeat(64)}`, href: null },
    { kind: "R1_APPROVAL", state: "AVAILABLE", value: "AP-118", href: "/governance/approvals" },
    { kind: "R2_APPROVAL", state: "AVAILABLE", value: "AP-152", href: "/governance/approvals" },
    { kind: "SANDBOX_EXIT", state: "AVAILABLE", value: "SX-14", href: `/deployments/sandbox/${encodeURIComponent(baseDeploymentId(deploymentId))}` },
    { kind: "CANARY_ENVELOPE", state: "AVAILABLE", value: "cenv_FIXTURE_LAB_1", href: `/deployments/live/${encodeURIComponent(baseDeploymentId(deploymentId))}/canary` },
    { kind: "CANARY_EXIT", state: "UNAVAILABLE", value: null, href: null },
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
    gross_notional: { internal: "41080.00", broker: mismatch ? null : "41080.00", unit: "USDT" },
    positions: { internal: "4", broker: mismatch ? null : "4", unit: "COUNT" },
    open_orders: { internal: "2", broker: mismatch ? null : "2", unit: "COUNT" },
    fees: { internal: "412.36", broker: mismatch ? null : "412.36", unit: "USDT" },
  });

  const values: Record<string, string | null> = { capital: "60000.00", gross_notional: "41080.00", daily_pnl: "-240.00", open_orders: "2", broker_equity: mismatch ? null : brokerEquity };
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
    finding_href: mismatch ? "/execution/operations/incidents/inc_TEST_ONLY_fx_mismatch" : null,
    dry_run_reconcile_href: mismatch ? "/execution/operations" : null,
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
    gap_ranges: gap ? avail([{ from: "2026-10-17T11:52:00.000Z", to: "2026-10-17T12:04:00.000Z" }]) : avail([]),
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
  body.open_order_footer = { envelope: panel("open-order-footer", "EXECUTION", "ready", "FRESH", AS_OF), exact_open_order_count: 2 };
  body.incidents = {
    envelope: panel("incidents", "EXECUTION", mismatch ? "ready" : "empty", "FRESH", AS_OF),
    exact_total: 0,
    returned_count: 0,
    next_cursor: null,
    previous_cursor: null,
    rows: [],
  };
  body.series = { envelope: panel("series", "DERIVED", "ready", "FRESH", AS_OF), ...seriesMembers(LIVE_ACTIVATED, 86_400_000, "1d", LIVE_PNL, "USDT", "2026-10-17T12:00:00.000Z") };

  const rb = body.rollback_readiness as Obj;
  rb.envelope = panel("rollback-readiness", "EXECUTION", "ready", "FRESH", AS_OF);
  rb.ready = !halted && !mismatch;
  rb.blocker_codes = [];
  rb.evidence_hash = `sha256:${"c".repeat(64)}`;
  return body;
}

/* ── SANDBOX ───────────────────────────────────────────────────────────────── */

const SANDBOX_STARTED = "2026-10-16T17:50:00.000Z";

function sandboxLit(body: Obj, deploymentId: string, variant: StageVariant): Obj {
  const mismatch = variant === "mismatch";
  const halted = variant === "halted";
  const stale = variant === "stale";
  const freshness = stale ? "STALE" : "FRESH";
  const sandboxAsOf = stale ? "2026-10-17T11:20:00.000Z" : AS_OF;
  withIdentity(body.certification as Obj, deploymentId);
  body.source_integration_state = "SOURCE_BACKED";
  body.delivery_profile = "LIVE_BINANCE_USDM";

  body.stage_facts = stageFacts({
    runtime: halted ? "HALTED" : "RUNNING",
    since: SANDBOX_STARTED,
    verdict: "OPEN_FINDINGS",
    open: 2,
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
  return body;
}

/* ── PAPER (GET /screens/paper/{id}) ───────────────────────────────────────── */

const PAPER_STARTED = "2026-10-12T08:00:00.000Z";
const PAPER_AS_OF = "2026-10-17T09:14:00.000Z";

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
    holidays: avail([{ date: "2026-09-02", name: "National Day" }]),
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

/* ── entry ─────────────────────────────────────────────────────────────────── */

const LEGACY_DEPLOYMENT = /^dep_(?:\d+|a|vnm)$/;

/**
 * `path` is the request path with `/api/v1/execution` removed. Returns the lit body for a V1 stage read of a stage deployment, or
 * `null` when the answer is not one of these (a V2 body, another route, the `_dark` variant, a legacy id): the caller keeps its answer.
 */
export function simulateStage(path: string, answerBody: unknown): Obj | null {
  if (!isObj(answerBody)) return null;
  const seg = path.split("/").filter(Boolean).map((part) => decodeURIComponent(part));
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
  if (variant === "dark") return null;
  const schema = answerBody.schema_version;
  const body = clone(answerBody);
  switch (kind) {
    case "canary":
      return schema === "execution.canary-control-room.v1" ? canaryLit(body, id, variant) : null;
    case "live":
      return schema === "execution.live-full-operations.v1" ? liveLit(body, id, variant) : null;
    case "sandbox":
      return schema === "governance.sandbox-certification.v1" ? sandboxLit(body, id, variant) : null;
    case "paper":
      return paperLit(body, id, variant, seg[3] === "vn-market");
  }
}
