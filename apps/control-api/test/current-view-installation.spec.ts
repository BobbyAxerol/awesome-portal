/** TEST_ONLY DI/lifecycle assembly. No DB, upstream, grants or listener is
 * qualified by this test; actual TLS and SQL tests are separate files. */
import "reflect-metadata";
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
import type { PreparedCurrentViewRuntime } from "../src/execution-v2/current-view-runtime";

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
  });
  it("injects the existing real identity and read-scope providers, not replacements", () => {
    expect(provider(runtime())!.inject).toEqual([AuthService, ExecutionReadScopes]);
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
