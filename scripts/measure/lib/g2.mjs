/**
 * P184 performance G2, original gate only (ELP2-10 source-alignment.md: per-feed p95 <= 500 ms; trade max < 1,500 ms;
 * quote / mark max < 1,000 ms, for the exact per-feed / venue population). This is NOT a new Portal SLO and not a Portal API
 * latency: Edge owns the apparatus and the population, this module only applies the original thresholds to what Edge supplies,
 * AFTER the input has been bound to the selected run, window and population (Codex review 2026-10-21, MEASURE-2).
 *
 * Input contract (`portal.elp2-10.g2-population-input.v1`, PROPOSED: Edge confirms or supplies an adapter):
 *   { schema_version, apparatus_ref, gate_revision, edge_sha, started_at_ms, ended_at_ms,
 *     population: [{ feed_id, venue, kind: "trade" | "quote" | "mark", samples, p95_ms, max_ms }] }
 *
 * Edge census contract (`portal.elp2-10.g2-edge-census.v1`, PROPOSED, supplied by the caller from Edge, pinned by sha256; Portal never
 * invents the feed list, the producer mapping or the pins):
 *   { schema_version, window_id, apparatus_ref, gate_revision, edge_sha, population: [{ feed_id, venue, kind }] }
 *
 * Binding (all of it is checked BEFORE a single threshold is compared; any failure throws G2Refused, message `REFUSED:<CODE>...`):
 *   - apparatus_ref, gate_revision and edge_sha (the source pin) are present in the input and equal the census' (and the census names the
 *     selected window);
 *   - started_at_ms < ended_at_ms, both integers, the run lies inside [window.starts_at_ms, window.ends_at_ms] and has ended by now;
 *   - the input population is EXACTLY the census population: unique (venue, feed_id, kind) identities, none missing, none extra, none repeated;
 *   - per row: integer samples >= 1, finite p95_ms / max_ms >= 0, and p95_ms <= max_ms (a percentile cannot exceed the maximum).
 * G2 stays a separate receipt: it is never merged with the optional mainnet canary or with the B0 / B1 / B2 coexistence receipt.
 */
export const G2_INPUT_SCHEMA = "portal.elp2-10.g2-population-input.v1";
export const G2_CENSUS_SCHEMA = "portal.elp2-10.g2-edge-census.v1";
export const G2_GATE = Object.freeze({ per_feed_p95_ms_max: 500, trade_max_ms_below: 1500, quote_mark_max_ms_below: 1000 });
const KINDS = ["trade", "quote", "mark"];

export class G2Refused extends Error {
  constructor(code, detail = "") { super(`REFUSED:${code}${detail ? `:${detail}` : ""}`); this.name = "G2Refused"; this.code = code; }
}

const nonEmpty = (v) => typeof v === "string" && v.trim().length > 0;
const idOf = (r) => JSON.stringify([r.venue, r.feed_id, r.kind]);
const label = (r) => `${r.venue}/${r.feed_id}/${r.kind}`;

/** Validates one identity list (census or input) and returns its unique keys; duplicates are refused, never merged. */
function identities(rows, what) {
  if (!Array.isArray(rows) || rows.length === 0) throw new G2Refused(`${what}_EMPTY`);
  const seen = new Map();
  for (const r of rows) {
    if (r === null || typeof r !== "object") throw new G2Refused(`${what}_ROW`);
    for (const k of ["feed_id", "venue", "kind"]) if (!nonEmpty(r[k])) throw new G2Refused(`${what}_ROW_FIELD`, k);
    if (!KINDS.includes(r.kind)) throw new G2Refused(`${what}_ROW_KIND`, r.kind);
    const key = idOf(r);
    if (seen.has(key)) throw new G2Refused(`${what}_DUPLICATE`, label(r));
    seen.set(key, r);
  }
  return seen;
}

/** Parses the Edge census the caller supplied. `windowId` is the id of the authorised window the run is bound to. */
export function parseEdgeCensus(census, { windowId }) {
  if (census?.schema_version !== G2_CENSUS_SCHEMA) throw new G2Refused("CENSUS_SCHEMA");
  for (const k of ["window_id", "apparatus_ref", "gate_revision", "edge_sha"]) if (!nonEmpty(census[k])) throw new G2Refused("CENSUS_PIN_MISSING", k);
  if (!nonEmpty(windowId) || census.window_id !== windowId) throw new G2Refused("CENSUS_WINDOW_MISMATCH", `${census.window_id}!=${windowId}`);
  identities(census.population, "CENSUS");
  return { window_id: census.window_id, apparatus_ref: census.apparatus_ref, gate_revision: census.gate_revision, edge_sha: census.edge_sha,
    expected_population: census.population.map(({ feed_id, venue, kind }) => ({ feed_id, venue, kind })) };
}

/**
 * @param input    the population Edge's apparatus returned
 * @param binding  { apparatus_ref, gate_revision, edge_sha, window: { starts_at_ms, ends_at_ms }, expected_population: [{feed_id, venue, kind}], now_ms }
 *                 apparatus_ref / gate_revision / edge_sha / expected_population come from the Edge census (parseEdgeCensus), the window from
 *                 the authorisation record, now_ms from the caller's clock.
 */
export function evaluateG2(input, binding) {
  if (input?.schema_version !== G2_INPUT_SCHEMA) throw new G2Refused("G2_INPUT_SCHEMA");
  if (binding === null || typeof binding !== "object") throw new G2Refused("G2_BINDING_REQUIRED");
  for (const k of ["apparatus_ref", "gate_revision", "edge_sha"]) {
    if (!nonEmpty(binding[k])) throw new G2Refused("G2_BINDING_PIN_MISSING", k);
    if (!nonEmpty(input[k])) throw new G2Refused("G2_INPUT_PIN_MISSING", k);
    if (input[k] !== binding[k]) throw new G2Refused("G2_PIN_MISMATCH", k);
  }
  const win = binding.window;
  if (!Number.isSafeInteger(win?.starts_at_ms) || !Number.isSafeInteger(win?.ends_at_ms) || win.starts_at_ms >= win.ends_at_ms) throw new G2Refused("G2_BINDING_WINDOW");
  if (!Number.isFinite(binding.now_ms)) throw new G2Refused("G2_BINDING_CLOCK");
  if (!Number.isSafeInteger(input.started_at_ms) || !Number.isSafeInteger(input.ended_at_ms)) throw new G2Refused("G2_RUN_TIME_INVALID");
  if (input.started_at_ms >= input.ended_at_ms) throw new G2Refused("G2_RUN_TIME_ORDER");
  if (input.started_at_ms < win.starts_at_ms || input.ended_at_ms > win.ends_at_ms) throw new G2Refused("G2_RUN_OUTSIDE_WINDOW");
  if (input.ended_at_ms > binding.now_ms) throw new G2Refused("G2_RUN_ENDS_IN_THE_FUTURE");

  const expected = identities(binding.expected_population, "EXPECTED_POPULATION");
  const got = identities(input.population, "G2_POPULATION");
  const missing = [...expected.keys()].filter((k) => !got.has(k)), extra = [...got.keys()].filter((k) => !expected.has(k));
  if (missing.length) throw new G2Refused("G2_POPULATION_MISSING", missing.map((k) => label(expected.get(k))).join(","));
  if (extra.length) throw new G2Refused("G2_POPULATION_UNEXPECTED", extra.map((k) => label(got.get(k))).join(","));

  const rows = input.population.map((r) => {
    if (!Number.isSafeInteger(r.samples) || r.samples < 1) throw new G2Refused("G2_ROW_SAMPLES", `${label(r)}:${r.samples}`);
    for (const k of ["p95_ms", "max_ms"]) if (!Number.isFinite(r[k]) || r[k] < 0) throw new G2Refused("G2_ROW_NUMBER", `${label(r)}:${k}`);
    if (r.p95_ms > r.max_ms) throw new G2Refused("G2_ROW_P95_ABOVE_MAX", `${label(r)}:${r.p95_ms}>${r.max_ms}`);
    // The original P184 comparisons, unchanged.
    const p95Ok = r.p95_ms <= G2_GATE.per_feed_p95_ms_max;
    const maxOk = r.kind === "trade" ? r.max_ms < G2_GATE.trade_max_ms_below : r.max_ms < G2_GATE.quote_mark_max_ms_below;
    return { feed_id: r.feed_id, venue: r.venue, kind: r.kind, samples: r.samples, p95_ms: r.p95_ms, max_ms: r.max_ms, p95_ok: p95Ok, max_ok: maxOk, ok: p95Ok && maxOk };
  });
  const failing = rows.filter((r) => !r.ok);
  return {
    gate: G2_GATE, rows, population_size: rows.length, failing: failing.map(label),
    binding: { apparatus_ref: binding.apparatus_ref, gate_revision: binding.gate_revision, edge_sha: binding.edge_sha, window: { starts_at_ms: win.starts_at_ms, ends_at_ms: win.ends_at_ms },
      run: { started_at_ms: input.started_at_ms, ended_at_ms: input.ended_at_ms }, expected_population_size: expected.size },
    original_gate_result: failing.length === 0 ? "ORIGINAL_GATE_MET_FOR_SUPPLIED_POPULATION" : "ORIGINAL_GATE_NOT_MET",
  };
}
