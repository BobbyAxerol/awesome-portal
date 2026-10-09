/**
 * §55 · Screen 06 for a natively searched run — from the published canonical fixture. The claims: trials, population and selection are
 * drawn from `native_search`; the engine's trial number and the display ordinal are two facts; later pages follow `native_cursor` with the
 * same `native_limit` and never a fold; what the source did not retain stays a typed absence; the scalar stages are not drawn beside it.
 */
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NativeSearchPanel, metricColumns } from "./NativeSearchPanel";
import type { NativeSearch, SearchDetail } from "./searchClient";
import { NATIVE_LIMIT, useNativeSearchPages } from "./useNativeSearchPages";
import { renderHook } from "@testing-library/react";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const FIXTURE = JSON.parse(readFileSync(join(process.cwd(), "..", "..", "..", "packages", "contracts", "fixtures", "research-native-search.valid.json"), "utf8")) as SearchDetail | NativeSearch;
const NATIVE = ("native_search" in FIXTURE ? FIXTURE.native_search : FIXTURE) as NativeSearch;
const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const panel = (native: NativeSearch, extra: Partial<Parameters<typeof NativeSearchPanel>[0]> = {}) =>
  render(<NativeSearchPanel native={native} rows={native.ledger.rows} hasMore={native.ledger.next_cursor !== null} loading={false} error={false} onMore={() => undefined} {...extra} />);

describe("the native search panel", () => {
  it("shows the selection: engine number and display ordinal are two facts, the digest is short with the full one in the tooltip", () => {
    const { container } = panel(NATIVE);
    const trial = container.querySelector('[data-selection-fact="trial"] dd')!.textContent!;
    expect(trial).toBe(`number ${NATIVE.selected_trial_number} · ordinal ${NATIVE.selected_trial_ordinal} of ${NATIVE.ledger.total}`);
    expect(container.querySelector('[data-selection-fact="digest"]')!.getAttribute("title")).toBe(NATIVE.selected_parameters_digest);
    expect(container.querySelector('[data-selection-fact="scope"] dd')!.textContent).toBe("native in-sample study");
  });

  it("prints the engine's retained selection metadata exactly and states what was not retained as typed absences", () => {
    const { container } = panel(NATIVE);
    const meta = NATIVE.selection_process.retained_source_metadata!;
    expect(container.querySelector('[data-selection-fact="plateau"] dd')!.textContent).toBe(meta.plateau_score);
    expect(container.querySelector('[data-selection-fact="medoid"] dd')!.textContent).toBe(`trial ${meta.medoid_trial_number} · trial ${meta.cluster_center_trial}`);
    expect(container.querySelector('[data-selection-fact="params"] dd')!.textContent).toBe(meta.param_names.join(" · "));
    expect(container.querySelector('[data-selection-fact="members"] [data-reason-code], [data-selection-fact="members"] [title]')).not.toBeNull();
    expect(container.querySelector('[data-selection-fact="members"]')!.textContent).toMatch(/not published/i);
    expect(container.querySelector('[data-selection-fact="sampler"]')!.textContent).toMatch(/not published/i);
    expect(container.querySelector("[data-fold-strip], [data-stage-grid]")).toBeNull();
  });

  it("draws every loaded trial with its exact values, marks θ* and keeps the population honest", () => {
    const { container } = panel(NATIVE);
    const rows = [...container.querySelectorAll("[data-native-trial]")];
    expect(rows).toHaveLength(NATIVE.ledger.rows.length);
    const first = NATIVE.ledger.rows[0]!;
    const row = container.querySelector(`[data-native-trial="${first.trial_number}"]`)!;
    expect(row.querySelector("[data-metric='objective']")!.getAttribute("data-exact")).toBe(first.objective.value);
    expect(container.querySelector("[data-native-ledger-count]")!.textContent).toContain(`${rows.length} of ${NATIVE.ledger.total} loaded`);
    expect(container.querySelector("[data-native-ledger-count]")!.textContent).toContain("not the scalar-WFO candidate pool");
    const selected = container.querySelectorAll('[data-trial-selected="true"]');
    expect([...selected].every((node) => node.querySelector("[data-theta-star]") !== null)).toBe(true);
  });

  it("a trial with no objective is a typed absence, never a number", () => {
    const native = copy(NATIVE);
    native.ledger.rows[0]!.objective = { value: null, availability: { state: "NOT_PUBLISHED", reason_code: "TRIAL_PRUNED_NO_OBJECTIVE" } };
    native.ledger.rows[0]!.state = "PRUNED";
    const { container } = panel(native);
    const cell = container.querySelector(`[data-native-trial="${native.ledger.rows[0]!.trial_number}"] [data-metric="objective"]`)!;
    expect(cell.getAttribute("data-metric-absent")).toBe("TRIAL_PRUNED_NO_OBJECTIVE");
    expect(cell.textContent).toMatch(/not published|pruned/i);
  });

  it("says where θ* is when its row is on a page not loaded yet, and offers the next page", () => {
    const native = copy(NATIVE);
    const rows = native.ledger.rows.filter((row) => !row.selected);
    const onMore = vi.fn();
    const { container } = panel(native, { rows, hasMore: true, onMore });
    expect(container.querySelector("[data-selected-not-loaded]")!.textContent).toContain(`trial ${native.selected_trial_number} (ordinal ${native.selected_trial_ordinal})`);
    fireEvent.click(container.querySelector("[data-action='native-more']")!);
    expect(onMore).toHaveBeenCalledOnce();
  });

  it("metric columns are the loaded rows' own, first-seen, capped", () => {
    expect(metricColumns(NATIVE.ledger.rows)).toEqual(Object.keys(NATIVE.ledger.rows[0]!.metrics).slice(0, 4));
    /* the objective has its own column, so a metric of the same name is not printed twice */
    expect(metricColumns(NATIVE.ledger.rows, 4, NATIVE.summary.objective_name)).not.toContain(NATIVE.summary.objective_name);
    expect(metricColumns([])).toEqual([]);
  });
});

describe("native paging", () => {
  const page = (rows: NativeSearch["ledger"]["rows"], next: string | null, total = 5): NativeSearch => {
    const native = copy(NATIVE);
    native.ledger = { total, rows, next_cursor: next };
    return native;
  };
  const rowOf = (n: number) => ({ ...copy(NATIVE.ledger.rows[0]!), source_ordinal: n, trial_number: n, trial_ordinal: n + 1, selected: false });

  it("follows native_cursor with the same native_limit and never sends a fold; a repeated trial is kept once", async () => {
    const base = page([rowOf(0), rowOf(1)], "cursor-2");
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push(url);
        const next = page([rowOf(1), rowOf(2), rowOf(3)], null);
        return { ok: true, status: 200, statusText: "OK", headers: new Headers(), json: async () => ({ ...(FIXTURE as object), native_search: next }) } as unknown as Response;
      }),
    );
    const { result } = renderHook(() => useNativeSearchPages("rrun_x", base, "ws_1"));
    expect(result.current.hasMore).toBe(true);
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.rows).toHaveLength(4));
    expect(result.current.rows.map((row) => row.trial_number)).toEqual([0, 1, 2, 3]);
    expect(result.current.hasMore).toBe(false);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain(`native_limit=${NATIVE_LIMIT}`);
    expect(calls[0]).toContain("native_cursor=cursor-2");
    expect(calls[0]).not.toMatch(/[?&]fold=/);
    vi.unstubAllGlobals();
  });

  it("a failed page says so, keeps the rows in hand and the offer to try again", async () => {
    const base = page([rowOf(0)], "cursor-2");
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503, statusText: "x", headers: new Headers(), json: async () => ({ error: { code: "UNAVAILABLE" } }) }) as unknown as Response));
    const { result } = renderHook(() => useNativeSearchPages("rrun_x", base));
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.rows).toHaveLength(1);
    expect(result.current.hasMore).toBe(true);
    vi.unstubAllGlobals();
  });
});
