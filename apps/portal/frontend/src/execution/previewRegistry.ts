/**
 * Build-gated Execution product-route contract.
 *
 * The Feature Registry remains the authority for routes and delivery policy.
 * An unreviewed local Docker build defaults this flag to false; the protected
 * main publisher explicitly compiles the reviewed product routes. This file
 * only answers whether a screen already has a reviewed component. It grants no
 * query, projection, stream or command capability.
 */

export const EXECUTION_PREVIEW_ENABLED =
  import.meta.env.VITE_EXECUTION_PREVIEW_ENABLED === "true";

export const EXECUTION_PREVIEW_SCREEN_IDS = new Set([
  "EXECUTION_COMMAND_CENTER_SCREEN",
  "EXECUTION_OPERATIONS_QUEUE_SCREEN",
  "EXECUTION_INCIDENT_DETAIL_SCREEN",
  "EXECUTION_APPROVAL_INBOX_SCREEN",
  "EXECUTION_GATE_R1_REVIEW_SCREEN",
  "EXECUTION_GATE_R2_REVIEW_SCREEN",
  "EXECUTION_PAPER_EXIT_REVIEW_SCREEN",
  "EXECUTION_PAPER_WORKBENCH_SCREEN",
  "EXECUTION_PAPER_WORKBENCH_VNM_SCREEN",
  "EXECUTION_SANDBOX_CERTIFICATION_SCREEN",
  "EXECUTION_CANARY_CONTROL_ROOM_SCREEN",
  "EXECUTION_LIVE_FULL_OPERATIONS_SCREEN",
  "EXECUTION_FULL_BLOTTER_SCREEN",
  "EXECUTION_ALPHA_FLEET_LIST_SCREEN",
  "EXECUTION_ALPHA_360_SCREEN",
  "EXECUTION_PORTFOLIO_360_SCREEN",
  // Registry rev 9 (DEBT-UXM07-006): Compare's own route. PortalRoutes mounts it only while the `compare` flag is on.
  "EXECUTION_COMPARE_SCREEN",
  "EXECUTION_ACCOUNTS_BINDINGS_LIST_SCREEN",
  "EXECUTION_ACCOUNT_BROKER_360_SCREEN",
  "EXECUTION_ADMIN_ACTION_DRAWER_SCREEN",
  "EXECUTION_NEW_APPROVAL_REQUEST_SCREEN",
  "EXECUTION_GATE_LIVE_REVIEW_SCREEN",
  "EXECUTION_WAIVERS_REGISTER_SCREEN",
] as const);

/**
 * Revision 6 owns every reviewed route. The one extra path is an ALIAS (WP-C request, WP-D): Trade Replay is its own screen at
 * `/deployments/alphas/:alphaId?tab=replay`; the clean path below lands there (the route table in `ExecutionPreviewRoute`
 * redirects it and keeps the whole query). It claims no screen of its own, so the registry stays the one feature model.
 */
export const ALPHA_REPLAY_ALIAS_PATH = "/deployments/alphas/:alphaId/replay";
export const EXECUTION_PREVIEW_EXTRA_ROUTES: readonly { path: string; screenId: string }[] = [
  { path: ALPHA_REPLAY_ALIAS_PATH, screenId: "EXECUTION_ALPHA_360_SCREEN" },
];

/**
 * Sidebar routes whose reviewed screen has a required resource identifier.
 * The preview uses the canonical cast's fixture identifier when the feature
 * root is entered; deep links continue to use the identifier in their URL.
 */
export const EXECUTION_PREVIEW_FEATURE_DEFAULTS: Readonly<Record<string, string>> = {
  PAPER_TRADING: "EXECUTION_PAPER_WORKBENCH_SCREEN",
  SANDBOX_TRADING: "EXECUTION_SANDBOX_CERTIFICATION_SCREEN",
  LIVE_OPERATIONS: "EXECUTION_LIVE_FULL_OPERATIONS_SCREEN",
  EXECUTION_EXIT_REVIEWS: "EXECUTION_PAPER_EXIT_REVIEW_SCREEN",
  EXECUTION_PORTFOLIOS: "EXECUTION_PORTFOLIO_360_SCREEN",
  EXECUTION_ALPHA_FLEET: "EXECUTION_ALPHA_FLEET_LIST_SCREEN",
  EXECUTION_ACCOUNTS_BINDINGS: "EXECUTION_ACCOUNTS_BINDINGS_LIST_SCREEN",
  // The canonical route /deployments/blotter renders the Blotter even where no screen row of the registry matched it exactly (QA2 R4-01).
  EXECUTION_BLOTTER: "EXECUTION_FULL_BLOTTER_SCREEN",
};

export function hasExecutionPreview(screenId: string): boolean {
  return EXECUTION_PREVIEW_SCREEN_IDS.has(
    screenId as (typeof EXECUTION_PREVIEW_SCREEN_IDS extends Set<infer T> ? T : never),
  );
}
