/**
 * EDS-00 immutable, sanitized intake of the accepted EX-DP-07 return pack.
 *
 * This is deliberately source code rather than a runtime file read: a Portal
 * image must carry the exact compatibility baseline it was built and tested
 * against. The original return pack remains the authority and is verified in
 * the matching contract test; this projection contains no origin, certificate,
 * token, cursor, source row, database path, or source-proxy detail.
 */

export const MAXIMUM_DATA_INTAKE_V1 = Object.freeze({
  schemaVersion: "portal.execution.maximum-data.intake.v1",
  returnPack: {
    status: "RETURN_PACK_ACCEPTED_FOR_CURRENT_QUALIFIED_READS_AND_TYPED_EXTERNAL_GATES",
    capturedAtMs: 1_788_540_677_303,
    sourceCommit: "9081397de9e981c43b4e0f67fabe747e7ed964c7",
    edgeCommit: "9266a6843d1863395e15b563ac53de32780e0f25",
    edgeImageDigest: "sha256:47ea4d78099347706710879bf26e46a15cfaf80e4ef7ac22879f0a71f12c3077",
    catalogueDigest: "sha256:9040f0897d8f452a486e51ce35abb7f3165b2238d07221b6b0e684d9829b012e",
    servingPolicyDigest: "sha256:b9fbe07d1a9826d3e9270798162c052dda3687d27a04809eb38c4ad9e1a054f3",
    managerContractRevision: "trading-system.portal-execution.manager-v2.runtime.v1",
    e5PublicationRevision: "portal.execution.maximum-data.e5.existing-data-publication.v1",
    e5PublicationManifestDigest: "sha256:57a36804838d341b6f67d4abbf15b64878743b3b58141b0af1d6934e6f189909",
    e6AcceptanceManifestDigest: "sha256:5081befce2c7d62a0a33abd95607e3caf02b7659448b39473e0208640a9e0ef5",
    catalogueRelationCount: 96,
    frozenFieldMappingCount: 34,
    genuineSourceGapCount: 18,
    frozenScreenCount: 23,
  },
  pageBounds: {
    maximumRows: 200,
    maximumResponseBytes: 1_048_576,
    maximumCursorBytes: 4_096,
  },
  profiles: [
    {
      environment: "paper",
      profileId: "PAPER_BINANCE_USDM",
      audience: "portal-execution-edge-paper",
      maximumObservedConcurrency: 1,
      observedDelivery: "CURRENT_PAGE_QUALIFIED",
    },
    {
      environment: "sandbox",
      profileId: "SANDBOX_BINANCE_USDM",
      audience: "portal-execution-edge-sandbox",
      maximumObservedConcurrency: 1,
      observedDelivery: "CURRENT_PAGE_QUALIFIED",
    },
    {
      environment: "live",
      profileId: "LIVE_BINANCE_USDM",
      audience: "portal-execution-edge-live",
      maximumObservedConcurrency: 2,
      observedDelivery: "CURRENT_PAGE_QUALIFIED_AUTHORITATIVE_EMPTY_SUPPORTED",
    },
  ],
  semantics: {
    managerRead: "CURRENT_CATALOGUE_BOUND_PAGE_ONLY",
    globalEventOrdering: "NOT_ASSERTED",
    correctionReplay: "NOT_ASSERTED",
    totalHistory: "NOT_ASSERTED",
    emptyResult: "AUTHORITATIVE_EMPTY_WHEN_SOURCE_ENVELOPE_SAYS_COMPLETE",
  },
  externalGates: [
    "GLOBAL_SEQUENCE_AND_GAP_RATE",
    "RETAINED_EVENT_REPLAY_AND_CORRECTION",
    "CROSS_CELL_SGP_INGEST",
    "ONE_FIVE_THIRTY_MINUTE_SOURCE_OUTAGE",
  ],
  authority: {
    browserRawManagerAccess: false,
    directDatabaseAccess: false,
    directRedisAccess: false,
    sourceCredentialAccess: false,
    commandExecution: false,
    runtimeActivation: false,
  },
} as const);

export type MaximumDataEnvironment =
  (typeof MAXIMUM_DATA_INTAKE_V1.profiles)[number]["environment"];
