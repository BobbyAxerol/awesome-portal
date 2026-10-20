/** Offline owner maintenance ONLY: issue or revoke ONE temporary Research acceptance
 * session for the exact protected Portal owner, through the ACTUAL AuthService and
 * the SAME current-human coordinator. No HTTP listener, no password change, no fake
 * cookie/assertion, no copy of another session, no Cloudflare/PREVIEW claim.
 *
 *   node dist/cli/execution-native-session.js issue|revoke --artifact <root-owned 0600 abs path>
 *     --sha256 <approved artifact sha256> --not-before-ms <N> --not-after-ms <N> [--dry-run]
 *
 * `--dry-run` is OFFLINE: it runs right after the manifest target is read and BEFORE any Pool, schema read, AuthService or
 * native composition. It validates the artifact fully (root-owned 0600, hash, shape, target pin, TTL, windows) and the
 * token-path rules that need no database, then prints a secret-free verdict. It cannot connect, mutate or issue.
 *
 * `issue` writes the session token ONLY to the root-owned 0600 file named in the
 * artifact (created exclusively before the session exists) and prints a secret-free
 * receipt: session id, expiry, a hash of the path. The token is never printed.
 * `revoke` revokes exactly that session id (refusing any session that is not a
 * Research acceptance session of the pinned owner) and then wipes the token file.
 * The physical target comes from the hash-pinned manifest intake, never the artifact.
 * Same environment, manifest and root-owned reference copies as the installer.
 * Exit: 0 done, 2 usage, 75 retry the SAME command (drain / lock pending), 1 typed refusal. */
import "reflect-metadata";
import { loadConfig } from "../config";
import { buildPool } from "../db/pool";
import { nativeCoreRuntimeReference, prepareNativeCoreRuntime } from "../execution-v2/native-core-runtime";
import { nativeResearchReview } from "../execution/native-review-profile";
import { assertRegisteredResearchCurrentHumanSchema } from "../execution-v2/current-human-schema";
import { AuthService } from "../auth/auth.service";
import { Argon2CredentialService } from "../auth/argon";
import { parseOwnerArtifactArgs } from "../execution-v2/private-root-file";
import { AcceptanceSessionError, nodeAcceptanceTokenFiles, privateAcceptanceSession, verifyAcceptanceArtifactOffline } from "../execution-v2/research-acceptance-session";

async function main() {
  const [operation, ...rest] = process.argv.slice(2);
  if (operation !== "issue" && operation !== "revoke") throw new Error("OWNER_ARTIFACT_USAGE");
  const args = parseOwnerArtifactArgs(rest), config = loadConfig();
  if (!nativeResearchReview(config) || config.PORTAL_ENV !== "local" || config.AUTH_MODE !== "dev")
    throw new Error("NATIVE_RESEARCH_SESSION_SCOPE_REQUIRED");
  const reference = nativeCoreRuntimeReference();
  if (!reference) throw new Error("NATIVE_RESEARCH_SESSION_SCOPE_REQUIRED");
  const workspace = config.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID!;
  // Manifest only (hash-pinned file read, no Core DB query, no composition): the target pin the artifact must equal.
  const native = await prepareNativeCoreRuntime(reference), target = native.researchReviewTarget(workspace);
  const pin = { artifact_path: args.artifact, approved_sha256: args.sha256, target: structuredClone(target),
    not_before_ms: args.notBeforeMs, not_after_ms: args.notAfterMs };
  if (args.dryRun) {
    // OFFLINE, before any Pool, schema read, AuthService or native composition: nothing here can connect, mutate or issue.
    await verifyAcceptanceArtifactOffline(operation, pin, nodeAcceptanceTokenFiles);
    process.stdout.write(JSON.stringify({ schema_version: "portal.native-research-acceptance-session.v1", operation, dry_run: true, verified: true }) + "\n");
    return;
  }
  const pool = buildPool(config.DATABASE_URL, native.poolProfile);
  try {
    await assertRegisteredResearchCurrentHumanSchema(pool, target);
    const deps = await native.compose(pool);
    if (!deps.currentHumanMutations) throw new Error("NATIVE_RESEARCH_SESSION_COMPOSITION_REQUIRED");
    const auth = new AuthService(pool, config, new Argon2CredentialService({ memoryKib: config.ARGON2_MEMORY_KIB,
      iterations: config.ARGON2_ITERATIONS, parallelism: config.ARGON2_PARALLELISM }), deps.currentHumanMutations);
    const session = privateAcceptanceSession({ auth, pool, mutations: deps.currentHumanMutations, files: nodeAcceptanceTokenFiles }, pin);
    const receipt = operation === "issue" ? await session.issue() : await session.revoke();
    process.stdout.write(JSON.stringify({ schema_version: "portal.native-research-acceptance-session.v1", operation, receipt }) + "\n");
  } finally { await pool.end(); }
}
void main().catch(error => {
  // Never a path, token, SQL text, URL or private JSON.
  const typed = error instanceof AcceptanceSessionError ? error.code
    : error instanceof Error && /^(OWNER_ARTIFACT_USAGE|NATIVE_RESEARCH_SESSION_[A-Z_]+|CURRENT_HUMAN_SCHEMA_[A-Z_]+)$/.test(error.message) ? error.message
    : "NATIVE_RESEARCH_SESSION_FAILED";
  process.stderr.write(JSON.stringify({ code: typed }) + "\n");
  process.exitCode = typed === "OWNER_ARTIFACT_USAGE" ? 2 : typed === "ACCEPTANCE_DRAIN_PENDING" || typed === "ACCEPTANCE_RETRY_REQUIRED" ? 75 : 1;
});
