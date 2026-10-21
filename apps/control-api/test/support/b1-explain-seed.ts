/** BE-P18 B1 large-scale EXPLAIN gate: deterministic synthetic corpus for the operations queue V2.
 *
 * Everything is generated INSIDE PostgreSQL from `generate_series` and `hashtextextended`, so the same
 * (SEED_VERSION, scale) produces the same rows on the same PostgreSQL major version, with no JS random and no
 * clock. The corpus is TEST_ONLY and never imported by production code.
 *
 * Shape (scale 1.0): 1,000,000 operations, 200,000 incidents, up to 600,000 operation<->incident link attempts
 * (duplicates collapse on the primary key) across five workspaces. Targets are skewed (a few hot targets own many
 * operations, a long cold tail owns few) and `created_at` is a permutation of the insertion order, so heap order is
 * UNcorrelated with the queue's sort key: the worst realistic case for an index scan, not the friendliest. */
import type { Pool } from "pg";

export const SEED_VERSION = "be-p18-b1-explain-seed-v1";
export const SEED_USER = "b1x-user";
export const TARGET_TYPES = ["ACCOUNT", "PORTFOLIO", "DEPLOYMENT"] as const;
export const ENVIRONMENTS = ["PAPER", "SANDBOX", "LIVE"] as const;

export interface SeedWorkspace { readonly id: string; readonly label: string; readonly operations: number; readonly incidents: number; readonly targets: number }

const BASE: readonly SeedWorkspace[] = [
  { id: "b1x-ws-big", label: "big", operations: 600_000, incidents: 120_000, targets: 6_000 },
  { id: "b1x-ws-mid1", label: "mid1", operations: 150_000, incidents: 30_000, targets: 2_500 },
  { id: "b1x-ws-mid2", label: "mid2", operations: 150_000, incidents: 30_000, targets: 2_500 },
  { id: "b1x-ws-small1", label: "small1", operations: 50_000, incidents: 10_000, targets: 800 },
  { id: "b1x-ws-small2", label: "small2", operations: 50_000, incidents: 10_000, targets: 800 },
];

export function seedWorkspaces(scale: number): readonly SeedWorkspace[] {
  if (!(scale > 0 && scale <= 1)) throw new Error("scale must be in (0, 1]");
  return BASE.map(ws => ({ ...ws, operations: Math.max(200, Math.round(ws.operations * scale)),
    incidents: Math.max(40, Math.round(ws.incidents * scale)), targets: Math.max(60, Math.round(ws.targets * Math.sqrt(scale))) }));
}

/** The (type, id, environment) of target index `idx` of a workspace. Single source for the SQL seed and the scopes. */
export function targetTuple(ws: SeedWorkspace, idx: number): [string, string, string] {
  return [TARGET_TYPES[idx % 3], `tgt-${ws.label}-${idx}`, ENVIRONMENTS[Math.floor(idx / 3) % 3]];
}

/** SQL fragment: deterministic uniform [0,1) from a row number and a salt. */
const u = (n: string, salt: string) => `((hashtextextended(${n}::text || ':${salt}', 0) & 2147483647)::float8 / 2147483648.0)`;

export async function seedCorpus(pool: Pool, scale: number): Promise<{ readonly operations: number; readonly incidents: number; readonly links: number }> {
  const workspaces = seedWorkspaces(scale);
  await pool.query(`INSERT INTO portal_users(user_id, username, display_name, role, status, must_change_password)
    VALUES ($1,$1,'B1 explain seed user','ADMIN','ACTIVE',false) ON CONFLICT DO NOTHING`, [SEED_USER]);
  for (const ws of workspaces) {
    await pool.query("INSERT INTO workspaces(workspace_id, name, owner_user_id) VALUES ($1,$2,$3)", [ws.id, `B1 explain ${ws.label}`, SEED_USER]);
    // Operations. Target index = floor(T * u^2): hot head, cold tail. ~2% are SYSTEM-targeted (never authorizable here).
    await pool.query(`
      WITH g AS (
        SELECT i,
          CASE WHEN ${u("i", "sys")} < 0.02 THEN -1 ELSE floor($3::float8 * power(${u("i", "tgt")}, 2))::int END AS idx,
          ${u("i", "sev")} AS usev, ${u("i", "src")} AS usrc, ${u("i", "ver")} AS uver, ${u("i", "tri")} AS utri,
          ((i::bigint * 7919) % $2::bigint) AS slot, (hashtextextended(i::text || ':us', 0) & 1023) AS micro
        FROM generate_series(1, $2::int) AS s(i)
      ), r AS (
        SELECT g.*,
          CASE WHEN usev < 0.5 THEN 'INFO' WHEN usev < 0.8 THEN 'WARNING' WHEN usev < 0.95 THEN 'ERROR' ELSE 'CRITICAL' END AS severity,
          CASE WHEN usrc < 0.45 THEN 'SUCCEEDED' WHEN usrc < 0.65 THEN 'FAILED' WHEN usrc < 0.75 THEN 'PENDING'
               WHEN usrc < 0.82 THEN 'RUNNING' WHEN usrc < 0.89 THEN 'BLOCKED' WHEN usrc < 0.95 THEN 'EXPIRED' ELSE 'UNCERTAIN' END AS source_status,
          CASE WHEN uver < 0.40 THEN 'SUCCEEDED' WHEN uver < 0.55 THEN 'NOT_STARTED' WHEN uver < 0.68 THEN 'FAILED'
               WHEN uver < 0.78 THEN 'PENDING' WHEN uver < 0.86 THEN 'PARTIAL' WHEN uver < 0.92 THEN 'UNCERTAIN'
               WHEN uver < 0.97 THEN 'DENIED' ELSE 'EXPIRED' END AS verification_result,
          CASE WHEN utri < 0.15 THEN 'UNACKNOWLEDGED' WHEN utri < 0.40 THEN 'ACKNOWLEDGED' ELSE 'RESOLVED' END AS triage_state,
          timestamptz '2026-01-01 00:00:00+00' + slot * interval '2500 milliseconds' + micro * interval '1 microsecond' AS created_at
        FROM g
      )
      INSERT INTO execution_operation_queue_items(operation_id, workspace_id, operation_kind, command_key, environment,
        target_type, target_id, risk_tier, severity, source_authority, source_status, verification_result, triage_state,
        workflow_version, acknowledged_at, acknowledged_by_user_id, resolved_at, resolved_by_user_id, resolution_reason,
        resolution_evidence_hash, created_at, updated_at, assigned_to_user_id, assigned_at)
      SELECT 'op-' || $4::text || '-' || i, $1, 'EXECUTION_COMMAND',
        (ARRAY['account/sync','portfolio/rebalance','deployment/pause','deployment/resume'])[1 + (i % 4)],
        CASE WHEN idx < 0 THEN 'LIVE' ELSE (ARRAY['PAPER','SANDBOX','LIVE'])[1 + ((idx / 3) % 3)] END,
        CASE WHEN idx < 0 THEN 'SYSTEM' ELSE (ARRAY['ACCOUNT','PORTFOLIO','DEPLOYMENT'])[1 + (idx % 3)] END,
        CASE WHEN idx < 0 THEN 'sys-' || $4::text ELSE 'tgt-' || $4::text || '-' || idx END,
        'R2_SANDBOX', severity, 'PORTAL', source_status, verification_result, triage_state,
        CASE triage_state WHEN 'UNACKNOWLEDGED' THEN 1 WHEN 'ACKNOWLEDGED' THEN 2 ELSE 3 END,
        CASE WHEN triage_state <> 'UNACKNOWLEDGED' THEN created_at + interval '1 minute' END,
        CASE WHEN triage_state <> 'UNACKNOWLEDGED' THEN '${SEED_USER}' END,
        CASE WHEN triage_state = 'RESOLVED' THEN created_at + interval '1 hour' END,
        CASE WHEN triage_state = 'RESOLVED' THEN '${SEED_USER}' END,
        CASE WHEN triage_state = 'RESOLVED' THEN 'b1x synthetic resolution' END,
        CASE WHEN triage_state = 'RESOLVED' THEN 'sha256:' || md5(i::text) || md5(i::text || 'x') END,
        created_at,
        CASE triage_state WHEN 'UNACKNOWLEDGED' THEN created_at WHEN 'ACKNOWLEDGED' THEN created_at + interval '1 minute' ELSE created_at + interval '1 hour' END,
        CASE WHEN triage_state <> 'UNACKNOWLEDGED' THEN '${SEED_USER}' END,
        CASE WHEN triage_state <> 'UNACKNOWLEDGED' THEN created_at + interval '1 minute' END
      FROM r`, [ws.id, ws.operations, ws.targets, ws.label]);
    // Incidents. ~10% target SYSTEM/ORDER (outside the audit scope by construction); states 70/20/10.
    await pool.query(`
      WITH g AS (
        SELECT i, ${u("i", "itgt")} AS ut, ${u("i", "ist")} AS ust, ${u("i", "isev")} AS usev,
          timestamptz '2026-01-01 00:00:00+00' + ((i::bigint * 104729) % $2::bigint) * interval '5 seconds' AS created_at
        FROM generate_series(1, $2::int) AS s(i)
      ), r AS (
        SELECT g.*, floor($3::float8 * power(ut, 2))::int AS idx,
          CASE WHEN ust < 0.70 THEN 'OPEN' WHEN ust < 0.90 THEN 'MITIGATED' ELSE 'RESOLVED' END AS state
        FROM g
      )
      INSERT INTO execution_incidents(incident_id, workspace_id, title, summary, severity, environment, target_type, target_id,
        workflow_state, workflow_version, assigned_to_user_id, acknowledged_at, acknowledged_by_user_id, mitigated_at,
        mitigated_by_user_id, mitigation_evidence_hash, resolved_at, resolved_by_user_id, resolution_reason,
        clean_dry_run_evidence_hash, opened_by_user_id, created_at, updated_at)
      SELECT 'inc-' || $4::text || '-' || i, $1, 'b1x incident ' || i, 'b1x synthetic incident summary ' || i,
        CASE WHEN usev < 0.4 THEN 'INFO' WHEN usev < 0.75 THEN 'WARNING' WHEN usev < 0.95 THEN 'ERROR' ELSE 'CRITICAL' END,
        (ARRAY['PAPER','SANDBOX','LIVE'])[1 + ((idx / 3) % 3)],
        CASE WHEN ut < 0.05 THEN 'SYSTEM' WHEN ut < 0.10 THEN 'ORDER' ELSE (ARRAY['ACCOUNT','PORTFOLIO','DEPLOYMENT'])[1 + (idx % 3)] END,
        CASE WHEN ut < 0.10 THEN 'sys-' || $4::text || '-' || i ELSE 'tgt-' || $4::text || '-' || idx END,
        state, CASE state WHEN 'OPEN' THEN 1 WHEN 'MITIGATED' THEN 2 ELSE 3 END,
        CASE WHEN state <> 'OPEN' THEN '${SEED_USER}' END,
        CASE WHEN state <> 'OPEN' THEN created_at + interval '1 minute' END, CASE WHEN state <> 'OPEN' THEN '${SEED_USER}' END,
        CASE WHEN state <> 'OPEN' THEN created_at + interval '2 minutes' END, CASE WHEN state <> 'OPEN' THEN '${SEED_USER}' END,
        CASE WHEN state <> 'OPEN' THEN 'sha256:' || md5(i::text) || md5(i::text || 'm') END,
        CASE WHEN state = 'RESOLVED' THEN created_at + interval '1 hour' END, CASE WHEN state = 'RESOLVED' THEN '${SEED_USER}' END,
        CASE WHEN state = 'RESOLVED' THEN 'b1x synthetic resolution' END,
        CASE WHEN state = 'RESOLVED' THEN 'sha256:' || md5(i::text) || md5(i::text || 'c') END,
        '${SEED_USER}', created_at, created_at
      FROM r`, [ws.id, ws.incidents, ws.targets, ws.label]);
    // Links. Operation pick is skewed (some operations carry many links, so the bound of 3 truncates); incident is uniform.
    await pool.query(`
      INSERT INTO execution_incident_operation_links(incident_id, workspace_id, operation_id, relationship, linked_by_user_id, created_at)
      SELECT DISTINCT ON (incident_id, operation_id) incident_id, $1, operation_id, relationship, '${SEED_USER}', created_at FROM (
        SELECT 'inc-' || $4::text || '-' || (1 + floor($3::float8 * ${u("k", "linc")})::int) AS incident_id,
          'op-' || $4::text || '-' || (1 + floor($2::float8 * power(${u("k", "lop")}, 2))::int) AS operation_id,
          (ARRAY['TRIGGERED_BY','MITIGATES','RELATED'])[1 + ((hashtextextended(k::text || ':rel', 0) & 1023) % 3)::int] AS relationship,
          timestamptz '2026-02-01 00:00:00+00' + ((k::bigint * 15485863) % 31536000) * interval '1 second' AS created_at
        FROM generate_series(1, ($2::int * 6) / 10) AS s(k)) x
      ORDER BY incident_id, operation_id`, [ws.id, ws.operations, ws.incidents, ws.label]);
  }
  // Same state a long-running production table has: visibility map and statistics current (autovacuum would do this).
  for (const table of ["execution_operation_queue_items", "execution_incidents", "execution_incident_operation_links"]) {
    await pool.query(`VACUUM (ANALYZE) ${table}`);
  }
  const counts = await pool.query(`SELECT (SELECT count(*) FROM execution_operation_queue_items)::int AS operations,
    (SELECT count(*) FROM execution_incidents)::int AS incidents, (SELECT count(*) FROM execution_incident_operation_links)::int AS links`);
  return counts.rows[0];
}
