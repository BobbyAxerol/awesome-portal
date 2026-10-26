import { managerRelationOperationByRoute } from "./eds11r-manager-relation.registry";

/** Explicit, local Research commissioning. Not a production authority or a
 * synonym for retained review. The ordinary deployment default is unchanged. */
export function nativeResearchReview(config?: {EXECUTION_READ_PROFILE?: string}): boolean {
  return config?.EXECUTION_READ_PROFILE === "native_manager_review_v1";
}

/** Closed native consumer surface. Disabling the old ingestion worker must
 * not accidentally expose its uncoordinated fallback readers or mutations.
 * This is a routing ceiling, NOT a grant: current Core and PM still authorize
 * the exact actor/workspace/Paper domain at the physical delivery boundary. */
export function nativeResearchReadAllowed(config: {EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID?: string},
  method: string, path: string, query: Record<string, unknown>, nativeCurrentAccount=false, commandStatus=false): boolean {
  if (!config.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID ||
    query.environment !== undefined && query.environment !== "paper" ||
    query.workspace_id !== undefined && query.workspace_id !== config.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID) return false;
  // STATUS reconciliation is an authenticated lookup of an EXISTING original,
  // not command submit/preview. Controller still requires CSRF/idempotency.
  if(commandStatus&&((method==="GET"&&/^\/api\/v1\/execution\/capital-commands\/ecm_[a-f0-9]{32}(?:\/workflow)?$(?![\s\S])/u.test(path))||
    (method==="POST"&&/^\/api\/v1\/execution\/capital-commands\/ecm_[a-f0-9]{32}\/reconcile$(?![\s\S])/u.test(path))))return true;
  if(method!=="GET")return false;
  // Private provider presence widens only these named finite Paper routes. It is not
  // a public flag or a grant; the provider still fences the physical send.
  if(nativeCurrentAccount&&(/^\/api\/v1\/execution\/manager\/(?:accounts|alphas|portfolios|deployments)\/[A-Za-z0-9][A-Za-z0-9._:-]{0,255}\/overview$(?![\s\S])/u.test(path)||
    ["/api/v1/execution/manager/fund-overview","/api/v1/execution/manager/fleet",
      "/api/v1/execution/manager/series"].includes(path)))return true;
  if (["/api/v1/execution/manager/deployments", "/api/v1/execution/manager/operations",
    "/api/v1/execution/profiles/paper/realtime-snapshot", "/api/v1/execution/profiles/paper/stream"].includes(path)) return true;
  const match = /^\/api\/v1\/execution\/manager\/current\/([a-z][a-z0-9-]{1,127})(?![\s\S])/u.exec(path);
  return !!match && !!managerRelationOperationByRoute(match[1]!);
}
