import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createCurrentSourceTruthLedger } from "../src/execution/current-source-truth-ledger";
import { MAXIMUM_DATA_INTAKE_V1 } from "../src/execution/maximum-data-intake";

const PACK = resolve(
  __dirname,
  "../../../services/portal-execution-edge-rs/contracts/maximum-data-return-v1",
);

function load(name: string): unknown {
  return JSON.parse(readFileSync(resolve(PACK, name), "utf8")) as unknown;
}

function audit(environment: "paper" | "sandbox" | "live"): Record<string, unknown> {
  const profile = MAXIMUM_DATA_INTAKE_V1.profiles.find((candidate) => candidate.environment === environment);
  if (!profile) throw new Error("missing test profile");
  return {
    schema_version: "portal.execution.d3.manager-audit-evidence.v1",
    audit_scope: "D3_GET_ONLY_MANAGER_METADATA",
    business_rows_read: false,
    raw_business_payload_persisted: false,
    runtime_mutation: false,
    profile: {
      environment,
      profile_id: profile.profileId,
      audience: profile.audience,
    },
    manager: {
      catalogue: {
        contract_version: MAXIMUM_DATA_INTAKE_V1.returnPack.managerContractRevision,
        catalogue_sha256: MAXIMUM_DATA_INTAKE_V1.returnPack.catalogueDigest,
        relation_count: 96,
        availability: "AVAILABLE",
        freshness: "FRESH",
        completeness: "COMPLETE",
        as_of_ms: 1_789_000_000_000,
      },
      capabilities: {
        published_capability_count: 5,
      },
    },
  };
}

describe("BE-R2-2 current-source truth ledger", () => {
  it("classifies every frozen capability, relation, product operation and screen without a source row", () => {
    const ledger = createCurrentSourceTruthLedger({
      ownerResponse: load("owner-response.v2.json"),
      runtimeManifest: load("DEPLOYED_RUNTIME_MANIFEST.json"),
      auditEvidence: [audit("paper"), audit("sandbox"), audit("live")],
      generatedAt: new Date("2026-09-11T12:00:00.000Z"),
    });

    expect(ledger).toMatchObject({
      schema_version: "portal.execution.current-source-truth-ledger.v1",
      generated_at: "2026-09-11T12:00:00.000Z",
      audit_scope: "D3_GET_ONLY_MANAGER_METADATA",
      source_contract: {
        relation_count: 96,
        page_bounds: { maximum_rows: 200, maximum_response_bytes: 1_048_576 },
      },
      redaction: {
        raw_business_payload_persisted: false,
        cursor_persisted: false,
        credential_or_certificate_persisted: false,
      },
      live_data_executor_candidate: {
        classification: "PARTIAL",
        application_relation_count: 99,
        application_column_count: 1387,
        portal_authority: false,
        live_manager_substitute: false,
        portal_direct_database_access: false,
      },
    });
    expect(ledger.profile_audits.map((profile) => profile.environment)).toEqual([
      "live", "paper", "sandbox",
    ]);
    expect(ledger.capabilities).toHaveLength(34);
    expect(ledger.relations).toHaveLength(96);
    expect(ledger.product_operations).toHaveLength(54);
    expect(ledger.screens).toHaveLength(23);
    expect(new Set(ledger.relations.map((relation) => relation.relation_id)).size).toBe(96);
    expect(ledger.relations.every((relation) => relation.row_page_coverage.item_count === null)).toBe(true);
    expect(ledger.runtime_release_reconciliation).toMatchObject({
      state: "PROVENANCE_DISCREPANCY",
      running_image_changed: false,
    });
    expect(ledger.runtime_release_reconciliation.discrepancies).toContain(
      "RUNTIME_CATALOGUE_DIGEST_DIFFERS_FROM_ACTIVE_PORTAL_PIN",
    );
    expect(ledger.screens.find((screen) => screen.screen_id === "EXECUTION_ALPHA_360_SCREEN"))
      .toMatchObject({ classification: "SOURCE_GAP_CONFIRMED" });
  });

  it("fails closed for a profile crossing or a persisted source-row field", () => {
    const wrongProfile = audit("paper");
    (wrongProfile.profile as Record<string, unknown>).profile_id = "SANDBOX_BINANCE_USDM";
    expect(() => createCurrentSourceTruthLedger({
      ownerResponse: load("owner-response.v2.json"),
      runtimeManifest: load("DEPLOYED_RUNTIME_MANIFEST.json"),
      auditEvidence: [wrongProfile, audit("sandbox"), audit("live")],
    })).toThrow(/profile binding/);

    const rowLeak = audit("paper");
    ((rowLeak.manager as Record<string, unknown>).catalogue as Record<string, unknown>).items = [];
    expect(() => createCurrentSourceTruthLedger({
      ownerResponse: load("owner-response.v2.json"),
      runtimeManifest: load("DEPLOYED_RUNTIME_MANIFEST.json"),
      auditEvidence: [rowLeak, audit("sandbox"), audit("live")],
    })).toThrow(/must not persist source-row/);

    const changedPublishedMetadata = audit("paper");
    (((changedPublishedMetadata.manager as Record<string, unknown>).capabilities as Record<string, unknown>)
      .published_capability_count) = 6;
    expect(() => createCurrentSourceTruthLedger({
      ownerResponse: load("owner-response.v2.json"),
      runtimeManifest: load("DEPLOYED_RUNTIME_MANIFEST.json"),
      auditEvidence: [changedPublishedMetadata, audit("sandbox"), audit("live")],
    })).toThrow(/metadata contract drifted/);
  });
});
