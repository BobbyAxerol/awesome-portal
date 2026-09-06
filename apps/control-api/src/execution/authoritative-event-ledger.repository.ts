import { Inject, Injectable } from "@nestjs/common";
import { Pool, PoolClient } from "pg";
import { CONTROL_API_POOL } from "../tokens";
import {
  AuthoritativeLedgerAnchor,
  AuthoritativeLedgerCheckpoint,
  AuthoritativeLedgerContractError,
  AuthoritativeLedgerEntry,
  AuthoritativeLedgerPage,
  AuthoritativeLedgerScope,
  authoritativeLedgerEntryDigest,
  assertAuthoritativeLedgerAnchor,
  assertAuthoritativeLedgerEpoch,
  assertAuthoritativeLedgerPage,
  assertAuthoritativeLedgerScope,
  exactLedgerSequence,
} from "./authoritative-event-ledger.contract";

export type AuthoritativeLedgerApplyOutcome = "APPLIED" | "IDEMPOTENT" | "RESNAPSHOT_REQUIRED";

export interface AuthoritativeLedgerApplyReceipt {
  readonly outcome: AuthoritativeLedgerApplyOutcome;
  readonly checkpoint: AuthoritativeLedgerCheckpoint;
  readonly insertedEntries: number;
}

export interface PersistedAuthoritativeLedgerEntry {
  readonly sourceSequence: string;
  readonly eventId: string;
  readonly entity: "domain_event";
  readonly entityId: string;
  readonly operation: "UPSERT" | "DELETE";
  readonly entityVersion: string;
  readonly supersedesEventId: string | null;
  readonly safeRecord: Record<string, unknown> | null;
  readonly eventDigest: string;
}

interface StreamRow {
  source_epoch: string;
  anchor_sequence: string;
  acknowledged_sequence: string;
  retention_floor_sequence: string;
  state: "ACTIVE" | "RESNAPSHOT_REQUIRED";
  resnapshot_reason: string | null;
}

interface EntryRow {
  event_id: string;
  event_digest: string;
}

/**
 * Durable Portal-side receiver for the source-owned R5 event ledger.
 *
 * It has no source transport and no controller by design.  A later accepted
 * Manager/Edge consumer can call `applyAnchor` and `applyPage`; source ACK is
 * represented only by the transactionally persisted acknowledged sequence.
 * No raw upstream cursor is accepted or stored here.
 */
@Injectable()
export class AuthoritativeEventLedgerRepository {
  constructor(@Inject(CONTROL_API_POOL) private readonly pool: Pool) {}

  async applyAnchor(
    scope: AuthoritativeLedgerScope,
    anchor: AuthoritativeLedgerAnchor,
  ): Promise<AuthoritativeLedgerApplyReceipt> {
    assertAuthoritativeLedgerScope(scope);
    assertAuthoritativeLedgerAnchor(anchor);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
      const current = await this.lockStream(client, scope);
      if (!current) {
        await client.query(
          `INSERT INTO execution_authoritative_event_streams
             (workspace_id, environment, profile_id, venue, contract_revision,
              source_epoch, snapshot_semantics, anchor_sequence,
              acknowledged_sequence, retention_floor_sequence, state,
              resnapshot_reason)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8::numeric,$8::numeric,$9::numeric,'ACTIVE',NULL)`,
          [
            scope.workspaceId, scope.environment, scope.profileId, scope.venue,
            anchor.contractRevision, anchor.sourceEpoch, anchor.snapshotSemantics,
            anchor.watermarkSequence, anchor.retentionFloorSequence,
          ],
        );
        const initialCheckpoint = {
          sourceEpoch: anchor.sourceEpoch,
          anchorSequence: anchor.watermarkSequence,
          acknowledgedSequence: anchor.watermarkSequence,
          retentionFloorSequence: anchor.retentionFloorSequence,
          state: "ACTIVE" as const,
          resnapshotReason: null,
        };
        await client.query("COMMIT");
        return { outcome: "APPLIED", checkpoint: initialCheckpoint, insertedEntries: 0 };
      }

      if (current.source_epoch !== anchor.sourceEpoch) {
        // A new source epoch is admissible only through an explicit anchor.
        // Historical rows remain keyed by their old epoch; no record is
        // rewritten or interpreted as belonging to the new stream.
        // Event evidence stays immutable by epoch, while the derived entity
        // view is never allowed to bridge two anchors/epochs.
        await this.clearDerivedEntities(client, scope, anchor.sourceEpoch);
        await client.query(
          `UPDATE execution_authoritative_event_streams
              SET contract_revision=$5, source_epoch=$6, snapshot_semantics=$7,
                  anchor_sequence=$8::numeric, acknowledged_sequence=$8::numeric,
                  retention_floor_sequence=$9::numeric, state='ACTIVE',
                  resnapshot_reason=NULL, last_anchor_at=clock_timestamp(),
                  last_ack_at=clock_timestamp(), updated_at=clock_timestamp()
            WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3 AND venue=$4`,
          [
            scope.workspaceId, scope.environment, scope.profileId, scope.venue,
            anchor.contractRevision, anchor.sourceEpoch, anchor.snapshotSemantics,
            anchor.watermarkSequence, anchor.retentionFloorSequence,
          ],
        );
        const rotatedCheckpoint = {
          sourceEpoch: anchor.sourceEpoch,
          anchorSequence: anchor.watermarkSequence,
          acknowledgedSequence: anchor.watermarkSequence,
          retentionFloorSequence: anchor.retentionFloorSequence,
          state: "ACTIVE" as const,
          resnapshotReason: null,
        };
        await client.query("COMMIT");
        return { outcome: "APPLIED", checkpoint: rotatedCheckpoint, insertedEntries: 0 };
      }

      if (current.state === "ACTIVE") {
        if (
          current.anchor_sequence === anchor.watermarkSequence
          && current.retention_floor_sequence === anchor.retentionFloorSequence
        ) {
          await client.query("COMMIT");
          return { outcome: "IDEMPOTENT", checkpoint: toCheckpoint(current), insertedEntries: 0 };
        }
        return await this.resnapshot(
          client,
          scope,
          current,
          "AUTHORITATIVE_LEDGER_UNEXPECTED_ACTIVE_ANCHOR",
        );
      }

      // An EVENT_LOG_ANCHOR is deliberately not a business-state snapshot. A
      // resnapshot may advance the durable ACK only forward and clear the
      // fail-closed state; it cannot rewind history or manufacture events.
      if (exactLedgerSequence(anchor.watermarkSequence, "watermarkSequence")
        < exactLedgerSequence(current.acknowledged_sequence, "acknowledgedSequence")) {
        return await this.resnapshot(
          client,
          scope,
          current,
          "AUTHORITATIVE_LEDGER_ANCHOR_REWIND_REJECTED",
        );
      }
      // An EVENT_LOG_ANCHOR is not a full business-state snapshot.  Clear only
      // the derived reducer view before accepting a new tail; immutable event
      // evidence remains available for audit under the same epoch.
      await this.clearDerivedEntities(client, scope, current.source_epoch);
      await client.query(
        `UPDATE execution_authoritative_event_streams
            SET contract_revision=$5, snapshot_semantics=$6,
                anchor_sequence=$7::numeric, acknowledged_sequence=$7::numeric,
                retention_floor_sequence=$8::numeric, state='ACTIVE',
                resnapshot_reason=NULL, last_anchor_at=clock_timestamp(),
                last_ack_at=clock_timestamp(), updated_at=clock_timestamp()
          WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3 AND venue=$4`,
        [
          scope.workspaceId, scope.environment, scope.profileId, scope.venue,
          anchor.contractRevision, anchor.snapshotSemantics,
          anchor.watermarkSequence, anchor.retentionFloorSequence,
        ],
      );
      const reanchoredCheckpoint = {
        sourceEpoch: current.source_epoch,
        anchorSequence: anchor.watermarkSequence,
        acknowledgedSequence: anchor.watermarkSequence,
        retentionFloorSequence: anchor.retentionFloorSequence,
        state: "ACTIVE" as const,
        resnapshotReason: null,
      };
      await client.query("COMMIT");
      return { outcome: "APPLIED", checkpoint: reanchoredCheckpoint, insertedEntries: 0 };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async applyPage(
    scope: AuthoritativeLedgerScope,
    page: AuthoritativeLedgerPage,
  ): Promise<AuthoritativeLedgerApplyReceipt> {
    assertAuthoritativeLedgerScope(scope);
    assertAuthoritativeLedgerPage(page);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
      const current = await this.lockStream(client, scope);
      if (!current) {
        throw new AuthoritativeLedgerContractError("AUTHORITATIVE_LEDGER_ANCHOR_REQUIRED");
      }
      if (current.source_epoch !== page.sourceEpoch) {
        return await this.resnapshot(client, scope, current, "AUTHORITATIVE_LEDGER_SOURCE_EPOCH_CHANGED");
      }
      if (current.state === "RESNAPSHOT_REQUIRED") {
        await client.query("COMMIT");
        return { outcome: "RESNAPSHOT_REQUIRED", checkpoint: toCheckpoint(current), insertedEntries: 0 };
      }

      const floor = exactLedgerSequence(page.retentionFloorSequence, "retentionFloorSequence");
      const acknowledged = exactLedgerSequence(current.acknowledged_sequence, "acknowledgedSequence");
      if (floor > acknowledged + 1n) {
        return await this.resnapshot(client, scope, current, "AUTHORITATIVE_LEDGER_RETENTION_FLOOR_ADVANCED");
      }

      let expected = acknowledged + 1n;
      let insertedEntries = 0;
      for (const entry of page.entries) {
        const sequence = exactLedgerSequence(entry.sourceSequence, "sourceSequence");
        const digest = authoritativeLedgerEntryDigest(entry);
        if (sequence <= acknowledged) {
          const existing = await this.existingEntry(client, scope, page.sourceEpoch, entry.sourceSequence);
          if (!existing || existing.event_id !== entry.eventId || existing.event_digest !== digest) {
            return await this.resnapshot(client, scope, current, "AUTHORITATIVE_LEDGER_DUPLICATE_CONFLICT");
          }
          continue;
        }
        if (sequence !== expected) {
          return await this.resnapshot(client, scope, current, "AUTHORITATIVE_LEDGER_GAP_DETECTED");
        }
        if (entry.supersedesEventId !== null) {
          const exists = await client.query(
            `SELECT 1 FROM execution_authoritative_event_entries
              WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3 AND venue=$4
                AND source_epoch=$5 AND event_id=$6`,
            [scope.workspaceId, scope.environment, scope.profileId, scope.venue, page.sourceEpoch, entry.supersedesEventId],
          );
          if (exists.rowCount !== 1) {
            throw new AuthoritativeLedgerContractError("AUTHORITATIVE_LEDGER_CORRECTION_REFERENCE_UNKNOWN");
          }
        }
        await this.insertEntry(client, scope, page.sourceEpoch, entry, digest);
        await this.reduceEntity(client, scope, page.sourceEpoch, entry);
        expected += 1n;
        insertedEntries += 1;
      }

      const acknowledgedSequence = (expected - 1n).toString();
      if (insertedEntries > 0 || page.retentionFloorSequence !== current.retention_floor_sequence) {
        await client.query(
          `UPDATE execution_authoritative_event_streams
              SET acknowledged_sequence=$5::numeric,
                  retention_floor_sequence=$6::numeric,
                  last_ack_at=clock_timestamp(), updated_at=clock_timestamp()
            WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3 AND venue=$4`,
          [
            scope.workspaceId, scope.environment, scope.profileId, scope.venue,
            acknowledgedSequence, page.retentionFloorSequence,
          ],
        );
      }
      const next = {
        ...toCheckpoint(current),
        acknowledgedSequence,
        retentionFloorSequence: page.retentionFloorSequence,
      };
      await client.query("COMMIT");
      return { outcome: insertedEntries === 0 ? "IDEMPOTENT" : "APPLIED", checkpoint: next, insertedEntries };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async checkpoint(scope: AuthoritativeLedgerScope): Promise<AuthoritativeLedgerCheckpoint | null> {
    assertAuthoritativeLedgerScope(scope);
    const result = await this.pool.query<StreamRow>(
      `SELECT source_epoch, anchor_sequence::text, acknowledged_sequence::text,
              retention_floor_sequence::text, state, resnapshot_reason
         FROM execution_authoritative_event_streams
        WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3 AND venue=$4`,
      [scope.workspaceId, scope.environment, scope.profileId, scope.venue],
    );
    return result.rows[0] ? toCheckpoint(result.rows[0]) : null;
  }

  async entriesAfter(
    scope: AuthoritativeLedgerScope,
    sourceEpoch: string,
    afterSequence: string,
    limit = 1_000,
  ): Promise<readonly PersistedAuthoritativeLedgerEntry[]> {
    assertAuthoritativeLedgerScope(scope);
    assertAuthoritativeLedgerEpoch(sourceEpoch);
    exactLedgerSequence(afterSequence, "afterSequence");
    if (!Number.isInteger(limit) || limit < 1 || limit > 1_000) {
      throw new AuthoritativeLedgerContractError("AUTHORITATIVE_LEDGER_PAGE_BOUND_EXCEEDED");
    }
    const result = await this.pool.query<{
      source_sequence: string;
      event_id: string;
      entity: "domain_event";
      entity_id: string;
      operation: "UPSERT" | "DELETE";
      entity_version: string;
      supersedes_event_id: string | null;
      safe_record: Record<string, unknown> | null;
      event_digest: string;
    }>(
      `SELECT source_sequence::text, event_id, entity, entity_id, operation,
              entity_version::text, supersedes_event_id, safe_record, event_digest
         FROM execution_authoritative_event_entries
        WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3 AND venue=$4
          AND source_epoch=$5 AND source_sequence > $6::numeric
        ORDER BY source_sequence ASC
        LIMIT $7`,
      [scope.workspaceId, scope.environment, scope.profileId, scope.venue, sourceEpoch, afterSequence, limit],
    );
    return result.rows.map((row) => ({
      sourceSequence: row.source_sequence,
      eventId: row.event_id,
      entity: row.entity,
      entityId: row.entity_id,
      operation: row.operation,
      entityVersion: row.entity_version,
      supersedesEventId: row.supersedes_event_id,
      safeRecord: row.safe_record,
      eventDigest: row.event_digest,
    }));
  }

  private async lockStream(client: PoolClient, scope: AuthoritativeLedgerScope): Promise<StreamRow | null> {
    const result = await client.query<StreamRow>(
      `SELECT source_epoch, anchor_sequence::text, acknowledged_sequence::text,
              retention_floor_sequence::text, state, resnapshot_reason
         FROM execution_authoritative_event_streams
        WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3 AND venue=$4
        FOR UPDATE`,
      [scope.workspaceId, scope.environment, scope.profileId, scope.venue],
    );
    return result.rows[0] ?? null;
  }

  private async existingEntry(
    client: PoolClient,
    scope: AuthoritativeLedgerScope,
    sourceEpoch: string,
    sourceSequence: string,
  ): Promise<EntryRow | null> {
    const result = await client.query<EntryRow>(
      `SELECT event_id, event_digest
         FROM execution_authoritative_event_entries
        WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3 AND venue=$4
          AND source_epoch=$5 AND source_sequence=$6::numeric`,
      [scope.workspaceId, scope.environment, scope.profileId, scope.venue, sourceEpoch, sourceSequence],
    );
    return result.rows[0] ?? null;
  }

  private async insertEntry(
    client: PoolClient,
    scope: AuthoritativeLedgerScope,
    sourceEpoch: string,
    entry: AuthoritativeLedgerEntry,
    digest: string,
  ): Promise<void> {
    await client.query(
      `INSERT INTO execution_authoritative_event_entries
         (workspace_id, environment, profile_id, venue, source_epoch, source_sequence,
          event_id, entity, entity_id, operation, entity_version,
          supersedes_event_id, safe_record, event_digest)
       VALUES ($1,$2,$3,$4,$5,$6::numeric,$7,$8,$9,$10,$11::numeric,$12,$13::jsonb,$14)`,
      [
        scope.workspaceId, scope.environment, scope.profileId, scope.venue,
        sourceEpoch, entry.sourceSequence, entry.eventId, entry.entity, entry.entityId,
        entry.operation, entry.entityVersion, entry.supersedesEventId,
        entry.safeRecord === null ? null : JSON.stringify(entry.safeRecord), digest,
      ],
    );
  }

  private async reduceEntity(
    client: PoolClient,
    scope: AuthoritativeLedgerScope,
    sourceEpoch: string,
    entry: AuthoritativeLedgerEntry,
  ): Promise<void> {
    await client.query(
      `INSERT INTO execution_authoritative_event_entities
         (workspace_id, environment, profile_id, venue, source_epoch, entity,
          entity_id, latest_event_id, latest_source_sequence, entity_version,
          deleted, safe_record)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::numeric,$10::numeric,$11,$12::jsonb)
       ON CONFLICT (workspace_id, environment, profile_id, venue, source_epoch, entity, entity_id)
       DO UPDATE SET latest_event_id=EXCLUDED.latest_event_id,
                     latest_source_sequence=EXCLUDED.latest_source_sequence,
                     entity_version=EXCLUDED.entity_version,
                     deleted=EXCLUDED.deleted,
                     safe_record=EXCLUDED.safe_record,
                     updated_at=clock_timestamp()
       WHERE execution_authoritative_event_entities.latest_source_sequence < EXCLUDED.latest_source_sequence`,
      [
        scope.workspaceId, scope.environment, scope.profileId, scope.venue,
        sourceEpoch, entry.entity, entry.entityId, entry.eventId, entry.sourceSequence,
        entry.entityVersion, entry.operation === "DELETE",
        entry.safeRecord === null ? null : JSON.stringify(entry.safeRecord),
      ],
    );
  }

  private async clearDerivedEntities(
    client: PoolClient,
    scope: AuthoritativeLedgerScope,
    sourceEpoch: string,
  ): Promise<void> {
    await client.query(
      `DELETE FROM execution_authoritative_event_entities
        WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3 AND venue=$4
          AND source_epoch=$5`,
      [scope.workspaceId, scope.environment, scope.profileId, scope.venue, sourceEpoch],
    );
  }

  private async resnapshot(
    client: PoolClient,
    scope: AuthoritativeLedgerScope,
    current: StreamRow,
    reason: string,
  ): Promise<AuthoritativeLedgerApplyReceipt> {
    await client.query(
      `UPDATE execution_authoritative_event_streams
          SET state='RESNAPSHOT_REQUIRED', resnapshot_reason=$5,
              updated_at=clock_timestamp()
        WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3 AND venue=$4`,
      [scope.workspaceId, scope.environment, scope.profileId, scope.venue, reason],
    );
    const next = { ...toCheckpoint(current), state: "RESNAPSHOT_REQUIRED" as const, resnapshotReason: reason };
    await client.query("COMMIT");
    return { outcome: "RESNAPSHOT_REQUIRED", checkpoint: next, insertedEntries: 0 };
  }
}

function toCheckpoint(row: StreamRow): AuthoritativeLedgerCheckpoint {
  return {
    sourceEpoch: row.source_epoch,
    anchorSequence: row.anchor_sequence,
    acknowledgedSequence: row.acknowledged_sequence,
    retentionFloorSequence: row.retention_floor_sequence,
    state: row.state,
    resnapshotReason: row.resnapshot_reason,
  };
}
