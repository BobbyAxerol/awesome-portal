import { describe, expect, it } from "vitest";

import { ConfigError, loadConfig } from "../../../fixture-bff/app";
import { bodyAnchor, rebaseBody, rebaseDelta, rebaseTimes } from "../../../fixture-bff/time-rebase";

const DAY = 86_400_000;

describe("preview clock anchor: rebaseTimes", () => {
  it("shifts exact UTC instants, keeping the millis form they had", () => {
    expect(rebaseTimes("2026-08-22T13:00:00Z", DAY)).toBe("2026-08-23T13:00:00Z");
    expect(rebaseTimes("2026-08-22T13:00:00.250Z", DAY)).toBe("2026-08-23T13:00:00.250Z");
  });

  it("shifts microsecond and nanosecond instants too (the queue keyset is six places wide), keeping the places beyond millis", () => {
    expect(rebaseTimes("2026-08-22T11:58:00.123456Z", DAY)).toBe("2026-08-23T11:58:00.123456Z");
    expect(rebaseTimes("2026-08-22T11:58:00.000001Z", 120_000)).toBe("2026-08-22T12:00:00.000001Z");
    expect(rebaseTimes("2026-08-22T23:59:59.999999999Z", 1000)).toBe("2026-08-23T00:00:00.999999999Z");
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

describe("preview clock anchor: each body is shifted by its own read time", () => {
  const NOW = Date.parse("2026-10-23T08:00:30Z");
  const OPS_NOW = "2026-08-22T13:00:00Z";

  it("a body that names read_at becomes 'read now', and its contents keep their distance from it", () => {
    const body = { read_at: "2026-10-17T12:04:00Z", series: [{ at: "2026-10-16T12:04:00Z" }], read_at_ms: 1_788_000_000_000 };
    const out = rebaseBody(body, OPS_NOW, NOW) as { read_at: string; series: { at: string }[] };
    expect(out.read_at).toBe("2026-10-23T08:00:00Z");
    expect(out.series[0]!.at).toBe("2026-10-22T08:00:00Z");
  });

  it("two doubles anchored at different instants both land at the real clock, never in the future", () => {
    const ops = rebaseBody({ read_at: "2026-08-22T13:00:00Z" }, OPS_NOW, NOW) as { read_at: string };
    const alpha = rebaseBody({ read_at: "2026-10-17T12:04:00Z" }, OPS_NOW, NOW) as { read_at: string };
    expect(ops.read_at).toBe("2026-10-23T08:00:00Z");
    expect(alpha.read_at).toBe("2026-10-23T08:00:00Z");
  });

  it("a body without a read time falls back to the doubles' common instant, and read_at_ms alone also anchors", () => {
    const plain = rebaseBody({ at: "2026-08-22T13:00:00Z" }, OPS_NOW, NOW) as { at: string };
    expect(plain.at).toBe("2026-10-23T08:00:00Z");
    expect(bodyAnchor({ read_at_ms: 1_788_000_000_000 })).toBe(1_788_000_000_000);
    expect(bodyAnchor({ read_at: "not a date" })).toBeNull();
    expect(bodyAnchor([1])).toBeNull();
    expect(bodyAnchor(null)).toBeNull();
  });
});
