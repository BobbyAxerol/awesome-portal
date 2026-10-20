/**
 * Command confirmation (UXM-09, fixture lane): the pure model. Lane: FIXTURE_LAB (unit). Nothing here proves a real server's answers; it proves
 * how the screen's rules classify each answer a port can give.
 */
import { describe, expect, it } from "vitest";

import { catalogueOf } from "../../readers/commandCatalogue";
import { readCommandStatusV1 } from "../../readers/commandCurrency";
import { readCommandPlanV1, readCommandPreviewV1 } from "../../readers/commandOperation";
import { loadCanonical } from "../../testkit/loadCanonical";
import {
  CAPITAL_OPERATION_ROWS,
  CERTIFICATION_FLOWS,
  CERTIFICATION_PHRASE,
  EMPTY_CONFIRM,
  EXCLUDED_FAMILY_ROWS,
  REASON_COPY,
  catalogueRows,
  classifyPlan,
  classifyStatus,
  classifySubmit,
  enablingCapability,
  isDismissible,
  isSettled,
  operationHref,
  payloadIdentity,
  planExpired,
  planViewFromCapital,
  planViewFromF0,
  receiptCommandId,
  routeLookup,
  statusFacets,
  submitGate,
  validateConfirm,
  venueNeedsFillDetail,
  type PlanView,
  type Receipt,
} from "./model";
import { SEND_DISABLED_REASON, type PortResponse } from "./port";
import {
  CAPITAL_INTENT,
  COMMAND_ID_APPLIED,
  COMMAND_ID_LANDED,
  F0_DENIED_BODY,
  F0_PLAN_BODY,
  STORY_NOW_MS,
  ackOnlyStatus,
  appliedLaggingStatus,
  capitalPreviewBody,
  deliveryUnknownStatus,
  problemBody,
  rejectedBusinessStatus,
} from "./storyData";

const respond = (status: number, body: unknown): PortResponse => ({ kind: "response", status, body });
const none: ReadonlySet<string> = new Set();
const f0Plan = (): PlanView => {
  const read = readCommandPlanV1(structuredClone(F0_PLAN_BODY));
  if (read === null || read.kind !== "command_plan") throw new Error("the published plan does not read");
  return planViewFromF0(read.plan);
};
const capitalPlan = (options: { allowed?: boolean } = {}): PlanView => {
  const read = readCommandPreviewV1(capitalPreviewBody({ now: STORY_NOW_MS, ...options }));
  if (read === null || read.kind !== "command_preview") throw new Error("the preview does not read");
  return planViewFromCapital(CAPITAL_INTENT, read.preview);
};
const filled = { reason: "Month-end top-up agreed with treasury.", confirmWord: "account/sync", impactAck: true };

describe("the plan view is the plan, and cost and impact are never computed", () => {
  it("F0: exact facts from the published plan; the payload is a hash only; cost and impact are Not published (FE-020)", () => {
    const view = f0Plan();
    expect(view.impact).toEqual({ kind: "not_published", request: "FE-020" });
    expect(view.facts.find((f) => f.label === "Command")?.value).toBe("account/sync");
    expect(view.facts.find((f) => f.label === "Plan digest")?.value).toBe(F0_PLAN_BODY.plan_digest);
    expect(view.blockers).toEqual(["COMMAND_RELAY_DISABLED"]);
    expect(view.facts.some((f) => /payload/i.test(f.label) && f.mono !== true && !/hash/i.test(f.label) && !/Payload$/.test(f.label))).toBe(false);
    expect(view.confirmable.ok).toBe(true);
  });

  it("capital: the amount, the int64 versions and the policy come back byte for byte, with the unit", () => {
    const view = capitalPlan();
    expect(view.facts.find((f) => f.label === "Amount")?.value).toBe("100.000000000000000001 USDT");
    expect(view.facts.find((f) => f.label === "Expected budget version")?.value).toBe("9007199254740993");
    expect(view.facts.find((f) => f.label === "Policy revision")?.value).toBe("TEST_ONLY:policy1");
    expect(view.facts.find((f) => f.label === "Required gate")?.value).toBe("CAPITAL");
    expect(view.impact.kind).toBe("not_published");
  });

  it("a preview that does not allow the command cannot be confirmed, and says the typed reason in words", () => {
    const view = capitalPlan({ allowed: false });
    expect(view.confirmable).toEqual({ ok: false, reason: REASON_COPY.COMMAND_RELAY_NOT_QUALIFIED });
    expect(view.digest).toBeNull();
  });

  it("an allowed preview with no digest cannot be confirmed: there is nothing to bind the submit to", () => {
    const body = capitalPreviewBody({ now: STORY_NOW_MS });
    body.preview_digest = null;
    const read = readCommandPreviewV1(body);
    if (read === null || read.kind !== "command_preview") throw new Error("preview did not read");
    expect(planViewFromCapital(CAPITAL_INTENT, read.preview).confirmable.ok).toBe(false);
  });

  it("expiry is judged against the clock it is given, and a plan with no expiry never expires on its own", () => {
    const view = f0Plan();
    expect(planExpired(view, STORY_NOW_MS)).toBe(false);
    expect(planExpired(view, view.expiresAtMs! + 1)).toBe(true);
    expect(planExpired(view, view.expiresAtMs!)).toBe(true);
    expect(planExpired({ ...view, expiresAtMs: null }, Number.MAX_SAFE_INTEGER)).toBe(false);
  });

  it("classifyPlan: a readable plan, and every way it can fail", () => {
    expect(classifyPlan("F0", respond(201, structuredClone(F0_PLAN_BODY)), CAPITAL_INTENT).kind).toBe("ready");
    expect(classifyPlan("CAPITAL", respond(200, capitalPreviewBody({ now: STORY_NOW_MS })), CAPITAL_INTENT).kind).toBe("ready");
    expect(classifyPlan("F0", respond(403, {}), CAPITAL_INTENT)).toMatchObject({ kind: "failed", tone: "denied" });
    expect(classifyPlan("F0", respond(503, {}), CAPITAL_INTENT)).toMatchObject({ kind: "failed", tone: "unavailable" });
    expect(classifyPlan("F0", respond(409, {}), CAPITAL_INTENT)).toMatchObject({ kind: "failed", tone: "refused" });
    expect(classifyPlan("F0", respond(201, { schema_version: "execution.command-plan.v1" }), CAPITAL_INTENT)).toMatchObject({ kind: "failed", tone: "unreadable" });
    expect(classifyPlan("F0", respond(200, capitalPreviewBody({ now: STORY_NOW_MS })), CAPITAL_INTENT)).toMatchObject({ kind: "failed", tone: "unreadable" });
    expect(classifyPlan("F0", { kind: "no_response", why: "timeout" }, CAPITAL_INTENT)).toMatchObject({ kind: "failed", tone: "unavailable" });
  });
});

describe("the typed confirmation", () => {
  const plan = f0Plan();

  it("is not ready until a reason, the exact word and the impact acknowledgement are all there; the sentence names what is missing", () => {
    const empty = validateConfirm(EMPTY_CONFIRM, plan);
    expect(empty.payload).toBeNull();
    expect(empty.needs.map((n) => n.field)).toEqual(["reason", "word", "ack"]);
    expect(validateConfirm({ ...filled, reason: "short" }, plan).needs.map((n) => n.field)).toEqual(["reason"]);
    expect(validateConfirm({ ...filled, confirmWord: "Account/Sync" }, plan).needs.map((n) => n.field)).toEqual(["word"]);
    expect(validateConfirm({ ...filled, confirmWord: "account/sync " }, plan).needs.map((n) => n.field)).toEqual(["word"]);
    expect(validateConfirm({ ...filled, impactAck: false }, plan).needs.map((n) => n.field)).toEqual(["ack"]);
    expect(validateConfirm(filled, plan).needs).toEqual([]);
  });

  it("the payload carries the trimmed reason and the plan identity, never anything else", () => {
    const ready = validateConfirm({ ...filled, reason: `  ${filled.reason}\n` }, plan);
    expect(ready.payload).toEqual({ lane: "F0", identity: plan.identity, operationId: "op_01K3COMMANDPLAN000000000000", digest: F0_PLAN_BODY.plan_digest, reason: filled.reason });
  });

  it("hidden and direction-changing characters in the reason are refused and named", () => {
    const hostile = validateConfirm({ ...filled, reason: `Top up ${String.fromCodePoint(0x202e)}now please` }, plan);
    expect(hostile.reason.state).toBe("hostile");
    expect(hostile.reason.hostile).toContain("U+202E");
    expect(hostile.payload).toBeNull();
  });

  it("invisible fillers do not count toward the minimum", () => {
    const padded = validateConfirm({ ...filled, reason: `abc${String.fromCodePoint(0x3164).repeat(10)}` }, plan);
    expect(padded.reason.state).toBe("short");
  });

  it("two different reasons are two different intents; the same reason on the same plan is the same intent", () => {
    const a = validateConfirm(filled, plan).payload!;
    const b = validateConfirm({ ...filled, reason: `${filled.reason} Again.` }, plan).payload!;
    expect(payloadIdentity(a)).toBe(payloadIdentity(validateConfirm(filled, plan).payload!));
    expect(payloadIdentity(a)).not.toBe(payloadIdentity(b));
  });

  it("the capital word is the operation, not the command key", () => {
    expect(capitalPlan().confirmWord).toBe("TOP_UP");
    expect(validateConfirm({ ...filled, confirmWord: "TOP_UP" }, capitalPlan()).payload).not.toBeNull();
  });
});

describe("the Submit gate and the sentence beside it are one answer", () => {
  const plan = f0Plan();
  const ready = validateConfirm(filled, plan);
  const base = { validation: ready, plan, expired: false, submitting: false, settled: false, uncertain: false, blockedReason: null };

  it("open only when everything holds", () => {
    expect(submitGate(base)).toEqual({ open: true });
  });

  it("the disabled-port reason wins over everything, and is the exact sentence", () => {
    expect(submitGate({ ...base, blockedReason: SEND_DISABLED_REASON })).toEqual({ open: false, kind: "policy", reason: "Command sends are not connected to a source: UXM-09 fixture" });
    expect(submitGate({ ...base, plan: null, blockedReason: SEND_DISABLED_REASON })).toMatchObject({ kind: "policy" });
  });

  it.each([
    ["no plan yet", { plan: null }, "plan"],
    ["an answered command", { settled: true }, "settled"],
    ["a send in flight", { submitting: true }, "sending"],
    ["an unknown outcome", { uncertain: true }, "uncertain"],
    ["a hold from the host", { held: "Answer the question above first." }, "held"],
    ["an expired plan", { expired: true }, "expired"],
    ["a missing confirmation", { validation: validateConfirm(EMPTY_CONFIRM, plan) }, "incomplete"],
  ] as const)("closed for %s", (_label, patch, kind) => {
    const gate = submitGate({ ...base, ...patch } as never);
    expect(gate).toMatchObject({ open: false, kind });
    expect((gate as { reason: string }).reason.length).toBeGreaterThan(0);
  });

  it("a plan that cannot be confirmed keeps Submit closed with the plan's own reason", () => {
    const refused = capitalPlan({ allowed: false });
    const gate = submitGate({ ...base, plan: refused, validation: validateConfirm({ ...filled, confirmWord: "TOP_UP" }, refused) });
    expect(gate).toEqual({ open: false, kind: "plan", reason: REASON_COPY.COMMAND_RELAY_NOT_QUALIFIED });
  });
});

describe("an answer becomes a receipt, doubt first", () => {
  const ctx = { operationId: "op_01K3COMMANDPLAN000000000000", knownCommandIds: none };
  const kind = (answer: PortResponse, known: ReadonlySet<string> = none, operationId: string | null = ctx.operationId): Receipt["kind"] =>
    classifySubmit(answer, { operationId, knownCommandIds: known }).kind;

  it("ACCEPTED: an acknowledged status; REPLAYED when the command id was already shown", () => {
    expect(kind(respond(200, ackOnlyStatus()), none, null)).toBe("ACCEPTED");
    expect(kind(respond(200, ackOnlyStatus()), new Set([COMMAND_ID_LANDED]), null)).toBe("REPLAYED");
    expect(kind(respond(200, appliedLaggingStatus()), new Set([COMMAND_ID_LANDED]), null)).toBe("ACCEPTED");
  });

  it("DENIED: the published denial with 409 for THIS operation; a denial for another operation, or with another status, is not this command's answer", () => {
    expect(kind(respond(409, structuredClone(F0_DENIED_BODY)))).toBe("DENIED");
    expect(classifySubmit(respond(409, { ...F0_DENIED_BODY, operation_id: "op_other" }), ctx)).toMatchObject({ kind: "UNKNOWN", why: "unreadable" });
    expect(classifySubmit(respond(200, structuredClone(F0_DENIED_BODY)), ctx)).toMatchObject({ kind: "UNKNOWN", why: "unreadable" });
  });

  it("REJECTED (typed): a 4xx problem with a word in the dictionary, a word outside it, or no readable word", () => {
    const known = classifySubmit(respond(409, problemBody("COMMAND_PREVIEW_CHANGED")), ctx);
    expect(known).toMatchObject({ kind: "REJECTED", code: "COMMAND_PREVIEW_CHANGED", known: true, sentence: REASON_COPY.COMMAND_PREVIEW_CHANGED });
    expect(classifySubmit(respond(422, problemBody("SOMETHING_NEW")), ctx)).toMatchObject({ kind: "REJECTED", code: "SOMETHING_NEW", known: false });
    expect(classifySubmit(respond(400, { nope: true }), ctx)).toMatchObject({ kind: "REJECTED", code: null, known: false });
  });

  it("REJECTED: a source rejection and a failed-before-send status are rejections that created a command; neither invites a new key", () => {
    const rejected = classifySubmit(respond(200, rejectedBusinessStatus()), ctx);
    expect(rejected).toMatchObject({ kind: "REJECTED", code: null });
    expect(isSettled(rejected)).toBe(true);
    expect(isDismissible(rejected)).toBe(false);
    const failed = classifySubmit(respond(200, { ...ackOnlyStatus(), delivery: "FAILED_BEFORE_SEND", next_action: "REVIEW_BLOCKER" }), ctx);
    expect(failed).toMatchObject({ kind: "REJECTED", code: "FAILED_BEFORE_SEND", nextAction: "REVIEW_BLOCKER" });
    expect((failed as { sentence: string }).sentence).toMatch(/not an invitation to use a new key/);
    // A typed refusal created nothing: it can be dismissed and the request changed.
    const refusal = classifySubmit(respond(409, problemBody("COMMAND_PREVIEW_CHANGED")), ctx);
    expect(isSettled(refusal)).toBe(false);
    expect(isDismissible(refusal)).toBe(true);
  });

  it("UNKNOWN: no answer, a 5xx, an unverified receipt (any status), an unreadable 2xx and an unconfirmed delivery are never failed and never ok", () => {
    expect(classifySubmit({ kind: "no_response", why: "timeout" }, ctx)).toMatchObject({ kind: "UNKNOWN", why: "no_response" });
    expect(classifySubmit({ kind: "no_response", why: "network" }, ctx)).toMatchObject({ kind: "UNKNOWN", why: "no_response" });
    expect(classifySubmit(respond(500, "boom"), ctx)).toMatchObject({ kind: "UNKNOWN", why: "server_error" });
    expect(classifySubmit(respond(502, problemBody("SOMETHING")), ctx)).toMatchObject({ kind: "UNKNOWN", why: "server_error" });
    expect(classifySubmit(respond(503, problemBody("COMMAND_STATUS_UNVERIFIED")), ctx)).toMatchObject({ kind: "UNKNOWN", why: "unverified" });
    expect(classifySubmit(respond(409, problemBody("COMMAND_STATUS_UNVERIFIED")), ctx)).toMatchObject({ kind: "UNKNOWN", why: "unverified" });
    expect(classifySubmit(respond(200, { receipt: "ok" }), ctx)).toMatchObject({ kind: "UNKNOWN", why: "unreadable" });
    expect(classifySubmit(respond(200, null), ctx)).toMatchObject({ kind: "UNKNOWN", why: "unreadable" });
    expect(classifySubmit(respond(302, {}), ctx)).toMatchObject({ kind: "UNKNOWN", why: "unreadable" });
    const delivery = classifySubmit(respond(200, deliveryUnknownStatus()), ctx);
    expect(delivery).toMatchObject({ kind: "UNKNOWN", why: "delivery_unknown" });
    expect(receiptCommandId(delivery)).toBe("ecm_00000000000000000000000000000005");
    for (const state of ["PREPARED", "SENDING"]) {
      expect(classifySubmit(respond(200, { ...ackOnlyStatus(), delivery: state }), ctx)).toMatchObject({ kind: "UNKNOWN", why: "delivery_unknown" });
    }
  });

  it("ACCESS_STOPPED: 401, 403 and 404 end the screen's disclosure whatever the body says, before the body is read", () => {
    for (const status of [401, 403, 404]) {
      expect(classifySubmit(respond(status, structuredClone(F0_DENIED_BODY)), ctx)).toEqual({ kind: "ACCESS_STOPPED", httpStatus: status });
      expect(classifySubmit(respond(status, ackOnlyStatus()), ctx)).toEqual({ kind: "ACCESS_STOPPED", httpStatus: status });
    }
  });

  it("an unknown receipt keeps the key and locks; every other kind releases it", () => {
    const unknown = classifySubmit({ kind: "no_response", why: "timeout" }, ctx);
    expect(unknown.kind).toBe("UNKNOWN");
    expect(isSettled(unknown)).toBe(false);
  });
});

describe("the four answers of a capital status are never merged", () => {
  const read = (body: unknown) => {
    const r = readCommandStatusV1(body);
    if (r === null || r.kind !== "command_status") throw new Error("status did not read");
    return r.status;
  };

  it("ACK + UNKNOWN: acknowledged is neutral transport, business is unknown, nothing is applied", () => {
    const facets = statusFacets(read(ackOnlyStatus()));
    expect(facets.map((f) => [f.dimension, f.kind, f.label])).toEqual([
      ["Delivery", "neutral", "Acknowledged"], ["Business", "unknown", "Unknown"], ["Projection", "display", "Catching up"], ["Venue", "unknown", "Unknown"],
    ]);
    expect(facets[0]!.note).toMatch(/does not say the command was applied/);
    expect(facets.some((f) => f.kind === "applied")).toBe(false);
  });

  it("UX-F17, APPLIED + CATCHING_UP + venue PENDING: three states at once, the view lag is not a reason to resubmit", () => {
    const status = read(appliedLaggingStatus());
    const facets = statusFacets(status);
    expect(facets.find((f) => f.dimension === "Business")).toMatchObject({ kind: "applied", label: "Applied" });
    expect(facets.find((f) => f.dimension === "Projection")).toMatchObject({ kind: "display" });
    expect(facets.find((f) => f.dimension === "Projection")!.note).toMatch(/Never resubmit/);
    expect(facets.find((f) => f.dimension === "Venue")).toMatchObject({ kind: "pending" });
    expect(venueNeedsFillDetail(status)).toBe(true);
    expect(status.commandId).toBe(COMMAND_ID_APPLIED);
    expect(classifyStatus(status, none).kind).toBe("ACCEPTED");
  });

  it("amounts keep their exact strings and the unit; absent amounts are absent, not zero", () => {
    expect(read(appliedLaggingStatus()).business.amounts!.requested.fullText).toBe("100.000000000000000001 USDT");
    expect(read(ackOnlyStatus()).business.amounts).toBeNull();
  });
});

describe("the status lookup grammar", () => {
  it("routes a command id, an operation id and refuses the rest without a call", () => {
    expect(routeLookup(" ecm_00000000000000000000000000000001 ")).toEqual({ kind: "command", id: "ecm_00000000000000000000000000000001" });
    expect(routeLookup("op_01K3COMMANDPLAN000000000000")).toEqual({ kind: "operation", id: "op_01K3COMMANDPLAN000000000000" });
    expect(routeLookup("")).toMatchObject({ kind: "invalid" });
    expect(routeLookup("ecm_XYZ")).toMatchObject({ kind: "invalid", reason: expect.stringContaining("32 lower-case hex") });
    expect(routeLookup("has space")).toMatchObject({ kind: "invalid" });
    expect(routeLookup("a".repeat(192))).toMatchObject({ kind: "invalid" });
    expect(routeLookup("x/../y")).toMatchObject({ kind: "invalid" });
  });

  it("only an op_ id links to the Operations screen", () => {
    expect(operationHref("op_01K3COMMANDPLAN000000000000")).toBe("/execution/operations?operation=op_01K3COMMANDPLAN000000000000");
    expect(operationHref("ecm_00000000000000000000000000000001")).toBeNull();
    expect(operationHref("other")).toBeNull();
  });
});

describe("every operation that is not sendable carries its exact reason, and a capability only when one is published", () => {
  const catalogue = catalogueOf(loadCanonical("execution-command-catalog"))!;
  const groups = catalogueRows(catalogue);
  const rows = groups.flatMap((g) => g.rows);

  it("all 64 catalogue commands are listed, none is missing a reason, and none is invented", () => {
    expect(rows).toHaveLength(64);
    expect(new Set(rows.map((r) => r.id)).size).toBe(64);
    for (const row of rows) {
      expect(row.reason.length, row.id).toBeGreaterThan(20);
      expect(row.code, row.id).not.toBeNull();
    }
    expect(catalogue.entries.every((e) => e.portalReachable === false)).toBe(true);
  });

  it("the capability is the published staged-activation key of the tier, and only for a command blocked by the relay itself", () => {
    const entry = (key: string) => catalogue.entries.find((e) => e.key === key)!;
    expect(enablingCapability(entry("account/sync"))).toEqual({ kind: "staged_activation", key: "COMMAND_R2" });
    expect(enablingCapability(entry("ops/emergency-close-verify"))).toEqual({ kind: "staged_activation", key: "COMMAND_R3" });
    // The emergency close itself has an ambiguous source route: no capability would unlock it.
    expect(enablingCapability(entry("ops/emergency-close"))).toMatchObject({ kind: "none_published", because: expect.stringContaining("route itself") });
    // A read has no COMMAND_R0 capability: nothing is invented for it.
    const read = catalogue.entries.find((e) => e.riskTier === "R0_READ" && e.blockedReason === "COMMAND_RELAY_DISABLED")!;
    expect(enablingCapability(read)).toMatchObject({ kind: "none_published", because: expect.stringContaining("Not published (FE-015)") });
    // A route the source does not publish is not unlocked by any capability.
    const ambiguous = catalogue.entries.find((e) => e.blockedReason === "SOURCE_ROUTE_MAPPING_AMBIGUOUS")!;
    expect(enablingCapability(ambiguous)).toMatchObject({ kind: "none_published", because: expect.stringContaining("route itself") });
    for (const row of rows) {
      if (row.capability.kind === "staged_activation") expect(["COMMAND_R1", "COMMAND_R2", "COMMAND_R3", "COMMAND_R4"]).toContain(row.capability.key);
    }
  });

  it("the capital operations and the unadmitted families are listed with the reason the ELP2-07 packet gives", () => {
    expect(CAPITAL_OPERATION_ROWS.map((r) => r.id)).toEqual(["FUND", "INITIAL_GRANT", "TOP_UP", "IMMEDIATE_DECREASE", "RECALL_PARTIAL", "RECALL_FULL", "ADJUST_TARGET_BUDGET", "SET_ROOT_LIMIT"]);
    for (const row of CAPITAL_OPERATION_ROWS) expect(row.reason).toContain(SEND_DISABLED_REASON);
    expect(EXCLUDED_FAMILY_ROWS.map((r) => r.id)).toContain("RETURN_CAPITAL");
    for (const row of [...CAPITAL_OPERATION_ROWS, ...EXCLUDED_FAMILY_ROWS]) expect(row.capability.kind).toBe("none_published");
  });

  it("no placeholder dash or N/A stands in for a missing value in any row", () => {
    const text = JSON.stringify([rows, CAPITAL_OPERATION_ROWS, EXCLUDED_FAMILY_ROWS, CERTIFICATION_FLOWS]);
    expect(text).not.toMatch(/"—"|N\/A|n\/a/);
  });
});

describe("flows that need their own certification", () => {
  it("cover UX-F14 to UX-F17 and the mainnet canary, each with a reason", () => {
    const cases = new Set(CERTIFICATION_FLOWS.flatMap((f) => f.cases));
    for (const id of ["UX-F14", "UX-F15", "UX-F16", "UX-F17"]) expect(cases.has(id), id).toBe(true);
    expect(CERTIFICATION_FLOWS.map((f) => f.id)).toContain("mainnet-canary");
    for (const flow of CERTIFICATION_FLOWS) expect(flow.why.length, flow.id).toBeGreaterThan(30);
    expect(CERTIFICATION_PHRASE).toBe("Requires separate certification");
  });
});
