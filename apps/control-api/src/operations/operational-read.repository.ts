import { Inject, Injectable } from "@nestjs/common";
import type { Pool, PoolClient, QueryResultRow } from "pg";
import { CONTROL_API_POOL } from "../tokens";
import type { PostgresRowScope, PostgresSnapshotReader } from "../query/contracts";
import { OPERATIONAL_INCIDENT_LINK_BOUND } from "./operational-read.contract";

/** Finite SQL before decoding. All identifiers in SQL are static, all values
 * bound. This repository has NO legacy rich-detail/source/mutation port. */
@Injectable()
export class OperationalReadRepository {
  constructor(@Inject(CONTROL_API_POOL) readonly pool: Pool) {}

  private async read<T>(run: (db: PoolClient) => Promise<T>): Promise<T> {
    const db = await this.pool.connect();
    try {
      await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      await db.query("SET LOCAL statement_timeout='2000ms'");
      const result = await run(db); await db.query("COMMIT"); return result;
    } catch (error) { await db.query("ROLLBACK"); throw error; }
    finally { db.release(); }
  }

  async workflow(workspace: string, id: string, scope: PostgresRowScope): Promise<QueryResultRow | null> {
    return this.read(async db => {
      const result = await db.query(`SELECT q.*,
        f.operation_id IS NOT NULL AS f0_exists,
        (f.workspace_id=q.workspace_id AND f.command_key=q.command_key
          AND f.environment=q.environment AND f.target_type=q.target_type AND f.target_id=q.target_id
          AND (f.created_at=b.created_at OR date_trunc('milliseconds',f.created_at)=b.created_at)
          AND f.status=q.source_status
          AND f.risk_tier=q.risk_tier AND q.verification_result='NOT_STARTED'
          AND q.source_authority='PORTAL') AS f0_matches,
        CASE WHEN f.created_at=b.created_at THEN 'SQL_EXACT_SOURCE_TIMESTAMP'
          WHEN date_trunc('milliseconds',f.created_at)=b.created_at THEN 'LEGACY_DATE_MILLISECOND_COPY'
          ELSE NULL END AS provenance_basis,
        CASE WHEN octet_length(f.command_key) BETWEEN 3 AND 128 THEN f.command_key END AS f0_key,
        f.status AS f0_status,
        CASE WHEN cardinality(f.blocker_codes) BETWEEN 1 AND 3 AND octet_length(f.blocker_codes::text)<=512
          THEN f.blocker_codes END AS f0_blockers,
        CASE WHEN cardinality(f.warning_codes)=0 THEN f.warning_codes END AS f0_warnings,
        f.created_at AS f0_created, f.updated_at AS f0_updated,
        (EXISTS(SELECT 1 FROM governance_decision_plans g WHERE g.operation_id=q.operation_id AND g.workspace_id=q.workspace_id)
          OR EXISTS(SELECT 1 FROM governance_paper_exit_decision_plans p WHERE p.operation_id=q.operation_id AND p.workspace_id=q.workspace_id)) AS ambiguous
        FROM execution_operation_queue_v2 q
        JOIN execution_operation_queue_items b ON b.operation_id=q.operation_id AND b.workspace_id=q.workspace_id
        LEFT JOIN execution_command_plans_f0 f ON f.operation_id=q.operation_id AND f.workspace_id=q.workspace_id
        WHERE q.workspace_id=$1 AND q.operation_id=$2 AND EXISTS (
          SELECT 1 FROM jsonb_to_recordset($3::jsonb) AS s(kind text,id text,environment text)
          WHERE s.kind=q.target_type AND s.id=q.target_id AND s.environment=q.environment)`,
      [workspace, id, JSON.stringify(scope.allowedTuples.map(([kind, id, environment]) => ({ kind, id, environment })))]);
      return result.rows[0] ?? null;
    });
  }

  async incident(workspace: string, id: string, scope: PostgresRowScope): Promise<QueryResultRow | null> {
    return this.read(async db => {
      const result = await db.query(`SELECT incident_id,workspace_id,target_type,
        CASE WHEN octet_length(target_id) BETWEEN 1 AND 191 THEN target_id END AS target_id,
        environment,severity,workflow_state,workflow_version,acknowledged_at,mitigated_at,resolved_at,
        created_at,updated_at,source_integration_state,source_side_effect_requested,deployment_resume_requested
        FROM execution_incidents i WHERE workspace_id=$1 AND incident_id=$2 AND EXISTS (
          SELECT 1 FROM jsonb_to_recordset($3::jsonb) AS s(kind text,id text,environment text)
          WHERE s.kind=i.target_type AND s.id=i.target_id AND s.environment=i.environment)`,
      [workspace, id, JSON.stringify(scope.allowedTuples.map(([kind, id, environment]) => ({ kind, id, environment })))]);
      return result.rows[0] ?? null;
    });
  }

  async incidentUnchanged(workspace: string, id: string, row: QueryResultRow): Promise<boolean> {
    return this.read(async db => (await db.query(`SELECT 1 FROM execution_incidents
      WHERE workspace_id=$1 AND incident_id=$2 AND target_type=$3 AND target_id=$4
        AND environment=$5 AND workflow_version=$6`,
    [workspace, id, row.target_type, row.target_id, row.environment, row.workflow_version])).rowCount === 1);
  }

  /** FE-042. Runs INSIDE the queue page's own REPEATABLE READ snapshot (lent by the query service), so
   * links cannot disagree with the rows, counts and cursors of the same response. BOTH ends must be
   * independently inside the minted audit scope: the operation's tuple AND the incident's own tuple
   * (an incident's target is its own authorization; operation access never implies it). Links to
   * incidents outside the scope are not returned and not counted. The per-operation bound is applied
   * AFTER that authorization; `authorized_total` counts only authorized links. */
  async incidentLinks(snapshot: Pick<PostgresSnapshotReader<QueryResultRow>, "query">, workspace: string,
    operationIds: readonly string[], scope: PostgresRowScope): Promise<readonly QueryResultRow[]> {
    if (operationIds.length === 0) return [];
    const tuples = JSON.stringify(scope.allowedTuples.map(([kind, id, environment]) => ({ kind, id, environment })));
    return snapshot.query(`SELECT operation_id, incident_id, relationship, linked_at,
        target_type, target_id, environment, severity, workflow_state, authorized_total FROM (
      SELECT l.operation_id,
        CASE WHEN octet_length(l.incident_id) BETWEEN 1 AND 191 THEN l.incident_id END AS incident_id,
        l.relationship,
        CASE WHEN l.created_at >= '1970-01-01 UTC'::timestamptz AND l.created_at < '10000-01-01 UTC'::timestamptz
          THEN to_char(l.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') END AS linked_at,
        i.target_type, i.target_id, i.environment, i.severity, i.workflow_state,
        count(*) OVER (PARTITION BY l.operation_id) AS authorized_total,
        row_number() OVER (PARTITION BY l.operation_id
          ORDER BY l.created_at DESC, l.incident_id COLLATE "C" DESC) AS link_rank
      FROM execution_incident_operation_links l
      JOIN execution_operation_queue_items q ON q.workspace_id=l.workspace_id AND q.operation_id=l.operation_id
      JOIN execution_incidents i ON i.workspace_id=l.workspace_id AND i.incident_id=l.incident_id
      WHERE l.workspace_id=$1 AND l.operation_id = ANY($2::text[])
        AND EXISTS (SELECT 1 FROM jsonb_to_recordset($3::jsonb) AS s(kind text,id text,environment text)
          WHERE s.kind=q.target_type AND s.id=q.target_id AND s.environment=q.environment)
        AND EXISTS (SELECT 1 FROM jsonb_to_recordset($3::jsonb) AS s(kind text,id text,environment text)
          WHERE s.kind=i.target_type AND s.id=i.target_id AND s.environment=i.environment)
    ) ranked WHERE link_rank <= $4 ORDER BY operation_id COLLATE "C", link_rank`,
    [workspace, [...operationIds], tuples, OPERATIONAL_INCIDENT_LINK_BOUND]);
  }
}
