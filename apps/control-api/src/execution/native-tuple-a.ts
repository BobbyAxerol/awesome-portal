import { createHash } from "node:crypto";

/**
 * Tuple A: the Manager catalogue release Edge installed on 12 Nov 2026 (M0 R2, 49 relations, 47 tables + 2 views,
 * catalogue seal below). The native-review relation path binds to THIS catalogue; the October intake pack digest
 * (0c71b72c, 96 relations) keeps governing the legacy/non-native paths and the ledgers.
 */
export const NATIVE_TUPLE_A_CATALOGUE_SHA256 =
  "sha256:6d4c4a6505c02f58d32f0be70a3a80c7073dfbd5666ce9a5490fba645c049142";

/** The 49 relation ids tuple A serves (Edge's installed relation-catalogue.json, public structure). */
export const NATIVE_TUPLE_A_RELATION_IDS: readonly string[] = Object.freeze([
  "account_balances",
  "account_equity_snapshots",
  "account_policies",
  "account_reservations",
  "account_sync_current_state",
  "account_sync_effective",
  "account_sync_snapshots",
  "accounts",
  "alpha_positions",
  "arb_order_packages",
  "audit_log",
  "binance_fills",
  "broker_account_sync_current_state",
  "broker_account_sync_effective",
  "broker_account_sync_snapshots",
  "broker_sync_raw_hot",
  "broker_sync_state_history",
  "broker_sync_valuation_current_state",
  "broker_sync_valuation_history",
  "cash_ledger",
  "command_journal",
  "conditional_order_groups",
  "copy_event_outbox",
  "copy_publish_policies",
  "domain_events",
  "engine_authority_scopes",
  "engine_shadow_comparisons",
  "execution_sessions",
  "fills",
  "funding_accruals",
  "instruments",
  "margin_ledger",
  "operator_operations",
  "order_brackets",
  "order_pending_exposure",
  "orders",
  "performance_events",
  "performance_snapshots",
  "portfolio_allocations",
  "portfolio_capital_ledger",
  "portfolios",
  "positions_v2",
  "reconciliation_findings",
  "risk_grants",
  "risk_profiles",
  "settlements",
  "sizing_decisions",
  "strategy_deployments",
  "venues",
]);

/** Pin over the sorted ids, newline separated: any drift of the list fails the unit test and review. */
export const NATIVE_TUPLE_A_RELATION_IDS_SHA256 = "sha256:7fe4aab84f9f77e4ec1e79264a59fe82b080bd3e81a3f1edd1342ca84a5f0bfa";

const allowed = new Set(NATIVE_TUPLE_A_RELATION_IDS);

/** True only for a relation that tuple A actually carries. The registry stays the single source of operations. */
export function nativeTupleARelationAllowed(relation: string): boolean {
  return allowed.has(relation);
}

export function nativeTupleARelationIdsDigest(): string {
  return "sha256:" + createHash("sha256").update([...NATIVE_TUPLE_A_RELATION_IDS].sort().join("\n")).digest("hex");
}
