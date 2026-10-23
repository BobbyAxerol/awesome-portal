/**
 * The Accounts list's per-row figures are cached per identity context (ELP2-10 closeout §2): the same binding id under another
 * `api`, another account, another workspace/environment/authority scope, a late answer for a scope that has gone, a revoke and an
 * unmount must never show or keep a figure read under a different context. `listRowFacts` is replaced by a tag reader so each
 * test can tell which read a cached row came from; its own arithmetic is covered in model.test.ts.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ExecutionApi } from "../../../api/ports";

vi.mock("./model", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./model")>()),
  listRowFacts: (profile: unknown) => ({ physical: undefined, currency: (profile as { tag: string } | null)?.tag ?? null, virtual: undefined, headroom: undefined, sleeves: null }),
}));

import { factKey, useRowFacts, type RowFactsState } from "./reads";

const SLOW = { timeout: 5000 };

interface Deferred { resolve(): void }

/** An api whose account read answers `tag` (immediately, or when `hold` is released) and counts its reads. */
function fakeApi(tag: string, opts: { hold?: Deferred[] } = {}) {
  const reads: string[] = [];
  const api = {
    getBindingExposure: async () => ({ ok: false as const, reason: "NOT_PUBLISHED" }),
    getAccount360Resource: (accountId: string) => {
      reads.push(accountId);
      const answer = { ok: true as const, value: { tag } };
      if (opts.hold === undefined) return Promise.resolve(answer);
      return new Promise((resolve) => opts.hold!.push({ resolve: () => resolve(answer) }));
    },
  } as unknown as ExecutionApi;
  return { api, reads };
}

const ROW = { bindingId: "bnd_1", accountId: "acc_1" };
const currencyOf = (facts: ReadonlyMap<string, RowFactsState>, row = ROW) => {
  const state = facts.get(factKey(row));
  return state?.phase === "ready" ? state.facts.currency : undefined;
};

afterEach(() => vi.restoreAllMocks());

describe("Accounts row figures: scoped cache", () => {
  it("caches a ready row under the same context and does not read it again", async () => {
    const a = fakeApi("A");
    const { result, rerender } = renderHook(({ api }) => useRowFacts(api, [ROW], "ws|live"), { initialProps: { api: a.api } });
    await waitFor(() => expect(currencyOf(result.current)).toBe("A"), SLOW);
    rerender({ api: a.api });
    expect(a.reads).toEqual(["acc_1"]);
  });

  it("the same binding id under a new api starts from nothing and reads again", async () => {
    const a = fakeApi("A");
    const b = fakeApi("B");
    const { result, rerender } = renderHook(({ api }) => useRowFacts(api, [ROW], "ws|live"), { initialProps: { api: a.api } });
    await waitFor(() => expect(currencyOf(result.current)).toBe("A"), SLOW);
    rerender({ api: b.api });
    expect(currencyOf(result.current)).toBeUndefined();
    await waitFor(() => expect(currencyOf(result.current)).toBe("B"), SLOW);
    expect(b.reads).toEqual(["acc_1"]);
  });

  it("the same binding id backing a different account is a new read, not the cached figure", async () => {
    const a = fakeApi("A");
    const { result, rerender } = renderHook(({ rows }) => useRowFacts(a.api, rows, "ws|live"), { initialProps: { rows: [ROW] } });
    await waitFor(() => expect(currencyOf(result.current)).toBe("A"), SLOW);
    const moved = { bindingId: "bnd_1", accountId: "acc_2" };
    rerender({ rows: [moved] });
    expect(currencyOf(result.current, ROW)).toBe("A");
    expect(result.current.get(factKey(moved))).toBeUndefined();
    await waitFor(() => expect(currencyOf(result.current, moved)).toBe("A"), SLOW);
    expect(a.reads).toEqual(["acc_1", "acc_2"]);
  });

  it("a scope change (workspace, environment or a revoked authority) drops every cached row and forces the reads again", async () => {
    const a = fakeApi("A");
    const { result, rerender } = renderHook(({ scope }) => useRowFacts(a.api, [ROW], scope), { initialProps: { scope: "ws1|live|read" } });
    await waitFor(() => expect(currencyOf(result.current)).toBe("A"), SLOW);
    rerender({ scope: "ws1|live|" }); // the capability was revoked
    expect(result.current.size).toBe(0);
    await waitFor(() => expect(currencyOf(result.current)).toBe("A"), SLOW);
    expect(a.reads).toEqual(["acc_1", "acc_1"]);
    rerender({ scope: "ws2|live|" }); // another workspace
    expect(result.current.size).toBe(0);
    await waitFor(() => expect(a.reads).toHaveLength(3), SLOW);
  });

  it("a late answer from the old context is dropped and never replaces the new context's row", async () => {
    const held: Deferred[] = [];
    const old = fakeApi("OLD", { hold: held });
    const fresh = fakeApi("NEW");
    const { result, rerender } = renderHook(({ api }) => useRowFacts(api, [ROW], "ws|live"), { initialProps: { api: old.api } });
    await waitFor(() => expect(held).toHaveLength(1), SLOW);
    rerender({ api: fresh.api });
    await waitFor(() => expect(currencyOf(result.current)).toBe("NEW"), SLOW);
    await act(async () => {
      held[0]!.resolve();
      await Promise.resolve();
    });
    expect(currencyOf(result.current)).toBe("NEW");
  });

  it("an answer that lands after unmount is dropped without touching state", async () => {
    const held: Deferred[] = [];
    const a = fakeApi("A", { hold: held });
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { unmount } = renderHook(() => useRowFacts(a.api, [ROW], "ws|live"));
    await waitFor(() => expect(held).toHaveLength(1), SLOW);
    unmount();
    await act(async () => {
      held[0]!.resolve();
      await Promise.resolve();
    });
    expect(error).not.toHaveBeenCalled();
  });
});
