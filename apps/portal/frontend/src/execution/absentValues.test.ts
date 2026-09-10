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
        // Both shapes: `x ?? "—"` and `x === null ? "—" : …`. The second is how
        // one survived phase 2 — the scan only knew the first.
        if (/(\?\?|\?)\s*"(—|N\/A|n\/a)"/.test(line)) offenders.push(`${file}:${index + 1}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("keeps every allowlisted file's dash to the one kind it documents", () => {
    /*
     * An allowlist entry is a licence for ONE line, not for the file.
     *
     * It was a file-level pass, and that is how `OperationsQueue.tsx` kept a
     * second dash — the queue's KPI strip printing "—" for a count the server
     * had not published — hidden behind the entry that covers its phase
     * glyph. One line each, and a second has to be argued for here.
     */
    for (const [file, reason] of Object.entries(ALLOWED)) {
      const body = readFileSync(join(root, file), "utf8");
      const hits = body.split("\n").filter((line) => /"—"|>—</.test(line)).length;
      expect(hits, `${file} (${reason})`).toBeLessThanOrEqual(file === "screens/PortfolioThreeSixty.tsx" ? 2 : 1);
    }
  });
});

/**
 * A dash written straight into JSX, or returned from a helper, is the same lie
 * as `?? "—"` — and neither shape was scanned until the Accounts screen was
 * caught rendering 86 of them, two per row, under a footnote nobody follows.
 *
 * A dash may stay only when it is a mark rather than a value: a separator in a
 * heading, or a grid glyph whose meaning is in its `title`.
 */
const PROSE_SEPARATORS: Readonly<Record<string, string>> = {
  "screens/GateLiveReview.tsx": "heading separator between the screen name and its subject",
  "screens/GateR1Review.tsx": "heading separator between the screen name and its subject",
  "screens/GateR2Review.tsx": "heading separator between the screen name and its subject",
  "screens/NewApprovalRequest.tsx": "heading separator between the screen name and its subject",
  "screens/WaiversRegister.tsx": "heading separator between the screen name and its subject",
  "screens/PaperExitReview.tsx": "separator between the review id and its subject",
  "idLinks.tsx": "the dash appears inside a comment arguing against using one",
  "components/PortfolioOverview.tsx": "styles a correlation cell whose dash the heatmap itself produces, with the reason in that cell's own label",
};

/**
 * A file allowed more than one line, and why. The default is one: an allowlist
 * that covers a file is how a real dash hid behind a legitimate one in phase 2.
 */
const PROSE_LINE_BUDGET: Readonly<Record<string, number>> = {
  // Two cells compare against the dash the correlation data itself carries —
  // the matrix row and the benchmark column. Neither renders one.
  "components/PortfolioOverview.tsx": 2,
};

describe("no dash is written straight into JSX either", () => {
  const root = __dirname;
  const files = sourceFiles(root);

  it("finds every remaining dash either allowlisted, prose, or carrying a title", () => {
    const offenders: string[] = [];
    for (const file of files) {
      if (file in ALLOWED || file in PROSE_SEPARATORS) continue;
      const body = readFileSync(join(root, file), "utf8");
      for (const [index, line] of body.split("\n").entries()) {
        if (!/"—"|>—</.test(line)) continue;
        // A glyph keeps its dash when the same element says what it means.
        if (/title=/.test(line)) continue;
        offenders.push(`${file}:${index + 1} → ${line.trim().slice(0, 70)}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("keeps a prose allowlist to one line each, so a value cannot hide behind a heading", () => {
    for (const [file, reason] of Object.entries(PROSE_SEPARATORS)) {
      const body = readFileSync(join(root, file), "utf8");
      const hits = body.split("\n").filter((line) => /"—"|>—</.test(line)).length;
      expect(hits, `${file} (${reason})`).toBeLessThanOrEqual(PROSE_LINE_BUDGET[file] ?? 1);
    }
  });
});
