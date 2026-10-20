/**
 * What the backend has not published, said in words, from ONE table.
 *
 * Hoisted from `screens/operations/notPublished.tsx` and the `FE` table in
 * `screens/fleet/fleetModel.ts`, which each kept their own copy. Ids and
 * wording are unchanged; a request that closes changes one line here.
 *
 * A gap is a sentence with its request id, never a dash, a zero or an invented
 * value (D9, review2/04). The ids are the open requests in
 * FRONTEND_BACKEND_SYNC.md.
 */
import { createContext, useContext, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import "../css/blocks.css";

export const NOT_PUBLISHED = "Not published";

/**
 * Request id -> what it asks for. Composite keys are the ids a surface depends
 * on together (the Fleet board needs both the grouping and the lifecycle read).
 */
export const FE_REQUEST_LABEL = {
  "FE-005": "Windowed totals and concentration",
  "FE-006": "Return (methodology per source)",
  "FE-011": "Score",
  "FE-012": "Group by",
  "FE-013": "NAV and drawdown",
  "FE-016": "Export",
  "FE-017": "Capital statements",
  "FE-024": "Since your last visit",
  "FE-015": "Per-row eligibility and the reason a control is off",
  "FE-020": "Command preview (the Preview only intent axis)",
  "FE-021": "Audit source: who did what",
  "FE-025": "Window",
  "FE-027": "Stage lifecycle",
  "FE-026": "Researcher field policy",
  "FE-028": "Gate criteria",
  "FE-029": "Evidence, baseline and run linkage",
  "FE-030": "Creator, ladder, SLA and needs-you",
  "FE-031": "Event feed",
  "FE-032": "Receipt state and amounts",
  "FE-033": "Compare",
  "FE-034": "Archived list",
  "FE-035": "Map",
  // S3 stage screens (plan s8, 2026-10-19). OPEN requests; the ledger rows are in FRONTEND_BACKEND_SYNC.md §6 and the cards in
  // evidence/UXM-07/backend-requests.md. Not yet sent to Codex (D9).
  "FE-066": "Alpha and portfolio names on a deployment",
  "FE-067": "Runtime state (Paper, Sandbox, Canary, Live), reconciliation and sessions",
  "FE-068": "Self-eligibility for stage actions",
  "FE-069": "New request: run list, alpha scope and lookup by request key",
  "FE-070": "VN market session calendar",
  "FE-071": "Canary envelope compliance, rollback checks and trial calendar",
  "FE-072": "Typed stage rows, series and reconciliation figures",
  "FE-012, FE-027": "Board",
  "FE-027, FE-028": "Readiness",
  "FE-027/028": "Stage lifecycle and gate criteria",
} as const;

/** Every id a surface may print inside `Not published (...)`. */
export type NotPublishedId = keyof typeof FE_REQUEST_LABEL;

/** Single request ids only (no composites). */
export type FeId = Extract<NotPublishedId, `FE-${number}`>;

/** The label of a request id, for a tooltip or a legend. */
export function feLabel(id: NotPublishedId): string {
  return FE_REQUEST_LABEL[id];
}

/** `Not published (FE-021)` as plain text, for a table cell or a title. */
export function notPublishedText(id: NotPublishedId): string {
  return `${NOT_PUBLISHED} (${id})`;
}

/** The sentence a disabled control carries (same shape the Operations screen uses). */
export function notPublishedReason(id: NotPublishedId, because: string): string {
  return `${NOT_PUBLISHED} (${id}). ${because}`;
}

/* ── the two legacy shapes, kept so the screens can repoint without rewording ── */

/**
 * The Operations table, role -> id, identical to `FE` in
 * `screens/operations/notPublished.tsx`.
 */
export const FE_OPERATIONS = {
  /** Does the backend keep a command preview at all (the "Preview only" intent axis)? */
  intent: "FE-020",
  /** Who did what: the audit source is unavailable and the queue drops actors on purpose. */
  audit: "FE-021",
  /** creator, ladder, SLA, needs-you: the queue row carries none of them, so there is no assignee to filter by. */
  assignee: "FE-030",
  /** Event feed: incident children and exceptions have no subject feed. */
  events: "FE-031",
  /** Receipt state and amounts: capital receipts are a separate read with their own grain. */
  receipts: "FE-032",
  /** Per-row eligibility and the reason a control is off. */
  eligibility: "FE-015",
} as const satisfies Record<string, NotPublishedId>;

export interface UnpublishedFact {
  fe: NotPublishedId;
  what: string;
}

/** The Fleet table, name -> `{fe, what}`, identical to `FE` in `screens/fleet/fleetModel.ts`. */
export const FE_FLEET = {
  group: { fe: "FE-012", what: "Group by" },
  board: { fe: "FE-012, FE-027", what: "Board" },
  map: { fe: "FE-035", what: "Map" },
  readiness: { fe: "FE-027, FE-028", what: "Readiness" },
  window: { fe: "FE-025", what: "Window" },
  compare: { fe: "FE-033", what: "Compare" },
  archived: { fe: "FE-034", what: "Archived list" },
} as const satisfies Record<string, UnpublishedFact>;

/** `Not published (FE-012, FE-027)` for a Fleet fact. */
export const notPublishedFact = (fact: UnpublishedFact): string => notPublishedText(fact.fe);

/**
 * One panel, one printing of a request id. A panel (`SectionPanel`, `KpiStrip`) opens a scope; the cells that opt in
 * (`Kpi`, `CapGauge`, via `collapsible`) print `Not published (FE-071)` for the FIRST cell of an id in the scope and
 * plain `Not published` for the later ones, whose tooltip still names the id and the request. A cell's own words
 * ("Used", "Consumed") are kept, so a distinct gap is never merged: only the repeated id is. Outside a scope every
 * cell prints its id. The id is never dropped from a panel: if the first cell goes away, the next one prints it.
 */
interface Scope {
  /** Render-time claim: true when `owner` is the first live cell of `id`. */
  claim(id: string, owner: string): boolean;
  release(id: string, owner: string): void;
}
/** `version` changes when the first printing of an id leaves, so consumers re-render (an unchanged `children` element would not). */
const ScopeContext = createContext<{ scope: Scope; version: number } | null>(null);

export function NotPublishedScope({ children }: { children: ReactNode }) {
  const owners = useRef(new Map<string, string[]>());
  const [version, bump] = useState(0);
  const scope = useMemo<Scope>(
    () => ({
      claim(id, owner) {
        const list = owners.current.get(id) ?? [];
        if (!list.includes(owner)) list.push(owner);
        owners.current.set(id, list);
        return list[0] === owner;
      },
      release(id, owner) {
        const list = owners.current.get(id);
        if (!list) return;
        const wasFirst = list[0] === owner;
        const rest = list.filter((o) => o !== owner);
        if (rest.length === 0) owners.current.delete(id);
        else owners.current.set(id, rest);
        // The first printing went away: the next cell must print the id now.
        if (wasFirst && rest.length > 0) bump((n) => n + 1);
      },
    }),
    [],
  );
  const value = useMemo(() => ({ scope, version }), [scope, version]);
  return <ScopeContext.Provider value={value}>{children}</ScopeContext.Provider>;
}

export interface NotPublishedProps {
  /** The request that will publish the value. */
  id: NotPublishedId;
  /** The published reason code, shown as given. */
  reasonCode?: string | null;
  /**
   * The server's reason code for a stage fact (BE-P2/P3 `Fact.reason_code`), carried in the tooltip only: the words stay
   * `Not published (FE-xxx)` and the code is there for whoever asks why. Ignored when `reasonCode` already shows it.
   */
  titleReason?: string | null;
  /** What exactly is missing, in a few words ("Days in stage"). */
  children?: ReactNode;
  /**
   * Repeated gap inside a dense card (the lifecycle spine): only the short label
   * is visible; the full "Not published (id)" stays in the text (visually
   * hidden), and the surface prints the sentence ONCE. Never a way to drop the id.
   */
  compact?: boolean;
  /** Print the id only for the first such cell of the enclosing `NotPublishedScope` (see there). Default false. */
  collapsible?: boolean;
}

/**
 * The stage screens (Workbench, Sandbox, Canary, Live) print a gap as the plain words `Not available`: the request id, its
 * label and the server's reason code sit in a disclosure (`GapWhy`) that opens by keyboard and touch, never only on a hover.
 * Everything below a `CompactGaps` provider reads this; a screen outside one prints `Not published (FE-xxx)` exactly as before.
 */
const CompactGapsContext = createContext(false);

export function CompactGaps({ children }: { children: ReactNode }) {
  return <CompactGapsContext.Provider value={true}>{children}</CompactGapsContext.Provider>;
}

/** What one gap says when asked: `Not published (FE-067): Alpha name · Runtime state ... · REASON_CODE`. */
export function gapTitle(id: string, what?: string | null, reason?: string | null): string {
  const label = Object.hasOwn(FE_REQUEST_LABEL, id) ? FE_REQUEST_LABEL[id as NotPublishedId] : null;
  return `${NOT_PUBLISHED} (${id}): ${[what, label, reason].filter(Boolean).join(" · ")}`;
}

/** The one next-action line of every disclosure: a reader cannot make the source publish, so the line says what will happen. */
export const GAP_NEXT = "It appears here once the source publishes it.";

export interface GapWhyProps {
  /** The control's accessible name. When `text` is the trigger it must start with that text (WCAG 2.5.3). */
  name: string;
  /** The visible trigger. Omitted = the small "?" mark after a line of text. */
  text?: ReactNode;
  /** What the disclosure says, one string per fact: the request id and label, the server's reason code. */
  rows: readonly string[];
  /** `data-gap` of the wrapper: the request id. */
  gap?: string;
  className?: string;
  /** The closing line. Default `GAP_NEXT`; `null` for a disclosure that is a reference (an id), not a gap. */
  next?: string | null;
}

/**
 * The reason, next action and provenance of a missing fact behind ONE disclosure: a real button (`aria-expanded`, and
 * `aria-controls` while open) that opens on Enter, Space and touch and closes on the same or on Escape. Ids and reason codes
 * live inside it, never in the headline. Closed, the body is not in the DOM, so a screen with many gaps adds no text.
 */
export function GapWhy({ name, text, rows, gap, className, next = GAP_NEXT }: GapWhyProps) {
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  const button = useRef<HTMLButtonElement>(null);
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || !open) return;
    // Escape closes this disclosure only: a drawer or dialog around it stays.
    event.stopPropagation();
    setOpen(false);
    button.current?.focus();
  };
  return (
    <span className={className ? `exec-blk-why ${className}` : "exec-blk-why"} data-gap={gap} data-open={open ? "true" : undefined} onKeyDown={onKeyDown}>
      <button
        ref={button}
        type="button"
        className="exec-blk-why-btn"
        data-mark={text === undefined ? "true" : undefined}
        aria-expanded={open}
        aria-controls={open ? bodyId : undefined}
        aria-label={name}
        onClick={() => setOpen((v) => !v)}
      >
        {text}
      </button>
      {open ? (
        <span id={bodyId} className="exec-blk-why-body">
          {rows.map((row, i) => (
            <span key={i} className="exec-blk-why-row">{row}</span>
          ))}
          {next === null ? null : <span className="exec-blk-why-next">{next}</span>}
        </span>
      ) : null}
    </span>
  );
}

export interface NaWhyProps {
  /** The reason the source gave (or the approved sentence for this absence). Empty = nothing to disclose, the plain words only. */
  reason?: string | null;
  /** The visible words. Default `Not available`. */
  text?: string;
  /** `data-gap` / class passthrough for placement. */
  className?: string;
  gap?: string;
}

/**
 * `Not available` with its reason behind a disclosure (RV-06). With no reason it is the plain word (nothing to open); with one
 * it is a `GapWhy` button whose text is still `Not available`, so the cell reads the same and the reason is reachable by
 * keyboard and touch instead of a `title` on a non-focusable span.
 */
export function NaWhy({ reason, text = "Not available", className = "exec-blk-na", gap }: NaWhyProps) {
  if (!reason) return <span className={className} data-gap={gap}>{text}</span>;
  return <GapWhy className={className} gap={gap} text={text} name={`${text}, reason`} rows={[reason]} />;
}

export interface GapItem {
  /** The fact that is missing, in a word or two ("Limit"). */
  label: string;
  /** The request that will publish it; its id and label go in the disclosure. */
  id?: string;
  /** The server's reason, disclosure only. */
  reason?: string | null;
}

/**
 * One compact line for the facts of a panel that are not published: `Not available: Limit, Consumed, Used`. The per-fact
 * request ids and reasons are in one disclosure after the line (a "?" that opens by keyboard and touch), so nothing is
 * dropped and nothing is repeated on screen.
 */
export function GapLine({ items, because }: { items: readonly GapItem[]; because?: string | null }) {
  if (items.length === 0) return null;
  const labels = items.map((item) => item.label).join(", ");
  const rows = items.map((item) => `${item.label}: ${item.id ? gapTitle(item.id, null, item.reason) : `${NOT_PUBLISHED}${item.reason ? ` · ${item.reason}` : ""}`}`);
  return (
    <p className="exec-blk-gaps">
      <span className="exec-blk-gaps-lead">Not available:</span> {labels}
      {because ? <span className="exec-blk-gaps-why"> · {because}</span> : null}
      <GapWhy name={`Why not available: ${labels}`} rows={rows} />
    </p>
  );
}

/** Inline: "Not published (FE-021)" plus what it means. */
export function NotPublished({ id, reasonCode, titleReason, children, compact = false, collapsible = false }: NotPublishedProps) {
  const compactGaps = useContext(CompactGapsContext);
  const ctx = useContext(ScopeContext);
  const scope = ctx === null ? null : ctx.scope;
  const owner = useId();
  const tracked = collapsible && !compact && scope !== null;
  const first = tracked ? scope.claim(id, owner) : true;
  useEffect(() => {
    if (!tracked) return;
    return () => scope.release(id, owner);
  }, [tracked, scope, id, owner]);
  const why = titleReason ? ` · ${titleReason}` : "";
  if (compactGaps) {
    return (
      <GapWhy
        className="exec-blk-na"
        gap={id}
        text="Not available"
        name={typeof children === "string" && children ? `Not available: ${children}, reason` : "Not available, reason"}
        rows={[gapTitle(id, typeof children === "string" ? children : null, [titleReason, reasonCode].filter(Boolean).join(" · ") || null)]}
      />
    );
  }
  const code = reasonCode ? ` · ${reasonCode}` : "";
  // The id and the reason code are for whoever asks, not for the reader scanning the page: they stay in the text for assistive
  // tech and copy (visually hidden) and in the tooltip, and the visible part is the word and what is missing.
  const hidden = (
    <span className="exec-blk-sr">
      {" ("}
      <span className="exec-blk-np-id">{id}</span>
      {")"}
      {reasonCode ? <span className="exec-blk-np-reason">{reasonCode}</span> : null}
    </span>
  );
  if (!first) {
    return (
      <span className="exec-blk-np" data-repeat="true" title={`${NOT_PUBLISHED} (${id}): ${feLabel(id)}${why}${code}`}>
        <span className="exec-blk-np-word">{NOT_PUBLISHED}</span>
        {children ? <> {children}</> : null}
        {reasonCode ? <span className="exec-blk-sr"><span className="exec-blk-np-reason">{reasonCode}</span></span> : null}
      </span>
    );
  }
  if (compact) {
    return (
      <span className="exec-blk-np" data-compact="true" title={`${NOT_PUBLISHED} (${id}): ${feLabel(id)}${why}${code}`}>
        <span className="exec-blk-sr">{notPublishedText(id)} </span>
        <span className="exec-blk-np-short">{children ?? NOT_PUBLISHED}</span>
        {reasonCode ? <span className="exec-blk-sr"><span className="exec-blk-np-reason">{reasonCode}</span></span> : null}
      </span>
    );
  }
  return (
    <span className="exec-blk-np" title={`${id} · ${feLabel(id)}${why}${code}`}>
      <span className="exec-blk-np-word">{NOT_PUBLISHED}</span>
      {hidden}
      {children ? <> {children}</> : null}
    </span>
  );
}
