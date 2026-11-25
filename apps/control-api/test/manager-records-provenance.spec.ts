import { describe, expect, it } from "vitest";
import { managerPage, type ManagerReadContext } from "../src/paper-read/manager-records";
import { admitCatalogueSeal } from "../src/execution/profile-projection.worker";
import { CurrentSourceProxyError } from "../src/execution/current-source.proxy";
import { EDGE_SEAL, edgeSealFor } from "./edge-seal-fixture";

const RELATION = "account_equity_snapshots";
const OKX: ManagerReadContext = { profileId: "PAPER_OKX_SWAP", mode: "paper", errorPrefix: "N22" };

function envelope(source: Record<string, unknown> = {}, data: Record<string, unknown> = {}, profile = "PAPER_BINANCE_USDM") {
  return {
    schema_version: "portal.execution.current-source-bff.v2", source_environment: "paper", profile_id: profile,
    source: {
      profile_id: profile, authority: "EXECUTION_CELL", availability: "AVAILABLE", freshness: "FRESH",
      completeness: "COMPLETE", as_of: "2026-11-24T10:00:00.000Z", contract_version: "manager-v2.test.v1",
      catalogue_sha256: edgeSealFor(profile),
      data: {
        relation: { schema: "public", relation: RELATION }, next_cursor: null,
        items: [{ relation: { schema: "public", relation: RELATION }, fields: { id: { kind: "TEXT", value: "r1" } } }],
        ...data,
      },
      ...source,
    },
  };
}
const read = (response: unknown, context?: ManagerReadContext) => managerPage(response, RELATION, ["id"], context);
const codeOf = (fn: () => unknown): string | undefined => {
  try { fn(); } catch (error) { return (error as CurrentSourceProxyError).code; }
  return undefined;
};

describe("manager-records keeps the bounded physical metadata the Edge returned", () => {
  it("preserves the seal, contract version, as_of, relation and cursor facts verbatim", () => {
    const page = read(envelope());
    expect(page.provenance).toEqual({
      contractVersion: "manager-v2.test.v1",
      catalogueSha256: EDGE_SEAL.PAPER_BINANCE_USDM,
      relation: RELATION,
      asOf: "2026-11-24T10:00:00.000Z",
      declaredCompleteness: "COMPLETE",
      hasMore: false,
      partial: false,
    });
    expect(page.completeness).toBe("COMPLETE");
  });

  it("reads the OKX seal for the OKX context and never invents one when the Edge sent none", () => {
    expect(read(envelope({}, {}, "PAPER_OKX_SWAP"), OKX).provenance?.catalogueSha256).toBe(EDGE_SEAL.PAPER_OKX_SWAP);
    const bare = envelope();
    delete (bare.source as Record<string, unknown>).catalogue_sha256;
    delete (bare.source as Record<string, unknown>).contract_version;
    expect(read(bare).provenance).toMatchObject({ catalogueSha256: null, contractVersion: null });
  });

  it("flags a page that still has a continuation cursor as partial without rewriting the declared completeness a drain aggregates", () => {
    const page = read(envelope({}, { next_cursor: "cursor-2" }));
    expect(page.nextCursor).toBe("cursor-2");
    expect(page.completeness).toBe("COMPLETE");
    expect(page.provenance).toMatchObject({ declaredCompleteness: "COMPLETE", hasMore: true, partial: true });
    expect(read(envelope({ completeness: "PARTIAL" })).provenance).toMatchObject({ hasMore: false, partial: true });
    expect(read(envelope()).provenance?.partial).toBe(false);
  });

  it("rejects malformed physical metadata with typed codes instead of dropping it", () => {
    const bad = (source: Record<string, unknown>) => codeOf(() => read(envelope(source)));
    expect(bad({ catalogue_sha256: "4eaca507" })).toBe("N22_MANAGER_CATALOGUE_SEAL_INVALID");
    expect(bad({ catalogue_sha256: EDGE_SEAL.PAPER_BINANCE_USDM.toUpperCase() })).toBe("N22_MANAGER_CATALOGUE_SEAL_INVALID");
    expect(bad({ catalogue_sha256: EDGE_SEAL.PAPER_BINANCE_USDM.slice(7) })).toBe("N22_MANAGER_CATALOGUE_SEAL_INVALID");
    expect(bad({ catalogue_sha256: 5 })).toBe("N22_MANAGER_CATALOGUE_SEAL_INVALID");
    expect(bad({ as_of: "not-a-time" })).toBe("N22_MANAGER_AS_OF_INVALID");
    expect(bad({ as_of: 1788307200000 })).toBe("N22_MANAGER_AS_OF_INVALID");
    expect(bad({ contract_version: "" })).toBe("N22_MANAGER_CONTRACT_VERSION_INVALID");
    expect(bad({ contract_version: "x".repeat(192) })).toBe("N22_MANAGER_CONTRACT_VERSION_INVALID");
  });

  it("still isolates profiles: a row envelope for another profile never passes the context", () => {
    expect(codeOf(() => read(envelope({}, {}, "PAPER_OKX_SWAP")))).toBe("N22_PROFILE_CONTEXT_MISMATCH");
  });
});

describe("worker seal admission records what the Edge answered and rejects the rest", () => {
  const pageFor = (profile: string, seal?: string) => {
    const bff = envelope({}, {}, profile);
    if (seal === undefined) delete (bff.source as Record<string, unknown>).catalogue_sha256;
    else (bff.source as Record<string, unknown>).catalogue_sha256 = seal;
    return read(bff, profile === "PAPER_OKX_SWAP" ? OKX : undefined);
  };

  it("accepts every seal already in the allow-list for its own profile, returning it verbatim", () => {
    const cases: Array<[string, string]> = [
      ["PAPER_OKX_SWAP", EDGE_SEAL.PAPER_OKX_SWAP], ["PAPER_OKX_SWAP", EDGE_SEAL.PAPER_OKX_SWAP_PREVIOUS],
      ["PAPER_BINANCE_USDM", EDGE_SEAL.PAPER_BINANCE_USDM], ["PAPER_BINANCE_USDM", EDGE_SEAL.PAPER_BINANCE_USDM_PREVIOUS],
      ["PAPER_BINANCE_USDM", EDGE_SEAL.LIVE_BINANCE_USDM],
    ];
    for (const [profile, seal] of cases) expect(admitCatalogueSeal(profile, pageFor(profile, seal), null)).toBe(seal);
  });

  it("rejects a seal that belongs to another profile, an unknown seal, and an absent seal with typed reasons", () => {
    const code = (fn: () => unknown) => codeOf(fn);
    expect(code(() => admitCatalogueSeal("PAPER_BINANCE_USDM", pageFor("PAPER_BINANCE_USDM", EDGE_SEAL.PAPER_OKX_SWAP), null)))
      .toBe("N31_SOURCE_CATALOGUE_SEAL_MISMATCH");
    expect(code(() => admitCatalogueSeal("PAPER_OKX_SWAP", pageFor("PAPER_OKX_SWAP", EDGE_SEAL.PAPER_BINANCE_USDM), null)))
      .toBe("N31_SOURCE_CATALOGUE_SEAL_MISMATCH");
    expect(code(() => admitCatalogueSeal("PAPER_BINANCE_USDM", pageFor("PAPER_BINANCE_USDM", `sha256:${"a".repeat(64)}`), null)))
      .toBe("N31_SOURCE_CATALOGUE_SEAL_MISMATCH");
    expect(code(() => admitCatalogueSeal("PAPER_BINANCE_USDM", pageFor("PAPER_BINANCE_USDM"), null)))
      .toBe("N31_SOURCE_CATALOGUE_SEAL_ABSENT");
  });

  it("rejects a seal that changes between pages of one relation", () => {
    const first = EDGE_SEAL.PAPER_BINANCE_USDM_PREVIOUS;
    expect(codeOf(() => admitCatalogueSeal("PAPER_BINANCE_USDM", pageFor("PAPER_BINANCE_USDM", EDGE_SEAL.PAPER_BINANCE_USDM), first)))
      .toBe("N31_SOURCE_CATALOGUE_SEAL_INCONSISTENT");
  });

  it("raises a retryable-gate 502, never an unavailable-relation shape", () => {
    try { admitCatalogueSeal("PAPER_BINANCE_USDM", pageFor("PAPER_BINANCE_USDM"), null); } catch (error) {
      expect(error).toBeInstanceOf(CurrentSourceProxyError);
      expect((error as CurrentSourceProxyError).status).toBe(502);
      return;
    }
    throw new Error("expected rejection");
  });
});
