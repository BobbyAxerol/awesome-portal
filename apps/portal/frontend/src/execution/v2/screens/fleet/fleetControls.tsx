/**
 * Two small controls the HIFI Fleet toolbar has: the Columns menu and the
 * active-filter chips with their URL disclosure (UXM-07 FL-7, FL-8).
 *
 * Both are local. The menu switches published identity columns on and off; the
 * columns the HIFI lists that the backend has not published are shown disabled
 * with their request id, never as a column of empty cells. The chips mirror
 * what is in the URL (lens, stage, owner, health, search) and clear one at a
 * time; they add no filter of their own.
 */
import { useEffect, useId, useRef, useState, type FocusEvent } from "react";

import {
  FLEET_COLUMNS, UNPUBLISHED_COLUMNS, notPublished,
  type FleetColumnKey,
} from "./fleetModel";

import "../../css/fleet.css";

export interface ColumnsMenuProps {
  hidden: ReadonlySet<FleetColumnKey>;
  onToggle(key: FleetColumnKey, shown: boolean): void;
}

export function ColumnsMenu({ hidden, onToggle }: ColumnsMenuProps) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => {
      if (wrap.current && event.target instanceof Node && !wrap.current.contains(event.target)) setOpen(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // The menu takes this Esc: a docked drawer must not also close under it.
      event.preventDefault();
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener("mousedown", away);
    // Capture phase: this runs before the Drawer's own Esc listener and its preventDefault is honoured there.
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", key, true);
    };
  }, [open]);

  // Tabbing out of the popup closes it. A null relatedTarget (a click on a non-focusable spot, the window losing
  // focus) is left to the pointer handler above: it must not close the popup under a click on a label.
  const leave = (event: FocusEvent) => {
    const to = event.relatedTarget;
    if (to instanceof Node && wrap.current && !wrap.current.contains(to)) setOpen(false);
  };

  return (
    <span className="exec-fleet-pop" ref={wrap} onBlur={leave}>
      <button
        ref={button}
        type="button"
        className="exec-fleet-btn"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        Columns ▾
      </button>
      {open ? (
        <div id={menuId} className="exec-fleet-menu" role="group" aria-label="Columns">
          {FLEET_COLUMNS.map((column) => (
            <label key={column.key} className="exec-fleet-menuitem">
              <input
                type="checkbox"
                checked={!hidden.has(column.key)}
                onChange={(event) => onToggle(column.key, event.target.checked)}
              />
              {column.label}
            </label>
          ))}
          {UNPUBLISHED_COLUMNS.map((column) => (
            <label key={column.label} className="exec-fleet-menuitem" data-disabled="true" title={notPublished(column.fact)}>
              <input type="checkbox" checked={false} disabled readOnly />
              {column.label}
              <span className="exec-fleet-np">{notPublished(column.fact)}</span>
            </label>
          ))}
        </div>
      ) : null}
    </span>
  );
}

export interface MultiPickProps {
  /** Accessible name of the control and the word before the colon (`Health`). */
  name: string;
  options: readonly { value: string; label: string }[];
  selected: readonly string[];
  onChange(next: readonly string[]): void;
}

/**
 * A pick-several filter as a checkbox popover (the dataset's `IN` operator: one word is `EQ`, two or more are `IN`). It only
 * reports the new set; the server does the filtering. Same Esc / click-away / Tab-out contract as the Columns menu.
 */
export function MultiPick({ name, options, selected, onChange }: MultiPickProps) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menuId = useId();

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
  const first = options.find((option) => option.value === selected[0])?.label ?? selected[0];
  const summary = selected.length === 0 ? `${name}: all` : selected.length === 1 ? `${name}: ${first}` : `${name}: ${first} +${selected.length - 1}`;
  const toggle = (value: string, on: boolean) => onChange(on ? [...new Set([...selected, value])] : selected.filter((entry) => entry !== value));

  return (
    <span className="exec-fleet-pop" ref={wrap} onBlur={leave}>
      <button
        ref={button}
        type="button"
        className="exec-fleet-select"
        aria-label={name}
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        {summary} ▾
      </button>
      {open ? (
        <div id={menuId} className="exec-fleet-menu" role="group" aria-label={name}>
          {options.length === 0 ? <span className="exec-fleet-note">None seen yet</span> : null}
          {options.map((option) => (
            <label key={option.value} className="exec-fleet-menuitem">
              <input type="checkbox" checked={selected.includes(option.value)} onChange={(event) => toggle(option.value, event.target.checked)} />
              {option.label}
            </label>
          ))}
        </div>
      ) : null}
    </span>
  );
}

export interface FilterChip {
  id: string;
  name: string;
  value: string;
  clear(): void;
}

export interface FilterChipsProps {
  chips: readonly FilterChip[];
  onClearAll(): void;
  /** The query string the page is at, shown in the URL disclosure. */
  urlText: string;
  /** Where focus goes when no chip is left to take it (the search box); without it focus is not moved. */
  onFocusFallback?(): void;
}

export function FilterChips({ chips, onClearAll, urlText, onFocusFallback }: FilterChipsProps) {
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  // Set when a clear is clicked: the chip order as it was and which chip went. The next render has the new chips.
  const pending = useRef<{ order: readonly string[]; cleared: string | null } | null>(null);
  const fallback = useRef(onFocusFallback);
  fallback.current = onFocusFallback;

  useEffect(() => {
    const move = pending.current;
    if (move === null) return;
    pending.current = null;
    const alive = new Set(chips.map((chip) => chip.id));
    const at = move.cleared === null ? -1 : move.order.indexOf(move.cleared);
    // The next remaining chip, else the previous one, else the search box: focus is never left on a button that is gone.
    const after = at < 0 ? [] : move.order.slice(at + 1);
    const before = at < 0 ? [] : move.order.slice(0, at).reverse();
    const target = [...after, ...before].find((id) => alive.has(id));
    if (target !== undefined) buttons.current.get(target)?.focus();
    else fallback.current?.();
  });

  const clearOne = (chip: FilterChip) => {
    pending.current = { order: chips.map((c) => c.id), cleared: chip.id };
    chip.clear();
  };
  const clearAll = () => {
    pending.current = { order: chips.map((c) => c.id), cleared: null };
    onClearAll();
  };

  return (
    <div className="exec-fleet-chiprow">
      {chips.length > 0 ? (
        <ul className="exec-fleet-chips" role="list" aria-label="Active filters">
          {chips.map((chip) => (
            <li key={chip.id} className="exec-fleet-chip">
              <span>{chip.name}: {chip.value}</span>
              <button
                ref={(node) => {
                  if (node) buttons.current.set(chip.id, node);
                  else buttons.current.delete(chip.id);
                }}
                type="button"
                className="exec-fleet-chipx"
                aria-label={`Clear ${chip.name}`}
                onClick={() => clearOne(chip)}
              >✕</button>
            </li>
          ))}
        </ul>
      ) : null}
      {chips.length > 0 ? <button type="button" className="exec-fleet-link" onClick={clearAll}>Clear all</button> : null}
      <details className="exec-fleet-url">
        <summary>URL</summary>
        <code className="exec-fleet-urltext">{urlText}</code>
      </details>
    </div>
  );
}
