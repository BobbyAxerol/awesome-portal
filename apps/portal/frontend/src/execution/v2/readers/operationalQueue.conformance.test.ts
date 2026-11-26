/**
 * Reader conformance for `operationalQueue.ts` (Rules 9.8.3, tiers L0 to L3),
 * including the B1 fields `incident_links` (FE-042) and `status_counts`
 * (FE-043).
 *
 * L0  the two canonical queue files and the incident root, verbatim from disk:
 *       execution-operational-current.synthetic.valid.json
 *       execution-operational-queue-links-counts.synthetic.valid.json
 *     read, schema-checked, and proved unchanged by the suite.
 * L1  state matrices, each against an oracle written from the contract text in
 *     operationalQueue.ts and the schema descriptions, not from the reader:
 *       A  triage state x acknowledged x resolved x updated-before-created
 *       B  every closed word (pairwise): words pass through, env is lowered
 *       C  incident_links arithmetic: count x truncated x items x slot kind
 *       D  status_counts facets: applied filters x one broken invariant x dim
 *       E  read truth x rows x continuation flags x cursors
 * L2  200 rows with links and counts, ~1 MiB of text fields, five keyset pages,
 *     inside a stated budget.
 * L3  generated negatives (enum, integer, string, array, required, schema
 *     swap, pollution, bad roots): every case is refused or is the typed
 *     `unsupported_shape`, never throws, never leaks its probe, and an
 *     unknown word never becomes a row. What the reader accepts that the
 *     published schema forbids is printed; F5c fixed every recorded looseness
 *     (the FIXED tests below), so a new one fails the suite.
 */
import { afterAll, describe, expect, it } from "vitest";

import { canonicalDigest, loadCanonical, schemaEnum } from "../testkit/loadCanonical";
import { cartesian, coverage, describeCoverage, dimension, dimensionOf, pairwise, setPath, type Draft } from "../testkit/matrix";
import {
  arrayCases, enumCases, integerCases, leaked, pollutionCases, prototypeIsClean, requiredCases, rootCases, schemaVersionCases,
  stringCases,
} from "../testkit/negative";
import { cloneRows, keysetCursor, pad, serializedBytes, splitIntoPages, timed, MIB } from "../testkit/scale";
import { validateAgainst } from "../testkit/schema";
import {
  INCIDENT_LINK_BOUND_V2,
  INCIDENT_ROOT_V2_SCHEMA,
  readInstant,
  OPERATIONAL_QUEUE_V2_SCHEMA,
  RISK_TIERS_V2,
  SEVERITIES_V2,
  SOURCE_STATUSES_V2,
  TARGET_TYPES_V2,
  TRIAGE_STATES_V2,
  VERIFICATION_RESULTS_V2,
  readIncidentRootV2,
  readOperationalQueueV2,
  type OperationalQueueV2,
} from "./operationalQueue";

/* ── budgets (stated, generous: the suite shares a machine with other lanes) ── */
const BUDGET_200_ROWS_MS = 400;
const BUDGET_1_MIB_MS = 600;
const BUDGET_5_PAGES_MS = 1200;

const CURRENT = "execution-operational-current.synthetic";
const LINKS = "execution-operational-queue-links-counts.synthetic";
const SCHEMA = "execution-operations.v1";
const digests = { [CURRENT]: canonicalDigest(CURRENT), [LINKS]: canonicalDigest(LINKS) };
afterAll(() => {
  // L0 is never edited: the files the suite read are the files it leaves behind.
  expect(canonicalDigest(CURRENT)).toBe(digests[CURRENT]);
  expect(canonicalDigest(LINKS)).toBe(digests[LINKS]);
});

const current = loadCanonical<Draft>(CURRENT);
const links = loadCanonical<Draft>(LINKS);
const queueViolations = (value: unknown) => validateAgainst(SCHEMA, "/$defs/OperationalQueueV2", value);

/** What a screen is handed: the V2 queue, or nothing. `unsupported_shape` is reported separately. */
function queueOf(raw: unknown): OperationalQueueV2 | null {
  const read = readOperationalQueueV2(raw);
  return read !== null && read.kind === "queue" ? read.queue : null;
}
const clone = <T,>(value: T): T => structuredClone(value);

/* ═════════════════════════ L0 ═════════════════════════ */
describe("L0 · canonical, verbatim", () => {
  it("both queue files and the incident root pass the published schema through the testkit checker", () => {
    expect(queueViolations(current.queue)).toEqual([]);
    expect(queueViolations(links.queue)).toEqual([]);
    expect(validateAgainst(SCHEMA, "/$defs/OperationalIncidentCurrentV2", current.incident)).toEqual([]);
    const broken = clone(links.queue);
    delete broken.page.rows[0].incident_links.items;
    expect(queueViolations(broken).length).toBeGreaterThan(0);
  });

  it("the current-queue file reads as published, with links and counts absent (not zero)", () => {
    const queue = queueOf(current.queue)!;
    expect(queue.page.rows).toHaveLength(1);
    expect(queue.page.rows[0]!.incidentLinks).toBeUndefined();
    expect(queue.page.statusCounts).toBeUndefined();
    expect(queue.readTruth).toEqual({ state: "AVAILABLE", reasonCode: null });
    expect(queue.sourceAsOfMs).toBeNull();
    expect(queue.observedAtMs).toBe(0);
  });

  it("the incident root reads as published", () => {
    const read = readIncidentRootV2(current.incident);
    expect(read?.kind).toBe("incident");
    if (read?.kind !== "incident") return;
    expect(read.incident).toMatchObject({
      incidentId: "inc_TEST_ONLY_operational", workflowState: "OPEN", environment: "paper", environmentWire: "PAPER",
      acknowledgedAt: null, mitigatedAt: null, resolvedAt: null,
      historicalChildren: { availability: "NOT_PUBLISHED", reasonCode: "ORIGINAL_INCIDENT_TARGET_NOT_ATTESTED" },
    });
  });

  describe("links-and-counts file", () => {
    const queue = queueOf(links.queue)!;
    const [a, b, c] = queue.page.rows;

    it("reads three rows and the page arithmetic as published", () => {
      expect(queue.page.rows.map((r) => r.operationId)).toEqual(links.queue.page.rows.map((r: Draft) => r.operation_id));
      expect(queue.page.totalCount).toBe(6);
      expect(queue.page.filteredCount).toBe(3);
      expect(queue.page.appliedFilters).toEqual([{ field: "severity", value: "WARNING" }]);
    });

    it("row a: four authorized links, three listed, truncated, newest first, identifiers verbatim", () => {
      const l = a!.incidentLinks!;
      expect(l.authorizedLinkCount).toBe(4);
      expect(l.truncated).toBe(true);
      expect(l.items).toHaveLength(INCIDENT_LINK_BOUND_V2);
      expect(l.items.map((i) => (i.state === "LINKED" ? i.incidentId : null))).toEqual(
        links.queue.page.rows[0].incident_links.items.map((i: Draft) => i.incident_id),
      );
      const times = l.items.map((i) => (i.state === "LINKED" ? i.linkedAt.ms : NaN));
      expect([...times].sort((x, y) => y - x)).toEqual(times);
      // The original instant text is kept, microseconds included.
      expect(l.items[0]).toMatchObject({ state: "LINKED", linkedAt: { iso: "2026-08-22T12:09:00.000004Z" }, historyReasonCode: "ORIGINAL_INCIDENT_TARGET_NOT_ATTESTED" });
    });

    it("row b: a NOT_ATTESTED slot keeps its place and names no incident", () => {
      const l = b!.incidentLinks!;
      expect(l.authorizedLinkCount).toBe(2);
      expect(l.truncated).toBe(false);
      expect(l.items[1]).toEqual({ state: "NOT_ATTESTED", reasonCode: "INCIDENT_LINK_IDENTITY_NOT_REPRESENTABLE", historyReasonCode: "ORIGINAL_INCIDENT_TARGET_NOT_ATTESTED" });
      expect(l.items[1]).not.toHaveProperty("incidentId");
    });

    it("row c: a published zero stays a value (an empty list, count 0), not an absence", () => {
      expect(c!.incidentLinks).toEqual({ items: [], authorizedLinkCount: 0, truncated: false });
    });

    it("status counts: every dimension is the published one, sums equal totals, own filter is flagged", () => {
      const s = queue.page.statusCounts!;
      for (const [name, dim] of Object.entries(s)) {
        expect((Object.values(dim.counts) as number[]).reduce((x, y) => x + y, 0), name).toBe(dim.total);
      }
      expect(s.triageState).toMatchObject({ ownFilterApplied: false, total: 3, counts: { UNACKNOWLEDGED: 1, ACKNOWLEDGED: 1, RESOLVED: 1 } });
      expect(s.severity).toMatchObject({ ownFilterApplied: true, total: 6 });
      expect(s.severity.counts.WARNING).toBe(queue.page.filteredCount);
      expect(s.sourceStatus.counts.SUCCEEDED).toBe(1);
      // Zero-filled over the whole closed domain, so a zero bucket is a published 0.
      expect(Object.keys(s.verificationResult.counts)).toEqual([...VERIFICATION_RESULTS_V2]);
      expect(Object.keys(s.sourceStatus.counts)).toEqual([...SOURCE_STATUSES_V2]);
    });

    it("the domains the reader holds are the schema's enums", () => {
      expect([...SEVERITIES_V2]).toEqual(schemaEnum(SCHEMA, "/$defs/OperationalQueueRowV2/properties/severity"));
      expect([...SOURCE_STATUSES_V2]).toEqual(schemaEnum(SCHEMA, "/$defs/OperationalQueueRowV2/properties/source_status"));
      expect([...VERIFICATION_RESULTS_V2]).toEqual(schemaEnum(SCHEMA, "/$defs/OperationalQueueRowV2/properties/verification_result"));
      expect([...TRIAGE_STATES_V2]).toEqual(schemaEnum(SCHEMA, "/$defs/OperationalQueueRowV2/properties/triage_state"));
      expect([...RISK_TIERS_V2]).toEqual(schemaEnum(SCHEMA, "/$defs/OperationalQueueRowV2/properties/risk_tier"));
      expect([...TARGET_TYPES_V2]).toEqual(schemaEnum(SCHEMA, "/$defs/OperationalQueueRowV2/properties/target/properties/type"));
    });
  });
});

/* ═════════════════════════ L1 ═════════════════════════ */

/** One row, no links, no counts, page arithmetic consistent: the base every matrix mutates. */
function singleRow(source: Draft, index: number, keepLinks = false): Draft {
  const q = clone(source.queue);
  q.page.rows = [q.page.rows[index]];
  q.page.total_count = 1;
  q.page.filtered_count = 1;
  q.page.applied_filters = [];
  delete q.page.status_counts;
  if (!keepLinks) delete q.page.rows[0].incident_links;
  return q;
}
const BASE = singleRow(current, 0);
const linksBase = singleRow(links, 0, true);

describe("L1 · matrix A · triage state x timestamps", () => {
  const TIMES = { ack: "2026-08-22T12:05:00Z", res: "2026-08-22T12:10:00Z", early: "2026-08-22T11:59:59Z", late: "2026-08-22T12:10:00Z" } as const;
  const DIMS = [
    dimension("triage", ["page", "rows", 0, "triage_state"], [...TRIAGE_STATES_V2]),
    dimension("acknowledged_at", ["page", "rows", 0, "acknowledged_at"], [null, TIMES.ack]),
    dimension("resolved_at", ["page", "rows", 0, "resolved_at"], [null, TIMES.res]),
    dimension("updated_at", ["page", "rows", 0, "updated_at"], [TIMES.late, TIMES.early]),
  ];
  const states = cartesian(BASE, DIMS);
  const accept = (p: Record<string, string>): boolean => {
    if (p.updated_at === TIMES.early) return false; // updated before created
    const ack = p.acknowledged_at !== "null";
    const res = p.resolved_at !== "null";
    if (p.triage === "UNACKNOWLEDGED") return !ack && !res;
    if (p.triage === "ACKNOWLEDGED") return !res;
    return res; // RESOLVED must say when
  };

  it("prints the matrix size", () => {
    const cover = coverage(DIMS, states);
    console.info(describeCoverage("operationalQueue A (triage x times)", cover));
    expect(states).toHaveLength(3 * 2 * 2 * 2);
    // updated_at in order (1 of 2) x [UNACK 1 + ACK 2 + RESOLVED 2] consistent timestamp pairs.
    expect(states.filter((s) => accept(s.picks))).toHaveLength(5);
  });

  describe.each(states.map((s) => [s.name, s] as const))("%s", (_name, state) => {
    it("is read exactly when the triage shape is consistent, and never throws", () => {
      expect(() => readOperationalQueueV2(state.value)).not.toThrow();
      const queue = queueOf(state.value);
      expect(queue !== null).toBe(accept(state.picks));
      if (queue === null) return;
      const row = queue.page.rows[0]!;
      expect(row.triageState).toBe(state.picks.triage);
      expect(row.resolvedAt === null).toBe(state.picks.resolved_at === "null");
      expect(row.acknowledgedAt === null).toBe(state.picks.acknowledged_at === "null");
      // The clock order the reader enforces is the one a screen sorts by.
      expect(row.updatedAt.ms).toBeGreaterThanOrEqual(row.createdAt.ms);
    });
  });
});

describe("L1 · matrix B · every closed word passes through unchanged (pairwise)", () => {
  const DIMS = [
    dimension("severity", ["page", "rows", 0, "severity"], [...SEVERITIES_V2]),
    dimension("source_status", ["page", "rows", 0, "source_status"], [...SOURCE_STATUSES_V2]),
    dimension("verification", ["page", "rows", 0, "verification_result"], [...VERIFICATION_RESULTS_V2]),
    dimension("risk_tier", ["page", "rows", 0, "risk_tier"], [...RISK_TIERS_V2]),
    dimension("environment", ["page", "rows", 0, "environment"], ["PAPER", "SANDBOX", "LIVE"]),
    dimension("target", ["page", "rows", 0, "target", "type"], [...TARGET_TYPES_V2]),
  ];
  const states = pairwise(BASE, DIMS);
  const cover = coverage(DIMS, states);

  it("prints the matrix size and proves every pair is met", () => {
    console.info(describeCoverage("operationalQueue B (closed words) pairwise", cover));
    expect(cover.pairsCovered).toBe(cover.pairsPossible);
    expect(cover.valuesCovered).toBe(cover.values);
    expect(states.length).toBeLessThan(cover.cartesianRaw);
  });

  it.each(states.map((s) => [s.name, s] as const))("%s", (_name, state) => {
    const row = queueOf(state.value)!.page.rows[0]!;
    expect(row.severity).toBe(state.picks.severity);
    expect(row.sourceStatus).toBe(state.picks.source_status);
    expect(row.verificationResult).toBe(state.picks.verification);
    expect(row.riskTier).toBe(state.picks.risk_tier);
    expect(row.environmentWire).toBe(state.picks.environment);
    expect(row.environment).toBe(state.picks.environment.toLowerCase());
    expect(row.targetType).toBe(state.picks.target);
    // A queue SUCCEEDED is the Portal queue record only: the row carries no applied, settled or converged claim.
    expect(Object.keys(row).filter((k) => /appl|settl|converg|success|ok$/i.test(k))).toEqual([]);
  });
});

describe("L1 · matrix C · incident_links arithmetic", () => {
  const TEMPLATE = clone(links.queue.page.rows[0].incident_links.items[0]);
  const SLOT = clone(links.queue.page.rows[1].incident_links.items[1]);
  const linkAt = (i: number) => {
    const item = clone(TEMPLATE);
    item.incident_id = `inc_TEST_ONLY_m_${i}`;
    item.linked_at = `2026-08-22T12:0${9 - i}:00.00000${i + 1}Z`;
    return item;
  };
  const build = (n: number, mix: string): Draft[] =>
    Array.from({ length: n }, (_, i) => (mix === "all-not-attested" || (mix === "last-not-attested" && i === n - 1) ? clone(SLOT) : linkAt(i)));
  const DIMS = [
    dimension("authorized_link_count", ["page", "rows", 0, "incident_links", "authorized_link_count"], [0, 1, 2, 3, 4, 7]),
    dimension("truncated", ["page", "rows", 0, "incident_links", "truncated"], [true, false]),
    dimensionOf("items", [0, 1, 2, 3, 4].map((n) => ({ label: String(n), apply: (d: Draft) => { setPath(d, ["page", "rows", 0, "incident_links", "items"], build(n, "linked")); } }))),
    dimensionOf("slots", ["linked", "last-not-attested", "all-not-attested"].map((mix) => ({
      label: mix,
      apply: (d: Draft) => {
        const n = d.page.rows[0].incident_links.items.length;
        d.page.rows[0].incident_links.items = build(n, mix);
      },
    }))),
  ];
  const states = cartesian(linksBase, DIMS);
  const accept = (p: Record<string, string>): boolean => {
    const count = Number(p.authorized_link_count);
    const items = Number(p.items);
    return items <= INCIDENT_LINK_BOUND_V2 && items === Math.min(count, INCIDENT_LINK_BOUND_V2) && (p.truncated === "true") === (count > items);
  };

  it("prints the matrix size", () => {
    console.info(describeCoverage("operationalQueue C (links arithmetic) cartesian", coverage(DIMS, states)));
    expect(states).toHaveLength(6 * 2 * 5 * 3);
    expect(states.filter((s) => accept(s.picks)).length).toBeGreaterThan(8);
  });

  describe.each(states.map((s) => [s.name, s] as const))("%s", (_name, state) => {
    it("is read exactly when items = min(count, 3) and truncated = count > items", () => {
      const queue = queueOf(state.value);
      expect(queue !== null).toBe(accept(state.picks));
      if (queue === null) return;
      const l = queue.page.rows[0]!.incidentLinks!;
      expect(l.authorizedLinkCount).toBe(Number(state.picks.authorized_link_count));
      expect(l.items).toHaveLength(Number(state.picks.items));
      expect(l.truncated).toBe(l.authorizedLinkCount > l.items.length);
      // A short, truncated list is "at least", never "exactly": the count is kept beside the items.
      if (l.truncated) expect(l.authorizedLinkCount).toBeGreaterThan(l.items.length);
      for (const item of l.items) if (item.state === "NOT_ATTESTED") expect(item).not.toHaveProperty("incidentId");
    });
  });

  it("two links to one incident are refused, and a NOT_ATTESTED slot that names an incident is refused", () => {
    const dup = clone(linksBase);
    const items = dup.page.rows[0].incident_links.items;
    items[1] = { ...items[1], incident_id: items[0].incident_id };
    expect(queueOf(dup)).toBeNull();
    const named = clone(links.queue);
    named.page.rows[1].incident_links.items[1].incident_id = "inc_TEST_ONLY_guess";
    expect(queueOf(named)).toBeNull();
  });
});

/* ── matrix D · status_counts ── */
const DOMAIN: Record<string, readonly string[]> = {
  triage_state: TRIAGE_STATES_V2,
  verification_result: VERIFICATION_RESULTS_V2,
  source_status: SOURCE_STATUSES_V2,
  severity: SEVERITIES_V2,
};
interface Scenario { name: string; filters: { field: string; value: string }[]; filtered: number }
const TOTAL = 20;
const OWN_TOTAL = 8;
const SCENARIOS: Scenario[] = [
  { name: "no filter", filters: [], filtered: 3 },
  { name: "severity=WARNING", filters: [{ field: "severity", value: "WARNING" }], filtered: 3 },
  { name: "triage=ACKNOWLEDGED", filters: [{ field: "triage_state", value: "ACKNOWLEDGED" }], filtered: 3 },
  { name: "verification=SUCCEEDED", filters: [{ field: "verification_result", value: "SUCCEEDED" }], filtered: 3 },
  { name: "source_status=PENDING", filters: [{ field: "source_status", value: "PENDING" }], filtered: 3 },
  { name: "severity+triage", filters: [{ field: "severity", value: "WARNING" }, { field: "triage_state", value: "ACKNOWLEDGED" }], filtered: 3 },
  { name: "filter outside the domain", filters: [{ field: "severity", value: "CATASTROPHIC" }], filtered: 0 },
  { name: "no filter, empty page", filters: [], filtered: 0 },
];

/** A status_counts block that satisfies every documented invariant for the scenario. */
function consistentCounts(s: Scenario): Draft {
  const dimensions: Draft = {};
  for (const [field, domain] of Object.entries(DOMAIN)) {
    const own = s.filters.find((f) => f.field === field);
    const total = own === undefined ? s.filtered : s.filtered === 0 ? 0 : OWN_TOTAL;
    const counts: Record<string, number> = Object.fromEntries(domain.map((k) => [k, 0]));
    if (own !== undefined && domain.includes(own.value)) counts[own.value] = s.filtered;
    let rest = total - Object.values(counts).reduce((x, y) => x + y, 0);
    for (const k of domain) { if (counts[k] === 0 && rest > 0 && k !== own?.value) { counts[k] = rest; rest = 0; } }
    if (rest > 0) counts[domain[0]!] = (counts[domain[0]!] ?? 0) + rest; // out-of-domain filter: nothing selected, total all elsewhere
    dimensions[field] = { own_filter_applied: own !== undefined, total, counts };
  }
  return { basis: "SAME_SNAPSHOT_AUTHORIZED_SCOPE_AND_FILTERS_EXCLUDING_OWN_DIMENSION", succeeded_means: "PORTAL_QUEUE_RECORD_STATE_ONLY", dimensions };
}

/** The documented facet arithmetic, written from the schema description and the header of operationalQueue.ts. */
function countsOracle(q: Draft): boolean {
  const page = q.page;
  const sc = page.status_counts;
  const safe = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
  if (!safe(page.total_count) || !safe(page.filtered_count) || page.total_count < page.filtered_count || page.filtered_count < page.rows.length) return false;
  if (sc === undefined) return true;
  if (sc?.basis !== "SAME_SNAPSHOT_AUTHORIZED_SCOPE_AND_FILTERS_EXCLUDING_OWN_DIMENSION" || sc.succeeded_means !== "PORTAL_QUEUE_RECORD_STATE_ONLY") return false;
  if (Object.keys(sc.dimensions ?? {}).length !== 4) return false;
  for (const [field, domain] of Object.entries(DOMAIN)) {
    const dim = sc.dimensions[field];
    if (dim === undefined || typeof dim.own_filter_applied !== "boolean" || !safe(dim.total) || dim.counts === undefined) return false;
    if (Object.keys(dim.counts).length !== domain.length || !domain.every((k) => safe(dim.counts[k]))) return false;
    if (domain.reduce((sum, k) => sum + dim.counts[k], 0) !== dim.total) return false;
    const own = page.applied_filters.find((f: Draft) => f.field === field);
    if (dim.own_filter_applied !== (own !== undefined)) return false;
    if (dim.total > page.total_count || dim.total < page.filtered_count) return false;
    if (own === undefined ? dim.total !== page.filtered_count : (dim.counts[own.value] ?? 0) !== page.filtered_count) return false;
  }
  return true;
}

type Break = { label: string; apply(dim: Draft, sc: Draft, q: Draft, field: string): void };
const BREAKS: Break[] = [
  { label: "none", apply: () => undefined },
  { label: "bucket +1 (sum off total)", apply: (d) => { d.counts[Object.keys(d.counts)[0]!] += 1; } },
  { label: "total above total_count", apply: (d, _s, q) => { const extra = q.page.total_count + 1 - d.total; d.total += extra; d.counts[Object.keys(d.counts)[0]!] += extra; } },
  { label: "total below filtered", apply: (d, _s, q) => { const cut = Math.min(d.total, q.page.filtered_count > 0 ? 1 : 0); d.total -= cut; d.counts[Object.keys(d.counts).find((k) => d.counts[k] >= cut)!] -= cut; if (cut === 0) d.total = -1; } },
  { label: "own flag flipped", apply: (d) => { d.own_filter_applied = !d.own_filter_applied; } },
  { label: "total +1 with bucket (facet total drifts)", apply: (d) => { d.total += 1; d.counts[Object.keys(d.counts).at(-1)!] += 1; } },
  { label: "missing bucket", apply: (d) => { delete d.counts[Object.keys(d.counts)[0]!]; } },
  { label: "extra bucket", apply: (d) => { d.counts.BOGUS_BUCKET = 0; } },
  { label: "negative bucket", apply: (d) => { const [k0, k1] = Object.keys(d.counts); d.counts[k0!] -= 1; d.counts[k1!] += 1; } },
  { label: "fractional bucket", apply: (d) => { const [k0, k1] = Object.keys(d.counts); d.counts[k0!] += 0.5; d.counts[k1!] -= 0.5; } },
  { label: "bucket as string", apply: (d) => { const k0 = Object.keys(d.counts)[0]!; d.counts[k0] = String(d.counts[k0]); } },
  { label: "succeeded_means other", apply: (_d, sc) => { sc.succeeded_means = "VENUE_SUCCESS"; } },
  { label: "basis other", apply: (_d, sc) => { sc.basis = "LOADED_PAGE_ONLY"; } },
  { label: "dimension missing", apply: (_d, sc, _q, field) => { delete sc.dimensions[field]; } },
  { label: "dimension added", apply: (_d, sc) => { sc.dimensions.extra = clone(sc.dimensions.severity); } },
];

describe("L1 · matrix D · status_counts facets (scenario x broken invariant x dimension)", () => {
  const rows = links.queue.page.rows as Draft[];
  const build = (s: Scenario, brk: Break, field: string): Draft => {
    const q = clone(links.queue);
    q.page.rows = s.filtered === 0 ? [] : rows.map((r) => clone(r));
    q.page.total_count = TOTAL;
    q.page.filtered_count = s.filtered;
    q.page.applied_filters = s.filters.map((f) => ({ field: f.field, op: "eq", value: f.value }));
    q.page.status_counts = consistentCounts(s);
    q.read_truth = s.filtered === 0 ? { state: "EMPTY", reason_code: "NO_MATCHING_ROWS", scope: "REQUEST" } : q.read_truth;
    brk.apply(q.page.status_counts.dimensions[field], q.page.status_counts, q, field);
    return q;
  };
  const cases = SCENARIOS.flatMap((s) => ["triage_state", "severity"].flatMap((field) => BREAKS.map((b) => ({ name: `${s.name} | ${field} | ${b.label}`, s, b, field }))));

  it("prints the matrix size", () => {
    console.info(`operationalQueue D (status_counts): ${SCENARIOS.length} scenarios x 2 dimensions x ${BREAKS.length} breaks = ${cases.length} states; `
      + `${cases.filter((c) => countsOracle(build(c.s, c.b, c.field))).length} satisfy the facet arithmetic`);
    expect(cases).toHaveLength(SCENARIOS.length * 2 * BREAKS.length);
  });

  it("every unbroken scenario is itself consistent (the generator proves the oracle can say yes)", () => {
    for (const s of SCENARIOS) {
      const q = build(s, BREAKS[0]!, "severity");
      expect(countsOracle(q), s.name).toBe(true);
      expect(queueViolations(q), s.name).toEqual([]);
    }
  });

  it.each(cases.map((c) => [c.name, c] as const))("%s", (_name, c) => {
    const payload = build(c.s, c.b, c.field);
    expect(() => readOperationalQueueV2(payload)).not.toThrow();
    const queue = queueOf(payload);
    expect(queue !== null).toBe(countsOracle(payload));
    if (queue === null) return;
    // Counts come from the server block, never from the loaded rows.
    expect(queue.page.statusCounts!.severity.total).toBe(payload.page.status_counts.dimensions.severity.total);
    expect(queue.page.statusCounts!.severity.ownFilterApplied).toBe(c.s.filters.some((f) => f.field === "severity"));
  });

  it("an absent block is undefined, never a zero-filled one", () => {
    const q = clone(links.queue);
    delete q.page.status_counts;
    const read = queueOf(q)!;
    expect(read.page.statusCounts).toBeUndefined();
    expect(read.page.rows.length).toBe(3);
    // Present and null is malformed, not "no counts".
    q.page.status_counts = null;
    expect(queueOf(q)).toBeNull();
  });
});

describe("L1 · matrix E · read truth x rows x continuation flags", () => {
  const DIMS = [
    dimension("truth", ["read_truth", "state"], ["AVAILABLE", "EMPTY"]),
    dimensionOf("rows", [
      { label: "0", apply: (d: Draft) => { d.page.rows = []; } },
      { label: "1", apply: () => undefined },
    ]),
    dimension("has_more", ["page", "has_more"], [true, false]),
    dimension("next_cursor", ["page", "next_cursor"], [null, "cur_next"]),
    dimension("has_previous", ["page", "has_previous"], [true, false]),
    dimension("prev_cursor", ["page", "prev_cursor"], [null, "cur_prev"]),
  ];
  const states = cartesian(BASE, DIMS);
  const accept = (p: Record<string, string>) =>
    !(p.truth === "EMPTY" && p.rows === "1")
    && (p.has_more === "true") === (p.next_cursor !== "null")
    && (p.has_previous === "true") === (p.prev_cursor !== "null");

  it("prints the matrix size", () => {
    console.info(describeCoverage("operationalQueue E (truth x rows x flags) cartesian", coverage(DIMS, states)));
    expect(states).toHaveLength(64);
    // 3 of 4 truth x rows pairs, 2 of 4 next-cursor pairs, 2 of 4 prev-cursor pairs.
    expect(states.filter((s) => accept(s.picks))).toHaveLength(3 * 2 * 2);
  });

  it.each(states.map((s) => [s.name, s] as const))("%s", (_name, state) => {
    const queue = queueOf(state.value);
    expect(queue !== null).toBe(accept(state.picks));
    if (queue === null) return;
    expect(queue.readTruth.state).toBe(state.picks.truth);
    expect(queue.page.hasMore).toBe(queue.page.nextCursor !== null);
    expect(queue.page.hasPrevious).toBe(queue.page.prevCursor !== null);
    // EMPTY is only ever the empty page; AVAILABLE with no rows is a published zero, not an error.
    if (queue.readTruth.state === "EMPTY") expect(queue.page.rows).toHaveLength(0);
  });
});

describe("L1 · schema_version routing", () => {
  it("only the queue's own version is a queue; every other published version is the typed unsupported_shape", () => {
    for (const other of [INCIDENT_ROOT_V2_SCHEMA, "portal.execution.operational-workflow.v2", "portal.execution.operational-queue.v1", "portal.execution.operational-queue.v3"]) {
      const body = { ...clone(BASE), schema_version: other };
      expect(readOperationalQueueV2(body), other).toEqual({ kind: "unsupported_shape", schemaVersion: other });
    }
    expect(readOperationalQueueV2({ ...clone(BASE), schema_version: OPERATIONAL_QUEUE_V2_SCHEMA })?.kind).toBe("queue");
  });
});

/* ═════════════════════════ L2 ═════════════════════════ */
describe("L2 · scale", () => {
  const rowTemplate = links.queue.page.rows[0];
  const fat = (count: number, textLength: number): Draft => {
    const q = clone(links.queue);
    const cut = (prefix: string, i: number) => `${prefix}${pad(i)}`.padEnd(textLength, "x");
    q.page.rows = cloneRows(rowTemplate as Draft, count, (row, i) => {
      row.operation_id = `op_${pad(i)}`;
      row.command_key = "account/sync";
      row.target.id = cut("acc_", i);
      row.created_at = `2026-08-22T12:00:00.${String(i % 1000).padStart(3, "0")}Z`;
      row.updated_at = row.resolved_at;
      row.incident_links.items.forEach((item: Draft, n: number) => {
        item.incident_id = cut(`inc_${n}_`, i);
        item.incident.target.id = cut("acc_", i);
      });
    });
    q.page.total_count = count;
    q.page.filtered_count = count;
    q.page.applied_filters = [];
    q.page.status_counts = consistentCounts({ name: "all", filters: [], filtered: count });
    return q;
  };

  it("reads a 200 row page with links and counts inside the budget, and keeps every row", () => {
    const body = fat(200, 24);
    const { value, ms } = timed(() => queueOf(body));
    console.info(`operationalQueue 200 rows (${(serializedBytes(body) / 1024).toFixed(0)} KiB): ${ms.toFixed(0)} ms (budget ${BUDGET_200_ROWS_MS} ms)`);
    expect(value!.page.rows).toHaveLength(200);
    expect(value!.page.rows.every((r) => r.incidentLinks!.items.length === 3)).toBe(true);
    expect(new Set(value!.page.rows.map((r) => r.operationId)).size).toBe(200);
    expect(ms).toBeLessThan(BUDGET_200_ROWS_MS);
  });

  it("reads 200 rows with every identifier at the schema's 191 character cap inside the budget", () => {
    const body = fat(200, 191);
    const bytes = serializedBytes(body);
    const { value, ms } = timed(() => queueOf(body));
    console.info(`operationalQueue ${(bytes / MIB).toFixed(2)} MiB, 200 rows: ${ms.toFixed(0)} ms (budget ${BUDGET_1_MIB_MS} ms)`);
    expect(bytes).toBeGreaterThan(0.4 * MIB);
    expect(bytes).toBeLessThan(1.6 * MIB);
    expect(value).not.toBeNull();
    expect(ms).toBeLessThan(BUDGET_1_MIB_MS);
  });

  it("reads 1,000 operations as five keyset pages; cursors chain, flags agree, rows stay unique and in order", () => {
    const all = cloneRows(rowTemplate as Draft, 1000, (row, i) => {
      row.operation_id = `op_${pad(i)}`;
      row.incident_links = { basis: row.incident_links.basis, bound: 3, authorized_link_count: 0, truncated: false, items: [] };
    });
    const { pages } = splitIntoPages(all, 200, "f1", (r: Draft) => r.operation_id, (slice, info) => {
      const q = clone(links.queue);
      q.page = { ...q.page, rows: slice, total_count: 1000, filtered_count: 1000, next_cursor: info.nextCursor, prev_cursor: info.prevCursor, has_more: info.hasMore, has_previous: info.hasPrevious, applied_filters: [] };
      delete q.page.status_counts;
      return q;
    });
    const { value: reads, ms } = timed(() => pages.map((p) => queueOf(p)));
    console.info(`operationalQueue 5 x 200 rows paged: ${ms.toFixed(0)} ms (budget ${BUDGET_5_PAGES_MS} ms)`);
    expect(reads.every((r) => r !== null)).toBe(true);
    expect(reads.map((r) => r!.page.hasMore)).toEqual([true, true, true, true, false]);
    expect(reads.map((r) => r!.page.hasPrevious)).toEqual([false, true, true, true, true]);
    const ids = reads.flatMap((r) => r!.page.rows.map((x) => x.operationId));
    expect(ids).toEqual(all.map((r: Draft) => r.operation_id));
    expect(reads[4]!.page.nextCursor).toBeNull();
    expect(ms).toBeLessThan(BUDGET_5_PAGES_MS);
    // Keep the testkit's cursor helper honest about what it issued.
    expect(keysetCursor("f1", "op_00199")).toBe(reads[0]!.page.nextCursor);
  });

  it("a 70,000 character text in every text field is refused fast, not scanned", () => {
    for (const path of [["page", "rows", 0, "operation_id"], ["page", "rows", 0, "command_key"], ["page", "rows", 0, "target", "id"], ["workspace_id"]] as const) {
      const body = clone(links.queue);
      setPath(body, path, "a".repeat(70_000));
      const { value, ms } = timed(() => queueOf(body));
      expect(value, path.join(".")).toBeNull();
      expect(ms, path.join(".")).toBeLessThan(100);
    }
  });
});

/* ═════════════════════════ L3 ═════════════════════════ */
interface Case { name: string; category: string; value: unknown; probe: string | null }
const BODY = links.queue;
const ROW = ["page", "rows", 0] as const;
const LINK0 = [...ROW, "incident_links", "items", 0] as const;
const DIM = ["page", "status_counts", "dimensions"] as const;

const word = (path: readonly (string | number)[], valid: readonly string[]) => enumCases(BODY, path, valid);
const ENUMS: Case[] = [
  ...word([...ROW, "severity"], SEVERITIES_V2),
  ...word([...ROW, "source_status"], SOURCE_STATUSES_V2),
  ...word([...ROW, "verification_result"], VERIFICATION_RESULTS_V2),
  ...word([...ROW, "triage_state"], TRIAGE_STATES_V2),
  ...word([...ROW, "risk_tier"], RISK_TIERS_V2),
  ...word([...ROW, "environment"], ["PAPER", "SANDBOX", "LIVE"]),
  ...word([...ROW, "source_authority"], ["PORTAL", "EXECUTION", "BROKER"]),
  ...word([...ROW, "target", "type"], TARGET_TYPES_V2),
  ...word([...LINK0, "relationship"], ["TRIGGERED_BY", "MITIGATES", "RELATED"]),
  ...word([...LINK0, "state"], ["LINKED", "NOT_ATTESTED"]),
  ...word([...LINK0, "incident", "severity"], SEVERITIES_V2),
  ...word([...LINK0, "incident", "workflow_state"], ["OPEN", "MITIGATED", "RESOLVED"]),
  ...word([...LINK0, "incident", "environment"], ["PAPER", "SANDBOX", "LIVE"]),
  ...word(["read_truth", "state"], ["AVAILABLE", "EMPTY"]),
  ...word(["supported_target_types", 0], TARGET_TYPES_V2),
];
const INTEGERS: Case[] = [
  ...integerCases(BODY, ["page", "total_count"]),
  ...integerCases(BODY, ["page", "filtered_count"]),
  ...integerCases(BODY, [...ROW, "workflow_version"]),
  ...integerCases(BODY, [...ROW, "incident_links", "authorized_link_count"]),
  ...integerCases(BODY, [...ROW, "incident_links", "bound"]),
  ...integerCases(BODY, [...DIM, "severity", "total"]),
  ...integerCases(BODY, [...DIM, "severity", "counts", "INFO"]),
  ...integerCases(BODY, [...DIM, "triage_state", "counts", "RESOLVED"]),
  ...integerCases(BODY, ["observed_at_ms"]),
];
const STRINGS: Case[] = [
  ...stringCases(BODY, [...ROW, "operation_id"]),
  ...stringCases(BODY, [...ROW, "command_key"]),
  ...stringCases(BODY, [...ROW, "target", "id"]),
  ...stringCases(BODY, [...ROW, "created_at"]),
  ...stringCases(BODY, [...ROW, "updated_at"]),
  ...stringCases(BODY, ["workspace_id"]),
  ...stringCases(BODY, [...LINK0, "incident_id"]),
  ...stringCases(BODY, [...LINK0, "linked_at"]),
  ...stringCases(BODY, [...LINK0, "link_history", "reason_code"]),
  ...stringCases(BODY, [...ROW, "incident_links", "basis"]),
  ...stringCases(BODY, ["page", "status_counts", "basis"]),
];
const INSTANTS = ["22 Aug 2026", "2026-08-22", "2026-08-22 12:00:00Z", "2026-08-22T12:00:00", "2026-08-22T12:00:00+01:00", "2026-13-01T00:00:00Z", "2026-08-22T25:00:00Z",
  "2026-02-30T00:00:00Z", "1787400000000", "2026-08-22T12:00:00.1234567890Z", "2026-08-22t12:00:00z", " 2026-08-22T12:00:00Z", "2026-08-22T12:00:00Z\n"];
const INSTANT_CASES: Case[] = INSTANTS.flatMap((value) => [
  { name: `instant: created_at <- ${JSON.stringify(value)}`, category: "malformed-decimal", value: (() => { const b = clone(BODY); setPath(b, [...ROW, "created_at"], value); return b; })(), probe: null },
  { name: `instant: link linked_at <- ${JSON.stringify(value)}`, category: "malformed-decimal", value: (() => { const b = clone(BODY); setPath(b, [...LINK0, "linked_at"], value); return b; })(), probe: null },
]);
const ARRAYS: Case[] = [
  ...arrayCases(BODY, ["page", "rows"], { idKey: "operation_id" }),
  ...arrayCases(BODY, ["page", "applied_filters"]),
  ...arrayCases(BODY, ["page", "applied_sort"]),
  ...arrayCases(BODY, ["supported_target_types"]),
  ...arrayCases(BODY, [...ROW, "incident_links", "items"], { idKey: "incident_id" }),
];
const nullable = new Set(["acknowledged_at", "resolved_at", "next_cursor", "prev_cursor", "source_as_of_ms"]);
const REQUIRED_PATHS: (readonly (string | number)[])[] = [
  ["schema_version"], ["workspace_id"], ["record_authority"], ["record_basis"], ["coverage"], ["supported_target_types"], ["source_integration_state"],
  ["source_side_effect_requested"], ["source_as_of_ms"], ["observed_at_ms"], ["read_truth"], ["read_truth", "state"], ["read_truth", "reason_code"], ["read_truth", "scope"], ["page"],
  ["page", "rows"], ["page", "total_count"], ["page", "filtered_count"], ["page", "next_cursor"], ["page", "prev_cursor"], ["page", "has_more"], ["page", "has_previous"],
  ["page", "applied_filters"], ["page", "applied_sort"], ["page", "applied_filters", 0, "field"], ["page", "applied_filters", 0, "op"], ["page", "applied_filters", 0, "value"],
  ...["operation_id", "operation_kind", "command_key", "target", "environment", "risk_tier", "severity", "source_authority", "source_status", "verification_result",
    "triage_state", "workflow_version", "acknowledged_at", "resolved_at", "created_at", "updated_at"].map((k) => [...ROW, k] as const),
  [...ROW, "target", "type"], [...ROW, "target", "id"],
  ...["basis", "bound", "authorized_link_count", "truncated", "items"].map((k) => [...ROW, "incident_links", k] as const),
  ...["state", "incident_id", "relationship", "linked_at", "incident", "link_history"].map((k) => [...LINK0, k] as const),
  [...LINK0, "incident", "target"], [...LINK0, "incident", "environment"], [...LINK0, "incident", "severity"], [...LINK0, "incident", "workflow_state"],
  [...LINK0, "link_history", "availability"], [...LINK0, "link_history", "reason_code"],
  ["page", "status_counts", "basis"], ["page", "status_counts", "succeeded_means"], ["page", "status_counts", "dimensions"],
  ...["triage_state", "verification_result", "source_status", "severity"].flatMap((d) => [
    [...DIM, d] as const, [...DIM, d, "own_filter_applied"] as const, [...DIM, d, "total"] as const, [...DIM, d, "counts"] as const,
  ]),
];
const REQUIRED: Case[] = REQUIRED_PATHS.flatMap((p) => {
  const cases = requiredCases(BODY, [p]);
  return nullable.has(String(p[p.length - 1])) ? cases.filter((c) => c.category === "missing-required") : cases.filter((c) => c.category !== "null-vs-absent" || !(p.join(".") === "read_truth.reason_code"));
});
const SCHEMA_SWAP = schemaVersionCases(BODY, ["schema_version"], OPERATIONAL_QUEUE_V2_SCHEMA, [INCIDENT_ROOT_V2_SCHEMA, "portal.execution.operational-workflow.v2"]);
const POLLUTION = pollutionCases(BODY, [[], ["page"], [...ROW], [...ROW, "target"], [...ROW, "incident_links"], [...LINK0], [...LINK0, "incident"], ["page", "status_counts"], [...DIM], [...DIM, "severity", "counts"]]);
const ALL_NEG: Case[] = [...ENUMS, ...INTEGERS, ...STRINGS, ...INSTANT_CASES, ...ARRAYS, ...REQUIRED, ...SCHEMA_SWAP, ...POLLUTION];

/**
 * What the reader accepts although the published schema forbids it. Each entry
 * needs a DEFECT test; an accepted schema-invalid case outside this list fails
 * the suite, so a new looseness cannot slip in unseen. F5c closed OQ-1..OQ-7,
 * so the list is empty.
 */
const KNOWN_GAPS: ((c: Case) => boolean)[] = [];
const acceptedBySchemaGap = (c: Case): boolean => c.category === "prototype-pollution" || KNOWN_GAPS.some((gap) => gap(c));

describe("L3 · negative", () => {
  it("reports the case counts", () => {
    const by = new Map<string, number>();
    for (const c of ALL_NEG) by.set(c.category, (by.get(c.category) ?? 0) + 1);
    console.info(`operationalQueue L3: ${ALL_NEG.length} cases (${[...by.entries()].map(([k, v]) => `${k} ${v}`).join(", ")}), ${rootCases().length} root cases, ${INSTANT_CASES.length} instants`);
    expect(ALL_NEG.length).toBeGreaterThan(350);
  });

  it.each(ALL_NEG.map((c) => [c.name, c] as const))("%s", (_name, c) => {
    expect(() => readOperationalQueueV2(c.value)).not.toThrow();
    const read = readOperationalQueueV2(c.value);
    expect(leaked(read, c.probe)).toBe(false);
    expect(prototypeIsClean()).toBe(true);
    if (c.category === "schema-swapped") {
      // A body of another version is never a queue.
      expect(read === null || read.kind === "unsupported_shape").toBe(true);
      return;
    }
    // Null and the typed unsupported_shape are both refusals; only a queue is an acceptance.
    if (read === null || read.kind === "unsupported_shape") return;
    // Accepted: fine when the payload is schema-valid (a shorter list, a null that is allowed), else only a documented defect.
    if (queueViolations(c.value).length > 0) expect(acceptedBySchemaGap(c), `accepted though schema-invalid: ${c.name}`).toBe(true);
    if (c.category === "prototype-pollution") expect(read).toEqual(readOperationalQueueV2(BODY));
  });

  it("an unknown word is never a row: no enum case yields a queue", () => {
    for (const c of ENUMS) expect(readOperationalQueueV2(c.value), c.name).toBeNull();
  });

  it.each(rootCases().map((c) => [c.name, c] as const))("%s is never a queue or an incident", (_name, c) => {
    expect(() => readOperationalQueueV2(c.value)).not.toThrow();
    const queue = readOperationalQueueV2(c.value);
    expect(queue === null || queue.kind === "unsupported_shape").toBe(true);
    expect(() => readIncidentRootV2(c.value)).not.toThrow();
    const incident = readIncidentRootV2(c.value);
    expect(incident === null || incident.kind === "unsupported_shape").toBe(true);
    // A non-object has no version to report.
    if (typeof c.value !== "object" || c.value === null) expect(queue).toBeNull();
  });

  it("instants: every malformed spelling is refused ", () => {
    for (const c of INSTANT_CASES) expect(readOperationalQueueV2(c.value), c.name).toBeNull();
  });

  it("prints how much looser the reader is than the published schema, by category", () => {
    const gap = new Map<string, string[]>();
    let invalid = 0;
    for (const c of ALL_NEG) {
      if (c.category === "schema-swapped" || c.category === "prototype-pollution") continue;
      if (queueViolations(c.value).length === 0) continue;
      invalid += 1;
      if (queueOf(c.value) !== null) gap.set(c.category, [...(gap.get(c.category) ?? []), c.name]);
    }
    const accepted = [...gap.values()].reduce((n, v) => n + v.length, 0);
    console.info(`operationalQueue L3 gap: reader accepts ${accepted} of ${invalid} schema-invalid payloads; ${[...gap.entries()].map(([k, v]) => `${k} ${v.length}`).join(", ")}`);
    for (const [category, names] of gap) console.info(`  ${category}: e.g. ${names.slice(0, 4).join(" | ")}`);
    expect(invalid).toBeGreaterThan(200);
  });

  describe("the incident root", () => {
    const root = current.incident;
    const cases: Case[] = [
      ...enumCases(root, ["severity"], SEVERITIES_V2), ...enumCases(root, ["workflow_state"], ["OPEN", "MITIGATED", "RESOLVED"]),
      ...enumCases(root, ["environment"], ["PAPER", "SANDBOX", "LIVE"]), ...enumCases(root, ["target", "type"], TARGET_TYPES_V2),
      ...integerCases(root, ["workflow_version"]), ...integerCases(root, ["observed_at_ms"]),
      ...requiredCases(root, [["incident_id"], ["workspace_id"], ["target"], ["created_at"], ["historical_children"], ["source_side_effect_requested"], ["deployment_resume_requested"], ["record_basis"]]).filter((c) => c.category === "missing-required"),
    ];
    it.each(cases.map((c) => [c.name, c] as const))("%s", (_name, c) => {
      expect(() => readIncidentRootV2(c.value)).not.toThrow();
      const read = readIncidentRootV2(c.value);
      expect(read === null || read.kind === "unsupported_shape", c.name).toBe(true);
    });
    it("lifecycle: state and timestamps must agree", () => {
      const at = "2026-08-22T12:30:00Z";
      const wrongs: [string, (i: Draft) => void][] = [
        ["OPEN with mitigated_at", (i) => { i.mitigated_at = at; }],
        ["OPEN with resolved_at", (i) => { i.resolved_at = at; }],
        ["MITIGATED without mitigated_at", (i) => { i.workflow_state = "MITIGATED"; }],
        ["MITIGATED with resolved_at", (i) => { i.workflow_state = "MITIGATED"; i.mitigated_at = at; i.resolved_at = at; }],
        ["RESOLVED without resolved_at", (i) => { i.workflow_state = "RESOLVED"; }],
        ["updated before created", (i) => { i.updated_at = "2026-08-22T11:00:00Z"; }],
        ["resume requested", (i) => { i.deployment_resume_requested = true; }],
        ["side effect requested", (i) => { i.source_side_effect_requested = true; }],
      ];
      for (const [name, edit] of wrongs) {
        const i = clone(root);
        edit(i);
        expect(readIncidentRootV2(i), name).toBeNull();
      }
    });
  });
});

/* ═══════════════ fixed defects, now ordinary tests ═══════════════ */
describe("fixed defects (F5c)", () => {
  /*
   * DEFECT OQ-1 (readPage): two rows with one operation_id in a page are both
   * kept. A queue table keys rows by operation_id, so React draws two rows with
   * one key. The cockpit inbox reader counts such repeats as dropped (D6); this
   * one neither collapses nor counts them.
   */
  it("FIXED OQ-1: a page with a repeated operation_id is refused or collapsed to unique rows", () => {
    const body = clone(links.queue);
    body.page.rows = [body.page.rows[0], clone(body.page.rows[0])];
    body.page.total_count = 2;
    body.page.filtered_count = 2;
    body.page.applied_filters = [];
    delete body.page.status_counts;
    const read = queueOf(body);
    const ids = read === null ? [] : read.page.rows.map((r) => r.operationId);
    expect(ids).toEqual([body.page.rows[0].operation_id]);
    expect(read!.page.droppedDuplicateRows).toBe(1);
  });

  /*
   * DEFECT OQ-2 (`text()`): operation_id, target.id and incident_id are any
   * non-empty string up to 512 characters, so an id with a control character,
   * a space or markup is accepted. The schema's Identifier pattern is
   * ^[A-Za-z0-9._:-]{1,191}$ and command_key is ^[a-z0-9-]+/(?:[a-z0-9-]+|<root>)$.
   */
  it("FIXED OQ-2: an operation_id outside the Identifier pattern is refused", () => {
    for (const id of ["a b", "a/b", "<b>x</b>", "x".repeat(192), "\u0000", "‮evil"]) {
      const body = clone(links.queue);
      body.page.rows[0].operation_id = id;
      expect(queueOf(body), id).toBeNull();
    }
  });

  it("FIXED OQ-2b: a command_key outside the published pattern is refused", () => {
    for (const key of ["Account Sync", "account", "account/sync/x", "ACCOUNT/SYNC", "a b/c"]) {
      const body = clone(links.queue);
      body.page.rows[0].command_key = key;
      expect(queueOf(body), key).toBeNull();
    }
  });

  /*
   * DEFECT OQ-3 (`count()` and readUtcEpochMs): workflow_version is any
   * non-negative integer where the schema's minimum is 1, and observed_at_ms
   * accepts a negative epoch where the schema's minimum is 0.
   */
  it("FIXED OQ-3: workflow_version 0 is refused (schema minimum 1)", () => {
    const body = clone(links.queue);
    body.page.rows[0].workflow_version = 0;
    expect(queueOf(body)).toBeNull();
  });

  it("FIXED OQ-3b: a negative observed_at_ms is refused (schema minimum 0)", () => {
    const body = clone(links.queue);
    body.observed_at_ms = -1;
    expect(queueOf(body)).toBeNull();
  });

  /*
   * DEFECT OQ-6 (readInstant): the instant is rebuilt as a string and handed to
   * Date.parse, which rolls 2026-02-30 over to 2 March. The reader then keeps
   * the original text in `iso` and a different day in `ms`.
   */
  it("FIXED OQ-6: a calendar-impossible date is refused, not shifted", () => {
    expect(readInstant("2026-02-30T00:00:00Z")).toBeNull();
    expect(readInstant("2026-04-31T00:00:00Z")).toBeNull();
  });

  /*
   * DEFECT OQ-7 (readOperationalQueueV2): `record_basis` and `coverage` are
   * constants in the schema (PORTAL_CURRENT_OPERATIONAL_WORKFLOW,
   * AUTHORIZED_SUPPORTED_TARGETS_ONLY) and name what the queue is: a Portal
   * workflow record over authorized targets only. A body that says otherwise
   * (or says nothing) is read as a queue all the same.
   */
  it("FIXED OQ-7: a queue whose record_basis or coverage is not the published constant is refused", () => {
    for (const [key, value] of [["record_basis", "SOURCE_BROKER_FACTS"], ["coverage", "ALL_TARGETS"], ["record_basis", undefined], ["coverage", undefined]] as const) {
      const body = clone(links.queue);
      if (value === undefined) delete body[key];
      else body[key] = value;
      expect(queueOf(body), `${key} ${String(value)}`).toBeNull();
    }
  });

  /*
   * DEFECT OQ-4 (readPage): the page is not bounded. The schema allows 250
   * rows, 10 applied filters and 2 sort keys; the reader reads any number.
   */
  it("FIXED OQ-4: a page of 251 rows (schema maxItems 250) is refused", () => {
    const body = clone(links.queue);
    body.page.rows = cloneRows(body.page.rows[2] as Draft, 251, (row, i) => { row.operation_id = `op_${pad(i)}`; });
    body.page.total_count = 251;
    body.page.filtered_count = 251;
    body.page.applied_filters = [];
    delete body.page.status_counts;
    expect(queueOf(body)).toBeNull();
  });

  /*
   * DEFECT OQ-5 (readOperationalQueueV2): supported_target_types is any list of
   * known words; the schema fixes it to exactly [ACCOUNT, PORTFOLIO, DEPLOYMENT]
   * in that order. A list of one (or a repeat) would tell the screen that only
   * that type is supported.
   */
  it("FIXED OQ-5: supported_target_types other than the three published, in order, is refused", () => {
    for (const list of [["ACCOUNT"], ["ACCOUNT", "ACCOUNT", "ACCOUNT"], ["DEPLOYMENT", "PORTFOLIO", "ACCOUNT"], []]) {
      const body = clone(links.queue);
      body.supported_target_types = list;
      expect(queueOf(body), JSON.stringify(list)).toBeNull();
    }
  });
});
