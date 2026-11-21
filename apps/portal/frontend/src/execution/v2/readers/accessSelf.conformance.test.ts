/**
 * Reader conformance for `accessSelf.ts` (Rules 9.8.3, tiers L0 to L3).
 *
 * The published schema for both bodies is in the OpenAPI document, not in
 * `packages/contracts/schemas`: `execution-access.openapi.json`,
 * `components/schemas/AccessEligibility` and `AccessSelfNavigation`. The
 * testkit checker reads it through a relative path, so every oracle below is
 * the published schema itself, not a copy of it.
 *
 * L0  `execution-access.synthetic.valid.json`, verbatim (2 eligibility and 4
 *     navigation bodies, digest-checked) plus the schemas' own `examples`: all
 *     schema-valid, all read. The closed words, the action -> family/step-up
 *     table and the four feature names the reader holds are compared with the
 *     schema's enums and its 28 `if/then` blocks, so a word added to the
 *     contract fails here, not on a screen.
 * L1  state matrices, the schema as oracle (reader accepts <=> schema valid):
 *       A  one eligibility row, pairwise: action x permission x reason x copy key
 *          x grant_ref x authority x step-up x family
 *       B  permission x reason x copy key x grant_ref x authority, full
 *       C  rows per body: 0, 1, 16, 17 x repeated action x unknown action
 *       H  action x resource kind x answer (28 x 8 x 5): the target-kind rules
 *       D  navigation: read mode x the state/authority of each of the 4 features
 *       E  navigation: every order of the four features (only one is the contract)
 *       F  requests: action count x repeat x unknown x selector -> URL or null
 *       G  "this body answers this request"
 *       I  `observed_at_ms` / `valid_until_ms` (FE-057): schema as oracle for the scalars, the producer
 *          invariant `valid_until_ms > observed_at_ms` (stricter than the schema, named), client time x the
 *          pair -> live / expired (end-exclusive, no grace)
 *     Mapping to the UI: ALLOWED is advice, never an enable; UNAVAILABLE keeps
 *     its published reason; HIDDEN is hidden whatever the read mode says.
 * L2  16 rows of widest-legal text, 2,000 reads of each body, a 70,000
 *     character selector refused fast.
 * L3  generated negatives (enum, required, string, array, schema_version,
 *     prototype pollution, bad roots); every case refused, or accepted only
 *     where the schema accepts it; never throws, never leaks its probe.
 *     Where the reader is deliberately STRICTER than the schema it is counted
 *     and named. (SE-1, the action/target-kind table, is published since
 *     d0789674 and held by the reader: no `it.fails` is left in this file.)
 */
import { afterAll, describe, expect, it } from "vitest";

import { ACCESS_RESOURCE_KINDS } from "./accessEffective";

import { canonicalDigest, loadCanonical, loadSchema, schemaEnum } from "../testkit/loadCanonical";
import { cartesian, coverage, describeCoverage, dimension, dimensionOf, getPath, labelOf, pairwise, type Draft } from "../testkit/matrix";
import {
  arrayCases, enumCases, integerCases, leaked, pollutionCases, prototypeIsClean, requiredCases, rootCases, schemaVersionCases, stringCases,
} from "../testkit/negative";
import { cloneRows, MIB, serializedBytes, timed } from "../testkit/scale";
import { validateAgainst } from "../testkit/schema";
import {
  ACCESS_ELIGIBILITY_SCHEMA,
  ACCESS_SELF_NAVIGATION_SCHEMA,
  ELIGIBILITY_ACTION_KINDS,
  ELIGIBILITY_ACTION_RULES,
  ELIGIBILITY_ACTIONS,
  ELIGIBILITY_ALLOWED_AUTHORITIES,
  ELIGIBILITY_FAMILY_CHECKS,
  ELIGIBILITY_UNAVAILABLE_REASONS,
  MAX_ELIGIBILITY_ACTIONS,
  SELF_NAV_AUTHORITIES,
  SELF_NAV_FEATURES,
  SELF_NAV_READ_MODES,
  SELF_NAV_STATES,
  accessEligibilityUrl,
  accessSelfNavigationUrl,
  eligibilityAnswers,
  enterableSelfNavFeatures,
  eligibilityRowNow,
  enterableSelfNavFeaturesNow,
  navigationAnswers,
  readAccessEligibility,
  readAccessSelfNavigation,
  selfProjectionExpiry,
  type AccessEligibility,
  type AccessSelfNavigation,
  type EligibilityAction,
  type EligibilityRequest,
} from "./accessSelf";

/* ── budgets (stated, generous: the suite shares a machine with other lanes) ── */
const BUDGET_2000_READS_MS = 600;
const BUDGET_WIDEST_MS = 100;

const FILE = "execution-access.synthetic";
const OPENAPI = "../openapi/execution-access.openapi.json";
const ELIG = "/components/schemas/AccessEligibility";
const NAV = "/components/schemas/AccessSelfNavigation";
const ROW = "/components/schemas/AccessEligibilityRow";
const digestBefore = canonicalDigest(FILE);
afterAll(() => {
  expect(canonicalDigest(FILE)).toBe(digestBefore);
});

const eligViolations = (value: unknown) => validateAgainst(OPENAPI, ELIG, value);
const navViolations = (value: unknown) => validateAgainst(OPENAPI, NAV, value);
const clone = <T,>(value: T): T => structuredClone(value);

const canonical = loadCanonical<{ lane: string; cases: { type: string; case_name: string; value: Draft }[] }>(FILE);
const caseOf = (type: string, name: string): Draft => canonical.cases.find((c) => c.type === type && c.case_name === name)!.value;
const POSITIVE: Draft = caseOf("AccessEligibility", "POSITIVE_SHAPE_NOT_INSTALLED_AUTHORITY");
const ABSENT: Draft = caseOf("AccessEligibility", "ABSENT_PERMISSION");
const NAV_APP_ONLY: Draft = caseOf("AccessSelfNavigation", "APP_ONLY_NOT_SOURCE_AUTHORITY");
const NAV_HIDDEN: Draft = caseOf("AccessSelfNavigation", "ABSENT_PERMISSION");
const NAV_LEGACY: Draft = caseOf("AccessSelfNavigation", "ROUTING_LEGACY_COMPATIBILITY_NOT_A_GRANT");
const NAV_V2: Draft = caseOf("AccessSelfNavigation", "ROUTING_SCOPED_V2_NOT_A_GRANT");
const ROW_BASE: Draft = clone(POSITIVE.actions[0]);

/**
 * The action -> resource-kind table, read from the published schema's 28 target rules
 * (`AccessEligibility.allOf`: `if resource.kind in [...] then reason_class != ACTION_TARGET_UNSUPPORTED
 * else permission = UNAVAILABLE and reason_class in [ACTION_TARGET_UNSUPPORTED, POLICY_PENDING]`).
 */
const TARGET_RULES: Draft[] = (loadSchema(OPENAPI).components as Draft).schemas.AccessEligibility.allOf;
const KINDS_FROM_SCHEMA: Record<string, string[]> = Object.fromEntries(TARGET_RULES.map((rule) => [
  rule.then.properties.actions.items.if.properties.action.const as string, rule.if.properties.resource.properties.kind.enum as string[],
]));
const supports = (action: string, kind: string): boolean => (KINDS_FROM_SCHEMA[action] ?? []).includes(kind);
/** An action's own row as the server sends it for this kind: an allowed row when the kind is supported, else the unsupported-target row. */
const rowOn = (action: string, kind: string, base: Draft = ROW_BASE): Draft => {
  const rule = (ELIGIBILITY_ACTION_RULES as Record<string, { family: string; stepUp: boolean | null }>)[action] ?? { family: "BUSINESS_READ_SCOPE", stepUp: false };
  const row: Draft = { ...clone(base), action, family_check: rule.family, step_up_required: rule.stepUp };
  if (supports(action, kind) || !(action in ELIGIBILITY_ACTION_RULES)) return row;
  return { ...row, permission: "UNAVAILABLE", reason_class: "ACTION_TARGET_UNSUPPORTED", public_copy_key: "ACTION_TARGET_UNSUPPORTED", grant_ref: null, authority_mode: "NOT_ESTABLISHED" };
};

const eligOf = (raw: unknown): AccessEligibility | null => {
  const read = readAccessEligibility(raw);
  return read !== null && read.kind === "eligibility" ? read.eligibility : null;
};
const navOf = (raw: unknown): AccessSelfNavigation | null => {
  const read = readAccessSelfNavigation(raw);
  return read !== null && read.kind === "navigation" ? read.navigation : null;
};

/* ═════════════════════════ L0 ═════════════════════════ */
describe("L0 · canonical, verbatim", () => {
  it("the file is the synthetic lane and holds the self cases this suite thinks it has", () => {
    expect(canonical.lane).toMatch(/TEST_ONLY/);
    expect(canonical.cases.filter((c) => c.type === "AccessEligibility").map((c) => c.case_name)).toEqual(["POSITIVE_SHAPE_NOT_INSTALLED_AUTHORITY", "ABSENT_PERMISSION"]);
    expect(canonical.cases.filter((c) => c.type === "AccessSelfNavigation").map((c) => c.case_name)).toEqual([
      "APP_ONLY_NOT_SOURCE_AUTHORITY", "ABSENT_PERMISSION", "ROUTING_LEGACY_COMPATIBILITY_NOT_A_GRANT", "ROUTING_SCOPED_V2_NOT_A_GRANT",
    ]);
  });

  it("every canonical self body passes the published schema through the testkit checker, and reads", () => {
    for (const c of canonical.cases.filter((x) => x.type === "AccessEligibility")) {
      expect(eligViolations(c.value), c.case_name).toEqual([]);
      expect(eligOf(c.value), c.case_name).not.toBeNull();
    }
    for (const c of canonical.cases.filter((x) => x.type === "AccessSelfNavigation")) {
      expect(navViolations(c.value), c.case_name).toEqual([]);
      expect(navOf(c.value), c.case_name).not.toBeNull();
    }
  });

  it("the schemas' own `examples` are valid and read", () => {
    const schemas = (loadSchema(OPENAPI).components as Draft).schemas;
    for (const [name, reader, check] of [["AccessEligibility", eligOf, eligViolations], ["AccessSelfNavigation", navOf, navViolations]] as const) {
      expect(schemas[name].examples.length, name).toBeGreaterThan(0);
      for (const example of schemas[name].examples) {
        expect(check(example), name).toEqual([]);
        expect(reader(example), name).not.toBeNull();
      }
    }
  });

  it("the checker is not vacuous: a broken body is refused by the schema and by the reader", () => {
    const broken: Draft[] = [
      (() => { const b = clone(POSITIVE); b.actions[0].family_check = "CAPITAL_PREVIEW"; return b; })(),
      (() => { const b = clone(POSITIVE); b.actions[0].grant_ref = null; return b; })(),
      (() => { const b = clone(POSITIVE); b.actions.push(clone(b.actions[0])); return b; })(),
      (() => { const b = clone(POSITIVE); b.advisory_only = false; return b; })(),
      (() => { const b = clone(POSITIVE); b.actions[0].step_up_required = true; return b; })(),
    ];
    for (const body of broken) {
      expect(eligViolations(body).length).toBeGreaterThan(0);
      expect(readAccessEligibility(body)).toBeNull();
    }
    const nav: Draft[] = [
      (() => { const b = clone(NAV_APP_ONLY); b.features.reverse(); return b; })(),
      (() => { const b = clone(NAV_APP_ONLY); b.features[2].state = "ENTERABLE"; b.features[2].authority_mode = "APP_ONLY"; return b; })(),
      (() => { const b = clone(NAV_APP_ONLY); b.self_entry.route = "/profile"; return b; })(),
    ];
    for (const body of nav) {
      expect(navViolations(body).length).toBeGreaterThan(0);
      expect(readAccessSelfNavigation(body)).toBeNull();
    }
  });

  it("the closed words the reader holds are the schema's, word for word", () => {
    const row = (field: string) => schemaEnum(OPENAPI, `${ROW}/properties/${field}`);
    expect([...ELIGIBILITY_ACTIONS]).toEqual([...schemaEnum(OPENAPI, "/components/schemas/AccessEligibilityAction")]);
    expect([...ELIGIBILITY_FAMILY_CHECKS]).toEqual([...row("family_check")]);
    expect(["ALLOWED", "UNAVAILABLE"]).toEqual([...row("permission")]);
    expect(["FAMILY_CHECK_REQUIRED", ...ELIGIBILITY_UNAVAILABLE_REASONS]).toEqual([...row("reason_class")]);
    expect(["FAMILY_CHECK_REQUIRED", ...ELIGIBILITY_UNAVAILABLE_REASONS]).toEqual([...row("public_copy_key")]);
    expect([...ELIGIBILITY_ALLOWED_AUTHORITIES, "NOT_ESTABLISHED"].sort()).toEqual([...row("authority_mode")].sort());
    expect([...SELF_NAV_FEATURES]).toEqual([...schemaEnum(OPENAPI, "/components/schemas/AccessSelfNavigationItem/properties/feature")]);
    expect([...SELF_NAV_STATES]).toEqual([...schemaEnum(OPENAPI, "/components/schemas/AccessSelfNavigationItem/properties/state")]);
    expect([...SELF_NAV_AUTHORITIES]).toEqual([...schemaEnum(OPENAPI, "/components/schemas/AccessSelfNavigationItem/properties/authority_mode")]);
    expect([...SELF_NAV_READ_MODES]).toEqual([...schemaEnum(OPENAPI, `${NAV}/properties/current_read_mode`)]);
    expect(MAX_ELIGIBILITY_ACTIONS).toBe(((loadSchema(OPENAPI).components as Draft).schemas.AccessEligibility.properties.actions.maxItems));
  });

  it("the action -> family and step-up table is the schema's 28 if/then blocks", () => {
    const blocks = ((loadSchema(OPENAPI).components as Draft).schemas.AccessEligibilityRow.allOf as Draft[]).filter((entry) => entry.if?.properties?.action?.const !== undefined);
    expect(blocks).toHaveLength(ELIGIBILITY_ACTIONS.length);
    const fromSchema: Record<string, { family: string; stepUp: boolean | null }> = {};
    for (const block of blocks) {
      fromSchema[block.if.properties.action.const] = { family: block.then.properties.family_check.const, stepUp: block.then.properties.step_up_required.const };
    }
    expect(fromSchema).toEqual(JSON.parse(JSON.stringify(ELIGIBILITY_ACTION_RULES)));
  });

  it("the action -> resource-kind table is the schema's 28 target rules, word for word (nothing derived)", () => {
    expect(TARGET_RULES).toHaveLength(ELIGIBILITY_ACTIONS.length);
    expect(Object.keys(KINDS_FROM_SCHEMA).sort()).toEqual([...ELIGIBILITY_ACTIONS].sort());
    expect(JSON.parse(JSON.stringify(ELIGIBILITY_ACTION_KINDS))).toEqual(KINDS_FROM_SCHEMA);
    for (const rule of TARGET_RULES) {
      const action = rule.then.properties.actions.items.if.properties.action.const;
      expect(rule.then.properties.actions.items.then, action).toEqual({ properties: { reason_class: { not: { const: "ACTION_TARGET_UNSUPPORTED" } } } });
      expect(rule.else.properties.actions.items.then, action).toEqual({
        properties: { permission: { const: "UNAVAILABLE" }, reason_class: { enum: ["ACTION_TARGET_UNSUPPORTED", "POLICY_PENDING"] } },
      });
      // Every kind named is a kind the reader knows.
      for (const kind of rule.if.properties.resource.properties.kind.enum) expect(ACCESS_RESOURCE_KINDS as readonly string[], action).toContain(kind);
    }
  });

  it("no other body in the file is read by either reader; each is the typed unsupported_shape", () => {
    for (const c of canonical.cases) {
      if (c.type !== "AccessEligibility") expect(readAccessEligibility(c.value), c.type).toEqual({ kind: "unsupported_shape", schemaVersion: typeof c.value.schema_version === "string" ? c.value.schema_version : null });
      if (c.type !== "AccessSelfNavigation") expect(readAccessSelfNavigation(c.value), c.type).toEqual({ kind: "unsupported_shape", schemaVersion: typeof c.value.schema_version === "string" ? c.value.schema_version : null });
    }
    expect(ACCESS_ELIGIBILITY_SCHEMA).toBe("portal.self-eligibility.v1");
    expect(ACCESS_SELF_NAVIGATION_SCHEMA).toBe("portal.self-navigation.v1");
  });

  it("the bodies read as published", () => {
    expect(eligOf(POSITIVE)!.actions[0]).toMatchObject({ permission: "ALLOWED", grantRef: POSITIVE.actions[0].grant_ref, authorityMode: "VERSIONED_CURRENT" });
    expect(eligOf(ABSENT)!.actions[0]).toMatchObject({ permission: "UNAVAILABLE", reasonClass: "NO_CURRENT_PERMISSION", grantRef: null });
    expect(enterableSelfNavFeatures(navOf(NAV_APP_ONLY)!)).toEqual(["EXECUTION_PORTFOLIOS", "EXECUTION_ACCOUNTS_BINDINGS", "EXECUTION_BLOTTER"]);
    for (const body of [NAV_HIDDEN, NAV_LEGACY, NAV_V2]) expect(enterableSelfNavFeatures(navOf(body)!)).toEqual([]);
    expect([NAV_HIDDEN, NAV_LEGACY, NAV_V2].map((b) => navOf(b)!.currentReadMode)).toEqual(["NOT_ESTABLISHED", "LEGACY_COMPATIBILITY", "SCOPED_V2"]);
  });
});

/* ═════════════════════════ L1 ═════════════════════════ */
const REPRESENTATIVE_ACTIONS: EligibilityAction[] = ["alpha.read", "audit.read", "governance.r1.decide", "capital.top_up", "capital.cancel_remaining", "deployment.register"];
const REASONS = ["FAMILY_CHECK_REQUIRED", ...ELIGIBILITY_UNAVAILABLE_REASONS];
const AUTHORITIES = ["VERSIONED_CURRENT", "LEGACY_COMPATIBILITY", "APP_ONLY", "NOT_ESTABLISHED"];
const AT = ["actions", 0] as const;

describe("L1 · matrix A · one eligibility row, pairwise", () => {
  const DIMS = [
    dimension("action", [...AT, "action"], REPRESENTATIVE_ACTIONS),
    dimension("permission", [...AT, "permission"], ["ALLOWED", "UNAVAILABLE"]),
    dimension("reason", [...AT, "reason_class"], REASONS),
    dimensionOf("copy", [
      { label: "same", apply: (d: Draft) => { d.actions[0].public_copy_key = d.actions[0].reason_class; } },
      { label: "other", apply: (d: Draft) => { d.actions[0].public_copy_key = d.actions[0].reason_class === "POLICY_PENDING" ? "NO_CURRENT_PERMISSION" : "POLICY_PENDING"; } },
    ]),
    dimension("grant_ref", [...AT, "grant_ref"], [null, "acg_x"]),
    dimension("authority", [...AT, "authority_mode"], AUTHORITIES),
    dimension("step_up", [...AT, "step_up_required"], [true, false, null]),
    dimension("family", [...AT, "family_check"], [...ELIGIBILITY_FAMILY_CHECKS]),
  ];
  const states = pairwise(POSITIVE, DIMS);

  it("prints the matrix size", () => {
    console.info(describeCoverage("accessSelf A (row) pairwise", coverage(DIMS, states)));
    expect(states.length).toBeGreaterThan(40);
  });

  it.each(states.map((s) => [s.name, s] as const))("%s", (_name, state) => {
    const valid = eligViolations(state.value).length === 0;
    expect(eligOf(state.value) !== null).toBe(valid);
    expect(() => readAccessEligibility(state.value)).not.toThrow();
  });

  it("includes the rows the server really sends: every action with its own family and step-up reads", () => {
    for (const action of ELIGIBILITY_ACTIONS) {
      const rule = ELIGIBILITY_ACTION_RULES[action];
      const body = clone(POSITIVE);
      // A kind the action supports (taken from the schema), as the server sends it.
      body.resource.kind = KINDS_FROM_SCHEMA[action]![0];
      Object.assign(body.actions[0], { action, family_check: rule.family, step_up_required: rule.stepUp });
      expect(eligViolations(body), action).toEqual([]);
      const row = eligOf(body)!.actions[0]!;
      expect(row.permission, action).toBe("ALLOWED");
      expect(row.familyCheck, action).toBe(rule.family);
      expect(row.stepUpRequired, action).toBe(rule.stepUp);
    }
  });
});

describe("L1 · matrix H · action x resource kind x permission/reason (28 x 8 x 6)", () => {
  // From the contract's sentence, not from the schema: a supported kind never answers ACTION_TARGET_UNSUPPORTED;
  // an unsupported kind answers UNAVAILABLE with ACTION_TARGET_UNSUPPORTED or POLICY_PENDING and nothing else, never ALLOWED.
  const ANSWERS = [
    { name: "ALLOWED", set: {} },
    ...["NO_CURRENT_PERMISSION", "POLICY_PENDING", "FIELD_POLICY_PENDING", "ACTION_TARGET_UNSUPPORTED"].map((reason) => ({
      name: reason, set: { permission: "UNAVAILABLE", reason_class: reason, public_copy_key: reason, grant_ref: null, authority_mode: "NOT_ESTABLISHED" },
    })),
  ];
  const accept = (supported: boolean, answer: string) => (supported ? answer !== "ACTION_TARGET_UNSUPPORTED" : answer === "ACTION_TARGET_UNSUPPORTED" || answer === "POLICY_PENDING");
  const cells = ELIGIBILITY_ACTIONS.flatMap((action) => ACCESS_RESOURCE_KINDS.flatMap((kind) => ANSWERS.map((answer) => ({ action, kind, answer }))));

  it("prints the matrix size and how many cells each side accepts", () => {
    expect(cells).toHaveLength(28 * 8 * 5);
    const accepted = cells.filter((c) => accept(supports(c.action, c.kind), c.answer.name));
    console.info(`accessSelf H (action x kind x answer): ${cells.length} cells, ${accepted.length} accepted`);
    // 28 actions x 5 kinds' worth of supported cells (4 answers each) + unsupported cells (2 answers each).
    const supportedPairs = ELIGIBILITY_ACTIONS.reduce((n, a) => n + ACCESS_RESOURCE_KINDS.filter((k) => supports(a, k)).length, 0);
    expect(accepted).toHaveLength(supportedPairs * 4 + (28 * 8 - supportedPairs) * 2);
  });

  it("USER supports no action: every action on a USER is UNAVAILABLE with ACTION_TARGET_UNSUPPORTED or POLICY_PENDING", () => {
    expect(ELIGIBILITY_ACTIONS.filter((a) => supports(a, "USER"))).toEqual([]);
  });

  it("every cell: the reader reads it exactly when the sentence and the schema accept it", () => {
    for (const { action, kind, answer } of cells) {
      const body = clone(POSITIVE);
      body.resource.kind = kind;
      const rule = ELIGIBILITY_ACTION_RULES[action];
      body.actions = [{ ...clone(ROW_BASE), action, family_check: rule.family, step_up_required: rule.stepUp, ...answer.set }];
      const expected = accept(supports(action, kind), answer.name);
      const label = `${action} on ${kind}: ${answer.name}`;
      expect(eligViolations(body).length === 0, label).toBe(expected);
      expect(eligOf(body) !== null, label).toBe(expected);
    }
  });

  it("the rule holds for every row of a body, not only the first", () => {
    const body = clone(POSITIVE);
    body.resource.kind = "PORTFOLIO";
    const ok = rowOn("portfolio.read", "PORTFOLIO");
    const bad = { ...rowOn("account.read", "ACCOUNT") }; // an allowed account.read on a PORTFOLIO
    body.actions = [ok, bad];
    expect(eligViolations(body).length).toBeGreaterThan(0);
    expect(eligOf(body)).toBeNull();
    body.actions = [ok, rowOn("account.read", "PORTFOLIO")];
    expect(eligViolations(body)).toEqual([]);
    expect(eligOf(body)!.actions.map((r) => [r.action, r.permission, r.reasonClass])).toEqual([
      ["portfolio.read", "ALLOWED", "FAMILY_CHECK_REQUIRED"], ["account.read", "UNAVAILABLE", "ACTION_TARGET_UNSUPPORTED"],
    ]);
  });
});

describe.each([
  // portfolio.read on a PORTFOLIO: supported, so ACTION_TARGET_UNSUPPORTED is never the reason.
  ["supported kind (portfolio.read on PORTFOLIO)", "PORTFOLIO", 3, 3],
  // portfolio.read on an ACCOUNT: not supported, so only UNAVAILABLE with ACTION_TARGET_UNSUPPORTED or POLICY_PENDING.
  ["unsupported kind (portfolio.read on ACCOUNT)", "ACCOUNT", 0, 2],
] as const)("L1 · matrix B · permission x reason x copy key x grant_ref x authority · %s", (_label, kind, allowedCount, unavailableCount) => {
  const DIMS = [
    dimension("permission", [...AT, "permission"], ["ALLOWED", "UNAVAILABLE"]),
    dimension("reason", [...AT, "reason_class"], REASONS),
    dimensionOf("copy", [
      { label: "same", apply: (d: Draft) => { d.actions[0].public_copy_key = d.actions[0].reason_class; } },
      { label: "other", apply: (d: Draft) => { d.actions[0].public_copy_key = d.actions[0].reason_class === "POLICY_PENDING" ? "NO_CURRENT_PERMISSION" : "POLICY_PENDING"; } },
    ]),
    dimension("grant_ref", [...AT, "grant_ref"], [null, "acg_x"]),
    dimension("authority", [...AT, "authority_mode"], AUTHORITIES),
  ];
  const root = clone(POSITIVE);
  root.resource.kind = kind;
  const states = cartesian(root, DIMS);
  // Written from the contract's sentence, not from the schema: an allowed row has a grant, a reason that sends it on to the family check
  // and a real authority; an unavailable row has a reason, no grant and no authority. Since d0789674 the action must also fit the
  // resource kind: a supported kind never answers ACTION_TARGET_UNSUPPORTED; an unsupported kind answers only UNAVAILABLE with
  // ACTION_TARGET_UNSUPPORTED or POLICY_PENDING.
  const supported = supports("portfolio.read", kind);
  const accept = (p: Record<string, string>) => p.copy === "same" && (
    (supported && p.permission === "ALLOWED" && p.reason === "FAMILY_CHECK_REQUIRED" && p.grant_ref === "acg_x" && p.authority !== "NOT_ESTABLISHED")
    || (p.permission === "UNAVAILABLE" && p.reason !== "FAMILY_CHECK_REQUIRED" && p.grant_ref === "null" && p.authority === "NOT_ESTABLISHED"
      && (supported ? p.reason !== "ACTION_TARGET_UNSUPPORTED" : p.reason === "ACTION_TARGET_UNSUPPORTED" || p.reason === "POLICY_PENDING"))
  );

  it("prints the matrix size", () => {
    console.info(describeCoverage(`accessSelf B (permission) cartesian, ${kind}`, coverage(DIMS, states)));
    expect(supports("portfolio.read", "PORTFOLIO")).toBe(true);
    expect(supports("portfolio.read", "ACCOUNT")).toBe(false);
    expect(states).toHaveLength(2 * 5 * 2 * 2 * 4);
    // 3 real authorities for an allowed row; 3 reasons (supported) or 2 (unsupported) for an unavailable one.
    expect(states.filter((s) => accept(s.picks))).toHaveLength(allowedCount + unavailableCount);
  });

  it.each(states.map((s) => [s.name, s] as const))("%s", (_name, state) => {
    const body = eligOf(state.value);
    expect(body !== null).toBe(accept(state.picks));
    // The sentence and the schema agree on every cell.
    expect(eligViolations(state.value).length === 0).toBe(accept(state.picks));
    if (body === null) return;
    const row = body.actions[0]!;
    // ALLOWED is advice: it always carries the three checks it did not make and a grant to name.
    if (row.permission === "ALLOWED") {
      expect(row.grantRef).not.toBeNull();
      expect(row.unchecked).toEqual({ stepUpFreshness: "NOT_CHECKED", challengeAvailability: "NOT_CHECKED", commandReadiness: "NOT_CHECKED" });
    } else {
      expect(row.grantRef).toBeNull();
      expect(row.reasonClass).toBe(row.publicCopyKey);
    }
  });
});

describe("L1 · matrix C · rows per body", () => {
  // The resource is a PORTFOLIO: an action it does not support is sent as the unsupported-target row (rowOn), as the server does.
  const rowFor = (action: string): Draft => rowOn(action, "PORTFOLIO");
  const body = (actions: string[]) => { const b = clone(POSITIVE); b.actions = actions.map(rowFor); return b; };
  const distinct = (n: number) => ELIGIBILITY_ACTIONS.slice(0, n) as string[];
  const CASES: [string, string[]][] = [
    ["none", []],
    ["one", distinct(1)],
    ["sixteen distinct", distinct(16)],
    ["seventeen distinct", distinct(17)],
    ["all twenty-eight", distinct(28)],
    ["two, the same action", ["portfolio.read", "portfolio.read"]],
    ["sixteen with one repeated", [...distinct(15), "alpha.read"]],
    ["one unknown action", ["portfolio.write"]],
  ];

  it.each(CASES)("%s", (name, actions) => {
    const b = body(actions);
    const valid = eligViolations(b).length === 0;
    expect(eligOf(b) !== null).toBe(valid);
    expect(valid).toBe(["one", "sixteen distinct"].includes(name));
  });
});

describe("L1 · matrix D · navigation: read mode x state and authority of each feature", () => {
  const CELLS: Record<string, { state: string; authority: string }> = {
    hidden: { state: "HIDDEN", authority: "NOT_ESTABLISHED" },
    "scoped": { state: "ENTERABLE", authority: "SCOPED_CURRENT" },
    "app-only": { state: "ENTERABLE", authority: "APP_ONLY" },
  };
  const feature = (index: number) => dimensionOf(`f${index}`, Object.entries(CELLS).map(([label, cell]) => ({
    label, apply: (d: Draft) => { d.features[index].state = cell.state; d.features[index].authority_mode = cell.authority; },
  })));
  const DIMS = [
    dimension("mode", ["current_read_mode"], [...SELF_NAV_READ_MODES]),
    feature(0), feature(1), feature(2), feature(3),
  ];
  const states = cartesian(NAV_HIDDEN, DIMS);
  const accept = (p: Record<string, string>) => p.f2 !== "app-only";

  it("prints the matrix size", () => {
    console.info(describeCoverage("accessSelf D (navigation) cartesian", coverage(DIMS, states)));
    expect(states).toHaveLength(3 * 3 * 3 * 3 * 3);
    expect(states.filter((s) => accept(s.picks))).toHaveLength(3 * 3 * 3 * 2 * 3);
  });

  it.each(states.map((s) => [s.name, s] as const))("%s", (_name, state) => {
    const nav = navOf(state.value);
    expect(nav !== null).toBe(accept(state.picks));
    expect(navViolations(state.value).length === 0).toBe(accept(state.picks));
    if (nav === null) return;
    // What is listed is exactly what is not hidden, in menu order, whatever the read mode says.
    expect(enterableSelfNavFeatures(nav)).toEqual(
      SELF_NAV_FEATURES.filter((_, index) => state.picks[`f${index}`] !== "hidden"),
    );
    expect(nav.currentReadMode).toBe(state.picks.mode);
    expect(nav.selfEntry.route).toBeNull();
  });
});

describe("L1 · matrix E · navigation: order of the four features", () => {
  function permutations<T>(items: readonly T[]): T[][] {
    if (items.length <= 1) return [items.slice()];
    return items.flatMap((item, index) => permutations([...items.slice(0, index), ...items.slice(index + 1)]).map((rest) => [item, ...rest]));
  }
  const orders = permutations([0, 1, 2, 3]);
  it("prints the matrix size", () => {
    expect(orders).toHaveLength(24);
  });
  it.each(orders.map((order) => [order.join(""), order] as const))("order %s", (_name, order) => {
    const body = clone(NAV_HIDDEN);
    body.features = order.map((index) => clone(NAV_HIDDEN.features[index]));
    const identity = order.every((value, index) => value === index);
    expect(navViolations(body).length === 0).toBe(identity);
    expect(navOf(body) !== null).toBe(identity);
  });
});

describe("L1 · matrix F · requests", () => {
  const BASE: EligibilityRequest = { workspaceId: "ws_TEST_ONLY", environment: "paper", resource: { kind: "PORTFOLIO", id: "portfolio_TEST_ONLY" }, actions: ["portfolio.read"] };
  const DIMS = [
    dimensionOf("count", [0, 1, 2, 16, 17].map((n) => ({ label: String(n), apply: (d: Draft) => { d.actions = [...ELIGIBILITY_ACTIONS].slice(0, n); } }))),
    dimensionOf("repeat", [
      { label: "none", apply: () => undefined },
      { label: "first twice", apply: (d: Draft) => { if (d.actions.length > 0) d.actions[d.actions.length - 1] = d.actions[0]; } },
    ]),
    dimensionOf("known", [
      { label: "known", apply: () => undefined },
      { label: "unknown", apply: (d: Draft) => { if (d.actions.length > 0) d.actions[0] = "portfolio.write"; } },
    ]),
    dimension("environment", ["environment"], ["paper", "sandbox", "live", "prod"]),
    dimension("kind", ["resource", "kind"], ["ROOT", "USER", "FUND"]),
    dimension("workspace", ["workspaceId"], ["ws", "", "   "]),
  ];
  const states = cartesian(BASE, DIMS);
  const accept = (p: Record<string, string>) => ["1", "2", "16"].includes(p.count) && p.known === "known" && p.environment !== "prod" && p.kind !== "FUND" && p.workspace === "ws"
    && !(p.repeat === "first twice" && Number(p.count) >= 2);

  it("prints the matrix size", () => {
    console.info(describeCoverage("accessSelf F (request) cartesian", coverage(DIMS, states)));
    expect(states.length).toBe(5 * 2 * 2 * 4 * 3 * 3);
  });

  it.each(states.map((s) => [s.name, s] as const))("%s", (_name, state) => {
    const url = accessEligibilityUrl(state.value);
    expect(url !== null).toBe(accept(state.picks));
    if (url === null) return;
    const parsed = new URL(url, "https://portal.test");
    expect([...parsed.searchParams.keys()]).toEqual(["workspace_id", "environment", "resource_kind", "resource_id", "actions"]);
    // The query the reader builds is one the published parameter schema accepts.
    const actions = parsed.searchParams.get("actions")!;
    expect(actions.split(",")).toEqual(state.value.actions);
    expect(new RegExp(((loadSchema(OPENAPI).paths as Draft)["/api/admin/profile-access/v2/eligibility"].get.parameters as Draft[]).find((p) => p.name === "actions").schema.pattern).test(actions)).toBe(true);
  });

  it("the navigation URL is null for every selector the server would refuse", () => {
    for (const environment of ["paper", "sandbox", "live"]) expect(accessSelfNavigationUrl({ workspaceId: "ws", environment: environment as never })).not.toBeNull();
    for (const workspaceId of ["", "   ", "a".repeat(257), "a\nb"]) expect(accessSelfNavigationUrl({ workspaceId, environment: "paper" }), workspaceId).toBeNull();
  });
});

describe("L1 · matrix G · a body answers its own request only", () => {
  const body = eligOf(POSITIVE)!;
  const REQ: EligibilityRequest = { workspaceId: POSITIVE.workspace_id, environment: POSITIVE.environment, resource: { ...POSITIVE.resource }, actions: ["portfolio.read"] };
  const DIMS = [
    dimensionOf("workspace", [{ label: "same", apply: () => undefined }, { label: "other", apply: (d: Draft) => { d.workspaceId = "ws_other"; } }]),
    dimensionOf("environment", [{ label: "same", apply: () => undefined }, { label: "other", apply: (d: Draft) => { d.environment = "live"; } }]),
    dimensionOf("kind", [{ label: "same", apply: () => undefined }, { label: "other", apply: (d: Draft) => { d.resource.kind = "ACCOUNT"; } }]),
    dimensionOf("id", [{ label: "same", apply: () => undefined }, { label: "other", apply: (d: Draft) => { d.resource.id = "other"; } }]),
    dimensionOf("actions", [
      { label: "same", apply: () => undefined },
      { label: "more", apply: (d: Draft) => { d.actions = ["portfolio.read", "audit.read"]; } },
      { label: "different", apply: (d: Draft) => { d.actions = ["account.read"]; } },
    ]),
  ];
  const states = cartesian(REQ, DIMS);
  it.each(states.map((s) => [s.name, s] as const))("%s", (_name, state) => {
    expect(eligibilityAnswers(body, state.value)).toBe(Object.values(state.picks).every((pick) => pick === "same"));
  });
  it("navigation: same workspace and environment, or no", () => {
    const nav = navOf(NAV_APP_ONLY)!;
    for (const workspaceId of [NAV_APP_ONLY.workspace_id, "other"]) {
      for (const environment of ["paper", "live"] as const) {
        expect(navigationAnswers(nav, { workspaceId, environment })).toBe(workspaceId === NAV_APP_ONLY.workspace_id && environment === NAV_APP_ONLY.environment);
      }
    }
  });
});

/* ═════════ L1 · matrix I · observed_at_ms / valid_until_ms (FE-057, Codex 7818d563) ═════════ */
describe("L1 · matrix I · projection times: the schema as oracle, then the producer invariant", () => {
  const SAFE = Number.MAX_SAFE_INTEGER;
  const BODIES: [string, Draft, (raw: unknown) => string[], (raw: unknown) => { observedAtMs: number; validUntilMs: number } | null][] = [
    ["eligibility", POSITIVE, eligViolations, (raw) => eligOf(raw)],
    ["navigation", NAV_APP_ONLY, navViolations, (raw) => navOf(raw)],
  ];

  it("the published schema requires both as integers 0..MAX_SAFE_INTEGER and says what they are not", () => {
    const schemas = (loadSchema(OPENAPI).components as Draft).schemas;
    for (const name of ["AccessEligibility", "AccessSelfNavigation"]) {
      expect(schemas[name].required, name).toEqual(expect.arrayContaining(["observed_at_ms", "valid_until_ms"]));
      for (const key of ["observed_at_ms", "valid_until_ms"]) {
        expect(schemas[name].properties[key], `${name}.${key}`).toMatchObject({ type: "integer", minimum: 0, maximum: SAFE });
      }
      expect(schemas[name].additionalProperties, name).toBe(false);
      expect(schemas[name].properties.observed_at_ms.description, name).toContain("not source observation time");
      expect(schemas[name].properties.valid_until_ms.description, name).toContain("this actor's current session only");
      expect(schemas[name].properties.valid_until_ms.description, name).toContain("Not a cache TTL");
      expect(schemas[name].properties.valid_until_ms.description, name).toContain("revoked earlier");
    }
  });

  it("every canonical body carries the pair and the reader returns it exactly, with valid_until after observed", () => {
    for (const c of canonical.cases.filter((x) => x.type === "AccessEligibility" || x.type === "AccessSelfNavigation")) {
      const read = c.type === "AccessEligibility" ? eligOf(c.value) : navOf(c.value);
      expect(read, c.case_name).toMatchObject({ observedAtMs: c.value.observed_at_ms, validUntilMs: c.value.valid_until_ms });
      expect(read!.validUntilMs, c.case_name).toBeGreaterThan(read!.observedAtMs);
    }
  });

  const VALUES: unknown[] = [0, 1, 1792094400000, SAFE, SAFE + 1, -1, 0.5, 1e21, "1792094400000", "", null, true, [], {}, Number.NaN, Number.POSITIVE_INFINITY];
  for (const [label, base, violations, read] of BODIES) {
    for (const key of ["observed_at_ms", "valid_until_ms"]) {
      it.each(VALUES.map((v) => [labelOf(v), v] as const))(`${label} ${key} = %s: the reader accepts exactly what the schema accepts, up to the producer invariant`, (_name, value) => {
        const body = clone(base);
        body[key] = value;
        // Keep the pair ordered where the value is itself a legal integer, so that only the scalar rule is under test.
        if (key === "observed_at_ms" && typeof value === "number" && Number.isSafeInteger(value) && value >= 0) body.valid_until_ms = SAFE;
        if (key === "valid_until_ms" && typeof value === "number" && Number.isSafeInteger(value) && value >= 0) body.observed_at_ms = 0;
        const schemaOk = violations(body).length === 0;
        const readOk = read(body) !== null;
        const ordered = body.valid_until_ms > body.observed_at_ms;
        // reader accepts <=> schema valid AND the invariant the schema cannot state holds
        expect(readOk).toBe(schemaOk && ordered);
      });
    }
  }

  it.each(BODIES.map(([label, base, violations, read]) => [label, base, violations, read] as const))("%s: a ceiling at or before the evaluation clock is schema-valid and refused by the reader", (_label, base, violations, read) => {
    for (const [observed, until] of [[1792094400000, 1792094400000], [1792094400000, 1792094399999], [SAFE, SAFE], [5, 0]] as const) {
      const body = clone(base);
      body.observed_at_ms = observed;
      body.valid_until_ms = until;
      expect(violations(body), `${observed}..${until}`).toEqual([]);
      expect(read(body), `${observed}..${until}`).toBeNull();
    }
    // One millisecond of session is a session.
    const body = clone(base);
    body.observed_at_ms = 1792094400000;
    body.valid_until_ms = 1792094400001;
    expect(violations(body)).toEqual([]);
    expect(read(body)).toMatchObject({ observedAtMs: 1792094400000, validUntilMs: 1792094400001 });
  });

  it.each(BODIES.map(([label, base]) => [label, base] as const))("%s: a key beside the pair, or the pair renamed, voids the closed body", (_label, base) => {
    for (const extra of ["expires_at_ms", "revision", "ttl_ms", "cache_until_ms", "workspace_deadline_ms"]) {
      const body = clone(base);
      body[extra] = 1792094405000;
      const answer = base === POSITIVE ? readAccessEligibility(body) : readAccessSelfNavigation(body);
      expect(answer, extra).toBeNull();
    }
    const renamed = clone(base);
    renamed.observedAtMs = renamed.observed_at_ms;
    delete renamed.observed_at_ms;
    expect(base === POSITIVE ? readAccessEligibility(renamed) : readAccessSelfNavigation(renamed)).toBeNull();
  });

  // Client time x the pair: expired exactly when now >= valid_until_ms. No grace, no early refusal before observed_at_ms.
  const OBS = 1792094400000;
  const UNTIL = 1792094405000;
  const NOWS: [string, number, "live" | "expired"][] = [
    ["a year before observed (clock behind): not a published reason to refuse", OBS - 31_536_000_000, "live"],
    ["one ms before observed", OBS - 1, "live"],
    ["exactly observed", OBS, "live"],
    ["one ms before the ceiling", UNTIL - 1, "live"],
    ["exactly the ceiling (end-exclusive)", UNTIL, "expired"],
    ["one ms after the ceiling (no grace)", UNTIL + 1, "expired"],
    ["a second after the ceiling (no skew allowance)", UNTIL + 1000, "expired"],
    ["MAX_SAFE_INTEGER", SAFE, "expired"],
    ["NaN", Number.NaN, "expired"],
    ["Infinity", Number.POSITIVE_INFINITY, "expired"],
    ["-Infinity", Number.NEGATIVE_INFINITY, "expired"],
  ];
  it.each(NOWS)("client time %s", (_name, now, expected) => {
    const elig = eligOf(POSITIVE)!;
    const nav = navOf(NAV_APP_ONLY)!;
    expect(selfProjectionExpiry(elig, now).state).toBe(expected);
    expect(selfProjectionExpiry(nav, now).state).toBe(expected);
    const action = elig.actions[0]!.action;
    const rowNow = eligibilityRowNow(elig, action, now);
    expect(rowNow.kind).toBe(expected === "live" ? "row" : "expired");
    // An expired projection never yields the stale ALLOWED row; a live one yields exactly the row the body carried.
    if (rowNow.kind === "row") expect(rowNow.row).toBe(elig.actions[0]);
    expect(enterableSelfNavFeaturesNow(nav, now)).toEqual(expected === "live" ? enterableSelfNavFeatures(nav) : []);
  });

  it("the reason is the published one: the session ceiling, or an unreadable client clock; never a made-up third", () => {
    const nav = navOf(NAV_APP_ONLY)!;
    expect(selfProjectionExpiry(nav, UNTIL)).toEqual({ state: "expired", reason: "SESSION_CEILING_PASSED", validUntilMs: UNTIL });
    expect(selfProjectionExpiry(nav, Number.NaN)).toEqual({ state: "expired", reason: "CLOCK_UNREADABLE", validUntilMs: UNTIL });
    expect(selfProjectionExpiry(nav, "1792094400000" as unknown as number).state).toBe("expired");
    expect(selfProjectionExpiry(nav, undefined as unknown as number).state).toBe("expired");
  });

  it("an absent action stays absent while live, and is expired (not 'not allowed') afterwards", () => {
    const elig = eligOf(POSITIVE)!;
    expect(eligibilityRowNow(elig, "audit.read", OBS)).toEqual({ kind: "absent" });
    expect(eligibilityRowNow(elig, "audit.read", UNTIL).kind).toBe("expired");
  });
});

/* ═════════════════════════ L2 ═════════════════════════ */
describe("L2 · scale", () => {
  it("reads 16 rows of widest-legal text (256-byte selectors, 256-codepoint grant refs) inside the budget", () => {
    const body = clone(POSITIVE);
    body.workspace_id = "w".repeat(256);
    body.resource.id = "r".repeat(256);
    // Sixteen actions a PORTFOLIO supports, so every row is an allowed one with a 256-codepoint grant ref.
    const supported = ELIGIBILITY_ACTIONS.filter((a) => supports(a, "PORTFOLIO")).slice(0, 16);
    expect(supported).toHaveLength(16);
    body.actions = cloneRows(ROW_BASE, 16, (row, index) => {
      const action = supported[index]!;
      const rule = ELIGIBILITY_ACTION_RULES[action];
      Object.assign(row, { action, family_check: rule.family, step_up_required: rule.stepUp, grant_ref: `${index}`.padEnd(256, "g") });
    });
    expect(eligViolations(body)).toEqual([]);
    const { value, ms } = timed(() => eligOf(body));
    console.info(`accessSelf eligibility 16 widest rows (${(serializedBytes(body) / 1024).toFixed(1)} KiB): ${ms.toFixed(1)} ms (budget ${BUDGET_WIDEST_MS} ms)`);
    expect(value!.actions).toHaveLength(16);
    expect(ms).toBeLessThan(BUDGET_WIDEST_MS);
  });

  it("2,000 reads of each body inside the budget", () => {
    const { ms: eligMs } = timed(() => { for (let n = 0; n < 2000; n += 1) readAccessEligibility(n % 2 === 0 ? POSITIVE : ABSENT); });
    const { ms: navMs } = timed(() => { for (let n = 0; n < 2000; n += 1) readAccessSelfNavigation(n % 2 === 0 ? NAV_APP_ONLY : NAV_V2); });
    console.info(`accessSelf 2,000 reads: eligibility ${eligMs.toFixed(0)} ms, navigation ${navMs.toFixed(0)} ms (budget ${BUDGET_2000_READS_MS} ms each)`);
    expect(eligMs).toBeLessThan(BUDGET_2000_READS_MS);
    expect(navMs).toBeLessThan(BUDGET_2000_READS_MS);
    expect(serializedBytes(POSITIVE)).toBeLessThan(MIB);
  });

  it("a 70,000 character selector or grant ref is refused fast, not scanned", () => {
    for (const edit of [
      (b: Draft) => { b.workspace_id = "a".repeat(70_000); },
      (b: Draft) => { b.resource.id = "a".repeat(70_000); },
      (b: Draft) => { b.actions[0].grant_ref = "a".repeat(70_000); },
    ]) {
      const body = clone(POSITIVE);
      edit(body);
      const { value, ms } = timed(() => readAccessEligibility(body));
      expect(value).toBeNull();
      expect(ms).toBeLessThan(50);
    }
    const nav = clone(NAV_APP_ONLY);
    nav.workspace_id = "a".repeat(70_000);
    expect(timed(() => readAccessSelfNavigation(nav)).ms).toBeLessThan(50);
    expect(readAccessSelfNavigation(nav)).toBeNull();
  });
});

/* ═════════════════════════ L3 ═════════════════════════ */
interface Case { name: string; category: string; value: unknown; probe: string | null }
const enumsOf = (base: Draft, path: readonly (string | number)[], valid: readonly unknown[]): Case[] =>
  enumCases(base, path, valid.map(String)).filter((c) => !valid.includes(getPath(c.value, path)));

const ROWP = (field: string) => [...AT, field] as const;
const ELIG_ENUMS: Case[] = [
  ...enumsOf(POSITIVE, ["environment"], ["paper", "sandbox", "live"]),
  ...enumsOf(POSITIVE, ["resource", "kind"], ["ROOT", "PORTFOLIO", "ALPHA", "ALPHA_VERSION", "DEPLOYMENT", "ACCOUNT", "BINDING", "USER"]),
  ...enumsOf(POSITIVE, ["current_only"], [true]),
  ...enumsOf(POSITIVE, ["advisory_only"], [true]),
  ...enumsOf(POSITIVE, ROWP("action"), [...ELIGIBILITY_ACTIONS]),
  ...enumsOf(POSITIVE, ROWP("permission"), ["ALLOWED", "UNAVAILABLE"]),
  ...enumsOf(POSITIVE, ROWP("reason_class"), REASONS),
  ...enumsOf(POSITIVE, ROWP("public_copy_key"), REASONS),
  ...enumsOf(POSITIVE, ROWP("authority_mode"), AUTHORITIES),
  ...enumsOf(POSITIVE, ROWP("family_check"), [...ELIGIBILITY_FAMILY_CHECKS]),
  ...enumsOf(POSITIVE, ROWP("step_up_freshness"), ["NOT_CHECKED"]),
  ...enumsOf(POSITIVE, ROWP("challenge_availability"), ["NOT_CHECKED"]),
  ...enumsOf(POSITIVE, ROWP("command_readiness"), ["NOT_CHECKED"]),
];
const NAV_ENUMS: Case[] = [
  ...enumsOf(NAV_APP_ONLY, ["environment"], ["paper", "sandbox", "live"]),
  ...enumsOf(NAV_APP_ONLY, ["current_only"], [true]),
  ...enumsOf(NAV_APP_ONLY, ["advisory_only"], [true]),
  ...enumsOf(NAV_APP_ONLY, ["current_read_mode"], [...SELF_NAV_READ_MODES]),
  ...enumsOf(NAV_APP_ONLY, ["features", 0, "feature"], [SELF_NAV_FEATURES[0]]),
  ...enumsOf(NAV_APP_ONLY, ["features", 0, "state"], [...SELF_NAV_STATES]),
  ...enumsOf(NAV_APP_ONLY, ["features", 0, "authority_mode"], [...SELF_NAV_AUTHORITIES]),
  ...enumsOf(NAV_APP_ONLY, ["features", 0, "family_check"], ["NOT_CHECKED"]),
  ...enumsOf(NAV_APP_ONLY, ["features", 0, "source_readiness"], ["NOT_CHECKED"]),
  ...enumsOf(NAV_APP_ONLY, ["features", 0, "field_readiness"], ["NOT_CHECKED"]),
  ...enumsOf(NAV_APP_ONLY, ["features", 0, "command_readiness"], ["NOT_CHECKED"]),
  ...enumsOf(NAV_APP_ONLY, ["self_entry", "feature"], ["PROFILE_ACCESS"]),
  ...enumsOf(NAV_APP_ONLY, ["self_entry", "mode"], ["SELF_ONLY"]),
  ...enumsOf(NAV_APP_ONLY, ["self_entry", "permission"], ["ALLOWED"]),
  ...enumsOf(NAV_APP_ONLY, ["self_entry", "consumer_state"], ["AWAITING_CONSUMER_ROUTER"]),
];
const ELIG_PATHS: (readonly (string | number)[])[] = [
  ...["schema_version", "workspace_id", "environment", "resource", "current_only", "advisory_only", "observed_at_ms", "valid_until_ms", "actions"].map((k) => [k] as const),
  ["resource", "kind"], ["resource", "id"],
  ...["action", "permission", "reason_class", "public_copy_key", "grant_ref", "authority_mode", "step_up_required", "step_up_freshness", "challenge_availability", "command_readiness", "family_check"].map((k) => ROWP(k)),
];
const NAV_PATHS: (readonly (string | number)[])[] = [
  ...["schema_version", "workspace_id", "environment", "current_only", "advisory_only", "observed_at_ms", "valid_until_ms", "current_read_mode", "features", "self_entry"].map((k) => [k] as const),
  ...["feature", "state", "authority_mode", "family_check", "source_readiness", "field_readiness", "command_readiness"].map((k) => ["features", 0, k] as const),
  ...["feature", "mode", "permission", "route", "consumer_state"].map((k) => ["self_entry", k] as const),
];
const ELIG_NEG: Case[] = [
  ...ELIG_ENUMS,
  ...requiredCases(POSITIVE, ELIG_PATHS),
  ...integerCases(POSITIVE, ["observed_at_ms"]),
  ...integerCases(POSITIVE, ["valid_until_ms"]),
  ...stringCases(POSITIVE, ["workspace_id"]),
  ...stringCases(POSITIVE, ["resource", "id"]),
  ...stringCases(POSITIVE, [...AT, "grant_ref"]),
  ...arrayCases(POSITIVE, ["actions"], { idKey: "action" }),
  ...schemaVersionCases(POSITIVE, ["schema_version"], ACCESS_ELIGIBILITY_SCHEMA, [ACCESS_SELF_NAVIGATION_SCHEMA, "portal.access-effective.v1", "portal.self-eligibility.v2"]),
  ...pollutionCases(POSITIVE, [[], ["resource"], ["actions", 0]]),
];
const NAV_NEG: Case[] = [
  ...NAV_ENUMS,
  ...requiredCases(NAV_APP_ONLY, NAV_PATHS),
  ...integerCases(NAV_APP_ONLY, ["observed_at_ms"]),
  ...integerCases(NAV_APP_ONLY, ["valid_until_ms"]),
  ...stringCases(NAV_APP_ONLY, ["workspace_id"]),
  ...arrayCases(NAV_APP_ONLY, ["features"], { idKey: "feature" }),
  ...schemaVersionCases(NAV_APP_ONLY, ["schema_version"], ACCESS_SELF_NAVIGATION_SCHEMA, [ACCESS_ELIGIBILITY_SCHEMA, "portal.access-effective.v1", "portal.self-navigation.v2"]),
  ...pollutionCases(NAV_APP_ONLY, [[], ["features", 0], ["self_entry"]]),
];

function runNegatives(label: string, version: string, cases: Case[], read: (v: unknown) => unknown, violations: (v: unknown) => string[], known: (c: Case) => boolean) {
  describe(`L3 · negative · ${label}`, () => {
    it("reports the case counts", () => {
      const by = new Map<string, number>();
      for (const c of cases) by.set(c.category, (by.get(c.category) ?? 0) + 1);
      console.info(`accessSelf L3 ${label}: ${cases.length} cases (${[...by.entries()].map(([k, v]) => `${k} ${v}`).join(", ")})`);
      expect(cases.length).toBeGreaterThan(label === "eligibility" ? 200 : 150);
    });

    it.each(cases.map((c) => [c.name, c] as const))("%s", (_name, c) => {
      expect(() => read(c.value)).not.toThrow();
      const answer = read(c.value);
      expect(leaked(answer, c.probe)).toBe(false);
      expect(prototypeIsClean()).toBe(true);
      const invalid = violations(c.value).length > 0;
      const accepted = answer !== null && (answer as { kind: string }).kind !== "unsupported_shape";
      // An unsupported_shape is the only non-null refusal, and only for a body whose schema_version is not this one's.
      if (answer !== null && !accepted) expect(getPath(c.value, ["schema_version"])).not.toBe(version);
      if (accepted) expect(getPath(c.value, ["schema_version"])).toBe(version);
      // Accepted though the schema refuses it: only a documented gap.
      if (accepted && invalid) expect(known(c), `accepted though schema-invalid: ${c.name}`).toBe(true);
    });

    it("an unknown word is never a state: no enum case yields a read", () => {
      for (const c of cases.filter((x) => x.category === "unknown-enum")) {
        const answer = read(c.value) as { kind: string } | null;
        expect(answer === null || answer.kind === "unsupported_shape", c.name).toBe(true);
      }
    });

    it.each(rootCases().map((c) => [c.name, c] as const))("%s reads as nothing (malformed, or a typed unsupported_shape)", (_name, c) => {
      expect(() => read(c.value)).not.toThrow();
      const answer = read(c.value) as { kind: string; schemaVersion: string | null } | null;
      if (answer !== null) expect(answer).toEqual({ kind: "unsupported_shape", schemaVersion: null });
    });

    it("prints how much stricter or looser the reader is than the schema, by category", () => {
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
      console.info(`accessSelf L3 ${label} gap: reader accepts ${looser} of ${invalid} schema-invalid payloads; refuses ${stricter} schema-valid ones`);
      expect(invalid).toBeGreaterThan(label === "eligibility" ? 150 : 100);
      // Looser than the schema is a defect; stricter is allowed only for the documented cases.
      expect(looser).toBe(0);
    });
  });
}

const knownGap = (c: Case) => c.category === "prototype-pollution";
runNegatives("eligibility", ACCESS_ELIGIBILITY_SCHEMA, ELIG_NEG, readAccessEligibility, eligViolations, knownGap);
runNegatives("navigation", ACCESS_SELF_NAVIGATION_SCHEMA, NAV_NEG, readAccessSelfNavigation, navViolations, knownGap);

describe("L3 · where the reader is stricter than the schema, on purpose", () => {
  const rlo = String.fromCharCode(0x202e);
  const zwsp = String.fromCharCode(0x200b);
  it.each([
    ["whitespace-only workspace_id", (b: Draft) => { b.workspace_id = "   "; }],
    ["bidi override in resource.id", (b: Draft) => { b.resource.id = `portfolio${rlo}x`; }],
    ["zero-width in workspace_id", (b: Draft) => { b.workspace_id = `ws${zwsp}x`; }],
    ["bidi override in grant_ref", (b: Draft) => { b.actions[0].grant_ref = `acg${rlo}x`; }],
    ["workspace_id over 256 UTF-8 bytes (129 two-byte codepoints)", (b: Draft) => { b.workspace_id = "é".repeat(129); }],
    ["lone surrogate in resource.id", (b: Draft) => { b.resource.id = `p${String.fromCharCode(0xd800)}`; }],
  ])("%s: schema valid, reader refuses", (_name, change) => {
    const body = clone(POSITIVE);
    change(body);
    expect(eligViolations(body)).toEqual([]);
    expect(readAccessEligibility(body)).toBeNull();
  });
});

/* ═══════════════ defects in the contract (pinned, not fixed here) ═══════════════ */
describe("defects pinned (contract, not reader)", () => {
  /*
   * SE-1 (fixed by Codex in d0789674): the server only answers ALLOWED for a
   * resource kind the action supports (RULES[action].kinds) and answers
   * ACTION_TARGET_UNSUPPORTED for the rest, which the schema did not say. The
   * schema now publishes the table (28 target rules in `AccessEligibility.allOf`)
   * and the reader holds it (`ELIGIBILITY_ACTION_KINDS`, compared with the schema
   * in L0). The two former `it.fails` are ordinary tests: the schema and the
   * reader refuse both bodies, and still read the legal counterparts.
   */
  it("SE-1a (fixed): an ALLOWED portfolio.read on an ACCOUNT resource is refused by the schema and by the reader", () => {
    const body = clone(POSITIVE);
    body.resource.kind = "ACCOUNT";
    expect(eligViolations(body).length).toBeGreaterThan(0);
    expect(readAccessEligibility(body)).toBeNull();
    body.resource.kind = "PORTFOLIO";
    expect(eligViolations(body)).toEqual([]);
    expect(eligOf(body)).not.toBeNull();
  });

  it("SE-1b (fixed): ACTION_TARGET_UNSUPPORTED for a portfolio.read on a PORTFOLIO is refused by the schema and by the reader", () => {
    const body = clone(ABSENT);
    body.actions[0].reason_class = "ACTION_TARGET_UNSUPPORTED";
    body.actions[0].public_copy_key = "ACTION_TARGET_UNSUPPORTED";
    expect(eligViolations(body).length).toBeGreaterThan(0);
    expect(readAccessEligibility(body)).toBeNull();
    body.resource.kind = "ACCOUNT";
    expect(eligViolations(body)).toEqual([]);
    expect(eligOf(body)!.actions[0]).toMatchObject({ permission: "UNAVAILABLE", reasonClass: "ACTION_TARGET_UNSUPPORTED" });
  });

  /*
   * DEFECT SE-2 (contract): nothing in the schema ties the answer to the
   * question. A body for another resource or another environment is a valid body.
   * The reader cannot know the question, so `eligibilityAnswers` /
   * `navigationAnswers` exist; this pins that the READ alone does not.
   */
  it("SE-2: a valid body for another resource still reads (the caller must check eligibilityAnswers)", () => {
    const other = clone(POSITIVE);
    other.resource.id = "portfolio_another";
    expect(eligOf(other)).not.toBeNull();
    expect(eligibilityAnswers(eligOf(other)!, { workspaceId: "ws_TEST_ONLY", environment: "paper", resource: { kind: "PORTFOLIO", id: "portfolio_TEST_ONLY" }, actions: ["portfolio.read"] })).toBe(false);
  });
});
