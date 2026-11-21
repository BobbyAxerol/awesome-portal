/**
 * The screen catalogue as `execution-screen-bff.v1#/$defs/CatalogueResponse` publishes it: what the fixture BFF and the
 * Playwright double answer on `GET /screen-contracts`.
 *
 * `SCREEN_CONTRACTS` (src/execution/screenContracts.fixtures.ts) is the dev capture the unit tests pin: 25 screens, and none of
 * `resource_kind`, `request_ids`, `source_authorities`, `read_capabilities`, `composition_policy`, `data_api.method|path_template|
 * response_contract`, `read_at`, `actor`, `exact_total`. The published schema allows at most 23 screens (the E3 owner inventory), so
 * the two BR-EX-72 list screens the Portal adds on top (alpha fleet list, accounts and bindings list) are not in this body. The
 * per-screen facts below are copied from apps/control-api/src/screen-bff/catalogue.ts (with the BR-EX-55, entity-names and blocker
 * additions its `screen()` helper makes), so each row is what the control-api serves for that screen.
 */
import { SCREEN_CONTRACTS } from "../src/execution/screenContracts.fixtures";

interface Published {
  kind: string;
  requests: string[];
  authorities: string[];
  capabilities: string[];
  method: string;
  path: string;
  contract: string;
}

const PUBLISHED: Record<string, Published> = {
  PAPER_TRADING_SCREEN: { kind: "WORKSPACE", requests: ["BR-EX-41","BR-EX-55"], authorities: ["TRADING_SYSTEM","DERIVED"], capabilities: ["deployments.positions","deployments.execution-quality","sessions.current","portal.entity-names"], method: "GET", path: "/api/v1/execution/screens/paper", contract: "execution.paper-overview.v1" },
  SANDBOX_TRADING_SCREEN: { kind: "WORKSPACE", requests: ["BR-EX-60","BR-EX-55"], authorities: ["TRADING_SYSTEM","PORTAL_CONTROL","DERIVED"], capabilities: ["deployments.positions","reconciliation.current","sessions.current","portal.entity-names"], method: "GET", path: "/api/v1/execution/screens/sandbox", contract: "execution.sandbox-overview.v1" },
  LIVE_OPERATIONS_SCREEN: { kind: "WORKSPACE", requests: ["BR-EX-56","BR-EX-55"], authorities: ["TRADING_SYSTEM","PORTAL_CONTROL","DERIVED"], capabilities: ["deployments.positions","accounts.current","sessions.current","portal.entity-names"], method: "GET", path: "/api/v1/execution/screens/live", contract: "execution.live-overview.v1" },
  EXECUTION_COMMAND_CENTER_SCREEN: { kind: "WORKSPACE", requests: ["BR-EX-42","BR-EX-43","BR-EX-44","BR-EX-45","BR-EX-55"], authorities: ["PORTAL_CONTROL","TRADING_SYSTEM","DERIVED"], capabilities: ["ops.alerts","ops.streams","ops.redis-retention","portal.activation","portal.entity-names"], method: "GET", path: "/api/v1/execution/command-center", contract: "execution.command-center-snapshot.v1" },
  EXECUTION_OPERATIONS_QUEUE_SCREEN: { kind: "WORKSPACE", requests: ["BR-EX-47","BR-EX-55"], authorities: ["PORTAL_CONTROL","TRADING_SYSTEM","DERIVED"], capabilities: ["portal.operations-workflow","ops.findings","ops.dead-letters","portal.entity-names"], method: "GET", path: "/api/v1/execution/operations", contract: "execution.operations-queue.v1" },
  EXECUTION_INCIDENT_DETAIL_SCREEN: { kind: "INCIDENT", requests: ["BR-EX-46","BR-EX-55"], authorities: ["PORTAL_CONTROL","TRADING_SYSTEM","DERIVED"], capabilities: ["portal.operations-workflow","ops.trace-order","ops.findings","portal.entity-names"], method: "GET", path: "/api/v1/execution/operations/incidents/{resource_id}", contract: "execution.incident-detail.v1" },
  EXECUTION_APPROVAL_INBOX_SCREEN: { kind: "WORKSPACE", requests: ["BR-EX-35","BR-EX-55"], authorities: ["PORTAL_CONTROL"], capabilities: ["portal.governance","portal.entity-names"], method: "GET", path: "/api/v1/execution/governance/approvals", contract: "governance.approval-inbox.v1" },
  EXECUTION_GATE_R1_REVIEW_SCREEN: { kind: "APPROVAL", requests: ["BR-EX-67","BR-EX-55"], authorities: ["PORTAL_CONTROL","RESEARCH","DERIVED"], capabilities: ["portal.governance","deployments.execution-quality","portal.entity-names"], method: "GET", path: "/api/v1/execution/governance/approvals/{resource_id}/r1", contract: "governance.r1-review.v1" },
  EXECUTION_GATE_R2_REVIEW_SCREEN: { kind: "APPROVAL", requests: ["BR-EX-67","BR-EX-55"], authorities: ["PORTAL_CONTROL","TRADING_SYSTEM","DERIVED"], capabilities: ["portal.governance","accounts.current","deployments.positions","portal.entity-names"], method: "GET", path: "/api/v1/execution/governance/approvals/{resource_id}/r2", contract: "governance.r2-review.v1" },
  EXECUTION_PAPER_EXIT_REVIEW_SCREEN: { kind: "REVIEW", requests: ["BR-EX-63","BR-EX-55"], authorities: ["PORTAL_CONTROL","TRADING_SYSTEM","DERIVED"], capabilities: ["portal.governance","deployments.execution-quality","reconciliation.current","portal.entity-names"], method: "GET", path: "/api/v1/execution/governance/exit-reviews/{resource_id}", contract: "governance.paper-exit-review.v1" },
  EXECUTION_PAPER_WORKBENCH_SCREEN: { kind: "DEPLOYMENT", requests: ["BR-EX-62","BR-EX-55","BR-EX-58"], authorities: ["TRADING_SYSTEM","RESEARCH","DERIVED"], capabilities: ["deployments.positions","deployments.execution-quality","orders.list","orders.fills","market.candles","portal.entity-names","portal.blocker-catalog"], method: "GET", path: "/api/v1/execution/screens/paper/{resource_id}", contract: "execution.paper-workbench.v1" },
  EXECUTION_PAPER_WORKBENCH_VNM_SCREEN: { kind: "DEPLOYMENT", requests: ["BR-EX-62","BR-EX-55","BR-EX-58"], authorities: ["TRADING_SYSTEM","RESEARCH","DERIVED"], capabilities: ["deployments.positions","deployments.execution-quality","orders.list","orders.fills","market.candles","portal.entity-names","portal.blocker-catalog"], method: "GET", path: "/api/v1/execution/screens/paper/{resource_id}/vn-market", contract: "execution.paper-workbench-vnm.v1" },
  EXECUTION_SANDBOX_CERTIFICATION_SCREEN: { kind: "DEPLOYMENT", requests: ["BR-EX-60","BR-EX-61","BR-EX-55","BR-EX-58"], authorities: ["PORTAL_CONTROL","TRADING_SYSTEM","BROKER","DERIVED"], capabilities: ["deployments.positions","reconciliation.current","accounts.current","sessions.current","portal.entity-names","portal.blocker-catalog"], method: "GET", path: "/api/v1/execution/deployments/{resource_id}/certification", contract: "execution.sandbox-certification.v1" },
  EXECUTION_CANARY_CONTROL_ROOM_SCREEN: { kind: "DEPLOYMENT", requests: ["BR-EX-59","BR-EX-55","BR-EX-58"], authorities: ["PORTAL_CONTROL","TRADING_SYSTEM","BROKER","DERIVED"], capabilities: ["portal.activation","portal.governance","deployments.positions","accounts.current","ops.alerts","portal.entity-names","portal.blocker-catalog"], method: "GET", path: "/api/v1/execution/deployments/{resource_id}/canary", contract: "execution.canary-control-room.v1" },
  EXECUTION_LIVE_FULL_OPERATIONS_SCREEN: { kind: "DEPLOYMENT", requests: ["BR-EX-57","BR-EX-55","BR-EX-58"], authorities: ["PORTAL_CONTROL","TRADING_SYSTEM","BROKER","DERIVED"], capabilities: ["deployments.positions","orders.list","orders.fills","accounts.current","reconciliation.current","market.ticks","portal.entity-names","portal.blocker-catalog"], method: "GET", path: "/api/v1/execution/deployments/{resource_id}/live", contract: "execution.live-full-operations.v1" },
  EXECUTION_FULL_BLOTTER_SCREEN: { kind: "WORKSPACE", requests: ["BR-EX-48","BR-EX-55"], authorities: ["TRADING_SYSTEM","DERIVED"], capabilities: ["orders.list","orders.fills","orders.legs","orders.trace","portal.entity-names"], method: "GET", path: "/api/v1/execution/screens/blotter", contract: "execution.full-blotter.v1" },
  EXECUTION_ALPHA_360_SCREEN: { kind: "ALPHA", requests: ["BR-EX-49","BR-EX-50","BR-EX-64","BR-EX-55"], authorities: ["TRADING_SYSTEM","RESEARCH","DERIVED"], capabilities: ["ops.alpha-activity","deployments.execution-quality","deployments.contribution","market.candles","portal.entity-names"], method: "GET", path: "/api/v1/execution/alphas/{resource_id}/query-analytics", contract: "execution.query-analytics-envelope.v1" },
  EXECUTION_PORTFOLIO_360_SCREEN: { kind: "PORTFOLIO", requests: ["BR-EX-51","BR-EX-65","BR-EX-66","BR-EX-55"], authorities: ["PORTAL_CONTROL","TRADING_SYSTEM","RESEARCH","DERIVED"], capabilities: ["deployments.contribution","portfolios.correlation-samples","deployments.positions","portal.entity-names"], method: "GET", path: "/api/v1/execution/portfolios/{resource_id}/query-analytics", contract: "execution.query-analytics-envelope.v1" },
  EXECUTION_ACCOUNT_BROKER_360_SCREEN: { kind: "ACCOUNT", requests: ["BR-EX-52","BR-EX-53","BR-EX-54","BR-EX-55"], authorities: ["PORTAL_CONTROL","TRADING_SYSTEM","BROKER","DERIVED"], capabilities: ["bindings.snapshot","bindings.exposure-verdict","accounts.current","reconciliation.current","portal.entity-names"], method: "GET", path: "/api/v1/execution/screens/accounts/{resource_id}", contract: "execution.account-broker-360.v1" },
  EXECUTION_ADMIN_ACTION_DRAWER_SCREEN: { kind: "WORKSPACE", requests: ["BR-EX-68","BR-EX-55"], authorities: ["PORTAL_CONTROL","TRADING_SYSTEM"], capabilities: ["ops.command-journal","portal.activation","portal.entity-names"], method: "GET", path: "/api/v1/execution/commands/tasks", contract: "execution.command-tasks.v1" },
  EXECUTION_NEW_APPROVAL_REQUEST_SCREEN: { kind: "WORKSPACE", requests: ["BR-EX-69","BR-EX-55"], authorities: ["PORTAL_CONTROL","RESEARCH"], capabilities: ["portal.governance","portal.entity-names"], method: "POST", path: "/api/v1/execution/governance/approvals", contract: "governance.approval-create.v1" },
  EXECUTION_GATE_LIVE_REVIEW_SCREEN: { kind: "APPROVAL", requests: ["BR-EX-70","BR-EX-55"], authorities: ["PORTAL_CONTROL","TRADING_SYSTEM","DERIVED"], capabilities: ["portal.governance","deployments.execution-quality","accounts.current","portal.entity-names"], method: "GET", path: "/api/v1/execution/governance/approvals/{resource_id}/live", contract: "governance.live-review.v1" },
  EXECUTION_WAIVERS_REGISTER_SCREEN: { kind: "WORKSPACE", requests: ["BR-EX-71","BR-EX-55"], authorities: ["PORTAL_CONTROL"], capabilities: ["portal.governance","portal.entity-names"], method: "GET", path: "/api/v1/execution/governance/waivers", contract: "governance.conditions-register.v1" },
};

const UI_STATES = ["ready", "empty", "stale", "partial", "denied", "unavailable", "error"];
const SERVER_ONLY = "SERVER_ONLY";

export const SCREEN_CONTRACTS_PUBLISHED = {
  schema_version: SCREEN_CONTRACTS.schema_version,
  record_authority: SCREEN_CONTRACTS.record_authority,
  workspace_id: SCREEN_CONTRACTS.workspace_id,
  read_at: "2026-08-31T12:00:00.000Z",
  actor: { user_id: "usr_bobby", username: "bobby", roles: ["ADMIN"] },
  exact_total: true,
  total_count: Object.keys(PUBLISHED).length,
  screens: SCREEN_CONTRACTS.screens.filter((screen) => screen.screen_id in PUBLISHED).map((screen) => {
    const extra = PUBLISHED[screen.screen_id]!;
    return {
      screen_id: screen.screen_id,
      ui_route_template: screen.ui_route_template,
      resource_kind: extra.kind,
      resource_required: screen.resource_required,
      required_roles: screen.required_roles,
      request_ids: extra.requests,
      source_authorities: extra.authorities,
      read_capabilities: extra.capabilities,
      supported_ui_states: UI_STATES,
      composition_policy: { source_join: SERVER_ONLY, verdicts: SERVER_ONLY, counts: SERVER_ONLY, filtering: SERVER_ONLY, sorting: SERVER_ONLY, sla: SERVER_ONLY, permissions: SERVER_ONLY },
      data_api: { ...screen.data_api, method: extra.method, path_template: extra.path, response_contract: extra.contract },
    };
  }),
};
