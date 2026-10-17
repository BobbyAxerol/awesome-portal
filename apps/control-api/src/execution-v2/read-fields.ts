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
export const TECHNICAL_READ_FIELDS = ["environment", "profile_id", "component", "health", "state", "observed_at",
  "availability", "reason_code", "revision", "lag_ms", "last_error_code"] as const;
export const AUDIT_READ_FIELDS = ["event_id", "operation", "actor_user_id", "subject_user_id", "occurred_at_ms",
  "outcome", "reason_code", "revision", "receipt_id", "provenance_ref"] as const;
