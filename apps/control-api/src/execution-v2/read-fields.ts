/** Closed DTO vocabulary, not a role/permission preset. A reviewed researcher
 * artifact may reduce this set, never add technical/custody/credential fields.
 * Adapters still select exact nested DTO fields BEFORE computing aggregates. */
export const BUSINESS_READ_FIELDS = [
  "alpha_id", "alpha_version_id", "alpha_label", "version", "portfolio_id", "deployment_id", "account_id", "binding_id",
  "strategy_id", "instrument_id",
  "display_name", "name", "lifecycle", "state", "status", "stage", "stages", "environment", "profile_id",
  "owner", "owner_user_id", "venue", "currency", "base_currency", "health", "attention_reasons",
  "created_at", "updated_at", "as_of", "source_as_of", "observed_at", "availability", "freshness", "completeness",
  "reason_code", "coverage", "provenance_ref", "revision", "catalogue_revision",
  "quantity", "price", "notional", "allocation", "balance_total", "balance_free", "balance_locked",
  "realized_pnl", "unrealized_pnl", "net_pnl", "exposure", "equity", "drawdown", "return", "score", "regime",
  "gross_pnl", "fee_total", "funding_pnl", "margin_initial", "margin_maintenance", "exposure_long", "exposure_short",
  "risk_grant_id", "decision_id", "submitted_count", "risk_rejected_count", "broker_rejected_count", "filled_count",
  "timestamp_ms", "occurred_at_ms", "sequence", "order_id", "fill_id", "position_id", "side",
  "group_id", "leg_id", "max_capital",
  // Closed ELP2-06 vocabulary, not a researcher grant or source qualification.
  "opening_economic_capital", "initial_funds", "added_funds", "returned_capital", "net_economic_assignments", "current_nav",
  "actual_fees", "pending_fees", "funding", "interest", "initial_budget", "current_budget", "topups_applied",
  "decreases_applied", "recall_applied", "pending_amount", "cancelled_amount", "locked_amount", "exposure_cap",
] as const;
const business = new Set<string>(BUSINESS_READ_FIELDS);
export const isBusinessReadField = (field:string):boolean => business.has(field);
/** Record-detail vocabulary (BE-P15, RV-11 R-5..R-9). A SEPARATE closed list on purpose: these names are
 * NOT in BUSINESS_READ_FIELDS, so every reader that tests `scopeAllowsField` / `retainedFieldAllowed` keeps its
 * present behaviour (the money-field guards still treat `commission` as an unapproved protected value, the
 * `full-business-fields` policy revision and every scope fingerprint are byte-identical). Only the readers that
 * declare a closed output member for these names (subject records, Resource360 v2 rows, the scoped adapter) ask
 * `scopeAllowsDetailField`. Same rule as the business list: a reviewed researcher artifact may reduce the set,
 * never add custody/credential/technical fields, and an unlisted name can never be granted. */
export const RECORD_DETAIL_READ_FIELDS = [
  "submitted_at_ms", "resolved_at_ms", "client_order_id", "order_type", "commission", "commission_currency",
  "liquidity_side", "finding_id", "finding_type", "leg_role", "leg_sequence",
  // FE-050/051/052/067/072: explicit source-owned business detail only.
  // No credential bytes, external custody identifiers or inferred runtime.
  "runtime_state", "runtime_state_since", "runtime_state_changed_at",
  "execution_session_id", "started_at", "completed_at", "account_type",
  "position_side", "time_in_force", "reduce_only", "post_only",
  "filled_quantity", "average_fill_price", "trigger_price",
] as const;
const detail = new Set<string>(RECORD_DETAIL_READ_FIELDS);
export const isRecordDetailReadField = (field:string):boolean => detail.has(field);
export const TECHNICAL_READ_FIELDS = ["environment", "profile_id", "component", "health", "state", "observed_at",
  "availability", "reason_code", "revision", "lag_ms", "last_error_code"] as const;
export const AUDIT_READ_FIELDS = ["event_id", "operation", "actor_user_id", "subject_user_id", "occurred_at_ms",
  "outcome", "reason_code", "revision", "receipt_id", "provenance_ref"] as const;
