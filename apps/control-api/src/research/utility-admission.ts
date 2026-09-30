/** One cross-replica admission budget for explicit Research utility work. */
import type { PoolClient } from "pg";

export const UTILITY_WORKSPACE_LIMIT = 4;
export const UTILITY_ACTOR_LIMIT = 2;

export class ResearchUtilitySaturated extends Error {
  constructor() {
    super("Research utility work is temporarily saturated; retry shortly.");
  }
}

/** Call inside the same write transaction that allocates the new work. */
export async function assertUtilityCapacity(
  client: PoolClient,
  workspaceId: string,
  actorUserId: string,
): Promise<void> {
  // Every writer takes this lock before counting and inserting its own work.
  // It is transaction-scoped, so crashes cannot strand an admission lock.
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`research-utility:${workspaceId}`]);
  const counts = await client.query<{ total: string; actor: string }>(
    `WITH active AS (
       SELECT requested_by_user_id AS actor FROM research.run_report_export_jobs_v1
        WHERE workspace_id = $1 AND state IN ('QUEUED', 'RUNNING')
       UNION ALL
       SELECT requested_by_user_id AS actor FROM research.jobs
        WHERE workspace_id = $1 AND job_kind = 'DIAGNOSTIC'
          AND state IN ('QUEUED', 'CLAIMED', 'RUNNING')
       UNION ALL
       SELECT actor_user_id AS actor FROM research.utility_verify_slots_v1
        WHERE workspace_id = $1 AND expires_at > now()
     )
     SELECT count(*)::text AS total,
            count(*) FILTER (WHERE actor = $2)::text AS actor FROM active`,
    [workspaceId, actorUserId],
  );
  const count = counts.rows[0];
  if (!count || Number(count.total) >= UTILITY_WORKSPACE_LIMIT || Number(count.actor) >= UTILITY_ACTOR_LIMIT) {
    throw new ResearchUtilitySaturated();
  }
}
