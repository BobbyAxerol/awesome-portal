/**
 * V2 command-status readers for the currency-bearing SERVED statuses
 * (Codex e19ad906, finding F8-08 / pending-control review R-2):
 *
 * - `portal.execution.command-status.v1` (`CommandStatus`, capital commands:
 *   `executionCapitalCommandStatusV1`, collection items, reconcile, and the
 *   `WorkflowCapital.status` copy in `execution-workflows`);
 * - `portal.execution.pending-recall-status.v1` (`PendingControlStatus`,
 *   `executionPendingControlStatusV1`, submit and reconcile).
 *
 * What changed on the wire: both served statuses now carry a REQUIRED
 * top-level `currency`, copied from the original immutable intent after the
 * server re-validated it. It is ONE unit for the whole status. It is not on
 * each amount, it is not a quote, a receipt guess or an implicit USD. A body
 * without it (the stored form, or a pre-upgrade HTTP body) is incomplete under
 * the served schema: this reader refuses it, it never supplies a unit.
 *
 * What this reader guarantees a screen:
 * - an amount cannot be read without its currency: every amount is a
 *   `MoneyAmount` (`{currency, decimal, text}`), built from the exact string
 *   (BoundaryDecimal) and the status's currency. There is no code path from a
 *   status amount to a bare number;
 * - int64 counters (`business.revision`, receipt `versions.*`) stay exact
 *   strings; comparisons are the caller's, with BigInt, never `Number()`;
 * - `null` is a typed absence (no receipt yet, no amounts yet), never `0`;
 * - the pending-control invariants the schema cannot express and the server
 *   enforces (requested = applied + pending + cancelled + rejected, the
 *   state x partition table, `updated >= created`) are checked with BigInt, and
 *   a violation voids the read rather than being "repaired";
 * - the capital `CommandStatus` has NO such cross-field rule in its contract
 *   (no partition, no chronology, no state x amounts), so none is invented
 *   here: its amounts are displayed as published and never summed or compared;
 * - text is held to the PM grammar (no ASCII control, no leading/trailing
 *   Python whitespace, at most 512 UTF-8 bytes, well-formed UTF-16), and,
 *   stricter than the schema (which allows them), to no C1 control, no
 *   whitespace-only text and no zero-width or bidi-control character
 *   (U+200B-200F, U+202A-202E, U+2060-2064, U+2066-2069, U+061C, U+180E,
 *   U+FEFF), the same set `accessEffective.ts` refuses in ids: a status whose
 *   id, blocker or currency can reverse or hide the text around it is refused
 *   whole, never sanitised (review L-1);
 * - a readable body of another `schema_version` is `unsupported_shape`; never
 *   throws.
 */
import { readDecimal, type BoundaryDecimal } from "../boundary";
import { readUtcEpochMs, type UtcEpochMs } from "../../screenDataContract";

export const COMMAND_STATUS_SCHEMA = "portal.execution.command-status.v1";
export const PENDING_CONTROL_STATUS_SCHEMA = "portal.execution.pending-recall-status.v1";

export const COMMAND_OPERATIONS = [
  "FUND", "INITIAL_GRANT", "TOP_UP", "IMMEDIATE_DECREASE", "RECALL_PARTIAL", "RECALL_FULL", "ADJUST_TARGET_BUDGET", "SET_ROOT_LIMIT",
] as const;
export type CommandOperation = (typeof COMMAND_OPERATIONS)[number];
export const COMMAND_RESOURCE_KINDS = ["ROOT", "PORTFOLIO", "DEPLOYMENT"] as const;
export type CommandResourceKind = (typeof COMMAND_RESOURCE_KINDS)[number];
export const COMMAND_ENVIRONMENTS = ["paper", "sandbox", "live"] as const;
export type CommandEnvironment = (typeof COMMAND_ENVIRONMENTS)[number];
export const COMMAND_DELIVERIES = ["PREPARED", "SENDING", "ACKNOWLEDGED", "DELIVERY_UNKNOWN", "FAILED_BEFORE_SEND"] as const;
export type CommandDelivery = (typeof COMMAND_DELIVERIES)[number];
export const COMMAND_BUSINESS_STATES = [
  "UNKNOWN", "APPLIED", "PARTIALLY_APPLIED", "WAITING_ENCUMBRANCE", "CANCELLED", "PARTIALLY_APPLIED_CANCELLED", "REJECTED",
] as const;
export type CommandBusinessState = (typeof COMMAND_BUSINESS_STATES)[number];
export const COMMAND_PROJECTIONS = ["UNKNOWN", "CURRENT", "CATCHING_UP", "STALE", "UNAVAILABLE"] as const;
export type CommandProjection = (typeof COMMAND_PROJECTIONS)[number];
export const COMMAND_VENUES = ["NOT_APPLICABLE", "UNKNOWN", "PENDING", "ACKNOWLEDGED", "FILLED", "REJECTED"] as const;
export type CommandVenue = (typeof COMMAND_VENUES)[number];
export const COMMAND_NEXT_ACTIONS = ["REVIEW_PREVIEW", "QUERY_SAME_INTENT", "REVIEW_RECEIPT", "REVIEW_BLOCKER"] as const;
export type CommandNextAction = (typeof COMMAND_NEXT_ACTIONS)[number];
export const STATUS_AUTHORITIES = ["OWNER_VERIFIED", "TEST_ONLY"] as const;
export type StatusAuthority = (typeof STATUS_AUTHORITIES)[number];

export const PENDING_OPERATIONS = ["APPLY_PENDING", "CANCEL_REMAINING"] as const;
export type PendingOperation = (typeof PENDING_OPERATIONS)[number];
export const PENDING_RESOURCE_KINDS = ["PORTFOLIO", "DEPLOYMENT"] as const;
export const PENDING_BUSINESS_STATES = ["UNKNOWN", "WAITING_ENCUMBRANCE", "PARTIALLY_APPLIED_CANCELLED", "CANCELLED", "REJECTED", "APPLIED"] as const;
export type PendingBusinessState = (typeof PENDING_BUSINESS_STATES)[number];
export const PENDING_NEXT_ACTIONS = ["QUERY_SAME_INTENT", "REVIEW_RECEIPT", "REVIEW_BLOCKER"] as const;
export type PendingNextAction = (typeof PENDING_NEXT_ACTIONS)[number];
export const PENDING_SOURCE_OPERATIONS = ["IMMEDIATE_DECREASE", "RECALL_PARTIAL", "RECALL_FULL", "APPLY_PENDING", "CANCEL_REMAINING"] as const;
export type PendingSourceOperation = (typeof PENDING_SOURCE_OPERATIONS)[number];
export const AMOUNT_KEYS = ["requested", "applied", "pending", "cancelled", "rejected"] as const;
export type AmountKey = (typeof AMOUNT_KEYS)[number];
export const PENDING_VERSION_KEYS = ["budget", "source", "parent", "book", "command"] as const;
export type PendingVersionKey = (typeof PENDING_VERSION_KEYS)[number];

/** An amount that always travels with its unit. The only shape a status amount is read into. */
export interface MoneyAmount {
  /** The status's `currency`, verbatim. Opaque PM text; render it escaped, never interpret it. */
  currency: string;
  /** The exact string behind a grouped display (`full` is the server's original). */
  decimal: BoundaryDecimal;
  /** `1,000 USDT`: the grouped display and the currency, ready to print. */
  text: string;
  /** `1000 USDT`: the server's exact original and the currency, for title/copy. */
  fullText: string;
}

export type StatusAmounts = Readonly<Record<AmountKey, MoneyAmount>>;

export interface CommandStatusV1 {
  /** `ecm_` + 32 hex, server-generated. */
  commandId: string;
  operation: CommandOperation;
  resource: { kind: CommandResourceKind; id: string };
  environment: CommandEnvironment;
  profileRef: string;
  delivery: CommandDelivery;
  business: {
    state: CommandBusinessState;
    receiptRef: string | null;
    sourceEventRef: string | null;
    /** int64 as the exact string (`null` is "no revision yet"). Compare with BigInt. */
    revision: string | null;
    /** `null` is "the source has published no amounts yet", not zero. */
    amounts: StatusAmounts | null;
  };
  projection: CommandProjection;
  venue: CommandVenue;
  nextAction: CommandNextAction;
  createdAt: UtcEpochMs;
  updatedAt: UtcEpochMs;
  /** `TEST_ONLY` is a synthetic status; a screen must say so. */
  authority: StatusAuthority;
  /** The unit of every amount in this status. */
  currency: string;
}

export type PendingLatestOperation =
  | { availability: "AVAILABLE"; operation: PendingSourceOperation }
  /** The linked owning recall's operation is not published; never infer it from the queried operation. */
  | { availability: "NOT_PUBLISHED"; reason: "SOURCE_OPERATION_NOT_PUBLISHED" };

export interface PendingControlReceipt {
  /** The original control receipt; immutable. */
  controlReceiptId: string;
  /** The latest owning-recall receipt; it can differ from the control receipt. */
  latestReceiptId: string;
  latestOperation: PendingLatestOperation;
  sourceEventId: string;
  /** Lowercase hex SHA-256 of the original payload. */
  originalPayloadSha256: string;
  /** Five int64 counters as exact strings. Compare with BigInt, never Number. */
  versions: Readonly<Record<PendingVersionKey, string>>;
}

export interface PendingControlStatusV1 {
  commandId: string;
  operation: PendingOperation;
  /** The PM-side id of the recall this controls (`original_recall_id`); not the Portal `commandId`. */
  originalRecallId: string;
  resource: { kind: "PORTFOLIO" | "DEPLOYMENT"; id: string };
  environment: CommandEnvironment;
  profileRef: string;
  delivery: CommandDelivery;
  business: {
    state: PendingBusinessState;
    /** `true` only for APPLIED. `false` is NOT "nothing happened": WAITING can have applied > 0. `null` while UNKNOWN. */
    businessApplied: boolean | null;
    amounts: StatusAmounts | null;
    receipt: PendingControlReceipt | null;
    /** Opaque source texts; may repeat. */
    blockers: readonly string[];
  };
  /** Both constants on the wire, even when APPLIED: this is a budget control, not a transfer. */
  economicCashChanged: false;
  physicalTransferPerformed: false;
  projection: "UNKNOWN";
  venue: "NOT_APPLICABLE";
  nextAction: PendingNextAction;
  authority: StatusAuthority;
  createdAt: UtcEpochMs;
  updatedAt: UtcEpochMs;
  currency: string;
}

/** What a reader hands back for a readable body that is not this schema. */
export interface UnsupportedStatusShape {
  kind: "unsupported_shape";
  schemaVersion: string | null;
}

export type CommandStatusRead = { kind: "command_status"; status: CommandStatusV1 } | UnsupportedStatusShape;
export type PendingControlStatusRead = { kind: "pending_control_status"; status: PendingControlStatusV1 } | UnsupportedStatusShape;

/* ───────────────────────── low-level checks ───────────────────────── */

type Rec = Record<string, unknown>;

function rec(value: unknown): Rec | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Rec : null;
}

/** Exactly these own keys (a planted `__proto__` is an own key and so is refused). */
function closed(value: unknown, keys: readonly string[]): Rec | null {
  const r = rec(value);
  if (r === null) return null;
  const own = Object.keys(r);
  return own.length === keys.length && keys.every((key) => Object.prototype.hasOwnProperty.call(r, key)) ? r : null;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? value as T : null;
}

/**
 * Characters text must not contain: C0/C1 controls and DEL (the schema forbids C0 and DEL), and, stricter than the schema, zero-width
 * and bidi-control format characters (overrides, isolates, marks, joiners, BOM): they can reverse or hide the text around them.
 */
const UNSAFE_TEXT = /[\u0000-\u001f\u007f-\u009f\u061c\u180e\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/;
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
/** Python `str.strip()` whitespace: the PM text rule at both ends. */
const PM_EDGE_SPACE = /^[\u0009-\u000d\u001c-\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]|[\u0009-\u000d\u001c-\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]$/;
const encoder = new TextEncoder();

function codePoints(text: string): number {
  let count = 0;
  for (const _ of text) count += 1;
  return count;
}

/** Text with no control or invisible format character, well-formed, not whitespace-only, at most `max` codepoints. */
function plain(value: unknown, max = 256): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > max * 2 || UNSAFE_TEXT.test(value) || LONE_SURROGATE.test(value) || value.trim().length === 0) return null;
  return codePoints(value) <= max ? value : null;
}

/** PM source text: `plain` plus no Python-whitespace edge and at most 512 UTF-8 bytes. */
function pm(value: unknown): string | null {
  const text = plain(value, 512);
  return text !== null && !PM_EDGE_SPACE.test(text) && encoder.encode(text).length <= 512 ? text : null;
}

/** The unit label is PM text; it is printed beside every amount, so it gets no softer rule than any other text. */
const currencyText = pm;

function nullable<T>(value: unknown, read: (v: unknown) => T | null): T | null | undefined {
  return value === null ? null : read(value) ?? undefined;
}

function instant(value: unknown): UtcEpochMs | null {
  const at = readUtcEpochMs(value);
  return at !== null && at >= 0 ? at : null;
}

const COMMAND_ID = /^ecm_[a-f0-9]{32}$/;
const INT64_MAX = 9223372036854775807n;
const COUNTER = /^(?:0|[1-9][0-9]{0,18})$/;
const UNSIGNED_DECIMAL = /^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;
const SHA256 = /^[a-f0-9]{64}$/;

/** A PM counter: decimal digits, at most int64. Kept as the exact string. */
function counter(value: unknown): string | null {
  return typeof value === "string" && COUNTER.test(value) && BigInt(value) <= INT64_MAX ? value : null;
}

function money(value: unknown, currency: string): MoneyAmount | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 128 || !UNSIGNED_DECIMAL.test(value)) return null;
  const decimal = readDecimal(value, { unit: "money" });
  return decimal === null ? null : { currency, decimal, text: `${decimal.display} ${currency}`, fullText: `${decimal.full} ${currency}` };
}

function readAmounts(raw: unknown, currency: string): StatusAmounts | null {
  const r = closed(raw, AMOUNT_KEYS);
  if (r === null) return null;
  const out = {} as Record<AmountKey, MoneyAmount>;
  for (const key of AMOUNT_KEYS) {
    const amount = money(r[key], currency);
    if (amount === null) return null;
    out[key] = amount;
  }
  return out;
}

/** Exact value as `coefficient x 10^-scale`, for comparison without floats. */
function scaled(exact: string): { coefficient: bigint; scale: number } {
  const [whole, fraction = ""] = exact.split(".");
  return { coefficient: BigInt(`${whole}${fraction}`), scale: fraction.length };
}

function sameScale(values: readonly string[]): bigint[] {
  const parts = values.map(scaled);
  const scale = Math.max(...parts.map((p) => p.scale));
  return parts.map((p) => p.coefficient * 10n ** BigInt(scale - p.scale));
}

/** requested = applied + pending + cancelled + rejected, exactly (the server proves it without floats). */
function partitionHolds(amounts: StatusAmounts): boolean {
  const [requested, applied, pending, cancelled, rejected] = sameScale(AMOUNT_KEYS.map((key) => amounts[key].decimal.full));
  return requested === applied! + pending! + cancelled! + rejected!;
}

/** The server's `assertStatePartition`: which outcomes a settled state may carry. */
function statePartitionHolds(state: PendingBusinessState, amounts: StatusAmounts): boolean {
  const zero = (key: AmountKey) => scaled(amounts[key].decimal.full).coefficient === 0n;
  switch (state) {
    case "UNKNOWN": return true;
    case "APPLIED": return zero("pending") && zero("cancelled") && zero("rejected");
    case "REJECTED": return zero("applied") && zero("pending") && zero("cancelled");
    case "CANCELLED": return zero("applied") && zero("pending") && zero("rejected");
    case "PARTIALLY_APPLIED_CANCELLED": return !zero("applied") && !zero("cancelled") && zero("pending") && zero("rejected");
    case "WAITING_ENCUMBRANCE": return !zero("pending") && zero("cancelled") && zero("rejected");
  }
}

/* ───────────────────────── capital CommandStatus ───────────────────────── */

const COMMAND_STATUS_KEYS = [
  "schema_version", "command_id", "operation", "resource", "environment", "profile_ref", "delivery", "business", "projection", "venue",
  "next_action", "created_at_ms", "updated_at_ms", "authority", "currency",
] as const;

/**
 * `CommandStatus` body -> typed read. `null` is "malformed" (including a body
 * with no `currency`, which is the stored form and not a served status); a
 * body of another `schema_version` is `unsupported_shape`.
 */
export function readCommandStatusV1(raw: unknown): CommandStatusRead | null {
  const root = rec(raw);
  if (root === null) return null;
  const version = typeof root.schema_version === "string" ? root.schema_version : null;
  if (version !== COMMAND_STATUS_SCHEMA) return { kind: "unsupported_shape", schemaVersion: version };
  const r = closed(root, COMMAND_STATUS_KEYS);
  const resource = closed(r?.resource, ["kind", "id"]);
  const business = closed(r?.business, ["state", "receipt_ref", "source_event_ref", "revision", "amounts"]);
  if (r === null || resource === null || business === null) return null;

  const currency = currencyText(r.currency);
  const commandId = typeof r.command_id === "string" && COMMAND_ID.test(r.command_id) ? r.command_id : null;
  const operation = oneOf(r.operation, COMMAND_OPERATIONS);
  const kind = oneOf(resource.kind, COMMAND_RESOURCE_KINDS);
  const resourceId = plain(resource.id);
  const environment = oneOf(r.environment, COMMAND_ENVIRONMENTS);
  const profileRef = plain(r.profile_ref);
  const delivery = oneOf(r.delivery, COMMAND_DELIVERIES);
  const projection = oneOf(r.projection, COMMAND_PROJECTIONS);
  const venue = oneOf(r.venue, COMMAND_VENUES);
  const nextAction = oneOf(r.next_action, COMMAND_NEXT_ACTIONS);
  const authority = oneOf(r.authority, STATUS_AUTHORITIES);
  const createdAt = instant(r.created_at_ms);
  const updatedAt = instant(r.updated_at_ms);
  const state = oneOf(business.state, COMMAND_BUSINESS_STATES);
  const receiptRef = nullable(business.receipt_ref, plain);
  const sourceEventRef = nullable(business.source_event_ref, plain);
  const revision = nullable(business.revision, counter);
  if (
    currency === null || commandId === null || operation === null || kind === null || resourceId === null || environment === null
    || profileRef === null || delivery === null || projection === null || venue === null || nextAction === null || authority === null
    || createdAt === null || updatedAt === null || state === null
    || receiptRef === undefined || sourceEventRef === undefined || revision === undefined
  ) return null;
  const amounts = business.amounts === null ? null : readAmounts(business.amounts, currency);
  if (business.amounts !== null && amounts === null) return null;

  return {
    kind: "command_status",
    status: {
      commandId, operation, resource: { kind, id: resourceId }, environment, profileRef, delivery,
      business: { state, receiptRef, sourceEventRef, revision, amounts },
      projection, venue, nextAction, createdAt, updatedAt, authority, currency,
    },
  };
}

/* ───────────────────────── pending-control status ───────────────────────── */

const PENDING_STATUS_KEYS = [
  "schema_version", "family", "command_id", "operation", "original_recall_id", "resource", "environment", "profile_ref", "delivery", "business",
  "economic_cash_changed", "physical_transfer_performed", "projection", "venue", "next_action", "authority", "created_at_ms", "updated_at_ms",
  "currency",
] as const;
const RECEIPT_KEYS = [
  "control_receipt_id", "latest_receipt_id", "latest_operation", "latest_operation_availability", "latest_operation_reason", "source_event_id",
  "original_payload_sha256", "versions",
] as const;
const MAX_BLOCKERS = 128;

function readReceipt(raw: unknown): PendingControlReceipt | null {
  const r = closed(raw, RECEIPT_KEYS);
  const versionsRaw = closed(r?.versions, PENDING_VERSION_KEYS);
  if (r === null || versionsRaw === null) return null;
  const controlReceiptId = pm(r.control_receipt_id);
  const latestReceiptId = pm(r.latest_receipt_id);
  const sourceEventId = pm(r.source_event_id);
  if (controlReceiptId === null || latestReceiptId === null || sourceEventId === null || typeof r.original_payload_sha256 !== "string" || !SHA256.test(r.original_payload_sha256)) return null;
  let latestOperation: PendingLatestOperation;
  if (r.latest_operation_availability === "AVAILABLE") {
    const operation = oneOf(r.latest_operation, PENDING_SOURCE_OPERATIONS);
    if (operation === null || r.latest_operation_reason !== null) return null;
    latestOperation = { availability: "AVAILABLE", operation };
  } else if (r.latest_operation_availability === "NOT_PUBLISHED") {
    if (r.latest_operation !== null || r.latest_operation_reason !== "SOURCE_OPERATION_NOT_PUBLISHED") return null;
    latestOperation = { availability: "NOT_PUBLISHED", reason: "SOURCE_OPERATION_NOT_PUBLISHED" };
  } else return null;
  const versions = {} as Record<PendingVersionKey, string>;
  for (const key of PENDING_VERSION_KEYS) {
    const value = counter(versionsRaw[key]);
    if (value === null) return null;
    versions[key] = value;
  }
  return { controlReceiptId, latestReceiptId, latestOperation, sourceEventId, originalPayloadSha256: r.original_payload_sha256, versions };
}

/**
 * `PendingControlStatus` body -> typed read. `null` is "malformed" (a missing
 * `currency`, an amount that does not add up, a state that contradicts its
 * amounts, a receipt where there should be none); a body of another
 * `schema_version` is `unsupported_shape`.
 */
export function readPendingControlStatusV1(raw: unknown): PendingControlStatusRead | null {
  const root = rec(raw);
  if (root === null) return null;
  const version = typeof root.schema_version === "string" ? root.schema_version : null;
  if (version !== PENDING_CONTROL_STATUS_SCHEMA) return { kind: "unsupported_shape", schemaVersion: version };
  const r = closed(root, PENDING_STATUS_KEYS);
  const resource = closed(r?.resource, ["kind", "id"]);
  const business = closed(r?.business, ["state", "business_applied", "amounts", "receipt", "blockers"]);
  if (r === null || resource === null || business === null) return null;

  const currency = currencyText(r.currency);
  const commandId = typeof r.command_id === "string" && COMMAND_ID.test(r.command_id) ? r.command_id : null;
  const operation = oneOf(r.operation, PENDING_OPERATIONS);
  const originalRecallId = pm(r.original_recall_id);
  const kind = oneOf(resource.kind, PENDING_RESOURCE_KINDS);
  const resourceId = plain(resource.id);
  const environment = oneOf(r.environment, COMMAND_ENVIRONMENTS);
  const profileRef = plain(r.profile_ref);
  const delivery = oneOf(r.delivery, COMMAND_DELIVERIES);
  const nextAction = oneOf(r.next_action, PENDING_NEXT_ACTIONS);
  const authority = oneOf(r.authority, STATUS_AUTHORITIES);
  const createdAt = instant(r.created_at_ms);
  const updatedAt = instant(r.updated_at_ms);
  const state = oneOf(business.state, PENDING_BUSINESS_STATES);
  if (
    r.family !== "PENDING_RECALL_CONTROL" || r.economic_cash_changed !== false || r.physical_transfer_performed !== false
    || r.projection !== "UNKNOWN" || r.venue !== "NOT_APPLICABLE"
    || currency === null || commandId === null || operation === null || originalRecallId === null || kind === null || resourceId === null
    || environment === null || profileRef === null || delivery === null || nextAction === null || authority === null
    || createdAt === null || updatedAt === null || state === null
    || !Array.isArray(business.blockers) || business.blockers.length > MAX_BLOCKERS
  ) return null;
  // Runtime chronology (not in the schema).
  if (updatedAt < createdAt) return null;

  const blockers: string[] = [];
  for (const entry of business.blockers) {
    const text = pm(entry);
    if (text === null) return null;
    blockers.push(text);
  }

  if (state === "UNKNOWN") {
    // Nothing is known: no applied flag, no amounts, no receipt, no blockers, and a delivery that is not an acknowledgement.
    if (
      business.business_applied !== null || business.amounts !== null || business.receipt !== null || blockers.length !== 0
      || delivery === "ACKNOWLEDGED" || nextAction !== (delivery === "FAILED_BEFORE_SEND" ? "REVIEW_BLOCKER" : "QUERY_SAME_INTENT")
    ) return null;
    return {
      kind: "pending_control_status",
      status: {
        commandId, operation, originalRecallId, resource: { kind, id: resourceId }, environment, profileRef, delivery,
        business: { state, businessApplied: null, amounts: null, receipt: null, blockers },
        economicCashChanged: false, physicalTransferPerformed: false, projection: "UNKNOWN", venue: "NOT_APPLICABLE",
        nextAction, authority, createdAt, updatedAt, currency,
      },
    };
  }

  // A settled or waiting state is acknowledged, carries amounts and a receipt, and says what to do next.
  const amounts = readAmounts(business.amounts, currency);
  const receipt = readReceipt(business.receipt);
  if (
    amounts === null || receipt === null || delivery !== "ACKNOWLEDGED" || business.business_applied !== (state === "APPLIED")
    || nextAction !== (state === "WAITING_ENCUMBRANCE" ? "QUERY_SAME_INTENT" : "REVIEW_RECEIPT")
    || !partitionHolds(amounts) || !statePartitionHolds(state, amounts)
  ) return null;
  return {
    kind: "pending_control_status",
    status: {
      commandId, operation, originalRecallId, resource: { kind, id: resourceId }, environment, profileRef, delivery,
      business: { state, businessApplied: state === "APPLIED", amounts, receipt, blockers },
      economicCashChanged: false, physicalTransferPerformed: false, projection: "UNKNOWN", venue: "NOT_APPLICABLE",
      nextAction, authority, createdAt, updatedAt, currency,
    },
  };
}
