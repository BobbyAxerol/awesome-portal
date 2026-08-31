import { Inject, Injectable } from "@nestjs/common";
import { Pool, PoolClient } from "pg";
import { CONTROL_API_POOL } from "../tokens";
import { ManagerListEnvironment } from "./contracts";

export interface ProjectionSnapshot {
  sourceAsOf: Date | null;
  sourceCompleteness: "COMPLETE" | "PARTIAL" | "UNKNOWN";
  rowCount: number;
  refreshedAt: Date;
}

export interface AlphaProjectionRecord {
  alphaId: string;
  alphaLabel: string;
  version: string;
  stage: string;
  deployments: readonly { deployment_id: string; stage: string; venue: string }[];
  updatedAt: Date;
}

export interface BindingProjectionRecord {
  bindingId: string;
  accountId: string;
  venue: string;
  state: string;
  credentialState: string;
  updatedAt: Date;
}

@Injectable()
export class ManagerListsRepository {
  constructor(@Inject(CONTROL_API_POOL) readonly pool: Pool) {}

  async snapshot(
    workspaceId: string,
    environment: ManagerListEnvironment,
    kind: "ALPHA_FLEET" | "BINDINGS",
  ): Promise<ProjectionSnapshot | null> {
    const result = await this.pool.query<{
      source_as_of: Date | null; source_completeness: ProjectionSnapshot["sourceCompleteness"];
      row_count: number; refreshed_at: Date;
    }>(
      `SELECT source_as_of, source_completeness, row_count, refreshed_at
         FROM execution_manager_projection_snapshots
        WHERE workspace_id = $1 AND environment = $2 AND projection_kind = $3`,
      [workspaceId, environment, kind],
    );
    const row = result.rows[0];
    return row ? {
      sourceAsOf: row.source_as_of,
      sourceCompleteness: row.source_completeness,
      rowCount: row.row_count,
      refreshedAt: row.refreshed_at,
    } : null;
  }

  async replaceAlphaFleet(input: {
    workspaceId: string; environment: ManagerListEnvironment; sourceAsOf: Date | null;
    completeness: ProjectionSnapshot["sourceCompleteness"]; rows: readonly AlphaProjectionRecord[];
  }): Promise<void> {
    await this.transaction(`fleet:${input.workspaceId}:${input.environment}`, async (client, refreshedAt) => {
      const scope = `${input.workspaceId}:${input.environment}`;
      await client.query(`DELETE FROM execution_alpha_fleet_projection WHERE scope_id = $1`, [scope]);
      for (const row of input.rows) {
        await client.query(
          `INSERT INTO execution_alpha_fleet_projection
             (scope_id, workspace_id, environment, alpha_id, alpha_label, version, stage,
              deployments, updated_at, source_as_of, projection_refreshed_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11)`,
          [scope, input.workspaceId, input.environment, row.alphaId, row.alphaLabel, row.version,
            row.stage, JSON.stringify(row.deployments), row.updatedAt, input.sourceAsOf, refreshedAt],
        );
      }
      await this.upsertSnapshot(client, input.workspaceId, input.environment, "ALPHA_FLEET",
        input.sourceAsOf, input.completeness, input.rows.length, refreshedAt);
    });
  }

  async replaceBindings(input: {
    workspaceId: string; environment: ManagerListEnvironment; sourceAsOf: Date | null;
    completeness: ProjectionSnapshot["sourceCompleteness"]; rows: readonly BindingProjectionRecord[];
  }): Promise<void> {
    await this.transaction(`bindings:${input.workspaceId}:${input.environment}`, async (client, refreshedAt) => {
      const scope = `${input.workspaceId}:${input.environment}`;
      await client.query(`DELETE FROM execution_binding_projection WHERE scope_id = $1`, [scope]);
      for (const row of input.rows) {
        await client.query(
          `INSERT INTO execution_binding_projection
             (scope_id, workspace_id, environment, binding_id, account_id, venue, state,
              credential_state, updated_at, source_as_of, projection_refreshed_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [scope, input.workspaceId, input.environment, row.bindingId, row.accountId, row.venue,
            row.state, row.credentialState, row.updatedAt, input.sourceAsOf, refreshedAt],
        );
      }
      await this.upsertSnapshot(client, input.workspaceId, input.environment, "BINDINGS",
        input.sourceAsOf, input.completeness, input.rows.length, refreshedAt);
    });
  }

  async binding(scopeId: string, bindingId: string): Promise<BindingProjectionRecord | null> {
    const result = await this.pool.query<{
      binding_id: string; account_id: string; venue: string; state: string;
      credential_state: string; updated_at: Date;
    }>(
      `SELECT binding_id, account_id, venue, state, credential_state, updated_at
         FROM execution_binding_projection WHERE scope_id = $1 AND binding_id = $2`,
      [scopeId, bindingId],
    );
    const row = result.rows[0];
    return row ? {
      bindingId: row.binding_id, accountId: row.account_id, venue: row.venue,
      state: row.state, credentialState: row.credential_state, updatedAt: row.updated_at,
    } : null;
  }

  private async transaction(
    lock: string,
    action: (client: PoolClient, refreshedAt: Date) => Promise<void>,
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [lock]);
      const now = await client.query<{ now: Date }>("SELECT clock_timestamp() AS now");
      await action(client, now.rows[0].now);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private upsertSnapshot(
    client: PoolClient, workspaceId: string, environment: ManagerListEnvironment,
    kind: "ALPHA_FLEET" | "BINDINGS", sourceAsOf: Date | null,
    completeness: ProjectionSnapshot["sourceCompleteness"], rowCount: number, refreshedAt: Date,
  ) {
    return client.query(
      `INSERT INTO execution_manager_projection_snapshots
         (workspace_id, environment, projection_kind, source_as_of, source_completeness, row_count, refreshed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (workspace_id, environment, projection_kind) DO UPDATE SET
         source_as_of = EXCLUDED.source_as_of,
         source_completeness = EXCLUDED.source_completeness,
         row_count = EXCLUDED.row_count,
         refreshed_at = EXCLUDED.refreshed_at`,
      [workspaceId, environment, kind, sourceAsOf, completeness, rowCount, refreshedAt],
    );
  }
}
