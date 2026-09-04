import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

type JsonRecord = Record<string, unknown>;

const PACK = resolve(
  __dirname,
  "../../../services/portal-execution-edge-rs/contracts/maximum-data-return-v1",
);
const PROFILES: Record<string, string> = {
  PAPER: "PAPER_BINANCE_USDM",
  SANDBOX: "SANDBOX_BINANCE_USDM",
  LIVE: "LIVE_BINANCE_USDM",
};

function load(name: string): JsonRecord {
  return JSON.parse(readFileSync(resolve(PACK, name), "utf8")) as JsonRecord;
}

function list(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error(path + " must be an array");
  return value;
}

function object(value: unknown, path: string): JsonRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(path + " must be an object");
  }
  return value as JsonRecord;
}

function digest(name: string): string {
  return "sha256:" + createHash("sha256").update(readFileSync(resolve(PACK, name))).digest("hex");
}

describe("EX-DP-06 maximum-data domain acceptance", () => {
  it("keeps all eleven E4 domains explicit about accepted scope and source-owner gaps", () => {
    const e4 = load("e4-domain-capabilities.v1.json");
    const e5 = load("e5-existing-data-publication.v1.json");
    const acceptance = load("e6-domain-acceptance.v1.json");
    const e4Domains = list(e4.domains, "E4 domains").map((item) => object(item, "E4 domain"));
    const fields = new Set(list(e5.entries, "E5 entries").map((item) => object(item, "E5 entry").field_id));
    const domains = list(acceptance.domains, "E6 domains").map((item) => object(item, "E6 domain"));
    expect(acceptance.status).toBe("EDGE_SHADOW_VERIFIED");
    expect(domains).toHaveLength(11);
    expect(new Set(domains.map((domain) => domain.domain_id))).toEqual(new Set(e4Domains.map((domain) => domain.domain_id)));
    const expectedGaps = new Map(e4Domains.map((domain) => [domain.domain_id, domain.source_owner_gap_ids]));
    for (const domain of domains) {
      const fieldIds = list(domain.field_ids, "domain field IDs");
      expect(fieldIds.length).toBeGreaterThan(0);
      expect(new Set(fieldIds).size).toBe(fieldIds.length);
      for (const fieldId of fieldIds) expect(fields.has(fieldId)).toBe(true);
      expect(domain.typed_source_owner_gap_ids).toEqual(expectedGaps.get(domain.domain_id));
      expect(String(domain.acceptance_status)).not.toContain("EVENT_REPLAY_ACCEPTED");
    }
    expect(acceptance.global_source_health).toEqual({
      manager_envelope: "PROFILE_BOUND_AVAILABLE_FRESH_COMPLETENESS_EXPLICIT",
      global_sequence: "NOT_PROVEN",
      retention_floor: "UNDECLARED_BY_MANAGER_ENVELOPE",
      event_replay: "NOT_ACCEPTED",
      correction: "NOT_OBSERVABLE_FROM_MANAGER_PAGE",
      empty: "AUTHORITATIVE_EMPTY_ONLY_WHEN_AVAILABLE_COMPLETE_AND_ZERO_ITEMS",
    });
  });

  it("pins sanitized runtime evidence, source profile isolation, denials and artifact digests", () => {
    const evidence = load("e6-runtime-evidence.v1.json");
    const manifest = load("e6-acceptance.manifest.json");
    const captures = list(evidence.captures, "captures").map((item) => object(item, "capture"));
    expect(evidence.raw_data_persisted).toBe(false);
    expect(captures).toHaveLength(3);
    expect(new Set(captures.map((capture) => capture.profile))).toEqual(new Set(Object.keys(PROFILES)));
    for (const capture of captures) {
      const profile = String(capture.profile);
      const catalogue = object(capture.catalogue, "catalogue");
      const observations = list(capture.relation_observations, "relation observations").map((item) => object(item, "observation"));
      const negative = object(capture.negative_checks, "negative checks");
      expect(catalogue.profile_id).toBe(PROFILES[profile]);
      expect(catalogue.all_fixed_relations_present).toBe(true);
      expect(observations).toHaveLength(19);
      for (const observation of observations) {
        expect(observation.profile_id).toBe(PROFILES[profile]);
        expect(observation.expected_profile_id).toBe(PROFILES[profile]);
        expect(observation.item_count === 0 || observation.item_count === 1).toBe(true);
        expect(observation.primary_resource_key_status).not.toBe("INVALID");
      }
      expect(object(negative.missing_client_certificate, "missing certificate").outcome).toBe("DENIED");
      expect(object(negative.read_identity_post_method_denial, "method denial")).toEqual({
        denied: true,
        http_status: 405,
      });
    }
    expect(manifest.files).toEqual({
      "e6-domain-acceptance.v1.schema.json": digest("e6-domain-acceptance.v1.schema.json"),
      "e6-runtime-evidence.v1.schema.json": digest("e6-runtime-evidence.v1.schema.json"),
      "e6-domain-acceptance.v1.json": digest("e6-domain-acceptance.v1.json"),
      "e6-runtime-evidence.v1.json": digest("e6-runtime-evidence.v1.json"),
    });
    for (const name of [
      "e6-domain-acceptance.v1.schema.json",
      "e6-runtime-evidence.v1.schema.json",
      "e6-domain-acceptance.v1.json",
      "e6-runtime-evidence.v1.json",
      "e6-acceptance.manifest.json",
    ]) {
      const raw = readFileSync(resolve(PACK, name), "utf8");
      expect(raw).not.toContain('"trace_id"');
      expect(raw).not.toContain('"record_key"');
      expect(raw).not.toContain("postgres://");
      expect(raw).not.toContain("redis://");
    }
  });
});
