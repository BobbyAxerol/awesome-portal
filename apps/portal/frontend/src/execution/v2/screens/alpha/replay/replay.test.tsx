/**
 * Trade Replay: the fills log first, candles only when the venue source says
 * READY for the symbol on show, the banner and its reason otherwise, and the
 * deep link `focus=order:<id>`. The V1 panel is a stub that records its props;
 * everything else runs through the real client, readers and frame.
 */
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ALPHA_DOUBLE_ID, answerAlpha } from "../../../../../../e2e/bffDoubleAlpha";
import type { TradeReplayEventsProps } from "../../../../components/TradeReplayEvents";
import { V2_ROLE_PRESETS } from "../../../shell/roleNav";
import AlphaScreen from "../index";
import { alphaHttpApi, serveAlphaDouble, sessionOf, type Override } from "../testApi";
import AlphaReplay, { REPLAY_SCREEN_KEY } from "./index";

const seen = vi.hoisted(() => ({ props: null as unknown }));
const session = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("../../../../../auth/session", () => ({ useSession: () => session.current }));
vi.mock("../../../../components/TradeReplayEvents", () => ({
  TradeReplayEvents: (props: unknown) => {
    seen.props = props;
    return <div data-testid="v1-replay">V1 replay</div>;
  },
}));

beforeEach(() => {
  session.current = sessionOf(V2_ROLE_PRESETS.manager);
  seen.props = null;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const props = () => seen.props as TradeReplayEventsProps;

function mount(entry = "/replay", override?: Override, alphaId = ALPHA_DOUBLE_ID) {
  const served = serveAlphaDouble(override);
  const view = render(
    <MemoryRouter initialEntries={[entry]}>
      <AlphaReplay api={alphaHttpApi()} alphaId={alphaId} />
    </MemoryRouter>,
  );
  return { ...served, view };
}

const panel = () => screen.findByRole("region", { name: "Trade Replay" });
const chip = (label: string) =>
  within(screen.getByRole("list", { name: "Replay scope" })).getAllByRole("listitem").find((li) => li.textContent?.startsWith(label))?.textContent ?? "";

async function settled() {
  await panel();
  await screen.findByTestId("v1-replay");
  await act(async () => { await new Promise((r) => setTimeout(r, 40)); });
}

describe("the page", () => {
  it("is the replay flag's screen, with a masthead and a way back to the alpha", async () => {
    expect(REPLAY_SCREEN_KEY).toBe("replay");
    mount();
    expect(screen.getByRole("heading", { level: 1, name: "Trade Replay" })).toBeTruthy();
    await settled();
    expect(screen.getByText("Fills on candles · BTC-Trend v3")).toBeTruthy();
    expect(screen.getByRole("link", { name: "BTC-Trend v3" }).getAttribute("href")).toBe(`/deployments/alphas/${ALPHA_DOUBLE_ID}`);
  });

  it("opens on the first symbol with the whole retained window of orders and fills, as the source's strings", async () => {
    mount();
    await settled();
    expect(props().orders.map((o) => o.orderId)).toEqual(["ord_001", "ord_002", "ord_003", "ord_004", "ord_005", "ord_007"]);
    expect(props().fills.map((f) => f.price)).toEqual(["67200.50", "67410.55", "67411.00"]);
    expect(props().symbol).toBe("BTCUSDT");
    // Symbol and Interval are the chart bar's selects; the scope chips do not name them again.
    expect(screen.queryByText("Symbol", { selector: ".exec-blk-chip-label" })).toBeNull();
    expect(screen.queryByText("Interval", { selector: ".exec-blk-chip-label" })).toBeNull();
    expect(props().interval).toBe("1h");
    expect(props().plain).toBe(true);
    expect(chip("Book")).toBe("Book Real-funded");
    expect(chip("Account")).toBe("Account acct_binance_02");
    expect(props().intervalNote).toBe("Interval derived from the strategy id");
  });
});

describe("candles are qualified by the venue source, per symbol", () => {
  it("BTCUSDT: venue klines READY, drawn, no banner, the Trading System's own candles named unavailable beside them", async () => {
    mount();
    await settled();
    expect(screen.queryByText("Candles not qualified")).toBeNull();
    expect(props().market?.state).toBe("READY");
    expect(props().market?.candles.length).toBeGreaterThan(20);
    expect(props().candles.state).toBe("UNAVAILABLE");
    expect(props().candles.reason).toContain("bff_double_gap");
  });

  it("ETHUSDT: the venue says UNAVAILABLE, so no candle is passed down and the banner says why", async () => {
    mount();
    await settled();
    act(() => props().onSymbolChange?.("ETHUSDT"));
    await waitFor(() => expect(screen.getByText("Candles not qualified")).toBeTruthy());
    await waitFor(() => expect(props().symbol).toBe("ETHUSDT"));
    const note = screen.getByRole("note");
    expect(note.textContent).toContain("No candles are drawn until the market-data source is qualified. Fills and the trade log stay.");
    await waitFor(() => expect(note.textContent).toContain("ETHUSDT: venue candles unavailable (E5_MARKET_CANDLES_NOT_PUBLISHED)"));
    expect(props().market).toBeNull();
    expect(props().orders.length).toBeGreaterThan(0);
  });

  it("asks for the right candles: the alpha's venue, the symbol, the fitted interval, a window around the trades; both sources", async () => {
    const { callsTo } = mount();
    await settled();
    const venue = new URL(callsTo("venue-candles")[0], "http://portal.test").searchParams;
    expect(Object.fromEntries(venue)).toMatchObject({ environment: "live", venue: "BINANCE", market: "USDM", symbol: "BTCUSDT", interval: "1h" });
    const from = Number(venue.get("from_ms"));
    const to = Number(venue.get("to_ms"));
    expect(to - from).toBeGreaterThan(6 * 3_600_000);
    const context = new URL(callsTo("/market/candles")[0], "http://portal.test").searchParams;
    expect(Object.fromEntries(context)).toMatchObject({ environment: "live", venue: "BINANCE", instrument: "BTCUSDT", interval: "1h" });
  });

  it("candles that come back empty are not qualified either", async () => {
    mount("/replay", (path, query) => {
      if (path !== "/market/venue-candles") return undefined;
      const body = structuredClone(answerAlpha("GET", path, query)!.body) as { candles: unknown[] };
      body.candles = [];
      return { status: 200, body };
    });
    await settled();
    await waitFor(() => expect(screen.getByText("Candles not qualified")).toBeTruthy());
    expect(screen.getByRole("note").textContent).toContain("returned no candle");
  });

  it("a venue read that fails is a reason, not a blank chart", async () => {
    mount("/replay", (path) => (path === "/market/venue-candles" ? { status: 503, body: { error: { code: "UPSTREAM_UNAVAILABLE", message: "klines down" } } } : undefined));
    await settled();
    await waitFor(() => expect(screen.getByRole("note").textContent).toContain("klines down"));
    expect(props().market).toBeNull();
    expect(props().marketTransport).toBe("unavailable");
  });
});

describe("deep link", () => {
  it("focus=order:<id> opens at that order's symbol, passes the focus on, and says where it opened", async () => {
    mount("/replay?focus=order:ord_005");
    await settled();
    await waitFor(() => expect(props().symbol).toBe("ETHUSDT"));
    expect(props().focusId).toBe("order:ord_005");
    const banner = screen.getByText(/Opened at order/).closest("div")!;
    expect(banner.textContent).toContain("ord_005");
    expect(within(banner).getByRole("link", { name: /Back to Orders/ }).getAttribute("href")).toBe(`/deployments/alphas/${ALPHA_DOUBLE_ID}?tab=orders`);
  });

  it("an order that is not in the window is said so, and the replay still opens", async () => {
    mount("/replay?focus=order:ord_999");
    await settled();
    expect(screen.getByText(/is not in the retained window of this book/)).toBeTruthy();
    expect(props().symbol).toBe("BTCUSDT");
  });

  it("a focus that is not order:<id> or fill:<id> is ignored", async () => {
    mount("/replay?focus=whatever");
    await settled();
    expect(screen.queryByText(/Opened at/)).toBeNull();
    expect(screen.queryByText(/is not in the retained window/)).toBeNull();
  });

  it("the Replay tab of Alpha 360 takes the same link", async () => {
    serveAlphaDouble();
    render(
      <MemoryRouter initialEntries={[`/deployments/alphas/${ALPHA_DOUBLE_ID}?tab=replay&focus=order:ord_004`]}>
        <AlphaScreen api={alphaHttpApi()} alphaId={ALPHA_DOUBLE_ID} />
      </MemoryRouter>,
    );
    await screen.findByTestId("v1-replay");
    expect(await screen.findByText(/Opened at/)).toBeTruthy();
    expect(props().focusId).toBe("order:ord_004");
    expect(screen.getByRole("button", { name: "More" }).getAttribute("data-active")).toBe("true");
    // The replay is the page: no lifecycle and no current-facts strip above the chart.
    expect(screen.queryByRole("list", { name: "Alpha lifecycle" })).toBeNull();
    expect(screen.queryByLabelText("Current facts")).toBeNull();
  });
});

describe("states", () => {
  it("empty: an alpha with no order and no fill in the window says so", async () => {
    mount("/replay", (path, query) => {
      if (!path.endsWith("/orders") && !path.endsWith("/fills")) return undefined;
      const body = structuredClone(answerAlpha("GET", path, query)!.body) as { records: unknown[]; page: { has_more: boolean; next_cursor: null } };
      body.records = [];
      body.page.has_more = false;
      return { status: 200, body };
    });
    expect(await screen.findByText(/No order or fill of this alpha is present/)).toBeTruthy();
    expect(screen.queryByTestId("v1-replay")).toBeNull();
  });

  it("partial: one relation failing keeps the other and says which is missing", async () => {
    mount("/replay", (path) => (path.endsWith("/fills") ? { status: 503, body: { error: { code: "UPSTREAM_UNAVAILABLE", message: "fills down" } } } : undefined));
    await screen.findByTestId("v1-replay");
    expect(screen.getByText(/Fills could not be read/)).toBeTruthy();
    expect(props().orders.length).toBeGreaterThan(0);
    expect(props().fills).toEqual([]);
  });

  it("both relations failing is unavailable, with both reasons", async () => {
    mount("/replay", (path) => (path.endsWith("/fills") || path.endsWith("/orders") ? { status: 503, body: { error: { code: "UPSTREAM_UNAVAILABLE", message: "down" } } } : undefined));
    expect(await screen.findByText(/Orders: .*Fills: /)).toBeTruthy();
    expect(screen.queryByTestId("v1-replay")).toBeNull();
  });

  it("denied: the alpha is outside the slice, so nothing is replayed", async () => {
    mount("/replay", undefined, "alpha_denied");
    expect(await screen.findByText(/outside your slice/)).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Trade Replay" })).toBeNull();
  });

  it("an unavailable resource does not take the replay down: it has no venue, so no candles, and the log stays", async () => {
    mount("/replay", undefined, "alpha_down");
    await screen.findByTestId("v1-replay");
    expect(screen.getByText("Candles not qualified")).toBeTruthy();
    expect(screen.getByRole("note").textContent).toContain("no public klines for this alpha's venue");
  });

  it("a researcher's slice does not see the account", async () => {
    session.current = sessionOf(V2_ROLE_PRESETS.researcher);
    mount();
    await settled();
    expect(chip("Account")).toBe("Account Not available");
    expect(props().accounts).toEqual([]);
  });
});
