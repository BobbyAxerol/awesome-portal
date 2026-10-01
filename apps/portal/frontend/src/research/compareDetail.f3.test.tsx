/**
 * Batch F3 (S13) — HiFi parity: fold axis, percentage points, crumb, link text, no raw tokens, a diff that says it scrolls.
 */
import { cleanup, render, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ppDelta } from "./CompareDetail";
import { CompareRoute } from "./CompareRoute";
import type { Compare } from "./compareClient";
import { forgetRunLabels } from "./runLabels";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  forgetRunLabels();
});

const FIXTURES = join(process.cwd(), "..", "..", "..", "packages", "contracts", "fixtures");
const fixture = (name: string): Compare => JSON.parse(readFileSync(join(FIXTURES, name), "utf8")) as Compare;
const base = "/research/quantbt/alphas/delta-rsi-polynomial-alpha/compare";

function server(body: unknown) {
  vi.spyOn(globalThis, "fetch").mockImplementation(
    async () => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }),
  );
}
function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/research/quantbt/alphas/:alphaId/compare" element={<CompareRoute />} />
      </Routes>
    </MemoryRouter>,
  );
}
const page = () => document.querySelector('[data-screen="compare"]') as HTMLElement;
const settled = () => waitFor(() => expect(page().getAttribute("aria-busy")).toBe("false"));

describe("F3 S13 — HiFi parity", () => {
  it("13-11: a difference of two fractions is percentage points", () => {
    expect(ppDelta("-0.0316")).toBe("−3.16 pp");
    expect(ppDelta("0.0012")).toContain(" pp");
    expect(ppDelta("0.0012")).not.toContain("%");
  });

  it("13-11: the common-window return and drawdown deltas print pp, the side values stay %", async () => {
    server(fixture("research-compare.pair-ok.valid.json"));
    renderAt(`${base}?mode=pair&runs=run_a,run_b`);
    await settled();
    for (const id of ["NET_RETURN_FRACTION", "MAX_DRAWDOWN_FRACTION"]) {
      const text = document.querySelector(`[data-delta-row="${id}"] [data-delta-value]`)?.textContent ?? "";
      expect(text).toMatch(/ pp$/);
    }
    expect(document.querySelector('[data-delta-row="NET_RETURN_FRACTION"] td:nth-child(2)')?.textContent).toMatch(/%$/);
  });

  it("13-11: the window definition and the missing policy are tooltips, their words are on screen", async () => {
    server(fixture("research-compare.pair-ok.valid.json"));
    renderAt(`${base}?mode=pair&runs=run_a,run_b`);
    await settled();
    const foot = document.querySelector("[data-common-window]")!;
    expect(foot.textContent).not.toMatch(/research\.compare-common-window/);
    expect(foot.textContent).toMatch(/^common window · matched/);
    const meta = document.querySelector("[data-correlation-meta]")!;
    expect(meta.textContent).not.toMatch(/INNER_JOIN|NO_FORWARD_FILL/);
    expect(meta.textContent).toContain("overlapping window only");
    expect(meta.querySelector("[title]")?.getAttribute("title")).toBe("INNER_JOIN_EXACT_TIMESTAMP_NO_FORWARD_FILL");
  });

  it("13-04 / 13-01: the crumb is Compare (the alpha is a tooltip) and the release-candidate link reads RC, not rc_", async () => {
    server(fixture("research-compare.attempts.valid.json"));
    renderAt(`${base}?mode=attempts`);
    await settled();
    const crumb = document.querySelector(".cp-crumb .here")!;
    expect(crumb.textContent).toBe("Compare");
    expect(crumb.getAttribute("title")).toBeTruthy();
    const rc = document.querySelector("[data-rc-link]")!;
    expect(rc.textContent).toBe("RC");
    expect(rc.getAttribute("aria-label")).toMatch(/^Release candidate of /);
  });

  it("13-06: the fold axis reads fold_01 from the served fold_id and draws no extra 0 tick", async () => {
    server(fixture("research-compare.attempts.valid.json"));
    renderAt(`${base}?mode=attempts`);
    await settled();
    const groups = [...document.querySelectorAll("[data-fold-group]")];
    expect(groups.length).toBeGreaterThan(0);
    expect(groups[0]!.textContent).toBe("fold_01");
    const ticks = [...document.querySelectorAll('[data-panel="fold-chart"] .cp-lbl.y')].map((el) => el.textContent);
    expect(ticks).not.toContain("0");
  });

  it("8_sweep S13: a config diff wider than four attempts says how many columns scroll sideways; a narrow one says nothing", async () => {
    const wide: any = fixture("research-compare.attempts.valid.json");
    const extra = wide.result.attempts.flatMap((run: any, index: number) =>
      [1, 2].map((n) => ({ ...structuredClone(run), run_id: `${run.run_id}_x${n}${index}`, attempt_id: `${run.attempt_id}_x${n}${index}` })),
    );
    wide.result.attempts = [...wide.result.attempts, ...extra];
    for (const path of wide.result.config_diff.paths) {
      path.values = [...path.values, ...extra.map((run: any) => ({ run_id: run.run_id, value: "x" }))];
    }
    server(wide);
    renderAt(`${base}?mode=attempts`);
    await settled();
    const chip = document.querySelector("[data-config-diff-columns]")!;
    expect(chip.getAttribute("data-config-diff-columns")).toBe(String(document.querySelectorAll(".cp-difftable thead th").length - 1));
    expect(chip.textContent).toMatch(/\d+ attempts/);
    cleanup();
    server(fixture("research-compare.attempts.valid.json"));
    renderAt(`${base}?mode=attempts`);
    await settled();
    expect(document.querySelector("[data-config-diff-columns]")).toBeNull();
  });
});
