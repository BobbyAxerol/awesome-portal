/**
 * V2 reader for the answers of `POST /api/v1/execution/governance/approvals` (`executionNewApprovalRequestV1`) (DEBT-UXM07-018).
 *
 * Oracle: `execution-governance-product.v1.schema.json#/$defs/ApprovalCreateResponse` (which holds `execution-governance-approval-workflow.v1`
 * `Approval`) for a created or replayed request, and `execution-governance.openapi.json#/components/schemas/Problem` for every other answer.
 *
 * `api/rows.ts readApprovalCreated` is the V1 reader of the same body. It is tolerant on purpose and V1 still uses it: no `schema_version`
 * check, an absent status read as PENDING, an absent label read as the id, `replayed` that is not a boolean read as "created". The New request
 * screen claims the contract, so it asks this module whether the body keeps the schema (`approvalCreateViolations`), and `httpApi` marks the
 * outcome it hands back when it does not. A marked outcome is "answered, not readable" (`model.readOutcome`): the request may exist, so it is
 * UNCERTAIN, never "created". `readApprovalCreateV1` is the strict reader the lookup (`approvalRequestLookup.ts`) uses for the replay body.
 *
 * Differences from the schema, counted in `request.conformance.test.ts` (S = stricter, X = looser):
 *   S-1  `subject_label` and `requester.username` are printed, so text with a control or a bidi-format character is refused (the schema
 *        states no pattern for them).
 *   X-2  the server also sends `details`, `public_copy_key` and `safe_next_action` in a problem body (`http-error.filter.ts`); the published
 *        `Problem` closes the object and lists none of them. They are tolerated in their own shape and never read. Schema issue for Codex.
 */
import type { ApprovalCreateOutcome } from "../../api/ports";
import { unsafeText } from "../../unsafeText";

export const APPROVAL_CREATE_SCHEMA = "governance.approval-create.v1";
export type CreatedOrReplayed = Extract<ApprovalCreateOutcome, { kind: "created" | "replayed" }>;

const IDENTIFIER = /^[A-Za-z0-9._:-]{1,191}$/;
const HASH = /^sha256:[0-9a-f]{64}$/;
const STATUSES = ["PENDING", "APPROVED", "APPROVED_WITH_CONDITION", "DENIED", "CHANGES_REQUESTED", "EXPIRED"] as const;
const APPROVAL_KEYS = [
  "approval_id", "gate", "subject_type", "subject_id", "subject_label", "release_candidate", "environment", "target_label", "requester", "creator",
  "status", "policy_version", "quorum_met", "quorum_required", "approval_version", "evidence_set_hash", "evidence_complete", "blocker_count",
  "blocker_summary", "sla_due_at", "expires_at", "created_at", "updated_at",
];
const ACTOR_KEYS = ["user_id", "username", "roles"];
const MAX_LISTED = 8;

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown, min: number, max: number): value is string => typeof value === "string" && value.length >= min && value.length <= max;
const integer = (value: unknown, min: number, max = Number.MAX_SAFE_INTEGER): value is number => typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;

function actor(value: unknown, at: string, out: string[]): void {
  if (!isObject(value)) return void out.push(`${at}: not an object`);
  for (const key of Object.keys(value)) if (!ACTOR_KEYS.includes(key)) out.push(`${at}.${key}: not allowed`);
  if (typeof value.user_id !== "string" || !IDENTIFIER.test(value.user_id)) out.push(`${at}.user_id: not an identifier`);
  if (!text(value.username, 1, 128) || unsafeText(value.username)) out.push(`${at}.username: not 1..128 printable characters`);
  if (Object.hasOwn(value, "roles")) {
    const roles = value.roles;
    if (!Array.isArray(roles) || roles.length !== 1 || (roles[0] !== "ADMIN" && roles[0] !== "USER")) out.push(`${at}.roles: not exactly one of ADMIN, USER`);
  }
}

function approval(value: unknown, out: string[]): void {
  const at = "approval";
  if (!isObject(value)) return void out.push(`${at}: not an object`);
  for (const key of Object.keys(value)) if (!APPROVAL_KEYS.includes(key)) out.push(`${at}.${key}: not allowed`);
  for (const key of APPROVAL_KEYS) if (!Object.hasOwn(value, key)) out.push(`${at}.${key}: required`);
  const has = (key: string) => Object.hasOwn(value, key);
  if (has("approval_id") && (typeof value.approval_id !== "string" || !IDENTIFIER.test(value.approval_id))) out.push(`${at}.approval_id: not an identifier`);
  if (has("gate") && value.gate !== "R1") out.push(`${at}.gate: not R1`);
  if (has("subject_type") && !text(value.subject_type, 1, 64)) out.push(`${at}.subject_type: not 1..64 characters`);
  if (has("subject_id") && (typeof value.subject_id !== "string" || !IDENTIFIER.test(value.subject_id))) out.push(`${at}.subject_id: not an identifier`);
  if (has("subject_label") && (!text(value.subject_label, 1, 512) || unsafeText(value.subject_label))) out.push(`${at}.subject_label: not 1..512 printable characters`);
  if (has("release_candidate") && value.release_candidate !== null && !text(value.release_candidate, 0, 256)) out.push(`${at}.release_candidate: not a string of at most 256 or null`);
  if (has("environment") && value.environment !== "RESEARCH") out.push(`${at}.environment: not RESEARCH`);
  if (has("target_label") && !text(value.target_label, 1, 256)) out.push(`${at}.target_label: not 1..256 characters`);
  if (has("requester")) actor(value.requester, `${at}.requester`, out);
  if (has("creator")) actor(value.creator, `${at}.creator`, out);
  if (has("status") && !(STATUSES as readonly unknown[]).includes(value.status)) out.push(`${at}.status: not a published word`);
  if (has("policy_version") && !text(value.policy_version, 1, 128)) out.push(`${at}.policy_version: not 1..128 characters`);
  if (has("quorum_met") && !integer(value.quorum_met, 0)) out.push(`${at}.quorum_met: not an integer of 0 or more`);
  if (has("quorum_required") && !integer(value.quorum_required, 1, 8)) out.push(`${at}.quorum_required: not an integer 1..8`);
  if (has("approval_version") && !integer(value.approval_version, 1)) out.push(`${at}.approval_version: not an integer of 1 or more`);
  if (has("evidence_set_hash") && (typeof value.evidence_set_hash !== "string" || !HASH.test(value.evidence_set_hash))) out.push(`${at}.evidence_set_hash: not a sha256 hash`);
  if (has("evidence_complete") && typeof value.evidence_complete !== "boolean") out.push(`${at}.evidence_complete: not a boolean`);
  if (has("blocker_count") && !integer(value.blocker_count, 0)) out.push(`${at}.blocker_count: not an integer of 0 or more`);
  if (has("blocker_summary") && value.blocker_summary !== null && !text(value.blocker_summary, 0, 2000)) out.push(`${at}.blocker_summary: not a string of at most 2000 or null`);
  if (has("sla_due_at") && typeof value.sla_due_at !== "string") out.push(`${at}.sla_due_at: not a timestamp`);
  for (const key of ["expires_at", "created_at", "updated_at"]) if (has(key) && typeof value[key] !== "string") out.push(`${at}.${key}: not a timestamp`);
}

/** Where a 2xx body of the create route breaks `ApprovalCreateResponse`; empty = it keeps it. */
export function approvalCreateViolations(raw: unknown): readonly string[] {
  const out: string[] = [];
  if (!isObject(raw)) return ["root: not an object"];
  for (const key of Object.keys(raw)) if (!["schema_version", "replayed", "approval"].includes(key)) out.push(`${key}: not allowed`);
  for (const key of ["schema_version", "replayed", "approval"]) if (!Object.hasOwn(raw, key)) out.push(`${key}: required`);
  if (Object.hasOwn(raw, "schema_version") && raw.schema_version !== APPROVAL_CREATE_SCHEMA) out.push("schema_version: not governance.approval-create.v1");
  if (Object.hasOwn(raw, "replayed") && typeof raw.replayed !== "boolean") out.push("replayed: not a boolean");
  if (Object.hasOwn(raw, "approval")) approval(raw.approval, out);
  return out.slice(0, MAX_LISTED);
}

/** The strict reader: the same outcome `readApprovalCreated` gives, from a body that keeps the schema; `null` for any other. */
export function readApprovalCreateV1(raw: unknown): CreatedOrReplayed | null {
  if (approvalCreateViolations(raw).length > 0) return null;
  const root = raw as Json;
  const a = root.approval as Json;
  return {
    kind: root.replayed === true ? "replayed" : "created",
    approvalId: a.approval_id as string,
    subjectLabel: a.subject_label as string,
    status: a.status as string,
    slaDueAt: a.sla_due_at as string,
    policyVersion: a.policy_version as string,
    quorumRequired: a.quorum_required as number,
    requester: (a.requester as Json).username as string,
  };
}

/** The problem members the server sends beyond the published `Problem` (X-2). */
export const PROBLEM_UNPUBLISHED_MEMBERS = ["details", "public_copy_key", "safe_next_action"] as const;

/** Where a non-2xx body breaks `Problem` (X-2 members set aside); empty = it is a typed problem and its `error.code` may be acted on. */
export function problemViolations(raw: unknown): readonly string[] {
  const out: string[] = [];
  if (!isObject(raw)) return ["root: not an object"];
  for (const key of Object.keys(raw)) if (!["error", "request_id"].includes(key) && !(PROBLEM_UNPUBLISHED_MEMBERS as readonly string[]).includes(key)) out.push(`${key}: not allowed`);
  for (const key of ["error", "request_id"]) if (!Object.hasOwn(raw, key)) out.push(`${key}: required`);
  if (Object.hasOwn(raw, "request_id") && !text(raw.request_id, 1, 128)) out.push("request_id: not 1..128 characters");
  if (Object.hasOwn(raw, "error")) {
    const error = raw.error;
    if (!isObject(error)) out.push("error: not an object");
    else {
      for (const key of Object.keys(error)) if (key !== "code" && key !== "message") out.push(`error.${key}: not allowed`);
      if (!text(error.code, 1, 128)) out.push("error.code: not 1..128 characters");
      if (!text(error.message, 1, 512)) out.push("error.message: not 1..512 characters");
    }
  }
  if (Object.hasOwn(raw, "details") && !isObject(raw.details)) out.push("details: not an object");
  for (const key of ["public_copy_key", "safe_next_action"]) if (Object.hasOwn(raw, key) && !text(raw[key], 1, 256)) out.push(`${key}: not 1..256 characters`);
  return out.slice(0, MAX_LISTED);
}
