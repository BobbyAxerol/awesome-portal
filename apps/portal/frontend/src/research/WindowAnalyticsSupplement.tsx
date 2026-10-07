/**
 * Screen 09 · supplemental complete-window analytics (§44 / WEX).
 *
 * The sealed Report keeps its own pinned revision and is never regenerated or relabelled by this block. This is a separate, collapsed
 * view of the same run's retained windows (IS, OOS, Holdout, or one Walk-forward fold's IS) read from the complete-window analytics: every
 * figure is the server's, a window the protocol never executed says so with its reason, and nothing here enters the seal, a release
 * candidate or an export.
 */

import { useEffect, useMemo, useState } from "react";

import { WindowAnalyticsPanel } from "./EvidenceFlow";
import { reasonCodeSentence } from "./researchRefusal";
import { completeWindowOf } from "./windowAnalyticsView";
import { useWindowAnalytics } from "./useWindowAnalytics";
import type { WindowName, WindowScope } from "./windowExecutionClient";

const TABS: readonly { window: WindowName; label: string }[] = [
  { window: "IS", label: "IS" },
  { window: "OOS", label: "OOS" },
  { window: "HOLDOUT", label: "Holdout" },
];

export function WindowAnalyticsSupplement({ runId, workspaceId, sealedRevision }: { runId: string; workspaceId?: string; sealedRevision?: string | null }) {
  const [open, setOpen] = useState(false);
  const [window, setWindow] = useState<WindowName>("OOS");
  const [foldDraft, setFoldDraft] = useState("");
  const [fold, setFold] = useState<string | null>(null);
  const reads = useWindowAnalytics(runId, workspaceId);
  const scope: WindowScope = useMemo(() => ({ window, foldId: window === "IS" ? fold : null }), [window, fold]);
  const scopeKey = `${scope.window}|${scope.foldId ?? ""}`;
  useEffect(() => {
    if (open) reads.ensure(scope);
  }, [open, scopeKey, reads.ensure]); // eslint-disable-line react-hooks/exhaustive-deps
  const slot = open ? reads.slot(scope) : null;
  const complete = completeWindowOf(slot);

  return (
    <details
      className="rounded-[8px] border px-4 py-3"
      style={{ borderColor: "var(--line)", background: "var(--paper-raised)" }}
      open={open}
      onToggle={(event) => setOpen((event.currentTarget as HTMLDetailsElement).open)}
      data-window-supplement
    >
      <summary className="cursor-pointer text-[13px] font-semibold" style={{ color: "var(--ink)" }}>
        Supplemental window analytics
        <span className="mono ml-2 text-[10px] font-normal" style={{ color: "var(--ink-faint)" }}>not part of the sealed report</span>
      </summary>
      <div className="mt-3 flex flex-col gap-3">
        <p className="text-[11px]" style={{ color: "var(--ink-soft)" }} data-supplement-note>
          A separate view of this run's retained windows. The sealed report{sealedRevision ? ` (revision ${sealedRevision.slice(0, 12)})` : ""} is unchanged and is not regenerated, relabelled or re-exported from it.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="window" className="inline-flex overflow-hidden rounded-[6px] border" style={{ borderColor: "var(--line)" }}>
            {TABS.map((tab) => (
              <button
                key={tab.window}
                type="button"
                aria-pressed={window === tab.window}
                data-window={tab.window}
                className="mono px-3 py-1 text-[10px]"
                style={{ background: window === tab.window ? "var(--accent-soft)" : "var(--paper-raised)", color: window === tab.window ? "var(--accent)" : "var(--ink-soft)", borderRight: "1px solid var(--line)" }}
                onClick={() => setWindow(tab.window)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          {window === "IS" ? (
            <label className="mono text-[10px]" style={{ color: "var(--ink-faint)" }}>
              fold id{" "}
              <input
                aria-label="fold id"
                value={foldDraft}
                placeholder="blank unless Walk-forward"
                className="mono"
                style={{ width: 150, border: "1px solid var(--line)", borderRadius: 4, padding: "1px 6px" }}
                onChange={(event) => setFoldDraft(event.target.value)}
                onBlur={() => setFold(foldDraft.trim() === "" ? null : foldDraft.trim())}
                onKeyDown={(event) => {
                  if (event.key === "Enter") setFold(foldDraft.trim() === "" ? null : foldDraft.trim());
                }}
              />
            </label>
          ) : null}
        </div>
        {!open || slot === null || slot.state === "loading" ? (
          <p className="mono text-[11px] italic" style={{ color: "var(--ink-faint)" }} data-supplement-loading>reading the retained window…</p>
        ) : slot.state === "unavailable" ? (
          <p className="mono text-[11px] italic" style={{ color: "var(--ink-soft)" }} data-supplement-unavailable>This server does not publish window analytics yet.</p>
        ) : slot.state === "failed" ? (
          <p className="text-[11px]" role="status" style={{ color: "var(--ink-soft)" }} data-supplement-failed>
            {slot.status === 403 || slot.status === 404 ? "You do not have access to this run in this workspace, or it does not exist." : "This window could not be read."}
          </p>
        ) : complete?.kind === "ready" ? (
          <WindowAnalyticsPanel page={complete.page} />
        ) : complete?.kind === "absent" ? (
          <p className="mono text-[11px] italic" style={{ color: "var(--ink-soft)" }} data-supplement-absent={complete.absence.state} data-reason-code={complete.absence.reasonCode ?? undefined} title={(complete.absence.reasonCode ? reasonCodeSentence(complete.absence.reasonCode) : null) ?? undefined}>
            {complete.absence.state === "NOT_APPLICABLE" ? "Not applicable" : "Not published"}
            {complete.absence.reasonCode ? ` · ${complete.absence.reasonCode.toLowerCase().replace(/_/g, " ")}` : ""}
          </p>
        ) : null}
      </div>
    </details>
  );
}
