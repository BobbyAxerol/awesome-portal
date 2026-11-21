import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import type { ControlApiConfig } from "../src/config";
import type { PortalUser } from "../src/domain";
import type { ResearchScope } from "../src/research/contracts";
import type { ResearchAlphaAnalysisClient } from "../src/research/alpha-analysis.client";
import { ResearchAlphaImportService } from "../src/research/alpha-import.service";
import type { ResearchMetadataRepository } from "../src/research/repository";

describe("P07 declared source digest", () => {
  it("rejects a byte mismatch before analysis or source custody", async () => {
    const cleanup = vi.fn();
    const analyze = vi.fn();
    const service = new ResearchAlphaImportService(
      { cleanupExpiredUnboundAlphaImportSources: cleanup } as unknown as ResearchMetadataRepository,
      { analyze } as unknown as ResearchAlphaAnalysisClient,
      {} as ControlApiConfig,
    );
    await expect(service.parse(
      {} as PortalUser,
      {} as ResearchScope,
      { originalFilename: "alpha.py", sourceText: "ALPHA_CONTRACT = {}", expectedSourceDigest: "0".repeat(64) },
      "request-1",
    )).rejects.toMatchObject({ code: "RESEARCH_ALPHA_IMPORT_DIGEST_MISMATCH", status: 409 });
    expect(cleanup).not.toHaveBeenCalled();
    expect(analyze).not.toHaveBeenCalled();
  });

  it("accepts an exact client digest through the same parser boundary", async () => {
    const sourceText = "ALPHA_CONTRACT = {}";
    const exactDigest = createHash("sha256").update(sourceText).digest("hex");
    const marker = new Error("exact digest reached custody");
    const service = new ResearchAlphaImportService(
      { cleanupExpiredUnboundAlphaImportSources: vi.fn().mockRejectedValue(marker) } as unknown as ResearchMetadataRepository,
      {} as ResearchAlphaAnalysisClient,
      { RESEARCH_ALPHA_IMPORT_MAXIMUM_ACTIVE_SOURCES_PER_ACTOR: 8 } as ControlApiConfig,
    );
    await expect(service.parse({} as PortalUser, {} as ResearchScope, {
      originalFilename: "alpha.py", sourceText, expectedSourceDigest: exactDigest,
    }, "request-2")).rejects.toBe(marker);
  });
});
