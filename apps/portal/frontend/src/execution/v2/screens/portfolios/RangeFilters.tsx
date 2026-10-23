/**
 * The numeric range filters of the register (guide 8.2 transferred to portfolios): Net PnL, Return, Drawdown, Score and Allocated
 * capital, plus the "missing or insufficient evidence" filter for the score. Each range says its unit and that both ends are
 * inclusive. A money range needs the page currency (money is never compared across currencies), so without one the field is not
 * drawn and a sentence says why: there is no dead control. A value that is not an exact decimal is refused where it is typed and
 * never reaches the address. Operands stay text; nothing is parsed to a float.
 */
import { useEffect, useState } from "react";

import { RANGES, SCORE_MISSING, isDecimal, rangeText, writeRange, type Range, type RangeId, type RangeSpec } from "./registerMetrics";

const UNIT_TEXT: Readonly<Record<RangeSpec["unit"], string>> = {
  money: "in the page currency",
  percent: "percent",
  points: "points, 0 to 100",
};

function RangeField({ spec, range, currency, windowLabel, onChange }: { spec: RangeSpec; range: Range | null; currency: string | null; windowLabel: string; onChange(next: Range | null): void }) {
  const [min, setMin] = useState(range?.min ?? "");
  const [max, setMax] = useState(range?.max ?? "");
  useEffect(() => {
    setMin(range?.min ?? "");
    setMax(range?.max ?? "");
  }, [range?.min, range?.max]);
  const bad = (text: string) => text !== "" && !isDecimal(text);
  const invalid = bad(min) || bad(max);
  const commit = (nextMin: string, nextMax: string) => {
    if (bad(nextMin) || bad(nextMax)) return;
    if (nextMin === "" && nextMax === "") return onChange(null);
    onChange({ min: nextMin === "" ? null : nextMin, max: nextMax === "" ? null : nextMax });
  };
  const windowed = spec.id === "pnl" || spec.id === "ret" || spec.id === "dd" || spec.id === "score";
  const unit = spec.unit === "money" ? `${currency ?? ""} ` : "";
  return (
    <fieldset className="exec-pf-range">
      <legend className="exec-pf-range-legend">{spec.label}{windowed ? ` · ${windowLabel}` : ""}</legend>
      {spec.unit === "money" && currency === null ? (
        <p className="exec-pf-note">Pick a currency first: money is compared inside one currency.</p>
      ) : (
        <>
          <span className="exec-pf-range-inputs">
            <label className="exec-pf-field">
              <span className="exec-pf-sr">{spec.label} minimum</span>
              <input className="exec-pf-input" inputMode="decimal" placeholder="min" value={min} aria-invalid={bad(min) || undefined} onChange={(e) => setMin(e.target.value.trim())} onBlur={() => commit(min, max)} onKeyDown={(e) => { if (e.key === "Enter") commit(min, max); }} />
            </label>
            <span aria-hidden="true">to</span>
            <label className="exec-pf-field">
              <span className="exec-pf-sr">{spec.label} maximum</span>
              <input className="exec-pf-input" inputMode="decimal" placeholder="max" value={max} aria-invalid={bad(max) || undefined} onChange={(e) => setMax(e.target.value.trim())} onBlur={() => commit(min, max)} onKeyDown={(e) => { if (e.key === "Enter") commit(min, max); }} />
            </label>
          </span>
          <span className="exec-pf-note" role={invalid ? "alert" : undefined}>
            {invalid ? "Enter an exact decimal such as -100.50." : `${unit}${UNIT_TEXT[spec.unit]}; both ends inclusive; a portfolio with no figure is outside the range.`}
          </span>
        </>
      )}
    </fieldset>
  );
}

export interface RangeFiltersProps {
  ranges: Readonly<Partial<Record<RangeId, Range>>>;
  scoreMissing: boolean;
  currency: string | null;
  windowLabel: string;
  /** Which ranges this register can offer (a range whose figure no read publishes is not drawn). */
  offered: readonly RangeId[];
  onRange(id: RangeId, next: Range | null): void;
  onScoreMissing(next: boolean): void;
}

export function RangeFilters({ ranges, scoreMissing, currency, windowLabel, offered, onRange, onScoreMissing }: RangeFiltersProps) {
  return (
    <div className="exec-pf-menu exec-pf-menu-wide" role="group" aria-label="Metric filters">
      {RANGES.filter((spec) => offered.includes(spec.id)).map((spec) => (
        <RangeField key={spec.id} spec={spec} range={ranges[spec.id] ?? null} currency={currency} windowLabel={windowLabel} onChange={(next) => onRange(spec.id, next)} />
      ))}
      {offered.includes("score") ? (
        <label className="exec-pf-menuitem">
          <input type="checkbox" checked={scoreMissing} onChange={(event) => onScoreMissing(event.target.checked)} /> Score missing or insufficient evidence
        </label>
      ) : null}
    </div>
  );
}

/** One chip per active filter, each with its own clear. */
export interface FilterChip {
  id: string;
  text: string;
  clear(): void;
}

export function FilterChips({ chips, onClearAll }: { chips: readonly FilterChip[]; onClearAll(): void }) {
  if (chips.length === 0) return null;
  return (
    <ul className="exec-pf-chips" aria-label="Active filters">
      {chips.map((chip) => (
        <li key={chip.id} className="exec-pf-chip">
          <span>{chip.text}</span>
          <button type="button" className="exec-pf-chip-x" aria-label={`Clear filter: ${chip.text}`} onClick={chip.clear}>{"×"}</button>
        </li>
      ))}
      <li><button type="button" className="exec-pf-btn" onClick={onClearAll}>Clear all</button></li>
    </ul>
  );
}

export { rangeText, writeRange, SCORE_MISSING };
