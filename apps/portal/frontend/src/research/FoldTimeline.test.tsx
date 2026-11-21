import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { FoldTimeline, foldsFromPlanned, foldTitle, type FoldTimelineFold, type FoldTimelineProps } from "./FoldTimeline";

afterEach(cleanup);

const H = 3_600_000;
const T0 = Date.parse("2026-08-02T23:00:00Z");

function folds(n: number): FoldTimelineFold[] {
  return Array.from({ length: n }, (_, i) => ({
    ordinal: i + 1,
    trainStartUtcMs: T0,
    trainEndUtcMs: T0 + (720 + i * 48) * H,
    oosStartUtcMs: T0 + (720 + i * 48) * H,
    oosEndUtcMs: T0 + (768 + i * 48) * H,
    trainBars: 720 + i * 48,
    oosBars: 48,
  }));
}
const base = (over: Partial<FoldTimelineProps> = {}): FoldTimelineProps => ({ folds: folds(5), windowMode: "expanding", status: "served", ...over });
const region = () => screen.getByRole("group", { name: "Outer folds" });
const live = () => screen.getByRole("status").textContent;
const readout = () => document.querySelector("[data-fold-readout]")?.textContent;

describe("FoldTimeline", () => {
  it.each([1, 5, 16])("draws %i actual folds with one count label", (n) => {
    render(<FoldTimeline {...base({ folds: folds(n) })} />);
    expect(document.querySelectorAll("[data-fold-row]:not([data-fold-row=span])")).toHaveLength(n);
    expect(screen.getAllByText(new RegExp(`^${n} ${n === 1 ? "fold" : "folds"} · expanding`))).toHaveLength(1);
    expect(document.querySelectorAll("[data-chart-table] tbody tr")).toHaveLength(n);
  });

  it("is one tab stop; arrows move between folds; live text equals the readout and the title", () => {
    render(<FoldTimeline {...base()} />);
    expect(region().getAttribute("tabindex")).toBe("0");
    expect(region().querySelectorAll("[tabindex],button,a,input")).toHaveLength(0);
    expect(document.querySelectorAll("[tabindex='0']")).toHaveLength(1);
    fireEvent.keyDown(region(), { key: "ArrowRight" });
    const first = folds(5)[0]!;
    expect(live()).toBe(foldTitle(first));
    expect(readout()).toBe(foldTitle(first));
    expect(live()).toBe("Fold 1 · train 2026-08-02 23:00 UTC → 2026-09-01 23:00 UTC (720 bars) · OOS 2026-09-01 23:00 UTC → 2026-09-03 23:00 UTC (48 bars)");
    fireEvent.keyDown(region(), { key: "ArrowRight" });
    expect(live()).toBe(foldTitle(folds(5)[1]!));
    fireEvent.keyDown(region(), { key: "End" });
    expect(live()).toBe(foldTitle(folds(5)[4]!));
    fireEvent.keyDown(region(), { key: "Home" });
    expect(readout()).toBe(foldTitle(first));
    fireEvent.keyDown(region(), { key: "Escape" });
    expect(readout() ?? "").toBe("");
  });

  it("a touch tap on a row pins its readout", () => {
    render(<FoldTimeline {...base()} />);
    const row = document.querySelector("[data-fold-row='3']")!;
    const ev = new Event("pointerdown", { bubbles: true });
    Object.assign(ev, { pointerType: "touch", clientX: 5 });
    fireEvent(row, ev);
    expect(readout()).toBe(foldTitle(folds(5)[2]!));
    const out = new Event("pointerleave", { bubbles: true });
    Object.assign(out, { pointerType: "touch" });
    fireEvent(region(), out);
    expect(readout()).toBe(foldTitle(folds(5)[2]!));
  });

  it("exact table carries the served instants and bars", () => {
    render(<FoldTimeline {...base({ folds: folds(2) })} />);
    const cell = document.querySelector("[data-chart-table] tbody tr td[data-exact]")!;
    expect(cell.getAttribute("data-exact")).toBe("2026-08-02T23:00:00.000Z");
    expect(document.querySelector("[data-chart-table] tbody tr")!.textContent).toContain("720 bars");
  });

  it("missing, empty and unpublished geometry is the caller's typed absence, never a computed plan", () => {
    const { rerender } = render(<FoldTimeline {...base({ status: "missing", folds: null, missingNote: "fold geometry not published" })} />);
    expect(document.querySelector("[data-fold-timeline=missing]")!.textContent).toBe("fold geometry not published");
    expect(screen.queryByRole("group")).toBeNull();
    rerender(<FoldTimeline {...base({ status: "served", folds: [], missingNote: "none published" })} />);
    expect(document.querySelector("[data-fold-timeline=missing]")!.textContent).toBe("none published");
    expect(document.querySelectorAll("[data-fold-row]")).toHaveLength(0);
    rerender(<FoldTimeline {...base({ status: "missing", folds: null })} />);
    expect(document.querySelector("[data-fold-timeline=missing]")!.textContent).toMatch(/not published/i);
  });

  it("pending is quiet and draws no stale folds; refused prints the refusal", () => {
    const { rerender } = render(<FoldTimeline {...base({ status: "pending" })} />);
    expect(document.querySelector("[data-fold-timeline=pending]")).not.toBeNull();
    expect(document.querySelectorAll("[data-fold-row]")).toHaveLength(0);
    expect(screen.queryByRole("group")).toBeNull();
    rerender(<FoldTimeline {...base({ status: "refused", refusalNote: "TOO_FEW_BARS: need 2 folds" })} />);
    expect(document.querySelector("[data-fold-timeline=refused]")!.textContent).toBe("TOO_FEW_BARS: need 2 folds");
    expect(document.querySelectorAll("[data-fold-row]")).toHaveLength(0);
  });

  it("draws the analysis span and a first-OOS tick on the shared clock, and no holdout", () => {
    render(<FoldTimeline {...base({ analysis: { startUtcMs: T0, endUtcMs: T0 + 900 * H }, firstOosUtcMs: T0 + 720 * H })} />);
    expect(document.querySelector("[data-fold-row=span]")).not.toBeNull();
    expect(document.querySelector("[data-fold-first-oos]")).not.toBeNull();
    expect(document.body.textContent).not.toMatch(/holdout/i);
  });

  it("more than 16 folds draw 16 and say the rest are in the table", () => {
    render(<FoldTimeline {...base({ folds: folds(18) })} />);
    expect(document.querySelectorAll("[data-fold-row]")).toHaveLength(16);
    expect(document.querySelectorAll("[data-chart-table] tbody tr")).toHaveLength(18);
    expect(document.querySelector("[data-fold-summary]")!.textContent).toContain("first 16 drawn");
  });

  it("adapts the estimate parser's PlannedFold", () => {
    expect(foldsFromPlanned(null)).toBeNull();
    expect(foldsFromPlanned([])).toBeNull();
    expect(
      foldsFromPlanned([{ ordinal: 2, train: { startUtcMs: 1, endExclusiveUtcMs: 2, bars: 3 }, outerOos: { startUtcMs: 2, endExclusiveUtcMs: 4, bars: 5 } }]),
    ).toEqual([{ ordinal: 2, trainStartUtcMs: 1, trainEndUtcMs: 2, oosStartUtcMs: 2, oosEndUtcMs: 4, trainBars: 3, oosBars: 5 }]);
  });
});

describe("axe", () => {
  it("has no axe violations", async () => {
    const axe = (await import("axe-core")).default;
    const { container } = render(<main><FoldTimeline {...base()} /></main>);
    const result = await axe.run(container, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } });
    expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html.slice(0, 80)).join(" | ")}`)).toEqual([]);
  });
});
