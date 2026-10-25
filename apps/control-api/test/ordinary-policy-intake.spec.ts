/** TEST_ONLY filesystem/schema/writer doubles, not installed policy, real PG,
 * source approval, active READ/STREAM or connected commissioning evidence. */
import "reflect-metadata";
import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthService } from "../src/auth/auth.service";
import { accessDigest, grantCurrent, unqualifiedAccessRelations } from "../src/execution-v2/access-policy";
import { ExecutionAccessService } from "../src/execution-v2/access.service";
import { unqualifiedAccessTrust, type AccessTrustProvider } from "../src/execution-v2/access-trust";
import * as schema from "../src/execution-v2/current-human-schema";
import type { CurrentHumanMutations } from "../src/execution-v2/current-human-mutations";
import { composeOrdinaryPolicyIntake, readPinnedOrdinaryPolicyArtifact, type OrdinaryPolicyIntakeScope }
  from "../src/execution-v2/ordinary-policy-intake";

vi.mock("node:fs/promises", async original => ({ ...await original<typeof import("node:fs/promises")>(),
  lstat: vi.fn(), open: vi.fn() }));
const NOW = 1_792_800_000_000, PATH = "/root/TEST_ONLY-ordinary-policy.json";
type File = { bytes: Buffer; uid: number; mode: number; ino: number; link?: boolean; swap?: boolean; size?: number };
let mounted: File;
const stat = (f: File) => ({ uid: f.uid, mode: f.mode, ino: f.ino, dev: 1, size: f.size ?? f.bytes.length,
  isFile: () => !f.link, isSymbolicLink: () => !!f.link });
const scope: OrdinaryPolicyIntakeScope = { kind: "RESEARCH", environment: "paper", PORTAL_ENV: "local", AUTH_MODE: "dev",
  EXECUTION_READ_PROFILE: "native_manager_review_v1" };
function fixture() {
  const target = { database_name: "TEST_ONLY-research", database_system_identifier: "12345", role_name: "TEST_ONLY-role",
    protected_owner_user_id: "TEST_ONLY-owner", workspace_id: "TEST_ONLY-workspace",
    principal_workspace_pins: [{ user_id: "TEST_ONLY-user", workspace_id: "TEST_ONLY-workspace" }] };
  const policy = { workspace_id: target.workspace_id, revision: "TEST_ONLY-policy-1", artifact_digest: accessDigest("TEST_ONLY-policy"),
    approval_ref: "TEST_ONLY-independent-review", state: "REVIEWED" as const, qualification: "OWNER_VERIFIED" as const,
    protected_owner_user_id: target.protected_owner_user_id,
    researcher_fields: { state: "PENDING" as const, policy_ref: null, fields: [] } };
  const grant = { grant_id: "TEST_ONLY-account-root", subject_user_id: "TEST_ONLY-user", workspace_id: target.workspace_id,
    action: "account.read" as const, effect: "ALLOW" as const,
    selector: { kind: "EXPLICIT_RESOURCE_SET" as const, resource_kind: "ACCOUNT" as const, ids: ["TEST_ONLY-account"] },
    environments: ["paper" as const], valid_from_ms: NOW - 1000, valid_until_ms: NOW + 60_000,
    delegable_actions: [], issued_by: target.protected_owner_user_id, parent_grant_id: null,
    revision: "TEST_ONLY-grant-1", policy_revision: policy.revision, revoked_at_ms: null,
    requires_ts_acceptance: true, ts_receipt: null, field_policy_ref: null };
  const document = { schema_version: "portal.private-owner-ordinary-policy.v1", target, policy,
    root_grants: [grant], provenance_ref: "TEST_ONLY-review-reference" };
  const bytes = Buffer.from(JSON.stringify(document));
  const pin = { artifact_path: PATH, approved_sha256: createHash("sha256").update(bytes).digest("hex"), target,
    intake_not_before_ms: NOW - 1000, intake_not_after_ms: NOW + 120_000 };
  mounted = { bytes, uid: 0, mode: 0o100600, ino: 7 };
  const pool = { connect: vi.fn(), end: vi.fn() } as unknown as Pool;
  const auth = {} as AuthService;
  const mutations = { usesPool: vi.fn((other: Pool) => other === pool) } as unknown as CurrentHumanMutations;
  const base: AccessTrustProvider = { ...unqualifiedAccessTrust, verifyRootReceipt: vi.fn(async () => null) };
  return { document, pin, pool, auth, mutations, base };
}
function mountDocument(value: unknown, pin: ReturnType<typeof fixture>["pin"]): void {
  mounted.bytes = Buffer.from(JSON.stringify(value));
  pin.approved_sha256 = createHash("sha256").update(mounted.bytes).digest("hex");
}
beforeEach(() => {
  vi.mocked(lstat).mockImplementation(async path => {
    expect(String(path)).toBe(PATH); return stat(mounted) as Awaited<ReturnType<typeof lstat>>;
  });
  vi.mocked(open).mockImplementation(async (path, flags) => {
    expect(String(path)).toBe(PATH); expect(flags).toBe(constants.O_RDONLY | constants.O_NOFOLLOW);
    let offset = 0;
    return { stat: async () => stat(mounted.swap ? { ...mounted, ino: 8 } : mounted), close: vi.fn(async () => undefined),
      read: async (buffer: Buffer, start: number, length: number) => {
        const bytesRead = Math.min(length, mounted.bytes.length - offset);
        if (bytesRead > 0) mounted.bytes.copy(buffer, start, offset, offset + bytesRead);
        offset += bytesRead; return { bytesRead, buffer };
      } } as unknown as Awaited<ReturnType<typeof open>>;
  });
  vi.spyOn(schema, "assertRegisteredResearchCurrentHumanSchema").mockResolvedValue({
    schema_version: schema.CURRENT_HUMAN_RESEARCH_SCHEMA_VERSION, schema_sha256: schema.CURRENT_HUMAN_RESEARCH_SCHEMA_SHA256,
    catalogue_sha256: "a".repeat(64), installed: false });
});
afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); });

describe("private ordinary-policy pinned bytes and exact scope", () => {
  it("reads only exact reviewed ordinary roots, without importing manager authority or a source receipt", async () => {
    const f = fixture(), artifact = await readPinnedOrdinaryPolicyArtifact(f.pin, NOW);
    expect(artifact).toEqual({ policy: f.document.policy, root_grants: f.document.root_grants,
      provenance_ref: f.document.provenance_ref });
    expect(artifact.root_grants[0]!.ts_receipt).toBeNull();
    expect(artifact).not.toHaveProperty("manager_domain_grants");
    expect(schema.assertRegisteredResearchCurrentHumanSchema).not.toHaveBeenCalled();
  });
  it.each([
    ["non-root owner", { uid: 1000 }], ["group readable", { mode: 0o100640 }], ["symlink", { link: true }],
    ["inode replacement", { swap: true }], ["over size", { size: 131073 }], ["empty", { size: 0 }],
  ])("refuses %s through the existing private file guard", async (_label, change) => {
    const f = fixture(); Object.assign(mounted, change);
    await expect(readPinnedOrdinaryPolicyArtifact(f.pin, NOW)).rejects.toMatchObject({ code: "RECEIPT_NOT_QUALIFIED", status: 503 });
  });
  it("refuses changed bytes and noncompact encoding without normalizing them", async () => {
    const f = fixture(); mounted.bytes = Buffer.concat([mounted.bytes, Buffer.from(" ")]);
    await expect(readPinnedOrdinaryPolicyArtifact(f.pin, NOW)).rejects.toMatchObject({ code: "RECEIPT_NOT_QUALIFIED" });
    f.pin.approved_sha256 = createHash("sha256").update(mounted.bytes).digest("hex");
    await expect(readPinnedOrdinaryPolicyArtifact(f.pin, NOW)).rejects.toMatchObject({ code: "RECEIPT_NOT_QUALIFIED" });
  });
  it.each([NOW - 1001, NOW + 120000, NaN])("refuses outside exact intake time %s before file I/O", async now => {
    const f = fixture(); await expect(readPinnedOrdinaryPolicyArtifact(f.pin, now)).rejects.toMatchObject({ code: "RECEIPT_NOT_QUALIFIED" });
    expect(lstat).not.toHaveBeenCalled();
  });
  it.each([
    ["test-only policy", (f: ReturnType<typeof fixture>) => ({ ...f.document, policy: { ...f.document.policy, qualification: "TEST_ONLY" } })],
    ["different target", (f: ReturnType<typeof fixture>) => ({ ...f.document, target: { ...f.document.target, database_name: "OTHER" } })],
    ["manager-domain grant", (f: ReturnType<typeof fixture>) => ({ ...f.document, manager_domain_grants: [] })],
    ["different owner", (f: ReturnType<typeof fixture>) => ({ ...f.document, policy: { ...f.document.policy, protected_owner_user_id: "OTHER" } })],
    ["economic acceptance waived", (f: ReturnType<typeof fixture>) => ({ ...f.document, root_grants: [{ ...f.document.root_grants[0], requires_ts_acceptance: false }] })],
    ["unbounded grant", (f: ReturnType<typeof fixture>) => ({ ...f.document, root_grants: [{ ...f.document.root_grants[0], valid_until_ms: null }] })],
    ["other environment", (f: ReturnType<typeof fixture>) => ({ ...f.document, root_grants: [{ ...f.document.root_grants[0], environments: ["live"] }] })],
    ["unreviewed subject", (f: ReturnType<typeof fixture>) => ({ ...f.document, root_grants: [{ ...f.document.root_grants[0], subject_user_id: "OTHER" }] })],
    ["embedded receipt", (f: ReturnType<typeof fixture>) => ({ ...f.document, root_grants: [{ ...f.document.root_grants[0], ts_receipt: {
      receipt_id: "pretend", membership_revision: "pretend", mapping_revision: "pretend", effective_at_ms: NOW, expires_at_ms: NOW + 1 } }] })],
    ["duplicate roots", (f: ReturnType<typeof fixture>) => ({ ...f.document, root_grants: [f.document.root_grants[0], f.document.root_grants[0]] })],
    ["unsafe ID", (f: ReturnType<typeof fixture>) => ({ ...f.document, root_grants: [{ ...f.document.root_grants[0],
      selector: { kind: "EXPLICIT_RESOURCE_SET", resource_kind: "ACCOUNT", ids: ["unsafe\u202eID"] } }] })],
  ])("refuses %s", async (_label, change) => {
    const f = fixture(); mountDocument(change(f), f.pin);
    await expect(readPinnedOrdinaryPolicyArtifact(f.pin, NOW)).rejects.toMatchObject({ code: "RECEIPT_NOT_QUALIFIED", status: 503 });
  });
});

describe("official ordinary-policy writer composition, TEST_ONLY adapters", () => {
  it("does no constructor I/O and retains the exact pool/coordinator/provider callbacks", async () => {
    const f = fixture(), intake = composeOrdinaryPolicyIntake(f.pool, f.auth, f.base, f.mutations, f.pin, scope, () => NOW);
    expect(f.pool.connect).not.toHaveBeenCalled(); expect(lstat).not.toHaveBeenCalled();
    expect(schema.assertRegisteredResearchCurrentHumanSchema).not.toHaveBeenCalled();
    expect(intake.dependencies.currentHumanMutations).toBe(f.mutations);
    await intake.dependencies.executionAccessTrust.verifyRootReceipt!({ TEST_ONLY: true }, { phase: "QUALIFY" });
    expect(f.base.verifyRootReceipt).toHaveBeenCalledWith({ TEST_ONLY: true }, { phase: "QUALIFY" });
    expect(f.base.verifyRootReceipt).toHaveBeenCalledOnce();
  });
  it("uses the registered actual target and official writer, returning only pending-policy ACK", async () => {
    const f = fixture(), intake = composeOrdinaryPolicyIntake(f.pool, f.auth, f.base, f.mutations, f.pin, scope, () => NOW);
    const write = vi.spyOn(ExecutionAccessService.prototype, "installReviewedPolicy").mockImplementation(async request => {
      const artifact = await intake.dependencies.executionAccessTrust.verifyPolicy(request);
      expect(artifact?.root_grants).toEqual(f.document.root_grants);
    });
    const ack = await intake.install();
    expect(write).toHaveBeenCalledOnce();
    expect(schema.assertRegisteredResearchCurrentHumanSchema).toHaveBeenCalledWith(f.pool, f.pin.target);
    expect(ack).toMatchObject({ authority_scope: "POLICY_INSTALL_ONLY", roots_pending_ts_acceptance: 1,
      source_acceptance: "NOT_PERFORMED", business_read_commissioned: false, stream_commissioned: false, command_commissioned: false });
    expect(f.base.verifyRootReceipt).not.toHaveBeenCalled(); expect(f.pool.connect).not.toHaveBeenCalled();
  });
  it("rejects actual target/schema drift before the writer can receive an artifact", async () => {
    const f = fixture(), intake = composeOrdinaryPolicyIntake(f.pool, f.auth, f.base, f.mutations, f.pin, scope, () => NOW);
    vi.mocked(schema.assertRegisteredResearchCurrentHumanSchema).mockRejectedValue(Error("TEST_ONLY-target-drift"));
    await expect(intake.install()).rejects.toThrow(); expect(f.pool.connect).not.toHaveBeenCalled();
  });
  it("rechecks the intake clock after actual schema I/O", async () => {
    const f = fixture(); let now = NOW;
    const intake = composeOrdinaryPolicyIntake(f.pool, f.auth, f.base, f.mutations, f.pin, scope, () => now);
    vi.mocked(schema.assertRegisteredResearchCurrentHumanSchema).mockImplementation(async () => {
      now = f.pin.intake_not_after_ms; return { schema_version: schema.CURRENT_HUMAN_RESEARCH_SCHEMA_VERSION,
        schema_sha256: schema.CURRENT_HUMAN_RESEARCH_SCHEMA_SHA256, catalogue_sha256: "a".repeat(64), installed: false };
    });
    await expect(intake.install()).rejects.toMatchObject({ code: "RECEIPT_NOT_QUALIFIED" }); expect(f.pool.connect).not.toHaveBeenCalled();
  });
  it.each(["missing", "default"])("does not install economic roots with a %s root-source adapter", async variant => {
    const f = fixture(), base = { ...unqualifiedAccessTrust }; if (variant === "missing") delete base.verifyRootReceipt;
    const intake = composeOrdinaryPolicyIntake(f.pool, f.auth, base, f.mutations, f.pin, scope, () => NOW);
    await expect(intake.install()).rejects.toMatchObject({ code: "RECEIPT_NOT_QUALIFIED" });
    expect(schema.assertRegisteredResearchCurrentHumanSchema).not.toHaveBeenCalled(); expect(f.pool.connect).not.toHaveBeenCalled();
  });
  it("a configured but unqualified source cannot accept a root or authorize a read", async () => {
    const f = fixture(), intake = composeOrdinaryPolicyIntake(f.pool, f.auth, f.base, f.mutations, f.pin, scope, () => NOW);
    const access = new ExecutionAccessService(f.pool, f.auth, intake.dependencies.executionAccessTrust, false, f.mutations);
    await expect(access.acceptRootTsReceipt({ role: "ADMIN" })).rejects.toMatchObject({ code: "RECEIPT_NOT_QUALIFIED" });
    expect(f.pool.connect).not.toHaveBeenCalled();
    const artifact = await readPinnedOrdinaryPolicyArtifact(f.pin, NOW), grant = artifact.root_grants[0]!;
    expect(grantCurrent(grant, { principal_id: grant.subject_user_id, workspace_id: grant.workspace_id, now_ms: NOW,
      actor_current: true, policy: artifact.policy, grants: [grant], active_principals: new Set([grant.subject_user_id, grant.issued_by]),
      relationsFor: () => unqualifiedAccessRelations() }, new Set(), { resource: { kind: "ACCOUNT", id: "TEST_ONLY-account" }, environment: "paper" })).toBe(false);
  });
  it("does not grant trust to copied artifact JSON", async () => {
    const f = fixture(), verify = vi.fn(async () => null); f.base.verifyPolicy = verify;
    const intake = composeOrdinaryPolicyIntake(f.pool, f.auth, f.base, f.mutations, f.pin, scope, () => NOW);
    expect(await intake.dependencies.executionAccessTrust.verifyPolicy(f.document)).toBeNull();
    expect(verify).toHaveBeenCalledWith(f.document); expect(lstat).not.toHaveBeenCalled();
  });
  it("detaches operator pins and refuses mismatched pool or non-Research scope before I/O", () => {
    const f = fixture(); vi.mocked(f.mutations.usesPool).mockReturnValue(false);
    expect(() => composeOrdinaryPolicyIntake(f.pool, f.auth, f.base, f.mutations, f.pin, scope)).toThrow();
    vi.mocked(f.mutations.usesPool).mockReturnValue(true);
    expect(() => composeOrdinaryPolicyIntake(f.pool, f.auth, f.base, f.mutations, f.pin,
      { ...scope, PORTAL_ENV: "production" } as unknown as OrdinaryPolicyIntakeScope)).toThrow();
    expect(lstat).not.toHaveBeenCalled(); expect(f.pool.connect).not.toHaveBeenCalled();
  });
});
