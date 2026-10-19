/**
 * The commands table: four columns, each backed by a published field.
 *
 * Time is `created_at`; Target + operation is the target and `command_key`;
 * Receipt is `source_status` with `verification_result`; Next is
 * `triage_state`. The kit's Intent and Display columns have no source, so they
 * are not columns: the panel above the table says so, with the request id.
 */
import { useMemo, type MouseEvent, type ReactNode } from "react";

import { CardsTable, type CardsColumn } from "../../cardsTable";
import { Flag } from "../../Flag";
import { formatAsOf } from "../../boundary";
import type { OperationV2 } from "../../readers/operationalQueue";
import { ENV_LABEL } from "../../urlState";
import { axesText, commandLabel, receiptOutcome, severityWord, TARGET_LABEL, triageOutcome } from "./outcome";

import "../../css/operations.css";

function columnsFor(onOpen: (row: OperationV2) => void): readonly CardsColumn<OperationV2>[] {
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
          <span className="exec-ops-id">{TARGET_LABEL[row.targetType]} {row.targetId}</span>
          <span className="exec-ops-meta" title={row.commandKey}>
            {commandLabel(row.commandKey)} · {ENV_LABEL[row.environment]} · {severityWord(row.severity)}
          </span>
        </span>
      ),
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
  empty: ReactNode;
}

export function QueueTable({ rows, selectedKey, onOpen, empty }: QueueTableProps) {
  const columns = useMemo(() => columnsFor(onOpen), [onOpen]);
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
