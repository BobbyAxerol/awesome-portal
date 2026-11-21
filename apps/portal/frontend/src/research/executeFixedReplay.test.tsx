/**
 * S08 · fixed/imported (P04-style) runs — `researchFixedReplayObservationsGetV1`.
 *
 * Bodies are the published canonical fixtures under `packages/contracts/fixtures`
 * (`research-fixed-replay-companion.*` and the real P04 hub window). The
 * multi-page body is a TYPED BUILDER over the canonical available fixture's own
 * row/manifest: it changes only ordinals, times and cursors, and is typed
 * against the generated `FixedReplayPage`.
 *
 * Claims:
 *  - the route is bound at its generated path, read-only, one page per read;
 *  - five pages of the owned receipt cell page forward, and "earlier" steps
 *    back over pages already loaded without a request;
 *  - native position keys (`DEFAULT`) are shown as served, and
 *    `manifest.market_symbol` is shown separately — never relabelled;
 *  - this is observation replay: no order, fill, trade or marker is drawn;
 *  - absent / typed-absent / refused leaves the legacy equity-sample lane as it
 *    was, and a fresh run's server code is named, never a zero or a dash;
 *  - the chart keeps the candle chart's life (readout, crosshair on the
 *    playhead, animation gate) and polls nothing.
 */
import { act, cleanup, fireEvent, render, renderHook, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ExecuteScreen } from "./ExecuteDetail";
import { DEFAULT_CURSOR } from "./evidenceCursor";
import { fixedCrosshairReadout, fixedPositionKeys } from "./ExecuteCandleReplay";
import {
  FIXED_REPLAY_LIMIT_MAX,
  fixedFreshAbsence,
  fixedPageServesRows,
  replayApi,
  type FixedReplayPage,
  type Replay,
} from "./replayClient";
import { ReplayTransport } from "./replayTransport";
import { useReplay } from "./useReplay";

const chartCalls = vi.hoisted(() => ({ candles: [] as unknown[][], crosshair: [] as unknown[][], created: 0 }));

vi.mock("lightweight-charts", () => {
  /* jsdom has no canvas: a recording double, so the tests read the data the chart was given. */
  return {
    ColorType: { Solid: "solid" },
    LineType: { WithSteps: 1 },
    CandlestickSeries: "candles",
    LineSeries: "line",
    createChart: () => {
      chartCalls.created += 1;
      return {
        applyOptions: vi.fn(),
        addSeries: (kind: string) => ({
          setData: (data: unknown[]) => {
            if (kind === "candles") chartCalls.candles.push(data);
          },
          applyOptions: vi.fn(),
          data: () => [],
        }),
        removeSeries: vi.fn(),
        panes: () => [],
        remove: vi.fn(),
        setCrosshairPosition: (...args: unknown[]) => chartCalls.crosshair.push(args),
        subscribeCrosshairMove: vi.fn(),
        timeScale: () => ({ getVisibleLogicalRange: () => null, setVisibleLogicalRange: vi.fn(), fitContent: vi.fn() }),
      };
    },
  };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  chartCalls.candles.length = 0;
  chartCalls.crosshair.length = 0;
  chartCalls.created = 0;
});

const FIXTURES = join(process.cwd(), "..", "..", "..", "packages", "contracts", "fixtures");
const load = <T,>(name: string) => JSON.parse(readFileSync(join(FIXTURES, name), "utf8")) as T;
const AVAILABLE = load<FixedReplayPage>("research-fixed-replay-companion.available.valid.json");
const FRESH_ABSENT = load<FixedReplayPage>("research-fixed-replay-companion.fresh-absent.valid.json");
const NOT_APPLICABLE = load<FixedReplayPage>("research-fixed-replay-companion.not-applicable.valid.json");
const NOT_RECORDED = load<FixedReplayPage>("research-fixed-replay-companion.not-recorded.valid.json");
const HUB = load<Replay>("research-replay.p04-real.first-window.valid.json");

const PAGE = FIXED_REPLAY_LIMIT_MAX;
const PAGES = 5;
const MINUTE = 60_000;

/** Typed builder: the canonical available page, widened to `PAGES` pages of 200 rows each. */
function pageOf(index: number): FixedReplayPage {
  const template = AVAILABLE.rows[0]!;
  const total = PAGE * PAGES;
  return {
    ...AVAILABLE,
    counts: { full_source_retained: total, matching_filter: total, returned: PAGE },
    next_cursor: index + 1 < PAGES ? `cursor-${index + 1}` : null,
    rows: Array.from({ length: PAGE }, (_, at) => {
      const ordinal = index * PAGE + at;
      return { ...template, source_ordinal: ordinal, at_utc_ms: AVAILABLE.rows[0]!.at_utc_ms + ordinal * MINUTE };
    }),
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** Hub answers the real P04 window; the fixed route answers by `cursor` (or `first`). */
function serve(fixed: (cursor: string | null) => Response | Promise<Response>) {
  const fixedUrls: string[] = [];
  const hubUrls: string[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    const text = String(url);
    if (text.includes("/replay/observations")) {
      fixedUrls.push(text);
      return fixed(new URL(text, "http://x").searchParams.get("cursor"));
    }
    hubUrls.push(text);
    if (text.includes("/execute/replay")) return json(HUB);
    return json({ error: { code: "RESEARCH_CURRENT_SOURCE_CONFLICT", message: "x" } }, 409);
  });
  return { fixedUrls, hubUrls };
}

const fivePages = (cursor: string | null) => json(pageOf(cursor === null ? 0 : Number(cursor.replace("cursor-", ""))));

function Harness({ transport }: { transport: ReplayTransport }) {
  const controller = useReplay("run_fixed", null);
  return (
    <MemoryRouter>
      <ExecuteScreen runId="run_fixed" cursor={{ ...DEFAULT_CURSOR, stage: "execute" }} controller={controller} transport={transport} />
    </MemoryRouter>
  );
}
const mount = () => render(<Harness transport={new ReplayTransport()} />);
const panel = () => document.querySelector("[data-panel='fixed-observation-replay']") as HTMLElement | null;

describe("S08 fixed · the client binds the generated operation", () => {
  it("reads GET /api/v1/quantbt/runs/:runId/replay/observations, one page, with a capped limit and the page's own cursor", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(json(AVAILABLE));
    await replayApi.fixedObservations("run a/1", { workspaceId: "ws_1", limit: 9_999, cursor: "opaque-1" });
    const [url, init] = fetchMock.mock.calls[0]!;
    const parsed = new URL(String(url), "http://x");
    expect(parsed.pathname).toBe("/api/v1/quantbt/runs/run%20a%2F1/replay/observations");
    expect(parsed.searchParams.get("limit")).toBe("200");
    expect(parsed.searchParams.get("cursor")).toBe("opaque-1");
    expect(parsed.searchParams.get("workspace_id")).toBe("ws_1");
    expect((init as RequestInit).method ?? "GET").toBe("GET");
  });

  it("is read-only: the client names no write for this route", () => {
    const code = readFileSync(join(process.cwd(), "src", "research", "replayClient.ts"), "utf8");
    expect(code).toContain("researchFixedReplayObservationsGetV1");
    expect(code).not.toMatch(/method:\s*"(POST|PUT|PATCH|DELETE)"/);
  });

  it("classifies the four canonical pages", () => {
    expect(fixedPageServesRows(AVAILABLE)).toBe(true);
    expect([FRESH_ABSENT, NOT_APPLICABLE, NOT_RECORDED].map((page) => fixedPageServesRows(page))).toEqual([false, false, false]);
    expect(fixedFreshAbsence(FRESH_ABSENT)?.code).toBe("FIXED_REPLAY_ROW_LIMIT_EXCEEDED");
    /* Historical / not-applicable answers never name a code of their own: the legacy lane's absence stands. */
    expect(fixedFreshAbsence(NOT_APPLICABLE)).toBeNull();
    expect(fixedFreshAbsence(NOT_RECORDED)).toBeNull();
  });
});

describe("S08 fixed · paging (five pages of the owned receipt cell)", () => {
  it("reads page one after the hub, and every later page only when asked", async () => {
    const { fixedUrls } = serve(fivePages);
    const { result } = renderHook(() => useReplay("run_fixed", null));
    await waitFor(() => expect(result.current.fixed?.state).toBe("ready"));
    expect(fixedUrls).toHaveLength(1);
    expect(new URL(fixedUrls[0]!, "http://x").searchParams.get("limit")).toBe("200");
    expect(new URL(fixedUrls[0]!, "http://x").searchParams.has("cursor")).toBe(false);

    for (let next = 1; next < PAGES; next += 1) {
      act(() => result.current.fixedNextPage?.());
      await waitFor(() => {
        const slot = result.current.fixed;
        expect(slot?.state === "ready" && slot.pages.length).toBe(next + 1);
      });
      expect(new URL(fixedUrls[next]!, "http://x").searchParams.get("cursor")).toBe(`cursor-${next}`);
    }
    expect(fixedUrls).toHaveLength(PAGES);
    const slot = result.current.fixed;
    expect(slot?.state === "ready" && slot.pages.at(-1)!.next_cursor).toBeNull();
    /* Past the last page there is nothing to ask. */
    act(() => result.current.fixedNextPage?.());
    expect(fixedUrls).toHaveLength(PAGES);
  });

  it("'earlier' steps over pages already loaded and sends nothing", async () => {
    const { fixedUrls } = serve(fivePages);
    const { result } = renderHook(() => useReplay("run_fixed", null));
    await waitFor(() => expect(result.current.fixed?.state).toBe("ready"));
    act(() => result.current.fixedNextPage?.());
    await waitFor(() => expect(result.current.fixed?.state === "ready" && result.current.fixed.index).toBe(1));
    act(() => result.current.fixedPreviousPage?.());
    expect(result.current.fixed?.state === "ready" && result.current.fixed.index).toBe(0);
    act(() => result.current.fixedNextPage?.());
    expect(result.current.fixed?.state === "ready" && result.current.fixed.index).toBe(1);
    expect(fixedUrls).toHaveLength(2);
  });

  it("an expired cursor (409) is dropped and the first page is read once", async () => {
    const { fixedUrls } = serve((cursor) =>
      cursor === "cursor-1" ? json({ type: "x", title: "expired", status: 409 }, 409) : json(pageOf(0)),
    );
    const { result } = renderHook(() => useReplay("run_fixed", null));
    await waitFor(() => expect(result.current.fixed?.state).toBe("ready"));
    act(() => result.current.fixedNextPage?.());
    await waitFor(() => expect(result.current.fixed?.state === "ready" && result.current.fixed.recovered).toBe(true));
    expect(fixedUrls).toHaveLength(3);
    expect(new URL(fixedUrls[2]!, "http://x").searchParams.has("cursor")).toBe(false);
  });

  it("a failed later page keeps the loaded pages and states the refusal", async () => {
    serve((cursor) => (cursor === "cursor-1" ? json({ type: "x", title: "down", status: 503 }, 503) : json(pageOf(0))));
    const { result } = renderHook(() => useReplay("run_fixed", null));
    await waitFor(() => expect(result.current.fixed?.state).toBe("ready"));
    act(() => result.current.fixedNextPage?.());
    await waitFor(() => expect(result.current.fixed?.state === "ready" && result.current.fixed.pageRefusal?.status).toBe(503));
    expect(result.current.fixed?.state === "ready" && result.current.fixed.pages).toHaveLength(1);
  });
});

describe("S08 fixed · the screen", () => {
  it("shows native position keys as served and the market symbol separately — observation replay, not a ledger", async () => {
    serve(fivePages);
    mount();
    await waitFor(() => expect(panel()).not.toBeNull());
    const root = panel()!;
    expect(root.querySelector("[data-market-symbol]")?.getAttribute("data-market-symbol")).toBe(AVAILABLE.manifest!.market_symbol);
    expect(root.querySelector("[data-native-position-key='DEFAULT']")).not.toBeNull();
    /* The native label is not rewritten to the symbol, and the symbol is not the label. */
    expect(root.querySelector("[data-native-position-key='BTCUSDT']")).toBeNull();
    expect(root.querySelector("[data-fixed-scope]")?.textContent).toMatch(/not an orders, fills or trades ledger/);
    /* No marker layer, no order/fill/trade element exists in this panel. */
    expect(root.querySelector("[data-marker], [data-marker-list], [data-order], [data-fill], [data-trade]")).toBeNull();
    expect(root.textContent).toContain("retained 1,000");
    expect(document.querySelector("[data-screen='execute-replay']")?.getAttribute("data-fixed-replay")).toBe("ready");
  });

  it("keeps the legacy equity-sample lane in place beside it", async () => {
    serve(fivePages);
    mount();
    await waitFor(() => expect(panel()).not.toBeNull());
    expect(document.querySelector("[data-replay-window]")).not.toBeNull();
    expect(document.querySelector("[data-route-state]")?.getAttribute("data-route-state")).toBe(HUB.route.state);
  });

  it("pages with the window buttons: later reads a page, earlier steps back, and the disabled states say why", async () => {
    const { fixedUrls } = serve(fivePages);
    mount();
    await waitFor(() => expect(panel()).not.toBeNull());
    const earlier = panel()!.querySelector("[data-action='fixed-previous-window']") as HTMLButtonElement;
    const later = panel()!.querySelector("[data-action='fixed-next-window']") as HTMLButtonElement;
    expect(earlier.disabled).toBe(true);
    expect(earlier.getAttribute("title")).toBeTruthy();
    expect(later.disabled).toBe(false);
    fireEvent.click(later);
    await waitFor(() => expect(panel()!.getAttribute("data-fixed-window")).toBe("1"));
    expect(fixedUrls).toHaveLength(2);
    fireEvent.click(panel()!.querySelector("[data-action='fixed-previous-window']")!);
    await waitFor(() => expect(panel()!.getAttribute("data-fixed-window")).toBe("0"));
    expect(fixedUrls).toHaveLength(2);
  });

  it("the last page disables 'later' with its reason", async () => {
    serve((cursor) => json(pageOf(cursor === null ? PAGES - 1 : 0)));
    mount();
    await waitFor(() => expect(panel()).not.toBeNull());
    const later = panel()!.querySelector("[data-action='fixed-next-window']") as HTMLButtonElement;
    expect(later.disabled).toBe(true);
    expect(later.getAttribute("title")).toMatch(/last retained observation/);
  });

  it("gives the chart the served candles and parks the crosshair on the playhead's bar", async () => {
    serve(fivePages);
    mount();
    await waitFor(() => expect(chartCalls.candles.length).toBeGreaterThan(0));
    const data = chartCalls.candles.at(-1) as Array<{ time: number; open: number; close: number }>;
    expect(data).toHaveLength(PAGE);
    expect(data[0]!.open).toBe(Number(AVAILABLE.rows[0]!.open));
    await waitFor(() => expect(chartCalls.crosshair.length).toBeGreaterThan(0));
    expect(chartCalls.crosshair[0]![0]).toBe(Number(AVAILABLE.rows[0]!.close));
    const readout = panel()!.querySelector("[data-crosshair-readout]");
    expect(readout?.getAttribute("data-crosshair-source")).toBe("playhead");
    expect(readout?.querySelector("[data-position-key='DEFAULT']")?.textContent).toContain("0.25");
  });

  it("the observation count is a cell of the readout row, not a label laid over the chart (it used to collide with the date)", async () => {
    serve(fivePages);
    mount();
    await waitFor(() => expect(chartCalls.candles.length).toBeGreaterThan(0));
    const count = panel()!.querySelector("[data-observation-count]");
    expect(count?.closest("[data-crosshair-readout]")).not.toBeNull();
    expect(count?.textContent).toBe(`${PAGE} observations`);
    expect(panel()!.querySelector("span.absolute.top-1")).toBeNull();
  });

  it("polls nothing: one hub read and one fixed read, however long it stays", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const { fixedUrls, hubUrls } = serve(fivePages);
      mount();
      await waitFor(() => expect(panel()).not.toBeNull());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(120_000);
      });
      expect(fixedUrls).toHaveLength(1);
      expect(hubUrls.filter((url) => url.includes("/execute/replay"))).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("typed absence (not applicable / not recorded) draws nothing new: the legacy lane reads as before", async () => {
    for (const body of [NOT_APPLICABLE, NOT_RECORDED]) {
      serve(() => json(body));
      const { unmount } = mount();
      await waitFor(() => expect(document.querySelector("[data-screen='execute-replay']")?.getAttribute("data-fixed-replay")).toBe("absent"));
      expect(panel()).toBeNull();
      expect(document.querySelector("[data-fixed-absence]")).toBeNull();
      expect(document.querySelector("[data-replay-window]")).not.toBeNull();
      unmount();
      vi.restoreAllMocks();
    }
  });

  it("a fresh run whose source declared no observations names the server's code and keeps 'equity samples only'", async () => {
    serve(() => json(FRESH_ABSENT));
    mount();
    await waitFor(() => expect(document.querySelector("[data-fixed-absence]")).not.toBeNull());
    expect(document.querySelector("[data-fixed-absence]")?.getAttribute("data-fixed-absence")).toBe("FIXED_REPLAY_ROW_LIMIT_EXCEEDED");
    /* W4: the code is the chip's tooltip, not visible text. */
    expect(document.querySelector("[data-fixed-absence]")?.getAttribute("title")).toContain("FIXED_REPLAY_ROW_LIMIT_EXCEEDED");
    expect(document.body.textContent).toMatch(/equity samples only/);
    expect(panel()).toBeNull();
  });

  it("a refused route (404/503) leaves the legacy lane untouched and draws no fixed panel", async () => {
    serve(() => json({ type: "x", title: "no", status: 404 }, 404));
    mount();
    await waitFor(() => expect(document.querySelector("[data-screen='execute-replay']")?.getAttribute("data-fixed-replay")).toBe("refused"));
    expect(panel()).toBeNull();
    expect(document.querySelector("[data-replay-window]")).not.toBeNull();
  });
});

describe("S08 fixed · readout formatting", () => {
  it("keeps native keys verbatim and formats UI numbers with the typographic minus", () => {
    const row = { ...AVAILABLE.rows[0]!, positions: { DEFAULT: "-0.25", HEDGE: "1" }, close: "-1.5" };
    const readout = fixedCrosshairReadout(row);
    expect(readout.positions.map((position) => position.key)).toEqual(["DEFAULT", "HEDGE"]);
    expect(readout.positions[0]).toEqual({ key: "DEFAULT", value: "-0.25", shown: "−0.25" });
    expect(readout.close).toBe("−1.50");
    expect(fixedPositionKeys([row, AVAILABLE.rows[1]!])).toEqual(["DEFAULT", "HEDGE"]);
  });
});
