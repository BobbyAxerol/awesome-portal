import { z } from "zod";
import { pmCounter, pmText, unsignedDecimal } from "./foundation.contract";
import { pmHttpRequestDigest, type PmHttpRequestBounds, type PmHttpRequestBytes } from "./pm-http-request-binding";

/** PM e62b6825 operator_adapters.py:23–103,131–139,274–303; private source
 * codec only. No transport, action/grant, issuer, source Outcome or activation.
 * Candidate summaries remain unauthenticated even when they claim APPLIED. */
export type PmaAdminControlOperation = "ADMIN_LOCK" | "ADMIN_UNLOCK";
export interface PmaAdminControlWire {
  schema_version: "pma.operator-control.v1"; operation: PmaAdminControlOperation;
  idempotency_key: string; recipient_kind: "ROOT" | "PORTFOLIO" | "DEPLOYMENT_ACCOUNT";
  currency: string; reason: string; lock_id: string; lock_kind?: string; amount?: string;
  recipient_account_id?: string; recipient_deployment_id?: string;
  expected_versions: { budget: string; source: string; lock?: string };
}
const operationSchema = z.enum(["ADMIN_LOCK", "ADMIN_UNLOCK"]);
const recipientKind = z.enum(["ROOT", "PORTFOLIO", "DEPLOYMENT_ACCOUNT"]);
// Preserve the shared source bounds/semantics, but require absolute end here:
// JavaScript `$` also matches before a terminal line break; BigInt trims it.
const controlDecimal = unsignedDecimal.refine(value => /^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?![\s\S])/u.test(value));
const controlCounter = pmCounter.refine(value => /^(?:0|[1-9][0-9]{0,18})(?![\s\S])/u.test(value));
const wireKeys = ["schema_version", "operation", "idempotency_key", "recipient_kind", "currency", "reason",
  "expected_versions", "lock_id", "lock_kind", "amount", "recipient_account_id", "recipient_deployment_id"] as const;
type Refusal = "PM_CONTROL_WIRE_INVALID" | "PM_CONTROL_TARGET_MISMATCH" | "PM_CONTROL_RESULT_INVALID";
export class PmAdminControlCandidateError extends Error {
  constructor(readonly code: Refusal) { super(code); this.name = "PmAdminControlCandidateError"; }
}
function fail(code: Refusal): never { throw new PmAdminControlCandidateError(code); }
/** Capture only finite plain own-data inputs. Never evaluate a getter, toJSON,
 * prototype method, symbol or an arbitrary recursive source payload. */
function dataRecord(input: unknown, allowed: readonly string[], code: Refusal): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(input))) return fail(code);
  const keys = Reflect.ownKeys(input);
  if (keys.length > allowed.length) return fail(code);
  const entries: Array<[string, unknown]> = [];
  for (const key of keys) {
    if (typeof key !== "string" || !allowed.includes(key)) return fail(code);
    const descriptor = Object.getOwnPropertyDescriptor(input, key)!;
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) return fail(code);
    entries.push([key, descriptor.value]);
  }
  return Object.fromEntries(entries);
}
function parseRecipient(input: unknown) {
  const value = dataRecord(input, ["recipient_kind", "currency", "recipient_account_id", "recipient_deployment_id"], "PM_CONTROL_TARGET_MISMATCH");
  const kind = recipientKind.parse(value.recipient_kind);
  const shape: z.ZodRawShape = { recipient_kind: z.literal(kind), currency: pmText };
  if (kind === "DEPLOYMENT_ACCOUNT") Object.assign(shape, { recipient_account_id: pmText, recipient_deployment_id: pmText });
  return z.object(shape).strict().parse(value) as Pick<PmaAdminControlWire,
    "recipient_kind" | "currency" | "recipient_account_id" | "recipient_deployment_id">;
}
export function parsePmaAdminControlWire(input: unknown): PmaAdminControlWire {
  try {
    const value = dataRecord(input, wireKeys, "PM_CONTROL_WIRE_INVALID");
    value.expected_versions = dataRecord(value.expected_versions, ["budget", "source", "lock"], "PM_CONTROL_WIRE_INVALID");
    const operation = operationSchema.parse(value.operation), kind = recipientKind.parse(value.recipient_kind);
    const versions: z.ZodRawShape = { budget: controlCounter, source: controlCounter };
    if (operation === "ADMIN_UNLOCK") versions.lock = controlCounter;
    const shape: z.ZodRawShape = { schema_version: z.literal("pma.operator-control.v1"), operation: z.literal(operation),
      idempotency_key: pmText, recipient_kind: z.literal(kind), currency: pmText, reason: pmText,
      expected_versions: z.object(versions).strict(), lock_id: pmText };
    // AMOUNT versus ALL_NEW_RISK remains an owning PM decision. In particular
    // zero is a real wire value for an all-new-risk lock, not a missing amount.
    if (operation === "ADMIN_LOCK") Object.assign(shape, { lock_kind: pmText, amount: controlDecimal });
    if (kind === "DEPLOYMENT_ACCOUNT") Object.assign(shape, { recipient_account_id: pmText, recipient_deployment_id: pmText });
    return z.object(shape).strict().parse(value) as unknown as PmaAdminControlWire;
  } catch { return fail("PM_CONTROL_WIRE_INVALID"); }
}
/** Deterministic source-compatible HTTP body, NOT PM's canonical intent digest.
 * Decimal spelling is preserved; PM independently normalizes its business hash. */
export function serializePmaAdminControlWire(input: unknown): string {
  return JSON.stringify(parsePmaAdminControlWire(input));
}
export interface PmaAdminControlEncodingContext {
  /** All context comes from the server's qualified resolver/config; validating
   * this data does not qualify it or grant BUDGET/UNLOCK authority. */
  target_ref: string; stage: "PREVIEW" | "APPLY";
  recipient: Pick<PmaAdminControlWire, "recipient_kind" | "currency" | "recipient_account_id" | "recipient_deployment_id">;
}
export function encodePmaAdminControlRequest(input: unknown, context: PmaAdminControlEncodingContext,
  bounds: PmHttpRequestBounds) {
  const wire = parsePmaAdminControlWire(input);
  let recipient: ReturnType<typeof parseRecipient>, pathSegment: string, stage: "PREVIEW" | "APPLY";
  try {
    const captured = dataRecord(context, ["target_ref", "stage", "recipient"], "PM_CONTROL_TARGET_MISMATCH");
    const target = pmText.parse(captured.target_ref);
    // The source route has one {target} segment, not a URL/path converter.
    if (target === "." || target === ".." || /[\\/?#]/u.test(target)) return fail("PM_CONTROL_TARGET_MISMATCH");
    pathSegment = encodeURIComponent(target); stage = z.enum(["PREVIEW", "APPLY"]).parse(captured.stage);
    recipient = parseRecipient(captured.recipient);
  } catch { return fail("PM_CONTROL_TARGET_MISMATCH"); }
  for (const key of ["recipient_kind", "currency", "recipient_account_id", "recipient_deployment_id"] as const)
    if (wire[key] !== recipient[key]) return fail("PM_CONTROL_TARGET_MISMATCH");
  const request: PmHttpRequestBytes = { method: "POST",
    raw_path: Buffer.from(`/internal/pma11-candidate/capital/${pathSegment}/${stage.toLowerCase()}`, "utf8"),
    query_string: Buffer.alloc(0), body: Buffer.from(serializePmaAdminControlWire(wire), "utf8") };
  return { wire, request, request_digest: pmHttpRequestDigest(request, bounds),
    required_source_capability: wire.operation === "ADMIN_LOCK" ? "BUDGET" as const : "UNLOCK" as const };
}

const summarySchema = z.object({
  state: z.enum(["PREVIEW_ONLY", "UNKNOWN", "APPLIED"]), business_applied: z.boolean().nullable(),
  // The candidate HTTP router applies operator_wire: even CLI integer codes
  // are decimal strings. The distinct Edge full Outcome keeps native codes.
  next_action: z.enum(["REVIEW_PREVIEW", "QUERY_SAME_INTENT", "REVIEW_RECEIPT"]), cli_exit_code: z.enum(["0", "3"]),
  predicted_state: pmText.optional(), reserved: z.literal(false).optional(), physical_transfer_performed: z.literal(false).optional(),
  operation: operationSchema.optional(), lock_id: pmText.optional(), kind: pmText.optional(), active: z.boolean().optional(),
  amount: controlDecimal.optional(), budget_version: controlCounter.optional(), parent_version: controlCounter.optional(),
  source_version: controlCounter.optional(), lock_version: controlCounter.optional(), book_version: controlCounter.optional(),
  command_version: controlCounter.optional(), command_id: pmText.optional(), target: pmText.optional(),
  economic_cash_changed: z.boolean().optional(), budget_changed: z.boolean().optional(),
  blockers: z.array(pmText).max(128).optional(), receipt_id: pmText.nullable().optional(), source_event_id: pmText.nullable().optional(),
  payload_digest: z.string().regex(/^[a-f0-9]{64}(?![\s\S])/u).optional(),
}).strict();
const decimalKey = (value: string) => { const [whole, fraction = ""] = value.split(".");
  const significant = fraction.replace(/0+$/, ""); return whole + (significant ? `.${significant}` : ""); };
/** The only output authority is explicitly NONE. These are source-reported
 * candidate fields, never a verified receipt/SourceCommandResult or grant. */
export function projectPmaAdminControlCandidateResult(input: unknown, request: unknown, bounds: { response_bytes: number }) {
  const wire = parsePmaAdminControlWire(request);
  try {
    const maximum = z.object({ response_bytes: z.number().int().positive().max(32 * 1024) }).strict()
      .parse(dataRecord(bounds, ["response_bytes"], "PM_CONTROL_RESULT_INVALID")).response_bytes;
    const value = dataRecord(input, Object.keys(summarySchema.shape), "PM_CONTROL_RESULT_INVALID");
    if (Object.hasOwn(value, "blockers")) {
      const array = value.blockers;
      if (!Array.isArray(array) || Object.getPrototypeOf(array) !== Array.prototype || array.length > 128 ||
        Reflect.ownKeys(array).length !== array.length + 1) return fail("PM_CONTROL_RESULT_INVALID");
      value.blockers = Array.from({ length: array.length }, (_, index) => {
        const descriptor = Object.getOwnPropertyDescriptor(array, String(index));
        if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, "value")) return fail("PM_CONTROL_RESULT_INVALID");
        return descriptor.value;
      });
    }
    const summary = summarySchema.parse(value);
    if (Buffer.byteLength(JSON.stringify(summary), "utf8") > maximum) return fail("PM_CONTROL_RESULT_INVALID");
    if (summary.operation !== undefined && summary.operation !== wire.operation ||
      summary.lock_id !== undefined && summary.lock_id !== wire.lock_id) return fail("PM_CONTROL_RESULT_INVALID");
    if (wire.operation === "ADMIN_LOCK" && (summary.kind !== undefined && summary.kind !== wire.lock_kind ||
      summary.amount !== undefined && decimalKey(summary.amount) !== decimalKey(wire.amount!))) return fail("PM_CONTROL_RESULT_INVALID");
    if (summary.state === "PREVIEW_ONLY") {
      if (summary.business_applied !== false || summary.reserved !== false || summary.physical_transfer_performed !== false ||
        !summary.predicted_state || summary.next_action !== "REVIEW_PREVIEW" || summary.cli_exit_code !== "0" ||
        Object.hasOwn(summary, "receipt_id") || Object.hasOwn(summary, "source_event_id")) return fail("PM_CONTROL_RESULT_INVALID");
    } else {
      if (Object.hasOwn(summary, "predicted_state") || Object.hasOwn(summary, "reserved")) return fail("PM_CONTROL_RESULT_INVALID");
      if (summary.state === "UNKNOWN") {
        if (summary.business_applied !== null || summary.next_action !== "QUERY_SAME_INTENT" || summary.cli_exit_code !== "3")
          return fail("PM_CONTROL_RESULT_INVALID");
      } else if (summary.business_applied !== true || !summary.receipt_id || !summary.source_event_id ||
        summary.physical_transfer_performed !== false || summary.next_action !== "REVIEW_RECEIPT" || summary.cli_exit_code !== "0" ||
        summary.active !== undefined && summary.active !== (wire.operation === "ADMIN_LOCK")) return fail("PM_CONTROL_RESULT_INVALID");
    }
    return { kind: "PM_ADMIN_CONTROL_CANDIDATE_ONLY" as const,
      authority: "NOT_AUTHENTICATED" as const, authoritative_business_applied: null, trusted_command_status: null,
      requested_operation: wire.operation, source_summary: summary };
  } catch { return fail("PM_CONTROL_RESULT_INVALID"); }
}
