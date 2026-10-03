import { describe, expect, it, vi } from "vitest";
import { ExactJsonCalculationMemo } from "../src/research/exact-json-calculation-memo";
import { memoizedResearchJsonDigest } from "../src/research/memoized-json-digest";
import { sha256ResearchJson } from "../src/research/preflight.service";

describe("bounded exact-current JSON calculation memo (not source authority)", () => {
  it("shares pure math across identical current bytes, not just the advertised identity", () => {
    const memo = new ExactJsonCalculationMemo<string>();
    const first = vi.fn(() => "first-verified");
    expect(memo.calculate({ run: "r1", digest: "same", payload: { value: 1 } }, first)).toBe("first-verified");
    expect(memo.calculate({ run: "r1", digest: "same", payload: { value: 1 } }, first)).toBe("first-verified");
    expect(first).toHaveBeenCalledTimes(1);
    const changed = vi.fn(() => { throw new Error("CORRUPT_CURRENT_BYTES"); });
    expect(() => memo.calculate({ run: "r1", digest: "same", payload: { value: 2 } }, changed)).toThrow("CORRUPT_CURRENT_BYTES");
    expect(() => memo.calculate({ run: "r1", digest: "same", payload: { value: 2 } }, changed)).toThrow("CORRUPT_CURRENT_BYTES");
    expect(changed).toHaveBeenCalledTimes(2);
  });
  it("never shares calculation bindings across different run/revision/annotation/proof facts", () => {
    const memo = new ExactJsonCalculationMemo<number>();
    let n = 0;
    for (const input of [{ run: "r1", revision: 1, annotation: "x", proof: null },
      { run: "r2", revision: 1, annotation: "x", proof: null },
      { run: "r1", revision: 2, annotation: "x", proof: null },
      { run: "r1", revision: 1, annotation: "changed", proof: null },
      { run: "r1", revision: 1, annotation: "x", proof: "new-verified-child" }])
      expect(memo.calculate(input, () => ++n)).toBe(n);
    expect(n).toBe(5);
  });
  it("retains no caller-owned mutable result and freezes shared output", () => {
    const memo = new ExactJsonCalculationMemo<{ nested: number[] }>();
    const result = { nested: [1] };
    const cached = memo.calculate("same", () => result);
    result.nested[0] = 2;
    expect(Object.isFrozen(result)).toBe(false);
    expect(Object.isFrozen(cached.nested)).toBe(true);
    expect(memo.calculate("same", () => ({ nested: [3] }))).toEqual({ nested: [1] });
    expect(() => cached.nested.push(4)).toThrow();
  });
  it("does not trust a caller's shallow freeze or mutable getter as immutable JSON", () => {
    const memo = new ExactJsonCalculationMemo<number>();
    let observed = 1;
    const input = Object.freeze({ get value() { return observed; } });
    expect(memo.calculate(input, () => observed)).toBe(1);
    observed = 2;
    expect(memo.calculate(input, () => observed)).toBe(2);
  });
  it("keeps fresh database JSON text distinct from a parsed object", () => {
    const memo = new ExactJsonCalculationMemo<string>();
    expect(memo.calculate('{"value":1}', () => "string")).toBe("string");
    expect(memo.calculate({ value: 1 }, () => "object")).toBe("object");
    expect(memo.calculate('{"value":1}', () => "unexpected")).toBe("string");
  });
  it("private frozen-root encoding is byte-identical to fresh native JSON", () => {
    const inner = new ExactJsonCalculationMemo<Record<string, unknown>>();
    const object = JSON.parse('{"2":"quoted\\\"","1":[null,-0,1e-9,"θ\\n"],"__proto__":{"literal":true}}');
    const frozen = inner.calculate("derived", () => object);
    const outer = new ExactJsonCalculationMemo<number>(), compute = vi.fn(() => 7);
    expect(outer.calculate({ nested: frozen, extra: [true, false] }, compute)).toBe(7);
    expect(outer.calculate({ nested: JSON.parse(JSON.stringify(object)), extra: [true, false] }, compute)).toBe(7);
    expect(compute).toHaveBeenCalledOnce();
  });
  it("expires from the original insert, not from reads", () => {
    let now = 0, n = 0;
    const memo = new ExactJsonCalculationMemo<number>(1024, 2, 10, () => now);
    expect(memo.calculate("x", () => ++n)).toBe(1);
    now = 9; expect(memo.calculate("x", () => ++n)).toBe(1);
    now = 10; expect(memo.calculate("x", () => ++n)).toBe(2);
  });
  it("enforces entry and byte limits with bounded LRU eviction", () => {
    const memo = new ExactJsonCalculationMemo<string>(256, 2);
    memo.calculate("a", () => "a"); memo.calculate("b", () => "b");
    memo.calculate("a", () => "unreachable"); memo.calculate("c", () => "c");
    const replaced = vi.fn(() => "b-new");
    expect(memo.calculate("b", replaced)).toBe("b-new"); expect(replaced).toHaveBeenCalledOnce();
    for (let i = 0; i < 100; ++i) memo.calculate(i, () => "x".repeat(40));
    expect(memo.retainedEntries).toBeLessThanOrEqual(2);
    expect(memo.retainedBytes).toBeLessThanOrEqual(256);
  });
  it("does not retain oversized inputs or outputs", () => {
    const memo = new ExactJsonCalculationMemo<string>(128, 2), compute = vi.fn(() => "x".repeat(100));
    memo.calculate("a", compute); memo.calculate("a", compute);
    expect(compute).toHaveBeenCalledTimes(2); expect(memo.retainedEntries).toBe(0);
    memo.calculate("x".repeat(100), () => "small"); expect(memo.retainedBytes).toBe(0);
  });
  it.each([new Date("2026-10-03"), { value: NaN }, { value: Infinity },
    { value: undefined }, { toJSON() { return { concealed: true }; } }, Object.assign(Object.create({ inherited: true }), { x: 1 })])(
    "bypasses inputs outside plain finite JSON %#", input => {
      const memo = new ExactJsonCalculationMemo<number>(), compute = vi.fn(() => 1);
      memo.calculate(input, compute); memo.calculate(input, compute);
      expect(compute).toHaveBeenCalledTimes(2); expect(memo.retainedEntries).toBe(0);
    });
  it("cannot mistake Date/toJSON class semantics for their string representation", () => {
    const date = new Date("2026-10-03T00:00:00Z");
    expect(memoizedResearchJsonDigest({ date })).toBe(sha256ResearchJson({ date }));
    expect(memoizedResearchJsonDigest({ date: date.toJSON() })).toBe(sha256ResearchJson({ date: date.toJSON() }));
    expect(memoizedResearchJsonDigest({ date })).not.toBe(memoizedResearchJsonDigest({ date: date.toJSON() }));
  });
  it("does not introduce a new failure from unsupported toJSON encoding", () => {
    const memo = new ExactJsonCalculationMemo<number>(), compute = vi.fn(() => 7);
    const input = { toJSON() { throw new Error("NOT_JSON"); } };
    expect(memo.calculate(input, compute)).toBe(7);
    expect(memo.calculate(input, compute)).toBe(7);
    expect(compute).toHaveBeenCalledTimes(2);
  });
  it.each([0, -1, NaN, Infinity, 1.5])("refuses invalid retained-resource bound %s", limit => {
    expect(() => new ExactJsonCalculationMemo(limit)).toThrow("POSITIVE_BOUNDS");
  });
});
