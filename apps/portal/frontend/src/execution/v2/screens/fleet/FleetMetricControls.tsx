/**
 * The metric controls of the Alpha Fleet (guide 8.2 / 8.3): numeric range filters, the Basis (the economic partition a money order or range
 * is made in), the evidence filter, the Equity 30D scalar, density and the dataset Columns menu. Each only reports a new value; the SERVER
 * sorts and filters. A control exists only for a key the published schema can carry: nothing here is a dead control.
 */
import { useEffect, useId, useRef, useState, type FocusEvent } from "react";

import {
  DATASET_COLUMNS, EQUITY_SCALARS, EVIDENCE_FILTERS, RANGE_FIELDS, isDecimalText, isMoneyField, rangeText,
  type BasisOption, type EquityScalar, type EvidenceFilter, type Range,
} from "./fleetMetricsModel";

import "../../css/fleet.css";
import "./fleetMetrics.css";

/** Esc / click-away / Tab-out, as the other Fleet popovers. */
function usePopover() {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => {
      if (wrap.current && event.target instanceof Node && !wrap.current.contains(event.target)) setOpen(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", key, true);
    };
  }, [open]);
  const leave = (event: FocusEvent) => {
    const to = event.relatedTarget;
    if (to instanceof Node && wrap.current && !wrap.current.contains(to)) setOpen(false);
  };
  return { open, setOpen, wrap, button, leave };
}

/* ── ranges ────────────────────────────────────────────────────────────── */

export interface RangeFilterProps {
  ranges: readonly Range[];
  /** The fields the dataset offers for a filter or sort (`query_options.sort_fields`). */
  offered: readonly string[] | null;
  /** A basis is pinned: a money range can be asked. */
  basis: BasisOption | null;
  onChange(next: readonly Range[]): void;
}

export function RangeFilter({ ranges, offered, basis, onChange }: RangeFilterProps) {
  const { open, setOpen, wrap, button, leave } = usePopover();
  const menuId = useId();
  const [draft, setDraft] = useState<Record<string, { min: string; max: string }>>({});
  useEffect(() => {
    if (open) setDraft(Object.fromEntries(ranges.map((range) => [range.field, { min: range.min ?? "", max: range.max ?? "" }])));
  }, [open, ranges]);
  const fields = RANGE_FIELDS.filter((spec) => offered !== null && offered.includes(spec.field));
  if (fields.length === 0) return null;
  const valueOf = (field: string) => draft[field] ?? { min: "", max: "" };
  const invalid = (text: string) => text !== "" && !isDecimalText(text);
  const apply = () => {
    const next: Range[] = [];
    for (const spec of fields) {
      const { min, max } = valueOf(spec.field);
      if (invalid(min) || invalid(max) || (min === "" && max === "")) continue;
      next.push({ field: spec.field, min: min === "" ? null : min, max: max === "" ? null : max });
    }
    onChange(next);
    setOpen(false);
  };
  return (
    <span className="exec-fleet-pop" ref={wrap} onBlur={leave}>
      <button ref={button} type="button" className="exec-fleet-select" aria-expanded={open} aria-controls={open ? menuId : undefined} onClick={() => setOpen((v) => !v)}>
        Ranges{ranges.length > 0 ? `: ${ranges.length}` : ""} ▾
      </button>
      {open ? (
        <div id={menuId} className="exec-fleet-menu" role="group" aria-label="Numeric ranges">
          <span className="exec-fleet-note">Inclusive bounds: at least the first value and at most the second. Leave a side empty for no bound.</span>
          {basis === null && fields.some((spec) => isMoneyField(spec.field)) ? (
            <span className="exec-fleet-note" data-testid="range-needs-basis">A money range is made in one currency and basis: choose a Basis first. Return and QBTS ranges need none.</span>
          ) : null}
          {fields.map((spec) => {
            const money = isMoneyField(spec.field);
            const blocked = money && basis === null;
            const { min, max } = valueOf(spec.field);
            return (
              <div key={spec.field} className="exec-fleet-range">
                <span className="exec-fleet-range-label">{spec.label}</span>
                <input className="exec-fleet-input" type="text" inputMode="decimal" aria-label={`${spec.label} at least`} placeholder="min" disabled={blocked}
                  aria-invalid={invalid(min) || undefined} value={min} onChange={(event) => setDraft({ ...draft, [spec.field]: { min: event.target.value.trim(), max } })} />
                <input className="exec-fleet-input" type="text" inputMode="decimal" aria-label={`${spec.label} at most`} placeholder="max" disabled={blocked}
                  aria-invalid={invalid(max) || undefined} value={max} onChange={(event) => setDraft({ ...draft, [spec.field]: { min, max: event.target.value.trim() } })} />
                <span className="exec-fleet-range-unit">{money ? (basis === null ? "needs a basis" : `in ${basis.label}`) : spec.unit}</span>
              </div>
            );
          })}
          <span className="exec-fleet-sortbar">
            <button type="button" className="exec-fleet-btn" onClick={apply}>Apply</button>
            <button type="button" className="exec-fleet-link" onClick={() => { onChange([]); setOpen(false); }}>Clear ranges</button>
          </span>
        </div>
      ) : null}
    </span>
  );
}

/** The chips text of a range (kept here so the screen and its tests say the same words). */
export { rangeText };

/* ── small selects ─────────────────────────────────────────────────────── */

export function BasisSelect({ options, value, onChange }: { options: readonly BasisOption[]; value: string | null; onChange(next: string | null): void }) {
  if (options.length === 0) return null;
  return (
    <label className="exec-fleet-field">
      <span className="exec-fleet-sr">Basis</span>
      <select className="exec-fleet-select" value={value ?? ""} title="The economic domain and currency a money order or range is made in. Partitions are never mixed in one order."
        onChange={(event) => onChange(event.target.value === "" ? null : event.target.value)}>
        <option value="">Basis: none</option>
        {options.map((option) => <option key={option.id} value={option.id}>Basis: {option.label}</option>)}
      </select>
    </label>
  );
}

export function EvidenceSelect({ value, onChange }: { value: EvidenceFilter | null; onChange(next: EvidenceFilter | null): void }) {
  return (
    <label className="exec-fleet-field">
      <span className="exec-fleet-sr">Evidence</span>
      <select className="exec-fleet-select" value={value ?? ""} onChange={(event) => onChange(event.target.value === "" ? null : (event.target.value as EvidenceFilter))}>
        <option value="">Evidence: any</option>
        {EVIDENCE_FILTERS.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
      </select>
    </label>
  );
}

export function EquityScalarSelect({ value, onChange }: { value: EquityScalar; onChange(next: EquityScalar): void }) {
  return (
    <label className="exec-fleet-field">
      <span className="exec-fleet-sr">Equity 30D shows</span>
      <select className="exec-fleet-select" value={value} title="The sparkline does not sort; this scalar does." onChange={(event) => onChange(event.target.value as EquityScalar)}>
        {EQUITY_SCALARS.map((scalar) => <option key={scalar.id} value={scalar.id}>Equity 30D: {scalar.label}</option>)}
      </select>
    </label>
  );
}

export function DensityToggle({ compact, onChange }: { compact: boolean; onChange(next: boolean): void }) {
  return (
    <span className="exec-fleet-seg" role="group" aria-label="Density">
      <button type="button" className="exec-fleet-segbtn" aria-pressed={!compact} onClick={() => onChange(false)}>Comfortable</button>
      <button type="button" className="exec-fleet-segbtn" aria-pressed={compact} onClick={() => onChange(true)}>Compact</button>
    </span>
  );
}

/* ── columns ───────────────────────────────────────────────────────────── */

export interface DatasetColumnsMenuProps {
  hidden: ReadonlySet<string>;
  shownOptional: ReadonlySet<string>;
  onToggle(key: string, shown: boolean): void;
}

export function DatasetColumnsMenu({ hidden, shownOptional, onToggle }: DatasetColumnsMenuProps) {
  const { open, setOpen, wrap, button, leave } = usePopover();
  const menuId = useId();
  return (
    <span className="exec-fleet-pop" ref={wrap} onBlur={leave}>
      <button ref={button} type="button" className="exec-fleet-btn" aria-expanded={open} aria-controls={open ? menuId : undefined} onClick={() => setOpen((v) => !v)}>Columns ▾</button>
      {open ? (
        <div id={menuId} className="exec-fleet-menu" role="group" aria-label="Columns">
          {DATASET_COLUMNS.filter((column) => column.key !== "alpha").map((column) => (
            <label key={column.key} className="exec-fleet-menuitem">
              <input type="checkbox" checked={column.optional ? shownOptional.has(column.key) : !hidden.has(column.key)} onChange={(event) => onToggle(column.key, event.target.checked)} />
              {column.label}
              {column.optional ? <span className="exec-fleet-np"> optional</span> : null}
            </label>
          ))}
        </div>
      ) : null}
    </span>
  );
}
