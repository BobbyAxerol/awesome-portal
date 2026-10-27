import { describe, expect, it, vi } from "vitest";
import { ResearchRunLibraryAlphaCatalogueQuerySchema, ResearchRunLibraryAlphaCatalogueResponseSchema } from "../src/research/run-library.contract";
import { ResearchRunLibraryController } from "../src/research/run-library.controller";
import { ResearchRunLibraryService } from "../src/research/run-library.service";
import { testConfig } from "./harness";

const scope = { workspaceId: "workspace-alpha-test", actorUserId: "alpha-reader" };
const config = testConfig({ FEATURE_RESEARCH_RUN_LIBRARY: "true",
  QUERY_CURSOR_ACTIVE_KEY_ID: "catalogue-key",
  QUERY_CURSOR_KEYS_JSON: '{"catalogue-key":"TEST_ONLY-query-key-longer-than-thirty-two-bytes"}' });
const alpha = (n: number) => ({ alphaId: `alpha-${String(n).padStart(4, "0")}`, alphaName: `Alpha ${n}` });

describe("FE-069 distinct workspace run-alpha catalogue", () => {
  it("traverses more than 200 alphas without duplicating or skipping and binds cursor to workspace and limit", async () => {
    const all = Array.from({ length: 405 }, (_, i) => alpha(i));
    const repository = { alphaCatalogue: vi.fn(async (_scope, after: string | null, limit: number) => {
      const remaining = all.filter(value => !after || value.alphaId > after);
      return { items: remaining.slice(0, limit), hasMore: remaining.length > limit, asOfUtcMs: 1 };
    }) };
    const service = new ResearchRunLibraryService(repository as never, config);
    let cursor: string | undefined;
    const seen: string[] = [];
    for (let i = 0; i < 3; i++) {
      const page = await service.alphaCatalogue(scope, { limit: 200, cursor });
      expect(ResearchRunLibraryAlphaCatalogueResponseSchema.parse(page)).toEqual(page);
      seen.push(...page.items.map(item => item.alpha_id));
      cursor = page.page.next_cursor ?? undefined;
      expect(page.page.has_more).toBe(i < 2);
      if (i === 0) {
        await expect(service.alphaCatalogue({ ...scope, workspaceId: "other-workspace" }, { limit: 200, cursor }))
          .rejects.toMatchObject({ code: "RESEARCH_RUN_LIBRARY_CURSOR_INVALID" });
        await expect(service.alphaCatalogue(scope, { limit: 100, cursor }))
          .rejects.toMatchObject({ code: "RESEARCH_RUN_LIBRARY_CURSOR_INVALID" });
        await expect(service.alphaCatalogue(scope, { limit: 200, cursor: `${cursor}x` }))
          .rejects.toMatchObject({ code: "RESEARCH_RUN_LIBRARY_CURSOR_INVALID" });
      }
    }
    expect(seen).toEqual(all.map(item => item.alphaId));
    expect(repository.alphaCatalogue).toHaveBeenCalledTimes(3);
  });

  it("rejects malformed query and inconsistent backend pages", async () => {
    for (const input of [{ limit: 201 }, { limit: 0 }, { cursor: "" }, { extra: "unknown" }])
      expect(ResearchRunLibraryAlphaCatalogueQuerySchema.safeParse(input).success).toBe(false);
    const service = new ResearchRunLibraryService({ alphaCatalogue: async () => ({ items: [], hasMore: true, asOfUtcMs: 1 }) } as never, config);
    await expect(service.alphaCatalogue(scope, { limit: 2 })).rejects.toMatchObject({ code: "RESEARCH_RUN_LIBRARY_UNAVAILABLE" });
  });

  it("checks workspace access before invoking the read and normalizes the query", async () => {
    const service = { alphaCatalogue: vi.fn().mockResolvedValue({}) };
    const workspaces = { isMember: vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true) };
    const controller = new ResearchRunLibraryController(service as never, workspaces as never);
    const req = { portalUser: { userId: scope.actorUserId }, portalWorkspaceId: scope.workspaceId };
    await expect(controller.alphaCatalogue(req as never, { limit: "2" })).rejects.toMatchObject({ code: "RESEARCH_RUN_LIBRARY_NOT_FOUND" });
    expect(service.alphaCatalogue).not.toHaveBeenCalled();
    await controller.alphaCatalogue(req as never, { limit: "2" });
    expect(service.alphaCatalogue).toHaveBeenCalledWith(scope, expect.objectContaining({ limit: 2 }));
  });
});
