/**
 * Portfolio 360° tests (phase 16).
 *
 * The screen's central claim is that it never draws more matrix than it can
 * lay out or a reader can use, and never turns "we have not measured this"
 * into a number. Most of what follows is those two.
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CorrelationPanel,
  MATRIX_CELL_BUDGET,
  PORTFOLIO_TABS,
  PortfolioThreeSixty,
  SAMPLE_FLOOR,
  correlationView,
} from "./screens/PortfolioThreeSixty";
import {
  CORRELATION_CEILING,
  CORRELATION_FLEET,
  CORRELATION_NO_SAMPLES,
  correlationFixture,
  portfolio360,
  rankedFixture,
} from "./portfolio360.fixtures";
import { CAPITAL_LEDGER, CROSS_EQUITY } from "./analytics.presentation.fixtures";
import { readCapitalLedger, readCrossEquity } from "./analytics";
import { portfolioHandlers } from "./testHandlers";
import { portfolioOverviewPanels } from "./portfolioOverview";

afterEach(cleanup);

describe("Portfolio 360° — the transport limit is not the render limit", () => {
  it("draws the wireframe's four entities as a full matrix", () => {
    const view = correlationView(correlationFixture(4));
    expect(view.mode).toBe("matrix");
    expect(view.cells).toBe(16);
  });

  it("still draws today's 47-alpha fleet as a matrix", () => {
    // 2,209 cells. Near the edge, and the edge is where the rule must be right.
    const view = correlationView(CORRELATION_FLEET);
    expect(view.mode).toBe("matrix");
    expect(view.cells).toBe(2_209);
    expect(view.cells).toBeLessThanOrEqual(MATRIX_CELL_BUDGET * 2);
  });

  it("refuses to lay out the 150-entity ceiling as a grid", () => {
    // 22,500 cells is what the packing limit permits and what no panel can
    // render or anyone can read.
    const view = correlationView(CORRELATION_CEILING);
    expect(view.cells).toBe(22_500);
    expect(view.mode).toBe("lens");
    expect(view.reason).toContain("22,500");
  });

  it("uses ranked pairs when that is what the source sent", () => {
    const view = correlationView(rankedFixture());
    expect(view.mode).toBe("ranked");
    expect(view.reason).toContain("500");
  });

  it("actually lays out the fleet matrix, rather than only claiming it would", () => {
    // 47 rows and 47 columns of real DOM. The mode decision and the render must
    // agree, and a pure function that says "matrix" while the panel draws a
    // lens would pass every other test here.
    const { container } = render(<CorrelationPanel onLensChange={() => undefined} correlation={CORRELATION_FLEET} />);
    const rows = container.querySelectorAll(".exec-pf-matrix tbody tr");
    expect(rows).toHaveLength(47);
    expect(rows[0].querySelectorAll("td")).toHaveLength(47);
    expect(screen.getByText("MATRIX")).toBeTruthy();
  });

  it("keeps the cell budget well below the transport ceiling", () => {
    // If these ever converge, the screen has stopped protecting the browser.
    expect(MATRIX_CELL_BUDGET).toBeLessThan(150 * 150);
  });

  it("renders no more DOM cells than the budget allows, at the ceiling", () => {
    const { container } = render(
      <CorrelationPanel onLensChange={() => undefined} correlation={CORRELATION_CEILING} lensIndex={0} />,
    );
    expect(container.querySelectorAll("td").length).toBeLessThan(MATRIX_CELL_BUDGET);
    expect(container.querySelector(".exec-pf-matrix")).toBeNull();
  });

  it("says on screen which representation it chose and why", () => {
    render(<CorrelationPanel onLensChange={() => undefined} correlation={CORRELATION_CEILING} lensIndex={0} />);
    // A reader who cannot tell whether they see everything or a selection
    // cannot use either honestly.
    expect(screen.getByText("LENS")).toBeTruthy();
    expect(screen.getByText(/Showing one alpha's row at a time/)).toBeTruthy();
  });
});

describe("Portfolio 360° — insufficient is not zero, and unknown is not insufficient", () => {
  it("gives a thin entity a whole row of dashes, as the wireframe draws it", () => {
    // MM has nine days of history, so every pair involving it is insufficient —
    // that is what the cause actually looks like, rather than scattered cells.
    const { container } = render(<CorrelationPanel onLensChange={() => undefined} correlation={correlationFixture(4)} />);
    const mmRow = [...container.querySelectorAll(".exec-pf-matrix tbody tr")].find((tr) =>
      tr.querySelector("th")?.textContent?.includes("MM"),
    )!;
    const cells = [...mmRow.querySelectorAll("td")].map((td) => td.textContent);
    expect(cells).toEqual(["—", "—", "1", "—"]);
  });

  it("renders an em dash instead of a number below the sample floor", () => {
    const { container } = render(<CorrelationPanel onLensChange={() => undefined} correlation={correlationFixture(4)} />);
    const dashes = container.querySelectorAll('td[data-insufficient="true"]');
    expect(dashes.length).toBeGreaterThan(0);
    for (const cell of dashes) expect(cell.textContent).toBe("—");
    expect(screen.getByText(/INSUFFICIENT_DATA/)).toBeTruthy();
  });

  it("keeps the diagonal at 1 even beside insufficient neighbours", () => {
    const { container } = render(<CorrelationPanel onLensChange={() => undefined} correlation={correlationFixture(4)} />);
    const firstRow = container.querySelectorAll(".exec-pf-matrix tbody tr")[0];
    expect(firstRow.querySelectorAll("td")[0].textContent).toBe("1");
  });

  it("says plainly that the floor could not be applied when counts are unpublished", () => {
    // Today's contract publishes no per-cell counts. Silence here would let the
    // numbers read as having passed a check that never ran.
    render(<CorrelationPanel onLensChange={() => undefined} correlation={CORRELATION_NO_SAMPLES} />);
    expect(screen.getByText(/per-pair sample counts are not published/)).toBeTruthy();
    expect(screen.getByText(new RegExp(`${SAMPLE_FLOOR}`))).toBeTruthy();
  });

  it("does not mark cells insufficient merely because counts are missing", () => {
    // "cannot judge" and "judged and failed" are different claims.
    const { container } = render(<CorrelationPanel onLensChange={() => undefined} correlation={CORRELATION_NO_SAMPLES} />);
    expect(container.querySelectorAll('td[data-insufficient="true"]')).toHaveLength(0);
  });

  it("marks a ranked pair below the floor without dropping it", () => {
    render(<CorrelationPanel onLensChange={() => undefined} correlation={rankedFixture()} />);
    // Pair 499 has 41 samples and sits at the very bottom of the ranking; a
    // head-cap would have removed the only one worth flagging.
    expect(screen.getByText("41")).toBeTruthy();
    expect(screen.getByText(/outside the most recent/)).toBeTruthy();
  });

  it("leaves a leader figure absent rather than calling it zero", () => {
    render(<PortfolioThreeSixty {...portfolioHandlers()} {...portfolio360({ tab: "Structure & Correlation" })} />);
    // A halted alpha with nine days of history has no variance contribution
    // anyone can stand behind. Zero would claim it contributes nothing.
    expect(screen.getAllByText("not available").length).toBeGreaterThanOrEqual(2);
  });
});

describe("Portfolio 360° — the leader lens", () => {
  it("shows one row of n cells rather than n squared", () => {
    const { container } = render(
      <CorrelationPanel onLensChange={() => undefined} correlation={CORRELATION_CEILING} lensIndex={3} />,
    );
    const rows = container.querySelectorAll("tbody tr");
    // 150 entities, capped to 40 pairs — not 22,500 cells.
    expect(rows.length).toBeLessThanOrEqual(40);
    expect(screen.getByText(/showing 40 of 149 pairs/)).toBeTruthy();
  });

  it("reports a lens change rather than holding its own selection", () => {
    const onLensChange = vi.fn();
    render(
      <CorrelationPanel correlation={correlationFixture(4)} lensIndex={null} onLensChange={onLensChange} />,
    );
    screen.getByRole("button", { name: "Carry" }).click();
    expect(onLensChange).toHaveBeenCalledWith(1);
  });

  it("highlights rather than filters, so the comparison stays visible", () => {
    const { container } = render(
      <CorrelationPanel onLensChange={() => undefined} correlation={correlationFixture(4)} lensIndex={1} />,
    );
    // Every row is still rendered; one is marked.
    expect(container.querySelectorAll(".exec-pf-matrix tbody tr")).toHaveLength(4);
    expect(container.querySelectorAll('tr[data-lens="true"]')).toHaveLength(1);
  });

  it("keeps the three leader lists apart instead of merging a score", () => {
    const { container } = render(
      <PortfolioThreeSixty {...portfolioHandlers()} {...portfolio360({ tab: "Structure & Correlation" })} />,
    );
    const lists = container.querySelectorAll(".exec-pf-leaders > section");
    expect(lists).toHaveLength(3);
    // An alpha that is 70% of exposure but 20% of variance is a different
    // problem from the reverse, and one blended number answers both the same.
    // The hi-fi note names the anti-pattern ("never one merged “leader score”"); only an element that IS a score is forbidden.
    expect(screen.queryByText(/^\s*leader score\s*$/i)).toBeNull();
  });
});

describe("Portfolio 360° — ledger and structure", () => {
  it("offers all six tabs and renders one", () => {
    render(<PortfolioThreeSixty {...portfolioHandlers()} {...portfolio360()} />);
    for (const tab of PORTFOLIO_TABS) expect(screen.getByRole("tab", { name: tab })).toBeTruthy();
    expect(PORTFOLIO_TABS).toHaveLength(6);
  });

  it("buckets the ledger by currency and never runs one total across them", () => {
    const { container } = render(<PortfolioThreeSixty {...portfolioHandlers()} {...portfolio360({ tab: "Capital Ledger" })} />);
    const captions = [...container.querySelectorAll("caption")].map((c) => c.textContent);
    expect(captions.some((c) => c?.includes("USDT"))).toBe(true);
    expect(captions.some((c) => c?.includes("VND"))).toBe(true);
  });

  it("takes each entry's direction from the server, not from the amount's sign", () => {
    render(<PortfolioThreeSixty {...portfolioHandlers()} {...portfolio360({ tab: "Capital Ledger" })} />);
    // The zero-amount rebalance is UNCHANGED, and a client reading the sign
    // would call it nothing at all.
    expect(screen.getByText("UNCHANGED")).toBeTruthy();
    expect(screen.getAllByText("REBALANCE").length).toBeGreaterThan(0);
  });

  it("shows before and after on every ledger row", () => {
    render(<PortfolioThreeSixty {...portfolioHandlers()} {...portfolio360({ tab: "Capital Ledger" })} />);
    expect(screen.getByText("0 → 500")).toBeTruthy();
    expect(screen.getAllByText(/ledger's own invariant/).length).toBeGreaterThan(0);
  });

  it("names the FX policy wherever a total crosses currencies", () => {
    render(<PortfolioThreeSixty {...portfolioHandlers()} {...portfolio360({ tab: "Structure & Correlation" })} />);
    expect(screen.getByText(/fx_usdc_usdt\.v1/)).toBeTruthy();
    expect(screen.getByText(/VND.*would require an FX policy/)).toBeTruthy();
  });

  it("keeps a halted holding visible and marked", () => {
    const { container } = render(<PortfolioThreeSixty {...portfolioHandlers()} {...portfolio360({ tab: "Structure & Correlation" })} />);
    const row = screen.getByText("acct-canary-mm-v11").closest("tr") as HTMLElement;
    expect(within(row).getByText("BLOCKED")).toBeTruthy();
    expect(container.querySelector('tr[data-emphasis="warn"]')).toBeTruthy();
  });

  it("says incidents are unpublished rather than claiming none are open", () => {
    // The tab used to render "No open incidents" unconditionally — a claim
    // about safety from a component that had never been given incident data.
    render(<PortfolioThreeSixty {...portfolioHandlers()} {...portfolio360({ tab: "Incidents" })} />);
    expect(screen.getByText(/have not been published/)).toBeTruthy();
  });

  it("reports zero open only when the server said zero", () => {
    render(
      <PortfolioThreeSixty {...portfolioHandlers()}
        {...portfolio360({
          tab: "Incidents",
          incidents: {
            open: [],
            resolved: [{ id: "inc_31", at: "2026-08-14", closedBy: "AP-311" }],
          },
        })}
      />,
    );
    expect(screen.getByText(/Incidents — 0 open/)).toBeTruthy();
    // And what closed it: "resolved" without a cause is an assertion.
    expect(screen.getByText("AP-311")).toBeTruthy();
  });

  it("says the correlation is unavailable rather than drawing an empty grid", () => {
    render(<CorrelationPanel onLensChange={() => undefined} correlation={null} />);
    expect(screen.getByText(/No correlation result was published/)).toBeTruthy();
  });
});

describe("the bounded-window sentence states neither count it was not given", () => {
  const ledgerWith = (patch: Record<string, unknown>) => {
    const raw = JSON.parse(JSON.stringify(CAPITAL_LEDGER));
    Object.assign(raw.analytics.data, { has_more: true, ...patch });
    return readCapitalLedger(raw);
  };

  it("prints both counts when the source published both", () => {
    render(
      <PortfolioThreeSixty {...portfolioHandlers()}
        {...portfolio360({ tab: "Capital Ledger", ledger: ledgerWith({ entry_count: 4180, returned_entry_count: 4 }) })}
      />,
    );
    expect(screen.getByText(/Bounded window — 4 of 4,180 entries/)).toBeTruthy();
  });

  it("does not report zero returned when the returned count is absent", () => {
    // `?? 0` was here, and it produced "Bounded window — 0 of 4,180 entries
    // were returned" — a statement that nothing came back, inside the one
    // paragraph written to stop a reader misreading this exact pair of
    // numbers. `total` on the same line already refused to guess; this half
    // did not.
    const { container } = render(
      <PortfolioThreeSixty {...portfolioHandlers()}
        {...portfolio360({ tab: "Capital Ledger", ledger: ledgerWith({ entry_count: 4180, returned_entry_count: null }) })}
      />,
    );
    const note = container.querySelector(".exec-ledger-bounded")?.textContent ?? "";
    expect(note).toContain("an unstated number of");
    expect(note).not.toMatch(/—\s*0\s*of/);
  });
});

describe("phase 1 · Cross-portfolio is answered by the store, not by a drain", () => {
  const panels = (crossEquity: Parameters<typeof portfolioOverviewPanels>[0]["crossEquity"]) =>
    portfolioOverviewPanels({
      portfolioId: "portfolio_types_pool",
      relations: null,
      loading: true,
      asOf: null,
      crossEquity,
    });

  const served = readCrossEquity(CROSS_EQUITY)!;

  it("keys a row by portfolio AND currency, so one pool can hold two series", () => {
    // portfolio_types_pool publishes a USDT and a VND series on dev. Keyed by
    // portfolio alone, its row took a first equity of 2,000,000 (USDT) and a
    // last of 50,000,000,000 (VND) and called that a comparison.
    render(<>{panels({ rows: served.rows, status: "empty", reason: null }).crossPortfolio}</>);
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows).toHaveLength(3);
    expect(rows[0].textContent).toContain("USDT");
    expect(rows[1].textContent).toContain("VND");
    expect(screen.getByText("22,220,000.00")).toBeTruthy();
  });

  it("leaves loading even while the relation drain is still running", () => {
    // The panel used to take its state from the drain, so it stayed in
    // `loading` for the 37 seconds that drain took — and `loading` is the one
    // state a reader cannot act on.
    const { container } = render(<>{panels({ rows: served.rows, status: "empty", reason: null }).crossPortfolio}</>);
    expect(container.querySelector(".exec-panel-state")).toBeNull();
    expect(container.textContent).not.toContain("Loading");
  });

  it("says the store holds nothing rather than showing an empty table", () => {
    const { container } = render(<>{panels({ rows: [], status: "empty", reason: null }).crossPortfolio}</>);
    expect(container.querySelector("table")).toBeNull();
    expect(container.textContent).toContain("no equity snapshot");
  });

  it("keeps the read's own reason when the read failed", () => {
    const { container } = render(<>{panels({ rows: [], status: "unavailable", reason: "PHASE2_PROJECTION_NOT_READY" }).crossPortfolio}</>);
    expect(container.textContent).toContain("PHASE2_PROJECTION_NOT_READY");
  });

  it("falls back to the drained computation when no read was made", () => {
    // Fixtures and tests pass no served rows; the older path must still work.
    const rows = [
      { portfolio_id: "p1", ts: "2026-09-01T00:00:00Z", equity: "100", currency: "USDT", net_pnl: "1" },
      { portfolio_id: "p1", ts: "2026-09-02T00:00:00Z", equity: "120", currency: "USDT", net_pnl: "2" },
    ];
    const drained = portfolioOverviewPanels({
      portfolioId: "p1",
      relations: { facts: { portfolio_equity_snapshots: rows } } as never,
      loading: false,
      asOf: null,
    });
    render(<>{drained.crossPortfolio}</>);
    expect(screen.getAllByRole("row").slice(1)).toHaveLength(1);
  });
});

describe("phase 1 · the configuration log prints money, not the wire", () => {
  const ledgerRows = [
    { portfolio_id: "p1", created_at: "2026-09-01T00:00:00Z", movement_type: "ALLOCATE", actor: "bobby",
      amount: "20000.000000000000000000", currency: "USDT",
      before_allocated: "0.000000000000000000", after_allocated: "20000.000000000000000000", reason: "grant" },
    { portfolio_id: "p1", created_at: "2026-09-02T00:00:00Z", movement_type: "ADJUST", actor: null,
      amount: null, currency: "USDT", before_allocated: null, after_allocated: null, reason: null },
  ];
  const log = () => portfolioOverviewPanels({
    portfolioId: "p1",
    relations: { facts: { portfolio_capital_ledger: ledgerRows } } as never,
    loading: false,
    asOf: null,
  }).configurationLog;

  it("formats the source's 18-decimal strings instead of printing them raw", () => {
    render(<>{log()}</>);
    expect(screen.getByText("20,000.00")).toBeTruthy();
    expect(document.body.textContent).not.toContain("20000.000000000000000000");
  });

  it("says which figure is missing rather than drawing a dash", () => {
    const { container } = render(<>{log()}</>);
    expect(container.textContent).toContain("amount not published");
    expect(container.textContent).toContain("before not published");
    expect(container.textContent).toContain("after not published");
  });
});
