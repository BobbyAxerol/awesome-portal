import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");
const load = (path: string): any => JSON.parse(readFileSync(join(ROOT, path), "utf8"));
const FAMILY = "https://schemas.primusspark.com/portal/execution-stage-facts.v1.schema.json";

function registry(): Ajv2020 {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  for (const name of readdirSync(join(ROOT, "schemas"))) ajv.addSchema(load(`schemas/${name}`));
  return ajv;
}
const ajv = registry();
const validate = (id: string) => {
  const found = ajv.getSchema(id);
  expect(found, id).toBeDefined();
  return found!;
};
const ok = (id: string, value: unknown) => {
  const check = validate(id);
  expect(check(value), JSON.stringify(check.errors)).toBe(true);
};
const refuses = (id: string, value: unknown) => expect(validate(id)(value)).toBe(false);

describe("BE-P2 / FE-067 typed stage facts", () => {
  it("validates the dark and the explicitly synthetic populated fixtures", () => {
    const dark = load("fixtures/execution-stage-facts.unavailable.valid.json");
    const populated = load("fixtures/execution-stage-facts.source-backed.synthetic.valid.json");
    expect(dark.lane).toBe("CONTRACT_EXAMPLE_NOT_PRODUCT_RECEIPT");
    expect(populated.lane).toBe("TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT");
    expect(populated.runtime_qualified).toBe(false);
    ok(`${FAMILY}#/$defs/StageFacts`, dark.value);
    ok(`${FAMILY}#/$defs/StageFacts`, populated.value);
  });

  it("never lets a missing source read as zero, empty or healthy", () => {
    const dark = load("fixtures/execution-stage-facts.unavailable.valid.json").value;
    for (const fact of [dark.runtime.runtime_state, dark.runtime.since, dark.reconciliation.verdict, dark.reconciliation.open_finding_count, dark.reconciliation.unknown_order_count]) {
      expect(fact).toMatchObject({ availability: "NOT_PUBLISHED", value: null });
      expect(fact.reason_code).toMatch(/^[A-Z][A-Z0-9_]+$/);
    }
    expect(dark.sessions).toMatchObject({ availability: "NOT_PUBLISHED", rows: [], returned_count: 0, source_complete: null });
  });

  it("refuses the shapes that would invent a fact", () => {
    const id = `${FAMILY}#/$defs/StageFacts`;
    const base = load("fixtures/execution-stage-facts.source-backed.synthetic.valid.json").value;
    const mutate = (change: (copy: any) => void) => { const copy = structuredClone(base); change(copy); return copy; };
    refuses(id, mutate((c) => { c.runtime.runtime_state.value = "ACTIVE"; }));
    refuses(id, mutate((c) => { c.runtime.runtime_state.value = null; }));
    refuses(id, mutate((c) => { c.runtime.since = { availability: "NOT_PUBLISHED", value: null, reason_code: null }; }));
    refuses(id, mutate((c) => { c.runtime.since = { availability: "NOT_PUBLISHED", value: "2026-10-12T08:00:00Z", reason_code: "X_Y" }; }));
    refuses(id, mutate((c) => { c.reconciliation.verdict.value = "CLEAN"; }));
    refuses(id, mutate((c) => { c.reconciliation.open_finding_count.value = -1; }));
    refuses(id, mutate((c) => { c.sessions.availability = "NOT_PUBLISHED"; }));
    refuses(id, mutate((c) => { c.sessions.rows[0].started = "not a time"; }));
    refuses(id, mutate((c) => { c.sessions.rows[0].state = "has space"; }));
    refuses(id, mutate((c) => { c.sessions.rows.length = 0; c.sessions.rows.push(...Array(51).fill(base.sessions.rows[0])); }));
    refuses(id, mutate((c) => { c.injected = true; }));
    refuses(id, mutate((c) => { delete c.sessions; }));
  });

  it("is optional on the Sandbox, Canary and Live Full bodies, and valid when present", () => {
    const bodies: Array<[string, string]> = [
      ["fixtures/execution-sandbox-certification.unavailable.valid.json", "https://schemas.primusspark.com/portal/execution-sandbox-certification.v1.schema.json#/$defs/CertificationResponse"],
      ["fixtures/execution-canary-control-room.unavailable.valid.json", "https://schemas.primusspark.com/portal/execution-canary-control-room.v1.schema.json#/$defs/CanaryControlRoom"],
      ["fixtures/execution-live-full-operations.unavailable.valid.json", "https://schemas.primusspark.com/portal/execution-live-full-operations.v1.schema.json#/$defs/LiveFullOperations"],
    ];
    for (const [file, id] of bodies) {
      const body = load(file);
      expect(body.stage_facts.schema_version, file).toBe("execution.stage-facts.v1");
      ok(id, body);
      // Backward compatible: a producer that predates the member still validates.
      const old = structuredClone(body);
      delete old.stage_facts;
      ok(id, old);
      refuses(id, { ...body, stage_facts: { ...body.stage_facts, runtime: undefined } });
    }
  });

  it("carries the same definitions inline in the Paper standalone schema and OpenAPI", () => {
    const family = load("schemas/execution-stage-facts.v1.schema.json").$defs;
    const standalone = load("schemas/execution-paper-read.v1.schema.json");
    const api = load("openapi/execution-paper-read.openapi.json").components.schemas;
    const rewrite = (value: unknown) => JSON.parse(JSON.stringify(value).replaceAll("#/$defs/", "#/components/schemas/"));
    // Paper embeds exactly the closure of StageFacts, no more (Canary-only definitions stay in the family file).
    const reachable = new Set<string>();
    const visit = (name: string) => {
      if (reachable.has(name)) return;
      reachable.add(name);
      for (const match of JSON.stringify(family[name]).matchAll(/#\/\$defs\/([A-Za-z]+)/g)) visit(match[1]);
    };
    visit("StageFacts");
    expect([...reachable].sort()).toEqual(Object.keys(standalone.$defs).filter((key) => key.startsWith("Stage")).sort());
    for (const name of reachable) {
      expect(standalone.$defs[name], name).toEqual(family[name]);
      expect(api[name], name).toEqual(rewrite(family[name]));
    }
    expect(standalone.$defs.Data.properties.stage_facts).toEqual({ $ref: "#/$defs/StageFacts" });
    expect(api.PaperData.properties.stage_facts).toEqual({ $ref: "#/components/schemas/StageFacts" });
  });

  it("validates the Paper workbench fixtures with stage_facts against the standalone schema and the OpenAPI component", () => {
    const spec = load("openapi/execution-paper-read.openapi.json");
    const alone = new Ajv2020({ strict: false });
    addFormats(alone);
    const standalone = alone.compile(load("schemas/execution-paper-read.v1.schema.json"));
    const component = alone.compile({ ...spec, $ref: "#/components/schemas/PaperData" });
    for (const file of ["fixtures/execution-paper-workbench.partial.valid.json", "fixtures/execution-paper-workbench-vnm.partial.valid.json"]) {
      const fixture = load(file);
      expect(fixture.data.stage_facts.runtime.runtime_state.reason_code, file).toBe("SOURCE_RUNTIME_STATE_FIELD_NOT_PUBLISHED");
      expect(fixture.data.stage_facts.sessions.reason_code, file).toBe("PAPER_WORKBENCH_RELATION_NOT_BOUND_TO_SCREEN");
      expect(standalone(fixture), JSON.stringify(standalone.errors)).toBe(true);
      expect(component(fixture.data), JSON.stringify(component.errors)).toBe(true);
      const bad = structuredClone(fixture);
      bad.data.stage_facts.runtime.runtime_state.value = "RUNNING";
      expect(standalone(bad)).toBe(false);
      expect(component(bad.data)).toBe(false);
    }
  });
});

describe("BE-P2 / FE-071 Canary envelope rows, rollback items and trial schedule", () => {
  const defs = (name: string) => `${FAMILY}#/$defs/${name}`;
  const canary = "https://schemas.primusspark.com/portal/execution-canary-control-room.v1.schema.json#/$defs/CanaryControlRoom";
  const populated = () => load("fixtures/execution-canary-envelope-facts.synthetic.valid.json");

  it("validates the synthetic populated shape member by member, and marks it as invented", () => {
    const fixture = populated();
    expect(fixture.lane).toBe("TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT");
    expect(fixture.runtime_qualified).toBe(false);
    for (const row of fixture.value.rows) ok(defs("EnvelopeComplianceRow"), row);
    ok(defs("EnvelopeVerdict"), fixture.value.verdict);
    for (const item of fixture.value.items) ok(defs("RollbackItem"), item);
    ok(defs("TrialSchedule"), fixture.value.trial);
    expect(fixture.value.rows.map((row: any) => row.cap)).toEqual(["capital", "gross_notional", "daily_loss", "open_orders"]);
    expect(fixture.value.items.map((item: any) => item.key)).toEqual(["flatten_plan", "paper_twin", "broker_data", "rollback_drill"]);
  });

  it("carries the dark Canary fixture with approved limits and nothing consumed", () => {
    const body = load("fixtures/execution-canary-control-room.unavailable.valid.json");
    ok(canary, body);
    const rows = body.envelope_compliance.rows;
    expect(rows.map((row: any) => row.approved)).toEqual([
      body.envelope.limits.capital_cap, body.envelope.limits.gross_notional_cap, body.envelope.limits.daily_loss_cap, String(body.envelope.limits.max_open_orders),
    ]);
    for (const row of rows) {
      expect(row.consumed).toMatchObject({ availability: "NOT_PUBLISHED", value: null });
      expect(row.used_ratio).toMatchObject({ availability: "NOT_PUBLISHED", value: null });
      expect(row.policy_limit.reason_code).toBe("BASE_RISK_PROFILE_LIMITS_NOT_PUBLISHED");
    }
    expect(body.envelope_compliance.verdict.state).toBe("UNDETERMINED");
    expect(body.rollback_readiness.ready).toBe(false);
    expect(body.rollback_readiness.items).toHaveLength(4);
    expect(body.lifecycle.trial.started_at.reason_code).toBe("CANARY_ACTIVATION_NOT_RECORDED");
    expect(body.lifecycle.day_index).toBeNull();
    // Still valid for a producer that predates the members.
    const old = structuredClone(body);
    delete old.envelope_compliance.rows; delete old.envelope_compliance.verdict; delete old.rollback_readiness.items; delete old.lifecycle.trial;
    ok(canary, old);
  });

  it("refuses ratios and figures that are not exact canonical decimals", () => {
    const row = populated().value.rows[0];
    const set = (patch: object) => ({ ...row, ...patch });
    refuses(defs("EnvelopeComplianceRow"), set({ approved: 1000 }));
    refuses(defs("EnvelopeComplianceRow"), set({ approved: "1000.50" }));
    refuses(defs("EnvelopeComplianceRow"), set({ approved: "01000" }));
    refuses(defs("EnvelopeComplianceRow"), set({ approved: "1e3" }));
    refuses(defs("EnvelopeComplianceRow"), set({ approved: "-5" }));
    refuses(defs("EnvelopeComplianceRow"), set({ used_ratio: { availability: "AVAILABLE", value: 0.25, reason_code: null } }));
    refuses(defs("EnvelopeComplianceRow"), set({ used_ratio: { availability: "AVAILABLE", value: "0.250", reason_code: null } }));
    refuses(defs("EnvelopeComplianceRow"), set({ cap: "leverage" }));
    refuses(defs("EnvelopeComplianceRow"), set({ policy_limit: undefined }));
    ok(defs("EnvelopeComplianceRow"), set({ used_ratio: { availability: "AVAILABLE", value: "1.25", reason_code: null } }));
  });

  it("refuses a verdict that contradicts its undetermined list", () => {
    const verdict = populated().value.verdict;
    refuses(defs("EnvelopeVerdict"), { ...verdict, undetermined_caps: [] });
    refuses(defs("EnvelopeVerdict"), { ...verdict, state: "WITHIN_ENVELOPE" });
    ok(defs("EnvelopeVerdict"), { ...verdict, state: "WITHIN_ENVELOPE", undetermined_caps: [] });
    ok(defs("EnvelopeVerdict"), { ...verdict, state: "BREACH" });
    refuses(defs("EnvelopeVerdict"), { ...verdict, state: "OK" });
  });

  it("refuses rollback items that claim readiness without a date, key or vocabulary", () => {
    const item = populated().value.items[2];
    refuses(defs("RollbackItem"), { ...item, key: "cleanup" });
    refuses(defs("RollbackItem"), { ...item, ready: { availability: "AVAILABLE", value: "yes", reason_code: null } });
    refuses(defs("RollbackItem"), { ...item, checked_at: { availability: "AVAILABLE", value: "yesterday", reason_code: null } });
    refuses(defs("RollbackItem"), { key: item.key, ready: item.ready });
  });

  it("refuses a trial schedule with a duration outside the envelope range or an unexplained absence", () => {
    const trial = populated().value.trial;
    refuses(defs("TrialSchedule"), { ...trial, duration_days: 0 });
    refuses(defs("TrialSchedule"), { ...trial, duration_days: 91 });
    refuses(defs("TrialSchedule"), { ...trial, started_at: { availability: "NOT_PUBLISHED", value: null, reason_code: null } });
  });

  it("is mirrored in the generated Canary types", () => {
    const types = readFileSync(join(ROOT, "generated/execution-canary.d.ts"), "utf8");
    for (const member of ["EnvelopeComplianceRow", "EnvelopeVerdict", "RollbackItem", "TrialSchedule"]) expect(types).toContain(member);
  });
});

describe("BE-P2 / FE-072 typed rows, figures, series, gap window, finding and plan columns", () => {
  const defs = (name: string) => `${FAMILY}#/$defs/${name}`;
  const CANARY = "https://schemas.primusspark.com/portal/execution-canary-control-room.v1.schema.json#/$defs/CanaryControlRoom";
  const LIVE = "https://schemas.primusspark.com/portal/execution-live-full-operations.v1.schema.json#/$defs/LiveFullOperations";
  const SANDBOX = "https://schemas.primusspark.com/portal/execution-sandbox-certification.v1.schema.json#/$defs/CertificationResponse";
  const PLAN = "https://schemas.primusspark.com/portal/execution-sandbox-certification.v1.schema.json#/$defs/PromotionPlanSummary";
  const synthetic = () => load("fixtures/execution-stage-rows.synthetic.valid.json");

  it("validates the synthetic populated shapes and marks them as invented", () => {
    const fixture = synthetic();
    expect(fixture.lane).toBe("TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT");
    expect(fixture.runtime_qualified).toBe(false);
    ok(defs("StageTypedPositions"), fixture.value.typed_positions);
    ok(defs("StageTypedOrders"), fixture.value.typed_orders);
    ok(defs("StageSourceFigures"), fixture.value.source_figures);
    ok(defs("StageFactGapRanges"), fixture.value.gap_ranges);
    for (const plan of fixture.value.plan_rows) ok(PLAN, plan);
  });

  it("grafts onto the dark bodies: series points, gap window, typed tables and finding / plan columns", () => {
    const value = synthetic().value;
    const canary = load("fixtures/execution-canary-control-room.unavailable.valid.json");
    canary.series = { ...canary.series, ...value.series };
    canary.positions.typed = value.typed_positions;
    canary.blotter.typed = value.typed_orders;
    canary.source_figures = value.source_figures;
    ok(CANARY, canary);
    const live = load("fixtures/execution-live-full-operations.unavailable.valid.json");
    live.series = { ...live.series, ...value.series };
    live.projection_continuity.gap_ranges = value.gap_ranges;
    live.orders.typed = value.typed_orders;
    ok(LIVE, live);
    const sandbox = load("fixtures/execution-sandbox-certification.unavailable.valid.json");
    sandbox.findings = { total_count: 1, returned_count: 1, truncated: false, rows: [value.finding_row] };
    sandbox.promotion_plans = value.plan_rows;
    ok(SANDBOX, sandbox);
  });

  it("shows the dark bodies' typed absences, never a bare null table", () => {
    const canary = load("fixtures/execution-canary-control-room.unavailable.valid.json");
    for (const typed of [canary.positions.typed, canary.blotter.typed]) {
      expect(typed).toMatchObject({ availability: "NOT_PUBLISHED", rows: [], returned_count: 0, source_complete: null });
      expect(typed.reason_code).toBe("LIVE_SOURCE_UNAVAILABLE");
      expect(typed.not_published_columns).toHaveLength(1);
    }
    expect(canary.positions.typed.not_published_columns[0].column).toBe("leverage");
    expect(canary.blotter.typed.not_published_columns[0].column).toBe("ack_latency_ms");
    const live = load("fixtures/execution-live-full-operations.unavailable.valid.json");
    expect(live.projection_continuity.gap_ranges).toMatchObject({ availability: "NOT_PUBLISHED", value: null, reason_code: "SOURCE_CONTINUITY_UNAVAILABLE" });
    for (const body of [canary, live, load("fixtures/execution-sandbox-certification.unavailable.valid.json")]) {
      expect(body.source_figures.figures.map((figure: any) => figure.key)).toEqual(["equity", "gross_notional", "positions", "open_orders", "fees"]);
      for (const figure of body.source_figures.figures) {
        expect(figure.internal.availability).toBe("NOT_PUBLISHED");
        expect(figure.broker.availability).toBe("NOT_PUBLISHED");
        expect(figure.difference).toMatchObject({ availability: "NOT_PUBLISHED", reason_code: "DIFFERENCE_REQUIRES_BOTH_SIDES" });
      }
    }
  });

  it("keeps the new members optional so a producer that predates them still validates", () => {
    const canary = load("fixtures/execution-canary-control-room.unavailable.valid.json");
    delete canary.source_figures; delete canary.positions.typed; delete canary.blotter.typed;
    ok(CANARY, canary);
  });

  it("refuses typed rows that invent a column or a number", () => {
    const row = synthetic().value.typed_positions.rows[0];
    const bad = (patch: object) => refuses(defs("StagePositionRow"), { ...row, ...patch });
    bad({ leverage: "3" });
    bad({ leverage: 3 });
    bad({ side: "BUY" });
    bad({ quantity: 0.5 });
    bad({ entry: "-1" });
    bad({ mark: "1e3" });
    bad({ unrealised: "-0" });
    bad({ symbol: "BTC USDT" });
    bad({ extra: true });
    ok(defs("StagePositionRow"), { ...row, unrealised: "-3.25", side: null, entry: null });
    const order = synthetic().value.typed_orders.rows[0];
    refuses(defs("StageOrderRow"), { ...order, ack_latency_ms: 12 });
    refuses(defs("StageOrderRow"), { ...order, side: "BUY" });
    refuses(defs("StageOrderRow"), { ...order, since: "yesterday" });
    ok(defs("StageOrderRow"), { ...order, price: null, type: null, since: null });
  });

  it("refuses a typed table whose absence still lists rows or whose rows have no completeness", () => {
    const typed = synthetic().value.typed_positions;
    refuses(defs("StageTypedPositions"), { ...typed, availability: "NOT_PUBLISHED" });
    refuses(defs("StageTypedPositions"), { ...typed, source_complete: null });
    refuses(defs("StageTypedPositions"), { ...typed, kind: "orders" });
    refuses(defs("StageTypedPositions"), { ...typed, rows: Array(201).fill(typed.rows[0]), returned_count: 200 });
  });

  it("refuses figures that publish a difference without both sides, or a fixed order other than the five keys", () => {
    const figures = synthetic().value.source_figures;
    const mutate = (change: (copy: any) => void) => { const copy = structuredClone(figures); change(copy); return copy; };
    refuses(defs("StageSourceFigures"), mutate((c) => { c.figures.pop(); }));
    refuses(defs("StageSourceFigures"), mutate((c) => { c.figures[0].key = "pnl"; }));
    refuses(defs("StageSourceFigures"), mutate((c) => { c.figures[2].difference.value = 0; }));
    refuses(defs("StageSourceFigures"), mutate((c) => { c.figures[2].internal = { availability: "AVAILABLE", value: null, reason_code: null }; }));
    ok(defs("StageSourceFigures"), mutate((c) => { c.figures[2].difference.value = "-1.5"; }));
  });

  it("refuses series points that are numbers, and a resolution outside the compact form", () => {
    const value = synthetic().value;
    const canary = load("fixtures/execution-canary-control-room.unavailable.valid.json");
    const graft = (series: object) => ({ ...canary, series: { ...canary.series, ...series } });
    refuses(CANARY, graft({ ...value.series, points: [{ t: "2026-10-12T08:00:00Z", value: 1.5 }] }));
    refuses(CANARY, graft({ ...value.series, points: [{ t: "2026-10-12T08:00:00Z", value: "1.50" }] }));
    refuses(CANARY, graft({ ...value.series, resolution: "hourly" }));
    ok(CANARY, graft({ ...value.series, resolution: null, points: [] }));
  });

  it("refuses a plan envelope that is not a Facts, and an author without a user id", () => {
    const plan = synthetic().value.plan_rows[0];
    refuses(PLAN, { ...plan, envelope: { envelope_id: "cenv_1", revision: 1, status: "DRAFT" } });
    refuses(PLAN, { ...plan, envelope: { availability: "AVAILABLE", value: { envelope_id: "cenv_1", revision: 0, status: "DRAFT" }, reason_code: null } });
    refuses(PLAN, { ...plan, author: {} });
    ok(PLAN, { ...plan, envelope: { availability: "NOT_PUBLISHED", value: null, reason_code: "PLAN_ENVELOPE_LOOKUP_NOT_PERFORMED" } });
  });

  it("is mirrored in the generated Canary, Live and Governance types", () => {
    for (const file of ["execution-canary", "execution-live-full", "execution-governance"]) {
      const types = readFileSync(join(ROOT, `generated/${file}.d.ts`), "utf8");
      const members = file === "execution-governance" ? ["StageSourceFigures"] : ["StageSourceFigures", "StageTypedPositions"];
      for (const member of members) expect(types, `${file} ${member}`).toContain(member);
    }
    expect(readFileSync(join(ROOT, "generated/execution-governance.d.ts"), "utf8")).toContain("StageFactPlanEnvelope");
    expect(readFileSync(join(ROOT, "generated/execution-live-full.d.ts"), "utf8")).toContain("StageFactGapRanges");
  });
});
