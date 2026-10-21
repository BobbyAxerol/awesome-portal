/** Offline owner tool, Research ONLY. No HTTP, SQL grant seed or session issue.
 * Flags match execution-native-revoke. --dry-run verifies private bytes/shape/
 * pins only (NOT DB CAS or READY). Runtime must carry newly reviewed finite
 * source/trust and owner-intake caps; old recovery config is not renewed here. */
import "reflect-metadata";
import { loadConfig } from "../config";
import { buildPool } from "../db/pool";
import { AuthService } from "../auth/auth.service";
import { Argon2CredentialService } from "../auth/argon";
import { nativeResearchReview } from "../execution/native-review-profile";
import { nativeCoreRuntimeReference, prepareNativeCoreRuntime } from "../execution-v2/native-core-runtime";
import { assertRegisteredResearchCurrentHumanSchema } from "../execution-v2/current-human-schema";
import { ExecutionAccessService } from "../execution-v2/access.service";
import { parseOwnerArtifactArgs } from "../execution-v2/private-root-file";
import { readPinnedManagerSuccessor, ManagerSuccessorError } from "../execution-v2/manager-domain-successor";

async function main() {
  const args = parseOwnerArtifactArgs(process.argv.slice(2)), config = loadConfig();
  if (!nativeResearchReview(config) || config.PORTAL_ENV !== "local" || config.AUTH_MODE !== "dev")
    throw new Error("NATIVE_RESEARCH_SUCCESSOR_SCOPE_REQUIRED");
  const reference = nativeCoreRuntimeReference();
  if (!reference) throw new Error("NATIVE_RESEARCH_SUCCESSOR_SCOPE_REQUIRED");
  const native = await prepareNativeCoreRuntime(reference), workspace = config.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID!;
  const target = native.researchReviewTarget(workspace), caps = native.researchGrantWindow(workspace);
  const token = await readPinnedManagerSuccessor({ artifact_path: args.artifact, approved_sha256: args.sha256,
    target: structuredClone(target), not_before_ms: args.notBeforeMs, not_after_ms: args.notAfterMs,
    source_expires_at_ms: caps.trust_not_after_ms, maximum_grant_ms: caps.maximum_grant_ms }, Date.now());
  if (args.dryRun) {
    process.stdout.write(JSON.stringify({ schema_version: "portal.native-research-manager-successor.v1", dry_run: true,
      verified: true, database_cas_checked: false }) + "\n");
    return;
  }
  const pool = buildPool(config.DATABASE_URL, native.poolProfile);
  try {
    await assertRegisteredResearchCurrentHumanSchema(pool, target);
    const deps = await native.compose(pool);
    if (!deps.currentHumanMutations || !deps.executionAccessTrust || !deps.nativeManagerRead)
      throw new Error("NATIVE_RESEARCH_SUCCESSOR_COMPOSITION_REQUIRED");
    const auth = new AuthService(pool, config, new Argon2CredentialService({ memoryKib: config.ARGON2_MEMORY_KIB,
      iterations: config.ARGON2_ITERATIONS, parallelism: config.ARGON2_PARALLELISM }), deps.currentHumanMutations);
    const access = new ExecutionAccessService(pool, auth, deps.executionAccessTrust, false, deps.currentHumanMutations);
    const receipt = await access.installReviewedManagerDomainSuccessor(token);
    process.stdout.write(JSON.stringify({ schema_version: "portal.native-research-manager-successor.v1", receipt }) + "\n");
  } finally { await pool.end(); }
}
void main().catch(error => {
  const code = error instanceof ManagerSuccessorError ? error.code : error instanceof Error &&
    /^(OWNER_ARTIFACT_USAGE|NATIVE_RESEARCH_SUCCESSOR_[A-Z_]+|CURRENT_HUMAN_SCHEMA_[A-Z_]+)$/.test(error.message)
      ? error.message : "NATIVE_RESEARCH_SUCCESSOR_FAILED";
  process.stderr.write(JSON.stringify({ code }) + "\n");
  process.exitCode = code === "OWNER_ARTIFACT_USAGE" ? 2 : code === "MANAGER_SUCCESSOR_RETRY_REQUIRED" ? 75 : 1;
});
