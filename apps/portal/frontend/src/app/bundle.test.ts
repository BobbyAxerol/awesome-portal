/**
 * Entry-bundle budget.
 *
 * The Command Center renders a proportion bar, two summary cards and a list. It
 * was shipping 346 KB gzip of entry JavaScript before first paint, because a
 * static import of the QuantBT and Planning modules put ECharts, the embedded
 * Task Board and mermaid's entry into the same chunk. Splitting those two routes
 * brought the entry graph to ~91 KB gzip.
 *
 * A budget is the only thing that keeps that from creeping back: the regression is
 * one careless static import away, and nothing else in the suite would notice.
 * The test reads the built output, so it only runs where `dist/` exists — and it
 * says so loudly rather than passing vacuously when it does not.
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const DIST = join(__dirname, "../../dist");
const ASSETS = join(DIST, "assets");

/** Gzipped size in KB of one built asset. */
function gzipKb(file: string): number {
  const bytes = execSync(`gzip -c ${JSON.stringify(join(ASSETS, file))} | wc -c`, {
    encoding: "utf8",
  });
  return Number.parseInt(bytes.trim(), 10) / 1024;
}

/** The scripts `index.html` loads eagerly — everything before first paint. */
function entryScripts(): string[] {
  const html = readFileSync(join(DIST, "index.html"), "utf8");
  return Array.from(html.matchAll(/assets\/([^"']+\.js)/g)).map((match) => match[1]);
}

const built = existsSync(join(DIST, "index.html"));

describe.skipIf(!built)("entry bundle budget", () => {
  it("keeps the eager entry graph under 140 KB gzip", () => {
    const total = entryScripts().reduce((sum, file) => sum + gzipKb(file), 0);
    // Headroom over the measured ~91 KB, but far below the 346 KB it replaced.
    expect(total, `entry graph is ${total.toFixed(0)} KB gzip`).toBeLessThan(140);
  });

  it("keeps ECharts out of the entry graph", () => {
    // `dataZoom` is an ECharts-only identifier that survives minification as a
    // string key, so its presence names the library without matching our code.
    const eager = entryScripts()
      .map((file) => readFileSync(join(ASSETS, file), "utf8"))
      .join("");
    expect(eager.includes("dataZoom")).toBe(false);
  });

  it("emits the split module chunks, so the routes really are separate", () => {
    const files = readdirSync(ASSETS);
    expect(files.some((file) => file.startsWith("QuantBTModule-"))).toBe(true);
    expect(files.some((file) => file.startsWith("PlanningModule-"))).toBe(true);
  });
});

describe.skipIf(built)("entry bundle budget (skipped)", () => {
  it("needs a build first: run npm run build before this gate means anything", () => {
    expect(built).toBe(false);
  });
});
