/**
 * The commands table, in the kit's column order: Time, Target and operation,
 * Intent, Receipt, Display, Next.
 *
 * Time is `created_at`; Target + operation is the target and `command_key`;
 * Receipt is `source_status` with `verification_result`; Next is
 * `triage_state`. The incidents an operation is linked to (FE-042) sit under the
 * target, so the six kit columns stay six. Intent (FE-020) and Display (FE-032) have no source yet, so
 * they stay columns, as in the kit, and each cell says "Not published" with its
 * request id instead of the table silently losing two of its six columns.
 */
import { useMemo, type MouseEvent, type ReactNode } from "react";
import type { To } from "react-router-dom";

import { CardsTable, type CardsColumn } from "../../cardsTable";
import { Flag } from "../../Flag";
import { formatAsOf } from "../../boundary";
import type { OperationV2 } from "../../readers/operationalQueue";
import { ENV_LABEL } from "../../urlState";
import { IncidentLinks } from "./IncidentLinks";
import { FE, NotPublished } from "./notPublished";
import { axesText, commandLabel, receiptOutcome, severityWord, triageOutcome } from "./outcome";
import { TargetLink } from "./TargetLink";

import "../../css/operations.css";

function columnsFor(onOpen: (row: OperationV2) => void, incidentTo: (incidentId: string) => To): readonly CardsColumn<OperationV2>[] {
  return [
    {
      key: "time",
      label: "Time",
      render: (row) => <time className="exec-ops-time" dateTime={row.createdAt.iso}>{formatAsOf(row.createdAt.ms)}</time>,
    },
    {
      key: "target",
      label: "Target and operation",
      render: (row) => (
        <span className="exec-ops-target">
          <TargetLink className="exec-ops-id" type={row.targetType} id={row.targetId} environment={row.environment} />
          <span className="exec-ops-meta" title={row.commandKey}>
            {commandLabel(row.commandKey)} · {ENV_LABEL[row.environment]} · {severityWord(row.severity)}
          </span>
          <IncidentLinks operationId={row.operationId} links={row.incidentLinks} to={incidentTo} />
        </span>
      ),
    },
    {
      key: "intent",
      label: "Intent",
      render: () => <NotPublished id={FE.intent} />,
    },
    {
      key: "receipt",
      label: "Receipt",
      render: (row) => {
        const outcome = receiptOutcome(row.sourceStatus, row.verificationResult);
        return (
          <span className="exec-ops-cell">
            <Flag kind={outcome.kind} label={outcome.label} size="sm" />
            <span className="exec-ops-meta">{axesText(row.sourceStatus, row.verificationResult)}</span>
          </span>
        );
      },
    },
    {
      key: "display",
      label: "Display",
      render: () => <NotPublished id={FE.receipts} />,
    },
    {
      key: "next",
      label: "Next",
      render: (row) => {
        const triage = triageOutcome(row.triageState);
        const outcome = receiptOutcome(row.sourceStatus, row.verificationResult);
        // Next is an action. The queue's default lens is already UNACKNOWLEDGED, so repeating that flag on
        // every row says nothing; the triage flag appears only when a person has already acted on the row.
        const acted = row.triageState !== "UNACKNOWLEDGED";
        const open = (event: MouseEvent) => {
          event.stopPropagation();
          onOpen(row);
        };
        return (
          <span className="exec-ops-cell">
            {acted ? <Flag kind={triage.kind} label={triage.label} size="sm" /> : null}
            {outcome.checkOriginal ? (
              <>
                <button type="button" className="exec-ops-apply exec-ops-next" data-variant="primary" onClick={open}>Check original request</button>
                <span className="exec-ops-meta">Do not send it again.</span>
              </>
            ) : acted ? null : (
              <button type="button" className="exec-ops-apply exec-ops-next" onClick={open}>Review</button>
            )}
          </span>
        );
      },
    },
  ];
}

export interface QueueTableProps {
  rows: readonly OperationV2[];
  selectedKey: string | null;
  onOpen(row: OperationV2): void;
  /** The incident drawer route for an incident id (FE-042 links). */
  incidentTo(incidentId: string): To;
  empty: ReactNode;
}

export function QueueTable({ rows, selectedKey, onOpen, incidentTo, empty }: QueueTableProps) {
  const columns = useMemo(() => columnsFor(onOpen, incidentTo), [onOpen, incidentTo]);
  return (
    <CardsTable
      columns={columns}
      rows={rows}
      rowKey={(row) => row.operationId}
      label="Commands"
      selectedKey={selectedKey}
      onRowOpen={onOpen}
      empty={empty}
    />
  );
}
