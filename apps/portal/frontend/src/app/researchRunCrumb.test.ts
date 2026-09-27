/**
 * D1 / audit X1 and X-1 — the shell's run-scoped breadcrumb tail.
 *
 * The shipped topbar stopped at `Research / QuantBT Backtest` on every stage
 * screen, while the hi-fi reads `… / R-WFO-118 / Stage 1 · Split`. The tail is
 * derived here so no Research screen has to be edited to put its own run in
 * the shell, and so none of them can write the run a different way.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { forgetRunLabels, rememberRunLabel } from "../research/runLabels";
import { RUN_SCREEN_CRUMBS, researchRunCrumb } from "./researchRunCrumb";

const RUN = "rrun_e1fa9e5c0f2b41d3a0c7e3b54a17d5aa";

beforeEach(() => forgetRunLabels());
afterEach(() => forgetRunLabels());

describe("the shell's Research run crumb", () => {
  it("names the run and the stage the hi-fi names", () => {
    rememberRunLabel(RUN, "R-WFO-118");
    const crumb = researchRunCrumb(`/research/quantbt/runs/${RUN}/split`);
    expect(crumb).toMatchObject({
      label: "R-WFO-118",
      runId: RUN,
      screen: "Stage 1 · Split",
      route: `/research/quantbt/runs/${RUN}/evidence`,
    });
  });

  it("falls back to the short id rather than inventing a number", () => {
    /* A cold deep link reaches the shell before any read has landed, and on a
       pre-D1 server no read ever will. The crumb then says the same thing
       every other id on the page says. */
    expect(researchRunCrumb(`/research/quantbt/runs/${RUN}/report`)).toMatchObject({
      label: "rrun_e1fa9e5c",
      screen: "Run Report",
    });
  });

  it("covers every run-scoped screen this build serves", () => {
    /* The eight canonical `runs/:runId/*` routes in QuantBTModule. A route
       added without a crumb would silently print nothing. */
    expect(Object.keys(RUN_SCREEN_CRUMBS).sort()).toEqual([
      "evidence", "execute", "freeze", "progress",
      "release-candidate", "report", "search", "split",
    ]);
    for (const segment of Object.keys(RUN_SCREEN_CRUMBS)) {
      expect(researchRunCrumb(`/research/quantbt/runs/${RUN}/${segment}`)?.screen)
        .toBe(RUN_SCREEN_CRUMBS[segment]);
    }
  });

  it("adds nothing outside a run", () => {
    for (const path of [
      "/research/quantbt/overview",
      "/research/quantbt/runs",
      "/research/quantbt/journey",
      "/research/quantbt/alphas/alpha_delta/lineage",
      "/execution/paper",
      "/",
    ]) {
      expect(researchRunCrumb(path)).toBeNull();
    }
  });

  it("does not mistake the New Run wizard for a run", () => {
    /* `runs/new` is a static segment that outranks `runs/:runId`, but the
       crumb is derived from the path alone — it has to refuse it itself, or
       the topbar would read `… / new`. */
    expect(researchRunCrumb("/research/quantbt/runs/new")).toBeNull();
  });

  it("names no screen for a run-scoped address it does not know", () => {
    /* The run is still real, so the run crumb stands; the screen half stays
       null rather than becoming a title guessed from a URL segment. */
    const crumb = researchRunCrumb(`/research/quantbt/runs/${RUN}/something-new`);
    expect(crumb?.runId).toBe(RUN);
    expect(crumb?.screen).toBeNull();
  });
});
