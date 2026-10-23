/**
 * Alpha 360 and Trade Replay on the PREVIEW lane (WP-C, FIXTURE_LAB): the same answer order as the fixture BFF, populated profile,
 * medium scale. The default audit subjects (alpha_a, alpha_btc_trend) were the emptiest ones; they now answer through the same routes
 * and readers, so the design's spine, tiles, ribbon and replay lanes are drawn from the published readers' bodies, not from props.
 * Nothing here proves what the real Edge returns.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { V2_ROLE_PRESETS } from "../../shell/roleNav";
import AlphaScreen from "./index";
import { endPreviewLane, startPreviewLane } from "./previewLane.testbase";
import { sessionOf } from "./testApi";

const session = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("../../../../auth/session", () => ({ useSession: () => session.current }));
// The V1 replay chart is canvas; its props are what the page hands it.
const replayProps = vi.hoisted(() => ({ last: null as null | { lanes?: unknown; market?: unknown; orderLink?: unknown } }));
vi.mock("../../../components/TradeReplayEvents", () => ({
  TradeReplayEvents: (props: { lanes?: unknown; market?: unknown }) => {
    replayProps.last = props;
    return <div data-testid="v1-replay">V1 replay{props.lanes as never}</div>;
  },
}));

beforeEach(() => { session.current = sessionOf(V2_ROLE_PRESETS.manager); });
afterEach(() => { cleanup(); endPreviewLane(); });

function mount(entry: string, alphaId: string) {
  const lane = startPreviewLane();
  render(
    <MemoryRouter initialEntries={[entry]}>
      <AlphaScreen api={lane.api} alphaId={alphaId} />
    </MemoryRouter>,
  );
  return lane;
}
const spine = () => screen.findByRole("list", { name: "Alpha lifecycle" });
const tile = (label: string) => screen.getByText(label, { selector: "dt" }).closest(".exec-blk-kpi") as HTMLElement;

describe("Alpha 360 spine and tiles for alpha_a (live book)", () => {
  it("draws R1 to Live with days in stage, criteria, exit dates, actors and the decider, from the dataset's published keys", async () => {
    mount("/deployments/alphas/alpha_a", "alpha_a");
    const list = await spine();
    await waitFor(() => expect(within(list).getAllByText(/days in stage/).length).toBe(4));
    const nodes = within(list).getAllByRole("listitem");
    expect(nodes).toHaveLength(6);
    // R1 and R2: approved, dated, by an actor. Paper, Sandbox, Canary: days, 7 of 7 criteria, exit date and actor. Live: now, no exit gate.
    expect(within(nodes[0]!).getByText("Approved")).toBeTruthy();
    expect(within(nodes[0]!).getByText(/^By \w+/)).toBeTruthy();
    for (const index of [2, 3, 4]) {
      expect(within(nodes[index]!).getByText("7 of 7 criteria met")).toBeTruthy();
      expect(within(nodes[index]!).getByText(/^Exit \d\d \w{3} · \w+/)).toBeTruthy();
    }
    expect(within(nodes[5]!).getByText("No exit gate")).toBeTruthy();
    expect(within(nodes[5]!).getByText("Decides: Manager")).toBeTruthy();
    // Nothing was inferred: the one "Not published" note under the spine is gone because no card needed it.
    expect(screen.queryByText(/Days in stage, gate criteria and decider/)).toBeNull();
  });

  it("offers the Live / In Sandbox / Blocked state toggle: Live is this alpha's own, the others are a labelled preview", async () => {
    mount("/deployments/alphas/alpha_a", "alpha_a");
    await spine();
    const group = await screen.findByRole("group", { name: "Stage state" });
    expect(within(group).getByRole("button", { name: "Live" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByText(/Preview of how the spine reads/)).toBeNull();
    fireEvent.click(within(group).getByRole("button", { name: "In Sandbox" }));
    expect(await screen.findByText(/Preview of how the spine reads in this state\. This alpha is in Live/)).toBeTruthy();
    expect(within(await spine()).getAllByRole("listitem")[3]!.getAttribute("aria-current")).toBe("step");
    fireEvent.click(within(group).getByRole("button", { name: "Blocked" }));
    expect(await screen.findByText("Criterion 6 of 7 is not met")).toBeTruthy();
    fireEvent.click(within(group).getByRole("button", { name: "Live" }));
    await waitFor(() => expect(screen.queryByText(/Preview of how the spine reads/)).toBeNull());
  });

  it("fills Return, Max drawdown, Regime fit and the QBTS from the published keys", async () => {
    mount("/deployments/alphas/alpha_a", "alpha_a");
    await spine();
    await waitFor(() => expect(tile("Return").textContent).toMatch(/\d%/));
    expect(tile("Max drawdown").textContent).toMatch(/-\d+(\.\d+)?%/);
    // Regime fit is a ratio, or the typed absence apart from the score, never a dash and never 0.
    await waitFor(() => expect(tile("Regime fit").textContent).toMatch(/(\d\.\d{4})|Insufficient data/));
    expect(tile("Regime fit").textContent).toContain("Separate from score");
    // The QBTS is the dataset's own published score (WP-A's keys: row key `score`, open `qbts_*` partition keys). Where it is published the chip and the tile print it
    // with its band and the Score drawer prints the same figures; where the dataset says insufficient evidence, the chip keeps the policy words and the tile is the typed absence.
    const probe = startPreviewLane();
    const read = await probe.api.getManagerDataset({ surface: "ALPHA", id: "alpha_a", environment: "live", limit: 50 });
    const score = read.ok ? read.value.items[0]?.metrics.score : undefined;
    expect(score).toBeDefined();
    if (score !== undefined && score.kind === "value") {
      await waitFor(() => expect(screen.getByRole("button", { name: /QBTS \d/ })).toBeTruthy());
      expect(tile("QBTS").textContent).toContain(score.exact);
      fireEvent.click(screen.getByRole("button", { name: /QBTS \d/ }));
      expect(await screen.findByText("Published by the dataset.", { exact: false })).toBeTruthy();
    } else {
      expect(screen.getByRole("button", { name: /Not scored/ })).toBeTruthy();
      await waitFor(() => expect(tile("QBTS").textContent).toMatch(/Not available/));
    }
  });
});

describe("the event ribbon is pinned on the Performance chart", () => {
  it("draws the five lanes with the published events, kind chips with counts, and the drawdown strip from the alpha's DRAWDOWN series (WP-K, FIXTURE_LAB)", async () => {
    mount("/deployments/alphas/alpha_a", "alpha_a");
    const ribbon = await screen.findByRole("group", { name: "Events and stages" });
    expect(ribbon).toBeTruthy();
    const chips = await screen.findByRole("group", { name: "Event kinds" });
    const count = (kind: string) => within(chips).getByRole("button", { name: new RegExp(kind) }).textContent ?? "";
    await waitFor(() => expect(count("Stage")).toMatch(/4$/));
    expect(count("Decision")).toMatch(/[67]$/);
    expect(count("Incident")).toMatch(/[23]$/);
    expect(count("Recall")).toMatch(/1$/);
    expect(count("Flow")).toMatch(/2$/);
    // The pane is the published DRAWDOWN series of this alpha (a ratio stated as a fraction, shown in %), with its caption; the typed absence is gone.
    const caption = await screen.findByTestId("drawdown-caption", {}, { timeout: 4000 });
    expect(caption.textContent).toMatch(/^Drawdown, a ratio stated as a fraction \(1\.0 is 100%\), shown in % · /);
    expect(await screen.findByTestId("drawdown-pane")).toBeTruthy();
    expect(document.body.textContent).not.toContain("Not published (FE-025)");
    // Every kind has a source in the dataset, so the gap line is not printed on this chart.
    expect(document.querySelector(".exec-alp2-cap")?.textContent ?? "").not.toMatch(/Incident, Recall/);
  });
});

describe("the published lifecycle read (WP-K slice 5, FIXTURE_LAB)", () => {
  it("Performance prints Net PnL per venue in each venue's own currency, one row per venue and book, never a total", async () => {
    mount("/deployments/alphas/alpha_a", "alpha_a");
    const table = await screen.findByTestId("venue-pnl", {}, { timeout: 4000 });
    const rows = within(table).getAllByRole("row");
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(row.textContent).toMatch(/USDT|BTC|USDC|[A-Z]{3,5}/);
    expect(table.textContent).not.toMatch(/Total/i);
    expect(screen.getByText("Per venue, never summed")).toBeTruthy();
  });
  it("the regime tile and the spine read the same alpha through the lifecycle read", async () => {
    mount("/deployments/alphas/alpha_a", "alpha_a");
    await screen.findByTestId("venue-pnl", {}, { timeout: 4000 });
    expect(document.body.textContent).toMatch(/Regime fit/);
    expect(document.body.textContent).toMatch(/Exit \d{2} [A-Z][a-z]{2}/);
  });
});

describe("Trade Replay is its own screen", () => {
  it("has its own title, subtitle and chips at the same address, and draws STAGE / DECISION / INCIDENT lanes under the chart", async () => {
    mount("/deployments/alphas/alpha_btc_trend?tab=replay", "alpha_btc_trend");
    expect(await screen.findByRole("heading", { level: 1, name: "Trade Replay" })).toBeTruthy();
    expect(screen.getByText(/^Fills on candles · /)).toBeTruthy();
    await screen.findByTestId("v1-replay");
    const lanes = await screen.findByTestId("replay-lanes");
    expect(within(lanes).getByRole("group", { name: "Stage, decision and incident events" })).toBeTruthy();
    expect(lanes.textContent).toMatch(/\d+ events? in this window/);
  });

  it("hands the replay log an order link: an order id opens that order on Orders & Fills with focus=order:<id>", async () => {
    mount("/deployments/alphas/alpha_btc_trend?tab=replay", "alpha_btc_trend");
    await screen.findByTestId("v1-replay");
    const link = (replayProps.last as unknown as { orderLink: (id: string) => React.ReactElement }).orderLink("ord_007");
    cleanup();
    render(<MemoryRouter>{link}</MemoryRouter>);
    const anchor = screen.getByRole("link", { name: "ord_007" });
    expect(anchor.getAttribute("href")).toContain("/deployments/alphas/alpha_btc_trend?tab=orders");
    expect(anchor.getAttribute("href")).toContain("focus=order%3Aord_007");
  });

  it("reaches the honest 'candles not available' state from the design-preview toggle: the venue read is skipped, the log and the lanes stay", async () => {
    const lane = mount("/deployments/alphas/alpha_btc_trend?tab=replay", "alpha_btc_trend");
    await screen.findByTestId("v1-replay");
    await waitFor(() => expect(lane.callsTo("/market/venue-candles").length).toBeGreaterThan(0));
    const before = lane.callsTo("/market/venue-candles").length;
    const preview = screen.getByRole("group", { name: "Design preview" });
    fireEvent.click(within(preview).getByRole("button", { name: "Candles not available" }));
    expect(await screen.findByText("Candles not qualified")).toBeTruthy();
    expect(screen.getByText(/Design preview: candles are switched off/)).toBeTruthy();
    expect(screen.getByTestId("v1-replay")).toBeTruthy();
    expect(lane.callsTo("/market/venue-candles").length).toBe(before);
    expect(replayProps.last?.market ?? null).toBeNull();
    fireEvent.click(within(preview).getByRole("button", { name: "Candles available" }));
    await waitFor(() => expect(screen.queryByText("Candles not qualified")).toBeNull());
  });
});
