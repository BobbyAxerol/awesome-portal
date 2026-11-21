/** Source-dark registry transport boundary; runtime provider is unqualified.
 * Selected deployment-bound PM registry transport, not a public install API.
 * Parsing a body, candidate summary, digest or this internal envelope DOES NOT
 * authenticate it. Only the configured verifier may implement this port. */
import { createHash } from "node:crypto";
import { z } from "zod";
import type { AccessActor } from "./access.contract";
import { accessDigest } from "./access-policy";
import { executionEnvironment, pmText, utcMilliseconds } from "./foundation.contract";
import { InstanceRegistrationError, instanceRegistrationStatus, registrationText as strictText, registrationCounter,
  type InstanceRegistrationIntent, type InstanceRegistrationStatus } from "./instance-registration.contract";
import { encodePmaInstanceRegistrationRequest, encodePmaInstanceRegistrationStatusRequest,
  projectPmaInstanceRegistrationCandidateResult } from "./pm-instance-registration-adapter";

const digest = z.string().regex(/^sha256:[a-f0-9]{64}(?![\s\S])/u);
const byteHash = z.string().regex(/^[a-f0-9]{64}(?![\s\S])/u);
const wellFormed = (value: string) => Buffer.from(value, "utf8").toString("utf8") === value;
const sourceText = pmText.refine(wellFormed);
export const REGISTRATION_JSON_BYTES = 32 * 1024;
/** Exact reviewed source pins, not a qualification declaration. A new source
 * revision requires impact review and selected-provider qualification. */
export const registrationSourcePins = z.object({
  commit: z.literal("6f3c852bd61fcc45d7aadacafe2776cbbb0059b7"),
  operator_adapters: z.literal("ab57b9d57398f9166d358c61b2c004cbec552f2f6ce75a44c85ffddb3295943e"),
  operator_management: z.literal("f0e18d47649040af67b708978b5ae07dba7faeafc65e91ac73e82525d2d956ab"),
  operator_session: z.literal("52ff7a5168927d8c4794e1a8d5d82a3a36f29d20032c8bc414279a482f75f0b5"),
  instance_repository: z.literal("16fac06f8253c84e7a67729bd245681f7d5717744853bd440f87e080fb936f74"),
  operator_wire: z.literal("3bfa1f6246224ae21da29668685835806112afa98d4893dd45a4c63b32b58fb9"),
  portal_human_candidate: z.literal("7352c1fb462d70731539f29e2ff1ae3f5cb2f8be95b5bb01a6da91e3d1be3418"),
}).strict();
export const instanceRegistrationAuthorization = z.object({
  qualification: z.enum(["OWNER_VERIFIED", "TEST_ONLY"]),
  reference: strictText, authority_ref: strictText, profile_ref: strictText,
  audience: z.literal("pma.management.v1"), source_selection_ref: strictText,
  source_pins: registrationSourcePins,
  actor_id: strictText, ts_user_id: strictText, workload_ref: strictText,
  delegation_ref: strictText, mapping_revision: strictText,
  membership_revision: strictText, membership_receipt_ref: strictText,
  workspace_id: strictText, environment: executionEnvironment,
  operation: z.literal("REGISTER_INSTANCE"), resource_kind: z.literal("PORTFOLIO"), resource_id: strictText,
  source_registration_ref: sourceText, alpha_slug: sourceText,
  policy_revision: strictText, expected_source_policy_revision: registrationCounter,
  intent_hash: digest,
  request_digests: z.object({ preview: digest, apply: digest, status: digest }).strict(),
  issued_at_ms: utcMilliseconds, expires_at_ms: utcMilliseconds,
  idempotency_retained_until_ms: utcMilliseconds,
  commit_checks: z.object({ human: z.literal(true), workload: z.literal(true),
    membership: z.literal(true), scope: z.literal(true), versions: z.literal(true),
    registration_rules: z.literal(true) }).strict(),
}).strict();
export type InstanceRegistrationAuthorization = z.infer<typeof instanceRegistrationAuthorization>;

export const registrationIntentHash = (actor: Pick<AccessActor, "user_id">, intent: InstanceRegistrationIntent) =>
  accessDigest({ domain: "portal.execution.instance-registration-intent.v1", actor_user_id: actor.user_id, intent });
export function registrationPreviewHash(a: InstanceRegistrationAuthorization): string {
  const { issued_at_ms: _issued, expires_at_ms: _expires, reference: _reference,
    idempotency_retained_until_ms: _retention, ...stable } = a;
  // Reissued TTL/reference alone is not a new registry intent. Selected source,
  // original target/CAS/body, actor/membership, profile and pins ARE dependencies.
  return accessDigest(stable);
}
export function boundedRegistrationJson(value: unknown): void {
  try {
    const json = JSON.stringify(value);
    if (typeof json !== "string" || Buffer.byteLength(json, "utf8") < 1 ||
      Buffer.byteLength(json, "utf8") > REGISTRATION_JSON_BYTES) throw new Error("INVALID_JSON_SIZE");
  } catch { throw new InstanceRegistrationError("REGISTRATION_CONTEXT_INVALID", 503); }
}
export function registrationRequestDigests(intent: InstanceRegistrationIntent, target: string) {
  const bounds = { request_bytes: REGISTRATION_JSON_BYTES };
  return {
    preview: encodePmaInstanceRegistrationRequest(intent.business_payload, { target_ref: target, stage: "PREVIEW" }, bounds).request_digest,
    apply: encodePmaInstanceRegistrationRequest(intent.business_payload, { target_ref: target, stage: "APPLY" }, bounds).request_digest,
    status: encodePmaInstanceRegistrationStatusRequest(intent.business_payload, { target_ref: target }, bounds).request_digest,
  };
}
/** Historical integrity only. Never compare original proof expiry to today's
 * clock/current policy: independent current report authority is a caller duty. */
export function assertRegistrationAuthorizationIdentity(a: InstanceRegistrationAuthorization,
  actor: string, intent: InstanceRegistrationIntent, hash: string): void {
  const bad = () => { throw new InstanceRegistrationError("REGISTRATION_RECEIPT_UNVERIFIED", 503); };
  if (a.actor_id !== actor || a.actor_id === a.workload_ref || a.ts_user_id === a.workload_ref ||
    a.workspace_id !== intent.workspace_id || a.environment !== intent.environment ||
    a.resource_id !== intent.resource.id || a.policy_revision !== intent.expected_policy_revision ||
    a.alpha_slug !== intent.business_payload.parameters.alpha_slug ||
    a.expected_source_policy_revision !== intent.business_payload.expected_policy_revision ||
    a.intent_hash !== hash || hash !== registrationIntentHash({ user_id: actor }, intent) ||
    a.expires_at_ms <= a.issued_at_ms || a.expires_at_ms - a.issued_at_ms > 60_000 ||
    a.idempotency_retained_until_ms < a.expires_at_ms) return bad();
  try {
    if (accessDigest(a.request_digests) !== accessDigest(registrationRequestDigests(intent, a.source_registration_ref))) return bad();
    boundedRegistrationJson(a); boundedRegistrationJson(intent);
  } catch { return bad(); }
}

const verifiedFrame = z.object({
  /** Internal selected verifier correlation, never source-summary assertions. */
  authorization_digest: digest, source_selection_ref: strictText, intent_hash: digest,
  stage: z.enum(["PREVIEW", "APPLY", "STATUS"]), request_digest: digest,
  response_sha256: byteHash,
  /** Exact UTF-8 source response bytes represented losslessly as a JS string;
   * never log/persist this private body. Actual byte hash is checked below. */
  response_json: z.string().min(1).max(REGISTRATION_JSON_BYTES),
  terminal: z.enum(["PREVIEW_ROLLED_BACK", "REGISTRY_COMMIT_VERIFIED", "SERVICE_LOOKUP_VERIFIED", "UNKNOWN"]),
}).strict();
export type VerifiedRegistrationFrame = z.infer<typeof verifiedFrame>;
export interface InstanceRegistrationTrust {
  /** Real source PREVIEW under rollback and original current human/workload
   * custody; resolve unique current registration target from Portfolio/env/Alpha
   * server-side. No URL/profile/target/human/workload from browser. */
  prepare(input: { actor: AccessActor; intent: InstanceRegistrationIntent; intent_hash: string; signal: AbortSignal }):
    Promise<{ authorization: InstanceRegistrationAuthorization; preview: VerifiedRegistrationFrame } | null>;
  /** Send exactly once under actual PM current-human/workload/COMMIT fences.
   * APPLIED requires authenticated source commit, not a parsed 200 summary. */
  send(input: { authorization: InstanceRegistrationAuthorization; intent: InstanceRegistrationIntent; signal: AbortSignal }):
    Promise<VerifiedRegistrationFrame>;
  /** Accepted-obligation service authority, NOT expired original human cookies
   * or a refreshed new-send grant. Exact original target/operation/client key;
   * authenticated REPORT + existing source receipt visibility. NEVER resend. */
  lookup(input: { authorization: InstanceRegistrationAuthorization; intent: InstanceRegistrationIntent; signal: AbortSignal }):
    Promise<VerifiedRegistrationFrame | null>;
}
export const unqualifiedInstanceRegistrationTrust: InstanceRegistrationTrust = {
  prepare: async () => null,
  send: async () => { throw new Error("REGISTRATION_NOT_QUALIFIED"); },
  lookup: async () => null,
};

/** Closed nested summary grammar. Unlike JSON.parse alone, escaped duplicate
 * keys cannot change interpretation across verifiers. No arrays/numbers exist
 * in this exact PM summary. Decode/hash is integrity, NOT authentication. */
function decodeResponse(source: string): unknown {
  const utf8 = Buffer.from(source, "utf8");
  if (utf8.length < 1 || utf8.length > REGISTRATION_JSON_BYTES || utf8.toString("utf8") !== source)
    throw new Error("INVALID_SOURCE_BYTES");
  const quoted = /"(?:[^"\\\u0000-\u001f]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*"/y;
  let at = 0, nodes = 0;
  const ws = () => { while (at < source.length && /[\x20\t\n\r]/.test(source[at])) at++; };
  const string = (): string => {
    quoted.lastIndex = at; const match = quoted.exec(source);
    if (!match) throw new Error("INVALID_SOURCE_JSON");
    at = quoted.lastIndex; const value = JSON.parse(match[0]) as string;
    if (Buffer.from(value, "utf8").toString("utf8") !== value) throw new Error("INVALID_SOURCE_UTF8");
    return value;
  };
  const parse = (depth: number): unknown => {
    if (++nodes > 128 || depth > 4) throw new Error("INVALID_SOURCE_DEPTH");
    ws(); if (source[at] === '"') return string();
    for (const [word, value] of [["null", null], ["true", true], ["false", false]] as const)
      if (source.slice(at, at + word.length) === word) { at += word.length; return value; }
    if (source[at++] !== "{") throw new Error("INVALID_SOURCE_JSON");
    ws(); const object: Record<string, unknown> = Object.create(null); let keys = 0;
    if (source[at] !== "}") for (;;) {
      const key = string();
      if (++keys > 32 || Object.hasOwn(object, key)) throw new Error("DUPLICATE_SOURCE_KEY");
      ws(); if (source[at++] !== ":") throw new Error("INVALID_SOURCE_JSON");
      object[key] = parse(depth + 1); ws(); if (source[at] !== ",") break;
      at++; ws();
    }
    if (source[at++] !== "}") throw new Error("INVALID_SOURCE_JSON");
    return object;
  };
  const parsed = parse(0); ws(); if (at !== source.length) throw new Error("INVALID_SOURCE_JSON");
  return parsed;
}
function checkedSummary(a: InstanceRegistrationAuthorization, intent: InstanceRegistrationIntent,
  raw: VerifiedRegistrationFrame, stage: VerifiedRegistrationFrame["stage"]) {
  const frame = verifiedFrame.parse(raw);
  if (frame.stage !== stage || frame.authorization_digest !== accessDigest(a) ||
    frame.source_selection_ref !== a.source_selection_ref || frame.intent_hash !== a.intent_hash ||
    frame.request_digest !== a.request_digests[stage.toLowerCase() as "preview" | "apply" | "status"] ||
    createHash("sha256").update(Buffer.from(frame.response_json, "utf8")).digest("hex") !== frame.response_sha256)
    throw new InstanceRegistrationError("REGISTRATION_RECEIPT_UNVERIFIED", 503);
  const { source_summary: summary } = projectPmaInstanceRegistrationCandidateResult(
    decodeResponse(frame.response_json), intent.business_payload, { response_bytes: REGISTRATION_JSON_BYTES });
  return { frame, summary };
}
export function assertRegistrationPreview(a: InstanceRegistrationAuthorization,
  intent: InstanceRegistrationIntent, raw: VerifiedRegistrationFrame): void {
  try {
    const { frame, summary } = checkedSummary(a, intent, raw, "PREVIEW");
    if (frame.terminal !== "PREVIEW_ROLLED_BACK" || summary.state !== "PREVIEW_ONLY" || summary.command_version !== "1")
      throw new Error("INVALID_PREVIEW");
  } catch { throw new InstanceRegistrationError("REGISTRATION_RECEIPT_UNVERIFIED", 503); }
}
export function mergeRegistrationSource(old: { intent: InstanceRegistrationIntent;
  authorization: InstanceRegistrationAuthorization; status: InstanceRegistrationStatus },
  raw: VerifiedRegistrationFrame, stage: "APPLY" | "STATUS"): InstanceRegistrationStatus {
  try {
    const { frame, summary } = checkedSummary(old.authorization, old.intent, raw, stage);
    if (summary.state === "PREVIEW_ONLY") throw new Error("PREVIEW_IS_NOT_COMMIT");
    if (summary.state === "UNKNOWN") {
      if (frame.terminal !== "UNKNOWN" && !(stage === "STATUS" && frame.terminal === "SERVICE_LOOKUP_VERIFIED"))
        throw new Error("INVALID_UNKNOWN_TERMINAL");
      // Missing/older source lookup cannot erase a committed registry receipt.
      return old.status.business.state === "APPLIED" ? old.status : instanceRegistrationStatus.parse({
        ...old.status, delivery: "DELIVERY_UNKNOWN", next_action: "QUERY_SAME_INTENT" });
    }
    if (stage === "APPLY" ? frame.terminal !== "REGISTRY_COMMIT_VERIFIED" : frame.terminal !== "SERVICE_LOOKUP_VERIFIED")
      throw new Error("COMMIT_NOT_VERIFIED");
    // Pinned register_instance requires expected_version0 and creates precisely
    // registry generation1. A different generation is not this command receipt.
    if (summary.command_version !== "1" || summary.receipt_ref.version !== "1") throw new Error("INVALID_REGISTRY_GENERATION");
    const business: InstanceRegistrationStatus["business"] = { state: "APPLIED", business_applied: true,
      receipt: { kind: "PM_REGISTRY_RECEIPT", key: summary.receipt_ref.key, version: "1" },
      source_instance_ref: summary.target_id };
    if (old.status.business.state === "APPLIED" && accessDigest(old.status.business) !== accessDigest(business))
      throw new Error("IMMUTABLE_REGISTRY_RECEIPT_CHANGED");
    // No canonical ID pair, source event/digest, money, activation, projection
    // currency or venue lifecycle is manufactured from this registry receipt.
    return instanceRegistrationStatus.parse({ ...old.status, delivery: "ACKNOWLEDGED", business,
      next_action: "REVIEW_RECEIPT" });
  } catch { throw new InstanceRegistrationError("REGISTRATION_RECEIPT_UNVERIFIED", 503); }
}
