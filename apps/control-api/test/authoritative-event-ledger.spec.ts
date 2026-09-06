import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { buildPool } from "../src/db/pool";
import {
  AUTHORITATIVE_EVENT_LEDGER_CONTRACT_REVISION,
  AuthoritativeLedgerAnchor,
  AuthoritativeLedgerEntry,
  AuthoritativeLedgerPage,
  AuthoritativeLedgerScope,
} from "../src/execution/authoritative-event-ledger.contract";
import { AuthoritativeEventLedgerRepository } from "../src/execution/authoritative-event-ledger.repository";
import { migrateTestDatabase, testConfig, truncateAll } from "./harness";

const sourceEpoch = "00000000-0000-0000-0000-000000000002";
const replacementEpoch = "00000000-0000-0000-0000-000000000003";
const eventOneId = "00000000-0000-0000-0000-000000000001";
const eventTwoId = "00000000-0000-0000-0000-000000000002";
const eventThreeId = "00000000-0000-0000-0000-000000000003";

let pool: Pool;
let repository: AuthoritativeEventLedgerRepository;

beforeAll(async () => {
  const config = testConfig();
  await migrateTestDatabase(config.DATABASE_URL);
  pool = buildPool(config.DATABASE_URL);
  repository = new AuthoritativeEventLedgerRepository(pool);
});

beforeEach(async () => truncateAll(pool));
afterAll(async () => pool.end());

describe("EDS-11R5 Portal authoritative ledger receiver", () => {
  it("persists an explicit anchor, applies a contiguous tail atomically, and acknowledges only after durable commit", async () => {
    const scope = ledgerScope("ws_r5_commit");
    await expect(repository.applyPage(scope, page(sourceEpoch, "0", [upsert("1", eventOneId)])))
      .rejects.toMatchObject({ code: "AUTHORITATIVE_LEDGER_ANCHOR_REQUIRED" });

    expect(await repository.applyAnchor(scope, anchor(sourceEpoch))).toMatchObject({
      outcome: "APPLIED",
      checkpoint: { sourceEpoch, anchorSequence: "0", acknowledgedSequence: "0", state: "ACTIVE" },
    });
    const first = upsert("1", eventOneId);
    const deleted = tombstone("2", eventTwoId, eventOneId);
    const receipt = await repository.applyPage(scope, page(sourceEpoch, "0", [first, deleted]));
    expect(receipt).toMatchObject({
      outcome: "APPLIED",
      insertedEntries: 2,
      checkpoint: { acknowledgedSequence: "2", state: "ACTIVE" },
    });

    expect(await repository.applyPage(scope, page(sourceEpoch, "0", [first, deleted]))).toMatchObject({
      outcome: "IDEMPOTENT", insertedEntries: 0, checkpoint: { acknowledgedSequence: "2" },
    });
    expect(await repository.entriesAfter(scope, sourceEpoch, "0")).toEqual([
      expect.objectContaining({ sourceSequence: "1", eventId: eventOneId, operation: "UPSERT" }),
      expect.objectContaining({ sourceSequence: "2", eventId: eventTwoId, operation: "DELETE", supersedesEventId: eventOneId }),
    ]);

    const entity = await pool.query<{ deleted: boolean; safe_record: Record<string, unknown> | null }>(
      `SELECT deleted, safe_record FROM execution_authoritative_event_entities
        WHERE workspace_id=$1 AND environment='paper' AND profile_id='PAPER_BINANCE_USDM'
          AND venue='BINANCE' AND source_epoch=$2 AND entity_id=$3`,
      [scope.workspaceId, sourceEpoch, eventOneId],
    );
    expect(entity.rows).toEqual([{ deleted: true, safe_record: null }]);

    const unsafeColumns = await pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema='public' AND table_name LIKE 'execution_authoritative_event_%'
          AND column_name IN ('source_cursor', 'payload', 'raw', 'credential', 'secret')`,
    );
    expect(unsafeColumns.rows).toEqual([]);
  });

  it("fails closed on a gap or retention-floor advance and requires a new explicit anchor before tailing again", async () => {
    const scope = ledgerScope("ws_r5_gap");
    await repository.applyAnchor(scope, anchor(sourceEpoch));
    const gap = await repository.applyPage(scope, page(sourceEpoch, "0", [upsert("2", eventTwoId)]));
    expect(gap).toMatchObject({
      outcome: "RESNAPSHOT_REQUIRED",
      checkpoint: { state: "RESNAPSHOT_REQUIRED", resnapshotReason: "AUTHORITATIVE_LEDGER_GAP_DETECTED" },
    });
    expect(await repository.entriesAfter(scope, sourceEpoch, "0")).toEqual([]);
    expect(await repository.applyPage(scope, page(sourceEpoch, "0", [upsert("1", eventOneId)])))
      .toMatchObject({ outcome: "RESNAPSHOT_REQUIRED" });

    const reanchored = await repository.applyAnchor(scope, anchor(sourceEpoch, "2", "1"));
    expect(reanchored).toMatchObject({ outcome: "APPLIED", checkpoint: { acknowledgedSequence: "2", state: "ACTIVE" } });
    expect(await repository.applyPage(scope, page(sourceEpoch, "1", [upsert("3", eventThreeId)])))
      .toMatchObject({ outcome: "APPLIED", checkpoint: { acknowledgedSequence: "3" } });

    const retention = await repository.applyPage(scope, page(sourceEpoch, "5", []));
    expect(retention).toMatchObject({
      outcome: "RESNAPSHOT_REQUIRED",
      checkpoint: { resnapshotReason: "AUTHORITATIVE_LEDGER_RETENTION_FLOOR_ADVANCED" },
    });
  });

  it("accepts a new source epoch only via an explicit anchor and keeps earlier epoch evidence immutable", async () => {
    const scope = ledgerScope("ws_r5_epoch");
    await repository.applyAnchor(scope, anchor(sourceEpoch));
    await repository.applyPage(scope, page(sourceEpoch, "0", [upsert("1", eventOneId)]));

    const rotated = await repository.applyAnchor(scope, anchor(replacementEpoch));
    expect(rotated).toMatchObject({
      outcome: "APPLIED",
      checkpoint: { sourceEpoch: replacementEpoch, anchorSequence: "0", acknowledgedSequence: "0", state: "ACTIVE" },
    });
    expect(await repository.entriesAfter(scope, sourceEpoch, "0")).toHaveLength(1);
    expect(await repository.entriesAfter(scope, replacementEpoch, "0")).toEqual([]);

    const staleTail = await repository.applyPage(scope, page(sourceEpoch, "0", [upsert("2", eventTwoId)]));
    expect(staleTail).toMatchObject({
      outcome: "RESNAPSHOT_REQUIRED",
      checkpoint: { sourceEpoch: replacementEpoch, resnapshotReason: "AUTHORITATIVE_LEDGER_SOURCE_EPOCH_CHANGED" },
    });
  });

  it("clears only the derived reducer view on an explicit re-anchor, never immutable event evidence", async () => {
    const scope = ledgerScope("ws_r5_reanchor");
    await repository.applyAnchor(scope, anchor(sourceEpoch));
    await repository.applyPage(scope, page(sourceEpoch, "0", [upsert("1", eventOneId)]));

    // An unexpected second anchor first forces a typed resnapshot.  The next
    // explicit anchor is the only operation that clears the derived view.
    expect(await repository.applyAnchor(scope, anchor(sourceEpoch, "1", "0"))).toMatchObject({
      outcome: "RESNAPSHOT_REQUIRED",
    });
    expect(await repository.applyAnchor(scope, anchor(sourceEpoch, "1", "0"))).toMatchObject({
      outcome: "APPLIED", checkpoint: { acknowledgedSequence: "1", state: "ACTIVE" },
    });
    const entities = await pool.query(
      `SELECT count(*)::int AS count FROM execution_authoritative_event_entities
        WHERE workspace_id=$1 AND environment='paper' AND profile_id='PAPER_BINANCE_USDM'
          AND venue='BINANCE' AND source_epoch=$2`,
      [scope.workspaceId, sourceEpoch],
    );
    expect(entities.rows).toEqual([{ count: 0 }]);
    expect(await repository.entriesAfter(scope, sourceEpoch, "0")).toHaveLength(1);
  });

  it("rejects cross-profile, raw/redacted records, unknown correction references, and conflicting duplicate sequences without acknowledging them", async () => {
    const scope = ledgerScope("ws_r5_negative");
    await repository.applyAnchor(scope, anchor(sourceEpoch));
    await expect(repository.applyPage(scope, page(sourceEpoch, "0", [{
      ...upsert("1", eventOneId),
      safeRecord: { payload: "must-never-cross" },
    }]))).rejects.toMatchObject({ code: "AUTHORITATIVE_LEDGER_REDACTION_INVALID" });
    await expect(repository.applyPage(scope, page(sourceEpoch, "0", [{
      ...upsert("1", eventOneId),
      safeRecord: { event_type: "ORDER_ACCEPTED", nested: { authorization: "must-never-cross" } },
    }]))).rejects.toMatchObject({ code: "AUTHORITATIVE_LEDGER_REDACTION_INVALID" });
    await expect(repository.applyPage(scope, page(sourceEpoch, "0", [{
      ...upsert("1", eventOneId),
      supersedesEventId: eventThreeId,
    }]))).rejects.toMatchObject({ code: "AUTHORITATIVE_LEDGER_CORRECTION_REFERENCE_UNKNOWN" });
    expect((await repository.checkpoint(scope))?.acknowledgedSequence).toBe("0");

    await repository.applyPage(scope, page(sourceEpoch, "0", [upsert("1", eventOneId)]));
    const conflict = await repository.applyPage(scope, page(sourceEpoch, "0", [{
      ...upsert("1", eventOneId),
      safeRecord: { event_type: "MUTATED", payload_sha256: "b".repeat(64) },
    }]));
    expect(conflict).toMatchObject({
      outcome: "RESNAPSHOT_REQUIRED",
      checkpoint: { resnapshotReason: "AUTHORITATIVE_LEDGER_DUPLICATE_CONFLICT" },
    });
    await expect(repository.applyAnchor({ ...scope, environment: "sandbox" } as unknown as AuthoritativeLedgerScope, anchor(sourceEpoch)))
      .rejects.toMatchObject({ code: "AUTHORITATIVE_LEDGER_SCOPE_REJECTED" });
    await expect(repository.entriesAfter(scope, "not-a-canonical-uuid", "0"))
      .rejects.toMatchObject({ code: "AUTHORITATIVE_LEDGER_IDENTIFIER_REJECTED" });
  });
});

function ledgerScope(workspaceId: string): AuthoritativeLedgerScope {
  return { workspaceId, environment: "paper", profileId: "PAPER_BINANCE_USDM", venue: "BINANCE" };
}

function anchor(sourceEpochValue: string, watermarkSequence = "0", retentionFloorSequence = "0"): AuthoritativeLedgerAnchor {
  return {
    contractRevision: AUTHORITATIVE_EVENT_LEDGER_CONTRACT_REVISION,
    sourceEpoch: sourceEpochValue,
    snapshotSemantics: "EVENT_LOG_ANCHOR",
    watermarkSequence,
    retentionFloorSequence,
  };
}

function page(
  sourceEpochValue: string,
  retentionFloorSequence: string,
  entries: readonly AuthoritativeLedgerEntry[],
): AuthoritativeLedgerPage {
  return {
    contractRevision: AUTHORITATIVE_EVENT_LEDGER_CONTRACT_REVISION,
    sourceEpoch: sourceEpochValue,
    retentionFloorSequence,
    entries,
  };
}

function upsert(sourceSequence: string, eventId: string): AuthoritativeLedgerEntry {
  return {
    sourceSequence,
    eventId,
    entity: "domain_event",
    entityId: eventOneId,
    operation: "UPSERT",
    entityVersion: sourceSequence,
    supersedesEventId: null,
    safeRecord: { event_type: "ORDER_ACCEPTED", payload_sha256: "a".repeat(64) },
  };
}

function tombstone(sourceSequence: string, eventId: string, supersedesEventId: string): AuthoritativeLedgerEntry {
  return {
    sourceSequence,
    eventId,
    entity: "domain_event",
    entityId: eventOneId,
    operation: "DELETE",
    entityVersion: sourceSequence,
    supersedesEventId,
    safeRecord: null,
  };
}
