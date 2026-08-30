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
  limit: z.coerce.number().int().min(1).max(100).default(50),
}).strict();

export const PaperDeploymentIdSchema = DeploymentId;

export type PaperBlotterQuery = z.infer<typeof PaperBlotterQuerySchema>;
