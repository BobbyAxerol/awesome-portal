import { describe, expect, it } from "vitest";
import { executionContractAuthorityInternalCoverage } from "../src/execution/contract-authority";
import {
  EDS11R_MANAGER_NON_BROWSER_RELATION_DISPOSITIONS,
  EDS11R_MANAGER_RELATION_OPERATION_REGISTRY,
} from "../src/execution/eds11r-manager-relation.registry";
import { MAXIMUM_DATA_INTAKE_V1 } from "../src/execution/maximum-data-intake";
import {
  R3_CURRENT_SOURCE_COVERAGE_CLASSIFICATIONS,
  R3_CURRENT_SOURCE_COVERAGE_LEDGER,
  r3CurrentSourceCoverageEvidence,
} from "../src/execution/r3-current-source-coverage-ledger";
import { SCREEN_BFF_CATALOGUE } from "../src/screen-bff/catalogue";

describe("R3-1 maximum-current coverage ledger", () => {
  it("covers every screen panel/action and every immutable Manager relation with an explicit, truthful disposition", () => {
    const internal = executionContractAuthorityInternalCoverage();
    expect(SCREEN_BFF_CATALOGUE).toHaveLength(25);
    expect(R3_CURRENT_SOURCE_COVERAGE_LEDGER.panelCoverage).toHaveLength(internal.panels.length);
    expect(R3_CURRENT_SOURCE_COVERAGE_LEDGER.actionCoverage).toHaveLength(internal.actions.length);
    expect(new Set(R3_CURRENT_SOURCE_COVERAGE_LEDGER.panelCoverage.map((row) => row.coverageId)).size)
      .toBe(R3_CURRENT_SOURCE_COVERAGE_LEDGER.panelCoverage.length);
    expect(new Set(R3_CURRENT_SOURCE_COVERAGE_LEDGER.actionCoverage.map((row) => row.coverageId)).size)
      .toBe(R3_CURRENT_SOURCE_COVERAGE_LEDGER.actionCoverage.length);
    expect(new Set(R3_CURRENT_SOURCE_COVERAGE_LEDGER.panelCoverage.map((row) => row.screenId)))
      .toEqual(new Set(SCREEN_BFF_CATALOGUE.map((screen) => screen.screenId)));

    for (const row of R3_CURRENT_SOURCE_COVERAGE_LEDGER.panelCoverage) {
      expect(R3_CURRENT_SOURCE_COVERAGE_CLASSIFICATIONS).toContain(row.classification);
      expect(row.namedPortalOperationId).toMatch(/^[A-Za-z][A-Za-z0-9]+$/);
      expect(row.profiles.length).toBeGreaterThan(0);
      expect(row.testFixtureId).toMatch(/^r3\.current-source\.panel\./);
      expect(row.availabilityFreshnessCompletenessAsOf).toBe("PRESERVED_BY_NAMED_BFF_ENVELOPE");
      if (row.sourceBinding.kind === "SOURCE_GAP") {
        expect(row.classification).toBe("SOURCE_GAP_CONFIRMED");
        expect(row.sourcePageBound).toBeNull();
      } else if (row.sourceBinding.kind === "PORTAL_CONTROL") {
        expect(row.sourcePageBound).toBeNull();
      } else {
        expect(row.sourcePageBound).toEqual({
          maximumRows: 200,
          maximumResponseBytes: 1_048_576,
        });
        expect(row.cacheAndStreamInvalidation.cacheScope).toBe("WORKSPACE_PRINCIPAL_ROLE_PROFILE_ADAPTER_REQUEST");
      }
    }

    expect(R3_CURRENT_SOURCE_COVERAGE_LEDGER.relationCoverage).toHaveLength(96);
    expect(R3_CURRENT_SOURCE_COVERAGE_LEDGER.relationCoverage.filter((row) => row.classification === "COVERED"))
      .toHaveLength(70);
    expect(R3_CURRENT_SOURCE_COVERAGE_LEDGER.relationCoverage.filter((row) => row.classification === "NOT_APPLICABLE"))
      .toHaveLength(26);
  });

  it("maps all 54 screen-bound relations only through static named operations and keeps non-browser relations explicit", () => {
    const byRelation = new Map(
      R3_CURRENT_SOURCE_COVERAGE_LEDGER.relationCoverage.map((row) => [row.relationId, row]),
    );
    for (const operation of EDS11R_MANAGER_RELATION_OPERATION_REGISTRY) {
      expect(byRelation.get(`public.${operation.relation}`)).toEqual(expect.objectContaining({
        classification: "COVERED",
        browserDisposition: "NAMED_PORTAL_OPERATION",
        namedManagerOperationId: operation.operationId,
        screenIds: [...operation.screenIds].sort(),
        fieldAllowlist: operation.fields.map((field) => field.name).sort(),
      }));
    }
    for (const disposition of EDS11R_MANAGER_NON_BROWSER_RELATION_DISPOSITIONS) {
      const row = byRelation.get(disposition.relation_id);
      expect(row).toBeDefined();
      expect(row?.browserDisposition).toBe(disposition.browser_disposition);
      expect(row?.classification).toBe(
        disposition.browser_disposition === "PORTAL_PROJECTION_ONLY" ? "COVERED" : "NOT_APPLICABLE",
      );
    }
  });

  it("publishes only digest/count/bound evidence to browser-visible runtime metadata", () => {
    const evidence = r3CurrentSourceCoverageEvidence();
    expect(evidence).toMatchObject({
      schema_version: "portal.execution.r3.current-source-coverage-ledger.v1",
      relation_coverage_count: MAXIMUM_DATA_INTAKE_V1.returnPack.catalogueRelationCount,
      source_page_bounds: { maximum_rows: 200, maximum_response_bytes: 1_048_576 },
      redaction: {
        browserMayReceiveRawManagerRelation: false,
        browserMayReceiveSourceCursor: false,
        browserMayReceiveSourceOrigin: false,
        browserMayReceiveJwtOrMtlsMaterial: false,
      },
    });
    expect(evidence.ledger_sha256).toMatch(/^sha256:[a-f0-9]{64}$/);
    // The redaction *policy names* intentionally mention cursor/mTLS/JWT to
    // state that their values cannot cross the browser boundary.  Check the
    // serializable payload values separately so field names cannot turn a
    // correct negative assertion into a false failure.
    expect(Object.values(evidence.redaction)).toEqual([false, false, false, false]);
    const serializableValues = JSON.stringify({
      schema_version: evidence.schema_version,
      ledger_sha256: evidence.ledger_sha256,
      panel_coverage_count: evidence.panel_coverage_count,
      action_coverage_count: evidence.action_coverage_count,
      relation_coverage_count: evidence.relation_coverage_count,
      panel_classifications: evidence.panel_classifications,
      source_page_bounds: evidence.source_page_bounds,
    }).toLowerCase();
    for (const forbidden of ["public.", "manager.", "orders", "account_balances", "bearer", "private key"]) {
      expect(serializableValues).not.toContain(forbidden);
    }
  });
});
