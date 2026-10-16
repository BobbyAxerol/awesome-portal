/** Disposable PostgreSQL component evidence only. Publications/receipts are
 * explicit TEST_ONLY fixtures, not source transport/runtime qualification. */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { accessDigest } from "../src/execution-v2/access-policy";
import type { DatasetPublication } from "../src/execution-v2/publication.contract";
import { EXECUTION_PUBLICATION_CATALOGUE } from "../src/execution-v2/publication-source.generated";
import type { ManagerModelDocument } from "../src/execution-v2/manager-model.contract";
import { ManagerModelRepository, persistManagerProjection, prepareManagerProjection,
  type PreparedManagerProjection } from "../src/execution-v2/manager-model.store";
import { EXECUTION_STORE_VERSION, migrateExecutionStore } from "../src/execution/store-schema";
import { ExecutionProfileProjectionRepository, type ProfileProjectionDocument } from "../src/execution/profile-projection.repository";

const contracts = process.env.PORTAL_CONTRACTS_DIR ?? resolve(__dirname, "../../../packages/contracts");
const migration = readFileSync(resolve(__dirname, "../migrations/1723680000135_execution-manager-models.sql"), "utf8").split("-- Down Migration")[0];
const clock = Date.now();
const tuple = { alpha_id: "TEST_ONLY:alpha", alpha_version_id: "TEST_ONLY:av1", portfolio_id: "TEST_ONLY:portfolio",
  deployment_id: "TEST_ONLY:deployment", account_id: "TEST_ONLY:account" };

function document(): ManagerModelDocument {
  return { schema_version: "portal.execution.manager-model-input.v1", workspace_id: "TEST_ONLY:workspace",
    environment: "paper", profile_id: "TEST_ONLY:paper", qualification: "TEST_ONLY", family_id: "alpha_fleet_overview",
    revision: "TEST_ONLY:model-r1", supersedes_revision: null, source_epoch: "TEST_ONLY:epoch1", source_sequence: "9007199254740993",
    projection_generation: "TEST_ONLY:g1", catalogue_digest: EXECUTION_PUBLICATION_CATALOGUE.source_catalogue_digest,
    source_set_digest: accessDigest([tuple]), as_of_ms: clock - 100, recorded_through_ms: clock - 50,
    facts_through_ms: clock - 100, observed_at_ms: clock,
    source_quality: { completeness: "COMPLETE", freshness: "FRESH", reasons: [] },
    members: [{ tuple: { ...tuple }, stage: "PAPER", name: "TEST_ONLY:alpha name", owner_user_id: "TEST_ONLY:research-owner",
      lifecycle: "ACTIVE", venue: "TEST_ONLY:venue", health: "HEALTHY", source_state: "FRESH", binding_ref: "TEST_ONLY:binding",
      assignment_revision: "TEST_ONLY:assignment1", owner_revision: "TEST_ONLY:owner1", binding_revision: "TEST_ONLY:binding1",
      valid_from_ms: clock - 1000, valid_to_ms: null }],
    facts: [{ fact_id: "TEST_ONLY:source-fact1", revision: "TEST_ONLY:fact-r1", source_receipt_ref: "TEST_ONLY:not-economic-authority",
      tuple: { ...tuple }, partition: { economic_domain: "PAPER", currency: "USDT", basis: "TEST_ONLY:net-ledger",
        native_profile_ref: "TEST_ONLY:paper-ledger", domain_proof_ref: "TEST_ONLY:domain" },
      economic_account_ref: "TEST_ONLY:economic-account", ownership_partition_ref: "TEST_ONLY:ownership",
      kind: "net_pnl", effective_at_ms: clock - 100, recorded_at_ms: clock - 50, classification: "ECONOMIC",
      transfer_pair_ref: null, counterpart_portfolio_id: null,
      metric: { value: "100.000000000000000001", unit: "MONEY", currency: "USDT", basis: "TEST_ONLY:net-ledger",
        window: null, denominator: null, methodology_ref: "TEST_ONLY:method", availability: "AVAILABLE", reason_code: null,
        quality: { completeness: "COMPLETE", freshness: "FRESH", reasons: [] }, source_confidence: "VERIFIED",
        provenance_refs: ["TEST_ONLY:source-fact1"], calculation_revision: "TEST_ONLY:calc1", policy_revision: "TEST_ONLY:policy1" } }],
  };
}
function publication(doc: ManagerModelDocument): DatasetPublication {
  const p = JSON.parse(readFileSync(resolve(contracts, "fixtures/execution-dataset-publication.synthetic.valid.json"), "utf8")).value as DatasetPublication;
  return { ...p, family_id: doc.family_id, catalogue_digest: doc.catalogue_digest, environment: doc.environment,
    profile_id: doc.profile_id, issued_at_ms: clock - 2000, expires_at_ms: clock + 60_000,
    source_as_of_ms: doc.as_of_ms, observed_at_ms: clock, history_capability: "CURRENT_ONLY", barrier: null,
    authority: { ...p.authority, workspace_id: doc.workspace_id, environment: doc.environment, profile_id: doc.profile_id,
      publication_revision: `TEST_ONLY:publication-${doc.revision}`,
      binding: { dataset_id: doc.family_id, source_revision: doc.revision, catalogue_revision: doc.catalogue_digest,
        projection_generation: doc.projection_generation, window: null },
      tuples: [{ ...tuple }], resources: [] } };
}
const prepare = (doc: ManagerModelDocument, rebuild?: { expected_revision: string; receipt_ref: string }) =>
  prepareManagerProjection(doc, publication(doc), { nowMs: clock, allowTestOnly: true, rebuild });
function successor(previous: ManagerModelDocument, revision: string): ManagerModelDocument {
  return { ...structuredClone(previous), revision, supersedes_revision: previous.revision,
    source_sequence: (BigInt(previous.source_sequence) + 1n).toString() };
}

describe.skipIf(!process.env.TEST_DATABASE_URL)("ELP2-06 actual PostgreSQL Manager projection transactions (TEST_ONLY)", () => {
  const base = process.env.TEST_DATABASE_URL!;
  const storeDb = `elp206_store_${randomUUID().replaceAll("-", "")}`;
  const migrationDb = `elp206_migration_${randomUUID().replaceAll("-", "")}`;
  const connection = (name: string) => { const url = new URL(base); url.pathname = `/${name}`; return url.toString(); };
  let store: Pool; let fresh: Pool; let repository: ManagerModelRepository;
  const key = ["TEST_ONLY:workspace", "paper", "TEST_ONLY:paper"] as const;
  async function transaction<T>(run: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await store.connect();
    try { await client.query("BEGIN"); const result = await run(client); await client.query("COMMIT"); return result; }
    catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }
  const apply = (prepared: PreparedManagerProjection) => transaction(client => persistManagerProjection(client, prepared));
  const count = async () => Number((await store.query("SELECT count(*)::text AS count FROM execution_manager_model_revisions")).rows[0].count);
  beforeAll(async () => {
    const admin = new Pool({ connectionString: connection("postgres"), max: 1 });
    try { await admin.query(`CREATE DATABASE ${storeDb}`); await admin.query(`CREATE DATABASE ${migrationDb}`); }
    finally { await admin.end(); }
    store = new Pool({ connectionString: connection(storeDb), max: 2 });
    fresh = new Pool({ connectionString: connection(migrationDb), max: 2 });
    repository = new ManagerModelRepository(store);
    await store.query(migration);
  }, 60_000);
  beforeEach(async () => { await store.query("TRUNCATE execution_manager_model_heads,execution_manager_model_revisions"); });
  afterAll(async () => {
    await Promise.all([store?.end(), fresh?.end()]);
    const admin = new Pool({ connectionString: connection("postgres"), max: 1 });
    try {
      for (const name of [storeDb, migrationDb]) {
        if (!/^elp206_(?:store|migration)_[a-f0-9]{32}$/.test(name)) throw new Error("TEST_DATABASE_NAME_INVALID");
        await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      }
    } finally { await admin.end(); }
  }, 60_000);

  it("T06-07 keeps apply and checkpoint invisible until commit; SQL failure rolls both back", async () => {
    const prepared = prepare(document()); const client = await store.connect();
    try {
      await client.query("BEGIN");
      expect(await persistManagerProjection(client, prepared)).toMatchObject({ state: "APPLIED_IN_TRANSACTION" });
      expect(await repository.head(...key)).toBeNull(); expect(await count()).toBe(0);
      await expect(client.query("SELECT 1/0")).rejects.toThrow();
      await client.query("ROLLBACK");
    } finally { client.release(); }
    expect(await repository.head(...key)).toBeNull(); expect(await count()).toBe(0);
    expect(await apply(prepared)).toMatchObject({ state: "APPLIED_IN_TRANSACTION", digest: prepared.digest });
    expect(await repository.head(...key)).toMatchObject({ revision: document().revision, source_sequence: "9007199254740993", payload_digest: prepared.digest });
    expect(await repository.document(...key, document().revision)).toEqual(prepared.document);
  });
  it("T06-01/02 persists exact-decimal facts once, deduping source identity rather than equal values", async () => {
    const doc = document(); doc.facts.push(structuredClone(doc.facts[0]));
    doc.facts.push({ ...structuredClone(doc.facts[0]), fact_id: "TEST_ONLY:distinct-equal-fact" });
    const prepared = prepare(doc); expect(prepared.document.facts).toHaveLength(2);
    await apply(prepared); expect(await apply(prepared)).toMatchObject({ state: "DUPLICATE_CURRENT" });
    expect(await count()).toBe(1);
    const retained = (await repository.document(...key, doc.revision))!;
    expect(retained.facts).toHaveLength(2);
    expect(retained.facts.map(fact => fact.metric.value)).toEqual(["100.000000000000000001", "100.000000000000000001"]);
  });
  it("rejects forged preparation and revision-content conflicts without replacing history/head", async () => {
    const doc = document(); const original = prepare(doc); await apply(original);
    await expect(apply({ ...original } as PreparedManagerProjection)).rejects.toThrow("MANAGER_QUALIFIED_INPUT_REQUIRED");
    doc.facts[0].metric.value = "101";
    await expect(apply(prepare(doc))).rejects.toThrow("MANAGER_REVISION_CONFLICT");
    expect(await count()).toBe(1);
    expect((await repository.document(...key, original.document.revision))!.facts[0].metric.value).toBe("100.000000000000000001");
    expect((await repository.head(...key))!.payload_digest).toBe(original.digest);
  });
  it("T06-07 rejects A→B→A as historical replay, not successful current idempotency", async () => {
    const first = document(); const a = prepare(first); await apply(a);
    const second = successor(first, "TEST_ONLY:model-r2"); second.facts[0].metric.value = "105";
    const b = prepare(second); await apply(b);
    await expect(apply(a)).rejects.toThrow("MANAGER_HISTORICAL_REVISION_NOT_CURRENT");
    expect(await count()).toBe(2); expect((await repository.head(...key))!.revision).toBe(second.revision);
    expect((await repository.document(...key, first.revision))!.facts[0].metric.value).toBe("100.000000000000000001");
    expect((await repository.document(...key, second.revision))!.facts[0].metric.value).toBe("105");
  });
  it("T06-06/12 stores correction as append-only restatement with separate knowledge cutoff", async () => {
    const original = document(); await apply(prepare(original));
    const correction = successor(original, "TEST_ONLY:fee-restatement");
    correction.recorded_through_ms = clock; correction.facts[0].recorded_at_ms = clock - 1;
    correction.facts[0].revision = "TEST_ONLY:fact-r2"; correction.facts[0].metric.value = "99.000000000000000001";
    correction.facts[0].metric.calculation_revision = "TEST_ONLY:calc-corrected";
    const receipt = await apply(prepare(correction)); expect(receipt.state).toBe("APPLIED_IN_TRANSACTION");
    const asPublished = (await repository.document(...key, original.revision))!;
    const restated = (await repository.document(...key, correction.revision))!;
    expect(asPublished).toEqual(original); expect(restated).toEqual(correction);
    expect(restated.supersedes_revision).toBe(asPublished.revision);
    expect(restated.as_of_ms).toBe(asPublished.as_of_ms); expect(restated.recorded_through_ms).toBeGreaterThan(asPublished.recorded_through_ms);
    expect((await repository.head(...key))!.source_sequence).toBe("9007199254740994");
  });
  it("T06-07 refuses checkpoint gaps, wrong predecessor and noninitial initial revision", async () => {
    const initial = document(); const wrongInitial = { ...initial, supersedes_revision: "TEST_ONLY:unknown" };
    await expect(apply(prepare(wrongInitial))).rejects.toThrow("MANAGER_INITIAL_REVISION_INVALID");
    await apply(prepare(initial));
    const gap = successor(initial, "TEST_ONLY:gap"); gap.source_sequence = "9007199254740995";
    await expect(apply(prepare(gap))).rejects.toThrow("MANAGER_CHECKPOINT_GAP");
    const wrong = successor(initial, "TEST_ONLY:wrong-predecessor"); wrong.supersedes_revision = "TEST_ONLY:other";
    await expect(apply(prepare(wrong))).rejects.toThrow("MANAGER_CHECKPOINT_GAP");
    expect(await count()).toBe(1); expect((await repository.head(...key))!.revision).toBe(initial.revision);
  });
  it("T06-08 requires explicit receipt-bound CAS for new generation and preserves old revisions", async () => {
    const initial = document(); await apply(prepare(initial));
    const rebuild = successor(initial, "TEST_ONLY:rebuilt"); rebuild.source_epoch = "TEST_ONLY:epoch2";
    rebuild.projection_generation = "TEST_ONLY:g2"; rebuild.source_sequence = "0";
    await expect(apply(prepare(rebuild))).rejects.toThrow("MANAGER_RESNAPSHOT_REQUIRED");
    expect(() => prepare(rebuild, { expected_revision: "TEST_ONLY:other", receipt_ref: "TEST_ONLY:rebuild-proof" })).toThrow("MANAGER_REBUILD_BINDING_INVALID");
    await apply(prepare(rebuild, { expected_revision: initial.revision, receipt_ref: "TEST_ONLY:rebuild-proof" }));
    expect(await repository.head(...key)).toMatchObject({ revision: rebuild.revision, source_sequence: "0", projection_generation: "TEST_ONLY:g2" });
    expect(await repository.document(...key, initial.revision)).toEqual(initial);
    const receipt = (await store.query("SELECT rebuild_receipt_ref FROM execution_manager_model_revisions WHERE revision=$1", [rebuild.revision])).rows[0];
    expect(receipt.rebuild_receipt_ref).toBe("TEST_ONLY:rebuild-proof");
  });
  it("T06-08 refuses stale rebuild CAS after another generation-independent commit", async () => {
    const initial = document(); await apply(prepare(initial));
    const rebuild = successor(initial, "TEST_ONLY:stale-rebuild"); rebuild.projection_generation = "TEST_ONLY:g2"; rebuild.source_sequence = "0";
    const pending = prepare(rebuild, { expected_revision: initial.revision, receipt_ref: "TEST_ONLY:rebuild-proof" });
    const next = successor(initial, "TEST_ONLY:r2"); await apply(prepare(next));
    await expect(apply(pending)).rejects.toThrow("MANAGER_RESNAPSHOT_REQUIRED");
    const sameGeneration = successor(next, "TEST_ONLY:unneeded-rebuild");
    await expect(apply(prepare(sameGeneration, { expected_revision: next.revision, receipt_ref: "TEST_ONLY:receipt" }))).rejects.toThrow("MANAGER_REBUILD_REQUIRES_NEW_GENERATION");
    expect(await count()).toBe(2); expect((await repository.head(...key))!.revision).toBe(next.revision);
  });
  it("captures qualified input and rebuild receipt before caller/getter mutation", async () => {
    const doc = document(); const source = publication(doc);
    const prepared = prepareManagerProjection(doc, source, { nowMs: clock, allowTestOnly: true });
    doc.facts[0].metric.value = "777"; source.authority.tuples.length = 0;
    const detached = prepared.document; detached.facts[0].metric.value = "888";
    await apply(prepared);
    expect((await repository.document(...key, prepared.document.revision))!.facts[0].metric.value).toBe("100.000000000000000001");
    const next = successor(prepared.document, "TEST_ONLY:captured-rebuild"); next.projection_generation = "TEST_ONLY:g2";
    const options = { expected_revision: prepared.document.revision, receipt_ref: "TEST_ONLY:original-rebuild-receipt" };
    const captured = prepare(next, options); options.receipt_ref = "TEST_ONLY:changed-after-qualification";
    await apply(captured);
    expect((await store.query("SELECT rebuild_receipt_ref FROM execution_manager_model_revisions WHERE revision=$1", [next.revision])).rows[0].rebuild_receipt_ref).toBe("TEST_ONLY:original-rebuild-receipt");
  });
  it("serializes simultaneous duplicate applies with one committed revision/checkpoint", async () => {
    const prepared = prepare(document());
    const result = await Promise.all([apply(prepared), apply(prepared)]);
    expect(result.map(value => value.state).sort()).toEqual(["APPLIED_IN_TRANSACTION", "DUPLICATE_CURRENT"]);
    expect(await count()).toBe(1); expect((await repository.head(...key))!.payload_digest).toBe(prepared.digest);
  });
  it("isolates profile/workspace heads and returns no historical document across their keys", async () => {
    const doc = document(); await apply(prepare(doc));
    const other = { ...structuredClone(doc), workspace_id: "TEST_ONLY:other-workspace", profile_id: "TEST_ONLY:other-profile" };
    await apply(prepare(other));
    expect(await count()).toBe(2);
    expect(await repository.head(doc.workspace_id, doc.environment, other.profile_id)).toBeNull();
    expect(await repository.document(other.workspace_id, other.environment, doc.profile_id, doc.revision)).toBeNull();
    expect((await repository.document(other.workspace_id, other.environment, other.profile_id, other.revision))!.workspace_id).toBe(other.workspace_id);
  });
  it("refuses corrupted stored bytes rather than returning a document under the old digest", async () => {
    const doc = document(); const prepared = prepare(doc); await apply(prepared);
    // Fault injection touches only this disposable database, never an owner source or runtime.
    await store.query("UPDATE execution_manager_model_revisions SET payload=jsonb_set(payload,'{facts,0,metric,value}',to_jsonb($1::text)) WHERE revision=$2", ["777", doc.revision]);
    await expect(repository.document(...key, doc.revision)).rejects.toThrow("MANAGER_PROJECTION_DIGEST_MISMATCH");
    expect((await repository.head(...key))!.payload_digest).toBe(prepared.digest);
  });
  it("T06-08 fresh Execution store applies pinned135 once and reuses frozen131 ledger unchanged", async () => {
    const digest = await migrateExecutionStore(fresh);
    const first = (await fresh.query("SELECT version,digest FROM execution_store_migrations ORDER BY version")).rows;
    expect(first).toHaveLength(2); expect(first.find(row => row.version === EXECUTION_STORE_VERSION)?.digest).toBe(digest);
    expect(first.some(row => row.version === "135.execution-manager-models.v1")).toBe(true);
    expect((await fresh.query("SELECT to_regclass('execution_manager_model_revisions') AS revisions,to_regclass('execution_manager_model_heads') AS heads,to_regclass('portal_users') AS users,to_regclass('workspaces') AS workspaces")).rows[0])
      .toEqual({ revisions: "execution_manager_model_revisions", heads: "execution_manager_model_heads", users: null, workspaces: null });
    expect(await migrateExecutionStore(fresh)).toBe(digest);
    expect((await fresh.query("SELECT version,digest FROM execution_store_migrations ORDER BY version")).rows).toEqual(first);
  }, 60_000);
  it("T06-07 couples the actual profile snapshot/journal and Manager head, including unchanged and quarantine paths",async()=>{
    const d=document();d.profile_id="PAPER_TEST_ONLY";
    const raw:ProfileProjectionDocument={schema_version:"portal.execution.profile-projection.v1",workspace_id:d.workspace_id,
      environment:d.environment,profile_id:d.profile_id,source_contract_revision:"TEST_ONLY:contract",source_catalogue_sha256:d.catalogue_digest,
      relations:{"manager.test:observations":{source_id:"manager.test",relation:"observations",availability:"AVAILABLE",reason_code:null,
        as_of:null,freshness:"UNKNOWN",completeness:"PARTIAL",source_catalogue_sha256:d.catalogue_digest,items:[]}}};
    const repo=new ExecutionProfileProjectionRepository(fresh),modelRepo=new ManagerModelRepository(fresh);
    const input={sourceEpoch:d.source_epoch,sourceCursor:"TEST_ONLY:private-cursor1",sourceAsOf:new Date(d.as_of_ms),receivedAt:new Date(clock),
      completeness:"PARTIAL" as const,retentionSeconds:60,maximumJournalEntries:100,managerModel:prepare(d)};
    await expect(repo.commit(raw,{...input,sourceEpoch:"TEST_ONLY:wrong-epoch"})).rejects.toThrow("MANAGER_PARENT_SOURCE_MISMATCH");
    expect(await repo.snapshot(d.workspace_id,d.environment,d.profile_id)).toBeNull();
    expect(await modelRepo.head(d.workspace_id,d.environment,d.profile_id)).toBeNull();
    expect((await fresh.query("SELECT count(*)::int AS n FROM execution_profile_projection_journal")).rows[0].n).toBe(0);
    expect(await repo.commit(raw,input)).toMatchObject({outcome:"COMMITTED",changed:true,projectionSequence:1});
    expect((await modelRepo.head(d.workspace_id,d.environment,d.profile_id))!.revision).toBe(d.revision);
    expect(await repo.commit(raw,input)).toMatchObject({outcome:"COMMITTED",changed:false,projectionSequence:1});
    const next=successor(d,"TEST_ONLY:coupled-r2");
    await repo.commit(raw,{...input,sourceCursor:"TEST_ONLY:private-cursor2",managerModel:prepare(next)});
    expect((await modelRepo.head(d.workspace_id,d.environment,d.profile_id))!.revision).toBe(next.revision);
    const after=await repo.snapshot(d.workspace_id,d.environment,d.profile_id);expect(after!.sourceCursor).toBe("TEST_ONLY:private-cursor2");
    const quarantine=new ExecutionProfileProjectionRepository(fresh,{commitAcceptedProjection:async()=>({outcome:"QUARANTINED",reasonCode:"TEST_ONLY_CONFLICT"})} as any);
    expect(await quarantine.commit(raw,{...input,managerModel:prepare(successor(next,"TEST_ONLY:must-not-apply"))})).toMatchObject({outcome:"QUARANTINED"});
    expect((await modelRepo.head(d.workspace_id,d.environment,d.profile_id))!.revision).toBe(next.revision);
    expect((await repo.snapshot(d.workspace_id,d.environment,d.profile_id))!.sourceCursor).toBe(after!.sourceCursor);
  });
});
