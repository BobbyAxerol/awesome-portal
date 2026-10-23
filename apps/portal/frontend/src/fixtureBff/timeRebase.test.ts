import { describe, expect, it } from "vitest";

import { ConfigError, loadConfig } from "../../../fixture-bff/app";
import { rebaseDelta, rebaseTimes } from "../../../fixture-bff/time-rebase";

const DAY = 86_400_000;

describe("preview clock anchor: rebaseTimes", () => {
  it("shifts exact UTC instants, keeping the millis form they had", () => {
    expect(rebaseTimes("2026-08-22T13:00:00Z", DAY)).toBe("2026-08-23T13:00:00Z");
    expect(rebaseTimes("2026-08-22T13:00:00.250Z", DAY)).toBe("2026-08-23T13:00:00.250Z");
  });

  it("shifts plain days by whole days only", () => {
    expect(rebaseTimes("2026-08-22", 3 * DAY)).toBe("2026-08-25");
    expect(rebaseTimes("2026-08-22", DAY / 3)).toBe("2026-08-22");
  });

  it("shifts only epoch-millisecond numbers under an _ms key; durations, counters and other numbers stay", () => {
    const out = rebaseTimes({ read_at_ms: 1_788_000_000_000, ttl_ms: 60_000, count: 1_788_000_000_000, nested: [{ synced_at_ms: 1_788_000_000_001 }] }, 1000) as Record<string, unknown>;
    expect(out.read_at_ms).toBe(1_788_000_001_000);
    expect(out.ttl_ms).toBe(60_000);
    expect(out.count).toBe(1_788_000_000_000);
    expect((out.nested as { synced_at_ms: number }[])[0]!.synced_at_ms).toBe(1_788_000_001_001);
  });

  it("leaves ids, decimals, hashes, offsets-bearing and free text alone", () => {
    const body = { id: "dep_paper_01", amount: "412880.25", hash: "sha256:abc", note: "see 2026-08-22T13:00:00Z for detail", local: "2026-08-22T13:00:00+07:00", n: null, b: true };
    expect(rebaseTimes(body, DAY)).toEqual(body);
  });

  it("zero delta returns the same value and the delta is anchored to the minute", () => {
    const value = { a: "2026-08-22T13:00:00Z" };
    expect(rebaseTimes(value, 0)).toBe(value);
    const now = Date.parse("2026-10-23T05:00:59Z");
    expect(rebaseDelta("2026-08-22T13:00:00Z", now)).toBe(Date.parse("2026-10-23T05:00:00Z") - Date.parse("2026-08-22T13:00:00Z"));
  });
});

describe("preview clock anchor: configuration", () => {
  it("is off unless FIXTURE_REBASE_TIME=1 and refuses anything but 0 or 1", () => {
    expect(loadConfig({}).rebaseTime).toBe(false);
    expect(loadConfig({ FIXTURE_REBASE_TIME: "0" }).rebaseTime).toBe(false);
    expect(loadConfig({ FIXTURE_REBASE_TIME: "1" }).rebaseTime).toBe(true);
    expect(() => loadConfig({ FIXTURE_REBASE_TIME: "yes" })).toThrow(ConfigError);
  });
});
