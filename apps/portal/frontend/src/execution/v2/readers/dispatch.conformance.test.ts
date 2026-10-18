/**
 * Dispatcher conformance for `dispatch.ts` (Rules 9.8.3, tiers L0 to L3).
 *
 * The dispatcher is the one place that decides which reader a body on a shared
 * route goes to. The contract (header of dispatch.ts): a V2 body is read by the
 * V2 reader of the route that owns it or not at all; it is never answered as a
 * V1-shaped object; a V1 body is read by the V1 reader; everything else is the
 * typed `unsupported` answer with a reason, never a throw and never a partial.
 *
 * L0  every canonical body on disk goes to its own route and reads as the
 *     value that route's reader answers directly: the 19 parent bodies and 2
 *     live-source bodies (V2), the V1 reviews and operations bodies (V1), and
 *     the activation capabilities and plans (V2 named, reader not built).
 * L1  matrices, oracle written from the route comments in dispatch.ts:
 *       A  every V2 body x every route (24 x 8): v2 only on the owning route,
 *          V2_MALFORMED on a route that knows the schema but not the family,
 *          UNKNOWN_SCHEMA_VERSION elsewhere, V2_READER_NOT_BUILT for activation
 *       B  every V1 body x every route (6 x 8): v1 only on the owning route
 *       C  schema_version spelling x route for one V2 body
 *       D  unsupported_text for every reason names the version it saw
 * L2  all bodies over all routes repeated inside a budget; a ~1 MiB body of an
 *     unknown version is refused without being read; 5,000 deep nesting. The
 *     routes answer one body per call (no paging).
 * L3  generated negatives through every route: no throw, no leak, never `v1`
 *     for a V2 body, `v2` only for an intact owned body. A defect found is an
 *     `it.fails` below.
 */
import { afterAll, describe, expect, it } from "vitest";

import { readGateR2Detail, readPaperExitDetail } from "../../api/rows";
import { readLiveReview } from "../../api/profileRead";
import { readCanaryControlRoom, readSandboxCertification } from "../../certification";
import { readLiveFullOperations } from "../../liveFull";
import { canonicalDigest, loadCanonical } from "../testkit/loadCanonical";
import { type Draft } from "../testkit/matrix";
import {
  enumCases, leaked, pollutionCases, prototypeIsClean, requiredCases, rootCases, schemaVersionCases, stringCases,
} from "../testkit/negative";
import { MIB, serializedBytes, timed } from "../testkit/scale";
import {
  readActivationByVersion,
  readCanaryByVersion,
  readLiveFullByVersion,
  readLiveReviewByVersion,
  readOperationParentByVersion,
  readPaperExitByVersion,
  readR2ByVersion,
  readSandboxByVersion,
  unsupportedText,
  type UnsupportedReason,
  type VersionRead,
} from "./dispatch";
import {
  FOLLOWING_PARENT_V2_SCHEMA,
  GOVERNANCE_PARENT_OPERATION_V2_SCHEMA,
  GOVERNANCE_PARENT_V2_SCHEMA,
  LIVE_PARENT_V2_SCHEMA,
  readCanaryParentV2,
  readLiveParentV2,
  readOperationParentV2,
  readPaperExitParentV2,
  readR2ParentV2,
  readSandboxParentV2,
} from "./governanceParents";
import { LIVE_SOURCE_V2_SCHEMA, readLiveSourceOperationsV2 } from "./liveSourceOperations";

/* ── budgets (stated, generous: the suite shares a machine with other lanes) ── */
const BUDGET_ALL_ROUTES_MS = 600;
const BUDGET_UNKNOWN_1_MIB_MS = 100;

const FILES = [
  "execution-positive-parent.synthetic", "execution-live-source.synthetic", "execution-activation-current.synthetic",
  "execution-governance.r2-review", "execution-governance.paper-exit-review", "governance-live-review",
  "execution-live-full-operations.unavailable", "execution-canary-control-room.unavailable", "execution-sandbox-certification.unavailable",
] as const;
const digests = Object.fromEntries(FILES.map((f) => [f, canonicalDigest(f)]));
afterAll(() => {
  for (const f of FILES) expect(canonicalDigest(f), f).toBe(digests[f]);
});

const clone = <T,>(value: T): T => structuredClone(value);
const parent = loadCanonical<Draft>("execution-positive-parent.synthetic");
const liveSource = loadCanonical<Draft>("execution-live-source.synthetic");
const activation = loadCanonical<Draft>("execution-activation-current.synthetic");

type Read = VersionRead<unknown, unknown>;
interface Route { id: string; fn: (raw: unknown) => Read; v2Schemas: readonly string[]; direct: (raw: unknown) => unknown; v1Direct?: (raw: unknown) => unknown }
const ROUTES: Route[] = [
  { id: "r2", fn: readR2ByVersion as never, v2Schemas: [GOVERNANCE_PARENT_V2_SCHEMA], direct: readR2ParentV2, v1Direct: readGateR2Detail },
  { id: "exit", fn: readPaperExitByVersion as never, v2Schemas: [GOVERNANCE_PARENT_V2_SCHEMA], direct: readPaperExitParentV2, v1Direct: readPaperExitDetail },
  { id: "live", fn: readLiveReviewByVersion as never, v2Schemas: [LIVE_PARENT_V2_SCHEMA], direct: readLiveParentV2, v1Direct: readLiveReview },
  { id: "sandbox", fn: readSandboxByVersion as never, v2Schemas: [FOLLOWING_PARENT_V2_SCHEMA], direct: readSandboxParentV2, v1Direct: readSandboxCertification },
  { id: "canary", fn: readCanaryByVersion as never, v2Schemas: [FOLLOWING_PARENT_V2_SCHEMA], direct: readCanaryParentV2, v1Direct: readCanaryControlRoom },
  { id: "liveFull", fn: readLiveFullByVersion as never, v2Schemas: [LIVE_SOURCE_V2_SCHEMA], direct: readLiveSourceOperationsV2, v1Direct: readLiveFullOperations },
  { id: "operation", fn: readOperationParentByVersion as never, v2Schemas: [GOVERNANCE_PARENT_OPERATION_V2_SCHEMA], direct: readOperationParentV2 },
  { id: "activation", fn: readActivationByVersion as never, v2Schemas: ["portal.execution.activation-capabilities-read.v2", "portal.execution.activation-plan-read.v2"], direct: () => null },
];
const route = (id: string): Route => ROUTES.find((r) => r.id === id)!;

interface V2Body { key: string; owner: string | null; body: Draft }
const V2_BODIES: V2Body[] = [
  ...["r2", "r2_absent"].map((key) => ({ key, owner: "r2", body: parent[key] })),
  ...["paper_exit", "paper_exit_absent", "paper_exit_extended"].map((key) => ({ key, owner: "exit", body: parent[key] })),
  { key: "live", owner: "live", body: parent.live },
  ...["sandbox", "sandbox_absent", "sandbox_draft"].map((key) => ({ key, owner: "sandbox", body: parent[key] })),
  ...["canary", "canary_absent", "canary_revision"].map((key) => ({ key, owner: "canary", body: parent[key] })),
  ...["r2_operation", "r2_operation_uncaptured", "r2_operation_applied", "r2_operation_expired", "paper_exit_operation", "paper_exit_operation_applied", "paper_exit_operation_expired"]
    .map((key) => ({ key, owner: "operation", body: parent[key] })),
  ...["populated", "unpublished"].map((key) => ({ key: `live_source_${key}`, owner: "liveFull", body: liveSource[key] })),
  ...["capabilities", "plan", "plan_absent"].map((key) => ({ key: `activation_${key}`, owner: null, body: activation[key] })),
];

interface V1Body { key: string; owner: string; body: Draft }
const V1_BODIES: V1Body[] = [
  { key: "r2-review", owner: "r2", body: loadCanonical<Draft>("execution-governance.r2-review") },
  { key: "paper-exit-review", owner: "exit", body: loadCanonical<Draft>("execution-governance.paper-exit-review") },
  { key: "live-review", owner: "live", body: loadCanonical<Draft>("governance-live-review") },
  { key: "sandbox-certification", owner: "sandbox", body: loadCanonical<Draft>("execution-sandbox-certification.unavailable") },
  { key: "canary-control-room", owner: "canary", body: loadCanonical<Draft>("execution-canary-control-room.unavailable") },
  { key: "live-full-operations", owner: "liveFull", body: loadCanonical<Draft>("execution-live-full-operations.unavailable") },
];

const REASONS: UnsupportedReason[] = ["NOT_AN_OBJECT", "UNKNOWN_SCHEMA_VERSION", "V1_MALFORMED", "V2_MALFORMED", "V2_READER_NOT_BUILT", "V1_READER_NOT_BUILT", "V2_MARKERS_UNDER_V1_VERSION"];

/* ═════════════════════════ L0 ═════════════════════════ */
describe("L0 · canonical, verbatim", () => {
  it("the inventory is what this suite thinks it is: 24 V2 bodies and 6 V1 bodies", () => {
    expect(V2_BODIES).toHaveLength(24);
    expect(V1_BODIES).toHaveLength(6);
    expect(ROUTES).toHaveLength(8);
  });

  it.each(V2_BODIES.filter((b) => b.owner !== null).map((b) => [b.key, b] as const))("V2 %s: its own route reads it as v2, the value the reader answers directly", (_key, b) => {
    const read = route(b.owner!).fn(b.body);
    expect(read.kind).toBe("v2");
    expect(read.schemaVersion).toBe(b.body.schema_version);
    if (read.kind === "v2") expect(read.value).toEqual(route(b.owner!).direct(b.body));
  });

  it.each(V2_BODIES.filter((b) => b.owner === null).map((b) => [b.key, b] as const))("V2 %s: named by the activation route and refused as not built, never read", (_key, b) => {
    expect(readActivationByVersion(b.body)).toEqual({ kind: "unsupported", schemaVersion: b.body.schema_version, reason: "V2_READER_NOT_BUILT" });
  });

  it.each(V1_BODIES.map((b) => [b.key, b] as const))("V1 %s: its own route reads it as v1, the value the V1 reader answers directly", (_key, b) => {
    const read = route(b.owner).fn(b.body);
    expect(read.kind).toBe("v1");
    if (read.kind === "v1") {
      expect(read.schemaVersion).toBe(typeof b.body.schema_version === "string" ? b.body.schema_version : null);
      expect(read.value).toEqual(route(b.owner).v1Direct!(b.body));
    }
  });

  it("the compositions' embedded parents read as v2 through the same dispatchers", () => {
    expect(readR2ByVersion(parent.r2_composition.data.governance).kind).toBe("v2");
    expect(readPaperExitByVersion(parent.paper_exit_composition.data.exit_review).kind).toBe("v2");
    expect(readLiveReviewByVersion(parent.live_composition.data.governance).kind).toBe("v2");
  });
});

/* ═════════════════════════ L1 ═════════════════════════ */
describe("L1 · matrix A · every V2 body x every route", () => {
  const states = V2_BODIES.flatMap((b) => ROUTES.map((r) => ({ name: `${b.key} -> ${r.id}`, b, r })));

  /** The oracle: written from the route comments, not from the dispatcher's code. */
  function expected(b: V2Body, r: Route): { kind: string; reason?: UnsupportedReason } {
    if (b.owner === r.id) return { kind: "v2" };
    if (r.id === "activation" && r.v2Schemas.includes(b.body.schema_version)) return { kind: "unsupported", reason: "V2_READER_NOT_BUILT" };
    if (r.v2Schemas.includes(b.body.schema_version)) return { kind: "unsupported", reason: "V2_MALFORMED" }; // the route knows the schema, not the family
    return { kind: "unsupported", reason: "UNKNOWN_SCHEMA_VERSION" };
  }

  it("prints the matrix size", () => {
    const v2 = states.filter((s) => expected(s.b, s.r).kind === "v2").length;
    console.info(`dispatch A (V2 body x route): ${V2_BODIES.length} bodies x ${ROUTES.length} routes = ${states.length} states; ${v2} read as v2, ${states.length - v2} unsupported`);
    expect(states).toHaveLength(24 * 8);
    expect(v2).toBe(V2_BODIES.filter((b) => b.owner !== null).length);
  });

  it.each(states.map((s) => [s.name, s] as const))("%s", (_name, { b, r }) => {
    expect(() => r.fn(b.body)).not.toThrow();
    const read = r.fn(b.body);
    const want = expected(b, r);
    expect(read.kind).toBe(want.kind);
    if (read.kind === "unsupported") expect(read.reason).toBe(want.reason);
    // A V2 body is never answered as a V1-shaped object, whichever route it lands on.
    expect(read.kind).not.toBe("v1");
    if (read.kind !== "v1" && read.schemaVersion !== null) expect(read.schemaVersion).toBe(b.body.schema_version);
  });
});

/** V1 bodies a V1 reader of ANOTHER route accepts (DEFECT DP-2). */
const CROSS_READ = new Set(["live-review -> r2", "canary-control-room -> liveFull", "live-full-operations -> canary"]);

describe("L1 · matrix B · every V1 body x every route", () => {
  const states = V1_BODIES.flatMap((b) => ROUTES.map((r) => ({ name: `${b.key} -> ${r.id}`, b, r })));

  it("prints the matrix size", () => {
    console.info(`dispatch B (V1 body x route): ${V1_BODIES.length} bodies x ${ROUTES.length} routes = ${states.length} states; ${V1_BODIES.length} read as v1 by their own route, ${CROSS_READ.size} more by a tolerant reader of another route`);
    expect(states).toHaveLength(6 * 8);
  });

  it.each(states.map((s) => [s.name, s] as const))("%s", (_name, { b, r }) => {
    expect(() => r.fn(b.body)).not.toThrow();
    const read = r.fn(b.body);
    // A V1 body is read as v1 by the route that owns it; anywhere else it should be refused. Three pairs are read
    // by a tolerant V1 reader of another route (DEFECT DP-2): they are listed, not hidden.
    expect(read.kind === "v1").toBe(b.owner === r.id || CROSS_READ.has(`${b.key} -> ${r.id}`));
    expect(read.kind).not.toBe("v2");
    if (read.kind === "unsupported") expect(["V1_MALFORMED", "V1_READER_NOT_BUILT", "UNKNOWN_SCHEMA_VERSION"]).toContain(read.reason);
  });
});

describe("L1 · matrix C · schema_version spelling x route (one V2 body per route)", () => {
    // A V2 body wearing no or a V1 label is refused as "V2 markers" when it carries the parent markers
  // (provenance_basis, field_contract_revision); a body without them (live-source) is simply not a readable V1 body.
  const NO_V1 = (hasMarkers: boolean): { kind: string; reason?: UnsupportedReason } => ({ kind: "unsupported", reason: hasMarkers ? "V2_MARKERS_UNDER_V1_VERSION" : "V1_MALFORMED" });
  const SPELLINGS: [string, (v2: string) => unknown, (v2: string, hasMarkers: boolean) => { kind: string; reason?: UnsupportedReason }][] = [
    ["exact", (v) => v, () => ({ kind: "v2" })],
    ["upper-case", (v) => v.toUpperCase(), () => ({ kind: "unsupported", reason: "UNKNOWN_SCHEMA_VERSION" })],
    ["padded", (v) => ` ${v}`, () => ({ kind: "unsupported", reason: "UNKNOWN_SCHEMA_VERSION" })],
    ["trailing newline", (v) => `${v}\n`, () => ({ kind: "unsupported", reason: "UNKNOWN_SCHEMA_VERSION" })],
    ["next version", (v) => v.replace(/\.v2$/, ".v3"), () => ({ kind: "unsupported", reason: "UNKNOWN_SCHEMA_VERSION" })],
    ["V1 label on a V2 body", (v) => v.replace(/\.v2$/, ".v1"), (_v, m) => NO_V1(m)],
    ["empty", () => "", () => ({ kind: "unsupported", reason: "UNKNOWN_SCHEMA_VERSION" })],
    ["absent", () => undefined, (_v, m) => NO_V1(m)],
    ["null", () => null, () => ({ kind: "unsupported", reason: "UNKNOWN_SCHEMA_VERSION" })],
    ["number", () => 2, () => ({ kind: "unsupported", reason: "UNKNOWN_SCHEMA_VERSION" })],
    ["object", () => ({}), () => ({ kind: "unsupported", reason: "UNKNOWN_SCHEMA_VERSION" })],
    ["array", () => [GOVERNANCE_PARENT_V2_SCHEMA], () => ({ kind: "unsupported", reason: "UNKNOWN_SCHEMA_VERSION" })],
  ];
  const OWNED = V2_BODIES.filter((b) => b.owner !== null && ["r2", "paper_exit", "live", "sandbox", "canary", "r2_operation", "live_source_populated"].includes(b.key));
  const states = OWNED.flatMap((b) => SPELLINGS.map(([label, make, want]) => ({ name: `${b.key} schema_version=${label}`, b, label, make, want })));

  it("prints the matrix size", () => {
    console.info(`dispatch C (version spelling): ${OWNED.length} bodies x ${SPELLINGS.length} spellings = ${states.length} states; ${OWNED.length} read as v2`);
    expect(states).toHaveLength(OWNED.length * SPELLINGS.length);
  });

  it.each(states.map((s) => [s.name, s] as const))("%s", (_name, { b, make, want }) => {
    const body = clone(b.body);
    const value = make(b.body.schema_version as string);
    if (value === undefined) delete body.schema_version;
    else body.schema_version = value;
    const read = route(b.owner!).fn(body);
    const w = want(b.body.schema_version as string, "provenance_basis" in b.body);
    expect(read.kind).toBe(w.kind);
    if (read.kind === "unsupported") expect(read.reason).toBe(w.reason);
    expect(read.kind).not.toBe("v1");
  });
});

describe("L1 · matrix D · the sentence for every unsupported reason", () => {
  const VERSIONS: (string | null)[] = [null, "portal.execution.governance-parent.v2", "x"];
  const states = REASONS.flatMap((reason) => VERSIONS.map((schemaVersion) => ({ name: `${reason} / ${schemaVersion ?? "no version"}`, reason, schemaVersion })));

  it("prints the matrix size", () => {
    console.info(`dispatch D (unsupportedText): ${REASONS.length} reasons x ${VERSIONS.length} versions = ${states.length} states`);
    expect(states).toHaveLength(7 * 3);
  });

  it.each(states.map((s) => [s.name, s] as const))("%s", (_name, s) => {
    const text = unsupportedText({ kind: "unsupported", reason: s.reason, schemaVersion: s.schemaVersion });
    expect(text.length).toBeGreaterThan(10);
    expect(text.endsWith(".")).toBe(true);
    // The sentence says what was seen: the version, or that there was none. It never says "unsupported" alone.
    if (s.reason !== "NOT_AN_OBJECT") expect(text).toContain(s.schemaVersion === null ? "no schema_version" : s.schemaVersion);
  });
});

/* ═════════════════════════ L2 ═════════════════════════ */
describe("L2 · scale", () => {
  it("all 30 bodies over all 8 routes, 10 times, inside the budget", () => {
    const all = [...V2_BODIES.map((b) => b.body), ...V1_BODIES.map((b) => b.body)];
    const { ms } = timed(() => {
      for (let n = 0; n < 10; n += 1) for (const body of all) for (const r of ROUTES) r.fn(body);
    });
    console.info(`dispatch ${all.length} bodies x ${ROUTES.length} routes x 10: ${ms.toFixed(0)} ms (budget ${BUDGET_ALL_ROUTES_MS} ms)`);
    expect(ms).toBeLessThan(BUDGET_ALL_ROUTES_MS);
  });

  it("a ~1 MiB body of an unknown version is refused without being read", () => {
    const fat = { schema_version: "portal.execution.something-else.v9", rows: Array.from({ length: 6000 }, (_, i) => ({ id: `row_${i}`, text: "x".repeat(150) })) };
    expect(serializedBytes(fat)).toBeGreaterThan(0.9 * MIB);
    for (const r of ROUTES) {
      const { value, ms } = timed(() => r.fn(fat));
      expect(value, r.id).toEqual({ kind: "unsupported", schemaVersion: "portal.execution.something-else.v9", reason: "UNKNOWN_SCHEMA_VERSION" });
      expect(ms, r.id).toBeLessThan(BUDGET_UNKNOWN_1_MIB_MS);
    }
  });

  it("a 5,000 deep body and a 70,000 character version are answered, not thrown", () => {
    const deep = rootCases().find((c) => c.name.includes("5000"))!.value;
    for (const r of ROUTES) {
      expect(() => r.fn(deep), r.id).not.toThrow();
      expect(r.fn(deep).kind, r.id).not.toBe("v2");
    }
    for (const r of ROUTES) {
      const { value, ms } = timed(() => r.fn({ schema_version: "v".repeat(70_000) }));
      expect(value.kind).toBe("unsupported");
      expect(ms).toBeLessThan(100);
    }
  });
});

/* ═════════════════════════ L3 ═════════════════════════ */
interface Case { name: string; category: string; value: unknown; probe: string | null; owner: string; body: string }
const OWNED_BODIES = V2_BODIES.filter((b) => ["r2", "paper_exit_extended", "live", "sandbox", "canary", "r2_operation", "live_source_populated"].includes(b.key));
const CASES: Case[] = OWNED_BODIES.flatMap((b) => {
  const tag = (cases: ReturnType<typeof schemaVersionCases>): Case[] => cases.map((c) => ({ ...c, name: `${b.key} · ${c.name}`, owner: b.owner!, body: b.key }));
  const family = b.body.family !== undefined ? tag(enumCases(b.body, ["family"], [b.body.family as string]).filter((c) => c.value !== b.body)) : [];
  return [
    ...tag(schemaVersionCases(b.body, ["schema_version"], b.body.schema_version as string, [GOVERNANCE_PARENT_V2_SCHEMA, FOLLOWING_PARENT_V2_SCHEMA, LIVE_PARENT_V2_SCHEMA, GOVERNANCE_PARENT_OPERATION_V2_SCHEMA, LIVE_SOURCE_V2_SCHEMA, "governance.r2-review.v1", "execution.live-full-operations.v1"])),
    ...family,
    ...tag(requiredCases(b.body, Object.keys(b.body).map((k) => [k]))),
    ...tag(pollutionCases(b.body, [[]])),
    ...tag(stringCases(b.body, ["workspace_id"])),
  ];
});

describe("L3 · negative", () => {
  it("reports the case counts", () => {
    const by = new Map<string, number>();
    for (const c of CASES) by.set(c.category, (by.get(c.category) ?? 0) + 1);
    console.info(`dispatch L3: ${CASES.length} cases over ${OWNED_BODIES.length} bodies (${[...by.entries()].map(([k, v]) => `${k} ${v}`).join(", ")}), ${rootCases().length} root cases x ${ROUTES.length} routes`);
    expect(CASES.length).toBeGreaterThan(250);
  });

  it.each(CASES.map((c) => [c.name, c] as const))("%s", (_name, c) => {
    for (const r of ROUTES) {
      expect(() => r.fn(c.value), r.id).not.toThrow();
      const read = r.fn(c.value);
      expect(["v1", "v2", "unsupported"], r.id).toContain(read.kind);
      expect(leaked(read, c.probe), r.id).toBe(false);
      // Only the owning route may read a (possibly mutated) body as v2.
      if (read.kind === "v2") expect(r.id, `${c.name} read as v2 by ${r.id}`).toBe(c.owner);
      // These bodies are V2: none is ever answered as a V1-shaped object, whatever was done to its version.
      if (c.category === "schema-swapped" && r.id !== "activation") {
        const swapped = (c.value as Draft)?.schema_version;
        const v1Label = typeof swapped === "string" && /\.v1$/.test(swapped);
        if (read.kind === "v1") expect(v1Label && !("provenance_basis" in (c.value as Draft)) && !("field_contract_revision" in (c.value as Draft)), c.name).toBe(true);
      }
      if (read.kind === "unsupported") expect(unsupportedText(read).length).toBeGreaterThan(10);
    }
    expect(prototypeIsClean()).toBe(true);
  });

  it.each(rootCases().map((c) => [c.name, c] as const))("%s: every route answers unsupported", (_name, c) => {
    for (const r of ROUTES) {
      expect(() => r.fn(c.value), r.id).not.toThrow();
      const read = r.fn(c.value);
      if (typeof c.value !== "object" || c.value === null || Array.isArray(c.value)) {
        expect(read, r.id).toEqual({ kind: "unsupported", schemaVersion: null, reason: "NOT_AN_OBJECT" });
      } else {
        // An object with no version: either the V1 reader reads it (it is tolerant by design) or the answer is unsupported; never v2.
        expect(read.kind, r.id).not.toBe("v2");
      }
    }
  });

  it("a V1 body relabelled with a V2 version, and a V2 body relabelled V1, are both refused", () => {
    for (const b of V1_BODIES.filter((x) => route(x.owner).v2Schemas.length > 0)) {
      const relabelled = { ...clone(b.body), schema_version: route(b.owner).v2Schemas[0] };
      expect(route(b.owner).fn(relabelled).kind, b.key).toBe("unsupported");
    }
    for (const b of OWNED_BODIES) {
      const relabelled = { ...clone(b.body), schema_version: "governance.r2-review.v1" };
      expect(route(b.owner!).fn(relabelled).kind, b.key).toBe("unsupported");
    }
  });

  it("the unsupported answer carries a version string and a reason, never the body", () => {
    const read = readR2ByVersion({ schema_version: "portal.other.v2", secret: "polluted_by_testkit_probe" });
    expect(read).toEqual({ kind: "unsupported", schemaVersion: "portal.other.v2", reason: "UNKNOWN_SCHEMA_VERSION" });
    expect(JSON.stringify(read)).not.toContain("polluted_by_testkit_probe");
  });
});

/* ═══════════════ documented defects (turn red when fixed) ═══════════════ */
describe("documented defects", () => {
  /*
   * DEFECT DP-2 (readByVersion, V1 branch): a body with a `.v1` version (or
   * none) and no V2 markers is handed to the route's V1 reader, whatever its
   * `schema_version` says it is. The V1 readers are tolerant (`data ?? body`,
   * defaults), so the R2 route answers `kind: "v1"` for a live review, the
   * live-full route does the same for a canary control room, and the canary
   * route for a live-full body. The dispatcher knows each route's V2 schemas
   * but not its V1 ones, so it cannot tell. The V1 shape that comes back is
   * wrong for the screen that asked.
   */
  it.fails("DEFECT DP-2: a V1 body of another route's schema is refused, not read by this route's V1 reader", () => {
    for (const key of CROSS_READ) {
      const [bodyKey, routeId] = key.split(" -> ") as [string, string];
      const body = V1_BODIES.find((b) => b.key === bodyKey)!.body;
      expect(route(routeId).fn(body).kind, key).not.toBe("v1");
    }
  });

  /*
   * DEFECT DP-1 (unsupportedText): the sentence quotes the body's
   * `schema_version` as received. A body can carry a version of any length or
   * with control characters; a 70,000 character version becomes a 70,000
   * character sentence in the unsupported banner. The reader of the sentence
   * wants the version a person can compare (a short token), not the payload.
   */
  it.fails("DEFECT DP-1: the sentence for an unsupported body bounds the version it quotes", () => {
    const read = readR2ByVersion({ schema_version: "v".repeat(70_000) });
    expect(read.kind).toBe("unsupported");
    if (read.kind === "unsupported") expect(unsupportedText(read).length).toBeLessThan(400);
  });
});
