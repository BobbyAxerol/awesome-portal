import { describe, expect, it } from "vitest";
import { ResearchAlphaImportParseRequestSchema } from "../src/research/alpha-import.contract";

describe("P23 import filename admission matches the published/private 128-character bound", () => {
  it("admits the exact boundary and refuses overflow before it becomes an upstream 422/502", () => {
    const input = { original_filename: "a".repeat(125) + ".py", source_text: "pass" };
    expect(input.original_filename).toHaveLength(128);
    expect(ResearchAlphaImportParseRequestSchema.parse(input)).toEqual(input);
    for (const stemLength of [126, 127, 128]) {
      expect(ResearchAlphaImportParseRequestSchema.safeParse({
        ...input, original_filename: "a".repeat(stemLength) + ".py",
      }).success).toBe(false);
    }
  });

  it("preserves single-file and closed-body admission", () => {
    for (const name of ["../alpha.py", "a/b.py", "alpha.py\u0000", "alpha", ".py"]) {
      expect(ResearchAlphaImportParseRequestSchema.safeParse({ original_filename: name, source_text: "pass" }).success).toBe(false);
    }
    expect(ResearchAlphaImportParseRequestSchema.safeParse({
      original_filename: "a.py", source_text: "pass", upstream: "http://example.invalid",
    }).success).toBe(false);
  });
});
