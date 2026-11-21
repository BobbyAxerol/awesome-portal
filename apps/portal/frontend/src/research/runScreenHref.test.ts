import { describe, expect, it } from "vitest";

import { DEFAULT_CURSOR, parseCursor as parseHash, type EvidenceCursor } from "./evidenceCursor";
import { runScreenHref, runScreenPath, type RunScreen } from "./runScreenHref";

const RUN = "rrun_abc";
const ROOT = `/research/quantbt/runs/${RUN}`;
const FULL: EvidenceCursor = {
  ...DEFAULT_CURSOR,
  stage: "search",
  fold: 4,
  trial: 351,
  params: "abc",
  schedule: "global",
  route: "signal_notional",
  seq: 7,
  window: "is",
  carried: { study: "study_2" },
};

const parseCursor = (href: string) => parseHash(href.split("#")[1] ?? "");
const keysOf = (href: string) => [...new URLSearchParams(href.split("#")[1] ?? "").keys()].sort();

describe("runScreenHref (W5 §3.1-3.2): one builder, keys by destination", () => {
  it.each<[RunScreen, string, string[]]>([
    ["hub", "evidence", ["fold", "params", "route", "schedule", "stage", "study", "trial", "window"]],
    ["split", "split", ["fold", "params", "route", "schedule", "stage", "study", "trial", "window"]],
    ["search", "search", ["fold", "params", "route", "schedule", "stage", "study", "trial", "window"]],
    ["freeze", "freeze", ["fold", "params", "route", "schedule", "stage", "study", "trial", "window"]],
    ["execute", "execute", ["fold", "params", "route", "schedule", "seq", "stage", "study", "trial", "window"]],
    ["report", "report", ["fold", "params", "stage", "trial", "window"]],
    ["release-candidate", "release-candidate", ["fold", "params", "stage", "trial", "window"]],
    ["progress", "progress", ["fold"]],
  ])("%s -> /%s carries exactly its keys; the window is in the hash, never the query", (screen, tail, keys) => {
    const href = runScreenHref(RUN, screen, FULL);
    expect(href.startsWith(`${ROOT}/${tail}`)).toBe(true);
    expect(href).not.toContain("?");
    expect(keysOf(href)).toEqual(keys);
  });

  it("the destination fixes its own stage; the hub keeps the cursor's unless over names one", () => {
    expect(parseCursor(runScreenHref(RUN, "split", FULL)).stage).toBe("split");
    expect(parseCursor(runScreenHref(RUN, "execute", FULL)).stage).toBe("execute");
    expect(parseCursor(runScreenHref(RUN, "report", FULL)).stage).toBe("claim");
    expect(parseCursor(runScreenHref(RUN, "release-candidate", FULL)).stage).toBe("claim");
    expect(parseCursor(runScreenHref(RUN, "hub", FULL)).stage).toBe("search");
    expect(parseCursor(runScreenHref(RUN, "hub", FULL, { stage: "claim" })).stage).toBe("claim");
  });

  it("seq goes only to S08 and to the hub's execute tab", () => {
    expect(runScreenHref(RUN, "hub", FULL)).not.toContain("seq=");
    expect(runScreenHref(RUN, "hub", { ...FULL, stage: "execute" })).toContain("seq=7");
    expect(runScreenHref(RUN, "hub", FULL, { stage: "execute" })).toContain("seq=7");
    for (const screen of ["split", "search", "freeze", "report", "release-candidate", "progress"] as const) {
      expect(runScreenHref(RUN, screen, FULL), screen).not.toContain("seq=");
    }
    expect(runScreenHref(RUN, "execute", FULL)).toContain("seq=7");
  });

  it("over wins over the cursor (a per-fold row), and the window is written only when named", () => {
    const href = runScreenHref(RUN, "search", { ...FULL, window: null }, { fold: 9 });
    expect(parseCursor(href).fold).toBe(9);
    expect(href).not.toContain("window=");
    expect(parseCursor(runScreenHref(RUN, "split", { ...FULL, window: null }, { window: "holdout" })).window).toBe("holdout");
  });

  it("round trip: what the hash carries, parseCursor reads back", () => {
    const back = parseCursor(runScreenHref(RUN, "hub", FULL));
    expect(back).toMatchObject({ stage: "search", fold: 4, trial: 351, params: "abc", schedule: "global", route: "signal_notional", window: "is" });
    expect(back.carried).toEqual({ study: "study_2" });
  });

  it("no cursor in hand carries none: bare path, never fold=1", () => {
    for (const screen of ["hub", "split", "search", "freeze", "execute", "report", "release-candidate", "progress"] as const) {
      expect(runScreenHref(RUN, screen, null), screen).not.toContain("#");
    }
    expect(runScreenHref(RUN, "hub", null, { window: "is" })).toBe(`${ROOT}/evidence#window=is`);
    expect(runScreenHref(RUN, "report", null, { fold: 3 })).toBe(`${ROOT}/report#stage=claim&fold=3`);
  });

  it("the run id is encoded and the path table is exported", () => {
    expect(runScreenPath("a b", "hub")).toBe("/research/quantbt/runs/a%20b/evidence");
    expect(runScreenPath(RUN, "")).toBe(ROOT);
  });
});
