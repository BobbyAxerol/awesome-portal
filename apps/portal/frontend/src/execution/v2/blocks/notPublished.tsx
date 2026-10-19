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
import type { ReactNode } from "react";

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

export interface NotPublishedProps {
  /** The request that will publish the value. */
  id: NotPublishedId;
  /** The published reason code, shown as given. */
  reasonCode?: string | null;
  /** What exactly is missing, in a few words ("Days in stage"). */
  children?: ReactNode;
}

/** Inline: "Not published (FE-021)" plus what it means. */
export function NotPublished({ id, reasonCode, children }: NotPublishedProps) {
  return (
    <span className="exec-blk-np" title={feLabel(id)}>
      <span className="exec-blk-np-word">{NOT_PUBLISHED}</span> (<span className="exec-blk-np-id">{id}</span>)
      {children ? <> {children}</> : null}
      {reasonCode ? <span className="exec-blk-np-reason">{reasonCode}</span> : null}
    </span>
  );
}
