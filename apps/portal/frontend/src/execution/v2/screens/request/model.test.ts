/**
 * New request model: the validation matrix, hostile text, prefill, pickers, the typed refusal mapping.
 * Pure functions only; no React, no network.
 */
import { describe, expect, it } from "vitest";

import type { RunOption } from "../../../runSuggestions";
import {
  alphaChoices,
  checkSummary,
  claimView,
  codePointCount,
  dueText,
  EMPTY_FIELDS,
  failureKind,
  hostileCharacters,
  MAX_SUMMARY,
  MIN_SUMMARY,
  payloadIdentity,
  readOutcome,
  readPrefill,
  refusalOf,
  runChoices,
  runLabel,
  safeApprovalId,
  showable,
  splitReason,
  stillNeeded,
  submitGate,
  summaryCounter,
  validateFields,
  type RequestFields,
} from "./model";

const u = (n: number): string => String.fromCodePoint(n);

const OK: RequestFields = { alphaId: "alpha_TEST_ONLY_a", runId: "run_TEST_ONLY_1", claimId: "claim_TEST_ONLY_1", summary: "Momentum with a venue calendar." };

const run = (over: Partial<RunOption> & Pick<RunOption, "runId" | "alphaId">): RunOption => ({ alphaName: null, createdMs: null, ...over });

describe("limits come from the contract, not from the hi-fi (D8)", () => {
  it("minimum summary is the server's 8, maximum its 2,000", () => {
    expect(MIN_SUMMARY).toBe(8);
    expect(MAX_SUMMARY).toBe(2000);
  });
});

describe("validation matrix", () => {
  it("accepts a complete request and builds the trimmed payload", () => {
    const v = validateFields({ alphaId: " alpha_TEST_ONLY_a ", runId: "run_TEST_ONLY_1 ", claimId: " claim_TEST_ONLY_1", summary: "  Momentum with a venue calendar.  " });
    expect(v.ready).toBe(true);
    expect(v.needs).toEqual([]);
    expect(v.payload).toEqual({ alphaId: "alpha_TEST_ONLY_a", evidenceRunId: "run_TEST_ONLY_1", methodologyClaimId: "claim_TEST_ONLY_1", summary: "Momentum with a venue calendar." });
  });

  it("an empty form needs all four things, in the order the hi-fi names them", () => {
    const v = validateFields(EMPTY_FIELDS);
    expect(v.ready).toBe(false);
    expect(v.payload).toBeNull();
    expect(v.needs.map((n) => n.field)).toEqual(["alpha", "run", "claim", "summary"]);
    expect(stillNeeded(v.needs)).toBe("Still needed: an alpha, an evidence run, a methodology claim, a summary of 8+ characters (0 so far).");
  });

  it.each([
    ["alphaId", "alpha", "an alpha"],
    ["runId", "run", "an evidence run"],
    ["claimId", "claim", "a methodology claim"],
  ] as const)("a missing %s blocks on its own and names itself", (key, field, text) => {
    const v = validateFields({ ...OK, [key]: "   " });
    expect(v.ready).toBe(false);
    expect(v.needs).toEqual([{ field, text }]);
  });

  it.each([
    ["a space inside", "run id 1"],
    ["a slash", "run/1"],
    ["a newline", "run\n1"],
    ["a bidi override", `run${u(0x202e)}1`],
    ["a zero-width space", `run${u(0x200b)}1`],
    ["a percent escape", "run%201"],
    ["192 characters", "r".repeat(192)],
  ])("an id with %s is not an id", (_name, bad) => {
    for (const key of ["alphaId", "runId", "claimId"] as const) {
      const v = validateFields({ ...OK, [key]: bad });
      expect(v.ready, key).toBe(false);
      expect(v.needs[0]?.text, key).toMatch(/^a valid /);
    }
  });

  it("191 characters is still an id", () => {
    expect(validateFields({ ...OK, runId: "r".repeat(191) }).ready).toBe(true);
  });

  it("summary boundary: 7 is short, 8 passes, 2000 passes, 2001 is long", () => {
    expect(validateFields({ ...OK, summary: "1234567" }).needs[0]?.text).toBe("a summary of 8+ characters (7 so far)");
    expect(validateFields({ ...OK, summary: "12345678" }).ready).toBe(true);
    expect(validateFields({ ...OK, summary: "x".repeat(2000) }).ready).toBe(true);
    const long = validateFields({ ...OK, summary: "x".repeat(2001) });
    expect(long.ready).toBe(false);
    expect(long.needs[0]?.text).toBe("a summary of 2,000 characters or fewer (2,001 now)");
  });

  it("the summary is counted trimmed: 20 spaces and 3 letters is 3, not 23", () => {
    expect(validateFields({ ...OK, summary: `${" ".repeat(20)}abc${" ".repeat(20)}` }).summary).toMatchObject({ state: "short", count: 3 });
  });

  it("counts code points for the minimum: four emoji are 4 characters, not 8", () => {
    const four = "\u{1F600}".repeat(4);
    expect(four.length).toBe(8);
    expect(checkSummary(four)).toMatchObject({ state: "short", count: 4 });
  });

  it("uses the larger of code points and UTF-16 units for the maximum, so the server cannot count it as longer", () => {
    // 1001 emoji = 1001 code points but 2002 UTF-16 units.
    expect(checkSummary("\u{1F600}".repeat(1001)).state).toBe("long");
    expect(checkSummary("\u{1F600}".repeat(1000)).state).toBe("ok");
  });

  it("70,000 characters is rejected before send, with the count shown", () => {
    const v = validateFields({ ...OK, summary: "a".repeat(70_000) });
    expect(v.ready).toBe(false);
    expect(v.payload).toBeNull();
    expect(summaryCounter(v.summary)).toBe("70,000 · max 2,000");
  });

  it("a multi-megabyte paste is answered 'too long' without a scan, and is still never ready", () => {
    const huge = "x".repeat(3_000_000);
    const started = Date.now();
    const v = validateFields({ ...OK, summary: huge });
    expect(Date.now() - started).toBeLessThan(250);
    expect(v.summary.state).toBe("long");
    expect(v.ready).toBe(false);
  });

  it("counter reads `n · min 8` until it is over the maximum", () => {
    expect(summaryCounter(checkSummary(""))).toBe("0 · min 8");
    expect(summaryCounter(checkSummary("abc"))).toBe("3 · min 8");
  });

  it("a tab and line breaks are ordinary summary text", () => {
    expect(checkSummary("Line one.\r\nLine two.\tTabbed.").state).toBe("ok");
  });
});

describe("hostile text in the summary", () => {
  const BAD: readonly [string, string, string][] = [
    ["right-to-left override", `${u(0x202e)}`, "U+202E"],
    ["left-to-right embedding", `${u(0x202a)}`, "U+202A"],
    ["right-to-left isolate", `${u(0x2067)}`, "U+2067"],
    ["pop directional isolate", `${u(0x2069)}`, "U+2069"],
    ["right-to-left mark", `${u(0x200f)}`, "U+200F"],
    ["Arabic letter mark", `${u(0x061c)}`, "U+061C"],
    ["zero-width space", `${u(0x200b)}`, "U+200B"],
    ["zero-width joiner", `${u(0x200d)}`, "U+200D"],
    ["word joiner", `${u(0x2060)}`, "U+2060"],
    ["byte order mark", `${u(0xfeff)}`, "U+FEFF"],
    ["soft hyphen", `${u(0x00ad)}`, "U+00AD"],
    ["line separator", `${u(0x2028)}`, "U+2028"],
    ["paragraph separator", `${u(0x2029)}`, "U+2029"],
    ["NUL", "\u0000", "U+0000"],
    ["escape", "\u001B", "U+001B"],
    ["backspace", "\u0008", "U+0008"],
    ["DEL", "\u007F", "U+007F"],
    ["C1 next line", "\u0085", "U+0085"],
    ["tag character", "\u{E0041}", "U+E0041"],
    ["lone high surrogate", "\uD800", "U+D800"],
    ["lone low surrogate", "\uDC00", "U+DC00"],
  ];

  it.each(BAD)("%s is refused before send and named", (_name, char, label) => {
    const v = validateFields({ ...OK, summary: `Approve this${char}, it is fine.` });
    expect(v.ready).toBe(false);
    expect(v.payload).toBeNull();
    expect(v.summary.state).toBe("hostile");
    expect(v.summary.hostile).toContain(label);
    expect(v.needs.find((n) => n.field === "summary")?.text).toContain(label);
  });

  it("an RLO that would reorder `evil.exe` is not sent", () => {
    expect(validateFields({ ...OK, summary: `Harmless text ${u(0x202e)}txt.exe and more` }).ready).toBe(false);
  });

  it("names at most four distinct code points", () => {
    expect(hostileCharacters(`${u(0x202a)}${u(0x202b)}${u(0x202c)}${u(0x202d)}${u(0x202e)}${u(0x200b)}`)).toEqual(["U+202A", "U+202B", "U+202C", "U+202D"]);
  });

  it("an astral emoji is not mistaken for a surrogate problem", () => {
    expect(hostileCharacters("fine \u{1F600} text")).toEqual([]);
  });

  it("showable spells hostile characters out instead of interpreting them, and cuts long text", () => {
    expect(showable(`pay${u(0x202e)}evil`)).toBe("pay[U+202E]evil");
    expect(showable("a".repeat(500), 100)).toHaveLength(101);
    expect(showable("a".repeat(500), 100).endsWith("…")).toBe(true);
  });

  it("codePointCount counts a pair once", () => {
    expect(codePointCount("a\u{1F600}b")).toBe(3);
  });
});

describe("submit gate", () => {
  const ready = validateFields(OK);
  const incomplete = validateFields(EMPTY_FIELDS);

  it("opens only when valid, idle, unsettled and the policy allows", () => {
    expect(submitGate({ validation: ready, submitting: false, settled: false, writeBlockedReason: null })).toEqual({ open: true });
    expect(submitGate({ validation: ready, submitting: false, settled: false, writeBlockedReason: undefined })).toEqual({ open: true });
  });

  it("the policy is the first reason, even for a complete form", () => {
    const gate = submitGate({ validation: ready, submitting: false, settled: false, writeBlockedReason: "Recording is disabled by policy revision 4." });
    expect(gate).toEqual({ open: false, kind: "policy", reason: "Recording is disabled by policy revision 4." });
  });

  it("a blank policy reason is not a reason", () => {
    expect(submitGate({ validation: ready, submitting: false, settled: false, writeBlockedReason: "  " })).toEqual({ open: true });
  });

  it("while sending, the reason is sending, not the field list", () => {
    expect(submitGate({ validation: incomplete, submitting: true, settled: false, writeBlockedReason: null })).toMatchObject({ open: false, kind: "sending" });
  });

  it("an incomplete form says to fill the fields", () => {
    expect(submitGate({ validation: incomplete, submitting: false, settled: false, writeBlockedReason: null })).toEqual({ open: false, kind: "incomplete", reason: "Fill the missing fields first." });
  });

  it("a recorded request closes the gate", () => {
    expect(submitGate({ validation: ready, submitting: false, settled: true, writeBlockedReason: null })).toMatchObject({ open: false, kind: "settled" });
  });
});

describe("prefill from the link", () => {
  it("reads alpha, run and claim as V1 does", () => {
    const read = readPrefill(new URLSearchParams("alpha=alpha_TEST_ONLY_a&run=run_TEST_ONLY_1&claim=claim_TEST_ONLY_1"));
    expect(read.prefill).toEqual({ alphaId: "alpha_TEST_ONLY_a", runId: "run_TEST_ONLY_1", claimId: "claim_TEST_ONLY_1" });
    expect(read.notices).toEqual([]);
  });

  it("drops an invalid id and says so, and keeps the valid ones", () => {
    const read = readPrefill(new URLSearchParams({ alpha: "a b", run: "run_TEST_ONLY_1", claim: `x${u(0x202e)}y` }));
    expect(read.prefill).toEqual({ runId: "run_TEST_ONLY_1" });
    expect(read.notices).toHaveLength(2);
    expect(read.notices[0]).toContain("alpha");
    expect(read.notices[1]).toContain("methodology claim");
  });

  it("empty and absent values are not notices", () => {
    expect(readPrefill(new URLSearchParams("alpha=&run=%20")).notices).toEqual([]);
  });
});

describe("pickers", () => {
  const options: RunOption[] = [
    run({ runId: "r1", alphaId: "a1", alphaName: "Trend", createdMs: Date.UTC(2026, 9, 12) }),
    run({ runId: "r2", alphaId: "a1", alphaName: "Trend", createdMs: Date.UTC(2026, 9, 18) }),
    run({ runId: "r3", alphaId: "a2", alphaName: "Trend" }),
    run({ runId: "r4", alphaId: "a3", alphaName: null }),
    run({ runId: "r5", alphaId: "a4", alphaName: "Break" }),
  ];

  it("alphas come from completed runs, one entry per alpha, sorted, and two with one name are told apart by id", () => {
    const choices = alphaChoices(options);
    expect(choices.map((c) => c.label)).toEqual(["a3", "Break", "Trend (a1)", "Trend (a2)"]);
    expect(choices.find((c) => c.id === "a1")?.runCount).toBe(2);
  });

  it("runs of one alpha are newest first and a run without a date sorts last", () => {
    expect(runChoices(options, "a1").map((o) => o.runId)).toEqual(["r2", "r1"]);
    expect(runChoices(options, "nope")).toEqual([]);
  });

  it("a run label carries the id and the UTC day, or the id alone when the date is unknown", () => {
    expect(runLabel(options[0]!)).toBe("r1 · 2026-10-12");
    expect(runLabel(options[3]!)).toBe("r4");
  });

  describe("claim view keeps the four answers apart", () => {
    const claims = [{ id: "c1", grade: "A", state: "ELIGIBLE" }, { id: "c2", grade: null, state: null }];
    const o: RunOption[] = [
      run({ runId: "one", alphaId: "a", claims: [claims[0]!] }),
      run({ runId: "many", alphaId: "a", claims: claims }),
      run({ runId: "none", alphaId: "a", claims: [] }),
      run({ runId: "cannot", alphaId: "a", claims: null, claimsReason: "R1_CLAIMS_NOT_PUBLISHED" }),
      run({ runId: "legacy", alphaId: "a" }),
    ];
    it.each([
      ["", "pick-run"],
      ["unlisted-by-hand", "typed"],
      ["one", "only"],
      ["many", "pick"],
      ["none", "none-listed"],
      ["cannot", "cannot-list"],
      ["legacy", "not-published"],
    ])("run %j -> %s", (runId, kind) => {
      expect(claimView(o, runId).kind).toBe(kind);
    });
    it("the cannot-list answer carries the server's reason", () => {
      expect(claimView(o, "cannot")).toEqual({ kind: "cannot-list", reason: "R1_CLAIMS_NOT_PUBLISHED" });
    });
  });
});

describe("the server's answer (readOutcome)", () => {
  const created = { kind: "created", approvalId: "apr_TEST_ONLY_1", subjectLabel: "x", status: "PENDING", slaDueAt: "2026-10-20T12:00:00.000Z", policyVersion: "approval.v3", quorumRequired: 2, requester: "lan" };

  it("keeps the four documented shapes", () => {
    expect(readOutcome(created)).toEqual(created);
    expect(readOutcome({ ...created, kind: "replayed" }).kind).toBe("replayed");
    expect(readOutcome({ kind: "duplicate", existingApprovalId: "apr_TEST_ONLY_2", reason: "dup" })).toEqual({ kind: "duplicate", existingApprovalId: "apr_TEST_ONLY_2", reason: "dup" });
    expect(readOutcome({ kind: "failed", status: "denied", reason: "no" })).toEqual({ kind: "failed", status: "denied", reason: "no" });
    expect(readOutcome({ kind: "failed", status: "unavailable", reason: "x", offline: true })).toMatchObject({ offline: true });
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["a string", "created"],
    ["an array", []],
    ["an unknown kind", { kind: "approved" }],
    ["created without an id", { kind: "created", approvalId: "" }],
    ["created with a numeric id", { kind: "created", approvalId: 7 }],
    ["a number", 7],
  ])("%s is a failed read, never a created approval", (_n, raw) => {
    const out = readOutcome(raw);
    expect(out.kind).toBe("failed");
  });

  it("a bad quorum or status word is not trusted", () => {
    expect(readOutcome({ ...created, quorumRequired: -1 })).toMatchObject({ quorumRequired: null });
    expect(readOutcome({ ...created, quorumRequired: 1.5 })).toMatchObject({ quorumRequired: null });
    expect(readOutcome({ ...created, quorumRequired: "2" })).toMatchObject({ quorumRequired: null });
    expect(readOutcome({ kind: "failed", status: "weird", reason: "x" })).toMatchObject({ status: "unavailable" });
  });

  it("does not read through the prototype", () => {
    const polluted = Object.create({ kind: "created", approvalId: "apr_TEST_ONLY_9" });
    // Own-property reads only would be stricter; what must hold is that a hostile prototype cannot make a failed body a success.
    expect(readOutcome(JSON.parse('{"__proto__":{"kind":"created"},"kind":"failed","status":"denied","reason":"no"}')).kind).toBe("failed");
    expect(["created", "failed"]).toContain(readOutcome(polluted).kind);
  });
});

describe("typed refusal mapping", () => {
  it("splits `CODE: message` as the HTTP port writes it", () => {
    expect(splitReason("EVIDENCE_RUN_NOT_ELIGIBLE: Evidence run is not eligible.")).toEqual({ code: "EVIDENCE_RUN_NOT_ELIGIBLE", message: "Evidence run is not eligible." });
    expect(splitReason("no code here")).toEqual({ code: null, message: "no code here" });
    expect(splitReason("lowercase_code: nope")).toEqual({ code: null, message: "lowercase_code: nope" });
  });

  it.each([
    ["EVIDENCE_RUN_NOT_ELIGIBLE", "That run is not eligible for this alpha and methodology claim."],
    ["CLAIM_NOT_ELIGIBLE", "The methodology claim is not eligible for this run."],
    ["EVIDENCE_RUN_NOT_FOUND", "The server does not know that evidence run."],
    ["REQUEST_KEY_PAYLOAD_CONFLICT", "An earlier submit with the same key had different content, so this one was refused. Start a new request."],
    ["WORKSPACE_ACCESS_DENIED", "You are not a member of the workspace this request would be created in."],
  ])("%s maps to one plain sentence", (code, sentence) => {
    expect(refusalOf(`${code}: server words`).sentence).toBe(sentence);
  });

  it("an unknown code gets no invented sentence; the server's words are the headline", () => {
    const r = refusalOf("UNKNOWN_REGISTRY_ID: alpha_id mystery is not in the registry");
    expect(r.sentence).toBeNull();
    expect(r.code).toBe("UNKNOWN_REGISTRY_ID");
    expect(r.message).toBe("alpha_id mystery is not in the registry");
  });

  it("verbatim keeps the whole reason and spells hostile characters out", () => {
    expect(refusalOf(`X_CODE: pay${u(0x202e)}evil`).verbatim).toBe("X_CODE: pay[U+202E]evil");
  });

  const failed = (reason: string, status: "denied" | "unavailable" | "stale" = "unavailable", offline?: boolean) => ({ kind: "failed" as const, status, reason, ...(offline ? { offline } : {}) });
  it.each([
    [failed("never reached", "unavailable", true), "uncertain"],
    [failed("HTTP_403: nope", "denied"), "denied"],
    [failed("WORKSPACE_ACCESS_DENIED: Access denied.", "unavailable"), "denied"],
    [failed("SESSION_REQUIRED: sign in", "denied"), "denied"],
    [failed("EVIDENCE_RUN_NOT_ELIGIBLE: x"), "refused"],
    [failed("DUPLICATE_THING: x"), "refused"],
    [failed("HTTP_503: The request failed."), "unavailable"],
    [failed("This screen has no published delivery policy, so no decision can be recorded on it."), "unavailable"],
  ])("%j is %s", (outcome, kind) => {
    expect(failureKind(outcome)).toBe(kind);
  });
});

describe("routes and times", () => {
  it("an approval id is a path segment only when it is an id", () => {
    expect(safeApprovalId("apr_01J6N29PRODUCT")).toBe("apr_01J6N29PRODUCT");
    expect(safeApprovalId("AP-203")).toBe("AP-203");
    expect(safeApprovalId("../admin")).toBeNull();
    expect(safeApprovalId("a b")).toBeNull();
    expect(safeApprovalId("")).toBeNull();
    expect(safeApprovalId(null)).toBeNull();
    expect(safeApprovalId(`apr${u(0x202e)}1`)).toBeNull();
  });

  it("a due time is UTC to the minute, or nothing when the text is not an instant", () => {
    expect(dueText("2026-10-20T12:34:56.000Z")).toBe("2026-10-20 12:34 UTC");
    expect(dueText("tomorrow")).toBeNull();
    expect(dueText(null)).toBeNull();
  });

  it("the key identity changes with any field and with nothing else", () => {
    const base = { alphaId: "a", evidenceRunId: "r", methodologyClaimId: "c", summary: "s" };
    expect(payloadIdentity(base)).toBe(payloadIdentity({ ...base }));
    for (const key of Object.keys(base) as (keyof typeof base)[]) expect(payloadIdentity({ ...base, [key]: "z" })).not.toBe(payloadIdentity(base));
  });

  it("identity cannot be forged by moving text between fields", () => {
    expect(payloadIdentity({ alphaId: "a,b", evidenceRunId: "c", methodologyClaimId: "d", summary: "e" }))
      .not.toBe(payloadIdentity({ alphaId: "a", evidenceRunId: "b,c", methodologyClaimId: "d", summary: "e" }));
  });
});
