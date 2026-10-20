/**
 * UXM-08 consumer completion (UXM08-DEBT-1): when the slice learns access was revoked, the screens it links to forget what they read.
 *
 * FIXTURE_LAB (jsdom). The destinations keep their reads in the state of three reading hooks, so those hooks are what is driven
 * here, with a scripted api that never reaches a network. A destination that is not mounted holds nothing (asserted by the Back
 * test: the remount starts empty and reads again).
 */
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { Link, MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import type { ExecutionApi, Result } from "../api/ports";
import { createFakeClock, flush } from "./realtime/fakes.testbase";
import { createFixtureLane, createRevocationMemory } from "./screens/slice/canonicalLane";
import { SliceScreen } from "./screens/slice";
import { useFleetRead } from "./screens/fleet/useFleetRead";
import { useAlphaResource, usePagedRead } from "./screens/alpha/useAlphaReads";
import { useRead as usePortfolioRead, valueOf } from "./screens/portfolios/useRead";
import { EVICTED_REASON, evictScopedCaches, registerScopedCache, scopedEvictionCount, useScopedCacheEviction } from "./scopedEviction";

afterEach(cleanup);

const OWN = { workspaceId: null, environment: null };
const API = {} as ExecutionApi;
const ok = <T,>(value: T): Result<T> => ({ ok: true, value }) as Result<T>;

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
}
function defer<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("the registry", () => {
  it("calls every registered evictor once with the cause, and stops calling one that unregistered", () => {
    const seen: string[] = [];
    const offA = registerScopedCache((cause) => seen.push(`a:${cause}`));
    const offB = registerScopedCache((cause) => seen.push(`b:${cause}`));
    expect(evictScopedCaches("ACCESS_REVOKED")).toBe(2);
    offA();
    expect(evictScopedCaches("SNAPSHOT_DENIED")).toBe(1);
    offB();
    expect(evictScopedCaches("SNAPSHOT_DENIED")).toBe(0);
    expect(seen).toEqual(["a:ACCESS_REVOKED", "b:ACCESS_REVOKED", "b:SNAPSHOT_DENIED"]);
  });

  it("one evictor throwing never keeps another from clearing", () => {
    const seen: string[] = [];
    const offBad = registerScopedCache(() => {
      throw new Error("boom");
    });
    const offGood = registerScopedCache(() => seen.push("good"));
    expect(() => evictScopedCaches("ACCESS_REVOKED")).not.toThrow();
    expect(seen).toEqual(["good"]);
    offBad();
    offGood();
  });

  it("counts requests, holds no data, and a hook registers only while mounted", () => {
    const before = scopedEvictionCount();
    const hits: number[] = [];
    const view = renderHook(() => useScopedCacheEviction(() => hits.push(1)));
    evictScopedCaches("ACCESS_REVOKED");
    view.unmount();
    evictScopedCaches("ACCESS_REVOKED");
    expect(hits).toEqual([1]);
    expect(scopedEvictionCount()).toBe(before + 2);
  });
});

describe("Portfolio 360 / Compare read hook (portfolios/useRead)", () => {
  it("revoke drops the value and the previous good one, and says denied", async () => {
    const view = renderHook(() => usePortfolioRead<string>(API, true, "p1", async () => ok("SCOPED-ROWS")));
    await act(async () => void (await flush(8)));
    expect(valueOf(view.result.current)).toBe("SCOPED-ROWS");
    act(() => void evictScopedCaches("ACCESS_REVOKED"));
    expect(valueOf(view.result.current)).toBeNull();
    expect(view.result.current).toMatchObject({ phase: "error", status: "denied", reason: EVICTED_REASON, last: null });
  });

  it("a late answer for a read that was in flight when access was revoked is refused", async () => {
    const late = defer<Result<string>>();
    const view = renderHook(() => usePortfolioRead<string>(API, true, "p1", () => late.promise));
    expect(view.result.current.phase).toBe("loading");
    act(() => void evictScopedCaches("SNAPSHOT_DENIED"));
    await act(async () => {
      late.resolve(ok("STALE-ROWS"));
      await flush(8);
    });
    expect(valueOf(view.result.current)).toBeNull();
    expect(view.result.current.phase).toBe("error");
  });

  it("an idle read stays idle (nothing was asked, nothing is denied), and another question reads again", async () => {
    const view = renderHook(({ enabled, key }) => usePortfolioRead<string>(API, enabled, key, async () => ok(`rows for ${key}`)), {
      initialProps: { enabled: false, key: "p1" },
    });
    act(() => void evictScopedCaches("ACCESS_REVOKED"));
    expect(view.result.current.phase).toBe("idle");
    view.rerender({ enabled: true, key: "p2" });
    await act(async () => void (await flush(8)));
    expect(valueOf(view.result.current)).toBe("rows for p2");
  });

  it("after a revoke the previous key's value does not stand in for the same key (lastGood is gone)", async () => {
    const again = defer<Result<string>>();
    let reads = 0;
    const view = renderHook(({ key }) => usePortfolioRead<string>(API, true, key, () => (reads++ === 0 ? Promise.resolve(ok("rows for p1")) : again.promise)), {
      initialProps: { key: "p1" },
    });
    await act(async () => void (await flush(8)));
    act(() => void evictScopedCaches("ACCESS_REVOKED"));
    // The same key asked again (a re-visit): the read is `loading` and nothing from the first read stands in for it.
    view.rerender({ key: "p2" });
    await act(async () => void (await flush(8)));
    view.rerender({ key: "p1" });
    expect(view.result.current.phase).toBe("loading");
    expect(valueOf(view.result.current)).toBeNull();
    await act(async () => {
      again.resolve(ok("rows for p1, read again"));
      await flush(8);
    });
    expect(valueOf(view.result.current)).toBe("rows for p1, read again");
  });
});

describe("Alpha Fleet read hook (fleet/useFleetRead)", () => {
  const row = (id: string) => ({ alphaId: id });
  const page = (rows: string[], next: string | null) =>
    ok({ page: { rows: rows.map(row), hasMore: next !== null, nextCursor: next }, summary: { total: rows.length } }) as never;

  it("revoke drops rows, envelope and the kept summary, and the state is denied", async () => {
    const api = { getAlphaFleet: async () => page(["a1", "a2"], null) } as unknown as ExecutionApi;
    const view = renderHook(() => useFleetRead(api, true, "q", () => ({}) as never));
    await act(async () => void (await flush(8)));
    expect(view.result.current.items).toHaveLength(2);
    expect(view.result.current.summary).not.toBeNull();
    act(() => void evictScopedCaches("ACCESS_REVOKED"));
    expect(view.result.current.items).toHaveLength(0);
    expect(view.result.current.envelope).toBeNull();
    expect(view.result.current.summary).toBeNull();
    expect(view.result.current.state).toMatchObject({ phase: "error", status: "denied", reason: EVICTED_REASON });
  });

  it("a Load more that was in flight when access was revoked adds nothing", async () => {
    const more = defer<Result<unknown>>();
    let calls = 0;
    const api = {
      getAlphaFleet: () => (calls++ === 0 ? Promise.resolve(page(["a1"], "next")) : more.promise),
    } as unknown as ExecutionApi;
    const view = renderHook(() => useFleetRead(api, true, "q", () => ({}) as never));
    await act(async () => void (await flush(8)));
    act(() => view.result.current.loadMore());
    expect(view.result.current.loadingMore).toBe(true);
    act(() => void evictScopedCaches("ACCESS_REVOKED"));
    await act(async () => {
      more.resolve(page(["STALE"], null));
      await flush(8);
    });
    expect(view.result.current.items).toHaveLength(0);
    expect(view.result.current.loadingMore).toBe(false);
  });

  it("a first page answered late is refused", async () => {
    const first = defer<Result<unknown>>();
    const api = { getAlphaFleet: () => first.promise } as unknown as ExecutionApi;
    const view = renderHook(() => useFleetRead(api, true, "q", () => ({}) as never));
    act(() => void evictScopedCaches("SNAPSHOT_DENIED"));
    await act(async () => {
      first.resolve(page(["STALE"], null));
      await flush(8);
    });
    expect(view.result.current.items).toHaveLength(0);
    expect(view.result.current.state.phase).toBe("error");
  });
});

describe("Alpha 360 read hooks (alpha/useAlphaReads)", () => {
  it("revoke drops the resource and refuses a late answer", async () => {
    const late = defer<Result<unknown>>();
    let first = true;
    const api = {
      getAlpha360Resource: () => {
        if (first) {
          first = false;
          return Promise.resolve(ok({ objects: { alpha: null } }));
        }
        return late.promise;
      },
    } as unknown as ExecutionApi;
    const view = renderHook(({ id }) => useAlphaResource(api, id), { initialProps: { id: "a1" } });
    await act(async () => void (await flush(8)));
    expect(view.result.current.phase).toBe("ready");
    act(() => void evictScopedCaches("ACCESS_REVOKED"));
    expect(view.result.current).toMatchObject({ phase: "error", status: "denied", reason: EVICTED_REASON });
    // another subject is another question: it reads, and the late answer of the first never lands
    view.rerender({ id: "a2" });
    await act(async () => {
      late.resolve(ok({ objects: { alpha: null } }));
      await flush(8);
    });
    expect(view.result.current.phase).toBe("ready");
  });

  it("a paged read drops its later pages, and a page in flight at the revoke is refused", async () => {
    const second = defer<Result<{ rows: string[]; next: string | null }>>();
    const load = (_api: ExecutionApi, after: string | null) =>
      after === null ? Promise.resolve(ok({ rows: ["p1"], next: "c1" })) : second.promise;
    const view = renderHook(() => usePagedRead(API, true, "k", load, (p) => p.next));
    await act(async () => void (await flush(8)));
    expect(view.result.current.read.phase).toBe("ready");
    act(() => view.result.current.loadMore());
    expect(view.result.current.loadingMore).toBe(true);
    act(() => void evictScopedCaches("ACCESS_REVOKED"));
    await act(async () => {
      second.resolve(ok({ rows: ["STALE"], next: null }));
      await flush(8);
    });
    expect(view.result.current.read).toMatchObject({ phase: "error", status: "denied" });
    expect(view.result.current.loadingMore).toBe(false);
    expect(view.result.current.moreError).toBeNull();
  });
});

/** A destination: a real portfolio read hook behind a route, so it unmounts and remounts like the real screen. */
function Destination({ api, label }: { api: { reads: number; answer: () => Promise<Result<string>> }; label: string }) {
  const state = usePortfolioRead<string>(API, true, label, () => {
    api.reads += 1;
    return api.answer();
  });
  const value = valueOf(state);
  return (
    <section aria-label="destination">
      <p data-testid="dest-phase">{state.phase}</p>
      <p data-testid="dest-rows">{value ?? "no rows"}</p>
      <Link to="/execution/slice">Back to the slice</Link>
    </section>
  );
}

function Back() {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(-1)}>
      history back
    </button>
  );
}

describe("the slice calls the hook", () => {
  async function press(name: RegExp | string) {
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name }));
      await flush(12);
    });
  }

  it("access_revoked empties a destination that is mounted beside the slice", async () => {
    const api = { reads: 0, answer: async () => ok("PORTFOLIO-ROWS") };
    render(
      <MemoryRouter>
        <SliceScreen context={OWN} clock={createFakeClock()} />
        <Destination api={api} label="p1" />
      </MemoryRouter>,
    );
    await act(async () => void (await flush(12)));
    expect(screen.getByTestId("dest-rows").textContent).toBe("PORTFOLIO-ROWS");
    await press("Access revoked");
    expect(screen.getByTestId("dest-rows").textContent).toBe("no rows");
    expect(screen.getByTestId("dest-phase").textContent).toBe("error");
    expect(document.body.textContent).not.toContain("workspace_TEST_ONLY");
  });

  it("a snapshot read answered DENIED does the same, with no frame and no data on the slice yet", async () => {
    const api = { reads: 0, answer: async () => ok("PORTFOLIO-ROWS") };
    const lane = createFixtureLane(OWN);
    lane.setNext("denied");
    render(
      <MemoryRouter>
        <SliceScreen context={OWN} clock={createFakeClock()} lane={lane} />
        <Destination api={api} label="p1" />
      </MemoryRouter>,
    );
    await act(async () => void (await flush(12)));
    expect(screen.getByTestId("stream-chip").textContent).toContain("Access denied");
    expect(screen.getByTestId("dest-rows").textContent).toBe("no rows");
  });

  it("other frames (revalidate, resync, unavailable) evict nothing", async () => {
    const api = { reads: 0, answer: async () => ok("PORTFOLIO-ROWS") };
    render(
      <MemoryRouter>
        <SliceScreen context={OWN} clock={createFakeClock()} />
        <Destination api={api} label="p1" />
      </MemoryRouter>,
    );
    await act(async () => void (await flush(12)));
    const before = scopedEvictionCount();
    for (const name of ["Revalidate notice", "Heartbeat", "Resync required", "Source unavailable"]) await press(name);
    expect(scopedEvictionCount()).toBe(before);
    expect(screen.getByTestId("dest-rows").textContent).toBe("PORTFOLIO-ROWS");
  });

  it("leaving the slice to open a destination evicts nothing (unmount is not a revocation)", async () => {
    const api = { reads: 0, answer: async () => ok("PORTFOLIO-ROWS") };
    render(
      <MemoryRouter initialEntries={["/execution/slice"]}>
        <Routes>
          <Route path="/execution/slice" element={<><SliceScreen context={OWN} clock={createFakeClock()} /><Link to="/dest">go</Link></>} />
          <Route path="/dest" element={<Destination api={api} label="p1" />} />
        </Routes>
      </MemoryRouter>,
    );
    await act(async () => void (await flush(12)));
    const before = scopedEvictionCount();
    await act(async () => {
      fireEvent.click(screen.getByRole("link", { name: "go" }));
      await flush(12);
    });
    expect(screen.getByTestId("dest-rows").textContent).toBe("PORTFOLIO-ROWS");
    expect(scopedEvictionCount()).toBe(before);
  });

  it("Back: after a revoke no scoped data re-appears from any cache; the destination reads again and is told no", async () => {
    const revocations = createRevocationMemory();
    let revoked = false;
    const api = {
      reads: 0,
      answer: async (): Promise<Result<string>> => (revoked ? { ok: false, status: "denied", reason: "WORKSPACE_ACCESS_DENIED" } : ok("PORTFOLIO-ROWS")),
    };
    const shell = (
      <MemoryRouter initialEntries={["/dest", "/execution/slice"]} initialIndex={1}>
        <Back />
        <Routes>
          <Route path="/execution/slice" element={<SliceScreen context={OWN} clock={createFakeClock()} revocations={revocations} />} />
          <Route path="/dest" element={<Destination api={api} label="p1" />} />
        </Routes>
      </MemoryRouter>
    );
    render(shell);
    await act(async () => void (await flush(12)));
    // The destination was visited and read before.
    await press("history back");
    expect(screen.getByTestId("dest-rows").textContent).toBe("PORTFOLIO-ROWS");
    expect(api.reads).toBe(1);
    await act(async () => {
      fireEvent.click(screen.getByRole("link", { name: "Back to the slice" }));
      await flush(12);
    });
    // Revoke on the slice, then Back to the destination.
    revoked = true;
    await press("Access revoked");
    expect(document.body.textContent).not.toContain("workspace_TEST_ONLY");
    await press("history back");
    // First paint of the remounted destination: nothing from the earlier read.
    expect(screen.getByTestId("dest-rows").textContent).not.toBe("PORTFOLIO-ROWS");
    await act(async () => void (await flush(12)));
    expect(screen.getByTestId("dest-rows").textContent).toBe("no rows");
    expect(screen.getByTestId("dest-phase").textContent).toBe("error");
    expect(api.reads).toBe(2);
  });

  it("Forward to the slice after a revoke: the fixture server remembers, so the read is DENIED and no rows come back", async () => {
    const revocations = createRevocationMemory();
    const first = render(
      <MemoryRouter>
        <SliceScreen context={OWN} clock={createFakeClock()} revocations={revocations} />
      </MemoryRouter>,
    );
    await act(async () => void (await flush(12)));
    await press("Access revoked");
    first.unmount();
    render(
      <MemoryRouter>
        <SliceScreen context={OWN} clock={createFakeClock()} revocations={revocations} />
      </MemoryRouter>,
    );
    await act(async () => void (await flush(12)));
    expect(screen.getByTestId("stream-chip").textContent).toContain("Access denied");
    expect(document.body.textContent).not.toContain("workspace_TEST_ONLY");
    expect(document.body.textContent).not.toContain("100.1234567890123456789");
  });

  it("without a memory a lane forgets per mount (unit tests and the Fixtures page keep their old behaviour)", async () => {
    const first = render(
      <MemoryRouter>
        <SliceScreen context={OWN} clock={createFakeClock()} />
      </MemoryRouter>,
    );
    await act(async () => void (await flush(12)));
    await press("Access revoked");
    first.unmount();
    render(
      <MemoryRouter>
        <SliceScreen context={OWN} clock={createFakeClock()} />
      </MemoryRouter>,
    );
    await act(async () => void (await flush(12)));
    expect(screen.getByTestId("stream-chip").textContent).toContain("Live (fixture)");
  });
});
