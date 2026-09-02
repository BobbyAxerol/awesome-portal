import { describe, expect, it } from "vitest";
import { enforceProfileLineage } from "../src/execution/profile-lineage";
import { ManagerPage } from "../src/paper-read/manager-records";

function relation(key: string, items: ManagerPage["items"]) {
  return {
    spec: { key },
    page: { asOf: "2026-09-02T00:00:00Z", freshness: "FRESH" as const,
      completeness: "COMPLETE" as const, items, nextCursor: null },
    state: items.length === 0 ? "EMPTY" as const : "AVAILABLE" as const,
    reasonCode: null,
  };
}

describe("N30 profile lineage", () => {
  it("keeps only child rows attached to accepted profile parents", () => {
    const result = enforceProfileLineage([
      relation("deployments", [{ deployment_id: "dep_live", account_id: "acc_live", strategy_id: "str_live", portfolio_id: "pf_live" }]),
      relation("accounts", [{ account_id: "acc_live", strategy_id: "str_live", external_account_ref: "broker_live" }]),
      relation("account_balances", [
        { account_id: "acc_live", currency: "USDT", total: "10" },
        { account_id: "acc_paper", currency: "USDT", total: "9000" },
      ]),
      relation("broker_sync", [
        { external_account_ref: "broker_live", status: "SYNCED" },
        { external_account_ref: "broker_paper", status: "SYNCED" },
      ]),
    ], "N30");

    expect(result.find((item) => item.spec.key === "account_balances")?.page?.items)
      .toEqual([{ account_id: "acc_live", currency: "USDT", total: "10" }]);
    expect(result.find((item) => item.spec.key === "broker_sync")?.page?.items)
      .toEqual([{ external_account_ref: "broker_live", status: "SYNCED" }]);
    expect(result.filter((item) => item.reasonCode === "N30_PROFILE_LINEAGE_REJECTED"))
      .toHaveLength(2);
  });

  it("rejects every orphan when an accepted parent relation is empty", () => {
    const result = enforceProfileLineage([
      relation("accounts", []),
      relation("account_balances", [{ account_id: "foreign", currency: "USDT", total: "1" }]),
    ], "N30");
    expect(result[1].page?.items).toEqual([]);
    expect(result[1]).toMatchObject({ state: "PARTIAL", reasonCode: "N30_PROFILE_LINEAGE_REJECTED" });
  });

  it("does not invent a parent requirement when that parent relation is outside a bounded screen", () => {
    const result = enforceProfileLineage([
      relation("fills", [{ fill_id: "fill_1", account_id: "acc_1", mode: "paper" }]),
    ], "N30");
    expect(result[0]).toMatchObject({ state: "AVAILABLE", reasonCode: null });
  });
});
