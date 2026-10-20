/**
 * The closed readers of the BE-P2 / BE-P3 additive members, against the published fixtures (lane FIXTURE_LAB; a
 * fixture is never source acceptance) with the schema as oracle: every canonical body is first validated by the
 * testkit checker, then read; then each reader is shown to REFUSE what the schema refuses.
 */
import { describe, expect, it } from "vitest";

import {
  REFUSED,
  readComplianceRows,
  readDeploymentIdentity,
  readEnvelopeVerdict,
  readFact,
  readGapRanges,
  readPlanAuthor,
  readPlanEnvelope,
  readPositionsBySide,
  readRollbackItems,
  readSeriesMembers,
  readSourceFigures,
  readStageFacts,
  readTrial,
  readTypedOrders,
  readTypedPositions,
  readVenueCalendar,
} from "./stageFacts";
import { loadCanonical } from "./v2/testkit/loadCanonical";
import { validateAgainst } from "./v2/testkit/schema";

type Any = Record<string, any>;
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const facts = () => loadCanonical<Any>("execution-stage-facts.source-backed.synthetic").value;
const dark = () => loadCanonical<Any>("execution-canary-control-room.unavailable");
const envelopeFacts = () => loadCanonical<Any>("execution-canary-envelope-facts.synthetic").value;
const rows = () => loadCanonical<Any>("execution-stage-rows.synthetic").value;
const calendar = () => loadCanonical<Any>("execution-venue-calendar.synthetic").value;

describe("Fact", () => {
  const asText = (raw: unknown) => (typeof raw === "string" ? raw : REFUSED) as string;
  it("reads the two shapes and nothing else", () => {
    expect(readFact({ availability: "AVAILABLE", value: "a", reason_code: null }, asText)).toEqual({ availability: "AVAILABLE", value: "a" });
    expect(readFact({ availability: "NOT_PUBLISHED", value: null, reason_code: "SOME_REASON" }, asText)).toEqual({ availability: "NOT_PUBLISHED", reasonCode: "SOME_REASON" });
    for (const bad of [
      { availability: "AVAILABLE", value: null, reason_code: null },
      { availability: "AVAILABLE", value: "a", reason_code: "SOME_REASON" },
      { availability: "NOT_PUBLISHED", value: "a", reason_code: "SOME_REASON" },
      { availability: "NOT_PUBLISHED", value: null, reason_code: null },
      { availability: "NOT_PUBLISHED", value: null, reason_code: "lower_case" },
      { availability: "UNKNOWN", value: null, reason_code: "SOME_REASON" },
      { availability: "AVAILABLE", value: "a", reason_code: null, extra: 1 },
      { availability: "AVAILABLE", value: "a" },
      null,
      [],
      "AVAILABLE",
    ]) {
      expect(readFact(bad, asText)).toBeNull();
    }
  });
});

describe("stage_facts (FE-067)", () => {
  it("reads the source-backed body: runtime word, reconciliation, sessions newest first", () => {
    expect(validateAgainst("execution-stage-facts.v1", "/$defs/StageFacts", facts())).toEqual([]);
    const read = readStageFacts(facts())!;
    expect(read.runtime.state).toEqual({ availability: "AVAILABLE", value: "RUNNING" });
    expect(read.reconciliation.verdict).toEqual({ availability: "AVAILABLE", value: "OPEN_FINDINGS" });
    expect(read.reconciliation.unknownOrderCount).toEqual({ availability: "AVAILABLE", value: 1 });
    expect(read.sessions.availability).toBe("AVAILABLE");
    expect(read.sessions.rows.map((row) => row.id)).toEqual(["session_TEST_ONLY_2", "session_TEST_ONLY_1"]);
    expect(read.sessions.rows[0]!.ended).toBeNull();
  });

  it("reads the dark body in all four stages: every fact keeps the server's reason code", () => {
    for (const name of ["execution-canary-control-room.unavailable", "execution-live-full-operations.unavailable", "execution-sandbox-certification.unavailable"]) {
      const body = loadCanonical<Any>(name);
      const read = readStageFacts(body.stage_facts)!;
      expect(read.runtime.state.availability).toBe("NOT_PUBLISHED");
      expect(read.runtime.state).toHaveProperty("reasonCode");
      expect(read.sessions).toMatchObject({ availability: "NOT_PUBLISHED", rows: [], returnedCount: 0, sourceComplete: null });
    }
    const paper = readStageFacts(loadCanonical<Any>("execution-paper-workbench.partial").data.stage_facts)!;
    expect(paper.reconciliation.verdict).toEqual({ availability: "NOT_PUBLISHED", reasonCode: "PAPER_WORKBENCH_RELATION_NOT_BOUND_TO_SCREEN" });
  });

  it("refuses a runtime word outside the closed vocabulary, `active` included, and any extra or missing key", () => {
    const body = (mutate: (b: Any) => void) => {
      const b = clone(facts());
      mutate(b);
      return b;
    };
    expect(readStageFacts(body((b) => (b.runtime.runtime_state.value = "active")))).toBeNull();
    expect(readStageFacts(body((b) => (b.runtime.runtime_state.value = "running")))).toBeNull();
    expect(readStageFacts(body((b) => (b.surprise = 1)))).toBeNull();
    expect(readStageFacts(body((b) => delete b.sessions))).toBeNull();
    expect(readStageFacts(body((b) => (b.schema_version = "execution.stage-facts.v2")))).toBeNull();
    expect(readStageFacts(body((b) => (b.reconciliation.basis = "RECONCILIATION_RUN")))).toBeNull();
    expect(readStageFacts(body((b) => (b.reconciliation.open_finding_count.value = "1")))).toBeNull();
    expect(readStageFacts(body((b) => (b.reconciliation.open_finding_count.value = -1)))).toBeNull();
    expect(readStageFacts(body((b) => (b.runtime.since.value = "yesterday")))).toBeNull();
  });

  it("applies the sessions conditionals of the schema", () => {
    const body = (mutate: (s: Any) => void) => {
      const b = clone(facts());
      mutate(b.sessions);
      return b;
    };
    expect(readStageFacts(body((s) => (s.source_complete = null)))).toBeNull();
    expect(readStageFacts(body((s) => (s.reason_code = "SOME_REASON")))).toBeNull();
    expect(readStageFacts(body((s) => (s.rows = new Array(51).fill(s.rows[0]))))).toBeNull();
    expect(readStageFacts(body((s) => (s.rows[0].started = "x")))).toBeNull();
    expect(readStageFacts(body((s) => (s.rows[0].extra = 1)))).toBeNull();
    expect(readStageFacts(body((s) => (s.availability = "NOT_PUBLISHED")))).toBeNull();
  });
});

describe("Canary envelope, rollback, trial (FE-071)", () => {
  it("reads four rows in order with the server's used_ratio as a string; exact zero is a value", () => {
    const v = envelopeFacts();
    const read = readComplianceRows(v.rows)!;
    expect(read.map((row) => row.cap)).toEqual(["capital", "gross_notional", "daily_loss", "open_orders"]);
    expect(read[0]!.usedRatio).toEqual({ availability: "AVAILABLE", value: "0.25" });
    expect(read[1]!.consumed).toEqual({ availability: "AVAILABLE", value: "0" });
    expect(read[2]!.usedRatio).toEqual({ availability: "NOT_PUBLISHED", reasonCode: "DAILY_LOSS_WINDOW_NOT_PUBLISHED" });
    expect(read[0]!.approved).toBe("1000");
    expect(readEnvelopeVerdict(v.verdict)).toEqual({ state: "UNDETERMINED", undeterminedCaps: ["daily_loss"] });
    expect(readRollbackItems(v.items)!.map((item) => item.key)).toEqual(["flatten_plan", "paper_twin", "broker_data", "rollback_drill"]);
    expect(readRollbackItems(v.items)![2]!.ready).toEqual({ availability: "AVAILABLE", value: true });
    expect(readTrial(v.trial)).toMatchObject({ durationDays: 14, startedAt: { availability: "AVAILABLE" } });
  });

  it("the dark Canary body reads with every fact not published", () => {
    const body = dark();
    expect(readComplianceRows(body.envelope_compliance.rows)!.every((row) => row.consumed.availability === "NOT_PUBLISHED")).toBe(true);
    expect(readEnvelopeVerdict(body.envelope_compliance.verdict)?.state).toBeDefined();
    expect(readRollbackItems(body.rollback_readiness.items)).toHaveLength(4);
    expect(readTrial(body.lifecycle.trial)!.startedAt).toEqual({ availability: "NOT_PUBLISHED", reasonCode: "CANARY_ACTIVATION_NOT_RECORDED" });
  });

  it("refuses a number for a ratio, a reordered or short list, an unknown cap, a contradictory verdict", () => {
    const v = envelopeFacts();
    const withRow = (mutate: (r: Any[]) => void) => {
      const r = clone(v.rows);
      mutate(r);
      return r;
    };
    expect(readComplianceRows(withRow((r) => (r[0].used_ratio.value = 0.25)))).toBeNull();
    expect(readComplianceRows(withRow((r) => (r[0].used_ratio.value = "0.250000")))).toBeNull();
    expect(readComplianceRows(withRow((r) => (r[0].approved = 1000)))).toBeNull();
    expect(readComplianceRows(withRow((r) => r.pop()))).toBeNull();
    expect(readComplianceRows(withRow((r) => r.reverse()))).toBeNull();
    expect(readComplianceRows(withRow((r) => (r[0].cap = "leverage")))).toBeNull();
    expect(readComplianceRows(withRow((r) => (r[0].unit = "usdt")))).toBeNull();
    expect(readComplianceRows(withRow((r) => (r[0].extra = 1)))).toBeNull();
    expect(readEnvelopeVerdict({ state: "WITHIN_ENVELOPE", basis: "CONSUMED_NOT_ABOVE_APPROVED_PER_CAP", undetermined_caps: ["capital"] })).toBeNull();
    expect(readEnvelopeVerdict({ state: "UNDETERMINED", basis: "CONSUMED_NOT_ABOVE_APPROVED_PER_CAP", undetermined_caps: [] })).toBeNull();
    expect(readEnvelopeVerdict({ state: "BREACH", basis: "CONSUMED_NOT_ABOVE_APPROVED_PER_CAP", undetermined_caps: ["capital", "capital"] })).toBeNull();
    expect(readEnvelopeVerdict({ state: "OK", basis: "CONSUMED_NOT_ABOVE_APPROVED_PER_CAP", undetermined_caps: [] })).toBeNull();
    expect(readRollbackItems(clone(v.items).reverse())).toBeNull();
    expect(readTrial({ ...v.trial, duration_days: 91 })).toBeNull();
    expect(readTrial({ ...v.trial, duration_days: 0 })).toBeNull();
  });
});

describe("typed rows, figures, series, gap window, plans (FE-072)", () => {
  it("reads typed positions and orders with their unpublished columns", () => {
    const v = rows();
    expect(readTypedPositions(v.typed_positions)).toMatchObject({ availability: "AVAILABLE", sourceComplete: true, returnedCount: 2, notPublishedColumns: [{ column: "leverage", reasonCode: "POSITION_LEVERAGE_NOT_IN_SOURCE_RELATION" }] });
    expect(readTypedPositions(v.typed_positions)!.rows[0]).toEqual({ id: "pos_TEST_ONLY_1", symbol: "BTCUSDT", side: "long", quantity: "0.5", entry: "60000", mark: "60500.5", unrealised: "250.25" });
    expect(readTypedOrders(v.typed_orders)!.rows[0]).toMatchObject({ type: "LIMIT", side: "buy", price: "59000", status: "ACCEPTED" });
    expect(readTypedPositions(dark().positions.typed)).toMatchObject({ availability: "NOT_PUBLISHED", reasonCode: "LIVE_SOURCE_UNAVAILABLE", rows: [] });
    // a positions body is not an orders body
    expect(readTypedOrders(v.typed_positions)).toBeNull();
    expect(readTypedPositions(v.typed_orders)).toBeNull();
  });

  it("refuses a leverage value, a number quantity, a bad side, a trailing zero, a negative magnitude and a mismatched not-published state", () => {
    const v = rows();
    const pos = (mutate: (t: Any) => void) => {
      const t = clone(v.typed_positions);
      mutate(t);
      return readTypedPositions(t);
    };
    expect(pos((t) => (t.rows[0].leverage = "3"))).toBeNull();
    expect(pos((t) => (t.rows[0].quantity = 0.5))).toBeNull();
    expect(pos((t) => (t.rows[0].quantity = "0.50"))).toBeNull();
    expect(pos((t) => (t.rows[0].quantity = "-1"))).toBeNull();
    expect(pos((t) => (t.rows[0].side = "LONG"))).toBeNull();
    expect(pos((t) => (t.rows[0].unrealised = "-0"))).toBeNull();
    expect(pos((t) => (t.source_complete = null))).toBeNull();
    expect(pos((t) => (t.rows = new Array(201).fill(t.rows[0])))).toBeNull();
    expect(pos((t) => (t.availability = "NOT_PUBLISHED"))).toBeNull();
    const ord = clone(v.typed_orders);
    ord.rows[0].ack_latency_ms = 12;
    expect(readTypedOrders(ord)).toBeNull();
  });

  it("reads the five figures in order; the server's difference is read, never computed", () => {
    const read = readSourceFigures(rows().source_figures)!;
    expect(read.map((figure) => figure.key)).toEqual(["equity", "gross_notional", "positions", "open_orders", "fees"]);
    expect(read[2]!.difference).toEqual({ availability: "AVAILABLE", value: "0" });
    expect(read[3]!.difference).toEqual({ availability: "AVAILABLE", value: "1" });
    expect(read[0]!.broker).toEqual({ availability: "NOT_PUBLISHED", reasonCode: "BROKER_EQUITY_FIELD_NOT_PUBLISHED" });
    const swapped = clone(rows().source_figures);
    swapped.figures.reverse();
    expect(readSourceFigures(swapped)).toBeNull();
    const short = clone(rows().source_figures);
    short.figures.pop();
    expect(readSourceFigures(short)).toBeNull();
  });

  it("reads series members with exact string points and refuses a number point", () => {
    const read = readSeriesMembers(rows().series)!;
    expect(read).toMatchObject({ resolution: "1h", unit: "USDT", methodologyRef: "portal.net-pnl.TEST_ONLY.v1" });
    expect(read.points.map((p) => p.value)).toEqual(["0", "12.5", "-3.25"]);
    expect(readSeriesMembers(dark().series)).toEqual({ resolution: null, points: [], methodologyRef: null, unit: null });
    expect(readSeriesMembers({ ...rows().series, points: [{ t: "2026-10-12T08:00:00.000Z", value: 12.5 }] })).toBeNull();
    expect(readSeriesMembers({ ...rows().series, resolution: "hourly" })).toBeNull();
    expect(readSeriesMembers({ ...rows().series, points: new Array(2001).fill(rows().series.points[0]) })).toBeNull();
  });

  it("reads gap ranges as a Fact and plan author / envelope", () => {
    expect(readGapRanges(rows().gap_ranges)).toEqual({ availability: "AVAILABLE", value: [{ from: "2026-10-12T11:52:00.000Z", to: "2026-10-12T12:04:00.000Z" }] });
    expect(readGapRanges({ availability: "NOT_PUBLISHED", value: null, reason_code: "SOURCE_CONTINUITY_UNAVAILABLE" })).toEqual({ availability: "NOT_PUBLISHED", reasonCode: "SOURCE_CONTINUITY_UNAVAILABLE" });
    expect(readGapRanges({ availability: "AVAILABLE", value: [{ from: "x", to: "y" }], reason_code: null })).toBeNull();
    const [first, second] = rows().plan_rows;
    expect(readPlanAuthor(first.author)).toBe("usr_TEST_ONLY_author");
    expect(readPlanAuthor({ user_id: "usr_x", extra: 1 })).toBeNull();
    expect(readPlanEnvelope(first.envelope)).toEqual({ availability: "AVAILABLE", value: { envelopeId: "cenv_TEST_ONLY_1", revision: 1, status: "DRAFT" } });
    // AVAILABLE with a null value = the lookup ran and none exists
    expect(readPlanEnvelope(second.envelope)).toEqual({ availability: "AVAILABLE", value: null });
    expect(readPlanEnvelope({ availability: "AVAILABLE", value: { envelope_id: "e", revision: 1, status: "ACTIVE" }, reason_code: null })).toBeNull();
  });
});

describe("identity (FE-066, S3-U5)", () => {
  const dep = (name: string): Any => {
    const body = loadCanonical<Any>(name);
    return body.certification ?? body.deployment ?? body.data.deployment;
  };
  it("reads the five keys of the four stage bodies and keeps each reason code", () => {
    expect(readDeploymentIdentity(dep("execution-canary-control-room.identity"))).toEqual({
      alphaId: "alpha_doge_mom", alphaName: null, portfolioName: "Crypto Core", alphaReasonCode: "ALPHA_NAME_NOT_PUBLISHED", portfolioNameReasonCode: null,
    });
    expect(readDeploymentIdentity(dep("execution-live-full-operations.identity"))).toMatchObject({ alphaId: null, alphaReasonCode: "ALPHA_MEMBERSHIP_NOT_QUALIFIED", portfolioName: "Crypto Core" });
    expect(readDeploymentIdentity(dep("execution-sandbox-certification.identity"))).toMatchObject({ portfolioName: null, portfolioNameReasonCode: "PORTFOLIO_NAME_NOT_AUTHORIZED" });
    expect(readDeploymentIdentity(dep("execution-paper-workbench.identity"))).toMatchObject({ alphaId: "alpha_doge_mom" });
    expect(readDeploymentIdentity(dep("execution-canary-control-room.unavailable"))).toMatchObject({ alphaId: null, alphaReasonCode: "DEPLOYMENT_IDENTITY_NOT_READ" });
  });
  it("a body without the keys (a SCOPED_V2 body, an older producer) is typed absence, not a guess", () => {
    const { alpha_id: _a, alpha_name: _b, portfolio_name: _c, alpha_reason_code: _d, portfolio_name_reason_code: _e, ...bare } = dep("execution-canary-control-room.identity");
    expect(readDeploymentIdentity(bare)).toBeNull();
    expect(readDeploymentIdentity(null)).toBeNull();
  });
  it("enforces dependentRequired and the name/reason rule", () => {
    const base = dep("execution-canary-control-room.identity");
    const without = (key: string) => {
      const copy = clone(base);
      delete copy[key];
      return copy;
    };
    for (const key of ["alpha_id", "alpha_name", "portfolio_name", "alpha_reason_code", "portfolio_name_reason_code"]) expect(readDeploymentIdentity(without(key)), key).toBeNull();
    expect(readDeploymentIdentity({ ...base, alpha_name: "Doge Momentum" })).toBeNull(); // a name needs a null reason
    expect(readDeploymentIdentity({ ...base, alpha_name: "Doge Momentum", alpha_reason_code: null })).toMatchObject({ alphaName: "Doge Momentum" });
    expect(readDeploymentIdentity({ ...base, alpha_name: "Doge", alpha_id: null, alpha_reason_code: null })).toBeNull(); // a name implies the id
    expect(readDeploymentIdentity({ ...base, portfolio_name: null })).toBeNull(); // no name, no reason
    expect(readDeploymentIdentity({ ...base, alpha_reason_code: "SOMETHING_ELSE" })).toBeNull();
    expect(readDeploymentIdentity({ ...base, portfolio_name: " padded " })).toBeNull();
    expect(readDeploymentIdentity({ ...base, portfolio_name: "a‮b" })).toBeNull();
    expect(readDeploymentIdentity({ ...base, alpha_id: "bad id" })).toBeNull();
  });
});

describe("Paper: positions_by_side (S3-U4) and venue_calendar (FE-070)", () => {
  const side = (name: string) => loadCanonical<Any>(name).data.positions_by_side;
  it("reads the three published states; gross is the server's string; notional stays the typed unavailable", () => {
    const ok = readPositionsBySide(side("execution-paper-workbench.positions-by-side"))!;
    expect(ok.state).toBe("AVAILABLE");
    expect(ok.rows[0]).toEqual({ instrumentId: "BTCUSDT", longQuantity: "0.91", shortQuantity: "0.52", grossQuantity: "1.43", positionCount: 2 });
    expect(ok.rows[1]!.shortQuantity).toBe("0");
    expect(ok.notionalReasonCode).toBe("E5_POSITION_CURRENCY_AND_MARK_LINEAGE_UNQUALIFIED");
    expect(readPositionsBySide(side("execution-paper-workbench.positions-by-side.partial"))).toMatchObject({ state: "PARTIAL", reasonCode: "POSITION_ROWS_UNCLASSIFIED", excluded: { unclassifiedRows: 2, noInstrumentRows: 1 } });
    expect(readPositionsBySide(side("execution-paper-workbench.positions-by-side.unavailable"))).toMatchObject({ state: "UNAVAILABLE", reasonCode: "POSITIONS_NOT_PUBLISHED", rows: [] });
  });
  it("applies the schema conditionals and refuses a number quantity or a derived notional", () => {
    const ok = side("execution-paper-workbench.positions-by-side");
    expect(readPositionsBySide({ ...ok, state: "EMPTY" })).toBeNull(); // EMPTY has no rows
    expect(readPositionsBySide({ ...ok, state: "UNAVAILABLE" })).toBeNull();
    expect(readPositionsBySide({ ...ok, reason_code: "SOURCE_POSITIONS_PARTIAL" })).toBeNull(); // AVAILABLE carries no reason
    expect(readPositionsBySide({ ...ok, state: "PARTIAL", reason_code: null })).toBeNull();
    expect(readPositionsBySide({ ...ok, notional: { state: "AVAILABLE", value: "1" } })).toBeNull();
    const num = clone(ok);
    num.rows[0].long_quantity = 0.91;
    expect(readPositionsBySide(num)).toBeNull();
    const neg = clone(ok);
    neg.rows[0].gross_quantity = "-1";
    expect(readPositionsBySide(neg)).toBeNull();
  });
  it("reads the populated calendar and the unavailable one; is_open is the source's statement", () => {
    const read = readVenueCalendar(calendar())!;
    expect(read.timezone).toEqual({ availability: "AVAILABLE", value: "Asia/Ho_Chi_Minh" });
    expect(read.windows.availability === "AVAILABLE" && read.windows.value.map((w) => w.kind)).toEqual(["OPENING_AUCTION", "TRADING_SESSION", "TRADING_SESSION", "CLOSING_AUCTION"]);
    expect(read.isOpen).toEqual({ availability: "AVAILABLE", value: false });
    expect(read.holidays.availability === "AVAILABLE" && read.holidays.value[1]).toEqual({ date: "2099-01-02", name: null });
    const darkCalendar = readVenueCalendar(loadCanonical<Any>("execution-paper-workbench-vnm.partial").data.venue_calendar)!;
    expect(darkCalendar.isOpen).toEqual({ availability: "NOT_PUBLISHED", reasonCode: "N28_VENUE_CALENDAR_NOT_ACTIVE" });
    expect(validateAgainst("execution-stage-facts.v1", "/$defs/VenueCalendar", calendar())).toEqual([]);
  });
  it("refuses a wrong market, a bad clock, an unknown window kind and a string is_open", () => {
    const c = calendar();
    expect(readVenueCalendar({ ...c, market: "US_EQUITY" })).toBeNull();
    expect(readVenueCalendar({ ...c, is_open: { availability: "AVAILABLE", value: "false", reason_code: null } })).toBeNull();
    const clock = clone(c);
    clock.windows.value[0].open = "9:00";
    expect(readVenueCalendar(clock)).toBeNull();
    const kind = clone(c);
    kind.windows.value[0].kind = "LUNCH";
    expect(readVenueCalendar(kind)).toBeNull();
    const tz = clone(c);
    tz.timezone.value = "Vietnam";
    expect(readVenueCalendar(tz)).toBeNull();
    expect(readVenueCalendar({ ...c, extra: 1 })).toBeNull();
  });
});
