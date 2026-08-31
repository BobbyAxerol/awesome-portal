/**
 * N29-FE-01 §8 — the product/fixture boundary gate.
 *
 * Walks the real import graph from the product entry (`ExecutionPreviewRoute`)
 * and fails on any reachable fixture producer: `createFixtureApi`,
 * `CC_FIXTURES`, or an import ending in `.fixtures` / `.smoke`. A grep over
 * one file is not enough — the historical leak was transitive through screen
 * and preview-controller modules, which is exactly what a graph walk catches.
 *
 * Allowed by design: `*.test.ts[x]` (not part of the graph), the fixture lab
 * (`Fixtures.tsx`, mounted only on the dev route), and presentation-only
 * modules that carry no business facts.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "..");
const ENTRY = resolve(__dirname, "ExecutionPreviewRoute.tsx");

// Value imports only: `import type` edges are erased at build time and carry
// no producer — the demo VALUES must arrive through props from the lab.
const IMPORT_RE = /^import\s+(?!type\b)[^;]*?from\s+"(\.{1,2}\/[^"]+)";?$/gm;
const EXPORT_RE = /^export\s+(?!type\b)[^;]*?from\s+"(\.{1,2}\/[^"]+)";?$/gm;

function resolveModule(fromFile: string, spec: string): string | null {
  const base = resolve(dirname(fromFile), spec);
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (existsSync(candidate) && !candidate.endsWith("/")) {
      try {
        readFileSync(candidate, "utf8");
        return candidate;
      } catch {
        /* directory or unreadable — try next */
      }
    }
  }
  return null;
}

function walk(): { visited: Set<string>; offences: string[] } {
  const visited = new Set<string>();
  const offences: string[] = [];
  const queue = [ENTRY];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (visited.has(file)) continue;
    visited.add(file);
    const source = readFileSync(file, "utf8");
    const rel = file.slice(ROOT.length + 1);
    if (/\bcreateFixtureApi\b/.test(source) && !file.endsWith("fixtureApi.ts")) {
      offences.push(`${rel}: reaches createFixtureApi`);
    }
    if (/\bCC_FIXTURES\b/.test(source)) offences.push(`${rel}: reaches CC_FIXTURES`);
    for (const match of [...source.matchAll(IMPORT_RE), ...source.matchAll(EXPORT_RE)]) {
      const spec = match[1];
      if (/\.(fixtures|smoke)$/.test(spec)) {
        offences.push(`${rel}: imports fixture producer "${spec}"`);
        continue; // named, not walked — the offence is the edge itself
      }
      const resolved = resolveModule(file, spec);
      if (!resolved) continue;
      if (/\.(fixtures|smoke)\.(ts|tsx)$/.test(resolved)) {
        offences.push(`${rel}: imports fixture producer "${spec}"`);
        continue;
      }
      // The lab is not product; do not walk into it even if referenced.
      if (resolved.endsWith("Fixtures.tsx")) continue;
      queue.push(resolved);
    }
  }
  return { visited, offences };
}

describe("product/fixture boundary (N29-FE-01 §8)", () => {
  it("no fixture producer is reachable from the product route graph", () => {
    const { visited, offences } = walk();
    // Sanity: the walk really is a graph walk, not a one-file grep.
    expect(visited.size).toBeGreaterThan(30);
    expect([...new Set(offences)].sort()).toEqual([]);
  });
});
