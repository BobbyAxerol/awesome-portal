import "reflect-metadata";

import { createControlApiApp } from "../app";
import { loadConfig } from "../config";
import { buildPool } from "../db/pool";
import { ResearchReportService } from "../research/report.service";

/**
 * Explicit, finite P18 export worker. It neither daemonizes nor opens a
 * source/engine connection: deployment may invoke it after an approved job
 * request, while a stopped worker leaves the durable report readable.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const limitArg = args.find((arg) => arg.startsWith("--limit="));
  if (args.some((arg) => arg !== limitArg) || (limitArg && !/^--limit=[1-9][0-9]?$/.test(limitArg))) {
    throw new Error("usage: research-report-export-worker [--limit=1..99]");
  }
  const limit = limitArg ? Number(limitArg.slice("--limit=".length)) : 1;
  if (limit > 16) throw new Error("research-report-export-worker limit must not exceed 16");
  const config = loadConfig();
  if (config.FEATURE_RESEARCH_REPORTS !== "true") {
    throw new Error("FEATURE_RESEARCH_REPORTS=true is required for report export worker");
  }
  const pool = buildPool(config.DATABASE_URL);
  const app = await createControlApiApp(config, pool);
  try {
    const service = app.get(ResearchReportService);
    let processed = 0;
    for (; processed < limit; processed += 1) {
      const result = await service.processOneExport();
      if (!result.processed) break;
      process.stdout.write(`${JSON.stringify({ event: "research_report_export_completed", job_id: result.job.job_id })}\n`);
    }
    process.stdout.write(`${JSON.stringify({ event: "research_report_export_worker_complete", processed })}\n`);
  } finally {
    await app.close();
    await pool.end();
  }
}

void main();
