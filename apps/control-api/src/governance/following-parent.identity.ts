/**
 * BE-P12 - opt-in `identity` for the SCOPED_V2 Sandbox / Canary parent reads.
 *
 * The sealed parent body (`portal.execution.following-parent.v2`) is a PORTAL record read
 * under audit-anchor + parent-field-purpose authority and says so
 * (`accepted_manager_facts: PARENT_ROOT_NOT_SOURCE_SCREEN_COMPOSITION`). Identity is NOT a
 * field of that record: it comes from the retained projection under the viewer's own
 * alpha.read row and field policy. So it is not folded into a parent seal (that would change
 * a sealed field-set digest) and it is not computed inside the parent flight. It is attached
 * afterwards, only when asked for, from its own fenced read, and parsed through the same
 * closed contract.
 */
import { identityFields, type DeploymentIdentity } from "../execution/deployment-identity";
import { SCOPED_IDENTITY_BASIS } from "../execution/scoped-stage-wire.contract";
import { ExecutionReadScopeError } from "../execution-v2/read-scope";
import { followingParentRead, type FollowingParentRead } from "./following-parent.contract";

/** One fixed token (`identity`). Anything else is refused before any read, never ignored. */
export function parseFollowingInclude(raw: unknown): ReadonlySet<"identity"> {
  if (raw === undefined) return new Set();
  if (raw !== "identity") throw new ExecutionReadScopeError("EXECUTION_READ_QUERY_INVALID", 400);
  return new Set(["identity"] as const);
}

export function attachFollowingIdentity(parent: FollowingParentRead, identity: DeploymentIdentity): FollowingParentRead {
  return followingParentRead.parse({ ...parent, identity: { basis: SCOPED_IDENTITY_BASIS, ...identityFields(identity) } });
}
