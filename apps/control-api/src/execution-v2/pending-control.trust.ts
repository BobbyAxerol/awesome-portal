/** Isolated correctness implementation; runtime provider remains unqualified.
 * Separate selected pending-recall transport boundary. A parsed body, digest,
 * candidate result or this internal proof DOES NOT authenticate source authority.
 * Only an explicitly qualified server-owned verifier may implement this port. */
import { createHash } from "node:crypto";
import { z } from "zod";
import type { AccessActor } from "./access.contract";
import { accessDigest } from "./access-policy";
import { executionEnvironment, utcMilliseconds } from "./foundation.contract";
import { PendingControlError, pendingControlIntent, pendingControlStatus,
  pendingDigest, pendingOperation, pendingPrediction, pendingSourceText, pendingText, pendingVersions,
  type PendingControlIntent, type PendingControlStatus, type PendingPrediction } from "./pending-control.contract";
import { encodePmaPendingControlRequest, encodePmaPendingControlStatusRequest,
  projectPmaPendingControlCandidateResult } from "./pm-pending-control-adapter";

export const PENDING_JSON_BYTES = 32 * 1024;
const byteHash = z.string().regex(/^[a-f0-9]{64}(?![\s\S])/u);
const recipient = z.discriminatedUnion("recipient_kind", [
  z.object({ recipient_kind: z.literal("PORTFOLIO"), currency: pendingSourceText }).strict(),
  z.object({ recipient_kind: z.literal("DEPLOYMENT_ACCOUNT"), currency: pendingSourceText,
    recipient_account_id: pendingSourceText, recipient_deployment_id: pendingSourceText }).strict(),
]);

/** Exact reviewed source bytes, NOT deployment/transport qualification. */
export const pendingSourcePins = z.object({
  commit: z.literal("39aaa9c6f02077246abc9480a907455ece06f62b"),
  operator_adapters: z.literal("ab57b9d57398f9166d358c61b2c004cbec552f2f6ce75a44c85ffddb3295943e"),
  recall_repository: z.literal("8c62e73045f7c39483d69ddeff439b747b724970986db91e204005e1d95750e3"),
  operator_intent_journal: z.literal("6cb6fac7bb81e61dddd2d9decbb099d22c040f13a71565a253dddb06b364492b"),
  operator_wire: z.literal("3bfa1f6246224ae21da29668685835806112afa98d4893dd45a4c63b32b58fb9"),
}).strict();
export const pendingControlAuthorization = z.object({
  qualification: z.enum(["OWNER_VERIFIED", "TEST_ONLY"]),
  reference: pendingText, authority_ref: pendingText, profile_ref: pendingText,
  audience: z.literal("pma.management.v1"), source_selection_ref: pendingText,
  source_pins: pendingSourcePins,
  actor_id: pendingText, ts_user_id: pendingText, workload_ref: pendingText,
  delegation_ref: pendingText, mapping_revision: pendingText,
  membership_revision: pendingText, membership_receipt_ref: pendingText,
  workspace_id: pendingText, environment: executionEnvironment, operation: pendingOperation,
  resource_kind: z.enum(["PORTFOLIO", "DEPLOYMENT"]), resource_id: pendingText,
  /** Exact selected route reference and owning recipient identity are distinct;
   * neither is accepted from the browser or guessed from a display label. */
  source_target_ref: pendingSourceText, source_recipient_ref: pendingSourceText,
  original_recall_id: pendingSourceText, recipient,
  policy_revision: pendingText, expected_versions: pendingVersions,
  /** PM's ORIGINAL normalized control intent digest, resolved under rollback
   * PREVIEW. It includes owning recipient/authority/integer CAS semantics, so
   * it is not recomputed from Portal JSON or an HTTP request byte hash. */
  original_payload_sha256: byteHash,
  /** Hash of the exact source-derived prediction, not a client calculation. */
  preview_prediction_digest: pendingDigest,
  intent_hash: pendingDigest,
  request_digests: z.object({ preview: pendingDigest, apply: pendingDigest, status: pendingDigest }).strict(),
  issued_at_ms: utcMilliseconds, expires_at_ms: utcMilliseconds,
  idempotency_retained_until_ms: utcMilliseconds,
  /** Scope includes the original recipient AND its genuine current parent;
   * source retains both real BUDGET checks through its COMMIT. Literal flags
   * express port obligations; parsing them is never evidence of those checks. */
  commit_checks: z.object({ human: z.literal(true), workload: z.literal(true),
    membership: z.literal(true), scope: z.literal(true), versions: z.literal(true),
    original_recall: z.literal(true), remainder: z.literal(true) }).strict(),
}).strict();
export type PendingControlAuthorization = z.infer<typeof pendingControlAuthorization>;

export const pendingIntentHash = (actor: Pick<AccessActor, "user_id">, intent: PendingControlIntent) =>
  accessDigest({ domain: "portal.execution.pending-recall-intent.v1", actor_user_id: actor.user_id, intent });
export function pendingPreviewHash(a: PendingControlAuthorization): string {
  const { reference: _reference, issued_at_ms: _issued, expires_at_ms: _expires,
    idempotency_retained_until_ms: _retention, ...stable } = a;
  // Genuine renewal alone changes no intent. Economics/blockers/CAS/source/
  // original recall/current correspondence/profile remain preview dependencies.
  return accessDigest(stable);
}

/** Bounds local proof/intent/status JSON too. Do not invoke getters/toJSON or
 * silently drop undefined, sparse entries, symbol keys or non-data properties.
 * Internal epoch-ms numbers are allowed here; SOURCE response grammar below
 * deliberately rejects all numeric tokens because PM wire counters are strings. */
export function boundedPendingJson(value: unknown): void {
  try {
    let nodes = 0;
    const walk = (input: unknown, depth: number): void => {
      if (++nodes > 512 || depth > 8) throw new Error("PENDING_JSON_DEPTH");
      if (input === null || typeof input === "boolean") return;
      if (typeof input === "string") {
        if (Buffer.from(input, "utf8").toString("utf8") !== input) throw new Error("PENDING_JSON_UTF8");
        return;
      }
      if (typeof input === "number" && Number.isSafeInteger(input) && input >= 0) return;
      if (!input || typeof input !== "object") throw new Error("PENDING_JSON_VALUE");
      if (Array.isArray(input)) {
        if (Object.getPrototypeOf(input) !== Array.prototype || input.length > 128 ||
          Reflect.ownKeys(input).length !== input.length + 1) throw new Error("PENDING_JSON_ARRAY");
        for (let index = 0; index < input.length; index++) {
          const d = Object.getOwnPropertyDescriptor(input, String(index));
          if (!d?.enumerable || !Object.hasOwn(d, "value")) throw new Error("PENDING_JSON_ARRAY");
          walk(d.value, depth + 1);
        }
        return;
      }
      if (![Object.prototype, null].includes(Object.getPrototypeOf(input))) throw new Error("PENDING_JSON_OBJECT");
      const keys = Reflect.ownKeys(input);
      if (keys.length > 64) throw new Error("PENDING_JSON_KEYS");
      for (const key of keys) {
        const d = Object.getOwnPropertyDescriptor(input, key)!;
        if (typeof key !== "string" || !d.enumerable || !Object.hasOwn(d, "value")) throw new Error("PENDING_JSON_PROPERTY");
        walk(key, depth + 1); walk(d.value, depth + 1);
      }
    };
    walk(value, 0);
    const json = JSON.stringify(value);
    if (typeof json !== "string" || Buffer.byteLength(json, "utf8") < 1 ||
      Buffer.byteLength(json, "utf8") > PENDING_JSON_BYTES) throw new Error("PENDING_JSON_SIZE");
  } catch { throw new PendingControlError("PENDING_CONTROL_CONTEXT_INVALID", 503); }
}
function recipientOf(intent: PendingControlIntent): z.infer<typeof recipient> {
  const b = intent.business_payload;
  return b.recipient_kind === "PORTFOLIO" ? { recipient_kind: b.recipient_kind, currency: b.currency } :
    { recipient_kind: b.recipient_kind, currency: b.currency,
      recipient_account_id: b.recipient_account_id, recipient_deployment_id: b.recipient_deployment_id };
}
export function pendingRequestDigests(intent: PendingControlIntent, target: string) {
  const context = { target_ref: target, original_command_id: intent.business_payload.command_id, recipient: recipientOf(intent) };
  const bounds = { request_bytes: PENDING_JSON_BYTES };
  return {
    preview: encodePmaPendingControlRequest(intent.business_payload, { ...context, stage: "PREVIEW" }, bounds).request_digest,
    apply: encodePmaPendingControlRequest(intent.business_payload, { ...context, stage: "APPLY" }, bounds).request_digest,
    status: encodePmaPendingControlStatusRequest(intent.business_payload, context, bounds).request_digest,
  };
}
/** Original integrity only. Current session/grant/accepted correspondence,
 * profile availability, source-custody and final clock are coordinator duties.
 * Historical lookup does NOT reauthenticate an expired original human lease. */
export function assertPendingAuthorizationIdentity(a: PendingControlAuthorization,
  actor: string, intent: PendingControlIntent, hash: string): void {
  try {
    pendingControlAuthorization.parse(a); pendingControlIntent.parse(intent);
    if (a.actor_id !== actor || a.actor_id === a.workload_ref || a.ts_user_id === a.workload_ref ||
      a.workspace_id !== intent.workspace_id || a.environment !== intent.environment ||
      a.operation !== intent.business_payload.operation || a.resource_kind !== intent.resource.kind ||
      a.resource_id !== intent.resource.id || a.policy_revision !== intent.expected_policy_revision ||
      a.original_recall_id !== intent.business_payload.command_id ||
      accessDigest(a.recipient) !== accessDigest(recipientOf(intent)) ||
      accessDigest(a.expected_versions) !== accessDigest(intent.business_payload.expected_versions) ||
      a.intent_hash !== hash || hash !== pendingIntentHash({ user_id: actor }, intent) ||
      a.expires_at_ms <= a.issued_at_ms || a.expires_at_ms - a.issued_at_ms > 60_000 ||
      a.idempotency_retained_until_ms < a.expires_at_ms ||
      accessDigest(a.request_digests) !== accessDigest(pendingRequestDigests(intent, a.source_target_ref)))
      throw new Error("PENDING_ORIGINAL_IDENTITY_CHANGED");
    boundedPendingJson(a); boundedPendingJson(intent);
  } catch { throw new PendingControlError("PENDING_CONTROL_RECEIPT_UNVERIFIED", 503); }
}

const verifiedFrame = z.object({
  authorization_digest: pendingDigest, source_selection_ref: pendingText, intent_hash: pendingDigest,
  stage: z.enum(["PREVIEW", "APPLY", "STATUS"]), request_digest: pendingDigest,
  response_sha256: byteHash, response_json: z.string().min(1).max(PENDING_JSON_BYTES),
  terminal: z.enum(["PREVIEW_ROLLED_BACK", "RECALL_CONTROL_COMMIT_VERIFIED", "SERVICE_LOOKUP_VERIFIED", "UNKNOWN"]),
}).strict();
export type VerifiedPendingFrame = z.infer<typeof verifiedFrame>;
export interface PendingControlTrust {
  /** Resolve exact original recall/recipient/current parent/source/profile;
   * hold real current human+workload+source BUDGET/CAS checks through rollback
   * PREVIEW. No URL, actor, workload or trusted proof comes from the browser. */
  prepare(input: { actor: AccessActor; intent: PendingControlIntent; intent_hash: string; signal: AbortSignal }):
    Promise<{ authorization: PendingControlAuthorization; preview: VerifiedPendingFrame } | null>;
  /** Exactly one APPLY after durable local correlation. Actual PM owns ENTER,
   * both recipient/parent authorization, original remainder and COMMIT. */
  send(input: { authorization: PendingControlAuthorization; intent: PendingControlIntent; signal: AbortSignal }):
    Promise<VerifiedPendingFrame>;
  /** Service-only accepted-obligation recovery: authenticated current REPORT
   * receipt visibility on SAME original operation/key/target; NEVER send or
   * create a new APPLY_PENDING action, nor refresh an old human credential. */
  lookup(input: { authorization: PendingControlAuthorization; intent: PendingControlIntent; signal: AbortSignal }):
    Promise<VerifiedPendingFrame | null>;
}
export const unqualifiedPendingControlTrust: PendingControlTrust = {
  prepare: async () => null,
  send: async () => { throw new Error("PENDING_CONTROL_NOT_QUALIFIED"); },
  lookup: async () => null,
};

/** Exact raw response grammar: 32KiB UTF8, depth<=6, <=512 values, <=64 keys
 * per object and <=128 array entries. Escaped keys are compared after decode;
 * duplicate keys, numeric tokens, sparse/unsupported values and broken UTF16
 * are refused before the existing finite PM summary parser is invoked. */
function decodeResponse(source: string): unknown {
  const bytes = Buffer.from(source, "utf8");
  if (bytes.length < 1 || bytes.length > PENDING_JSON_BYTES || bytes.toString("utf8") !== source)
    throw new Error("PENDING_SOURCE_BYTES_INVALID");
  const quoted = /"(?:[^"\\\u0000-\u001f]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*"/y;
  let at = 0, nodes = 0;
  const ws = () => { while (at < source.length && /[\x20\t\n\r]/u.test(source[at])) at++; };
  const string = (): string => {
    quoted.lastIndex = at; const match = quoted.exec(source);
    if (!match) throw new Error("PENDING_SOURCE_JSON_INVALID");
    at = quoted.lastIndex;
    const value = JSON.parse(match[0]) as string;
    if (Buffer.from(value, "utf8").toString("utf8") !== value) throw new Error("PENDING_SOURCE_UTF8_INVALID");
    return value;
  };
  const parse = (depth: number): unknown => {
    if (++nodes > 512 || depth > 6) throw new Error("PENDING_SOURCE_DEPTH_INVALID");
    ws(); if (source[at] === '"') return string();
    for (const [word, value] of [["null", null], ["true", true], ["false", false]] as const)
      if (source.slice(at, at + word.length) === word) { at += word.length; return value; }
    if (source[at] === "[") {
      at++; ws(); const array: unknown[] = [];
      if (source[at] !== "]") for (;;) {
        if (array.length >= 128) throw new Error("PENDING_SOURCE_ARRAY_INVALID");
        array.push(parse(depth + 1)); ws(); if (source[at] !== ",") break;
        at++; ws();
      }
      if (source[at++] !== "]") throw new Error("PENDING_SOURCE_JSON_INVALID");
      return array;
    }
    if (source[at++] !== "{") throw new Error("PENDING_SOURCE_JSON_INVALID");
    ws(); const object: Record<string, unknown> = Object.create(null); let keys = 0;
    if (source[at] !== "}") for (;;) {
      const key = string();
      if (++keys > 64 || Object.hasOwn(object, key)) throw new Error("PENDING_SOURCE_DUPLICATE_KEY");
      ws(); if (source[at++] !== ":") throw new Error("PENDING_SOURCE_JSON_INVALID");
      object[key] = parse(depth + 1); ws(); if (source[at] !== ",") break;
      at++; ws();
    }
    if (source[at++] !== "}") throw new Error("PENDING_SOURCE_JSON_INVALID");
    return object;
  };
  const result = parse(0); ws();
  if (at !== source.length) throw new Error("PENDING_SOURCE_JSON_INVALID");
  return result;
}

function checkedSummary(a: PendingControlAuthorization, intent: PendingControlIntent,
  raw: VerifiedPendingFrame, stage: VerifiedPendingFrame["stage"]) {
  assertPendingAuthorizationIdentity(a, a.actor_id, intent, a.intent_hash);
  const frame = verifiedFrame.parse(raw);
  if (frame.stage !== stage || frame.authorization_digest !== accessDigest(a) ||
    frame.source_selection_ref !== a.source_selection_ref || frame.intent_hash !== a.intent_hash ||
    frame.request_digest !== a.request_digests[stage.toLowerCase() as "preview" | "apply" | "status"] ||
    createHash("sha256").update(Buffer.from(frame.response_json, "utf8")).digest("hex") !== frame.response_sha256)
    throw new Error("PENDING_SOURCE_FRAME_MISMATCH");
  const candidate = projectPmaPendingControlCandidateResult(decodeResponse(frame.response_json),
    intent.business_payload, { response_bytes: PENDING_JSON_BYTES });
  const summary = candidate.source_summary;
  // Current command() wraps PREVIEW/APPLY in payload_digest too; current
  // status() returns ORIGINAL queried intent digest even for a later receipt.
  if ((summary.state !== "UNKNOWN" || summary.payload_digest !== undefined) &&
    summary.payload_digest !== a.original_payload_sha256 ||
    summary.target !== undefined && summary.target !== a.source_recipient_ref)
    throw new Error("PENDING_SOURCE_ORIGINAL_MISMATCH");
  return { frame, summary, partition: candidate.partition };
}
type Summary = ReturnType<typeof checkedSummary>["summary"];
function versionsOf(s: Summary): z.infer<typeof pendingVersions> {
  return pendingVersions.parse({ budget: s.budget_version, source: s.source_version,
    parent: s.parent_version, book: s.book_version, command: s.command_version });
}
const versionKeys = ["budget", "source", "parent", "book", "command"] as const;
function versionOrder(a: z.infer<typeof pendingVersions>, b: z.infer<typeof pendingVersions>) {
  const deltas = versionKeys.map(key => BigInt(a[key]) - BigInt(b[key]));
  return { same: deltas.every(v => v === 0n), forward: deltas.every(v => v >= 0n), backward: deltas.every(v => v <= 0n) };
}
/** Exact decimal comparison only; no float conversion or amount synthesis. */
function amountCompare(a: string, b: string): number {
  const [aw, af = ""] = a.split("."), [bw, bf = ""] = b.split(".");
  const scale = Math.max(af.length, bf.length);
  const av = BigInt(aw + af) * 10n ** BigInt(scale - af.length);
  const bv = BigInt(bw + bf) * 10n ** BigInt(scale - bf.length);
  return av < bv ? -1 : av > bv ? 1 : 0;
}
function atLeastExpected(versions: z.infer<typeof pendingVersions>, a: PendingControlAuthorization): void {
  if (!versionOrder(versions, a.expected_versions).forward) throw new Error("PENDING_SOURCE_CAS_REGRESSION");
}
function assertStatePartition(s: PendingControlStatus): void {
  if (s.business.state === "UNKNOWN") return;
  const a = s.business.amounts!, zero = (value: string) => amountCompare(value, "0") === 0;
  if (s.business.state === "APPLIED" && (!zero(a.pending) || !zero(a.cancelled) || !zero(a.rejected)) ||
    s.business.state === "REJECTED" && (!zero(a.applied) || !zero(a.pending) || !zero(a.cancelled)) ||
    s.business.state === "CANCELLED" && (!zero(a.applied) || !zero(a.pending) || !zero(a.rejected)) ||
    s.business.state === "PARTIALLY_APPLIED_CANCELLED" &&
      (zero(a.applied) || zero(a.cancelled) || !zero(a.pending) || !zero(a.rejected)) ||
    s.business.state === "WAITING_ENCUMBRANCE" && (zero(a.pending) || !zero(a.cancelled) || !zero(a.rejected)))
    throw new Error("PENDING_STATE_PARTITION_INVALID");
}
/** Repeat under the store's exact row lock. No source trust or authorization is
 * acquired here. Clock assignment remains store-owned; an unchanged update
 * time is allowed while a proposed next receipt is checked before persistence. */
export function assertPendingStatusProgress(previous: PendingControlStatus, next: PendingControlStatus): void {
  try {
    pendingControlStatus.parse(previous); pendingControlStatus.parse(next);
    boundedPendingJson(previous); boundedPendingJson(next);
    assertStatePartition(previous); assertStatePartition(next);
    const fixed = (s: PendingControlStatus) => ({ schema_version: s.schema_version, family: s.family,
      command_id: s.command_id, operation: s.operation, original_recall_id: s.original_recall_id,
      resource: s.resource, environment: s.environment, profile_ref: s.profile_ref,
      economic_cash_changed: s.economic_cash_changed, physical_transfer_performed: s.physical_transfer_performed,
      projection: s.projection, venue: s.venue, authority: s.authority, created_at_ms: s.created_at_ms });
    if (accessDigest(fixed(previous)) !== accessDigest(fixed(next)) || next.updated_at_ms < previous.updated_at_ms)
      throw new Error("PENDING_STATUS_IDENTITY_CHANGED");
    const before = previous.business, after = next.business;
    if (after.state !== "UNKNOWN" && next.next_action !==
      (after.state === "WAITING_ENCUMBRANCE" ? "QUERY_SAME_INTENT" : "REVIEW_RECEIPT"))
      throw new Error("PENDING_STATUS_ACTION_CHANGED");
    if (before.state === "UNKNOWN") return;
    if (after.state === "UNKNOWN") throw new Error("PENDING_ACCEPTED_RECEIPT_ERASED");
    const oldReceipt = before.receipt!, newReceipt = after.receipt!, a = before.amounts!, b = after.amounts!;
    if (oldReceipt.control_receipt_id !== newReceipt.control_receipt_id ||
      oldReceipt.original_payload_sha256 !== newReceipt.original_payload_sha256 || amountCompare(a.requested, b.requested) !== 0)
      throw new Error("PENDING_ORIGINAL_RECEIPT_CHANGED");
    const order = versionOrder(newReceipt.versions, oldReceipt.versions);
    // Actual owning existing() requires pending>0 for BOTH continuation
    // operations. A terminal recall therefore cannot acquire a newer business
    // receipt through this family; UI refresh is never another source command.
    if (before.state !== "WAITING_ENCUMBRANCE" || order.same ||
      newReceipt.versions.command === oldReceipt.versions.command) {
      if (accessDigest(before) !== accessDigest(after)) throw new Error("PENDING_TERMINAL_OR_SAME_REVISION_CHANGED");
      return;
    }
    if (!order.forward || BigInt(newReceipt.versions.command) <= BigInt(oldReceipt.versions.command) ||
      newReceipt.latest_receipt_id === oldReceipt.latest_receipt_id || newReceipt.source_event_id === oldReceipt.source_event_id ||
      amountCompare(b.applied, a.applied) < 0 || amountCompare(b.cancelled, a.cancelled) < 0 ||
      amountCompare(b.rejected, a.rejected) < 0 || amountCompare(b.pending, a.pending) > 0)
      throw new Error("PENDING_RECALL_REVISION_INVALID");
  } catch { throw new PendingControlError("PENDING_CONTROL_RECEIPT_UNVERIFIED", 503); }
}
export function assertPendingPreview(a: PendingControlAuthorization,
  intent: PendingControlIntent, raw: VerifiedPendingFrame): PendingPrediction {
  try {
    const { frame, summary, partition } = checkedSummary(a, intent, raw, "PREVIEW");
    if (frame.terminal !== "PREVIEW_ROLLED_BACK" || summary.state !== "PREVIEW_ONLY" ||
      summary.command_id !== a.original_recall_id || summary.economic_cash_changed !== false ||
      partition.availability !== "AVAILABLE" || summary.blockers === undefined)
      throw new Error("PENDING_PREVIEW_NOT_COMPLETE");
    const versions = versionsOf(summary); atLeastExpected(versions, a);
    const prediction = pendingPrediction.parse({ state: summary.predicted_state, amounts: partition.value,
      delta: summary.delta, versions, blockers: summary.blockers });
    if (accessDigest(prediction) !== a.preview_prediction_digest) throw new Error("PENDING_PREVIEW_FACTS_CHANGED");
    return prediction;
  } catch { throw new PendingControlError("PENDING_CONTROL_RECEIPT_UNVERIFIED", 503); }
}

/** Original control receipt stays fixed; later authenticated STATUS may expose
 * the owning recall's newer receipt. The latter is NOT a second result of
 * the submitted control and MUST NOT replace its original normalized digest. */
export function mergePendingSource(old: { intent: PendingControlIntent;
  authorization: PendingControlAuthorization; status: PendingControlStatus },
  raw: VerifiedPendingFrame, stage: "APPLY" | "STATUS"): PendingControlStatus {
  try {
    const a = old.authorization, previous = pendingControlStatus.parse(old.status);
    assertPendingStatusProgress(previous, previous);
    if (previous.operation !== old.intent.business_payload.operation || previous.original_recall_id !== a.original_recall_id ||
      previous.environment !== old.intent.environment || accessDigest(previous.resource) !== accessDigest(old.intent.resource) ||
      previous.profile_ref !== a.profile_ref || previous.authority !== a.qualification)
      throw new Error("PENDING_LOCAL_CORRELATION_CHANGED");
    const { frame, summary, partition } = checkedSummary(a, old.intent, raw, stage);
    if (summary.state === "PREVIEW_ONLY") throw new Error("PENDING_PREVIEW_IS_NOT_COMMIT");
    if (summary.state === "UNKNOWN") {
      if (frame.terminal !== "UNKNOWN" && !(stage === "STATUS" && frame.terminal === "SERVICE_LOOKUP_VERIFIED"))
        throw new Error("PENDING_UNKNOWN_TERMINAL_INVALID");
      // A missing/unknown lookup must preserve ANY accepted control receipt,
      // including WAITING with a nonzero already-applied cumulative amount.
      return previous.business.state !== "UNKNOWN" ? old.status : pendingControlStatus.parse({
        ...previous, delivery: "DELIVERY_UNKNOWN", next_action: "QUERY_SAME_INTENT" });
    }
    if (stage === "APPLY" ? frame.terminal !== "RECALL_CONTROL_COMMIT_VERIFIED" : frame.terminal !== "SERVICE_LOOKUP_VERIFIED")
      throw new Error("PENDING_COMMIT_NOT_VERIFIED");
    if (summary.command_id !== a.original_recall_id || summary.economic_cash_changed !== false ||
      partition.availability !== "AVAILABLE" || summary.blockers === undefined ||
      stage === "APPLY" && (summary.original_receipt_id !== undefined || summary.queried_operation !== undefined))
      throw new Error("PENDING_RECEIPT_NOT_COMPLETE");
    const versions = versionsOf(summary); atLeastExpected(versions, a);
    // Pinned recall _record does not add operation to the immutable result.
    // For the original receipt, exact authenticated request identity supplies
    // it. A later linked receipt may be a different operation: keep typed
    // absence instead of relabelling queried_operation as latest_operation.
    const latestOperation = summary.operation ??
      (summary.original_receipt_id === undefined ? old.intent.business_payload.operation : null);
    const receipt = { control_receipt_id: summary.original_receipt_id ?? summary.receipt_id,
      latest_receipt_id: summary.receipt_id, latest_operation: latestOperation,
      latest_operation_availability: latestOperation === null ? "NOT_PUBLISHED" : "AVAILABLE",
      latest_operation_reason: latestOperation === null ? "SOURCE_OPERATION_NOT_PUBLISHED" : null,
      source_event_id: summary.source_event_id, original_payload_sha256: a.original_payload_sha256, versions };
    const next = pendingControlStatus.parse({ ...previous, delivery: "ACKNOWLEDGED",
      business: { state: summary.state, business_applied: summary.state === "APPLIED",
        amounts: partition.value, receipt, blockers: summary.blockers },
      next_action: summary.state === "WAITING_ENCUMBRANCE" ? "QUERY_SAME_INTENT" : "REVIEW_RECEIPT" });
    const before = previous.business, after = next.business;
    if (before.state === "UNKNOWN") { assertPendingStatusProgress(previous, next); return next; }
    const oldReceipt = before.receipt!, newReceipt = after.receipt!, priorAmounts = before.amounts!, newAmounts = after.amounts!;
    if (oldReceipt.control_receipt_id !== newReceipt.control_receipt_id ||
      oldReceipt.original_payload_sha256 !== newReceipt.original_payload_sha256 ||
      amountCompare(priorAmounts.requested, newAmounts.requested) !== 0)
      throw new Error("PENDING_ORIGINAL_RECEIPT_CHANGED");
    const order = versionOrder(versions, oldReceipt.versions);
    if (order.same || versions.command === oldReceipt.versions.command) {
      assertPendingStatusProgress(previous, next);
      return old.status;
    }
    const backwardAmounts = amountCompare(newAmounts.applied, priorAmounts.applied) <= 0 &&
      amountCompare(newAmounts.cancelled, priorAmounts.cancelled) <= 0 &&
      amountCompare(newAmounts.rejected, priorAmounts.rejected) <= 0 &&
      amountCompare(newAmounts.pending, priorAmounts.pending) >= 0;
    if (order.backward && backwardAmounts) return old.status;
    assertPendingStatusProgress(previous, next);
    // The immutable original APPLY response cannot become a newer revision;
    // only authenticated service STATUS may reveal later owning recall state.
    if (stage !== "STATUS") throw new Error("PENDING_APPLY_RECEIPT_CHANGED");
    return next;
  } catch { throw new PendingControlError("PENDING_CONTROL_RECEIPT_UNVERIFIED", 503); }
}
