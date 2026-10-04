import { act, cleanup, renderHook } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { searchApi, type CurrentSourceSearch } from "./searchClient";
import { readSelectedCinemaTrial, useSelectedCinemaTrial } from "./useSelectedCinemaTrial";

const fixture = JSON.parse(readFileSync(join(process.cwd(), "../../../packages/contracts/fixtures/research-current-source.search-surface.valid.json"), "utf8")) as CurrentSourceSearch;
const signal = () => new AbortController().signal;
function page(start = 0, selected = "342", revision = fixture.revision): CurrentSourceSearch {
  const read: CurrentSourceSearch = structuredClone(fixture);
  read.revision = revision; read.selection.selected_trial_id = selected;
  read.ledger.source_trial_count = 400; read.ledger.returned_rows = 100;
  read.ledger.trials = Array.from({ length: 100 }, (_, i) => ({ ...structuredClone(fixture.ledger.trials[0]!), source_ordinal: start + i, trial_id: String(start + i),
    parameters: { window: "9007199254740993" }, params_digest: String(start + i).padStart(64, "0") }));
  read.ledger.page.next_cursor = start < 300 ? `opaque-page-${start + 100}` : null;
  read.ledger.page.has_more = start < 300;
  return read;
}
const deferred = <T,>() => { let resolve!: (value: T) => void, reject!: (cause: unknown) => void; const promise = new Promise<T>((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("Cinema exact selected-row lookup", () => {
  it("selected #342 outside page100 resolves exact digest with only three opaque named GETs", async () => {
    const read = vi.fn().mockResolvedValueOnce(page(100)).mockResolvedValueOnce(page(200)).mockResolvedValueOnce(page(300));
    const answer = await readSelectedCinemaTrial(fixture.run_id, page(), "342", "owned-workspace", signal(), undefined, read);
    expect(answer).toMatchObject({ state: "ready", trial: { trial_id: "342", source_ordinal: 342, params_digest: "342".padStart(64, "0"), parameters: { window: "9007199254740993" } } });
    expect(read).toHaveBeenCalledTimes(3);
    expect(read.mock.calls.map(call => call[1])).toEqual([100, 200, 300].map(n => ({ workspaceId: "owned-workspace", fold: null, cursor: `opaque-page-${n}`, signal: expect.any(AbortSignal) })));
  });
  it("in-page digest performs no second read", async () => {
    const read = vi.fn();
    expect(await readSelectedCinemaTrial(fixture.run_id, page(), "0", "ws", signal(), undefined, read)).toMatchObject({ state: "ready" });
    expect(read).not.toHaveBeenCalled();
  });
  it("causal native trial ids require both exact study and fold facts, never a parsed or cumulative ordinal", async () => {
    const base = page(); const trial = base.ledger.trials[1]!;
    trial.trial_id = "study-real.trial_0"; trial.source_ordinal = 201;
    trial.facts.study_id = "study-real"; trial.facts.fold_scope = { kind: "PER_FOLD_STUDY", fold_id: "fold-real", reason_code: null };
    expect(await readSelectedCinemaTrial(base.run_id, base, trial.trial_id, "ws", signal(), { studyId: "study-real", foldId: "fold-real" })).toMatchObject({ state: "ready", trial: { source_ordinal: 201 } });
    expect(await readSelectedCinemaTrial(base.run_id, base, trial.trial_id, "ws", signal(), { studyId: "other-study", foldId: "fold-real" })).toEqual({ state: "absent", reason: "UI_SELECTED_TRIAL_STUDY_SCOPE_MISMATCH" });
  });
  it("refuses changed revision/run/filter population and repeated cursor rather than mixing contexts", async () => {
    const base = page();
    for (const change of [() => { const next = page(100); next.revision += "changed"; return next; }, () => { const next = page(100); next.source_revision = "other-source"; return next; }, () => { const next = page(100); next.presentation_revision = "other-presentation"; return next; }, () => { const next = page(100); next.run_id = "other-run"; return next; }, () => { const next = page(100); next.ledger.fold_filter.fold_id = "other-fold"; return next; }]) {
      expect(await readSelectedCinemaTrial(base.run_id, base, "342", "ws", signal(), undefined, vi.fn().mockResolvedValue(change()))).toEqual({ state: "absent", reason: "UI_SELECTED_TRIAL_PAGE_SCOPE_CHANGED" });
    }
    const repeated = page(100); repeated.ledger.page.next_cursor = base.ledger.page.next_cursor;
    const read = vi.fn().mockResolvedValue(repeated);
    expect(await readSelectedCinemaTrial(base.run_id, base, "342", "ws", signal(), undefined, read)).toEqual({ state: "absent", reason: "UI_SELECTED_TRIAL_CURSOR_REPEATED" });
    expect(read).toHaveBeenCalledTimes(1);
  });
  it("missing selected row is bounded; no global table or indefinite page loop", async () => {
    const read = vi.fn().mockResolvedValueOnce(page(100)).mockResolvedValueOnce(page(200)).mockResolvedValueOnce(page(300));
    expect(await readSelectedCinemaTrial(fixture.run_id, page(), "absent", "ws", signal(), undefined, read)).toEqual({ state: "absent", reason: "UI_SELECTED_TRIAL_NOT_IN_RETAINED_LEDGER" });
    expect(read).toHaveBeenCalledTimes(3);
    const tooLarge = page(); tooLarge.ledger.source_trial_count = 401;
    expect(await readSelectedCinemaTrial(fixture.run_id, tooLarge, "342", "ws", signal(), undefined, vi.fn())).toEqual({ state: "absent", reason: "UI_SELECTED_TRIAL_READ_BOUND_EXCEEDED" });
  });
});

describe("Cinema selected-row context relevance", () => {
  it("no selection and already supplied digest ask nothing", () => {
    const read = vi.spyOn(searchApi, "currentSource");
    const { rerender } = renderHook(({ selected, enabled }) => useSelectedCinemaTrial(fixture.run_id, page(), selected, "ws", undefined, enabled), { initialProps: { selected: null as string | null, enabled: true } });
    rerender({ selected: "342", enabled: false });
    expect(read).not.toHaveBeenCalled();
  });
  it("late workspace A row and refusal cannot attach to B", async () => {
    const a = deferred<CurrentSourceSearch>(), b = deferred<CurrentSourceSearch>();
    const read = vi.spyOn(searchApi, "currentSource").mockImplementation((_id, options) => options?.workspaceId === "a" ? a.promise : b.promise);
    const base = page();
    const { result, rerender } = renderHook(({ workspace }) => useSelectedCinemaTrial(base.run_id, base, "342", workspace), { initialProps: { workspace: "a" } });
    rerender({ workspace: "b" });
    await act(async () => { a.resolve(page(300)); });
    expect(result.current).toEqual({ state: "loading" });
    await act(async () => { b.reject(new Error("refused")); });
    expect(result.current).toEqual({ state: "absent", reason: "UI_SELECTED_TRIAL_READ_REFUSED" });
    expect(read).toHaveBeenCalledTimes(2);
    expect(read.mock.calls[0]![1]!.signal!.aborted).toBe(true);
  });
  it("unmount aborts lookup without a subsequent page", async () => {
    const a = deferred<CurrentSourceSearch>(); const read = vi.spyOn(searchApi, "currentSource").mockReturnValue(a.promise);
    const base = page(); const { unmount } = renderHook(() => useSelectedCinemaTrial(base.run_id, base, "342", "ws"));
    unmount(); await act(async () => { a.resolve(page(100)); });
    expect(read).toHaveBeenCalledTimes(1); expect(read.mock.calls[0]![1]!.signal!.aborted).toBe(true);
  });
});
