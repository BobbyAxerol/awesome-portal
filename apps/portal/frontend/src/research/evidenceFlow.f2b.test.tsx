/**
 * F2b — Screen 04 Evidence Flow: the UX flow (S04).
 *
 *  - every stage tab's heading is the link to its full screen, keeping run + fold + window
 *  - the window switcher writes `?window=is|oos|holdout` and keeps the hash cursor
 *  - a window the Hub does not publish is a typed absence, not OOS numbers under another label
 *  - previous / next stage links at the foot of every tab; the last tab hands on to the report
 *  - the way out (S1–S4 screens, report, runs) is carried with the cursor; copy link carries the window
 *  - the stage state is a dot beside its word
 */
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EvidenceFlow } from "./EvidenceFlow";
import type { EvidenceHub } from "./evidenceClient";
import { DEFAULT_CURSOR, type EvidenceCursor } from "./evidenceCursor";
import { parseWindow, withWindow } from "./evidenceWindow";
import { researchState } from "./state";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

const local = <T,>(name: string) => JSON.parse(readFileSync(join(process.cwd(), "src", "research", name), "utf8")) as T;
const W3B = local<{ hub_evidence: EvidenceHub }>("w3bRealWfo.fixture.json");
const OK = researchState({ kind: "ok", rowCount: 5 });
const RUN = "R-WFO-118";

function view(opts: { entry?: string; cursor?: EvidenceCursor; onStage?: (stage: string) => void } = {}) {
  return render(
    <MemoryRouter initialEntries={[opts.entry ?? `/research/quantbt/runs/${RUN}/evidence`]}>
      <EvidenceFlow
        runId={RUN}
        hub={W3B.hub_evidence}
        state={OK}
        cursor={opts.cursor ?? DEFAULT_CURSOR}
        onStage={(opts.onStage as never) ?? vi.fn()}
        onFold={vi.fn()}
        onResetCursor={vi.fn()}
        series={new Map()}
        ensureSeries={vi.fn()}
        passport={{ state: "idle" }}
        ensurePassport={vi.fn()}
        onReread={vi.fn()}
      />
    </MemoryRouter>,
  );
}

/** Stage tabs embed their deep dive, which reads on mount: answer every read 404 and let it settle. */
async function settled(opts: Parameters<typeof view>[0] = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: false,
      status: 404,
      statusText: "404",
      headers: new Headers(),
      json: async () => ({ error: { code: "NOT_FOUND" } }),
    }) as unknown as Response),
  );
  const out = view(opts);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 60));
  });
  return out;
}
const HUB_RUN = W3B.hub_evidence.run_id;

describe("F2b — the window vocabulary", () => {
  it("reads only is | oos | holdout, and adds the key before the hash", () => {
    expect(parseWindow("?window=is")).toBe("is");
    expect(parseWindow("?window=holdout&x=1")).toBe("holdout");
    expect(parseWindow("?window=compare")).toBeNull();
    expect(parseWindow("")).toBeNull();
    expect(withWindow("/r/split#stage=split&fold=2", "is")).toBe("/r/split?window=is#stage=split&fold=2");
    expect(withWindow("/r/split#stage=split&fold=2", null)).toBe("/r/split#stage=split&fold=2");
  });
});

describe("F2b — the heading is the link to the full stage screen", () => {
  it.each([
    ["split", "split"],
    ["search", "search"],
    ["freeze", "freeze"],
    ["execute", "execute"],
  ] as const)("%s: heading link keeps run + fold, adds the named window, has a tooltip", async (stage, path) => {
    const { container } = await settled({
      entry: `/research/quantbt/runs/${RUN}/evidence?window=holdout`,
      cursor: { ...DEFAULT_CURSOR, stage, fold: 2 },
    });
    /* W4B: the tab is a summary card; its primary button is the way to the full screen. */
    const link = container.querySelector(`[data-hub-stage-summary='${stage}'] a[data-deep-dive='${stage}']`) as HTMLAnchorElement;
    expect(link, stage).toBeTruthy();
    expect(link.textContent).toMatch(/^Open S\d+ \w+ →$/);
    const href = link.getAttribute("href") ?? "";
    expect(href).toContain(`/runs/${RUN}/${path}?window=holdout#`);
    expect(href).toContain("fold=2");
    expect(link.getAttribute("title")).toMatch(/holdout window/);
  });

  it("without a named window the link is unchanged (no defaulted key)", async () => {
    const { container } = await settled({ cursor: { ...DEFAULT_CURSOR, stage: "split", fold: 1 } });
    const href = container.querySelector("a[data-deep-dive='split']")?.getAttribute("href") ?? "";
    expect(href).not.toContain("window=");
  });
});

describe("F2b — the window switcher", () => {
  it("writes ?window= (hash kept) and the pill follows", () => {
    window.history.replaceState(null, "", "/research/quantbt/runs/R-WFO-118/evidence#stage=summary&fold=1");
    const { container } = view();
    expect(container.querySelector("[data-cursor-window]")?.textContent).toBe("window OOS");
    fireEvent.click(container.querySelector("[data-window-switcher] [data-segment='IS']") as Element);
    expect(window.location.search).toBe("?window=is");
    expect(window.location.hash).toBe("#stage=summary&fold=1");
    expect(container.querySelector("[data-cursor-window]")?.textContent).toBe("window IS");
    expect(container.querySelector("[data-window-switcher] [data-segment='IS']")?.getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector("[data-window-switcher] [data-segment='OOS']")?.getAttribute("aria-pressed")).toBe("false");
    window.history.replaceState(null, "", "/");
  });

  it("an arriving ?window=holdout opens on it", () => {
    const { container } = view({ entry: `/research/quantbt/runs/${RUN}/evidence?window=holdout` });
    expect(container.querySelector("[data-cursor-window]")?.textContent).toBe("window Holdout");
    expect(container.querySelector("[data-window-switcher] [data-segment='Holdout Live']")?.getAttribute("aria-pressed")).toBe("true");
  });

  it("a window the Hub does not publish is a typed absence, and the OOS body is hidden, not relabelled", () => {
    const { container } = view({ entry: `/research/quantbt/runs/${RUN}/evidence?window=is` });
    const absent = container.querySelector("[data-window-absent='is']") as HTMLElement;
    expect(absent.textContent).toContain("not published");
    expect((container.querySelector("[data-window-body]") as HTMLElement).style.display).toBe("none");
    const split = absent.querySelector("[data-window-open='split']") as HTMLAnchorElement;
    const replay = absent.querySelector("[data-window-open='execute']") as HTMLAnchorElement;
    expect(split.getAttribute("href")).toContain(`/runs/${RUN}/split?window=is#`);
    expect(replay.getAttribute("href")).toContain(`/runs/${RUN}/execute?window=is#`);
    expect(split.getAttribute("title")).toBeTruthy();
  });

  it("OOS shows no absence panel", () => {
    const { container } = view({ entry: `/research/quantbt/runs/${RUN}/evidence?window=oos` });
    expect(container.querySelector("[data-window-absent]")).toBeNull();
    expect((container.querySelector("[data-window-body]") as HTMLElement).style.display).toBe("");
  });
});

describe("F2b — previous / next along the stages", () => {
  it("Summary has no previous and goes next to S1; a plain click moves the tab", () => {
    const onStage = vi.fn();
    const { container } = view({ onStage });
    expect(container.querySelector("[data-stage-prev]")).toBeNull();
    const next = container.querySelector("[data-stage-next='split']") as HTMLAnchorElement;
    expect(next.tagName).toBe("A");
    expect(next.getAttribute("href")).toBe("#stage=split&fold=1");
    expect(next.getAttribute("title")).toContain("Stage 1 · Split");
    fireEvent.click(next);
    expect(onStage).toHaveBeenCalledWith("split");
  });

  it("a modified click is left to the browser (not handled, not prevented)", () => {
    const onStage = vi.fn();
    const { container } = view({ onStage });
    /* A bubbling listener on the document sees the event after React's root handler has had its turn. */
    let prevented: boolean | null = null;
    const watch = (event: Event) => {
      prevented = event.defaultPrevented;
      event.preventDefault(); // keep jsdom from following the hash link
    };
    document.addEventListener("click", watch);
    fireEvent.click(container.querySelector("[data-stage-next='split']") as Element, { ctrlKey: true });
    document.removeEventListener("click", watch);
    expect(onStage).not.toHaveBeenCalled();
    expect(prevented).toBe(false);
  });

  it("links keep the fold, the trial and the named window", async () => {
    const { container } = await settled({
      entry: `/research/quantbt/runs/${RUN}/evidence?window=oos`,
      cursor: { ...DEFAULT_CURSOR, stage: "search", fold: 2, trial: 7 },
    });
    expect(container.querySelector("[data-stage-prev='split']")?.getAttribute("href")).toBe("?window=oos#stage=split&fold=2&trial=7");
    expect(container.querySelector("[data-stage-next='freeze']")?.getAttribute("href")).toBe("?window=oos#stage=freeze&fold=2&trial=7");
  });

  it("Claim hands on to the run report; Atlas has no next", async () => {
    const claim = await settled({ cursor: { ...DEFAULT_CURSOR, stage: "claim" } });
    const report = claim.container.querySelector("[data-stage-next='report']") as HTMLAnchorElement;
    expect(report.getAttribute("href")).toBe(`/research/quantbt/runs/${RUN}/report#stage=claim&fold=1`);
    expect(claim.container.querySelector("[data-stage-prev='execute']")).toBeTruthy();
    claim.unmount();
    const atlas = await settled({ cursor: { ...DEFAULT_CURSOR, stage: "atlas" } });
    expect(atlas.container.querySelector("[data-stage-next]")).toBeNull();
    expect(atlas.container.querySelector("[data-stage-prev='claim']")).toBeTruthy();
  });

  it("the Claim tab's report link says 'open report' and has a tooltip", async () => {
    const { container } = await settled({ cursor: { ...DEFAULT_CURSOR, stage: "claim" } });
    const link = container.querySelector("[data-action='generate-report']") as HTMLAnchorElement;
    expect(link.textContent).toBe("open report →");
    expect(link.getAttribute("title")).toBe("Run report");
    expect(link.getAttribute("href")).toBe(`/research/quantbt/runs/${HUB_RUN}/report#stage=claim&fold=1`);
  });
});

describe("F2b — the way out of the cursor bar", () => {
  it("report and the run library are links (W4B: S1–S4 are the tab strip's and the summary cards', not repeated here)", () => {
    const { container } = view({
      entry: `/research/quantbt/runs/${RUN}/evidence?window=is`,
      cursor: { ...DEFAULT_CURSOR, fold: 2 },
    });
    const nav = container.querySelector("[data-deep-dives]") as HTMLElement;
    expect(nav.tagName).toBe("NAV");
    expect(nav.getAttribute("aria-label")).toBe("related screens");
    for (const stage of ["split", "search", "freeze", "execute"]) expect(nav.querySelector(`[data-nav-stage='${stage}']`), stage).toBeNull();
    expect(nav.querySelector("[data-nav-stage='report']")?.getAttribute("href")).toBe(`/research/quantbt/runs/${RUN}/report?window=is#stage=claim&fold=2`);
    expect(nav.querySelector("[data-nav-stage='library']")?.getAttribute("href")).toBe("/research/quantbt/runs");
    expect(nav.textContent).not.toMatch(/deep dives:/);
  });

  it("copy link carries the named window", async () => {
    const write = vi.fn(() => Promise.resolve());
    Object.assign(navigator, { clipboard: { writeText: write } });
    const { container } = view({ entry: `/research/quantbt/runs/${RUN}/evidence?window=holdout` });
    await act(async () => {
      fireEvent.click(container.querySelector("[data-action='copy-link']") as Element);
    });
    expect(write).toHaveBeenCalledTimes(1);
    expect((write.mock.calls[0] as unknown as string[])[0]).toContain("?window=holdout#stage=summary");
  });
});

describe("F2b — the stage state as a dot", () => {
  it("each stage tab with a published row carries a dot with the row's own state", () => {
    const { container } = view();
    const dots = [...container.querySelectorAll("[data-stage-tabs] [data-stage-dot]")];
    expect(dots.length).toBeGreaterThan(0);
    for (const dot of dots) {
      expect(dot.getAttribute("aria-hidden")).toBe("true");
      expect(dot.getAttribute("data-stage-dot")).toMatch(/^(pending|running|done)$/);
    }
    /* the word is still there beside it */
    expect(container.querySelector("[data-tab='split'] [data-tab-sub]")?.textContent).toMatch(/done|pending|running|not published/);
  });
});
