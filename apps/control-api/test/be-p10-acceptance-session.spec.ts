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
import { ACCEPTANCE_EVIDENCE_CLASS, ACCEPTANCE_ISSUE_SCHEMA, ACCEPTANCE_REVOKE_SCHEMA, ACCEPTANCE_TOKEN_WRITE_MAX_ATTEMPTS, AcceptanceSessionError,
  acceptanceTokenFileMatches, nodeAcceptanceTokenFiles, privateAcceptanceSession, readPinnedAcceptanceIssue,
  type AcceptanceArtifactPin, type AcceptanceTokenBinding, type AcceptanceTokenFiles } from "../src/execution-v2/research-acceptance-session";
import { NOW, OWNER_STREAM_TEMPLATE, prepared, sha256 } from "./fixtures/core009-templates";
import { FakeCoreWorld } from "./fixtures/fake-core-world";

vi.mock("node:fs/promises", async original => ({ ...await original<typeof import("node:fs/promises")>(), lstat: vi.fn(), open: vi.fn(), unlink: vi.fn() }));
type File = { bytes: Buffer; uid: number; mode: number; ino: number; link?: boolean; size?: number };
const files = new Map<string, File>();
const ART = "/root/TEST_ONLY-session-artifact.json", TOKEN = "/root/TEST_ONLY-session/token.json";
let serial = 0;
const enoent = () => Object.assign(new Error("ENOENT"), { code: "ENOENT" });
/** A one-path fake disk for the default token sink: inodes survive unlink while a handle is open, like a real filesystem. */
type Inode = { bytes: Buffer; ino: number; uid: number; mode: number };
type Plan = (call: number, remaining: number) => { stored: number; reported?: number } | Error;
const disk: { node: Inode | null; enabled: boolean; unlinks: number; plan: Plan | null; syncError: boolean; corruptRead: boolean; syncs: number; truncates: number; writes: number;
  afterSync: (() => void) | null; writeHook: (() => void) | null; first: Buffer | null } =
  { node: null, enabled: false, unlinks: 0, plan: null, syncError: false, corruptRead: false, syncs: 0, truncates: 0, writes: 0, afterSync: null, writeHook: null, first: null };
const resetDisk = (enabled = false) => Object.assign(disk, { node: null, enabled, unlinks: 0, plan: null, syncError: false, corruptRead: false, syncs: 0, truncates: 0, writes: 0, afterSync: null, writeHook: null, first: null });
const newInode = (bytes: Buffer | string = Buffer.alloc(0), over: Partial<Inode> = {}): Inode => ({ bytes: Buffer.from(bytes), ino: ++serial + 1000, uid: 0, mode: 0o100600, ...over });
const inodeStat = (n: Inode) => ({ uid: n.uid, mode: n.mode, ino: n.ino, dev: 1, size: n.bytes.length, isFile: () => true, isSymbolicLink: () => false });
const dirOf = { isDirectory: () => true, isSymbolicLink: () => false, uid: 0, mode: 0o40755 };
function diskHandle(node: Inode) {
  return {
    chmod: async () => undefined, stat: async () => inodeStat(node), close: vi.fn(async () => undefined),
    truncate: async () => { disk.truncates++; node.bytes = Buffer.alloc(0); },
    sync: async () => { disk.syncs++; if (disk.syncError) throw new Error("EIO"); disk.afterSync?.(); },
    write: async (buffer: Buffer, offset: number, length: number, position: number) => {
      disk.writes++; if (!disk.first) disk.first = Buffer.from(buffer); disk.writeHook?.();
      const step = disk.plan ? disk.plan(disk.writes, length) : { stored: length };
      if (step instanceof Error) throw step;
      const stored = Math.min(step.stored, length);
      const next = Buffer.alloc(Math.max(node.bytes.length, position + stored)); node.bytes.copy(next); buffer.copy(next, position, offset, offset + stored); node.bytes = next;
      return { bytesWritten: step.reported ?? stored, buffer };
    },
    read: async (buffer: Buffer, start: number, length: number, position: number) => {
      const count = Math.max(0, Math.min(length, node.bytes.length - position));
      if (count > 0) node.bytes.copy(buffer, start, position, position + count);
      if (count > 0 && disk.corruptRead) buffer[start] = buffer[start]! ^ 0xff;
      return { bytesRead: count, buffer };
    },
  };
}
const stat = (f: File) => ({ uid: f.uid, mode: f.mode, ino: f.ino, dev: 1, size: f.size ?? f.bytes.length, isFile: () => !f.link, isSymbolicLink: () => Boolean(f.link) });
beforeEach(() => {
  files.clear(); vi.clearAllMocks(); vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(NOW);
  resetDisk();
  vi.mocked(unlink).mockImplementation((async (path: unknown) => { if (disk.enabled && path === TOKEN) { disk.unlinks++; disk.node = null; } }) as any);
  vi.mocked(lstat).mockImplementation((async (path: unknown) => {
    if (disk.enabled && path === TOKEN) { if (!disk.node) throw enoent(); return inodeStat(disk.node); }
    if (disk.enabled && path === "/root/TEST_ONLY-session") return dirOf;
    const f = files.get(String(path)); if (!f) throw enoent(); return stat(f); }) as any);
  vi.mocked(open).mockImplementation((async (path: unknown, flags?: number) => {
    if (disk.enabled && path === TOKEN) {
      if (flags !== undefined && (flags & constants.O_CREAT)) { if (disk.node) throw Object.assign(new Error("EEXIST"), { code: "EEXIST" }); disk.node = newInode(); }
      if (!disk.node) throw enoent();
      return diskHandle(disk.node);
    }
    const f = files.get(String(path)); if (!f) throw enoent();
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
  readonly store = new Map<string, Buffer>(); failWrite = false; refuseCreate = false; removeThrows = false; readonly removeBindings: AcceptanceTokenBinding[] = [];
  async create(path: string) {
    if (this.refuseCreate || this.store.has(path)) throw new AcceptanceSessionError("ACCEPTANCE_TOKEN_FILE_REFUSED", 503);
    this.store.set(path, Buffer.alloc(0));
    return { write: async (bytes: Buffer) => { if (this.failWrite) throw new Error("disk full"); this.store.set(path, Buffer.from(bytes)); },
      abandon: async () => { this.store.delete(path); } };
  }
  async remove(path: string, binding: AcceptanceTokenBinding) {
    if (this.removeThrows) throw new Error("busy");
    this.removeBindings.push(binding);
    const bytes = this.store.get(path);
    if (!bytes) return "ABSENT" as const;
    if (!acceptanceTokenFileMatches(bytes, binding)) return "RETAINED_NOT_BOUND_TO_SESSION" as const;
    this.store.delete(path); return "REMOVED" as const;
  }
  async preflight(path: string, operation: "issue" | "revoke") { if (operation === "issue" && this.store.has(path)) throw new AcceptanceSessionError("ACCEPTANCE_TOKEN_FILE_REFUSED", 503); }
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
    let stored = 0;
    const handle = { chmod: vi.fn(async () => undefined), stat: vi.fn(async () => ({ isFile: () => true, uid: 0, mode: 0o100600, size: stored })),
      write: vi.fn(async () => { stored = 3; return { bytesWritten: 3 }; }), read: vi.fn(async (b: Buffer) => { b.write("abc"); return { bytesRead: 3 }; }),
      sync: vi.fn(async () => undefined), close: vi.fn(async () => undefined) };
    vi.mocked(lstat).mockResolvedValue(dirStat() as any); vi.mocked(open).mockResolvedValue(handle as any);
    const sink = await nodeAcceptanceTokenFiles.create(TOKEN);
    expect(vi.mocked(open).mock.calls[0]).toEqual([TOKEN, constants.O_RDWR | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600]);
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
  it("remove wipes the verified bytes before unlinking and refuses a non-root or non-regular file; a missing file is ABSENT", async () => {
    resetDisk(true);
    const base = rig(), r = { ...base, deps: { ...base.deps, files: nodeAcceptanceTokenFiles } }, issued = await issue(r);
    const written = Buffer.from(disk.node!.bytes), size = written.length, node = disk.node!;
    expect(acceptanceTokenFileMatches(written, bindingOf(r, issued.session_id))).toBe(true);
    expect(await nodeAcceptanceTokenFiles.remove(TOKEN, bindingOf(r, issued.session_id))).toBe("REMOVED");
    expect(node.bytes.equals(Buffer.alloc(size))).toBe(true); // the verified inode was zeroed through its descriptor
    expect(disk.node).toBeNull(); expect(disk.unlinks).toBe(1);
    expect(await nodeAcceptanceTokenFiles.remove(TOKEN, bindingOf(r, issued.session_id))).toBe("ABSENT");
    disk.node = newInode("{}", { uid: 1000 });
    await expect(nodeAcceptanceTokenFiles.remove(TOKEN, bindingOf(r, issued.session_id))).rejects.toSatisfy(code("ACCEPTANCE_TOKEN_FILE_REFUSED"));
    expect(disk.unlinks).toBe(1); expect(disk.node.bytes.toString()).toBe("{}");
    vi.mocked(lstat).mockRejectedValue(Object.assign(new Error("EACCES"), { code: "EACCES" }));
    await expect(nodeAcceptanceTokenFiles.remove(TOKEN, bindingOf(r, issued.session_id))).rejects.toSatisfy(code("ACCEPTANCE_TOKEN_FILE_REFUSED"));
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Edge CHANGES_REQUESTED item 1: token cleanup is bound to the EXACT session/file.
const bindingOf = (r: ReturnType<typeof rig>, sessionId: string): AcceptanceTokenBinding =>
  ({ session_id: sessionId, user_id: OWNER, token_sha256: r.w.sessions.get(sessionId)!.session_token_hash });
const nodeRig = () => { resetDisk(true); const base = rig(); return { ...base, deps: { ...base.deps, files: nodeAcceptanceTokenFiles } }; };

describe("revoke cleanup is bound to the exact session and file (Edge item 1)", () => {
  it("REPRODUCER on the default sink: issue S1 at P, revoke S1, issue S2 at the reused P, REPLAY the S1 revoke -> S2's live token and session are untouched", async () => {
    const r = nodeRig();
    const s1 = await issue(r), first = await revokeBy(r, revokeDoc(s1.session_id));
    expect(first).toMatchObject({ outcome: "REVOKED", token_file: "REMOVED" });
    expect(disk.node).toBeNull();
    const s2 = await issue(r), s2Bytes = Buffer.from(disk.node!.bytes), s2Inode = disk.node!;
    expect(s2.session_id).not.toBe(s1.session_id);
    const unlinks = disk.unlinks, writes = disk.writes;
    const replay = await revokeBy(r, revokeDoc(s1.session_id));
    expect(replay).toEqual({ schema_version: "portal.research-acceptance-session-revoke-receipt.v1", session_id: s1.session_id, user_id: OWNER,
      outcome: "ALREADY_REVOKED_BY_THIS_OPERATION", session_state_before: "REVOKED", token_file: "RETAINED_NOT_BOUND_TO_SESSION", other_sessions_touched: 0 });
    expect(disk.node).toBe(s2Inode); expect(disk.node!.bytes.equals(s2Bytes)).toBe(true); // not wiped, not unlinked
    expect(disk.unlinks).toBe(unlinks); expect(disk.writes).toBe(writes);
    expect(r.w.sessions.get(s2.session_id)!.state).toBe("ACTIVE");
    expect(tokenHash(JSON.parse(s2Bytes.toString()).token)).toBe(r.w.sessions.get(s2.session_id)!.session_token_hash);
    // the live session is still exactly revocable afterwards and ITS cleanup does remove its own file
    expect(await revokeBy(r, revokeDoc(s2.session_id))).toMatchObject({ outcome: "REVOKED", token_file: "REMOVED" });
    expect(disk.node).toBeNull();
  });
  it("the same reproducer through the injectable sink contract: the replayed S1 revoke is a typed terminal no-op that never touches S2", async () => {
    const r = rig(), s1 = await issue(r);
    await revokeBy(r, revokeDoc(s1.session_id));
    const s2 = await issue(r), s2Token = Buffer.from(r.sink.store.get(TOKEN)!);
    const replay = await revokeBy(r, revokeDoc(s1.session_id));
    expect(replay).toMatchObject({ outcome: "ALREADY_REVOKED_BY_THIS_OPERATION", token_file: "RETAINED_NOT_BOUND_TO_SESSION", other_sessions_touched: 0 });
    expect(r.sink.store.get(TOKEN)!.equals(s2Token)).toBe(true);
    expect(r.sink.removeBindings.at(-1)).toEqual(bindingOf(r, s1.session_id));
    expect(r.w.sessions.get(s2.session_id)).toMatchObject({ state: "ACTIVE" });
    // a replay with a different artifact on the terminal session is the same typed no-op
    expect(await revokeBy(r, revokeDoc(s1.session_id, { approval_ref: "TEST_ONLY-other" }))).toMatchObject({ outcome: "ALREADY_REVOKED_BY_THIS_OPERATION", token_file: "RETAINED_NOT_BOUND_TO_SESSION" });
    expect(r.sink.store.get(TOKEN)!.equals(s2Token)).toBe(true);
  });
  it("an absent file is ABSENT (nothing removed), also for the replay with no S2", async () => {
    const r = rig(), s1 = await issue(r);
    r.sink.store.delete(TOKEN);
    expect(await revokeBy(r, revokeDoc(s1.session_id))).toMatchObject({ outcome: "REVOKED", token_file: "ABSENT" });
    expect(await revokeBy(r, revokeDoc(s1.session_id))).toMatchObject({ outcome: "ALREADY_REVOKED_BY_THIS_OPERATION", token_file: "ABSENT" });
  });
  it.each([
    ["another session's token file", () => Buffer.from(JSON.stringify({ schema_version: "portal.research-acceptance-session-token.v1",
      session_id: "TEST_ONLY-another-session", user_id: OWNER, cookie_name: "__Host-portal_session", token: "TEST_ONLY-OTHER-TOKEN".repeat(3), absolute_expires_at: "2026-10-20T08:00:00.000Z" }))],
    ["the right session id but a token that is not this session's", (r: ReturnType<typeof rig>) => Buffer.from(JSON.stringify({ ...JSON.parse(r.sink.store.get(TOKEN)!.toString()), token: "TEST_ONLY-NOT-THE-SESSION-TOKEN-0123456789" }))],
    ["the right token but another user", (r: ReturnType<typeof rig>) => Buffer.from(JSON.stringify({ ...JSON.parse(r.sink.store.get(TOKEN)!.toString()), user_id: "usr_someone_else" }))],
    ["a foreign schema", (r: ReturnType<typeof rig>) => Buffer.from(JSON.stringify({ ...JSON.parse(r.sink.store.get(TOKEN)!.toString()), schema_version: "x" }))],
    ["a file replaced by non-JSON bytes", () => Buffer.from("not json at all")],
    ["a file replaced by an empty file", () => Buffer.alloc(0)],
    ["a file replaced by JSON null", () => Buffer.from("null")],
  ])("a mismatched file (%s) is RETAINED untouched; the session is still revoked", async (_n, replacement) => {
    const r = rig(), s1 = await issue(r), foreign = (replacement as (r: ReturnType<typeof rig>) => Buffer)(r);
    r.sink.store.set(TOKEN, Buffer.from(foreign));
    const receipt = await revokeBy(r, revokeDoc(s1.session_id));
    expect(receipt).toMatchObject({ outcome: "REVOKED", token_file: "RETAINED_NOT_BOUND_TO_SESSION", other_sessions_touched: 0 });
    expect(r.sink.store.get(TOKEN)!.equals(foreign)).toBe(true);
    expect(r.w.sessions.get(s1.session_id)!.state).toBe("REVOKED");
  });
  it("default sink: a file replaced between issue and revoke (other session / oversize / empty / torn JSON) is retained byte-for-byte: no wipe, no unlink", async () => {
    const makers = [() => newInode(JSON.stringify({ schema_version: "portal.research-acceptance-session-token.v1", session_id: "TEST_ONLY-S-other", user_id: OWNER, token: "X".repeat(40) })),
      () => newInode("A".repeat(5000)), () => newInode(Buffer.alloc(0)), () => newInode("{ torn")];
    for (const make of makers) {
      const r = nodeRig(), s1 = await issue(r), replacement = make();
      disk.node = replacement; const before = Buffer.from(replacement.bytes), writes = disk.writes;
      expect(await revokeBy(r, revokeDoc(s1.session_id))).toMatchObject({ outcome: "REVOKED", token_file: "RETAINED_NOT_BOUND_TO_SESSION" });
      expect(disk.node).toBe(replacement); expect(replacement.bytes.equals(before)).toBe(true); expect(disk.unlinks).toBe(0); expect(disk.writes).toBe(writes);
    }
  });
  it("default sink: a path swapped to another file AFTER verification and wipe is never unlinked (inode re-check)", async () => {
    const r = nodeRig(), s1 = await issue(r);
    const swapped = newInode("TEST_ONLY-live-token-of-a-newer-session");
    disk.afterSync = () => { disk.node = swapped; };
    expect(await revokeBy(r, revokeDoc(s1.session_id))).toMatchObject({ outcome: "REVOKED", token_file: "RETAINED_NOT_BOUND_TO_SESSION" });
    expect(disk.node).toBe(swapped); expect(swapped.bytes.toString()).toBe("TEST_ONLY-live-token-of-a-newer-session"); expect(disk.unlinks).toBe(0);
  });
  it("default sink: the dead token file of the SAME session is wiped and removed exactly once (including for an EXPIRED session)", async () => {
    const r = nodeRig(), s1 = await issue(r);
    r.w.sessions.get(s1.session_id)!.state = "EXPIRED";
    expect(await revokeBy(r, revokeDoc(s1.session_id))).toMatchObject({ outcome: "ALREADY_TERMINAL", session_state_before: "EXPIRED", token_file: "REMOVED" });
    expect(disk.node).toBeNull(); expect(disk.unlinks).toBe(1);
  });
  it("the binding check is pure: id, user and token hash must all match", () => {
    const token = "TEST_ONLY-TOKEN-VALUE-0123456789abcdef", hash = tokenHash(token);
    const file = (over: object = {}) => Buffer.from(JSON.stringify({ schema_version: "portal.research-acceptance-session-token.v1", session_id: "S", user_id: OWNER, cookie_name: "c", token, absolute_expires_at: "t", ...over }));
    const b = { session_id: "S", user_id: OWNER, token_sha256: hash };
    expect(acceptanceTokenFileMatches(file(), b)).toBe(true);
    for (const [bytes, binding] of [[file({ session_id: "T" }), b], [file({ user_id: "u" }), b], [file({ token: "x" }), b], [file({ token: 5 }), b], [file(), { ...b, token_sha256: "0".repeat(64) }],
      [file(), { ...b, token_sha256: "short" }], [Buffer.from("[]"), b], [Buffer.from("\u0000"), b]] as const)
      expect(acceptanceTokenFileMatches(bytes, binding)).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Edge CHANGES_REQUESTED item 2: complete, verified, bounded token writes; failure => exact compensating revoke, no ACK.
describe("the default token sink writes ALL the bytes or fails closed (Edge item 2)", () => {
  function expectCompensated(r: ReturnType<typeof rig>, sessionId: string) {
    expect(acceptanceRows(r.w)).toHaveLength(1);
    expect(r.w.sessions.get(sessionId)).toMatchObject({ state: "REVOKED", revoke_reason: "research_acceptance_revoked" });
    expect(r.w.coordinator.calls.at(-1)).toMatchObject({ family: "REVIEWED_POLICY", operation: "REVOKE_ACCEPTANCE_SESSION" });
    expect(r.w.audit.map(a => a.event_type)).toEqual(["research_acceptance_session_issued", "research_acceptance_session_revoked"]);
    expect(r.w.audit.at(-1)!.metadata).toMatchObject({ session_id: sessionId });
    expect(disk.node).toBeNull(); // the (partial) file is emptied and unlinked
  }
  async function failing(r: ReturnType<typeof rig>, expected = "ACCEPTANCE_TOKEN_WRITE_FAILED_SESSION_REVOKED") {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map(m => vi.spyOn(console, m).mockImplementation(() => undefined));
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true), stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    let thrown: unknown;
    const result = await issue(r).then(v => v, e => { thrown = e; return undefined; });
    expect(result).toBeUndefined(); // refused ACK: no receipt
    expect(thrown).toSatisfy(code(expected));
    const sessionId = [...r.w.sessions.keys()].find(k => r.w.sessions.get(k)!.access_subject === RESEARCH_ACCEPTANCE_ACCESS_SUBJECT)!;
    const out = JSON.stringify([String(thrown), (thrown as Error).message, thrown, spies.flatMap(s => s.mock.calls), stdout.mock.calls, stderr.mock.calls, r.w.audit, r.w.events]);
    vi.restoreAllMocks();
    return { sessionId, out };
  }
  it("PARTIAL writes (a few bytes per call) are completed in a loop; the ACK carries the true length and the file is whole", async () => {
    let chunk = 0;
    const r = nodeRig(); disk.plan = (_call, remaining) => ({ stored: Math.min(remaining, chunk ||= Math.ceil(remaining / 5)) });
    const receipt = await issue(r), bytes = disk.node!.bytes;
    expect(disk.writes).toBe(5); expect(disk.syncs).toBe(1);
    expect(receipt.token_file.bytes).toBe(bytes.length);
    const file = JSON.parse(bytes.toString("utf8"));
    expect(file.session_id).toBe(receipt.session_id); expect(tokenHash(file.token)).toBe(r.w.sessions.get(receipt.session_id)!.session_token_hash);
    expect(r.w.sessions.get(receipt.session_id)!.state).toBe("ACTIVE");
  });
  it("a ZERO-progress write after a short one fails (no spin), is compensated by the exact-session revoke and is never acknowledged", async () => {
    const r = nodeRig(); disk.plan = call => call === 1 ? { stored: 5 } : { stored: 0 };
    const { sessionId, out } = await failing(r);
    expect(disk.writes).toBe(2); expectCompensated(r, sessionId);
    expect(out).not.toContain(JSON.parse(disk.first!.toString()).token); // the token is in no failure surface
  });
  it("a write that makes no progress at all (first call returns 0) fails", async () => {
    const r = nodeRig(); disk.plan = () => ({ stored: 0 });
    const { sessionId } = await failing(r); expect(disk.writes).toBe(1); expectCompensated(r, sessionId);
  });
  it("a write ERROR after a partial write fails, empties the partial secret, and is compensated", async () => {
    const r = nodeRig(); disk.plan = call => call === 1 ? { stored: 9 } : new Error("EIO");
    const { sessionId } = await failing(r);
    expectCompensated(r, sessionId);
    expect(disk.truncates).toBeGreaterThanOrEqual(1); expect(disk.writes).toBe(2);
  });
  it("an fsync FAILURE is not acknowledged: compensated", async () => {
    const r = nodeRig(); disk.syncError = true;
    const { sessionId } = await failing(r); expect(disk.syncs).toBe(1); expectCompensated(r, sessionId);
  });
  it("a write that REPORTS the full count but stored fewer bytes (lying short write) is caught by the length verification", async () => {
    const r = nodeRig(); disk.plan = (_c, remaining) => ({ stored: remaining - 1, reported: remaining });
    const { sessionId } = await failing(r); expectCompensated(r, sessionId);
  });
  it("a write whose stored bytes differ (corrupt read-back) is caught by the content verification", async () => {
    const r = nodeRig(); disk.corruptRead = true;
    const { sessionId } = await failing(r); expectCompensated(r, sessionId);
  });
  it("a nonsensical bytesWritten (more than requested / negative / NaN) fails", async () => {
    for (const reported of [10_000, -1, Number.NaN]) {
      const r = nodeRig(); disk.plan = () => ({ stored: 3, reported });
      const { sessionId } = await failing(r); expectCompensated(r, sessionId);
    }
  });
  it("attempts are BOUNDED: a trickle of 1 byte per call is refused after the attempt cap", async () => {
    const r = nodeRig(); disk.plan = () => ({ stored: 1 });
    const { sessionId } = await failing(r);
    expect(disk.writes).toBe(ACCEPTANCE_TOKEN_WRITE_MAX_ATTEMPTS); expectCompensated(r, sessionId);
  });
  it("if the compensating revoke itself cannot complete, the typed failure says REVOKE_UNCONFIRMED and still acknowledges nothing", async () => {
    const r = nodeRig(); disk.plan = () => ({ stored: 0 }); disk.writeHook = () => { r.w.unresolvedObligations = 1; };
    const { sessionId } = await failing(r, "ACCEPTANCE_TOKEN_WRITE_FAILED_REVOKE_UNCONFIRMED");
    expect(r.w.sessions.get(sessionId)!.state).toBe("ACTIVE"); // the operator must revoke it by id; the file is already gone
    expect(disk.node).toBeNull();
  });
  it("the default-sink success path still never puts the token anywhere but the file", async () => {
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const r = nodeRig(), receipt = await issue(r), token = JSON.parse(disk.node!.bytes.toString()).token;
    expect(JSON.stringify([receipt, r.w.audit, r.w.events, r.w.coordinator.calls, stdout.mock.calls])).not.toContain(token);
    vi.restoreAllMocks();
  });
});

void (null as unknown as SessionResult);
