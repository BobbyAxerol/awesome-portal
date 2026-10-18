/**
 * What the backend has not published, said in words.
 *
 * A gap is a sentence with its request id, never a dash, a zero or an invented
 * value (D9, review2/04). The ids are the open requests in
 * FRONTEND_BACKEND_SYNC.md and design/sync/2026-10-18-codex-digest.md; they
 * live in this one table so a closed request changes one line.
 */
import type { ReactNode } from "react";

import "../../css/operations.css";

export const FE = {
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
} as const;

export type FeId = (typeof FE)[keyof typeof FE];

/** The sentence a disabled control carries. */
export function notPublishedReason(id: FeId, because: string): string {
  return `Not published (${id}). ${because}`;
}

export interface NotPublishedProps {
  id: FeId;
  /** The published reason code, shown as given. */
  reasonCode?: string | null;
  children?: ReactNode;
}

/** Inline: "Not published (FE-021)" plus what it means. */
export function NotPublished({ id, reasonCode, children }: NotPublishedProps) {
  return (
    <span className="exec-ops-np">
      <span className="exec-ops-np-word">Not published</span> ({id})
      {children ? <> {children}</> : null}
      {reasonCode ? <span className="exec-ops-np-reason">{reasonCode}</span> : null}
    </span>
  );
}
