/**
 * Screen 06 · Stage A/B panels drawn from the server's trial surface (X2 · B3).
 *
 * On a retained WFO run the server publishes `surface` (spec 06 A2–A5, B4):
 * every point's placement inside the declared range, the objective's ramp
 * step, the twelve regions per parameter with their counts and exact means,
 * the top-decile share at θ* and the Spearman |ρ| proxy. These panels draw
 * those coordinates and nothing else — no quantile, rank, mean or score is
 * worked out here (spec 06 pitfall 1). The one browser arithmetic is
 * geometry: a server percentage turned into a CSS position, and a bar height
 * relative to the tallest bar of the same histogram.
 *
 * Pick is a cursor, not a selection: clicking a point or a ledger row writes
 * `pick=` to the hash (T07/T08) and never changes θ*.
 */

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";

import { useEntryAnimation, useEntryRef, useReadout } from "./chartLife";
import { TAP_SNAP_PX, useChartContract } from "./chartContract";
import { foldShort, foldTitle } from "./researchFormat";
import type { CurrentSourceSearch } from "./searchClient";
import { reasonCodeSentence } from "./researchRefusal";
import { cleanParameters } from "./searchParamText";
import { trialLabel } from "./trialLabel";

export type Surface = NonNullable<CurrentSourceSearch["surface"]>;
export type DeclaredSpace = NonNullable<CurrentSourceSearch["declared_space"]>;
type Point = Surface["points"][number];

const LABEL = "[font-family:var(--font-body)] text-[10px] font-medium uppercase tracking-[.07em]";
const CARD = "flex flex-col gap-[6px] rounded-[8px] border p-[14px]";
const CARD_STYLE = { borderColor: "var(--line)", background: "var(--paper-raised)" } as const;

/** Spec 06 §15.3 ramp, five steps, light → dark (tokens `--viz-ramp-1…5`). */
export const RAMP = ["var(--viz-ramp-1)", "var(--viz-ramp-2)", "var(--viz-ramp-3)", "var(--viz-ramp-4)", "var(--viz-ramp-5)"] as const;

/** A decimal the hi-fi prints to two places, with the screen's minus; the exact text rides in the title. */
export function two(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(parsed).replace(/^-/, "−");
}

/** The hi-fi axis pill (`spill`). */
export function AxisPill({ name, active, onPick, what, attr = "data-axis-pick" }: { name: string; active: boolean; onPick: () => void; what: string; attr?: string }) {
  return (
    <button
      type="button"
      className="mono border px-[6px] py-[1px] text-[9px]"
      style={
        active
          ? { borderColor: "var(--accent)", background: "var(--accent-soft)", color: "var(--accent)" }
          : { borderColor: "var(--line)", background: "transparent", color: "var(--ink-soft)" }
      }
      aria-pressed={active}
      {...{ [attr]: `${what}:${name}` }}
      onClick={onPick}
    >
      {name}
    </button>
  );
}

export function defaultAxes(axes: readonly string[]): { x: string; y: string } {
  /* Hi-fi defaults: x = window, y = the entry threshold (entry_z; on Delta, rvol — the what-if mapping). */
  const x = axes.includes("window") ? "window" : axes[0] ?? "";
  const y = axes.includes("rvol") && x !== "rvol" ? "rvol" : axes.find((axis) => axis !== x) ?? x;
  return { x, y };
}

/**
 * The parameters a point's tooltip shows, and where they came from. A point
 * that carries its own `parameters` (exact persisted values for its own
 * `source_ordinal`, identical to the ledger's) is read from itself, whatever
 * ledger page is loaded; only an older body without them falls back to the
 * loaded ledger rows. Rounding here is display only and never reaches a digest.
 */
export function pointParameters(
  point: Point,
  ledgerParametersOf: (trialId: string) => Record<string, string> | undefined,
): { parameters: Record<string, string> | undefined; source: "point" | "ledger" | "none" } {
  const own = cleanParameters(point.parameters);
  if (own !== undefined) return { parameters: own, source: "point" };
  const ledger = ledgerParametersOf(point.trial_id);
  return ledger !== undefined ? { parameters: ledger, source: "ledger" } : { parameters: undefined, source: "none" };
}

export function pointTitle(point: Point, x: string, y: string, parameters: Record<string, string> | undefined): string {
  const score = point.state === "PRUNED" ? "PRUNED (duplicate)" : `IS ${two(point.objective) ?? "not published"}`;
  const at = (name: string) => `${name} ${parameters?.[name] ?? "not published"}`;
  return `trial ${point.trial_id} · ${score} · ${at(x)} · ${at(y)}`;
}

/**
 * D1: one tab stop for the whole plot. Arrow keys move focus to the nearest
 * drawn point in that direction — screen geometry only, from the server's
 * own placement percentages; nothing is ranked or scored here.
 */
export function neighbourInDirection(
  from: { x: number; y: number },
  others: readonly { id: string; x: number; y: number }[],
  key: string,
): string | null {
  const axis = key === "ArrowRight" ? [1, 0] : key === "ArrowLeft" ? [-1, 0] : key === "ArrowDown" ? [0, 1] : key === "ArrowUp" ? [0, -1] : null;
  if (axis === null) return null;
  let best: { id: string; cost: number } | null = null;
  for (const other of others) {
    const dx = other.x - from.x;
    const dy = other.y - from.y;
    const along = dx * axis[0] + dy * axis[1];
    if (along <= 0) continue;
    const across = Math.abs(dx * axis[1]) + Math.abs(dy * axis[0]);
    const cost = along + 2 * across;
    if (best === null || cost < best.cost) best = { id: other.id, cost };
  }
  return best?.id ?? null;
}

function SurfacePanel({ id, title, aside, children }: { id: string; title: ReactNode; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className={`${CARD} min-w-0 overflow-x-auto`} style={CARD_STYLE} data-panel={id} data-panel-state="AVAILABLE" data-panel-lane="retained">
      <div className="flex flex-wrap items-center justify-between gap-[10px]">
        <h3 className={LABEL} style={{ color: "var(--ink-faint)" }}>
          {title}
        </h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** A typed absence of a surface block, in the server's words. */
export function SurfaceAbsence({
  id,
  title,
  reason,
  state = "NOT_PUBLISHED",
}: {
  id: string;
  title: string;
  reason: string | null;
  /** NOT_APPLICABLE: the question does not arise (typed by the server), not a missing fact. */
  state?: "NOT_PUBLISHED" | "NOT_APPLICABLE";
}) {
  return (
    <section className={CARD} style={CARD_STYLE} data-panel={id} data-panel-state={state} data-panel-lane="retained">
      <div className="flex flex-wrap items-baseline gap-2">
        <h3 className={LABEL} style={{ color: "var(--ink-faint)" }}>
          {title}
        </h3>
        <span className="mono text-[10.5px] italic" style={{ color: "var(--ink-faint)" }} title={reason ?? undefined}>
          {state === "NOT_APPLICABLE" ? "not applicable" : "not published"}
        </span>
      </div>
      {reason ? (
        <span className="text-[10.5px] leading-[1.5]" style={{ color: "var(--ink-soft)" }}>
          {reasonCodeSentence(reason)}
        </span>
      ) : null}
      <span hidden data-gap-reason={id}>
        {reason}
      </span>
    </section>
  );
}

/* --------------------------------------------------------- A2 · surface */

export function SurfaceScatter({
  surface,
  parametersOf,
  schedule,
  pick,
  onPick,
  onClear,
  scopeLabel,
}: {
  surface: Surface;
  /** B11 S06: an honest scope for a per-study surface (replaces the schedule word). */
  scopeLabel?: string;
  /** The loaded ledger page's parameter text per trial: the fallback for a point that carries none of its own. */
  parametersOf: (trialId: string) => Record<string, string> | undefined;
  schedule: string | null;
  pick: string | null;
  onPick: (trialId: string) => void;
  /** Escape on the plot lets go of the pick. */
  onClear?: () => void;
}) {
  const [axes, setAxes] = useState(() => defaultAxes(surface.axes));
  const [roving, setRoving] = useState<string | null>(null);
  const plot = useRef<HTMLDivElement | null>(null);
  useEntryAnimation(plot);
  const readout = useReadout();
  /* A new pick (click, ledger row, link) becomes the stop again; arrows then move it. */
  useEffect(() => setRoving(null), [pick]);
  const pruned = surface.points.filter((point) => point.state === "PRUNED").length;
  const placed = surface.points.filter((point) => point.positions[axes.x] != null && point.positions[axes.y] != null);
  const unplaced = surface.points.length - placed.length;
  const selected = surface.selected_trial_id;
  const best = surface.best_is_trial_id;
  const scope = scopeLabel ?? (schedule === "global" ? "global study" : schedule ?? "study scope not published");
  /* One tab stop: the picked point, else the one the arrows reached, else θ*, else the first drawn. */
  const tabStop =
    [roving, pick, selected].find((id) => id != null && placed.some((point) => point.trial_id === id)) ?? placed[0]?.trial_id ?? null;
  const onPlotKey = (event: KeyboardEvent<HTMLElement>, id: string) => {
    if (event.key === "Escape") {
      if (pick !== null && onClear) {
        event.preventDefault();
        onClear();
      }
      return;
    }
    const here = placed.find((point) => point.trial_id === id);
    if (!here) return;
    const at = (point: Point) => ({ x: point.positions[axes.x] as number, y: 100 - (point.positions[axes.y] as number) });
    const next = neighbourInDirection(
      at(here),
      placed.filter((point) => point.trial_id !== id).map((point) => ({ id: point.trial_id, ...at(point) })),
      event.key,
    );
    if (next === null) return;
    event.preventDefault();
    setRoving(next);
    const target = [...(plot.current?.querySelectorAll("[data-surface-point]") ?? [])].find((element) => element.getAttribute("data-surface-point") === next);
    (target as HTMLElement | undefined)?.focus();
  };
  /* Tap/click near a dot (WCAG 2.5.8): the nearest drawn point within 24 px, not a 5-9 px hit. Geometry only. */
  const onPlotTap = (event: MouseEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("button")) return;
    const rect = plot.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return;
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    let best: { point: Point; distance: number } | null = null;
    for (const point of placed) {
      const dx = (((point.positions[axes.x] as number) * 0.96 + 2) / 100) * rect.width - px;
      const dy = ((98 - (point.positions[axes.y] as number) * 0.96) / 100) * rect.height - py;
      const distance = Math.hypot(dx, dy);
      if (best === null || distance < best.distance) best = { point, distance };
    }
    if (best === null || best.distance > TAP_SNAP_PX) return;
    const hit = best.point;
    const params = pointParameters(hit, parametersOf);
    (readout.bind(pointTitle(hit, axes.x, axes.y, params.parameters)).onPointerDown as () => void)();
    setRoving(hit.trial_id);
    onPick(hit.trial_id);
  };
  const sampled =
    surface.sampling === "ALL_RETAINED_TRIALS"
      ? `${surface.emitted_point_count} of ${surface.source_trial_count} trials drawn`
      : `${surface.emitted_point_count} of ${surface.source_trial_count} trials drawn · stride sample, θ* and best IS kept`;
  return (
    <SurfacePanel
      id="scatter"
      title={`A2 · trial surface — ${surface.source_trial_count} trials · ${pruned} pruned · ${scope}`}
      aside={
        <span className="flex flex-wrap items-center gap-[6px]" data-axis-picker>
          <span className="text-[9px]" style={{ color: "var(--ink-faint)" }}>
            x
          </span>
          {surface.axes.map((name) => (
            <AxisPill key={`x-${name}`} name={name} what="x" active={axes.x === name} onPick={() => setAxes((current) => ({ ...current, x: name }))} />
          ))}
          <span className="pl-1 text-[9px]" style={{ color: "var(--ink-faint)" }}>
            y
          </span>
          {surface.axes.map((name) => (
            <AxisPill key={`y-${name}`} name={name} what="y" active={axes.y === name} onPick={() => setAxes((current) => ({ ...current, y: name }))} />
          ))}
        </span>
      }
    >
      <div
        className="relative h-[250px] border"
        style={{ borderColor: "var(--line)", background: "var(--paper)" }}
        ref={plot}
        role="group"
        aria-label="trial surface"
        onClick={onPlotTap}
        data-surface={`${axes.x}×${axes.y}`}
        data-surface-points={placed.length}
      >
        {placed.map((point) => {
          const theta = point.trial_id === selected;
          const isBest = point.trial_id === best;
          const size = theta || isBest ? 9 : point.state === "PRUNED" ? 6 : 5;
          const left = (point.positions[axes.x] as number) * 0.96 + 2;
          const top = 98 - (point.positions[axes.y] as number) * 0.96;
          const params = pointParameters(point, parametersOf);
          const title = `${pointTitle(point, axes.x, axes.y, params.parameters)}${theta ? " · θ* (selected)" : ""}${isBest ? " · best IS" : ""}`;
          return (
            <button
              key={point.trial_id}
              type="button"
              aria-label={`trial ${point.trial_id} · ${point.state === "PRUNED" ? "pruned" : `IS ${two(point.objective) ?? "not published"}`}`}
              aria-current={pick === point.trial_id ? "true" : undefined}
              title={title}
              tabIndex={point.trial_id === tabStop ? 0 : -1}
              onKeyDown={(event) => onPlotKey(event, point.trial_id)}
              onFocus={() => setRoving(point.trial_id)}
              className="absolute rounded-full p-0"
              style={{
                left: `${left.toFixed(2)}%`,
                top: `${top.toFixed(2)}%`,
                width: size,
                height: size,
                margin: `-${size / 2}px 0 0 -${size / 2}px`,
                background: point.state === "PRUNED" || point.objective_bucket === null ? "transparent" : RAMP[point.objective_bucket],
                border: theta
                  ? "2px solid var(--good)"
                  : isBest
                    ? "2px solid var(--bad)"
                    : point.state === "PRUNED"
                      ? "1px dashed var(--ink-faint)"
                      : "0",
                boxShadow: pick === point.trial_id ? "0 0 0 3px var(--viz-pick-ring)" : isBest && theta ? "0 0 0 2px var(--bad)" : "none",
                zIndex: theta || isBest ? 3 : 1,
              }}
              data-entry="fade"
              {...readout.bind(title)}
              data-surface-point={point.trial_id}
              data-source-ordinal={point.source_ordinal}
              data-params-source={params.source}
              data-point-bucket={point.objective_bucket ?? ""}
              data-point-role={theta ? (isBest ? "theta best" : "theta") : isBest ? "best" : ""}
              data-picked={pick === point.trial_id ? "true" : undefined}
              onClick={() => onPick(point.trial_id)}
            />
          );
        })}
        <span className="mono absolute left-[6px] top-[5px] text-[9px]" style={{ color: "var(--ink-faint)" }} data-surface-y>
          ↑ {axes.y}
        </span>
        <span className="mono absolute bottom-[4px] right-[6px] text-[9px]" style={{ color: "var(--ink-faint)" }} data-surface-x>
          {axes.x} →
        </span>
      </div>
      <span className="mono min-h-[13px] text-[9.5px]" style={{ color: "var(--ink-soft)" }} data-surface-readout={readout.text ?? undefined} role="status" aria-live="polite">
        {readout.text}
      </span>
      <div className="flex flex-wrap gap-3 text-[9.5px]" style={{ color: "var(--ink-faint)" }} data-surface-legend>
        <span className="flex items-center gap-1">
          <span className="inline-block h-[8px] w-[44px]" style={{ background: `linear-gradient(90deg, ${RAMP[0]}, ${RAMP[4]})` }} />
          objective low → high
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-[9px] w-[9px] rounded-full" style={{ border: "2px solid var(--good)" }} />θ* · {trialLabel({ sourceId: selected }) ?? "source not published"}
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-[9px] w-[9px] rounded-full" style={{ border: "2px solid var(--bad)" }} />
          best IS · {trialLabel({ sourceId: best }) ?? "source not published"}
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-[8px] w-[8px] rounded-full" style={{ border: "1px dashed var(--ink-faint)" }} />
          pruned = duplicate
        </span>
        <span className="flex items-center gap-1" title="Click a point to select that trial; arrow keys move between points, Escape clears">
          <span className="inline-block h-[9px] w-[9px] rounded-full" style={{ boxShadow: "0 0 0 3px var(--viz-pick-ring)" }} />
          picked
        </span>
      </div>
      <span className="text-[9.5px] leading-[1.5]" style={{ color: "var(--ink-faint)" }} data-surface-caption title={`${surface.schema_version} · ${surface.objective_ramp.rule} · positions are the server's placement inside each declared range; colour = how many of the ${surface.complete_trial_count} complete IS objectives' quintile thresholds a trial lies above`}>
        {sampled}
        {unplaced > 0 ? ` · ${unplaced} not placeable on ${axes.x} × ${axes.y}` : ""} · colour = IS quintile ({two(surface.objective_ramp.minimum) ?? "not published"} … {two(surface.objective_ramp.maximum) ?? "not published"})
      </span>
    </SurfacePanel>
  );
}

/* ----------------------------------------------------- A3 · progression */

export function SurfaceProgression({
  surface,
  declared,
  prunedCount,
}: {
  surface: Surface;
  declared: DeclaredSpace;
  prunedCount: number | null;
}) {
  const [conc, setConc] = useState(() => (surface.axes.includes("window") ? "window" : surface.axes[0] ?? ""));
  const points = surface.points;
  const n = Math.max(points.length, 1);
  const lo = Number(surface.objective_ramp.minimum);
  const hi = Number(surface.objective_ramp.maximum);
  /* Geometry only: an objective's height between the ramp's published minimum and maximum. */
  const height = (value: string | null) => {
    if (value === null || !Number.isFinite(lo) || !Number.isFinite(hi)) return null;
    const v = Number(value);
    return hi === lo ? 50 : 92 - ((v - lo) / (hi - lo)) * 84;
  };
  const thetaRow = declared.parameters.find((parameter) => parameter.name === conc);
  const pruned = points.filter((point) => point.state === "PRUNED");
  const entryRef = useEntryRef<HTMLDivElement>();
  return (
    <SurfacePanel
      id="progression"
      title="A3 · progression"
      aside={
        <span className="flex flex-wrap items-center gap-[6px]" data-conc-picker>
          <span className="text-[9px]" style={{ color: "var(--ink-faint)" }}>
            param
          </span>
          {surface.axes.map((name) => (
            <AxisPill key={name} name={name} what="c" active={conc === name} onPick={() => setConc(name)} />
          ))}
        </span>
      }
    >
      <div ref={entryRef} className="flex flex-wrap items-stretch gap-[14px] min-[640px]:flex-nowrap">
        <div className="flex min-w-[220px] flex-[1.2] flex-col gap-1">
          <span className="text-[9.5px]" style={{ color: "var(--ink-faint)" }}>
            objective in trial order · gold = best-so-far
          </span>
          <div className="relative h-[130px] border" style={{ borderColor: "var(--line)", background: "var(--paper)" }} data-progression>
            {points.map((point, index) => {
              const x = (index / n) * 98 + 1 + 49 / n;
              const y = height(point.objective);
              const best = height(point.best_so_far);
              return (
                <span key={point.trial_id}>
                  {y !== null ? (
                    <span
                      className="absolute h-[5px] w-[5px] rounded-full"
                      style={{ left: `${x.toFixed(1)}%`, top: `${y.toFixed(1)}%`, background: "var(--accent)", opacity: 0.55 }}
                      title={`trial ${point.trial_id} · IS ${two(point.objective)}`}
                      data-entry="fade"
                      data-progression-trial={point.trial_id}
                    />
                  ) : null}
                  {best !== null ? (
                    <span
                      className="absolute h-[2px] w-[9px]"
                      style={{ left: `calc(${x.toFixed(1)}% - 2px)`, top: `${best.toFixed(1)}%`, background: "var(--accent-2)" }}
                      title={`best-so-far ${two(point.best_so_far)}`}
                      data-entry="x"
                      data-entry-origin="left"
                      data-best-so-far={point.best_so_far ?? ""}
                    />
                  ) : null}
                </span>
              );
            })}
          </div>
          <div className="relative h-[12px] border" style={{ borderColor: "var(--line)", background: "var(--paper-sunken)" }} data-pruned-rail={pruned.length}>
            {pruned.map((point) => {
              const index = points.indexOf(point);
              return (
                <span
                  key={point.trial_id}
                  className="absolute bottom-[1px] top-[1px] w-[2px] border-l-2 border-dashed"
                  style={{ left: `${((index / n) * 99).toFixed(1)}%`, borderColor: "var(--ink-faint)" }}
                  title={`trial ${point.trial_id} · PRUNED — duplicate_policy=prune`}
                />
              );
            })}
          </div>
          <span
            className="text-[9.5px]"
            style={{ color: "var(--ink-soft)" }}
            data-rail-note
            title={pruned.length > 0 ? "QuantBT's DuplicatePruner, not epoch pruning" : "capability probe"}
          >
            {pruned.length > 0
              ? `${pruned.length} pruned (duplicate pruner)`
              : prunedCount !== null
                ? `pruned ${prunedCount} of ${surface.source_trial_count}`
                : "no pruned trial"}
          </span>
        </div>
        <div className="flex min-w-[200px] flex-1 flex-col gap-1 border-l pl-[14px]" style={{ borderColor: "var(--line-soft)" }}>
          <span className="text-[9.5px]" style={{ color: "var(--ink-faint)" }} data-conc-title>
            {conc} by trial order
          </span>
          <div className="relative h-[130px] border" style={{ borderColor: "var(--line)", background: "var(--paper)" }} data-concentration={conc}>
            {points.map((point, index) => {
              const position = point.positions[conc];
              if (position == null) return null;
              return (
                <span
                  key={point.trial_id}
                  className="absolute h-[5px] w-[5px] rounded-full"
                  style={{
                    left: `${((index / n) * 98 + 1 + 49 / n).toFixed(1)}%`,
                    top: `${(94 - position * 0.88).toFixed(1)}%`,
                    background: point.state === "PRUNED" ? "var(--line-strong)" : "var(--accent)",
                    opacity: 0.55,
                  }}
                  title={`trial ${point.trial_id} · ${conc} at ${position}% of its declared range`}
                  data-entry="fade"
                />
              );
            })}
            {thetaRow ? (
              <span
                className="absolute left-0 right-0 h-px"
                style={{ top: `${(94 - thetaRow.position_percent * 0.88).toFixed(1)}%`, background: "var(--good)", opacity: 0.7 }}
                title={`θ* ${conc} = ${thetaRow.value}`}
                data-conc-theta={thetaRow.value}
                data-entry="x"
                data-entry-origin="left"
              />
            ) : null}
          </div>
          <span
            className="text-[9.5px] leading-[1.45]"
            style={{ color: "var(--ink-soft)" }}
            data-conc-note
            title={`each dot is one trial's ${conc} in trial order; the green line is θ*`}
          >
            {points.length < 20 ? `too few trials (${points.length}) to read · green = θ*` : "dot = one trial · green = θ*"}
          </span>
        </div>
      </div>
    </SurfacePanel>
  );
}

/* --------------------------------------------------- A4 · distributions */

type Distribution = Surface["distributions"]["parameters"][number];

/** The server's own bin words: the bin's title, the hook's readout and the live text. */
function binWords(distribution: Distribution, bin: Distribution["bins"][number]): string {
  return `${distribution.name} · ${bin.lower} … ${bin.upper} · ${bin.count} trial${bin.count === 1 ? "" : "s"} · mean IS ${bin.mean_objective === null ? "not published" : `${two(bin.mean_objective)} (${bin.mean_objective})`}`;
}

/** One parameter's twelve regions: one tab stop, arrows walk the bins, the bins are decorative. */
function DistributionBars({ distribution, onText }: { distribution: Distribution; onText: (text: string | null) => void }) {
  const tallest = Math.max(1, ...distribution.bins.map((bin) => bin.count));
  const n = distribution.bins.length;
  const first = distribution.bins[0];
  const last = distribution.bins[n - 1];
  const c = useChartContract({
    label: `${distribution.name} distribution`,
    noun: "region",
    count: n,
    describe: (i) => binWords(distribution, distribution.bins[i]!),
    summary: `${distribution.name}: ${distribution.regions_sampled} of ${n} regions sampled, ${first?.lower ?? "not published"} to ${last?.upper ?? "not published"}; θ* ${distribution.theta_value}.`,
    xs: distribution.bins.map((_, i) => ((i + 0.5) / n) * 100),
    onIndex: (i) => onText(i === null ? null : binWords(distribution, distribution.bins[i]!)),
  });
  const { className, style, ...region } = c.regionProps;
  return (
    <>
      <div
        {...region}
        className={`relative flex h-[52px] items-end gap-px border-b ${className ?? ""}`}
        style={{ ...style, borderColor: "var(--line)" }}
        data-distribution-region={distribution.name}
      >
        {distribution.bins.map((bin) => (
          <span
            key={bin.index}
            className="flex-1"
            style={{
              height: `${Math.max(3, (bin.count / tallest) * 100).toFixed(0)}%`,
              background: bin.shade_bucket === null ? "var(--paper-sunken)" : RAMP[bin.shade_bucket],
              outline: c.index === bin.index ? "1px solid var(--ink)" : undefined,
            }}
            title={binWords(distribution, bin)}
            aria-hidden="true"
            data-entry="y"
            data-entry-origin="bottom"
            data-bin={bin.index}
            data-bin-count={bin.count}
          />
        ))}
        <span
          className="absolute bottom-[-1px] top-0 w-[2px]"
          style={{ left: `${distribution.theta_position_percent}%`, background: "var(--good)" }}
          aria-hidden="true"
          data-dist-theta={distribution.theta_position_percent}
        />
      </div>
      {c.nodes}
    </>
  );
}

export function SurfaceDistributions({ surface }: { surface: Surface }) {
  const distributions = surface.distributions.parameters;
  const entryRef = useEntryRef<HTMLDivElement>();
  const [readText, setReadText] = useState<string | null>(null);
  return (
    <SurfacePanel
      id="distributions"
      title="A4 · per param — sampled regions"
      aside={
        <span className="text-[9.5px]" style={{ color: "var(--ink-faint)" }} data-regions-header>
          {distributions.every((distribution) => distribution.regions_sampled === distribution.bins.length)
            ? `regions sampled: ${distributions[0]?.bins.length ?? 0}/${distributions[0]?.bins.length ?? 0}`
            : "regions sampled: see each parameter"}
        </span>
      }
    >
      <div ref={entryRef} className="flex flex-wrap" data-distributions={distributions.length}>
        {distributions.map((distribution) => (
          <div key={distribution.name} className="flex w-full flex-col gap-[3px] pb-2 pr-[14px] pt-1.5 min-[520px]:w-1/2 min-[900px]:w-1/3" data-distribution={distribution.name}>
            <div className="flex items-baseline justify-between">
              <span className="mono text-[10.5px]">{distribution.name}</span>
              {/* D17: full coverage is said once in the header; a parameter speaks only when it is short. */}
              {distribution.regions_sampled < distribution.bins.length ? (
                <span className="text-[9px]" style={{ color: "var(--ink-faint)" }} data-regions-sampled={distribution.regions_sampled}>
                  {distribution.regions_sampled}/{distribution.bins.length} regions sampled
                </span>
              ) : (
                <span hidden data-regions-sampled={distribution.regions_sampled} />
              )}
            </div>
            <DistributionBars distribution={distribution} onText={setReadText} />
            <div className="mono flex justify-between text-[9px]" style={{ color: "var(--ink-faint)" }}>
              <span>{distribution.minimum}</span>
              <span style={{ color: "var(--good)" }}>θ* {distribution.theta_value}</span>
              <span>{distribution.maximum}</span>
            </div>
          </div>
        ))}
      </div>
      <span className="mono block min-h-[13px] pt-1 text-[9.5px]" style={{ color: "var(--ink-soft)" }} data-distribution-readout={readText ?? undefined}>
        {readText}
      </span>
      <SurfaceImportance surface={surface} />
    </SurfacePanel>
  );
}

/* ------------------------------------------------------- A5 · importance */

function SurfaceImportance({ surface }: { surface: Surface }) {
  const importance = surface.importance;
  const entryRef = useEntryRef<HTMLDivElement>();
  return (
    <div ref={entryRef} className="flex flex-col gap-[3px] border-t pt-2" style={{ borderColor: "var(--line-soft)" }} data-panel="importance" data-panel-state={importance.state} data-panel-lane="retained">
      <div className="flex items-baseline justify-between">
        <h3 className={LABEL} style={{ color: "var(--ink-faint)" }}>
          A5 · which params drive the objective
        </h3>
        <span className="text-[9px]" style={{ color: "var(--accent-2)" }} title={`${importance.rule} · a Spearman proxy computed by the portal, not fANOVA`}>
          Spearman ρ vs objective
        </span>
      </div>
      {importance.state === "AVAILABLE" ? (
        importance.parameters.map((row) => {
          const rho = row.rho === null ? null : Number(row.rho);
          const strong = rho !== null && Math.abs(rho) > 0.25;
          return (
            <span key={row.name} className="mono flex items-center gap-2 text-[10px]" data-importance={row.name}>
              <span className="w-[86px] flex-none" style={{ color: "var(--ink-soft)" }}>
                {row.name}
              </span>
              <span className="w-[48px] flex-none text-right" style={{ color: strong ? "var(--accent)" : "var(--ink-faint)" }} title={row.reason_code ?? undefined}>
                {row.rho === null ? "not published" : `${rho! >= 0 ? "+" : "−"}${Math.abs(rho!).toFixed(2)}`}
              </span>
              <span className="relative h-[8px] flex-1 border" style={{ borderColor: "var(--line-soft)", background: "var(--paper-sunken)" }}>
                {rho !== null ? (
                  <span
                    className="absolute bottom-0 left-0 top-0"
                    style={{ width: `${Math.min(100, Math.abs(rho) * 160).toFixed(0)}%`, background: strong ? "var(--viz-ramp-2)" : "var(--line)" }}
                    data-entry="x"
                    data-entry-origin="left"
                  />
                ) : null}
              </span>
            </span>
          );
        })
      ) : (
        <span className="text-[10.5px] leading-[1.5]" style={{ color: "var(--ink-soft)" }} data-importance-absent={importance.reason_code ?? ""}>
          <span className="mono italic" style={{ color: "var(--ink-faint)" }} title={importance.reason_code ?? undefined}>
            not applicable
          </span>{" "}
          — {surface.complete_trial_count} trials, needs ≥ {importance.minimum_trials}
        </span>
      )}
    </div>
  );
}

/* ------------------------------------------------------ B4 · θ* journey */

export function ThetaJourney({ surface, declared, schedule }: { surface: Surface; declared: DeclaredSpace; schedule: string | null }) {
  const entryRef = useEntryRef<HTMLDivElement>();
  const frequency = useMemo(
    () => Object.fromEntries(surface.parameter_frequency.parameters.map((row) => [row.name, row])),
    [surface.parameter_frequency.parameters],
  );
  return (
    <SurfacePanel
      id="parameter_frequency"
      title="B4 · θ* journey — stability across folds"
      aside={
        <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }} title={surface.parameter_frequency.rule}>
          top-decile share at θ*
        </span>
      }
    >
      <div ref={entryRef} className="contents">
      {declared.parameters.map((parameter) => {
        const row = frequency[parameter.name];
        return (
          <span key={parameter.name} className="mono flex items-center gap-2 text-[10px]" data-journey={parameter.name}>
            <span className="w-[86px] flex-none" style={{ color: "var(--ink-soft)" }}>
              {parameter.name}
            </span>
            <span className="relative h-[22px] flex-1 border" style={{ borderColor: "var(--line-soft)", background: "var(--paper)" }}>
              <span
                className="absolute top-[5px] h-[10px] w-[10px] rounded-full"
                style={{ left: `calc(${parameter.position_percent}% - 5px)`, background: "var(--good)" }}
                data-entry="fade"
                title={`θ* ${parameter.name} = ${parameter.value} · ${schedule === "global" ? "one global selection — the same value in every fold" : "the selection"}`}
              />
            </span>
            <span
              className="w-[110px] flex-none text-right"
              style={{ color: row && row.share_percent > 60 ? "var(--good)" : "var(--accent-2)" }}
              title={row ? `${row.matching} of ${surface.parameter_frequency.pool_count} top-decile trials carry θ*'s value` : undefined}
              data-frequency={row?.share_percent ?? ""}
            >
              {row ? `${Math.round(row.share_percent)}%` : "not published"}
            </span>
          </span>
        );
      })}
      </div>
      <span
        className="text-[9.5px] leading-[1.5]"
        style={{ color: "var(--ink-faint)" }}
        data-journey-caption
        title={`${schedule === "global" ? "Global θ* — one value for every fold, so there is no per-fold journey. " : ""}Right column: of the top decile of complete trials by IS objective, the share carrying θ*'s value — computed on the server from the retained ledger.`}
      >
        {schedule === "global" ? "global θ* · " : ""}
        top-decile share ({surface.parameter_frequency.pool_count} of {surface.complete_trial_count})
      </span>
    </SurfacePanel>
  );
}


/* ------------------------------------------- S06 · one surface per outer study */

export type StudySurface = NonNullable<CurrentSourceSearch["surfaces_by_study"]>[number];

/** The engine's fold_id is 0-based; the hash counts from 1. Non-numeric ids fall back to their position. */
export const studyOrdinal = (study: StudySurface, index: number) => (/^\d+$/.test(study.fold_id) ? Number(study.fold_id) + 1 : index + 1);
/** The study the cursor's fold names (else the first): one rule for the A2 selector and the cinema. */
export const activeStudy = (studies: readonly StudySurface[], foldOrdinal: number): StudySurface =>
  studies.find((study, index) => studyOrdinal(study, index) === foldOrdinal) ?? studies[0]!;

/**
 * B11 S06: the causal profile ranks each outer fold's inner-validation study on
 * its own, so there is one surface per study and no run-global surface. A study
 * selector picks which one A2-A4 draw; every title names that study. Nothing
 * here merges or re-ranks studies.
 */
export function StudySurfaces({
  studies,
  declared,
  parentReason,
  parametersOf,
  schedule,
  pick,
  onPick,
  onClear,
  prunedCount,
  foldOrdinal,
  onFold,
}: {
  studies: readonly StudySurface[];
  declared: DeclaredSpace | null | undefined;
  /** The parent run-global surface's served reason (NOT_APPLICABLE). */
  parentReason: string | null;
  parametersOf: (trialId: string) => Record<string, string> | undefined;
  schedule: string | null;
  pick: string | null;
  onPick: (trialId: string) => void;
  onClear?: () => void;
  prunedCount: number | null;
  /** The cursor's 1-based fold: the one source of which study is drawn (W5 §3.4). */
  foldOrdinal: number;
  /** Writes the cursor's fold; `replace` for a follow (a pick in another study), not a reader's move. */
  onFold: (fold: number, options?: { replace?: boolean }) => void;
}) {
  /* The engine's fold_id is 0-based; the hash counts from 1. Non-numeric ids fall back to their position. */
  const ordinalOf = studyOrdinal;
  const active = activeStudy(studies, foldOrdinal);
  const activeOrdinal = ordinalOf(active, studies.indexOf(active));
  /* A pick inside another study moves the selector to it, so the point stays visible. */
  const ownerIndex = pick === null ? -1 : studies.findIndex((study) => study.surface.points?.some((point) => point.trial_id === pick));
  const ownerOrdinal = ownerIndex < 0 ? null : ordinalOf(studies[ownerIndex]!, ownerIndex);
  const follow = useRef({ activeOrdinal, onFold });
  follow.current = { activeOrdinal, onFold };
  useEffect(() => {
    if (ownerOrdinal !== null && ownerOrdinal !== follow.current.activeOrdinal) follow.current.onFold(ownerOrdinal, { replace: true });
  }, [ownerOrdinal]);
  const surface = active.surface;
  const served = surface.state === "AVAILABLE" && declared?.state === "AVAILABLE";
  const label = foldShort(active.fold_id);
  return (
    <div className="flex min-w-0 flex-col gap-3" data-study-surfaces={studies.length}>
      <SurfaceAbsence id="surface-run-global" title="A2 · run-global trial surface" reason={parentReason} state="NOT_APPLICABLE" />
      <div className="flex flex-wrap items-center gap-[6px]" role="group" aria-label="outer fold">
        {studies.map((study, index) => {
          const on = study.study_id === active.study_id;
          return (
            <button
              key={study.study_id}
              type="button"
              className="mono border px-[8px] py-[1px] text-[10px]"
              style={
                on
                  ? { borderColor: "var(--accent)", background: "var(--accent-soft)", color: "var(--accent)" }
                  : { borderColor: "var(--line)", background: "transparent", color: "var(--ink-soft)" }
              }
              aria-current={on ? "true" : undefined}
              data-study-pick={study.study_id}
              title={`study ${study.study_id} · ${study.scope} · ${foldTitle(study.fold_id)}`}
              onClick={() => onFold(ordinalOf(study, index))}
            >
              {foldShort(study.fold_id)}
            </button>
          );
        })}
      </div>
      {served && declared ? (
        <>
          <SurfaceScatter
            key={`scatter-${active.study_id}`}
            surface={surface}
            parametersOf={parametersOf}
            schedule={schedule}
            scopeLabel={`${label} · inner validation`}
            pick={pick}
            onPick={onPick}
            onClear={onClear}
          />
          <SurfaceProgression key={`progression-${active.study_id}`} surface={surface} declared={declared} prunedCount={prunedCount} />
          <SurfaceDistributions key={`distributions-${active.study_id}`} surface={surface} />
        </>
      ) : (
        <SurfaceAbsence
          id="surface-study"
          title={`A2 · ${label}`}
          reason={surface.reason_code ?? declared?.reason_code ?? null}
          state={surface.state === "NOT_APPLICABLE" ? "NOT_APPLICABLE" : "NOT_PUBLISHED"}
        />
      )}
    </div>
  );
}
