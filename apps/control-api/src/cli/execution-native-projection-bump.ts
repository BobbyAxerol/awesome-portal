import "reflect-metadata";
import { loadConfig } from "../config";
import { buildPool, buildExecutionPool } from "../db/pool";
import { ExecutionProfileProjectionRepository } from "../execution/profile-projection.repository";
import { maximumDataDeploymentBinding } from "../execution/maximum-data-operation.registry";
import { nativeSnapshotSeedDocument, NATIVE_SNAPSHOT_SEED_REASON } from "./execution-native-snapshot-seed";

/**
 * Stage-2d helper (offline draft, not run anywhere): commits K new Portal-local projection REVISIONS of the seed
 * row, spaced in time, so the local journal holds distinct `revalidate` sources during a STREAM window and
 * cursor_resume can see two notices. It never reads or writes the trading source; the only thing that changes is
 * the honest, machine-readable reason code of the one UNAVAILABLE relation (PORTAL_SEED_NO_SOURCE_READ_REV_<n>).
 * Same epoch (source epoch unchanged), sequence + 1 per committed revision. Dry-run by default; --apply needs the
 * execution store owner role, like the seed, and its own owner approval.
 */
export function bumpedSeedDocument(workspaceId: string, profileId: string, revision: number) {
  if (!Number.isSafeInteger(revision) || revision < 2 || revision > 9999) throw new Error("BUMP_REVISION_INVALID");
  const doc = nativeSnapshotSeedDocument(workspaceId, profileId);
  const key = Object.keys(doc.relations)[0]!;
  doc.relations[key] = { ...doc.relations[key]!, reason_code: `${NATIVE_SNAPSHOT_SEED_REASON}_REV_${revision}` };
  return doc;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply"), dryRun = args.includes("--dry-run");
  const val = (flag: string) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
  const runId = val("--run-id"), count = Number(val("--count")), intervalMs = Number(val("--interval-ms"));
  if (apply === dryRun || !runId || !/^[A-Za-z0-9._-]{3,64}$/.test(runId) || !Number.isInteger(count) || count < 1 || count > 10 ||
    !Number.isInteger(intervalMs) || intervalMs < 2000 || intervalMs > 60_000 || args.length !== 7) {
    throw new Error("usage: execution-native-projection-bump (--dry-run|--apply) --run-id <id> --count <1..10> --interval-ms <2000..60000>");
  }
  const config = loadConfig();
  const pool = config.EXECUTION_DATABASE_URL ? buildExecutionPool(config) : buildPool(config.DATABASE_URL);
  try {
    const workspaceId = config.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID, profileId = config.EXECUTION_EDGE_PAPER_PROFILE_ID;
    if (!workspaceId || !profileId || profileId !== maximumDataDeploymentBinding("paper").profileId) {
      throw new Error("bump scope is not configured or does not match the native deployments binding");
    }
    const repository = new ExecutionProfileProjectionRepository(pool);
    const current = await repository.snapshot(workspaceId, "paper", profileId);
    if (!current || !current.sourceEpoch.startsWith("portal-seed-")) throw new Error("BUMP_REQUIRES_THE_SEED_ROW");
    const summary = (s: typeof current) => ({ projection_sequence: s.projectionSequence, projection_epoch: s.projectionEpoch });
    if (dryRun) {
      process.stdout.write(`${JSON.stringify({ mode: "DRY_RUN", existing: summary(current), would_commit: count, interval_ms: intervalMs,
        first_reason_code: `${NATIVE_SNAPSHOT_SEED_REASON}_REV_${current.projectionSequence + 1}` })}\n`);
      return;
    }
    for (let i = 0; i < count; i += 1) {
      const latest = (await repository.snapshot(workspaceId, "paper", profileId))!;
      const receipt = await repository.commit(bumpedSeedDocument(workspaceId, profileId, latest.projectionSequence + 1), {
        sourceEpoch: latest.sourceEpoch, sourceCursor: `${latest.sourceCursor.split("#")[0]}#bump-${runId}-${i + 1}`,
        sourceAsOf: null, receivedAt: new Date(), completeness: "UNKNOWN",
        retentionSeconds: config.EXECUTION_LOCAL_PROJECTION_JOURNAL_RETENTION_SECONDS,
        maximumJournalEntries: config.EXECUTION_LOCAL_PROJECTION_MAXIMUM_JOURNAL_ENTRIES,
      });
      const after = (await repository.snapshot(workspaceId, "paper", profileId))!;
      process.stdout.write(`${JSON.stringify({ mode: "APPLY", step: i + 1, outcome: receipt.outcome, changed: receipt.changed, after: summary(after) })}\n`);
      if (i + 1 < count) await sleep(intervalMs);
    }
  } finally {
    await pool.end();
  }
}

if (require.main === module) void main();
