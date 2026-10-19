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
import { useEffect, useId, useRef, useState } from "react";

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

  return (
    <span className="exec-fleet-pop" ref={wrap}>
      <button
        ref={button}
        type="button"
        className="exec-fleet-btn"
        aria-haspopup="true"
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
}

export function FilterChips({ chips, onClearAll, urlText }: FilterChipsProps) {
  return (
    <div className="exec-fleet-chiprow">
      {chips.length > 0 ? (
        <ul className="exec-fleet-chips" aria-label="Active filters">
          {chips.map((chip) => (
            <li key={chip.id} className="exec-fleet-chip">
              <span>{chip.name}: {chip.value}</span>
              <button type="button" className="exec-fleet-chipx" aria-label={`Clear ${chip.name}`} onClick={chip.clear}>✕</button>
            </li>
          ))}
        </ul>
      ) : null}
      {chips.length > 0 ? <button type="button" className="exec-fleet-link" onClick={onClearAll}>Clear all</button> : null}
      <details className="exec-fleet-url">
        <summary>URL</summary>
        <code className="exec-fleet-urltext">{urlText}</code>
      </details>
    </div>
  );
}
