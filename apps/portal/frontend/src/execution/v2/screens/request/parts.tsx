/**
 * Small, static parts of New request: the three-step bar and the "What happens next" aside.
 * Copy follows the hi-fi (new-approval.html); the Digest line says what the server does, because the form
 * never carries a digest (N29 section 3).
 */
import { SectionPanel } from "../../blocks";

import "../../css/request.css";

export function StepBar() {
  return (
    <nav className="exec-rq-steps" aria-label="Where this request sits in the loop">
      <ol>
        <li data-state="current" aria-current="step">1 · Declare · you, now</li>
        <li data-state="ahead">2 · R1 · a quant reviewer, not you</li>
        <li data-state="ahead">3 · R2 · capital, only after R1</li>
      </ol>
    </nav>
  );
}

const NEXT: readonly { id: string; head: string; text: string }[] = [
  { id: "digest", head: "1 · Digest", text: "Pinned on the server from the run registry." },
  { id: "reviewer", head: "2 · Reviewer", text: "A quant reviewer decides, never you. The SLA clock starts at submit." },
  { id: "duplicates", head: "3 · Duplicates", text: "Open work for the same alpha and run is refused with its request." },
];

/** The aside of the route page. */
export function WhatNextPanel() {
  return (
    <SectionPanel title="What happens next" level={2} flush>
      <ol className="exec-rq-next-list">
        {NEXT.map((n) => (
          <li key={n.id}>
            <b>{n.head}</b>
            <span>{n.text}</span>
          </li>
        ))}
      </ol>
    </SectionPanel>
  );
}

/** The drawer folds the same three lines into one disclosure, as the hi-fi drawer does. */
export function WhatNextDisclosure() {
  return (
    <details className="exec-rq-disclosure">
      <summary>What happens next</summary>
      <p className="exec-rq-meta">Digest pinned on the server · a quant reviewer decides, never you · duplicates are refused with the existing request.</p>
    </details>
  );
}
