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
 * body) a Close the reader triggered (Close button, Esc, scrim) lands on the first table row
 * control, else the main landmark, so focus is never lost. An unmount that is not such a close
 * (a link inside the panel changing the route, a dev StrictMode cleanup) never moves focus to the
 * fallback. Esc closes in both modes; the overlay also traps Tab.
 *
 * Not `.exec-drawer*`: that namespace belongs to CommandPlanDrawer.
 */
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";

import "./css/dock.css";
import { QuietIds } from "./blocks/QuietIds";
import { withoutOrigin } from "./backTo";
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
  /**
   * Closes without leaving a duplicate entry. When the open pushed this entry in
   * this session and the entry before it is the same page without `sel`, Back is
   * taken (history goes [A] rather than [A, A]); otherwise (a deep link, a switch
   * from one row to another, a filter changed while open) `sel` is replaced away.
   */
  close(): void;
}

const withoutSel = (search: string): string => {
  const next = new URLSearchParams(search);
  next.delete("sel");
  return next.toString();
};

interface PushedEntry {
  /** The history entry the open created. */
  key: string;
  /** What the entry before it showed: same page, same query, no `sel`. */
  pathname: string;
  search: string;
}

export function useDockSelection(): DockSelection {
  const { value, set } = useExecUrlState();
  const location = useLocation();
  const navigate = useNavigate();
  const here = useRef(location);
  here.current = location;
  // `select` notes the entry it leaves; the render that follows names the entry it made.
  const pending = useRef<{ fromKey: string; pathname: string; search: string } | null>(null);
  const pushed = useRef<PushedEntry | null>(null);

  useEffect(() => {
    const waiting = pending.current;
    if (waiting === null || location.key === waiting.fromKey) return;
    pending.current = null;
    pushed.current = { key: location.key, pathname: waiting.pathname, search: waiting.search };
  }, [location.key]);

  const select = useCallback(
    (id: string) => {
      const at = here.current;
      const current = new URLSearchParams(at.search).get("sel");
      if (current === id) return;
      pushed.current = null;
      // Only an open from "nothing selected" can be undone by Back; switching rows leaves a `sel` behind.
      pending.current = current === null ? { fromKey: at.key, pathname: at.pathname, search: withoutSel(at.search) } : null;
      set({ sel: id });
    },
    [set],
  );
  const close = useCallback(() => {
    const at = here.current;
    const entry = pushed.current;
    if (entry !== null && entry.key === at.key && entry.pathname === at.pathname && entry.search === withoutSel(at.search)) {
      pushed.current = null;
      navigate(-1);
      return;
    }
    set({ sel: null }, { replace: true });
  }, [set, navigate]);
  return { selection: value.sel, select, close };
}

// `summary` is a tab stop (a disclosure); without it the trap wraps at the last button and a disclosure after it is unreachable.
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

/**
 * A control inside a closed disclosure is not a tab stop (only the disclosure's own summary is). Left in the list it can be the
 * "last" control, so Tab from the last reachable one never matches it and walks out of the modal.
 */
function reachable(el: HTMLElement): boolean {
  const closed = el.closest("details:not([open])");
  return closed === null || (el.tagName === "SUMMARY" && el.parentElement === closed);
}

function tabStops(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(reachable);
}

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

/**
 * The control the reader last pressed. Safari and Firefox on macOS do not focus a button on press, so when the panel
 * opens from that press `document.activeElement` is still <body> and the opener would be unknown: Esc and Close would
 * both fall back to the page. The press is noted in the capture phase (before any handler opens the panel) and is only
 * trusted when the panel opens within the same gesture (`PRESS_WINDOW_MS`), so a panel opened from the URL never
 * adopts an old click.
 */
const PRESS_WINDOW_MS = 400;
const CONTROL = 'button, a[href], [role="button"], [tabindex]:not([tabindex="-1"])';
let lastPress: { el: HTMLElement; at: number } | null = null;
if (typeof document !== "undefined") {
  document.addEventListener(
    "click",
    (event) => {
      const control = event.target instanceof Element ? event.target.closest<HTMLElement>(CONTROL) : null;
      lastPress = control ? { el: control, at: performance.now() } : null;
    },
    true,
  );
}

/** The element focus returns to: what had focus when the panel opened, else the control pressed to open it. */
function findOpener(): HTMLElement | null {
  const active = document.activeElement;
  if (active instanceof HTMLElement && active !== document.body) return active;
  const press = lastPress;
  if (press !== null && press.el.isConnected && performance.now() - press.at < PRESS_WINDOW_MS) return press.el;
  return null;
}

/** Where focus goes on close when nothing opened the panel: the first table row control, else main. */
function focusFallback(): void {
  const row = document.querySelector<HTMLElement>('table tbody tr[tabindex="0"], table tbody a[href], table tbody button:not([disabled])');
  if (row) {
    row.focus({ preventScroll: true });
    return;
  }
  const main = document.querySelector<HTMLElement>("main, [role='main']");
  if (!main) return;
  // The landmark is only focusable for this one landing: the tabindex it needed is removed on blur.
  if (!main.hasAttribute("tabindex")) {
    main.setAttribute("tabindex", "-1");
    main.addEventListener("blur", () => main.removeAttribute("tabindex"), { once: true });
  }
  main.focus({ preventScroll: true });
}

export function Drawer({ open = true, onClose, title, subtitle, children, actions, priority, mode = "dock", focusOnOpen = true }: DrawerProps) {
  const titleId = useId();
  const panel = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const focusRef = useRef(focusOnOpen);
  focusRef.current = focusOnOpen;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  // Set by the controls that close the panel on the reader's say-so; read by the effect cleanup.
  const userClosed = useRef(false);
  const requestClose = useCallback(() => {
    userClosed.current = true;
    closeRef.current();
  }, []);

  // Focus in on open, back out on close. The opener is read before focus moves;
  // it is skipped when the panel was opened from the URL (focus is on body).
  useEffect(() => {
    if (!open) return;
    userClosed.current = false;
    const opener = findOpener();
    // Docked, the panel sits beside the page: moving focus into it must not scroll the page under it.
    if (focusRef.current) panel.current?.focus({ preventScroll: modeRef.current === "dock" });
    return () => {
      // Only if nobody has moved focus on purpose in the meantime.
      const active = document.activeElement;
      if (active && active !== document.body) return;
      if (opener && opener !== document.body && opener.isConnected) opener.focus();
      else if (userClosed.current) focusFallback();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) requestClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, requestClose]);

  // A modal holds Tab even when focus is still on the page behind it (the panel opened by itself, or the window was
  // narrowed under an open docked pane): the first Tab lands in the dialog instead of on controls under the scrim.
  const modalOpen = open && mode === "overlay";
  useEffect(() => {
    if (!modalOpen) return;
    const onTab = (event: KeyboardEvent) => {
      const el = panel.current;
      if (event.key !== "Tab" || event.defaultPrevented || !el) return;
      const active = document.activeElement;
      if (active instanceof Node && el.contains(active)) return;
      const items = tabStops(el);
      const target = event.shiftKey ? items[items.length - 1] : items[0];
      if (!target) return;
      event.preventDefault();
      target.focus();
    };
    document.addEventListener("keydown", onTab, true);
    return () => document.removeEventListener("keydown", onTab, true);
  }, [modalOpen]);

  if (!open) return null;

  const overlay = mode === "overlay";

  // A modal dialog must not let Tab leave it.
  const trap = (event: ReactKeyboardEvent) => {
    if (!overlay || event.key !== "Tab" || !panel.current) return;
    const items = tabStops(panel.current);
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
      {overlay ? <div className="exec-dock-scrim" aria-hidden="true" onClick={requestClose} /> : null}
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
          <button type="button" className="exec-dock-close" onClick={requestClose}>Close</button>
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
  /**
   * The reason is already printed by a sibling action of the same footer: keep it as the button's description for assistive tech,
   * draw it once. The button stays disabled and described.
   */
  quietReason?: boolean;
  /** The name printed before a reason that several actions share ("Disable, Archive"). Default: this action's label. */
  reasonLabel?: string;
  /** The key that does this action elsewhere on the page (hi-fi: a small "A" chip on Approve). Drawn as generated content, so the button's text and name stay its label; named by `aria-keyshortcuts`. */
  keyHint?: string;
}

const NOT_OFFERED = "Not offered in the portal yet.";

export function DockAction({ label, onAction, reason, accessHref, accessLabel = "My access", variant = "default", quietReason = false, reasonLabel, keyHint }: DockActionProps) {
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
        aria-keyshortcuts={keyHint}
        // The chip is generated content (`data-key`), so the button's text stays its label; the name is pinned for the same reason.
        aria-label={keyHint ? label : undefined}
        data-key={keyHint}
        onClick={blocked ? undefined : onAction}
      >
        {label}
      </button>
      {blocked && quietReason ? <p id={reasonId} className="exec-dock-sr">{text}</p> : null}
      {blocked && !quietReason ? (
        <div className="exec-dock-why" data-l={reasonLabel ?? label}>
          <p id={reasonId} className="exec-dock-reason"><QuietIds text={text} /></p>
          {accessHref ? <Link className="exec-dock-access" to={withContext(accessHref, withoutOrigin(params))} aria-label={`${accessLabel}: ${label}`}>{accessLabel}</Link> : null}
        </div>
      ) : null}
    </div>
  );
}
