import { describe, expect, it } from "vitest";
import { MAXIMUM_DATA_INTAKE_V1 } from "../src/execution/maximum-data-intake";
import {
  R3_PROFILE_QUALIFICATION_LEDGER,
  r3ProfileQualificationEvidence,
} from "../src/execution/r3-profile-qualification-ledger";

describe("R3-2 profile qualification ledger", () => {
  it("keeps every current-source profile independently bound to its accepted delivery truth", () => {
    expect(R3_PROFILE_QUALIFICATION_LEDGER.profiles).toHaveLength(3);
    expect(R3_PROFILE_QUALIFICATION_LEDGER.profiles.map((profile) => profile.environment))
      .toEqual(["paper", "sandbox", "live"]);
    expect(R3_PROFILE_QUALIFICATION_LEDGER.profiles.map((profile) => profile.profileId))
      .toEqual(MAXIMUM_DATA_INTAKE_V1.profiles.map((profile) => profile.profileId));
    for (const profile of R3_PROFILE_QUALIFICATION_LEDGER.profiles) {
      expect(profile.currentPageRead.evidence).toMatchObject({
        currentPagePublication: "E5_ACCEPTED",
        transportMetadataMatrix: "D3_ACCEPTED",
        mtls: "TLS_1_3_MUTUAL",
        delegatedJwt: "PROFILE_AUDIENCE_RESOURCE_BOUND",
        positiveCase: "QUALIFIED",
      });
      expect(profile.currentPageRead.evidence.negativeCases).toEqual([
        "MISSING_ASSERTION",
        "WRONG_AUDIENCE_OR_ENVIRONMENT",
        "WRONG_RESOURCE_OR_PROFILE",
        "UNTRUSTED_CLIENT_CERTIFICATE",
      ]);
      expect(profile.currentPageRead.namedOperationCoverage).toEqual({
        screenBoundRelationCount: 54,
        sourcePageMaximumRows: 200,
        sourcePageMaximumResponseBytes: 1_048_576,
        sourceReadPerformedByThisLedger: false,
      });
    }
    expect(R3_PROFILE_QUALIFICATION_LEDGER.profiles.find((profile) => profile.environment === "live"))
      .toMatchObject({
        currentPageRead: { state: "QUALIFIED_CURRENT_PAGE_READ_WITH_EMPTY_AUTHORITY" },
      });
  });

  it("records the active Market Context mismatch without cross-profile inheritance or a Portal workaround", () => {
    expect(R3_PROFILE_QUALIFICATION_LEDGER.profiles.find((profile) => profile.environment === "paper"))
      .toMatchObject({
        marketContext: {
          state: "PAPER_TYPED_UNAVAILABLE_PENDING_REQUALIFICATION",
          reasonCode: "MANAGER_V2_SOURCE_CONTRACT_REJECTED",
          portalFallbackForbidden: true,
        },
      });
    for (const environment of ["sandbox", "live"] as const) {
      expect(R3_PROFILE_QUALIFICATION_LEDGER.profiles.find((profile) => profile.environment === environment))
        .toMatchObject({
          marketContext: {
            state: "PROFILE_NOT_QUALIFIED",
            reasonCode: "NO_INDEPENDENT_MARKET_CONTEXT_PROFILE_QUALIFICATION",
            requiresIndependentProfileEvidence: true,
          },
        });
    }
    expect(R3_PROFILE_QUALIFICATION_LEDGER.invariants).toEqual({
      browserDirectEdgeOrSourceAccess: false,
      directTradingSystemDatabaseOrRedisAccess: false,
      sourceCommandExecution: false,
      crossProfileQualificationInheritance: false,
      currentObservationPromotedToAuthoritativeReplay: false,
    });
  });

  it("emits only browser-safe status and bounded metadata", () => {
    const evidence = r3ProfileQualificationEvidence();
    expect(evidence.ledger_sha256).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(evidence.profiles).toEqual([
      {
        environment: "paper",
        current_page_read: "QUALIFIED_CURRENT_PAGE_READ",
        market_context: "PAPER_TYPED_UNAVAILABLE_PENDING_REQUALIFICATION",
        market_context_reason: "MANAGER_V2_SOURCE_CONTRACT_REJECTED",
      },
      {
        environment: "sandbox",
        current_page_read: "QUALIFIED_CURRENT_PAGE_READ",
        market_context: "PROFILE_NOT_QUALIFIED",
        market_context_reason: "NO_INDEPENDENT_MARKET_CONTEXT_PROFILE_QUALIFICATION",
      },
      {
        environment: "live",
        current_page_read: "QUALIFIED_CURRENT_PAGE_READ_WITH_EMPTY_AUTHORITY",
        market_context: "PROFILE_NOT_QUALIFIED",
        market_context_reason: "NO_INDEPENDENT_MARKET_CONTEXT_PROFILE_QUALIFICATION",
      },
    ]);
    const serialized = JSON.stringify(evidence).toLowerCase();
    for (const forbidden of ["portal-execution-edge-paper", "https://", "bearer", "private key", "postgres://"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});
