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
  method: string, path: string, query: Record<string, unknown>): boolean {
  if (method !== "GET" || !config.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID ||
    query.environment !== undefined && query.environment !== "paper" ||
    query.workspace_id !== undefined && query.workspace_id !== config.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID) return false;
  if (["/api/v1/execution/manager/deployments", "/api/v1/execution/manager/operations",
    "/api/v1/execution/profiles/paper/realtime-snapshot", "/api/v1/execution/profiles/paper/stream"].includes(path)) return true;
  const match = /^\/api\/v1\/execution\/manager\/current\/([a-z][a-z0-9-]{1,127})(?![\s\S])/u.exec(path);
  return !!match && !!managerRelationOperationByRoute(match[1]!);
}
