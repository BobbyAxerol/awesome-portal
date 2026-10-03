/**
 * W4A — the one humaniser for server tokens (replaces `humanToken` and the
 * inline `.toLowerCase().replace(/_/g, " ")` copies).
 *
 * `walk_forward_oos` -> `walk-forward OOS`; `COMPLETED` -> `completed`.
 * Only a bare enum token is rewritten; a sentence, an id or any string with
 * punctuation is returned as sent, so the screen never mangles prose.
 */

const ACRONYMS = new Set(["oos", "is", "utc", "wfo", "rc"]);

/** Whole-token phrases whose reading is not a plain word swap. Keys are lower case. */
const PHRASES: Record<string, string> = {
  not_causal_multi_fold_global_calibration: "not causal · multi-fold · global calibration",
  three_window_decay: "three-window",
  three_window_current: "three-window",
  per_fold_causal: "per-fold causal",
};

/** Adjacent words that read as one hyphenated compound. */
const COMPOUNDS: ReadonlyArray<readonly [string, string]> = [
  ["walk", "forward"],
  ["multi", "fold"],
  ["per", "fold"],
  ["three", "window"],
  ["in", "sample"],
];

const TOKEN = /^[A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)*$/;

export function humanise(token: string | null | undefined): string {
  if (token === null || token === undefined) return "";
  const text = String(token);
  if (text === "") return "";
  /* A bare lower-case word is already a word; mixed case without `_` (an id, a name) is left alone. */
  if (!TOKEN.test(text)) return text;
  if (!text.includes("_") && text !== text.toUpperCase()) return text;
  const phrase = PHRASES[text.toLowerCase()];
  if (phrase) return phrase;

  const words = text.toLowerCase().split("_");
  const out: string[] = [];
  for (let i = 0; i < words.length; i += 1) {
    const word = words[i];
    const next = words[i + 1];
    if (next !== undefined && COMPOUNDS.some(([a, b]) => a === word && b === next)) {
      out.push(`${word}-${next}`);
      i += 1;
      continue;
    }
    out.push(ACRONYMS.has(word) && !(word === "is" && out.length === 0) ? word.toUpperCase() : word);
  }
  return out.join(" ");
}

/** Ids and registry names that are identifiers, not words: never rewritten inside a sentence. */
const IDENTIFIER_PREFIX = /^(?:rrun|ratt|rc|att|apr|av|er|ar|study|trial)_/;
const EMBEDDED_TOKEN = /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b|\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g;

/**
 * `humanise` for a string that carries enum tokens inside a sentence
 * (`mode_1_decay × global · numba_units_v2`): each snake_case / UPPER_SNAKE token is read as
 * words; the rest of the text is returned as sent. Callers keep the raw string in `title`.
 */
export function humaniseTokens(text: string | null | undefined): string {
  if (text === null || text === undefined) return "";
  return String(text).replace(EMBEDDED_TOKEN, (token) => (IDENTIFIER_PREFIX.test(token) ? token : humanise(token)));
}
