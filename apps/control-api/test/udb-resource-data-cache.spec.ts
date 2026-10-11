import { afterEach, describe, expect, it, vi } from "vitest";
import { ExecutionProfileProjectionRepository } from "../src/execution/profile-projection.repository";
import { RETAINED_DATA_VIEW_CACHE_MAXIMUM_SERIALIZED_BYTES as MAX } from "../src/execution/retained-read-profile";

function repository(retained = true) {
  return new ExecutionProfileProjectionRepository({ query: vi.fn() } as any, undefined,
    { EXECUTION_READ_PROFILE: retained ? "retained_review_v1" : "live" });
}
const data = (text = "data") => ({ read_at_ms: 0, data: { rows: [{ price: text }] }, panels: {} });

afterEach(() => vi.restoreAllMocks());
describe("retained representation shares the existing aggregate DATA budget", () => {
  it("expires at2s without sliding hits; freezes data and refuses actor/current clocks", () => {
    let now = 100; vi.spyOn(Date, "now").mockImplementation(() => now);
    const repo = repository(), value = data(); repo.retainResourceTemplate("ws/paper/document1", value);
    expect(repo.retainedResourceTemplate("ws/paper/document1")).toBe(value);
    expect(Object.isFrozen(value.data.rows[0])).toBe(true);
    now = 2099; expect(repo.retainedResourceTemplate("ws/paper/document1")).toBe(value);
    now = 2100; expect(repo.retainedResourceTemplate("ws/paper/document1")).toBeUndefined();
    expect(() => repo.retainResourceTemplate("bad", { ...data(), actor: { user_id: "secret" } })).toThrow("DATA_ONLY");
    expect(() => repo.retainResourceTemplate("bad", { ...data(), read_at_ms: 100 })).toThrow("DATA_ONLY");
  });
  it("keys isolate exact workspace/profile/document metadata and keep at most4 DTOs", () => {
    const repo = repository();
    for (const key of ["ws1/paper/doc1", "ws2/paper/doc1", "ws1/live/doc1", "ws1/paper/doc2", "ws1/paper/doc2/changed-clock"])
      repo.retainResourceTemplate(key, data(key));
    expect(repo.retainedResourceTemplate("ws1/paper/doc1")).toBeUndefined();
    expect(repo.retainedResourceTemplate("ws1/paper/doc2/changed-clock")).toMatchObject(data("ws1/paper/doc2/changed-clock"));
    expect((repo as any).retainedResources.size).toBe(4);
  });
  it("counts document bytes and DTO/key bytes together, refuses over-budget and >1MiB templates", () => {
    const repo = repository();
    // Model the already-accounted raw documents; never allocate16MiB or
    // fabricate authority/SQL in a unit budget test.
    (repo as any).retainedViews.set("paper", { bytes: MAX - 150_000 });
    repo.retainResourceTemplate("a", data("x".repeat(100_000)));
    expect(repo.retainedResourceTemplate("a")).toBeDefined();
    repo.retainResourceTemplate("b", data("y".repeat(100_000)));
    expect(repo.retainedResourceTemplate("a")).toBeUndefined();
    expect((repo as any).retainedCachedBytes()).toBeLessThanOrEqual(MAX);
    repo.retainResourceTemplate("c", data("z".repeat(200_000)));
    expect(repo.retainedResourceTemplate("c")).toBeUndefined();
    repo.retainResourceTemplate("oversize", data("x".repeat(1024 * 1024)));
    expect(repo.retainedResourceTemplate("oversize")).toBeUndefined();
  });
  it("is inactive outside retained review and never queries or stores a refusal", () => {
    const repo = repository(false); repo.retainResourceTemplate("x", data());
    expect(repo.retainedResourceTemplate("x")).toBeUndefined();
    expect((repo as any).retainedResources.size).toBe(0);
    expect(repo.pool.query).not.toHaveBeenCalled();
  });
  it("renews only from a fresh DB-validated exact source, never hits or changed/evicted sources", () => {
    let now=100;vi.spyOn(Date,"now").mockImplementation(()=>now);
    const repo=repository(),snapshot={} as any,value=data();
    const source={snapshot,bytes:100,expiresAt:2100};(repo as any).retainedViews.set("paper",source);
    repo.retainResourceTemplate("exact-document",value,[snapshot]);
    now=2099;expect(repo.retainedResourceTemplate("exact-document")).toBe(value);
    expect((repo as any).retainedResources.get("exact-document").expiresAt).toBe(2100);
    // Models snapshot() succeeding its CURRENT revision query, not a hit.
    now=2200;source.expiresAt=4200;
    expect(repo.retainedResourceTemplate("exact-document")).toBe(value);
    expect((repo as any).retainedResources.get("exact-document").expiresAt).toBe(4200);
    now=3000;expect(repo.retainedResourceTemplate("exact-document")).toBe(value);
    expect((repo as any).retainedResources.get("exact-document").expiresAt).toBe(4200);
    now=4201;source.snapshot={} as any;source.expiresAt=6201;
    expect(repo.retainedResourceTemplate("exact-document")).toBeUndefined();
    // A weak dependency does not keep an evicted large raw document alive.
    repo.retainResourceTemplate("evicted",data(),[source.snapshot]);
    (repo as any).retainedViews.clear();now=6202;
    expect(repo.retainedResourceTemplate("evicted")).toBeUndefined();
  });
});
