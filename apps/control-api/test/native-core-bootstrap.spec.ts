/** TEST_ONLY bootstrap checks; actual execution receipts belong to C7.
 * Real OS leaves + real jose/selected source/composition + actual Nest factory DI.
 * Pool/operations are explicit test doubles: no DB, upstream, TLS handshake,
 * policy installation, full AppModule init, or physical read authority proof.
 * Uses the actual private loader/finite composition and compose helper.
 */
import "reflect-metadata";
import { createHash } from "node:crypto";
import { mkdtemp, writeFile, chmod, symlink, rm, readFile, readdir, stat } from "node:fs/promises";
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
  NativeCoreRuntimeError, nativeResearchSchemaReference, prepareNativeResearchSchemaInstall } from "../src/execution-v2/native-core-runtime";
import { composeOwnedNativeCoreRuntime } from "../src/execution-v2/native-core-bootstrap";
import { NativeManagerReadConsumer } from "../src/execution-v2/native-manager-consumer";
import { MaximumDataOperationService } from "../src/execution/maximum-data-operation.service";
import { ExecutionReadScopes } from "../src/execution-v2/read-scope";
import { ExecutionProfileProjectionRepository } from "../src/execution/profile-projection.repository";
import { CONTROL_API_CONFIG } from "../src/tokens";
import { MaximumDataOperationController } from "../src/execution/maximum-data-operation.controller";
import type { WorkspacesRepository } from "../src/repos/workspaces";
import { MAXIMUM_DATA_DEPLOYMENT_OPERATION } from "../src/execution/maximum-data-operation.registry";
import { loadConfig } from "../src/config";
import {ExecutionProfileProjectionWorker} from "../src/execution/profile-projection.worker";
import * as cacheObservation from "../src/execution-v2/native-cache-observation";

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
function consumerProvider(pool: Pool, deps: ControlApiDependencies, config = { NODE_ENV: "test" } as ControlApiConfig): FactoryProvider {
  const registration = AppModule.register(config, pool, undefined, deps);
  const provider = registration.providers?.find((p): p is FactoryProvider =>
    !!p && typeof p === "object" && "provide" in p && p.provide === NativeManagerReadConsumer && "useFactory" in p);
  if (!provider) throw Error("TEST_ONLY-missing-native-provider");
  return provider;
}
function instantiate(provider: FactoryProvider, operations: MaximumDataOperationService, config = {} as ControlApiConfig) {
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
      { provide: CONTROL_API_CONFIG, useValue: config }, provider],
    exports: [NativeManagerReadConsumer] },
  { logger: false, abortOnError: false });
}

describe("TEST_ONLY private bootstrap real leaf / real signing-key checks", () => {
  it("loads schema-only intent independently of the future private TLS/mapping/runtime bundle",async()=>{
    const f=await fixture();
    const value={schema_version:"portal.native-research-schema-install.v1",environment:"paper",profile_id:"PAPER_BINANCE_USDM",
      pool_profile:f.value.pool_profile,target:f.target};
    const pin=await f.leaf("schema-only.json",JSON.stringify(value));
    const env={CONTROL_API_NATIVE_SCHEMA_TARGET_FILE:pin.path,CONTROL_API_NATIVE_SCHEMA_TARGET_SHA256:pin.sha256,
      CONTROL_API_NATIVE_CORE_CONFIG_FILE:"MALFORMED-FUTURE-RUNTIME-NOT-READ"};
    const selected=nativeResearchSchemaReference(env)!;
    expect(await prepareNativeResearchSchemaInstall(selected,f.workspace)).toEqual({poolProfile:value.pool_profile,target:value.target});
    expect(nativeResearchSchemaReference({})).toBeUndefined();
    expect(()=>nativeResearchSchemaReference({CONTROL_API_NATIVE_SCHEMA_TARGET_FILE:pin.path})).toThrow(safe.message);
  });
  it("rejects schema-only intent with wrong scope, multiple principals, unsafe pools or authority fields",async()=>{
    const f=await fixture();
    const value={schema_version:"portal.native-research-schema-install.v1",environment:"paper",profile_id:"PAPER_BINANCE_USDM",
      pool_profile:f.value.pool_profile,target:f.target};
    const bad=[{...value,environment:"live"},{...value,profile_id:"OTHER"},{...value,composition:{}},
      {...value,target:{...f.target,principal_workspace_pins:[...f.target.principal_workspace_pins,...f.target.principal_workspace_pins]}},
      {...value,target:{...f.target,principal_workspace_pins:[{user_id:f.actor,workspace_id:"OTHER"}]}},
      {...value,pool_profile:{...value.pool_profile,max:11}},
      {...value,pool_profile:{...value.pool_profile,query_timeout:value.pool_profile.statement_timeout}}];
    for(let i=0;i<bad.length;i++){
      const pin=await f.leaf(`schema-bad-${i}.json`,JSON.stringify(bad[i]));
      await expect(prepareNativeResearchSchemaInstall(pin,f.workspace)).rejects.toMatchObject(safe);
    }
    const pin=await f.leaf("schema-wrong-workspace.json",JSON.stringify(value));
    await expect(prepareNativeResearchSchemaInstall(pin,"OTHER")).rejects.toMatchObject(safe);
  });
  it("enforces private canonical file/hash rules on the independent schema intent",async()=>{
    const f=await fixture();
    const value={schema_version:"portal.native-research-schema-install.v1",environment:"paper",profile_id:"PAPER_BINANCE_USDM",
      pool_profile:f.value.pool_profile,target:f.target};
    const pin=await f.leaf("schema-rules.json",JSON.stringify(value));
    await expect(prepareNativeResearchSchemaInstall({...pin,sha256:raw("0")},f.workspace)).rejects.toMatchObject(safe);
    const link=join(f.root,"schema-link.json");await symlink(pin.path,link);
    await expect(prepareNativeResearchSchemaInstall({...pin,path:link},f.workspace)).rejects.toMatchObject(safe);
    await chmod(pin.path,0o640);
    await expect(prepareNativeResearchSchemaInstall(pin,f.workspace)).rejects.toMatchObject(safe);
    const padded=await f.leaf("schema-padded.json",JSON.stringify(value)+"\n");
    await expect(prepareNativeResearchSchemaInstall(padded,f.workspace)).rejects.toMatchObject(safe);
  });
  it("keeps ordinary defaults unchanged and refuses native commissioning outside its isolated local Paper ceiling",()=>{
    const base={PORTAL_ENV:"local",AUTH_MODE:"dev",DATABASE_URL:"postgres://TEST_ONLY/TEST_ONLY_core"};
    expect(loadConfig(base).EXECUTION_READ_PROFILE).toBe("source_current_v1");
    const review={...base,EXECUTION_READ_PROFILE:"native_manager_review_v1",
      EXECUTION_DATABASE_URL:"postgres://TEST_ONLY/TEST_ONLY_execution",EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID:"TEST_ONLY_workspace",
      FEATURE_EXECUTION_EDGE:"true",FEATURE_EXECUTION_CURRENT_SOURCE_PAPER:"true",FEATURE_EXECUTION_LOCAL_PROJECTION:"true",
      EXECUTION_EDGE_PRIVATE_KEY_FILE:"/TEST_ONLY/not-read.key",EXECUTION_EDGE_CA_FILE:"/TEST_ONLY/not-read.ca",
      EXECUTION_EDGE_CLIENT_CERT_FILE:"/TEST_ONLY/not-read.crt",EXECUTION_EDGE_CLIENT_KEY_FILE:"/TEST_ONLY/not-read.client-key",
      EXECUTION_EDGE_PAPER_ORIGIN:"https://TEST-ONLY.invalid",EXECUTION_EDGE_PAPER_PROFILE_ID:"PAPER_BINANCE_USDM",
      EXECUTION_EDGE_PAPER_AUDIENCE:"portal-execution-edge-paper"};
    expect(loadConfig(review).EXECUTION_READ_PROFILE).toBe("native_manager_review_v1");
    expect(()=>loadConfig({...review,EXECUTION_DATABASE_URL:base.DATABASE_URL})).toThrow("EXECUTION_DATABASE_MUST_BE_ISOLATED");
    for(const key of ["FEATURE_EXECUTION_CURRENT_SOURCE_SANDBOX","FEATURE_EXECUTION_CURRENT_SOURCE_LIVE",
      "FEATURE_EXECUTION_REALTIME_SSE","FEATURE_EXECUTION_DURABLE_MIRROR","FEATURE_EXECUTION_COMMAND_RELAY"])
      expect(()=>loadConfig({...review,[key]:"true"})).toThrow();
    expect(()=>loadConfig({...review,EXECUTION_EDGE_LIVE_PROFILE_ID:"LIVE_BINANCE_USDM"})).toThrow("NATIVE_RESEARCH_REVIEW_FORBIDS_OTHER_PROFILES_AND_LEGACY_WORKERS");
    expect(()=>loadConfig({...review,PORTAL_ENV:"live"})).toThrow();
  });
  it("refuses the explicit Research profile before provider construction without genuine native composition", () => {
    const db=poolFixture({database_name:"TEST_ONLY-core",role_name:"TEST_ONLY-runtime",database_system_identifier:"1"});
    expect(()=>AppModule.register({EXECUTION_READ_PROFILE:"native_manager_review_v1"} as ControlApiConfig,db.pool))
      .toThrow("NATIVE_RESEARCH_REVIEW_COMPOSITION_REQUIRED");
    expect(db.query).not.toHaveBeenCalled();
  });
  it("requires independent realtime limits and exact single Paper actor/workspace for Research",async()=>{
    const f=await fixture(),prepared=await prepareNativeCoreRuntime(await f.manifest());
    expect(()=>prepared.researchReviewTarget(f.workspace)).toThrow(safe.message);
    const withRealtime={...f.value,realtime_limits:{maximumClients:2,maximumEntriesPerClient:8,maximumFrameBytes:65536,
      maximumClientBytes:131072,maximumTotalBytes:262144,maximumNoticesPerRead:20,readTimeoutMs:1000}};
    const selected=await prepareNativeCoreRuntime(await f.leaf("runtime-review.json",JSON.stringify(withRealtime)));
    expect(selected.researchReviewTarget(f.workspace)).toEqual(f.target);
    expect(()=>selected.researchReviewTarget("OTHER-workspace")).toThrow(safe.message);
  });
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
  const realtimeLimits={maximumClients:2,maximumEntriesPerClient:8,maximumFrameBytes:65536,
    maximumClientBytes:131072,maximumTotalBytes:262144,maximumNoticesPerRead:20,readTimeoutMs:1000};
  const observationConfig=(directory:string)=>({schema_version:"portal.native-cache-observation-config.v1",directory});
  const reviewConfig=()=>({...loadConfig({PORTAL_ENV:"local",AUTH_MODE:"dev",DATABASE_URL:"postgres://TEST_ONLY/TEST_ONLY_core"}),
    EXECUTION_READ_PROFILE:"native_manager_review_v1"} as ControlApiConfig);
  it("keeps default factory free of observation construction and extra private files",async()=>{
    const f=await fixture(),db=poolFixture(f.target),prepared=await prepareNativeCoreRuntime(await f.manifest());
    const before=await readdir(f.root),create=vi.spyOn(cacheObservation,"createNativeCacheObserver");
    const deps=await prepared.compose(db.pool),operations={} as MaximumDataOperationService;
    const context=await instantiate(consumerProvider(db.pool,deps),operations);
    try{expect(create).not.toHaveBeenCalled();expect(await readdir(f.root)).toEqual(before);
      expect(deps).not.toHaveProperty("nativeManagerCacheObservation");}
    finally{await context.close();}
  });
  it("passes an actual private observer from hash-pinned loader through real AppModule Nest DI",async()=>{
    const f=await fixture(),directory=join(f.root,"observations"),db=poolFixture(f.target),cfg=reviewConfig();
    const value={...f.value,realtime_limits:realtimeLimits,cache_observation:observationConfig(directory)};
    const prepared=await prepareNativeCoreRuntime(await f.leaf("observed-runtime.json",JSON.stringify(value)));
    const deps=await prepared.compose(db.pool),create=vi.spyOn(cacheObservation,"createNativeCacheObserver");
    expect(deps.nativeManagerCacheObservation).toEqual({directory});
    expect(Object.isFrozen(deps.nativeManagerCacheObservation)).toBe(true);
    const context=await instantiate(consumerProvider(db.pool,deps,cfg),{} as MaximumDataOperationService,cfg);
    try{
      expect(create).toHaveBeenCalledExactlyOnceWith(directory);
      const observer=create.mock.results[0]!.value;
      expect(observer).toBeInstanceOf(cacheObservation.NativeCacheObserver);
      expect(Reflect.get(context.get(NativeManagerReadConsumer),"cacheObserver")).toBe(observer);
      expect((await stat(directory)).mode&0o777).toBe(0o700);
      const key=await readFile(join(directory,"observation.key"));
      expect(key.length).toBe(32);expect((await stat(join(directory,"observation.key"))).mode&0o777).toBe(0o600);
      expect(await readdir(directory)).toEqual(["observation.key"]);
      expect(db.connect).not.toHaveBeenCalled(); // no grant, source or custody write
    }finally{await context.close();}
  });
  it("rejects observation outside Research before constructing the provider or touching files",async()=>{
    const f=await fixture(),db=poolFixture(f.target),deps=await(await prepareNativeCoreRuntime(await f.manifest())).compose(db.pool);
    const create=vi.spyOn(cacheObservation,"createNativeCacheObserver"),directory=join(f.root,"must-not-exist");
    expect(()=>consumerProvider(db.pool,{...deps,nativeManagerCacheObservation:{directory}}))
      .toThrow("NATIVE_CACHE_OBSERVATION_RESEARCH_COMPOSITION_REQUIRED");
    expect(create).not.toHaveBeenCalled();expect(await readdir(f.root)).not.toContain("must-not-exist");
  });
  it("validates genuine composition, same pool, trust and mutations before any observer construction",async()=>{
    const f=await fixture(),db=poolFixture(f.target),cfg=reviewConfig(),directory=join(f.root,"must-not-exist");
    const prepared=await prepareNativeCoreRuntime(await f.leaf("observer-negative.json",JSON.stringify({
      ...f.value,realtime_limits:realtimeLimits,cache_observation:observationConfig(directory)})));
    const deps=await prepared.compose(db.pool),create=vi.spyOn(cacheObservation,"createNativeCacheObserver");
    const other=await prepared.compose(db.pool); // genuine, SAME pool, different coordinator
    for(const [pool,supplied] of [
      [db.pool,{...deps,nativeManagerRead:{...deps.nativeManagerRead!}}],
      [poolFixture(f.target).pool,deps],
      [db.pool,{...deps,executionAccessTrust:{...deps.executionAccessTrust!}}],
      [db.pool,{...deps,currentHumanMutations:undefined}],
      [db.pool,{...deps,currentHumanMutations:other.currentHumanMutations}],
    ] as const){
      await expect((async()=>{const context=await instantiate(consumerProvider(pool,supplied,cfg),{} as MaximumDataOperationService,cfg);
        await context.close();})()).rejects.toBeDefined();
      expect(create).not.toHaveBeenCalled();expect(await readdir(f.root)).not.toContain("must-not-exist");
    }
  });
  it("refuses symlink ancestors and unsafe existing keys through the actual enabled factory",async()=>{
    const f=await fixture(),db=poolFixture(f.target),cfg=reviewConfig(),target=join(f.root,"ancestor-link");
    await symlink(f.root,target);
    const directory=join(target,"redirected"),prepared=await prepareNativeCoreRuntime(await f.leaf("observer-link.json",JSON.stringify({
      ...f.value,realtime_limits:realtimeLimits,cache_observation:observationConfig(directory)})));
    const deps=await prepared.compose(db.pool);
    await expect(instantiate(consumerProvider(db.pool,deps,cfg),{} as MaximumDataOperationService,cfg))
      .rejects.toMatchObject({code:"NATIVE_CACHE_OBSERVATION_DIRECTORY_REFUSED"});
    expect(await readdir(f.root)).not.toContain("redirected");
    const badKey=await f.leaf("observation.key","TEST_ONLY-existing-key-never-replaced");
    const bad={...deps,nativeManagerCacheObservation:{directory:f.root}};
    await expect(instantiate(consumerProvider(db.pool,bad,cfg),{} as MaximumDataOperationService,cfg))
      .rejects.toMatchObject({code:"NATIVE_CACHE_OBSERVATION_KEY_REFUSED"});
    expect(await readFile(badKey.path,"utf8")).toBe("TEST_ONLY-existing-key-never-replaced");
  });
  it("never starts the legacy ingestion worker in native-only Research",async()=>{
    const cfg={EXECUTION_READ_PROFILE:"native_manager_review_v1",FEATURE_EXECUTION_LOCAL_PROJECTION:"true"} as ControlApiConfig;
    const worker=new ExecutionProfileProjectionWorker(cfg,{} as never,{} as never);
    const run=vi.spyOn(worker,"runOnce");
    worker.onApplicationBootstrap();
    expect(run).not.toHaveBeenCalled();
    await expect(worker.runOnce()).resolves.toBeUndefined();
    await worker.onApplicationShutdown();
  });
  it("denies unknown native people instead of invoking either legacy Manager reader",async()=>{
    const operations={deploymentPage:vi.fn(),relationPage:vi.fn()} as unknown as MaximumDataOperationService;
    const consumer={serve:vi.fn(async()=>false)} as unknown as NativeManagerReadConsumer;
    const workspaces={canReadExecution:vi.fn(async()=>true)} as unknown as WorkspacesRepository;
    const controller=new MaximumDataOperationController(operations,workspaces,consumer,
      {EXECUTION_READ_PROFILE:"native_manager_review_v1"} as ControlApiConfig);
    const request={portalUser:{userId:"TEST_ONLY-unselected"},portalSession:{},portalWorkspaceId:"TEST_ONLY-workspace"} as never;
    await expect(controller.deployments(request,{},{} as FastifyReply)).rejects.toMatchObject({code:"NATIVE_MANAGER_READ_DENIED",status:403});
    await expect(controller.currentRelation(request,"account-balances",{},{} as FastifyReply)).rejects.toMatchObject({code:"NATIVE_MANAGER_READ_DENIED",status:403});
    expect(operations.deploymentPage).not.toHaveBeenCalled();expect(operations.relationPage).not.toHaveBeenCalled();
  });
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
