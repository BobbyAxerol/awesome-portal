/**
 * Batch F4 · S01 - AN-19 last-30D on the card (published retained-analytics v2 fixture), humanised running stats,
 * LW-08 (the count on the screen is the Library's own).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { cleanup, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RunLibrary, last30dSeries, statDisplay } from "./RunLibrary";
import type { RunLibraryItem, RunLibraryResponse } from "./runLibraryClient";
import { researchState } from "./state";
import type { LibraryFilters } from "./useRunLibrary";

const library = JSON.parse(
  readFileSync(join(__dirname, "../../e2e/research-foundation/run-library.json"), "utf8"),
) as RunLibraryResponse;
const v2 = JSON.parse(
  readFileSync(join(__dirname, "../../../../../packages/contracts/fixtures/research-retained-analytics-v2.fixed.valid.json"), "utf8"),
);
const EMPTY: LibraryFilters = { q: "", status: [], mode: [], alpha: [], group: false, sel: [] };

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const completed = (library.items.find((item) => item.status === "COMPLETED") ?? library.items[0]!) as RunLibraryItem;

function withBlock(last_30d: RunLibraryItem["last_30d"]): RunLibraryItem {
  return { ...completed, status: "COMPLETED", last_30d };
}

function mount(item: RunLibraryItem) {
  const response = { ...library, items: [item], page: { ...library.page, total_rows: 7, filtered_rows: 1 } };
  const fetchSpy = vi.spyOn(globalThis, "fetch");
  render(
    <MemoryRouter>
      <RunLibrary
        filters={EMPTY}
        onFilters={vi.fn()}
        onToggleSel={vi.fn()}
        response={response}
        items={[item]}
        state={researchState({ kind: "ok", rowCount: 1 })}
        sparklines={new Map()}
        onVisible={vi.fn()}
        onLoadNext={vi.fn()}
        onLoadPrevious={vi.fn()}
      />
    </MemoryRouter>,
  );
  return fetchSpy;
}

const available = { state: "AVAILABLE", reason_code: null } as const;

describe("F4 S01 - last 30D", () => {
  it("value path: the card draws the served window under a last 30D label, with its return and Sharpe", () => {
    const item = withBlock({ availability: available, input_digest: v2.input_digest, data: v2.last_30d });
    mount(item);
    const spark = document.querySelector("[data-sparkline]")!;
    expect(spark.textContent).toContain("last 30D equity");
    const bars = spark.querySelector("[data-sparkline-values]")!;
    expect(bars.getAttribute("data-sparkline-window")).toBe("last_30d");
    expect(bars.getAttribute("data-sparkline-values")).toBe(String(Math.min(24, v2.last_30d.points.length)));
    expect(spark.querySelector("[data-sparkline-caption]")!.textContent).toBe(
      `last 30D · ${v2.last_30d.points.length} of ${v2.last_30d.source_observation_count}`,
    );
    expect(bars.getAttribute("title")).toContain("Portal-derived");
    const ret = document.querySelector('[data-metric="LAST_30D_RETURN"]')!;
    expect(ret.textContent).toContain("last 30D return");
    expect(ret.textContent).toContain("−0.27%");
    expect(ret.querySelector("[title]")!.getAttribute("title")).toContain(v2.last_30d.return_fraction.value);
    expect(document.querySelector('[data-metric="LAST_30D_SHARPE"]')!.textContent).toContain("-2.21");
  });

  it("never draws the window when it is absent, and never labels an all-time series 30D", () => {
    const absent = { state: "NOT_PUBLISHED", reason_code: "PORTAL_ANALYTICS_V2_NOT_COMPUTED_FOR_SEAL" } as const;
    const item = withBlock({ availability: absent, input_digest: null, data: null });
    expect(last30dSeries(item)).toBeNull();
    const fetchSpy = mount(item);
    expect(document.body.textContent).not.toContain("last 30D equity");
    expect(document.querySelector('[data-sparkline-window="last_30d"]')).toBeNull();
    const cell = document.querySelector('[data-metric="LAST_30D"]')!;
    expect(cell.textContent).toContain("not published");
    expect(cell.getAttribute("data-reason-code")).toBe("PORTAL_ANALYTICS_V2_NOT_COMPUTED_FOR_SEAL");
    expect(cell.querySelector("[title]")!.getAttribute("title")).toContain("predates Portal analytics v2");
    expect(document.querySelector('[data-metric="LAST_30D_RETURN"]')).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("a withheld Sharpe inside an available window stays a typed absence, not 0.00", () => {
    const data = {
      ...v2.last_30d,
      sharpe: { ...v2.last_30d.sharpe, state: "NOT_PUBLISHED", value: null, reason_code: "PORTAL_ANALYTICS_SHARPE_NOT_AVAILABLE" },
    };
    mount(withBlock({ availability: available, input_digest: v2.input_digest, data }));
    const cell = document.querySelector('[data-metric="LAST_30D_SHARPE"]')!;
    expect(cell.textContent).toContain("not published");
    expect(cell.textContent).not.toMatch(/0\.00/);
    expect(cell.querySelector("[data-reason-code]")!.getAttribute("data-reason-code")).toBe("PORTAL_ANALYTICS_SHARPE_NOT_AVAILABLE");
  });

  it("a partial window says so and a non-COMPLETED card shows no 30D cell at all", () => {
    expect(
      last30dSeries(withBlock({ availability: available, input_digest: "x", data: { ...v2.last_30d, partial_window: true } }))!.caption,
    ).toContain("partial");
    mount({ ...completed, status: "RUNNING", last_30d: { availability: available, input_digest: "x", data: v2.last_30d } });
    expect(document.querySelector('[data-metric^="LAST_30D"]')).toBeNull();
    expect(document.querySelector('[data-sparkline-window="last_30d"]')).toBeNull();
  });
});

describe("F4 S01 - running stats and the count", () => {
  it("humanises only a served `N s`, keeping the sentence as sent otherwise", () => {
    expect(statDisplay({ role: "ELAPSED", value: "2520 s" })).toBe("42m 00s");
    expect(statDisplay({ role: "RUNTIME", value: "8 s" })).toBe("8s");
    expect(statDisplay({ role: "ELAPSED", value: "about a while" })).toBe("about a while");
    expect(statDisplay({ role: "PROGRESS", value: "fold 3/5" })).toBe("fold 3/5");
    expect(statDisplay({ role: "ELAPSED", value: null })).toBeNull();
  });

  it("LW-08: the screen's count is the Library response's, and it asks for no legacy run list", () => {
    const fetchSpy = mount(completed);
    expect(document.body.textContent).toContain("1 of 7 runs");
    expect(fetchSpy.mock.calls.filter((call) => String(call[0]).startsWith("/api/runs"))).toEqual([]);
  });
});
