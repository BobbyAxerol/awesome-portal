import { MAXIMUM_DATA_INTAKE_V1 } from "../src/execution/maximum-data-intake";

/**
 * The catalogue seal each profile's Edge answers with, as pinned in
 * access-profile-pins.ts / catalogue-digest-allowlist.ts. Fixtures serve these
 * exact values; the Core must record them verbatim and never substitute a
 * constant. LIVE has only the October seal (no other seal is known).
 */
export const EDGE_SEAL = Object.freeze({
  PAPER_BINANCE_USDM: "sha256:4eaca507fbc256c3e7089b90c41fa533f698b4eb141914aba5f6136ee8cbfb46",
  PAPER_BINANCE_USDM_PREVIOUS: "sha256:4f38c58fed81c7600aea3d5c57dbca64443fc6b47c8ffa54d60296d7cd83c811",
  PAPER_OKX_SWAP: "sha256:0c43022bc2a8d1a1ec7619d880fed84cdb02b661cda228fe753fe87cdb4a5135",
  PAPER_OKX_SWAP_PREVIOUS: "sha256:14bb84b495bca93807486b4edac1f9fb45488485ee6e80842970a4848312eb29",
  SANDBOX_BINANCE_USDM: "sha256:3852c844e7d06f70317bd54e53776081213d82569c6d203f78f05caa5bda15df",
  LIVE_BINANCE_USDM: MAXIMUM_DATA_INTAKE_V1.returnPack.catalogueDigest,
} as const);

export function edgeSealFor(profileId: string): string {
  const value = (EDGE_SEAL as Record<string, string>)[profileId];
  if (value === undefined) throw new Error(`no fixture seal for ${profileId}`);
  return value;
}
