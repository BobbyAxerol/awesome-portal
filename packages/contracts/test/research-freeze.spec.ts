import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");
const openApiPath = join(ROOT, "openapi", "research-freeze.openapi.json");
const generatedPath = join(ROOT, "generated", "research-freeze.d.ts");

describe("P16 published Research Freeze contract", () => {
  it("publishes one bounded read plus an explicit, CSRF-protected re-read", () => {
    const openApi = JSON.parse(readFileSync(openApiPath, "utf8")) as { paths: Record<string, Record<string, unknown>> };
    expect(Object.keys(openApi.paths)).toEqual([
      "/api/v1/quantbt/runs/{runId}/freeze",
      "/api/v1/quantbt/runs/{runId}/freeze/verify",
    ]);
    expect(Object.keys(openApi.paths["/api/v1/quantbt/runs/{runId}/freeze"]!)).toEqual(["get"]);
    expect(Object.keys(openApi.paths["/api/v1/quantbt/runs/{runId}/freeze/verify"]!)).toEqual(["post"]);
  });

  it("generates typed partial-integrity and typed current-source gap vocabulary", () => {
    const generated = readFileSync(generatedPath, "utf8");
    for (const needle of [
      "researchFreezeDetailGetV1", "researchFreezeVerifyPostV1", "PARTIAL_MATCH", "PORTAL_RETAINED_DIGEST_BINDING_ONLY",
      "NOT_ATTESTED", "FIXED_PROFILE_NO_SELECTION_ARTIFACT", "frozen_parameters", "x-portal-csrf",
    ]) expect(generated).toContain(needle);
  });

  it("does not publish source/worker/artifact, cursor or diagnostic authority as a field or route parameter", () => {
    const document = readFileSync(openApiPath, "utf8");
    for (const forbidden of [
      "worker_attempt_id", "lease_epoch", "artifact_store_path", "source_path", "market_path", "raw_ohlcv",
      "relation_name", "cursor", "private_key", "broker", "diagnostic_job", "/commands",
    ]) expect(document).not.toContain(`\"${forbidden}\"`);
    expect(document).toContain("same-origin");
    expect(document).toContain("retained digest bindings");
  });
});
