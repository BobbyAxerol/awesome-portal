/**
 * Batch EA · S01 - the Library card reads `analytics_all_time`
 * (`research.enriched-analysis.v1` `library_summary`).
 *
 * Value path: the proposed fixture's `library_summary`, drawn all time.
 * Fallback: no block -> today's sparkline, its own label, untouched.
 * Refusal: a basis that is not ALL_TIME (or a rolling figure) is a typed
 * absence, never drawn and never relabelled.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { act, cleanup, render, renderHook } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RunLibrary, allTimePath } from "./RunLibrary";
import { readAllTime, type RunLibraryItem, type RunLibraryResponse } from "./runLibraryClient";
import { researchState } from "./state";
import { useRunLibrary, type LibraryFilters, type SparklineRead } from "./useRunLibrary";

const base = JSON.parse(
  readFileSync(join(__dirname, "../../e2e/research-foundation/run-library.json"), "utf8"),
) as RunLibraryResponse;
const EMPTY: LibraryFilters = { q: "", status: [], mode: [], alpha: [], group: false, sel: [] };
/* Read from the repo root at run time: `upgrade/` is outside the frontend build context, so a static JSON import
   would break `tsc -b` inside the Docker image (it did, once). */
const enriched = JSON.parse(
  readFileSync(join(process.cwd(), "..", "..", "..", "upgrade", "research_loop", "evidence", "P21", "enrich-analysis", "enriched-analysis.proposed.fixture.json"), "utf8"),
) as {
  library_summary: {
    sparkline: { at_utc_ms: number; value: string }[];
    [key: string]: unknown;
  };
};
const SUMMARY = enriched.library_summary;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function withAllTime(block: unknown): RunLibraryItem {
  return { ...base.items[0], analytics_all_time: block } as unknown as RunLibraryItem;
}

function draw(item: RunLibraryItem, sparklines: ReadonlyMap<string, SparklineRead> = new Map()) {
  render(
    <MemoryRouter>
      <RunLibrary
        filters={EMPTY}
        onFilters={vi.fn()}
        onToggleSel={vi.fn()}
        response={{ ...base, items: [item] }}
        items={[item]}
        state={researchState({ kind: "ok", rowCount: 1 })}
        sparklines={sparklines}
        onVisible={vi.fn()}
        onLoadNext={vi.fn()}
        onLoadPrevious={vi.fn()}
      />
    </MemoryRouter>,
  );
  return document.querySelector<HTMLElement>(`[data-sparkline="${item.run_id}"]`)!;
}

describe("EA S01 - value path (the fixture's library_summary)", () => {
  it("draws every served point under the label 'all time' with the all-time trio", () => {
    const box = draw(withAllTime(SUMMARY));
    expect(box.getAttribute("data-sparkline-source")).toBe("all-time");
    expect(box.textContent).toContain("all time");
    expect(box.textContent).not.toMatch(/30D|stitched OOS equity/);

    const svg = box.querySelector("svg")!;
    expect(svg.getAttribute("data-all-time-points")).toBe(String(SUMMARY.sparkline.length));
    const points = svg.querySelector("polyline")!.getAttribute("points")!.split(" ");
    expect(points).toHaveLength(SUMMARY.sparkline.length);
    expect(box.querySelector("[data-all-time-caption]")!.textContent).toBe(`${SUMMARY.sparkline.length} pts`);

    const cell = (name: string) => box.querySelector<HTMLElement>(`[data-all-time-cell="${name}"]`)!;
    expect(cell("return").textContent).toContain("+1.66%");
    expect(cell("sharpe").textContent).toContain("4.34");
    // Typographic minus, exact server decimal kept in the title.
    expect(cell("max-dd").textContent).toContain("−0.47%");
    expect(cell("max-dd").textContent).not.toContain("-0.47");
    expect(cell("max-dd").querySelector("[title]")!.getAttribute("title")).toBe(SUMMARY.max_drawdown_fraction);
  });

  it("allTimePath keeps every point, in time order, inside the box", () => {
    const path = allTimePath(SUMMARY.sparkline)!.split(" ").map((p) => p.split(",").map(Number));
    expect(path).toHaveLength(SUMMARY.sparkline.length);
    expect(path[0][0]).toBe(0);
    expect(path[path.length - 1][0]).toBe(150);
    for (const [, y] of path) {
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(26);
    }
    expect(allTimePath(SUMMARY.sparkline.slice(0, 1))).toBeNull();
    expect(allTimePath([{ at_utc_ms: 1, value: "x" }, { at_utc_ms: 2, value: "1" }])).toBeNull();
  });
});

describe("EA S01 - typed absence", () => {
  it("a NOT_PUBLISHED summary says 'not published' with the server's code, never a zero or a dash", () => {
    const box = draw(
      withAllTime({
        ...SUMMARY,
        state: "NOT_PUBLISHED",
        reason_code: "PORTAL_ENRICHED_ANALYSIS_NOT_SEALED",
        sparkline: [],
        return_fraction: null,
        sharpe: null,
        max_drawdown_fraction: null,
      }),
    );
    const absent = box.querySelector<HTMLElement>("[data-all-time-absent]")!;
    expect(absent.textContent).toBe("not published");
    expect(absent.getAttribute("data-reason-code")).toBe("PORTAL_ENRICHED_ANALYSIS_NOT_SEALED");
    expect(box.querySelector("[data-all-time-trio]")).toBeNull();
    expect(box.querySelector("svg")).toBeNull();
    expect(box.textContent).not.toMatch(/\b0\.00|—|N\/A/);
  });

  it("an available summary whose one figure is null keeps the others and types that one", () => {
    const box = draw(
      withAllTime({
        ...SUMMARY,
        sharpe: { ...(SUMMARY.sharpe as Record<string, unknown>), state: "NOT_PUBLISHED", reason_code: "AN29_RETAINED_MARKET_CLOSE_NOT_PUBLISHED", value: null },
        max_drawdown_fraction: null,
      }),
    );
    const sharpe = box.querySelector<HTMLElement>('[data-all-time-cell="sharpe"] [data-withheld]')!;
    expect(sharpe.textContent).toBe("not published");
    expect(sharpe.getAttribute("data-reason-code")).toBe("AN29_RETAINED_MARKET_CLOSE_NOT_PUBLISHED");
    expect(box.querySelector('[data-all-time-cell="max-dd"] [data-withheld]')!.textContent).toBe("not published");
    expect(box.querySelector('[data-all-time-cell="return"]')!.textContent).toContain("+1.66%");
  });
});

describe("EA S01 - refusal of a non-ALL_TIME basis", () => {
  it.each([
    ["ROLLING_30D basis", { ...SUMMARY, basis: "ROLLING_30D", label: "last 30D" }],
    ["missing basis", { ...SUMMARY, basis: undefined }],
    ["a rolling figure beside it", { ...SUMMARY, rolling: { window: "30D" } }],
  ])("%s is not drawn and not relabelled", (_name, block) => {
    const item = withAllTime(block);
    expect(readAllTime(item).kind).toBe("refused");
    const box = draw(item);
    const refused = box.querySelector<HTMLElement>("[data-all-time-refused]")!;
    expect(refused.textContent).toBe("not published");
    expect(refused.getAttribute("title")).toMatch(/^Not drawn:/);
    expect(box.querySelector("svg")).toBeNull();
    expect(box.querySelector("[data-all-time-trio]")).toBeNull();
    expect(box.textContent).not.toMatch(/30D/);
  });

  it("a malformed block is refused, not guessed", () => {
    expect(readAllTime(withAllTime({ basis: "ALL_TIME", state: "AVAILABLE", sparkline: "x" })).kind).toBe("refused");
    expect(readAllTime(withAllTime("ALL_TIME")).kind).toBe("refused");
  });
});

describe("EA S01 - fallback keeps today's card", () => {
  it("no block: the lazy sparkline renders under its own label and nothing says 'all time'", () => {
    const item = base.items[0];
    expect(readAllTime(item).kind).toBe("absent");
    expect(readAllTime({ ...item, analytics_all_time: null } as unknown as RunLibraryItem).kind).toBe("absent");
    const series: SparklineRead = {
      kind: "series",
      values: Array.from({ length: 24 }, (_, i) => String(100 + i)),
      source: null,
      revision: null,
    };
    const box = draw(item, new Map([[item.run_id, series]]));
    expect(box.getAttribute("data-sparkline-source")).toBeNull();
    expect(box.textContent).toContain("stitched OOS equity");
    expect(box.textContent).not.toContain("all time");
    expect(box.querySelectorAll("[data-sparkline-values] > span")).toHaveLength(24);
    expect(box.querySelector("[data-all-time]")).toBeNull();
  });
});

describe("EA S01 - the lazy per-run sparkline is not requested when the card has its own all-time block", () => {
  function sparklineRequests(analytics: unknown): Promise<string[]> {
    const requested: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        requested.push(url);
        const items = [{ ...base.items[0], ...(analytics === undefined ? {} : { analytics_all_time: analytics }) }];
        const body = url.includes("/sparkline")
          ? { availability: { state: "NOT_PUBLISHED", reason_code: null }, values: [], source: null }
          : { ...base, items };
        return { ok: true, status: 200, statusText: "OK", headers: new Headers(), json: async () => body };
      }),
    );
    const { result } = renderHook(() => useRunLibrary(), {
      wrapper: ({ children }) => <MemoryRouter initialEntries={["/research/quantbt/runs"]}>{children}</MemoryRouter>,
    });
    return (async () => {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
      await act(async () => {
        result.current.observeVisible(base.items[0].run_id, true);
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
      return requested.filter((url) => url.includes("/sparkline"));
    })();
  }

  it("asks for the per-run series when there is no block", async () => {
    expect(base.items[0].sparkline.availability.state).toBe("AVAILABLE");
    expect(await sparklineRequests(undefined)).toHaveLength(1);
  });

  it("does not ask when the block is present", async () => {
    expect(await sparklineRequests(SUMMARY)).toHaveLength(0);
  });
});
