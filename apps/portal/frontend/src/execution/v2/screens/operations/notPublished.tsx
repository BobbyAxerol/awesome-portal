/**
 * What the backend has not published, said in words.
 *
 * A gap is a sentence with its request id, never a dash, a zero or an invented
 * value (D9, review2/04). The ids are the open requests in
 * FRONTEND_BACKEND_SYNC.md and design/sync/2026-10-18-codex-digest.md; they
 * live in this one table so a closed request changes one line.
 */
import type { ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { GapWhy, NOT_PUBLISHED, gapTitle } from "../../blocks";
import "../../css/blocks.css";
import { withContext } from "../../urlState";

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

/**
 * Delivered by B1 (UXM-07), so these are "Not published" only for an older server or body that omits the field. Kept
 * out of `FE` because blocks.test.tsx pins `FE` to the shared table in blocks/notPublished.tsx; hoist both there in one step.
 */
export const FE_B1 = {
  /** Incident links on a queue row. */
  links: "FE-042",
  /** Server-side status counts over the whole filtered query. */
  counts: "FE-043",
} as const;

/** The Access screen's route (D9: where a blocked action shows which grant is missing). Kept here so the queue does not import that screen. */
export const ACCESS_PATH = "/administration/profile-access";

export type FeId = (typeof FE)[keyof typeof FE] | (typeof FE_B1)[keyof typeof FE_B1];

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
      <GapWhy className="exec-ops-np-word" gap={id} text={NOT_PUBLISHED} name="Not published, reason" rows={[gapTitle(id, null, reasonCode)]} />
      <span className="exec-blk-sr"> ({id})</span>
      {children ? <> {children}</> : null}
      {reasonCode ? <span className="exec-blk-sr"><span className="exec-ops-np-reason">{reasonCode}</span></span> : null}
    </span>
  );
}

/** The action on a denied panel: where the session's access is listed, with the context kept (D9). */
export function AccessLink({ href }: { href: string }) {
  const [params] = useSearchParams();
  return <Link className="exec-ops-apply" to={withContext(href, params)}>See what you can access</Link>;
}
