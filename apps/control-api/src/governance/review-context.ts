/** Named, bounded review inputs. A workflow position is not an accepted gate. */
import { z } from "zod";
import type { ApprovalRecord, EvidenceRecord, R2LineageRecord } from "./governance.repository";
import type { ProfileProjectionSnapshot } from "../execution/profile-projection.repository";

const identifier = z.string().regex(/^[A-Za-z0-9._:-]{1,192}$/);
const hash = z.string().regex(/^sha256:[0-9a-f]{64}$/);
export const REVIEW_CONTEXT_REASONS = [
  "GOVERNANCE_CAPABILITY_REQUIRED", "ADMIN_ROLE_REQUIRED", "APPROVAL_NOT_PENDING",
  "APPROVAL_EXPIRED", "EVIDENCE_HASH_LIMIT_EXCEEDED", "R2_EXECUTION_DECISION_NOT_COMMISSIONED",
  "R1_APPROVAL_REQUIRED", "R1_EVIDENCE_INCOMPLETE", "R2_ACCEPTED_LINEAGE_UNAVAILABLE",
  "R2_REVIEW_CLOSED", "CAPTURE_RETAINED_REVIEW_READ_ONLY", "CAPTURE_PROJECTION_NOT_AUTHORIZED",
  "CAPTURE_PROJECTION_UNAVAILABLE", "CAPTURE_PROJECTION_SCOPE_MISMATCH", "CAPTURE_PROJECTION_STALE",
  "CAPTURE_DEPLOYMENT_SOURCE_UNAVAILABLE", "R2_RISK_GRANT_SOURCE_UNAVAILABLE",
  "R2_PORTFOLIO_SCOPE_NOT_FOUND", "CAPTURE_DEPLOYMENT_SCOPE_NOT_FOUND",
  "PAPER_VENUE_UNAVAILABLE",
] as const;
const availability = z.object({
  state: z.enum(["AVAILABLE", "BLOCKED"]), reason_code: z.enum(REVIEW_CONTEXT_REASONS).nullable(),
}).strict().refine(value => (value.state === "AVAILABLE") === (value.reason_code === null));

export const DecisionContextSchema = z.object({
  gate: z.enum(["R1", "R2"]), workspace_id: identifier, approval_id: identifier,
  expected_approval_version: z.number().int().positive(), evidence_set_hash: hash,
  evidence_hashes: z.array(hash).max(128).nullable(),
  command_type: z.literal("GOVERNANCE_R1_DECISION").nullable(),
  request_schema_version: z.literal("governance.r1-decision-plan-request.v1").nullable(),
  plan_path: z.literal("/api/v1/execution/commands/plans").nullable(),
  availability, source_side_effect_requested: z.literal(false),
}).strict().superRefine((value, ctx) => {
  const wired = value.gate === "R1";
  if (wired !== (value.command_type !== null) || wired !== (value.plan_path !== null)
    || wired !== (value.request_schema_version !== null)
    || value.gate === "R2" && (value.evidence_hashes !== null
      || value.availability.reason_code !== "R2_EXECUTION_DECISION_NOT_COMMISSIONED")
    || value.evidence_hashes !== null && new Set(value.evidence_hashes).size !== value.evidence_hashes.length
    || value.availability.state === "AVAILABLE" && value.evidence_hashes === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Decision executor does not match this gate." });
  }
});
export const CaptureContextSchema = z.object({
  action: z.enum(["R2_CREATE", "PAPER_EXIT_CREATE"]), workspace_id: identifier,
  parent_approval_id: identifier, expected_parent_version: z.number().int().positive(),
  expected_projection_digest: hash.nullable(), availability,
  candidates: z.array(z.object({
    deployment_id: identifier, portfolio_id: identifier, risk_grant_id: identifier.nullable(),
    currency: z.string().regex(/^[A-Z0-9]{2,12}$/).nullable(),
  }).strict()).max(50), candidates_truncated: z.boolean(),
  currency_semantics: z.literal("REVIEWER_REQUESTED_NOT_FX_CONVERSION"),
  source_side_effect_requested: z.literal(false),
}).strict().superRefine((value, ctx) => {
  if (value.availability.state === "AVAILABLE" && (!value.expected_projection_digest || !value.candidates.length)
    || value.availability.state === "BLOCKED" && (value.expected_projection_digest !== null || value.candidates.length > 0)
    || value.action === "R2_CREATE" && value.candidates.some(item => item.risk_grant_id === null)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Capture availability must match its accepted inputs." });
  }
});
export type CaptureContext = z.infer<typeof CaptureContextSchema>;
export type ReviewContextReason = typeof REVIEW_CONTEXT_REASONS[number];

export function decisionContext(approval: ApprovalRecord, evidence: readonly EvidenceRecord[], mayDecide: boolean) {
  const hashes = [...new Set(evidence.map(item => item.sha256))].sort();
  const gate = approval.gate === "R1" ? "R1" : "R2";
  const reason: ReviewContextReason | null = gate === "R2" ? "R2_EXECUTION_DECISION_NOT_COMMISSIONED"
    : !mayDecide ? "GOVERNANCE_CAPABILITY_REQUIRED"
      : approval.expiresAt <= new Date() ? "APPROVAL_EXPIRED"
        : approval.status !== "PENDING" ? "APPROVAL_NOT_PENDING"
          : hashes.length > 128 ? "EVIDENCE_HASH_LIMIT_EXCEEDED" : null;
  return DecisionContextSchema.parse({ gate, workspace_id: approval.workspaceId, approval_id: approval.approvalId,
    expected_approval_version: approval.approvalVersion, evidence_set_hash: approval.evidenceSetHash,
    evidence_hashes: gate === "R2" || hashes.length > 128 ? null : hashes,
    command_type: gate === "R1" ? "GOVERNANCE_R1_DECISION" : null,
    request_schema_version: gate === "R1" ? "governance.r1-decision-plan-request.v1" : null,
    plan_path: gate === "R1" ? "/api/v1/execution/commands/plans" : null,
    availability: { state: reason === null ? "AVAILABLE" : "BLOCKED", reason_code: reason },
    source_side_effect_requested: false });
}

export function blockedCapture(approval: ApprovalRecord, action: CaptureContext["action"], reason: ReviewContextReason): CaptureContext {
  return CaptureContextSchema.parse({ action, workspace_id: approval.workspaceId,
    parent_approval_id: approval.approvalId, expected_parent_version: approval.approvalVersion,
    expected_projection_digest: null, availability: { state: "BLOCKED", reason_code: reason },
    candidates: [], candidates_truncated: false, currency_semantics: "REVIEWER_REQUESTED_NOT_FX_CONVERSION",
    source_side_effect_requested: false });
}

/** No raw relations/cursors, no cross-profile join, no guessed currency or source verdict. */
export function paperCaptureContext(approval: ApprovalRecord, action: CaptureContext["action"],
  snapshot: ProfileProjectionSnapshot, lineage?: (R2LineageRecord & { portfolioId: string }) | null): CaptureContext {
  const blocked = (reason: ReviewContextReason) => blockedCapture(approval, action, reason);
  const relations = snapshot.document.relations;
  const deployments = relations["manager.deployments:strategy_deployments"];
  const portfolios = relations["manager.portfolios:portfolios"];
  const grants = relations["manager.risk:risk_grants"];
  const accepted = (relation: typeof deployments) => relation?.availability === "AVAILABLE"
    && relation.freshness !== "STALE" && relation.freshness !== "UNKNOWN";
  if (!accepted(deployments)) return blocked("CAPTURE_DEPLOYMENT_SOURCE_UNAVAILABLE");
  if (!accepted(portfolios)) return blocked("R2_PORTFOLIO_SCOPE_NOT_FOUND");
  if (action === "R2_CREATE" && !accepted(grants)) return blocked("R2_RISK_GRANT_SOURCE_UNAVAILABLE");
  // Bound preparation as well as serialization. A truncated context is not a complete catalogue.
  const safeRows = (relation: typeof deployments) => (relation?.items ?? []).slice(0, 200)
    .filter(row => row.lineage.workspace_id === snapshot.document.workspace_id
      && row.lineage.profile_id === snapshot.document.profile_id);
  const portfolioMap = new Map(safeRows(portfolios).map(row => [row.fields.portfolio_id, row.fields]));
  const grantMap = new Map<string, Set<string>>();
  for (const { fields } of safeRows(grants)) {
    if (identifier.safeParse(fields.risk_grant_id).success) {
      const key = JSON.stringify([fields.strategy_id, fields.account_id]);
      const values = grantMap.get(key) ?? new Set<string>();
      values.add(fields.risk_grant_id as string);
      grantMap.set(key, values);
    }
  }
  const candidates: CaptureContext["candidates"] = [];
  for (const { fields } of safeRows(deployments)) {
    const portfolio = portfolioMap.get(fields.portfolio_id);
    const risks = grantMap.get(JSON.stringify([fields.strategy_id, fields.account_id]));
    const matched = action === "R2_CREATE" ? fields.strategy_id === approval.subjectId && risks !== undefined
      : fields.deployment_id === approval.subjectId && fields.portfolio_id === lineage?.portfolioId;
    if (!matched || !portfolio || !identifier.safeParse(fields.deployment_id).success
      || !identifier.safeParse(fields.portfolio_id).success) continue;
    if (action === "PAPER_EXIT_CREATE" && (typeof fields.venue !== "string" || !fields.venue.trim())) {
      return blocked("PAPER_VENUE_UNAVAILABLE");
    }
    for (const risk of action === "R2_CREATE" ? [...risks!] : [null]) {
      candidates.push({ deployment_id: fields.deployment_id as string, portfolio_id: fields.portfolio_id as string,
        risk_grant_id: risk,
        currency: typeof portfolio.currency === "string" && /^[A-Z0-9]{2,12}$/.test(portfolio.currency) ? portfolio.currency : null });
    }
  }
  if (!candidates.length) return blocked("CAPTURE_DEPLOYMENT_SCOPE_NOT_FOUND");
  return CaptureContextSchema.parse({ ...blocked("CAPTURE_DEPLOYMENT_SCOPE_NOT_FOUND"),
    availability: { state: "AVAILABLE", reason_code: null }, expected_projection_digest: snapshot.payloadDigest,
    candidates: [...new Map(candidates.map(item => [JSON.stringify(item), item])).values()].slice(0, 50), candidates_truncated: candidates.length > 50
      || [deployments, portfolios, grants].some(relation => (relation?.items.length ?? 0) > 200) });
}
