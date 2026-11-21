import { describe, expect, it } from "vitest";
import {
  NATIVE_TUPLE_A_CATALOGUE_SHA256, NATIVE_TUPLE_A_RELATION_IDS, NATIVE_TUPLE_A_RELATION_IDS_SHA256,
  nativeTupleARelationAllowed, nativeTupleARelationIdsDigest,
} from "../src/execution/native-tuple-a";
import { MANAGER_DEPLOYMENTS_CATALOGUE_SHA256 } from "../src/execution/maximum-data-operation.registry";
import { EDS11R_MANAGER_RELATION_OPERATION_REGISTRY } from "../src/execution/eds11r-manager-relation.registry";

/** Screen-bound operations whose relation tuple A carries, checked offline against Edge's installed relation catalogue
 * (sha256 c17c343c...): every field and identity field of each is a RETURNABLE column there. */
const SCREEN_BOUND_IN_TUPLE_A = ["account_balances", "account_policies", "account_reservations", "account_sync_current_state", "account_sync_effective", "account_sync_snapshots", "accounts", "broker_account_sync_current_state", "broker_account_sync_effective", "broker_account_sync_snapshots", "broker_sync_state_history", "broker_sync_valuation_current_state", "broker_sync_valuation_history", "command_journal", "conditional_order_groups", "execution_sessions", "fills", "instruments", "operator_operations", "order_brackets", "orders", "portfolio_allocations", "portfolio_capital_ledger", "portfolios", "positions_v2", "reconciliation_findings", "risk_grants", "risk_profiles", "sizing_decisions", "strategy_deployments", "venues"];

describe("native tuple A relation allowlist", () => {
  it("pins the catalogue seal and the 49 ids", () => {
    expect(NATIVE_TUPLE_A_CATALOGUE_SHA256).toBe(MANAGER_DEPLOYMENTS_CATALOGUE_SHA256);
    expect(NATIVE_TUPLE_A_CATALOGUE_SHA256.slice(7, 15)).toBe("6d4c4a65");
    expect(NATIVE_TUPLE_A_RELATION_IDS).toHaveLength(49);
    expect(new Set(NATIVE_TUPLE_A_RELATION_IDS).size).toBe(49);
    expect(nativeTupleARelationIdsDigest()).toBe(NATIVE_TUPLE_A_RELATION_IDS_SHA256);
  });
  it("allows exactly the 31 screen-bound relations tuple A carries and refuses the other 23", () => {
    const ops = Array.from(EDS11R_MANAGER_RELATION_OPERATION_REGISTRY as Iterable<{ relation: string }>);
    const allowed = ops.filter((o) => nativeTupleARelationAllowed(o.relation)).map((o) => o.relation).sort();
    expect(allowed).toEqual([...SCREEN_BOUND_IN_TUPLE_A].sort());
    expect(allowed).toHaveLength(31);
    expect(ops.length - allowed.length).toBe(23);
    expect(nativeTupleARelationAllowed("not_a_relation")).toBe(false);
  });
});
