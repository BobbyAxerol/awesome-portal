/**
 * Small, static parts of New request: the three-step bar and the collapsed "What happens next" disclosure.
 * The disclosure says what the server does; the Digest line is there because the form never carries a digest (N29 section 3).
 * The three steps keep their longer sentence in the step's title, so the bar is three short words.
 */
import { useSearchParams } from "react-router-dom";

import "../../css/request.css";

/**
 * The port posts a new request with no workspace, so the server files it in the caller's own workspace. When the
 * page is showing another one (`?workspace_id=` on the URL) the reader is told so, once, in one line. Nothing is
 * changed or claimed beyond that: no selector, no promise about where a later version will file it.
 */
export const OWN_WORKSPACE_NOTE = "Created in your own workspace, not the one this page shows.";

export function WorkspaceNote() {
  const [params] = useSearchParams();
  if ((params.get("workspace_id") ?? "").trim() === "") return null;
  return <p className="exec-rq-note" data-notice="own-workspace">{OWN_WORKSPACE_NOTE}</p>;
}

export function StepBar() {
  return (
    <nav className="exec-rq-steps" aria-label="Where this request sits in the loop">
      <ol>
        <li data-state="current" aria-current="step" title="You, now">1 · Declare</li>
        <li data-state="ahead" title="A quant reviewer decides, not you">2 · R1</li>
        <li data-state="ahead" title="Capital, only after R1">3 · R2</li>
      </ol>
    </nav>
  );
}

/** The three lines, folded into one disclosure under the form. */
export function WhatNextDisclosure() {
  return (
    <details className="exec-rq-disclosure">
      <summary>What happens next</summary>
      <p className="exec-rq-meta">Digest pinned on the server · a quant reviewer decides, never you · duplicates are refused with the existing request.</p>
    </details>
  );
}
