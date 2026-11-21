import { z } from "zod";
import { assertAmountPartition, pmCounter, pmText, unsignedDecimal } from "./foundation.contract";
import { pmHttpRequestDigest, type PmHttpRequestBounds, type PmHttpRequestBytes } from "./pm-http-request-binding";

/** PM39aaa9c6, operator_adapters ab57b9d5 / recall_repository 8c62e730: candidate
 * bytes and descriptive source summaries only. No sender, grant or Outcome. */
export type PmaPendingControlOperation = "APPLY_PENDING" | "CANCEL_REMAINING";
export interface PmaPendingControlWire {
  schema_version: "pma.operator-control.v1"; operation: PmaPendingControlOperation;
  idempotency_key: string; recipient_kind: "PORTFOLIO" | "DEPLOYMENT_ACCOUNT";
  currency: string; reason: string; command_id: string;
  expected_versions: { budget: string; source: string; parent: string; book: string; command: string };
  recipient_account_id?: string; recipient_deployment_id?: string;
}
type Refusal = "PM_PENDING_WIRE_INVALID" | "PM_PENDING_TARGET_MISMATCH" | "PM_PENDING_RESULT_INVALID";
export class PmPendingControlCandidateError extends Error {
  constructor(readonly code: Refusal) { super(code); this.name = "PmPendingControlCandidateError"; }
}
function fail(code: Refusal): never { throw new PmPendingControlCandidateError(code); }
function wellFormed(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) { const next = value.charCodeAt(++index);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false; }
    else if (code >= 0xdc00 && code <= 0xdfff) return false;
  }
  return true;
}
const text = pmText.refine(wellFormed), decimal = unsignedDecimal.refine(value => /^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?![\s\S])/u.test(value));
const counter = pmCounter.refine(value => /^(?:0|[1-9][0-9]{0,18})(?![\s\S])/u.test(value));
const operation = z.enum(["APPLY_PENDING", "CANCEL_REMAINING"]);
const recipientKind = z.enum(["PORTFOLIO", "DEPLOYMENT_ACCOUNT"]); // owning writer: ROOT_RECALL_UNSUPPORTED
const versions = z.object({ budget: counter, source: counter, parent: counter, book: counter, command: counter }).strict();
function record(input: unknown, allowed: readonly string[], code: Refusal): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(input))) return fail(code);
  const keys = Reflect.ownKeys(input), entries: Array<[string, unknown]> = [];
  if (keys.length > allowed.length) return fail(code);
  for (const key of keys) {
    if (typeof key !== "string" || !allowed.includes(key)) return fail(code);
    const descriptor = Object.getOwnPropertyDescriptor(input, key)!;
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) return fail(code);
    entries.push([key, descriptor.value]);
  }
  return Object.fromEntries(entries);
}
const recipientKeys = ["recipient_kind", "currency", "recipient_account_id", "recipient_deployment_id"] as const;
function recipient(input: unknown) {
  const value = record(input, recipientKeys, "PM_PENDING_TARGET_MISMATCH"), kind = recipientKind.parse(value.recipient_kind);
  const shape: z.ZodRawShape = { recipient_kind: z.literal(kind), currency: text };
  if (kind === "DEPLOYMENT_ACCOUNT") Object.assign(shape, { recipient_account_id: text, recipient_deployment_id: text });
  return z.object(shape).strict().parse(value) as Pick<PmaPendingControlWire, typeof recipientKeys[number]>;
}
const wireKeys = ["schema_version", "operation", "idempotency_key", "recipient_kind", "currency", "reason", "command_id",
  "expected_versions", "recipient_account_id", "recipient_deployment_id"] as const;
export function parsePmaPendingControlWire(input: unknown): PmaPendingControlWire {
  try {
    const value = record(input, wireKeys, "PM_PENDING_WIRE_INVALID");
    value.expected_versions = record(value.expected_versions, Object.keys(versions.shape), "PM_PENDING_WIRE_INVALID");
    const kind = recipientKind.parse(value.recipient_kind);
    const shape: z.ZodRawShape = { schema_version: z.literal("pma.operator-control.v1"), operation,
      idempotency_key: text, recipient_kind: z.literal(kind), currency: text, reason: text, command_id: text, expected_versions: versions };
    if (kind === "DEPLOYMENT_ACCOUNT") Object.assign(shape, { recipient_account_id: text, recipient_deployment_id: text });
    return z.object(shape).strict().parse(value) as unknown as PmaPendingControlWire;
  } catch { return fail("PM_PENDING_WIRE_INVALID"); }
}
export const serializePmaPendingControlWire = (input: unknown): string => JSON.stringify(parsePmaPendingControlWire(input));
export interface PmaPendingControlContext {
  /** Server resolver data only; validating it does not authenticate current
   * authority, the original command or a held-through-COMMIT source lease. */
  target_ref: string; original_command_id: string;
  recipient: Pick<PmaPendingControlWire, typeof recipientKeys[number]>;
}
function targetContext(input: unknown, wire: PmaPendingControlWire, withStage: boolean) {
  try {
    const value = record(input, ["target_ref", "original_command_id", "recipient", ...(withStage ? ["stage"] : [])], "PM_PENDING_TARGET_MISMATCH");
    const target = text.parse(value.target_ref), original = text.parse(value.original_command_id), actual = recipient(value.recipient);
    if (target === "." || target === ".." || /[\\/?#]/u.test(target) || original !== wire.command_id)
      return fail("PM_PENDING_TARGET_MISMATCH");
    for (const key of recipientKeys) if (wire[key] !== actual[key]) return fail("PM_PENDING_TARGET_MISMATCH");
    return { path: `/internal/pma11-candidate/capital/${encodeURIComponent(target)}`,
      stage: withStage ? z.enum(["PREVIEW", "APPLY"]).parse(value.stage) : null };
  } catch { return fail("PM_PENDING_TARGET_MISMATCH"); }
}
export function encodePmaPendingControlRequest(input: unknown, context: PmaPendingControlContext & { stage: "PREVIEW" | "APPLY" },
  bounds: PmHttpRequestBounds) {
  const wire = parsePmaPendingControlWire(input), resolved = targetContext(context, wire, true);
  const request: PmHttpRequestBytes = { method: "POST", raw_path: Buffer.from(`${resolved.path}/${resolved.stage!.toLowerCase()}`),
    query_string: Buffer.alloc(0), body: Buffer.from(serializePmaPendingControlWire(wire)) };
  return { wire, request, request_digest: pmHttpRequestDigest(request, bounds), required_source_capability: "BUDGET" as const };
}
export function encodePmaPendingControlStatusRequest(input: unknown, context: PmaPendingControlContext, bounds: PmHttpRequestBounds) {
  const wire = parsePmaPendingControlWire(input), resolved = targetContext(context, wire, false);
  const request: PmHttpRequestBytes = { method: "GET", raw_path: Buffer.from(`${resolved.path}/status`), body: Buffer.alloc(0),
    query_string: Buffer.from(`operation=${encodeURIComponent(wire.operation)}&key=${encodeURIComponent(wire.idempotency_key)}`) };
  return { wire, request, request_digest: pmHttpRequestDigest(request, bounds), required_source_capability: "REPORT" as const };
}

// Exact states emitted by current owning recall writer, plus rollback preview
// and missing status. Do not import the broader generic capital Outcome union.
const owningState = z.enum(["WAITING_ENCUMBRANCE", "PARTIALLY_APPLIED_CANCELLED", "CANCELLED", "REJECTED", "APPLIED"]);
const summarySchema = z.object({
  state: z.enum(["PREVIEW_ONLY", "UNKNOWN", ...owningState.options]), business_applied: z.boolean().nullable(),
  next_action: z.enum(["REVIEW_PREVIEW", "QUERY_SAME_INTENT", "REVIEW_RECEIPT"]), cli_exit_code: z.enum(["0", "2", "3"]),
  predicted_state: owningState.optional(), reserved: z.literal(false).optional(), physical_transfer_performed: z.literal(false).optional(),
  operation: z.enum(["IMMEDIATE_DECREASE", "RECALL_PARTIAL", "RECALL_FULL", "APPLY_PENDING", "CANCEL_REMAINING"]).optional(),
  command_id: text.optional(), command_version: counter.optional(), target: text.optional(),
  requested: decimal.optional(), applied: decimal.optional(), pending: decimal.optional(), cancelled: decimal.optional(), rejected: decimal.optional(),
  delta: decimal.optional(), budget_version: counter.optional(), parent_version: counter.optional(), book_version: counter.optional(), source_version: counter.optional(),
  blockers: z.array(text).max(128).optional(), economic_cash_changed: z.literal(false).optional(), budget_changed: z.boolean().optional(),
  receipt_id: text.optional(), source_event_id: text.optional(), payload_digest: z.string().regex(/^[a-f0-9]{64}(?![\s\S])/u).optional(),
  original_receipt_id: text.optional(), queried_operation: operation.optional(),
}).strict();
const amountKeys = ["requested", "applied", "pending", "cancelled", "rejected"] as const;
type Partition = Record<typeof amountKeys[number], string>;
const zero = (value: string) => /^0(?:\.0+)?(?![\s\S])/u.test(value);
function partition(summary: z.infer<typeof summarySchema>) {
  const missing = amountKeys.filter(key => summary[key] === undefined);
  if (missing.length) return { availability: "NOT_PUBLISHED" as const,
    reason_code: missing.length === amountKeys.length ? "SOURCE_PARTITION_NOT_PUBLISHED" as const : "SOURCE_PARTITION_INCOMPLETE" as const,
    value: null, missing_fields: missing };
  const value = Object.fromEntries(amountKeys.map(key => [key, summary[key]!])) as Partition;
  assertAmountPartition(value);
  const state = summary.state === "PREVIEW_ONLY" ? summary.predicted_state : summary.state;
  if (state === "APPLIED" && (!zero(value.pending) || !zero(value.cancelled) || !zero(value.rejected)) ||
    state === "REJECTED" && (!zero(value.applied) || !zero(value.pending) || !zero(value.cancelled)) ||
    state === "CANCELLED" && (!zero(value.applied) || !zero(value.pending) || !zero(value.rejected)) ||
    state === "PARTIALLY_APPLIED_CANCELLED" && (zero(value.applied) || zero(value.cancelled) || !zero(value.pending) || !zero(value.rejected)) ||
    state === "WAITING_ENCUMBRANCE" && (zero(value.pending) || !zero(value.cancelled) || !zero(value.rejected)))
    return fail("PM_PENDING_RESULT_INVALID");
  // Source WAITING can retain an already applied amount. delta is only this
  // revision's movement, not cumulative applied; no client restatement.
  return { availability: "AVAILABLE" as const, value, missing_fields: [] as typeof amountKeys[number][] };
}
export function projectPmaPendingControlCandidateResult(input: unknown, request: unknown, bounds: { response_bytes: number }) {
  const wire = parsePmaPendingControlWire(request);
  try {
    const maximum = z.object({ response_bytes: z.number().int().positive().max(32 * 1024) }).strict()
      .parse(record(bounds, ["response_bytes"], "PM_PENDING_RESULT_INVALID")).response_bytes;
    const value = record(input, Object.keys(summarySchema.shape), "PM_PENDING_RESULT_INVALID");
    if (Object.hasOwn(value, "blockers")) {
      const array = value.blockers;
      if (!Array.isArray(array) || Object.getPrototypeOf(array) !== Array.prototype || array.length > 128 ||
        Reflect.ownKeys(array).length !== array.length + 1) return fail("PM_PENDING_RESULT_INVALID");
      value.blockers = Array.from({ length: array.length }, (_, index) => {
        const descriptor = Object.getOwnPropertyDescriptor(array, String(index));
        if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) return fail("PM_PENDING_RESULT_INVALID");
        return descriptor.value;
      });
    }
    const summary = summarySchema.parse(value);
    if (Buffer.byteLength(JSON.stringify(summary)) > maximum || summary.command_id !== undefined && summary.command_id !== wire.command_id)
      return fail("PM_PENDING_RESULT_INVALID");
    const linked = summary.original_receipt_id !== undefined || summary.queried_operation !== undefined;
    if (linked && (!summary.original_receipt_id || summary.queried_operation !== wire.operation || !summary.receipt_id ||
      summary.receipt_id === summary.original_receipt_id) ||
      summary.operation !== undefined && summary.operation !== wire.operation && !linked) return fail("PM_PENDING_RESULT_INVALID");
    if (summary.state === "PREVIEW_ONLY") {
      if (summary.business_applied !== false || summary.reserved !== false || !summary.predicted_state ||
        summary.physical_transfer_performed !== false || summary.next_action !== "REVIEW_PREVIEW" || summary.cli_exit_code !== "0" ||
        summary.receipt_id !== undefined || summary.source_event_id !== undefined || linked) return fail("PM_PENDING_RESULT_INVALID");
    } else {
      if (summary.predicted_state !== undefined || summary.reserved !== undefined) return fail("PM_PENDING_RESULT_INVALID");
      const waiting = summary.state === "UNKNOWN" || summary.state === "WAITING_ENCUMBRANCE";
      const expectedBusiness = summary.state === "UNKNOWN" ? null : summary.state === "APPLIED";
      if (summary.business_applied !== expectedBusiness || summary.next_action !== (waiting ? "QUERY_SAME_INTENT" : "REVIEW_RECEIPT") ||
        summary.cli_exit_code !== (waiting ? "3" : summary.state === "APPLIED" ? "0" : "2")) return fail("PM_PENDING_RESULT_INVALID");
      if (summary.state !== "UNKNOWN" && (!summary.receipt_id || !summary.source_event_id || !summary.command_id ||
        summary.command_version === undefined || summary.physical_transfer_performed !== false)) return fail("PM_PENDING_RESULT_INVALID");
      if ((summary.receipt_id === undefined) !== (summary.source_event_id === undefined)) return fail("PM_PENDING_RESULT_INVALID");
    }
    return { kind: "PM_PENDING_CONTROL_CANDIDATE_ONLY" as const, authority: "NOT_AUTHENTICATED" as const,
      authoritative_business_applied: null, trusted_command_status: null, requested_operation: wire.operation,
      source_summary: summary, partition: partition(summary) };
  } catch { return fail("PM_PENDING_RESULT_INVALID"); }
}
