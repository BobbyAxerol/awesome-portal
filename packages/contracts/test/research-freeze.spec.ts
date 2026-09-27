import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");
const openApiPath = join(ROOT, "openapi", "research-freeze.openapi.json");
const generatedPath = join(ROOT, "generated", "research-freeze.d.ts");

describe("P16 published Research Freeze contract", () => {
  it("E17 publishes imported identity at the response root and keeps shared Stage 4 schemas aligned", () => {
    const freeze = JSON.parse(readFileSync(openApiPath, "utf8"));
    const retained = JSON.parse(readFileSync(join(ROOT, "openapi", "research-current-source.openapi.json"), "utf8"));
    expect(freeze.components.schemas.FreezeDetail.properties.imported_alpha.$ref)
      .toBe("#/components/schemas/ImportedAlphaReadBinding");
    expect(freeze.components.schemas.FreezeDetail.properties.freeze.properties.imported_alpha).toBeUndefined();
    for (const key of ["Stage4BindingRow", "Stage4Binding", "ParameterAuthority"]) {
      expect(freeze.components.schemas[key], key).toEqual(retained.components.schemas[key]);
    }
  });
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
      "verification_scope", "NOT_ATTESTED", "FIXED_PROFILE_NO_SELECTION_ARTIFACT", "frozen_parameters", "x-portal-csrf",
    ]) expect(generated).toContain(needle);
  });

  it("requires scope on the explicit verification response itself", () => {
    const document = JSON.parse(readFileSync(openApiPath, "utf8")) as {
      components: {
        schemas: Record<string, {
          required?: string[];
          properties?: Record<string, { enum?: string[] }>;
        }>;
      };
    };
    const verification = document.components.schemas.FreezeVerification!;

    expect(verification.required).toContain("verification_scope");
    expect(verification.properties?.verification_scope?.enum).toEqual([
      "PORTAL_RETAINED_DIGEST_BINDING_ONLY",
      "PORTAL_RETAINED_DIGEST_BINDING_AND_P05_ARTIFACT_BYTES",
      "P05_ARTIFACT_BYTES_ONLY",
      "NONE",
    ]);
    // A10a: the explicit verify carries its own durable byte receipt.
    expect(verification.required).toContain("artifact_bytes");
  });

  it("A10a publishes a typed byte receipt that can never claim MATCH without one", () => {
    const document = JSON.parse(readFileSync(openApiPath, "utf8")) as {
      components: { schemas: Record<string, { required?: string[]; properties?: Record<string, { enum?: string[] }> }> };
    };
    const receipt = document.components.schemas.ArtifactByteVerification!;
    expect(receipt.properties?.state?.enum).toEqual([
      "MATCH", "MISMATCH", "MISSING", "NOT_VERIFIED", "NOT_RETAINED", "UNAVAILABLE", "NOT_ENABLED",
    ]);
    expect(receipt.required).toEqual(expect.arrayContaining(["receipt_id", "expected_manifest_digest", "observed_manifest_digest"]));
    expect(document.components.schemas.FreezeDetail!.required).toContain("artifact_bytes");
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
