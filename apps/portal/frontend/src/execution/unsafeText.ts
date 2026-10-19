/**
 * One definition of "text a server string must not smuggle onto a screen".
 *
 * Refused: C0 and C1 controls, soft hyphen, the Arabic letter mark, the Mongolian vowel separator,
 * zero-width and direction marks, embeddings and isolates (U+200B-U+200F, U+2028-U+202E, U+2060-U+206F),
 * the BOM, interlinear annotation, the Tags block, and lone surrogates. Written as numbers so no invisible
 * character sits in this source.
 *
 * `allowLayout` keeps tab, line feed and carriage return legal, for text a person typed (a review note);
 * identifiers and table cells never allow them.
 */
const HOSTILE_RANGES: readonly (readonly [number, number])[] = [
  [0x0000, 0x0008], [0x000b, 0x000c], [0x000e, 0x001f], [0x007f, 0x009f], [0x00ad, 0x00ad], [0x061c, 0x061c], [0x180e, 0x180e],
  [0x200b, 0x200f], [0x2028, 0x202e], [0x2060, 0x206f], [0xfeff, 0xfeff], [0xfff9, 0xfffb], [0xe0000, 0xe007f], [0xd800, 0xdfff],
];
const LAYOUT: readonly number[] = [0x09, 0x0a, 0x0d];

/** The first code point of `value` that is hostile, or `null` when the text is safe. */
export function firstUnsafeCodePoint(value: string, options: { allowLayout?: boolean } = {}): number | null {
  for (const ch of value) {
    const cp = ch.codePointAt(0)!;
    if (options.allowLayout === true && LAYOUT.includes(cp)) continue;
    // Every C0 control that is not an allowed layout character is hostile.
    if (cp <= 0x1f) return cp;
    for (const [lo, hi] of HOSTILE_RANGES) if (cp >= lo && cp <= hi) return cp;
  }
  return null;
}

/** `true` when `value` carries a code point that must not reach a screen. */
export function unsafeText(value: string, options: { allowLayout?: boolean } = {}): boolean {
  return firstUnsafeCodePoint(value, options) !== null;
}
