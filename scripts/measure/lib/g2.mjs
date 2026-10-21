/**
 * P184 performance G2, original gate only (ELP2-10 source-alignment.md: per-feed p95 <= 500 ms; trade max < 1,500 ms;
 * quote / mark max < 1,000 ms, for the exact per-feed / venue population). This is NOT a new Portal SLO and not a Portal API
 * latency: Edge owns the apparatus and the population, this module only applies the original thresholds to what Edge supplies.
 *
 * Input contract (`portal.elp2-10.g2-population-input.v1`, PROPOSED: Edge confirms or supplies an adapter):
 *   { schema_version, apparatus_ref, gate_revision, edge_sha, started_at_ms, ended_at_ms,
 *     population: [{ feed_id, venue, kind: "trade" | "quote" | "mark", samples, p95_ms, max_ms }] }
 */
export const G2_INPUT_SCHEMA = "portal.elp2-10.g2-population-input.v1";
export const G2_GATE = Object.freeze({ per_feed_p95_ms_max: 500, trade_max_ms_below: 1500, quote_mark_max_ms_below: 1000 });

export function evaluateG2(input) {
  if (input?.schema_version !== G2_INPUT_SCHEMA) throw new Error("G2_INPUT_SCHEMA");
  if (!Array.isArray(input.population) || input.population.length === 0) throw new Error("G2_POPULATION_EMPTY");
  const rows = input.population.map((r) => {
    for (const k of ["feed_id", "venue", "kind"]) if (typeof r[k] !== "string" || !r[k]) throw new Error(`G2_ROW_FIELD:${k}`);
    if (!["trade", "quote", "mark"].includes(r.kind)) throw new Error(`G2_ROW_KIND:${r.kind}`);
    for (const k of ["samples", "p95_ms", "max_ms"]) if (!Number.isFinite(r[k]) || r[k] < 0) throw new Error(`G2_ROW_NUMBER:${k}`);
    if (r.samples < 1) throw new Error("G2_ROW_NO_SAMPLES");
    const p95Ok = r.p95_ms <= G2_GATE.per_feed_p95_ms_max;
    const maxOk = r.kind === "trade" ? r.max_ms < G2_GATE.trade_max_ms_below : r.max_ms < G2_GATE.quote_mark_max_ms_below;
    return { feed_id: r.feed_id, venue: r.venue, kind: r.kind, samples: r.samples, p95_ms: r.p95_ms, max_ms: r.max_ms, p95_ok: p95Ok, max_ok: maxOk, ok: p95Ok && maxOk };
  });
  const failing = rows.filter((r) => !r.ok);
  return {
    gate: G2_GATE, rows, population_size: rows.length, failing: failing.map((r) => `${r.venue}/${r.feed_id}/${r.kind}`),
    original_gate_result: failing.length === 0 ? "ORIGINAL_GATE_MET_FOR_SUPPLIED_POPULATION" : "ORIGINAL_GATE_NOT_MET",
  };
}
