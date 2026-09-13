/**
 * R3-3 · the market verdict belongs to the server, per profile.
 *
 * R3-2 (`4f098c7a`) qualifies market context separately for PAPER, SANDBOX and
 * LIVE and publishes the result in the runtime manifest. The ledger's own
 * comment is the point: "a Paper proof cannot enable Sandbox or Live."
 *
 * Two genuinely different situations were collapsed into one client sentence
 * before this:
 *
 *  - PAPER — `PAPER_TYPED_UNAVAILABLE_PENDING_REQUALIFICATION` /
 *    `MANAGER_V2_SOURCE_CONTRACT_REJECTED`. The route exists, was reached over
 *    mTLS with a valid delegated assertion, and the running Manager image is
 *    older than the handler, so it rejected the contract. It is expected to
 *    requalify.
 *  - SANDBOX / LIVE — `PROFILE_NOT_QUALIFIED` /
 *    `NO_INDEPENDENT_MARKET_CONTEXT_PROFILE_QUALIFICATION`. Nobody qualified
 *    it. Nothing is pending.
 *
 * "Come back later" and "this was never proved for your profile" are different
 * operational facts. Printing one sentence for both told an operator something
 * false about at least one profile.
 */
import { describe, expect, it } from "vitest";

import { RUNTIME_MANIFEST } from "./analytics.presentation.fixtures";
import { marketContextVerdict, readRuntimeManifest } from "./runtimeManifest";

const manifest = readRuntimeManifest(RUNTIME_MANIFEST);

describe("the manifest carries R3-2's per-profile qualification", () => {
  it("decodes a verdict for every profile the server published", () => {
    expect(manifest).not.toBeNull();
    expect(manifest?.profileQualification.map((row) => row.environment)).toEqual(["paper", "sandbox", "live"]);
  });

  it("keeps the digest absent rather than inventing provenance", () => {
    // The double deliberately publishes no `ledger_sha256`: a digest exists to
    // bind evidence to one exact server build, so a plausible fake is the one
    // field that could be mistaken for real provenance.
    expect(manifest?.profileQualificationDigest).toBeNull();
  });

  it("survives a server older than R3-2 without claiming a verdict", () => {
    const older = { ...RUNTIME_MANIFEST } as Record<string, unknown>;
    delete older.r3_profile_qualification;
    const read = readRuntimeManifest(older);
    expect(read).not.toBeNull();
    // Silence is not a verdict. An empty list must never read as "qualified".
    expect(read?.profileQualification).toEqual([]);
    expect(marketContextVerdict(read, "paper")).toBeNull();
  });
});

describe("marketContextVerdict", () => {
  it("says PAPER is pending requalification and quotes the server's code", () => {
    const verdict = marketContextVerdict(manifest, "paper");
    expect(verdict?.pending).toBe(true);
    expect(verdict?.reason).toContain("MANAGER_V2_SOURCE_CONTRACT_REJECTED");
    expect(verdict?.reason).toContain("pending requalification");
  });

  it("says SANDBOX was never qualified, and does not call it pending", () => {
    const verdict = marketContextVerdict(manifest, "sandbox");
    expect(verdict?.pending).toBe(false);
    expect(verdict?.reason).toContain("NO_INDEPENDENT_MARKET_CONTEXT_PROFILE_QUALIFICATION");
    expect(verdict?.reason).not.toContain("pending requalification");
  });

  it("gives LIVE its own verdict rather than borrowing Paper's", () => {
    // The whole reason this is per-profile: a Paper proof must not enable Live.
    const live = marketContextVerdict(manifest, "live");
    const paper = marketContextVerdict(manifest, "paper");
    expect(live?.state).toBe("PROFILE_NOT_QUALIFIED");
    expect(live?.state).not.toBe(paper?.state);
  });

  it("is case-insensitive about the environment word the screen holds", () => {
    expect(marketContextVerdict(manifest, "PAPER")?.pending).toBe(true);
  });

  it("returns null for an environment the server said nothing about", () => {
    expect(marketContextVerdict(manifest, "canary")).toBeNull();
    expect(marketContextVerdict(manifest, null)).toBeNull();
    expect(marketContextVerdict(null, "paper")).toBeNull();
  });
});
