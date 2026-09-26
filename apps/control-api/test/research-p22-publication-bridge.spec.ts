import { describe, expect, it } from "vitest";
import { sealedPackMethodologyClaimIds } from "../src/research/p22-publication-bridge.service";

describe("P22 sealed-pack authority extraction", () => {
  it("accepts only explicit methodology claim identifiers and deduplicates them", () => {
    expect(sealedPackMethodologyClaimIds({
      fields: [
        { key: "methodology_claim_id", value: "claim:oos" },
        { key: "methodology_claim_ids", value: ["claim:seed", "claim:oos"] },
        { key: "note", value: "claim:must-not-be-inferred" },
      ],
    })).toEqual(["claim:oos", "claim:seed"]);
  });

  it("returns an empty set when the sealed pack has no typed claim fact", () => {
    expect(sealedPackMethodologyClaimIds({ notes: ["methodology claim:oos"], fields: [] })).toEqual([]);
  });

  it("gives the canonical P21 methodology row a content-addressed claim identity", () => {
    const digest = "a".repeat(64);
    expect(sealedPackMethodologyClaimIds({
      pack: [{ key: "METHODOLOGY_CLAIM", status: "DEGRADED", digest, note: "prose is not parsed" }],
    })).toEqual([`claim:sha256:${digest}`]);
  });

  it("bounds malformed and oversized claim values without inventing a source fact", () => {
    expect(sealedPackMethodologyClaimIds({
      claim_id: " ",
      methodology_claim_ids: ["bad value", "claim:ok", 12, "c".repeat(300)],
    })).toEqual(["claim:ok"]);
  });
});
