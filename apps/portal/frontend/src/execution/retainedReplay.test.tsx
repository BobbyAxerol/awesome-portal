import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import retainedFixture from "../../../../../packages/contracts/fixtures/execution-retained-review.valid.json";
import { createFixtureApi } from "./api/fixtureApi";
import { unavailable } from "./api/ports";
import { ensureRetainedReview, resetRetainedReviewForTests } from "./retainedReview";
import { TradeReplayLive } from "./screens/recomposeContainers";

afterEach(() => { cleanup(); resetRetainedReviewForTests(); vi.unstubAllGlobals(); });

async function subject() {
  const api = createFixtureApi();
  const result = await api.getQueryAnalytics("alphas", "alpha-test");
  if (!result.ok) throw new Error("QUERY_FIXTURE_REQUIRED");
  const analytics = { ...result.value, sourceFacts: {
    ...result.value.sourceFacts,
    deployments: [{ account_id: "account-test", strategy_id: "alpha-test", venue: "BINANCE" }],
    fills: [{ fill_id: "fill-test", account_id: "account-test", instrument_id: "BTCUSDT.BINANCE", side: "BUY",
      price: "60000", quantity: "0.1", trade_time: "2026-08-03T12:00:00Z" }],
  } };
  const manager = vi.fn(async () => unavailable("test-manager-not-published"));
  const venue = vi.fn(async () => unavailable("test-venue-not-published"));
  return { api: { ...api, getMarketContextCandles: manager, getMarketCandles: venue }, analytics, manager, venue };
}

describe("UDB04 retained Replay never bootstraps a source from retained fills", () => {
  it.each(["retained", "malformed", "503", "403"])("%s blocks Manager and venue reads, including pending context", async kind => {
    resetRetainedReviewForTests();
    let resolve!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(done => { resolve = done; })));
    ensureRetainedReview();
    const s = await subject();
    render(<TradeReplayLive api={s.api} analytics={s.analytics} alphaId="alpha-test" environment="paper" />);
    await waitFor(() => expect(screen.getByText(/UDB_CONTEXT_NOT_READY/)).toBeTruthy());
    expect(s.manager).not.toHaveBeenCalled(); expect(s.venue).not.toHaveBeenCalled();
    await act(async () => resolve(new Response(JSON.stringify(kind === "retained" ? retainedFixture : {}),
      { status: kind === "503" ? 503 : kind === "403" ? 403 : 200 })));
    await waitFor(() => expect(document.body.textContent).toContain(kind === "retained"
      ? "UDB_RETAINED_OBSERVATION_NOT_CURRENT_SOURCE" : kind === "503" ? "UDB_CONTEXT_HTTP_503"
        : kind === "403" ? "UDB_CONTEXT_ACCESS_DENIED" : "UDB_CONTEXT_INVALID"));
    expect(s.manager).not.toHaveBeenCalled(); expect(s.venue).not.toHaveBeenCalled();
  });
  it("an explicitly absent retained context preserves the existing source lane", async () => {
    resetRetainedReviewForTests();
    vi.stubGlobal("fetch", async () => new Response("{}", { status: 404 }));
    await act(async () => { ensureRetainedReview(); });
    const s = await subject();
    render(<TradeReplayLive api={s.api} analytics={s.analytics} alphaId="alpha-test" environment="paper" />);
    await waitFor(() => expect(s.manager).toHaveBeenCalledTimes(1));
    expect(s.venue).toHaveBeenCalledTimes(1);
  });
});
