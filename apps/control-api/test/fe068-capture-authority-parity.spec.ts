/** FE-068 · the review-capture capability read, the stage-action eligibility read and the REAL route guards must
 * give the same answer for the same member. TEST_ONLY, no PostgreSQL: the real `capture()` and the real
 * `assertDecisionAuthority` run against a scripted fake client; the replay branch makes "authority passed" observable
 * without any write. The SessionGuard retained-review refusal and the HTTP layer are NOT run here (named below). */
import { describe, expect, it, vi } from "vitest";
import type { EffectiveAccess } from "../src/auth/owner-access.service";
import type { PortalUser } from "../src/domain";
import { projectionDigest } from "../src/execution/profile-projection.repository";
import { CAPTURE_ACTIONS, captureRefusal, paperProjectionAuthorized, type CaptureAction, type CaptureAuthorityFacts }
  from "../src/governance/capture-authority";
import { GovernanceError } from "../src/governance/governance.service";
import { GovernanceReviewCaptureService } from "../src/governance/review-capture.service";
import { STAGE_ACTIONS, projectStageActionEligibility, type StageEligibilityFacts } from "../src/governance/stage-action-eligibility";
import { PORTAL_CAPABILITIES, withImpliedReads, type PortalCapability } from "../src/repos/owner-access";

const WS = "ws_TEST_ONLY", USER_ID = "usr_TEST_ONLY";
type Grant = { capability: PortalCapability; workspace_id: string | null };
const g = (capability: string, workspace_id: string | null = null): Grant => ({ capability: capability as PortalCapability, workspace_id });
/** Same derivation OwnerAccessService.effectiveAccess and assertDecisionAuthority share (implied reads, scopes). */
function accessOf(grants: Grant[], isOwner: boolean): EffectiveAccess {
  if (isOwner) return { userId: USER_ID, isOwner: true, capabilities: [...PORTAL_CAPABILITIES].sort(), ownerState: "OWNER",
    scopes: Object.fromEntries(PORTAL_CAPABILITIES.map(c => [c, [null]])) as never };
  const scopes: Record<string, Array<string | null>> = {};
  for (const grant of grants) {
    (scopes[grant.capability] ??= []).push(grant.workspace_id);
    const implied = grant.capability.replace(/\.decide$/, ".read");
    if (implied !== grant.capability) (scopes[implied] ??= []).push(grant.workspace_id);
  }
  return { userId: USER_ID, isOwner: false, capabilities: withImpliedReads(grants.map(x => x.capability)), ownerState: "NOT_OWNER", scopes: scopes as never };
}
const VARIANTS: Array<{ name: string; grants: Grant[]; owner: boolean }> = [
  { name: "owner", grants: [], owner: true },
  { name: "no grants", grants: [], owner: false },
  { name: "R2 read everywhere", grants: [g("governance.r2.read")], owner: false },
  { name: "R2 read in this workspace", grants: [g("governance.r2.read", WS)], owner: false },
  { name: "R2 read in another workspace", grants: [g("governance.r2.read", "ws_OTHER")], owner: false },
  { name: "R2 decide implies read", grants: [g("governance.r2.decide")], owner: false },
  { name: "R1 read only", grants: [g("governance.r1.read")], owner: false },
  { name: "R1 + R2 read", grants: [g("governance.r1.read"), g("governance.r2.read")], owner: false },
  { name: "R2 read, R1 read in another workspace", grants: [g("governance.r2.read"), g("governance.r1.read", "ws_OTHER")], owner: false },
  { name: "canary/live decide only (must grant nothing here)", grants: [g("governance.canary.decide"), g("governance.live.decide")], owner: false },
];
const cells = VARIANTS.flatMap(variant => (["ADMIN", "USER"] as const).flatMap(role => [true, false].map(projection => ({ variant, role, projection }))));

const config = (retained: boolean, projection: boolean) => ({
  EXECUTION_READ_PROFILE: retained ? "retained_review_v1" : "native_v1",
  FEATURE_EXECUTION_LOCAL_PROJECTION: projection ? "true" : "false", FEATURE_EXECUTION_CURRENT_SOURCE_PAPER: "true",
  EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID: WS, EXECUTION_EDGE_PAPER_PROFILE_ID: "PAPER_PROFILE",
}) as never;

const inputs = {
  SANDBOX_NOTE: { workspace_id: WS, request_key: "key-1", summary: "A reviewer note for the run.", certification_id: "cert-1", expected_workflow_version: 1 },
  PAPER_EXIT_CREATE: { workspace_id: WS, request_key: "key-1", summary: "A reviewer note for the run.", r2_approval_id: "r2-1", expected_r2_version: 1,
    deployment_id: "dep-1", expected_projection_digest: `sha256:${"a".repeat(64)}` },
  R2_CREATE: { workspace_id: WS, request_key: "key-1", summary: "A reviewer note for the run.", r1_approval_id: "r1-1", expected_r1_version: 1,
    portfolio_id: "pf-1", currency: "USD", deployment_id: "dep-1", risk_grant_id: "rg-1", expected_projection_digest: `sha256:${"a".repeat(64)}` },
} as const;

/** Scripts exactly the statements capture() / assertDecisionAuthority issue before the replay branch. */
function fakePool(user: PortalUser, grants: Grant[], owner: boolean, action: CaptureAction) {
  const statements: string[] = [];
  const response = { schema_version: "governance.review-capture.v1", workspace_id: WS, action, aggregate_id: "agg-1" };
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    statements.push(sql.replace(/\s+/g, " ").trim());
    if (/FROM portal_users WHERE user_id = \$1 FOR SHARE/.test(sql))
      return { rows: [{ user_id: user.userId, username: "tester", role: user.role, status: "ACTIVE", must_change_password: false,
        session_version: user.sessionVersion, archived_at: null }], rowCount: 1 };
    if (/FROM workspace_members/.test(sql)) return { rows: [{ "?column?": 1 }], rowCount: 1 };
    if (/FROM portal_owner_anchor/.test(sql)) return { rows: [{ user_id: owner ? user.userId : "usr_OWNER_OTHER" }], rowCount: 1 };
    if (/FROM portal_capability_grants/.test(sql)) {
      const wanted = params[1] as string[];
      const rows = grants.filter(x => wanted.includes(x.capability)).map(x => ({ capability: x.capability, workspace_id: x.workspace_id }));
      return { rows, rowCount: rows.length };
    }
    if (/FROM governance_review_captures/.test(sql))
      return { rows: [{ payload_hash: projectionDigest({ action, input: inputs[action] }), response_json: response }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  });
  const client = { query, release: vi.fn() };
  return { pool: { connect: async () => client } as never, statements };
}
function service(pool: unknown, cfg: unknown, access: EffectiveAccess) {
  return new GovernanceReviewCaptureService(pool as never, cfg as never, {} as never, {} as never,
    { effectiveAccess: vi.fn(async () => access) } as never);
}
const routeOf = (svc: GovernanceReviewCaptureService, user: PortalUser, action: CaptureAction) =>
  action === "SANDBOX_NOTE" ? svc.sandboxNote(user, inputs.SANDBOX_NOTE, "req")
    : action === "PAPER_EXIT_CREATE" ? svc.createPaperExit(user, inputs.PAPER_EXIT_CREATE, "req")
      : svc.createR2(user, inputs.R2_CREATE, "req");
const userOf = (role: "ADMIN" | "USER"): PortalUser => ({ userId: USER_ID, username: "tester", role, sessionVersion: 3 }) as never;

describe("FE-068 one authority predicate for capture capabilities, stage eligibility and the routes", () => {
  it("the grid is not vacuous: every refusal class and the allowance occur", () => {
    const seen = new Set<string>();
    for (const { variant, role, projection } of cells) for (const retained of [true, false]) for (const action of CAPTURE_ACTIONS)
      seen.add(String(captureRefusal(action, { workspace_id: WS, role, access: accessOf(variant.grants, variant.owner), retained_review: retained,
        paper_projection_authorized: projection })));
    expect([...seen].sort()).toEqual(["ADMIN_ROLE_REQUIRED", "CAPTURE_PROJECTION_NOT_AUTHORIZED", "GOVERNANCE_CAPABILITY_REQUIRED",
      "GOVERNANCE_SCOPE_MISMATCH", "RETAINED_REVIEW_READ_ONLY", "null"]);
  });

  it("capabilities() and the eligibility read agree with captureRefusal on every cell, for both retained-review modes", async () => {
    for (const { variant, role, projection } of cells) for (const retained of [true, false]) {
      const access = accessOf(variant.grants, variant.owner);
      const facts: CaptureAuthorityFacts = { workspace_id: WS, role, access, retained_review: retained, paper_projection_authorized: projection };
      const label = `${variant.name} / ${role} / retained=${retained} / projection=${projection}`;
      expect(paperProjectionAuthorized(config(retained, projection) as never, WS), label).toBe(projection);
      const caps = await service({}, config(retained, projection), access).capabilities(userOf(role), WS);
      for (const action of CAPTURE_ACTIONS) {
        const refusal = captureRefusal(action, facts);
        const row = caps.actions.find(entry => entry.id === action)!;
        expect(row.state, `${label} ${action}`).toBe(refusal === null ? "AVAILABLE" : "UNAVAILABLE");
        expect((row as { reason_code?: string }).reason_code, `${label} ${action}`).toBe(refusal === null ? undefined : refusal);
      }
      // the three actions that are never commissioned stay fixed regardless of the member
      expect(caps.actions.filter(entry => ["R2_EXECUTION_GRANT", "PAPER_EXIT_PROMOTE", "SANDBOX_CERTIFY_SOURCE"].includes(entry.id))
        .every(entry => entry.state === "UNAVAILABLE")).toBe(true);
      const stage = projectStageActionEligibility({ workspace_id: WS, role, access, retained_review: retained, paper_projection_authorized: projection,
        step_up_until_ms: null, observed_at_ms: 1_800_000_000_000 } satisfies StageEligibilityFacts);
      for (const [stageAction, capture] of [["sandbox.review_note", "SANDBOX_NOTE"], ["paper.exit_review_request", "PAPER_EXIT_CREATE"]] as const) {
        const row = stage.actions.find(entry => entry.stage_action === stageAction)!;
        const refusal = captureRefusal(capture, facts);
        expect(row.reason_class, `${label} ${stageAction}`).toBe(refusal ?? "SUBMIT_CHECKS_REQUIRED");
        const capsRow = caps.actions.find(entry => entry.id === capture)!;
        // THE regression: the capability and the eligibility cannot disagree on the same control.
        expect(row.eligible, `${label} ${stageAction}`).toBe(capsRow.state === "AVAILABLE");
      }
    }
  });

  it("the REAL capture() guards (role, then assertDecisionAuthority) refuse exactly as the predicate says, for every action and cell", async () => {
    for (const { variant, role, projection } of cells) for (const action of CAPTURE_ACTIONS) {
      const access = accessOf(variant.grants, variant.owner);
      const refusal = captureRefusal(action, { workspace_id: WS, role, access, retained_review: false, paper_projection_authorized: projection });
      // The projection configuration is checked by the write step, AFTER authority and replay; authority itself passes.
      const expected = refusal === "CAPTURE_PROJECTION_NOT_AUTHORIZED" ? null : refusal;
      const user = userOf(role), { pool } = fakePool(user, variant.grants, variant.owner, action);
      const outcome = await routeOf(service(pool, config(false, projection), access), user, action).then(
        value => ({ ok: true as const, value }), (error: unknown) => ({ ok: false as const, error }));
      const label = `${variant.name} / ${role} / ${action}`;
      if (expected === null) {
        expect(outcome.ok, label).toBe(true);
        expect((outcome as { value: { replayed: boolean } }).value.replayed, label).toBe(true);
      } else {
        expect(outcome.ok, label).toBe(false);
        const error = (outcome as { error: GovernanceError }).error;
        expect(error, label).toBeInstanceOf(GovernanceError);
        expect(error.code, label).toBe(expected);
        expect(error.status, label).toBe(403);
      }
    }
  });

  it("the write step's own projection check is the same predicate (paperSnapshot refuses exactly when it is false)", async () => {
    for (const projection of [true, false]) {
      const svc = service({}, config(false, projection), accessOf([], true));
      const outcome = await (svc as never as { paperSnapshot: (c: unknown, w: string, d: string) => Promise<unknown> })
        .paperSnapshot({}, WS, `sha256:${"a".repeat(64)}`).catch((error: GovernanceError) => error);
      if (!projection) expect(outcome).toMatchObject({ code: "CAPTURE_PROJECTION_NOT_AUTHORIZED", status: 404 });
      else expect((outcome as { code?: string }).code).not.toBe("CAPTURE_PROJECTION_NOT_AUTHORIZED");
    }
    const other = service({}, { ...(config(false, true) as object), EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID: "ws_OTHER" }, accessOf([], true));
    await expect((other as never as { paperSnapshot: (c: unknown, w: string, d: string) => Promise<unknown> })
      .paperSnapshot({}, WS, `sha256:${"a".repeat(64)}`)).rejects.toMatchObject({ code: "CAPTURE_PROJECTION_NOT_AUTHORIZED" });
    for (const workspace of [WS, "ws_OTHER"])
      expect(paperProjectionAuthorized({ ...(config(false, true) as object), EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID: "ws_OTHER" } as never, workspace)).toBe(workspace === "ws_OTHER");
    expect(paperProjectionAuthorized({ ...(config(false, true) as object), EXECUTION_EDGE_PAPER_PROFILE_ID: "" } as never, WS)).toBe(false);
  });

  it("advisory never opens canary or live, and approval.create stays membership-only", () => {
    for (const { variant, role, projection } of cells) for (const retained of [true, false]) {
      const result = projectStageActionEligibility({ workspace_id: WS, role, access: accessOf(variant.grants, variant.owner), retained_review: retained,
        paper_projection_authorized: projection, step_up_until_ms: 1_800_000_999_999, observed_at_ms: 1_800_000_000_000 });
      for (const row of result.actions.filter(entry => /^(canary|live)\./.test(entry.stage_action)))
        expect(row, `${variant.name}/${role}/${row.stage_action}`).toMatchObject({ verdict: "NOT_COMMISSIONED", eligible: false, step_up_required: null });
      // an ACTIVE session step-up changes nothing about eligibility
      const approval = result.actions.find(entry => entry.stage_action === "approval.create")!;
      expect(approval.eligible, `${variant.name}/${role}/retained=${retained}`).toBe(!retained);
    }
    expect(STAGE_ACTIONS.filter(a => /^(canary|live)\./.test(a))).toHaveLength(7);
  });
});
