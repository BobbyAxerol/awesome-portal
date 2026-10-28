import { describe, expect, it } from "vitest";
import { blotterPath } from "./httpApi";

describe("blotterPath: the closed allowlist of the blotter query", () => {
  it("sends the published scope axes and stage", () => {
    const path = blotterPath({ limit: 50, stage: "PAPER", deployment_id: "dep_live_01", account_id: "acc_1", alpha_id: "alpha_a" })!;
    const params = new URL(path, "http://x").searchParams;
    expect(Object.fromEntries(params)).toEqual({ limit: "50", stage: "PAPER", deployment_id: "dep_live_01", account_id: "acc_1", alpha_id: "alpha_a" });
  });
  it("sends nothing it does not publish", () => {
    const path = blotterPath({ limit: 10, workspace: "w", environment: "live" } as never)!;
    expect(path).toBe("/screens/blotter?limit=10");
  });
  it("refuses a value outside the grammar instead of sending it", () => {
    expect(blotterPath({ stage: "STAGING" } as never)).toBeNull();
    expect(blotterPath({ deployment_id: "a b&c=d" })).toBeNull();
    expect(blotterPath({ alpha_id: "../x" })).toBeNull();
    expect(blotterPath({ limit: 1000 })).toBeNull();
    expect(blotterPath({ side: "HOLD" } as never)).toBeNull();
  });
  it("an empty query is the bare route", () => {
    expect(blotterPath({})).toBe("/screens/blotter");
  });
});
