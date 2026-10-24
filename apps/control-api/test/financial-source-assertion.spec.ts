/** Identity orchestration tests. Mock candidate deliberately proves no source
 * proof or connected financial acceptance; real DB candidate tests are separate. */
import { SignJWT, generateKeyPair } from "jose";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { FinancialSourceAssertionAuthority, type FinancialSourceAssertionSelection,
  type FinancialSourceAssertionResponse } from "../src/execution-v2/financial-source-assertion";
import { CurrentHumanLeaseError, type CurrentHumanCandidate } from "../src/execution-v2/current-human-candidate";
import { pmHttpRequestDigest } from "../src/execution-v2/pm-http-request-binding";

const now0 = 1_792_857_600_000;
const paths = ["/financial/dataset", "/financial/series", "/financial/snapshot", "/financial/page", "/financial/delta", "/financial/receipt"];
const actor = { user_id: "TEST_ONLY-user", session_id: "TEST_ONLY-session", session_generation: 3 };
const selection: FinancialSourceAssertionSelection = { workspace_id: "TEST_ONLY-workspace", environment: "paper",
  workload_id: "TEST_ONLY-edge", receiver_id: "TEST_ONLY-receiver", binding_digest: `sha256:${"a".repeat(64)}`, paths };
describe("private financial same-request current-human issuer", () => {
  let key: Awaited<ReturnType<typeof generateKeyPair>>;
  beforeAll(async () => { key = await generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true }); });
  function fixture(maxRequests = 64) {
    let now = now0, index = 0;
    const candidate = { issue: vi.fn(async (a, b) => {
      const lease = `TEST_ONLY-lease-${++index}`, iat = Math.floor(now / 1000), exp = iat + 30;
      const token = await new SignJWT({ ...b, purpose: "pma.identity.v1", sub: a.user_id, sid: a.session_id,
        session_revision: a.session_generation, authority_revision: 2, jti: lease, iat, exp })
        .setProtectedHeader({ alg: "EdDSA" }).sign(key.privateKey);
      return { token, lease_id: lease, expires_at_ms: exp * 1000, authority_revision: 2 };
    }), revalidateIssue: vi.fn(async (..._args: Parameters<CurrentHumanCandidate["revalidateIssue"]>) => undefined),
      canReplaceResolvedIssue: vi.fn(async (..._args: Parameters<CurrentHumanCandidate["revalidateIssue"]>) => false) };
    const authority = new FinancialSourceAssertionAuthority(candidate, { ttl_ms: 60_000, maximum_contexts: 2,
      maximum_requests_per_context: maxRequests }, () => now);
    const registered = authority.register(actor, selection);
    return { candidate, authority, registered, time: (value: number) => { now = value; } };
  }
  const request = (body = "{}", path = paths[0]!, delivery_sequence = 0, previous_lease_id: string | null = null) => ({
    schema_version: "portal.execution.financial-source-assertion-request.v1", binding_digest: selection.binding_digest,
    receiver_id: selection.receiver_id, workload_id: selection.workload_id, method: "POST", path, body_utf8: body,
    delivery_sequence, previous_lease_id,
    request_digest: pmHttpRequestDigest({ method: "POST", raw_path: Buffer.from(path), query_string: Buffer.alloc(0),
      body: Buffer.from(body) }, { request_bytes: 1_048_576 }) });
  const completion = (response: FinancialSourceAssertionResponse, response_digest = `sha256:${"e".repeat(64)}`) => ({
    schema_version: "portal.execution.financial-source-assertion-completion-request.v1", binding_digest: selection.binding_digest,
    receiver_id: selection.receiver_id, workload_id: selection.workload_id, delivery_sequence: response.delivery_sequence,
    lease_id: response.lease_id, request_digest: response.request_digest, response_digest,
  });
  async function completed(f: ReturnType<typeof fixture>, response: FinancialSourceAssertionResponse) {
    f.candidate.canReplaceResolvedIssue.mockResolvedValue(true);
    return f.authority.complete(f.registered.original_context, completion(response));
  }
  it("binds the actual server actor to exact PM bytes; no body in response", async () => {
    const f = fixture(), input = request('{"a": 1}');
    const result = await f.authority.issue(f.registered.original_context, input);
    expect(result).toMatchObject({ schema_version: "portal.execution.financial-source-assertion-response.v1",
      lease_id: "TEST_ONLY-lease-1", request_digest: input.request_digest, issued_at_ms: now0, expires_at_ms: now0 + 30_000 });
    expect(result).not.toHaveProperty("body_utf8");
    expect(f.candidate.issue).toHaveBeenCalledWith(actor, { workspace_id: selection.workspace_id, environment: "paper",
      workload_id: selection.workload_id, request_digest: input.request_digest });
    expect(f.candidate.revalidateIssue).toHaveBeenCalledOnce();
  });
  it("coalesces concurrent/lost-response retry to the original lease, without renewal", async () => {
    const f = fixture(), input = request();
    const results = await Promise.all(Array.from({ length: 5 }, () => f.authority.issue(f.registered.original_context, input)));
    expect(f.candidate.issue).toHaveBeenCalledOnce();
    expect(new Set(results.map(result => result.assertion)).size).toBe(1);
    expect(f.candidate.revalidateIssue).toHaveBeenCalledTimes(5);
    f.time(now0 + 30_000);
    await expect(f.authority.issue(f.registered.original_context, input)).rejects.toMatchObject({ code: "FINANCIAL_ASSERTION_EXPIRED" });
    expect(f.candidate.issue).toHaveBeenCalledOnce();
  });
  it("keeps ambiguous issue failure in original context; retry never creates a second lease", async () => {
    const f = fixture(); f.candidate.issue.mockRejectedValueOnce(new Error("TEST_ONLY ambiguous DB/signing outcome"));
    for (let i = 0; i < 2; i++) await expect(f.authority.issue(f.registered.original_context, request())).rejects.toThrow();
    expect(f.candidate.issue).toHaveBeenCalledOnce(); expect(f.authority.snapshot().pending).toBe(0);
  });
  it("rechecks current session/authority on a cached retry", async () => {
    const f = fixture(); await f.authority.issue(f.registered.original_context, request());
    f.candidate.revalidateIssue.mockRejectedValueOnce(new Error("TEST_ONLY revoked"));
    await expect(f.authority.issue(f.registered.original_context, request())).rejects.toThrow("revoked");
    expect(f.candidate.issue).toHaveBeenCalledOnce();
  });
  it.each(["binding_digest", "receiver_id", "workload_id", "path", "request_digest"])("refuses mismatched %s before candidate I/O", async field => {
    const f = fixture(), input = { ...request(), [field]: field.includes("digest") ? `sha256:${"f".repeat(64)}` : field === "path" ? "/mutate" : "wrong" };
    await expect(f.authority.issue(f.registered.original_context, input)).rejects.toThrow();
    expect(f.candidate.issue).not.toHaveBeenCalled();
  });
  it("refuses changed serialized bytes on the same pending sequence instead of creating another identity", async () => {
    const f = fixture(1); await f.authority.issue(f.registered.original_context, request('{"a":1}'));
    await expect(f.authority.issue(f.registered.original_context, request('{"a": 1}'))).rejects.toMatchObject({ code: "FINANCIAL_ASSERTION_DELIVERY_REQUEST_MISMATCH" });
    expect(f.candidate.issue).toHaveBeenCalledOnce();
  });
  it.each(["actor", "cookie", "unknown"])("rejects client-selected %s and accessors", async field => {
    const f = fixture();
    await expect(f.authority.issue(f.registered.original_context, { ...request(), [field]: "no" })).rejects.toThrow();
    const input = request(); Object.defineProperty(input, "body_utf8", { get() { throw new Error("ACCESSOR MUST NOT RUN"); } });
    await expect(f.authority.issue(f.registered.original_context, input)).rejects.not.toThrow("ACCESSOR MUST NOT RUN");
    expect(f.candidate.issue).not.toHaveBeenCalled();
  });
  it("refuses stale context and process-restart context without replacing it", async () => {
    const f = fixture(); f.time(now0 + 60_000);
    await expect(f.authority.issue(f.registered.original_context, request())).rejects.toThrow();
    const g = fixture();
    await expect(g.authority.issue(f.registered.original_context, request())).rejects.toThrow();
    expect(f.candidate.issue).not.toHaveBeenCalled(); expect(g.candidate.issue).not.toHaveBeenCalled();
  });
  it("tracks pending issue through retirement/shutdown; never clears source custody", async () => {
    const f = fixture(); let finish!: (value: never) => void;
    f.candidate.issue.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const result = f.authority.issue(f.registered.original_context, request()).catch(error => error);
    await Promise.resolve(); expect(f.authority.snapshot().pending).toBe(1);
    f.authority.shutdown(); expect(f.authority.snapshot()).toMatchObject({ pending: 1, contexts: 1, stopped: true });
    finish({ token: "TEST_ONLY-invalid", lease_id: "TEST_ONLY", expires_at_ms: now0 + 30_000, authority_revision: 2 } as never);
    await result; expect(f.authority.snapshot()).toMatchObject({ pending: 0, contexts: 0 });
    expect(Object.keys(f.candidate).sort()).toEqual(["canReplaceResolvedIssue", "issue", "revalidateIssue"]);
  });
  it.each(["COMMITTED", "ROLLED_BACK"])("supports two identical empty polls only after explicit completion and real %s proof", async _phase => {
    const f = fixture(), first = await f.authority.issue(f.registered.original_context, request());
    const ack = await completed(f, first);
    expect(ack).toMatchObject({ completed: true, delivery_sequence: 0, lease_id: first.lease_id,
      response_digest: completion(first).response_digest });
    const second = await f.authority.issue(f.registered.original_context, request("{}", paths[0], 1, first.lease_id));
    await completed(f, second);
    expect(second).toMatchObject({ delivery_sequence: 1, previous_lease_id: first.lease_id, lease_id: "TEST_ONLY-lease-2" });
    expect(f.candidate.issue).toHaveBeenCalledTimes(2);
    expect(f.candidate.canReplaceResolvedIssue).toHaveBeenCalledWith(actor, expect.objectContaining({
      workspace_id: selection.workspace_id, workload_id: selection.workload_id, request_digest: first.request_digest }), {
      token: first.assertion, lease_id: first.lease_id, expires_at_ms: first.expires_at_ms, authority_revision: first.authority_revision });
  });
  it("does not turn lost PM response plus COMMITTED source into a new read or automatic completion", async () => {
    const f = fixture(), first = await f.authority.issue(f.registered.original_context, request());
    f.candidate.canReplaceResolvedIssue.mockResolvedValue(true);
    f.candidate.revalidateIssue.mockRejectedValue(new CurrentHumanLeaseError("CURRENT_HUMAN_ENTRY_NOT_AVAILABLE"));
    await expect(f.authority.issue(f.registered.original_context, request())).rejects.toMatchObject({ code: "CURRENT_HUMAN_ENTRY_NOT_AVAILABLE" });
    await expect(f.authority.issue(f.registered.original_context, request("{}", paths[0], 1, first.lease_id)))
      .rejects.toMatchObject({ code: "FINANCIAL_ASSERTION_DELIVERY_NOT_COMPLETED" });
    expect(f.candidate.issue).toHaveBeenCalledOnce(); expect(f.candidate.canReplaceResolvedIssue).not.toHaveBeenCalled();
  });
  it("coalesces concurrent explicit successors into one new issuance", async () => {
    const f = fixture(), first = await f.authority.issue(f.registered.original_context, request()); await completed(f, first);
    const next = request("{}", paths[0], 1, first.lease_id);
    const results = await Promise.all(Array.from({ length: 8 }, () => f.authority.issue(f.registered.original_context, next)));
    expect(f.candidate.issue).toHaveBeenCalledTimes(2);
    expect(new Set(results.map(result => result.lease_id))).toEqual(new Set(["TEST_ONLY-lease-2"]));
  });
  it("does not permit a second body/path for the same sequence even after completion", async () => {
    const f = fixture(), first = await f.authority.issue(f.registered.original_context, request()); await completed(f, first);
    for (const changed of [request('{"cursor":"changed"}'), request("{}", paths[1])])
      await expect(f.authority.issue(f.registered.original_context, changed))
        .rejects.toMatchObject({ code: "FINANCIAL_ASSERTION_DELIVERY_REQUEST_MISMATCH" });
    expect(f.candidate.issue).toHaveBeenCalledOnce();
  });
  it("allows next sequence to select different whitelisted bytes only with the exact completed predecessor", async () => {
    const f = fixture(), first = await f.authority.issue(f.registered.original_context, request()); await completed(f, first);
    const next = request('{"cursor":"next"}', paths[1], 1, first.lease_id);
    expect(await f.authority.issue(f.registered.original_context, next)).toMatchObject({ delivery_sequence: 1, path: paths[1], request_digest: next.request_digest });
  });
  it.each(["ISSUED", "ENTERED", "UNKNOWN", "RETIRED", "EXPIRED_ONLY", "DRAIN", "CHANGED_ACTOR"])("cannot complete %s without authenticated terminal proof", async _state => {
    const f = fixture(), first = await f.authority.issue(f.registered.original_context, request());
    await expect(f.authority.complete(f.registered.original_context, completion(first)))
      .rejects.toMatchObject({ code: "FINANCIAL_ASSERTION_TERMINAL_NOT_CONFIRMED" });
    await expect(f.authority.issue(f.registered.original_context, request("{}", paths[0], 1, first.lease_id)))
      .rejects.toMatchObject({ code: "FINANCIAL_ASSERTION_DELIVERY_NOT_COMPLETED" });
    expect(f.candidate.issue).toHaveBeenCalledOnce();
  });
  it("can retry the SAME completion after original source recovery, without a new issuance", async () => {
    const f = fixture(), first = await f.authority.issue(f.registered.original_context, request()), body = completion(first);
    await expect(f.authority.complete(f.registered.original_context, body)).rejects.toMatchObject({ code: "FINANCIAL_ASSERTION_TERMINAL_NOT_CONFIRMED" });
    f.candidate.canReplaceResolvedIssue.mockResolvedValue(true);
    expect(await f.authority.complete(f.registered.original_context, body)).toMatchObject({ completed: true, lease_id: first.lease_id });
    expect(f.candidate.issue).toHaveBeenCalledOnce();
  });
  it("coalesces and idempotently replays the exact completion ACK after response loss", async () => {
    const f = fixture(), first = await f.authority.issue(f.registered.original_context, request()); f.candidate.canReplaceResolvedIssue.mockResolvedValue(true);
    const body = completion(first), acks = await Promise.all(Array.from({ length: 5 }, () => f.authority.complete(f.registered.original_context, body)));
    expect(acks.every(ack => JSON.stringify(ack) === JSON.stringify(acks[0]))).toBe(true);
    expect(await f.authority.complete(f.registered.original_context, body)).toEqual(acks[0]);
    expect(f.candidate.canReplaceResolvedIssue).toHaveBeenCalledOnce(); expect(f.candidate.issue).toHaveBeenCalledOnce();
  });
  it.each(["delivery_sequence", "lease_id", "request_digest", "response_digest"])("refuses changing completion %s after ACK", async field => {
    const f = fixture(), first = await f.authority.issue(f.registered.original_context, request()); await completed(f, first);
    const body = { ...completion(first), [field]: field === "delivery_sequence" ? 1 : field.endsWith("digest") ? `sha256:${"f".repeat(64)}` : "wrong" };
    await expect(f.authority.complete(f.registered.original_context, body)).rejects.toMatchObject({ code: "FINANCIAL_ASSERTION_COMPLETION_MISMATCH" });
    expect(f.candidate.issue).toHaveBeenCalledOnce();
  });
  it.each(["binding_digest", "receiver_id", "workload_id"])("refuses completion selected from another %s", async field => {
    const f = fixture(), first = await f.authority.issue(f.registered.original_context, request());
    await expect(f.authority.complete(f.registered.original_context, { ...completion(first), [field]: field.endsWith("digest") ? `sha256:${"f".repeat(64)}` : "wrong" }))
      .rejects.toMatchObject({ code: "FINANCIAL_ASSERTION_BINDING_MISMATCH" });
    expect(f.candidate.canReplaceResolvedIssue).not.toHaveBeenCalled();
  });
  it("requires a response digest and rejects extra/client actor fields on completion", async () => {
    const f = fixture(), first = await f.authority.issue(f.registered.original_context, request()), body = completion(first);
    const { response_digest: _digest, ...missing } = body;
    for (const invalid of [missing, { ...body, actor }, { ...body, response_digest: "not-a-digest" }])
      await expect(f.authority.complete(f.registered.original_context, invalid)).rejects.toMatchObject({ code: "FINANCIAL_ASSERTION_REQUEST_INVALID" });
    expect(f.candidate.canReplaceResolvedIssue).not.toHaveBeenCalled();
  });
  it("rejects completion without a prior delivery and stale prior completion after successor", async () => {
    const f = fixture(), g = fixture(), first = await f.authority.issue(f.registered.original_context, request());
    await expect(g.authority.complete(g.registered.original_context, completion(first))).rejects.toMatchObject({ code: "FINANCIAL_ASSERTION_COMPLETION_MISMATCH" });
    await completed(f, first); await f.authority.issue(f.registered.original_context, request("{}", paths[0], 1, first.lease_id));
    await expect(f.authority.complete(f.registered.original_context, completion(first))).rejects.toMatchObject({ code: "FINANCIAL_ASSERTION_COMPLETION_MISMATCH" });
  });
  it("does not use a cached completion ACK as renewed authority", async () => {
    const f = fixture(), first = await f.authority.issue(f.registered.original_context, request()); await completed(f, first);
    f.candidate.canReplaceResolvedIssue.mockResolvedValue(false);
    expect((await f.authority.complete(f.registered.original_context, completion(first))).completed).toBe(true);
    await expect(f.authority.issue(f.registered.original_context, request("{}", paths[0], 1, first.lease_id)))
      .rejects.toMatchObject({ code: "FINANCIAL_ASSERTION_TERMINAL_NOT_CONFIRMED" });
    expect(f.candidate.issue).toHaveBeenCalledOnce();
  });
  it("keeps older/test candidates without a terminal-proof method fail-closed", async () => {
    const f = fixture(), first = await f.authority.issue(f.registered.original_context, request()); Reflect.deleteProperty(f.candidate, "canReplaceResolvedIssue");
    await expect(f.authority.complete(f.registered.original_context, completion(first))).rejects.toMatchObject({ code: "FINANCIAL_ASSERTION_TERMINAL_NOT_CONFIRMED" });
    expect(f.candidate.issue).toHaveBeenCalledOnce();
  });
  it.each([{ sequence: 1, previous: null }, { sequence: 0, previous: "wrong" }, { sequence: 2, previous: "wrong" }])
    ("requires initial sequence zero and no predecessor: %j", async input => {
      const f = fixture(); await expect(f.authority.issue(f.registered.original_context, request("{}", paths[0], input.sequence, input.previous)))
        .rejects.toMatchObject({ code: "FINANCIAL_ASSERTION_DELIVERY_SEQUENCE_INVALID" });
      expect(f.candidate.issue).not.toHaveBeenCalled();
    });
  it("requires exactly the next sequence and original predecessor lease", async () => {
    const f = fixture(), first = await f.authority.issue(f.registered.original_context, request()); await completed(f, first);
    await expect(f.authority.issue(f.registered.original_context, request("{}", paths[0], 2, first.lease_id)))
      .rejects.toMatchObject({ code: "FINANCIAL_ASSERTION_DELIVERY_SEQUENCE_INVALID" });
    await expect(f.authority.issue(f.registered.original_context, request("{}", paths[0], 1, "wrong")))
      .rejects.toMatchObject({ code: "FINANCIAL_ASSERTION_PREVIOUS_LEASE_MISMATCH" });
    expect(f.candidate.issue).toHaveBeenCalledOnce();
  });
  it("counts all explicitly completed successors against the lifetime quota", async () => {
    const f = fixture(2), first = await f.authority.issue(f.registered.original_context, request()); await completed(f, first);
    const second = await f.authority.issue(f.registered.original_context, request("{}", paths[0], 1, first.lease_id)); await completed(f, second);
    await expect(f.authority.issue(f.registered.original_context, request("{}", paths[0], 2, second.lease_id)))
      .rejects.toMatchObject({ code: "FINANCIAL_ASSERTION_CAPACITY_EXHAUSTED" });
    expect(f.candidate.issue).toHaveBeenCalledTimes(2);
  });
  it("never replaces an ambiguous failed successor acquisition on later polls", async () => {
    const f = fixture(), first = await f.authority.issue(f.registered.original_context, request()); await completed(f, first);
    const ambiguous = new Error("TEST_ONLY-successor-outcome-unknown"); f.candidate.issue.mockRejectedValueOnce(ambiguous);
    const next = request("{}", paths[0], 1, first.lease_id);
    for (let i = 0; i < 2; i++) await expect(f.authority.issue(f.registered.original_context, next)).rejects.toBe(ambiguous);
    expect(f.candidate.issue).toHaveBeenCalledTimes(2);
  });
  it("requires explicit completion AND terminal proof after old JWT expiry, not expiry alone", async () => {
    const f = fixture(), first = await f.authority.issue(f.registered.original_context, request()); f.time(now0 + 31_000);
    await expect(f.authority.issue(f.registered.original_context, request("{}", paths[0], 1, first.lease_id)))
      .rejects.toMatchObject({ code: "FINANCIAL_ASSERTION_DELIVERY_NOT_COMPLETED" });
    await completed(f, first);
    expect((await f.authority.issue(f.registered.original_context, request("{}", paths[0], 1, first.lease_id))).lease_id).toBe("TEST_ONLY-lease-2");
  });
  it("retirement during completion proof keeps DB custody counted and prevents a late ACK or successor", async () => {
    const f = fixture(), first = await f.authority.issue(f.registered.original_context, request()); let settle!: (value: boolean) => void;
    f.candidate.canReplaceResolvedIssue.mockImplementationOnce(() => new Promise(resolve => { settle = resolve; }));
    const pending = f.authority.complete(f.registered.original_context, completion(first)).catch(error => error);
    await vi.waitFor(() => expect(settle).toBeTypeOf("function"));
    f.authority.shutdown(); expect(f.authority.snapshot()).toMatchObject({ contexts: 1, pending: 1, stopped: true }); settle(true);
    expect(await pending).toMatchObject({ code: "FINANCIAL_ASSERTION_CONTEXT_REQUIRED" });
    expect(f.authority.snapshot()).toMatchObject({ contexts: 0, pending: 0 }); expect(f.candidate.issue).toHaveBeenCalledOnce();
  });
});
