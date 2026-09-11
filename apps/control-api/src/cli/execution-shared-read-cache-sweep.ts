import "reflect-metadata";
import { loadConfig } from "../config";
import { buildPool } from "../db/pool";
import { ExecutionSharedReadRepository } from "../execution/shared-read.repository";
import { runSharedReadCacheSweep } from "../execution/shared-read-cache-maintenance";

/**
 * Manual operations aid. It is dry-run unless `--apply` is supplied, and it
 * can only touch the one recomputable cache table through the repository.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== "--apply" && arg !== "--dry-run")) {
    throw new Error("usage: execution-shared-read-cache-sweep [--dry-run|--apply]");
  }
  if (args.includes("--apply") && args.includes("--dry-run")) {
    throw new Error("choose either --dry-run or --apply");
  }
  const config = loadConfig();
  const pool = buildPool(config.DATABASE_URL);
  try {
    const repository = new ExecutionSharedReadRepository(pool, config);
    const report = await runSharedReadCacheSweep(repository, config, {
      dryRun: args.includes("--apply") ? false : true,
    });
    process.stdout.write(`${JSON.stringify(report)}\n`);
    if (report.mode === "APPLY" && report.outcome !== "DRAINED") process.exitCode = 3;
  } finally {
    await pool.end();
  }
}

void main();
