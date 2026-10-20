/**
 * The V1 readers carry the BE-P2/P3 members as ADDITIVE fields and nothing else about them changes: reading a published body
 * and reading the same body with the new members removed give the same V1 object except for those fields. That is the proof
 * the V1 screens (which read only the older fields) render identically. Lane: FIXTURE_LAB over the canonical dark bodies.
 */
import { describe, expect, it } from "vitest";

import { readCanaryControlRoom, readSandboxCertification } from "./certification";
import { readLiveFullOperations } from "./liveFull";
import { loadCanonical } from "./v2/testkit/loadCanonical";

type Any = Record<string, any>;
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const IDENTITY = ["alpha_id", "alpha_name", "portfolio_name", "alpha_reason_code", "portfolio_name_reason_code"];

function stripCanary(body: Any): Any {
  const b = clone(body);
  delete b.stage_facts;
  delete b.source_figures;
  for (const k of IDENTITY) delete b.deployment[k];
  delete b.envelope_compliance.rows;
  delete b.envelope_compliance.verdict;
  delete b.rollback_readiness.items;
  delete b.lifecycle.trial;
  delete b.positions.typed;
  delete b.blotter.typed;
  return b;
}
function stripLive(body: Any): Any {
  const b = clone(body);
  delete b.stage_facts;
  delete b.source_figures;
  for (const k of IDENTITY) delete b.deployment[k];
  delete b.positions.typed;
  delete b.orders.typed;
  delete b.projection_continuity.gap_ranges;
  return b;
}
function stripSandbox(body: Any): Any {
  const b = clone(body);
  delete b.stage_facts;
  delete b.source_figures;
  for (const k of IDENTITY) delete b.certification[k];
  return b;
}

/** An object without the listed keys. */
const without = (o: object, keys: string[]): Record<string, unknown> => Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)));

describe("Canary V1", () => {
  const ADDED = ["identity", "stageFacts", "sourceFigures", "complianceRows", "complianceVerdict", "rollbackItems", "trial", "typedPositions", "typedOrders", "seriesMembers"];
  it("the published body carries every additive member and the older fields are identical to the stripped body's", () => {
    const published = loadCanonical<Any>("execution-canary-control-room.unavailable");
    const full = readCanaryControlRoom(published)!;
    const old = readCanaryControlRoom(stripCanary(published))!;
    expect(full.stageFacts?.runtime.state).toEqual({ availability: "NOT_PUBLISHED", reasonCode: "LIVE_SOURCE_UNAVAILABLE" });
    expect(full.complianceRows).toHaveLength(4);
    expect(full.rollbackItems).toHaveLength(4);
    expect(full.trial?.durationDays).toBe(14);
    expect(full.typedPositions?.availability).toBe("NOT_PUBLISHED");
    expect(full.sourceFigures).toHaveLength(5);
    expect(full.identity?.alphaReasonCode).toBe("DEPLOYMENT_IDENTITY_NOT_READ");
    // `seriesMembers` is read from the (older) series object itself, so it exists either way; the rest are absent without the members.
    for (const key of ADDED.filter((k) => k !== "seriesMembers")) expect(old[key as keyof typeof old], key).toBeNull();
    expect(old.seriesMembers).toEqual(full.seriesMembers);
    expect(without(full, ADDED)).toEqual(without(old, ADDED));
  });
});

describe("Live V1", () => {
  const ADDED = ["identity", "stageFacts", "sourceFigures", "withheldFigures", "typedPositions", "typedOrders", "seriesMembers", "gapRanges"];
  it("the older fields are identical with and without the members; the figures are stripped exactly where the broker KPIs are", () => {
    const published = loadCanonical<Any>("execution-live-full-operations.unavailable");
    const full = readLiveFullOperations(published)!;
    const old = readLiveFullOperations(stripLive(published))!;
    expect(full.stageFacts).not.toBeNull();
    expect(full.gapRanges).toEqual({ availability: "NOT_PUBLISHED", reasonCode: "SOURCE_CONTINUITY_UNAVAILABLE" });
    // the dark body does not release broker values: Broker and Difference are withheld, Internal is kept
    expect(full.withheldFigures).toBe(true);
    expect(full.sourceFigures!.every((f) => f.broker === null && f.difference === null && f.internal !== null)).toBe(true);
    expect(without(full, ADDED)).toEqual(without(old, ADDED));
  });

  it("with broker values visible the Broker and Difference sides are kept", () => {
    const published = loadCanonical<Any>("execution-live-full-operations.unavailable");
    published.broker_consistency.broker_values_visible = true;
    const full = readLiveFullOperations(published)!;
    expect(full.withheldFigures).toBe(false);
    expect(full.sourceFigures!.every((f) => f.broker !== null && f.difference !== null)).toBe(true);
  });
});

describe("Sandbox V1", () => {
  const ADDED = ["identity", "stageFacts", "sourceFigures"];
  it("the older fields are identical with and without the members (finding openedAt and plan author/envelope are new keys on the row objects)", () => {
    const published = loadCanonical<Any>("execution-sandbox-certification.unavailable");
    const full = readSandboxCertification(published)!;
    const old = readSandboxCertification(stripSandbox(published))!;
    expect(full.stageFacts?.sessions.availability).toBe("NOT_PUBLISHED");
    expect(full.sourceFigures).toHaveLength(5);
    expect(full.identity).not.toBeNull();
    for (const key of ADDED) expect(old[key as keyof typeof old], key).toBeNull();
    expect(without(full, ADDED)).toEqual(without(old, ADDED));
  });

  it("a finding's opened_at and a plan's author / envelope are read from the synthetic rows", () => {
    const published = loadCanonical<Any>("execution-sandbox-certification.unavailable");
    const rows = loadCanonical<Any>("execution-stage-rows.synthetic").value;
    published.findings = { total_count: 1, returned_count: 1, truncated: false, rows: [rows.finding_row] };
    published.promotion_plans = rows.plan_rows;
    const read = readSandboxCertification(published)!;
    expect(read.findings.rows[0]!.openedAt).toBe("2026-10-12T08:00:00.000Z");
    expect(read.promotionPlans[0]!.author).toBe("usr_TEST_ONLY_author");
    expect(read.promotionPlans[0]!.envelope).toEqual({ availability: "AVAILABLE", value: { envelopeId: "cenv_TEST_ONLY_1", revision: 1, status: "DRAFT" } });
    expect(read.promotionPlans[1]!.envelope).toEqual({ availability: "AVAILABLE", value: null });
  });
});
