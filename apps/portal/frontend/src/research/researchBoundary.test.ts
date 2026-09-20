/**
 * Research surface boundary — negative contract.
 *
 * P05's handoff states the browser never receives artifact storage paths, raw
 * relation cursors, HMAC keys, lease epochs, worker identities or database
 * locators. The first implementation asserted that inside `artifacts.ts` only,
 * and the neighbouring `scheduler.ts` then typed and rendered a `leaseEpoch`
 * anyway. A guard scoped to one file is not a boundary.
 *
 * So this file sweeps the whole Research surface — every module and every
 * component — rather than any single one, and the browser probe makes the same
 * assertion against the rendered DOM, because a module can be clean while a
 * server-supplied string still puts an internal identifier on screen.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const DIR = join(process.cwd(), "src", "research");

/** Every source file on the Research surface, tests excluded. */
const SOURCES = readdirSync(DIR)
  .filter((f) => /\.tsx?$/.test(f) && !f.includes(".test."))
  .map((f) => ({ name: f, text: readFileSync(join(DIR, f), "utf8") }));

/** Code only: the prohibitions are named in prose, which must not trip them. */
function codeOf(text: string): string {
  return text
    .split("\n")
    .filter((line) => {
      const t = line.trimStart();
      return !t.startsWith("*") && !t.startsWith("//") && !t.startsWith("/*");
    })
    .join("\n");
}

const FORBIDDEN: [string, RegExp][] = [
  ["lease epoch", /lease[_ ]?epoch/i],
  ["worker identity", /worker[_ ]?(id|identity|pid|host|name)\b/i],
  ["work digest", /work[_ ]?digest/i],
  ["scheduler credential", /\b(hmac|secret|credential|api[_ ]?key|bearer)\b/i],
  ["storage locator", /\/var\/|\/srv\/|file:\/\/|s3:\/\/|\.parquet|postgres(ql)?:\/\//i],
  ["direct source access", /\bfetch\s*\(|XMLHttpRequest|EventSource|WebSocket|\bnats\b/i],
  ["digest computation", /createHash|subtle\.digest|sha256\s*\(/i],
];

describe("no internal identifier or direct source access on the Research surface", () => {
  it("sweeps every Research module, not just one", () => {
    // If this list shrinks silently, the sweep stops meaning anything.
    expect(SOURCES.length).toBeGreaterThanOrEqual(8);
  });

  for (const [label, pattern] of FORBIDDEN) {
    it(`contains no ${label}`, () => {
      const offenders = SOURCES.filter((f) => pattern.test(codeOf(f.text))).map((f) => f.name);
      expect(offenders, `${label} found in: ${offenders.join(", ")}`).toEqual([]);
    });
  }

  it("types no attempt field beyond ordinal, state and message", async () => {
    const { RESEARCH_JOB_STATES } = await import("./scheduler");
    expect(RESEARCH_JOB_STATES.length).toBe(8);
    const scheduler = SOURCES.find((f) => f.name === "scheduler.ts");
    const attempt = /export interface WorkerAttempt \{([\s\S]*?)\n\}/.exec(scheduler!.text);
    expect(attempt).not.toBeNull();
    const fields = [...attempt![1].matchAll(/^\s{2}(\w+)\??:/gm)].map((m) => m[1]).sort();
    expect(fields).toEqual(["message", "ordinal", "state"]);
  });
});
