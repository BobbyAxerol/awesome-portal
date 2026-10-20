/**
 * RV-10 follow-up · the R2 parent of a deployment, for the Paper exit request control.
 *
 * `POST /governance/paper-exit/create` is bound to the parent R2 approval (id, version) and the Paper projection digest. Those pins
 * were only published inside the R2 review's `capture_context`, and no read mapped a deployment to its R2: the screen that owns
 * the control knows a deployment id, not an approval id (receipt `consumer-receipt-rv09-rv10-2026-10-20.md`, "R2 parent for a
 * deployment"). This read answers that one question and nothing else.
 *
 * It publishes the SAME `CaptureContext` the R2 review does (one producer, `GovernanceReviewCaptureService.context`), for the R2
 * approval whose subject is the deployment. It adds no field, grants nothing, writes nothing and calls no source. A caller who may
 * not capture gets the typed BLOCKED context (reason code), not a 403 with no reason, exactly as the R2 review does.
 *
 * Which R2: the newest approved and unexpired R2 of the deployment; when there is none, the newest R2 of any status (its context
 * then says `R2_APPROVAL_REQUIRED` or `APPROVAL_EXPIRED`); when the deployment has no R2 at all, `state: NONE` and no context.
 */
import { z } from "zod";
import { CaptureContextSchema } from "./review-context";

const identifier = z.string().regex(/^[A-Za-z0-9._:-]{1,192}$/);

/** Optional workspace (defaults to the session workspace, then membership-checked) and the deployment asked about. */
export const paperExitParentQuery = z.object({
  workspace_id: z.string().min(3).max(96).optional(),
  deployment_id: identifier,
}).strict();

export const PAPER_EXIT_PARENT_STATES = ["NONE", "FOUND"] as const;

export const paperExitParent = z.object({
  schema_version: z.literal("governance.paper-exit-parent.v1"),
  record_authority: z.literal("PORTAL"),
  workspace_id: z.string().min(3).max(96),
  deployment_id: identifier,
  state: z.enum(PAPER_EXIT_PARENT_STATES),
  /** The R2 review's own `capture_context` for the PAPER_EXIT_CREATE capture; null exactly when no R2 exists for the deployment. */
  capture_context: CaptureContextSchema.nullable(),
  source_side_effect_requested: z.literal(false),
}).strict().superRefine((value, ctx) => {
  const bad = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  if ((value.state === "FOUND") !== (value.capture_context !== null)) bad("PAPER_EXIT_PARENT_STATE_INCONSISTENT");
  const context = value.capture_context;
  if (context === null) return;
  // The context is for THIS workspace and THIS capture; an available one lists only this deployment.
  if (context.action !== "PAPER_EXIT_CREATE" || context.workspace_id !== value.workspace_id) bad("PAPER_EXIT_PARENT_CONTEXT_MISMATCH");
  if (context.candidates.some(candidate => candidate.deployment_id !== value.deployment_id)) bad("PAPER_EXIT_PARENT_CONTEXT_MISMATCH");
});
export type PaperExitParent = z.infer<typeof paperExitParent>;

export function paperExitParentOutcome(input: { workspaceId: string; deploymentId: string; context: z.infer<typeof CaptureContextSchema> | null }): PaperExitParent {
  return paperExitParent.parse({
    schema_version: "governance.paper-exit-parent.v1", record_authority: "PORTAL", workspace_id: input.workspaceId,
    deployment_id: input.deploymentId, state: input.context === null ? "NONE" : "FOUND", capture_context: input.context,
    source_side_effect_requested: false,
  });
}
