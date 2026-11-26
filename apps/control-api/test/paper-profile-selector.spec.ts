import { describe, expect, it, vi } from "vitest";
import { PaperReadController } from "../src/paper-read/paper-read.controller";

// Option B: `profile_id` is validated against the allow-list in the controller;
// absent = today's behaviour; unknown = typed 4xx, never the default.
function fixture(allowed?: string[]) {
  const request = { portalUser: { userId: "TEST_ONLY-viewer" }, portalSession: {},
    portalWorkspaceId: "ws", headers: {}, url: "/api/v1/execution/screens/paper" } as any;
  const workspaces = { canReadExecution: vi.fn().mockResolvedValue(true) } as any;
  const config = {
    EXECUTION_EDGE_PAPER_PROFILE_ID: "PAPER_BINANCE_USDM",
    EXECUTION_PAPER_READ_PROFILE_ID: "PAPER_BINANCE_USDM",
    FEATURE_EXECUTION_CURRENT_SOURCE_PAPER_OKX: "true",
    EXECUTION_EDGE_PAPER_OKX_PROFILE_ID: "PAPER_OKX_SWAP",
    ...(allowed ? { EXECUTION_PAPER_READ_ALLOWED_PROFILE_IDS: allowed } : {}),
  } as any;
  const read = vi.fn().mockResolvedValue({ schema_version: "execution.paper-overview.v1" });
  const controller = new PaperReadController({ overview: read, workbench: read, blotter: read } as any, workspaces, config);
  return { request, controller, read };
}

describe("Paper profile selector (backend allow-list)", () => {
  it("leaves the principal untouched when no profile_id is sent", async () => {
    const f = fixture(["PAPER_OKX_SWAP"]);
    await f.controller.overview(f.request, {});
    expect(f.read.mock.calls[0][0]).not.toHaveProperty("paperProfileId");
  });

  it("passes an allowed profile to the service as a server-validated principal field", async () => {
    const f = fixture(["PAPER_OKX_SWAP"]);
    await f.controller.overview(f.request, { profile_id: "PAPER_OKX_SWAP" });
    await f.controller.blotter(f.request, { profile_id: "PAPER_OKX_SWAP" });
    await f.controller.workbench(f.request, "dep-1", { profile_id: "PAPER_BINANCE_USDM" });
    expect(f.read.mock.calls.map((call) => call[0].paperProfileId))
      .toEqual(["PAPER_OKX_SWAP", "PAPER_OKX_SWAP", "PAPER_BINANCE_USDM"]);
  });

  it.each([
    ["default allow-list (only the current profile)", undefined, "PAPER_OKX_SWAP"],
    ["profile not on the list", ["PAPER_OKX_SWAP"], "PAPER_DNSE_VNM"],
  ])("refuses with a typed 400 and never reads: %s", async (_label, allowed, profile) => {
    const f = fixture(allowed);
    for (const call of [
      () => f.controller.overview(f.request, { profile_id: profile }),
      () => f.controller.blotter(f.request, { profile_id: profile }),
      () => f.controller.workbench(f.request, "dep-1", { profile_id: profile }),
      () => f.controller.workbenchVnm(f.request, "dep-1", { profile_id: profile }),
    ]) await expect(call()).rejects.toMatchObject({ code: "PAPER_PROFILE_NOT_ALLOWED", status: 400 });
    expect(f.read).not.toHaveBeenCalled();
  });

  it("rejects a malformed profile_id as an invalid query", async () => {
    const f = fixture(["PAPER_OKX_SWAP"]);
    await expect(f.controller.overview(f.request, { profile_id: "binance; drop" }))
      .rejects.toMatchObject({ code: "N22_QUERY_INVALID", status: 400 });
    expect(f.read).not.toHaveBeenCalled();
  });
});
