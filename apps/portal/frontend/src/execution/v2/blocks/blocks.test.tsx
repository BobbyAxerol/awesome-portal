import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { readUtcEpochMs, type UtcEpochMs } from "../../screenDataContract";
import { readMetric, type Metric } from "../boundary";
import { FE as FLEET_FE } from "../screens/fleet/fleetModel";
import { FE as OPS_FE } from "../screens/operations/notPublished";
import { whyText } from "../gapWhyTestUtil";
import {
  CompactGaps,
  EventFeed,
  GapLine,
  FE_FLEET,
  FE_OPERATIONS,
  FE_REQUEST_LABEL,
  GAP_NEXT,
  JourneySpine,
  Kpi,
  KpiStrip,
  NaWhy,
  NotAvailableLine,
  NotPublished,
  PanelHead,
  SPINE_STAGE_IDS,
  SectionPanel,
  StateBoundary,
  Triad,
  notPublishedText,
  spineNodeState,
  type EventFeedRow,
} from "./index";

afterEach(cleanup);

const BIG = "12345678901234567890.123456789";
const metric = (value: string, state = "AVAILABLE", unit: "money" | "qty" | "pct" = "money"): Metric => {
  const m = readMetric({ state, value }, { unit });
  if (m === null) throw new Error(`unreadable fixture ${value}`);
  return m;
};
const absent = (state: string, reason_code: string): Metric => {
  const m = readMetric({ state, reason_code }, { unit: "money" });
  if (m === null) throw new Error("unreadable absent fixture");
  return m;
};
const at = (ms: number): UtcEpochMs => {
  const t = readUtcEpochMs(ms);
  if (t === null) throw new Error("bad instant");
  return t;
};
const DASHES = /[—–]|\bN\/A\b|\bNaN\b/;

describe("NotPublished and the one FE table", () => {
  it("prints the word, the id and the label", () => {
    render(<NotPublished id="FE-021" reasonCode="AUDIT_UNQUALIFIED">Who did what</NotPublished>);
    expect(screen.getByText("Not published")).toBeTruthy();
    expect(document.body.textContent).toContain("(FE-021)");
    expect(document.body.textContent).toContain("Who did what");
    expect(screen.getByText("AUDIT_UNQUALIFIED")).toBeTruthy();
    expect(notPublishedText("FE-027/028")).toBe("Not published (FE-027/028)");
  });

  it("holds exactly the ids and wording of the two tables it replaces", () => {
    expect(FE_OPERATIONS).toEqual(OPS_FE);
    expect(FE_FLEET).toEqual(FLEET_FE);
    for (const id of Object.values(FE_OPERATIONS)) expect(FE_REQUEST_LABEL[id]).toBeTruthy();
    for (const fact of Object.values(FE_FLEET)) {
      expect(FE_REQUEST_LABEL[fact.fe]).toBeTruthy();
    }
    // The fleet wording is the label where the id is unambiguous.
    expect(FE_REQUEST_LABEL["FE-012"]).toBe("Group by");
    expect(FE_REQUEST_LABEL["FE-035"]).toBe("Map");
    expect(FE_REQUEST_LABEL["FE-027, FE-028"]).toBe("Readiness");
  });

  it("FE-067 is the runtime-state request of every stage screen, not Paper's alone", () => {
    const label = FE_REQUEST_LABEL["FE-067"];
    for (const stage of ["Paper", "Sandbox", "Canary", "Live"]) expect(label, stage).toContain(stage);
    expect(label).toContain("Runtime state");
  });
});

describe("CompactGaps and GapLine (stage screens)", () => {
  it("outside CompactGaps a gap prints its request id; inside it prints `Not available` and the id sits in its disclosure", () => {
    const outside = render(<NotPublished id="FE-071">Used ratio</NotPublished>);
    expect(outside.container.textContent).toContain("Not published (FE-071)");
    cleanup();
    const inside = render(
      <CompactGaps>
        <NotPublished id="FE-071" titleReason="SOME_CODE">Used ratio</NotPublished>
      </CompactGaps>,
    );
    expect(inside.container.textContent).toBe("Not available");
    const gap = inside.container.querySelector("[data-gap]")!;
    expect(gap.getAttribute("title")).toBeNull();
    expect(whyText(gap)).toBe(`Not published (FE-071): Used ratio · ${FE_REQUEST_LABEL["FE-071"]} · SOME_CODE`);
  });

  it("GapLine is one line of the missing facts with every id and reason in its disclosure, and nothing for an empty list", () => {
    const { container } = render(
      <GapLine items={[{ label: "Limit", id: "FE-071" }, { label: "Latency", reason: "CODE_X" }]} because="Source unavailable" />,
    );
    const line = container.querySelector(".exec-blk-gaps")!;
    expect(line.textContent).toBe("Not available: Limit, Latency · Source unavailable");
    expect(line.getAttribute("title")).toBeNull();
    const title = whyText(line);
    expect(title).toContain("Limit: Not published (FE-071)");
    expect(title).toContain("Latency: Not published · CODE_X");
    cleanup();
    expect(render(<GapLine items={[]} />).container.textContent).toBe("");
  });
});

describe("GapWhy · the reason is reachable by keyboard and touch, not only by hover (RV-06)", () => {
  const line = () => render(<GapLine items={[{ label: "Limit", id: "FE-071", reason: "CODE_X" }]} />);

  it("is one real button with a name, closed by default: aria-expanded=false, no aria-controls, no reason in the page", () => {
    line();
    const button = screen.getByRole("button", { name: "Why not available: Limit" });
    expect(button.tagName).toBe("BUTTON");
    expect(button.getAttribute("type")).toBe("button");
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(button.hasAttribute("aria-controls")).toBe(false);
    expect(document.body.textContent).not.toContain("FE-071");
    expect(document.body.textContent).not.toContain("CODE_X");
    expect(document.querySelectorAll("[title]")).toHaveLength(0);
  });

  it("a tap or click opens it: aria-expanded=true, aria-controls names the body, which holds the id, the label, the reason and the next action", () => {
    line();
    const button = screen.getByRole("button", { name: "Why not available: Limit" });
    fireEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    const body = document.getElementById(button.getAttribute("aria-controls")!)!;
    expect(body.textContent).toContain(`Limit: Not published (FE-071): ${FE_REQUEST_LABEL["FE-071"]} · CODE_X`);
    expect(body.textContent).toContain(GAP_NEXT);
    fireEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(document.getElementById(body.id)).toBeNull();
  });

  it("is a Tab stop and a native button, so Enter and Space activate it (the real key presses are in the coexistence spec)", () => {
    line();
    const button = screen.getByRole("button", { name: "Why not available: Limit" });
    expect(button.tabIndex).toBe(0);
    expect(button.hasAttribute("disabled")).toBe(false);
    button.focus();
    expect(document.activeElement).toBe(button);
    // A native button turns Enter and Space into this same click; the handler is the click, not a key table.
    fireEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
  });

  it("Escape closes it and puts focus back on the button, and does not reach a dialog around it", () => {
    const outer = vi.fn();
    render(
      <div onKeyDown={(e) => outer(e.key)}>
        <GapLine items={[{ label: "Limit", id: "FE-071" }]} />
      </div>,
    );
    const button = screen.getByRole("button", { name: "Why not available: Limit" });
    fireEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    fireEvent.keyDown(document.getElementById(button.getAttribute("aria-controls")!)!, { key: "Escape" });
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(button);
    expect(outer).not.toHaveBeenCalled();
    // With nothing open Escape is not swallowed: the dialog around it still hears it.
    fireEvent.keyDown(button, { key: "Escape" });
    expect(outer).toHaveBeenCalledWith("Escape");
  });

  it("a compact cell is the words `Not available` as the button: its name starts with the visible text, the reason stays inside", () => {
    render(
      <CompactGaps>
        <NotPublished id="FE-071" titleReason="SOME_CODE">Used ratio</NotPublished>
      </CompactGaps>,
    );
    const button = screen.getByRole("button", { name: "Not available: Used ratio, reason" });
    expect(button.textContent).toBe("Not available");
    expect(document.body.textContent).not.toContain("SOME_CODE");
    fireEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(document.getElementById(button.getAttribute("aria-controls")!)!.textContent).toContain("SOME_CODE");
  });

  it("two lines are two independent disclosures with distinct bodies", () => {
    render(
      <>
        <GapLine items={[{ label: "Limit", id: "FE-071" }]} />
        <GapLine items={[{ label: "Latency", reason: "CODE_X" }]} />
      </>,
    );
    const [a, b] = screen.getAllByRole("button");
    fireEvent.click(a!);
    expect(a!.getAttribute("aria-expanded")).toBe("true");
    expect(b!.getAttribute("aria-expanded")).toBe("false");
    expect(document.body.textContent).not.toContain("CODE_X");
    fireEvent.click(b!);
    expect(a!.getAttribute("aria-controls")).not.toBe(b!.getAttribute("aria-controls"));
  });
});

describe("Kpi", () => {
  it("a strip prints a request id once: later cells with the same id read Not published (the id stays in their tooltip); a different id prints", () => {
    render(
      <KpiStrip label="Live figures">
        <Kpi label="Equity" notPublished="FE-072" />
        <Kpi label="Net PnL" notPublished="FE-072" />
        <Kpi label="Fills" notPublished="FE-072" />
        <Kpi label="Runtime" notPublished="FE-067" />
      </KpiStrip>,
    );
    const values = [...document.querySelectorAll(".exec-blk-kpi-value")].map((v) => v.textContent);
    expect(values).toEqual(["Not published (FE-072)", "Not published", "Not published", "Not published (FE-067)"]);
    const tips = [...document.querySelectorAll(".exec-blk-kpi-value .exec-blk-np")].map((n) => n.getAttribute("title"));
    expect(tips[1]).toBe(`Not published (FE-072): ${FE_REQUEST_LABEL["FE-072"]}`);
    // Every term keeps its own label, so a distinct gap is never merged.
    expect([...document.querySelectorAll("dt")].map((t) => t.textContent)).toEqual(["Equity", "Net PnL", "Fills", "Runtime"]);
  });

  it("the id moves to the next cell when the cell that carried it goes away", () => {
    const view = (first: boolean) => (
      <KpiStrip label="Figures">
        {first ? <Kpi label="A" notPublished="FE-072" /> : null}
        <Kpi label="B" notPublished="FE-072" />
      </KpiStrip>
    );
    const { rerender } = render(view(true));
    expect([...document.querySelectorAll(".exec-blk-kpi-value")].map((v) => v.textContent)).toEqual(["Not published (FE-072)", "Not published"]);
    rerender(view(false));
    expect([...document.querySelectorAll(".exec-blk-kpi-value")].map((v) => v.textContent)).toEqual(["Not published (FE-072)"]);
  });

  it("a Kpi outside any strip or panel prints its id", () => {
    render(
      <dl>
        <Kpi label="A" notPublished="FE-072" />
        <Kpi label="B" notPublished="FE-072" />
      </dl>,
    );
    expect([...document.querySelectorAll(".exec-blk-kpi-value")].map((v) => v.textContent)).toEqual(["Not published (FE-072)", "Not published (FE-072)"]);
  });

  it("keeps a 29-digit decimal exact: float digits never appear, the original rides on title", () => {
    render(
      <KpiStrip label="Totals">
        <Kpi label="NAV" metric={metric(BIG, "AVAILABLE", "qty")} suffix="USDT" basis="Virtual ledger" />
      </KpiStrip>,
    );
    const num = document.querySelector(".exec-blk-num") as HTMLElement;
    expect(num.getAttribute("title")).toBe(BIG);
    expect(num.getAttribute("data-full")).toBe(BIG);
    expect(num.textContent).toBe("12,345,678,901,234,567,890.12345679");
    expect(document.body.textContent).not.toContain("12345678901234567000");
    expect(screen.getByText("Virtual ledger")).toBeTruthy();
    expect(screen.getByText(/USDT/)).toBeTruthy();
  });

  it("labels the group and each term", () => {
    render(
      <KpiStrip label="Fleet totals">
        <Kpi label="Net PnL" metric={metric("1.50")} />
      </KpiStrip>,
    );
    const group = screen.getByRole("group", { name: "Fleet totals" });
    expect(within(group).getByText("Net PnL").tagName).toBe("DT");
  });

  it("prints a pre-formatted value, and Not available (never 0) when the screen has none", () => {
    render(
      <KpiStrip label="Counts">
        <Kpi label="Alphas" value="5" basis="In your scope" />
        <Kpi label="Portfolios" />
      </KpiStrip>,
    );
    expect(screen.getByText("Alphas").nextElementSibling?.querySelector(".exec-blk-kpi-value")?.textContent).toBe("5");
    expect(screen.getByText("Portfolios").nextElementSibling?.textContent).toBe("Not available");
  });

  it("keeps a Not published id in one unbreakable span", () => {
    render(<NotPublished id="FE-027/028" />);
    expect(document.querySelector(".exec-blk-np-id")?.textContent).toBe("FE-027/028");
    expect(document.body.textContent).toContain("Not published (FE-027/028)");
  });

  it("prints Not published (FE-xxx) and it wins over a metric", () => {
    render(<Kpi label="Window return" notPublished="FE-025" metric={metric("1.00")} />);
    expect(document.body.textContent).toContain("Not published");
    expect(document.body.textContent).toContain("(FE-025)");
    expect(document.querySelector(".exec-blk-num")).toBeNull();
  });

  it("prints the state word and the reason for an absence, and says so for unreadable and missing", () => {
    const { unmount } = render(<Kpi label="A" metric={absent("UNAVAILABLE", "SOURCE_GAP")} />);
    // The state word is the headline; the published code is behind the disclosure, never in the line.
    expect(screen.getByText("Not available")).toBeTruthy();
    expect(document.body.textContent).not.toContain("SOURCE_GAP");
    expect(whyText(screen.getByText("Not available").closest("span"))).toBe("SOURCE_GAP");
    unmount();
    const denied = render(<Kpi label="B" metric={absent("DENIED", "NO_GRANT")} />);
    expect(screen.getByText("Not permitted")).toBeTruthy();
    expect(whyText(screen.getByText("Not permitted").closest("span"))).toBe("NO_GRANT");
    denied.unmount();
    const bad = render(<Kpi label="C" metric={null} />);
    expect(screen.getByText("Not available · unreadable value")).toBeTruthy();
    bad.unmount();
    render(<Kpi label="D" absentReason="NOT_REQUESTED" />);
    expect(screen.getByText("Not available · NOT_REQUESTED")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(DASHES);
  });

  it("tones only a signed figure, only by its published sign, never a partial or an exact zero", () => {
    const { container, rerender } = render(<Kpi label="PnL" metric={metric("-12.5")} signed />);
    expect(container.querySelector(".exec-blk-num")?.getAttribute("data-tone")).toBe("negative");
    rerender(<Kpi label="PnL" metric={metric("12.5")} signed />);
    expect(container.querySelector(".exec-blk-num")?.getAttribute("data-tone")).toBe("positive");
    rerender(<Kpi label="Balance" metric={metric("12.5")} />);
    expect(container.querySelector(".exec-blk-num")?.getAttribute("data-tone")).toBeNull();
    rerender(<Kpi label="PnL" metric={metric("-12.5", "PARTIAL")} signed />);
    expect(container.querySelector(".exec-blk-num")?.getAttribute("data-tone")).toBeNull();
    expect(container.textContent).toContain("Partial");
    rerender(<Kpi label="PnL" metric={metric("0.00")} signed />);
    expect(container.querySelector(".exec-blk-num")?.getAttribute("data-tone")).toBeNull();
    expect(container.querySelector(".exec-blk-num")?.textContent).toBe("0.00");
  });
});

describe("SectionPanel, PanelHead and StateBoundary", () => {
  it("names the region by its heading and honours the level", () => {
    render(
      <SectionPanel title="Positions" level={2} aside="as of 17 Oct">
        body
      </SectionPanel>,
    );
    const region = screen.getByRole("region", { name: "Positions" });
    expect(within(region).getByRole("heading", { level: 2, name: "Positions" })).toBeTruthy();
    expect(within(region).getByText("as of 17 Oct")).toBeTruthy();
  });

  it("a state reason that is only a published code reads in the approved words, with the code behind the disclosure", () => {
    const { unmount } = render(<StateBoundary status="denied" reason="ADMIN_ROLE_REQUIRED" />);
    expect(document.body.textContent).toContain("Needs the Admin role");
    expect(document.body.textContent).not.toContain("ADMIN_ROLE_REQUIRED");
    expect(whyText(document.querySelector(".exec-blk-why"))).toBe("ADMIN_ROLE_REQUIRED");
    unmount();
    // A code with no approved wording prints the state word alone; the code is only in the disclosure.
    render(<StateBoundary status="partial" reason="MARGIN_BALANCES_NOT_PUBLISHED">body</StateBoundary>);
    expect(document.body.textContent).not.toContain("MARGIN_BALANCES_NOT_PUBLISHED");
    expect(whyText(document.querySelector(".exec-blk-why"))).toBe("MARGIN_BALANCES_NOT_PUBLISHED");
  });

  it("a reason that is already prose is printed as given, with no disclosure", () => {
    render(<StateBoundary status="unavailable" reason="The source did not answer." />);
    expect(document.body.textContent).toContain("The source did not answer.");
    expect(document.querySelector(".exec-blk-why")).toBeNull();
  });

  it("PanelHead renders a heading without a panel", () => {
    render(<PanelHead title="Trade log" level={4} />);
    expect(screen.getByRole("heading", { level: 4, name: "Trade log" })).toBeTruthy();
  });

  it("ok renders only the body", () => {
    const { container } = render(<StateBoundary status="ok">the body</StateBoundary>);
    expect(container.textContent).toBe("the body");
  });

  it.each([
    ["empty", "Nothing to show"],
    ["insufficient_data", "Insufficient data"],
    ["denied", "Withheld"],
    ["unavailable", "Unavailable"],
    ["terminal", "Failed"],
  ] as const)("%s replaces the body with the shared PanelState", (status, word) => {
    const props = status === "denied" || status === "unavailable" || status === "terminal"
      ? { status, reason: "Needs the Manager role" }
      : { status, reason: "No rows matched" };
    const { container } = render(<StateBoundary {...props}>the body</StateBoundary>);
    expect(screen.getByText(word)).toBeTruthy();
    expect(container.textContent).not.toContain("the body");
    expect(container.querySelector(".exec-state")?.getAttribute("data-status")).toBe(status);
  });

  it("loading is the skeleton with an announced status", () => {
    render(<StateBoundary status="loading">the body</StateBoundary>);
    expect(screen.getByRole("status", { name: "Loading" })).toBeTruthy();
  });

  it.each(["partial", "stale"] as const)("%s keeps the body, demoted, under the state line", (status) => {
    const { container } = render(<StateBoundary status={status} reason="Two sources behind">the body</StateBoundary>);
    expect(container.querySelector(".exec-state")?.getAttribute("data-status")).toBe(status);
    expect(container.querySelector(".exec-blk-demoted")?.textContent).toBe("the body");
  });

  it.each(["partial", "stale"] as const)("%s with quiet and no reason drops the generic state line but keeps the demoted body", (status) => {
    const { container } = render(<StateBoundary status={status} quiet>the body</StateBoundary>);
    expect(container.querySelector(".exec-state")).toBeNull();
    expect(container.textContent).not.toContain("The source gave no reason.");
    expect(container.querySelector(".exec-blk-demoted")?.textContent).toBe("the body");
  });

  it("quiet never hides a reason that was given", () => {
    const { container } = render(<StateBoundary status="stale" quiet reason="Two sources behind">the body</StateBoundary>);
    expect(container.querySelector(".exec-state")?.getAttribute("data-status")).toBe("stale");
    expect(container.textContent).toContain("Two sources behind");
  });
});

const ROWS: EventFeedRow[] = [
  { id: "e3", at: at(Date.UTC(2026, 9, 17, 9, 14)), kind: "recall", kindLabel: "Recall applied", target: "Core", outcome: "Budget returned" },
  { id: "e2", at: at(Date.UTC(2026, 9, 16, 8, 0)), kind: "approval", target: "BTC-Trend v3", outcome: "Sandbox exit approved", href: "/alphas/btc" },
  { id: "e1", at: at(Date.UTC(2026, 9, 1, 0, 5)), kind: "incident", target: "Binance-02", outcome: "Broker sync diverged" },
];

function Where() {
  const { pathname } = useLocation();
  return <output data-testid="where">{pathname}</output>;
}
const feedTree = (ui: ReactElement) => <MemoryRouter initialEntries={["/start"]}>{ui}<Where /></MemoryRouter>;
/** EventFeed links are router links, so the feed is rendered inside a router. */
function renderFeed(ui: ReactElement) {
  const view = render(feedTree(ui));
  return { ...view, rerender: (next: ReactElement) => view.rerender(feedTree(next)) };
}

describe("EventFeed", () => {
  it("renders UTC time, kind chip, target and outcome in source order, with a named table", () => {
    renderFeed(<EventFeed scope="BTC-Trend v3" rows={ROWS} />);
    const table = screen.getByRole("table", { name: "Events for BTC-Trend v3" });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(3);
    expect(rows[0].textContent).toContain("17 Oct 09:14Z");
    expect(rows[0].textContent).toContain("Recall applied");
    expect(rows[0].textContent).toContain("Budget returned");
    expect(rows[2].textContent).toContain("1 Oct 00:05Z");
    expect(within(table).getByRole("link", { name: "BTC-Trend v3" }).getAttribute("href")).toBe("/alphas/btc");
    expect(within(table).getAllByRole("columnheader").map((c) => c.textContent)).toEqual(["When (UTC)", "Kind", "Target", "Outcome"]);
    expect(screen.getByRole("region", { name: "Events" })).toBeTruthy();
  });

  it("adds Actor and Receipt only when some row has them, and says Not available for a gap", () => {
    renderFeed(<EventFeed scope="X" rows={[{ ...ROWS[0], actor: "bjones" }, ROWS[1]]} />);
    expect(screen.getByRole("columnheader", { name: "Actor" })).toBeTruthy();
    expect(screen.getAllByText("Not available").length).toBeGreaterThan(0);
  });

  it("empty ok-with-no-rows reads as empty, not as a blank table", () => {
    renderFeed(<EventFeed scope="BTC-Trend v3" rows={[]} />);
    expect(screen.getByText("Nothing to show")).toBeTruthy();
    expect(screen.getByText(/No events recorded for BTC-Trend v3/)).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("unavailable and denied carry their reason; a missing reason is said, not hidden", () => {
    const { unmount } = renderFeed(<EventFeed scope="X" rows={[]} status="unavailable" reason="Journal read timed out" />);
    expect(screen.getByText("Unavailable")).toBeTruthy();
    expect(screen.getByText("Journal read timed out")).toBeTruthy();
    unmount();
    renderFeed(<EventFeed scope="X" rows={[]} status="denied" />);
    expect(screen.getByText("No reason was published.")).toBeTruthy();
  });

  it("a feed with no source is Not published (FE-031)", () => {
    renderFeed(<EventFeed scope="INC-44" rows={ROWS} notPublished="FE-031" />);
    expect(document.body.textContent).toContain("Not published");
    expect(document.body.textContent).toContain("(FE-031)");
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("Load more follows the keyset contract: shown while hasMore, calls once, busy ignores clicks", () => {
    const onLoadMore = vi.fn();
    const { rerender } = renderFeed(<EventFeed scope="X" rows={ROWS} cursor={{ hasMore: true, onLoadMore }} />);
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
    rerender(<EventFeed scope="X" rows={ROWS} cursor={{ hasMore: true, loadingMore: true, onLoadMore }} />);
    const busy = screen.getByRole("button", { name: "Loading more" });
    expect(busy.getAttribute("aria-busy")).toBe("true");
    expect(busy.hasAttribute("disabled")).toBe(false);
    expect(busy.getAttribute("aria-disabled")).toBeNull();
    fireEvent.click(busy);
    expect(onLoadMore).toHaveBeenCalledTimes(1);
    rerender(<EventFeed scope="X" rows={ROWS} cursor={{ hasMore: false, onLoadMore }} />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("a failed page is announced, keeps the rows, and offers Try again", () => {
    const onLoadMore = vi.fn();
    renderFeed(<EventFeed scope="X" rows={ROWS} cursor={{ hasMore: true, error: "Timed out", onLoadMore }} />);
    expect(screen.getByRole("alert").textContent).toContain("Could not load more events");
    expect(screen.getAllByRole("row")).toHaveLength(4);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it("an internal row link is handled by the router: the click is prevented (no page load) and the location changes", () => {
    renderFeed(<EventFeed scope="X" rows={ROWS} />);
    const link = screen.getByRole("link", { name: "BTC-Trend v3" });
    const notPrevented = fireEvent.click(link);
    expect(notPrevented).toBe(false);
    expect(screen.getByTestId("where").textContent).toBe("/alphas/btc");
  });

  it("an href with a scheme stays a plain anchor", () => {
    renderFeed(<EventFeed scope="X" rows={[{ ...ROWS[1], href: "https://example.test/x" }]} />);
    const link = screen.getByRole("link", { name: "BTC-Trend v3" });
    expect(link.getAttribute("href")).toBe("https://example.test/x");
  });

  it.each(["javascript:alert(1)", "data:text/html,x", "//evil.example/x", "/\\evil.example", "/\tevil", "https://a b", "ftp://x"])(
    "an unsafe href %j is text, not a link",
    (href) => {
      renderFeed(<EventFeed scope="X" rows={[{ ...ROWS[1], href }]} />);
      expect(screen.queryByRole("link", { name: "BTC-Trend v3" })).toBeNull();
      expect(screen.getByText("BTC-Trend v3")).toBeTruthy();
    },
  );

  it("bare drops the panel chrome", () => {
    renderFeed(<EventFeed scope="X" rows={ROWS} bare />);
    expect(screen.queryByRole("region")).toBeNull();
    expect(screen.getByRole("table")).toBeTruthy();
  });
});

describe("JourneySpine", () => {
  it("with nothing published every stage is Unknown and the current stage is Not published", () => {
    render(<JourneySpine />);
    const list = screen.getByRole("list", { name: "Lifecycle" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(6);
    for (const item of items) {
      expect(item.getAttribute("data-s")).toBe("unknown");
      // One quiet state: the word is there for assistive tech only, no chip and no sentence per card.
      expect(item.textContent).toContain("Unknown");
      expect(item.querySelector(".exec-flag")).toBeNull();
      expect(item.querySelector(".exec-blk-spine-line")).toBeNull();
      expect(item.textContent).not.toContain("Not published");
      expect(item.textContent).not.toContain("Stage history");
    }
    expect(within(list).queryByText("Done")).toBeNull();
    expect(within(list).queryByText("Now")).toBeNull();
    expect(document.body.textContent).toContain("Current stage");
    expect(document.body.textContent).not.toMatch(DASHES);
  });

  it("current stage comes from props only; earlier stages stay Unknown, later ones Not reached; nothing is inferred done", () => {
    render(<JourneySpine current="sandbox" />);
    const states = screen.getAllByRole("listitem").map((li) => li.getAttribute("data-s"));
    expect(states).toEqual(["unknown", "unknown", "unknown", "cur", "ahead", "ahead"]);
    expect(screen.queryByText("Done")).toBeNull();
    expect(screen.getAllByText("Not reached")).toHaveLength(2);
    const now = screen.getAllByRole("listitem")[3];
    expect(now.getAttribute("aria-current")).toBe("step");
    // UXM07-048/3: the card prints only published facts; the one note under the list names the gap
    expect(now.textContent).not.toContain("Days in stage");
    expect(now.textContent).not.toContain("Gate criteria");
    expect(now.textContent).not.toContain("Decider");
    expect(now.textContent).not.toContain("Not published");
    expect(document.body.textContent).toContain("Days in stage, gate criteria and decider");
  });

  it("renders published facts and a done stage only when the source says done", () => {
    render(
      <JourneySpine
        current="canary"
        stages={{
          r1: { outcome: "done", decidedBy: "bjones", line: "Approved 02 Jul 10:00Z" },
          canary: { daysInStage: 12, criteria: { met: 5, total: 7 }, decider: "Manager" },
        }}
      />,
    );
    const items = screen.getAllByRole("listitem");
    expect(items[0].getAttribute("data-s")).toBe("done");
    expect(items[0].textContent).toContain("Approved");
    expect(items[0].textContent).toContain("By bjones");
    expect(items[1].getAttribute("data-s")).toBe("unknown");
    const canary = items[4];
    expect(canary.textContent).toContain("12");
    expect(canary.textContent).toContain("days in stage");
    expect(canary.textContent).toContain("5 of 7 criteria met");
    expect(canary.textContent).toContain("Decides: Manager");
    expect(canary.textContent).not.toContain("Not published");
  });

  it("a blocked current stage says Blocked and shows the published reason", () => {
    render(<JourneySpine current="paper" blocked stages={{ paper: { daysInStage: 3, blockedReason: "Drift over limit" } }} />);
    const paper = screen.getAllByRole("listitem")[2];
    expect(paper.getAttribute("data-s")).toBe("blk");
    expect(paper.textContent).toContain("Blocked");
    expect(paper.textContent).toContain("Drift over limit");
  });

  it("uses the Real-funded domain word for Canary and Live and Simulated for Paper and Sandbox", () => {
    render(<JourneySpine current="live" />);
    const items = screen.getAllByRole("listitem");
    expect(items[2].textContent).toContain("Simulated");
    expect(items[3].textContent).toContain("Simulated");
    expect(items[4].textContent).toContain("Real-funded domain");
    expect(items[5].textContent).toContain("Real-funded domain");
    expect(items[5].textContent).toContain("No exit gate");
  });

  it("rejects non-integer day counts instead of printing them", () => {
    render(<JourneySpine current="paper" stages={{ paper: { daysInStage: 1.5 } }} />);
    expect(screen.getAllByRole("listitem")[2].textContent).not.toContain("1.5");
    // UXM07-048/3: an unusable day count is not drawn, and no gap word takes its place on the card
    expect(screen.getAllByRole("listitem")[2].textContent).not.toContain("Days in stage");
  });

  it("compact is a labelled stepper whose nodes are buttons only when selectable", () => {
    const onSelect = vi.fn();
    const { rerender } = render(<JourneySpine variant="compact" current="paper" />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.getAllByRole("img")).toHaveLength(6);
    rerender(<JourneySpine variant="compact" current="paper" onSelect={onSelect} selected="sandbox" />);
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(6);
    expect(buttons[2].getAttribute("aria-label")).toBe("Paper, Now");
    expect(buttons[3].getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(buttons[4]);
    expect(onSelect).toHaveBeenCalledWith("canary");
  });

  it("mini is one named image listing every stage and its state", () => {
    render(<JourneySpine variant="mini" current="r2" stages={{ r1: { outcome: "done" } }} />);
    const img = screen.getByRole("img");
    const name = img.getAttribute("aria-label") ?? "";
    expect(name).toContain("R1 gate, Done");
    expect(name).toContain("R2 gate, Now");
    expect(name).toContain("Live, Later");
    expect(img.querySelectorAll("i")).toHaveLength(6);
  });

  it("mini with nothing published says Unknown for all six", () => {
    render(<JourneySpine variant="mini" />);
    const name = screen.getByRole("img").getAttribute("aria-label") ?? "";
    expect(name.match(/Unknown/g)).toHaveLength(6);
  });

  it("full variant nodes are buttons with aria-pressed when onSelect is given", () => {
    const onSelect = vi.fn();
    render(<JourneySpine current="paper" onSelect={onSelect} selected="paper" />);
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(6);
    expect(buttons[2].getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(buttons[0]);
    expect(onSelect).toHaveBeenCalledWith("r1");
  });

  it("spineNodeState is pure vocabulary: position is not history", () => {
    expect(SPINE_STAGE_IDS.map((id) => spineNodeState(id, "paper", false, undefined))).toEqual([
      "unknown", "unknown", "cur", "ahead", "ahead", "ahead",
    ]);
    expect(spineNodeState("r1", null, false, { outcome: "done" })).toBe("done");
  });

  describe("compact scroll region (UXM-10 F-5 / RV-05, scrollable-region-focusable)", () => {
    /** jsdom has no layout: say how wide the content is against the box. */
    const overflow = (scroll: number, client: number) => {
      vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(scroll);
      vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(client);
    };
    afterEach(() => vi.restoreAllMocks());

    it("is a plain div with no Tab stop while the stepper fits", () => {
      overflow(400, 400);
      const { container } = render(<JourneySpine variant="compact" current="paper" />);
      const box = container.querySelector(".exec-blk-spine")!;
      expect(box.getAttribute("tabindex")).toBeNull();
      expect(box.getAttribute("role")).toBeNull();
    });

    it("becomes a named, focusable region while it overflows and holds nothing focusable", () => {
      overflow(700, 300);
      render(<JourneySpine variant="compact" current="paper" />);
      const region = screen.getByRole("region", { name: "Lifecycle, scrolls sideways" });
      expect(region.getAttribute("tabindex")).toBe("0");
      expect(region.className).toBe("exec-blk-spine");
    });

    it("adds no Tab stop when the stages are buttons (they already take focus) or in the full variant that fits", () => {
      overflow(700, 300);
      const { container } = render(<JourneySpine variant="compact" current="paper" onSelect={() => undefined} />);
      expect(container.querySelector(".exec-blk-spine")!.getAttribute("tabindex")).toBeNull();
      expect(screen.queryByRole("region")).toBeNull();
    });
  });
});

describe("Triad", () => {
  const rows = [
    { key: "cash", label: "Cash", suffix: "USDT", internal: metric(BIG), broker: metric("12345678901234567890.1"), difference: metric("-0.0235") },
    { key: "pos", label: "Position", internal: metric("1.5", "AVAILABLE", "qty"), broker: absent("UNAVAILABLE", "VENUE_GAP"), difference: { kind: "not-computed", reason: "SHARED_BINDING" } as const },
  ];

  it("prints the three columns with exact values, as-of captions and signed difference tone", () => {
    render(<Triad rows={rows} internal={{ asOf: at(Date.UTC(2026, 9, 17, 9, 14)) }} broker={{ asOf: null }} />);
    const group = screen.getByRole("group", { name: "Reconciliation" });
    const [internal, broker, diff] = within(group).getAllByRole("region");
    expect(internal.textContent).toContain("Virtual ledger · 17 Oct 09:14Z");
    expect(broker.textContent).toContain("Venue report · Not available");
    expect(diff.textContent).toContain("Derived · matching scopes only");
    const exact = internal.querySelector(".exec-blk-num") as HTMLElement;
    expect(exact.getAttribute("title")).toBe(BIG);
    expect(exact.getAttribute("data-tone")).toBeNull();
    expect(broker.querySelector(".exec-blk-num")?.getAttribute("data-tone")).toBeNull();
    expect(diff.querySelector(".exec-blk-num")?.getAttribute("data-tone")).toBe("negative");
  });

  it("says Not available for an absent metric and Not computed for a published non-computation", () => {
    render(<Triad rows={rows} />);
    expect(document.body.textContent).not.toContain("VENUE_GAP");
    expect(whyText(screen.getAllByText("Not available").find((n) => n.closest("[data-state]") !== null)!.closest("span"))).toBe("VENUE_GAP");
    // Visible words are "Not computed"; the code is behind the disclosure, not in the line.
    const computed = screen.getByText("Not computed");
    expect(computed.getAttribute("title")).toBeNull();
    expect(document.body.textContent).not.toContain("SHARED_BINDING");
    expect(whyText(computed)).toBe("SHARED_BINDING");
  });

  it("an absent side prints Not available in every row, never a value or a zero difference", () => {
    render(<Triad rows={rows} broker={null} />);
    const broker = screen.getAllByRole("region")[1];
    expect(within(broker).getAllByText("Not available")).toHaveLength(2);
    expect(broker.querySelector(".exec-blk-num")).toBeNull();
  });

  it("an unreadable cell is said, a missing cell is Not available, nothing prints a dash", () => {
    render(<Triad rows={[{ key: "x", label: "X", internal: null }]} />);
    expect(screen.getByText("Not available · unreadable value")).toBeTruthy();
    expect(screen.getAllByText("Not available").length).toBe(2);
    expect(document.body.textContent).not.toMatch(DASHES);
  });

  it("never tones a partial difference", () => {
    render(<Triad rows={[{ key: "x", label: "X", difference: metric("-5.00", "PARTIAL") }]} />);
    expect(document.querySelector(".exec-blk-num")?.getAttribute("data-tone")).toBeNull();
  });
});

describe("NaWhy and NotAvailableLine · the reason is in the DOM behind a button, never only in a title (RV-06)", () => {
  it("NaWhy with a reason: the cell still says `Not available`, the button opens the reason, no title anywhere", () => {
    render(<NaWhy reason="Flat: no entry price" />);
    const button = screen.getByRole("button", { name: "Not available, reason" });
    expect(button.textContent).toBe("Not available");
    expect(document.querySelectorAll("[title]")).toHaveLength(0);
    expect(document.body.textContent).not.toContain("Flat: no entry price");
    expect(button.tabIndex).toBe(0);
    expect(whyText(button)).toBe("Flat: no entry price");
    fireEvent.click(button);
    expect(document.getElementById(button.getAttribute("aria-controls")!)!.textContent).toContain(GAP_NEXT);
  });

  it("NaWhy without a reason is the plain words: nothing to open, no button", () => {
    render(<NaWhy reason={null} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(document.body.textContent).toBe("Not available");
  });

  it("NotAvailableLine: the visible part is the labels; per-fact id and reason sit behind one disclosure; no title", () => {
    render(
      <NotAvailableLine
        facts={[
          { label: "Fees", id: "FE-025", why: "WINDOW_NOT_OFFERED" },
          { label: "Funding", why: "Counted separately" },
        ]}
      />,
    );
    const line = screen.getByTestId("not-available-line");
    expect(line.hasAttribute("title")).toBe(false);
    expect(document.querySelectorAll("[title]")).toHaveLength(0);
    expect(line.textContent).toContain("Not available: Fees, Funding");
    expect(line.textContent).not.toContain("WINDOW_NOT_OFFERED");
    const text = whyText(line);
    expect(text).toContain(`Fees: Not published (FE-025) ${FE_REQUEST_LABEL["FE-025"]} · WINDOW_NOT_OFFERED`);
    expect(text).toContain("Funding: Counted separately");
  });
});

describe("hygiene of the block sources", () => {
  const dir = __dirname;
  const sources = readdirSync(dir)
    .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f))
    .map((f) => ({ f, text: readFileSync(join(dir, f), "utf8") }));

  it("finds the block sources", () => {
    expect(sources.length).toBeGreaterThanOrEqual(10);
  });

  it("no source prints a dash, N/A, a disabled button or converts a decimal through Number()", () => {
    for (const { f, text } of sources) {
      expect(text, f).not.toMatch(/—/);
      expect(text, f).not.toMatch(/"N\/A"/);
      expect(text, f).not.toMatch(/<button[^>]*(?<![-\w])disabled\b/);
      expect(text, f).not.toMatch(/\b(?:Number|parseFloat)\(\s*(?:value|decimal|metric|row\.(?:qty|price|fee))/);
      expect(text, f).not.toMatch(/\.toFixed\(/);
    }
  });
});

describe("JourneySpine gap note (L-B2)", () => {
  it("prints the gap once, under the list, and no card repeats it", () => {
    const { container } = render(<JourneySpine current="sandbox" />);
    const list = screen.getByRole("list", { name: "Lifecycle" });
    const visible = [...container.querySelectorAll(".exec-blk-np")].filter((n) => !n.hasAttribute("data-compact") && !list.contains(n));
    const notes = container.querySelectorAll(".exec-blk-spine-note");
    // one note for the whole spine: no current-stage note here, only the gap note
    expect(notes).toHaveLength(1);
    expect(visible).toHaveLength(1);
    expect(notes[0].textContent).toContain("Not published (FE-027/028)");
    expect(notes[0].nextElementSibling).toBeNull();
    expect(list.nextElementSibling).toBe(notes[0]);
    // UXM07-048/3: no card carries a gap word of its own (compact or hidden); the note under the list is the one statement
    expect(list.querySelectorAll("[data-compact]")).toHaveLength(0);
    expect(list.querySelectorAll(".exec-blk-np")).toHaveLength(0);
    expect(list.textContent).not.toContain("Not published");
    // the visible short labels carry no id of their own
    for (const short of container.querySelectorAll(".exec-blk-np-short")) expect(short.textContent).not.toContain("FE-");
  });

  it("with the current stage missing keeps its note and adds the gap note", () => {
    const { container } = render(<JourneySpine />);
    expect(container.querySelectorAll(".exec-blk-spine-note")).toHaveLength(2);
    expect(container.textContent).toContain("Current stage");
  });

  it("a published current stage still leaves the earlier stages unknown, so the note stays; compact and mini add none", () => {
    const full = render(
      <JourneySpine current="live" stages={{ live: { daysInStage: 4, decider: "Manager" } }} />,
    );
    expect(full.container.querySelectorAll(".exec-blk-spine-note")).toHaveLength(1);
    cleanup();
    const compact = render(<JourneySpine variant="compact" />);
    expect(compact.container.querySelector("[data-compact]")).toBeNull();
    expect(compact.container.querySelectorAll(".exec-blk-spine-note")).toHaveLength(1); // the missing-current note only
    cleanup();
    const mini = render(<JourneySpine variant="mini" />);
    expect(mini.container.querySelector(".exec-blk-spine-note")).toBeNull();
  });
});

describe("PanelHead lead (OV-6)", () => {
  it("keeps the heading's accessible name equal to the title when a lead is given", () => {
    render(
      <SectionPanel title="Performance" lead={<button type="button">Net PnL</button>} aside="meta">
        <p>body</p>
      </SectionPanel>,
    );
    expect(screen.getByRole("region", { name: "Performance" })).toBeTruthy();
    const heading = screen.getByRole("heading", { name: "Performance" });
    expect(heading.parentElement?.className).toBe("exec-blk-ph-main");
    expect(heading.nextElementSibling?.textContent).toBe("Net PnL");
    expect(heading.parentElement?.nextElementSibling?.className).toBe("exec-blk-ph-aside");
  });

  it("without a lead the head is exactly what it was", () => {
    const { container } = render(<PanelHead title="Trade log" level={4} id="x" aside="n" />);
    expect(container.innerHTML).toBe(
      '<header class="exec-blk-ph"><h4 id="x" class="exec-blk-ph-title">Trade log</h4><span class="exec-blk-ph-aside">n</span></header>',
    );
  });
});
