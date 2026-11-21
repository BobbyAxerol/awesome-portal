import { EventEmitter } from "node:events";

import { describe, expect, it, vi } from "vitest";

import { ResearchProgressController } from "../src/research/progress.controller";

describe("P11 Research Progress SSE boundary", () => {
  it("closes a live stream on the next authorization lease check after membership revocation", async () => {
    vi.useFakeTimers();
    const raw = Object.assign(new EventEmitter(), {
      writeHead: vi.fn(),
      write: vi.fn(() => true),
      end: vi.fn(),
      headersSent: false,
    });
    const unsubscribe = vi.fn();
    const service = {
      subscribe: vi.fn(() => unsubscribe),
      events: vi.fn().mockResolvedValue({ events: [], sourceLatestSequence: 1, retentionFloorSequence: 0 }),
      read: vi.fn().mockResolvedValue({
        schema_version: "research.progress-read.v1",
        run_id: "run_p11",
        availability: "AVAILABLE",
        current: { effective_status: "RUNNING" },
        progress: null,
      }),
    };
    const workspaces = {
      // First call admits the request; the next monitor iteration sees the
      // revocation and must close instead of leaving native EventSource retry.
      isMember: vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false),
    };
    const auth = { sessions: { isActiveLease: vi.fn().mockResolvedValue(true) } };
    const controller = new ResearchProgressController(
      service as never,
      workspaces as never,
      auth as never,
      { PORTAL_PUBLIC_ORIGIN: "https://portal.example" } as never,
    );
    const request = {
      portalUser: { userId: "p11-admin" },
      portalWorkspaceId: "p11-workspace",
      portalSession: { sessionId: "session_p11", userId: "p11-admin", sessionVersion: 1 },
      headers: {},
    };
    const reply = { raw, hijack: vi.fn(), status: vi.fn(() => ({ send: vi.fn() })) };

    try {
      await controller.events(request as never, reply as never, "run_p11", { workspace_id: "p11-workspace" });
      await vi.advanceTimersByTimeAsync(5_000);

      expect(raw.write).toHaveBeenCalledWith(expect.stringContaining("event: auth.expired"));
      expect(raw.end).toHaveBeenCalledOnce();
      expect(unsubscribe).toHaveBeenCalledOnce();
      expect(raw.listenerCount("close")).toBe(0);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      raw.emit("close");
      vi.useRealTimers();
    }
  });

  it("does not accumulate authorization checks when the store is slow", async () => {
    vi.useFakeTimers();
    const raw = Object.assign(new EventEmitter(), {
      writeHead: vi.fn(),
      write: vi.fn(() => true),
      end: vi.fn(),
      headersSent: false,
    });
    const service = {
      subscribe: vi.fn(() => vi.fn()),
      events: vi.fn().mockResolvedValue({ events: [], sourceLatestSequence: 1, retentionFloorSequence: 0 }),
      read: vi.fn().mockResolvedValue({
        schema_version: "research.progress-read.v1", run_id: "run_p11", availability: "AVAILABLE",
        current: { effective_status: "RUNNING" }, progress: null,
      }),
    };
    const auth = { sessions: { isActiveLease: vi.fn(() => new Promise<boolean>(() => undefined)) } };
    const workspaces = { isMember: vi.fn().mockResolvedValue(true) };
    const controller = new ResearchProgressController(
      service as never,
      workspaces as never,
      auth as never,
      { PORTAL_PUBLIC_ORIGIN: "https://portal.example" } as never,
    );
    const request = {
      portalUser: { userId: "p11-admin" }, portalWorkspaceId: "p11-workspace",
      portalSession: { sessionId: "session_p11", userId: "p11-admin", sessionVersion: 1 }, headers: {},
    };
    const reply = { raw, hijack: vi.fn(), status: vi.fn(() => ({ send: vi.fn() })) };

    try {
      await controller.events(request as never, reply as never, "run_p11", { workspace_id: "p11-workspace" });
      await vi.advanceTimersByTimeAsync(25_000);
      expect(auth.sessions.isActiveLease).toHaveBeenCalledOnce();
      // One membership check admitted the stream; the only monitor request is
      // paired with the single in-flight session lookup above.
      expect(workspaces.isMember).toHaveBeenCalledTimes(2);
    } finally {
      raw.emit("close");
      vi.useRealTimers();
    }
  });
});
