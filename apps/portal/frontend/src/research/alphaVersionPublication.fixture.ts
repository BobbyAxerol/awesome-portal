/**
 * FG-05 test builders for the P22 alpha-version publication lookup
 * (`research.release-candidate-publication.v1` / `AlphaVersionPublicationResponse`).
 * Shapes follow `packages/contracts/generated/research-release-candidate-publication.d.ts`;
 * values are test values, never a claim about a real candidate.
 */
import type { AlphaVersionPublication, AlphaVersionPublicationRecord } from "./alphaVersionPublication";

export const LOOKUP_AS_OF = 1_790_330_000_000;
export const LOOKUP_PUBLISHED_AT = 1_790_323_700_000;
export const LOOKUP_SERVER_PROSE = "SERVER-PROSE-SENTINEL lookup owned by alice@example";

type Approval = NonNullable<AlphaVersionPublicationRecord["approval"]>;

export function lookupRecord(
  releaseCandidateId: string,
  alphaVersionId: string,
  overrides: Partial<AlphaVersionPublicationRecord> = {},
  approval: Partial<Approval> = {},
): AlphaVersionPublicationRecord {
  return {
    schema_version: "research.release-candidate-publication.v1",
    release_candidate_id: releaseCandidateId,
    run_id: "rrun_lookup_fixture",
    alpha_id: "delta-rsi-polynomial-alpha",
    alpha_version_id: alphaVersionId,
    pack_digest: "5".repeat(64),
    source: {
      availability: "AVAILABLE",
      reason_code: null,
      run_status: "COMPLETED",
      legacy_artifact_sha256: `sha256:${"b".repeat(64)}`,
      artifact_schema_version: "quantbt.selected-params.v1",
      eligible_methodology_claim_ids: ["mclaim_delta_oos"],
      captured_at: "2026-09-25T10:00:00.000Z",
    },
    state: "DELIVERED",
    candidate_relation: "CURRENT",
    may_publish: false,
    blocked_reason: "P22_ALREADY_DELIVERED",
    published: {
      by_user_id: "usr_researcher",
      by_username: "researcher@bobby",
      approval_id: "apr_lookup",
      at_utc_ms: LOOKUP_PUBLISHED_AT,
      receipt_digest: "d".repeat(64),
    },
    approval_read: "AVAILABLE",
    approval: {
      approval_id: "apr_lookup",
      gate: "R1",
      status: "PENDING",
      subject_id: "delta-rsi-polynomial-alpha",
      requester_user_id: "usr_researcher",
      evidence_set_hash: `sha256:${"c".repeat(64)}`,
      sla_due_at: "2026-09-27T09:12:00.000Z",
      expires_at: "2026-12-25T09:12:00.000Z",
      created_at: "2026-09-26T09:12:00.000Z",
      read_at: "2026-09-26T09:13:00.000Z",
      conditions: [],
      href: "/governance/approvals/apr_lookup/r1",
      assignee_pool_availability: { state: "NOT_PUBLISHED", reason_code: "P22_GOVERNANCE_ASSIGNEE_POOL_NOT_PUBLISHED" },
      ...approval,
    },
    as_of_utc_ms: LOOKUP_AS_OF,
    replayed: false,
    ...overrides,
  };
}

export function lookupFound(record: AlphaVersionPublicationRecord): AlphaVersionPublication {
  return {
    schema_version: "research.alpha-version-publication.v1",
    alpha_version_id: record.alpha_version_id,
    availability: "AVAILABLE",
    reason_code: null,
    publication: record,
    as_of_utc_ms: LOOKUP_AS_OF,
  };
}

/** The control-api's typed absence (`release-candidate-publication.service.ts`: `P22_ALPHA_VERSION_PUBLICATION_NOT_PUBLISHED`). */
export function lookupAbsent(alphaVersionId: string, reasonCode = "P22_ALPHA_VERSION_PUBLICATION_NOT_PUBLISHED"): AlphaVersionPublication {
  return {
    schema_version: "research.alpha-version-publication.v1",
    alpha_version_id: alphaVersionId,
    availability: "NOT_PUBLISHED",
    reason_code: reasonCode,
    publication: null,
    as_of_utc_ms: LOOKUP_AS_OF,
  };
}

export const lookupProblem = (status: number, code: string) => ({ error: { code, message: LOOKUP_SERVER_PROSE }, request_id: `req_lookup_${status}` });
