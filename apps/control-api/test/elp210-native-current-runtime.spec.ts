/** TEST_ONLY private files, generated keys/certificates and composition
 * boundaries. No PG, network, listener, installed source or grant is created;
 * application/schema doubles below are NOT commissioning evidence. */
import "reflect-metadata";
import { createHash, generateKeyPairSync } from "node:crypto";
import { chmod, mkdtemp, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FactoryProvider } from "@nestjs/common";
import type { Pool } from "pg";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { AppModule, type ControlApiDependencies } from "../src/app.module";
import type { AuthService } from "../src/auth/auth.service";
import type { ControlApiConfig } from "../src/config";
import { nativeResearchReadAllowed } from "../src/execution/native-review-profile";
import { unqualifiedAccessTrust } from "../src/execution-v2/access-trust";
import { ExecutionAccessService } from "../src/execution-v2/access.service";
import * as schema from "../src/execution-v2/current-human-schema";
import type { CurrentHumanCandidate } from "../src/execution-v2/current-human-candidate";
import { CurrentHumanMutations } from "../src/execution-v2/current-human-mutations";
import { selectPrivateCorePoolProfile } from "../src/execution-v2/financial-source-bootstrap";
import * as nativeRuntime from "../src/execution-v2/native-core-runtime";
import { nativeCurrentRelationsCanonical } from "../src/execution-v2/native-current-relations-codec";
import { NativeCurrentRelationsProvider } from "../src/execution-v2/native-current-relations-provider";
import { NativeCurrentAccountScopes, NativeCurrentRuntimeError, nativeCurrentRuntimeReference,
  prepareNativeCurrentRuntime, prepareNativeCurrentApplication, type NativeCurrentRuntimeReference } from "../src/execution-v2/native-current-runtime";
import { commonName, testCertificate, type TestAuthority } from "./fixtures/elp210-test-certificates";

const hash = (input: string | Buffer) => createHash("sha256").update(input).digest("hex");
const workspace = "TEST_ONLY-research-workspace", user = "TEST_ONLY-research-owner", workload = "TEST_ONLY-native-current";
const roots = new Set<string>();
let ca: Buffer, key: Buffer, cert: Buffer, terminal: Buffer;
beforeAll(() => {
  const pair = generateKeyPairSync("ec", { namedCurve: "prime256v1" }), name = commonName("TEST_ONLY-current-ca");
  const authority: TestAuthority = { key: pair.privateKey, name, certificate: testCertificate(name, pair, { name, key: pair.privateKey }, true) };
  ca = authority.certificate;
  const leaf = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  key = Buffer.from(leaf.privateKey.export({ type: "pkcs8", format: "pem" }));
  cert = testCertificate(commonName("TEST_ONLY-current-client"), leaf, authority, false, "core.research.test");
  terminal = Buffer.from(generateKeyPairSync("ed25519").privateKey.export({ type: "pkcs8", format: "pem" }));
});
afterEach(async () => {
  vi.restoreAllMocks();
  for (const root of roots) await rm(root, { recursive: true, force: true });
  roots.clear();
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "TEST_ONLY-native-current-runtime-")); roots.add(root); await chmod(root, 0o700);
  let count = 0;
  const leaf = async (bytes: string | Buffer): Promise<NativeCurrentRuntimeReference> => {
    const path = join(root, `private-${count++}`); await writeFile(path, bytes, { mode: 0o600, flag: "wx" });
    await chmod(path, 0o600); return { path, sha256: hash(bytes) };
  };
  const value = { schema_version: "portal.execution.native-current-runtime.v1", target: { kind: "RESEARCH", environment: "paper" },
    schema_target: { database_name: "TEST_ONLY-control", database_system_identifier: "123456", role_name: "TEST_ONLY-role",
      protected_owner_user_id: user, workspace_id: workspace, principal_workspace_pins: [{ user_id: user, workspace_id: workspace }] },
    pool_profile: { max: 3, connectionTimeoutMillis: 5000, statement_timeout: 4000, query_timeout: 5000, idle_in_transaction_session_timeout: 5000 },
    provider: { bindings: [{ actor_id: user, principal_id: user,
      source: { human_issuer: "TEST_ONLY-core", subject: "TEST_ONLY-independent-native-human", workspace_id: workspace, environment: "paper", workload_id: workload },
      registration: { correspondence_id: "TEST_ONLY-correspondence", expected_version: "9007199254741001", manifest_sha256: "a".repeat(64) },
      original: { grant_id: "TEST_ONLY-grant", accepted_fact_digest: `sha256:${"b".repeat(64)}` },
      correspondence: { registry_revision: `sha256:${"c".repeat(64)}`, payload_sha256: "d".repeat(64), approval_ref: "TEST_ONLY-not-owner-approval" },
      allowed_actions: ["access.read", "account.read"] }], maximum_retained: 128, maximum_unresolved: 4, maximum_recoveries: 4, maximum_principals: 1, attempt_ms: 30000 },
    terminal: { issuer: "TEST_ONLY-core-terminal", audience: "TEST_ONLY-pm-terminal", key_id: "TEST_ONLY-terminal", ttl_seconds: 30, private_key_ref: await leaf(terminal) },
    transport: { origin: "https://10.70.0.2:29455", workload_id: workload, edge_leaf_sha256: `sha256:${"f".repeat(64)}`,
      tls: { key_ref: await leaf(key), cert_ref: await leaf(cert), ca_ref: await leaf(ca) }, deadline_ms: 5000, request_bytes: 32768, response_bytes: 65536, max_inflight: 2 },
    egress: { maximum_response_bytes: 1048576, maximum_inflight: 2, send_timeout_ms: 5000, quiesce_timeout_ms: 50 }, shutdown_deadline_ms: 5000 };
  return { root, value, leaf, manifest: (input: unknown = value) => leaf(nativeCurrentRelationsCanonical(input)) };
}
async function refused(pin: NativeCurrentRuntimeReference) {
  const error = await prepareNativeCurrentRuntime(pin).catch(error => error);
  expect(error).toBeInstanceOf(NativeCurrentRuntimeError);
  expect(error).toMatchObject({ code: "NATIVE_CURRENT_RUNTIME_CONFIG_INVALID", message: "The private current read composition is not available." });
  expect(error.message).not.toContain(pin.path); expect(error.message).not.toContain("PRIVATE KEY");
}

describe("private native CURRENT Research loader", () => {
  it("is OFF with no refs and refuses every partial/noncanonical env selection before I/O", () => {
    const read = vi.spyOn(nativeRuntime, "readNativeRuntimeReference");
    expect(nativeCurrentRuntimeReference({})).toBeUndefined(); expect(read).not.toHaveBeenCalled();
    const path = "/TEST_ONLY/current.json", sha = "a".repeat(64);
    expect(nativeCurrentRuntimeReference({ CONTROL_API_NATIVE_CURRENT_CONFIG_FILE: path, CONTROL_API_NATIVE_CURRENT_CONFIG_SHA256: sha })).toEqual({ path, sha256: sha });
    for (const env of [{ CONTROL_API_NATIVE_CURRENT_CONFIG_FILE: path }, { CONTROL_API_NATIVE_CURRENT_CONFIG_SHA256: sha },
      { CONTROL_API_NATIVE_CURRENT_CONFIG_FILE: "", CONTROL_API_NATIVE_CURRENT_CONFIG_SHA256: sha },
      { CONTROL_API_NATIVE_CURRENT_CONFIG_FILE: "relative.json", CONTROL_API_NATIVE_CURRENT_CONFIG_SHA256: sha },
      { CONTROL_API_NATIVE_CURRENT_CONFIG_FILE: "/private/../current.json", CONTROL_API_NATIVE_CURRENT_CONFIG_SHA256: sha },
      { CONTROL_API_NATIVE_CURRENT_CONFIG_FILE: path, CONTROL_API_NATIVE_CURRENT_CONFIG_SHA256: sha + "\n" },
      { CONTROL_API_NATIVE_CURRENT_CONFIG_FILE: path, CONTROL_API_NATIVE_CURRENT_CONFIG_SHA256: sha.toUpperCase() }])
      expect(() => nativeCurrentRuntimeReference(env)).toThrow(NativeCurrentRuntimeError);
    expect(read).not.toHaveBeenCalled();
  });
  it("hydrates genuine keys/TLS and exact typed pins without source/DB/listener or identity creation", async () => {
    const f = await fixture(), prepared = await prepareNativeCurrentRuntime(await f.manifest());
    expect(prepared.schemaTarget).toEqual(f.value.schema_target); expect(prepared.poolProfile).toEqual(f.value.pool_profile);
    expect(prepared.provider.bindings).toEqual(f.value.provider.bindings); expect(prepared.egress).toEqual(f.value.egress);
    expect(prepared.provider.terminal.private_key).toMatchObject({ type: "private", asymmetricKeyType: "ed25519" });
    expect(prepared.transport.tls).toEqual({ key, cert, ca }); expect(prepared.provider.terminal).not.toHaveProperty("private_key_ref");
    expect(prepared).not.toHaveProperty("session"); expect(prepared).not.toHaveProperty("original_context");
    expect(Object.isFrozen(prepared.poolProfile)).toBe(true); expect(Object.isFrozen(prepared.schemaTarget)).toBe(true);
  });
  it("wipes every private input but preserves separate successful TLS copies", async () => {
    const f = await fixture(), read = nativeRuntime.readNativeRuntimeReference, inputs: Buffer[] = [];
    vi.spyOn(nativeRuntime, "readNativeRuntimeReference").mockImplementation(async (...args) => { const bytes = await read(...args); inputs.push(bytes); return bytes; });
    const prepared = await prepareNativeCurrentRuntime(await f.manifest());
    expect(inputs).toHaveLength(5); expect(inputs.every(bytes => bytes.every(byte => byte === 0))).toBe(true);
    expect(prepared.transport.tls.key).toEqual(key); expect(prepared.transport.tls.key).not.toBe(inputs[1]);
    inputs.length = 0; f.value.terminal.private_key_ref = await f.leaf("TEST_ONLY-malformed-private-key");
    await refused(await f.manifest()); expect(inputs.every(bytes => bytes.every(byte => byte === 0))).toBe(true);
  });
  it("pins manifest and every referenced file by SHA, owner, exact mode and nofollow", async () => {
    const f = await fixture(), ref = await f.manifest(); await refused({ ...ref, sha256: "0".repeat(64) });
    await chmod(ref.path, 0o640); await refused(ref); await chmod(ref.path, 0o600);
    const alias = join(f.root, "alias"); await symlink(ref.path, alias); await refused({ ...ref, path: alias });
    await refused({ ...ref, path: f.root }); await refused(await f.leaf(" ".repeat(65537)));
    await writeFile(f.value.transport.tls.ca_ref.path, "TEST_ONLY-replaced-ca"); await refused(ref);
    const uid = process.geteuid!(); vi.spyOn(process, "geteuid").mockReturnValue(uid + 1); await refused(ref);
  });
  it("accepts exact 0400 without chmod or ownership changes", async () => {
    const f = await fixture(), pin = await f.manifest(); await chmod(pin.path, 0o400);
    await prepareNativeCurrentRuntime(pin); expect((await stat(pin.path)).mode & 0o7777).toBe(0o400);
  });
  it("refuses malformed/duplicate/noncanonical/unknown input even when its outer hash matches", async () => {
    const f = await fixture(), raw = nativeCurrentRelationsCanonical(f.value);
    for (const bytes of [Buffer.from([0xff]), `${raw}\n`, JSON.stringify(f.value), JSON.stringify(f.value, null, 2),
      raw.replace('"schema_version":', '"schema_version":"wrong","schema_version":'),
      nativeCurrentRelationsCanonical({ ...f.value, extra: true }),
      nativeCurrentRelationsCanonical({ ...f.value, terminal: { ...f.value.terminal, private_key: "TEST_ONLY-inline-key" } })])
      await refused(await f.leaf(bytes));
  });
  it("requires exact sole Research/Paper owner, workspace and independently named native principal", async () => {
    const f = await fixture();
    for (const change of [(v: typeof f.value) => { v.target.kind = "STABLE"; }, (v: typeof f.value) => { v.target.environment = "live"; },
      (v: typeof f.value) => { v.provider.bindings[0].actor_id = "TEST_ONLY-other"; },
      (v: typeof f.value) => { v.provider.bindings[0].principal_id = "TEST_ONLY-other"; },
      (v: typeof f.value) => { v.provider.bindings[0].source.workspace_id = "TEST_ONLY-other"; },
      (v: typeof f.value) => { v.provider.bindings[0].source.environment = "live"; },
      (v: typeof f.value) => { v.provider.bindings[0].source.workload_id = "TEST_ONLY-other"; },
      (v: typeof f.value) => { v.schema_target.protected_owner_user_id = "TEST_ONLY-other"; },
      (v: typeof f.value) => { v.schema_target.principal_workspace_pins[0].workspace_id = "TEST_ONLY-other"; },
      (v: typeof f.value) => { v.schema_target.principal_workspace_pins.push({ user_id: "TEST_ONLY-other", workspace_id: workspace }); }]) {
      const value = structuredClone(f.value); change(value); await refused(await f.manifest(value));
    }
  });
  it("requires an exact private HTTPS origin, never credentials, public host, path or query", async () => {
    const f = await fixture();
    for (const origin of ["http://10.70.0.2", "https://8.8.8.8", "https://example.com", "https://user@10.70.0.2", "https://10.70.0.2/path", "https://10.70.0.2/?q=1", "https://10.70.0.2/#x"])
      await refused(await f.manifest({ ...f.value, transport: { ...f.value.transport, origin } }));
  });
  it("enforces explicit bounded pool/transport/egress/provider limits and opaque revision grammar", async () => {
    const f = await fixture();
    for (const change of [(v: typeof f.value) => { v.pool_profile.max = 11; },
      (v: typeof f.value) => { v.pool_profile.query_timeout = v.pool_profile.statement_timeout; },
      (v: typeof f.value) => { v.transport.deadline_ms = 5001; }, (v: typeof f.value) => { v.transport.max_inflight = 17; },
      (v: typeof f.value) => { v.transport.request_bytes = 32769; }, (v: typeof f.value) => { v.transport.response_bytes = 65537; },
      (v: typeof f.value) => { v.egress.maximum_response_bytes = 1048577; }, (v: typeof f.value) => { v.egress.send_timeout_ms = 30001; },
      (v: typeof f.value) => { v.provider.maximum_unresolved = 129; }, (v: typeof f.value) => { v.provider.maximum_principals = 5; },
      (v: typeof f.value) => { v.provider.bindings[0].registration.expected_version = "01"; },
      (v: typeof f.value) => { v.shutdown_deadline_ms = 10001; }]) {
      const value = structuredClone(f.value); change(value); await refused(await f.manifest(value));
    }
  });
  it("rejects non-Ed25519 terminal key, TLS key mismatch, non-CA roots, unrelated CA and malformed PEM", async () => {
    const f = await fixture(), original = structuredClone(f.value.transport.tls);
    f.value.terminal.private_key_ref = await f.leaf(key); await refused(await f.manifest());
    f.value.terminal.private_key_ref = await f.leaf(terminal);
    for (const tls of [{ ...original, key_ref: await f.leaf(terminal) }, { ...original, ca_ref: await f.leaf(cert) },
      { ...original, cert_ref: await f.leaf(ca) }, { ...original, ca_ref: await f.leaf("TEST_ONLY-malformed-CA") }]) {
      f.value.transport.tls = tls; await refused(await f.manifest());
    }
    const pair = generateKeyPairSync("ec", { namedCurve: "prime256v1" }), name = commonName("TEST_ONLY-foreign-ca");
    f.value.transport.tls = { ...original, ca_ref: await f.leaf(testCertificate(name, pair, { name, key: pair.privateKey }, true)) };
    await refused(await f.manifest());
  });
  it("refuses expired or not-yet-valid local TLS material without a synthetic refresh", async () => {
    const f = await fixture(), pin = await f.manifest(), now = Date.now();
    const time = vi.spyOn(Date, "now").mockReturnValue(now + 2 * 86400000); await refused(pin);
    time.mockReturnValue(now - 2 * 86400000); await refused(pin);
  });
});

describe("native CURRENT actual private bootstrap/AppModule factory (explicit synthetic schema/owner)", () => {
  async function application() {
    const f = await fixture(), runtime = await prepareNativeCurrentRuntime(await f.manifest());
    const query = vi.fn(async () => ({ rows: [{ custody: "portal_native_current_read_obligations" }] }));
    const pool = { query, connect: vi.fn(), end: vi.fn() } as unknown as Pool;
    const assertion = vi.spyOn(schema, "assertRegisteredResearchCurrentHumanSchema").mockResolvedValue({
      schema_version: "TEST_ONLY", schema_sha256: "TEST_ONLY", catalogue_sha256: "TEST_ONLY", installed: false });
    return { f, runtime, pool, query, assertion };
  }
  const config = { NODE_ENV: "test", EXECUTION_READ_PROFILE: "native_manager_review_v1", EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID: workspace } as ControlApiConfig;
  function dependencies(pool: Pool, prepared: Awaited<ReturnType<typeof prepareNativeCurrentApplication>>): ControlApiDependencies {
    const candidate = { usesPool: (value: unknown) => value === pool } as CurrentHumanCandidate;
    return { nativeCurrent: prepared, nativeManagerRead: {} as NonNullable<ControlApiDependencies["nativeManagerRead"]>,
      executionAccessTrust: unqualifiedAccessTrust,
      nativeManagerRealtimeLimits: { maximumClients: 2, maximumEntriesPerClient: 4, maximumFrameBytes: 32768, maximumClientBytes: 65536,
        maximumTotalBytes: 131072, maximumNoticesPerRead: 8, readTimeoutMs: 1000 },
      currentHumanMutations: new CurrentHumanMutations(pool, candidate, { recover: vi.fn() },
        { maximum_intents: 16, maximum_recoveries_per_request: 2 }, undefined, [], prepared.provider) };
  }
  it("asserts exact pool/schema/custody before constructing inert provider, without issuing human/source/DB work", async () => {
    const f = await application(), prepared = await prepareNativeCurrentApplication(f.pool, f.runtime);
    expect(f.assertion).toHaveBeenCalledExactlyOnceWith(f.pool, f.runtime.schemaTarget);
    expect(f.query).toHaveBeenCalledExactlyOnceWith("SELECT to_regclass('public.portal_native_current_read_obligations') AS custody");
    expect(prepared.provider).toBeInstanceOf(NativeCurrentRelationsProvider); expect(prepared.provider.usesPool(f.pool)).toBe(true);
    expect(f.pool.connect).not.toHaveBeenCalled(); expect(f.pool.end).not.toHaveBeenCalled();
    expect(Object.values(f.runtime.transport.tls).every(bytes => Buffer.isBuffer(bytes) && bytes.every(byte => byte === 0))).toBe(true);
  });
  it("fails before source construction on schema mismatch/missing custody and erases TLS inputs", async () => {
    const f = await application(), failure = Error("TEST_ONLY-schema-refusal"); f.assertion.mockRejectedValueOnce(failure);
    await expect(prepareNativeCurrentApplication(f.pool, f.runtime)).rejects.toBe(failure); expect(f.query).not.toHaveBeenCalled();
    expect(Object.values(f.runtime.transport.tls).every(bytes => Buffer.isBuffer(bytes) && bytes.every(byte => byte === 0))).toBe(true);
    const missing = await application(); missing.query.mockResolvedValueOnce({ rows: [{ custody: null as unknown as string }] });
    await expect(prepareNativeCurrentApplication(missing.pool, missing.runtime)).rejects.toBeInstanceOf(NativeCurrentRuntimeError);
    expect(missing.pool.connect).not.toHaveBeenCalled();
  });
  it("requires shared native ownership and exact pool profile before any resources", async () => {
    const f = await application(); expect(() => selectPrivateCorePoolProfile(undefined, undefined, undefined, f.runtime))
      .toThrow("PRIVATE_RUNTIME_SHARED_NATIVE_COMPOSITION_REQUIRED");
    const native = { poolProfile: f.runtime.poolProfile };
    expect(selectPrivateCorePoolProfile(native, undefined, undefined, f.runtime)).toBe(native.poolProfile);
    expect(() => selectPrivateCorePoolProfile({ poolProfile: { ...native.poolProfile, max: 4 } }, undefined, undefined, f.runtime))
      .toThrow("PRIVATE_RUNTIME_CORE_POOL_PROFILE_MISMATCH");
    expect(f.query).not.toHaveBeenCalled(); expect(f.pool.connect).not.toHaveBeenCalled();
  });
  it("registers only the same private account scopes/provider/coordinator and propagates drain failure, never closes shared pool", async () => {
    const f = await application(), prepared = await prepareNativeCurrentApplication(f.pool, f.runtime);
    const createScopes = vi.fn(prepared.createScopes), deps = dependencies(f.pool, { ...prepared, createScopes });
    const module = AppModule.register(config, f.pool, undefined, deps);
    const provider = module.providers?.find((value): value is FactoryProvider => typeof value === "object" && value !== null &&
      "provide" in value && value.provide === NativeCurrentAccountScopes && "useFactory" in value);
    expect(provider).toBeDefined();
    const compose = vi.spyOn(prepared.provider, "compose");
    const shutdown = vi.spyOn(prepared.provider, "shutdown").mockResolvedValue(undefined);
    const auth = {} as AuthService;
    const selected = provider!.useFactory(auth) as NativeCurrentAccountScopes & { beforeApplicationShutdown(): Promise<void> };
    expect(selected).toBeInstanceOf(NativeCurrentAccountScopes); expect(selected.scopes.hasNativeCurrentRelations()).toBe(true);
    expect(createScopes).toHaveBeenCalledExactlyOnceWith(auth, unqualifiedAccessTrust, config);
    expect(compose).toHaveBeenCalledExactlyOnceWith(unqualifiedAccessTrust);
    const ordinary = module.providers?.find((value): value is FactoryProvider => typeof value === "object" && value !== null &&
      "provide" in value && value.provide === ExecutionAccessService && "useFactory" in value);
    expect((ordinary!.useFactory(f.pool, auth) as ExecutionAccessService).hasNativeCurrentRelations()).toBe(false);
    expect(deps.currentHumanMutations!.hasCurrentReadRecoveryParticipant(prepared.provider)).toBe(true);
    await selected.beforeApplicationShutdown(); expect(shutdown).toHaveBeenCalledExactlyOnceWith(f.runtime.shutdownDeadlineMs);
    const failure = Error("TEST_ONLY-unresolved-custody"); shutdown.mockRejectedValueOnce(failure);
    await expect(selected.beforeApplicationShutdown()).rejects.toBe(failure); expect(f.pool.end).not.toHaveBeenCalled();
  });
  it("rejects wrong target/pool/coordinator registration and leaves absent mode inert", async () => {
    const f = await application(), prepared = await prepareNativeCurrentApplication(f.pool, f.runtime), deps = dependencies(f.pool, prepared);
    const absent = AppModule.register({ NODE_ENV: "test" } as ControlApiConfig, f.pool);
    expect(absent.providers?.some(value => typeof value === "object" && value !== null && "provide" in value && value.provide === NativeCurrentAccountScopes)).toBe(false);
    expect(() => AppModule.register({ NODE_ENV: "test" } as ControlApiConfig, f.pool, undefined, deps)).toThrow("NATIVE_CURRENT_SHARED_RESEARCH_COMPOSITION_REQUIRED");
    expect(() => AppModule.register(config, {} as Pool, undefined, deps)).toThrow("CURRENT_HUMAN_MUTATION_CORE_POOL_REQUIRED");
    const wrong = { ...prepared, provider: { ...prepared.provider, usesPool: () => true } as NativeCurrentRelationsProvider };
    expect(() => AppModule.register(config, f.pool, undefined, { ...deps, nativeCurrent: wrong })).toThrow("NATIVE_CURRENT_SHARED_RESEARCH_COMPOSITION_REQUIRED");
    expect(f.pool.connect).not.toHaveBeenCalled(); expect(f.pool.end).not.toHaveBeenCalled();
  });
  it("does not widen public route ceiling without actual private Account scopes; no ALL, mutation, history or wildcard", () => {
    const route = "/api/v1/execution/manager/accounts/account-test/overview", scope = { EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID: workspace };
    expect(nativeResearchReadAllowed(scope, "GET", route, { environment: "paper" })).toBe(false);
    expect(nativeResearchReadAllowed(scope, "GET", route, { environment: "paper" }, true)).toBe(true);
    for (const [method, path, query] of [["POST", route, { environment: "paper" }], ["GET", route, { environment: "ALL" }],
      ["GET", route, { environment: "paper", workspace_id: "TEST_ONLY-other" }],
      ["GET", "/api/v1/execution/manager/fleet", { environment: "paper" }], ["GET", route + "/history", { environment: "paper" }]] as const)
      expect(nativeResearchReadAllowed(scope, method, path, query, true)).toBe(false);
  });
});
