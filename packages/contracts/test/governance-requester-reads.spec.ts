// FE-068 stage-action eligibility + FE-069 approval-request lookup: published JSON Schema parity with the
// runtime code that serves them, canonical TEST_ONLY fixtures, and the exact route/shape surface.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";
import { stageActionEligibility, STAGE_ACTIONS } from "../../../apps/control-api/src/governance/stage-action-eligibility";
import { approvalRequestLookup } from "../../../apps/control-api/src/governance/approval-request-lookup";
import { paperExitParent, paperExitParentQuery } from "../../../apps/control-api/src/governance/paper-exit-parent";

const root = resolve(__dirname, "..");
const load = (path: string) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const api = load("openapi/execution-governance.openapi.json");
const fixture = load("fixtures/governance-requester-reads.synthetic.valid.json");
const ajv = new Ajv2020({ strict: false, allErrors: true }); addFormats(ajv);
ajv.addSchema(load("schemas/execution-governance-approval-workflow.v1.schema.json"),
  "https://contracts.test/schemas/execution-governance-approval-workflow.v1.schema.json");
ajv.addSchema(load("schemas/execution-governance-review-context.v1.schema.json"),
  "https://contracts.test/schemas/execution-governance-review-context.v1.schema.json");
const compiled = new Map<string, ReturnType<typeof ajv.compile>>();
const compile = (name: string) => {
  if (!compiled.has(name)) compiled.set(name, ajv.compile({ $id: "https://contracts.test/openapi/" + name + ".json", $ref: "#/components/schemas/" + name,
    components: { schemas: api.components.schemas } }));
  return compiled.get(name)!;
};
const copy = <T>(value: T): T => structuredClone(value);
function both(name: string, runtime: { safeParse(value: unknown): { success: boolean } }, value: unknown, expected: boolean) {
  const validate = compile(name);
  expect(validate(value), JSON.stringify(validate.errors)).toBe(expected);
  expect(runtime.safeParse(value).success).toBe(expected);
}

describe("FE-068 stage-action eligibility contract", () => {
  const cases = Object.entries(fixture.stage_action_eligibility) as [string, any][];
  it("publishes one private GET with no actor/role/action selector and a Problem default", () => {
    const path = api.paths["/api/v1/execution/governance/stage-action-eligibility"];
    expect(Object.keys(path)).toEqual(["get"]);
    expect(path.get.operationId).toBe("executionStageActionEligibilityV1");
    expect(path.get.parameters).toEqual([{ $ref: "#/components/parameters/WorkspaceId" }]);
    expect(path.get.responses["200"].headers["Cache-Control"].schema.const).toBe("private, no-store");
    expect(path.get.responses.default).toEqual({ $ref: "#/components/responses/Problem" });
  });
  it.each(cases)("fixture %s passes JSON Schema and runtime identically", (_name, value) => {
    both("StageActionEligibility", stageActionEligibility, value, true);
    both("StageActionEligibility", stageActionEligibility, { ...value, grant_ref: "x" }, false);
    expect(value.actions.map((row: any) => row.stage_action)).toEqual([...STAGE_ACTIONS]);
  });
  it("covers every verdict and reason the producer can emit, and none it cannot", () => {
    const rows = cases.flatMap(([, value]) => value.actions as any[]);
    expect(new Set(rows.map(row => row.reason_class))).toEqual(new Set(["SUBMIT_CHECKS_REQUIRED", "RETAINED_REVIEW_READ_ONLY",
      "ADMIN_ROLE_REQUIRED", "GOVERNANCE_CAPABILITY_REQUIRED", "GOVERNANCE_SCOPE_MISMATCH", "CAPTURE_PROJECTION_NOT_AUTHORIZED",
      "COMMAND_FAMILY_NOT_COMMISSIONED"]));
    expect(new Set(rows.map(row => row.verdict))).toEqual(new Set(["ELIGIBLE", "NOT_ELIGIBLE", "NOT_COMMISSIONED"]));
    expect(fixture.stage_action_eligibility.session_step_up_active.session_step_up.state).toBe("ACTIVE");
    expect(fixture.stage_action_eligibility.admin_with_r2_read.session_step_up).toEqual({ state: "NOT_ACTIVE", valid_until_ms: null });
  });
  it("both validators refuse the same inconsistent rows (no divergence between schema and runtime)", () => {
    const good = fixture.stage_action_eligibility.admin_with_r2_read;
    const mutations: Array<(v: any) => void> = [
      v => { v.actions[0].eligible = false; }, v => { v.actions[1].reason_class = "ADMIN_ROLE_REQUIRED"; },
      v => { v.actions[1].public_copy_key = "ADMIN_ROLE_REQUIRED"; }, v => { v.actions[0].basis = "ADMIN_ROLE"; },
      v => { v.actions[0].step_up_required = true; }, v => { v.actions[0].step_up_state = "NOT_DETERMINED"; },
      v => { v.actions[0].alpha_scope = null; }, v => { v.actions[2].alpha_scope = "WORKSPACE_ALL_COMPLETED_RUNS"; },
      v => { v.actions[3].verdict = "ELIGIBLE"; }, v => { v.actions[3].reason_class = "ADMIN_ROLE_REQUIRED"; v.actions[3].public_copy_key = "ADMIN_ROLE_REQUIRED"; },
      v => { v.actions[3].step_up_required = false; v.actions[3].step_up_state = "NOT_REQUIRED"; },
      v => { v.actions.reverse(); }, v => { v.actions.pop(); }, v => { v.actions.push(copy(v.actions[0])); },
      v => { v.session_step_up = { state: "ACTIVE", valid_until_ms: null }; },
      v => { v.session_step_up = { state: "NOT_ACTIVE", valid_until_ms: 1 }; },
      v => { v.current_only = false; }, v => { v.schema_version = "portal.stage-action-eligibility.v2"; },
    ];
    for (const mutate of mutations) { const bad = copy(good); mutate(bad); both("StageActionEligibility", stageActionEligibility, bad, false); }
  });
});

describe("FE-069 approval request lookup contract", () => {
  const cases = Object.entries(fixture.approval_request_lookup) as [string, any][];
  it("publishes one private GET: request_key required, payload optional, no actor selector", () => {
    const path = api.paths["/api/v1/execution/governance/approvals/request-lookup"];
    expect(Object.keys(path)).toEqual(["get"]);
    expect(path.get.operationId).toBe("executionApprovalRequestLookupV1");
    const names = path.get.parameters.map((p: any) => p.name ?? p.$ref);
    expect(names).toEqual(["#/components/parameters/WorkspaceId", "request_key", "alpha_id", "evidence_run_id", "methodology_claim_id", "summary"]);
    expect(path.get.parameters.find((p: any) => p.name === "request_key").required).toBe(true);
    expect(path.get.parameters.filter((p: any) => p.name && p.name !== "request_key").every((p: any) => p.required === false)).toBe(true);
    expect(path.get.responses["200"].headers["Cache-Control"].schema.const).toBe("private, no-store");
  });
  it.each(cases)("fixture %s passes JSON Schema and runtime identically", (_name, value) => {
    both("ApprovalRequestLookup", approvalRequestLookup, value, true);
    both("ApprovalRequestLookup", approvalRequestLookup, { ...value, requester_user_id: "usr_other" }, false);
  });
  it("FOUND carries exactly the replay body; the decision table cannot be contradicted in either validator", () => {
    expect(fixture.approval_request_lookup.found_not_compared.result).toMatchObject({
      schema_version: "governance.approval-create.v1", replayed: true, approval: { gate: "R1", status: "PENDING" } });
    expect(fixture.approval_request_lookup.none).toMatchObject({ state: "NONE", payload_check: "NOT_COMPARED", result: null });
    expect(fixture.approval_request_lookup.key_payload_conflict).toMatchObject({ state: "KEY_PAYLOAD_CONFLICT", payload_check: "MISMATCH", result: null });
    const found = fixture.approval_request_lookup.found_payload_match;
    for (const bad of [{ ...found, payload_check: "MISMATCH" }, { ...found, result: null }, { ...found, result: { ...found.result, replayed: false } },
      { ...fixture.approval_request_lookup.none, payload_check: "MATCH" }, { ...fixture.approval_request_lookup.none, result: found.result },
      { ...fixture.approval_request_lookup.key_payload_conflict, result: found.result },
      { ...fixture.approval_request_lookup.key_payload_conflict, payload_check: "NOT_COMPARED" },
      { ...found, request_key: "-bad" }, { ...found, state: "CREATED" }])
      both("ApprovalRequestLookup", approvalRequestLookup, bad, false);
  });
});

describe("RV-10 Paper exit parent contract", () => {
  const cases = Object.entries(fixture.paper_exit_parent) as [string, any][];
  it("publishes one private GET: deployment_id required, workspace optional, no actor or approval selector", () => {
    const path = api.paths["/api/v1/execution/governance/paper-exit/parent"];
    expect(Object.keys(path)).toEqual(["get"]);
    expect(path.get.operationId).toBe("executionPaperExitParentV1");
    expect(path.get.parameters.map((p: any) => p.name ?? p.$ref)).toEqual(["#/components/parameters/WorkspaceId", "deployment_id"]);
    expect(path.get.parameters.find((p: any) => p.name === "deployment_id").required).toBe(true);
    expect(path.get.responses["200"].headers["Cache-Control"].schema.const).toBe("private, no-store");
    expect(path.get.responses.default).toEqual({ $ref: "#/components/responses/Problem" });
    expect(paperExitParentQuery.safeParse({ deployment_id: "dep_1" }).success).toBe(true);
    for (const bad of [{}, { deployment_id: "" }, { deployment_id: "a b" }, { deployment_id: "dep_1", approval_id: "apr_1" }, { deployment_id: "dep_1", workspace_id: "ab" }])
      expect(paperExitParentQuery.safeParse(bad).success).toBe(false);
  });
  it.each(cases)("fixture %s passes JSON Schema and runtime identically", (_name, value) => {
    both("PaperExitParent", paperExitParent, value, true);
    both("PaperExitParent", paperExitParent, { ...value, approval_id: "apr_other" }, false);
  });
  it("NONE has no context; FOUND carries exactly the R2 review's PAPER_EXIT_CREATE capture context, available or blocked with its typed reason", () => {
    const f = fixture.paper_exit_parent;
    expect(f.none).toMatchObject({ state: "NONE", capture_context: null, source_side_effect_requested: false });
    expect(f.found_available.capture_context).toMatchObject({ action: "PAPER_EXIT_CREATE", availability: { state: "AVAILABLE", reason_code: null },
      parent_approval_id: "apr_TEST_ONLY_r2", expected_parent_version: 3, candidates: [{ deployment_id: "deployment_TEST_ONLY", risk_grant_id: null }] });
    expect(f.found_available.capture_context.expected_projection_digest).toMatch(/^sha256:[0-9a-f]{64}$/);
    for (const [name, code] of [["found_blocked_r2_not_approved", "R2_APPROVAL_REQUIRED"], ["found_blocked_not_admin", "ADMIN_ROLE_REQUIRED"], ["found_blocked_expired", "APPROVAL_EXPIRED"]] as const) {
      expect(f[name].capture_context).toMatchObject({ availability: { state: "BLOCKED", reason_code: code }, expected_projection_digest: null, candidates: [] });
    }
  });
  it("both validators refuse the same inconsistent bodies (state and context agree; PAPER_EXIT_CREATE only)", () => {
    const f = fixture.paper_exit_parent;
    const mutations: Array<(v: any) => void> = [
      v => { v.state = "NONE"; }, v => { v.capture_context = null; }, v => { v.state = "CREATED"; },
      v => { v.capture_context.action = "R2_CREATE"; v.capture_context.candidates[0].risk_grant_id = "risk_1"; },
      v => { v.source_side_effect_requested = true; }, v => { v.record_authority = "SOURCE"; },
      v => { v.schema_version = "governance.paper-exit-parent.v2"; }, v => { delete v.deployment_id; },
      v => { v.capture_context.expected_projection_digest = null; },
    ];
    for (const mutate of mutations) { const bad = copy(f.found_available); mutate(bad); both("PaperExitParent", paperExitParent, bad, false); }
    const none = copy(f.none); none.state = "FOUND"; both("PaperExitParent", paperExitParent, none, false);
  });
  it("the runtime also refuses a context for another workspace or another deployment (not expressible in JSON Schema)", () => {
    const other = copy(fixture.paper_exit_parent.found_available);
    other.capture_context.workspace_id = "ws_OTHER";
    expect(paperExitParent.safeParse(other).success).toBe(false);
    const elsewhere = copy(fixture.paper_exit_parent.found_available);
    elsewhere.capture_context.candidates[0].deployment_id = "deployment_OTHER";
    expect(paperExitParent.safeParse(elsewhere).success).toBe(false);
  });
});

describe("governance requester-reads generator", () => {
  it("is idempotent and leaves every pre-existing governance path intact", () => {
    const original = Object.keys(api.paths).filter(path => !/stage-action-eligibility|request-lookup|paper-exit\/parent/.test(path));
    expect(original).toContain("/api/v1/execution/governance/approvals");
    expect(original).toContain("/api/v1/execution/governance/approvals/history");
    expect(api.components.schemas.StageActionEligibilityRow).toBeDefined();
    expect(api.info.version).toBe("1.7.0");
  });
});
