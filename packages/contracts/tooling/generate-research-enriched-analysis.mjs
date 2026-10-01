/** B6 canonical schema + additive references. Preserve unrelated OpenAPI bytes. */
import { readFileSync, writeFileSync } from "node:fs";
const root = new URL("../", import.meta.url), check = process.argv.includes("--check");
const v2 = JSON.parse(readFileSync(new URL("schemas/research-retained-analytics.v2.schema.json", root)));
const ref = name => ({ $ref: `#/$defs/${name}` });
const nullable = value => ({ anyOf: [value, { type: "null" }] });
const array = (items, maxItems) => ({ type: "array", items, maxItems });
const object = properties => ({ type: "object", additionalProperties: false, required: Object.keys(properties), properties });
const count = ref("Count"), ms = ref("UtcMs"), decimal = ref("Decimal"), digest = ref("Digest");
const head = { state: { enum: ["AVAILABLE", "NOT_PUBLISHED", "NOT_APPLICABLE"] }, reason_code: nullable(ref("Reason")) };
const derived = { ...head, origin: { const: "PORTAL_DERIVED" } };
const coverage = { enum: ["FULL_RETAINED_OOS", "SAMPLED_RETAINED_EQUITY"] };
const curve = { ...v2.$defs.Curve, maxItems: 64 };
const defs = { ...v2.$defs, Curve: curve,
  LibrarySummary: object({ ...head, label: { const: "all time" }, basis: { const: "ALL_TIME" }, sparkline: ref("Curve"),
    sampling: { const: "EXTREMA_BUCKET_V1" }, source_observation_count: count, coverage, return_fraction: nullable(decimal),
    sharpe: ref("Fact"), max_drawdown_fraction: nullable(decimal), input_digest: digest }),
};
const schema = { $schema: "https://json-schema.org/draft/2020-12/schema", $id: "research.enriched-analysis.v1", ...object({
  schema_version: { const: "research.enriched-analysis.v1" }, service: { const: "enrich_analysis" }, basis: { const: "ALL_TIME" },
  lane: { enum: ["FIXED", "WFO"] }, run_id: { type: "string", pattern: "^rrun_[a-f0-9]{32}$" }, input_digest: digest,
  source_tables: { ...array(object({ name: { type: "string", pattern: "^[A-Z0-9_]{1,64}$" }, row_count: count, digest }), 8), minItems: 1 },
  scope: object({ window: { const: "OOS" }, first_at_utc_ms: ms, last_at_utc_ms: ms, observation_count: { type: "integer", minimum: 2, maximum: 2_000_000 },
    fold_count: { type: "integer", minimum: 1, maximum: 32 }, locator: ref("Locator"), benchmark_locator: ref("Locator"), coverage, source_observation_count: { type: "integer", minimum: 2, maximum: 2_000_000 } }),
  windows: object({ is: object(head), oos: object(head), holdout: object(head) }),
  facts: object({ metrics: v2.properties.metrics, behaviour: v2.properties.behaviour }),
  curves: object({ sampling: object({ source_observation_count: count, emitted_point_count: { type: "integer", minimum: 0, maximum: 64 }, method: { const: "EXTREMA_BUCKET_V1" } }),
    strategy_rebased_100: ref("Curve"), benchmark_rebased_100: ref("Curve"), drawdown_fraction: ref("Curve") }),
  monthly_returns: object({ ...derived, includes_partial_months: { const: true }, sampling: { enum: ["FULL", "TAIL_WINDOW_V1"] },
    total_period_count: count, omitted_transport_period_count: count,
    definition_id: { const: "OOS_MONTH_CLOSE_OVER_FIRST_OOS_OR_PREVIOUS_OBSERVED_MONTH_CLOSE_V1" },
    values: array(object({ month_start_utc_ms: ms, return_fraction: decimal, observation_count: count, expected_observation_count: count,
      partial: { type: "boolean" }, basis: { enum: ["FIRST_OOS_CLOSE", "PREVIOUS_OBSERVED_MONTH_CLOSE"] }, base_at_utc_ms: ms, close_at_utc_ms: ms }), 120) }),
  return_distribution: object({ ...derived, sampling: { const: "UTC_DAY" }, observation_count: count,
    bucket_basis: { const: "ALL_TIME_SOURCE_UTC_DAILY_RETURNS_12_BIN_V1" },
    buckets: array(object({ lower_inclusive: decimal, upper: decimal, upper_inclusive: { enum: ["true", "false"] }, count }), 12) }),
  drawdown_episodes: object({ ...derived, total: count, open_episode_present: { type: "boolean" }, longest_open: { type: "boolean" },
    values: array(object({ start_utc_ms: ms, trough_utc_ms: ms, recovery_utc_ms: nullable(ms), depth_fraction: decimal, duration_seconds: ms }), 10) }),
  library_summary: ref("LibrarySummary"), rolling: { type: "null" },
}), $defs: defs };
function emit(path, text) {
  const url = new URL(path, root); let old = ""; try { old = readFileSync(url, "utf8"); } catch {}
  if (old === text) return;
  if (check) throw new Error(`Enrichment generated drift: ${path}`);
  writeFileSync(url, text);
}
emit("schemas/research-enriched-analysis.v1.schema.json", JSON.stringify(schema, null, 2) + "\n");
const local = value => JSON.parse(JSON.stringify(value).replaceAll("#/$defs/", "#/components/schemas/EnrichedAnalysis"));
const { $schema, $id, $defs, ...body } = schema;
const components = { EnrichedAnalysis: local(body), ...Object.fromEntries(Object.entries(defs).map(([name, value]) => [`EnrichedAnalysis${name}`, local(value)])) };
for (const [file, dto, property, definition] of [
  ["research-current-source", "Evidence", "enriched_analysis", "EnrichedAnalysis"],
  ["research-evidence", "EvidenceHub", "enriched_analysis", "EnrichedAnalysis"],
  ["research-run-library", "RunLibraryItem", "analytics_all_time", "EnrichedAnalysisLibrarySummary"],
  ["research-report", "ReportDetail", "enriched_analysis", "EnrichedAnalysis"],
]) {
  const path = `openapi/${file}.openapi.json`, old = readFileSync(new URL(path, root), "utf8");
  let next = old.replace(/^      "EnrichedAnalysis[^"\n]*":.*\n/gm, "");
  next = next.replace('"schemas": {\n', '"schemas": {\n' + Object.entries(components).map(([key,value]) => `      "${key}": ${JSON.stringify(value)},\n`).join(""));
  // Response components can share the schema's name (Evidence). Search
  // within schemas, not the first identically named response. Remove only
  // this generator's additive reference before reinserting idempotently.
  next = next.replace(new RegExp(` ?"${property}": \\{ "\\$ref": "#/components/schemas/${definition}" \\},`, "g"), "");
  const start = next.indexOf(`      "${dto}":`, next.indexOf('"schemas": {')), props = next.indexOf('"properties": {', start);
  if (start < 0 || props < start) throw new Error(`Missing enrichment DTO: ${dto}`);
  const existing = JSON.parse(next).components.schemas[dto];
  const properties = existing.properties ?? existing.allOf.find(x => x.properties).properties;
  if (!properties[property]) next = next.slice(0, props + 15) + ` "${property}": { "$ref": "#/components/schemas/${definition}" },` + next.slice(props + 15);
  const updated = JSON.parse(next).components.schemas[dto];
  if (!(updated.properties ?? updated.allOf.find(x => x.properties).properties)[property]) throw new Error(`Missing additive field: ${dto}.${property}`);
  emit(path, next);
}
process.stdout.write(`Enrichment components ${check ? "verified" : "generated"}.\n`);
