/**
 * Tabs (hi-fi modules/stage.js `G.tabs`): one tablist for the stage screens, value in `?tab=`.
 *
 * Two parts, so a screen can pick:
 * - `Tabs` is controlled and knows no router: the tablist and the one active
 *   `tabpanel`. ArrowLeft/ArrowRight wrap, Home and End jump, focus follows the
 *   selection (automatic activation, as the Account 360 and Access tabs do), only the
 *   active tab is in the tab order (roving tabindex) and every tab names the panel in
 *   `aria-controls`.
 * - `useUrlTab(surface)` / `UrlTabs` bind it to `?tab=` through `tabAliases.ts`: the hi-fi
 *   slug is the key, a V1 label or a review2/07 short slug is accepted and rewritten with
 *   `replace`, a value that matches nothing opens the default tab and says so in one line
 *   (D3). The default tab stays out of the URL. Choosing a tab pushes a history entry, so
 *   Back returns to the previous tab.
 *
 * Account360 and Access keep their own tablists (their behaviour is not changed here):
 * they predate this block and lack Home/End and aliases. New screens use this one.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";

import { applyTab, resolveTab, type TabSurface } from "../tabAliases";
import "../css/stage.css";

export interface StageTab {
  /** The slug that goes in `?tab=`. */
  id: string;
  label: string;
  /** A published count, printed as `(7)` after the label. Absent or null prints nothing, never `(0)`. */
  count?: number | null;
}

export interface TabsProps {
  tabs: readonly StageTab[];
  /** The active tab id. A value that is not in `tabs` shows the first tab. */
  value: string;
  onChange(id: string): void;
  /** Accessible name of the tablist, e.g. "Sandbox certification sections". */
  label: string;
  /** The active panel's content. */
  children?: ReactNode;
  /** One line shown above the panel (the unknown-tab notice). */
  notice?: string | null;
}

const isCount = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n >= 0;

/** Tablist plus the active panel. */
export function Tabs({ tabs, value, onChange, label, children, notice }: TabsProps) {
  const base = useId();
  const refs = useRef(new Map<string, HTMLButtonElement>());
  const active = tabs.some((tab) => tab.id === value) ? value : (tabs[0]?.id ?? "");

  const move = (event: KeyboardEvent<HTMLDivElement>) => {
    const origin = event.target instanceof Element ? event.target.closest('[role="tab"]') : null;
    const from = tabs.findIndex((tab) => refs.current.get(tab.id) === origin);
    const at = from >= 0 ? from : Math.max(0, tabs.findIndex((tab) => tab.id === active));
    let to = at;
    if (event.key === "ArrowRight") to = (at + 1) % tabs.length;
    else if (event.key === "ArrowLeft") to = (at - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = tabs.length - 1;
    else return;
    event.preventDefault();
    const next = tabs[to];
    if (!next) return;
    onChange(next.id);
    refs.current.get(next.id)?.focus();
  };

  return (
    <div>
      <div className="exec-stage-tabs" role="tablist" aria-label={label} onKeyDown={move}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            ref={(node) => {
              if (node) refs.current.set(tab.id, node);
              else refs.current.delete(tab.id);
            }}
            type="button"
            role="tab"
            id={`${base}-tab-${tab.id}`}
            className="exec-stage-tab"
            aria-selected={tab.id === active}
            aria-controls={`${base}-panel`}
            tabIndex={tab.id === active ? 0 : -1}
            onClick={() => onChange(tab.id)}
          >
            {tab.label}
            {isCount(tab.count) ? (
              <>
                {" "}
                <span className="exec-stage-tab-count">({tab.count})</span>
              </>
            ) : null}
          </button>
        ))}
      </div>
      {notice ? <p className="exec-stage-notice" role="status">{notice}</p> : null}
      <div role="tabpanel" id={`${base}-panel`} aria-labelledby={`${base}-tab-${active}`} className="exec-stage-panel">
        {children}
      </div>
    </div>
  );
}

export interface UrlTab {
  /** The canonical tab id to show. */
  value: string;
  /** One line when `?tab=` matched nothing; it outlives the URL rewrite and clears on the next choice. */
  notice: string | null;
  /** Choose a tab: writes `?tab=` (the default tab is removed from the URL). */
  set(id: string): void;
}

/**
 * `?tab=` for a stage surface. A V1 label or a short slug is resolved and the URL is rewritten with
 * `replace`; an unknown value reads as the default tab and the URL is cleaned. Every other param is kept.
 * Alias anchors (`#...`) are not used by the stage surfaces and are ignored.
 */
export function useUrlTab(surface: TabSurface): UrlTab {
  const [params, setParams] = useSearchParams();
  const raw = params.get("tab");
  const resolution = useMemo(() => resolveTab(surface, raw), [surface, raw]);
  const [seen, setSeen] = useState<string | null>(null);

  useEffect(() => {
    if (resolution.notice !== null) setSeen(resolution.notice);
    const { search } = applyTab(surface, params, resolution);
    if (search.toString() !== params.toString()) setParams(search, { replace: true });
  }, [surface, params, resolution, setParams]);

  const set = useCallback(
    (id: string) => {
      setSeen(null);
      setParams(applyTab(surface, params, resolveTab(surface, id)).search);
    },
    [surface, params, setParams],
  );

  return { value: resolution.target.tab, notice: resolution.notice ?? seen, set };
}

export interface UrlTabsProps {
  surface: TabSurface;
  tabs: readonly StageTab[];
  label: string;
  /** Receives the canonical active id; return the active panel's content. */
  children: (active: string) => ReactNode;
}

/** `Tabs` bound to `?tab=`. */
export function UrlTabs({ surface, tabs, label, children }: UrlTabsProps) {
  const url = useUrlTab(surface);
  return (
    <Tabs tabs={tabs} value={url.value} onChange={url.set} label={label} notice={url.notice}>
      {children(url.value)}
    </Tabs>
  );
}
