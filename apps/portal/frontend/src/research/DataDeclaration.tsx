/**
 * Screen 02 · Market data step parts (S02_DATA).
 *
 * Three controls that let the reader declare what the data backend can serve:
 * the dataset identity, a searchable symbol picker with served coverage on one
 * shared axis, and a chip row of every served timeframe. Every value printed
 * here is a served catalog fact; an absent fact is a typed absence, never a
 * zero or a dash. Nothing is estimated.
 */

import { useId, useMemo, useState } from "react";

import type { CatalogDataset, CatalogSymbol } from "./datasetClient";
import {
  type CoverageRange,
  type CoverageWarning,
  type MonthAxis,
  type TimeframeChip,
  barGeometry,
  coverageShort,
  groupSymbols,
  symbolAxis,
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
}: {
  dataset: CatalogDataset;
  chosen: boolean;
  onUse: () => void;
  /** The row is the dataset control itself (the only dataset), so it carries the control's name. */
  labelled?: boolean;
}) {
  const scopes = `Usage: ${dataset.usage_scopes.join(", ") || "none published"}. Excluded: ${dataset.excluded_scopes.join(", ") || "none published"}.`;
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
      {datasets.map((item) => (
        <span
          key={item.dataset_id}
          className="mono rounded-[3px] border border-dashed px-1.5 text-[9.5px] leading-[16px]"
          style={{ borderColor: "var(--line-strong)", color: "var(--ink-faint)", cursor: "not-allowed" }}
          title={item.unavailable_reason ?? "unavailable — no reason published"}
          aria-label={`${item.dataset_id}, unavailable${item.unavailable_reason ? ` — ${item.unavailable_reason}` : ""}`}
          data-unavailable-dataset={item.dataset_id}
        >
          {item.dataset_id} · unavailable
        </span>
      ))}
    </div>
  );
}

/* --------------------------------------------------------- symbol picker */

function CoverageBar({ symbol, axis }: { symbol: CatalogSymbol; axis: MonthAxis | null }) {
  const geometry = barGeometry(symbol, axis);
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

/**
 * Searchable combobox over every published symbol. Type to filter, arrows to
 * move, Enter to pick, Escape to close. The input still takes any text: a
 * symbol that is not listed is the caller's typed `symbol-unlisted` state.
 */
export function SymbolCombobox({
  value,
  symbols,
  total,
  truncated,
  bad,
  onChange,
}: {
  value: string;
  symbols: readonly CatalogSymbol[];
  total: number | null;
  truncated: boolean;
  bad: boolean;
  /** Called with the picked or typed symbol (upper-cased). */
  onChange: (symbol: string) => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  /* null = untouched since opening: show every symbol, whatever the field holds. */
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const listed = symbols.length > 0;
  const groups = useMemo(() => groupSymbols(symbols, query), [symbols, query]);
  const flat = useMemo(() => groups.flatMap((group) => group.items), [groups]);
  const axis = useMemo(() => symbolAxis(symbols), [symbols]);
  const expanded = listed && open;
  const optionId = (index: number) => `${id}-opt-${index}`;

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
        placeholder={listed ? `search ${total ?? symbols.length} symbols` : undefined}
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
          className="absolute left-0 top-full z-20 mt-1 max-h-[280px] w-[min(460px,calc(100vw-48px))] overflow-auto rounded-[6px] border"
          style={{ borderColor: "var(--line-strong)", background: "var(--paper-raised)", boxShadow: "var(--shadow-e2)" }}
          data-symbol-listbox
          /* Options take the click without moving focus off the input. */
          onMouseDown={(event) => event.preventDefault()}
        >
          {flat.length === 0 ? (
            <p className="px-2.5 py-2 text-[10px] italic" style={{ color: "var(--ink-faint)" }} data-symbol-no-match>
              no listed symbol matches
            </p>
          ) : null}
          {groups.map((group) => (
            <div key={group.kind} role="group" aria-label={`${group.label}, ${group.items.length}`} data-symbol-group={group.kind}>
              <div
                className="mono sticky top-0 flex items-baseline justify-between px-2.5 py-1 text-[9px] uppercase tracking-[.07em]"
                style={{ background: "var(--paper-sunken)", color: "var(--ink-faint)" }}
                aria-hidden="true"
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
                    <span
                      className="mono min-w-0 flex-1 text-[9.5px]"
                      style={{ color: "var(--ink-faint)", fontStyle: item.coverage ? "normal" : "italic" }}
                      data-option-coverage
                    >
                      {coverageShort(item) ?? "coverage not published"}
                    </span>
                    <CoverageBar symbol={item} axis={axis} />
                  </div>
                );
              })}
            </div>
          ))}
          {truncated ? (
            <p className="px-2.5 py-1.5 text-[9.5px] italic" style={{ color: "var(--ink-faint)" }} data-symbol-truncated>
              list truncated — {symbols.length} of {total ?? "an unpublished total"} shown; type any symbol, preflight checks it
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------ timeframes */

const CHIP_REASON: Record<NonNullable<TimeframeChip["disabledReason"]>, (version: string) => string> = {
  "not-declared": (version) => `not declared by ${version}`,
  "not-offered": () => "not offered by dataset",
  "declaration-not-published": () => "version timeframes not published — preflight decides",
};

/** One chip per dataset timeframe: enabled when the bound version declares it. */
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
  return (
    <div role="radiogroup" aria-label="Timeframe" className="flex flex-wrap gap-1.5" data-timeframe-chips>
      {chips.map((chip) => {
        const reason = chip.disabledReason ? CHIP_REASON[chip.disabledReason](version) : `declared by ${version}`;
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
