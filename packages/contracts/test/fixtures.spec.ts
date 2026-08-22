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

    const realtime = readFileSync(join(ROOT, "generated", "execution-realtime.d.ts"), "utf8");
    expect(realtime).toContain('"/api/v1/execution/command-center/stream"');
    expect(realtime).toContain("AuthExpiringEvent");
    expect(realtime).toContain("expires_at");
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
