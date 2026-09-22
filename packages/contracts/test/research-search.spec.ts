import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");
const openApiPath = join(ROOT, "openapi", "research-search.openapi.json");
const generatedPath = join(ROOT, "generated", "research-search.d.ts");

describe("P15 published Research Search contract", () => {
  it("publishes exactly one named same-origin bounded read", () => {
    const openApi = JSON.parse(readFileSync(openApiPath, "utf8")) as { paths: Record<string, Record<string, unknown>> };
    expect(Object.keys(openApi.paths)).toEqual(["/api/v1/quantbt/runs/{runId}/search"]);
    expect(Object.keys(openApi.paths["/api/v1/quantbt/runs/{runId}/search"]!)).toEqual(["get"]);
  });

  it("generates fixed-profile, exact-value and typed non-optimizer vocabulary", () => {
    const generated = readFileSync(generatedPath, "utf8");
    for (const needle of [
      "researchSearchDetailGetV1", "FIXED_PROFILE_NO_SEARCH", "DECLARED_NOT_EXECUTED",
      "FIXED_PARAMETER_PROFILE", "selected_trial_ref", "NOT_APPLICABLE", "ExactDecimal", "fold",
    ]) expect(generated).toContain(needle);
  });

  it("does not expose worker, source, cursor, raw-data or command authority", () => {
    const document = readFileSync(openApiPath, "utf8");
    for (const forbidden of [
      "worker_attempt_id", "lease_epoch", "artifact_store_path", "source_path", "market_path", "raw_ohlcv",
      "relation_name", "cursor", "private_key", "broker", "/commands",
    // Descriptions explicitly state that these internals are absent. What
    // must never happen is publishing any of them as an actual JSON/OpenAPI
    // field or route parameter.
    ]) expect(document).not.toContain(`\"${forbidden}\"`);
    expect(document).toContain("same-origin");
    expect(document).toContain("fixed-parameter qualification");
  });
});
