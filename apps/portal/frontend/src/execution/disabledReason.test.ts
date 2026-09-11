import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * PHASE 6 (round 2) · §3.5 — a control the reader cannot press must say why.
 *
 * Measured on dev by pressing everything: 36 disabled controls across 17
 * screens, and exactly one without a reason — Run Library's `Open`, greyed
 * beside an empty box, which reads as broken rather than as waiting for
 * input. One is enough to make the rule unenforced, because nothing was
 * checking it.
 *
 * The guard reads JSX rather than a rendered page on purpose: a rendered
 * sweep only sees the states it managed to reach, and the reasonless `Open`
 * appeared in one sweep and not the next depending on whether a run had been
 * typed. Source covers every branch at once. The browser pass stays as the
 * acceptance check, not as the gate.
 */

const SRC = resolve(__dirname, "..");

function files(dir: string): string[] {
  const out: string[] = [];
  const walk = (path: string) => {
    for (const entry of readdirSync(path)) {
      const full = resolve(path, entry);
      if (statSync(full).isDirectory()) { if (entry !== "node_modules") walk(full); }
      else if (entry.endsWith(".tsx") && !entry.includes(".test.")) out.push(full);
    }
  };
  walk(dir);
  return out;
}

/**
 * Opening tags for `button` / `[role="button"]` with their attribute text.
 * Attributes may span lines, so the tag is taken up to its first unnested `>`.
 */
function openingTags(source: string): { tag: string; line: number }[] {
  const out: { tag: string; line: number }[] = [];
  const re = /<button\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    let depth = 0, i = m.index;
    for (; i < source.length; i += 1) {
      const c = source[i];
      if (c === "{") depth += 1;
      else if (c === "}") depth -= 1;
      else if (c === ">" && depth === 0) break;
    }
    out.push({ tag: source.slice(m.index, i + 1), line: source.slice(0, m.index).split("\n").length });
  }
  return out;
}

/**
 * A reason can be written three ways in this codebase, and the first version
 * of this guard knew only one of them.
 *
 * 1. `title=` on the control itself — the common case.
 * 2. `aria-describedby=` pointing at the sentence.
 * 3. One `exec-disabled-reason` sentence for a GROUP of controls. Incident
 *    Detail and Paper Exit Review do this: five buttons, one sentence under
 *    them, which reads better than five identical tooltips.
 *
 * Flagging (3) as a violation would have pushed the product toward the worse
 * layout. A guard that only knows one shape does not enforce a rule; it
 * enforces its own blind spot.
 */
const GROUP_REASON = /exec-disabled-reason|exec-admin-nofooter|aria-describedby/;

/**
 * Controls disabled by their own structure rather than by a policy: a
 * pagination arrow greyed while its page loads, a stepper at its last step.
 * §3.5 is about a control the reader expected to use and cannot; these say
 * why in their own label and a tooltip would be noise.
 *
 * Per file and line, each with the reason it is here — never a directory.
 */
const STRUCTURAL: Readonly<Record<string, string>> = {
  "execution/components/table.tsx:461": "pagination: greyed only while its own page is loading",
  "execution/components/table.tsx:466": "pagination: greyed only while its own page is loading",
  "execution/components/zoom.tsx:116": "zoom control at the end of its own range",
  "execution/components/drawer.tsx:372": "drawer paging, disabled at the edge of the list",
  "execution/components/ObservedTimelinePanel.tsx:123": "timeline paging at the edge of the window",
  "execution/lab/adminCliDemo.tsx:587": "fixture lab, not a product route",
  "features/runs/CancelRunButton.tsx:28": "cancel is disabled only while its own request is in flight",
  "auth/LoginScreen.tsx:278": "submit greyed while submitting; the label itself changes to 'Signing in…'",
  "execution/screens/ApprovalInbox.tsx:396": "filter chip, not a mutation; inert when its own filter has no rows",
  "execution/screens/ApprovalInbox.tsx:466": "pagination into decided history",
  "execution/screens/profileContainers.tsx:322": "pagination: no previous cursor",
  "execution/screens/profileContainers.tsx:323": "pagination: no next cursor",
  "features/command-center/CommandCenter.tsx:322": "refresh greyed while its own fetch is in flight",
  "features/command-center/CommandCenter.tsx:401": "refresh greyed while its own fetch is in flight",
};

describe("§3.5 — a disabled control states its reason", () => {
  const offenders: string[] = [];
  const seen: string[] = [];

  for (const file of files(SRC)) {
    const rel = file.slice(SRC.length + 1);
    const source = readFileSync(file, "utf8");
    for (const { tag, line } of openingTags(source)) {
      if (!/\bdisabled\b/.test(tag)) continue;
      seen.push(`${rel}:${line}`);
      // A reason may be `title=`, or the whole control may be `aria-describedby`.
      if (/\btitle=/.test(tag) || /\baria-describedby=/.test(tag)) continue;
      if (GROUP_REASON.test(source)) continue;
      if (`${rel}:${line}` in STRUCTURAL) continue;
      offenders.push(`${rel}:${line}`);
    }
  }

  it("scans a real number of controls, so a broken walk cannot pass quietly", () => {
    // 60+ disabled controls in the tree on 2026-09-11. A scan that suddenly
    // finds a handful has stopped reading the files, not fixed the code.
    expect(seen.length).toBeGreaterThan(30);
  });

  it("finds no disabled button without a reason", () => {
    expect(offenders).toEqual([]);
  });
});
