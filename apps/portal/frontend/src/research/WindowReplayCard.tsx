/**
 * Screen 08 · the complete retained window and the engine's own journal (§44 / WEX).
 *
 * Reads two generated operations, nothing else:
 *   - `researchWindowObservationsGetV1`        every retained bar of a window, keyset-paged (≤ 200 rows), never a display sample;
 *   - `researchNativeExecutionRecordsGetV1`    the engine journal (fills, trades, commands, order reports, lifecycle, orders).
 *
 * What is drawn is what the source published, at the price and bar it published: a fill sits beside its candle body at its fill
 * price; the active stop / take-profit are step lines that break where the engine published none; a parent/child/OCO relation
 * is shown only from real ids, and a value the source did not publish says so (`not published`, never 0 and never a guessed
 * price). A command is not a fill, a trigger is not an execution price, and all of it is engine simulation audit, not a broker
 * lifecycle. A window the protocol never executed, a run still in progress and a seal that never kept its companion each say so
 * with the server's own reason code. Pages are bound to the exact selector (window, fold, kind, limit, revision): a change of
 * any of them resets the page, and the cursor is never edited.
 */

import { Suspense, lazy, useEffect, useMemo, useState } from "react";

import { PortalApiError } from "../lib/api";
import { reasonCodeSentence } from "./researchRefusal";
import { authorityWords, windowWords } from "./windowAnalyticsView";
import { buildTracks } from "./executionTracks";
import { OcoTree } from "./OcoTree";
import {
  RECORD_KINDS,
  WINDOW_PAGE_LIMIT,
  absenceOf,
  executionRows,
  observationRows,
  type ObservationRow,
  windowExecutionApi,
  type ExecutionRow,
  type RecordKind,
  type WindowExecutionPage,
  type WindowName,
  type WindowScope,
} from "./windowExecutionClient";

const WindowFillCandles = lazy(() => import("./WindowFillCandles").then((m) => ({ default: m.WindowFillCandles })));

const TABS: readonly { window: WindowName; label: string }[] = [
  { window: "IS", label: "IS" },
  { window: "OOS", label: "OOS" },
  { window: "HOLDOUT", label: "Holdout" },
];

/**
 * The protective level to draw at a bar. The engine publishes `"0"` for "no level" while the account is flat (a stop at price 0 is
 * not a stop), so a level is drawn only while a position is open and the served level is a positive price; otherwise the line breaks.
 */
export function activeLevel(level: string | null, position: string | null): string | null {
  if (level === null || position === null) return null;
  const price = Number(level);
  const open = Number(position);
  return Number.isFinite(price) && price > 0 && Number.isFinite(open) && open !== 0 ? level : null;
}

type Observation = ObservationRow["payload"];

/**
 * The level to draw at one bar. A server that serves `active_level_availability` (BR-S02-19) has already decided: its `active_stop` /
 * `active_take_profit` are the exact decimal when AVAILABLE and null otherwise, and `source_value` is raw provenance that is NEVER drawn.
 * Only an older server that serves no such block falls back to the position-bound rule above.
 */
export function servedLevel(payload: Observation, which: "active_stop" | "active_take_profit"): string | null {
  if (payload.active_level_availability !== undefined) return payload[which];
  return activeLevel(payload[which], payload.accepted_position);
}

/** What the page says about one protective level: bars per typed state/reason, in the server's words. */
export function levelDisclosure(rows: readonly ObservationRow[], which: "active_stop" | "active_take_profit"): { drawn: number; absent: { key: string; state: string; reason: string | null; count: number }[]; typed: boolean } {
  const absent = new Map<string, { key: string; state: string; reason: string | null; count: number }>();
  let drawn = 0;
  let typed = false;
  for (const row of rows) {
    const served = row.payload.active_level_availability?.[which];
    if (served === undefined) continue;
    typed = true;
    if (served.state === "AVAILABLE") {
      drawn += 1;
      continue;
    }
    const key = `${served.state}|${served.reason_code ?? ""}`;
    const entry = absent.get(key) ?? { key, state: served.state, reason: served.reason_code, count: 0 };
    entry.count += 1;
    absent.set(key, entry);
  }
  return { drawn, absent: [...absent.values()].sort((a, b) => b.count - a.count), typed };
}

const iso = (ms: number | null | undefined): string => (ms === null || ms === undefined ? "not published" : `${new Date(ms).toISOString().slice(0, 16).replace("T", " ")}Z`);

type PageState = { state: "loading" } | { state: "ready"; page: WindowExecutionPage } | { state: "unavailable" } | { state: "failed"; status: number | null; code: string | null };

/** One bounded page, asked once per key and aborted when the key changes. `null` key = ask nothing. */
function useWindowPage(key: string | null, load: ((signal: AbortSignal) => Promise<WindowExecutionPage>) | null): PageState | null {
  const [answer, setAnswer] = useState<{ key: string; value: PageState } | null>(null);
  useEffect(() => {
    if (key === null || load === null) return undefined;
    const controller = new AbortController();
    load(controller.signal)
      .then((page) => {
        if (!controller.signal.aborted) setAnswer({ key, value: { state: "ready", page } });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const missing = error instanceof PortalApiError && [404, 405, 501].includes(error.status) && (error.code === null || !error.code.startsWith("RESEARCH_"));
        setAnswer({ key, value: missing ? { state: "unavailable" } : { state: "failed", status: error instanceof PortalApiError ? error.status : null, code: error instanceof PortalApiError ? error.code : null } });
      });
    return () => controller.abort();
    // the key carries every input
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  if (key === null) return null;
  return answer !== null && answer.key === key ? answer.value : { state: "loading" };
}

/** The most pages one journal relation is read for the chart: 5 × 200 rows. A relation longer than that says so; it is never silently cut. */
const MAX_JOURNAL_PAGES = 5;

interface AllRecords {
  state: "loading" | "ready" | "unavailable" | "failed";
  rows: readonly ExecutionRow[];
  /** True when the bounded read stopped with more rows on the server. */
  truncated: boolean;
  total: number | null;
  /** A typed absence of the whole relation (`NOT_PUBLISHED` / `NOT_APPLICABLE`), or null. */
  absent: boolean;
}

/**
 * One journal relation, every page up to the bound, for the chart overlay. It is independent of the journal table's own first page;
 * the cursor of each page is the one the server minted for this exact selector and relation. Aborted when the selector changes.
 */
function useAllRecords(key: string | null, load: ((cursor: string | null, signal: AbortSignal) => Promise<WindowExecutionPage>) | null): AllRecords | null {
  const [answer, setAnswer] = useState<{ key: string; value: AllRecords } | null>(null);
  useEffect(() => {
    if (key === null || load === null) return undefined;
    const controller = new AbortController();
    (async () => {
      const rows: ExecutionRow[] = [];
      let cursor: string | null = null;
      let total: number | null = null;
      for (let pages = 0; pages < MAX_JOURNAL_PAGES; pages += 1) {
        const page = await load(cursor, controller.signal);
        if (controller.signal.aborted) return;
        if (absenceOf(page) !== null) {
          setAnswer({ key, value: { state: "ready", rows: [], truncated: false, total: null, absent: true } });
          return;
        }
        rows.push(...executionRows(page));
        total = page.counts.matching ?? total;
        cursor = page.next_cursor;
        if (cursor === null) break;
      }
      setAnswer({ key, value: { state: "ready", rows, truncated: cursor !== null, total, absent: false } });
    })().catch((error: unknown) => {
      if (controller.signal.aborted) return;
      const missing = error instanceof PortalApiError && [404, 405, 501].includes(error.status) && (error.code === null || !error.code.startsWith("RESEARCH_"));
      setAnswer({ key, value: { state: missing ? "unavailable" : "failed", rows: [], truncated: false, total: null, absent: false } });
    });
    return () => controller.abort();
    // the key carries every input
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  if (key === null) return null;
  return answer !== null && answer.key === key ? answer.value : { state: "loading", rows: [], truncated: false, total: null, absent: false };
}

/** The value a record field carries, or a typed absence: the server guarantees null if and only if the field is in `missing_fields`. */
function Field({ value, record, name }: { value: string | number | null | undefined; record: ExecutionRow["payload"]; name: string }) {
  if (value === null || value === undefined) {
    const missing = (record as { missing_fields?: Record<string, string> }).missing_fields?.[name];
    return <span className="mono italic" style={{ color: "var(--ink-faint)" }} data-field-absent={name} title={missing ?? "not published by the source"}>not published</span>;
  }
  return <span className="mono" data-exact={String(value)} style={{ fontVariantNumeric: "tabular-nums" }}>{String(value)}</span>;
}

function Absent({ state, reason }: { state: "NOT_PUBLISHED" | "NOT_APPLICABLE"; reason: string | null }) {
  const sentence = reason ? reasonCodeSentence(reason) : null;
  return (
    <p className="mono text-[11px] italic" style={{ color: "var(--ink-soft)" }} data-window-absent={state} data-reason-code={reason ?? undefined} title={sentence ?? undefined}>
      {state === "NOT_APPLICABLE" ? "Not applicable" : "Not published"}
      {reason ? ` · ${reason.toLowerCase().replace(/_/g, " ")}` : ""}
    </p>
  );
}

function failureWords(status: number | null): string {
  if (status === 401) return "Your session ended. Sign in again to read this window.";
  if (status === 403 || status === 404) return "You do not have access to this run in this workspace, or it does not exist.";
  if (status === 400) return "This page selection is no longer valid. Pick the window again.";
  if (status === 503) return "The window read is busy. Try again in a moment.";
  return "This window could not be read.";
}

export function WindowReplayCard({ runId, workspaceId, defaultOpen = false }: { runId: string; workspaceId?: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [window, setWindow] = useState<WindowName>("OOS");
  const [foldDraft, setFoldDraft] = useState("");
  const [fold, setFold] = useState<string | null>(null);
  const scope: WindowScope = useMemo(() => ({ window, foldId: window === "IS" ? fold : null }), [window, fold]);
  const scopeKey = `${runId}|${workspaceId ?? ""}|${scope.window}|${scope.foldId ?? ""}`;

  /* The page stack belongs to the selector it was issued for. It is keyed, not reset by an effect: the very first render after a new
     window, fold or run must already ask without the old cursor (a cursor is bound to its selector and a mismatch is a 400). */
  const [paging, setPaging] = useState<{ key: string; stack: (string | null)[] }>({ key: scopeKey, stack: [null] });
  const cursors = paging.key === scopeKey ? paging.stack : [null];
  const setCursors = (next: (current: (string | null)[]) => (string | null)[]) => setPaging({ key: scopeKey, stack: next(cursors) });
  const [kind, setKind] = useState<RecordKind>("FILL");
  const cursor = cursors[cursors.length - 1] ?? null;

  const observations = useWindowPage(open ? `${scopeKey}|obs|${cursor ?? ""}` : null, (signal) =>
    windowExecutionApi.observations(runId, scope, { workspaceId, limit: WINDOW_PAGE_LIMIT, cursor, signal }),
  );
  const fills = useWindowPage(open ? `${scopeKey}|fills` : null, (signal) => windowExecutionApi.records(runId, scope, { workspaceId, kind: "FILL", limit: WINDOW_PAGE_LIMIT, signal }));
  const journal = useWindowPage(open && kind !== "FILL" ? `${scopeKey}|journal|${kind}` : null, (signal) => windowExecutionApi.records(runId, scope, { workspaceId, kind, limit: WINDOW_PAGE_LIMIT, signal }));
  const journalShown = kind === "FILL" ? fills : journal;
  const useRelation = (record: RecordKind) =>
    useAllRecords(open ? `${scopeKey}|all|${record}` : null, (at, signal) => windowExecutionApi.records(runId, scope, { workspaceId, kind: record, limit: WINDOW_PAGE_LIMIT, cursor: at, signal }));
  const allFills = useRelation("FILL");
  const allOrders = useRelation("ORDER");
  const allCommands = useRelation("COMMAND");
  const allLifecycle = useRelation("LIFECYCLE");

  const page = observations?.state === "ready" ? observations.page : null;
  const bars = useMemo(
    () =>
      page === null
        ? []
        : observationRows(page).flatMap((row) =>
            row.payload.candle === null
              ? []
              : [{ at_utc_ms: row.at_utc_ms, open: row.payload.candle.open, high: row.payload.candle.high, low: row.payload.candle.low, close: row.payload.candle.close, equity: row.payload.equity ?? null, position: row.payload.accepted_position ?? null, active_stop: servedLevel(row.payload, "active_stop"), active_take_profit: servedLevel(row.payload, "active_take_profit") }],
          ),
    [page],
  );
  const fillRows = allFills?.state === "ready" ? allFills.rows : fills?.state === "ready" ? executionRows(fills.page) : [];
  const spanMs = bars.length > 1 ? Math.max(1, bars[1]!.at_utc_ms - bars[0]!.at_utc_ms) : 3_600_000;
  const first = bars[0]?.at_utc_ms ?? null;
  const last = bars.length > 0 ? bars[bars.length - 1]!.at_utc_ms + spanMs : null;
  const marks = useMemo(
    () =>
      fillRows.flatMap((row) => {
        const p = row.payload;
        const price = p.fill_price ?? p.price;
        const at = p.filled_at_utc_ms ?? row.at_utc_ms;
        if (price === null || price === undefined || at === null || first === null || last === null || at < first || at >= last) return [];
        return [{ at_utc_ms: at, price, qty: p.fill_qty ?? p.qty ?? null, side: p.side ?? null, exit_reason: p.exit_reason ?? null, order_id: p.order_id ?? null }];
      }),
    [fillRows, first, last],
  );
  const tracks = useMemo(
    () => (allOrders?.state === "ready" ? buildTracks({ orders: allOrders.rows, commands: allCommands?.rows ?? [], lifecycle: allLifecycle?.rows ?? [], fills: allFills?.rows ?? [] }) : []),
    [allOrders, allCommands, allLifecycle, allFills],
  );
  const truncatedNote = [allOrders, allCommands, allLifecycle, allFills].some((r) => r?.truncated) ? `journal read stopped at ${MAX_JOURNAL_PAGES * WINDOW_PAGE_LIMIT} rows per relation; later rows are not drawn` : null;
  const absence = page === null ? null : absenceOf(page);
  const descriptor = page?.descriptor ?? null;
  const authority = descriptor === null ? null : authorityWords(descriptor.authority);

  return (
    <details
      className="no-print rounded-[8px] border px-4 py-3"
      style={{ borderColor: "var(--line)", background: "var(--paper-raised)", boxShadow: "var(--shadow-e1)" }}
      open={open}
      onToggle={(event) => setOpen((event.currentTarget as HTMLDetailsElement).open)}
      data-window-replay
      data-window-replay-state={observations?.state ?? "closed"}
    >
      <summary className="cursor-pointer text-[13px] font-semibold" style={{ color: "var(--ink)" }}>
        Complete window · retained bars and engine journal
        <span className="mono ml-2 text-[10px] font-normal" style={{ color: "var(--ink-faint)" }}>engine audit, not a broker record</span>
      </summary>
      <div className="mt-3 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="window" className="inline-flex overflow-hidden rounded-[6px] border" style={{ borderColor: "var(--line)" }} data-window-switch>
            {TABS.map((tab) => (
              <button
                key={tab.window}
                type="button"
                aria-pressed={window === tab.window}
                data-window={tab.window}
                className="mono px-3 py-1 text-[10px]"
                style={{ background: window === tab.window ? "var(--accent-soft)" : "var(--paper-raised)", color: window === tab.window ? "var(--accent)" : "var(--ink-soft)", borderRight: "1px solid var(--line)" }}
                onClick={() => setWindow(tab.window)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          {window === "IS" ? (
            <label className="mono text-[10px]" style={{ color: "var(--ink-faint)" }} data-window-fold-field>
              fold id{" "}
              <input
                aria-label="fold id"
                value={foldDraft}
                placeholder="blank unless Walk-forward"
                className="mono"
                style={{ width: 150, border: "1px solid var(--line)", borderRadius: 4, padding: "1px 6px" }}
                onChange={(event) => setFoldDraft(event.target.value)}
                onBlur={() => setFold(foldDraft.trim() === "" ? null : foldDraft.trim())}
                onKeyDown={(event) => {
                  if (event.key === "Enter") setFold(foldDraft.trim() === "" ? null : foldDraft.trim());
                }}
              />
            </label>
          ) : null}
        </div>

        {observations === null ? null : observations.state === "loading" ? (
          <p className="mono text-[11px] italic" style={{ color: "var(--ink-faint)" }} data-window-loading>reading the retained window…</p>
        ) : observations.state === "unavailable" ? (
          <p className="mono text-[11px] italic" style={{ color: "var(--ink-soft)" }} data-window-unavailable>This server does not publish complete windows yet.</p>
        ) : observations.state === "failed" ? (
          <p className="text-[11px]" role="status" style={{ color: "var(--ink-soft)" }} data-window-failed={observations.code ?? observations.status ?? "error"}>{failureWords(observations.status)}</p>
        ) : absence !== null ? (
          <Absent state={absence.state} reason={absence.reasonCode} />
        ) : (
          <>
            {descriptor !== null && authority !== null ? (
              <p className="mono text-[10px]" style={{ color: "var(--ink-soft)" }} data-window-descriptor data-window-authority={descriptor.authority} title={page?.revision ?? undefined}>
                {windowWords(descriptor.window, descriptor.fold_id)} · {iso(descriptor.start_utc_ms)} to {iso(descriptor.end_exclusive_utc_ms)} (end exclusive) · {descriptor.observation_count === null ? "observations not published" : `${descriptor.observation_count.toLocaleString("en-US")} retained observations`} · {authority.words}
                {page !== null ? ` · ${bars.length.toLocaleString("en-US")} of ${(page.counts.matching ?? 0).toLocaleString("en-US")} on this page` : ""}
              </p>
            ) : null}
            {authority?.caution ? <p className="text-[11px]" style={{ color: "var(--ink-soft)" }} data-window-caution>{authority.caution}</p> : null}
            {bars.length > 0 ? (
              <Suspense fallback={<div className="mono text-[10px] italic" style={{ height: 320, color: "var(--ink-faint)" }} data-chart-loading>drawing…</div>}>
                <WindowFillCandles bars={bars} fills={marks} tracks={tracks} fillsLoaded={fillRows.length} fillTotal={allFills?.state === "ready" ? allFills.total : fills?.state === "ready" ? (fills.page.counts.matching ?? null) : null} journalNote={truncatedNote} />
              </Suspense>
            ) : (
              <p className="mono text-[11px] italic" style={{ color: "var(--ink-faint)" }} data-window-no-bars>no candle was published for this page</p>
            )}
            {tracks.length > 0 ? <OcoTree tracks={tracks} /> : null}
            {page !== null && bars.length > 0 ? <LevelDisclosure rows={observationRows(page)} /> : null}
            <div className="flex flex-wrap items-center gap-2" data-window-paging>
              <button type="button" className="btn-ghost mono text-[10px]" disabled={cursors.length <= 1} title={cursors.length <= 1 ? "This is the first page of the window." : "The previous page of this window."} data-action="earlier" onClick={() => setCursors((current) => (current.length > 1 ? current.slice(0, -1) : current))}>‹ earlier</button>
              <button type="button" className="btn-ghost mono text-[10px]" disabled={page?.next_cursor === null || page?.next_cursor === undefined} title={page?.next_cursor ? "The next page of this window." : "This is the last page of the window."} data-action="later" onClick={() => page?.next_cursor && setCursors((current) => [...current, page.next_cursor])}>later ›</button>
              <span className="mono text-[10px]" style={{ color: "var(--ink-faint)" }}>page {cursors.length}</span>
            </div>
          </>
        )}

        {open && observations?.state === "ready" && absence === null ? (
          <section data-window-journal aria-label="engine journal">
            <div className="mb-2 flex flex-wrap items-center gap-1.5" role="group" aria-label="journal kind">
              {RECORD_KINDS.map((entry) => (
                <button key={entry} type="button" aria-pressed={kind === entry} data-record-kind={entry} className="mono rounded-[999px] border px-2 py-0.5 text-[9.5px]" style={{ borderColor: "var(--line)", background: kind === entry ? "var(--accent-soft)" : "var(--paper-raised)", color: kind === entry ? "var(--accent)" : "var(--ink-soft)" }} onClick={() => setKind(entry)}>
                  {entry.toLowerCase().replace(/_/g, " ")}
                </button>
              ))}
            </div>
            <Journal state={journalShown} kind={kind} />
          </section>
        ) : null}
      </div>
    </details>
  );
}

const LEVEL_WORDS: Record<string, string> = {
  POSITION_FLAT: "position flat",
  ENGINE_ACTIVE_LEVEL_NOT_SET: "no level set by the engine",
  SOURCE_ACTIVE_LEVEL_NON_POSITIVE: "source level not a price",
  SOURCE_FIELD_NOT_PUBLISHED: "not published by the source",
};

/** One line per protective level: bars drawn, and every bar that is not, with the server's typed reason. Raw `source_value` is never shown. */
function LevelDisclosure({ rows }: { rows: readonly ObservationRow[] }) {
  const stop = levelDisclosure(rows, "active_stop");
  const take = levelDisclosure(rows, "active_take_profit");
  if (!stop.typed && !take.typed) return null;
  const line = (name: string, d: ReturnType<typeof levelDisclosure>) =>
    `${name} · ${d.drawn.toLocaleString("en-US")} bars drawn${d.absent.map((a) => ` · ${a.count.toLocaleString("en-US")} ${a.state === "NOT_APPLICABLE" ? "not applicable" : "not published"}${a.reason ? ` (${LEVEL_WORDS[a.reason] ?? a.reason.toLowerCase().replace(/_/g, " ")})` : ""}`).join("")}`;
  return (
    <p className="mono text-[10px]" style={{ color: "var(--ink-faint)" }} data-level-disclosure title="Account-active protective levels as the engine published them for each retained bar. A level is drawn only while a position is open and the engine published a positive price; the line breaks everywhere else.">
      {line("Stop", stop)} · {line("Take-profit", take)}
    </p>
  );
}

type JournalPayload = ExecutionRow["payload"];

const ACTIVATION_WORDS: Record<string, string> = { immediate: "immediately", on_parent_full_fill: "on parent full fill" };

/**
 * The price a record published: a fill price, a limit price or a working price, and for a stop order its trigger. The trigger is named
 * as one; a stop order is never shown as having no price when the engine published its trigger.
 */
function PriceCell({ payload }: { payload: JournalPayload }) {
  const price = payload.fill_price ?? payload.price ?? payload.working_price;
  if (price === null || price === undefined) {
    const trigger = payload.trigger_price ?? payload.working_trigger_price;
    if (trigger !== null && trigger !== undefined) {
      return <span className="mono" data-exact={String(trigger)} data-price-kind="trigger" style={{ fontVariantNumeric: "tabular-nums" }}>{String(trigger)} <span style={{ color: "var(--ink-faint)" }}>trigger</span></span>;
    }
  }
  return <Field value={price} record={payload} name="price" />;
}

/**
 * Which order a record is about and, when the source published them, its explicit relations. Only the source's own IDs are shown and only
 * as served: a parent, an OCO group and an activation policy are never inferred from an ID suffix or from row order.
 */
function OrderRef({ payload }: { payload: JournalPayload }) {
  if (!payload.order_id) return <span className="mono italic" style={{ color: "var(--ink-faint)" }} data-field-absent="order_id">—</span>;
  const relations: string[] = [];
  if (payload.parent_order_id) relations.push(`parent ${payload.parent_order_id}`);
  if (payload.oco_group_id) relations.push(`OCO ${payload.oco_group_id}`);
  if (payload.activation_policy) relations.push(`activates ${ACTIVATION_WORDS[payload.activation_policy] ?? payload.activation_policy.replace(/_/g, " ")}`);
  if (payload.reduce_only === true) relations.push("reduce-only");
  return (
    <span className="flex flex-col" data-order-ref={payload.order_id}>
      <span className="mono" title={payload.order_id}>
        {payload.order_id}
        {payload.order_type ? <span style={{ color: "var(--ink-faint)" }}> · {payload.order_type.replace(/_/g, " ")}</span> : null}
      </span>
      {relations.length > 0 ? <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }} data-order-relations>{relations.join(" · ")}</span> : null}
    </span>
  );
}

function Journal({ state, kind }: { state: PageState | null; kind: RecordKind }) {
  if (state === null || state.state === "loading") return <p className="mono text-[11px] italic" style={{ color: "var(--ink-faint)" }}>reading the journal…</p>;
  if (state.state === "unavailable") return <p className="mono text-[11px] italic" style={{ color: "var(--ink-soft)" }}>This server does not publish the engine journal yet.</p>;
  if (state.state === "failed") return <p className="text-[11px]" role="status" style={{ color: "var(--ink-soft)" }} data-journal-failed>{failureWords(state.status)}</p>;
  const absence = absenceOf(state.page);
  if (absence !== null) return <Absent state={absence.state} reason={absence.reasonCode} />;
  const rows = executionRows(state.page);
  if (rows.length === 0) {
    return <p className="mono text-[11px]" style={{ color: "var(--ink-soft)" }} data-journal-empty={kind}>The engine journal is published and holds no {kind.toLowerCase().replace(/_/g, " ")} record in this window.</p>;
  }
  return (
    <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={`${kind.toLowerCase()} records`}>
      <table className="w-full text-[11px]" data-journal-table={kind}>
        <thead>
          <tr style={{ color: "var(--ink-faint)", textAlign: "left" }}>
            {["time (UTC)", "kind", "order", "side", "price", "qty", "fee", "status / reason", "source"].map((head) => <th key={head} scope="col" className="mono pr-3 text-[9.5px] font-medium uppercase">{head}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const p = row.payload;
            return (
              <tr key={`${p.source_relation}:${p.source_ordinal}:${row.source_ordinal}`} tabIndex={0} data-record={p.record_kind} data-record-ordinal={p.source_ordinal} style={{ borderTop: "1px solid var(--line-soft)" }}>
                <td className="mono pr-3">{iso(p.filled_at_utc_ms ?? p.timestamp_utc_ms ?? row.at_utc_ms)}</td>
                <td className="mono pr-3">{p.record_kind.toLowerCase().replace(/_/g, " ")}</td>
                <td className="pr-3"><OrderRef payload={p} /></td>
                <td className="pr-3"><Field value={p.side} record={p} name="side" /></td>
                <td className="pr-3"><PriceCell payload={p} /></td>
                <td className="pr-3"><Field value={p.fill_qty ?? p.qty ?? p.working_qty} record={p} name="qty" /></td>
                <td className="pr-3"><Field value={p.fill_fee ?? p.fee} record={p} name="fee" /></td>
                <td className="pr-3"><Field value={p.exit_reason ?? p.event_name ?? p.status ?? p.reason_code} record={p} name="status" /></td>
                <td className="mono pr-3" style={{ color: "var(--ink-faint)" }} title="relation-local ordinal, not a global causal sequence">{p.source_relation} #{p.source_ordinal}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {state.page.next_cursor !== null ? <p className="mono mt-1 text-[10px]" style={{ color: "var(--ink-faint)" }}>{rows.length} of {(state.page.counts.matching ?? rows.length).toLocaleString("en-US")} records shown</p> : null}
    </div>
  );
}
