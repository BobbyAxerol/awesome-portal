/**
 * The drawdown pane of a chart from the DRAWDOWN series read of the SAME subject, window and environment (WP-F1 wiring of WP-K's metric).
 * A published series is drawn (`chartPointsOf` moves a FRACTION to percent in the string); anything else keeps the typed pane with its reason.
 * Nothing is derived from the line above: a drawdown is never worked out here.
 */
import type { DrawdownInput } from "../../charts";
import { ticketFree } from "../../ticketText";
import { chartPointsOf, unavailableChart } from "./seriesModel";
import type { SeriesReadState } from "./useManagerSeries";
import { notPublishedText } from "../../blocks";

export const DRAWDOWN_NOT_ASKED: DrawdownInput = {
  kind: "absent",
  copy: notPublishedText("FE-013, FE-025", "NAV and drawdown"),
  reason: "The series port does not serve this subject, so no drawdown series is asked for; a drawdown is never worked out from the line above.",
};

/** The pane copy never carries a ticket code in its words (QA3 R1-10); the typed reason stays. */
export function drawdownInputOf(read: SeriesReadState | undefined): DrawdownInput {
  const input = drawdownInputRaw(read);
  return input.kind === "absent" ? { ...input, copy: ticketFree(input.copy) } : input;
}

function drawdownInputRaw(read: SeriesReadState | undefined): DrawdownInput {
  if (read === undefined || read.phase === "idle") return DRAWDOWN_NOT_ASKED;
  const series = read.phase === "ready" ? read.value : read.phase === "loading" || read.phase === "error" ? read.last : null;
  if (series === null) {
    return read.phase === "error"
      ? { kind: "absent", copy: "Not available", reason: `The drawdown series could not be read (${read.reason}). Nothing is drawn.` }
      : { kind: "absent", copy: "Loading the drawdown" };
  }
  const entry = series.series[0];
  if (entry === undefined) return DRAWDOWN_NOT_ASKED;
  if (entry.state === "UNAVAILABLE") {
    const { copy, reason } = unavailableChart(entry, "FE-025");
    return { kind: "absent", copy, reason };
  }
  if (entry.state === "EMPTY") return { kind: "absent", copy: "No points in this window", reason: "The source published a drawdown series with no point in the window." };
  return { kind: "series", points: chartPointsOf(entry) };
}
