import type { components } from "@portal/contracts-governance";

export type ReviewCapture = components["schemas"]["CaptureResponse"];
export type ReviewCaptureCapabilities = components["schemas"]["Capabilities"];
export type R2CaptureInput = components["schemas"]["R2CaptureRequest"];
export type PaperExitCreateInput = components["schemas"]["PaperExitCreateRequest"];
export type SandboxNoteInput = components["schemas"]["SandboxNoteRequest"];

const ACTIONS = ["R2_CREATE","PAPER_EXIT_CREATE","SANDBOX_NOTE","R2_EXECUTION_GRANT","PAPER_EXIT_PROMOTE","SANDBOX_CERTIFY_SOURCE"];
const object = (v: unknown): Record<string,unknown>|null => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string,unknown> : null;
const id = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9._:-]{1,192}$/.test(v);

/** The result records a review, not a PASS, execution grant or TS mutation. */
export function readReviewCapture(raw: unknown): ReviewCapture|null {
  const r = object(raw);
  if (!r || r.schema_version !== "governance.review-capture.v1" || r.authority !== "PORTAL" ||
    r.source_verdict !== "NOT_ASSERTED" || r.source_side_effect_requested !== false || typeof r.replayed !== "boolean" ||
    !id(r.workspace_id) || !id(r.aggregate_id) || !Number.isSafeInteger(r.workflow_version) || Number(r.workflow_version)<1 ||
    typeof r.decision_reason_code !== "string" || !r.decision_reason_code) return null;
  const actionId = r.action === "R2_CREATE" ? r.approval_id : r.action === "PAPER_EXIT_CREATE" ? r.review_id
    : r.action === "SANDBOX_NOTE" ? r.certification_id : null;
  if (!id(actionId) || actionId !== r.aggregate_id) return null;
  if (r.action === "SANDBOX_NOTE" && !id(r.deployment_id)) return null;
  const readPath = r.action === "R2_CREATE" ? `/api/v1/execution/governance/approvals/${actionId}/r2`
    : r.action === "PAPER_EXIT_CREATE" ? `/api/v1/execution/governance/exit-reviews/${actionId}`
      : `/api/v1/execution/deployments/${r.deployment_id}/certification`;
  if (r.read_path !== readPath) return null;
  if (r.action !== "SANDBOX_NOTE" && (typeof r.captured_projection_digest !== "string" || !/^sha256:[0-9a-f]{64}$/.test(r.captured_projection_digest))) return null;
  return r as ReviewCapture;
}

export function readReviewCaptureCapabilities(raw: unknown): ReviewCaptureCapabilities|null {
  const r = object(raw);
  if (!r || r.schema_version !== "governance.review-capture-capabilities.v1" || r.authority !== "PORTAL" ||
      r.source_side_effect_requested !== false || !Array.isArray(r.actions) || r.actions.length!==ACTIONS.length) return null;
  const seen = new Set<string>();
  for (const entry of r.actions) {
    const a = object(entry);
    if (!a || typeof a.id!=="string" || !ACTIONS.includes(a.id) || seen.has(a.id)) return null;
    seen.add(a.id);
    if (a.state === "UNAVAILABLE") { if (typeof a.reason_code!=="string" || !a.reason_code) return null; }
    else if (a.state === "AVAILABLE") {
      const paths: Record<string,string> = { R2_CREATE:"r2/capture",PAPER_EXIT_CREATE:"paper-exit/create",SANDBOX_NOTE:"sandbox/capture-note" };
      if (!paths[a.id] || a.path!==`/api/v1/execution/governance/${paths[a.id]}` || typeof a.inputs!=="string") return null;
    } else return null;
  }
  return r as ReviewCaptureCapabilities;
}
