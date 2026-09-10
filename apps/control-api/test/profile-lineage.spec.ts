import { describe, expect, it } from "vitest";
import { enforceProfileLineage } from "../src/execution/profile-lineage";
import { ManagerPage } from "../src/paper-read/manager-records";

function relation(
  key: string, items: ManagerPage["items"],
  completeness: ManagerPage["completeness"] = "COMPLETE",
) {
  return {
    spec: { key },
    page: { asOf: "2026-09-02T00:00:00Z", freshness: "FRESH" as const,
      completeness, items, nextCursor: null },
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
    // PHASE 5 (round 2): both parents came back COMPLETE, so the rows that
    // went are rows that were never in this profile. That is the filter
    // working. Marking it PARTIAL said data had gone missing, and because
    // `account_balances` loses rows in EVERY profile by construction, it made
    // COMPLETE unreachable for the whole snapshot, permanently.
    expect(result.filter((item) => item.reasonCode === "N30_PROFILE_LINEAGE_REJECTED"))
      .toHaveLength(0);
    expect(result.find((item) => item.spec.key === "account_balances")?.page?.completeness)
      .toBe("COMPLETE");
    expect(result.find((item) => item.spec.key === "account_balances")?.lineageScopedOut)
      .toEqual({ account: 1 });
  });

  it("calls it incompleteness when the parent page itself was cut short", () => {
    // The accounts page is PARTIAL, so an account we have not seen may exist
    // and the orphan is genuinely unaccounted for — not proven foreign.
    const result = enforceProfileLineage([
      relation("accounts", [{ account_id: "acc_live" }], "PARTIAL"),
      relation("account_balances", [
        { account_id: "acc_live", currency: "USDT", total: "10" },
        { account_id: "acc_unseen", currency: "USDT", total: "1" },
      ]),
    ], "N30");
    const balances = result.find((item) => item.spec.key === "account_balances");
    expect(balances).toMatchObject({ state: "PARTIAL", reasonCode: "N30_PROFILE_LINEAGE_REJECTED" });
    expect(balances?.page?.completeness).toBe("PARTIAL");
    expect(balances?.lineageRejects).toEqual({ account: 1 });
    expect(balances?.lineageScopedOut).toBeUndefined();
  });

  it("drops every orphan when a COMPLETE parent relation is empty, and calls the result empty", () => {
    // This is Live on dev: no accounts at all, and 85 balance rows arriving
    // anyway because the source cannot scope that relation. Zero balances is
    // the truth about Live, and it is EMPTY — not PARTIAL, which would claim
    // we failed to fetch something.
    const result = enforceProfileLineage([
      relation("accounts", []),
      relation("account_balances", [{ account_id: "foreign", currency: "USDT", total: "1" }]),
    ], "N30");
    expect(result[1].page?.items).toEqual([]);
    expect(result[1]).toMatchObject({ state: "EMPTY", reasonCode: null });
    expect(result[1].page?.completeness).toBe("COMPLETE");
    expect(result[1].lineageScopedOut).toEqual({ account: 1 });
  });

  it("does not invent a parent requirement when that parent relation is outside a bounded screen", () => {
    const result = enforceProfileLineage([
      relation("fills", [{ fill_id: "fill_1", account_id: "acc_1", mode: "paper" }]),
    ], "N30");
    expect(result[0]).toMatchObject({ state: "AVAILABLE", reasonCode: null });
  });
});
