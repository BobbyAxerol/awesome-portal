/** Explicit offline Research operator. No listener/startup install, SQL seed,
 * session issue or caller-supplied source fact. Configuration is not authority. */
import { loadConfig } from "../config";
import { buildPool } from "../db/pool";
import { AuthService } from "../auth/auth.service";
import { Argon2CredentialService } from "../auth/argon";
import { nativeResearchReview } from "../execution/native-review-profile";
import { accessDigest } from "./access-digest";
import { ExecutionAccessService } from "./access.service";
import { nativeCoreRuntimeReference, prepareNativeCoreRuntime } from "./native-core-runtime";
import { nativeRootRuntimeReference, prepareNativeRootRuntime, prepareNativeRootApplication,
  type PreparedNativeRootApplication, type PreparedNativeRootRuntime } from "./native-root-runtime";
import { nativeRootOriginal } from "./native-root-codec";
import { composeOrdinaryPolicyIntake, readPinnedOrdinaryPolicyArtifact,
  type OrdinaryPolicyIntakePin } from "./ordinary-policy-intake";
import { parseOwnerArtifactArgs, type OwnerArtifactCliArguments } from "./private-root-file";

type Arguments = ({ operation: "install-policy" } & OwnerArtifactCliArguments) |
  { operation: "accept-root"; dryRun: boolean };
export type OrdinaryPolicyOperatorCode = "ORDINARY_POLICY_OPERATOR_USAGE" | "ORDINARY_POLICY_OPERATOR_SCOPE_REQUIRED" |
  "ORDINARY_POLICY_OPERATOR_CONFIG_INVALID" | "ORDINARY_POLICY_OPERATOR_COMPOSITION_REQUIRED" |
  "ORDINARY_POLICY_OPERATOR_REFUSED" | "ORDINARY_POLICY_OPERATOR_RECOVERY_REQUIRED" | "ORDINARY_POLICY_OPERATOR_FAILED";
export class OrdinaryPolicyOperatorError extends Error {
  constructor(readonly code: OrdinaryPolicyOperatorCode, readonly exitCode: 1 | 2 | 75 = 1) {
    super("The private Research operator did not complete.");
  }
}
const refuse = (code: OrdinaryPolicyOperatorCode): never => { throw new OrdinaryPolicyOperatorError(code); };

/** Reuse the existing owner artifact parser only for policy installation.
 * ROOT acceptance reads its exact original from the pinned ROOT configuration;
 * an expired historical policy-intake window must not prevent same-original recovery. */
export function parseOrdinaryPolicyOperatorArgs(argv: readonly string[]): Arguments {
  const [operation, ...flags] = argv;
  try {
    if (operation === "accept-root" && (flags.length === 0 || flags.length === 1 && flags[0] === "--dry-run"))
      return { operation, dryRun: flags.length === 1 };
    if (operation === "install-policy" && flags.filter(value => value === "--dry-run").length <= 1)
      return { operation, ...parseOwnerArtifactArgs(flags) };
  } catch { /* Never echo argv, paths or private artifact input. */ }
  throw new OrdinaryPolicyOperatorError("ORDINARY_POLICY_OPERATOR_USAGE", 2);
}

/** Only a fixed public category leaves the operator. Never relay a source/SQL
 * error message, URL, private path, certificate, token or arbitrary code. */
export function ordinaryPolicyOperatorFailure(error: unknown): OrdinaryPolicyOperatorError {
  if (error instanceof OrdinaryPolicyOperatorError) return error;
  const code = error instanceof Error && "code" in error && typeof error.code === "string" ? error.code : "";
  if (["ACCESS_RETRY_REQUIRED", "NATIVE_ROOT_RECOVERY_REQUIRED", "NATIVE_ROOT_CAPACITY_EXHAUSTED",
    "NATIVE_ROOT_CUSTODY_CONFLICT", "CURRENT_HUMAN_MUTATION_OUTCOME_UNCERTAIN", "CURRENT_HUMAN_MUTATION_PENDING",
    "CURRENT_HUMAN_DRAIN_CONFLICT", "CURRENT_HUMAN_MUTATION_RECOVERY_INVALID", "CURRENT_HUMAN_MUTATION_CAPACITY_EXHAUSTED"].includes(code))
    return new OrdinaryPolicyOperatorError("ORDINARY_POLICY_OPERATOR_RECOVERY_REQUIRED", 75);
  if (["RECEIPT_NOT_QUALIFIED", "RECEIPT_BINDING_MISMATCH", "POLICY_REVISION_CONFLICT", "RECEIPT_PAYLOAD_CONFLICT",
    "NATIVE_ROOT_NOT_QUALIFIED", "NATIVE_ROOT_ORIGINAL_CHANGED", "CURRENT_ACTOR_AUTHORITY_REQUIRED"].includes(code))
    return new OrdinaryPolicyOperatorError("ORDINARY_POLICY_OPERATOR_REFUSED");
  if (["CURRENT_HUMAN_NATIVE_RUNTIME_CONFIG_INVALID", "NATIVE_ROOT_RUNTIME_CONFIG_INVALID", "NATIVE_ROOT_CONFIG_INVALID"].includes(code))
    return new OrdinaryPolicyOperatorError("ORDINARY_POLICY_OPERATOR_CONFIG_INVALID");
  return new OrdinaryPolicyOperatorError("ORDINARY_POLICY_OPERATOR_FAILED");
}

function wipeRootTransport(runtime: PreparedNativeRootRuntime | undefined): void {
  if (runtime) for (const bytes of Object.values(runtime.transport.tls)) if (Buffer.isBuffer(bytes)) bytes.fill(0);
}

export async function runOrdinaryPolicyOperator(argv: readonly string[], env: NodeJS.ProcessEnv = process.env) {
  let rootRuntime: PreparedNativeRootRuntime | undefined;
  try {
    const args = parseOrdinaryPolicyOperatorArgs(argv), config = loadConfig(env);
    if (!nativeResearchReview(config) || config.PORTAL_ENV !== "local" || config.AUTH_MODE !== "dev" ||
      !config.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID)
      return refuse("ORDINARY_POLICY_OPERATOR_SCOPE_REQUIRED");
    const nativeReference = nativeCoreRuntimeReference(env), rootReference = nativeRootRuntimeReference(env);
    if (!nativeReference || !rootReference) return refuse("ORDINARY_POLICY_OPERATOR_CONFIG_INVALID");
    const native = await prepareNativeCoreRuntime(nativeReference);
    rootRuntime = await prepareNativeRootRuntime(rootReference);
    const workspace = config.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID, target = native.researchReviewTarget(workspace);
    if (accessDigest(target) !== accessDigest(rootRuntime.schemaTarget) ||
      accessDigest(native.poolProfile) !== accessDigest(rootRuntime.poolProfile))
      return refuse("ORDINARY_POLICY_OPERATOR_CONFIG_INVALID");
    const original = Object.freeze(nativeRootOriginal.parse(structuredClone(rootRuntime.provider.original)));
    let pin: OrdinaryPolicyIntakePin | undefined;
    if (args.operation === "install-policy") {
      pin = { artifact_path: args.artifact, approved_sha256: args.sha256, target: structuredClone(target),
        intake_not_before_ms: args.notBeforeMs, intake_not_after_ms: args.notAfterMs };
      // Hash/owner/schema/window validation happens BEFORE even constructing a
      // pool. The real writer independently re-reads these bytes on execution.
      await readPinnedOrdinaryPolicyArtifact(pin, Date.now());
    }
    if (args.dryRun) return Object.freeze({ schema_version: "portal.private-ordinary-policy-operator.v1" as const,
      operation: args.operation, dry_run: true, validation_scope: "CONFIG_AND_ARTIFACT_ONLY" as const,
      artifact_checked: args.operation === "install-policy", database_checked: false, source_checked: false,
      business_read_commissioned: false, stream_commissioned: false, command_commissioned: false });

    const pool = buildPool(config.DATABASE_URL, native.poolProfile);
    let root: PreparedNativeRootApplication | undefined;
    try {
      // This factory verifies the registered SAME target and migration152 before
      // constructing the inert provider. No source request/listener is implicit.
      root = await prepareNativeRootApplication(pool, rootRuntime);
      const deps = await native.compose(pool, [], undefined, root.provider);
      if (!deps.currentHumanMutations || !deps.executionAccessTrust || !deps.nativeManagerRead ||
        !deps.currentHumanMutations.usesPool(pool) || !root.provider.usesPool(pool) ||
        !deps.currentHumanMutations.hasRootRecoveryParticipant(root.provider))
        return refuse("ORDINARY_POLICY_OPERATOR_COMPOSITION_REQUIRED");
      const auth = new AuthService(pool, config, new Argon2CredentialService({ memoryKib: config.ARGON2_MEMORY_KIB,
        iterations: config.ARGON2_ITERATIONS, parallelism: config.ARGON2_PARALLELISM }), deps.currentHumanMutations);
      if (args.operation === "install-policy") {
        if (!pin) return refuse("ORDINARY_POLICY_OPERATOR_CONFIG_INVALID");
        const intake = composeOrdinaryPolicyIntake(pool, auth, deps.executionAccessTrust, deps.currentHumanMutations, pin,
          { kind: "RESEARCH", environment: "paper", PORTAL_ENV: "local", AUTH_MODE: "dev", EXECUTION_READ_PROFILE: "native_manager_review_v1" });
        return await intake.install();
      }
      const access = new ExecutionAccessService(pool, auth, deps.executionAccessTrust, false, deps.currentHumanMutations);
      // No caller-supplied acceptance JSON. This exact original is qualified by
      // the actual native source at QUALIFY and COMMIT under the same coordinator.
      const result = await access.acceptRootTsReceipt(original);
      return Object.freeze({ schema_version: "portal.private-ordinary-policy-operator.v1" as const,
        operation: args.operation, dry_run: false, authority_scope: "ROOT_RECEIPT_ONLY" as const,
        receipt: { operation_id: result.receipt.operation_id, outcome: result.receipt.outcome,
          policy_revision: result.receipt.policy_revision, grant_revision: result.receipt.grant_revision }, replayed: result.replayed,
        business_read_commissioned: false, stream_commissioned: false, command_commissioned: false });
    } finally {
      // Never end the pool after an uncertain source drain: unresolved original
      // custody must remain durable and the operator receives retry/recovery75.
      if (root) try { await root.shutdown(); }
      catch { throw new OrdinaryPolicyOperatorError("ORDINARY_POLICY_OPERATOR_RECOVERY_REQUIRED", 75); }
      await pool.end();
    }
  } catch (error) { throw ordinaryPolicyOperatorFailure(error); }
  finally { wipeRootTransport(rootRuntime); }
}
