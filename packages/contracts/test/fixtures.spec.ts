import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";

const ROOT = join(__dirname, "..");

function loadJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

function buildValidator(schemas: string[]): Ajv {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  for (const file of schemas) {
    ajv.addSchema(loadJson(file));
  }
  return ajv;
}

const schemaDir = join(ROOT, "schemas");
const fixtureDir = join(ROOT, "fixtures");
const ajv = buildValidator(
  readdirSync(schemaDir).map((name) => join(schemaDir, name)),
);

const ANALYTICS_OPENAPI_SCHEMA_ID =
  "https://schemas.primusspark.com/portal/execution-analytics.openapi.json";

function rewriteOpenApiRefs(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(rewriteOpenApiRefs);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        key === "$ref" && typeof item === "string"
          ? item.replace("#/components/schemas/", "#/$defs/")
          : rewriteOpenApiRefs(item),
      ]),
    );
  }
  return value;
}

const analyticsOpenApi = loadJson(
  join(ROOT, "openapi", "execution-analytics.openapi.json"),
) as { components: { schemas: Record<string, unknown> } };
const analyticsAjv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
addFormats(analyticsAjv);
analyticsAjv.addSchema({
  $id: ANALYTICS_OPENAPI_SCHEMA_ID,
  $defs: rewriteOpenApiRefs(analyticsOpenApi.components.schemas),
});

const analyticsFixtureSchemas: Record<string, string> = {
  "execution-analytics.capital-preview.valid.json": "CapitalPreviewResponse",
  "execution-analytics.order-funnel.valid.json": "OrderFunnelResponse",
  "execution-analytics.insight-batch.valid.json": "InsightBatchResponse",
  "execution-analytics.correlation.valid.json": "CorrelationResponse",
  "execution-analytics.capital-ledger.valid.json": "CapitalLedgerResponse",
  "execution-analytics.binding-exposure.valid.json": "BindingExposureResponse",
  "execution-paper-workbench.orders-shadow.valid.json": "PaperWorkbenchShadowPanelResponse",
};

const schemaIds: Record<string, string> = {
  "problem.valid.json":
    "https://schemas.primusspark.com/portal/problem.v1.schema.json",
  "command.valid.json":
    "https://schemas.primusspark.com/portal/command-envelope.v1.schema.json",
  "event.valid.json":
    "https://schemas.primusspark.com/portal/event-envelope.v1.schema.json",
  "keyset-page.valid.json":
    "https://schemas.primusspark.com/portal/keyset-page.v1.schema.json",
  "execution-projection-page.valid.json":
    "https://schemas.primusspark.com/portal/execution-projection-page.v1.schema.json",
  "execution-realtime.auth-expiring.valid.json":
    "https://schemas.primusspark.com/portal/execution-realtime-event.v1.schema.json",
  "execution-realtime.projection-gap.valid.json":
    "https://schemas.primusspark.com/portal/execution-realtime-event.v1.schema.json",
  "execution-governance.r2-review.valid.json":
    "https://schemas.primusspark.com/portal/execution-governance-r2-review.v1.schema.json",
  "execution-governance.r1-review.valid.json":
    "https://schemas.primusspark.com/portal/execution-governance-approval-workflow.v1.schema.json#/$defs/R1ReviewResponse",
  "execution-governance.approval-history.valid.json":
    "https://schemas.primusspark.com/portal/execution-governance-approval-workflow.v1.schema.json#/$defs/ApprovalHistoryResponse",
  "execution-governance.paper-exit-review.valid.json":
    "https://schemas.primusspark.com/portal/execution-governance-paper-exit.v1.schema.json#/$defs/PaperExitReviewResponse",
  "execution-command-center.busy.valid.json":
    "https://schemas.primusspark.com/portal/execution-command-center-snapshot.v1.schema.json",
  "execution-command-center.empty.valid.json":
    "https://schemas.primusspark.com/portal/execution-command-center-snapshot.v1.schema.json",
  "execution-command-center.partial.valid.json":
    "https://schemas.primusspark.com/portal/execution-command-center-snapshot.v1.schema.json",
  "execution-command-center.stale.valid.json":
    "https://schemas.primusspark.com/portal/execution-command-center-snapshot.v1.schema.json",
  "execution-command-center.unavailable.valid.json":
    "https://schemas.primusspark.com/portal/execution-command-center-snapshot.v1.schema.json",
  "execution-command-catalog.valid.json":
    "https://schemas.primusspark.com/portal/execution-operations.v1.schema.json#/$defs/CommandCatalogue",
  "execution-command-plan.valid.json":
    "https://schemas.primusspark.com/portal/execution-operations.v1.schema.json#/$defs/ExecutionCommandPlan",
  "execution-command-operation.valid.json":
    "https://schemas.primusspark.com/portal/execution-operations.v1.schema.json#/$defs/ExecutionCommandOperation",
  "execution-command-relay-denied.valid.json":
    "https://schemas.primusspark.com/portal/execution-operations.v1.schema.json#/$defs/RelayDenied",
  "execution-operations-queue.valid.json":
    "https://schemas.primusspark.com/portal/execution-operations.v1.schema.json#/$defs/OperationQueueResponse",
  "execution-operation-workflow.valid.json":
    "https://schemas.primusspark.com/portal/execution-operations.v1.schema.json#/$defs/OperationWorkflowResponse",
  "execution-incident-detail.open.valid.json":
    "https://schemas.primusspark.com/portal/execution-operations.v1.schema.json#/$defs/IncidentDetail",
  "execution-incident-workflow.resolved.valid.json":
    "https://schemas.primusspark.com/portal/execution-operations.v1.schema.json#/$defs/IncidentWorkflowResponse",
  "execution-sandbox-certification.unavailable.valid.json":
    "https://schemas.primusspark.com/portal/execution-sandbox-certification.v1.schema.json#/$defs/CertificationResponse",
  "execution-canary-control-room.unavailable.valid.json":
    "https://schemas.primusspark.com/portal/execution-canary-control-room.v1.schema.json#/$defs/CanaryControlRoom",
  "execution-live-full-operations.unavailable.valid.json":
    "https://schemas.primusspark.com/portal/execution-live-full-operations.v1.schema.json#/$defs/LiveFullOperations",
};

const liveFullFixture = loadJson(
  join(fixtureDir, "execution-live-full-operations.unavailable.valid.json"),
) as Record<string, unknown> & {
  source_panels: Record<string, unknown> & { broker: Record<string, unknown> };
  broker_consistency: Record<string, unknown>;
  command_policy: {
    protective: Record<string, unknown>;
    risk_increasing: Record<string, unknown>;
  };
};

describe("canonical contracts (cross-language fixture compilation)", () => {
  for (const [fixture, schemaId] of Object.entries(schemaIds)) {
    it(`validates ${fixture} against ${schemaId.split("/").pop()}`, () => {
      const validate = ajv.getSchema(schemaId);
      expect(validate).toBeDefined();
      const document = loadJson(join(fixtureDir, fixture));
      const valid = validate!(document);
      if (!valid) {
        throw new Error(JSON.stringify(validate!.errors, null, 2));
      }
    });
  }

  for (const [fixture, component] of Object.entries(analyticsFixtureSchemas)) {
    it(`validates ${fixture} against analytics OpenAPI ${component}`, () => {
      const validate = analyticsAjv.getSchema(
        `${ANALYTICS_OPENAPI_SCHEMA_ID}#/$defs/${component}`,
      );
      expect(validate).toBeDefined();
      const valid = validate!(loadJson(join(fixtureDir, fixture)));
      if (!valid) throw new Error(JSON.stringify(validate!.errors, null, 2));
    });
  }

  it("rejects unknown fields in every canonical schema", () => {
    const problem = loadJson(join(fixtureDir, "problem.valid.json")) as Record<string, unknown>;
    const validate = ajv.getSchema(
      "https://schemas.primusspark.com/portal/problem.v1.schema.json",
    );
    const mutated = { ...problem, injected: true };
    expect(validate!(mutated)).toBe(false);

    const command = loadJson(join(fixtureDir, "command.valid.json")) as Record<string, unknown>;
    const commandValidate = ajv.getSchema(
      "https://schemas.primusspark.com/portal/command-envelope.v1.schema.json",
    );
    expect(commandValidate!({ ...command, injected: true })).toBe(false);
    expect(commandValidate!({ ...command, expected_aggregate_version: 0 })).toBe(false);
    expect(commandValidate!({ ...command, idempotency_key: "bad key!" })).toBe(false);
  });

  it("keeps Live Full broker values suppressed and all runtime authorities inactive", () => {
    const validate = ajv.getSchema(
      "https://schemas.primusspark.com/portal/execution-live-full-operations.v1.schema.json#/$defs/LiveFullOperations",
    );
    expect(validate).toBeDefined();
    expect(liveFullFixture.source_panels.broker).toMatchObject({
      panel_state: "suppressed", data: null,
    });
    expect(liveFullFixture.broker_consistency).toMatchObject({
      mismatch_behavior: "SUPPRESS_ALL_BROKER_VALUES", broker_values_visible: false,
    });
    expect(liveFullFixture.command_policy.protective.visible).toBe(false);
    expect(liveFullFixture.command_policy.risk_increasing.source_gap_blocks).toBe(true);
    expect(validate!({
      ...liveFullFixture,
      source_panels: {
        ...liveFullFixture.source_panels,
        broker: { ...liveFullFixture.source_panels.broker, data: { equity: "5000" } },
      },
    })).toBe(false);
    expect(validate!({ ...liveFullFixture, production_command_active: true })).toBe(false);
    expect(validate!({ ...liveFullFixture, realtime_active: true })).toBe(false);
  });

  it("rejects malformed event envelopes", () => {
    const event = loadJson(join(fixtureDir, "event.valid.json")) as Record<string, unknown>;
    const validate = ajv.getSchema(
      "https://schemas.primusspark.com/portal/event-envelope.v1.schema.json",
    );
    expect(validate!({ ...event, aggregate_version: 0 })).toBe(false);
    expect(validate!({ ...event, event_type: "quant.run.progressed" })).toBe(false);
    expect(
      validate!({ ...event, occurred_at: "2026-08-15T12:00:00" }),
    ).toBe(false);
  });

  it("rejects incomplete or offset-shaped keyset pages", () => {
    const page = loadJson(join(fixtureDir, "keyset-page.valid.json")) as Record<string, unknown>;
    const validate = ajv.getSchema(
      "https://schemas.primusspark.com/portal/keyset-page.v1.schema.json",
    );
    const { total_count: _missing, ...withoutCount } = page;
    expect(validate!(withoutCount)).toBe(false);
    expect(validate!({ ...page, offset: 100 })).toBe(false);
    expect(validate!({ ...page, rows: Array.from({ length: 251 }, () => ({})) })).toBe(false);
  });

  it("requires exact server aggregates and explicit retention on projection pages", () => {
    const page = loadJson(join(fixtureDir, "execution-projection-page.valid.json")) as Record<string, unknown>;
    const validate = ajv.getSchema(
      "https://schemas.primusspark.com/portal/execution-projection-page.v1.schema.json",
    );
    expect(validate).toBeDefined();
    const { aggregates_by_currency: _aggregates, ...withoutAggregates } = page;
    expect(validate!(withoutAggregates)).toBe(false);
    const { retention: _retention, ...withoutRetention } = page;
    expect(validate!(withoutRetention)).toBe(false);
    expect(validate!({
      ...page,
      retention: { availability: "NOT_A_REAL_STATE", policy_version: "UNCONFIGURED" },
    })).toBe(false);
  });

  it("requires an RFC 3339 expiry on auth.expiring", () => {
    const event = loadJson(join(fixtureDir, "execution-realtime.auth-expiring.valid.json")) as Record<string, unknown>;
    const validate = ajv.getSchema(
      "https://schemas.primusspark.com/portal/execution-realtime-event.v1.schema.json",
    );
    expect(validate).toBeDefined();
    const { expires_at: _expiresAt, ...withoutExpiry } = event;
    expect(validate!(withoutExpiry)).toBe(false);
    expect(validate!({ ...event, expires_at: "not-a-timestamp" })).toBe(false);
  });

  it("keeps reason-specific projection.gap facts nullable while preserving a slow-consumer loss count", () => {
    const gap = loadJson(join(fixtureDir, "execution-realtime.projection-gap.valid.json")) as Record<string, unknown>;
    const validate = ajv.getSchema(
      "https://schemas.primusspark.com/portal/execution-realtime-event.v1.schema.json",
    );
    expect(validate).toBeDefined();
    expect(validate!(gap)).toBe(true);
    expect(validate!({ ...gap, missed_events: 0 })).toBe(false);
  });

  it("requires the immutable R2 portfolio and currency binding", () => {
    const review = loadJson(join(fixtureDir, "execution-governance.r2-review.valid.json")) as {
      data: { approval: Record<string, unknown> };
    };
    const validate = ajv.getSchema(
      "https://schemas.primusspark.com/portal/execution-governance-r2-review.v1.schema.json",
    );
    expect(validate).toBeDefined();
    const { portfolio_id: _portfolioId, ...withoutPortfolio } = review.data.approval;
    expect(validate!({
      ...review,
      data: { ...review.data, approval: withoutPortfolio },
    })).toBe(false);
    const { currency: _currency, ...withoutCurrency } = review.data.approval;
    expect(validate!({
      ...review,
      data: { ...review.data, approval: withoutCurrency },
    })).toBe(false);
  });

  it("keeps Paper Exit server-evaluated and activation-free", () => {
    const review = loadJson(join(fixtureDir, "execution-governance.paper-exit-review.valid.json")) as {
      data: Record<string, unknown> & { activation_plan: Record<string, unknown> };
    };
    const validate = ajv.getSchema(
      "https://schemas.primusspark.com/portal/execution-governance-paper-exit.v1.schema.json#/$defs/PaperExitReviewResponse",
    );
    expect(validate).toBeDefined();
    const { gate_met: _gateMet, ...withoutGateVerdict } = review.data;
    expect(validate!({ ...review, data: withoutGateVerdict })).toBe(false);
    const typedReview = review.data.review as Record<string, unknown>;
    const { stage: _stage, ...withoutStage } = typedReview;
    expect(validate!({
      ...review,
      data: { ...review.data, review: withoutStage },
    })).toBe(false);
    expect(validate!({
      ...review,
      data: {
        ...review.data,
        activation_plan: { ...review.data.activation_plan, external_side_effect_requested: true },
      },
    })).toBe(false);
    expect(validate!({ ...review, data: { ...review.data, injected: true } })).toBe(false);
  });

  it("keeps the F0 command catalogue complete and entirely unreachable", () => {
    const catalogue = loadJson(join(fixtureDir, "execution-command-catalog.valid.json")) as {
      entries: Array<Record<string, unknown>>;
      capability: { state: string };
      catalogue_revision: number;
      total_entries: number;
      returned_entries: number;
      scope: { actor_role: string; policy_revision: string };
    };
    expect(catalogue.catalogue_revision).toBe(2);
    expect(catalogue.total_entries).toBe(64);
    expect(catalogue.returned_entries).toBe(64);
    expect(catalogue.scope).toMatchObject({
      actor_role: "ADMIN",
      policy_revision: "execution.command-catalogue.f0.v2",
    });
    expect(catalogue.entries).toHaveLength(64);
    expect(new Set(catalogue.entries.map((entry) => entry.key)).size).toBe(64);
    expect(catalogue.capability.state).toBe("DISABLED");
    expect(catalogue.entries.every((entry) => entry.portal_reachable === false)).toBe(true);
    for (const key of [
      "ops/trace-order", "ops/dead-letters", "ops/findings", "ops/streams",
      "ops/command-journal", "ops/redis-retention", "ops/alerts", "ops/alpha-activity",
    ]) {
      const entry = catalogue.entries.find((candidate) => candidate.key === key);
      expect(entry?.source_route_state).toBe("UNPUBLISHED");
      expect(entry?.blocked_reason).toBe("TRADING_SYSTEM_HTTP_ROUTE_UNPUBLISHED");
    }
    for (const key of ["redis/get", "redis/scan"]) {
      const entry = catalogue.entries.find((candidate) => candidate.key === key);
      expect(entry?.source_route_state).toBe("DIRECT_ACCESS_PROHIBITED");
      expect(entry?.blocked_reason).toBe("GENERIC_REDIS_ACCESS_PROHIBITED");
    }
    expect(catalogue.entries.find((entry) => entry.key === "allocation/<root>")?.risk_tier)
      .toBe("R1_PAPER_MUTATION");
    const mutationRisks = new Set([
      "R1_PAPER_MUTATION", "R2_SANDBOX", "R3_LIVE_PROTECTIVE", "R4_LIVE_RISK_INCREASING",
    ]);
    for (const entry of catalogue.entries) {
      if (entry.http_method !== null && entry.http_method !== "GET") {
        expect(entry.risk_tier).not.toBe("R0_READ");
        expect(entry.owner_review_required).toBe(true);
      }
      if (mutationRisks.has(String(entry.risk_tier))) {
        expect(entry.owner_review_required).toBe(true);
        expect(entry.plan_required).toBe(true);
        expect(entry.apply_required).toBe(true);
      }
    }
  });

  it("keeps typed-condition whitespace and semantic ordering rules explicit", () => {
    const schema = loadJson(join(schemaDir, "execution-operations.v1.schema.json")) as {
      $defs: Record<string, Record<string, unknown>>;
    };
    expect(schema.$defs.TypedCondition.$comment).toContain("expires_at must be on or after deadline");
    const validate = ajv.getSchema(
      "https://schemas.primusspark.com/portal/execution-operations.v1.schema.json#/$defs/ExecutionCommandPlanRequest",
    );
    expect(validate).toBeDefined();
    const request = {
      schema_version: "execution.command-plan-request.v1",
      workspace_id: "fixture-workspace",
      request_key: "fixture:condition:1",
      command_type: "EXECUTION_COMMAND",
      command_version: 1,
      command_key: "account/sync",
      environment: "PAPER",
      target: { type: "ACCOUNT", id: "paper-account-1" },
      expected_target_version: 1,
      payload: { dry_run: true },
      conditions: [{
        text: "valid condition text",
        owner: "fixture-owner",
        deadline: "2026-08-23",
        expires_at: "2026-08-24",
        blocking: true,
      }],
    };
    expect(validate!(request)).toBe(true);
    expect(validate!({
      ...request,
      conditions: [{ ...request.conditions[0], text: "        " }],
    })).toBe(false);
    expect(validate!({
      ...request,
      conditions: [{ ...request.conditions[0], owner: "   " }],
    })).toBe(false);
  });

  it("generated portal types reference both handoff endpoints", () => {
    const generated = readFileSync(join(ROOT, "generated", "portal-api.d.ts"), "utf8");
    expect(generated).toContain('"/api/v1/portal/registry"');
    expect(generated).toContain('"/api/v1/portal/summary"');
    expect(generated).toContain('"/api/v1/portal/links"');
    expect(generated).toContain("PortalSummaryV1");
    expect(generated).toContain("PortalRegistryDocument");
  });

  it("generated execution analytics types cover all six narrow screen APIs", () => {
    const generated = readFileSync(join(ROOT, "generated", "execution-analytics.d.ts"), "utf8");
    for (const route of [
      "/api/v1/execution/approvals/{approvalId}/capital-preview",
      "/api/v1/execution/orders/{orderId}/funnel",
      "/api/v1/execution/alphas/{alphaId}/insight-previews",
      "/api/v1/execution/portfolios/{portfolioId}/correlation",
      "/api/v1/execution/portfolios/{portfolioId}/capital-ledger",
      "/api/v1/execution/broker-bindings/{bindingId}/exposure",
    ]) expect(generated).toContain(`"${route}"`);
    expect(generated).toContain("AnalyticsScreenMetadata");
    expect(generated).toContain("CapitalPreviewData");
    expect(generated).toContain("ProjectionKeysetPage");
    expect(generated).toContain("ProjectionCurrencyAggregate");
  });

  it("generated execution operation types expose F0/F1 operations and incident surfaces", () => {
    const generated = readFileSync(join(ROOT, "generated", "execution-operations.d.ts"), "utf8");
    expect(generated).toContain('"/api/v1/execution/commands/catalog"');
    expect(generated).toContain('"/api/v1/execution/commands/plans"');
    expect(generated).toContain('"/api/v1/execution/operations/{operation_id}/apply"');
    expect(generated).toContain('"/api/v1/execution/operations/incidents"');
    expect(generated).toContain('"/api/v1/execution/operations/incidents/{incident_id}"');
    expect(generated).toContain('"/api/v1/execution/operations/incidents/{incident_id}/resolve"');
    expect(generated).toContain("IncidentDetail");
    expect(generated).toContain("IncidentWorkflowResponse");
    expect(generated).toContain("COMMAND_RELAY_DISABLED");
  });

  it("keeps F1b incidents source-dark, bounded and unable to resume deployments", () => {
    const detail = loadJson(join(ROOT, "fixtures", "execution-incident-detail.open.valid.json")) as {
      source_integration_state: string;
      incident: { source_side_effect_requested: boolean; deployment_resume_requested: boolean };
      source_panels: Array<{
        source_authority: string;
        panel_state: string;
        freshness_state: string;
        delivery_profile: string;
        read_at: string;
        data: unknown;
      }>;
      timeline: { returned_count: number; rows: unknown[] };
      resolution_gate: { eligible: boolean; blocker_codes: string[]; deployment_resume_requested: boolean };
    };
    expect(detail.source_integration_state).toBe("UNAVAILABLE");
    expect(detail.incident).toMatchObject({
      source_side_effect_requested: false,
      deployment_resume_requested: false,
    });
    expect(detail.source_panels).toHaveLength(4);
    expect(detail.source_panels.every((panel) =>
      panel.source_authority === "EXECUTION" &&
      panel.panel_state === "unavailable" &&
      panel.freshness_state === "UNKNOWN" &&
      panel.delivery_profile === "fixture" &&
      panel.read_at === "2026-08-23T12:00:00.000Z" &&
      panel.data === null,
    ))
      .toBe(true);
    expect(detail.timeline.returned_count).toBe(detail.timeline.rows.length);
    expect(detail.resolution_gate.eligible).toBe(false);
    expect(detail.resolution_gate.blocker_codes).toContain("CLEAN_DRY_RUN_EVIDENCE_REQUIRED");
    expect(detail.resolution_gate.deployment_resume_requested).toBe(false);

    const resolved = loadJson(join(ROOT, "fixtures", "execution-incident-workflow.resolved.valid.json")) as {
      source_side_effect_requested: boolean;
      deployment_resume_requested: boolean;
      detail: { incident: { workflow_state: string }; resolution_gate: { eligible: boolean; blocker_codes: string[] } };
    };
    expect(resolved).toMatchObject({
      source_side_effect_requested: false,
      deployment_resume_requested: false,
    });
    expect(resolved.detail.incident.workflow_state).toBe("RESOLVED");
    expect(resolved.detail.resolution_gate).toMatchObject({
      eligible: false,
      blocker_codes: ["INCIDENT_ALREADY_RESOLVED"],
    });
  });

  it("generated governance and realtime types cover their narrow boundaries", () => {
    const governance = readFileSync(join(ROOT, "generated", "execution-governance.d.ts"), "utf8");
    expect(governance).toContain('"/api/v1/execution/governance/approvals/{approval_id}/r2"');
    expect(governance).toContain("R2ReviewResponse");
    expect(governance).toContain("portfolio_id");
    expect(governance).toContain("currency");
    expect(governance).toContain('"/api/v1/execution/governance/exit-reviews/{review_id}"');
    expect(governance).toContain('"/api/v1/execution/commands/plans"');
    expect(governance).toContain("PaperExitReviewResponse");
    expect(governance).toContain("GOVERNANCE_PAPER_EXIT_DECISION");
    expect(governance).toContain("external_side_effect_requested");
    expect(governance).toContain('"/api/v1/execution/deployments/{deployment_id}/certification"');
    expect(governance).toContain('"/api/v1/execution/governance/sandbox-certifications/{certification_id}/decisions"');
    expect(governance).toContain("CertificationResponse");
    expect(governance).toContain("PromotionPlanResponse");

    const realtime = readFileSync(join(ROOT, "generated", "execution-realtime.d.ts"), "utf8");
    expect(realtime).toContain('"/api/v1/execution/command-center/stream"');
    expect(realtime).toContain("AuthExpiringEvent");
    expect(realtime).toContain("expires_at");
  });

  it("keeps the Canary source-dark and preserves protective/scale asymmetry", () => {
    const canary = loadJson(join(ROOT, "fixtures", "execution-canary-control-room.unavailable.valid.json")) as {
      production_command_active: boolean;
      source_side_effect_requested: boolean;
      deployment: { runtime_state: unknown };
      source_panels: Array<{ panel_state: string; data: unknown }>;
      command_policy: {
        guard_semantics: string;
        protective: { visible: boolean; enabled: boolean; broker_sync_blocks: boolean };
        scale_up: { visible: boolean; enabled: boolean; broker_sync_blocks: boolean };
      };
    };
    expect(canary).toMatchObject({
      production_command_active: false,
      source_side_effect_requested: false,
      deployment: { runtime_state: null },
    });
    expect(canary.source_panels.every((panel) => panel.panel_state === "unavailable" && panel.data === null)).toBe(true);
    expect(canary.command_policy).toMatchObject({
      guard_semantics: "BROKER_STALE_BLOCKS_SCALE_ONLY",
      protective: { visible: false, enabled: false, broker_sync_blocks: false },
      scale_up: { visible: false, enabled: false, broker_sync_blocks: true },
    });
    const generated = readFileSync(join(ROOT, "generated", "execution-canary.d.ts"), "utf8");
    expect(generated).toContain('"/api/v1/execution/deployments/{deployment_id}/canary"');
    expect(generated).toContain('"/api/v1/execution/governance/canary-envelopes"');
    expect(generated).toContain("BROKER_STALE_BLOCKS_SCALE_ONLY");
  });

  it("keeps the Command Center bounded, dark and exact-or-null", () => {
    const busy = loadJson(join(ROOT, "fixtures", "execution-command-center.busy.valid.json")) as {
      snapshot: { stream_available: boolean; cursor: unknown };
      panels: { needs_you: { total_count: number; items: unknown[] } };
    };
    const partial = loadJson(join(ROOT, "fixtures", "execution-command-center.partial.valid.json")) as {
      panels: { needs_you: { exact_total: boolean; total_count: unknown; truncated: unknown } };
    };
    expect(busy.snapshot).toMatchObject({ stream_available: false, cursor: null });
    expect(busy.panels.needs_you.total_count).toBeGreaterThan(busy.panels.needs_you.items.length);
    expect(partial.panels.needs_you).toMatchObject({
      exact_total: false,
      total_count: null,
      truncated: null,
    });
    const generated = readFileSync(join(ROOT, "generated", "execution-command-center.d.ts"), "utf8");
    expect(generated).toContain('"/api/v1/execution/command-center"');
    expect(generated).toContain("CommandCenterSnapshot");
    expect(generated).toContain("command-center.triage-rank.v1");
  });
});
