/** TEST_ONLY. REAL prepareNativeCoreRuntime + composeOwnedNativeCoreRuntime + the
 * actual AppModule consumer factory (Nest DI) over real temp leaves/keys and a
 * fake Pool. Proves, BY REFERENCE, that the process that serves holds ONE Pool,
 * ONE trust chain, ONE mutation coordinator and ONE recovery/admission registry,
 * and that a second composition (e.g. the offline policy installer) shares none
 * of them. No database, TLS handshake, source call, policy install or owner file. */
import "reflect-metadata";
import { createHash } from "node:crypto";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { exportPKCS8, generateKeyPair } from "jose";
import { NestFactory } from "@nestjs/core";
import type { FactoryProvider } from "@nestjs/common";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AppModule } from "../src/app.module";
import type { ControlApiConfig } from "../src/config";
import { composeOwnedNativeCoreRuntime } from "../src/execution-v2/native-core-bootstrap";
import { prepareNativeCoreRuntime } from "../src/execution-v2/native-core-runtime";
import { NativeManagerReadConsumer } from "../src/execution-v2/native-manager-consumer";
import { MaximumDataOperationService } from "../src/execution/maximum-data-operation.service";
import { ExecutionReadScopes } from "../src/execution-v2/read-scope";
import { ExecutionProfileProjectionRepository } from "../src/execution/profile-projection.repository";
import { CONTROL_API_CONFIG } from "../src/tokens";

const raw = (c: string) => c.repeat(64), sha = (s: string) => createHash("sha256").update(s).digest("hex");
let root: string, manifest: { path: string; sha256: string };
const A = "TEST_ONLY-subject", W = "TEST_ONLY-workspace", I = "TEST_ONLY-human", WL = "TEST_ONLY-pm";
const domain = { profile_id: "PAPER_BINANCE_USDM", catalogue_sha256: raw("a"), profile_sha256: raw("b"), field_policy_sha256: raw("c") };
const selector = { portal_user_id: A, human_issuer: I, subject: A, workspace_id: W, environment: "paper" as const, domain };
const target = { database_name: "TEST_ONLY-core", role_name: "TEST_ONLY-runtime", database_system_identifier: "7675333655652302882" };

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "TEST_ONLY-core009-identity-")); await chmod(root, 0o700);
  const leaf = async (name: string, bytes: string) => { const path = join(root, name);
    await writeFile(path, bytes, { mode: 0o600 }); await chmod(path, 0o600); return { path, sha256: sha(bytes) }; };
  const pem = await exportPKCS8((await generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true })).privateKey);
  const human = await leaf("human.key", pem), terminal = await leaf("terminal.key", pem);
  const ca = await leaf("ca", "TEST_ONLY-CA"), cert = await leaf("cert", "TEST_ONLY-CERT"), key = await leaf("key", "TEST_ONLY-KEY");
  const now = Date.now(), until = now + 120_000;
  const value = { schema_version: "portal.native-core-runtime.v1", pool_profile: { max: 2, connectionTimeoutMillis: 1000,
    statement_timeout: 2000, query_timeout: 3000, idle_in_transaction_session_timeout: 2000 },
    composition: { expected_workload_id: WL, retained_recovery: [], selections: [{ selector, config: { issuer: I, audience: "TEST_ONLY-pm",
      key_id: "TEST_ONLY-kid", private_key_ref: human, limits: { ttl_ms: 10000, maximum_unresolved: 4, maximum_retained: 32 },
      installation_scope: { workspace_id: W, environment: "paper", valid_until_ms: until },
      terminal: { issuer: "TEST_ONLY-t", audience: "TEST_ONLY-pm-t", key_id: "TEST_ONLY-tkid", private_key_ref: terminal, ttl_seconds: 30 },
      egress: { maximum_response_bytes: 1048576, maximum_inflight: 2, send_timeout_ms: 1000, quiesce_timeout_ms: 1000 },
      selected_source: { transport: { origin: "https://10.70.0.2:28446", tls: { ca_ref: ca, cert_ref: cert, key_ref: key },
        pm_leaf_sha256: "sha256:" + raw("f"), workload_id: WL, deadline_ms: 1000, request_bytes: 32768, response_bytes: 32768, max_inflight: 1 },
        installation_expires_at_utc_ms: until, pins: { binding: { human_issuer: I, subject: A, workspace_id: W, environment: "paper", workload_id: WL },
          domain, human: { issuer: I, subject: A, portal_user_id: A, ts_user_id: "33333333-3333-3333-3333-333333333333",
            mapping_revision: "ts-user:33333333-3333-3333-3333-333333333333:1" },
          native: { revision: "2", receipt_id: "44444444-4444-4444-4444-444444444444", receipt_digest: "sha256:" + raw("1"),
            document_digest: "sha256:" + raw("2"), policy_revision: "1", owner_mapping_revision: "ts-user:33333333-3333-3333-3333-333333333333:1",
            semantic_revision: "sha256:" + raw("3"), effective_from: new Date(now - 1000).toISOString(), expires_at: new Date(until).toISOString() },
          source_fingerprint: raw("e") } } } }],
      owner_intakes: [{ artifact_path: join(root, "NEVER-CREATED-owner.json"), approved_sha256: raw("8"),
        target: { ...target, protected_owner_user_id: "TEST_ONLY-owner", workspace_id: W, principal_workspace_pins: [{ user_id: A, workspace_id: W }] },
        intake_not_before_ms: now - 1000, intake_not_after_ms: until }], mutation_limits: { maximum_intents: 64, maximum_recoveries_per_request: 8 } } };
  manifest = await leaf("runtime.json", JSON.stringify(value));
});
afterAll(async () => { await rm(root, { recursive: true, force: true }); });
function fakePool() {
  const query = vi.fn(async () => ({ rowCount: 1, rows: [{ ...target, session_role_name: target.role_name }] }));
  const end = vi.fn(async () => undefined), connect = vi.fn(async () => { throw Error("TEST_ONLY-unexpected-connect"); });
  return { pool: { options: { connectionTimeoutMillis: 1000, query_timeout: 3000 }, query, end, connect } as unknown as Pool, query, end, connect };
}
async function consumerOf(pool: Pool, deps: Awaited<ReturnType<typeof composeOwnedNativeCoreRuntime>>, operations: MaximumDataOperationService) {
  const provider = AppModule.register({ NODE_ENV: "test" } as ControlApiConfig, pool, undefined, deps).providers?.find(
    (p): p is FactoryProvider => !!p && typeof p === "object" && "provide" in p && p.provide === NativeManagerReadConsumer && "useFactory" in p);
  if (!provider) throw Error("TEST_ONLY-missing-native-provider");
  const forbidden = () => { throw Error("TEST_ONLY-unused"); };
  class Host {}
  return NestFactory.createApplicationContext({ module: Host, exports: [NativeManagerReadConsumer], providers: [
    { provide: MaximumDataOperationService, useValue: operations }, { provide: ExecutionReadScopes, useValue: { authorizeManagerNativeStream: vi.fn(forbidden) } },
    { provide: ExecutionProfileProjectionRepository, useValue: { snapshotMetadata: vi.fn(forbidden) } },
    { provide: CONTROL_API_CONFIG, useValue: {} as ControlApiConfig }, provider] }, { logger: false, abortOnError: false });
}

describe("TEST_ONLY serving composition: one Pool / trust / coordinator / registry, by reference", () => {
  it("the dependencies handed to AppModule ARE the composition's own objects, bound to the one Pool", async () => {
    const db = fakePool(), prepared = await prepareNativeCoreRuntime(manifest);
    const deps = await composeOwnedNativeCoreRuntime(prepared, db.pool);
    const composition = deps.nativeManagerRead!;
    expect(deps.executionAccessTrust).toBe(composition.dependencies.executionAccessTrust);
    expect(deps.currentHumanMutations).toBe(composition.dependencies.currentHumanMutations);
    expect(deps.currentHumanMutations!.usesPool(db.pool)).toBe(true);
    const candidate = composition.selectedCandidate(selector);
    expect(candidate.usesPool(db.pool)).toBe(true);
    expect(composition.selectedCandidate(selector)).toBe(candidate); // one registry entry, not rebuilt per call
    expect(db.connect).not.toHaveBeenCalled(); expect(db.end).not.toHaveBeenCalled();
    expect(db.query).toHaveBeenCalledOnce(); // only the read-only target identity query
  });
  it("only an exactly selected person/profile reaches a Candidate; anything else is refused, never created", async () => {
    const db = fakePool(), deps = await composeOwnedNativeCoreRuntime(await prepareNativeCoreRuntime(manifest), db.pool);
    const composition = deps.nativeManagerRead!;
    for (const wrong of [{ ...selector, subject: "TEST_ONLY-other" }, { ...selector, environment: "live" as const },
      { ...selector, workspace_id: "TEST_ONLY-other" }, { ...selector, domain: { ...domain, profile_sha256: raw("9") } }])
      expect(() => composition.selectedCandidate(wrong)).toThrow();
  });
  it("the actual AppModule consumer factory accepts this composition on this Pool and refuses another Pool", async () => {
    const db = fakePool(), other = fakePool(), deps = await composeOwnedNativeCoreRuntime(await prepareNativeCoreRuntime(manifest), db.pool);
    const operations = { prepareNativeManagerPage: vi.fn(), deploymentPage: vi.fn() } as unknown as MaximumDataOperationService;
    const context = await consumerOf(db.pool, deps, operations);
    try { expect(context.get(NativeManagerReadConsumer).uses(db.pool, operations)).toBe(true); } finally { await context.close(); }
    expect(() => AppModule.register({ NODE_ENV: "test" } as ControlApiConfig, other.pool, undefined, deps)).toThrow("CURRENT_HUMAN_MUTATION_CORE_POOL_REQUIRED");
    expect(operations.prepareNativeManagerPage).not.toHaveBeenCalled();
  });
  it("a SECOND composition (the offline installer, or a restarted process) shares no registry, coordinator or trust with the first", async () => {
    const prepared = await prepareNativeCoreRuntime(manifest), a = fakePool(), b = fakePool();
    const first = await composeOwnedNativeCoreRuntime(prepared, a.pool), second = await composeOwnedNativeCoreRuntime(prepared, b.pool);
    expect(second.currentHumanMutations).not.toBe(first.currentHumanMutations);
    expect(second.executionAccessTrust).not.toBe(first.executionAccessTrust);
    expect(second.nativeManagerRead!.selectedCandidate(selector)).not.toBe(first.nativeManagerRead!.selectedCandidate(selector));
    expect(second.currentHumanMutations!.usesPool(a.pool)).toBe(false);
    // The first composition's consumer binding is not transferable to the second.
    const operations = {} as MaximumDataOperationService;
    await expect(consumerOf(a.pool, { ...second, currentHumanMutations: first.currentHumanMutations }, operations)
      .then(context => context.close())).rejects.toThrow();
  });
  it("composition never reads or installs the owner artifact (it is offline-only)", async () => {
    const db = fakePool(), deps = await composeOwnedNativeCoreRuntime(await prepareNativeCoreRuntime(manifest), db.pool);
    // The configured owner file was never created; composing succeeded, so nothing opened it, and the
    // only Core statement issued was the read-only physical-target identity query (no policy install).
    expect(typeof deps.nativeManagerRead!.installOwnerPolicies).toBe("function");
    expect(db.connect).not.toHaveBeenCalled();
    expect(db.query.mock.calls.every(([sql]) => /pg_control_system\(\)/.test(String(sql)))).toBe(true);
  });
});
