import type { MaximumDataEnvironment } from "./maximum-data-intake";
import type { MarketContextOperationId } from "./market-context.registry";

export type MarketContextPublicationStatus =
  | "PENDING_OWNER_ADAPTER_IMPLEMENTATION"
  | "ACCEPTED_OWNER_RETURN"
  | "ACCEPTED_PORTAL_SOURCE_ADAPTER";

export interface MarketContextAcceptedCapability {
  readonly operationId: MarketContextOperationId;
  readonly profiles: readonly Uppercase<MaximumDataEnvironment>[];
  readonly responseSchemaSha256: string;
  readonly fixtureIndexSha256: string;
  readonly acceptanceSha256: string;
}

/**
 * A deployment flag is never qualification evidence. Each profile needs a
 * separate, non-secret probe record before its fixed Market Context routes
 * can be admitted. Paper leads; Sandbox/Live cannot borrow Paper authority.
 */
export interface MarketContextRuntimeQualification {
  readonly schemaVersion: "portal.execution.market-context-runtime-qualification.v1";
  readonly environment: Uppercase<MaximumDataEnvironment>;
  readonly status: "PENDING" | "ACCEPTED";
  readonly adapterRevision: string;
  readonly adapterManifestSha256: string;
  readonly evidenceSha256: string | null;
  readonly qualifiedOperations: readonly MarketContextOperationId[];
}

/**
 * The initial v1 value was deliberately source-dark. This v2 intake accepts a
 * checked-in Portal-owned adapter only when its exact manifest and profile
 * bounds validate. Paper is qualified independently; no environment flag can
 * bypass that proof and Sandbox/Live cannot inherit it.
 */
export interface MarketContextPublicationIntake {
  readonly schemaVersion:
    | "portal.execution.eds11r.market-context-intake.v1"
    | "portal.execution.market-context-intake.v2";
  readonly status: MarketContextPublicationStatus;
  readonly requestManifestSha256: string;
  readonly ownerReturnManifestSha256: string | null;
  readonly sourceCommit: string | null;
  readonly sourceImageDigest: string | null;
  /**
   * An owner-return may publish the frozen envelope through a Manager facade
   * rather than the Portal Data Layer adapter. Its route revision and manifest
   * must be committed here before a runtime qualification can name it.
   */
  readonly ownerAdapterRevision?: string;
  readonly ownerAdapterManifestSha256?: string;
  /** A Portal-owned source adapter is accepted from a checked-in, exact
   * contract manifest. It does not grant direct source access. */
  readonly portalAdapterRevision?: string;
  readonly portalAdapterManifestSha256?: string;
  readonly runtimeQualifications?: Readonly<Partial<Record<
    Uppercase<MaximumDataEnvironment>,
    MarketContextRuntimeQualification
  >>>;
  readonly capabilities: Readonly<Partial<Record<MarketContextOperationId, MarketContextAcceptedCapability>>>;
}

export const MARKET_CONTEXT_REQUEST_MANIFEST_SHA256 =
  "sha256:909f2a85f671bac35e4723384cf3a4f9dc3dfb4fd6bb193c81a97aeb271fdbbe";

export const MARKET_CONTEXT_DATA_LAYER_ADAPTER_REVISION =
  "portal.execution.market-context-data-layer.v1";
export const MARKET_CONTEXT_DATA_LAYER_ADAPTER_MANIFEST_SHA256 =
  "sha256:f697f711661365507e4440872cb435d95b34d1e20a01a47f5d65dd4efc9dcf85";
/** Set only from the sanitized, committed Paper GET-only qualification proof. */
export const MARKET_CONTEXT_PAPER_QUALIFICATION_EVIDENCE_SHA256: string | null = null;

/**
 * Current-source activation accepts the existing loopback Data Layer only via
 * the narrow Portal Source Proxy/Edge adapter contract. This is not a feature
 * flag bypass: the static manifest, exact profiles and per-operation bounds
 * are checked here, while a per-profile runtime proof binds it to deployment.
 */
export const MARKET_CONTEXT_PUBLICATION_INTAKE_V1: MarketContextPublicationIntake = Object.freeze({
  schemaVersion: "portal.execution.market-context-intake.v2",
  status: "ACCEPTED_PORTAL_SOURCE_ADAPTER",
  requestManifestSha256: MARKET_CONTEXT_REQUEST_MANIFEST_SHA256,
  ownerReturnManifestSha256: null,
  sourceCommit: null,
  sourceImageDigest: null,
  portalAdapterRevision: MARKET_CONTEXT_DATA_LAYER_ADAPTER_REVISION,
  portalAdapterManifestSha256: MARKET_CONTEXT_DATA_LAYER_ADAPTER_MANIFEST_SHA256,
  runtimeQualifications: Object.freeze({
    PAPER: Object.freeze({
      schemaVersion: "portal.execution.market-context-runtime-qualification.v1",
      environment: "PAPER",
      status: "PENDING",
      adapterRevision: MARKET_CONTEXT_DATA_LAYER_ADAPTER_REVISION,
      adapterManifestSha256: MARKET_CONTEXT_DATA_LAYER_ADAPTER_MANIFEST_SHA256,
      evidenceSha256: MARKET_CONTEXT_PAPER_QUALIFICATION_EVIDENCE_SHA256,
      qualifiedOperations: Object.freeze([
        "managerMarketContextLatestV1",
        "managerMarketContextCandlesV1",
      ] as const),
    }),
  }),
  capabilities: Object.freeze({
    managerMarketContextLatestV1: Object.freeze({
      operationId: "managerMarketContextLatestV1",
      profiles: Object.freeze(["PAPER"] as const),
      responseSchemaSha256: MARKET_CONTEXT_DATA_LAYER_ADAPTER_MANIFEST_SHA256,
      fixtureIndexSha256: MARKET_CONTEXT_DATA_LAYER_ADAPTER_MANIFEST_SHA256,
      acceptanceSha256: MARKET_CONTEXT_DATA_LAYER_ADAPTER_MANIFEST_SHA256,
    }),
    managerMarketContextCandlesV1: Object.freeze({
      operationId: "managerMarketContextCandlesV1",
      profiles: Object.freeze(["PAPER"] as const),
      responseSchemaSha256: MARKET_CONTEXT_DATA_LAYER_ADAPTER_MANIFEST_SHA256,
      fixtureIndexSha256: MARKET_CONTEXT_DATA_LAYER_ADAPTER_MANIFEST_SHA256,
      acceptanceSha256: MARKET_CONTEXT_DATA_LAYER_ADAPTER_MANIFEST_SHA256,
    }),
  }),
});

export class MarketContextIntakeError extends Error {
  constructor(readonly code: string, readonly status: number) {
    super(code);
  }
}

export function acceptedMarketContextCapability(
  intake: MarketContextPublicationIntake,
  operationId: MarketContextOperationId,
  environment: MaximumDataEnvironment,
): MarketContextAcceptedCapability {
  if (
    intake.status !== "ACCEPTED_OWNER_RETURN" &&
    intake.status !== "ACCEPTED_PORTAL_SOURCE_ADAPTER"
  ) {
    throw new MarketContextIntakeError("PENDING_MARKET_CONTEXT_ADAPTER", 503);
  }
  const capability = intake.capabilities[operationId];
  if (!capability || !capability.profiles.includes(environment.toUpperCase() as Uppercase<MaximumDataEnvironment>)) {
    throw new MarketContextIntakeError("MARKET_CONTEXT_PROFILE_NOT_ACCEPTED", 404);
  }
  const commonValid = intake.requestManifestSha256 === MARKET_CONTEXT_REQUEST_MANIFEST_SHA256 &&
    /^sha256:[a-f0-9]{64}$/.test(capability.responseSchemaSha256) &&
    /^sha256:[a-f0-9]{64}$/.test(capability.fixtureIndexSha256) &&
    /^sha256:[a-f0-9]{64}$/.test(capability.acceptanceSha256);
  const ownerReturnValid = intake.status === "ACCEPTED_OWNER_RETURN" &&
    /^sha256:[a-f0-9]{64}$/.test(intake.ownerReturnManifestSha256 ?? "") &&
    /^[a-f0-9]{40}$/.test(intake.sourceCommit ?? "") &&
    /^sha256:[a-f0-9]{64}$/.test(intake.sourceImageDigest ?? "") &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]{2,190}$/.test(intake.ownerAdapterRevision ?? "") &&
    /^sha256:[a-f0-9]{64}$/.test(intake.ownerAdapterManifestSha256 ?? "");
  const portalAdapterValid = intake.status === "ACCEPTED_PORTAL_SOURCE_ADAPTER" &&
    intake.schemaVersion === "portal.execution.market-context-intake.v2" &&
    intake.portalAdapterRevision === MARKET_CONTEXT_DATA_LAYER_ADAPTER_REVISION &&
    intake.portalAdapterManifestSha256 === MARKET_CONTEXT_DATA_LAYER_ADAPTER_MANIFEST_SHA256;
  if (!commonValid || (!ownerReturnValid && !portalAdapterValid)) {
    throw new MarketContextIntakeError("MARKET_CONTEXT_OWNER_RETURN_INVALID", 502);
  }
  const expectedAdapter = portalAdapterValid
    ? {
      revision: MARKET_CONTEXT_DATA_LAYER_ADAPTER_REVISION,
      manifestSha256: MARKET_CONTEXT_DATA_LAYER_ADAPTER_MANIFEST_SHA256,
    }
    : {
      revision: intake.ownerAdapterRevision!,
      manifestSha256: intake.ownerAdapterManifestSha256!,
    };
  const profile = environment.toUpperCase() as Uppercase<MaximumDataEnvironment>;
  const qualification = intake.runtimeQualifications?.[profile];
  const qualificationValid = qualification !== undefined &&
    qualification.schemaVersion === "portal.execution.market-context-runtime-qualification.v1" &&
    qualification.environment === profile &&
    qualification.status === "ACCEPTED" &&
    qualification.adapterRevision === expectedAdapter.revision &&
    qualification.adapterManifestSha256 === expectedAdapter.manifestSha256 &&
    qualification.evidenceSha256 !== null &&
    /^sha256:[a-f0-9]{64}$/.test(qualification.evidenceSha256) &&
    qualification.qualifiedOperations.includes(operationId);
  if (!qualificationValid) {
    throw new MarketContextIntakeError("MARKET_CONTEXT_PROFILE_QUALIFICATION_PENDING", 503);
  }
  return capability;
}
