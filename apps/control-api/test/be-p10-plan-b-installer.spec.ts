/** BE-P10 task 2. TEST_ONLY, fakes only: Plan B (Bobby, 2026-10-20) installs the READ and the STREAM
 * grant TOGETHER from one reviewed artifact, each finite (<= 2 h) and never beyond the renewed source
 * trust; the ACK reports STREAM truthfully; the offline validator enforces the same caps; the fresh-policy-only
 * rule and the typed conflict are unchanged. NOT PostgreSQL, NOT an installation. */
import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthService } from "../src/auth/auth.service";
import { withTransaction } from "../src/db/pool";
import { ExecutionAccessService } from "../src/execution-v2/access.service";
import { unqualifiedAccessTrust } from "../src/execution-v2/access-trust";
import { PLAN_B_MAXIMUM_GRANT_MS, planBGrantFindings, privateOwnerCommissioning, readPinnedOwnerArtifact,
  type PrivateOwnerCommissioningPin } from "../src/execution-v2/core-owner-commissioning";
import { evaluateManagerDomainRead, evaluateManagerDomainStream } from "../src/execution-v2/current-human-snapshot";
import { inspectCore009Preparation } from "../src/execution-v2/core009-preparation";
import { nativeCoreRuntimeManifest } from "../src/execution-v2/native-core-runtime";
import { HOUR, MINUTE, NOW, OWNER_READ_TEMPLATE, OWNER_STREAM_TEMPLATE, TRUST_EXPIRES, prepared, sha256 } from "./fixtures/core009-templates";
import { FakeCoreWorld } from "./fixtures/fake-core-world";

vi.mock("node:fs/promises", async original => ({ ...await original<typeof import("node:fs/promises")>(), lstat: vi.fn(), open: vi.fn() }));
type File = { bytes: Buffer; uid: number; mode: number; ino: number };
const files = new Map<string, File>();
const PATH = "/root/TEST_ONLY-owner.json";
let serial = 0;
const stat = (f: File) => ({ uid: f.uid, mode: f.mode, ino: f.ino, dev: 1, size: f.bytes.length, isFile: () => true, isSymbolicLink: () => false });
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

const WINDOW = { plan: "READ_AND_STREAM" as const, maximum_grant_ms: PLAN_B_MAXIMUM_GRANT_MS, trust_not_after_ms: TRUST_EXPIRES };
type Prepared = ReturnType<typeof prepared>;
function pinFor(p: Prepared, window: unknown | null = WINDOW): PrivateOwnerCommissioningPin {
  return { artifact_path: PATH, approved_sha256: sha256(p.owner), target: p.ownerValue.target, intake_not_before_ms: NOW - MINUTE,
    intake_not_after_ms: NOW + 90 * MINUTE, ...(window === null ? {} : { grant_window: window as any }) };
}
function planB(edit: (owner: any) => void = () => undefined): Prepared {
  const p = prepared(OWNER_STREAM_TEMPLATE, (_r, o) => edit(o));
  files.set(PATH, { bytes: p.owner, uid: 0, mode: 0o100600, ino: ++serial });
  return p;
}
function world(p: Prepared, over: Partial<ConstructorParameters<typeof FakeCoreWorld>[0]> = {}) {
  const t = p.ownerValue.target;
  return new FakeCoreWorld({ now: NOW, database: { db: t.database_name, system: t.database_system_identifier, login: t.role_name },
    owner: t.protected_owner_user_id, workspace: t.workspace_id, members: [t.protected_owner_user_id], policy: null, grants: [], ...over });
}
function installer(w: FakeCoreWorld, p: Prepared, window: unknown | null = WINDOW) {
  const intake = privateOwnerCommissioning(unqualifiedAccessTrust, w.pool, pinFor(p, window), () => NOW);
  return () => intake.install(new ExecutionAccessService(w.pool, {} as AuthService, intake.trust, false, w.coordinator.asMutations()));
}
const refused = (e: unknown) => (e as { code?: string }).code === "RECEIPT_NOT_QUALIFIED" && (e as { status?: number }).status === 503;

describe("Plan B installs the READ and the STREAM grant together", () => {
  it("one artifact -> exactly two stored grants with separate ids and separate expiries; the ACK reports both truthfully", async () => {
    const p = planB(o => { o.manager_domain_grants[1].valid_until_ms = o.manager_domain_grants[0].valid_until_ms - 30 * MINUTE; });
    const w = world(p), ack = await installer(w, p)();
    const [read, stream] = p.ownerValue.manager_domain_grants;
    expect(w.grantsOf(p.ownerValue.target.workspace_id).map(g => [g.action, g.grant_id])).toEqual(
      expect.arrayContaining([["business.read_all", read.grant_id], ["stream.subscribe", stream.grant_id]]));
    expect(w.grants.size).toBe(2);
    expect(read.grant_id).not.toBe(stream.grant_id);
    expect(ack).toEqual({ state: "REVIEWED_MANAGER_POLICY_ACKNOWLEDGED", authority_scope: "DOMAIN_READ_AND_STREAM_GRANT",
      artifact_sha256: sha256(p.owner), workspace_id: p.ownerValue.target.workspace_id, stream_commissioned: true, command_commissioned: false,
      plan: "READ_AND_STREAM", grants: [
        { grant_id: read.grant_id, action: "business.read_all", valid_from_ms: read.valid_from_ms, valid_until_ms: read.valid_until_ms },
        { grant_id: stream.grant_id, action: "stream.subscribe", valid_from_ms: stream.valid_from_ms, valid_until_ms: stream.valid_until_ms }] });
    expect(JSON.stringify(ack)).not.toMatch(/approval|provenance|sha256:|\/root\//);
    expect(w.coordinator.calls).toEqual([expect.objectContaining({ family: "REVIEWED_POLICY", operation: "INSTALL_POLICY" })]);
  });
  it("the installed pair is independently effective: READ and STREAM both allowed on the real evaluators, and STREAM stops at its own expiry", async () => {
    const p = planB(o => { o.manager_domain_grants[1].valid_until_ms = NOW + 10 * MINUTE; });
    const w = world(p); await installer(w, p)();
    const request = { actor: w.actor, workspace_id: p.ownerValue.target.workspace_id, environment: "paper" as const, domain: p.ownerValue.manager_domain_grants[0].domain };
    // READ is allowed now; its re-evaluation ceiling conservatively stops at the next fixed transition (the STREAM expiry).
    expect((await withTransaction(w.pool, db => evaluateManagerDomainRead(db, request))).valid_until_ms).toBeLessThanOrEqual(NOW + 10 * MINUTE);
    expect((await withTransaction(w.pool, db => evaluateManagerDomainStream(db, request))).valid_until_ms).toBeLessThanOrEqual(NOW + 10 * MINUTE);
    w.now = NOW + 11 * MINUTE; // the STREAM window closed, READ is still inside its own
    w.sessions.get(w.actorSession.id)!.idle_expires_at = new Date(NOW + 2 * HOUR); w.sessions.get(w.actorSession.id)!.absolute_expires_at = new Date(NOW + 3 * HOUR);
    await expect(withTransaction(w.pool, db => evaluateManagerDomainStream(db, request))).rejects.toMatchObject({ code: "ACCESS_DENIED" });
    await expect(withTransaction(w.pool, db => evaluateManagerDomainRead(db, request))).resolves.toBeTruthy();
  });
  it("exact replay of the same artifact acknowledges without writing; an already expired window still replays (lost-ACK retry)", async () => {
    const p = planB(), w = world(p), install = installer(w, p), first = await install();
    const writes = w.writes.length;
    expect(await install()).toEqual(first);
    expect(w.writes).toHaveLength(writes);
    // Expiry is a validator finding, not an installer refusal, so a lost-ACK retry after the window still replays.
    await expect(readPinnedOwnerArtifact({ ...pinFor(p), intake_not_after_ms: NOW + 5 * HOUR }, NOW + 3 * HOUR)).resolves.toBeTruthy();
    expect(planBGrantFindings(p.ownerValue.manager_domain_grants, WINDOW, NOW + 3 * HOUR).map(f => f.code)).toEqual(["GRANT_ALREADY_EXPIRED", "GRANT_ALREADY_EXPIRED"]);
  });
  it("fresh-policy-only is unchanged: a nonempty policy or existing grant is the typed conflict, nothing written", async () => {
    const p = planB();
    const w = world(p, { policy: { workspace_id: p.ownerValue.target.workspace_id, revision: "older" } });
    await expect(installer(w, p)()).rejects.toMatchObject({ code: "POLICY_REVISION_CONFLICT", status: 409 });
    expect(w.writes).toEqual([]);
    const g = world(p, { grants: [p.ownerValue.manager_domain_grants[0]] });
    await expect(installer(g, p)()).rejects.toMatchObject({ code: "POLICY_REVISION_CONFLICT", status: 409 });
    expect(g.writes).toEqual([]);
  });
});

describe("Plan B caps are enforced by the installer itself (fail closed, one opaque 503)", () => {
  const bad: [string, (o: any) => void][] = [
    ["READ longer than two hours", o => { o.manager_domain_grants[0].valid_until_ms = o.manager_domain_grants[0].valid_from_ms + 2 * HOUR + 1; o.policy.manager_read_domains[0].valid_until_ms += 3 * HOUR; }],
    ["STREAM longer than two hours", o => { o.manager_domain_grants[1].valid_until_ms = o.manager_domain_grants[1].valid_from_ms + 2 * HOUR + 1; o.policy.manager_read_domains[0].valid_until_ms += 3 * HOUR; }],
    ["READ beyond the renewed trust end", o => { o.manager_domain_grants[0].valid_from_ms = TRUST_EXPIRES - HOUR; o.manager_domain_grants[0].valid_until_ms = TRUST_EXPIRES + 1; }],
    ["STREAM beyond the renewed trust end", o => { o.manager_domain_grants[1].valid_from_ms = TRUST_EXPIRES - HOUR; o.manager_domain_grants[1].valid_until_ms = TRUST_EXPIRES + 1; }],
    ["only a READ grant", o => { o.manager_domain_grants.pop(); }],
    ["only a STREAM grant", o => { o.manager_domain_grants.shift(); }],
    ["two READ grants", o => { o.manager_domain_grants[1].action = "business.read_all"; }],
    ["the same grant id twice", o => { o.manager_domain_grants[1].grant_id = o.manager_domain_grants[0].grant_id; }],
    ["a third grant", o => { o.manager_domain_grants.push({ ...o.manager_domain_grants[0], grant_id: "TEST_ONLY-third" }); }],
    ["a DENY in place of the STREAM ALLOW", o => { o.manager_domain_grants[1].effect = "DENY"; }],
    ["STREAM for another subject", o => { o.manager_domain_grants[1].subject_user_id = "usr_other"; o.target.principal_workspace_pins.push({ user_id: "usr_other", workspace_id: o.target.workspace_id }); }],
  ];
  it.each(bad)("%s", async (_name, edit) => {
    const p = prepared(OWNER_STREAM_TEMPLATE, (_r, o) => edit(o));
    files.set(PATH, { bytes: p.owner, uid: 0, mode: 0o100600, ino: ++serial });
    await expect(readPinnedOwnerArtifact(pinFor(p), NOW)).rejects.toSatisfy(refused);
    // The same bytes without a Plan B pin are NOT governed by these caps (pre-Plan-B behavior unchanged) unless otherwise invalid.
  });
  it("a Plan B pin on a READ-only artifact is refused; a missing pin keeps the legacy behavior", async () => {
    const r = prepared(OWNER_READ_TEMPLATE);
    files.set(PATH, { bytes: r.owner, uid: 0, mode: 0o100600, ino: ++serial });
    await expect(readPinnedOwnerArtifact(pinFor(r), NOW)).rejects.toSatisfy(refused);
    await expect(readPinnedOwnerArtifact(pinFor(r, null), NOW)).resolves.toBeTruthy();
  });
  it("the pin itself is bounded: more than two hours, a non-integer or an unknown key never parses", async () => {
    const p = planB();
    for (const window of [{ ...WINDOW, maximum_grant_ms: PLAN_B_MAXIMUM_GRANT_MS + 1 }, { ...WINDOW, maximum_grant_ms: 0 }, { ...WINDOW, extra: 1 },
      { ...WINDOW, plan: "READ_ONLY" }, { ...WINDOW, trust_not_after_ms: "soon" }, {}])
      await expect(readPinnedOwnerArtifact(pinFor(p, window), NOW)).rejects.toSatisfy(refused);
    expect(nativeCoreRuntimeManifest.safeParse(prepared(OWNER_STREAM_TEMPLATE).runtimeValue).success).toBe(true);
    for (const mutate of [(w: any) => { w.maximum_grant_ms = PLAN_B_MAXIMUM_GRANT_MS + 1; }, (w: any) => { w.surprise = true; }, (w: any) => { delete w.trust_not_after_ms; }]) {
      const s = prepared(OWNER_STREAM_TEMPLATE, r => mutate(r.composition.owner_intakes[0].grant_window));
      expect(nativeCoreRuntimeManifest.safeParse(s.runtimeValue).success).toBe(false);
    }
  });
  it("a tighter pin tightens the check: 30-minute cap refuses a 91-minute grant", async () => {
    const p = planB();
    await expect(readPinnedOwnerArtifact(pinFor(p, { ...WINDOW, maximum_grant_ms: 30 * MINUTE }), NOW)).rejects.toSatisfy(refused);
    await expect(readPinnedOwnerArtifact(pinFor(p), NOW)).resolves.toBeTruthy();
  });
});

describe("ACK labels are derived from the artifact, never a constant (regression of the installed image)", () => {
  it("a STREAM artifact never reports DOMAIN_READ_ONLY / stream_commissioned:false, with or without a Plan B pin", async () => {
    for (const window of [WINDOW, null]) {
      const p = planB(), w = world(p), ack = await installer(w, p, window)();
      expect(ack).toMatchObject({ authority_scope: "DOMAIN_READ_AND_STREAM_GRANT", stream_commissioned: true, command_commissioned: false });
      expect(ack.authority_scope).not.toBe("DOMAIN_READ_ONLY");
    }
  });
  it("a READ-only artifact is still READ-only and carries no Plan B detail", async () => {
    const r = prepared(OWNER_READ_TEMPLATE); files.set(PATH, { bytes: r.owner, uid: 0, mode: 0o100600, ino: ++serial });
    const ack = await installer(world(r), r, null)();
    expect(ack).toEqual({ state: "REVIEWED_MANAGER_POLICY_ACKNOWLEDGED", authority_scope: "DOMAIN_READ_ONLY", artifact_sha256: sha256(r.owner),
      workspace_id: r.ownerValue.target.workspace_id, stream_commissioned: false, command_commissioned: false });
  });
});

describe("the offline validator enforces the Plan B caps (stable codes, no value echoed)", () => {
  const inspect = (p: Prepared, over: Partial<Parameters<typeof inspectCore009Preparation>[2]> = {}) =>
    inspectCore009Preparation(p.runtime, p.owner, { nowMs: NOW, plan: "read-and-stream", trustExpiresAtMs: TRUST_EXPIRES, ...over });
  const codes = (r: ReturnType<typeof inspectCore009Preparation>) => r.errors.map(e => e.code);
  it("a coherent Plan B pair passes and is the default template shape", () => {
    const p = prepared(OWNER_STREAM_TEMPLATE), report = inspect(p);
    expect(report.errors).toEqual([]);
    expect(report.summary.grants).toEqual({ business_read_all_allow: 1, stream_subscribe_allow: 1, deny: 0 });
  });
  it("two hours is a hard cap even if the operator option asks for more", () => {
    const p = prepared(OWNER_STREAM_TEMPLATE, (_r, o) => { o.manager_domain_grants[1].valid_until_ms = o.manager_domain_grants[1].valid_from_ms + 2 * HOUR + 1;
      o.policy.manager_read_domains[0].valid_until_ms += 3 * HOUR; });
    expect(codes(inspect(p, { maxGrantMs: 72 * HOUR }))).toContain("GRANT_EXCEEDS_PLAN_B_WINDOW");
  });
  it("a grant that ends after the renewed trust is refused, by option and by manifest pin", () => {
    const late = prepared(OWNER_STREAM_TEMPLATE, (_r, o) => { o.manager_domain_grants[0].valid_until_ms = TRUST_EXPIRES + 1; });
    expect(codes(inspect(late))).toContain("GRANT_OUTLIVES_TRUST");
    const pinned = prepared(OWNER_STREAM_TEMPLATE, r => { r.composition.owner_intakes[0].grant_window.trust_not_after_ms = NOW + 20 * MINUTE; });
    expect(codes(inspect(pinned))).toContain("GRANT_OUTLIVES_TRUST");
    const pinPastTrust = prepared(OWNER_STREAM_TEMPLATE, r => { r.composition.owner_intakes[0].grant_window.trust_not_after_ms = TRUST_EXPIRES + HOUR; });
    expect(codes(inspect(pinPastTrust))).toContain("GRANT_WINDOW_PIN_OUTLIVES_TRUST");
  });
  it("the trust end is mandatory for Plan B, and the manifest must carry the installer pin", () => {
    const p = prepared(OWNER_STREAM_TEMPLATE);
    expect(codes(inspect(p, { trustExpiresAtMs: undefined }))).toContain("TRUST_END_REQUIRED_FOR_PLAN_B");
    const nopin = prepared(OWNER_STREAM_TEMPLATE, r => { delete r.composition.owner_intakes[0].grant_window; });
    expect(codes(inspect(nopin))).toContain("GRANT_WINDOW_PIN_MISSING");
    const readOnlyWithPin = prepared(OWNER_READ_TEMPLATE, r => { r.composition.owner_intakes[0].grant_window = { ...WINDOW }; });
    expect(codes(inspectCore009Preparation(readOnlyWithPin.runtime, readOnlyWithPin.owner, { nowMs: NOW, trustExpiresAtMs: TRUST_EXPIRES })))
      .toContain("GRANT_WINDOW_PIN_IN_READ_ONLY_PLAN");
  });
  it("exactly one READ and one STREAM with distinct ids and the same scope", () => {
    expect(codes(inspect(prepared(OWNER_STREAM_TEMPLATE, (_r, o) => { o.manager_domain_grants[1].grant_id = o.manager_domain_grants[0].grant_id; }))))
      .toEqual(expect.arrayContaining(["PLAN_B_GRANT_ID_NOT_DISTINCT"]));
    expect(codes(inspect(prepared(OWNER_STREAM_TEMPLATE, (_r, o) => { o.manager_domain_grants.pop(); })))).toContain("PLAN_B_GRANT_SET_INVALID");
    expect(codes(inspect(prepared(OWNER_STREAM_TEMPLATE, (_r, o) => { o.manager_domain_grants[1].field_policy_ref = "TEST_ONLY-other"; }))))
      .toContain("PLAN_B_GRANTS_NOT_SAME_SCOPE");
    const report = inspect(prepared(OWNER_STREAM_TEMPLATE, (_r, o) => { o.manager_domain_grants[0].valid_until_ms = TRUST_EXPIRES + 1; }));
    expect(JSON.stringify(report)).not.toContain(String(TRUST_EXPIRES + 1));
  });
  it("policy-install-only keeps the grant caps strict (only source/native timing relaxes)", () => {
    const late = prepared(OWNER_STREAM_TEMPLATE, (_r, o) => { o.manager_domain_grants[1].valid_until_ms = TRUST_EXPIRES + 5; });
    expect(codes(inspect(late, { mode: "policy-install-only" }))).toContain("GRANT_OUTLIVES_TRUST");
  });
});
