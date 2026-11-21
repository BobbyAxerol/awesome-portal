/** SPEC_W5 §2.4: the chart contract, asserted in jsdom. */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ChartLive, ChartSummary, useChartContract, type ChartContractOptions } from "./chartContract";
import { useScrub } from "./compareChartLife";

afterEach(cleanup);

const TITLES = ["p0 · 1.00", "p1 · 2.00", "p2 · 3.00", "p3 · 4.00"];
const XS = [0, 33, 66, 100];

function Harness(props: Partial<ChartContractOptions> & { onIndexSpy?: (i: number | null) => void }) {
  const { onIndexSpy, ...rest } = props;
  const c = useChartContract({
    label: "Things",
    noun: "point",
    count: TITLES.length,
    describe: (i) => TITLES[i]!,
    summary: "Things chart, 4 points.",
    onIndex: onIndexSpy,
    ...rest,
  });
  return (
    <div>
      <div data-testid="region" {...c.regionProps} />
      <span data-testid="tip">{c.text ?? ""}</span>
      <span data-testid="idx">{String(c.index)}</span>
      {c.nodes}
      <button data-testid="outside">outside</button>
    </div>
  );
}

const region = () => screen.getByTestId("region");
const live = () => screen.getByRole("status").textContent;
const key = (k: string, init: object = {}) => fireEvent.keyDown(region(), { key: k, ...init });

function sizeRegion(width = 300) {
  region().getBoundingClientRect = () => ({ left: 0, top: 0, right: width, bottom: 40, width, height: 40, x: 0, y: 0, toJSON: () => ({}) });
}
/* jsdom may build a plain Event: pin pointerType explicitly. */
function fire(type: string, x: number, pointerType: string, target: Element = region()) {
  const ev = new Event(type, { bubbles: true });
  Object.assign(ev, { clientX: x, pointerType });
  fireEvent(target, ev);
}

describe("region", () => {
  it("is one tab stop with a short name, a summary and a focus ring", () => {
    render(<Harness />);
    expect(region().getAttribute("role")).toBe("group");
    expect(region().getAttribute("tabindex")).toBe("0");
    expect(region().getAttribute("aria-roledescription")).toBe("chart");
    expect(region().getAttribute("aria-label")).toBe("Things");
    expect(region().className).toContain("outline-offset-2 focus-visible:outline");
    expect(region().style.touchAction).toBe("pan-y");
    const id = region().getAttribute("aria-describedby")!;
    expect(document.getElementById(id)?.textContent).toBe("Things chart, 4 points.");
    expect(document.querySelectorAll("[role=status]")).toHaveLength(1);
  });

  it("count 0 is not focusable and keys do nothing", () => {
    render(<Harness count={0} />);
    expect(region().getAttribute("tabindex")).toBeNull();
    key("ArrowRight");
    expect(screen.getByTestId("idx").textContent).toBe("null");
  });
});

describe("keys", () => {
  it("arrows move the readout; live text equals the title string", () => {
    render(<Harness />);
    key("ArrowRight");
    expect(screen.getByTestId("tip").textContent).toBe(TITLES[0]);
    expect(live()).toBe(TITLES[0]);
    key("ArrowRight");
    expect(live()).toBe(TITLES[1]);
    key("ArrowLeft");
    expect(live()).toBe(TITLES[0]);
    key("ArrowLeft");
    expect(live()).toBe(TITLES[0]);
  });

  it("first ArrowLeft starts at the end; Home/End reach the ends; Shift jumps 10 (clamped)", () => {
    render(<Harness />);
    key("ArrowLeft");
    expect(live()).toBe(TITLES[3]);
    key("Home");
    expect(live()).toBe(TITLES[0]);
    key("End");
    expect(live()).toBe(TITLES[3]);
    key("ArrowLeft", { shiftKey: true });
    expect(live()).toBe(TITLES[0]);
  });

  it("Escape clears the readout and keeps focus; modifier chords and unknown keys are ignored", () => {
    render(<Harness />);
    region().focus();
    key("End");
    key("ArrowLeft", { ctrlKey: true });
    expect(live()).toBe(TITLES[3]);
    expect(fireEvent.keyDown(region(), { key: "q" })).toBe(true);
    key("Escape");
    expect(screen.getByTestId("tip").textContent).toBe("");
    expect(live()).toBe("");
    expect(document.activeElement).toBe(region());
  });

  it("preventDefault only for handled keys", () => {
    render(<Harness />);
    expect(fireEvent.keyDown(region(), { key: "ArrowRight" })).toBe(false);
    expect(fireEvent.keyDown(region(), { key: "Tab" })).toBe(true);
    expect(fireEvent.keyDown(region(), { key: "Enter" })).toBe(true);
    expect(fireEvent.keyDown(region(), { key: "+" })).toBe(true);
    expect(fireEvent.keyDown(region(), { key: "PageUp" })).toBe(true);
  });

  it("zoom keys exist only with `zoom`; 0 resets; Shift+Arrow pans when zoomed, jumps when not", () => {
    const zoom = { zoomIn: vi.fn(), zoomOut: vi.fn(), pan: vi.fn(), reset: vi.fn(), zoomed: true };
    const { unmount } = render(<Harness zoom={zoom} />);
    key("+");
    key("=");
    key("-");
    key("_");
    key("0");
    key("ArrowRight", { shiftKey: true });
    key("ArrowLeft", { shiftKey: true });
    expect(zoom.zoomIn).toHaveBeenCalledTimes(2);
    expect(zoom.zoomOut).toHaveBeenCalledTimes(2);
    expect(zoom.reset).toHaveBeenCalledTimes(1);
    expect(zoom.pan.mock.calls).toEqual([[1], [-1]]);
    unmount();
    const flat = { ...zoom, pan: vi.fn(), zoomed: false };
    render(<Harness zoom={flat} />);
    key("ArrowRight", { shiftKey: true });
    expect(flat.pan).not.toHaveBeenCalled();
    expect(live()).toBe(TITLES[3]);
  });

  it("PageUp/PageDown call events only when given; Enter/Space activate only with onActivate and a point", () => {
    const events = { prev: vi.fn(), next: vi.fn() };
    const onActivate = vi.fn();
    render(<Harness events={events} onActivate={onActivate} />);
    key("PageUp");
    key("PageDown");
    expect(events.prev).toHaveBeenCalledTimes(1);
    expect(events.next).toHaveBeenCalledTimes(1);
    key("Enter");
    expect(onActivate).not.toHaveBeenCalled();
    key("Home");
    key("Enter");
    key(" ");
    expect(onActivate.mock.calls).toEqual([[0], [0]]);
  });

  it("reports indices through onIndex, and a controlled index owns the readout", () => {
    const spy = vi.fn();
    const { rerender } = render(<Harness onIndexSpy={spy} />);
    key("End");
    key("Escape");
    expect(spy.mock.calls).toEqual([[3], [null]]);
    rerender(<Harness controlledIndex={1} onIndexSpy={spy} />);
    expect(screen.getByTestId("tip").textContent).toBe(TITLES[1]);
    rerender(<Harness controlledIndex={null} />);
    expect(screen.getByTestId("tip").textContent).toBe("");
  });
});

describe("pointer", () => {
  it("mouse hover moves the tooltip but not the live node; leave clears", () => {
    render(<Harness xs={XS} />);
    sizeRegion();
    fire("pointermove", 200, "mouse");
    expect(screen.getByTestId("tip").textContent).toBe(TITLES[2]);
    expect(live()).toBe("");
    fire("pointerout", 200, "mouse");
    expect(screen.getByTestId("tip").textContent).toBe("");
  });

  it("touch tap pins and announces; leave and blur do not clear; tap outside dismisses", () => {
    render(<Harness xs={XS} />);
    sizeRegion();
    fire("pointerdown", 100, "touch");
    expect(screen.getByTestId("tip").textContent).toBe(TITLES[1]);
    expect(live()).toBe(TITLES[1]);
    fire("pointerout", 100, "touch");
    fireEvent.blur(region());
    expect(screen.getByTestId("tip").textContent).toBe(TITLES[1]);
    fire("pointerdown", 5, "touch", screen.getByTestId("outside"));
    expect(screen.getByTestId("tip").textContent).toBe("");
    expect(live()).toBe("");
  });

  it("tapping the same point again unpins; a tap beyond 24 px of any point dismisses", () => {
    render(<Harness xs={XS} />);
    sizeRegion();
    fire("pointerdown", 99, "touch");
    expect(screen.getByTestId("tip").textContent).toBe(TITLES[1]);
    fire("pointerdown", 99, "touch");
    expect(screen.getByTestId("tip").textContent).toBe("");
    fire("pointerdown", 99 + 20, "touch");
    expect(screen.getByTestId("tip").textContent).toBe(TITLES[1]);
    fire("pointerdown", 160, "touch"); /* 160 is >24 px from 99 and 198 */
    expect(screen.getByTestId("tip").textContent).toBe("");
  });

  it("the outside-tap listener is gone after unmount", () => {
    const remove = vi.spyOn(document, "removeEventListener");
    const { unmount } = render(<Harness xs={XS} />);
    sizeRegion();
    fire("pointerdown", 100, "touch");
    unmount();
    expect(remove.mock.calls.some(([type]) => type === "pointerdown")).toBe(true);
    remove.mockRestore();
  });
});

describe("compareChartLife.useScrub wrapper", () => {
  function Scrub() {
    const { index, handlers } = useScrub(XS);
    return <div data-testid="s" tabIndex={0} {...handlers}>{String(index)}</div>;
  }
  it("keeps its shape: keys move, touch pins past pointerleave", () => {
    render(<Scrub />);
    const el = screen.getByTestId("s");
    fireEvent.keyDown(el, { key: "End" });
    expect(el.textContent).toBe("3");
    fireEvent.keyDown(el, { key: "Escape" });
    expect(el.textContent).toBe("null");
    el.getBoundingClientRect = () => ({ left: 0, top: 0, right: 300, bottom: 40, width: 300, height: 40, x: 0, y: 0, toJSON: () => ({}) });
    fire("pointerdown", 100, "touch", el);
    expect(el.textContent).toBe("1");
    fire("pointerout", 100, "touch", el);
    expect(el.textContent).toBe("1");
  });
});

describe("pointProps and locate", () => {
  function Months({ rows = 3 }: { rows?: number }) {
    const c = useChartContract({ label: "Months", noun: "month", count: rows, describe: (i) => `m${i}`, summary: "Months." });
    return (
      <div>
        <div data-testid="region" {...c.regionProps}>
          {Array.from({ length: rows }, (_, i) => (
            <span key={i} data-testid={`m${i}`} {...c.pointProps(i)} />
          ))}
          {c.nodes}
        </div>
        <span data-testid="idx">{String(c.index)}</span>
        <button data-testid="outside">outside</button>
      </div>
    );
  }
  it("a touch press on a mark reads, announces and pins it; the region does not read the press twice", () => {
    render(<Months />);
    fire("pointerdown", 0, "touch", screen.getByTestId("m1"));
    expect(screen.getByTestId("idx").textContent).toBe("1");
    expect(live()).toBe("m1");
    fire("pointerout", 0, "touch", screen.getByTestId("m1"));
    expect(screen.getByTestId("idx").textContent).toBe("1");
    fire("pointerdown", 0, "touch", screen.getByTestId("outside"));
    expect(screen.getByTestId("idx").textContent).toBe("null");
  });
  it("a second tap on the same mark, or a tap in a gap of the region, dismisses a pin; Escape and blur behave", () => {
    render(<Months />);
    fire("pointerdown", 0, "touch", screen.getByTestId("m1"));
    fire("pointerdown", 0, "touch", screen.getByTestId("m1"));
    expect(screen.getByTestId("idx").textContent).toBe("null");
    fire("pointerdown", 0, "touch", screen.getByTestId("m2"));
    fire("pointerdown", 0, "touch", screen.getByTestId("m0"));
    expect(screen.getByTestId("idx").textContent).toBe("0");
    fire("pointerdown", 0, "touch", region());
    expect(screen.getByTestId("idx").textContent).toBe("null");
    fire("pointerdown", 0, "touch", screen.getByTestId("m2"));
    fireEvent.blur(region());
    fire("pointerleave", 0, "touch");
    expect(screen.getByTestId("idx").textContent).toBe("2");
    key("Escape");
    expect(screen.getByTestId("idx").textContent).toBe("null");
  });
  it("a mouse enter reads without announcing", () => {
    render(<Months />);
    fire("pointerover", 0, "mouse", screen.getByTestId("m2"));
    expect(screen.getByTestId("idx").textContent).toBe("2");
    expect(live()).toBe("");
  });
  it("locate maps a press to a point (null clears) and leaves hover to the chart when hover is false", () => {
    const at = vi.fn((x: number) => (x < 50 ? 2 : null));
    render(<Harness locate={at} hover={false} />);
    sizeRegion();
    fire("pointermove", 10, "mouse");
    expect(screen.getByTestId("idx").textContent).toBe("null");
    fire("pointerdown", 10, "touch");
    expect(screen.getByTestId("idx").textContent).toBe("2");
    expect(live()).toBe("p2 · 3.00");
    fire("pointerdown", 200, "touch");
    expect(screen.getByTestId("idx").textContent).toBe("null");
  });
});

describe("nodes", () => {
  it("ChartLive is a polite status; ChartSummary carries its id", () => {
    render(<><ChartLive text="x" /><ChartSummary id="s1" text="sum" /></>);
    expect(screen.getByRole("status").getAttribute("aria-live")).toBe("polite");
    expect(document.getElementById("s1")?.textContent).toBe("sum");
  });
});
