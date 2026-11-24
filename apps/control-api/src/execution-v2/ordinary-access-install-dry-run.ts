/** DRY-RUN ONLY check of an owner-approved access-profile artifact for an ORDINARY Core.
 *
 * There is deliberately NO install path in this file or anywhere in this change: it imports no database pool, no
 * AccessService, no configuration and no network client, so it cannot write. It reads the root-owned 0600 artifact
 * through the existing `readPinnedOwnerArtifact` (hash-pinned, size-capped, no symlink), compares it to an
 * independent target pin, re-checks the access-profile invariants and prints a safe summary.
 *
 * A real install stays gated twice: (1) by the qualified read path: an ordinary Core has no qualified publication
 * (`readPublication` is null unless composed with executionManagerRuntime/executionAccessTrust), so a policy alone does
 * not make /manager/* answer and would only flip the workspace to SCOPED_V2; (2) by the owner approving the artifact
 * sha256 and the install itself. Neither exists yet, so the CLI can only validate.
 *
 * Output is a fixed public code on failure; never a path, hash, size, owner or error text. */
import { readPinnedOwnerArtifact, type PrivateOwnerCommissioningPin } from "./core-owner-commissioning";
import { ownerTarget } from "./owner-target";
import { parseCompactJson, parseOwnerArtifactArgs, readRootOwnedPinnedFile, type OwnerArtifactCliArguments } from "./private-root-file";
import { AccessProfileError, assertAccessProfileInvariants } from "./access-profile-artifact";

export const INSTALL_GATE_REASON = "GATED_BY_QUALIFIED_READ_PATH_AND_OWNER_APPROVAL";
export const TARGET_FILE_MAX_BYTES = 16_384;
export type AccessProfileInstallCode = "ACCESS_PROFILE_INSTALL_USAGE" | "ACCESS_PROFILE_INSTALL_REFUSED" |
  "ACCESS_PROFILE_INSTALL_INVARIANT" | "ACCESS_PROFILE_INSTALL_FAILED";
export class AccessProfileInstallError extends Error {
  constructor(readonly code: AccessProfileInstallCode, readonly exitCode: 1 | 2 = 1) {
    super("The access-profile dry-run did not complete."); this.name = "AccessProfileInstallError";
  }
}
const usage = (): never => { throw new AccessProfileInstallError("ACCESS_PROFILE_INSTALL_USAGE", 2); };

export type AccessProfileInstallArgs = OwnerArtifactCliArguments & { targetFile: string; targetSha256: string };
/** Pure. `--dry-run` is MANDATORY: without it the CLI refuses (there is nothing else it could do). */
export function parseAccessProfileInstallArgs(argv: readonly string[]): AccessProfileInstallArgs {
  const rest: string[] = []; let targetFile: string | undefined, targetSha256: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--target-file") {
      if (targetFile !== undefined || i + 1 >= argv.length) return usage();
      targetFile = argv[++i]!;
    } else if (argv[i] === "--target-sha256") {
      if (targetSha256 !== undefined || i + 1 >= argv.length) return usage();
      targetSha256 = argv[++i]!;
    } else rest.push(argv[i]!);
  }
  try {
    const parsed = parseOwnerArtifactArgs(rest);
    if (!parsed.dryRun || !targetFile?.startsWith("/") || !targetSha256 || !/^[0-9a-f]{64}$/.test(targetSha256)) return usage();
    return { ...parsed, targetFile, targetSha256 };
  } catch (error) { if (error instanceof AccessProfileInstallError) throw error; return usage(); }
}

export interface AccessProfileInstallDeps {
  now?: () => number;
  /** Trusted test seam; production ALWAYS uses the same pinned private-file boundary as the artifact. */
  readTarget?: (path: string, approvedSha256: string) => Promise<unknown>;
  readArtifact?: typeof readPinnedOwnerArtifact;
}
export const readAccessProfileTarget = async (path: string, approvedSha256: string): Promise<unknown> =>
  parseCompactJson(await readRootOwnedPinnedFile(path, approvedSha256, TARGET_FILE_MAX_BYTES));

export async function runAccessProfileInstallDryRun(argv: readonly string[], deps: AccessProfileInstallDeps = {}) {
  const args = parseAccessProfileInstallArgs(argv);
  const now = (deps.now ?? Date.now)();
  let pin: PrivateOwnerCommissioningPin;
  try {
    const target = ownerTarget.parse(await (deps.readTarget ?? readAccessProfileTarget)(args.targetFile, args.targetSha256));
    pin = { artifact_path: args.artifact, approved_sha256: args.sha256, target,
      intake_not_before_ms: args.notBeforeMs, intake_not_after_ms: args.notAfterMs };
  } catch { throw new AccessProfileInstallError("ACCESS_PROFILE_INSTALL_REFUSED"); }
  let artifact;
  try { artifact = await (deps.readArtifact ?? readPinnedOwnerArtifact)(pin, now); }
  catch { throw new AccessProfileInstallError("ACCESS_PROFILE_INSTALL_REFUSED"); }
  const doc = assertAccessProfileInvariants({
    schema_version: "portal.private-owner-manager-commissioning.v1", target: artifact.manager_commissioning_target,
    policy: artifact.policy, root_grants: artifact.root_grants, manager_domain_grants: artifact.manager_domain_grants,
    provenance_ref: artifact.provenance_ref,
  });
  const seals = doc.policy.manager_read_domains ?? [], perUser = new Map<string, number>();
  for (const g of doc.manager_domain_grants) perUser.set(g.subject_user_id, (perUser.get(g.subject_user_id) ?? 0) + 1);
  return Object.freeze({
    state: "DRY_RUN_VALIDATED" as const, writes: false as const,
    validation_scope: "OFFLINE_ARTIFACT_AND_INDEPENDENT_TARGET_PINS" as const,
    target_provenance: "ROOT_OWNED_0600_SHA256_PINNED" as const,
    runtime_target: "NOT_VERIFIED" as const,
    install: Object.freeze({ available: false as const, reason: INSTALL_GATE_REASON }),
    artifact_sha256: args.sha256, workspace_id: doc.target.workspace_id, policy_revision: doc.policy.revision,
    valid_from_ms: Math.min(...seals.map(s => s.valid_from_ms)), valid_until_ms: Math.max(...seals.map(s => s.valid_until_ms)),
    profiles: seals.map(s => ({ environment: s.environment, profile_id: s.domain.profile_id })),
    subjects: [...perUser].map(([user_id, grants]) => ({ user_id, grants })), grants: doc.manager_domain_grants.length,
    actions: [...new Set(doc.manager_domain_grants.map(g => g.action))].sort(),
  });
}

/** Only a fixed public category leaves the operator; never an error message, path, hash or SQL text. */
export function accessProfileInstallFailure(error: unknown): AccessProfileInstallError {
  if (error instanceof AccessProfileInstallError) return error;
  if (error instanceof AccessProfileError) return new AccessProfileInstallError("ACCESS_PROFILE_INSTALL_INVARIANT");
  return new AccessProfileInstallError("ACCESS_PROFILE_INSTALL_FAILED");
}
