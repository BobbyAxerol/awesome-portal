/**
 * A test that returns early has not passed. It has abstained.
 *
 * Six tests in `execution.test.tsx` narrowed a `Result` with
 * `if (!r.ok) return;` and asserted nothing when the call failed. TypeScript is
 * satisfied and so is the runner: a broken route, a voided cursor or a rejected
 * filter turns those tests green. One of them existed specifically to prove
 * that an unknown view yields an empty page rather than a failure — the single
 * case where "failed" and "empty" must not be confused, and the early return
 * confused them.
 *
 * The narrowing is still needed; only the silence is wrong. `throw` narrows
 * exactly as well as `return` and is red instead of absent.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function testSources(): { path: string; source: string }[] {
  const root = __dirname;
  const out: { path: string; source: string }[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/\.test\.tsx?$/.test(entry.name)) {
        out.push({ path: path.slice(root.length + 1), source: readFileSync(path, "utf8") });
      }
    }
  };
  walk(root);
  return out;
}

describe("no test abstains instead of asserting", () => {
  it("reads the test files it is meant to police", () => {
    // Without this the rule below passes by finding nothing, which is the same
    // failure mode it exists to forbid.
    const sources = testSources();
    expect(sources.length).toBeGreaterThan(20);
    expect(sources.some((s) => s.path === "execution.test.tsx")).toBe(true);
  });

  it("never narrows a Result by returning out of the test body", () => {
    const offenders: string[] = [];
    for (const { path, source } of testSources()) {
      source.split("\n").forEach((line, index) => {
        // Bare `return;` only. `return <expr>;` inside a helper closure is a
        // value, not an abstention, and is left alone.
        if (/^\s*if \(!?\w+\.ok\) return;\s*$/.test(line)) {
          offenders.push(`${path}:${index + 1} — ${line.trim()} (throw instead: it narrows the same and fails loudly)`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});
