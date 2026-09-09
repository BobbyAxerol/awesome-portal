/**
 * The screen catalogue, copied from what dev answers (2026-09-09): 25 screens,
 * every one of them AVAILABLE. The parity test reads it, and the second
 * fixture below is the one case dev cannot show — a screen the server declares
 * it does not serve.
 */
export const SCREEN_CONTRACTS = {
  "schema_version": "execution.screen-bff-catalogue.v1",
  "record_authority": "PORTAL_CONTROL",
  "workspace_id": "ws_fixture",
  "total_count": 25,
  "screens": [
    {
      "screen_id": "PAPER_TRADING_SCREEN",
      "ui_route_template": "/deployments/paper",
      "resource_required": false,
      "required_roles": [
        "ADMIN",
        "USER"
      ],
      "supported_ui_states": [
        "ready",
        "empty",
        "stale",
        "partial",
        "denied",
        "unavailable",
        "error"
      ],
      "data_api": {
        "status": "AVAILABLE",
        "operation_id": "executionPaperOverviewV1",
        "unavailable_reason": null,
        "delivery_phase": "N22"
      }
    },
    {
      "screen_id": "SANDBOX_TRADING_SCREEN",
      "ui_route_template": "/deployments/sandbox",
      "resource_required": false,
      "required_roles": [
        "ADMIN",
        "USER"
      ],
      "supported_ui_states": [
        "ready",
        "empty",
        "stale",
        "partial",
        "denied",
        "unavailable",
        "error"
      ],
      "data_api": {
        "status": "AVAILABLE",
        "operation_id": "executionSandboxOverviewV1",
        "unavailable_reason": null,
        "delivery_phase": "N23"
      }
    },
    {
      "screen_id": "LIVE_OPERATIONS_SCREEN",
      "ui_route_template": "/deployments/live",
      "resource_required": false,
      "required_roles": [
        "ADMIN",
        "USER"
      ],
      "supported_ui_states": [
        "ready",
        "empty",
        "stale",
        "partial",
        "denied",
        "unavailable",
        "error"
      ],
      "data_api": {
        "status": "AVAILABLE",
        "operation_id": "executionLiveOverviewV1",
        "unavailable_reason": null,
        "delivery_phase": "N23"
      }
    },
    {
      "screen_id": "EXECUTION_COMMAND_CENTER_SCREEN",
      "ui_route_template": "/execution",
      "resource_required": false,
      "required_roles": [
        "ADMIN",
        "USER"
      ],
      "supported_ui_states": [
        "ready",
        "empty",
        "stale",
        "partial",
        "denied",
        "unavailable",
        "error"
      ],
      "data_api": {
        "status": "AVAILABLE",
        "operation_id": "executionCommandCenterSnapshot",
        "unavailable_reason": null,
        "delivery_phase": "PRE-IAM-03"
      }
    },
    {
      "screen_id": "EXECUTION_OPERATIONS_QUEUE_SCREEN",
      "ui_route_template": "/execution/operations",
      "resource_required": false,
      "required_roles": [
        "ADMIN",
        "USER"
      ],
      "supported_ui_states": [
        "ready",
        "empty",
        "stale",
        "partial",
        "denied",
        "unavailable",
        "error"
      ],
      "data_api": {
        "status": "AVAILABLE",
        "operation_id": "executionOperationsQueue",
        "unavailable_reason": null,
        "delivery_phase": "EX-BE-05b"
      }
    },
    {
      "screen_id": "EXECUTION_INCIDENT_DETAIL_SCREEN",
      "ui_route_template": "/execution/operations/incidents/:incidentId",
      "resource_required": true,
      "required_roles": [
        "ADMIN",
        "USER"
      ],
      "supported_ui_states": [
        "ready",
        "empty",
        "stale",
        "partial",
        "denied",
        "unavailable",
        "error"
      ],
      "data_api": {
        "status": "AVAILABLE",
        "operation_id": "executionIncidentDetail",
        "unavailable_reason": null,
        "delivery_phase": "EX-BE-05b-F2"
      }
    },
    {
      "screen_id": "EXECUTION_APPROVAL_INBOX_SCREEN",
      "ui_route_template": "/governance/approvals",
      "resource_required": false,
      "required_roles": [
        "ADMIN",
        "USER"
      ],
      "supported_ui_states": [
        "ready",
        "empty",
        "stale",
        "partial",
        "denied",
        "unavailable",
        "error"
      ],
      "data_api": {
        "status": "AVAILABLE",
        "operation_id": "executionApprovalInbox",
        "unavailable_reason": null,
        "delivery_phase": "EX-BE-05a"
      }
    },
    {
      "screen_id": "EXECUTION_GATE_R1_REVIEW_SCREEN",
      "ui_route_template": "/governance/approvals/:approvalId/r1",
      "resource_required": true,
      "required_roles": [
        "ADMIN",
        "USER"
      ],
      "supported_ui_states": [
        "ready",
        "empty",
        "stale",
        "partial",
        "denied",
        "unavailable",
        "error"
      ],
      "data_api": {
        "status": "AVAILABLE",
        "operation_id": "executionGateR1Review",
        "unavailable_reason": null,
        "delivery_phase": "EX-BE-05a"
      }
    },
    {
      "screen_id": "EXECUTION_GATE_R2_REVIEW_SCREEN",
      "ui_route_template": "/governance/approvals/:approvalId/r2",
      "resource_required": true,
      "required_roles": [
        "ADMIN",
        "USER"
      ],
      "supported_ui_states": [
        "ready",
        "empty",
        "stale",
        "partial",
        "denied",
        "unavailable",
        "error"
      ],
      "data_api": {
        "status": "AVAILABLE",
        "operation_id": "executionGateR2Review",
        "unavailable_reason": null,
        "delivery_phase": "EX-BE-05b"
      }
    },
    {
      "screen_id": "EXECUTION_PAPER_EXIT_REVIEW_SCREEN",
      "ui_route_template": "/governance/exit-reviews/:reviewId",
      "resource_required": true,
      "required_roles": [
        "ADMIN",
        "USER"
      ],
      "supported_ui_states": [
        "ready",
        "empty",
        "stale",
        "partial",
        "denied",
        "unavailable",
        "error"
      ],
      "data_api": {
        "status": "AVAILABLE",
        "operation_id": "executionPaperExitReview",
        "unavailable_reason": null,
        "delivery_phase": "PRE-IAM-02"
      }
    },
    {
      "screen_id": "EXECUTION_PAPER_WORKBENCH_SCREEN",
      "ui_route_template": "/deployments/paper/:deploymentId",
      "resource_required": true,
      "required_roles": [
        "ADMIN",
        "USER"
      ],
      "supported_ui_states": [
        "ready",
        "empty",
        "stale",
        "partial",
        "denied",
        "unavailable",
        "error"
      ],
      "data_api": {
        "status": "AVAILABLE",
        "operation_id": "executionPaperWorkbenchV1",
        "unavailable_reason": null,
        "delivery_phase": "N22"
      }
    },
    {
      "screen_id": "EXECUTION_PAPER_WORKBENCH_VNM_SCREEN",
      "ui_route_template": "/deployments/paper/:deploymentId/vn-market",
      "resource_required": true,
      "required_roles": [
        "ADMIN",
        "USER"
      ],
      "supported_ui_states": [
        "ready",
        "empty",
        "stale",
        "partial",
        "denied",
        "unavailable",
        "error"
      ],
      "data_api": {
        "status": "AVAILABLE",
        "operation_id": "executionPaperWorkbenchVnmV1",
        "unavailable_reason": null,
        "delivery_phase": "N22"
      }
    },
    {
      "screen_id": "EXECUTION_SANDBOX_CERTIFICATION_SCREEN",
      "ui_route_template": "/deployments/sandbox/:deploymentId",
      "resource_required": true,
      "required_roles": [
        "ADMIN",
        "USER"
      ],
      "supported_ui_states": [
        "ready",
        "empty",
        "stale",
        "partial",
        "denied",
        "unavailable",
        "error"
      ],
      "data_api": {
        "status": "AVAILABLE",
        "operation_id": "executionSandboxCertification",
        "unavailable_reason": null,
        "delivery_phase": "N23"
      }
    },
    {
      "screen_id": "EXECUTION_CANARY_CONTROL_ROOM_SCREEN",
      "ui_route_template": "/deployments/live/:deploymentId/canary",
      "resource_required": true,
      "required_roles": [
        "ADMIN",
        "USER"
      ],
      "supported_ui_states": [
        "ready",
        "empty",
        "stale",
        "partial",
        "denied",
        "unavailable",
        "error"
      ],
      "data_api": {
        "status": "AVAILABLE",
        "operation_id": "executionCanaryControlRoom",
        "unavailable_reason": null,
        "delivery_phase": "N23"
      }
    },
    {
      "screen_id": "EXECUTION_LIVE_FULL_OPERATIONS_SCREEN",
      "ui_route_template": "/deployments/live/:deploymentId",
      "resource_required": true,
      "required_roles": [
        "ADMIN",
        "USER"
      ],
      "supported_ui_states": [
        "ready",
        "empty",
        "stale",
        "partial",
        "denied",
        "unavailable",
        "error"
      ],
      "data_api": {
        "status": "AVAILABLE",
        "operation_id": "executionLiveFullOperations",
        "unavailable_reason": null,
        "delivery_phase": "N23"
      }
    },
    {
      "screen_id": "EXECUTION_FULL_BLOTTER_SCREEN",
      "ui_route_template": "/deployments/blotter",
      "resource_required": false,
      "required_roles": [
        "ADMIN",
        "USER"
      ],
      "supported_ui_states": [
        "ready",
        "empty",
        "stale",
        "partial",
        "denied",
        "unavailable",
        "error"
      ],
      "data_api": {
        "status": "AVAILABLE",
        "operation_id": "executionFullBlotterV1",
        "unavailable_reason": null,
        "delivery_phase": "N22"
      }
    },
    {
      "screen_id": "EXECUTION_ALPHA_FLEET_LIST_SCREEN",
      "ui_route_template": "/deployments/alphas",
      "resource_required": false,
      "required_roles": [
        "ADMIN",
        "USER"
      ],
      "supported_ui_states": [
        "ready",
        "empty",
        "stale",
        "partial",
        "denied",
        "unavailable",
        "error"
      ],
      "data_api": {
        "status": "AVAILABLE",
        "operation_id": "executionAlphaFleetListV2",
        "unavailable_reason": null,
        "delivery_phase": "N29"
      }
    },
    {
      "screen_id": "EXECUTION_ALPHA_360_SCREEN",
      "ui_route_template": "/deployments/alphas/:alphaId",
      "resource_required": true,
      "required_roles": [
        "ADMIN",
        "USER"
      ],
      "supported_ui_states": [
        "ready",
        "empty",
        "stale",
        "partial",
        "denied",
        "unavailable",
        "error"
      ],
      "data_api": {
        "status": "AVAILABLE",
        "operation_id": "executionAlphaQueryAnalyticsV1",
        "unavailable_reason": null,
        "delivery_phase": "N25"
      }
    },
    {
      "screen_id": "EXECUTION_PORTFOLIO_360_SCREEN",
      "ui_route_template": "/deployments/portfolios/:portfolioId",
      "resource_required": true,
      "required_roles": [
        "ADMIN",
        "USER"
      ],
      "supported_ui_states": [
        "ready",
        "empty",
        "stale",
        "partial",
        "denied",
        "unavailable",
        "error"
      ],
      "data_api": {
        "status": "AVAILABLE",
        "operation_id": "executionPortfolioQueryAnalyticsV1",
        "unavailable_reason": null,
        "delivery_phase": "N25"
      }
    },
    {
      "screen_id": "EXECUTION_ACCOUNTS_BINDINGS_LIST_SCREEN",
      "ui_route_template": "/deployments/accounts",
      "resource_required": false,
      "required_roles": [
        "ADMIN",
        "USER"
      ],
      "supported_ui_states": [
        "ready",
        "empty",
        "stale",
        "partial",
        "denied",
        "unavailable",
        "error"
      ],
      "data_api": {
        "status": "AVAILABLE",
        "operation_id": "executionBindingsListV1",
        "unavailable_reason": null,
        "delivery_phase": "N29"
      }
    },
    {
      "screen_id": "EXECUTION_ACCOUNT_BROKER_360_SCREEN",
      "ui_route_template": "/deployments/accounts/:accountId",
      "resource_required": true,
      "required_roles": [
        "ADMIN",
        "USER"
      ],
      "supported_ui_states": [
        "ready",
        "empty",
        "stale",
        "partial",
        "denied",
        "unavailable",
        "error"
      ],
      "data_api": {
        "status": "AVAILABLE",
        "operation_id": "executionAccountBroker360V1",
        "unavailable_reason": null,
        "delivery_phase": "PHASE_2"
      }
    },
    {
      "screen_id": "EXECUTION_ADMIN_ACTION_DRAWER_SCREEN",
      "ui_route_template": "/administration/actions",
      "resource_required": false,
      "required_roles": [
        "ADMIN"
      ],
      "supported_ui_states": [
        "ready",
        "empty",
        "stale",
        "partial",
        "denied",
        "unavailable",
        "error"
      ],
      "data_api": {
        "status": "AVAILABLE",
        "operation_id": "executionOperatorTaskCatalogue",
        "unavailable_reason": null,
        "delivery_phase": "N27"
      }
    },
    {
      "screen_id": "EXECUTION_NEW_APPROVAL_REQUEST_SCREEN",
      "ui_route_template": "/governance/approvals/new",
      "resource_required": false,
      "required_roles": [
        "ADMIN",
        "USER"
      ],
      "supported_ui_states": [
        "ready",
        "empty",
        "stale",
        "partial",
        "denied",
        "unavailable",
        "error"
      ],
      "data_api": {
        "status": "AVAILABLE",
        "operation_id": "executionNewApprovalRequestV1",
        "unavailable_reason": null,
        "delivery_phase": "N29"
      }
    },
    {
      "screen_id": "EXECUTION_GATE_LIVE_REVIEW_SCREEN",
      "ui_route_template": "/governance/approvals/:approvalId/live",
      "resource_required": true,
      "required_roles": [
        "ADMIN",
        "USER"
      ],
      "supported_ui_states": [
        "ready",
        "empty",
        "stale",
        "partial",
        "denied",
        "unavailable",
        "error"
      ],
      "data_api": {
        "status": "AVAILABLE",
        "operation_id": "executionGateLiveReviewV1",
        "unavailable_reason": null,
        "delivery_phase": "N23"
      }
    },
    {
      "screen_id": "EXECUTION_WAIVERS_REGISTER_SCREEN",
      "ui_route_template": "/governance/waivers",
      "resource_required": false,
      "required_roles": [
        "ADMIN",
        "USER"
      ],
      "supported_ui_states": [
        "ready",
        "empty",
        "stale",
        "partial",
        "denied",
        "unavailable",
        "error"
      ],
      "data_api": {
        "status": "AVAILABLE",
        "operation_id": "executionWaiversRegisterV1",
        "unavailable_reason": null,
        "delivery_phase": "N29"
      }
    }
  ]
};

/** Canonical `TYPED_UNAVAILABLE` shape (packages/contracts/fixtures/execution-screen-bff.unavailable.valid.json). */
export const SCREEN_CONTRACT_UNAVAILABLE = {
  "schema_version": "execution.screen-bff-contract.v1",
  "record_authority": "PORTAL_CONTROL",
  "workspace_id": "ws_fixture",
  "screen": {
    "screen_id": "EXECUTION_ACCOUNT_BROKER_360_SCREEN",
    "ui_route_template": "/deployments/accounts/:accountId",
    "resource_required": true,
    "required_roles": [
      "ADMIN",
      "USER"
    ],
    "supported_ui_states": [
      "ready",
      "empty",
      "stale",
      "partial",
      "denied",
      "unavailable",
      "error"
    ],
    "data_api": {
      "status": "TYPED_UNAVAILABLE",
      "operation_id": "executionAccountBroker360V1",
      "unavailable_reason": "N28_FULL_EXPOSURE_POPULATION_NOT_PUBLISHED",
      "delivery_phase": "N28"
    }
  }
};
