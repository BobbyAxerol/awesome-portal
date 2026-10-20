/**
 * Step 3: what the answer was, in one panel: accepted, already recorded (replayed), rejected (typed), denied (the relay said no),
 * unknown (it may already have been applied), or access stopped.
 *
 * Every string that came from outside goes through `showable`. The server's own words are not printed; the words are this build's
 * (`REASON_COPY`), and the verbatim machine words sit in Provenance with the request key, so a refusal can be quoted to whoever has to
 * fix it.
 *
 * Unknown is the state that must not be hurried: the fields stay locked, the only way on is a retry under the SAME key or a discard
 * that has first shown what it costs. There is no button that sends the stored intent under a second key.
 */
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { Flag } from "../../Flag";
import { withContext } from "../../urlState";
import { UNKNOWN_COPY, operationHref, showable, type Receipt } from "./model";
import { Facts, LookupResult, StatusBody } from "./parts";
import type { CommandFlow } from "./useCommandFlow";

/** What the reader must see before an unknown send is forgotten. */
export const DISCARD_WARNING = "This command may already have been applied. Check it before creating another.";
export const ACCESS_HREF = "/administration/profile-access";

/** UXM-09 e2e/receipt rule: a receipt from the scripted port says so, in the receipt, where it is read. */
export const FAKE_PORT_NOTE = "Answered by the fake port: a scripted fixture answer, not a receipt from any source.";

function FakePortNote({ flow }: { flow: CommandFlow }) {
  return flow.portKind === "fixture" ? <p className="exec-cf-meta" data-notice="fake-port">{FAKE_PORT_NOTE}</p> : null;
}

function Provenance({ flow, rows }: { flow: CommandFlow; rows?: readonly string[] }) {
  return (
    <>
      <FakePortNote flow={flow} />
      <details className="exec-cf-prov">
        <summary>Provenance</summary>
        <p className="exec-cf-mono">
          {[...(rows ?? []), flow.requestKey !== null ? `request key ${showable(flow.requestKey, 120)}` : null, flow.attempts > 0 ? `sends ${flow.attempts}` : null]
            .filter((part): part is string => part !== null)
            .join(" · ")}
        </p>
      </details>
    </>
  );
}

function QueryBlock({ flow }: { flow: CommandFlow }) {
  if (flow.queried === null) return null;
  return (
    <div className="exec-cf-query" role="status" aria-label="What the lookup found">
      <LookupResult view={flow.queried} />
    </div>
  );
}

function Actions({ flow, extra }: { flow: CommandFlow; extra?: ReactNode }) {
  return (
    <div className="exec-cf-acts">
      {extra}
      {flow.commandId !== null ? (
        <button type="button" className="exec-cf-btn" aria-disabled={flow.querying} title={flow.querying ? "A lookup is in progress." : undefined} onClick={() => { if (!flow.querying) flow.queryIntent(); }}>
          {flow.querying ? "Looking up…" : "Query the same intent"}
        </button>
      ) : null}
    </div>
  );
}

export function ReceiptPanel({ flow }: { flow: CommandFlow }) {
  const { receipt } = flow;
  const [params] = useSearchParams();
  const root = useRef<HTMLDivElement>(null);
  const keepKey = useRef<HTMLButtonElement>(null);
  const [asking, setAsking] = useState(false);
  // A new answer is where the reader's attention should be, including for a keyboard user who just pressed Submit.
  useEffect(() => {
    setAsking(false);
    if (receipt !== null) root.current?.focus({ preventScroll: false });
  }, [receipt]);
  useEffect(() => {
    if (asking) keepKey.current?.focus();
  }, [asking]);

  if (receipt === null) return null;
  return <Body receipt={receipt} flow={flow} rootRef={root} keepKey={keepKey} asking={asking} setAsking={setAsking} accessHref={withContext(ACCESS_HREF, params)} />;
}

interface BodyProps {
  receipt: Receipt;
  flow: CommandFlow;
  rootRef: RefObject<HTMLDivElement>;
  keepKey: RefObject<HTMLButtonElement>;
  asking: boolean;
  setAsking(value: boolean): void;
  accessHref: string;
}

function Body({ receipt, flow, rootRef, keepKey, asking, setAsking, accessHref }: BodyProps) {
  const [params] = useSearchParams();
  const newPlan = <button type="button" className="exec-cf-btn" onClick={flow.reset}>New plan</button>;

  switch (receipt.kind) {
    case "ACCEPTED":
    case "REPLAYED": {
      const replayed = receipt.kind === "REPLAYED";
      const applied = receipt.status.business.state === "APPLIED";
      return (
        <div ref={rootRef} className="exec-cf-res" data-tone={replayed ? "replayed" : "accepted"} data-receipt={receipt.kind} role="status" tabIndex={-1} aria-label={replayed ? "Already recorded" : "Accepted"}>
          <p className="exec-cf-res-head">
            <Flag kind={replayed ? "operation" : "neutral"} label={replayed ? "Already recorded" : "Accepted"} />
            <span className="exec-cf-id">{showable(receipt.status.commandId, 80)}</span>
            <span>
              {replayed
                ? "was created by an earlier send under this key. Nothing new was created."
                : applied
                  ? "was recorded as applied by the source. The Portal view and the venue have their own answers."
                  : "was acknowledged. That is not the same as applied: read the four answers below."}
            </span>
          </p>
          {flow.attempts > 1 && !replayed ? (
            <p className="exec-cf-meta" data-notice="after-retry">This answer came from a re-send under the same key. One key creates one command.</p>
          ) : null}
          <StatusBody status={receipt.status} />
          <QueryBlock flow={flow} />
          <Actions flow={flow} extra={newPlan} />
          <Provenance flow={flow} />
        </div>
      );
    }

    case "REJECTED": {
      const dismissible = receipt.status === null;
      return (
        <div ref={rootRef} className="exec-cf-res" data-tone="rejected" data-receipt="REJECTED" role="alert" tabIndex={-1} aria-label="Rejected">
          <p className="exec-cf-res-head">
            <Flag kind="rejected" label="Rejected" />
            <span>{receipt.sentence}</span>
          </p>
          <Facts
            label="Reason"
            rows={[
              { label: "Reason", value: receipt.code ?? "None published", mono: receipt.code !== null },
              ...(receipt.code !== null && !receipt.known ? [{ label: "Dictionary", value: "This build has no words for this reason; the word is printed as received." }] : []),
            ]}
          />
          {receipt.status !== null ? <StatusBody status={receipt.status} /> : null}
          {receipt.nextAction === "REVIEW_BLOCKER" ? <p className="exec-cf-next">Review the blocker. Do not create a new key to get around it.</p> : null}
          {receipt.nextAction === "QUERY_SAME_INTENT" ? <p className="exec-cf-next">Query the same intent. Do not create a new command or a new key.</p> : null}
          <QueryBlock flow={flow} />
          <Actions
            flow={flow}
            extra={dismissible
              ? <button type="button" className="exec-cf-btn" data-variant="primary" onClick={flow.dismissRefusal}>Change the request</button>
              : newPlan}
          />
          <Provenance flow={flow} rows={receipt.code !== null ? [`reason ${showable(receipt.code, 120)}`] : []} />
        </div>
      );
    }

    case "DENIED": {
      const href = operationHref(receipt.decision.operationId);
      return (
        <div ref={rootRef} className="exec-cf-res" data-tone="denied" data-receipt="DENIED" role="alert" tabIndex={-1} aria-label="Denied by the relay">
          <p className="exec-cf-res-head">
            <Flag kind="rejected" label="Denied" />
            <span>The command relay denied this before any relay or source call. Nothing reached the Trading System, and a retry is not offered.</span>
          </p>
          <Facts
            label="Denial"
            rows={[
              { label: "Operation", value: receipt.decision.operationId, mono: true },
              { label: "Reason", value: receipt.decision.reason, mono: true },
              { label: "Retry allowed", value: receipt.decision.retryAllowed ? "Yes" : "No" },
              { label: "Stored answer repeated", value: receipt.decision.replayed ? "Yes: the server already knew this key" : "No: first answer for this key" },
              { label: "Request sent to the Trading System", value: receipt.decision.sourceRequestSent ? "Possibly: verify first" : "No" },
            ]}
          />
          <QueryBlock flow={flow} />
          <Actions
            flow={flow}
            extra={(
              <>
                {href !== null ? <Link className="exec-cf-btn" data-variant="primary" to={withContext(href, params)}>Open in Operations</Link> : null}
                {newPlan}
              </>
            )}
          />
          <Provenance flow={flow} rows={[`reason ${receipt.decision.reason}`]} />
        </div>
      );
    }

    case "UNKNOWN":
      return (
        <div ref={rootRef} className="exec-cf-res" data-tone="unknown" data-receipt="UNKNOWN" role="alert" tabIndex={-1} aria-label="Outcome unknown">
          <p className="exec-cf-res-head">
            <Flag kind="unknown" label="Outcome unknown" />
            <span><b>This command may already have been applied.</b> {UNKNOWN_COPY[receipt.why]}</span>
          </p>
          <p className="exec-cf-meta">
            The fields are locked while this stands. Retrying sends the same request again under the same key
            {flow.requestKey !== null ? <> (<span className="exec-cf-id">{showable(flow.requestKey, 120)}</span>)</> : null}, so if the first send landed the server answers with it instead of creating another.
          </p>
          {receipt.status !== null ? <StatusBody status={receipt.status} /> : null}
          {flow.commandId === null ? (
            <p className="exec-cf-meta" data-absent="command-id">No command id came back, so there is nothing to query by. Retrying under the same key is the only safe way to find out.</p>
          ) : null}
          <QueryBlock flow={flow} />
          {asking ? (
            <div className="exec-cf-confirm" role="alertdialog" aria-label="Discard this unknown command?">
              <p className="exec-cf-confirm-title">{DISCARD_WARNING}</p>
              <p className="exec-cf-meta">Discarding forgets the key. The fields stay as they are, and sending again would create a second command.</p>
              <div className="exec-cf-acts">
                <button ref={keepKey} type="button" className="exec-cf-btn" data-variant="primary" onClick={() => setAsking(false)}>Keep the request</button>
                <button type="button" className="exec-cf-btn" onClick={() => flow.discardUncertain()}>Discard anyway</button>
              </div>
            </div>
          ) : (
            <Actions
              flow={flow}
              extra={(
                <>
                  <button
                    type="button"
                    className="exec-cf-btn"
                    data-variant="primary"
                    aria-disabled={flow.submitting}
                    title={flow.submitting ? "A send is in progress; wait for its answer." : undefined}
                    onClick={() => { if (!flow.submitting) flow.retry(); }}
                  >
                    {flow.submitting ? "Sending…" : "Retry with the same key"}
                  </button>
                  <button
                    type="button"
                    className="exec-cf-btn"
                    aria-disabled={flow.submitting}
                    title={flow.submitting ? "A send is in progress; wait for its answer." : undefined}
                    onClick={() => { if (!flow.submitting) setAsking(true); }}
                  >
                    Discard
                  </button>
                </>
              )}
            />
          )}
          <Provenance flow={flow} rows={[`unknown: ${receipt.why}`, ...(receipt.httpStatus !== null ? [`http ${receipt.httpStatus}`] : [])]} />
        </div>
      );

    case "ACCESS_STOPPED":
      return (
        <div ref={rootRef} className="exec-cf-res" data-tone="stopped" data-receipt="ACCESS_STOPPED" role="alert" tabIndex={-1} aria-label="Access changed">
          <p className="exec-cf-res-head">
            <Flag kind="attention" label="Access changed" />
            <span>Your access to this command changed (HTTP {receipt.httpStatus}). The plan, your reason and the earlier receipt are no longer shown.</span>
          </p>
          <p className="exec-cf-meta">Whether the command was applied is not shown here. Nothing is restored by signing in again; ask whoever owns the grant.</p>
          <div className="exec-cf-acts">
            <Link className="exec-cf-btn" data-variant="primary" to={accessHref}>My access</Link>
            {newPlan}
          </div>
          <FakePortNote flow={flow} />
        </div>
      );
  }
}
