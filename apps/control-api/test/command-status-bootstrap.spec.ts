/** TEST_ONLY factory doubles. No PG, source, original, assertion, grant or
 * listener is represented as real; actual composition has separate gates. */
import "reflect-metadata";
import type { FactoryProvider } from "@nestjs/common";
import type { Pool } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppModule, type ControlApiDependencies } from "../src/app.module";
import { loadConfig, type ControlApiConfig } from "../src/config";
import type { CorePoolProfile } from "../src/db/pool";
import * as schema from "../src/execution-v2/current-human-schema";
import type { CurrentHumanCandidate } from "../src/execution-v2/current-human-candidate";
import type { CurrentHumanRecoveryClientConfig } from "../src/execution-v2/current-human-recovery-client";
import { CurrentHumanMutations, type CurrentHumanRecoveryPort, type CurrentHumanReverseRecoveryParticipant } from "../src/execution-v2/current-human-mutations";
import { ExecutionAccessService } from "../src/execution-v2/access.service";
import { ExecutionCommandService } from "../src/execution-v2/command.service";
import { unqualifiedCommandTrust, type CommandTrust } from "../src/execution-v2/command-trust";
import { selectPrivateCorePoolProfile } from "../src/execution-v2/financial-source-bootstrap";
import { CommandStatusComposition } from "../src/execution-v2/command-status-composition";
import { prepareCommandStatusApplication } from "../src/execution-v2/command-status-bootstrap";
import type { PreparedCommandStatusRuntime } from "../src/execution-v2/command-status-runtime";

const observed = vi.hoisted(() => ({ recoveryInputs: [] as CurrentHumanRecoveryClientConfig[] }));
vi.mock("../src/execution-v2/current-human-recovery-client", async original => {
  const real = await original<typeof import("../src/execution-v2/current-human-recovery-client")>();
  return { ...real, CurrentHumanRecoveryClient: class extends real.CurrentHumanRecoveryClient {
    constructor(input: CurrentHumanRecoveryClientConfig) { super(input); observed.recoveryInputs.push(input); }
  } };
});
const tls = (label: string) => ({ key: Buffer.from(`TEST_ONLY-${label}-key`), cert: Buffer.from(`TEST_ONLY-${label}-cert`), ca: Buffer.from(`TEST_ONLY-${label}-ca`) });
function fixture() {
  const pool = { connect: vi.fn(), end: vi.fn() } as unknown as Pool;
  const candidate = { usesPool: (selected: Pool) => selected === pool, recoverableObligations: vi.fn(async () => []) } as unknown as CurrentHumanCandidate;
  const start = vi.fn(async (_listeners: unknown) => undefined), statusTrust = vi.fn(() => unqualifiedCommandTrust), shutdown = vi.fn(async () => undefined);
  const registration = vi.fn((recovery: CurrentHumanRecoveryPort): CurrentHumanReverseRecoveryParticipant => ({ candidate, workload_id: "TEST_ONLY-status", recovery }));
  const usesPool = vi.fn((selected: Pool) => selected === pool);
  const composition = { start, statusTrust, shutdown, usesPool, reverseRecoveryParticipant: registration } as unknown as CommandStatusComposition;
  const runtime = { poolProfile: { max: 3, connectionTimeoutMillis: 1000, statement_timeout: 1000, query_timeout: 2000, idle_in_transaction_session_timeout: 1000 },
    schemaTarget: { database_name: "TEST_ONLY-db", database_system_identifier: "1234", role_name: "TEST_ONLY-role", protected_owner_user_id: "TEST_ONLY-owner",
      workspace_id: "TEST_ONLY-workspace", principal_workspace_pins: [{ user_id: "TEST_ONLY-owner", workspace_id: "TEST_ONLY-workspace" }] },
    listeners: { assertion: { host: "127.0.0.1", port: 29460 }, reverse: { host: "127.0.0.1", port: 29461 } },
    config: { assertion_transport: { tls: tls("assertion") }, current_human_transport: { tls: tls("reverse") }, edge_transport: { tls: tls("edge") } },
    recovery: { origin: "https://127.0.0.1:29462", tls: tls("recovery"), source_certificate_sha256: `sha256:${"a".repeat(64)}`, deadline_ms: 1000, response_bytes: 32_768 },
  } as PreparedCommandStatusRuntime;
  const assertSchema = vi.spyOn(schema, "assertRegisteredResearchCurrentHumanSchema").mockResolvedValue({
    schema_version: "TEST_ONLY-schema", schema_sha256: "TEST_ONLY-source", catalogue_sha256: "TEST_ONLY-catalogue", installed: false });
  const create = vi.spyOn(CommandStatusComposition, "create").mockResolvedValue(composition);
  return { pool, candidate, runtime, composition, assertSchema, create, registration, start, statusTrust, shutdown, usesPool };
}
afterEach(() => { vi.restoreAllMocks(); observed.recoveryInputs.length = 0; });
describe("private STATUS bootstrap", () => {
  it("checks actual schema first and registers the exact recovery object without admitting any use", async () => {
    const f = fixture(), order: string[] = [];
    f.assertSchema.mockImplementation(async (pool, target) => { expect(pool).toBe(f.pool); expect(target).toBe(f.runtime.schemaTarget); order.push("schema");
      return { schema_version: "TEST_ONLY-schema", schema_sha256: "TEST_ONLY-source", catalogue_sha256: "TEST_ONLY-catalogue", installed: false }; });
    f.create.mockImplementation(async (pool, input) => { expect(pool).toBe(f.pool); expect(input).toBe(f.runtime.config); order.push("composition"); return f.composition; });
    const result = await prepareCommandStatusApplication(f.pool, f.runtime);
    expect(order).toEqual(["schema", "composition"]); expect(result.composition).toBe(f.composition); expect(result.listeners).toBe(f.runtime.listeners);
    expect(result.participant.candidate).toBe(f.candidate); expect(f.registration).toHaveBeenCalledExactlyOnceWith(result.participant.recovery);
    expect(f.start).not.toHaveBeenCalled(); expect(f.statusTrust).not.toHaveBeenCalled(); expect(f.shutdown).not.toHaveBeenCalled();
    expect(f.pool.connect).not.toHaveBeenCalled(); expect(f.pool.end).not.toHaveBeenCalled();
  });
  it("copies recovery credentials before wiping every loader-owned TLS role", async () => {
    const f = fixture(), expected = Buffer.from(f.runtime.recovery.tls.key as Buffer);
    await prepareCommandStatusApplication(f.pool, f.runtime);
    expect(observed.recoveryInputs[0]!.tls.key).toEqual(expected); expect(observed.recoveryInputs[0]!.tls.key).not.toBe(f.runtime.recovery.tls.key);
    for (const selected of [f.runtime.config.assertion_transport.tls, f.runtime.config.current_human_transport.tls, f.runtime.config.edge_transport.tls, f.runtime.recovery.tls])
      for (const bytes of [selected.key, selected.cert, selected.ca]) expect((bytes as Buffer).every(byte => byte === 0)).toBe(true);
  });
  it("refuses an unregistered/mismatched schema before composition or recovery construction", async () => {
    const f = fixture(), error = Error("TEST_ONLY-schema-refusal"); f.assertSchema.mockRejectedValue(error);
    await expect(prepareCommandStatusApplication(f.pool, f.runtime)).rejects.toBe(error);
    expect(f.create).not.toHaveBeenCalled(); expect(observed.recoveryInputs).toHaveLength(0);
    expect((f.runtime.config.edge_transport.tls.key as Buffer).every(byte => byte === 0)).toBe(true);
  });
  it("propagates exact composition/refused registration errors, never starts a fallback", async () => {
    for (const where of ["create", "participant"] as const) {
      const f = fixture(), error = Error(`TEST_ONLY-${where}-refusal`);
      if (where === "create") f.create.mockRejectedValue(error); else f.registration.mockImplementation(() => { throw error; });
      await expect(prepareCommandStatusApplication(f.pool, f.runtime)).rejects.toBe(error);
      expect(f.start).not.toHaveBeenCalled(); expect(f.statusTrust).not.toHaveBeenCalled(); expect(f.pool.end).not.toHaveBeenCalled();
      expect((f.runtime.recovery.tls.key as Buffer).every(byte => byte === 0)).toBe(true);
      vi.restoreAllMocks();
    }
  });
});

describe("actual AppModule STATUS factories with explicit TEST_ONLY participants", () => {
  const reviewConfig = () => ({ ...loadConfig({ PORTAL_ENV: "local", AUTH_MODE: "dev", DATABASE_URL: "postgres://TEST_ONLY/TEST_ONLY_core" }),
    EXECUTION_READ_PROFILE: "native_manager_review_v1" } as ControlApiConfig);
  function registered(f: ReturnType<typeof fixture>, prepared: Awaited<ReturnType<typeof prepareCommandStatusApplication>>) {
    const base = { usesPool: (selected: Pool) => selected === f.pool, recoverableObligations: vi.fn(async () => []) } as unknown as CurrentHumanCandidate;
    return new CurrentHumanMutations(f.pool, base, { recover: vi.fn() }, { maximum_intents: 16, maximum_recoveries_per_request: 2 }, undefined, [prepared.participant]);
  }
  function dependencies(f: ReturnType<typeof fixture>, prepared: Awaited<ReturnType<typeof prepareCommandStatusApplication>>): ControlApiDependencies {
    return { nativeManagerRead: {} as NonNullable<ControlApiDependencies["nativeManagerRead"]>,
      nativeManagerRealtimeLimits: { maximumClients: 2, maximumEntriesPerClient: 8, maximumFrameBytes: 65_536,
        maximumClientBytes: 131_072, maximumTotalBytes: 262_144, maximumNoticesPerRead: 20, readTimeoutMs: 1000 },
      executionAccessTrust: {} as NonNullable<ControlApiDependencies["executionAccessTrust"]>,
      currentHumanMutations: registered(f, prepared), commandStatus: prepared };
  }
  function provider(module: ReturnType<typeof AppModule.register>, token: unknown): FactoryProvider {
    const found = module.providers?.find((value): value is FactoryProvider => typeof value === "object" && value !== null &&
      "provide" in value && value.provide === token && "useFactory" in value);
    if (!found) throw Error("TEST_ONLY-provider-missing");
    return found;
  }
  it("leaves STATUS composition unmounted when the opt-in is absent", () => {
    const f = fixture(), module = AppModule.register({ NODE_ENV: "test" } as ControlApiConfig, f.pool);
    expect(module.providers?.some(value => typeof value === "object" && value !== null && "provide" in value && value.provide === CommandStatusComposition)).toBe(false);
    expect(f.start).not.toHaveBeenCalled(); expect(f.statusTrust).not.toHaveBeenCalled(); expect(f.pool.connect).not.toHaveBeenCalled();
  });
  it("rejects non-Research, a foreign pool, missing native ownership and a cloned recovery identity", async () => {
    const f = fixture(), prepared = await prepareCommandStatusApplication(f.pool, f.runtime), deps = dependencies(f, prepared);
    expect(() => AppModule.register({ NODE_ENV: "test" } as ControlApiConfig, f.pool, undefined, deps))
      .toThrow("COMMAND_STATUS_SHARED_RESEARCH_COMPOSITION_REQUIRED");
    f.usesPool.mockReturnValue(false);
    expect(() => AppModule.register(reviewConfig(), f.pool, undefined, deps)).toThrow("COMMAND_STATUS_SHARED_RESEARCH_COMPOSITION_REQUIRED");
    f.usesPool.mockImplementation(selected => selected === f.pool);
    expect(() => AppModule.register(reviewConfig(), f.pool, undefined, { ...deps, nativeManagerRead: undefined }))
      .toThrow("NATIVE_RESEARCH_REVIEW_COMPOSITION_REQUIRED");
    const cloned = { ...prepared, participant: { ...prepared.participant, recovery: { recover: prepared.participant.recovery.recover } } };
    expect(() => AppModule.register(reviewConfig(), f.pool, undefined, { ...deps, commandStatus: cloned }))
      .toThrow("COMMAND_STATUS_SHARED_RESEARCH_COMPOSITION_REQUIRED");
    expect(f.start).not.toHaveBeenCalled(); expect(f.statusTrust).not.toHaveBeenCalled(); expect(f.pool.end).not.toHaveBeenCalled();
  });
  it.each([true, false])("binds the exact shared Access/baseTrust/coordinator before starting (explicit base=%s)", async explicit => {
    const f = fixture(), prepared = await prepareCommandStatusApplication(f.pool, f.runtime), deps = dependencies(f, prepared), config = reviewConfig();
    const base = { ...unqualifiedCommandTrust } as CommandTrust;
    if (explicit) deps.executionCommandTrust = base;
    const module = AppModule.register(config, f.pool, undefined, deps);
    const lifecycle = provider(module, CommandStatusComposition).useFactory() as CommandStatusComposition & {
      onModuleInit(): Promise<unknown>; beforeApplicationShutdown(): Promise<void>;
    };
    expect(lifecycle).toBe(f.composition); expect(f.statusTrust).not.toHaveBeenCalled(); expect(f.start).not.toHaveBeenCalled();
    const access = { usesPool: (selected: Pool) => selected === f.pool } as ExecutionAccessService;
    const service = provider(module, ExecutionCommandService).useFactory(f.pool, access, config);
    expect(service).toBeInstanceOf(ExecutionCommandService);
    expect(f.statusTrust).toHaveBeenCalledExactlyOnceWith(access, explicit ? base : unqualifiedCommandTrust, deps.currentHumanMutations);
    expect(f.start).not.toHaveBeenCalled(); await lifecycle.onModuleInit();
    expect(f.start).toHaveBeenCalledExactlyOnceWith(prepared.listeners);
    await lifecycle.beforeApplicationShutdown(); expect(f.shutdown).toHaveBeenCalledOnce(); expect(f.pool.end).not.toHaveBeenCalled();
    expect(f.pool.connect).not.toHaveBeenCalled();
  });
  it("propagates exact listener start and drain failures without closing the shared pool", async () => {
    const f = fixture(), prepared = await prepareCommandStatusApplication(f.pool, f.runtime), deps = dependencies(f, prepared);
    const module = AppModule.register(reviewConfig(), f.pool, undefined, deps);
    const lifecycle = provider(module, CommandStatusComposition).useFactory() as CommandStatusComposition & {
      onModuleInit(): Promise<unknown>; beforeApplicationShutdown(): Promise<void>;
    };
    const startError = Error("TEST_ONLY-listener-refused"), drainError = Error("TEST_ONLY-status-drain-pending");
    f.start.mockRejectedValue(startError); f.shutdown.mockRejectedValue(drainError);
    await expect(lifecycle.onModuleInit()).rejects.toBe(startError);
    await expect(lifecycle.beforeApplicationShutdown()).rejects.toBe(drainError);
    expect(f.pool.end).not.toHaveBeenCalled(); expect(f.pool.connect).not.toHaveBeenCalled();
  });
  it("requires the native owner and one exact shared pool profile for STATUS and every sibling", () => {
    const f = fixture(), status = f.runtime;
    expect(selectPrivateCorePoolProfile()).toBeUndefined();
    expect(() => selectPrivateCorePoolProfile(undefined, undefined, undefined, status)).toThrow("PRIVATE_RUNTIME_SHARED_NATIVE_COMPOSITION_REQUIRED");
    expect(selectPrivateCorePoolProfile({ poolProfile: status.poolProfile }, undefined, undefined, status)).toBe(status.poolProfile);
    for (const field of Object.keys(status.poolProfile) as (keyof CorePoolProfile)[]) {
      const changed = { poolProfile: { ...status.poolProfile, [field]: status.poolProfile[field] + 1 } };
      expect(() => selectPrivateCorePoolProfile(changed, undefined, undefined, status)).toThrow("PRIVATE_RUNTIME_CORE_POOL_PROFILE_MISMATCH");
      expect(() => selectPrivateCorePoolProfile({ poolProfile: status.poolProfile }, changed, undefined, status))
        .toThrow("PRIVATE_RUNTIME_CORE_POOL_PROFILE_MISMATCH");
    }
    expect(f.start).not.toHaveBeenCalled(); expect(f.pool.connect).not.toHaveBeenCalled();
  });
});
