/**
 * EL-V2-04 / OR-3 — the equity chart is real chart content, or an honest
 * compact state; never an empty frame. The data shaping is the contract under
 * test (the canvas is uPlot's and is proven visually in
 * e2e/execution-fixtures.spec.ts, group v2-equity-chart-demo); jsdom has no
 * Canvas 2D backend, so `PrimusFinancialChart` renders its host only.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { presetAvailable, presetRange, toFinancialData, utcLabel, xTickLabel } from "../charts/financial/financialData";
import { EquityChart, type EquitySeries } from "./components/EquityChart";
import { evidenceEquitySeries } from "./equity.fixtures";
import { paperWorkbench } from "./paper.fixtures";

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
const T0 = Date.parse("2026-08-01T00:00:00Z");

describe("toFinancialData — the plot data is the contract", () => {
  const data = toFinancialData(SMALL);
  it("keeps a missing bucket as a null point so the line breaks there", () => {
    expect(data.xs).toEqual([T0, T0 + 3_600_000, T0 + 7_200_000]);
    expect(data.values).toEqual([100.1, null, 100.3]);
    expect(data.missing).toBe(1);
    expect(data.dropped).toBe(0);
  });
  it("carries the approved band from the server's lower/upper, absent where none was published", () => {
    expect(data.lower).toEqual([99, null, 99.1]);
    expect(data.upper).toEqual([101, null, 101.1]);
    expect(data.hasBand).toBe(true);
  });
  it("keeps every published string verbatim beside its bucket", () => {
    expect(data.raw.get(T0 + 7_200_000)).toEqual({ t: "2026-08-01T02:00:00Z", value: "100.30", drawdown: "-0.50", lower: "99.10", upper: "101.10" });
    expect(data.raw.get(T0 + 3_600_000)?.value).toBeNull();
  });
  it("declares the server's gaps as ranges and allows a log axis only for all-positive values", () => {
    expect(data.gaps).toEqual([{ from: T0 + 3_600_000, to: T0 + 7_200_000, reason: "not published" }]);
    expect(data.positive).toBe(true);
    expect(toFinancialData({ ...SMALL, kind: "drawdown", points: [{ t: "2026-08-01T00:00:00Z", equity: "-0.10" }] }).positive).toBe(false);
  });
  it("counts an unreadable timestamp instead of hiding it", () => {
    const d = toFinancialData({ label: "x", points: [{ t: "not a time", equity: "1" }, { t: "2026-08-01T00:00:00Z", equity: "2" }] });
    expect(d.dropped).toBe(1);
    expect(d.xs).toHaveLength(1);
  });
});

describe("window presets and UTC labels", () => {
  const xs = toFinancialData(evidenceEquitySeries()).xs;
  it("offers a preset only when it is shorter than the series", () => {
    expect(presetAvailable(xs, "1W")).toBe(true);
    expect(presetAvailable(xs, "1M")).toBe(false); // 720 hourly buckets = 30 days exactly
    expect(presetAvailable(xs, "3M")).toBe(false);
    expect(presetAvailable(xs, "ALL")).toBe(true);
    const week = presetRange(xs, "1W")!;
    expect(week[1]).toBe(xs[xs.length - 1]);
    expect(week[1] - week[0]).toBe(7 * 86_400_000);
    expect(presetRange(xs, "ALL")).toBeNull();
  });
  it("labels ticks in UTC regardless of the host timezone", () => {
    expect(utcLabel(Date.parse("2026-08-22T10:42:00Z"))).toBe("2026-08-22 10:42Z");
    expect(xTickLabel(Date.parse("2026-08-22T10:42:00Z"), 30 * 86_400_000)).toBe("08-22");
    expect(xTickLabel(Date.parse("2026-08-22T10:42:00Z"), 2 * 86_400_000)).toBe("08-22 10:42");
    expect(xTickLabel(Date.parse("2026-08-22T10:42:00Z"), 3_600_000)).toBe("10:42");
  });
});

describe("EquityChart — states and controls", () => {
  it("renders the honest compact state when no series is published, with no chart host", () => {
    const { container } = render(<EquityChart title="Equity vs approved research evidence" envelope={ENVELOPE} series={null} />);
    expect(screen.getByRole("status").textContent).toContain("BR-EX-34");
    expect(container.querySelector("[data-financial-chart]")).toBeNull();
    expect(container.querySelector(".exec-chart-unavailable")).not.toBeNull();
  });
  it("renders the chart host with the bucket count when a series is published", () => {
    const { container } = render(<EquityChart title="Equity" envelope={ENVELOPE} series={SMALL} />);
    const host = container.querySelector("[data-financial-chart]")!;
    expect(host).not.toBeNull();
    expect(host.getAttribute("data-points")).toBe("3");
    expect(host.getAttribute("data-scale")).toBe("linear");
    expect(host.getAttribute("data-live")).toBeNull();
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain("3 buckets, 1 missing");
    expect(screen.queryByRole("note")).toBeNull();
  });
  it("pulses only on the server's freshness verdict", () => {
    const { container } = render(<EquityChart title="Equity" envelope={ENVELOPE} series={SMALL} live />);
    expect(container.querySelector("[data-financial-chart]")?.getAttribute("data-live")).toBe("true");
  });
  it("switches the axis to log only when every value is positive", () => {
    const { container, rerender } = render(<EquityChart title="Equity" envelope={ENVELOPE} series={SMALL} />);
    fireEvent.click(screen.getByRole("button", { name: "Log" }));
    expect(container.querySelector("[data-financial-chart]")?.getAttribute("data-scale")).toBe("log");
    rerender(<EquityChart title="Drawdown" envelope={ENVELOPE} series={{ ...SMALL, kind: "drawdown", points: [{ t: "2026-08-01T00:00:00Z", equity: "-0.10" }] }} />);
    expect((screen.getByRole("button", { name: "Log" }) as HTMLButtonElement).disabled).toBe(true);
    expect(container.querySelector("[data-financial-chart]")?.getAttribute("data-scale")).toBe("linear");
  });
  it("legend names the series, the band toggle and the declared gaps; window chips appear only when shorter than the series", () => {
    render(<EquityChart title="Equity" envelope={ENVELOPE} series={SMALL} />);
    const band = screen.getByRole("button", { name: /approved band · run_5512/ });
    expect(band.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(band);
    expect(band.getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByText(/1 declared gap/)).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Window" })).toBeNull();
    cleanup();
    render(<EquityChart title="Equity" envelope={ENVELOPE} series={evidenceEquitySeries()} />);
    const window = screen.getByRole("group", { name: "Window" });
    expect(Array.from(window.querySelectorAll("button")).map((b) => b.textContent)).toEqual(["1W", "ALL"]);
    fireEvent.click(screen.getByRole("button", { name: "1W" }));
    expect(screen.getByRole("button", { name: "1W" }).getAttribute("aria-pressed")).toBe("true");
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
    expect((container.querySelector("[data-financial-chart]") as HTMLElement).style.height).toBe("560px");
    expect(container.querySelector(".exec-chart-expanded")).not.toBeNull();
    const body = container.querySelector(".exec-chart-body")!;
    expect(body.getAttribute("data-zoom-epoch")).toBe("0");
    fireEvent.doubleClick(body);
    expect(body.getAttribute("data-zoom-epoch")).toBe("1");
    fireEvent.doubleClick(screen.getByRole("img", { name: /double-click resets zoom/ }));
    expect(body.getAttribute("data-zoom-epoch")).toBe("2");
  });
  it("says so when no bucket could be plotted, instead of drawing an empty frame", () => {
    const { container } = render(<EquityChart title="Equity" envelope={ENVELOPE} series={{ label: "x", points: [{ t: "garbage", equity: "1" }] }} />);
    expect(container.querySelector("[data-financial-chart]")).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("1 point had unreadable timestamps");
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
