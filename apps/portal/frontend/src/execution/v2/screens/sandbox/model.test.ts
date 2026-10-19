/**
 * Sandbox model: the gate, the KPI cells, the exit blockers in plain sentences, the three chips,
 * the review-note rules. Views are built by hand here (the conformance suite proves the reader);
 * every state has a stable name.
 */
import { describe, expect, it } from "vitest";

import {
  NOTE_MAX, NOTE_MIN, actionWord, blockers, chipsOf, criticalFindings, figuresSuppressed, findingCounts, gateOf, humanize, kpiCells, newNoteKey, noteBlock,
  noteFingerprint, noteLength, panelLine, severityFlag, spineFacts, stepTally, submitReason, subtitleOf, tabsOf, type KpiCell,
} from "./model";
import type { FindingView, PanelView, SandboxView, StepState, StepView } from "./readSandbox";
import { readUtcEpochMs } from "../../../screenDataContract";

/** 17 Oct 2026 at hh:mm UTC, as the branded instant the views carry. */
const utc = (hour: number, minute: number) => readUtcEpochMs(Date.UTC(2026, 9, 17, hour, minute))!;

const STEP_KEYS = ["CONNECT", "SYNC", "ORDER_TYPES", "RECONCILIATION", "TIMEBOXED_RUN", "CLEANUP", "EXIT_REVIEW"] as const;
const LABELS = ["Connect", "Sync", "Order types", "Reconciliation clean", "Timeboxed run", "Cleanup", "Exit review"];

function step(index: number, state: StepState, over: Partial<StepView> = {}): StepView {
  return { key: STEP_KEYS[index]!, ordinal: index + 1, label: LABELS[index]!, state, authority: "BROKER", summary: null, blockerCode: null, asOf: null, expiresAt: null, evidenceId: null, ...over };
}
const steps = (states: StepState[]): StepView[] => states.map((s, i) => step(i, s, s === "pass" ? {} : { blockerCode: `SANDBOX_STEP_${STEP_KEYS[i]}_${s.toUpperCase()}` }));

/** A finding row; its state is unknown unless the test says (the published row's `resolved_at` is what decides it). */
function finding(id: string, severity: string | null, state: FindingView["state"] = "unknown", over: Partial<FindingView> = {}): FindingView {
  return { id, severity, code: null, summary: null, blocking: null, openedAt: null, resolvedAt: state === "resolved" ? utc(12, 0) : null, state, ...over };
}

function panel(id: string, over: Partial<PanelView> = {}): PanelView {
  return { id, authority: "EXECUTION", state: "unavailable", freshness: "UNKNOWN", asOf: null, suppressed: false, verified: false, ...over };
}

function v1(over: Partial<SandboxView> = {}): SandboxView {
  return {
    version: "v1", schemaVersion: "governance.sandbox-certification.v1", certificationId: "cert_TEST_ONLY_a", deploymentId: "dep_TEST_ONLY_a", portfolioId: null,
    venue: "OKX", accountRef: "okx_testnet_main", workflowState: "DRAFT", workflowVersion: 1, workspaceId: null, observedAt: null, policyVersion: null, formulaVersion: null,
    deliveryProfile: "fixture", sourceIntegrationState: "UNAVAILABLE", runtimeState: null, sourceActed: false,
    steps: { availability: "available", items: steps(["pass", "pass", "pass", "fail", "pass", "unavailable", "unavailable"]) },
    progress: { passed: 4, total: 7, eligible: false, blockerCodes: ["SANDBOX_STEP_RECONCILIATION_FAIL"], evidenceSetHash: null },
    findings: { total: 2, returned: 2, truncated: false, rows: [finding("f1", "CRITICAL"), finding("f2", "INFO")] },
    timeline: { total: 0, returned: 0, truncated: false, rows: [] },
    plans: [],
    panels: [panel("internal"), panel("broker"), panel("difference", { authority: "DERIVED" })],
    lineage: [],
    ...over,
  };
}
function v2(over: Partial<SandboxView> = {}): SandboxView {
  return v1({ version: "v2", schemaVersion: "portal.execution.following-parent.v2", workspaceId: "ws_TEST_ONLY", progress: null, findings: null, timeline: null, plans: null, panels: [], ...over });
}

const cell = (cells: KpiCell[], key: KpiCell["key"]) => cells.find((c) => c.key === key)!;

describe("the gate is the server's", () => {
  it.each([
    ["no progress (V2 or unpublished) is unknown, never open", v2(), "unknown"],
    ["not eligible is blocked", v1(), "blocked"],
    ["eligible, every step passes, no critical finding: eligible", v1({ progress: { passed: 7, total: 7, eligible: true, blockerCodes: [], evidenceSetHash: null }, steps: { availability: "available", items: steps(Array(7).fill("pass")) }, findings: { total: 0, returned: 0, truncated: false, rows: [] } }), "eligible"],
    ["eligible but one step fails: blocked (the V1 rule keeps it shut)", v1({ progress: { passed: 6, total: 7, eligible: true, blockerCodes: [], evidenceSetHash: null }, steps: { availability: "available", items: steps(["pass", "pass", "pass", "fail", "pass", "pass", "pass"]) } }), "blocked"],
    ["eligible but a critical finding is recorded: blocked", v1({ progress: { passed: 7, total: 7, eligible: true, blockerCodes: [], evidenceSetHash: null }, steps: { availability: "available", items: steps(Array(7).fill("pass")) } }), "blocked"],
    ["eligible but the steps are absent: unknown, not open", v1({ progress: { passed: 7, total: 7, eligible: true, blockerCodes: [], evidenceSetHash: null }, steps: { availability: "absent", text: "x", code: null } }), "unknown"],
    ["eligible but the finding list is truncated: unknown", v1({ progress: { passed: 7, total: 7, eligible: true, blockerCodes: [], evidenceSetHash: null }, steps: { availability: "available", items: steps(Array(7).fill("pass")) }, findings: { total: 90, returned: 50, truncated: true, rows: [] } }), "unknown"],
  ] as const)("%s", (_name, view, want) => {
    expect(gateOf(view)).toBe(want);
  });

  it("a CRITICAL finding keeps the gate shut until it is KNOWN resolved; an unknown state is unresolved", () => {
    const eligible = { progress: { passed: 7, total: 7, eligible: true, blockerCodes: [], evidenceSetHash: null }, steps: { availability: "available" as const, items: steps(Array(7).fill("pass")) } };
    const rows = (state: FindingView["state"]) => ({ findings: { total: 1, returned: 1, truncated: false, rows: [finding("f1", "CRITICAL", state)] } });
    expect(gateOf(v1({ ...eligible, ...rows("open") }))).toBe("blocked");
    expect(gateOf(v1({ ...eligible, ...rows("unknown") }))).toBe("blocked");
    expect(gateOf(v1({ ...eligible, ...rows("resolved") }))).toBe("eligible");
  });

  it("critical findings are counted only from a complete list", () => {
    expect(criticalFindings(v1())).toBe(1);
    expect(criticalFindings(v1({ findings: { total: 2, returned: 1, truncated: false, rows: [finding("f1", "CRITICAL")] } }))).toBeNull();
    expect(criticalFindings(v1({ findings: { total: 1, returned: 1, truncated: true, rows: [finding("f1", "CRITICAL")] } }))).toBeNull();
    expect(criticalFindings(v2())).toBeNull();
  });
});

describe("the five facts", () => {
  it("V1: the server's count, findings, critical, plans and a blocked gate", () => {
    const cells = kpiCells(v1());
    expect(cells.map((c) => c.label)).toEqual(["Steps passed", "Open findings", "Critical open", "Promotion plans", "Gate"]);
    expect(cell(cells, "steps")).toMatchObject({ value: "4 / 7", basis: "1 failed · 2 unavailable" });
    // The default rows do not say whether they are open: the total is real, "open" is not known, and the cell says so.
    expect(cell(cells, "findings")).toMatchObject({ absent: "Which are open was not published · 2 recorded" });
    expect(cell(cells, "findings").value).toBeUndefined();
    expect(cell(cells, "critical")).toMatchObject({ absent: "Which are open was not published" });
    expect(cell(cells, "plans")).toMatchObject({ value: "0", basis: "None recorded" });
    expect(cell(cells, "gate").flag).toEqual({ kind: "rejected", label: "Blocked" });
  });

  it("V2: every fact the body does not carry is Not published with its request, never a number", () => {
    const cells = kpiCells(v2());
    expect(cell(cells, "steps").np).toBe("FE-028");
    expect(cell(cells, "findings")).toMatchObject({ label: "Open findings", np: "FE-072" });
    expect(cell(cells, "critical")).toMatchObject({ label: "Critical open", np: "FE-072" });
    expect(cell(cells, "plans").np).toBe("FE-072");
    expect(cell(cells, "gate").np).toBe("FE-028");
    for (const c of cells) expect(c.value, c.key).toBeUndefined();
  });

  it("the tally is printed only when the seven steps agree with the server's own passed count", () => {
    expect(stepTally(v1())).toBe("1 failed · 2 unavailable");
    // The server says 5 passed; the steps show 4. The browser tally is not printed beside the server's number.
    expect(stepTally(v1({ progress: { passed: 5, total: 7, eligible: false, blockerCodes: [], evidenceSetHash: null } }))).toBeNull();
    expect(kpiCells(v1({ progress: { passed: 5, total: 7, eligible: false, blockerCodes: [], evidenceSetHash: null } }))[0]).toMatchObject({ value: "5 / 7", basis: "Server count" });
  });

  it("a count that was not published is Not available with why, not 0 / 7", () => {
    const c = cell(kpiCells(v1({ progress: { passed: null, total: null, eligible: false, blockerCodes: [], evidenceSetHash: null } })), "steps");
    expect(c.value).toBeUndefined();
    expect(c.absent).toBeTruthy();
  });

  it("Open findings and Critical open: counted from the published resolved_at of a complete list, never from the total", () => {
    const list = (rows: FindingView[]) => v1({ findings: { total: rows.length, returned: rows.length, truncated: false, rows } });
    const mixed = kpiCells(list([finding("a", "CRITICAL", "open"), finding("b", "CRITICAL", "resolved"), finding("c", "WARNING", "open"), finding("d", "INFO", "resolved")]));
    expect(cell(mixed, "findings")).toMatchObject({ value: "2", basis: "4 recorded, open or resolved" });
    expect(cell(mixed, "critical")).toMatchObject({ value: "1", basis: "Not resolved" });
    const none = kpiCells(list([finding("a", "CRITICAL", "resolved")]));
    expect(cell(none, "findings")).toMatchObject({ value: "0" });
    expect(cell(none, "critical")).toMatchObject({ value: "0", basis: "None open" });
    // One unknown non-critical state: no open count, but the critical count is still known.
    const partial = kpiCells(list([finding("a", "CRITICAL", "open"), finding("b", "INFO", "unknown")]));
    expect(cell(partial, "findings").value).toBeUndefined();
    expect(cell(partial, "critical")).toMatchObject({ value: "1" });
    // An unknown CRITICAL state, or a severity this build cannot read on an unresolved row: no critical count.
    expect(cell(kpiCells(list([finding("a", "CRITICAL", "unknown")])), "critical").value).toBeUndefined();
    expect(cell(kpiCells(list([finding("a", null, "open")])), "critical").value).toBeUndefined();
    expect(cell(kpiCells(list([finding("a", null, "resolved")])), "critical")).toMatchObject({ value: "0" });
  });

  it("zero findings against sources that did not report is Not available, not 0; against a reporting source it is 0", () => {
    const none = { findings: { total: 0, returned: 0, truncated: false, rows: [] } };
    expect(cell(kpiCells(v1(none)), "findings")).toMatchObject({ absent: "Sources did not report" });
    expect(cell(kpiCells(v1(none)), "critical")).toMatchObject({ absent: "Sources did not report" });
    const reported = v1({ ...none, panels: [panel("internal", { state: "ok", freshness: "OK", asOf: utc(12, 4) })] });
    expect(cell(kpiCells(reported), "findings")).toMatchObject({ value: "0" });
    expect(cell(kpiCells(reported), "critical")).toMatchObject({ value: "0", basis: "None open" });
  });

  it("an incomplete list gives no count: a truncated list says Showing N of M, a short one says incomplete", () => {
    expect(cell(kpiCells(v1({ findings: { total: 90, returned: 50, truncated: true, rows: [] } })), "findings")).toMatchObject({ absent: "The finding list is incomplete: showing 50 of 90" });
    expect(cell(kpiCells(v1({ findings: { total: 90, returned: 50, truncated: true, rows: [] } })), "critical")).toMatchObject({ absent: "The finding list is incomplete" });
    expect(findingCounts(v1({ findings: { total: 3, returned: 1, truncated: false, rows: [finding("a", "INFO", "open")] } }))).toBeNull();
    expect(findingCounts(v2())).toBeNull();
  });

  it("plans: one status or Mixed statuses", () => {
    const plan = (id: string, status: string | null) => ({ id, target: "CANARY", status, blockerCodes: [], createdAt: null });
    expect(cell(kpiCells(v1({ plans: [plan("a", "BLOCKED"), plan("b", "BLOCKED")] })), "plans")).toMatchObject({ value: "2", basis: "Blocked" });
    expect(cell(kpiCells(v1({ plans: [plan("a", "BLOCKED"), plan("b", null)] })), "plans")).toMatchObject({ value: "2", basis: "Mixed statuses" });
  });

  it("an eligible gate says so and names the workflow state", () => {
    const view = v1({ progress: { passed: 7, total: 7, eligible: true, blockerCodes: [], evidenceSetHash: null }, steps: { availability: "available", items: steps(Array(7).fill("pass")) }, findings: { total: 0, returned: 0, truncated: false, rows: [] }, workflowState: "IN_REVIEW" });
    expect(cell(kpiCells(view), "gate")).toMatchObject({ flag: { kind: "ok", label: "Eligible" }, basis: "Exit review · workflow in review" });
  });
});

describe("the exit blockers read as sentences; codes stay out of them", () => {
  it("V1: one line per state of the steps, the server's count, the critical findings; the codes are returned apart", () => {
    const { items, codes } = blockers(v1());
    expect(items.map((i) => i.text)).toEqual([
      "Step 4 failed.",
      "Steps 6 and 7 are unavailable: no evidence yet.",
      "4 of 7 steps have passed.",
      "1 critical finding is recorded.",
    ]);
    // Once the finding's state is published the sentence says it is open.
    const open = blockers(v1({ findings: { total: 1, returned: 1, truncated: false, rows: [finding("f1", "CRITICAL", "open")] } }));
    expect(open.items.map((i) => i.text)).toContain("1 critical finding is open.");
    for (const item of items) expect(item.text).not.toMatch(/SANDBOX_|_FAIL|_UNAVAILABLE/);
    expect(codes).toEqual(["SANDBOX_STEP_RECONCILIATION_FAIL", "SANDBOX_STEP_CLEANUP_UNAVAILABLE", "SANDBOX_STEP_EXIT_REVIEW_UNAVAILABLE"]);
  });

  it("a server blocker no step explains is said once, without inventing a sentence for it", () => {
    const { items } = blockers(v1({ progress: { passed: 4, total: 7, eligible: false, blockerCodes: ["SANDBOX_STEP_RECONCILIATION_FAIL", "SOME_NEW_CODE", "ANOTHER_NEW_CODE"], evidenceSetHash: null } }));
    expect(items.map((i) => i.text)).toContain("The server lists 2 other blockers without a published sentence.");
  });

  it("not eligible and nothing to say: the server's own refusal, not a silent empty list", () => {
    const view = v1({ steps: { availability: "absent", text: "x", code: null }, progress: { passed: null, total: null, eligible: false, blockerCodes: [], evidenceSetHash: null }, findings: { total: 0, returned: 0, truncated: false, rows: [] } });
    expect(blockers(view).items.map((i) => i.text)).toEqual(["The server has not marked this certification eligible."]);
  });

  it("V2 has no server blockers: nothing is listed", () => {
    expect(blockers(v2())).toEqual({ items: [], codes: [] });
  });

  it("an unreadable step is its own line; a stale one is not a failure", () => {
    const { items } = blockers(v1({ steps: { availability: "available", items: steps(["pass", "stale", "pass", "unknown", "pass", "pass", "pass"]) }, findings: null }));
    expect(items.map((i) => i.text)).toContain("Step 2 has stale evidence.");
    expect(items.map((i) => i.text)).toContain("Step 4 could not be read.");
    expect(items.map((i) => i.text).join(" ")).not.toContain("failed");
  });

  it("Submit for review names the gate when the gate is shut; otherwise the profile reason", () => {
    expect(submitReason("blocked", "Not enabled for this profile")).toMatch(/Blocked/);
    expect(submitReason("unknown", "Not enabled for this profile")).toBe("Not enabled for this profile");
    expect(submitReason("eligible", "Not enabled for this profile")).toBe("Not enabled for this profile");
  });
});

describe("the three chips never invent a state", () => {
  it("runtime is Not published (FE-027) while the source states none; a published word is shown unstyled", () => {
    expect(chipsOf(v1()).runtime).toEqual({ state: "not-published", id: "FE-027" });
    expect(chipsOf(v2()).runtime).toEqual({ state: "not-published", id: "FE-027" });
    expect(chipsOf(v1({ runtimeState: "RUNNING" })).runtime).toEqual({ state: "dot", tone: "mute", text: "Running" });
  });

  it("freshness: the worst state the server published, with its as-of; dark panels are Not available", () => {
    expect(chipsOf(v1()).freshness).toMatchObject({ state: "not-available" });
    expect(chipsOf(v2()).freshness).toMatchObject({ state: "not-available", reason: "No source panel in this response" });
    const ok = chipsOf(v1({ panels: [panel("internal", { state: "ok", freshness: "OK", asOf: utc(12, 4) }), panel("broker", { freshness: "UNKNOWN" })] })).freshness;
    expect(ok).toEqual({ state: "dot", tone: "ok", text: "Fresh · 17 Oct 12:04Z" });
    const stale = chipsOf(v1({ panels: [panel("internal", { state: "ok", freshness: "OK", asOf: utc(1, 0) }), panel("broker", { state: "stale", freshness: "STALE", asOf: utc(11, 40) })] })).freshness;
    expect(stale).toEqual({ state: "dot", tone: "warn", text: "Stale · 17 Oct 11:40Z" });
  });

  it("freshness: a withheld or failed panel makes no claim, whatever freshness word it carries (Canary's rule)", () => {
    const fresh = (over: Partial<PanelView>) => chipsOf(v1({ panels: [panel("broker", { freshness: "OK", asOf: utc(12, 4), ...over })] })).freshness;
    expect(fresh({ state: "unavailable" })).toEqual({ state: "not-available", reason: "Source unavailable" });
    expect(fresh({ state: "denied" })).toEqual({ state: "not-available", reason: "Source unavailable" });
    expect(fresh({ state: "terminal" })).toEqual({ state: "not-available", reason: "Source unavailable" });
    expect(fresh({ state: "ok", suppressed: true })).toEqual({ state: "not-available", reason: "Withheld by the server" });
    expect(fresh({ state: "ok" })).toEqual({ state: "dot", tone: "ok", text: "Fresh · 17 Oct 12:04Z" });
    // One good panel still speaks; a failed one beside it does not drag the chip to OK or hide a stale one.
    const mixed = chipsOf(v1({ panels: [panel("internal", { state: "unavailable", freshness: "OK", asOf: utc(1, 0) }), panel("broker", { state: "stale", freshness: "STALE", asOf: utc(11, 40) })] })).freshness;
    expect(mixed).toEqual({ state: "dot", tone: "warn", text: "Stale · 17 Oct 11:40Z" });
  });

  it("reconciliation: V2 is Not published; findings recorded are counted as recorded, not open; zero against dark sources is not a clean result", () => {
    expect(chipsOf(v2()).reconciliation).toEqual({ state: "not-published", id: "FE-072" });
    expect(chipsOf(v1()).reconciliation).toMatchObject({ state: "flag", kind: "partial", label: "2 recorded" });
    const none = { findings: { total: 0, returned: 0, truncated: false, rows: [] } };
    expect(chipsOf(v1(none)).reconciliation).toMatchObject({ state: "not-available" });
    expect(chipsOf(v1({ ...none, panels: [panel("internal", { state: "ok" })] })).reconciliation).toMatchObject({ state: "flag", kind: "ok", label: "None recorded" });
  });
});

describe("reconciliation, suppression and the spine", () => {
  it("only a withheld Broker or Difference panel suppresses the columns", () => {
    expect(figuresSuppressed(v1())).toBe(false);
    expect(figuresSuppressed(v1({ panels: [panel("broker", { suppressed: true })] }))).toBe(true);
    expect(figuresSuppressed(v1({ panels: [panel("difference", { suppressed: true })] }))).toBe(true);
    expect(figuresSuppressed(v1({ panels: [panel("internal", { suppressed: true })] }))).toBe(false);
  });

  it("a panel line says who, what state and how fresh, in words", () => {
    expect(panelLine(panel("internal"))).toBe("Execution · Unavailable · Freshness unknown");
    expect(panelLine(panel("broker", { authority: "BROKER", state: "stale", freshness: "STALE", asOf: utc(11, 40) }))).toBe("Broker · Stale · Stale · 17 Oct 11:40Z");
  });

  it("the spine carries the lineage as lines; no stage is `done`", () => {
    const facts = spineFacts(v1({ lineage: [{ kind: "r1", value: "AP-101", href: null }, { kind: "r2", value: "AP-207", href: null }, { kind: "paper", value: "PX-29", href: null }, { kind: "grant", value: "g1", href: null }] }));
    expect(facts).toEqual({ r1: { line: "AP-101" }, r2: { line: "AP-207" }, paper: { line: "PX-29" } });
    expect(Object.values(facts).some((f) => f?.outcome === "done")).toBe(false);
  });

  it("subtitle: only what the body published", () => {
    expect(subtitleOf(v1(), "route_id")).toBe("Deployment dep_TEST_ONLY_a · OKX · account okx_testnet_main");
    expect(subtitleOf(v2({ deploymentId: "dep_TEST_ONLY_b", venue: null, accountRef: null, portfolioId: "pf_TEST_ONLY" }), "route_id")).toBe("Deployment dep_TEST_ONLY_b · portfolio pf_TEST_ONLY");
    expect(subtitleOf(v1({ deploymentId: null, venue: null, accountRef: null }), "route_id")).toBe("Deployment route_id");
  });

  it("the Steps tab prints (7) only when seven steps are drawn", () => {
    expect(tabsOf(v1()).find((t) => t.id === "steps")?.count).toBe(7);
    expect(tabsOf(v2({ steps: { availability: "absent", text: "x", code: "C" } })).find((t) => t.id === "steps")?.count).toBeNull();
    expect(tabsOf(null).map((t) => t.id)).toEqual(["reconciliation", "steps", "promotion-plans", "timeline"]);
  });
});

describe("words", () => {
  it("severity and action words are closed vocabularies; an unlisted word is Unknown, not Info", () => {
    expect(severityFlag("CRITICAL")).toEqual({ kind: "rejected", label: "Critical" });
    expect(severityFlag("INFO")).toEqual({ kind: "neutral", label: "Info" });
    expect(severityFlag(null)).toEqual({ kind: "unknown", label: "Unknown" });
    expect(severityFlag("SEVERE")).toEqual({ kind: "unknown", label: "Unknown" });
    expect(actionWord("APPROVE").label).toBe("Approved");
    expect(actionWord(null).outcome).toBe("Unrecognised action");
  });
  it("humanize never leaves a blank", () => {
    expect(humanize("PLAN_PROMOTION")).toBe("Plan promotion");
    expect(humanize("___")).toBe("___");
  });
});

describe("the review note follows the server's bounds (D8), not the hi-fi's 24", () => {
  const ok = { summary: "A real note.", workspaceId: "ws_TEST_ONLY", certificationId: "cert_TEST_ONLY_a", workflowVersion: 3 };

  it("publishes the server's bounds", () => {
    expect([NOTE_MIN, NOTE_MAX]).toEqual([8, 1000]);
  });

  it.each([
    ["7 characters: too short", { ...ok, summary: "1234567" }, "short", "Needs at least 8 characters (7 so far)"],
    ["8 characters: allowed", { ...ok, summary: "12345678" }, null, null],
    ["8 characters of spaces and one letter: counted trimmed", { ...ok, summary: "   a      " }, "short", "Needs at least 8 characters (1 so far)"],
    ["1000: allowed", { ...ok, summary: "x".repeat(1000) }, null, null],
    ["1001: too long", { ...ok, summary: "x".repeat(1001) }, "long", "At most 1000 characters (1001 so far)"],
    ["no workspace: the note cannot be bound", { ...ok, workspaceId: null }, "workspace", null],
    ["no workflow version: the note cannot be bound", { ...ok, workflowVersion: null }, "version", null],
  ] as const)("%s", (_name, input, code, text) => {
    const block = noteBlock(input);
    expect(block?.code ?? null).toBe(code);
    if (text !== null) expect(block?.text).toBe(text);
  });

  it("a note with a control or direction character is refused before any length rule; a line break is a person's own and is fine", () => {
    const bidi = String.fromCodePoint(0x202e);
    const zero = String.fromCodePoint(0x200b);
    const nul = String.fromCodePoint(0);
    for (const hostile of [bidi, zero, nul]) {
      const block = noteBlock({ ...ok, summary: `A real note ${hostile} here.` });
      expect(block?.code).toBe("hostile");
      expect(block?.text).toContain("control or direction character");
    }
    expect(noteBlock({ ...ok, summary: `${bidi}x` })?.code).toBe("hostile");
    expect(noteBlock({ ...ok, summary: "First line.\nSecond line.\tTabbed." })).toBeNull();
  });

  it("counts code points the way the schema does: an emoji is one character, not two", () => {
    expect(noteLength("12345678")).toBe(8);
    expect(noteLength("1234567😀")).toBe(8);
    expect("1234567😀".length).toBe(9);
    expect(noteBlock({ ...ok, summary: "1234567😀" })).toBeNull();
  });

  it("the key follows the intent: same text, same fingerprint; any change, another", () => {
    expect(noteFingerprint(ok)).toBe(noteFingerprint({ ...ok, summary: "  A real note.  " }));
    expect(noteFingerprint(ok)).not.toBe(noteFingerprint({ ...ok, summary: "A real note!" }));
    expect(noteFingerprint(ok)).not.toBe(noteFingerprint({ ...ok, workflowVersion: 4 }));
    expect(noteFingerprint(ok)).not.toBe(noteFingerprint({ ...ok, certificationId: "cert_TEST_ONLY_b" }));
  });

  it("a request key is the server's shape and never repeats", () => {
    const keys = new Set(Array.from({ length: 50 }, () => newNoteKey()));
    expect(keys.size).toBe(50);
    for (const key of keys) expect(key).toMatch(/^[A-Za-z0-9._:-]{1,192}$/);
  });
});
