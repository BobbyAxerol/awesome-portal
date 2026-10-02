/**
 * Screen 07 §2.5 — the what-if sandbox (A10c).
 *
 * Two sliders around the frozen θ*, a ΔJ₁ preview read from the server's 9×9
 * table, a coverage count, one explicit "evaluate grid" action and one
 * "create sibling attempt →" fork. The rules this card keeps:
 *
 *  - **Sliders move over the server's nodes only.** A slider is an index into
 *    the nine published values, so there is no off-node value to interpolate:
 *    the preview is the cell's own number or its own typed absence.
 *  - **A missing cell is not 0.** MISSING / QUEUED / NOT_DEFINED each have
 *    their own words; ΔJ is printed only for an EVALUATED cell, exactly as the
 *    server sent it.
 *  - **Nothing runs by itself.** Mount, slider drag and refresh never POST; the
 *    one diagnostic job starts only from the "evaluate grid" click.
 *  - **A fork, not an edit.** The sibling link opens Screen 02 with a copied
 *    draft; this card never changes the frozen table.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { formatMetric, formatUtc, shortDigest } from "./researchFormat";
import type { WhatIf, WhatIfCell, WhatIfEvaluateSlot } from "./freezeClient";
import { RefusalNote } from "./ResearchPanel";
import { ShortId } from "./ShortId";

/** Spec 07 §2.5, verbatim. */
export const WHAT_IF_RULE =
  "a what-if never writes onto frozen params — commit creates a SIBLING ATTEMPT with its own config_hash, lineage-linked to this one.";

const CELL_WORDS: Record<WhatIfCell["state"], string> = {
  EVALUATED: "evaluated",
  NOT_DEFINED: "no objective",
  QUEUED: "queued",
  MISSING: "not evaluated",
};

const REASON_WORDS: Record<string, string> = {
  P16_WHATIF_NOT_ENABLED: "what-if diagnostic not enabled here",
  P16_WHATIF_PARENT_PROFILE_BINDING_NOT_REGISTERED: "no registered walk-forward declaration to build a grid from",
  P16_WHATIF_BLOCKED_UNTIL_THE_FROZEN_CHAIN_IS_RESOLVED: "resolve the chain first — sealed bytes do not verify",
  P16_WHATIF_EVERY_UNIQUE_EVALUATION_ALREADY_EXISTS: "every node already evaluated",
  P16_WHATIF_DIAGNOSTIC_JOB_IN_FLIGHT: "diagnostic job running",
  P16_SIBLING_DRAFT_BLOCKED_UNTIL_THE_FROZEN_CHAIN_IS_RESOLVED: "resolve the chain first",
  P04_FIXED_PROFILE_DOES_NOT_PUBLISH_EVALUATED_WHAT_IF_GRID:
    "fixed profile — no evaluated neighbourhood",
  RS02_DOES_NOT_ENQUEUE_EVALUATION_FROM_A_GET:
    "retained lane predates the what-if grid — nothing served",
};

export function whatIfReason(code: string | null | undefined): string {
  return (code && REASON_WORDS[code]) ?? code ?? "";
}

/** A signed exact decimal, e.g. `+0.041`, `−0.087`, `0`. No rounding. */
export function signedDecimal(value: string): string {
  if (value.startsWith("-")) return `−${value.slice(1)}`;
  return value === "0" ? "0" : `+${value}`;
}

/**
 * A served decimal as the card prints it: grouped and at most six significant
 * digits (`formatMetric`'s default), a true minus. The exact string stays in
 * the caller's `title`. A value that is not a number comes back unchanged —
 * never `0`.
 */
export function shownDecimal(value: string): string {
  const shown = formatMetric(value, null) ?? value;
  return shown.startsWith("-") ? `−${shown.slice(1)}` : shown;
}

/** `shownDecimal` with the sign ΔJ always carries (`+0.041`, `−0.087`); zero stays `0`. */
export function shownSignedDecimal(value: string): string {
  const shown = shownDecimal(value);
  if (shown.startsWith("−") || shown === "0") return shown;
  return `+${shown}`;
}

/** Tokens a server enum keeps in capitals when it is read as words. */
const KEEP_UPPER = new Set(["IS", "OOS", "WFO"]);

/**
 * A server enum read as words without turning an abbreviation into a verb:
 * `GLOBAL_STUDY_IS_FOLDS` → "global study · IS folds"; unknown enums fall back
 * to their tokens with IS / OOS / single letters kept in capitals. The raw
 * code is the caller's `title`.
 */
export function enumWords(code: string): string {
  if (code === "GLOBAL_STUDY_IS_FOLDS") return "global study · IS folds";
  return code
    .split("_")
    .map((token) => (token.length <= 1 || KEEP_UPPER.has(token) ? token : token.toLowerCase()))
    .join(" ");
}

/** The node whose value is nearest `target`; among equal distances (clamped duplicates) the one nearest `from`. */
function nearestNode(nodes: number[], target: number, from: number): number {
  let best = from;
  let bestDistance = Number.POSITIVE_INFINITY;
  nodes.forEach((node, index) => {
    const distance = Math.abs(node - target);
    if (distance < bestDistance || (distance === bestDistance && Math.abs(index - from) < Math.abs(best - from))) {
      best = index;
      bestDistance = distance;
    }
  });
  return best;
}

function cellAt(whatIf: WhatIf, x: number, y: number): WhatIfCell | null {
  return whatIf.grid?.cells.find((cell) => cell.x_index === x && cell.y_index === y) ?? null;
}

function useBlinkOnce(trigger: unknown): number {
  const [generation, setGeneration] = useState(0);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setGeneration((value) => value + 1);
  }, [trigger]);
  return generation;
}

/** Whether a lane answer carries the A10c card (an older server sends a bare absence). */
export function isWhatIf(value: unknown): value is WhatIf {
  return Boolean(value) && (value as { schema_version?: unknown }).schema_version === "research.freeze-what-if.v1";
}

/**
 * The card. `whatIf` is the server's A10c answer; when a lane publishes none
 * (the P04 fixed hub, or an older server) `inert` carries its typed state and
 * reason, and the card keeps its place with every control disabled (A11).
 */
export function WhatIfCard(props: {
  whatIf: WhatIf | null;
  inert?: { state: string; reason_code: string | null };
  evaluate?: WhatIfEvaluateSlot;
  onEvaluate?: (gridKey: string) => void;
}) {
  if (props.whatIf === null) return <InertWhatIf state={props.inert?.state ?? "NOT_PUBLISHED"} reason={props.inert?.reason_code ?? null} />;
  return (
    <LiveWhatIf
      whatIf={props.whatIf}
      evaluate={props.evaluate ?? { state: "idle" }}
      onEvaluate={props.onEvaluate ?? (() => undefined)}
    />
  );
}

/**
 * A card with no served slider names no parameter: the HiFi's `entry_z` /
 * `atr_mult` belong to another alpha, and a Delta name typed here would be a
 * guess. Two disabled controls keep the card's place (A11); each is labelled by
 * the server's reason alone.
 */
const INERT_SLIDERS = [0, 1] as const;

function InertWhatIf({ state, reason }: { state: string; reason: string | null }) {
  return (
    <section
      className="flex flex-col gap-3 rounded-[10px] border border-dashed px-4 py-3.5"
      data-panel="what-if"
      data-what-if={state}
      data-reason={reason ?? ""}
      style={{ borderColor: "var(--warn)", background: "var(--paper-raised)" }}
    >
      <div className="flex flex-wrap items-baseline gap-2">
        <h3 className="mono text-[10px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }} data-what-if-rule title={WHAT_IF_RULE}>
          what-if sandbox
        </h3>
        <span className="mono text-[10px] italic" style={{ color: "var(--ink-faint)" }}>
          {state.toLowerCase().replace(/_/g, " ")}
        </span>
        {/* E2: the code rides in the title; the sentence below says it once. */}
        {reason ? <span className="sr-only" data-what-if-code title={reason}>{reason}</span> : null}
      </div>
      {/* D12: nothing here can act, so nothing that looks like a control is drawn — the server's reason, once. */}
      <p className="text-[11px] leading-[1.5]" style={{ color: "var(--ink-soft)" }} data-what-if-inert data-what-if-reason>
        {whatIfReason(reason) || "No evaluated neighbourhood is published for this run."}
      </p>
    </section>
  );
}

/** The three answers a 2xx evaluate can carry, in words; the enum itself rides in the title. */
const EVALUATE_OUTCOME_WORDS: Record<"ADMITTED" | "REPLAYED" | "NOTHING_TO_EVALUATE", string> = {
  ADMITTED: "admitted — one diagnostic job started",
  REPLAYED: "replayed — the job already running, not a second one",
  NOTHING_TO_EVALUATE: "nothing to evaluate — every node exists",
};

function LiveWhatIf({
  whatIf,
  evaluate,
  onEvaluate,
}: {
  whatIf: WhatIf;
  evaluate: WhatIfEvaluateSlot;
  onEvaluate: (gridKey: string) => void;
}) {
  const navigate = useNavigate();
  const [x, setX] = useState(4);
  const [y, setY] = useState(4);
  const sliders = whatIf.sliders;
  const available = whatIf.state === "AVAILABLE" && whatIf.grid !== null && sliders.length === 2;
  const cell = available ? cellAt(whatIf, x, y) : null;
  const blink = useBlinkOnce(available ? `${x}:${y}` : null);
  const moved = x !== 4 || y !== 4;
  const evaluateAction = whatIf.actions.evaluate_grid;
  const sibling = whatIf.actions.sibling_draft;
  const job = whatIf.job;
  const coverage = whatIf.coverage;

  const heat = useMemo(() => {
    if (!whatIf.grid) return [];
    const rows: WhatIfCell[][] = [];
    for (let row = 8; row >= 0; row -= 1) {
      rows.push(whatIf.grid.cells.filter((entry) => entry.y_index === row).sort((a, b) => a.x_index - b.x_index));
    }
    return rows;
  }, [whatIf.grid]);

  const preview = cell
    ? cell.state === "EVALUATED" && cell.delta_j !== null
      ? `ΔJ₁ ${shownSignedDecimal(cell.delta_j)}`
      : cell.state === "EVALUATED"
        ? "ΔJ₁ — base objective not evaluated"
        : `ΔJ₁ — ${CELL_WORDS[cell.state]}`
    : null;

  const slider = (index: 0 | 1, value: number, set: (next: number) => void) => {
    const spec = sliders[index]!;
    const node = spec.values[value]!;
    const target = index === 0 ? cellAt(whatIf, value, y) : cellAt(whatIf, x, value);
    const valueText = target && target.state === "EVALUATED" && target.delta_j !== null
      ? `${node} (ΔJ ${shownSignedDecimal(target.delta_j)})`
      : `${node} (${target ? CELL_WORDS[target.state] : "not evaluated"})`;
    /*
     * The track is the labelled range: the thumb sits where the node's value
     * falls between the two end labels. Nodes are not evenly spaced in value
     * where the declared bound clamps them, so an index track would park the
     * thumb mid-track at θ* while the ends read e.g. 1 and 1.6. A drag snaps
     * to the nearest served node (no off-node value exists); the arrow keys
     * walk the nodes. A set the server sent unusable falls back to the node
     * index.
     */
    const nodes = spec.values.map(Number);
    const linear = nodes.length === 9 && nodes.every((n) => Number.isFinite(n)) && nodes[8]! > nodes[0]!;
    const move = (next: number) => set(Math.min(8, Math.max(0, next)));
    return (
      <label className="flex flex-col gap-1" data-slider={spec.parameter}>
        <span className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="mono text-[10.5px]">{spec.parameter}</span>
          <span className="mono text-[10.5px] tabular-nums" data-slider-value={spec.parameter}>
            {spec.clamped[value] ? "≈ " : ""}
            {node}
            {value === 4 ? <span style={{ color: "var(--ink-faint)" }}> · θ*</span> : null}
          </span>
        </span>
        <input
          type="range"
          className="fz-slider"
          min={linear ? nodes[0] : 0}
          max={linear ? nodes[8] : 8}
          step={linear ? "any" : 1}
          value={linear ? nodes[value] : value}
          disabled={!available}
          aria-valuetext={valueText}
          aria-label={`${spec.parameter}, node ${value + 1} of 9`}
          data-slider-track={linear ? "value" : "node"}
          onChange={(event) => {
            const raw = Number(event.target.value);
            move(linear ? nearestNode(nodes, raw, value) : raw);
          }}
          onKeyDown={(event) => {
            if (!linear) return;
            const stepBy: Record<string, number> = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 3, PageDown: -3 };
            if (event.key === "Home") move(0);
            else if (event.key === "End") move(8);
            else if (event.key in stepBy) move(value + stepBy[event.key]!);
            else return;
            event.preventDefault();
          }}
          style={{ accentColor: "var(--warn)", width: "100%" }}
        />
        <span className="mono flex justify-between text-[9px]" style={{ color: "var(--ink-faint)" }}>
          <span>{spec.values[0]}</span>
          <span>
            θ* {spec.base} ± 4 × {spec.step} · declared {spec.minimum}–{spec.maximum}
          </span>
          <span>{spec.values[8]}</span>
        </span>
      </label>
    );
  };

  return (
    <section
      className="flex flex-col gap-3 rounded-[10px] border border-dashed px-4 py-3.5"
      data-panel="what-if"
      data-what-if={whatIf.state}
      data-reason={whatIf.reason_code ?? ""}
      style={{ borderColor: "var(--warn)", background: "var(--paper-raised)" }}
    >
      <div className="flex flex-wrap items-baseline gap-2">
        <h3 className="mono text-[10px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }} data-what-if-rule title={WHAT_IF_RULE}>
          what-if sandbox
        </h3>
        <span
          key={blink}
          data-motion={blink > 0 ? "blink-once" : undefined}
          className="mono rounded-[3px] border px-[5px] text-[8.5px] font-bold"
          style={{ color: "var(--warn)", borderColor: "var(--warn)" }}
          data-preview-badge
        >
          preview only
        </span>
        {coverage ? (
          /* D14: clamped bounds repeat θ* in the 81 grid cells; the server's distinct count is the honest one, the grid count rides in the tooltip. */
          <span
            className="mono ml-auto text-[10px]"
            data-coverage={coverage.label}
            title={`${coverage.label} grid cells evaluated · clamped bounds repeat the same node, so the distinct count is ${coverage.evaluated_unique} of ${coverage.unique_evaluations}`}
          >
            {coverage.evaluated_unique} of {coverage.unique_evaluations} distinct nodes evaluated
          </span>
        ) : null}
      </div>

      {available ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
          <div className="flex min-w-0 flex-col gap-3">
            {slider(0, x, setX)}
            {slider(1, y, setY)}
            <div
              role="status"
              aria-live="polite"
              className="flex flex-wrap items-baseline gap-2 rounded-[6px] border px-3 py-2"
              style={{ borderColor: "var(--line)", background: "var(--paper)" }}
              data-preview={cell?.state ?? "NONE"}
              data-cell={cell?.cell_id ?? ""}
            >
              <span
                className="mono text-[13px] font-semibold tabular-nums"
                data-delta-j={cell?.delta_j ?? ""}
                title={cell?.delta_j != null ? `ΔJ₁ ${signedDecimal(cell.delta_j)} (exact)` : undefined}
              >
                {preview}
              </span>
              {cell?.objective ? (
                <span
                  className="mono text-[10px]"
                  style={{ color: "var(--ink-faint)" }}
                  data-objective={cell.objective}
                  title={`J₁ ${cell.objective} · base ${whatIf.grid?.base_objective ?? "not evaluated"} (exact)`}
                >
                  J₁ {shownDecimal(cell.objective)} · base{" "}
                  {whatIf.grid?.base_objective ? shownDecimal(whatIf.grid.base_objective) : "not evaluated"}
                </span>
              ) : null}
              {cell?.source ? (
                <span className="mono text-[9px]" style={{ color: "var(--ink-faint)" }} data-cell-source={cell.source}>
                  {cell.source === "PARENT_TRIAL" ? "from this run's own trial" : "from a sealed diagnostic grid"}
                </span>
              ) : null}
              {cell?.clamped ? (
                <span className="mono text-[9px]" style={{ color: "var(--ink-faint)" }} data-cell-clamped>
                  ≈ clamped at the declared bound — same evaluation as {cell.canonical_cell_id}
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex flex-col items-start gap-1" data-heatmap>
            <span className="mono text-[9px]" style={{ color: "var(--ink-faint)" }}>
              9 × 9 · {sliders[1]!.parameter} ↑ · {sliders[0]!.parameter} →
            </span>
            <div className="grid grid-cols-9 gap-[2px]" role="img" aria-label={`what-if grid, ${coverage?.label ?? "0 / 81"} cells evaluated`}>
              {heat.flat().map((entry) => (
                <button
                  key={entry.cell_id}
                  type="button"
                  className="h-[14px] w-[14px] rounded-[2px] border"
                  data-heat-cell={entry.cell_id}
                  data-heat-state={entry.state}
                  aria-label={`${entry.cell_id} ${CELL_WORDS[entry.state]}`}
                  title={`${Object.entries(entry.parameters).map(([k, v]) => `${k} ${v}`).join(" · ")} — ${
                    entry.delta_j !== null ? `ΔJ ${shownSignedDecimal(entry.delta_j)}` : CELL_WORDS[entry.state]
                  }`}
                  onClick={() => {
                    setX(entry.x_index);
                    setY(entry.y_index);
                  }}
                  style={{
                    borderColor: entry.cell_id === cell?.cell_id ? "var(--ink)" : entry.is_base ? "var(--accent)" : "var(--line)",
                    /* Sign only (worse / same-or-better than θ*) — never a magnitude scale the server did not publish. */
                    background:
                      entry.state === "EVALUATED"
                        ? entry.is_base
                          ? "var(--accent-soft)"
                          : entry.delta_j !== null && entry.delta_j.startsWith("-")
                            ? "var(--bad-bg)"
                            : "var(--good-bg)"
                        : entry.state === "NOT_DEFINED"
                          ? "var(--paper-sunken)"
                          : entry.state === "QUEUED"
                            ? "repeating-linear-gradient(135deg, var(--line-strong) 0 2px, transparent 2px 4px)"
                            : "transparent",
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2" data-what-if-inert>
          {/* A11: the card keeps its place; controls exist but cannot move, with the server's reason. */}
          {INERT_SLIDERS.map((slot) => {
            /* A served slider keeps its served parameter name; none served, none invented. */
            const name = sliders[slot]?.parameter;
            return (
              <label key={slot} className="flex flex-col gap-1">
                {name ? (
                  <span className="mono text-[10.5px]" style={{ color: "var(--ink-faint)" }}>
                    {name}
                  </span>
                ) : null}
                <input
                  type="range"
                  disabled
                  aria-disabled="true"
                  aria-label={`${name ?? `parameter ${slot + 1}`} — ${whatIfReason(whatIf.reason_code)}`}
                  style={{ width: "100%" }}
                />
              </label>
            );
          })}
          <p className="text-[11px] leading-[1.5]" style={{ color: "var(--ink-soft)" }} data-what-if-reason>
            {whatIfReason(whatIf.reason_code)}
          </p>
        </div>
      )}


      {whatIf.definition ? (
        <p className="mono text-[9px] leading-[1.5]" style={{ color: "var(--ink-faint)" }} data-what-if-definition>
          ΔJ₁ = J at the node − J at θ* ·{" "}
          <span title={whatIf.definition.objective_kind} data-objective-kind={whatIf.definition.objective_kind}>
            {enumWords(whatIf.definition.objective_kind)}
          </span>{" "}
          ·{" "}
          <span title={whatIf.definition.objective_scope} data-objective-scope={whatIf.definition.objective_scope}>
            {enumWords(whatIf.definition.objective_scope)}
          </span>{" "}
          · seed {whatIf.definition.random_seed} ·{" "}
          {whatIf.definition.engine_release_id} · dataset {shortDigest(whatIf.definition.dataset_binding_digest)} · no
          interpolation
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn-ghost mono text-[10px]"
          data-action="evaluate-grid"
          data-evaluate-state={evaluateAction.state}
          disabled={!evaluateAction.may_submit || evaluate.state === "submitting" || !whatIf.grid}
          title={evaluateAction.may_submit ? "admit one bounded diagnostic job for the missing nodes" : whatIfReason(evaluateAction.reason_code)}
          onClick={() => whatIf.grid && onEvaluate(whatIf.grid.grid_key)}
        >
          {evaluate.state === "submitting"
            ? "admitting…"
            : evaluateAction.state === "AVAILABLE"
              ? `evaluate grid · ${evaluateAction.missing_evaluations} missing`
              : "evaluate grid"}
        </button>
        <button
          type="button"
          className="btn-ghost mono text-[10px]"
          data-action="create-sibling"
          disabled={!sibling.may_create || !sibling.href_template || !available || !moved}
          title={
            !sibling.may_create
              ? whatIfReason(sibling.reason_code)
              : !moved
                ? "move a slider first — the frozen θ* itself is not a fork"
                : "open Screen 02 with a copied draft pinned at this node"
          }
          onClick={() => {
            if (!sibling.href_template || !cell) return;
            navigate(sibling.href_template.replace("{cell_id}", cell.cell_id));
          }}
        >
          create sibling attempt →
        </button>
        {!evaluateAction.may_submit && evaluateAction.reason_code ? (
          <span className="text-[10.5px]" style={{ color: evaluateAction.state === "BLOCKED" ? "var(--bad)" : "var(--ink-faint)" }} data-evaluate-reason>
            {whatIfReason(evaluateAction.reason_code)}
          </span>
        ) : null}
      </div>

      {job ? (
        <div className="flex flex-wrap items-baseline gap-2" data-whatif-job={job.state}>
          <span className="mono text-[9px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
            diagnostic job
          </span>
          <ShortId id={job.run_id} label="run" className="text-[10px]" />
          <span className="mono text-[10px]">{job.state.toLowerCase()}</span>
          <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }}>
            {job.evaluations} evaluations · requested {formatUtc(job.requested_at_utc_ms) ?? ""}
            {job.sealed ? " · sealed" : ""}
          </span>
          <Link to={job.progress_href} className="mono text-[10px]" style={{ color: "var(--accent)" }} data-action="open-job-progress">
            progress →
          </Link>
        </div>
      ) : null}
      {evaluate.state === "done" ? (
        <p
          className="mono text-[10px]"
          style={{ color: "var(--ink-soft)" }}
          data-evaluate-outcome={evaluate.result.outcome}
          title={`${evaluate.result.outcome} · grid ${shortDigest(evaluate.result.grid_key) ?? ""}`}
        >
          {EVALUATE_OUTCOME_WORDS[evaluate.result.outcome]}
          {evaluate.result.job ? ` · ${evaluate.result.job.evaluations} evaluations · job ${evaluate.result.job.state.toLowerCase()}` : ""}
        </p>
      ) : null}
      {evaluate.state === "refused" ? (
        <p className="text-[11px]" style={{ color: "var(--bad)" }} data-evaluate-refusal>
          {evaluate.refusal.status === 409 ? (
            <span className="mono block text-[10px]" data-evaluate-conflict title={evaluate.refusal.code ?? undefined}>
              the grid changed since you read it — re-read, then evaluate again
            </span>
          ) : null}
          <RefusalNote refusal={evaluate.refusal} />
        </p>
      ) : null}
    </section>
  );
}
