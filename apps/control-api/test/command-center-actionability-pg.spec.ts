import { afterAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { commandCenterGovernanceActionableSql as predicate } from "../src/command-center/governance-actionability";

// Actual PostgreSQL predicate tests, definitions only until Main schedules.
// CTE-local SYNTHETIC rows shadow the relation names; no DDL/shared row writes,
// no migrations, authority creation, commands, source access or engine execution.
const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL ??
  "postgres://portal:portal@127.0.0.1:5432/portal_control_test", max: 1 });
afterAll(() => pool.end());
const workspace = "ws_TEST_ONLY_cockpit", actor = "usr_TEST_ONLY_reviewer";
const readAt = new Date("2026-10-18T12:00:00Z");
const cte = `WITH governance_approval_decision_inbox AS (
  SELECT * FROM jsonb_to_recordset($5::jsonb) AS r(
    approval_id text, workspace_id text, gate text, status text, expires_at timestamptz,
    requester_user_id text, artifact_creator_user_id text, decision_actor_ids text[],
    evidence_complete boolean, blocker_count integer, quorum_required integer,
    r2_parent_ready boolean, r2_plan_author_user_id text)
), governance_paper_exit_reviews AS (
  SELECT * FROM jsonb_to_recordset($6::jsonb) AS r(
    review_id text, workspace_id text, gate text, review_state text)
) `;
const row = (approval_id: string, fields: Record<string, unknown> = {}) => ({ approval_id,
  workspace_id: workspace, gate: "R1", status: "PENDING", expires_at: "2026-10-19T12:00:00Z",
  requester_user_id: "usr_TEST_ONLY_author", artifact_creator_user_id: "usr_TEST_ONLY_author",
  decision_actor_ids: [], evidence_complete: true, blocker_count: 0, quorum_required: 1,
  r2_parent_ready: false, r2_plan_author_user_id: null, ...fields });
const review = (id: string, state = "PENDING", workspace_id = workspace) => ({
  review_id: id, workspace_id, gate: "PAPER_EXIT", review_state: state });
const params = (rows: unknown[], reviews: unknown[] = [], gates = ["R1", "R2", "PAPER_EXIT"]) =>
  [workspace, actor, readAt, gates, JSON.stringify(rows), JSON.stringify(reviews)];

describe("C5 real PostgreSQL cockpit population (SYNTHETIC, NOT product authority)", () => {
  it("enforces R2 readiness/author, expiry/self/evidence and actual Paper reject/extend rules", async () => {
    const rows = [row("r1-ok"), row("r1-self", { requester_user_id: actor }),
      row("r1-blocked", { blocker_count: 1 }), row("r1-incomplete", { evidence_complete: false }),
      row("r1-decided", { decision_actor_ids: [actor] }), row("r1-expired", { expires_at: readAt }),
      row("r2-ok", { gate: "R2", r2_parent_ready: true, r2_plan_author_user_id: "usr_TEST_ONLY_plan" }),
      row("r2-missing-parent", { gate: "R2" }),
      row("r2-expired-parent", { gate: "R2", r2_parent_ready: false }),
      row("r2-plan-author", { gate: "R2", r2_parent_ready: true, r2_plan_author_user_id: actor }),
      row("paper-self-blocked", { gate: "PAPER_EXIT", requester_user_id: actor, blocker_count: 3, evidence_complete: false }),
      row("paper-quorum2", { gate: "PAPER_EXIT", quorum_required: 2 }),
      row("paper-already-decided", { gate: "PAPER_EXIT", decision_actor_ids: [actor] }),
      row("paper-expired", { gate: "PAPER_EXIT", expires_at: readAt }),
      row("paper-closed", { gate: "PAPER_EXIT" }), row("paper-missing-review", { gate: "PAPER_EXIT" }),
      row("paper-foreign-review", { gate: "PAPER_EXIT" }),
      row("live", { gate: "LIVE_GATE" }), row("sandbox", { gate: "SANDBOX_EXIT" }),
      row("foreign-workspace", { workspace_id: "ws_TEST_ONLY_foreign" })];
    const reviews = [review("paper-self-blocked"), review("paper-quorum2"), review("paper-already-decided"), review("paper-expired"), review("paper-closed", "EXTENDED"),
      review("paper-foreign-review", "PENDING", "ws_TEST_ONLY_foreign")];
    const result = await pool.query(cte + `SELECT approval_id FROM governance_approval_decision_inbox request
      WHERE ${predicate} ORDER BY approval_id`, params(rows, reviews));
    expect(result.rows.map(value => value.approval_id)).toEqual(["paper-self-blocked", "r1-ok", "r2-ok"]);
  });
  it("read-only empty gates produce zero rows; delegated R1 does not admit R2/Paper", async () => {
    const rows = [row("r1"), row("r2", { gate: "R2", r2_parent_ready: true }), row("paper", { gate: "PAPER_EXIT" })];
    const sql = cte + `SELECT approval_id FROM governance_approval_decision_inbox request WHERE ${predicate}`;
    expect((await pool.query(sql, params(rows, [review("paper")], []))).rows).toEqual([]);
    expect((await pool.query(sql, params(rows, [review("paper")], ["R1"]))).rows).toEqual([{ approval_id: "r1" }]);
  });
  it("uses the same bounded population for window count and empty-page fallback count", async () => {
    const rows = Array.from({ length: 17 }, (_, index) => row(`r1-${String(index).padStart(2, "0")}`));
    const values = params(rows);
    const page = await pool.query(cte + `SELECT approval_id, count(*) OVER() AS total_count
      FROM governance_approval_decision_inbox request WHERE ${predicate} ORDER BY approval_id LIMIT 10`, values);
    const count = await pool.query(cte + `SELECT count(*) AS total_count
      FROM governance_approval_decision_inbox request WHERE ${predicate}`, values);
    expect(page.rows).toHaveLength(10);
    expect(page.rows.every(value => value.total_count === "17")).toBe(true);
    expect(count.rows).toEqual([{ total_count: "17" }]);
    expect((await pool.query(cte + `SELECT count(*) AS total_count
      FROM governance_approval_decision_inbox request WHERE ${predicate}`, params([]))).rows).toEqual([{ total_count: "0" }]);
  });
});
