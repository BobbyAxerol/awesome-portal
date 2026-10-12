/**
 * Governance controls that are drawn, not borrowed from the browser: a listbox menu (replaces <select>) and a segmented control.
 *
 * ChoiceMenu is a real combobox/listbox — a button that opens a popover of options, with keyboard (↑ ↓ Home End Enter Esc), type-to-filter when the
 * list is long, outside-click and focus-out close, and the chosen option's label on the trigger. It carries no domain logic: value in, value out.
 */
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";

export interface ChoiceOption {
  value: string;
  label: string;
  /** A second, quieter line (a date, an id). */
  hint?: string;
  /** A small mark before the label (a status dot). */
  icon?: ReactNode;
}

export function ChoiceMenu({
  label,
  value,
  options,
  onChange,
  placeholder = "Choose…",
  disabled = false,
  searchable,
  prefix,
  className = "",
  title,
  variant = "pill",
}: {
  /** The accessible name — what the control chooses. */
  label: string;
  value: string;
  options: readonly ChoiceOption[];
  onChange: (next: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Defaults to on when there are more than 8 options. */
  searchable?: boolean;
  /** A small word before the value on the trigger ("Gate"). */
  prefix?: ReactNode;
  className?: string;
  title?: string;
  /** `pill` is a compact filter control; `field` is a full-width form field whose trigger and options carry a second line. */
  variant?: "pill" | "field";
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const id = useId();
  const withSearch = searchable ?? options.length > 8;
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q === "" ? options : options.filter((o) => `${o.label} ${o.hint ?? ""}`.toLowerCase().includes(q));
  }, [options, query]);
  const chosen = options.find((o) => o.value === value) ?? null;

  const close = (refocus = false) => {
    setOpen(false);
    setQuery("");
    if (refocus) root.current?.querySelector<HTMLButtonElement>("button.exec-cm-trigger")?.focus();
  };
  const choose = (next: string) => {
    onChange(next);
    close(true);
  };

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (e: Event) => { if (!root.current?.contains(e.target as Node)) close(); };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const at = Math.max(0, shown.findIndex((o) => o.value === value));
    setActive(at);
    if (withSearch) search.current?.focus();
    else list.current?.focus();
  }, [open]);

  useEffect(() => {
    list.current?.children[active]?.scrollIntoView?.({ block: "nearest" });
  }, [active, open]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); close(true); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(shown.length - 1, i + 1)); return; }
    if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); return; }
    if (e.key === "Home") { e.preventDefault(); setActive(0); return; }
    if (e.key === "End") { e.preventDefault(); setActive(Math.max(0, shown.length - 1)); return; }
    if (e.key === "Enter") { e.preventDefault(); const o = shown[active]; if (o) choose(o.value); }
  };

  return (
    <div className={`exec-cm ${className}`.trim()} ref={root} data-open={open ? "true" : undefined} data-variant={variant}>
      <button
        type="button"
        className="exec-cm-trigger"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        disabled={disabled}
        title={title}
        data-empty={chosen ? undefined : "true"}
        onClick={() => (open ? close() : setOpen(true))}
        onKeyDown={(e) => { if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) { e.preventDefault(); setOpen(true); } }}
      >
        {prefix ? <span className="exec-cm-prefix">{prefix}</span> : null}
        {variant === "field" && chosen?.icon ? <span className="exec-cm-icon" aria-hidden="true">{chosen.icon}</span> : null}
        <span className="exec-cm-value">
          {chosen ? chosen.label : placeholder}
          {variant === "field" && chosen?.hint ? <span className="exec-cm-sub">{chosen.hint}</span> : null}
        </span>
        <svg className="exec-cm-chevron" width="10" height="6" viewBox="0 0 10 6" aria-hidden="true"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {open ? (
        <div className="exec-cm-pop" onKeyDown={onKey}>
          {withSearch ? (
            <input ref={search} className="exec-cm-search" aria-label={`Filter: ${label}`} placeholder="Type to filter" value={query} onChange={(e) => { setQuery(e.target.value); setActive(0); }} />
          ) : null}
          <ul id={id} ref={list} role="listbox" aria-label={label} tabIndex={-1} className="exec-cm-list" aria-activedescendant={shown[active] ? `${id}-${active}` : undefined}>
            {shown.map((o, i) => (
              <li
                key={o.value}
                id={`${id}-${i}`}
                role="option"
                aria-selected={o.value === value}
                data-active={i === active ? "true" : undefined}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(o.value)}
              >
                {o.icon ? <span className="exec-cm-icon" aria-hidden="true">{o.icon}</span> : null}
                <span className="exec-cm-opt-text">
                  <span className="exec-cm-opt-label">{o.label}</span>
                  {o.hint ? <span className="exec-cm-opt-hint">{o.hint}</span> : null}
                </span>
                {o.value === value ? <span className="exec-cm-tick" aria-hidden="true">✓</span> : null}
              </li>
            ))}
            {shown.length === 0 ? <li className="exec-cm-none" role="presentation">Nothing matches “{query}”</li> : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/** A segmented control: one choice among a few, drawn as a single rounded track. */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: {
  label: string;
  value: T | null;
  options: readonly { value: T; label: string; count?: number | null; tone?: "bad" | "warn" }[];
  onChange: (next: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="exec-seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className="exec-seg-item"
          data-filter={o.value}
          data-active={o.value === value ? "true" : undefined}
          data-tone={o.tone}
          aria-pressed={o.value === value}
          disabled={disabled}
          onClick={() => onChange(o.value)}
        >
          {o.label}
          {o.count !== undefined && o.count !== null ? <span className="exec-seg-count">{o.count}</span> : null}
        </button>
      ))}
    </div>
  );
}
