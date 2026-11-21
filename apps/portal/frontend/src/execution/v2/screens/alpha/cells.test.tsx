/**
 * The cells every Alpha 360 table prints figures through: exact decimals, or
 * the words. L3 negatives from the testkit: a value the boundary refuses never
 * reaches the screen, and never becomes a zero.
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { decimalCases } from "../../testkit/negative";
import { At, Dec, Na } from "./cells";

afterEach(cleanup);

const text = (node: React.ReactNode) => render(<>{node}</>).container.textContent ?? "";

describe("Dec", () => {
  it("prints the published string through formatExact, with its unit and sign", () => {
    expect(text(<Dec value="1120.80" currency="USDT" signed />)).toBe("+1,120.80 USDT");
    expect(text(<Dec value="-84.20" signed />)).toBe("-84.20");
    expect(text(<Dec value="0.91" unit="qty" />)).toBe("0.91");
    expect(text(<Dec value="123456789.1234567891" />)).toContain("123,456,789.12");
  });

  it("carries the exact original for copy and hover", () => {
    const { container } = render(<Dec value="67200.50" />);
    expect(container.querySelector("[data-full]")!.getAttribute("data-full")).toBe("67200.50");
  });

  it("null and undefined are Not available, with the reason when one is given", () => {
    expect(text(<Dec value={null} />)).toBe("Not available");
    expect(text(<Dec value={undefined} why="Not marked" />)).toBe("Not availableNot marked");
  });

  it("a published zero is a zero, and not the same as an absence", () => {
    expect(text(<Dec value="0" />)).toBe("0.00");
    expect(text(<Dec value={null} />)).toBe("Not available");
  });

  const cases = decimalCases({ v: "1" }, ["v"]).filter((c) => c.category !== "huge-string");
  it.each(cases.map((c) => [c.name, (c.value as { v: unknown }).v, c.probe] as const))("refuses %s", (_name, value, probe) => {
    const shown = text(<Dec value={value as string} />);
    expect(shown).toBe("Not availableUnreadable value");
    if (probe !== null) expect(shown).not.toContain(probe);
  });
});

describe("At", () => {
  it("prints an ISO instant in the V2 house style, UTC whatever the browser's zone", () => {
    expect(text(<At iso="2026-10-17T09:14:30.000Z" />)).toBe("17 Oct 09:14Z");
  });
  it("absence and unreadable instants are words", () => {
    expect(text(<At iso={null} />)).toBe("Not available");
    expect(text(<At iso="yesterday" />)).toBe("Not availableUnreadable time");
  });
});

describe("Na", () => {
  it("is the one absence word", () => expect(text(<Na />)).toBe("Not available"));
});
