/**
 * Command palette (⌘K / Ctrl-K).
 *
 * Entries come from the registry — features plus the screens that declare a
 * route. Navigation targets are validated registry routes; the palette never
 * accepts an arbitrary URL from a response (FRONTEND_HANDOFF §5).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { MaturityBadge } from "../components/semantic";
import type { PortalRegistryDocument } from "../portal/contracts";
import { commandPaletteEntries, filterPalette, type NavOptions } from "../portal/navigation";

export function CommandPalette({
  registry,
  options,
  open,
  onClose,
}: {
  registry: PortalRegistryDocument;
  options: NavOptions;
  open: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const entries = useMemo(() => commandPaletteEntries(registry, options), [registry, options]);
  const results = useMemo(() => filterPalette(entries, query), [entries, query]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      inputRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  if (!open) return null;

  const go = (route: string) => {
    onClose();
    navigate(route);
  };

  return (
    <div
      className="portal-palette-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="portal-palette" role="dialog" aria-modal="true" aria-label="Command palette">
        <input
          ref={inputRef}
          className="portal-palette-input"
          value={query}
          placeholder="Search features and screens…"
          aria-label="Search features and screens"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              onClose();
            } else if (event.key === "ArrowDown") {
              event.preventDefault();
              setActive((index) => Math.min(index + 1, results.length - 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActive((index) => Math.max(index - 1, 0));
            } else if (event.key === "Enter" && results[active]) {
              event.preventDefault();
              go(results[active].route);
            }
          }}
        />
        {results.length === 0 ? (
          <div className="portal-palette-empty mono">No matches.</div>
        ) : (
          <ul className="portal-palette-list" role="listbox" aria-label="Results">
            {results.map((entry, index) => (
              <li key={`${entry.kind}:${entry.id}`}>
                <button
                  type="button"
                  role="option"
                  aria-selected={index === active}
                  className={`portal-palette-item${index === active ? " portal-palette-item-active" : ""}`}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => go(entry.route)}
                >
                  <span className="portal-palette-group mono">{entry.group}</span>
                  <span className="portal-palette-label">{entry.label}</span>
                  <MaturityBadge maturity={entry.maturity} />
                  <span className="portal-palette-route mono">{entry.route}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** Registers the ⌘K / Ctrl-K shortcut. */
export function useCommandPaletteShortcut(onOpen: () => void) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onOpen();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onOpen]);
}
