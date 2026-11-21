import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { epoch, series } from "./chartKit";
import { chartTableModel } from "./chartTable";
import { ChartTools } from "./ChartTools";
import { EquityPanel } from "./EquityPanel";

afterEach(cleanup);

const days = (n: number, base = 1000) => series(Array.from({ length: n }, (_, i) => (base + i).toFixed(2)));
const col = (points = days(4), extra = {}) => ({ key: "eq", label: "Net equity", points, currency: "USDT", ...extra });
const expandBtn = () => screen.getByRole("button", { name: /^(Expand|Reduce) / });
const tableBtn = () => screen.getByRole("button", { name: /^Table, / });
const bodyRows = () => [...document.querySelectorAll(".exec-ct-tbl tbody tr")];

describe("chartTableModel · the same published points", () => {
  it("lists every point newest first with the exact string behind each printed value", () => {
    const pts = series(["1000.00", null, "1020.75", "123456789.1234567891"]);
    const m = chartTableModel([{ key: "a", label: "A", points: pts, currency: "USDT" }]);
    expect(m.ordered).toBe(true);
    expect(m.total).toBe(4);
    expect([0, 1, 2, 3].map((i) => m.timeAt(i))).toEqual([...pts].reverse().map((p) => p.t));
    expect([0, 1, 2, 3].map((i) => m.cellsAt(i)[0])).toEqual([
      { text: "123,456,789.1235 USDT", exact: "123456789.1234567891" },
      { text: "1,020.75 USDT", exact: "1020.75" },
      { text: "No published value", exact: null },
      { text: "1,000.00 USDT", exact: "1000.00" },
    ]);
  });

  it("says unreadable for a value the boundary refuses, never a number", () => {
    const pts = [...days(2), { t: epoch(Date.parse("2026-10-03T00:00:00Z")), v: 12.5 as unknown as string }];
    expect(chartTableModel([{ key: "a", label: "A", points: pts }]).cellsAt(0)[0]).toEqual({ text: "Unreadable value", exact: null });
  });

  it("puts series side by side on the union of instants and never fills a missing one", () => {
    const a = series(["1.00", "2.00", "3.00"]);
    const b = series(["10.00", "20.00"], "2026-10-02T00:00:00Z");
    const m = chartTableModel([{ key: "a", label: "A", points: a, unit: "pct" }, { key: "b", label: "B", points: b, unit: "pct" }]);
    expect(m.total).toBe(3);
    expect([0, 1, 2].map((i) => m.cellsAt(i).map((c) => c.text))).toEqual([
      ["3.00%", "20.00%"],
      ["2.00%", "10.00%"],
      ["1.00%", "No point at this time"],
    ]);
  });

  it("refuses a series out of time order", () => {
    const bad = [{ t: epoch(2), v: "1.00" }, { t: epoch(1), v: "2.00" }];
    expect(chartTableModel([{ key: "a", label: "A", points: bad }]).ordered).toBe(false);
  });
});

describe("ChartTools · Table", () => {
  it("offers no Table without published points, but still offers Expand", () => {
    render(<ChartTools label="Net equity"><div>chart</div></ChartTools>);
    expect(screen.queryByRole("button", { name: /^Table/ })).toBeNull();
    expect(expandBtn()).toBeTruthy();
  });

  it("shows the points the chart draws as rows, newest first, in a named focusable region", () => {
    const pts = days(4);
    render(<ChartTools label="Net equity" columns={[col(pts)]}><EquityPanel label="Net equity" points={pts} currency="USDT" /></ChartTools>);
    expect(tableBtn().getAttribute("aria-pressed")).toBe("false");
    expect(bodyRows()).toHaveLength(0);
    fireEvent.click(tableBtn());
    expect(tableBtn().getAttribute("aria-pressed")).toBe("true");
    const region = screen.getByRole("region", { name: "Net equity, table" });
    expect(region.getAttribute("tabindex")).toBe("0");
    expect(bodyRows().map((r) => [...r.querySelectorAll("th,td")].map((c) => c.textContent))).toEqual([
      ["4 Oct 00:00Z", "1,003.00 USDT"],
      ["3 Oct 00:00Z", "1,002.00 USDT"],
      ["2 Oct 00:00Z", "1,001.00 USDT"],
      ["1 Oct 00:00Z", "1,000.00 USDT"],
    ]);
    expect(within(region).getByRole("columnheader", { name: "Time (UTC)" }).getAttribute("aria-sort")).toBe("descending");
    expect(within(region).getByRole("columnheader", { name: "Net equity" })).toBeTruthy();
    expect(bodyRows()[0].querySelector("td")!.getAttribute("title")).toBe("1003.00");
    expect(screen.getByTestId("table-count").textContent).toBe("Showing 4 of 4 rows");
    expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
    // The chart is still there, untouched.
    expect(screen.getByTestId("readout-value").textContent).toBe("1,003.00 USDT");
    fireEvent.click(tableBtn());
    expect(bodyRows()).toHaveLength(0);
  });

  it("caps the rows honestly and lets the reader see more a page at a time, up to the bound", () => {
    render(<ChartTools label="Equity" columns={[col(days(130))]} pageRows={50} maxRows={120}><div>chart</div></ChartTools>);
    fireEvent.click(tableBtn());
    expect(bodyRows()).toHaveLength(50);
    expect(screen.getByTestId("table-count").textContent).toBe("Showing 50 of 130 rows");
    fireEvent.click(screen.getByRole("button", { name: "Show more" }));
    expect(bodyRows()).toHaveLength(100);
    expect(screen.getByTestId("table-count").textContent).toBe("Showing 100 of 130 rows");
    fireEvent.click(screen.getByRole("button", { name: "Show more" }));
    expect(bodyRows()).toHaveLength(120);
    expect(screen.getByTestId("table-count").textContent).toBe("Showing 120 of 130 rows");
    expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("region", { name: "Equity, table" }));
  });

  it("keeps a 5,000-point table to a bounded number of rows", () => {
    render(<ChartTools label="Equity" columns={[col(days(5000))]}><div>chart</div></ChartTools>);
    fireEvent.click(tableBtn());
    expect(bodyRows().length).toBeLessThanOrEqual(50);
    expect(screen.getByTestId("table-count").textContent).toBe("Showing 50 of 5,000 rows");
  });

  it("states a series that is out of order instead of printing rows", () => {
    const bad = [{ t: epoch(2), v: "1.00" }, { t: epoch(1), v: "2.00" }];
    render(<ChartTools label="Equity" columns={[col(bad)]}><div>chart</div></ChartTools>);
    fireEvent.click(tableBtn());
    expect(bodyRows()).toHaveLength(0);
    expect(document.body.textContent).toContain("Not shown: the points are not in strictly increasing time order");
  });
});

describe("ChartTools · Expand", () => {
  const mount = () => render(
    <>
      <button type="button">before</button>
      <ChartTools label="Net equity" columns={[col()]}><EquityPanel label="Net equity" points={days(4)} currency="USDT" /></ChartTools>
      <button type="button">after</button>
    </>,
  );

  it("becomes a named modal dialog over a scrim, keeps the same chart mounted, and Reduce puts it back", () => {
    mount();
    const plot = screen.getByRole("group", { name: /Net equity.*arrow keys/ });
    fireEvent.keyDown(plot, { key: "Home" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(expandBtn().getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(expandBtn());
    const dialog = screen.getByRole("dialog", { name: "Net equity" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(screen.getByTestId("chart-scrim")).toBeTruthy();
    expect(document.activeElement).toBe(dialog);
    expect(expandBtn().getAttribute("aria-expanded")).toBe("true");
    expect(expandBtn().textContent).toBe("Reduce");
    // Same plot element, same readout: nothing remounted.
    expect(screen.getByRole("group", { name: /Net equity.*arrow keys/ })).toBe(plot);
    expect(screen.getByTestId("readout-time").textContent).toBe("1 Oct 00:00Z");
    fireEvent.click(expandBtn());
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByTestId("chart-scrim")).toBeNull();
    expect(document.activeElement).toBe(expandBtn());
  });

  it("Expand gives the equity plot height as well as width, and Reduce returns it to its own height", () => {
    mount();
    const plotHeight = () => Number(document.querySelector<SVGSVGElement>(".exec-c2-plot svg, svg[viewBox]")?.getAttribute("height") ?? "0");
    const before = plotHeight();
    fireEvent.click(expandBtn());
    expect(plotHeight()).toBeGreaterThan(before);
    fireEvent.click(expandBtn());
    expect(plotHeight()).toBe(before);
  });

  it("Esc closes it and focus returns to the trigger, also when the key is pressed in the plot", () => {
    mount();
    fireEvent.click(expandBtn());
    const plot = screen.getByRole("group", { name: /Net equity.*arrow keys/ });
    plot.focus();
    fireEvent.keyDown(plot, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(expandBtn());
    fireEvent.click(expandBtn());
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(expandBtn());
  });

  it("a click on the scrim closes it", () => {
    mount();
    fireEvent.click(expandBtn());
    fireEvent.click(screen.getByTestId("chart-scrim"));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(expandBtn());
  });

  it("traps Tab inside while expanded", () => {
    mount();
    fireEvent.click(expandBtn());
    fireEvent.click(tableBtn());
    const dialog = screen.getByRole("dialog");
    const items = [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]), [tabindex]:not([tabindex="-1"])')];
    const first = items[0];
    const last = items[items.length - 1];
    last.focus();
    fireEvent.keyDown(last, { key: "Tab" });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
    // The table region is one of the stops, so a phone reaches the scrolled columns.
    expect(items).toContain(screen.getByRole("region", { name: "Net equity, table" }));
  });

  it("releases the page scroll lock it took", () => {
    mount();
    fireEvent.click(expandBtn());
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.click(expandBtn());
    expect(document.body.style.overflow).toBe("");
  });

  it("an expanded chart that unmounts leaves the page usable", () => {
    const { unmount } = mount();
    fireEvent.click(expandBtn());
    unmount();
    expect(document.body.style.overflow).toBe("");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
