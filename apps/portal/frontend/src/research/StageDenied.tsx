import { Link } from "react-router-dom";

import { ShortId } from "./ShortId";
import { RunNotFound, SCREEN_FRAME } from "./SplitDetail";

/**
 * The one "run not available" page for a stage screen (E2, HiFi audit X8):
 * S07 and S08 now answer a 403/404 the way S05/S06 do — a Run Library
 * breadcrumb, the F-04 sentence, and no stage chrome or lane subtitle that
 * would describe a run the reader may not see.
 */
export function StageDenied({ runId, stage, screen }: { runId: string; stage: string; screen: string }) {
  return (
    <div className={SCREEN_FRAME} data-screen={screen} data-run={runId} data-stage-denied>
      <nav className="flex flex-wrap items-center gap-1.5 text-[12px]" aria-label="Breadcrumb" style={{ color: "var(--ink-soft)" }}>
        <Link to="/research/quantbt/runs" style={{ color: "var(--accent)" }} data-action="run-library-crumb">
          Library
        </Link>
        <span style={{ color: "var(--ink-faint)" }}>/</span>
        <ShortId id={runId} label="run" />
        <span style={{ color: "var(--ink-faint)" }}>/</span>
        <span style={{ color: "var(--ink)" }}>{stage}</span>
      </nav>
      <RunNotFound runId={runId} />
    </div>
  );
}
