/**
 * Observed timeline (EDS-09b / EDS-10b consumer, G8): the reader keeps the
 * BFF's shape honest, the panel keeps its layout in every state, and motion
 * follows the projection sequence — never a wall clock.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { deployedEnvironments, newEntryKeys, observedTimelinePath, readObservedTimeline } from "./api/observedTimeline";
import { ObservedTimelinePanel } from "./components/ObservedTimelinePanel";

afterEach(cleanup);

const RAW = {
  schema_version: "portal.execution.observed-timeline-bff.v1",
  logical_operation_id: "executionObservedTimelineV1",
  record_authority: "PORTAL_CONTROL",
  source_authority: "TRADING_SYSTEM_CURRENT_STATE",
  observation_authority: "PORTAL_OBSERVATION",
  observation_semantics: "BOUNDED_CURRENT_PAGE",
  environment: "paper",
  profile_id: "PAPER_BINANCE_USDM",
  resource: { kind: "ALPHA", id: "adaptive_hma_cpp_00115m" },
  projection: { epoch_id: "5ce5915e", sequence: 8486, payload_digest: "sha256:x", source_contract_revision: "r", source_catalogue_sha256: null, source_as_of_ms: 1788703429473, received_at_ms: 1788703430000, last_successful_refresh_at_ms: 1788703430000, completeness: "PARTIAL" },
  observed_timeline: {
    state: "READY", reason_code: null, retryable: false,
    freshness: { as_of_ms: 1788703429473, read_at_ms: 1788703440000 },
    source_history_semantics: "BOUNDED_CURRENT_PAGE_OBSERVATION_NOT_AUTHORITATIVE_EVENT_REPLAY",
    data: {
      label: "OBSERVED_TIMELINE", ordering_rule: "OBSERVED_AT_MS_THEN_CLOCK_CLASS_THEN_SOURCE_IDENTIFIER_V1",
      entries: [
        { observed_at_ms: 1784412003040, source_clock: "FILL_TRADE_TIME", observation_type: "FILL_OBSERVED", source_record: { kind: "FILL", id: "1877" }, resource: { deployment_id: "d1", strategy_id: "adaptive_hma_cpp_00115m", account_id: "paper-binance-adaptive_hma_cpp_00115m", portfolio_id: null, execution_session_id: "s1", instrument_id: "ETHUSDT.BINANCE" }, values: { price: "1859.89", quantity: "0.08", realized_pnl: "0" }, rejected_exact_value_fields: [] },
        { observed_at_ms: 1784412005090, source_clock: "ORDER_SUBMITTED_AT", observation_type: "ORDER_OBSERVED", source_record: { kind: "ORDER", id: "37593" }, resource: { deployment_id: "d1", strategy_id: "adaptive_hma_cpp_00115m", account_id: "paper-binance-adaptive_hma_cpp_00115m", portfolio_id: null, execution_session_id: "s1", instrument_id: "ETHUSDT.BINANCE" }, values: { price: null, quantity: "0.08", realized_pnl: null }, rejected_exact_value_fields: ["price"] },
        { observed_at_ms: 1784412006000, observation_type: "COMMAND_JOURNAL_ROW_OBSERVED", source_record: { kind: "COMMAND_JOURNAL", id: "cmd_a" }, resource: {}, values: {}, rejected_exact_value_fields: [] },
        { observed_at_ms: "bad", source_record: { kind: "ORDER", id: "x" } },
      ],
      unavailable_segments: [{ segment: "BROKER_ACKNOWLEDGEMENT", state: "UNAVAILABLE", reason_code: "EDS10_BROKER_ACK_CLOCK_SOURCE_GAP_CONFIRMED" }],
    },
  },
  mark_context: { state: "READY", data: { label: "DERIVED · mark-context", marks: [{ position_id: "p1", instrument_id: "ETHUSDT.BINANCE", mark_price: "1849.83", mark_price_at_ms: 1788703400000 }], unavailable_market_context: { state: "UNAVAILABLE", reason_code: "EDS10_MARKET_OHLCV_SOURCE_GAP_CONFIRMED" } } },
  page: { has_more: true, next_cursor: "kc1.abc.ZGVm" },
};

describe("observed timeline reader", () => {
  it("keeps the BFF's provenance, projection sequence, exact strings and the opaque cursor; drops a row without identity or clock", () => {
    const t = readObservedTimeline(RAW)!;
    expect(t).toMatchObject({ observationAuthority: "PORTAL_OBSERVATION", observationSemantics: "BOUNDED_CURRENT_PAGE", resource: { kind: "ALPHA", id: "adaptive_hma_cpp_00115m" } });
    expect(t.projection).toMatchObject({ sequence: 8486, sourceAsOfMs: 1788703429473, completeness: "PARTIAL" });
    expect(t.timeline.state).toBe("READY");
    expect(t.timeline.entries.map((e) => e.key)).toEqual(["FILL:1877", "ORDER:37593", "COMMAND_JOURNAL:cmd_a"]);
    expect(t.timeline.entries[0]!.values.price).toBe("1859.89");
    expect(t.timeline.entries[1]!.rejectedFields).toEqual(["price"]);
    expect(t.timeline.segments[0]).toEqual({ segment: "BROKER_ACKNOWLEDGEMENT", state: "UNAVAILABLE", reasonCode: "EDS10_BROKER_ACK_CLOCK_SOURCE_GAP_CONFIRMED" });
    expect(t.mark.marks[0]).toMatchObject({ markPrice: "1849.83", instrumentId: "ETHUSDT.BINANCE" });
    expect(t.mark.marketContext.reasonCode).toBe("EDS10_MARKET_OHLCV_SOURCE_GAP_CONFIRMED");
    expect(t.page).toEqual({ hasMore: true, nextCursor: "kc1.abc.ZGVm" });
    expect(readObservedTimeline({})).toBeNull();
  });
  it("builds the query and passes the continuation back unchanged", () => {
    expect(observedTimelinePath({ environment: "paper", subjectKind: "alpha", subjectId: "a b", limit: 500, after: "kc1.abc.ZGVm" })).toBe("/views/observed-timeline?environment=paper&subject_kind=alpha&subject_id=a+b&limit=200&after=kc1.abc.ZGVm");
  });
  it("reads the deployed environments from the resource's own deployment rows, not the resolver default", () => {
    expect(deployedEnvironments({ deployments: { data: { rows: [{ mode: "sandbox" }, { mode: "paper" }, { mode: "paper" }, { mode: "backtest" }] } } })).toEqual(["paper", "sandbox"]);
    expect(deployedEnvironments({ deployments: { data: null } })).toEqual([]);
    expect(deployedEnvironments(null)).toEqual([]);
  });
  it("tells which rows a revision brought in", () => {
    const first = readObservedTimeline(RAW)!.timeline.entries;
    const next = [...first, { ...first[0]!, key: "FILL:1900", record: { kind: "FILL", id: "1900" } }];
    expect([...newEntryKeys(first, next)]).toEqual(["FILL:1900"]);
    expect(newEntryKeys(null, next).size).toBe(0);
  });
});

describe("observed timeline panel", () => {
  it("renders the heading, provenance, rows, segments as Soon, mark context and the older-observations control", () => {
    const t = readObservedTimeline(RAW)!;
    const { container } = render(<ObservedTimelinePanel timeline={t} transport="ok" subjectLabel="adaptive_hma_cpp_00115m" onLoadMore={() => undefined} />);
    expect(screen.getByText("Observed timeline")).toBeTruthy();
    expect(screen.getByText("PORTAL_OBSERVATION")).toBeTruthy();
    expect(container.querySelectorAll("tbody tr")).toHaveLength(3);
    expect(container.querySelector('tr[data-observation="FILL:1877"]')?.textContent).toContain("1,859.89");
    expect(screen.getByText(/rev 8486/)).toBeTruthy();
    expect(screen.getByText(/Soon · BROKER_ACKNOWLEDGEMENT/)).toBeTruthy();
    expect(screen.getByText(/market context UNAVAILABLE · EDS10_MARKET_OHLCV_SOURCE_GAP_CONFIRMED/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "older observations" })).toBeTruthy();
    expect(container.querySelector(".exec-rp-foot")?.textContent).toContain("NOT_AUTHORITATIVE_EVENT_REPLAY");
  });
  it("keeps the layout with a typed reason when unavailable, and says a bounded empty page is not a replay absence", () => {
    const unavailable = readObservedTimeline({ ...RAW, observed_timeline: { state: "UNAVAILABLE", reason_code: "EDS10_OBSERVED_TIMELINE_RELATIONS_UNAVAILABLE", retryable: true, data: null } })!;
    const { container, unmount } = render(<ObservedTimelinePanel timeline={unavailable} transport="ok" subjectLabel="x" />);
    expect(container.querySelector('[data-state="UNAVAILABLE"]')).not.toBeNull();
    expect(screen.getAllByText(/EDS10_OBSERVED_TIMELINE_RELATIONS_UNAVAILABLE/).length).toBeGreaterThan(0);
    expect(container.querySelector(".exec-gate-unverified")?.textContent).toContain("The layout stays; nothing is inferred");
    unmount();
    const empty = readObservedTimeline({ ...RAW, observed_timeline: { state: "EMPTY", data: { entries: [], unavailable_segments: [] } } })!;
    render(<ObservedTimelinePanel timeline={empty} transport="ok" subjectLabel="x" />);
    expect(screen.getByText(/not a statement that nothing ever happened/)).toBeTruthy();
  });
  it("offers an environment switch only when the subject is deployed in more than one, and names the one being read", () => {
    const t = readObservedTimeline(RAW)!;
    const picked: string[] = [];
    const { container, unmount } = render(<ObservedTimelinePanel timeline={t} transport="ok" subjectLabel="x" environment="paper" environments={["paper", "sandbox"]} onEnvironment={(env) => picked.push(env)} />);
    expect(container.querySelector('[data-environment="paper"]')).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "sandbox", pressed: false }));
    expect(picked).toEqual(["sandbox"]);
    unmount();
    render(<ObservedTimelinePanel timeline={t} transport="ok" subjectLabel="x" environment="live" environments={["live"]} />);
    expect(screen.queryByRole("group", { name: "Environment" })).toBeNull();
    expect(screen.getByTitle("Environment").textContent).toBe("live");
  });
  it("restarts the beat only when the projection sequence advances", () => {
    const t1 = readObservedTimeline(RAW)!;
    const { container, rerender } = render(<ObservedTimelinePanel timeline={t1} transport="ok" subjectLabel="x" />);
    expect(container.querySelector(".exec-obs-rev")?.getAttribute("data-beat")).toBe("0");
    rerender(<ObservedTimelinePanel timeline={{ ...t1, timeline: { ...t1.timeline, entries: [...t1.timeline.entries] } }} transport="ok" subjectLabel="x" />);
    expect(container.querySelector(".exec-obs-rev")?.getAttribute("data-beat")).toBe("0");
    rerender(<ObservedTimelinePanel timeline={{ ...t1, projection: { ...t1.projection, sequence: 8487 } }} transport="ok" subjectLabel="x" />);
    expect(container.querySelector(".exec-obs-rev")?.getAttribute("data-beat")).toBe("1");
  });
});
