/**
 * Reader conformance for `commandCatalogue.ts` (Rules 9.8.3, tiers L0 to L3), UXM-09 fixture lane (FIXTURE_LAB).
 *
 * Published contract (the testkit checker reads it, so every oracle below is the published schema itself):
 *   `execution-operations.v1.schema.json#/$defs/CommandCatalogue` (+ `CommandCatalogueEntry`, `CommandCatalogueScope`, `RiskTier`)
 *   `execution-operations.openapi.json` `/api/v1/execution/commands/catalog` (200 -> that schema)
 *
 * L0  the canonical file, verbatim and digest-checked; it passes the schema; it reads; its 64 keys are the 64 `F0_COMMAND_KEYS`; every closed
 *     word the reader holds is the schema's enum, word for word (and equal to the V1 vocabulary the screens render with).
 * L1  state matrices against oracles written from the contract text, not from the reader:
 *       A the constants          B entry flags: reachable x classification x tier x ceremony x method
 *       C route facts            D counts: entries x returned x duplicate x scope filter      E scope: entity x environment x requested tier
 * L2  64 entries (the schema's maximum, since `total_entries` is the constant 64) at their widest strings, every prefix length 0..64, 65 refused,
 *     70,000 character fields refused fast, 1,000 reads inside a budget.
 * L3  generated negatives (enum, required, string, integer, array, schema swap, pollution, bad roots): every case is refused (or is the typed
 *     `unsupported_shape`), never throws, never leaks its probe, nothing the schema refuses is read (reader looser than schema: 0), and the
 *     payloads the reader refuses although the schema accepts are refused ONLY for a named stricter-than-schema group.
 */
import { afterAll, describe, expect, it } from "vitest";

import { BLOCKED_REASONS, CATALOG_GROUPS, CATALOG_RISK_TIERS, ROUTE_STATES } from "../../adminCatalog";
import { canonicalDigest, loadCanonical, loadSchema, schemaEnum } from "../testkit/loadCanonical";
import { ABSENT, cartesian, coverage, describeCoverage, dimensionOf, getPath, setPath, type Dimension, type Draft, type Path } from "../testkit/matrix";
import {
  arrayCases, enumCases, integerCases, leaked, pollutionCases, prototypeIsClean, requiredCases, rootCases, schemaVersionCases, stringCases,
} from "../testkit/negative";
import { MIB, serializedBytes, timed } from "../testkit/scale";
import { validateAgainst } from "../testkit/schema";
import {
  CATALOGUE_BLOCKED_REASONS,
  CATALOGUE_CAPABILITY_REASON,
  CATALOGUE_CLASSIFICATION_STATES,
  CATALOGUE_ENTITY_TYPES,
  CATALOGUE_ENVIRONMENTS,
  CATALOGUE_GROUPS,
  CATALOGUE_HTTP_METHODS,
  CATALOGUE_POLICY_REVISION,
  CATALOGUE_REFUSALS,
  CATALOGUE_ROUTE_STATES,
  CATALOGUE_TOTAL_ENTRIES,
  COMMAND_CATALOGUE_SCHEMA,
  REASON_ROUTE_STATES,
  readCommandCatalogueV2,
  type CatalogueRefusal,
  type CommandCatalogueRead,
} from "./commandCatalogue";
import { F0_COMMAND_KEYS } from "./commandOperation";
import { RISK_TIERS_V2 } from "./operationalQueue";

const BUDGET_1000_READS_MS = 1500;
const BUDGET_WIDEST_MS = 150;

const FILE = "execution-command-catalog";
const digestBefore = canonicalDigest(FILE);
afterAll(() => {
  expect(canonicalDigest(FILE)).toBe(digestBefore);
});

const OPS = "execution-operations.v1";
const violations = (v: unknown) => validateAgainst(OPS, "/$defs/CommandCatalogue", v);
const clone = <T,>(value: T): T => structuredClone(value);
const CATALOGUE: Draft = loadCanonical(FILE);
const ENTRIES: Draft[] = CATALOGUE.entries;

const read = (raw: unknown): CommandCatalogueRead => readCommandCatalogueV2(raw);
const accepted = (raw: unknown): boolean => read(raw).kind === "command_catalogue";
const reasonOf = (raw: unknown): CatalogueRefusal | null => {
  const answer = read(raw);
  return answer.kind === "refused" ? answer.reason : null;
};

/** A catalogue holding exactly `entries` (returned_entries set to match). */
function holding(entries: Draft[], mutate?: (body: Draft) => void): Draft {
  const body = clone(CATALOGUE);
  body.entries = clone(entries);
  body.returned_entries = entries.length;
  mutate?.(body);
  return body;
}
/** The first fixture entry that has a GET route (observed, R0) and the first with a PUT route (R1, observed). */
const GET_ENTRY: Draft = ENTRIES.find((e) => e.http_method === "GET" && e.source_route_state === "OBSERVED")!;
const PUT_ENTRY: Draft = ENTRIES.find((e) => e.http_method === "PUT")!;

/** Schema node by JSON pointer. */
function schemaNode(pointer: string, file = `${OPS}.schema.json`): unknown {
  let node: unknown = loadSchema(file);
  for (const part of pointer.split("/").filter((p) => p.length > 0)) node = (node as Record<string, unknown>)[part];
  return node;
}
const NAMED_STRICTER: ReadonlySet<CatalogueRefusal> = new Set<CatalogueRefusal>([
  // text-hygiene (and its length floor), key-identity, known-key-set, count-identity, scope-filter, reason-state, route-pair, mutation-ceremony, sendable-claim
  "unsafe_text", "out_of_bounds", "key_mismatch", "duplicate_operation", "unknown_command", "count_mismatch", "scope_mismatch",
  "reason_state_mismatch", "route_incoherent", "ceremony_understated", "sendable_claim",
]);

/* ═════════════════════════ L0 ═════════════════════════ */
describe("L0 · canonical, verbatim", () => {
  it("the published catalogue passes its schema through the testkit checker and reads", () => {
    expect(violations(CATALOGUE)).toEqual([]);
    const answer = read(CATALOGUE);
    expect(answer.kind).toBe("command_catalogue");
  });

  it("the read keeps every published fact: 64 entries in published order, each with its own words", () => {
    const answer = read(CATALOGUE);
    if (answer.kind !== "command_catalogue") throw new Error("not read");
    const c = answer.catalogue;
    expect(c).toMatchObject({
      revision: 2, deliveryProfile: "fixture", capabilityState: "DISABLED", capabilityReason: CATALOGUE_CAPABILITY_REASON, totalEntries: 64, returnedEntries: 64,
      source: { tradingSystemCommit: CATALOGUE.source.trading_system_commit, cliMapSha256: CATALOGUE.source.cli_map_sha256, openapiSha256: CATALOGUE.source.openapi_sha256 },
      scope: {
        workspaceId: "fixture-workspace", actorUserId: "fixture-admin", actorRole: "ADMIN", environment: "PAPER", entity: null, requestedRiskTier: null,
        capabilityState: "DISABLED", freshnessState: "UNAVAILABLE", policyRevision: CATALOGUE_POLICY_REVISION,
      },
    });
    expect(c.entries.map((e) => e.key)).toEqual(ENTRIES.map((e) => e.key));
    c.entries.forEach((entry, i) => {
      const raw = ENTRIES[i]!;
      expect(entry).toEqual({
        key: raw.key, command: raw.command, action: raw.action, group: raw.group, riskTier: raw.risk_tier, sourceRiskTier: raw.source_risk_tier,
        ownerReviewRequired: raw.owner_review_required, planRequired: raw.plan_required, applyRequired: raw.apply_required, verifyRequired: raw.verify_required,
        portalReachable: false, routeState: raw.source_route_state, httpMethod: raw.http_method, httpPath: raw.http_path, blockedReason: raw.blocked_reason,
        sourceReference: raw.source_reference, classification: null,
      });
    });
  });

  it("the 64 keys are the 64 published command keys, each once", () => {
    const keys = ENTRIES.map((e) => e.key as string);
    expect(new Set(keys).size).toBe(64);
    expect([...keys].sort()).toEqual([...F0_COMMAND_KEYS]);
    expect(CATALOGUE_TOTAL_ENTRIES).toBe(64);
  });

  it("the closed words the reader holds are the schema's, word for word", () => {
    const entry = "/$defs/CommandCatalogueEntry/properties";
    expect([...CATALOGUE_GROUPS]).toEqual([...schemaEnum(`${OPS}.schema.json`, `${entry}/group`)]);
    expect([...RISK_TIERS_V2]).toEqual([...schemaEnum(`${OPS}.schema.json`, "/$defs/RiskTier")]);
    expect([...CATALOGUE_ROUTE_STATES]).toEqual([...schemaEnum(`${OPS}.schema.json`, `${entry}/source_route_state`)]);
    expect([...CATALOGUE_BLOCKED_REASONS]).toEqual([...schemaEnum(`${OPS}.schema.json`, `${entry}/blocked_reason`)]);
    // http_method also allows null in the schema's enum; the reader's list is the words.
    expect([...CATALOGUE_HTTP_METHODS, null]).toEqual([...schemaEnum(`${OPS}.schema.json`, `${entry}/http_method`)]);
    expect([...CATALOGUE_CLASSIFICATION_STATES]).toEqual([...schemaEnum(`${OPS}.schema.json`, `${entry}/classification/properties/state`)]);
    expect([...CATALOGUE_ENVIRONMENTS]).toEqual([...schemaEnum(`${OPS}.schema.json`, "/$defs/CommandCatalogueScope/properties/environment")]);
    const entityType = schemaNode("/$defs/CommandCatalogueScope/properties/entity/oneOf/1/properties/type") as { enum: string[] };
    expect([...CATALOGUE_ENTITY_TYPES]).toEqual(entityType.enum);
  });

  it("the constants the reader holds are the schema's", () => {
    const root = "/$defs/CommandCatalogue/properties";
    expect((schemaNode(`${root}/schema_version`) as { const: string }).const).toBe(COMMAND_CATALOGUE_SCHEMA);
    expect((schemaNode(`${root}/catalogue_revision`) as { const: number }).const).toBe(2);
    expect((schemaNode(`${root}/total_entries`) as { const: number }).const).toBe(CATALOGUE_TOTAL_ENTRIES);
    expect((schemaNode(`${root}/entries`) as { maxItems: number }).maxItems).toBe(64);
    expect((schemaNode(`${root}/capability/properties/reason`) as { const: string }).const).toBe(CATALOGUE_CAPABILITY_REASON);
    expect((schemaNode("/$defs/CommandCatalogueScope/properties/policy_revision") as { const: string }).const).toBe(CATALOGUE_POLICY_REVISION);
    expect((schemaNode("/$defs/CommandCatalogueEntry/properties/portal_reachable") as { const: boolean }).const).toBe(false);
  });

  it("the words the screens render with (the V1 vocabulary) are the same words", () => {
    expect([...CATALOGUE_GROUPS]).toEqual([...CATALOG_GROUPS]);
    expect([...RISK_TIERS_V2]).toEqual([...CATALOG_RISK_TIERS]);
    expect([...CATALOGUE_ROUTE_STATES]).toEqual([...ROUTE_STATES]);
    expect([...CATALOGUE_BLOCKED_REASONS]).toEqual([...BLOCKED_REASONS]);
    expect(Object.keys(REASON_ROUTE_STATES)).toEqual([...CATALOGUE_BLOCKED_REASONS]);
  });

  it("the route document answers 200 with this schema", () => {
    const api = loadSchema("../openapi/execution-operations.openapi.json") as { paths: Record<string, { get: { responses: Record<string, { content: Record<string, { schema: { $ref: string } }> }> } }> };
    const ok = api.paths["/api/v1/execution/commands/catalog"]!.get.responses["200"]!;
    expect(ok.content["application/json"]!.schema.$ref).toBe("../schemas/execution-operations.v1.schema.json#/$defs/CommandCatalogue");
  });

  it("every refusal word is a word the reader can say, and none of them is a success", () => {
    expect(new Set(CATALOGUE_REFUSALS).size).toBe(CATALOGUE_REFUSALS.length);
    expect(CATALOGUE_REFUSALS).not.toContain("ok");
  });

  it("another schema_version is typed unsupported_shape, not repaired", () => {
    expect(read({ ...clone(CATALOGUE), schema_version: "execution.command-catalog.v2" })).toEqual({ kind: "unsupported_shape", schemaVersion: "execution.command-catalog.v2" });
  });
});

/* ═════════════════════════ L1 ═════════════════════════ */
/** One axis over labelled values: a label names the VALUE (so the string "true" and the boolean true are different picks). */
const pick = (id: string, path: Path, entries: readonly (readonly [string, unknown])[]): Dimension =>
  dimensionOf(id, entries.map(([label, value]) => ({ label, apply: (d: Draft) => setPath(d, path, value === ABSENT ? ABSENT : structuredClone(value)) })));
const words = (...values: string[]): (readonly [string, unknown])[] => values.map((v) => [v, v] as const);

/** A matrix state must (1) be read exactly when the oracle says so, (2) be schema-valid whenever it is read, (3) be refused for a NAMED reason when schema-valid. */
function checkState(value: Draft, expectAccept: boolean): void {
  const answer = read(value);
  expect(answer.kind === "command_catalogue", `expected ${expectAccept ? "read" : "refused"}, got ${JSON.stringify(answer).slice(0, 160)}`).toBe(expectAccept);
  if (answer.kind === "command_catalogue") expect(violations(value)).toEqual([]);
  if (answer.kind === "refused" && violations(value).length === 0) expect(NAMED_STRICTER.has(answer.reason), `unnamed stricter refusal: ${answer.reason}`).toBe(true);
}

describe("L1 · matrix A · the constants", () => {
  const DIMS = [
    pick("revision", ["catalogue_revision"], [["2", 2], ["3", 3], ["string 2", "2"]]),
    pick("profile", ["delivery_profile"], words("fixture", "live")),
    pick("capability", ["capability", "state"], words("DISABLED", "ENABLED")),
    pick("reason", ["capability", "reason"], words(CATALOGUE_CAPABILITY_REASON, "OTHER_REASON")),
    pick("scope capability", ["scope", "capability_state"], words("DISABLED", "PARTIAL")),
    pick("freshness", ["scope", "freshness_state"], words("UNAVAILABLE", "FRESH")),
    pick("policy", ["scope", "policy_revision"], words(CATALOGUE_POLICY_REVISION, "execution.command-catalogue.f0.v3")),
    pick("role", ["scope", "actor_role"], words("ADMIN", "VIEWER")),
    pick("total", ["total_entries"], [["64", 64], ["63", 63]]),
    pick("extract flag", ["source", "generated_from_read_only_extract"], [["true", true], ["false", false]]),
  ];
  const states = cartesian(CATALOGUE, DIMS);
  const accept = (p: Record<string, string>) =>
    p.revision === "2" && p.profile === "fixture" && p.capability === "DISABLED" && p.reason === CATALOGUE_CAPABILITY_REASON && p["scope capability"] === "DISABLED"
    && p.freshness === "UNAVAILABLE" && p.policy === CATALOGUE_POLICY_REVISION && p.role === "ADMIN" && p.total === "64" && p["extract flag"] === "true";
  it("prints the matrix size", () => {
    console.info(describeCoverage("commandCatalogue A (constants) cartesian", coverage(DIMS, states)));
    expect(states).toHaveLength(3 * 2 * 2 * 2 * 2 * 2 * 2 * 2 * 2 * 2);
    expect(states.filter((s) => accept(s.picks))).toHaveLength(1);
  });
  it.each(states.map((s) => [s.name, s] as const))("%s", (_name, s) => checkState(s.value, accept(s.picks)));
});

describe("L1 · matrix B · entry flags: reachable x classification x tier x ceremony x method", () => {
  const MUTATION = new Set(["R1_PAPER_MUTATION", "R2_SANDBOX", "R3_LIVE_PROTECTIVE", "R4_LIVE_RISK_INCREASING"]);
  const base = (entry: Draft): Draft => holding([entry]);
  const DIMS = [
    dimensionOf("method", [
      { label: "GET", apply: (d: Draft) => { d.entries[0] = clone(GET_ENTRY); } },
      { label: "PUT", apply: (d: Draft) => { d.entries[0] = clone(PUT_ENTRY); } },
    ]),
    pick("reachable", ["entries", 0, "portal_reachable"], [["false", false], ["true", true], ["null", null], ["string false", "false"], ["absent", ABSENT]]),
    dimensionOf("classification", [
      { label: "absent", apply: () => undefined },
      { label: "SUPPORTED_BUT_INACTIVE", apply: (d: Draft) => { d.entries[0].classification = { state: "SUPPORTED_BUT_INACTIVE", reason_code: "N27_COMMAND_TRANSPORT_NOT_ACTIVATED" }; } },
      { label: "SEMANTICALLY_INCOMPATIBLE", apply: (d: Draft) => { d.entries[0].classification = { state: "SEMANTICALLY_INCOMPATIBLE", reason_code: "SOURCE_ROUTE_MAPPING_AMBIGUOUS" }; } },
      { label: "CONNECTED", apply: (d: Draft) => { d.entries[0].classification = { state: "CONNECTED", reason_code: "COMMAND_TRANSPORT_ACTIVE" }; } },
      { label: "made up", apply: (d: Draft) => { d.entries[0].classification = { state: "READY", reason_code: "COMMAND_TRANSPORT_ACTIVE" }; } },
    ]),
    pick("tier", ["entries", 0, "risk_tier"], [...RISK_TIERS_V2.map((t) => [t, t] as const), ["made up", "R5_MADE_UP"]]),
    pick("owner", ["entries", 0, "owner_review_required"], [["true", true], ["false", false]]),
    pick("plan", ["entries", 0, "plan_required"], [["true", true], ["false", false]]),
    pick("apply", ["entries", 0, "apply_required"], [["true", true], ["false", false]]),
  ];
  const states = cartesian(base(GET_ENTRY), DIMS);
  /** Oracle from the contract text and the generator's policy: not sendable, a known tier, and mutation needs owner review + plan + apply; a non-GET route needs owner review and is not R0. */
  const accept = (p: Record<string, string>) => {
    const tierKnown = p.tier !== "made up";
    const class_ = p.classification === "absent" || p.classification === "SUPPORTED_BUT_INACTIVE" || p.classification === "SEMANTICALLY_INCOMPATIBLE";
    const owner = p.owner === "true";
    const plan = p.plan === "true";
    const apply = p.apply === "true";
    const mutationOk = !MUTATION.has(p.tier!) || (owner && plan && apply);
    const methodOk = p.method === "GET" || (owner && p.tier !== "R0_READ");
    return p.reachable === "false" && class_ && tierKnown && mutationOk && methodOk;
  };
  it("prints the matrix size", () => {
    console.info(describeCoverage("commandCatalogue B (entry flags) cartesian", coverage(DIMS, states)));
    expect(states).toHaveLength(2 * 5 * 5 * 8 * 2 * 2 * 2);
    expect(states.filter((s) => accept(s.picks)).length).toBeGreaterThan(20);
  });
  it.each(states.map((s) => [s.name, s] as const))("%s", (_name, s) => checkState(s.value, accept(s.picks)));
  it("a command that claims to be sendable is named a sendable claim, whichever way it says so", () => {
    const reach = clone(base(GET_ENTRY));
    reach.entries[0].portal_reachable = true;
    expect(reasonOf(reach)).toBe("sendable_claim");
    const connected = clone(base(GET_ENTRY));
    connected.entries[0].classification = { state: "CONNECTED", reason_code: "COMMAND_TRANSPORT_ACTIVE" };
    expect(reasonOf(connected)).toBe("sendable_claim");
  });
});

describe("L1 · matrix C · route facts: state x reason x method x path", () => {
  const TABLE: Record<string, string[]> = {
    COMMAND_RELAY_DISABLED: ["OBSERVED"], SOURCE_ROUTE_MAPPING_AMBIGUOUS: ["AMBIGUOUS"], TRADING_SYSTEM_HTTP_ROUTE_UNPUBLISHED: ["UNPUBLISHED"],
    TRADING_SYSTEM_TYPED_HTTP_ROUTE_UNPUBLISHED: ["DIRECT_ACCESS_PROHIBITED"], GENERIC_REDIS_ACCESS_PROHIBITED: ["DIRECT_ACCESS_PROHIBITED"],
    DESTRUCTIVE_OR_LAB_ONLY_COMMAND_PROHIBITED: ["OBSERVED", "AMBIGUOUS"],
  };
  const mutating = { ...clone(PUT_ENTRY), http_method: null, http_path: null };
  const DIMS = [
    pick("state", ["entries", 0, "source_route_state"], words(...CATALOGUE_ROUTE_STATES)),
    pick("reason", ["entries", 0, "blocked_reason"], words(...CATALOGUE_BLOCKED_REASONS)),
    pick("method", ["entries", 0, "http_method"], [["null", null], ["GET", "GET"], ["POST", "POST"]]),
    pick("path", ["entries", 0, "http_path"], [["null", null], ["/v1/a", "/v1/a"]]),
  ];
  const states = cartesian(holding([mutating]), DIMS);
  const accept = (p: Record<string, string>) => {
    const hasMethod = p.method !== "null";
    const hasPath = p.path !== "null";
    return TABLE[p.reason!]!.includes(p.state!) && hasMethod === hasPath && (p.state === "OBSERVED") === hasMethod;
  };
  it("prints the matrix size", () => {
    console.info(describeCoverage("commandCatalogue C (route facts) cartesian", coverage(DIMS, states)));
    expect(states).toHaveLength(4 * 6 * 3 * 2);
    expect(states.filter((s) => accept(s.picks))).toHaveLength(9);
  });
  it.each(states.map((s) => [s.name, s] as const))("%s", (_name, s) => checkState(s.value, accept(s.picks)));
});

describe("L1 · matrix D · counts: entries x returned x duplicate x scope filter", () => {
  const sized = (n: number): Draft[] => (n <= 64 ? ENTRIES.slice(0, n) : [...ENTRIES, ENTRIES[0]]);
  const DIMS = [
    dimensionOf("entries", [0, 1, 2, 64, 65].map((n) => ({ label: String(n), apply: (d: Draft) => { d.entries = clone(sized(n)); } }))),
    pick("returned", ["returned_entries"], [["0", 0], ["1", 1], ["2", 2], ["63", 63], ["64", 64], ["65", 65], ["-1", -1], ["1.5", 1.5], ["string 2", "2"], ["null", null]]),
    dimensionOf("duplicate", [
      { label: "none", apply: () => undefined },
      { label: "second is first", apply: (d: Draft) => { if (d.entries.length >= 2) d.entries[1] = clone(d.entries[0]); } },
    ]),
    dimensionOf("filter", [
      { label: "none", apply: (d: Draft) => { d.scope.requested_risk_tier = null; } },
      { label: "tier of the first", apply: (d: Draft) => { d.scope.requested_risk_tier = d.entries[0]?.risk_tier ?? "R0_READ"; } },
      { label: "R4", apply: (d: Draft) => { d.scope.requested_risk_tier = "R4_LIVE_RISK_INCREASING"; } },
    ]),
  ];
  const states = cartesian(CATALOGUE, DIMS);
  /** The contract text and policy, evaluated on the value (not on the picks): at most 64, returned is the count, keys are unique, a requested tier filters. */
  const oracle = (d: Draft): boolean => {
    const entries = d.entries as Draft[];
    const tier = d.scope.requested_risk_tier as string | null;
    return entries.length <= 64 && d.returned_entries === entries.length && new Set(entries.map((e) => e.key)).size === entries.length
      && (tier === null || entries.every((e) => e.risk_tier === tier));
  };
  it("prints the matrix size", () => {
    console.info(describeCoverage("commandCatalogue D (counts) cartesian", coverage(DIMS, states)));
    expect(states).toHaveLength(5 * 10 * 2 * 3);
    expect(states.filter((s) => oracle(s.value)).length).toBeGreaterThan(8);
  });
  it.each(states.map((s) => [s.name, s] as const))("%s", (_name, s) => checkState(s.value, oracle(s.value)));
});

describe("L1 · matrix E · scope: entity x environment x requested tier", () => {
  const entities: [string, unknown, boolean][] = [
    ["null", null, true], ["account", { type: "ACCOUNT", id: "acc_1" }, true], ["system", { type: "SYSTEM", id: "sys:main" }, true],
    ["unknown type", { type: "VENUE", id: "v1" }, false], ["empty id", { type: "ACCOUNT", id: "" }, false], ["extra key", { type: "ACCOUNT", id: "a", extra: 1 }, false],
    ["type only", { type: "ACCOUNT" }, false], ["array", [], false],
  ];
  const DIMS = [
    pick("entity", ["scope", "entity"], entities.map(([label, value]) => [label, value] as const)),
    pick("environment", ["scope", "environment"], words("PAPER", "SANDBOX", "LIVE", "paper", "DEV")),
    pick("requested", ["scope", "requested_risk_tier"], [["null", null], ...RISK_TIERS_V2.map((t) => [t, t] as const), ["R5", "R5_MADE_UP"]]),
  ];
  const states = cartesian(holding([]), DIMS);
  const accept = (p: Record<string, string>) =>
    entities.find(([label]) => label === p.entity)![2] && ["PAPER", "SANDBOX", "LIVE"].includes(p.environment!) && p.requested !== "R5";
  it("prints the matrix size", () => {
    console.info(describeCoverage("commandCatalogue E (scope) cartesian", coverage(DIMS, states)));
    expect(states).toHaveLength(8 * 5 * 9);
  });
  it.each(states.map((s) => [s.name, s] as const))("%s", (_name, s) => checkState(s.value, accept(s.picks)));
});

/* ═════════════════════════ stricter-than-schema, group by group ═════════════════════════ */
describe("the named stricter-than-schema groups: schema-valid, refused, with the group's own reason", () => {
  const WITH_ENTRY = (mutate: (entry: Draft, body: Draft) => void): Draft => holding([ENTRIES[0]], (body) => mutate(body.entries[0], body));
  const groups: [string, CatalogueRefusal, Draft][] = [
    ["text-hygiene: control character in source_reference", "unsafe_text", WITH_ENTRY((e) => { e.source_reference = "cli/__main__.py:1\u00001690"; })],
    ["text-hygiene: bidi override in http_path", "unsafe_text", WITH_ENTRY((e) => { e.http_path = "/v1/‮admin"; })],
    ["text-hygiene: whitespace-only source_reference", "unsafe_text", WITH_ENTRY((e) => { e.source_reference = "   "; })],
    ["text-hygiene: zero-width in workspace_id", "unsafe_text", WITH_ENTRY((_e, b) => { b.scope.workspace_id = "work​space"; })],
    ["text-hygiene: lone surrogate in source_reference", "unsafe_text", WITH_ENTRY((e) => { e.source_reference = "cli/\ud800x"; })],
    ["text-hygiene: empty http_path", "unsafe_text", WITH_ENTRY((e) => { e.http_path = ""; })],
    ["key-identity: key is not command/action", "key_mismatch", WITH_ENTRY((e) => { e.action = "sync"; })],
    ["key-identity: two entries with one key", "duplicate_operation", holding([ENTRIES[0], ENTRIES[0]])],
    ["known-key-set: a key no contract names", "unknown_command", WITH_ENTRY((e) => { e.key = "zzz/made-up"; e.command = "zzz"; e.action = "made-up"; })],
    ["count-identity: returned_entries 63 over 64 entries", "count_mismatch", (() => { const b = clone(CATALOGUE); b.returned_entries = 63; return b; })()],
    ["scope-filter: requested R4 beside an R1 entry", "scope_mismatch", WITH_ENTRY((_e, b) => { b.scope.requested_risk_tier = "R4_LIVE_RISK_INCREASING"; })],
    ["reason-state: COMMAND_RELAY_DISABLED beside UNPUBLISHED", "reason_state_mismatch", WITH_ENTRY((e) => { e.source_route_state = "UNPUBLISHED"; e.http_method = null; e.http_path = null; })],
    ["route-pair: a method without a path", "route_incoherent", WITH_ENTRY((e) => { e.http_path = null; })],
    ["mutation-ceremony: R2 without plan", "ceremony_understated", WITH_ENTRY((e) => { e.risk_tier = "R2_SANDBOX"; e.plan_required = false; })],
    ["mutation-ceremony: a PUT route read as R0", "ceremony_understated", WITH_ENTRY((e) => { e.risk_tier = "R0_READ"; e.plan_required = false; e.apply_required = false; })],
    ["sendable-claim: CONNECTED classification", "sendable_claim", WITH_ENTRY((e) => { e.classification = { state: "CONNECTED", reason_code: "COMMAND_TRANSPORT_ACTIVE" }; })],
  ];
  it.each(groups.map((g) => [g[0], g] as const))("%s", (_name, [, reason, body]) => {
    expect(violations(body), "the payload must be schema-valid for this to be a stricter-than-schema case").toEqual([]);
    expect(reasonOf(body)).toBe(reason);
  });
  it("each reason is one of the named groups", () => {
    for (const [, reason] of groups) expect(NAMED_STRICTER.has(reason)).toBe(true);
  });
});

/* ═════════════════════════ L2 ═════════════════════════ */
describe("L2 · scale", () => {
  const widest = (): Draft => {
    const body = clone(CATALOGUE);
    body.scope.workspace_id = "w".repeat(96);
    body.scope.entity = { type: "DEPLOYMENT", id: "d".repeat(191) };
    body.scope.actor_user_id = "u".repeat(191);
    for (const entry of body.entries) {
      entry.source_reference = "s".repeat(256);
      if (entry.http_path !== null) entry.http_path = `/${"p".repeat(511)}`;
    }
    return body;
  };

  it("64 entries at their widest strings are schema-valid, read, and fit the budget", () => {
    const body = widest();
    expect(violations(body)).toEqual([]);
    const { value, ms } = timed(() => read(body));
    console.info(`commandCatalogue 64 widest entries (${(serializedBytes(body) / 1024).toFixed(1)} KiB): ${ms.toFixed(1)} ms (budget ${BUDGET_WIDEST_MS} ms)`);
    expect(value.kind).toBe("command_catalogue");
    expect(ms).toBeLessThan(BUDGET_WIDEST_MS);
    expect(serializedBytes(body)).toBeLessThan(MIB);
  });

  it("every prefix length 0..64 reads, with the count it holds", () => {
    for (let n = 0; n <= 64; n += 1) {
      const body = holding(ENTRIES.slice(0, n));
      expect(violations(body)).toEqual([]);
      const answer = read(body);
      expect(answer.kind, `n=${n}`).toBe("command_catalogue");
      if (answer.kind === "command_catalogue") {
        expect(answer.catalogue.entries).toHaveLength(n);
        expect(answer.catalogue.returnedEntries).toBe(n);
        expect(answer.catalogue.totalEntries).toBe(64);
      }
    }
  });

  it("a 65th entry is beyond the schema and voids the read, whoever it is", () => {
    for (const extra of [clone(ENTRIES[0]), { ...clone(ENTRIES[0]), key: "zzz/made-up", command: "zzz", action: "made-up" }]) {
      const body = holding([...ENTRIES, extra]);
      expect(violations(body)).not.toEqual([]);
      expect(reasonOf(body)).toBe("out_of_bounds");
    }
  });

  it("1,000 reads of the 64-entry body inside the budget", () => {
    const t = timed(() => {
      for (let n = 0; n < 1000; n += 1) read(CATALOGUE);
    });
    console.info(`commandCatalogue 1,000 x 64-entry reads: ${t.ms.toFixed(0)} ms (budget ${BUDGET_1000_READS_MS} ms)`);
    expect(t.ms).toBeLessThan(BUDGET_1000_READS_MS);
  });

  it("a 70,000 character field is refused fast, not scanned", () => {
    const text = "a".repeat(70_000);
    const edits: Draft[] = [
      holding([ENTRIES[0]], (b) => { b.scope.workspace_id = text; }),
      holding([ENTRIES[0]], (b) => { b.entries[0].source_reference = text; }),
      holding([ENTRIES[0]], (b) => { b.entries[0].http_path = text; }),
      holding([ENTRIES[0]], (b) => { b.entries[0].key = text; }),
      holding([ENTRIES[0]], (b) => { b.source.trading_system_commit = text; }),
    ];
    for (const body of edits) {
      const { value, ms } = timed(() => read(body));
      expect(value.kind).toBe("refused");
      expect(ms).toBeLessThan(50);
    }
  });
});

/* ═════════════════════════ L3 ═════════════════════════ */
interface Case { name: string; category: string; value: unknown; probe: string | null }
const enumsOf = (base: Draft, path: readonly (string | number)[], valid: readonly unknown[]): Case[] =>
  enumCases(base, path, valid.map(String)).filter((c) => !valid.includes(getPath(c.value, path)));

/** The canonical body with two entries carrying the optional `classification`, so its containers can be attacked too. */
const BASE: Draft = (() => {
  const body = clone(CATALOGUE);
  body.entries[0].classification = { state: "SUPPORTED_BUT_INACTIVE", reason_code: "N27_COMMAND_TRANSPORT_NOT_ACTIVATED" };
  body.entries[1].classification = { state: "SEMANTICALLY_INCOMPATIBLE", reason_code: "SOURCE_ROUTE_MAPPING_AMBIGUOUS" };
  return body;
})();
const E0: Path[] = [["entries", 0]];
const entryPath = (field: string): Path => ["entries", 0, field];

const NEG: Case[] = [
  ...Object.keys(CATALOGUE).flatMap((k) => requiredCases(BASE, [[k]])),
  ...requiredCases(BASE, [["capability", "state"], ["capability", "reason"], ["source", "trading_system_commit"], ["source", "cli_map_sha256"], ["source", "openapi_sha256"], ["source", "generated_from_read_only_extract"]]),
  ...requiredCases(BASE, Object.keys(CATALOGUE.scope).map((k) => ["scope", k] as const)),
  ...requiredCases(BASE, Object.keys(ENTRIES[0]).map((k) => entryPath(k))),
  ...requiredCases(BASE, [["entries", 0, "classification", "state"], ["entries", 0, "classification", "reason_code"]]),
  ...enumsOf(BASE, entryPath("group"), [...CATALOGUE_GROUPS]),
  ...enumsOf(BASE, entryPath("risk_tier"), [...RISK_TIERS_V2]),
  ...enumsOf(BASE, entryPath("source_risk_tier"), [...RISK_TIERS_V2]),
  ...enumsOf(BASE, entryPath("source_route_state"), [...CATALOGUE_ROUTE_STATES]),
  ...enumsOf(BASE, entryPath("blocked_reason"), [...CATALOGUE_BLOCKED_REASONS]),
  ...enumsOf(BASE, entryPath("http_method"), [...CATALOGUE_HTTP_METHODS, null]),
  ...enumsOf(BASE, ["entries", 0, "classification", "state"], [...CATALOGUE_CLASSIFICATION_STATES]),
  ...enumsOf(BASE, ["scope", "environment"], [...CATALOGUE_ENVIRONMENTS]),
  ...enumsOf(BASE, ["scope", "actor_role"], ["ADMIN"]),
  ...enumsOf(BASE, ["scope", "capability_state"], ["DISABLED"]),
  ...enumsOf(BASE, ["scope", "freshness_state"], ["UNAVAILABLE"]),
  ...enumsOf(BASE, ["scope", "policy_revision"], [CATALOGUE_POLICY_REVISION]),
  ...enumsOf(BASE, ["capability", "state"], ["DISABLED"]),
  ...enumsOf(BASE, ["capability", "reason"], [CATALOGUE_CAPABILITY_REASON]),
  ...enumsOf(BASE, ["delivery_profile"], ["fixture"]),
  ...enumsOf(BASE, entryPath("portal_reachable"), [false]),
  ...enumsOf(BASE, ["source", "generated_from_read_only_extract"], [true]),
  ...integerCases(BASE, ["catalogue_revision"]).filter((c) => getPath(c.value, ["catalogue_revision"]) !== 2),
  ...integerCases(BASE, ["total_entries"]).filter((c) => getPath(c.value, ["total_entries"]) !== 64),
  ...integerCases(BASE, ["returned_entries"]),
  ...stringCases(BASE, entryPath("key")), ...stringCases(BASE, entryPath("command")), ...stringCases(BASE, entryPath("action")),
  ...stringCases(BASE, entryPath("source_reference")),
  ...stringCases(BASE, ["scope", "workspace_id"]), ...stringCases(BASE, ["scope", "actor_user_id"]),
  ...stringCases(BASE, ["source", "trading_system_commit"]), ...stringCases(BASE, ["source", "cli_map_sha256"]), ...stringCases(BASE, ["source", "openapi_sha256"]),
  ...stringCases(BASE, ["entries", 0, "classification", "reason_code"]),
  ...(["owner_review_required", "plan_required", "apply_required", "verify_required"] as const).flatMap((f) => enumsOf(BASE, entryPath(f), [true, false])),
  ...arrayCases(BASE, ["entries"], { idKey: "key" }),
  ...schemaVersionCases(BASE, ["schema_version"], COMMAND_CATALOGUE_SCHEMA, ["execution.command-plan.v1", "execution.command-operation.v1", "execution.command-catalog.v2"]),
  ...pollutionCases(BASE, [[], ["capability"], ["source"], ["scope"], ...E0, ["entries", 0, "classification"]]),
];

describe("L3 · negative · catalogue", () => {
  it("reports the case counts", () => {
    const by = new Map<string, number>();
    for (const c of NEG) by.set(c.category, (by.get(c.category) ?? 0) + 1);
    console.info(`commandCatalogue L3: ${NEG.length} cases (${[...by.entries()].map(([k, v]) => `${k} ${v}`).join(", ")})`);
    expect(NEG.length).toBeGreaterThan(400);
  });

  it("the base of the negatives is itself a schema-valid body that reads", () => {
    expect(violations(BASE)).toEqual([]);
    expect(accepted(BASE)).toBe(true);
  });

  it.each(NEG.map((c) => [c.name, c] as const))("%s", (_name, c) => {
    expect(() => read(c.value)).not.toThrow();
    const answer = read(c.value);
    expect(leaked(answer, c.probe)).toBe(false);
    expect(prototypeIsClean()).toBe(true);
    if (answer.kind === "unsupported_shape") expect(getPath(c.value, ["schema_version"])).not.toBe(COMMAND_CATALOGUE_SCHEMA);
    if (answer.kind === "command_catalogue" && c.category !== "prototype-pollution") expect(violations(c.value), `accepted though schema-invalid: ${c.name}`).toEqual([]);
  });

  it("an unknown word is never a state: no enum case yields a read", () => {
    for (const c of NEG.filter((x) => x.category === "unknown-enum")) expect(accepted(c.value), c.name).toBe(false);
  });

  it("reader looser than schema: 0; and every schema-valid payload it refuses is refused for a named stricter-than-schema group", () => {
    let looser = 0;
    let stricter = 0;
    const reasons = new Map<string, number>();
    for (const c of NEG) {
      if (c.category === "prototype-pollution") continue;
      const answer = read(c.value);
      const valid = violations(c.value).length === 0;
      if (answer.kind === "command_catalogue" && !valid) looser += 1;
      if (answer.kind === "refused" && valid) {
        stricter += 1;
        reasons.set(answer.reason, (reasons.get(answer.reason) ?? 0) + 1);
        expect(NAMED_STRICTER.has(answer.reason), `${c.name}: schema-valid but refused as ${answer.reason}`).toBe(true);
      }
    }
    console.info(`commandCatalogue L3 gap: reader accepts ${looser} schema-invalid payloads; refuses ${stricter} schema-valid ones (${[...reasons.entries()].map(([k, v]) => `${k} ${v}`).join(", ") || "none"})`);
    expect(looser).toBe(0);
  });

  it("a refusal's path is built from names the reader knows: a planted key's name or value never reaches it", () => {
    const probe = "PROBE_KEY_NAME_FROM_SERVER";
    for (const place of [[], ["capability"], ["scope"], ["entries", 0]] as Path[]) {
      const body = clone(BASE);
      const host = place.reduce<Draft>((node, step) => node[step as string | number], body);
      host[probe] = "PROBE_FREE_TEXT_FROM_SERVER";
      const answer = read(body);
      expect(answer).toMatchObject({ kind: "refused", reason: "unknown_key" });
      expect(JSON.stringify(answer)).not.toContain("PROBE_");
    }
  });
});

describe("L3 · bad roots", () => {
  it.each(rootCases().map((c) => [c.name, c.value] as const))("%s", (_label, value) => {
    expect(() => read(value)).not.toThrow();
    const answer = read(value);
    expect(answer.kind === "refused" || answer.kind === "unsupported_shape").toBe(true);
  });
});
