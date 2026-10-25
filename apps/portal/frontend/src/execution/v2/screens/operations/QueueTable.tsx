/**
 * The commands table, in the hi-fi column order: Time, Target and operation, Intent, Receipt, Display, Next.
 * Intent (FE-020) has no published field, so it is said once above the table (a column of identical placeholders told the reader nothing); Display (FE-032) is a cell per row.
 *
 * Time is `created_at`; Target + operation is the target and `command_key`;
 * Receipt is `source_status` with `verification_result`; Next is
 * `triage_state`. The incidents an operation is linked to (FE-042) sit under the
 * target, so the six kit columns stay six.
 */
import { useMemo, type MouseEvent, type ReactNode } from "react";
import type { To } from "react-router-dom";

import { CardsTable, type CardsColumn } from "../../cardsTable";
import { NaWhy } from "../../blocks";
import { Flag } from "../../Flag";
import { formatAsOf } from "../../boundary";
import type { FlagKind } from "../../flagKinds";
import type { DisplayStateV2, OperationV2 } from "../../readers/operationalQueue";
import { ENV_LABEL } from "../../urlState";
import { IncidentLinks } from "./IncidentLinks";
import { nextActionOf } from "./opsViews";
import { commandLabel, receiptOutcome, severityWord, triageOutcome } from "./outcome";
import { TargetLink } from "./TargetLink";

import "../../css/operations.css";

/** FE-CAT-2 axis words. A word is a published value restated; nothing here is derived from other fields. */
const DISPLAY_WORD: Readonly<Record<DisplayStateV2, { kind: FlagKind; label: string }>> = {
  CURRENT: { kind: "ok", label: "Current" },
  CATCHING_UP: { kind: "pending", label: "Catching up" },
  STALE: { kind: "stale", label: "Stale" },
};

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
      key: "receipt",
      label: "Receipt",
      render: (row) => {
        const outcome = receiptOutcome(row.sourceStatus, row.verificationResult);
        return (
          <span className="exec-ops-cell">
            <Flag kind={outcome.kind} label={outcome.label} size="sm" />
            {/* One badge, then the delivery axis when published. The two axes behind the badge (source status, verification) are in the drawer's Receipt section, in words. */}
          </span>
        );
      },
    },
    {
      key: "display",
      label: "Display",
      render: (row) => {
        // FE-CAT-2: the row's display axis. Omitted (no owning source) and null (the source did not report it) stay typed gaps.
        if (row.displayState === undefined) return <NaWhy reason="Not published (FE-032): whether the figures shown have caught up." />;
        if (row.displayState === null) return <NaWhy reason="Not published (FE-032): the source did not report whether the figures shown have caught up for this row." />;
        const word = DISPLAY_WORD[row.displayState];
        return <Flag kind={word.kind} label={word.label} size="sm" />;
      },
    },
    {
      key: "next",
      label: "Next",
      render: (row) => {
        const triage = triageOutcome(row.triageState);
        const action = nextActionOf(row);
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
            {action === "check-original" ? (
              <>
                <button type="button" className="exec-ops-apply exec-ops-next" data-variant="primary" onClick={open}>Check original request</button>
                <span className="exec-ops-meta">Do not send it again.</span>
              </>
            ) : null}
            {/* The axis is published as CATCHING_UP: the figures are on their way and there is nothing for a person to do yet. */}
            {action === "display-updating" ? <span className="exec-ops-next-text">Display updating</span> : null}
            {action === "open-obligations" ? (
              <TargetLink className="exec-ops-id exec-ops-next-link" type={row.targetType} id={row.targetId} environment={row.environment} label="Open obligations" />
            ) : null}
            {action === "review" && !acted ? <button type="button" className="exec-ops-apply exec-ops-next" onClick={open}>Review</button> : null}
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
