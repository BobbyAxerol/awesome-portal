/** Display-fix lane D6 (25/11/2026): rows shaped like the SANDBOX_BINANCE_USDM snapshot delivered by the Edge
 * (2 closed FLAT positions, 3 RESOLVED findings of the other deployment). The Sandbox page's "Positions 0" counts
 * OPEN positions and "Findings 0" is the Portal's own certification findings; neither is a source-read defect. */
import { describe, expect, it } from "vitest";
import { ProfileScreenSource } from "../src/execution/profile-screen-composer";
import { profileStageFacts } from "../src/execution/stage-facts-profile";
import { sourceFigures } from "../src/execution/stage-rows";

const flat = (account: string, strategy: string, id: string) => ({
  mode: "sandbox", side: "FLAT", venue: "BINANCE", notional: "0.000000000000000000", peak_qty: "0.000000000000000000",
  quantity: "0.000000000000000000", signed_qty: "0.000000000000000000", closed_at: "2026-11-15T17:12:42.754217Z",
  account_id: account, strategy_id: strategy, position_id: id, mark_price: null,
});
const resolved = (id: string) => ({
  mode: "sandbox", venue: "BINANCE", status: "RESOLVED", severity: "ERROR", account_id: "sbx-bin-n", strategy_id: "sbx-alpha-bin-n",
  finding_id: id, finding_type: "ORDER_GROUP_AMEND_REFUSED", execution_session_id: null,
  created_at: "2026-11-15T15:13:12.195121Z", resolved_at: "2026-11-15T16:38:31.207236Z",
});
const ALL_POSITIONS = [flat("sbx-bin-h", "sbx-alpha-bin", "sbx-bin-h:ETHUSDT.BINANCE:LONG"), flat("sbx-bin-n", "sbx-alpha-bin-n", "sbx-bin-n:ETHUSDT.BINANCE")];
const ALL_FINDINGS = ["f1", "f2", "f3"].map(resolved);

/** The deployment scope of the product source keeps the rows of the deployment's own strategy + account. */
function sandboxSource(strategy: string, account: string) {
  const own = (row: { strategy_id: string; account_id: string }) => row.strategy_id === strategy && row.account_id === account;
  return new ProfileScreenSource({
    state: "ready", delivery_profile: "SANDBOX_BINANCE_USDM", freshness: "FRESH", completeness: "COMPLETE", as_of: "2026-11-25T05:00:00.000Z",
    capabilities: ["deployments", "positions", "sessions", "reconciliation"].map((key) => ({
      capability_id: `source.${key}`, state: key === "sessions" ? "EMPTY" : "AVAILABLE", reason_code: null })),
    data: {
      deployments: [{ deployment_id: `${strategy}:sandbox:BINANCE:${account}`, strategy_id: strategy, account_id: account, mode: "sandbox", venue: "BINANCE" }],
      positions: ALL_POSITIONS.filter(own), sessions: [], reconciliation: ALL_FINDINGS.filter(own),
    },
  }, "2026-11-25T05:01:00.000Z");
}
const figureOf = (source: ProfileScreenSource, key: string) =>
  sourceFigures(source, "SANDBOX_SOURCE_UNAVAILABLE").figures.find((item) => item.key === key)!.internal;

describe("D6 - Sandbox stage figures over real-shaped rows", () => {
  it("counts OPEN positions: two closed FLAT rows read as an exact 0, never as a missing read", () => {
    for (const [strategy, account] of [["sbx-alpha-bin", "sbx-bin-h"], ["sbx-alpha-bin-n", "sbx-bin-n"]]) {
      const source = sandboxSource(strategy, account);
      expect(source.rows("positions")).toHaveLength(1);
      expect(figureOf(source, "positions")).toEqual({ availability: "AVAILABLE", value: "0", reason_code: null });
    }
  });

  it("a nonzero position of the same shape is counted", () => {
    const source = new ProfileScreenSource({
      state: "ready", delivery_profile: "SANDBOX_BINANCE_USDM", freshness: "FRESH", completeness: "COMPLETE", as_of: "2026-11-25T05:00:00.000Z",
      capabilities: [{ capability_id: "source.positions", state: "AVAILABLE", reason_code: null }],
      data: { positions: [{ ...ALL_POSITIONS[0], side: "LONG", quantity: "0.5", signed_qty: "0.5", closed_at: null }] },
    }, "2026-11-25T05:01:00.000Z");
    expect(figureOf(source, "positions").value).toBe("1");
  });

  it("the reconciliation fact follows the deployment: 3 RESOLVED findings of the other account are not this one's", () => {
    const own = profileStageFacts(sandboxSource("sbx-alpha-bin-n", "sbx-bin-n"), "DARK").reconciliation;
    expect(own.verdict).toMatchObject({ availability: "AVAILABLE", value: "NO_OPEN_FINDINGS" });
    expect(own.open_finding_count).toMatchObject({ availability: "AVAILABLE", value: 0 });
    const other = sandboxSource("sbx-alpha-bin", "sbx-bin-h");
    expect(other.rows("reconciliation")).toHaveLength(0);
    expect(profileStageFacts(other, "DARK").reconciliation.verdict).toMatchObject({ value: "NO_OPEN_FINDINGS" });
  });

  it("an open finding is counted, so the screen can tell it from the resolved ones", () => {
    const source = new ProfileScreenSource({
      state: "ready", delivery_profile: "SANDBOX_BINANCE_USDM", freshness: "FRESH", completeness: "COMPLETE", as_of: "2026-11-25T05:00:00.000Z",
      capabilities: [{ capability_id: "source.reconciliation", state: "AVAILABLE", reason_code: null }],
      data: { reconciliation: [...ALL_FINDINGS, { ...resolved("f4"), status: "OPEN", resolved_at: null }] },
    }, "2026-11-25T05:01:00.000Z");
    expect(profileStageFacts(source, "DARK").reconciliation.open_finding_count).toMatchObject({ availability: "AVAILABLE", value: 1 });
  });
});
