/**
 * Small pieces both Accounts screens print the same way: a labelled fact, an
 * absent value, a `Not published (id)` gap, a `Not computed` gap, an instant,
 * and the credential and state flags. Plain props in, markup out.
 */
import type { ReactNode } from "react";

import type { UtcEpochMs } from "../../../screenDataContract";
import { formatAsOf, type Metric } from "../../boundary";
import { GapWhy, MetricText, NaWhy, QuietIdsWhy, gapTitle } from "../../blocks";
import { Flag } from "../../Flag";
import { credentialView, notPublished, stateView, updatedAgo, type UnpublishedFact } from "./model";

import "../../css/account.css";

export const NOT_AVAILABLE = "Not available";

export function Na({ why }: { why?: string }) {
  // The reason sits behind a disclosure (RV-06), never only in a hover; the visible word is enough to decide.
  return <NaWhy reason={why} text={NOT_AVAILABLE} className="exec-acct-na" />;
}

/** `Not published (FE-017)`: the gap and the request that closes it. */
export function Np({ fact, children }: { fact: UnpublishedFact; children?: ReactNode }) {
  return (
    <span className="exec-acct-np">
      <QuietIdsWhy text={notPublished(fact)} gap={fact.fe} rows={[gapTitle(fact.fe, fact.what)]} />
      {children ? <span className="exec-acct-why">{children}</span> : null}
    </span>
  );
}

/** A figure the source deliberately does not split (R10): not a failure and not a zero. */
export function NotComputed({ why }: { why: string }) {
  return (
    <span className="exec-acct-na" data-state="not-computed">
      <GapWhy className="exec-acct-na-why" text="Not computed" name="Not computed, reason" rows={[why]} />
    </span>
  );
}

export function When({ at }: { at: UtcEpochMs | null | undefined }) {
  if (at === null || at === undefined) return <Na />;
  return <time dateTime={new Date(at).toISOString()}>{formatAsOf(at)}</time>;
}

/**
 * A row's last update as an age against the read (hi-fi accounts.html `age` + `ageW`): a square dot,
 * a hollow warn diamond (a different shape, not only a different colour) once it is 30 minutes or more, and the absolute instant on hover. With no usable age it
 * prints the instant itself.
 */
export function Updated({ at, readAt }: { at: UtcEpochMs | null | undefined; readAt: UtcEpochMs | null }) {
  if (at === null || at === undefined) return <Na />;
  const ago = updatedAgo(at, readAt);
  if (ago === null) return <When at={at} />;
  return (
    <time className="exec-acct-ago" dateTime={new Date(at).toISOString()} title={`Updated ${formatAsOf(at)}`}>
      <span className="exec-acct-dot" data-stale={ago.stale ? "true" : undefined} data-shape={ago.stale ? "diamond" : "square"} aria-hidden="true" />
      {ago.text}
      {ago.stale ? <span className="exec-acct-sr"> (stale)</span> : null}
    </time>
  );
}

export function Value({ metric, suffix, signed }: { metric: Metric | null | undefined; suffix?: string; signed?: boolean }) {
  return <MetricText metric={metric} suffix={suffix} signed={signed} />;
}

export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="exec-acct-fact">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export function CredentialFlag({ word, size = "sm" }: { word: string | null | undefined; size?: "sm" | "md" }) {
  const view = credentialView(word);
  return <Flag kind={view.kind} label={view.label} size={size} />;
}

export function StateFlag({ word, size = "sm" }: { word: string | null | undefined; size?: "sm" | "md" }) {
  const view = stateView(word);
  return <Flag kind={view.kind} label={view.label} size={size} />;
}

/** The one sentence about the broker reference, so a reader knows its absence is deliberate. */
export const WITHHELD = "Withheld. The portal never shows the broker account reference.";
