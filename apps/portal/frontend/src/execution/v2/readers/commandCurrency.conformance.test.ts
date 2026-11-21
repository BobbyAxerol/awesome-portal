/**
 * Reader conformance for `commandCurrency.ts` (Rules 9.8.3, tiers L0 to L3).
 *
 * Two published schemas, both in OpenAPI documents (no file in
 * `packages/contracts/schemas` holds either):
 *   `execution-trusted-commands.openapi.json#/components/schemas/CommandStatus`
 *   `execution-pending-control.openapi.json#/components/schemas/PendingControlStatus`
 * The testkit checker reads them through a relative path, so every schema
 * oracle below is the published schema itself.
 *
 * L0  the three fixture families, verbatim and digest-checked:
 *       execution-command-currency    stored (no currency) vs served (currency)
 *       execution-pending-control-currency   8 served pending-control statuses
 *       execution-workflows / -trusted-command-collection / -capital-workflow
 *                                     every capital status they embed (9+1+1)
 *     The served ones are schema-valid and read; the stored form is refused by
 *     the schema ("currency: required") and by the reader (no unit is guessed).
 *     Every amount read carries the status currency. The closed words, the
 *     amount keys and the version keys are compared with the schemas' enums.
 * L1  state matrices:
 *       A  pending: delivery x state x business_applied x next_action x amounts
 *          x receipt x blockers (2,160) against a hand-written oracle AND the schema
 *       B  pending: settled state x 12 amount shapes against the server's
 *          partition rules (the part the schema cannot say)
 *       C  currency text: 28 forms x both statuses
 *       D  capital: operation x state x delivery x amounts x revision (1,680):
 *          the contract has no cross-field rule, so every cell reads
 *       E  int64 counters (revision, versions): 24 spellings
 *       F  decimal strings: 22 spellings
 *     Mapping to the UI: an amount is never shown without its unit, a null is
 *     not zero, WAITING with applied > 0 is not "done", an int64 is a string.
 * BE-P13 (consumer integration): `source_rejection` and `venue_fill` on every CommandStatus (typed absences, no published branch, quantities the
 * constant null), and `CommandSubmitResult` (= status + `replayed`, the capital submit 200 only). Matrices K (typed absences) and L (replayed),
 * named negatives with pinned counts, and a mutation control for the looser-than-schema counter.
 * L2  128 blockers of 512 bytes, 128-character decimals, 2,000 reads of each
 *     status, 70,000 character strings refused fast.
 * L3  generated negatives (enum, required, decimal, integer, string, array,
 *     schema_version, prototype pollution, bad roots): every case refused or
 *     accepted only where the schema accepts it; never throws, never leaks.
 */
import { afterAll, describe, expect, it } from "vitest";

import { canonicalDigest, loadCanonical, loadSchema, schemaEnum } from "../testkit/loadCanonical";
import { cartesian, coverage, describeCoverage, dimension, dimensionOf, getPath, type Draft } from "../testkit/matrix";
import {
  arrayCases, decimalCases, enumCases, integerCases, leaked, pollutionCases, prototypeIsClean, requiredCases, rootCases, schemaVersionCases, stringCases,
} from "../testkit/negative";
import { MIB, serializedBytes, timed } from "../testkit/scale";
import { validateAgainst } from "../testkit/schema";
import {
  AMOUNT_KEYS,
  COMMAND_BUSINESS_STATES,
  COMMAND_DELIVERIES,
  COMMAND_ENVIRONMENTS,
  COMMAND_NEXT_ACTIONS,
  COMMAND_OPERATIONS,
  COMMAND_PROJECTIONS,
  COMMAND_RESOURCE_KINDS,
  COMMAND_STATUS_SCHEMA,
  COMMAND_VENUES,
  PENDING_BUSINESS_STATES,
  PENDING_CONTROL_STATUS_SCHEMA,
  PENDING_NEXT_ACTIONS,
  PENDING_OPERATIONS,
  PENDING_RESOURCE_KINDS,
  PENDING_SOURCE_OPERATIONS,
  PENDING_VERSION_KEYS,
  STATUS_AUTHORITIES,
  readCommandStatusV1,
  readCommandSubmitResultV1,
  readPendingControlStatusV1,
  type CommandStatusV1,
  type PendingControlStatusV1,
  type StatusAmounts,
} from "./commandCurrency";

/* ── budgets (stated, generous: the suite shares a machine with other lanes) ── */
const BUDGET_2000_READS_MS = 600;
const BUDGET_WIDEST_MS = 150;

const FILES = [
  "execution-command-currency.synthetic", "execution-pending-control-currency.synthetic", "execution-workflows.synthetic",
  "execution-trusted-command-collection.synthetic", "execution-capital-workflow.synthetic", "execution-trusted-commands.synthetic",
];
/** BE-P13: `CommandSubmitResult` (the capital submit's 200) is CommandStatus + `replayed`; only that route answers with it. */
const SUBMIT_PTR = "/components/schemas/CommandSubmitResult";
const digestsBefore = FILES.map(canonicalDigest);
afterAll(() => {
  expect(FILES.map(canonicalDigest)).toEqual(digestsBefore);
});

const TRUSTED = "../openapi/execution-trusted-commands.openapi.json";
const PENDING_OA = "../openapi/execution-pending-control.openapi.json";
const CMD_PTR = "/components/schemas/CommandStatus";
const PEND_PTR = "/components/schemas/PendingControlStatus";
const cmdViolations = (value: unknown) => validateAgainst(TRUSTED, CMD_PTR, value);
const pendViolations = (value: unknown) => validateAgainst(PENDING_OA, PEND_PTR, value);
const submitViolations = (value: unknown) => validateAgainst(TRUSTED, SUBMIT_PTR, value);
const clone = <T,>(value: T): T => structuredClone(value);

const currencyFile = loadCanonical<{ lane: string; runtime_qualified: boolean; stored_status: Draft; public_status: Draft }>("execution-command-currency.synthetic");
const pendingFile = loadCanonical<{ lane: string; runtime_qualified: boolean; statuses: Record<string, Draft> }>("execution-pending-control-currency.synthetic");
const STORED: Draft = currencyFile.stored_status;
const SERVED: Draft = currencyFile.public_status;
const P: Record<string, Draft> = pendingFile.statuses;
const WAITING: Draft = P.waiting;
const TRUSTED_FILE = loadCanonical<Record<string, Draft>>("execution-trusted-commands.synthetic");
const SUBMIT_FIRST: Draft = TRUSTED_FILE.submit_first;
const SUBMIT_REPLAYED: Draft = TRUSTED_FILE.submit_replayed;
const submitOf = (raw: unknown) => { const read = readCommandSubmitResultV1(raw); return read !== null && read.kind === "command_submit_result" ? read.result : null; };

/** Every capital status embedded in the other fixtures, with where it sits. */
function embeddedCapitalStatuses(): { where: string; value: Draft }[] {
  const out: { where: string; value: Draft }[] = [];
  const walk = (node: unknown, path: string) => {
    if (Array.isArray(node)) node.forEach((entry, index) => walk(entry, `${path}/${index}`));
    else if (typeof node === "object" && node !== null) {
      if ((node as Draft).schema_version === COMMAND_STATUS_SCHEMA) out.push({ where: path, value: node });
      for (const [key, child] of Object.entries(node)) walk(child, `${path}/${key}`);
    }
  };
  for (const name of ["execution-workflows.synthetic", "execution-trusted-command-collection.synthetic", "execution-capital-workflow.synthetic"]) {
    walk(loadCanonical(name), name.replace(".synthetic", ""));
  }
  return out;
}
const EMBEDDED = embeddedCapitalStatuses();
const PARTIAL: Draft = EMBEDDED.find((e) => e.value.business.state === "PARTIALLY_APPLIED")!.value;

const cmdOf = (raw: unknown): CommandStatusV1 | null => {
  const read = readCommandStatusV1(raw);
  return read !== null && read.kind === "command_status" ? read.status : null;
};
const pendOf = (raw: unknown): PendingControlStatusV1 | null => {
  const read = readPendingControlStatusV1(raw);
  return read !== null && read.kind === "pending_control_status" ? read.status : null;
};
const amountsOf = (status: { business: { amounts: StatusAmounts | null } }) => status.business.amounts;

/* ═════════════════════════ L0 ═════════════════════════ */
describe("L0 · canonical, verbatim", () => {
  it("both currency files are the synthetic unqualified lane", () => {
    for (const file of [currencyFile, pendingFile]) {
      expect(file.lane).toBe("TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT");
      expect(file.runtime_qualified).toBe(false);
    }
    expect(Object.keys(pendingFile.statuses)).toEqual([
      "unknown", "failed_before_send", "waiting", "applied", "cancelled", "partially_applied_cancelled", "rejected", "linked_operation_not_published",
      "deployment_cancelled",
    ]);
  });

  it("stored vs served: the stored status is the served one minus currency; the schema and the reader both refuse it", () => {
    // The stored form predates the unit AND the BE-P13 typed absences: both are projection-time additions of the served status.
    const { currency: _unit, source_rejection: _rejection, venue_fill: _fill, ...withoutCurrency } = SERVED;
    expect(withoutCurrency).toEqual(STORED);
    expect(cmdViolations(STORED)).toEqual(["$.currency: required", "$.source_rejection: required", "$.venue_fill: required"]);
    expect(cmdViolations(SERVED)).toEqual([]);
    expect(readCommandStatusV1(STORED)).toBeNull();
    expect(cmdOf(SERVED)).toMatchObject({ currency: "USDT", commandId: SERVED.command_id });
  });

  it("every pending-control status passes the published schema through the testkit checker, and reads", () => {
    for (const [name, value] of Object.entries(P)) {
      expect(pendViolations(value), name).toEqual([]);
      expect(pendOf(value), name).not.toBeNull();
    }
    // The same body without its currency is the pre-upgrade body: refused by both.
    for (const [name, value] of Object.entries(P)) {
      const { currency: _unit, ...old } = value;
      expect(pendViolations(old), name).toEqual(["$.currency: required"]);
      expect(readPendingControlStatusV1(old), name).toBeNull();
    }
    // FE-063: the same body without recipient_account_id is the pre-upgrade body too (the key is required, nullable).
    for (const [name, value] of Object.entries(P)) {
      const { recipient_account_id: _recipient, ...old } = value;
      expect(pendViolations(old), name).toEqual(["$.recipient_account_id: required"]);
      expect(readPendingControlStatusV1(old), name).toBeNull();
    }
  });

  it("FE-063: the published schema refuses the same four cross-field bodies the reader refuses (the rule is in the schema, not invented here)", () => {
    const portfolioWithAccount = clone(P.waiting);
    portfolioWithAccount.recipient_account_id = "TEST_ONLY:account";
    const deploymentWithout = clone(P.deployment_cancelled);
    deploymentWithout.recipient_account_id = null;
    for (const [name, body] of Object.entries({ portfolioWithAccount, deploymentWithout })) {
      expect(pendViolations(body).length, name).toBeGreaterThan(0);
      expect(readPendingControlStatusV1(body), name).toBeNull();
    }
    // Both valid pairings are accepted by the schema and the reader.
    for (const body of [P.waiting, P.deployment_cancelled]) {
      expect(pendViolations(body)).toEqual([]);
      expect(pendOf(body)).not.toBeNull();
    }
  });

  it("FE-063: recipient_account_id is read verbatim and is non-null exactly for the DEPLOYMENT status", () => {
    const kinds = new Map<string, string | null>();
    for (const [name, value] of Object.entries(P)) {
      const status = pendOf(value)!;
      expect(status.recipientAccountId, name).toBe(value.recipient_account_id);
      expect(status.recipientAccountId !== null, name).toBe(status.resource.kind === "DEPLOYMENT");
      kinds.set(status.resource.kind, status.recipientAccountId);
    }
    expect(kinds.get("DEPLOYMENT")).toBe("TEST_ONLY:account");
    expect(kinds.get("PORTFOLIO")).toBeNull();
    expect(P.deployment_cancelled.resource.kind).toBe("DEPLOYMENT");
    expect(pendOf(P.deployment_cancelled)!.business.state).toBe("CANCELLED");
  });

  it("every capital status embedded in the other fixtures passes the CommandStatus schema, and reads", () => {
    expect(EMBEDDED.length).toBeGreaterThanOrEqual(11);
    for (const { where, value } of EMBEDDED) {
      expect(cmdViolations(value), where).toEqual([]);
      expect(cmdOf(value), where).not.toBeNull();
    }
    expect(new Set(EMBEDDED.map((e) => e.value.business.state))).toEqual(new Set(["UNKNOWN", "APPLIED", "REJECTED", "WAITING_ENCUMBRANCE", "PARTIALLY_APPLIED", "PARTIALLY_APPLIED_CANCELLED"]));
  });

  it("BE-P13: every embedded capital status carries both typed absences, with the counts the fixtures publish", () => {
    const rejection = (state: string) => EMBEDDED.filter((e) => e.value.source_rejection.state === state).length;
    const fill = (state: string) => EMBEDDED.filter((e) => e.value.venue_fill.state === state).length;
    expect([rejection("NOT_APPLICABLE"), rejection("NOT_PUBLISHED")]).toEqual([9, 2]);
    expect([fill("NOT_APPLICABLE"), fill("NOT_PUBLISHED")]).toEqual([8, 3]);
    for (const { where, value } of EMBEDDED) {
      const status = cmdOf(value)!;
      expect(status.sourceRejection, where).toEqual(value.source_rejection);
      expect(status.venueFill, where).toEqual(value.venue_fill);
      expect(status.venueFill.quantities, where).toBeNull();
    }
  });

  it("BE-P13: submit_first and submit_replayed pass CommandSubmitResult, read with their bit, and are NOT a CommandStatus (the status schema refuses `replayed`)", () => {
    expect(submitViolations(SUBMIT_FIRST)).toEqual([]);
    expect(submitViolations(SUBMIT_REPLAYED)).toEqual([]);
    expect(submitOf(SUBMIT_FIRST)).toMatchObject({ replayed: false });
    expect(submitOf(SUBMIT_REPLAYED)).toMatchObject({ replayed: true });
    for (const body of [SUBMIT_FIRST, SUBMIT_REPLAYED]) {
      expect(cmdViolations(body)).toEqual(["$.replayed: not allowed"]);
      expect(readCommandStatusV1(body)).toBeNull();
    }
    const { replayed: _bit, ...asStatus } = SUBMIT_REPLAYED;
    expect(cmdViolations(asStatus)).toEqual([]);
    expect(submitViolations(asStatus)).toEqual(["$.replayed: required"]);
    expect(readCommandSubmitResultV1(asStatus)).toBeNull();
    expect(submitOf(SUBMIT_REPLAYED)!.status).toEqual(cmdOf(asStatus));
  });

  it("an amount is never read without its unit: every MoneyAmount carries the status currency, byte for byte", () => {
    let seen = 0;
    const check = (status: { currency: string; business: { amounts: StatusAmounts | null } }) => {
      for (const key of AMOUNT_KEYS) {
        const amount = amountsOf(status)?.[key];
        if (amount === undefined) continue;
        seen += 1;
        expect(amount.currency).toBe(status.currency);
        expect(amount.text.endsWith(` ${status.currency}`)).toBe(true);
        expect(amount.fullText).toBe(`${amount.decimal.full} ${status.currency}`);
      }
    };
    for (const { value } of EMBEDDED) check(cmdOf(value)!);
    for (const value of Object.values(P)) check(pendOf(value)!);
    expect(seen).toBeGreaterThan(40);
  });

  it("exact strings come back byte for byte (an 18 digit amount, an int64 counter above 2^53)", () => {
    expect(amountsOf(cmdOf(PARTIAL)!)!.requested.decimal.full).toBe("1000.000000000000000001");
    expect(pendOf(WAITING)!.business.receipt!.versions.budget).toBe("9007199254740993");
    expect(pendOf(P.linked_operation_not_published)!.business.receipt!.versions.command).toBe("15");
  });

  it("the closed words the reader holds are the schemas', word for word", () => {
    const cmd = (field: string) => schemaEnum(TRUSTED, `${CMD_PTR}/properties/${field}`);
    expect([...COMMAND_OPERATIONS]).toEqual([...cmd("operation")]);
    expect([...COMMAND_ENVIRONMENTS]).toEqual([...cmd("environment")]);
    expect([...COMMAND_DELIVERIES]).toEqual([...cmd("delivery")]);
    expect([...COMMAND_PROJECTIONS]).toEqual([...cmd("projection")]);
    expect([...COMMAND_VENUES]).toEqual([...cmd("venue")]);
    expect([...COMMAND_NEXT_ACTIONS]).toEqual([...cmd("next_action")]);
    expect([...STATUS_AUTHORITIES]).toEqual([...cmd("authority")]);
    expect([...COMMAND_RESOURCE_KINDS]).toEqual([...schemaEnum(TRUSTED, `${CMD_PTR}/properties/resource/properties/kind`)]);
    expect([...COMMAND_BUSINESS_STATES]).toEqual([...schemaEnum(TRUSTED, `${CMD_PTR}/properties/business/properties/state`)]);
    const pend = (field: string) => schemaEnum(PENDING_OA, `${PEND_PTR}/properties/${field}`);
    expect([...PENDING_OPERATIONS]).toEqual([...pend("operation")]);
    expect([...PENDING_NEXT_ACTIONS]).toEqual([...pend("next_action")]);
    expect([...STATUS_AUTHORITIES]).toEqual([...pend("authority")]);
    expect([...COMMAND_DELIVERIES]).toEqual([...pend("delivery")]);
    expect([...COMMAND_ENVIRONMENTS]).toEqual([...pend("environment")]);
    expect([...PENDING_BUSINESS_STATES]).toEqual([...schemaEnum(PENDING_OA, `${PEND_PTR}/properties/business/properties/state`)]);
    expect([...PENDING_RESOURCE_KINDS]).toEqual([...schemaEnum(PENDING_OA, "/components/schemas/PendingControlResource/properties/kind")]);
    expect([...PENDING_SOURCE_OPERATIONS]).toEqual([...schemaEnum(PENDING_OA, "/components/schemas/PendingRecallReceipt/properties/latest_operation/anyOf/0")]);
    expect([...AMOUNT_KEYS]).toEqual((loadSchema(PENDING_OA).components as Draft).schemas.PendingControlAmounts.required);
    expect([...PENDING_VERSION_KEYS]).toEqual((loadSchema(PENDING_OA).components as Draft).schemas.PendingControlVersions.required);
    expect([...AMOUNT_KEYS]).toEqual((loadSchema(TRUSTED).components as Draft).schemas.CommandStatus.properties.business.properties.amounts.anyOf[0].required);
  });

  it("the reader and the schema agree on schema_version, and neither reads the other's status", () => {
    expect(COMMAND_STATUS_SCHEMA).toBe("portal.execution.command-status.v1");
    expect(PENDING_CONTROL_STATUS_SCHEMA).toBe("portal.execution.pending-recall-status.v1");
    expect(readCommandStatusV1(WAITING)).toEqual({ kind: "unsupported_shape", schemaVersion: PENDING_CONTROL_STATUS_SCHEMA });
    expect(readPendingControlStatusV1(SERVED)).toEqual({ kind: "unsupported_shape", schemaVersion: COMMAND_STATUS_SCHEMA });
  });
});

/* ═════════════════ defects in the fixtures / contract (pinned) ═════════════════ */
describe("defects pinned", () => {
  /*
   * CC-1 (fixed by Codex in d0789674): `execution-trusted-commands.synthetic.valid.json#ack_only`
   * used to be the pre-upgrade status (no `currency`) and the schema called it
   * incomplete. The fixture is now the served status (it carries `currency`), and
   * the stored form moved to `stored_ack_only` (the currency fixture's
   * `stored_status`). Now an ordinary test: the fixture is a valid served status
   * and the reader reads it; the stored form is still refused by both.
   */
  it("CC-1 (fixed): execution-trusted-commands#ack_only is a valid served CommandStatus the reader reads", () => {
    const fixture = loadCanonical<Draft>("execution-trusted-commands.synthetic");
    expect(cmdViolations(fixture.ack_only)).toEqual([]);
    const status = cmdOf(fixture.ack_only);
    expect(status).not.toBeNull();
    expect(status!.currency).toBe(fixture.ack_only.currency);
    // The served one equals the currency fixture's served status; the stored one is the old shape.
    expect(fixture.ack_only).toEqual(SERVED);
    expect(fixture.stored_ack_only).toEqual(STORED);
    expect(cmdViolations(fixture.stored_ack_only).length).toBeGreaterThan(0);
    expect(readCommandStatusV1(fixture.stored_ack_only)).toBeNull();
  });

  /*
   * CC-2 (fixed by Codex in d0789674): `CommandStatus.business.revision` was
   * `^(?:0|[1-9][0-9]{0,18})$` (accepted up to 9999999999999999999) while the
   * server's pmCounter refuses anything above int64. The pattern is now the exact
   * PM int64 grammar (max 9223372036854775807). Ordinary tests: the schema and the
   * reader both refuse the first value above int64, and both accept int64 max.
   */
  it("CC-2 (fixed): the capital CommandStatus schema refuses a revision above int64", () => {
    const body = clone(SERVED);
    body.business.revision = "9223372036854775808";
    expect(cmdViolations(body)).not.toEqual([]);
    body.business.revision = "9223372036854775807";
    expect(cmdViolations(body)).toEqual([]);
  });

  it("CC-2 (reader side): the reader refuses the revision the schema now refuses, and reads int64 max", () => {
    const body = clone(SERVED);
    body.business.revision = "9223372036854775808";
    expect(cmdViolations(body)).not.toEqual([]);
    expect(readCommandStatusV1(body)).toBeNull();
    body.business.revision = "9223372036854775807";
    expect(cmdOf(body)).not.toBeNull();
  });

  /*
   * DEFECT CC-3 (contract): the stored-vs-served split is a convention, not a
   * schema: both carry `schema_version: portal.execution.command-status.v1`.
   * A reader that accepts the older shape cannot tell them apart. This reader
   * requires `currency`, so the stored form is refused; the fixture contrast is
   * pinned in L0. Recorded so a v2 schema_version is considered when the stored
   * form can reach a browser (it must not).
   */
  it("CC-3: the served and the stored status share one schema_version; only `currency` tells them apart", () => {
    expect(STORED.schema_version).toBe(SERVED.schema_version);
  });
});

/* ═════════════════════════ L1 ═════════════════════════ */
const AMOUNTS_BY_STATE: Record<string, Record<string, string>> = {
  APPLIED: { requested: "100", applied: "100", pending: "0", cancelled: "0", rejected: "0" },
  CANCELLED: { requested: "100", applied: "0", pending: "0", cancelled: "100", rejected: "0" },
  REJECTED: { requested: "100", applied: "0", pending: "0", cancelled: "0", rejected: "100" },
  PARTIALLY_APPLIED_CANCELLED: { requested: "100", applied: "25", pending: "0", cancelled: "75", rejected: "0" },
  WAITING_ENCUMBRANCE: { requested: "100", applied: "25", pending: "75", cancelled: "0", rejected: "0" },
  UNKNOWN: { requested: "100", applied: "25", pending: "75", cancelled: "0", rejected: "0" },
};
const NEXT_BY_STATE = (state: string) => (state === "WAITING_ENCUMBRANCE" ? "QUERY_SAME_INTENT" : "REVIEW_RECEIPT");

describe("L1 · matrix A · pending: delivery x state x applied x next action x amounts x receipt x blockers", () => {
  const DIMS = [
    dimension("delivery", ["delivery"], [...COMMAND_DELIVERIES]),
    dimensionOf("state", PENDING_BUSINESS_STATES.map((state) => ({ label: state, apply: (d: Draft) => { d.business.state = state; } }))),
    dimension("applied", ["business", "business_applied"], [true, false, null]),
    dimension("next", ["next_action"], [...PENDING_NEXT_ACTIONS]),
    dimensionOf("amounts", [
      { label: "null", apply: (d: Draft) => { d.business.amounts = null; } },
      { label: "fits", apply: (d: Draft) => { d.business.amounts = clone(AMOUNTS_BY_STATE[d.business.state]); } },
    ]),
    dimensionOf("receipt", [
      { label: "null", apply: (d: Draft) => { d.business.receipt = null; } },
      { label: "valid", apply: (d: Draft) => { d.business.receipt = clone(WAITING.business.receipt); } },
    ]),
    dimensionOf("blockers", [
      { label: "0", apply: (d: Draft) => { d.business.blockers = []; } },
      { label: "2", apply: (d: Draft) => { d.business.blockers = ["TEST_ONLY:a", "TEST_ONLY:a"]; } },
    ]),
  ];
  const states = cartesian(WAITING, DIMS);
  // Written from the contract's sentences (see the schema description and `pendingControlStatus.superRefine`), not from the schema.
  const accept = (p: Record<string, string>) => p.state === "UNKNOWN"
    ? p.delivery !== "ACKNOWLEDGED" && p.applied === "null" && p.amounts === "null" && p.receipt === "null" && p.blockers === "0"
      && p.next === (p.delivery === "FAILED_BEFORE_SEND" ? "REVIEW_BLOCKER" : "QUERY_SAME_INTENT")
    : p.delivery === "ACKNOWLEDGED" && p.amounts === "fits" && p.receipt === "valid" && p.applied === String(p.state === "APPLIED") && p.next === NEXT_BY_STATE(p.state);

  it("prints the matrix size", () => {
    console.info(describeCoverage("commandCurrency A (pending) cartesian", coverage(DIMS, states)));
    expect(states).toHaveLength(5 * 6 * 3 * 3 * 2 * 2 * 2);
    // UNKNOWN: 4 deliveries (next fixed by delivery); settled: 5 states x 1.
    expect(states.filter((s) => accept(s.picks))).toHaveLength(4 * 1 + 5 * 2);
  });

  it.each(states.map((s) => [s.name, s] as const))("%s", (_name, state) => {
    const body = pendOf(state.value);
    expect(body !== null).toBe(accept(state.picks));
    // The sentence and the schema agree on every cell (the amounts used satisfy what the schema cannot say).
    expect(pendViolations(state.value).length === 0).toBe(accept(state.picks));
    if (body === null) return;
    // UNKNOWN says nothing about money: no amounts, never a zero.
    if (body.business.state === "UNKNOWN") expect(body.business.amounts).toBeNull();
    else for (const key of AMOUNT_KEYS) expect(body.business.amounts![key].currency).toBe("USDT");
  });
});

describe("L1 · matrix B · pending: settled state x amount shape (what the schema cannot say)", () => {
  const SHAPES: Record<string, Record<string, string>> = {
    "all zero": { requested: "0", applied: "0", pending: "0", cancelled: "0", rejected: "0" },
    "applied in full": { requested: "100", applied: "100", pending: "0", cancelled: "0", rejected: "0" },
    "cancelled in full": { requested: "100", applied: "0", pending: "0", cancelled: "100", rejected: "0" },
    "rejected in full": { requested: "100", applied: "0", pending: "0", cancelled: "0", rejected: "100" },
    "partly applied, rest cancelled": { requested: "100", applied: "25", pending: "0", cancelled: "75", rejected: "0" },
    "partly applied, rest pending": { requested: "100", applied: "25", pending: "75", cancelled: "0", rejected: "0" },
    "all pending": { requested: "100", applied: "0", pending: "100", cancelled: "0", rejected: "0" },
    "pending and cancelled": { requested: "100", applied: "0", pending: "50", cancelled: "50", rejected: "0" },
    "does not add up": { requested: "100", applied: "100", pending: "100", cancelled: "0", rejected: "0" },
    "adds up across scales": { requested: "0.30", applied: "0.1", pending: "0.2", cancelled: "0", rejected: "0.000" },
    "adds up at 18 places": { requested: "1000.000000000000000001", applied: "300", pending: "700.000000000000000001", cancelled: "0", rejected: "0" },
    "off by one at 18 places": { requested: "1000.000000000000000001", applied: "300", pending: "700.000000000000000002", cancelled: "0", rejected: "0" },
  };
  const DIMS = [
    dimensionOf("state", [...PENDING_BUSINESS_STATES].filter((s) => s !== "UNKNOWN").map((state) => ({
      label: state,
      apply: (d: Draft) => { d.business.state = state; d.business.business_applied = state === "APPLIED"; d.next_action = NEXT_BY_STATE(state); },
    }))),
    dimensionOf("shape", Object.entries(SHAPES).map(([label, shape]) => ({ label, apply: (d: Draft) => { d.business.amounts = clone(shape); } }))),
  ];
  const states = cartesian(WAITING, DIMS);
  const nonzero = (shape: Record<string, string>, key: string) => Number(shape[key]) !== 0;
  const adds = (shape: Record<string, string>) => !["does not add up", "off by one at 18 places"].includes(Object.keys(SHAPES).find((k) => SHAPES[k] === shape) ?? "");
  // The server's `assertStatePartition`, restated.
  const table = (state: string, shape: Record<string, string>) => adds(shape) && ({
    APPLIED: !nonzero(shape, "pending") && !nonzero(shape, "cancelled") && !nonzero(shape, "rejected"),
    REJECTED: !nonzero(shape, "applied") && !nonzero(shape, "pending") && !nonzero(shape, "cancelled"),
    CANCELLED: !nonzero(shape, "applied") && !nonzero(shape, "pending") && !nonzero(shape, "rejected"),
    PARTIALLY_APPLIED_CANCELLED: nonzero(shape, "applied") && nonzero(shape, "cancelled") && !nonzero(shape, "pending") && !nonzero(shape, "rejected"),
    WAITING_ENCUMBRANCE: nonzero(shape, "pending") && !nonzero(shape, "cancelled") && !nonzero(shape, "rejected"),
  } as Record<string, boolean>)[state]!;

  it("prints the matrix size", () => {
    console.info(describeCoverage("commandCurrency B (partition) cartesian", coverage(DIMS, states)));
    expect(states).toHaveLength(5 * 12);
  });

  it.each(states.map((s) => [s.name, s] as const))("%s", (_name, state) => {
    const state_ = state.picks.state!;
    const shape = SHAPES[state.picks.shape!]!;
    expect(pendOf(state.value) !== null).toBe(table(state_, shape));
  });

  it("prints how much of this the schema cannot say: it accepts every shape, the reader refuses the contradictory ones", () => {
    const schemaOk = states.filter((s) => pendViolations(s.value).length === 0).length;
    const readerOk = states.filter((s) => pendOf(s.value) !== null).length;
    console.info(`commandCurrency B: schema accepts ${schemaOk} of ${states.length}, reader accepts ${readerOk}`);
    expect(schemaOk).toBe(states.length);
    expect(readerOk).toBeLessThan(states.length);
  });
});

describe("L1 · matrix C · the currency text", () => {
  const rlo = String.fromCharCode(0x202e);
  const zwsp = String.fromCharCode(0x200b);
  const nbsp = String.fromCharCode(0x00a0);
  const ideographicSpace = String.fromCharCode(0x3000);
  const nel = String.fromCharCode(0x0085);
  const lone = String.fromCharCode(0xd800);
  const FORMS: [string, unknown, "ok" | "no", "schema-ok" | "schema-no"][] = [
    ["USDT", "USDT", "ok", "schema-ok"],
    ["lower case", "usdt", "ok", "schema-ok"],
    ["BTC", "BTC", "ok", "schema-ok"],
    ["one letter", "A", "ok", "schema-ok"],
    ["a space inside", "USD Coin", "ok", "schema-ok"],
    ["a symbol", "€", "ok", "schema-ok"],
    ["CJK", "日本円", "ok", "schema-ok"],
    ["512 ASCII characters", "U".repeat(512), "ok", "schema-ok"],
    ["256 two-byte characters (512 bytes)", "é".repeat(256), "ok", "schema-ok"],
    ["empty", "", "no", "schema-no"],
    ["513 ASCII characters", "U".repeat(513), "no", "schema-no"],
    ["257 two-byte characters (514 bytes)", "é".repeat(257), "no", "schema-ok"],
    ["a leading space", " USDT", "no", "schema-no"],
    ["a trailing space", "USDT ", "no", "schema-no"],
    ["only spaces", "   ", "no", "schema-no"],
    ["a trailing newline", "USDT\n", "no", "schema-no"],
    ["a leading tab", "\tUSDT", "no", "schema-no"],
    ["a control character inside", "US\u0001DT", "no", "schema-no"],
    ["DEL inside", "US\u007fDT", "no", "schema-no"],
    ["a leading no-break space", `${nbsp}USDT`, "no", "schema-no"],
    ["a trailing ideographic space", `USDT${ideographicSpace}`, "no", "schema-no"],
    ["a leading NEL", `${nel}USDT`, "no", "schema-no"],
    ["a bidi override inside", `US${rlo}TD`, "no", "schema-ok"],
    ["a zero-width space inside", `USD${zwsp}T`, "no", "schema-ok"],
    ["a lone surrogate", `US${lone}`, "no", "schema-ok"],
    ["a number", 1, "no", "schema-no"],
    ["null", null, "no", "schema-no"],
    ["an object", { code: "USDT" }, "no", "schema-no"],
  ];
  const cases: [string, unknown, string, string][] = FORMS.flatMap(([label, value, reader, schema]) => [
    [`capital · ${label}`, value, reader, schema] as [string, unknown, string, string],
    [`pending · ${label}`, value, reader, schema] as [string, unknown, string, string],
  ]);

  it("prints the matrix size", () => {
    expect(FORMS).toHaveLength(28);
    expect(cases).toHaveLength(56);
  });

  it.each(cases)("%s", (name, value, reader, schema) => {
    const isCapital = name.startsWith("capital");
    const body = clone(isCapital ? SERVED : WAITING);
    body.currency = value;
    const violations = isCapital ? cmdViolations(body) : pendViolations(body);
    const read = isCapital ? cmdOf(body) : pendOf(body);
    expect(read !== null, "reader").toBe(reader === "ok");
    expect(violations.length === 0, "schema").toBe(schema === "schema-ok");
    // The reader is never looser than the schema.
    if (read !== null) expect(violations).toEqual([]);
    if (read !== null) expect(read.currency).toBe(value);
  });
});

describe("L1 · matrix D · capital: operation x state x delivery x amounts x revision", () => {
  const SHAPE = { requested: "1000", applied: "300", pending: "700", cancelled: "0", rejected: "0" };
  const DIMS = [
    dimension("operation", ["operation"], [...COMMAND_OPERATIONS]),
    dimension("state", ["business", "state"], [...COMMAND_BUSINESS_STATES]),
    dimension("delivery", ["delivery"], [...COMMAND_DELIVERIES]),
    dimension("amounts", ["business", "amounts"], [null, SHAPE]),
    dimension("revision", ["business", "revision"], [null, "0", "9223372036854775807"]),
  ];
  const states = cartesian(SERVED, DIMS);
  it("prints the matrix size", () => {
    console.info(describeCoverage("commandCurrency D (capital) cartesian", coverage(DIMS, states)));
    expect(states).toHaveLength(8 * 7 * 5 * 2 * 3);
  });
  it.each(states.map((s) => [s.name, s] as const))("%s", (_name, state) => {
    // The capital contract has no cross-field rule, so every cell is schema-valid and reads; the reader invents none.
    expect(cmdViolations(state.value)).toEqual([]);
    const status = cmdOf(state.value);
    expect(status).not.toBeNull();
    expect(status!.business.state).toBe(state.picks.state);
    expect(status!.business.amounts === null).toBe(state.picks.amounts === "null");
    if (status!.business.amounts !== null) expect(status!.business.amounts.requested.fullText).toBe("1000 USDT");
    expect(status!.business.revision).toBe(state.value.business.revision);
  });
});

describe("L1 · matrix E · int64 counters (revision, receipt versions)", () => {
  const COUNTERS: [string, unknown, boolean][] = [
    ["0", "0", true], ["1", "1", true], ["a small counter", "42", true], ["2^53 - 1", "9007199254740991", true], ["2^53 + 1", "9007199254740993", true],
    ["int64 max", "9223372036854775807", true], ["int64 max + 1", "9223372036854775808", false], ["10^19 - 1 (19 digits)", "9999999999999999999", false],
    ["20 digits", "10000000000000000000", false], ["a leading zero", "01", false], ["two leading zeros", "00", false], ["negative", "-1", false],
    ["an exponent", "1e3", false], ["a decimal", "1.0", false], ["a space", " 1", false], ["a trailing newline", "1\n", false], ["empty", "", false],
    ["a plus sign", "+1", false], ["full-width digits", "１２３", false], ["a JS number", 7, false], ["a bigint-ish number", 2 ** 53, false], ["true", true, false],
    ["null (revision only)", null, true], ["an array", ["1"], false],
  ];
  it("prints the matrix size", () => {
    expect(COUNTERS).toHaveLength(24);
  });
  it.each(COUNTERS)("revision · %s", (_name, value, ok) => {
    const body = clone(SERVED);
    body.business.revision = value;
    // null is a legal "no revision yet" for the capital status only.
    expect(cmdOf(body) !== null).toBe(ok);
    // Since d0789674 the schema holds the same int64 bound (CC-2 fixed): schema and reader agree exactly.
    expect(cmdViolations(body).length === 0).toBe(ok);
  });
  it.each(COUNTERS.filter(([, value]) => value !== null))("receipt version · %s", (_name, value, ok) => {
    const body = clone(WAITING);
    body.business.receipt.versions.budget = value;
    expect(pendOf(body) !== null).toBe(ok);
    // The pending-control schema pins the same int64 range, so here the schema and the reader agree exactly.
    expect(pendViolations(body).length === 0).toBe(ok);
  });
});

describe("L1 · matrix F · decimal strings", () => {
  const D128 = `${"1".repeat(100)}.${"1".repeat(27)}`;
  const DECIMALS: [string, unknown, boolean, boolean][] = [
    // label, value, reader reads, schema valid
    ["0", "0", true, true], ["0.0", "0.0", true, true], ["100", "100", true, true], ["100.50", "100.50", true, true], ["1000.000000000000000001", "1000.000000000000000001", true, true],
    ["28 places", `0.${"0".repeat(27)}1`, true, true], ["29 places", `0.${"0".repeat(28)}1`, false, true], ["128 characters", D128, true, true],
    ["129 characters", `${D128}1`, false, false], ["a trailing point", "1.", false, false], ["a leading point", ".5", false, false], ["a leading zero", "01", false, false],
    ["a plus sign", "+1", false, false], ["negative", "-1", false, false], ["negative zero", "-0", false, false], ["an exponent", "1e3", false, false],
    ["a thousands comma", "1,000", false, false], ["full-width digits", "１２３", false, false], ["empty", "", false, false], ["a space", " 1", false, false],
    ["a JS number", 100, false, false], ["null", null, false, false],
  ];
  it("prints the matrix size", () => {
    expect(DECIMALS).toHaveLength(22);
  });
  it.each(DECIMALS)("pending amount · %s", (_name, value, readerOk, schemaOk) => {
    const body = clone(P.applied);
    // requested = applied so the partition holds whenever the value itself is readable.
    body.business.amounts.requested = value;
    body.business.amounts.applied = value;
    expect(pendViolations(body).length === 0).toBe(schemaOk);
    expect(pendOf(body) !== null).toBe(readerOk);
    if (pendOf(body) !== null) expect(pendViolations(body)).toEqual([]);
  });
  it.each(DECIMALS)("capital amount · %s", (_name, value, readerOk, schemaOk) => {
    const body = clone(PARTIAL);
    body.business.amounts.requested = value;
    expect(cmdViolations(body).length === 0).toBe(schemaOk);
    expect(cmdOf(body) !== null).toBe(readerOk);
    if (cmdOf(body) !== null) expect(cmdViolations(body)).toEqual([]);
  });
});

/* ═════════════ BE-P13 matrices (K, L) ═════════════ */
describe("L1 · matrix K · capital: source_rejection x venue_fill (the typed absences, no published branch)", () => {
  const NA_REJ = { state: "NOT_APPLICABLE", reason: null };
  const NP_REJ = { state: "NOT_PUBLISHED", reason: "SOURCE_RESULT_HAS_NO_REJECTION_REASON" };
  const NA_FILL = { state: "NOT_APPLICABLE", reason: null, quantities: null };
  const NP_FILL = { state: "NOT_PUBLISHED", reason: "SOURCE_RESULT_HAS_NO_FILL_QUANTITIES", quantities: null };
  const DIMS = [
    dimensionOf("rejection", [
      { label: "not applicable", apply: (d: Draft) => { d.source_rejection = clone(NA_REJ); } },
      { label: "not published", apply: (d: Draft) => { d.source_rejection = clone(NP_REJ); } },
      { label: "published", apply: (d: Draft) => { d.source_rejection = { state: "PUBLISHED", reason: "INSUFFICIENT_MARGIN" }; } },
      { label: "NA with a reason", apply: (d: Draft) => { d.source_rejection = { state: "NOT_APPLICABLE", reason: "SOURCE_RESULT_HAS_NO_REJECTION_REASON" }; } },
      { label: "NP without reason", apply: (d: Draft) => { d.source_rejection = { state: "NOT_PUBLISHED", reason: null }; } },
      { label: "NP with the fill reason", apply: (d: Draft) => { d.source_rejection = { state: "NOT_PUBLISHED", reason: "SOURCE_RESULT_HAS_NO_FILL_QUANTITIES" }; } },
      { label: "extra key", apply: (d: Draft) => { d.source_rejection = { ...clone(NP_REJ), message: "x" }; } },
      { label: "null", apply: (d: Draft) => { d.source_rejection = null; } },
      { label: "absent", apply: (d: Draft) => { delete d.source_rejection; } },
    ]),
    dimensionOf("fill", [
      { label: "not applicable", apply: (d: Draft) => { d.venue_fill = clone(NA_FILL); } },
      { label: "not published", apply: (d: Draft) => { d.venue_fill = clone(NP_FILL); } },
      { label: "published", apply: (d: Draft) => { d.venue_fill = { state: "PUBLISHED", reason: null, quantities: null }; } },
      { label: "quantities object", apply: (d: Draft) => { d.venue_fill = { ...clone(NP_FILL), quantities: { filled: "1", remaining: "2" } }; } },
      { label: "quantities string", apply: (d: Draft) => { d.venue_fill = { ...clone(NP_FILL), quantities: "1" }; } },
      { label: "NA with a reason", apply: (d: Draft) => { d.venue_fill = { ...clone(NA_FILL), reason: "SOURCE_RESULT_HAS_NO_FILL_QUANTITIES" }; } },
      { label: "NP with the rejection reason", apply: (d: Draft) => { d.venue_fill = { ...clone(NP_FILL), reason: "SOURCE_RESULT_HAS_NO_REJECTION_REASON" }; } },
      { label: "quantities absent", apply: (d: Draft) => { delete d.venue_fill.quantities; } },
      { label: "extra key", apply: (d: Draft) => { d.venue_fill = { ...clone(NP_FILL), partial: false }; } },
      { label: "null", apply: (d: Draft) => { d.venue_fill = null; } },
      { label: "absent", apply: (d: Draft) => { delete d.venue_fill; } },
    ]),
    dimension("business", ["business", "state"], ["UNKNOWN", "REJECTED", "APPLIED"]),
    dimension("venue", ["venue"], ["NOT_APPLICABLE", "UNKNOWN", "FILLED"]),
  ];
  const states = cartesian(SERVED, DIMS);
  /** The closed unions only. The server's pairing with business.state / venue is its projection, not a schema rule: every pairing reads. */
  const accept = (p: Record<string, string>) => (p.rejection === "not applicable" || p.rejection === "not published") && (p.fill === "not applicable" || p.fill === "not published");
  it("prints the matrix size", () => {
    console.info(describeCoverage("commandCurrency K (typed absences) cartesian", coverage(DIMS, states)));
    expect(states).toHaveLength(9 * 11 * 3 * 3);
    expect(states.filter((s) => accept(s.picks))).toHaveLength(2 * 2 * 3 * 3);
  });
  it.each(states.map((s) => [s.name, s] as const))("%s", (_name, s) => {
    const read = cmdOf(s.value);
    expect(read !== null).toBe(accept(s.picks));
    expect(cmdViolations(s.value).length === 0, "the schema oracle agrees").toBe(accept(s.picks));
    if (read !== null) {
      expect(read.venueFill.quantities).toBeNull();
      expect(read.sourceRejection.state).toBe(s.value.source_rejection.state);
    }
  });
});

describe("L1 · matrix L · submit result: replayed x status key (the bit belongs to the submit result alone)", () => {
  const DIMS = [
    dimensionOf("replayed", [
      { label: "false", apply: (d: Draft) => { d.replayed = false; } },
      { label: "true", apply: (d: Draft) => { d.replayed = true; } },
      { label: "string true", apply: (d: Draft) => { d.replayed = "true"; } },
      { label: "string false", apply: (d: Draft) => { d.replayed = "false"; } },
      { label: "zero", apply: (d: Draft) => { d.replayed = 0; } },
      { label: "null", apply: (d: Draft) => { d.replayed = null; } },
      { label: "object", apply: (d: Draft) => { d.replayed = {}; } },
      { label: "absent", apply: (d: Draft) => { delete d.replayed; } },
    ]),
    dimension("business", ["business", "state"], [...COMMAND_BUSINESS_STATES]),
    dimension("currency", ["currency"], ["USDT", "", " USDT"]),
    dimensionOf("extra", [
      { label: "none", apply: () => undefined },
      { label: "second marker", apply: (d: Draft) => { d.was_replayed = true; } },
    ]),
  ];
  const states = cartesian(SUBMIT_FIRST, DIMS);
  const accept = (p: Record<string, string>) => (p.replayed === "false" || p.replayed === "true") && p.currency === "USDT" && p.extra === "none";
  it("prints the matrix size", () => {
    console.info(describeCoverage("commandCurrency L (submit result) cartesian", coverage(DIMS, states)));
    expect(states).toHaveLength(8 * 7 * 3 * 2);
    expect(states.filter((s) => accept(s.picks))).toHaveLength(2 * 7);
  });
  it.each(states.map((s) => [s.name, s] as const))("%s", (_name, s) => {
    const read = submitOf(s.value);
    expect(read !== null).toBe(accept(s.picks));
    if (read !== null) expect(submitViolations(s.value)).toEqual([]);
    expect(submitViolations(s.value).length === 0, "the schema oracle agrees").toBe(accept(s.picks));
    // The status reader refuses every body that carries the key (and so every accepted submit result), whatever its value.
    if (s.picks.replayed !== "absent") expect(readCommandStatusV1(s.value)).toBeNull();
    // And it reads the body once the key is gone, exactly when the submit reader would: the two readers share one status.
    const { replayed: _bit, ...asStatus } = s.value;
    if (read !== null) expect(cmdOf(asStatus)).toEqual(read.status);
  });
});

/* ═════════════════════════ L2 ═════════════════════════ */
describe("L2 · scale", () => {
  it("reads a pending-control status at its widest (128 blockers of 512 bytes, 512-byte ids, 128 character amounts) inside the budget", () => {
    const body = clone(WAITING);
    const wide = "w".repeat(512);
    body.currency = "c".repeat(512);
    body.original_recall_id = wide;
    body.business.blockers = Array.from({ length: 128 }, (_, i) => `${i}`.padEnd(512, "b"));
    body.business.receipt.control_receipt_id = wide;
    body.business.receipt.latest_receipt_id = wide;
    body.business.receipt.source_event_id = wide;
    const big = `${"1".repeat(100)}.${"1".repeat(27)}`;
    body.business.amounts = { requested: big, applied: big, pending: "0", cancelled: "0", rejected: "0" };
    body.business.state = "APPLIED";
    body.business.business_applied = true;
    body.next_action = "REVIEW_RECEIPT";
    expect(pendViolations(body)).toEqual([]);
    const { value, ms } = timed(() => pendOf(body));
    console.info(`commandCurrency pending at its widest (${(serializedBytes(body) / 1024).toFixed(1)} KiB): ${ms.toFixed(1)} ms (budget ${BUDGET_WIDEST_MS} ms)`);
    expect(value!.business.blockers).toHaveLength(128);
    expect(ms).toBeLessThan(BUDGET_WIDEST_MS);
    expect(serializedBytes(body)).toBeLessThan(MIB);
  });

  it("BE-P13: 2,000 reads of the submit result inside the budget", () => {
    const t = timed(() => { for (let n = 0; n < 2000; n += 1) readCommandSubmitResultV1(n % 2 === 0 ? SUBMIT_FIRST : SUBMIT_REPLAYED); });
    console.info(`commandCurrency 2,000 submit-result reads: ${t.ms.toFixed(0)} ms (budget ${BUDGET_2000_READS_MS} ms)`);
    expect(t.ms).toBeLessThan(BUDGET_2000_READS_MS);
  });

  it("2,000 reads of each status inside the budget", () => {
    const capital = timed(() => { for (let n = 0; n < 2000; n += 1) readCommandStatusV1(n % 2 === 0 ? PARTIAL : SERVED); });
    const pending = timed(() => { for (let n = 0; n < 2000; n += 1) readPendingControlStatusV1(n % 2 === 0 ? WAITING : P.applied); });
    console.info(`commandCurrency 2,000 reads: capital ${capital.ms.toFixed(0)} ms, pending ${pending.ms.toFixed(0)} ms (budget ${BUDGET_2000_READS_MS} ms each)`);
    expect(capital.ms).toBeLessThan(BUDGET_2000_READS_MS);
    expect(pending.ms).toBeLessThan(BUDGET_2000_READS_MS);
  });

  it("a 70,000 character currency, id, amount or counter is refused fast, not scanned", () => {
    const text = "a".repeat(70_000);
    const digits = "9".repeat(70_000);
    const edits: [Draft, (b: Draft) => void][] = [
      [SERVED, (b) => { b.currency = text; }], [SERVED, (b) => { b.profile_ref = text; }], [SERVED, (b) => { b.business.revision = digits; }],
      [PARTIAL, (b) => { b.business.amounts.requested = digits; }], [PARTIAL, (b) => { b.business.amounts.requested = `1.${digits}`; }],
      [WAITING, (b) => { b.business.blockers = [text]; }], [WAITING, (b) => { b.business.receipt.versions.budget = digits; }],
      [WAITING, (b) => { b.business.receipt.control_receipt_id = text; }],
    ];
    for (const [base, edit] of edits) {
      const body = clone(base);
      edit(body);
      const { value, ms } = timed(() => (body.schema_version === COMMAND_STATUS_SCHEMA ? readCommandStatusV1(body) : readPendingControlStatusV1(body)));
      expect(value).toBeNull();
      expect(ms).toBeLessThan(50);
    }
  });
});

/* ═════════════════════════ L3 ═════════════════════════ */
interface Case { name: string; category: string; value: unknown; probe: string | null }
const enumsOf = (base: Draft, path: readonly (string | number)[], valid: readonly unknown[]): Case[] =>
  enumCases(base, path, valid.map(String)).filter((c) => !valid.includes(getPath(c.value, path)));
const amountPaths = (prefix: readonly (string | number)[]) => AMOUNT_KEYS.map((key) => [...prefix, key] as const);

const CMD_ENUMS: Case[] = [
  ...enumsOf(PARTIAL, ["operation"], [...COMMAND_OPERATIONS]),
  ...enumsOf(PARTIAL, ["resource", "kind"], [...COMMAND_RESOURCE_KINDS]),
  ...enumsOf(PARTIAL, ["environment"], [...COMMAND_ENVIRONMENTS]),
  ...enumsOf(PARTIAL, ["delivery"], [...COMMAND_DELIVERIES]),
  ...enumsOf(PARTIAL, ["business", "state"], [...COMMAND_BUSINESS_STATES]),
  ...enumsOf(PARTIAL, ["projection"], [...COMMAND_PROJECTIONS]),
  ...enumsOf(PARTIAL, ["venue"], [...COMMAND_VENUES]),
  ...enumsOf(PARTIAL, ["next_action"], [...COMMAND_NEXT_ACTIONS]),
  ...enumsOf(PARTIAL, ["authority"], [...STATUS_AUTHORITIES]),
  // BE-P13: the typed absences. PARTIAL's own members are NOT_APPLICABLE both; the enum fixes the state, the reason is a constant of its member.
  ...enumsOf(PARTIAL, ["source_rejection", "state"], ["NOT_APPLICABLE", "NOT_PUBLISHED"]),
  ...enumsOf(PARTIAL, ["venue_fill", "state"], ["NOT_APPLICABLE", "NOT_PUBLISHED"]),
  ...enumsOf(PARTIAL, ["source_rejection", "reason"], [null]),
  ...enumsOf(PARTIAL, ["venue_fill", "reason"], [null]),
  ...enumsOf(PARTIAL, ["venue_fill", "quantities"], [null]),
];
const CMD_PATHS: (readonly (string | number)[])[] = [
  ...["schema_version", "command_id", "operation", "resource", "environment", "profile_ref", "delivery", "business", "projection", "venue", "next_action", "created_at_ms", "updated_at_ms", "authority", "currency", "source_rejection", "venue_fill"].map((k) => [k] as const),
  ["resource", "kind"], ["resource", "id"],
  ["source_rejection", "state"], ["source_rejection", "reason"], ["venue_fill", "state"], ["venue_fill", "reason"], ["venue_fill", "quantities"],
  ...["state", "receipt_ref", "source_event_ref", "revision", "amounts"].map((k) => ["business", k] as const),
  ...amountPaths(["business", "amounts"]),
];
const CMD_NEG: Case[] = [
  ...CMD_ENUMS,
  ...requiredCases(PARTIAL, CMD_PATHS),
  ...AMOUNT_KEYS.flatMap((key) => decimalCases(PARTIAL, ["business", "amounts", key]).filter((c) => c.category !== "huge-string")),
  ...integerCases(PARTIAL, ["created_at_ms"]),
  ...integerCases(PARTIAL, ["updated_at_ms"]),
  ...stringCases(PARTIAL, ["command_id"]),
  ...stringCases(PARTIAL, ["profile_ref"]),
  ...stringCases(PARTIAL, ["resource", "id"]),
  ...stringCases(PARTIAL, ["currency"]),
  ...stringCases(PARTIAL, ["business", "revision"]),
  ...schemaVersionCases(PARTIAL, ["schema_version"], COMMAND_STATUS_SCHEMA, [PENDING_CONTROL_STATUS_SCHEMA, "portal.execution.command-status.v2", "portal.execution.command-preview.v1"]),
  ...pollutionCases(PARTIAL, [[], ["resource"], ["business"], ["business", "amounts"], ["source_rejection"], ["venue_fill"]]),
];
/** `CommandSubmitResult` negatives: the marker itself plus the status fields it shares (a submit result is a status, so those cases are the same). */
const SUBMIT_NEG: Case[] = [
  ...enumsOf(SUBMIT_FIRST, ["replayed"], [false, true]),
  ...requiredCases(SUBMIT_FIRST, [["replayed"], ["source_rejection"], ["venue_fill"], ["currency"], ["command_id"], ["business"], ["business", "state"]]),
  ...enumsOf(SUBMIT_FIRST, ["operation"], [...COMMAND_OPERATIONS]),
  ...enumsOf(SUBMIT_FIRST, ["delivery"], [...COMMAND_DELIVERIES]),
  ...enumsOf(SUBMIT_FIRST, ["source_rejection", "state"], ["NOT_APPLICABLE", "NOT_PUBLISHED"]),
  ...enumsOf(SUBMIT_FIRST, ["venue_fill", "state"], ["NOT_APPLICABLE", "NOT_PUBLISHED"]),
  ...stringCases(SUBMIT_FIRST, ["command_id"]), ...stringCases(SUBMIT_FIRST, ["currency"]),
  ...schemaVersionCases(SUBMIT_FIRST, ["schema_version"], COMMAND_STATUS_SCHEMA, [PENDING_CONTROL_STATUS_SCHEMA, "portal.execution.command-status.v2"]),
  ...pollutionCases(SUBMIT_FIRST, [[], ["venue_fill"]]),
];

const PEND_ENUMS: Case[] = [
  ...enumsOf(WAITING, ["operation"], [...PENDING_OPERATIONS]),
  ...enumsOf(WAITING, ["resource", "kind"], [...PENDING_RESOURCE_KINDS]),
  ...enumsOf(WAITING, ["environment"], [...COMMAND_ENVIRONMENTS]),
  ...enumsOf(WAITING, ["delivery"], [...COMMAND_DELIVERIES]),
  ...enumsOf(WAITING, ["business", "state"], [...PENDING_BUSINESS_STATES]),
  ...enumsOf(WAITING, ["next_action"], [...PENDING_NEXT_ACTIONS]),
  ...enumsOf(WAITING, ["authority"], [...STATUS_AUTHORITIES]),
  ...enumsOf(WAITING, ["family"], ["PENDING_RECALL_CONTROL"]),
  ...enumsOf(WAITING, ["projection"], ["UNKNOWN"]),
  ...enumsOf(WAITING, ["venue"], ["NOT_APPLICABLE"]),
  ...enumsOf(WAITING, ["economic_cash_changed"], [false]),
  ...enumsOf(WAITING, ["physical_transfer_performed"], [false]),
  ...enumsOf(WAITING, ["business", "receipt", "latest_operation_availability"], ["AVAILABLE", "NOT_PUBLISHED"]),
  ...enumsOf(WAITING, ["business", "receipt", "latest_operation"], [...PENDING_SOURCE_OPERATIONS, null]),
];
const PEND_PATHS: (readonly (string | number)[])[] = [
  ...["schema_version", "family", "command_id", "operation", "original_recall_id", "resource", "environment", "profile_ref", "delivery", "business", "economic_cash_changed", "physical_transfer_performed", "projection", "venue", "next_action", "authority", "created_at_ms", "updated_at_ms", "currency", "recipient_account_id"].map((k) => [k] as const),
  ["resource", "kind"], ["resource", "id"],
  ...["state", "business_applied", "amounts", "receipt", "blockers"].map((k) => ["business", k] as const),
  ...amountPaths(["business", "amounts"]),
  ...["control_receipt_id", "latest_receipt_id", "latest_operation", "latest_operation_availability", "latest_operation_reason", "source_event_id", "original_payload_sha256", "versions"].map((k) => ["business", "receipt", k] as const),
  ...PENDING_VERSION_KEYS.map((k) => ["business", "receipt", "versions", k] as const),
];
const DEPLOYED: Draft = P.deployment_cancelled;
/** FE-063 cross-field rule, both directions, expressed as mutated bodies (the published schema is the oracle for each). */
function recipientKindCases(): Case[] {
  const portfolioWithAccount = clone(WAITING);
  portfolioWithAccount.recipient_account_id = "TEST_ONLY:account";
  const deploymentWithout = clone(DEPLOYED);
  deploymentWithout.recipient_account_id = null;
  const deploymentOnWaiting = clone(WAITING);
  deploymentOnWaiting.resource.kind = "DEPLOYMENT";
  const portfolioOnDeployed = clone(DEPLOYED);
  portfolioOnDeployed.resource.kind = "PORTFOLIO";
  return [
    { name: "PORTFOLIO with a recipient account", category: "cross-field", value: portfolioWithAccount, probe: "TEST_ONLY:account" },
    { name: "DEPLOYMENT with a null recipient account", category: "cross-field", value: deploymentWithout, probe: null },
    { name: "kind flipped to DEPLOYMENT, recipient still null", category: "cross-field", value: deploymentOnWaiting, probe: null },
    { name: "kind flipped to PORTFOLIO, recipient still set", category: "cross-field", value: portfolioOnDeployed, probe: "TEST_ONLY:account" },
  ];
}

const PEND_NEG: Case[] = [
  ...PEND_ENUMS,
  ...requiredCases(WAITING, PEND_PATHS),
  ...AMOUNT_KEYS.flatMap((key) => decimalCases(WAITING, ["business", "amounts", key]).filter((c) => c.category !== "huge-string")),
  ...PENDING_VERSION_KEYS.flatMap((key) => decimalCases(WAITING, ["business", "receipt", "versions", key]).filter((c) => c.category !== "huge-string")),
  ...integerCases(WAITING, ["created_at_ms"]),
  ...integerCases(WAITING, ["updated_at_ms"]),
  ...stringCases(WAITING, ["command_id"]),
  ...stringCases(WAITING, ["original_recall_id"]),
  ...stringCases(WAITING, ["profile_ref"]),
  ...stringCases(WAITING, ["currency"]),
  ...stringCases(DEPLOYED, ["recipient_account_id"]),
  ...requiredCases(DEPLOYED, [["recipient_account_id"]]),
  ...recipientKindCases(),
  ...stringCases(WAITING, ["business", "receipt", "control_receipt_id"]),
  ...stringCases(WAITING, ["business", "receipt", "original_payload_sha256"]),
  ...arrayCases(WAITING, ["business", "blockers"]),
  ...schemaVersionCases(WAITING, ["schema_version"], PENDING_CONTROL_STATUS_SCHEMA, [COMMAND_STATUS_SCHEMA, "portal.execution.pending-recall-status.v2", "portal.execution.pending-recall-preview.v1"]),
  ...pollutionCases(WAITING, [[], ["resource"], ["business"], ["business", "amounts"], ["business", "receipt"], ["business", "receipt", "versions"]]),
];

function runNegatives(label: string, version: string, cases: Case[], read: (v: unknown) => unknown, violations: (v: unknown) => string[], minInvalid: number) {
  describe(`L3 · negative · ${label}`, () => {
    it("reports the case counts", () => {
      const by = new Map<string, number>();
      for (const c of cases) by.set(c.category, (by.get(c.category) ?? 0) + 1);
      console.info(`commandCurrency L3 ${label}: ${cases.length} cases (${[...by.entries()].map(([k, v]) => `${k} ${v}`).join(", ")})`);
      expect(cases.length).toBeGreaterThan(minInvalid);
    });

    it.each(cases.map((c) => [c.name, c] as const))("%s", (_name, c) => {
      expect(() => read(c.value)).not.toThrow();
      const answer = read(c.value) as { kind: string } | null;
      expect(leaked(answer, c.probe)).toBe(false);
      expect(prototypeIsClean()).toBe(true);
      const accepted = answer !== null && answer.kind !== "unsupported_shape";
      // The only non-null refusal is the typed unsupported_shape, for a body that is not this schema_version.
      if (answer !== null && !accepted) expect(getPath(c.value, ["schema_version"])).not.toBe(version);
      if (accepted) expect(getPath(c.value, ["schema_version"])).toBe(version);
      // Accepted though the schema refuses it: never.
      if (accepted && c.category !== "prototype-pollution") expect(violations(c.value), `accepted though schema-invalid: ${c.name}`).toEqual([]);
    });

    it("an unknown word is never a state: no enum case yields a read", () => {
      for (const c of cases.filter((x) => x.category === "unknown-enum")) {
        const answer = read(c.value) as { kind: string } | null;
        expect(answer === null || answer.kind === "unsupported_shape", c.name).toBe(true);
      }
    });

    it.each(rootCases().map((c) => [c.name, c] as const))("%s reads as nothing (malformed, or a typed unsupported_shape)", (_name, c) => {
      expect(() => read(c.value)).not.toThrow();
      const answer = read(c.value);
      if (answer !== null) expect(answer).toEqual({ kind: "unsupported_shape", schemaVersion: null });
    });

    it("prints how much looser or stricter the reader is than the schema, and the reader is never looser", () => {
      let invalid = 0;
      let looser = 0;
      let stricter = 0;
      for (const c of cases) {
        if (c.category === "prototype-pollution" || c.category === "schema-swapped") continue;
        const bad = violations(c.value).length > 0;
        const answer = read(c.value) as { kind: string } | null;
        const accepted = answer !== null && answer.kind !== "unsupported_shape";
        if (bad) invalid += 1;
        if (bad && accepted) looser += 1;
        if (!bad && !accepted) stricter += 1;
      }
      console.info(`commandCurrency L3 ${label} gap: reader accepts ${looser} of ${invalid} schema-invalid payloads; refuses ${stricter} schema-valid ones`);
      expect(invalid).toBeGreaterThan(minInvalid / 2);
      expect(looser).toBe(0);
    });
  });
}

runNegatives("capital CommandStatus", COMMAND_STATUS_SCHEMA, CMD_NEG, readCommandStatusV1, cmdViolations, 500);
runNegatives("CommandSubmitResult (BE-P13)", COMMAND_STATUS_SCHEMA, SUBMIT_NEG, readCommandSubmitResultV1, submitViolations, 100);
runNegatives("PendingControlStatus", PENDING_CONTROL_STATUS_SCHEMA, PEND_NEG, readPendingControlStatusV1, pendViolations, 700);

/* ═════════════ mutation control: the looser-than-schema counter must be able to bite ═════════════ */
describe("mutation control · the looser-than-schema counter is not vacuous", () => {
  /** A deliberately loose status reader: it checks the schema_version and the two BE-P13 keys' presence, and nothing about their members. */
  const looseStatus = (v: unknown) => {
    const r = v as Draft;
    return r?.schema_version === COMMAND_STATUS_SCHEMA && r?.source_rejection !== undefined && r?.venue_fill !== undefined ? { kind: "command_status" } : null;
  };
  const looserThanSchema = (read: (v: unknown) => unknown, cases: Case[], violations: (v: unknown) => string[]) =>
    cases.filter((c) => {
      const answer = read(c.value) as { kind?: string } | null;
      return c.category !== "prototype-pollution" && c.category !== "schema-swapped" && answer !== null && answer.kind !== "unsupported_shape" && violations(c.value).length > 0;
    }).length;

  it("a loose reader accepts schema-invalid statuses (counter > 0), the real readers accept none", () => {
    expect(looserThanSchema(looseStatus, CMD_NEG, cmdViolations)).toBeGreaterThan(50);
    expect(looserThanSchema(readCommandStatusV1, CMD_NEG, cmdViolations)).toBe(0);
    expect(looserThanSchema(readCommandSubmitResultV1, SUBMIT_NEG, submitViolations)).toBe(0);
  });

  it("a reader that forgot the 'no published branch' rule would accept bodies the schema refuses: PUBLISHED is one of them", () => {
    const published = clone(SERVED);
    published.venue_fill = { state: "PUBLISHED", reason: null, quantities: { filled: "1" } };
    expect(cmdViolations(published).length).toBeGreaterThan(0);
    expect(looseStatus(published)).not.toBeNull();
    expect(readCommandStatusV1(published)).toBeNull();
  });
});
