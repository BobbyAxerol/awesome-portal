/**
 * One compact line for every fact a panel or a screen has no published value for: `Not available: Net PnL, Return`.
 *
 * It replaces a row, a cell or a panel per gap. The request ids and the reason per fact stay behind one GapWhy disclosure and in
 * visually hidden text (never dropped, never replaced by a dash or a zero); the visible part is only what is missing.
 * Facts that ARE published are not listed here: a screen renders those itself.
 */
import type { ReactNode } from "react";

import { GapWhy, NOT_PUBLISHED, gapTitle, type NotPublishedId } from "./notPublished";
import "../css/blocks.css";

export interface UnavailableFact {
  /** What is missing, in the reader's words ("Net PnL"). */
  label: string;
  /** The request that will publish it. */
  id?: NotPublishedId | `FE-${number}` | null;
  /** Why, when the source gave a reason (disclosure only). */
  why?: string | null;
}

export interface NotAvailableLineProps {
  facts: readonly UnavailableFact[];
  /** Extra class for placement. */
  className?: string;
  /** Appended after the list, e.g. "(windowed)". */
  note?: ReactNode;
}

/** The tooltip text: one line per fact with its id, its request and its reason. */
/** The request behind an id; a request that is not in the shared table (an id a screen still owns) has no label yet. */

export function unavailableRows(facts: readonly UnavailableFact[]): string[] {
  return facts
    .map((fact) => (fact.id ? `${fact.label}: ${gapTitle(fact.id, null, fact.why)}` : `${fact.label}: ${fact.why ?? "Not available"}`));
}

export function unavailableTitle(facts: readonly UnavailableFact[]): string {
  return unavailableRows(facts).join("\n");
}

export function NotAvailableLine({ facts, className, note }: NotAvailableLineProps) {
  if (facts.length === 0) return null;
  return (
    <p className={className ? `exec-blk-nal ${className}` : "exec-blk-nal"} data-testid="not-available-line" data-gap={facts.flatMap((fact) => (fact.id ? [fact.id] : [])).join(" ") || undefined}>
      <span className="exec-blk-np-word">Not available:</span> {facts.map((fact) => fact.label).join(", ")}
      {note ? <> {note}</> : null}
      <GapWhy name={`Why not available: ${facts.map((fact) => fact.label).join(", ")}`} rows={unavailableRows(facts)} />
      <span className="exec-blk-sr">
        {" ("}
        {facts.map((fact) => (fact.id ? `${NOT_PUBLISHED}: ${fact.label}` : fact.label)).join(", ")}
        {")"}
      </span>
    </p>
  );
}
