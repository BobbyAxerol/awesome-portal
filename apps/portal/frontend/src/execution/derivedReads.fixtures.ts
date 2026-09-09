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
  data: {
    group_id: "1",
    contingency: "OCO",
    state: "WORKING",
    legs: [
      { leg_id: "leg_1", role: "TAKE_PROFIT", order_id: "ord_1", state: "WORKING" },
      { leg_id: "leg_2", role: "STOP", order_id: "ord_2", state: "WORKING" },
    ],
  },
};
