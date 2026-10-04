/**
 * P25 · AE — the S06 search cinema, a selection story over served artifacts.
 * The search body is the published canonical fixture; the "overruled" case
 * edits the served ids only (identity of two ids is all the cinema compares).
 */
import { act, cleanup, fireEvent, render, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_CURSOR } from "./evidenceCursor";
import { SearchCinema } from "./SearchCinema";
import type { CurrentSourceSearch } from "./searchClient";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const FIXTURES = join(process.cwd(), "..", "..", "..", "packages", "contracts", "fixtures");
const BASE = JSON.parse(readFileSync(join(FIXTURES, "research-current-source.search-surface.valid.json"), "utf8")) as CurrentSourceSearch;

const clone = (): CurrentSourceSearch => JSON.parse(JSON.stringify(BASE));

function mount(search: CurrentSourceSearch, extra: Partial<React.ComponentProps<typeof SearchCinema>> = {}) {
  return render(
    <MemoryRouter>
      <SearchCinema
        runId={search.run_id}
        cursor={DEFAULT_CURSOR}
        search={search}
        surface={search.surface!}
        parametersOf={() => undefined}
        digestOf={() => null}
        {...extra}
      />
    </MemoryRouter>,
  );
}

const beatText = (c: HTMLElement) => c.querySelector("[data-cinema-beat]")!.textContent ?? "";
const pill = (c: HTMLElement, n: number) => c.querySelector<HTMLButtonElement>(`[data-cinema-step="${n}"]`)!;

/** A copy whose IS best (trial 2) differs from the selected θ* (trial 0). */
function overruled(): CurrentSourceSearch {
  const s = clone();
  s.surface!.best_is_trial_id = "2";
  s.selection.roles.raw_best_is.trial_id = "2";
  s.selection.roles.raw_best_is_equals_selected = false;
  return s;
}

beforeEach(() => {
  /* jsdom has no matchMedia: motion off (static) unless a test turns it on. */
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("reduce"), media: q, addEventListener() {}, removeEventListener() {} }));
});

describe("P25 · cinema — five beats", () => {
  it("renders five step pills, the first current, and every trial in order", () => {
    const { container } = mount(clone());
    expect(container.querySelectorAll("[data-cinema-step]")).toHaveLength(5);
    expect(pill(container, 1).getAttribute("aria-current")).toBe("step");
    const ids = [...container.querySelectorAll("[data-cinema-point]")].map((e) => e.getAttribute("data-cinema-point"));
    expect(ids).toEqual(["0", "1", "2"]);
  });

  it("each pill moves the beat; beat 2 names K and the served rule, the freeze clock stays a typed absence", () => {
    const { container } = mount(clone());
    fireEvent.click(pill(container, 2));
    expect(pill(container, 2).getAttribute("aria-current")).toBe("step");
    expect(beatText(container)).toContain("top 1 of 3");
    expect(beatText(container)).toContain("CEIL_N_TIMES_TOP_IS_FRACTION");
    expect(container.querySelector("[data-cinema-stamp]")?.textContent).toMatch(/pool frozen · K = ⌈3 × 0\.1⌉ = 1/);
    expect(container.querySelector("[data-frozen-at='absent']")).toBeTruthy();
    expect(container.querySelectorAll("[data-point-pool]").length).toBeGreaterThan(0);
  });

  it("beat 3 lists the served candidates by J, values only", () => {
    const { container } = mount(clone());
    fireEvent.click(pill(container, 3));
    expect(container.querySelectorAll("[data-rescore-row]").length).toBe(BASE.candidates.rows.length);
    expect(container.querySelector("[data-rescore-role='theta']")).toBeTruthy();
  });

  it("beat 4 says the IS best was selected when the ids are equal", () => {
    const { container } = mount(clone());
    fireEvent.click(pill(container, 4));
    expect(container.querySelector("[data-beat-duel]")?.getAttribute("data-duel")).toBe("same");
    expect(container.querySelector("[data-duel-sentence]")?.textContent).toBe("the IS best was selected");
    expect(container.querySelectorAll("[data-duel-side]")).toHaveLength(1);
  });

  it("beat 4 sets the IS best beside θ* and says the selection overruled it when the ids differ", () => {
    const { container } = mount(overruled());
    fireEvent.click(pill(container, 4));
    expect(container.querySelector("[data-beat-duel]")?.getAttribute("data-duel")).toBe("overruled");
    expect(container.querySelector("[data-duel-sentence]")?.textContent).toBe("selection overruled the IS best");
    const sides = [...container.querySelectorAll("[data-duel-side]")].map((e) => e.getAttribute("data-duel-side"));
    expect(sides).toEqual(["IS best", "θ*"]);
    /* the IS best is not in the pool ledger here: typed, never blank */
    expect(within(container.querySelector("[data-duel-side='IS best']") as HTMLElement).getAllByText("not in pool").length).toBeGreaterThan(0);
  });

  it("beat 5 seals θ* with the digest absence, the seal clock absence and a link into Stage 3", () => {
    const { container } = mount(clone());
    fireEvent.click(pill(container, 5));
    expect(beatText(container)).toContain("θ* · trial 0");
    expect(container.querySelector("[data-seal-at='absent']")).toBeTruthy();
    expect(container.querySelector("[data-action='cinema-to-freeze']")?.getAttribute("href")).toContain("/freeze");
  });

  it("beat 5 prints the digest the ledger served", () => {
    const { container } = mount(clone(), { digestOf: () => "a".repeat(64) });
    fireEvent.click(pill(container, 5));
    expect(container.querySelector("[data-seal-digest]")?.getAttribute("title")).toBe("a".repeat(64));
  });

  it("keeps the sampler absence as one muted line, with the Atlas release default only when it is in hand", () => {
    const none = mount(clone());
    expect(none.container.querySelector("[data-cinema-absences]")?.textContent).toContain("sampler: not published");
    expect(none.container.querySelector("[data-sampler-default]")).toBeNull();
    cleanup();
    const atlas = { optimizer_defaults: { groups: [{ group_id: "sampler", fields: [{ field_id: "name", default_value: "tpe", value_source: "RELEASE_DEFAULT", override_state: "LOCKED" }] }] } };
    const withAtlas = mount(clone(), { atlas: { state: "ready", kind: "CURRENT", doc: { current_release: atlas } } as never });
    expect(withAtlas.container.querySelector("[data-sampler-default]")?.textContent).toBe("tpe · release default, locked");
  });
});

describe("P25 · cinema — scrubber and motion", () => {
  it("one tab stop; arrows move the trial, Shift jumps, Home/End, and the live node says the point's title", () => {
    const { container } = mount(clone());
    const plot = container.querySelector<HTMLElement>("[data-cinema-plot]")!;
    expect(plot.getAttribute("tabindex")).toBe("0");
    expect(container.querySelectorAll("[data-cinema-plot] [tabindex]")).toHaveLength(0);
    plot.focus();
    fireEvent.keyDown(plot, { key: "Home" });
    const live = () => container.querySelector("[data-chart-live]")!.textContent;
    expect(live()).toMatch(/^trial 0 · IS /);
    expect(live()).toBe(container.querySelector("[data-cinema-point='0']")!.getAttribute("title"));
    fireEvent.keyDown(plot, { key: "ArrowRight" });
    expect(live()).toMatch(/^trial 1 · /);
    fireEvent.keyDown(plot, { key: "ArrowRight", shiftKey: true });
    expect(live()).toMatch(/^trial 2 · /);
    fireEvent.keyDown(plot, { key: "End" });
    expect(live()).toMatch(/^trial 2 · /);
  });

  it("in beat 1 the scrubber reveals trials up to the cursor and shows the served best so far", () => {
    const { container } = mount(clone());
    const plot = container.querySelector<HTMLElement>("[data-cinema-plot]")!;
    plot.focus();
    fireEvent.keyDown(plot, { key: "Home" });
    expect(container.querySelectorAll("[data-cinema-point]")).toHaveLength(1);
    expect(container.querySelector("[data-cinema-readout]")?.textContent).toContain("trial 1 of 3");
    expect(container.querySelector("[data-cinema-readout]")?.textContent).toContain("best so far");
    expect(container.querySelector("[data-cinema-ring]")).toBeTruthy();
    fireEvent.keyDown(plot, { key: "Escape" });
    expect(container.querySelectorAll("[data-cinema-point]")).toHaveLength(3);
  });

  it("reduced motion: no autoplay; the play button steps through the beats and wraps", () => {
    const { container } = mount(clone());
    const play = container.querySelector<HTMLButtonElement>("[data-action='cinema-play']")!;
    expect(container.querySelector("[data-panel='search-cinema']")?.getAttribute("data-motion")).toBe("off");
    expect(play.textContent).toContain("step");
    for (const n of [2, 3, 4, 5, 1]) {
      fireEvent.click(play);
      expect(pill(container, n).getAttribute("aria-current")).toBe("step");
    }
    expect(container.querySelector("[data-panel='search-cinema']")?.getAttribute("data-playing")).toBe("false");
  });

  it("with motion: play advances a beat every ~1.5 s, pause stops it", () => {
    vi.useFakeTimers();
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }));
    const { container } = mount(clone());
    const root = container.querySelector("[data-panel='search-cinema']")!;
    const play = container.querySelector<HTMLButtonElement>("[data-action='cinema-play']")!;
    expect(root.getAttribute("data-motion")).toBe("on");
    fireEvent.click(play);
    expect(play.textContent).toContain("pause");
    for (let k = 0; k < 40; k += 1) act(() => void vi.advanceTimersByTime(50));
    expect(root.getAttribute("data-beat")).toBe("2");
    fireEvent.click(play);
    expect(play.textContent).toContain("play");
    for (let k = 0; k < 100; k += 1) act(() => void vi.advanceTimersByTime(50));
    expect(root.getAttribute("data-beat")).toBe("2");
  });
});
