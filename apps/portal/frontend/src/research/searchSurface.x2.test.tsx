/**
 * X2 · B3 + F4 — Screen 06 on a retained WFO run draws the server's declared
 * space and trial surface (spec 06 A1–A5, B4), keeps pick in the hash
 * (T07/T08) and copies an evidence link with the run's own facts (T16).
 *
 * The search body is the published canonical fixture
 * (`research-current-source.search-surface.valid.json`, the real W5b seal
 * through the Control API service); progress and requested spec are the W3b
 * real bodies.
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

afterEach(cleanup);

const FIXTURES = join(process.cwd(), "..", "..", "..", "packages", "contracts", "fixtures");
const SURFACE = JSON.parse(readFileSync(join(FIXTURES, "research-current-source.search-surface.valid.json"), "utf8")) as CurrentSourceSearch;
const W3B = JSON.parse(readFileSync(join(process.cwd(), "src", "research", "w3bRealWfo.fixture.json"), "utf8")) as {
  progress: unknown;
  requested_spec: unknown;
  hub_search: unknown;
};
const RUN = SURFACE.run_id;

function stub(search: unknown = SURFACE) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const path = new URL(url, "http://x").pathname;
      const [status, payload] = path.endsWith("/progress")
        ? [200, W3B.progress]
        : path.endsWith("/requested-spec")
          ? [200, W3B.requested_spec]
          : path.endsWith("/current-source/search")
            ? [200, search]
            : path.endsWith("/search")
              ? [200, W3B.hub_search]
              : [404, { error: { code: "UNEXPECTED" } }];
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

describe("X2 · B3 — A1 is the declared space the run searched, with DR-02 on WFO", () => {
  it("prints the served ranges, exact levels, θ* placement and the shared bound warning; no UI code", async () => {
    const { container } = await settled();
    const panel = container.querySelector("[data-panel='search-space']") as HTMLElement;
    expect(panel.querySelector("[data-space-source]")?.getAttribute("data-space-source")).toBe("server");
    expect(panel.querySelectorAll("[data-parameter]")).toHaveLength(8);
    expect(panel.querySelector("[data-range='rsi_l']")?.textContent).toBe("12 … 30");
    expect(panel.querySelector("[data-levels='window']")?.textContent).toBe("21");
    expect(panel.querySelector("[data-levels='window']")?.getAttribute("data-levels-state")).toBe("AVAILABLE");
    // T11: θ* at its bound — red tick, "at upper bound" in the shared renderer.
    const rsi = panel.querySelector("[data-position='rsi_l']") as HTMLElement;
    expect(rsi.getAttribute("data-tick-tone")).toBe("AT_BOUND");
    expect(rsi.style.background).toBe("var(--bad)");
    expect(panel.querySelector("[data-parameter='rsi_l'] [data-bound-warning]")?.textContent).toBe("100% · at upper bound");
    expect(panel.querySelector("[data-parameter='slpercent'] [data-bound-warning]")?.getAttribute("data-bound-warning")).toBe("NEAR_BOUND");
    expect(panel.querySelector("[data-position='slpercent']")?.getAttribute("style")).toContain("var(--accent-2)");
    expect(panel.querySelector("[data-coverage-fact='grid_size']")?.textContent).toMatch(/grid_size\s*[\d,]+ points declared/);
    expect(panel.textContent).not.toContain("UI_RETAINED_LANE_HAS_NO_FIELD");
  });

  it("the panel scrolls sideways at narrow widths, so the keyboard can reach it: tabbable and named (axe scrollable-region-focusable)", async () => {
    const { container } = await settled();
    const panel = container.querySelector("[data-panel='search-space']") as HTMLElement;
    expect(panel.getAttribute("tabindex")).toBe("0");
    expect(panel.getAttribute("aria-label")).toBe("search space as declared");
    expect(panel.className).toContain("overflow-x-auto");
    panel.focus();
    expect(document.activeElement).toBe(panel);
  });

  it("a server that answers the declared space absent prints its own reason", async () => {
    stub({ ...SURFACE, declared_space: { ...SURFACE.declared_space!, state: "NOT_PUBLISHED", reason_code: "P16_HISTORICAL_PARAMETER_BINDING_NOT_REGISTERED", binding: null, parameters: [], grid_size: null } });
    const view = mount();
    await waitFor(() => expect(view.container.querySelector("[data-space-state='NOT_PUBLISHED']")).toBeTruthy());
    const panel = view.container.querySelector("[data-panel='search-space']") as HTMLElement;
    expect(panel.textContent).toContain("P16_HISTORICAL_PARAMETER_BINDING_NOT_REGISTERED");
    expect(view.container.querySelector("[data-panel='scatter']")?.getAttribute("data-panel-state")).toBe("NOT_PUBLISHED");
  });
});

describe("X2 · B3 — A2 trial surface (T09) and the honest sampling caption", () => {
  it("draws every retained trial at the server's placement, θ* = best IS, legend and caption", async () => {
    const { container } = await settled();
    const surface = container.querySelector("[data-surface]") as HTMLElement;
    expect(surface.getAttribute("data-surface")).toBe("window×rvol");
    expect(surface.querySelectorAll("[data-surface-point]")).toHaveLength(3);
    const theta = surface.querySelector("[data-surface-point='0']") as HTMLElement;
    expect(theta.getAttribute("data-point-role")).toBe("theta best");
    expect(theta.getAttribute("aria-label")).toContain("trial 0 · IS −1.44 · window 34 · rvol 1.2");
    const served = SURFACE.surface!.points.find((point) => point.trial_id === "0")!;
    expect(parseFloat(theta.style.left)).toBeCloseTo(served.positions.window! * 0.96 + 2, 2);
    expect([...surface.querySelectorAll("[data-surface-point]")].map((dot) => dot.getAttribute("data-point-bucket"))).toEqual(["4", "0", "2"]);
    expect(container.querySelector("[data-surface-caption]")?.textContent).toContain("3 of 3 trials drawn");
    expect(container.querySelector("[data-panel='scatter'] h3")?.textContent).toBe("A2 · trial surface — 3 trials · 0 pruned · global study");
  });

  it("T09: the axis picker re-plots; the legend stays", async () => {
    const { container } = await settled();
    const legend = container.querySelector("[data-surface-legend]")?.textContent;
    fireEvent.click(container.querySelector("[data-axis-pick='x:slpercent']") as Element);
    expect(container.querySelector("[data-surface]")?.getAttribute("data-surface")).toBe("slpercent×rvol");
    expect(container.querySelector("[data-axis-pick='x:slpercent']")?.getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector("[data-surface-x]")?.textContent).toBe("slpercent →");
    expect(container.querySelector("[data-surface-legend]")?.textContent).toBe(legend);
  });
});

describe("X2 · F4 — pick is a cursor in the hash (T07/T08)", () => {
  it("T07: clicking a point writes pick= and lights its ledger row; θ* does not move", async () => {
    const { container } = await settled();
    fireEvent.click(container.querySelector("[data-surface-point='2']") as Element);
    await waitFor(() => expect(window.location.hash).toContain("pick=2"));
    expect(container.querySelector("[data-trial='2']")?.getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector("[data-surface-point='2']")?.getAttribute("data-picked")).toBe("true");
    expect(container.querySelector("[data-trial='0']")?.getAttribute("data-trial-selected")).toBe("true");
  });

  it("T08: clicking a ledger row moves the ring on the surface", async () => {
    const { container } = await settled();
    fireEvent.click(container.querySelector("[data-trial='1']") as Element);
    await waitFor(() => expect(window.location.hash).toContain("pick=1"));
    expect(container.querySelector("[data-surface-point='1']")?.getAttribute("data-picked")).toBe("true");
    expect(container.querySelector("[data-surface-point='0']")?.getAttribute("data-picked")).toBeNull();
  });

  it("a link that carries pick= restores it on arrival, and forwards it to the next stage", async () => {
    const { container } = await settled("#stage=search&fold=1&pick=2");
    expect(container.querySelector("[data-trial='2']")?.getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector("[data-surface-point='2']")?.getAttribute("data-picked")).toBe("true");
    expect(container.querySelector("[data-action='next-stage']")?.getAttribute("href")).toContain("pick=2");
  });

  it("F2b: the pool and the selected card link on to S3 Freeze with the run, fold and pick kept, each with a tooltip", async () => {
    const { container } = await settled("#stage=search&fold=1&pick=2");
    for (const action of ["pool-to-freeze", "selected-to-freeze"]) {
      const link = container.querySelector(`[data-action='${action}']`);
      expect(link, action).toBeTruthy();
      const href = link?.getAttribute("href") ?? "";
      expect(href).toContain("/freeze");
      expect(href).toContain("pick=2");
      expect(href).toContain("fold=1");
      expect(link?.getAttribute("title")).toMatch(/S3 · Freeze/);
    }
  });
});

describe("X2 · B3 — A3/A4/A5/A6 and B4 from the server", () => {
  it("A3 draws each objective with the best-so-far line; A4 twelve regions per parameter", async () => {
    const { container } = await settled();
    expect(container.querySelectorAll("[data-progression-trial]")).toHaveLength(3);
    expect(container.querySelector("[data-rail-note]")?.textContent).toBe("pruned 0 of 3");
    expect(container.querySelectorAll("[data-distribution]")).toHaveLength(8);
    const rvol = container.querySelector("[data-distribution='rvol']") as HTMLElement;
    expect(rvol.querySelectorAll("[data-bin]")).toHaveLength(12);
    expect(rvol.querySelector("[data-regions-sampled]")?.textContent).toBe("2/12 regions sampled");
  });

  it("A5 is the server's Spearman proxy — not applicable under 8 trials, in words; A6 carries QuantBT's reason", async () => {
    const { container } = await settled();
    const importance = container.querySelector("[data-panel='importance']") as HTMLElement;
    expect(importance.getAttribute("data-panel-state")).toBe("NOT_APPLICABLE");
    expect(importance.textContent).toContain("Spearman ρ vs objective");
    expect(importance.querySelector("[title*='not fANOVA']")).toBeTruthy();
    expect(importance.textContent).toContain("3 trials, needs ≥ 8");
    const interactions = container.querySelector("[data-panel='interactions']") as HTMLElement;
    expect(interactions.querySelector("[data-gap-reason='interactions']")?.getAttribute("data-gap-code")).toBe("QUANTBT_ADVANCED_WFO_DID_NOT_PUBLISH_PARAMETER_INTERACTIONS");
  });

  it("B4 prints the top-decile share at θ* per parameter, one dot per parameter for a global study", async () => {
    const { container } = await settled();
    expect(container.querySelectorAll("[data-journey]")).toHaveLength(8);
    expect(container.querySelector("[data-journey='rsi_l'] [data-frequency]")?.textContent).toBe("100%");
    expect(container.querySelector("[data-journey-caption]")?.textContent).toContain("global θ* · top-decile share (1 of 3)");
    expect(container.querySelector("[data-journey-caption]")?.getAttribute("title")).toContain("no per-fold journey");
    expect(container.querySelector("[data-journey-caption]")?.textContent).toContain("top-decile share");
    for (const id of ["search-space", "scatter", "parameter_frequency", "interactions"]) {
      expect(container.querySelector(`[data-panel='${id}']`)?.textContent).not.toContain("UI_RETAINED_LANE_HAS_NO_FIELD");
    }
  });
});

describe("X2 · F4 — T16 copy evidence link", () => {
  it("copies this screen's URL with the run's mode, schedule, θ* trial and pick, and confirms once written", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const { container } = await settled("#stage=search&fold=1&pick=1");
    const button = container.querySelector("[data-action='copy-evidence-link']") as HTMLElement;
    await act(async () => {
      fireEvent.click(button);
    });
    const link = writeText.mock.calls[0]![0] as string;
    expect(link).toMatch(new RegExp(`/research/quantbt/runs/${RUN}/search#`));
    const hash = new URLSearchParams(link.split("#")[1]);
    expect(hash.get("stage")).toBe("search");
    expect(hash.get("mode")).toBe("mode_1_decay");
    expect(hash.get("schedule")).toBe("global");
    expect(hash.get("trial")).toBe("0");
    expect(hash.get("pick")).toBe("1");
    expect(hash.get("params")).toMatch(/^[0-9a-f]{64}$/);
    expect(button.textContent).toBe("✓ link copied");
  });
});
