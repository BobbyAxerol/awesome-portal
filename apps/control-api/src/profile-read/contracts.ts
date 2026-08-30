import { z } from "zod";

export const ProfileOverviewQuerySchema = z.object({
  workspace_id: z.string().trim().min(1).max(96).optional(),
}).strict();
