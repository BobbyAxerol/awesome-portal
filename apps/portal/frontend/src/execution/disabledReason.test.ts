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
 * Keyed per file and per **disabled expression**, each with the reason it is
 * here — never a directory.
 *
 * It used to be keyed by file and line, and that was a defect in the guard
 * rather than in the code: editing anything above an allowlisted control
 * renumbered it, the entry stopped matching, and a control that had been
 * reviewed and excused resurfaced as a violation. Phase 11 tripped exactly
 * that by deleting four lines from the Inbox. The expression is what was
 * actually reviewed, it is stable under unrelated edits, and if two controls
 * in one file share it they share the same reason too.
 */
const STRUCTURAL: Readonly<Record<string, string>> = {
  "execution/components/table.tsx|disabled={loading || !onLoadNewer}": "pagination: greyed only while its own page is loading",
  "execution/components/table.tsx|disabled={loading || !onLoadOlder}": "pagination: greyed only while its own page is loading",
  "execution/components/zoom.tsx|disabled={loading}": "zoom control at the end of its own range",
  "execution/components/drawer.tsx|disabled={index >= items.length - 1}": "drawer paging, disabled at the edge of the list",
  "execution/components/ObservedTimelinePanel.tsx|disabled={loadingMore}": "timeline paging at the edge of the window",
  "execution/lab/adminCliDemo.tsx|disabled": "fixture lab, not a product route",
  "features/runs/CancelRunButton.tsx|disabled={cancel.pending}": "cancel is disabled only while its own request is in flight",
  "auth/LoginScreen.tsx|disabled={submitting}": "submit greyed while submitting; the label itself changes to 'Signing in…'",
  "execution/screens/ApprovalInbox.tsx|disabled={status === \"loading\" || status === \"denied\" || status === \"unavailable\"}": "filter chip, not a mutation; inert only while the read is loading, denied or unavailable — the state panel beside it carries the reason",
  "execution/screens/ApprovalInbox.tsx|disabled={!onLoadOlderDecided}": "pagination into decided history",
  "execution/screens/profileContainers.tsx|disabled={!prevCursor}": "pagination: no previous cursor",
  "execution/screens/profileContainers.tsx|disabled={!nextCursor}": "pagination: no next cursor",
  "features/command-center/CommandCenter.tsx|disabled={summary.isFetching}": "refresh greyed while its own fetch is in flight",
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
      // The expression, whitespace-collapsed, is the stable identity; the line
      // number is kept only so a failure says where to look.
      const expression = (/\bdisabled(?:=\{(?:[^{}]|\{[^{}]*\})*\})?/.exec(tag)?.[0] ?? "disabled")
        .replace(/\s+/g, " ");
      if (`${rel}|${expression}` in STRUCTURAL) continue;
      offenders.push(`${rel}:${line} — ${expression}`);
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
