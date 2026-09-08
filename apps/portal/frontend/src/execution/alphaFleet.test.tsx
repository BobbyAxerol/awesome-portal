import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AlphaFleet } from "./screens/AlphaFleet";
import { FLEET_SMOKE_DATA, fleetSmoke } from "./alphaFleet.smoke";

afterEach(cleanup);

describe("Alpha Fleet — entry screen for WF 2a (smoke until BR-EX-49)", () => {
  it("renders every alpha of the fleet once and says the data is smoke", () => {
    render(<AlphaFleet demo={fleetSmoke()} />);
    for (const row of FLEET_SMOKE_DATA.rows) expect(screen.getByText(row.alpha)).toBeTruthy();
    expect(screen.getByText(/SMOKE DATA/)).toBeTruthy();
  });
  it("a stage chip narrows the list to alphas holding a deployment at that stage", () => {
    render(<AlphaFleet demo={fleetSmoke()} />);
    fireEvent.click(screen.getByRole("button", { name: /^Canary/ }));
    expect(screen.getByText("Grid v2.1")).toBeTruthy();
    expect(screen.getByText("MM v1.1")).toBeTruthy();
    expect(screen.queryByText("Carry v3.2")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Research/ }));
    expect(screen.getByText("MeanRev v0.3")).toBeTruthy();
    expect(screen.queryByText("Grid v2.1")).toBeNull();
  });
  it("keeps blocked research rows visible and figure-less", () => {
    render(<AlphaFleet demo={fleetSmoke()} />);
    const row = screen.getByText("MeanRev v0.3").closest("tr")!;
    expect(within(row).getByText(/audit replay failed/)).toBeTruthy();
    expect(within(row).queryByText(/\d+,\d+/)).toBeNull();
  });
  it("expands an alpha to its deployments and collapses it again", () => {
    render(<AlphaFleet demo={fleetSmoke()} />);
    const grid = screen.getByText("Grid v2.1").closest("tr")!;
    expect(screen.getByText("dep_live")).toBeTruthy();
    fireEvent.click(grid);
    expect(screen.queryByText("dep_live")).toBeNull();
  });
  it("never sums currencies: VND and USDC stay beside their own figures", () => {
    render(<AlphaFleet demo={fleetSmoke()} />);
    expect(screen.getAllByText("VND").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/USDC paper — not summed/)).toBeTruthy();
  });
});

describe("Alpha Fleet — venue and owner filters over the published rows (P0-5)", () => {
  const deployment = (venue: string, stage: string) => ({
    deploymentId: `dep-${venue}-${stage}`, stage, venue, accountId: `acct-${venue}`,
    portfolioId: "PF-A", portfolioName: "PF-A", currency: "USDT",
    allocation: "1000", balanceTotal: "1000", balanceFree: "1000", balanceLocked: "0",
    positionFactCount: 0, realizedPnl: "0", unrealizedPnl: "0", netPnl: "0", exposure: "0",
    state: "READY", active: true, health: "READY", updatedAt: "2026-09-07T00:00:00.000Z",
  });
  const item = (alphaId: string, owner: string, venues: readonly string[]) => ({
    alphaId, alphaLabel: alphaId, version: "1", stage: "PAPER", stages: ["PAPER"], owner,
    portfolios: [{ portfolioId: "PF-A", name: "PF-A", baseCurrency: "USDT" }],
    deployments: venues.map((venue) => deployment(venue, "PAPER")),
    allocations: [], balances: [], positionPnl: [], exposure: [],
    health: "READY", attentionReasons: [], metricsAvailability: {},
    updatedAt: "2026-09-07T00:00:00.000Z",
  });
  const list = {
    environment: "paper", freshness: "FRESH", completeness: "COMPLETE",
    sourceAsOf: "2026-09-07T00:00:00.000Z", readAt: "2026-09-07T00:00:10.000Z",
    page: {
      rows: [item("alpha_bin", "bobby", ["BINANCE"]), item("alpha_okx", "lan", ["OKX"])],
      totalCount: 2, filteredCount: 2, nextCursor: null, prevCursor: null, hasMore: false, hasPrevious: false,
    },
    summary: {
      alphaCount: 2, deploymentCount: 2, portfolioCount: 1, needsAttentionCount: 0, researchOnlyCount: 0,
      stageCounts: { PAPER: 2 }, exposureByCurrency: [], currentPositionPnlByCurrency: [],
    },
  } as never;

  it("narrows by venue, then by owner, and says how many rows the filters hid", () => {
    render(<AlphaFleet list={list} />);
    expect(screen.getAllByText("alpha_bin").length).toBeGreaterThan(0);
    expect(screen.getAllByText("alpha_okx").length).toBeGreaterThan(0);

    fireEvent.change(screen.getByLabelText("Venue"), { target: { value: "OKX" } });
    expect(screen.queryAllByText("alpha_bin")).toHaveLength(0);
    expect(screen.getAllByText("alpha_okx").length).toBeGreaterThan(0);
    expect(screen.getByText(/1 of 2 alphas hidden by these filters/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Venue"), { target: { value: "ALL" } });
    fireEvent.change(screen.getByLabelText("Owner"), { target: { value: "bobby" } });
    expect(screen.getAllByText("alpha_bin").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("alpha_okx")).toHaveLength(0);
  });

  it("offers only the venues and owners the rows actually carry", () => {
    render(<AlphaFleet list={list} />);
    const venues = [...(screen.getByLabelText("Venue") as HTMLSelectElement).options].map((o) => o.value);
    expect(venues).toEqual(["ALL", "BINANCE", "OKX"]);
    const owners = [...(screen.getByLabelText("Owner") as HTMLSelectElement).options].map((o) => o.value);
    expect(owners).toEqual(["ALL", "bobby", "lan"]);
  });
});

describe("Alpha Fleet — the equity sparkline is drawn inline for every row (P0-5)", () => {
  const item = {
    alphaId: "alpha_1", alphaLabel: "alpha_1", version: "1", stage: "PAPER", stages: ["PAPER"], owner: "bobby",
    portfolios: [], deployments: [{
      deploymentId: "dep-1", stage: "PAPER", venue: "BINANCE", accountId: "acct-1", portfolioId: null, portfolioName: null,
      currency: "USDT", allocation: "1", balanceTotal: "1", balanceFree: "1", balanceLocked: "0", positionFactCount: 0,
      realizedPnl: "0", unrealizedPnl: "0", netPnl: "0", exposure: "0", state: "READY", active: true, health: "READY",
      updatedAt: "2026-09-07T00:00:00.000Z",
    }],
    allocations: [], balances: [], positionPnl: [], exposure: [], health: "READY", attentionReasons: [],
    metricsAvailability: {}, updatedAt: "2026-09-07T00:00:00.000Z",
  };
  const list = {
    environment: "paper", freshness: "FRESH", completeness: "COMPLETE",
    sourceAsOf: "2026-09-07T00:00:00.000Z", readAt: "2026-09-07T00:00:10.000Z",
    page: { rows: [item], totalCount: 1, filteredCount: 1, nextCursor: null, prevCursor: null, hasMore: false, hasPrevious: false },
    summary: { alphaCount: 1, deploymentCount: 1, portfolioCount: 0, needsAttentionCount: 0, researchOnlyCount: 0, stageCounts: { PAPER: 1 }, exposureByCurrency: [], currentPositionPnlByCurrency: [] },
  } as never;

  it("draws the row's series inline, without waiting for anyone to expand it", () => {
    // Owner, 2026-09-08: show the 30-day line, do not make the reader open the
    // row for it. The whole column now arrives in one read, so there is no
    // per-row request left to defer and no "expand to load" state to show.
    const { rerender } = render(<AlphaFleet list={list} equity={{ alpha_1: "loading" }} />);
    expect(screen.getByText("loading…")).toBeTruthy();

    rerender(<AlphaFleet list={list} equity={{ alpha_1: [10, 11, 12] }} />);
    expect(screen.queryByText("loading…")).toBeNull();
    expect(screen.queryByText("expand to load")).toBeNull();
  });

  it("says the mirror has no series rather than blaming the reader for not expanding", () => {
    render(<AlphaFleet list={list} equity={{ alpha_1: null }} />);
    expect(screen.getByText("no series")).toBeTruthy();
  });
});
