/** TEST_ONLY isolated orchestration doubles. No DB, listener, source request,
 * credential file, installed authority or connected qualification. */
import "reflect-metadata";
import type { Pool } from "pg";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ControlApiConfig } from "../src/config";
import type { PreparedNativeCoreRuntime } from "../src/execution-v2/native-core-runtime";
import type { PreparedNativeRootRuntime, PreparedNativeRootApplication } from "../src/execution-v2/native-root-runtime";
import { parseOrdinaryPolicyOperatorArgs, runOrdinaryPolicyOperator, ordinaryPolicyOperatorFailure,
  OrdinaryPolicyOperatorError } from "../src/execution-v2/ordinary-policy-operator";

const mock = vi.hoisted(() => ({ load: vi.fn(), pool: vi.fn(), coreRef: vi.fn(), core: vi.fn(), rootRef: vi.fn(),
  root: vi.fn(), application: vi.fn(), artifact: vi.fn(), intake: vi.fn(), auth: vi.fn(), argon: vi.fn(), access: vi.fn() }));
vi.mock("../src/config", () => ({ loadConfig: mock.load }));
vi.mock("../src/db/pool", () => ({ buildPool: mock.pool }));
vi.mock("../src/auth/auth.service", () => ({ AuthService: mock.auth }));
vi.mock("../src/auth/argon", () => ({ Argon2CredentialService: mock.argon }));
vi.mock("../src/execution-v2/access.service", () => ({ ExecutionAccessService: mock.access }));
vi.mock("../src/execution-v2/native-core-runtime", () => ({ nativeCoreRuntimeReference: mock.coreRef, prepareNativeCoreRuntime: mock.core }));
vi.mock("../src/execution-v2/native-root-runtime", () => ({ nativeRootRuntimeReference: mock.rootRef,
  prepareNativeRootRuntime: mock.root, prepareNativeRootApplication: mock.application }));
vi.mock("../src/execution-v2/ordinary-policy-intake", () => ({ readPinnedOrdinaryPolicyArtifact: mock.artifact,
  composeOrdinaryPolicyIntake: mock.intake }));

const installArgs = ["install-policy", "--artifact", "/root/TEST_ONLY-policy.json", "--sha256", "a".repeat(64),
  "--not-before-ms", "1000", "--not-after-ms", "2000"];
const target = { database_name: "TEST_ONLY-db", database_system_identifier: "1234", role_name: "TEST_ONLY-role",
  protected_owner_user_id: "TEST_ONLY-owner", workspace_id: "TEST_ONLY-workspace",
  principal_workspace_pins: [{ user_id: "TEST_ONLY-owner", workspace_id: "TEST_ONLY-workspace" }] };
const profile = { max: 2, connectionTimeoutMillis: 1000, statement_timeout: 2000, query_timeout: 3000,
  idle_in_transaction_session_timeout: 2000 };
function fixture() {
  const events: string[] = [], poolEnd = vi.fn(async () => { events.push("pool.end"); }), pool = { end: poolEnd } as unknown as Pool;
  const original = { grant_id: "TEST_ONLY-original-grant", accepted_fact_digest: `sha256:${"b".repeat(64)}` };
  const runtime = { poolProfile: { ...profile }, schemaTarget: structuredClone(target), provider: { original },
    transport: { tls: { key: Buffer.from("TEST_ONLY-key"), cert: Buffer.from("TEST_ONLY-cert"), ca: Buffer.from("TEST_ONLY-ca") } },
  } as unknown as PreparedNativeRootRuntime;
  const provider = { usesPool: vi.fn((other: unknown) => other === pool) };
  const root = { provider, shutdown: vi.fn(async () => { events.push("root.shutdown"); }) } as unknown as PreparedNativeRootApplication;
  const mutations = { usesPool: vi.fn((other: unknown) => other === pool),
    hasRootRecoveryParticipant: vi.fn((other: unknown) => other === provider) };
  const trust = { TEST_ONLY: "same genuine-composition boundary double" };
  const deps = { currentHumanMutations: mutations, executionAccessTrust: trust, nativeManagerRead: {} };
  const compose = vi.fn(async () => { events.push("native.compose"); return deps; });
  const native = { poolProfile: { ...profile }, researchReviewTarget: vi.fn(() => structuredClone(target)),
    compose } as unknown as PreparedNativeCoreRuntime;
  const config = { PORTAL_ENV: "local", AUTH_MODE: "dev", EXECUTION_READ_PROFILE: "native_manager_review_v1",
    EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID: target.workspace_id, DATABASE_URL: "TEST_ONLY-DO-NOT-LOG-DSN",
    ARGON2_MEMORY_KIB: 1024, ARGON2_ITERATIONS: 1, ARGON2_PARALLELISM: 1 } as ControlApiConfig;
  const result = { receipt: { operation_id: "TEST_ONLY-operation", outcome: "TS_APPLIED", policy_revision: "TEST_ONLY-policy",
    grant_revision: "TEST_ONLY-revision", arbitrary_private_field: "TEST_ONLY-private-source-value" }, replayed: false };
  const accept = vi.fn(async (_original: unknown) => { events.push("accept-root"); return result; });
  const install = vi.fn(async () => { events.push("install-policy"); return { state: "REVIEWED_ORDINARY_POLICY_ACKNOWLEDGED",
    authority_scope: "POLICY_INSTALL_ONLY", source_acceptance: "NOT_PERFORMED", business_read_commissioned: false }; });
  mock.load.mockReturnValue(config);
  mock.coreRef.mockReturnValue({ path: "/TEST_ONLY-native.json", sha256: "c".repeat(64) });
  mock.rootRef.mockReturnValue({ path: "/TEST_ONLY-root.json", sha256: "d".repeat(64) });
  mock.core.mockImplementation(async () => { events.push("prepare.core"); return native; });
  mock.root.mockImplementation(async () => { events.push("prepare.root"); return runtime; });
  mock.artifact.mockImplementation(async () => { events.push("validate.artifact"); return {}; });
  mock.pool.mockImplementation(() => { events.push("pool.create"); return pool; });
  mock.application.mockImplementation(async () => { events.push("root.application"); return root; });
  mock.intake.mockReturnValue({ install });
  mock.auth.mockImplementation(function () {});
  mock.argon.mockImplementation(function () {});
  mock.access.mockImplementation(function () { return { acceptRootTsReceipt: accept }; });
  return { events, pool, poolEnd, original, runtime, root, provider, mutations, trust, deps, compose, native, config, accept, install, result };
}
beforeEach(() => { for (const fn of Object.values(mock)) fn.mockReset(); });

describe("explicit private ordinary-policy operator arguments and scope", () => {
  it("separates policy artifact flags from exact-original ROOT acceptance", () => {
    expect(parseOrdinaryPolicyOperatorArgs(installArgs)).toMatchObject({ operation: "install-policy", artifact: installArgs[2], dryRun: false });
    expect(parseOrdinaryPolicyOperatorArgs([...installArgs, "--dry-run"])).toMatchObject({ dryRun: true });
    expect(parseOrdinaryPolicyOperatorArgs(["accept-root"])).toEqual({ operation: "accept-root", dryRun: false });
    expect(parseOrdinaryPolicyOperatorArgs(["accept-root", "--dry-run"])).toEqual({ operation: "accept-root", dryRun: true });
  });
  it.each([[], ["policy"], ["accept-root", "--artifact", "/private"], ["accept-root", "--receipt", "secret"],
    ["accept-root", "--dry-run", "--dry-run"], [...installArgs, "--dry-run", "--dry-run"], [...installArgs, "--unknown", "secret"],
    ["install-policy", "--artifact", "relative"], [...installArgs, "--sha256", "a".repeat(64)]].map(argv => ({ argv })))("rejects unsupported input $argv before config/file/pool", async ({ argv }) => {
    fixture(); await expect(runOrdinaryPolicyOperator(argv)).rejects.toMatchObject({ code: "ORDINARY_POLICY_OPERATOR_USAGE", exitCode: 2 });
    expect(mock.load).not.toHaveBeenCalled(); expect(mock.pool).not.toHaveBeenCalled();
  });
  it.each([{ PORTAL_ENV: "stable" }, { AUTH_MODE: "password" }, { EXECUTION_READ_PROFILE: "retained_review_v1" },
    { EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID: undefined }])("refuses non-Research scope before private reads %j", async change => {
    const f = fixture(); mock.load.mockReturnValue({ ...f.config, ...change });
    await expect(runOrdinaryPolicyOperator(["accept-root"])).rejects.toMatchObject({ code: "ORDINARY_POLICY_OPERATOR_SCOPE_REQUIRED" });
    expect(mock.core).not.toHaveBeenCalled(); expect(mock.root).not.toHaveBeenCalled(); expect(mock.pool).not.toHaveBeenCalled();
  });
  it.each(["core", "root"] as const)("requires the complete %s opt-in before preparing private runtimes", async which => {
    fixture(); (which === "core" ? mock.coreRef : mock.rootRef).mockReturnValue(undefined);
    await expect(runOrdinaryPolicyOperator(["accept-root"])).rejects.toMatchObject({ code: "ORDINARY_POLICY_OPERATOR_CONFIG_INVALID" });
    expect(mock.core).not.toHaveBeenCalled(); expect(mock.pool).not.toHaveBeenCalled();
  });
  it.each(["target", "profile"] as const)("rejects mismatched %s before pool construction", async what => {
    const f = fixture();
    if (what === "target") Object.assign(f.runtime.schemaTarget, { workspace_id: "OTHER" });
    else Object.assign(f.runtime.poolProfile, { max: 3 });
    await expect(runOrdinaryPolicyOperator(["accept-root"])).rejects.toMatchObject({ code: "ORDINARY_POLICY_OPERATOR_CONFIG_INVALID" });
    expect(mock.pool).not.toHaveBeenCalled(); expect(mock.application).not.toHaveBeenCalled();
    expect(Object.values(f.runtime.transport.tls).every(bytes => Buffer.isBuffer(bytes) && bytes.every(byte => byte === 0))).toBe(true);
  });
});

describe("config/artifact-only dry run", () => {
  it.each(["install-policy", "accept-root"] as const)("never creates pool/provider/network or writer for %s", async operation => {
    const f = fixture(), argv = operation === "install-policy" ? [...installArgs, "--dry-run"] : [operation, "--dry-run"];
    const result = await runOrdinaryPolicyOperator(argv);
    expect(result).toMatchObject({ dry_run: true, validation_scope: "CONFIG_AND_ARTIFACT_ONLY", database_checked: false,
      source_checked: false, business_read_commissioned: false, stream_commissioned: false, command_commissioned: false });
    expect(mock.artifact).toHaveBeenCalledTimes(operation === "install-policy" ? 1 : 0);
    expect(mock.pool).not.toHaveBeenCalled(); expect(mock.application).not.toHaveBeenCalled(); expect(f.compose).not.toHaveBeenCalled();
    expect(mock.intake).not.toHaveBeenCalled(); expect(f.accept).not.toHaveBeenCalled();
    expect(Object.values(f.runtime.transport.tls).every(bytes => Buffer.isBuffer(bytes) && bytes.every(byte => byte === 0))).toBe(true);
  });
  it("rejects an invalid owner artifact before pool construction", async () => {
    fixture(); mock.artifact.mockRejectedValue(new Error("TEST_ONLY-secret private artifact /root/secret"));
    await expect(runOrdinaryPolicyOperator(installArgs)).rejects.toMatchObject({ code: "ORDINARY_POLICY_OPERATOR_FAILED" });
    expect(mock.pool).not.toHaveBeenCalled();
  });
});

describe("same real writer composition and cleanup ordering (boundary doubles)", () => {
  it("installs only the reviewed ordinary policy using the same pool/trust/coordinator", async () => {
    const f = fixture(), result = await runOrdinaryPolicyOperator(installArgs);
    expect(result).toMatchObject({ authority_scope: "POLICY_INSTALL_ONLY", source_acceptance: "NOT_PERFORMED", business_read_commissioned: false });
    expect(f.compose).toHaveBeenCalledWith(f.pool, [], undefined, f.provider);
    expect(mock.application).toHaveBeenCalledWith(f.pool, f.runtime);
    expect(mock.intake).toHaveBeenCalledWith(f.pool, expect.anything(), f.trust, f.mutations,
      expect.objectContaining({ artifact_path: installArgs[2], target }),
      { kind: "RESEARCH", environment: "paper", PORTAL_ENV: "local", AUTH_MODE: "dev", EXECUTION_READ_PROFILE: "native_manager_review_v1" });
    expect(f.events).toEqual(["prepare.core", "prepare.root", "validate.artifact", "pool.create", "root.application", "native.compose",
      "install-policy", "root.shutdown", "pool.end"]);
    expect(f.accept).not.toHaveBeenCalled();
  });
  it("accepts only the detached pinned original, never policy JSON or domain repair", async () => {
    const f = fixture(), expected = { ...f.original };
    f.compose.mockImplementationOnce(async () => { f.original.grant_id = "MUTATED-AFTER-PREPARATION"; return f.deps; });
    const result = await runOrdinaryPolicyOperator(["accept-root"]);
    expect(f.accept).toHaveBeenCalledWith(expected); expect(f.accept.mock.calls[0]?.[0]).not.toBe(f.original);
    expect(mock.access).toHaveBeenCalledWith(f.pool, expect.anything(), f.trust, false, f.mutations);
    expect(mock.intake).not.toHaveBeenCalled(); expect(mock.artifact).not.toHaveBeenCalled(); expect(f.install).not.toHaveBeenCalled();
    expect(result).toMatchObject({ authority_scope: "ROOT_RECEIPT_ONLY", receipt: { outcome: "TS_APPLIED" }, business_read_commissioned: false });
    expect(JSON.stringify(result)).not.toContain("TEST_ONLY-private-source-value");
    expect(f.events.slice(-3)).toEqual(["accept-root", "root.shutdown", "pool.end"]);
  });
  it.each(["missing-trust", "wrong-pool", "wrong-participant"] as const)("refuses %s before invoking a writer", async fault => {
    const f = fixture();
    if (fault === "missing-trust") delete (f.deps as Partial<typeof f.deps>).executionAccessTrust;
    if (fault === "wrong-pool") f.mutations.usesPool.mockReturnValue(false);
    if (fault === "wrong-participant") f.mutations.hasRootRecoveryParticipant.mockReturnValue(false);
    await expect(runOrdinaryPolicyOperator(["accept-root"])).rejects.toMatchObject({ code: "ORDINARY_POLICY_OPERATOR_COMPOSITION_REQUIRED" });
    expect(f.accept).not.toHaveBeenCalled(); expect(f.root.shutdown).toHaveBeenCalledOnce(); expect(f.pool.end).toHaveBeenCalledOnce();
  });
  it("closes only the pool if schema/provider preparation fails before construction", async () => {
    const f = fixture(); mock.application.mockRejectedValue(new Error("TEST_ONLY private schema details"));
    await expect(runOrdinaryPolicyOperator(["accept-root"])).rejects.toMatchObject({ code: "ORDINARY_POLICY_OPERATOR_FAILED" });
    expect(f.root.shutdown).not.toHaveBeenCalled(); expect(f.pool.end).toHaveBeenCalledOnce(); expect(f.accept).not.toHaveBeenCalled();
  });
  it("drains the same ROOT provider if native composition fails", async () => {
    const f = fixture(); f.compose.mockRejectedValueOnce(new Error("TEST_ONLY composition secret"));
    await expect(runOrdinaryPolicyOperator(["accept-root"])).rejects.toMatchObject({ code: "ORDINARY_POLICY_OPERATOR_FAILED" });
    expect(f.events.slice(-2)).toEqual(["root.shutdown", "pool.end"]); expect(f.accept).not.toHaveBeenCalled();
  });
  it("keeps the original refusal while draining before closing the pool", async () => {
    const f = fixture(); f.accept.mockRejectedValueOnce(Object.assign(new Error("SECRET SQL/token"), { code: "RECEIPT_NOT_QUALIFIED" }));
    await expect(runOrdinaryPolicyOperator(["accept-root"])).rejects.toMatchObject({ code: "ORDINARY_POLICY_OPERATOR_REFUSED", exitCode: 1 });
    expect(f.events.slice(-3)).toEqual(["native.compose", "root.shutdown", "pool.end"]);
  });
  it("never closes the pool or returns success after uncertain ROOT drain", async () => {
    const f = fixture(); vi.mocked(f.root.shutdown).mockRejectedValueOnce(new Error("SECRET source drain"));
    await expect(runOrdinaryPolicyOperator(["accept-root"])).rejects.toMatchObject({ code: "ORDINARY_POLICY_OPERATOR_RECOVERY_REQUIRED", exitCode: 75 });
    expect(f.accept).toHaveBeenCalledOnce(); expect(f.pool.end).not.toHaveBeenCalled();
  });
  it("does not report success when pool teardown fails", async () => {
    const f = fixture(); f.poolEnd.mockRejectedValueOnce(new Error("SECRET pool/DSN"));
    await expect(runOrdinaryPolicyOperator(["accept-root"])).rejects.toMatchObject({ code: "ORDINARY_POLICY_OPERATOR_FAILED" });
    expect(f.root.shutdown).toHaveBeenCalledOnce();
  });
  it("exposes fixed safe categories only, including SAME-original recovery75", () => {
    const secret = "TOKEN=private; /root/secret https://user:password@host SQL";
    for (const error of [new Error(secret), Object.assign(new Error(secret), { code: secret }), { message: secret, code: "RECEIPT_NOT_QUALIFIED" }]) {
      const failure = ordinaryPolicyOperatorFailure(error);
      expect(failure).toMatchObject({ code: "ORDINARY_POLICY_OPERATOR_FAILED", exitCode: 1 });
      expect(JSON.stringify({ code: failure.code, message: failure.message })).not.toContain(secret);
    }
    const failure = ordinaryPolicyOperatorFailure(Object.assign(new Error(secret), { code: "NATIVE_ROOT_RECOVERY_REQUIRED" }));
    expect(failure).toMatchObject({ code: "ORDINARY_POLICY_OPERATOR_RECOVERY_REQUIRED", exitCode: 75 });
    expect(ordinaryPolicyOperatorFailure(new OrdinaryPolicyOperatorError("ORDINARY_POLICY_OPERATOR_USAGE", 2)).exitCode).toBe(2);
  });
});
