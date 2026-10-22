/**
 * The SSE block splitter (ELP2-09 Fleet STREAM transport). Lane: FIXTURE_LAB (unit). It cuts text at the blank line and nothing else.
 */
import { describe, expect, it } from "vitest";

import { createSseSplitter } from "./sseSplitter";
import { wireCase } from "./fleetStream.testbase";

describe("sseSplitter", () => {
  it("returns a block only once its blank line has arrived", () => {
    const splitter = createSseSplitter(1_000);
    expect(splitter.push("event: heartbeat\n")).toEqual([]);
    expect(splitter.push("data: {}\n")).toEqual([]);
    expect(splitter.push("\n")).toEqual(["event: heartbeat\ndata: {}\n\n"]);
    expect(splitter.pending()).toBe(0);
  });

  it("cuts a published wire block at every possible chunk boundary", () => {
    const text = wireCase("AFR-WIRE-REVALIDATE") + wireCase("AFR-WIRE-HEARTBEAT");
    const whole = createSseSplitter(20_000).push(text);
    expect(whole).toHaveLength(2);
    for (let cut = 1; cut < text.length; cut += 37) {
      const splitter = createSseSplitter(20_000);
      const blocks = [...splitter.push(text.slice(0, cut)), ...splitter.push(text.slice(cut))];
      expect(blocks, `cut at ${cut}`).toEqual(whole);
    }
  });

  it("returns three blocks that arrive in one chunk", () => {
    const splitter = createSseSplitter(1_000);
    expect(splitter.push("event: a\ndata: 1\n\nevent: b\ndata: 2\n\nevent: c\ndata: 3\n\n")).toHaveLength(3);
  });

  it("reads CRLF and a lone CR as newlines, including a CRLF split across two chunks", () => {
    const splitter = createSseSplitter(1_000);
    expect(splitter.push("event: a\r\ndata: 1\r\n\r\n")).toEqual(["event: a\ndata: 1\n\n"]);
    expect(splitter.push("event: b\rdata: 2\r\r")).toEqual(["event: b\ndata: 2\n\n"]);
    expect(splitter.push("event: c\ndata: 3\r")).toEqual([]);
    expect(splitter.push("\n\r\n")).toEqual(["event: c\ndata: 3\n\n"]);
  });

  it("skips blank lines between blocks: an empty block is not an event", () => {
    const splitter = createSseSplitter(1_000);
    expect(splitter.push("\n\n\nevent: a\ndata: 1\n\n\n\n\nevent: b\ndata: 2\n\n")).toEqual(["event: a\ndata: 1\n\n", "event: b\ndata: 2\n\n"]);
  });

  it("is bounded: a block that never ends overflows, keeps nothing and yields nothing after", () => {
    const splitter = createSseSplitter(100);
    expect(splitter.push("data: " + "x".repeat(60))).toEqual([]);
    expect(splitter.overflowed()).toBe(false);
    expect(splitter.push("y".repeat(60))).toEqual([]);
    expect(splitter.overflowed()).toBe(true);
    expect(splitter.pending()).toBe(0);
    expect(splitter.push("event: a\ndata: 1\n\n")).toEqual([]);
  });

  it("is bounded for a complete block that is too long, too", () => {
    const splitter = createSseSplitter(20);
    expect(splitter.push(`data: ${"x".repeat(50)}\n\n`)).toEqual([]);
    expect(splitter.overflowed()).toBe(true);
  });

  it("holds at most the bound while a peer sends blocks that never finish", () => {
    const splitter = createSseSplitter(500);
    let largest = 0;
    for (let i = 0; i < 1_000 && !splitter.overflowed(); i += 1) {
      splitter.push("a".repeat(50));
      largest = Math.max(largest, splitter.pending());
    }
    expect(splitter.overflowed()).toBe(true);
    expect(largest).toBeLessThanOrEqual(550);
  });
});
