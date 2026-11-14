/** PROPOSAL R2n, offline owner maintenance ONLY (never in a server path). Resets a STUCK candidate schema after an
 * archive: see execution-v2/native-candidate-reset.ts. No HTTP listener, no startup install, no user/session/grant/SQL seed.
 * usage: execution-native-candidate-reset (--dry-run | --apply --archive-path <file> --archive-sha256 <hex> --confirm RESET_<8 hex>) */
import "reflect-metadata";
import { loadConfig } from "../config";
import { buildPool } from "../db/pool";
import { nativeResearchSchemaReference, prepareNativeResearchSchemaInstall } from "../execution-v2/native-core-runtime";
import { nativeResearchReview } from "../execution/native-review-profile";
import { inspectStuckCandidateSchema, resetResearchCurrentHumanSchema, NativeCandidateResetError } from "../execution-v2/native-candidate-reset";

async function main() {
  const args = process.argv.slice(2), config = loadConfig(), apply = args.includes("--apply"), dry = args.includes("--dry-run");
  const val = (flag: string) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
  if (apply === dry || !nativeResearchReview(config) || config.PORTAL_ENV !== "local" || config.AUTH_MODE !== "dev")
    throw new Error("NATIVE_RESEARCH_RESET_SCOPE_REQUIRED");
  const reference = nativeResearchSchemaReference();
  if (!reference) throw new Error("NATIVE_RESEARCH_SCHEMA_TARGET_REQUIRED");
  const prepared = await prepareNativeResearchSchemaInstall(reference, config.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID!);
  const pool = buildPool(config.DATABASE_URL, prepared.poolProfile);
  try {
    if (dry) { process.stdout.write(JSON.stringify({ mode: "DRY_RUN", ...(await inspectStuckCandidateSchema(pool, prepared.target)) }) + "\n"); return; }
    const archive_path = val("--archive-path"), archive_sha256 = val("--archive-sha256"), confirm = val("--confirm");
    if (!archive_path || !archive_sha256 || !confirm) throw new Error("NATIVE_RESEARCH_RESET_ARGS_REQUIRED");
    const result = await resetResearchCurrentHumanSchema(pool, { target: prepared.target, archive_path, archive_sha256, confirm });
    process.stdout.write(JSON.stringify({ mode: "APPLY", ...result }) + "\n");
  } finally { await pool.end(); }
}
void main().catch(error => {
  const code = error instanceof NativeCandidateResetError ? error.message : error instanceof Error && /^(NATIVE_RESEARCH_[A-Z_]+|CURRENT_HUMAN_SCHEMA_[A-Z_]+)$/.test(error.message) ? error.message : "NATIVE_RESEARCH_RESET_FAILED";
  process.stderr.write(JSON.stringify({ code }) + "\n");
  process.exitCode = 1;
});
