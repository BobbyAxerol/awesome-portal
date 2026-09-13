import { createHash } from "node:crypto";
import { MAXIMUM_DATA_INTAKE_V1, type MaximumDataEnvironment } from "./maximum-data-intake";
import {
  MARKET_CONTEXT_DATA_LAYER_ADAPTER_MANIFEST_SHA256,
  MARKET_CONTEXT_DATA_LAYER_ADAPTER_REVISION,
  MARKET_CONTEXT_PUBLICATION_INTAKE_V1,
} from "./market-context.intake";
import { R3_CURRENT_SOURCE_COVERAGE_LEDGER } from "./r3-current-source-coverage-ledger";

/**
 * R3-2 records distinct profile truth. A global feature flag is deliberately
 * not a qualification result: a Paper proof cannot enable Sandbox or Live.
 */
export const R3_PROFILE_READ_STATES = [
  "QUALIFIED_CURRENT_PAGE_READ",
  "QUALIFIED_CURRENT_PAGE_READ_WITH_EMPTY_AUTHORITY",
] as const;

export const R3_MARKET_CONTEXT_STATES = [
  "PAPER_TYPED_UNAVAILABLE_PENDING_REQUALIFICATION",
  "PROFILE_NOT_QUALIFIED",
] as const;

export type R3ProfileReadState = (typeof R3_PROFILE_READ_STATES)[number];
export type R3MarketContextState = (typeof R3_MARKET_CONTEXT_STATES)[number];

export interface R3ProfileQualification {
  readonly environment: MaximumDataEnvironment;
  /** Server-only exact profile identity; never derived from a browser query. */
  readonly profileId: string;
  readonly audience: string;
  readonly currentPageRead: {
    readonly state: R3ProfileReadState;
    readonly delivery: string;
    readonly evidence: {
      readonly currentPagePublication: "E5_ACCEPTED";
      readonly transportMetadataMatrix: "D3_ACCEPTED";
      readonly mtls: "TLS_1_3_MUTUAL";
      readonly delegatedJwt: "PROFILE_AUDIENCE_RESOURCE_BOUND";
      readonly positiveCase: "QUALIFIED";
      readonly negativeCases: readonly [
        "MISSING_ASSERTION",
        "WRONG_AUDIENCE_OR_ENVIRONMENT",
        "WRONG_RESOURCE_OR_PROFILE",
        "UNTRUSTED_CLIENT_CERTIFICATE",
      ];
    };
    readonly namedOperationCoverage: {
      readonly screenBoundRelationCount: number;
      readonly sourcePageMaximumRows: number;
      readonly sourcePageMaximumResponseBytes: number;
      readonly sourceReadPerformedByThisLedger: false;
    };
    readonly emptySemantics: string;
  };
  readonly marketContext: {
    readonly state: R3MarketContextState;
    readonly reasonCode: string;
    readonly sourceContractRevision: "trading-system.portal-execution.market-context.v1";
    readonly expectedAdapterRevision: string;
    readonly expectedAdapterManifestSha256: string;
    readonly requiresIndependentProfileEvidence: true;
    readonly portalFallbackForbidden: true;
  };
}

export interface R3ProfileQualificationLedger {
  readonly schemaVersion: "portal.execution.r3.profile-qualification-ledger.v1";
  readonly sourceContract: {
    readonly revision: string;
    readonly catalogueSha256: string;
    readonly catalogueRelationCount: number;
  };
  readonly profiles: readonly R3ProfileQualification[];
  readonly invariants: {
    readonly browserDirectEdgeOrSourceAccess: false;
    readonly directTradingSystemDatabaseOrRedisAccess: false;
    readonly sourceCommandExecution: false;
    readonly crossProfileQualificationInheritance: false;
    readonly currentObservationPromotedToAuthoritativeReplay: false;
  };
}

const SCREEN_BOUND_RELATION_COUNT = R3_CURRENT_SOURCE_COVERAGE_LEDGER.relationCoverage
  .filter((relation) => relation.browserDisposition === "NAMED_PORTAL_OPERATION")
  .length;

function currentReadState(environment: MaximumDataEnvironment): R3ProfileReadState {
  const profile = MAXIMUM_DATA_INTAKE_V1.profiles.find((candidate) => candidate.environment === environment);
  if (!profile) throw new Error(`R3-2 profile missing from immutable intake: ${environment}`);
  return profile.observedDelivery === "CURRENT_PAGE_QUALIFIED_AUTHORITATIVE_EMPTY_SUPPORTED"
    ? "QUALIFIED_CURRENT_PAGE_READ_WITH_EMPTY_AUTHORITY"
    : "QUALIFIED_CURRENT_PAGE_READ";
}

function marketContextState(environment: MaximumDataEnvironment): R3ProfileQualification["marketContext"] {
  // The committed Paper GET-only evidence reached Manager over mTLS/H2 with a
  // valid delegated assertion, then received the typed 502 below. The active
  // Manager image is older than the owner worktree which contains the handler.
  // Portal must preserve that source fact rather than scrape the data layer or
  // reclassify a route advertised by Source Proxy as an accepted capability.
  const paper = environment === "paper";
  return Object.freeze({
    state: paper
      ? "PAPER_TYPED_UNAVAILABLE_PENDING_REQUALIFICATION"
      : "PROFILE_NOT_QUALIFIED",
    reasonCode: paper
      ? "MANAGER_V2_SOURCE_CONTRACT_REJECTED"
      : "NO_INDEPENDENT_MARKET_CONTEXT_PROFILE_QUALIFICATION",
    sourceContractRevision: "trading-system.portal-execution.market-context.v1",
    expectedAdapterRevision: MARKET_CONTEXT_DATA_LAYER_ADAPTER_REVISION,
    expectedAdapterManifestSha256: MARKET_CONTEXT_DATA_LAYER_ADAPTER_MANIFEST_SHA256,
    requiresIndependentProfileEvidence: true,
    portalFallbackForbidden: true,
  } satisfies R3ProfileQualification["marketContext"]);
}

export function createR3ProfileQualificationLedger(): R3ProfileQualificationLedger {
  if (
    MARKET_CONTEXT_PUBLICATION_INTAKE_V1.status !== "ACCEPTED_PORTAL_SOURCE_ADAPTER" ||
    MARKET_CONTEXT_PUBLICATION_INTAKE_V1.runtimeQualifications?.PAPER?.status !== "PENDING"
  ) {
    throw new Error("R3-2 Market Context intake drifted from the committed source-gap evidence");
  }
  const profiles = MAXIMUM_DATA_INTAKE_V1.profiles.map((profile) => Object.freeze({
    environment: profile.environment,
    profileId: profile.profileId,
    audience: profile.audience,
    currentPageRead: Object.freeze({
      state: currentReadState(profile.environment),
      delivery: profile.observedDelivery,
      evidence: Object.freeze({
        currentPagePublication: "E5_ACCEPTED" as const,
        transportMetadataMatrix: "D3_ACCEPTED" as const,
        mtls: "TLS_1_3_MUTUAL" as const,
        delegatedJwt: "PROFILE_AUDIENCE_RESOURCE_BOUND" as const,
        positiveCase: "QUALIFIED" as const,
        negativeCases: Object.freeze([
          "MISSING_ASSERTION",
          "WRONG_AUDIENCE_OR_ENVIRONMENT",
          "WRONG_RESOURCE_OR_PROFILE",
          "UNTRUSTED_CLIENT_CERTIFICATE",
        ] as const),
      }),
      namedOperationCoverage: Object.freeze({
        screenBoundRelationCount: SCREEN_BOUND_RELATION_COUNT,
        sourcePageMaximumRows: MAXIMUM_DATA_INTAKE_V1.pageBounds.maximumRows,
        sourcePageMaximumResponseBytes: MAXIMUM_DATA_INTAKE_V1.pageBounds.maximumResponseBytes,
        sourceReadPerformedByThisLedger: false as const,
      }),
      emptySemantics: profile.environment === "live"
        ? MAXIMUM_DATA_INTAKE_V1.semantics.emptyResult
        : "CURRENT_PAGE_EMPTY_IS_RETURNED_VERBATIM_BY_NAMED_BFF",
    }),
    marketContext: marketContextState(profile.environment),
  } satisfies R3ProfileQualification));

  if (new Set(profiles.map((profile) => profile.profileId)).size !== 3) {
    throw new Error("R3-2 profile qualification identity is not one-to-one");
  }
  return Object.freeze({
    schemaVersion: "portal.execution.r3.profile-qualification-ledger.v1",
    sourceContract: Object.freeze({
      revision: MAXIMUM_DATA_INTAKE_V1.returnPack.managerContractRevision,
      catalogueSha256: MAXIMUM_DATA_INTAKE_V1.returnPack.catalogueDigest,
      catalogueRelationCount: MAXIMUM_DATA_INTAKE_V1.returnPack.catalogueRelationCount,
    }),
    profiles: Object.freeze(profiles),
    invariants: Object.freeze({
      browserDirectEdgeOrSourceAccess: false as const,
      directTradingSystemDatabaseOrRedisAccess: false as const,
      sourceCommandExecution: false as const,
      crossProfileQualificationInheritance: false as const,
      currentObservationPromotedToAuthoritativeReplay: false as const,
    }),
  } satisfies R3ProfileQualificationLedger);
}

export const R3_PROFILE_QUALIFICATION_LEDGER = createR3ProfileQualificationLedger();

/** Browser-visible evidence has profile state only, never audiences or source handles. */
export function r3ProfileQualificationEvidence() {
  const serializable = JSON.stringify(R3_PROFILE_QUALIFICATION_LEDGER);
  return Object.freeze({
    schema_version: R3_PROFILE_QUALIFICATION_LEDGER.schemaVersion,
    ledger_sha256: `sha256:${createHash("sha256").update(serializable, "utf8").digest("hex")}`,
    profiles: R3_PROFILE_QUALIFICATION_LEDGER.profiles.map((profile) => Object.freeze({
      environment: profile.environment,
      current_page_read: profile.currentPageRead.state,
      market_context: profile.marketContext.state,
      market_context_reason: profile.marketContext.reasonCode,
    })),
    page_bounds: Object.freeze({
      maximum_rows: MAXIMUM_DATA_INTAKE_V1.pageBounds.maximumRows,
      maximum_response_bytes: MAXIMUM_DATA_INTAKE_V1.pageBounds.maximumResponseBytes,
    }),
    redaction: Object.freeze({
      profile_audience: false,
      source_origin: false,
      source_cursor: false,
      jwt_or_mtls_material: false,
      raw_business_rows: false,
    }),
  });
}
