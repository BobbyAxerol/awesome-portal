import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");
const openApiPath = join(ROOT, "openapi", "research-split.openapi.json");
const generatedPath = join(ROOT, "generated", "research-split.d.ts");

describe("P14 published Research Split contract", () => {
  it("publishes exactly one named same-origin read", () => {
    const openApi = JSON.parse(readFileSync(openApiPath, "utf8")) as { paths: Record<string, Record<string, unknown>> };
    expect(Object.keys(openApi.paths)).toEqual(["/api/v1/quantbt/runs/{runId}/split"]);
    expect(Object.keys(openApi.paths["/api/v1/quantbt/runs/{runId}/split"]!)).toEqual(["get"]);
  });

  it("generates current-source chronology, absence and exact UTC vocabulary", () => {
    const generated = readFileSync(generatedPath, "utf8");
    for (const needle of [
      "researchSplitDetailGetV1", "SplitDetail", "THREE_WINDOW_CURRENT",
      "WARMUP_NOT_SCORED", "NOT_EXPOSED_TO_CHILD_TAPE", "NOT_EVALUATED",
      "FIXED_PROFILE_NO_SEARCH", "NOT_ATTESTED", "P08_METADATA_BOUND",
      "PENDING_SOURCE_CALLBACK", "LEGACY_METADATA_ONLY", "source_transform_digest",
    ]) expect(generated).toContain(needle);
  });

  it("does not turn chronology truth into source, holdout or command access", () => {
    const document = readFileSync(openApiPath, "utf8");
    for (const forbidden of [
      "worker_attempt_id", "lease_epoch", "artifact_store_path", "source_path", "market_path",
      "raw_ohlcv", "relation_name", "private_key", "broker", "command", "unlock/holdout",
    ]) expect(document).not.toContain(forbidden);
    expect(document).toContain("same-origin");
    expect(document).toContain("immutable");
  });
});
