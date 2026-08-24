/**
 * The shared page anatomy — EL-V2-02 (handoff §6, §7.1, §9).
 *
 * Seven responsibilities, one home each. Names may differ from the handoff;
 * responsibilities may not disappear:
 *
 *   ExecutionWorkspace        outer frame: constrained width, canvas + rail grid
 *   ExecutionPageHeader       masthead: name · short id · separate state badges ·
 *                             one purpose line · one primary action (§6.1)
 *   ExecutionDecisionStrip    the KPI strip — same level on every screen
 *   ExecutionTabs             a stable navigation layer, URL-persisted (§6.2)
 *   ExecutionContextRail      next decision → blockers → freshness → alerts →
 *                             provenance, in that order, following the tab (§6.3)
 *   ExecutionProvenanceDrawer full digests behind a disclosure with Copy (§7.1)
 *   ExecutionTerminal         a bounded evidence surface with typed rows (§9)
 *
 * Every visible control here REQUIRES its handler in the type (the EL-V2-03
 * principle applied a phase early): a tab strip without `onChange` does not
 * compile, so a preview cannot mount an enabled no-op by forgetting a prop.
 */
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";

/* -------------------------------------------------------------------------
 * Workspace
 * ---------------------------------------------------------------------- */

export type ExecutionLayout = "sparse" | "balanced" | "dense";

/**
 * Density by information shape (§6.4). `sparse` narrows the measure instead
 * of stretching three facts across 1,500px; `dense` gives tables and charts
 * the whole canvas with a locally sticky toolbar; `balanced` is the 8/4 grid
 * the Paper reference slice uses.
 */
export function ExecutionWorkspace({
  layout = "balanced",
  rail,
  children,
}: {
  layout?: ExecutionLayout;
  /** The contextual right rail. Sticky at ≥1280px, inline below. */
  rail?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="exec-ws" data-layout={layout} data-has-rail={rail ? "true" : "false"}>
      <div className="exec-ws-canvas">{children}</div>
      {rail ? <aside className="exec-ws-rail" aria-label="Context">{rail}</aside> : null}
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Page header (masthead, §6.1)
 * ---------------------------------------------------------------------- */

export interface HeaderBadge {
  label: string;
  /** Separate axes are separate badges — never merged into one status. */
  axis: "stage" | "runtime" | "readiness" | "broker-sync" | "other";
  tone?: "good" | "warn" | "bad" | "mute";
}

export function ExecutionPageHeader({
  title,
  id,
  badges = [],
  purpose,
  primaryAction,
  secondary,
}: {
  /** Human-readable entity name. */
  title: ReactNode;
  /** Short immutable id, rendered in the meta role beside the name. */
  id?: string | null;
  badges?: HeaderBadge[];
  /** One sentence of purpose/scope, when needed. Not policy prose. */
  purpose?: ReactNode;
  /** Exactly one primary action, or none. */
  primaryAction?: ReactNode;
  /** At most one overflow/secondary group. */
  secondary?: ReactNode;
}) {
  return (
    <header className="exec-masthead">
      <div className="exec-masthead-identity">
        <h1 className="exec-role-title exec-page-title">
          {title}
          {id ? <span className="exec-role-meta exec-page-title-id"> {id}</span> : null}
        </h1>
        {badges.length > 0 ? (
          <div className="exec-masthead-badges">
            {badges.map((b) => (
              <span
                key={`${b.axis}:${b.label}`}
                className="exec-chip"
                data-tone={b.tone ?? "mute"}
                data-axis={b.axis}
              >
                {b.label}
              </span>
            ))}
          </div>
        ) : null}
        {purpose ? <p className="exec-role-body exec-masthead-purpose">{purpose}</p> : null}
      </div>
      {primaryAction || secondary ? (
        <div className="exec-masthead-actions">
          {primaryAction}
          {secondary}
        </div>
      ) : null}
    </header>
  );
}

/* -------------------------------------------------------------------------
 * Decision strip (KPI)
 * ---------------------------------------------------------------------- */

export interface DecisionMetric {
  label: string;
  /** Already-formatted exact value, or `null` when unpublished — rendered as such, never as 0. */
  value: string | null;
  unit?: string | null;
  /** A one-word qualifier in the meta role (e.g. "STALE 47s", "/ 2.00%"). */
  note?: string | null;
  tone?: "good" | "warn" | "bad";
}

export function ExecutionDecisionStrip({ metrics }: { metrics: DecisionMetric[] }) {
  return (
    <div className="exec-strip" role="list">
      {metrics.map((m) => (
        <div className="exec-strip-cell" role="listitem" key={m.label} data-tone={m.tone}>
          <span className="exec-role-th exec-strip-label">{m.label}</span>
          {m.value === null ? (
            <span className="exec-role-meta exec-strip-absent">not published</span>
          ) : (
            <span className="exec-role-kpi">
              {m.value}
              {m.unit ? <span className="exec-role-meta exec-value-unit"> {m.unit}</span> : null}
            </span>
          )}
          {m.note ? <span className="exec-role-meta exec-strip-note">{m.note}</span> : null}
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Tabs (§6.2)
 * ---------------------------------------------------------------------- */

export interface ExecutionTab {
  key: string;
  label: string;
  /** Shown only when authoritative and useful (e.g. `Orders 12`). */
  count?: number | null;
}

export function ExecutionTabs({
  tabs,
  active,
  onChange,
  urlKey,
  label = "Sections",
  children,
}: {
  tabs: ExecutionTab[];
  active: string;
  /** Required: a tab that cannot switch content must not render enabled. */
  onChange: (key: string) => void;
  /**
   * When set, the selected tab is mirrored into `location.hash` as
   * `#<urlKey>=<tab>` so a deep link lands on the right panel (§6.2).
   */
  urlKey?: string;
  label?: string;
  /** The panel content for the active tab. */
  children: ReactNode;
}) {
  const uid = useId();
  const stripRef = useRef<HTMLDivElement>(null);

  // Deep-link in: read the hash once on mount. Deep-link out: write it on
  // change. Both are guarded by `urlKey`, so a tab strip inside a drawer never
  // fights the page's own hash.
  useEffect(() => {
    if (!urlKey || typeof window === "undefined") return;
    const m = new RegExp(`(?:^#|&)${urlKey}=([^&]+)`).exec(window.location.hash);
    const wanted = m?.[1];
    if (wanted && wanted !== active && tabs.some((t) => t.key === wanted)) onChange(wanted);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlKey]);

  useEffect(() => {
    if (!urlKey || typeof window === "undefined") return;
    const rest = window.location.hash
      .replace(/^#/, "")
      .split("&")
      .filter((part) => part && !part.startsWith(`${urlKey}=`));
    const next = `#${[...rest, `${urlKey}=${active}`].join("&")}`;
    if (window.location.hash !== next) window.history.replaceState(null, "", next);
  }, [urlKey, active]);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      const index = tabs.findIndex((t) => t.key === active);
      if (index < 0) return;
      const delta = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
      if (!delta) return;
      event.preventDefault();
      const next = tabs[(index + delta + tabs.length) % tabs.length];
      onChange(next.key);
      const el = stripRef.current?.querySelector<HTMLElement>(`[data-tab="${next.key}"]`);
      el?.focus();
    },
    [tabs, active, onChange],
  );

  return (
    <div className="exec-tabs">
      <div className="exec-tabs-strip" role="tablist" aria-label={label} ref={stripRef} onKeyDown={onKeyDown}>
        {tabs.map((t) => {
          const selected = t.key === active;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              id={`${uid}-tab-${t.key}`}
              aria-selected={selected}
              aria-controls={`${uid}-panel`}
              tabIndex={selected ? 0 : -1}
              data-tab={t.key}
              data-active={selected ? "true" : undefined}
              className="exec-role-control exec-tab"
              onClick={() => onChange(t.key)}
            >
              {t.label}
              {typeof t.count === "number" ? <span className="exec-role-meta exec-tab-count"> {t.count}</span> : null}
            </button>
          );
        })}
      </div>
      <div className="exec-tabs-panel" role="tabpanel" id={`${uid}-panel`} aria-labelledby={`${uid}-tab-${active}`}>
        {children}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Contextual right rail (§6.3)
 * ---------------------------------------------------------------------- */

export interface RailBlocker {
  /** Named, not merely counted. */
  label: string;
  detail?: string | null;
  severity: "blocking" | "watch";
}

export function ExecutionContextRail({
  next,
  blockers = [],
  freshness,
  alerts,
  provenance,
}: {
  /** What this screen is for, and its primary action. */
  next: { title: string; detail?: ReactNode; action?: ReactNode };
  blockers?: RailBlocker[];
  /** Compact authority/freshness summary. */
  freshness?: ReactNode;
  /** Alerts/incidents relevant to the current entity. */
  alerts?: ReactNode;
  /** The provenance disclosure (see ExecutionProvenanceDrawer). */
  provenance?: ReactNode;
}) {
  return (
    <div className="exec-rail">
      <section className="exec-rail-section" data-section="next">
        <h2 className="exec-role-section">{next.title}</h2>
        {next.detail ? <div className="exec-role-body">{next.detail}</div> : null}
        {next.action ? <div className="exec-rail-action">{next.action}</div> : null}
      </section>
      <section className="exec-rail-section" data-section="blockers">
        <h3 className="exec-role-th">Blockers &amp; conditions</h3>
        {blockers.length === 0 ? (
          <p className="exec-role-body exec-rail-none">None named.</p>
        ) : (
          <ul className="exec-rail-blockers">
            {blockers.map((b) => (
              <li key={b.label} data-severity={b.severity}>
                <span className="exec-role-meta exec-rail-severity">{b.severity === "blocking" ? "BLOCKING" : "WATCH"}</span>
                <span className="exec-role-body">{b.label}</span>
                {b.detail ? <span className="exec-role-meta">{b.detail}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
      {freshness ? (
        <section className="exec-rail-section" data-section="freshness">
          <h3 className="exec-role-th">Source &amp; freshness</h3>
          {freshness}
        </section>
      ) : null}
      {alerts ? (
        <section className="exec-rail-section" data-section="alerts">
          <h3 className="exec-role-th">Alerts</h3>
          {alerts}
        </section>
      ) : null}
      {provenance ? (
        <section className="exec-rail-section" data-section="provenance">
          {provenance}
        </section>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Provenance drawer (§7.1)
 * ---------------------------------------------------------------------- */

export interface ProvenanceItem {
  label: string;
  /** Short display form, e.g. `9f3c1a…e2`. */
  short: string;
  /** The full value, copied on request. Never rendered by default. */
  full?: string | null;
  href?: string | null;
}

/** `abcdef…89` — head 6, tail 2 — never the full digest in default chrome. */
export function shortDigest(full: string): string {
  const body = full.replace(/^sha256:/, "");
  if (body.length <= 10) return full;
  return `${full.startsWith("sha256:") ? "sha256:" : ""}${body.slice(0, 6)}…${body.slice(-2)}`;
}

export function ExecutionProvenanceDrawer({
  items,
  title = "Provenance",
  onCopy,
}: {
  items: ProvenanceItem[];
  title?: string;
  /** Required so the Copy control is never an enabled no-op. */
  onCopy: (full: string) => void;
}) {
  return (
    <details className="exec-provenance">
      <summary className="exec-role-th">{title}</summary>
      <dl className="exec-provenance-list">
        {items.map((it) => (
          <div key={it.label} className="exec-provenance-row">
            <dt className="exec-role-th">{it.label}</dt>
            <dd>
              {it.href ? (
                <a className="exec-role-meta" href={it.href}>{it.short}</a>
              ) : (
                <span className="exec-role-meta">{it.short}</span>
              )}
              {it.full ? (
                <button
                  type="button"
                  className="exec-role-control exec-btn-ghost exec-provenance-copy"
                  onClick={() => onCopy(it.full as string)}
                  aria-label={`Copy full ${it.label}`}
                >
                  Copy full
                </button>
              ) : null}
            </dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

/* -------------------------------------------------------------------------
 * Terminal (§9)
 * ---------------------------------------------------------------------- */

export type TerminalPhase = "PLAN" | "APPLY" | "VERIFY" | "EVENT" | "GAP" | "RECONNECT" | "ERROR";

export interface TerminalRow {
  ts: string;
  phase: TerminalPhase;
  object: string;
  message: string;
  /** Text + icon, never colour alone. */
  severity?: "ok" | "warn" | "bad" | "info";
}

/**
 * The only status a terminal may call success. `ACCEPTED` is the 202 — an
 * operation exists and nothing is known about its outcome; the terminal
 * shows it as exactly that and nothing greener.
 */
export type TerminalVerdict = "PENDING" | "ACCEPTED" | "VERIFIED" | "PARTIAL" | "UNCERTAIN" | "FAILED";

const VERDICT_TEXT: Record<TerminalVerdict, string> = {
  PENDING: "pending",
  ACCEPTED: "202 accepted — not success yet",
  VERIFIED: "VERIFIED — terminal state confirmed",
  PARTIAL: "PARTIAL — residue must be resolved",
  UNCERTAIN: "UNCERTAIN — escalate",
  FAILED: "FAILED",
};

const SEVERITY_ICON: Record<NonNullable<TerminalRow["severity"]>, string> = {
  ok: "✓",
  warn: "!",
  bad: "✕",
  info: "·",
};

export function ExecutionTerminal({
  title,
  rows,
  verdict,
  source,
  following,
  onToggleFollow,
  onCopy,
  onExport,
  onClear,
  expanded = false,
  onToggleExpand,
}: {
  title: string;
  rows: TerminalRow[];
  verdict: TerminalVerdict;
  /** e.g. `command journal · op_1251`. */
  source: string;
  following: boolean;
  onToggleFollow: () => void;
  /** Receives the full transcript as text. */
  onCopy: (text: string) => void;
  onExport: (rows: TerminalRow[]) => void;
  /** Clears the LOCAL view only; the journal is append-only elsewhere. */
  onClear: () => void;
  expanded?: boolean;
  onToggleExpand?: () => void;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState("");

  useEffect(() => {
    if (following && bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [rows.length, following]);

  const transcript = rows.map((r) => `${r.ts}  ${r.phase.padEnd(9)} ${r.object.padEnd(14)} ${r.message}`).join("\n");

  return (
    <section className="exec-term" data-expanded={expanded ? "true" : "false"} data-verdict={verdict}>
      <header className="exec-term-toolbar">
        <span className="exec-role-section exec-term-title">{title}</span>
        <span className="exec-role-meta exec-term-verdict" data-verdict={verdict}>
          {VERDICT_TEXT[verdict]}
        </span>
        <span className="exec-role-meta exec-term-source">{source}</span>
        <span className="exec-term-controls">
          <button type="button" className="exec-role-control exec-btn-ghost" onClick={onToggleFollow} aria-pressed={following}>
            {following ? "Pause" : "Follow"}
          </button>
          <button
            type="button"
            className="exec-role-control exec-btn-ghost"
            onClick={() => onCopy(selection || transcript)}
            aria-label={selection ? "Copy selected" : "Copy full"}
          >
            {selection ? "Copy selected" : "Copy full"}
          </button>
          <button type="button" className="exec-role-control exec-btn-ghost" onClick={() => onExport(rows)}>
            Export
          </button>
          <button type="button" className="exec-role-control exec-btn-ghost" onClick={onClear}>
            Clear view
          </button>
          {onToggleExpand ? (
            <button type="button" className="exec-role-control exec-btn-ghost" onClick={onToggleExpand} aria-pressed={expanded}>
              {expanded ? "Collapse" : "Expand"}
            </button>
          ) : null}
        </span>
      </header>
      <div
        className="exec-term-body"
        ref={bodyRef}
        onMouseUp={() => setSelection(window.getSelection()?.toString() ?? "")}
      >
        <table className="exec-term-table">
          <thead className="sr-only">
            <tr>
              <th scope="col">time</th>
              <th scope="col">phase</th>
              <th scope="col">object</th>
              <th scope="col">message</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.ts}-${i}`} className="exec-role-term exec-term-row" data-phase={r.phase} data-severity={r.severity}>
                <td className="exec-term-ts">{r.ts}</td>
                <td className="exec-term-phase">{r.phase}</td>
                <td className="exec-term-object">{r.object}</td>
                <td className="exec-term-msg">
                  {r.severity ? (
                    <span className="exec-term-sev" aria-label={r.severity}>
                      {SEVERITY_ICON[r.severity]} {r.severity.toUpperCase()}
                    </span>
                  ) : null}{" "}
                  {r.message}
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr className="exec-role-term exec-term-row">
                <td colSpan={4} className="exec-term-empty">no rows in view</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
