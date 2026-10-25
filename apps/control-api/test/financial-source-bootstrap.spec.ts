/** TEST_ONLY private bootstrap/actual AppModule factory assertions. Schema and
 * Candidate creation are explicit doubles: no real PG, listener, source, human
 * identity, grant, financial-purpose proof or runtime acceptance is claimed. */
import "reflect-metadata";
import type { FactoryProvider } from "@nestjs/common";
import type { Pool } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppModule, type ControlApiDependencies } from "../src/app.module";
import type { ControlApiConfig } from "../src/config";
import type { CorePoolProfile } from "../src/db/pool";
import * as schema from "../src/execution-v2/current-human-schema";
import type { CurrentHumanCandidate } from "../src/execution-v2/current-human-candidate";
import { CurrentHumanMutations, type CurrentHumanRecoveryPort, type CurrentHumanReverseRecoveryParticipant } from "../src/execution-v2/current-human-mutations";
import type { CurrentHumanRecoveryClientConfig } from "../src/execution-v2/current-human-recovery-client";
import { prepareFinancialSourceApplication, selectPrivateCorePoolProfile } from "../src/execution-v2/financial-source-bootstrap";
import { FinancialSourceComposition } from "../src/execution-v2/financial-source-composition";
import type { PreparedFinancialSourceRuntime } from "../src/execution-v2/financial-source-runtime";

const observed = vi.hoisted(() => ({ recoveryInputs: [] as CurrentHumanRecoveryClientConfig[] }));
// Retain the REAL config validation/copying constructor. Record only TEST_ONLY
// inputs so success AND failed-composition ownership can be inspected offline.
vi.mock("../src/execution-v2/current-human-recovery-client", async importOriginal => {
  const real = await importOriginal<typeof import("../src/execution-v2/current-human-recovery-client")>();
  return { ...real, CurrentHumanRecoveryClient: class extends real.CurrentHumanRecoveryClient {
    constructor(input: CurrentHumanRecoveryClientConfig) { super(input); observed.recoveryInputs.push(input); }
  } };
});
const profile = (): CorePoolProfile => ({ max: 3, connectionTimeoutMillis: 5000, statement_timeout: 4000,
  query_timeout: 5000, idle_in_transaction_session_timeout: 5000 });
const tls = (label: string) => ({ key: Buffer.from(`TEST_ONLY-${label}-key`), cert: Buffer.from(`TEST_ONLY-${label}-cert`), ca: Buffer.from(`TEST_ONLY-${label}-ca`) });
function fixture() {
  const pool = { connect: vi.fn(async () => { throw Error("TEST_ONLY-no-real-PG"); }), end: vi.fn() } as unknown as Pool;
  const candidate = { usesPool: (selected: Pool) => selected === pool,
    recoverableObligations: vi.fn(async () => []) } as unknown as CurrentHumanCandidate;
  const start = vi.fn(async (_listeners: unknown) => ({ assertion: {}, reverse: {} })), shutdown = vi.fn(async () => undefined), withPrincipal = vi.fn();
  const registration = vi.fn((recovery: CurrentHumanRecoveryPort): CurrentHumanReverseRecoveryParticipant => ({
    candidate, workload_id: "TEST_ONLY-financial", recovery,
  }));
  const composition = { start, shutdown, withPrincipal, reverseRecoveryParticipant: registration } as unknown as FinancialSourceComposition;
  const runtime = {
    poolProfile: profile(), actor: { user_id: "TEST_ONLY-owner", session_id: "TEST_ONLY-session", session_generation: 7 },
    schemaTarget: { database_name: "TEST_ONLY-db", database_system_identifier: "1234", role_name: "TEST_ONLY-role",
      protected_owner_user_id: "TEST_ONLY-owner", workspace_id: "TEST_ONLY-workspace",
      principal_workspace_pins: [{ user_id: "TEST_ONLY-owner", workspace_id: "TEST_ONLY-workspace" }] },
    listeners: { assertion: { host: "127.0.0.1", port: 29450 }, reverse: { host: "127.0.0.1", port: 29451 } },
    config: { assertion_transport: { tls: tls("assertion") }, current_human_transport: { tls: tls("reverse") },
      candidate: { installation_scope: { workspace_id: "TEST_ONLY-workspace", environment: "paper", valid_until_ms: Date.now()+300_000 } },
      source_selection: { workspace_id: "TEST_ONLY-workspace", environment: "paper" }, assertion_limits: { ttl_ms: 60_000 } },
    recovery: { origin: "https://127.0.0.1:29452", tls: tls("recovery"), source_certificate_sha256: `sha256:${"a".repeat(64)}`,
      deadline_ms: 5000, response_bytes: 32768 },
  } as PreparedFinancialSourceRuntime;
  const assertSchema = vi.spyOn(schema, "assertRegisteredResearchCurrentHumanSchema").mockResolvedValue({
    schema_version: "TEST_ONLY-schema", schema_sha256: "TEST_ONLY-source", catalogue_sha256: "TEST_ONLY-catalogue", installed: false,
  });
  const create = vi.spyOn(FinancialSourceComposition, "create").mockResolvedValue(composition);
  return { pool, candidate, runtime, composition, create, assertSchema, start, shutdown, withPrincipal, registration };
}
afterEach(() => { vi.restoreAllMocks(); observed.recoveryInputs.length = 0; });
describe("private financial bootstrap", () => {
  it("asserts the actual pool/schema target before composition and performs no listener/context/issuance", async () => {
    const f = fixture(), order: string[] = [];
    f.assertSchema.mockImplementation(async (pool, target) => {
      expect(pool).toBe(f.pool); expect(target).toEqual(f.runtime.schemaTarget); order.push("schema");
      return { schema_version: "TEST_ONLY-schema", schema_sha256: "TEST_ONLY-source", catalogue_sha256: "TEST_ONLY-catalogue", installed: false };
    });
    f.create.mockImplementation(async (pool, config) => {
      expect(pool).toBe(f.pool); expect(config).toMatchObject(f.runtime.config); order.push("composition"); return f.composition;
    });
    const prepared = await prepareFinancialSourceApplication(f.pool, f.runtime);
    expect(order).toEqual(["schema", "composition"]); expect(prepared.composition).toBe(f.composition);
    expect(prepared.listeners).toEqual(f.runtime.listeners); expect(prepared.listeners).not.toBe(f.runtime.listeners);
    expect(prepared.participant.candidate).toBe(f.candidate);
    expect(prepared.owner.withOwnerContext).toBeTypeOf("function");
    expect(prepared.participant.recovery).toBeInstanceOf((await import("../src/execution-v2/current-human-recovery-client")).CurrentHumanRecoveryClient);
    expect(f.start).not.toHaveBeenCalled(); expect(f.withPrincipal).not.toHaveBeenCalled();
    expect(f.candidate.recoverableObligations).not.toHaveBeenCalled(); expect(f.pool.connect).not.toHaveBeenCalled(); expect(f.pool.end).not.toHaveBeenCalled();
  });
  it("deep-copies recovery TLS before wiping all loader-owned inputs on successful preparation", async () => {
    const f = fixture(), expected = structuredClone(f.runtime.recovery.tls);
    await prepareFinancialSourceApplication(f.pool, f.runtime);
    const copied = observed.recoveryInputs[0]!.tls;
    for (const key of ["key", "cert", "ca"] as const) {
      expect(copied[key]).toEqual(Buffer.from(expected[key] as Uint8Array)); expect(copied[key]).not.toBe(f.runtime.recovery.tls[key]);
      expect((f.runtime.recovery.tls[key] as Buffer).every(byte => byte === 0)).toBe(true);
    }
    for (const selected of [f.runtime.config.assertion_transport.tls, f.runtime.config.current_human_transport.tls])
      for (const bytes of [selected.key, selected.cert, selected.ca]) expect((bytes as Buffer).every(byte => byte === 0)).toBe(true);
  });
  it("holds one detached actor/source/trust/recovery/listener selection across the asynchronous schema preflight", async () => {
    const f = fixture();
    f.runtime.config.assertion_transport.peer = { certificate_sha256: `sha256:${"b".repeat(64)}`,
      dns_name: "test-only.invalid", workload_id: "TEST_ONLY-original-workload" };
    let proceed!: () => void;
    f.assertSchema.mockImplementationOnce(() => new Promise(resolve => { proceed=()=>resolve({
      schema_version:"TEST_ONLY-schema",schema_sha256:"TEST_ONLY-source",catalogue_sha256:"TEST_ONLY-catalogue",installed:false }); }));
    const before = structuredClone({ actor:f.runtime.actor,config:f.runtime.config,recovery:f.runtime.recovery,listeners:f.runtime.listeners });
    let received: unknown;
    f.create.mockImplementationOnce(async (_pool,config) => { received=structuredClone(config);return f.composition; });
    const pending = prepareFinancialSourceApplication(f.pool,f.runtime);
    Reflect.set(f.runtime.actor,"user_id","TEST_ONLY-replacement-actor");
    f.runtime.config.assertion_transport.peer.workload_id="TEST_ONLY-replacement-workload";
    f.runtime.config.assertion_transport.peer.certificate_sha256=`sha256:${"c".repeat(64)}`;
    (f.runtime.config.assertion_transport.tls.key as Buffer).fill(5);
    f.runtime.recovery.origin="https://127.0.0.1:29999";
    f.runtime.recovery.source_certificate_sha256=`sha256:${"d".repeat(64)}`;
    (f.runtime.recovery.tls.cert as Buffer).fill(6);
    Reflect.set(f.runtime.listeners.assertion,"port",29998);
    proceed(); const prepared=await pending;
    expect(received).toEqual(before.config);
    // structuredClone normalizes Buffer to Uint8Array; compare both snapshots
    // without changing any byte/pin assertion for the recovered selection.
    expect(structuredClone(observed.recoveryInputs[0])).toEqual(before.recovery);
    expect(prepared.listeners).toEqual(before.listeners); expect(Object.isFrozen(prepared.listeners.assertion)).toBe(true);
    expect(f.withPrincipal).not.toHaveBeenCalled(); expect(f.start).not.toHaveBeenCalled();
  });
  it("preserves independent recovery copies and erases input bytes when composition construction fails", async () => {
    const f = fixture(), failure = Error("TEST_ONLY-create-refused"), expected = Buffer.from(f.runtime.recovery.tls.key as Buffer);
    f.create.mockRejectedValue(failure); await expect(prepareFinancialSourceApplication(f.pool, f.runtime)).rejects.toBe(failure);
    expect(observed.recoveryInputs[0]!.tls.key).toEqual(expected); expect(observed.recoveryInputs[0]!.tls.key).not.toBe(f.runtime.recovery.tls.key);
    expect((f.runtime.recovery.tls.key as Buffer).every(byte => byte === 0)).toBe(true);
    expect(f.start).not.toHaveBeenCalled(); expect(f.withPrincipal).not.toHaveBeenCalled(); expect(f.pool.end).not.toHaveBeenCalled();
  });
  it("fails on the schema assertion before any composition/recovery client and still wipes input bytes", async () => {
    const f = fixture(), failure = Error("TEST_ONLY-schema-mismatch"); f.assertSchema.mockRejectedValue(failure);
    await expect(prepareFinancialSourceApplication(f.pool, f.runtime)).rejects.toBe(failure);
    expect(f.create).not.toHaveBeenCalled(); expect(observed.recoveryInputs).toHaveLength(0);
    for (const selected of [f.runtime.config.assertion_transport.tls, f.runtime.config.current_human_transport.tls, f.runtime.recovery.tls])
      for (const bytes of [selected.key, selected.cert, selected.ca]) expect((bytes as Buffer).every(byte => byte === 0)).toBe(true);
  });
  it("keeps all opt-ins absent as the unchanged no-profile path", () => {
    expect(selectPrivateCorePoolProfile()).toBeUndefined(); expect(observed.recoveryInputs).toHaveLength(0);
  });
  it("requires native ownership even when current-view and financial profiles match", () => {
    const f = fixture();
    expect(() => selectPrivateCorePoolProfile(undefined, undefined, f.runtime)).toThrow("FINANCIAL_SOURCE_SHARED_NATIVE_COMPOSITION_REQUIRED");
    expect(() => selectPrivateCorePoolProfile(undefined, { poolProfile: profile() }, f.runtime)).toThrow("FINANCIAL_SOURCE_SHARED_NATIVE_COMPOSITION_REQUIRED");
    expect(f.create).not.toHaveBeenCalled(); expect(f.pool.connect).not.toHaveBeenCalled();
  });
  it("selects the exact shared profile, independent of object key insertion order", () => {
    const f = fixture(), native = { poolProfile: profile() }, reordered = Object.fromEntries(Object.entries(profile()).reverse()) as unknown as CorePoolProfile;
    expect(selectPrivateCorePoolProfile(native, { poolProfile: reordered }, f.runtime)).toBe(native.poolProfile);
  });
  it.each(["max", "connectionTimeoutMillis", "statement_timeout", "query_timeout", "idle_in_transaction_session_timeout"] as const)("refuses mismatched %s before any resource creation", field => {
    const f = fixture(), changed = { ...profile(), [field]: profile()[field] + 1 };
    expect(() => selectPrivateCorePoolProfile({ poolProfile: profile() }, { poolProfile: changed }, f.runtime)).toThrow("PRIVATE_RUNTIME_CORE_POOL_PROFILE_MISMATCH");
    expect(() => selectPrivateCorePoolProfile({ poolProfile: changed }, undefined, f.runtime)).toThrow("PRIVATE_RUNTIME_CORE_POOL_PROFILE_MISMATCH");
    expect(f.create).not.toHaveBeenCalled(); expect(f.pool.connect).not.toHaveBeenCalled();
  });
});
describe("actual AppModule financial registration/lifecycle factory", () => {
  const config = { NODE_ENV: "test" } as ControlApiConfig;
  function registered(f: ReturnType<typeof fixture>, prepared: Awaited<ReturnType<typeof prepareFinancialSourceApplication>>) {
    const base = { usesPool: (pool: Pool) => pool === f.pool, recoverableObligations: vi.fn(async () => []) } as unknown as CurrentHumanCandidate;
    return new CurrentHumanMutations(f.pool, base, { recover: vi.fn() }, { maximum_intents: 16, maximum_recoveries_per_request: 2 }, undefined, [prepared.participant]);
  }
  it("does not add financial provider or lifecycle work when absent", () => {
    const f = fixture(), module = AppModule.register(config, f.pool);
    expect(module.providers?.some(value => typeof value === "object" && value !== null && "provide" in value && value.provide === FinancialSourceComposition)).toBe(false);
    expect(f.pool.connect).not.toHaveBeenCalled(); expect(f.start).not.toHaveBeenCalled();
  });
  it("refuses financial-only and a similarly shaped but unregistered participant", async () => {
    const f = fixture(), prepared = await prepareFinancialSourceApplication(f.pool, f.runtime), mutations = registered(f, prepared);
    const native = {} as NonNullable<ControlApiDependencies["nativeManagerRead"]>;
    expect(() => AppModule.register(config, f.pool, undefined, { financialSource: prepared, currentHumanMutations: mutations }))
      .toThrow("FINANCIAL_SOURCE_SHARED_NATIVE_COMPOSITION_REQUIRED");
    const wrong = { ...prepared, participant: { ...prepared.participant, recovery: { recover: prepared.participant.recovery.recover } } };
    expect(() => AppModule.register(config, f.pool, undefined, { nativeManagerRead: native, financialSource: wrong, currentHumanMutations: mutations }))
      .toThrow("FINANCIAL_SOURCE_SHARED_NATIVE_COMPOSITION_REQUIRED");
    expect(f.start).not.toHaveBeenCalled(); expect(f.withPrincipal).not.toHaveBeenCalled();
  });
  it("uses the original composition and exact listener targets in actual lifecycle closures", async () => {
    const f = fixture(), prepared = await prepareFinancialSourceApplication(f.pool, f.runtime), mutations = registered(f, prepared);
    const module = AppModule.register(config, f.pool, undefined, { financialSource: prepared, currentHumanMutations: mutations,
      nativeManagerRead: {} as NonNullable<ControlApiDependencies["nativeManagerRead"]> });
    const provider = module.providers?.find((value): value is FactoryProvider => typeof value === "object" && value !== null &&
      "provide" in value && value.provide === FinancialSourceComposition && "useFactory" in value);
    expect(provider).toBeDefined(); expect(f.start).not.toHaveBeenCalled();
    const original = provider!.useFactory() as FinancialSourceComposition & { onModuleInit(): Promise<unknown>; beforeApplicationShutdown(): Promise<void> };
    expect(original).toBe(f.composition); await original.onModuleInit();
    expect(f.start).toHaveBeenCalledExactlyOnceWith(prepared.listeners); await original.beforeApplicationShutdown();
    expect(f.shutdown).toHaveBeenCalledOnce(); expect(f.withPrincipal).not.toHaveBeenCalled(); expect(f.pool.end).not.toHaveBeenCalled();
  });
  it("propagates the original shutdown failure rather than declaring pool disposal", async () => {
    const f = fixture(), prepared = await prepareFinancialSourceApplication(f.pool, f.runtime), failure = Error("TEST_ONLY-drain-pending");
    f.shutdown.mockRejectedValue(failure);
    const module = AppModule.register(config, f.pool, undefined, { financialSource: prepared, currentHumanMutations: registered(f, prepared),
      nativeManagerRead: {} as NonNullable<ControlApiDependencies["nativeManagerRead"]> });
    const provider = module.providers?.find((value): value is FactoryProvider => typeof value === "object" && value !== null &&
      "provide" in value && value.provide === FinancialSourceComposition && "useFactory" in value);
    const original = provider!.useFactory() as FinancialSourceComposition & { beforeApplicationShutdown(): Promise<void> };
    await expect(original.beforeApplicationShutdown()).rejects.toBe(failure); expect(f.pool.end).not.toHaveBeenCalled();
  });
});
