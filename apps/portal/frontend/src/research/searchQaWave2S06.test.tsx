/**
 * QA 2026-10-02 · second wave · S06 (D7 bad deep links, D9 sticky pick chip clears the shell bar).
 *
 * Bodies are the published canonical fixture (`research-current-source.search-surface.valid.json`)
 * and the W3b real progress / requested-spec / hub-search bodies; a test changes only the field it is about.
 */
import { cleanup, render, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SearchRoute } from "./SearchRoute";
import type { CurrentSourceSearch } from "./searchClient";
import { forgetObservedFolds } from "./evidenceCursor";
import { forgetSearchReads } from "./useSearch";
import { forgetRunIdentities } from "./retainedLane";

afterEach(cleanup);

const FIXTURES = join(process.cwd(), "..", "..", "..", "packages", "contracts", "fixtures");
const SURFACE = JSON.parse(readFileSync(join(FIXTURES, "research-current-source.search-surface.valid.json"), "utf8")) as CurrentSourceSearch;
const W3B = JSON.parse(readFileSync(join(process.cwd(), "src", "research", "w3bRealWfo.fixture.json"), "utf8")) as {
  progress: unknown;
  requested_spec: unknown;
  hub_search: unknown;
};
const SPLIT = JSON.parse(readFileSync(join(FIXTURES, "research-current-source.split.valid.json"), "utf8")) as unknown;
const RUN = SURFACE.run_id;

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
      } else if (path.endsWith("/current-source/split")) answer = [200, SPLIT];
      else if (path.endsWith("/search")) answer = [200, W3B.hub_search];
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

describe("D7 — a link the search cannot honour is said and taken out of the URL", () => {
  it("fold=99 is clamped to the fold plan's last fold, with the served notice, and the URL says so", async () => {
    const { container } = await settled("#stage=search&fold=99");
    await waitFor(() => expect(window.location.hash).toContain("fold=2"));
    expect(window.location.hash).not.toContain("fold=99");
    expect(container.querySelector("[data-cursor-note='CURSOR_FOLD_CLAMPED']")?.textContent).toContain("fold 99");
  });

  it("an unknown pick is dropped from the URL with a one-line notice; a known pick is kept", async () => {
    const { container } = await settled("#stage=search&fold=1&pick=9999");
    await waitFor(() => expect(window.location.hash).not.toContain("pick="));
    expect(container.querySelector("[data-link-notice]")?.textContent).toContain("trial 9999");
    expect(container.querySelector("[data-pick-chip]")).toBeNull();
    cleanup();
    const again = await settled("#stage=search&fold=1&pick=1");
    expect(again.container.querySelector("[data-pick-chip='1']")).toBeTruthy();
    expect(again.container.querySelector("[data-link-notice]")).toBeNull();
    expect(window.location.hash).toContain("pick=1");
  });

  it("stage=freeze on the search route is normalised to stage=search with a notice", async () => {
    const { container } = await settled("#stage=freeze&fold=1");
    await waitFor(() => expect(window.location.hash).toContain("stage=search"));
    expect(window.location.hash).not.toContain("stage=freeze");
    expect(container.querySelector("[data-link-notice]")?.textContent).toContain("freeze");
  });
});

describe("D9 — the pick chip clears the shell's top bar", () => {
  it("its sticky offset is the bar height plus a gap, never a bare 8px", async () => {
    const { container } = await settled("#stage=search&fold=1&pick=1");
    const chip = container.querySelector("[data-pick-chip='1']") as HTMLElement;
    expect(chip.style.top).toContain("--topbar-h");
  });
});

describe("D10 — the A2 ramp is remapped for the dark research screen", () => {
  it("operations theme defines all five ramp steps, scoped to .research-screen, high brighter than low", () => {
    const css = readFileSync(join(process.cwd(), "src", "styles", "tokens.css"), "utf8");
    const block = css.slice(css.indexOf(':root[data-theme="operations"] .research-screen {'));
    const body = block.slice(0, block.indexOf("}"));
    const lum = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
    };
    const steps = [1, 2, 3, 4, 5].map((n) => new RegExp(`--viz-ramp-${n}:\\s*(#[0-9a-f]{6})`).exec(body)?.[1]);
    expect(steps.every((step) => typeof step === "string")).toBe(true);
    const values = steps.map((step) => lum(step as string));
    expect(values).toEqual([...values].sort((a, b) => a - b));
    expect(values[0]!).toBeLessThan(90);
  });
});
