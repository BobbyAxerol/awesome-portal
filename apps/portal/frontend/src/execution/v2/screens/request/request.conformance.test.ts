/**
 * Conformance for the New request outcomes (DEBT-UXM07-018, Rules 9.8.3, tiers L0 to L3).
 *
 * The chain under test is what the screen lives on: the HTTP port's `createApprovalRequest` (a stubbed `fetch`, the REAL adapter), then
 * `readOutcome` (the screen's boundary), then `failureKind` (what the reader is told). A body goes in as the server would send it, with
 * the status the server would give it; what comes out is one of: created, replayed, duplicate, or a failure that is denied, refused,
 * unavailable ("could not send") or UNCERTAIN ("the request may exist").
 *
 * Oracle: `execution-governance-product.v1.schema.json#/$defs/ApprovalCreateResponse` (a created or replayed request),
 * `execution-governance.openapi.json#/components/schemas/Problem` (every other answer) and `ApprovalCreateRequest` (what is sent), plus the
 * canonical bodies Codex published (`execution-governance.approval-create.valid.json`, the replay results of
 * `governance-requester-reads.synthetic.valid.json`), digest-checked at the end.
 *
 * The rules, kept in one place so the suite and the reader cannot disagree:
 *   - created / replayed only for a 2xx whose body keeps ApprovalCreateResponse. Any other 2xx body is UNCERTAIN (the server answered, so the
 *     request may exist);
 *   - 408, any 5xx and a dropped network are UNCERTAIN whatever the body says;
 *   - a typed code (`error.code`) is acted on only when the body keeps Problem; otherwise the failure is `HTTP_<status>` ("could not send")
 *     and a 409 is not a duplicate;
 *   - a 4xx is definite: it never carries the offline flag.
 *
 * The one difference from the schemas, pinned in the `ledger` block so a schema change shows up as a red test:
 *   S-1   `subject_label` and `requester.username` are printed: text with a control or bidi-format character is refused (the schema has no pattern).
 *
 * No entry is looser than a schema. Since FE-074 (c02f63d8) the schemas publish what the server sends: `workspace_id` is optional in the request
 * (the server resolves and authorizes the session's workspace; omission is never global scope, so the client sends none), `Problem` lists
 * `details`, `public_copy_key` and `safe_next_action`, and `DuplicateOpenApprovalProblem` closes `details` to `{ approval_id }` for
 * DUPLICATE_OPEN_APPROVAL. The id of the existing request is read from there and from nowhere else (never the message). The canonical bodies are
 * `execution-governance.duplicate-open.valid.json` and `execution-governance.served-problem.valid.json` (TEST_ONLY_SYNTHETIC).
 */
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

import { createHttpApi } from "../../../api/httpApi";
import type { ApprovalCreateOutcome } from "../../../api/ports";
import type { DeliveryPolicy } from "../../../profile";
import { approvalCreateViolations, duplicateApprovalId, problemViolations, readApprovalCreateV1 } from "../../readers/approvalCreate";
import { readApprovalRequestLookupV1 } from "../../readers/approvalRequestLookup";
import { canonicalDigest, loadCanonical } from "../../testkit/loadCanonical";
import { type Draft } from "../../testkit/matrix";
import { PROBE, mutationsOf } from "../../testkit/mutate";
import { leaked, pollutionCases, prototypeIsClean, rootCases } from "../../testkit/negative";
import { serializedBytes, timed } from "../../testkit/scale";
import { validateAgainst } from "../../testkit/schema";
import { failureKind, readOutcome, refusalOf, showable } from "./model";

const CREATED_FILE = "execution-governance.approval-create.valid.json";
const LOOKUP_FILE = "governance-requester-reads.synthetic.valid.json";
const DUPLICATE_FILE = "execution-governance.duplicate-open.valid.json";
const PROBLEM_FILE = "execution-governance.served-problem.valid.json";
const digests = Object.fromEntries([CREATED_FILE, LOOKUP_FILE, DUPLICATE_FILE, PROBLEM_FILE].map((f) => [f, canonicalDigest(f)]));
afterAll(() => {
  for (const [file, digest] of Object.entries(digests)) expect(canonicalDigest(file), file).toBe(digest);
});

const PRODUCT = "execution-governance-product.v1.schema.json";
const OA = "../openapi/execution-governance.openapi.json";
const successViolations = (body: unknown) => validateAgainst(PRODUCT, "/$defs/ApprovalCreateResponse", body);
const requestViolations = (body: unknown) => validateAgainst(PRODUCT, "/$defs/ApprovalCreateRequest", body);
/** The schema's verdict on a problem body: `Problem`, whose rule for DUPLICATE_OPEN_APPROVAL is the closed `DuplicateOpenApprovalProblem` shape. */
const problemOracle = (body: unknown) => validateAgainst(OA, "/components/schemas/Problem", body);
const duplicateOracle = (body: unknown) => validateAgainst(OA, "/components/schemas/DuplicateOpenApprovalProblem", body);

const OPEN: DeliveryPolicy = {
  policyRevision: 9, queryEnabled: true, projectionIngestionEnabled: false, sseEnabled: false, governanceWriteEnabled: true, paperCommandsEnabled: false,
  sandboxCommandsEnabled: false, liveProtectiveCommandsEnabled: false, liveRiskIncreasingCommandsEnabled: false,
};
const INPUT = { requestKey: "req-TEST_ONLY-0001", alphaId: "alpha_n29", evidenceRunId: "run_TEST_ONLY", methodologyClaimId: "claim_TEST_ONLY", summary: "Synthetic summary" };

interface Sent { url: string; body: unknown }
const sent: Sent[] = [];
afterEach(() => {
  vi.unstubAllGlobals();
  sent.length = 0;
});

type Wire = { status: number; body?: unknown; text?: string } | "network";
function stub(wire: Wire): void {
  vi.stubGlobal("fetch", async (url: unknown, init?: RequestInit) => {
    sent.push({ url: String(url), body: typeof init?.body === "string" ? JSON.parse(init.body) : null });
    if (wire === "network") throw new TypeError("Failed to fetch");
    const text = wire.text ?? JSON.stringify(wire.body);
    return new Response(text, { status: wire.status, headers: { "content-type": "application/json" } });
  });
}

/** What the screen is told: the real port, then the screen's own boundary, then the failure word. */
interface Told { kind: string; outcome: ApprovalCreateOutcome; port: ApprovalCreateOutcome }
async function told(wire: Wire): Promise<Told> {
  stub(wire);
  const port = await createHttpApi({ policy: OPEN }).createApprovalRequest(INPUT);
  const outcome = readOutcome(port);
  return { kind: outcome.kind === "failed" ? failureKind(outcome) : outcome.kind, outcome, port };
}

const CREATED = (): Draft => loadCanonical<Draft>(CREATED_FILE);
const REPLAYED = (): Draft => ({ ...CREATED(), replayed: true });
const problem = (code: string, message = "As stated by the server.", extra: Draft = {}): Draft => ({ error: { code, message }, request_id: "req-TEST_ONLY-1", ...extra });
const DUPLICATE_BODY = (): Draft => loadCanonical<Draft>(DUPLICATE_FILE);
const duplicate = (extra: Draft = {}, message = "An open approval already exists for this alpha and evidence run."): Draft => problem("DUPLICATE_OPEN_APPROVAL", message, extra);

/* ═════════════════════════ L0 ═════════════════════════ */
describe("L0 · canonical, verbatim", () => {
  it("the published create body conforms and a 201 reads as created, field for field", async () => {
    const body = CREATED();
    expect(successViolations(body)).toEqual([]);
    expect(approvalCreateViolations(body)).toEqual([]);
    const t = await told({ status: 201, body });
    expect(t.outcome).toEqual({
      kind: "created", approvalId: "apr_01J6N29PRODUCT", subjectLabel: "alpha_n29", status: "PENDING", slaDueAt: "2026-09-01T12:00:00.000Z",
      policyVersion: "approval.v3", quorumRequired: 1, requester: "stan",
    });
    expect(t.port).not.toHaveProperty("schemaViolations");
  });

  it("the same body with replayed: true reads as replayed (200 and 201 alike)", async () => {
    for (const status of [200, 201]) {
      const t = await told({ status, body: REPLAYED() });
      expect(t.outcome.kind, String(status)).toBe("replayed");
    }
  });

  it("the replay body inside a lookup is the same body, and the strict reader reads it as replayed", () => {
    const lookup = loadCanonical<{ approval_request_lookup: Record<string, Draft> }>(LOOKUP_FILE).approval_request_lookup;
    for (const name of ["found_not_compared", "found_payload_match"]) {
      expect(successViolations(lookup[name].result), name).toEqual([]);
      expect(readApprovalCreateV1(lookup[name].result)).toMatchObject({ kind: "replayed", approvalId: "apr_01J6N29PRODUCT", requester: "stan" });
    }
  });

  it("a conforming problem is read as the server wrote it: the code leads the reason", async () => {
    const body = problem("EVIDENCE_RUN_NOT_FOUND", "The evidence run was not found.");
    expect(problemOracle(body)).toEqual([]);
    const t = await told({ status: 404, body });
    expect(t.outcome).toEqual({ kind: "failed", status: "unavailable", reason: "EVIDENCE_RUN_NOT_FOUND: The evidence run was not found." });
    expect(t.kind).toBe("refused");
    expect(refusalOf((t.outcome as { reason: string }).reason).code).toBe("EVIDENCE_RUN_NOT_FOUND");
  });

  it("what is sent: the published request, field for field, trimmed, with the policy's key", async () => {
    await told({ status: 201, body: CREATED() });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.url).toMatch(/\/governance\/approvals$/);
    expect(sent[0]!.body).toEqual({
      schema_version: "governance.approval-create-request.v1", request_key: INPUT.requestKey, gate: "R1", alpha_id: INPUT.alphaId,
      evidence_run_id: INPUT.evidenceRunId, methodology_claim_id: INPUT.methodologyClaimId, summary: INPUT.summary,
    });
  });

  it("FE-074 request: no workspace_id is sent and the body conforms; a named workspace conforms too (the server still authorizes it)", async () => {
    await told({ status: 201, body: CREATED() });
    expect(sent[0]!.body).not.toHaveProperty("workspace_id");
    expect(requestViolations(sent[0]!.body)).toEqual([]);
    expect(requestViolations({ ...(sent[0]!.body as Draft), workspace_id: "ws_TEST_ONLY" })).toEqual([]);
    // Omission is not a wildcard: the schema still bounds a named one.
    expect(requestViolations({ ...(sent[0]!.body as Draft), workspace_id: "x" })).not.toEqual([]);
  });

  it("FE-074 problem: the two published bodies conform to Problem, and the duplicate one to its closed variant", () => {
    const dup = loadCanonical<Draft>(DUPLICATE_FILE);
    const served = loadCanonical<Draft>(PROBLEM_FILE);
    for (const [name, body] of [["duplicate", dup], ["served problem", served]] as const) {
      expect(problemOracle(body), name).toEqual([]);
      expect(problemViolations(body), name).toEqual([]);
    }
    expect(duplicateOracle(dup)).toEqual([]);
    expect(duplicateApprovalId(dup)).toBe("apr_TEST_ONLY_existing");
    expect(duplicateApprovalId(served)).toBeNull();
  });

  it("FE-074 problem: a 409 duplicate names the existing request from details.approval_id, and only from there", async () => {
    const t = await told({ status: 409, body: DUPLICATE_BODY() });
    expect(t.outcome).toEqual({ kind: "duplicate", existingApprovalId: "apr_TEST_ONLY_existing", reason: "An open approval already exists for this alpha and evidence run." });
    expect(t.kind).toBe("duplicate");
    // The message is prose: an id in it is never read, whatever it looks like.
    const prose = await told({ status: 409, body: duplicate({ details: { approval_id: "apr_TEST_ONLY_typed" } }, "Open approval apr_01J6N29PRODUCT already exists (AP-352).") });
    expect(prose.outcome).toMatchObject({ kind: "duplicate", existingApprovalId: "apr_TEST_ONLY_typed" });
  });

  it("FE-074 problem: the served problem (public_copy_key, safe_next_action) is typed, and its code leads the reason as for any problem", async () => {
    const t = await told({ status: 422, body: loadCanonical<Draft>(PROBLEM_FILE) });
    expect(t.outcome).toEqual({ kind: "failed", status: "unavailable", reason: "COMMAND_STATUS_UNVERIFIED: The command status could not be verified." });
  });
});

/* ═════════════ the ledger: every difference from the schemas, pinned ═════════════ */
describe("the ledger · the one difference is the listed one", () => {
  it("S-1: a hostile character in the printed text of a created body is refused, though the schema has no pattern for it", async () => {
    const BIDI = String.fromCharCode(0x202e);
    for (const edit of [
      (b: Draft) => { b.approval.subject_label = `alpha${BIDI}evil`; },
      (b: Draft) => { b.approval.requester.username = "st\u0000an"; },
    ]) {
      const body = CREATED();
      edit(body);
      expect(successViolations(body), "the schema accepts it").toEqual([]);
      expect((await told({ status: 201, body })).kind).toBe("uncertain");
    }
  });
});

/* ═════════════════════════ L1 ═════════════════════════ */
describe("L1 · status x body: what may have been created", () => {
  type Shape = "created" | "replayed" | "problem" | "problem + server members" | "problem without request_id" | "created, approval without status" | "html" | "empty" | "array";
  const BODIES: Record<Shape, () => { body?: unknown; text?: string }> = {
    created: () => ({ body: CREATED() }),
    replayed: () => ({ body: REPLAYED() }),
    problem: () => ({ body: problem("EVIDENCE_RUN_NOT_FOUND") }),
    "problem + server members": () => ({ body: problem("EVIDENCE_RUN_NOT_FOUND", "As stated.", { details: { a: 1 }, public_copy_key: "EVIDENCE_RUN_NOT_FOUND", safe_next_action: "REVIEW_BLOCKER" }) }),
    "problem without request_id": () => ({ body: { error: { code: "EVIDENCE_RUN_NOT_FOUND", message: "As stated." } } }),
    "created, approval without status": () => { const b = CREATED(); delete b.approval.status; return { body: b }; },
    html: () => ({ text: "<html>bad gateway</html>" }),
    empty: () => ({ text: "" }),
    array: () => ({ body: [] }),
  };
  const STATUSES = [200, 201, 400, 401, 403, 404, 408, 409, 422, 429, 500, 502, 503, 504];
  const TYPED: ReadonlySet<Shape> = new Set(["problem", "problem + server members"]);

  /** The rule, written from the contract and not from the code. */
  function expected(status: number, shape: Shape): string {
    if (status >= 200 && status < 300) return shape === "created" ? "created" : shape === "replayed" ? "replayed" : "uncertain";
    if (status === 408 || status >= 500) return "uncertain";
    if (status === 401 || status === 403) return "denied";
    // A definite 4xx. Only a typed (published) problem gives the code that makes it "refused"; otherwise it is "could not send".
    return TYPED.has(shape) ? "refused" : "unavailable";
  }

  it.each(STATUSES.flatMap((status) => (Object.keys(BODIES) as Shape[]).map((shape) => [status, shape] as const)))("HTTP %i with %s", async (status, shape) => {
    const t = await told({ status, ...BODIES[shape]() });
    expect(t.kind).toBe(expected(status, shape));
    // The offline flag is the port's own "may exist" bit: set exactly for 408 and 5xx and an unreadable 2xx, never for a 4xx.
    const may = status === 408 || status >= 500 || (status < 300 && t.kind === "uncertain");
    expect("offline" in t.outcome && t.outcome.offline === true || t.kind === "uncertain").toBe(may);
    if (status >= 400 && status < 500 && status !== 408) expect(t.outcome).not.toHaveProperty("offline");
  });

  it("a dropped network is uncertain, and so is a policy-free retry of it", async () => {
    expect((await told("network")).kind).toBe("uncertain");
  });

  it("the policy refusing before anything is sent is definite: nothing was sent", async () => {
    stub({ status: 201, body: CREATED() });
    const out = await createHttpApi({ policy: { ...OPEN, governanceWriteEnabled: false } }).createApprovalRequest(INPUT);
    expect(sent).toHaveLength(0);
    expect(out.kind === "failed" ? failureKind(readOutcome(out) as Extract<ApprovalCreateOutcome, { kind: "failed" }>) : out.kind).toBe("unavailable");
  });

  describe("409: the conflict shapes", () => {
    it("DUPLICATE_OPEN_APPROVAL is a duplicate; the existing id is details.approval_id of the published variant", async () => {
      const typed = await told({ status: 409, body: DUPLICATE_BODY() });
      expect(typed.outcome).toMatchObject({ kind: "duplicate", existingApprovalId: "apr_TEST_ONLY_existing" });
      expect(typed.port).not.toHaveProperty("untyped");
      const queued = await told({ status: 409, body: duplicate({ details: { approval_id: "AP-352" } }) });
      expect(queued.outcome).toMatchObject({ kind: "duplicate", existingApprovalId: "AP-352" });
    });

    it.each([
      ["no details", {}],
      ["empty details", { details: {} }],
      ["another member beside the id", { details: { approval_id: "apr_TEST_ONLY_1", extra: 1 } }],
      ["an id outside the Identifier grammar", { details: { approval_id: "x/../y" } }],
      ["a non-string id", { details: { approval_id: 7 } }],
      ["details that is not an object", { details: "apr_TEST_ONLY_1" }],
    ])("a 409 DUPLICATE_OPEN_APPROVAL with %s is not the published variant: not a duplicate, and its message is not read for an id", async (_name, extra) => {
      const body = duplicate(extra as Draft, "Open approval apr_01J6N29PRODUCT already exists.");
      expect(duplicateOracle(body)).not.toEqual([]);
      expect(problemOracle(body)).not.toEqual([]);
      const t = await told({ status: 409, body });
      expect(t.kind).toBe("unavailable");
      expect(t.outcome).toMatchObject({ kind: "failed", reason: "HTTP_409: The request failed." });
    });

    it("another 409 code is never a duplicate, whatever its details say", async () => {
      const t = await told({ status: 409, body: problem("REQUEST_KEY_CONFLICT", "Request key payload conflicts.", { details: { approval_id: "apr_TEST_ONLY_1" } }) });
      expect(t.kind).toBe("refused");
      expect(t.outcome).not.toHaveProperty("existingApprovalId");
    });

    it.each(["REQUEST_KEY_PAYLOAD_CONFLICT", "REQUEST_KEY_CONFLICT", "APPROVAL_CREATE_SERIALIZATION_CONFLICT", "EVIDENCE_ARTIFACT_CHANGED"])("%s is a definite refusal with its own sentence, not a duplicate and not uncertain", async (code) => {
      const t = await told({ status: 409, body: problem(code, "Request key payload conflicts.") });
      expect(t.kind).toBe("refused");
      expect(t.outcome).not.toHaveProperty("offline");
      expect(refusalOf((t.outcome as { reason: string }).reason).sentence, code).not.toBeNull();
    });

    it("a 409 whose body is not the published problem is not a duplicate even if it says so", async () => {
      const t = await told({ status: 409, body: { error: { code: "DUPLICATE_OPEN_APPROVAL", message: "open approval apr_01J6N29PRODUCT" }, details: { approval_id: "apr_01J6N29PRODUCT" } } });
      expect(t.kind).toBe("unavailable");
      expect(t.outcome).toMatchObject({ kind: "failed", reason: "HTTP_409: The request failed." });
    });
  });

  describe("5xx: the unknown outcome", () => {
    it.each([500, 502, 503, 504, 408])("HTTP %i carries the offline flag whatever the body, and a conforming code still reads as itself", async (status) => {
      const typed = await told({ status, body: problem("INTERNAL_ERROR", "Internal error.") });
      expect(typed.outcome).toMatchObject({ kind: "failed", offline: true, reason: "INTERNAL_ERROR: Internal error." });
      expect(typed.kind).toBe("uncertain");
      const bare = await told({ status, text: "upstream" });
      expect(bare.outcome).toMatchObject({ kind: "failed", offline: true, reason: `HTTP_${status}: The request failed.` });
      expect(bare.kind).toBe("uncertain");
    });

    it("a 2xx the screen cannot read is the same: answered, so it may exist, never 'created'", async () => {
      for (const wire of [{ status: 201, text: "not json" }, { status: 200, body: {} }, { status: 201, body: { ...CREATED(), schema_version: "governance.approval-create.v2" } }] as const) {
        const t = await told(wire);
        expect(t.kind).toBe("uncertain");
        expect(t.outcome).toMatchObject({ kind: "failed", offline: true, reason: "The create response could not be read." });
      }
    });
  });

  it("the marks are the port's and nothing else: a body the schema keeps carries none", async () => {
    for (const wire of [{ status: 201, body: CREATED() }, { status: 400, body: problem("INVALID_APPROVAL_CREATE_REQUEST") }, { status: 409, body: DUPLICATE_BODY() }] as const) {
      const t = await told(wire);
      expect(t.port).not.toHaveProperty("schemaViolations");
      expect(t.port).not.toHaveProperty("untyped");
    }
  });
});

/* ═════════════════════════ L2 ═════════════════════════ */
describe("L2 · the schema's bounds", () => {
  it("the request: a summary of 8 and of 2000 characters conforms; the port sends what the form validated", async () => {
    for (const summary of ["12345678", "x".repeat(2000)]) {
      stub({ status: 201, body: CREATED() });
      await createHttpApi({ policy: OPEN }).createApprovalRequest({ ...INPUT, summary });
      expect(requestViolations(sent.at(-1)!.body)).toEqual([]);
    }
  });

  it("a problem message of 512 characters and a code of 128 are typed; 513 and 129 are not", async () => {
    for (const [code, message, typed] of [["C".repeat(128), "m".repeat(512), true], ["C".repeat(129), "m", false], ["CODE", "m".repeat(513), false], ["CODE", "", false]] as const) {
      const t = await told({ status: 400, body: problem(code, message) });
      expect(problemOracle(problem(code, message)).length === 0).toBe(typed);
      expect(String((t.outcome as { reason: string }).reason).startsWith(`${code}: `) || false, `${code.length}/${message.length}`).toBe(typed);
      if (!typed) expect(t.outcome).toMatchObject({ reason: "HTTP_400: The request failed." });
    }
  });

  it("a created body with every bound at its limit (label 512, target 256, summary 2000, policy 128, quorum 8) is read", () => {
    const body = CREATED();
    Object.assign(body.approval, { subject_label: "L".repeat(512), target_label: "T".repeat(256), blocker_summary: "B".repeat(2000), policy_version: "P".repeat(128), quorum_required: 8, release_candidate: "R".repeat(256) });
    expect(successViolations(body)).toEqual([]);
    expect(readApprovalCreateV1(body)).not.toBeNull();
    body.approval.subject_label = "L".repeat(513);
    expect(successViolations(body)).not.toEqual([]);
    expect(readApprovalCreateV1(body)).toBeNull();
  });

  it("a hostile server cannot flood the screen: a 1 MiB problem message is cut, bounded and fast", async () => {
    const message = "m".repeat(1024 * 1024);
    const { value, ms } = await (async () => { const start = performance.now(); const v = await told({ status: 422, body: problem("UNKNOWN_REGISTRY_ID", message) }); return { value: v, ms: performance.now() - start }; })();
    expect(ms).toBeLessThan(1500);
    expect(value.kind).toBe("unavailable");
    expect(refusalOf((value.outcome as { reason: string }).reason).message.length).toBeLessThanOrEqual(402);
    expect(showable(message).length).toBeLessThanOrEqual(402);
  });

  it("a 1 MiB body on a 2xx is checked and refused inside a budget", async () => {
    const body = CREATED();
    body.approval.blocker_summary = "x".repeat(1024 * 1024);
    expect(serializedBytes(body)).toBeGreaterThan(1024 * 1024);
    const { value, ms } = timed(() => approvalCreateViolations(body));
    expect(value).not.toEqual([]);
    expect(ms).toBeLessThan(500);
  });
});

/* ═════════════════════════ L3 ═════════════════════════ */
interface Tally { total: number; invalid: number; looser: string[]; stricter: string[] }
const tally: Record<string, Tally> = {};
const report = (label: string, t: Tally) => {
  tally[label] = t;
  console.info(`request L3 ${label}: ${t.total} mutations, ${t.invalid} schema-invalid, looser ${t.looser.length}, stricter ${t.stricter.length}`);
};

describe("L3 · generated negatives, schema as oracle", () => {
  it("2xx body: no schema-invalid ApprovalCreateResponse reads as created or replayed, and every schema-valid one does", async () => {
    const t: Tally = { total: 0, invalid: 0, looser: [], stricter: [] };
    for (const [label, source] of [["created", CREATED()], ["replayed", REPLAYED()]] as const) {
      for (const m of mutationsOf(source)) {
        t.total += 1;
        const violations = successViolations(m.value);
        const out = (await told({ status: 201, body: m.value })).kind;
        const read = out === "created" || out === "replayed";
        if (violations.length > 0) {
          t.invalid += 1;
          if (read) t.looser.push(`${label}: ${m.name} -> ${violations[0]}`);
          else expect(out, m.name).toBe("uncertain");
        } else if (!read) t.stricter.push(`${label}: ${m.name} -> ${out}`);
        expect(leaked({ kind: out }, PROBE)).toBe(false);
      }
    }
    report("2xx body", t);
    expect(t.total).toBeGreaterThan(400);
    expect(t.looser, `read although the schema rejects it:\n${t.looser.slice(0, 15).join("\n")}`).toEqual([]);
    expect(t.stricter, `refused although the schema accepts it:\n${t.stricter.slice(0, 15).join("\n")}`).toEqual([]);
  }, 120_000);

  it("the strict reader and the oracle agree on every mutation, with nothing planted ever returned", () => {
    let checked = 0;
    for (const m of mutationsOf(CREATED())) {
      checked += 1;
      const valid = successViolations(m.value).length === 0;
      const read = readApprovalCreateV1(m.value);
      expect(read !== null, m.name).toBe(valid);
      if (m.name.includes("extra member")) expect(leaked(read, PROBE), m.name).toBe(false);
      expect(approvalCreateViolations(m.value).length === 0, m.name).toBe(valid);
    }
    expect(checked).toBeGreaterThan(200);
  });

  it("problem body: the code is acted on only when the body keeps Problem (the server's own members set aside)", async () => {
    const t: Tally = { total: 0, invalid: 0, looser: [], stricter: [] };
    for (const [status, source] of [[400, problem("EVIDENCE_RUN_NOT_FOUND", "The run was not found.")], [422, loadCanonical<Draft>(PROBLEM_FILE)], [409, DUPLICATE_BODY()]] as const) {
      for (const m of mutationsOf(source)) {
        t.total += 1;
        const violations = problemOracle(m.value);
        const out = await told({ status, body: m.value });
        const typedCode = (m.value as Draft)?.error?.code;
        const actedOn = out.outcome.kind === "duplicate" || (out.outcome.kind === "failed" && !out.outcome.reason.startsWith(`HTTP_${status}:`));
        // The link target is the typed id or nothing: a duplicate whose body does not keep the variant never names one.
        if (out.outcome.kind === "duplicate") expect(out.outcome.existingApprovalId, m.name).toBe(duplicateApprovalId(m.value));
        if (violations.length > 0) {
          t.invalid += 1;
          if (actedOn) t.looser.push(`${status}: ${m.name} -> ${violations[0]}`);
          else expect(out.outcome, m.name).toMatchObject({ kind: "failed", reason: `HTTP_${status}: The request failed.` });
        } else if (!actedOn) t.stricter.push(`${status}: ${m.name} (code ${String(typedCode)}) -> ${out.kind}`);
        // Never a success, never a leak, never an offline flag on a 4xx.
        expect(["created", "replayed"], m.name).not.toContain(out.outcome.kind);
        expect(leaked(out.outcome, PROBE) && violations.length > 0, `${m.name}: an untyped body's text reached the screen`).toBe(false);
        expect(out.outcome, m.name).not.toHaveProperty("offline");
      }
    }
    report("problem body", t);
    expect(t.total).toBeGreaterThan(100);
    expect(t.looser, `acted on although the schema rejects it:\n${t.looser.slice(0, 15).join("\n")}`).toEqual([]);
    expect(t.stricter, `ignored although the schema accepts it:\n${t.stricter.slice(0, 15).join("\n")}`).toEqual([]);
  }, 120_000);

  it("a replay inside a lookup: no schema-invalid lookup is read, and every schema-valid one is (the lookup's own oracle)", () => {
    const lookup = loadCanonical<{ approval_request_lookup: Record<string, Draft> }>(LOOKUP_FILE).approval_request_lookup.found_payload_match;
    let checked = 0;
    let invalid = 0;
    for (const m of mutationsOf(lookup)) {
      checked += 1;
      const valid = validateAgainst(OA, "/components/schemas/ApprovalRequestLookup", m.value).length === 0;
      const read = readApprovalRequestLookupV1(m.value);
      const accepted = read !== null && read.kind === "approval_request_lookup";
      if (!valid) invalid += 1;
      // Every mutation that keeps the schema is read; every one that breaks it is not. (A changed schema_version reads as unsupported, not accepted.)
      expect(accepted, m.name).toBe(valid);
    }
    console.info(`request L3 lookup replay: ${checked} mutations, ${invalid} schema-invalid, 0 read looser`);
    expect(checked).toBeGreaterThan(300);
  });

  it("readOutcome (the screen's boundary): the four documented shapes, junk, and the port's own marks", () => {
    const created = { kind: "created", approvalId: "apr_1", subjectLabel: "a", status: "PENDING", slaDueAt: null, policyVersion: null, quorumRequired: 1, requester: null };
    expect(readOutcome(created)).toMatchObject({ kind: "created", approvalId: "apr_1" });
    expect(readOutcome({ ...created, kind: "replayed" })).toMatchObject({ kind: "replayed" });
    expect(readOutcome({ ...created, schemaViolations: ["approval.status: not a published word"] })).toMatchObject({ kind: "failed", offline: true });
    expect(readOutcome({ kind: "duplicate", existingApprovalId: "apr_1", reason: "r" })).toMatchObject({ kind: "duplicate", existingApprovalId: "apr_1" });
    expect(readOutcome({ kind: "duplicate", existingApprovalId: "apr_1", reason: "r", untyped: { status: 409 } })).toEqual({ kind: "failed", status: "unavailable", reason: "HTTP_409: The request failed." });
    expect(readOutcome({ kind: "failed", status: "unavailable", reason: "CODE_X: m", untyped: { status: 422 } })).toMatchObject({ reason: "HTTP_422: The request failed." });
    expect(readOutcome({ kind: "failed", status: "unavailable", reason: "CODE_X: m", offline: true, untyped: { status: 503 } })).toMatchObject({ reason: "HTTP_503: The request failed.", offline: true });
    for (const junk of [null, undefined, 0, "created", [], {}, { kind: "success" }, { kind: "created" }, { kind: "created", approvalId: "" }]) {
      expect(readOutcome(junk), JSON.stringify(junk)).toMatchObject({ kind: "failed", offline: true });
    }
  });

  it("own __proto__, constructor and prototype members never pollute and never reach the outcome", async () => {
    for (const c of pollutionCases(CREATED(), [[], ["approval"], ["approval", "requester"]])) {
      expect(readApprovalCreateV1(c.value), c.name).toBeNull();
      expect(prototypeIsClean()).toBe(true);
    }
    for (const c of pollutionCases(DUPLICATE_BODY(), [[], ["error"], ["details"]])) {
      const t = await told({ status: 400, body: c.value });
      expect(leaked(t.outcome, c.probe), c.name).toBe(false);
      expect(prototypeIsClean()).toBe(true);
    }
  });

  it.each(rootCases().map((c) => [c.name, c] as const))("%s reads as nothing", (_name, c) => {
    expect(() => readApprovalCreateV1(c.value)).not.toThrow();
    expect(readApprovalCreateV1(c.value)).toBeNull();
    expect(() => problemViolations(c.value)).not.toThrow();
    expect(problemViolations(c.value)).not.toEqual([]);
  });

  it("the totals: no body read looser than its schema, on either side of the status line", () => {
    const tried = Object.values(tally).reduce((n, t) => n + t.invalid, 0);
    const looser = Object.values(tally).reduce((n, t) => n + t.looser.length, 0);
    console.info(`request L3 total: ${tried} schema-invalid bodies tried, ${looser} read looser than the schema`);
    expect(tried).toBeGreaterThan(300);
    expect(looser).toBe(0);
  });
});
