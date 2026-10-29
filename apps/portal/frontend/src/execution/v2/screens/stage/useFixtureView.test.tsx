import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useFixtureView } from "./useFixtureView";

afterEach(() => { cleanup(); document.getElementById("fixture-banner")?.remove(); vi.unstubAllGlobals(); });
const banner = () => { const el = document.createElement("div"); el.id = "fixture-banner"; document.body.append(el); };
const response = (id: string, base: string, lane = "FIXTURE_LAB") => new Response(JSON.stringify({ fixture: true, view: { id, fixture: true, view_of_deployment_id: base } }), { status: 200, headers: { "x-fixture-lane": lane } });

describe("fixture-only view context", () => {
  it("does not request fixture metadata on a product page", () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    const { result } = renderHook(() => useFixtureView("dep_live_01_gap", "workspace_a"));
    expect(result.current).toBeNull(); expect(fetcher).not.toHaveBeenCalled();
  });
  it("reads the declared relation only from the fixture lane with the exact workspace", async () => {
    banner(); const fetcher = vi.fn().mockResolvedValue(response("dep_live_01_gap", "dep_live_01")); vi.stubGlobal("fetch", fetcher);
    const { result } = renderHook(() => useFixtureView("dep_live_01_gap", "workspace_a"));
    await waitFor(() => expect(result.current).toBe("dep_live_01"));
    expect(fetcher.mock.calls[0]![0]).toBe("/__fixture/variants?view_id=dep_live_01_gap&workspace_id=workspace_a");
  });
  it("accepts a configured fixture lane label", async () => {
    banner(); vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response("dep_live_01_gap", "dep_live_01", "FIXTURE_LAB/review")));
    const { result } = renderHook(() => useFixtureView("dep_live_01_gap", "workspace_a"));
    await waitFor(() => expect(result.current).toBe("dep_live_01"));
  });
  it.each([["wrong id", "other", "FIXTURE_LAB"], ["wrong lane", "dep_live_01_gap", "source"]])("refuses %s", async (_name, id, lane) => {
    banner(); vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(id, "dep_live_01", lane)));
    const { result } = renderHook(() => useFixtureView("dep_live_01_gap", "workspace_a"));
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });
  it("does not retain the previous workspace's relation when access changes", async () => {
    banner(); vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(response("dep_live_01_gap", "dep_live_01")).mockResolvedValueOnce(new Response("", { status: 403 })));
    const { result, rerender } = renderHook(({ ws }) => useFixtureView("dep_live_01_gap", ws), { initialProps: { ws: "workspace_a" } });
    await waitFor(() => expect(result.current).toBe("dep_live_01"));
    rerender({ ws: "ws_TEST_DENIED" });
    expect(result.current).toBeNull();
  });
});
