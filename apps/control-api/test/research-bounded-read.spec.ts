import { describe, expect, it, vi } from "vitest";

import { acquireResearchPoolClient, BoundedResearchReadAdmission } from "../src/research/bounded-read";

describe("RS-01 bounded Research read admission", () => {
  it("times out a queued viewer and releases a late acquired shared-pool client", async () => {
    const unavailable = () => new Error("bounded");
    const admission = new BoundedResearchReadAdmission({
      maximumActive: 1, maximumQueued: 1, waitTimeoutMs: 5, unavailable,
    });
    const release = await admission.acquire();
    await expect(admission.acquire()).rejects.toThrow("bounded");
    release();

    let resolveClient: ((value: { release: () => void }) => void) | undefined;
    const connect = new Promise<{ release: () => void }>((resolve) => { resolveClient = resolve; });
    const released = vi.fn();
    await expect(acquireResearchPoolClient(connect, 5, unavailable)).rejects.toThrow("bounded");
    resolveClient!({ release: released });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(released).toHaveBeenCalledTimes(1);
  });

  it("removes an aborted queued viewer rather than consuming a later slot", async () => {
    const admission = new BoundedResearchReadAdmission({
      maximumActive: 1, maximumQueued: 1, waitTimeoutMs: 50, unavailable: () => new Error("bounded"),
    });
    const first = await admission.acquire();
    const controller = new AbortController();
    const queued = admission.acquire(controller.signal);
    controller.abort();
    await expect(queued).rejects.toThrow("bounded");
    first();
    const next = await admission.acquire();
    next();
  });

  it("abandons an already-started pool acquire on request abort and releases its late client once", async () => {
    let resolveClient: ((value: { release: () => void }) => void) | undefined;
    const connect = new Promise<{ release: () => void }>((resolve) => { resolveClient = resolve; });
    const released = vi.fn();
    const controller = new AbortController();
    const acquiring = acquireResearchPoolClient(connect, 50, () => new Error("bounded"), controller.signal);
    controller.abort();
    await expect(acquiring).rejects.toThrow("bounded");
    resolveClient!({ release: released });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(released).toHaveBeenCalledTimes(1);
  });
});
