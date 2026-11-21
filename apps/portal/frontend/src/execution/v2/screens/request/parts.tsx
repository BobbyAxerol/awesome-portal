/**
 * Small, static parts of New request: the three-step bar with its captions, the "What happens next" side panel (and its folded
 * disclosure for the drawer), the Route page / Drawer toggle, the freshness chip and the "Preview the result states" disclosure.
 *
 * Nothing here reads or sends anything. The side panel says what the server does; the Digest line is there because the form never
 * carries a digest (N29 section 3). The result preview lists the words of the five answers the page can show; it is a legend, not a
 * request, and it creates, sends and records nothing.
 */
import { Link, useSearchParams } from "react-router-dom";

import { Flag } from "../../Flag";
import type { FlagKind } from "../../flagKinds";
import { withContext, withoutParams } from "../../urlState";
import { NEW_REQUEST_HREF, QUEUE_HREF } from "./model";

import "../../css/request.css";

/**
 * The port posts a new request with no workspace, so the server files it in the caller's own workspace. When the
 * page is showing another one (`?workspace_id=` on the URL) the reader is told so, once, in one line. Nothing is
 * changed or claimed beyond that: no selector, no promise about where a later version will file it.
 */
export const OWN_WORKSPACE_NOTE = "Created in your own workspace, not the one this page shows.";

/**
 * What the environment control of the context bar does to this page: nothing. The form has no environment field: a request names an alpha,
 * a run and a claim and goes to R1 review, so Real-funded, Paper and Sandbox change none of it. One line, so the switch is not read as a setting
 * of the form (the bar is the shell's; this page does not own it).
 */
export const ENV_APPLIES_NOTE = "Applies to: nothing here. The environment control does not change this form; a request names an alpha, a run and a claim.";

export function EnvironmentNote() {
  return <p className="exec-rq-note" data-notice="environment">{ENV_APPLIES_NOTE}</p>;
}

export function WorkspaceNote() {
  const [params] = useSearchParams();
  if ((params.get("workspace_id") ?? "").trim() === "") return null;
  return <p className="exec-rq-note" data-notice="own-workspace">{OWN_WORKSPACE_NOTE}</p>;
}

/** The subtitle under the title (hi-fi: "Research → R1 gate · when it did not start in Research"). */
export const SUBTITLE = "Research → R1 gate · when it did not start in Research";

/** The three steps and who acts at each (hi-fi captions): the reader now, a reviewer who is not them, capital only after R1. */
export const STEPS = [
  { id: "declare", label: "1 · Declare", caption: "you, now", state: "current" },
  { id: "r1", label: "2 · R1", caption: "a quant reviewer, not you", state: "ahead" },
  { id: "r2", label: "3 · R2", caption: "capital, only after R1", state: "ahead" },
] as const;

export function StepBar() {
  return (
    <nav className="exec-rq-steps" aria-label="Where this request sits in the loop">
      <ol>
        {STEPS.map((step) => (
          <li key={step.id} data-state={step.state} aria-current={step.state === "current" ? "step" : undefined}>
            {step.label}
            <span className="exec-rq-cap"> · {step.caption}</span>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/**
 * Route page | Drawer from the queue. The current frame is plain text marked `aria-current`; the other is a link that opens in a new tab,
 * because navigating away in this one would silently lose what was typed (the same rule as the Run Library link).
 */
export function FrameToggle({ current }: { current: "page" | "drawer" }) {
  const [params] = useSearchParams();
  // Ids typed in the form are not carried over; only the page's context (environment, window) is, never the workspace the request cannot use.
  const here = withoutParams(params, ["workspace_id", "alpha", "run", "claim", "compose"]);
  const segment = (id: "page" | "drawer", label: string, href: string) =>
    current === id ? (
      <span key={id} className="exec-rq-seg" data-on="true" aria-current="page">{label}</span>
    ) : (
      <Link key={id} className="exec-rq-seg" to={withContext(href, here)} target="_blank" rel="noopener noreferrer">
        {label}<span className="exec-rq-sr"> (opens in a new tab)</span>
      </Link>
    );
  return (
    <div className="exec-rq-toggle" role="group" aria-label="Where this form opens" data-testid="rq-frame-toggle">
      {segment("page", "Route page", NEW_REQUEST_HREF)}
      {segment("drawer", "Drawer from the queue", `${QUEUE_HREF}?compose=request`)}
    </div>
  );
}

/** What the freshness chip can say: the Run Library read the pickers rest on, in the words of its state. No clock is claimed. */
export type FreshState = "reading" | "read" | "unavailable";

const FRESH_FLAG: Readonly<Record<FreshState, { kind: FlagKind; label: string }>> = {
  reading: { kind: "pending", label: "Reading the Run Library" },
  read: { kind: "ok", label: "Run Library read" },
  unavailable: { kind: "unknown", label: "Run Library not available" },
};

export function FreshChip({ state }: { state: FreshState }) {
  const spec = FRESH_FLAG[state];
  return (
    <span className="exec-rq-fresh" data-testid="rq-fresh" data-state={state}>
      <Flag kind={spec.kind} label={spec.label} size="sm" />
    </span>
  );
}

/** The three things the server does, once each. */
export const NEXT_ITEMS = [
  { n: "1", term: "Digest", text: "Pinned on the server from the run registry." },
  { n: "2", term: "Reviewer", text: "A quant reviewer decides, never you. The SLA clock starts at submit." },
  { n: "3", term: "Duplicates", text: "Open work for the same alpha and run is refused with its request." },
] as const;

/** The side panel of the route page (hi-fi "What happens next"). */
export function NextPanel() {
  return (
    <aside className="exec-rq-next" aria-label="What happens next">
      <div className="exec-rq-next-head">What happens next</div>
      <ol className="exec-rq-next-list">
        {NEXT_ITEMS.map((item) => (
          <li key={item.n}>
            <b>{item.n} · {item.term}</b>
            <span>{item.text}</span>
          </li>
        ))}
      </ol>
    </aside>
  );
}

/** The three lines, folded into one disclosure under the drawer's form (the drawer has no room for a column). */
export function WhatNextDisclosure() {
  return (
    <details className="exec-rq-disclosure">
      <summary>What happens next</summary>
      <p className="exec-rq-meta">Digest pinned on the server · a quant reviewer decides, never you · duplicates are refused with the existing request.</p>
    </details>
  );
}

interface PreviewRow {
  id: string;
  /** One sentence: the answer's word, then what it means. One text node, so it never reads as the answer itself being on screen. */
  says: string;
}

/** The five answers the page can show, with the sentence each one carries. The words are the ones `OutcomePanel` prints. */
export const RESULT_STATES: readonly PreviewRow[] = [
  { id: "created", says: "If created: the request is opened for R1 review and its id is shown, with Open request." },
  { id: "replayed", says: "If already created: an earlier submit of this same request landed; its request is shown and nothing new is made." },
  { id: "duplicate", says: "If a duplicate: open work for this alpha and run already exists; its id is shown and nothing was created." },
  { id: "refused", says: "If refused: the server gives its reason, and the fields are kept so they can be changed." },
  { id: "uncertain", says: "If uncertain: the answer never arrived and the request may exist. The fields lock until you check, retry under the same key, or discard." },
];

/** "Preview the result states": a legend of the answers, collapsed. It is not a request and sends nothing. */
export function ResultPreview() {
  return (
    <details className="exec-rq-disclosure exec-rq-preview" data-testid="rq-result-preview">
      <summary>Preview the result states</summary>
      <p className="exec-rq-meta">Preview only. These are the answers this page can show; nothing here was sent.</p>
      <ul className="exec-rq-preview-list">
        {RESULT_STATES.map((row) => (
          <li key={row.id} data-state={row.id}>{row.says}</li>
        ))}
      </ul>
    </details>
  );
}
