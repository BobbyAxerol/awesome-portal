import { describe, expect, it, vi } from "vitest";

import { ResearchReportController } from "../src/research/report.controller";

const config = { PORTAL_PUBLIC_ORIGIN: "https://portal.primusspark.com" };

function request(overrides: Record<string, unknown> = {}) {
  return {
    portalUser: { userId: "p18-user" }, portalWorkspaceId: "workspace-p18",
    portalSession: { csrfSecretHash: "not-used-by-read-tests" },
    headers: {}, raw: { once: vi.fn(), off: vi.fn() },
    ...overrides,
  };
}

describe("P18 same-origin Report controller boundary", () => {
  it("revalidates the browser-visible weak ETag only after workspace authority", async () => {
    const etag = `"p18r1_${"a".repeat(64)}"`;
    const service = { read: vi.fn().mockResolvedValue({ etag }) };
    const workspaces = { isMember: vi.fn().mockResolvedValue(true) };
    const controller = new ResearchReportController(service as never, workspaces as never, config as never);
    const reply = { header: vi.fn().mockReturnThis(), send: vi.fn(), code: vi.fn().mockReturnThis() };
    await controller.detail(request({ headers: { "if-none-match": `W/${etag}` } }) as never, reply as never, "run_p18", {});
    expect(reply.header).toHaveBeenCalledWith("cache-control", "private, no-cache");
    expect(reply.header).toHaveBeenCalledWith("etag", etag);
    expect(reply.code).toHaveBeenCalledWith(304);
    expect(reply.send).toHaveBeenCalledWith();

    workspaces.isMember.mockResolvedValue(false);
    await expect(controller.detail(request({ headers: { "if-none-match": `W/${etag}` } }) as never,
      reply as never, "run_p18", {})).rejects.toMatchObject({ code: "RESEARCH_REPORT_NOT_FOUND", status: 404 });
    expect(service.read).toHaveBeenCalledTimes(1);
  });

  it("P18-T04/T06 authorizes report/status/download separately and does not disclose cross-workspace IDs", async () => {
    const service = {
      read: vi.fn().mockResolvedValue({ etag: '"p18r1_' + "a".repeat(64) + '"' }),
      readExport: vi.fn().mockResolvedValue({ state: "QUEUED" }),
      download: vi.fn().mockResolvedValue({ status: { content_type: "text/csv", filename: `quantbt-run-p18r1_${"a".repeat(64)}.csv` }, bytes: Buffer.from("a") }),
    };
    const workspaces = { isMember: vi.fn().mockResolvedValue(true) };
    const controller = new ResearchReportController(service as never, workspaces as never, config as never);
    const reply = { header: vi.fn().mockReturnThis(), send: vi.fn(), code: vi.fn().mockReturnThis() };
    await controller.detail(request() as never, reply as never, "run_p18", {});
    await controller.exportStatus(request() as never, "run_p18", `rpex_01J00000000000000000000000`, {});
    await controller.download(request() as never, reply as never, "run_p18", `rpex_01J00000000000000000000000`, {});
    expect(workspaces.isMember).toHaveBeenCalledTimes(3);
    expect(service.read).toHaveBeenCalledWith({ workspaceId: "workspace-p18", actorUserId: "p18-user" }, "run_p18");
    expect(service.readExport).toHaveBeenCalledWith({ workspaceId: "workspace-p18", actorUserId: "p18-user" }, "run_p18", expect.any(String));
    expect(service.download).toHaveBeenCalledWith({ workspaceId: "workspace-p18", actorUserId: "p18-user" }, "run_p18", expect.any(String));

    workspaces.isMember.mockResolvedValue(false);
    await expect(controller.exportStatus(request() as never, "run_p18", `rpex_01J00000000000000000000000`, {}))
      .rejects.toMatchObject({ code: "RESEARCH_REPORT_NOT_FOUND", status: 404 });
    expect(service.readExport).toHaveBeenCalledTimes(1);
  });

  it("rejects a browser export mutation without valid same-origin CSRF instead of queuing work", async () => {
    const service = { requestExport: vi.fn() };
    const controller = new ResearchReportController(service as never, { isMember: vi.fn() } as never, config as never);
    await expect(controller.createExport(request() as never, "run_p18", {}, { format: "REPORT_CSV" }))
      .rejects.toMatchObject({ code: "RESEARCH_REPORT_FORBIDDEN", status: 403 });
    expect(service.requestExport).not.toHaveBeenCalled();
  });
});
