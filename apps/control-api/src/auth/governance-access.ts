import type { EffectiveAccess } from "./owner-access.service";
import type { PortalCapability } from "../repos/owner-access";

/**
 * A4-3 · one adapter for every R1/R2/Canary/Live authorization decision.
 *
 * §20.5 item 3 asks for exactly one, and the reason is the reason A4-1 built
 * `mutationSecurityDenial`: seven hand-copies of a security rule become seven
 * slightly different rules, and the one that drifts is the one nobody reads.
 *
 * What it decides, and nothing else:
 *
 *  - does this caller hold the capability for this gate in this mode, and
 *  - does the grant reach the workspace the request is about.
 *
 * What it deliberately does NOT decide: evidence completeness, quorum, expected
 * revision, self-approval, whether a decision already exists. §20.2 rule 4 is
 * explicit that a grant never bypasses those, so they stay exactly where they
 * are and run *after* this. A capability answers "may this person be here at
 * all"; those answer "is this particular decision allowed right now".
 */

export const GOVERNANCE_GATES = ["r1", "r2", "canary", "live"] as const;
export type GovernanceGate = (typeof GOVERNANCE_GATES)[number];
export type GovernanceMode = "read" | "decide";

export type GovernanceDenial =
  | "GOVERNANCE_CAPABILITY_REQUIRED"
  | "GOVERNANCE_SCOPE_MISMATCH";

export const GOVERNANCE_DENIAL_MESSAGE: Readonly<Record<GovernanceDenial, string>> = {
  // One message per reason, and neither names who DOES hold the capability:
  // a refusal that lists the grantees is a directory of whom to ask, and also
  // of whom to attack.
  GOVERNANCE_CAPABILITY_REQUIRED: "Access denied.",
  GOVERNANCE_SCOPE_MISMATCH: "Access denied.",
};

export function governanceCapability(
  gate: GovernanceGate,
  mode: GovernanceMode,
): PortalCapability {
  return `governance.${gate}.${mode}` as PortalCapability;
}

/**
 * `null` when the caller may proceed, otherwise the reason they may not.
 *
 * The owner short-circuits: §20.3 assigns the whole namespace to the owner
 * initially and A4-3 delegates outward from there, so an owner who somehow held
 * no grant row would still be the owner. Anything else is decided from the
 * capability set the server computed for this request — never from a role,
 * never from a username.
 */
export function governanceDenial(input: {
  access: EffectiveAccess;
  gate: GovernanceGate;
  mode: GovernanceMode;
  /** The workspace the request is about; `null` when it is not workspace-bound. */
  workspaceId: string | null;
}): GovernanceDenial | null {
  if (input.access.isOwner) return null;

  const capability = governanceCapability(input.gate, input.mode);
  if (!input.access.capabilities.includes(capability)) {
    return "GOVERNANCE_CAPABILITY_REQUIRED";
  }

  /*
   * Scope. A grant carrying `null` applies wherever the grantee is already a
   * member; a grant naming a workspace applies only there.
   *
   * A request that is not workspace-bound is allowed by an unscoped grant only.
   * Otherwise a grant deliberately narrowed to one workspace would silently
   * cover a Portal-wide read, which is the opposite of what narrowing it meant.
   */
  const scopes = input.access.scopes[capability] ?? [];
  if (scopes.includes(null)) return null;
  if (input.workspaceId === null) return "GOVERNANCE_SCOPE_MISMATCH";
  return scopes.includes(input.workspaceId) ? null : "GOVERNANCE_SCOPE_MISMATCH";
}

/**
 * The same decision as a boolean, for building a UI state rather than refusing.
 *
 * Used where a screen must say "you may read this but not decide it" instead of
 * throwing — the eligibility locks on a review payload, for instance. Kept next
 * to the refusal so the two can never answer differently.
 */
export function mayGovern(input: {
  access: EffectiveAccess;
  gate: GovernanceGate;
  mode: GovernanceMode;
  workspaceId: string | null;
}): boolean {
  return governanceDenial(input) === null;
}
