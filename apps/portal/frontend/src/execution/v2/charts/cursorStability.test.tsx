/**
 * RV-04 · the readout cursor must survive a change of series (window, metric, data, subjects) without
 * dereferencing a stale ordinal. Rule under test: keep the SAME INSTANT when the new series has it; else snap to
 * the nearest point when the instant lies inside the new series' extent (earlier point on a tie); else release
 * the cursor back to the latest point. The live region is derived from the series on screen, never stored.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { DAY, epoch, series } from "./chartKit";
import { CompareOverlay } from "./CompareOverlay";
import { EquityPanel } from "./EquityPanel";
import { resolveCursor } from "./model";

afterEach(cleanup);

const days = (n: number, start = "2026-10-01T00:00:00Z", base = 1000) => series(Array.from({ length: n }, (_, i) => (base + i).toFixed(2)), start);
const group = (name: RegExp) => screen.getByRole("group", { name });
const time = () => screen.getByTestId("readout-time").textContent;
const value = () => screen.getByTestId("readout-value").textContent;
const status = () => screen.getByRole("status").textContent;
const press = (g: HTMLElement, key: string, n = 1, shiftKey = false) => { for (let i = 0; i < n; i += 1) fireEvent.keyDown(g, { key, shiftKey }); };

describe("resolveCursor", () => {
  const times = [10, 20, 40];
  it("keeps the same instant, snaps inside the extent (earlier on a tie), releases outside, and never indexes out of range", () => {
    expect(resolveCursor(times, 20)).toBe(1);
    expect(resolveCursor(times, 30)).toBe(1);
    expect(resolveCursor(times, 35)).toBe(2);
    expect(resolveCursor(times, 9)).toBeNull();
    expect(resolveCursor(times, 41)).toBeNull();
    expect(resolveCursor(times, null)).toBeNull();
    expect(resolveCursor([], 20)).toBeNull();
    expect(resolveCursor(times, Number.NaN)).toBeNull();
  });
});

describe("EquityPanel · the cursor follows the instant, not the ordinal", () => {
  it("long to short with the cursor pinned past the new end: no crash, released to the latest point", () => {
    const { rerender } = render(<EquityPanel label="Equity" points={days(40)} />);
    const g = group(/Equity/);
    press(g, "ArrowLeft", 4);
    expect(time()).toBe("5 Nov 00:00Z");
    expect(() => rerender(<EquityPanel label="Equity" points={days(10)} />)).not.toThrow();
    expect(time()).toBe("10 Oct 00:00Z");
    expect(value()).toBe("1,009.00");
    expect(document.querySelector('[data-testid="cursor"]')).toBeNull();
    expect(status()).toBe("");
  });

  it("window change that still holds the instant keeps the readout on that instant", () => {
    const { rerender } = render(<EquityPanel label="Equity" points={days(40)} />);
    const g = group(/Equity/);
    press(g, "Home");
    press(g, "ArrowRight", 4);
    expect(time()).toBe("5 Oct 00:00Z");
    rerender(<EquityPanel label="Equity" points={days(15, "2026-10-03T00:00:00Z", 2000)} />);
    expect(time()).toBe("5 Oct 00:00Z");
    expect(value()).toBe("2,002.00");
    expect(document.querySelector('[data-testid="cursor"]')).not.toBeNull();
  });

  it("an instant the new series skips but spans snaps to the nearest earlier point", () => {
    const { rerender } = render(<EquityPanel label="Equity" points={days(10)} />);
    const g = group(/Equity/);
    press(g, "Home");
    press(g, "ArrowRight", 3);
    expect(time()).toBe("4 Oct 00:00Z");
    const odd = series(["1.00", "3.00", "5.00", "7.00"], "2026-10-01T00:00:00Z", 2 * DAY);
    rerender(<EquityPanel label="Equity" points={odd} />);
    expect(time()).toBe("3 Oct 00:00Z");
    expect(value()).toBe("3.00");
  });

  it("a later window that no longer contains the instant releases the cursor", () => {
    const { rerender } = render(<EquityPanel label="Equity" points={days(10)} />);
    const g = group(/Equity/);
    press(g, "Home");
    expect(time()).toBe("1 Oct 00:00Z");
    rerender(<EquityPanel label="Equity" points={days(5, "2026-10-20T00:00:00Z")} />);
    expect(time()).toBe("24 Oct 00:00Z");
    expect(document.querySelector('[data-testid="cursor"]')).toBeNull();
  });

  it("metric change (unit and values) keeps the instant and prints the new value", () => {
    const { rerender } = render(<EquityPanel label="Equity" points={days(12)} unit="money" currency="USDT" />);
    const g = group(/Equity/);
    press(g, "Home");
    press(g, "ArrowRight", 6);
    expect(time()).toBe("7 Oct 00:00Z");
    rerender(<EquityPanel label="Return" points={series(["0.10", "0.20", "0.30", "0.40", "0.50", "0.60", "0.70"])} unit="pct" signed />);
    expect(time()).toBe("7 Oct 00:00Z");
    expect(value()).toBe("+0.70%");
  });

  it("keyboard-driven: after the data is replaced the next key continues from the resolved point", () => {
    const { rerender } = render(<EquityPanel label="Equity" points={days(40)} />);
    const g = group(/Equity/);
    press(g, "Home");
    press(g, "ArrowRight", 8);
    expect(time()).toBe("9 Oct 00:00Z");
    rerender(<EquityPanel label="Equity" points={days(12, "2026-10-01T00:00:00Z", 3000)} />);
    expect(time()).toBe("9 Oct 00:00Z");
    press(g, "ArrowRight");
    expect(time()).toBe("10 Oct 00:00Z");
    expect(status()).toBe("10 Oct 00:00Z, 3,009.00");
    press(g, "End");
    expect(time()).toBe("12 Oct 00:00Z");
    press(g, "ArrowRight", 3);
    expect(time()).toBe("12 Oct 00:00Z");
  });

  it("the live region is derived from the series on screen: replaced values are re-said, a released cursor says nothing", () => {
    const { rerender } = render(<EquityPanel label="Equity" points={days(10)} />);
    const g = group(/Equity/);
    press(g, "Home");
    press(g, "ArrowRight", 2);
    expect(status()).toBe("3 Oct 00:00Z, 1,002.00");
    rerender(<EquityPanel label="Equity" points={days(10, "2026-10-01T00:00:00Z", 5000)} />);
    expect(status()).toBe("3 Oct 00:00Z, 5,002.00");
    rerender(<EquityPanel label="Equity" points={days(2)} />);
    expect(status()).toBe("");
  });

  it("pointer-pinned cursor survives a shorter series without a throw", () => {
    const { rerender } = render(<EquityPanel label="Equity" points={days(40)} />);
    const g = group(/Equity/);
    fireEvent.mouseMove(g, { clientX: 60 + 622 });
    expect(time()).toBe("9 Nov 00:00Z");
    expect(() => rerender(<EquityPanel label="Equity" points={days(3)} />)).not.toThrow();
    expect(time()).toBe("3 Oct 00:00Z");
    fireEvent.mouseMove(g, { clientX: 60 });
    expect(time()).toBe("1 Oct 00:00Z");
  });

  it("survives data replaced by nothing and back, and an unordered series", () => {
    const { rerender } = render(<EquityPanel label="Equity" points={days(20)} />);
    const g = group(/Equity/);
    press(g, "Home");
    press(g, "ArrowRight", 7);
    expect(() => rerender(<EquityPanel label="Equity" points={[]} />)).not.toThrow();
    expect(() => rerender(<EquityPanel label="Equity" points={days(4)} />)).not.toThrow();
    expect(time()).toBe("4 Oct 00:00Z");
    const bad = [{ t: epoch(Date.parse("2026-10-02T00:00:00Z")), v: "1.00" }, { t: epoch(Date.parse("2026-10-01T00:00:00Z")), v: "2.00" }];
    expect(() => rerender(<EquityPanel label="Equity" points={bad} />)).not.toThrow();
  });

  it("a series that grows at the front keeps the readout on the same instant (an ordinal would have moved)", () => {
    const { rerender } = render(<EquityPanel label="Equity" points={days(10, "2026-10-10T00:00:00Z")} />);
    const g = group(/Equity/);
    press(g, "Home");
    press(g, "ArrowRight", 2);
    expect(time()).toBe("12 Oct 00:00Z");
    rerender(<EquityPanel label="Equity" points={days(20, "2026-10-01T00:00:00Z")} />);
    expect(time()).toBe("12 Oct 00:00Z");
  });
});

describe("CompareOverlay · subjects added and removed", () => {
  const base = { label: "Compare returns", basis: "Return since window start, USDT" };
  const mk = (id: string, n: number, start = "2026-10-01T00:00:00Z") => ({ id, label: id.toUpperCase(), points: series(Array.from({ length: n }, (_, i) => (i / 10).toFixed(2)), start) });
  const readoutTime = () => document.querySelector(".exec-c2-readout .exec-c2-ru")!.textContent;

  it("removing the long subject while the cursor is pinned past the new end: no crash, released to latest", () => {
    const { rerender } = render(<CompareOverlay {...base} series={[mk("a", 40), mk("b", 5)]} />);
    const g = group(/Compare returns/);
    press(g, "End");
    press(g, "ArrowLeft", 3);
    expect(() => rerender(<CompareOverlay {...base} series={[mk("b", 5)]} />)).not.toThrow();
    expect(readoutTime()).toBe("5 Oct 00:00Z");
    expect(screen.getAllByTestId("compare-value").map((v) => v.textContent)).toEqual(["+0.40%"]);
    expect(document.querySelector('[data-testid="cursor"]')).toBeNull();
    expect(status()).toBe("");
  });

  it("adding a subject that starts earlier keeps the readout on the same instant", () => {
    const { rerender } = render(<CompareOverlay {...base} series={[mk("a", 10, "2026-10-10T00:00:00Z")]} />);
    const g = group(/Compare returns/);
    press(g, "Home");
    press(g, "ArrowRight", 2);
    expect(readoutTime()).toBe("12 Oct 00:00Z");
    rerender(<CompareOverlay {...base} series={[mk("a", 10, "2026-10-10T00:00:00Z"), mk("b", 20, "2026-10-01T00:00:00Z")]} />);
    expect(readoutTime()).toBe("12 Oct 00:00Z");
    expect(screen.getAllByTestId("compare-value").map((v) => v.textContent)).toEqual(["+0.20%", "+1.10%"]);
  });

  it("keyboard-driven across removal: the next key continues from the resolved instant and the status is re-said", () => {
    const { rerender } = render(<CompareOverlay {...base} series={[mk("a", 30), mk("b", 8)]} />);
    const g = group(/Compare returns/);
    press(g, "Home");
    press(g, "ArrowRight", 2);
    expect(status()).toBe("3 Oct 00:00Z. A 0.20. B 0.20");
    rerender(<CompareOverlay {...base} series={[mk("b", 8)]} />);
    expect(status()).toBe("3 Oct 00:00Z. B 0.20");
    press(g, "ArrowRight");
    expect(readoutTime()).toBe("4 Oct 00:00Z");
    press(g, "End");
    press(g, "ArrowRight", 4);
    expect(readoutTime()).toBe("8 Oct 00:00Z");
  });

  it("every subject removed or moved off the axis does not throw", () => {
    const { rerender } = render(<CompareOverlay {...base} series={[mk("a", 20)]} />);
    press(group(/Compare returns/), "End");
    expect(() => rerender(<CompareOverlay {...base} series={[]} />)).not.toThrow();
    expect(() => rerender(<CompareOverlay {...base} series={[mk("c", 3, "2026-12-01T00:00:00Z")]} />)).not.toThrow();
    expect(readoutTime()).toBe("3 Dec 00:00Z");
  });
});
