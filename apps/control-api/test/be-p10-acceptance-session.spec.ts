/** BE-P10 task 3. TEST_ONLY, fakes only (fake root-owned filesystem and token sink, scripted in-memory Core
 * world, fake coordinator, the REAL AuthService): NOT PostgreSQL, NOT a real session, NOT a runtime.
 * Proves the offline reviewed issuer/revoker of ONE temporary Research acceptance session for the exact
 * protected owner: issued by the actual AuthService, TTL-capped, the token reaches ONLY the root-owned 0600 sink,
 * one active session at a time, revoke touches exactly that session and nothing else, wrong owner/target refused. */
import { constants } from "node:fs";
import { lstat, open, unlink } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthService, RESEARCH_ACCEPTANCE_ACCESS_SUBJECT, type SessionResult } from "../src/auth/auth.service";
import { sha256 as tokenHash } from "../src/auth/argon";
import { withTransaction } from "../src/db/pool";
import { evaluateManagerDomainRead } from "../src/execution-v2/current-human-snapshot";
import { ACCEPTANCE_EVIDENCE_CLASS, ACCEPTANCE_ISSUE_SCHEMA, ACCEPTANCE_REVOKE_SCHEMA, AcceptanceSessionError, nodeAcceptanceTokenFiles,
  privateAcceptanceSession, readPinnedAcceptanceIssue, type AcceptanceArtifactPin, type AcceptanceTokenFiles } from "../src/execution-v2/research-acceptance-session";
import { NOW, OWNER_STREAM_TEMPLATE, prepared, sha256 } from "./fixtures/core009-templates";
import { FakeCoreWorld } from "./fixtures/fake-core-world";

vi.mock("node:fs/promises", async original => ({ ...await original<typeof import("node:fs/promises")>(), lstat: vi.fn(), open: vi.fn(), unlink: vi.fn() }));
type File = { bytes: Buffer; uid: number; mode: number; ino: number; link?: boolean; size?: number };
const files = new Map<string, File>();
const ART = "/root/TEST_ONLY-session-artifact.json", TOKEN = "/root/TEST_ONLY-session/token.json";
let serial = 0;
const stat = (f: File) => ({ uid: f.uid, mode: f.mode, ino: f.ino, dev: 1, size: f.size ?? f.bytes.length, isFile: () => !f.link, isSymbolicLink: () => Boolean(f.link) });
beforeEach(() => {
  files.clear(); vi.clearAllMocks(); vi.mocked(unlink).mockResolvedValue(undefined); vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(NOW);
  vi.mocked(lstat).mockImplementation((async (path: unknown) => { const f = files.get(String(path)); if (!f) throw Error("ENOENT"); return stat(f); }) as any);
  vi.mocked(open).mockImplementation((async (path: unknown) => {
    const f = files.get(String(path)); if (!f) throw Error("ENOENT");
    let offset = 0;
    return { stat: async () => stat(f), close: vi.fn(async () => undefined), read: async (buffer: Buffer, start: number, length: number) => {
      const count = Math.min(length, f.bytes.length - offset);
      if (count > 0) f.bytes.copy(buffer, start, offset, offset + count); offset += count; return { bytesRead: count, buffer };
    } };
  }) as any);
});
afterEach(() => { vi.useRealTimers(); });

const reviewed = prepared(OWNER_STREAM_TEMPLATE);
const T = reviewed.ownerValue.target, OWNER = T.protected_owner_user_id;
const [READ, STREAM] = reviewed.ownerValue.manager_domain_grants as any[];
const CONFIG = { AUTH_MODE: "dev", PORTAL_ENV: "local", SESSION_IDLE_SECONDS: 1800, SESSION_ABSOLUTE_SECONDS: 86400 } as any;

class MemoryTokenFiles implements AcceptanceTokenFiles {
  readonly store = new Map<string, Buffer>(); failWrite = false; refuseCreate = false; removeThrows = false;
  async create(path: string) {
    if (this.refuseCreate || this.store.has(path)) throw new AcceptanceSessionError("ACCEPTANCE_TOKEN_FILE_REFUSED", 503);
    this.store.set(path, Buffer.alloc(0));
    return { write: async (bytes: Buffer) => { if (this.failWrite) throw new Error("disk full"); this.store.set(path, Buffer.from(bytes)); },
      abandon: async () => { this.store.delete(path); } };
  }
  async remove(path: string) { if (this.removeThrows) throw new Error("busy"); if (!this.store.has(path)) return "ABSENT" as const; this.store.delete(path); return "REMOVED" as const; }
}
function makeWorld(over: Partial<ConstructorParameters<typeof FakeCoreWorld>[0]> = {}) {
  return new FakeCoreWorld({ now: NOW, database: { db: T.database_name, system: T.database_system_identifier, login: T.role_name },
    owner: OWNER, workspace: T.workspace_id, members: [OWNER], policy: reviewed.ownerValue.policy, grants: [READ, STREAM], ...over });
}
function rig(w = makeWorld(), config = CONFIG) {
  const auth = new AuthService(w.pool, config, {} as any, w.coordinator.asMutations());
  const sink = new MemoryTokenFiles();
  const deps = { auth, pool: w.pool, mutations: w.coordinator.asMutations(), files: sink };
  return { w, auth, sink, deps };
}
const issueDoc = (over: object = {}) => ({ schema_version: ACCEPTANCE_ISSUE_SCHEMA, target: T, user_id: OWNER, ttl_seconds: 3600, token_path: TOKEN,
  approval_ref: "TEST_ONLY-NOT-REAL-APPROVAL", provenance_ref: "TEST_ONLY-review", ...over });
const revokeDoc = (sessionId: string, over: object = {}) => ({ schema_version: ACCEPTANCE_REVOKE_SCHEMA, target: T, session_id: sessionId, user_id: OWNER,
  token_path: TOKEN, approval_ref: "TEST_ONLY-NOT-REAL-APPROVAL", provenance_ref: "TEST_ONLY-review", ...over });
function mount(doc: object, over: Partial<File> = {}): AcceptanceArtifactPin {
  const bytes = Buffer.from(JSON.stringify(doc), "utf8");
  files.set(ART, { bytes, uid: 0, mode: 0o100600, ino: ++serial, ...over });
  return { artifact_path: ART, approved_sha256: sha256(bytes), target: T, not_before_ms: NOW - 60_000, not_after_ms: NOW + 6 * 3_600_000 };
}
const issue = (r: ReturnType<typeof rig>, doc: object = issueDoc()) => privateAcceptanceSession(r.deps, mount(doc), () => NOW).issue();
const revokeBy = (r: ReturnType<typeof rig>, doc: object) => privateAcceptanceSession(r.deps, mount(doc), () => NOW).revoke();
const code = (c: string) => (e: unknown) => e instanceof AcceptanceSessionError && e.code === c && e.message === "The requested access is not available.";
const acceptanceRows = (w: FakeCoreWorld) => [...w.sessions.values()].filter(s => s.access_subject === RESEARCH_ACCEPTANCE_ACCESS_SUBJECT);
const tokenOf = (r: ReturnType<typeof rig>) => JSON.parse(r.sink.store.get(TOKEN)!.toString("utf8"));

describe("issue: ONE session for the exact protected owner through the actual AuthService", () => {
  it("creates exactly one ACTIVE session whose principal is the owner, marked as a Research acceptance session, and a secret-free receipt", async () => {
    const r = rig(), receipt = await issue(r);
    const rows = acceptanceRows(r.w);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ user_id: OWNER, state: "ACTIVE", access_subject: RESEARCH_ACCEPTANCE_ACCESS_SUBJECT, session_version: 3 });
    expect(receipt).toMatchObject({ schema_version: "portal.research-acceptance-session-receipt.v1", session_id: rows[0]!.session_id, user_id: OWNER,
      workspace_id: T.workspace_id, ttl_seconds: 3600, credential_class: "RESEARCH_APPLICATION_SESSION", evidence_class: ACCEPTANCE_EVIDENCE_CLASS,
      token_file: { owner_uid: 0, mode: "0600", bytes: expect.any(Number), path_sha256: expect.stringMatching(/^[0-9a-f]{64}$/) } });
    expect(ACCEPTANCE_EVIDENCE_CLASS).toMatch(/NOT_CLOUDFLARE.*NOT_PASSWORD.*NOT_HUMAN_PRESENCE/);
    expect(r.w.coordinator.calls).toEqual([{ family: "VERIFIED_AUTH_ISSUANCE", operation: "RESEARCH_ACCEPTANCE", key: expect.stringMatching(/^sha256:/) }]);
  });
  it("the session is the genuine thing: it passes the real current-human lease check and authorizes through the installed READ grant", async () => {
    const r = rig(), receipt = await issue(r);
    const actor = { user_id: OWNER, session_id: receipt.session_id, session_generation: 3 };
    const d = await withTransaction(r.w.pool, db => evaluateManagerDomainRead(db, { actor, workspace_id: T.workspace_id, environment: "paper", domain: READ.domain }));
    expect(d).toMatchObject({ grant_id: READ.grant_id, actor });
  });
  it("the TTL is capped: absolute AND idle never exceed the artifact TTL, which itself is <= 2 h", async () => {
    const r = rig(), receipt = await issue(r, issueDoc({ ttl_seconds: 7200 }));
    expect(Date.parse(receipt.absolute_expires_at)).toBe(NOW + 7200 * 1000);
    expect(Date.parse(receipt.idle_expires_at)).toBeLessThanOrEqual(NOW + 1800 * 1000);
    const short = rig(undefined, { ...CONFIG, SESSION_ABSOLUTE_SECONDS: 900 }), receipt2 = await issue(short, issueDoc({ ttl_seconds: 3600 }));
    expect(Date.parse(receipt2.absolute_expires_at)).toBe(NOW + 900 * 1000); // the service limit also applies, never extended
    for (const ttl of [7201, 59, 0, -1, 1.5]) await expect(issue(rig(), issueDoc({ ttl_seconds: ttl }))).rejects.toSatisfy(code("ACCEPTANCE_ARTIFACT_REFUSED"));
  });
  it("the token reaches ONLY the sink: its hash is the stored session hash; it is in no receipt, audit row, event, log or stdout", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map(m => vi.spyOn(console, m).mockImplementation(() => undefined));
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true), stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const r = rig(), receipt = await issue(r), file = tokenOf(r);
    expect(file).toMatchObject({ schema_version: "portal.research-acceptance-session-token.v1", session_id: receipt.session_id, user_id: OWNER,
      cookie_name: "__Host-portal_session", absolute_expires_at: receipt.absolute_expires_at });
    expect(tokenHash(file.token)).toBe(r.w.sessions.get(receipt.session_id)!.session_token_hash);
    expect(file.token).toMatch(/^[A-Za-z0-9_-]{32,}$/);
    const everywhere = JSON.stringify([receipt, r.w.audit, r.w.events, [...r.w.sessions.values()], r.w.coordinator.calls, spies.flatMap(s => s.mock.calls), stdout.mock.calls, stderr.mock.calls]);
    expect(everywhere).not.toContain(file.token);
    expect(r.w.audit).toEqual([expect.objectContaining({ event_type: "research_acceptance_session_issued", reason_code: "RESEARCH_ACCEPTANCE_SESSION", actor_user_id: OWNER })]);
    expect(Object.keys(r.w.audit[0]!.metadata).sort()).toEqual(["absolute_expires_at", "artifact_sha256", "schema_version", "session_id", "ttl_seconds"]);
    vi.restoreAllMocks();
  });
  it("a second issue while one is active is REFUSED (never replaces); its empty sink is removed; the first stays intact; after revoke a new one is allowed", async () => {
    const r = rig(), first = await issue(r), token = r.sink.store.get(TOKEN)!;
    await expect(privateAcceptanceSession(r.deps, mount(issueDoc({ token_path: "/root/TEST_ONLY-session/second.json" })), () => NOW).issue())
      .rejects.toSatisfy(code("ACCEPTANCE_ALREADY_ACTIVE"));
    expect(acceptanceRows(r.w)).toHaveLength(1); expect(r.sink.store.has("/root/TEST_ONLY-session/second.json")).toBe(false);
    expect(r.sink.store.get(TOKEN)).toBe(token); expect(r.w.sessions.get(first.session_id)!.state).toBe("ACTIVE");
    await revokeBy(r, revokeDoc(first.session_id));
    const again = await issue(r);
    expect(again.session_id).not.toBe(first.session_id); expect(acceptanceRows(r.w).filter(s => s.state === "ACTIVE")).toHaveLength(1);
  });
  it("an existing NORMAL session of the owner neither blocks the issue nor is touched", async () => {
    const w = makeWorld(); const normal = w.addSession({ session_id: "TEST_ONLY-normal", user_id: OWNER });
    const r = rig(w); await issue(r);
    expect(w.sessions.get("TEST_ONLY-normal")).toEqual(normal); expect(w.sessions.get("TEST_ONLY-normal")!.state).toBe("ACTIVE");
  });
  it.each([
    ["an artifact user that is not the protected owner", () => rig(), issueDoc({ user_id: "usr_someone_else" }), "ACCEPTANCE_ARTIFACT_REFUSED"],
    ["an owner anchor that is not the pinned owner", () => rig(makeWorld({ owner: "usr_someone_else", members: [OWNER], users: [
      { user_id: OWNER, username: "o", status: "ACTIVE", must_change_password: false, session_version: 3, role: "ADMIN", archived_at: null },
      { user_id: "usr_someone_else", username: "s", status: "ACTIVE", must_change_password: false, session_version: 3, role: "ADMIN", archived_at: null }] })), issueDoc(), "ACCEPTANCE_TARGET_MISMATCH"],
    ["an owner that is not a member of the pinned workspace", () => rig(makeWorld({ members: [] })), issueDoc(), "ACCEPTANCE_TARGET_MISMATCH"],
    ["the wrong physical database", () => rig(makeWorld({ database: { db: "wrong", system: T.database_system_identifier, login: T.role_name } })), issueDoc(), "ACCEPTANCE_TARGET_MISMATCH"],
    ["the wrong system identifier", () => rig(makeWorld({ database: { db: T.database_name, system: "1", login: T.role_name } })), issueDoc(), "ACCEPTANCE_TARGET_MISMATCH"],
    ["a DISABLED owner", () => rig(makeWorld({ users: [{ user_id: OWNER, username: "o", status: "DISABLED", must_change_password: false, session_version: 3, role: "ADMIN", archived_at: null }] })), issueDoc(), "ACCEPTANCE_UNAVAILABLE"],
    ["an owner who must change the password", () => rig(makeWorld({ users: [{ user_id: OWNER, username: "o", status: "ACTIVE", must_change_password: true, session_version: 3, role: "ADMIN", archived_at: null }] })), issueDoc(), "ACCEPTANCE_UNAVAILABLE"],
    ["an archived owner", () => rig(makeWorld({ users: [{ user_id: OWNER, username: "o", status: "ACTIVE", must_change_password: false, session_version: 3, role: "ADMIN", archived_at: new Date(0) }] })), issueDoc(), "ACCEPTANCE_UNAVAILABLE"],
    ["a non-dev / non-local service", () => rig(makeWorld(), { ...CONFIG, PORTAL_ENV: "production" }), issueDoc(), "ACCEPTANCE_UNAVAILABLE"],
  ])("refuses %s: no session, no leftover token file", async (_name, build, doc, expected) => {
    const r = build();
    await expect(issue(r, doc)).rejects.toSatisfy(code(expected));
    expect(acceptanceRows(r.w)).toHaveLength(0); expect(r.sink.store.size).toBe(0);
  });
  it("a sink that cannot be created exclusively refuses BEFORE any session exists", async () => {
    const r = rig(); r.sink.refuseCreate = true;
    await expect(issue(r)).rejects.toSatisfy(code("ACCEPTANCE_TOKEN_FILE_REFUSED"));
    expect(acceptanceRows(r.w)).toHaveLength(0); expect(r.w.coordinator.calls).toEqual([]);
  });
  it("a write failure AFTER the session committed revokes that exact session at once and reports it", async () => {
    const r = rig(); r.sink.failWrite = true;
    await expect(issue(r)).rejects.toSatisfy(code("ACCEPTANCE_TOKEN_WRITE_FAILED_SESSION_REVOKED"));
    const rows = acceptanceRows(r.w);
    expect(rows).toHaveLength(1); expect(rows[0]).toMatchObject({ state: "REVOKED", revoke_reason: "research_acceptance_revoked" });
    expect(r.sink.store.size).toBe(0);
  });
  it("a service without the coordinator cannot issue (the unattributed AuthService path is not used)", async () => {
    const w = makeWorld(), auth = new AuthService(w.pool, CONFIG, {} as any);
    await expect(auth.issueResearchAcceptanceSession({ userId: OWNER, ttlSeconds: 3600, artifactSha256: "a".repeat(64) })).rejects.toMatchObject({ code: "ACCEPTANCE_SESSION_SCOPE_REQUIRED" });
    expect(acceptanceRows(w)).toHaveLength(0);
  });
});

describe("revoke: exactly that session, nothing else", () => {
  it("revokes the acceptance session (state REVOKED, owner's lease check fails at once), wipes the token file, touches no other session", async () => {
    const w = makeWorld(); w.addSession({ session_id: "TEST_ONLY-normal", user_id: OWNER });
    const r = rig(w), issued = await issue(r), normalBefore = structuredClone(w.sessions.get("TEST_ONLY-normal"));
    const receipt = await revokeBy(r, revokeDoc(issued.session_id));
    expect(receipt).toEqual({ schema_version: "portal.research-acceptance-session-revoke-receipt.v1", session_id: issued.session_id, user_id: OWNER,
      outcome: "REVOKED", session_state_before: "ACTIVE", token_file: "REMOVED", other_sessions_touched: 0 });
    expect(w.sessions.get(issued.session_id)).toMatchObject({ state: "REVOKED", revoke_reason: "research_acceptance_revoked" });
    expect(w.sessions.get("TEST_ONLY-normal")).toEqual(normalBefore);
    expect(r.sink.store.size).toBe(0);
    const actor = { user_id: OWNER, session_id: issued.session_id, session_generation: 3 };
    await expect(withTransaction(w.pool, db => evaluateManagerDomainRead(db, { actor, workspace_id: T.workspace_id, environment: "paper", domain: READ.domain })))
      .rejects.toMatchObject({ code: "CURRENT_ACTOR_AUTHORITY_REQUIRED" });
    expect(w.audit.map(a => a.event_type)).toEqual(["research_acceptance_session_issued", "research_acceptance_session_revoked"]);
    expect(w.coordinator.calls.at(-1)).toMatchObject({ family: "REVIEWED_POLICY", operation: "REVOKE_ACCEPTANCE_SESSION" });
  });
  it("is idempotent: the same artifact again is a read-only replay; another artifact on a terminal session is a typed no-op", async () => {
    const r = rig(), issued = await issue(r), doc = revokeDoc(issued.session_id);
    await revokeBy(r, doc);
    const writes = r.w.writes.length;
    expect(await revokeBy(r, doc)).toMatchObject({ outcome: "ALREADY_REVOKED_BY_THIS_OPERATION", session_state_before: "REVOKED", token_file: "ABSENT" });
    expect(await revokeBy(r, revokeDoc(issued.session_id, { approval_ref: "TEST_ONLY-other" }))).toMatchObject({ outcome: "ALREADY_REVOKED_BY_THIS_OPERATION" });
    expect(r.w.writes).toHaveLength(writes);
  });
  it("an expired session is a no-op that still removes the dead token file", async () => {
    const r = rig(), issued = await issue(r);
    r.w.sessions.get(issued.session_id)!.state = "EXPIRED";
    expect(await revokeBy(r, revokeDoc(issued.session_id))).toMatchObject({ outcome: "ALREADY_TERMINAL", session_state_before: "EXPIRED", token_file: "REMOVED" });
  });
  it("refuses to touch any session that is not a Research acceptance session of the pinned owner", async () => {
    const w = makeWorld(); w.addSession({ session_id: "TEST_ONLY-normal", user_id: OWNER });
    w.addSession({ session_id: "TEST_ONLY-other-user", user_id: "usr_other", access_subject: RESEARCH_ACCEPTANCE_ACCESS_SUBJECT });
    const r = rig(w), before = JSON.stringify([...w.sessions]);
    await expect(revokeBy(r, revokeDoc("TEST_ONLY-normal"))).rejects.toSatisfy(code("ACCEPTANCE_SESSION_NOT_ACCEPTANCE"));
    await expect(revokeBy(r, revokeDoc("TEST_ONLY-other-user"))).rejects.toSatisfy(code("ACCEPTANCE_SESSION_NOT_ACCEPTANCE"));
    await expect(revokeBy(r, revokeDoc("TEST_ONLY-unknown"))).rejects.toSatisfy(code("ACCEPTANCE_SESSION_NOT_FOUND"));
    expect(JSON.stringify([...w.sessions])).toBe(before);
  });
  it("wrong owner / wrong target are refused with the session and its token file untouched", async () => {
    const r = rig(), issued = await issue(r), token = r.sink.store.get(TOKEN);
    await expect(revokeBy(r, revokeDoc(issued.session_id, { user_id: "usr_someone_else" }))).rejects.toSatisfy(code("ACCEPTANCE_ARTIFACT_REFUSED"));
    const wrong = rig(makeWorld({ database: { db: "wrong", system: T.database_system_identifier, login: T.role_name } }));
    wrong.w.sessions.set(issued.session_id, { ...r.w.sessions.get(issued.session_id)! });
    await expect(revokeBy(wrong, revokeDoc(issued.session_id))).rejects.toSatisfy(code("ACCEPTANCE_TARGET_MISMATCH"));
    expect(r.w.sessions.get(issued.session_id)!.state).toBe("ACTIVE"); expect(r.sink.store.get(TOKEN)).toBe(token);
  });
  it("open native custody keeps the revoke pending (typed retry), the session stays ACTIVE and the token file stays", async () => {
    const r = rig(), issued = await issue(r); r.w.unresolvedObligations = 1;
    await expect(revokeBy(r, revokeDoc(issued.session_id))).rejects.toSatisfy(code("ACCEPTANCE_DRAIN_PENDING"));
    expect(r.w.sessions.get(issued.session_id)!.state).toBe("ACTIVE"); expect(r.sink.store.has(TOKEN)).toBe(true);
    r.w.unresolvedObligations = 0;
    expect(await revokeBy(r, revokeDoc(issued.session_id))).toMatchObject({ outcome: "REVOKED" });
  });
  it("a token file that cannot be wiped is reported, never silently ignored, and never undoes the revoke", async () => {
    const r = rig(), issued = await issue(r); r.sink.removeThrows = true;
    expect(await revokeBy(r, revokeDoc(issued.session_id))).toMatchObject({ outcome: "REVOKED", token_file: "REMOVE_FAILED" });
    expect(r.w.sessions.get(issued.session_id)!.state).toBe("REVOKED");
  });
});

describe("artifact boundary (same root-owned, hash-pinned, finite-window model as the installer)", () => {
  it.each([
    ["not root-owned", { uid: 1000 }], ["group readable", { mode: 0o100640 }], ["symlink", { link: true }], ["oversized", { size: 131073 }],
  ])("%s", async (_n, over) => {
    await expect(readPinnedAcceptanceIssue(mount(issueDoc(), over as Partial<File>), NOW)).rejects.toSatisfy(code("ACCEPTANCE_ARTIFACT_REFUSED"));
  });
  it("wrong hash, pretty JSON, unknown key, relative or traversing token path, target mismatch, closed or >24h window", async () => {
    const ok = mount(issueDoc());
    await expect(readPinnedAcceptanceIssue({ ...ok, approved_sha256: "0".repeat(64) }, NOW)).rejects.toSatisfy(code("ACCEPTANCE_ARTIFACT_REFUSED"));
    for (const bad of [{ ...issueDoc(), extra: 1 }, issueDoc({ token_path: "relative/token.json" }), issueDoc({ token_path: "/root/../etc/token.json" }),
      issueDoc({ token_path: "/root/dir/" }), issueDoc({ target: { ...T, workspace_id: "ws_other" } }), issueDoc({ schema_version: "x" })])
      await expect(readPinnedAcceptanceIssue(mount(bad), NOW)).rejects.toSatisfy(code("ACCEPTANCE_ARTIFACT_REFUSED"));
    const pretty = Buffer.from(JSON.stringify(issueDoc(), null, 2)); files.set(ART, { bytes: pretty, uid: 0, mode: 0o100600, ino: ++serial });
    await expect(readPinnedAcceptanceIssue({ ...ok, approved_sha256: sha256(pretty) }, NOW)).rejects.toSatisfy(code("ACCEPTANCE_ARTIFACT_REFUSED"));
    const good = mount(issueDoc());
    await expect(readPinnedAcceptanceIssue(good, NOW + 7 * 3_600_000)).rejects.toSatisfy(code("ACCEPTANCE_ARTIFACT_REFUSED"));
    await expect(readPinnedAcceptanceIssue({ ...good, not_after_ms: good.not_before_ms + 25 * 3_600_000 }, NOW)).rejects.toSatisfy(code("ACCEPTANCE_ARTIFACT_REFUSED"));
  });
  it("a forged token object is not an artifact: issue/revoke refuse before any query", async () => {
    const r = rig();
    const { issueAcceptanceSession, revokeAcceptanceSession } = await import("../src/execution-v2/research-acceptance-session");
    await expect(issueAcceptanceSession(r.deps, { kind: "VERIFIED_ACCEPTANCE_ISSUE" } as any)).rejects.toSatisfy(code("ACCEPTANCE_ARTIFACT_REFUSED"));
    await expect(revokeAcceptanceSession(r.deps, {} as any)).rejects.toSatisfy(code("ACCEPTANCE_ARTIFACT_REFUSED"));
    expect(r.w.coordinator.calls).toEqual([]); expect(r.sink.store.size).toBe(0);
  });
});

describe("the default token sink (root-owned 0600, exclusive, wiped on removal)", () => {
  const dirStat = (over: object = {}) => ({ isDirectory: () => true, isSymbolicLink: () => false, uid: 0, mode: 0o40755, ...over });
  it("creates exclusively with O_EXCL|O_NOFOLLOW at 0600, then fsyncs and closes after one write", async () => {
    const handle = { chmod: vi.fn(async () => undefined), stat: vi.fn(async () => ({ isFile: () => true, uid: 0, mode: 0o100600, size: 0 })),
      write: vi.fn(async () => ({ bytesWritten: 3 })), sync: vi.fn(async () => undefined), close: vi.fn(async () => undefined) };
    vi.mocked(lstat).mockResolvedValue(dirStat() as any); vi.mocked(open).mockResolvedValue(handle as any);
    const sink = await nodeAcceptanceTokenFiles.create(TOKEN);
    expect(vi.mocked(open).mock.calls[0]).toEqual([TOKEN, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600]);
    expect(handle.chmod).toHaveBeenCalledWith(0o600);
    await sink.write(Buffer.from("abc"));
    expect(handle.sync).toHaveBeenCalledTimes(1); expect(handle.close).toHaveBeenCalledTimes(1);
  });
  it.each([
    ["a parent not owned by root", dirStat({ uid: 1000 })], ["a group-writable parent", dirStat({ mode: 0o40775 })],
    ["a symlinked parent", dirStat({ isSymbolicLink: () => true })], ["a parent that is not a directory", dirStat({ isDirectory: () => false })],
  ])("refuses %s before creating anything", async (_n, parent) => {
    vi.mocked(lstat).mockResolvedValue(parent as any);
    await expect(nodeAcceptanceTokenFiles.create(TOKEN)).rejects.toSatisfy(code("ACCEPTANCE_TOKEN_FILE_REFUSED"));
    expect(open).not.toHaveBeenCalled();
  });
  it("a created file that is not root-owned 0600 and empty is removed and refused (a non-root process cannot hold the secret)", async () => {
    for (const bad of [{ uid: 1000 }, { mode: 0o100644 }, { size: 5 }]) {
      const handle = { chmod: vi.fn(async () => undefined), stat: vi.fn(async () => ({ isFile: () => true, uid: 0, mode: 0o100600, size: 0, ...bad })),
        close: vi.fn(async () => undefined) };
      vi.mocked(lstat).mockResolvedValue(dirStat() as any); vi.mocked(open).mockResolvedValue(handle as any); vi.mocked(unlink).mockClear();
      await expect(nodeAcceptanceTokenFiles.create(TOKEN)).rejects.toSatisfy(code("ACCEPTANCE_TOKEN_FILE_REFUSED"));
      expect(unlink).toHaveBeenCalledWith(TOKEN);
    }
  });
  it("remove wipes the bytes before unlinking and refuses a non-root or non-regular file", async () => {
    const st = { isFile: () => true, isSymbolicLink: () => false, uid: 0, ino: 9, dev: 1, size: 4 };
    const handle = { stat: vi.fn(async () => st), write: vi.fn(async () => ({ bytesWritten: 4 })), sync: vi.fn(async () => undefined), close: vi.fn(async () => undefined) };
    vi.mocked(lstat).mockResolvedValue(st as any); vi.mocked(open).mockResolvedValue(handle as any);
    expect(await nodeAcceptanceTokenFiles.remove(TOKEN)).toBe("REMOVED");
    expect((handle.write.mock.calls[0] as any)[0].equals(Buffer.alloc(4))).toBe(true);
    expect(unlink).toHaveBeenCalledWith(TOKEN);
    vi.mocked(unlink).mockClear();
    vi.mocked(lstat).mockResolvedValue({ ...st, uid: 1000 } as any);
    await expect(nodeAcceptanceTokenFiles.remove(TOKEN)).rejects.toSatisfy(code("ACCEPTANCE_TOKEN_FILE_REFUSED"));
    expect(unlink).not.toHaveBeenCalled();
    vi.mocked(lstat).mockRejectedValue(new Error("ENOENT"));
    expect(await nodeAcceptanceTokenFiles.remove(TOKEN)).toBe("ABSENT");
  });
});

void (null as unknown as SessionResult);
