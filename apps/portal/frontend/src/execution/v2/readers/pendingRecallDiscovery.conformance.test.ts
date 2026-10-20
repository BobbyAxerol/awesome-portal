/**
 * Reader conformance for `pendingRecallDiscovery.ts` (FE-062, Rules 9.8.3).
 *
 * Oracle: `execution-pending-control.openapi.json#/components/schemas/PendingRecallDiscovery` read through the testkit checker,
 * and the three canonical bodies (`discovery_open`, `discovery_deployment`, `discovery_empty`) of
 * `execution-pending-control-currency.synthetic.valid.json`, digest-checked so a test cannot edit what it reads.
 *
 * L0  the fixtures are schema-valid, read, and are not changed by reading;
 * L1  what the schema cannot say but the server enforces: amount partition, WAITING shape, DEPLOYMENT <=> recipient,
 *     unique recall id, at most 100, UNKNOWN has no economics;
 * L3  generated negatives: reader is never looser than the schema, never throws, never leaks.
 * Lane: FIXTURE_LAB (synthetic TEST_ONLY bodies; nothing here is a runtime read).
 */
import { afterAll, describe, expect, it } from "vitest";

import { canonicalDigest, loadCanonical, schemaEnum } from "../testkit/loadCanonical";
import { getPath, type Draft } from "../testkit/matrix";
import {
  arrayCases, decimalCases, enumCases, integerCases, leaked, pollutionCases, prototypeIsClean, requiredCases, rootCases, schemaVersionCases, stringCases,
} from "../testkit/negative";
import { validateAgainst } from "../testkit/schema";
import { COMMAND_ENVIRONMENTS, PENDING_OPERATIONS, PENDING_RESOURCE_KINDS, PENDING_VERSION_KEYS } from "./commandCurrency";
import {
  DISCOVERY_STATES, MAX_DISCOVERED_RECALLS, PENDING_RECALL_DISCOVERY_SCHEMA, pendingRecallDiscoveryAnswers, pendingRecallDiscoveryUrl,
  readPendingRecallDiscoveryV1, type PendingRecallDiscovery,
} from "./pendingRecallDiscovery";

const FILE = "execution-pending-control-currency.synthetic";
const digestBefore = canonicalDigest(FILE);
afterAll(() => {
  expect(canonicalDigest(FILE)).toBe(digestBefore);
});

const OA = "../openapi/execution-pending-control.openapi.json";
const PTR = "/components/schemas/PendingRecallDiscovery";
const violations = (value: unknown) => validateAgainst(OA, PTR, value);
const clone = <T,>(value: T): T => structuredClone(value);
const file = loadCanonical<Record<string, Draft>>(FILE);
const OPEN: Draft = file.discovery_open;
const DEPLOYMENT: Draft = file.discovery_deployment;
const EMPTY: Draft = file.discovery_empty;

function discoveryOf(raw: unknown): PendingRecallDiscovery | null {
  const read = readPendingRecallDiscoveryV1(raw);
  return read !== null && read.kind === "pending_recall_discovery" ? read.discovery : null;
}

describe("L0 · canonical, verbatim", () => {
  it("the three discovery bodies are schema-valid and read", () => {
    for (const [name, body] of Object.entries({ OPEN, DEPLOYMENT, EMPTY })) {
      expect(violations(body), name).toEqual([]);
      expect(discoveryOf(body), name).not.toBeNull();
    }
  });

  it("OPEN: a WAITING recall with the five exact counters as published, and an UNKNOWN one with null economics", () => {
    const d = discoveryOf(OPEN)!;
    expect(d.items).toHaveLength(2);
    const [waiting, unknown] = d.items;
    expect(waiting).toMatchObject({
      state: "WAITING_ENCUMBRANCE", originalRecallId: "TEST_ONLY:original-recall", currency: "USDT", recipientAccountId: null,
      latestReceiptId: "TEST_ONLY:pm:control-receipt:1", lastKnownCommandId: "ecm_00000000000000000000000000000031", unresolvedCommandId: null,
      lastOperation: "APPLY_PENDING",
    });
    expect(waiting!.versions).toEqual({ budget: "9007199254740993", source: "11", parent: "12", book: "13", command: "14" });
    expect(waiting!.amounts!.pending.fullText).toBe("75 USDT");
    expect(waiting!.amounts!.applied.fullText).toBe("25 USDT");
    // UNKNOWN is a typed absence: not zero, not an empty object.
    expect(unknown).toMatchObject({
      state: "UNKNOWN", amounts: null, versions: null, latestReceiptId: null, lastKnownCommandId: null, unresolvedCommandId: "ecm_00000000000000000000000000000032",
    });
  });

  it("the constants a screen must not turn into a census: coverage and untracked_recalls", () => {
    for (const body of [OPEN, DEPLOYMENT, EMPTY]) {
      const d = discoveryOf(body)!;
      expect(d.coverage).toBe("PORTAL_CONTROLLED_RECALLS_ONLY");
      expect(d.untrackedRecalls).toEqual({ availability: "NOT_PUBLISHED", reasonCode: "RECALL_REMAINDER_SOURCE_READ_NOT_QUALIFIED" });
    }
    expect(discoveryOf(EMPTY)!.items).toEqual([]);
  });

  it("DEPLOYMENT: the owning account is read verbatim; PORTFOLIO carries none", () => {
    expect(discoveryOf(DEPLOYMENT)!.items[0]!.recipientAccountId).toBe("TEST_ONLY:account");
    expect(discoveryOf(OPEN)!.items.every((item) => item.recipientAccountId === null)).toBe(true);
  });

  it("the closed words the reader holds are the schema's, word for word", () => {
    expect([...DISCOVERY_STATES]).toEqual([...schemaEnum(OA, "/components/schemas/PendingRecallDiscoveryItem/properties/state")]);
    expect([...PENDING_OPERATIONS]).toEqual([...schemaEnum(OA, "/components/schemas/PendingRecallDiscoveryItem/properties/last_operation")]);
    expect([...PENDING_RESOURCE_KINDS]).toEqual([...schemaEnum(OA, "/components/schemas/PendingControlResource/properties/kind")]);
    expect([...COMMAND_ENVIRONMENTS]).toEqual([...schemaEnum(OA, `${PTR}/properties/environment`)]);
    expect(PENDING_RECALL_DISCOVERY_SCHEMA).toBe("portal.execution.pending-recall-discovery.v1");
    expect(MAX_DISCOVERED_RECALLS).toBe(100);
  });

  it("a status body is another schema: typed unsupported_shape, never read as a discovery", () => {
    const status = file.statuses.waiting;
    expect(readPendingRecallDiscoveryV1(status)).toEqual({ kind: "unsupported_shape", schemaVersion: "portal.execution.pending-recall-status.v1" });
  });
});

describe("L1 · what the schema cannot say and the server enforces", () => {
  const edit = (base: Draft, change: (b: Draft) => void): Draft => {
    const copy = clone(base);
    change(copy);
    return copy;
  };

  it.each<[string, Draft, (b: Draft) => void]>([
    ["a duplicated original_recall_id", OPEN, (b) => { b.items[1].original_recall_id = b.items[0].original_recall_id; }],
    ["101 items", EMPTY, (b) => {
      b.items = Array.from({ length: 101 }, (_, n) => ({ ...clone(OPEN.items[0]), original_recall_id: `TEST_ONLY:r${n}` }));
    }],
    ["amounts that do not add up", OPEN, (b) => { b.items[0].amounts.pending = "76"; }],
    ["WAITING with nothing pending", OPEN, (b) => { b.items[0].amounts = { requested: "100", applied: "100", pending: "0", cancelled: "0", rejected: "0" }; }],
    ["WAITING with a cancelled part", OPEN, (b) => { b.items[0].amounts = { requested: "100", applied: "25", pending: "50", cancelled: "25", rejected: "0" }; }],
    ["UNKNOWN carrying zero amounts instead of null", OPEN, (b) => { b.items[1].amounts = { requested: "0", applied: "0", pending: "0", cancelled: "0", rejected: "0" }; }],
    ["UNKNOWN carrying a receipt id", OPEN, (b) => { b.items[1].latest_receipt_id = "TEST_ONLY:r"; }],
    ["UNKNOWN without its unresolved command", OPEN, (b) => { b.items[1].unresolved_command_id = null; }],
    ["WAITING without its last known command", OPEN, (b) => { b.items[0].last_known_command_id = null; }],
    ["a PORTFOLIO recall with an owning account", OPEN, (b) => { b.items[0].recipient_account_id = "TEST_ONLY:account"; }],
    ["a DEPLOYMENT recall without its owning account", DEPLOYMENT, (b) => { b.items[0].recipient_account_id = null; }],
    ["coverage widened to a census", OPEN, (b) => { b.coverage = "ALL_RECALLS"; }],
    ["untracked_recalls claimed available", OPEN, (b) => { b.untracked_recalls = { availability: "AVAILABLE", reason_code: null }; }],
    ["untracked_recalls dropped", OPEN, (b) => { delete b.untracked_recalls; }],
    ["a terminal state listed as open", OPEN, (b) => { b.items[0].state = "CANCELLED"; }],
    ["truncated as text", OPEN, (b) => { b.truncated = "false"; }],
    ["an int64 counter above int64", OPEN, (b) => { b.items[0].versions.budget = "9223372036854775808"; }],
  ])("%s voids the read", (_name, base, change) => {
    expect(readPendingRecallDiscoveryV1(edit(base, change))).toBeNull();
  });

  it("the int64 counters stay exact strings above 2^53 and are never Numbers", () => {
    const waiting = discoveryOf(OPEN)!.items[0]!;
    for (const key of PENDING_VERSION_KEYS) expect(typeof waiting.versions![key]).toBe("string");
    expect(waiting.versions!.budget).toBe("9007199254740993");
  });

  it("an empty list is 'none the Portal controlled', and the constants still travel with it", () => {
    const d = discoveryOf(EMPTY)!;
    expect(d.items).toHaveLength(0);
    expect(d.truncated).toBe(false);
    expect(d.untrackedRecalls.availability).toBe("NOT_PUBLISHED");
  });

  it("truncated is read as published, not computed", () => {
    expect(discoveryOf(edit(OPEN, (b) => { b.truncated = true; }))!.truncated).toBe(true);
  });

  it("the request URL has exactly the four keys, or is refused", () => {
    expect(pendingRecallDiscoveryUrl({ workspaceId: "ws 1", resourceKind: "DEPLOYMENT", resourceId: "a/b", environment: "paper" }))
      .toBe("/api/v1/execution/pending-recalls?workspace_id=ws%201&resource_kind=DEPLOYMENT&resource_id=a%2Fb&environment=paper");
    expect(pendingRecallDiscoveryUrl({ workspaceId: "", resourceKind: "DEPLOYMENT", resourceId: "x", environment: "paper" })).toBeNull();
    expect(pendingRecallDiscoveryUrl({ workspaceId: "w", resourceKind: "ROOT" as never, resourceId: "x", environment: "paper" })).toBeNull();
    expect(pendingRecallDiscoveryUrl({ workspaceId: "w", resourceKind: "PORTFOLIO", resourceId: "x", environment: "prod" as never })).toBeNull();
  });

  it("a body answers only the question asked: another resource or environment is not an answer", () => {
    const d = discoveryOf(OPEN)!;
    const query = { workspaceId: "w", resourceKind: "PORTFOLIO", resourceId: "TEST_ONLY:portfolio", environment: "paper" } as const;
    expect(pendingRecallDiscoveryAnswers(d, query)).toBe(true);
    expect(pendingRecallDiscoveryAnswers(d, { ...query, resourceId: "other" })).toBe(false);
    expect(pendingRecallDiscoveryAnswers(d, { ...query, resourceKind: "DEPLOYMENT" })).toBe(false);
    expect(pendingRecallDiscoveryAnswers(d, { ...query, environment: "live" })).toBe(false);
  });
});

/* ═════════════════════ L3 · generated negatives ═════════════════════ */
interface Case { name: string; category: string; value: unknown; probe: string | null }
const ITEM_PATHS = ["original_recall_id", "currency", "recipient_account_id", "state", "amounts", "versions", "latest_receipt_id", "last_known_command_id", "unresolved_command_id", "last_operation", "updated_at_ms"];
const TOP_PATHS = ["schema_version", "family", "coverage", "untracked_recalls", "resource", "environment", "items", "truncated", "observed_at_ms"];
const enumsOf = (base: Draft, path: readonly (string | number)[], valid: readonly unknown[]): Case[] =>
  enumCases(base, path, valid.map(String)).filter((c) => !valid.includes(getPath(c.value, path)));

const NEG: Case[] = [
  ...requiredCases(OPEN, TOP_PATHS.map((k) => [k] as const)),
  ...requiredCases(OPEN, ITEM_PATHS.map((k) => ["items", 0, k] as const)),
  ...requiredCases(OPEN, ITEM_PATHS.map((k) => ["items", 1, k] as const)),
  ...requiredCases(OPEN, [["untracked_recalls", "availability"], ["untracked_recalls", "reason_code"], ["resource", "kind"], ["resource", "id"]]),
  ...requiredCases(OPEN, PENDING_VERSION_KEYS.map((k) => ["items", 0, "versions", k] as const)),
  ...enumsOf(OPEN, ["environment"], [...COMMAND_ENVIRONMENTS]),
  ...enumsOf(OPEN, ["resource", "kind"], [...PENDING_RESOURCE_KINDS]),
  ...enumsOf(OPEN, ["family"], ["PENDING_RECALL_CONTROL"]),
  ...enumsOf(OPEN, ["coverage"], ["PORTAL_CONTROLLED_RECALLS_ONLY"]),
  ...enumsOf(OPEN, ["untracked_recalls", "availability"], ["NOT_PUBLISHED"]),
  ...enumsOf(OPEN, ["untracked_recalls", "reason_code"], ["RECALL_REMAINDER_SOURCE_READ_NOT_QUALIFIED"]),
  ...enumsOf(OPEN, ["items", 0, "state"], [...DISCOVERY_STATES]),
  ...enumsOf(OPEN, ["items", 0, "last_operation"], [...PENDING_OPERATIONS]),
  ...(["requested", "applied", "pending", "cancelled", "rejected"] as const).flatMap((key) => decimalCases(OPEN, ["items", 0, "amounts", key]).filter((c) => c.category !== "huge-string")),
  ...PENDING_VERSION_KEYS.flatMap((key) => decimalCases(OPEN, ["items", 0, "versions", key]).filter((c) => c.category !== "huge-string")),
  ...integerCases(OPEN, ["observed_at_ms"]),
  ...integerCases(OPEN, ["items", 0, "updated_at_ms"]),
  ...stringCases(OPEN, ["items", 0, "original_recall_id"]),
  ...stringCases(OPEN, ["items", 0, "currency"]),
  ...stringCases(OPEN, ["items", 0, "latest_receipt_id"]),
  ...stringCases(OPEN, ["items", 0, "last_known_command_id"]),
  ...stringCases(DEPLOYMENT, ["items", 0, "recipient_account_id"]),
  ...stringCases(OPEN, ["resource", "id"]),
  ...arrayCases(OPEN, ["items"]),
  ...schemaVersionCases(OPEN, ["schema_version"], PENDING_RECALL_DISCOVERY_SCHEMA, ["portal.execution.pending-recall-status.v1", "portal.execution.pending-recall-discovery.v2"]),
  ...pollutionCases(OPEN, [[], ["resource"], ["untracked_recalls"], ["items", 0], ["items", 0, "amounts"], ["items", 0, "versions"]]),
];

describe("L3 · negative · PendingRecallDiscovery", () => {
  it("has a substantial case count", () => {
    console.info(`pendingRecallDiscovery L3: ${NEG.length} cases`);
    expect(NEG.length).toBeGreaterThan(300);
  });

  it.each(NEG.map((c) => [c.name, c] as const))("%s", (_name, c) => {
    expect(() => readPendingRecallDiscoveryV1(c.value)).not.toThrow();
    const answer = readPendingRecallDiscoveryV1(c.value) as { kind: string } | null;
    expect(leaked(answer, c.probe)).toBe(false);
    expect(prototypeIsClean()).toBe(true);
    const accepted = answer !== null && answer.kind !== "unsupported_shape";
    if (accepted) expect(getPath(c.value, ["schema_version"])).toBe(PENDING_RECALL_DISCOVERY_SCHEMA);
    // Accepted though the schema refuses it: never.
    if (accepted && c.category !== "prototype-pollution") expect(violations(c.value), `accepted though schema-invalid: ${c.name}`).toEqual([]);
  });

  it("an unknown word is never a state: no enum case yields a read", () => {
    for (const c of NEG.filter((x) => x.category === "unknown-enum")) {
      const answer = readPendingRecallDiscoveryV1(c.value) as { kind: string } | null;
      expect(answer === null || answer.kind === "unsupported_shape", c.name).toBe(true);
    }
  });

  it.each(rootCases().map((c) => [c.name, c] as const))("%s reads as nothing", (_name, c) => {
    expect(() => readPendingRecallDiscoveryV1(c.value)).not.toThrow();
    const answer = readPendingRecallDiscoveryV1(c.value);
    if (answer !== null) expect(answer).toEqual({ kind: "unsupported_shape", schemaVersion: null });
  });

  it("the reader is never looser than the schema", () => {
    let looser = 0;
    for (const c of NEG) {
      if (c.category === "prototype-pollution" || c.category === "schema-swapped") continue;
      const answer = readPendingRecallDiscoveryV1(c.value) as { kind: string } | null;
      if (violations(c.value).length > 0 && answer !== null && answer.kind !== "unsupported_shape") looser += 1;
    }
    expect(looser).toBe(0);
  });
});
