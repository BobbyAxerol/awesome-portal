/** TEST_ONLY. Fake filesystem (root-owned artifact), fake trust/coordinator and a
 * scripted fake database. Proves the EXISTING private installer's boundary:
 * pinned bytes, typed conflict on a nonempty/different policy (no overwrite, no
 * SQL grant seed), exact immutable replay, and READ vs STREAM reporting. It is
 * NOT PostgreSQL, a real owner artifact or an installation. Real-PG behaviour of
 * the same tables stays in elp210-manager-domain-access.spec.ts (needs PG). */
import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import type { Pool } from "pg";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthService } from "../src/auth/auth.service";
import { accessDigest } from "../src/execution-v2/access-digest";
import { AccessPolicyError } from "../src/execution-v2/access.contract";
import { ExecutionAccessService } from "../src/execution-v2/access.service";
import { unqualifiedAccessTrust } from "../src/execution-v2/access-trust";
import { privateOwnerCommissioning, readPinnedOwnerArtifact, type PrivateOwnerCommissioningPin }
  from "../src/execution-v2/core-owner-commissioning";
import { CurrentHumanLeaseError } from "../src/execution-v2/current-human-candidate";
import type { CurrentHumanMutations } from "../src/execution-v2/current-human-mutations";
import { NOW, OWNER_READ_TEMPLATE, OWNER_STREAM_TEMPLATE, prepared, sha256 } from "./fixtures/core009-templates";

vi.mock("node:fs/promises", async original => ({ ...await original<typeof import("node:fs/promises")>(), lstat: vi.fn(), open: vi.fn() }));
type File = { bytes: Buffer; uid: number; mode: number; ino: number; link?: boolean; size?: number; swap?: boolean };
const files = new Map<string, File>();
const PATH = "/root/TEST_ONLY-owner.json";
const stat = (f: File) => ({ uid: f.uid, mode: f.mode, ino: f.ino, dev: 1, size: f.size ?? f.bytes.length,
  isFile: () => !f.link, isSymbolicLink: () => Boolean(f.link) });
let serial = 0;
function mount(bytes: Buffer, over: Partial<File> = {}): void { files.set(PATH, { bytes, uid: 0, mode: 0o100600, ino: ++serial, ...over }); }
beforeEach(() => {
  files.clear(); vi.clearAllMocks();
  vi.mocked(lstat).mockImplementation((async (path: unknown) => { const f = files.get(String(path)); if (!f) throw Error("ENOENT"); return stat(f); }) as any);
  vi.mocked(open).mockImplementation((async (path: unknown, flags: unknown) => {
    const f = files.get(String(path)); if (!f) throw Error("ENOENT");
    expect(flags).toBe(constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    let offset = 0;
    return { stat: async () => stat(f.swap ? { ...f, ino: f.ino + 1 } : f), close: vi.fn(async () => undefined),
      read: async (buffer: Buffer, start: number, length: number) => {
        const count = Math.min(length, f.bytes.length - offset);
        if (count > 0) f.bytes.copy(buffer, start, offset, offset + count); offset += count; return { bytesRead: count, buffer };
      } };
  }) as any);
});
const refused = (e: unknown) => e instanceof AccessPolicyError && e.code === "RECEIPT_NOT_QUALIFIED" && e.status === 503 &&
  e.message === "The requested access is not available.";
function pinFor(p: ReturnType<typeof prepared>): PrivateOwnerCommissioningPin {
  return { artifact_path: PATH, approved_sha256: sha256(p.owner), target: p.ownerValue.target,
    intake_not_before_ms: NOW - 60_000, intake_not_after_ms: NOW + 90 * 60_000 };
}

describe("TEST_ONLY pinned owner artifact boundary (root-owned 0600, exact bytes, exact target)", () => {
  it("returns the reviewed policy and domain grants only for exact pinned bytes inside the intake window", async () => {
    const p = prepared(); mount(p.owner);
    const artifact = await readPinnedOwnerArtifact(pinFor(p), NOW);
    expect(artifact.root_grants).toEqual([]);
    expect(artifact.manager_domain_grants).toHaveLength(1);
    expect(artifact.manager_commissioning_target).toEqual(p.ownerValue.target);
    expect(artifact.policy.qualification).toBe("OWNER_VERIFIED");
  });
  it.each([
    ["not root-owned", (p: any) => mount(p.owner, { uid: 1000 })],
    ["group/other readable", (p: any) => mount(p.owner, { mode: 0o100640 })],
    ["symlink", (p: any) => mount(p.owner, { link: true })],
    ["oversized", (p: any) => mount(p.owner, { size: 131073 })],
    ["empty", (p: any) => mount(p.owner, { size: 0 })],
    ["inode replaced after lstat", (p: any) => mount(p.owner, { swap: true })],
    ["bytes differ from the pin", (p: any) => mount(Buffer.concat([p.owner.subarray(0, p.owner.length - 1), Buffer.from(" }")]))],
  ])("refuses file-level tampering: %s, with the one fixed 503 and no detail", async (_label, arrange) => {
    const p = prepared(); arrange(p);
    await expect(readPinnedOwnerArtifact(pinFor(p), NOW)).rejects.toSatisfy(refused);
  });
  it.each([
    ["pretty-printed JSON", (v: any) => Buffer.from(JSON.stringify(v, null, 2))],
    ["unknown top-level key", (v: any) => Buffer.from(JSON.stringify({ ...v, extra: 1 }))],
    ["non-empty root grants", (v: any) => Buffer.from(JSON.stringify({ ...v, root_grants: [{}] }))],
    ["TEST_ONLY qualification", (v: any) => { v.policy.qualification = "TEST_ONLY"; return Buffer.from(JSON.stringify(v)); }],
    ["PENDING policy state", (v: any) => { v.policy.state = "PENDING"; return Buffer.from(JSON.stringify(v)); }],
    ["policy for another workspace", (v: any) => { v.policy.workspace_id = "ws_other"; return Buffer.from(JSON.stringify(v)); }],
    ["policy for another protected owner", (v: any) => { v.policy.protected_owner_user_id = "usr_other"; return Buffer.from(JSON.stringify(v)); }],
    ["zero domain grants", (v: any) => { v.manager_domain_grants = []; return Buffer.from(JSON.stringify(v)); }],
  ])("refuses an artifact whose pinned bytes are internally wrong: %s", async (_label, rewrite) => {
    const p = prepared(), bytes = rewrite(structuredClone(p.ownerValue));
    mount(bytes);
    const pin = { ...pinFor(p), approved_sha256: sha256(bytes) }; // the hash is right; the CONTENT is refused
    await expect(readPinnedOwnerArtifact(pin, NOW)).rejects.toSatisfy(refused);
  });
  it("refuses a target pin that differs from the artifact, and a closed or not-yet-open intake window", async () => {
    const p = prepared(); mount(p.owner);
    const wrongTarget = { ...pinFor(p), target: { ...p.ownerValue.target, database_system_identifier: "1" } };
    await expect(readPinnedOwnerArtifact(wrongTarget, NOW)).rejects.toSatisfy(refused);
    await expect(readPinnedOwnerArtifact(pinFor(p), NOW + 91 * 60_000)).rejects.toSatisfy(refused);
    await expect(readPinnedOwnerArtifact(pinFor(p), NOW - 61_000)).rejects.toSatisfy(refused);
    await expect(readPinnedOwnerArtifact({ ...pinFor(p), artifact_path: "relative.json" }, NOW)).rejects.toSatisfy(refused);
    await expect(readPinnedOwnerArtifact({ ...pinFor(p), approved_sha256: "0".repeat(64) }, NOW)).rejects.toSatisfy(refused);
  });
});

/** Scripted database for the installer's transactions. `writes` records every
 * mutating statement so "no overwrite" is asserted directly. */
function world(p: ReturnType<typeof prepared>, state: { event?: { request_digest: string } | null; policy?: unknown; grants?: unknown[]; anchor?: string } = {}) {
  const t = p.ownerValue.target, writes: string[] = [], reads: string[] = [];
  const actual = { db: t.database_name, system_identifier: t.database_system_identifier, login: t.role_name, role: t.role_name };
  const members = [{ user_id: "x" }];
  const query = vi.fn(async (sql: string) => {
    if (/^\s*(INSERT|UPDATE|DELETE|TRUNCATE|ALTER|CREATE|DROP|GRANT)\b/i.test(sql)) { writes.push(sql.trim().split(/\s+/).slice(0, 3).join(" ")); return { rows: [], rowCount: 1 }; }
    reads.push(sql);
    if (sql.includes("current_database()")) return { rows: [actual] };
    if (sql.includes("FROM portal_access_policy_events")) return { rows: state.event ? [state.event] : [] };
    if (sql.includes("portal_owner_anchor")) return { rows: [{ user_id: state.anchor ?? t.protected_owner_user_id }] };
    if (sql.includes("FROM portal_access_policy_state")) return { rows: state.policy ? [{ policy: state.policy }] : [] };
    if (sql.includes("FROM portal_access_grants_v2")) return { rows: (state.grants ?? []).map(g => ({ grant_fact: g })) };
    if (sql.includes("FROM portal_users")) return { rows: [{ user_id: t.protected_owner_user_id, status: "ACTIVE", must_change_password: false, archived_at: null }] };
    if (sql.includes("FROM workspaces") || sql.includes("FROM workspace_members")) return { rows: members, rowCount: 1 };
    if (sql.includes("clock_timestamp")) return { rows: [{ ms: String(NOW) }] };
    return { rows: [], rowCount: 0 };
  });
  const client = { query, release: vi.fn() };
  const pool = { connect: vi.fn(async () => client) } as unknown as Pool;
  // The real coordinator runs `authorize` before any apply and refuses on a thrown error.
  const executeVerified = vi.fn(async (_binding: unknown, hooks: any) => { await hooks.authorize(client); return hooks.apply(client); });
  const mutations = { usesPool: (candidate: Pool) => candidate === pool, executeVerified } as unknown as CurrentHumanMutations;
  const prepared$ = privateOwnerCommissioning(unqualifiedAccessTrust, pool, pinFor(p), () => NOW);
  const access = new ExecutionAccessService(pool, {} as AuthService, prepared$.trust, false, mutations);
  return { install: () => prepared$.install(access), writes, reads, executeVerified, actual };
}

describe("TEST_ONLY installer: fresh-policy-only, typed conflicts, exact replay", () => {
  it("installs a READ-only artifact exactly once and reports no STREAM", async () => {
    const p = prepared(); mount(p.owner);
    const w = world(p), ack = await w.install();
    expect(ack).toEqual({ state: "REVIEWED_MANAGER_POLICY_ACKNOWLEDGED", authority_scope: "DOMAIN_READ_ONLY",
      artifact_sha256: sha256(p.owner), workspace_id: p.ownerValue.target.workspace_id, stream_commissioned: false, command_commissioned: false });
    expect(w.executeVerified).toHaveBeenCalledTimes(1);
    const grantWrites = w.writes.filter(sql => /portal_access_grants_v2/.test(sql));
    expect(w.writes.filter(sql => /INSERT INTO portal_access_grants_v2/.test(sql) || /INSERT INTO portal_access_policy/.test(sql)).length).toBeGreaterThan(0);
    expect(grantWrites.every(sql => /^INSERT/.test(sql))).toBe(true);
  });
  it("a STREAM grant is installed only when the reviewed artifact lists it, and the ACK then says so", async () => {
    const s = prepared(OWNER_STREAM_TEMPLATE); mount(s.owner);
    const ack = await world(s).install();
    expect(ack).toMatchObject({ authority_scope: "DOMAIN_READ_AND_STREAM_GRANT", stream_commissioned: true, command_commissioned: false });
    const readOnly = prepared(); mount(readOnly.owner);
    expect(await world(readOnly).install()).toMatchObject({ authority_scope: "DOMAIN_READ_ONLY", stream_commissioned: false });
  });
  it("a DENY-only STREAM entry never reports STREAM as commissioned", async () => {
    const s = prepared(OWNER_STREAM_TEMPLATE, (_r, o) => { o.manager_domain_grants[1].effect = "DENY"; }); mount(s.owner);
    expect(await world(s).install()).toMatchObject({ authority_scope: "DOMAIN_READ_ONLY", stream_commissioned: false });
  });
  it("a nonempty existing policy is a typed conflict: no coordinator apply, no write of any kind", async () => {
    const p = prepared(); mount(p.owner);
    const w = world(p, { policy: { workspace_id: p.ownerValue.target.workspace_id, revision: "older" } });
    await expect(w.install()).rejects.toMatchObject({ code: "POLICY_REVISION_CONFLICT", status: 409 });
    expect(w.writes).toEqual([]);
  });
  it("existing stored grants without a policy are equally a conflict, never merged or repaired", async () => {
    const p = prepared(); mount(p.owner);
    const legacy = { grant_id: "TEST_ONLY-legacy", subject_user_id: "usr_x", workspace_id: p.ownerValue.target.workspace_id, action: "alpha.read",
      effect: "ALLOW", selector: { kind: "EXPLICIT_RESOURCE_SET", resource_kind: "ALPHA", ids: ["a"] }, environments: ["paper"],
      valid_from_ms: NOW - 1000, valid_until_ms: NOW + 1000, delegable_actions: [], issued_by: p.ownerValue.target.protected_owner_user_id,
      parent_grant_id: null, revision: "r1", policy_revision: "old", revoked_at_ms: null, requires_ts_acceptance: false, ts_receipt: null, field_policy_ref: null };
    const w = world(p, { grants: [legacy] });
    await expect(w.install()).rejects.toMatchObject({ code: "POLICY_REVISION_CONFLICT", status: 409 });
    expect(w.writes).toEqual([]);
  });
  it("a different artifact for an already installed revision is a typed conflict before the coordinator is used", async () => {
    const p = prepared(); mount(p.owner);
    const w = world(p, { event: { request_digest: "sha256:" + "f".repeat(64) } });
    await expect(w.install()).rejects.toMatchObject({ code: "POLICY_REVISION_CONFLICT", status: 409 });
    expect(w.executeVerified).not.toHaveBeenCalled(); expect(w.writes).toEqual([]);
  });
  it("the exact immutable replay is acknowledged read-only without restoring or repairing grants", async () => {
    const p = prepared(); mount(p.owner);
    const probe = world(p); await probe.install(); // learn the artifact digest the installer computes
    const artifact = await readPinnedOwnerArtifact(pinFor(p), NOW);
    const w = world(p, { event: { request_digest: accessDigest(artifact) }, grants: [] });
    await expect(w.install()).resolves.toMatchObject({ state: "REVIEWED_MANAGER_POLICY_ACKNOWLEDGED" });
    expect(w.executeVerified).not.toHaveBeenCalled(); expect(w.writes).toEqual([]);
    expect(w.reads.some(sql => sql.includes("SET TRANSACTION READ ONLY"))).toBe(true);
  });
  it("refuses the wrong physical database, system identifier or login before reading any history", async () => {
    for (const axis of ["db", "system_identifier", "login", "role"] as const) {
      const p = prepared(); mount(p.owner);
      const w = world(p); w.actual[axis] = "wrong";
      await expect(w.install()).rejects.toMatchObject({ code: "RECEIPT_BINDING_MISMATCH" });
      expect(w.executeVerified).not.toHaveBeenCalled(); expect(w.writes).toEqual([]);
      expect(w.reads.some(sql => sql.includes("portal_access_policy_events"))).toBe(false);
    }
  });
  it("a protected owner anchor that is not the pinned owner refuses without a write", async () => {
    const p = prepared(); mount(p.owner);
    const w = world(p, { anchor: "usr_someone_else" });
    await expect(w.install()).rejects.toMatchObject({ code: "RECEIPT_BINDING_MISMATCH" });
    expect(w.writes).toEqual([]);
  });
  it("a coordinator key conflict surfaces as the typed revision conflict, never a silent overwrite", async () => {
    const p = prepared(); mount(p.owner);
    const w = world(p);
    w.executeVerified.mockRejectedValueOnce(new CurrentHumanLeaseError("CURRENT_HUMAN_MUTATION_KEY_CONFLICT"));
    await expect(w.install()).rejects.toMatchObject({ code: "POLICY_REVISION_CONFLICT", status: 409 });
    expect(w.writes).toEqual([]);
  });
  it("installation through a pool the access service does not own is refused", async () => {
    const p = prepared(); mount(p.owner);
    const other = { connect: vi.fn() } as unknown as Pool;
    const prepared$ = privateOwnerCommissioning(unqualifiedAccessTrust, other, pinFor(p), () => NOW);
    const w = world(p), accessPool = { connect: vi.fn() } as unknown as Pool;
    const access = new ExecutionAccessService(accessPool, {} as AuthService, prepared$.trust, false,
      { usesPool: () => true, executeVerified: w.executeVerified } as unknown as CurrentHumanMutations);
    await expect(prepared$.install(access)).rejects.toSatisfy(refused);
    expect(w.executeVerified).not.toHaveBeenCalled();
  });
});
