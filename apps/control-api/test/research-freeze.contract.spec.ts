import { describe, expect, it } from "vitest";

import { ResearchFreezeReadQuerySchema } from "../src/research/freeze.contract";

describe("P16 Freeze request contract", () => {
  it("accepts a bounded optional inspection fold and rejects browser-chosen authority inputs", () => {
    expect(ResearchFreezeReadQuerySchema.parse({ workspace_id: "research.1", fold: "12" })).toEqual({
      workspace_id: "research.1", fold: 12,
    });
    expect(ResearchFreezeReadQuerySchema.safeParse({ fold: 0 }).success).toBe(false);
    expect(ResearchFreezeReadQuerySchema.safeParse({ fold: 257 }).success).toBe(false);
    for (const forbidden of [
      "relation", "cursor", "artifact_path", "source_revision", "parameter_override", "diagnostic_job",
    ]) expect(ResearchFreezeReadQuerySchema.safeParse({ [forbidden]: "browser-chosen" }).success).toBe(false);
  });
});
