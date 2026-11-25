import type { Pool } from "pg";

/**
 * Projection lag signal.  Age is seconds since a snapshot's
 * last_successful_refresh_at.  State: OK (age <= laggingSeconds), LAGGING
 * (> laggingSeconds), STALE (> staleSeconds).  A configured profile with no
 * snapshot row has age null and reads STALE.  UNKNOWN is reported only when
 * the lag query itself failed.
 */
export type ProjectionLagState = "OK" | "LAGGING" | "STALE";

export interface ProjectionLagThresholds { laggingSeconds: number; staleSeconds: number }

export interface ProjectionLagProfile {
  environment: string;
  profile_id: string;
  snapshot_present: boolean;
  age_seconds: number | null;
  state: ProjectionLagState;
}

export function classifyProjectionLag(ageSeconds: number | null, t: ProjectionLagThresholds): ProjectionLagState {
  if (ageSeconds === null || !Number.isFinite(ageSeconds)) return "STALE";
  if (ageSeconds > t.staleSeconds) return "STALE";
  if (ageSeconds > t.laggingSeconds) return "LAGGING";
  return "OK";
}

const RANK: Record<ProjectionLagState, number> = { OK: 0, LAGGING: 1, STALE: 2 };

export function summariseProjectionLag(
  expected: readonly { environment: string; profileId: string }[],
  rows: readonly { environment: string; profile_id: string; age_seconds: number | string }[],
  t: ProjectionLagThresholds,
) {
  const profiles: ProjectionLagProfile[] = expected.map(({ environment, profileId }) => {
    const row = rows.find(r => r.environment === environment && r.profile_id === profileId);
    const age = row ? Math.max(0, Math.floor(Number(row.age_seconds))) : null;
    return {
      environment, profile_id: profileId, snapshot_present: row !== undefined,
      age_seconds: age, state: classifyProjectionLag(age, t),
    };
  });
  const worst = profiles.reduce<ProjectionLagState>((w, p) => RANK[p.state] > RANK[w] ? p.state : w, "OK");
  return {
    status: worst, lagging_after_seconds: t.laggingSeconds, stale_after_seconds: t.staleSeconds, profiles,
  };
}

/** Reads scalar columns only (never the profile document). Age is computed by the database clock. */
export async function readProjectionLag(
  pool: Pool,
  workspaceId: string,
  expected: readonly { environment: string; profileId: string }[],
  t: ProjectionLagThresholds,
) {
  try {
    const result = await pool.query(
      `SELECT environment, profile_id,
                    EXTRACT(EPOCH FROM (clock_timestamp() - last_successful_refresh_at))::float8 AS age_seconds
             FROM execution_profile_projection_snapshots WHERE workspace_id=$1`,
      [workspaceId],
    );
    return summariseProjectionLag(expected, result.rows, t);
  } catch {
    return { status: "UNKNOWN" as const, lagging_after_seconds: t.laggingSeconds, stale_after_seconds: t.staleSeconds, profiles: [] };
  }
}
