/**
 * BE-P13 tasks 3 and 4 · typed absences on CommandStatus (source rejection reason, venue fill
 * quantities), the submit-only replay marker, and cost/impact on plan and preview. Pure: no database,
 * no HTTP. The values here are facts about what the PUBLISHED source result contains, derived from
 * fields already stored; no venue or source fact is invented, and an unknown reason or quantity can
 * only ever be NOT_PUBLISHED.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";
import type { PortalUser } from "../src/domain";
import {
  commandPreview, commandStatus, publicCommandStatus, publicStatusFacets, sourceRejection, submitCommandStatus,
  toPublicCommandStatus, venueFill,
} from "../src/execution-v2/command.contract";
import { ExecutionOperationsService } from "../src/operations/operations.service";
import { executionCommandPlanResponse } from "../src/operations/f0-plan.contract";

const contracts = process.env.PORTAL_CONTRACTS_DIR ?? resolve(__dirname, "../../../packages/contracts");
const load = (name: string) => JSON.parse(readFileSync(resolve(contracts, name), "utf8"));
const trusted = load("openapi/execution-trusted-commands.openapi.json").components.schemas;
const fixture = load("fixtures/execution-trusted-commands.synthetic.valid.json");
const compile = (schema: unknown) => { const ajv = new Ajv2020({ strict: true, allErrors: true, allowUnionTypes: true }); addFormats(ajv); return ajv.compile(schema as object); };
const statusSchema = compile(trusted.CommandStatus);
const submitSchema = compile(trusted.CommandSubmitResult);
const previewSchema = compile(trusted.CommandPreview);
const stored = fixture.stored_ack_only;

const STATES = ["UNKNOWN", "APPLIED", "PARTIALLY_APPLIED", "WAITING_ENCUMBRANCE", "CANCELLED", "PARTIALLY_APPLIED_CANCELLED", "REJECTED"] as const;
const VENUES = ["NOT_APPLICABLE", "UNKNOWN", "PENDING", "ACKNOWLEDGED", "FILLED", "REJECTED"] as const;
const amounts = (rejected: string) => ({ requested: "10", applied: "0", pending: "0", cancelled: "0", rejected });
const status = (business: object, venue: string) => commandStatus.parse({
  ...stored, venue, business: { receipt_ref: null, source_event_ref: null, revision: null, amounts: null, ...business } });

describe("BE-P13 source rejection and venue fill: typed absence only", () => {
  it("source_rejection is NOT_PUBLISHED exactly when the outcome carries a rejected facet", () => {
    for (const state of STATES) {
      for (const rejected of ["0", "0.000", "1", "0.5"]) {
        const business = { state, receipt_ref: state === "UNKNOWN" ? null : "r", source_event_ref: state === "UNKNOWN" ? null : "e",
          revision: state === "UNKNOWN" ? null : "1", amounts: state === "UNKNOWN" ? null : amounts(rejected) };
        const facets = publicStatusFacets(status(business, "NOT_APPLICABLE"));
        const expectRejected = state === "REJECTED" || (state !== "UNKNOWN" && !/^0(?:\.0+)?$/.test(rejected));
        expect(facets.source_rejection, `${state}/${rejected}`).toEqual(expectRejected
          ? { state: "NOT_PUBLISHED", reason: "SOURCE_RESULT_HAS_NO_REJECTION_REASON" }
          : { state: "NOT_APPLICABLE", reason: null });
      }
    }
  });

  it("venue_fill is NOT_APPLICABLE only for a venue that never applied; every other venue is NOT_PUBLISHED, FILLED included", () => {
    for (const venue of VENUES) {
      const facets = publicStatusFacets(status({ state: "UNKNOWN" }, venue));
      expect(facets.venue_fill, venue).toEqual(venue === "NOT_APPLICABLE"
        ? { state: "NOT_APPLICABLE", reason: null, quantities: null }
        : { state: "NOT_PUBLISHED", reason: "SOURCE_RESULT_HAS_NO_FILL_QUANTITIES", quantities: null });
    }
  });

  it("the closed vocabulary cannot carry a reason, a PARTIALLY_FILLED state or quantities", () => {
    for (const bad of [
      { state: "NOT_PUBLISHED", reason: "INSUFFICIENT_BALANCE" }, { state: "PUBLISHED", reason: "INSUFFICIENT_BALANCE" },
      { state: "NOT_APPLICABLE", reason: "SOURCE_RESULT_HAS_NO_REJECTION_REASON" }, { state: "NOT_PUBLISHED", reason: null },
      { state: "NOT_PUBLISHED", reason: "SOURCE_RESULT_HAS_NO_REJECTION_REASON", detail: "x" }]) {
      expect(sourceRejection.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
    for (const bad of [
      { state: "PARTIALLY_FILLED", reason: null, quantities: null },
      { state: "NOT_PUBLISHED", reason: "SOURCE_RESULT_HAS_NO_FILL_QUANTITIES", quantities: { filled: "1" } },
      { state: "NOT_PUBLISHED", reason: "SOURCE_RESULT_HAS_NO_FILL_QUANTITIES", quantities: "1" },
      { state: "NOT_APPLICABLE", reason: "SOURCE_RESULT_HAS_NO_FILL_QUANTITIES", quantities: null },
      { state: "NOT_PUBLISHED", reason: null, quantities: null }]) {
      expect(venueFill.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });

  it("the published schema carries the same two absences and the fixtures validate against it and the parser", () => {
    for (const key of ["ack_only", "rejected"] as const) {
      const value = fixture[key];
      expect(statusSchema(value), `${key} ${JSON.stringify(statusSchema.errors)}`).toBe(true);
      expect(publicCommandStatus.safeParse(value).success, key).toBe(true);
    }
    expect(fixture.ack_only.venue).toBe("UNKNOWN");
    expect(fixture.ack_only.venue_fill).toEqual({ state: "NOT_PUBLISHED", reason: "SOURCE_RESULT_HAS_NO_FILL_QUANTITIES", quantities: null });
    expect(fixture.rejected.business.state).toBe("REJECTED");
    expect(fixture.rejected.source_rejection).toEqual({ state: "NOT_PUBLISHED", reason: "SOURCE_RESULT_HAS_NO_REJECTION_REASON" });
    expect(fixture.rejected.venue_fill.state).toBe("NOT_APPLICABLE");
    // Missing absences, or an invented reason, are not a CommandStatus.
    const { source_rejection: _s, ...withoutRejection } = fixture.ack_only;
    const { venue_fill: _v, ...withoutFill } = fixture.ack_only;
    for (const bad of [withoutRejection, withoutFill,
      { ...fixture.rejected, source_rejection: { state: "NOT_PUBLISHED", reason: "INSUFFICIENT_BALANCE" } },
      { ...fixture.ack_only, venue_fill: { state: "NOT_PUBLISHED", reason: "SOURCE_RESULT_HAS_NO_FILL_QUANTITIES", quantities: { filled: "1" } } }]) {
      expect(statusSchema(bad)).toBe(false);
      expect(publicCommandStatus.safeParse(bad).success).toBe(false);
    }
  });

  it("projection is a pure function of the stored status and never rewrites it", () => {
    const before = JSON.stringify(stored);
    const projected = toPublicCommandStatus(commandStatus.parse(stored), "USDT");
    expect(JSON.stringify(stored)).toBe(before);
    expect(commandStatus.safeParse(projected).success).toBe(false); // the stored grammar stays closed
    expect(projected).toEqual(fixture.ack_only);
  });
});

describe("BE-P13 replay marker: only the submit response carries it", () => {
  it("submit_first / submit_replayed validate; status, collection and workflow bodies do not carry it", () => {
    expect(submitSchema(fixture.submit_first), JSON.stringify(submitSchema.errors)).toBe(true);
    expect(submitSchema(fixture.submit_replayed), JSON.stringify(submitSchema.errors)).toBe(true);
    expect(fixture.submit_first.replayed).toBe(false);
    expect(fixture.submit_replayed.replayed).toBe(true);
    const { replayed: _r, ...rest } = fixture.submit_replayed;
    expect(rest).toEqual(fixture.ack_only);
    // CommandStatus (GET status, reconcile, collection items, workflow.status) is closed: no replayed.
    expect(statusSchema(fixture.submit_replayed)).toBe(false);
    expect(publicCommandStatus.safeParse(fixture.submit_replayed).success).toBe(false);
    // ...and a submit result without the marker is not a submit result.
    expect(submitSchema(fixture.ack_only)).toBe(false);
    expect(submitCommandStatus.safeParse(fixture.ack_only).success).toBe(false);
    expect(submitCommandStatus.safeParse({ ...fixture.ack_only, replayed: "yes" }).success).toBe(false);
  });

  it("the OpenAPI submit operation answers CommandSubmitResult and every other command read answers CommandStatus", () => {
    const paths = load("openapi/execution-trusted-commands.openapi.json").paths;
    const ref = (op: { responses: Record<string, { content: { "application/json": { schema: { $ref: string } } } }> }) =>
      op.responses["200"].content["application/json"].schema.$ref.split("/").pop();
    expect(ref(paths["/api/v1/execution/capital-commands"].post)).toBe("CommandSubmitResult");
    expect(ref(paths["/api/v1/execution/capital-commands/{id}"].get)).toBe("CommandStatus");
    expect(ref(paths["/api/v1/execution/capital-commands/{id}/reconcile"].post)).toBe("CommandStatus");
  });
});

describe("BE-P13 cost/impact (FE-020): a typed absence on plan and preview, never computed", () => {
  const absence = { state: "NOT_PUBLISHED", reason: "NO_COST_OR_IMPACT_SOURCE" };
  it("every preview carries it and the schema accepts nothing else", () => {
    for (const key of ["preview_blocked", "preview_allowed"] as const) {
      expect(fixture[key].cost_impact).toEqual(absence);
      expect(previewSchema(fixture[key]), `${key} ${JSON.stringify(previewSchema.errors)}`).toBe(true);
      expect(commandPreview.safeParse(fixture[key]).success).toBe(true);
    }
    const { cost_impact: _c, ...without } = fixture.preview_allowed;
    for (const bad of [without,
      { ...fixture.preview_allowed, cost_impact: { state: "PUBLISHED", reason: "NO_COST_OR_IMPACT_SOURCE" } },
      { ...fixture.preview_allowed, cost_impact: { ...absence, amount: "0" } },
      { ...fixture.preview_allowed, cost_impact: { state: "NOT_PUBLISHED", reason: "OTHER" } },
      { ...fixture.preview_allowed, cost_impact: null }]) {
      expect(previewSchema(bad)).toBe(false);
      expect(commandPreview.safeParse(bad).success).toBe(false);
    }
  });

  it("the F0 plan the service serves is schema-valid, equals the canonical fixtures' shape, and carries the absence", async () => {
    const schema = load("schemas/execution-operations.v1.schema.json");
    const ajv = new Ajv2020({ strict: true, allErrors: true }); addFormats(ajv); ajv.addSchema(schema);
    const planSchema = ajv.getSchema(`${schema.$id}#/$defs/ExecutionCommandPlan`)!;
    const created = (commandKey: string) => ({
      operationId: "op_01K3COMMANDPLAN000000000000", workspaceId: "ws_1", actorUserId: "usr_1", requestKey: "k-1", commandKey,
      environment: "LIVE", targetType: "ACCOUNT", targetId: "a1", expectedTargetVersion: 1,
      payloadHash: `sha256:${"1".repeat(64)}`, planDigest: `sha256:${"2".repeat(64)}`, conditions: [],
      riskTier: commandKey === "ops/emergency-close" ? "R3_LIVE_PROTECTIVE" : "R2_SANDBOX",
      blockerCodes: ["COMMAND_RELAY_DISABLED"], warningCodes: [], status: "BLOCKED",
      expiresAt: new Date("2026-08-22T12:05:00.000Z"), createdAt: new Date(), updatedAt: new Date(),
    });
    const service = (commandKey: string) => new ExecutionOperationsService({
      create: async () => ({ record: created(commandKey), created: true }),
    } as never, { record: async () => undefined } as never, null as never, {} as never);
    const admin = { userId: "usr_1", role: "ADMIN" } as PortalUser;
    const request = (commandKey: string, payload: Record<string, unknown> = { dry_run: true }) => ({
      schema_version: "execution.command-plan-request.v1" as const, workspace_id: "ws_1", request_key: "k-1",
      command_type: "EXECUTION_COMMAND" as const, command_version: 1 as const, command_key: commandKey,
      environment: "LIVE" as const, target: { type: "ACCOUNT" as const, id: "a1" }, expected_target_version: 1, payload, conditions: [] });
    const plain = await service("account/sync").plan(admin, request("account/sync"), "req_1");
    expect(planSchema(plain), JSON.stringify(planSchema.errors)).toBe(true);
    expect(plain.cost_impact).toEqual(absence);
    expect(plain.current_primitive).toBeNull();
    const emergency = await service("ops/emergency-close").plan(admin, request("ops/emergency-close", {
      confirmation: "CLOSE LIVE ACCOUNT", mode: "live", product: "USD_M", reason: "Operator requested protective containment", venue: "BINANCE" }), "req_2");
    expect(planSchema(emergency), JSON.stringify(planSchema.errors)).toBe(true);
    expect(emergency.current_primitive).toMatchObject({ id: "live.emergency-close", runtime_active: false, source_side_effect_requested: false });
    expect(executionCommandPlanResponse.safeParse(emergency).success).toBe(true);
    // Both canonical fixtures are exactly what the service emits, field for field.
    const plainFixture = load("fixtures/execution-command-plan.valid.json");
    const emergencyFixture = load("fixtures/execution-command-plan.emergency-close.valid.json");
    for (const fx of [plainFixture, emergencyFixture]) {
      expect(planSchema(fx), JSON.stringify(planSchema.errors)).toBe(true);
      expect(executionCommandPlanResponse.safeParse(fx).success).toBe(true);
    }
    expect(Object.keys(plain).sort()).toEqual(Object.keys(plainFixture).sort());
    expect(Object.keys(emergency).sort()).toEqual(Object.keys(emergencyFixture).sort());
    // The absence cannot be widened or dropped.
    const { cost_impact: _c, ...without } = plainFixture;
    expect(planSchema(without)).toBe(false);
    expect(planSchema({ ...plainFixture, cost_impact: { state: "PUBLISHED", reason: "NO_COST_OR_IMPACT_SOURCE" } })).toBe(false);
    expect(planSchema({ ...plainFixture, current_primitive: { id: "live.emergency-close" } })).toBe(false);
  });
});
