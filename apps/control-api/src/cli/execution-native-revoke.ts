/** Offline owner maintenance ONLY: the official Core-side revoke (or narrowing) of
 * exact NATIVE manager-domain grants, READ and STREAM separately. No HTTP listener,
 * no user/password/membership/session creation, no SQL grant edit, no stable copy,
 * no legacy-grant path. Remove-only: it cannot create or widen authority.
 *
 *   node dist/cli/execution-native-revoke.js --artifact <root-owned 0600 abs path>
 *     --sha256 <approved artifact sha256> --not-before-ms <N> --not-after-ms <N> [--dry-run]
 *
 * Runs with the same Research native-review environment, hash-pinned manifest and
 * root-owned reference copies as `execution-native-install policy`. The physical
 * target (database, system id, login, protected owner, workspace) comes from the
 * manifest intake, never from the artifact. `--dry-run` reads and verifies the
 * artifact only and touches no database.
 * Exit: 0 done (receipts on stdout), 2 usage, 75 retry the SAME command (drain /
 * lock / custody pending), 1 any other typed refusal. Output carries codes and
 * reviewed ids only: no path, SQL, key, token or artifact text. */
import "reflect-metadata";
import { loadConfig } from "../config";
import { buildPool } from "../db/pool";
import { nativeCoreRuntimeReference, prepareNativeCoreRuntime } from "../execution-v2/native-core-runtime";
import { nativeResearchReview } from "../execution/native-review-profile";
import { assertRegisteredResearchCurrentHumanSchema } from "../execution-v2/current-human-schema";
import { AuthService } from "../auth/auth.service";
import { Argon2CredentialService } from "../auth/argon";
import { ExecutionAccessService } from "../execution-v2/access.service";
import { ManagerRevokeError, privateOwnerRevocation } from "../execution-v2/manager-domain-revoke";
import { parseOwnerArtifactArgs } from "../execution-v2/private-root-file";

async function main() {
  const args = parseOwnerArtifactArgs(process.argv.slice(2)), config = loadConfig();
  if (!nativeResearchReview(config) || config.PORTAL_ENV !== "local" || config.AUTH_MODE !== "dev")
    throw new Error("NATIVE_RESEARCH_REVOKE_SCOPE_REQUIRED");
  const reference = nativeCoreRuntimeReference();
  if (!reference) throw new Error("NATIVE_RESEARCH_REVOKE_SCOPE_REQUIRED");
  const workspace = config.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID!;
  const native = await prepareNativeCoreRuntime(reference), target = native.researchReviewTarget(workspace);
  const pool = buildPool(config.DATABASE_URL, native.poolProfile);
  try {
    const pin = { artifact_path: args.artifact, approved_sha256: args.sha256, target: structuredClone(target),
      not_before_ms: args.notBeforeMs, not_after_ms: args.notAfterMs };
    if (args.dryRun) {
      await privateOwnerRevocation(pool, pin).verify();
      process.stdout.write(JSON.stringify({ schema_version: "portal.native-research-manager-revoke.v1", dry_run: true, verified: true }) + "\n");
      return;
    }
    await assertRegisteredResearchCurrentHumanSchema(pool, target);
    const deps = await native.compose(pool);
    if (!deps.nativeManagerRead || !deps.currentHumanMutations || !deps.executionAccessTrust)
      throw new Error("NATIVE_RESEARCH_REVOKE_COMPOSITION_REQUIRED");
    const auth = new AuthService(pool, config, new Argon2CredentialService({ memoryKib: config.ARGON2_MEMORY_KIB,
      iterations: config.ARGON2_ITERATIONS, parallelism: config.ARGON2_PARALLELISM }), deps.currentHumanMutations);
    const access = new ExecutionAccessService(pool, auth, deps.executionAccessTrust, false, deps.currentHumanMutations);
    const results = await deps.nativeManagerRead.revokeOwnerManagerGrants(access, { workspace_id: workspace,
      artifact_path: args.artifact, approved_sha256: args.sha256, not_before_ms: args.notBeforeMs, not_after_ms: args.notAfterMs });
    process.stdout.write(JSON.stringify({ schema_version: "portal.native-research-manager-revoke.v1", results }) + "\n");
  } finally { await pool.end(); }
}
void main().catch(error => {
  // Neither paths, private JSON, SQL details, URLs nor source exceptions.
  const typed = error instanceof ManagerRevokeError ? error.code
    : error instanceof Error && /^(OWNER_ARTIFACT_USAGE|NATIVE_RESEARCH_REVOKE_[A-Z_]+|CURRENT_HUMAN_SCHEMA_[A-Z_]+)$/.test(error.message) ? error.message
    : "NATIVE_RESEARCH_REVOKE_FAILED";
  process.stderr.write(JSON.stringify({ code: typed }) + "\n");
  process.exitCode = typed === "OWNER_ARTIFACT_USAGE" ? 2
    : typed === "MANAGER_REVOKE_DRAIN_PENDING" || typed === "MANAGER_REVOKE_RETRY_REQUIRED" ? 75 : 1;
});
