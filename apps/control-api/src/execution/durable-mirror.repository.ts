import { createHash, randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { Pool, PoolClient } from "pg";
import { ControlApiConfig, querySigningKeys } from "../config";
import { CONTROL_API_CONFIG, CONTROL_API_POOL } from "../tokens";
import { KeysetCursorCodec, queryFingerprint } from "../query";
import {
  DurableMirrorCommitInput,
  DurableMirrorCommitResult,
  DurableMirrorScope,
  DurableMirrorWriter,
} from "./durable-mirror.contract";
import { ProjectionRelation, ProjectionRow, ProjectionScalar } from "./profile-projection.repository";

type MirrorState = "AVAILABLE" | "PARTIAL" | "UNAVAILABLE";
type ResourceKind = "strategy" | "deployment" | "account" | "portfolio" | "binding";
type MirrorObservation = NonNullable<DurableMirrorCurrentPage["observation"]> & { reason_code: string | null };

interface RangeCandidate {
  relationKey: string;
  rowId: string;
  ts: string;
  strategyId: string | null;
  deploymentId: string | null;
  accountId: string | null;
  portfolioId: string | null;
  bindingId: string | null;
  digest: string;
  fields: Record<string, ProjectionScalar>;
}

interface RangeConflict {
  relationKey: string;
  rowId: string;
  existingDigest: string;
  incomingDigest: string;
}

interface RangeGap {
  relationKey: string;
  reasonCode: "EDS06_RANGE_ROW_ID_MISSING" | "EDS06_RANGE_TIMESTAMP_MISSING";
}

export interface DurableMirrorCurrentPage {
  schema_version: "portal.execution.durable-mirror-current.v1";
  state: MirrorState;
  reason_code: string | null;
  revision: {
    read_model_revision: string;
    projection_epoch: string;
    projection_sequence: number;
    payload_digest: string;
    received_at: string;
  } | null;
  observation: {
    availability: "AVAILABLE" | "UNAVAILABLE";
    completeness: "COMPLETE" | "PARTIAL" | "UNKNOWN";
    freshness: "FRESH" | "AGING" | "STALE" | "UNKNOWN";
    as_of: string | null;
  } | null;
  rows: Array<{ entity_key: string; fields: Record<string, ProjectionScalar> }>;
  next_cursor: string | null;
}

export interface DurableMirrorRangePage {
  schema_version: "portal.execution.durable-mirror-range.v1";
  state: MirrorState;
  reason_code: string | null;
  revision: {
    read_model_revision: string;
    projection_epoch: string;
    projection_sequence: number;
    payload_digest: string;
    received_at: string;
  } | null;
  observation: {
    availability: "AVAILABLE" | "UNAVAILABLE";
    completeness: "COMPLETE" | "PARTIAL" | "UNKNOWN";
    freshness: "FRESH" | "AGING" | "STALE" | "UNKNOWN";
    as_of: string | null;
  } | null;
  /**
   * Exact Portal-retained coverage for the accepted scope.  This is not a
   * source-total or an event-history claim: Manager-v2 only proves bounded
   * retained decision/snapshot pages.
   */
  coverage: {
    retained_total: string | null;
    oldest_available_at: string | null;
    newest_available_at: string | null;
  };
  rows: Array<{ row_id: string; ts: string; fields: Record<string, ProjectionScalar> }>;
  next_cursor: string | null;
}

const RANGE_RELATIONS: Readonly<Record<string, { idField: string; timestampField: string }>> = {
  "manager.performance:performance_snapshots": { idField: "id", timestampField: "ts" },
  "manager.performance:account_equity_snapshots": { idField: "id", timestampField: "ts" },
  "manager.performance:portfolio_equity_snapshots": { idField: "id", timestampField: "ts" },
  "manager.fills:fills": { idField: "fill_id", timestampField: "trade_time" },
  "manager.risk:risk_grants": { idField: "risk_grant_id", timestampField: "created_at" },
  "manager.risk:sizing_decisions": { idField: "decision_id", timestampField: "created_at" },
};

const CURRENT_KEY_FIELDS: Readonly<Record<string, readonly string[]>> = {
  "manager.strategies:strategies": ["strategy_id"],
  "manager.deployments:strategy_deployments": ["deployment_id"],
  "manager.accounts:accounts": ["account_id"],
  "manager.accounts:account_balances": ["account_id", "currency"],
  "manager.portfolios:portfolios": ["portfolio_id"],
  "manager.portfolios:portfolio_allocations": ["allocation_id"],
  "manager.positions:positions_v2": ["position_id"],
  "manager.reconciliation:reconciliation_findings": ["finding_id"],
  "manager.venue-accounts:venue_accounts": ["venue_account_id"],
  "manager.accounts:broker_account_sync_effective": ["sync_id"],
  "manager.sessions:execution_sessions": ["execution_session_id"],
  "manager.orders:orders": ["order_id"],
  "manager.conditional-orders:conditional_order_groups": ["group_id"],
  "manager.conditional-orders:conditional_order_group_legs": ["group_id", "leg_id"],
  "manager.command-journal:command_journal": ["command_id"],
  "manager.accounts:margin_balances": ["account_id", "instrument_id", "currency"],
  "manager.accounts:account_sync_effective": ["sync_id"],
};

@Injectable()
export class ExecutionDurableMirrorRepository implements DurableMirrorWriter {
  private readonly cursorCodec: KeysetCursorCodec;

  constructor(
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
    @Inject(CONTROL_API_POOL) private readonly pool: Pool,
  ) {
    this.cursorCodec = new KeysetCursorCodec({
      activeKeyId: config.QUERY_CURSOR_ACTIVE_KEY_ID,
      keys: querySigningKeys(config),
      ttlSeconds: config.QUERY_CURSOR_TTL_SECONDS,
    });
  }

  async commitAcceptedProjection(
    client: PoolClient,
    input: DurableMirrorCommitInput,
  ): Promise<DurableMirrorCommitResult> {
    if (this.config.FEATURE_EXECUTION_DURABLE_MIRROR !== "true") return { outcome: "DISABLED" };

    const batchId = randomUUID();
    const revisionId = randomUUID();
    const scope = scopeFromDocument(input.document);
    const observations = relationObservations(input.document);
    const rangeCollection = rangeCandidates(input.document, input.retainedRangeRows);
    const conflicts = await this.findRangeConflicts(client, scope, rangeCollection.rows);

    await client.query(
      `INSERT INTO execution_durable_mirror_batches
         (batch_id,workspace_id,environment,profile_id,source_contract_revision,source_epoch,
          source_cursor_digest,source_as_of,received_at,completeness,projection_epoch,
          projection_sequence,payload_digest,read_model_revision,relation_count,state)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::uuid,$12,$13,$14::uuid,$15,'PENDING')`,
      [batchId, scope.workspaceId, scope.environment, scope.profileId,
        input.document.source_contract_revision, input.sourceEpoch, digest(input.sourceCursor),
        input.sourceAsOf, input.receivedAt, input.completeness, input.projectionEpoch,
        input.projectionSequence, input.payloadDigest, revisionId, observations.length],
    );
    await this.insertObservations(client, batchId, scope, input.receivedAt, observations);
    for (const gap of rangeCollection.gaps) {
      await this.insertGap(client, batchId, scope, gap.relationKey, null, gap.reasonCode, input.receivedAt);
    }

    if (conflicts.length > 0) {
      for (const conflict of conflicts) {
        await client.query(
          `INSERT INTO execution_durable_mirror_conflicts
             (conflict_id,batch_id,workspace_id,environment,profile_id,relation_key,row_id,
              existing_digest,incoming_digest,reason_code,detected_at)
           VALUES ($1::uuid,$2::uuid,$3,$4,$5,$6,$7,$8,$9,
                   'EDS06_EXACT_RANGE_DIGEST_CONFLICT',$10)`,
          [randomUUID(), batchId, scope.workspaceId, scope.environment, scope.profileId,
            conflict.relationKey, conflict.rowId, conflict.existingDigest,
            conflict.incomingDigest, input.receivedAt],
        );
      }
      await this.insertRevision(client, {
        revisionId, batchId, scope, input, state: "QUARANTINED", current: false,
      });
      await client.query(
        `UPDATE execution_durable_mirror_batches
            SET state='QUARANTINED', committed_at=$2
          WHERE batch_id=$1::uuid`,
        [batchId, input.receivedAt],
      );
      return {
        outcome: "QUARANTINED",
        reasonCode: "EDS09B_DURABLE_OBSERVATION_QUARANTINED",
      };
    }

    await this.insertRevision(client, {
      revisionId, batchId, scope, input, state: "COMMITTED", current: false,
    });
    await this.upsertCurrentEntities(client, batchId, revisionId, scope, input.document, input.receivedAt);
    await this.insertRangeRows(client, batchId, scope, rangeCollection.rows, input.receivedAt);
    await this.upsertContinuations(client, batchId, revisionId, scope, input, input.receivedAt);
    await client.query(
      `UPDATE execution_durable_mirror_revisions
          SET is_current=false
        WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3
          AND read_model_revision <> $4::uuid AND is_current=true`,
      [scope.workspaceId, scope.environment, scope.profileId, revisionId],
    );
    await client.query(
      `UPDATE execution_durable_mirror_revisions
          SET is_current=true
        WHERE read_model_revision=$1::uuid`,
      [revisionId],
    );
    await client.query(
      `UPDATE execution_durable_mirror_batches
          SET state='COMMITTED', committed_at=$2
        WHERE batch_id=$1::uuid`,
      [batchId, input.receivedAt],
    );
    return { outcome: "COMMITTED" };
  }

  /**
   * Server-side, relation-bound current read. This is intentionally not a
   * browser route; later BFFs may consume it only after their own auth/scope
   * contract is accepted.
   */
  async currentPage(input: DurableMirrorScope & {
    relationKey: string;
    limit?: number;
    after?: string | null;
  }): Promise<DurableMirrorCurrentPage> {
    return this.stableRead(async (client) => {
    const revision = await this.currentRevision(client, input);
    if (!revision) return emptyCurrent("EDS06_MIRROR_NOT_READY");
    const observation = await this.observationForCurrentRevision(client, input, revision.read_model_revision, input.relationKey);
    if (!observation) return emptyCurrent("EDS06_RELATION_NOT_MIRRORED", revision);
    if (observation.availability === "UNAVAILABLE") {
      return emptyCurrent(observation.reason_code ?? "EDS06_RELATION_UNAVAILABLE", revision, observation);
    }
    const limit = pageLimit(input.limit);
    const cursorContext = currentCursorContext(input, limit);
    const boundary = input.after
      ? this.cursorCodec.decode(input.after, {
        resourceId: "execution-durable-current-v1",
        workspaceId: input.workspaceId,
        direction: "after",
        queryFingerprint: cursorContext,
        boundarySize: 1,
      })
      : null;
    const result = await client.query<{ entity_key: string; fields: Record<string, ProjectionScalar> }>(
      `SELECT entity_key, fields
         FROM execution_durable_mirror_current_entities
        WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3 AND relation_key=$4
          AND last_read_model_revision=$5::uuid
          ${boundary ? "AND entity_key > $6" : ""}
        ORDER BY entity_key ASC
        LIMIT $${boundary ? 7 : 6}`,
      boundary
        ? [input.workspaceId, input.environment, input.profileId, input.relationKey, revision.read_model_revision, String(boundary[0]), limit + 1]
        : [input.workspaceId, input.environment, input.profileId, input.relationKey, revision.read_model_revision, limit + 1],
    );
    const rows = result.rows.slice(0, limit);
    const nextCursor = result.rows.length > limit && rows.length > 0
      ? this.cursorCodec.encode({
        resource_id: "execution-durable-current-v1",
        workspace_id: input.workspaceId,
        direction: "after",
        query_fingerprint: cursorContext,
        boundary: [rows.at(-1)!.entity_key],
      })
      : null;
    return {
      schema_version: "portal.execution.durable-mirror-current.v1",
      state: observation.completeness === "PARTIAL" ? "PARTIAL" : "AVAILABLE",
      reason_code: observation.completeness === "PARTIAL" ? "EDS06_CURRENT_RELATION_PARTIAL" : null,
      revision,
      observation,
      rows,
      next_cursor: nextCursor,
    };
    });
  }

  /** Range reads use exact (timestamp,row-id) keysets and one declared resource dimension. */
  async rangePage(input: DurableMirrorScope & {
    relationKey: string;
    resource?: { kind: ResourceKind; id: string };
    from?: string | null;
    to?: string | null;
    limit?: number;
    after?: string | null;
  }): Promise<DurableMirrorRangePage> {
    return this.stableRead(async (client) => {
    const revision = await this.currentRevision(client, input);
    if (!revision) return emptyRange("EDS06_MIRROR_NOT_READY");
    const observation = await this.observationForCurrentRevision(client, input, revision.read_model_revision, input.relationKey);
    if (!observation) return emptyRange("EDS06_RELATION_NOT_MIRRORED", revision);
    if (observation.availability === "UNAVAILABLE") {
      return emptyRange(observation.reason_code ?? "EDS06_RELATION_UNAVAILABLE", revision, observation);
    }
    const limit = pageLimit(input.limit);
    const range = checkedTimeRange(input.from ?? null, input.to ?? null);
    const resource = input.resource ? checkedResource(input.resource) : null;
    const cursorContext = rangeCursorContext(input, limit, resource, range);
    const boundary = input.after
      ? this.cursorCodec.decode(input.after, {
        resourceId: `execution-durable-range-v1:${input.relationKey}`,
        workspaceId: input.workspaceId,
        direction: "after",
        queryFingerprint: cursorContext,
        boundarySize: 2,
      })
      : null;
    const values: unknown[] = [input.workspaceId, input.environment, input.profileId, input.relationKey];
    const where = ["workspace_id=$1", "environment=$2", "profile_id=$3", "relation_key=$4"];
    if (range.from) { values.push(range.from); where.push(`ts >= $${values.length}::timestamptz`); }
    if (range.to) { values.push(range.to); where.push(`ts <= $${values.length}::timestamptz`); }
    if (resource) { values.push(resource.id); where.push(`${resource.column}=$${values.length}`); }
    const coverage = await client.query<{
      retained_total: string;
      oldest_available_at: Date | null;
      newest_available_at: Date | null;
    }>(
      `SELECT count(*)::text AS retained_total,min(ts) AS oldest_available_at,max(ts) AS newest_available_at
         FROM execution_durable_mirror_range_rows
        WHERE ${where.join(" AND ")}`,
      values,
    );
    if (boundary) {
      values.push(String(boundary[0]), String(boundary[1]));
      where.push(`(ts, row_id) > ($${values.length - 1}::timestamptz, $${values.length})`);
    }
    values.push(limit + 1);
    const result = await client.query<{ row_id: string; ts: Date; fields: Record<string, ProjectionScalar> }>(
      `SELECT row_id, ts, fields
         FROM execution_durable_mirror_range_rows
        WHERE ${where.join(" AND ")}
        ORDER BY ts ASC, row_id ASC
        LIMIT $${values.length}`,
      values,
    );
    const rows = result.rows.slice(0, limit).map((row) => ({
      row_id: row.row_id,
      ts: row.ts.toISOString(),
      fields: row.fields,
    }));
    const nextCursor = result.rows.length > limit && rows.length > 0
      ? this.cursorCodec.encode({
        resource_id: `execution-durable-range-v1:${input.relationKey}`,
        workspace_id: input.workspaceId,
        direction: "after",
        query_fingerprint: cursorContext,
        boundary: [rows.at(-1)!.ts, rows.at(-1)!.row_id],
      })
      : null;
    return {
      schema_version: "portal.execution.durable-mirror-range.v1",
      state: observation.completeness === "PARTIAL" ? "PARTIAL" : "AVAILABLE",
      reason_code: observation.completeness === "PARTIAL" ? "EDS06_RANGE_RELATION_PARTIAL" : null,
      revision,
      observation,
      coverage: {
        retained_total: coverage.rows[0]?.retained_total ?? "0",
        oldest_available_at: coverage.rows[0]?.oldest_available_at?.toISOString() ?? null,
        newest_available_at: coverage.rows[0]?.newest_available_at?.toISOString() ?? null,
      },
      rows,
      next_cursor: nextCursor,
    };
    });
  }

  async compareCurrentDocument(input: { document: DurableMirrorCommitInput["document"] }): Promise<{
    state: "MATCH" | "MISMATCH" | "NOT_READY";
    relation_keys: string[];
  }> {
    return this.stableRead(async (client) => {
    const scope = scopeFromDocument(input.document);
    const revision = await this.currentRevision(client, scope);
    if (!revision) return { state: "NOT_READY", relation_keys: Object.keys(input.document.relations).sort() };
    const observed = await client.query<{ relation_key: string; source_relation_digest: string }>(
      `SELECT relation_key, source_relation_digest
         FROM execution_durable_mirror_observations
        WHERE batch_id=(SELECT batch_id FROM execution_durable_mirror_revisions WHERE read_model_revision=$1::uuid)`,
      [revision.read_model_revision],
    );
    const expected = new Map(Object.entries(input.document.relations)
      .map(([key, relation]) => [key, digest(relation)]));
    const mismatches = observed.rows
      .filter((row) => expected.get(row.relation_key) !== row.source_relation_digest)
      .map((row) => row.relation_key);
    for (const key of expected.keys()) {
      if (!observed.rows.some((row) => row.relation_key === key)) mismatches.push(key);
    }
    return { state: mismatches.length === 0 ? "MATCH" : "MISMATCH", relation_keys: [...new Set(mismatches)].sort() };
    });
  }

  private async findRangeConflicts(
    client: PoolClient,
    scope: DurableMirrorScope,
    rows: readonly RangeCandidate[],
  ): Promise<RangeConflict[]> {
    const conflicts: RangeConflict[] = [];
    const seen = new Map<string, RangeCandidate>();
    for (const row of rows) {
      const key = `${row.relationKey}\u0000${row.rowId}`;
      const duplicate = seen.get(key);
      if (duplicate && duplicate.digest !== row.digest) {
        conflicts.push({ relationKey: row.relationKey, rowId: row.rowId, existingDigest: duplicate.digest, incomingDigest: row.digest });
      }
      seen.set(key, row);
    }
    for (const row of seen.values()) {
      const existing = await client.query<{ source_row_digest: string }>(
        `SELECT source_row_digest
           FROM execution_durable_mirror_range_rows
          WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3 AND relation_key=$4 AND row_id=$5
          FOR KEY SHARE`,
        [scope.workspaceId, scope.environment, scope.profileId, row.relationKey, row.rowId],
      );
      const digestFromStore = existing.rows[0]?.source_row_digest;
      if (digestFromStore && digestFromStore !== row.digest) {
        conflicts.push({ relationKey: row.relationKey, rowId: row.rowId, existingDigest: digestFromStore, incomingDigest: row.digest });
      }
    }
    return dedupeConflicts(conflicts);
  }

  private async insertObservations(
    client: PoolClient,
    batchId: string,
    scope: DurableMirrorScope,
    receivedAt: Date,
    rows: readonly { relationKey: string; relation: ProjectionRelation; relationDigest: string }[],
  ): Promise<void> {
    for (const row of rows) {
      await client.query(
        `INSERT INTO execution_durable_mirror_observations
           (batch_id,workspace_id,environment,profile_id,relation_key,source_id,relation_name,
            availability,reason_code,as_of,freshness,completeness,item_count,source_relation_digest,observed_at)
         VALUES ($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9,$10::timestamptz,$11,$12,$13,$14,$15)`,
        [batchId, scope.workspaceId, scope.environment, scope.profileId, row.relationKey,
          row.relation.source_id, row.relation.relation, row.relation.availability,
          row.relation.reason_code, row.relation.as_of, row.relation.freshness,
          row.relation.completeness, row.relation.items.length, row.relationDigest, receivedAt],
      );
    }
  }

  private async insertRevision(
    client: PoolClient,
    input: {
      revisionId: string;
      batchId: string;
      scope: DurableMirrorScope;
      input: DurableMirrorCommitInput;
      state: "COMMITTED" | "QUARANTINED";
      current: boolean;
    },
  ): Promise<void> {
    await client.query(
      `INSERT INTO execution_durable_mirror_revisions
         (read_model_revision,batch_id,workspace_id,environment,profile_id,projection_epoch,
          projection_sequence,payload_digest,state,is_current)
       VALUES ($1::uuid,$2::uuid,$3,$4,$5,$6::uuid,$7,$8,$9,$10)`,
      [input.revisionId, input.batchId, input.scope.workspaceId, input.scope.environment,
        input.scope.profileId, input.input.projectionEpoch, input.input.projectionSequence,
        input.input.payloadDigest, input.state, input.current],
    );
  }

  private async upsertCurrentEntities(
    client: PoolClient,
    batchId: string,
    revisionId: string,
    scope: DurableMirrorScope,
    document: DurableMirrorCommitInput["document"],
    observedAt: Date,
  ): Promise<void> {
    for (const [relationKey, relation] of Object.entries(document.relations)) {
      if (RANGE_RELATIONS[relationKey]) continue;
      if (relation.availability !== "AVAILABLE") continue;
      const keys = new Set<string>();
      for (const row of relation.items) {
        const entityKey = entityKeyFor(relationKey, row.fields);
        if (!entityKey) {
          await this.insertGap(client, batchId, scope, relationKey, null, "EDS06_CURRENT_ENTITY_KEY_MISSING", observedAt);
          continue;
        }
        keys.add(entityKey);
        const dimensions = dimensionsOf(row.fields);
        await client.query(
          `INSERT INTO execution_durable_mirror_current_entities
             (workspace_id,environment,profile_id,relation_key,entity_key,strategy_id,deployment_id,
              account_id,portfolio_id,binding_id,source_row_digest,fields,first_observed_batch_id,
              last_observed_batch_id,last_read_model_revision,first_observed_at,last_observed_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::uuid,$13::uuid,$14::uuid,$15,$15)
           ON CONFLICT (workspace_id,environment,profile_id,relation_key,entity_key) DO UPDATE SET
             strategy_id=EXCLUDED.strategy_id, deployment_id=EXCLUDED.deployment_id,
             account_id=EXCLUDED.account_id, portfolio_id=EXCLUDED.portfolio_id,
             binding_id=EXCLUDED.binding_id, source_row_digest=EXCLUDED.source_row_digest,
             fields=EXCLUDED.fields, last_observed_batch_id=EXCLUDED.last_observed_batch_id,
             last_read_model_revision=EXCLUDED.last_read_model_revision,
             last_observed_at=EXCLUDED.last_observed_at`,
          [scope.workspaceId, scope.environment, scope.profileId, relationKey, entityKey,
            dimensions.strategyId, dimensions.deploymentId, dimensions.accountId,
            dimensions.portfolioId, dimensions.bindingId, digest(row.fields), JSON.stringify(row.fields),
            batchId, revisionId, observedAt],
        );
      }
      // A source page declared COMPLETE is a current observation. Only in that
      // case may an absent key be removed; PARTIAL never becomes a false delete.
      if (relation.completeness === "COMPLETE") {
        await client.query(
          `DELETE FROM execution_durable_mirror_current_entities
            WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3 AND relation_key=$4
              AND last_observed_batch_id <> $5::uuid`,
          [scope.workspaceId, scope.environment, scope.profileId, relationKey, batchId],
        );
      }
    }
  }

  private async insertRangeRows(
    client: PoolClient,
    batchId: string,
    scope: DurableMirrorScope,
    rows: readonly RangeCandidate[],
    observedAt: Date,
  ): Promise<void> {
    const seen = new Set<string>();
    for (const row of rows) {
      const key = `${row.relationKey}\u0000${row.rowId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      await client.query(
        `INSERT INTO execution_durable_mirror_range_rows
           (workspace_id,environment,profile_id,relation_key,row_id,ts,strategy_id,deployment_id,
            account_id,portfolio_id,binding_id,source_row_digest,fields,first_observed_batch_id,first_observed_at)
         VALUES ($1,$2,$3,$4,$5,$6::timestamptz,$7,$8,$9,$10,$11,$12,$13::jsonb,$14::uuid,$15)
         ON CONFLICT (workspace_id,environment,profile_id,relation_key,row_id) DO NOTHING`,
        [scope.workspaceId, scope.environment, scope.profileId, row.relationKey, row.rowId,
          row.ts, row.strategyId, row.deploymentId, row.accountId, row.portfolioId,
          row.bindingId, row.digest, JSON.stringify(row.fields), batchId, observedAt],
      );
    }
  }

  private async upsertContinuations(
    client: PoolClient,
    batchId: string,
    revisionId: string,
    scope: DurableMirrorScope,
    input: DurableMirrorCommitInput,
    observedAt: Date,
  ): Promise<void> {
    const cursorByRelation = new Map(input.relationCursors.map((cursor) => [cursor.relationKey, cursor.sourceCursor]));
    for (const relationKey of Object.keys(input.document.relations).sort()) {
      const held = cursorByRelation.get(relationKey) ?? null;
      await client.query(
        `INSERT INTO execution_durable_mirror_continuations
           (workspace_id,environment,profile_id,relation_key,continuation_authority,continuation_digest,
            last_batch_id,last_read_model_revision,updated_at)
         VALUES ($1,$2,$3,$4,'SERVER_ONLY_LEGACY_COORDINATOR',$5,$6::uuid,$7::uuid,$8)
         ON CONFLICT (workspace_id,environment,profile_id,relation_key) DO UPDATE SET
           continuation_digest=EXCLUDED.continuation_digest, last_batch_id=EXCLUDED.last_batch_id,
           last_read_model_revision=EXCLUDED.last_read_model_revision, updated_at=EXCLUDED.updated_at`,
        [scope.workspaceId, scope.environment, scope.profileId, relationKey,
          digest(held ?? `cleared:${input.sourceCursor}`), batchId, revisionId, observedAt],
      );
    }
  }

  private async insertGap(
    client: PoolClient,
    batchId: string,
    scope: DurableMirrorScope,
    relationKey: string,
    entityKey: string | null,
    reasonCode: string,
    detectedAt: Date,
  ): Promise<void> {
    await client.query(
      `INSERT INTO execution_durable_mirror_gaps
         (gap_id,batch_id,workspace_id,environment,profile_id,relation_key,entity_key,reason_code,detected_at)
       VALUES ($1::uuid,$2::uuid,$3,$4,$5,$6,$7,$8,$9)`,
      [randomUUID(), batchId, scope.workspaceId, scope.environment, scope.profileId,
        relationKey, entityKey, reasonCode, detectedAt],
    );
  }

  private async currentRevision(
    client: PoolClient,
    scope: DurableMirrorScope,
  ): Promise<DurableMirrorCurrentPage["revision"]> {
    const result = await client.query<{
      read_model_revision: string;
      projection_epoch: string;
      projection_sequence: string;
      payload_digest: string;
      received_at: Date;
    }>(
      `SELECT r.read_model_revision::text,r.projection_epoch::text,r.projection_sequence::text,
              b.payload_digest,b.received_at
         FROM execution_durable_mirror_revisions r
         JOIN execution_durable_mirror_batches b ON b.batch_id=r.batch_id
        WHERE r.workspace_id=$1 AND r.environment=$2 AND r.profile_id=$3 AND r.is_current=true`,
      [scope.workspaceId, scope.environment, scope.profileId],
    );
    const row = result.rows[0];
    return row ? {
      read_model_revision: row.read_model_revision,
      projection_epoch: row.projection_epoch,
      projection_sequence: Number(row.projection_sequence),
      payload_digest: row.payload_digest,
      received_at: row.received_at.toISOString(),
    } : null;
  }

  private async observationForCurrentRevision(
    client: PoolClient,
    scope: DurableMirrorScope,
    revisionId: string,
    relationKey: string,
  ): Promise<MirrorObservation | null> {
    const result = await client.query<{
      availability: "AVAILABLE" | "UNAVAILABLE";
      reason_code: string | null;
      completeness: "COMPLETE" | "PARTIAL" | "UNKNOWN";
      freshness: "FRESH" | "AGING" | "STALE" | "UNKNOWN";
      as_of: Date | null;
    }>(
      `SELECT o.availability,o.reason_code,o.completeness,o.freshness,o.as_of
         FROM execution_durable_mirror_observations o
         JOIN execution_durable_mirror_revisions r ON r.batch_id=o.batch_id
        WHERE r.read_model_revision=$1::uuid AND o.workspace_id=$2 AND o.environment=$3
          AND o.profile_id=$4 AND o.relation_key=$5`,
      [revisionId, scope.workspaceId, scope.environment, scope.profileId, relationKey],
    );
    const row = result.rows[0];
    return row ? {
      availability: row.availability,
      reason_code: row.reason_code,
      completeness: row.completeness,
      freshness: row.freshness,
      as_of: row.as_of?.toISOString() ?? null,
    } : null;
  }

  /**
   * A BFF page must describe one committed Portal revision. Read-only repeatable
   * read prevents a concurrent projection transaction from mixing its new rows
   * with observation metadata selected moments earlier.
   */
  private async stableRead<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const result = await operation(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}

function scopeFromDocument(document: DurableMirrorCommitInput["document"]): DurableMirrorScope {
  return { workspaceId: document.workspace_id, environment: document.environment, profileId: document.profile_id };
}

function relationObservations(document: DurableMirrorCommitInput["document"]): Array<{
  relationKey: string;
  relation: ProjectionRelation;
  relationDigest: string;
}> {
  return Object.entries(document.relations)
    .map(([relationKey, relation]) => ({ relationKey, relation, relationDigest: digest(relation) }))
    .sort((left, right) => left.relationKey.localeCompare(right.relationKey));
}

function rangeCandidates(
  document: DurableMirrorCommitInput["document"],
  retainedRangeRows: DurableMirrorCommitInput["retainedRangeRows"],
): { rows: RangeCandidate[]; gaps: RangeGap[] } {
  const candidates: RangeCandidate[] = [];
  const gaps: RangeGap[] = [];
  for (const [relationKey, relation] of Object.entries(document.relations)) {
    const shape = RANGE_RELATIONS[relationKey];
    if (!shape || relation.availability !== "AVAILABLE") continue;
    const rows = retainedRangeRows[relationKey] ?? relation.items;
    for (const row of rows) {
      const rowId = scalarText(row.fields[shape.idField]);
      const ts = utcTimestamp(row.fields[shape.timestampField]);
      if (!rowId) {
        gaps.push({ relationKey, reasonCode: "EDS06_RANGE_ROW_ID_MISSING" });
        continue;
      }
      if (!ts) {
        gaps.push({ relationKey, reasonCode: "EDS06_RANGE_TIMESTAMP_MISSING" });
        continue;
      }
      const dimensions = dimensionsOf(row.fields);
      candidates.push({
        relationKey,
        rowId,
        ts,
        ...dimensions,
        digest: digest(row.fields),
        fields: row.fields,
      });
    }
  }
  return { rows: candidates, gaps };
}

function entityKeyFor(relationKey: string, fields: Record<string, ProjectionScalar>): string | null {
  const keys = CURRENT_KEY_FIELDS[relationKey];
  if (!keys) return null;
  const values = keys.map((key) => scalarText(fields[key]));
  return values.some((value) => value === null) ? null : canonical(values);
}

function dimensionsOf(fields: Record<string, ProjectionScalar>): {
  strategyId: string | null;
  deploymentId: string | null;
  accountId: string | null;
  portfolioId: string | null;
  bindingId: string | null;
} {
  return {
    strategyId: scalarText(fields.strategy_id),
    deploymentId: scalarText(fields.deployment_id),
    accountId: scalarText(fields.account_id),
    portfolioId: scalarText(fields.portfolio_id),
    bindingId: scalarText(fields.binding_id),
  };
}

function scalarText(value: ProjectionScalar | undefined): string | null {
  if (typeof value === "string" && value.trim() !== "") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function utcTimestamp(value: ProjectionScalar | undefined): string | null {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

function digest(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonical(value), "utf8").digest("hex")}`;
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
}

function dedupeConflicts(conflicts: readonly RangeConflict[]): RangeConflict[] {
  return [...new Map(conflicts.map((item) => [
    `${item.relationKey}\u0000${item.rowId}\u0000${item.existingDigest}\u0000${item.incomingDigest}`,
    item,
  ])).values()];
}

function pageLimit(input: number | undefined): number {
  const value = input ?? 100;
  if (!Number.isInteger(value) || value < 1 || value > 200) throw new Error("EDS06_PAGE_LIMIT_INVALID");
  return value;
}

function checkedTimeRange(from: string | null, to: string | null): { from: string | null; to: string | null } {
  const checked = (value: string | null): string | null => {
    if (value === null) return null;
    const date = new Date(value);
    if (Number.isNaN(date.valueOf())) throw new Error("EDS06_RANGE_TIME_INVALID");
    return date.toISOString();
  };
  const parsed = { from: checked(from), to: checked(to) };
  if (parsed.from && parsed.to && parsed.from > parsed.to) throw new Error("EDS06_RANGE_TIME_ORDER_INVALID");
  return parsed;
}

function checkedResource(input: { kind: ResourceKind; id: string }): { column: string; id: string; kind: ResourceKind } {
  const columns: Readonly<Record<ResourceKind, string>> = {
    strategy: "strategy_id",
    deployment: "deployment_id",
    account: "account_id",
    portfolio: "portfolio_id",
    binding: "binding_id",
  };
  if (!Object.hasOwn(columns, input.kind) || !/^[A-Za-z0-9._:-]{1,256}$/.test(input.id)) {
    throw new Error("EDS06_RANGE_RESOURCE_INVALID");
  }
  return { column: columns[input.kind], id: input.id, kind: input.kind };
}

function currentCursorContext(
  input: DurableMirrorScope & { relationKey: string },
  limit: number,
): string {
  return queryFingerprint({
    resourceId: `execution-durable-current-v1:${input.relationKey}`,
    limit,
    filters: [
      { field: "environment", op: "eq", value: input.environment, values: [input.environment] },
      { field: "profile_id", op: "eq", value: input.profileId, values: [input.profileId] },
      { field: "relation_key", op: "eq", value: input.relationKey, values: [input.relationKey] },
    ],
    sort: [{ field: "entity_key", direction: "asc" }],
  });
}

function rangeCursorContext(
  input: DurableMirrorScope & { relationKey: string },
  limit: number,
  resource: { kind: ResourceKind; id: string } | null,
  range: { from: string | null; to: string | null },
): string {
  return queryFingerprint({
    resourceId: `execution-durable-range-v1:${input.relationKey}`,
    limit,
    filters: [
      { field: "environment", op: "eq", value: input.environment, values: [input.environment] },
      { field: "profile_id", op: "eq", value: input.profileId, values: [input.profileId] },
      { field: "relation_key", op: "eq", value: input.relationKey, values: [input.relationKey] },
      ...(resource ? [{ field: `${resource.kind}_id`, op: "eq" as const, value: resource.id, values: [resource.id] }] : []),
      ...(range.from ? [{ field: "from", op: "gte" as const, value: range.from, values: [range.from] }] : []),
      ...(range.to ? [{ field: "to", op: "lte" as const, value: range.to, values: [range.to] }] : []),
    ],
    sort: [{ field: "ts", direction: "asc" }, { field: "row_id", direction: "asc" }],
  });
}

function emptyCurrent(
  reasonCode: string,
  revision: DurableMirrorCurrentPage["revision"] = null,
  observation: DurableMirrorCurrentPage["observation"] = null,
): DurableMirrorCurrentPage {
  return {
    schema_version: "portal.execution.durable-mirror-current.v1",
    state: "UNAVAILABLE",
    reason_code: reasonCode,
    revision,
    observation,
    rows: [],
    next_cursor: null,
  };
}

function emptyRange(
  reasonCode: string,
  revision: DurableMirrorRangePage["revision"] = null,
  observation: DurableMirrorRangePage["observation"] = null,
): DurableMirrorRangePage {
  return {
    schema_version: "portal.execution.durable-mirror-range.v1",
    state: "UNAVAILABLE",
    reason_code: reasonCode,
    revision,
    observation,
    coverage: { retained_total: null, oldest_available_at: null, newest_available_at: null },
    rows: [],
    next_cursor: null,
  };
}
