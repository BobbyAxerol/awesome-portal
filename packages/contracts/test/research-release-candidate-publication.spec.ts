import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..");
const openApi = JSON.parse(readFileSync(join(root, "openapi", "research-release-candidate-publication.openapi.json"), "utf8"));
const generated = readFileSync(join(root, "generated", "research-release-candidate-publication.d.ts"), "utf8");

describe("P22 generated publication and existing R1 mirror", () => {
  it("publishes only a named GET and a CSRF-protected publish POST", () => {
    expect(Object.entries(openApi.paths).map(([path, verbs]) => [path, Object.keys(verbs as object)])).toEqual([
      ["/api/v1/research/release-candidates/{releaseCandidateId}/publication", ["get"]],
      ["/api/v1/research/release-candidates/{releaseCandidateId}/publish", ["post"]],
      ["/api/v1/research/alpha-versions/{alphaVersionId}/publication", ["get"]],
    ]);
    const post = openApi.paths["/api/v1/research/release-candidates/{releaseCandidateId}/publish"].post;
    expect(post.operationId).toBe("researchReleaseCandidatePublishV1");
    expect(post.parameters).toContainEqual({ $ref: "#/components/parameters/Csrf" });
    expect(generated).toContain("researchReleaseCandidatePublicationGetV1");
    expect(generated).toContain("researchReleaseCandidatePublishV1");
    expect(generated).toContain("researchAlphaVersionPublicationGetV1");
    expect(generated).toContain("AlphaVersionPublicationResponse:");
    for (const field of ["legacy_artifact_sha256", "evidence_set_hash", "approval_read", "candidate_relation"]) {
      expect(generated).toContain(field);
    }
  });
  it("exposes no approval decision, command, source relation, or credential input", () => {
    const paths = JSON.stringify(openApi.paths);
    for (const forbidden of ["approval-decision", "execution_command", "source_relation", "jwt", "mTLS", "broker"]) {
      expect(paths).not.toContain(forbidden);
    }
  });
});
