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
 * The initial shipped value is deliberately source-dark.  An owner return is
 * accepted only by replacing this checked-in, reviewable intake with all
 * manifest-pinned evidence; no environment flag can bypass this state.
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
  /** A Portal-owned source adapter can be accepted from a checked-in, exact
   * contract manifest. It is deliberately not a substituted owner return. */
  readonly portalAdapterRevision?: string;
  readonly portalAdapterManifestSha256?: string;
  readonly capabilities: Readonly<Partial<Record<MarketContextOperationId, MarketContextAcceptedCapability>>>;
}

export const MARKET_CONTEXT_REQUEST_MANIFEST_SHA256 =
  "sha256:909f2a85f671bac35e4723384cf3a4f9dc3dfb4fd6bb193c81a97aeb271fdbbe";

export const MARKET_CONTEXT_DATA_LAYER_ADAPTER_REVISION =
  "portal.execution.market-context-data-layer.v1";
export const MARKET_CONTEXT_DATA_LAYER_ADAPTER_MANIFEST_SHA256 =
  "sha256:f697f711661365507e4440872cb435d95b34d1e20a01a47f5d65dd4efc9dcf85";

/**
 * Current-source activation accepts the existing loopback Data Layer only via
 * the narrow Portal Source Proxy/Edge adapter contract. This is not a feature
 * flag bypass: the static manifest, exact profiles and per-operation bounds
 * are checked here, while runtime probes bind it to the deployed image.
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
  capabilities: Object.freeze({
    managerMarketContextLatestV1: Object.freeze({
      operationId: "managerMarketContextLatestV1",
      profiles: Object.freeze(["PAPER", "SANDBOX", "LIVE"] as const),
      responseSchemaSha256: MARKET_CONTEXT_DATA_LAYER_ADAPTER_MANIFEST_SHA256,
      fixtureIndexSha256: MARKET_CONTEXT_DATA_LAYER_ADAPTER_MANIFEST_SHA256,
      acceptanceSha256: MARKET_CONTEXT_DATA_LAYER_ADAPTER_MANIFEST_SHA256,
    }),
    managerMarketContextCandlesV1: Object.freeze({
      operationId: "managerMarketContextCandlesV1",
      profiles: Object.freeze(["PAPER", "SANDBOX", "LIVE"] as const),
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
    /^sha256:[a-f0-9]{64}$/.test(intake.sourceImageDigest ?? "");
  const portalAdapterValid = intake.status === "ACCEPTED_PORTAL_SOURCE_ADAPTER" &&
    intake.schemaVersion === "portal.execution.market-context-intake.v2" &&
    intake.portalAdapterRevision === MARKET_CONTEXT_DATA_LAYER_ADAPTER_REVISION &&
    intake.portalAdapterManifestSha256 === MARKET_CONTEXT_DATA_LAYER_ADAPTER_MANIFEST_SHA256;
  if (!commonValid || (!ownerReturnValid && !portalAdapterValid)) {
    throw new MarketContextIntakeError("MARKET_CONTEXT_OWNER_RETURN_INVALID", 502);
  }
  return capability;
}
