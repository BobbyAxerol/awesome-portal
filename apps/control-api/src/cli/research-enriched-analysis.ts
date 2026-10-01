/** B6 operator-only dry/apply/retry. No read endpoint launches this process. */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { isAbsolute, resolve } from "node:path";
import { loadConfig } from "../config";
import "reflect-metadata";
import { buildPool } from "../db/pool";
import { canonicalResearchJson, sha256ResearchJson } from "../research/preflight.service";
import { currentSourceImportDigest } from "../research/current-source.repository";
import { ResearchEnrichedAnalysisSchema, verifiedEnriched } from "../research/enriched-analysis.contract";

async function main() {
  const [workspaceArg, workspaceId, runArg, runId, action] = process.argv.slice(2);
  if (process.argv.length !== 7 || workspaceArg !== "--workspace-id" || runArg !== "--run-id"
    || !workspaceId || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(workspaceId)
    || !runId || !/^rrun_[a-f0-9]{32}$/.test(runId) || !["--dry-run", "--apply"].includes(action!)) {
    throw new Error("usage: research-enriched-analysis --workspace-id <id> --run-id <rrun_hex32> (--dry-run|--apply)");
  }
  const python = process.env.RESEARCH_ANALYTICS_PYTHON;
  if (!python || !isAbsolute(python)) throw new Error("RESEARCH_ANALYTICS_PYTHON must name an absolute pinned interpreter");
  const pool = buildPool(loadConfig().DATABASE_URL), client = await pool.connect();
  let transaction = false, child: ReturnType<typeof spawn> | null = null;
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"); transaction = true;
    await client.query("SET LOCAL statement_timeout = '15s'");
    const source = (await client.query(
      `SELECT seal.artifact_revision, seal.retained_import_digest, seal.table_rows, seal.summary,
              producer.requested_spec->>'timeframe' AS timeframe
         FROM research.current_source_seals_v1 seal
         JOIN research.run_producers producer ON producer.workspace_id=seal.workspace_id AND producer.run_id=seal.run_id
        WHERE seal.workspace_id=$1 AND seal.run_id=$2 ORDER BY seal.artifact_revision DESC LIMIT 1`, [workspaceId, runId])).rows[0];
    const fixed = source ? null : (await client.query(
      `SELECT source.source_evidence_digest, source.source_payload, projection.projection_revision,
              producer.requested_spec->>'timeframe' AS timeframe
         FROM research.run_producers producer
         JOIN research.run_evidence_sources_v1 source ON source.workspace_id=producer.workspace_id
          AND source.run_id=producer.run_id AND source.worker_attempt_id=producer.worker_attempt_id
         JOIN research.run_evidence_projections_v1 projection ON projection.workspace_id=source.workspace_id
          AND projection.run_id=source.run_id AND projection.worker_attempt_id=source.worker_attempt_id
          AND projection.source_evidence_digest=source.source_evidence_digest
        WHERE source.workspace_id=$1 AND source.run_id=$2 ORDER BY projection.received_at DESC LIMIT 1`, [workspaceId, runId])).rows[0];
    if (!source && !fixed) throw new Error("No sealed retained account/passport was found");
    const kind = source ? "WFO_RETAINED" : "P04_SOURCE";
    const revision = String(source?.artifact_revision ?? fixed.projection_revision);
    const sourceDigest = source?.retained_import_digest ?? fixed.source_evidence_digest;
    const existing = (await client.query(`SELECT enriched_digest,enriched,source_digest FROM research.enriched_analysis_v1
      WHERE workspace_id=$1 AND run_id=$2 AND source_kind=$3 AND source_revision=$4`, [workspaceId, runId, kind, revision])).rows[0];
    if (existing) {
      if (existing.source_digest !== sourceDigest) throw new Error("Existing enrichment source conflict");
      verifiedEnriched(existing.enriched, existing.enriched_digest, runId);
      process.stdout.write(JSON.stringify({ state: "ALREADY_BACKFILLED", run_id: runId, enriched_digest: existing.enriched_digest }) + "\n"); return;
    }
    const counts = source?.table_rows ?? { OBSERVATION: 0, FOLD: 0 };
    if (source && (!Number.isSafeInteger(counts.OBSERVATION) || counts.OBSERVATION < 2 || counts.OBSERVATION > 2_000_000
      || !Number.isSafeInteger(counts.FOLD) || counts.FOLD < 1 || counts.FOLD > 32)) throw new Error("Retained row bounds invalid");
    if (source) {
      const batches = await client.query(`SELECT table_kind,batch_ordinal,batch_digest,row_count
        FROM research.current_source_import_batches_v1 WHERE workspace_id=$1 AND run_id=$2 AND artifact_revision=$3
        ORDER BY table_kind,batch_ordinal LIMIT 10001`, [workspaceId, runId, source.artifact_revision]);
      if (batches.rows.length > 10_000 || currentSourceImportDigest(batches.rows) !== sourceDigest) throw new Error("Source batch-receipt digest mismatch");
    } else if (sha256ResearchJson(fixed.source_payload) !== sourceDigest) throw new Error("P04 source passport digest mismatch");
    const root = resolve(__dirname, "../../../.."), moduleRoot = resolve(root, "apps/portal/backend/src");
    child = spawn(python, [resolve(moduleRoot, "portal_api/services/research_analytics_sidecar.py")], {
      env: { ...process.env, PYTHONPATH: [moduleRoot, resolve(root, "apps/portal"), process.env.PYTHONPATH].filter(Boolean).join(":") },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let output = "";
    child.stdout!.setEncoding("utf8"); child.stdout!.on("data", chunk => { output += chunk; if (Buffer.byteLength(output) > 70_000) child?.kill(); });
    child.stderr!.resume(); child.stdin!.on("error", () => undefined);
    const timeout = setTimeout(() => child?.kill(), 120_000);
    const done = new Promise<number>((ok, fail) => { child!.once("error", fail); child!.once("close", code => { clearTimeout(timeout); ok(code ?? -1); }); });
    const write = async (item: unknown) => { if (!child!.stdin!.write(JSON.stringify(item) + "\n")) await once(child!.stdin!, "drain"); };
    const sourceRows = createHash("sha256");
    const timeframe = source?.timeframe ?? fixed.timeframe;
    const units: Record<string, number> = { "1m": 60_000, "5m": 300_000, "15m": 900_000, "30m": 1_800_000, "1h": 3_600_000, "4h": 14_400_000, "1d": 86_400_000, "1D": 86_400_000 };
    await write({ kind: "META", expected: { OBSERVATION: counts.OBSERVATION, FOLD: counts.FOLD },
      enrichment: { run_id: runId, nominal_bar_ms: units[timeframe] ?? null } });
    if (fixed) { sourceRows.update(canonicalResearchJson(fixed.source_payload)); await write({ kind: "P04_SOURCE", payload: fixed.source_payload }); }
    else for (const tableKind of ["FOLD", "OBSERVATION"] as const) {
      let next = 0;
      while (next < counts[tableKind]) {
        const rows = await client.query(`SELECT source_ordinal,payload FROM research.current_source_rows_v1
          WHERE workspace_id=$1 AND run_id=$2 AND artifact_revision=$3 AND table_kind=$4 AND source_ordinal >= $5
          ORDER BY source_ordinal LIMIT 1000`, [workspaceId, runId, source.artifact_revision, tableKind, next]);
        if (!rows.rows.length) throw new Error("Source rows missing");
        for (const row of rows.rows) {
          if (Number(row.source_ordinal) !== next || next >= counts[tableKind]) throw new Error("Source ordinals/count mismatch");
          const item = { kind: tableKind, ordinal: next++, payload: row.payload };
          sourceRows.update(canonicalResearchJson(item) + "\n"); await write(item);
        }
      }
    }
    child.stdin!.end();
    if (await done !== 0) throw new Error("Pinned enrichment derivation failed closed");
    const enriched = ResearchEnrichedAnalysisSchema.parse(JSON.parse(output)), enrichedDigest = sha256ResearchJson(enriched);
    if (enriched.run_id !== runId) throw new Error("Enrichment run identity mismatch");
    const sourceRowsDigest = sourceRows.digest("hex");
    await client.query("COMMIT"); transaction = false;
    if (action === "--apply") {
      const result = await client.query(`INSERT INTO research.enriched_analysis_v1
        (workspace_id,run_id,source_kind,source_revision,source_digest,source_rows_digest,enriched_digest,enriched)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb) ON CONFLICT DO NOTHING RETURNING enriched_digest`,
        [workspaceId, runId, kind, revision, sourceDigest, sourceRowsDigest, enrichedDigest, JSON.stringify(enriched)]);
      if (result.rowCount !== 1) throw new Error("Concurrent immutable enrichment conflicts; no overwrite");
    }
    process.stdout.write(JSON.stringify({ state: action === "--apply" ? "BACKFILLED" : "DRY_RUN", run_id: runId,
      source_kind: kind, source_revision: revision, source_digest: sourceDigest, source_rows_digest: sourceRowsDigest,
      enriched_digest: enrichedDigest, coverage: enriched.scope.coverage,
      oos_observation_count: enriched.scope.observation_count, months: enriched.monthly_returns.values.length,
      daily_returns: enriched.return_distribution.observation_count, episodes: enriched.drawdown_episodes.total }) + "\n");
  } finally {
    if (child && child.exitCode === null) child.kill();
    if (transaction) await client.query("ROLLBACK"); client.release(); await pool.end();
  }
}
void main().catch(() => { process.stderr.write("Enrichment refused; original source/Report unchanged.\n"); process.exitCode = 1; });
