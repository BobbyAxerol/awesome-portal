import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { TradeReplayEventsProps } from "../../components/TradeReplayEvents";
import { readUtcEpochMs, type UtcEpochMs } from "../../screenDataContract";
import { ReplayPanel, type ReplayLogRow } from "./index";

const seen = vi.hoisted(() => ({ props: null as unknown, boom: false }));

vi.mock("../../components/TradeReplayEvents", () => ({
  TradeReplayEvents: (props: unknown) => {
    seen.props = props;
    if (seen.boom) throw new Error("chunk failed");
    return <div data-testid="v1-replay">V1 replay</div>;
  },
}));

afterEach(() => {
  cleanup();
  seen.props = null;
  seen.boom = false;
});

const at = (ms: number): UtcEpochMs => {
  const t = readUtcEpochMs(ms);
  if (t === null) throw new Error("bad instant");
  return t;
};
const REPLAY = {
  orders: [],
  fills: [],
  candles: { state: null, reason: null },
  asOf: null,
  market: { candles: [] },
} as unknown as TradeReplayEventsProps;

const LOG: ReplayLogRow[] = [
  { id: "l1", at: at(Date.UTC(2026, 9, 17, 9, 14, 30)), event: "Fill", order: "ord_1", kind: "Limit, Buy", qty: "12345678901234567890.123456789", price: "67200.5", fee: null, result: "Filled" },
  { id: "l2", at: at(Date.UTC(2026, 9, 17, 9, 15)), event: "Order rejected", order: "ord_2", kind: "Market, Sell", qty: null, price: null, fee: "0.0100", result: "Rejected" },
];

describe("ReplayPanel frame", () => {
  it("names the panel, lists chips and withholds candles by default with a banner", () => {
    render(<ReplayPanel subject="BTC-Trend v3" chips={[{ label: "Symbol", value: "BTCUSDT" }, { label: "Interval", value: "1h" }]} logRows={LOG} />);
    expect(screen.getByRole("region", { name: "Trade Replay" })).toBeTruthy();
    const chips = screen.getByRole("list", { name: "Replay scope" });
    expect(within(chips).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Symbol BTCUSDT", "Interval 1h"]);
    expect(screen.getByRole("note").textContent).toContain("Candles not qualified");
  });

  it("drops the banner when candles are qualified", () => {
    render(<ReplayPanel subject="X" candlesQualified logRows={LOG} />);
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("the plain log keeps decimals exact and says Not available for a gap", () => {
    render(<ReplayPanel subject="X" logRows={LOG} qtyDp={8} />);
    const table = screen.getByRole("table", { name: "Trade log for X" });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows[0].textContent).toContain("17 Oct 09:14Z");
    expect(rows[0].textContent).toContain("12,345,678,901,234,567,890.12345679");
    expect(rows[0].textContent).toContain("67,200.5");
    expect(rows[0].textContent).toContain("Not available");
    expect(rows[1].textContent).toContain("0.01");
    expect(table.textContent).not.toMatch(/[—–]/);
  });

  it("an empty log is the empty state, not a blank table", () => {
    render(<ReplayPanel subject="X" logRows={[]} />);
    expect(screen.getByText("Nothing to show")).toBeTruthy();
  });

  it("other states replace the body and the banner", () => {
    render(<ReplayPanel subject="X" status="denied" reason="Account replays are for managers" logRows={LOG} />);
    expect(screen.getByText("Withheld")).toBeTruthy();
    expect(screen.getByText("Account replays are for managers")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("stale keeps the log under the state line", () => {
    render(<ReplayPanel subject="X" status="stale" reason="Four minutes old" logRows={LOG} />);
    expect(screen.getByText("Stale")).toBeTruthy();
    expect(screen.getByRole("table")).toBeTruthy();
  });
});

describe("ReplayPanel lazy boundary", () => {
  it("shows the loading state first, then the V1 panel once its chunk resolves", async () => {
    render(<ReplayPanel subject="X" candlesQualified replay={REPLAY} />);
    expect(screen.getByRole("status", { name: "Loading" })).toBeTruthy();
    expect(await screen.findByTestId("v1-replay")).toBeTruthy();
    expect(screen.queryByRole("status", { name: "Loading" })).toBeNull();
  });

  it("passes venue candles through only when qualified", async () => {
    const { unmount } = render(<ReplayPanel subject="X" candlesQualified replay={REPLAY} />);
    await screen.findByTestId("v1-replay");
    expect((seen.props as { market: unknown }).market).toEqual({ candles: [] });
    unmount();
    render(<ReplayPanel subject="X" replay={REPLAY} />);
    await screen.findByTestId("v1-replay");
    expect((seen.props as { market: unknown }).market).toBeNull();
  });

  it("a chunk that throws becomes an Unavailable state, not a blank page", async () => {
    seen.boom = true;
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(<ReplayPanel subject="X" candlesQualified replay={REPLAY} />);
    expect(await screen.findByText("Unavailable")).toBeTruthy();
    expect(screen.getByText(/could not be loaded/)).toBeTruthy();
    spy.mockRestore();
  });

  it("no block statically imports the V1 replay components (lightweight-charts stays out of entry chunks)", () => {
    const sources = readdirSync(__dirname).filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f));
    const staticImport = /^\s*(?:import|export)\s+(?!type\b)[^;]*?from\s+["'][^"']*(?:ReplayCandleChart|TradeReplayEvents|lightweight-charts)["']/m;
    for (const f of sources) {
      const text = readFileSync(join(__dirname, f), "utf8");
      expect(text, f).not.toMatch(staticImport);
    }
    const lazy = readFileSync(join(__dirname, "replayLazy.ts"), "utf8");
    expect(lazy).toMatch(/import\("\.\.\/\.\.\/components\/TradeReplayEvents"\)/);
    expect(lazy).toMatch(/import\("\.\.\/\.\.\/components\/ReplayCandleChart"\)/);
  });
});
