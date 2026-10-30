import type { ApprovalEvidenceResponse, ApprovalEvidenceSectionName } from "./approval-evidence.contract";

/** Injection token for the evidence source port. Only the dark implementation exists in production code. */
export const APPROVAL_EVIDENCE_PORT = Symbol("APPROVAL_EVIDENCE_PORT");
/** Optional injection token for a field-authority override. Unbound in production (deny-all default). */
export const APPROVAL_EVIDENCE_FIELD_AUTHORITY = Symbol("APPROVAL_EVIDENCE_FIELD_AUTHORITY");
/** Optional injection token for an approval-visibility override (tests). Production derives it from the governance read authority. */
export const APPROVAL_EVIDENCE_VISIBILITY = Symbol("APPROVAL_EVIDENCE_VISIBILITY");
export interface ApprovalEvidenceIdentity { readonly workspaceId: string; readonly approvalId: string; }
/** Per section: `undefined` = no owning source (section omitted); `null` = source not read; a value = published. */
export type ApprovalEvidencePortSections = { readonly [K in ApprovalEvidenceSectionName]?: ApprovalEvidenceResponse[K] };
export interface ApprovalEvidenceAnswer { readonly identity: ApprovalEvidenceIdentity; readonly sections: ApprovalEvidencePortSections; }
export interface ApprovalEvidenceRequest extends ApprovalEvidenceIdentity { readonly nowMs: number; }
export interface ApprovalEvidencePort { read(request: ApprovalEvidenceRequest): Promise<ApprovalEvidenceAnswer>; }
