/** §44 / WEX: the complete retained window and the engine journal on Replay — exact fills, typed absence, bounded paging, no invented level. */
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PortalApiError } from "../lib/api";
import { WindowReplayCard, activeLevel, levelDisclosure, servedLevel } from "./WindowReplayCard";
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

/** A bar as the repaired read (BR-S02-19) serves it: levels null unless a position is open and the engine published a positive price. */
const served = (i: number, kind: "flat" | "open" | "open-unset" | "open-missing") => {
  const open = kind !== "flat";
  const state = (level: string | null, why: string) => ({ state: level === null ? (why === "SOURCE_FIELD_NOT_PUBLISHED" ? "NOT_PUBLISHED" : "NOT_APPLICABLE") : "AVAILABLE", reason_code: level === null ? why : null, source_value: level ?? "0" });
  const stop = kind === "open" ? "62730.8577" : null;
  const take = kind === "open" ? "65209.5846" : null;
  const why = kind === "flat" ? "POSITION_FLAT" : kind === "open-unset" ? "ENGINE_ACTIVE_LEVEL_NOT_SET" : "SOURCE_FIELD_NOT_PUBLISHED";
  return obs(i, {
    accepted_position: open ? "0.031" : "0",
    active_stop: stop,
    active_take_profit: take,
    active_level_availability: { policy_id: "POSITION_BOUND_POSITIVE_LEVEL_V1", origin: "PORTAL_NORMALIZED", source_ref: "RETAINED_WINDOW_OBSERVATION_PAYLOAD", active_stop: state(stop, why), active_take_profit: state(take, why) },
  });
};

describe("the served protective levels (BR-S02-19)", () => {
  it("draws exactly what the server served; the raw source value is never drawn", () => {
    expect(servedLevel(served(0, "flat").payload as never, "active_stop")).toBeNull();
    expect(servedLevel(served(0, "open").payload as never, "active_stop")).toBe("62730.8577");
    /* An open position whose level the engine left unset stays a gap, even though the older rule would also have drawn nothing here. */
    expect(servedLevel(served(0, "open-unset").payload as never, "active_take_profit")).toBeNull();
    /* A served null wins over the heuristic: the older rule would have drawn this stale positive level, the repaired read says it is not an active level. */
    const stale = obs(0, { accepted_position: "0.031", active_stop: null, active_take_profit: null, active_level_availability: { policy_id: "POSITION_BOUND_POSITIVE_LEVEL_V1", origin: "PORTAL_NORMALIZED", source_ref: "RETAINED_WINDOW_OBSERVATION_PAYLOAD", active_stop: { state: "NOT_PUBLISHED", reason_code: "SOURCE_ACTIVE_LEVEL_NON_POSITIVE", source_value: "-5" }, active_take_profit: { state: "NOT_APPLICABLE", reason_code: "POSITION_FLAT", source_value: "62000" } } });
    expect(servedLevel(stale.payload as never, "active_stop")).toBeNull();
    expect(servedLevel(stale.payload as never, "active_take_profit")).toBeNull();
  });
  it("an older server that serves no availability block keeps the position-bound rule", () => {
    expect(servedLevel(obs(0, { accepted_position: "0", active_stop: "0" }).payload as never, "active_stop")).toBeNull();
    expect(servedLevel(obs(0, { accepted_position: "0.031", active_stop: "62730.8577" }).payload as never, "active_stop")).toBe("62730.8577");
  });
  it("counts bars by typed state and reason, in the server's terms", () => {
    const rows = [served(0, "flat"), served(1, "flat"), served(2, "open"), served(3, "open"), served(4, "open-unset"), served(5, "open-missing")] as never;
    const stop = levelDisclosure(rows, "active_stop");
    expect(stop.typed).toBe(true);
    expect(stop.drawn).toBe(2);
    expect(stop.absent.map((a) => [a.state, a.reason, a.count])).toEqual([
      ["NOT_APPLICABLE", "POSITION_FLAT", 2],
      ["NOT_APPLICABLE", "ENGINE_ACTIVE_LEVEL_NOT_SET", 1],
      ["NOT_PUBLISHED", "SOURCE_FIELD_NOT_PUBLISHED", 1],
    ]);
    expect(levelDisclosure([obs(0)] as never, "active_stop").typed).toBe(false);
  });
  it("prints the disclosure under the chart and passes only served levels to it", async () => {
    vi.spyOn(windowExecutionApi, "observations").mockResolvedValue(page(Array.from({ length: 10 }, (_, i) => served(i, i >= 3 && i <= 6 ? "open" : "flat"))));
    vi.spyOn(windowExecutionApi, "records").mockResolvedValue(page([]));
    const { container } = render(<WindowReplayCard runId="rrun_x" defaultOpen />);
    await waitFor(() => expect(container.querySelector("[data-level-disclosure]")).not.toBeNull());
    await waitFor(() => expect(charts.last).not.toBeNull());
    const line = container.querySelector("[data-level-disclosure]")!.textContent!;
    expect(line).toContain("Stop · 4 bars drawn · 6 not applicable (position flat)");
    expect(line).toContain("Take-profit · 4 bars drawn · 6 not applicable (position flat)");
    expect(line).not.toContain("62730.8577");
    const bars = charts.last!.bars as { active_stop: string | null }[];
    expect(bars.filter((bar) => bar.active_stop !== null)).toHaveLength(4);
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
