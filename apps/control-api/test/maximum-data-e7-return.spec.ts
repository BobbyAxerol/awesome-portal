import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

type JsonRecord = Record<string, unknown>;

const PACK = resolve(
  __dirname,
  "../../../services/portal-execution-edge-rs/contracts/maximum-data-return-v1",
);
const REQUIRED = new Set([
  "MASTER_RESPONSE.md",
  "owner-response.v2.json",
  "DEPLOYED_RUNTIME_MANIFEST.json",
  "SOURCE_SYSTEM_INVENTORY.json",
  "DATABASE_RELATION_CENSUS.csv",
  "COLUMN_SEMANTICS_CATALOG.csv",
  "SOURCE_LINEAGE_GRAPH.json",
  "PROFILE_MODE_VENUE_COVERAGE.json",
  "SCREEN_FIELD_SOURCE_COVERAGE.csv",
  "ACTION_CAPABILITY_COVERAGE.csv",
  "DERIVED_METRIC_FEASIBILITY.csv",
  "EVENT_CONTINUITY_REPORT.md",
  "ORDER_FILL_REPLAY_CAPABILITY.json",
  "RISK_DATA_CAPABILITY.json",
  "ACCOUNTING_EQUITY_CAPABILITY.json",
  "ACCOUNT_BINDING_CAPABILITY.json",
  "MARKET_CONTEXT_CAPABILITY.json",
  "PUBLICATION_HEALTH_CAPABILITY.json",
  "SOURCE_PUBLICATION_PLAN.json",
  "SOURCE_OWNER_GAPS.json",
  "RELEASE_COMPATIBILITY_MATRIX.json",
  "schemas/source-catalog.v1.schema.json",
  "schemas/relation-history.v1.schema.json",
  "schemas/incremental-events.v2.schema.json",
  "schemas/source-health.v1.schema.json",
  "benchmarks/SOURCE_RATE_WINDOWS.csv",
  "benchmarks/EDGE_STREAM_BENCHMARK.json",
  "benchmarks/CROSS_CELL_BENCHMARK.json",
  "benchmarks/FAILURE_RECOVERY_REPORT.md",
  "evidence/EVIDENCE_INDEX.md",
]);

function load(name: string): JsonRecord {
  return JSON.parse(readFileSync(resolve(PACK, name), "utf8")) as JsonRecord;
}

function objects(value: unknown, name: string): JsonRecord[] {
  if (!Array.isArray(value)) throw new Error(`${name} must be an array`);
  return value.map((entry) => {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`${name} entry must be an object`);
    }
    return entry as JsonRecord;
  });
}

function strings(value: unknown, name: string): string[] {
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) {
    throw new Error(`${name} must be a string array`);
  }
  return value as string[];
}

function files(root: string): string[] {
  return readdirSync(root).flatMap((entry) => {
    const absolute = resolve(root, entry);
    if (statSync(absolute).isDirectory()) return files(absolute);
    return [relative(PACK, absolute)];
  });
}

function digest(name: string): string {
  return "sha256:" + createHash("sha256").update(readFileSync(resolve(PACK, name))).digest("hex");
}

describe("EX-DP-07 maximum-data complete owner return", () => {
  it("maps every frozen E5 field once and preserves genuine gaps rather than claiming replay", () => {
    const owner = load("owner-response.v2.json");
    const e5 = load("e5-existing-data-publication.v1.json");
    const gaps = load("SOURCE_OWNER_GAPS.json");
    const capabilities = objects(owner.capabilities, "capabilities");
    const sourceGaps = objects(owner.genuine_source_gaps, "genuine source gaps");
    expect(owner.schema_version).toBe("portal.execution.edge-owner-response.v2");
    expect(owner.return_pack_digest).toBe(digest("e7-return-pack.manifest.json"));
    expect(capabilities).toHaveLength(34);
    expect(new Set(capabilities.map((capability) => capability.field_id))).toEqual(
      new Set(objects(e5.entries, "E5 entries").map((entry) => entry.field_id)),
    );
    for (const capability of capabilities) {
      expect(["AVAILABLE_DIRECT", "AVAILABLE_DERIVED_AT_PORTAL", "OWNER_ACTION_REQUIRED", "CONTRACT_INCOMPATIBLE"])
        .toContain(capability.status);
      expect(String(capability.history_semantics)).not.toContain("EVENT_HISTORY_AVAILABLE");
      expect(Array.isArray(capability.impacted_screens)).toBe(true);
      expect(Array.isArray(capability.evidence_references)).toBe(true);
    }
    expect(sourceGaps).toHaveLength(18);
    expect(new Set(sourceGaps.map((gap) => gap.gap_id))).toEqual(
      new Set(objects(gaps.gaps, "source gaps").map((gap) => gap.gap_id)),
    );
    const replay = capabilities.find((capability) => capability.field_id === "trade_replay");
    expect(replay?.status).toBe("OWNER_ACTION_REQUIRED");
    expect(replay?.portal_can_proceed).toBe(false);
  });

  it("binds the complete portable pack and measured per-profile capacity without manufacturing an SLO", () => {
    const manifest = load("e7-return-pack.manifest.json");
    const capacity = load("e7-resilience-capacity.v1.json");
    const entries = new Map(
      readFileSync(resolve(PACK, "MANIFEST.sha256"), "utf8")
        .trim()
        .split("\n")
        .map((line) => line.split("  ", 2))
        .map(([sha, name]) => [name, `sha256:${sha}`]),
    );
    expect(manifest.status).toBe("RETURN_PACK_ACCEPTED_FOR_CURRENT_QUALIFIED_READS_AND_TYPED_EXTERNAL_GATES");
    expect(new Set(strings(manifest.required_paths, "required paths"))).toEqual(REQUIRED);
    for (const name of REQUIRED) expect(entries.get(name)).toBe(digest(name));
    expect(new Set(files(PACK).filter((name) => name !== "MANIFEST.sha256"))).toEqual(new Set(entries.keys()));
    expect(capacity.production_slo_established).toBe(false);
    const profiles = objects(capacity.profiles, "capacity profiles");
    expect(profiles.map((profile) => [profile.profile, profile.maximum_safe_concurrency_observed, profile.source_error_count]))
      .toEqual([["PAPER", 1, 1], ["SANDBOX", 1, 1], ["LIVE", 2, 0]]);
    expect(objects(capacity.additional_typed_source_unavailability_observations, "typed source unavailable"))
      .toEqual([{
        profile: "LIVE",
        profile_id: "LIVE_BINANCE_USDM",
        field_id: "order_current",
        relation_id: "public.orders",
        page_limit: 1,
        http_status: 503,
        status: "SOURCE_UNAVAILABLE_OBSERVED",
        consumer_behavior: "TYPED_UNAVAILABLE_NO_AUTOMATIC_RETRY",
        measurement_role: "availability observation only; it does not replace the bounded deployment-page concurrency measurement",
      }]);
    const requirements = objects(capacity.external_evidence_requirements, "external requirements");
    expect(new Set(requirements.map((requirement) => requirement.requirement_id))).toEqual(
      new Set([
        "GLOBAL_SEQUENCE_AND_GAP_RATE",
        "RETAINED_EVENT_REPLAY_AND_CORRECTION",
        "CROSS_CELL_SGP_INGEST",
        "ONE_FIVE_THIRTY_MINUTE_SOURCE_OUTAGE",
      ]),
    );
  });
});
