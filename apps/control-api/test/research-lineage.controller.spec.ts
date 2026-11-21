import { describe, expect, it, vi } from "vitest";

import { ResearchLineageController } from "../src/research/lineage.controller";

const request = {
  portalUser: { userId: "usr-p19" },
  portalWorkspaceId: "ws-p19",
  headers: {} as Record<string, string>,
};

function reply() {
  const sent: { status: number; headers: Record<string, string>; body: unknown } = { status: 200, headers: {}, body: undefined };
  const value = {
    header: vi.fn((name: string, content: string) => {
      sent.headers[name] = content;
      return value;
    }),
    code: vi.fn((status: number) => {
      sent.status = status;
      return value;
    }),
    send: vi.fn((body?: unknown) => {
      sent.body = body;
      return value;
    }),
  };
  return { value, sent };
}

const ETAG = `"p19r2_${"a".repeat(64)}"`;

describe("P19 Attempt Lineage same-origin boundary", () => {
  it("normalizes only the named alpha/workspace/limit/cursor inputs before the service", async () => {
    const service = { read: vi.fn().mockResolvedValue({ schema_version: "research.attempt-lineage.v1", etag: ETAG }) };
    const workspaces = { isMember: vi.fn().mockResolvedValue(true) };
    const controller = new ResearchLineageController(service as never, workspaces as never);
    const { value, sent } = reply();

    await controller.read(request as never, value as never, "alpha-p19", { limit: "24", cursor: "lc1.k.p.s" });
    expect(sent.body).toEqual({ schema_version: "research.attempt-lineage.v1", etag: ETAG });
    expect(workspaces.isMember).toHaveBeenCalledWith("ws-p19", "usr-p19");
    expect(service.read).toHaveBeenCalledWith(
      { workspaceId: "ws-p19", actorUserId: "usr-p19" },
      "alpha-p19",
      { workspace_id: "ws-p19", limit: 24, cursor: "lc1.k.p.s" },
      request.portalUser,
    );
  });

  it("CG-P19-02 answers a matching weak If-None-Match with 304, private and no-cache", async () => {
    const service = { read: vi.fn().mockResolvedValue({ schema_version: "research.attempt-lineage.v1", etag: ETAG }) };
    const workspaces = { isMember: vi.fn().mockResolvedValue(true) };
    const controller = new ResearchLineageController(service as never, workspaces as never);

    const first = reply();
    await controller.read(request as never, first.value as never, "alpha-p19", {});
    expect(first.sent.status).toBe(200);
    expect(first.sent.headers).toEqual({ "cache-control": "private, no-cache", etag: ETAG });

    const revalidated = reply();
    await controller.read({ ...request, headers: { "if-none-match": `W/${ETAG}` } } as never, revalidated.value as never, "alpha-p19", {});
    expect(revalidated.sent.status).toBe(304);
    expect(revalidated.sent.body).toBeUndefined();

    const changed = reply();
    await controller.read({ ...request, headers: { "if-none-match": `"p19r2_${"b".repeat(64)}"` } } as never, changed.value as never, "alpha-p19", {});
    expect(changed.sent.status).toBe(200);
  });

  it("rejects malformed alpha/query and hides an unobservable workspace before a lineage lookup", async () => {
    const service = { read: vi.fn() };
    const workspaces = { isMember: vi.fn().mockResolvedValue(false) };
    const controller = new ResearchLineageController(service as never, workspaces as never);
    const { value } = reply();
    await expect(controller.read(request as never, value as never, "A", {})).rejects.toMatchObject({
      code: "RESEARCH_LINEAGE_INVALID", status: 400,
    });
    await expect(controller.read(request as never, value as never, "alpha-p19", { after: "x" })).rejects.toMatchObject({
      code: "RESEARCH_LINEAGE_INVALID", status: 400,
    });
    await expect(controller.read(request as never, value as never, "alpha-p19", { workspace_id: "other" })).rejects.toMatchObject({
      code: "RESEARCH_LINEAGE_NOT_FOUND", status: 404,
    });
    expect(service.read).not.toHaveBeenCalled();
  });
});
