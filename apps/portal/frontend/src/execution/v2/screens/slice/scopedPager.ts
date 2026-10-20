/**
 * The cursor-chain pager of a scoped list (`portal.execution.manager-scoped.v1`; BE-P14 `fleet-owner-paper-chain`: 3 pages,
 * `limit:1`). FIXTURE ONLY: the port is injected; nothing here fetches, polls or touches a route.
 *
 * Rules, each with a test in `scopedPager.test.ts`:
 * - single flight: while a read is open, `next()` and `previous()` do nothing (counted, not queued), so one press is one read;
 * - a cursor is OPAQUE: it is kept inside this closure and handed to the port unchanged; it is never parsed, compared,
 *   logged, put in the state, or shown. The state only says whether a next / previous page exists;
 * - the server's page is the page: the pager keeps ONE page (the one on screen), never a merged list and never a count;
 * - a changed query is a new chain: the old rows and cursors are dropped at once, an answer still in flight for the old query
 *   is discarded on arrival (counted in `dropped`), and the first page of the new query is read. A cursor is never replayed
 *   into another query; if one ever is, the server refuses it with 400 CURSOR_CONTEXT_MISMATCH and the chain restarts;
 * - refusals are read by status + code (`scopedRefusal.ts`), never by text: a cursor refusal (400) restarts the chain from its
 *   first page, a 409 EXECUTION_READ_ACCESS_CHANGED discards the page and reads the scope again from its first page. Either
 *   restart happens ONCE per user action: a refusal of the restart itself is shown, not retried;
 * - every other refusal clears the rows (a withheld read is not an empty list); an unreadable body or a failed transport
 *   clears them too. A page of another workspace, surface or environment than the chain's first page is unreadable.
 */
import { readManagerScoped, type ScopedRead } from "./scopedRead";
import { readScopedRefusal, type ScopedRefusal } from "./scopedRefusal";

export type PageDirection = "first" | "after" | "before";

export interface ScopedPageRequest {
  /** The caller's own key for the query (filters, sort, environment): a change of it is a new chain. */
  readonly query: string;
  readonly direction: PageDirection;
  /** Opaque; `null` exactly when `direction` is `first`. */
  readonly cursor: string | null;
}

export type ScopedPageAnswer =
  | { readonly ok: true; readonly body: unknown }
  | { readonly ok: false; readonly status: number; readonly body: unknown }
  | { readonly ok: false; readonly transport: true };

export interface ScopedPagePort {
  read(request: ScopedPageRequest): Promise<ScopedPageAnswer>;
}

export type PagerPhase = "idle" | "loading" | "ready" | "refused" | "unreadable";

export interface PagerState {
  phase: PagerPhase;
  query: string | null;
  /** The page on screen. `null` while loading the first page, and after any refusal. */
  page: ScopedRead | null;
  /** 1-based place in the chain the user walked (not a count of the data). */
  position: number;
  hasNext: boolean;
  hasPrevious: boolean;
  refusal: ScopedRefusal | null;
  /** True while a read is open. */
  busy: boolean;
  counters: { reads: number; ignored: number; dropped: number; restarts: number };
}

export interface ScopedPager {
  getState(): PagerState;
  subscribe(listener: () => void): () => void;
  /** Read the first page of `query`. The same query again re-reads its first page; a different one drops the chain. */
  open(query: string): Promise<void>;
  next(): Promise<void>;
  previous(): Promise<void>;
}

const initial = (): PagerState => ({
  phase: "idle", query: null, page: null, position: 1, hasNext: false, hasPrevious: false, refusal: null, busy: false,
  counters: { reads: 0, ignored: 0, dropped: 0, restarts: 0 },
});

export function createScopedPager(port: ScopedPagePort): ScopedPager {
  let state = initial();
  let generation = 0;
  let inFlight = false;
  let next: string | null = null;
  let previous: string | null = null;
  let anchor: { workspaceId: string; surface: string; environment: string } | null = null;
  const listeners = new Set<() => void>();

  const set = (patch: Partial<PagerState>) => {
    state = { ...state, ...patch };
    for (const listener of [...listeners]) listener();
  };
  const bump = (key: keyof PagerState["counters"]) => set({ counters: { ...state.counters, [key]: state.counters[key] + 1 } });

  const clear = (phase: PagerPhase, refusal: ScopedRefusal | null) => {
    next = null;
    previous = null;
    set({ phase, page: null, hasNext: false, hasPrevious: false, refusal, busy: false });
  };

  async function read(request: ScopedPageRequest, position: number, mayRestart: boolean): Promise<void> {
    const mine = generation;
    inFlight = true;
    set({ busy: true, ...(request.direction === "first" ? { phase: "loading" as const, page: null, hasNext: false, hasPrevious: false, refusal: null } : {}) });
    bump("reads");
    let answer: ScopedPageAnswer;
    try {
      answer = await port.read(request);
    } catch {
      answer = { ok: false, transport: true };
    }
    if (mine !== generation) {
      bump("dropped");
      return;
    }
    inFlight = false;
    if (answer.ok) {
      const result = readManagerScoped(answer.body);
      if (result === null || result.kind !== "scoped") return clear("unreadable", null);
      const page = result.read;
      if (request.direction === "first") anchor = { workspaceId: page.workspaceId, surface: page.surface, environment: page.environment };
      else if (anchor === null || page.workspaceId !== anchor.workspaceId || page.surface !== anchor.surface || page.environment !== anchor.environment) {
        return clear("unreadable", null);
      }
      // The cursors are taken from the validated body and kept here; the state only learns that they exist.
      const raw = (answer.body as { page: { next_cursor: string | null; previous_cursor: string | null } }).page;
      next = raw.next_cursor;
      previous = raw.previous_cursor;
      set({ phase: "ready", page, position, hasNext: page.page.hasNextCursor, hasPrevious: page.page.hasPreviousCursor, refusal: null, busy: false });
      return;
    }
    if ("transport" in answer) return clear("unreadable", null);
    const refusal = readScopedRefusal(answer.status, answer.body);
    if (refusal === null) return clear("unreadable", null);
    if (refusal.action !== "show_absence" && mayRestart && state.query !== null) {
      bump("restarts");
      next = null;
      previous = null;
      await read({ query: state.query, direction: "first", cursor: null }, 1, false);
      return;
    }
    clear("refused", refusal);
  }

  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    async open(query) {
      generation += 1;
      inFlight = false;
      next = null;
      previous = null;
      set({ query, position: 1 });
      await read({ query, direction: "first", cursor: null }, 1, true);
    },
    async next() {
      if (inFlight || next === null || state.query === null || state.phase !== "ready") return bump("ignored");
      await read({ query: state.query, direction: "after", cursor: next }, state.position + 1, true);
    },
    async previous() {
      if (inFlight || previous === null || state.query === null || state.phase !== "ready") return bump("ignored");
      await read({ query: state.query, direction: "before", cursor: previous }, Math.max(1, state.position - 1), true);
    },
  };
}
