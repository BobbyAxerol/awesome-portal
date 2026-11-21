import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { at } from "./chartKit";
import { EventKindChips, EventRibbon } from "./EventRibbon";
import type { ChartEvent } from "./types";

afterEach(cleanup);

const domain = { from: at("2026-10-01T00:00:00Z"), to: at("2026-10-11T00:00:00Z") };
const ev = (id: string, day: number, kind: ChartEvent["kind"], title: string, extra: Partial<ChartEvent> = {}): ChartEvent => ({
  id,
  t: at(`2026-10-${String(day).padStart(2, "0")}T09:14:00Z`),
  kind,
  title,
  ...extra,
});
const EVENTS = [
  ev("1", 2, "stage", "Paper to sandbox", { actor: "Bobby" }),
  ev("2", 5, "incident", "Broker sync diverged", { reason: "Binance-02" }),
  ev("3", 7, "recall", "Recall applied"),
  ev("4", 8, "flow", "Added funds", { detail: "+100,000.00" }),
  ev("5", 9, "decision", "Archive decided"),
];

describe("EventRibbon", () => {
  it("is a named group of real buttons, one per event, each named with kind, title and UTC time", () => {
    render(<EventRibbon label="Events" events={EVENTS} domain={domain} />);
    expect(screen.getByRole("group", { name: "Events" })).toBeTruthy();
    const buttons = screen.getAllByTestId("ribbon-event");
    expect(buttons).toHaveLength(5);
    expect(buttons.every((b) => b.tagName === "BUTTON")).toBe(true);
    expect(buttons[0].getAttribute("aria-label")).toBe("Stage: Paper to sandbox, 2 Oct 09:14Z");
    expect(screen.getByRole("button", { name: "Incident: Broker sync diverged, 5 Oct 09:14Z" })).toBeTruthy();
  });

  it("uses a different glyph per kind so colour is never the only cue", () => {
    render(<EventRibbon label="Events" events={EVENTS} domain={domain} />);
    const glyphs = screen.getAllByTestId("ribbon-event").map((b) => b.textContent);
    expect(new Set(glyphs).size).toBe(5);
  });

  it("lines up with an EquityPanel through the same margins, in percent of the plot width", () => {
    const { container } = render(<EventRibbon label="Events" events={[ev("2", 6, "incident", "x")]} domain={domain} />);
    const root = container.querySelector(".exec-ribbon") as HTMLElement;
    expect(root.style.getPropertyValue("--exec-chart-ml")).toBe("78px");
    expect(root.style.getPropertyValue("--exec-chart-mr")).toBe("78px");
    const button = screen.getByTestId("ribbon-event");
    expect(button.style.left).toContain("calc(var(--exec-chart-ml) + (100% - var(--exec-chart-ml) - var(--exec-chart-mr)) * 0.5");
  });

  it("shows details on focus and hides them on blur (keyboard parity with hover)", () => {
    render(<EventRibbon label="Events" events={EVENTS} domain={domain} />);
    const incident = screen.getByRole("button", { name: /Incident/ });
    expect(screen.queryByTestId("ribbon-card")).toBeNull();
    fireEvent.focus(incident);
    const card = screen.getByTestId("ribbon-card");
    expect(card.textContent).toContain("Broker sync diverged");
    expect(card.textContent).toContain("5 Oct 09:14Z · Binance-02");
    fireEvent.blur(incident);
    expect(screen.queryByTestId("ribbon-card")).toBeNull();
    fireEvent.mouseEnter(incident);
    expect(screen.getByTestId("ribbon-card")).toBeTruthy();
  });

  it("merges events in one time bucket into a counted mark that lists them, never drops them", () => {
    const burst = Array.from({ length: 12 }, (_, i) => ({ ...ev(`b${i}`, 5, "incident", `Alert ${i}`), t: at(`2026-10-05T09:${String(10 + i).padStart(2, "0")}:00Z`) }));
    render(<EventRibbon label="Events" events={burst} domain={domain} />);
    const marks = screen.getAllByTestId("ribbon-event");
    expect(marks).toHaveLength(1);
    expect(marks[0].getAttribute("aria-label")).toBe("Incident: 12 events from 5 Oct 09:10Z to 5 Oct 09:21Z");
    expect(marks[0].textContent).toBe("▲12");
    fireEvent.focus(marks[0]);
    const card = screen.getByTestId("ribbon-card");
    expect(card.textContent).toContain("Alert 0");
    expect(card.textContent).toContain("and 7 more");
  });

  it("counts events outside the window instead of silently dropping them", () => {
    render(<EventRibbon label="Events" events={[...EVENTS, { ...ev("x", 2, "flow", "Old"), t: at("2026-09-01T00:00:00Z") }]} domain={domain} />);
    expect(screen.getByTestId("ribbon-outside").textContent).toBe("1 event outside this window not drawn");
    expect(screen.getAllByTestId("ribbon-event")).toHaveLength(5);
  });

  it("keeps a disabled lane visible but empty of marks", () => {
    const { container } = render(<EventRibbon label="Events" events={EVENTS} domain={domain} enabled={{ incident: false }} />);
    expect(screen.queryByRole("button", { name: /Incident/ })).toBeNull();
    expect(container.querySelector('.exec-ribbon-lane[data-kind="incident"]')!.getAttribute("data-off")).toBe("true");
  });

  it("draws stages as hatched or outlined bands with their word, clipped to the window", () => {
    const { container } = render(
      <EventRibbon
        label="Events"
        events={EVENTS}
        domain={domain}
        stages={[
          { id: "s1", kind: "paper", label: "Paper", from: at("2026-09-20T00:00:00Z"), to: at("2026-10-04T00:00:00Z") },
          { id: "s2", kind: "live", label: "Live", from: at("2026-10-04T00:00:00Z"), to: at("2026-10-20T00:00:00Z") },
          { id: "s3", kind: "canary", label: "Gone", from: at("2026-08-01T00:00:00Z"), to: at("2026-08-02T00:00:00Z") },
        ]}
      />,
    );
    const stages = container.querySelectorAll('[data-testid="ribbon-stage"]');
    expect(stages).toHaveLength(2);
    expect(stages[0].textContent).toBe("Paper");
    expect(stages[0].getAttribute("data-stage")).toBe("paper");
    expect(stages[0].getAttribute("title")).toBe("Paper, 20 Sep 00:00Z to 4 Oct 00:00Z");
    expect((stages[0] as HTMLElement).style.left).toContain("* 0.00000");
    expect((stages[1] as HTMLElement).style.width).toContain("* 0.70000");
    expect(container.querySelector("ol")!.getAttribute("aria-label")).toBe("Stages");
  });

  it("is an explicit state when the window has nothing, never blank lanes", () => {
    const { container } = render(<EventRibbon label="Events" events={[]} domain={domain} />);
    expect(screen.getByTestId("ribbon-empty").textContent).toBe("No events or stages in this window.");
    expect(container.querySelector(".exec-ribbon-lane")).toBeNull();
  });

  it("prints the caller's copy when unavailable and flags partial or stale", () => {
    render(<EventRibbon label="Events" events={EVENTS} domain={domain} state={{ kind: "unavailable", copy: "Not published", reason: "Event feed not connected" }} />);
    expect(screen.getByText("Not published")).toBeTruthy();
    expect(screen.queryAllByTestId("ribbon-event")).toHaveLength(0);
    cleanup();
    const { container } = render(<EventRibbon label="Events" events={EVENTS} domain={domain} state={{ kind: "stale", reason: "Feed behind by 3 hours" }} />);
    expect(container.querySelector('.exec-flag[data-k="stale"]')!.textContent).toContain("Feed behind by 3 hours");
    expect(screen.getAllByTestId("ribbon-event")).toHaveLength(5);
  });

  it("stays within a DOM budget for 5,000 events", () => {
    const t0 = Date.parse("2026-10-01T00:00:00Z");
    const many = Array.from({ length: 5000 }, (_, i) => ({
      id: `m${i}`,
      t: at(new Date(t0 + (i * 10 * 86_400_000) / 5000).toISOString()),
      kind: (["stage", "decision", "incident", "recall", "flow"] as const)[i % 5],
      title: `Event ${i}`,
    }));
    const { container } = render(<EventRibbon label="Events" events={many} domain={domain} />);
    // 5 lanes x at most 80 buckets, plus lane furniture.
    expect(container.querySelectorAll("*").length).toBeLessThanOrEqual(5 * 80 * 2 + 30);
    expect(screen.getAllByTestId("ribbon-event").length).toBeLessThanOrEqual(400);
    const counted = screen.getAllByTestId("ribbon-event").reduce((sum, b) => sum + Number(/(\d+) events/.exec(b.getAttribute("aria-label") ?? "")?.[1] ?? 1), 0);
    expect(counted).toBe(5000);
  });
});

describe("EventKindChips", () => {
  it("toggles a kind, shows counts inside the window, and exposes pressed state", () => {
    const onToggle = vi.fn();
    render(<EventKindChips events={[...EVENTS, { ...ev("x", 2, "flow", "Old"), t: at("2026-09-01T00:00:00Z") }]} domain={domain} enabled={{ incident: false }} onToggle={onToggle} />);
    const incident = screen.getByRole("button", { name: /Incident/ });
    expect(incident.getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: /Flow/ }).textContent).toContain("1");
    expect(screen.getByRole("button", { name: /Flow/ }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(incident);
    expect(onToggle).toHaveBeenCalledWith("incident");
  });
});

describe("EventRibbon kinds (only the lanes a screen has a source for)", () => {
  it("draws just the lanes asked for, and an event of another kind is neither drawn nor counted as outside", () => {
    render(<EventRibbon label="Events" events={EVENTS} domain={domain} kinds={["flow"]} />);
    expect([...document.querySelectorAll(".exec-ribbon-lane")].map((l) => (l as HTMLElement).dataset.kind)).toEqual(["flow"]);
    expect(screen.getAllByTestId("ribbon-event")).toHaveLength(1);
    expect(screen.queryByTestId("ribbon-outside")).toBeNull();
    expect(document.querySelector(".exec-ribbon-lanes")!.getAttribute("style")).toContain("height: 26px");
  });

  it("is the empty state when none of its kinds has an event", () => {
    render(<EventRibbon label="Events" events={EVENTS.filter((e) => e.kind !== "flow")} domain={domain} kinds={["flow"]} />);
    expect(screen.getByTestId("ribbon-empty")).toBeTruthy();
  });

  it("chips offer just those kinds", () => {
    render(<EventKindChips events={EVENTS} enabled={{}} onToggle={() => {}} kinds={["flow"]} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0]!.textContent).toContain("Flow");
    expect(buttons[0]!.textContent).toContain("1");
  });
});

describe("EventRibbon stage bands (WP-C)", () => {
  it("prints a band's word only when the band is wide enough to hold it; a narrow band keeps the title and a screen-reader word, never a clipped half word", () => {
    const stages = [
      { id: "paper", kind: "paper" as const, label: "Paper", from: at("2026-10-01T00:00:00Z"), to: at("2026-10-09T00:00:00Z") },
      { id: "live", kind: "live" as const, label: "Live", from: at("2026-10-09T00:00:00Z"), to: at("2026-10-09T06:00:00Z") },
    ];
    const { container } = render(<EventRibbon label="Events" events={[]} domain={domain} stages={stages} />);
    const bands = [...container.querySelectorAll('[data-testid="ribbon-stage"]')];
    expect(bands).toHaveLength(2);
    expect(bands[0]!.querySelector("span")?.className ?? "").not.toContain("exec-c2-sr");
    expect(bands[1]!.querySelector("span")?.className).toContain("exec-c2-sr");
    expect(bands[1]!.textContent).toBe("Live");
    expect(bands[1]!.getAttribute("title")).toMatch(/^Live, /);
  });
});
