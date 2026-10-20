/**
 * `Not published (FE-xxx)` for the requests the shared table does not carry yet.
 *
 * The shared `NotPublished` (v2/blocks/notPublished.tsx) is typed to the ids in
 * its `FE_REQUEST_LABEL`. Alpha 360 also waits on FE-006, FE-011 and FE-029,
 * which that table lacks, so this module wraps it for the ids it has and prints
 * the same markup for the three it does not. When the table gains them, `LOCAL`
 * empties and nothing else changes.
 */
import type { ReactNode } from "react";

import { GapWhy, NOT_PUBLISHED, NotPublished, type NotPublishedId } from "../../blocks";

/** Ids this screen prints that `FE_REQUEST_LABEL` does not list. */
export const LOCAL_FE = {
  "FE-006": "Windowed return and its methodology",
  "FE-011": "Score and regime (policy not set)",
  "FE-029": "Approved baseline, comparison series and research-run binding",
} as const;

export type LocalFeId = keyof typeof LOCAL_FE;
export type AlphaFeId = NotPublishedId | LocalFeId;

const isLocal = (id: AlphaFeId): id is LocalFeId => Object.hasOwn(LOCAL_FE, id);

/** Plain text, for a title or a disabled control's reason. */
export const npText = (id: AlphaFeId): string => `${NOT_PUBLISHED} (${id})`;

/** Inline: `Not published (FE-011)` plus what is missing. */
export function Np({ id, children }: { id: AlphaFeId; children?: ReactNode }) {
  if (!isLocal(id)) return <NotPublished id={id}>{children}</NotPublished>;
  return (
    <span className="exec-blk-np" title={LOCAL_FE[id]}>
      <span className="exec-blk-np-word">{NOT_PUBLISHED}</span> ({id})
      {children ? <> {children}</> : null}
    </span>
  );
}

/**
 * The reason a fact is missing (RV-06): a "?" disclosure after the gap, opened by keyboard and touch. Nothing when the source
 * gave no reason. Replaces a `title` on a non-focusable wrapper.
 */
export function WhyMark({ name, reason }: { name: string; reason?: string | null }) {
  if (!reason) return null;
  return <GapWhy name={name} rows={[reason]} />;
}
