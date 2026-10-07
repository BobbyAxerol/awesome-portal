import { describe, expect, it } from "vitest";

import { withUtcInstants } from "./utcInstants";

describe("withUtcInstants — what is sent says it is UTC", () => {
  it("adds seconds and Z to a zone-less window instant, leaves a zoned one and everything else alone", () => {
    const spec = { windows: { is: { start: "2026-08-03T00:00", end_exclusive: "2026-09-14T00:00:00Z" }, oos: { start: "2026-09-14T00:00", end_exclusive: "2026-09-26T06:30:15.5" } }, walk_forward: { start: "2026-01-01T00:00", end_exclusive: "2026-02-01T00:00", split_mode: "2026-01-15T00:00", frequency: "weekly" }, optuna_trials: 3 };
    expect(withUtcInstants(spec)).toEqual({
      windows: { is: { start: "2026-08-03T00:00:00Z", end_exclusive: "2026-09-14T00:00:00Z" }, oos: { start: "2026-09-14T00:00:00Z", end_exclusive: "2026-09-26T06:30:15.5Z" } },
      walk_forward: { start: "2026-01-01T00:00:00Z", end_exclusive: "2026-02-01T00:00:00Z", split_mode: "2026-01-15T00:00:00Z", frequency: "weekly" },
      optuna_trials: 3,
    });
    expect(spec.windows.is.start).toBe("2026-08-03T00:00");
  });
  it("is a no-op without windows or walk-forward", () => {
    expect(withUtcInstants({ a: 1 })).toEqual({ a: 1 });
    expect(withUtcInstants(null)).toBeNull();
  });
});
