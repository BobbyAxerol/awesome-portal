import type { ApprovalEvidenceAnswer, ApprovalEvidencePort, ApprovalEvidenceRequest } from "./approval-evidence.port";

/** The ONLY production implementation today. Edge/Core inputs for prior economic history, evidence diff, obligations and the receipt preview are
 * not commissioned (WP_K_CONTRACTS_2026-10-23.md), so it performs no I/O, reads no table and invents no value: every section has no owning
 * source and is omitted from the body. */
export class SourceNotCommissionedApprovalEvidencePort implements ApprovalEvidencePort {
  async read(request: ApprovalEvidenceRequest): Promise<ApprovalEvidenceAnswer> {
    return { identity: { workspaceId: request.workspaceId, approvalId: request.approvalId }, sections: {} };
  }
}
