/**
 * U02 contract tests for the presentation mapping.
 *
 * These assert the display rules that FRONTEND_HANDOFF §3–§4 makes binding.
 * They are deliberately written against the shipped canonical fixtures rather
 * than hand-built objects, so a contract change in the backend fixtures shows
 * up here instead of silently passing.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { PortalSummaryV1 } from "../portal/contracts";
import { readMetric } from "../portal/contracts";
import {
  COMPONENT_STATES,
  availabilityPresentation,
  componentStateFor,
  dataModeBanner,
  freshnessOf,
  maturityPresentation,
  reasonCopy,
  renderMetric,
} from "./portalState";

const FIXTURES = join(process.cwd(), "../registry/fixtures");

function summary(name: string): PortalSummaryV1 {
  return JSON.parse(readFileSync(join(FIXTURES, `summary.${name}.json`), "utf8"));
}

function section(doc: PortalSummaryV1, featureId: string) {
  const found = doc.sections.find((s) => s.feature_id === featureId);
  if (!found) throw new Error(`section not in fixture: ${featureId}`);
  return found;
}

describe("availability presentation", () => {
  it("covers every state in the contract", () => {
    for (const state of [
      "available",
      "degraded",
      "stale",
      "unavailable",
      "denied",
      "commissioned",
    ] as const) {
      const presentation = availabilityPresentation(state);
      expect(presentation.label).toBeTruthy();
      expect(presentation.glyph).toBeTruthy();
    }
  });

  it("only lets available / degraded / stale carry a number", () => {
    expect(availabilityPresentation("available").rendersValue).toBe(true);
    expect(availabilityPresentation("degraded").rendersValue).toBe(true);
    expect(availabilityPresentation("stale").rendersValue).toBe(true);
    expect(availabilityPresentation("unavailable").rendersValue).toBe(false);
    expect(availabilityPresentation("denied").rendersValue).toBe(false);
    expect(availabilityPresentation("commissioned").rendersValue).toBe(false);
  });

  it("gives each state a distinct label and glyph", () => {
    const states = ["available", "degraded", "stale", "unavailable", "denied", "commissioned"] as const;
    const labels = states.map((s) => availabilityPresentation(s).label);
    const glyphs = states.map((s) => availabilityPresentation(s).glyph);
    expect(new Set(labels).size).toBe(states.length);
    expect(new Set(glyphs).size).toBe(states.length);
  });

  it("keeps the seven required component states separable", () => {
    for (const required of [
      "loading",
      "empty",
      "partial",
      "stale",
      "denied",
      "unavailable",
      "terminal",
    ] as const) {
      expect(COMPONENT_STATES).toContain(required);
    }
    expect(new Set(COMPONENT_STATES).size).toBe(COMPONENT_STATES.length);
  });

  it("splits unavailable into retryable and terminal", () => {
    const base = {
      as_of: null,
      authority: { contract: "c", endpoint: null, service: "s" },
      checked_at: "2026-08-15T18:00:00Z",
      detail: null,
      provenance: { content_digest: null, source_revision: null },
      reason_code: "UPSTREAM_UNAVAILABLE" as const,
      stale_after_seconds: null,
      state: "unavailable" as const,
    };
    expect(componentStateFor({ ...base, retryable: true })).toBe("failed-retryable");
    expect(componentStateFor({ ...base, retryable: false })).toBe("unavailable");
  });
});

describe("renderMetric — a missing number never becomes zero", () => {
  it("renders real zeros from the empty fixture", () => {
    const quantbt = section(summary("empty"), "QUANTBT_RESEARCH");
    const total = renderMetric(readMetric(quantbt, "total_runs"));
    expect(total).toEqual({ kind: "value", text: "0", state: "available" });
  });

  it("refuses to render a value for every unavailable Planning metric", () => {
    const planning = section(summary("partial"), "PLANNING");
    for (const key of Object.keys(planning.metrics)) {
      const rendered = renderMetric(readMetric(planning, key));
      expect(rendered.kind).toBe("state");
      if (rendered.kind === "state") {
        expect(rendered.state).toBe("unavailable");
        // The local-only reason must reach the user, not a bare dash.
        expect(rendered.reason).toBeTruthy();
      }
    }
  });

  it("refuses to render a value for denied metrics and explains why", () => {
    const planning = section(summary("denied"), "PLANNING");
    const rendered = renderMetric(readMetric(planning, "total_tasks"));
    expect(rendered.kind).toBe("state");
    if (rendered.kind === "state") {
      expect(rendered.state).toBe("denied");
      expect(rendered.reason).toContain("read access");
    }
  });

  it("still shows numbers when the SECTION is stale but the metric is real", () => {
    const quantbt = section(summary("stale"), "QUANTBT_RESEARCH");
    expect(quantbt.availability.state).toBe("stale");
    const rendered = renderMetric(readMetric(quantbt, "total_runs"));
    expect(rendered).toEqual({ kind: "value", text: "3", state: "available" });
  });

  it("treats an unknown metric key as unavailable, not as zero", () => {
    const quantbt = section(summary("healthy"), "QUANTBT_RESEARCH");
    const rendered = renderMetric(readMetric(quantbt, "no_such_metric"));
    expect(rendered.kind).toBe("state");
    if (rendered.kind === "state") expect(rendered.state).toBe("unavailable");
  });

  it("never returns the strings 0, - or N/A for an absent value", () => {
    const planning = section(summary("unavailable"), "PLANNING");
    for (const key of Object.keys(planning.metrics)) {
      const rendered = renderMetric(readMetric(planning, key));
      expect(rendered.kind).toBe("state");
      expect(JSON.stringify(rendered)).not.toContain('"text"');
    }
  });

  it("applies the caller's formatter only to real values", () => {
    const quantbt = section(summary("healthy"), "QUANTBT_RESEARCH");
    const rendered = renderMetric(readMetric(quantbt, "total_runs"), (v) => `${v} runs`);
    expect(rendered).toEqual({ kind: "value", text: "3 runs", state: "available" });
  });
});

describe("registry maturity", () => {
  it("leaves AVAILABLE unbadged and dims commissioned/blocked per §P0.5", () => {
    expect(maturityPresentation("AVAILABLE").label).toBeNull();
    expect(maturityPresentation("COMMISSIONED").label).toBe("SOON");
    expect(maturityPresentation("COMMISSIONED").opacity).toBeCloseTo(0.58);
    expect(maturityPresentation("BLOCKED").opacity).toBeCloseTo(0.38);
  });

  it("keeps commissioned clickable for preview but blocked inert", () => {
    expect(maturityPresentation("COMMISSIONED").interactive).toBe(true);
    expect(maturityPresentation("BLOCKED").interactive).toBe(false);
  });

  it("banners every non-real data mode", () => {
    expect(dataModeBanner("REAL")).toBeNull();
    expect(dataModeBanner("FIXTURE")).toBeTruthy();
    expect(dataModeBanner("STATIC_PREVIEW")).toBeTruthy();
    expect(dataModeBanner("NONE")).toBeTruthy();
  });
});

describe("reason codes", () => {
  it("explains every reason code the contract can emit", () => {
    for (const code of [
      "CAPABILITY_NOT_IMPLEMENTED",
      "UPSTREAM_UNAVAILABLE",
      "UPSTREAM_TIMEOUT",
      "INCOMPATIBLE_CONTRACT",
      "SOURCE_DATA_UNAVAILABLE",
      "LOCAL_ONLY_STATE",
      "PERMISSION_DENIED",
      "STALE_OBSERVATION",
      "PARTIAL_SOURCE_FAILURE",
    ] as const) {
      expect(reasonCopy(code)).toBeTruthy();
    }
  });

  it("invents nothing when there is no reason code", () => {
    expect(reasonCopy(null)).toBeNull();
  });
});

describe("freshness", () => {
  const availability = (asOf: string | null, staleAfter: number | null) => ({
    as_of: asOf,
    authority: { contract: "c", endpoint: null, service: "s" },
    checked_at: "2026-08-15T18:00:00Z",
    detail: null,
    provenance: { content_digest: null, source_revision: null },
    reason_code: null,
    retryable: false,
    stale_after_seconds: staleAfter,
    state: "available" as const,
  });

  it("reports unknown age rather than assuming fresh when as_of is absent", () => {
    const result = freshnessOf(availability(null, 60));
    expect(result.asOf).toBeNull();
    expect(result.ageSeconds).toBeNull();
    expect(result.isStale).toBe(false);
  });

  it("never claims stale without a declared freshness window", () => {
    const now = new Date("2026-08-15T18:10:00Z");
    const result = freshnessOf(availability("2026-08-15T00:00:00Z", null), now);
    expect(result.ageSeconds).toBe(65_400);
    expect(result.isStale).toBe(false);
  });

  it("marks stale once the age exceeds the declared window", () => {
    const now = new Date("2026-08-15T18:10:00Z");
    expect(freshnessOf(availability("2026-08-15T18:05:00Z", 600), now).isStale).toBe(false);
    expect(freshnessOf(availability("2026-08-15T17:50:00Z", 600), now).isStale).toBe(true);
  });
});
