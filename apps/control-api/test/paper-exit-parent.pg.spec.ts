/**
 * RV-10 on real PostgreSQL (PG gate - NOT run by the author, no Docker was started): the ORDER BY of
 * `GovernanceRepository.r2ParentOfDeployment` on real rows. A session-local TEMP table of the same name shadows the governed table
 * (pg_temp is first on the search_path), so the spec needs no user, workspace, trigger or migration and writes nothing durable;
 * the pool is a single connection so every query sees the same temp table. TEST_ONLY.
 */
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GovernanceRepository } from "../src/governance/governance.repository";

describe.skipIf(!process.env.TEST_DATABASE_URL)("r2ParentOfDeployment on PostgreSQL / TEST_ONLY", () => {
  let pool: Pool;
  let repository: GovernanceRepository;
  const WS = "ws_TEST_ONLY";
  const row = (id: string, patch: { workspace?: string; gate?: string; subject?: string; status?: string; expires?: string; created?: string }) =>
    pool.query(
      `INSERT INTO governance_approval_requests (approval_id, workspace_id, gate, subject_id, status, expires_at, created_at)
       VALUES ($1, $2, $3, $4, $5, now() + $6::interval, now() - $7::interval)`,
      [id, patch.workspace ?? WS, patch.gate ?? "R2", patch.subject ?? "dep_1", patch.status ?? "APPROVED", patch.expires ?? "1 day", patch.created ?? "1 hour"],
    );

  beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 1 });
    await pool.query(`CREATE TEMP TABLE governance_approval_requests (
      approval_id text PRIMARY KEY, workspace_id text NOT NULL, gate text NOT NULL, subject_id text NOT NULL,
      status text NOT NULL, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL)`);
    repository = new GovernanceRepository(pool);
  }, 30_000);
  afterAll(async () => { await pool?.end(); });

  it("a deployment with no R2 of its own is null: another gate, another workspace and another deployment are not its parent", async () => {
    await row("r1_same_subject", { gate: "R1", subject: "dep_none" });
    await row("r2_other_workspace", { workspace: "ws_OTHER", subject: "dep_none" });
    await row("r2_other_deployment", { subject: "dep_other" });
    expect(await repository.r2ParentOfDeployment(WS, "dep_none")).toBeNull();
  });

  it("prefers the approved and unexpired R2 over a newer pending one, and the newest among approved ones", async () => {
    await row("r2_pending_newest", { subject: "dep_1", status: "PENDING", created: "1 minute" });
    await row("r2_approved_old", { subject: "dep_1", status: "APPROVED", created: "3 days" });
    expect(await repository.r2ParentOfDeployment(WS, "dep_1")).toBe("r2_approved_old");
    await row("r2_approved_conditional_new", { subject: "dep_1", status: "APPROVED_WITH_CONDITION", created: "2 hours" });
    expect(await repository.r2ParentOfDeployment(WS, "dep_1")).toBe("r2_approved_conditional_new");
  });

  it("an approved R2 that has expired does not outrank a live one; with none live, the newest of any status answers so the context can say why", async () => {
    await row("r2_exp_approved", { subject: "dep_2", status: "APPROVED", expires: "-1 hour", created: "5 hours" });
    await row("r2_exp_pending_newer", { subject: "dep_2", status: "PENDING", expires: "-2 minutes", created: "4 hours" });
    expect(await repository.r2ParentOfDeployment(WS, "dep_2")).toBe("r2_exp_pending_newer");
    await row("r2_live_approved", { subject: "dep_2", status: "APPROVED", expires: "2 days", created: "6 hours" });
    expect(await repository.r2ParentOfDeployment(WS, "dep_2")).toBe("r2_live_approved");
  });

  it("two equally old approved R2s are ordered by approval id, so the answer is deterministic", async () => {
    await pool.query(
      `INSERT INTO governance_approval_requests (approval_id, workspace_id, gate, subject_id, status, expires_at, created_at)
       VALUES ('r2_tie_a', $1, 'R2', 'dep_3', 'APPROVED', now() + interval '1 day', '2026-10-01T00:00:00Z'),
              ('r2_tie_b', $1, 'R2', 'dep_3', 'APPROVED', now() + interval '1 day', '2026-10-01T00:00:00Z')`,
      [WS],
    );
    expect(await repository.r2ParentOfDeployment(WS, "dep_3")).toBe("r2_tie_b");
  });
});
