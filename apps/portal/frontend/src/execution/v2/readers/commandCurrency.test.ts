/**
 * Currency-bearing served statuses against the canonical fixtures
 * (`execution-command-currency.synthetic.valid.json`,
 * `execution-pending-control-currency.synthetic.valid.json`, and the capital
 * statuses inside `execution-workflows.synthetic.valid.json`), Codex e19ad906.
 *
 * Negative cases are mutations of those bodies, never a second hand-written
 * copy. The conformance suite does the schema-driven breadth.
 */
import { describe, expect, it } from "vitest";

import { loadCanonical } from "../testkit/loadCanonical";
import {
  AMOUNT_KEYS,
  COMMAND_STATUS_SCHEMA,
  PENDING_CONTROL_STATUS_SCHEMA,
  readCommandStatusV1,
  readPendingControlStatusV1,
  type CommandStatusV1,
  type PendingControlStatusV1,
} from "./commandCurrency";

type Draft = any;
const CMD = loadCanonical<{ stored_status: Draft; public_status: Draft }>("execution-command-currency.synthetic");
const PENDING = loadCanonical<{ statuses: Record<string, Draft> }>("execution-pending-control-currency.synthetic").statuses;
const WORKFLOWS = loadCanonical<{ cases: { response?: { status?: Draft } }[] }>("execution-workflows.synthetic");
const CAPITAL_WITH_AMOUNTS: Draft[] = WORKFLOWS.cases.map((c) => c.response?.status).filter((s) => s?.business?.amounts != null);

const clone = <T,>(value: T): T => structuredClone(value);
const edit = (body: Draft, change: (b: Draft) => void): Draft => {
  const copy = clone(body);
  change(copy);
  return copy;
};

function capital(raw: unknown): CommandStatusV1 {
  const read = readCommandStatusV1(raw);
  expect(read?.kind).toBe("command_status");
  return (read as { status: CommandStatusV1 }).status;
}
function pending(raw: unknown): PendingControlStatusV1 {
  const read = readPendingControlStatusV1(raw);
  expect(read?.kind).toBe("pending_control_status");
  return (read as { status: PendingControlStatusV1 }).status;
}

describe("capital CommandStatus, the canonical bodies", () => {
  it("the served status reads with its currency and no amounts yet (null, not zero)", () => {
    const status = capital(CMD.public_status);
    expect(status).toMatchObject({
      commandId: "ecm_00000000000000000000000000000001", operation: "TOP_UP", resource: { kind: "PORTFOLIO", id: "TEST_ONLY:portfolio" },
      environment: "paper", delivery: "ACKNOWLEDGED", projection: "CATCHING_UP", venue: "UNKNOWN", nextAction: "QUERY_SAME_INTENT",
      authority: "TEST_ONLY", currency: "USDT", createdAt: 1792100000000, updatedAt: 1792100000000,
    });
    expect(status.business).toEqual({ state: "UNKNOWN", receiptRef: null, sourceEventRef: null, revision: null, amounts: null });
  });

  it("the stored form (no currency) is NOT a served status: it is refused whole, and no unit is guessed", () => {
    expect(readCommandStatusV1(CMD.stored_status)).toBeNull();
    for (const guess of ["USD", "USDT", ""]) {
      expect(readCommandStatusV1({ ...CMD.stored_status, currency: guess })?.kind === "command_status").toBe(guess === "USD" || guess === "USDT");
    }
  });

  it("every capital status with amounts carries each amount WITH the status currency", () => {
    expect(CAPITAL_WITH_AMOUNTS.length).toBeGreaterThanOrEqual(5);
    for (const raw of CAPITAL_WITH_AMOUNTS) {
      const status = capital(raw);
      for (const key of AMOUNT_KEYS) {
        const amount = status.business.amounts![key];
        expect(amount.currency).toBe(raw.currency);
        expect(amount.decimal.full).toBe(raw.business.amounts[key]);
        expect(amount.fullText).toBe(`${raw.business.amounts[key]} ${raw.currency}`);
        expect(amount.text.endsWith(` ${raw.currency}`)).toBe(true);
      }
    }
  });

  it("a long exact amount stays exact (18 decimals) and a published 0 stays a value", () => {
    const partial = CAPITAL_WITH_AMOUNTS.find((s) => s.business.state === "PARTIALLY_APPLIED")!;
    const status = capital(partial);
    expect(status.business.amounts!.requested.decimal.full).toBe("1000.000000000000000001");
    expect(status.business.amounts!.pending.decimal.full).toBe("700.000000000000000001");
    expect(status.business.amounts!.cancelled.decimal.zero).toBe(true);
    expect(status.business.amounts!.cancelled.fullText).toBe("0 USDT");
  });

  it("the currency is the status's, not a default: another unit changes every amount's text", () => {
    const status = capital(edit(CAPITAL_WITH_AMOUNTS[0], (b) => { b.currency = "BTC"; }));
    for (const key of AMOUNT_KEYS) expect(status.business.amounts![key].currency).toBe("BTC");
    expect(status.business.amounts!.requested.text.endsWith(" BTC")).toBe(true);
  });

  it("the contract has no cross-field rule for capital amounts, so none is invented: amounts that do not add up still read as published", () => {
    const odd = edit(CAPITAL_WITH_AMOUNTS[0], (b) => { b.business.amounts = { requested: "10", applied: "3", pending: "3", cancelled: "0", rejected: "0" }; });
    expect(capital(odd).business.amounts!.applied.decimal.full).toBe("3");
  });

  it("the revision is an exact int64 string, and anything else is refused", () => {
    for (const ok of ["0", "1", "9007199254740993", "9223372036854775807"]) {
      expect(capital(edit(CMD.public_status, (b) => { b.business.revision = ok; })).business.revision).toBe(ok);
    }
    for (const bad of ["9223372036854775808", "01", "-1", "1e3", " 1", "", 7, true]) {
      expect(readCommandStatusV1(edit(CMD.public_status, (b) => { b.business.revision = bad; })), String(bad)).toBeNull();
    }
  });

  it("another schema is unsupported_shape, including the pending-control status", () => {
    expect(readCommandStatusV1(PENDING.waiting)).toEqual({ kind: "unsupported_shape", schemaVersion: PENDING_CONTROL_STATUS_SCHEMA });
    expect(readCommandStatusV1({ ...CMD.public_status, schema_version: "portal.execution.command-status.v2" })).toEqual({ kind: "unsupported_shape", schemaVersion: "portal.execution.command-status.v2" });
    expect(readCommandStatusV1({})).toEqual({ kind: "unsupported_shape", schemaVersion: null });
    expect(COMMAND_STATUS_SCHEMA).toBe("portal.execution.command-status.v1");
  });

  it.each([null, undefined, "text", 7, [], true])("a non-object body (%s) is malformed", (raw) => {
    expect(readCommandStatusV1(raw)).toBeNull();
    expect(readPendingControlStatusV1(raw)).toBeNull();
  });

  it.each<[string, (b: Draft) => void]>([
    ["an extra key", (b) => { b.amount = "1"; }],
    ["currency missing", (b) => { delete b.currency; }],
    ["currency null", (b) => { b.currency = null; }],
    ["currency a number", (b) => { b.currency = 1; }],
    ["currency empty", (b) => { b.currency = ""; }],
    ["currency with leading space", (b) => { b.currency = " USDT"; }],
    ["currency with trailing newline", (b) => { b.currency = "USDT\n"; }],
    ["currency with a control character", (b) => { b.currency = "US\u0001DT"; }],
    ["currency over 512 characters", (b) => { b.currency = "U".repeat(513); }],
    ["an unknown operation", (b) => { b.operation = "WITHDRAW"; }],
    ["an unknown delivery", (b) => { b.delivery = "SENT"; }],
    ["an unknown projection", (b) => { b.projection = "FRESH"; }],
    ["an unknown venue", (b) => { b.venue = "FILLED_ALL"; }],
    ["a bad command id", (b) => { b.command_id = "ecm_XYZ"; }],
    ["created_at_ms as text", (b) => { b.created_at_ms = "1792100000000"; }],
    ["created_at_ms negative", (b) => { b.created_at_ms = -1; }],
    ["amounts with a missing key", (b) => { b.business.amounts = { requested: "1", applied: "0", pending: "0", cancelled: "0" }; }],
    ["an amount as a number", (b) => { b.business.amounts = { requested: 1, applied: "0", pending: "0", cancelled: "0", rejected: "0" }; }],
    ["an amount with an exponent", (b) => { b.business.amounts = { requested: "1e3", applied: "0", pending: "0", cancelled: "0", rejected: "0" }; }],
    ["a negative amount", (b) => { b.business.amounts = { requested: "-1", applied: "0", pending: "0", cancelled: "0", rejected: "0" }; }],
  ])("%s voids the read", (_name, change) => {
    expect(readCommandStatusV1(edit(CMD.public_status, change))).toBeNull();
  });

  it("text that can reverse or hide what is printed is refused whole, in the currency and in every id", () => {
    const rlo = String.fromCharCode(0x202e);
    const zwsp = String.fromCharCode(0x200b);
    for (const value of [`US${rlo}TD`, `USD${zwsp}T`, "   "]) {
      expect(readCommandStatusV1(edit(CMD.public_status, (b) => { b.currency = value; })), value).toBeNull();
      expect(readCommandStatusV1(edit(CMD.public_status, (b) => { b.profile_ref = value; })), value).toBeNull();
      expect(readCommandStatusV1(edit(CMD.public_status, (b) => { b.resource.id = value; })), value).toBeNull();
    }
  });
});

describe("pending-control status, FE-063 recipient_account_id", () => {
  it("a DEPLOYMENT status carries its owning account, a PORTFOLIO status carries none (null, never an empty string)", () => {
    expect(pending(PENDING.deployment_cancelled)).toMatchObject({ resource: { kind: "DEPLOYMENT", id: "TEST_ONLY:deployment" }, recipientAccountId: "TEST_ONLY:account" });
    expect(pending(PENDING.waiting).recipientAccountId).toBeNull();
  });

  it.each<[string, string, (b: Draft) => void]>([
    ["waiting", "a PORTFOLIO status with an account", (b) => { b.recipient_account_id = "TEST_ONLY:account"; }],
    ["deployment_cancelled", "a DEPLOYMENT status with a null account", (b) => { b.recipient_account_id = null; }],
    ["deployment_cancelled", "a DEPLOYMENT status with the key missing", (b) => { delete b.recipient_account_id; }],
    ["deployment_cancelled", "an empty account", (b) => { b.recipient_account_id = ""; }],
    ["deployment_cancelled", "an account that is a number", (b) => { b.recipient_account_id = 7; }],
    ["deployment_cancelled", "an account with an edge space", (b) => { b.recipient_account_id = " TEST_ONLY:account"; }],
    ["deployment_cancelled", "an account with a bidi override", (b) => { b.recipient_account_id = `TEST_ONLY:${String.fromCharCode(0x202e)}account`; }],
    ["waiting", "a PORTFOLIO status with the key missing", (b) => { delete b.recipient_account_id; }],
  ])("%s: %s voids the read", (name, _label, change) => {
    expect(readPendingControlStatusV1(edit(PENDING[name], change))).toBeNull();
  });
});

describe("pending-control status, the canonical bodies", () => {
  it("UNKNOWN: no amounts, no receipt, no applied flag; the currency is still known", () => {
    for (const key of ["unknown", "failed_before_send"]) {
      const status = pending(PENDING[key]);
      expect(status.business).toEqual({ state: "UNKNOWN", businessApplied: null, amounts: null, receipt: null, blockers: [] });
      expect(status.currency).toBe("USDT");
    }
    expect(pending(PENDING.unknown)).toMatchObject({ delivery: "DELIVERY_UNKNOWN", nextAction: "QUERY_SAME_INTENT" });
    expect(pending(PENDING.failed_before_send)).toMatchObject({ delivery: "FAILED_BEFORE_SEND", nextAction: "REVIEW_BLOCKER" });
  });

  it("WAITING: cumulative applied > 0 is not 'done'; every amount has its currency", () => {
    const status = pending(PENDING.waiting);
    expect(status.business).toMatchObject({ state: "WAITING_ENCUMBRANCE", businessApplied: false, blockers: ["TEST_ONLY:encumbrance-open"] });
    expect(status.nextAction).toBe("QUERY_SAME_INTENT");
    expect(AMOUNT_KEYS.map((key) => status.business.amounts![key].fullText)).toEqual(["100 USDT", "25 USDT", "75 USDT", "0 USDT", "0 USDT"]);
  });

  it.each(["applied", "cancelled", "partially_applied_cancelled", "rejected"])("%s reads, as REVIEW_RECEIPT, with the constants a budget control carries", (key) => {
    const status = pending(PENDING[key]);
    expect(status.nextAction).toBe("REVIEW_RECEIPT");
    expect(status.business.businessApplied).toBe(key === "applied");
    expect(status).toMatchObject({ economicCashChanged: false, physicalTransferPerformed: false, projection: "UNKNOWN", venue: "NOT_APPLICABLE" });
  });

  it("the budget version counter stays an exact string above 2^53", () => {
    const receipt = pending(PENDING.waiting).business.receipt!;
    expect(receipt.versions).toEqual({ budget: "9007199254740993", source: "11", parent: "12", book: "13", command: "14" });
    expect(String(Number(receipt.versions.budget))).not.toBe(receipt.versions.budget);
    expect(BigInt(receipt.versions.budget)).toBe(9007199254740993n);
  });

  it("the two receipt ids are kept apart, and a linked operation that is not published is a typed absence", () => {
    const linked = pending(PENDING.linked_operation_not_published).business.receipt!;
    expect(linked.controlReceiptId).toBe("TEST_ONLY:pm:control-receipt:1");
    expect(linked.latestReceiptId).toBe("TEST_ONLY:pm:owning-recall-receipt:2");
    expect(linked.latestOperation).toEqual({ availability: "NOT_PUBLISHED", reason: "SOURCE_OPERATION_NOT_PUBLISHED" });
    expect(pending(PENDING.waiting).business.receipt!.latestOperation).toEqual({ availability: "AVAILABLE", operation: "APPLY_PENDING" });
  });

  it("the PM recall id and the Portal command id are different fields", () => {
    const status = pending(PENDING.applied);
    expect(status.originalRecallId).toBe("TEST_ONLY:original-recall");
    expect(status.commandId).toBe("ecm_00000000000000000000000000000031");
  });

  it("a pre-upgrade body (no currency) is refused whole; a capital status is another schema", () => {
    expect(readPendingControlStatusV1(edit(PENDING.waiting, (b) => { delete b.currency; }))).toBeNull();
    expect(readPendingControlStatusV1(CMD.public_status)).toEqual({ kind: "unsupported_shape", schemaVersion: COMMAND_STATUS_SCHEMA });
  });

  it.each<[string, (b: Draft) => void]>([
    ["amounts that do not add up (requested 100, outcomes 99)", (b) => { b.business.amounts.pending = "74"; }],
    ["amounts that add up only in floats", (b) => { b.business.amounts = { requested: "0.3", applied: "0.1", pending: "0.2", cancelled: "0", rejected: "0.0000000000000000001" }; }],
    ["WAITING with nothing pending", (b) => { b.business.amounts = { requested: "100", applied: "100", pending: "0", cancelled: "0", rejected: "0" }; }],
    ["WAITING with something cancelled", (b) => { b.business.amounts = { requested: "100", applied: "0", pending: "75", cancelled: "25", rejected: "0" }; }],
    ["updated before created", (b) => { b.updated_at_ms = b.created_at_ms - 1; }],
    ["WAITING that says REVIEW_RECEIPT", (b) => { b.next_action = "REVIEW_RECEIPT"; }],
    ["WAITING that is not acknowledged", (b) => { b.delivery = "SENDING"; }],
    ["WAITING with business_applied true", (b) => { b.business.business_applied = true; }],
    ["WAITING with no receipt", (b) => { b.business.receipt = null; }],
    ["WAITING with no amounts", (b) => { b.business.amounts = null; }],
    ["economic_cash_changed true", (b) => { b.economic_cash_changed = true; }],
    ["physical_transfer_performed true", (b) => { b.physical_transfer_performed = true; }],
    ["a projection other than UNKNOWN", (b) => { b.projection = "CURRENT"; }],
    ["a venue other than NOT_APPLICABLE", (b) => { b.venue = "FILLED"; }],
    ["a receipt version above int64", (b) => { b.business.receipt.versions.budget = "9223372036854775808"; }],
    ["a receipt version with a leading zero", (b) => { b.business.receipt.versions.source = "011"; }],
    ["a receipt version as a number", (b) => { b.business.receipt.versions.parent = 12; }],
    ["a payload digest in upper case", (b) => { b.business.receipt.original_payload_sha256 = "A".repeat(64); }],
    ["an AVAILABLE latest operation that is null", (b) => { b.business.receipt.latest_operation = null; }],
    ["a NOT_PUBLISHED latest operation that names one", (b) => { b.business.receipt.latest_operation_availability = "NOT_PUBLISHED"; b.business.receipt.latest_operation_reason = "SOURCE_OPERATION_NOT_PUBLISHED"; }],
    ["a family other than PENDING_RECALL_CONTROL", (b) => { b.family = "CAPITAL"; }],
    ["a resource kind ROOT", (b) => { b.resource.kind = "ROOT"; }],
    ["129 blockers", (b) => { b.business.blockers = Array.from({ length: 129 }, (_, i) => `b${i}`); }],
    ["a blocker that is empty", (b) => { b.business.blockers = [""]; }],
  ])("%s voids the read", (_name, change) => {
    expect(readPendingControlStatusV1(edit(PENDING.waiting, change))).toBeNull();
  });

  it.each<[string, (b: Draft) => void]>([
    ["UNKNOWN with amounts", (b) => { b.business.amounts = { requested: "1", applied: "0", pending: "1", cancelled: "0", rejected: "0" }; }],
    ["UNKNOWN with a receipt", (b) => { b.business.receipt = clone(PENDING.waiting.business.receipt); }],
    ["UNKNOWN with business_applied false", (b) => { b.business.business_applied = false; }],
    ["UNKNOWN with a blocker", (b) => { b.business.blockers = ["x"]; }],
    ["UNKNOWN that is ACKNOWLEDGED", (b) => { b.delivery = "ACKNOWLEDGED"; }],
    ["UNKNOWN + DELIVERY_UNKNOWN that says REVIEW_BLOCKER", (b) => { b.next_action = "REVIEW_BLOCKER"; }],
  ])("%s voids the read", (_name, change) => {
    expect(readPendingControlStatusV1(edit(PENDING.unknown, change))).toBeNull();
  });

  it("128 blockers are the most a status may carry, and a blocker may repeat", () => {
    const body = edit(PENDING.waiting, (b) => { b.business.blockers = Array(128).fill("TEST_ONLY:encumbrance-open"); });
    expect(pending(body).business.blockers).toHaveLength(128);
  });

  it("a blocker that can reverse the text around it is refused whole", () => {
    const rlo = String.fromCharCode(0x202e);
    expect(readPendingControlStatusV1(edit(PENDING.waiting, (b) => { b.business.blockers = [`open${rlo}evil`]; }))).toBeNull();
  });

  it("a decimal with more than 28 places is refused whole, never rounded", () => {
    const body = edit(PENDING.applied, (b) => {
      const tiny = `0.${"0".repeat(28)}1`;
      b.business.amounts = { requested: tiny, applied: tiny, pending: "0", cancelled: "0", rejected: "0" };
    });
    expect(readPendingControlStatusV1(body)).toBeNull();
  });
});
