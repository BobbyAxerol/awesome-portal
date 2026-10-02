/**
 * Screen 02 · Market data step parts (S02_DATA).
 *
 * Three controls that let the reader declare what the data backend can serve:
 * the dataset identity, a searchable symbol picker with served coverage on one
 * shared axis, and a chip row of every served timeframe. Every value printed
 * here is a served catalog fact; an absent fact is a typed absence, never a
 * zero or a dash. Nothing is estimated.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import { type CatalogDataset, type CatalogSymbol, type SymbolSearchResult, coverageLabel, readDatasetSymbols } from "./datasetClient";
import {
  type CatalogIndexFacts,
  type CoverageRange,
  type CoverageWarning,
  type MonthAxis,
  type SymbolQuality,
  type TimeframeChip,
  asOfLabel,
  barGeometry,
  barsLine,
  coverageAbsence,
  coverageFor,
  coverageShort,
  datasetExtras,
  expiryDay,
  gapDetail,
  group as thousands,
  groupSymbols,
  hasInstrumentFacts,
  instrumentAbsence,
  instrumentAbsenceTitle,
  instrumentTerms,
  qualityNeedsAttention,
  qualityText,
  qualityTitle,
  readCoverageByTimeframe,
  readInstrument,
  symbolAxis,
  timeframeQuality,
  utcDay,
} from "./dataDeclaration";

const monthText = (index: number) => `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;

const chipStyle = {
  borderColor: "var(--line)",
  background: "var(--paper)",
  color: "var(--ink-soft)",
} as const;

function Chip({ children, title, ...rest }: { children: React.ReactNode; title?: string } & React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className="mono rounded-[3px] border px-1.5 text-[9.5px] leading-[16px]" style={chipStyle} title={title} {...rest}>
      {children}
    </span>
  );
}

/* ----------------------------------------------------------- dataset row */

/** Venue · calendar · timezone · source class as chips; usage scopes live in the tooltip. */
export function DatasetIdentity({
  dataset,
  chosen,
  onUse,
  labelled = false,
  index = null,
}: {
  dataset: CatalogDataset;
  chosen: boolean;
  onUse: () => void;
  /** The row is the dataset control itself (the only dataset), so it carries the control's name. */
  labelled?: boolean;
  /** The catalog's index facts (v2): the as-of of its counts, or why it has none. Null for a v1 catalog. */
  index?: CatalogIndexFacts | null;
}) {
  const extras = datasetExtras(dataset);
  /* "Listed" is not "runnable": the preflight is the one that admits a run. */
  const scopes = `Usage: ${dataset.usage_scopes.join(", ") || "none published"}. Excluded: ${dataset.excluded_scopes.join(", ") || "none published"}.${
    extras.catalogRevision ? ` Catalog ${extras.catalogRevision}.` : ""
  }${extras.assetClassAbsence ? ` Asset class not published (${extras.assetClassAbsence}).` : ""} Listed by the catalog; preflight decides whether a run is admitted.`;
  const asOf = index?.state === "AVAILABLE" ? asOfLabel(index.asOfUtcMs) : null;
  return (
    <div
      className="flex flex-wrap items-center gap-1.5 rounded-[6px] border px-2.5 py-1.5"
      style={{ borderColor: chosen ? "var(--accent)" : "var(--line)", background: "var(--paper)" }}
      role={labelled ? "group" : undefined}
      aria-label={labelled ? "Dataset" : undefined}
      data-dataset-identity={dataset.dataset_id}
      data-dataset-chosen={chosen}
      title={scopes}
    >
      <span className="mono text-[11px] font-semibold" data-dataset-id>{dataset.dataset_id}</span>
      <Chip data-chip="venue">{dataset.venue}</Chip>
      <Chip data-chip="calendar" title="calendar policy">{dataset.calendar_policy}</Chip>
      <Chip data-chip="timezone" title="source timezone">{dataset.source_timezone}</Chip>
      <Chip data-chip="source-class" title="source class">{dataset.source_class}</Chip>
      {extras.assetClass ? <Chip data-chip="asset-class" title="asset class">{extras.assetClass}</Chip> : null}
      {index !== null && index.state !== "AVAILABLE" ? (
        <span
          className="text-[9.5px] italic"
          style={{ color: "var(--ink-faint)" }}
          title={["timeframe bars, gaps and window counts not published", index.reasonCode].filter(Boolean).join(" · ")}
          aria-label={["index not published", index.reasonCode].filter(Boolean).join(" · ")}
          tabIndex={0}
          data-index-absent={index.reasonCode ?? ""}
        >
          index — not published
        </span>
      ) : null}
      {asOf ? (
        <span className="mono text-[9px]" style={{ color: "var(--ink-faint)" }} title={asOf.title} aria-label={asOf.title} tabIndex={0} data-index-as-of>
          {asOf.text}
        </span>
      ) : null}
      {chosen ? null : (
        <button type="button" className="btn-ghost mono ml-auto text-[10px]" data-action="use-dataset" onClick={onUse}>
          use this dataset
        </button>
      )}
    </div>
  );
}

/** Datasets the catalog lists but cannot serve: disabled, with the served reason in the tooltip. */
export function UnavailableDatasets({ datasets }: { datasets: readonly CatalogDataset[] }) {
  if (datasets.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5" data-unavailable-datasets>
      {datasets.map((item) => {
        /* v2: the server's reason code rides with its sentence. */
        const code = datasetExtras(item).unavailableReasonCode;
        const reason = item.unavailable_reason ?? "unavailable — no reason published";
        return (
          <span
            key={item.dataset_id}
            className="mono rounded-[3px] border border-dashed px-1.5 text-[9.5px] leading-[16px]"
            style={{ borderColor: "var(--line-strong)", color: "var(--ink-faint)", cursor: "not-allowed" }}
            title={code ? `${reason} · ${code}` : reason}
            aria-label={`${item.dataset_id}, unavailable${item.unavailable_reason ? ` — ${item.unavailable_reason}` : ""}${code ? ` · ${code}` : ""}`}
            data-unavailable-dataset={item.dataset_id}
            data-reason-code={code ?? undefined}
          >
            {item.dataset_id} · unavailable
          </span>
        );
      })}
    </div>
  );
}

/* --------------------------------------------------------- symbol picker */

function CoverageBar({ symbol, axis, timeframe }: { symbol: CatalogSymbol; axis: MonthAxis | null; timeframe?: string }) {
  const geometry = barGeometry(symbol, axis, timeframe);
  return (
    <span
      className="relative block h-[6px] w-[96px] flex-none rounded-full"
      style={{ background: "var(--paper-sunken)" }}
      aria-hidden="true"
      data-coverage-bar={symbol.symbol}
    >
      {geometry ? (
        <span
          className="absolute top-0 h-full rounded-full"
          style={{
            left: `${geometry.left}%`,
            width: `${geometry.width}%`,
            background: symbol.contract_kind === "QUARTERLY" ? "var(--accent-2)" : "var(--accent)",
          }}
        />
      ) : null}
    </span>
  );
}

/** The legacy `contract_kind` is the source namespace's grouping, not an official instrument fact. */
const KIND_HINT = "contract kind: a namespace hint from the symbol list, not an instrument fact";

/**
 * Searchable combobox over every published symbol. Type to filter, arrows to
 * move, Enter to pick, Escape to close. The input still takes any text: a
 * symbol that is not listed is the caller's typed `symbol-unlisted` state.
 */
export const SYMBOL_SEARCH_DEBOUNCE_MS = 250;
const PAGE_LIMIT = 25;

type Remote =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "absent" }
  /** The route answered, but its index has nothing to page: the served list stays, and the code is shown. */
  | { state: "unindexed"; code: string | null }
  | { state: "ok"; q: string; items: readonly CatalogSymbol[]; total: number | null; nextCursor: string | null };

export function SymbolCombobox({
  value,
  symbols,
  total,
  truncated,
  bad,
  onChange,
  datasetId = "",
  timeframe = "",
  nextCursor = null,
  search = readDatasetSymbols,
  debounceMs = SYMBOL_SEARCH_DEBOUNCE_MS,
  onServerMiss,
  onServerItems,
}: {
  value: string;
  symbols: readonly CatalogSymbol[];
  total: number | null;
  truncated: boolean;
  bad: boolean;
  /** Called with the picked or typed symbol (upper-cased). */
  onChange: (symbol: string) => void;
  /** The dataset the list belongs to; the server is asked about its symbols only when it is partial. */
  datasetId?: string;
  /** The chosen timeframe: the coverage line and bar follow it, and the server search filters by it. */
  timeframe?: string;
  /** The catalog's own cursor, when it served a first page only. */
  nextCursor?: string | null;
  search?: typeof readDatasetSymbols;
  debounceMs?: number;
  /** Told the symbol the server was asked for and answered "none" for; null otherwise. */
  onServerMiss?: (symbol: string | null) => void;
  /** The symbols the server last returned, so the picked one's facts can be shown though the catalog did not serve it. */
  onServerItems?: (items: readonly CatalogSymbol[]) => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  /* null = untouched since opening: show every symbol, whatever the field holds. */
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const [kind, setKind] = useState("");
  const [remote, setRemote] = useState<Remote>({ state: "idle" });
  /* A server without the route answers 404 once; from then on the served list is the list, silently. */
  const absentFor = useRef<string | null>(null);
  const listed = symbols.length > 0;
  /* More exist than were served: ask the server, not the local list. */
  const partial = nextCursor !== null || (total !== null && total > symbols.length);
  const needle = (query ?? "").trim().toUpperCase();
  const kinds = useMemo(
    () => [...new Set(symbols.map((item) => item.contract_kind).filter((entry): entry is NonNullable<typeof entry> => entry !== null))],
    [symbols],
  );

  useEffect(() => {
    if (!partial || datasetId === "" || absentFor.current === datasetId) return;
    if (needle === "" && kind === "") {
      setRemote({ state: "idle" });
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setRemote({ state: "loading" });
      void search(datasetId, { q: needle, kind, timeframe, limit: PAGE_LIMIT }, controller.signal).then((result: SymbolSearchResult) => {
        if (controller.signal.aborted) return;
        if (result.state === "absent") {
          absentFor.current = datasetId;
          setRemote({ state: "absent" });
        } else if (result.state === "failed") {
          setRemote({ state: "idle" });
        } else if (result.page.availability.state === "NOT_PUBLISHED") {
          setRemote({ state: "unindexed", code: result.page.availability.reasonCode });
        } else {
          setRemote({ state: "ok", q: needle, items: result.page.items, total: result.page.total, nextCursor: result.page.nextCursor });
        }
      });
    }, debounceMs);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [partial, datasetId, needle, kind, timeframe, search, debounceMs]);

  const fromServer = remote.state === "ok";
  const shownSymbols = fromServer ? remote.items : kind === "" ? symbols : symbols.filter((item) => item.contract_kind === kind);
  const shownTotal = fromServer ? remote.total : total;
  const cursor = fromServer ? remote.nextCursor : remote.state === "absent" || remote.state === "unindexed" ? null : nextCursor;
  const loadMore = useCallback(() => {
    if (cursor === null || datasetId === "") return;
    void search(datasetId, { q: needle, kind, timeframe, cursor, limit: PAGE_LIMIT }).then((result) => {
      if (result.state !== "page") return;
      setRemote((current) => {
        const base = current.state === "ok" ? current.items : symbols;
        const seen = new Set(base.map((item) => item.symbol));
        return {
          state: "ok",
          q: needle,
          items: [...base, ...result.page.items.filter((item) => !seen.has(item.symbol))],
          total: result.page.total ?? (current.state === "ok" ? current.total : total),
          nextCursor: result.page.nextCursor,
        };
      });
    });
  }, [cursor, datasetId, search, needle, kind, timeframe, symbols, total]);
  const missed = fromServer && remote.total === 0 && remote.q === value.trim().toUpperCase() ? remote.q : null;
  useEffect(() => {
    onServerMiss?.(missed);
  }, [missed, onServerMiss]);
  const serverItems = fromServer ? remote.items : null;
  useEffect(() => {
    if (serverItems !== null) onServerItems?.(serverItems);
  }, [serverItems, onServerItems]);

  const groups = useMemo(() => groupSymbols(shownSymbols, fromServer ? null : query), [shownSymbols, fromServer, query]);
  const flat = useMemo(() => groups.flatMap((entry) => entry.items), [groups]);
  const axis = useMemo(() => symbolAxis(symbols), [symbols]);
  const expanded = listed && open;
  const optionId = (index: number) => `${id}-opt-${index}`;
  /* ONE honest absence for the list: the first typed "instrument not published" among what is shown. */
  const noInstrument = useMemo(() => {
    for (const item of shownSymbols) {
      const absence = instrumentAbsence(item);
      if (absence !== null) return absence;
    }
    return null;
  }, [shownSymbols]);

  const pick = (symbol: string) => {
    onChange(symbol);
    setQuery(null);
    setOpen(false);
  };

  return (
    <div className="relative flex w-full flex-col gap-1">
      <input
        className="mono rounded-[6px] border px-2 py-[5px] text-[11px]"
        style={{ borderColor: bad ? "var(--bad)" : "var(--line)", background: "var(--paper-raised)", color: "var(--ink)" }}
        value={value}
        placeholder={listed ? (total !== null ? `search ${total} symbols` : partial ? "search symbols" : `search ${symbols.length} symbols`) : undefined}
        aria-label="Symbol"
        role={listed ? "combobox" : undefined}
        aria-autocomplete={listed ? "list" : undefined}
        aria-expanded={listed ? expanded : undefined}
        aria-controls={listed ? `${id}-list` : undefined}
        aria-activedescendant={expanded && flat.length > 0 ? optionId(Math.min(active, flat.length - 1)) : undefined}
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => {
          const next = event.target.value.toUpperCase();
          setQuery(next);
          setActive(0);
          setOpen(true);
          onChange(next);
        }}
        onFocus={() => {
          setQuery(null);
          setOpen(true);
        }}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (!listed) return;
          if (event.key === "ArrowDown") {
            event.preventDefault();
            if (!open) setOpen(true);
            else setActive((index) => Math.min(flat.length - 1, index + 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive((index) => Math.max(0, index - 1));
          } else if (event.key === "Enter" && expanded && flat.length > 0) {
            event.preventDefault();
            pick(flat[Math.min(active, flat.length - 1)]!.symbol);
          } else if (event.key === "Escape" && open) {
            event.preventDefault();
            setOpen(false);
          }
        }}
      />
      {expanded ? (
        <div
          id={`${id}-list`}
          role="listbox"
          aria-label="Published symbols"
          className="absolute left-0 top-full z-20 mt-1 max-h-[280px] w-[min(520px,calc(100vw-48px))] overflow-auto rounded-[6px] border"
          style={{ borderColor: "var(--line-strong)", background: "var(--paper-raised)", boxShadow: "var(--shadow-e2)" }}
          data-symbol-listbox
          /* Options take the click without moving focus off the input. */
          onMouseDown={(event) => event.preventDefault()}
        >
          {kinds.length > 1 && partial ? (
            <div className="flex items-center gap-1 px-2.5 py-1" role="group" aria-label="Contract kind">
              {["", ...kinds].map((entry) => (
                <button
                  key={entry || "all"}
                  type="button"
                  className="mono rounded-[3px] border px-1.5 text-[9px] leading-[16px]"
                  style={{
                    borderColor: kind === entry ? "var(--accent)" : "var(--line-strong)",
                    color: kind === entry ? "var(--accent)" : "var(--ink-soft)",
                  }}
                  aria-pressed={kind === entry}
                  onClick={() => {
                    setKind(entry);
                    setActive(0);
                  }}
                  data-symbol-kind={entry || "all"}
                >
                  {entry === "" ? "all" : entry.toLowerCase()}
                </button>
              ))}
            </div>
          ) : null}
          {noInstrument !== null ? (
            <p
              className="px-2.5 py-1 text-[9px] italic"
              style={{ color: "var(--ink-faint)" }}
              title={instrumentAbsenceTitle(noInstrument)}
              aria-label={instrumentAbsenceTitle(noInstrument)}
              tabIndex={0}
              data-instrument-absent-list={noInstrument.reasonCode ?? ""}
            >
              instrument terms — not published
            </p>
          ) : null}
          {remote.state === "unindexed" ? (
            <p
              className="px-2.5 py-1 text-[9px] italic"
              style={{ color: "var(--ink-faint)" }}
              title={remote.code ?? undefined}
              data-symbol-search-unindexed={remote.code ?? ""}
            >
              server search — not published{remote.code ? ` · ${remote.code}` : ""}
            </p>
          ) : null}
          {flat.length === 0 ? (
            <p className="px-2.5 py-2 text-[10px] italic" style={{ color: "var(--ink-faint)" }} data-symbol-no-match>
              {remote.state === "loading" ? "searching" : "no listed symbol matches"}
            </p>
          ) : null}
          {groups.map((group) => (
            <div key={group.kind} role="group" aria-label={`${group.label}, ${group.items.length}`} data-symbol-group={group.kind}>
              <div
                className="mono sticky top-0 flex items-baseline justify-between px-2.5 py-1 text-[9px] uppercase tracking-[.07em]"
                style={{ background: "var(--paper-sunken)", color: "var(--ink-faint)" }}
                aria-hidden="true"
                title={group.kind === "UNCLASSIFIED" ? undefined : KIND_HINT}
              >
                <span>{group.label} · {group.items.length}</span>
                {axis ? <span>{monthText(axis.first)} → {monthText(axis.last)}</span> : null}
              </div>
              {group.items.map((item) => {
                const index = flat.indexOf(item);
                const isActive = index === Math.min(active, flat.length - 1);
                return (
                  <div
                    key={item.symbol}
                    id={optionId(index)}
                    role="option"
                    aria-selected={item.symbol === value}
                    data-symbol-option={item.symbol}
                    data-active={isActive}
                    className="flex cursor-pointer items-center gap-2 px-2.5 py-[3px]"
                    style={{ background: isActive ? "var(--accent-soft)" : "transparent" }}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => pick(item.symbol)}
                  >
                    <span className="mono w-[128px] flex-none text-[10.5px] font-semibold">{item.symbol}</span>
                    <OptionFacts item={item} timeframe={timeframe} />
                    <CoverageBar symbol={item} axis={axis} timeframe={timeframe} />
                  </div>
                );
              })}
            </div>
          ))}
          {fromServer ? (
            <p className="mono px-2.5 py-1 text-[9.5px]" style={{ color: "var(--ink-faint)" }} data-symbol-caption>
              top {thousands(shownSymbols.length)}{shownTotal !== null ? ` / ${thousands(shownTotal)}` : ""}
            </p>
          ) : truncated ? (
            <p className="px-2.5 py-1.5 text-[9.5px] italic" style={{ color: "var(--ink-faint)" }} data-symbol-truncated>
              list truncated — {symbols.length} of {total ?? "an unpublished total"} shown; type any symbol, preflight checks it
            </p>
          ) : null}
          {cursor !== null ? (
            <button
              type="button"
              className="mono m-1.5 rounded-[3px] border px-2 text-[9.5px] leading-[18px]"
              style={{ borderColor: "var(--line-strong)", color: "var(--ink-soft)" }}
              onClick={loadMore}
              data-symbol-more
            >
              more
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------- v2 symbol facts (optional) */

/** The picked timeframe's gap count as served; every number it rests on, and the as-of, are in the tooltip. */
export function QualityChip({ quality }: { quality: SymbolQuality }) {
  const title = qualityTitle(quality);
  const absent = quality.kind === "absent";
  return (
    <span
      className={`mono flex-none rounded-[3px] ${absent ? "" : "border"} px-1 text-[8.5px] font-bold leading-[14px]`}
      style={{
        color: absent ? "var(--ink-faint)" : qualityNeedsAttention(quality) ? "var(--accent-2)" : "var(--good)",
        borderColor: "var(--line-strong)",
        fontStyle: absent ? "italic" : "normal",
        fontWeight: absent ? 400 : undefined,
      }}
      title={title}
      aria-label={title}
      tabIndex={0}
      data-quality-chip={absent ? "NOT_PUBLISHED" : "served"}
      data-reason-code={quality.reasonCode ?? undefined}
    >
      {qualityText(quality)}
    </span>
  );
}

/** What the server published for the chosen timeframe, or the months when it published no bars for it. */
function coverageText(item: CatalogSymbol, timeframe: string, long = false): { text: string; title?: string; served: boolean } {
  const frame = timeframe ? coverageFor(item, timeframe) : null;
  const line = frame ? barsLine(frame) : null;
  if (frame && line) {
    const span =
      frame.firstBarUtcMs !== null && frame.lastBarUtcMs !== null ? `${utcDay(frame.firstBarUtcMs)} → ${utcDay(frame.lastBarUtcMs)}` : null;
    /* The picked symbol's line carries the span; a list row keeps it short and puts the span in the tooltip. */
    return {
      text: long && span ? `${span} · ${line}` : line,
      title: [long ? null : span, gapDetail(frame)].filter(Boolean).join(" · ") || undefined,
      served: true,
    };
  }
  const months = long ? coverageLabel(item) : coverageShort(item);
  const framesPublished = readCoverageByTimeframe(item) !== null;
  /* The served reason (`HMD_SYMBOL_INTERVAL_NOT_INDEXED`, `HMD_METADATA_INDEX_NOT_BUILT`) rides in the tooltip. */
  const reasonCode = frame?.reasonCode ?? coverageAbsence(item)?.reasonCode ?? null;
  if (months === null) return { text: "coverage not published", title: reasonCode ?? undefined, served: false };
  return {
    text: framesPublished && timeframe ? `${months} · ${timeframe} bars not published` : months,
    title: framesPublished && timeframe && reasonCode ? `${timeframe} bars not published · ${reasonCode}` : undefined,
    served: false,
  };
}

/** One option's facts: coverage on the chosen timeframe, instrument terms when published, a quality flag when the gaps call for one. */
function OptionFacts({ item, timeframe }: { item: CatalogSymbol; timeframe: string }) {
  const instrument = readInstrument(item);
  const quality = timeframeQuality(item, timeframe);
  const coverage = coverageText(item, timeframe);
  const expiry = expiryDay(item);
  const terms = instrument ? instrumentTerms(instrument) : "";
  const line = [terms, expiry ? `exp ${expiry}` : null].filter(Boolean).join(" · ");
  return (
    <span className="flex min-w-0 flex-1 items-center gap-1.5">
      <span className="flex min-w-0 flex-1 flex-col">
        <span
          className="mono text-[9.5px]"
          style={{ color: "var(--ink-faint)", fontStyle: item.coverage ? "normal" : "italic" }}
          title={coverage.title}
          data-option-coverage
          data-option-bars={coverage.served ? timeframe : undefined}
        >
          {coverage.text}
        </span>
        {hasInstrumentFacts(instrument) && line !== "" ? (
          <span className="mono text-[9px]" style={{ color: "var(--ink-soft)" }} data-option-instrument>
            {line}
          </span>
        ) : null}
      </span>
      {quality !== null && qualityNeedsAttention(quality) ? <QualityChip quality={quality} /> : null}
    </span>
  );
}

/**
 * What the picked symbol is, under the field: the instrument, quality, and its
 * coverage. Without any v2 fact this is the single line the screen always had;
 * with them, the chosen timeframe's bars and gaps replace the month span, and
 * what the server left out reads "not published".
 */
export function SymbolFacts({ symbol, timeframe, rich }: { symbol: CatalogSymbol; timeframe: string; rich: boolean }) {
  const instrument = readInstrument(symbol);
  const absence = instrumentAbsence(symbol);
  const quality = timeframeQuality(symbol, timeframe);
  const coverage = coverageText(symbol, timeframe, true);
  const expiry = expiryDay(symbol);
  const frame = timeframe ? coverageFor(symbol, timeframe) : null;
  const asOf = asOfLabel(quality?.asOfUtcMs ?? null);
  const terms = hasInstrumentFacts(instrument)
    ? [instrument!.displayName, instrumentTerms(instrument!), expiry ? `exp ${expiry}` : null].filter(Boolean).join(" · ")
    : null;
  return (
    <span className="flex flex-col gap-0.5" data-symbol-facts>
      {terms !== null || absence !== null || quality !== null || rich ? (
        <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          {terms !== null ? (
            <span className="mono text-[9.5px]" style={{ color: "var(--ink-soft)" }} data-instrument>
              {terms}
            </span>
          ) : absence !== null || rich ? (
            <span
              className="text-[9.5px] italic"
              style={{ color: "var(--ink-faint)" }}
              title={absence ? instrumentAbsenceTitle(absence) : undefined}
              aria-label={absence ? instrumentAbsenceTitle(absence) : undefined}
              tabIndex={absence ? 0 : undefined}
              data-instrument-absent={absence?.reasonCode ?? ""}
            >
              instrument — not published
            </span>
          ) : null}
          {quality !== null ? <QualityChip quality={quality} /> : null}
          {asOf ? (
            <span className="mono text-[9px]" style={{ color: "var(--ink-faint)" }} title={asOf.title} aria-label={asOf.title} tabIndex={0} data-as-of>
              {asOf.text}
            </span>
          ) : null}
        </span>
      ) : null}
      <span
        className="mono text-[9.5px]"
        style={{ color: "var(--ink-faint)" }}
        title={coverage.title}
        aria-label={coverage.title ? `${timeframe} coverage · ${coverage.title}` : undefined}
        data-symbol-coverage
        data-coverage-timeframe={frame ? timeframe : undefined}
      >
        {symbol.contract_kind ? (
          <>
            <span title={KIND_HINT} data-contract-kind-hint>{symbol.contract_kind.toLowerCase()}</span>
            {" · "}
          </>
        ) : null}
        {coverage.served ? `${timeframe} · ` : ""}
        {coverage.text}
      </span>
    </span>
  );
}

/* ------------------------------------------------------------ timeframes */

const CHIP_REASON: Record<NonNullable<TimeframeChip["disabledReason"]>, (version: string, chip: TimeframeChip) => string> = {
  "not-declared": (version) => `not declared by ${version}`,
  "not-offered": () => "not offered by dataset",
  "declaration-not-published": () => "version timeframes not published — preflight decides",
  unavailable: (_version, chip) => `dataset cannot serve it${chip.reasonCode ? ` · ${chip.reasonCode}` : ""}`,
  "no-profile": (_version, chip) => `no admitted profile covers it${chip.detail ? ` · ${chip.detail}` : ""}`,
};

/** One chip per dataset timeframe: enabled when the bound version declares it and an admitted profile covers it. */
export function TimeframeChips({
  chips,
  version,
  bad,
  onPick,
}: {
  chips: readonly TimeframeChip[];
  /** The bound version's short label, for the tooltip. */
  version: string;
  bad: boolean;
  onPick: (timeframe: string) => void;
}) {
  if (chips.length === 0) {
    return (
      <span className="text-[10px] italic" style={{ color: "var(--ink-faint)" }} data-timeframes-absent>
        timeframes — not published
      </span>
    );
  }
  /* Why a chip is off, said where it can be read: one line per distinct reason
     (a tooltip alone is invisible on touch and in a screenshot). */
  const refused = new Map<string, string[]>();
  for (const chip of chips) {
    if (!chip.disabledReason) continue;
    const text = CHIP_REASON[chip.disabledReason](version, chip);
    refused.set(text, [...(refused.get(text) ?? []), chip.timeframe]);
  }
  return (
    <div className="flex flex-col gap-1">
    <div role="radiogroup" aria-label="Timeframe" className="flex flex-wrap gap-1.5" data-timeframe-chips>
      {chips.map((chip) => {
        const reason = chip.disabledReason ? CHIP_REASON[chip.disabledReason](version, chip) : `declared by ${version}`;
        return (
          <button
            key={chip.timeframe}
            type="button"
            role="radio"
            aria-checked={chip.selected}
            aria-disabled={!chip.enabled}
            aria-label={chip.enabled ? chip.timeframe : `${chip.timeframe}, ${reason}`}
            title={reason}
            data-timeframe-chip={chip.timeframe}
            data-chip-state={chip.selected ? "selected" : chip.enabled ? "enabled" : "disabled"}
            data-chip-reason={chip.disabledReason ?? undefined}
            className="mono rounded-[999px] border px-2.5 py-[2px] text-[10.5px] font-semibold"
            style={{
              borderColor: chip.selected ? (chip.enabled || !bad ? "var(--accent)" : "var(--bad)") : chip.enabled ? "var(--line-strong)" : "var(--line)",
              borderStyle: chip.enabled ? "solid" : "dashed",
              background: chip.selected ? "var(--accent-soft)" : "var(--paper-raised)",
              color: chip.enabled || chip.selected ? "var(--ink)" : "var(--ink-faint)",
              cursor: chip.enabled ? "pointer" : "not-allowed",
              ...(chip.selected && bad ? { borderColor: "var(--bad)" } : null),
            }}
            onClick={() => {
              if (chip.enabled) onPick(chip.timeframe);
            }}
          >
            {chip.timeframe}
          </button>
        );
      })}
    </div>
    {refused.size > 0 ? (
      <ul className="flex flex-col gap-0.5" data-timeframe-reasons>
        {[...refused].map(([text, frames]) => (
          <li key={text} className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }} data-timeframe-reason={frames.join(",")}>
            {frames.join(" · ")} — {text}
          </li>
        ))}
      </ul>
    ) : null}
    </div>
  );
}

/* -------------------------------------------------------------- warnings */

/** A declared window bound outside the served month coverage: both served months are in the text. */
export function CoverageWarnings({
  warnings,
  coverage,
}: {
  warnings: readonly CoverageWarning[];
  coverage: CoverageRange | null;
}) {
  if (!coverage || warnings.length === 0) return null;
  return (
    <ul className="flex flex-col gap-0.5" data-coverage-warnings>
      {warnings.map((warning) => (
        <li
          key={warning.bound}
          className="mono text-[10px]"
          style={{ color: "var(--accent-2)" }}
          data-coverage-warning={warning.bound}
          data-warning-side={warning.side}
        >
          {warning.bound} {warning.value} is {warning.side === "before" ? "before" : "after"} served coverage · {coverage.symbol}{" "}
          {coverage.firstMonth} → {coverage.lastMonth}
        </li>
      ))}
    </ul>
  );
}
