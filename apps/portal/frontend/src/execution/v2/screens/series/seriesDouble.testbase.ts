/**
 * A BFF double for `GET /api/v1/execution/manager/series` (tests only; lane BFF_DOUBLE: it answers from the PUBLISHED contract
 * fixtures, rewriting only the subject ids, the metric, the environment and the window to match the request, so the reader's
 * `seriesAnswersQuery` guard is exercised for real). A fixture is not a source acceptance.
 *
 * `wrapFetch(inner, state)` answers the series route and hands every other route to `inner` (the screen harness' double).
 */
import {
  clone,
  fixtureValue,
  FIXTURE_EMPTY,
  FIXTURE_MIXED,
  FIXTURE_POPULATED,
  FIXTURE_UNAVAILABLE,
  unavailableEntry,
  withComparison,
  type Draft,
} from "../../readers/managerSeries.testbase";

export type SeriesVariant = "populated" | "empty" | "unavailable" | "mixed" | "status:400" | "status:404" | "status:503" | "garbage";

export interface SeriesDoubleState {
  variant: SeriesVariant;
  /** Every series request, as the parsed query. */
  calls: { environment: string | null; metric: string | null; subjects: unknown; window: unknown; partition: unknown }[];
}

export const newSeriesDouble = (variant: SeriesVariant = "unavailable"): SeriesDoubleState => ({ variant, calls: [] });

/** The body for a request, built from the fixtures. */
export function seriesBodyFor(params: URLSearchParams, variant: SeriesVariant): Draft {
  const subjects = JSON.parse(params.get("subjects") ?? "[]") as { subject_type: string; subject_id?: string }[];
  const metric = params.get("metric") ?? "NAV";
  const window = JSON.parse(params.get("window") ?? "\"30D\"") as unknown;
  const source = variant === "unavailable" ? FIXTURE_UNAVAILABLE : variant === "empty" ? FIXTURE_EMPTY : variant === "mixed" ? FIXTURE_MIXED : FIXTURE_POPULATED;
  const body: Draft = fixtureValue(source);
  body.environment = params.get("environment") ?? body.environment;
  body.workspace_id = params.get("workspace_id") ?? body.workspace_id;
  body.metric = metric;
  body.selected_window = { ...body.selected_window, requested: window };
  const published = body.series as Draft[];
  const all = window === "ALL";
  if (all) body.selected_window = { requested: "ALL", resolved: null, selection_basis: "EXACT_PUBLISHED_METRIC_WINDOW_ONLY", reason_code: "ALL_HISTORY_WINDOW_NOT_PUBLISHED" };
  body.series = subjects.map((subject, index) => {
    const id = { subject_type: subject.subject_type, subject_id: subject.subject_type === "FUND" ? body.workspace_id : (subject.subject_id as string) };
    // ALL is a typed gap: whatever the source holds, no series is served for it.
    if (all) return unavailableEntry(id, "ALL_HISTORY_WINDOW_NOT_PUBLISHED");
    if (variant === "unavailable") return unavailableEntry(id);
    const entry = clone(published[index % published.length]!);
    entry.subject = id;
    // A pair of populated series shares the fixture's points; a third and fourth subject cycle through them.
    // A RETURN is a RATIO whose source states its scale (FE-013); the double states FRACTION, the published return fixture's.
    if (metric === "RETURN") { entry.unit = "RATIO"; entry.currency = null; entry.ratio_scale = "FRACTION"; }
    // A DRAWDOWN is a RATIO at or below zero (WP-K, MS-S11): the first point is a true zero, the rest a fraction below it.
    if (metric === "DRAWDOWN") {
      entry.unit = "RATIO"; entry.currency = null; entry.ratio_scale = "FRACTION";
      entry.points = (entry.points as Draft[]).map((point, i) => ({ ...point, value: i === 0 ? "0" : `-0.0${(i % 9) + 1}`, ...(point.exact !== undefined ? { exact: i === 0 ? "0" : `-0.0${(i % 9) + 1}` } : {}) }));
    }
    return entry;
  });
  body.series_source = variant === "unavailable" ? body.series_source : { state: "PUBLISHED", reason_code: null };
  return withComparison(body);
}

export function wrapFetch(inner: typeof fetch, state: SeriesDoubleState): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://portal.test");
    if (!url.pathname.endsWith("/manager/series")) return inner(input, init);
    state.calls.push({
      environment: url.searchParams.get("environment"),
      metric: url.searchParams.get("metric"),
      subjects: JSON.parse(url.searchParams.get("subjects") ?? "null"),
      window: JSON.parse(url.searchParams.get("window") ?? "null"),
      partition: url.searchParams.has("economic_partition") ? JSON.parse(url.searchParams.get("economic_partition")!) : null,
    });
    const json = (status: number, body: unknown) => new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    if (state.variant.startsWith("status:")) return json(Number(state.variant.slice(7)), { error: { code: "REFUSED", message: "refused" } });
    if (state.variant === "garbage") return json(200, "<html>nope</html>");
    return json(200, seriesBodyFor(url.searchParams, state.variant));
  }) as typeof fetch;
}
