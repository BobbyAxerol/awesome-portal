/**
 * Drawer — the one peek panel every V2 screen opens (review2/06, 07).
 *
 * Open state lives in the `sel` URL param, so a link to a selected row works
 * and Back closes what Back opened. The panel itself is controlled: callers
 * pass `open` and `onClose`, usually from `useDockSelection()`.
 *
 * Two shapes, one component. Wide screens dock it beside the table (380px,
 * `complementary`); below 1500px it overlays the page behind a scrim and is a
 * modal `dialog`. The caller picks with `mode`, normally from `useDockMode()`,
 * so the ARIA role and the CSS (`data-mode`) can never disagree the way a pure
 * media query would.
 *
 * Focus: moves into the panel on open and goes back to whatever opened it on
 * close. A panel opened by the screen itself, not by the reader (`focusOnOpen={false}`),
 * leaves focus where it was (WCAG 2.4.3). When there was no opener (focus was on the page
 * body) Close lands on the first table row control, else the main landmark, so focus is
 * never lost. Esc closes in both modes; the overlay also traps Tab.
 *
 * Not `.exec-drawer*`: that namespace belongs to CommandPlanDrawer.
 */
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";

import "./css/dock.css";
import { useExecUrlState, withContext } from "./urlState";

export type DockMode = "dock" | "overlay";

/** Below this width the table no longer fits beside a 380px panel (kit.css). */
const OVERLAY_QUERY = "(max-width: 1500px)";

/** `dock` where the browser cannot tell (jsdom, SSR): the wide layout is the default. */
export function useDockMode(): DockMode {
  const query = () => (typeof window.matchMedia === "function" ? window.matchMedia(OVERLAY_QUERY) : null);
  const [overlay, setOverlay] = useState(() => query()?.matches ?? false);
  useEffect(() => {
    const list = query();
    if (!list) return;
    const sync = () => setOverlay(list.matches);
    sync();
    list.addEventListener("change", sync);
    return () => list.removeEventListener("change", sync);
  }, []);
  return overlay ? "overlay" : "dock";
}

export interface DockSelection {
  /** The `sel` param, or null when nothing is selected or the value was invalid. */
  selection: string | null;
  /** Pushes, so Back closes the panel. */
  select(id: string): void;
  /** Replaces, so closing leaves no extra history entry that would reopen it. */
  close(): void;
}

export function useDockSelection(): DockSelection {
  const { value, set } = useExecUrlState();
  const select = useCallback((id: string) => set({ sel: id }), [set]);
  const close = useCallback(() => set({ sel: null }, { replace: true }), [set]);
  return { selection: value.sel, select, close };
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface DrawerProps {
  /** Rendered only while true. Defaults to true so `{selection ? <Drawer/> : null}` also works. */
  open?: boolean;
  onClose: () => void;
  title: string;
  /** Text, or a Flag with text (INC-7); it sits in a `<p>`, so inline content only. */
  subtitle?: ReactNode;
  children: ReactNode;
  /**
   * Footer, usually `DockAction`s: one row of buttons, then one line per blocked
   * action. The footer is capped at a quarter of the viewport and scrolls.
   */
  actions?: ReactNode;
  /**
   * Content placed at the top of the body, above `children`, set off by a rule.
   * For what the reader must not have to scroll to: a screen whose facts table
   * is long passes its "Not published" block (or any state that explains what
   * is missing) here instead of putting it last. Absent = nothing is drawn.
   */
  priority?: ReactNode;
  mode?: DockMode;
  /**
   * Move focus into the panel when it opens. Default true. A screen that opens the panel on its
   * own (nobody asked for it) passes false so a reader who has not moved yet is not pulled away.
   */
  focusOnOpen?: boolean;
}

/** Where focus goes on close when nothing opened the panel: the first table row control, else main. */
function fallbackFocusTarget(): HTMLElement | null {
  const row = document.querySelector<HTMLElement>('table tbody tr[tabindex="0"], table tbody a[href], table tbody button:not([disabled])');
  if (row) return row;
  const main = document.querySelector<HTMLElement>("main, [role='main']");
  if (main && !main.hasAttribute("tabindex")) main.setAttribute("tabindex", "-1");
  return main;
}

export function Drawer({ open = true, onClose, title, subtitle, children, actions, priority, mode = "dock", focusOnOpen = true }: DrawerProps) {
  const titleId = useId();
  const panel = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const focusRef = useRef(focusOnOpen);
  focusRef.current = focusOnOpen;

  // Focus in on open, back out on close. The opener is read before focus moves;
  // it is skipped when the panel was opened from the URL (focus is on body).
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (focusRef.current) panel.current?.focus();
    return () => {
      // Only if nobody has moved focus on purpose in the meantime.
      const active = document.activeElement;
      if (active && active !== document.body) return;
      if (opener && opener !== document.body && opener.isConnected) opener.focus();
      else fallbackFocusTarget()?.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) closeRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;

  const overlay = mode === "overlay";

  // A modal dialog must not let Tab leave it.
  const trap = (event: ReactKeyboardEvent) => {
    if (!overlay || event.key !== "Tab" || !panel.current) return;
    const items = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === panel.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <>
      {overlay ? <div className="exec-dock-scrim" aria-hidden="true" onClick={onClose} /> : null}
      <aside
        ref={panel}
        className="exec-dock"
        data-mode={mode}
        role={overlay ? "dialog" : "complementary"}
        aria-modal={overlay ? "true" : undefined}
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={trap}
      >
        <header className="exec-dock-head">
          <div className="exec-dock-heading">
            <h2 id={titleId} className="exec-dock-title">{title}</h2>
            {subtitle ? <p className="exec-dock-subtitle">{subtitle}</p> : null}
          </div>
          <button type="button" className="exec-dock-close" onClick={onClose}>Close</button>
        </header>
        <div className="exec-dock-body">
          {priority ? <div className="exec-dock-priority">{priority}</div> : null}
          {children}
        </div>
        {actions ? <footer className="exec-dock-actions">{actions}</footer> : null}
      </aside>
    </>
  );
}

export interface DockActionProps {
  label: string;
  onAction?: () => void;
  /**
   * Why the action is unavailable (one short sentence, review2/06 s4.2). Any
   * non-empty reason disables the button; an action with no handler is
   * disabled too, with a default reason, so it never looks live and does nothing.
   */
  reason?: string | null;
  /** D9: where the reader can see which grant is missing. Internal links keep the URL context. */
  accessHref?: string;
  accessLabel?: string;
  variant?: "default" | "primary";
}

const NOT_OFFERED = "Not offered in the portal yet.";

export function DockAction({ label, onAction, reason, accessHref, accessLabel = "My access", variant = "default" }: DockActionProps) {
  const reasonId = useId();
  const [params] = useSearchParams();
  const text = reason?.trim() || (onAction ? "" : NOT_OFFERED);
  const blocked = text !== "";
  return (
    <div className="exec-dock-action">
      <button
        type="button"
        className="exec-dock-btn"
        data-variant={variant}
        disabled={blocked}
        aria-describedby={blocked ? reasonId : undefined}
        onClick={blocked ? undefined : onAction}
      >
        {label}
      </button>
      {blocked ? (
        <div className="exec-dock-why" data-l={label}>
          <p id={reasonId} className="exec-dock-reason" title={text}>{text}</p>
          {accessHref ? <Link className="exec-dock-access" to={withContext(accessHref, params)} aria-label={`${accessLabel}: ${label}`}>{accessLabel}</Link> : null}
        </div>
      ) : null}
    </div>
  );
}
