import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";
import * as c from "../../../apps/control-api/src/execution-v2/workflow.contract";
import { accessAction } from "../../../apps/control-api/src/execution-v2/access.contract";
const root = resolve(__dirname, ".."), load = (p: string) => JSON.parse(readFileSync(resolve(root, p), "utf8"));
const api = load("openapi/execution-workflows.openapi.json"), schema = load("schemas/execution-workflows.v1.schema.json");
const fixture = load("fixtures/execution-workflows.synthetic.valid.json");
const ajv = new Ajv2020({ strict: false, allErrors: true }); ajv.addSchema(schema);
const validate = (name: string, v: unknown) => ajv.getSchema(`${schema.$id}#/$defs/${name}`)!(v);
const runtime: Record<string, { safeParse: (v: unknown) => { success: boolean } }> = { WorkflowCreate: c.workflowCreate,
  WorkflowCapital: c.workflowCapital, WorkflowLifecycle: c.workflowLifecycle, WorkflowConfirmation: c.workflowConfirmation,
  WorkflowNavigation: c.workflowNavigation, WorkflowReadState: c.workflowReadState };
const story = (id: string) => structuredClone(fixture.cases.find((v: any) => v.id === id).response);

describe("ELP2-08 generated workflow contract", () => {
  it("is schema-only; no public endpoint can install trusted workflow facts", () => {
    expect(api.paths).toEqual({}); expect(fixture.lane).toBe("TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT");
    expect(fixture.production_config).toBe(false);
    expect(api.components.schemas.WorkflowCapital.properties.status.$ref).toBe("#/components/schemas/CommandStatus");
    expect(api.components.schemas.WorkflowScorePresentation.properties.canonical_score.$ref).toBe("#/components/schemas/ScoreCapsule");
    expect(api.components.schemas.ScoreCapsule).toEqual(load("openapi/execution-v2-foundation.openapi.json").components.schemas.ScoreCapsule);
    expect(api.components.schemas.CommandStatus).toEqual(load("openapi/execution-trusted-commands.openapi.json").components.schemas.CommandStatus);
  });
  it.each(fixture.cases)("$id / $schema is canonical synthetic schema and runtime-compatible", (v: any) => {
    expect(validate(v.schema, v.response), v.id).toBe(true);
    if (runtime[v.schema]) expect(runtime[v.schema].safeParse(v.response).success, v.id).toBe(true);
    expect(validate(v.schema, { ...v.response, jwt: "forbidden" })).toBe(false);
  });
  it("T08-01 presets have equal manager visibility, not equal mutation or delegation", () => {
    expect(fixture.presets).toHaveLength(3);
    const [owner, manager, researcher] = fixture.presets;
    expect(owner.business_visibility).toBe(manager.business_visibility);
    expect(owner.delegation_ceiling).not.toBe(manager.delegation_ceiling);
    for (const p of fixture.presets) expect(p.mutation_scope).toBe("EXPLICIT_CAPABILITIES_ONLY");
    expect(researcher.business_visibility).toBe("OWN_AUTHORIZED_SLICE");
    expect(researcher.delegation_ceiling).toBe("NONE_BY_DISCOVERY");
    // Discovery navigation has no portfolio money, peer count, rank or denominator.
    const own = story("W08-OWN-SLICE-NAVIGATION");
    for (const key of ["nav", "peer_count", "rank", "provisional_allocated_weight", "portfolio_total"])
      expect(validate("WorkflowNavigation", { ...own, [key]: "hidden" })).toBe(false);
  });
  it("T08-11 all ten screens preserve known source routes vs proposed/refined routes", () => {
    expect(fixture.screens.map((s: any) => s.screen_id)).toEqual(Array.from({ length: 10 }, (_, i) => `M${String(i + 1).padStart(2, "0")}`));
    for (const s of fixture.screens) { expect(validate("WorkflowScreen", s)).toBe(true); expect(s.source_qualified).toBe(false); }
    for (const id of ["M01", "M08"]) expect(fixture.screens.find((s: any) => s.screen_id === id)).toMatchObject({ ui_route: null, route_state: "PROPOSED" });
    expect(fixture.screens.find((s: any) => s.screen_id === "M02").route_state).toBe("EXISTING_DETAIL_REQUIRES_DIRECTORY_REFINEMENT");
  });
  it("covers every advertised action without inventing a runtime or weaker capability alias", () => {
    expect(fixture.actions).toHaveLength(24);
    const command = load("openapi/execution-trusted-commands.openapi.json");
    const ops = Object.values(command.paths).flatMap((p: any) => Object.values(p).map((m: any) => m.operationId));
    for (const a of fixture.actions) {
      expect(validate("WorkflowAction", a)).toBe(true); expect(a.runtime_enabled).toBe(false);
      if (a.capability_ref !== null) expect(accessAction.safeParse(a.capability_ref).success).toBe(true);
      for (const field of ["preview_operation_id", "submit_operation_id", "status_operation_id"])
        if (a[field]) expect(ops).toContain(a[field]);
    }
    for (const op of ["RETURN_CAPITAL", "CANCEL_REMAINING", "ADMIN_UNLOCK", "HALT", "ARCHIVE"]) {
      const a = fixture.actions.find((v: any) => v.operation === op);
      expect(a.submit_operation_id).toBeNull(); expect(a.commissioning).not.toBe("TECHNICAL_SOURCE_DARK");
    }
  });
  it("T08-14/15 canonical q73.3 remains fair/provisional, contribution has no band", () => {
    const raw = story("W08-Q73-3"), contribution = story("W08-CONTRIBUTION");
    expect(raw.canonical_score).toMatchObject({ value: "73.3", quality_band: "fair", status: "provisional", components: { P: "80", R: "66", B: "70" } });
    expect(contribution.canonical_score).toMatchObject({ value: "18.325", quality_band: null, allocation_weight: "0.25" });
    expect(validate("WorkflowScorePresentation", { ...contribution, canonical_score: { ...contribution.canonical_score, quality_band: "fair" } })).toBe(false);
    expect(validate("WorkflowScorePresentation", { ...raw, canonical_score: { ...raw.canonical_score, value: "74.999", quality_band: "good" } })).toBe(false);
    expect(validate("WorkflowScorePresentation", { ...raw, canonical_score: { ...raw.canonical_score, value: "74.999", quality_band: "fair" } })).toBe(true);
    const pending = story("W08-POLICY-PENDING"); expect(pending.canonical_score.value).toBeNull();
    expect(validate("WorkflowScorePresentation", { ...pending, canonical_score: { ...pending.canonical_score, value: "0" } })).toBe(false);
  });
  it("T08-16 Early/mixed diagnostics never become actual headline or hide actual duration", () => {
    const early = story("W08-EARLY-5D"), mixed = story("W08-MIXED-70D-ACTUAL-10D");
    expect(early.canonical_score.effective_window).not.toEqual(early.canonical_score.requested_window);
    expect(early.canonical_score.observed_duration_ms).toBe(5 * 86400000);
    expect(mixed.canonical_score.observed_duration_ms).toBe(70 * 86400000);
    expect(mixed.canonical_score.actual_duration_ms).toBe(10 * 86400000);
    for (const v of [early, mixed]) expect(validate("WorkflowScorePresentation", { ...v, headline: "CONSOLIDATED_NAV_QUALITY" })).toBe(false);
    expect(validate("WorkflowScorePresentation", { ...mixed, public_copy_key: "CANONICAL_SCORE" })).toBe(false);
  });
  it("T08-17 score/Regime state cannot authorize or block safety commands", () => {
    for (const v of fixture.cases.filter((v: any) => v.schema === "WorkflowScorePresentation")) {
      expect(v.response.analytics_gates_safety_action).toBe(false); expect(v.response.regime_changes_score).toBe(false);
      expect(validate(v.schema, { ...v.response, analytics_gates_safety_action: true })).toBe(false);
    }
  });
  it("bounded public schema rejects broad JSON/proxy and non-ms time values", () => {
    const n = story("W08-MANAGER-NAVIGATION");
    expect(validate("WorkflowNavigation", { ...n, redirect: "https://source.invalid" })).toBe(false);
    const r = story("W08-READ-READY");
    expect(validate("WorkflowReadState", { ...r, observed_at_ms: "2026-10-16" })).toBe(false);
    const capital = story("W08-PARTIAL");
    expect(validate("WorkflowCapital", { ...capital, status: { ...capital.status, business: { ...capital.status.business,
      amounts: { ...capital.status.business.amounts, requested: 1000 } } } })).toBe(false);
  });
  it("JSON consumers cannot accept protected stale data or an unfunded success headline", () => {
    const denied = story("W08-READ-DENIED"), create = story("W08-CREATED-UNFUNDED");
    expect(validate("WorkflowReadState", { ...denied, may_display_data: true })).toBe(false);
    expect(validate("WorkflowCreate", { ...create, state: "CREATED_WITH_CAPITAL" })).toBe(false);
    const move = story("W08-MOVE-REVIEW-ONLY");
    expect(validate("WorkflowLifecycle", { ...move, source_budget_return: { state: "APPLIED", receipt_ref: null } })).toBe(false);
    expect(validate("WorkflowLifecycle", { ...move, obligations: { ...move.obligations, coverage: "PARTIAL" } })).toBe(false);
  });
});
