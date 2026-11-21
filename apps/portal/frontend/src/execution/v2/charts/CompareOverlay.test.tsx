import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { epoch, series, walk } from "./chartKit";
import { CompareOverlay } from "./CompareOverlay";
import { rebaseToFirst } from "./rebase";

afterEach(cleanup);

const core = series(["0.00", "0.50", "1.20", "1.60"]);
const sat = series(["0.00", "1.00", "-0.40", "9.70"]);
const BASIS = "Return since window start, Modified Dietz, USDT";

describe("rebaseToFirst", () => {
  it("subtracts the first published value exactly and keeps gaps", () => {
    const out = rebaseToFirst(series([null, "1000.10", "1000.40", null, "999.90"]));
    expect(out.map((p) => p.v)).toEqual([null, "0.00", "0.30", null, "-0.20"]);
  });
  it("leaves unreadable points untouched", () => {
    const pts = series(["10.00", "11.50"]);
    const out = rebaseToFirst([pts[0], { t: pts[1].t, v: 11.5 as unknown as string }]);
    expect(out[1].v).toBe(11.5);
  });
});

describe("CompareOverlay", () => {
  const base = { label: "Compare returns", basis: BASIS };

  it("overlays series with distinct colour, dash, marker and an end tag carrying the name and value", () => {
    const { container } = render(<CompareOverlay {...base} series={[{ id: "core", label: "Core", points: core }, { id: "sat", label: "Satellite", points: sat }]} />);
    const lines = [...container.querySelectorAll('[data-testid="compare-line"]')];
    expect(lines.map((l) => l.getAttribute("data-s"))).toEqual(["series", "series-2"]);
    expect(lines[0].getAttribute("stroke-dasharray")).toBeNull();
    expect(lines[1].getAttribute("stroke-dasharray")).toBe("10 4");
    const tags = [...container.querySelectorAll('[data-testid="end-tag"] text')].map((t) => t.textContent);
    // Tags are listed top to bottom on the page: the larger value sits higher.
    expect(tags).toEqual(["Satellite  +9.70%", "Core  +1.60%"]);
    expect(container.querySelectorAll(".exec-c2-marker circle, .exec-c2-marker rect, .exec-c2-marker polygon")).toHaveLength(2);
  });

  it("states its basis and what was reduced", () => {
    render(<CompareOverlay {...base} series={[{ id: "core", label: "Core", points: core }]} />);
    expect(screen.getByTestId("basis").textContent).toBe(`Basis: ${BASIS}`);
    expect(screen.getByTestId("envelope").textContent).toBe("4 points, none reduced");
  });

  it("reads every series at the cursor, exact, and says where a series has no point", () => {
    const short = series(["0.00", "2.00"]);
    render(<CompareOverlay {...base} series={[{ id: "core", label: "Core", points: core }, { id: "short", label: "Short", points: short }]} />);
    const vals = () => screen.getAllByTestId("compare-value").map((v) => v.textContent);
    expect(vals()).toEqual(["+1.60%", "No point at this time"]);
    const group = screen.getByRole("group", { name: /Compare returns/ });
    fireEvent.keyDown(group, { key: "Home" });
    expect(vals()).toEqual(["0.00%", "0.00%"]);
    fireEvent.keyDown(group, { key: "ArrowRight" });
    expect(vals()).toEqual(["+0.50%", "+2.00%"]);
    fireEvent.keyDown(group, { key: "ArrowRight" });
    expect(vals()).toEqual(["+1.20%", "No point at this time"]);
    expect(screen.getByRole("status").textContent).toBe("3 Oct 00:00Z. Core 1.20. Short no point");
    fireEvent.keyDown(group, { key: "Escape" });
    expect(vals()).toEqual(["+1.60%", "No point at this time"]);
  });

  it("partitions what cannot be compared: listed, hatched, flagged, never plotted", () => {
    const { container } = render(
      <CompareOverlay
        {...base}
        series={[{ id: "core", label: "Core", points: core }, { id: "sat", label: "Satellite", points: sat }]}
        notComparable={[{ id: "jpy", label: "Yen-Carry", reason: "Other currency" }, { id: "bas", label: "Basis-Arb", reason: "Return not available" }]}
      />,
    );
    const items = screen.getAllByTestId("not-comparable");
    expect(items.map((i) => i.textContent)).toEqual([
      expect.stringContaining("Yen-Carry"),
      expect.stringContaining("Basis-Arb"),
    ]);
    expect(items[0].textContent).toContain("Other currency");
    expect(items[0].querySelector('.exec-flag[data-k="na"]')!.textContent).toContain("Not comparable");
    expect(items[0].querySelector('.exec-c2-sw[data-hatch="true"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-testid="compare-line"]')).toHaveLength(2);
  });

  it("moves a series with nothing drawable, or a fifth series, into the same partition with its own reason", () => {
    const five = ["a", "b", "c", "d", "e"].map((id, i) => ({ id, label: id.toUpperCase(), points: series([`${i}.00`, `${i + 1}.00`]) }));
    const { container } = render(<CompareOverlay {...base} series={[...five, { id: "z", label: "Z", points: series([null, null]) }]} />);
    expect(container.querySelectorAll('[data-testid="compare-line"]')).toHaveLength(4);
    const items = screen.getAllByTestId("not-comparable").map((i) => i.textContent ?? "");
    expect(items[0]).toContain("Only 4 series fit the palette");
    expect(items[1]).toContain("No published value in this window");
  });

  it("is an explicit unavailable state, still listing what was excluded, never an empty plot", () => {
    const { container } = render(
      <CompareOverlay {...base} series={[]} state={{ kind: "unavailable", copy: "Not available", reason: "Source not qualified" }} notComparable={[{ id: "x", label: "X", reason: "Other currency" }]} />,
    );
    expect(screen.getByText("Source not qualified")).toBeTruthy();
    expect(container.querySelector("svg")).toBeNull();
    expect(screen.getAllByTestId("not-comparable")).toHaveLength(1);
    cleanup();
    render(<CompareOverlay {...base} series={[]} />);
    expect(screen.getByText("No series can be drawn on one basis.")).toBeTruthy();
  });

  it("wears a Flag when partial or stale", () => {
    const { container } = render(<CompareOverlay {...base} series={[{ id: "core", label: "Core", points: core }]} state={{ kind: "stale", reason: "Satellite last synced 16 Oct 09:14Z" }} />);
    expect(container.querySelector('.exec-flag[data-k="stale"]')!.textContent).toContain("Satellite last synced 16 Oct 09:14Z");
    expect(container.querySelectorAll('[data-testid="compare-line"]')).toHaveLength(1);
  });

  it("separates end tags that would collide by at least 24 px", () => {
    const pts = (end: string) => series(["0.00", end]);
    const { container } = render(
      <CompareOverlay {...base} series={[{ id: "a", label: "A", points: pts("1.00") }, { id: "b", label: "B", points: pts("1.01") }, { id: "c", label: "C", points: pts("1.02") }]} />,
    );
    const ys = [...container.querySelectorAll('[data-testid="end-tag"] .exec-c2-endbox')].map((r) => Number(r.getAttribute("y"))).sort((a, b) => a - b);
    expect(ys[1] - ys[0]).toBeGreaterThanOrEqual(24);
    expect(ys[2] - ys[1]).toBeGreaterThanOrEqual(24);
  });

  it("keeps gaps as gaps in every series and reduces long ones with the extrema kept", () => {
    const a = series(walk(4000, 1, 0, 2), "2026-01-01T00:00:00Z", 60_000).map((p, i) => (i % 500 === 499 ? { ...p, v: null } : p));
    const spike = series(Array.from({ length: 4000 }, () => "1.00"), "2026-01-01T00:00:00Z", 60_000);
    spike[2000] = { ...spike[2000], v: "500.00" };
    const { container } = render(<CompareOverlay {...base} series={[{ id: "a", label: "A", points: a }, { id: "b", label: "B", points: spike }]} unit="money" />);
    expect(container.querySelectorAll("*").length).toBeLessThan(160);
    expect(screen.getByTestId("envelope").textContent).toMatch(/^Showing [\d,]+ of 7,992 points · minimum and maximum kept/);
    expect(screen.getByTestId("envelope").textContent).toMatch(/gaps drawn as gaps/);
    const dB = container.querySelectorAll('[data-testid="compare-line"]')[1].getAttribute("d")!;
    const ys = [...dB.matchAll(/[ML]-?[\d.]+ (-?[\d.]+)/g)].map((m) => Number(m[1]));
    expect(Math.min(...ys)).toBeLessThan(16 + 0.25 * 286);
  });

  it("has an image role, a name, a described summary table and no dash standing in for a value", () => {
    const { container } = render(<CompareOverlay {...base} series={[{ id: "core", label: "Core", points: core }, { id: "sat", label: "Satellite", points: sat }]} />);
    const img = screen.getByRole("img", { name: "Compare returns, Core, Satellite" });
    const summary = container.querySelector(`#${img.getAttribute("aria-describedby")}`)!;
    expect(summary.textContent).toContain(`Basis: ${BASIS}`);
    expect(summary.textContent).toContain("Satellite");
    expect(summary.textContent).toContain("+9.70%");
    expect(container.textContent).not.toMatch(/[—–]/);
  });

  it("refuses an unordered series to the partition instead of drawing a tangle", () => {
    const o = series(["1.00", "2.00", "3.00"]);
    render(<CompareOverlay {...base} series={[{ id: "core", label: "Core", points: core }, { id: "bad", label: "Bad", points: [o[1], o[0], o[2]] }]} />);
    expect(screen.getByTestId("not-comparable").textContent).toContain("not in strictly increasing time order");
  });

  it("honours a shared domain", () => {
    const { container } = render(<CompareOverlay {...base} series={[{ id: "core", label: "Core", points: core }]} domain={{ from: epoch(Date.parse("2026-09-01T00:00:00Z")), to: epoch(Date.parse("2026-10-04T00:00:00Z")) }} />);
    expect(container.querySelector(".exec-c2-xaxis")).not.toBeNull();
  });
});

describe("CompareOverlay axis and end tags for a level (WP-C)", () => {
  const levels = [
    { id: "a", label: "Satellite", points: series(["74000.00", "74500.00", "74901.60", "74754.00"]) },
    { id: "b", label: "Basis Book 06", points: series(["42500.75", "42800.00", "42689.91", "42973.65"]) },
  ];

  it("a level (signed off) is scaled to its own range: the axis does not stretch down to zero", () => {
    const { container } = render(<CompareOverlay label="NAV" basis="NAV in USDT" series={levels} unit="money" currency="USDT" signed={false} />);
    const ticks = [...container.querySelectorAll("svg text")].map((t) => t.textContent ?? "").filter((t) => /^[\d,]+\.\d\d$/.test(t)).map((t) => Number(t.replace(/,/g, "")));
    expect(ticks.length).toBeGreaterThan(2);
    expect(Math.min(...ticks)).toBeGreaterThanOrEqual(30000);
  });

  it("a signed series keeps its zero line in view", () => {
    const { container } = render(<CompareOverlay label="Net PnL" basis="Net PnL in USDT" series={levels.map((l) => ({ ...l, points: series(["10.00", "20.00", "30.00", "40.00"]) }))} unit="money" currency="USDT" signed />);
    const ticks = [...container.querySelectorAll("svg text")].map((t) => t.textContent ?? "").filter((t) => /^[+-]?[\d,]+\.\d\d$/.test(t));
    expect(ticks.some((t) => /^0\.00$/.test(t))).toBe(true);
  });

  it("the right margin grows to hold the longest end tag (a money tag carries its currency), so the tag is not cut off", () => {
    const { container } = render(<CompareOverlay label="NAV" basis="NAV in USDT" series={levels} unit="money" currency="USDT" signed={false} />);
    const svg = container.querySelector("svg.exec-c2-svg") as SVGElement;
    const width = Number(svg.getAttribute("width"));
    for (const box of container.querySelectorAll('[data-testid="end-tag"] rect')) {
      const right = Number(box.getAttribute("x")) + Number(box.getAttribute("width"));
      expect(right).toBeLessThanOrEqual(width);
    }
  });
});
