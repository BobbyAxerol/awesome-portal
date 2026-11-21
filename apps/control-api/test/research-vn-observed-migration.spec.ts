import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { VN_OBSERVED_FIXED_PROFILE_DIGEST, VN_OBSERVED_FIXED_PROFILE_ID, vnObservedFixedProfileDigest } from "../src/research/vn-observed-fixed.profile";

describe("additive observed VN profile migration", () => {
  const migration = readFileSync(resolve(__dirname, "../migrations/1723680000090_research-vn-observed-fixed-profile.sql"), "utf8");
  it("pins the same exact new profile without admitting an unpinned digest", () => {
    expect(vnObservedFixedProfileDigest()).toBe(VN_OBSERVED_FIXED_PROFILE_DIGEST);
    expect(migration).toContain(`execution_profile_id = '${VN_OBSERVED_FIXED_PROFILE_ID}' AND execution_profile_digest IS NOT NULL AND execution_profile_digest = '${VN_OBSERVED_FIXED_PROFILE_DIGEST}'`);
  });
  it("keeps every old profile pair and does not update immutable rows or WFO seals", () => {
    const previous = readFileSync(resolve(__dirname, "../migrations/1723680000089_research-causal-inner-profile.sql"), "utf8");
    const oldPairs = previous.match(/\(execution_profile_id = '[^']+' AND execution_profile_digest[^\n]+/g)!;
    expect(oldPairs.length).toBe(6);
    for (const pair of oldPairs) expect(migration).toContain(pair.replace(/\);$/, ")"));
    expect(migration).not.toMatch(/\b(?:UPDATE|DELETE|TRUNCATE|INSERT)\s/i);
    expect(migration).not.toContain("current_source_seals_v1");
  });
});
