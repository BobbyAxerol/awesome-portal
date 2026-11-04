/** TEST_ONLY DI/lifecycle assembly. No DB, upstream, grants or listener is
 * qualified by this test; actual TLS and SQL tests are separate files. */
import "reflect-metadata";
import { createHash } from "node:crypto";
import type { FactoryProvider } from "@nestjs/common";
import type { Pool } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ instances: [] as { start: ReturnType<typeof vi.fn>; shutdown: ReturnType<typeof vi.fn>;
  inputs: unknown[] }[] }));
vi.mock("../src/execution-v2/current-view-composition", () => ({
  CurrentViewCoreComposition: class {
    start = vi.fn(async () => ({ address: "127.0.0.1", port: 44321 }));
    shutdown = vi.fn(async () => undefined);
    inputs: unknown[];
    constructor(...inputs: unknown[]) { this.inputs = inputs; h.instances.push(this); }
  },
}));
import { AppModule } from "../src/app.module";
import type { ControlApiConfig } from "../src/config";
import { AuthService } from "../src/auth/auth.service";
import { ExecutionReadScopes } from "../src/execution-v2/read-scope";
import { CurrentViewCoreComposition } from "../src/execution-v2/current-view-composition";
import { NativeCurrentAccountScopes } from "../src/execution-v2/native-current-runtime";
import type { PreparedCurrentViewRuntime } from "../src/execution-v2/current-view-runtime";
import { ManagerCurrentAccounts } from "../src/execution-v2/manager-current-accounts";
import { unqualifiedAccessTrust } from "../src/execution-v2/access-trust";
import { loadManagerCurrentCommissioning } from "../src/execution-v2/manager-current-publication";

const config = { NODE_ENV: "test" } as ControlApiConfig, pool = {} as Pool;
const provider = (runtime?: PreparedCurrentViewRuntime) =>
  AppModule.register(config, pool, undefined, runtime ? { currentViewRuntime: runtime } : {}).providers?.find(
    value => typeof value === "object" && value !== null && "provide" in value && value.provide === CurrentViewCoreComposition,
  ) as FactoryProvider | undefined;
const runtime = (): PreparedCurrentViewRuntime => ({
  listener: { host: "127.0.0.1", port: 44321 },
  poolProfile: { max: 2, connectionTimeoutMillis: 1000, statement_timeout: 2000,
    query_timeout: 3000, idle_in_transaction_session_timeout: 2000 },
  config: {
    authority: { ttl_ms: 10000, maximum_contexts: 8 }, shutdown_deadline_ms: 1000,
    transport: { tls: { key: Buffer.from("TEST_ONLY-key"), cert: Buffer.from("TEST_ONLY-cert"), ca: Buffer.from("TEST_ONLY-ca") },
      peer: { workload_id: "TEST_ONLY-Edge", dns_name: "test.invalid", certificate_sha256: `sha256:${"a".repeat(64)}` },
      limits: { deadline_ms: 1000, maximum_in_flight: 2, request_bytes: 8192, response_bytes: 65536 } },
    edge: { origin: "https://test.invalid", tls: { key: Buffer.from("TEST_ONLY-key2"), cert: Buffer.from("TEST_ONLY-cert2"), ca: Buffer.from("TEST_ONLY-ca2") },
      peer: { dns_name: "test.invalid", certificate_sha256: `sha256:${"b".repeat(64)}` },
      limits: { deadline_ms: 1000, maximum_in_flight: 2, response_bytes: 1048576 } },
  },
});
afterEach(() => { h.instances.length = 0; vi.restoreAllMocks(); });
describe("explicit private current-view installation", () => {
  it("does not register a listener provider for the unchanged default", () => {
    expect(provider()).toBeUndefined(); expect(h.instances).toHaveLength(0);
    expect(AppModule.register(config, pool).providers?.some(value => typeof value === "object" && value !== null &&
      "provide" in value && value.provide === ManagerCurrentAccounts)).toBe(false);
  });
  it("registers Account360 only with explicit metadata and the existing identity trust", () => {
    // TEST_ONLY commissioning mechanics. Registration must not query the
    // source; real metadata/source qualification has its separate test lane.
    const request = { workspace_id: "TEST_ONLY-research", environment: "paper" as const, profile_id: "TEST_ONLY-paper",
      binding: { dataset_id: "manager-current:ACCOUNT", source_revision: "TEST_ONLY-cycle",
        projection_generation: "TEST_ONLY-generation", catalogue_revision: "TEST_ONLY-catalogue", window: null } };
    const bytes = Buffer.from(JSON.stringify({ schema_version: "portal.execution.manager-current-commissioning.v1",
      scope: { workspace_id: request.workspace_id, environment: request.environment, profile_id: request.profile_id },
      binding: request.binding, source_workspace_id: "TEST_ONLY-physical", adapter_revision: "TEST_ONLY-adapter",
      source_metadata_digest: `sha256:${"a".repeat(64)}`, receipt_pins: { source_read: "TEST_ONLY-source",
        transport_trust: "TEST_ONLY-trust", privacy: "TEST_ONLY-privacy", field_policy: "TEST_ONLY-fields" } }));
    const now = Date.now();
    const selected: PreparedCurrentViewRuntime = { ...runtime(), managerCurrent: {
      request, commissioning: loadManagerCurrentCommissioning(bytes, {
        artifact_sha256: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
        approval_ref: "TEST_ONLY-approval", approved_at_ms: now, valid_until_ms: now + 60_000,
      }, now), source: vi.fn(async () => null),
    } };
    expect(() => AppModule.register(config, pool, undefined, { currentViewRuntime: selected }))
      .toThrow("MANAGER_CURRENT_IDENTITY_TRUST_REQUIRED");
    const providers = AppModule.register(config, pool, undefined, { currentViewRuntime: selected,
      executionAccessTrust: unqualifiedAccessTrust }).providers!;
    const current = providers.find(value => typeof value === "object" && value !== null &&
      "provide" in value && value.provide === ManagerCurrentAccounts) as FactoryProvider;
    expect(current.inject).toEqual([CurrentViewCoreComposition]);
    expect(current.useFactory({ read: vi.fn(), deliver: vi.fn() })).toBeInstanceOf(ManagerCurrentAccounts);
    expect(selected.managerCurrent!.source).not.toHaveBeenCalled();
  });
  it("injects the existing real identity and read-scope providers, not replacements", () => {
    expect(provider(runtime())!.inject).toEqual([AuthService, ExecutionReadScopes,
      { token: NativeCurrentAccountScopes, optional: true }]);
  });
  it("starts only at module init and drains in the pre-pool shutdown lifecycle", async () => {
    const selected = runtime(), identity = {} as AuthService, scopes = {} as ExecutionReadScopes;
    const service = provider(selected)!.useFactory(identity, scopes);
    expect(h.instances).toHaveLength(1);
    expect(h.instances[0]!.inputs.slice(0, 2)).toEqual([identity, scopes]);
    expect(service.start).not.toHaveBeenCalled();
    await service.onModuleInit(); expect(service.start).toHaveBeenCalledWith(selected.listener);
    await service.beforeApplicationShutdown(); expect(service.shutdown).toHaveBeenCalledOnce();
    // Wipe loader-owned material after the constructor's own copies are made.
    for (const tls of [selected.config.transport.tls, selected.config.edge.tls])
      for (const value of [tls.key, tls.cert, tls.ca]) expect(Buffer.from(value).every(n => n === 0)).toBe(true);
  });
  it("does not pretend a pending private drain succeeded", async () => {
    const service = provider(runtime())!.useFactory({} as AuthService, {} as ExecutionReadScopes);
    service.shutdown.mockRejectedValueOnce(new Error("CURRENT_VIEW_COMPOSITION_SHUTDOWN_PENDING"));
    await expect(service.beforeApplicationShutdown()).rejects.toThrow("CURRENT_VIEW_COMPOSITION_SHUTDOWN_PENDING");
  });
});
