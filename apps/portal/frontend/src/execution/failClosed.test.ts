/**
 * One rule, checked across every reader: absence must never resolve to the
 * reassuring answer.
 *
 * This file exists because two defects survived a full suite. `commandPlan.ts`
 * read `source_side_effect_requested` with `=== true` while three other readers
 * used `!== false`, so an unreadable flag became `false` and the screen told an
 * operator that nothing had been asked of the Trading System — a claim nobody
 * made. And `deployment_resume_requested` was read both ways inside one file.
 * Neither turned a test red, because every test asserted behaviour for values
 * that were present.
 *
 * So the gate is structural rather than behavioural. For each flag it names
 * which boolean value is the DANGEROUS one and asserts the operator makes an
 * absent or malformed value land on the safe side. The polarity is not uniform
 * and cannot be: `source_side_effect_requested: true` is the dangerous value
 * and `source_status_unchanged: true` is the reassuring one, so they fail
 * closed in opposite directions.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * `dangerousValue` is the value that, if wrongly assumed, misleads an operator.
 * A reader must therefore use the operator that makes an unreadable field land
 * on the OTHER value.
 *
 *   dangerous: true   → must read `!== false`  (absent ⇒ true ⇒ warn)
 *   dangerous: false  → must read `=== true`   (absent ⇒ false ⇒ withhold)
 */
const FLAGS: Record<string, { dangerous: boolean; why: string }> = {
  // Warnings. Absent must mean "this may have happened".
  source_side_effect_requested: {
    dangerous: true,
    why: "assuming nothing reached the Trading System is the reassuring lie",
  },
  // `governance.paper-exit.v1` activation_plan. PREVIEW_ONLY by contract; the
  // reader keeps absent as false and the screen prints "none requested" — a
  // plan that DID request one must say so, so the flag is a warning too.
  // A condition whose blocking bit cannot be read must block: the register
  // exists to stop quiet defaults, and "unknown, so not blocking" is one.
  blocking: {
    dangerous: true,
    why: "an unreadable obligation must block, never wave through",
  },
  external_side_effect_requested: {
    dangerous: true,
    why: "an exit-review plan that requested an external effect must never read as inert",
  },
  runtime_activation_requested: { dangerous: true, why: "an activation may have been requested" },
  promotion_execution_requested: { dangerous: true, why: "a promotion may have executed" },
  deployment_resume_requested: { dangerous: true, why: "a resume may have been requested" },
  source_request_sent: { dangerous: true, why: "a request may be out there with an unknown outcome" },
  broker_sync_blocks: { dangerous: true, why: "refusing a scale is safer than permitting one" },
  source_gap_blocks: { dangerous: true, why: "refusing R4 is safer than permitting it" },
  reason_required: { dangerous: true, why: "requiring a reason is safer than skipping it" },

  // Grants and reassurances. Absent must mean "no".
  visible: { dangerous: false, why: "an unreadable flag must not reveal a control" },
  enabled: { dangerous: false, why: "an unreadable flag must not enable a control" },
  eligible: { dangerous: false, why: "absent eligibility is not eligibility" },
  portal_reachable: { dangerous: false, why: "absent reachability is not reachability" },
  broker_values_visible: { dangerous: false, why: "absent is not permission to show broker figures" },
  production_command_active: { dangerous: false, why: "absent is not an active command surface" },
  realtime_active: { dangerous: false, why: "absent is not a live stream" },
  stream_available: { dangerous: false, why: "a stream nobody published is not a stream" },
  active_for_live_full: { dangerous: false, why: "the canary envelope does not govern Live Full by default" },
  source_status_unchanged: { dangerous: false, why: "absent must not be read as 'the source did not change'" },
  clean_dry_run_evidence_present: { dangerous: false, why: "absent evidence is not evidence" },
  exact_total: { dangerous: false, why: "an absent flag is not an exact count" },
  can_approve: { dangerous: false, why: "absent permission is not permission" },
  can_approve_with_condition: { dangerous: false, why: "absent permission is not permission" },
  can_deny: { dangerous: false, why: "absent permission is not permission" },
  can_extend_observation: { dangerous: false, why: "absent permission is not permission" },
  can_reject: { dangerous: false, why: "absent permission is not permission" },
  decision_eligible: { dangerous: false, why: "absent eligibility is not eligibility" },
  retry_allowed: { dangerous: false, why: "absent is not permission to retry" },
};

/**
 * Fields that describe a command's protocol rather than granting or warning.
 * Neither value is dangerous, so the fail-closed frame does not apply and
 * inventing a danger direction for them would be dishonest. They carry their
 * own rule instead: read exactly as published (`=== true`), because the drawer
 * renders them as a PLAN·APPLY·VERIFY chip strip and defaulting an unreadable
 * field to `true` would assert a step the server never required.
 *
 * These gate nothing today — `AdminActionDrawer` offers no plan or apply path
 * at all while the command relay is disabled for the catalogue revision. If a
 * relay is ever enabled and one of these starts gating a control, it stops
 * being descriptive and belongs in FLAGS above with a danger direction.
 */
const DESCRIPTIVE: Record<string, string> = {
  plan_required: "describes the command protocol; renders a chip, gates nothing",
  apply_required: "describes the command protocol; renders a chip, gates nothing",
  verify_required: "describes the command protocol; renders a chip, gates nothing",
  owner_review_required: "describes the command protocol; renders a chip, gates nothing",
};

function readerFiles(): { path: string; source: string }[] {
  const root = __dirname;
  const out: { path: string; source: string }[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/\.tsx?$/.test(entry.name) && !/\.(test|fixtures)\.tsx?$/.test(entry.name)) {
        out.push({ path: path.slice(root.length + 1), source: readFileSync(path, "utf8") });
      }
    }
  };
  walk(root);
  return out;
}

/** Every `<something>.field === true` / `!== false` comparison in the folder. */
function comparisons(): { file: string; field: string; operator: string; line: string }[] {
  const found: { file: string; field: string; operator: string; line: string }[] = [];
  for (const { path, source } of readerFiles()) {
    for (const line of source.split("\n")) {
      const match = /\.(\w+)\s*(===|!==)\s*(true|false)/.exec(line);
      if (!match) continue;
      found.push({ file: path, field: match[1], operator: `${match[2]} ${match[3]}`, line: line.trim() });
    }
  }
  return found;
}

describe("every safety flag lands on the safe side when absent", () => {
  it("finds the comparisons at all", () => {
    // Guards the scan: an empty list would make every assertion below vacuous,
    // which is how the two defects this file exists for got through.
    expect(comparisons().length).toBeGreaterThan(20);
  });

  it("uses the operator that makes an unreadable flag safe", () => {
    const wrong: string[] = [];
    for (const c of comparisons()) {
      const flag = FLAGS[c.field];
      if (!flag) {
        if (DESCRIPTIVE[c.field] && c.operator !== "=== true") {
          wrong.push(`${c.file}: \`${c.field}\` uses \`${c.operator}\`, expected \`=== true\` — ${DESCRIPTIVE[c.field]}`);
        }
        continue;
      }
      const expected = flag.dangerous ? "!== false" : "=== true";
      if (c.operator !== expected) {
        wrong.push(`${c.file}: \`${c.field}\` uses \`${c.operator}\`, expected \`${expected}\` — ${flag.why}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it("reads each flag the same way everywhere it appears", () => {
    const seen = new Map<string, Set<string>>();
    for (const c of comparisons()) {
      if (!FLAGS[c.field] && !DESCRIPTIVE[c.field]) continue;
      const set = seen.get(c.field) ?? new Set<string>();
      set.add(c.operator);
      seen.set(c.field, set);
    }
    // One field read two ways is a defect waiting for a second consumer, which
    // is exactly what `deployment_resume_requested` was.
    const inconsistent = [...seen.entries()]
      .filter(([, ops]) => ops.size > 1)
      .map(([field, ops]) => `${field}: ${[...ops].join(" and ")}`);
    expect(inconsistent).toEqual([]);
  });

  it("covers the flags the readers actually use", () => {
    // If a reader introduces a new safety flag, this lists it rather than
    // letting it default to unchecked.
    const known = new Set([...Object.keys(FLAGS), ...Object.keys(DESCRIPTIVE)]);
    const unlisted = new Set(
      comparisons()
        .map((c) => c.field)
        .filter((f) => !known.has(f) && /required|requested|active|visible|enabled|allowed|blocks|eligible|reachable|sent|unchanged|present/.test(f)),
    );
    expect([...unlisted]).toEqual([]);
  });
});
