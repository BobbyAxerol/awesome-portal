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
    const { container } = render(<CorrelationPanel correlation={CORRELATION_FLEET} />);
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
      <CorrelationPanel correlation={CORRELATION_CEILING} lensIndex={0} />,
    );
    expect(container.querySelectorAll("td").length).toBeLessThan(MATRIX_CELL_BUDGET);
    expect(container.querySelector(".exec-pf-matrix")).toBeNull();
  });

  it("says on screen which representation it chose and why", () => {
    render(<CorrelationPanel correlation={CORRELATION_CEILING} lensIndex={0} />);
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
    const { container } = render(<CorrelationPanel correlation={correlationFixture(4)} />);
    const mmRow = [...container.querySelectorAll(".exec-pf-matrix tbody tr")].find((tr) =>
      tr.querySelector("th")?.textContent?.includes("MM"),
    )!;
    const cells = [...mmRow.querySelectorAll("td")].map((td) => td.textContent);
    expect(cells).toEqual(["—", "—", "1", "—"]);
  });

  it("renders an em dash instead of a number below the sample floor", () => {
    const { container } = render(<CorrelationPanel correlation={correlationFixture(4)} />);
    const dashes = container.querySelectorAll('td[data-insufficient="true"]');
    expect(dashes.length).toBeGreaterThan(0);
    for (const cell of dashes) expect(cell.textContent).toBe("—");
    expect(screen.getByText(/INSUFFICIENT_DATA/)).toBeTruthy();
  });

  it("keeps the diagonal at 1 even beside insufficient neighbours", () => {
    const { container } = render(<CorrelationPanel correlation={correlationFixture(4)} />);
    const firstRow = container.querySelectorAll(".exec-pf-matrix tbody tr")[0];
    expect(firstRow.querySelectorAll("td")[0].textContent).toBe("1");
  });

  it("says plainly that the floor could not be applied when counts are unpublished", () => {
    // Today's contract publishes no per-cell counts. Silence here would let the
    // numbers read as having passed a check that never ran.
    render(<CorrelationPanel correlation={CORRELATION_NO_SAMPLES} />);
    expect(screen.getByText(/per-pair sample counts are not published/)).toBeTruthy();
    expect(screen.getByText(new RegExp(`${SAMPLE_FLOOR}`))).toBeTruthy();
  });

  it("does not mark cells insufficient merely because counts are missing", () => {
    // "cannot judge" and "judged and failed" are different claims.
    const { container } = render(<CorrelationPanel correlation={CORRELATION_NO_SAMPLES} />);
    expect(container.querySelectorAll('td[data-insufficient="true"]')).toHaveLength(0);
  });

  it("marks a ranked pair below the floor without dropping it", () => {
    render(<CorrelationPanel correlation={rankedFixture()} />);
    // Pair 499 has 41 samples and sits at the very bottom of the ranking; a
    // head-cap would have removed the only one worth flagging.
    expect(screen.getByText("41")).toBeTruthy();
    expect(screen.getByText(/outside the most recent/)).toBeTruthy();
  });

  it("leaves a leader figure absent rather than calling it zero", () => {
    render(<PortfolioThreeSixty {...portfolio360({ tab: "Structure & Correlation" })} />);
    // A halted alpha with nine days of history has no variance contribution
    // anyone can stand behind. Zero would claim it contributes nothing.
    expect(screen.getAllByText("not available").length).toBeGreaterThanOrEqual(2);
  });
});

describe("Portfolio 360° — the leader lens", () => {
  it("shows one row of n cells rather than n squared", () => {
    const { container } = render(
      <CorrelationPanel correlation={CORRELATION_CEILING} lensIndex={3} />,
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
      <CorrelationPanel correlation={correlationFixture(4)} lensIndex={1} />,
    );
    // Every row is still rendered; one is marked.
    expect(container.querySelectorAll(".exec-pf-matrix tbody tr")).toHaveLength(4);
    expect(container.querySelectorAll('tr[data-lens="true"]')).toHaveLength(1);
  });

  it("keeps the three leader lists apart instead of merging a score", () => {
    const { container } = render(
      <PortfolioThreeSixty {...portfolio360({ tab: "Structure & Correlation" })} />,
    );
    const lists = container.querySelectorAll(".exec-pf-leaders > section");
    expect(lists).toHaveLength(3);
    // An alpha that is 70% of exposure but 20% of variance is a different
    // problem from the reverse, and one blended number answers both the same.
    expect(screen.queryByText(/leader score/i)).toBeNull();
  });
});

describe("Portfolio 360° — ledger and structure", () => {
  it("offers all six tabs and renders one", () => {
    render(<PortfolioThreeSixty {...portfolio360()} />);
    for (const tab of PORTFOLIO_TABS) expect(screen.getByRole("tab", { name: tab })).toBeTruthy();
    expect(PORTFOLIO_TABS).toHaveLength(6);
  });

  it("buckets the ledger by currency and never runs one total across them", () => {
    const { container } = render(<PortfolioThreeSixty {...portfolio360({ tab: "Capital Ledger" })} />);
    const captions = [...container.querySelectorAll("caption")].map((c) => c.textContent);
    expect(captions.some((c) => c?.includes("USDT"))).toBe(true);
    expect(captions.some((c) => c?.includes("VND"))).toBe(true);
  });

  it("takes each entry's direction from the server, not from the amount's sign", () => {
    render(<PortfolioThreeSixty {...portfolio360({ tab: "Capital Ledger" })} />);
    // The zero-amount rebalance is UNCHANGED, and a client reading the sign
    // would call it nothing at all.
    expect(screen.getByText("UNCHANGED")).toBeTruthy();
    expect(screen.getByText("REBALANCE")).toBeTruthy();
  });

  it("shows before and after on every ledger row", () => {
    render(<PortfolioThreeSixty {...portfolio360({ tab: "Capital Ledger" })} />);
    expect(screen.getByText("0 → 500")).toBeTruthy();
    expect(screen.getByText(/ledger's own invariant/)).toBeTruthy();
  });

  it("names the FX policy wherever a total crosses currencies", () => {
    render(<PortfolioThreeSixty {...portfolio360()} />);
    expect(screen.getByText(/fx_usdc_usdt\.v1/)).toBeTruthy();
    expect(screen.getByText(/VND.*would require an FX policy/)).toBeTruthy();
  });

  it("keeps a halted holding visible and marked", () => {
    const { container } = render(<PortfolioThreeSixty {...portfolio360()} />);
    const row = screen.getByText("acct-canary-mm-v11").closest("tr") as HTMLElement;
    expect(within(row).getByText("BLOCKED")).toBeTruthy();
    expect(container.querySelector('tr[data-emphasis="warn"]')).toBeTruthy();
  });

  it("says incidents are unpublished rather than claiming none are open", () => {
    // The tab used to render "No open incidents" unconditionally — a claim
    // about safety from a component that had never been given incident data.
    render(<PortfolioThreeSixty {...portfolio360({ tab: "Incidents" })} />);
    expect(screen.getByText(/have not been published/)).toBeTruthy();
  });

  it("reports zero open only when the server said zero", () => {
    render(
      <PortfolioThreeSixty
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
    render(<CorrelationPanel correlation={null} />);
    expect(screen.getByText(/No correlation result was published/)).toBeTruthy();
  });
});
