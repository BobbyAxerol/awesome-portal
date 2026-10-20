import { describe, expect, it } from "vitest";

import { profileLabel } from "./profileLabel";

describe("profileLabel", () => {
  it.each([
    ["PAPER_BINANCE_USDM", "Paper Binance USDM"],
    ["SANDBOX_BINANCE_USDM", "Sandbox Binance USDM"],
    ["live-okx-usdt", "Live OKX USDT"],
    ["real_funded_binance_usdm", "Real-funded Binance USDM"],
    ["fixture", "Fixture"],
    ["paper binance usdm", "Paper Binance USDM"],
  ])("%s reads %s", (id, label) => {
    expect(profileLabel(id)).toBe(label);
  });

  it("returns an empty or blank id as given, never a placeholder", () => {
    expect(profileLabel("")).toBe("");
    expect(profileLabel("  ")).toBe("  ");
  });
});
