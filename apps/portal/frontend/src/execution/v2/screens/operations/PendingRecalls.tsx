/**
 * Open recalls the Portal controlled on the dock's target (FE-062), read once when the dock opens on a PORTFOLIO or DEPLOYMENT.
 *
 * What it says, and what it will not:
 * - the list is `portal.execution.pending-recall-discovery.v1`, exact resource only. It is the Portal's own control history, never a
 *   census: the coverage sentence and the `untracked_recalls` reason are always printed, also when the list is empty. An empty list
 *   reads "No open recall that the Portal controlled", never "no open recall";
 * - the five CAS counters (budget, source, parent, book, command) are printed exactly as published, as strings, and only for a
 *   recall whose last receipt is known. They are a starting point, not an authority: the next preview rechecks them against the source;
 * - an UNKNOWN recall (a control was sent, no receipt is known) has no amounts and no counters. It says so; it never prints zero;
 * - a recall is never invented, closed or reordered here. A failed read says it failed and shows no list at all;
 * - the list sends nothing. Where the build enables command previews (flag `command`) each recall with known versions also carries the
 *   "Preview control" form (`PendingControlPreview`), which sends a rollback preview and never applies; otherwise no button is drawn.
 */
import { useEffect, useState, type ReactNode } from "react";

import type { ExecutionApi } from "../../../api/ports";
import { formatAsOf } from "../../boundary";
import { PENDING_VERSION_KEYS, AMOUNT_KEYS } from "../../readers/commandCurrency";
import type { PendingRecallDiscovery, DiscoveredRecall } from "../../readers/pendingRecallDiscovery";
import type { CommandEnvironment } from "../../readers/commandCurrency";
import type { TargetTypeV2 } from "../../readers/operationalQueue";
import { PendingControlPreview } from "./PendingControlPreview";

import "../../css/operations.css";

/** The sentence that keeps the list from being read as a census. */
export const RECALL_COVERAGE_COPY = "Only recalls the Portal itself controlled are listed.";
export const UNTRACKED_RECALLS_COPY = "Recalls not started through the Portal cannot be discovered here";
export const EMPTY_RECALLS_COPY = "No open recall that the Portal controlled on this target.";
export const UNKNOWN_RECALL_COPY = "Outcome unknown. A control was sent and the Portal holds no receipt for it, so there are no amounts and no versions to show.";

const AMOUNT_LABEL = { requested: "Requested", applied: "Applied", pending: "Pending", cancelled: "Cancelled", rejected: "Rejected" } as const;
const VERSION_LABEL = { budget: "Budget", source: "Source", parent: "Parent", book: "Book", command: "Command" } as const;
const OPERATION_LABEL = { APPLY_PENDING: "Apply pending", CANCEL_REMAINING: "Cancel remaining" } as const;

export type PendingRecallsLoad =
  | { phase: "loading" }
  | { phase: "ready"; discovery: PendingRecallDiscovery }
  | { phase: "unavailable"; reason: string }
  | { phase: "unsupported"; schemaVersion: string | null };

/** Targets the discovery can answer for: exactly PORTFOLIO and DEPLOYMENT (an ACCOUNT has no pending recall of its own). */
export function discoverable(targetType: TargetTypeV2): targetType is "PORTFOLIO" | "DEPLOYMENT" {
  return targetType === "PORTFOLIO" || targetType === "DEPLOYMENT";
}

/** One read per target, no poll. A late answer for a target the dock has left is dropped. */
export function usePendingRecalls(api: ExecutionApi, workspaceId: string | undefined, targetType: "PORTFOLIO" | "DEPLOYMENT", targetId: string, environment: CommandEnvironment): PendingRecallsLoad {
  const [state, setState] = useState<PendingRecallsLoad>({ phase: "loading" });
  useEffect(() => {
    let live = true;
    setState({ phase: "loading" });
    const fail = (reason: string) => {
      if (live) setState({ phase: "unavailable", reason });
    };
    if (workspaceId === undefined || workspaceId === "") {
      fail("The workspace of this row is not known, so the discovery was not asked.");
      return () => {
        live = false;
      };
    }
    try {
      Promise.resolve(api.getPendingRecallDiscovery({ workspaceId, resourceKind: targetType, resourceId: targetId, environment })).then(
        (result) => {
          if (!live) return;
          if (!result.ok) return fail(result.reason);
          if (result.value.kind === "unsupported_shape") setState({ phase: "unsupported", schemaVersion: result.value.schemaVersion });
          else setState({ phase: "ready", discovery: result.value.discovery });
        },
        () => fail("The discovery never reached the Portal."),
      );
    } catch {
      fail("The discovery could not be asked.");
    }
    return () => {
      live = false;
    };
  }, [api, workspaceId, targetType, targetId, environment]);
  return state;
}

interface PreviewWiring {
  api: ExecutionApi;
  workspaceId: string | undefined;
  resource: { kind: "PORTFOLIO" | "DEPLOYMENT"; id: string };
  environment: CommandEnvironment;
  policyRevision: string | null;
}

function Recall({ item, preview }: { item: DiscoveredRecall; preview: PreviewWiring | null }) {
  return (
    <li className="exec-ops-recall" data-state={item.state}>
      <dl className="exec-ops-facts">
        <dt>Recall</dt>
        <dd><span className="exec-ops-mono">{item.originalRecallId}</span></dd>
        <dt>State</dt>
        <dd>{item.state === "WAITING_ENCUMBRANCE" ? "Waiting for encumbrance" : "Unknown"}</dd>
        <dt>Currency</dt>
        <dd><span className="exec-ops-mono">{item.currency}</span></dd>
        {item.recipientAccountId !== null ? (
          <>
            <dt>Owning account</dt>
            <dd><span className="exec-ops-mono">{item.recipientAccountId}</span></dd>
          </>
        ) : null}
        <dt>Last control</dt>
        <dd>{OPERATION_LABEL[item.lastOperation]}</dd>
        <dt>Updated</dt>
        <dd><time dateTime={new Date(item.updatedAt).toISOString()}>{formatAsOf(item.updatedAt)}</time></dd>
        {item.state === "WAITING_ENCUMBRANCE" ? (
          <>
            {AMOUNT_KEYS.map((key) => (
              <FactPair key={key} label={AMOUNT_LABEL[key]} value={<span className="exec-ops-mono" title={item.amounts[key].fullText}>{item.amounts[key].fullText}</span>} />
            ))}
            {PENDING_VERSION_KEYS.map((key) => (
              <FactPair key={key} label={`${VERSION_LABEL[key]} version`} value={<span className="exec-ops-mono">{item.versions[key]}</span>} />
            ))}
            <dt>Last receipt</dt>
            <dd><span className="exec-ops-mono">{item.latestReceiptId}</span></dd>
            <dt>Last command</dt>
            <dd><span className="exec-ops-mono">{item.lastKnownCommandId}</span></dd>
          </>
        ) : (
          <>
            <dt>Amounts</dt>
            <dd>{UNKNOWN_RECALL_COPY}</dd>
          </>
        )}
        {item.unresolvedCommandId !== null ? (
          <>
            <dt>Newer control</dt>
            <dd>
              <span className="exec-ops-mono">{item.unresolvedCommandId}</span> has no known outcome yet.
              {item.state === "WAITING_ENCUMBRANCE" ? " The amounts and versions above are still the last known receipt's." : ""}
            </dd>
          </>
        ) : null}
      </dl>
      {item.state === "WAITING_ENCUMBRANCE" ? (
        <p className="exec-ops-recall-note">
          Versions are the last known receipt&apos;s, shown as published. A change at the source makes them stale; a preview rechecks them before anything is sent.
        </p>
      ) : null}
      {preview === null ? null : (
        <PendingControlPreview
          api={preview.api}
          target={{ workspaceId: preview.workspaceId ?? null, resource: preview.resource, environment: preview.environment, recall: item, policyRevision: preview.policyRevision }}
        />
      )}
    </li>
  );
}

function FactPair({ label, value }: { label: string; value: ReactNode }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
}

export interface PendingRecallsSectionProps {
  api: ExecutionApi;
  workspaceId: string | undefined;
  targetType: "PORTFOLIO" | "DEPLOYMENT";
  targetId: string;
  environment: CommandEnvironment;
  /**
   * Draw the "Preview control" form under each recall. Off (the default) draws nothing: the command stays dark. The build's `command`
   * flag turns it on (OperationDock); a test passes it explicitly.
   */
  previewEnabled?: boolean;
  /** The opaque Portal policy revision the preview must name, only if a read served it. `null` = none does (the form is then shut with that gap). */
  policyRevision?: string | null;
}

export function PendingRecallsSection({ api, workspaceId, targetType, targetId, environment, previewEnabled = false, policyRevision = null }: PendingRecallsSectionProps) {
  const load = usePendingRecalls(api, workspaceId, targetType, targetId, environment);
  const preview: PreviewWiring | null = previewEnabled ? { api, workspaceId, resource: { kind: targetType, id: targetId }, environment, policyRevision } : null;
  return (
    <section aria-label="Open recalls the Portal controlled" data-testid="pending-recalls">
      <h3 className="exec-ops-section">Open recalls the Portal controlled</h3>
      {load.phase === "loading" ? <p className="exec-ops-recall-note" role="status">Reading the Portal&apos;s pending-recall history for this target.</p> : null}
      {load.phase === "unavailable" ? (
        <p className="exec-ops-banner" data-tone="unknown" role="status">The open recalls could not be read, so none is shown: {load.reason}</p>
      ) : null}
      {load.phase === "unsupported" ? (
        <p className="exec-ops-banner" data-tone="unknown" role="status">
          The server answered a shape this build does not read ({load.schemaVersion ?? "no schema version"}), so no recall is shown.
        </p>
      ) : null}
      {load.phase === "ready" ? (
        <>
          <p className="exec-ops-recall-note">
            {RECALL_COVERAGE_COPY} {UNTRACKED_RECALLS_COPY}
            {" "}
            <span className="exec-ops-np-reason">Not published: {load.discovery.untrackedRecalls.reasonCode}</span>
          </p>
          {load.discovery.items.length === 0 ? <p className="exec-ops-recall-note">{EMPTY_RECALLS_COPY}</p> : (
            <ul className="exec-ops-recalls" aria-label="Open recalls">
              {load.discovery.items.map((item) => <Recall key={item.originalRecallId} item={item} preview={preview} />)}
            </ul>
          )}
          {load.discovery.truncated ? (
            <p className="exec-ops-recall-note">Showing the newest {load.discovery.items.length}. More open recalls matched than one page holds.</p>
          ) : null}
          <p className="exec-ops-recall-note">
            Read <time dateTime={new Date(load.discovery.observedAt).toISOString()}>{formatAsOf(load.discovery.observedAt)}</time> (Portal clock).
          </p>
        </>
      ) : null}
    </section>
  );
}
