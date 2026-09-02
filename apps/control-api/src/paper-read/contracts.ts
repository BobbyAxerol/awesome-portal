import { z } from "zod";

const WorkspaceId = z.string().trim().min(1).max(96);
const DeploymentId = z.string().trim().min(1).max(191);
const Cursor = z.string().min(1).max(4096);

export const PaperOverviewQuerySchema = z.object({
  workspace_id: WorkspaceId.optional(),
}).strict();

export const PaperWorkbenchQuerySchema = z.object({
  workspace_id: WorkspaceId.optional(),
}).strict();

export const PaperBlotterQuerySchema = z.object({
  workspace_id: WorkspaceId.optional(),
  cursor: Cursor.optional(),
  after: Cursor.optional(),
  before: Cursor.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  status: z.string().trim().min(1).max(32).optional(),
  venue: z.string().trim().min(1).max(32).optional(),
  symbol: z.string().trim().min(1).max(64).optional(),
  side: z.enum(["BUY", "SELL"]).optional(),
  sort: z.enum(["submitted_at_desc", "submitted_at_asc", "updated_at_desc"]).default("submitted_at_desc"),
}).strict().superRefine((query, context) => {
  if ([query.cursor, query.after, query.before].filter(Boolean).length > 1) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "blotter cursors are mutually exclusive" });
  }
});

export const PaperDeploymentIdSchema = DeploymentId;

type ParsedPaperBlotterQuery = z.infer<typeof PaperBlotterQuerySchema>;
export type PaperBlotterQuery = Omit<ParsedPaperBlotterQuery, "sort"> & {
  sort?: ParsedPaperBlotterQuery["sort"];
};
