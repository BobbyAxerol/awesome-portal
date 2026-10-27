/**
 * The drawdown pane of a chart (WP-F1 wiring of WP-K's DRAWDOWN metric): a published series is drawn in percent from the server's strings;
 * every other state keeps the typed pane with its reason. Nothing is derived from another line.
 */
import { describe, expect, it } from "vitest";

import { readManagerSeries } from "../../readers/managerSeries";
import { seriesBodyFor } from "./seriesDouble.testbase";
import { DRAWDOWN_NOT_ASKED, drawdownInputOf } from "./drawdownInput";
import type { SeriesReadState } from "./useManagerSeries";

const body = (variant: "populated" | "empty" | "unavailable") => {
  const params = new URLSearchParams({ environment: "paper", metric: "DRAWDOWN", window: "\"30D\"", subjects: JSON.stringify([{ subject_type: "PORTFOLIO", subject_id: "pf_1" }]) });
  const read = readManagerSeries(seriesBodyFor(params, variant));
  if (read === null || read.kind !== "series") throw new Error("the DRAWDOWN double is not a series the reader accepts");
  return read.series;
};
const ready = (variant: "populated" | "empty" | "unavailable"): SeriesReadState => ({ phase: "ready", value: body(variant), warnings: [] });

describe("drawdownInputOf", () => {
  it("not asked (undefined or idle) keeps the typed pane and names the request ids", () => {
    expect(drawdownInputOf(undefined)).toEqual({ ...DRAWDOWN_NOT_ASKED, copy: "Not published" });
    expect(drawdownInputOf({ phase: "idle" })).toEqual({ ...DRAWDOWN_NOT_ASKED, copy: "Not published" });
    expect(DRAWDOWN_NOT_ASKED).toMatchObject({ kind: "absent", copy: "Not published (FE-013, FE-025)" });
  });

  it("a published series is drawn, as the server's points moved to percent (FRACTION), a true zero first", () => {
    const input = drawdownInputOf(ready("populated"));
    expect(input.kind).toBe("series");
    if (input.kind !== "series") return;
    expect(input.points[0]!.v).toBe("0");
    expect(input.points.filter((p) => p.v !== null).every((p) => p.v === "0" || String(p.v).startsWith("-"))).toBe(true);
    expect(input.points[1]!.v).toBe("-2");
  });

  it("UNAVAILABLE keeps the typed pane with the typed reason, EMPTY says no points, a failed read says not available, loading says loading", () => {
    const unavailable = drawdownInputOf(ready("unavailable"));
    expect(unavailable).toMatchObject({ kind: "absent" });
    expect(unavailable.kind === "absent" && unavailable.reason).toContain("SERIES_SOURCE_NOT_PUBLISHED");
    expect(drawdownInputOf(ready("empty"))).toMatchObject({ kind: "absent", copy: "No points in this window" });
    expect(drawdownInputOf({ phase: "error", status: "unavailable", reason: "HTTP 503", last: null })).toMatchObject({ kind: "absent", copy: "Not available" });
    expect(drawdownInputOf({ phase: "loading", last: null })).toMatchObject({ kind: "absent", copy: "Loading the drawdown" });
  });

  it("a failed refresh keeps the last good series", () => {
    const last = body("populated");
    expect(drawdownInputOf({ phase: "error", status: "unavailable", reason: "HTTP 503", last }).kind).toBe("series");
  });
});
