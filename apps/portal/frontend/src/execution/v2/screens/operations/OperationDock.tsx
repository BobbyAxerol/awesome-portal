/**
 * The queue row dock: every published field of one `operation_id`, the axes
 * that are not published said plainly, and Acknowledge / Resolve disabled
 * with a reason (D9). Triage is a Portal record, so nothing here claims the
 * source was touched.
 */
import { Drawer, DockAction, type DockMode } from "../../Drawer";
import { Flag } from "../../Flag";
import { formatAsOf } from "../../boundary";
import type { InstantV2, OperationV2 } from "../../readers/operationalQueue";
import { ENV_LABEL } from "../../urlState";
import { PanelState } from "../../../components/states";
import { ACCESS_PATH, FE, NotPublished, notPublishedReason } from "./notPublished";
import {
  CHECK_ORIGINAL_COPY, humanize, receiptOutcome, severityWord, TARGET_LABEL, triageOutcome,
} from "./outcome";

import "../../css/operations.css";

export const ACK_REASON = notPublishedReason(
  FE.eligibility,
  "ADMIN-only write, not offered yet.",
);
export const RESOLVE_REASON = notPublishedReason(
  FE.eligibility,
  "Needs a reason and evidence, not offered yet.",
);

function instant(value: InstantV2 | null, absent: string) {
  return value === null ? absent : <time dateTime={value.iso} title={value.iso}>{formatAsOf(value.ms)}</time>;
}

export interface OperationDockProps {
  /** `sel` from the URL: the operation id the reader asked for. */
  operationId: string;
  /** The loaded row, or null when it is not among the loaded pages. */
  row: OperationV2 | null;
  /** True while the first page is still loading, so "not loaded" is not claimed early. */
  loading: boolean;
  mode: DockMode;
  onClose(): void;
}

export const SEND_AGAIN_REASON = "Blocked until the outcome is known.";

export function OperationDock({ operationId, row, loading, mode, onClose }: OperationDockProps) {
  const outcomeUnknown = row !== null && receiptOutcome(row.sourceStatus, row.verificationResult).checkOriginal;
  const actions = (
    <>
      {outcomeUnknown ? <DockAction label="Send again" reason={SEND_AGAIN_REASON} /> : null}
      <DockAction label="Acknowledge" reason={ACK_REASON} accessHref={ACCESS_PATH} />
      <DockAction label="Resolve" reason={RESOLVE_REASON} accessHref={ACCESS_PATH} />
    </>
  );
  if (row === null) {
    return (
      <Drawer title="Operation" subtitle={operationId} onClose={onClose} mode={mode} actions={actions}>
        {loading ? (
          <PanelState status="loading" />
        ) : (
          <PanelState
            status="empty"
            title="Not in the loaded rows"
            reason="This operation is not on the pages loaded for the current filters. Load more or clear a filter."
          />
        )}
      </Drawer>
    );
  }
  const outcome = receiptOutcome(row.sourceStatus, row.verificationResult);
  const triage = triageOutcome(row.triageState);
  return (
    <Drawer title={row.commandKey} subtitle={row.operationId} onClose={onClose} mode={mode} actions={actions}>
      {outcome.checkOriginal ? <p className="exec-ops-banner" data-tone="unknown">{CHECK_ORIGINAL_COPY}</p> : null}
      <dl className="exec-ops-facts">
        <dt>Receipt</dt>
        <dd><Flag kind={outcome.kind} label={outcome.label} size="sm" /></dd>
        <dt>Source status</dt>
        <dd>{humanize(row.sourceStatus)}</dd>
        <dt>Verification</dt>
        <dd>{humanize(row.verificationResult)}</dd>
        <dt>Triage</dt>
        <dd><Flag kind={triage.kind} label={triage.label} size="sm" /></dd>
        <dt>Target</dt>
        <dd><span className="exec-ops-mono">{TARGET_LABEL[row.targetType]} {row.targetId}</span></dd>
        <dt>Environment</dt>
        <dd>{ENV_LABEL[row.environment]}</dd>
        <dt>Severity</dt>
        <dd>{severityWord(row.severity)}</dd>
        <dt>Risk tier</dt>
        <dd>{humanize(row.riskTier)}</dd>
        <dt>Authority</dt>
        <dd>{humanize(row.sourceAuthority)}</dd>
        <dt>Created</dt>
        <dd>{instant(row.createdAt, "")}</dd>
        <dt>Updated</dt>
        <dd>{instant(row.updatedAt, "")}</dd>
        <dt>Acknowledged</dt>
        <dd>{instant(row.acknowledgedAt, "Not acknowledged")}</dd>
        <dt>Resolved</dt>
        <dd>{instant(row.resolvedAt, "Not resolved")}</dd>
        <dt>Version</dt>
        <dd><span className="exec-ops-mono">{row.workflowVersion}</span></dd>
      </dl>
      <h3 className="exec-ops-section">Not published</h3>
      <ul className="exec-ops-np-list">
        <li><NotPublished id={FE.intent}>Intent axis: whether the command was only previewed.</NotPublished></li>
        <li><NotPublished id={FE.receipts}>Display axis: whether the figures shown have caught up.</NotPublished></li>
        <li><NotPublished id={FE.receipts}>Amounts: requested, applied and pending.</NotPublished></li>
        <li><NotPublished id={FE.audit}>Who acknowledged or resolved it.</NotPublished></li>
      </ul>
    </Drawer>
  );
}
