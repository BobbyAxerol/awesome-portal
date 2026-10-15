import { z } from "zod";
import { PORTAL_CAPABILITIES } from "../repos/owner-access";
import { executionEnvironment, utcMilliseconds } from "./foundation.contract";
// JSON Schema maxLength counts code points, not UTF-16 code units.
const opaqueRevision=z.string().min(1).refine(value=>[...value].length<=256,"REVISION_TOO_LONG");

/** Finite vocabulary. Adding V2 actions never widens the legacy ten-action CHECK. */
export const ACCESS_ACTIONS = [...PORTAL_CAPABILITIES,
  "profile.read_self", "profile.update_self", "users.read", "users.create", "users.manage_status", "sessions.revoke",
  "access.read", "access.preview", "access.propose", "access.grant", "access.revoke",
  "alpha.read", "alpha.metadata.edit", "alpha.owner.propose", "business.read_all",
  "portfolio.discover_linked", "portfolio.read_restricted", "portfolio.read", "portfolio.manage", "membership.propose",
  "account.read", "binding.read", "binding.change.propose", "capital.preview", "capital.fund", "capital.return_capital",
  "capital.initial_grant", "capital.top_up", "capital.immediate_decrease", "capital.recall_partial", "capital.recall_full",
  "capital.adjust_target_budget", "capital.set_root_limit", "deployment.register", "deployment.activate",
  "deployment.assignment.propose", "safety.halt", "safety.reducing", "safety.resume", "audit.read", "report.export",
  "stream.subscribe", "maintenance.read", "maintenance.execute", "development.read", "development.execute", "owner.recovery",
] as const;
export const accessAction = z.enum(ACCESS_ACTIONS);
export type AccessAction = z.infer<typeof accessAction>;
export const accessText = z.string().min(1).regex(/^[^\u0000-\u001f\u007f]+$/u)
  .refine(value=>[...value].length<=256,"TEXT_TOO_LONG");
export const resourceKind = z.enum(["ROOT", "PORTFOLIO", "ALPHA", "ALPHA_VERSION", "DEPLOYMENT", "ACCOUNT", "BINDING", "USER"]);
export const accessResource = z.object({ kind: resourceKind, id: accessText }).strict();
export type AccessResource = z.infer<typeof accessResource>;
const ids = z.array(accessText).min(1).max(200).refine(v => new Set(v).size === v.length, "DUPLICATE_RESOURCE");
export const resourceSelector = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("EXPLICIT_RESOURCE_SET"), resource_kind: resourceKind, ids }).strict(),
  z.object({ kind: z.literal("OWN_ALPHA") }).strict(),
  z.object({ kind: z.literal("PORTFOLIO_MEMBERSHIP"), portfolio_ids: ids }).strict(),
  z.object({ kind: z.literal("ROOT_SCOPE"), root_id: accessText }).strict(),
]);
export type ResourceSelector = z.infer<typeof resourceSelector>;
const environments = z.array(executionEnvironment).min(1).max(3).refine(v => new Set(v).size === v.length, "DUPLICATE_ENVIRONMENT");
const actionSet = z.array(accessAction).max(ACCESS_ACTIONS.length).refine(v => new Set(v).size === v.length, "DUPLICATE_ACTION");
const accessReason = z.string().min(1).regex(/^[^\u0000-\u001f\u007f]+$/u)
  .refine(value=>[...value].length<=512,"TEXT_TOO_LONG");
export const grantChange = z.object({
  subject_user_id: accessText, action: accessAction, effect: z.enum(["ALLOW", "DENY"]),
  selector: resourceSelector, environments, valid_from_ms: utcMilliseconds,
  valid_until_ms: utcMilliseconds.nullable(), delegable_actions: actionSet,
  ceiling_grant_id: accessText, expected_ceiling_revision: opaqueRevision,
  expected_policy_revision: opaqueRevision, expected_ts_membership_revision: opaqueRevision.nullable(),
  reason: accessReason,
}).strict().refine(v => v.valid_until_ms === null || v.valid_until_ms > v.valid_from_ms, "INVALID_INTERVAL")
  .refine(v => v.action === "access.grant" || v.delegable_actions.length === 0, "ONWARD_DELEGATION_REQUIRES_ACCESS_GRANT");
export type GrantChange = z.infer<typeof grantChange>;
export const accessWorkspaceQuery = z.object({ workspace_id: accessText }).strict();
export const accessRevoke = z.object({ workspace_id: accessText, expected_policy_revision: opaqueRevision,
  expected_grant_revision: opaqueRevision, reason: accessReason }).strict();
export const accessProposal = z.object({ workspace_id: accessText, change: grantChange,
  preview_digest: z.string().regex(/^sha256:[0-9a-f]{64}$/) }).strict();
export const accessPreview = z.object({ workspace_id: accessText, change: grantChange }).strict();
export const accessAuditQuery = z.object({ workspace_id: accessText, subject_user_id: accessText,
  limit: z.coerce.number().int().min(1).max(100).default(25), after: z.string().min(1).max(2048).optional() }).strict();

/** Stored/effective facts are server inputs, never accepted as a browser grant. */
export interface ScopedAccessGrant {
  grant_id: string;
  subject_user_id: string;
  workspace_id: string;
  action: AccessAction;
  effect: "ALLOW" | "DENY";
  selector: ResourceSelector;
  environments: ("paper" | "sandbox" | "live")[];
  valid_from_ms: number;
  valid_until_ms: number | null;
  delegable_actions: AccessAction[];
  issued_by: string;
  parent_grant_id: string | null;
  revision: string;
  policy_revision: string;
  revoked_at_ms: number | null;
  requires_ts_acceptance: boolean;
  ts_receipt: null | { receipt_id: string; membership_revision: string; mapping_revision: string;
    effective_at_ms: number; expires_at_ms: number | null };
  field_policy_ref: string | null;
}

export interface ReviewedAccessPolicy {
  workspace_id: string;
  revision: string;
  artifact_digest: string;
  approval_ref: string;
  state: "REVIEWED" | "PENDING";
  qualification: "OWNER_VERIFIED" | "TEST_ONLY" | "UNQUALIFIED";
  protected_owner_user_id: string;
  researcher_fields: { state: "PENDING" | "QUALIFIED"; policy_ref: string | null; fields: string[] };
}

export interface AccessActor {
  user_id: string;
  session_id: string;
  session_generation: number;
}
export type AccessRefusal = "POLICY_PENDING" | "CURRENT_ACTOR_AUTHORITY_REQUIRED" | "ACCESS_DENIED" |
  "DELEGATION_CEILING_EXCEEDED" | "SELF_PRIVILEGE_CHANGE_DENIED" | "PROTECTED_OWNER_CHANGE_DENIED" |
  "OWNER_RECOVERY_NOT_APPROVED" | "POLICY_REVISION_CONFLICT" | "GRANT_REVISION_CONFLICT" |
  "TS_MEMBERSHIP_NOT_ACCEPTED" | "TS_MEMBERSHIP_REVISION_CONFLICT" | "SOURCE_RELATION_NOT_QUALIFIED" |
  "RESEARCHER_FIELD_POLICY_PENDING" | "IDEMPOTENCY_KEY_PAYLOAD_CONFLICT" | "RECEIPT_NOT_QUALIFIED" |
  "RECEIPT_BINDING_MISMATCH" | "RECEIPT_REVISION_CONFLICT" | "RECEIPT_PAYLOAD_CONFLICT" |
  "STEP_UP_REQUIRED" | "STEP_UP_REJECTED" | "ACCESS_RESOURCE_NOT_FOUND" | "ACCESS_RETRY_REQUIRED" |
  "ACCESS_SCOPE_LIMIT_EXCEEDED" | "ACCESS_CURSOR_INVALID";
export class AccessPolicyError extends Error {
  constructor(readonly code: AccessRefusal, readonly status = 403) { super("The requested access is not available."); }
}

/** Qualified adapter result, not a claim that the current TS wire publishes it. */
export interface TsMembershipAcceptance {
  source: string; source_contract: string; trust_profile: string; receipt_id: string;
  proposal_id: string; proposal_digest: string; portal_user_id: string; ts_user_id: string;
  mapping_revision: string; human_requester_user_id: string; workspace_id: string;
  action: AccessAction; selector_digest: string; environments: ("paper" | "sandbox" | "live")[];
  previous_membership_revision: string | null; membership_revision: string;
  effective_at_ms: number; expires_at_ms: number | null;
  outcome: "ACCEPTED" | "REJECTED" | "UNKNOWN";
  payload_digest: string; provenance_ref: string;
}

export const tsBusinessAction = (action: AccessAction): boolean =>
  /^(?:alpha\.|business\.|portfolio\.|membership\.|account\.|binding\.|capital\.|deployment\.|safety\.)/.test(action);

const digest=z.string().regex(/^sha256:[0-9a-f]{64}$/);
export const scopedAccessGrant=z.object({grant_id:accessText,subject_user_id:accessText,workspace_id:accessText,
  action:accessAction,effect:z.enum(["ALLOW","DENY"]),selector:resourceSelector,environments,
  valid_from_ms:utcMilliseconds,valid_until_ms:utcMilliseconds.nullable(),delegable_actions:actionSet,
  issued_by:accessText,parent_grant_id:accessText.nullable(),revision:opaqueRevision,policy_revision:opaqueRevision,
  revoked_at_ms:utcMilliseconds.nullable(),requires_ts_acceptance:z.boolean(),
  ts_receipt:z.object({receipt_id:accessText,membership_revision:opaqueRevision,mapping_revision:opaqueRevision,
    effective_at_ms:utcMilliseconds,expires_at_ms:utcMilliseconds.nullable()}).strict().nullable(),field_policy_ref:accessText.nullable(),
}).strict().refine(v=>v.valid_until_ms===null||v.valid_until_ms>v.valid_from_ms,"INVALID_INTERVAL")
  .refine(v=>v.action==="access.grant"||v.delegable_actions.length===0,"INVALID_ONWARD_ACTIONS");
export const reviewedAccessPolicy=z.object({workspace_id:accessText,revision:opaqueRevision,artifact_digest:digest,
  approval_ref:accessText,state:z.enum(["REVIEWED","PENDING"]),qualification:z.enum(["OWNER_VERIFIED","TEST_ONLY","UNQUALIFIED"]),
  protected_owner_user_id:accessText,researcher_fields:z.object({state:z.enum(["PENDING","QUALIFIED"]),policy_ref:accessText.nullable(),
    fields:z.array(accessText).max(256)}).strict()}).strict();
export const tsMembershipAcceptance=z.object({source:accessText,source_contract:accessText,trust_profile:accessText,receipt_id:accessText,
  proposal_id:accessText,proposal_digest:digest,portal_user_id:accessText,ts_user_id:accessText,mapping_revision:opaqueRevision,
  human_requester_user_id:accessText,workspace_id:accessText,action:accessAction,selector_digest:digest,environments,
  previous_membership_revision:opaqueRevision.nullable(),membership_revision:opaqueRevision,effective_at_ms:utcMilliseconds,
  expires_at_ms:utcMilliseconds.nullable(),outcome:z.enum(["ACCEPTED","REJECTED","UNKNOWN"]),payload_digest:digest,provenance_ref:accessText,
}).strict();
