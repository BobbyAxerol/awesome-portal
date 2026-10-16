/** Isolated PostgreSQL component proofs, never source runtime qualification.
 * All normalized documents/publications deliberately remain TEST_ONLY. */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { accessDigest } from "../src/execution-v2/access-policy";
import { ManagerProjectionConsumer, type ManagerConsumerBounds, type ManagerConsumerDelivery,
  type ManagerProjectionSource } from "../src/execution-v2/manager-consumer";
import { ManagerModelRepository } from "../src/execution-v2/manager-model.store";
import type { ManagerModelDocument } from "../src/execution-v2/manager-model.contract";
import { ManagerProjectionLeases } from "../src/execution-v2/manager-lease";
import type { DatasetPublication } from "../src/execution-v2/publication.contract";
import { EXECUTION_PUBLICATION_CATALOGUE } from "../src/execution-v2/publication-source.generated";

const contracts = process.env.PORTAL_CONTRACTS_DIR ?? resolve(__dirname, "../../../packages/contracts");
const scope = { workspace_id: "TEST_ONLY:consumer-workspace", environment: "paper" as const, profile_id: "TEST_ONLY:paper" };
const key = [scope.workspace_id, scope.environment, scope.profile_id] as const;
const bounds: ManagerConsumerBounds = { maximum_documents_per_tick: 2, maximum_document_bytes: 8 * 1024 * 1024,
  maximum_document_rows: 30_000, maximum_tick_ms: 10_000, source_timeout_ms: 2_000,
  transaction_timeout_ms: 2_000, lease_ttl_ms: 5_000 };

function delivery(sequence = 1, previous: ManagerModelDocument | null = null): ManagerConsumerDelivery {
  const now = Date.now(), tuple = { alpha_id: "TEST_ONLY:alpha", alpha_version_id: "TEST_ONLY:av1",
    portfolio_id: "TEST_ONLY:portfolio", deployment_id: "TEST_ONLY:deployment", account_id: "TEST_ONLY:account" };
  const doc: ManagerModelDocument = { schema_version: "portal.execution.manager-model-input.v1", ...scope,
    qualification: "TEST_ONLY", family_id: "alpha_fleet_overview", revision: `TEST_ONLY:r${sequence}`,
    supersedes_revision: previous?.revision ?? null, source_epoch: "TEST_ONLY:epoch", source_sequence: `${sequence}`,
    projection_generation: "TEST_ONLY:g1", catalogue_digest: EXECUTION_PUBLICATION_CATALOGUE.source_catalogue_digest,
    source_set_digest: accessDigest([tuple]), as_of_ms: now - 100, recorded_through_ms: now - 50,
    facts_through_ms: now - 100, observed_at_ms: now,
    source_quality: { completeness: "COMPLETE", freshness: "FRESH", reasons: [] },
    members: [{ tuple, stage: "PAPER", name: "TEST_ONLY:Alpha", owner_user_id: "TEST_ONLY:researcher",
      lifecycle: "ACTIVE", venue: "TEST_ONLY:venue", health: "HEALTHY", source_state: "FRESH", binding_ref: "TEST_ONLY:binding",
      assignment_revision: "TEST_ONLY:a1", owner_revision: "TEST_ONLY:o1", binding_revision: "TEST_ONLY:b1",
      valid_from_ms: now - 1000, valid_to_ms: null }],
    facts: [{ fact_id: `TEST_ONLY:fact${sequence}`, revision: `TEST_ONLY:f${sequence}`, source_receipt_ref: "TEST_ONLY:not-economic-authority",
      tuple, partition: { economic_domain: "PAPER", currency: "USDT", basis: "TEST_ONLY:ledger",
        native_profile_ref: "TEST_ONLY:native", domain_proof_ref: "TEST_ONLY:domain" },
      economic_account_ref: "TEST_ONLY:economic", ownership_partition_ref: "TEST_ONLY:ownership", kind: "net_pnl",
      metric: { value: "0", unit: "MONEY", currency: "USDT", basis: "TEST_ONLY:ledger", window: null, denominator: null,
        methodology_ref: "TEST_ONLY:method", availability: "AVAILABLE", reason_code: null,
        quality: { completeness: "COMPLETE", freshness: "FRESH", reasons: [] }, source_confidence: "VERIFIED",
        provenance_refs: ["TEST_ONLY:receipt"], calculation_revision: "TEST_ONLY:c1", policy_revision: "TEST_ONLY:p1" },
      effective_at_ms: now - 100, recorded_at_ms: now - 50, classification: "ECONOMIC",
      transfer_pair_ref: null, counterpart_portfolio_id: null }],
  };
  const fixture = JSON.parse(readFileSync(resolve(contracts, "fixtures/execution-dataset-publication.synthetic.valid.json"), "utf8")).value as DatasetPublication;
  const publication: DatasetPublication = { ...fixture, family_id: doc.family_id, catalogue_digest: doc.catalogue_digest,
    environment: doc.environment, profile_id: doc.profile_id, issued_at_ms: now - 2000, expires_at_ms: now + 60_000,
    source_as_of_ms: doc.as_of_ms, observed_at_ms: now, history_capability: "CURRENT_ONLY", barrier: null,
    authority: { ...fixture.authority, ...scope, publication_revision: `TEST_ONLY:publication-${sequence}`,
      binding: { dataset_id: doc.family_id, source_revision: doc.revision, projection_generation: doc.projection_generation,
        catalogue_revision: doc.catalogue_digest, window: null }, tuples: [tuple], resources: [] } };
  return { document: doc, publication };
}
const document = (d: ManagerConsumerDelivery) => d.document as ManagerModelDocument;
const source = (values: ManagerConsumerDelivery[]): ManagerProjectionSource => ({
  read: vi.fn(async () => values.shift() ?? null), recheck: vi.fn(async () => ({})), acknowledge: vi.fn(async () => undefined),
});

describe("ELP2-10 Manager consumer finite explicit configuration", () => {
  const pool = {} as Pool;
  it.each([
    { maximum_documents_per_tick: 0 }, { maximum_documents_per_tick: 33 }, { maximum_document_bytes: 8 * 1024 * 1024 + 1 },
    { maximum_document_rows: 30_001 }, { source_timeout_ms: 0 }, { transaction_timeout_ms: 60_001 },
    { maximum_tick_ms: 300_001 }, { lease_ttl_ms: 0 }, { maximum_tick_ms: 100, source_timeout_ms: 200 },
  ])("rejects invalid bounds %j without DB/source access", patch => {
    expect(() => new ManagerProjectionConsumer({ pool, source: source([]), scope, bounds: { ...bounds, ...patch } })).toThrow();
  });
  it("rejects an extra or missing scope axis", () => {
    expect(() => new ManagerProjectionConsumer({ pool, source: source([]), scope: { ...scope, workspace_id: "" }, bounds })).toThrow();
    expect(() => new ManagerProjectionConsumer({ pool, source: source([]), scope: { ...scope, extra: true } as typeof scope, bounds })).toThrow();
  });
  it("has no implicit timer, fetch or DB write and can be stopped before its first tick", async () => {
    const provider = source([]), consumer = new ManagerProjectionConsumer({ pool, source: provider, scope, bounds });
    await consumer.stop(); await consumer.stop();
    await expect(consumer.tick()).rejects.toThrow("MANAGER_CONSUMER_STOPPED");
    expect(provider.read).not.toHaveBeenCalled();
  });
});

describe.skipIf(!process.env.TEST_DATABASE_URL)("ELP2-10 Manager consumer real PostgreSQL lifecycle (TEST_ONLY)", () => {
  const name = `elp210_consumer_${randomUUID().replaceAll("-", "")}`, base = process.env.TEST_DATABASE_URL!;
  const connection = (db: string) => { const url = new URL(base); url.pathname = `/${db}`; return url.toString(); };
  let pool: Pool, repository: ManagerModelRepository;
  const consumers: ManagerProjectionConsumer[] = [];
  const create = (provider: ManagerProjectionSource, limits: Partial<ManagerConsumerBounds> = {}, testOnly = true) => {
    const consumer = new ManagerProjectionConsumer({ pool, source: provider, scope, bounds: { ...bounds, ...limits }, allowTestOnly: testOnly });
    consumers.push(consumer); return consumer;
  };
  const count = async () => Number((await pool.query("SELECT count(*)::text AS n FROM execution_manager_model_revisions")).rows[0].n);
  beforeAll(async () => {
    const admin = new Pool({ connectionString: connection("postgres"), max: 1 });
    try { await admin.query(`CREATE DATABASE ${name}`); } finally { await admin.end(); }
    pool = new Pool({ connectionString: connection(name), max: 2, connectionTimeoutMillis: 2_000, query_timeout: 4_000 });
    repository = new ManagerModelRepository(pool);
    for (const filename of ["1723680000135_execution-manager-models.sql", "1723680000137_execution-manager-consumer-fence.sql"])
      await pool.query(readFileSync(resolve(__dirname, "../migrations", filename), "utf8").split("-- Down Migration")[0]);
  }, 60_000);
  beforeEach(async () => {
    for (const consumer of consumers.splice(0)) await consumer.stop();
    await pool.query("TRUNCATE execution_manager_model_heads,execution_manager_model_revisions,execution_manager_consumer_fences");
  });
  afterAll(async () => {
    for (const consumer of consumers.splice(0)) await consumer.stop();
    await pool?.end();
    const admin = new Pool({ connectionString: connection("postgres"), max: 1 });
    try {
      if (!/^elp210_consumer_[a-f0-9]{32}$/.test(name)) throw new Error("TEST_DATABASE_NAME_INVALID");
      await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    } finally { await admin.end(); }
  }, 60_000);

  it("commits exact identity and releases the DB connection before ACK", async () => {
    const input = delivery(), provider = source([input]);
    provider.acknowledge = vi.fn(async receipt => {
      expect(pool.idleCount).toBeGreaterThan(0);
      expect(await repository.head(...key)).toMatchObject({ revision: receipt.revision, payload_digest: receipt.digest });
      expect(receipt).toEqual({ scope, revision: document(input).revision, digest: accessDigest(document(input)),
        source_epoch: document(input).source_epoch, source_sequence: document(input).source_sequence,
        projection_generation: document(input).projection_generation, publication_revision: input.publication.authority.publication_revision });
    });
    expect(await create(provider).tick()).toMatchObject({ state: "COMMITTED", committed: 1, acknowledged: 1 });
    expect(await count()).toBe(1); expect(provider.acknowledge).toHaveBeenCalledTimes(1);
  });

  it("coalesces concurrent ticks without parallel source reads or commits", async () => {
    const input = delivery(), provider = source([input]); let resume!: () => void;
    const gate = new Promise<void>(resolve => { resume = resolve; });
    provider.read = vi.fn().mockImplementationOnce(async () => { await gate; return input; }).mockResolvedValue(null);
    const consumer = create(provider), first = consumer.tick(), second = consumer.tick();
    expect(first).toBe(second); resume();
    expect(await first).toMatchObject({ committed: 1, acknowledged: 1 });
    expect(provider.read).toHaveBeenCalledTimes(2); expect(await count()).toBe(1);
  });

  it("a busy replica neither fetches nor ACKs until expiry permits a fenced takeover", async () => {
    const firstProvider = source([]), secondProvider = source([delivery()]);
    const first = create(firstProvider), second = create(secondProvider);
    expect(await first.tick()).toMatchObject({ state: "IDLE" });
    expect(await second.tick()).toMatchObject({ state: "LEASE_BUSY" }); expect(secondProvider.read).not.toHaveBeenCalled();
    const token = (await pool.query("SELECT fencing_token::text AS token FROM execution_manager_consumer_fences")).rows[0].token;
    await pool.query("UPDATE execution_manager_consumer_fences SET expires_at=clock_timestamp()-interval '1 second'");
    expect(await second.tick()).toMatchObject({ committed: 1, acknowledged: 1 });
    expect(BigInt((await pool.query("SELECT fencing_token::text AS token FROM execution_manager_consumer_fences")).rows[0].token)).toBe(BigInt(token) + 1n);
    expect(await first.tick()).toMatchObject({ state: "LEASE_BUSY" });
  });

  it("ACK failure preserves one durable revision; duplicate-current retry ACKs the same identity", async () => {
    const input = delivery(), provider = source([input, input]);
    provider.acknowledge = vi.fn().mockRejectedValueOnce(new Error("TEST_ONLY:ack-lost")).mockResolvedValue(undefined);
    const consumer = create(provider);
    await expect(consumer.tick()).rejects.toThrow("TEST_ONLY:ack-lost");
    const head = await repository.head(...key); expect(head).not.toBeNull(); expect(await count()).toBe(1);
    expect(await consumer.tick()).toMatchObject({ committed: 1, acknowledged: 1, last_receipt: { digest: head!.payload_digest } });
    expect(await count()).toBe(1);
    expect(vi.mocked(provider.acknowledge).mock.calls[0][0]).toEqual(vi.mocked(provider.acknowledge).mock.calls[1][0]);
  });

  it("fails scope/publication qualification before persistence and never ACKs", async () => {
    const input = delivery(); document(input).workspace_id = "TEST_ONLY:other-workspace";
    const provider = source([input]);
    await expect(create(provider).tick()).rejects.toThrow("MANAGER_CONSUMER_SCOPE_MISMATCH");
    expect(await count()).toBe(0); expect(provider.acknowledge).not.toHaveBeenCalled();
    const unapproved = source([delivery()]); await expect(create(unapproved, {}, false).tick()).rejects.toMatchObject({ code: "PUBLICATION_NOT_QUALIFIED" });
    expect(await count()).toBe(0); expect(unapproved.acknowledge).not.toHaveBeenCalled();
  });

  it("a SOURCE_VERIFIED-shaped publication is not self-commissioning", async () => {
    const input = delivery(); document(input).qualification = "SOURCE_VERIFIED"; input.publication.authority.qualification = "SOURCE_VERIFIED";
    for (const axis of ["source_read", "transport_trust", "privacy", "field_policy"] as const) input.publication[axis].qualification = "SOURCE_VERIFIED";
    const provider = source([input]); await expect(create(provider, {}, false).tick()).rejects.toMatchObject({ code: "PUBLICATION_NOT_QUALIFIED" });
    expect(await count()).toBe(0); expect(provider.recheck).not.toHaveBeenCalled(); expect(provider.acknowledge).not.toHaveBeenCalled();
  });

  it("rechecks current source outside the transaction and fails closed on changed authority", async () => {
    const input = delivery(), provider = source([input]);
    provider.recheck = vi.fn(async request => {
      expect(pool.idleCount).toBeGreaterThan(0); request.document.revision = "TEST_ONLY:mutated-copy";
      throw new Error("TEST_ONLY:source-changed");
    });
    await expect(create(provider).tick()).rejects.toThrow("TEST_ONLY:source-changed");
    expect(document(input).revision).toBe("TEST_ONLY:r1");
    expect(await count()).toBe(0); expect(provider.acknowledge).not.toHaveBeenCalled();
  });

  it("rolls back if local source status changes just before COMMIT", async () => {
    const provider = source([delivery()]);
    provider.recheck = vi.fn(async () => ({ assertCurrent: () => { throw new Error("TEST_ONLY:local-revoke"); } }));
    await expect(create(provider).tick()).rejects.toThrow("TEST_ONLY:local-revoke");
    expect(await count()).toBe(0); expect(await repository.head(...key)).toBeNull(); expect(provider.acknowledge).not.toHaveBeenCalled();
  });

  it("refuses an accidentally asynchronous current-source fence instead of awaiting it in a transaction", async () => {
    const provider = source([delivery()]);
    provider.recheck = vi.fn(async () => ({ assertCurrent: async () => undefined }));
    await expect(create(provider).tick()).rejects.toThrow("MANAGER_SOURCE_FENCE_MUST_BE_SYNCHRONOUS");
    expect(await count()).toBe(0); expect(provider.acknowledge).not.toHaveBeenCalled();
  });

  it("does not commit after its transaction wall-time budget even if each SQL statement was individually fast", async () => {
    const provider = source([delivery()]);
    provider.recheck = vi.fn(async () => ({ assertCurrent: () => {
      const until = Date.now() + 100; while (Date.now() < until) { /* bounded isolated fault */ }
    } }));
    await expect(create(provider, { transaction_timeout_ms: 50 }).tick()).rejects.toThrow("MANAGER_TRANSACTION_TIMEOUT");
    expect(await count()).toBe(0); expect(provider.acknowledge).not.toHaveBeenCalled();
  });

  it("publication expiry during SQL/local pre-COMMIT check is rejected by the deferred DB fence", async () => {
    const input = delivery(); input.publication.expires_at_ms = Date.now() + 300;
    const provider = source([input]);
    provider.recheck = vi.fn(async () => ({ assertCurrent: () => {
      // Deliberate isolated fault; never a production polling implementation.
      const until = input.publication.expires_at_ms + 10; while (Date.now() < until) { /* bounded fault */ }
    } }));
    await expect(create(provider).tick()).rejects.toThrow("MANAGER_LEASE_LOST");
    expect(await count()).toBe(0); expect(provider.acknowledge).not.toHaveBeenCalled();
  });

  it("absolute publication expiry caps ownership without adding inter-query latency", async () => {
    const input = delivery(); input.publication.expires_at_ms = Date.now() + 2_000;
    const provider = source([input]);
    provider.acknowledge = vi.fn(async () => {
      const fence = await pool.query<{ expires_ms: string }>(
        "SELECT floor(extract(epoch FROM expires_at)*1000)::text AS expires_ms FROM execution_manager_consumer_fences");
      expect(Number(fence.rows[0].expires_ms)).toBeLessThanOrEqual(input.publication.expires_at_ms);
    });
    expect(await create(provider).tick()).toMatchObject({ committed: 1, acknowledged: 1 });
  });

  it("refuses a checkpoint gap without ACK and accepts an explicit generation-rebuild CAS", async () => {
    const initial = delivery(), next = delivery(3, document(initial)), provider = source([initial]);
    const consumer = create(provider); await consumer.tick();
    vi.mocked(provider.read).mockImplementationOnce(async () => next).mockResolvedValue(null);
    await expect(consumer.tick()).rejects.toThrow("MANAGER_CHECKPOINT_GAP"); expect(await count()).toBe(1);
    expect(provider.acknowledge).toHaveBeenCalledTimes(1);
    document(next).projection_generation = "TEST_ONLY:g2"; document(next).source_epoch = "TEST_ONLY:e2";
    next.publication.authority.binding.projection_generation = "TEST_ONLY:g2";
    next.rebuild = { expected_revision: document(initial).revision, receipt_ref: "TEST_ONLY:resnapshot" };
    vi.mocked(provider.read).mockImplementationOnce(async () => next).mockResolvedValue(null);
    expect(await consumer.tick()).toMatchObject({ committed: 1, acknowledged: 1 }); expect(await count()).toBe(2);
    expect(await repository.head(...key)).toMatchObject({ projection_generation: "TEST_ONLY:g2", source_epoch: "TEST_ONLY:e2" });
  });

  it.each([{ maximum_document_bytes: 1 }, { maximum_document_rows: 1 }])("enforces explicit row/byte limit %j before writes", async patch => {
    const provider = source([delivery()]); await expect(create(provider, patch).tick()).rejects.toThrow("MANAGER_PROJECTION_LIMIT");
    expect(await count()).toBe(0); expect(provider.acknowledge).not.toHaveBeenCalled();
  });

  it("limits batches without silently deleting history and resumes from the durable head", async () => {
    const first = delivery(), second = delivery(2, document(first)), provider = source([first, second]);
    const consumer = create(provider, { maximum_documents_per_tick: 1 });
    expect(await consumer.tick()).toMatchObject({ state: "BATCH_LIMIT", committed: 1, acknowledged: 1 });
    expect(await count()).toBe(1);
    expect(await consumer.tick()).toMatchObject({ state: "BATCH_LIMIT", committed: 1, acknowledged: 1 });
    expect(vi.mocked(provider.read).mock.calls[1][0].head).toMatchObject({ revision: document(first).revision });
    expect(await count()).toBe(2);
  });

  it("stop cancels and awaits the single fetch before releasing its lease; no dangling writer or ACK", async () => {
    let entered!: () => void; const entry = new Promise<void>(resolve => { entered = resolve; });
    const provider = source([]);
    provider.read = vi.fn(async ({ signal }) => new Promise((_, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), { once: true }); entered();
    }));
    const consumer = create(provider), flight = consumer.tick(); await entry;
    const rejected = expect(flight).rejects.toThrow("MANAGER_CONSUMER_STOPPED");
    await consumer.stop(); await rejected;
    expect(await count()).toBe(0); expect(provider.acknowledge).not.toHaveBeenCalled();
    expect((await pool.query("SELECT holder_id FROM execution_manager_consumer_fences")).rows[0].holder_id).toBeNull();
    const replacement = await new ManagerProjectionLeases(pool).acquire(scope, randomUUID(), 1000);
    expect(replacement).not.toBeNull(); await new ManagerProjectionLeases(pool).release(replacement!);
  });

  it("source timeout aborts and settles before the next tick can fetch", async () => {
    const provider = source([]);
    provider.read = vi.fn(async ({ signal }) => new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true })));
    const consumer = create(provider, { source_timeout_ms: 30 });
    await expect(consumer.tick()).rejects.toThrow("MANAGER_SOURCE_TIMEOUT");
    expect(await count()).toBe(0); expect(provider.acknowledge).not.toHaveBeenCalled();
    vi.mocked(provider.read).mockResolvedValue(null); expect(await consumer.tick()).toMatchObject({ state: "IDLE" });
  });
});
