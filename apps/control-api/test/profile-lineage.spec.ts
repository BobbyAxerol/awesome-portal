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

  it("keeps venue_accounts rows when no account carries a broker reference (OKX paper)", () => {
    const result = enforceProfileLineage([
      relation("accounts", [{ account_id: "acc_okx", external_account_ref: null }]),
      relation("venue_accounts", [
        { venue_account_id: "va_1", account_id: "acc_okx", external_account_ref: "okx_ref_1" },
        { venue_account_id: "va_2", account_id: "acc_other", external_account_ref: "okx_ref_2" },
      ]),
    ], "N22");
    const venue = result.find((item) => item.spec.key === "venue_accounts");
    // ownership is still proved by account_id: the foreign account's row goes, ours stays
    expect(venue?.page?.items.map((row) => row.venue_account_id)).toEqual(["va_1"]);
    expect(venue?.lineageScopedOut).toEqual({ account: 1 });
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

  it.each(["continuation", "previous page", "partial scope", "partial state", "unavailable parent"] as const)(
    "does not claim an unseen parent is foreign when the parent has %s", (variant) => {
      const account = relation("accounts", [{ account_id: "acc_seen" }]);
      const parent = variant === "unavailable parent"
        ? { ...account, page: null, state: "UNAVAILABLE" as const, reasonCode: "SOURCE_UNAVAILABLE" }
        : { ...account, ...(variant === "partial state" ? { state: "PARTIAL" as const } : {}), page: { ...account.page,
          nextCursor: variant === "continuation" ? "another-page" : null,
          previousCursor: variant === "previous page" ? "previous-page" : null,
          scope: variant === "partial scope" ? { state: "PARTIAL" as const, reasonCode: "SCOPE_INCOMPLETE" } : null,
        } };
      const result = enforceProfileLineage([
        parent,
        relation("account_balances", [{ account_id: "acc_unseen", currency: "USDT", total: "1" }]),
      ], "N30");
      expect(result[1]).toMatchObject({ state: "PARTIAL", reasonCode: "N30_PROFILE_LINEAGE_REJECTED",
        lineageRejects: { account: 1 }, page: { completeness: "PARTIAL", items: [] } });
      expect(result[1].lineageScopedOut).toBeUndefined();
    },
  );

  it("retains a bracket leg when its unique parent census is complete", () => {
    const result = enforceProfileLineage([
      relation("brackets", [{ bracket_group_id: "br_1" }]),
      relation("bracket_legs", [{ bracket_group_id: "br_1", leg_id: "leg_1" }]),
    ], "N30");
    expect(result[1]).toMatchObject({ state: "AVAILABLE", reasonCode: null,
      page: { completeness: "COMPLETE", items: [{ bracket_group_id: "br_1", leg_id: "leg_1" }] } });
  });

  it("does not promote a partial child to EMPTY after filtering a proven foreign row", () => {
    const child = relation("account_balances", [{ account_id: "foreign", total: "1" }], "PARTIAL");
    const result = enforceProfileLineage([
      relation("accounts", [{ account_id: "acc_live" }]),
      { ...child, state: "PARTIAL" as const, reasonCode: "SOURCE_PARTIAL" },
    ], "N30");
    expect(result[1]).toMatchObject({ state: "PARTIAL", reasonCode: "SOURCE_PARTIAL",
      lineageScopedOut: { account: 1 }, page: { completeness: "PARTIAL", items: [] } });
  });

  it.each(["continuation", "previous page", "partial scope", "partial state", "unavailable parent"] as const)(
    "withholds bracket legs while parent identity census has %s", (variant) => {
      const original = relation("brackets", [{ bracket_group_id: "br_1" }]);
      const parent = variant === "unavailable parent"
        ? { ...original, page: null, state: "UNAVAILABLE" as const, reasonCode: "SOURCE_UNAVAILABLE" }
        : { ...original, ...(variant === "partial state" ? { state: "PARTIAL" as const } : {}),
          page: { ...original.page,
            nextCursor: variant === "continuation" ? "another-page" : null,
            previousCursor: variant === "previous page" ? "previous-page" : null,
            scope: variant === "partial scope" ? { state: "PARTIAL" as const, reasonCode: "SCOPE_INCOMPLETE" } : null,
          } };
      const result = enforceProfileLineage([
        parent, relation("bracket_legs", [{ bracket_group_id: "br_1", leg_id: "leg_1" }]),
      ], "N30");
      expect(result[1]).toMatchObject({ state: "PARTIAL", reasonCode: "N30_BRACKET_PARENT_CENSUS_UNQUALIFIED",
        page: { completeness: "PARTIAL", items: [] }, lineageRejects: { bracket: 1 } });
    },
  );

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
