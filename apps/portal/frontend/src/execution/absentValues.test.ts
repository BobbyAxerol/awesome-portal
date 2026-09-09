/**
 * Phase 2 · a dash never stands in for a value the source did not publish.
 *
 * Rule §3.3: an absent value is never rendered as `0`, `-` or `N/A`. The
 * screens broke it 89 times, in 28 files, and the browser found it before any
 * test did — `SESSION_STARTED_AT — — —` on Alpha 360, three columns of nothing
 * that could equally have meant zero, not applicable, or not yet known.
 *
 * This test is the thing that stops it coming back. It reads the execution
 * source and fails on a new `?? "—"` outside the allowlist below; each entry
 * in the allowlist is a dash that is NOT a value, with the reason it stays.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** A dash that decorates a word already on screen, or a grid mark with a label. */
const ALLOWED: Readonly<Record<string, string>> = {
  "screens/OperationsQueue.tsx": "phase glyph — the phase name is printed beside it",
  "screens/SandboxCertification.tsx": "evaluation glyph — the state word is printed beside it",
  "screens/IncidentDetail.tsx": "gate glyph — the gate state is printed beside it",
  "screens/PortfolioThreeSixty.tsx": "correlation heatmap cell — the reason is in the cell's label and title",
  "screens/CanaryControlRoom.tsx": "an em dash in prose, not a value",
  "screens/AlphaThreeSixty.tsx": "deployment map — a venue that runs nothing at a stage, with the caption saying so",
};

const SKIP = /\.test\.|\.smoke\.|fixtures?\.|\/lab\/|preview|demo/i;

function sourceFiles(dir: string, base = ""): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    const rel = base ? `${base}/${name}` : name;
    if (statSync(full).isDirectory()) return sourceFiles(full, rel);
    if (!/\.tsx?$/.test(name) || SKIP.test(rel)) return [];
    return [rel];
  });
}

describe("no dash stands in for an unpublished value", () => {
  const root = __dirname;
  const files = sourceFiles(root);

  it("scans a real tree, so a passing run means something", () => {
    expect(files.length).toBeGreaterThan(60);
  });

  it("finds no `?? \"—\"` outside the documented allowlist", () => {
    const offenders: string[] = [];
    for (const file of files) {
      if (file in ALLOWED) continue;
      const body = readFileSync(join(root, file), "utf8");
      for (const [index, line] of body.split("\n").entries()) {
        // `N/A` and a bare `-` are the same lie in different type. `0` is not
        // scanned here: it is a legal value, and only its *source* can say
        // whether a zero was published or invented.
        if (/\?\?\s*"(—|-|N\/A|n\/a)"/.test(line)) offenders.push(`${file}:${index + 1}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("keeps every allowlisted file's dash to the one kind it documents", () => {
    // An allowlist entry is not a licence for the whole file: each of these
    // holds exactly one such dash, and a second one has to be argued for.
    for (const [file, reason] of Object.entries(ALLOWED)) {
      const body = readFileSync(join(root, file), "utf8");
      const hits = body.split("\n").filter((line) => /"—"|>—</.test(line)).length;
      expect(hits, `${file} (${reason})`).toBeLessThanOrEqual(2);
    }
  });
});
