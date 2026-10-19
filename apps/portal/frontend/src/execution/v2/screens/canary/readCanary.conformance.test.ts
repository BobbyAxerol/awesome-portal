/**
 * Conformance of the Canary reader against the published contracts (Rules 9.8.3, tiers L0 to L3).
 *
 * Contract under test: whatever body the route answers (the V1 control room or the V2 following
 * parent), `getCanaryVersioned` + `readCanaryView` give a view the screen may print, or the
 * dispatcher's own `unsupported` sentence. Never a throw, never a V2 body read as V1 (or the
 * reverse), never a figure the body did not publish, never text the negative case planted.
 *
 * L0  the canonical bodies, verbatim: they validate against the published schemas, and the view
 *     says what the wire says (ids, exact caps, every blocker code)
 * L1  matrix: broker panel state x freshness x the two guard flags x trial day (600 states) against
 *     an oracle written from the screen's rules, and the V2 bodies
 * L2  scale: blocker codes at their schema maximum (capped), a ~1 MiB body, 200 position rows, long lineage
 * L3  negative: decimals, enums, required keys, integers, strings, arrays, schema_version, prototype
 *     pollution and non-object roots through the whole chain
 *
 * Lane: BFF-shaped bodies through the real dispatcher and readers. The populated body is FIXTURE_LAB.
 */
import { afterAll, describe, expect, it } from "vitest";

import { readDecimal } from "../../boundary";
import { readCanaryByVersion } from "../../readers/dispatch";
import { canonicalDigest, schemaEnum } from "../../testkit/loadCanonical";
import { coverage, cartesian, describeCoverage, dimension } from "../../testkit/matrix";
import {
  arrayCases, decimalCases, enumCases, integerCases, leaked, pollutionCases, prototypeIsClean, requiredCases, rootCases, schemaVersionCases,
  stringCases, type NegativeCase,
} from "../../testkit/negative";
import { cloneRows, fillToBytes, MIB, serializedBytes, timed } from "../../testkit/scale";
import { validateAgainst } from "../../testkit/schema";
import { bannersOf, chipsOf, guardRows, trialOf } from "./model";
import { readCanaryView, type CanaryReadResult, type CanaryView, type DecimalFact } from "./readCanary";
import { PARENT_FILE, SCHEMA_V1, SCHEMA_V2, V1_FILE, lit, parentBody, populatedV1, v1Body } from "./canary.testbase";

const digests = Object.fromEntries([V1_FILE, PARENT_FILE].map((f) => [f, canonicalDigest(f)]));
afterAll(() => {
  for (const f of [V1_FILE, PARENT_FILE]) expect(canonicalDigest(f), f).toBe(digests[f]);
});

const BUDGET_1_MIB_MS = 150;
const BUDGET_MATRIX_MS = 2500;

const run = (raw: unknown): CanaryReadResult => readCanaryView(readCanaryByVersion(raw));
function viewOf(raw: unknown): CanaryView {
  const result = run(raw);
  if (result.kind !== "view") throw new Error(result.text);
  return result.view;
}
function decimalFacts(view: CanaryView): DecimalFact[] {
  const out: DecimalFact[] = [];
  for (const kpi of Object.values(view.kpis)) if (kpi?.value) out.push(kpi.value);
  for (const limit of view.envelope?.limits ?? []) if (limit.value) out.push(limit.value);
  return out;
}

/* ═════════════════════════ L0 ═════════════════════════ */
describe("L0 · canonical, verbatim", () => {
  it("the V1 fixture conforms to the published control-room schema", () => {
    expect(validateAgainst(SCHEMA_V1, "/$defs/CanaryControlRoom", v1Body())).toEqual([]);
  });

  it.each(["canary", "canary_absent", "canary_revision"] as const)("the V2 body %s conforms to CanaryParentReadV2 and reads as a V2 view", (key) => {
    expect(validateAgainst(SCHEMA_V2, "/$defs/CanaryParentReadV2", parentBody(key))).toEqual([]);
    expect(viewOf(parentBody(key)).body).toBe("v2");
  });

  it("the V1 view says what the wire says: ids, caps as exact strings, every code, five KPIs, five lineage entries", () => {
    const wire = v1Body();
    const view = viewOf(wire);
    expect(view.deploymentId).toBe(wire.deployment.deployment_id);
    expect(view.portfolioId).toBe(wire.deployment.portfolio_id);
    expect(view.accountId).toBe(wire.deployment.account_id);
    expect(view.venue).toBe(wire.deployment.venue);
    expect(view.envelope!.revision).toBe(wire.envelope.revision);
    const caps = view.envelope!.limits.map((l) => (l.value?.kind === "value" ? l.value.decimal.full : l.value));
    expect(caps).toEqual([wire.envelope.limits.capital_cap, wire.envelope.limits.gross_notional_cap, wire.envelope.limits.daily_loss_cap, String(wire.envelope.limits.max_open_orders), String(wire.envelope.limits.duration_days)]);
    const wireCodes = new Set<string>([
      ...wire.lifecycle.blocker_codes, ...wire.envelope.blocker_codes,
      ...wire.command_policy.protective.blocker_codes, ...wire.command_policy.scale_up.blocker_codes,
    ]);
    expect(new Set(view.blockers.map((b) => b.code))).toEqual(wireCodes);
    expect(Object.values(view.kpis).filter((k) => k !== null)).toHaveLength(5);
    expect(view.lineage).toHaveLength(wire.lineage.length);
  });

  it("the V2 view says what the wire says: every proposed cap keeps all its digits", () => {
    const wire = parentBody("canary");
    const view = viewOf(wire);
    const full = view.envelope!.limits.map((l) => (l.value?.kind === "value" ? l.value.decimal.full : null));
    expect(full).toEqual([wire.proposal.capital_cap, wire.proposal.gross_notional_cap, wire.proposal.daily_loss_cap, String(wire.proposal.max_open_orders), String(wire.proposal.duration_days)]);
    expect(view.lineage.map((l) => l.value)).toEqual([wire.lineage.certification_id, wire.lineage.promotion_plan_id, wire.lineage.paper_exit_review_id, wire.lineage.r1_approval_id, wire.lineage.r2_approval_id]);
  });
});

/* ═════════════════════════ L1 ═════════════════════════ */
describe("L1 · matrix · broker panel x freshness x guard flags x trial day", () => {
  const BROKER = ["source_panels", 1] as const;
  const DIMS = [
    dimension("broker", [...BROKER, "panel_state"], ["unavailable", "stale", "partial", "empty", "suppressed", "ready"]),
    dimension("fresh", [...BROKER, "freshness_state"], ["FRESH", "AGING", "STALE", "UNKNOWN"]),
    dimension("scale", ["command_policy", "scale_up", "broker_sync_blocks"], [true, false]),
    dimension("protective", ["command_policy", "protective", "broker_sync_blocks"], [true, false]),
    dimension("day", ["lifecycle", "day_index"], [null, 0, 1, 14, 15]),
  ];
  const states = cartesian(populatedV1(), DIMS);

  /** The oracle, written from the screen's rules and not from the model's code. */
  function expected(picks: Readonly<Record<string, string>>) {
    const state = picks.broker!;
    const fresh = picks.fresh!;
    const day = picks.day!;
    const chip = state === "suppressed" || state === "unavailable" ? "na" : fresh === "FRESH" ? "ok" : fresh === "AGING" || fresh === "STALE" ? "warn" : "na";
    const brokerStale = state === "stale" || fresh === "STALE";
    const banners = [...(brokerStale ? ["guarded"] : []), ...(state === "partial" ? ["partial"] : [])];
    return { chip, banners, day: ["1", "14"].includes(day) ? Number(day) : null, scale: picks.scale === "true" ? "attention" : "ok", protective: picks.protective === "true" ? "attention" : "ok" };
  }

  it("prints the matrix size", () => {
    const c = coverage(DIMS, states);
    console.info(describeCoverage("canary L1 (broker x freshness x flags x day)", c));
    expect(states).toHaveLength(6 * 4 * 2 * 2 * 5);
  });

  it("every state reads to the oracle's chip, banners, trial day and guard cells, inside the budget", () => {
    const { ms } = timed(() => {
      for (const state of states) {
        const view = viewOf(state.value);
        const want = expected(state.picks);
        const chip = chipsOf(view).freshness;
        expect(chip.state === "dot" ? chip.tone : "na", state.name).toBe(want.chip);
        expect(bannersOf(view).map((b) => b.key), state.name).toEqual(want.banners);
        expect(trialOf(view).kind === "day" ? (trialOf(view) as { day: number }).day : null, state.name).toBe(want.day);
        const [row] = guardRows(view);
        expect(row.scaleUp.flag, state.name).toBe(want.scale);
        expect(row.protective.flag, state.name).toBe(want.protective);
      }
    });
    expect(ms).toBeLessThan(BUDGET_MATRIX_MS);
  });
});

describe("L1 · V2 bodies", () => {
  it("every V2 body is proposal-only: no KPI, no panel, no policy, no stage, no day, a draft blocker", () => {
    for (const key of ["canary", "canary_absent", "canary_revision"] as const) {
      const view = viewOf(parentBody(key));
      expect(view.proposalOnly, key).toBe(true);
      expect(Object.values(view.kpis).every((k) => k === null), key).toBe(true);
      expect([view.compliance, view.internal, view.broker, view.difference, view.series, view.rollback]).toEqual([null, null, null, null, null, null]);
      expect([view.protective, view.scaleUp, view.declaredStage, view.dayIndex]).toEqual([null, null, null, null]);
      expect(view.blockers.some((b) => b.code === null), key).toBe(true);
    }
  });
});

/* ═════════════════════════ L2 ═════════════════════════ */
describe("L2 · scale", () => {
  it("blocker codes at the schema maximum (16 per list, 64 distinct) are capped at 48 and stay unique", () => {
    const body = v1Body();
    const codes = (tag: string) => Array.from({ length: 16 }, (_, i) => `${tag}_CODE_${i}`);
    body.lifecycle.blocker_codes = codes("LIFE");
    body.envelope.blocker_codes = codes("ENV");
    body.command_policy.protective.blocker_codes = codes("PROT");
    body.command_policy.scale_up.blocker_codes = codes("SCALE");
    expect(validateAgainst(SCHEMA_V1, "/$defs/CanaryControlRoom", body)).toEqual([]);
    const view = viewOf(body);
    expect(view.blockers).toHaveLength(48);
    expect(new Set(view.blockers.map((b) => b.code)).size).toBe(48);
  });

  it("200 position rows and 200 order rows (the schema page) of a dark body are not drawn (the published panels are unavailable); typed rows stay unpublished (FE-072)", () => {
    const body = v1Body();
    const row = { symbol: "TESTUSDT", side: "LONG", quantity: "1.0000" };
    body.positions.rows = cloneRows(row, 200, (r, i) => { r.symbol = `SYM${i}`; });
    body.positions.returned_count = 200;
    body.blotter.rows = cloneRows(row, 200, (r, i) => { r.symbol = `ORD${i}`; });
    body.blotter.returned_count = 200;
    expect(validateAgainst(SCHEMA_V1, "/$defs/CanaryControlRoom", body)).toEqual([]);
    const view = viewOf(body);
    expect(view.positions.rows).toBeNull();
    expect(view.orders.rows).toBeNull();
    expect(view.positions.published).toBeNull();
    expect(view.orders.published).toBeNull();
  });

  it("the same 200 + 200 rows on a ready panel (the schema's free rows, `maxProperties` 80 now checked) are all kept, each under its own field names", () => {
    const body = populatedV1();
    const row = { symbol: "TESTUSDT", side: "LONG", quantity: "1.0000" };
    body.positions.envelope = { ...v1Body().positions.envelope };
    lit(body.positions.envelope, "ready", "FRESH");
    body.positions.envelope.data = { page: "first" };
    body.positions.rows = cloneRows(row, 200, (r, i) => { r.symbol = `SYM${i}`; });
    body.positions.returned_count = 200;
    body.positions.exact_total = 5000;
    expect(validateAgainst(SCHEMA_V1, "/$defs/UnavailableCollection", body.positions)).toEqual([]);
    const view = viewOf(body);
    expect(view.positions.published!.rows).toHaveLength(200);
    expect(view.positions.published!.total).toBe(5000);
    expect(view.positions.published!.rows[199]!.cells[0]).toBe("SYM199");
    expect(view.positions.rows).toBeNull();
  });

  it("a ~1 MiB body reads inside the budget and the view stays small", () => {
    const { value: body } = fillToBytes((factor) => {
      const wire = v1Body();
      const filler = "x".repeat(factor * 256);
      wire.source_panels[0].data = Object.fromEntries(Array.from({ length: 16 }, (_, i) => [`k${i}`, filler]));
      return wire;
    }, MIB);
    expect(serializedBytes(body)).toBeGreaterThanOrEqual(MIB);
    const { value, ms } = timed(() => run(body));
    expect(value.kind).toBe("view");
    expect(ms).toBeLessThan(BUDGET_1_MIB_MS);
    expect(serializedBytes(value)).toBeLessThan(20_000);
  });

  it("a ~1 MiB body of an unknown version is refused without being read", () => {
    const body = v1Body();
    body.schema_version = "execution.canary-control-room.v9";
    body.padding = "y".repeat(MIB);
    const { value, ms } = timed(() => run(body));
    expect(value.kind).toBe("unsupported");
    expect(ms).toBeLessThan(BUDGET_1_MIB_MS);
  });

  it("lineage past its five entries is capped at twelve", () => {
    const body = v1Body();
    body.lineage = cloneRows(body.lineage[1], 40, (item, i) => { item.value = `AP-${i}`; });
    expect(viewOf(body).lineage).toHaveLength(12);
  });
});

/* ═════════════════════════ L3 ═════════════════════════ */
describe("L3 · negative", () => {
  const lit = populatedV1();

  /** The invariants no hostile body may break, whatever else it does. */
  function holds(c: NegativeCase): CanaryReadResult {
    let result: CanaryReadResult | undefined;
    expect(() => { result = run(c.value); }, c.name).not.toThrow();
    const answer = result!;
    expect(["view", "unsupported"], c.name).toContain(answer.kind);
    expect(leaked(answer, c.probe), `${c.name}: the planted text reached the answer`).toBe(false);
    if (answer.kind === "view") {
      // A figure is a clean exact decimal or it is not a figure.
      for (const fact of decimalFacts(answer.view)) {
        if (fact.kind === "value") expect(readDecimal(fact.decimal.full, { unit: "money" }) ?? readDecimal(fact.decimal.full, { unit: "count" }), c.name).not.toBeNull();
      }
      // A trial day is 1..duration or not stated.
      const { dayIndex, durationDays } = answer.view;
      if (dayIndex !== null) {
        expect(Number.isSafeInteger(dayIndex) && dayIndex >= 1, c.name).toBe(true);
        if (durationDays !== null) expect(dayIndex, c.name).toBeLessThanOrEqual(durationDays);
      }
    }
    return answer;
  }

  const all = (cases: NegativeCase[]) => { for (const c of cases) holds(c); return cases.length; };
  let total = 0;
  afterAll(() => console.info(`canary L3: ${total} negative cases through dispatch + reader`));

  it("V1 decimals (KPI value, capital cap): never a figure unless the string is a clean decimal", () => {
    for (const path of [["kpis", 0, "value"], ["envelope", "limits", "capital_cap"], ["envelope", "limits", "daily_loss_cap"]] as const) {
      const cases = decimalCases(lit, path);
      total += all(cases);
      for (const c of cases.filter((k) => ["exponent", "negative-zero", "malformed-decimal", "number-as-decimal", "wrong-type", "huge-string"].includes(k.category))) {
        const view = holds(c);
        if (view.kind !== "view") continue;
        const fact = path[0] === "kpis" ? view.view.kpis.capital_consumed!.value : view.view.envelope!.limits[path[2] === "capital_cap" ? 0 : 2]!.value;
        expect(fact === null || fact.kind === "unreadable", c.name).toBe(true);
      }
    }
  });

  it("V1 enums: an unknown panel state or freshness word never becomes a success or a freshness", () => {
    const states = schemaEnum(SCHEMA_V1, "/$defs/SourceEnvelope/properties/panel_state");
    const cases = [...enumCases(lit, ["kpis", 0, "envelope", "panel_state"], states), ...enumCases(lit, ["source_panels", 1, "freshness_state"], ["OK", "AGING", "STALE", "UNKNOWN"])];
    total += all(cases);
    for (const c of enumCases(lit, ["kpis", 0, "envelope", "panel_state"], states)) {
      const result = holds(c);
      if (result.kind === "view") expect(["unavailable", "ok", "empty", "partial", "stale", "suppressed"], c.name).toContain(result.view.kpis.capital_consumed?.panel.state);
    }
  });

  it("V1 required keys, strings, integers and arrays", () => {
    const required = requiredCases(lit, [["deployment"], ["deployment", "deployment_id"], ["envelope"], ["envelope", "limits"], ["lifecycle"], ["kpis"], ["command_policy"], ["source_panels"], ["lineage"]]);
    total += all(required);
    total += all(stringCases(lit, ["deployment", "deployment_id"]));
    total += all(stringCases(lit, ["envelope", "currency"]));
    total += all(integerCases(lit, ["lifecycle", "day_index"]));
    total += all(integerCases(lit, ["lifecycle", "duration_days"]));
    total += all(arrayCases(lit, ["kpis"], { idKey: "key" }));
    total += all(arrayCases(lit, ["source_panels"]));
    total += all(arrayCases(lit, ["lineage"]));
    // a body with no deployment id is not a body this screen can place
    for (const c of required.filter((k) => k.name.includes("deployment.deployment_id"))) expect(holds(c).kind, c.name).toBe("unsupported");
  });

  it("an envelope currency outside ^[A-Z0-9]{2,12}$ is not printed as a currency", () => {
    for (const currency of ["usdt", "U", "USDT USDT", "<b>", "A".repeat(13)]) {
      const body = populatedV1();
      body.envelope.currency = currency;
      const answer = run(body);
      expect(answer.kind === "view" && answer.view.envelope?.currency, currency).toBeNull();
    }
  });

  it("schema_version: another route's or another family's version is never read as this V1 body, and a V1 body is never a V2 view", () => {
    const others = ["portal.execution.following-parent.v2", "portal.execution.live-source-operations.v2", "portal.execution.governance-parent.v2", "execution.sandbox-certification.v1", "execution.live-full-operations.v1"];
    const cases = schemaVersionCases(lit, ["schema_version"], "execution.canary-control-room.v1", others);
    total += cases.length;
    for (const c of cases) {
      const answer = holds(c);
      if (answer.kind === "view") expect(answer.view.body, c.name).toBe("v1");
    }
    for (const version of others) {
      const body = populatedV1();
      body.schema_version = version;
      expect(run(body).kind, version).toBe("unsupported");
    }
  });

  it("V2: a hostile proposal decimal refuses the whole body, and says which contract it broke", () => {
    const base = parentBody("canary");
    for (const path of [["proposal", "capital_cap"], ["proposal", "gross_notional_cap"], ["proposal", "daily_loss_cap"]] as const) {
      const cases = decimalCases(base, path);
      total += cases.length;
      for (const c of cases) {
        const answer = holds(c);
        expect(answer.kind, c.name).toBe("unsupported");
        if (answer.kind === "unsupported") expect(answer.text, c.name).toContain("does not match that contract");
      }
    }
  });

  it("V2: required keys, strings, integers and schema_version", () => {
    const base = parentBody("canary");
    total += all(requiredCases(base, [["anchors"], ["anchors", "deployment_id"], ["envelope"], ["envelope", "status"], ["proposal"], ["lineage"], ["source"]]));
    total += all(stringCases(base, ["anchors", "deployment_id"]));
    total += all(integerCases(base, ["proposal", "duration_days"]));
    total += all(integerCases(base, ["envelope", "revision"]));
    const cases = schemaVersionCases(base, ["schema_version"], "portal.execution.following-parent.v2", ["execution.canary-control-room.v1", "portal.execution.live-source-operations.v2"]);
    total += cases.length;
    for (const c of cases) {
      const answer = holds(c);
      if (answer.kind === "view") expect(answer.view.body, c.name).toBe("v2");
    }
    // every hostile V2 integer is refused whole or leaves a stated number; never a day or a negative duration
    for (const c of integerCases(base, ["proposal", "duration_days"])) {
      const answer = holds(c);
      if (answer.kind === "view") expect(answer.view.durationDays === null || answer.view.durationDays >= 1, c.name).toBe(true);
    }
  });

  it("prototype pollution, in V1 and V2 containers, never reaches the answer or Object.prototype", () => {
    const v1 = pollutionCases(lit, [[], ["deployment"], ["envelope"], ["envelope", "limits"], ["kpis", 0], ["kpis", 0, "envelope"], ["command_policy"], ["command_policy", "protective"], ["lifecycle"]]);
    const v2 = pollutionCases(parentBody("canary"), [[], ["anchors"], ["envelope"], ["proposal"], ["lineage"], ["source"]]);
    total += all([...v1, ...v2]);
    expect(prototypeIsClean()).toBe(true);
  });

  it("non-object roots are the dispatcher's sentence, never a throw", () => {
    const cases = rootCases();
    total += all(cases);
    for (const c of cases) expect(holds(c).kind, c.name).toBe("unsupported");
  });
});
