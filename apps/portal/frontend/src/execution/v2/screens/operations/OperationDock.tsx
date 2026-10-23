/**
 * The queue row dock (the hi-fi ops drawer): one `operation_id` as THREE separate facts, Intent, Receipt and Display, each in its own
 * section with its own provenance and its own timestamps, then what a person has done in the Portal (triage), the incidents it is
 * linked to (FE-042), the target it acts on, and the typed Pending control entry (only through the FIXTURE LAB preview mount).
 *
 * The three facts are never merged (a receipt is not a display, a display is not an intent):
 *   Intent   whether the command was submitted or only previewed. Not published (FE-020); said as that, with the timestamp the row
 *            does publish (when the operation was recorded).
 *   Receipt  what the source did and what verification observed (`source_status`, `verification_result`), the delivery axis
 *            (FE-CAT-2) when published, the source authority, and when the row last changed and when it was read.
 *   Display  whether the figures shown have caught up (FE-CAT-2 `display_state`); omitted and null stay different typed gaps, and
 *            the time the Portal counted display lag is printed when the queue published it.
 * Acknowledge / Resolve stay disabled with a reason (D9). Triage is a Portal record, so nothing here claims the source was touched.
 */
import type { ReactNode } from "react";
import type { To } from "react-router-dom";

import type { ExecutionApi } from "../../../api/ports";
import type { UtcEpochMs } from "../../../screenDataContract";
import { Drawer, DockAction, type DockMode } from "../../Drawer";
import { Flag } from "../../Flag";
import { formatAsOf } from "../../boundary";
import type { DeliveryStateV2, DisplayStateV2, InstantV2, OperationV2 } from "../../readers/operationalQueue";
import { isV2Screen } from "../../flags";
import { ENV_LABEL } from "../../urlState";
import { PanelState } from "../../../components/states";
import { ACCESS_PATH, FE, notPublishedReason } from "./notPublished";
import { NaWhy, NotAvailableLine } from "../../blocks";
import type { FlagKind } from "../../flagKinds";
import { IncidentLinks } from "./IncidentLinks";
import {
  CHECK_ORIGINAL_COPY, commandLabel, humanize, receiptOutcome, severityWord, TARGET_LABEL, triageOutcome,
} from "./outcome";
import { PendingRecallsSection, discoverable } from "./PendingRecalls";
import { isLabWorkspace } from "./pendingControlIntent";
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

/** The delivery axis in words (FE-CAT-2): a published value restated, never derived. */
const DELIVERY_FACT: Readonly<Record<DeliveryStateV2, { kind: FlagKind; label: string }>> = {
  NOT_APPLICABLE: { kind: "na", label: "No receipt expected" },
  AWAITING_RECEIPT: { kind: "pending", label: "Awaiting receipt" },
  RECEIPT_CONFIRMED: { kind: "applied", label: "Receipt confirmed" },
  RECEIPT_FAILED: { kind: "rejected", label: "Receipt failed" },
};
const DISPLAY_FACT: Readonly<Record<DisplayStateV2, { kind: FlagKind; label: string }>> = {
  CURRENT: { kind: "ok", label: "Current" },
  CATCHING_UP: { kind: "display", label: "Catching up" },
  STALE: { kind: "stale", label: "Stale" },
};

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
  /** When the queue read was taken (`observed_at_ms`): the Receipt section's read time. */
  observedAtMs?: UtcEpochMs | null;
  /** When the Portal counted display lag (`health.display_lag_count.observed_at`): the Display section's counted-at time. */
  displayCountedAt?: InstantV2 | null;
  /** The incident page, and the in-queue peek of the same incident (FE-042 links). */
  incidentTo?(incidentId: string): To;
  peekTo?(incidentId: string): To;
}

export const SEND_AGAIN_REASON = "Blocked until the outcome is known.";

function Section({ name, children }: { name: string; children: ReactNode }) {
  return (
    <section aria-label={name} data-section={name}>
      <h4 className="exec-ops-section">{name}</h4>
      {children}
    </section>
  );
}

export function OperationDock({
  operationId, row, loading, mode, onClose, api, workspaceId, observedAtMs = null, displayCountedAt = null, incidentTo, peekTo,
}: OperationDockProps) {
  // DEBT-048 item 9: the preview form is a FIXTURE LAB mount. It needs the `pending-preview` key (never named by a product build) AND an
  // explicit TEST_ONLY workspace; neither the `command` key nor a real workspace turns it on.
  const labPreview = isV2Screen("pending-preview") && isLabWorkspace(workspaceId);
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
  const delivery = row.deliveryState ? DELIVERY_FACT[row.deliveryState] : null;
  return (
    <Drawer title={`${TARGET_LABEL[row.targetType]} ${row.targetId}`} subtitle={`${commandLabel(row.commandKey)} · ${row.operationId}`} onClose={onClose} mode={mode} actions={actions}>
      {outcome.checkOriginal ? <p className="exec-ops-banner" data-tone="unknown">{CHECK_ORIGINAL_COPY}</p> : null}

      <Section name="Intent">
        <dl className="exec-ops-facts">
          <dt>Sent or previewed</dt>
          <dd><NaWhy reason={`Not published (${FE.intent}): whether the command was sent or only previewed.`} /></dd>
          <dt>Recorded</dt>
          <dd>{instant(row.createdAt, "")}</dd>
          <dt>Command</dt>
          <dd><span className="exec-ops-mono">{row.commandKey}</span></dd>
        </dl>
        <p className="exec-ops-reason" data-role="provenance">Source: the Portal command record. It publishes when the operation was recorded, not whether it was only a preview.</p>
      </Section>

      <Section name="Receipt">
        <dl className="exec-ops-facts">
          <dt>Receipt</dt>
          <dd><Flag kind={outcome.kind} label={outcome.label} size="sm" /></dd>
          <dt>Source status</dt>
          <dd>{humanize(row.sourceStatus)}</dd>
          <dt>Verification</dt>
          <dd>{humanize(row.verificationResult)}</dd>
          <dt>Delivery</dt>
          <dd>
            {row.deliveryState === undefined ? <NaWhy reason={`Not published (${FE.receipts}): whether a receipt has arrived for this row.`} />
              : row.deliveryState === null ? <NaWhy reason={`Not published (${FE.receipts}): the source did not report a receipt state for this row.`} />
              : <Flag kind={delivery!.kind} label={delivery!.label} size="sm" />}
          </dd>
          <dt>Authority</dt>
          <dd>{humanize(row.sourceAuthority)}</dd>
          <dt>Updated</dt>
          <dd>{instant(row.updatedAt, "")}</dd>
          <dt>Read at</dt>
          <dd>{observedAtMs !== null && observedAtMs > 0 ? <time dateTime={new Date(observedAtMs).toISOString()}>{formatAsOf(observedAtMs)}</time> : "Not stated"}</dd>
        </dl>
        <p className="exec-ops-reason" data-role="provenance">Source: {humanize(row.sourceAuthority).toLowerCase()} authority, read through the Portal queue. Queue SUCCEEDED is the record state only, not a financial or venue result.</p>
      </Section>

      <Section name="Display">
        <dl className="exec-ops-facts">
          <dt>Display</dt>
          <dd>
            {row.displayState === undefined ? <NaWhy reason={`Not published (${FE.receipts}): whether the figures shown have caught up.`} />
              : row.displayState === null ? <NaWhy reason={`Not published (${FE.receipts}): the source did not report whether the figures shown have caught up for this row.`} />
              : <Flag kind={DISPLAY_FACT[row.displayState].kind} label={DISPLAY_FACT[row.displayState].label} size="sm" />}
          </dd>
          <dt>Counted</dt>
          <dd>{displayCountedAt !== null ? instant(displayCountedAt, "") : "Not stated"}</dd>
        </dl>
        <p className="exec-ops-reason" data-role="provenance">Source: the projection display state. It is the screen&apos;s own figures catching up, never the receipt.</p>
      </Section>

      <Section name="Triage">
        <dl className="exec-ops-facts">
          <dt>Triage</dt>
          <dd><Flag kind={triage.kind} label={triage.label} size="sm" /></dd>
          <dt>Acknowledged</dt>
          <dd>{instant(row.acknowledgedAt, "Not acknowledged")}</dd>
          <dt>Resolved</dt>
          <dd>{instant(row.resolvedAt, "Not resolved")}</dd>
          <dt>Version</dt>
          <dd><span className="exec-ops-mono">{row.workflowVersion}</span></dd>
        </dl>
      </Section>

      <Section name="Operation">
        <dl className="exec-ops-facts">
          <dt>Target</dt>
          <dd><TargetLink className="exec-ops-mono" type={row.targetType} id={row.targetId} environment={row.environment} /></dd>
          <dt>Environment</dt>
          <dd>{ENV_LABEL[row.environment]}</dd>
          <dt>Severity</dt>
          <dd>{severityWord(row.severity)}</dd>
          <dt>Risk tier</dt>
          <dd>{humanize(row.riskTier)}</dd>
          <dt>Created</dt>
          <dd>{instant(row.createdAt, "")}</dd>
        </dl>
        {row.targetType === "ACCOUNT" ? <p className="exec-ops-reason">The account page lists its broker bindings.</p> : null}
      </Section>

      {incidentTo ? (
        <Section name="Linked incidents">
          <IncidentLinks operationId={row.operationId} links={row.incidentLinks} to={incidentTo} peekTo={peekTo} />
        </Section>
      ) : null}

      {api !== undefined && discoverable(row.targetType) ? (
        <PendingRecallsSection api={api} workspaceId={workspaceId} targetType={row.targetType} targetId={row.targetId} environment={row.environment} previewEnabled={labPreview} previewSimulation />
      ) : null}
      <NotAvailableLine
        className="exec-ops-na-line"
        facts={[
          { label: "Amounts", id: FE.receipts, why: "Requested, applied and pending" },
          { label: "Who acknowledged or resolved it", id: FE.audit },
        ]}
      />
    </Drawer>
  );
}
