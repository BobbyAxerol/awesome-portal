/** FE-015/060/068 · capital step-up: a delegated capital actor can re-authenticate THIS session with their OWN
 * password WITHOUT access.grant / access.revoke, and the proof is bound to a family.
 *
 * TEST_ONLY. No PostgreSQL here: the repository SQL is exercised through a recording fake (text + bound params),
 * the service through a stubbed transaction boundary over a real pure authority context. The behaviours that need a
 * real database (row expiry/revoke/session cascade in SQL, the FOR UPDATE fence) are the unchanged clauses already
 * asserted by test/elp2-access-transaction.spec.ts (T03-07) plus the family tests appended there; those are
 * NOT_RUN in this environment (no PostgreSQL) and listed in BE-P7. */
import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { AccessPolicyError, type AccessAction, type ScopedAccessGrant } from "../src/execution-v2/access.contract";
import { ExecutionAccessController } from "../src/execution-v2/access.controller";
import { ExecutionAccessService } from "../src/execution-v2/access.service";
import { RULES, ROW_ACTIONS, projectEligibilityBatch, stepUpPreconditionMet } from "../src/execution-v2/self-eligibility";
import { ACCESS_STEP_UP_PROOFS, CAPITAL_STEP_UP_ACTIONS, COMMAND_STEP_UP_PROOFS, STEP_UP_FAMILIES, stepUpProofsFor }
  from "../src/execution-v2/step-up-family";
import { AccountLifecycleRepository, CAPITAL_STEP_UP_ID_PREFIX, stepUpFamilyOfId } from "../src/repos/account-lifecycle";
import { NOW, OWNER, P, U, WS, fixture, grant } from "./support/access-fixture";

const capitalGrant = (changes: Partial<ScopedAccessGrant> = {}) => grant("TEST_ONLY:cap", { action: "capital.top_up", ...changes });
const accessGrant = (action: "access.grant" | "access.revoke" = "access.grant") =>
  grant("TEST_ONLY:acc:" + action, { action, requires_ts_acceptance: false, ts_receipt: null,
    delegable_actions: action === "access.grant" ? ["portfolio.read"] : [] });

describe("one list, two readers: the step-up-requiring actions and the proofs each accepts", () => {
  it("CAPITAL_STEP_UP_ACTIONS is exactly the eligibility rules that demand a step-up", () => {
    const required = ROW_ACTIONS.filter(action => RULES[action].stepUp === true).sort();
    expect([...CAPITAL_STEP_UP_ACTIONS].sort()).toEqual(required);
    for (const action of required) expect(RULES[action].family).toMatch(/^(CAPITAL|PENDING_CONTROL|INSTANCE_REGISTRATION)_PREVIEW$/);
  });
  it("a command action accepts the command proofs; everything else (including access mutations and unknown names) only the access proof", () => {
    for (const action of CAPITAL_STEP_UP_ACTIONS) expect(stepUpProofsFor(action)).toEqual(COMMAND_STEP_UP_PROOFS);
    for (const action of ["access.grant", "access.revoke", "access.propose", "users.manage_status", "owner.recovery", "safety.halt",
      "capital.preview", "capital.return_capital", "governance.live.decide"] as AccessAction[])
      expect(stepUpProofsFor(action), action).toEqual(ACCESS_STEP_UP_PROOFS);
    expect(stepUpProofsFor("not.an.action" as AccessAction)).toEqual(ACCESS_STEP_UP_PROOFS);
    expect([...COMMAND_STEP_UP_PROOFS].sort()).toEqual([...STEP_UP_FAMILIES].sort());
    expect(ACCESS_STEP_UP_PROOFS).toEqual(["ACCESS_ADMIN"]);
    expect(Object.isFrozen(ACCESS_STEP_UP_PROOFS) && Object.isFrozen(COMMAND_STEP_UP_PROOFS)).toBe(true);
  });
});

/** A recording fake of the one place proof rows are read and written. */
function fakeDb(rows: Array<{ step_up_id: string; session_id: string; user_id: string; expires_ms: number; revoked: boolean }> = []) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    if (/INSERT INTO owner_step_up_grants/.test(sql)) {
      rows.push({ step_up_id: String(params[0]), session_id: String(params[1]), user_id: String(params[2]), expires_ms: NOW + Number(params[3]) * 1000, revoked: false });
      return { rows: [{ expires_at: new Date(NOW + Number(params[3]) * 1000) }], rowCount: 1 };
    }
    if (/FROM owner_step_up_grants/.test(sql)) {
      // Emulates the SQL predicate in JS so the test can observe family filtering end to end.
      const locked = /user_id = \$2/.test(sql);
      const families = (locked ? params[2] : params[1]) as string[];
      const found = rows.filter(r => r.session_id === params[0] && (!locked || r.user_id === params[1]) && !r.revoked && r.expires_ms > NOW &&
        families.includes(stepUpFamilyOfId(r.step_up_id))).sort((a, b) => b.expires_ms - a.expires_ms)[0];
      return { rows: found ? [{ expires_at: new Date(found.expires_ms) }] : [], rowCount: found ? 1 : 0 };
    }
    return { rows: [], rowCount: 0 };
  });
  return { db: { query } as unknown as Pool, calls, rows };
}

describe("AccountLifecycleRepository: the proof family is stored in the id and every reader names the families it accepts", () => {
  it("an id carries its family and the repository refuses a mislabeled grant in BOTH directions before any SQL", async () => {
    const { db, calls } = fakeDb();
    const repo = new AccountLifecycleRepository(db);
    const base = { sessionId: "s1", userId: "u1", ttlSeconds: 300 };
    expect(stepUpFamilyOfId("stp_abc")).toBe("ACCESS_ADMIN");
    expect(stepUpFamilyOfId("anything-else")).toBe("ACCESS_ADMIN");
    expect(stepUpFamilyOfId(CAPITAL_STEP_UP_ID_PREFIX + "abc")).toBe("CAPITAL_COMMAND");
    await expect(repo.grantStepUp({ ...base, stepUpId: "stpcap_x", family: "ACCESS_ADMIN" })).rejects.toThrow("STEP_UP_FAMILY_ID_MISMATCH");
    await expect(repo.grantStepUp({ ...base, stepUpId: "stpcap_x" })).rejects.toThrow("STEP_UP_FAMILY_ID_MISMATCH"); // default = ACCESS_ADMIN
    await expect(repo.grantStepUp({ ...base, stepUpId: "stp_x", family: "CAPITAL_COMMAND" })).rejects.toThrow("STEP_UP_FAMILY_ID_MISMATCH");
    await expect(repo.grantStepUp({ ...base, stepUpId: "stpcap_x", family: "OWNER" as never })).rejects.toThrow("STEP_UP_FAMILY_ID_MISMATCH");
    expect(calls).toEqual([]);
    await repo.grantStepUp({ ...base, stepUpId: "stp_ok" });
    await repo.grantStepUp({ ...base, stepUpId: "stpcap_ok", family: "CAPITAL_COMMAND" });
    expect(calls.map(c => c.params[0])).toEqual(["stp_ok", "stpcap_ok"]);
  });
  it("readers filter by family: a capital proof is invisible to the access fence and vice versa; the union sees both", async () => {
    const { db, calls } = fakeDb();
    const repo = new AccountLifecycleRepository(db);
    await repo.grantStepUp({ stepUpId: "stpcap_one", sessionId: "s1", userId: "u1", ttlSeconds: 600, family: "CAPITAL_COMMAND" });
    expect(await repo.lockActiveStepUpExpiry("s1", "u1", ACCESS_STEP_UP_PROOFS)).toBeNull();
    expect(await repo.activeStepUpExpiry("s1", ACCESS_STEP_UP_PROOFS)).toBeNull();
    expect(await repo.lockActiveStepUpExpiry("s1", "u1", COMMAND_STEP_UP_PROOFS)).toEqual(new Date(NOW + 600_000));
    expect(await repo.activeStepUpExpiry("s1", ["CAPITAL_COMMAND"])).toEqual(new Date(NOW + 600_000));
    await repo.grantStepUp({ stepUpId: "stp_two", sessionId: "s1", userId: "u1", ttlSeconds: 300 });
    expect(await repo.lockActiveStepUpExpiry("s1", "u1", ACCESS_STEP_UP_PROOFS)).toEqual(new Date(NOW + 300_000));
    // session and user binding survive the family change
    expect(await repo.lockActiveStepUpExpiry("s2", "u1", COMMAND_STEP_UP_PROOFS)).toBeNull(); // another session
    expect(await repo.lockActiveStepUpExpiry("s1", "u2", COMMAND_STEP_UP_PROOFS)).toBeNull(); // another user
    // the SQL itself: family expression, bound as an array, with every historical predicate still present
    const select = calls.filter(c => /SELECT expires_at FROM owner_step_up_grants/.test(c.sql)).at(-1)!;
    expect(select.sql).toMatch(/revoked_at IS NULL/);
    expect(select.sql).toMatch(/expires_at > clock_timestamp\(\)/);
    expect(select.sql).toMatch(/left\(step_up_id, 7\) = 'stpcap_'/);
    expect(select.sql).toMatch(/FOR UPDATE/);
    expect(CAPITAL_STEP_UP_ID_PREFIX.length).toBe(7);
  });
  it("an empty or unknown family list is a refusal without touching the database (fail closed)", async () => {
    const { db, calls } = fakeDb();
    const repo = new AccountLifecycleRepository(db);
    for (const families of [[], ["OWNER"], ["ACCESS_ADMIN", "OWNER"], undefined, "ACCESS_ADMIN"] as never[]) {
      expect(await repo.activeStepUpExpiry("s1", families)).toBeNull();
      expect(await repo.lockActiveStepUpExpiry("s1", "u1", families)).toBeNull();
    }
    expect(calls).toEqual([]);
  });
  it("revoking a user's proofs revokes every family (no family survives a revoke)", async () => {
    const { db, calls } = fakeDb();
    await new AccountLifecycleRepository(db).revokeStepUpsForUser("u1");
    expect(calls[0].sql).toMatch(/UPDATE owner_step_up_grants SET revoked_at = now\(\)\s+WHERE user_id = \$1 AND revoked_at IS NULL/);
    expect(calls[0].sql).not.toMatch(/step_up_id/);
  });
});

/** The service with its transaction boundary replaced by the caller's real pure authority context. */
function stepUpHarness(grants: ScopedAccessGrant[], options: { passwordHash?: string; rotatePassword?: boolean; policy?: boolean } = {}) {
  const { context } = fixture(grants);
  const authority = options.policy === false ? { ...context, policy: null } : context;
  const store = fakeDb();
  const credential = (hash: string) => ({ rows: [{ credential_id: "c", user_id: U, password_hash: hash, algorithm: "argon2id", parameters_json: {}, created_at: new Date(), changed_at: new Date() }], rowCount: 1 });
  let current = options.passwordHash ?? "hash-1";
  const txDb = { query: vi.fn(async (sql: string, params: unknown[] = []) => {
    if (/FROM password_credentials/.test(sql)) return credential(options.rotatePassword ? "hash-ROTATED" : current);
    return store.db.query(sql, params);
  }) };
  const events: unknown[] = [];
  const verify = vi.fn(async (hash: string, password: string) => hash === current && password === "right-password");
  const decoy = vi.fn(async () => undefined);
  const auth = { credentials: { findPassword: vi.fn(async () => ({ passwordHash: current })) }, argon2: { verify, verifyAgainstDecoy: decoy },
    config: { OWNER_STEP_UP_TTL_SECONDS: 300, PORTAL_PUBLIC_ORIGIN: "https://portal.test" } } as never;
  const service = new ExecutionAccessService({} as never, auth, undefined, true);
  const transaction = vi.fn(async (_workspace: string, _actor: unknown, _proofs: unknown, fn: (tx: unknown) => Promise<unknown>) =>
    fn({ db: txDb, repo: { event: async (e: unknown) => { events.push(e); } }, context: authority, recheck: (check: () => void) => check() }));
  (service as never as { transaction: unknown }).transaction = transaction;
  const refusal = vi.fn(async () => undefined);
  (service as never as { recordRefusal: unknown }).recordRefusal = refusal;
  const actor = { user_id: U, session_id: "sess-1", session_generation: 1 };
  return { service, actor, transaction, events, store, refusal, verify, decoy };
}

describe("ExecutionAccessService.stepUp: the capital family needs the actor's own step-up-requiring grant, never access-admin", () => {
  it("delegated-capital-only positive: no access.grant / access.revoke anywhere, a capital proof is issued for THIS session", async () => {
    const h = stepUpHarness([capitalGrant()]);
    expect(stepUpPreconditionMet(fixture([capitalGrant()]).context, "ACCESS_ADMIN")).toBe(false); // really has no access-admin
    const result = await h.service.stepUp(h.actor, WS, "right-password", "CAPITAL_COMMAND");
    expect(result).toEqual({ schema_version: "portal.access-step-up.v1", state: "ACTIVE", family: "CAPITAL_COMMAND", expires_at_ms: NOW + 300_000 });
    expect(h.store.rows).toHaveLength(1);
    expect(h.store.rows[0]).toMatchObject({ session_id: "sess-1", user_id: U });
    expect(h.store.rows[0].step_up_id.startsWith("stpcap_")).toBe(true);
    expect(h.transaction.mock.calls[0][2]).toBe(false); // the issuing transaction itself needs no prior proof
    // the audit event is a distinct family-named digest and never carries the password
    expect(JSON.stringify(h.events)).not.toContain("right-password");
    // the proof satisfies exactly the command fence, not the access fence
    const repo = new AccountLifecycleRepository(h.store.db);
    expect(await repo.lockActiveStepUpExpiry("sess-1", U, COMMAND_STEP_UP_PROOFS)).not.toBeNull();
    expect(await repo.lockActiveStepUpExpiry("sess-1", U, ACCESS_STEP_UP_PROOFS)).toBeNull();
    expect(await repo.lockActiveStepUpExpiry("sess-2", U, COMMAND_STEP_UP_PROOFS)).toBeNull(); // another session cannot use it
  });
  it("the historical request (no family) is unchanged: needs access.grant/revoke, issues a plain proof and the same audit digest", async () => {
    const admin = stepUpHarness([accessGrant()]);
    const result = await admin.service.stepUp(admin.actor, WS, "right-password");
    expect(result).toMatchObject({ state: "ACTIVE", family: "ACCESS_ADMIN" });
    expect(admin.store.rows[0].step_up_id.startsWith("stp_")).toBe(true);
    expect(admin.store.rows[0].step_up_id.startsWith("stpcap_")).toBe(false);
    const capitalOnly = stepUpHarness([capitalGrant()]);
    await expect(capitalOnly.service.stepUp(capitalOnly.actor, WS, "right-password")).rejects.toMatchObject({ code: "ACCESS_DENIED" });
    expect(capitalOnly.store.rows).toEqual([]);
    const digestOf = (h: ReturnType<typeof stepUpHarness>) => (h.events[0] as { request_digest: string }).request_digest;
    const both = stepUpHarness([accessGrant(), capitalGrant()]);
    await both.service.stepUp(both.actor, WS, "right-password", "ACCESS_ADMIN");
    await both.service.stepUp(both.actor, WS, "right-password", "CAPITAL_COMMAND");
    expect(digestOf(both)).toBe(digestOf(admin)); // ACCESS_ADMIN digest bytes unchanged
    expect((both.events[1] as { request_digest: string }).request_digest).not.toBe(digestOf(both));
  });
  it("an access-admin cannot obtain the capital proof without their own capital grant (families are not interchangeable at issue)", async () => {
    const h = stepUpHarness([accessGrant("access.grant")]);
    await expect(h.service.stepUp(h.actor, WS, "right-password", "CAPITAL_COMMAND")).rejects.toMatchObject({ code: "ACCESS_DENIED", status: 403 });
    expect(h.store.rows).toEqual([]);
  });
  it.each([
    ["no grant at all", [] as ScopedAccessGrant[], {}],
    ["expired capital grant", [capitalGrant({ valid_until_ms: NOW - 1 })], {}],
    ["revoked capital grant", [capitalGrant({ revoked_at_ms: NOW - 1 })], {}],
    ["a DENY of the same action", [capitalGrant(), grant("TEST_ONLY:d", { action: "capital.top_up", effect: "DENY", requires_ts_acceptance: false, ts_receipt: null })], {}],
    ["someone else's capital grant", [capitalGrant({ subject_user_id: OWNER })], {}],
    ["a read-only grant", [grant("TEST_ONLY:r", { action: "portfolio.read" })], {}],
    ["policy not ready", [capitalGrant()], { policy: false }],
  ])("deny: %s -> ACCESS_DENIED, no proof written, the refusal is audited", async (_name, grants, options) => {
    const h = stepUpHarness(grants, options);
    await expect(h.service.stepUp(h.actor, WS, "right-password", "CAPITAL_COMMAND")).rejects.toMatchObject({ code: "ACCESS_DENIED", status: 403 });
    expect(h.store.rows).toEqual([]);
    expect(h.refusal).toHaveBeenCalledTimes(1);
  });
  it("a wrong password is STEP_UP_REJECTED before any authority is read, with decoy cost when no credential exists", async () => {
    const h = stepUpHarness([capitalGrant()]);
    await expect(h.service.stepUp(h.actor, WS, "wrong", "CAPITAL_COMMAND")).rejects.toMatchObject({ code: "STEP_UP_REJECTED" });
    expect(h.transaction).not.toHaveBeenCalled();
    expect(h.store.rows).toEqual([]);
    const none = stepUpHarness([capitalGrant()]);
    (none.service as never as { auth: { credentials: { findPassword: () => Promise<null> } } }).auth.credentials.findPassword = async () => null;
    await expect(none.service.stepUp(none.actor, WS, "right-password", "CAPITAL_COMMAND")).rejects.toMatchObject({ code: "STEP_UP_REJECTED" });
    expect(none.decoy).toHaveBeenCalledTimes(1);
  });
  it("the password changing between the proof and the write voids the proof (CURRENT_ACTOR_AUTHORITY_REQUIRED, nothing stored)", async () => {
    const h = stepUpHarness([capitalGrant()], { rotatePassword: true });
    await expect(h.service.stepUp(h.actor, WS, "right-password", "CAPITAL_COMMAND")).rejects.toMatchObject({ code: "CURRENT_ACTOR_AUTHORITY_REQUIRED" });
    expect(h.store.rows).toEqual([]);
  });
  it("an unknown family is refused before the password is even read", async () => {
    const h = stepUpHarness([capitalGrant()]);
    for (const family of ["OWNER", "capital_command", "", undefined as never, null as never])
      if (family !== undefined) await expect(h.service.stepUp(h.actor, WS, "right-password", family as never)).rejects.toMatchObject({ code: "ACCESS_DENIED" });
    expect(h.verify).not.toHaveBeenCalled();
    expect(h.store.rows).toEqual([]);
  });
});

describe("parity: the batch read and the command route use the same proofs and the same precondition", () => {
  it("commandBoundary asks for the command proofs for every step-up-requiring action and only the access proof otherwise", async () => {
    for (const [action, expected] of [...CAPITAL_STEP_UP_ACTIONS.map(a => [a, COMMAND_STEP_UP_PROOFS] as const),
      ["access.grant", ACCESS_STEP_UP_PROOFS], ["safety.halt", ACCESS_STEP_UP_PROOFS]] as Array<readonly [AccessAction, readonly string[]]>) {
      const service = new ExecutionAccessService({} as never, {} as never, undefined, true);
      const seen: unknown[] = [];
      (service as never as { transaction: unknown }).transaction = async (_w: string, _a: unknown, proofs: unknown) => { seen.push(proofs); return null; };
      const { context } = fixture([capitalGrant()]);
      await service.commandBoundary({ user_id: U, session_id: "s", session_generation: 1 }, WS,
        { ...context, authority_fingerprint: "fp" }, action, P, "paper", () => {}, async () => null);
      expect(seen, action).toEqual([expected]);
    }
  });
  it("eligibilityBatch reads the session's command proofs, and its relation closure covers every step-up action", async () => {
    const { context } = fixture([capitalGrant()]);
    const pool = { query: vi.fn(async (_sql: string, _params: unknown[]) => ({ rows: [{ expires_at: new Date(NOW + 5000) }], rowCount: 1 })) };
    const service = new ExecutionAccessService(pool as never, {} as never, undefined, true);
    const closure = vi.fn(async () => context as never);
    (service as never as { selfProjectionContext: unknown }).selfProjectionContext = closure;
    const batch = await service.eligibilityBatch({ user_id: U, session_id: "sess-1", session_generation: 1 },
      { workspace_id: WS, environment: "paper", resources: [P], actions: ["portfolio.read"] });
    expect((closure.mock.calls[0] as unknown[])[3]).toEqual(expect.arrayContaining(["portfolio.read", ...CAPITAL_STEP_UP_ACTIONS]));
    expect(pool.query.mock.calls[0][1]).toEqual(["sess-1", [...COMMAND_STEP_UP_PROOFS]]);
    expect(batch.session_step_up).toMatchObject({ state: "ACTIVE" });
    expect(batch.schema_version).toBe("portal.self-eligibility-batch.v2");
  });
  it("the route and the batch cannot disagree: the same predicate answers both for every vector", () => {
    for (const grants of [[capitalGrant()], [accessGrant()], [capitalGrant(), accessGrant()], [], [capitalGrant({ revoked_at_ms: NOW - 1 })]]) {
      const { context } = fixture(grants);
      const batch = projectEligibilityBatch(context, { workspace_id: WS, environment: "paper", resources: [P], actions: ["capital.top_up"] }, { active_until_ms: null });
      for (const challenge of batch.session_step_up.challenges)
        expect(challenge.precondition_met).toBe(stepUpPreconditionMet(context, challenge.family));
    }
  });
});

describe("the step-up route validates the family and keeps CSRF / origin / idempotency / current-session checks", () => {
  const controller = (service: unknown) => new ExecutionAccessController(service as never, { config: { PORTAL_PUBLIC_ORIGIN: "https://portal.test" } } as never);
  const request = (headers: Record<string, string>) => ({ method: "POST", headers, portalUser: { userId: U, sessionVersion: 1 },
    portalSession: { sessionId: "sess-1", csrfSecretHash: "x" } }) as never;
  const reply = { code: () => reply } as never;
  it("a request without the CSRF proof, origin or idempotency key never reaches the service", async () => {
    const stepUp = vi.fn();
    const cases: Record<string, string>[] = [{}, { origin: "https://evil.test" }, { origin: "https://portal.test" }];
    for (const headers of cases)
      await expect(controller({ stepUp }).stepUp(request(headers), { workspace_id: WS, password: "p", family: "CAPITAL_COMMAND" }, reply)).rejects.toBeTruthy();
    expect(stepUp).not.toHaveBeenCalled();
  });
  it("the body is strict: only the documented family values, no actor / session / extra keys", async () => {
    const service = { stepUp: vi.fn(async (_actor: unknown, _workspace: unknown, _password: unknown, _family: unknown) => ({})) };
    const c = controller(service);
    (c as never as { security: () => string }).security = () => "idem-key-12345";
    for (const body of [{ workspace_id: WS, password: "p", family: "OWNER" }, { workspace_id: WS, password: "p", family: "" },
      { workspace_id: WS, password: "p", family: "CAPITAL_COMMAND", session_id: "other" }, { workspace_id: WS, password: "p", actor: "x" },
      { workspace_id: WS, family: "CAPITAL_COMMAND" }, { workspace_id: WS, password: "" }])
      await expect(c.stepUp(request({}), body, reply), JSON.stringify(body)).rejects.toMatchObject({ code: "ACCESS_INPUT_INVALID" });
    expect(service.stepUp).not.toHaveBeenCalled();
    await c.stepUp(request({}), { workspace_id: WS, password: "p" }, reply);
    await c.stepUp(request({}), { workspace_id: WS, password: "p", family: "CAPITAL_COMMAND" }, reply);
    expect(service.stepUp.mock.calls.map(call => call[3])).toEqual(["ACCESS_ADMIN", "CAPITAL_COMMAND"]);
    // the actor is always the authenticated session, never the body
    expect(service.stepUp.mock.calls[0][0]).toEqual({ user_id: U, session_id: "sess-1", session_generation: 1 });
  });
});
