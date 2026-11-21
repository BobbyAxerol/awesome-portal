/**
 * BE-P2 / BE-P3 additive members of the stage bodies, read as CLOSED objects
 * (`packages/contracts/schemas/execution-stage-facts.v1.schema.json`, FE-066/067/070/071/072, S3-U4/U5).
 *
 * Every parser here mirrors a schema definition exactly:
 *
 * - an object has exactly the schema's keys (`additionalProperties: false`, every key `required`): a missing
 *   key, an extra key, a wrong type, a word outside an enum, a decimal that is not canonical, a timestamp that
 *   does not parse, a bound exceeded, or a conditional (`allOf` / `if` / `then`) the schema states and the
 *   body breaks, REFUSES the member. A refused member is `null`, the same shape as an absent one, so a screen
 *   can never print a value from a member it could not fully read. Nothing is repaired, clamped or coerced.
 * - a *Fact* is `{availability: AVAILABLE, value, reason_code: null}` or
 *   `{availability: NOT_PUBLISHED, value: null, reason_code}`. There is no third shape: an AVAILABLE fact with
 *   a null value, a NOT_PUBLISHED one that carries a value, or one without a reason code is refused.
 * - decimals stay STRINGS (never `Number()`); a published exact `"0"` is a value, a missing one is `null`.
 *
 * The V1 readers (`certification.ts`, `liveFull.ts`) call these and carry the results as additive fields the V1
 * screens never print; the V2 readers map them to views. The Paper workbench reads the same members out of
 * `ProfileEnvelope.objects`.
 */
import { unsafeText } from "./unsafeText";

type Json = Record<string, unknown>;

function obj(raw: unknown): Json | null {
  return typeof raw === "object" && raw !== null && !Array.isArray(raw) ? (raw as Json) : null;
}

/** The object when its own keys are EXACTLY `keys` (the schema's `required` list with `additionalProperties: false`). */
function exact(raw: unknown, keys: readonly string[]): Json | null {
  const o = obj(raw);
  if (o === null) return null;
  const own = Object.keys(o);
  if (own.length !== keys.length || !keys.every((key) => Object.hasOwn(o, key))) return null;
  return o;
}

/* ── scalar grammars (the schema's patterns) ─────────────────────────────── */

const REASON = /^[A-Z][A-Z0-9_]{2,127}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:@+-]{0,190}$/;
const SYMBOL = /^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,127}$/;
const WORD = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;
const DECIMAL = /^(?:0|[1-9][0-9]{0,39})(?:\.[0-9]{0,39}[1-9])?$/;
const SIGNED_DECIMAL = /^(?!-0$)-?(?:0|[1-9][0-9]{0,39})(?:\.[0-9]{0,39}[1-9])?$/;
const UNIT = /^[A-Z0-9]{2,12}$/;
const RESOLUTION = /^[0-9]{1,3}[smhd]$/;
const METHODOLOGY = /^[A-Za-z0-9][A-Za-z0-9._:@+/-]{0,190}$/;
const CLOCK = /^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/;
const DATE = /^[0-9]{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])$/;
const TIMEZONE = /^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+){1,2}$/;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function reason(raw: unknown): string | null {
  return typeof raw === "string" && REASON.test(raw) ? raw : null;
}
function identifier(raw: unknown): string | null {
  return typeof raw === "string" && IDENTIFIER.test(raw) ? raw : null;
}
function timestamp(raw: unknown): string | null {
  return typeof raw === "string" && TIMESTAMP.test(raw) && Number.isFinite(Date.parse(raw)) ? raw : null;
}
function decimal(raw: unknown): string | null {
  return typeof raw === "string" && raw.length <= 82 && DECIMAL.test(raw) ? raw : null;
}
function signedDecimal(raw: unknown): string | null {
  return typeof raw === "string" && raw.length <= 83 && SIGNED_DECIMAL.test(raw) ? raw : null;
}
function nonNegativeInt(raw: unknown): number | null {
  return typeof raw === "number" && Number.isSafeInteger(raw) && raw >= 0 ? raw : null;
}
function boundedInt(raw: unknown, min: number, max: number): number | null {
  return typeof raw === "number" && Number.isSafeInteger(raw) && raw >= min && raw <= max ? raw : null;
}

/* ── Fact ────────────────────────────────────────────────────────────────── */

/** A published value or the server's reason for not publishing it. */
export type Fact<T> = { availability: "AVAILABLE"; value: T } | { availability: "NOT_PUBLISHED"; reasonCode: string };

/** The refusal marker of a value reader (a value may legitimately be `null`, so `null` cannot be the refusal). */
const NO = Symbol("refused");
/** The refusal marker a value reader returns (exported for tests that read a Fact with their own reader). */
export const REFUSED: typeof NO = NO;
type Reader<T> = (raw: unknown) => T | typeof NO;

/** One Fact. `null` = absent or refused. */
export function readFact<T>(raw: unknown, value: Reader<T>): Fact<T> | null {
  const o = exact(raw, ["availability", "value", "reason_code"]);
  if (o === null) return null;
  if (o.availability === "AVAILABLE") {
    if (o.reason_code !== null) return null;
    const read = value(o.value);
    return read === NO ? null : { availability: "AVAILABLE", value: read };
  }
  if (o.availability === "NOT_PUBLISHED") {
    if (o.value !== null) return null;
    const code = reason(o.reason_code);
    return code === null ? null : { availability: "NOT_PUBLISHED", reasonCode: code };
  }
  return null;
}

const inEnum =
  <T extends string>(words: readonly T[]): Reader<T> =>
  (raw) =>
    typeof raw === "string" && (words as readonly string[]).includes(raw) ? (raw as T) : NO;
const asTimestamp: Reader<string> = (raw) => timestamp(raw) ?? NO;
const asDecimal: Reader<string> = (raw) => decimal(raw) ?? NO;
const asSignedDecimal: Reader<string> = (raw) => signedDecimal(raw) ?? NO;
const asCount: Reader<number> = (raw) => nonNegativeInt(raw) ?? NO;
const asBoolean: Reader<boolean> = (raw) => (typeof raw === "boolean" ? raw : NO);

const factTimestamp = (raw: unknown) => readFact(raw, asTimestamp);
const factDecimal = (raw: unknown) => readFact(raw, asDecimal);
const factSignedDecimal = (raw: unknown) => readFact(raw, asSignedDecimal);
const factBoolean = (raw: unknown) => readFact(raw, asBoolean);

/* ── stage facts: runtime, reconciliation, sessions (FE-067) ─────────────── */

export const RUNTIME_WORDS = ["RUNNING", "PAUSED", "HALTED", "STOPPED"] as const;
export type RuntimeWord = (typeof RUNTIME_WORDS)[number];
export const RECONCILIATION_VERDICTS = ["NO_OPEN_FINDINGS", "OPEN_FINDINGS"] as const;
export type ReconciliationVerdict = (typeof RECONCILIATION_VERDICTS)[number];

export interface StageSessionRow {
  id: string;
  started: string;
  /** `null` = the session has no completion time. */
  ended: string | null;
  /** The source's own word, or `null`. */
  state: string | null;
}

export interface StageSessions {
  availability: "AVAILABLE" | "NOT_PUBLISHED";
  /** `null` exactly when AVAILABLE. */
  reasonCode: string | null;
  rows: readonly StageSessionRow[];
  returnedCount: number;
  /** Rows the server could not type; counted, never listed. */
  omittedCount: number;
  /** `null` exactly when NOT_PUBLISHED. */
  sourceComplete: boolean | null;
}

export interface StageFacts {
  runtime: { state: Fact<RuntimeWord>; since: Fact<string> };
  reconciliation: {
    verdict: Fact<ReconciliationVerdict>;
    openFindingCount: Fact<number>;
    /** AVAILABLE only when the server proved it (exact 0 with nothing open). */
    unknownOrderCount: Fact<number>;
    asOf: Fact<string>;
  };
  sessions: StageSessions;
}

function sessionRow(raw: unknown): StageSessionRow | null {
  const o = exact(raw, ["id", "started", "ended", "state"]);
  if (o === null) return null;
  const id = identifier(o.id);
  const started = timestamp(o.started);
  const ended = o.ended === null ? null : timestamp(o.ended);
  const state = o.state === null ? null : typeof o.state === "string" && /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(o.state) ? o.state : undefined;
  if (id === null || started === null || (o.ended !== null && ended === null) || state === undefined) return null;
  return { id, started, ended, state };
}

function sessions(raw: unknown): StageSessions | null {
  const o = exact(raw, ["availability", "reason_code", "basis", "rows", "returned_count", "omitted_count", "source_complete"]);
  if (o === null || o.basis !== "EXECUTION_SESSIONS_BOUNDED_WINDOW") return null;
  if (o.availability !== "AVAILABLE" && o.availability !== "NOT_PUBLISHED") return null;
  if (!Array.isArray(o.rows) || o.rows.length > 50) return null;
  const rows: StageSessionRow[] = [];
  for (const entry of o.rows) {
    const row = sessionRow(entry);
    if (row === null) return null;
    rows.push(row);
  }
  const returned = boundedInt(o.returned_count, 0, 50);
  const omitted = nonNegativeInt(o.omitted_count);
  if (returned === null || omitted === null) return null;
  if (o.availability === "NOT_PUBLISHED") {
    const code = reason(o.reason_code);
    if (code === null || rows.length !== 0 || returned !== 0 || omitted !== 0 || o.source_complete !== null) return null;
    return { availability: "NOT_PUBLISHED", reasonCode: code, rows: [], returnedCount: 0, omittedCount: 0, sourceComplete: null };
  }
  if (o.reason_code !== null || typeof o.source_complete !== "boolean") return null;
  return { availability: "AVAILABLE", reasonCode: null, rows, returnedCount: returned, omittedCount: omitted, sourceComplete: o.source_complete };
}

/** `stage_facts` (Paper `data.stage_facts`; Sandbox, Canary and Live top level). */
export function readStageFacts(raw: unknown): StageFacts | null {
  const o = exact(raw, ["schema_version", "runtime", "reconciliation", "sessions"]);
  if (o === null || o.schema_version !== "execution.stage-facts.v1") return null;
  const runtime = exact(o.runtime, ["runtime_state", "since"]);
  const recon = exact(o.reconciliation, ["basis", "verdict", "open_finding_count", "unknown_order_count", "as_of"]);
  if (runtime === null || recon === null || recon.basis !== "FINDINGS_RELATION_NOT_A_RECONCILIATION_RUN") return null;
  const state = readFact(runtime.runtime_state, inEnum(RUNTIME_WORDS));
  const since = factTimestamp(runtime.since);
  const verdict = readFact(recon.verdict, inEnum(RECONCILIATION_VERDICTS));
  const open = readFact(recon.open_finding_count, asCount);
  const unknown = readFact(recon.unknown_order_count, asCount);
  const asOf = factTimestamp(recon.as_of);
  const rows = sessions(o.sessions);
  if (state === null || since === null || verdict === null || open === null || unknown === null || asOf === null || rows === null) return null;
  return {
    runtime: { state, since },
    reconciliation: { verdict, openFindingCount: open, unknownOrderCount: unknown, asOf },
    sessions: rows,
  };
}

/* ── Canary envelope compliance, rollback items, trial (FE-071) ──────────── */

export const CAP_KEYS = ["capital", "gross_notional", "daily_loss", "open_orders"] as const;
export type CapKey = (typeof CAP_KEYS)[number];

export interface EnvelopeComplianceRow {
  cap: CapKey;
  unit: string;
  policyLimit: Fact<string>;
  /** The stored envelope's own approved limit, exact. */
  approved: string;
  consumed: Fact<string>;
  /** The SERVER's consumed / approved at 6 digits; the browser never divides. May exceed 1. */
  usedRatio: Fact<string>;
  asOf: Fact<string>;
}

export const ENVELOPE_VERDICT_STATES = ["WITHIN_ENVELOPE", "BREACH", "UNDETERMINED"] as const;
export type EnvelopeVerdictState = (typeof ENVELOPE_VERDICT_STATES)[number];

export interface EnvelopeVerdict {
  state: EnvelopeVerdictState;
  undeterminedCaps: readonly CapKey[];
}

function complianceRow(raw: unknown): EnvelopeComplianceRow | null {
  const o = exact(raw, ["cap", "unit", "policy_limit", "approved", "consumed", "used_ratio", "as_of"]);
  if (o === null) return null;
  const cap = inEnum(CAP_KEYS)(o.cap);
  const unit = typeof o.unit === "string" && UNIT.test(o.unit) ? o.unit : null;
  const approved = decimal(o.approved);
  const policyLimit = factDecimal(o.policy_limit);
  const consumed = factDecimal(o.consumed);
  const usedRatio = factDecimal(o.used_ratio);
  const asOf = factTimestamp(o.as_of);
  if (cap === NO || unit === null || approved === null || policyLimit === null || consumed === null || usedRatio === null || asOf === null) return null;
  return { cap, unit, policyLimit, approved, consumed, usedRatio, asOf };
}

/** `envelope_compliance.rows`: exactly four rows, one per cap, in the published order. */
export function readComplianceRows(raw: unknown): readonly EnvelopeComplianceRow[] | null {
  if (!Array.isArray(raw) || raw.length !== 4) return null;
  const rows: EnvelopeComplianceRow[] = [];
  for (const [index, entry] of raw.entries()) {
    const row = complianceRow(entry);
    if (row === null || row.cap !== CAP_KEYS[index]) return null;
    rows.push(row);
  }
  return rows;
}

/** `envelope_compliance.verdict`. */
export function readEnvelopeVerdict(raw: unknown): EnvelopeVerdict | null {
  const o = exact(raw, ["state", "basis", "undetermined_caps"]);
  if (o === null || o.basis !== "CONSUMED_NOT_ABOVE_APPROVED_PER_CAP") return null;
  const state = inEnum(ENVELOPE_VERDICT_STATES)(o.state);
  if (state === NO || !Array.isArray(o.undetermined_caps) || o.undetermined_caps.length > 4) return null;
  const caps: CapKey[] = [];
  for (const entry of o.undetermined_caps) {
    const cap = inEnum(CAP_KEYS)(entry);
    if (cap === NO || caps.includes(cap)) return null;
    caps.push(cap);
  }
  if (state === "UNDETERMINED" && caps.length < 1) return null;
  if (state === "WITHIN_ENVELOPE" && caps.length !== 0) return null;
  return { state, undeterminedCaps: caps };
}

export const ROLLBACK_KEYS = ["flatten_plan", "paper_twin", "broker_data", "rollback_drill"] as const;
export type RollbackKey = (typeof ROLLBACK_KEYS)[number];

export interface RollbackReadinessItem {
  key: RollbackKey;
  ready: Fact<boolean>;
  checkedAt: Fact<string>;
}

/** `rollback_readiness.items`: exactly four, one per check, in the published order. */
export function readRollbackItems(raw: unknown): readonly RollbackReadinessItem[] | null {
  if (!Array.isArray(raw) || raw.length !== 4) return null;
  const items: RollbackReadinessItem[] = [];
  for (const [index, entry] of raw.entries()) {
    const o = exact(entry, ["key", "ready", "checked_at"]);
    if (o === null || o.key !== ROLLBACK_KEYS[index]) return null;
    const ready = factBoolean(o.ready);
    const checkedAt = factTimestamp(o.checked_at);
    if (ready === null || checkedAt === null) return null;
    items.push({ key: ROLLBACK_KEYS[index]!, ready, checkedAt });
  }
  return items;
}

export interface TrialSchedule {
  durationDays: number;
  startedAt: Fact<string>;
  exitReviewOpensAt: Fact<string>;
}

/** `lifecycle.trial`. */
export function readTrial(raw: unknown): TrialSchedule | null {
  const o = exact(raw, ["basis", "duration_days", "started_at", "exit_review_opens_at"]);
  if (o === null || o.basis !== "STARTED_AT_PLUS_DURATION_DAYS") return null;
  const days = boundedInt(o.duration_days, 1, 90);
  const startedAt = factTimestamp(o.started_at);
  const opens = factTimestamp(o.exit_review_opens_at);
  if (days === null || startedAt === null || opens === null) return null;
  return { durationDays: days, startedAt, exitReviewOpensAt: opens };
}

/* ── typed rows, figures, series, gap window (FE-072) ────────────────────── */

export interface TypedPositionRow {
  id: string | null;
  symbol: string;
  side: "long" | "short" | null;
  quantity: string | null;
  entry: string | null;
  mark: string | null;
  unrealised: string | null;
}

export interface TypedOrderRow {
  id: string | null;
  symbol: string;
  type: string | null;
  side: "buy" | "sell" | null;
  quantity: string | null;
  price: string | null;
  status: string | null;
  /** The order's `submitted_at`. */
  since: string | null;
}

export interface NotPublishedColumn {
  column: string;
  reasonCode: string;
}

export interface TypedRows<R> {
  availability: "AVAILABLE" | "NOT_PUBLISHED";
  reasonCode: string | null;
  rows: readonly R[];
  returnedCount: number;
  omittedCount: number;
  sourceComplete: boolean | null;
  notPublishedColumns: readonly NotPublishedColumn[];
}

const nullable = <T>(read: (raw: unknown) => T | null, raw: unknown): T | null | undefined => (raw === null ? null : (read(raw) ?? undefined));

function positionRow(raw: unknown): TypedPositionRow | null {
  const o = exact(raw, ["id", "symbol", "side", "quantity", "entry", "mark", "unrealised", "leverage"]);
  if (o === null || o.leverage !== null) return null;
  const id = nullable(identifier, o.id);
  const symbol = typeof o.symbol === "string" && SYMBOL.test(o.symbol) ? o.symbol : null;
  const side = o.side === null || o.side === "long" || o.side === "short" ? o.side : undefined;
  const quantity = nullable(decimal, o.quantity);
  const entry = nullable(decimal, o.entry);
  const mark = nullable(decimal, o.mark);
  const unrealised = nullable(signedDecimal, o.unrealised);
  if (id === undefined || symbol === null || side === undefined || quantity === undefined || entry === undefined || mark === undefined || unrealised === undefined) return null;
  return { id, symbol, side, quantity, entry, mark, unrealised };
}

function word(raw: unknown): string | null {
  return typeof raw === "string" && WORD.test(raw) ? raw : null;
}

function orderRow(raw: unknown): TypedOrderRow | null {
  const o = exact(raw, ["id", "symbol", "type", "side", "quantity", "price", "status", "since", "ack_latency_ms"]);
  if (o === null || o.ack_latency_ms !== null) return null;
  const id = nullable(identifier, o.id);
  const symbol = typeof o.symbol === "string" && SYMBOL.test(o.symbol) ? o.symbol : null;
  const type = nullable(word, o.type);
  const side = o.side === null || o.side === "buy" || o.side === "sell" ? o.side : undefined;
  const quantity = nullable(decimal, o.quantity);
  const price = nullable(decimal, o.price);
  const status = nullable(word, o.status);
  const since = nullable(timestamp, o.since);
  if (id === undefined || symbol === null || type === undefined || side === undefined || quantity === undefined || price === undefined || status === undefined || since === undefined) return null;
  return { id, symbol, type, side, quantity, price, status, since };
}

function typedRows<R>(raw: unknown, kind: "positions" | "orders", row: (raw: unknown) => R | null): TypedRows<R> | null {
  const o = exact(raw, ["kind", "availability", "reason_code", "rows", "returned_count", "omitted_count", "source_complete", "not_published_columns"]);
  if (o === null || o.kind !== kind) return null;
  if (o.availability !== "AVAILABLE" && o.availability !== "NOT_PUBLISHED") return null;
  if (!Array.isArray(o.rows) || o.rows.length > 200 || !Array.isArray(o.not_published_columns) || o.not_published_columns.length > 8) return null;
  const rows: R[] = [];
  for (const entry of o.rows) {
    const read = row(entry);
    if (read === null) return null;
    rows.push(read);
  }
  const columns: NotPublishedColumn[] = [];
  for (const entry of o.not_published_columns) {
    const c = exact(entry, ["column", "reason_code"]);
    const code = reason(c?.reason_code);
    if (c === null || typeof c.column !== "string" || !/^[a-z][a-z0-9_]{1,63}$/.test(c.column) || code === null) return null;
    columns.push({ column: c.column, reasonCode: code });
  }
  const returned = boundedInt(o.returned_count, 0, 200);
  const omitted = nonNegativeInt(o.omitted_count);
  if (returned === null || omitted === null) return null;
  if (o.availability === "NOT_PUBLISHED") {
    const code = reason(o.reason_code);
    if (code === null || rows.length !== 0 || returned !== 0 || omitted !== 0 || o.source_complete !== null) return null;
    return { availability: "NOT_PUBLISHED", reasonCode: code, rows: [], returnedCount: 0, omittedCount: 0, sourceComplete: null, notPublishedColumns: columns };
  }
  if (o.reason_code !== null || typeof o.source_complete !== "boolean") return null;
  return { availability: "AVAILABLE", reasonCode: null, rows, returnedCount: returned, omittedCount: omitted, sourceComplete: o.source_complete, notPublishedColumns: columns };
}

/** `positions.typed` (Canary and Live positions collections). */
export const readTypedPositions = (raw: unknown): TypedRows<TypedPositionRow> | null => typedRows(raw, "positions", positionRow);
/** `blotter.typed` (Canary) and `orders.typed` (Live). */
export const readTypedOrders = (raw: unknown): TypedRows<TypedOrderRow> | null => typedRows(raw, "orders", orderRow);

export const FIGURE_KEYS = ["equity", "gross_notional", "positions", "open_orders", "fees"] as const;
export type FigureKey = (typeof FIGURE_KEYS)[number];

export interface SourceFigure {
  key: FigureKey;
  label: string;
  /** A currency word, `COUNT`, or `null` when the figure has no unit the server states. */
  unit: string | null;
  internal: Fact<string>;
  broker: Fact<string>;
  /** The SERVER's internal minus broker; the browser never subtracts. */
  difference: Fact<string>;
}

/** `source_figures`: the Internal / Broker / Difference rows in the published order (equity, gross notional, positions, open orders, fees). */
export function readSourceFigures(raw: unknown): readonly SourceFigure[] | null {
  const o = exact(raw, ["basis", "figures"]);
  if (o === null || o.basis !== "SOURCE_RELATIONS_HELD_BY_THE_PORTAL" || !Array.isArray(o.figures) || o.figures.length !== 5) return null;
  const figures: SourceFigure[] = [];
  for (const [index, entry] of o.figures.entries()) {
    const f = exact(entry, ["key", "label", "unit", "internal", "broker", "difference"]);
    if (f === null || f.key !== FIGURE_KEYS[index]) return null;
    const label = typeof f.label === "string" && f.label.length >= 1 && f.label.length <= 64 && !unsafeText(f.label) ? f.label : null;
    const unit = f.unit === null ? null : typeof f.unit === "string" && UNIT.test(f.unit) ? f.unit : undefined;
    const internal = factSignedDecimal(f.internal);
    const broker = factSignedDecimal(f.broker);
    const difference = factSignedDecimal(f.difference);
    if (label === null || unit === undefined || internal === null || broker === null || difference === null) return null;
    figures.push({ key: FIGURE_KEYS[index]!, label, unit, internal, broker, difference });
  }
  return figures;
}

export interface SeriesPoint {
  t: string;
  value: string;
}

export interface StageSeries {
  resolution: string | null;
  points: readonly SeriesPoint[];
  methodologyRef: string | null;
  unit: string | null;
}

/** The deployment-level members of a Canary / Live `series` (the envelope is read elsewhere). `null` = a member is malformed. */
export function readSeriesMembers(o: Json): StageSeries | null {
  const resolution = o.resolution === null || o.resolution === undefined ? null : typeof o.resolution === "string" && RESOLUTION.test(o.resolution) ? o.resolution : undefined;
  if (resolution === undefined || !Array.isArray(o.points) || o.points.length > 2000) return null;
  const points: SeriesPoint[] = [];
  for (const entry of o.points) {
    const p = exact(entry, ["t", "value"]);
    const t = timestamp(p?.t);
    const value = signedDecimal(p?.value);
    if (p === null || t === null || value === null) return null;
    points.push({ t, value });
  }
  const methodologyRef = o.methodology_ref === undefined || o.methodology_ref === null ? null : typeof o.methodology_ref === "string" && METHODOLOGY.test(o.methodology_ref) ? o.methodology_ref : undefined;
  const unit = o.unit === undefined || o.unit === null ? null : typeof o.unit === "string" && UNIT.test(o.unit) ? o.unit : undefined;
  if (methodologyRef === undefined || unit === undefined) return null;
  return { resolution, points, methodologyRef, unit };
}

export interface GapRange {
  from: string;
  to: string;
}

/** `projection_continuity.gap_ranges` (Live): a Fact of at most 20 wall-clock windows. */
export function readGapRanges(raw: unknown): Fact<readonly GapRange[]> | null {
  return readFact<readonly GapRange[]>(raw, (value) => {
    if (!Array.isArray(value) || value.length > 20) return NO;
    const out: GapRange[] = [];
    for (const entry of value) {
      const g = exact(entry, ["from", "to"]);
      const from = timestamp(g?.from);
      const to = timestamp(g?.to);
      if (g === null || from === null || to === null) return NO;
      out.push({ from, to });
    }
    return out;
  });
}

/* ── Sandbox: finding opened_at is read in certification.ts; plan author and envelope (FE-072) ── */

export interface PlanEnvelopeRef {
  envelopeId: string;
  revision: number;
  status: "DRAFT";
}

/** `promotion_plans[].author.user_id`. */
export function readPlanAuthor(raw: unknown): string | null {
  const o = exact(raw, ["user_id"]);
  return o === null ? null : identifier(o.user_id);
}

/** `promotion_plans[].envelope`: AVAILABLE with a `null` value means the lookup ran and none exists. */
export function readPlanEnvelope(raw: unknown): Fact<PlanEnvelopeRef | null> | null {
  return readFact<PlanEnvelopeRef | null>(raw, (value) => {
    if (value === null) return null;
    const e = exact(value, ["envelope_id", "revision", "status"]);
    const id = identifier(e?.envelope_id);
    const revision = typeof e?.revision === "number" && Number.isSafeInteger(e.revision) && e.revision >= 1 ? e.revision : null;
    if (e === null || id === null || revision === null || e.status !== "DRAFT") return NO;
    return { envelopeId: id, revision, status: "DRAFT" };
  });
}

/* ── identity (FE-066, S3-U5) ────────────────────────────────────────────── */

const ALPHA_REASONS = [
  "ALPHA_MEMBERSHIP_NOT_QUALIFIED",
  "ALPHA_MEMBERSHIP_NOT_PUBLISHED",
  "ALPHA_MEMBERSHIP_AMBIGUOUS",
  "ALPHA_IDENTITY_NOT_AUTHORIZED",
  "ALPHA_NAME_NOT_PUBLISHED",
  "DEPLOYMENT_IDENTITY_NOT_READ",
] as const;
const PORTFOLIO_REASONS = [
  "PORTFOLIO_NOT_ASSIGNED",
  "PORTFOLIO_NAME_NOT_PUBLISHED",
  "PORTFOLIO_NAME_AMBIGUOUS",
  "PORTFOLIO_NAME_NOT_AUTHORIZED",
  "DEPLOYMENT_IDENTITY_NOT_READ",
] as const;
const IDENTITY_KEYS = ["alpha_id", "alpha_name", "portfolio_name", "alpha_reason_code", "portfolio_name_reason_code"] as const;

/** A display name: 1..256 characters, no control or bidi-format characters, no leading or trailing whitespace. */
function displayName(raw: unknown): string | null | undefined {
  if (raw === null) return null;
  if (typeof raw !== "string" || raw.length < 1 || raw.length > 256 || raw !== raw.trim() || unsafeText(raw)) return undefined;
  return raw;
}

export interface DeploymentIdentity {
  /** Published ONLY from the qualified deployment-to-alpha tuple; never a strategy id. */
  alphaId: string | null;
  alphaName: string | null;
  portfolioName: string | null;
  /** Why `alphaId` or `alphaName` is null (`null` when the name is published). */
  alphaReasonCode: string | null;
  /** Why `portfolioName` is null. */
  portfolioNameReasonCode: string | null;
}

/**
 * The five identity keys of a deployment block. They travel together (`dependentRequired`): none present is
 * `null` (an older body, or a SCOPED_V2 body that carries no identity: typed absence); some present but not all,
 * or any of them malformed or breaking the name/reason rule, is also `null`.
 */
export function readDeploymentIdentity(deployment: unknown): DeploymentIdentity | null {
  const d = obj(deployment);
  if (d === null) return null;
  const present = IDENTITY_KEYS.filter((key) => Object.hasOwn(d, key));
  if (present.length !== IDENTITY_KEYS.length) return null;
  const alphaId = d.alpha_id === null ? null : identifier(d.alpha_id);
  const alphaName = displayName(d.alpha_name);
  const portfolioName = displayName(d.portfolio_name);
  const alphaReason = d.alpha_reason_code === null ? null : inEnum(ALPHA_REASONS)(d.alpha_reason_code);
  const portfolioReason = d.portfolio_name_reason_code === null ? null : inEnum(PORTFOLIO_REASONS)(d.portfolio_name_reason_code);
  if ((d.alpha_id !== null && alphaId === null) || alphaName === undefined || portfolioName === undefined || alphaReason === NO || portfolioReason === NO) return null;
  // The schema's DeploymentIdentityRules: a published alpha name implies the id and no reason; no name means a reason.
  if (alphaName !== null) {
    if (alphaId === null || alphaReason !== null) return null;
  } else if (alphaReason === null) return null;
  if (portfolioName !== null) {
    if (portfolioReason !== null) return null;
  } else if (portfolioReason === null) return null;
  return { alphaId, alphaName, portfolioName, alphaReasonCode: alphaReason, portfolioNameReasonCode: portfolioReason };
}

/* ── Paper: positions by side (S3-U4) and the VN market calendar (FE-070) ── */

export interface PositionsBySideRow {
  instrumentId: string;
  /** Exact quantities as strings; gross = long + short as the SERVER wrote it. */
  longQuantity: string;
  shortQuantity: string;
  grossQuantity: string;
  positionCount: number;
}

export interface PositionsBySide {
  state: "AVAILABLE" | "EMPTY" | "PARTIAL" | "UNAVAILABLE";
  reasonCode: string | null;
  rows: readonly PositionsBySideRow[];
  excluded: { flatRows: number; closedRows: number; unclassifiedRows: number; noInstrumentRows: number };
  /** Always the typed unavailable (E5): notional by side is never derived. */
  notionalReasonCode: string;
}

const SIDE_QUANTITY = /^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;
const SIDE_REASONS = ["POSITIONS_NOT_PUBLISHED", "SOURCE_POSITIONS_PARTIAL", "POSITION_ROWS_UNCLASSIFIED"] as const;

/** `data.positions_by_side`. */
export function readPositionsBySide(raw: unknown): PositionsBySide | null {
  const o = exact(raw, ["state", "reason_code", "basis", "rows", "excluded", "notional"]);
  if (o === null || o.basis !== "OPEN_POSITION_ROWS_QUANTITY_BY_SIDE_PER_INSTRUMENT") return null;
  const state = inEnum(["AVAILABLE", "EMPTY", "PARTIAL", "UNAVAILABLE"] as const)(o.state);
  const code = o.reason_code === null ? null : inEnum(SIDE_REASONS)(o.reason_code);
  if (state === NO || code === NO || !Array.isArray(o.rows) || o.rows.length > 200) return null;
  const excluded = exact(o.excluded, ["flat_rows", "closed_rows", "unclassified_rows", "no_instrument_rows"]);
  const notional = exact(o.notional, ["state", "reason_code"]);
  if (excluded === null || notional === null || notional.state !== "UNAVAILABLE" || notional.reason_code !== "E5_POSITION_CURRENCY_AND_MARK_LINEAGE_UNQUALIFIED") return null;
  const counts = [excluded.flat_rows, excluded.closed_rows, excluded.unclassified_rows, excluded.no_instrument_rows].map(nonNegativeInt);
  if (counts.some((c) => c === null)) return null;
  const rows: PositionsBySideRow[] = [];
  for (const entry of o.rows) {
    const r = exact(entry, ["instrument_id", "long_quantity", "short_quantity", "gross_quantity", "position_count"]);
    if (r === null) return null;
    const instrumentId = typeof r.instrument_id === "string" && /^[A-Za-z0-9][A-Za-z0-9._:@+/-]{0,190}$/.test(r.instrument_id) ? r.instrument_id : null;
    const quantities = [r.long_quantity, r.short_quantity, r.gross_quantity].map((q) => (typeof q === "string" && q.length <= 80 && SIDE_QUANTITY.test(q) ? q : null));
    const count = typeof r.position_count === "number" && Number.isSafeInteger(r.position_count) && r.position_count >= 1 ? r.position_count : null;
    if (instrumentId === null || quantities.some((q) => q === null) || count === null) return null;
    rows.push({ instrumentId, longQuantity: quantities[0]!, shortQuantity: quantities[1]!, grossQuantity: quantities[2]!, positionCount: count });
  }
  // The schema's allOf: UNAVAILABLE is empty with its reason; AVAILABLE/EMPTY carry no reason; EMPTY has no rows; AVAILABLE has some; PARTIAL names why.
  if (state === "UNAVAILABLE" && (rows.length !== 0 || code !== "POSITIONS_NOT_PUBLISHED")) return null;
  if ((state === "AVAILABLE" || state === "EMPTY") && code !== null) return null;
  if (state === "EMPTY" && rows.length !== 0) return null;
  if (state === "AVAILABLE" && rows.length < 1) return null;
  if (state === "PARTIAL" && code === null) return null;
  return {
    state,
    reasonCode: code,
    rows,
    excluded: { flatRows: counts[0]!, closedRows: counts[1]!, unclassifiedRows: counts[2]!, noInstrumentRows: counts[3]! },
    notionalReasonCode: "E5_POSITION_CURRENCY_AND_MARK_LINEAGE_UNQUALIFIED",
  };
}

export const VENUE_WINDOW_KINDS = ["TRADING_SESSION", "OPENING_AUCTION", "CLOSING_AUCTION"] as const;
export interface VenueWindow {
  name: string;
  kind: (typeof VENUE_WINDOW_KINDS)[number];
  /** Venue-local clock, `HH:MM`. */
  open: string;
  close: string;
}
export interface VenueBreak {
  from: string;
  to: string;
}
export interface VenueHoliday {
  date: string;
  name: string | null;
}

export interface VenueCalendar {
  timezone: Fact<string>;
  windows: Fact<readonly VenueWindow[]>;
  breaks: Fact<readonly VenueBreak[]>;
  holidays: Fact<readonly VenueHoliday[]>;
  /** The SOURCE's own statement at `asOf`; a client never infers it from window arithmetic. */
  isOpen: Fact<boolean>;
  asOf: Fact<string>;
}

const clock = (raw: unknown): string | null => (typeof raw === "string" && CLOCK.test(raw) ? raw : null);

/** `data.venue_calendar` (the VN market workbench variant only). */
export function readVenueCalendar(raw: unknown): VenueCalendar | null {
  const o = exact(raw, ["schema_version", "market", "basis", "timezone", "windows", "breaks", "holidays", "is_open", "as_of"]);
  if (o === null || o.schema_version !== "execution.venue-calendar.v1" || o.market !== "VN_EQUITY" || o.basis !== "SOURCE_SESSION_CALENDAR_NOT_A_CLIENT_INFERENCE") return null;
  const timezone = readFact<string>(o.timezone, (v) => (typeof v === "string" && TIMEZONE.test(v) ? v : NO));
  const windows = readFact<readonly VenueWindow[]>(o.windows, (v) => {
    if (!Array.isArray(v) || v.length < 1 || v.length > 12) return NO;
    const out: VenueWindow[] = [];
    for (const entry of v) {
      const w = exact(entry, ["name", "kind", "open", "close"]);
      const kind = inEnum(VENUE_WINDOW_KINDS)(w?.kind);
      const open = clock(w?.open);
      const close = clock(w?.close);
      if (w === null || typeof w.name !== "string" || w.name.length < 1 || w.name.length > 64 || unsafeText(w.name) || kind === NO || open === null || close === null) return NO;
      out.push({ name: w.name, kind, open, close });
    }
    return out;
  });
  const breaks = readFact<readonly VenueBreak[]>(o.breaks, (v) => {
    if (!Array.isArray(v) || v.length > 12) return NO;
    const out: VenueBreak[] = [];
    for (const entry of v) {
      const b = exact(entry, ["name", "from", "to", "basis"]);
      const from = clock(b?.from);
      const to = clock(b?.to);
      if (b === null || b.name !== "BREAK" || b.basis !== "GAP_BETWEEN_PUBLISHED_WINDOWS" || from === null || to === null) return NO;
      out.push({ from, to });
    }
    return out;
  });
  const holidays = readFact<readonly VenueHoliday[]>(o.holidays, (v) => {
    if (!Array.isArray(v) || v.length > 400) return NO;
    const out: VenueHoliday[] = [];
    for (const entry of v) {
      const h = exact(entry, ["date", "name"]);
      const name = h === null ? undefined : h.name === null ? null : typeof h.name === "string" && h.name.length >= 1 && h.name.length <= 128 && !unsafeText(h.name) ? h.name : undefined;
      if (h === null || typeof h.date !== "string" || !DATE.test(h.date) || name === undefined) return NO;
      out.push({ date: h.date, name });
    }
    return out;
  });
  const isOpen = factBoolean(o.is_open);
  const asOf = factTimestamp(o.as_of);
  if (timezone === null || windows === null || breaks === null || holidays === null || isOpen === null || asOf === null) return null;
  return { timezone, windows, breaks, holidays, isOpen, asOf };
}
