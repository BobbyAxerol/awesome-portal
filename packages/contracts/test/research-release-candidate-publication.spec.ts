import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");
const openApiPath = join(ROOT, "openapi", "research-release-candidate-publication.openapi.json");
const generatedPath = join(ROOT, "generated", "research-release-candidate-publication.d.ts");

describe("P22 publication and existing R1 mirror OpenAPI contract", () => {
  it("publishes only one same-origin R1 publish operation and one read-only mirror", () => {
    const openApi = JSON.parse(readFileSync(openApiPath, "utf8")) as {
      paths: Record<string, Record<string, { operationId?: string; parameters?: Array<{ name?: string }> }>>;
    };
    expect(Object.entries(openApi.paths).map(([path, operations]) => [path, Object.keys(operations)])).toEqual([
      ["/api/v1/research/release-candidates/{releaseCandidateId}/publication", ["get"]],
      ["/api/v1/research/release-candidates/{releaseCandidateId}/publish", ["post"]],
    ]);
    expect(openApi.paths["/api/v1/research/release-candidates/{releaseCandidateId}/publish"]?.post.parameters)
      .toEqual(expect.arrayContaining([expect.objectContaining({ name: "x-portal-csrf" })]));
  });

  it("generates the exact operation and lifecycle/hash namespaces", () => {
    const generated = readFileSync(generatedPath, "utf8");
    for (const needle of [
      "researchReleaseCandidatePublicationGetV1", "researchReleaseCandidatePublishV1",
      "research.release-candidate-publication.v1", "candidate_relation", "legacy_artifact_sha256",
      "evidence_set_hash", "approval_id", "APPROVED_WITH_CONDITION", "PublicationResponse",
      "x-portal-csrf",
    ]) expect(generated).toContain(needle);
  });

  it("keeps only the named publish and mirror operations, with no decision or command paths", () => {
    const parsed = JSON.parse(readFileSync(openApiPath, "utf8")) as {
      paths: Record<string, Record<string, { operationId?: string }>>;
    };
    const operations = Object.values(parsed.paths).flatMap((path) => Object.values(path));
    expect(operations.map((operation) => operation.operationId).sort()).toEqual([
      "researchReleaseCandidatePublicationGetV1", "researchReleaseCandidatePublishV1",
    ]);
    expect(JSON.stringify(parsed.paths)).not.toContain("execution_command");
    expect(JSON.stringify(parsed.paths)).not.toContain("DecisionRequest");
  });
});
