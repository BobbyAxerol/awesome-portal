import { z } from "zod";

const id = z.string().regex(/^[A-Za-z0-9._:-]{1,192}$/);
const base = {
  workspace_id: id,
  request_key: id,
  summary: z.string().trim().min(8).max(1000),
};
export const R2CaptureSchema = z.object({
  ...base, r1_approval_id: id, expected_r1_version: z.number().int().positive(),
  portfolio_id: z.string().regex(/^[A-Za-z0-9._-]{1,128}$/),
  currency: z.string().regex(/^[A-Z0-9]{2,12}$/),
  deployment_id: id, risk_grant_id: id,
  expected_projection_digest: z.string().regex(/^sha256:[0-9a-f]{64}$/),
}).strict();
export const PaperExitCreateSchema = z.object({
  ...base, r2_approval_id: id, expected_r2_version: z.number().int().positive(),
  deployment_id: id,
  expected_projection_digest: z.string().regex(/^sha256:[0-9a-f]{64}$/),
}).strict();
export const SandboxReviewNoteSchema = z.object({
  ...base, certification_id: id, expected_workflow_version: z.number().int().positive(),
}).strict();

export type R2Capture = z.infer<typeof R2CaptureSchema>;
export type PaperExitCreate = z.infer<typeof PaperExitCreateSchema>;
export type SandboxReviewNote = z.infer<typeof SandboxReviewNoteSchema>;
