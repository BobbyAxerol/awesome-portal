/**
 * The queue row dock: every published field of one `operation_id`, the axes
 * that are not published said plainly, and Acknowledge / Resolve disabled
 * with a reason (D9). Triage is a Portal record, so nothing here claims the
 * source was touched.
 */
import type { ExecutionApi } from "../../../api/ports";
import { Drawer, DockAction, type DockMode } from "../../Drawer";
import { Flag } from "../../Flag";
import { formatAsOf } from "../../boundary";
import type { InstantV2, OperationV2 } from "../../readers/operationalQueue";
import { isV2Screen } from "../../flags";
import { ENV_LABEL } from "../../urlState";
import { PanelState } from "../../../components/states";
import { ACCESS_PATH, FE, notPublishedReason } from "./notPublished";
import { NotAvailableLine } from "../../blocks";
import {
  CHECK_ORIGINAL_COPY, humanize, receiptOutcome, severityWord, triageOutcome,
} from "./outcome";
import { PendingRecallsSection, discoverable } from "./PendingRecalls";
import { TargetLink } from "./TargetLink";

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
  /**
   * FE-062: when given, a PORTFOLIO or DEPLOYMENT row also lists the open recalls the Portal controlled on that target. Optional and
   * additive: a host that does not pass it renders the dock exactly as before.
   */
  api?: ExecutionApi;
  /** The workspace the queue answered for (the discovery query requires it). */
  workspaceId?: string;
}

export const SEND_AGAIN_REASON = "Blocked until the outcome is known.";

export function OperationDock({ operationId, row, loading, mode, onClose, api, workspaceId }: OperationDockProps) {
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
        <dd><TargetLink className="exec-ops-mono" type={row.targetType} id={row.targetId} environment={row.environment} /></dd>
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
      {api !== undefined && discoverable(row.targetType) ? (
        <PendingRecallsSection api={api} workspaceId={workspaceId} targetType={row.targetType} targetId={row.targetId} environment={row.environment} previewEnabled={isV2Screen("command")} />
      ) : null}
      <NotAvailableLine
        className="exec-ops-na-line"
        facts={[
          { label: "Intent axis", id: FE.intent, why: "Whether the command was only previewed" },
          { label: "Display axis", id: FE.receipts, why: "Whether the figures shown have caught up" },
          { label: "Amounts", id: FE.receipts, why: "Requested, applied and pending" },
          { label: "Who acknowledged or resolved it", id: FE.audit },
        ]}
      />
    </Drawer>
  );
}
