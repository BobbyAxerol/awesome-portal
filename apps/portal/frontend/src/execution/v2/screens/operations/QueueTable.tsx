/**
 * The commands table: four columns, each backed by a published field.
 *
 * Time is `created_at`; Target + operation is the target and `command_key`;
 * Receipt is `source_status` with `verification_result`; Next is
 * `triage_state`. The kit's Intent and Display columns have no source, so they
 * are not columns: the panel above the table says so, with the request id.
 */
import type { ReactNode } from "react";

import { CardsTable, type CardsColumn } from "../../cardsTable";
import { Flag } from "../../Flag";
import { formatAsOf } from "../../boundary";
import type { OperationV2 } from "../../readers/operationalQueue";
import { ENV_LABEL } from "../../urlState";
import { axesText, receiptOutcome, severityWord, TARGET_LABEL, triageOutcome } from "./outcome";

import "../../css/operations.css";

const COLUMNS: readonly CardsColumn<OperationV2>[] = [
  {
    key: "time",
    label: "Time",
    render: (row) => <time dateTime={row.createdAt.iso}>{formatAsOf(row.createdAt.ms)}</time>,
  },
  {
    key: "target",
    label: "Target and operation",
    render: (row) => (
      <span className="exec-ops-target">
        <span className="exec-ops-id">{TARGET_LABEL[row.targetType]} {row.targetId}</span>
        <span className="exec-ops-meta">
          {row.commandKey} · {ENV_LABEL[row.environment]} · {severityWord(row.severity)}
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
      return (
        <span className="exec-ops-cell">
          <Flag kind={triage.kind} label={triage.label} size="sm" />
          {outcome.checkOriginal ? <span className="exec-ops-meta">Check the original request</span> : null}
        </span>
      );
    },
  },
];

export interface QueueTableProps {
  rows: readonly OperationV2[];
  selectedKey: string | null;
  onOpen(row: OperationV2): void;
  empty: ReactNode;
}

export function QueueTable({ rows, selectedKey, onOpen, empty }: QueueTableProps) {
  return (
    <CardsTable
      columns={COLUMNS}
      rows={rows}
      rowKey={(row) => row.operationId}
      label="Commands"
      selectedKey={selectedKey}
      onRowOpen={onOpen}
      empty={empty}
    />
  );
}
