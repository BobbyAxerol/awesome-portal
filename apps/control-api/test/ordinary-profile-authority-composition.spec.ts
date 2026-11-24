/** TEST_ONLY: actual AppModule registration and read-scope Nest provider, with
 * an actual coordinator instance but scripted unused candidate/recovery ports.
 * Proves conditional mounting and object provenance, not source qualification,
 * a running HTTP listener, installed authority or a real database connection. */
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { DynamicModule, FactoryProvider, ValueProvider } from "@nestjs/common";
import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { AppModule } from "../src/app.module";
import type { ControlApiConfig } from "../src/config";
import { ExecutionAccessService } from "../src/execution-v2/access.service";
import { CurrentHumanMutations } from "../src/execution-v2/current-human-mutations";
import { OrdinaryProfileAuthority } from "../src/execution-v2/ordinary-profile-authority";
import { OrdinaryProfileAuthorityController } from "../src/execution-v2/ordinary-profile-authority.controller";
import { ExecutionReadScopes } from "../src/execution-v2/read-scope";
import { CONTROL_API_CONFIG, CONTROL_API_POOL } from "../src/tokens";

const config = { NODE_ENV: "test" } as ControlApiConfig;
const refusal = "ORDINARY_PROFILE_AUTHORITY_CORE_COMPOSITION_REQUIRED";
function fixture() {
  const query = vi.fn(async () => { throw new Error("TEST_ONLY_UNEXPECTED_QUERY"); });
  const connect = vi.fn(async () => { throw new Error("TEST_ONLY_UNEXPECTED_CONNECT"); });
  const pool = { query, connect } as unknown as Pool;
  const coordinator = () => new CurrentHumanMutations(pool, { usesPool: (other: Pool) => other === pool } as never,
    { recover: async () => { throw new Error("TEST_ONLY_UNEXPECTED_RECOVERY"); } },
    { maximum_intents: 8, maximum_recoveries_per_request: 1 });
  const mutations = coordinator(), authority = new OrdinaryProfileAuthority(pool, mutations);
  return { pool, query, connect, coordinator, mutations, authority };
}
function ordinaryProvider(module: DynamicModule): ValueProvider | undefined {
  return module.providers?.find((p): p is ValueProvider => !!p && typeof p === "object" &&
    "provide" in p && p.provide === OrdinaryProfileAuthority && "useValue" in p);
}
function readProvider(module: DynamicModule): FactoryProvider {
  const provider = module.providers?.find((p): p is FactoryProvider => !!p && typeof p === "object" &&
    "provide" in p && p.provide === ExecutionReadScopes && "useFactory" in p);
  if (!provider) throw new Error("TEST_ONLY_MISSING_READ_PROVIDER");
  return provider;
}

describe("ordinary authority explicit private composition, TEST_ONLY", () => {
  it("does not mount a writer controller/provider by default or from test-only legacy authority", () => {
    const f = fixture();
    for (const dependencies of [{}, { allowTestOnlyExecutionAccess: true }]) {
      const module = AppModule.register(config, f.pool, undefined, dependencies);
      expect(module.controllers).not.toContain(OrdinaryProfileAuthorityController);
      expect(ordinaryProvider(module)).toBeUndefined();
    }
    expect(f.query).not.toHaveBeenCalled(); expect(f.connect).not.toHaveBeenCalled();
  });
  it("mounts only the supplied genuine same-pool/same-coordinator authority and injects that exact object", async () => {
    const f = fixture();
    const module = AppModule.register(config, f.pool, undefined,
      { ordinaryProfileAuthority: f.authority, currentHumanMutations: f.mutations });
    expect(module.controllers?.filter(c => c === OrdinaryProfileAuthorityController)).toHaveLength(1);
    const authority = ordinaryProvider(module)!;
    expect(authority.useValue).toBe(f.authority);
    class Host {}
    const context = await NestFactory.createApplicationContext({ module: Host, providers: [
      { provide: CONTROL_API_POOL, useValue: f.pool },
      { provide: CONTROL_API_CONFIG, useValue: config },
      { provide: ExecutionAccessService, useValue: {} }, authority, readProvider(module),
    ] }, { logger: false, abortOnError: false });
    try {
      expect(context.get(OrdinaryProfileAuthority)).toBe(f.authority);
      // Runtime identity of the actual AppModule factory's private dependency;
      // no imitation constructor or synthetic controller declaration is used.
      const scopes = context.get(ExecutionReadScopes) as unknown as { ordinary: OrdinaryProfileAuthority };
      expect(scopes.ordinary).toBe(f.authority);
      expect(scopes.ordinary.usesPool(f.pool)).toBe(true);
      expect(scopes.ordinary.usesCoordinator(f.mutations)).toBe(true);
    } finally { await context.close(); }
    expect(f.query).not.toHaveBeenCalled(); expect(f.connect).not.toHaveBeenCalled();
  });
  it("refuses missing, different-coordinator or different-pool compositions", () => {
    const f = fixture(), other = fixture();
    for (const dependencies of [
      { ordinaryProfileAuthority: f.authority },
      { ordinaryProfileAuthority: f.authority, currentHumanMutations: f.coordinator() },
      { ordinaryProfileAuthority: other.authority, currentHumanMutations: f.mutations },
    ]) expect(() => AppModule.register(config, f.pool, undefined, dependencies)).toThrow(refusal);
    expect(f.query).not.toHaveBeenCalled(); expect(f.connect).not.toHaveBeenCalled();
    expect(other.query).not.toHaveBeenCalled(); expect(other.connect).not.toHaveBeenCalled();
  });
  it("rejects duck-typed and prototype-copied authorities despite claimed pool/coordinator matches", () => {
    const f = fixture();
    const duck = { usesPool: () => true, usesCoordinator: () => true };
    const copy = Object.assign(Object.create(OrdinaryProfileAuthority.prototype), f.authority);
    for (const authority of [duck, copy]) expect(() => AppModule.register(config, f.pool, undefined,
      { ordinaryProfileAuthority: authority as OrdinaryProfileAuthority, currentHumanMutations: f.mutations })).toThrow(refusal);
    expect(f.query).not.toHaveBeenCalled(); expect(f.connect).not.toHaveBeenCalled();
  });
  it("does not accept a genuine authority after its mutable instance fields are rebound", () => {
    const f = fixture(), other = fixture();
    Object.assign(f.authority, { pool: other.pool, mutations: other.mutations });
    expect(() => AppModule.register(config, other.pool, undefined,
      { ordinaryProfileAuthority: f.authority, currentHumanMutations: other.mutations })).toThrow(refusal);
    expect(f.query).not.toHaveBeenCalled(); expect(other.query).not.toHaveBeenCalled();
  });
});
