/** Bounded READ-only install plan (Bobby, 2026-11-12: READ never implies STREAM). TEST_ONLY, fakes only.
 * The Research native install used to accept only the Plan B READ+STREAM pair. A `READ_ONLY` pin keeps the
 * same <= 2 h and renewed-trust caps but installs exactly ONE READ grant and no STREAM. NOT PostgreSQL. */
import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthService } from "../src/auth/auth.service";
import { ExecutionAccessService } from "../src/execution-v2/access.service";
import { unqualifiedAccessTrust } from "../src/execution-v2/access-trust";
import { PLAN_B_MAXIMUM_GRANT_MS, planBGrantFindings, privateOwnerCommissioning, readPinnedOwnerArtifact,
  type PrivateOwnerCommissioningPin } from "../src/execution-v2/core-owner-commissioning";
import { inspectCore009Preparation } from "../src/execution-v2/core009-preparation";
import { HOUR, MINUTE, NOW, OWNER_READ_TEMPLATE, OWNER_STREAM_TEMPLATE, TRUST_EXPIRES, prepared, sha256 } from "./fixtures/core009-templates";
import { FakeCoreWorld } from "./fixtures/fake-core-world";

vi.mock("node:fs/promises", async original => ({ ...await original<typeof import("node:fs/promises")>(), lstat: vi.fn(), open: vi.fn() }));
type File = { bytes: Buffer; uid: number; mode: number; ino: number };
const files = new Map<string, File>();
const PATH = "/root/TEST_ONLY-owner-read.json";
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

const READ_ONLY = { plan: "READ_ONLY" as const, maximum_grant_ms: PLAN_B_MAXIMUM_GRANT_MS, trust_not_after_ms: TRUST_EXPIRES };
type Prepared = ReturnType<typeof prepared>;
const withPin = (edit: (r: any, o: any) => void = () => undefined) =>
  prepared(OWNER_READ_TEMPLATE, (r, o) => { r.composition.owner_intakes[0].grant_window = { ...READ_ONLY }; edit(r, o); });
const inspect = (p: Prepared, over: Partial<Parameters<typeof inspectCore009Preparation>[2]> = {}) =>
  inspectCore009Preparation(p.runtime, p.owner, { nowMs: NOW, plan: "read-only", trustExpiresAtMs: TRUST_EXPIRES, ...over });
const codes = (r: ReturnType<typeof inspectCore009Preparation>) => r.errors.map(e => e.code);
const refused = (e: unknown) => (e as { code?: string }).code === "RECEIPT_NOT_QUALIFIED" && (e as { status?: number }).status === 503;
function pinFor(p: Prepared, window: unknown | null = READ_ONLY): PrivateOwnerCommissioningPin {
  return { artifact_path: PATH, approved_sha256: sha256(p.owner), target: p.ownerValue.target, intake_not_before_ms: NOW - MINUTE,
    intake_not_after_ms: NOW + 90 * MINUTE, ...(window === null ? {} : { grant_window: window as any }) };
}
function world(p: Prepared) {
  const t = p.ownerValue.target;
  return new FakeCoreWorld({ now: NOW, database: { db: t.database_name, system: t.database_system_identifier, login: t.role_name },
    owner: t.protected_owner_user_id, workspace: t.workspace_id, members: [t.protected_owner_user_id], policy: null, grants: [] });
}

describe("READ_ONLY plan: the validator", () => {
  it("one finite READ grant under the pin passes, with zero STREAM grants", () => {
    const p = withPin(), report = inspect(p);
    expect(report.errors).toEqual([]);
    expect(report.summary.grants).toEqual({ business_read_all_allow: 1, stream_subscribe_allow: 0, deny: 0 });
  });
  it("the 2 h cap and the renewed-trust end bind the READ_ONLY grant too", () => {
    const long = withPin((_r, o) => { o.manager_domain_grants[0].valid_until_ms = o.manager_domain_grants[0].valid_from_ms + 2 * HOUR + 1;
      o.policy.manager_read_domains[0].valid_until_ms += 3 * HOUR; });
    expect(codes(inspect(long, { maxGrantMs: 72 * HOUR }))).toContain("GRANT_EXCEEDS_PLAN_B_WINDOW");
    const late = withPin((_r, o) => { o.manager_domain_grants[0].valid_until_ms = TRUST_EXPIRES + 1; });
    expect(codes(inspect(late))).toContain("GRANT_OUTLIVES_TRUST");
    const pinPastTrust = withPin(r => { r.composition.owner_intakes[0].grant_window.trust_not_after_ms = TRUST_EXPIRES + HOUR; });
    expect(codes(inspect(pinPastTrust))).toContain("GRANT_WINDOW_PIN_OUTLIVES_TRUST");
  });
  it("a READ_ONLY pin refuses an artifact that also carries a STREAM grant", () => {
    const pair = prepared(OWNER_STREAM_TEMPLATE, r => { r.composition.owner_intakes[0].grant_window.plan = "READ_ONLY"; });
    expect(codes(inspect(pair))).toEqual(expect.arrayContaining(["PLAN_B_GRANT_SET_INVALID", "STREAM_GRANT_IN_READ_ONLY_PLAN"]));
  });
  it("the pin plan must match the validator plan, both ways", () => {
    const pair = prepared(OWNER_STREAM_TEMPLATE);
    expect(codes(inspectCore009Preparation(pair.runtime, pair.owner, { nowMs: NOW, plan: "read-only", trustExpiresAtMs: TRUST_EXPIRES })))
      .toContain("GRANT_WINDOW_PIN_IN_READ_ONLY_PLAN");
    const ro = withPin();
    expect(codes(inspect(ro, { plan: "read-and-stream" }))).toContain("GRANT_WINDOW_PIN_PLAN_MISMATCH");
  });
  it("planBGrantFindings: READ_ONLY needs exactly one READ ALLOW grant", () => {
    const p = withPin();
    const [read] = p.ownerValue.manager_domain_grants;
    expect(planBGrantFindings([read], READ_ONLY, NOW)).toEqual([]);
    expect(planBGrantFindings([], READ_ONLY, NOW).map(f => f.code)).toEqual(["PLAN_B_GRANT_SET_INVALID"]);
    expect(planBGrantFindings([read, read], READ_ONLY, NOW).map(f => f.code)).toEqual(["PLAN_B_GRANT_SET_INVALID"]);
    expect(planBGrantFindings([{ ...read, action: "stream.subscribe" }], READ_ONLY, NOW).map(f => f.code)).toEqual(["PLAN_B_GRANT_SET_INVALID"]);
  });
});

describe("READ_ONLY plan: the installer", () => {
  it("installs exactly one READ grant; the ACK is READ-only, names the plan and reports no STREAM", async () => {
    const p = withPin(); files.set(PATH, { bytes: p.owner, uid: 0, mode: 0o100600, ino: ++serial });
    const w = world(p), intake = privateOwnerCommissioning(unqualifiedAccessTrust, w.pool, pinFor(p), () => NOW);
    const ack = await intake.install(new ExecutionAccessService(w.pool, {} as AuthService, intake.trust, false, w.coordinator.asMutations()));
    const [read] = p.ownerValue.manager_domain_grants;
    expect(w.grants.size).toBe(1);
    expect(w.grantsOf(p.ownerValue.target.workspace_id).map(g => g.action)).toEqual(["business.read_all"]);
    expect(ack).toEqual({ state: "REVIEWED_MANAGER_POLICY_ACKNOWLEDGED", authority_scope: "DOMAIN_READ_ONLY",
      artifact_sha256: sha256(p.owner), workspace_id: p.ownerValue.target.workspace_id, stream_commissioned: false, command_commissioned: false,
      plan: "READ_ONLY", grants: [{ grant_id: read.grant_id, action: "business.read_all", valid_from_ms: read.valid_from_ms, valid_until_ms: read.valid_until_ms }] });
  });
  it("refuses a pair under a READ_ONLY pin, a grant longer than the pin, and one that outlives the trust", async () => {
    const pair = prepared(OWNER_STREAM_TEMPLATE); files.set(PATH, { bytes: pair.owner, uid: 0, mode: 0o100600, ino: ++serial });
    await expect(readPinnedOwnerArtifact(pinFor(pair), NOW)).rejects.toSatisfy(refused);
    const p = withPin(); files.set(PATH, { bytes: p.owner, uid: 0, mode: 0o100600, ino: ++serial });
    await expect(readPinnedOwnerArtifact(pinFor(p, { ...READ_ONLY, maximum_grant_ms: 30 * MINUTE }), NOW)).rejects.toSatisfy(refused);
    await expect(readPinnedOwnerArtifact(pinFor(p, { ...READ_ONLY, trust_not_after_ms: NOW + 10 * MINUTE }), NOW)).rejects.toSatisfy(refused);
    await expect(readPinnedOwnerArtifact(pinFor(p), NOW)).resolves.toBeTruthy();
  });
});
