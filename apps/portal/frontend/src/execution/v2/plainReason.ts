/**
 * Machine codes never read as the sentence (UI review F1 / D12).
 *
 * A reason that comes from the server or from a reader carries the code that names it (`ACCOUNT_NOT_FOUND`,
 * `MANAGER_DATASET_REFUSED`, `lock="X" treated as NOT_ELIGIBLE`). The code is for support and for tests, not for the person
 * reading the screen. `plainReason` returns the same sentence with the codes taken out and, where a code is known, what the
 * reader can do about it; `codes` lists what was taken out so the caller can keep it in a `title`, a `data-code` attribute or
 * the existing "Details" disclosure. Pure; nothing is invented: a code this table does not know simply disappears from the
 * sentence (the words around it already say what happened) and stays in `codes`.
 */

/** A code is UPPER_SNAKE with at least one underscore (`FE-013`-style ticket ids are `ticketText.ts`'s). */
const CODE = "[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+";

/** What the reader can do, per code, when the sentence around it does not already say so. */
const ADVICE: Readonly<Record<string, string>> = {
  MANAGER_DATASET_REFUSED: "Try again in a moment; if it keeps failing, tell the Portal owner.",
  OPERATIONAL_READ_NOT_FOUND: "Check the id or go back to the list.",
  ACCOUNT_NOT_FOUND: "Check the id or go back to the list.",
};

/** Whole-phrase rewrites for the few sentences a reader builds around a code. */
const PHRASES: ReadonlyArray<readonly [RegExp, (match: RegExpExecArray) => string]> = [
  [new RegExp(`lock="(${CODE})" treated as (${CODE})`), () => "the server's lock reason for this request is not one this build recognises, so the request is shown as not eligible"],
];

export interface PlainReason {
  /** The sentence without machine codes. */
  text: string;
  /** The codes taken out, in order, deduplicated. */
  codes: string[];
}

const capitalise = (text: string): string => (text === "" ? text : text.charAt(0).toUpperCase() + text.slice(1));

export function plainReason(raw: string): PlainReason {
  const codes: string[] = [];
  const keep = (code: string) => { if (!codes.includes(code)) codes.push(code); };
  let text = raw;

  for (const [pattern, say] of PHRASES) {
    const hit = pattern.exec(text);
    if (hit === null) continue;
    for (const part of hit.slice(1)) if (part !== undefined) keep(part);
    text = text.replace(pattern, say(hit));
  }
  // `(CODE)`: the parenthesis was only there for the code. `(CODE: the server's own words)`: the words stay (they are the server's
  // explanation, e.g. "orders down"), the code goes.
  text = text.replace(new RegExp(`\\s*\\(\\s*(${CODE})\\s*(?:[:,]\\s*((?:[^()]|\\([^()]*\\))*))?\\)`, "g"), (_all, code: string, words: string | undefined) => {
    keep(code);
    const said = (words ?? "").trim().replace(/[.\s]+$/, "");
    return said === "" ? "" : ` (${said})`;
  });
  // `CODE: sentence` (a prefix), as in `ACCOUNT_NOT_FOUND: no account Binance-02`.
  let stripped = false;
  text = text.replace(new RegExp(`(^|[.!?]\\s+)(${CODE}):\\s+`, "g"), (_all, lead: string, code: string) => { keep(code); stripped = true; return lead; });
  // Any other bare code reads as its words (`SOURCE_GAP` -> `source gap`), and stays in `codes`.
  text = text.replace(new RegExp(`\\b${CODE}\\b`, "g"), (code) => {
    // An id that happens to be upper case (`DEP_CANARY_01`) is data, not a code: its last segment is a number.
    if (/_\d+$/.test(code)) return code;
    keep(code);
    return code.toLowerCase().replace(/_/g, " ");
  });

  text = text.replace(/\s+([.,;:])/g, "$1").replace(/\s{2,}/g, " ").trim();
  // Only a sentence that lost its `CODE:` prefix needs a new first capital; a reason that never had one stays as it was written.
  if (stripped) text = capitalise(text);
  const advice = codes.map((code) => ADVICE[code]).find((line) => line !== undefined);
  if (advice !== undefined && !text.includes(advice)) text = `${text.replace(/[.\s]*$/, "")}. ${advice}`;
  return { text, codes };
}

/** True when the text carries a machine code (`plainReason` would change it). */
export const hasMachineCode = (raw: string): boolean => new RegExp(`\\b${CODE}\\b`).test(raw);
