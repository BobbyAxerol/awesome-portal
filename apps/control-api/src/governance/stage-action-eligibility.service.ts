import { Inject, Injectable } from "@nestjs/common";
import type { Pool } from "pg";
import { ControlApiConfig } from "../config";
import type { AuthSession, PortalUser } from "../domain";
import { retainedReview } from "../execution/retained-read-profile";
import { OwnerAccessService } from "../auth/owner-access.service";
import { AccountLifecycleRepository } from "../repos/account-lifecycle";
import { CONTROL_API_CONFIG, CONTROL_API_POOL } from "../tokens";
import { assertGovernanceReadSession } from "./governance.service";
import { projectStageActionEligibility, type StageActionEligibility } from "./stage-action-eligibility";

/**
 * FE-068 read side. Authorization order: the controller has already run the
 * SessionGuard and the workspace-membership check; this service re-proves the
 * exact current session, role and membership against the database BEFORE it
 * reads any grant or step-up fact, and again AFTER the last await, so a
 * revocation or demotion during the reads refuses instead of publishing a stale
 * verdict. It writes nothing, calls no source and creates no authority.
 */
@Injectable()
export class StageActionEligibilityService {
  constructor(
    @Inject(CONTROL_API_POOL) private readonly pool: Pool,
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
    @Inject(OwnerAccessService) private readonly ownerAccess: OwnerAccessService,
  ) {}

  async read(user: PortalUser, session: AuthSession, workspaceId: string): Promise<StageActionEligibility> {
    await assertGovernanceReadSession(this.pool, user, session, workspaceId);
    const access = await this.ownerAccess.effectiveAccess(user.userId);
    // Same step-up fact the access/capital mutations recheck: THIS session only, never another browser's.
    const stepUpUntil = await new AccountLifecycleRepository(this.pool).activeStepUpExpiry(session.sessionId);
    const config = this.config;
    const result = projectStageActionEligibility({
      workspace_id: workspaceId, role: user.role, access,
      retained_review: retainedReview(config),
      // Exactly the predicate GovernanceReviewCaptureService.paperSnapshot() enforces for this workspace.
      paper_projection_authorized: config.FEATURE_EXECUTION_LOCAL_PROJECTION === "true" &&
        config.FEATURE_EXECUTION_CURRENT_SOURCE_PAPER === "true" &&
        config.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID === workspaceId && Boolean(config.EXECUTION_EDGE_PAPER_PROFILE_ID),
      step_up_until_ms: stepUpUntil ? stepUpUntil.getTime() : null,
      observed_at_ms: Date.now(),
    });
    await assertGovernanceReadSession(this.pool, user, session, workspaceId);
    return result;
  }
}
