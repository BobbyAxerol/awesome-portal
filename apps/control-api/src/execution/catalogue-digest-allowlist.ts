import { MANAGER_DEPLOYMENTS_CATALOGUE_SHA256 } from "./maximum-data-operation.registry";
import { MAXIMUM_DATA_INTAKE_V1 } from "./maximum-data-intake";

/**
 * Per-profile, exact-digest allow-list for the live-source catalogue seal on
 * GET /manager/deployments and GET /manager/current/:operationId.  Fail closed:
 * exact string membership only (no prefix, wildcard or environment-supplied
 * values).  The legacy pinned constant is always accepted; a profile's served
 * and post-T3 seals are accepted only for that profile.  Live has no extra
 * seals (its served seal is not known).  The native epoch path is NOT governed
 * by this module (it stays on tuple A).
 */
export type CatalogueRouteFamily = "deployments" | "relations";

const PROFILE_SEALS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  PAPER_BINANCE_USDM: Object.freeze([
    "sha256:4f38c58fed81c7600aea3d5c57dbca64443fc6b47c8ffa54d60296d7cd83c811",
    "sha256:4eaca507fbc256c3e7089b90c41fa533f698b4eb141914aba5f6136ee8cbfb46",
  ]),
  PAPER_OKX_SWAP: Object.freeze([
    "sha256:14bb84b495bca93807486b4edac1f9fb45488485ee6e80842970a4848312eb29",
    "sha256:0c43022bc2a8d1a1ec7619d880fed84cdb02b661cda228fe753fe87cdb4a5135",
  ]),
  SANDBOX_BINANCE_USDM: Object.freeze([
    "sha256:3852c844e7d06f70317bd54e53776081213d82569c6d203f78f05caa5bda15df",
  ]),
  LIVE_BINANCE_USDM: Object.freeze([]),
});

function legacyPin(family: CatalogueRouteFamily): string {
  return family === "deployments"
    ? MANAGER_DEPLOYMENTS_CATALOGUE_SHA256
    : MAXIMUM_DATA_INTAKE_V1.returnPack.catalogueDigest;
}

export function acceptedCatalogueDigests(
  profileId: string | undefined,
  family: CatalogueRouteFamily,
): ReadonlySet<string> {
  const extra = profileId !== undefined && Object.prototype.hasOwnProperty.call(PROFILE_SEALS, profileId)
    ? PROFILE_SEALS[profileId]! : [];
  return new Set([legacyPin(family), ...extra]);
}

/** Returns the accepted digest (to echo) or undefined when rejected. */
export function acceptCatalogueDigest(
  profileId: string | undefined,
  family: CatalogueRouteFamily,
  value: unknown,
): string | undefined {
  return typeof value === "string" && acceptedCatalogueDigests(profileId, family).has(value) ? value : undefined;
}
