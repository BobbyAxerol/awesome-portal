/**
 * FE-066 / S3-U5 - adapter from the retained projection to the pure identity
 * composition in `deployment-identity.contract.ts`. It receives data the caller
 * already authorized; it performs no read and invents nothing.
 */
import { retainedFieldAllowed, scopedRetainedRows } from "./retained-operation-page";
import { scopeReadPopulation, type AuthorizedExecutionReadScope } from "../execution-v2/read-scope";
import type { ProjectionRelation, ProjectionScalar } from "./profile-projection.repository";
import {
  composeDeploymentIdentity, IDENTITY_NOT_READ, type AlphaMembership, type DeploymentIdentity, type PortfolioNames,
} from "./deployment-identity.contract";

export * from "./deployment-identity.contract";

/**
 * Adapter over the retained projection. `scope` is the deployment's own
 * authorized read scope; `undefined` or LEGACY_COMPATIBILITY means the old
 * workspace-membership regime, which publishes no qualified alpha membership.
 */
export function deploymentIdentityFromRetained(input: {
  readonly scope: AuthorizedExecutionReadScope | undefined;
  readonly deploymentId: string;
  readonly deploymentFields: Readonly<Record<string, ProjectionScalar>>;
  readonly portfolios: ProjectionRelation | undefined;
}): DeploymentIdentity {
  const { scope, deploymentId } = input;
  const portfolioId = typeof input.deploymentFields.portfolio_id === "string" && input.deploymentFields.portfolio_id !== ""
    ? input.deploymentFields.portfolio_id : null;
  let membership: AlphaMembership = { kind: "UNQUALIFIED" };
  if (scope?.mode === "SCOPED_V2") {
    const tuples = scopeReadPopulation(scope).allowedTuples.filter(tuple => tuple.deployment_id === deploymentId);
    membership = { kind: "QUALIFIED", alphaIds: tuples.map(tuple => tuple.alpha_id),
      alphaIdAllowed: retainedFieldAllowed(scope, "alpha_id") };
  }
  const relation = input.portfolios;
  const names: PortfolioNames = relation && relation.availability === "AVAILABLE" && Array.isArray(relation.items)
    ? { kind: "ROWS", nameAllowed: scope === undefined || retainedFieldAllowed(scope, "name") && retainedFieldAllowed(scope, "portfolio_id"),
      rows: scopedRetainedRows(scope, relation.items).map(row => row.fields),
      hiddenMatch: portfolioId !== null && relation.items.some(row => row.fields.portfolio_id === portfolioId) }
    : { kind: "UNAVAILABLE" };
  return composeDeploymentIdentity({ portfolioId, membership, portfolios: names,
    portfolioIdAllowed: scope === undefined || retainedFieldAllowed(scope, "portfolio_id") });
}

// The profile snapshot object is composed once and passed by reference to the
// stage composers. The identity rides beside it, not inside it, so the strict
// `current_source` schema and its browser-safe copy are untouched.
const attached = new WeakMap<object, DeploymentIdentity>();
export function attachDeploymentIdentity<T extends object>(target: T, identity: DeploymentIdentity): T {
  attached.set(target, identity);
  return target;
}
export function deploymentIdentityOf(source: object | null | undefined): DeploymentIdentity {
  return (source && attached.get(source)) || IDENTITY_NOT_READ;
}
