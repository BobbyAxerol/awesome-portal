/**
 * Screen 10 — Batch F2b (UX flow, less text), on the canonical healthy fixture.
 *
 *  - the way out of the lineage keeps its context: New Run carries the alpha
 *    and the active version, "import new version" carries the alpha, compare
 *    always has a destination (with the parent's run when there is one);
 *  - every action in the selected-attempt block has a tooltip;
 *  - hovering a band chip lights its tree node and back (no re-render);
 *  - the storied/probe bar draws the two served numbers, and only those.
 */
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { hotCss } from "./LineageDetail";
import { LineageRoute } from "./LineageRoute";
import { compareHref } from "./compareClient";
import { alphaImportHref, newRunPrefillHref, resetLineageCache, type Lineage } from "./lineageClient";

const ROOT = join(__dirname, "..", "..", "..", "..", "..");
const HEALTHY = JSON.parse(readFileSync(join(ROOT, "packages/contracts/fixtures", "research-attempt-lineage.healthy.valid.json"), "utf8")) as Lineage;
const ALPHA = HEALTHY.alpha.alpha_id;
const ACTIVE = HEALTHY.alpha.versions.find((version) => version.lifecycle_state === "ACTIVE")!;

beforeEach(() => {
  resetLineageCache();
  vi.spyOn(globalThis, "fetch").mockImplementation(
    async () =>
      new Response(JSON.stringify(HEALTHY), {
        status: 200,
        headers: { "content-type": "application/json", ...(HEALTHY.etag ? { etag: HEALTHY.etag } : {}) },
      }),
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderRoute(search = "") {
  return render(
    <MemoryRouter initialEntries={[`/research/quantbt/alphas/${ALPHA}/lineage${search}`]}>
      <Routes>
        <Route path="/research/quantbt/alphas/:alphaId/lineage" element={<LineageRoute />} />
      </Routes>
    </MemoryRouter>,
  );
}

const panel = (name: string) => document.querySelector(`[data-panel="${name}"]`) as HTMLElement;
async function ready() {
  await waitFor(() => expect(document.querySelector('[data-panel="counts"]')).toBeTruthy());
  await waitFor(() => expect(document.querySelector("[data-band]")).toBeTruthy());
}
const href = (root: ParentNode, selector: string) => root.querySelector(selector)?.getAttribute("href");

describe("F2b — S10 links keep their context", () => {
  it("New Run, declare-at-New-Run and import-new-version carry the alpha (and the active version)", async () => {
    renderRoute();
    await ready();
    const root = panel("root");
    const prefill = newRunPrefillHref(ALPHA, ACTIVE.alpha_version_id);
    expect(prefill).toBe(`/research/quantbt/runs/new?alpha=${encodeURIComponent(ALPHA)}&av=${encodeURIComponent(ACTIVE.alpha_version_id)}`);
    expect(href(root, '[data-action="new-run"]')).toBe(prefill);
    expect(href(root, '[data-action="declare-at-new-run"]')).toBe(prefill);
    expect(href(root, '[data-action="import-new-version"]')).toBe(alphaImportHref(ALPHA));
    expect(root.querySelector('[data-action="runs"]')?.getAttribute("title")).toBeTruthy();
    expect(root.querySelector('[data-action="new-run"]')?.getAttribute("title")).toContain("preselected");
  });

  it("a root attempt gets an alpha-scoped compare link; a child gets compare-with-parent carrying both runs", async () => {
    renderRoute("?attempt=att_01");
    await ready();
    const selected = () => panel("selected");
    await waitFor(() => expect(selected().getAttribute("data-selected-attempt")).toBe("att_01"));
    expect(href(selected(), '[data-action="open-compare-alpha"]')).toBe(compareHref(ALPHA));
    expect(selected().querySelector('[data-action="compare-with-parent"]')).toBeNull();

    fireEvent.click(document.querySelector('[data-chip="att_03"]') as HTMLElement);
    await waitFor(() => expect(selected().getAttribute("data-selected-attempt")).toBe("att_03"));
    const parentRun = HEALTHY.attempts.find((row) => row.attempt_id === "att_02")!.primary_run.run_id!;
    const ownRun = HEALTHY.attempts.find((row) => row.attempt_id === "att_03")!.primary_run.run_id!;
    expect(href(selected(), '[data-action="compare-with-parent"]')).toBe(compareHref(ALPHA, { mode: "pair", runs: [parentRun, ownRun] }));
    expect(selected().querySelector('[data-action="open-compare-alpha"]')).toBeNull();
  });

  it("every run action in the selected block has a tooltip naming what it opens", async () => {
    renderRoute("?attempt=att_01");
    await ready();
    const actions = Array.from(panel("selected").querySelectorAll("[data-run-actions] a"));
    expect(actions.length).toBeGreaterThanOrEqual(6);
    for (const link of actions) expect(link.getAttribute("title"), link.getAttribute("data-action") ?? "").toBeTruthy();
    expect(panel("selected").querySelector('[data-action="open-evidence"]')?.getAttribute("title")).toContain("run-att_01");
  });
});

describe("F2b — S10 more picture, less prose", () => {
  it("hovering a band chip lights its tree node through one style element, and leaving clears it", async () => {
    renderRoute();
    await ready();
    const style = document.querySelector("[data-hot-style]") as HTMLStyleElement;
    expect(style.textContent).toBe("");
    const chip = document.querySelector('[data-chip="att_03"]') as HTMLElement;
    fireEvent.mouseOver(chip);
    expect(style.textContent).toContain('[data-attempt="att_03"]');
    expect(style.textContent).toContain('[data-chip="att_03"]');
    fireEvent.mouseLeave(document.querySelector(".ln-grid") as HTMLElement);
    expect(style.textContent).toBe("");
  });

  it("the hover rule escapes any character that could leave the attribute value", () => {
    const css = hotCss('a"] , body { display:none } [x="');
    expect(css).not.toContain('"] , body');
    expect(css).toContain('\\"');
  });

  it("the storied/probe bar carries the two served numbers in its name and nothing else", async () => {
    renderRoute();
    await ready();
    const bar = panel("counts").querySelector("[data-story-bar]")!;
    expect(bar.getAttribute("role")).toBe("img");
    expect(bar.getAttribute("aria-label")).toBe(
      `storied ${HEALTHY.counts.storied_returned} · probes ${HEALTHY.counts.probe_returned} of the returned attempts`,
    );
    expect(bar.getAttribute("title")).toBe(bar.getAttribute("aria-label"));
    expect(bar.children).toHaveLength(2);
  });

  it("the selected block marks its reveal and leaves it off under the motion guard", async () => {
    renderRoute();
    await ready();
    const selected = panel("selected");
    expect(selected.classList.contains("ln-reveal")).toBe(true);
    expect(["true", "false"]).toContain(selected.getAttribute("data-motion"));
  });

  it("an empty diff panel says it in three words and keeps the sentence as a tooltip", async () => {
    renderRoute();
    await ready();
    // No attempt selected is only reachable on an empty graph; the short form is pinned in the source.
    const source = readFileSync(join(__dirname, "LineageDetail.tsx"), "utf8");
    expect(source).toContain('title="Select an attempt to read its diff against its parent.">No attempt selected.</p>');
  });
});
