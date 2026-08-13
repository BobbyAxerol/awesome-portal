import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PortalApiError,
  fetchLegacyCollection,
  patchV1,
  transitionTaskV1,
  type VersionedItem,
} from "../src/lib/api";

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
}

describe("portal API client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("preserves an uninitialized legacy response so hooks can seed it deliberately", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ initialized: false, items: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchLegacyCollection("tasks")).resolves.toEqual({ initialized: false, items: [] });
    expect(fetchMock).toHaveBeenCalledWith("api/tasks", expect.objectContaining({ method: "GET" }));
  });

  it("sends a versioned patch and transition to their separate command endpoints", async () => {
    const saved: VersionedItem<{ title: string }> = {
      item: { title: "Saved" }, version: 4, position: 0, created_at: "now", updated_at: "now", deleted_at: null,
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(saved))
      .mockResolvedValueOnce(jsonResponse(saved));
    vi.stubGlobal("fetch", fetchMock);

    await patchV1("tasks", "TASK / 1", { title: "Saved" }, 3);
    await transitionTaskV1("TASK / 1", "Done", 4);

    expect(fetchMock).toHaveBeenNthCalledWith(1, "api/v1/tasks/TASK%20%2F%201", expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ title: "Saved", expected_version: 3 }),
    }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, "api/v1/tasks/TASK%20%2F%201/transition", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ status: "Done", expected_version: 4 }),
    }));
  });

  it("normalizes the backend error envelope for a conflict UI can recover from", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      error: { code: "version_conflict", message: "Refresh before saving." }, request_id: "req-1",
    }, 409)));

    await expect(patchV1("roadmap", "P0", { name: "Changed" }, 1)).rejects.toMatchObject<Partial<PortalApiError>>({
      name: "PortalApiError", status: 409, code: "version_conflict", message: "Refresh before saving.",
    });
  });
});
