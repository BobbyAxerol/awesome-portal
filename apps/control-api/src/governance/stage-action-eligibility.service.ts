import { Inject, Injectable } from "@nestjs/common";
import type { Pool } from "pg";
import { ControlApiConfig } from "../config";
import type { AuthSession, PortalUser } from "../domain";
import { paperProjectionAuthorized } from "./capture-authority";
import { retainedReview } from "../execution/retained-read-profile";
import { OwnerAccessService } from "../auth/owner-access.service";
import { AccountLifecycleRepository, COMMAND_STEP_UP_PROOFS } from "../repos/account-lifecycle";
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
    // The step-up fact the command mutations recheck (a capital or an access-admin proof, whichever is live): THIS session only,
    // never another browser's. No row of this read depends on it (every stage action here is step-up false or undetermined).
    const stepUpUntil = await new AccountLifecycleRepository(this.pool).activeStepUpExpiry(session.sessionId, COMMAND_STEP_UP_PROOFS);
    // Read the grant after the unrelated step-up I/O: a revocation while that
    // query is in flight must not be presented as an eligible Paper action.
    // The result remains advisory and the mutation rechecks its own authority.
    const access = await this.ownerAccess.effectiveAccess(user.userId);
    const config = this.config;
    const result = projectStageActionEligibility({
      workspace_id: workspaceId, role: user.role, access,
      retained_review: retainedReview(config),
      // The one predicate GovernanceReviewCaptureService enforces (context() and paperSnapshot()) for this workspace.
      paper_projection_authorized: paperProjectionAuthorized(config, workspaceId),
      step_up_until_ms: stepUpUntil ? stepUpUntil.getTime() : null,
      observed_at_ms: Date.now(),
    });
    await assertGovernanceReadSession(this.pool, user, session, workspaceId);
    return result;
  }
}
