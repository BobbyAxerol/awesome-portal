/** ELP2-10 M-6b restore drill, harness only. Skipped unless M6_PHASE is set by scripts/measure/m6-restore-drill.sh, which owns the
 * disposable PostgreSQL and performs pg_dump / pg_restore between the two phases. TEST_ONLY documents; no source, no production data.
 *
 *   M6_PHASE=seed    create M6_SRC_DB, take a lease, commit two revisions, leave the lease LIVE (a backup is taken mid-tenure), write /out/seed.json
 *   M6_PHASE=verify  on M6_RESTORED_DB (restored by the host): show the hazard (the old holder is still valid after a restore), run the
 *                    ops reset (resetAfterRestore with the expected epoch), then prove the old holder cannot renew / commit / release, a new
 *                    tenure commits, history is intact; write /out/verify.json with step timings and the RTO. */
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Pool, type PoolClient } from "pg";
import { describe, expect, it } from "vitest";
import { accessDigest } from "../src/execution-v2/access-policy";
import type { DatasetPublication } from "../src/execution-v2/publication.contract";
import { EXECUTION_PUBLICATION_CATALOGUE } from "../src/execution-v2/publication-source.generated";
import type { ManagerModelDocument } from "../src/execution-v2/manager-model.contract";
import { ManagerModelRepository, persistManagerProjection, prepareManagerProjection, type PreparedManagerProjection } from "../src/execution-v2/manager-model.store";
import { ManagerProjectionLeases, type ManagerProjectionLease } from "../src/execution-v2/manager-lease";

const phase = process.env.M6_PHASE;
const OUT = process.env.M6_OUT_DIR ?? "/out";
const contracts = process.env.PORTAL_CONTRACTS_DIR ?? resolve(__dirname, "../../../packages/contracts");
const clock = Date.now();
const tuple = { alpha_id: "TEST_ONLY:alpha", alpha_version_id: "TEST_ONLY:av1", portfolio_id: "TEST_ONLY:portfolio", deployment_id: "TEST_ONLY:deployment", account_id: "TEST_ONLY:account" };
const key = ["TEST_ONLY:workspace", "paper", "TEST_ONLY:paper"] as const;
const leaseScope = () => ({ workspace_id: key[0], environment: "paper" as const, profile_id: key[2] });

function document(): ManagerModelDocument {
  return { schema_version: "portal.execution.manager-model-input.v1", workspace_id: key[0], environment: "paper", profile_id: key[2], qualification: "TEST_ONLY",
    family_id: "alpha_fleet_overview", revision: "TEST_ONLY:model-r1", supersedes_revision: null, source_epoch: "TEST_ONLY:epoch1", source_sequence: "9007199254740993",
    projection_generation: "TEST_ONLY:g1", catalogue_digest: EXECUTION_PUBLICATION_CATALOGUE.source_catalogue_digest, source_set_digest: accessDigest([tuple]),
    as_of_ms: clock - 100, recorded_through_ms: clock - 50, facts_through_ms: clock - 100, observed_at_ms: clock,
    source_quality: { completeness: "COMPLETE", freshness: "FRESH", reasons: [] },
    members: [{ tuple: { ...tuple }, stage: "PAPER", name: "TEST_ONLY:alpha name", owner_user_id: "TEST_ONLY:research-owner", lifecycle: "ACTIVE", venue: "TEST_ONLY:venue",
      health: "HEALTHY", source_state: "FRESH", binding_ref: "TEST_ONLY:binding", assignment_revision: "TEST_ONLY:assignment1", owner_revision: "TEST_ONLY:owner1",
      binding_revision: "TEST_ONLY:binding1", valid_from_ms: clock - 1000, valid_to_ms: null }],
    facts: [{ fact_id: "TEST_ONLY:source-fact1", revision: "TEST_ONLY:fact-r1", source_receipt_ref: "TEST_ONLY:not-economic-authority", tuple: { ...tuple },
      partition: { economic_domain: "PAPER", currency: "USDT", basis: "TEST_ONLY:net-ledger", native_profile_ref: "TEST_ONLY:paper-ledger", domain_proof_ref: "TEST_ONLY:domain" },
      economic_account_ref: "TEST_ONLY:economic-account", ownership_partition_ref: "TEST_ONLY:ownership", kind: "net_pnl", effective_at_ms: clock - 100, recorded_at_ms: clock - 50,
      classification: "ECONOMIC", transfer_pair_ref: null, counterpart_portfolio_id: null,
      metric: { value: "100.000000000000000001", unit: "MONEY", currency: "USDT", basis: "TEST_ONLY:net-ledger", window: null, denominator: null, methodology_ref: "TEST_ONLY:method",
        availability: "AVAILABLE", reason_code: null, quality: { completeness: "COMPLETE", freshness: "FRESH", reasons: [] }, source_confidence: "VERIFIED",
        provenance_refs: ["TEST_ONLY:source-fact1"], calculation_revision: "TEST_ONLY:calc1", policy_revision: "TEST_ONLY:policy1" } }] };
}
function publication(doc: ManagerModelDocument): DatasetPublication {
  const p = JSON.parse(readFileSync(resolve(contracts, "fixtures/execution-dataset-publication.synthetic.valid.json"), "utf8")).value as DatasetPublication;
  return { ...p, family_id: doc.family_id, catalogue_digest: doc.catalogue_digest, environment: doc.environment, profile_id: doc.profile_id, issued_at_ms: clock - 2000,
    expires_at_ms: clock + 600_000, source_as_of_ms: doc.as_of_ms, observed_at_ms: clock, history_capability: "CURRENT_ONLY", barrier: null,
    authority: { ...p.authority, workspace_id: doc.workspace_id, environment: doc.environment, profile_id: doc.profile_id, publication_revision: `TEST_ONLY:publication-${doc.revision}`,
      binding: { dataset_id: doc.family_id, source_revision: doc.revision, catalogue_revision: doc.catalogue_digest, projection_generation: doc.projection_generation, window: null },
      tuples: [{ ...tuple }], resources: [] } };
}
const successor = (previous: ManagerModelDocument, revision: string): ManagerModelDocument => ({ ...structuredClone(previous), revision, supersedes_revision: previous.revision,
  source_sequence: (BigInt(previous.source_sequence) + 1n).toString() });
const withLease = (d: ManagerModelDocument, lease: ManagerProjectionLease): PreparedManagerProjection =>
  prepareManagerProjection(d, publication(d), { nowMs: clock, allowTestOnly: true, lease });
const url = (name: string) => { const u = new URL(process.env.TEST_DATABASE_URL!); u.pathname = `/${name}`; return u.toString(); };
async function transaction<T>(pool: Pool, run: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try { await client.query("BEGIN"); const result = await run(client); await client.query("COMMIT"); return result; }
  catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
const migrationSql = (file: string) => readFileSync(resolve(__dirname, "../migrations", file), "utf8").split("-- Down Migration")[0];

describe.skipIf(!phase || !process.env.TEST_DATABASE_URL)("ELP2-10 M-6b restore drill (TEST_ONLY, disposable PostgreSQL)", () => {
  it.skipIf(phase !== "seed")("seed: a live tenure with two committed revisions at backup time", async () => {
    const srcDb = process.env.M6_SRC_DB!;
    expect(srcDb).toMatch(/^m6_drill_[a-z0-9_]+$/);
    const admin = new Pool({ connectionString: url("postgres"), max: 1 });
    try { await admin.query(`CREATE DATABASE ${srcDb}`); } finally { await admin.end(); }
    const store = new Pool({ connectionString: url(srcDb), max: 2 });
    try {
      await store.query(migrationSql("1723680000135_execution-manager-models.sql"));
      await store.query(migrationSql("1723680000137_execution-manager-consumer-fence.sql"));
      const leases = new ManagerProjectionLeases(store);
      const t0 = Date.now();
      const lease = (await leases.acquire(leaseScope(), randomUUID(), 300_000))!;
      const d1 = document(), d2 = successor(d1, "TEST_ONLY:model-r2");
      const p1 = withLease(d1, lease), p2 = withLease(d2, lease);
      await transaction(store, (c) => persistManagerProjection(c, p1));
      await transaction(store, (c) => persistManagerProjection(c, p2));
      const repo = new ManagerModelRepository(store);
      const head = await repo.head(...key);
      const count = Number((await store.query("SELECT count(*)::text AS n FROM execution_manager_model_revisions")).rows[0].n);
      expect(head!.payload_digest).toBe(p2.digest);
      expect(count).toBe(2);
      writeFileSync(`${OUT}/seed.json`, JSON.stringify({ lease, digests: { r1: p1.digest, r2: p2.digest }, head_digest: head!.payload_digest, revision_count: count, seed_ms: Date.now() - t0 }));
    } finally { await store.end(); }
  }, 120_000);

  it.skipIf(phase !== "verify")("verify: reset after restore fences the old holder; a new tenure commits; history is intact", async () => {
    const seed = JSON.parse(readFileSync(`${OUT}/seed.json`, "utf8")) as { lease: ManagerProjectionLease; digests: { r1: string; r2: string }; head_digest: string; revision_count: number };
    const restoredDb = process.env.M6_RESTORED_DB!;
    expect(restoredDb).toMatch(/^m6_drill_[a-z0-9_]+$/);
    const restoreStart = Number(process.env.M6_RESTORE_START_MS), restoreEnd = Number(process.env.M6_RESTORE_END_MS);
    expect(Number.isFinite(restoreStart) && Number.isFinite(restoreEnd)).toBe(true);
    const store = new Pool({ connectionString: url(restoredDb), max: 2 });
    const steps: { step: string; at_ms: number; result: unknown }[] = [];
    const mark = (step: string, result: unknown) => steps.push({ step, at_ms: Date.now(), result });
    try {
      const leases = new ManagerProjectionLeases(store), repo = new ManagerModelRepository(store);
      const old = seed.lease;
      // The hazard the runner exists for: a restore carries the old tenure's epoch, so the old holder is still valid until ops reset it.
      const hazard = await leases.renew(old, 10_000);
      mark("hazard_old_holder_renew_before_reset", hazard);
      const head0 = await repo.head(...key);
      expect(head0!.payload_digest).toBe(seed.head_digest);
      mark("restored_head_matches_seed_head", true);
      // Ops-only CAS: wrong expected epoch is refused, the right one resets.
      const wrong = await leases.resetAfterRestore(leaseScope(), randomUUID(), "TEST_ONLY:m6-drill-wrong-epoch");
      mark("reset_with_wrong_epoch", wrong);
      const reset = await leases.resetAfterRestore(leaseScope(), old.lease_epoch, "TEST_ONLY:m6-drill-restore-receipt");
      mark("reset_with_recorded_epoch", reset);
      // The old holder is fenced out of everything.
      const renewed = await leases.renew(old, 10_000), released = await leases.release(old);
      let oldCommit = "NOT_REJECTED";
      try { await transaction(store, (c) => persistManagerProjection(c, withLease(successor(document(), "TEST_ONLY:model-r3-stale"), old))); }
      catch (error) { oldCommit = (error as Error).message; }
      mark("old_holder_after_reset", { renewed, released, commit: oldCommit });
      // A new tenure takes over and commits the next revision: this is the first valid revision after the restore.
      const lease2 = (await leases.acquire(leaseScope(), randomUUID(), 60_000))!;
      mark("new_tenure_acquired", { token: lease2.fencing_token, epoch_changed: lease2.lease_epoch !== old.lease_epoch });
      const r3 = successor(successor(document(), "TEST_ONLY:model-r2"), "TEST_ONLY:model-r3");
      const p3 = withLease(r3, lease2);
      const commit = await transaction(store, (c) => persistManagerProjection(c, p3));
      const firstCommitAt = Date.now();
      mark("first_valid_revision_committed", commit);
      const head1 = await repo.head(...key);
      const count = Number((await store.query("SELECT count(*)::text AS n FROM execution_manager_model_revisions")).rows[0].n);
      const r1 = await repo.document(...key, "TEST_ONLY:model-r1"), r2doc = await repo.document(...key, "TEST_ONLY:model-r2");
      const checks = {
        hazard_old_holder_valid_before_reset: hazard === true, wrong_epoch_refused: wrong === false, reset_ok: reset === true,
        old_holder_renew_false: renewed === false, old_holder_release_false: released === false, old_holder_commit_rejected: oldCommit === "MANAGER_LEASE_LOST",
        new_token_greater: BigInt(lease2.fencing_token) > BigInt(old.fencing_token), new_epoch_differs: lease2.lease_epoch !== old.lease_epoch,
        new_head_is_new_revision: head1!.payload_digest === p3.digest, history_preserved: count === seed.revision_count + 1,
        old_revisions_byte_identical: accessDigest(r1) === seed.digests.r1 && accessDigest(r2doc) === seed.digests.r2,
      };
      writeFileSync(`${OUT}/verify.json`, JSON.stringify({ checks, steps, rto_ms: firstCommitAt - restoreStart, restore_ms: restoreEnd - restoreStart,
        reset_to_first_commit_ms: firstCommitAt - (steps.find((s) => s.step === "reset_with_recorded_epoch")?.at_ms ?? firstCommitAt), token_old: old.fencing_token, token_new: lease2.fencing_token }));
      for (const [name, ok] of Object.entries(checks)) expect(ok, name).toBe(true);
    } finally { await store.end(); }
  }, 120_000);
});
