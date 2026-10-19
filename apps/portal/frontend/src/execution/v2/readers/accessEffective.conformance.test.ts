/**
 * Reader conformance for `accessEffective.ts` (Rules 9.8.3, tiers L0 to L3).
 *
 * L0  `execution-access.synthetic.valid.json`, verbatim: the one effective
 *     body it ships (POLICY_PENDING, no grants), and the seventeen other bodies
 *     in the file (six of them, `portal.self-eligibility.v1` x2 and
 *     `portal.self-navigation.v1` x4, added by Codex e19ad906 for the C3 self
 *     reads, which this reader does not read), none of which may ever be read
 *     as an effective-access body. `AccessEffective` itself did not change.
 *     The file has no AVAILABLE body with grants; those four grants come from
 *     the e2e double (e2e/bffDoubleAccess.ts), which builds them on the
 *     canonical body, and they are named as such below.
 * L1  state matrices against an oracle written from the header contract:
 *       A  availability x reason x policy revision x researcher field policy
 *       B  grant: effect x selector x environments x validity x current x authority
 *       C  grants list: size x repeated id x one bad grant (anywhere voids all)
 *       D  selector id lists: size x repeat x control character
 *       E  owner recovery: only the contract constant reads
 *     Each maps to the documented UI state: a pending policy is never "no
 *     access granted", `current` is the server's word and is not recomputed
 *     from dates, an UNKNOWN authority never reads as ACCEPTED.
 * L2  200 grants, the 500 grant bound and ~1 MiB of selector ids (20 grants x 200 ids x 256 characters; 200 ids is the schema's maxItems). The read is
 *     not paged (the route answers the whole effective set); the bound
 *     MAX_GRANTS = 500 is what keeps it finite, and one grant over it voids
 *     the read.
 * L3  generated negatives; every case is refused or the typed
 *     `unsupported_shape`, never throws, never leaks its probe. The body is also
 *     judged against the published schema (execution-access.openapi.json,
 *     components/schemas/AccessEffective, through testkit validateAgainst):
 *       - every published canonical body, and every body the e2e double serves,
 *         validates AND is read;
 *       - the reader never accepts what the schema refuses, over the matrices
 *         and over the whole generated negative corpus (counted, see
 *         "L3 · schema agreement");
 *       - where the reader is stricter than the schema it is on purpose and the
 *         group is named: bidi/zero-width/whitespace-only ids (AE-2), the
 *         500-grant bound, the end-after-start interval, pending/reason pairing,
 *         QUALIFIED needs a ref, and the field-policy/reason grammar.
 *       - fixed here after this suite found them looser than the schema: AE-4 (more than 200
 *         selector ids) and AE-5 (an unnamed key anywhere: the schema is closed).
 *       - one named group is LOOSER on purpose: the open dotted `action` token
 *         (AE-3), see its test.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { ACCESS_DOUBLE_WORKSPACES, answerAccessEffective } from "../../../../e2e/bffDoubleAccess";
import { canonicalDigest, listCanonical, loadCanonical, SCHEMA_DIR } from "../testkit/loadCanonical";
import { cartesian, coverage, describeCoverage, dimension, dimensionOf, getPath, pairwise, setPath, type Draft } from "../testkit/matrix";
import {
  arrayCases, enumCases, integerCases, leaked, pollutionCases, prototypeIsClean, requiredCases, rootCases, schemaVersionCases, stringCases,
} from "../testkit/negative";
import { cloneRows, MIB, pad, serializedBytes, timed } from "../testkit/scale";
import { validateAgainst } from "../testkit/schema";
import {
  ACCESS_AVAILABILITIES,
  ACCESS_EFFECTIVE_SCHEMA,
  ACCESS_EFFECTS,
  ACCESS_ENVIRONMENTS,
  ACCESS_RESOURCE_KINDS,
  ACCESS_TS_AUTHORITIES,
  MAX_GRANTS,
  readAccessEffective,
  type AccessEffective,
} from "./accessEffective";

/** AccessSelector.ids / portfolio_ids: maxItems 200 in the published schema. */
const MAX_IDS = 200;

/* ── budgets (stated, generous: the suite shares a machine with other lanes) ── */
const BUDGET_200_GRANTS_MS = 300;
const BUDGET_500_GRANTS_MS = 500;
const BUDGET_1_MIB_MS = 800;

const FILE = "execution-access.synthetic";
const OPENAPI = "../openapi/execution-access.openapi.json";
const EFFECTIVE_SCHEMA_PTR = "/components/schemas/AccessEffective";
/**
 * The testkit checker (testkit/schema.ts) throws on the OpenAPI keyword `discriminator`, which
 * `AccessSelector` carries. It is an annotation (the four `oneOf` branches already pin `kind` with a
 * const), so the checker is given a byte-for-byte copy of the published document with only that key
 * removed, written to a temp dir. The published file is read, never written. FINDING for the testkit
 * owner: adding "discriminator" to IGNORED in testkit/schema.ts makes this copy unnecessary.
 */
const checkerDir = mkdtempSync(join(tmpdir(), "access-effective-schema-"));
const withoutDiscriminator = (node: unknown): unknown => {
  if (Array.isArray(node)) return node.map(withoutDiscriminator);
  if (typeof node !== "object" || node === null) return node;
  return Object.fromEntries(Object.entries(node).filter(([key]) => key !== "discriminator").map(([key, child]) => [key, withoutDiscriminator(child)]));
};
const OPENAPI_COPY = join(checkerDir, "execution-access.openapi.json");
writeFileSync(OPENAPI_COPY, JSON.stringify(withoutDiscriminator(JSON.parse(readFileSync(join(SCHEMA_DIR, OPENAPI), "utf8")))));
afterAll(() => rmSync(checkerDir, { recursive: true, force: true }));
/** Violations of the published `AccessEffective` schema; empty when the body conforms. */
const schemaViolations = (value: unknown): string[] => validateAgainst(OPENAPI_COPY, EFFECTIVE_SCHEMA_PTR, value);
const digestBefore = canonicalDigest(FILE);
afterAll(() => {
  expect(canonicalDigest(FILE)).toBe(digestBefore);
});

const canonical = loadCanonical<{ lane: string; cases: { type: string; value: Draft }[] }>(FILE);
const PENDING: Draft = canonical.cases.find((entry) => entry.type === "AccessEffective")!.value;
const clone = <T,>(value: T): T => structuredClone(value);

/** The double's AVAILABLE answer: the canonical body with four synthetic grants (not an L0 file). */
const GRANTED: Draft = clone(answerAccessEffective(
  "GET", "/api/admin/profile-access/v2/effective", new URLSearchParams({ workspace_id: ACCESS_DOUBLE_WORKSPACES.available }),
)!.body);
const GRANT: Draft = clone(GRANTED.grants[0]);

function effectiveOf(raw: unknown): AccessEffective | null {
  const read = readAccessEffective(raw);
  return read !== null && read.kind === "effective" ? read.effective : null;
}

/* ═════════════════════════ L0 ═════════════════════════ */
describe("L0 · canonical, verbatim", () => {
  it("the file is the synthetic lane with the cases this suite thinks it has", () => {
    expect(canonical.lane).toMatch(/TEST_ONLY/);
    expect(canonical.cases.map((c) => c.type)).toEqual([
      "AccessEligibility", "AccessEligibility", "AccessSelfNavigation", "AccessSelfNavigation", "AccessSelfNavigation", "AccessSelfNavigation",
      "AccessEffective", "AccessPreviewRequest", "AccessPreview", "AccessRevokePreview", "AccessRevokePreview", "AccessReceipt", "AccessReceipt",
      "AccessReceipt", "AccessReceipt", "AccessReceipt", "AccessReceipt", "AccessReceipt",
    ]);
    // Exactly one effective body, so `PENDING` (found by type) is the only one the reader may read.
    expect(canonical.cases.filter((c) => c.type === "AccessEffective")).toHaveLength(1);
  });

  it("the two C3 self-read families are other contracts: their schema_versions are named, and neither reads as effective access", () => {
    const eligibility = canonical.cases.filter((c) => c.type === "AccessEligibility");
    const navigation = canonical.cases.filter((c) => c.type === "AccessSelfNavigation");
    expect(eligibility.map((c) => c.value.schema_version)).toEqual(["portal.self-eligibility.v1", "portal.self-eligibility.v1"]);
    expect(navigation.map((c) => c.value.schema_version)).toEqual(Array(4).fill("portal.self-navigation.v1"));
    for (const entry of [...eligibility, ...navigation]) {
      expect(readAccessEffective(entry.value)).toEqual({ kind: "unsupported_shape", schemaVersion: entry.value.schema_version });
    }
  });

  it("the effective body reads exactly as published: pending policy, no grants, owner recovery off", () => {
    const body = effectiveOf(PENDING)!;
    expect(body).toEqual({
      workspaceId: PENDING.workspace_id, userId: PENDING.user_id, policyRevision: null, availability: "POLICY_PENDING", reasonCode: "POLICY_PENDING",
      grants: [], researcherFieldPolicy: { state: "PENDING", policyRef: null },
      ownerRecovery: { enabled: false, reasonCode: "OWNER_RECOVERY_NOT_APPROVED" },
    });
  });

  it("no other body in the file is ever read as effective access; each is the typed unsupported_shape", () => {
    for (const entry of canonical.cases.filter((c) => c.type !== "AccessEffective")) {
      const read = readAccessEffective(entry.value);
      expect(read?.kind, entry.type).toBe("unsupported_shape");
      expect((read as { schemaVersion: string | null }).schemaVersion, entry.type).toBe(typeof entry.value.schema_version === "string" ? entry.value.schema_version : null);
    }
  });

  it("the double's four grants keep their published words, ids and times", () => {
    const body = effectiveOf(GRANTED)!;
    expect(body.availability).toBe("AVAILABLE");
    expect(body.grants.map((g) => g.grantId)).toEqual(GRANTED.grants.map((g: Draft) => g.grant_id));
    expect(body.grants.map((g) => g.action)).toEqual(GRANTED.grants.map((g: Draft) => g.action));
    expect(body.grants.map((g) => g.validFrom)).toEqual(GRANTED.grants.map((g: Draft) => g.valid_from_ms));
    expect(body.grants.map((g) => g.validUntil)).toEqual(GRANTED.grants.map((g: Draft) => g.valid_until_ms));
  });

  it("the closed words the reader holds are the ones the canonical cases use", () => {
    const receipts = canonical.cases.filter((c) => c.type === "AccessReceipt").map((c) => c.value.outcome);
    expect(receipts.length).toBeGreaterThan(5);
    expect([...ACCESS_AVAILABILITIES]).toEqual(["AVAILABLE", "POLICY_PENDING"]);
    expect([...ACCESS_EFFECTS]).toEqual(["ALLOW", "DENY"]);
    expect([...ACCESS_ENVIRONMENTS]).toEqual(["paper", "sandbox", "live"]);
    expect([...ACCESS_TS_AUTHORITIES]).toEqual(["NOT_REQUIRED", "PENDING", "ACCEPTED", "REJECTED", "UNKNOWN"]);
    // The access action preview in the same file names a resource kind the reader also holds.
    const preview = canonical.cases.find((c) => c.type === "AccessPreviewRequest")!.value;
    expect(ACCESS_RESOURCE_KINDS).toContain(preview.change.selector.resource_kind);
  });
});

/* ═════════════════════════ L1 ═════════════════════════ */
describe("L1 · matrix A · availability x reason x revision x researcher field policy", () => {
  const POLICY = (state: string, ref: string | null) => ({ label: `${state}/${ref === null ? "no-ref" : "ref"}`, apply: (d: Draft) => { d.researcher_field_policy = { state, policy_ref: ref }; } });
  const DIMS = [
    dimension("availability", ["availability"], [...ACCESS_AVAILABILITIES]),
    dimension("reason_code", ["reason_code"], [null, "POLICY_PENDING"]),
    dimension("policy_revision", ["policy_revision"], [null, "p1_TEST_ONLY"]),
    dimensionOf("field_policy", [POLICY("PENDING", null), POLICY("PENDING", "ref_1"), POLICY("QUALIFIED", "ref_1"), POLICY("QUALIFIED", null)]),
  ];
  const states = cartesian(PENDING, DIMS);
  const accept = (p: Record<string, string>) =>
    (p.availability === "POLICY_PENDING") === (p.reason_code !== "null") && p.field_policy !== "QUALIFIED/no-ref";

  it("prints the matrix size", () => {
    console.info(describeCoverage("accessEffective A (availability) cartesian", coverage(DIMS, states)));
    expect(states).toHaveLength(2 * 2 * 2 * 4);
    expect(states.filter((s) => accept(s.picks))).toHaveLength(2 * 2 * 3);
  });

  it.each(states.map((s) => [s.name, s] as const))("%s", (_name, state) => {
    const body = effectiveOf(state.value);
    expect(body !== null).toBe(accept(state.picks));
    if (body === null) return;
    // The reader never reads what the schema refuses.
    expect(schemaViolations(state.value)).toEqual([]);
    expect(body.availability).toBe(state.picks.availability);
    // A pending policy always says why, and an available one never carries a reason.
    expect(body.reasonCode === null).toBe(body.availability === "AVAILABLE");
    // Pending with no grants is a pending policy, never "nothing is granted to you": the screen decides from `availability`.
    if (body.availability === "POLICY_PENDING") expect(body.reasonCode).toBe("POLICY_PENDING");
    expect(body.researcherFieldPolicy.state).toBe(state.picks.field_policy.split("/")[0]);
    if (body.researcherFieldPolicy.state === "QUALIFIED") expect(body.researcherFieldPolicy.policyRef).not.toBeNull();
  });
});

describe("L1 · matrix B · one grant", () => {
  const T0 = 1_790_000_000_000;
  const SELECTORS: Record<string, Draft> = {
    EXPLICIT_RESOURCE_SET: { kind: "EXPLICIT_RESOURCE_SET", resource_kind: "PORTFOLIO", ids: ["pf_a", "pf_b"] },
    OWN_ALPHA: { kind: "OWN_ALPHA" },
    PORTFOLIO_MEMBERSHIP: { kind: "PORTFOLIO_MEMBERSHIP", portfolio_ids: ["pf_a"] },
    ROOT_SCOPE: { kind: "ROOT_SCOPE", root_id: "root_a" },
  };
  const ENVS: Record<string, string[]> = { paper: ["paper"], all: ["paper", "sandbox", "live"], live: ["live"], "live+paper": ["live", "paper"] };
  const UNTIL: Record<string, number | null> = { open: null, after: T0 + 1, equal: T0, before: T0 - 1 };
  const DIMS = [
    dimension("effect", ["grants", 0, "effect"], [...ACCESS_EFFECTS]),
    dimensionOf("selector", Object.entries(SELECTORS).map(([label, sel]) => ({ label, apply: (d: Draft) => { d.grants[0].selector = clone(sel); } }))),
    dimensionOf("environments", Object.entries(ENVS).map(([label, envs]) => ({ label, apply: (d: Draft) => { d.grants[0].environments = [...envs]; } }))),
    dimensionOf("valid_until", Object.entries(UNTIL).map(([label, ms]) => ({ label, apply: (d: Draft) => { d.grants[0].valid_from_ms = T0; d.grants[0].valid_until_ms = ms; } }))),
    dimension("current", ["grants", 0, "current"], [true, false]),
    dimension("ts_authority", ["grants", 0, "ts_authority"], [...ACCESS_TS_AUTHORITIES]),
  ];
  const base = clone(GRANTED);
  base.grants = [clone(GRANT)];
  const states = cartesian(base, DIMS);
  const accept = (p: Record<string, string>) => p.valid_until === "open" || p.valid_until === "after";

  it("prints the matrix size", () => {
    console.info(describeCoverage("accessEffective B (grant) cartesian", coverage(DIMS, states)));
    expect(states).toHaveLength(2 * 4 * 4 * 4 * 2 * 5);
    expect(states.filter((s) => accept(s.picks))).toHaveLength(2 * 4 * 4 * 2 * 2 * 5);
  });

  it.each(states.map((s) => [s.name, s] as const))("%s", (_name, state) => {
    const body = effectiveOf(state.value);
    expect(body !== null).toBe(accept(state.picks));
    if (body === null) return;
    expect(schemaViolations(state.value)).toEqual([]);
    const grant = body.grants[0]!;
    const want = state.value.grants[0];
    // Words pass through unchanged: an UNKNOWN authority stays UNKNOWN, a DENY stays a DENY.
    expect(grant.effect).toBe(want.effect);
    expect(grant.tsAuthority).toBe(want.ts_authority);
    expect(grant.selector.kind).toBe(want.selector.kind);
    expect(grant.environments).toEqual(want.environments);
    // `current` is the server's evaluation; it is never recomputed from the dates beside it.
    expect(grant.current).toBe(want.current);
    expect(grant.validUntil).toBe(want.valid_until_ms);
    // The interval is end-exclusive and never empty.
    if (grant.validUntil !== null) expect(grant.validUntil).toBeGreaterThan(grant.validFrom);
    // Only a grant that is both ALLOW and current could read as "granted"; the reader exposes both facts, not a derived verdict.
    expect(Object.keys(grant).filter((k) => /granted|allowed|active|effective/i.test(k))).toEqual([]);
  });

  it("pairwise subset of the same axes meets every pair in fewer states", () => {
    const pairs = pairwise(base, DIMS, { exclude: (p) => !accept(p) });
    const cover = coverage(DIMS, pairs, { exclude: (p) => !accept(p) });
    console.info(describeCoverage("accessEffective B (grant) pairwise over valid states", cover));
    expect(cover.pairsCovered).toBe(cover.pairsPossible);
    expect(pairs.length).toBeLessThan(states.filter((s) => accept(s.picks)).length);
  });
});

describe("L1 · matrix C · the grants list (size x repeated id x one bad grant)", () => {
  const sizes = [0, 1, 2, MAX_GRANTS, MAX_GRANTS + 1];
  const build = (n: number): Draft[] => cloneRows(GRANT, n, (g, i) => { g.grant_id = `acg_${pad(i)}`; });
  const DIMS = [
    dimensionOf("size", sizes.map((n) => ({ label: String(n), apply: (d: Draft) => { d.grants = build(n); } }))),
    dimensionOf("repeat", [
      { label: "none", apply: () => undefined },
      { label: "last repeats first", apply: (d: Draft) => { if (d.grants.length > 1) d.grants[d.grants.length - 1].grant_id = d.grants[0].grant_id; } },
    ]),
    dimensionOf("bad", [
      { label: "none", apply: () => undefined },
      { label: "first", apply: (d: Draft) => { if (d.grants.length > 0) d.grants[0].action = "NOT A TOKEN"; } },
      { label: "last", apply: (d: Draft) => { if (d.grants.length > 0) d.grants[d.grants.length - 1].effect = "MAYBE"; } },
    ]),
  ];
  const states = cartesian(GRANTED, DIMS);
  const accept = (p: Record<string, string>) => {
    const n = Number(p.size);
    const repeats = p.repeat !== "none" && n > 1;
    const bad = p.bad !== "none" && n > 0;
    return n <= MAX_GRANTS && !repeats && !bad;
  };

  it("prints the matrix size", () => {
    console.info(describeCoverage("accessEffective C (grants list) cartesian", coverage(DIMS, states)));
    expect(states).toHaveLength(5 * 2 * 3);
  });

  it.each(states.map((s) => [s.name, s] as const))("%s", (_name, state) => {
    const body = effectiveOf(state.value);
    expect(body !== null).toBe(accept(state.picks));
    // One bad grant voids the whole read: no partial list is ever handed to "Granted to you".
    if (body !== null) {
      expect(body.grants).toHaveLength(Number(state.picks.size));
      expect(schemaViolations(state.value)).toEqual([]);
    }
  });
});

describe("L1 · matrix D · selector id lists", () => {
  const kinds: Record<string, { selector: (ids: string[]) => Draft }> = {
    EXPLICIT_RESOURCE_SET: { selector: (ids) => ({ kind: "EXPLICIT_RESOURCE_SET", resource_kind: "PORTFOLIO", ids }) },
    PORTFOLIO_MEMBERSHIP: { selector: (ids) => ({ kind: "PORTFOLIO_MEMBERSHIP", portfolio_ids: ids }) },
  };
  const ids = (n: number): string[] => Array.from({ length: n }, (_, i) => `id_${pad(i)}`);
  const DIMS = [
    dimensionOf("kind", Object.keys(kinds).map((k) => ({ label: k, apply: () => undefined }))),
    dimensionOf("count", [0, 1, 2, MAX_IDS, MAX_IDS + 1].map((n) => ({ label: String(n), apply: () => undefined }))),
    dimensionOf("repeat", ["none", "twice"].map((label) => ({ label, apply: () => undefined }))),
    dimensionOf("text", ["plain", "control", "empty", "256", "257"].map((label) => ({ label, apply: () => undefined }))),
  ];
  const states = cartesian(GRANTED, DIMS).map((s) => {
    const list = ids(Number(s.picks.count));
    if (list.length > 0) {
      if (s.picks.text === "control") list[0] = "a\u0007b";
      if (s.picks.text === "empty") list[0] = "";
      if (s.picks.text === "256") list[0] = "x".repeat(256);
      if (s.picks.text === "257") list[0] = "x".repeat(257);
    }
    if (s.picks.repeat === "twice" && list.length > 1) list[list.length - 1] = list[0]!;
    const value = clone(GRANTED);
    value.grants = [{ ...clone(GRANT), selector: kinds[s.picks.kind]!.selector(list) }];
    return { ...s, value, list };
  });
  const accept = (p: Record<string, string>) => {
    const n = Number(p.count);
    if (n < 1 || n > MAX_IDS) return false;
    if (p.repeat === "twice" && n > 1) return false;
    return p.text === "plain" || p.text === "256";
  };

  it("prints the matrix size", () => {
    console.info(`accessEffective D (selector ids): ${states.length} states, ${states.filter((s) => accept(s.picks)).length} accepted`);
    expect(states).toHaveLength(2 * 5 * 2 * 5);
  });

  it.each(states.map((s) => [s.name, s] as const))("%s", (_name, state) => {
    const body = effectiveOf(state.value);
    expect(body !== null).toBe(accept(state.picks));
    if (body === null) return;
    expect(schemaViolations(state.value)).toEqual([]);
    const sel = body.grants[0]!.selector;
    const got = sel.kind === "EXPLICIT_RESOURCE_SET" ? sel.ids : sel.kind === "PORTFOLIO_MEMBERSHIP" ? sel.portfolioIds : [];
    expect([...got]).toEqual(state.list);
  });
});

describe("L1 · matrix E · owner recovery is the contract constant or nothing", () => {
  const ENABLED = [false, true, "false", 0, null, "ABSENT", [] as unknown[], {}] as const;
  const REASON = ["OWNER_RECOVERY_NOT_APPROVED", "OWNER_RECOVERY_APPROVED", "", null, "owner_recovery_not_approved", "ABSENT"] as const;
  const cases = ENABLED.flatMap((enabled) => REASON.map((reason) => ({ enabled, reason })));

  it("prints the matrix size", () => {
    console.info(`accessEffective E (owner recovery): ${cases.length} states, 1 accepted`);
    expect(cases).toHaveLength(8 * 6);
  });

  it.each(cases.map((c) => [`${JSON.stringify(c.enabled)} / ${JSON.stringify(c.reason)}`, c] as const))("enabled=%s", (_name, c) => {
    const body = clone(PENDING);
    if (c.enabled === "ABSENT") delete body.owner_recovery.enabled;
    else body.owner_recovery.enabled = c.enabled;
    if (c.reason === "ABSENT") delete body.owner_recovery.reason_code;
    else body.owner_recovery.reason_code = c.reason;
    const read = effectiveOf(body);
    if (read !== null) expect(schemaViolations(body)).toEqual([]);
    const exact = c.enabled === false && c.reason === "OWNER_RECOVERY_NOT_APPROVED";
    expect(read !== null).toBe(exact);
    if (read !== null) expect(read.ownerRecovery).toEqual({ enabled: false, reasonCode: "OWNER_RECOVERY_NOT_APPROVED" });
  });
});

/* ═════════════════════════ L2 ═════════════════════════ */
describe("L2 · scale", () => {
  const grants = (n: number, idsEach = 2, idLength = 12): Draft[] => cloneRows(GRANT, n, (g, i) => {
    g.grant_id = `acg_${pad(i)}`;
    g.selector = { kind: "EXPLICIT_RESOURCE_SET", resource_kind: "PORTFOLIO", ids: Array.from({ length: idsEach }, (_, k) => `${pad(i)}_${k}`.padEnd(idLength, "x")) };
  });
  const withGrants = (list: Draft[]): Draft => ({ ...clone(GRANTED), grants: list });

  it("reads 200 grants inside the budget and keeps every one, in order", () => {
    const body = withGrants(grants(200));
    expect(schemaViolations(body)).toEqual([]);
    const { value, ms } = timed(() => effectiveOf(body));
    console.info(`accessEffective 200 grants (${(serializedBytes(body) / 1024).toFixed(0)} KiB): ${ms.toFixed(0)} ms (budget ${BUDGET_200_GRANTS_MS} ms)`);
    expect(value!.grants.map((g) => g.grantId)).toEqual(body.grants.map((g: Draft) => g.grant_id));
    expect(ms).toBeLessThan(BUDGET_200_GRANTS_MS);
  });

  it("reads the bound itself (500) and refuses one over it; the read is not paged", () => {
    const at = withGrants(grants(MAX_GRANTS));
    expect(schemaViolations(at)).toEqual([]);
    const { value, ms } = timed(() => effectiveOf(at));
    console.info(`accessEffective ${MAX_GRANTS} grants: ${ms.toFixed(0)} ms (budget ${BUDGET_500_GRANTS_MS} ms)`);
    expect(value!.grants).toHaveLength(MAX_GRANTS);
    expect(ms).toBeLessThan(BUDGET_500_GRANTS_MS);
    // One over the reader bound is still inside the schema (maxItems 10000): the bound is the reader's own, counted as stricter.
    expect(schemaViolations(withGrants(grants(MAX_GRANTS + 1)))).toEqual([]);
    expect(effectiveOf(withGrants(grants(MAX_GRANTS + 1)))).toBeNull();
    // No cursor field is read: a body that carries one is not this contract (additionalProperties: false), so it is refused, not read unpaged.
    expect(readAccessEffective({ ...at, next_cursor: "x" })).toBeNull();
  });

  it("reads ~1 MiB of selector ids (the widest legal ids, the 200-id schema bound) inside the budget", () => {
    const body = withGrants(grants(20, MAX_IDS, 256));
    const bytes = serializedBytes(body);
    const { value, ms } = timed(() => effectiveOf(body));
    console.info(`accessEffective ${(bytes / MIB).toFixed(2)} MiB, 20 grants x 200 ids: ${ms.toFixed(0)} ms (budget ${BUDGET_1_MIB_MS} ms)`);
    expect(bytes).toBeGreaterThan(0.9 * MIB);
    expect(value).not.toBeNull();
    expect(ms).toBeLessThan(BUDGET_1_MIB_MS);
  });

  it("a 70,000 character text anywhere is refused fast, not scanned", () => {
    for (const path of [["workspace_id"], ["user_id"], ["grants", 0, "grant_id"], ["grants", 0, "revision"], ["policy_revision"]] as const) {
      const body = clone(GRANTED);
      setPath(body, path, "a".repeat(70_000));
      const { value, ms } = timed(() => effectiveOf(body));
      expect(value, path.join(".")).toBeNull();
      expect(ms, path.join(".")).toBeLessThan(100);
    }
  });
});

/* ═════════════════════════ L3 ═════════════════════════ */
interface Case { name: string; category: string; value: unknown; probe: string | null }
const G0 = ["grants", 0] as const;
/** enumCases lower-cases the first valid word; where that is already the word (`paper`) the case is the base, not a negative. */
const enumsOf = (path: readonly (string | number)[], valid: readonly string[]): Case[] =>
  enumCases(GRANTED, path, valid).filter((c) => !valid.includes(getPath(c.value, path) as string));
const ENUMS: Case[] = [
  ...enumsOf(["availability"], ACCESS_AVAILABILITIES),
  ...enumsOf([...G0, "effect"], ACCESS_EFFECTS),
  ...enumsOf([...G0, "ts_authority"], ACCESS_TS_AUTHORITIES),
  ...enumsOf([...G0, "environments", 0], ACCESS_ENVIRONMENTS),
  ...enumsOf([...G0, "selector", "kind"], ["EXPLICIT_RESOURCE_SET", "OWN_ALPHA", "PORTFOLIO_MEMBERSHIP", "ROOT_SCOPE"]),
  ...enumsOf([...G0, "selector", "resource_kind"], ACCESS_RESOURCE_KINDS),
  ...enumsOf(["researcher_field_policy", "state"], ["PENDING", "QUALIFIED"]),
  ...enumsOf(["owner_recovery", "reason_code"], ["OWNER_RECOVERY_NOT_APPROVED"]),
];
const INTEGERS: Case[] = [
  ...integerCases(GRANTED, [...G0, "valid_from_ms"]),
  ...integerCases(GRANTED, [...G0, "valid_until_ms"]),
];
const STRINGS: Case[] = [
  ...stringCases(GRANTED, ["workspace_id"]),
  ...stringCases(GRANTED, ["user_id"]),
  ...stringCases(GRANTED, ["policy_revision"]),
  ...stringCases(GRANTED, ["reason_code"]),
  ...stringCases(GRANTED, [...G0, "grant_id"]),
  ...stringCases(GRANTED, [...G0, "action"]),
  ...stringCases(GRANTED, [...G0, "revision"]),
  ...stringCases(GRANTED, [...G0, "selector", "ids", 0]),
];
const ACTIONS = ["Portfolio.read", "portfolio", "portfolio.", ".read", "portfolio..read", "portfolio.Read", "portfolio.read ", " portfolio.read", "portfolio.read\n", "portfolio-read", "portfolio.re ad", "1portfolio.read", "portfolio.read".padEnd(129, "x")];
const ACTION_CASES: Case[] = ACTIONS.map((value) => ({ name: `action <- ${JSON.stringify(value)}`, category: "malformed-decimal", value: (() => { const b = clone(GRANTED); b.grants[0].action = value; return b; })(), probe: null }));
const ARRAYS: Case[] = [
  ...arrayCases(GRANTED, ["grants"], { idKey: "grant_id" }),
  ...arrayCases(GRANTED, [...G0, "environments"]),
  ...arrayCases(GRANTED, [...G0, "selector", "ids"]),
];
const REQUIRED: Case[] = [
  ...requiredCases(GRANTED, [["schema_version"], ["workspace_id"], ["user_id"], ["policy_revision"], ["availability"], ["reason_code"], ["grants"], ["researcher_field_policy"], ["owner_recovery"],
    ["researcher_field_policy", "state"], ["researcher_field_policy", "policy_ref"], ["owner_recovery", "enabled"], ["owner_recovery", "reason_code"],
    [...G0, "grant_id"], [...G0, "action"], [...G0, "effect"], [...G0, "selector"], [...G0, "environments"], [...G0, "valid_from_ms"], [...G0, "valid_until_ms"],
    [...G0, "revision"], [...G0, "current"], [...G0, "ts_authority"], [...G0, "selector", "kind"], [...G0, "selector", "resource_kind"], [...G0, "selector", "ids"]]),
];
const SCHEMA_SWAP = schemaVersionCases(GRANTED, ["schema_version"], ACCESS_EFFECTIVE_SCHEMA, ["portal.access-preview.v1", "portal.access-operation.v1", "portal.access-effective.v2"]);
const POLLUTION = pollutionCases(GRANTED, [[], [...G0], [...G0, "selector"], ["researcher_field_policy"], ["owner_recovery"]]);
const ALL_NEG: Case[] = [...ENUMS, ...INTEGERS, ...STRINGS, ...ACTION_CASES, ...ARRAYS, ...REQUIRED, ...SCHEMA_SWAP, ...POLLUTION];

/** Cases that are legitimately accepted: a nullable field set to null / a shorter list of valid items. */
const LEGIT: ((c: Case) => boolean)[] = [
  (c) => /^null-vs-absent: (policy_revision|grants\.0\.valid_until_ms|researcher_field_policy\.policy_ref) <- null/.test(c.name),
  (c) => /^null-vs-absent: reason_code <- null/.test(c.name), // AVAILABLE carries no reason
  (c) => c.category === "truncated", // a shorter list of valid items is a valid list
  (c) => /^missing-required: grants\.0\.(selector\.ids|environments)\.\d+ <- absent/.test(c.name),
  (c) => c.category === "prototype-pollution",
];
/**
 * Accepted although the header contract refuses it; each has a DEFECT below.
 * AE-1 (negative clocks) was fixed by F5c, AE-2 (whitespace/bidi ids) by the FE display-safety
 * defence in `opaque()`; nothing is accepted beyond the contract any more.
 */
const KNOWN_GAPS: ((c: Case) => boolean)[] = [];

describe("L3 · negative", () => {
  it("reports the case counts", () => {
    const by = new Map<string, number>();
    for (const c of ALL_NEG) by.set(c.category, (by.get(c.category) ?? 0) + 1);
    console.info(`accessEffective L3: ${ALL_NEG.length} cases (${[...by.entries()].map(([k, v]) => `${k} ${v}`).join(", ")}), ${rootCases().length} root cases`);
    expect(ALL_NEG.length).toBeGreaterThan(300);
  });

  it.each(ALL_NEG.map((c) => [c.name, c] as const))("%s", (_name, c) => {
    expect(() => readAccessEffective(c.value)).not.toThrow();
    const read = readAccessEffective(c.value);
    expect(leaked(read, c.probe)).toBe(false);
    expect(prototypeIsClean()).toBe(true);
    if (c.category === "schema-swapped") {
      expect(read === null || read.kind === "unsupported_shape").toBe(true);
      return;
    }
    if (read === null || read.kind === "unsupported_shape") return;
    expect(LEGIT.some((f) => f(c)) || KNOWN_GAPS.some((f) => f(c)), `accepted: ${c.name}`).toBe(true);
    if (c.category === "prototype-pollution") expect(read).toEqual(readAccessEffective(GRANTED));
  });

  it("an unknown word never reads as a grant state: no enum case yields an effective body", () => {
    for (const c of ENUMS) {
      const read = readAccessEffective(c.value);
      // `owner_recovery.reason_code` and `researcher_field_policy.state` words are enums too.
      expect(read === null || read.kind === "unsupported_shape", c.name).toBe(true);
    }
  });

  it.each(rootCases().map((c) => [c.name, c] as const))("%s is never an effective body", (_name, c) => {
    expect(() => readAccessEffective(c.value)).not.toThrow();
    const read = readAccessEffective(c.value);
    expect(read === null || read.kind === "unsupported_shape").toBe(true);
    if (typeof c.value !== "object" || c.value === null) expect(read).toBeNull();
  });

  it("a body for another user or workspace is a different read, never repaired", () => {
    const other = clone(GRANTED);
    other.user_id = "usr_someone_else";
    expect(effectiveOf(other)!.userId).toBe("usr_someone_else");
    expect(effectiveOf(other)!.userId).not.toBe(GRANTED.user_id);
  });
});

/* ═════════════════════════ L3 · schema agreement ═════════════════════════ */
describe("L3 · schema agreement (the published AccessEffective schema, via testkit validateAgainst)", () => {
  /** Every body any published canonical fixture carries under this schema_version, found by walking the whole file. */
  const publishedBodies = (): { file: string; path: string; body: Draft }[] => {
    const found: { file: string; path: string; body: Draft }[] = [];
    const walk = (node: unknown, file: string, path: string): void => {
      if (Array.isArray(node)) node.forEach((item, index) => walk(item, file, `${path}[${index}]`));
      else if (typeof node === "object" && node !== null) {
        const record = node as Draft;
        if (record.schema_version === ACCESS_EFFECTIVE_SCHEMA) found.push({ file, path, body: record });
        else for (const [key, child] of Object.entries(record)) walk(child, file, `${path}.${key}`);
      }
    };
    for (const file of listCanonical()) walk(loadCanonical(file), file, "$");
    return found;
  };
  const double = (workspace: string): Draft => answerAccessEffective(
    "GET", "/api/admin/profile-access/v2/effective", new URLSearchParams({ workspace_id: workspace }),
  )!.body;

  it("every published canonical body validates against the schema and is read", () => {
    const bodies = publishedBodies();
    console.info(`accessEffective schema: ${bodies.length} published canonical body(ies): ${bodies.map((b) => `${b.file}${b.path}`).join(", ")}`);
    expect(bodies.length).toBeGreaterThanOrEqual(1);
    for (const { file, path, body } of bodies) {
      expect(schemaViolations(body), `${file}${path}`).toEqual([]);
      expect(effectiveOf(body), `${file}${path}`).not.toBeNull();
    }
  });

  it("the AVAILABLE-with-grants body of the e2e double validates against the schema and is read, grant for grant", () => {
    expect(schemaViolations(GRANTED)).toEqual([]);
    const body = effectiveOf(GRANTED)!;
    expect(body).not.toBeNull();
    expect(body.availability).toBe("AVAILABLE");
    expect(body.grants).toHaveLength(GRANTED.grants.length);
    expect(GRANTED.grants.length).toBeGreaterThanOrEqual(4);
  });

  it.each(["pending", "available", "empty", "otherUser"] as const)("every 200 answer of the double (%s) validates and is read", (state) => {
    const body = double(ACCESS_DOUBLE_WORKSPACES[state]);
    expect(schemaViolations(body), state).toEqual([]);
    expect(effectiveOf(body), state).not.toBeNull();
  });

  it("the double's 'malformed' body is refused by the schema (action outside the enum) and by the reader", () => {
    const body = double(ACCESS_DOUBLE_WORKSPACES.malformed);
    expect(schemaViolations(body).join()).toMatch(/action/);
    expect(readAccessEffective(body)).toBeNull();
  });

  /** Reader and schema judge one payload; the pair is what the counts below group. */
  const judge = (value: unknown) => {
    const read = readAccessEffective(value);
    return { invalid: schemaViolations(value).length > 0, accepted: read !== null && read.kind !== "unsupported_shape" };
  };

  /**
   * Looser on purpose, AE-3: `action` is an open dotted token in the reader (header comment), the
   * schema pins the 59-name enum. A well-formed name outside the enum is schema-invalid and read.
   * The generated corpus has none of these (every malformed action it builds is refused by both);
   * the test below pins the group by hand so a change of that choice is deliberate.
   */
  const LOOSER_ON_PURPOSE: ((value: Draft) => boolean)[] = [];

  /**
   * Schema-valid, reader refuses, found in the generated corpus. Each group is a documented FE rule, never an
   * accident, and the counts are pinned so a new accidental refusal (or a lost one) is a red test.
   * Rules that the corpus does not generate (interval order, QUALIFIED needs a ref, reason token grammar, the
   * 500 bound) are pinned by hand in "stricter than the schema, on purpose" below.
   */
  const STRICTER_GROUPS: { name: string; count: number; test: (c: Case) => boolean }[] = [
    { name: "duplicate grant_id (the schema states no uniqueness on grants)", count: 1, test: (c) => c.category === "duplicate-id" },
    { name: "reason_code present while AVAILABLE (pairing: POLICY_PENDING iff reason_code)", count: 2, test: (c) => /^huge-string: reason_code <-/.test(c.name) },
    { name: "AE-2 display safety on patterned ids: whitespace-only or bidi override", count: 8, test: (c) => /^huge-string: (workspace_id|user_id|grants\.0\.grant_id|grants\.0\.selector\.ids\.0) <-/.test(c.name) },
    { name: "AE-2 on strings the schema leaves unpatterned (policy_revision, revision): whitespace-only, bidi, NUL", count: 6, test: (c) => /^huge-string: (policy_revision|grants\.0\.revision) <-/.test(c.name) },
  ];

  const corpus = ALL_NEG.filter((c) => c.category !== "prototype-pollution" && c.category !== "schema-swapped");

  it("reader never accepts what the schema refuses, over the whole generated negative corpus (counted)", () => {
    let invalid = 0;
    let looser = 0;
    let stricter = 0;
    const looserNames: string[] = [];
    const stricterBy = new Map<string, number>();
    for (const c of corpus) {
      const { invalid: bad, accepted } = judge(c.value);
      if (bad) invalid += 1;
      if (bad && accepted) {
        looser += 1;
        looserNames.push(c.name);
      }
      if (!bad && !accepted) {
        stricter += 1;
        const group = STRICTER_GROUPS.find((g) => g.test(c))?.name ?? "UNEXPLAINED";
        stricterBy.set(group, (stricterBy.get(group) ?? 0) + 1);
      }
    }
    console.info(
      `accessEffective L3 schema gap: ${corpus.length} cases, schema refuses ${invalid}; reader accepts ${looser} of those (looser); `
      + `reader refuses ${stricter} schema-valid ones (stricter): ${[...stricterBy.entries()].map(([k, v]) => `${k} ${v}`).join("; ")}`,
    );
    expect(invalid).toBeGreaterThan(200);
    expect(looserNames).toEqual([]);
    expect(stricterBy.get("UNEXPLAINED") ?? 0).toBe(0);
    for (const group of STRICTER_GROUPS) expect(stricterBy.get(group.name) ?? 0, group.name).toBe(group.count);
    expect(stricter).toBe(STRICTER_GROUPS.reduce((sum, group) => sum + group.count, 0));
  });

  it("and the schema-swapped cases are refused by the schema and are never an effective body", () => {
    const swapped = ALL_NEG.filter((c) => c.category === "schema-swapped");
    expect(swapped.length).toBeGreaterThan(0);
    for (const c of swapped) {
      const { invalid, accepted } = judge(c.value);
      // The unchanged-version control, if the generator emits one, is the base body: valid and read.
      if (!invalid) expect(accepted, c.name).toBe(true);
      else expect(accepted, c.name).toBe(false);
    }
  });

  it("AE-3 (looser on purpose, pinned): a well-formed dotted action outside the schema enum is schema-invalid and still read", () => {
    const body = clone(GRANTED);
    body.grants[0].action = "future.capability_added_by_server";
    expect(schemaViolations(body).join()).toMatch(/grants\[0\]\.action/);
    expect(effectiveOf(body)!.grants[0]!.action).toBe("future.capability_added_by_server");
    expect(LOOSER_ON_PURPOSE).toHaveLength(0);
  });

  /* Divergences found by this suite and fixed in the reader (regression): the reader had accepted what the schema refuses. */
  it("REGRESSION AE-4: more than 200 selector ids is schema-invalid (maxItems 200) and refused by the reader", () => {
    for (const make of [
      (ids: string[]) => ({ kind: "EXPLICIT_RESOURCE_SET", resource_kind: "PORTFOLIO", ids }),
      (ids: string[]) => ({ kind: "PORTFOLIO_MEMBERSHIP", portfolio_ids: ids }),
    ]) {
      const ids = (n: number) => Array.from({ length: n }, (_, i) => `id_${pad(i)}`);
      const at = clone(GRANTED);
      at.grants[0].selector = make(ids(MAX_IDS));
      expect(schemaViolations(at)).toEqual([]);
      expect(effectiveOf(at)).not.toBeNull();
      const over = clone(GRANTED);
      over.grants[0].selector = make(ids(MAX_IDS + 1));
      expect(schemaViolations(over).join()).toMatch(/selector: matched 0 oneOf/);
      expect(readAccessEffective(over)).toBeNull();
    }
  });

  it.each([
    ["the body", [] as (string | number)[]],
    ["a grant", ["grants", 0]],
    ["a selector", ["grants", 0, "selector"]],
    ["the researcher field policy", ["researcher_field_policy"]],
    ["owner recovery", ["owner_recovery"]],
  ])("REGRESSION AE-5: an unnamed key on %s is schema-invalid (additionalProperties false) and refuses the whole read", (_name, path) => {
    const body = clone(GRANTED);
    setPath(body, [...path, "surprise_field"], "x");
    // A selector is a oneOf: a stray key makes it match no branch, any other level names the key.
    expect(schemaViolations(body).join()).toMatch(path.includes("selector") ? /selector: matched 0 oneOf/ : /surprise_field: not allowed/);
    expect(readAccessEffective(body)).toBeNull();
  });

  it("AE-5 keeps the schema_version rule: a body of another version with unknown keys is still unsupported_shape, not malformed", () => {
    const other = { ...clone(GRANTED), schema_version: "portal.access-effective.v2", brand_new_field: 1 };
    expect(readAccessEffective(other)).toEqual({ kind: "unsupported_shape", schemaVersion: "portal.access-effective.v2" });
  });

  it("stricter than the schema, on purpose: each pinned case is schema-valid and refused by the reader", () => {
    const rlo = String.fromCharCode(0x202e);
    const zwsp = String.fromCharCode(0x200b);
    const cases: [string, (b: Draft) => void][] = [
      ["whitespace-only workspace_id (AE-2)", (b) => { b.workspace_id = "   "; }],
      ["bidi override in grant_id (AE-2)", (b) => { b.grants[0].grant_id = `acg${rlo}x`; }],
      ["zero-width in selector id (AE-2)", (b) => { b.grants[0].selector.ids[0] = `pf${zwsp}x`; }],
      ["C1 control in revision (schema leaves revision unpatterned)", (b) => { b.grants[0].revision = "r\u0085x"; }],
      ["control character in policy_revision (schema leaves it unpatterned)", (b) => { b.policy_revision = "p\u0007x"; }],
      ["valid_until_ms equal to valid_from_ms (empty interval)", (b) => { b.grants[0].valid_until_ms = b.grants[0].valid_from_ms; }],
      ["valid_until_ms before valid_from_ms", (b) => { b.grants[0].valid_until_ms = b.grants[0].valid_from_ms - 1; }],
      ["POLICY_PENDING without a reason_code", (b) => { b.availability = "POLICY_PENDING"; b.reason_code = null; }],
      ["AVAILABLE with a reason_code", (b) => { b.reason_code = "POLICY_PENDING"; }],
      ["QUALIFIED researcher_field_policy without a ref", (b) => { b.researcher_field_policy = { state: "QUALIFIED", policy_ref: null }; }],
      ["reason_code with a space (reader token grammar)", (b) => { b.availability = "POLICY_PENDING"; b.reason_code = "POLICY PENDING"; }],
      ["duplicate grant_id across grants", (b) => { b.grants.push(clone(b.grants[0])); }],
      [`${MAX_GRANTS + 1} grants (reader bound; schema allows 10000)`, (b) => { b.grants = cloneRows(b.grants[0], MAX_GRANTS + 1, (g, i) => { g.grant_id = `acg_${pad(i)}`; }); }],
    ];
    const outcome: string[] = [];
    for (const [name, change] of cases) {
      const body = clone(GRANTED);
      change(body);
      const { invalid, accepted } = judge(body);
      // The pinned set is "stricter" only if the schema is silent. A case the schema also refuses is not in this group.
      outcome.push(`${name}: schema ${invalid ? "refuses" : "allows"}, reader ${accepted ? "reads" : "refuses"}`);
      expect(invalid, `schema should allow: ${name}`).toBe(false);
      expect(accepted, `reader should refuse: ${name}`).toBe(false);
    }
    console.info(`accessEffective stricter-than-schema (on purpose), ${outcome.length} pinned groups:\n  ${outcome.join("\n  ")}`);
  });
});

/* ═══════════════ defects: AE-1 fixed (F5c), AE-2 blocked on Codex ═══════════════ */
describe("defects", () => {
  /*
   * DEFECT AE-2 (opaque()): an id is "bounded and printable" and nothing more,
   * so "   " and "\u202eevil" (a right-to-left override) are accepted as a
   * workspace, user, grant or resource id and reach "Granted to you". The
   * Identifier pattern the sibling readers use is ^[A-Za-z0-9._:-]{1,191}$;
   * whether access ids follow it is Codex's call, so this is raised, not fixed.
   *
   * BLOCKED on Codex answer (F5c): the published schema (execution-access.openapi.json,
   * AccessEffective.workspace_id / user_id / grants[].grant_id) pins these ids to
   * ^[^\u0000-\u001f\u007f]+$, 1..256 characters, NOT to the Identifier pattern. That pattern
   * already allows "   " and U+202E, so the reader is exactly as strict as the schema
   * and tightening it would be a policy decision, not a schema guarantee.
   */
  it("FIXED AE-2 (FE defence, stricter than the schema): a whitespace-only, bidi-override or zero-width id is refused", () => {
    for (const id of ["   ", "\t\u00a0", "\u202eevil", "a\u200bb", "\ufeffgrant", "g\u2066x\u2069", "a\u0085b"]) {
      for (const path of [["grants", 0, "grant_id"], ["grants", 0, "revision"], ["grants", 0, "selector", "ids", 0], ["workspace_id"], ["user_id"], ["policy_revision"]]) {
        const body = clone(GRANTED);
        setPath(body, path, id);
        expect(effectiveOf(body), `${path.join(".")} <- ${JSON.stringify(id)}`).toBeNull();
      }
    }
  });

  it("AE-2 keeps ordinary ids: a normal id, one with inner spaces and non-ASCII letters still passes", () => {
    expect(effectiveOf(clone(GRANTED))).not.toBeNull();
    for (const id of ["grant-1", "grant with spaces", "Công ty 01"]) {
      const body = clone(GRANTED);
      body.grants[0].grant_id = id;
      expect(effectiveOf(body), JSON.stringify(id)).not.toBeNull();
    }
  });

  /*
   * DEFECT AE-1 (readGrant via readUtcEpochMs): valid_from_ms and valid_until_ms
   * accept a negative epoch. The sibling readers (liveSourceOperations,
   * governanceParents) floor every published clock at 0, and a grant that
   * "starts before 1970" is not a grant any source can have written.
   */
  it("FIXED AE-1: a negative valid_from_ms is refused", () => {
    const body = clone(GRANTED);
    body.grants[0].valid_from_ms = -1;
    body.grants[0].valid_until_ms = null;
    expect(effectiveOf(body)).toBeNull();
    // schema: valid_until_ms is an integer with minimum 0 as well.
    const until = clone(GRANTED);
    until.grants[0].valid_from_ms = 0;
    until.grants[0].valid_until_ms = -5;
    expect(effectiveOf(until)).toBeNull();
  });
});
