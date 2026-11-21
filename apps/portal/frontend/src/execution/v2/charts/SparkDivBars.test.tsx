import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { walk } from "./chartKit";
import { DivBars } from "./DivBars";
import { Spark } from "./Spark";

afterEach(cleanup);

describe("Spark", () => {
  it("names itself from the published strings and draws one path plus an end dot", () => {
    const { container } = render(<Spark label="Net PnL, 30 days" values={["10.00", "12.50", "9.25", "14.00"]} />);
    const img = screen.getByRole("img");
    expect(img.getAttribute("aria-label")).toBe("Net PnL, 30 days: 4 points, first 10.00, last 14.00, low 9.25, high 14.00");
    expect(container.querySelectorAll("path")).toHaveLength(1);
    expect(container.querySelectorAll("circle")).toHaveLength(1);
    expect(container.querySelector("svg")!.getAttribute("width")).toBe("72");
  });

  it("breaks at a gap and counts it in the name", () => {
    const { container } = render(<Spark label="PnL" values={["1.00", null, "3.00", "4.00"]} />);
    expect(container.querySelector("path")!.getAttribute("d")!.match(/M/g)).toHaveLength(2);
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain("1 gap with no published value");
  });

  it("is a hatched box with the word, never a flat line, when nothing is drawable", () => {
    const { container } = render(<Spark label="PnL" values={[null, null]} unavailable="Not published" />);
    expect(container.querySelector("path")).toBeNull();
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe("PnL: Not published");
    expect(container.textContent).toBe("Not published");
    cleanup();
    const empty = render(<Spark label="PnL" values={[]} />);
    expect(empty.container.querySelector("path")).toBeNull();
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe("PnL: Not available");
  });

  it("refuses a number in the value slot as a gap instead of repairing it", () => {
    const { container } = render(<Spark label="PnL" values={["1.00", 2 as unknown as string, "3.00"]} />);
    expect(container.querySelector("path")!.getAttribute("d")!.match(/M/g)).toHaveLength(2);
  });

  it("keeps the extremes of a long series and stays one path", () => {
    const values = Array.from({ length: 3000 }, () => "100.00");
    values[1234] = "999.00";
    values[2222] = "-50.00";
    const { container } = render(<Spark label="PnL" values={values} />);
    expect(container.querySelectorAll("*").length).toBe(3);
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain("low -50.00, high 999.00");
    expect(container.querySelector("svg")!.getAttribute("data-reduced")).toBe("true");
    const ys = [...container.querySelector("path")!.getAttribute("d")!.matchAll(/[ML]-?[\d.]+ (-?[\d.]+)/g)].map((m) => Number(m[1]));
    expect(Math.min(...ys)).toBeLessThanOrEqual(2.1);
    expect(Math.max(...ys)).toBeGreaterThanOrEqual(15.9);
    expect(ys.length).toBeLessThan(200);
  });

  it("draws a flat published series mid-height (a real flat line, with its value in the name)", () => {
    const { container } = render(<Spark label="Cash" values={["5.00", "5.00", "5.00"]} />);
    const ys = [...container.querySelector("path")!.getAttribute("d")!.matchAll(/[ML]-?[\d.]+ (-?[\d.]+)/g)].map((m) => m[1]);
    expect(new Set(ys)).toEqual(new Set(["9"]));
    expect(screen.getByRole("img").getAttribute("aria-label")).toContain("low 5.00, high 5.00");
  });
});

describe("DivBars", () => {
  const rows = [
    { id: "a", label: "BTC-Trend", value: "5420.10" },
    { id: "b", label: "Funding-Carry", value: "-410.00" },
    { id: "c", label: "AVAX-Rev", value: null, absent: "Not published" },
    { id: "d", label: "Flat", value: "0.00" },
  ];

  it("prints the published value with its sign and puts negatives on the other side with a dashed outline", () => {
    const { container } = render(<DivBars label="Contributors" rows={rows} />);
    expect(screen.getByRole("img", { name: "Contributors" })).toBeTruthy();
    const values = [...container.querySelectorAll(".exec-div-value")].map((v) => v.textContent);
    expect(values).toEqual(["+5,420.10", "-410.00", "Not published", "0.00"]);
    const bars = [...container.querySelectorAll(".exec-div-bar")];
    expect(bars.map((b) => b.getAttribute("data-neg"))).toEqual(["false", "true", "false"]);
    const pos = bars[0];
    const neg = bars[1];
    expect(Number(pos.getAttribute("x"))).toBe(50);
    expect(Number(neg.getAttribute("x")) + Number(neg.getAttribute("width"))).toBeCloseTo(50, 5);
    // Lengths are proportional to |value|: the larger is exactly 50 units.
    expect(Number(pos.getAttribute("width"))).toBeCloseTo(50, 5);
    expect(Number(neg.getAttribute("width"))).toBeCloseTo((410 / 5420.1) * 50, 3);
  });

  it("gives an absent row no bar and the caller's copy, never zero", () => {
    const { container } = render(<DivBars label="Contributors" rows={rows} />);
    const row = container.querySelector('[data-absent="true"]')!;
    expect(row.querySelector(".exec-div-bar")).toBeNull();
    expect(row.textContent).toContain("Not published");
  });

  it("has a text alternative table", () => {
    const { container } = render(<DivBars label="Contributors" rows={rows} />);
    const img = screen.getByRole("img", { name: "Contributors" });
    const table = container.querySelector(`#${img.getAttribute("aria-describedby")}`) as HTMLElement;
    expect(within(table).getAllByRole("row")).toHaveLength(5);
    expect(table.textContent).toContain("Funding-Carry-410.00");
  });

  it("caps rows and says how many were not drawn", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ id: `r${i}`, label: `Row ${i}`, value: `${i + 1}.00` }));
    const { container } = render(<DivBars label="Contributors" rows={many} maxRows={10} total={214} />);
    expect(container.querySelectorAll(".exec-div-row")).toHaveLength(10);
    expect(screen.getByText("Showing 10 of 214 rows")).toBeTruthy();
  });

  it("renders the unavailable and empty states instead of an empty plot", () => {
    const { container } = render(<DivBars label="Contributors" rows={rows} state={{ kind: "unavailable", copy: "Not published", reason: "No attribution source" }} />);
    expect(container.querySelector(".exec-div-bar")).toBeNull();
    expect(screen.getByText("No attribution source")).toBeTruthy();
    cleanup();
    render(<DivBars label="Contributors" rows={[{ id: "x", label: "X", value: null }]} />);
    expect(screen.getByText("No published value in these rows.")).toBeTruthy();
  });

  it("wears a Flag for partial data and shows no dash in place of a value", () => {
    const { container } = render(<DivBars label="Contributors" rows={rows} state={{ kind: "partial", reason: "Venue B missing" }} />);
    expect(container.querySelector('.exec-flag[data-k="partial"]')!.textContent).toContain("Venue B missing");
    expect(container.textContent).not.toMatch(/[—–]/);
  });

  it("handles a large magnitude spread without a NaN bar", () => {
    const spread = walk(12, 5, 0, 1).map((v, i) => ({ id: `s${i}`, label: `S${i}`, value: i % 2 ? `-${Math.abs(Number(v)).toFixed(2)}` : Math.abs(Number(v) * 1000).toFixed(2) }));
    const { container } = render(<DivBars label="Contributors" rows={spread} />);
    for (const b of container.querySelectorAll(".exec-div-bar")) expect(Number.isFinite(Number(b.getAttribute("width")))).toBe(true);
  });
});
