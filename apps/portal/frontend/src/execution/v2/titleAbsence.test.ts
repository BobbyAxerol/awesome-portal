/**
 * RV-06 gate · a reason for an absence is never carried by a `title` alone, and every V2 screen speaks one timestamp style.
 *
 * A `title` is a hover: a keyboard or touch reader never sees it. A reason a screen gives for a missing, withheld or
 * unpublished value therefore sits behind `GapWhy` / `NaWhy` (a real button), or is printed as text. This test reads the V2
 * sources and fails on a new DOM `title=` whose expression names an absence, unless it is listed below with the reason it may
 * stay (the same sentence is printed next to it, or it is an id / label tooltip, or it explains a rule rather than an absence).
 *
 * The second half pins the timestamp family: instants are written with `formatAsOf` / `formatInstant` (`17 Oct 09:14Z`,
 * v2/boundary.ts). The one other form is the Blotter table's hi-fi short form, `shortUtc` (`17 Oct 09:58:00Z`).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = __dirname;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sources(full);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

const files = sources(ROOT).map((path) => ({ path: relative(ROOT, path), text: readFileSync(path, "utf8") }));

const TITLE = /(?<![\w.])title=(\{(?:[^{}]|\{[^{}]*\})*\}|"[^"]*")/g;
const ABSENCE = /\bwhy\b|NOT_PUBLISHED|reason|unpublished|notPublished|npText|npReason|not published|not available|unavailable|withheld|not shown|not carried|not drawn|is not|are not|cannot|did not|does not|no source|failed|missing/i;

/** `file :: title expression` -> why it may stay. Anything else with an absence in its title is a failure. */
const MAY_STAY: Readonly<Record<string, string>> = {
  "blocks/notPublished.tsx :: {`${NOT_PUBLISHED} (${id}): ${feLabel(id)}${why}${code}`}": "the shared cell: the id and reason code are in its visually hidden text; the title adds only the request label",
  "blocks/notPublished.tsx :: {`${id} · ${feLabel(id)}${why}${code}`}": "the shared cell: the id and reason code are in its visually hidden text; the title adds only the request label",
  "screens/command/DisabledOperations.tsx :: \"Each control is disabled and says why.\"": "explains the line it sits on; each control prints its own reason",
  "screens/request/NewRequestForm.tsx :: \"This run is not in the list. The server refuses a claim that is not eligible.\"": "explains a rule next to a typed field, not an absence",
  "screens/request/NewRequestForm.tsx :: \"The server refuses a typed claim that is not eligible.\"": "explains a rule next to a typed field, not an absence",
  "screens/blotter/index.tsx :: {count.exact ? undefined : \"Counted from the statuses the server listed; it does not cover every order\"}": "inside a chip that is itself a button (no nested button); the `~` before the count is the visible mark",
  "screens/blotter/index.tsx :: \"Intent and signal steps happen before the order and are not carried here.\"": "the table label of the order path; the path is read as rows",
  "screens/sandbox/Tables.tsx :: \"A plan records a refusal to promote; it does not start Canary.\"": "explains what a record means, not an absence",
  "screens/overview/index.tsx :: \"Count of alphas, from the Fleet summary. An alpha in two stages is counted in each. Alphas and deployments are different units from different reads, ": "explains a unit, not an absence",
  "screens/fleet/FleetDrawer.tsx :: {reason.code}": "the reason is the visible label; the title is its code (an id tooltip)",
  "shell/ContextBar.tsx :: {envLock.reason}": "the same reason is printed in the lock line and described by id",
};

describe("no absence reason lives only in a title", () => {
  it("reads the sources it polices", () => {
    expect(files.length).toBeGreaterThan(150);
  });

  it("finds every DOM title that names an absence either listed above or absent", () => {
    const found: string[] = [];
    for (const { path, text } of files) {
      text.split("\n").forEach((line) => {
        for (const m of line.matchAll(TITLE)) {
          const before = line.slice(0, m.index);
          const tag = [...before.matchAll(/<([A-Za-z][\w.]*)[^<>]*$/g)].pop();
          // `title=` on a component is a prop (a panel heading), not a tooltip.
          if (tag !== undefined && /^[A-Z]/.test(tag[1])) continue;
          if (tag === undefined && /^\s*title=/.test(line)) continue;
          if (ABSENCE.test(m[1])) found.push(`${path} :: ${m[1].slice(0, 150)}`);
        }
      });
    }
    const listed = Object.keys(MAY_STAY);
    const unlisted = found.filter((entry) => !listed.some((key) => entry.startsWith(key.slice(0, 150))));
    expect(unlisted).toEqual([]);
    // A listed entry that no longer exists is dead weight that would hide a new one.
    const stale = listed.filter((key) => !found.some((entry) => entry.startsWith(key.slice(0, 150))));
    expect(stale).toEqual([]);
  });
});

describe("one timestamp style on the V2 screens", () => {
  it("never formats an instant with utcStamp or formatUtcEpochMs", () => {
    const offenders = files
      .filter(({ path }) => path !== "boundary.ts")
      .filter(({ text }) => /\butcStamp\(|\bformatUtcEpochMs\(|from "(?:\.\.\/)+time"/.test(text))
      .map(({ path }) => path);
    expect(offenders).toEqual([]);
  });

  it("keeps the short seconds form to the Blotter", () => {
    const offenders = files.filter(({ text }) => /\bshortUtc\(/.test(text)).map(({ path }) => path).filter((path) => !path.startsWith("screens/blotter/"));
    expect(offenders).toEqual([]);
  });
});
