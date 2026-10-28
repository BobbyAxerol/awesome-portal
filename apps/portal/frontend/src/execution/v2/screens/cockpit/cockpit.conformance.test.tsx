/**
 * Reader conformance for the cockpit's two pure layers (Rules 9.8.3, L0 to L3):
 * `inboxRowV2.ts` (wire row to typed row) and `laneModel.ts` (typed row to lane,
 * lens, SLA, quorum, separation-of-duty words). The Queue component is rendered
 * with the model's output wherever a DOM claim is made; the route is not.
 *
 * L0  `governance.approval-inbox.v1` verbatim; digest unchanged at the end.
 * L1  C1: gate x status x creator x inert x needs_you x SLA x quorum x blockers
 *     (15,360 states, all schema-valid). Lane and lens partitions are checked at
 *     set level against an oracle written from the lane/lens rules, the SLA
 *     and quorum words against the rules in laneModel's header.
 *     C2: SLA age x budget x state grid; separation-of-duty grid; access grid.
 * L2  200 rows over 4 keyset pages, 250 rows and above 1 MiB in one page,
 *     12 creators, 30 subjects; time budgets; Queue DOM cap.
 * L3  negative payloads. D5 to D8 were reader defects found here; F5b fixed them and they
 *     are ordinary tests now (counts via Number.isSafeInteger, repeats counted as dropped,
 *     unknown status stays Open, ids held to the Identifier pattern).
 */
import { cleanup, render, within } from "@testing-library/react";
import { afterAll, afterEach, describe, expect, it } from "vitest";

import { V2_CAPABILITY } from "../../shell/roleNav";
import { canonicalDigest, loadCanonical, schemaEnum } from "../../testkit/loadCanonical";
import { cartesian, coverage, describeCoverage, dimension, dimensionOf, pairwise, type Draft } from "../../testkit/matrix";
import {
  arrayCases, enumCases, integerCases, leaked, pollutionCases, prototypeIsClean, requiredCases, rootCases, schemaVersionCases, stringCases,
  type NegativeCase,
} from "../../testkit/negative";
import { cloneRows, cursorFilter, fillToBytes, MIB, pad, serializedBytes, splitIntoPages, timed } from "../../testkit/scale";
import { validateAgainst } from "../../testkit/schema";
import { inboxRowFromV1, readInboxPageV2, readInboxRowV2, readInboxSla, } from "./inboxRowV2";
import {
  CLOSED_STATUSES, deriveAccess, formatMinutes, gateItems, instantText, isClosedRow, isYours, LANES, lensCounts, NO_PRINCIPAL, principalOf, quorumCells,
  quorumText, sameActor, separationOfDuty, slaView, statusClassOf, stepSelection, summarizeEvidence, type Lane, type Lens, type Principal,
} from "./laneModel";
import { MAX_QUEUE_DOM, Queue } from "./Queue";

afterEach(cleanup);

const BUDGET_READ_250_MS = 400;
const BUDGET_READ_1MIB_MS = 600;
const BUDGET_LANES_MS = 600;
const BUDGET_QUEUE_RENDER_MS = 6000;

const NAME = "execution-governance.approval-inbox";
const SCHEMA = "execution-governance-product.v1";
const digestBefore = canonicalDigest(NAME);
afterAll(() => { expect(canonicalDigest(NAME)).toBe(digestBefore); });

const canonical = loadCanonical<Draft>(NAME);
const baseRow: Draft = canonical.page.rows[0];
const GATES = schemaEnum(SCHEMA, "/$defs/ApprovalInboxItem/properties/gate");
const STATUSES = schemaEnum(SCHEMA, "/$defs/ApprovalInboxItem/properties/status");
const SLA_STATES = schemaEnum(SCHEMA, "/$defs/ApprovalInboxItem/properties/sla/properties/state");
const BOBBY: Principal = principalOf({ userId: "usr_bobby", username: "bobby" });

const envViolations = (value: unknown) => validateAgainst(SCHEMA, "/$defs/ApprovalInboxResponse", value);
const rowViolations = (value: unknown) => validateAgainst(SCHEMA, "/$defs/ApprovalInboxItem", value);

const LANE_OF: Record<string, Exclude<Lane, "all" | "waiver">> = { R1: "r1", R2: "r2", PAPER_EXIT: "exit", SANDBOX_EXIT: "exit", LIVE_GATE: "live" };
const GATE_LANES = LANES.filter((l): l is Exclude<Lane, "waiver"> => l !== "waiver");
const LENS_LIST: Lens[] = ["open", "needs", "yours", "closed"];

function envelopeOf(rows: Draft[], page: Partial<Draft> = {}): Draft {
  const env = structuredClone(canonical);
  env.page.rows = rows;
  env.page.total_count = rows.length;
  env.page.filtered_count = rows.length;
  Object.assign(env.page, page);
  env.counts = { pending: rows.filter((r) => r.status === "PENDING").length, overdue: 0, due_soon: 0 };
  env.read_truth = rows.length === 0 ? { state: "EMPTY", reason_code: "NO_MATCHING_PORTAL_GOVERNANCE_RECORDS", scope: "REQUEST" } : env.read_truth;
  return env;
}

/* ═════════════════════════ L0 ═════════════════════════ */
describe("L0 · canonical, verbatim", () => {
  it("passes the published schema through the testkit checker", () => {
    expect(envViolations(canonical)).toEqual([]);
    const broken = structuredClone(canonical);
    delete broken.page.rows[0].creator;
    expect(envViolations(broken).length).toBeGreaterThan(0);
  });

  it("reads through the V2 reader and the lane model without change", () => {
    const page = readInboxPageV2(canonical)!;
    expect(page.dropped).toBe(0);
    const row = page.rows[0]!;
    expect(row).toMatchObject({ id: "apr_fixture_r1", gate: "R1", status: "PENDING", needsYou: true, quorumMet: 0, quorumRequired: 1, blockerCount: 0 });
    expect(gateItems({ rows: page.rows, decided: [], lane: "all", lens: "open", principal: BOBBY }).map((i) => i.key)).toEqual(["apr_fixture_r1"]);
    expect(gateItems({ rows: page.rows, decided: [], lane: "r1", lens: "yours", principal: principalOf({ userId: "usr_stan" }) }).map((i) => i.key)).toEqual(["apr_fixture_r1"]);
    expect(slaView(row.sla)).toMatchObject({ phrase: "3h 55m left", detail: "5 of 240 min used", overdue: false, dueSoon: false });
    expect(quorumText(row.quorumMet, row.quorumRequired)).toBe("0 of 1 approvers");
  });

  it("is loaded as an independent copy each time", () => {
    const a = loadCanonical<Draft>(NAME);
    a.page.rows[0].id = "changed";
    expect(loadCanonical<Draft>(NAME).page.rows[0].id).toBe("apr_fixture_r1");
  });
});

/* ═════════════════════════ L1 · C1 ═════════════════════════ */
const slaOption = (state: string, age: number, budget: number) => ({
  label: `${state}@${age}/${budget}`,
  apply: (d: Draft) => { d.sla = { ...d.sla, state, age_minutes: age, budget_minutes: budget }; },
});
const AXES_C1 = [
  dimension("gate", ["gate"], GATES),
  dimension("status", ["status"], STATUSES),
  dimensionOf("creator", [
    { label: "other", apply: () => undefined },
    { label: "me", apply: (d: Draft) => { d.creator = { user_id: "usr_bobby", username: "bobby" }; } },
  ]),
  dimension("inert", ["inert"], [null, "SELF", "QUORUM", "BLOCKED"]),
  dimension("needs_you", ["needs_you"], [true, false]),
  dimensionOf("sla", [slaOption("ON_TRACK", 5, 240), slaOption("DUE_SOON", 200, 240), slaOption("OVERDUE", 300, 240), slaOption("EXPIRED", 1500, 240)]),
  dimensionOf("quorum", [
    { label: "0/1", apply: (d: Draft) => { d.quorum_met = 0; d.quorum_required = 1; } },
    { label: "1/1", apply: (d: Draft) => { d.quorum_met = 1; d.quorum_required = 1; } },
    { label: "1/2", apply: (d: Draft) => { d.quorum_met = 1; d.quorum_required = 2; } },
    { label: "0/8", apply: (d: Draft) => { d.quorum_met = 0; d.quorum_required = 8; } },
  ]),
  dimensionOf("blockers", [
    { label: "0", apply: (d: Draft) => { d.blocker_count = 0; d.blocker_summary = null; } },
    { label: "2", apply: (d: Draft) => { d.blocker_count = 2; d.blocker_summary = "Two blockers: stress inputs and lineage"; } },
  ]),
];

describe("L1 · C1 · row states through reader and lane model", () => {
  const all = cartesian(baseRow, AXES_C1);
  const pairs = pairwise(baseRow, AXES_C1);
  const wire = all.map((s, i) => {
    const r = structuredClone(s.value) as Draft;
    r.id = `apr_c1_${pad(i)}`;
    return r;
  });
  const typed = wire.map((r) => readInboxRowV2(r)!);

  it("prints its size and proves the pairwise subset covers every possible pair", () => {
    const full = coverage(AXES_C1, all);
    const part = coverage(AXES_C1, pairs);
    console.info(describeCoverage("cockpit C1 cartesian", full));
    console.info(describeCoverage("cockpit C1 pairwise", part));
    expect(all).toHaveLength(5 * 6 * 2 * 4 * 2 * 4 * 4 * 2);
    expect(part.pairsCovered).toBe(part.pairsPossible);
    expect(full.pairsCovered).toBe(full.pairsPossible);
  });

  it("every state is a valid L1 state: the published schema accepts the row", () => {
    const bad = wire.map((r, i) => [all[i]!.name, rowViolations(r)] as const).filter(([, v]) => v.length > 0);
    expect(bad.slice(0, 3)).toEqual([]);
  });

  it("the reader carries each published field verbatim: a counted zero stays 0, nothing is repaired or invented", () => {
    const wrong: string[] = [];
    wire.forEach((r, i) => {
      const t = typed[i];
      const name = all[i]!.name;
      if (!t) { wrong.push(`${name}: refused`); return; }
      if (t.gate !== r.gate || t.status !== r.status || t.inert !== r.inert || t.needsYou !== r.needs_you) wrong.push(`${name}: enum or flag changed`);
      if (t.quorumMet !== r.quorum_met || t.quorumRequired !== r.quorum_required || t.blockerCount !== r.blocker_count) wrong.push(`${name}: count changed`);
      if (t.blockerSummary !== r.blocker_summary) wrong.push(`${name}: blocker summary changed`);
      if (t.sla?.state !== r.sla.state || t.sla?.ageMinutes !== r.sla.age_minutes || t.sla?.budgetMinutes !== r.sla.budget_minutes) wrong.push(`${name}: sla changed`);
      if (t.creator?.userId !== r.creator.user_id || t.creator?.username !== r.creator.username) wrong.push(`${name}: creator changed`);
    });
    expect(wrong.slice(0, 5)).toEqual([]);
  });

  it("every lane x lens list is exactly what the lane and lens rules say, in server order", () => {
    const yours = (r: Draft) => r.inert === "SELF" || r.creator?.user_id === "usr_bobby" || r.requester?.user_id === "usr_bobby";
    const wrong: string[] = [];
    for (const lane of GATE_LANES) {
      for (const lens of LENS_LIST) {
        const inLane = (r: Draft) => lane === "all" || LANE_OF[r.gate] === lane;
        const want = wire.filter((r) => inLane(r) && (lens === "closed" ? r.status !== "PENDING" : r.status === "PENDING"))
          .filter((r) => (lens === "needs" ? r.needs_you === true : lens === "yours" ? yours(r) : true)).map((r) => r.id);
        const got = gateItems({ rows: typed, decided: [], lane, lens, principal: BOBBY }).map((i) => i.key);
        if (got.join() !== want.join()) wrong.push(`${lane}/${lens}: ${got.length} vs ${want.length}`);
      }
      const counts = lensCounts(typed, lane, BOBBY);
      const sizes = (["open", "needs", "yours"] as const).map((lens) => gateItems({ rows: typed, decided: [], lane, lens, principal: BOBBY }).length);
      if ([counts.open, counts.needs, counts.yours].join() !== sizes.join()) wrong.push(`${lane}: lens counts differ from lens lists`);
    }
    expect(wrong).toEqual([]);
  });

  it("a waiver never appears in a gate lane, and a row is in at most one of open and closed", () => {
    const open = new Set(gateItems({ rows: typed, decided: [], lane: "all", lens: "open", principal: BOBBY }).map((i) => i.key));
    const closed = new Set(gateItems({ rows: typed, decided: [], lane: "all", lens: "closed", principal: BOBBY }).map((i) => i.key));
    expect([...open].filter((k) => closed.has(k))).toEqual([]);
    expect(open.size + closed.size).toBe(typed.length);
  });

  it("SLA, quorum and separation-of-duty words follow the rules, and never draw a finished state for an unfinished row", () => {
    const wrong: string[] = [];
    typed.forEach((t, i) => {
      const name = all[i]!.name;
      const sla = slaView(t.sla);
      const remaining = t.sla!.budgetMinutes - t.sla!.ageMinutes;
      if (sla === null) { wrong.push(`${name}: sla view missing`); return; }
      if (sla.overdue !== (t.sla!.state === "OVERDUE" || t.sla!.state === "EXPIRED")) wrong.push(`${name}: overdue flag`);
      if (sla.dueSoon !== (t.sla!.state === "DUE_SOON")) wrong.push(`${name}: dueSoon flag`);
      if (remaining < 0 && /left/.test(sla.phrase)) wrong.push(`${name}: past budget drawn as time left`);
      if (remaining >= 0 && !sla.overdue && !sla.phrase.endsWith("left")) wrong.push(`${name}: phrase`);
      if (sla.fill < 0 || sla.fill > 100) wrong.push(`${name}: fill ${sla.fill}`);
      if (sla.detail !== `${t.sla!.ageMinutes} of ${t.sla!.budgetMinutes} min used`) wrong.push(`${name}: detail`);
      if (quorumText(t.quorumMet, t.quorumRequired) !== `${t.quorumMet} of ${t.quorumRequired} approvers`) wrong.push(`${name}: quorum text`);
      const cells = quorumCells(t.quorumMet, t.quorumRequired);
      if (cells.length !== t.quorumRequired || cells.filter(Boolean).length !== Math.min(t.quorumMet!, t.quorumRequired!)) wrong.push(`${name}: quorum cells`);
      const sod = separationOfDuty({ creator: t.creator, serverSod: null, principal: BOBBY });
      const mine = t.creator?.userId === "usr_bobby";
      if (mine ? sod.kind !== "violation" : sod.kind !== "ok") wrong.push(`${name}: separation of duty ${sod.kind}`);
      if (isYours(t, BOBBY) !== (t.inert === "SELF" || mine)) wrong.push(`${name}: isYours`);
      if (isClosedRow(t) !== (t.status !== "PENDING")) wrong.push(`${name}: closed`);
    });
    expect(wrong.slice(0, 5)).toEqual([]);
  });

  it("the Queue draws each pairwise state with a non-final flag and never a success kind", () => {
    const items = pairs.slice(0, MAX_QUEUE_DOM).map((s, i) => {
      const r = structuredClone(s.value) as Draft;
      r.id = `apr_q_${pad(i)}`;
      r.subject = `Request ${pad(i)}`;
      return { kind: "gate" as const, key: r.id as string, row: readInboxRowV2(r)! };
    });
    expect(pairs.length).toBeLessThanOrEqual(MAX_QUEUE_DOM);
    const { container } = render(<Queue {...queueProps(items)} />);
    const lis = [...container.querySelectorAll("ul li")];
    expect(lis).toHaveLength(items.length);
    const problems: string[] = [];
    lis.forEach((li, i) => {
      const row = items[i]!.row;
      const kinds = [...li.querySelectorAll(".exec-flag")].map((f) => f.getAttribute("data-k"));
      if (kinds.some((k) => k === "ok" || k === "applied")) problems.push(`${row.id}: success flag ${kinds.join()}`);
      const text = li.textContent ?? "";
      const sla = slaView(row.sla)!;
      if (isClosedRow(row)) {
        if (!kinds.includes("neutral")) problems.push(`${row.id}: closed row has no neutral flag`);
      } else if (sla.overdue) {
        // QA8 N8c-05: overdue is a warning state, not rejected or failed.
        if (!kinds.includes("attention")) problems.push(`${row.id}: overdue row has no warning (attention) flag`);
        if (kinds.includes("rejected")) problems.push(`${row.id}: overdue row wears the rejected glyph`);
      } else if (!kinds.includes("pending")) {
        problems.push(`${row.id}: open row has no pending flag`);
      }
      if (row.needsYou !== true && !isClosedRow(row) && /Needs you/.test(li.querySelector(".exec-ck-qf")?.textContent ?? "") ) problems.push(`${row.id}: needs-you without the flag`);
      if (!text.includes(sla.phrase)) problems.push(`${row.id}: sla phrase missing`);
      if (/\b(NaN|undefined|null)\b|—|–|N\/A/.test(text)) problems.push(`${row.id}: placeholder text`);
    });
    expect(problems).toEqual([]);
  });
});

function queueProps(items: Parameters<typeof Queue>[0]["items"]): Parameters<typeof Queue>[0] {
  return {
    lane: "all", onLane: () => undefined, lens: "open", onLens: () => undefined, waiverFilter: "ALL", onWaiverFilter: () => undefined,
    items, selectedKey: null, onSelect: () => undefined, loading: false, failure: null, partialNote: null, lensCounts: null,
    moreAvailable: false, onMore: () => undefined, moreBusy: false, moreError: null, footer: `${items.length} requests`, principal: BOBBY, historyNote: null,
  };
}

/* ═════════════════════════ L1 · C2 ═════════════════════════ */
describe("L1 · C2 · SLA grid, separation of duty, access", () => {
  const ages = [0, 1, 239, 240, 241, 1440, 100_000];
  const budgets = [0, 1, 240, 1440];
  const states = [...SLA_STATES, null];
  const grid = ages.flatMap((age) => budgets.flatMap((budget) => states.map((state) => ({ age, budget, state }))));

  it("prints the grid size", () => {
    console.info(`cockpit C2 SLA grid: ${ages.length} ages x ${budgets.length} budgets x ${states.length} states = ${grid.length} states`);
    expect(grid).toHaveLength(7 * 4 * 5);
  });

  it("an SLA with no budget is no SLA; otherwise the words are the arithmetic of age and budget, never a rounding", () => {
    const wrong: string[] = [];
    for (const { age, budget, state } of grid) {
      const sla = readInboxSla({ age_minutes: age, budget_minutes: budget, ...(state === null ? {} : { state }) });
      const view = slaView(sla);
      const name = `${state}@${age}/${budget}`;
      if (sla === null) { wrong.push(`${name}: refused`); continue; }
      if (budget <= 0) { if (view !== null) wrong.push(`${name}: view for no budget`); continue; }
      if (view === null) { wrong.push(`${name}: no view`); continue; }
      const remaining = budget - age;
      const overdue = state === "OVERDUE" || state === "EXPIRED";
      if (remaining < 0 && /left/.test(view.phrase)) wrong.push(`${name}: past budget as time left`);
      if (remaining < 0 && !view.phrase.includes(formatMinutes(-remaining))) wrong.push(`${name}: past amount`);
      if (remaining >= 0 && !overdue && view.phrase !== `${formatMinutes(remaining)} left`) wrong.push(`${name}: left phrase ${view.phrase}`);
      if (remaining >= 0 && overdue && view.phrase !== "due now") wrong.push(`${name}: overdue-with-time phrase ${view.phrase}`);
      if (view.overdue !== overdue) wrong.push(`${name}: overdue flag`);
      if (view.fill !== Math.min(100, (age / budget) * 100)) wrong.push(`${name}: fill`);
      if (state === null && (view.overdue || view.dueSoon)) wrong.push(`${name}: a verdict the source did not give`);
    }
    expect(wrong.slice(0, 5)).toEqual([]);
  });

  it("formatMinutes decomposes exactly and clamps what is not a duration", () => {
    for (const total of [0, 1, 59, 60, 61, 125, 239, 240, 1439, 1440, 1441, 99_999, 10_000_000]) {
      const text = formatMinutes(total);
      const read = (unit: string) => Number(new RegExp(`(\\d+)${unit}`).exec(text)?.[1] ?? 0);
      expect(read("d") * 1440 + read("h") * 60 + read("m"), text).toBe(total);
    }
    expect(formatMinutes(0)).toBe("0m");
    expect(formatMinutes(-5)).toBe("0m");
    expect(formatMinutes(Number.NaN)).toBe("0m");
    expect(formatMinutes(2.9)).toBe("2m");
  });

  it("quorum words: a published zero stays '0 of N', an absence is null, never a number", () => {
    expect(quorumText(0, 2)).toBe("0 of 2 approvers");
    expect(quorumText(null, 2)).toBeNull();
    expect(quorumText(1, null)).toBeNull();
    expect(quorumText(null, null)).toBeNull();
    expect(quorumCells(null, 3)).toEqual([]);
    expect(quorumCells(0, 0)).toEqual([]);
    expect(quorumCells(0, 13)).toEqual([]);
    expect(quorumCells(2, 3)).toEqual([true, true, false]);
  });

  it("who is who: an unknown creator is neither mine nor someone else's; any matching id or name is mine", () => {
    const grid2: [string, Parameters<typeof sameActor>[0], Principal, boolean | null][] = [
      ["no actor", null, BOBBY, null],
      ["no principal", { userId: "usr_x", username: "x" }, NO_PRINCIPAL, null],
      ["same id", { userId: "usr_bobby", username: "other" }, BOBBY, true],
      ["same name", { userId: "usr_other", username: "bobby" }, BOBBY, true],
      ["different both", { userId: "usr_stan", username: "stan" }, BOBBY, false],
      ["id only, different", { userId: "usr_stan", username: null }, BOBBY, false],
      ["name only, none comparable", { userId: null, username: "stan" }, principalOf({ userId: "usr_bobby" }), null],
    ];
    for (const [label, actor, principal, want] of grid2) expect(sameActor(actor, principal), label).toBe(want);
  });

  it("separation of duty never says OK for a creator it could not read", () => {
    const creators = [null, { userId: "usr_bobby", username: "bobby" }, { userId: "usr_stan", username: "stan" }];
    const principals = [BOBBY, NO_PRINCIPAL];
    const servers: ("OK" | "VIOLATION" | null)[] = [null, "OK", "VIOLATION"];
    let count = 0;
    for (const creator of creators) for (const principal of principals) for (const serverSod of servers) {
      count += 1;
      const same = sameActor(creator, principal);
      const sod = separationOfDuty({ creator, serverSod, principal });
      const label = `${creator?.username ?? "no creator"}/${principal === BOBBY ? "known" : "anonymous"}/${String(serverSod)}`;
      if (same === true || serverSod === "VIOLATION") expect(sod.kind, label).toBe("violation");
      else if (creator === null && serverSod === null) expect(sod.kind, label).toBe("unknown");
      else if (same === false || serverSod === "OK") expect(sod.kind, label).toBe("ok");
      else expect(sod.kind, label).toBe("unknown");
    }
    console.info(`cockpit C2 separation-of-duty grid: ${count} states`);
  });

  it("access: only a read beyond R1 opens decisions; R1 alone is own; no read, or only a role word, is denied", () => {
    const caps = [V2_CAPABILITY.governanceR1Read, V2_CAPABILITY.governanceR2Read, V2_CAPABILITY.governanceLiveRead, V2_CAPABILITY.governanceCanaryRead, "ADMIN"];
    let count = 0;
    for (let mask = 0; mask < 1 << caps.length; mask += 1) {
      const set = new Set(caps.filter((_, bit) => (mask >> bit) & 1));
      const beyond = set.has(V2_CAPABILITY.governanceR2Read) || set.has(V2_CAPABILITY.governanceLiveRead) || set.has(V2_CAPABILITY.governanceCanaryRead);
      const want = beyond ? "decisions" : set.has(V2_CAPABILITY.governanceR1Read) ? "own" : "denied";
      expect(deriveAccess(set).mode, [...set].join()).toBe(want);
      count += 1;
    }
    expect(deriveAccess(new Set(["governance.r1.decide", "governance.r2.decide", "nav:EXECUTION_OPERATIONS"])).mode).toBe("denied");
    console.info(`cockpit C2 access grid: ${count} capability sets`);
  });

  it("instants: an RFC3339 time is UTC words, a word that is not a time is shown as sent, nothing is null", () => {
    expect(instantText("2026-10-17T09:14:00Z")).toBe("17 Oct 09:14Z");
    expect(instantText(canonical.page.rows[0].sla.due_at)).toBe("11 Sep 13:00Z");
    expect(instantText("not a time")).toBe("not a time");
    expect(instantText("")).toBeNull();
    expect(instantText(null)).toBeNull();
    expect(instantText(undefined)).toBeNull();
  });

  it("selection keys stay inside the list", () => {
    const keys = Array.from({ length: 200 }, (_, i) => `k${i}`);
    expect(stepSelection([], null, "next")).toBeNull();
    expect(stepSelection(keys, null, "next")).toBe("k0");
    expect(stepSelection(keys, null, "previous")).toBe("k199");
    expect(stepSelection(keys, "k199", "next")).toBe("k199");
    expect(stepSelection(keys, "k0", "previous")).toBe("k0");
    expect(stepSelection(keys, "gone", "next")).toBe("k0");
  });

  it("evidence with nothing read says nothing: every field null", () => {
    expect(summarizeEvidence(null)).toEqual({
      creator: null, serverSod: null, quorumMet: null, quorumRequired: null, policyVersion: null, workspaceId: null, decided: null, actors: null, latestOperation: null,
    });
  });

  it("the V1 widening keeps its sentinels out of the screen: -1 is absence, never a number", () => {
    const v1 = {
      id: "a", gate: "R1", subject: "s", target: "target not published", blockerCount: -1, blockerSummary: null,
      sla: { ageMinutes: -1, budgetMinutes: -1 }, quorumMet: null, quorumRequired: null, inert: null, needsYou: false,
    } as unknown as Parameters<typeof inboxRowFromV1>[0];
    const widened = inboxRowFromV1(v1);
    expect(widened).toMatchObject({ blockerCount: null, sla: null, target: null, quorumMet: null });
    expect(slaView(widened.sla)).toBeNull();
    expect(quorumText(widened.quorumMet, widened.quorumRequired)).toBeNull();
  });
});

/* ═════════════════════════ L2 · scale ═════════════════════════ */
const FILTER = "view:ALL";
function bigRows(count: number): Draft[] {
  return cloneRows(baseRow, count, (r: Draft, i) => {
    r.id = `apr_${pad(i)}`;
    r.gate = GATES[i % GATES.length];
    r.subject = `Subject ${pad(i)}`;
    r.subject_id = `alpha_${pad(i % 30, 3)}`;
    r.environment = ["RESEARCH", "PAPER", "SANDBOX", "LIVE"][i % 4];
    r.status = i % 5 === 0 ? "APPROVED" : "PENDING";
    r.creator = { user_id: `usr_c${pad(i % 12, 2)}`, username: `creator_${pad(i % 12, 2)}` };
    r.requester = structuredClone(r.creator);
    r.needs_you = i % 3 === 0;
    r.inert = i % 11 === 0 ? "SELF" : null;
    r.sla = { ...r.sla, state: SLA_STATES[i % SLA_STATES.length], age_minutes: (i * 7) % 600, budget_minutes: 240 };
    r.updated_at = `2026-09-11T08:${pad(i % 60, 2)}:00.000Z`;
  });
}
function pagesOf(rows: Draft[], size: number) {
  return splitIntoPages(rows, size, FILTER, (r: Draft) => r.id as string, (slice, info) =>
    envelopeOf(slice, { total_count: rows.length, filtered_count: rows.length, has_more: info.hasMore, next_cursor: info.nextCursor, has_previous: info.hasPrevious, prev_cursor: info.prevCursor }));
}

describe("L2 · scale", () => {
  const rows = bigRows(200);
  const { pages, cursors } = pagesOf(rows, 50);

  it("builds 200 unique rows over 4 keyset pages, 30 subjects, 12 creators, every page schema-valid", () => {
    console.info(`cockpit L2: ${rows.length} rows, ${pages.length} pages, ${new Set(rows.map((r) => r.subject_id)).size} subjects, ${new Set(rows.map((r) => r.creator.user_id)).size} creators, ${cursors.length} cursors`);
    expect(new Set(rows.map((r) => r.id)).size).toBe(200);
    expect(pages).toHaveLength(4);
    for (const page of pages) expect(envViolations(page)).toEqual([]);
    expect(cursors.every((c) => cursorFilter(c) === FILTER)).toBe(true);
  });

  it("reads the four pages with no drop, a coherent cursor chain, and inside the budget", () => {
    const read = timed(() => pages.map((p) => readInboxPageV2(p)!));
    console.info(`cockpit L2 reader 200 rows: ${read.ms.toFixed(1)} ms (budget ${BUDGET_READ_250_MS})`);
    expect(read.ms).toBeLessThan(BUDGET_READ_250_MS);
    expect(read.value.map((p) => p.dropped)).toEqual([0, 0, 0, 0]);
    expect(read.value.map((p) => p.hasMore)).toEqual([true, true, true, false]);
    expect(read.value.map((p) => p.nextCursor)).toEqual([...cursors, null]);
    expect(read.value.every((p) => p.totalCount === 200 && p.filteredCount === 200)).toBe(true);
    expect(read.value.flatMap((p) => p.rows.map((r) => r.id))).toEqual(rows.map((r) => r.id));
  });

  it("a 250-row, over-1-MiB page is schema-valid, read inside the budget, and every lane x lens list stays inside its budget", () => {
    const rows250 = bigRows(250);
    const fat = (factor: number) => envelopeOf(cloneRows(rows250[0]!, 250, (r: Draft, i) => {
      Object.assign(r, structuredClone(rows250[i]));
      r.subject = "S".repeat(Math.min(512, factor * 4));
      r.target = "T".repeat(Math.min(512, factor * 4));
      r.blocker_summary = "B".repeat(Math.min(2000, factor * 16));
      r.release_candidate = "R".repeat(Math.min(256, factor * 2));
      r.policy_version = "P".repeat(Math.min(128, factor));
      r.subject_id = `alpha_${pad(i, 5)}_${"x".repeat(Math.min(150, factor))}`;
    }));
    const { value, factor, bytes } = fillToBytes(fat, MIB, 512);
    const read = timed(() => readInboxPageV2(value)!);
    console.info(`cockpit L2 1 MiB page: ${bytes} bytes (${(bytes / MIB).toFixed(2)} MiB), 250 rows, fatness ${factor}, reader ${read.ms.toFixed(1)} ms (budget ${BUDGET_READ_1MIB_MS})`);
    expect(bytes).toBeGreaterThanOrEqual(MIB);
    expect(envViolations(value)).toEqual([]);
    expect(read.ms).toBeLessThan(BUDGET_READ_1MIB_MS);
    expect(read.value.rows).toHaveLength(250);
    expect(read.value.dropped).toBe(0);
    const lanes = timed(() => GATE_LANES.flatMap((lane) => LENS_LIST.map((lens) => gateItems({ rows: read.value.rows, decided: [], lane, lens, principal: BOBBY }).length)));
    console.info(`cockpit L2 lane x lens (${GATE_LANES.length * LENS_LIST.length} lists over 250 rows): ${lanes.ms.toFixed(1)} ms (budget ${BUDGET_LANES_MS})`);
    expect(lanes.ms).toBeLessThan(BUDGET_LANES_MS);
    expect(serializedBytes(read.value.rows)).toBeGreaterThan(MIB / 2);
  });

  it("the Queue draws at most MAX_QUEUE_DOM rows of 200 and says how many it left out", () => {
    const typed = pages.flatMap((p) => readInboxPageV2(p)!.rows);
    const items = gateItems({ rows: typed, decided: [], lane: "all", lens: "open", principal: BOBBY });
    expect(items.length).toBeGreaterThan(MAX_QUEUE_DOM);
    const started = performance.now();
    const { container } = render(<Queue {...queueProps(items)} />);
    const ms = performance.now() - started;
    console.info(`cockpit L2 Queue: ${items.length} items -> ${container.querySelectorAll("ul li").length} DOM rows (cap ${MAX_QUEUE_DOM}) in ${ms.toFixed(0)} ms (budget ${BUDGET_QUEUE_RENDER_MS})`);
    expect(container.querySelectorAll("ul li")).toHaveLength(MAX_QUEUE_DOM);
    expect(within(container).getByText(new RegExp(`top ${MAX_QUEUE_DOM} of ${items.length} shown`))).toBeTruthy();
    expect(ms).toBeLessThan(BUDGET_QUEUE_RENDER_MS);
  });
});

/* ═════════════════════════ L3 · negative ═════════════════════════ */
const ROW0 = ["page", "rows", 0] as const;
const row0 = (...rest: (string | number)[]) => [...ROW0, ...rest];
const rowOnly = (c: NegativeCase) => (c.value as Draft).page.rows[0];
const rowsOf = (c: NegativeCase) => (c.value as Draft).page.rows;

interface Group { label: string; cases: NegativeCase[]; wantRow: (c: NegativeCase) => "refused" | "kept" | "field-null" }
const FIELD_NULL_CATEGORIES = new Set(["wrong-type", "null-vs-absent", "missing-required", "bad-integer", "number-as-decimal"]);

/** Fields the V2 reader lets go to null while still reading the row. */
const lenient = (c: NegativeCase) => (FIELD_NULL_CATEGORIES.has(c.category) ? "field-null" : "kept");
const refuse = () => "refused" as const;

const GROUPS: Group[] = [
  // Text that is only the wrong shape of an id (spaces, NUL, bidi) is D8 below; what is no id at all is refused here.
  { label: "id", cases: stringCases(canonical, row0("id")).filter((c) => !c.name.includes("70000")), wantRow: (c) => (c.category === "huge-string" && !c.name.endsWith('""') ? "kept" : "refused") },
  { label: "gate words", cases: enumCases(canonical, row0("gate"), GATES), wantRow: refuse },
  { label: "status words", cases: enumCases(canonical, row0("status"), STATUSES), wantRow: () => "kept" },
  { label: "inert words", cases: enumCases(canonical, row0("inert"), ["SELF", "QUORUM", "BLOCKED"]), wantRow: () => "kept" },
  { label: "needs_you", cases: [true, "true", 1, 0, "", [], {}, null].map((v) => ({ name: `wrong-type: needs_you <- ${JSON.stringify(v)}`, category: "wrong-type" as const, value: { ...structuredClone(canonical), page: { ...canonical.page, rows: [{ ...baseRow, needs_you: v }] } }, probe: null })), wantRow: () => "kept" },
  { label: "quorum_met", cases: integerCases(canonical, row0("quorum_met")), wantRow: lenient },
  { label: "quorum_required", cases: integerCases(canonical, row0("quorum_required")), wantRow: lenient },
  { label: "blocker_count", cases: integerCases(canonical, row0("blocker_count")), wantRow: lenient },
  { label: "sla minutes", cases: [...integerCases(canonical, row0("sla", "age_minutes")), ...integerCases(canonical, row0("sla", "budget_minutes"))], wantRow: lenient },
  { label: "sla state words", cases: enumCases(canonical, row0("sla", "state"), SLA_STATES), wantRow: () => "kept" },
  { label: "text fields", cases: ["subject", "target", "environment", "policy_version", "blocker_summary", "release_candidate"].flatMap((k) => stringCases(canonical, row0(k))).filter((c) => !c.name.includes("70000")), wantRow: lenient },
  { label: "actors", cases: ["creator", "requester"].flatMap((k) => [...stringCases(canonical, row0(k)).filter((c) => !c.name.includes("70000")), ...requiredCases(canonical, [row0(k, "user_id"), row0(k, "username")])]), wantRow: () => "kept" },
  { label: "rows array", cases: arrayCases(canonical, ["page", "rows"], { idKey: "id" }), wantRow: () => "kept" },
  { label: "counts", cases: ["total_count", "filtered_count"].flatMap((k) => integerCases(canonical, ["page", k])), wantRow: () => "kept" },
  { label: "cursor and paging", cases: ["next_cursor", "prev_cursor", "has_more", "has_previous"].flatMap((k) => stringCases(canonical, ["page", k])).filter((c) => !c.name.includes("70000")), wantRow: () => "kept" },
  { label: "bad roots", cases: rootCases(), wantRow: refuse },
  {
    label: "prototype pollution",
    cases: pollutionCases(canonical, [[], ["page"], [...ROW0], row0("sla"), row0("creator"), row0("requester")]),
    wantRow: () => "kept",
  },
];

describe("L3 · negative", () => {
  const all = GROUPS.flatMap((g) => g.cases.map((c) => ({ group: g, c })));

  it("reports its case counts", () => {
    console.info(`cockpit L3: ${all.length} cases in ${GROUPS.length} groups: ${GROUPS.map((g) => `${g.label} ${g.cases.length}`).join(", ")}`);
    expect(all.length).toBeGreaterThan(300);
  });

  it.each(all.map(({ group, c }) => [`${group.label} · ${c.name}`, group, c] as const))("%s", (_name, group, c) => {
    // Page level: never throws, and a non-row root is no page.
    expect(() => readInboxPageV2(c.value)).not.toThrow();
    const page = readInboxPageV2(c.value);
    if (c.category === "bad-root") { expect(page).toBeNull(); return; }
    expect(page === null || page.rows.length + page.dropped === (Array.isArray(rowsOf(c)) ? rowsOf(c).length : 0)).toBe(true);
    if (page !== null) {
      expect(() => gateItems({ rows: page.rows, decided: [], lane: "all", lens: "open", principal: BOBBY })).not.toThrow();
      expect(() => page.rows.forEach((r) => { slaView(r.sla); quorumText(r.quorumMet, r.quorumRequired); instantText(r.updatedAt); })).not.toThrow();
      if (group.label !== "gate words" && group.label !== "status words" && group.label !== "inert words" && group.label !== "sla state words") {
        expect(leaked(page.rows, c.probe)).toBe(false);
      }
    }
    // Row level, for cases that edit the first row.
    const raw = Array.isArray(rowsOf(c)) ? rowOnly(c) : undefined;
    if (raw === undefined || typeof raw !== "object" || raw === null) { expect(prototypeIsClean()).toBe(true); return; }
    const row = readInboxRowV2(raw);
    const want = group.wantRow(c);
    if (want === "refused") expect(row, "row must be refused").toBeNull();
    if (row !== null) {
      // A bad count is an absence, never the bad number and never a zero.
      for (const [key, value] of [["quorum_met", row.quorumMet], ["quorum_required", row.quorumRequired], ["blocker_count", row.blockerCount]] as const) {
        const injected = raw[key];
        if (typeof injected === "number" && Number.isSafeInteger(injected) && injected >= 0) expect(value).toBe(injected);
        else if (injected === undefined || injected === null || typeof injected === "string" || typeof injected === "boolean" || Number.isNaN(injected) || injected < 0 || !Number.isInteger(injected)) expect(value, `${key} <- ${String(injected)}`).toBeNull();
      }
      // An unknown needs_you is not a yes; an unknown inert word is no reason.
      if (raw.needs_you !== true) expect(row.needsYou === true).toBe(false);
      if (!["SELF", "QUORUM", "BLOCKED"].includes(raw.inert)) expect(row.inert).toBeNull();
      // A word outside the published gates is never routed.
      expect(GATES).toContain(row.gate);
    }
    expect(prototypeIsClean()).toBe(true);
  });

  it("characterisation: the V2 page reader answers on rows alone, so a swapped schema_version still reads as a page (the version check is the port's)", () => {
    const swapped = schemaVersionCases(canonical, ["schema_version"], "governance.approval-inbox.v1", ["governance.approval-history.v1", "governance.conditions-register.v1"]);
    const accepted = swapped.filter((c) => readInboxPageV2(c.value) !== null).length;
    console.info(`cockpit L3 schema_version swaps: ${accepted} of ${swapped.length} still read as a page`);
    expect(accepted).toBe(swapped.length);
  });

  it("prints how much looser the V2 reader is than the published schema, by category", () => {
    const gap = new Map<string, string[]>();
    let invalid = 0;
    for (const { group, c } of all) {
      if (c.category === "bad-root" || c.category === "huge-string") continue;
      if (envViolations(c.value).length === 0) continue;
      invalid += 1;
      const page = readInboxPageV2(c.value);
      if (page !== null && page.dropped === 0 && page.rows.length === rowsOf(c).length) gap.set(c.category, [...(gap.get(c.category) ?? []), `${group.label}: ${c.name}`]);
    }
    const accepted = [...gap.values()].reduce((n, v) => n + v.length, 0);
    console.info(`cockpit L3 gap: page reader fully accepts ${accepted} of ${invalid} schema-invalid payloads; ${[...gap.entries()].map(([k, v]) => `${k} ${v.length}`).join(", ")}`);
    for (const [category, names] of gap) console.info(`  ${category}: e.g. ${names.slice(0, 3).join(" | ")}`);
    expect(invalid).toBeGreaterThan(200);
  });
});

/* ═══════════════════ documented defects (turn red when fixed) ═══════════════════ */
describe("documented defects", () => {
  /*
   * Was DEFECT D5/D5b (inboxRowV2.ts `whole`): Number.isInteger let 2^53+2, 1e21
   * and 1e308 through as counts. `whole` is Number.isSafeInteger now.
   */
  it("D5: a count beyond 2^53 is an absence, not a count", () => {
    for (const huge of [2 ** 53 + 2, 1e21, 1e308]) {
      const row = readInboxRowV2({ ...structuredClone(baseRow), quorum_met: huge, blocker_count: huge });
      expect(row?.quorumMet, String(huge)).toBeNull();
      expect(row?.blockerCount, String(huge)).toBeNull();
    }
    expect(readInboxRowV2({ ...structuredClone(baseRow), quorum_met: Number.MAX_SAFE_INTEGER })?.quorumMet).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("D5b: an SLA whose minutes are beyond 2^53 is no SLA", () => {
    expect(readInboxSla({ age_minutes: 1e21, budget_minutes: 1e21 })).toBeNull();
    expect(readInboxSla({ age_minutes: 2 ** 53 + 2, budget_minutes: 60 })).toBeNull();
    expect(readInboxSla({ age_minutes: 5, budget_minutes: 60 })).not.toBeNull();
  });

  /*
   * Was DEFECT D6 (inboxRowV2.ts readInboxPageV2): two rows with one id were
   * both kept. The first stays, the repeat is counted in `dropped`.
   */
  it("D6: a page with a repeated id keeps the first row and counts the repeat as dropped", () => {
    const second = { ...structuredClone(baseRow), subject: "second" };
    const page = readInboxPageV2(envelopeOf([structuredClone(baseRow), second]))!;
    expect(page.rows.map((r) => r.id)).toEqual([baseRow.id]);
    expect(page.rows[0]!.subject).not.toBe("second");
    expect(page.dropped).toBe(1);
  });

  /*
   * Was DEFECT D7 (laneModel.ts isClosedRow): any status other than PENDING was
   * closed. Only the published closing statuses are closed; an unknown word is
   * `unknown` and the request stays in Open.
   */
  it("D7: an unpublished status word is not closed, and stays in the Open lens", () => {
    for (const status of ["pending", "PENDING ", "WAITING", "approved", "CLOSED"]) {
      const row = readInboxRowV2({ ...structuredClone(baseRow), status })!;
      expect(isClosedRow(row), status).toBe(false);
      expect(statusClassOf(row), status).toBe("unknown");
      const open = gateItems({ rows: [row], decided: [], lane: "all", lens: "open", principal: NO_PRINCIPAL });
      expect(open.map((i) => i.key), status).toEqual([row.id]);
      expect(gateItems({ rows: [row], decided: [], lane: "all", lens: "closed", principal: NO_PRINCIPAL }), status).toEqual([]);
    }
    for (const status of CLOSED_STATUSES) {
      const row = readInboxRowV2({ ...structuredClone(baseRow), status })!;
      expect(statusClassOf(row), status).toBe("closed");
    }
    expect(statusClassOf(readInboxRowV2({ ...structuredClone(baseRow), status: "PENDING" })!)).toBe("open");
  });

  /*
   * Was DEFECT D8 (inboxRowV2.ts `text`): a row id was any non-empty string.
   * It must match the published Identifier pattern ^[A-Za-z0-9._:-]{1,191}$,
   * else the row is dropped (and counted by the page reader).
   */
  it("D8: an id outside the Identifier pattern is refused and counted as dropped", () => {
    for (const id of ["a b", "a/b", "<b>x</b>", "x".repeat(192), "a\nb", "é"]) {
      expect(readInboxRowV2({ ...structuredClone(baseRow), id }), id).toBeNull();
      expect(readInboxRowV2({ ...structuredClone(baseRow), subject_id: id }), `subject_id ${id}`).toBeNull();
      expect(readInboxPageV2(envelopeOf([{ ...structuredClone(baseRow), id }]))!.dropped, id).toBe(1);
    }
    expect(readInboxRowV2({ ...structuredClone(baseRow), id: "x".repeat(191) })).not.toBeNull();
    // A present id that breaks the pattern is not rescued by approval_id.
    expect(readInboxRowV2({ ...structuredClone(baseRow), id: "a b", approval_id: "ok" })).toBeNull();
  });
});
