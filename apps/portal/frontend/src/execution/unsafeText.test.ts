/**
 * `unsafeText`: the one definition of text a server string must not smuggle onto a screen.
 * Code points are written as numbers so no invisible character sits in this source.
 */
import { describe, expect, it } from "vitest";

import { firstUnsafeCodePoint, unsafeText } from "./unsafeText";

const at = (cp: number) => `a${String.fromCodePoint(cp)}b`;

describe("unsafeText", () => {
  it.each([
    0x00, 0x08, 0x09, 0x0a, 0x0d, 0x1f, 0x7f, 0x85, 0x9f, 0xad, 0x061c, 0x180e, 0x200b, 0x200f, 0x2028, 0x202a, 0x202e, 0x2060, 0x2066, 0x2069, 0x206f,
    0xfeff, 0xfff9, 0xfffb, 0xe0001, 0xe007f, 0xd800, 0xdfff,
  ])("refuses code point %i", (cp) => {
    expect(unsafeText(at(cp))).toBe(true);
    expect(firstUnsafeCodePoint(at(cp))).toBe(cp);
  });

  it("keeps ordinary text, including accents, CJK, emoji and Vietnamese", () => {
    const combining = `e${String.fromCodePoint(0x0301)}`;
    for (const s of ["BTCUSDT", "0.0120", "Da ghi nhan", "日本語", combining, "ok 👍", " spaced "]) expect(unsafeText(s), s).toBe(false);
  });

  it("allowLayout keeps tab, line feed and carriage return legal, and nothing else", () => {
    expect(unsafeText("a\tb\nc\rd", { allowLayout: true })).toBe(false);
    expect(unsafeText("a\tb")).toBe(true);
    expect(unsafeText(at(0x0b), { allowLayout: true })).toBe(true);
    expect(unsafeText(at(0x202e), { allowLayout: true })).toBe(true);
    expect(unsafeText(at(0x00), { allowLayout: true })).toBe(true);
  });
});
