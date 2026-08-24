/**
 * EL-V2-04 — the equity chart is real chart content, or an honest compact
 * state; never an empty frame. The ECharts option is the contract under test;
 * the canvas itself is proven visually in e2e/execution-fixtures.spec.ts
 * (group v2-equity-chart-demo).
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EquityChart, equityOption, type EquitySeries } from "./components/EquityChart";
import { evidenceEquitySeries } from "./equity.fixtures";
import { paperWorkbench } from "./paper.fixtures";

vi.mock("../charts/EChart", () => ({
  EChart: ({ option, height, id }: { option: unknown; height: number; id?: string }) => (
    <div data-echart id={id} data-height={height} data-series={JSON.stringify((option as { series: unknown[] }).series.length)} />
  ),
}));
afterEach(cleanup);

const ENVELOPE = paperWorkbench().equity!.envelope;
const SMALL: EquitySeries = {
  label: "paper equity (USDT)",
  points: [
    { t: "2026-08-01T00:00:00Z", equity: "100.10" },
    { t: "2026-08-01T01:00:00Z", equity: null },
    { t: "2026-08-01T02:00:00Z", equity: "100.30", drawdown: "-0.50" },
  ],
  band: [
    { t: "2026-08-01T00:00:00Z", lower: "99.00", upper: "101.00" },
    { t: "2026-08-01T02:00:00Z", lower: "99.10", upper: "101.10" },
  ],
  bandLabel: "approved band · run_5512",
  gaps: [{ from: "2026-08-01T01:00:00Z", to: "2026-08-01T02:00:00Z", reason: "not published" }],
};

describe("equityOption — the ECharts option is the contract", () => {
  const opt = equityOption(SMALL, ENVELOPE, 0) as never as {
    series: { name: string; data: (number | null)[]; connectNulls: boolean; markArea?: { data: unknown[] } }[];
    dataZoom: { type: string }[];
    tooltip: { formatter: (p: unknown) => string };
    xAxis: { data: string[] };
  };
  it("keeps a missing bucket as a null point and never connects across it", () => {
    const equity = opt.series.find((s) => s.name === SMALL.label)!;
    expect(equity.data).toEqual([100.1, null, 100.3]);
    expect(equity.connectNulls).toBe(false);
    expect(equity.markArea?.data).toHaveLength(1);
  });
  it("draws the approved band from the server's lower/upper, with no band where none was published", () => {
    const lower = opt.series.find((s) => s.name === "band-lower")!;
    expect(lower.data).toEqual([99, null, 99.1]);
    const height = opt.series.find((s) => s.name === "approved band · run_5512")!;
    expect(height.data[1]).toBeNull();
  });
  it("offers inside + slider zoom and re-keys both on reset", () => {
    expect(opt.dataZoom.map((z) => z.type)).toEqual(["inside", "slider"]);
    const next = equityOption(SMALL, ENVELOPE, 1) as never as { dataZoom: { id: string }[] };
    expect(next.dataZoom[0].id).toBe("inside-1");
  });
  it("tooltip prints the server's strings verbatim, plus the envelope", () => {
    const html = opt.tooltip.formatter([{ axisValue: "2026-08-01T02:00:00Z" }]);
    expect(html).toContain("100.30");
    expect(html).toContain("-0.50");
    expect(html).toContain("99.10 … 101.10");
    expect(html).toContain("EXECUTION · as of 2026-08-22T10:42:01Z · equity_projection.v1");
    expect(opt.tooltip.formatter([{ axisValue: "2026-08-01T01:00:00Z" }])).toContain("gap — not published");
  });
  it("plots every bucket on the x axis, gaps included", () => {
    expect(opt.xAxis.data).toHaveLength(3);
  });
});

describe("EquityChart — states and controls", () => {
  it("renders the honest compact state when no series is published, with no chart canvas", () => {
    const { container } = render(<EquityChart title="Equity vs approved research evidence" envelope={ENVELOPE} series={null} />);
    expect(screen.getByRole("status").textContent).toContain("BR-EX-34");
    expect(container.querySelector("[data-echart]")).toBeNull();
    expect(container.querySelector(".exec-chart-unavailable")).not.toBeNull();
  });
  it("renders a chart with axes-bearing option when a series is published", () => {
    const { container } = render(<EquityChart title="Equity" envelope={ENVELOPE} series={SMALL} />);
    expect(container.querySelector("[data-echart]")).not.toBeNull();
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain("3 buckets, 1 missing");
    expect(screen.queryByRole("note")).toBeNull();
  });
  it("labels an evidence-only series so it can never pass as a projection", () => {
    render(<EquityChart title="Equity" envelope={ENVELOPE} series={{ ...SMALL, evidenceOnly: true }} />);
    expect(screen.getByRole("note").textContent).toContain("not a published projection");
  });
  it("table view shows the raw strings and names the gap", () => {
    render(<EquityChart title="Equity" envelope={ENVELOPE} series={SMALL} />);
    fireEvent.click(screen.getByRole("button", { name: "Table" }));
    expect(screen.getByRole("button", { name: "Chart" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("100.10")).toBeTruthy();
    expect(screen.getByText("gap")).toBeTruthy();
    expect(screen.getByText("99.10 … 101.10")).toBeTruthy();
  });
  it("expand doubles the canvas and double-click resets the zoom epoch", () => {
    const { container } = render(<EquityChart title="Equity" envelope={ENVELOPE} series={SMALL} />);
    fireEvent.click(screen.getByRole("button", { name: "Expand" }));
    expect(container.querySelector("[data-echart]")?.getAttribute("data-height")).toBe("560");
    expect(container.querySelector(".exec-chart-expanded")).not.toBeNull();
    const body = container.querySelector(".exec-chart-body")!;
    expect(body.getAttribute("data-zoom-epoch")).toBe("0");
    fireEvent.doubleClick(body);
    expect(body.getAttribute("data-zoom-epoch")).toBe("1");
    fireEvent.click(screen.getByRole("button", { name: "Reset zoom" }));
    expect(body.getAttribute("data-zoom-epoch")).toBe("2");
  });
});

describe("evidence series fixture", () => {
  it("is deterministic, 720 hourly buckets with exactly the 4-bucket gap it declares", () => {
    const a = evidenceEquitySeries();
    const b = evidenceEquitySeries();
    expect(a).toEqual(b);
    expect(a.points).toHaveLength(720);
    expect(a.points.filter((p) => p.equity === null)).toHaveLength(4);
    expect(a.evidenceOnly).toBe(true);
    expect(a.points[0].t).toBe("2026-07-23T11:00:00Z");
    expect(a.points[719].t).toBe("2026-08-22T10:00:00Z");
  });
});
