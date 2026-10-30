import type { AuthSession, PortalUser } from "../domain";
import type { ApprovalEvidenceSectionName } from "./approval-evidence.contract";

export interface ApprovalEvidencePrincipal { readonly user: PortalUser; readonly session: AuthSession; readonly workspaceId: string; }

/** FAIL-CLOSED until independent per-section field authorization exists. Approval visibility alone authorizes a NO-SOURCE body only. While this
 * is true, no published section from ANY port is disclosed: the service maps it to `null` (not read). */
export const EVIDENCE_FIELD_AUTHORITY_NOT_IMPLEMENTED = true as const;
export interface ApprovalEvidenceFieldAuthority { allows(section: ApprovalEvidenceSectionName, principal: ApprovalEvidencePrincipal, approvalId: string): boolean; }
export const EVIDENCE_FIELD_AUTHORITY_DENY_ALL: ApprovalEvidenceFieldAuthority = Object.freeze({
  allows: () => !EVIDENCE_FIELD_AUTHORITY_NOT_IMPLEMENTED,
});

/** Decides whether this principal may read the approval at all. `false` is the same 404 as an approval that does not exist (no existence oracle).
 * It may throw the governance read refusals (403/409) exactly as the sibling r1/r2/live reads do. */
export interface ApprovalVisibility { visible(principal: ApprovalEvidencePrincipal, approvalId: string): Promise<boolean>; }
