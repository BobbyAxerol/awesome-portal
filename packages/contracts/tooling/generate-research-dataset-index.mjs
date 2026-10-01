/** B7 named, additive metadata contract; V1 and preflight authority stay intact. */
import { readFileSync, writeFileSync } from "node:fs";
const root = new URL("../", import.meta.url), check = process.argv.includes("--check");
const v1 = JSON.parse(readFileSync(new URL("openapi/research-preflight.openapi.json", root)));
const obj = properties => ({ type: "object", additionalProperties: false, required: Object.keys(properties), properties });
const ref = name => ({ $ref: `#/components/schemas/${name}` });
const nullable = schema => ({ anyOf: [schema, { type: "null" }] });
const count = { type: "integer", minimum: 0, maximum: 10_000_000 }, ms = { type: "integer", minimum: 0, maximum: 9007199254740991 };
const digest = { type: "string", pattern: "^[a-f0-9]{64}$" }, reason = { type: "string", pattern: "^[A-Z][A-Z0-9_]{2,159}$" };
const tf = { type: "string", pattern: "^[1-9][0-9]*(?:min|m|h|d)$" };
const symbol = { type: "string", pattern: "^[A-Z0-9][A-Z0-9_-]{1,31}$" };
const id = { type: "string", pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$" };
const availability = { oneOf: [obj({ state: { const: "AVAILABLE" }, reason_code: { type: "null" } }),
  obj({ state: { const: "NOT_PUBLISHED" }, reason_code: reason })] };
const instrumentFields = ["display_name", "underlying", "base", "quote", "settle_currency", "tick_size", "lot_size", "contract_multiplier", "listing_utc_ms", "expiry_utc_ms"];
const instrument = obj({ state: { const: "NOT_PUBLISHED" }, reason_code: reason, origin: { const: "HMD_DIRECT" }, as_of_utc_ms: { type: "null" },
  contract_kind: { type: "null" }, ...Object.fromEntries(instrumentFields.map(name => [name, { type: "null" }])) });
const coverage = obj({ timeframe: tf, resolution_seconds: { ...count, minimum: 1 }, availability: { enum: ["AVAILABLE", "NOT_PUBLISHED"] }, reason_code: nullable(reason),
  origin: { const: "PORTAL_DERIVED" }, as_of_utc_ms: ms, first_bar_utc_ms: nullable(ms), last_bar_utc_ms: nullable(ms), last_closed_bar_end_utc_ms: nullable(ms),
  bar_count: count, expected_bar_count: count, missing_ratio: nullable({ type: "string", pattern: "^0\\.\\d{12}$" }),
  gap_count: count, largest_gap_seconds: ms, duplicate_bar_count: count, coverage_scope: { const: "INDEXED_RANGE" },
  indexed_start_utc_ms: ms, indexed_end_exclusive_utc_ms: ms, closed_bar_policy: { const: "INTERVAL_END_AT_OR_BEFORE_AS_OF_V1" } });
const legacy = structuredClone(v1.components.schemas.DatasetCatalog.properties.datasets.items);
const indexedSymbol = structuredClone(legacy.properties.symbols.properties.items.items);
Object.assign(indexedSymbol.properties, { coverage_by_timeframe: { type: "array", items: ref("Coverage"), maxItems: 16 },
  coverage_availability: ref("Availability"), instrument: ref("Instrument"),
  quality: obj({ state: { const: "NOT_PUBLISHED" }, reason_code: { const: "HMD_QUALITY_IS_TIMEFRAME_SPECIFIC" }, origin: { const: "PORTAL_DERIVED" },
    gap_count: { type: "null" }, missing_ratio: { type: "null" }, duplicate_bar_count: { type: "null" }, as_of_utc_ms: nullable(ms) }) });
indexedSymbol.required.push("coverage_by_timeframe", "coverage_availability", "instrument", "quality");
Object.assign(legacy.properties, { catalog_revision: nullable(digest), as_of_utc_ms: nullable(ms), asset_class: { type: "null" }, asset_class_availability: ref("Availability"),
  timeframes: { type: "array", maxItems: 16, items: obj({ timeframe: tf, resolution_seconds: { ...count, minimum: 1 },
    availability: { enum: ["available", "unavailable"] }, reason_code: nullable(reason) }) } });
legacy.required.push("catalog_revision", "as_of_utc_ms", "asset_class", "asset_class_availability");
legacy.properties.symbols.properties.items.items = ref("IndexedSymbol");
const metadata = obj({ schema_version: { const: "research.dataset-bar-metadata.v1" }, catalog_revision: nullable(digest), as_of_utc_ms: nullable(ms), dataset_id: id,
  symbol, timeframe: tf, start_utc_ms: ms, end_exclusive_utc_ms: ms, scope: { const: "INDEX_METADATA_ONLY_NOT_PREFLIGHT_ADMISSION" },
  availability: { enum: ["AVAILABLE", "NOT_PUBLISHED"] }, reason_code: nullable(reason), bars: nullable(count), first_bar_utc_ms: nullable(ms), last_bar_utc_ms: nullable(ms),
  warmup_bars_required: { ...count, maximum: 100_000 }, warmup_bars_available_before_start: nullable({ ...count, maximum: 100_000 }) });
const page = obj({ schema_version: { const: "research.dataset-symbols.v1" }, dataset_id: id, catalog_revision: digest, as_of_utc_ms: nullable(ms), availability: ref("Availability"),
  items: { type: "array", items: ref("IndexedSymbol"), maxItems: 200 }, total: nullable({ ...count, maximum: 256 }), next_cursor: nullable({ type: "string", maxLength: 4096 }) });
const catalog = obj({ schema_version: { const: "research.dataset-catalog.v2" }, catalog_revision: nullable(digest), as_of_utc_ms: nullable(ms), index_availability: ref("Availability"),
  datasets: { type: "array", items: legacy, maxItems: 16 }, coverage_rule: { type: "string", minLength: 1, maxLength: 400 } });
const parameter = (name, schema, required = false, location = "query") => ({ name, in: location, required, schema });
const workspace = parameter("workspace_id", { type: "string", pattern: "^[A-Za-z0-9._-]{1,128}$" });
const dataset = parameter("dataset_id", id, true, "path");
const operation = (operationId, response, parameters) => ({ get: { operationId, summary: "Read bounded Research historical metadata without scanning market data",
  security: v1.paths["/api/v1/research/datasets"].get.security, parameters,
  responses: { "200": { description: "Named metadata response; absence remains typed", content: { "application/json": { schema: ref(response) } } },
    ...Object.fromEntries([400,401,403,404,502,503].map(status => [status, { description: "Typed refusal; never a market-data fallback", content: { "application/json": { schema: ref("Problem") } } }])) } } });
const doc = { openapi: "3.1.0", info: { title: "Research indexed data declaration", version: "1.0.0",
  description: "Explicit operator-built immutable index. Fixed UTC timestamps/exact counts over declared indexed ranges only; not instrument authority, constituent-minute completeness, a preflight token, engine admission or sealed-holdout values. GET does not build/scan HMD. V1 remains unchanged." },
  paths: {
    "/api/v1/research/datasets/catalog-v2": operation("researchDatasetCatalogGetV2", "DatasetCatalogV2", [workspace]),
    "/api/v1/research/datasets/{dataset_id}/symbols": operation("researchDatasetSymbolsGetV1", "SymbolPage", [dataset, workspace,
      parameter("q", { type: "string", pattern: "^[A-Za-z0-9_-]{0,32}$", default: "" }), parameter("kind", { enum: ["PERPETUAL", "QUARTERLY"] }),
      parameter("timeframe", tf), parameter("cursor", { type: "string", minLength: 1, maxLength: 4096 }), parameter("limit", { type: "integer", minimum: 1, maximum: 200, default: 50 })]),
    "/api/v1/research/datasets/{dataset_id}/bar-metadata": operation("researchDatasetBarMetadataGetV1", "BarMetadata", [dataset, workspace,
      parameter("symbol", symbol, true), parameter("timeframe", tf, true), parameter("start_utc_ms", ms, true), parameter("end_exclusive_utc_ms", ms, true),
      parameter("warmup_bars", { type: "integer", minimum: 0, maximum: 100_000, default: 0 })]),
  }, components: { securitySchemes: v1.components.securitySchemes, schemas: { DatasetCatalogV2: catalog, IndexedSymbol: indexedSymbol, Coverage: coverage,
    Availability: availability, Instrument: instrument, SymbolPage: page, BarMetadata: metadata,
    FieldPath: v1.components.schemas.FieldPath, Problem: v1.components.schemas.Problem } } };
const path = new URL("openapi/research-dataset-index.openapi.json", root), text = JSON.stringify(doc, null, 2) + "\n";
if (check) { if (readFileSync(path, "utf8") !== text) throw new Error("Dataset index OpenAPI drift"); }
else writeFileSync(path, text);
function emitFixture(name, value) {
  const path = new URL(`fixtures/research-dataset-catalog.v2.${name}.valid.json`, root), next = JSON.stringify(value, null, 2) + "\n";
  if (check) { if (readFileSync(path, "utf8") !== next) throw new Error(`Dataset fixture drift: ${name}`); }
  else writeFileSync(path, next);
}
// Canonical SYNTHETIC contract examples, never an HMD/product evidence claim.
const oldFixture = JSON.parse(readFileSync(new URL("fixtures/research-preflight.dataset-catalog.valid.json", root)));
const missing = { state: "NOT_PUBLISHED", reason_code: "HMD_READER_INSTRUMENT_METADATA_NOT_PUBLISHED", origin: "HMD_DIRECT", as_of_utc_ms: null,
  contract_kind: null, ...Object.fromEntries(instrumentFields.map(key => [key, null])) };
const start = 1782864000000, end = start + 48 * 3_600_000;
const sample = { timeframe: "1h", resolution_seconds: 3600, availability: "AVAILABLE", reason_code: null,
  origin: "PORTAL_DERIVED", as_of_utc_ms: end, first_bar_utc_ms: start, last_bar_utc_ms: end - 3_600_000,
  last_closed_bar_end_utc_ms: end, bar_count: 48, expected_bar_count: 48, missing_ratio: "0.000000000000",
  gap_count: 0, largest_gap_seconds: 0, duplicate_bar_count: 0, coverage_scope: "INDEXED_RANGE",
  indexed_start_utc_ms: start, indexed_end_exclusive_utc_ms: end, closed_bar_policy: "INTERVAL_END_AT_OR_BEFORE_AS_OF_V1" };
const convertDataset = (dataset, coverage = true) => ({ ...dataset, catalog_revision: "a".repeat(64), as_of_utc_ms: end,
  timeframes: dataset.timeframes.map(timeframe => ({ timeframe: timeframe.toLowerCase(), resolution_seconds: parseInt(timeframe) * (timeframe.toLowerCase().endsWith("d") ? 86400 : timeframe.endsWith("h") ? 3600 : 60), availability: dataset.availability,
    reason_code: dataset.availability === "available" ? null : "HMD_DATASET_NOT_AVAILABLE" })),
  asset_class: null, asset_class_availability: { state: "NOT_PUBLISHED", reason_code: "HMD_READER_ASSET_CLASS_NOT_PUBLISHED" }, symbols: { ...dataset.symbols,
    items: dataset.symbols.items.map(row => ({ ...row, coverage_by_timeframe: coverage ? [sample] : [],
      coverage_availability: coverage ? { state: "AVAILABLE", reason_code: null } : { state: "NOT_PUBLISHED", reason_code: "HMD_SYMBOL_INTERVAL_NOT_INDEXED" },
      instrument: missing, quality: { state: "NOT_PUBLISHED", reason_code: "HMD_QUALITY_IS_TIMEFRAME_SPECIFIC", origin: "PORTAL_DERIVED",
        gap_count: null, missing_ratio: null, duplicate_bar_count: null, as_of_utc_ms: end } })) } });
const healthy = { schema_version: "research.dataset-catalog.v2", catalog_revision: "a".repeat(64), as_of_utc_ms: end,
  index_availability: { state: "AVAILABLE", reason_code: null }, datasets: [convertDataset(oldFixture.datasets[0])],
  coverage_rule: "Exact target bars in the declared indexed range; preflight is authoritative. No prices or instrument guesses." };
emitFixture("healthy", healthy);
const partial = structuredClone(healthy);
for (const row of partial.datasets[0].symbols.items) Object.assign(row.coverage_by_timeframe[0], { bar_count: 46, missing_ratio: "0.041666666667", gap_count: 1, largest_gap_seconds: 7200 });
emitFixture("partial-quality", partial);
emitFixture("multi-dataset", { ...healthy, datasets: oldFixture.datasets.map(dataset => convertDataset(dataset, false)) });
const absent = structuredClone(healthy);
Object.assign(absent, { catalog_revision: null, as_of_utc_ms: null, index_availability: { state: "NOT_PUBLISHED", reason_code: "HMD_METADATA_INDEX_NOT_BUILT" } });
for (const dataset of absent.datasets) {
  dataset.catalog_revision = null; dataset.as_of_utc_ms = null;
  for (const row of dataset.symbols.items) { row.coverage_by_timeframe = []; row.coverage_availability = absent.index_availability; row.quality.as_of_utc_ms = null; }
}
emitFixture("symbol-absent", absent);
process.stdout.write(`Dataset index contract ${check ? "verified" : "generated"}.\n`);
