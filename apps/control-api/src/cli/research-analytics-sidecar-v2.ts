import "reflect-metadata";

/**
 * AN-29 operator-only backfill. The only source is the immutable P05 seal and
 * its retained rows. No HTTP route, HMD fetch, strategy run or seal rewrite.
 *
 * Run from an audited checkout after migration 081, with the pinned QuantBT
 * 1.1.1 Python environment:
 *   RESEARCH_ANALYTICS_PYTHON=/path/to/.venv/bin/python node dist/cli/research-analytics-sidecar-v2.js \
 *     --workspace-id <id> --run-id <rrun_...> --dry-run
 * Repeat with --apply after reviewing the digest/count-only output.
 * BR-F6: after migration 082, append --distributions for old/new WFO seals.
 * This writes a separate companion; neither the original seal nor AN-29 row
 * is overwritten. Runtime roles have no write grant on either companion.
 */
import { createHash } from "node:crypto";
import { once } from "node:events";
import { isAbsolute, resolve } from "node:path";
import { spawn } from "node:child_process";
import type { PoolClient } from "pg";

import { loadConfig } from "../config";
import { buildPool } from "../db/pool";
import { canonicalResearchJson, sha256ResearchJson } from "../research/preflight.service";
import { ResearchRetainedAnalyticsV2Schema } from "../research/retained-analytics-v2.contract";
import { ResearchAllTimeDistributionsSchema } from "../research/all-time-distributions.contract";
import { currentSourceImportDigest } from "../research/current-source.repository";

const MAX_OBSERVATIONS = 2_000_000;
const PAGE = 1_000;
const DIGEST = /^[0-9a-f]{64}$/;

interface Seal {
  artifact_revision: number;
  retained_import_digest: string;
  table_rows: Record<string, number>;
  summary: Record<string, unknown>;
  existing_digest: string | null;
}

function args(): { workspaceId: string; runId: string; apply: boolean; distributions: boolean } {
  const input = process.argv.slice(2);
  const distributions = input[5] === "--distributions";
  if (distributions) input.pop();
  if (input.length !== 5 || !["--apply", "--dry-run"].includes(input[4]!)
    || input[0] !== "--workspace-id" || input[2] !== "--run-id"
    || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(input[1]!)
    || !/^rrun_[a-f0-9]{32}$/.test(input[3]!)) {
    throw new Error("usage: research-analytics-sidecar-v2 --workspace-id <id> --run-id <rrun_hex32> (--dry-run|--apply) [--distributions]");
  }
  return { workspaceId: input[1]!, runId: input[3]!, apply: input[4] === "--apply", distributions };
}

async function retainedSeal(client: PoolClient, workspaceId: string, runId: string, distributions: boolean): Promise<Seal> {
  const table = distributions ? "current_source_distributions_v1" : "current_source_analytics_sidecars_v2";
  const digestColumn = distributions ? "distributions_digest" : "analytics_digest";
  const result = await client.query<Seal>(
    `SELECT seal.artifact_revision, seal.retained_import_digest, seal.table_rows, seal.summary,
            sidecar.${digestColumn} AS existing_digest
       FROM research.current_source_seals_v1 seal
       LEFT JOIN research.${table} sidecar
         ON sidecar.workspace_id = seal.workspace_id AND sidecar.run_id = seal.run_id
        AND sidecar.artifact_revision = seal.artifact_revision
      WHERE seal.workspace_id = $1 AND seal.run_id = $2
      ORDER BY seal.artifact_revision DESC LIMIT 1`,
    [workspaceId, runId],
  );
  const seal = result.rows[0];
  if (!seal || !DIGEST.test(seal.retained_import_digest)
    || (!distributions && seal.summary.summary_analytics_v2 !== undefined)
    || !Number.isSafeInteger(seal.artifact_revision) || seal.artifact_revision < 1
    || !Number.isSafeInteger(seal.table_rows.OBSERVATION)
    || seal.table_rows.OBSERVATION < 2 || seal.table_rows.OBSERVATION > MAX_OBSERVATIONS
    || !Number.isSafeInteger(seal.table_rows.FOLD)
    || seal.table_rows.FOLD < 1 || seal.table_rows.FOLD > 32) {
    throw new Error("AN-29 requires one verified old WFO seal within the admitted row bounds");
  }
  return seal;
}

async function main(): Promise<void> {
  const { workspaceId, runId, apply, distributions } = args();
  const python = process.env.RESEARCH_ANALYTICS_PYTHON;
  if (!python || !isAbsolute(python)) throw new Error("RESEARCH_ANALYTICS_PYTHON must be an absolute pinned QuantBT Python path");
  const root = resolve(__dirname, "../../../..");
  const moduleRoot = resolve(root, "apps/portal/backend/src");
  const portalRoot = resolve(root, "apps/portal");
  const helper = resolve(moduleRoot, "portal_api/services/research_analytics_sidecar.py");
  const pool = buildPool(loadConfig().DATABASE_URL);
  const client = await pool.connect();
  let transaction = false;
  let activeChild: ReturnType<typeof spawn> | null = null;
  try {
    await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    transaction = true;
    await client.query("SET LOCAL statement_timeout = '15s'");
    const seal = await retainedSeal(client, workspaceId, runId, distributions);
    if (seal.existing_digest) {
      process.stdout.write(JSON.stringify({ state: "ALREADY_BACKFILLED", run_id: runId,
        artifact_revision: seal.artifact_revision, analytics_digest: seal.existing_digest }) + "\n");
      return;
    }
    const batches = await client.query<{ table_kind: "OBSERVATION" | "FOLD" | "TRIAL" | "CANDIDATE" | "SELECTION";
      batch_ordinal: number; batch_digest: string; row_count: number }>(
      `SELECT table_kind, batch_ordinal, batch_digest, row_count
         FROM research.current_source_import_batches_v1
        WHERE workspace_id = $1 AND run_id = $2 AND artifact_revision = $3
        ORDER BY table_kind, batch_ordinal LIMIT 10001`, [workspaceId, runId, seal.artifact_revision]);
    if (batches.rows.length > 10_000 || currentSourceImportDigest(batches.rows) !== seal.retained_import_digest) {
      throw new Error("Retained import receipts differ from the immutable source seal");
    }

    const child = spawn(python, [helper], {
      env: { ...process.env, PYTHONPATH: [moduleRoot, portalRoot, process.env.PYTHONPATH].filter(Boolean).join(":") },
      stdio: ["pipe", "pipe", "pipe"],
    });
    activeChild = child;
    let output = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      output += chunk;
      if (output.length > 20_000) child.kill();
    });
    // Do not echo stderr: source paths or dataset details do not belong in logs.
    child.stderr.resume();
    const done = new Promise<number>((accept, reject) => {
      child.once("error", reject);
      child.once("close", (code) => accept(code ?? -1));
    });
    const write = async (item: unknown): Promise<void> => {
      const line = JSON.stringify(item) + "\n";
      if (!child.stdin.write(line)) await once(child.stdin, "drain");
    };
    const digest = createHash("sha256");
    await write({ kind: "META", expected: {
      OBSERVATION: seal.table_rows.OBSERVATION, FOLD: seal.table_rows.FOLD,
    } });

    for (const kind of ["FOLD", "OBSERVATION"] as const) {
      let next = 0;
      while (next < seal.table_rows[kind]) {
        const rows = await client.query<{ source_ordinal: string; payload: Record<string, unknown> }>(
          `SELECT source_ordinal, payload FROM research.current_source_rows_v1
            WHERE workspace_id = $1 AND run_id = $2 AND artifact_revision = $3
              AND table_kind = $4 AND source_ordinal >= $5
            ORDER BY source_ordinal LIMIT $6`,
          [workspaceId, runId, seal.artifact_revision, kind, next, PAGE],
        );
        if (!rows.rows.length) throw new Error("AN-29 retained rows are missing");
        for (const row of rows.rows) {
          const ordinal = Number(row.source_ordinal);
          if (ordinal !== next) throw new Error("AN-29 retained source ordinals are not contiguous");
          const item = { kind, ordinal, payload: row.payload };
          digest.update(canonicalResearchJson(item) + "\n");
          await write(item);
          next += 1;
        }
      }
    }
    child.stdin.end();
    if (await done !== 0) throw new Error("AN-29 pinned Python derivation failed closed");
    const analytics = ResearchRetainedAnalyticsV2Schema.parse(JSON.parse(output));
    const document = distributions ? ResearchAllTimeDistributionsSchema.parse(analytics.distributions) : analytics;
    const analyticsDigest = sha256ResearchJson(document);
    const sourceRowsDigest = digest.digest("hex");
    await client.query("COMMIT");
    transaction = false;
    if (apply) {
      const inserted = await client.query(distributions
        ? `INSERT INTO research.current_source_distributions_v1
            (workspace_id, run_id, artifact_revision, retained_import_digest,
             source_rows_digest, distributions_digest, distributions)
          SELECT $1, $2, $3, seal.retained_import_digest, $5, $6, $7::jsonb
            FROM research.current_source_seals_v1 seal
           WHERE seal.workspace_id = $1 AND seal.run_id = $2
             AND seal.artifact_revision = $3 AND seal.retained_import_digest = $4
          ON CONFLICT DO NOTHING RETURNING distributions_digest`
        : `INSERT INTO research.current_source_analytics_sidecars_v2
            (workspace_id, run_id, artifact_revision, retained_import_digest,
             source_rows_digest, analytics_digest, analytics)
          SELECT $1, $2, $3, seal.retained_import_digest, $5, $6, $7::jsonb
            FROM research.current_source_seals_v1 seal
           WHERE seal.workspace_id = $1 AND seal.run_id = $2
             AND seal.artifact_revision = $3 AND seal.retained_import_digest = $4
             AND NOT (seal.summary ? 'summary_analytics_v2')
          ON CONFLICT DO NOTHING RETURNING analytics_digest`,
        [workspaceId, runId, seal.artifact_revision, seal.retained_import_digest,
          sourceRowsDigest, analyticsDigest, JSON.stringify(document)],
      );
      if (inserted.rowCount !== 1) throw new Error("AN-29 sidecar conflict or source seal changed; no overwrite");
    }
    process.stdout.write(JSON.stringify({
      state: apply ? "BACKFILLED" : "DRY_RUN",
      companion: distributions ? "ALL_TIME_DISTRIBUTIONS_V1" : "AN29_ANALYTICS_V2",
      run_id: runId,
      artifact_revision: seal.artifact_revision,
      observation_rows: seal.table_rows.OBSERVATION,
      fold_rows: seal.table_rows.FOLD,
      retained_import_digest: seal.retained_import_digest,
      source_rows_digest: sourceRowsDigest,
      analytics_digest: analyticsDigest,
    }) + "\n");
  } finally {
    if (activeChild && activeChild.exitCode === null) activeChild.kill();
    if (transaction) await client.query("ROLLBACK");
    client.release();
    await pool.end();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write("AN-29 backfill refused: " + (error instanceof Error ? error.message : "unknown error") + "\n");
  process.exitCode = 1;
});
