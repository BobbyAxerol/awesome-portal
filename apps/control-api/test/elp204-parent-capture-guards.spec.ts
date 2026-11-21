import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool, type PoolClient } from "pg";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { migrateTestDatabase } from "./harness";

// TEST_ONLY direct SQL fixtures. These are NOT source-qualified captures,
// historical-original attestations, native receipts or permission grants.
// Run only in the existing disposable TEST_DATABASE_URL lane, after Main's
// normal migration chain includes0142. No private SQL loading/guard bypass.
const DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://portal:portal@127.0.0.1:5432/portal_control_test";
const SHA_A = `sha256:${"a".repeat(64)}`, SHA_B = `sha256:${"b".repeat(64)}`;
const fixtureEpoch = Date.now() - 60_000;
const at = (offset: number) => new Date(fixtureEpoch + offset).toISOString();
const CREATED = at(0), LATER = at(1000), SLA = at(86_400_000), EXPIRES = at(172_800_000);
const EXTENDED = at(1000 + 14 * 86_400_000);
const USER_A = "usr_parent_guard_a", USER_B = "usr_parent_guard_b", USER_C = "usr_parent_guard_c";
const WORKSPACE = "ws_parent_guard", OTHER_WORKSPACE = "ws_parent_guard_alt";
const CONDITION = JSON.stringify([{ text: "TEST_ONLY documented restriction", owner: "TEST_ONLY reviewer",
  deadline: null, expires_at: null, blocking: true }]);
const textChange = (column: string) => `${column} || ':changed'`;
const timeChange = (column: string) => `${column} + interval '1 microsecond'`;
const hashChange = `'${SHA_B}'`;
type Root = { table: string; key: string; id: string; immutable: Record<string, string>;
  lifecycle: readonly string[]; nullable: readonly string[] };

// Independently derived from0002/0004/0006/0012/0013/0015/0133 and actual
// Governance/PaperExit/Activation writer SQL. Never read0142 TG_ARGV here.
const roots: readonly Root[] = [
  { table: "governance_approval_requests", key: "approval_id", id: "apr_parent_guard", immutable: {
    approval_id: textChange("approval_id"), workspace_id: `'${OTHER_WORKSPACE}'`, gate: "'R2'",
    subject_type: "'DEPLOYMENT'", subject_id: textChange("subject_id"), subject_label: textChange("subject_label"),
    release_candidate: "'TEST_ONLY_changed_rc'", environment: "'PAPER'", target_label: textChange("target_label"),
    requester_user_id: `'${USER_B}'`, requester_username: textChange("requester_username"),
    artifact_creator_user_id: `'${USER_B}'`, artifact_creator_username: textChange("artifact_creator_username"),
    policy_version: textChange("policy_version"), quorum_required: "quorum_required + 1",
    evidence_set_hash: hashChange, evidence_complete: "NOT evidence_complete", blocker_count: "blocker_count + 1",
    blocker_summary: "'TEST_ONLY_changed_blocker'", sla_due_at: timeChange("sla_due_at"), expires_at: timeChange("expires_at"),
    created_at: timeChange("created_at"), supersedes_approval_id: "'apr_parent_dependency'",
    source_run_id: "'TEST_ONLY_changed_run'", methodology_claim_id: "'TEST_ONLY_changed_claim'",
    request_summary: "'TEST_ONLY changed source request summary'", request_key: "'TEST_ONLY:changed-request'",
    request_payload_hash: hashChange,
  }, lifecycle: ["status", "quorum_met", "decision_actor_ids", "approval_version", "updated_at", "decided_at", "decided_by_user_id"],
    nullable: ["release_candidate", "blocker_summary", "supersedes_approval_id", "source_run_id", "methodology_claim_id",
      "request_summary", "request_key", "request_payload_hash"] },
  { table: "governance_decision_plans", key: "operation_id", id: "gdp_parent_guard", immutable: {
    operation_id: textChange("operation_id"), workspace_id: `'${OTHER_WORKSPACE}'`, approval_id: "'apr_parent_guard'",
    actor_user_id: `'${USER_B}'`, request_key: textChange("request_key"), command_type: "'GOVERNANCE_R2_DECISION'",
    command_version: "command_version + 1", payload_hash: hashChange, decision: "'DENY'", reason: textChange("reason"),
    condition: "'TEST_ONLY changed restriction'", conditions: `'${CONDITION}'::jsonb`, expected_approval_version: "expected_approval_version + 1",
    quorum_required: "quorum_required + 1", policy_version: "'TEST_ONLY_changed_policy'", evidence_set_hash: hashChange,
    evidence_hashes: `ARRAY['${SHA_B}']::text[]`, blocker_codes: "ARRAY['TEST_ONLY_BLOCKED']::text[]",
    warning_codes: "ARRAY['TEST_ONLY_WARNING']::text[]", apply_key_id: textChange("apply_key_id"),
    apply_token_hash: `'${"b".repeat(64)}'`, parent_approval_id: "'apr_parent_guard'",
    parent_approval_version: "2", parent_evidence_set_hash: hashChange, expires_at: timeChange("expires_at"), created_at: timeChange("created_at"),
  }, lifecycle: ["status", "applied_at", "response_json"],
    nullable: ["condition", "policy_version", "parent_approval_id", "parent_approval_version", "parent_evidence_set_hash"] },
  { table: "governance_paper_exit_reviews", key: "review_id", id: "px_parent_guard", immutable: {
    review_id: textChange("review_id"), workspace_id: `'${OTHER_WORKSPACE}'`, gate: "'R2'", deployment_id: textChange("deployment_id"),
    portfolio_id: textChange("portfolio_id"), venue: textChange("venue"), promote_to: "'PAPER'", artifact_digest: hashChange,
    r1_approval_id: textChange("r1_approval_id"), r2_approval_id: textChange("r2_approval_id"),
    observation_policy_id: textChange("observation_policy_id"), observation_policy_version: textChange("observation_policy_version"),
    observation_policy_digest: hashChange, evidence_pack_id: textChange("evidence_pack_id"), evidence_pack_digest: hashChange,
    evaluation_policy_version: textChange("evaluation_policy_version"), evaluation_formula_version: textChange("evaluation_formula_version"),
    source_snapshot_hash: hashChange, observation_summary: textChange("observation_summary"), recommendation: textChange("recommendation"),
    created_at: timeChange("created_at"),
  }, lifecycle: ["review_state", "extension_days", "extended_until", "review_version", "updated_at"], nullable: [] },
  { table: "governance_paper_exit_decision_plans", key: "operation_id", id: "pxp_parent_guard", immutable: {
    operation_id: textChange("operation_id"), workspace_id: `'${OTHER_WORKSPACE}'`, review_id: "'px_parent_guard'",
    actor_user_id: `'${USER_B}'`, request_key: textChange("request_key"), command_type: "'GOVERNANCE_R1_DECISION'",
    command_version: "command_version + 1", payload_hash: hashChange, decision: "'PROMOTE'", reason: textChange("reason"),
    extension_days: "14", expected_review_version: "expected_review_version + 1", evidence_set_hash: hashChange,
    source_snapshot_hash: hashChange, evidence_hashes: `ARRAY['${SHA_B}']::text[]`, evaluation_state: "'UNMET'",
    blocker_codes: "ARRAY['TEST_ONLY_BLOCKED']::text[]", warning_codes: "ARRAY['TEST_ONLY_WARNING']::text[]",
    apply_key_id: textChange("apply_key_id"), apply_token_hash: `'${"b".repeat(64)}'`, expires_at: timeChange("expires_at"), created_at: timeChange("created_at"),
  }, lifecycle: ["status", "applied_at", "response_json"], nullable: ["extension_days"] },
  { table: "execution_activation_plans", key: "plan_id", id: "act_parent_guard", immutable: {
    plan_id: textChange("plan_id"), workspace_id: `'${OTHER_WORKSPACE}'`, capability_key: "'QUERY'", actor_user_id: `'${USER_B}'`,
    actor_username: textChange("actor_username"), request_key: textChange("request_key"), request_digest: hashChange,
    action: "'PROMOTE'", from_profile: "'paper'", target_profile: "'shadow'", expected_capability_version: "expected_capability_version + 1",
    blocker_codes: "ARRAY['TEST_ONLY_BLOCKED']::text[]", evidence_set_hash: hashChange, compatibility_set_hash: hashChange,
    reason: textChange("reason"), source_side_effect_requested: "true", runtime_activation_requested: "true", owner_artifact_imported: "true",
    expires_at: timeChange("expires_at"), created_at: timeChange("created_at"),
  }, lifecycle: ["status", "plan_version", "applied_at", "verified_at", "resulting_capability_version", "updated_at"], nullable: [] },
  { table: "execution_activation_capabilities", key: "capability_key", id: "PROJECTION", immutable: {
    workspace_id: `'${OTHER_WORKSPACE}'`, capability_key: "'QUERY'", created_at: timeChange("created_at"),
  }, lifecycle: ["effective_profile", "desired_profile", "capability_version", "source_enabled", "runtime_enabled",
    "kill_switch_engaged", "last_plan_id", "updated_by_user_id", "updated_at"], nullable: [] },
];
const identifier = (value: string) => { if (!/^[a-z_][a-z0-9_]*$/.test(value)) throw new Error("TEST_ONLY bad identifier"); return `"${value}"`; };
const where = (root: Root) => `${identifier(root.key)}=$1${root.table === "execution_activation_capabilities" ? " AND workspace_id=$2" : ""}`;
const params = (root: Root) => root.table === "execution_activation_capabilities" ? [root.id, WORKSPACE] : [root.id];
async function insert(db: PoolClient, table: string, row: Record<string, unknown>) {
  const entries = Object.entries(row);
  await db.query(`INSERT INTO ${identifier(table)} (${entries.map(([column]) => identifier(column)).join(",")})
    VALUES (${entries.map((_, index) => `$${index + 1}`).join(",")})`, entries.map(([, value]) => value));
}
async function seed(db: PoolClient, populated = false) {
  for (const [index, id] of [USER_A, USER_B, USER_C].entries()) await insert(db, "portal_users", {
    user_id: id, username: `test-parent-guard-${index}`, display_name: "TEST_ONLY guard fixture", role: "ADMIN", status: "ACTIVE", must_change_password: false,
  });
  for (const id of [WORKSPACE, OTHER_WORKSPACE]) await insert(db, "workspaces", { workspace_id: id, name: "TEST_ONLY parent guards", owner_user_id: USER_A });
  const approval = (id: string, gate = "R1", quorum = 2, extra: Record<string, unknown> = {}) => insert(db, "governance_approval_requests", {
    approval_id: id, workspace_id: WORKSPACE, gate, subject_type: gate === "PAPER_EXIT" ? "EXIT_REVIEW" : "ALPHA_VERSION",
    subject_id: `TEST_ONLY_${id}`, subject_label: "TEST_ONLY captured subject", release_candidate: null,
    environment: gate === "PAPER_EXIT" ? "PAPER" : "RESEARCH", target_label: "TEST_ONLY captured target",
    requester_user_id: USER_A, requester_username: "TEST_ONLY requester", artifact_creator_user_id: USER_A, artifact_creator_username: "TEST_ONLY creator",
    status: "PENDING", policy_version: "TEST_ONLY_policy_v1", quorum_required: quorum, quorum_met: 0, decision_actor_ids: [], approval_version: 1,
    evidence_set_hash: SHA_A, evidence_complete: false, blocker_count: 0, blocker_summary: null,
    sla_due_at: SLA, expires_at: EXPIRES, created_at: CREATED, updated_at: CREATED, decided_at: null, decided_by_user_id: null,
    supersedes_approval_id: null, source_run_id: null, methodology_claim_id: null, request_summary: null, request_key: null, request_payload_hash: null, ...extra,
  });
  await approval("apr_parent_dependency");
  await approval("apr_parent_guard", "R1", 2, populated ? { release_candidate: "TEST_ONLY_initial_rc", blocker_count: 1, blocker_summary: "TEST_ONLY initial blocker",
    supersedes_approval_id: "apr_parent_dependency", source_run_id: "TEST_ONLY_initial_run", methodology_claim_id: "TEST_ONLY_initial_claim",
    request_summary: "TEST_ONLY initial source request summary", request_key: "TEST_ONLY:initial-request", request_payload_hash: SHA_A } : {});
  // Separate dependency review prevents root DELETE being accidentally refused
  // only by a child FK/child guard. Every tested root starts childless.
  for (const id of ["px_parent_guard", "px_parent_dependency"]) {
    await approval(id, "PAPER_EXIT", 1);
    await insert(db, "governance_paper_exit_reviews", { review_id: id, workspace_id: WORKSPACE, gate: "PAPER_EXIT",
      deployment_id: `TEST_ONLY_${id}`, portfolio_id: "TEST_ONLY_portfolio", venue: "TEST_ONLY_venue", promote_to: "SANDBOX_VALIDATION",
      artifact_digest: SHA_A, r1_approval_id: "TEST_ONLY_r1", r2_approval_id: "TEST_ONLY_r2", observation_policy_id: "TEST_ONLY_observation",
      observation_policy_version: "TEST_ONLY_v1", observation_policy_digest: SHA_A, evidence_pack_id: "TEST_ONLY_pack", evidence_pack_digest: SHA_A,
      evaluation_policy_version: "TEST_ONLY_v1", evaluation_formula_version: "TEST_ONLY_v1", source_snapshot_hash: SHA_A,
      observation_summary: "TEST_ONLY SQL fixture, no genuine source capture", recommendation: "TEST_ONLY no activation",
      review_state: "PENDING", extension_days: null, extended_until: null, review_version: 1, created_at: CREATED, updated_at: CREATED });
  }
  await insert(db, "governance_decision_plans", { operation_id: "gdp_parent_guard", workspace_id: WORKSPACE, approval_id: "apr_parent_dependency",
    actor_user_id: USER_A, request_key: "TEST_ONLY:generic-plan", command_type: "GOVERNANCE_R1_DECISION", command_version: 1, payload_hash: SHA_A,
    decision: populated ? "APPROVE_WITH_CONDITION" : "APPROVE", reason: "TEST_ONLY captured decision intent", condition: populated ? "TEST_ONLY documented restriction" : null,
    conditions: populated ? CONDITION : "[]", expected_approval_version: 1, quorum_required: 2, policy_version: populated ? "TEST_ONLY_policy_v1" : null,
    evidence_set_hash: SHA_A, evidence_hashes: [SHA_A], blocker_codes: [], warning_codes: [], apply_key_id: "TEST_ONLY_key", apply_token_hash: "a".repeat(64),
    parent_approval_id: populated ? "apr_parent_dependency" : null, parent_approval_version: populated ? 1 : null, parent_evidence_set_hash: populated ? SHA_A : null,
    status: "PLANNED", response_json: null, expires_at: EXPIRES, created_at: CREATED, applied_at: null });
  await insert(db, "governance_paper_exit_decision_plans", { operation_id: "pxp_parent_guard", workspace_id: WORKSPACE, review_id: "px_parent_dependency",
    actor_user_id: USER_A, request_key: "TEST_ONLY:paper-plan", command_type: "GOVERNANCE_PAPER_EXIT_DECISION", command_version: 1, payload_hash: SHA_A,
    decision: populated ? "EXTEND_OBSERVATION" : "REJECT", reason: "TEST_ONLY captured Paper Exit intent", extension_days: populated ? 14 : null,
    expected_review_version: 1, evidence_set_hash: SHA_A, source_snapshot_hash: SHA_A, evidence_hashes: [SHA_A], evaluation_state: "UNAVAILABLE",
    blocker_codes: ["TEST_ONLY_SOURCE_UNQUALIFIED"], warning_codes: [], apply_key_id: "TEST_ONLY_key", apply_token_hash: "a".repeat(64),
    status: "PLANNED", response_json: null, expires_at: EXPIRES, created_at: CREATED, applied_at: null });
  await insert(db, "execution_activation_plans", { plan_id: "act_parent_guard", workspace_id: WORKSPACE, capability_key: "PROJECTION", actor_user_id: USER_A,
    actor_username: "TEST_ONLY actor", request_key: "TEST_ONLY:activation-plan", request_digest: SHA_A, action: "ROLLBACK", from_profile: "shadow", target_profile: "fixture",
    expected_capability_version: 1, plan_version: 1, status: "READY", blocker_codes: [], evidence_set_hash: SHA_A, compatibility_set_hash: SHA_A,
    reason: "TEST_ONLY source-dark rollback SQL fixture", source_side_effect_requested: false, runtime_activation_requested: false, owner_artifact_imported: false,
    expires_at: EXPIRES, created_at: CREATED, updated_at: CREATED, applied_at: null, verified_at: null, resulting_capability_version: null });
  await insert(db, "execution_activation_capabilities", { workspace_id: WORKSPACE, capability_key: "PROJECTION", effective_profile: "fixture", desired_profile: "shadow",
    capability_version: 1, source_enabled: false, runtime_enabled: false, kill_switch_engaged: true, last_plan_id: null, updated_by_user_id: null, created_at: CREATED, updated_at: CREATED });
}
async function snapshot(db: PoolClient, root: Root): Promise<Record<string, unknown>> {
  const result = await db.query(`SELECT to_jsonb(t) AS row FROM ${identifier(root.table)} t WHERE ${where(root)}`, params(root));
  expect(result.rowCount).toBe(1); return result.rows[0].row;
}
const captured = (root: Root, row: Record<string, unknown>) => Object.fromEntries(Object.keys(root.immutable).map(column => [column, row[column]]));
async function refused(db: PoolClient, sql: string, values: unknown[] = [], code = "55000") {
  await db.query("SAVEPOINT expected_guard_refusal");
  let error: unknown;
  try { await db.query(sql, values); } catch (caught) { error = caught; }
  finally { await db.query("ROLLBACK TO SAVEPOINT expected_guard_refusal"); await db.query("RELEASE SAVEPOINT expected_guard_refusal"); }
  expect(error).toMatchObject({ code });
}

describe("ELP2-04 forward parent capture guards on actual PostgreSQL (TEST_ONLY)", () => {
  let pool: Pool;
  beforeAll(async () => { await migrateTestDatabase(DATABASE_URL); pool = new Pool({ connectionString: DATABASE_URL, max: 1 }); }, 30_000);
  afterAll(async () => { await pool?.end(); });
  async function fixture(run: (db: PoolClient) => Promise<void>, populated = false) {
    const db = await pool.connect();
    try { await db.query("BEGIN"); await db.query("SET LOCAL statement_timeout='3000ms'"); await db.query("SET LOCAL lock_timeout='1000ms'"); await seed(db, populated); await run(db); }
    finally { try { await db.query("ROLLBACK"); } finally { db.release(); } }
  }
  it.each(roots)("$table has exactly the independently classified schema and nullability", async root => fixture(async db => {
    const columns = (await db.query<{ column_name: string; is_nullable: string }>(`SELECT column_name,is_nullable FROM information_schema.columns
      WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`, [root.table])).rows;
    const names = [...Object.keys(root.immutable), ...root.lifecycle];
    expect(new Set(names).size).toBe(names.length);
    expect(columns.map(column => column.column_name).sort()).toEqual([...names].sort());
    expect(columns.filter(column => column.is_nullable === "YES" && column.column_name in root.immutable).map(column => column.column_name).sort())
      .toEqual([...root.nullable].sort());
  }));
  const immutableCases = roots.flatMap(root => Object.entries(root.immutable).map(([column, expression]) => ({ root, table: root.table, column, expression })));
  it.each(immutableCases)("$table.$column cannot be changed (55000; exact row retained)", async ({ root, column, expression }) => fixture(async db => {
    const before = await snapshot(db, root);
    await refused(db, `UPDATE ${identifier(root.table)} SET ${identifier(column)}=${expression} WHERE ${where(root)}`, params(root));
    expect(await snapshot(db, root)).toEqual(before);
  }));
  it.each(roots)("$table childless root DELETE is refused as55000, not incidental FK protection", async root => fixture(async db => {
    const before = await snapshot(db, root);
    // Generic/Paper plans reference distinct dependency roots; no receipt,
    // evidence/event/lineage or head last_plan reference exists for these roots.
    await refused(db, `DELETE FROM ${identifier(root.table)} WHERE ${where(root)}`, params(root));
    expect(await snapshot(db, root)).toEqual(before);
  }));
  const nullableCases = roots.flatMap(root => root.nullable.flatMap(column => [false, true].map(populated => ({ root, table: root.table, column, populated }))));
  it.each(nullableCases)("$table.$column null-safe swap (initial populated=$populated)", async ({ root, column, populated }) => fixture(async db => {
    const before = await snapshot(db, root); expect(before[column] === null).toBe(!populated);
    await refused(db, `UPDATE ${identifier(root.table)} SET ${identifier(column)}=${populated ? "NULL" : root.immutable[column]} WHERE ${where(root)}`, params(root));
    expect(await snapshot(db, root)).toEqual(before);
  }, populated));
  it.each(roots)("$table future captured column is protected by default; DDL rolls back", async root => fixture(async db => {
    const before = await snapshot(db, root);
    await db.query("SAVEPOINT future_column");
    try {
      await db.query(`ALTER TABLE ${identifier(root.table)} ADD COLUMN test_future_capture text`);
      await refused(db, `UPDATE ${identifier(root.table)} SET test_future_capture='TEST_ONLY future value' WHERE ${where(root)}`, params(root));
      expect(await snapshot(db, root)).toEqual({ ...before, test_future_capture: null });
    } finally { await db.query("ROLLBACK TO SAVEPOINT future_column"); await db.query("RELEASE SAVEPOINT future_column"); }
    expect(await snapshot(db, root)).toEqual(before);
    expect((await db.query(`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema='public' AND table_name=$1
      AND column_name='test_future_capture'`, [root.table])).rows[0].n).toBe(0);
  }));
  it("generic partial quorum and final decision update ONLY lifecycle columns under real SQL constraints", async () => fixture(async db => {
    const root = roots[0], before = await snapshot(db, root);
    await db.query(`UPDATE governance_approval_requests SET status='PENDING',quorum_met=1,decision_actor_ids=ARRAY[$2]::text[],approval_version=2,
      updated_at=$3,decided_at=NULL,decided_by_user_id=NULL WHERE approval_id=$1`, [root.id, USER_B, LATER]);
    const partial = await snapshot(db, root);
    expect(partial).toMatchObject({ status: "PENDING", quorum_met: 1, decision_actor_ids: [USER_B], approval_version: 2, decided_at: null, decided_by_user_id: null });
    expect(captured(root, partial)).toEqual(captured(root, before));
    await db.query(`UPDATE governance_approval_requests SET status='APPROVED',quorum_met=2,decision_actor_ids=array_append(decision_actor_ids,$2),
      approval_version=3,updated_at=$3,decided_at=$3,decided_by_user_id=$2 WHERE approval_id=$1`, [root.id, USER_C, LATER]);
    const final = await snapshot(db, root);
    expect(final).toMatchObject({ status: "APPROVED", quorum_met: 2, decision_actor_ids: [USER_B, USER_C], approval_version: 3, decided_by_user_id: USER_C });
    expect(final.decided_at).not.toBeNull(); expect(captured(root, final)).toEqual(captured(root, before));
  }));
  it.each(["DENIED", "CHANGES_REQUESTED", "EXPIRED"])("generic legal terminal shape %s remains writable", async status => fixture(async db => {
    const root = roots[0], before = await snapshot(db, root);
    await db.query(`UPDATE governance_approval_requests SET status=$2,approval_version=2,updated_at=$3,decided_at=$3,decided_by_user_id=$4,
      decision_actor_ids=CASE WHEN $4::text IS NULL THEN decision_actor_ids ELSE array_append(decision_actor_ids,$4::text) END
      WHERE approval_id=$1`, [root.id, status, LATER, status === "EXPIRED" ? null : USER_B]);
    const after = await snapshot(db, root); expect(after.status).toBe(status); expect(captured(root, after)).toEqual(captured(root, before));
  }));
  it.each([roots[1], roots[3]])("$table supports PLANNED->APPLIED receipt or EXPIRED without intent rewrite", async root => fixture(async db => {
    const before = await snapshot(db, root);
    await db.query("SAVEPOINT applied_plan");
    await db.query(`UPDATE ${identifier(root.table)} SET status='APPLIED',applied_at=$2,response_json=$3::jsonb WHERE ${where(root)}`,
      [root.id, LATER, JSON.stringify({ TEST_ONLY: true, status: "SUCCEEDED", operation_id: root.id })]);
    const applied = await snapshot(db, root); expect(applied.status).toBe("APPLIED"); expect(applied.applied_at).not.toBeNull();
    expect(applied.response_json).toMatchObject({ TEST_ONLY: true, operation_id: root.id }); expect(captured(root, applied)).toEqual(captured(root, before));
    await db.query("ROLLBACK TO SAVEPOINT applied_plan"); await db.query("RELEASE SAVEPOINT applied_plan");
    await db.query(`UPDATE ${identifier(root.table)} SET status='EXPIRED' WHERE ${where(root)}`, params(root));
    const expired = await snapshot(db, root); expect(expired).toMatchObject({ status: "EXPIRED", applied_at: null, response_json: null });
    expect(captured(root, expired)).toEqual(captured(root, before));
  }));
  it.each(["EXTENDED", "REJECTED_TO_PAPER_HELD", "PROMOTION_AUTHORIZED"])("Paper Exit %s preserves captured review and single-quorum approval", async state => fixture(async db => {
    const root = roots[2], before = await snapshot(db, root), extended = state === "EXTENDED";
    await db.query(`UPDATE governance_paper_exit_reviews SET review_state=$2,extension_days=$3,extended_until=$4,review_version=2,updated_at=$5 WHERE review_id=$1`,
      [root.id, state, extended ? 14 : null, extended ? EXTENDED : null, LATER]);
    await db.query(`UPDATE governance_approval_requests SET status=$2,quorum_met=quorum_required,decision_actor_ids=ARRAY[$3]::text[],
      approval_version=2,updated_at=$4,decided_at=$4,decided_by_user_id=$3 WHERE approval_id=$1`,
      [root.id, extended ? "APPROVED_WITH_CONDITION" : state === "PROMOTION_AUTHORIZED" ? "APPROVED" : "DENIED", USER_B, LATER]);
    const after = await snapshot(db, root); expect(after).toMatchObject({ review_state: state, extension_days: extended ? 14 : null, review_version: 2 });
    expect(after.extended_until === null).toBe(!extended); expect(captured(root, after)).toEqual(captured(root, before));
    expect((await db.query("SELECT quorum_required,quorum_met FROM governance_approval_requests WHERE approval_id=$1", [root.id])).rows[0])
      .toEqual({ quorum_required: 1, quorum_met: 1 });
    expect((await db.query("SELECT count(*)::int AS n FROM governance_promotion_authority_grants WHERE review_id=$1", [root.id])).rows[0].n).toBe(0);
  }));
  it("source-dark rollback head and APPLIED->VERIFIED plan lifecycle remain writable", async () => fixture(async db => {
    const plan = roots[4], head = roots[5], beforePlan = await snapshot(db, plan), beforeHead = await snapshot(db, head);
    await db.query(`UPDATE execution_activation_capabilities SET effective_profile='fixture',desired_profile='fixture',capability_version=2,
      source_enabled=false,runtime_enabled=false,kill_switch_engaged=true,last_plan_id=$3,updated_by_user_id=$4,updated_at=$5
      WHERE workspace_id=$1 AND capability_key=$2`, [WORKSPACE, head.id, plan.id, USER_B, LATER]);
    await db.query(`UPDATE execution_activation_plans SET status='APPLIED',plan_version=2,applied_at=$2,resulting_capability_version=2,updated_at=$2 WHERE plan_id=$1`, [plan.id, LATER]);
    const applied = await snapshot(db, plan); expect(applied).toMatchObject({ status: "APPLIED", plan_version: 2, resulting_capability_version: 2, verified_at: null });
    await db.query(`UPDATE execution_activation_plans SET status='VERIFIED',plan_version=3,verified_at=$2,updated_at=$2 WHERE plan_id=$1`, [plan.id, LATER]);
    const verified = await snapshot(db, plan), currentHead = await snapshot(db, head);
    expect(verified).toMatchObject({ status: "VERIFIED", plan_version: 3, resulting_capability_version: 2 }); expect(verified.verified_at).not.toBeNull();
    expect(currentHead).toMatchObject({ effective_profile: "fixture", desired_profile: "fixture", capability_version: 2, source_enabled: false,
      runtime_enabled: false, kill_switch_engaged: true, last_plan_id: plan.id, updated_by_user_id: USER_B });
    expect(captured(plan, verified)).toEqual(captured(plan, beforePlan)); expect(captured(head, currentHead)).toEqual(captured(head, beforeHead));
  }));
  it.each(["effective_profile='paper'", "source_enabled=true", "runtime_enabled=true", "kill_switch_engaged=false"])(
    "mutable activation head does not bypass existing source-dark CHECK: %s", async expression => fixture(async db => {
      const root = roots[5], before = await snapshot(db, root);
      await refused(db, `UPDATE execution_activation_capabilities SET ${expression} WHERE ${where(root)}`, params(root), "23514");
      expect(await snapshot(db, root)).toEqual(before);
    }));
  it("child append remains legal, while existing governance/Paper child guards remain55000", async () => fixture(async db => {
    const approval = roots[0], review = roots[2], beforeApproval = await snapshot(db, approval), beforeReview = await snapshot(db, review);
    await insert(db, "governance_approval_known_limitations", { limitation_id: "lim_parent_guard", approval_id: approval.id, ordinal: 0,
      kind: "RESTRICTION", label: "TEST_ONLY appended restriction", statement: "TEST_ONLY appended, not a root reseal", expires_at: null, created_at: CREATED });
    await insert(db, "governance_paper_exit_lineage", { lineage_id: "lineage_parent_guard", review_id: review.id, ordinal: 0, kind: "ARTIFACT",
      label: "TEST_ONLY appended lineage", value: "TEST_ONLY reference", href: null, digest: SHA_A, source_authority: "DERIVED", required: true, created_at: CREATED });
    for (const [table, key, id, column] of [["governance_approval_known_limitations", "limitation_id", "lim_parent_guard", "statement"],
      ["governance_paper_exit_lineage", "lineage_id", "lineage_parent_guard", "value"]]) {
      await refused(db, `UPDATE ${identifier(table)} SET ${identifier(column)}='TEST_ONLY changed' WHERE ${identifier(key)}=$1`, [id]);
      await refused(db, `DELETE FROM ${identifier(table)} WHERE ${identifier(key)}=$1`, [id]);
      expect((await db.query(`SELECT count(*)::int AS n FROM ${identifier(table)} WHERE ${identifier(key)}=$1`, [id])).rows[0].n).toBe(1);
    }
    expect(await snapshot(db, approval)).toEqual(beforeApproval); expect(await snapshot(db, review)).toEqual(beforeReview);
  }));
  it("existing activation evidence/requirement/event guards keep their P0001 semantics and untrusted flags", async () => fixture(async db => {
    await insert(db, "execution_activation_evidence_refs", { plan_id: roots[4].id, ordinal: 0, evidence_kind: "CONTRACT", reference_id: "TEST_ONLY:contract",
      artifact_digest: SHA_A, schema_version: "TEST_ONLY.v1", signer_fingerprint: SHA_A, detached_signature: "A".repeat(86), compatibility_revision: "TEST_ONLY.v1",
      expires_at: EXPIRES, structure_valid: true, owner_accepted: false, trusted_for_activation: false, created_at: CREATED });
    await insert(db, "execution_activation_compatibility_requirements", { plan_id: roots[4].id, ordinal: 0, requirement_kind: "CONTRACT", component: "TEST_ONLY",
      exact_revision: "TEST_ONLY.v1", expected_digest: SHA_A, created_at: CREATED });
    await insert(db, "execution_activation_events", { event_id: "event_parent_guard", plan_id: roots[4].id, workspace_id: WORKSPACE, capability_key: "PROJECTION",
      actor_user_id: USER_A, request_key: "TEST_ONLY:plan-event", action: "PLAN", plan_version_before: 0, plan_version_after: 1,
      capability_version_before: 1, capability_version_after: 1, result: "READY", blocker_codes: [], created_at: CREATED });
    for (const [table, column, expression] of [["execution_activation_evidence_refs", "reference_id", "'TEST_ONLY:changed'"],
      ["execution_activation_compatibility_requirements", "exact_revision", "'TEST_ONLY.v2'"], ["execution_activation_events", "result", "'BLOCKED'"]]) {
      const before = (await db.query(`SELECT to_jsonb(t) AS row FROM ${identifier(table)} t WHERE plan_id=$1`, [roots[4].id])).rows;
      await refused(db, `UPDATE ${identifier(table)} SET ${identifier(column)}=${expression} WHERE plan_id=$1`, [roots[4].id], "P0001");
      await refused(db, `DELETE FROM ${identifier(table)} WHERE plan_id=$1`, [roots[4].id], "P0001");
      expect((await db.query(`SELECT to_jsonb(t) AS row FROM ${identifier(table)} t WHERE plan_id=$1`, [roots[4].id])).rows).toEqual(before);
    }
    expect((await db.query("SELECT owner_accepted,trusted_for_activation FROM execution_activation_evidence_refs WHERE plan_id=$1", [roots[4].id])).rows[0])
      .toEqual({ owner_accepted: false, trusted_for_activation: false });
  }));
  it("checked-in0142 Down SQL retains rows/guards; Up SQL safely reapplies without ledger downgrade", async () => fixture(async db => {
    // Execute only the exact checked-in0142 SQL halves inside this disposable
    // transaction. This is SQL reapplication proof, not a node-pg-migrate
    // history-ledger downgrade or permission to run older destructive Down files.
    const source = readFileSync(join(__dirname, "../migrations/1723680000142_execution-parent-capture-guards.sql"), "utf8");
    const marker = "-- Down Migration";
    expect(source.split(marker)).toHaveLength(2);
    const [up, down] = source.split(marker);
    expect(down.trim().length).toBeGreaterThan(0);
    // A transaction owns one pg client: do not queue concurrent queries on it.
    const snapshots = async () => {
      const rows: Record<string, unknown>[] = [];
      for (const root of roots) rows.push(await snapshot(db, root));
      return rows;
    };
    const before = await snapshots();
    const definitions = async () => (await db.query(`SELECT c.relname, t.tgname, pg_get_triggerdef(t.oid) AS definition
      FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
      JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND p.proname='protect_execution_parent_capture'
      ORDER BY c.relname,t.tgname`)).rows;
    const guards = await definitions();
    expect(guards).toHaveLength(6);
    expect(guards.map(row => row.relname).sort()).toEqual(roots.map(root => root.table).sort());
    await db.query(down);
    expect(await definitions()).toEqual(guards);
    expect(await snapshots()).toEqual(before);
    for (const root of roots) await refused(db,
      `DELETE FROM ${identifier(root.table)} WHERE ${where(root)}`, params(root));
    await db.query(up);
    expect(await definitions()).toEqual(guards);
    expect(await snapshots()).toEqual(before);
    for (const root of roots) {
      await refused(db, `UPDATE ${identifier(root.table)} SET created_at=created_at+interval '1 microsecond' WHERE ${where(root)}`, params(root));
    }
    await db.query("UPDATE governance_decision_plans SET status='EXPIRED' WHERE operation_id=$1", [roots[1].id]);
    const expired = await snapshot(db, roots[1]);
    expect(expired.status).toBe("EXPIRED");
    expect(captured(roots[1], expired)).toEqual(captured(roots[1], before[1]));
  }));
  it("fixture rollback retains no business rows and root guards need no test DELETE exemption", async () => {
    const counts = async () => (await pool.query(`SELECT (SELECT count(*) FROM portal_users WHERE user_id=$1)::int AS users,
      (SELECT count(*) FROM workspaces WHERE workspace_id=$2)::int AS workspaces`, [USER_A, WORKSPACE])).rows[0];
    const before = await counts();
    await fixture(async db => { for (const root of roots) expect(await snapshot(db, root)).toBeDefined(); });
    expect(await counts()).toEqual(before);
  });
});
