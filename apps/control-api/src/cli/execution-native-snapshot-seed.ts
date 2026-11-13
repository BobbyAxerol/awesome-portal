import "reflect-metadata";
import { loadConfig } from "../config";
import { buildPool, buildExecutionPool } from "../db/pool";
import {
  ExecutionProfileProjectionRepository,
  type ProfileProjectionDocument,
} from "../execution/profile-projection.repository";
import {
  MAXIMUM_DATA_DEPLOYMENT_OPERATION,
  maximumDataDeploymentBinding,
} from "../execution/maximum-data-operation.registry";

/**
 * Stage-2a narrow snapshot seed (owner scope 2026-11-13). It writes ONE profile
 * snapshot whose only relation is the deployments source, stamped with the
 * catalogue the native Manager read actually serves. It performs NO source
 * read, so the relation is stated honestly as UNAVAILABLE (no rows,
 * completeness UNKNOWN): it proves the snapshot/cursor read path only, never
 * business completeness. It is not a projection worker and enables none.
 */
export const NATIVE_SNAPSHOT_SEED_REASON = "PORTAL_SEED_NO_SOURCE_READ";

export function nativeSnapshotSeedDocument(workspaceId: string): ProfileProjectionDocument {
  const op = MAXIMUM_DATA_DEPLOYMENT_OPERATION;
  const profileId = maximumDataDeploymentBinding("paper").profileId;
  const key = `${op.sourceId}:${op.relation}`;
  return {
    schema_version: "portal.execution.profile-projection.v1",
    workspace_id: workspaceId,
    environment: "paper",
    profile_id: profileId,
    source_contract_revision: op.sourceContractRevision,
    source_catalogue_sha256: op.sourceCatalogueSha256,
    relations: {
      [key]: {
        source_id: op.sourceId,
        relation: op.relation,
        availability: "UNAVAILABLE",
        reason_code: NATIVE_SNAPSHOT_SEED_REASON,
        as_of: null,
        freshness: "UNKNOWN",
        completeness: "UNKNOWN",
        source_catalogue_sha256: op.sourceCatalogueSha256,
        items: [],
      },
    },
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const dryRun = args.includes("--dry-run");
  const w = args.indexOf("--workspace-id");
  const r = args.indexOf("--run-id");
  const workspaceId = w >= 0 ? args[w + 1] : undefined;
  const runId = r >= 0 ? args[r + 1] : undefined;
  if (apply === dryRun || !workspaceId || !runId || args.length !== 5 ||
    !/^[A-Za-z0-9._-]{3,64}$/.test(runId) || !/^[0-9a-f-]{36}$/.test(workspaceId)) {
    throw new Error("usage: execution-native-snapshot-seed (--dry-run|--apply) --workspace-id <uuid> --run-id <id>");
  }
  const config = loadConfig();
  const pool = config.EXECUTION_DATABASE_URL ? buildExecutionPool(config) : buildPool(config.DATABASE_URL);
  try {
    const repository = new ExecutionProfileProjectionRepository(pool);
    const document = nativeSnapshotSeedDocument(workspaceId);
    const before = await repository.snapshot(workspaceId, "paper", document.profile_id);
    const summary = (s: typeof before) => s === null ? null : {
      projection_sequence: s.projectionSequence, projection_epoch: s.projectionEpoch,
      source_catalogue_sha256: s.sourceCatalogueSha256, payload_digest: s.payloadDigest,
    };
    if (dryRun) {
      process.stdout.write(`${JSON.stringify({ mode: "DRY_RUN", profile_id: document.profile_id,
        would_write_catalogue: document.source_catalogue_sha256, relations: Object.keys(document.relations),
        existing: summary(before) })}\n`);
      return;
    }
    const receipt = await repository.commit(document, {
      sourceEpoch: `portal-seed-${runId}`, sourceCursor: `portal-seed:${runId}`,
      sourceAsOf: null, receivedAt: new Date(), completeness: "UNKNOWN",
      retentionSeconds: config.EXECUTION_LOCAL_PROJECTION_JOURNAL_RETENTION_SECONDS,
      maximumJournalEntries: config.EXECUTION_LOCAL_PROJECTION_MAXIMUM_JOURNAL_ENTRIES,
    });
    const after = await repository.snapshot(workspaceId, "paper", document.profile_id);
    process.stdout.write(`${JSON.stringify({ mode: "APPLY", outcome: receipt.outcome, changed: receipt.changed,
      before: summary(before), after: summary(after) })}\n`);
  } finally {
    await pool.end();
  }
}

if (require.main === module) void main();
