import type { MaximumDataEnvironment } from "./maximum-data-intake";
import type { MarketContextOperationId } from "./market-context.registry";

export type MarketContextPublicationStatus =
  | "PENDING_OWNER_ADAPTER_IMPLEMENTATION"
  | "ACCEPTED_OWNER_RETURN";

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
  readonly schemaVersion: "portal.execution.eds11r.market-context-intake.v1";
  readonly status: MarketContextPublicationStatus;
  readonly requestManifestSha256: string;
  readonly ownerReturnManifestSha256: string | null;
  readonly sourceCommit: string | null;
  readonly sourceImageDigest: string | null;
  readonly capabilities: Readonly<Partial<Record<MarketContextOperationId, MarketContextAcceptedCapability>>>;
}

export const MARKET_CONTEXT_REQUEST_MANIFEST_SHA256 =
  "sha256:909f2a85f671bac35e4723384cf3a4f9dc3dfb4fd6bb193c81a97aeb271fdbbe";

export const MARKET_CONTEXT_PUBLICATION_INTAKE_V1: MarketContextPublicationIntake = Object.freeze({
  schemaVersion: "portal.execution.eds11r.market-context-intake.v1",
  status: "PENDING_OWNER_ADAPTER_IMPLEMENTATION",
  // This is the SHA-256 of the Portal-side request attachment MANIFEST, not a
  // source response.  It is retained only to prove which frozen request the
  // later owner return must answer.
  requestManifestSha256: MARKET_CONTEXT_REQUEST_MANIFEST_SHA256,
  ownerReturnManifestSha256: null,
  sourceCommit: null,
  sourceImageDigest: null,
  capabilities: Object.freeze({}),
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
  if (intake.status !== "ACCEPTED_OWNER_RETURN") {
    throw new MarketContextIntakeError("PENDING_MARKET_CONTEXT_ADAPTER", 503);
  }
  const capability = intake.capabilities[operationId];
  if (!capability || !capability.profiles.includes(environment.toUpperCase() as Uppercase<MaximumDataEnvironment>)) {
    throw new MarketContextIntakeError("MARKET_CONTEXT_PROFILE_NOT_ACCEPTED", 404);
  }
  if (
    intake.requestManifestSha256 !== MARKET_CONTEXT_REQUEST_MANIFEST_SHA256 ||
    !/^sha256:[a-f0-9]{64}$/.test(intake.ownerReturnManifestSha256 ?? "") ||
    !/^[a-f0-9]{40}$/.test(intake.sourceCommit ?? "") ||
    !/^sha256:[a-f0-9]{64}$/.test(intake.sourceImageDigest ?? "") ||
    !/^sha256:[a-f0-9]{64}$/.test(capability.responseSchemaSha256) ||
    !/^sha256:[a-f0-9]{64}$/.test(capability.fixtureIndexSha256) ||
    !/^sha256:[a-f0-9]{64}$/.test(capability.acceptanceSha256)
  ) {
    throw new MarketContextIntakeError("MARKET_CONTEXT_OWNER_RETURN_INVALID", 502);
  }
  return capability;
}
