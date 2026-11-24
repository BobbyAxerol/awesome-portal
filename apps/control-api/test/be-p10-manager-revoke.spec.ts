/** BE-P10 task 1. TEST_ONLY. Fakes only (fake root-owned filesystem, scripted in-memory Core world,
 * fake coordinator): NOT PostgreSQL, NOT a real owner artifact, NOT a revoke on any runtime.
 * Proves the official offline Core-side revoke of NATIVE manager-domain grants: exact grant identity,
 * READ and STREAM separately, atomic, idempotent, typed refusals, remove-only, immutable audit without
 * secrets, and that the existing READ/STREAM evaluators deny immediately afterwards. Real-PG
 * concurrency lives in be-p10-manager-revoke-pg.spec.ts (NOT_RUN without TEST_DATABASE_URL). */
import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthService } from "../src/auth/auth.service";
import { withTransaction } from "../src/db/pool";
import { AccessPolicyError } from "../src/execution-v2/access.contract";
import { ExecutionAccessService } from "../src/execution-v2/access.service";
import { unqualifiedAccessTrust } from "../src/execution-v2/access-trust";
import { evaluateManagerDomainRead, evaluateManagerDomainStream } from "../src/execution-v2/current-human-snapshot";
import { CurrentHumanMutationPending } from "../src/execution-v2/current-human-mutations";
import { MANAGER_REVOKE_EVENT_SOURCE, ManagerRevokeError, assertManagerRevokeNeverWidens, managerRevokeRequestDigest, planManagerRevoke,
  readPinnedManagerRevoke, verifiedManagerRevoke, type ManagerRevokePin } from "../src/execution-v2/manager-domain-revoke";
import { NOW, OWNER_STREAM_TEMPLATE, prepared, sha256 } from "./fixtures/core009-templates";
import { FakeCoreWorld } from "./fixtures/fake-core-world";

vi.mock("node:fs/promises", async original => ({ ...await original<typeof import("node:fs/promises")>(), lstat: vi.fn(), open: vi.fn() }));
type File = { bytes: Buffer; uid: number; mode: number; ino: number; link?: boolean; size?: number };
const files = new Map<string, File>();
const PATH = "/root/TEST_ONLY-revoke.json";
let serial = 0;
const stat = (f: File) => ({ uid: f.uid, mode: f.mode, ino: f.ino, dev: 1, size: f.size ?? f.bytes.length, isFile: () => !f.link, isSymbolicLink: () => Boolean(f.link) });
beforeEach(() => {
  files.clear(); vi.clearAllMocks();
  vi.mocked(lstat).mockImplementation((async (path: unknown) => { const f = files.get(String(path)); if (!f) throw Error("ENOENT"); return stat(f); }) as any);
  vi.mocked(open).mockImplementation((async (path: unknown, flags: unknown) => {
    const f = files.get(String(path)); if (!f) throw Error("ENOENT");
    expect(flags).toBe(constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    let offset = 0;
    return { stat: async () => stat(f), close: vi.fn(async () => undefined), read: async (buffer: Buffer, start: number, length: number) => {
      const count = Math.min(length, f.bytes.length - offset);
      if (count > 0) f.bytes.copy(buffer, start, offset, offset + count); offset += count; return { bytesRead: count, buffer };
    } };
  }) as any);
});

const reviewed = prepared(OWNER_STREAM_TEMPLATE);
const T = reviewed.ownerValue.target, [READ, STREAM] = reviewed.ownerValue.manager_domain_grants as any[];
const OTHER_WORKSPACE = "ws_TEST_ONLY_other";
const legacy = { grant_id: "TEST_ONLY-legacy", subject_user_id: T.protected_owner_user_id, workspace_id: T.workspace_id, action: "alpha.read",
  effect: "ALLOW", selector: { kind: "EXPLICIT_RESOURCE_SET", resource_kind: "ALPHA", ids: ["a"] }, environments: ["paper"], valid_from_ms: NOW - 1000,
  valid_until_ms: NOW + 1_000_000, delegable_actions: [], issued_by: T.protected_owner_user_id, parent_grant_id: null, revision: "legacy-r1",
  policy_revision: reviewed.ownerValue.policy.revision, revoked_at_ms: null, requires_ts_acceptance: false, ts_receipt: null, field_policy_ref: null };
const foreign = { ...READ, grant_id: "TEST_ONLY-foreign-read", workspace_id: OTHER_WORKSPACE };

function makeWorld(over: Partial<ConstructorParameters<typeof FakeCoreWorld>[0]> = {}) {
  return new FakeCoreWorld({ now: NOW, database: { db: T.database_name, system: T.database_system_identifier, login: T.role_name },
    owner: T.protected_owner_user_id, workspace: T.workspace_id, members: [T.protected_owner_user_id], policy: reviewed.ownerValue.policy,
    grants: [READ, STREAM, legacy], extraWorkspaces: { other: [foreign] }, ...over });
}
const item = (grant: any, mode: "REVOKE" | "NARROW" = "REVOKE", extra: object = {}) =>
  ({ mode, grant_id: grant.grant_id, action: grant.action, expected_grant_revision: grant.revision, ...extra });
const document = (items: object[], over: object = {}) => ({ schema_version: "portal.private-owner-manager-revoke.v1", target: T,
  revocation_id: "TEST_ONLY-revocation-1", approval_ref: "TEST_ONLY-NOT-REAL-APPROVAL", reason: "Acceptance window closed.", items,
  provenance_ref: "TEST_ONLY-review-record", ...over });
function mount(doc: object, over: Partial<File> = {}): ManagerRevokePin {
  const bytes = Buffer.from(JSON.stringify(doc), "utf8");
  files.set(PATH, { bytes, uid: 0, mode: 0o100600, ino: ++serial, ...over });
  return { artifact_path: PATH, approved_sha256: sha256(bytes), target: T, not_before_ms: NOW - 60_000, not_after_ms: NOW + 10 * 3_600_000 };
}
const service = (w: FakeCoreWorld) => new ExecutionAccessService(w.pool, {} as AuthService, unqualifiedAccessTrust, false, w.coordinator.asMutations());
async function revoke(w: FakeCoreWorld, doc: object, pinOver: Partial<ManagerRevokePin> = {}) {
  const pin = { ...mount(doc), ...pinOver };
  return service(w).revokeReviewedManagerDomainGrants(await readPinnedManagerRevoke(pin, NOW));
}
const request = (w: FakeCoreWorld) => ({ actor: w.actor, workspace_id: T.workspace_id, environment: "paper" as const, domain: READ.domain });
const read = (w: FakeCoreWorld, expected?: string) => withTransaction(w.pool, db => evaluateManagerDomainRead(db, { ...request(w), ...(expected ? { expected_scope_digest: expected } : {}) }));
const stream = (w: FakeCoreWorld) => withTransaction(w.pool, db => evaluateManagerDomainStream(db, request(w)));
const denied = (code: string) => (e: unknown) => e instanceof AccessPolicyError && e.code === code;
const typed = (code: string) => (e: unknown) => e instanceof ManagerRevokeError && e.code === code && e.message === "The requested access is not available.";
const grantFact = (w: FakeCoreWorld, id: string) => structuredClone(w.grants.get(id));

describe("BE-P10 official manager-domain revoke: the fakes agree with the real evaluators before any revoke", () => {
  it("READ and STREAM are both allowed on the installed Plan B pair (sanity for every case below)", async () => {
    const w = makeWorld();
    expect((await read(w)).grant_id).toBe(READ.grant_id);
    expect((await stream(w)).stream_grant_id).toBe(STREAM.grant_id);
  });
});

describe("positive revoke, READ and STREAM separately", () => {
  it("revokes READ only: READ and (because STREAM needs a current READ) STREAM deny immediately; STREAM row is untouched", async () => {
    const w = makeWorld(), streamBefore = grantFact(w, STREAM.grant_id), legacyBefore = grantFact(w, legacy.grant_id);
    const receipts = await revoke(w, document([item(READ)]));
    expect(receipts).toHaveLength(1);
    expect(receipts[0]).toMatchObject({ grant_id: READ.grant_id, action: "business.read_all", mode: "REVOKE", outcome: "REVOKED", replayed: false,
      grant_revision_before: READ.revision, revoked_at_ms: NOW, valid_until_ms_before: READ.valid_until_ms, valid_until_ms_after: READ.valid_until_ms });
    expect(receipts[0]!.grant_revision_after).not.toBe(READ.revision);
    expect(grantFact(w, READ.grant_id)).toEqual({ ...READ, revision: receipts[0]!.grant_revision_after, revoked_at_ms: NOW });
    expect(grantFact(w, STREAM.grant_id)).toEqual(streamBefore);
    expect(grantFact(w, legacy.grant_id)).toEqual(legacyBefore);
    await expect(read(w)).rejects.toSatisfy(denied("ACCESS_DENIED"));
    await expect(stream(w)).rejects.toSatisfy(denied("ACCESS_DENIED"));
  });

  it("revokes STREAM only: STREAM denies while READ keeps the byte-identical scope digest (a READ cursor stays valid)", async () => {
    const w = makeWorld(), readBefore = await read(w), readRow = grantFact(w, READ.grant_id);
    const receipts = await revoke(w, document([item(STREAM)]));
    expect(receipts[0]).toMatchObject({ grant_id: STREAM.grant_id, action: "stream.subscribe", outcome: "REVOKED" });
    await expect(stream(w)).rejects.toSatisfy(denied("ACCESS_DENIED"));
    const readAfter = await read(w, readBefore.scope_digest);
    expect(readAfter.scope_digest).toBe(readBefore.scope_digest);
    expect(grantFact(w, READ.grant_id)).toEqual(readRow);
  });

  it("revokes both in one artifact, atomically, with one receipt each", async () => {
    const w = makeWorld();
    const receipts = await revoke(w, document([item(READ), item(STREAM)]));
    expect(receipts.map(r => [r.action, r.outcome])).toEqual([["business.read_all", "REVOKED"], ["stream.subscribe", "REVOKED"]]);
    expect(new Set(receipts.map(r => r.receipt_id)).size).toBe(2);
    await expect(read(w)).rejects.toSatisfy(denied("ACCESS_DENIED"));
    await expect(stream(w)).rejects.toSatisfy(denied("ACCESS_DENIED"));
    expect(w.events.filter(e => e.operation === "REVOKE")).toHaveLength(2);
    expect(w.coordinator.calls).toEqual([{ family: "REVIEWED_POLICY", operation: "REVOKE_MANAGER_GRANT", key: expect.stringMatching(/^sha256:[0-9a-f]{64}$/) }]);
  });

  it("NARROW shortens one window: the old scope digest is stale (409 retry) and the stream scope changes; nothing else moves", async () => {
    const w = makeWorld(), before = await read(w), streamBefore = await stream(w);
    const narrower = NOW + 20 * 60_000;
    const receipts = await revoke(w, document([item(READ, "NARROW", { valid_until_ms: narrower })]));
    expect(receipts[0]).toMatchObject({ outcome: "NARROWED", mode: "NARROW", valid_until_ms_before: READ.valid_until_ms, valid_until_ms_after: narrower, revoked_at_ms: null });
    await expect(read(w, before.scope_digest)).rejects.toSatisfy(denied("ACCESS_RETRY_REQUIRED"));
    const fresh = await read(w);
    expect(fresh.valid_until_ms).toBeLessThanOrEqual(narrower);
    expect((await stream(w)).stream_scope_digest).not.toBe(streamBefore.stream_scope_digest);
  });
});

describe("immutable audit row and receipt content", () => {
  it("writes one REVOKE event per grant with reviewed public facts only, never a secret, path or hash of the artifact file", async () => {
    const w = makeWorld(), doc = document([item(READ), item(STREAM)]), pin = mount(doc);
    await service(w).revokeReviewedManagerDomainGrants(await readPinnedManagerRevoke(pin, NOW));
    expect(w.events).toHaveLength(2);
    for (const e of w.events) {
      expect(e).toMatchObject({ operation: "REVOKE", workspace_id: T.workspace_id, actor_user_id: T.protected_owner_user_id,
        source: MANAGER_REVOKE_EVENT_SOURCE, policy_revision: reviewed.ownerValue.policy.revision });
      expect(e.key_digest).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(e.source_receipt_id).toBe(`TEST_ONLY-revocation-1:${e.grant_id}`);
      expect(e.receipt).toMatchObject({ schema_version: "portal.access-operation.v1", outcome: "REVOKED", http_status: 200, reason_code: "REVOKED" });
      expect(Object.keys(e.after_fact).sort()).toEqual(["approval_ref", "grant", "mode", "outcome", "provenance_ref", "reason", "receipt"]);
      const text = JSON.stringify(e);
      expect(text).not.toContain(PATH); expect(text).not.toContain(pin.approved_sha256);
      expect(text).not.toMatch(/token|password|secret|cookie|private_key|BEGIN /i);
    }
    expect(w.audit).toEqual([]); // Core access events, not auth audit: nothing else was written
  });
  it("the audit table stays append-only: the fake world, like the real trigger, refuses UPDATE/DELETE of an event", async () => {
    const w = makeWorld(); await revoke(w, document([item(READ)]));
    await expect(w.client.query("DELETE FROM portal_access_policy_events WHERE event_id=$1", [w.events[0]!.event_id])).rejects.toThrow(/immutable/);
  });
});

describe("idempotent replay and key conflicts", () => {
  it("the exact same artifact again returns the ORIGINAL receipts (replayed) and writes nothing, not even a coordinator intent", async () => {
    const w = makeWorld(), doc = document([item(READ), item(STREAM)]);
    const first = await revoke(w, doc), writes = w.writes.length, calls = w.coordinator.calls.length, events = w.events.length;
    const second = await revoke(w, doc);
    expect(second.map(r => ({ ...r, replayed: false }))).toEqual(first);
    expect(second.every(r => r.replayed)).toBe(true);
    expect(w.writes).toHaveLength(writes); expect(w.coordinator.calls).toHaveLength(calls); expect(w.events).toHaveLength(events);
  });
  it("same revocation_id with different content is a typed conflict and changes nothing", async () => {
    const w = makeWorld(); await revoke(w, document([item(READ)]));
    const writes = w.writes.length;
    await expect(revoke(w, document([item(READ)], { reason: "A different reason." }))).rejects.toSatisfy(typed("MANAGER_REVOKE_KEY_CONFLICT"));
    expect(w.writes).toHaveLength(writes);
  });
  it("a lost-ACK replay INSIDE the coordinator's replay-only transaction re-reads the receipts; the real write guard would reject any write", async () => {
    const w = makeWorld(), doc = document([item(READ)]), pin = mount(doc);
    const verified = await readPinnedManagerRevoke(pin, NOW);
    const first = await service(w).revokeReviewedManagerDomainGrants(verified);
    const parsed = verifiedManagerRevoke(verified)!.document, digest = managerRevokeRequestDigest(parsed), writes = w.writes.length;
    w.replayOnly = true; // what the real trigger enforces for a FINISHED intent being replayed
    const replay = await (service(w) as any).revokeManagerDomainOn(w.client, parsed, digest, true);
    w.replayOnly = false;
    expect(replay.map((r: any) => r.receipt_id)).toEqual(first.map(r => r.receipt_id));
    expect(w.writes).toHaveLength(writes);
  });
});

describe("typed refusals, nothing written", () => {
  const untouched = (w: FakeCoreWorld, before: string) => { expect(JSON.stringify([...w.grants])).toBe(before); expect(w.events).toEqual([]); expect(w.drain).toBeNull(); };
  it("an unknown grant id is refused (404) BEFORE any intent exists; an earlier valid item in the same artifact is not applied", async () => {
    const w = makeWorld(), before = JSON.stringify([...w.grants]);
    await expect(revoke(w, document([item(READ), { ...item(STREAM), grant_id: "TEST_ONLY-unknown" }]))).rejects.toSatisfy(typed("MANAGER_REVOKE_GRANT_NOT_FOUND"));
    untouched(w, before); expect(w.coordinator.intents.size).toBe(0);
  });
  it("another workspace's grant id is indistinguishable from unknown and stays untouched", async () => {
    const w = makeWorld(), before = JSON.stringify([...w.grants]);
    await expect(revoke(w, document([item(foreign)]))).rejects.toSatisfy(typed("MANAGER_REVOKE_GRANT_NOT_FOUND"));
    untouched(w, before);
    expect(grantFact(w, foreign.grant_id)).toEqual(foreign);
  });
  it("a legacy scoped grant is never touched through this path", async () => {
    const w = makeWorld(), before = JSON.stringify([...w.grants]);
    await expect(revoke(w, document([{ mode: "REVOKE", grant_id: legacy.grant_id, action: "business.read_all", expected_grant_revision: legacy.revision }])))
      .rejects.toSatisfy(typed("MANAGER_REVOKE_GRANT_NOT_MANAGER_DOMAIN"));
    untouched(w, before);
  });
  it("the wrong action for an existing id (READ named as STREAM) and a stale expected revision are typed conflicts", async () => {
    const w = makeWorld(), before = JSON.stringify([...w.grants]);
    await expect(revoke(w, document([{ ...item(READ), action: "stream.subscribe" }]))).rejects.toSatisfy(typed("MANAGER_REVOKE_ACTION_MISMATCH"));
    await expect(revoke(w, document([{ ...item(READ), expected_grant_revision: "stale" }]))).rejects.toSatisfy(typed("MANAGER_REVOKE_REVISION_CONFLICT"));
    untouched(w, before);
  });
  it("NARROW may only shorten: later, equal, past or pre-start windows are refused", async () => {
    const w = makeWorld(), before = JSON.stringify([...w.grants]);
    for (const [until, code] of [[READ.valid_until_ms + 1, "MANAGER_REVOKE_NARROW_NOT_EARLIER"], [READ.valid_until_ms, "MANAGER_REVOKE_NARROW_NOT_EARLIER"],
      [NOW, "MANAGER_REVOKE_NARROW_INVALID"], [READ.valid_from_ms, "MANAGER_REVOKE_NARROW_INVALID"]] as const)
      await expect(revoke(w, document([item(READ, "NARROW", { valid_until_ms: until })]))).rejects.toSatisfy(typed(code));
    untouched(w, before);
  });
  it("the wrong physical database / system id / login or an owner anchor that is not the pinned owner refuses with no coordinator call", async () => {
    for (const axis of ["db", "system", "login"] as const) {
      const w = makeWorld({ database: { db: T.database_name, system: T.database_system_identifier, login: T.role_name, [axis]: "wrong" } });
      await expect(revoke(w, document([item(READ)]))).rejects.toSatisfy(typed("MANAGER_REVOKE_TARGET_MISMATCH"));
      expect(w.coordinator.calls).toEqual([]); expect(w.writes).toEqual([]);
    }
    const w = makeWorld({ owner: "usr_someone_else", members: ["usr_someone_else"] });
    await expect(revoke(w, document([item(READ)]))).rejects.toSatisfy(typed("MANAGER_REVOKE_TARGET_MISMATCH"));
    expect(w.writes).toEqual([]);
  });
  it("a workspace without a reviewed owner policy is not commissioned", async () => {
    const w = makeWorld({ policy: null });
    await expect(revoke(w, document([item(READ)]))).rejects.toSatisfy(typed("MANAGER_REVOKE_NOT_COMMISSIONED"));
    expect(w.writes).toEqual([]);
  });
  it("open native custody / drain: typed retry-required, the SAME artifact is retried later; nothing was written", async () => {
    const w = makeWorld(); w.unresolvedObligations = 1;
    await expect(revoke(w, document([item(READ)]))).rejects.toSatisfy(typed("MANAGER_REVOKE_DRAIN_PENDING"));
    expect(w.writes).toEqual([]); expect(grantFact(w, READ.grant_id)).toEqual(READ);
    w.unresolvedObligations = 0;
    await expect(revoke(w, document([item(READ)]))).resolves.toMatchObject([{ outcome: "REVOKED" }]);
  });
  it("a failure after the intent exists keeps the intent PENDING and rolls the grant back; the exact retry then completes once", async () => {
    const w = makeWorld(), doc = document([item(READ), item(STREAM)]);
    let broke = false;
    const original = w.client.query as any;
    (w.client as any).query = vi.fn(async (sql: string, params?: unknown[]) => {
      if (!broke && /^INSERT INTO portal_access_policy_events/.test(sql.trim()) && (params as string[])[8] === STREAM.grant_id) { broke = true; throw new Error("injected audit append failure"); }
      return original(sql, params);
    });
    await expect(revoke(w, doc)).rejects.toThrow("injected");
    expect(grantFact(w, READ.grant_id)).toEqual(READ); expect(grantFact(w, STREAM.grant_id)).toEqual(STREAM); expect(w.events).toEqual([]);
    expect(w.drain).not.toBeNull(); // retained intent: the same key resumes it
    const receipts = await revoke(w, doc);
    expect(receipts.map(r => r.outcome)).toEqual(["REVOKED", "REVOKED"]); expect(w.drain).toBeNull(); expect(w.events).toHaveLength(2);
  });
});

describe("typed no-ops: already denying grants are never rewritten", () => {
  it("an expired grant is a typed NOOP_EXPIRED: the grant row is not written, the audit row still records the decision", async () => {
    const w = makeWorld({ now: NOW + 3 * 3_600_000 });
    const receipts = await revoke(w, document([item(READ)]));
    expect(receipts[0]).toMatchObject({ outcome: "NOOP_EXPIRED", grant_revision_after: READ.revision, revoked_at_ms: null });
    expect(w.writes).not.toContain("UPDATE portal_access_grants_v2");
    expect(grantFact(w, READ.grant_id)).toEqual(READ);
    expect(w.events[0]!.receipt).toMatchObject({ outcome: "DENIED", http_status: 200, reason_code: "NOOP_EXPIRED" });
  });
  it("an already revoked grant is NOOP_ALREADY_REVOKED even from a different artifact, whatever revision it names", async () => {
    const w = makeWorld(); await revoke(w, document([item(READ)]));
    const receipts = await revoke(w, document([{ ...item(READ), expected_grant_revision: "anything" }], { revocation_id: "TEST_ONLY-revocation-2" }));
    expect(receipts[0]).toMatchObject({ outcome: "NOOP_ALREADY_REVOKED" });
    expect(w.events).toHaveLength(2);
  });
});

describe("concurrency with the readers (same advisory key, fail closed, no second authority)", () => {
  it("the revoke takes EXACTLY the workspace advisory key the current-human readers try-lock", async () => {
    const w = makeWorld(); await read(w);
    const readerKeys = new Set(w.advisoryKeys); w.advisoryKeys.length = 0;
    await revoke(w, document([item(READ)]));
    expect(readerKeys).toEqual(new Set([`portal-access-v2:${T.workspace_id}`]));
    expect(new Set(w.advisoryKeys)).toEqual(readerKeys);
  });
  it("a reader holding the lock makes the revoke fail closed (retry-required) with nothing written; a revoke holding it makes the READ retry (409), not allow", async () => {
    const w = makeWorld(); w.advisoryHeldElsewhere = true;
    await expect(revoke(w, document([item(READ)]))).rejects.toSatisfy(typed("MANAGER_REVOKE_RETRY_REQUIRED"));
    expect(w.writes).toEqual([]);
    await expect(read(w)).rejects.toSatisfy(denied("ACCESS_RETRY_REQUIRED"));
    await expect(stream(w)).rejects.toSatisfy(denied("ACCESS_RETRY_REQUIRED"));
  });
  it("read-before is consistent with the old facts, read-after with the new: there is no state in which a revoked grant authorizes", async () => {
    const w = makeWorld(), before = await read(w);
    await revoke(w, document([item(READ)]));
    await expect(read(w, before.scope_digest)).rejects.toSatisfy(denied("ACCESS_DENIED"));
    await expect(read(w)).rejects.toSatisfy(denied("ACCESS_DENIED"));
  });
});

describe("artifact boundary: only a root-owned, hash-pinned, in-window, on-target file mints a token", () => {
  const refusedCode = typed("MANAGER_REVOKE_ARTIFACT_REFUSED");
  it.each([
    ["not root-owned", (d: object) => mount(d, { uid: 1000 })],
    ["group/other readable", (d: object) => mount(d, { mode: 0o100640 })],
    ["symlink", (d: object) => mount(d, { link: true })],
    ["oversized", (d: object) => mount(d, { size: 131073 })],
  ])("%s", async (_name, arrange) => {
    const pin = arrange(document([item(READ)]));
    await expect(readPinnedManagerRevoke(pin, NOW)).rejects.toSatisfy(refusedCode);
  });
  it("wrong hash, pretty JSON, unknown key, target other than the pin, duplicate grant, window closed or longer than 24 h", async () => {
    const doc = document([item(READ)]);
    const pin = mount(doc);
    await expect(readPinnedManagerRevoke({ ...pin, approved_sha256: "0".repeat(64) }, NOW)).rejects.toSatisfy(refusedCode);
    const pretty = Buffer.from(JSON.stringify(doc, null, 2)); files.set(PATH, { bytes: pretty, uid: 0, mode: 0o100600, ino: ++serial });
    await expect(readPinnedManagerRevoke({ ...pin, approved_sha256: sha256(pretty) }, NOW)).rejects.toSatisfy(refusedCode);
    for (const bad of [{ ...doc, extra: 1 }, document([item(READ), item(READ)]), document([item(READ)], { target: { ...T, workspace_id: "ws_other" } }),
      document([]), document([item(READ)], { schema_version: "portal.private-owner-manager-revoke.v0" })]) {
      await expect(readPinnedManagerRevoke(mount(bad), NOW)).rejects.toSatisfy(refusedCode);
    }
    const ok = mount(doc);
    await expect(readPinnedManagerRevoke(ok, NOW + 11 * 3_600_000)).rejects.toSatisfy(refusedCode);
    await expect(readPinnedManagerRevoke(ok, NOW - 61_000)).rejects.toSatisfy(refusedCode);
    await expect(readPinnedManagerRevoke({ ...ok, not_after_ms: ok.not_before_ms + 25 * 3_600_000 }, NOW)).rejects.toSatisfy(refusedCode);
    await expect(readPinnedManagerRevoke({ ...ok, target: { ...T, database_system_identifier: "1" } }, NOW)).rejects.toSatisfy(refusedCode);
  });
  it("a copied JSON object, a hash or reviewed=true is not a token: the service refuses before any query", async () => {
    const w = makeWorld(), svc = service(w);
    for (const forged of [{}, document([item(READ)]), { kind: "VERIFIED_MANAGER_REVOKE" }, null, "reviewed"])
      await expect(svc.revokeReviewedManagerDomainGrants(forged)).rejects.toSatisfy(refusedCode);
    expect(w.pool.connect).not.toHaveBeenCalled(); expect(w.coordinator.calls).toEqual([]);
  });
  it("a service without a coordinator cannot revoke", async () => {
    const w = makeWorld(), pin = mount(document([item(READ)]));
    const bare = new ExecutionAccessService(w.pool, {} as AuthService, unqualifiedAccessTrust);
    await expect(bare.revokeReviewedManagerDomainGrants(await readPinnedManagerRevoke(pin, NOW))).rejects.toSatisfy(refusedCode);
  });
});

describe("remove-only invariant (pure)", () => {
  const ctx = { workspace_id: T.workspace_id, protected_owner_user_id: T.protected_owner_user_id, now_ms: NOW, newRevision: () => "new-rev" };
  it("the planner output never differs from the stored grant except revision and exactly one of revoked_at_ms / valid_until_ms", () => {
    const parsed = (d: object) => (d as any);
    const [revoked] = planManagerRevoke([{ kind: "MANAGER_DOMAIN", fact: READ }], parsed(document([item(READ)])), ctx);
    expect(revoked!.after).toEqual({ ...READ, revision: "new-rev", revoked_at_ms: NOW });
    const [narrowed] = planManagerRevoke([{ kind: "MANAGER_DOMAIN", fact: READ }], parsed(document([item(READ, "NARROW", { valid_until_ms: NOW + 1000 })])), ctx);
    expect(narrowed!.after).toEqual({ ...READ, revision: "new-rev", valid_until_ms: NOW + 1000 });
  });
  it.each([
    ["a later validity", (g: any) => ({ ...g, revision: "n", valid_until_ms: g.valid_until_ms + 1 })],
    ["another subject", (g: any) => ({ ...g, revision: "n", revoked_at_ms: NOW, subject_user_id: "usr_x" })],
    ["a changed domain", (g: any) => ({ ...g, revision: "n", revoked_at_ms: NOW, domain: { ...g.domain, field_policy_sha256: "9".repeat(64) } })],
    ["no revision change", (g: any) => ({ ...g, revoked_at_ms: NOW })],
    ["both fields at once", (g: any) => ({ ...g, revision: "n", revoked_at_ms: NOW, valid_until_ms: g.valid_until_ms - 1 })],
    ["a flipped effect", (g: any) => ({ ...g, revision: "n", revoked_at_ms: NOW, effect: "DENY" })],
  ])("assertManagerRevokeNeverWidens rejects %s", (_n, mutate) => {
    expect(() => assertManagerRevokeNeverWidens(READ, mutate(READ))).toThrow(ManagerRevokeError);
  });
  it("an already revoked grant can never be 'un-revoked' or re-dated by a later plan", () => {
    const revoked = { ...READ, revoked_at_ms: NOW };
    expect(() => assertManagerRevokeNeverWidens(revoked, { ...revoked, revision: "n", revoked_at_ms: null })).toThrow(ManagerRevokeError);
    expect(() => assertManagerRevokeNeverWidens(revoked, { ...revoked, revision: "n", revoked_at_ms: NOW + 1 })).toThrow(ManagerRevokeError);
  });
  it("the drain pending class is the one the coordinator throws", () => {
    expect(new CurrentHumanMutationPending("m", "DRAIN_PENDING").code).toBe("CURRENT_HUMAN_MUTATION_PENDING");
  });
});

/* BE-P18: the in-process stream hint after the official revoke. The CLI runs in its own process, so the hint is inert there; these prove
 * what an in-process caller sees: the grantee is hinted once, after the commit, only for grants whose row really changed, and a hint that
 * throws changes nothing about the receipts. The hint is never authority: the evaluators above still decide. */
describe("BE-P18 revoke hints the grantee's streams after the commit, and only when a grant row changed", () => {
  const hinted = (w: FakeCoreWorld, over: { throwing?: boolean } = {}) => {
    const calls: Array<{ user: string; events: number }> = [];
    const auth = { streamHints: { userAuthorityChanged: (user: string) => { calls.push({ user, events: w.events.length }); if (over.throwing) throw new Error("TEST_ONLY hint broke"); } } };
    const svc = new ExecutionAccessService(w.pool, auth as unknown as AuthService, unqualifiedAccessTrust, false, w.coordinator.asMutations());
    return { calls, svc };
  };
  const run = async (svc: ExecutionAccessService, doc: object) => svc.revokeReviewedManagerDomainGrants(await readPinnedManagerRevoke(mount(doc), NOW));

  it("REVOKE of READ and STREAM (one subject) hints that subject once, with the audit rows already written", async () => {
    const w = makeWorld(), { calls, svc } = hinted(w);
    await run(svc, document([item(READ), item(STREAM)]));
    expect(calls).toEqual([{ user: T.protected_owner_user_id, events: 2 }]);
  });
  it("NARROW hints too; a typed no-op (already revoked, expired) and an exact replay do not", async () => {
    const w = makeWorld(), { calls, svc } = hinted(w);
    await run(svc, document([item(READ, "NARROW", { valid_until_ms: NOW + 20 * 60_000 })]));
    expect(calls).toHaveLength(1);
    await run(svc, document([item(READ, "NARROW", { valid_until_ms: NOW + 20 * 60_000 })]));      // exact replay of the same revocation_id
    expect(calls).toHaveLength(1);
    const done = makeWorld(), second = hinted(done);
    await run(second.svc, document([item(READ)]));
    await run(second.svc, document([{ ...item(READ), expected_grant_revision: "anything" }], { revocation_id: "TEST_ONLY-revocation-2" }));
    expect(second.calls).toHaveLength(1);                                                         // the second artifact was NOOP_ALREADY_REVOKED
    const expired = makeWorld({ now: NOW + 3 * 3_600_000 }), third = hinted(expired);
    await run(third.svc, document([item(READ)]));
    expect(third.calls).toEqual([]);
  });
  it("a refused artifact hints nothing, and a throwing hint changes neither the receipts nor the stored facts", async () => {
    const w = makeWorld(), { calls, svc } = hinted(w);
    await expect(svc.revokeReviewedManagerDomainGrants({} as never)).rejects.toSatisfy(typed("MANAGER_REVOKE_ARTIFACT_REFUSED"));
    await expect(run(svc, document([{ ...item(READ), expected_grant_revision: "stale" }]))).rejects.toBeInstanceOf(ManagerRevokeError);
    expect(calls).toEqual([]);
    const bare = makeWorld(), loud = hinted(bare, { throwing: true }), quiet = makeWorld(), plain = hinted(quiet);
    const loudReceipts = await run(loud.svc, document([item(READ)])), plainReceipts = await run(plain.svc, document([item(READ)]));
    expect(loud.calls).toHaveLength(1);
    expect(loudReceipts.map(r => [r.grant_id, r.outcome, r.revoked_at_ms])).toEqual(plainReceipts.map(r => [r.grant_id, r.outcome, r.revoked_at_ms]));
    await expect(read(bare)).rejects.toSatisfy(denied("ACCESS_DENIED"));
  });
});
