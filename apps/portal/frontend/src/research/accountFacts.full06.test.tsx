/** FULL-06 6a: the percent-equity account is disclosed as a fraction of live equity, exactly as served, and never defaulted. */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AccountFacts, accountLines } from "./AccountFacts";
import { recipesFromSetup } from "./runRecipes";
import { profilePinsFromSetup } from "./useRunSetup";
import { FIXED_OPTIONS } from "./runSetup.s02.test";
import type { SetupProfile } from "./setupClient";

afterEach(cleanup);

const ACCOUNT = {
  initial_capital: 20000, leverage: 3, alloc_per_trade: 0.1, allocation_unit: "EQUITY_FRACTION" as const, canonical_one_way_fee_rate: 0.0005,
  slippage: 0, funding_enabled: false as const, sizing_authority: "QUANTBT_PCT_EQUITY_LIVE_EQUITY_ON_SIGNAL_CHANGE_V1" as const,
};
const pct = (): SetupProfile => ({ ...structuredClone(FIXED_OPTIONS.profiles[0]!), profile_id: "p10.pct.v1", execution_route: "pct_equity", account_model: "QUANTBT_PERCENT_EQUITY_V1", account: ACCOUNT } as SetupProfile);

describe("percent-equity account", () => {
  it("maps the served account and says the allocation is a fraction of live equity, not currency", () => {
    const pins = profilePinsFromSetup(pct());
    expect(pins.account).toEqual({ initialCapital: 20000, leverage: 3, allocPerTrade: 0.1, allocationUnit: "EQUITY_FRACTION", oneWayFeeRate: 0.0005, slippage: 0, fundingEnabled: false, sizingAuthority: "QUANTBT_PCT_EQUITY_LIVE_EQUITY_ON_SIGNAL_CHANGE_V1" });
    expect(accountLines(pins.account!)).toEqual(["10% of live equity on each signal change", "leverage 3×", "starting capital 20,000", "fee 0.05% per side", "slippage 0", "funding off"]);
    const { container } = render(<AccountFacts account={pins.account} />);
    expect(container.querySelector("[data-account-facts]")?.textContent).toContain("10% of live equity on each signal change");
  });
  it("a notional profile has no account and prints nothing", () => {
    expect(profilePinsFromSetup(FIXED_OPTIONS.profiles[0]!).account).toBeNull();
    const { container } = render(<AccountFacts account={null} />);
    expect(container.querySelector("[data-account-facts]")).toBeNull();
  });
  it("the recipe says '10% of equity' and carries its route; recipes of other routes are not filtered away", () => {
    const options = { ...structuredClone(FIXED_OPTIONS), profiles: [pct()] };
    const [recipe] = recipesFromSetup(options);
    expect(recipe).toMatchObject({ enabled: true, executionRoute: "pct_equity" });
    expect(recipe!.summary).toMatch(/^10% of equity/);
  });
});
