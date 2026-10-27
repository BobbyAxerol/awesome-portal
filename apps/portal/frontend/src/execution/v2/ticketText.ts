/**
 * Ticket codes (FE-nnn, BR-EX-nn, A360-n) are for the tooltip, never for the words a reader or a screen reader gets (QA3 R1-10).
 * `ticketFree("Not published (FE-013, FE-025)")` is `"Not published"`; `ticketCodes(...)` is the codes, for a `title`.
 */
const CODE = "(?:FE-\\d{2,3}(?:/\\d{2,3})?|BR-EX-\\d+|A360-\\d+)";
const GROUP = new RegExp(`\\s*\\(\\s*${CODE}(?:\\s*[,/]\\s*${CODE})*\\s*\\)`, "g");
const BARE = new RegExp(`\\s*\\b${CODE}(?:\\s*[,/]\\s*${CODE})*`, "g");

/** The text without its ticket codes (a parenthesised list first, then any bare code). */
export function ticketFree(text: string): string {
  return text.replace(GROUP, "").replace(BARE, "").replace(/\s{2,}/g, " ").trim();
}

/** The ticket codes named in a text, in order, for a tooltip. Empty when there are none. */
export function ticketCodes(text: string): string[] {
  return text.match(new RegExp(CODE, "g")) ?? [];
}
