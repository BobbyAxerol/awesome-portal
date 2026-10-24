/** TEST_ONLY coordinator/transport doubles. Exercises real mutation selection
 * and durable-state predicates, not a real PG/source terminal receipt. */
import { EventEmitter } from "node:events";
import { generateKeyPairSync } from "node:crypto";
import type { Pool } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CurrentHumanCandidate } from "../src/execution-v2/current-human-candidate";
import { CurrentHumanMutations, type CurrentHumanRecoveryAttempt, type CurrentHumanReverseRecoveryParticipant } from "../src/execution-v2/current-human-mutations";
import { FinancialSourceComposition, type FinancialSourceCompositionConfig } from "../src/execution-v2/financial-source-composition";

vi.mock("../src/execution-v2/current-human-transport", () => ({ createCurrentHumanTransport: () => ({ server: Object.assign(new EventEmitter(), { address: () => null }), snapshot: () => ({ in_flight: 0 }) }) }));
vi.mock("../src/execution-v2/financial-source-assertion-transport", () => ({ createFinancialSourceAssertionTransport: () => ({ server: Object.assign(new EventEmitter(), { address: () => null }), snapshot: () => ({ in_flight: 0 }) }) }));
const limits = { maximum_intents: 16, maximum_recoveries_per_request: 2 };
const attempt = (lease: string, workload = "TEST_ONLY-financial"): CurrentHumanRecoveryAttempt => ({
  lease_id: lease, attempt_id: `TEST_ONLY-attempt-${lease}`, workspace_id: "TEST_ONLY-workspace", environment: "paper",
  workload_id: workload, request_digest: `sha256:${"a".repeat(64)}`, human_issuer: "TEST_ONLY-core", subject: "TEST_ONLY-user",
  session_id: "TEST_ONLY-session", session_revision: 1, authority_revision: 2, expires_at: 100,
});
function fixture() {
  let pending = 0, unknown = 0;
  const query = vi.fn(async (sql: string) => {
    if (sql.includes("SELECT * FROM elp210_candidate.mutations")) return { rows: [{ mutation_id: "TEST_ONLY-mutation", state: "PENDING" }], rowCount: 1 };
    if (sql.includes("count(*)::int AS n")) return { rows: [{ n: pending, unknown }], rowCount: 1 };
    if (sql.includes("SELECT drain_id FROM")) return { rows: [{ drain_id: "TEST_ONLY-mutation" }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  });
  const release = vi.fn(), pool = { connect: vi.fn(async () => ({ query, release })) } as unknown as Pool;
  const enumerate = vi.fn(async () => [] as Awaited<ReturnType<CurrentHumanCandidate["recoverableObligations"]>>);
  const candidate = { usesPool: vi.fn((selected: Pool) => selected === pool), recoverableObligations: enumerate } as unknown as CurrentHumanCandidate;
  const fallback = { recover: vi.fn(async () => ({ untrusted_ack_only: true })) };
  const participant = (workload = "TEST_ONLY-financial", selected = pool) => {
    const enumerator = vi.fn(async () => [{ family: "REVERSE_HUMAN" as const, attempt: attempt("one", workload) }]);
    const recovery = { recover: vi.fn(async (_original: CurrentHumanRecoveryAttempt): Promise<unknown> => ({ untrusted_ack_only: true })) };
    const candidate = { usesPool: vi.fn((actual: Pool) => actual === selected), recoverableObligations: enumerator };
    return { candidate, workload_id: workload, recovery } satisfies CurrentHumanReverseRecoveryParticipant;
  };
  return { pool, candidate, enumerate, query, release, fallback, participant,
    durable: (n: number, u = 0) => { pending = n; unknown = u; } };
}
afterEach(() => vi.restoreAllMocks());
describe("explicit financial participation in the shared mutation coordinator", () => {
  it("keeps absent registration on the existing recovery path", async () => {
    const f = fixture(), original = attempt("legacy", "TEST_ONLY-legacy");
    f.enumerate.mockResolvedValue([{ family: "REVERSE_HUMAN", attempt: original }]);
    const mutations = new CurrentHumanMutations(f.pool, f.candidate, f.fallback, limits);
    await expect(mutations.recoverAbandoned("TEST_ONLY-mutation")).resolves.toEqual({ state: "ABORTED" });
    expect(f.enumerate).toHaveBeenCalledExactlyOnceWith("REVERSE_ONLY");
    expect(f.fallback.recover).toHaveBeenCalledExactlyOnceWith(original);
  });
  it("uses the same registered candidate and passes its original attempt unchanged", async () => {
    const f = fixture(), participant = f.participant(), original = attempt("one");
    participant.candidate.recoverableObligations.mockResolvedValue([{ family: "REVERSE_HUMAN", attempt: original }]);
    const mutations = new CurrentHumanMutations(f.pool, f.candidate, f.fallback, limits, undefined, [participant]);
    await expect(mutations.recoverAbandoned("TEST_ONLY-mutation")).resolves.toEqual({ state: "ABORTED" });
    expect(participant.candidate.recoverableObligations).toHaveBeenCalledExactlyOnceWith("REVERSE_ONLY");
    expect(participant.recovery.recover.mock.calls[0]![0]).toBe(original); expect(f.fallback.recover).not.toHaveBeenCalled();
  });
  it("proves exact candidate/workload/recovery registration in this coordinator, not a similarly shaped dependency", () => {
    const f = fixture(), participant = f.participant();
    const mutations = new CurrentHumanMutations(f.pool, f.candidate, f.fallback, limits, undefined, [participant]);
    expect(mutations.hasReverseRecoveryParticipant(participant)).toBe(true);
    expect(mutations.hasReverseRecoveryParticipant({ ...participant })).toBe(true);
    expect(mutations.hasReverseRecoveryParticipant({ ...participant, workload_id: "different" })).toBe(false);
    expect(mutations.hasReverseRecoveryParticipant({ ...participant, candidate: f.participant().candidate })).toBe(false);
    expect(mutations.hasReverseRecoveryParticipant({ ...participant, recovery: { recover: participant.recovery.recover } })).toBe(false);
    expect(new CurrentHumanMutations(f.pool, f.candidate, f.fallback, limits).hasReverseRecoveryParticipant(participant)).toBe(false);
    expect(f.enumerate).not.toHaveBeenCalled(); expect(participant.recovery.recover).not.toHaveBeenCalled();
  });
  it("does not mistake any successful source ACK for settled durable custody", async () => {
    const f = fixture(), participant = f.participant(); f.durable(1);
    const mutations = new CurrentHumanMutations(f.pool, f.candidate, f.fallback, limits, undefined, [participant]);
    await expect(mutations.recoverAbandoned("TEST_ONLY-mutation")).resolves.toEqual({ state: "DRAIN_PENDING" });
    expect(participant.recovery.recover).toHaveBeenCalledOnce();
    expect(f.query.mock.calls.some(([sql]) => sql.includes("UPDATE elp210_candidate.mutations"))).toBe(false);
  });
  it("preserves global UNKNOWN even when every registered port reports success", async () => {
    const f = fixture(), participant = f.participant(); f.durable(1, 1);
    const mutations = new CurrentHumanMutations(f.pool, f.candidate, f.fallback, limits, undefined, [participant]);
    await expect(mutations.recoverAbandoned("TEST_ONLY-mutation")).resolves.toEqual({ state: "DRAIN_UNKNOWN" });
    expect(f.query.mock.calls.some(([sql]) => sql.includes("UPDATE elp210_candidate.mutations"))).toBe(false);
  });
  it("only releases the drain after the actual durable global state is settled", async () => {
    const f = fixture(), participant = f.participant(); f.durable(1);
    participant.recovery.recover.mockImplementation(async () => { f.durable(0); return { ignored_ack: true }; });
    const mutations = new CurrentHumanMutations(f.pool, f.candidate, f.fallback, limits, undefined, [participant]);
    await expect(mutations.recoverAbandoned("TEST_ONLY-mutation")).resolves.toEqual({ state: "ABORTED" });
    expect(f.query.mock.calls.some(([sql]) => sql.includes("UPDATE elp210_candidate.authority SET drain_id=NULL"))).toBe(true);
  });
  it("rejects duplicate workload/candidate, wrong pool and over-cap registration before source calls", () => {
    const f = fixture(), first = f.participant(), second = f.participant("TEST_ONLY-second");
    for (const entries of [[first, f.participant()], [first, { ...second, candidate: first.candidate }],
      [{ ...first, candidate: f.candidate }], [f.participant("TEST_ONLY-financial", {} as Pool)],
      Array.from({ length: 17 }, (_, i) => f.participant(`TEST_ONLY-${i}`))])
      expect(() => new CurrentHumanMutations(f.pool, f.candidate, f.fallback, limits, undefined, entries))
        .toThrowError(expect.objectContaining({ code: "CURRENT_HUMAN_MUTATION_CONFIG_INVALID" }));
    expect(first.recovery.recover).not.toHaveBeenCalled(); expect(f.enumerate).not.toHaveBeenCalled();
  });
  it.each(["workload", "native", "malformed", "oversized"])("refuses %s enumeration before ANY source dispatch", async kind => {
    const f = fixture(), participant = f.participant();
    const bad = kind === "workload" ? [{ family: "REVERSE_HUMAN", attempt: attempt("one", "wrong") }] :
      kind === "native" ? [{ family: "NATIVE_READ", attempt: attempt("one") }] :
      kind === "oversized" ? Array.from({ length: 129 }, (_, i) => ({ family: "REVERSE_HUMAN", attempt: attempt(`${i}`) })) :
      [{ family: "REVERSE_HUMAN", attempt: { ...attempt("one"), session_revision: -1 } }];
    participant.candidate.recoverableObligations.mockResolvedValue(bad as never);
    const mutations = new CurrentHumanMutations(f.pool, f.candidate, f.fallback, limits, undefined, [participant]);
    await expect(mutations.recoverAbandoned("TEST_ONLY-mutation")).rejects.toMatchObject({ code: "CURRENT_HUMAN_MUTATION_RECOVERY_INVALID" });
    expect(participant.recovery.recover).not.toHaveBeenCalled(); expect(f.fallback.recover).not.toHaveBeenCalled();
  });
  it("deduplicates identical original custody and routes it through the explicit port only once", async () => {
    const f = fixture(), participant = f.participant(), original = attempt("one");
    f.enumerate.mockResolvedValue([{ family: "REVERSE_HUMAN", attempt: original }]);
    const mutations = new CurrentHumanMutations(f.pool, f.candidate, f.fallback, limits, undefined, [participant]);
    await mutations.recoverAbandoned("TEST_ONLY-mutation");
    expect(participant.recovery.recover).toHaveBeenCalledOnce(); expect(f.fallback.recover).not.toHaveBeenCalled();
  });
  it("refuses conflicting duplicate original binding before any source request", async () => {
    const f = fixture(), participant = f.participant();
    f.enumerate.mockResolvedValue([{ family: "REVERSE_HUMAN", attempt: { ...attempt("one"), request_digest: `sha256:${"f".repeat(64)}` } }]);
    const mutations = new CurrentHumanMutations(f.pool, f.candidate, f.fallback, limits, undefined, [participant]);
    await expect(mutations.recoverAbandoned("TEST_ONLY-mutation")).rejects.toMatchObject({ code: "CURRENT_HUMAN_MUTATION_RECOVERY_INVALID" });
    expect(participant.recovery.recover).not.toHaveBeenCalled(); expect(f.fallback.recover).not.toHaveBeenCalled();
  });
  it("keeps the single recovery-call budget across native/legacy/financial participants", async () => {
    const f = fixture(), first = f.participant(), second = f.participant("TEST_ONLY-second"), native = { recover: vi.fn(async () => undefined) };
    second.candidate.recoverableObligations.mockResolvedValue([{ family: "REVERSE_HUMAN", attempt: attempt("two", second.workload_id) }]);
    f.enumerate.mockResolvedValue([{ family: "NATIVE_READ", attempt: { lease_id: "native" } as never }]);
    const mutations = new CurrentHumanMutations(f.pool, f.candidate, f.fallback, limits, native, [first, second]);
    await mutations.recoverAbandoned("TEST_ONLY-mutation");
    expect(f.enumerate).toHaveBeenCalledExactlyOnceWith("BOTH"); expect(native.recover).toHaveBeenCalledOnce();
    expect(first.recovery.recover).toHaveBeenCalledOnce(); expect(second.recovery.recover).not.toHaveBeenCalled();
  });
  it("retains unknown custody when the genuine recovery port refuses or is unavailable", async () => {
    const f = fixture(), participant = f.participant(); f.durable(1, 1);
    participant.recovery.recover.mockRejectedValue(Error("TEST_ONLY-source-unavailable"));
    const mutations = new CurrentHumanMutations(f.pool, f.candidate, f.fallback, limits, undefined, [participant]);
    await expect(mutations.recoverAbandoned("TEST_ONLY-mutation")).resolves.toEqual({ state: "DRAIN_UNKNOWN" });
  });
  it("does not let repeatedly unavailable/UNKNOWN native attempts starve another workload", async () => {
    const f = fixture(), participant = f.participant(), original = attempt("one"); f.durable(1, 1);
    participant.candidate.recoverableObligations.mockResolvedValue([{ family: "REVERSE_HUMAN", attempt: original }]);
    const native = { recover: vi.fn(async () => { throw Error("TEST_ONLY-source-unavailable"); }) };
    f.enumerate.mockResolvedValue([{ family: "NATIVE_READ", attempt: { lease_id: "native" } as never }]);
    const mutations = new CurrentHumanMutations(f.pool, f.candidate, f.fallback,
      { ...limits, maximum_recoveries_per_request: 1 }, native, [participant]);
    await expect(mutations.recoverAbandoned("TEST_ONLY-mutation")).resolves.toEqual({ state: "DRAIN_UNKNOWN" });
    expect(native.recover).toHaveBeenCalledOnce(); expect(participant.recovery.recover).not.toHaveBeenCalled();
    await expect(mutations.recoverAbandoned("TEST_ONLY-mutation")).resolves.toEqual({ state: "DRAIN_UNKNOWN" });
    expect(participant.recovery.recover).toHaveBeenCalledExactlyOnceWith(original);
    expect(native.recover).toHaveBeenCalledOnce();
    // Removed previous key and a new enumeration order still preserve fairness.
    participant.candidate.recoverableObligations.mockResolvedValue([]);
    await mutations.recoverAbandoned("TEST_ONLY-mutation"); expect(native.recover).toHaveBeenCalledTimes(2);
    expect(f.query.mock.calls.some(([sql]) => sql.includes("UPDATE elp210_candidate.authority SET drain_id=NULL"))).toBe(false);
  });
});
describe("financial composition recovery registration", () => {
  it("exports its already-created candidate without constructing or issuing another one", async () => {
    const f = fixture(), create = vi.spyOn(CurrentHumanCandidate, "create").mockResolvedValue(f.candidate);
    const key = generateKeyPairSync("ed25519"), workload = "TEST_ONLY-financial";
    const config: FinancialSourceCompositionConfig = {
      candidate: { issuer: "TEST_ONLY-core", audience: "TEST_ONLY-pm", key_id: "TEST_ONLY-core-key", private_key: key.privateKey,
        source: { issuer: "TEST_ONLY-pm", audience: "TEST_ONLY-core", key_id: "TEST_ONLY-source-key", public_key: key.publicKey, workload_id: workload },
        limits: { ttl_ms: 1000, maximum_unresolved: 1, maximum_retained: 16 },
        installation_scope: { workspace_id: "TEST_ONLY-workspace", environment: "paper", valid_until_ms: 1 } },
      assertion_limits: { ttl_ms: 1000, maximum_contexts: 1, maximum_requests_per_context: 1 },
      assertion_transport: { tls: { key: "TEST_ONLY", cert: "TEST_ONLY", ca: "TEST_ONLY" },
        peer: { certificate_sha256: `sha256:${"a".repeat(64)}`, dns_name: "TEST_ONLY.test", workload_id: workload },
        limits: { maximum_in_flight: 1, request_bytes: 1024, response_bytes: 1024, deadline_ms: 1000 } },
      current_human_transport: { tls: { key: "TEST_ONLY", cert: "TEST_ONLY", ca: "TEST_ONLY" }, source_certificate_sha256: `sha256:${"b".repeat(64)}`,
        limits: { maximum_in_flight: 1, request_bytes: 1024, deadline_ms: 1000 } },
      source_selection: { workspace_id: "TEST_ONLY-workspace", environment: "paper", workload_id: workload, receiver_id: "TEST_ONLY-receiver",
        binding_digest: `sha256:${"c".repeat(64)}`, paths: ["/one", "/two", "/three", "/four", "/five", "/six"] }, shutdown_deadline_ms: 1000,
    };
    const composition = await FinancialSourceComposition.create(f.pool, config), participant = composition.reverseRecoveryParticipant(f.fallback);
    expect(create).toHaveBeenCalledOnce(); expect(participant.candidate).toBe(f.candidate);
    expect(participant.workload_id).toBe(workload); expect(participant.recovery).toBe(f.fallback);
    expect(composition.snapshot()).toMatchObject({ state: "CREATED", owned_contexts: 0, pending_uses: 0 });
    expect(f.enumerate).not.toHaveBeenCalled(); expect(f.pool.connect).not.toHaveBeenCalled();
    new CurrentHumanMutations(f.pool, { ...f.candidate } as CurrentHumanCandidate, f.fallback, limits, undefined, [participant]);
  });
});
