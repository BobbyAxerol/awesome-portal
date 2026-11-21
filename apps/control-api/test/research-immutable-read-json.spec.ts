import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { freezeReadValue, immutableReadJsonParser } from "../src/research/immutable-read-json";

describe("same-snapshot immutable read validation", () => {
  function setup() {
    const schema = z.object({ run: z.string(), facts: z.array(z.object({ value: z.number() })) }).strict();
    const validate = vi.spyOn(schema, "safeParse");
    return { parse: immutableReadJsonParser(schema), validate };
  }
  it("validates a shared DB JSON object once and freezes source and parsed nested facts", () => {
    const { parse, validate } = setup();
    const raw = { run: "run_a", facts: [{ value: 1 }] };
    const first = parse(raw);
    expect(parse(raw)).toBe(first);
    expect(validate).toHaveBeenCalledTimes(1);
    expect(Object.isFrozen(raw.facts[0])).toBe(true);
    expect(Object.isFrozen(first?.facts[0])).toBe(true);
    expect(() => { raw.facts[0]!.value = 2; }).toThrow();
    expect(() => { first!.facts[0]!.value = 2; }).toThrow();
  });
  it("does not trust a new equal-looking or altered snapshot", () => {
    const { parse, validate } = setup();
    const first = parse({ run: "run_a", facts: [{ value: 1 }] });
    expect(parse({ run: "run_a", facts: [{ value: 1 }] })).not.toBe(first);
    expect(parse({ run: "run_b", facts: [{ value: 2 }] })?.run).toBe("run_b");
    expect(validate).toHaveBeenCalledTimes(3);
  });
  it("also freezes nested facts when a caller froze only the outer object", () => {
    const { parse } = setup();
    const raw = Object.freeze({ run: "run_a", facts: [{ value: 1 }] });
    expect(parse(raw)?.run).toBe("run_a");
    expect(() => { raw.facts[0]!.value = 2; }).toThrow();
  });
  it("freezes immutable shared projection arrays without changing values", () => {
    const raw = { facts: [{ value: "0.000001" }], absence: null };
    expect(freezeReadValue(raw)).toBe(raw);
    expect(raw).toEqual({ facts: [{ value: "0.000001" }], absence: null });
    expect(() => raw.facts.push({ value: "1" })).toThrow();
  });
  it("retains typed absence for malformed facts; a new valid object still validates", () => {
    const { parse, validate } = setup();
    const bad = { run: "run_a", facts: [{ value: "wrong" }] };
    expect(parse(bad)).toBeNull();
    expect(parse(bad)).toBeNull();
    expect(parse({ run: "run_a", facts: [{ value: 1 }] })).not.toBeNull();
    expect(validate).toHaveBeenCalledTimes(2);
  });
  it("never caches strings or accepts primitives, arrays, missing or malformed JSON", () => {
    const { parse, validate } = setup();
    const text = JSON.stringify({ run: "run_a", facts: [] });
    expect(parse(text)).toEqual(parse(text));
    expect(validate).toHaveBeenCalledTimes(2);
    for (const raw of [null, undefined, [], 1, false, "no-json", "null", "[]"]) {
      expect(parse(raw)).toBeNull();
    }
  });
});
