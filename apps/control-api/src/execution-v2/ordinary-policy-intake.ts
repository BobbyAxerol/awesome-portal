/** PRIVATE Research maintenance only. This prepares the EXISTING ordinary
 * policy writer; it does not qualify TS acceptance, listen, create identities,
 * grant native-domain authority or install anything during construction. */
import type { Pool } from "pg";
import { z } from "zod";
import type { AuthService } from "../auth/auth.service";
import { AccessPolicyError, accessWriteText, reviewedAccessPolicy, scopedAccessGrant, tsBusinessAction } from "./access.contract";
import { accessDigest } from "./access-digest";
import { ExecutionAccessService } from "./access.service";
import { unqualifiedAccessTrust, type AccessTrustProvider, type ReviewedPolicyArtifact } from "./access-trust";
import { assertRegisteredResearchCurrentHumanSchema, nativeCoreSchemaTarget } from "./current-human-schema";
import type { CurrentHumanMutations } from "./current-human-mutations";
import { OWNER_ARTIFACT_MAX_WINDOW_MS, parseCompactJson, readRootOwnedPinnedFile } from "./private-root-file";

const scopeSchema = z.object({ kind: z.literal("RESEARCH"), environment: z.literal("paper"),
  PORTAL_ENV: z.literal("local"), AUTH_MODE: z.literal("dev"),
  EXECUTION_READ_PROFILE: z.literal("native_manager_review_v1") }).strict();
const pinSchema = z.object({ artifact_path: z.string().startsWith("/"), approved_sha256: z.string().regex(/^[a-f0-9]{64}$/u),
  target: nativeCoreSchemaTarget, intake_not_before_ms: z.number().int().nonnegative().safe(),
  intake_not_after_ms: z.number().int().positive().safe() }).strict().refine(value =>
  value.intake_not_after_ms > value.intake_not_before_ms &&
  value.intake_not_after_ms - value.intake_not_before_ms <= OWNER_ARTIFACT_MAX_WINDOW_MS);
const documentSchema = z.object({ schema_version: z.literal("portal.private-owner-ordinary-policy.v1"),
  target: nativeCoreSchemaTarget, policy: reviewedAccessPolicy, root_grants: z.array(scopedAccessGrant).max(200),
  provenance_ref: accessWriteText }).strict();
export type OrdinaryPolicyIntakePin = z.infer<typeof pinSchema>;
export type OrdinaryPolicyIntakeScope = z.infer<typeof scopeSchema>;

const refused = (): never => { throw new AccessPolicyError("RECEIPT_NOT_QUALIFIED", 503); };
function currentWindow(pin: OrdinaryPolicyIntakePin, now: number): void {
  if (!Number.isSafeInteger(now) || now < pin.intake_not_before_ms || now >= pin.intake_not_after_ms) refused();
}
function economic(grant: ReviewedPolicyArtifact["root_grants"][number]): boolean {
  return grant.effect === "ALLOW" && tsBusinessAction(grant.action);
}
function hasRootVerifier(base: AccessTrustProvider): boolean {
  // Presence is a configured adapter port, NOT source acceptance. A null result
  // remains unavailable in the official receipt writer and every later read.
  return typeof base.verifyRootReceipt === "function" && base !== unqualifiedAccessTrust &&
    base.verifyRootReceipt !== unqualifiedAccessTrust.verifyRootReceipt;
}

/** Shared root-owned0600/hash/O_NOFOLLOW/stable-file reader. No grant may carry
 * an embedded source receipt; the existing root-receipt writer owns it later.
 * This private format deliberately cannot import manager-domain grants. */
export async function readPinnedOrdinaryPolicyArtifact(input: OrdinaryPolicyIntakePin, now: number): Promise<ReviewedPolicyArtifact> {
  try {
    const pin = pinSchema.parse(input); currentWindow(pin, now);
    const raw = await readRootOwnedPinnedFile(pin.artifact_path, pin.approved_sha256);
    const value = documentSchema.parse(parseCompactJson(raw));
    const policy = value.policy, target = pin.target;
    if (accessDigest(value.target) !== accessDigest(target) || policy.state !== "REVIEWED" ||
      policy.qualification !== "OWNER_VERIFIED" || policy.workspace_id !== target.workspace_id ||
      policy.protected_owner_user_id !== target.protected_owner_user_id ||
      new Set(value.root_grants.map(grant => grant.grant_id)).size !== value.root_grants.length) return refused();
    for (const grant of value.root_grants) {
      const subjectPinned = target.principal_workspace_pins.some(principal => principal.user_id === grant.subject_user_id &&
        principal.workspace_id === grant.workspace_id);
      if (!subjectPinned || grant.workspace_id !== target.workspace_id || grant.policy_revision !== policy.revision ||
        grant.issued_by !== target.protected_owner_user_id || grant.parent_grant_id !== null ||
        grant.revoked_at_ms !== null || grant.action === "owner.recovery" || grant.delegable_actions.length !== 0 ||
        grant.environments.length !== 1 || grant.environments[0] !== "paper" || grant.valid_until_ms === null ||
        grant.ts_receipt !== null || grant.ts_acceptance_digest !== undefined || economic(grant) && !grant.requires_ts_acceptance)
        return refused();
      // Stored legacy parsers stay untouched. New private writes still use the
      // existing write-text policy without normalizing original ID bytes.
      for (const id of [grant.grant_id, grant.subject_user_id, grant.workspace_id, grant.issued_by,
        ...(grant.selector.kind === "EXPLICIT_RESOURCE_SET" ? grant.selector.ids :
          grant.selector.kind === "PORTFOLIO_MEMBERSHIP" ? grant.selector.portfolio_ids :
          grant.selector.kind === "ROOT_SCOPE" ? [grant.selector.root_id] : [])]) accessWriteText.parse(id);
    }
    return { policy, root_grants: value.root_grants, provenance_ref: value.provenance_ref };
  } catch { return refused(); }
}

/** Callable only by a separately approved private operator composition. The
 * same real source provider/coordinator/pool must also serve the application.
 * Callback presence does not authenticate a source; no successful source fact
 * is created here. Economic roots remain pending their real held TS receipt.
 * The official writer retains immutable policy-install replay and old history;
 * it may advance current policy revision, so the operator reviews the ENTIRE
 * artifact, including seals, rather than silently merging old/current roots. */
export function composeOrdinaryPolicyIntake(pool: Pool, auth: AuthService, base: AccessTrustProvider,
  mutations: CurrentHumanMutations, input: OrdinaryPolicyIntakePin, scope: OrdinaryPolicyIntakeScope,
  clock: () => number = Date.now) {
  let pin: OrdinaryPolicyIntakePin;
  try {
    scopeSchema.parse(scope); pin = pinSchema.parse(structuredClone(input));
    if (!mutations.usesPool(pool) || !base || [base.verifyPolicy, base.verifyReceipt, base.relations, base.verifiedHumanMapping]
      .some(callback => typeof callback !== "function")) return refused();
  } catch { return refused(); }
  const request = Object.freeze({});
  let verified: ReviewedPolicyArtifact | undefined;
  const trust: AccessTrustProvider = Object.freeze({
    verifyPolicy: async (value: unknown) => {
      if (value !== request) return base.verifyPolicy(value);
      const artifact = await readPinnedOrdinaryPolicyArtifact(pin, clock());
      if (artifact.root_grants.some(economic) && !hasRootVerifier(base)) return refused();
      // Actual registered Research target, owner, principal/workspace membership
      // and same-pool schema; no caller-supplied verifier or SQL seed bypass.
      await assertRegisteredResearchCurrentHumanSchema(pool, pin.target);
      currentWindow(pin, clock()); verified = structuredClone(artifact);
      return artifact;
    },
    verifyReceipt: base.verifyReceipt.bind(base),
    ...(base.verifyRootReceipt ? { verifyRootReceipt: base.verifyRootReceipt.bind(base) } : {}),
    ...(base.qualifyDelegatedReceipt ? { qualifyDelegatedReceipt: base.qualifyDelegatedReceipt.bind(base) } : {}),
    relations: base.relations.bind(base), verifiedHumanMapping: base.verifiedHumanMapping.bind(base),
    ...(base.readPublication ? { readPublication: base.readPublication.bind(base) } : {}),
  });
  // Explicit false: OWNER_VERIFIED only, never a production TEST_ONLY bypass.
  const access = new ExecutionAccessService(pool, auth, trust, false, mutations);
  return Object.freeze({ dependencies: Object.freeze({ executionAccessTrust: trust, currentHumanMutations: mutations }),
    install: async () => {
      await access.installReviewedPolicy(request);
      if (!verified) return refused();
      const pending = verified.root_grants.filter(grant => economic(grant) || grant.requires_ts_acceptance).length;
      return Object.freeze({ schema_version: "portal.private-ordinary-policy-install.v1" as const,
        state: "REVIEWED_ORDINARY_POLICY_ACKNOWLEDGED" as const, authority_scope: "POLICY_INSTALL_ONLY" as const,
        artifact_sha256: pin.approved_sha256, workspace_id: pin.target.workspace_id,
        policy_revision: verified.policy.revision, root_grants: verified.root_grants.length,
        roots_pending_ts_acceptance: pending, source_acceptance: "NOT_PERFORMED" as const,
        business_read_commissioned: false, stream_commissioned: false, command_commissioned: false });
    } });
}
