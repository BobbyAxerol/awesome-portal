/**
 * Legacy run export as an explicit two-step action (LEGACY-EXPORT-SEC, Codex P23 handoff 2026-10-01).
 *
 * The backend no longer builds an archive on GET: step one is an ADMIN + same-origin CSRF `POST` that prepares it,
 * step two is the read-only `GET` download. A refusal is shown as the server's own status — never as a dead link —
 * and the old direct-GET anchor is gone. The words stay on the tooltip.
 */
import { Download } from "lucide-react";
import { useState } from "react";

import { PortalApiError, prepareRunExport } from "../../lib/api";

type ExportState = { kind: "idle" } | { kind: "preparing" } | { kind: "refused"; status: number; message: string };

const REFUSAL_WORDS: Record<number, string> = {
  401: "Sign in again to export.",
  403: "Export is for workspace admins.",
  404: "This run has no archive to export in this workspace.",
};

export function RunExportAction({
  runId,
  className,
  label = "Export",
  iconSize = 12,
  download = (href: string) => window.location.assign(href),
}: {
  runId: string;
  className: string;
  label?: string;
  iconSize?: number;
  /** The download navigation; a test replaces it. */
  download?: (href: string) => void;
}) {
  const [state, setState] = useState<ExportState>({ kind: "idle" });
  const busy = state.kind === "preparing";

  const run = async () => {
    setState({ kind: "preparing" });
    try {
      await prepareRunExport(runId);
      setState({ kind: "idle" });
      download(`/api/runs/${encodeURIComponent(runId)}/export`);
    } catch (error) {
      const status = error instanceof PortalApiError ? error.status : 0;
      const message = error instanceof PortalApiError ? error.message : "The export could not be prepared.";
      setState({ kind: "refused", status, message });
    }
  };

  const refusal = state.kind === "refused" ? (REFUSAL_WORDS[state.status] ?? state.message) : null;
  return (
    <span className="inline-flex items-center gap-2 no-print">
      <button
        type="button"
        className={className}
        onClick={() => void run()}
        disabled={busy}
        aria-busy={busy}
        title="Prepares the archive on the server, then downloads it."
        data-export-action={state.kind}
      >
        <Download size={iconSize} />
        {busy ? "Preparing" : label}
      </button>
      {refusal ? (
        <span role="status" className="mono text-[10px]" style={{ color: "var(--warn)" }} data-export-refusal={state.kind === "refused" ? state.status : undefined} title={state.kind === "refused" ? state.message : undefined}>
          {refusal}
        </span>
      ) : null}
    </span>
  );
}
