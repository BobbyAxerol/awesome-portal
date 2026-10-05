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
const handle = (e: "b" | "c") => screen.getByRole("slider", { name: e === "b" ? /IS end · OOS start \(B\)/ : /OOS end · Holdout start \(C\)/ });
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
    expect(screen.getAllByRole("slider")).toHaveLength(2);
    for (const h of [handle("b"), handle("c")]) {
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
    /* The axis is A..D = 1,440 bars wide on 1,000px: x=500 is 720 bars after A. */
    pointer("pointermove", b, 500);
    pointer("pointermove", b, 510);
    expect(onChange).not.toHaveBeenCalled();
    const shown = (screen.getByLabelText("IS end · OOS start (B)", { selector: "input" }) as HTMLInputElement).value;
    /* 510px = 734.4 bars after A, snapped to the bar grid: A + 734h. */
    expect(shown).toBe("2026-09-02T13:00");
    expect(b.getAttribute("aria-valuetext")).toBe("2026-09-02 13:00 UTC, end exclusive");
    pointer("pointerup", b, 510);
    expect(onChange).toHaveBeenCalledTimes(1);
    const patch = onChange.mock.calls[0]![0] as { b: string };
    expect(Object.keys(onChange.mock.calls[0]![0])).toEqual(["b"]);
    expect(patch.b).toBe("2026-09-02T13:00");
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
