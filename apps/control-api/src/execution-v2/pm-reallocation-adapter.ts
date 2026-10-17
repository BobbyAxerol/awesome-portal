import { z } from "zod";
import { assertAmountPartition, pmCounter, pmText, unsignedDecimal } from "./foundation.contract";
import { pmHttpRequestDigest, type PmHttpRequestBounds, type PmHttpRequestBytes } from "./pm-http-request-binding";

/** Current PM5f0c5545/owning reallocation698d638d. Candidate codec only:
 * no sender, mapper, grant, source lease or authoritative CommandStatus. */
export interface PmaReallocationWire {
  schema_version: "pma.operator-control.v1"; operation: "REALLOCATE_BUDGET";
  idempotency_key: string; recipient_kind: "PORTFOLIO"; currency: string; reason: string; amount: string;
  source_account_id: string; source_deployment_id: string; target_account_id: string; target_deployment_id: string;
  expected_versions: { budget: string; source: string; book: string; source_budget: string; source_book: string;
    target_budget: string; target_book: string };
}
type Refusal = "PM_REALLOCATION_WIRE_INVALID" | "PM_REALLOCATION_TARGET_MISMATCH" | "PM_REALLOCATION_RESULT_INVALID";
export class PmReallocationCandidateError extends Error {
  constructor(readonly code: Refusal) { super(code); this.name = "PmReallocationCandidateError"; }
}
function fail(code: Refusal): never { throw new PmReallocationCandidateError(code); }
function wellFormed(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) { const next = value.charCodeAt(++index);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false; }
    else if (code >= 0xdc00 && code <= 0xdfff) return false;
  }
  return true;
}
const text = pmText.refine(wellFormed);
const decimal = unsignedDecimal.refine(value => /^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?![\s\S])/u.test(value));
const counter = pmCounter.refine(value => /^(?:0|[1-9][0-9]{0,18})(?![\s\S])/u.test(value));
const digest = z.string().regex(/^[a-f0-9]{64}(?![\s\S])/u);
const zero = (value: string) => /^0(?:\.0+)?(?![\s\S])/u.test(value);
function record(input: unknown, allowed: readonly string[], code: Refusal): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(input))) return fail(code);
  const entries: Array<[string, unknown]> = [], keys = Reflect.ownKeys(input);
  if (keys.length > allowed.length) return fail(code);
  for (const key of keys) {
    if (typeof key !== "string" || !allowed.includes(key)) return fail(code);
    const descriptor = Object.getOwnPropertyDescriptor(input, key)!;
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) return fail(code);
    entries.push([key, descriptor.value]);
  }
  return Object.fromEntries(entries);
}
function array(input: unknown, length: number): unknown[] {
  if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype ||
    Object.getOwnPropertyDescriptor(input, "length")?.value !== length || Reflect.ownKeys(input).length !== length + 1)
    return fail("PM_REALLOCATION_RESULT_INVALID");
  return Array.from({ length }, (_, index) => {
    const descriptor = Object.getOwnPropertyDescriptor(input, String(index));
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) return fail("PM_REALLOCATION_RESULT_INVALID");
    return descriptor.value;
  });
}
const versions = z.object({ budget: counter, source: counter, book: counter,
  source_budget: counter, source_book: counter, target_budget: counter, target_book: counter }).strict();
const wireSchema = z.object({ schema_version: z.literal("pma.operator-control.v1"), operation: z.literal("REALLOCATE_BUDGET"),
  idempotency_key: text, recipient_kind: z.literal("PORTFOLIO"), currency: text, reason: text,
  expected_versions: versions, amount: decimal.refine(value => !zero(value)),
  source_account_id: text, source_deployment_id: text, target_account_id: text, target_deployment_id: text }).strict();
export function parsePmaReallocationWire(input: unknown): PmaReallocationWire {
  try {
    const value = record(input, Object.keys(wireSchema.shape), "PM_REALLOCATION_WIRE_INVALID");
    value.expected_versions = record(value.expected_versions, Object.keys(versions.shape), "PM_REALLOCATION_WIRE_INVALID");
    const wire = wireSchema.parse(value);
    // Exact owning distinction; different aliases may still refer to the same
    // identity, so actual canonical resolution remains a server/source duty.
    if (wire.source_account_id === wire.target_account_id || wire.source_deployment_id === wire.target_deployment_id)
      return fail("PM_REALLOCATION_WIRE_INVALID");
    return wire;
  } catch { return fail("PM_REALLOCATION_WIRE_INVALID"); }
}
export const serializePmaReallocationWire = (input: unknown): string => JSON.stringify(parsePmaReallocationWire(input));
export interface PmaReallocationContext {
  /** Fixed-route parent reference only, NOT canonical portfolio/lineage proof.
   * Owning resolver checks parent + BOTH exact source/destination pair legs. */
  target_ref: string;
}
function targetPath(input: unknown, withStage: boolean) {
  try {
    const value = record(input, ["target_ref", ...(withStage ? ["stage"] : [])], "PM_REALLOCATION_TARGET_MISMATCH");
    const target = text.parse(value.target_ref);
    if (target === "." || target === ".." || /[\\/?#]/u.test(target)) return fail("PM_REALLOCATION_TARGET_MISMATCH");
    return { path: `/internal/pma11-candidate/capital/${encodeURIComponent(target)}`,
      stage: withStage ? z.enum(["PREVIEW", "APPLY"]).parse(value.stage) : null };
  } catch { return fail("PM_REALLOCATION_TARGET_MISMATCH"); }
}
export function encodePmaReallocationRequest(input: unknown,
  context: PmaReallocationContext & { stage: "PREVIEW" | "APPLY" }, bounds: PmHttpRequestBounds) {
  const wire = parsePmaReallocationWire(input), target = targetPath(context, true);
  const request: PmHttpRequestBytes = { method: "POST", raw_path: Buffer.from(`${target.path}/${target.stage!.toLowerCase()}`),
    query_string: Buffer.alloc(0), body: Buffer.from(JSON.stringify(wire)) };
  // Descriptive capability name; this does not resolve/authorize any of the3 legs.
  return { wire, request, request_digest: pmHttpRequestDigest(request, bounds), required_source_capability: "BUDGET" as const };
}
export function encodePmaReallocationStatusRequest(input: unknown, context: PmaReallocationContext, bounds: PmHttpRequestBounds) {
  const wire = parsePmaReallocationWire(input), target = targetPath(context, false);
  const request: PmHttpRequestBytes = { method: "GET", raw_path: Buffer.from(`${target.path}/status`), body: Buffer.alloc(0),
    query_string: Buffer.from(`operation=REALLOCATE_BUDGET&key=${encodeURIComponent(wire.idempotency_key)}`) };
  return { wire, request, request_digest: pmHttpRequestDigest(request, bounds), required_source_capability: "REPORT" as const };
}
const pair = z.tuple([counter, counter]), matrix = z.tuple([pair, pair, pair]);
const legFields = { leg_id: digest, debited_id: digest, credited_id: digest, amount: decimal };
const returnLeg = z.object({ leg: z.literal("RETURN"), ...legFields }).strict();
const regrantLeg = z.object({ leg: z.literal("REGRANT"), ...legFields }).strict();
const facts = {
  requested: decimal, applied: decimal, pending: decimal, cancelled: decimal, rejected: decimal,
  source_version: counter, versions_before: matrix, versions_after: matrix,
  source_budget_before: decimal, source_budget_after: decimal, target_budget_before: decimal, target_budget_after: decimal,
  parent_delegated: decimal, legs: z.tuple([returnLeg, regrantLeg]), economic_cash_changed: z.literal(false),
  physical_transfer_performed: z.literal(false), payload_digest: digest,
};
const missingSchema = z.object({ state: z.literal("UNKNOWN"), business_applied: z.null(),
  next_action: z.literal("QUERY_SAME_INTENT"), cli_exit_code: z.literal("3") }).strict();
const previewSchema = z.object({ ...facts, state: z.literal("PREVIEW_ONLY"), predicted_state: z.literal("APPLIED"),
  business_applied: z.literal(false), reserved: z.literal(false), next_action: z.literal("REVIEW_PREVIEW"), cli_exit_code: z.literal("0") }).strict();
const appliedSchema = z.object({ ...facts, state: z.literal("APPLIED"), business_applied: z.literal(true),
  receipt_id: text, source_event_id: text, next_action: z.literal("REVIEW_RECEIPT"), cli_exit_code: z.literal("0") }).strict();
const summarySchema = z.union([missingSchema, previewSchema, appliedSchema]);
const summaryKeys = [...new Set([...Object.keys(missingSchema.shape), ...Object.keys(previewSchema.shape), ...Object.keys(appliedSchema.shape)])];
function scaled(values: readonly string[]): bigint[] {
  const parts = values.map(value => { const [whole, fraction = ""] = value.split(".");
    return { coefficient: BigInt(whole + fraction), scale: fraction.length }; });
  const scale = Math.max(...parts.map(value => value.scale));
  return parts.map(value => value.coefficient * 10n ** BigInt(scale - value.scale));
}
function checkFacts(summary: z.infer<typeof previewSchema> | z.infer<typeof appliedSchema>, wire: PmaReallocationWire) {
  assertAmountPartition(summary);
  const [requested, amount, applied, returned, regranted] = scaled([
    summary.requested, wire.amount, summary.applied, summary.legs[0].amount, summary.legs[1].amount]);
  if (requested !== amount || applied !== amount || returned !== amount || regranted !== amount ||
    !zero(summary.pending) || !zero(summary.cancelled) || !zero(summary.rejected)) return fail("PM_REALLOCATION_RESULT_INVALID");
  const [sourceBefore, sourceAfter, targetBefore, targetAfter, delegated, delta] = scaled([
    summary.source_budget_before, summary.source_budget_after, summary.target_budget_before,
    summary.target_budget_after, summary.parent_delegated, wire.amount]);
  if (sourceBefore - sourceAfter !== delta || targetAfter - targetBefore !== delta ||
    sourceBefore + targetBefore > delegated || sourceAfter + targetAfter > delegated) return fail("PM_REALLOCATION_RESULT_INVALID");
  const v = wire.expected_versions, expected = [[v.book, v.budget], [v.source_book, v.source_budget], [v.target_book, v.target_budget]];
  for (let row = 0; row < 3; row++) for (let column = 0; column < 2; column++) {
    if (summary.versions_before[row][column] !== expected[row][column] ||
      BigInt(summary.versions_after[row][column]) !== BigInt(summary.versions_before[row][column]) + 1n)
      return fail("PM_REALLOCATION_RESULT_INVALID");
  }
  if (BigInt(summary.source_version) !== BigInt(v.source) + 1n) return fail("PM_REALLOCATION_RESULT_INVALID");
  const [back, grant] = summary.legs;
  if (back.credited_id !== grant.debited_id || back.debited_id === grant.credited_id ||
    back.debited_id === back.credited_id || grant.debited_id === grant.credited_id || back.leg_id === grant.leg_id)
    return fail("PM_REALLOCATION_RESULT_INVALID");
}
/** Current owning reallocation is all-or-nothing: no partial/queued receipt is
 * made up. Missing lookup is typed absent, never a zero or an automatic retry.
 * Summary IDs are opaque source hashes, not verified mappings of body IDs. */
export function projectPmaReallocationCandidateResult(input: unknown, request: unknown, bounds: { response_bytes: number }) {
  const wire = parsePmaReallocationWire(request);
  try {
    const maximum = z.object({ response_bytes: z.number().int().positive().max(32 * 1024) }).strict()
      .parse(record(bounds, ["response_bytes"], "PM_REALLOCATION_RESULT_INVALID")).response_bytes;
    const value = record(input, summaryKeys, "PM_REALLOCATION_RESULT_INVALID");
    for (const key of ["versions_before", "versions_after"] as const)
      if (Object.hasOwn(value, key)) value[key] = array(value[key], 3).map(row => array(row, 2));
    if (Object.hasOwn(value, "legs")) value.legs = array(value.legs, 2)
      .map(leg => record(leg, Object.keys(returnLeg.shape), "PM_REALLOCATION_RESULT_INVALID"));
    const summary = summarySchema.parse(value);
    if (Buffer.byteLength(JSON.stringify(summary), "utf8") > maximum) return fail("PM_REALLOCATION_RESULT_INVALID");
    if (summary.state !== "UNKNOWN") checkFacts(summary, wire);
    const partition = summary.state === "UNKNOWN" ? {
      availability: "NOT_PUBLISHED" as const, reason_code: "SOURCE_REALLOCATION_STATUS_UNKNOWN" as const, value: null,
    } : { availability: "AVAILABLE" as const, value: { requested: summary.requested, applied: summary.applied,
      pending: summary.pending, cancelled: summary.cancelled, rejected: summary.rejected } };
    // Presenter omits operation/key/target/command revision and the actual
    // composite approval/release proof; payload_digest is only source-reported.
    return { kind: "PM_REALLOCATION_CANDIDATE_ONLY" as const, authority: "NOT_AUTHENTICATED" as const,
      authoritative_business_applied: null, trusted_command_status: null, requested_operation: wire.operation,
      source_summary: summary, partition, request_binding: { availability: "NOT_PUBLISHED" as const,
        reason_code: "SOURCE_SUMMARY_REQUEST_IDENTITY_NOT_PUBLISHED" as const, value: null } };
  } catch { return fail("PM_REALLOCATION_RESULT_INVALID"); }
}
