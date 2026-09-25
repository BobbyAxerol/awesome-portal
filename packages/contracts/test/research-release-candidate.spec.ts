import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");
const openApiPath = join(ROOT, "openapi", "research-release-candidate.openapi.json");
const generatedPath = join(ROOT, "generated", "research-release-candidate.d.ts");

describe("P21 published Research Release Candidate contract", () => {
  it("publishes only compose, actor-local draft CAS, local seal, and immutable pack read", () => {
    const openApi = JSON.parse(readFileSync(openApiPath, "utf8")) as {
      paths: Record<string, Record<string, unknown>>;
    };
    expect(Object.entries(openApi.paths).map(([path, operations]) => [path, Object.keys(operations)])).toEqual([
      ["/api/v1/quantbt/runs/{runId}/release-candidate", ["get"]],
      ["/api/v1/quantbt/runs/{runId}/release-candidate/draft", ["patch"]],
      ["/api/v1/quantbt/runs/{runId}/release-candidate/seal", ["post"]],
      ["/api/v1/research/release-candidates/{releaseCandidateId}", ["get"]],
    ]);
  });

  it("keeps the Screen-11 17-field/12-item local-seal vocabulary generated and typed", () => {
    const generated = readFileSync(generatedPath, "utf8");
    for (const needle of [
      "researchReleaseCandidateComposeGetV1", "researchReleaseCandidateDraftPatchV1",
      "researchReleaseCandidateLocalSealCreateV1", "researchReleaseCandidatePackGetV1",
      "release_candidate_id", "parameter_bundle_digest", "METHODOLOGY_CLAIM",
      "PROPOSED_USE_RESTRICTIONS", "SEALED_LOCAL", "NOT_DELIVERED", "NOT_APPROVED",
      "PORTAL_PERSISTED_RESEARCH",
      "PublishedComparison", "CertificationAxes", "published_comparison", "certification_axes",
    ]) expect(generated).toContain(needle);
  });

  it("does not expose source relation/cursor, worker custody, execution inputs, or a publish command", () => {
    const document = readFileSync(openApiPath, "utf8");
    for (const forbidden of [
      "relation_name", "source_cursor", "worker_attempt_id", "lease_epoch", "artifact_store_path",
      "source_path", "raw_ohlcv", "broker_url", "private_key", "execution_command",
      "approval_payload", "publish-intent", "optimizer_control",
    ]) expect(document).not.toContain(forbidden);
    expect(document).toContain("same-origin");
    expect(document).toContain("P22");
  });
});
