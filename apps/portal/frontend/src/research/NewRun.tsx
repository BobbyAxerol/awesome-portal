/**
 * Screen 02 · New Run — context · route · preflight (P10 composition scope).
 *
 * The densest declaration screen in the domain: eight steps that end in one
 * immutable requested spec. Spec 02's three founding rules shape it —
 *
 *  1. a declaration outside the space the alpha declared cannot be submitted;
 *  2. the claim forecast is shown before compute is spent;
 *  3. an untouched field is not serialized, so the engine's default applies.
 *
 * Two composition decisions worth stating:
 *
 *  - **The route grid is rendered from the Atlas manifest, never from a local
 *    list.** A route the installed release adds appears here with no frontend
 *    change, and a route it blocks carries the engine's own refusal wording.
 *  - **A control that cannot be used is shown with its reason, never hidden**
 *    (spec 02 §13-3). Hiding an invalid option makes the reader wonder whether
 *    it exists; showing it struck through with a title says who to ask.
 *
 * The review rail is the same serializer the submit uses. It is not a
 * summary written beside the payload — it *is* the payload, rendered.
 */

import { useMemo, useState } from "react";

import type { AtlasDocument } from "./atlas";
import { ResearchPanel } from "./ResearchPanel";
import {
  type DraftConstraints,
  type ParameterEntry,
  type RunDraft,
  type StepId,
  STEPS,
  SWEEP_CEILING,
  blockingProblems,
  parameterStatus,
  pinnedCount,
  sweptCount,
} from "./runDraft";
import type { RunCreateResponse } from "./runCreateClient";
import type { PreflightResponse } from "./preflightClient";
import type { ResearchState } from "./state";

/* --------------------------------------------------------------- verbatim */

export const SUBTITLE =
  "Bind the alpha version, pick how orders come to exist, then the methodology. Each step validates on its own — a problem is reported where it can be fixed.";

export const SCRATCH_BANNER =
  "Scratch runs iterate freely and stay full evidence for you — but no release candidate can ever be composed from one. Strategy pick below becomes free.";

export const DATA_REQUIREMENTS_NOTE =
  "Timeframe and seed are checked in this form. Required columns and warmup are checked by the server at preflight — the Review step names whichever gate failed.";

export const DEFAULTS_FOOTER =
  "Defaults come from the release manifest — an untouched field is NOT serialized. Missing objective metrics raise MissingOptimizationMetricError, there is no silent fallback.";

/** Spec 02 §10 — shown while the run's existence is unknown. */
export const UNKNOWN_OUTCOME_NOTE =
  "The server did not say whether this run was created. Check again with the same request — a second submit could create a second run.";

/* ------------------------------------------------------------------ parts */

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="mono text-[10px] font-medium uppercase tracking-[.07em]"
      style={{ color: "var(--ink-faint)" }}
    >
      {children}
    </span>
  );
}

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1">
      <Label>{label}</Label>
      {children}
      {hint ? (
        <span className="text-[9.5px]" style={{ color: "var(--ink-faint)" }}>
          {hint}
        </span>
      ) : null}
    </label>
  );
}

const INPUT_CLASS = "mono rounded-[6px] border px-2 py-[5px] text-[11px]";
const inputStyle = (bad?: boolean) => ({
  borderColor: bad ? "var(--bad)" : "var(--line)",
  background: "var(--paper-raised)",
  color: "var(--ink)",
});

function ErrorBlock({ message }: { message: string }) {
  return (
    <p
      role="alert"
      data-step-error
      className="rounded-[6px] border px-2.5 py-1.5 text-[11.5px]"
      style={{ borderColor: "var(--bad)", background: "var(--bad-bg-soft)", color: "var(--bad)" }}
    >
      {message}
    </p>
  );
}

function Card({ title, children, meta }: { title: string; children: React.ReactNode; meta?: React.ReactNode }) {
  return (
    <section
      className="flex flex-col gap-2.5 rounded-[8px] border px-3.5 py-3"
      style={{ borderColor: "var(--line)", background: "var(--paper-raised)" }}
      data-step-card={title}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[12px] font-semibold uppercase tracking-[.05em]">{title}</h3>
        {meta}
      </header>
      {children}
    </section>
  );
}

/* --------------------------------------------------------------- wizard bar */

function WizardBar({
  current,
  onPick,
  errors,
}: {
  current: StepId;
  onPick: (step: StepId) => void;
  errors: ReadonlySet<StepId>;
}) {
  return (
    /* Wraps rather than scrolls.
     *
     * With the Portal sidebar taking 248px of 1280, eight pills overflowed and
     * the first two steps sat off-screen behind a horizontal scrollbar — a
     * wizard whose first step is invisible reads as a wizard that starts at
     * step three. */
    <div
      className="flex flex-wrap gap-1 rounded-[6px] border p-[5px]"
      style={{ borderColor: "var(--line)", background: "var(--paper-raised)" }}
      role="tablist"
      aria-label="New run steps"
    >
      {STEPS.map((step, index) => {
        const isCurrent = step.id === current;
        const hasError = errors.has(step.id);
        const tone = hasError ? "var(--bad)" : isCurrent ? "var(--accent)" : "var(--good)";
        return (
          <button
            key={step.id}
            type="button"
            role="tab"
            aria-selected={isCurrent}
            data-step-pill={step.id}
            data-step-state={hasError ? "error" : isCurrent ? "current" : "valid"}
            onClick={() => onPick(step.id)}
            className="flex flex-none items-center gap-2 rounded-[6px] px-3 py-1.5"
            style={{ background: isCurrent ? "var(--accent-soft)" : "transparent" }}
          >
            <span
              className="mono inline-flex h-5 w-5 items-center justify-center rounded-full border-[1.5px] text-[10px] font-bold"
              style={{ color: tone, borderColor: tone }}
            >
              {hasError ? "!" : isCurrent ? index + 1 : "✓"}
            </span>
            <span className="flex flex-col items-start">
              <span className="text-[11px] font-medium">{step.label}</span>
              <span
                className="text-[9px]"
                style={{ color: hasError ? "var(--bad)" : "var(--ink-faint)" }}
              >
                {hasError ? "needs attention" : step.sub}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ----------------------------------------------------------------- steps */

function ContextStep({
  draft,
  patch,
  limits,
}: {
  draft: RunDraft;
  patch: (change: Partial<RunDraft>) => void;
  limits: DraftConstraints;
}) {
  return (
    <Card title="Context — alpha &amp; version binding">
      <div className="flex flex-wrap items-end gap-2.5">
        <Field label="Alpha">
          <input
            className={INPUT_CLASS}
            style={inputStyle()}
            value={draft.alphaId}
            onChange={(e) => patch({ alphaId: e.target.value })}
            aria-label="Alpha"
          />
        </Field>
        <Field label="Version (immutable after submit)">
          <input
            className={INPUT_CLASS}
            style={inputStyle()}
            value={draft.alphaVersionId}
            onChange={(e) => patch({ alphaVersionId: e.target.value })}
            aria-label="Alpha version"
          />
        </Field>
        <div className="flex flex-none gap-1" role="group" aria-label="Binding mode">
          {([true, false] as const).map((bound) => (
            <button
              key={String(bound)}
              type="button"
              data-binding={bound ? "bound" : "scratch"}
              data-selected={draft.bound === bound}
              onClick={() => patch({ bound })}
              className="mono rounded-[5px] border px-2.5 py-1 text-[10px]"
              style={{
                borderColor: draft.bound === bound ? "var(--accent)" : "var(--line)",
                background: draft.bound === bound ? "var(--accent-soft)" : "var(--paper-raised)",
                color: draft.bound === bound ? "var(--accent)" : "var(--ink-soft)",
              }}
            >
              {bound ? "bound" : "scratch"}
            </button>
          ))}
        </div>
      </div>

      {draft.bound ? (
        <div
          className="flex flex-wrap gap-x-5 gap-y-1.5 rounded-[6px] border px-3 py-2"
          style={{ borderColor: "var(--line-soft)", background: "var(--paper)" }}
          data-passport
        >
          {([
            ["entrypoint", limits.entrypoint ?? null],
            ["declared timeframes", limits.declaredTimeframes.join(" · ") || null],
          ] as const).map(([label, value]) => (
            <span key={label} className="flex items-baseline gap-1.5">
              <Label>{label}</Label>
              {/* A fact the manifest did not carry is absent, not a dash. */}
              {value === null ? (
                <span className="text-[10px] italic" style={{ color: "var(--ink-faint)" }}>
                  not reported
                </span>
              ) : (
                <span className="mono text-[10.5px]">{value}</span>
              )}
            </span>
          ))}
        </div>
      ) : (
        <div
          className="flex flex-col gap-1 rounded-[6px] border-[1.5px] border-dashed px-3 py-2"
          style={{ borderColor: "var(--role-holdout)", background: "var(--paper)" }}
          data-scratch-banner
        >
          <span
            className="mono text-[9px] font-bold"
            style={{ color: "var(--role-holdout)" }}
          >
            NOT_PUBLISHABLE
          </span>
          <span className="text-[10.5px] leading-[1.5]" style={{ color: "var(--ink-soft)" }}>
            {SCRATCH_BANNER}
          </span>
        </div>
      )}
    </Card>
  );
}

function StrategyStep({
  draft,
  patch,
  limits,
  error,
}: {
  draft: RunDraft;
  patch: (change: Partial<RunDraft>) => void;
  limits: DraftConstraints;
  error: string | null;
}) {
  return (
    <Card title="Strategy &amp; protocol">
      <Field label="strategy_id" hint={draft.bound ? "pinned by the bound version" : "free while scratch"}>
        <input
          className={INPUT_CLASS}
          style={inputStyle(Boolean(error))}
          value={draft.strategyId}
          onChange={(e) => patch({ strategyId: e.target.value })}
          aria-label="Strategy id"
        />
      </Field>
      {error ? <ErrorBlock message={error} /> : null}

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Protocol">
        {(["three_window_decay", "advanced"] as const).map((protocol) => (
          <button
            key={protocol}
            type="button"
            data-protocol={protocol}
            data-selected={draft.protocol === protocol}
            onClick={() => patch({ protocol })}
            className="mono rounded-[5px] border px-2.5 py-1 text-[10px]"
            style={{
              borderColor: draft.protocol === protocol ? "var(--accent)" : "var(--line)",
              background: draft.protocol === protocol ? "var(--accent-soft)" : "var(--paper-raised)",
              color: draft.protocol === protocol ? "var(--accent)" : "var(--ink-soft)",
            }}
          >
            {protocol === "three_window_decay" ? "Three-Window Decay" : "Advanced Walk-Forward"}
          </button>
        ))}
        <span className="self-center text-[9.5px]" style={{ color: "var(--ink-faint)" }}>
          Showing only the protocols the installed engine release certifies (2). An uncertified
          protocol is not offered.
        </span>
      </div>
      <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }}>
        seed required: {limits.seedRequired ? "yes" : "no"}
      </span>
    </Card>
  );
}

function RouteStep({
  draft,
  patch,
  atlas,
  limits,
  error,
}: {
  draft: RunDraft;
  patch: (change: Partial<RunDraft>) => void;
  atlas: AtlasDocument | null;
  limits: DraftConstraints;
  error: string | null;
}) {
  return (
    <Card
      title="Route"
      meta={
        <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }}>
          {atlas ? `${atlas.routes.length} routes from the installed release` : null}
        </span>
      }
    >
      {atlas === null ? (
        <p className="text-[11px]" style={{ color: "var(--ink-soft)" }} data-no-atlas>
          The route grid is read from the Engine Atlas. It is not available, so no route can be
          offered — the form does not carry a local copy of the release's routes.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2" data-route-grid>
          {atlas.routes.map((route) => {
            const blocked = limits.blockedRoutes[route.route_id];
            const selected = draft.executionRoute === route.route_id;
            return (
              <button
                key={route.route_id}
                type="button"
                data-route-card={route.route_id}
                data-route-blocked={blocked ? "true" : undefined}
                data-selected={selected}
                /* Shown with its reason rather than hidden (§13-3). */
                title={blocked ?? undefined}
                onClick={() => {
                  if (!blocked) patch({ executionRoute: route.route_id as RunDraft["executionRoute"] });
                }}
                disabled={Boolean(blocked)}
                className="flex w-[calc(25%-6px)] min-w-[190px] flex-col gap-[3px] rounded-[6px] border px-2.5 py-2 text-left"
                style={{
                  borderColor: selected ? "var(--accent)" : blocked ? "var(--line-strong)" : "var(--line)",
                  borderStyle: blocked ? "dashed" : "solid",
                  background: selected ? "var(--accent-soft)" : "var(--paper-raised)",
                  opacity: blocked ? 0.6 : 1,
                  cursor: blocked ? "not-allowed" : "pointer",
                }}
              >
                <span className="mono text-[10.5px] font-semibold">{route.route_id}</span>
                <span className="mono text-[8.5px]" style={{ color: "var(--ink-faint)" }}>
                  {route.family} · {route.execution_contract}
                </span>
                {blocked ? (
                  <span className="text-[9.5px] leading-[1.45]" style={{ color: "var(--bad)" }}>
                    {blocked}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      )}
      {error ? <ErrorBlock message={error} /> : null}
    </Card>
  );
}

function DataStep({
  draft,
  patch,
  limits,
  error,
}: {
  draft: RunDraft;
  patch: (change: Partial<RunDraft>) => void;
  limits: DraftConstraints;
  error: string | null;
}) {
  return (
    <Card title="Data">
      <p className="text-[10.5px] leading-[1.5]" style={{ color: "var(--ink-soft)" }} data-data-note>
        {DATA_REQUIREMENTS_NOTE}
      </p>
      <div className="flex flex-wrap gap-2.5">
        <Field label="Dataset" hint="Historical source — backtest only. Realtime and paper are separate services.">
          <input
            className={INPUT_CLASS}
            style={inputStyle()}
            value={draft.datasetId}
            onChange={(e) => patch({ datasetId: e.target.value })}
            aria-label="Dataset"
          />
        </Field>
        <Field label="Symbol *">
          <input
            className={INPUT_CLASS}
            style={inputStyle(draft.symbol.trim().length === 0)}
            value={draft.symbol}
            onChange={(e) => patch({ symbol: e.target.value })}
            aria-label="Symbol"
          />
        </Field>
        <Field label="Timeframe *">
          <select
            className={INPUT_CLASS}
            style={inputStyle(
              limits.declaredTimeframes.length > 0 &&
                !limits.declaredTimeframes.includes(draft.timeframe),
            )}
            value={draft.timeframe}
            onChange={(e) => patch({ timeframe: e.target.value })}
            aria-label="Timeframe"
          >
            {["15m", "1h", "4h", "1d"].map((tf) => (
              <option key={tf} value={tf}>
                {tf}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {error ? <ErrorBlock message={error} /> : null}
    </Card>
  );
}

function WindowsStep({
  draft,
  patch,
  error,
}: {
  draft: RunDraft;
  patch: (change: Partial<RunDraft>) => void;
  error: string | null;
}) {
  const rows = [
    ["is", "IS"],
    ["oos", "OOS"],
    ["holdout", "Holdout"],
  ] as const;

  return (
    <Card title="Walk-forward">
      {draft.protocol === "three_window_decay" ? (
        <div className="flex flex-col gap-2" data-three-window>
          {rows.map(([key, label]) => (
            <div key={key} className="flex flex-wrap items-end gap-2.5" data-window={key}>
              <span className="mono w-[72px] flex-none text-[10.5px] font-semibold">{label}</span>
              <Field label="start">
                <input
                  type="datetime-local"
                  className={INPUT_CLASS}
                  style={inputStyle(Boolean(error))}
                  value={draft.windows[key].start}
                  onChange={(e) =>
                    patch({
                      windows: {
                        ...draft.windows,
                        [key]: { ...draft.windows[key], start: e.target.value },
                      },
                    })
                  }
                  aria-label={`${label} start`}
                />
              </Field>
              <Field label="end exclusive">
                <input
                  type="datetime-local"
                  className={INPUT_CLASS}
                  style={inputStyle(Boolean(error))}
                  value={draft.windows[key].endExclusive}
                  onChange={(e) =>
                    patch({
                      windows: {
                        ...draft.windows,
                        [key]: { ...draft.windows[key], endExclusive: e.target.value },
                      },
                    })
                  }
                  aria-label={`${label} end exclusive`}
                />
              </Field>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2.5" data-advanced-window>
          <Field label="Analysis start">
            <input
              type="datetime-local"
              className={INPUT_CLASS}
              style={inputStyle()}
              value={draft.walkForward.start}
              onChange={(e) => patch({ walkForward: { ...draft.walkForward, start: e.target.value } })}
              aria-label="Analysis start"
            />
          </Field>
          <Field label="End exclusive">
            <input
              type="datetime-local"
              className={INPUT_CLASS}
              style={inputStyle()}
              value={draft.walkForward.endExclusive}
              onChange={(e) =>
                patch({ walkForward: { ...draft.walkForward, endExclusive: e.target.value } })
              }
              aria-label="Analysis end exclusive"
            />
          </Field>
          <Field label="Frequency">
            <input
              className={INPUT_CLASS}
              style={inputStyle()}
              value={draft.walkForward.frequency}
              onChange={(e) =>
                patch({ walkForward: { ...draft.walkForward, frequency: e.target.value } })
              }
              aria-label="Frequency"
            />
          </Field>
          <Field label="Window mode">
            <input
              className={INPUT_CLASS}
              style={inputStyle()}
              value={draft.walkForward.windowMode}
              onChange={(e) =>
                patch({ walkForward: { ...draft.walkForward, windowMode: e.target.value } })
              }
              aria-label="Window mode"
            />
          </Field>
        </div>
      )}

      {/* The authoritative fold plan is the server's; anything drawn here
          would be a second number for the same fact. */}
      <p className="text-[10px] leading-[1.5]" style={{ color: "var(--ink-faint)" }} data-fold-note>
        The server derives the authoritative fold plan at preflight — the Review step shows it.
      </p>

      <div className="flex flex-wrap gap-2.5">
        <Field label="optimization_mode">
          <input
            className={INPUT_CLASS}
            style={inputStyle()}
            value={draft.optimizationMode}
            onChange={(e) => patch({ optimizationMode: e.target.value })}
            aria-label="Optimization mode"
          />
        </Field>
        <Field label="optimization_schedule">
          <input
            className={INPUT_CLASS}
            style={inputStyle()}
            value={draft.optimizationSchedule}
            onChange={(e) => patch({ optimizationSchedule: e.target.value })}
            aria-label="Optimization schedule"
          />
        </Field>
      </div>

      {error ? <ErrorBlock message={error} /> : null}
    </Card>
  );
}

function ParametersStep({
  draft,
  patch,
  error,
}: {
  draft: RunDraft;
  patch: (change: Partial<RunDraft>) => void;
  error: string | null;
}) {
  const swept = sweptCount(draft);

  function update(index: number, change: Partial<ParameterEntry>) {
    const next = draft.parameters.map((entry, i) => (i === index ? { ...entry, ...change } : entry));
    patch({ parameters: next });
  }

  return (
    <Card
      title="Parameters"
      meta={
        <span
          className="mono text-[9.5px]"
          data-sweep-count
          style={{ color: swept > SWEEP_CEILING ? "var(--bad)" : "var(--ink-faint)" }}
        >
          {swept} swept · {pinnedCount(draft)} pinned · sweep ceiling {SWEEP_CEILING}
        </span>
      }
    >
      {draft.parameters.length === 0 ? (
        <p className="text-[11px]" style={{ color: "var(--ink-soft)" }} data-no-parameters>
          The bound version declares no parameter space. The browser never adds one.
        </p>
      ) : (
        <div className="flex flex-col" data-parameter-table>
          {draft.parameters.map((entry, index) => {
            const status = parameterStatus(entry);
            const refused = status.tone === "refused";
            return (
              <div
                key={entry.name}
                data-parameter={entry.name}
                data-parameter-tone={status.tone}
                className="flex flex-wrap items-center gap-2 border-b py-1.5"
                style={{ borderColor: "var(--line-soft)" }}
              >
                <span className="mono w-[104px] flex-none text-[11px]">{entry.name}</span>
                <span className="mono w-[120px] flex-none text-[10px]" style={{ color: "var(--ink-faint)" }}>
                  {entry.levels
                    ? `[${entry.levels.join(", ")}]`
                    : `${entry.declaredLow} … ${entry.declaredHigh}`}
                </span>
                <span className="flex flex-none gap-[3px]">
                  {(["sweep", "pin"] as const).map((dimension) => (
                    <button
                      key={dimension}
                      type="button"
                      data-dimension={`${entry.name}:${dimension}`}
                      data-selected={entry.dimension === dimension}
                      onClick={() => update(index, { dimension })}
                      className="mono rounded-[4px] border px-2 py-px text-[9px]"
                      style={{
                        borderColor:
                          entry.dimension === dimension
                            ? dimension === "sweep"
                              ? "var(--accent)"
                              : "var(--role-holdout)"
                            : "var(--line)",
                        color:
                          entry.dimension === dimension
                            ? dimension === "sweep"
                              ? "var(--accent)"
                              : "var(--role-holdout)"
                            : "var(--ink-faint)",
                      }}
                    >
                      {dimension}
                    </button>
                  ))}
                </span>
                <input
                  className={`${INPUT_CLASS} w-[88px] flex-none`}
                  style={inputStyle(refused)}
                  value={entry.low}
                  onChange={(e) => update(index, { low: e.target.value })}
                  aria-label={`${entry.name} ${entry.dimension === "pin" ? "value" : "low"}`}
                />
                {entry.dimension === "sweep" ? (
                  <input
                    className={`${INPUT_CLASS} w-[88px] flex-none`}
                    style={inputStyle(refused)}
                    value={entry.high}
                    onChange={(e) => update(index, { high: e.target.value })}
                    aria-label={`${entry.name} high`}
                  />
                ) : (
                  <span className="mono w-[88px] flex-none text-[11px]" style={{ color: "var(--ink-faint)" }}>
                    —
                  </span>
                )}
                <span
                  className="flex-1 text-[10px]"
                  data-parameter-status={entry.name}
                  style={{
                    color: refused
                      ? "var(--bad)"
                      : status.tone === "narrowed"
                        ? "var(--role-holdout)"
                        : "var(--ink-faint)",
                  }}
                >
                  {status.text}
                </span>
              </div>
            );
          })}
        </div>
      )}
      {error ? <ErrorBlock message={error} /> : null}
    </Card>
  );
}

function OptimizationStep({
  draft,
  patch,
  limits,
  error,
}: {
  draft: RunDraft;
  patch: (change: Partial<RunDraft>) => void;
  limits: DraftConstraints;
  error: string | null;
}) {
  const overrides = Object.keys(draft.optimizationConfigOverrides);
  return (
    <Card title="Optimization">
      <div className="flex flex-wrap gap-2.5">
        <Field label="Optuna trials" hint={`ceiling ${limits.trialCeiling}`}>
          <input
            className={INPUT_CLASS}
            style={inputStyle(Boolean(error))}
            value={draft.optunaTrials}
            onChange={(e) => patch({ optunaTrials: e.target.value })}
            aria-label="Optuna trials"
          />
        </Field>
        <Field label="Early stopping" hint="stagnation patience — actual trials may land lower">
          <input
            className={INPUT_CLASS}
            style={inputStyle()}
            value={draft.earlyStopping}
            onChange={(e) => patch({ earlyStopping: e.target.value })}
            aria-label="Early stopping"
          />
        </Field>
        <Field label={limits.seedRequired ? "Random seed *" : "Random seed"}>
          <input
            className={INPUT_CLASS}
            style={inputStyle(limits.seedRequired && draft.randomSeed.trim() === "")}
            value={draft.randomSeed}
            onChange={(e) => patch({ randomSeed: e.target.value })}
            aria-label="Random seed"
          />
        </Field>
      </div>

      <div
        className="flex flex-col gap-1 rounded-[6px] border px-3 py-2"
        style={{ borderColor: "var(--line-soft)", background: "var(--paper)" }}
        data-config-surface
      >
        <span className="mono text-[9.5px]" data-override-summary style={{ color: "var(--ink-faint)" }}>
          {overrides.length === 0
            ? `all defaults from ${draft.engineReleaseId} — nothing serialized`
            : `${overrides.length} override(s) · rest = release defaults`}
        </span>
        {overrides.map((key) => (
          <span key={key} className="mono text-[10px]" data-override={key}>
            {key} = {String(draft.optimizationConfigOverrides[key])}
          </span>
        ))}
        <p className="text-[9.5px] leading-[1.5]" style={{ color: "var(--ink-soft)" }} data-defaults-footer>
          {DEFAULTS_FOOTER}
        </p>
      </div>

      {error ? <ErrorBlock message={error} /> : null}
    </Card>
  );
}

/* ------------------------------------------------------------ review rail */

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b py-[3px] last:border-b-0"
      style={{ borderColor: "var(--line-soft)" }}
      data-review-row={label}
    >
      <span
        className="mono flex-none text-[9px] uppercase tracking-[.06em]"
        style={{ width: 132, color: "var(--ink-faint)" }}
      >
        {label}
      </span>
      <span className="mono flex-1 break-words text-[10.5px]">{children}</span>
    </div>
  );
}

function ReviewRail({
  draft,
  blocking,
}: {
  draft: RunDraft;
  blocking: readonly { step: StepId; message: string }[];
}) {
  const overrides = Object.keys(draft.optimizationConfigOverrides);
  return (
    <aside
      className="flex w-full flex-col gap-2 rounded-[8px] border px-3 py-2.5 lg:sticky lg:top-3 lg:w-[320px] lg:flex-none"
      style={{ borderColor: "var(--line)", background: "var(--paper-raised)" }}
      data-review-rail
      aria-label="Review"
    >
      <h3 className="mono text-[10px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
        review
      </h3>
      <div className="flex flex-col">
        <Row label="alpha binding">
          {draft.bound
            ? draft.alphaVersionId
              ? `PUBLISHABLE · ${draft.alphaVersionId}`
              : "PUBLISHABLE · no version bound"
            : "NOT_PUBLISHABLE · scratch"}
        </Row>
        <Row label="execution route">{draft.executionRoute}</Row>
        <Row label="strategy_id">
          {draft.strategyId ? (
            <>
              {draft.strategyId}
              {draft.bound ? " (pinned by av)" : ""}
            </>
          ) : (
            <span className="italic" style={{ color: "var(--ink-faint)" }}>not declared</span>
          )}
        </Row>
        <Row label="dataset · symbol · tf">
          {/* §3.3: an absent value is never a dash. */}
          {draft.datasetId || <span className="italic" style={{ color: "var(--ink-faint)" }}>not declared</span>}
          {" · "}
          {draft.symbol || <span className="italic" style={{ color: "var(--ink-faint)" }}>not declared</span>}
          {" · "}
          {draft.timeframe}
        </Row>
        <Row label="protocol">{draft.protocol}</Row>
        <Row label="parameter_space">
          {draft.parameters.length} entries · {sweptCount(draft)} swept · {pinnedCount(draft)} pinned
          (sweep ceiling {SWEEP_CEILING})
        </Row>
        <Row label="mode × schedule">
          {/* Two empty fields rendered as a bare `×` printed a separator where
              a value belongs; an undeclared field says so. */}
          {draft.optimizationMode || draft.optimizationSchedule ? (
            `${draft.optimizationMode || "not declared"} × ${draft.optimizationSchedule || "not declared"}`
          ) : (
            <span className="italic" style={{ color: "var(--ink-faint)" }}>
              not declared
            </span>
          )}
        </Row>
        <Row label="trials · stop · seed">
          {draft.optunaTrials || "0"} · {draft.earlyStopping || "none"} ·{" "}
          {draft.randomSeed || "none"}
        </Row>
        <Row label="optimization_config">
          {overrides.length === 0
            ? "release defaults — nothing serialized"
            : `${overrides.length} overrides (${overrides.join(", ")}) — rest engine defaults`}
        </Row>
      </div>

      {blocking.length > 0 ? (
        <div
          role="alert"
          data-blocking
          className="flex flex-col gap-1 rounded-[6px] border px-2.5 py-2"
          style={{ borderColor: "var(--bad)", background: "var(--bad-bg-soft)" }}
        >
          {blocking.map((problem) => (
            <span key={problem.step} className="text-[10.5px]" style={{ color: "var(--bad)" }}>
              {problem.message}
            </span>
          ))}
        </div>
      ) : null}
    </aside>
  );
}

/* ----------------------------------------------------------------- screen */

export interface NewRunProps {
  draft: RunDraft;
  patch: (change: Partial<RunDraft>) => void;
  limits: DraftConstraints;
  /** The installed release's manifest. The route grid is rendered from it. */
  atlas: AtlasDocument | null;
  atlasState: ResearchState;

  preflight: PreflightResponse | null;
  preflightState: ResearchState;
  clearedBecause?: string | null;
  onRunPreflight: () => void;

  mayCreateRun: boolean;
  canSubmit: boolean;
  created: RunCreateResponse | null;
  createState: ResearchState;
  outcomeUnknown: boolean;
  onSubmit: () => void;
  onRecheck: () => void;
}

export function NewRun(props: NewRunProps) {
  const {
    draft,
    patch,
    limits,
    atlas,
    atlasState,
    preflight,
    preflightState,
    clearedBecause,
    onRunPreflight,
    mayCreateRun,
    canSubmit,
    created,
    createState,
    outcomeUnknown,
    onSubmit,
    onRecheck,
  } = props;

  const [step, setStep] = useState<StepId>("context");
  const blocking = useMemo(() => blockingProblems(draft, limits), [draft, limits]);
  const errorByStep = useMemo(
    () => new Map(blocking.map((problem) => [problem.step, problem.message])),
    [blocking],
  );
  const errorSteps = useMemo(() => new Set(errorByStep.keys()), [errorByStep]);

  return (
    <div
      data-screen="new-run"
      className="flex flex-col gap-3 px-4 py-4"
      style={{ background: "var(--paper)", color: "var(--ink)" }}
    >
      <header className="flex flex-col gap-1.5 border-b pb-2.5" style={{ borderColor: "var(--line)" }}>
        <div className="flex flex-wrap items-center gap-2.5">
          <h1
            className="text-[22px] font-light tracking-[-.01em]"
            style={{ fontFamily: "Newsreader, Georgia, serif" }}
          >
            New Run
          </h1>
          <span
            className="mono rounded-[3px] border px-[5px] text-[10px] font-bold leading-[16px]"
            data-binding-chip={draft.bound ? "PUBLISHABLE" : "NOT_PUBLISHABLE"}
            style={{
              color: draft.bound ? "var(--good)" : "var(--role-holdout)",
              borderColor: draft.bound ? "var(--good)" : "var(--role-holdout)",
              borderStyle: draft.bound ? "solid" : "dashed",
              background: draft.bound ? "var(--good-bg, var(--paper))" : "var(--paper)",
            }}
          >
            {draft.bound
              ? draft.alphaVersionId
                ? `PUBLISHABLE · ${draft.alphaVersionId}`
                : "PUBLISHABLE · no version bound"
              : "NOT_PUBLISHABLE · scratch"}
          </span>
          <span className="mono ml-auto text-[10px]" style={{ color: "var(--ink-faint)" }} data-release-note>
            routes, protocols and ceilings read from the INSTALLED engine release —{" "}
            {atlas ? `${atlas.current_release.package}==${atlas.current_release.expected_version} · ${atlas.current_release.release_id}` : "release not available"}
          </span>
        </div>
        <p
          className="text-[13px] italic"
          style={{ fontFamily: "Newsreader, Georgia, serif", color: "var(--ink-faint)" }}
        >
          {SUBTITLE}
        </p>
      </header>

      <WizardBar current={step} onPick={setStep} errors={errorSteps} />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          {step === "context" ? <ContextStep draft={draft} patch={patch} limits={limits} /> : null}
          {step === "strategy" ? (
            <StrategyStep draft={draft} patch={patch} limits={limits} error={errorByStep.get("strategy") ?? null} />
          ) : null}
          {step === "route" ? (
            <ResearchPanel title="engine routes" state={atlasState} minBodyHeight={120}>
              <RouteStep
                draft={draft}
                patch={patch}
                atlas={atlas}
                limits={limits}
                error={errorByStep.get("route") ?? null}
              />
            </ResearchPanel>
          ) : null}
          {step === "data" ? (
            <DataStep draft={draft} patch={patch} limits={limits} error={errorByStep.get("data") ?? null} />
          ) : null}
          {step === "windows" ? (
            <WindowsStep draft={draft} patch={patch} error={errorByStep.get("windows") ?? null} />
          ) : null}
          {step === "parameters" ? (
            <ParametersStep draft={draft} patch={patch} error={errorByStep.get("parameters") ?? null} />
          ) : null}
          {step === "optimization" ? (
            <OptimizationStep
              draft={draft}
              patch={patch}
              limits={limits}
              error={errorByStep.get("optimization") ?? null}
            />
          ) : null}

          {step === "review" ? (
            <div className="flex flex-col gap-2.5" data-review-step>
              {clearedBecause && preflight === null ? (
                <p role="status" className="text-[11px]" style={{ color: "var(--role-holdout)" }} data-cleared-note>
                  {clearedBecause}
                </p>
              ) : null}

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="btn-ghost mono text-[10px]"
                  data-action="preflight"
                  onClick={onRunPreflight}
                  disabled={blocking.length > 0}
                  style={blocking.length > 0 ? { opacity: 0.4, cursor: "not-allowed" } : undefined}
                  title={blocking.length > 0 ? blocking[0].message : undefined}
                >
                  Run preflight
                </button>
                {blocking.length > 0 ? (
                  <span className="text-[10.5px]" style={{ color: "var(--ink-faint)" }} data-disabled-reason="preflight">
                    {blocking[0].message}
                  </span>
                ) : null}
              </div>

              <ResearchPanel
                title="preflight"
                meta={preflight ? preflight.preflight_token : undefined}
                state={preflightState}
                minBodyHeight={86}
              >
                {preflight ? (
                  <div className="flex flex-col">
                    <Row label="effective spec">{preflight.effective_spec_digest}</Row>
                    <Row label="dataset binding">{preflight.dataset_binding_digest}</Row>
                    <Row label="manifest">{preflight.manifest_digest}</Row>
                    <Row label="folds">{preflight.topology.folds.length}</Row>
                    <Row label="may create run">
                      {/* Published display state. Admission is re-evaluated at
                          submit, so this is reported, never trusted as a gate. */}
                      <span data-may-create={String(preflight.may_create_run)}>
                        {String(preflight.may_create_run)}
                      </span>
                    </Row>
                  </div>
                ) : null}
              </ResearchPanel>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="btn-primary mono text-[10px]"
                  data-action="create-run"
                  onClick={onSubmit}
                  disabled={!canSubmit}
                  style={!canSubmit ? { opacity: 0.4, cursor: "not-allowed" } : undefined}
                  title={!canSubmit ? "Run preflight first." : undefined}
                >
                  Create run
                </button>
                {!canSubmit ? (
                  <span className="text-[10.5px]" style={{ color: "var(--ink-faint)" }} data-disabled-reason="create-run">
                    Run preflight first.
                  </span>
                ) : !mayCreateRun ? (
                  <span className="text-[10.5px]" style={{ color: "var(--role-holdout)" }} data-admission-note>
                    The server has not published creation admission for this preview. Submitting is
                    still allowed — admission is decided when the request arrives.
                  </span>
                ) : null}
              </div>

              <ResearchPanel title="run" state={createState} minBodyHeight={72}>
                {created ? (
                  <div className="flex flex-col" data-created={created.run_id}>
                    <Row label="run">{created.run_id}</Row>
                    <Row label="status">{created.status}</Row>
                    <Row label="replayed">{String(created.replayed)}</Row>
                    <Row label="effective spec">{created.effective_spec_digest}</Row>
                    <Row label="manifest">{created.manifest_digest}</Row>
                  </div>
                ) : null}
              </ResearchPanel>

              {outcomeUnknown ? (
                <div className="flex flex-wrap items-center gap-2" data-unknown-outcome>
                  <span className="text-[11px]" style={{ color: "var(--role-holdout)" }}>
                    {UNKNOWN_OUTCOME_NOTE}
                  </span>
                  <button type="button" className="btn-ghost mono text-[10px]" data-action="recheck" onClick={onRecheck}>
                    Check again
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <ReviewRail draft={draft} blocking={blocking} />
      </div>
    </div>
  );
}
