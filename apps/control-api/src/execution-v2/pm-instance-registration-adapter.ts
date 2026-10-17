import { z } from "zod";
import { pmCounter, pmText } from "./foundation.contract";
import { pmHttpRequestDigest, type PmHttpRequestBounds, type PmHttpRequestBytes } from "./pm-http-request-binding";

/** PM operator_management f0e18d47: private candidate bytes only. A parsed
 * registration body/context authenticates no scope, human, instance or receipt. */
export interface PmaInstanceRegistrationWire {
  schema_version: "pma.management-command.v1"; operation: "REGISTER_INSTANCE";
  idempotency_key: string; reason: string; expected_version: string; expected_policy_revision: string;
  parameters: { alpha_slug: string; venue: string; account_type: string; currency: string };
}
type Refusal = "PM_INSTANCE_WIRE_INVALID" | "PM_INSTANCE_TARGET_MISMATCH" | "PM_INSTANCE_RESULT_INVALID";
export class PmInstanceRegistrationCandidateError extends Error {
  constructor(readonly code: Refusal) { super(code); this.name = "PmInstanceRegistrationCandidateError"; }
}
function fail(code: Refusal): never { throw new PmInstanceRegistrationCandidateError(code); }
function wellFormed(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(++index); if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
    } else if (code >= 0xdc00 && code <= 0xdfff) return false;
  }
  return true;
}
const text = pmText.refine(wellFormed);
const counter = pmCounter.refine(value => /^(?:0|[1-9][0-9]{0,18})(?![\s\S])/u.test(value));
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
const parameters = z.object({ alpha_slug: text, venue: text, account_type: text, currency: text }).strict();
const wireSchema = z.object({
  schema_version: z.literal("pma.management-command.v1"), operation: z.literal("REGISTER_INSTANCE"),
  idempotency_key: text, reason: text, expected_version: counter, expected_policy_revision: counter, parameters,
}).strict();
/** Management-parser shape only. The owning writer still validates initial
 * version, registered alpha, venue/account type and actual registration rules. */
export function parsePmaInstanceRegistrationWire(input: unknown): PmaInstanceRegistrationWire {
  try {
    const value = record(input, Object.keys(wireSchema.shape), "PM_INSTANCE_WIRE_INVALID");
    value.parameters = record(value.parameters, Object.keys(parameters.shape), "PM_INSTANCE_WIRE_INVALID");
    return wireSchema.parse(value);
  } catch { return fail("PM_INSTANCE_WIRE_INVALID"); }
}
export const serializePmaInstanceRegistrationWire = (input: unknown): string =>
  JSON.stringify(parsePmaInstanceRegistrationWire(input));
export interface PmaInstanceRegistrationContext {
  /** Server-selected registration reference, NOT a new canonical instance ID.
   * Caller independently resolves exactly one current registration scope. */
  target_ref: string;
}
function targetPath(input: unknown, withStage: boolean) {
  try {
    const value = record(input, ["target_ref", ...(withStage ? ["stage"] : [])], "PM_INSTANCE_TARGET_MISMATCH");
    const target = text.parse(value.target_ref);
    if (target === "." || target === ".." || /[\\/?#]/u.test(target)) return fail("PM_INSTANCE_TARGET_MISMATCH");
    return { path: `/internal/pma11-candidate/management/${encodeURIComponent(target)}`,
      stage: withStage ? z.enum(["PREVIEW", "APPLY"]).parse(value.stage) : null };
  } catch { return fail("PM_INSTANCE_TARGET_MISMATCH"); }
}
export function encodePmaInstanceRegistrationRequest(input: unknown,
  context: PmaInstanceRegistrationContext & { stage: "PREVIEW" | "APPLY" }, bounds: PmHttpRequestBounds) {
  const wire = parsePmaInstanceRegistrationWire(input), target = targetPath(context, true);
  const request: PmHttpRequestBytes = { method: "POST", raw_path: Buffer.from(`${target.path}/${target.stage!.toLowerCase()}`),
    query_string: Buffer.alloc(0), body: Buffer.from(JSON.stringify(wire)) };
  return { wire, request, request_digest: pmHttpRequestDigest(request, bounds),
    required_source_capability: "DEPLOY" as const };
}
export function encodePmaInstanceRegistrationStatusRequest(input: unknown,
  context: PmaInstanceRegistrationContext, bounds: PmHttpRequestBounds) {
  const wire = parsePmaInstanceRegistrationWire(input), target = targetPath(context, false);
  const request: PmHttpRequestBytes = { method: "GET", raw_path: Buffer.from(`${target.path}/status`), body: Buffer.alloc(0),
    query_string: Buffer.from(`operation=REGISTER_INSTANCE&key=${encodeURIComponent(wire.idempotency_key)}`) };
  return { wire, request, request_digest: pmHttpRequestDigest(request, bounds),
    required_source_capability: "REPORT" as const };
}
const receiptSchema = z.object({
  store: z.literal("pm_registry.receipts"), operation: z.literal("REGISTER_INSTANCE"), key: text, version: counter,
  authority_scope_id: text.optional(),
}).strict();
const flags = { native_dispatch_performed: z.literal(false), activation_performed: z.literal(false),
  execution_authorized: z.literal(false), physical_transfer_performed: z.literal(false), economic_cash_changed: z.literal(false) };
const correspondence = { operation: z.literal("REGISTER_INSTANCE"), idempotency_key: text, command_version: counter, ...flags };
const unknownSchema = z.object({
  state: z.literal("UNKNOWN"), business_applied: z.null(), next_action: z.literal("QUERY_SAME_INTENT"), cli_exit_code: z.literal("3"),
}).strict();
const previewSchema = z.object({
  ...correspondence, state: z.literal("PREVIEW_ONLY"), predicted_state: z.literal("APPLIED"), business_applied: z.literal(false),
  reserved: z.literal(false), next_action: z.literal("REVIEW_PREVIEW"), cli_exit_code: z.literal("0"),
}).strict();
const appliedSchema = z.object({
  ...correspondence, state: z.literal("APPLIED"), target_id: text, business_applied: z.literal(true),
  next_action: z.literal("REVIEW_RECEIPT"), cli_exit_code: z.literal("0"), receipt_ref: receiptSchema,
}).strict();
const resultSchema = z.union([unknownSchema, previewSchema, appliedSchema]);
const resultKeys = [...new Set([...Object.keys(unknownSchema.shape), ...Object.keys(previewSchema.shape), ...Object.keys(appliedSchema.shape)])];
/** Actual source candidate presentation only. APPLIED means the source reports
 * its registry command, NOT funded/active/bound/trading or an authenticated fact.
 * No account/deployment/version pair or lifecycle state is inferred. */
export function projectPmaInstanceRegistrationCandidateResult(input: unknown, request: unknown, bounds: { response_bytes: number }) {
  const wire = parsePmaInstanceRegistrationWire(request);
  try {
    const maximum = z.object({ response_bytes: z.number().int().positive().max(32 * 1024) }).strict()
      .parse(record(bounds, ["response_bytes"], "PM_INSTANCE_RESULT_INVALID")).response_bytes;
    const value = record(input, resultKeys, "PM_INSTANCE_RESULT_INVALID");
    if (Object.hasOwn(value, "receipt_ref"))
      value.receipt_ref = record(value.receipt_ref, Object.keys(receiptSchema.shape), "PM_INSTANCE_RESULT_INVALID");
    const summary = resultSchema.parse(value);
    if (Buffer.byteLength(JSON.stringify(summary), "utf8") > maximum) return fail("PM_INSTANCE_RESULT_INVALID");
    if (summary.state !== "UNKNOWN" && (summary.operation !== wire.operation || summary.idempotency_key !== wire.idempotency_key))
      return fail("PM_INSTANCE_RESULT_INVALID");
    if (summary.state === "APPLIED" && summary.receipt_ref.version !== summary.command_version) return fail("PM_INSTANCE_RESULT_INVALID");
    // receipt_ref.key is the owning namespaced key, not the client's key.
    // target_id is only an opaque source-reported ID. Its canonical identity
    // or relationship to the registration reference is not proved here.
    return { kind: "PM_INSTANCE_REGISTRATION_CANDIDATE_ONLY" as const, authority: "NOT_AUTHENTICATED" as const,
      authoritative_business_applied: null, trusted_command_status: null,
      requested_operation: wire.operation, source_summary: summary };
  } catch { return fail("PM_INSTANCE_RESULT_INVALID"); }
}
