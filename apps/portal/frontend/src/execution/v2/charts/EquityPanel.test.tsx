import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { at, DAY, epoch, rng, series, walk } from "./chartKit";
import { EquityPanel, wrapLines } from "./EquityPanel";
import { EventRibbon } from "./EventRibbon";
import { domainOfSeries } from "./model";

afterEach(cleanup);

const BASIC = series(["1000.00", "1010.50", "990.25", "1020.75"]);

function ys(path: string): number[] {
  return [...path.matchAll(/[ML]\s*(-?[\d.]+)[ ,](-?[\d.]+)/g)].map((m) => Number(m[2]));
}
const line = (c: HTMLElement) => c.querySelector('[data-testid="series-line"]')!.getAttribute("d")!;

describe("EquityPanel · readout from the published string", () => {
  it("opens on the latest point and prints the string through formatExact", () => {
    const { container } = render(<EquityPanel label="Net equity" points={BASIC} currency="USDT" />);
    expect(screen.getByTestId("readout-value").textContent).toBe("1,020.75 USDT");
    expect(screen.getByTestId("readout-time").textContent).toBe("4 Oct 00:00Z");
    expect(container.querySelector('[data-testid="endpoint"] text')!.textContent).toBe("1,020.75 USDT");
  });

  it("never invents digits: 4 dp cap, grouping, exact change in window", () => {
    const pts = series(["123456789.1234567891", "123456789.4000000000"]);
    render(<EquityPanel label="Equity" points={pts} signed />);
    expect(screen.getByTestId("readout-value").textContent).toBe("+123,456,789.40");
    expect(screen.getByTestId("readout-change").textContent).toBe("+0.2765");
  });

  it("derives the change by exact subtraction, not float subtraction", () => {
    render(<EquityPanel label="PnL" points={series(["0.1", "0.3"])} />);
    expect(screen.getByTestId("readout-change").textContent).toBe("+0.20");
  });

  it("labels the change as derived across the plotted points, with both as-of times, never 'in window'", () => {
    const { container } = render(<EquityPanel label="Net equity" points={BASIC} currency="USDT" />);
    const text = container.querySelector(".exec-c2-readout")!.textContent!;
    expect(text).toContain("Change across the plotted points");
    expect(text).not.toContain("in window");
    expect(screen.getByTestId("readout-change-span").textContent).toBe("1 Oct 00:00Z to 4 Oct 00:00Z");
  });

  it("a caller can name the change figure (a realized-only PnL series says 'Net PnL, realized')", () => {
    const { container } = render(<EquityPanel label="Deployment series" changeLabel="Net PnL, realized" points={BASIC} currency="USDT" />);
    const text = container.querySelector(".exec-c2-readout")!.textContent!;
    expect(text).toContain("Net PnL, realized");
    expect(text).not.toContain("Change across the plotted points");
  });

  it("flags the high and the low, skipping the one the endpoint already shows", () => {
    const { container } = render(<EquityPanel label="Equity" points={series(["1000.00", "1100.00", "950.00", "1020.75"])} />);
    expect(container.querySelector('[data-testid="high-flag"] text')!.textContent).toBe("High 1,100.00");
    expect(container.querySelector('[data-testid="low-flag"] text')!.textContent).toBe("Low 950.00");
    cleanup();
    const up = render(<EquityPanel label="Equity" points={series(["1000.00", "1010.00", "1100.00"])} />);
    expect(up.container.querySelector('[data-testid="high-flag"]')).toBeNull();
    expect(up.container.querySelector('[data-testid="low-flag"]')).toBeNull();
    cleanup();
    // A low that IS the latest point is the endpoint callout's value: no Low flag on top of it (UX audit A).
    const down = render(<EquityPanel label="Equity" points={series(["1000.00", "1100.00", "950.00"])} />);
    expect(down.container.querySelector('[data-testid="high-flag"] text')!.textContent).toBe("High 1,100.00");
    expect(down.container.querySelector('[data-testid="low-flag"]')).toBeNull();
  });
});

describe("EquityPanel · keyboard and pointer", () => {
  it("is one focusable group; arrows move the readout, Home/End jump, Escape releases", () => {
    const { container } = render(<EquityPanel label="Net equity" points={BASIC} />);
    const group = screen.getByRole("group", { name: /Net equity.*arrow keys/ });
    expect(group.getAttribute("tabindex")).toBe("0");
    expect(container.querySelector('[data-testid="cursor"]')).toBeNull();

    fireEvent.keyDown(group, { key: "ArrowLeft" });
    expect(screen.getByTestId("readout-value").textContent).toBe("990.25");
    expect(screen.getByTestId("readout-time").textContent).toBe("3 Oct 00:00Z");
    expect(container.querySelector('[data-testid="cursor"]')).not.toBeNull();

    fireEvent.keyDown(group, { key: "ArrowLeft" });
    expect(screen.getByTestId("readout-value").textContent).toBe("1,010.50");
    fireEvent.keyDown(group, { key: "ArrowRight" });
    expect(screen.getByTestId("readout-value").textContent).toBe("990.25");
    fireEvent.keyDown(group, { key: "Home" });
    expect(screen.getByTestId("readout-value").textContent).toBe("1,000.00");
    fireEvent.keyDown(group, { key: "ArrowLeft" });
    expect(screen.getByTestId("readout-value").textContent).toBe("1,000.00");
    fireEvent.keyDown(group, { key: "End" });
    expect(screen.getByTestId("readout-value").textContent).toBe("1,020.75");
    fireEvent.keyDown(group, { key: "ArrowLeft" });
    fireEvent.keyDown(group, { key: "Escape" });
    expect(screen.getByTestId("readout-value").textContent).toBe("1,020.75");
    expect(container.querySelector('[data-testid="cursor"]')).toBeNull();
  });

  it("announces keyboard moves in a polite status and ignores other keys", () => {
    render(<EquityPanel label="Net equity" points={BASIC} />);
    const group = screen.getByRole("group", { name: /Net equity/ });
    fireEvent.keyDown(group, { key: "a" });
    expect(screen.getByRole("status").textContent).toBe("");
    fireEvent.keyDown(group, { key: "ArrowLeft" });
    expect(screen.getByRole("status").textContent).toBe("3 Oct 00:00Z, 990.25");
  });

  it("Shift moves ten points", () => {
    const pts = series(walk(40, 9));
    render(<EquityPanel label="Equity" points={pts} />);
    const group = screen.getByRole("group", { name: /Equity/ });
    fireEvent.keyDown(group, { key: "ArrowLeft", shiftKey: true });
    expect(screen.getByTestId("readout-time").textContent).toBe("30 Oct 00:00Z");
  });

  it("follows the pointer to the nearest point and releases on leave", () => {
    const { container } = render(<EquityPanel label="Net equity" points={BASIC} />);
    const group = screen.getByRole("group", { name: /Net equity/ });
    // jsdom has no layout, so the plot is 760 wide: margin 60, plot 622 wide, four points.
    fireEvent.mouseMove(group, { clientX: 60 });
    expect(screen.getByTestId("readout-value").textContent).toBe("1,000.00");
    fireEvent.mouseMove(group, { clientX: 60 + 622 / 3 + 2 });
    expect(screen.getByTestId("readout-value").textContent).toBe("1,010.50");
    fireEvent.mouseLeave(group);
    expect(screen.getByTestId("readout-value").textContent).toBe("1,020.75");
    expect(container.querySelector('[data-testid="cursor"]')).toBeNull();
  });
});

describe("EquityPanel · gaps are gaps", () => {
  it("never joins across a null: two separate subpaths and no segment between them", () => {
    const { container } = render(<EquityPanel label="Equity" points={series(["1000.00", null, "1020.00"])} />);
    const d = line(container);
    expect(d.match(/M/g)).toHaveLength(2);
    expect(d).not.toContain("L");
    expect(container.querySelector('[data-testid="gaps"]')).not.toBeNull();
  });

  it("says so at the null and does not read it as zero", () => {
    render(<EquityPanel label="Equity" points={series(["1000.00", null, "1020.00"])} />);
    const group = screen.getByRole("group", { name: /Equity/ });
    fireEvent.keyDown(group, { key: "ArrowLeft" });
    expect(screen.getByTestId("readout-value").textContent).toBe("No published value at this time");
    expect(screen.queryByTestId("readout-change")).toBeNull();
    expect(screen.getByTestId("envelope").textContent).toContain("1 gap drawn as a gap, not joined");
  });

  it("breaks at a hole in time when the interval is declared", () => {
    const t0 = Date.parse("2026-10-01T00:00:00Z");
    const pts = [0, 1, 5, 6].map((d, i) => ({ t: epoch(t0 + d * DAY), v: `${1000 + i}.00` }));
    const { container } = render(<EquityPanel label="Equity" points={pts} intervalMs={DAY} />);
    expect(line(container).match(/M/g)).toHaveLength(2);
    cleanup();
    const joined = render(<EquityPanel label="Equity" points={pts} />);
    expect(line(joined.container).match(/M/g)).toHaveLength(1);
  });

  it("draws an unreadable value as a gap and counts it (a number is refused, not repaired)", () => {
    const pts = series(["1000.00", "1010.00", "1020.00"]);
    const bad = [pts[0], { t: pts[1].t, v: 1010 as unknown as string }, pts[2]];
    const { container } = render(<EquityPanel label="Equity" points={bad} />);
    expect(line(container).match(/M/g)).toHaveLength(2);
    expect(screen.getByTestId("envelope").textContent).toContain("1 unreadable value drawn as a gap");
  });

  it("draws a lone point as a dot, not nothing", () => {
    const { container } = render(<EquityPanel label="Equity" points={series(["1000.00", null, null, "1005.00", null])} />);
    expect(line(container)).toMatch(/h0/);
  });
});

describe("EquityPanel · absent, partial, stale, refused", () => {
  it("prints the caller's copy and reason, and draws no series", () => {
    const { container } = render(
      <EquityPanel label="Net equity" points={BASIC} state={{ kind: "unavailable", copy: "Not published", reason: "Source has not published equity" }} />,
    );
    expect(screen.getByText("Not published")).toBeTruthy();
    expect(screen.getByText("Source has not published equity")).toBeTruthy();
    expect(screen.getByRole("img", { name: "Net equity: Not published. Source has not published equity" })).toBeTruthy();
    expect(container.querySelector('[data-testid="series-line"]')).toBeNull();
    expect(container.querySelector("path")).toBeNull();
  });

  it("is never an empty plot or a flat zero line when nothing is published", () => {
    const { container } = render(<EquityPanel label="Net equity" points={series([null, null, null])} />);
    expect(screen.getByText("Not available")).toBeTruthy();
    expect(screen.getByText("No published value in this window.")).toBeTruthy();
    expect(container.querySelector('[data-testid="series-line"]')).toBeNull();
    cleanup();
    const none = render(<EquityPanel label="Net equity" points={[]} />);
    expect(none.container.querySelector("svg")).toBeNull();
    expect(screen.getByText("Not available")).toBeTruthy();
  });

  it("refuses a series that is not in strictly increasing time order", () => {
    const pts = series(["1.00", "2.00", "3.00"]);
    const { container } = render(<EquityPanel label="Net equity" points={[pts[1], pts[0], pts[2]]} />);
    expect(screen.getByText(/not in strictly increasing time order/)).toBeTruthy();
    expect(container.querySelector('[data-testid="series-line"]')).toBeNull();
  });

  it("wears a Flag for PARTIAL and STALE and still draws the data", () => {
    const partial = render(<EquityPanel label="Net equity" points={BASIC} state={{ kind: "partial", reason: "Venue B missing" }} />);
    expect(partial.container.querySelector('.exec-flag[data-k="partial"]')!.textContent).toContain("Partial · Venue B missing");
    expect(partial.container.querySelector('[data-testid="series-line"]')).not.toBeNull();
    cleanup();
    const stale = render(<EquityPanel label="Net equity" points={BASIC} state={{ kind: "stale", reason: "Last sync 17 Oct 09:14Z" }} />);
    expect(stale.container.querySelector('.exec-flag[data-k="stale"]')!.textContent).toContain("Stale · Last sync 17 Oct 09:14Z");
    expect(stale.container.querySelector('[data-testid="series-line"]')).not.toBeNull();
  });
});

describe("EquityPanel · layers", () => {
  const sim = { kind: "simulated" as const, from: at("2026-10-01T00:00:00Z"), to: at("2026-10-02T00:00:00Z") };

  it("hatches simulated spans, words them, and splits the line at the boundary without a break", () => {
    const { container } = render(<EquityPanel label="Equity" points={BASIC} segments={[sim]} />);
    expect(container.querySelector('.exec-c2-seg[data-kind="simulated"] text')!.textContent).toBe("Simulated");
    expect(container.querySelector('[data-testid="simulated-line"]')).not.toBeNull();
    // The actual run starts from the shared boundary point, so the line is one line.
    const actual = line(container);
    const simulated = container.querySelector('[data-testid="simulated-line"]')!.getAttribute("d")!;
    expect(actual.match(/M/g)).toHaveLength(1);
    expect(actual.match(/^M(-?[\d.]+) (-?[\d.]+)/)![0].slice(1)).toBe(simulated.match(/L(-?[\d.]+) (-?[\d.]+)$/)![0].slice(1));
  });

  it("draws a retained span with its own word", () => {
    const { container } = render(<EquityPanel label="Equity" points={BASIC} segments={[{ ...sim, kind: "retained" }]} />);
    expect(container.querySelector('.exec-c2-seg[data-kind="retained"] text')!.textContent).toBe("Retained");
    expect(screen.getByText("Retained", { selector: "li" })).toBeTruthy();
  });

  it("draws the approved band, extends the axis to it, and refuses unreadable bounds loudly", () => {
    const { container } = render(<EquityPanel label="Equity" points={BASIC} band={{ lo: "1500.00", hi: "1600.00", name: "Approved band" }} />);
    expect(container.querySelector('[data-testid="band"]')).not.toBeNull();
    const ticks = [...container.querySelectorAll(".exec-c2-yaxis .exec-c2-tick")].map((t) => t.textContent);
    expect(ticks.some((t) => Number((t ?? "").replace(/,/g, "")) >= 1600)).toBe(true);
    cleanup();
    const bad = render(<EquityPanel label="Equity" points={BASIC} band={{ lo: "1600.00", hi: "1500.00" }} />);
    expect(bad.container.querySelector('[data-testid="band"]')).toBeNull();
    expect(screen.getByTestId("envelope").textContent).toContain("Band not drawn");
  });

  it("draws a ghost series and reads it at the cursor, saying so where it has no point", () => {
    const ghost = series(["1000.00", "1005.00"]);
    const { container } = render(<EquityPanel label="Equity" points={BASIC} ghost={{ name: "Paper twin", points: ghost }} />);
    expect(container.querySelector('[data-testid="ghost-line"]')).not.toBeNull();
    expect(screen.getByTestId("readout-ghost").textContent).toBe("No point at this time");
    fireEvent.keyDown(screen.getByRole("group", { name: /Equity/ }), { key: "Home" });
    expect(screen.getByTestId("readout-ghost").textContent).toBe("1,000.00");
  });

  it("keeps the drawdown Low label inside its pane (below the x tick row) even when the published drawdown has positive points (QA1 I14)", () => {
    const dd = series(["0.0020", "0.0010", "-0.0069", "0.0005"]);
    const { container } = render(<EquityPanel label="Equity" points={BASIC} drawdown={{ kind: "series", points: dd }} />);
    const label = container.querySelector('[data-testid="drawdown-pane"] .exec-c2-dd-min text') as SVGTextElement;
    const pane = container.querySelector('[data-testid="drawdown-pane"] line.exec-c2-grid') as SVGLineElement;
    const top = Number(pane.getAttribute("y1"));
    const y = Number(label.getAttribute("y"));
    expect(y).toBeGreaterThanOrEqual(top + 12);
    // The x tick labels sit above the pane's top line, so a label at or below top + 12 cannot touch them.
    const tickBottom = Math.max(...[...container.querySelectorAll("text.exec-c2-tick")].map((t) => Number(t.getAttribute("y"))));
    expect(y).toBeGreaterThan(tickBottom);
  });

  it("prints one as-of for the equity and drawdown readouts, and the drawdown does not carry a different one (QA7 N2-07)", () => {
    const dd = series(["-0.0100"]);
    const { container } = render(<EquityPanel label="Equity" readAsOf={Date.UTC(2026, 9, 4)} points={BASIC} drawdown={{ kind: "series", points: dd }} />);
    expect(container.querySelector('[data-testid="readout-asof"]')?.textContent).toBe("4 Oct 00:00Z");
    expect(container.querySelector('[data-testid="readout-drawdown"]')?.textContent ?? "").not.toMatch(/as of/);
  });

  it("clips the drawdown series to the plot, so a series that starts before the axis never draws outside the panel (QA7 N2-06)", () => {
    const dd = series(["-0.0100", "-0.0200", "-0.0150"]);
    const { container } = render(<EquityPanel label="Equity" points={BASIC} drawdown={{ kind: "series", points: dd }} />);
    const clip = container.querySelector('[data-testid="drawdown-clip"]') as SVGGElement | null;
    expect(clip?.getAttribute("clip-path")).toMatch(/^url\(#.+-ddclip\)$/);
    expect(clip?.querySelector("path.exec-c2-dd-area")).not.toBeNull();
  });

  it("shows the published drawdown, its worst point, and reads it at the cursor", () => {
    const dd = series(["0.00", "0.00", "-2.5000", "-1.2500"]);
    const { container } = render(<EquityPanel label="Equity" points={BASIC} drawdown={{ kind: "series", points: dd }} />);
    expect(container.querySelector('[data-testid="drawdown-pane"] .exec-c2-dd-min text')!.textContent).toBe("-2.50%");
    expect(screen.getByTestId("readout-drawdown").textContent).toBe("-1.25%");
    fireEvent.keyDown(screen.getByRole("group", { name: /Equity/ }), { key: "ArrowLeft" });
    expect(screen.getByTestId("readout-drawdown").textContent).toBe("-2.50%");
  });

  it("says drawdown is not published rather than deriving or zeroing it", () => {
    const { container } = render(<EquityPanel label="Equity" points={BASIC} drawdown={{ kind: "absent", copy: "Not published" }} />);
    expect(container.querySelector('[data-testid="drawdown-pane"] .exec-c2-dd-absent text')!.textContent).toBe("Not published");
    expect(screen.getByTestId("readout-drawdown").textContent).toBe("Not published");
    expect(container.querySelector(".exec-c2-dd-area")).toBeNull();
  });

  it("pins flows with their sign and marks events with a distinct glyph", () => {
    const { container } = render(
      <EquityPanel
        label="Equity"
        points={BASIC}
        flows={[{ id: "f1", t: at("2026-10-02T00:00:00Z"), value: "10000.00" }, { id: "f2", t: at("2026-10-03T00:00:00Z"), value: "-2500.00" }]}
        events={[{ id: "e1", t: at("2026-10-02T00:00:00Z"), kind: "incident", title: "Broker sync diverged" }, { id: "e2", t: at("2026-10-03T00:00:00Z"), kind: "recall", title: "Recall" }]}
      />,
    );
    const pins = [...container.querySelectorAll('[data-testid="flow-pin"]')];
    expect(pins.map((p) => p.querySelector("text")!.textContent)).toEqual(["+10,000.00", "-2,500.00"]);
    expect(pins.map((p) => p.getAttribute("data-neg"))).toEqual(["false", "true"]);
    expect([...container.querySelectorAll('[data-testid="event-mark"] text')].map((t) => t.textContent)).toEqual(["▲", "↩"]);
  });

  it("slots a ribbon between the readout and the plot", () => {
    const dom = domainOfSeries(BASIC)!;
    const { container } = render(
      <EquityPanel label="Equity" points={BASIC} domain={dom} ribbon={<EventRibbon label="Events" events={[{ id: "e1", t: at("2026-10-02T00:00:00Z"), kind: "stage", title: "Paper to sandbox" }]} domain={dom} />} />,
    );
    const fig = container.querySelector("figure")!;
    const kids = [...fig.children];
    const rib = kids.findIndex((k) => k.classList.contains("exec-ribbon"));
    expect(rib).toBeGreaterThan(kids.findIndex((k) => k.classList.contains("exec-c2-readout")));
    expect(rib).toBeLessThan(kids.findIndex((k) => k.classList.contains("exec-c2-plot")));
  });
});

describe("EquityPanel · axes and a11y", () => {
  it("labels the time axis in UTC house style and the value axis through formatExact", () => {
    const { container } = render(<EquityPanel label="Equity" points={series(["1000.00", "1010.00", "990.00"], "2026-10-17T08:00:00Z", 3_600_000)} />);
    const xs = [...container.querySelectorAll(".exec-c2-xaxis .exec-c2-tick")].map((t) => t.textContent ?? "");
    expect(xs.length).toBeGreaterThanOrEqual(2);
    for (const t of xs) expect(t).toMatch(/^\d{1,2} [A-Z][a-z]{2} \d{2}:\d{2}Z$/);
    const yv = [...container.querySelectorAll(".exec-c2-yaxis .exec-c2-tick")].map((t) => t.textContent ?? "");
    for (const t of yv) expect(t).toMatch(/^-?[\d,]+\.\d{2}$/);
  });

  it("has an image role with a name, a described summary and a key-readings table", () => {
    const { container } = render(<EquityPanel label="Net equity" points={BASIC} />);
    const img = screen.getByRole("img", { name: "Net equity" });
    const summary = container.querySelector(`#${img.getAttribute("aria-describedby")}`)!;
    expect(summary.textContent).toContain("4 published points from 1 Oct 00:00Z to 4 Oct 00:00Z");
    const rows = within(summary as HTMLElement).getAllByRole("row").map((r) => r.textContent);
    expect(rows.some((r) => r?.startsWith("High") && r.includes("1,020.75"))).toBe(true);
    expect(rows.some((r) => r?.startsWith("Low") && r.includes("990.25"))).toBe(true);
  });

  it("prints no dash standing in for a value", () => {
    const { container } = render(<EquityPanel label="Net equity" points={series(["1.00", null, "3.00"])} drawdown={{ kind: "absent", copy: "Not published" }} />);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/[—–]/);
    expect(text).not.toMatch(/(^|\s)-(\s|$)/);
  });
});

describe("EquityPanel · scale", () => {
  it("keeps a lone spike when 5,000 points are reduced, says so, and stays under the DOM budget", () => {
    const values = Array.from({ length: 5000 }, () => "100.00");
    values[2500] = "9000.00";
    values[3300] = "-4000.00";
    const pts = series(values, "2026-01-01T00:00:00Z", 60_000);
    const { container } = render(<EquityPanel label="Equity" points={pts} />);
    expect(screen.getByTestId("envelope").textContent).toMatch(/^Showing [\d,]+ of 5,000 points · minimum and maximum kept in every bucket of \d+ points/);
    const drawn = ys(line(container));
    expect(drawn.length).toBeLessThan(1500);
    // The spike reaches the top of the plot and the trough the bottom; a smoothed line would not.
    const top = Math.min(...drawn);
    const bottom = Math.max(...drawn);
    expect(top).toBeLessThan(28 + 0.3 * 226);
    expect(bottom).toBeGreaterThan(28 + 0.7 * 226);
    // Budget: 150 elements for any number of points (measured 108 at 5,000, 95 at 2).
    const small = render(<EquityPanel label="Equity" points={series(["1.00", "2.00"])} />).container.querySelectorAll("*").length;
    expect(container.querySelectorAll("*").length).toBeLessThan(150);
    expect(container.querySelectorAll("*").length - small).toBeLessThan(40);
    expect(container.querySelector("figure")!.getAttribute("data-reduced")).toBe("true");
    expect(container.querySelector('[data-testid="high-flag"] text')!.textContent).toBe("High 9,000.00");
  });

  it("stays under the same budget for a sparse, realistic series with 70% nulls", () => {
    const r = rng(11);
    const values = walk(5000, 4).map((v) => (r() < 0.7 ? null : v));
    const pts = series(values, "2026-01-01T00:00:00Z", 60_000);
    const { container } = render(<EquityPanel label="Equity" points={pts} drawdown={{ kind: "absent", copy: "Not published" }} />);
    expect(container.querySelectorAll("*").length).toBeLessThan(150);
    expect(container.querySelector('[data-testid="gaps"]')).not.toBeNull();
    expect(screen.getByTestId("envelope").textContent).toMatch(/gaps drawn as gaps, not joined/);
    // Still no null was drawn as a value.
    expect(ys(line(container)).every((y) => Number.isFinite(y))).toBe(true);
  });

  it("does not reduce a series that already fits and says that too", () => {
    render(<EquityPanel label="Equity" points={BASIC} />);
    expect(screen.getByTestId("envelope").textContent).toBe("4 points, none reduced");
  });

  it("repeats the server's own reduction and warns when it does not promise extrema", () => {
    const { container } = render(
      <EquityPanel label="Equity" points={BASIC} serverEnvelope={{ sourceCount: 90_000, shownCount: 4, method: "LTTB", keepsExtrema: false }} />,
    );
    // UXM07-048/4: a method the dictionary does not name reads "method not stated"; its code sits behind a disclosure, not on the line
    expect(screen.getByTestId("envelope").textContent).toContain("Server: 4 of 90,000 points, method not stated");
    expect(screen.getByTestId("envelope").textContent).not.toContain("LTTB");
    fireEvent.click(screen.getByRole("button", { name: "Reduction method" }));
    expect(screen.getByTestId("envelope").textContent).toContain("LTTB");
    expect(container.querySelector('.exec-flag[data-k="partial"]')!.textContent).toContain("server reduction does not guarantee extrema");
  });

  it("names a published reduction method in words and keeps its code in hidden text only", () => {
    const { container } = render(
      <EquityPanel label="Equity" points={BASIC} serverEnvelope={{ sourceCount: 1438, shownCount: 4, method: "PER_SERIES_BUCKET_EXTREMA", keepsExtrema: true }} />,
    );
    const line = screen.getByTestId("envelope");
    expect(line.textContent).toContain("Server: 4 of 1,438 points, min and max kept per bucket");
    expect(container.querySelector("[data-testid=envelope] .exec-c2-sr")!.textContent).toContain("PER_SERIES_BUCKET_EXTREMA");
    expect(container.querySelector(".exec-blk-why-btn")).toBeNull();
  });
});

describe("wrapLines", () => {
  const COPY = "Not published · portfolio drawdown is not in the contract yet";

  it("splits on the separator first, then on words, and concatenates back to the copy", () => {
    expect(wrapLines(COPY, 200).join("")).toBe(COPY);
    expect(wrapLines(COPY, 200)).toEqual(["Not published · ", "portfolio drawdown is not in the contract yet"]);
    for (const n of [1, 5, 12, 20, 33, 80]) expect(wrapLines(COPY, n).join("")).toBe(COPY);
  });

  it("respects the width unless a single word is longer, and never cuts a word", () => {
    const lines = wrapLines(COPY, 20);
    expect(lines.length).toBeGreaterThan(2);
    for (const l of lines) expect(l.trimEnd().length <= 20 || !l.trimEnd().includes(" ")).toBe(true);
    expect(wrapLines("supercalifragilistic", 5)).toEqual(["supercalifragilistic"]);
    expect(wrapLines("", 10)).toEqual([""]);
  });

  it("keeps a trailing space on every line but the last", () => {
    const lines = wrapLines(COPY, 20);
    lines.slice(0, -1).forEach((l) => expect(l.endsWith(" ")).toBe(true));
    expect(lines[lines.length - 1].endsWith(" ")).toBe(false);
  });
});

describe("EquityPanel · phone width (390px viewport, 340px plot)", () => {
  const COPY = "Not published";
  const REASON = "portfolio drawdown is not part of the equity contract yet, so the pane stays empty rather than derive one from the curve";

  function atWidth(w: number, run: () => void) {
    const spy = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(w);
    try {
      run();
    } finally {
      spy.mockRestore();
    }
  }

  it("keeps x tick labels a label width apart", () => {
    atWidth(340, () => {
      const pts = series(["1000.00", "1010.50", "990.25", "1020.75", "1030.00", "1040.00", "1050.00"]);
      const { container } = render(<EquityPanel label="Equity" points={pts} />);
      expect(container.querySelector("svg")!.getAttribute("width")).toBe("340");
      const ticks = [...container.querySelectorAll(".exec-c2-xaxis text")];
      expect(ticks.length).toBeGreaterThanOrEqual(1);
      const xs = ticks.map((t) => Number(t.getAttribute("x")));
      const widths = ticks.map((t) => (t.textContent ?? "").length * 6.6);
      for (let i = 1; i < xs.length; i += 1) expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual((widths[i] + widths[i - 1]) / 2 + 12);
      ticks.forEach((_t, i) => {
        expect(xs[i] - widths[i] / 2).toBeGreaterThanOrEqual(0);
        expect(xs[i] + widths[i] / 2).toBeLessThanOrEqual(340);
      });
    });
  });

  it("wraps the drawdown-absent copy into several lines with the same text, and grows the pane", () => {
    atWidth(340, () => {
      const copy = `${COPY} · ${REASON}`;
      const { container } = render(<EquityPanel label="Equity" points={BASIC} drawdown={{ kind: "absent", copy: COPY, reason: REASON }} />);
      const text = container.querySelector('[data-testid="drawdown-pane"] .exec-c2-dd-absent text')!;
      const spans = [...text.querySelectorAll("tspan")];
      expect(spans.length).toBeGreaterThan(1);
      expect(text.textContent).toBe(copy);
      const rect = container.querySelector(".exec-c2-dd-absent rect")!;
      const paneH = Number(rect.getAttribute("height"));
      expect(paneH).toBe(Math.max(84, spans.length * 14 + 24));
      expect(paneH).toBeGreaterThan(84);
      // the SVG is as tall as plot + gap + the grown pane
      expect(Number(container.querySelector("svg")!.getAttribute("height"))).toBe(280 + 22 + paneH);
      // each line fits inside the plot (iw = 340 - 156), at 6.6 px a character
      for (const sp of spans) expect((sp.textContent ?? "").trimEnd().length * 6.6).toBeLessThanOrEqual(340 - 156 - 10);
    });
  });

  it("keeps the 84 px pane and one line at the default width", () => {
    const { container } = render(<EquityPanel label="Equity" points={BASIC} drawdown={{ kind: "absent", copy: COPY }} />);
    expect(container.querySelectorAll(".exec-c2-dd-absent tspan")).toHaveLength(1);
    expect(container.querySelector(".exec-c2-dd-absent rect")!.getAttribute("height")).toBe("84");
  });
});
