/** FE-068 service-level current-grant tests; synthetic queries, not live source. */
import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import type { EffectiveAccess, OwnerAccessService } from "../src/auth/owner-access.service";
import type { ControlApiConfig } from "../src/config";
import type { AuthSession, PortalUser } from "../src/domain";
import { StageActionEligibilityService } from "../src/governance/stage-action-eligibility.service";

const ws = "ws_TEST_ONLY", userId = "usr_TEST_ONLY";
const user = { userId, role: "ADMIN", sessionVersion: 1 } as PortalUser;
const session = { userId, sessionId: "ses_TEST_ONLY", sessionVersion: 1 } as AuthSession;
const config = { EXECUTION_READ_PROFILE: "native_v1", FEATURE_EXECUTION_LOCAL_PROJECTION: "true",
  FEATURE_EXECUTION_CURRENT_SOURCE_PAPER: "true", EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID: ws,
  EXECUTION_EDGE_PAPER_PROFILE_ID: "PAPER_PROFILE" } as unknown as ControlApiConfig; // Only fields read by this isolated service fixture.
const access = (allowed: boolean): EffectiveAccess => ({ userId, isOwner: false, ownerState: "NOT_OWNER",
  capabilities: allowed ? ["governance.r2.read"] : [],
  scopes: allowed ? { "governance.r2.read": [ws] } : {} });

describe("FE-068 current eligibility service", () => {
  it("does not publish a stale eligible result when R2 access is revoked during the read", async () => {
    let current = access(true);
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("owner_step_up_grants")) { current = access(false); return { rows: [] }; }
      if (sql.includes("workspace_members")) return { rows: [{ member: true }] };
      throw new Error("unexpected query");
    });
    const effectiveAccess = vi.fn(async () => current);
    const service = new StageActionEligibilityService({ query } as unknown as Pool, config,
      { effectiveAccess } as unknown as OwnerAccessService);
    const result = await service.read(user, session, ws);
    expect(result.actions.find(row => row.stage_action === "paper.exit_review_request"))
      .toMatchObject({ eligible: false, reason_class: "GOVERNANCE_CAPABILITY_REQUIRED" });
    expect(effectiveAccess).toHaveBeenCalledTimes(1);
  });
  it("refuses the entire response if membership is revoked before the final session fence", async () => {
    let sessionReads = 0;
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("owner_step_up_grants")) return { rows: [] };
      if (sql.includes("workspace_members")) return { rows: [{ member: ++sessionReads === 1 }] };
      throw new Error("unexpected query");
    });
    const service = new StageActionEligibilityService({ query } as unknown as Pool, config,
      { effectiveAccess: vi.fn(async () => access(true)) } as unknown as OwnerAccessService);
    await expect(service.read(user, session, ws)).rejects.toMatchObject({ code: "WORKSPACE_ACCESS_DENIED", status: 403 });
  });
  it("does not treat a grant in another workspace as eligible, or open uncommissioned commands", async () => {
    const query = vi.fn(async (sql: string) => sql.includes("owner_step_up_grants") ? { rows: [] } : { rows: [{ member: true }] });
    const other = { ...access(true), scopes: { "governance.r2.read": ["ws_OTHER"] } };
    const service = new StageActionEligibilityService({ query } as unknown as Pool, config,
      { effectiveAccess: vi.fn(async () => other) } as unknown as OwnerAccessService);
    const result = await service.read(user, session, ws);
    expect(result.actions.find(row => row.stage_action === "paper.exit_review_request"))
      .toMatchObject({ eligible: false, reason_class: "GOVERNANCE_SCOPE_MISMATCH" });
    expect(result.actions.filter(row => /^(canary|live)\./u.test(row.stage_action)).every(row => row.verdict === "NOT_COMMISSIONED"))
      .toBe(true);
  });
});
