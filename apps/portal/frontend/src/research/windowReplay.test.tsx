/** §44 / WEX: the complete retained window and the engine journal on Replay — exact fills, typed absence, bounded paging, no invented level. */
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PortalApiError } from "../lib/api";
import { WindowReplayCard, activeLevel } from "./WindowReplayCard";
import { fillSymbol } from "./EvidenceCharts";
import { windowExecutionApi, type WindowExecutionPage } from "./windowExecutionClient";

const charts = vi.hoisted(() => ({ last: null as null | { bars: unknown[]; fills: unknown[] } }));
vi.mock("./EvidenceCharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./EvidenceCharts")>();
  return {
    ...actual,
    WindowReplayChart: (props: { bars: unknown[]; fills: unknown[] }) => {
      charts.last = props;
      return <div data-chart-stub data-bars={props.bars.length} data-fills={props.fills.length} />;
    },
  };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  charts.last = null;
});

const H = 3_600_000;
const T0 = 1_780_876_800_000;
const obs = (i: number, over: Record<string, unknown> = {}) => ({
  source_ordinal: i,
  window: "OOS",
  fold_id: null,
  at_utc_ms: T0 + i * H,
  kind: "OBSERVATION",
  payload: { equity: "20000", return_fraction: "0", drawdown_fraction: "0", accepted_position: "0", signal_target: "0", candle: { open: "100", high: "101", low: "99", close: "100.5", volume: "1" }, fee: null, funding: null, turnover: null, active_stop: "0", active_take_profit: "0", ...over },
});
const page = (rows: unknown[], over: Record<string, unknown> = {}): WindowExecutionPage =>
  ({
    schema_version: "research.window-execution-page.v1",
    run_id: "rrun_x",
    availability: { state: "AVAILABLE", reason_code: null },
    revision: "r".repeat(64),
    window: "OOS",
    fold_id: null,
    descriptor: { window: "OOS", fold_id: null, availability: { state: "AVAILABLE", reason_code: null }, start_utc_ms: T0, end_exclusive_utc_ms: T0 + 10 * H, observation_count: 10, authority: "RETAINED_NATIVE_ACCOUNT" },
    counts: { matching: rows.length, returned: rows.length },
    rows,
    next_cursor: null,
    authority: "COMPLETED_RETAINED_ACCOUNT_AND_ENGINE_AUDIT_NOT_BROKER_HISTORY",
    ...over,
  }) as unknown as WindowExecutionPage;
const fillRow = (i: number, p: Record<string, unknown>) => ({
  source_ordinal: 100 + i,
  window: "OOS",
  fold_id: null,
  at_utc_ms: T0 + 2 * H,
  kind: "EXECUTION",
  payload: { record_kind: "FILL", source_relation: "result.fills", source_ordinal: i, execution_route: "intrabar_bracket", fill_price: "63557.1", fill_qty: "0.03146776677979329", fill_fee: "0.9999999999999999", price: "63557.1", qty: "0.03146776677979329", fee: "0.9999999999999999", side: "BUY", exit_reason: "entry", status: null, event_name: null, reason_code: null, working_price: null, working_qty: null, filled_at_utc_ms: T0 + 2 * H, timestamp_utc_ms: null, missing_fields: { status: "SOURCE_FIELD_NOT_PUBLISHED" }, ...p },
});
const rows10 = () => Array.from({ length: 10 }, (_, i) => obs(i, i >= 3 && i <= 6 ? { accepted_position: "0.031", active_stop: "62730.8577", active_take_profit: "65209.5846" } : {}));

describe("the protective levels", () => {
  it("draws a level only while a position is open and the level is a positive price; flat bars break the line", () => {
    expect(activeLevel("0", "0")).toBeNull();
    expect(activeLevel("62730.8577", "0")).toBeNull();
    expect(activeLevel("0", "0.031")).toBeNull();
    expect(activeLevel(null, "0.031")).toBeNull();
    expect(activeLevel("62730.8577", null)).toBeNull();
    expect(activeLevel("62730.8577", "0.031")).toBe("62730.8577");
  });
  it("gives each exit its own glyph", () => {
    expect([fillSymbol("entry"), fillSymbol("take_profit"), fillSymbol("stop_loss"), fillSymbol("anything"), fillSymbol(null)]).toEqual(["triangle", "diamond", "rect", "circle", "circle"]);
  });
});

describe("the card", () => {
  it("is closed by default and asks for nothing until it is opened", async () => {
    const obsSpy = vi.spyOn(windowExecutionApi, "observations").mockResolvedValue(page(rows10()));
    const recSpy = vi.spyOn(windowExecutionApi, "records").mockResolvedValue(page([]));
    const { container } = render(<WindowReplayCard runId="rrun_x" />);
    expect(container.querySelector("details")!.hasAttribute("open")).toBe(false);
    expect(obsSpy).not.toHaveBeenCalled();
    expect(recSpy).not.toHaveBeenCalled();
  });

  it("draws the engine's fill at its actual price and bar, with exact decimals, and breaks the stop/take-profit line when flat", async () => {
    vi.spyOn(windowExecutionApi, "observations").mockResolvedValue(page(rows10()));
    vi.spyOn(windowExecutionApi, "records").mockResolvedValue(page([fillRow(2, {}), fillRow(3, { side: "SELL", exit_reason: "take_profit", fill_price: "65209.5846", price: "65209.5846", filled_at_utc_ms: T0 + 6 * H })]));
    const { container } = render(<WindowReplayCard runId="rrun_x" workspaceId="ws_1" defaultOpen />);
    await waitFor(() => expect(container.querySelector("[data-chart-stub]")).not.toBeNull());
    await waitFor(() => expect(container.querySelectorAll("[data-record='FILL']")).toHaveLength(2));
    const stub = charts.last!;
    expect(stub.bars).toHaveLength(10);
    const bars = stub.bars as { active_stop: string | null; active_take_profit: string | null }[];
    expect(bars.filter((bar) => bar.active_stop !== null)).toHaveLength(4);
    expect(bars[0]!.active_stop).toBeNull();
    expect(bars[0]!.active_take_profit).toBeNull();
    expect(stub.fills).toEqual([
      { at_utc_ms: T0 + 2 * H, price: "63557.1", qty: "0.03146776677979329", side: "BUY", exit_reason: "entry" },
      { at_utc_ms: T0 + 6 * H, price: "65209.5846", qty: "0.03146776677979329", side: "SELL", exit_reason: "take_profit" },
    ]);
    const row = container.querySelector("[data-record='FILL']")!;
    expect(row.querySelector('[data-exact="0.9999999999999999"]')).not.toBeNull();
    expect(row.querySelector('[data-exact="63557.1"]')).not.toBeNull();
    expect(row.querySelector('[data-field-absent="status"]')).toBeNull();
  });

  it("a field the source did not publish says so, never 0", async () => {
    vi.spyOn(windowExecutionApi, "observations").mockResolvedValue(page(rows10()));
    vi.spyOn(windowExecutionApi, "records").mockResolvedValue(page([fillRow(2, { exit_reason: null, status: null })]));
    const { container } = render(<WindowReplayCard runId="rrun_x" defaultOpen />);
    await waitFor(() => expect(container.querySelector("[data-record='FILL']")).not.toBeNull());
    const absent = container.querySelector('[data-record="FILL"] [data-field-absent="status"]')!;
    expect(absent.textContent).toBe("not published");
    expect(absent.getAttribute("title")).toBe("SOURCE_FIELD_NOT_PUBLISHED");
  });

  it("an unpublished journal relation is a typed absence, not '0 orders'; an empty published journal says it is empty", async () => {
    vi.spyOn(windowExecutionApi, "observations").mockResolvedValue(page(rows10()));
    const records = vi.spyOn(windowExecutionApi, "records");
    records.mockResolvedValueOnce(page([fillRow(2, {})]));
    records.mockResolvedValueOnce(page([], { availability: { state: "NOT_PUBLISHED", reason_code: "ENGINE_EXECUTION_RELATION_NOT_PUBLISHED" }, descriptor: null }));
    records.mockResolvedValueOnce(page([]));
    const { container } = render(<WindowReplayCard runId="rrun_x" defaultOpen />);
    await waitFor(() => expect(container.querySelector("[data-record='FILL']")).not.toBeNull());
    fireEvent.click(container.querySelector('[data-record-kind="ORDER"]')!);
    await waitFor(() => expect(container.querySelector('[data-window-journal] [data-window-absent="NOT_PUBLISHED"]')).not.toBeNull());
    expect(container.querySelector('[data-window-journal] [data-window-absent]')!.getAttribute("data-reason-code")).toBe("ENGINE_EXECUTION_RELATION_NOT_PUBLISHED");
    expect(container.querySelector("[data-journal-empty]")).toBeNull();
    fireEvent.click(container.querySelector('[data-record-kind="TRADE"]')!);
    await waitFor(() => expect(container.querySelector('[data-journal-empty="TRADE"]')).not.toBeNull());
  });

  it("shows a window the protocol never executed with the server's reason, and an independent-Holdout-less protocol as not applicable", async () => {
    const observations = vi.spyOn(windowExecutionApi, "observations");
    observations.mockResolvedValueOnce(page(rows10()));
    observations.mockResolvedValueOnce(page([], { window: "HOLDOUT", availability: { state: "NOT_APPLICABLE", reason_code: "WFO_PROTOCOL_HAS_NO_INDEPENDENT_HOLDOUT" }, descriptor: null }));
    vi.spyOn(windowExecutionApi, "records").mockResolvedValue(page([]));
    const { container } = render(<WindowReplayCard runId="rrun_x" defaultOpen />);
    await waitFor(() => expect(container.querySelector("[data-window-descriptor]")).not.toBeNull());
    fireEvent.click(container.querySelector('[data-window="HOLDOUT"]')!);
    await waitFor(() => expect(container.querySelector('[data-window-absent="NOT_APPLICABLE"]')).not.toBeNull());
    expect(container.querySelector('[data-window-absent]')!.getAttribute("data-reason-code")).toBe("WFO_PROTOCOL_HAS_NO_INDEPENDENT_HOLDOUT");
    expect(container.querySelector("[data-chart-stub]")).toBeNull();
    expect(observations.mock.calls[1]![1]).toEqual({ window: "HOLDOUT", foldId: null });
  });

  it("pages by the opaque cursor exactly as served, and resets the page when the window changes", async () => {
    const observations = vi.spyOn(windowExecutionApi, "observations");
    observations.mockResolvedValueOnce(page(rows10().slice(0, 5), { next_cursor: "kc1.opaque.sig" }));
    observations.mockResolvedValueOnce(page(rows10().slice(5)));
    observations.mockResolvedValueOnce(page(rows10()));
    vi.spyOn(windowExecutionApi, "records").mockResolvedValue(page([]));
    const { container } = render(<WindowReplayCard runId="rrun_x" defaultOpen />);
    await waitFor(() => expect(container.querySelector('[data-action="later"]')).not.toBeNull());
    await waitFor(() => expect((container.querySelector('[data-action="later"]') as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(container.querySelector('[data-action="later"]')!);
    await waitFor(() => expect(observations).toHaveBeenCalledTimes(2));
    expect(observations.mock.calls[1]![2]).toMatchObject({ cursor: "kc1.opaque.sig", limit: 200 });
    fireEvent.click(container.querySelector('[data-window="IS"]')!);
    await waitFor(() => expect(observations).toHaveBeenCalledTimes(3));
    expect(observations.mock.calls[2]![2]!.cursor ?? null).toBeNull();
    expect(observations.mock.calls[2]![1]).toEqual({ window: "IS", foldId: null });
  });

  it("a stale cursor (400) is worded by the screen, and a server without the route says so", async () => {
    const observations = vi.spyOn(windowExecutionApi, "observations");
    observations.mockRejectedValueOnce(new PortalApiError("secret prose", 400, "RESEARCH_REPLAY_CURSOR_INVALID", null));
    vi.spyOn(windowExecutionApi, "records").mockResolvedValue(page([]));
    const { container, unmount } = render(<WindowReplayCard runId="rrun_x" defaultOpen />);
    await waitFor(() => expect(container.querySelector("[data-window-failed]")).not.toBeNull());
    expect(container.textContent).not.toContain("secret prose");
    expect(container.querySelector("[data-window-failed]")!.textContent).toContain("no longer valid");
    unmount();
    observations.mockRejectedValueOnce(new PortalApiError("missing", 404, null, null));
    const second = render(<WindowReplayCard runId="rrun_y" defaultOpen />);
    await waitFor(() => expect(second.container.querySelector("[data-window-unavailable]")).not.toBeNull());
  });

  it("names a Walk-forward IS fold as a post-selection diagnostic and sends the engine fold id", async () => {
    const observations = vi.spyOn(windowExecutionApi, "observations");
    observations.mockResolvedValueOnce(page(rows10()));
    observations.mockResolvedValueOnce(page(rows10(), { window: "IS", fold_id: null }));
    observations.mockResolvedValueOnce(page(rows10(), { window: "IS", fold_id: "0", descriptor: { window: "IS", fold_id: "0", availability: { state: "AVAILABLE", reason_code: null }, start_utc_ms: T0, end_exclusive_utc_ms: T0 + 10 * H, observation_count: 10, authority: "FROZEN_PARAMETER_POST_SELECTION_TRAINING_DIAGNOSTIC" } }));
    vi.spyOn(windowExecutionApi, "records").mockResolvedValue(page([]));
    const { container } = render(<WindowReplayCard runId="rrun_x" defaultOpen />);
    await waitFor(() => expect(container.querySelector("[data-window-descriptor]")).not.toBeNull());
    fireEvent.click(container.querySelector('[data-window="IS"]')!);
    const input = (await waitFor(() => container.querySelector('input[aria-label="fold id"]'))) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "0" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(container.querySelector('[data-window-authority="FROZEN_PARAMETER_POST_SELECTION_TRAINING_DIAGNOSTIC"]')).not.toBeNull());
    expect(container.querySelector("[data-window-caution]")!.textContent).toContain("not one stitched IS account");
    expect(observations.mock.calls.at(-1)![1]).toEqual({ window: "IS", foldId: "0" });
  });
});
