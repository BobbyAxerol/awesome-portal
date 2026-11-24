/** Pure private-installation/selection vectors. Synthetic commissioning is NOT
 * source qualification, runtime installation or an owner authority receipt. */
import "reflect-metadata";
import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveManagerProfile, validateManagerProfileRegistry, type ManagerProfileRegistry } from "../src/execution-v2/manager-profile-registry";
import { ExecutionManagerRuntime, type ManagerRuntimePartition } from "../src/execution-v2/manager-runtime";
import { ManagerProjectionConsumer } from "../src/execution-v2/manager-consumer";
import { unqualifiedAccessTrust } from "../src/execution-v2/access-trust";
import { loadPublicationCommissioning } from "../src/execution-v2/publication-adapter";
import { EXECUTION_PUBLICATION_CATALOGUE } from "../src/execution-v2/publication-source.generated";
import { ManagerModelRepository } from "../src/execution-v2/manager-model.store";
import type { ManagerModelDocument } from "../src/execution-v2/manager-model.contract";

const scopes = [
  { workspace_id: "TEST_ONLY:workspace", environment: "paper" as const, profile_id: "TEST_ONLY:paper-default" },
  { workspace_id: "TEST_ONLY:workspace", environment: "paper" as const, profile_id: "TEST_ONLY:paper-second" },
  { workspace_id: "TEST_ONLY:workspace", environment: "sandbox" as const, profile_id: "TEST_ONLY:sandbox" },
  { workspace_id: "TEST_ONLY:workspace", environment: "live" as const, profile_id: "TEST_ONLY:live" },
];
const bounds = { maximum_documents_per_tick: 2, maximum_document_bytes: 1024, maximum_document_rows: 10,
  maximum_tick_ms: 2000, source_timeout_ms: 1000, transaction_timeout_ms: 1000, lease_ttl_ms: 2000 };
const partitions = () => scopes.map(scope => ({ scope: { ...scope }, bounds: { ...bounds } }));
const registry = (): ManagerProfileRegistry => ({ schema_version: "portal.manager-profile-registry.v1", partitions: scopes.map(scope => ({ ...scope })),
  aggregate_budget: { maximum_documents_per_tick: 8, maximum_document_bytes_per_tick: 8192,
    maximum_document_rows_per_tick: 80, maximum_tick_ms: 8000, maximum_calculation_tasks_per_tick: 0 } });
function runtimePartition(scope: typeof scopes[number]): ManagerRuntimePartition {
  const now = Date.now(), artifact = { schema_version: "portal.execution.publication-commissioning.v1", scope,
    catalogue_digest: EXECUTION_PUBLICATION_CATALOGUE.source_catalogue_digest, adapter_id: "TEST_ONLY:registry-source",
    family_ids: ["alpha_fleet_overview"], purposes: ["BUSINESS"], receipt_pins: {
      source_read: "TEST_ONLY:read", transport_trust: "TEST_ONLY:transport", privacy: "TEST_ONLY:privacy", field_policy: "TEST_ONLY:fields" } };
  const bytes = JSON.stringify(artifact);
  const commissioning = loadPublicationCommissioning(bytes, { artifact_sha256: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
    adapter_id: artifact.adapter_id, approval_ref: "TEST_ONLY:NOT-APPROVAL", approved_at_ms: now - 1000, valid_until_ms: now + 60_000 }, now);
  return { scope, bounds, commissioning, source: { read: vi.fn(async () => null), recheck: vi.fn(async () => ({})), acknowledge: vi.fn(async () => {}) },
    publication: vi.fn(async () => null) };
}
const pool = () => ({ options: { connectionTimeoutMillis: 1000, query_timeout: 1000 }, query: vi.fn() }) as unknown as Pool;
afterEach(() => vi.restoreAllMocks());

describe("bounded exact-tuple Manager profile registry", () => {
  it("preserves unregistered legacy <=3, but four require an explicit registry", () => {
    expect(() => validateManagerProfileRegistry(partitions().slice(0, 3))).not.toThrow();
    expect(() => validateManagerProfileRegistry(partitions())).toThrow("MANAGER_RUNTIME_PROFILE_REGISTRY_INVALID");
    expect(() => validateManagerProfileRegistry(partitions(), registry())).not.toThrow();
  });
  it("checks the exact set independent of order", () => {
    expect(() => validateManagerProfileRegistry(partitions().reverse(), registry())).not.toThrow();
    const r = registry(); r.partitions[1].workspace_id = "TEST_ONLY:other-workspace";
    expect(() => validateManagerProfileRegistry(partitions(), r)).toThrow("MANAGER_RUNTIME_PROFILE_REGISTRY_INVALID");
  });
  it("rejects duplicate registry tuples, duplicate actual tuples, missing and extra profiles", () => {
    const r = registry(); r.partitions[1] = { ...r.partitions[0] };
    expect(() => validateManagerProfileRegistry(partitions(), r)).toThrow();
    const p = partitions(); p[1] = { ...p[0] };
    expect(() => validateManagerProfileRegistry(p, registry())).toThrow();
    expect(() => validateManagerProfileRegistry(partitions().slice(0, 3), registry())).toThrow();
    expect(() => validateManagerProfileRegistry([...partitions(), { ...partitions()[0], scope: { ...scopes[0], profile_id: "TEST_ONLY:fifth" } }], registry())).toThrow();
  });
  it.each(["maximum_documents_per_tick", "maximum_document_bytes_per_tick", "maximum_document_rows_per_tick", "maximum_tick_ms"] as const)(
    "refuses an insufficient aggregate %s before any source/DB work", name => {
      const r = registry(); r.aggregate_budget[name]--;
      expect(() => validateManagerProfileRegistry(partitions(), r)).toThrow("MANAGER_RUNTIME_PROFILE_REGISTRY_INVALID");
    });
  it("counts per-document task multiplication across every partition", () => {
    const p = partitions().map(value => ({ ...value, score: { maximum_tasks_per_revision: 2 }, composition: { maximum_tasks_per_revision: 1 } }));
    const r = registry(); r.aggregate_budget.maximum_calculation_tasks_per_tick = 23;
    expect(() => validateManagerProfileRegistry(p, r)).toThrow();
    r.aggregate_budget.maximum_calculation_tasks_per_tick = 24;
    expect(() => validateManagerProfileRegistry(p, r)).not.toThrow();
  });
  it.each(["recalculation", "restatement", "historical"] as const)(
    "refuses unaccounted %s work with a registry, without changing legacy <=3", extension => {
      const p = partitions().map(value => ({ ...value, ...(extension === "historical"
        ? { regime: { maximum_tasks_per_revision: 1, historical: {} } }
        : { score: { maximum_tasks_per_revision: 1, [extension]: {} } }) }));
      const r = registry(); r.aggregate_budget.maximum_calculation_tasks_per_tick = 8;
      expect(() => validateManagerProfileRegistry(p, r)).toThrow("MANAGER_RUNTIME_PROFILE_REGISTRY_INVALID");
      expect(() => validateManagerProfileRegistry(p.slice(0, 3), { ...r, partitions: r.partitions.slice(0, 3) })).toThrow("MANAGER_RUNTIME_PROFILE_REGISTRY_INVALID");
      expect(() => validateManagerProfileRegistry(p.slice(0, 3))).not.toThrow();
    });
  it("rejects unbounded/non-integer budgets and NaN work contributions", () => {
    const r = registry(); r.aggregate_budget.maximum_document_bytes_per_tick = Infinity;
    expect(() => validateManagerProfileRegistry(partitions(), r)).toThrow();
    const p = partitions(); p[0].bounds.maximum_documents_per_tick = NaN;
    expect(() => validateManagerProfileRegistry(p, registry())).toThrow();
  });
  it("constructs four independently commissioned partitions with detached inventory and no source/DB I/O", async () => {
    const p = scopes.map(runtimePartition), db = pool(), r = registry();
    const runtime = new ExecutionManagerRuntime(db, { trust: unqualifiedAccessTrust, partitions: p, profile_registry: r,
      cadence_ms: 1000, maximum_publication_reads: 1 });
    expect(runtime.status()).toMatchObject({ state: "READY", partitions: 4, automatic_loop: false });
    expect(runtime.profilesFor(scopes[0].workspace_id, "paper")).toEqual([scopes[0].profile_id, scopes[1].profile_id]);
    expect(runtime.profilesFor("TEST_ONLY:other-workspace", "paper")).toEqual([]);
    p[0].scope = { ...scopes[0], profile_id: "TEST_ONLY:mutated" };
    expect(runtime.profilesFor(scopes[0].workspace_id, "paper")).toEqual([scopes[0].profile_id, scopes[1].profile_id]);
    expect(db.query).not.toHaveBeenCalled(); p.forEach(value => expect(value.source.read).not.toHaveBeenCalled());
    await runtime.beforeApplicationShutdown();
  });
  it("retains one serial tick, with no parallel work or duplicate-flight budget multiplication", async () => {
    const order: string[] = []; let active = 0;
    vi.spyOn(ManagerProjectionConsumer.prototype, "tick").mockImplementation(async function () {
      const number = order.length / 2; expect(active++).toBe(0); order.push(`start:${number}`);
      await Promise.resolve(); order.push(`end:${number}`); active--;
      return { state: "IDLE", committed: 0, acknowledged: 0, last_receipt: null };
    });
    const runtime = new ExecutionManagerRuntime(pool(), { trust: unqualifiedAccessTrust, partitions: scopes.map(runtimePartition),
      profile_registry: registry(), cadence_ms: 1000, maximum_publication_reads: 1 });
    const first = runtime.tick(); expect(runtime.tick()).toBe(first); await first;
    expect(order).toEqual(["start:0", "end:0", "start:1", "end:1", "start:2", "end:2", "start:3", "end:3"]);
    await runtime.beforeApplicationShutdown();
  });
  it("cannot authenticate an ordinary domain using a copied descriptor and arbitrary callbacks", () => {
    const p = runtimePartition(scopes[0]); p.ordinary_domain = { environment: "paper", domain: { profile_id: scopes[0].profile_id,
      catalogue_sha256: "a".repeat(64), profile_sha256: "b".repeat(64), field_policy_sha256: "c".repeat(64) }, field_policy_ref: "TEST_ONLY:fields" };
    const db = pool();
    expect(() => new ExecutionManagerRuntime(db, { trust: unqualifiedAccessTrust, partitions: [p], cadence_ms: 1000,
      maximum_publication_reads: 1 })).toThrow("MANAGER_RUNTIME_ORDINARY_DOMAIN_INVALID");
    expect(db.query).not.toHaveBeenCalled(); expect(p.source.read).not.toHaveBeenCalled(); expect(p.publication).not.toHaveBeenCalled();
  });
  it("does not coalesce equal revisions across Paper profiles, workspaces or environments", async () => {
    const repository = new ManagerModelRepository(pool());
    const loader = vi.spyOn(repository as unknown as { loadDocument(workspace:string,environment:string,profile:string,revision:string):Promise<ManagerModelDocument|null> }, "loadDocument")
      .mockImplementation(async (workspace, environment, profile) => {
        await Promise.resolve(); return { workspace_id: workspace, environment, profile_id: profile } as ManagerModelDocument;
      });
    const read = (workspace:string,environment:string,profile:string) => repository.document(workspace,environment,profile,"TEST_ONLY:same-revision");
    const result = await Promise.all([read("w","paper","a"),read("w","paper","a"),read("w","paper","b"),
      read("w","sandbox","a"),read("other","paper","a")]);
    expect(loader).toHaveBeenCalledTimes(4);
    expect(result.map(value => [value!.workspace_id,value!.environment,value!.profile_id])).toEqual([
      ["w","paper","a"],["w","paper","a"],["w","paper","b"],["w","sandbox","a"],["other","paper","a"]]);
    expect(result[0]).not.toBe(result[1]);
  });
});

describe("Manager profile selection is default-pinned, not array order", () => {
  it("omission uses the configured default even when the second Paper is first installed", () => {
    expect(resolveManagerProfile({ defaultProfileId: scopes[0].profile_id, installedProfileIds: [scopes[1].profile_id, scopes[0].profile_id] })).toBe(scopes[0].profile_id);
  });
  it("never selects the first profile when the configured default is missing", () => {
    expect(() => resolveManagerProfile({ installedProfileIds: scopes.slice(0, 2).map(scope => scope.profile_id) })).toThrow("EXECUTION_READ_AUTHORITY_UNAVAILABLE");
    expect(() => resolveManagerProfile({ installedProfileIds: [scopes[1].profile_id] })).toThrow("EXECUTION_READ_AUTHORITY_UNAVAILABLE");
  });
  it("permits only a pinned default or an exact privately installed explicit choice", () => {
    expect(resolveManagerProfile({ defaultProfileId: scopes[0].profile_id, requestedProfileId: scopes[0].profile_id })).toBe(scopes[0].profile_id);
    expect(resolveManagerProfile({ defaultProfileId: scopes[0].profile_id, requestedProfileId: scopes[1].profile_id, installedProfileIds: [scopes[1].profile_id] })).toBe(scopes[1].profile_id);
    expect(() => resolveManagerProfile({ defaultProfileId: scopes[0].profile_id, requestedProfileId: scopes[1].profile_id, installedProfileIds: [] })).toThrow("EXECUTION_READ_NOT_AVAILABLE");
  });
});
