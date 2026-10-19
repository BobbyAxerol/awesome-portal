/**
 * The Canary control room's reader: what a published body becomes before a
 * screen may print it (S3 plan s4, D4, D6, D7).
 *
 * Input is the answer of `ExecutionApi.getCanaryVersioned`, which has already
 * been through the dispatcher (`v2/readers/dispatch.ts`):
 *
 * - `v1`  the `execution.canary-control-room.v1` body, read by `readCanaryControlRoom`;
 * - `v2`  the `portal.execution.following-parent.v2` CANARY body, read by `readCanaryParentV2`;
 * - `unsupported`  nothing was read; the screen prints `unsupportedText`.
 *
 * This reader re-checks, never repairs. A V1 body can never be a V2 body (the
 * dispatcher refuses a V2 shape under a V1 version and the V1 reader refuses a V2
 * body outright); here a `v2` answer must still be the CANARY family and a `v1`
 * answer must still carry a deployment, or the whole answer becomes `unsupported`.
 * Decimals cross as exact strings through `readDecimal` (a number, an exponent, `-0`
 * or a leading zero is "unreadable", never a value), a count must be an integer
 * string, and every list is bounded.
 *
 * What the wire does NOT give, and so what no code here may produce:
 * - the Used ratio, Consumed and Limit of each cap (`envelope_compliance.consumed`
 *   is a free object, schema-pinned null; FE-071). The view carries `usedRatio:
 *   undefined`, so the gauge prints `Not published (FE-071)` and nothing is divided;
 * - the trial calendar (`started_at`, `exit_review_opens_at`; FE-071) and any
 *   rollback check date (FE-071);
 * - typed position, order and series rows (`positions.rows` is a free object,
 *   `series.points` has `maxItems 0`; FE-072, FE-029). `rows` stays `null`.
 *
 * The shared V1 reader (`certification.ts`) maps the schema's `ready` to the FE's `ok` and `FRESH` to `OK`,
 * so a source-backed panel reads as it is published; a word outside the schema is `unavailable` / not stated.
 * It also keeps `rollback_readiness.ready` / `.blocker_codes`, `envelope_compliance.{limits,consumed,headroom,
 * base_risk_profile_verified}` and the `positions` / `blotter` rows, which this reader passes on:
 * - "Ready" may be printed only when `rollback_readiness.ready` is the boolean `true` and nothing in the
 *   same response contradicts it (`model.ts`, `rollbackHead`);
 * - rows are drawn under the source's own field names (`readers/publishedRows.ts`), because the contract does
 *   not name them (FE-072); the typed hi-fi columns stay `Not published (FE-072)`.
 */
import type { Authority, FreshnessState, PanelStatus } from "../../../contracts";
import type { CanaryActionPolicy, CanaryControlRoom, PanelEnvelope } from "../../../certification";
import { readDecimal, type BoundaryDecimal } from "../../boundary";
import { safeInternalHref } from "../../safeHref";
import { publishedRowsOf, type PublishedRows } from "../../readers/publishedRows";
import { unsupportedText, type CanaryVersionRead } from "../../readers/dispatch";
import type { CanaryParentV2 } from "../../readers/governanceParents";

/* ── the view ─────────────────────────────────────────────────────────────── */

export type CanaryBody = "v1" | "v2";

export type PanelFactState = PanelStatus | "suppressed";

/** One source panel as the response states it. */
export interface PanelFact {
  state: PanelFactState;
  /** `null` = the reader could not read a freshness word (see the header note). */
  freshness: FreshnessState | null;
  /** Epoch ms of the panel's own `as_of`; `null` = not stated. */
  asOfMs: number | null;
  authority: Authority | null;
}

/** A decimal as the screen may print it: the published value, or one that could not be read. */
export type DecimalFact = { kind: "value"; decimal: BoundaryDecimal } | { kind: "unreadable" };

export const KPI_KEYS = ["capital_consumed", "gross_notional", "daily_pnl", "open_orders", "broker_equity"] as const;
export type KpiKey = (typeof KPI_KEYS)[number];

export interface KpiFact {
  key: KpiKey;
  /** `null` = the source published no value (the dark source). */
  value: DecimalFact | null;
  /** The currency word of a money KPI; `null` for a count or when the wire's unit is not a currency. */
  currency: string | null;
  panel: PanelFact;
}

export const LIMIT_KEYS = ["capital", "grossNotional", "dailyLoss", "openOrders", "duration"] as const;
export type LimitKey = (typeof LIMIT_KEYS)[number];

export interface LimitFact {
  key: LimitKey;
  /** The envelope's value for the cap: proposed while the envelope is a draft. */
  value: DecimalFact | null;
  /**
   * The server's used ratio as a decimal fraction ("0.76"). Always `undefined` today: no field of the
   * contract carries it (FE-071). A future reader sets it from a published field, never from a division.
   */
  usedRatio: string | undefined;
}

export interface EnvelopeFact {
  envelopeId: string | null;
  revision: number | null;
  /** The published status word ("DRAFT"); the column is headed from it. */
  status: string | null;
  currency: string | null;
  baseRiskProfileRevision: string | null;
  limits: readonly LimitFact[];
}

export interface BlockerFact {
  /** Where the code came from. */
  origin: "lifecycle" | "envelope" | "protective" | "scale-up" | "body";
  /** The server's code; `null` for a statement the body makes without a code (a draft status). */
  code: string | null;
  /** A key into `BLOCKER_SENTENCES`, or `null` for a code this build has no sentence for. */
  known: boolean;
}

export interface LineageFact {
  kind: string;
  value: string;
  /** An in-app path (`/...`) or `null`; an absolute or protocol-relative URL is never kept. */
  href: string | null;
}

export interface ActionGroupFact {
  /** `brokerSyncBlocks` as the policy states it; an unreadable flag reads `true` (blocks). */
  brokerSyncBlocks: boolean;
}

/**
 * A typed position / order row. No reader fills these today: the contract's `rows` are free objects
 * (FE-072), so the screen draws the table only when a future reader publishes typed rows. Decimal
 * fields are exact strings; the screen runs them through `readDecimal` again before printing.
 */
export interface PositionRow {
  symbol: string;
  side: "long" | "short" | null;
  quantity: string | null;
  entry: string | null;
  mark: string | null;
  unrealised: string | null;
  leverage: string | null;
}

export interface OrderRow {
  symbol: string;
  type: string | null;
  side: "buy" | "sell" | null;
  quantity: string | null;
  price: string | null;
  /** Epoch ms the order was opened; `null` = not stated. */
  sinceMs: number | null;
  /** Exact integer milliseconds as a string. */
  ackLatencyMs: string | null;
}

export interface RowsFact<R> {
  panel: PanelFact | null;
  /** `null` = no typed rows are published (FE-072); an empty array means the source said "none". */
  rows: readonly R[] | null;
  /** The server's exact total of the typed rows; `null` = not published. */
  total: number | null;
  /**
   * The rows the V1 body carries, under the source's own field names (the contract does not type them: FE-072).
   * `null` = the body carries none, or its panel is not in a state that holds rows. Drawn only when `rows` is `null`.
   */
  published: PublishedRows | null;
}

/** An exact figure the compliance panel states under the source's own name. */
export interface FigureFact {
  key: string;
  /** The decimal exactly as the server wrote it. */
  exact: string;
}

export interface FigureSet {
  /** A key spelled like a cap's published name belongs to that cap. */
  byLimit: Readonly<Partial<Record<LimitKey, DecimalFact>>>;
  /** Every other key, listed under its own name. */
  other: readonly FigureFact[];
}

/** `envelope_compliance` as the response states it. Every field is the server's; nothing is divided or compared. */
export interface ComplianceFact {
  /** The caps the compliance panel states, per cap. A cap it does not state is absent. */
  limits: Readonly<Partial<Record<LimitKey, DecimalFact>>>;
  consumed: FigureSet | null;
  headroom: FigureSet | null;
  /** The boolean as published (`false` today); `null` = not a boolean. */
  baseRiskProfileVerified: boolean | null;
}

export interface CanaryView {
  body: CanaryBody;
  schemaVersion: string | null;
  deploymentId: string | null;
  portfolioId: string | null;
  accountId: string | null;
  venue: string | null;
  /** The stage the body declares ("LIVE_CANARY"); `null` for a V2 proposal body (it declares an environment, not a stage). */
  declaredStage: string | null;
  /** The runtime word as published; `null` = none (always, today). */
  runtimeState: string | null;
  /** `null` = not stated. Never 0. */
  dayIndex: number | null;
  /** Duration in days; in a V2 body it is the proposal's (proposed, not effective). */
  durationDays: number | null;
  envelope: EnvelopeFact | null;
  /** V2 body: the envelope is "proposed, not effective" and the Portal published nothing about the running canary. */
  proposalOnly: boolean;
  /** The body says the Portal asked the Trading System to act (fail-closed: an unreadable flag is `true`). A V2 body is pinned `false` by its reader. */
  sourceActed: boolean;
  /** V2 body: why the proposal section is absent, when it is (the server's reason code). */
  proposalAbsentReason: string | null;
  kpis: Readonly<Record<KpiKey, KpiFact | null>>;
  compliance: PanelFact | null;
  internal: PanelFact | null;
  broker: PanelFact | null;
  difference: PanelFact | null;
  positions: RowsFact<PositionRow>;
  orders: RowsFact<OrderRow>;
  series: PanelFact | null;
  rollback: PanelFact | null;
  /** `rollback_readiness.ready` as the boolean published; `null` = the response carries none (V2 body) or it is not a boolean. */
  rollbackReady: boolean | null;
  /** `rollback_readiness.blocker_codes` (at most 16). */
  rollbackBlockerCodes: readonly string[];
  /** `envelope_compliance`'s limits, consumed, headroom and base-risk-profile flag; `null` = not in this response (V2 body). */
  complianceFacts: ComplianceFact | null;
  /** `null` = the response carries no command policy (V2 body). */
  protective: ActionGroupFact | null;
  scaleUp: ActionGroupFact | null;
  /** `production_command_active` exactly as published; V2 body states it on the envelope. `null` = not stated. */
  productionCommandActive: boolean | null;
  blockers: readonly BlockerFact[];
  lineage: readonly LineageFact[];
  /** V2 body: when the Portal read it (a Portal clock, not source freshness); `null` for a V1 body, which carries none. */
  observedAtMs: number | null;
}

export type CanaryReadResult =
  | { kind: "view"; view: CanaryView }
  | { kind: "unsupported"; text: string };

/* ── helpers ──────────────────────────────────────────────────────────────── */

const MAX_BLOCKERS = 48;
const MAX_LINEAGE = 12;
const CURRENCY = /^[A-Z0-9]{2,12}$/;
const IDENT = /^[A-Za-z0-9._:-]{1,191}$/;

const KNOWN_STATES: readonly PanelFactState[] = [
  "loading", "ok", "empty", "partial", "stale", "denied", "unavailable", "insufficient_data", "terminal", "suppressed",
];
// The bodies publish FRESH | AGING | STALE | UNKNOWN (sandbox: OK | STALE | UNKNOWN); the V1 reader reads FRESH as OK.
const KNOWN_FRESHNESS: readonly string[] = ["OK", "AGING", "STALE", "UNKNOWN"];

function ident(value: unknown): string | null {
  return typeof value === "string" && IDENT.test(value) ? value : null;
}

function currencyOf(value: unknown): string | null {
  return typeof value === "string" && CURRENCY.test(value) ? value : null;
}

function nonNegativeInt(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

/** An ISO instant to epoch ms; anything else (including a date with no zone) is "not stated". */
function isoMs(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(value)) return null;
  const ms = Date.parse(value);
  return Number.isSafeInteger(ms) ? ms : null;
}

/** An exact money decimal, or `unreadable`. A cap or a KPI is never repaired. */
export function moneyFact(value: unknown): DecimalFact | null {
  if (value === null || value === undefined) return null;
  const decimal = readDecimal(value, { unit: "money" });
  return decimal === null ? { kind: "unreadable" } : { kind: "value", decimal };
}

/** An exact integer count, or `unreadable`: a count with a fraction is not a count. */
export function countFact(value: unknown): DecimalFact | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    // The V1 reader already gives integers as numbers (max_open_orders, duration_days).
    if (!Number.isSafeInteger(value) || value < 0) return { kind: "unreadable" };
    value = String(value);
  }
  if (typeof value !== "string" || !/^(0|[1-9]\d{0,17})$/.test(value)) return { kind: "unreadable" };
  const decimal = readDecimal(value, { unit: "count" });
  return decimal === null ? { kind: "unreadable" } : { kind: "value", decimal };
}

function panelFact(panel: PanelEnvelope | null | undefined): PanelFact | null {
  if (panel === null || panel === undefined || typeof panel !== "object") return null;
  const raw: PanelFactState = panel.suppressed === true ? "suppressed" : (panel.panelState as PanelFactState);
  const state: PanelFactState = KNOWN_STATES.includes(raw) ? raw : "unavailable";
  const freshness = typeof panel.freshness === "string" && KNOWN_FRESHNESS.includes(panel.freshness) ? panel.freshness : null;
  return { state, freshness, asOfMs: isoMs(panel.asOf), authority: panel.authority ?? null };
}

function href(value: unknown): string | null {
  // An in-app path only: a link out of the app, a protocol-relative one or a backslash one is not a lineage link.
  return typeof value === "string" && !/\s/.test(value) ? safeInternalHref(value) : null;
}

/** Closed list of codes the V1 and V2 bodies may carry; any other code is kept and shown in Provenance only. */
export const KNOWN_BLOCKER_CODES = [
  "PRODUCTION_COMMAND_INACTIVE",
  "CANARY_OWNER_GATE_REQUIRED",
  "LIVE_SOURCE_UNAVAILABLE",
  "BASE_RISK_PROFILE_UNVERIFIED",
  "BROKER_SYNC_UNAVAILABLE",
  "PROTECTIVE_CAPABILITY_UNAVAILABLE",
] as const;

function blockerFacts(
  groups: readonly (readonly [BlockerFact["origin"], readonly string[]])[],
): readonly BlockerFact[] {
  const seen = new Set<string>();
  const out: BlockerFact[] = [];
  for (const [origin, codes] of groups) {
    for (const code of codes) {
      if (typeof code !== "string" || code === "" || code.length > 191 || seen.has(code)) continue;
      if (out.length >= MAX_BLOCKERS) return out;
      seen.add(code);
      out.push({ origin, code, known: (KNOWN_BLOCKER_CODES as readonly string[]).includes(code) });
    }
  }
  return out;
}

const EMPTY_ROWS = { panel: null, rows: null, total: null, published: null } as const;

/** Wire name of a cap, as `envelope_compliance.limits` spells it, to the screen's cap key. */
const LIMIT_WIRE: Readonly<Record<string, LimitKey>> = {
  capital_cap: "capital",
  gross_notional_cap: "grossNotional",
  daily_loss_cap: "dailyLoss",
  max_open_orders: "openOrders",
};

function limitDecimal(key: LimitKey, value: unknown): DecimalFact | null {
  return key === "openOrders" ? countFact(value) : moneyFact(value);
}

/** `consumed` / `headroom`: a key spelled like a cap belongs to that cap; any other key is listed under its own name. */
function figureSet(map: Readonly<Record<string, string>> | null | undefined): FigureSet | null {
  if (map === null || map === undefined || typeof map !== "object") return null;
  const byLimit: Partial<Record<LimitKey, DecimalFact>> = {};
  const other: FigureFact[] = [];
  for (const [key, exact] of Object.entries(map)) {
    const limit = Object.hasOwn(LIMIT_WIRE, key) ? LIMIT_WIRE[key]! : null;
    if (limit !== null) {
      const fact = limitDecimal(limit, exact);
      if (fact !== null) byLimit[limit] = fact;
    } else if (typeof exact === "string" && readDecimal(exact, { unit: "money" }) !== null && other.length < 8) {
      other.push({ key, exact });
    }
  }
  return { byLimit, other };
}

const LIMIT_ORDER: readonly LimitKey[] = LIMIT_KEYS;

function limitFacts(values: Readonly<Record<LimitKey, DecimalFact | null>>): readonly LimitFact[] {
  return LIMIT_ORDER.map((key) => ({ key, value: values[key], usedRatio: undefined }));
}

function actionGroup(policy: CanaryActionPolicy | null | undefined): ActionGroupFact | null {
  if (policy === null || policy === undefined || typeof policy !== "object") return null;
  // Fail closed: an unreadable flag means "broker staleness blocks this action".
  return { brokerSyncBlocks: policy.brokerSyncBlocks !== false };
}

/* ── V1 ───────────────────────────────────────────────────────────────────── */

const KPI_UNIT: Readonly<Record<KpiKey, "money" | "count">> = {
  capital_consumed: "money",
  gross_notional: "money",
  daily_pnl: "money",
  open_orders: "count",
  broker_equity: "money",
};

/**
 * A KPI value is drawn only from a panel that vouches for it. A suppressed, unavailable, denied,
 * empty, failed or unknown panel may still carry a number on the wire; that number is not shown.
 */
export const KPI_VALUE_STATES: readonly PanelFactState[] = ["ok", "partial", "stale"];

function readV1(room: CanaryControlRoom, schemaVersion: string | null): CanaryView | null {
  if (typeof room !== "object" || room === null) return null;
  const deploymentId = ident(room.deploymentId);
  // A V1 control room names its deployment; one that does not is not a body this screen can place.
  if (deploymentId === null) return null;

  const kpis: Record<KpiKey, KpiFact | null> = { capital_consumed: null, gross_notional: null, daily_pnl: null, open_orders: null, broker_equity: null };
  for (const k of Array.isArray(room.kpis) ? room.kpis : []) {
    const key = KPI_KEYS.find((candidate) => candidate === k?.key);
    const panel = panelFact(k?.envelope);
    if (key === undefined || kpis[key] !== null || panel === null) continue;
    kpis[key] = {
      key,
      value: !KPI_VALUE_STATES.includes(panel.state) ? null : KPI_UNIT[key] === "money" ? moneyFact(k.value) : countFact(k.value),
      // The wire's `unit` is a currency pattern even for the open-orders count (the published fixture says USDT):
      // a count never carries it.
      currency: KPI_UNIT[key] === "money" ? currencyOf(k.unit) : null,
      panel,
    };
  }

  const sourceById = new Map<string, PanelFact>();
  for (const p of Array.isArray(room.sourcePanels) ? room.sourcePanels : []) {
    const fact = panelFact(p);
    if (fact !== null && ["internal", "broker", "difference"].includes(p.panelId) && !sourceById.has(p.panelId)) sourceById.set(p.panelId, fact);
  }

  const env = room.envelope;
  const currency = currencyOf(env?.currency);
  const envelope: EnvelopeFact | null = env
    ? {
        envelopeId: ident(env.envelopeId),
        revision: nonNegativeInt(env.revision),
        status: typeof env.status === "string" && env.status !== "" && env.status.length <= 64 ? env.status : null,
        currency,
        baseRiskProfileRevision: ident(env.baseRiskProfileRevision),
        limits: limitFacts({
          capital: moneyFact(env.limits?.capitalCap),
          grossNotional: moneyFact(env.limits?.grossNotionalCap),
          dailyLoss: moneyFact(env.limits?.dailyLossCap),
          openOrders: countFact(env.limits?.maxOpenOrders),
          duration: countFact(env.limits?.durationDays),
        }),
      }
    : null;

  const policy = room.commandPolicy;
  const compliance = room.compliance;
  const complianceLimits: Partial<Record<LimitKey, DecimalFact>> = {};
  if (compliance) {
    for (const [key, value] of [
      ["capital", compliance.limits.capitalCap],
      ["grossNotional", compliance.limits.grossNotionalCap],
      ["dailyLoss", compliance.limits.dailyLossCap],
      ["openOrders", compliance.limits.maxOpenOrders],
    ] as const) {
      const fact = value === null ? null : limitDecimal(key, value);
      if (fact !== null) complianceLimits[key] = fact;
    }
  }
  const complianceFacts: ComplianceFact | null = compliance
    ? {
        limits: complianceLimits,
        consumed: figureSet(compliance.consumed),
        headroom: figureSet(compliance.headroom),
        baseRiskProfileVerified: typeof compliance.baseRiskProfileVerified === "boolean" ? compliance.baseRiskProfileVerified : null,
      }
    : null;
  const rollbackDetail = room.rollbackDetail;
  const blockers = blockerFacts([
    ["lifecycle", Array.isArray(room.lifecycleBlockers) ? room.lifecycleBlockers : []],
    ["envelope", Array.isArray(env?.blockerCodes) ? env.blockerCodes : []],
    ["protective", Array.isArray(policy?.protective?.blockerCodes) ? policy.protective.blockerCodes : []],
    ["scale-up", Array.isArray(policy?.scaleUp?.blockerCodes) ? policy.scaleUp.blockerCodes : []],
  ]);

  const lineage: LineageFact[] = [];
  for (const item of Array.isArray(room.lineage) ? room.lineage : []) {
    if (lineage.length >= MAX_LINEAGE) break;
    if (typeof item?.kind === "string" && typeof item.value === "string" && item.value !== "" && item.value.length <= 191) {
      lineage.push({ kind: item.kind.slice(0, 64), value: item.value, href: href(item.href) });
    }
  }

  const day = nonNegativeInt(room.dayIndex);
  const duration = nonNegativeInt(room.durationDays);
  return {
    body: "v1",
    schemaVersion,
    deploymentId,
    portfolioId: ident(room.portfolioId),
    accountId: ident(room.accountId),
    venue: ident(room.venue),
    declaredStage: typeof room.declaredStage === "string" ? room.declaredStage.slice(0, 64) : null,
    runtimeState: typeof room.runtimeState === "string" && room.runtimeState !== "" ? room.runtimeState.slice(0, 64) : null,
    // Day 0 is "not stated" (the V1 screen says so too), and a day past the duration is unreadable, not "day 20 of 14".
    dayIndex: day !== null && day >= 1 && (duration === null || day <= duration) ? day : null,
    durationDays: duration !== null && duration >= 1 ? duration : null,
    envelope,
    proposalOnly: false,
    sourceActed: room.sourceSideEffectRequested || room.runtimeActivationRequested || room.promotionExecutionRequested,
    proposalAbsentReason: null,
    kpis,
    compliance: panelFact(room.envelopeCompliance),
    internal: sourceById.get("internal") ?? null,
    broker: sourceById.get("broker") ?? null,
    difference: sourceById.get("difference") ?? null,
    positions: { ...EMPTY_ROWS, panel: panelFact(room.positions), published: publishedRowsOf(room.positionRows) },
    orders: { ...EMPTY_ROWS, panel: panelFact(room.blotter), published: publishedRowsOf(room.blotterRows) },
    series: panelFact(room.series),
    rollback: panelFact(room.rollbackReadiness),
    rollbackReady: typeof rollbackDetail?.ready === "boolean" ? rollbackDetail.ready : null,
    rollbackBlockerCodes: (Array.isArray(rollbackDetail?.blockerCodes) ? rollbackDetail.blockerCodes : [])
      .filter((code): code is string => typeof code === "string" && code !== "" && code.length <= 191)
      .slice(0, 16),
    complianceFacts,
    protective: actionGroup(policy?.protective),
    scaleUp: actionGroup(policy?.scaleUp),
    productionCommandActive: policy === null || policy === undefined ? null : typeof policy.productionCommandActive === "boolean" ? policy.productionCommandActive : null,
    blockers,
    lineage,
    observedAtMs: null,
  };
}

/* ── V2 ───────────────────────────────────────────────────────────────────── */

function readV2(parent: CanaryParentV2, schemaVersion: string | null): CanaryView | null {
  if (typeof parent !== "object" || parent === null || parent.family !== "CANARY") return null;
  const deploymentId = ident(parent.anchors?.deploymentId);
  if (deploymentId === null) return null;

  const proposal = parent.proposal;
  const available = proposal?.availability === "AVAILABLE";
  const currency = available ? currencyOf(proposal.currency) : null;
  const decimalOf = (amount: { decimal?: BoundaryDecimal } | undefined): DecimalFact | null =>
    amount?.decimal ? { kind: "value", decimal: amount.decimal } : null;

  const envelope: EnvelopeFact | null = available
    ? {
        envelopeId: ident(parent.envelope?.envelopeId),
        revision: nonNegativeInt(parent.envelope?.revision),
        status: typeof parent.envelope?.status === "string" ? parent.envelope.status : null,
        currency,
        baseRiskProfileRevision: ident(proposal.baseRiskProfileRevision),
        limits: limitFacts({
          capital: decimalOf(proposal.capitalCap),
          grossNotional: decimalOf(proposal.grossNotionalCap),
          dailyLoss: decimalOf(proposal.dailyLossCap),
          openOrders: countFact(proposal.maxOpenOrders),
          duration: countFact(proposal.durationDays),
        }),
      }
    : null;

  const lineage: LineageFact[] = [];
  if (parent.lineage?.availability === "AVAILABLE") {
    const l = parent.lineage;
    for (const [kind, value] of [
      ["CERTIFICATION", l.certificationId], ["CANARY_PROMOTION_PLAN", l.promotionPlanId], ["PAPER_EXIT_REVIEW", l.paperExitReviewId],
      ["R1_APPROVAL", l.r1ApprovalId], ["R2_APPROVAL", l.r2ApprovalId],
    ] as const) {
      const id = ident(value);
      if (id !== null) lineage.push({ kind, value: id, href: null });
    }
  }

  // The V2 body states two things a blocker list may say, each from a published field:
  // the envelope is a draft, and the production command is not active.
  const body: BlockerFact[] = [];
  if (parent.envelope?.status === "DRAFT") body.push({ origin: "body", code: null, known: false });
  const commandActive = typeof parent.envelope?.productionCommandActive === "boolean" ? parent.envelope.productionCommandActive : null;
  if (commandActive === false) body.push({ origin: "body", code: "PRODUCTION_COMMAND_INACTIVE", known: true });

  const duration = available ? nonNegativeInt(proposal.durationDays) : null;
  const none: Record<KpiKey, KpiFact | null> = { capital_consumed: null, gross_notional: null, daily_pnl: null, open_orders: null, broker_equity: null };
  return {
    body: "v2",
    schemaVersion,
    deploymentId,
    portfolioId: ident(parent.anchors.portfolioId),
    accountId: null,
    venue: null,
    declaredStage: null,
    runtimeState: null,
    dayIndex: null,
    durationDays: duration !== null && duration >= 1 ? duration : null,
    envelope,
    proposalOnly: true,
    sourceActed: false,
    proposalAbsentReason: !available && proposal?.availability === "NOT_PUBLISHED" && typeof proposal.reasonCode === "string" ? proposal.reasonCode.slice(0, 128) : null,
    kpis: none,
    compliance: null,
    internal: null,
    broker: null,
    difference: null,
    positions: { ...EMPTY_ROWS },
    orders: { ...EMPTY_ROWS },
    series: null,
    rollback: null,
    rollbackReady: null,
    rollbackBlockerCodes: [],
    complianceFacts: null,
    protective: null,
    scaleUp: null,
    productionCommandActive: commandActive,
    blockers: body,
    lineage,
    observedAtMs: typeof parent.header?.observedAt === "number" && Number.isSafeInteger(parent.header.observedAt) ? parent.header.observedAt : null,
  };
}

/* ── entry ────────────────────────────────────────────────────────────────── */

const UNREADABLE: CanaryReadResult = { kind: "unsupported", text: "The response is not a Canary control room this screen can read." };

/** The port's answer to a view the screen prints, or the sentence that says it could not be read. Never throws. */
export function readCanaryView(read: CanaryVersionRead | null | undefined): CanaryReadResult {
  try {
    if (read === null || read === undefined || typeof read !== "object") return UNREADABLE;
    if (read.kind === "unsupported") return { kind: "unsupported", text: unsupportedText(read) };
    const view = read.kind === "v1" ? readV1(read.value, read.schemaVersion) : read.kind === "v2" ? readV2(read.value, read.schemaVersion) : null;
    return view === null ? UNREADABLE : { kind: "view", view };
  } catch {
    return UNREADABLE;
  }
}
