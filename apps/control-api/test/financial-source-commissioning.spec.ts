/** TEST_ONLY pool, authority and composition doubles. Exercises the actual
 * withTransaction wrapper and driver, not a real session, source, context,
 * lease, receiver COMMIT/APPLIED, source ACK or installed commissioning. */
import type { Pool, PoolClient } from "pg";
import { performance } from "node:perf_hooks";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AccessActor } from "../src/execution-v2/access.contract";
import { AccessPolicyError } from "../src/execution-v2/access.contract";
import * as snapshots from "../src/execution-v2/current-human-snapshot";
import { CurrentHumanLeaseError } from "../src/execution-v2/current-human-candidate";
import { FinancialSourceAssertionError } from "../src/execution-v2/financial-source-assertion";
import type { FinancialSourceComposition } from "../src/execution-v2/financial-source-composition";
import { createFinancialSourceOwnerCommissioning, FinancialSourceCommissioningError,
  type FinancialSourceOwnerContext } from "../src/execution-v2/financial-source-commissioning";
import type { PreparedFinancialSourceRuntime } from "../src/execution-v2/financial-source-runtime";

const NOW = 1_800_000_000_000;
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, failed) => { resolve = done; reject = failed; });
  return { promise, resolve, reject };
}
function fixture() {
  const events: string[] = [];
  let drainId: string | null = null;
  const query = vi.fn(async (sql: string) => {
    events.push(sql);
    return sql === "SELECT drain_id FROM elp210_candidate.authority WHERE singleton FOR UPDATE"
      ? { rows: [{ drain_id: drainId }], rowCount: 1 } : { rows: [], rowCount: 0 };
  });
  const release = vi.fn(() => { events.push("release"); });
  const db = { query, release } as unknown as PoolClient;
  const connect = vi.fn(async () => { events.push("connect"); return db; });
  const pool = { connect, end: vi.fn() } as unknown as Pool;
  const runtime = {
    actor: { user_id: "TEST_ONLY-owner", session_id: "TEST_ONLY-session", session_generation: 7 },
    schemaTarget: { workspace_id: "TEST_ONLY-workspace", principal_workspace_pins: [
      { user_id: "TEST_ONLY-owner", workspace_id: "TEST_ONLY-workspace" }] },
    config: { candidate: { installation_scope: { workspace_id: "TEST_ONLY-workspace", environment: "paper", valid_until_ms: NOW + 10_000 } },
      source_selection: { workspace_id: "TEST_ONLY-workspace", environment: "paper" }, assertion_limits: { ttl_ms: 5000 } },
  } as PreparedFinancialSourceRuntime;
  let leaseUntil = NOW + 4000, registrationUntil = NOW + 3000;
  const preflight = vi.spyOn(snapshots, "lockCurrentHumanSnapshot").mockImplementation(async (client, actor, workspace) => {
    events.push("authority"); expect(client).toBe(db);
    expect(actor).toEqual({ user_id: "TEST_ONLY-owner", session_id: "TEST_ONLY-session", session_generation: 7 });
    expect(workspace).toBe("TEST_ONLY-workspace");
    return { now: Date.now(), lease_until_ms: leaseUntil } as Awaited<ReturnType<typeof snapshots.lockCurrentHumanSnapshot>>;
  });
  const called = vi.fn();
  const composition: Pick<FinancialSourceComposition, "withPrincipal"> = {
    async withPrincipal<T>(actor: AccessActor, use: (context: string, metadata: { expires_at_ms: number }) => T | Promise<T>,
      options?: { signal?: AbortSignal }): Promise<T> {
      events.push("context"); called(actor, options);
      const abort = () => events.push("retire-admission");
      options?.signal?.addEventListener("abort", abort, { once: true });
      try {
        return await use("TEST_ONLY-private-original-context", { expires_at_ms: registrationUntil });
      } finally {
        options?.signal?.removeEventListener("abort", abort); events.push("context-joined");
      }
    },
  };
  return { pool, db, connect, query, release, runtime, preflight, events, called, composition,
    setDrain: (value: string) => { drainId = value; },
    setLeaseUntil: (value: number) => { leaseUntil = value; }, setRegistrationUntil: (value: number) => { registrationUntil = value; },
    create: () => createFinancialSourceOwnerCommissioning(pool, runtime, composition) };
}
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(NOW);
  // Explicit TEST_ONLY clock. The rollback case overrides this with a wholly
  // independent monotonic counter rather than rewinding it with the UTC clock.
  vi.spyOn(performance, "now").mockImplementation(() => Date.now() - NOW);
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("explicit private financial owner commissioning", () => {
  it("is inert on construction; preflights RC authority and releases the transaction before exporting context", async () => {
    const f = fixture(), owner = f.create();
    expect(f.connect).not.toHaveBeenCalled(); expect(f.preflight).not.toHaveBeenCalled(); expect(f.called).not.toHaveBeenCalled();
    const answer = await owner.withOwnerContext(context => {
      f.events.push("use"); expect(Object.isFrozen(context)).toBe(true);
      expect(context).toMatchObject({ original_context: "TEST_ONLY-private-original-context", registration_expires_at_ms: NOW + 3000,
        expires_at_ms: NOW + 1000 }); expect(context.signal.aborted).toBe(false); return "TEST_ONLY-done";
    }, { deadline_ms: 1000 });
    expect(answer).toBe("TEST_ONLY-done");
    expect(f.events).toEqual(["connect", "BEGIN", "SET TRANSACTION ISOLATION LEVEL READ COMMITTED READ WRITE", "authority",
      "SELECT drain_id FROM elp210_candidate.authority WHERE singleton FOR UPDATE", "COMMIT", "release", "context", "use", "context-joined"]);
    expect(f.pool.end).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });
  it("copies the original actor/workspace/installation pins before later caller mutation", async () => {
    const f = fixture(), original = { ...f.runtime.actor }, owner = f.create();
    (f.runtime.actor as AccessActor).user_id = "TEST_ONLY-not-the-actor";
    (f.runtime.schemaTarget as { workspace_id: string }).workspace_id = "TEST_ONLY-other-workspace";
    f.runtime.schemaTarget.principal_workspace_pins[0]!.user_id = "TEST_ONLY-other";
    f.runtime.config.candidate.installation_scope!.valid_until_ms = 1;
    f.runtime.config.source_selection.workspace_id = "TEST_ONLY-other-workspace";
    f.runtime.config.assertion_limits.ttl_ms = 1;
    await owner.withOwnerContext(() => "TEST_ONLY-done", { deadline_ms: 1000 });
    expect(f.called).toHaveBeenCalledWith(original, expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(f.preflight).toHaveBeenCalledWith(f.db, original, "TEST_ONLY-workspace");
  });
  it.each(["workspace", "actor", "environment", "ttl"])("rejects malformed %s pins at construction without I/O", kind => {
    const f = fixture();
    if (kind === "workspace") f.runtime.config.source_selection.workspace_id = "TEST_ONLY-other";
    if (kind === "actor") f.runtime.schemaTarget.principal_workspace_pins[0]!.user_id = "TEST_ONLY-other";
    if (kind === "environment") (f.runtime.config.candidate.installation_scope as { environment: string }).environment = "live";
    if (kind === "ttl") f.runtime.config.assertion_limits.ttl_ms = 300_001;
    expect(f.create).toThrowError(FinancialSourceCommissioningError);
    expect(f.connect).not.toHaveBeenCalled(); expect(f.called).not.toHaveBeenCalled();
  });
  it.each([0, -1, 300_001, 1.5, NaN])("rejects invalid duration %s before DB/context I/O", async deadline => {
    const f = fixture(), use = vi.fn();
    await expect(f.create().withOwnerContext(use, { deadline_ms: deadline })).rejects.toMatchObject({ code: "FINANCIAL_SOURCE_COMMISSIONING_CONFIG_INVALID" });
    expect(f.connect).not.toHaveBeenCalled(); expect(f.called).not.toHaveBeenCalled(); expect(use).not.toHaveBeenCalled();
  });
  it("rejects pre-aborted or expired installation without session/source I/O", async () => {
    const f = fixture(), abort = new AbortController(); abort.abort(Error("TEST_ONLY-private-abort-reason"));
    const owner = f.create();
    await expect(owner.withOwnerContext(() => null, { deadline_ms: 1000, signal: abort.signal }))
      .rejects.toMatchObject({ code: "FINANCIAL_SOURCE_COMMISSIONING_CANCELLED" });
    vi.setSystemTime(NOW + 10_000);
    await expect(owner.withOwnerContext(() => null, { deadline_ms: 1000 }))
      .rejects.toMatchObject({ code: "FINANCIAL_SOURCE_COMMISSIONING_EXPIRED" });
    expect(f.connect).not.toHaveBeenCalled(); expect(f.called).not.toHaveBeenCalled();
  });
  it("preserves typed revoked authority failure, rolls back/releases, and exports no context", async () => {
    const f = fixture(), refusal = new AccessPolicyError("CURRENT_ACTOR_AUTHORITY_REQUIRED");
    f.preflight.mockRejectedValueOnce(refusal);
    await expect(f.create().withOwnerContext(() => null, { deadline_ms: 1000 })).rejects.toBe(refusal);
    expect(f.events).toEqual(["connect", "BEGIN", "SET TRANSACTION ISOLATION LEVEL READ COMMITTED READ WRITE", "ROLLBACK", "release"]);
    expect(f.called).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });
  it("does not export when the actual session expires while preflight is in flight", async () => {
    const f = fixture(); f.setLeaseUntil(NOW);
    await expect(f.create().withOwnerContext(() => null, { deadline_ms: 1000 }))
      .rejects.toMatchObject({ code: "FINANCIAL_SOURCE_COMMISSIONING_DEADLINE_EXCEEDED" });
    expect(f.called).not.toHaveBeenCalled(); expect(f.release).toHaveBeenCalledOnce();
  });
  it("refuses a mutation/revoke drain held under the same authority lock", async () => {
    const f = fixture(); f.setDrain("TEST_ONLY-existing-revoke");
    await expect(f.create().withOwnerContext(() => null, { deadline_ms: 1000 }))
      .rejects.toMatchObject({ code: "CURRENT_HUMAN_DRAINING" });
    expect(f.events).toContain("ROLLBACK"); expect(f.release).toHaveBeenCalledOnce();
    expect(f.called).not.toHaveBeenCalled();
  });
  it("refuses a concurrent owner use instead of queuing or opening a second transaction", async () => {
    const f = fixture(), held = deferred<string>(), entered = deferred<void>(), owner = f.create();
    const pending = owner.withOwnerContext(() => { entered.resolve(); return held.promise; }, { deadline_ms: 1000 });
    await entered.promise;
    await expect(owner.withOwnerContext(() => null, { deadline_ms: 1000 })).rejects.toMatchObject({ code: "FINANCIAL_SOURCE_COMMISSIONING_BUSY" });
    expect(f.connect).toHaveBeenCalledOnce(); expect(f.called).toHaveBeenCalledOnce();
    held.resolve("TEST_ONLY-joined"); expect(await pending).toBe("TEST_ONLY-joined");
    expect(await owner.withOwnerContext(() => "TEST_ONLY-next", { deadline_ms: 1000 })).toBe("TEST_ONLY-next");
  });
  it.each(["explicit", "session", "installation", "registration"])("bounds %s expiry and keeps aborted callback owned until it really settles", async kind => {
    const f = fixture();
    let duration = 2000;
    if (kind === "explicit") duration = 250;
    if (kind === "session") f.setLeaseUntil(NOW + 250);
    if (kind === "installation") f.runtime.config.candidate.installation_scope!.valid_until_ms = NOW + 250;
    if (kind === "registration") f.setRegistrationUntil(NOW + 250);
    const held = deferred<string>(), entered = deferred<FinancialSourceOwnerContext>(), owner = f.create();
    let settled = false;
    const pending = owner.withOwnerContext(context => { entered.resolve(context); return held.promise; }, { deadline_ms: duration });
    const observed = pending.then(() => { settled = true; return null; }, error => { settled = true; return error; });
    const context = await entered.promise;
    expect(context.expires_at_ms).toBe(NOW + 250);
    expect(context.registration_expires_at_ms).toBe(kind === "registration" ? NOW + 250 : NOW + 3000);
    await vi.advanceTimersByTimeAsync(250);
    expect(context.signal.aborted).toBe(true); expect(f.events).toContain("retire-admission"); expect(settled).toBe(false);
    await expect(owner.withOwnerContext(() => null, { deadline_ms: 1000 }))
      .rejects.toMatchObject({ code: kind === "installation" ? "FINANCIAL_SOURCE_COMMISSIONING_EXPIRED" : "FINANCIAL_SOURCE_COMMISSIONING_BUSY" });
    held.resolve("TEST_ONLY-late-not-a-success");
    expect(await observed).toMatchObject({ code: "FINANCIAL_SOURCE_COMMISSIONING_DEADLINE_EXCEEDED" });
    expect(f.events.at(-1)).toBe("context-joined"); expect(f.pool.end).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("retire-admission on external abort never logs its private reason or pretends callback cleanup joined", async () => {
    const f = fixture(), held = deferred<void>(), entered = deferred<FinancialSourceOwnerContext>(), controller = new AbortController();
    let settled = false;
    const pending = f.create().withOwnerContext(context => { entered.resolve(context); return held.promise; }, { deadline_ms: 1000, signal: controller.signal });
    const observed = pending.catch(error => { settled = true; return error; });
    const context = await entered.promise; controller.abort(Error("TEST_ONLY-private-cookie-and-path"));
    expect(context.signal.aborted).toBe(true); await Promise.resolve(); expect(settled).toBe(false);
    expect(f.events).toContain("retire-admission"); held.resolve();
    const result = await observed;
    expect(result).toMatchObject({ code: "FINANCIAL_SOURCE_COMMISSIONING_CANCELLED" });
    expect(result.message).not.toContain("TEST_ONLY-private-cookie-and-path");
  });
  it("deadline during blocked preflight does not start context work or release a still-pending DB operation", async () => {
    const f = fixture(), held = deferred<Awaited<ReturnType<typeof snapshots.lockCurrentHumanSnapshot>>>(), entered = deferred<void>();
    f.preflight.mockImplementationOnce(async () => { entered.resolve(); return held.promise; });
    let settled = false;
    const pending = f.create().withOwnerContext(() => null, { deadline_ms: 10 });
    const observed = pending.catch(error => { settled = true; return error; });
    await entered.promise; await vi.advanceTimersByTimeAsync(10);
    expect(settled).toBe(false); expect(f.release).not.toHaveBeenCalled(); expect(f.called).not.toHaveBeenCalled();
    held.resolve({ now: NOW, lease_until_ms: NOW + 1000 } as Awaited<ReturnType<typeof snapshots.lockCurrentHumanSnapshot>>);
    expect(await observed).toMatchObject({ code: "FINANCIAL_SOURCE_COMMISSIONING_DEADLINE_EXCEEDED" });
    expect(f.release).toHaveBeenCalledOnce(); expect(f.called).not.toHaveBeenCalled();
  });
  it("does not extend explicit duration when UTC moves backwards before timer re-arm", async () => {
    let elapsed = 0;
    vi.spyOn(performance, "now").mockImplementation(() => elapsed);
    const f = fixture(), held = deferred<void>(), entered = deferred<FinancialSourceOwnerContext>();
    f.setRegistrationUntil(NOW - 9000);
    f.preflight.mockImplementationOnce(async () => {
      elapsed = 900; vi.setSystemTime(NOW - 10_000);
      return { now: Date.now(), lease_until_ms: NOW + 4000 } as Awaited<ReturnType<typeof snapshots.lockCurrentHumanSnapshot>>;
    });
    let settled = false;
    const pending = f.create().withOwnerContext(context => { entered.resolve(context); return held.promise; }, { deadline_ms: 1000 });
    const observed = pending.catch(error => { settled = true; return error; });
    const context = await entered.promise;
    expect(context.registration_expires_at_ms).toBe(NOW - 9000);
    expect(context.expires_at_ms).toBe(NOW - 9900);
    elapsed = 999; await vi.advanceTimersByTimeAsync(99); expect(context.signal.aborted).toBe(false);
    elapsed = 1000; await vi.advanceTimersByTimeAsync(1);
    expect(context.signal.aborted).toBe(true); expect(settled).toBe(false);
    held.resolve(); expect(await observed).toMatchObject({ code: "FINANCIAL_SOURCE_COMMISSIONING_DEADLINE_EXCEEDED" });
    expect(f.events.at(-1)).toBe("context-joined");
  });
  it.each([new CurrentHumanLeaseError("TEST_ONLY_SOURCE_TERMINAL_REQUIRED"),
    new FinancialSourceAssertionError("TEST_ONLY_SOURCE_NOT_CURRENT", 409)])("preserves a real typed source failure unchanged: %s", async sourceError => {
    const f = fixture();
    await expect(f.create().withOwnerContext(() => { throw sourceError; }, { deadline_ms: 1000 })).rejects.toBe(sourceError);
    expect(f.events.at(-1)).toBe("context-joined");
  });
  it("sanitizes raw DB/file-owner failures and releases ownership for a later explicit retry", async () => {
    const f = fixture(), owner = f.create();
    f.connect.mockRejectedValueOnce(Error("TEST_ONLY-private-dsn-password"));
    const databaseError = await owner.withOwnerContext(() => null, { deadline_ms: 1000 }).catch(error => error);
    expect(databaseError).toMatchObject({ code: "FINANCIAL_SOURCE_COMMISSIONING_FAILED" });
    expect(databaseError.message).not.toContain("password");
    const exportError = await owner.withOwnerContext(() => { throw Error("TEST_ONLY-secret-context/private/path"); }, { deadline_ms: 1000 }).catch(error => error);
    expect(exportError).toMatchObject({ code: "FINANCIAL_SOURCE_COMMISSIONING_FAILED" });
    expect(exportError.message).not.toContain("TEST_ONLY"); expect(f.events.at(-1)).toBe("context-joined");
    expect(await owner.withOwnerContext(() => "TEST_ONLY-retry", { deadline_ms: 1000 })).toBe("TEST_ONLY-retry");
  });
});
