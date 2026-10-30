import { Inject, Injectable } from "@nestjs/common";
import { GovernanceRepository } from "../governance/governance.repository";
import { GovernanceService } from "../governance/governance.service";
import type { ApprovalEvidencePrincipal, ApprovalVisibility } from "./approval-evidence.authority";

const GATES = { R1: "r1", R2: "r2", LIVE: "live" } as const;

/** Production visibility: the approval exists in the workspace and the principal holds the read authority of ITS OWN gate (the same
 * `assertReadAuthority` the r1/r2/live reads use: session, lease, role, parent compatibility). Any other gate is not visible here. */
@Injectable()
export class GovernanceApprovalVisibility implements ApprovalVisibility {
  constructor(@Inject(GovernanceRepository) private readonly repository: GovernanceRepository,
    @Inject(GovernanceService) private readonly governance: GovernanceService) {}
  async visible(principal: ApprovalEvidencePrincipal, approvalId: string): Promise<boolean> {
    const snapshot = await this.repository.detail(principal.workspaceId, approvalId);
    const gate = snapshot ? GATES[snapshot.approval.gate as keyof typeof GATES] : undefined;
    if (!gate) return false;
    await this.governance.assertReadAuthority(principal.user, principal.session, principal.workspaceId, gate);
    return true;
  }
}
