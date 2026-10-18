import { z } from "zod";
import type { RawPositiveParent } from "./positive-parent.repository";

const id = z.string().min(1).max(191).regex(/^[A-Za-z0-9._:-]+$/)
  .refine(value => !/[^A-Za-z0-9._:-]/u.test(value));
const hash = z.string().regex(/^sha256:[0-9a-f]{64}$/)
  .refine(value => !/[^a-z0-9:]/u.test(value));
const version = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const ms = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const absent = z.object({ availability: z.literal("NOT_PUBLISHED"),
  reason_code: z.literal("PARENT_FIELD_PURPOSE_NOT_QUALIFIED") }).strict();
const actorFacts = z.object({ availability: z.literal("AVAILABLE"),
  basis: z.literal("STORED_PORTAL_ACTOR_IDS_NOT_DECISION_AUTHORIZATION"),
  requester_user_id: id, artifact_creator_user_id: id, decided_by_user_id: id.nullable(),
  viewer_is_requester: z.boolean(), viewer_is_artifact_creator: z.boolean(),
  viewer_is_decided_by: z.boolean().nullable(),
}).strict().refine(value => (value.decided_by_user_id === null) === (value.viewer_is_decided_by === null),
  "PARENT_ACTOR_NULL_MISMATCH");
export const parentActorSection = z.union([actorFacts, absent]);
export const latestPortalOperationSection = z.union([
  z.object({ availability: z.literal("AVAILABLE"),
    basis: z.literal("LATEST_RECORDED_PORTAL_PLAN_NOT_ACTION_ELIGIBILITY"),
    operation_id: id, command_version: z.literal(1),
    command_type: z.enum(["GOVERNANCE_R2_DECISION", "GOVERNANCE_PAPER_EXIT_DECISION"]),
    stored_status: z.enum(["PLANNED", "APPLIED", "EXPIRED"]), created_at_ms: ms,
    order_basis: z.literal("POSTGRES_CREATED_AT_DESC_OPERATION_ID_C_ASC"),
  }).strict(), absent,
  z.object({ availability: z.literal("NOT_PUBLISHED"), reason_code:
    z.enum(["NO_RECORDED_PORTAL_OPERATION", "LATEST_RECORDED_OPERATION_NOT_PUBLIC"]) }).strict(),
]);
const evidenceHashes = z.union([
  z.object({ availability: z.literal("AVAILABLE"), value: z.array(hash).max(128), reason_code: z.null() }).strict()
    .refine(value => value.value.every((item, index) => index === 0 || value.value[index - 1]! < item),
      "DECISION_HASHES_NOT_UNIQUE_SORTED"),
  z.object({ availability: z.literal("NOT_PUBLISHED"), value: z.null(),
    reason_code: z.literal("EVIDENCE_HASH_LIMIT_EXCEEDED") }).strict(),
]);
/** Stored request inputs, deliberately NOT the old READY/BLOCKED admission
 * schema: current .decide, role/SoD/quorum/R1/plan rules remain at actual plan. */
export const r2StoredDecisionContextSection = z.union([
  z.object({ availability: z.literal("AVAILABLE"),
    basis: z.literal("VERIFIED_STORED_R2_INPUTS_NOT_ACTION_AUTHORIZATION"),
    gate: z.literal("R2"), workspace_id: z.string().refine(value => [...value].length >= 3 && [...value].length <= 96), approval_id: id,
    expected_approval_version: version, evidence_set_hash: hash, evidence_hashes: evidenceHashes,
    command_type: z.literal("GOVERNANCE_R2_DECISION"),
    request_schema_version: z.literal("governance.r2-decision-plan-request.v1"),
    plan_path: z.literal("/api/v1/execution/commands/plans"),
    admission: z.object({ state: z.literal("NOT_EVALUATED"),
      reason_code: z.literal("CURRENT_DECISION_ADMISSION_REQUIRES_PLAN") }).strict(),
    source_side_effect_requested: z.literal(false),
  }).strict(), absent,
]);
export interface ParentFollowthroughSections { actors?: boolean; latestOperation?: boolean; decisionContext?: boolean; }
const missing = () => ({ availability: "NOT_PUBLISHED", reason_code: "PARENT_FIELD_PURPOSE_NOT_QUALIFIED" } as const);
function at(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(value))
    throw new Error("PARENT_TIMESTAMP_INVALID");
  const result = Date.parse(value);
  if (!Number.isSafeInteger(result) || result < 0) throw new Error("PARENT_TIMESTAMP_INVALID");
  return result;
}
export function parentFollowthrough(raw: RawPositiveParent, sections: ParentFollowthroughSections, viewer?: string) {
  let actors: z.infer<typeof parentActorSection> = missing();
  if (sections.actors) {
    const actor = raw.actors;
    if (!actor || !id.safeParse(viewer).success) throw new Error("PARENT_ACTORS_NOT_LOADED");
    actors = parentActorSection.parse({ availability: "AVAILABLE",
      basis: "STORED_PORTAL_ACTOR_IDS_NOT_DECISION_AUTHORIZATION", ...actor,
      viewer_is_requester: viewer === actor.requester_user_id,
      viewer_is_artifact_creator: viewer === actor.artifact_creator_user_id,
      viewer_is_decided_by: actor.decided_by_user_id === null ? null : viewer === actor.decided_by_user_id });
  }
  let latest_operation: z.infer<typeof latestPortalOperationSection> = missing();
  if (sections.latestOperation) {
    const latest = raw.latestOperation;
    if (!latest) throw new Error("PARENT_LATEST_OPERATION_NOT_LOADED");
    latest_operation = latest.state === "AVAILABLE" ? latestPortalOperationSection.parse({ availability: "AVAILABLE",
      basis: "LATEST_RECORDED_PORTAL_PLAN_NOT_ACTION_ELIGIBILITY", operation_id: latest.operation_id,
      command_version: 1, command_type: latest.command_type, stored_status: latest.status,
      created_at_ms: at(latest.created_at), order_basis: "POSTGRES_CREATED_AT_DESC_OPERATION_ID_C_ASC" })
      : { availability: "NOT_PUBLISHED", reason_code: latest.state === "EMPTY"
        ? "NO_RECORDED_PORTAL_OPERATION" : "LATEST_RECORDED_OPERATION_NOT_PUBLIC" };
  }
  let decision_context: z.infer<typeof r2StoredDecisionContextSection> = missing();
  if (sections.decisionContext) {
    if (raw.identity.family !== "R2") throw new Error("PARENT_DECISION_CONTEXT_FAMILY_INVALID");
    const hashes = [...new Set(raw.evidence.map(row => row.sha256))].sort();
    decision_context = r2StoredDecisionContextSection.parse({ availability: "AVAILABLE",
      basis: "VERIFIED_STORED_R2_INPUTS_NOT_ACTION_AUTHORIZATION", gate: "R2",
      workspace_id: raw.identity.workspaceId, approval_id: raw.identity.approvalId,
      expected_approval_version: raw.approval.approval_version, evidence_set_hash: raw.approval.evidence_set_hash,
      evidence_hashes: hashes.length <= 128 ? { availability: "AVAILABLE", value: hashes, reason_code: null }
        : { availability: "NOT_PUBLISHED", value: null, reason_code: "EVIDENCE_HASH_LIMIT_EXCEEDED" },
      command_type: "GOVERNANCE_R2_DECISION", request_schema_version: "governance.r2-decision-plan-request.v1",
      plan_path: "/api/v1/execution/commands/plans",
      admission: { state: "NOT_EVALUATED", reason_code: "CURRENT_DECISION_ADMISSION_REQUIRES_PLAN" },
      source_side_effect_requested: false });
  }
  return { actors, latest_operation, decision_context };
}
