import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");
const openApiPath = join(ROOT, "openapi", "research-evidence.openapi.json");
const generatedPath = join(ROOT, "generated", "research-evidence.d.ts");

describe("P13 published Research Evidence Flow contract", () => {
  it("publishes exactly the compact Hub and one named lazy-series read", () => {
    const openApi = JSON.parse(readFileSync(openApiPath, "utf8")) as {
      paths: Record<string, Record<string, unknown>>;
    };
    expect(Object.keys(openApi.paths)).toEqual([
      "/api/v1/quantbt/runs/{runId}/evidence",
      "/api/v1/quantbt/runs/{runId}/evidence/series",
    ]);
    for (const path of Object.values(openApi.paths)) expect(Object.keys(path)).toEqual(["get"]);
  });

  it("generates typed revision, absence, exact-value and bounded-series vocabulary", () => {
    const generated = readFileSync(generatedPath, "utf8");
    for (const needle of [
      "researchEvidenceHubGetV1", "researchEvidenceSeriesGetV1", "EvidenceHub", "EvidenceSeries",
      "PORTAL_PERSISTED_RESEARCH", "EQUITY_OOS", "MONTHLY_RETURNS", "ROLLING_RETURNS_20",
      "RETURN_DISTRIBUTION", "PENDING_SOURCE_CALLBACK", "LEGACY_METADATA_ONLY",
      "source_transform_digest", "metric_registry_version", "RunIdentity", "FoldNavigation",
      "run_identity", "fold_navigation", "published_fold_count", "observed_folds",
      "p17.imported-signal-notional.v1",
    ]) expect(generated).toContain(needle);
    const openApi = readFileSync(openApiPath, "utf8");
    expect(openApi).toContain('"maxItems": 192');
    expect(openApi).toContain('"ExactDecimal"');
    expect(openApi).toContain('"If-None-Match"');
    expect(openApi).toContain('p13h1_');
  });

  it("does not turn the Hub into an artifact, raw-market, worker or control surface", () => {
    const document = readFileSync(openApiPath, "utf8");
    for (const forbidden of [
      "worker_attempt_id", "lease_epoch", "artifact_store_path", "source_path", "market_path",
      "raw_ohlcv", "relation_name", "private_key", "broker", "retry/CLI", "command",
    ]) expect(document).not.toContain(forbidden);
    expect(document).toContain("same-origin");
    expect(document).toContain("immutable");
    expect(document).toContain("At most 192");
  });
  it("B3 publishes only bounded P08 snapshot metadata with an explicit full-query scope", () => {
    const document = JSON.parse(readFileSync(openApiPath, "utf8")) as { components: { schemas: Record<string, any> } };
    const core = document.components.schemas.EvidenceHub.properties.core;
    expect(core.properties.dataset_coverage).toEqual(expect.objectContaining({
      $ref: "#/components/schemas/DatasetCoverage",
    }));
    expect(core.required).not.toContain("dataset_coverage");
    const coverage = document.components.schemas.DatasetCoverage;
    expect(coverage.required).toContain("range_scope");
    const fixture = JSON.parse(readFileSync(join(ROOT, "fixtures", "research-evidence.dataset-coverage.valid.json"), "utf8"));
    expect(fixture).toMatchObject({
      range_scope: "FULL_SNAPSHOT_QUERY", rows: 336, gaps: 0, missing_bar_count: 0,
      columns: ["open", "high", "low", "close", "volume"],
    });
    expect(readFileSync(generatedPath, "utf8")).toContain("DatasetCoverage");
  });
});
