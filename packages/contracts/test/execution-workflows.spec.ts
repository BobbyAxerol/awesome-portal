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
  WorkflowNavigation: c.workflowNavigation, WorkflowReadState: c.workflowReadState,
  WorkflowCriteriaCapsules: c.workflowCriteriaCapsules, WorkflowRecordedPortal: c.workflowRecordedPortal };
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
  it("JSON and runtime preserve non-amount target receipts without weakening amount operations or UNKNOWN", () => {
    for (const id of ["W08-ROOT-LIMIT-NONAMOUNT", "W08-TARGET-BUDGET-REJECTED-NONAMOUNT"]) {
      const target = story(id);
      const accepts = (v: unknown) => {
        expect(validate("WorkflowCapital", v)).toBe(true);
        expect(c.workflowCapital.safeParse(v).success).toBe(true);
      };
      const rejects = (v: unknown) => {
        expect(validate("WorkflowCapital", v)).toBe(false);
        expect(c.workflowCapital.safeParse(v).success).toBe(false);
      };
      accepts(target);
      expect(target.status.business.amounts).toBeNull();
      for (const field of ["receipt_ref", "source_event_ref", "revision"])
        rejects({ ...target, status: { ...target.status, business: { ...target.status.business, [field]: null } } });
      rejects({ ...target, status: { ...target.status, business: { ...target.status.business, state: "UNKNOWN" } } });
      accepts({ ...target, status: { ...target.status, business: {
        state: "UNKNOWN", receipt_ref: null, source_event_ref: null, revision: null, amounts: null,
      } } });
      for (const operation of ["FUND", "INITIAL_GRANT", "TOP_UP", "IMMEDIATE_DECREASE", "RECALL_PARTIAL", "RECALL_FULL"])
        rejects({ ...target, status: { ...target.status, operation },
          effect_kind: operation === "FUND" ? "ECONOMIC_ASSIGNMENT" : "MANAGEMENT_BUDGET" });
    }
  });
  it("structural Create parity covers all nine states, exact zero and precedence without a new runtime derivation", () => {
    const cases = fixture.cases.filter((v: any) => v.schema === "WorkflowCreate");
    expect([...new Set(cases.map((v: any) => v.response.state))].sort()).toEqual([...c.workflowCreateState.options].sort());
    const base = story("W08-CREATED-FUNDED");
    const step = (state: ReturnType<typeof c.workflowReceiptStep.parse>["state"]) => ({ state, receipt_ref: state === "APPLIED" ? "TEST_ONLY:" + state : null });
    // 864 bounded combinations: zero/nonzero capital and budget, every receipt
    // step state, including UNKNOWN beating REJECTED and both beating create.
    for (const capital of ["0.000", "100.000000000000000001"])
      for (const budget of ["0", "20.000000000000000001"])
        for (const create of c.workflowReceiptStep.innerType().shape.state.options)
          for (const fund of c.workflowReceiptStep.innerType().shape.state.options)
            for (const grant of c.workflowReceiptStep.innerType().shape.state.options) {
              const v = { ...base, requested_economic_capital: capital, requested_initial_budget: budget,
                create: step(create), fund: step(fund), initial_grant: step(grant) };
              v.state = c.deriveCreateWorkflowState(v);
              const expected = c.workflowCreate.safeParse(v).success;
              const label = [capital, budget, create, fund, grant, v.state].join("/");
              expect(validate("WorkflowCreate", v), label).toBe(expected);
              if (expected) for (const forged of c.workflowCreateState.options.filter(s => s !== v.state)) {
                expect(c.workflowCreate.safeParse({ ...v, state: forged }).success, label + "/" + forged).toBe(false);
                expect(validate("WorkflowCreate", { ...v, state: forged }), label + "/" + forged).toBe(false);
              }
            }
  });
  it("Lifecycle structural parity preserves exact stages, complete counts and the narrower RESUME rule", () => {
    const base = story("W08-MOVE-REVIEW-ONLY");
    const check = (v: any, expected: boolean, label: string) => {
      expect(c.workflowLifecycle.safeParse(v).success, label).toBe(expected);
      expect(validate("WorkflowLifecycle", v), label).toBe(expected);
    };
    for (const environment of ["paper", "sandbox", "live"])
      for (const stage of ["PAPER", "SANDBOX", "CANARY", "LIVE"])
        check({ ...base, context: { ...base.context, environment }, financial_stage: stage },
          environment === "paper" ? stage === "PAPER" : environment === "sandbox" ? stage === "SANDBOX" : ["CANARY", "LIVE"].includes(stage),
          environment + "/" + stage);
    for (const operation of ["MOVE_ASSIGNMENT", "REBIND", "ARCHIVE", "RESUME"]) {
      const current = { ...base, operation, lifecycle: operation === "ARCHIVE" ? "ARCHIVE_REQUESTED" : "ACTIVE" };
      check(current, true, operation + "/drained");
      for (const key of Object.keys(c.workflowObligationCounts.shape)) for (const n of [null, 1]) {
        check({ ...current, obligations: { ...current.obligations, counts: { ...current.obligations.counts, [key]: n } } },
          n !== null && operation === "RESUME" && !["locks", "recalls", "unknown_outcomes"].includes(key),
          operation + "/" + key + "/" + n);
      }
    }
    for (const field of ["source_budget_return", "destination_budget_grant", "economic_settlement"]) {
      const v = { ...base, [field]: { state: "NOT_REQUESTED", receipt_ref: null } };
      check(v, false, field + "/ready");
      check({ ...v, state: "BLOCKED", reason_code: "ASSIGNMENT_RECEIPTS_REQUIRED" }, true, field + "/blocked");
    }
    for (const field of ["coverage", "freshness", "source_receipt_ref"])
      check({ ...base, obligations: { ...base.obligations, [field]: field === "coverage" ? "PARTIAL" : field === "freshness" ? "STALE" : null } }, false, field);
    check({ ...base, state: "BLOCKED" }, false, "blocked-without-reason");
    check({ ...base, state: "PENDING_DRAIN" }, false, "pending-without-reason");
    check({ ...base, reason_code: "SOURCE_NOT_QUALIFIED" }, false, "ready-with-reason");
    check({ ...base, operation: "REACTIVATE" }, false, "reactivation-is-never-ready");
    check({ ...base, lifecycle: "ARCHIVED" }, false, "archived-move");
    check({ ...base, operation: "RESUME", lifecycle: "ARCHIVE_REQUESTED" }, false, "resume-archive-requested");
    for (const remaining_budget of [null, "1", "0.000000000000000001"])
      check({ ...base, operation: "ARCHIVE", lifecycle: "ARCHIVE_REQUESTED", remaining_budget }, false, "archive-budget");
    check({ ...base, operation: "ARCHIVE", lifecycle: "ACTIVE" }, false, "archive-needs-disposition");
    check({ ...base, operation: "ARCHIVE", lifecycle: "ARCHIVE_REQUESTED", remaining_budget: "0.000" }, true, "archive-zero");
  });
  it("provisioned monitors require all lineage fields but only RUNNING requires an observation", () => {
    const base = story("W08-PAPER-MONITOR-LINEAGE");
    const check = (v: any, expected: boolean, label: string) => {
      expect(c.workflowLifecycle.safeParse(v).success, label).toBe(expected);
      expect(validate("WorkflowLifecycle", v), label).toBe(expected);
    };
    for (const field of ["deployment_id", "origin_deployment_id", "alpha_version_id", "params_digest", "lineage_receipt_ref",
      "reason", "effective_at_ms", "approved_config_digest", "virtual_capital", "currency", "last_observation_ms"])
      check({ ...base, monitor: { ...base.monitor, [field]: null } }, false, "monitor/" + field);
    for (const state of ["PAUSED", "STALE", "QUOTA_STOPPED"])
      check({ ...base, monitor: { ...base.monitor, state, last_observation_ms: null } }, true, state + "/no-observation");
    check(base, true, "running");
  });
  it("Navigation structural parity preserves nullable origins, ALL context and exact gate/stage mappings", () => {
    const base = story("W08-MANAGER-NAVIGATION");
    const check = (v: any, expected: boolean, label: string) => {
      expect(c.workflowNavigation.safeParse(v).success, label).toBe(expected);
      expect(validate("WorkflowNavigation", v), label).toBe(expected);
    };
    check({ ...base, origin: null, window: null }, true, "nullable");
    for (const environment of [null, "paper", "sandbox", "live"]) {
      check({ ...base, financial_stage_filter: "ALL", environment }, true, "ALL/" + environment);
      for (const stage of ["PAPER", "SANDBOX", "CANARY", "LIVE"])
        check({ ...base, financial_stage_filter: stage, environment },
          environment === ({ PAPER: "paper", SANDBOX: "sandbox", CANARY: "live", LIVE: "live" } as Record<string, string>)[stage],
          stage + "/" + environment);
    }
    check({ ...base, origin: { ...base.origin, gate: "PAPER_EXIT", review_id: null } }, false, "exit-needs-review");
    check({ ...base, origin: { ...base.origin, gate: "PAPER_EXIT", review_id: "TEST_ONLY:review" } }, true, "exit-review");
    for (const gate of ["R1", "R2", "LIVE_GATE"])
      check({ ...base, origin: { ...base.origin, gate, review_id: null } }, true, gate);
  });
  it("Confirmation independently requires provenance for every non-null capacity including exact zero", () => {
    const base = story("W08-CONFIRM-SOURCE-DARK");
    const check = (v: any, expected: boolean, label: string) => {
      expect(c.workflowConfirmation.safeParse(v).success, label).toBe(expected);
      expect(validate("WorkflowConfirmation", v), label).toBe(expected);
    };
    check(base, true, "all-null");
    check(story("W08-CONFIRM-PARTIAL-CAPACITY"), true, "partial-capacity");
    for (const block of ["before", "projected_after"]) {
      for (const field of ["economic_backing", "margin_risk_budget", "exposure_cap"])
        for (const value of ["0", "0.000", "0.000000000000000001"])
          for (const source_receipt_ref of [null, "TEST_ONLY:capacity-source"])
            for (const source_as_of_ms of [null, 0]) {
              const v = { ...base, [block]: { ...base[block], [field]: value, source_receipt_ref, source_as_of_ms } };
              check(v, source_receipt_ref !== null && source_as_of_ms !== null,
                [block, field, value, source_receipt_ref, source_as_of_ms].join("/"));
            }
      // Metadata is permitted independently when all three amounts are null.
      check({ ...base, [block]: { ...base[block], source_receipt_ref: "TEST_ONLY:metadata-only" } }, true, block + "/only-ref");
      check({ ...base, [block]: { ...base[block], source_as_of_ms: 0 } }, true, block + "/only-time");
      const other = block === "before" ? "projected_after" : "before";
      check({ ...base, [block]: { ...base[block], economic_backing: "0" },
        [other]: { ...base[other], source_receipt_ref: "TEST_ONLY:other-block", source_as_of_ms: 0 } }, false, block + "/no-borrowed-provenance");
      check({ ...base, [block]: { ...base[block], economic_backing: "0", source_receipt_ref: "", source_as_of_ms: 0 } }, false, block + "/empty-ref");
      check({ ...base, [block]: { ...base[block], economic_backing: 0, source_receipt_ref: "TEST_ONLY:ref", source_as_of_ms: 0 } }, false, block + "/no-decimal-coercion");
    }
  });
  it("documents relational constraints as runtime-only instead of claiming ordinary JSON sibling comparison", () => {
    const navigation = story("W08-MANAGER-NAVIGATION");
    for (const from_ms of [navigation.window.to_ms, navigation.window.to_ms + 1]) {
      const v = { ...navigation, window: { ...navigation.window, from_ms } };
      expect(c.workflowNavigation.safeParse(v).success).toBe(false);
      expect(validate("WorkflowNavigation", v)).toBe(true);
    }
    const monitor = story("W08-PAPER-MONITOR-LINEAGE");
    for (const patch of [{ deployment_id: monitor.monitor.origin_deployment_id },
      { last_observation_ms: monitor.monitor.effective_at_ms - 1 }]) {
      const v = { ...monitor, monitor: { ...monitor.monitor, ...patch } };
      expect(c.workflowLifecycle.safeParse(v).success).toBe(false);
      expect(validate("WorkflowLifecycle", v)).toBe(true);
    }
    // Existing Capital context correlation and decimal partition stay runtime-
    // only; their dedicated tests/emitter and canonical Score refs are untouched.
  });
});
