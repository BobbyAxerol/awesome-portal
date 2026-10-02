import { describe, expect, it } from "vitest";

import { DEFAULT_CURSOR, type EvidenceCursor } from "./evidenceCursor";
import {
  exitHref,
  executeHref,
  freezeHref,
  hubHref,
  libraryHref,
  lineageRunHref,
  newRunHref,
  overviewHref,
  progressHref,
  rcHref,
  reportHref,
  runPath,
  searchHref,
  splitHref,
} from "./runLinks";
import { packFromHash } from "./releaseCandidateClient";

const RUN = "rrun_3d5633d2adb712722fe4ba108102aa5d";
const CURSOR: EvidenceCursor = { ...DEFAULT_CURSOR, stage: "execute", fold: 4, trial: 351, params: "abc", route: "signal_notional", seq: 7 };
const ROOT = `/research/quantbt/runs/${RUN}`;

describe("runLinks (W1 §1.4)", () => {
  it("a link with no cursor carries none (never fold=1)", () => {
    expect(hubHref(RUN)).toBe(`${ROOT}/evidence`);
    expect(reportHref(RUN)).toBe(`${ROOT}/report`);
    expect(rcHref(RUN)).toBe(`${ROOT}/release-candidate`);
    expect(progressHref(RUN)).toBe(`${ROOT}/progress`);
    expect(executeHref(RUN, { cursor: null })).toBe(`${ROOT}/execute`);
    expect(hubHref(RUN, { stage: "claim" })).not.toContain("fold");
  });

  it("report and RC force stage=claim and carry every cursor field plus ?window=", () => {
    for (const href of [reportHref(RUN, { cursor: CURSOR, window: "is" }), rcHref(RUN, { cursor: CURSOR, window: "is" })]) {
      expect(href).toContain("?window=is#");
      expect(href).toContain("stage=claim");
      expect(href).not.toContain("stage=execute");
      for (const part of ["fold=4", "trial=351", "params=abc", "route=signal_notional", "seq=7"]) expect(href).toContain(part);
    }
  });

  it("stage-fixed destinations overwrite a stale stage; the hub keeps the cursor's own unless told", () => {
    expect(executeHref(RUN, { cursor: CURSOR })).toContain("stage=execute");
    expect(splitHref(RUN, { cursor: CURSOR })).toContain("stage=split");
    expect(searchHref(RUN, { cursor: CURSOR })).toContain("stage=search");
    expect(freezeHref(RUN, { cursor: CURSOR })).toContain("stage=freeze");
    expect(hubHref(RUN, { cursor: CURSOR })).toContain("stage=execute");
    expect(hubHref(RUN, { cursor: CURSOR, stage: "claim" })).toContain("stage=claim");
    expect(hubHref(RUN, { cursor: CURSOR })).toContain("fold=4");
  });

  it("carried keys (study/pick/trade/mode) ride along", () => {
    const href = reportHref(RUN, { cursor: { ...CURSOR, carried: { study: "study_2", pick: "p1" } } });
    expect(href).toContain("study=study_2");
    expect(href).toContain("pick=p1");
  });

  it("rcHref never writes pack=, so packFromHash is unaffected", () => {
    const hash = rcHref(RUN, { cursor: CURSOR }).split("#")[1];
    expect(hash).not.toMatch(/(?:^|&)pack=/);
    expect(packFromHash(`#${hash}`)).toBeNull();
  });

  it("run-less destinations", () => {
    expect(libraryHref()).toBe("/research/quantbt/runs");
    expect(newRunHref(RUN)).toBe(`/research/quantbt/runs/new?from=${RUN}`);
    expect(overviewHref(RUN)).toBe(`${ROOT}/overview`);
    expect(runPath(RUN, "")).toBe(ROOT);
  });

  it("lineage adds run only where a run id is in hand", () => {
    expect(lineageRunHref("alpha_1", { av: "av_1" })).toBe("/research/quantbt/alphas/alpha_1/lineage?av=av_1");
    expect(lineageRunHref("alpha_1", { av: "av_1", run: RUN })).toBe(`/research/quantbt/alphas/alpha_1/lineage?av=av_1&run=${RUN}`);
    expect(lineageRunHref("alpha_1", { probes: true })).toContain("probes=1");
    expect(lineageRunHref("alpha_1")).toBe("/research/quantbt/alphas/alpha_1/lineage");
  });

  it("exitHref sends only hub and report the cursor", () => {
    expect(exitHref("hub", RUN, { cursor: CURSOR })).toContain("fold=4");
    expect(exitHref("report", RUN, { cursor: CURSOR })).toContain("stage=claim");
    expect(exitHref("progress", RUN, { cursor: CURSOR })).toBe(`${ROOT}/progress`);
    expect(exitHref("library", RUN, { cursor: CURSOR })).toBe("/research/quantbt/runs");
    expect(exitHref("new-run", RUN)).toContain("from=");
  });
});
