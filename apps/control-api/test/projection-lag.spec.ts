import { describe, expect, it, vi } from "vitest";
import { classifyProjectionLag, readProjectionLag } from "../src/health/projection-lag";

const t = { laggingSeconds: 300, staleSeconds: 900 };
const expected = [
  { environment: "paper", profileId: "PAPER_OKX_SWAP" },
  { environment: "paper", profileId: "PAPER_BINANCE_USDM" },
  { environment: "sandbox", profileId: "SANDBOX_BINANCE_USDM" },
  { environment: "live", profileId: "LIVE_BINANCE_USDM" },
];

describe("projection lag state", () => {
  it("applies the documented boundaries", () => {
    expect(classifyProjectionLag(0, t)).toBe("OK");
    expect(classifyProjectionLag(300, t)).toBe("OK");
    expect(classifyProjectionLag(301, t)).toBe("LAGGING");
    expect(classifyProjectionLag(900, t)).toBe("LAGGING");
    expect(classifyProjectionLag(901, t)).toBe("STALE");
    expect(classifyProjectionLag(null, t)).toBe("STALE");
  });

  it("reads canned rows into per-profile ages and a worst-of status", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [
      { environment: "paper", profile_id: "PAPER_OKX_SWAP", age_seconds: 12.7 },
      { environment: "paper", profile_id: "PAPER_BINANCE_USDM", age_seconds: "400.2" },
      { environment: "sandbox", profile_id: "SANDBOX_BINANCE_USDM", age_seconds: 5000 },
    ] });
    const out = await readProjectionLag({ query } as never, "ws", expected, t);
    expect(out.status).toBe("STALE");
    expect(out.profiles.map(p => [p.profile_id, p.age_seconds, p.state])).toEqual([
      ["PAPER_OKX_SWAP", 12, "OK"], ["PAPER_BINANCE_USDM", 400, "LAGGING"],
      ["SANDBOX_BINANCE_USDM", 5000, "STALE"], ["LIVE_BINANCE_USDM", null, "STALE"],
    ]);
    expect(out.profiles[3].snapshot_present).toBe(false);
  });

  it("reports OK when all fresh and UNKNOWN (not a throw) when the query fails", async () => {
    const fresh = vi.fn().mockResolvedValue({ rows: expected.map(e => ({ environment: e.environment, profile_id: e.profileId, age_seconds: 3 })) });
    expect((await readProjectionLag({ query: fresh } as never, "ws", expected, t)).status).toBe("OK");
    const bad = vi.fn().mockRejectedValue(new Error("down"));
    expect(await readProjectionLag({ query: bad } as never, "ws", expected, t)).toMatchObject({ status: "UNKNOWN", profiles: [] });
  });
});
