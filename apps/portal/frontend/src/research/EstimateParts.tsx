/**
 * Screen 02 · what the server has estimated for the declared windows.
 *
 * Bars per window, the warmup, the planned fold count and the run's conditions
 * all come from the optional `preflight_estimate` (spec §4, DR-07/08/09).
 * Nothing here is computed: a count is printed as sent, a window the estimate
 * does not name prints nothing, and with no estimate at all none of these
 * pieces renders: the preflight gate stays the authority.
 *
 * (Screen 03's planned OOS rail is `PlannedWindows.tsx`; this is a different thing.)
 */

import { type EstimateCondition, type EstimateWindow, type PreflightEstimate, group, utcMinute } from "./dataDeclaration";

export type EstimateWindowKey = "is" | "oos" | "holdout" | "analysis";

const WINDOW_LABEL: Readonly<Record<EstimateWindowKey, string>> = { is: "IS", oos: "OOS", holdout: "holdout", analysis: "analysis" };

/** `[2024-01-01 00:00, 2025-01-01 00:00) UTC`: the exact half-open bounds as the server used them. */
function boundsText(window: EstimateWindow): string | null {
  return window.startUtcMs != null && window.endExclusiveUtcMs != null
    ? `[${utcMinute(window.startUtcMs)}, ${utcMinute(window.endExclusiveUtcMs)}) UTC`
    : null;
}

/** `1,056 bars` beside a window band; the exact bounds, first and last bar are its tooltip. */
export function WindowBars({ estimate, window }: { estimate: PreflightEstimate | null; window: EstimateWindowKey }) {
  const served = estimate?.windows[window];
  if (!estimate || !served) return null;
  const label = WINDOW_LABEL[window];
  const bounds = boundsText(served);
  if (served.bars === null) {
    const title = [`${label} bars not published`, served.reasonCode, bounds].filter(Boolean).join(" · ");
    return (
      <span
        className="text-[9px] italic"
        style={{ color: "var(--ink-faint)" }}
        title={title}
        aria-label={title}
        tabIndex={0}
        data-window-bars={window}
        data-window-bars-state="absent"
        data-reason-code={served.reasonCode ?? undefined}
      >
        bars — not published
      </span>
    );
  }
  const edges =
    served.firstBarUtcMs !== null && served.lastBarUtcMs !== null
      ? `first ${utcMinute(served.firstBarUtcMs)} · last ${utcMinute(served.lastBarUtcMs)} UTC`
      : null;
  const title = [`${label} ${group(served.bars)} bars`, bounds, edges, served.asOfUtcMs != null ? `index as of ${utcMinute(served.asOfUtcMs)} UTC` : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <span
      className="mono text-[9px]"
      style={{ color: "var(--ink-soft)" }}
      title={title}
      aria-label={title}
      tabIndex={0}
      data-window-bars={window}
      data-window-bars-state="served"
    >
      {group(served.bars)} bars
    </span>
  );
}

/** The windows the estimate names, on one line, for a timeline that has a single track (advanced). */
export function WindowBarsLine({ estimate }: { estimate: PreflightEstimate | null }) {
  if (!estimate) return null;
  const keys = (["is", "oos", "holdout", "analysis"] as const).filter((key) => estimate.windows[key] !== undefined);
  if (keys.length === 0) return null;
  return (
    <p className="flex flex-wrap gap-x-2.5 gap-y-0.5" data-window-bars-line>
      {keys.map((key) => (
        <span key={key} className="flex items-baseline gap-1">
          <span className="mono text-[9px]" style={{ color: "var(--ink-faint)" }}>{WINDOW_LABEL[key]}</span>
          <WindowBars estimate={estimate} window={key} />
        </span>
      ))}
    </p>
  );
}

/** `warmup 200`: what is available before the IS start is in the tooltip. */
export function WarmupChip({ estimate }: { estimate: PreflightEstimate | null }) {
  const warmup = estimate?.warmup;
  if (!warmup) return null;
  if (warmup.barsRequired === null) {
    const title = ["warmup not published", warmup.reasonCode].filter(Boolean).join(" · ");
    return (
      <span
        className="text-[9px] italic"
        style={{ color: "var(--ink-faint)" }}
        title={title}
        aria-label={title}
        tabIndex={0}
        data-warmup-chip="absent"
        data-reason-code={warmup.reasonCode ?? undefined}
      >
        warmup — not published
      </span>
    );
  }
  const title =
    warmup.barsAvailableBeforeIs !== null
      ? `warmup ${group(warmup.barsRequired)} bars required · ${group(warmup.barsAvailableBeforeIs)} available before IS`
      : `warmup ${group(warmup.barsRequired)} bars required`;
  return (
    <span
      className="mono rounded-[3px] border px-1 text-[9px] leading-[15px]"
      style={{ color: "var(--ink-soft)", borderColor: "var(--line-strong)" }}
      title={title}
      aria-label={title}
      tabIndex={0}
      data-warmup-chip="served"
    >
      warmup {group(warmup.barsRequired)}
    </span>
  );
}

/** `≈ 11 folds · weekly expanding`: an estimate, and the tooltip says the server decides. */
export function PlannedFolds({ estimate }: { estimate: PreflightEstimate | null }) {
  const folds = estimate?.plannedFolds;
  if (!folds) return null;
  if (folds.count === null) {
    return (
      <span className="text-[9px] italic" style={{ color: "var(--ink-faint)" }} data-planned-folds="absent" title={folds.reasonCode ?? undefined}>
        folds — not published{folds.reasonCode ? ` · ${folds.reasonCode}` : ""}
      </span>
    );
  }
  const title = [
    "estimate · the server decides at preflight",
    folds.minBarsPerFold !== null ? `min ${group(folds.minBarsPerFold)} bars per fold` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <span
      className="mono text-[9.5px]"
      style={{ color: "var(--ink-soft)" }}
      title={title}
      aria-label={`about ${folds.count} folds${folds.basis ? ` · ${folds.basis}` : ""} · ${title}`}
      tabIndex={0}
      data-planned-folds="served"
    >
      ≈ {group(folds.count)} fold{folds.count === 1 ? "" : "s"}
      {folds.basis ? ` · ${folds.basis}` : ""}
    </span>
  );
}

/** Whether the estimate carries a warmup or a fold plan (the strip under the timeline). */
export function hasEstimateStrip(estimate: PreflightEstimate | null): boolean {
  return estimate !== null && (estimate.warmup !== null || estimate.plannedFolds !== null);
}

/** `bars sufficient` from the server's own key; the key is never mapped to a sentence here. */
function conditionLabel(key: string): string {
  return key.replace(/[_.-]+/g, " ");
}

const MARK: Readonly<Record<EstimateCondition["state"], { glyph: string; tone: string; word: string }>> = {
  PASS: { glyph: "✓", tone: "var(--good)", word: "met" },
  FAIL: { glyph: "✗", tone: "var(--bad)", word: "not met" },
  NOT_PUBLISHED: { glyph: "·", tone: "var(--ink-faint)", word: "not published" },
};

/** The run's conditions, one line each: ✓ / ✗ / not published, with observed against required in the tooltip. */
export function ConditionsChecklist({ estimate }: { estimate: PreflightEstimate | null }) {
  const conditions = estimate?.conditions;
  if (!conditions || conditions.length === 0) return null;
  return (
    <section className="flex flex-col gap-1 rounded-[6px] border px-2.5 py-2" style={{ borderColor: "var(--line-soft)" }} data-conditions>
      <h4 className="text-[10px] font-semibold uppercase tracking-[.05em]" style={{ fontFamily: "var(--font-body)" }}>
        Conditions
      </h4>
      <ul className="flex flex-col gap-0.5">
        {conditions.map((condition) => {
          const mark = MARK[condition.state];
          const title = [
            condition.observed !== null ? `observed ${condition.observed}` : "observed not published",
            condition.required !== null ? `required ${condition.required}` : "required not published",
            condition.reasonCode,
          ]
            .filter(Boolean)
            .join(" · ");
          return (
            <li
              key={condition.key}
              className="flex flex-wrap items-baseline gap-x-1.5 text-[10px]"
              title={title}
              aria-label={`${conditionLabel(condition.key)} ${mark.word} · ${title}`}
              tabIndex={0}
              data-condition={condition.key}
              data-condition-state={condition.state}
            >
              <span className="mono w-[10px] flex-none font-bold" style={{ color: mark.tone }} aria-hidden="true">{mark.glyph}</span>
              <span style={{ color: condition.state === "FAIL" ? "var(--bad)" : "var(--ink-soft)" }}>{conditionLabel(condition.key)}</span>
              {condition.state === "NOT_PUBLISHED" ? (
                <span className="text-[9px] italic" style={{ color: "var(--ink-faint)" }}>
                  not published{condition.reasonCode ? ` · ${condition.reasonCode}` : ""}
                </span>
              ) : condition.state === "FAIL" && condition.reasonCode ? (
                <span className="mono text-[9px]" style={{ color: "var(--bad)" }}>{condition.reasonCode}</span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
