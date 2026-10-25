/**
 * CommandBar — jump-to overlay (review2/00 C1, D18).
 *
 * Opening is not its business: PortalShell already owns Cmd/Ctrl+K and passes
 * `open`. The bar only handles what happens inside it: arrow keys, Enter and
 * Escape, a focus trap, and handing focus back to whatever opened it.
 *
 * Entries arrive already scoped. `filterEntriesByCapabilities` covers the
 * static "Go to" rows; entity search is the server's job, so a researcher gets
 * the same "No result" for a peer's alpha that exists and one that does not.
 * Pass `filterLocally={false}` with `onQueryChange` when the server does the
 * matching.
 *
 * The root carries `exec-surface` so the typography roles resolve outside the
 * Execution surface; shell.css lifts the surface's opaque background and
 * min-height, which would otherwise hide the page behind the overlay.
 */
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";

import type { CommandEntry } from "./roleNav";
import "../css/shell.css";

export interface CommandBarProps {
  open: boolean;
  onClose(): void;
  entries: readonly CommandEntry[];
  /** Called with the chosen entry, then `onClose`. Navigation and context carry-over are the caller's. */
  onSelect(entry: CommandEntry): void;
  /** Rows drawn at once; the footer says so when more matched. */
  limit?: number;
  /** `false` when `entries` are already the server's answer for the query. */
  filterLocally?: boolean;
  onQueryChange?(query: string): void;
  /** Input hint; defaults to the entity-search wording for a bar that has a server search. */
  placeholder?: string;
  /** Says why a kind of result is absent (e.g. "Not published (FE-023)"); read out with the input. */
  searchNotice?: string;
  /**
   * One honest line per searched kind (the read used, how it matched, how many shown of how many): drawn under the notice, read out
   * with the status. Empty or absent draws nothing.
   */
  notes?: readonly string[];
  /** A server search is in flight: the status says so, and an empty list is not yet "No result". */
  busy?: boolean;
}

const DEFAULT_LIMIT = 12;
const DEFAULT_PLACEHOLDER = "Search alphas, portfolios, accounts, operations, approvals";
const FOCUSABLE = 'input, a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

function matches(entry: CommandEntry, needle: string): boolean {
  return `${entry.group} ${entry.label} ${entry.detail ?? ""}`.toLowerCase().includes(needle);
}

/** Stable by first appearance, so the flat index the arrow keys use equals the order on screen. */
function byGroup(entries: readonly CommandEntry[]): { name: string; items: CommandEntry[] }[] {
  const groups: { name: string; items: CommandEntry[] }[] = [];
  for (const entry of entries) {
    const found = groups.find((group) => group.name === entry.group);
    if (found) found.items.push(entry);
    else groups.push({ name: entry.group, items: [entry] });
  }
  return groups;
}

export function CommandBar({
  open,
  onClose,
  entries,
  onSelect,
  limit = DEFAULT_LIMIT,
  filterLocally = true,
  onQueryChange,
  placeholder = DEFAULT_PLACEHOLDER,
  searchNotice,
  notes,
  busy = false,
}: CommandBarProps) {
  const base = useId();
  const listId = `${base}-list`;
  const noticeId = `${base}-notice`;
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const matched = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return filterLocally && needle !== "" ? entries.filter((entry) => matches(entry, needle)) : entries;
  }, [entries, query, filterLocally]);
  const groups = useMemo(() => byGroup(matched.slice(0, limit)), [matched, limit]);
  const shown = useMemo(() => groups.flatMap((group) => group.items), [groups]);
  const optionId = (index: number) => `${base}-opt-${index}`;
  // Entries can shrink under a stale index (a server answer arriving late).
  const current = Math.min(active, Math.max(0, shown.length - 1));

  // Remember who opened the bar and give focus back when it closes (or unmounts).
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement;
    setQuery("");
    setActive(0);
    inputRef.current?.focus();
    return () => {
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, [open]);

  useEffect(() => {
    document.getElementById(`${base}-opt-${current}`)?.scrollIntoView?.({ block: "nearest" });
  }, [base, current, shown]);

  if (!open) return null;

  const choose = (entry: CommandEntry) => {
    onSelect(entry);
    onClose();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive(Math.max(0, Math.min(shown.length - 1, current + 1)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive(Math.max(0, current - 1));
    } else if (event.key === "Enter") {
      const entry = shown[current];
      if (entry === undefined || event.nativeEvent.isComposing) return;
      event.preventDefault();
      choose(entry);
    } else if (event.key === "Tab") {
      const focusable = [...(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  };

  const total = matched.length;
  const status = busy ? "Searching" : shown.length === 0 ? "No result" : `${shown.length} of ${total} results`;
  let index = -1;

  return (
    <div
      className="exec-cmdbar exec-surface"
      onKeyDown={onKeyDown}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div ref={panelRef} className="exec-cmdbar-panel" role="dialog" aria-modal="true" aria-label="Command bar">
        <input
          ref={inputRef}
          className="exec-cmdbar-input"
          type="text"
          role="combobox"
          aria-label="Search or jump to"
          aria-expanded={shown.length > 0}
          aria-controls={shown.length > 0 ? listId : undefined}
          aria-activedescendant={shown.length > 0 ? optionId(current) : undefined}
          aria-autocomplete="list"
          autoComplete="off"
          aria-describedby={searchNotice ? noticeId : undefined}
          placeholder={placeholder}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
            onQueryChange?.(event.target.value);
          }}
        />
        {searchNotice ? (
          <div id={noticeId} className="exec-cmdbar-notice">
            {searchNotice}
          </div>
        ) : null}
        {notes && notes.length > 0 ? (
          <ul className="exec-cmdbar-notes" aria-label="Reads used">
            {notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        ) : null}
        {shown.length > 0 ? (
          <div id={listId} className="exec-cmdbar-list" role="listbox" aria-label="Results">
            {groups.map((group, groupIndex) => (
              <div key={group.name} role="group" aria-labelledby={`${base}-g-${groupIndex}`}>
                <div id={`${base}-g-${groupIndex}`} className="exec-cmdbar-group">
                  {group.name}
                </div>
                {group.items.map((entry) => {
                  index += 1;
                  const position = index;
                  return (
                    <div
                      key={entry.id}
                      id={optionId(position)}
                      className="exec-cmdbar-option"
                      role="option"
                      aria-selected={position === current}
                      onMouseMove={() => setActive(position)}
                      onClick={() => choose(entry)}
                    >
                      <span className="exec-cmdbar-label">{entry.label}</span>
                      {entry.detail ? <span className="exec-cmdbar-detail">{entry.detail}</span> : null}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        ) : (
          <div className="exec-cmdbar-empty">{busy ? "Searching" : "No result"}</div>
        )}
        <div className="exec-cmdbar-foot">
          <span>
            <kbd>↑↓</kbd> move
          </span>
          <span>
            <kbd>↵</kbd> open
          </span>
          <span>
            <kbd>esc</kbd> close
          </span>
          {total > shown.length ? (
            <span className="exec-cmdbar-more">
              Showing {shown.length} of {total}
            </span>
          ) : null}
        </div>
        <div className="exec-shell-sr" role="status">
          {status}
        </div>
      </div>
    </div>
  );
}
