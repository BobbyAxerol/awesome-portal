/**
 * What the server said, in one panel: created, already created (replayed), duplicate, refused,
 * uncertain (the answer never arrived), denied, could not send.
 *
 * Every string that came from outside goes through `showable`, so a hostile character in a server
 * message or an id is spelled out and never interpreted. The server's own words are kept verbatim
 * in Provenance, with the request key, so a refusal can be quoted to whoever has to fix it.
 */
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import type { ApprovalCreateOutcome } from "../../../api/ports";
import { reviewRouteFor } from "../../../screens/ApprovalInbox";
import { Flag } from "../../Flag";
import { withContext, withoutParams } from "../../urlState";
import { dueText, failureKind, QUEUE_HREF, refusalOf, safeApprovalId, showable } from "./model";

export interface OutcomePanelProps {
  outcome: ApprovalCreateOutcome;
  requestKey: string | null;
  /** Back to the form with the fields as they were (duplicate, refused, could not send). */
  onDismiss(): void;
  /** Back to an empty form (after a created request). */
  onNew(): void;
  /** A send is in flight (a same-key retry): the uncertain panel's buttons wait. */
  busy?: boolean;
  /** Re-send the stored request, verbatim, under the same key. */
  onRetry?(): void;
  /** Forget the uncertain send and its key. Called only after the reader has seen the warning and confirmed. */
  onDiscardUncertain?(): void;
  accessHref: string;
}

/** What the reader must see before an uncertain send is forgotten. */
export const DISCARD_WARNING = "This request may already exist. Check the queue before creating another.";

function Facts({ rows }: { rows: readonly (readonly [string, string])[] }) {
  return (
    <dl className="exec-rq-facts">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function OutcomePanel({ outcome, requestKey, busy = false, onDismiss, onNew, onRetry, onDiscardUncertain, accessHref }: OutcomePanelProps) {
  const [params] = useSearchParams();
  const root = useRef<HTMLDivElement>(null);
  const keepKey = useRef<HTMLButtonElement>(null);
  const [asking, setAsking] = useState(false);
  // A new answer is where the reader's attention should be, including for a keyboard user who just pressed Submit.
  useEffect(() => {
    setAsking(false);
    root.current?.focus({ preventScroll: false });
  }, [outcome]);
  useEffect(() => {
    if (asking) keepKey.current?.focus();
  }, [asking]);
  // The request is created in the caller's OWN workspace (the port names none), so a link out of this panel must not carry
  // the page's `workspace_id`: that record is not in the workspace the page is showing.
  const here = (href: string) => withContext(href, withoutParams(params, ["workspace_id"]));

  if (outcome.kind === "created" || outcome.kind === "replayed") {
    const id = safeApprovalId(outcome.approvalId);
    const replayed = outcome.kind === "replayed";
    const due = dueText(outcome.slaDueAt);
    return (
      <div ref={root} className="exec-rq-res" data-tone={replayed ? "replayed" : "created"} role="status" tabIndex={-1} aria-label={replayed ? "Request already created" : "Request created"}>
        <p className="exec-rq-res-head">
          <Flag kind="applied" label={replayed ? "Already created" : "Created"} />
          <span className="exec-rq-id">{showable(outcome.approvalId, 80)}</span>
          <span>{replayed ? "was created by an earlier submit of this request" : "opened for R1 review"}</span>
        </p>
        <Facts
          rows={[
            ["Gate", "R1 · a quant reviewer, not you"],
            ["Status", outcome.status !== "" ? showable(outcome.status, 40) : "Not stated"],
            ["Quorum required", outcome.quorumRequired !== null ? String(outcome.quorumRequired) : "Not stated"],
            ["Review due", due ?? "Not stated"],
            ["Policy", outcome.policyVersion !== null ? showable(outcome.policyVersion, 60) : "Not stated"],
            ["Requested by", outcome.requester !== null ? showable(outcome.requester, 80) : "Not stated"],
          ]}
        />
        <p className="exec-rq-meta">The requester can never approve: the queue dims the row for you.</p>
        <div className="exec-rq-acts">
          {id ? <Link className="exec-rq-btn" data-variant="primary" to={here(reviewRouteFor({ id, gate: "R1" }))}>Open request</Link> : <Link className="exec-rq-btn" data-variant="primary" to={here(QUEUE_HREF)}>Open the approvals queue</Link>}
          <button type="button" className="exec-rq-btn" onClick={onNew}>New request</button>
        </div>
        <details className="exec-rq-prov">
          <summary>Provenance</summary>
          <p className="exec-rq-mono">
            Approval {showable(outcome.approvalId, 80)}
            {requestKey ? ` · request key ${showable(requestKey, 80)}` : ""}
            {outcome.subjectLabel !== "" ? ` · subject ${showable(outcome.subjectLabel, 80)}` : ""}
          </p>
        </details>
      </div>
    );
  }

  if (outcome.kind === "duplicate") {
    const id = safeApprovalId(outcome.existingApprovalId);
    return (
      <div ref={root} className="exec-rq-res" data-tone="duplicate" role="alert" tabIndex={-1} aria-label="Duplicate request">
        <p className="exec-rq-res-head">
          <Flag kind="operation" label="Duplicate" />
          <span>
            Open work for this alpha and run already exists
            {id ? <> as <span className="exec-rq-id">{id}</span></> : null}.
          </span>
        </p>
        <p className="exec-rq-meta">Nothing was created.</p>
        <div className="exec-rq-acts">
          {id ? <Link className="exec-rq-btn" data-variant="primary" to={here(reviewRouteFor({ id, gate: "R1" }))}>Open {id}</Link> : <Link className="exec-rq-btn" data-variant="primary" to={here(QUEUE_HREF)}>Open the approvals queue</Link>}
          <button type="button" className="exec-rq-btn" onClick={onDismiss}>Change the request</button>
        </div>
        <details className="exec-rq-prov">
          <summary>Provenance</summary>
          <p className="exec-rq-mono">{showable(outcome.reason)}{requestKey ? ` · request key ${showable(requestKey, 80)}` : ""}</p>
        </details>
      </div>
    );
  }

  // The type does not narrow `created | replayed` away by `kind` alone; this is the failed shape.
  if (outcome.kind !== "failed") return null;
  const kind = failureKind(outcome);
  const refusal = refusalOf(outcome.reason);

  if (kind === "uncertain") {
    return (
      <div ref={root} className="exec-rq-res" data-tone="uncertain" role="alert" tabIndex={-1} aria-label="Request outcome uncertain">
        <p className="exec-rq-res-head">
          <Flag kind="unknown" label="Uncertain" />
          <span>We could not confirm this. It may have been created. Check the original request before doing anything.</span>
        </p>
        <p className="exec-rq-meta">
          The fields are locked while this stands. Retrying sends the same request again under the same key, so if the first one landed the server answers with it instead of creating another.
        </p>
        {asking ? (
          <div className="exec-rq-confirm" role="alertdialog" aria-label="Discard this uncertain request?">
            <p className="exec-rq-confirm-title">{DISCARD_WARNING}</p>
            <p className="exec-rq-meta">Discarding forgets the request key. The fields stay as they are and can be changed.</p>
            <div className="exec-rq-acts">
              <Link className="exec-rq-btn" data-variant="primary" to={here(QUEUE_HREF)}>Check the queue</Link>
              <button ref={keepKey} type="button" className="exec-rq-btn" onClick={() => setAsking(false)}>Keep the request</button>
              <button type="button" className="exec-rq-btn" onClick={() => onDiscardUncertain?.()}>Discard anyway</button>
            </div>
          </div>
        ) : (
          <div className="exec-rq-acts">
            <Link className="exec-rq-btn" to={here(QUEUE_HREF)}>Check original request</Link>
            <button type="button" className="exec-rq-btn" data-variant="primary" aria-disabled={busy} onClick={() => { if (!busy) onRetry?.(); }}>
              Retry with the same key
            </button>
            <button type="button" className="exec-rq-btn" aria-disabled={busy} onClick={() => { if (!busy) setAsking(true); }}>Discard</button>
          </div>
        )}
        <details className="exec-rq-prov">
          <summary>Provenance</summary>
          <p className="exec-rq-mono">{refusal.verbatim}{requestKey ? ` · request key ${showable(requestKey, 80)}` : ""}</p>
        </details>
      </div>
    );
  }

  if (kind === "denied") {
    return (
      <div ref={root} className="exec-rq-res" data-tone="denied" role="alert" tabIndex={-1} aria-label="Request not allowed">
        <p className="exec-rq-res-head">
          <Flag kind="rejected" label="Not allowed" />
          <span>{refusal.sentence ?? "You can't create requests here."}</span>
        </p>
        <div className="exec-rq-acts">
          <Link className="exec-rq-btn" data-variant="primary" to={here(accessHref)}>My access</Link>
          <button type="button" className="exec-rq-btn" onClick={onDismiss}>Back to the form</button>
        </div>
        <details className="exec-rq-prov">
          <summary>Provenance</summary>
          <p className="exec-rq-mono">{refusal.verbatim}{requestKey ? ` · request key ${showable(requestKey, 80)}` : ""}</p>
        </details>
      </div>
    );
  }

  if (kind === "refused") {
    return (
      <div ref={root} className="exec-rq-res" data-tone="refused" role="alert" tabIndex={-1} aria-label="Request refused">
        <p className="exec-rq-res-head">
          <Flag kind="rejected" label="Refused" />
          <span>{refusal.sentence ?? `The server refused the request: ${refusal.message}`}</span>
        </p>
        <div className="exec-rq-acts">
          <button type="button" className="exec-rq-btn" data-variant="primary" onClick={onDismiss}>Change the request</button>
        </div>
        <details className="exec-rq-prov">
          <summary>Provenance</summary>
          <p className="exec-rq-mono">{refusal.code !== null ? `Reason ${refusal.code} · ` : ""}{refusal.message}{requestKey ? ` · request key ${showable(requestKey, 80)}` : ""}</p>
        </details>
      </div>
    );
  }

  return (
    <div ref={root} className="exec-rq-res" data-tone="unavailable" role="alert" tabIndex={-1} aria-label="Request not sent">
      <p className="exec-rq-res-head">
        <Flag kind="attention" label="Could not send" />
        <span>{refusal.message}</span>
      </p>
      <p className="exec-rq-meta">The server did not create a request from this attempt. The fields are as you left them.</p>
      <div className="exec-rq-acts">
        <button type="button" className="exec-rq-btn" data-variant="primary" onClick={onDismiss}>Back to the form</button>
      </div>
    </div>
  );
}
