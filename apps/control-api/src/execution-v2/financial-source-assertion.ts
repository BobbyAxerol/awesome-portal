import { randomBytes } from "node:crypto";
import { types } from "node:util";
import { decodeJwt } from "jose";
import { z } from "zod";
import type { AccessActor } from "./access.contract";
import { CurrentHumanCandidate, type CurrentHumanBinding } from "./current-human-candidate";
import { pmHttpRequestDigest } from "./pm-http-request-binding";

const text = z.string().min(1).max(256).regex(/^[^\u0000-\u0020\u007f]+$/u);
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/u);
const integer = z.number().int().nonnegative().safe();
const sourcePath = z.string().min(2).max(512).regex(/^\/[A-Za-z0-9_./-]+$/u)
  .refine(value => value.split("/").slice(1).every(segment => segment !== "" && segment !== "." && segment !== ".."));
const utf8 = z.string().max(1_048_576).refine(value =>
  Buffer.byteLength(value, "utf8") <= 1_048_576 && Buffer.from(value, "utf8").toString("utf8") === value);
export const financialSourceAssertionRequest = z.object({
  schema_version: z.literal("portal.execution.financial-source-assertion-request.v1"),
  binding_digest: digest, receiver_id: text, workload_id: text, method: z.literal("POST"),
  path: sourcePath, body_utf8: utf8, request_digest: digest,
  delivery_sequence: integer, previous_lease_id: text.nullable(),
}).strict();
export const financialSourceAssertionResponse = z.object({
  schema_version: z.literal("portal.execution.financial-source-assertion-response.v1"),
  binding_digest: digest, receiver_id: text, workload_id: text, method: z.literal("POST"), path: sourcePath,
  request_digest: digest, assertion: z.string().min(1).max(16_384), lease_id: text,
  issued_at_ms: integer, expires_at_ms: integer, authority_revision: integer,
  delivery_sequence: integer, previous_lease_id: text.nullable(),
}).strict().refine(value => value.expires_at_ms > value.issued_at_ms &&
  value.expires_at_ms <= value.issued_at_ms + 30_000);
export type FinancialSourceAssertionRequest = z.infer<typeof financialSourceAssertionRequest>;
export type FinancialSourceAssertionResponse = z.infer<typeof financialSourceAssertionResponse>;
export const financialSourceAssertionCompletionRequest = z.object({
  schema_version: z.literal("portal.execution.financial-source-assertion-completion-request.v1"),
  binding_digest: digest, receiver_id: text, workload_id: text, delivery_sequence: integer,
  lease_id: text, request_digest: digest, response_digest: digest,
}).strict();
export const financialSourceAssertionCompletionResponse = z.object({
  schema_version: z.literal("portal.execution.financial-source-assertion-completion-response.v1"),
  delivery_sequence: integer, lease_id: text, request_digest: digest, response_digest: digest, completed: z.literal(true),
}).strict();
export type FinancialSourceAssertionCompletionRequest = z.infer<typeof financialSourceAssertionCompletionRequest>;
export type FinancialSourceAssertionCompletionResponse = z.infer<typeof financialSourceAssertionCompletionResponse>;
export class FinancialSourceAssertionError extends Error {
  constructor(readonly code: string, readonly status = 503) {
    super("The financial source identity assertion is not available.");
  }
}
const fail = (code: string, status = 503): never => { throw new FinancialSourceAssertionError(code, status); };
const actorSchema = z.object({ user_id: text, session_id: text, session_generation: integer }).strict();
const registrationSchema = z.object({ workspace_id: text, environment: z.literal("paper"),
  workload_id: text, receiver_id: text, binding_digest: digest,
  paths: z.array(sourcePath).length(6).refine(value => new Set(value).size === value.length),
}).strict();
export type FinancialSourceAssertionSelection = z.infer<typeof registrationSchema>;
type Issued = Awaited<ReturnType<CurrentHumanCandidate["issue"]>>;
type Candidate = Pick<CurrentHumanCandidate, "issue" | "revalidateIssue"> & {
  /** Real candidate must authenticate persisted terminal source custody plus
   * current actor/authority. Absence is fail-closed for older/test adapters. */
  canReplaceResolvedIssue?: (actor: AccessActor, binding: CurrentHumanBinding, issued: Issued) => Promise<boolean>;
};
type Delivery = { sequence: number; previous_lease_id: string | null; key: string; binding: CurrentHumanBinding;
  response: Promise<FinancialSourceAssertionResponse>; completed: boolean;
  completion?: { response_digest: string; pending?: Promise<FinancialSourceAssertionCompletionResponse> } };
type Entry = { actor: AccessActor; selection: FinancialSourceAssertionSelection; expires: number;
  retired: boolean; last?: Delivery; pending: number; issued: number };

/** Pure internal server boundary: reject accessors/proxies before schema code.
 * This is not an HTTP registration operation and accepts no client actor. */
function snapshot(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || types.isProxy(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return fail("FINANCIAL_ASSERTION_REQUEST_INVALID", 400);
  const descriptors = Object.getOwnPropertyDescriptors(value), actual = Reflect.ownKeys(value);
  if (actual.length !== keys.length || actual.some(key => typeof key !== "string" || !keys.includes(key)))
    return fail("FINANCIAL_ASSERTION_REQUEST_INVALID", 400);
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    const d = descriptors[key];
    if (!d?.enumerable || !Object.hasOwn(d, "value")) return fail("FINANCIAL_ASSERTION_REQUEST_INVALID", 400);
    out[key] = d.value;
  }
  return out;
}

/** Real CurrentHumanCandidate persists the same lease that its existing
 * ENTER/terminal/recovery routes inspect. This object never signs a financial
 * proof, calls PM, grants membership, or translates a workload into a human.
 * Exact-request retries reuse the original Promise/lease (including ambiguous
 * failures). A new delivery sequence additionally needs explicit authenticated
 * Edge completion AFTER it validated the original PM response, and persisted
 * COMMITTED/ROLLED_BACK custody plus fresh authority. Source terminal alone,
 * send/acquire, expiry, ENTERED/UNKNOWN or lost response NEVER completes a
 * delivery or allows replacement. This is identity orchestration, not a proof
 * invented by Core that the Edge actually received financial response bytes.
 * Restart refuses vanished contexts instead of fabricating recovery.
 * Context expiry/release only stops issue; it NEVER deletes lease obligations.
 */
export class FinancialSourceAssertionAuthority {
  private readonly contexts = new Map<string, Entry>();
  private readonly limits: { ttl_ms: number; maximum_contexts: number; maximum_requests_per_context: number };
  private readonly now: () => number;
  private stopped = false;
  private pending = 0;
  constructor(private readonly candidate: Candidate,
    limits: { ttl_ms: number; maximum_contexts: number; maximum_requests_per_context: number }, now = Date.now) {
    if (![limits.ttl_ms, limits.maximum_contexts, limits.maximum_requests_per_context].every(Number.isSafeInteger) ||
      limits.ttl_ms < 1 || limits.ttl_ms > 300_000 || limits.maximum_contexts < 1 || limits.maximum_contexts > 128 ||
      limits.maximum_requests_per_context < 1 || limits.maximum_requests_per_context > 64)
      fail("FINANCIAL_ASSERTION_CONFIG_INVALID");
    this.limits = { ...limits }; this.now = now;
  }
  /** Called only by an authenticated Core server composition using its exact
   * principal, commissioned source binding and fixed six read-only PM paths. */
  register(actor: AccessActor, selection: FinancialSourceAssertionSelection): { original_context: string; expires_at_ms: number } {
    let capturedActor: AccessActor, capturedSelection: FinancialSourceAssertionSelection;
    try {
      capturedActor = actorSchema.parse(snapshot(actor, ["user_id", "session_id", "session_generation"]));
      const raw = snapshot(selection, ["workspace_id", "environment", "workload_id", "receiver_id", "binding_digest", "paths"]);
      if (!Array.isArray(raw.paths) || types.isProxy(raw.paths)) throw new Error();
      capturedSelection = registrationSchema.parse(raw);
    } catch { return fail("FINANCIAL_ASSERTION_REQUEST_INVALID", 400); }
    const now = this.time(); this.prune(now);
    if (this.stopped) return fail("FINANCIAL_ASSERTION_STOPPED");
    if (this.contexts.size >= this.limits.maximum_contexts) return fail("FINANCIAL_ASSERTION_CAPACITY_EXHAUSTED", 429);
    const token = randomBytes(32).toString("base64url"), expires = now + this.limits.ttl_ms;
    this.contexts.set(token, { actor: capturedActor, selection: capturedSelection, expires, retired: false,
      pending: 0, issued: 0 });
    return { original_context: token, expires_at_ms: expires };
  }
  async issue(token: string, input: unknown): Promise<FinancialSourceAssertionResponse> {
    let request: FinancialSourceAssertionRequest;
    try { request = financialSourceAssertionRequest.parse(snapshot(input, ["schema_version", "binding_digest", "receiver_id",
      "workload_id", "method", "path", "body_utf8", "request_digest", "delivery_sequence", "previous_lease_id"])); }
    catch { return fail("FINANCIAL_ASSERTION_REQUEST_INVALID", 400); }
    if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/u.test(token)) return fail("FINANCIAL_ASSERTION_CONTEXT_REQUIRED", 403);
    const entry = this.contexts.get(token);
    this.current(entry);
    const s = entry!.selection;
    if (request.binding_digest !== s.binding_digest || request.receiver_id !== s.receiver_id ||
      request.workload_id !== s.workload_id || !s.paths.includes(request.path))
      return fail("FINANCIAL_ASSERTION_BINDING_MISMATCH", 403);
    const binding = { workspace_id: s.workspace_id, environment: s.environment, workload_id: s.workload_id,
      request_digest: pmHttpRequestDigest({ method: request.method, raw_path: Buffer.from(request.path, "utf8"),
        query_string: Buffer.alloc(0), body: Buffer.from(request.body_utf8, "utf8") }, { request_bytes: 1_048_576 }) };
    if (binding.request_digest !== request.request_digest) return fail("FINANCIAL_ASSERTION_REQUEST_DIGEST_MISMATCH", 409);
    const key = `${request.path}:${binding.request_digest}`;
    const issueNew = (): Delivery => {
      // Count EVERY logical issuance, including same-path/digest rotations;
      // a completed Idle poll cannot evade the per-context lifetime quota.
      if (entry!.issued >= this.limits.maximum_requests_per_context || this.pending >= 16)
        return fail("FINANCIAL_ASSERTION_CAPACITY_EXHAUSTED", 429);
      // Microtask boundary ensures the cache and pending ownership exist BEFORE
      // candidate.issue starts, even for synchronous re-entry or lost response.
      entry!.issued++; entry!.pending++; this.pending++;
      const pending = Promise.resolve().then(async () => {
        this.current(entry);
        const issued: Issued = await this.candidate.issue({ ...entry!.actor }, { ...binding });
        const own = decodeJwt(issued.token), issuedAt = Number(own.iat) * 1000;
        if (own.jti !== issued.lease_id || own.sub !== entry!.actor.user_id || own.sid !== entry!.actor.session_id ||
          own.session_revision !== entry!.actor.session_generation || own.purpose !== "pma.identity.v1" ||
          own.workspace_id !== s.workspace_id || own.environment !== s.environment || own.workload_id !== s.workload_id ||
          own.request_digest !== binding.request_digest || own.authority_revision !== issued.authority_revision ||
          Number(own.exp) * 1000 !== issued.expires_at_ms)
          return fail("FINANCIAL_ASSERTION_ISSUER_BINDING_INVALID");
        const { body_utf8: _body, ...echo } = request;
        try { return financialSourceAssertionResponse.parse({ ...echo,
          schema_version: "portal.execution.financial-source-assertion-response.v1", assertion: issued.token,
          lease_id: issued.lease_id, issued_at_ms: issuedAt, expires_at_ms: issued.expires_at_ms,
          authority_revision: issued.authority_revision }); }
        catch { return fail("FINANCIAL_ASSERTION_ISSUER_RESPONSE_INVALID"); }
      }).finally(() => { entry!.pending--; this.pending--; this.prune(this.time()); });
      const delivery: Delivery = { sequence: request.delivery_sequence, previous_lease_id: request.previous_lease_id,
        key, binding: { ...binding }, response: pending, completed: false };
      entry!.last = delivery;
      return delivery;
    };
    let delivery: Delivery;
    while (true) {
      const previous = entry!.last;
      if (!previous) {
        if (request.delivery_sequence !== 0 || request.previous_lease_id !== null)
          return fail("FINANCIAL_ASSERTION_DELIVERY_SEQUENCE_INVALID", 409);
        delivery = issueNew(); break;
      }
      if (request.delivery_sequence === previous.sequence) {
        if (key !== previous.key || request.previous_lease_id !== previous.previous_lease_id)
          return fail("FINANCIAL_ASSERTION_DELIVERY_REQUEST_MISMATCH", 409);
        delivery = previous; break;
      }
      if (request.delivery_sequence !== previous.sequence + 1)
        return fail("FINANCIAL_ASSERTION_DELIVERY_SEQUENCE_INVALID", 409);
      if (!previous.completed) return fail("FINANCIAL_ASSERTION_DELIVERY_NOT_COMPLETED", 409);
      const response = await previous.response;
      this.current(entry);
      if (request.previous_lease_id !== response.lease_id) return fail("FINANCIAL_ASSERTION_PREVIOUS_LEASE_MISMATCH", 409);
      // Completion ACK is a historical fact, NOT renewed permission. The next
      // read must freshly authenticate the previous exact terminal custody too.
      const terminal = await this.terminal(entry!, previous.binding, response);
      this.current(entry);
      if (!terminal) return fail("FINANCIAL_ASSERTION_TERMINAL_NOT_CONFIRMED", 409);
      // Compare/swap has no await. Concurrent successors share ONE issuance;
      // different bytes for that same sequence refuse on the next iteration.
      if (entry!.last !== previous) continue;
      delivery = issueNew(); break;
    }
    // Failed/ambiguous acquisition stays on this exact sequence and Promise.
    // A terminal source result does NOT make same-sequence retry a new read.
    const response = await delivery.response;
    this.current(entry);
    await this.candidate.revalidateIssue({ ...entry!.actor }, { ...binding }, this.issued(response));
    this.current(entry);
    if (this.time() >= response.expires_at_ms) return fail("FINANCIAL_ASSERTION_EXPIRED", 403);
    return { ...response };
  }
  /** Only the authenticated pinned Edge transport may call this seam after
   * verifying the exact raw PM envelope. Acquire/send/timeout are NOT completion.
   * A response digest records that explicit acknowledgement, not Core-produced
   * financial proof. This operation never issues a lease or changes source rows.
   */
  async complete(token: string, input: unknown): Promise<FinancialSourceAssertionCompletionResponse> {
    let request: FinancialSourceAssertionCompletionRequest;
    try { request = financialSourceAssertionCompletionRequest.parse(snapshot(input, ["schema_version", "binding_digest", "receiver_id",
      "workload_id", "delivery_sequence", "lease_id", "request_digest", "response_digest"])); }
    catch { return fail("FINANCIAL_ASSERTION_REQUEST_INVALID", 400); }
    if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/u.test(token)) return fail("FINANCIAL_ASSERTION_CONTEXT_REQUIRED", 403);
    const entry = this.contexts.get(token); this.current(entry);
    const s = entry!.selection, delivery = entry!.last;
    if (request.binding_digest !== s.binding_digest || request.receiver_id !== s.receiver_id || request.workload_id !== s.workload_id)
      return fail("FINANCIAL_ASSERTION_BINDING_MISMATCH", 403);
    if (!delivery || request.delivery_sequence !== delivery.sequence || request.request_digest !== delivery.binding.request_digest)
      return fail("FINANCIAL_ASSERTION_COMPLETION_MISMATCH", 409);
    const response = await delivery.response; this.current(entry);
    if (entry!.last !== delivery || request.lease_id !== response.lease_id)
      return fail("FINANCIAL_ASSERTION_COMPLETION_MISMATCH", 409);
    if (delivery.completion && delivery.completion.response_digest !== request.response_digest)
      return fail("FINANCIAL_ASSERTION_COMPLETION_MISMATCH", 409);
    if (!delivery.completion) delivery.completion = { response_digest: request.response_digest };
    const completion = delivery.completion;
    if (!completion.pending) {
      // Coalesce an exact lost-ACK retry. A refused read-only proof may be
      // checked again after SAME-original source recovery, without any ISSUE.
      const pending = Promise.resolve().then(async () => {
        const terminal = await this.terminal(entry!, delivery.binding, response);
        this.current(entry);
        if (entry!.last !== delivery) return fail("FINANCIAL_ASSERTION_COMPLETION_MISMATCH", 409);
        if (!terminal) return fail("FINANCIAL_ASSERTION_TERMINAL_NOT_CONFIRMED", 409);
        delivery.completed = true;
        return financialSourceAssertionCompletionResponse.parse({
          schema_version: "portal.execution.financial-source-assertion-completion-response.v1",
          delivery_sequence: request.delivery_sequence, lease_id: request.lease_id,
          request_digest: request.request_digest, response_digest: request.response_digest, completed: true,
        });
      }).catch(error => { if (!delivery.completed) completion.pending = undefined; throw error; });
      completion.pending = pending;
    }
    const result = await completion.pending; this.current(entry);
    if (entry!.last !== delivery) return fail("FINANCIAL_ASSERTION_COMPLETION_MISMATCH", 409);
    return { ...result };
  }
  private issued(response: FinancialSourceAssertionResponse): Issued {
    return { token: response.assertion, lease_id: response.lease_id, expires_at_ms: response.expires_at_ms,
      authority_revision: response.authority_revision };
  }
  private async terminal(entry: Entry, binding: CurrentHumanBinding, response: FinancialSourceAssertionResponse): Promise<boolean> {
    if (!this.candidate.canReplaceResolvedIssue) return false;
    if (this.pending >= 16) return fail("FINANCIAL_ASSERTION_CAPACITY_EXHAUSTED", 429);
    this.current(entry); entry.pending++; this.pending++;
    try { return await this.candidate.canReplaceResolvedIssue({ ...entry.actor }, { ...binding }, this.issued(response)) === true; }
    finally { entry.pending--; this.pending--; this.prune(this.time()); }
  }
  release(token: string): void { const entry = this.contexts.get(token); if (entry) entry.retired = true; this.prune(this.time()); }
  shutdown(): void { this.stopped = true; for (const entry of this.contexts.values()) entry.retired = true; this.prune(this.time()); }
  snapshot() { return Object.freeze({ contexts: this.contexts.size,
    pending: this.pending, stopped: this.stopped }); }
  private time(): number { const now = this.now(); if (!Number.isSafeInteger(now) || now < 0) return fail("FINANCIAL_ASSERTION_CLOCK_INVALID"); return now; }
  private current(entry: Entry | undefined): void {
    if (this.stopped || !entry || entry.retired || this.time() >= entry.expires)
      fail("FINANCIAL_ASSERTION_CONTEXT_REQUIRED", 403);
  }
  private prune(now: number): void {
    for (const [token, entry] of this.contexts) if (!entry.pending && (entry.retired || now >= entry.expires)) this.contexts.delete(token);
  }
}
