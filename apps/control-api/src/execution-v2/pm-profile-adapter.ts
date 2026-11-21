import { z } from "zod";
import { pmCounter, pmText } from "./foundation.contract";
import { pmHttpRequestDigest, type PmHttpRequestBounds, type PmHttpRequestBytes } from "./pm-http-request-binding";

/** Current PM operator_adapters5f0c5545 + binding_repositorycee38e2c:
 * candidate bytes/presentation only, not a current capability or family Outcome. */
const capabilities = {
  SET_LEVERAGE: "LEVERAGE", SET_MARGIN_MODE: "MARGIN_MODE",
  SET_POSITION_MODE: "POSITION_MODE", SET_ACCOUNT_MODE: "ACCOUNT_MODE",
} as const;
type Operation = keyof typeof capabilities;
export interface PmaProfileWire {
  schema_version: "pma.profile-command.v1"; operation: Operation;
  idempotency_key: string; reason: string; desired: string; expected_profile_revision: string;
  expected_affected_digest: string; recipient_account_id: string; recipient_deployment_id: string;
}
type Refusal = "PM_PROFILE_WIRE_INVALID" | "PM_PROFILE_TARGET_MISMATCH" | "PM_PROFILE_RESULT_INVALID";
export class PmProfileCandidateError extends Error {
  constructor(readonly code: Refusal) { super(code); this.name = "PmProfileCandidateError"; }
}
function fail(code: Refusal): never { throw new PmProfileCandidateError(code); }
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
// The shared historical "$" grammar can accept a final LF; reject it locally.
const counter = pmCounter.refine(value => /^(?:0|[1-9][0-9]{0,18})(?![\s\S])/u.test(value));
const operation = z.enum(["SET_LEVERAGE", "SET_MARGIN_MODE", "SET_POSITION_MODE", "SET_ACCOUNT_MODE"]);
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
const wireSchema = z.object({
  schema_version: z.literal("pma.profile-command.v1"), operation, idempotency_key: text, reason: text,
  desired: text, expected_profile_revision: counter, expected_affected_digest: text,
  recipient_account_id: text, recipient_deployment_id: text,
}).strict();
/** Source text for desired/affected digest stays opaque: the owning prepare
 * validates complete affected-set hash and native preparation. No default,
 * leverage enum, canonical pair or accepted current authority is invented. */
export function parsePmaProfileWire(input: unknown): PmaProfileWire {
  try { return wireSchema.parse(record(input, Object.keys(wireSchema.shape), "PM_PROFILE_WIRE_INVALID")); }
  catch { return fail("PM_PROFILE_WIRE_INVALID"); }
}
export const serializePmaProfileWire = (input: unknown): string => JSON.stringify(parsePmaProfileWire(input));
export interface PmaProfileContext {
  /** Only a fixed-route reference. Server/current resolver must independently
   * bind it and both canonical/legacy recipient IDs to the exact affected set. */
  target_ref: string;
}
function targetPath(input: unknown, withStage: boolean) {
  try {
    const value = record(input, ["target_ref", ...(withStage ? ["stage"] : [])], "PM_PROFILE_TARGET_MISMATCH");
    const target = text.parse(value.target_ref);
    if (target === "." || target === ".." || /[\\/?#]/u.test(target)) return fail("PM_PROFILE_TARGET_MISMATCH");
    return { path: `/internal/pma11-candidate/profiles/${encodeURIComponent(target)}`,
      stage: withStage ? z.enum(["PREVIEW", "PREPARE", "RECONCILE"]).parse(value.stage) : null };
  } catch { return fail("PM_PROFILE_TARGET_MISMATCH"); }
}
export function encodePmaProfileRequest(input: unknown,
  context: PmaProfileContext & { stage: "PREVIEW" | "PREPARE" | "RECONCILE" }, bounds: PmHttpRequestBounds) {
  const wire = parsePmaProfileWire(input), target = targetPath(context, true);
  const request: PmHttpRequestBytes = { method: "POST", raw_path: Buffer.from(`${target.path}/${target.stage!.toLowerCase()}`),
    query_string: Buffer.alloc(0), body: Buffer.from(JSON.stringify(wire)) };
  return { wire, request, request_digest: pmHttpRequestDigest(request, bounds),
    required_source_capability: capabilities[wire.operation] };
}
export function encodePmaProfileStatusRequest(input: unknown, context: PmaProfileContext, bounds: PmHttpRequestBounds) {
  const wire = parsePmaProfileWire(input), target = targetPath(context, false);
  const request: PmHttpRequestBytes = { method: "GET", raw_path: Buffer.from(`${target.path}/status`), body: Buffer.alloc(0),
    query_string: Buffer.from(`operation=${wire.operation}&key=${encodeURIComponent(wire.idempotency_key)}`) };
  return { wire, request, request_digest: pmHttpRequestDigest(request, bounds), required_source_capability: "REPORT" as const };
}
const correspondence = {
  qualification: z.enum(["TEST_ONLY_SIMULATION", "VERIFIED_NATIVE"]), desired: text,
  command_id: text, operation, command_version: counter, current_observed_ref: text, current_effective_ref: text,
  native_dispatch_performed: z.literal(false), activation_performed: z.literal(false),
};
const missingSchema = z.object({ state: z.literal("UNKNOWN"), business_applied: z.null(),
  next_action: z.literal("QUERY_SAME_INTENT"), cli_exit_code: z.literal("3") }).strict();
const previewSchema = z.object({ ...correspondence, state: z.literal("PREVIEW_ONLY"), business_applied: z.literal(false),
  next_action: z.literal("REVIEW_PREVIEW"), cli_exit_code: z.literal("0") }).strict();
const guardedSchema = z.object({ ...correspondence, state: z.literal("GUARDED"), business_applied: z.literal(false),
  next_action: z.literal("QUERY_SAME_INTENT"), cli_exit_code: z.literal("3") }).strict();
const unknownSchema = z.object({ ...correspondence, state: z.literal("UNKNOWN"), business_applied: z.null(),
  next_action: z.literal("QUERY_SAME_INTENT"), cli_exit_code: z.literal("3") }).strict();
const appliedSchema = z.object({ ...correspondence, state: z.literal("APPLIED"), business_applied: z.literal(true),
  // Exact current PM profile presenter: APPLIED still says QUERY_SAME_INTENT.
  next_action: z.literal("QUERY_SAME_INTENT"), cli_exit_code: z.literal("0") }).strict();
const resultSchema = z.union([missingSchema, previewSchema, guardedSchema, unknownSchema, appliedSchema]);
const resultKeys = [...new Set([...Object.keys(missingSchema.shape), ...Object.keys(previewSchema.shape)])];
/** Complete source candidate presenter, NOT a full capital Outcome. GUARDED
 * is accepted desired/guard storage, not native success. UNKNOWN preserves the
 * guard/uncertainty; APPLIED describes owning verified readback, not a send or
 * trading activation. Syntax never authenticates VERIFIED_NATIVE or refs. */
export function projectPmaProfileCandidateResult(input: unknown, request: unknown, bounds: { response_bytes: number }) {
  const wire = parsePmaProfileWire(request);
  try {
    const maximum = z.object({ response_bytes: z.number().int().positive().max(32 * 1024) }).strict()
      .parse(record(bounds, ["response_bytes"], "PM_PROFILE_RESULT_INVALID")).response_bytes;
    const summary = resultSchema.parse(record(input, resultKeys, "PM_PROFILE_RESULT_INVALID"));
    if (Buffer.byteLength(JSON.stringify(summary), "utf8") > maximum) return fail("PM_PROFILE_RESULT_INVALID");
    if ("operation" in summary && (summary.operation !== wire.operation || summary.command_id !== wire.idempotency_key ||
      summary.desired !== wire.desired)) return fail("PM_PROFILE_RESULT_INVALID");
    // Command revision and requested profile revision are DIFFERENT dimensions.
    // No receipt locator/affected list/native completion is manufactured.
    return { kind: "PM_PROFILE_CANDIDATE_ONLY" as const, authority: "NOT_AUTHENTICATED" as const,
      authoritative_business_applied: null, trusted_command_status: null,
      requested_operation: wire.operation, source_summary: summary };
  } catch { return fail("PM_PROFILE_RESULT_INVALID"); }
}
