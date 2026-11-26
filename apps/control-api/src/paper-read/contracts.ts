import { z } from "zod";

const WorkspaceId = z.string().trim().min(1).max(96);
const DeploymentId = z.string().trim().min(1).max(191);
const ScopeId = DeploymentId.regex(/^[A-Za-z0-9][A-Za-z0-9._:@+-]{0,190}$/);
/** Optional per-request Paper profile; the allow-list is enforced in the controller, never by this grammar. */
const PaperProfileId = z.string().trim().regex(/^PAPER_[A-Z0-9_]{2,120}$/);
const Cursor = z.string().min(1).max(4096);
const OrderStatus = z.enum([
  "INITIALIZED", "SUBMITTED", "ACCEPTED", "REJECTED", "DENIED", "PENDING_UPDATE",
  "PENDING_CANCEL", "PARTIALLY_FILLED", "FILLED", "CANCELED", "EXPIRED", "TRIGGERED",
]);

export const PaperOverviewQuerySchema = z.object({
  workspace_id: WorkspaceId.optional(),
  profile_id: PaperProfileId.optional(),
}).strict();

export const PaperWorkbenchQuerySchema = z.object({
  workspace_id: WorkspaceId.optional(),
  profile_id: PaperProfileId.optional(),
}).strict();

export const PaperBlotterQuerySchema = z.object({
  workspace_id: WorkspaceId.optional(),
  profile_id: PaperProfileId.optional(),
  cursor: Cursor.optional(),
  after: Cursor.optional(),
  before: Cursor.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  status: OrderStatus.optional(),
  status_bucket: z.enum(["FILLED", "PARTIAL", "REJECTED", "OPEN"]).optional(),
  stage: z.enum(["PAPER", "SANDBOX", "CANARY", "LIVE"]).optional(),
  deployment_id: ScopeId.optional(),
  account_id: ScopeId.optional(),
  alpha_id: ScopeId.optional(),
  venue: z.string().trim().min(1).max(32).optional(),
  symbol: z.string().trim().min(1).max(64).optional(),
  side: z.enum(["BUY", "SELL"]).optional(),
  sort: z.enum(["submitted_at_desc", "submitted_at_asc", "updated_at_desc"]).default("submitted_at_desc"),
}).strict().superRefine((query, context) => {
  if ([query.cursor, query.after, query.before].filter(Boolean).length > 1) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "blotter cursors are mutually exclusive" });
  }
  if (query.status && query.status_bucket) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "status and status_bucket are mutually exclusive" });
  }
});

export const PaperDeploymentIdSchema = DeploymentId;

type ParsedPaperBlotterQuery = z.infer<typeof PaperBlotterQuerySchema>;
export type PaperBlotterQuery = Omit<ParsedPaperBlotterQuery, "sort"> & {
  sort?: ParsedPaperBlotterQuery["sort"];
};
