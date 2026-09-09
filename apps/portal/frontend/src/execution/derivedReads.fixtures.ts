/**
 * Phase 4 fixtures, copied from what dev answered on 2026-09-09 — including
 * the empty ones. An invented row here would make a screen look finished on a
 * source that has published nothing.
 */
export const SOURCE_HEALTH_READ = {
  schema_version: "execution.derivation.source-health.v1",
  logical_operation_id: "executionSourceHealthV1",
  record_authority: "PORTAL_CONTROL",
  state: "PARTIAL",
  read_at: "2026-09-09T11:43:12.139Z",
  profiles: [
    {
      environment: "paper", profile_id: "PAPER_BINANCE_USDM", state: "PARTIAL", reason_code: null,
      availability: "AVAILABLE", freshness: "AGING", completeness: "PARTIAL", as_of: "2026-09-09T11:42:41.702Z",
    },
    {
      environment: "sandbox", profile_id: "SANDBOX_BINANCE_USDM", state: "PARTIAL", reason_code: null,
      availability: "AVAILABLE", freshness: "AGING", completeness: "PARTIAL", as_of: "2026-09-09T11:42:57.285Z",
    },
    {
      environment: "live", profile_id: "LIVE_BINANCE_USDM", state: "PARTIAL", reason_code: null,
      availability: "AVAILABLE", freshness: "AGING", completeness: "PARTIAL", as_of: "2026-09-09T11:43:00.757Z",
    },
  ],
};

/** Dev has taken no governance decision yet: zero rows, and the screen says so. */
export const APPROVAL_HISTORY = {
  schema_version: "governance.approval-history.v1",
  record_authority: "PORTAL",
  delivery_profile: "fixture",
  read_at: "2026-09-09T15:12:52.846Z",
  page: {
    rows: [],
    total_count: 0,
    filtered_count: 0,
    next_cursor: null,
    prev_cursor: null,
    has_more: false,
    has_previous: false,
  },
};

export const CONDITIONAL_GROUP = {
  schema_version: "execution.derivation.conditional-legs.v1",
  logical_operation_id: "executionConditionalLegsV1",
  record_authority: "PORTAL_CONTROL",
  state: "AVAILABLE",
  reason_code: null,
  source_side_effect_requested: false,
  data: {
    group_id: "1",
    group: { contingency: "OCO", state: "WORKING" },
    current_structure_only: true,
    legs: [
      { leg_id: "leg_1", role: "TAKE_PROFIT", order_id: "ord_1", state: "WORKING" },
      { leg_id: "leg_2", role: "STOP", order_id: "ord_2", state: "WORKING" },
    ],
  },
};

/**
 * What dev actually answers today: the relation holds no conditional group, so
 * the envelope says EMPTY and names the reason. The panel must show this as
 * "the source published no such group", never as a group that exists and has
 * no legs.
 */
export const CONDITIONAL_GROUP_EMPTY = {
  schema_version: "execution.derivation.conditional-legs.v1",
  logical_operation_id: "executionConditionalLegsV1",
  record_authority: "PORTAL_CONTROL",
  source_authority: "TRADING_SYSTEM",
  environment: "paper",
  state: "EMPTY",
  reason_code: "EDS05_CONDITIONAL_GROUP_NOT_FOUND",
  source_side_effect_requested: false,
  data: { group_id: "1", group: null, legs: [], current_structure_only: true },
};

/** The canonical published activation fixture (packages/contracts/fixtures). */
export const ACTIVATION_CAPABILITIES = {
  "schema_version": "execution.staged-activation-capabilities.v1",
  "record_authority": "PORTAL",
  "delivery_profile": "fixture",
  "source_integration_state": "DARK",
  "runtime_activation_requested": false,
  "source_side_effect_requested": false,
  "owner_artifact_imported": false,
  "read_at": "2026-08-26T15:00:00.000Z",
  "actor": {
    "user_id": "usr_n13a",
    "username": "bobby",
    "roles": [
      "ADMIN"
    ]
  },
  "capabilities": [
    {
      "capability_key": "PROJECTION",
      "effective_profile": "fixture",
      "desired_profile": "fixture",
      "capability_version": 1,
      "source_enabled": false,
      "runtime_enabled": false,
      "kill_switch_engaged": true,
      "last_plan_id": null,
      "updated_at": null
    },
    {
      "capability_key": "QUERY",
      "effective_profile": "fixture",
      "desired_profile": "fixture",
      "capability_version": 1,
      "source_enabled": false,
      "runtime_enabled": false,
      "kill_switch_engaged": true,
      "last_plan_id": null,
      "updated_at": null
    },
    {
      "capability_key": "SSE",
      "effective_profile": "fixture",
      "desired_profile": "fixture",
      "capability_version": 1,
      "source_enabled": false,
      "runtime_enabled": false,
      "kill_switch_engaged": true,
      "last_plan_id": null,
      "updated_at": null
    },
    {
      "capability_key": "COMMAND_R1",
      "effective_profile": "fixture",
      "desired_profile": "fixture",
      "capability_version": 1,
      "source_enabled": false,
      "runtime_enabled": false,
      "kill_switch_engaged": true,
      "last_plan_id": null,
      "updated_at": null
    },
    {
      "capability_key": "COMMAND_R2",
      "effective_profile": "fixture",
      "desired_profile": "fixture",
      "capability_version": 1,
      "source_enabled": false,
      "runtime_enabled": false,
      "kill_switch_engaged": true,
      "last_plan_id": null,
      "updated_at": null
    },
    {
      "capability_key": "COMMAND_R3",
      "effective_profile": "fixture",
      "desired_profile": "fixture",
      "capability_version": 1,
      "source_enabled": false,
      "runtime_enabled": false,
      "kill_switch_engaged": true,
      "last_plan_id": null,
      "updated_at": null
    },
    {
      "capability_key": "COMMAND_R4",
      "effective_profile": "fixture",
      "desired_profile": "fixture",
      "capability_version": 1,
      "source_enabled": false,
      "runtime_enabled": false,
      "kill_switch_engaged": true,
      "last_plan_id": null,
      "updated_at": null
    }
  ]
};
