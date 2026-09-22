import { describe, expect, it } from "vitest";

import { ResearchSearchReadQuerySchema } from "../src/research/search.contract";

describe("P15 Search request contract", () => {
  it("accepts a bounded optional fold and rejects unknown or out-of-range query input", () => {
    expect(ResearchSearchReadQuerySchema.parse({ workspace_id: "research.1", fold: "12" })).toEqual({
      workspace_id: "research.1", fold: 12,
    });
    expect(ResearchSearchReadQuerySchema.safeParse({ fold: 0 }).success).toBe(false);
    expect(ResearchSearchReadQuerySchema.safeParse({ fold: 257 }).success).toBe(false);
    expect(ResearchSearchReadQuerySchema.safeParse({ cursor: "browser-chosen" }).success).toBe(false);
  });
});
