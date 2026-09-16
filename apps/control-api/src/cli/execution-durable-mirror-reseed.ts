import "reflect-metadata";
import { loadConfig } from "../config";
import { buildPool } from "../db/pool";
import { reseedDurableMirrorCursors } from "../execution/durable-mirror-reseed";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const dryRun = args.includes("--dry-run");
  const runIndex = args.indexOf("--run-id");
  const runId = runIndex >= 0 ? args[runIndex + 1] : undefined;
  if ((apply === dryRun) || !runId || args.length !== 3 || runIndex < 0) {
    throw new Error("usage: execution-durable-mirror-reseed (--dry-run|--apply) --run-id <operator-run-id>");
  }
  const config = loadConfig();
  const pool = buildPool(config.DATABASE_URL);
  try {
    const result = await reseedDurableMirrorCursors(pool, config, {
      mode: apply ? "APPLY" : "DRY_RUN",
      runId,
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally {
    await pool.end();
  }
}

void main();
