/**
 * BE-P16 on real PostgreSQL (PG gate - NOT run by the author, no Docker was started): the two SQL reads of the
 * `alpha_fleet_overview` notice source against the REAL Manager revision tables, and the REAL source over the REAL repository.
 * Rows are inserted directly (TEST_ONLY): what this proves is the dense ordinal range, the exact (epoch, generation) fence, the
 * metadata-only projection and the qualification scalar, not any publication, source or financial fact.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ManagerModelRepository } from "../src/execution-v2/manager-model.store";
import { ManagerFleetNoticeSource, decodeFleetCoordinate, fleetBaseline } from "../src/execution-v2/alpha-fleet-realtime.source";
import type { ScopedReplayBinding } from "../src/execution-v2/realtime.contract";

const migration = readFileSync(resolve(__dirname, "../migrations/1723680000135_execution-manager-models.sql"), "utf8").split("-- Down Migration")[0];
const WS = "TEST_ONLY:workspace", ENV = "paper", PROFILE = "TEST_ONLY:paper", EPOCH = "TEST_ONLY:epoch-1", GEN = "TEST_ONLY:g1";
const CATALOGUE = "sha256:" + "a1".repeat(32), DIGEST = "sha256:" + "d4".repeat(32);

describe.skipIf(!process.env.TEST_DATABASE_URL)("BE-P16 alpha_fleet_overview notice source on real PostgreSQL (TEST_ONLY)", () => {
  const base = process.env.TEST_DATABASE_URL!;
  const name = `be_p16_fleet_${randomUUID().replaceAll("-", "")}`;
  const url = (database: string) => { const value = new URL(base); value.pathname = `/${database}`; return value.toString(); };
  let pool: Pool; let repository: ManagerModelRepository;

  const revision = (sequence: string, patch: { epoch?: string; generation?: string; qualification?: string; at?: string } = {}) => pool.query(
    `INSERT INTO execution_manager_model_revisions(workspace_id,environment,profile_id,revision,source_epoch,source_sequence,projection_generation,payload_digest,payload,created_at)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)`,
    [WS, ENV, PROFILE, `TEST_ONLY:fleet-r${patch.epoch ?? ""}${patch.generation ?? ""}${sequence}`, patch.epoch ?? EPOCH, sequence, patch.generation ?? GEN, DIGEST,
      JSON.stringify({ qualification: patch.qualification ?? "SOURCE_VERIFIED", members: [], facts: ["NEVER_PROJECTED"] }), patch.at ?? "2026-10-20T00:00:00.123456Z"]);
  const head = (rev: string, sequence: string, patch: { epoch?: string; generation?: string } = {}) => pool.query(
    `INSERT INTO execution_manager_model_heads(workspace_id,environment,profile_id,revision,source_epoch,source_sequence,projection_generation,payload_digest,catalogue_digest)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(workspace_id,environment,profile_id) DO UPDATE SET revision=EXCLUDED.revision,source_epoch=EXCLUDED.source_epoch,
     source_sequence=EXCLUDED.source_sequence,projection_generation=EXCLUDED.projection_generation`,
    [WS, ENV, PROFILE, rev, patch.epoch ?? EPOCH, sequence, patch.generation ?? GEN, DIGEST, CATALOGUE]);
  const seed = async (count: number) => { for (let i = 1; i <= count; i++) await revision(String(i)); await head(`TEST_ONLY:fleet-r${count}`, String(count)); };

  beforeAll(async () => {
    const admin = new Pool({ connectionString: url("postgres"), max: 1 });
    try { await admin.query(`CREATE DATABASE ${name}`); } finally { await admin.end(); }
    pool = new Pool({ connectionString: url(name), max: 2 });
    repository = new ManagerModelRepository(pool);
    await pool.query(migration);
  }, 60_000);
  beforeEach(async () => { await pool.query("TRUNCATE execution_manager_model_heads,execution_manager_model_revisions"); });
  afterAll(async () => {
    await pool?.end();
    const admin = new Pool({ connectionString: url("postgres"), max: 1 });
    try {
      if (!/^be_p16_fleet_[a-f0-9]{32}$/.test(name)) throw new Error("TEST_DATABASE_NAME_INVALID");
      await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    } finally { await admin.end(); }
  }, 60_000);

  it("revisionMetadataAfter: ascending, bounded, metadata only, inside exactly one (epoch, generation)", async () => {
    await seed(5);
    await revision("6", { epoch: "TEST_ONLY:epoch-2" }); await revision("6", { generation: "TEST_ONLY:g2" });
    const rows = await repository.revisionMetadataAfter(WS, ENV, PROFILE, EPOCH, GEN, "2", 2);
    expect(rows.map(r => r.source_sequence)).toEqual(["3", "4"]);
    expect(Object.keys(rows[0]).sort()).toEqual(["created_at_ms", "revision", "source_sequence"]);
    expect(JSON.stringify(rows)).not.toContain("NEVER_PROJECTED");
    expect(rows[0].created_at_ms).toBe(Date.parse("2026-10-20T00:00:00.123Z"));
    expect((await repository.revisionMetadataAfter(WS, ENV, PROFILE, EPOCH, GEN, "5", 10))).toEqual([]);
    expect((await repository.revisionMetadataAfter(WS, ENV, PROFILE, "TEST_ONLY:epoch-2", GEN, "0", 10)).map(r => r.source_sequence)).toEqual(["6"]);
    expect((await repository.revisionMetadataAfter("other", ENV, PROFILE, EPOCH, GEN, "0", 10))).toEqual([]);
  });
  it("orders numerically beyond the safe-integer and decimal-width boundaries", async () => {
    for (const sequence of ["9", "10", "100", "9007199254740993", "9007199254740994"]) await revision(sequence);
    expect((await repository.revisionMetadataAfter(WS, ENV, PROFILE, EPOCH, GEN, "9", 10)).map(r => r.source_sequence))
      .toEqual(["10", "100", "9007199254740993", "9007199254740994"]);
  });
  it("refuses an unbounded or non-decimal request before any SQL", async () => {
    for (const [after, limit] of [["0", 0], ["0", 201], ["0", 1.5], ["-1", 1], ["01", 1], ["1e3", 1], ["1; DROP", 1]] as const)
      await expect(repository.revisionMetadataAfter(WS, ENV, PROFILE, EPOCH, GEN, after, limit), `${after}/${limit}`).rejects.toThrow("MANAGER_NOTICE_BOUND_INVALID");
  });
  it("revisionQualification: a scalar, never the payload", async () => {
    await revision("1", { qualification: "TEST_ONLY" }); await revision("2");
    expect(await repository.revisionQualification(WS, ENV, PROFILE, "TEST_ONLY:fleet-r1")).toBe("TEST_ONLY");
    expect(await repository.revisionQualification(WS, ENV, PROFILE, "TEST_ONLY:fleet-r2")).toBe("SOURCE_VERIFIED");
    expect(await repository.revisionQualification(WS, ENV, PROFILE, "missing")).toBeNull();
  });

  describe("ManagerFleetNoticeSource over the real repository", () => {
    const sel = { workspace_id: WS, environment: "paper" as const, profile_id: PROFILE };
    async function start() {
      const h = (await repository.head(WS, ENV, PROFILE))!, baseline = fleetBaseline(h, sel);
      const binding: ScopedReplayBinding = { workspace_id: WS, environment: "paper", profile_id: PROFILE, principal_scope_digest: "sha256:" + "e1".repeat(32),
        app_policy_revision: "p", field_policy_revision: "f", model_revision: "portal.alpha-fleet-realtime.stream.v1", schema_revision: "portal.execution.scoped-realtime.v1",
        dataset: "alpha_fleet_overview", query_digest: baseline.query_digest, source_set_digest: baseline.source_set_digest, source_continuity_epoch: h.source_epoch,
        projection_generation: h.projection_generation, snapshot_id: baseline.snapshot_id, window: null };
      return { binding, cursor: baseline.source_cursor, source: new ManagerFleetNoticeSource(repository) };
    }
    it("nothing new at the head; then one notice per committed revision, dense and in order, with the commit time as the observation clock", async () => {
      await seed(3);
      const { binding, cursor, source } = await start();
      expect(await source.read(binding, cursor, 50)).toEqual({ notices: [], next_cursor: cursor, caught_up: true });
      await revision("4", { at: "2026-10-20T00:00:04Z" }); await revision("5", { at: "2026-10-20T00:00:05Z" }); await head("TEST_ONLY:fleet-r5", "5");
      const batch = await source.read(binding, cursor, 50);
      expect(batch.notices.map(n => decodeFleetCoordinate(n.resume_cursor).after_ordinal)).toEqual(["4", "5"]);
      expect(batch.notices.map(n => n.quality.portal_observed_at_ms)).toEqual([Date.parse("2026-10-20T00:00:04Z"), Date.parse("2026-10-20T00:00:05Z")]);
      expect(batch.caught_up).toBe(true);
      expect((await source.read(binding, cursor, 1)).caught_up).toBe(false);
    });
    it("a missing ordinal (retention loss) is SOURCE_COVERAGE_UNPROVED, never a skipped revision", async () => {
      await seed(3);
      const { binding, cursor, source } = await start();
      await revision("4"); await revision("5"); await head("TEST_ONLY:fleet-r5", "5");
      await pool.query("DELETE FROM execution_manager_model_revisions WHERE source_sequence=4");
      await expect(source.read(binding, cursor, 50)).rejects.toMatchObject({ code: "SOURCE_COVERAGE_UNPROVED" });
    });
    it("a new epoch or generation is GENERATION_CHANGED; a head behind the cursor is SOURCE_COVERAGE_UNPROVED", async () => {
      await seed(3);
      const { binding, cursor, source } = await start();
      await revision("1", { generation: "TEST_ONLY:g2" }); await head("TEST_ONLY:fleet-rTEST_ONLY:g21", "1", { generation: "TEST_ONLY:g2" });
      await expect(source.read(binding, cursor, 50)).rejects.toMatchObject({ code: "GENERATION_CHANGED" });
      await pool.query("TRUNCATE execution_manager_model_heads,execution_manager_model_revisions");
      await seed(2);
      await expect(source.read(binding, cursor, 50)).rejects.toMatchObject({ code: "SOURCE_COVERAGE_UNPROVED" });
    });
  });
});
