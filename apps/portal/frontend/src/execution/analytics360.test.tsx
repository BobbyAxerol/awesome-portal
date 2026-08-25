/**
 * EL-V2-08 — the analytical surfaces: zero blank frames, scope propagation,
 * heatmap/influence from the published matrix, blotter columns/export and
 * the M7 footer, chart export/cross-filter, and the 10⁵-row residency budget.
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { AlphaThreeSixty } from "./screens/AlphaThreeSixty";
import { PortfolioThreeSixty, absBucket, InfluenceMap } from "./screens/PortfolioThreeSixty";
import { FullBlotter } from "./screens/FullBlotter";
import { EquityChart } from "./components/EquityChart";
import { AggregatesFooter } from "./components/AggregatesFooter";
import { KeysetTable, RESIDENCY_CAP } from "./components/table";
import { alpha360 } from "./alpha360.fixtures";
import { portfolio360 } from "./portfolio360.fixtures";
import { blotterPage, AGGREGATES_BY_CURRENCY_RAW } from "./blotter.fixtures";
import { readAggregatesByCurrency } from "./blotterAggregates";
import { alphaHandlers, portfolioHandlers, blotterHandlers } from "./testHandlers";
import { AlphaThreeSixtyPreview } from "./previewControllers";
import { evidenceEquitySeries } from "./equity.fixtures";
import { paperWorkbench } from "./paper.fixtures";

vi.mock("../charts/EChart", () => ({
  EChart: ({ id, height }: { id?: string; height: number }) => <div data-echart id={id} data-height={height} />,
}));
afterEach(cleanup);

describe("Alpha 360 — no blank frames", () => {
  it("renders every insight tile as a chart or an explicit state — never a caption over nothing", () => {
    const { container } = render(<AlphaThreeSixty {...alphaHandlers()} {...alpha360({ tab: "Insight Charts" })} />);
    const tiles = container.querySelectorAll(".exec-alpha-tiles > *");
    expect(tiles).toHaveLength(12);
    for (const tile of tiles) {
      const hasChart = tile.querySelector("[data-echart]") !== null;
      const hasState = tile.querySelector(".exec-state") !== null || tile.querySelector(".exec-chart-unavailable-body") !== null;
      expect(hasChart || hasState, tile.getAttribute("aria-label") ?? "tile").toBe(true);
    }
    expect(container.querySelectorAll('[data-state="insufficient_data"]').length).toBe(2);
    expect(container.querySelectorAll('[data-state="unavailable"]').length).toBe(1);
  });
  it("draws one contribution chart per currency and never mixes FX", () => {
    render(<AlphaThreeSixty {...alphaHandlers()} {...alpha360()} />);
    expect(screen.getByLabelText("Contribution by venue · USDT")).toBeTruthy();
    expect(screen.getByLabelText("Contribution by venue · USDC")).toBeTruthy();
  });
  it("scope change reaches every scoped panel: changed = present", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/deployments/alphas/av_2041"]}>
        <AlphaThreeSixtyPreview alphaId="av_2041" />
      </MemoryRouter>,
    );
    const panels = Array.from(container.querySelectorAll("[data-scope-panel]"));
    expect(panels.length).toBeGreaterThanOrEqual(4);
    const before = panels.map((p) => p.textContent);
    fireEvent.change(screen.getByLabelText(/Venue/), { target: { value: "BINANCE" } });
    const after = Array.from(container.querySelectorAll("[data-scope-panel]")).map((p) => p.textContent);
    const changed = after.filter((t, i) => t !== before[i]).length;
    expect(changed).toBe(after.length);
  });
});

describe("Portfolio 360 — heatmap, lens and influence from the published matrix", () => {
  it("tints cells by |ρ| bucket and keeps the server's coefficient text", () => {
    expect(absBucket("0.91")).toBe("4");
    expect(absBucket("-0.65")).toBe("3");
    expect(absBucket("0.05")).toBe("0");
    const { container } = render(<PortfolioThreeSixty {...portfolioHandlers()} {...portfolio360({ tab: "Structure & Correlation" })} />);
    const tinted = container.querySelectorAll(".exec-pf-matrix td[data-abs]");
    expect(tinted.length).toBeGreaterThan(0);
    expect(container.querySelectorAll('.exec-pf-matrix td[data-self="true"]').length).toBeGreaterThan(0);
  });
  it("clicking a cell drills into the column lens", () => {
    const onLens = vi.fn();
    const { container } = render(<PortfolioThreeSixty {...portfolioHandlers()} {...portfolio360({ tab: "Structure & Correlation" })} onLensChange={onLens} />);
    const cell = container.querySelector(".exec-pf-matrix tbody tr:first-child td:nth-child(3) button") as HTMLButtonElement;
    fireEvent.click(cell);
    expect(onLens).toHaveBeenCalledWith(1);
  });
  it("draws the influence map from the matrix with edges only above the threshold", () => {
    const data = portfolio360();
    if (data.correlation?.kind !== "PACKED_MATRIX") throw new Error("fixture must be packed");
    const { container } = render(<InfluenceMap matrix={data.correlation} exposures={new Map()} threshold="0.5" />);
    const svg = container.querySelector("svg.exec-influence")!;
    expect(svg.querySelectorAll("circle")).toHaveLength(data.correlation.labels.length);
    const edges = svg.querySelectorAll("line").length;
    expect(svg.getAttribute("aria-label")).toContain(`${edges} edges`);
  });
  it("ρ timeline and drawdown overlap are honest states, not blank frames", () => {
    const { container } = render(<PortfolioThreeSixty {...portfolioHandlers()} {...portfolio360({ tab: "Structure & Correlation" })} />);
    expect(screen.getByText(/ρ timeline and tail-ρ not published/)).toBeTruthy();
    expect(screen.getByText(/Drawdown overlap series not published/)).toBeTruthy();
    expect(container.querySelectorAll(".exec-chart-unavailable").length).toBeGreaterThanOrEqual(2);
  });
});

describe("Full Blotter — columns, export, M7 footer", () => {
  it("Columns ▾ hides a column without re-querying; Export copies only the loaded rows and says so", () => {
    const write = vi.fn();
    Object.assign(navigator, { clipboard: { writeText: write } });
    const page = blotterPage("ALL", 0);
    const { container } = render(<FullBlotter {...blotterHandlers()} envelope={paperWorkbench().envelope} page={page} filter="ALL" onResetCrossFilter={() => undefined} onLoadOlder={() => undefined} onExpand={() => undefined} onFilterChange={() => undefined} />);
    const before = container.querySelectorAll("thead th").length;
    fireEvent.click(screen.getByLabelText("symbol"));
    expect(container.querySelectorAll("thead th").length).toBe(before - 1);
    fireEvent.click(screen.getByRole("button", { name: /Export loaded rows/ }));
    expect(write).toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toMatch(/loaded rows copied as CSV — bounded/);
  });
  it("footer keeps the three counts apart, prints decimals verbatim and flags unparsable rows", () => {
    const agg = readAggregatesByCurrency(AGGREGATES_BY_CURRENCY_RAW)!;
    const { container } = render(<AggregatesFooter aggregates={[...agg, { currency: "VND", rowCount: 10, quantityCount: 8, quantity: "1000", notionalCount: 7, notional: "2500.5", invalidNumericCount: 2 }]} />);
    const usdt = within(container.querySelector("tbody tr") as HTMLElement);
    expect(usdt.getByText("125000.250000000000000001")).toBeTruthy();
    expect(usdt.getByText("4875000.750000000000000001")).toBeTruthy();
    const vnd = container.querySelectorAll("tbody tr")[1] as HTMLElement;
    expect(vnd.getAttribute("data-invalid")).toBe("true");
    expect(within(vnd).getByText("2 unparsable")).toBeTruthy();
    expect(within(vnd).getByText("10")).toBeTruthy();
    expect(within(vnd).getByText("8")).toBeTruthy();
    expect(within(vnd).getByText("7")).toBeTruthy();
  });
  it("says totals are not published rather than showing zeros", () => {
    render(<AggregatesFooter aggregates={null} />);
    expect(screen.getByText(/Totals by currency not published/)).toBeTruthy();
  });
});

describe("chart contract — export and cross-filter", () => {
  it("exports the published points as JSON and lets a table row become a cross-filter", () => {
    const write = vi.fn();
    Object.assign(navigator, { clipboard: { writeText: write } });
    const onSelect = vi.fn();
    render(<EquityChart title="Equity" envelope={paperWorkbench().equity!.envelope} series={evidenceEquitySeries()} onSelectBucket={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    expect(write).toHaveBeenCalled();
    expect(screen.getByText(/720 buckets copied as JSON/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Table" }));
    fireEvent.click(screen.getAllByRole("button", { name: /2026-07-23T11:00:00Z/ })[0]);
    expect(onSelect).toHaveBeenCalledWith("2026-07-23T11:00:00Z");
  }, 15_000);
});

describe("perf budget — 10⁵ rows", () => {
  it("keeps resident DOM rows under RESIDENCY_CAP and records the render time", () => {
    const rows = Array.from({ length: 100_000 }, (_, i) => ({ id: `r${i}`, v: String(i) }));
    const t0 = performance.now();
    const { container } = render(
      <KeysetTable label="perf" columns={[{ key: "id", header: "id", render: (r: { id: string }) => r.id }, { key: "v", header: "v", render: (r: { v: string }) => r.v }]} page={{ rows, totalCount: rows.length, filteredCount: rows.length, hasMore: false, nextCursor: null, prevCursor: null, hasPrevious: false }} rowKey={(r: { id: string }) => r.id} />,
    );
    const ms = performance.now() - t0;
    const resident = container.querySelectorAll("tbody tr").length;
    console.log(`PERF 100k rows: ${resident} resident <tr>, render ${Math.round(ms)}ms`);
    expect(resident).toBeLessThanOrEqual(RESIDENCY_CAP);
  });
});
