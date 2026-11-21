import { describe, expect, it } from "vitest";

import { DEFAULT_ROUTES } from "./routes";

describe("DEFAULT_ROUTES.deployment (D5: Canary has its own control room)", () => {
  it.each([
    ["PAPER", "/deployments/paper/d1"],
    ["paper", "/deployments/paper/d1"],
    ["SANDBOX", "/deployments/sandbox/d1"],
    ["CANARY", "/deployments/live/d1/canary"],
    ["canary", "/deployments/live/d1/canary"],
    ["LIVE", "/deployments/live/d1"],
    ["live", "/deployments/live/d1"],
    ["something-else", "/deployments/paper/d1"],
  ])("%s -> %s", (stage, href) => {
    expect(DEFAULT_ROUTES.deployment("d1", stage)).toBe(href);
  });

  it("encodes the id once, also on the Canary path", () => {
    expect(DEFAULT_ROUTES.deployment("dep/1 x", "CANARY")).toBe("/deployments/live/dep%2F1%20x/canary");
  });
});
