import { z } from "zod";
import { accessResource, accessText } from "./access.contract";
import { readDatasetBinding } from "./read-publication";
import { parseCurrentHumanWire } from "./current-human-wire";

const text = accessText;
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/u);
const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const currentViewOperation = z.enum(["CURRENT", "HISTORY", "EXPORT", "STREAM", "REPLAY"]);
const request = { original_context: z.string().regex(/^[A-Za-z0-9_-]{43}$/u),
  workload_id: text, operation: currentViewOperation, resource_ref: text };
export const currentViewResolve = z.object({
  schema_version: z.literal("portal.execution.current-view-resolve.v1"), ...request,
}).strict();
export const currentViewRecheck = z.object({
  schema_version: z.literal("portal.execution.current-view-recheck.v1"), ...request, decision_digest: digest,
}).strict();
export const currentViewDecision = z.object({
  schema_version: z.literal("portal.execution.current-view-decision.v1"),
  context_digest: digest, decision_digest: digest, workload_digest: digest, principal_digest: digest, session_digest: digest,
  operation: currentViewOperation, workspace_id: text, environment: z.enum(["paper", "sandbox", "live"]),
  profile_id: text, resource_ref: text, resource: accessResource, policy_revision: text,
  field_policy_ref: text.nullable(), dataset_binding: readDatasetBinding, whole_population: z.boolean(),
  allowed_tuples: z.array(z.object({ alpha_id: text, alpha_version_id: text, portfolio_id: text,
    deployment_id: text, account_id: text }).strict()).max(2000),
  resources: z.array(accessResource).max(2000), fields: z.array(text).max(64), detail_fields: z.array(text).max(2000),
  expires_at_ms: integer,
}).strict();
export const currentViewError = z.object({ schema_version: z.literal("portal.execution.current-view-error.v1"),
  code: z.enum(["CURRENT_VIEW_CONTEXT_REQUIRED", "CURRENT_VIEW_CONTEXT_EXPIRED", "CURRENT_VIEW_BINDING_MISMATCH",
    "CURRENT_VIEW_AUTHORITY_CHANGED", "CURRENT_VIEW_IDENTITY_REQUIRED", "CURRENT_VIEW_AUTHORITY_UNAVAILABLE",
    "CURRENT_VIEW_OPERATION_NOT_COMMISSIONED", "CURRENT_VIEW_CAPACITY", "CURRENT_VIEW_WORKLOAD_NOT_AUTHENTICATED",
    "CURRENT_VIEW_ROUTE_NOT_FOUND", "CURRENT_VIEW_TRANSPORT_BUSY", "CURRENT_VIEW_REQUEST_INVALID",
    "CURRENT_VIEW_REQUEST_BYTE_LIMIT", "CURRENT_VIEW_TRANSPORT_DEADLINE", "CURRENT_VIEW_RESPONSE_INVALID"]),
}).strict();

/** Strict UTF-8/duplicate-key parser shared with the existing custody wire.
 * No browser JSON, actor IDs, role, forwarded certificate or reconstructed
 * scope can register original-context authority through either operation. */
export function parseCurrentViewRequest(bytes: Buffer, kind: "RESOLVE" | "RECHECK") {
  const json = parseCurrentHumanWire(bytes);
  return kind === "RESOLVE" ? currentViewResolve.parse(json) : currentViewRecheck.parse(json);
}
