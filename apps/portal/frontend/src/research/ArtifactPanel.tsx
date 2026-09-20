/**
 * Research Loop — artifact readiness panel (P05 composition scope).
 *
 * Used by Run Progress and Evidence Flow. Every one of the five artifact states
 * keeps this panel in place; only its truth changes. `CORRUPT` and `MISSING`
 * are the ones that matter most: the panel stays, the integrity fact is stated
 * exactly, and the export control is removed rather than left to fail.
 *
 * Export requires three independent facts — sealed, registered, and a server
 * published action. A candidate sealed on disk but unregistered is the case
 * this panel exists to refuse, because handing over bytes the authority has not
 * accepted looks identical to handing over bytes it has.
 */

import type { ReactNode } from "react";

import {
  type ArtifactFacts,
  type ArtifactWindow,
  artifactPanel,
  exactDecimal,
  exactUtcMillis,
  windowCaption,
} from "./artifacts";
import { ResearchPanel, ResearchValue } from "./ResearchPanel";
import { researchState, type ResearchState } from "./state";

export interface ArtifactMetadata {
  /** Exact decimal strings from the server. Never parsed into numbers. */
  byteSize?: string | null;
  rowCount?: string | null;
  coverage?: string | null;
  /** UTC with milliseconds, or null. */
  sealedAt?: string | null;
  manifestRevision?: number | null;
}

export interface ArtifactPanelProps {
  title: string;
  facts: ArtifactFacts;
  metadata?: ArtifactMetadata;
  window?: ArtifactWindow;
  /** Overrides the derived state when the transport itself failed. */
  transportState?: ResearchState;
  /** The server-published export control, rendered only when admitted. */
  exportAction?: ReactNode;
}

/**
 * Artifact state is a property of the artifact; denied and unavailable are
 * properties of the request for it. Both must be expressible, so a transport
 * state takes precedence when one is supplied.
 */
function panelState(facts: ArtifactFacts, transportState?: ResearchState): ResearchState {
  if (transportState) return transportState;
  const panel = artifactPanel(facts);
  if (panel.integrityFailure) {
    return {
      state: "terminal",
      reason: `Artifact is ${facts.state}.`,
      mayRetry: false,
      retainsContent: true,
    };
  }
  if (panel.inProgress) {
    return {
      state: "partial",
      reason: "The artifact is still being written.",
      mayRetry: true,
      retainsContent: true,
    };
  }
  if (facts.state === "ABORTED") {
    return {
      state: "terminal",
      reason: facts.reason ?? "The run was aborted before the artifact was sealed.",
      mayRetry: false,
      retainsContent: true,
    };
  }
  return researchState({ kind: "ok", rowCount: 1 });
}

export function ArtifactPanel({
  title,
  facts,
  metadata = {},
  window,
  transportState,
  exportAction,
}: ArtifactPanelProps) {
  const panel = artifactPanel(facts);
  const state = panelState(facts, transportState);
  // A withheld request must not leak artifact metadata it refused to serve.
  const withheld = transportState?.state === "denied";

  return (
    <ResearchPanel
      title={title}
      meta={
        <span data-artifact-state={facts.state}>
          {facts.state}
          {metadata.manifestRevision != null ? ` · rev ${metadata.manifestRevision}` : ""}
        </span>
      }
      state={state}
      actions={panel.showsExport && !withheld ? exportAction : undefined}
    >
      {withheld ? null : (
        <div className="flex flex-col gap-2">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px]">
            {[
              ["rows", exactDecimal(metadata.rowCount ?? null)],
              ["bytes", exactDecimal(metadata.byteSize ?? null)],
              ["coverage", exactDecimal(metadata.coverage ?? null)],
              ["sealed at", exactUtcMillis(metadata.sealedAt ?? null)],
            ].map(([label, value]) => (
              <div key={label as string} className="contents">
                <dt
                  className="mono text-[10px] uppercase tracking-[.06em]"
                  style={{ color: "var(--ink-faint)" }}
                >
                  {label}
                </dt>
                <dd>
                  <ResearchValue value={value as string | null} />
                </dd>
              </div>
            ))}
          </dl>

          {window ? (
            <p className="mono text-[10px]" style={{ color: "var(--ink-faint)" }}>
              {windowCaption(window)}
              {window.nextCursor ? " · more available" : ""}
            </p>
          ) : null}

          {!panel.showsExport && panel.exportWithheldBecause ? (
            <p
              className="text-[10.5px] leading-[1.5]"
              data-export-withheld
              style={{ color: "var(--ink-soft)" }}
            >
              {panel.exportWithheldBecause}
            </p>
          ) : null}
        </div>
      )}
    </ResearchPanel>
  );
}
