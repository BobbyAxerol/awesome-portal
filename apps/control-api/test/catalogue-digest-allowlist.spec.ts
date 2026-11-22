import { describe, expect, it } from "vitest";
import { acceptCatalogueDigest, acceptedCatalogueDigests } from "../src/execution/catalogue-digest-allowlist";
import { MANAGER_DEPLOYMENTS_CATALOGUE_SHA256 } from "../src/execution/maximum-data-operation.registry";
import { MAXIMUM_DATA_INTAKE_V1 } from "../src/execution/maximum-data-intake";

const PB = ["sha256:4f38c58fed81c7600aea3d5c57dbca64443fc6b47c8ffa54d60296d7cd83c811", "sha256:4eaca507fbc256c3e7089b90c41fa533f698b4eb141914aba5f6136ee8cbfb46"];
const OKX = ["sha256:14bb84b495bca93807486b4edac1f9fb45488485ee6e80842970a4848312eb29", "sha256:0c43022bc2a8d1a1ec7619d880fed84cdb02b661cda228fe753fe87cdb4a5135"];
const SBX = "sha256:3852c844e7d06f70317bd54e53776081213d82569c6d203f78f05caa5bda15df";
const LEGACY = {
  deployments: MANAGER_DEPLOYMENTS_CATALOGUE_SHA256,
  relations: MAXIMUM_DATA_INTAKE_V1.returnPack.catalogueDigest,
} as const;
const PROFILES = ["PAPER_BINANCE_USDM", "PAPER_OKX_SWAP", "SANDBOX_BINANCE_USDM", "LIVE_BINANCE_USDM"] as const;
const FAMILIES = ["deployments", "relations"] as const;
const oneOff = (d: string) => d.slice(0, -1) + (d.endsWith("0") ? "1" : "0");

describe("catalogue digest per-profile allow-list", () => {
  it("always accepts the legacy pin of the family, for every profile", () => {
    for (const p of PROFILES) for (const f of FAMILIES) expect(acceptCatalogueDigest(p, f, LEGACY[f])).toBe(LEGACY[f]);
  });

  it("accepts a served seal only for its own profile", () => {
    for (const f of FAMILIES) {
      for (const d of PB) expect(acceptedCatalogueDigests("PAPER_BINANCE_USDM", f).has(d)).toBe(true);
      for (const d of OKX) expect(acceptedCatalogueDigests("PAPER_OKX_SWAP", f).has(d)).toBe(true);
      expect(acceptedCatalogueDigests("SANDBOX_BINANCE_USDM", f).has(SBX)).toBe(true);
      for (const other of ["PAPER_OKX_SWAP", "SANDBOX_BINANCE_USDM", "LIVE_BINANCE_USDM"])
        for (const d of PB) expect(acceptedCatalogueDigests(other, f).has(d)).toBe(false);
      for (const other of ["PAPER_BINANCE_USDM", "SANDBOX_BINANCE_USDM", "LIVE_BINANCE_USDM"])
        for (const d of OKX) expect(acceptedCatalogueDigests(other, f).has(d)).toBe(false);
      for (const other of ["PAPER_BINANCE_USDM", "PAPER_OKX_SWAP", "LIVE_BINANCE_USDM"])
        expect(acceptedCatalogueDigests(other, f).has(SBX)).toBe(false);
    }
  });

  it("rejects altered, prefixed, padded, non-string and wildcard values", () => {
    for (const p of PROFILES) for (const f of FAMILIES) {
      for (const bad of [oneOff(LEGACY[f]), oneOff(PB[0]!), LEGACY[f].slice(7), LEGACY[f] + " ", LEGACY[f].toUpperCase(),
        "sha256:", "*", "", undefined, null, 5])
        expect(acceptCatalogueDigest(p, f, bad)).toBeUndefined();
    }
  });

  it("Live accepts only the legacy constant; unknown or missing profile likewise", () => {
    for (const f of FAMILIES) {
      expect([...acceptedCatalogueDigests("LIVE_BINANCE_USDM", f)]).toEqual([LEGACY[f]]);
      expect([...acceptedCatalogueDigests(undefined, f)]).toEqual([LEGACY[f]]);
      expect([...acceptedCatalogueDigests("__proto__", f)]).toEqual([LEGACY[f]]);
      expect([...acceptedCatalogueDigests("constructor", f)]).toEqual([LEGACY[f]]);
    }
  });
});
