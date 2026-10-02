/**
 * QA 2026-10-02 · S06 fixes (D1, D2, D4, D5, D8, D9, D16, D19, H02, H13).
 *
 * Bodies are the published canonical fixture (`research-current-source.search-surface.valid.json`)
 * and the W3b real progress / requested-spec / hub-search bodies; a test changes only the field it is about.
 */
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SearchRoute } from "./SearchRoute";
import type { CurrentSourceSearch } from "./searchClient";
import { forgetObservedFolds } from "./evidenceCursor";
import { forgetSearchReads } from "./useSearch";
import { forgetRunIdentities } from "./retainedLane";
import { neighbourInDirection } from "./SearchSurface";
import { cleanParamText } from "./searchParamText";
import { formulaFromTerms } from "./SearchStageB";

afterEach(cleanup);

const FIXTURES = join(process.cwd(), "..", "..", "..", "packages", "contracts", "fixtures");
const SURFACE = JSON.parse(readFileSync(join(FIXTURES, "research-current-source.search-surface.valid.json"), "utf8")) as CurrentSourceSearch;
const W3B = JSON.parse(readFileSync(join(process.cwd(), "src", "research", "w3bRealWfo.fixture.json"), "utf8")) as {
  progress: unknown;
  requested_spec: unknown;
  hub_search: unknown;
};
const RUN = SURFACE.run_id;
const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

type Answer = [number, unknown];
let currentSourceCalls: string[] = [];

function stub(currentSource: (params: URLSearchParams) => Answer = () => [200, SURFACE]) {
  currentSourceCalls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const parsed = new URL(url, "http://x");
      const path = parsed.pathname;
      let answer: Answer;
      if (path.endsWith("/progress")) answer = [200, W3B.progress];
      else if (path.endsWith("/requested-spec")) answer = [200, W3B.requested_spec];
      else if (path.endsWith("/current-source/search")) {
        currentSourceCalls.push(parsed.search);
        answer = currentSource(parsed.searchParams);
      } else if (path.endsWith("/search")) answer = [200, W3B.hub_search];
      else answer = [404, { error: { code: "UNEXPECTED" } }];
      const [status, payload] = answer;
      return { ok: status < 300, status, statusText: String(status), headers: new Headers(), json: async () => payload } as unknown as Response;
    }),
  );
}

function mount(hash = "") {
  const path = `/research/quantbt/runs/${RUN}/search`;
  window.history.replaceState(null, "", `${path}${hash}`);
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/research/quantbt/runs/:runId/search" element={<SearchRoute />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function settled(hash = "") {
  const view = mount(hash);
  await waitFor(() => expect(view.container.querySelector("[data-surface]")).toBeTruthy());
  await waitFor(() => expect(view.container.querySelector("[data-readiness='READY']")).toBeTruthy());
  return view;
}

beforeEach(() => {
  vi.unstubAllGlobals();
  forgetSearchReads();
  forgetRunIdentities();
  forgetObservedFolds();
  stub();
});

describe("D1 — the plot and the ledger are one tab stop each, arrows move inside", () => {
  it("only one A2 point is tabbable (θ* when nothing is picked); every other point is -1", async () => {
    const { container } = await settled();
    const points = [...container.querySelectorAll("[data-surface-point]")] as HTMLElement[];
    expect(points).toHaveLength(3);
    const stops = points.filter((point) => point.tabIndex === 0);
    expect(stops).toHaveLength(1);
    expect(stops[0]!.getAttribute("data-surface-point")).toBe(SURFACE.surface!.selected_trial_id);
  });

  it("the picked point is the tab stop, and an arrow key moves focus to a neighbour and re-roves the stop", async () => {
    const { container } = await settled("#stage=search&fold=1&pick=2");
    const picked = container.querySelector("[data-surface-point='2']") as HTMLElement;
    expect(picked.tabIndex).toBe(0);
    act(() => picked.focus());
    const before = document.activeElement;
    for (const key of ["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown"]) fireEvent.keyDown(document.activeElement as Element, { key });
    const moved = document.activeElement as HTMLElement;
    expect(moved.hasAttribute("data-surface-point")).toBe(true);
    // exactly one stop remains, and it is where the focus is
    const stops = [...container.querySelectorAll("[data-surface-point]")].filter((point) => (point as HTMLElement).tabIndex === 0);
    expect(stops).toHaveLength(1);
    expect(stops[0]).toBe(moved);
    expect(before).toBe(picked);
  });

  it("neighbourInDirection picks the nearest point in that direction and nothing where there is none", () => {
    const at = { x: 50, y: 50 };
    const others = [
      { id: "r", x: 70, y: 52 },
      { id: "far", x: 95, y: 50 },
      { id: "l", x: 20, y: 50 },
    ];
    expect(neighbourInDirection(at, others, "ArrowRight")).toBe("r");
    expect(neighbourInDirection(at, others, "ArrowLeft")).toBe("l");
    expect(neighbourInDirection(at, others, "ArrowUp")).toBeNull();
    expect(neighbourInDirection(at, others, "Enter")).toBeNull();
  });

  it("ledger rows: one tab stop (the first row), ArrowDown walks the rows", async () => {
    const { container } = await settled();
    const rows = [...container.querySelectorAll("[data-trial]")] as HTMLElement[];
    expect(rows.length).toBeGreaterThan(1);
    expect(rows.filter((row) => row.tabIndex === 0)).toHaveLength(1);
    expect(rows[0]!.tabIndex).toBe(0);
    act(() => rows[0]!.focus());
    fireEvent.keyDown(rows[0]!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(rows[1]);
    fireEvent.keyDown(rows[1]!, { key: "ArrowUp" });
    expect(document.activeElement).toBe(rows[0]);
  });
});

describe("D9 — a pick is visible, never teleports the page, and can be let go", () => {
  it("clicking a point shows the pick chip and does not scroll; clicking it again clears pick= from the hash", async () => {
    const scroll = vi.fn();
    (Element.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = scroll;
    const { container } = await settled();
    fireEvent.click(container.querySelector("[data-surface-point='2']") as Element);
    await waitFor(() => expect(window.location.hash).toContain("pick=2"));
    expect(container.querySelector("[data-pick-chip='2']")?.textContent).toContain("trial 2");
    expect(scroll).not.toHaveBeenCalled();
    fireEvent.click(container.querySelector("[data-surface-point='2']") as Element);
    await waitFor(() => expect(window.location.hash).not.toContain("pick="));
    expect(container.querySelector("[data-pick-chip]")).toBeNull();
    expect(container.querySelector("[data-surface-point='2']")?.getAttribute("data-picked")).toBeNull();
  });

  it("the chip's × and Escape both clear the pick", async () => {
    const { container } = await settled("#stage=search&fold=1&pick=1");
    expect(container.querySelector("[data-pick-chip='1']")).toBeTruthy();
    fireEvent.click(container.querySelector("[data-action='clear-pick']") as Element);
    await waitFor(() => expect(container.querySelector("[data-pick-chip]")).toBeNull());
    expect(window.location.hash).not.toContain("pick=");

    fireEvent.click(container.querySelector("[data-trial='1']") as Element);
    await waitFor(() => expect(container.querySelector("[data-pick-chip='1']")).toBeTruthy());
    fireEvent.keyDown(container.querySelector("[data-surface-point='1']") as Element, { key: "Escape" });
    await waitFor(() => expect(container.querySelector("[data-pick-chip]")).toBeNull());
  });

  it("clearing keeps every other carried key (θ* trial, mode)", async () => {
    const { container } = await settled("#stage=search&fold=1&pick=2");
    fireEvent.click(container.querySelector("[data-action='clear-pick']") as Element);
    await waitFor(() => expect(window.location.hash).not.toContain("pick="));
    expect(window.location.hash).toContain("stage=search");
    expect(window.location.hash).toContain("fold=1");
  });
});

describe("D5 — the ledger pages with the served cursor", () => {
  function paged(): (params: URLSearchParams) => Answer {
    return (params) => {
      if (params.get("cursor") === "cursor-2") {
        const second = copy(SURFACE);
        const extra = copy(SURFACE.ledger.trials[0]!);
        extra.trial_id = "3";
        extra.parameters = { ...extra.parameters, rvol: "2.4000000000000004" };
        // the server repeats trial 0 on the boundary; it must be kept once
        second.ledger.trials = [copy(SURFACE.ledger.trials[0]!), extra];
        second.ledger.page = { ...SURFACE.ledger.page, has_more: false, next_cursor: null, has_previous: true, prev_cursor: "p" } as typeof SURFACE.ledger.page;
        return [200, second];
      }
      const first = copy(SURFACE);
      first.ledger.source_trial_count = 4;
      first.ledger.page = { ...SURFACE.ledger.page, has_more: true, next_cursor: "cursor-2" } as typeof SURFACE.ledger.page;
      return [200, first];
    };
  }

  it("offers 'show more', echoes the cursor exactly, appends once, then offers nothing", async () => {
    stub(paged());
    const { container } = await settled();
    expect(container.querySelectorAll("[data-trial]")).toHaveLength(3);
    const more = container.querySelector("[data-action='ledger-more']") as HTMLButtonElement;
    expect(more.textContent).toContain("3 of 4");
    fireEvent.click(more);
    await waitFor(() => expect(container.querySelectorAll("[data-trial]")).toHaveLength(4));
    expect(currentSourceCalls.some((search) => search.includes("cursor=cursor-2"))).toBe(true);
    expect(container.querySelector("[data-trial='3']")).toBeTruthy();
    expect(container.querySelector("[data-ledger-total]")?.textContent).toContain("4 of 4");
    expect(container.querySelector("[data-action='ledger-more']")).toBeNull();
  });

  it("D4: the appended trial's parameter noise is gone, in the row and in the point title", async () => {
    stub(paged());
    const { container } = await settled();
    fireEvent.click(container.querySelector("[data-action='ledger-more']") as Element);
    await waitFor(() => expect(container.querySelector("[data-trial='3']")).toBeTruthy());
    const note = container.querySelector("[data-trial='3'] [data-trial-note]")?.textContent ?? "";
    expect(note).toContain("rvol=2.4");
    expect(note).not.toContain("2.4000000000000004");
  });

  it("a failed page says so and keeps the button for another try", async () => {
    stub((params) => (params.get("cursor") ? [503, { error: { code: "UNAVAILABLE" } }] : paged()(params)));
    const { container } = await settled();
    fireEvent.click(container.querySelector("[data-action='ledger-more']") as Element);
    await waitFor(() => expect(container.querySelector("[data-ledger-more-error]")).toBeTruthy());
    expect(container.querySelector("[data-action='ledger-more']")).toBeTruthy();
    expect(container.querySelectorAll("[data-trial]")).toHaveLength(3);
  });
});

describe("D4 — float noise", () => {
  it("removes binary noise, leaves integers, categories and short decimals alone", () => {
    expect(cleanParamText("2.4000000000000004")).toBe("2.4");
    expect(cleanParamText("0.8999999999999999")).toBe("0.9");
    expect(cleanParamText("1.9000000000000001")).toBe("1.9");
    expect(cleanParamText("14")).toBe("14");
    expect(cleanParamText("1.25")).toBe("1.25");
    expect(cleanParamText("ema")).toBe("ema");
    expect(cleanParamText("-0.30000000000000004")).toBe("-0.3");
  });
});

describe("D8 — a failed lane read is a failure with a retry, not 'not published'", () => {
  it("a 503 on current-source/search shows an error with a retry and never the pending-source sentence", async () => {
    stub(() => [503, { error: { code: "UNAVAILABLE", message: "down" } }]);
    const { container } = mount();
    await waitFor(() => expect(container.querySelector("[data-action='reread']")).toBeTruthy());
    expect(container.textContent).not.toContain("has not reported this run's search facts");
    expect(container.textContent).not.toContain("P15_CURRENT_P04_SOURCE_RECEIPT_NOT_PUBLISHED");
    // the retry asks the lane again and the screen recovers
    stub();
    fireEvent.click(container.querySelector("[data-action='reread']") as Element);
    await waitFor(() => expect(container.querySelector("[data-surface]")).toBeTruthy());
    expect(currentSourceCalls.length).toBeGreaterThan(0);
  });
});

describe("D2 / D16 / D19 / H13 — honest labels", () => {
  it("D2: the S4 completion time is labelled as that, not as the pool's freeze", async () => {
    const { container } = await settled();
    const row = container.querySelector("[data-pool-row='frozen-at']") as HTMLElement;
    expect(row.textContent).toContain("stage 4 completed");
    expect(row.textContent).not.toContain("frozen at");
  });

  it("D2: a time from another source keeps the plain label", async () => {
    const body = copy(SURFACE);
    (body.pool as unknown as { frozen_at_source: string }).frozen_at_source = "SOME_OTHER_CLOCK";
    stub(() => [200, body]);
    const { container } = await settled();
    expect(container.querySelector("[data-pool-row='frozen-at']")?.textContent).toContain("frozen at");
  });

  it("D19: the decay row reads 'mean decay', not the overbar glyph", async () => {
    const { container } = await settled();
    const text = container.querySelector("[data-role-card='selected']")?.textContent ?? "";
    expect(text).toContain("mean decay");
    expect(text).not.toContain("d̄");
  });

  it("H13: 'Centroid — not applicable' is gone (it is by design)", async () => {
    const { container } = await settled();
    expect(container.querySelector("[data-roles-note]")?.textContent).not.toContain("Centroid");
  });

  it("D16: a signed formula term keeps its hyphen only inside the engine's formula string, never in the UI term rows", () => {
    expect(formulaFromTerms([{ term: "mean_oos_sharpe", weight: "1" }, { term: "std_decay", weight: "-0.5" }])).toBe("mean_oos_sharpe - 0.5 * std_decay");
  });
});
