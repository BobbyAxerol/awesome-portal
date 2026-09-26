import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ResearchReleaseCandidatePublishRequestSchema,
  ResearchReleaseCandidatePublicationResponseSchema,
} from "../src/research/release-candidate-publication.contract";

const request = {
  schema_version: "research.release-candidate-publish-request.v1",
  workspace_id: "ws_p22", expected_pack_digest: "a".repeat(64),
  request_key: "p22:one", methodology_claim_id: "claim:oos",
  summary: "Publish a verified final audit for existing R1 review.",
};
const base = {
  schema_version: "research.release-candidate-publication.v1",
  release_candidate_id: "rc_" + "0".repeat(26), run_id: "run_p22",
  alpha_id: "alpha_p22", alpha_version_id: "av_p22",
  pack_digest: "a".repeat(64),
  source: {
    availability: "AVAILABLE", reason_code: null, run_status: "COMPLETED",
    legacy_artifact_sha256: "sha256:" + "b".repeat(64),
    artifact_schema_version: "quantbt.selected-params.v1",
    eligible_methodology_claim_ids: ["claim:oos"],
    captured_at: "2026-09-25T10:00:00.000Z",
  },
  state: "NOT_PUBLISHED", candidate_relation: "CURRENT",
  may_publish: true, blocked_reason: null, published: null,
  approval_read: "NOT_PUBLISHED", approval: null,
  as_of_utc_ms: 1790330400000, replayed: false,
};

describe("P22 strict publication contract", () => {
  it("P22-T01/T06 fixture bundle keeps success, typed negative and mirror states explicit", () => {
    const fixturePath = process.env.PORTAL_CONTRACTS_DIR
      ? join(process.env.PORTAL_CONTRACTS_DIR, "fixtures/research-release-candidate-publication.p22-governance.fixtures.json")
      : new URL("../../../packages/contracts/fixtures/research-release-candidate-publication.p22-governance.fixtures.json", import.meta.url);
    const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
    expect(fixture.schema_version).toBe("research.release-candidate-publication.fixtures.v1");
    expect(fixture.success.approval_create.schema_version).toBe("governance.approval-create.v1");
    expect(fixture.negative).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "DUPLICATE_OPEN_APPROVAL", http_status: 409 }),
      expect.objectContaining({ code: "APPROVAL_CREATE_SERIALIZATION_CONFLICT", retryable: true }),
    ]));
    expect(fixture.mirror.typed_optional_fields).toContain("assignee_pool");
  });

  it("P22-T02 rejects downstream authority and unknown fields from the browser", () => {
    expect(ResearchReleaseCandidatePublishRequestSchema.safeParse(request).success).toBe(true);
    expect(ResearchReleaseCandidatePublishRequestSchema.safeParse({ ...request, gate: "R2" }).success).toBe(false);
    expect(ResearchReleaseCandidatePublishRequestSchema.safeParse({ ...request, artifact_sha256: "c".repeat(64) }).success).toBe(false);
    expect(ResearchReleaseCandidatePublishRequestSchema.safeParse({ ...request, request_key: "space key" }).success).toBe(false);
  });
  it("P22-T08 keeps local seal, legacy artifact, and Governance evidence hash distinct", () => {
    const delivered = {
      ...base, state: "DELIVERED", may_publish: false, blocked_reason: "P22_ALREADY_DELIVERED",
      published: {
        by_user_id: "usr_p22", by_username: "researcher", approval_id: "apr_p22",
        at_utc_ms: 1790330400000, receipt_digest: "d".repeat(64),
      },
      approval_read: "AVAILABLE",
      approval: {
        approval_id: "apr_p22", gate: "R1", status: "PENDING",
        subject_id: "alpha_p22", requester_user_id: "usr_p22",
        evidence_set_hash: "sha256:" + "c".repeat(64),
        sla_due_at: "2026-09-26T10:00:00.000Z",
        expires_at: "2026-09-28T10:00:00.000Z",
        created_at: "2026-09-25T10:00:00.000Z",
        read_at: "2026-09-25T10:00:01.000Z", conditions: [],
        href: "/governance/approvals/apr_p22/r1",
      },
    };
    expect(ResearchReleaseCandidatePublicationResponseSchema.safeParse(delivered).success).toBe(true);
    expect(delivered.pack_digest).not.toBe(delivered.source.legacy_artifact_sha256.slice(7));
    expect(delivered.pack_digest).not.toBe(delivered.approval.evidence_set_hash.slice(7));
  });
  it("P22-T03/T08 refuses actionable partial source, superseded RC, or invented mirror", () => {
    expect(ResearchReleaseCandidatePublicationResponseSchema.safeParse(base).success).toBe(true);
    expect(ResearchReleaseCandidatePublicationResponseSchema.safeParse({
      ...base, source: { ...base.source, availability: "PARTIAL", reason_code: "P22_SOURCE_FACTS_PARTIAL" },
    }).success).toBe(false);
    expect(ResearchReleaseCandidatePublicationResponseSchema.safeParse({
      ...base, candidate_relation: "SUPERSEDED",
    }).success).toBe(false);
    expect(ResearchReleaseCandidatePublicationResponseSchema.safeParse({
      ...base, approval_read: "AVAILABLE",
    }).success).toBe(false);
  });
});
