/**
 * Small pieces both Accounts screens print the same way: a labelled fact, an
 * absent value, a `Not published (id)` gap, a `Not computed` gap, an instant,
 * and the credential and state flags. Plain props in, markup out.
 */
import type { ReactNode } from "react";

import type { UtcEpochMs } from "../../../screenDataContract";
import { formatAsOf, type Metric } from "../../boundary";
import { MetricText } from "../../blocks";
import { Flag } from "../../Flag";
import { credentialView, notPublished, stateView, type UnpublishedFact } from "./model";

import "../../css/account.css";

export const NOT_AVAILABLE = "Not available";

export function Na({ why }: { why?: string }) {
  return (
    <span className="exec-acct-na">
      {NOT_AVAILABLE}
      {why ? <span className="exec-acct-why">{why}</span> : null}
    </span>
  );
}

/** `Not published (FE-017)`: the gap and the request that closes it. */
export function Np({ fact, children }: { fact: UnpublishedFact; children?: ReactNode }) {
  return (
    <span className="exec-acct-np" title={fact.what}>
      {notPublished(fact)}
      {children ? <span className="exec-acct-why">{children}</span> : null}
    </span>
  );
}

/** A figure the source deliberately does not split (R10): not a failure and not a zero. */
export function NotComputed({ why }: { why: string }) {
  return (
    <span className="exec-acct-na" data-state="not-computed">
      Not computed
      <span className="exec-acct-why">{why}</span>
    </span>
  );
}

export function When({ at }: { at: UtcEpochMs | null | undefined }) {
  if (at === null || at === undefined) return <Na />;
  return <time dateTime={new Date(at).toISOString()}>{formatAsOf(at)}</time>;
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
