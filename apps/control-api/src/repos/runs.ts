import { Inject, Injectable } from "@nestjs/common";
import { Pool } from "pg";
import { CONTROL_API_POOL } from "../tokens";

export interface RunReadModel {
  runId: string;
  workspaceId: string;
  ownerUserId: string;
  status: string;
  protocol: string | null;
  strategyId: string | null;
  datasetId: string | null;
  sourceCursor: string | null;
  artifactSha256: string | null;
  artifactSchemaVersion: string | null;
  artifactCreatorUserId: string | null;
  methodologyClaimIds: string[];
  updatedAt: Date;
}

interface RunRow {
  run_id: string;
  workspace_id: string;
  owner_user_id: string;
  status: string;
  protocol: string | null;
  strategy_id: string | null;
  dataset_id: string | null;
  source_cursor: string | null;
  artifact_sha256: string | null;
  artifact_schema_version: string | null;
  artifact_creator_user_id: string | null;
  methodology_claim_ids: string[];
  updated_at: Date;
}

@Injectable()
export class RunsRepository {
  constructor(@Inject(CONTROL_API_POOL) private readonly pool: Pool) {}

  async upsert(input: {
    runId: string;
    workspaceId: string;
    ownerUserId: string;
    status: string;
    protocol?: string | null;
    strategyId?: string | null;
    datasetId?: string | null;
    sourceCursor?: string | null;
    artifactSha256?: string | null;
    artifactSchemaVersion?: string | null;
    artifactCreatorUserId?: string | null;
    methodologyClaimIds?: string[];
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO run_read_models
         (run_id, workspace_id, owner_user_id, status, protocol, strategy_id, dataset_id,
          source_cursor, artifact_sha256, artifact_schema_version,
          artifact_creator_user_id, methodology_claim_ids, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now())
       ON CONFLICT (run_id) DO UPDATE
         SET status = EXCLUDED.status,
             protocol = EXCLUDED.protocol,
             strategy_id = EXCLUDED.strategy_id,
             dataset_id = EXCLUDED.dataset_id,
             source_cursor = EXCLUDED.source_cursor,
             artifact_sha256 = EXCLUDED.artifact_sha256,
             artifact_schema_version = EXCLUDED.artifact_schema_version,
             artifact_creator_user_id = EXCLUDED.artifact_creator_user_id,
             methodology_claim_ids = EXCLUDED.methodology_claim_ids,
             updated_at = now()`,
      [
        input.runId,
        input.workspaceId,
        input.ownerUserId,
        input.status,
        input.protocol ?? null,
        input.strategyId ?? null,
        input.datasetId ?? null,
        input.sourceCursor ?? null,
        input.artifactSha256 ?? null,
        input.artifactSchemaVersion ?? null,
        input.artifactCreatorUserId ?? null,
        input.methodologyClaimIds ?? [],
      ],
    );
  }

  async listForWorkspace(workspaceId: string): Promise<RunReadModel[]> {
    const result = await this.pool.query<RunRow>(
      `SELECT * FROM run_read_models WHERE workspace_id = $1 ORDER BY updated_at DESC`,
      [workspaceId],
    );
    return result.rows.map((row) => ({
      runId: row.run_id,
      workspaceId: row.workspace_id,
      ownerUserId: row.owner_user_id,
      status: row.status,
      protocol: row.protocol,
      strategyId: row.strategy_id,
      datasetId: row.dataset_id,
      sourceCursor: row.source_cursor,
      artifactSha256: row.artifact_sha256,
      artifactSchemaVersion: row.artifact_schema_version,
      artifactCreatorUserId: row.artifact_creator_user_id,
      methodologyClaimIds: row.methodology_claim_ids,
      updatedAt: row.updated_at,
    }));
  }

  async findByRunId(runId: string): Promise<RunReadModel | null> {
    const result = await this.pool.query<RunRow>(
      `SELECT * FROM run_read_models WHERE run_id = $1`,
      [runId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      runId: row.run_id,
      workspaceId: row.workspace_id,
      ownerUserId: row.owner_user_id,
      status: row.status,
      protocol: row.protocol,
      strategyId: row.strategy_id,
      datasetId: row.dataset_id,
      sourceCursor: row.source_cursor,
      artifactSha256: row.artifact_sha256,
      artifactSchemaVersion: row.artifact_schema_version,
      artifactCreatorUserId: row.artifact_creator_user_id,
      methodologyClaimIds: row.methodology_claim_ids,
      updatedAt: row.updated_at,
    };
  }
}
