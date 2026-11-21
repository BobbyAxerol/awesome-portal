/**
 * Incremental splitter of a `text/event-stream` body into event blocks (ELP2-09 Fleet STREAM transport, FIXTURE_LAB evidence only).
 *
 * It does the one job a byte stream needs before the strict wire reader can run: cut the text at the blank line, however the
 * chunks fall (a block split across three chunks, three blocks in one chunk). It does not read fields or JSON: the block goes to
 * `readFleetSseBlock` unchanged, so there is exactly one place that decides what a block may contain.
 *
 * - line ends: `\r\n` and a lone `\r` read as `\n` (the SSE grammar allows all three; the server writes `\n`);
 * - empty blocks (an extra blank line) are not events and are skipped, never passed on;
 * - bounded: a block that has not ended within `maxBlockChars` makes the splitter `overflowed`; it keeps nothing after that,
 *   so a peer that never sends a blank line cannot grow the buffer.
 */
export interface SseSplitter {
  /** Feed decoded text; returns the blocks completed by it, each ending with `\n\n`. Empty once overflowed. */
  push(text: string): string[];
  /** True once a block outgrew the bound. The splitter is then dead: the caller drops the connection. */
  overflowed(): boolean;
  /** Characters held for an unfinished block (a test reads this to prove the bound). */
  pending(): number;
}

export function createSseSplitter(maxBlockChars: number): SseSplitter {
  let buffer = "";
  let carriedCr = false;
  let dead = false;
  return {
    push(text) {
      if (dead) return [];
      let chunk = text;
      // A `\r` at the end of the previous chunk may be the first half of `\r\n`.
      if (carriedCr) {
        chunk = chunk.startsWith("\n") ? chunk.slice(1) : chunk;
        carriedCr = false;
      }
      if (chunk.endsWith("\r")) carriedCr = true;
      buffer += chunk.replace(/\r\n?/g, "\n");
      const blocks: string[] = [];
      for (;;) {
        // Blank lines before a block are not part of it.
        buffer = buffer.replace(/^\n+/, "");
        const end = buffer.indexOf("\n\n");
        if (end < 0) break;
        const block = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        if (block.length > maxBlockChars) {
          dead = true;
          buffer = "";
          return [];
        }
        if (block.length > 0) blocks.push(`${block}\n\n`);
      }
      if (buffer.length > maxBlockChars) {
        dead = true;
        buffer = "";
      }
      return blocks;
    },
    overflowed: () => dead,
    pending: () => buffer.length,
  };
}
