import { describe, expect, it } from "vitest";

import {
  ResearchReleaseCandidatePublicationResponseSchema,
  ResearchReleaseCandidatePublishRequestSchema,
} from "../src/research/release-candidate-publication.contract";

const request = {
  schema_version: "research.release-candidate-publish-request.v1",
  workspace_id: "ws-p22",
  expected_pack_digest: "a".repeat(64),
  request_key: "rc:publish:01",
  methodology_claim_id: "claim:strict-oos",
  summary: "Publish the final research candidate for R1 review.",
};

const base = {
  schema_version: "research.release-candidate-publication.v1",
  release_candidate_id: `rc_${"0".repeat(26)}`,
  run_id: "run-p22",
  alpha_id: "alpha-p22",
  alpha_version_id: "av-p22",
  pack_digest: "a".repeat(64),
  source: {
    availability: "AVAILABLE",
    reason_code: null,
    run_status: "COMPLETED",
    legacy_artifact_sha256: `sha256:${"b".repeat(64)}`,
    artifact_schema_version: "quantbt.run-summary.v1",
    eligible_methodology_claim_ids: ["claim:strict-oos"],
    captured_at: "2026-09-24T10:00:00.000Z",
  },
  state: "NOT_PUBLISHED",
  candidate_relation: "CURRENT",
  may_publish: true,
  blocked_reason: null,
  published: null,
  approval_read: "NOT_PUBLISHED",
  approval: null,
  as_of_utc_ms: 1_790_000_000_000,
  replayed: false,
};

const approval = {
  approval_id: "apr_p22",
  gate: "R1",
  status: "PENDING",
  subject_id: "alpha-p22",
  requester_user_id: "usr-p22",
  evidence_set_hash: `sha256:${"c".repeat(64)}`,
  sla_due_at: "2026-09-25T10:00:00.000Z",
  expires_at: "2026-09-27T10:00:00.000Z",
  created_at: "2026-09-24T10:00:00.000Z",
  read_at: "2026-09-24T10:00:01.000Z",
  conditions: [],
  href: "/governance/approvals/apr_p22/r1",
};

describe("P22 existing-R1 publication boundary contracts", () => {
  it("accepts only the named publish request and rejects unknown client authority", () => {
    expect(ResearchReleaseCandidatePublishRequestSchema.safeParse(request).success).toBe(true);
    expect(ResearchReleaseCandidatePublishRequestSchema.safeParse({ ...request, gate: "R2" }).success).toBe(false);
    expect(ResearchReleaseCandidatePublishRequestSchema.safeParse({ ...request, expected_artifact_sha256: "d".repeat(64) }).success).toBe(false);
    expect(ResearchReleaseCandidatePublishRequestSchema.safeParse({ ...request, request_key: "bad key" }).success).toBe(false);
  });

  it("keeps the local pack, legacy artifact, and Governance evidence hashes as separate typed facts", () => {
    const delivered = {
      ...base,
      state: "DELIVERED",
      may_publish: false,
      published: {
        approval_id: "apr_p22",
        by_user_id: "usr-p22",
        by_username: "researcher",
        at_utc_ms: 1_790_000_000_000,
        receipt_digest: "d".repeat(64),
      },
      approval_read: "AVAILABLE",
      approval,
    };
    expect(ResearchReleaseCandidatePublicationResponseSchema.safeParse(delivered).success).toBe(true);
    expect(delivered.pack_digest).not.toBe(delivered.source.legacy_artifact_sha256.slice(7));
    expect(delivered.pack_digest).not.toBe(delivered.approval.evidence_set_hash.slice(7));
    expect(delivered.source.legacy_artifact_sha256.slice(7)).not.toBe(delivered.approval.evidence_set_hash.slice(7));
  });

  it("does not permit publish/retry while source facts are partial or the RC is superseded", () => {
    expect(ResearchReleaseCandidatePublicationResponseSchema.safeParse({
      ...base,
      source: { ...base.source, availability: "PARTIAL", reason_code: "P22_SOURCE_FACTS_PARTIAL" },
    }).success).toBe(false);
    expect(ResearchReleaseCandidatePublicationResponseSchema.safeParse({
      ...base,
      candidate_relation: "SUPERSEDED",
    }).success).toBe(false);
    expect(ResearchReleaseCandidatePublicationResponseSchema.safeParse({
      ...base,
      candidate_relation: "UNKNOWN",
    }).success).toBe(false);
  });

  it("requires an immutable receipt after delivery and forbids an approval mirror when it is unavailable", () => {
    expect(ResearchReleaseCandidatePublicationResponseSchema.safeParse({
      ...base, state: "DELIVERED", may_publish: false, blocked_reason: "P22_ALREADY_DELIVERED",
    }).success).toBe(false);
    expect(ResearchReleaseCandidatePublicationResponseSchema.safeParse({
      ...base, approval_read: "UNAVAILABLE", approval,
    }).success).toBe(false);
  });
});
