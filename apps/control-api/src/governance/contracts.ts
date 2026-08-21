import { QueryResultRow } from "pg";
import { z } from "zod";
import { PortalUser } from "../domain";
import { PostgresListResource, RawFilterInput, RawKeysetQuery } from "../query";

export const APPROVAL_GATES = ["R1", "R2", "PAPER_EXIT", "SANDBOX_EXIT", "LIVE_GATE"] as const;
export const APPROVAL_STATUSES = [
  "PENDING",
  "APPROVED",
  "APPROVED_WITH_CONDITION",
  "DENIED",
  "EXPIRED",
] as const;
export const APPROVAL_ENVIRONMENTS = ["RESEARCH", "PAPER", "SANDBOX", "LIVE"] as const;
export const SLA_STATES = ["ON_TRACK", "DUE_SOON", "OVERDUE", "EXPIRED"] as const;
export const R1_DECISIONS = ["APPROVE", "APPROVE_WITH_CONDITION", "DENY"] as const;

export type ApprovalGate = (typeof APPROVAL_GATES)[number];
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];
export type ApprovalEnvironment = (typeof APPROVAL_ENVIRONMENTS)[number];
export type SlaState = (typeof SLA_STATES)[number];
export type R1Decision = (typeof R1_DECISIONS)[number];

export interface GovernanceRequestState {
  portalUser: PortalUser;
  portalWorkspaceId: string;
  portalSession: {
    sessionId: string;
    csrfSecretHash: string;
  };
}

export interface ApprovalInboxRow extends QueryResultRow {
  approval_id: string;
  workspace_id: string;
  gate: ApprovalGate;
  subject_id: string;
  subject_label: string;
  release_candidate: string | null;
  environment: ApprovalEnvironment;
  target_label: string;
  requester_user_id: string;
  requester_username: string;
  artifact_creator_user_id: string;
  artifact_creator_username: string;
  status: ApprovalStatus;
  effective_status: ApprovalStatus;
  policy_version: string;
  quorum_required: number;
  quorum_met: number;
  decision_actor_ids: string[];
  approval_version: number;
  evidence_set_hash: string;
  evidence_complete: boolean;
  blocker_count: number;
  blocker_summary: string | null;
  sla_due_at: Date;
  expires_at: Date;
  created_at: Date;
  updated_at: Date;
  sla_state: SlaState;
}

export interface ApprovalInboxItem {
  id: string;
  gate: ApprovalGate;
  subject: string;
  subject_id: string;
  release_candidate: string | null;
  target: string;
  environment: ApprovalEnvironment;
  requester: { user_id: string; username: string };
  creator: { user_id: string; username: string };
  status: ApprovalStatus;
  policy_version: string;
  approval_version: number;
  evidence_set_hash: string;
  evidence_complete: boolean;
  blocker_count: number;
  blocker_summary: string | null;
  sla: {
    state: SlaState;
    age_minutes: number;
    budget_minutes: number;
    due_at: string;
    expires_at: string;
  };
  quorum_met: number;
  quorum_required: number;
  inert: "SELF" | "QUORUM" | "BLOCKED" | null;
  needs_you: boolean;
  record_authority: "PORTAL";
  updated_at: string;
}

function ageMinutes(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.valueOf() - from.valueOf()) / 60_000));
}

export function approvalInboxResource(
  actor: PortalUser,
  now = new Date(),
): PostgresListResource<ApprovalInboxRow, ApprovalInboxItem> {
  return {
    resourceId: "governance.approvals",
    table: "governance_approval_inbox",
    selectColumns: [
      "approval_id",
      "workspace_id",
      "gate",
      "subject_id",
      "subject_label",
      "release_candidate",
      "environment",
      "target_label",
      "requester_user_id",
      "requester_username",
      "artifact_creator_user_id",
      "artifact_creator_username",
      "status",
      "effective_status",
      "policy_version",
      "quorum_required",
      "quorum_met",
      "decision_actor_ids",
      "approval_version",
      "evidence_set_hash",
      "evidence_complete",
      "blocker_count",
      "blocker_summary",
      "sla_due_at",
      "expires_at",
      "created_at",
      "updated_at",
      "sla_state",
    ],
    workspaceColumn: "workspace_id",
    idSortField: "approval_id",
    filters: {
      status: {
        column: "effective_status",
        kind: "enum",
        operators: ["eq", "in"],
        enumValues: APPROVAL_STATUSES,
      },
      gate: {
        column: "gate",
        kind: "enum",
        operators: ["eq", "in"],
        enumValues: APPROVAL_GATES,
      },
      environment: {
        column: "environment",
        kind: "enum",
        operators: ["eq", "in"],
        enumValues: APPROVAL_ENVIRONMENTS,
      },
      requester: {
        column: "requester_username",
        kind: "text",
        operators: ["eq", "contains"],
        maxLength: 64,
      },
      subject: {
        column: "subject_label",
        kind: "text",
        operators: ["eq", "contains"],
        maxLength: 160,
      },
      evidence_complete: {
        column: "evidence_complete",
        kind: "boolean",
        operators: ["eq"],
      },
      sla_state: {
        column: "sla_state",
        kind: "enum",
        operators: ["eq", "in"],
        enumValues: SLA_STATES,
      },
      sla_due_at: {
        column: "sla_due_at",
        kind: "timestamp",
        operators: ["gte", "lte"],
      },
    },
    sorts: {
      sla_due_at: { column: "sla_due_at", kind: "timestamp" },
      created_at: { column: "created_at", kind: "timestamp" },
      updated_at: { column: "updated_at", kind: "timestamp" },
      requester: { column: "requester_username", kind: "text" },
      approval_id: { column: "approval_id", kind: "text" },
    },
    defaultSort: [{ field: "sla_due_at", direction: "asc" }],
    allowedRoles: ["ADMIN", "USER"],
    statementTimeoutMs: 2_000,
    mapRow: (row) => {
      const self =
        row.requester_user_id === actor.userId || row.artifact_creator_user_id === actor.userId;
      const alreadyDecided = row.decision_actor_ids.includes(actor.userId);
      const blocked = row.blocker_count > 0 || !row.evidence_complete;
      const inert = self ? "SELF" : alreadyDecided ? "QUORUM" : blocked ? "BLOCKED" : null;
      return {
        id: row.approval_id,
        gate: row.gate,
        subject: row.subject_label,
        subject_id: row.subject_id,
        release_candidate: row.release_candidate,
        target: `${row.environment.toLowerCase()} · ${row.target_label}`,
        environment: row.environment,
        requester: { user_id: row.requester_user_id, username: row.requester_username },
        creator: {
          user_id: row.artifact_creator_user_id,
          username: row.artifact_creator_username,
        },
        status: row.effective_status,
        policy_version: row.policy_version,
        approval_version: row.approval_version,
        evidence_set_hash: row.evidence_set_hash,
        evidence_complete: row.evidence_complete,
        blocker_count: row.blocker_count,
        blocker_summary: row.blocker_summary,
        sla: {
          state: row.sla_state,
          age_minutes: ageMinutes(row.created_at, now),
          budget_minutes: ageMinutes(row.created_at, row.sla_due_at),
          due_at: row.sla_due_at.toISOString(),
          expires_at: row.expires_at.toISOString(),
        },
        quorum_met: row.quorum_met,
        quorum_required: row.quorum_required,
        inert,
        needs_you:
          actor.role === "ADMIN" && row.status === "PENDING" && row.expires_at > now && inert === null,
        record_authority: "PORTAL",
        updated_at: row.updated_at.toISOString(),
      };
    },
  };
}

const RequestKey = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/);
const EvidenceHash = z.string().regex(/^sha256:[0-9a-f]{64}$/);

export const DecisionPlanRequestSchema = z
  .object({
    schema_version: z.literal("governance.r1-decision-plan-request.v1"),
    workspace_id: z.string().min(3).max(96),
    request_key: RequestKey,
    command_type: z.literal("GOVERNANCE_R1_DECISION"),
    command_version: z.literal(1),
    target: z.object({ approval_id: z.string().min(3).max(96) }).strict(),
    expected_approval_version: z.number().int().positive(),
    payload: z
      .object({
        decision: z.enum(R1_DECISIONS),
        reason: z.string().trim().min(8).max(2000),
        condition: z.string().trim().min(8).max(2000).nullable().optional(),
        evidence_hashes: z.array(EvidenceHash).max(128),
      })
      .strict(),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.payload.decision === "APPROVE_WITH_CONDITION" && !input.payload.condition) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["payload", "condition"],
        message: "approve-with-condition requires a condition",
      });
    }
    if (input.payload.decision !== "APPROVE_WITH_CONDITION" && input.payload.condition) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["payload", "condition"],
        message: "condition is only valid for approve-with-condition",
      });
    }
  });

export const ApplyOperationRequestSchema = z
  .object({
    schema_version: z.literal("governance.r1-decision-apply-request.v1"),
    workspace_id: z.string().min(3).max(96),
    apply_token: z.string().regex(/^gat1\.[A-Za-z0-9_-]{1,32}\.[A-Za-z0-9_-]{3,96}\.[A-Za-z0-9_-]{43}$/),
  })
  .strict();

function inFilter(field: string, raw: unknown): RawFilterInput | null {
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw !== "string") return { field, op: "invalid", value: raw };
  const values = raw.split(",").map((value) => value.trim()).filter(Boolean);
  return {
    field,
    op: values.length > 1 ? "in" : "eq",
    value: values.length > 1 ? values : values[0],
  };
}

export function approvalListQuery(raw: Record<string, unknown>): RawKeysetQuery {
  const filters: RawFilterInput[] = [];
  const view = typeof raw.view === "string" ? raw.view : "INBOX";
  const viewFilter: Record<string, RawFilterInput[]> = {
    INBOX: [{ field: "status", op: "eq", value: "PENDING" }],
    ALL: [],
    R1: [
      { field: "status", op: "eq", value: "PENDING" },
      { field: "gate", op: "eq", value: "R1" },
    ],
    PAPER: [
      { field: "status", op: "eq", value: "PENDING" },
      { field: "environment", op: "eq", value: "PAPER" },
    ],
    SANDBOX: [
      { field: "status", op: "eq", value: "PENDING" },
      { field: "environment", op: "eq", value: "SANDBOX" },
    ],
    LIVE_GATES: [
      { field: "status", op: "eq", value: "PENDING" },
      { field: "gate", op: "eq", value: "LIVE_GATE" },
    ],
    EXIT_REVIEWS: [
      { field: "status", op: "eq", value: "PENDING" },
      { field: "gate", op: "in", value: ["PAPER_EXIT", "SANDBOX_EXIT"] },
    ],
    OVERDUE: [
      { field: "status", op: "eq", value: "PENDING" },
      { field: "sla_state", op: "eq", value: "OVERDUE" },
    ],
  };
  if (!(view in viewFilter)) {
    filters.push({ field: "view", op: "invalid", value: view });
  } else {
    filters.push(...viewFilter[view]);
  }
  for (const [field, value] of [
    ["status", raw.status],
    ["gate", raw.gate],
    ["environment", raw.environment],
    ["sla_state", raw.sla_state],
  ] as const) {
    const parsed = inFilter(field, value);
    if (parsed) filters.push(parsed);
  }
  if (raw.requester !== undefined) {
    filters.push({ field: "requester", op: "contains", value: raw.requester });
  }
  if (raw.subject !== undefined) {
    filters.push({ field: "subject", op: "contains", value: raw.subject });
  }
  if (raw.evidence_complete !== undefined) {
    filters.push({ field: "evidence_complete", op: "eq", value: raw.evidence_complete });
  }
  return {
    after: raw.after,
    before: raw.before,
    limit: raw.limit,
    sort: raw.sort,
    filters,
  };
}
