/**
 * Screen 13 · the same two runs on one window: complete retained accounts, independent, never forward-filled.
 *
 * The sealed pair above compares the outer OOS returns the seal carries. This section lets the reader pick IS, OOS, Holdout or the
 * full sample (and, for a Walk-forward IS, the engine fold) and reads each run's complete window block. Every figure is the server's;
 * the browser computes no delta, no spread and no merged curve. A side the server could not answer stays a typed absence, and
 * correlation (exact shared UTC-ms returns) is a typed N/A when it cannot be computed, never a zero.
 */

import { Suspense, lazy, useState } from "react";
import { Link } from "react-router-dom";

import { reasonCodeSentence } from "./researchRefusal";
import { formatCorrelation } from "./researchFormat";
import { reportHref } from "./runLinks";
import {
  WINDOW_BEHAVIOUR,
  WINDOW_EXPOSURE,
  WINDOW_HERO,
  authorityWords,
  factAvailable,
  factOf,
  factText,
  factTitle,
  strategyCurve,
  windowWords,
  type MetricRow,
} from "./windowAnalyticsView";
import { WINDOW_NAMES, type WindowCompare, type WindowName, type WindowScope } from "./windowExecutionClient";
import type { WindowCompareState } from "./useWindowCompare";

const WindowCompareChart = lazy(() => import("./EvidenceCharts").then((m) => ({ default: m.WindowCompareChart })));

const WINDOW_LABEL: Record<WindowName, string> = { IS: "IS", OOS: "OOS", HOLDOUT: "Holdout", FULL_SAMPLE: "Full sample" };
const iso = (ms: number | null): string => (ms === null ? "not published" : `${new Date(ms).toISOString().slice(0, 16).replace("T", " ")}Z`);
const sid = (runId: string): string => runId.replace(/^rrun_/, "").slice(0, 8);

/** The refusal in the screen's own words; the server's prose is never shown. */
export function windowCompareRefusal(status: number | null, code: string | null): string {
  if (code === "RESEARCH_REPLAY_CURSOR_INVALID" || status === 400) return "This window selection is not valid for these two runs.";
  if (status === 401) return "Your session ended. Sign in again to compare windows.";
  if (status === 403 || status === 404) return "You do not have access to one of these runs in this workspace, or it does not exist.";
  if (status === 409) return "These runs cannot be compared on this window right now.";
  if (status === 503) return "The window comparison is busy. Try again in a moment.";
  return "The window comparison could not be read.";
}

const ROWS: readonly MetricRow[] = [...WINDOW_HERO, ...WINDOW_BEHAVIOUR, ...WINDOW_EXPOSURE.map((entry) => ({ key: entry.key, label: `Exposure · ${entry.label}`, unit: "percent" as const }))];

function Cell({ analysis, row }: { analysis: WindowCompare["runs"][number]["analysis"]; row: MetricRow }) {
  if (analysis === null) return <span className="cp-absent" data-fact-state="NOT_PUBLISHED">not published</span>;
  const fact = factOf(analysis, row.key);
  if (!factAvailable(fact)) {
    return (
      <span className="cp-absent" data-fact-state={fact.state} data-reason-code={fact.reason_code ?? undefined} title={factTitle(row, fact)}>
        {fact.state === "NOT_APPLICABLE" ? "not applicable" : "not published"}
      </span>
    );
  }
  return (
    <span className="num" data-exact={fact.value} title={factTitle(row, fact)}>
      {factText(fact.value, row.unit) ?? fact.value}
    </span>
  );
}

function Side({ side, label }: { side: WindowCompare["runs"][number]; label: "A" | "B" }) {
  const descriptor = side.descriptor;
  const absent = side.availability.state !== "AVAILABLE";
  return (
    <div className="cp-card" data-window-side={label} data-side-state={side.availability.state}>
      <h3 className="t" aria-level={2}>
        <span>
          {label} · <Link to={reportHref(side.run_id)} title={side.run_id}>{sid(side.run_id)}</Link>
        </span>
      </h3>
      {absent ? (
        <span className="cp-absent" data-reason-code={side.availability.reason_code ?? undefined} title={(side.availability.reason_code ? reasonCodeSentence(side.availability.reason_code) : null) ?? undefined}>
          {side.availability.state === "NOT_APPLICABLE" ? "not applicable" : "not published"}
          {side.availability.reason_code ? ` · ${side.availability.reason_code.toLowerCase().replace(/_/g, " ")}` : ""}
        </span>
      ) : descriptor !== null ? (
        <span className="cp-faint" data-side-descriptor>
          {iso(descriptor.start_utc_ms)} → {iso(descriptor.end_exclusive_utc_ms)} (end exclusive) · {descriptor.observation_count === null ? "observations not published" : `${descriptor.observation_count.toLocaleString("en-US")} observations`} · {authorityWords(descriptor.authority).words}
        </span>
      ) : null}
      {descriptor !== null && authorityWords(descriptor.authority).caution !== null ? (
        <span className="cp-faint" data-side-caution>{authorityWords(descriptor.authority).caution}</span>
      ) : null}
    </div>
  );
}

function Correlation({ correlation }: { correlation: WindowCompare["correlation"] }) {
  const derived = correlation.state === "AVAILABLE" && correlation.value !== null;
  return (
    <section className="cp-corr" data-window-correlation={correlation.state} aria-label="window correlation">
      <h3 className="t" aria-level={2} title="Correlation of the exact UTC-millisecond returns both accounts share. No forward fill, no sampled curve."><span className="k">Correlation · this window</span></h3>
      {derived ? (
        <span className="cp-rhorow">
          <span className="cp-rho" data-rho data-exact={correlation.value ?? undefined} title={correlation.value ?? undefined}>ρ = {formatCorrelation(correlation.value) ?? correlation.value}</span>
        </span>
      ) : (
        <span className="cp-absent" data-correlation-absent data-reason-code={correlation.reason_code ?? undefined} title={(correlation.reason_code ? reasonCodeSentence(correlation.reason_code) : null) ?? undefined}>
          {correlation.state === "NOT_APPLICABLE" ? "not applicable" : "not published"}
          {correlation.reason_code ? ` · ${correlation.reason_code.toLowerCase().replace(/_/g, " ")}` : ""}
        </span>
      )}
      <span className="cp-faint" data-correlation-meta>
        {correlation.matched_observation_count === null ? "matched observations not published" : <>n <span className="num">{correlation.matched_observation_count.toLocaleString("en-US")}</span> matched observations</>}
      </span>
    </section>
  );
}

export function WindowCompareSection({
  runs,
  scope,
  state,
  onScope,
}: {
  runs: readonly [string, string];
  scope: WindowScope | null;
  state: WindowCompareState;
  onScope: (next: WindowScope | null) => void;
}) {
  const [foldDraft, setFoldDraft] = useState(scope?.foldId ?? "");
  const pick = (window: WindowName) => onScope(scope?.window === window ? null : { window, foldId: window === "IS" ? scope?.foldId ?? null : null });
  return (
    <section className="cp-card no-print" data-window-compare data-window-compare-state={state.state} data-window-selected={scope?.window ?? ""} aria-label="compare on a window">
      <h3 className="t" aria-level={2}>
        <span>Compare on a window</span>
        <span className="cp-faint">complete retained accounts · independent · not forward-filled</span>
      </h3>
      <div className="cp-seg" role="group" aria-label="window" data-window-switch>
        {WINDOW_NAMES.map((name) => (
          <button key={name} type="button" className="cp-segbtn" aria-pressed={scope?.window === name} data-window={name} onClick={() => pick(name)}>
            {WINDOW_LABEL[name]}
          </button>
        ))}
      </div>
      {scope?.window === "IS" ? (
        <label className="cp-faint" data-window-fold-field>
          Walk-forward fold (engine fold id){" "}
          <input
            value={foldDraft}
            onChange={(event) => setFoldDraft(event.target.value)}
            onBlur={() => onScope({ window: "IS", foldId: foldDraft.trim() === "" ? null : foldDraft.trim() })}
            onKeyDown={(event) => {
              if (event.key === "Enter") onScope({ window: "IS", foldId: foldDraft.trim() === "" ? null : foldDraft.trim() });
            }}
            placeholder="blank for Three Window"
            className="num"
            aria-label="fold id"
            style={{ width: 150 }}
          />
        </label>
      ) : null}
      {scope === null ? (
        <span className="cp-faint" data-window-hint>Pick a window to compare both runs on their complete accounts. Nothing is requested until you do.</span>
      ) : state.state === "loading" ? (
        <span className="cp-faint" data-window-loading>reading both windows…</span>
      ) : state.state === "unavailable" ? (
        <span className="cp-absent" data-window-unavailable>This server does not publish window comparisons yet.</span>
      ) : state.state === "refused" ? (
        <span className="cp-absent" role="status" data-window-refused={state.code ?? state.status ?? "error"}>{windowCompareRefusal(state.status, state.code)}</span>
      ) : state.state === "ready" ? (
        <WindowCompareBody data={state.data} runs={runs} />
      ) : null}
    </section>
  );
}

function WindowCompareBody({ data, runs }: { data: WindowCompare; runs: readonly [string, string] }) {
  const [left, right] = data.runs;
  if (left === undefined || right === undefined) return null;
  const leftCurve = left.analysis === null ? [] : strategyCurve(left.analysis);
  const rightCurve = right.analysis === null ? [] : strategyCurve(right.analysis);
  const names = { left: `A · ${sid(runs[0])}`, right: `B · ${sid(runs[1])}` };
  return (
    <div className="flex flex-col gap-3" data-window-body data-window-revision={data.revision} title={`${data.basis} · ${data.alignment} · ${data.revision}`}>
      <span className="cp-faint" data-window-title>
        {windowWords(data.window, data.fold_id)} · each run keeps its own bounds and observations; nothing is aligned or filled
      </span>
      <div className="cp-grid">
        <Side side={left} label="A" />
        <Side side={right} label="B" />
      </div>
      {leftCurve.length > 0 || rightCurve.length > 0 ? (
        <figure className="m-0" data-window-chart>
          <Suspense fallback={<span className="cp-faint" data-chart-loading>drawing…</span>}>
            <WindowCompareChart left={leftCurve} right={rightCurve} names={names} group="compare-window" />
          </Suspense>
          <figcaption className="cp-faint">
            rebased to 100 · display samples ({left.analysis?.curves.sampling.emitted_point_count ?? 0} / {right.analysis?.curves.sampling.emitted_point_count ?? 0} points); no number is computed from them
          </figcaption>
        </figure>
      ) : null}
      <Correlation correlation={data.correlation} />
      <div className="cp-scroll" tabIndex={0} role="region" aria-label="window metrics, side by side">
        <table className="cp-delta" data-window-table>
          <thead>
            <tr>
              <th scope="col">metric</th>
              <th scope="col" data-side="left" title={left.run_id}>{names.left}</th>
              <th scope="col" data-side="right" title={right.run_id}>{names.right}</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.key} data-window-row={row.key}>
                <td>{row.label}</td>
                <td><Cell analysis={left.analysis} row={row} /></td>
                <td><Cell analysis={right.analysis} row={row} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <span className="cp-faint">Side-by-side figures are each account's own; the browser publishes no difference between them.</span>
    </div>
  );
}

export const isWindowName = (value: string | null): value is WindowName => value !== null && (WINDOW_NAMES as readonly string[]).includes(value);
