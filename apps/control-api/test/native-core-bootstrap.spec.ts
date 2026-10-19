/** TEST_ONLY bootstrap checks; actual execution receipts belong to C7.
 * Real OS leaves + real jose/selected source/composition + actual Nest factory DI.
 * Pool/operations are explicit test doubles: no DB, upstream, TLS handshake,
 * policy installation, full AppModule init, or physical read authority proof.
 * Uses the actual private loader/finite composition and compose helper.
 */
import "reflect-metadata";
import { createHash } from "node:crypto";
import { mkdtemp, writeFile, chmod, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateKeyPair, exportPKCS8 } from "jose";
import { NestFactory } from "@nestjs/core";
import type { FactoryProvider } from "@nestjs/common";
import type { Pool } from "pg";
import type { FastifyReply } from "fastify";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { AppModule, type ControlApiDependencies } from "../src/app.module";
import type { ControlApiConfig } from "../src/config";
import { nativeCoreRuntimeReference, prepareNativeCoreRuntime,
  NativeCoreRuntimeError } from "../src/execution-v2/native-core-runtime";
import { composeOwnedNativeCoreRuntime } from "../src/execution-v2/native-core-bootstrap";
import { NativeManagerReadConsumer } from "../src/execution-v2/native-manager-consumer";
import { MaximumDataOperationService } from "../src/execution/maximum-data-operation.service";
import { ExecutionReadScopes } from "../src/execution-v2/read-scope";
import { ExecutionProfileProjectionRepository } from "../src/execution/profile-projection.repository";
import { CONTROL_API_CONFIG } from "../src/tokens";
import { MaximumDataOperationController } from "../src/execution/maximum-data-operation.controller";
import type { WorkspacesRepository } from "../src/repos/workspaces";
import { MAXIMUM_DATA_DEPLOYMENT_OPERATION } from "../src/execution/maximum-data-operation.registry";

const raw = (s: string) => s.repeat(64);
const digest = (s: string) => createHash("sha256").update(s).digest("hex");
const roots = new Set<string>();
let edPem: string, ecPem: string;
beforeAll(async () => {
  edPem = await exportPKCS8((await generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true })).privateKey);
  ecPem = await exportPKCS8((await generateKeyPair("ES256", { extractable: true })).privateKey);
});
afterEach(async () => {
  vi.restoreAllMocks();
  for (const root of roots) await rm(root, { recursive: true, force: true });
  roots.clear();
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "TEST_ONLY-core-boot-"));
  roots.add(root); await chmod(root, 0o700);
  async function leaf(name: string, bytes: string) {
    const path = join(root, name);
    await writeFile(path, bytes, { mode: 0o600, flag: "wx" });
    await chmod(path, 0o600);
    return { path, sha256: digest(bytes) };
  }
  const human = await leaf("human.key", edPem), terminal = await leaf("terminal.key", edPem);
  // Opaque TEST_ONLY TLS constructor bytes: no TLS/PM qualification is claimed.
  const ca = await leaf("ca.crt", "TEST_ONLY-NO-SOCKET-CA"),
    cert = await leaf("client.crt", "TEST_ONLY-NO-SOCKET-CERT"),
    tlsKey = await leaf("client.key", "TEST_ONLY-NO-SOCKET-KEY");
  const now = Date.now(), until = now + 120_000;
  const actor = "TEST_ONLY-stan", workspace = "TEST_ONLY-workspace", issuer = "TEST_ONLY-human", workload = "TEST_ONLY-pm";
  const target = { database_name: "TEST_ONLY-core", role_name: "TEST_ONLY-runtime", database_system_identifier: "7675333655652302882",
    protected_owner_user_id: "TEST_ONLY-owner", workspace_id: workspace, principal_workspace_pins: [{ user_id: actor, workspace_id: workspace }] };
  const domain = { profile_id: "PAPER_BINANCE_USDM", catalogue_sha256: MAXIMUM_DATA_DEPLOYMENT_OPERATION.sourceCatalogueSha256.slice(7),
    profile_sha256: raw("b"), field_policy_sha256: raw("c") };
  const value = { schema_version: "portal.native-core-runtime.v1", pool_profile: { max: 2, connectionTimeoutMillis: 1000,
    statement_timeout: 2000, query_timeout: 3000, idle_in_transaction_session_timeout: 2000 },
    composition: { expected_workload_id: workload, retained_recovery: [],
      selections: [{ selector: { portal_user_id: actor, human_issuer: issuer, subject: actor, workspace_id: workspace, environment: "paper", domain },
        config: { issuer, audience: "TEST_ONLY-pm-human", key_id: "TEST_ONLY-human-key", private_key_ref: human,
          limits: { ttl_ms: 10000, maximum_unresolved: 4, maximum_retained: 32 },
          installation_scope: { workspace_id: workspace, environment: "paper", valid_until_ms: until },
          terminal: { issuer: "TEST_ONLY-terminal", audience: "TEST_ONLY-pm-terminal", key_id: "TEST_ONLY-terminal-key", private_key_ref: terminal, ttl_seconds: 30 },
          egress: { maximum_response_bytes: 1048576, maximum_inflight: 2, send_timeout_ms: 1000, quiesce_timeout_ms: 1000 },
          selected_source: { transport: { origin: "https://10.70.0.2:28445", tls: { ca_ref: ca, cert_ref: cert, key_ref: tlsKey },
            pm_leaf_sha256: "sha256:" + raw("f"), workload_id: workload, deadline_ms: 1000, request_bytes: 32768, response_bytes: 32768, max_inflight: 2 },
            installation_expires_at_utc_ms: until, pins: { binding: { human_issuer: issuer, subject: actor, workspace_id: workspace, environment: "paper", workload_id: workload },
              domain, human: { issuer, subject: actor, portal_user_id: actor, ts_user_id: "33333333-3333-3333-3333-333333333333",
                mapping_revision: "ts-user:33333333-3333-3333-3333-333333333333:1" },
              native: { revision: "1", receipt_id: "44444444-4444-4444-4444-444444444444", receipt_digest: "sha256:" + raw("1"),
                document_digest: "sha256:" + raw("2"), policy_revision: "1", owner_mapping_revision: "ts-user:33333333-3333-3333-3333-333333333333:1",
                semantic_revision: "sha256:" + raw("3"), effective_from: new Date(now - 1000).toISOString(), expires_at: new Date(until).toISOString() }, source_fingerprint: raw("e") } } } }],
      owner_intakes: [{ artifact_path: join(root, "TEST_ONLY-OFFLINE-NEVER-CREATED-owner.json"), approved_sha256: raw("8"), target,
        intake_not_before_ms: now - 1000, intake_not_after_ms: until }], mutation_limits: { maximum_intents: 64, maximum_recoveries_per_request: 8 } } };
  async function manifest(bytes = JSON.stringify(value)) { return leaf("runtime.json", bytes); }
  return { root, value, actor, workspace, target, human, manifest, leaf };
}
function poolFixture(target: { database_name: string; role_name: string; database_system_identifier: string }) {
  const query = vi.fn(async () => ({ rowCount: 1, rows: [{ ...target, session_role_name: target.role_name }] }));
  const end = vi.fn(async () => undefined), connect = vi.fn(async () => { throw Error("TEST_ONLY-unexpected-connect"); });
  const pool = { options: { connectionTimeoutMillis: 1000, query_timeout: 3000 }, query, end, connect } as unknown as Pool;
  return { pool, query, end, connect };
}
const safe = { code: "CURRENT_HUMAN_NATIVE_RUNTIME_CONFIG_INVALID", message: "The private native Core configuration is not available." };
function consumerProvider(pool: Pool, deps: ControlApiDependencies): FactoryProvider {
  const registration = AppModule.register({ NODE_ENV: "test" } as ControlApiConfig, pool, undefined, deps);
  const provider = registration.providers?.find((p): p is FactoryProvider =>
    !!p && typeof p === "object" && "provide" in p && p.provide === NativeManagerReadConsumer && "useFactory" in p);
  if (!provider) throw Error("TEST_ONLY-missing-native-provider");
  return provider;
}
function instantiate(provider: FactoryProvider, operations: MaximumDataOperationService) {
  // This narrow genuine-factory harness covers only the no-RT branch. Nest
  // must still resolve all declared factory tokens; none supplies authority.
  const forbidden = () => { throw Error("TEST_ONLY-no-RT-dependency-used"); };
  const scopes = { authorizeManagerNativeStream: vi.fn(forbidden) };
  const repository = { snapshotMetadata: vi.fn(forbidden) };
  class TestOnlyFactoryModule {}
  return NestFactory.createApplicationContext({ module: TestOnlyFactoryModule,
    providers: [{ provide: MaximumDataOperationService, useValue: operations },
      { provide: ExecutionReadScopes, useValue: scopes },
      { provide: ExecutionProfileProjectionRepository, useValue: repository },
      { provide: CONTROL_API_CONFIG, useValue: {} as ControlApiConfig }, provider],
    exports: [NativeManagerReadConsumer] },
  { logger: false, abortOnError: false });
}

describe("TEST_ONLY private bootstrap real leaf / real signing-key checks", () => {
  it("leaves absent selection inert; refuses partial selection instead of fallback", () => {
    expect(nativeCoreRuntimeReference({})).toBeUndefined();
    expect(() => nativeCoreRuntimeReference({ CONTROL_API_NATIVE_CORE_CONFIG_FILE: "/TEST_ONLY/not-read" })).toThrow(safe.message);
  });
  it("rejects an actual symlink leaf, unsafe mode and hash mismatch with fixed public copy", async () => {
    for (const axis of ["symlink", "mode", "hash"] as const) {
      const f = await fixture(), pin = await f.manifest();
      let selected = pin;
      if (axis === "symlink") { const path = join(f.root, "runtime-link.json"); await symlink(pin.path, path); selected = { ...pin, path }; }
      if (axis === "mode") await chmod(pin.path, 0o640);
      if (axis === "hash") selected = { ...pin, sha256: raw("0") };
      const error = await prepareNativeCoreRuntime(selected).catch(e => e);
      expect(error).toMatchObject(safe); expect(error.message).not.toContain(f.root);
    }
  });
  it("fails closed on actual noncanonical bytes and real non-Ed25519 signing material", async () => {
    for (const axis of ["noncanonical", "wrong-curve", "broken-pem"] as const) {
      const f = await fixture();
      if (axis !== "noncanonical") f.value.composition.selections[0]!.config.private_key_ref =
        await f.leaf("TEST_ONLY-invalid-human.key", axis === "wrong-curve" ? ecPem : "TEST_ONLY-private-error-marker");
      const pin = await f.manifest(axis === "noncanonical" ? JSON.stringify(f.value, null, 2) : JSON.stringify(f.value));
      const error = await prepareNativeCoreRuntime(pin).catch(e => e);
      expect(error).toMatchObject(safe); expect(error.message).not.toContain(f.root);
      expect(error.message).not.toContain("private-error-marker");
    }
  });
  it("uses real leaves/keys and the SAME pool for genuine composition, without installing policies", async () => {
    const f = await fixture(), db = poolFixture(f.target), prepared = await prepareNativeCoreRuntime(await f.manifest());
    const deps = await composeOwnedNativeCoreRuntime(prepared, db.pool);
    expect(deps.nativeManagerRead).toBeDefined(); expect(deps.currentHumanMutations?.usesPool(db.pool)).toBe(true);
    expect(db.query).toHaveBeenCalledExactlyOnceWith(expect.stringContaining("pg_control_system()"));
    expect(db.connect).not.toHaveBeenCalled(); expect(db.end).not.toHaveBeenCalled();
    // No owner file exists. Success therefore cannot have read/installed it.
    expect(deps.nativeManagerRealtimeLimits).toBeUndefined();
  });
});

describe("TEST_ONLY compose failure disposal, no app or active native custody", () => {
  it("awaits SAME owned pool disposal before rethrowing the exact sanitized error", async () => {
    const f = await fixture(), db = poolFixture(f.target), prepared = await prepareNativeCoreRuntime(await f.manifest());
    db.query.mockRejectedValueOnce(Error("TEST_ONLY-raw-private-query-error"));
    let original: unknown;
    const compose = async (pool: Pool) => { try { return await prepared.compose(pool); } catch (e) { original = e; throw e; } };
    let release: (() => void) | undefined, entered!: () => void;
    const cleanupEntered = new Promise<void>(resolve => { entered = resolve; });
    db.end.mockImplementationOnce(() => { entered(); return new Promise<void>(resolve => { release = resolve; }); });
    let settled = false;
    const result = composeOwnedNativeCoreRuntime({ compose }, db.pool).catch(e => { settled = true; return e; });
    // No wall-clock sleep/poll or finite microtask guess. Observe actual cleanup.
    try { await cleanupEntered; expect(db.end).toHaveBeenCalledOnce(); expect(settled).toBe(false); }
    finally { release?.(); }
    const error = await result;
    expect(error).toBe(original); expect(error).toMatchObject(safe);
    expect(error.message).not.toContain("raw-private-query-error"); expect(db.query).toHaveBeenCalledOnce();
  });
  it("never replaces the original safe error when pool disposal itself rejects; never retries", async () => {
    const f = await fixture(), db = poolFixture(f.target), error = new NativeCoreRuntimeError();
    db.end.mockRejectedValueOnce(Error("TEST_ONLY-private-pool-disposal-error"));
    const compose = vi.fn(async (pool: Pool) => { expect(pool).toBe(db.pool); throw error; });
    await expect(composeOwnedNativeCoreRuntime({ compose }, db.pool)).rejects.toBe(error);
    expect(compose).toHaveBeenCalledOnce(); expect(db.end).toHaveBeenCalledOnce(); expect(db.query).not.toHaveBeenCalled();
  });
});

describe("TEST_ONLY actual Nest DI of exact AppModule native provider, not full app init", () => {
  it("accepts only the original genuine composition and refuses lookalike/pool/trust/coordinator substitutions", async () => {
    const f = await fixture(), db = poolFixture(f.target), prepared = await prepareNativeCoreRuntime(await f.manifest());
    const deps = await composeOwnedNativeCoreRuntime(prepared, db.pool);
    const operations = { prepareNativeManagerPage: vi.fn(), deploymentPage: vi.fn() } as unknown as MaximumDataOperationService;
    const context = await instantiate(consumerProvider(db.pool, deps), operations);
    try { expect(context.get(NativeManagerReadConsumer).uses(db.pool, operations)).toBe(true); }
    finally { await context.close(); }
    for (const [pool, supplied, code] of [
      [db.pool, { ...deps, nativeManagerRead: { ...deps.nativeManagerRead! } }, "CURRENT_HUMAN_NATIVE_CONFIG_INVALID"],
      [poolFixture(f.target).pool, deps, "CURRENT_HUMAN_MUTATION_CORE_POOL_REQUIRED"],
      [db.pool, { ...deps, executionAccessTrust: { ...deps.executionAccessTrust! } }, "CURRENT_HUMAN_NATIVE_CONFIG_INVALID"],
      [db.pool, { ...deps, currentHumanMutations: undefined }, "CURRENT_HUMAN_NATIVE_CONFIG_INVALID"],
    ] as const) {
      // Wrong coordinator/pool may be rejected synchronously by AppModule;
      // copied provenance/effective-trust must also fail actual Nest factory DI.
      const rejected = (async () => {
        const bad = await instantiate(consumerProvider(pool, supplied), operations);
        await bad.close();
      })();
      if (code === "CURRENT_HUMAN_MUTATION_CORE_POOL_REQUIRED") {
        await expect(rejected).rejects.toThrow(code);
      } else {
        await expect(rejected).rejects.toMatchObject({
          code, message: "The current identity operation is not available.",
        });
      }
    }
    expect(db.connect).not.toHaveBeenCalled(); expect(operations.prepareNativeManagerPage).not.toHaveBeenCalled();
    expect(operations.deploymentPage).not.toHaveBeenCalled(); expect(db.end).not.toHaveBeenCalled();
  });
  it("keeps selected wrong-environment requests fail-closed through actual DI, without legacy fallback", async () => {
    const f = await fixture(), db = poolFixture(f.target), prepared = await prepareNativeCoreRuntime(await f.manifest());
    const deps = await composeOwnedNativeCoreRuntime(prepared, db.pool);
    const operations = { prepareNativeManagerPage: vi.fn(), deploymentPage: vi.fn() } as unknown as MaximumDataOperationService;
    const context = await instantiate(consumerProvider(db.pool, deps), operations);
    try {
      const consumer = context.get(NativeManagerReadConsumer);
      const workspaces = { canReadExecution: vi.fn(async () => true) } as unknown as WorkspacesRepository;
      const controller = new MaximumDataOperationController(operations, workspaces, consumer);
      const request = { portalUser: { userId: f.actor }, portalSession: { userId: f.actor }, portalWorkspaceId: f.workspace } as
        unknown as Parameters<MaximumDataOperationController["deployments"]>[0];
      await expect(controller.deployments(request, { environment: "live", limit: 100 }, {} as FastifyReply))
        .rejects.toMatchObject({ code: "NATIVE_MANAGER_READ_DENIED", status: 403 });
      expect(operations.deploymentPage).not.toHaveBeenCalled(); expect(operations.prepareNativeManagerPage).not.toHaveBeenCalled();
      expect(db.connect).not.toHaveBeenCalled();
    } finally { await context.close(); }
  });
});
