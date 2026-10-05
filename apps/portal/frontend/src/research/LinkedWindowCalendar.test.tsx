import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LinkedWindowCalendar, type LinkedWindowCalendarProps } from "./LinkedWindowCalendar";

afterEach(cleanup);

const H = 3_600_000;
const EDGES = { a: "2026-08-02T23:00", b: "2026-09-13T23:00", c: "2026-09-25T23:00", d: "2026-10-01T23:00" };
const A = Date.parse("2026-08-02T23:00:00Z");

function setup(over: Partial<LinkedWindowCalendarProps> = {}) {
  const onChange = vi.fn();
  const utils = render(<LinkedWindowCalendar edges={EDGES} onChange={onChange} barMs={H} idPrefix="t" {...over} />);
  return { onChange, ...utils };
}
const NAMES = { a: "IS start (A) handle", b: "IS end · OOS start (B) handle", c: "OOS end · Holdout start (C) handle", d: "Holdout end exclusive (D) handle" };
const handle = (e: "a" | "b" | "c" | "d") => screen.getByRole("slider", { name: NAMES[e] });
const track = () => document.querySelector("[data-calendar-track]") as HTMLElement;
function sizeTrack(width = 1000) {
  track().getBoundingClientRect = () => ({ left: 0, top: 0, right: width, bottom: 24, width, height: 24, x: 0, y: 0, toJSON: () => ({}) });
}
function pointer(type: string, target: Element, x = 0) {
  const ev = new Event(type, { bubbles: true });
  Object.assign(ev, { clientX: x, pointerId: 1, pointerType: "mouse" });
  fireEvent(target, ev);
}

describe("LinkedWindowCalendar", () => {
  it("labels four edge inputs and says UTC end-exclusive once", () => {
    setup();
    for (const name of ["IS start (A)", "IS end · OOS start (B)", "OOS end · Holdout start (C)", "Holdout end exclusive (D)"]) {
      expect(screen.getByLabelText(name, { selector: "input" })).toBeTruthy();
    }
    expect(screen.getAllByText("UTC · end exclusive")).toHaveLength(1);
    expect((screen.getByLabelText("IS end · OOS start (B)", { selector: "input" }) as HTMLInputElement).value).toBe(EDGES.b);
  });

  it("a typed B or C is one patch with one key", () => {
    const { onChange } = setup();
    fireEvent.change(screen.getByLabelText("IS end · OOS start (B)", { selector: "input" }), { target: { value: "2026-09-14T00:00" } });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ b: "2026-09-14T00:00" });
    fireEvent.change(screen.getByLabelText("OOS end · Holdout start (C)", { selector: "input" }), { target: { value: "2026-09-26T00:00" } });
    expect(onChange).toHaveBeenLastCalledWith({ c: "2026-09-26T00:00" });
  });

  it("renders empty edges as empty inputs, no handles and a hint", () => {
    setup({ edges: { a: "", b: "", c: "", d: "" } });
    for (const input of screen.getAllByLabelText(/\(/, { selector: "input" })) expect((input as HTMLInputElement).value).toBe("");
    expect(screen.queryAllByRole("slider")).toHaveLength(0);
    expect(document.querySelector("[data-calendar-empty]")).not.toBeNull();
    expect(document.body.textContent).not.toMatch(/\b0 bars|–/);
  });

  it("shows bar counts only when the bar size is known", () => {
    const { unmount } = setup();
    expect(document.querySelector("[data-calendar-role=is]")!.textContent).toBe("IS 1,008 bars");
    expect(document.querySelector("[data-calendar-role=oos]")!.textContent).toBe("OOS 288 bars");
    expect(document.querySelector("[data-calendar-role=holdout]")!.textContent).toBe("Holdout 144 bars");
    unmount();
    setup({ barMs: null });
    expect(document.querySelector("[data-calendar-role=is]")!.textContent).toBe("IS");
  });

  it("handles are sliders with UTC value text, two tab stops, 24px targets", () => {
    setup();
    expect(screen.getAllByRole("slider")).toHaveLength(4);
    for (const h of [handle("a"), handle("b"), handle("c"), handle("d")]) {
      expect(h.getAttribute("tabindex")).toBe("0");
      expect(h.style.width).toBe("24px");
      expect(h.style.touchAction).toBe("none");
    }
    expect(handle("b").getAttribute("aria-valuetext")).toBe("2026-09-13 23:00 UTC, end exclusive");
    expect(Number(handle("b").getAttribute("aria-valuemin"))).toBe(A + H);
    expect(Number(handle("b").getAttribute("aria-valuemax"))).toBe(Date.parse("2026-09-25T23:00:00Z") - H);
  });

  it("keys step one bar, ten percent, and stop at the neighbours; each is one atomic patch", () => {
    const { onChange } = setup();
    fireEvent.keyDown(handle("b"), { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith({ b: "2026-09-14T00:00" });
    fireEvent.keyDown(handle("b"), { key: "ArrowLeft" });
    expect(onChange).toHaveBeenLastCalledWith({ b: "2026-09-13T22:00" });
    /* 10% of 1,440 bars = 144 bars = 6 days. */
    fireEvent.keyDown(handle("b"), { key: "ArrowLeft", shiftKey: true });
    expect(onChange).toHaveBeenLastCalledWith({ b: "2026-09-07T23:00" });
    fireEvent.keyDown(handle("c"), { key: "PageUp" });
    expect(onChange).toHaveBeenLastCalledWith({ c: "2026-10-01T22:00" });
    fireEvent.keyDown(handle("b"), { key: "Home" });
    expect(onChange).toHaveBeenLastCalledWith({ b: "2026-08-03T00:00" });
    fireEvent.keyDown(handle("b"), { key: "End" });
    expect(onChange).toHaveBeenLastCalledWith({ b: "2026-09-25T22:00" });
    fireEvent.keyDown(handle("c"), { key: "Home" });
    expect(onChange).toHaveBeenLastCalledWith({ c: "2026-09-14T00:00" });
    fireEvent.keyDown(handle("c"), { key: "End" });
    expect(onChange).toHaveBeenLastCalledWith({ c: "2026-10-01T22:00" });
    for (const [args] of onChange.mock.calls) expect(Object.keys(args)).toHaveLength(1);
  });

  it("no patch when a key cannot move the handle, nor for a modified key", () => {
    const { onChange } = setup({ edges: { ...EDGES, b: "2026-08-03T00:00" } });
    fireEvent.keyDown(handle("b"), { key: "Home" });
    fireEvent.keyDown(handle("b"), { key: "ArrowRight", ctrlKey: true });
    fireEvent.keyDown(handle("b"), { key: "a" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("a drag is a local preview and commits once on release, snapped to a bar", () => {
    const { onChange } = setup();
    sizeTrack(1000);
    const b = handle("b");
    pointer("pointerdown", b, 0);

    pointer("pointermove", b, 500);
    pointer("pointermove", b, 510);
    expect(onChange).not.toHaveBeenCalled();
    const shown = (screen.getByLabelText("IS end · OOS start (B)", { selector: "input" }) as HTMLInputElement).value;
    /* Axis = A..D padded by a quarter each side: 510px lands at A + 735h, snapped from B. */
    expect(shown).toBe("2026-09-02T21:00");
    expect(b.getAttribute("aria-valuetext")).toBe("2026-09-02 21:00 UTC, end exclusive");
    pointer("pointerup", b, 510);
    expect(onChange).toHaveBeenCalledTimes(1);
    const patch = onChange.mock.calls[0]![0] as { b: string };
    expect(Object.keys(onChange.mock.calls[0]![0])).toEqual(["b"]);
    expect(patch.b).toBe("2026-09-02T21:00");
  });

  it("a drag cannot pass the neighbour, and cancel or an unmoved release patches nothing", () => {
    const { onChange } = setup();
    sizeTrack(1000);
    const b = handle("b");
    pointer("pointerdown", b, 0);
    pointer("pointermove", b, 1000);
    pointer("pointerup", b, 1000);
    expect(onChange).toHaveBeenLastCalledWith({ b: "2026-09-25T22:00" });
    onChange.mockClear();
    pointer("pointerdown", b, 0);
    pointer("pointermove", b, 100);
    pointer("pointercancel", b, 100);
    pointer("pointerup", b, 100);
    expect(onChange).not.toHaveBeenCalled();
    pointer("pointerdown", b, 0);
    pointer("pointerup", b, 0);
    expect(onChange).not.toHaveBeenCalled();
    pointer("pointerdown", b, 0);
    pointer("pointermove", b, 100);
    fireEvent.keyDown(b, { key: "Escape" });
    pointer("pointerup", b, 100);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("disabled blocks keys and drags", () => {
    const { onChange } = setup({ disabled: true });
    sizeTrack();
    fireEvent.keyDown(handle("b"), { key: "ArrowRight" });
    pointer("pointerdown", handle("b"), 0);
    pointer("pointermove", handle("b"), 300);
    pointer("pointerup", handle("b"), 300);
    expect(onChange).not.toHaveBeenCalled();
    expect(handle("b").getAttribute("aria-disabled")).toBe("true");
    expect((screen.getByLabelText("IS start (A)", { selector: "input" }) as HTMLInputElement).disabled).toBe(true);
  });

  it("without a bar size the keys step one minute", () => {
    const { onChange } = setup({ barMs: null });
    fireEvent.keyDown(handle("b"), { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith({ b: "2026-09-13T23:01" });
  });

  it("unordered edges draw no handles", () => {
    setup({ edges: { ...EDGES, b: "2026-10-05T00:00" } });
    expect(screen.queryAllByRole("slider")).toHaveLength(0);
  });

  it("coverage band, warmup, span and per-edge errors and refusals", () => {
    setup({
      coverage: { from: A - 300 * H, to: A + 1500 * H },
      warmupBars: 300,
      maxSpanMs: 30 * 86_400_000,
      errors: { b: "B must be after A." },
      fieldRefusals: { c: <span data-testid="refusal">refused C</span> },
    });
    expect(document.querySelector("[data-calendar-coverage]")).not.toBeNull();
    expect(document.querySelector("[data-calendar-warmup]")!.textContent).toBe("warmup 300 bars before A");
    expect(document.querySelector("[data-calendar-span]")!.textContent).toBe("span 60 d · max 30 d exceeded");
    const b = screen.getByLabelText("IS end · OOS start (B)", { selector: "input" });
    expect(b.getAttribute("aria-invalid")).toBe("true");
    expect(b.getAttribute("aria-describedby")).toBe("t-err-b");
    expect(within(document.getElementById("t-err-b")!.parentElement!).getByText("B must be after A.")).toBeTruthy();
    expect(screen.getByTestId("refusal")).toBeTruthy();
  });
});

const D = Date.parse("2026-10-01T23:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 16);
const RANGE = { from: A - 300 * H, to: D + 100 * H };

describe("all four handles", () => {
  it("A and D have keyboard steps and neighbour limits", () => {
    const { onChange } = setup();
    fireEvent.keyDown(handle("a"), { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith({ a: iso(A + H) });
    fireEvent.keyDown(handle("a"), { key: "End" });
    expect(onChange).toHaveBeenLastCalledWith({ a: iso(Date.parse("2026-09-13T22:00:00Z")) });
    fireEvent.keyDown(handle("d"), { key: "ArrowLeft" });
    expect(onChange).toHaveBeenLastCalledWith({ d: iso(D - H) });
    /* Shift would take D 144 bars left, onto C: it stops one bar after C. */
    fireEvent.keyDown(handle("d"), { key: "ArrowLeft", shiftKey: true });
    expect(onChange).toHaveBeenLastCalledWith({ d: iso(Date.parse("2026-09-26T00:00:00Z")) });
    fireEvent.keyDown(handle("d"), { key: "Home" });
    expect(onChange).toHaveBeenLastCalledWith({ d: iso(Date.parse("2026-09-26T00:00:00Z")) });
  });

  it("the range holds A and D in; maxSpan clamps the dragged edge and says so", () => {
    const { onChange, unmount } = setup({ range: RANGE });
    fireEvent.keyDown(handle("a"), { key: "Home" });
    expect(onChange).toHaveBeenLastCalledWith({ a: iso(RANGE.from) });
    fireEvent.keyDown(handle("d"), { key: "End" });
    expect(onChange).toHaveBeenLastCalledWith({ d: iso(RANGE.to) });
    unmount();
    const again = setup({ range: RANGE, maxSpanMs: 61 * 86_400_000 });
    fireEvent.keyDown(handle("d"), { key: "End" });
    expect(again.onChange).toHaveBeenLastCalledWith({ d: iso(A + 61 * 24 * H) });
    fireEvent.keyDown(handle("a"), { key: "Home" });
    expect(again.onChange).toHaveBeenLastCalledWith({ a: iso(D - 61 * 24 * H) });
    expect(document.querySelector("[data-calendar-span]")!.textContent).toBe("span 60 d · max 61 d");
  });

  it("dragging A or D commits once on release, inside the range", () => {
    const { onChange } = setup({ range: RANGE });
    sizeTrack(1000);
    pointer("pointerdown", handle("a"), 0);
    pointer("pointermove", handle("a"), 100);
    pointer("pointermove", handle("a"), 110);
    expect(onChange).not.toHaveBeenCalled();
    pointer("pointerup", handle("a"), 100);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith({ a: iso(A - 98 * H) });
    onChange.mockClear();
    pointer("pointerdown", handle("d"), 0);
    pointer("pointermove", handle("d"), 1000);
    pointer("pointerup", handle("d"), 1000);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith({ d: iso(RANGE.to) });
  });
});

describe("presets", () => {
  const preset = (k: string) => document.querySelector(`[data-calendar-preset='${k}']`) as HTMLButtonElement;

  it("never patch on mount", () => {
    const { onChange } = setup({ range: RANGE });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("70/20/10 re-splits A..D by bars in one atomic patch", () => {
    const { onChange } = setup({ edges: { ...EDGES, d: iso(A + 1000 * H) } });
    fireEvent.click(preset("70-20-10"));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ a: EDGES.a, b: iso(A + 700 * H), c: iso(A + 900 * H), d: iso(A + 1000 * H) });
  });

  it("70/20/10 is disabled without a bar size or valid A and D, with a reason", () => {
    setup({ barMs: null });
    expect(preset("70-20-10").disabled).toBe(true);
    expect(preset("70-20-10").title).toBe("Needs a known bar size.");
    cleanup();
    setup({ edges: { ...EDGES, d: "" } });
    expect(preset("70-20-10").disabled).toBe(true);
    expect(preset("70-20-10").title).toBe("Needs a valid A and D.");
  });

  it.each([30, 60, 90])("Last %id sets A..D from range.to and splits 70/20/10", (n) => {
    const { onChange } = setup({ range: { from: D - 200 * 24 * H, to: D } });
    fireEvent.click(preset(`last-${n}d`));
    expect(onChange).toHaveBeenCalledTimes(1);
    const a = D - n * 24 * H;
    const bars = n * 24;
    expect(onChange).toHaveBeenCalledWith({ a: iso(a), b: iso(a + Math.round(bars * 0.7) * H), c: iso(a + Math.round(bars * 0.9) * H), d: iso(D) });
  });

  it("Last N d is disabled with a reason: no range, over max span, range too short", () => {
    setup({});
    expect(preset("last-30d").disabled).toBe(true);
    expect(preset("last-30d").title).toBe("Needs a verified data range.");
    cleanup();
    setup({ range: { from: D - 200 * 24 * H, to: D }, maxSpanMs: 45 * 86_400_000 });
    expect(preset("last-30d").disabled).toBe(false);
    expect(preset("last-60d").disabled).toBe(true);
    expect(preset("last-60d").title).toContain("exceeds the profile's maximum span (45 d)");
    cleanup();
    setup({ range: { from: D - 40 * 24 * H, to: D } });
    expect(preset("last-30d").disabled).toBe(false);
    expect(preset("last-60d").disabled).toBe(true);
    expect(preset("last-60d").title).toBe("The verified range is shorter than 60 days.");
  });

  it("presets are blocked while disabled", () => {
    setup({ range: RANGE, disabled: true });
    expect(preset("70-20-10").disabled).toBe(true);
  });
});

describe("axe", () => {
  it("has no axe violations (calendar and fold timeline)", async () => {
    const axe = (await import("axe-core")).default;
    const { container } = render(
      <main>
        <LinkedWindowCalendar edges={EDGES} onChange={() => undefined} barMs={H} idPrefix="ax" errors={{ b: "bad" }} />
      </main>,
    );
    const result = await axe.run(container, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } });
    expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html.slice(0, 80)).join(" | ")}`)).toEqual([]);
  });
});