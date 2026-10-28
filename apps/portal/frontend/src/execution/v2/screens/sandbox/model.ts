/**
 * What Sandbox certification says, from the view `readSandbox.ts` built: KPI cells, the gate,
 * the exit blockers in plain sentences, the three header chips and the review-note rules.
 *
 * Pure: no React state, no clock, no network. Every sentence here is either the server's
 * (a step summary, a count) or a statement of a published fact (a step is failed because the
 * server's evaluation says FAIL). Nothing is recomputed: no passed count, no headroom. The one
 * count made here, open and critical-open findings (`findingCounts`), exists only for a complete,
 * untruncated list whose every row states `resolved_at`, and is `Not available` otherwise. Where a
 * fact is not in the body the cell says `Not published (FE-xxx)` with the request that will publish
 * it, or `Not available` with why.
 */
import type { FlagKind } from "../../flagKinds";
import type { BlockerItem, NotPublishedId, SpineStageFacts, SpineStageId, StageChipValue, StageChips, TriadRow } from "../../blocks";
import { formatAsOf } from "../../boundary";
import { unsafeText } from "../../../unsafeText";
import type { PanelStatus } from "../../../contracts";
import { reconciliationChipFrom, runtimeChipFrom } from "../stage/factChips";
import type { FindingView, PanelView, SandboxView, StepState, StepView } from "./readSandbox";

/* ── words ────────────────────────────────────────────────────────────────── */

export const AUTHORITY_WORD: Readonly<Record<string, string>> = {
  PORTAL: "Portal",
  EXECUTION: "Execution",
  BROKER: "Broker",
  DERIVED: "Derived",
  RESEARCH: "Research",
};

/** `CLEANUP_DONE` to `Cleanup done`; a word nobody wrote a label for is still readable, and never blank. */
export function humanize(code: string): string {
  const spaced = code.replace(/[_.-]+/g, " ").trim().toLowerCase();
  return spaced === "" ? code : spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export const sourceWord = (authority: string | null): string | null =>
  authority === null ? null : Object.hasOwn(AUTHORITY_WORD, authority) ? AUTHORITY_WORD[authority]! : humanize(authority);

export const STEP_FLAG: Readonly<Record<StepState, { kind: FlagKind; label: string }>> = {
  pass: { kind: "ok", label: "Pass" },
  fail: { kind: "rejected", label: "Fail" },
  stale: { kind: "stale", label: "Stale" },
  unavailable: { kind: "na", label: "Unavailable" },
  "not-recorded": { kind: "pending", label: "Not recorded" },
  unknown: { kind: "unknown", label: "Unknown" },
};

/** Severity word to a flag. An unlisted word is Unknown, never Info. */
export function severityFlag(severity: string | null): { kind: FlagKind; label: string } {
  switch (severity) {
    case "CRITICAL":
      return { kind: "rejected", label: "Critical" };
    case "ERROR":
      return { kind: "rejected", label: "Error" };
    case "WARNING":
      return { kind: "partial", label: "Warning" };
    case "INFO":
      return { kind: "neutral", label: "Info" };
    default:
      return { kind: "unknown", label: "Unknown" };
  }
}

/** The five published timeline actions in words; any other action keeps its own code, humanized. */
const ACTION_WORD: Readonly<Record<string, { kind: FlagKind; label: string; outcome: string }>> = {
  CREATE: { kind: "pending", label: "Created", outcome: "Certification created" },
  SUBMIT: { kind: "approval", label: "Submitted", outcome: "Submitted for review" },
  APPROVE: { kind: "applied", label: "Approved", outcome: "Certification approved" },
  DENY: { kind: "rejected", label: "Denied", outcome: "Certification denied" },
  PLAN_PROMOTION: { kind: "operation", label: "Plan", outcome: "Promotion plan recorded" },
};
export function actionWord(action: string | null): { kind: FlagKind; label: string; outcome: string } {
  if (action === null) return { kind: "unknown", label: "Unknown", outcome: "Unrecognised action" };
  return Object.hasOwn(ACTION_WORD, action) ? ACTION_WORD[action]! : { kind: "neutral", label: humanize(action), outcome: humanize(action) };
}

export const PANEL_STATE_WORD: Readonly<Record<PanelStatus, string>> = {
  loading: "Loading",
  ok: "Ready",
  empty: "Empty",
  partial: "Partial",
  stale: "Stale",
  denied: "Withheld",
  unavailable: "Unavailable",
  insufficient_data: "Insufficient data",
  terminal: "Failed",
};

const FRESHNESS_WORD: Readonly<Record<string, string>> = { OK: "Fresh", AGING: "Aging", STALE: "Stale", UNKNOWN: "Freshness unknown" };

const joinWords = (items: readonly string[]): string =>
  items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

/* ── the gate ─────────────────────────────────────────────────────────────── */

export type GateState = "blocked" | "eligible" | "unknown";

const stepsAvailable = (view: SandboxView): readonly StepView[] | null => (view.steps.availability === "available" ? view.steps.items : null);

/** The finding rows, only when the list is the whole list: published, not truncated, a known total, and every row in hand. */
function completeFindings(view: SandboxView): readonly FindingView[] | null {
  const f = view.findings;
  if (f === null || f.truncated || f.total === null || f.rows.length !== f.total) return null;
  return f.rows;
}

/**
 * Findings the server called CRITICAL and that are not KNOWN to be resolved: the exit stays shut (the V1 rule) while one is
 * unresolved, and a row whose resolution is unknown is treated as unresolved. `null` unless the list is complete.
 */
export function criticalFindings(view: SandboxView): number | null {
  const rows = completeFindings(view);
  return rows === null ? null : rows.filter((row) => row.severity === "CRITICAL" && row.state !== "resolved").length;
}

export interface FindingCounts {
  /** Findings whose `resolved_at` is null. `null` = a state is unknown, so no honest count exists. */
  open: number | null;
  /** CRITICAL findings that are open. `null` = a CRITICAL finding's state, or an unreadable severity of an unresolved one, is unknown. */
  criticalOpen: number | null;
}

/**
 * The counts the hi-fi prints ("Open findings", "Critical open"). Built from the published rows and only when the list is complete
 * (not truncated, total known, every row in hand); each is `null` when its inputs are not all known. Never the server's total
 * relabelled: a total counts open and resolved alike.
 */
export function findingCounts(view: SandboxView): FindingCounts | null {
  const rows = completeFindings(view);
  if (rows === null) return null;
  const open = rows.some((row) => row.state === "unknown") ? null : rows.filter((row) => row.state === "open").length;
  let criticalOpen: number | null = 0;
  for (const row of rows) {
    if (row.state === "resolved") continue;
    if (row.severity === "CRITICAL") {
      if (row.state === "unknown") criticalOpen = null;
      else if (criticalOpen !== null) criticalOpen += 1;
    } else if (row.severity === null) {
      // A severity this build cannot read could be CRITICAL.
      criticalOpen = null;
    }
    if (criticalOpen === null) break;
  }
  return { open, criticalOpen };
}

/**
 * The exit gate. The server's `eligible` governs; the two extra refusals are certification.ts's own
 * rule (a non-PASS step or a CRITICAL finding keeps it shut even if `eligible` were set by mistake).
 * No progress (a V2 body, or none published) means the gate is not known, never "open".
 */
export function gateOf(view: SandboxView): GateState {
  const progress = view.progress;
  if (progress === null) return "unknown";
  const steps = stepsAvailable(view);
  if (!progress.eligible) return "blocked";
  if (steps === null) return "unknown";
  if (steps.some((step) => step.state !== "pass")) return "blocked";
  const critical = criticalFindings(view);
  if (critical === null) return "unknown";
  return critical > 0 ? "blocked" : "eligible";
}

/* ── KPIs ─────────────────────────────────────────────────────────────────── */

export interface KpiCell {
  key: "steps" | "findings" | "critical" | "plans" | "gate";
  label: string;
  /** A published figure, as printed. */
  value?: string;
  /** The request that will publish it. */
  np?: NotPublishedId;
  flag?: { kind: FlagKind; label: string };
  basis?: string;
  /** Why it is `Not available` when there is no value and no request id. */
  absent?: string;
}

const count = (n: number): string => String(n);

/** `1 failed · 2 unavailable`, only when the seven steps agree with the server's own passed count. */
export function stepTally(view: SandboxView): string | null {
  const steps = stepsAvailable(view);
  const passed = view.progress?.passed ?? null;
  if (steps === null || passed === null) return null;
  const tally = new Map<StepState, number>();
  for (const step of steps) tally.set(step.state, (tally.get(step.state) ?? 0) + 1);
  // The server's count governs; a browser tally that disagrees with it is not printed beside it.
  if ((tally.get("pass") ?? 0) !== passed) return null;
  const words: [StepState, string][] = [["fail", "failed"], ["stale", "stale"], ["unavailable", "unavailable"], ["not-recorded", "not recorded"], ["unknown", "unreadable"]];
  const parts = words.flatMap(([state, word]) => ((tally.get(state) ?? 0) > 0 ? [`${tally.get(state)} ${word}`] : []));
  return parts.length === 0 ? null : parts.join(" · ");
}

export function kpiCells(view: SandboxView): KpiCell[] {
  const progress = view.progress;
  const steps: KpiCell =
    view.version === "v2"
      ? { key: "steps", label: "Steps passed", np: "FE-028" }
      : progress !== null && progress.passed !== null && progress.total !== null
        ? { key: "steps", label: "Steps passed", value: `${progress.passed} / ${progress.total}`, basis: stepTally(view) ?? undefined }
        : { key: "steps", label: "Steps passed", absent: "The count was not published" };

  const f = view.findings;
  const counts = findingCounts(view);
  const incomplete = f !== null && counts === null;
  // Zero findings against sources that did not report is an absence of evidence, not "none open" (the hi-fi's `Source did not report`).
  const silent = f !== null && f.total === 0 && !view.panels.some((p) => p.state === "ok");
  const findings: KpiCell =
    f === null
      ? { key: "findings", label: "Open findings", np: "FE-072" }
      : f.total === null
        ? { key: "findings", label: "Open findings", absent: "The count was not published" }
        : silent
          ? { key: "findings", label: "Open findings", absent: "Sources did not report" }
          : incomplete
          ? { key: "findings", label: "Open findings", absent: f.truncated ? `The finding list is incomplete: showing ${f.returned ?? f.rows.length} of ${f.total}` : "The finding list is incomplete" }
          : counts!.open === null
            ? { key: "findings", label: "Open findings", absent: `Which are open was not published · ${f.total} recorded` }
            : { key: "findings", label: "Open findings", value: count(counts!.open), basis: `${f.total} recorded` };

  const crit: KpiCell =
    f === null
      ? { key: "critical", label: "Critical open", np: "FE-072" }
      : silent
        ? { key: "critical", label: "Critical open", absent: "Sources did not report" }
        : counts === null
        ? { key: "critical", label: "Critical open", absent: "The finding list is incomplete" }
        : counts.criticalOpen === null
          ? { key: "critical", label: "Critical open", absent: "Which are open was not published" }
          : { key: "critical", label: "Critical open", value: count(counts.criticalOpen) };

  const plans: KpiCell =
    view.plans === null
      ? { key: "plans", label: "Promotion plans", np: "FE-072" }
      : (() => {
          const statuses = [...new Set(view.plans.map((p) => p.status ?? "unreadable"))];
          return {
            key: "plans" as const,
            label: "Promotion plans",
            value: count(view.plans.length),
            basis: view.plans.length === 0 ? undefined : statuses.length === 1 ? humanize(statuses[0]!) : "Mixed statuses",
          };
        })();

  const gate = gateOf(view);
  const gateCell: KpiCell =
    gate === "unknown"
      ? view.version === "v2"
        ? { key: "gate", label: "Gate", np: "FE-028" }
        : { key: "gate", label: "Gate", absent: "The server did not state it" }
      : {
          key: "gate",
          label: "Gate",
          flag: gate === "blocked" ? { kind: "rejected", label: "Blocked" } : { kind: "ok", label: "Eligible" },
          basis: view.workflowState === null ? undefined : `Workflow ${humanize(view.workflowState).toLowerCase()}`,
        };
  return [steps, findings, crit, plans, gateCell];
}

/* ── the exit blockers ────────────────────────────────────────────────────── */

const STEP_VERB: Readonly<Record<Exclude<StepState, "pass">, { one: string; many: string }>> = {
  fail: { one: "failed", many: "failed" },
  stale: { one: "has stale evidence", many: "have stale evidence" },
  unavailable: { one: "is unavailable: no evidence yet", many: "are unavailable: no evidence yet" },
  "not-recorded": { one: "has no recorded evidence", many: "have no recorded evidence" },
  unknown: { one: "could not be read", many: "could not be read" },
};

export interface Blockers {
  items: readonly BlockerItem[];
  /** Every published blocker code, for Provenance. Never in a sentence. */
  codes: readonly string[];
}

/** Plain sentences for what the published step evaluations, the server's count and the findings say. V2 has no server blockers: nothing is listed. */
export function blockers(view: SandboxView): Blockers {
  if (view.progress === null) return { items: [], codes: [] };
  const items: BlockerItem[] = [];
  const steps = stepsAvailable(view);
  const stepCodes = new Set<string>();
  if (steps !== null) {
    for (const state of ["fail", "stale", "unavailable", "not-recorded", "unknown"] as const) {
      const hit = steps.filter((s) => s.state === state);
      if (hit.length === 0) continue;
      const ordinals = hit.map((s) => String(s.ordinal));
      items.push({ key: `step-${state}`, text: `${hit.length === 1 ? "Step" : "Steps"} ${joinWords(ordinals)} ${hit.length === 1 ? STEP_VERB[state].one : STEP_VERB[state].many}.` });
    }
    for (const s of steps) if (s.blockerCode !== null) stepCodes.add(s.blockerCode);
  }
  const { passed, total } = view.progress;
  if (passed !== null && total !== null && passed < total) items.push({ key: "count", text: `${passed} of ${total} steps have passed.` });
  const critical = criticalFindings(view);
  if (critical !== null && critical > 0) {
    // "open" only when every critical finding's state is known; otherwise they are recorded and not known to be resolved.
    const strict = findingCounts(view)?.criticalOpen ?? null;
    items.push({ key: "critical", text: `${critical} critical ${critical === 1 ? "finding is" : "findings are"} ${strict === null ? "recorded" : "open"}.` });
  }
  const codes = [...new Set([...view.progress.blockerCodes, ...stepCodes])];
  const unexplained = view.progress.blockerCodes.filter((code) => !stepCodes.has(code));
  if (unexplained.length > 0) {
    items.push({ key: "other", text: `The server lists ${unexplained.length} other ${unexplained.length === 1 ? "blocker" : "blockers"} without a published sentence.` });
  }
  if (items.length === 0 && !view.progress.eligible) items.push({ key: "not-eligible", text: "The server has not marked this certification eligible." });
  return { items, codes };
}

/** The server's blocker code for a certification that already has its decision: the stage is a closed, approved record. */
export const ALREADY_DECIDED_CODE = "SANDBOX_CERTIFICATION_ALREADY_DECIDED";

/** True when the published progress says the certification was already decided (QA6 R4-03). */
export function isDecided(view: SandboxView): boolean {
  return view.progress !== null && view.progress.blockerCodes.includes(ALREADY_DECIDED_CODE);
}

/** Why Submit for review is off. The action has no route, so it is never on; when the gate is shut the reason says that first. */
export function submitReason(gate: GateState, notEnabled: string): string {
  return gate === "blocked" ? "Blocked until every step passes" : notEnabled;
}

/* ── the header ───────────────────────────────────────────────────────────── */

const WORST_FRESHNESS: readonly string[] = ["STALE", "AGING", "OK"];

/** Display freshness from the three source panels: the worst state the server published, with its as-of. Nothing is aged here. */
function freshnessChip(panels: readonly PanelView[], decided = false): StageChipValue {
  // A withheld or failed panel makes no claim about its data, whatever freshness word it carries (Canary's rule).
  const speaks = (p: PanelView) => !p.suppressed && p.state !== "unavailable" && p.state !== "denied" && p.state !== "terminal";
  const known = panels.filter((p) => speaks(p) && p.freshness !== null && p.freshness !== "UNKNOWN");
  if (known.length === 0) {
    if (panels.length === 0) return { state: "not-available", reason: "No source panel in this response" };
    return { state: "not-available", reason: panels.some((p) => p.suppressed) ? "Withheld by the server" : panels.some((p) => !speaks(p)) ? "Source unavailable" : "No source panel reported" };
  }
  const worst = WORST_FRESHNESS.find((word) => known.some((p) => p.freshness === word)) ?? "OK";
  const at = known.find((p) => p.freshness === worst)?.asOf ?? null;
  const tone = worst === "OK" ? "ok" : "warn";
  // A decided stage is a closed record: its last read is the end of the record, not a live "Fresh" (QA6 R4-03).
  if (decided) return { state: "dot", tone: "mute", text: `Ended${at === null ? "" : ` · ${formatAsOf(at)}`}`, note: "Decided; the record is closed" };
  return { state: "dot", tone, text: `${FRESHNESS_WORD[worst]}${at === null ? "" : ` · ${formatAsOf(at)}`}` };
}

function reconciliationChip(view: SandboxView): StageChipValue {
  const f = view.findings;
  if (f === null) return { state: "not-published", id: "FE-072" };
  if (f.total === null) return { state: "not-available", reason: "Finding count not published" };
  if (f.total > 0) {
    // With every state known the chip says how many are open; otherwise it says what was recorded, open or resolved.
    const open = findingCounts(view)?.open ?? null;
    if (open !== null) return open > 0 ? { state: "flag", kind: "partial", label: `${open} open`, note: `${f.total} recorded` } : { state: "flag", kind: "ok", label: "None open", note: `${f.total} recorded` };
    return { state: "flag", kind: "partial", label: `${f.total} recorded`, note: "open or resolved" };
  }
  // Zero findings against sources that did not report is an absence of evidence, not a clean result.
  const reported = view.panels.some((p) => p.state === "ok");
  return reported ? { state: "flag", kind: "ok", label: "None recorded" } : { state: "not-available", reason: "Sources did not report" };
}

/**
 * Reconciliation: the server's findings-relation statement (`stage_facts`, FE-067) when it published one; else the chip the
 * finding rows themselves support (a count of open findings); and when neither says anything, the stage facts' reason.
 */
function reconciliationChipOf(view: SandboxView): StageChipValue {
  const fromFacts = view.reconciliation === null ? null : reconciliationChipFrom(view.reconciliation);
  if (view.reconciliation !== null && view.reconciliation.verdict.kind === "value" && fromFacts !== null) return fromFacts;
  const legacy = reconciliationChip(view);
  if (legacy.state === "flag" || legacy.state === "dot") return legacy;
  return fromFacts ?? legacy;
}

/**
 * Runtime and Reconciliation are the server's `stage_facts` (FE-067) when the body carries them: a runtime word of the closed
 * vocabulary or `Not published (FE-067)` with the reason code in the title, and the findings-relation statement
 * ("No open findings", never "Clean"). A body without them (the sealed V2 body, an older producer) keeps the earlier
 * findings-derived chip.
 */
export function chipsOf(view: SandboxView): StageChips {
  return {
    runtime: runtimeChipFrom(view.runtime, view.runtimeState === null ? null : humanize(view.runtimeState)),
    freshness: freshnessChip(view.panels, isDecided(view)),
    reconciliation: reconciliationChipOf(view),
  };
}

export const LOADING_CHIPS: StageChips = { runtime: { state: "loading" }, freshness: { state: "loading" }, reconciliation: { state: "loading" } };

/** Venue and account; the deployment and the portfolio are in the breadcrumb, so the subtitle does not say them again. */
export function subtitleOf(view: SandboxView): string | null {
  const parts: string[] = [];
  if (view.venue !== null) parts.push(view.venue);
  if (view.accountRef !== null) parts.push(`account ${view.accountRef}`);
  return parts.length === 0 ? null : parts.join(" · ");
}

/** The spine's lines for the stages the lineage names. No stage is "done": lineage is a reference, not a history. */
export function spineFacts(view: SandboxView): Partial<Record<SpineStageId, SpineStageFacts>> {
  const line = (kind: "r1" | "r2" | "paper"): string | null => view.lineage.find((l) => l.kind === kind)?.value ?? null;
  const out: Partial<Record<SpineStageId, SpineStageFacts>> = {};
  const r1 = line("r1");
  const r2 = line("r2");
  const paper = line("paper");
  if (r1 !== null) out.r1 = { line: r1 };
  if (r2 !== null) out.r2 = { line: r2 };
  if (paper !== null) out.paper = { line: paper };
  return out;
}

export const LINEAGE_LABEL: Readonly<Record<string, string>> = {
  artifact: "Research artifact",
  r1: "R1 approval",
  r2: "R2 approval",
  paper: "Paper exit review",
  grant: "Promotion grant",
};

/* ── reconciliation ───────────────────────────────────────────────────────── */

/** The figures the hi-fi reconciles. The labels are the design's; no value is attached, because the figure keys are not published (FE-072). */
export const RECON_ROWS: readonly TriadRow[] = [
  { key: "equity", label: "Equity" },
  { key: "fees", label: "Fees paid" },
  { key: "position", label: "Position" },
  { key: "orders", label: "Open orders" },
];

export function panelById(view: SandboxView, id: string): PanelView | null {
  return view.panels.find((p) => p.id === id) ?? null;
}

/** One line per source panel: who says it, in what state, how fresh. */
export function panelLine(panel: PanelView): string {
  const parts: string[] = [];
  const who = sourceWord(panel.authority);
  if (who !== null) parts.push(who);
  parts.push(PANEL_STATE_WORD[panel.state]);
  // An unknown freshness is not a fact to print beside a state that already says unavailable.
  if (panel.freshness !== null && panel.freshness !== "UNKNOWN") parts.push(FRESHNESS_WORD[panel.freshness] ?? humanize(panel.freshness));
  if (panel.asOf !== null) parts.push(formatAsOf(panel.asOf));
  return parts.join(" · ");
}

/** The figures disagree: the server withheld a comparing panel. The only disagreement signal this body can carry. */
export function figuresSuppressed(view: SandboxView): boolean {
  return view.panels.some((p) => p.suppressed && (p.id === "broker" || p.id === "difference"));
}

/* ── the review note ──────────────────────────────────────────────────────── */

/** The server's published bounds for a note summary (`SandboxNoteRequest.summary`): 8 to 1000 characters. The hi-fi says 24; the server is the boundary (D8). */
export const NOTE_MIN = 8;
export const NOTE_MAX = 1000;

/** Characters the way the schema counts them: code points of the trimmed text. */
export const noteLength = (summary: string): number => [...summary.trim()].length;

export interface NoteInputs {
  summary: string;
  workspaceId: string | null;
  certificationId: string;
  workflowVersion: number | null;
}

export type NoteBlock = { code: "workspace" | "version" | "hostile" | "short" | "long"; text: string };

/** Why the Record button is off, or `null` when it may be pressed. */
export function noteBlock(input: NoteInputs): NoteBlock | null {
  if (input.workspaceId === null) return { code: "workspace", text: "The workspace was not published for this read, so a note cannot be bound to it." };
  if (input.workflowVersion === null) return { code: "version", text: "The workflow version was not published, and a note is bound to it." };
  // A note a person types may have line breaks; it may not carry control or direction characters that reorder or hide text.
  if (unsafeText(input.summary, { allowLayout: true })) return { code: "hostile", text: "The note has a control or direction character, which cannot be recorded. Remove it." };
  const n = noteLength(input.summary);
  if (n < NOTE_MIN) return { code: "short", text: `Needs at least ${NOTE_MIN} characters (${n} so far)` };
  if (n > NOTE_MAX) return { code: "long", text: `At most ${NOTE_MAX} characters (${n} so far)` };
  return null;
}

/** What the request is: a retry of the same intent replays under the same key, a changed intent is a new key. */
export function noteFingerprint(input: NoteInputs): string {
  return JSON.stringify([input.workspaceId, input.certificationId, input.workflowVersion, input.summary.trim()]);
}

const KEY_SHAPE = /^[A-Za-z0-9._:-]{1,192}$/;

export function newNoteKey(): string {
  const random =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
  const key = `sandbox_note:${random}`;
  return KEY_SHAPE.test(key) ? key : `sandbox_note:${Date.now().toString(16)}`;
}

/** The two tab ids the hi-fi names and the one count it prints. */
export function tabsOf(view: SandboxView | null): { id: string; label: string; count?: number | null }[] {
  const steps = view !== null && view.steps.availability === "available" ? view.steps.items.length : null;
  return [
    { id: "reconciliation", label: "Reconciliation" },
    { id: "steps", label: "Steps", count: steps },
    { id: "promotion-plans", label: "Promotion plans" },
    { id: "timeline", label: "Timeline" },
  ];
}
