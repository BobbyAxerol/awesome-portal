/**
 * Small, static parts of the command flow: fact lists, the four answers of a capital status, an amounts table, and what a lookup found.
 * Every string that came from outside goes through `showable`, so a hostile character in an id is spelled out, never interpreted.
 */
import { Link, useSearchParams } from "react-router-dom";

import { formatUtcEpochMs } from "../../../screenDataContract";
import { notPublishedText } from "../../blocks";
import { Flag } from "../../Flag";
import type { CommandStatusV1 } from "../../readers/commandCurrency";
import type { CommandOperationV1 } from "../../readers/commandOperation";
import { withContext } from "../../urlState";
import { receiptOutcome } from "../operations/outcome";
import type { LookupView } from "./lookup";
import { NEXT_ACTION_COPY, NOT_PUBLISHED_REJECT_REASON, operationHref, showable, statusFacets, venueNeedsFillDetail } from "./model";

import "../../css/command.css";

export function Facts({ rows, label }: { rows: readonly { label: string; value: string; mono?: boolean }[]; label?: string }) {
  return (
    <dl className="exec-cf-facts" aria-label={label}>
      {rows.map((row) => (
        <div key={row.label}>
          <dt>{row.label}</dt>
          <dd className={row.mono ? "exec-cf-mono" : undefined}>{showable(row.value, 400)}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The four answers of a capital status, never merged: delivery, business, projection, venue. */
export function FacetList({ status }: { status: CommandStatusV1 }) {
  return (
    <ul className="exec-cf-facets" aria-label="Four independent answers">
      {statusFacets(status).map((facet) => (
        <li key={facet.dimension} data-dimension={facet.dimension.toLowerCase()}>
          <span className="exec-cf-facet-name">{facet.dimension}</span>
          <Flag kind={facet.kind} label={facet.label} size="sm" />
          <span className="exec-cf-meta">{facet.note}</span>
        </li>
      ))}
    </ul>
  );
}

const AMOUNT_ROWS = [
  ["Requested", "requested"], ["Applied", "applied"], ["Pending", "pending"], ["Cancelled", "cancelled"], ["Rejected", "rejected"],
] as const;

/** Exact amounts with their unit, or the typed absence. `null` is "no amounts published yet", never zero. */
export function Amounts({ status }: { status: CommandStatusV1 }) {
  const amounts = status.business.amounts;
  if (amounts === null) {
    return <p className="exec-cf-meta" data-absent="amounts">No amounts published yet. That is not zero.</p>;
  }
  return (
    <dl className="exec-cf-facts" aria-label="Amounts">
      {AMOUNT_ROWS.map(([label, key]) => (
        <div key={key}>
          <dt>{label}</dt>
          <dd className="exec-cf-mono" title={amounts[key].fullText}>{showable(amounts[key].fullText, 200)}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The whole capital status: provenance of the fixture, the four answers, amounts, ids and the next step. */
export function StatusBody({ status }: { status: CommandStatusV1 }) {
  return (
    <div className="exec-cf-status" data-authority={status.authority}>
      {status.authority === "TEST_ONLY" ? (
        <p className="exec-cf-meta" data-notice="test-only">Fixture status (authority TEST_ONLY). Not a product receipt: no source produced it.</p>
      ) : null}
      <FacetList status={status} />
      {venueNeedsFillDetail(status) ? (
        <p className="exec-cf-meta" data-absent="fill">Fill quantity and partial fills: {notPublishedText("FE-032")}. The venue answer above is all the receipt says.</p>
      ) : null}
      <Amounts status={status} />
      <Facts
        label="Receipt references"
        rows={[
          { label: "Command id", value: status.commandId, mono: true },
          { label: "Receipt", value: status.business.receiptRef ?? "None yet", mono: status.business.receiptRef !== null },
          { label: "Source event", value: status.business.sourceEventRef ?? "None yet", mono: status.business.sourceEventRef !== null },
          { label: "Revision", value: status.business.revision ?? "None yet", mono: status.business.revision !== null },
          { label: "Last update", value: formatUtcEpochMs(status.updatedAt) },
        ]}
      />
      <p className="exec-cf-next">{NEXT_ACTION_COPY[status.nextAction]}</p>
    </div>
  );
}

/** An F0 operation: a blocked intent. Nothing was sent, and nothing here says a command is running. */
export function OperationBody({ operation }: { operation: CommandOperationV1 }) {
  const outcome = receiptOutcome("BLOCKED", operation.verificationResult);
  const [params] = useSearchParams();
  const href = operationHref(operation.operationId);
  return (
    <div className="exec-cf-status">
      <p className="exec-cf-res-head">
        <Flag kind={outcome.kind} label={outcome.label} />
        <span>This operation is a record that the request was understood and refused. Nothing is running.</span>
      </p>
      <Facts
        label="Operation"
        rows={[
          { label: "Operation", value: operation.operationId, mono: true },
          { label: "Command", value: operation.commandKey, mono: true },
          { label: "Verification", value: "Not started" },
          { label: "Blocked by", value: operation.blockers.join(", "), mono: true },
          { label: "Relay receipt", value: "None: nothing was relayed" },
          { label: "Request sent to the Trading System", value: operation.sourceSideEffectRequested ? "Possibly: verify first" : "No" },
          { label: "Created", value: formatUtcEpochMs(operation.createdAt.ms) },
          { label: "Updated", value: formatUtcEpochMs(operation.updatedAt.ms) },
        ]}
      />
      <p className="exec-cf-meta">Created and updated are Portal times, not source freshness.</p>
      {href !== null ? <Link className="exec-cf-btn" to={withContext(href, params)}>Open in Operations</Link> : null}
    </div>
  );
}

/** What a lookup found, in this build's words. */
export function LookupResult({ view }: { view: LookupView }) {
  switch (view.kind) {
    case "command": return <StatusBody status={view.status} />;
    case "operation": return <OperationBody operation={view.operation} />;
    case "not_found":
      return (
        <p className="exec-cf-res-head" data-lookup="not_found">
          <Flag kind="na" label="Not found" />
          <span>No receipt you can read has this id. An unknown id and one you may not read look the same.</span>
        </p>
      );
    case "access_stopped":
      return (
        <p className="exec-cf-res-head" data-lookup="access_stopped">
          <Flag kind="attention" label="Access changed" />
          <span>You can't read this receipt (HTTP {view.httpStatus}). Nothing is shown from an earlier read.</span>
        </p>
      );
    case "unverified":
      return (
        <p className="exec-cf-res-head" data-lookup="unverified">
          <Flag kind="unknown" label="Not verified" />
          <span>The receipt could not be verified. That is not proof that nothing happened.</span>
        </p>
      );
    case "unreadable":
      return (
        <p className="exec-cf-res-head" data-lookup="unreadable">
          <Flag kind="unknown" label="Unreadable" />
          <span>The answer could not be read, so none of it is shown.</span>
        </p>
      );
    case "no_response":
      return (
        <p className="exec-cf-res-head" data-lookup="no_response">
          <Flag kind="unknown" label="No answer" />
          <span>No answer came back. A lookup changes nothing; try again.</span>
        </p>
      );
    case "refused":
      return (
        <p className="exec-cf-res-head" data-lookup="refused">
          <Flag kind="rejected" label="Refused" />
          <span>The server refused the lookup{view.code !== null ? <> with reason <span className="exec-cf-id">{showable(view.code, 80)}</span></> : null}.</span>
        </p>
      );
  }
}

export { NOT_PUBLISHED_REJECT_REASON };
