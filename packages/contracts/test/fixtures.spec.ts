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
  "execution-staged-activation.capabilities.valid.json":
    "https://schemas.primusspark.com/portal/execution-staged-activation.v1.schema.json#/$defs/CapabilitiesResponse",
  "execution-staged-activation.plan-blocked.valid.json":
    "https://schemas.primusspark.com/portal/execution-staged-activation.v1.schema.json#/$defs/PlanResponse",
  "execution-staged-activation.states.valid.json":
    "https://schemas.primusspark.com/portal/execution-staged-activation.v1.schema.json#/$defs/UiStateCorpus",
  "execution-intercell-gateway.source-dark.valid.json":
    "https://schemas.primusspark.com/portal/execution-intercell-gateway.v1.schema.json#/$defs/GatewayProfile",
  "execution-intercell-gateway.event-corpus.valid.json":
    "https://schemas.primusspark.com/portal/execution-intercell-gateway.v1.schema.json#/$defs/EventCorpus",
  "execution-intercell-gateway.artifact-corpus.valid.json":
    "https://schemas.primusspark.com/portal/execution-intercell-gateway.v1.schema.json#/$defs/ArtifactCorpus",
  "execution-intercell-gateway.current-paper.accepted.json":
    "https://schemas.primusspark.com/portal/execution-intercell-gateway-current.v1.schema.json",
  "execution-protective-path.current-emergency-close.accepted.json":
    "https://schemas.primusspark.com/portal/execution-protective-path-current.v1.schema.json",
  "execution-emergency-routing.source-dark.valid.json":
    "https://schemas.primusspark.com/portal/execution-emergency-routing.v1.schema.json#/$defs/EmergencyProfile",
  "execution-emergency-routing.ui-corpus.valid.json":
    "https://schemas.primusspark.com/portal/execution-emergency-routing.v1.schema.json#/$defs/UiStateCorpus",
  "execution-production-readiness.source-dark.valid.json":
    "https://schemas.primusspark.com/portal/execution-production-readiness.v1.schema.json#/$defs/ReadinessProfile",
  "execution-production-readiness.game-day-corpus.valid.json":
    "https://schemas.primusspark.com/portal/execution-production-readiness.v1.schema.json#/$defs/GameDayCorpus",
  "execution-production-acceptance.current-paper.accepted.json":
    "https://schemas.primusspark.com/portal/execution-production-acceptance-current.v1.schema.json",
  "execution-screen-bff.ui-states.valid.json":
    "https://schemas.primusspark.com/portal/execution-screen-bff.v1.schema.json#/$defs/UiStateCorpus",
  "execution-screen-bff.unavailable.valid.json":
    "https://schemas.primusspark.com/portal/execution-screen-bff.v1.schema.json#/$defs/DetailResponse",
  "execution-analytics.equity-projection.valid.json":
    "https://schemas.primusspark.com/portal/execution-analytics-series.v1.schema.json#/$defs/EquityProjectionResponse",
  "execution-analytics.insight-line.valid.json":
    "https://schemas.primusspark.com/portal/execution-analytics-series.v1.schema.json#/$defs/InsightTileBatch",
  "execution-analytics.insight-histogram.valid.json":
    "https://schemas.primusspark.com/portal/execution-analytics-series.v1.schema.json#/$defs/InsightTileBatch",
  "execution-analytics.insight-funnel.valid.json":
    "https://schemas.primusspark.com/portal/execution-analytics-series.v1.schema.json#/$defs/InsightTileBatch",
  "execution-analytics.insight-waterfall.valid.json":
    "https://schemas.primusspark.com/portal/execution-analytics-series.v1.schema.json#/$defs/InsightTileBatch",
  "execution-analytics.insight-heatmap.valid.json":
    "https://schemas.primusspark.com/portal/execution-analytics-series.v1.schema.json#/$defs/InsightTileBatch",
  "execution-analytics.insight-bar.valid.json":
    "https://schemas.primusspark.com/portal/execution-analytics-series.v1.schema.json#/$defs/InsightTileBatch",
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

  it("keeps the N20 seven-state corpus exact, non-actionable and source-safe", () => {
    const corpus = loadJson(
      join(fixtureDir, "execution-screen-bff.ui-states.valid.json"),
    ) as { states: Array<Record<string, unknown>> };
    expect(corpus.states.map((item) => item.state)).toEqual([
      "ready", "empty", "stale", "partial", "denied", "unavailable", "error",
    ]);
    expect(corpus.states.every((item) => item.action_enabled === false)).toBe(true);
    const unavailable = loadJson(
      join(fixtureDir, "execution-screen-bff.unavailable.valid.json"),
    ) as Record<string, unknown> & {
      screen: { composition_policy: Record<string, unknown>; data_api: Record<string, unknown> };
      delivery: Record<string, unknown>;
    };
    expect(unavailable.screen.composition_policy).toEqual({
      source_join: "SERVER_ONLY",
      verdicts: "SERVER_ONLY",
      counts: "SERVER_ONLY",
      filtering: "SERVER_ONLY",
      sorting: "SERVER_ONLY",
      sla: "SERVER_ONLY",
      permissions: "SERVER_ONLY",
    });
    expect(unavailable.screen.data_api).toMatchObject({ status: "TYPED_UNAVAILABLE" });
    expect(unavailable.delivery).toMatchObject({
      state: "unavailable", payload: null, retryable: false,
    });
    expect(JSON.stringify(unavailable)).not.toMatch(/public\.|manager\.|postgres:|redis:/i);
  });

  it("keeps the generated N20 consumer types aligned with the canonical API", () => {
    const generated = readFileSync(
      join(ROOT, "generated", "execution-screen-bff.d.ts"),
      "utf8",
    );
    expect(generated).toContain("executionScreenBffCatalogue");
    expect(generated).toContain("executionScreenBffContract");
    for (const state of [
      "ready",
      "empty",
      "stale",
      "partial",
      "denied",
      "unavailable",
      "error",
    ]) {
      expect(generated).toContain(`\"${state}\"`);
    }
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

  it("keeps every N13A capability source-dark and every UI corpus action disabled", () => {
    const capabilities = loadJson(
      join(fixtureDir, "execution-staged-activation.capabilities.valid.json"),
    ) as { capabilities: Array<Record<string, unknown>> };
    const states = loadJson(
      join(fixtureDir, "execution-staged-activation.states.valid.json"),
    ) as Array<Record<string, unknown>>;
    expect(capabilities.capabilities).toHaveLength(7);
    expect(capabilities.capabilities.every((item) =>
      item.effective_profile === "fixture" && item.source_enabled === false &&
      item.runtime_enabled === false && item.kill_switch_engaged === true)).toBe(true);
    expect(states.map((item) => item.state)).toEqual([
      "fixture", "denied", "incompatible", "stale", "partial", "rollback", "restart",
    ]);
    expect(states.every((item) => item.action_enabled === false)).toBe(true);
  });

  it("keeps N15A four-interface authority source-dark, separate and bounded", () => {
    const profile = loadJson(
      join(fixtureDir, "execution-intercell-gateway.source-dark.valid.json"),
    ) as {
      source_dark: boolean;
      runtime_active: boolean;
      source_call_authorized: boolean;
      identity_policy: Record<string, unknown>;
      interfaces: Array<{ interface: string; publication_state: string }>;
      transports: Array<Record<string, unknown> & { interface: string }>;
    };
    expect(profile).toMatchObject({
      source_dark: true,
      runtime_active: false,
      source_call_authorized: false,
    });
    expect(profile.interfaces.map((item) => item.interface)).toEqual([
      "QUERY", "COMMAND", "EVENT", "ARTIFACT",
    ]);
    expect(profile.interfaces.every((item) => item.publication_state === "FIXTURE_ONLY")).toBe(true);
    expect(profile.identity_policy).toMatchObject({
      identities_distinct: true,
      delegated_resource_policy: "EXACT_RESOURCE_ONLY",
      raw_browser_token_forwarding: false,
      wildcard_scope_allowed: false,
    });
    expect(profile.transports.every((item) =>
      item.redirects_allowed === false && item.http2_required === true &&
      item.tls13_required === true && item.retry_after_dispatch === 0)).toBe(true);
    expect(profile.transports.find((item) => item.interface === "COMMAND"))
      .toMatchObject({ retry_before_dispatch: 0, method: "POST" });

    const schema = ajv.getSchema(
      "https://schemas.primusspark.com/portal/execution-intercell-gateway.v1.schema.json#/$defs/GatewayProfile",
    );
    expect(schema!({ ...profile, runtime_active: true })).toBe(false);
    expect(schema!({ ...profile, source_call_authorized: true })).toBe(false);
    expect(schema!({
      ...profile,
      identity_policy: { ...profile.identity_policy, wildcard_scope_allowed: true },
    })).toBe(false);
  });

  it("publishes N15A component codegen without mounting a runtime route", () => {
    const openapi = loadJson(
      join(ROOT, "openapi", "execution-intercell-gateway.openapi.json"),
    ) as { paths: Record<string, unknown>; servers: unknown[]; "x-runtime-mounted": boolean };
    expect(openapi.paths).toEqual({});
    expect(openapi.servers).toEqual([]);
    expect(openapi["x-runtime-mounted"]).toBe(false);
    const generated = readFileSync(
      join(ROOT, "generated", "execution-intercell-gateway.d.ts"),
      "utf8",
    );
    for (const token of [
      "GatewayInterface",
      "GatewayProfile",
      "InterfaceNegotiation",
      "GatewayEvent",
      "ArtifactDescriptor",
    ]) expect(generated).toContain(token);
  });

  it("rejects incomplete N15A events and artifact descriptors", () => {
    const events = loadJson(
      join(fixtureDir, "execution-intercell-gateway.event-corpus.valid.json"),
    ) as { events: Array<Record<string, unknown>> };
    const artifacts = loadJson(
      join(fixtureDir, "execution-intercell-gateway.artifact-corpus.valid.json"),
    ) as { cases: Array<{ descriptor: Record<string, unknown> }> };
    const eventSchema = ajv.getSchema(
      "https://schemas.primusspark.com/portal/execution-intercell-gateway.v1.schema.json#/$defs/GatewayEvent",
    );
    const artifactSchema = ajv.getSchema(
      "https://schemas.primusspark.com/portal/execution-intercell-gateway.v1.schema.json#/$defs/ArtifactDescriptor",
    );
    const { cursor: _cursor, ...eventWithoutCursor } = events.events[0];
    const { sha256: _digest, ...artifactWithoutDigest } = artifacts.cases[0].descriptor;
    expect(eventSchema!(eventWithoutCursor)).toBe(false);
    expect(eventSchema!({ ...events.events[0], operation: "PATCH" })).toBe(false);
    expect(artifactSchema!(artifactWithoutDigest)).toBe(false);
    expect(artifactSchema!({ ...artifacts.cases[0].descriptor, access_policy: "PUBLIC" })).toBe(false);
  });

  it("accepts only the exact N15B current Paper Query capability slice", () => {
    const acceptance = loadJson(
      join(fixtureDir, "execution-intercell-gateway.current-paper.accepted.json"),
    ) as Record<string, unknown>;
    const validate = ajv.getSchema(
      "https://schemas.primusspark.com/portal/execution-intercell-gateway-current.v1.schema.json",
    );
    expect(validate).toBeDefined();
    expect(validate!(acceptance)).toBe(true);
    expect(acceptance).toMatchObject({
      phase: "N15B",
      profile: {
        environment: "paper",
        manager_profile_id: "PAPER_BINANCE_USDM",
        screen_id: "PAPER_TRADING_SCREEN",
      },
      interfaces: [
        { interface: "QUERY", state: "ACCEPTED_CURRENT_SOURCE" },
        { interface: "COMMAND", state: "DEFERRED_N16B" },
        { interface: "EVENT", state: "SOURCE_DOES_NOT_CURRENTLY_EXIST", enabled: false },
        { interface: "ARTIFACT", state: "SOURCE_DOES_NOT_CURRENTLY_EXIST", enabled: false },
      ],
      runtime_authority: {
        private_query_contract_accepted: true,
        n15b_candidate_deployed: false,
        product_bff_enabled: false,
        registry_promoted: false,
        sse_enabled: false,
        command_enabled: false,
        trading_system_changed: false,
      },
    });

    const widened = structuredClone(acceptance) as Record<string, unknown>;
    (widened.profile as Record<string, unknown>).screen_id = "EXECUTION_FULL_BLOTTER_SCREEN";
    expect(validate!(widened)).toBe(false);
  });

  it("keeps N16A same-domain emergency routing source-dark and R4 forbidden", () => {
    const profile = loadJson(
      join(fixtureDir, "execution-emergency-routing.source-dark.valid.json"),
    ) as {
      runtime_active: boolean;
      network_authorized: boolean;
      source_call_authorized: boolean;
      route: Record<string, unknown>;
      command: Record<string, unknown> & {
        protective_capabilities: string[];
        forbidden_risk_increasing_capabilities: string[];
      };
    };
    expect(profile).toMatchObject({
      runtime_active: false,
      network_authorized: false,
      source_call_authorized: false,
    });
    expect(profile.route).toMatchObject({
      public_origin: "https://portal.primusspark.com",
      path_prefix: "/ops/emergency/",
      browser_mode: "SAME_ORIGIN_ONLY",
      origin_resolution: "SERVER_SIDE_ONLY",
      public_route_active: false,
      execution_origin_bound: false,
      browser_internal_origin_visible: false,
      browser_delegated_token_visible: false,
    });
    expect(profile.command.protective_capabilities).toEqual([
      "LIVE_HALT", "LIVE_REDUCE", "LIVE_EMERGENCY_CLOSE",
    ]);
    expect(profile.command.forbidden_risk_increasing_capabilities).toEqual([
      "LIVE_RESUME", "LIVE_SCALE",
    ]);
    expect(profile.command).toMatchObject({
      n12_r3_catalogue_published: false,
      dedicated_command_identity_bound: false,
      control_visible: false,
      plan_allowed: false,
      apply_allowed: false,
      verify_allowed: false,
    });

    const schema = ajv.getSchema(
      "https://schemas.primusspark.com/portal/execution-emergency-routing.v1.schema.json#/$defs/EmergencyProfile",
    );
    expect(schema!({ ...profile, runtime_active: true })).toBe(false);
    expect(schema!({
      ...profile,
      route: { ...profile.route, public_route_active: true },
    })).toBe(false);
    expect(schema!({
      ...profile,
      command: { ...profile.command, n12_r3_catalogue_published: true },
    })).toBe(false);
  });

  it("accepts only the exact N16B current emergency-close compatibility slice", () => {
    const acceptance = loadJson(
      join(fixtureDir, "execution-protective-path.current-emergency-close.accepted.json"),
    ) as Record<string, unknown>;
    const validate = ajv.getSchema(
      "https://schemas.primusspark.com/portal/execution-protective-path-current.v1.schema.json",
    );
    expect(validate).toBeDefined();
    expect(validate!(acceptance)).toBe(true);
    expect(acceptance).toMatchObject({
      phase: "N16B",
      status: "CURRENT_PRIMITIVE_COMPATIBILITY_ACCEPTED",
      accepted_mapping: {
        capability_id: "live.emergency-close",
        environment: "LIVE_FULL",
        target_types: ["ACCOUNT"],
        source_idempotent: false,
        automatic_retry_after_dispatch: false,
      },
      runtime_authority: {
        compatibility_contract_accepted: true,
        command_transport_enabled: false,
        source_call_authorized: false,
        public_route_enabled: false,
        live_mutation_authorized: false,
        runtime_probe_executed: false,
      },
    });

    const widenedTarget = structuredClone(acceptance) as Record<string, unknown>;
    (widenedTarget.accepted_mapping as Record<string, unknown>).target_types = [
      "ACCOUNT", "PORTFOLIO",
    ];
    expect(validate!(widenedTarget)).toBe(false);

    const activated = structuredClone(acceptance) as Record<string, unknown>;
    (activated.runtime_authority as Record<string, unknown>).command_transport_enabled = true;
    expect(validate!(activated)).toBe(false);

    const r4Inherited = structuredClone(acceptance) as Record<string, unknown>;
    const classifications = r4Inherited.capability_classification as Array<Record<string, unknown>>;
    classifications[7].state = "ACCEPTED_CURRENT_PRIMITIVE";
    expect(validate!(r4Inherited)).toBe(false);
  });

  it("publishes N16A typed failure corpus without a route or source request", () => {
    const corpus = loadJson(
      join(fixtureDir, "execution-emergency-routing.ui-corpus.valid.json"),
    ) as {
      routes: Array<Record<string, unknown>>;
      commands: Array<Record<string, unknown>>;
    };
    expect(corpus.routes.map((route) => route.scenario)).toEqual([
      "NORMAL_RESEARCH", "RESEARCH_LOSS", "CLOUDFLARE_LOSS",
      "EXECUTION_ORIGIN_LOSS", "ROLLBACK",
    ]);
    expect(corpus.routes.every((route) =>
      route.route_target === "NONE" && route.control_visible === false &&
      route.source_request_sent === false && route.network_attempts === 0)).toBe(true);
    expect(corpus.commands.every((command) =>
      command.decision === "DENIED" && command.plan_allowed === false &&
      command.apply_allowed === false && command.verify_allowed === false &&
      command.source_request_sent === false)).toBe(true);
    expect(corpus.commands.find((command) => command.risk_tier === "R4_LIVE_RISK_INCREASING"))
      .toMatchObject({ reason: "RISK_INCREASING_FORBIDDEN" });

    const openapi = loadJson(
      join(ROOT, "openapi", "execution-emergency-routing.openapi.json"),
    ) as {
      paths: Record<string, unknown>;
      servers: unknown[];
      "x-runtime-mounted": boolean;
      "x-public-route-active": boolean;
    };
    expect(openapi.paths).toEqual({});
    expect(openapi.servers).toEqual([]);
    expect(openapi["x-runtime-mounted"]).toBe(false);
    expect(openapi["x-public-route-active"]).toBe(false);
  });

  it("keeps N17A readiness budgets provisional, source-dark and owner-gated", () => {
    const profile = loadJson(
      join(fixtureDir, "execution-production-readiness.source-dark.valid.json"),
    ) as {
      production_active: boolean;
      network_authorized: boolean;
      source_call_authorized: boolean;
      command_authorized: boolean;
      production_slo_claimed: boolean;
      budgets: Array<Record<string, unknown>>;
      error_budget: Record<string, unknown>;
      recovery: Array<Record<string, unknown>>;
      rotations: Array<Record<string, unknown>>;
      capacity: Record<string, unknown>;
    };
    expect(profile).toMatchObject({
      production_active: false,
      network_authorized: false,
      source_call_authorized: false,
      command_authorized: false,
      production_slo_claimed: false,
    });
    expect(profile.budgets).toHaveLength(7);
    expect(profile.budgets.every((budget) =>
      budget.authority === "PROVISIONAL_QUALIFICATION_ONLY" &&
      budget.production_slo_claimed === false)).toBe(true);
    expect(profile.error_budget).toMatchObject({
      mode: "NOT_MEASURED",
      availability_target_basis_points: null,
      production_window_open: false,
      burn_alert_active: false,
    });
    expect(profile.recovery).toHaveLength(3);
    expect(profile.recovery.every((item) =>
      item.production_rpo_seconds === null && item.production_rto_seconds === null &&
      item.owner_approval_required === true)).toBe(true);
    expect(profile.rotations).toHaveLength(5);
    expect(profile.rotations.every((item) =>
      item.runtime_identity_bound === false && item.secret_material_present === false)).toBe(true);
    expect(profile.capacity).toMatchObject({
      six_month_order_fill_rows: 182000,
      initial_concurrent_sse_clients: 100,
      maximum_chart_points: 5000,
      maximum_correlation_assets: 150,
      monthly_cost_budget_usd: null,
      cost_owner_approval_required: true,
    });

    const validate = ajv.getSchema(
      "https://schemas.primusspark.com/portal/execution-production-readiness.v1.schema.json#/$defs/ReadinessProfile",
    );
    expect(validate!({ ...profile, production_active: true })).toBe(false);
    expect(validate!({ ...profile, production_slo_claimed: true })).toBe(false);
    expect(validate!({
      ...profile,
      error_budget: { ...profile.error_budget, availability_target_basis_points: 9990 },
    })).toBe(false);
  });

  it("keeps every N17A game-day case isolated and non-authoritative", () => {
    const corpus = loadJson(
      join(fixtureDir, "execution-production-readiness.game-day-corpus.valid.json"),
    ) as {
      fixture_only: boolean;
      production_active: boolean;
      cases: Array<Record<string, unknown>>;
    };
    expect(corpus.fixture_only).toBe(true);
    expect(corpus.production_active).toBe(false);
    expect(corpus.cases.map((item) => item.scenario)).toEqual([
      "NETWORK_PARTITION", "AUTH_LOSS", "SOURCE_LOSS", "COMMAND_CONTAINMENT",
      "CONTROL_DATABASE_PITR", "PROJECTION_REBUILD", "RELEASE_ROLLBACK",
      "CREDENTIAL_COMPROMISE",
    ]);
    expect(corpus.cases.every((item) =>
      item.isolated === true && item.expected_outcome === "PASS" &&
      item.expected_source_request_sent === false &&
      item.expected_command_dispatched === false &&
      item.expected_network_attempts === 0)).toBe(true);

    const openapi = loadJson(
      join(ROOT, "openapi", "execution-production-readiness.openapi.json"),
    ) as {
      paths: Record<string, unknown>;
      servers: unknown[];
      "x-runtime-mounted": boolean;
      "x-production-active": boolean;
      "x-production-slo-claimed": boolean;
    };
    expect(openapi.paths).toEqual({});
    expect(openapi.servers).toEqual([]);
    expect(openapi["x-runtime-mounted"]).toBe(false);
    expect(openapi["x-production-active"]).toBe(false);
    expect(openapi["x-production-slo-claimed"]).toBe(false);
    const generated = readFileSync(
      join(ROOT, "generated", "execution-production-readiness.d.ts"),
      "utf8",
    );
    for (const token of [
      "ReadinessProfile", "ProvisionalBudget", "RecoveryPolicy",
      "RotationPolicy", "GameDayCase", "QualificationResult",
    ]) expect(generated).toContain(token);
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

  it("publishes one typed Execution envelope sample per mapper event type", () => {
    const corpus = loadJson(join(fixtureDir, "execution-events.corpus.valid.json")) as Array<Record<string, unknown>>;
    const validate = ajv.getSchema(
      "https://schemas.primusspark.com/portal/execution-event-envelope.v1.schema.json",
    );
    expect(validate).toBeDefined();
    expect(corpus).toHaveLength(10);
    expect(new Set(corpus.map((event) => event.event_type)).size).toBe(10);
    for (const event of corpus) {
      if (!validate!(event)) throw new Error(JSON.stringify(validate!.errors, null, 2));
      expect(event.schema_version).toBe("execution.event.v1");
      expect(typeof event.schema_version).toBe("string");
    }
    expect(validate!({ ...corpus[0], schema_version: 1 })).toBe(false);
    expect(validate!({ ...corpus[0], entity_kind: "position" })).toBe(false);
    expect(validate!({ ...corpus[0], payload: { ...(corpus[0].payload as object), quantity: 1 } })).toBe(false);
  });

  it("keeps N10 series contracts source-dark and tile kinds semantic", () => {
    const equity = loadJson(join(fixtureDir, "execution-analytics.equity-projection.valid.json")) as {
      runtime_active: boolean;
      source_side_effect_requested: boolean;
      analytics: { data: { points: Array<{ equity: string | null }>; gaps: unknown[] } };
    };
    expect(equity.runtime_active).toBe(false);
    expect(equity.source_side_effect_requested).toBe(false);
    expect(equity.analytics.data.points.some((point) => point.equity === null)).toBe(true);
    expect(equity.analytics.data.gaps.length).toBeGreaterThan(0);

    const line = loadJson(join(fixtureDir, "execution-analytics.insight-line.valid.json")) as {
      tiles: Array<Record<string, unknown>>;
    };
    const validate = ajv.getSchema(
      "https://schemas.primusspark.com/portal/execution-analytics-series.v1.schema.json#/$defs/InsightTileBatch",
    );
    expect(validate).toBeDefined();
    expect(validate!({
      ...line,
      tiles: [{ ...line.tiles[0], tile_kind: "bar" }],
    })).toBe(false);
    expect(validate!({ ...line, runtime_active: true })).toBe(false);
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
