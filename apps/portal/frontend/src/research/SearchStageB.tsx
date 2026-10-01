/**
 * E5 · Screen 06 Stage B on a retained WFO run (HiFi audit 6.7, 6.8, 6.9,
 * 6.10, 6.11): the pool funnel with its K callout, the typeset formula, the
 * per-fold decay of θ* and the pool on the S_IS × S̄_OOS plane, and the
 * best ≠ selected cards with S_IS, S̄_OOS, d̄ decay and max_dd.
 *
 * Every number is the server's (`search.pool`, `candidates[]`,
 * `selection.roles`). The browser adds nothing up: K and the rule's inputs are
 * printed as served, bar lengths and plot positions are geometry only, and a
 * value the read does not carry is printed as its own absence — never 0.
 *
 * Geometry is measured from `QuantBT 06 S2 Search and Selection.dc.html`:
 * B1 rows mono 10.5 / gap 8 / label 158 px Inter / bar 9 px at ≤ 42 % /
 * count 40 px right / note 9 px; the callout mono 10.5 lh 1.6 on accent-2
 * soft, 5/10 padding; B2 sub-panels gap 14, captions 9.5, decay rows mono 9.5
 * (fold 52 px, track 10 px with a centre rule, value 44 px), plot 118 px;
 * B3 cards 10/12 padding, gap 4, mono 10.5 rows.
 */

import type { ReactNode } from "react";

import { Formula } from "./Formula";
import { foldLabel, groupDecimalString } from "./researchFormat";
import { reasonCodeSentence } from "./researchRefusal";
import type { CurrentSourceSearch } from "./searchClient";

type Pool = NonNullable<CurrentSourceSearch["pool"]>;
type PoolCount = Pool["trials_evaluated"];
type Candidate = CurrentSourceSearch["candidates"]["rows"][number];
type Role = CurrentSourceSearch["selection"]["roles"]["raw_best_is"];
type Metric = Candidate["facts"]["metrics"]["mean_is_sharpe"];

const LABEL = "[font-family:var(--font-body)] text-[10px] font-medium uppercase tracking-[.07em]";
const FAINT = { color: "var(--ink-faint)" } as const;

/** Reason codes this block explains in words; the code stays in the title. */
export const STAGE_B_REASON_WORDS: Record<string, string> = {
  QUANTBT_WALK_FORWARD_STUDY_DECLARES_NO_CONSTRAINTS: "no constraints declared",
  QUANTBT_CANDIDATE_LEDGER_DOES_NOT_ISOLATE_THE_TOP_IS_POOL: "the candidate ledger is not exactly the top-IS pool",
  QUANTBT_DID_NOT_PUBLISH_THE_TOP_IS_POOL_RULE: "QuantBT did not publish the pool rule",
  RETAINED_POOL_SIZE_DISAGREES_WITH_THE_QUANTBT_POOL_RULE: "the retained pool and QuantBT's rule disagree",
  RS02_SEAL_PREDATES_W3_SOURCE_FACTS_V1: "this seal predates the source facts",
  RS02_RETAINED_ROW_PREDATES_W3_FACT_BLOCK_V1: "these rows predate the source facts",
  QUANTBT_DID_NOT_PUBLISH_A_SELECTION: "no selection was published",
  QUANTBT_DID_NOT_RETAIN_SELECTED_TRIAL_FOLD_METRICS: "QuantBT did not retain θ*'s fold metrics",
  QUANTBT_CANDIDATE_LEDGER_DOES_NOT_PUBLISH_DRAWDOWN: "QuantBT's candidate ledger publishes no drawdown",
  STITCHED_OOS_PATH_IS_NOT_ONE_CANDIDATE_UNDER_THIS_SCHEDULE: "the stitched OOS path mixes θ*s under this schedule",
  UI_SERVER_PREDATES_E5_POOL: "this server does not publish the pool yet",
};

/** The UI's own code for a server that answers without the E5 blocks. */
export const SERVER_PREDATES_POOL = "UI_SERVER_PREDATES_E5_POOL";

function reasonWords(code: string | null | undefined): string {
  if (!code) return "not published";
  return STAGE_B_REASON_WORDS[code] ?? reasonCodeSentence(code) ?? code;
}

/** A Sharpe-like ratio to two places with the screen's minus; the exact string rides in the title. */
export function ratio2(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(parsed).replace(/^-/, "−");
}

/** A signed decay (`+0.38`, `−7.44`): the sign is the reading, so it is always printed. */
export function signed2(value: string | null | undefined): string | null {
  const shown = ratio2(value);
  if (shown === null) return null;
  return shown.startsWith("−") || Number(value) === 0 ? shown : `+${shown}`;
}

/** A drawdown fraction as a percent (`−0.67%`): a unit change for display, nothing computed. */
export function drawdownPercent(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return `${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(parsed * 100)}%`.replace(/^-/, "−");
}

function Absent({ code, words, ...rest }: { code: string | null | undefined; words?: string } & Record<string, unknown>) {
  return (
    <span className="italic" style={FAINT} title={code ?? undefined} data-absent={code ?? ""} {...rest}>
      {words ?? "not published"}
    </span>
  );
}

/* ------------------------------------------------------------ B1 · the pool */

/** The count cell: the value, or the state's own word — `n/a` for a question that does not arise. */
function CountCell({ count }: { count: PoolCount }) {
  if (count.state === "AVAILABLE" && count.value !== null) {
    return <span title={count.source ?? undefined}>{groupDecimalString(String(count.value))}</span>;
  }
  return <Absent code={count.reason_code} words={count.state === "NOT_APPLICABLE" ? "n/a" : "not published"} />;
}

function FunnelRow({ label, count, of, note, id }: { label: string; count: PoolCount; of: number | null; note: ReactNode; id: string }) {
  const value = count.state === "AVAILABLE" ? count.value : null;
  /* Bar length is geometry only: the row's count against trials evaluated, at most 42 % (HiFi). */
  const width = value !== null && of !== null && of > 0 ? `max(2px, ${((value / of) * 42).toFixed(2)}%)` : null;
  return (
    <span className="mono flex min-w-0 items-center gap-2 text-[10.5px]" data-pool-row={id} data-pool-state={count.state}>
      <span className="w-[158px] flex-none text-[10.5px] [font-family:var(--font-body)]" style={{ color: "var(--ink-soft)" }}>
        {label}
      </span>
      {width !== null ? (
        <span
          className="h-[9px] flex-none border"
          style={{ width, background: "var(--accent-2-soft)", borderColor: "var(--accent-2)" }}
          aria-hidden="true"
          data-pool-bar={id}
        />
      ) : null}
      <span className="min-w-[40px] flex-none text-right" data-pool-count={id}>
        <CountCell count={count} />
      </span>
      <span className="min-w-0 flex-1 pl-1.5 text-[9px] leading-[1.35]" style={FAINT}>
        {note}
      </span>
    </span>
  );
}

/** `⌈3 × 0.1⌉ = 1` or `top_is_k = 1`, from the served rule — the browser evaluates nothing. */
export function kExpression(rule: Pool["rule"]): string | null {
  if (rule.state !== "AVAILABLE" || rule.k === null) return null;
  if (rule.expression === "CONFIGURED_TOP_IS_K" && rule.configured_top_is_k !== null) {
    return `K = top_is_k = ${rule.k}`;
  }
  if (rule.expression === "CEIL_N_TIMES_TOP_IS_FRACTION" && rule.n !== null && rule.top_is_fraction !== null) {
    return `K = ⌈${rule.n} × ${rule.top_is_fraction}⌉ = ${rule.k}`;
  }
  return null;
}

/** HiFi freeze-line label: `POOL FROZEN · K = ⌈3 × 0.1⌉ = 1`, or what is missing. */
export function freezeLineLabel(pool: Pool | undefined): { text: string; title: string } | null {
  if (!pool) return null;
  const expression = kExpression(pool.rule);
  if (expression) return { text: `POOL FROZEN · ${expression}`, title: `top-IS pool of ${pool.top_is_k.value} from the retained candidate ledger` };
  return { text: "POOL FROZEN · K NOT PUBLISHED", title: `${reasonWords(pool.top_is_k.reason_code)} (${pool.top_is_k.reason_code ?? "no reason"})` };
}

export function PoolFunnel({ search }: { search: CurrentSourceSearch }) {
  const pool = search.pool;
  const contract = search.search_contract;
  if (!pool) return null;
  const of = pool.trials_evaluated.state === "AVAILABLE" ? pool.trials_evaluated.value : null;
  const expression = kExpression(pool.rule);
  const optunaBlind = search.ledger.trials.every((trial) => trial.facts?.oos_seen_by_optuna === false);
  const scope =
    pool.reevaluation_scope === "ALL_OUTER_FOLDS" ? "every outer fold" : pool.reevaluation_scope === "FOLD" ? "one fold" : "scope not published";
  return (
    <div className="flex flex-col gap-[5px]" data-retained-pool data-pool-schema={pool.schema_version}>
      <FunnelRow
        id="trials"
        label="trials evaluated"
        count={pool.trials_evaluated}
        of={of}
        note={
          pool.scored_unpruned.state === "AVAILABLE" ? (
            <>
              {pool.scored_unpruned.value} scored, not pruned
            </>
          ) : (
            <Absent code={pool.scored_unpruned.reason_code} words={`scored count ${reasonWords(pool.scored_unpruned.reason_code)}`} />
          )
        }
      />
      <FunnelRow
        id="feasible"
        label="feasible (constraint ≤ 0)"
        count={pool.feasible}
        of={of}
        note={<span title={pool.feasible.reason_code ?? undefined}>{pool.feasible.state === "NOT_APPLICABLE" ? `n/a — ${reasonWords(pool.feasible.reason_code)}` : reasonWords(pool.feasible.reason_code)}</span>}
      />
      <FunnelRow
        id="top-is"
        label="top-IS pool → FROZEN"
        count={pool.top_is_k}
        of={of}
        note={expression ?? <span title={pool.top_is_k.reason_code ?? undefined}>K {reasonWords(pool.top_is_k.reason_code)}</span>}
      />
      <FunnelRow
        id="reevaluated"
        label="candidates re-evaluated"
        count={pool.reevaluated}
        of={of}
        note={
          <>
            {scope}
            {contract.oos_used_for_selection === true ? " · OOS ranks" : ""}
          </>
        }
      />
      <FunnelRow id="selected" label="selected by policy" count={pool.selected} of={of} note={contract.candidate_selection_metric ?? "selector not published"} />
      {expression ? (
        <span
          className="mono mt-1 border px-[10px] py-[5px] text-[10.5px] leading-[1.6]"
          /* HiFi amber on pale amber measures 4.01:1 — below AA. Same call as VD-P20-30: the tint moves to the border, the text sits on white. */
          style={{ color: "var(--accent-2)", borderColor: "var(--accent-2)", background: "var(--paper-raised)" }}
          data-k-callout={pool.rule.expression}
          title={`QuantBT _candidate_count · K = ⌈n_trials × top_is_fraction⌉ · n = completed, unpruned IS trials · rule ${pool.rule.expression}${optunaBlind ? " · the pool closes before any OOS value is computed" : ""}`}
        >
          {expression}
          {optunaBlind ? " · pool closes before OOS" : ""}
        </span>
      ) : (
        <span className="mono mt-1 border border-dashed px-[10px] py-[5px] text-[10px] leading-[1.6]" style={{ ...FAINT, borderColor: "var(--line)" }} data-k-callout="absent" title={pool.rule.reason_code ?? undefined}>
          K not shown — {reasonWords(pool.rule.reason_code)}
        </span>
      )}
    </div>
  );
}

/* ------------------------------------------------------- B2 · the formula */

/** The objective as QuantBT's served terms read it: `mean_oos_sharpe - 0.5 * std_decay - …` (signs and weights as served). */
export function formulaFromTerms(terms: readonly { term: string; weight: string }[]): string | null {
  if (terms.length === 0) return null;
  return terms
    .map((term, index) => {
      const negative = term.weight.startsWith("-");
      const magnitude = negative ? term.weight.slice(1) : term.weight;
      const body = magnitude === "1" ? term.term : `${magnitude} * ${term.term}`;
      if (index === 0) return negative ? `-${body}` : body;
      return `${negative ? "-" : "+"} ${body}`;
    })
    .join(" ");
}

export function TypesetFormula({ search, selected }: { search: CurrentSourceSearch; selected: Candidate | undefined }) {
  const components = selected?.facts.objective_components;
  const text = components && components.state === "AVAILABLE" ? formulaFromTerms(components.terms) : null;
  if (text === null) return null;
  return (
    <span className="flex min-w-0 flex-wrap items-baseline gap-2 overflow-x-auto border-l-2 py-0.5 pl-2.5" style={{ borderColor: "var(--accent)" }} data-formula-typeset={components?.formula}>
      <span className="mono text-[11px]">J =</span>
      <Formula formula={text} />
      <span className="mono text-[9.5px]" style={FAINT}>
        λ {search.diagnostics.probe.decay_lambda ?? "not published"} · γ {search.diagnostics.probe.decay_gamma ?? "not published"}
      </span>
    </span>
  );
}

/** Per-fold decay of θ*: the engine's own d = S_IS − S_OOS per fold, bars scaled to the largest |d| (geometry only). */
export function FoldDecayBars({ pool }: { pool: Pool | undefined }) {
  const decay = pool?.per_fold_decay;
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-[3px]" data-fold-decay={decay?.state ?? "NOT_PUBLISHED"}>
      <span className="text-[9.5px]" style={FAINT}>
        per-fold decay of θ*
      </span>
      {decay && decay.state === "AVAILABLE" ? (
        (() => {
          const magnitudes = decay.rows.map((row) => Math.abs(Number(row.decay))).filter(Number.isFinite);
          const most = Math.max(...magnitudes, 0);
          return decay.rows.map((row) => {
            const value = Number(row.decay);
            const known = row.decay !== null && Number.isFinite(value);
            const share = known && most > 0 ? (Math.abs(value) / most) * 48 : 0;
            const tone = known && value < 0 ? "var(--good)" : "var(--accent-2)";
            return (
              <span key={row.fold_id} className="mono flex items-center gap-1.5 text-[9.5px]" data-fold-decay-row={row.fold_id}>
                <span className="w-[52px] flex-none" style={{ color: "var(--ink-soft)" }}>
                  {foldLabel(row.fold_id)}
                </span>
                <span
                  className="relative h-[10px] min-w-0 flex-1"
                  style={{ background: "var(--paper-sunken)" }}
                  role="img"
                  aria-label={`${foldLabel(row.fold_id)} decay ${row.decay ?? "not published"}: IS ${row.is_sharpe ?? "not published"}, OOS ${row.oos_sharpe ?? "not published"}`}
                >
                  <span className="absolute bottom-0 left-1/2 top-0 w-px" style={{ background: "var(--line)" }} />
                  {known && share > 0 ? (
                    <span
                      className="absolute bottom-[1px] top-[1px]"
                      style={{ ...(value >= 0 ? { left: "50%" } : { right: "50%" }), width: `${share.toFixed(2)}%`, background: tone, opacity: 0.75 }}
                      data-decay-sign={value >= 0 ? "positive" : "negative"}
                    />
                  ) : null}
                </span>
                <span className="w-[44px] flex-none text-right" style={{ color: known && value < 0 ? "var(--good)" : "var(--ink)" }} title={row.decay ?? undefined}>
                  {signed2(row.decay) ?? <Absent code={null} />}
                </span>
              </span>
            );
          });
        })()
      ) : (
        <span className="mono text-[10px] italic" style={FAINT} title={decay?.reason_code ?? SERVER_PREDATES_POOL} data-gap-reason="fold-decay">
          {reasonWords(decay?.reason_code ?? SERVER_PREDATES_POOL)}
        </span>
      )}
      {decay && decay.state === "AVAILABLE" ? (
        <span className="text-[9px]" style={FAINT}>
          QuantBT's d = S_IS − S_OOS per fold, for θ*
        </span>
      ) : null}
    </div>
  );
}

/** One pool member on the plane, when both of its means are published. */
function planePoint(candidate: Candidate): { is: number; oos: number } | null {
  const is = Number(candidate.facts.metrics.mean_is_sharpe.value);
  const oos = Number(candidate.facts.metrics.mean_oos_sharpe.value);
  if (candidate.facts.metrics.mean_is_sharpe.value === null || candidate.facts.metrics.mean_oos_sharpe.value === null) return null;
  return Number.isFinite(is) && Number.isFinite(oos) ? { is, oos } : null;
}

/**
 * The pool on the S_IS × S̄_OOS plane. Both axes share one domain (the served
 * values' range, padded), so the corner-to-corner diagonal is S_IS = S̄_OOS —
 * zero decay. Below it the pool member decayed (IS > OOS).
 */
export function PoolPlane({ search, selected }: { search: CurrentSourceSearch; selected: Candidate | undefined }) {
  const points = search.candidates.rows.map((candidate) => ({ candidate, point: planePoint(candidate) }));
  const placed = points.filter((entry): entry is { candidate: Candidate; point: { is: number; oos: number } } => entry.point !== null);
  const values = placed.flatMap(({ point }) => [point.is, point.oos]);
  const low = values.length ? Math.min(...values) : 0;
  const high = values.length ? Math.max(...values) : 1;
  /* Padded so a point never sits on the frame (geometry only). */
  const pad = Math.max((high - low) * 0.18, Math.abs(high) * 0.08, 0.05);
  const [from, to] = [low - pad, high + pad];
  const at = (value: number) => ((value - from) / (to - from)) * 100;
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-[3px]" data-pool-plane={placed.length}>
      <span className="text-[9.5px]" style={FAINT}>
        pool on the S_IS × S̄_OOS plane · diagonal = zero decay
      </span>
      <div
        className="relative h-[118px] overflow-hidden border"
        style={{ borderColor: "var(--line)", background: "var(--paper)" }}
        role="img"
        aria-label={`${placed.length} of ${search.candidates.rows.length} pool members placed by mean IS and mean OOS Sharpe`}
      >
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <line x1="0" y1="100" x2="100" y2="0" stroke="var(--line)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        </svg>
        {placed.map(({ candidate, point }) => {
          const theta = candidate === selected;
          const size = theta ? 9 : 5;
          return (
            <span
              key={candidate.candidate_id}
              className="absolute rounded-full"
              style={{
                left: `calc(${at(point.is).toFixed(2)}% - ${size / 2}px)`,
                top: `calc(${(100 - at(point.oos)).toFixed(2)}% - ${size / 2}px)`,
                width: size,
                height: size,
                background: theta ? "var(--accent-2-soft)" : "var(--accent)",
                opacity: theta ? 1 : 0.45,
                border: theta ? "2px solid var(--accent-2)" : 0,
              }}
              title={`candidate ${candidate.candidate_id} · IS ${candidate.facts.metrics.mean_is_sharpe.value} · OOS ${candidate.facts.metrics.mean_oos_sharpe.value}${theta ? " · θ*" : ""}`}
              data-plane-point={candidate.candidate_id}
              data-plane-theta={theta || undefined}
            />
          );
        })}
      </div>
      <span className="text-[9px]" style={FAINT}>
        x S_IS · y S̄_OOS · below the diagonal = positive decay (IS &gt; OOS)
        {placed.length < search.candidates.rows.length ? ` · ${search.candidates.rows.length - placed.length} without both means, not placed` : ""}
      </span>
    </div>
  );
}

/* ------------------------------------------------- B3 · best ≠ selected */

/** The pool member that re-scored `trialId` — where its OOS numbers live. */
function candidateOf(search: CurrentSourceSearch, trialId: string | null, objective?: string | null): Candidate | undefined {
  if (trialId === null) return undefined;
  const rows = search.candidates.rows.filter((row) => row.facts.source_trial_id === trialId);
  return (objective !== undefined ? rows.find((row) => row.objective === objective) : undefined) ?? rows[0];
}

export function selectedCandidate(search: CurrentSourceSearch): Candidate | undefined {
  return search.candidates.rows.find((row) => row.facts.source_trial_id === search.selection.selected_trial_id && row.objective === search.selection.objective);
}

function MetricValue({ metric, signed = false }: { metric: Metric | undefined; signed?: boolean }) {
  const shown = metric ? (signed ? signed2(metric.value) : ratio2(metric.value)) : null;
  if (shown !== null) return <span title={metric?.value ?? undefined}>{shown}</span>;
  if (metric?.reason_code === "QUANTBT_IS_SEARCH_STAGE_DOES_NOT_EVALUATE_OOS") return <Absent code={metric.reason_code} words="not evaluated · IS stage" />;
  return <Absent code={metric?.reason_code ?? null} />;
}

function DrawdownValue({ candidate }: { candidate: Candidate | undefined }) {
  const fact = candidate?.max_drawdown;
  if (!candidate) return <Absent code="QUANTBT_CANDIDATE_LEDGER_DOES_NOT_PUBLISH_DRAWDOWN" words="not in the pool ledger" />;
  if (!fact) return <Absent code={SERVER_PREDATES_POOL} words="not published" />;
  const shown = fact.state === "AVAILABLE" ? drawdownPercent(fact.value) : null;
  if (shown === null) return <Absent code={fact.reason_code} words="not published" />;
  return (
    <span title={`${fact.value} · ${fact.source === "RETAINED_STITCHED_OOS_PATH" ? "the stitched OOS path of these parameters" : fact.source ?? ""}`} data-max-dd-source={fact.source ?? undefined}>
      {shown}
    </span>
  );
}

function RoleCard({ search, role, kind }: { search: CurrentSourceSearch; role: Role; kind: "raw-best" | "selected" }) {
  const selected = kind === "selected";
  const tone = selected ? "var(--accent-2)" : "var(--bad)";
  const candidate = selected ? selectedCandidate(search) ?? candidateOf(search, role.trial_id) : candidateOf(search, role.trial_id);
  const trial = search.ledger.trials.find((row) => row.trial_id === role.trial_id);
  const isMetric = candidate?.facts.metrics.mean_is_sharpe ?? trial?.facts.metrics.mean_is_sharpe;
  const rows: [string, ReactNode][] = [
    ["S_IS", <MetricValue key="is" metric={isMetric} />],
    ["S̄_OOS", <MetricValue key="oos" metric={candidate?.facts.metrics.mean_oos_sharpe ?? trial?.facts.metrics.mean_oos_sharpe} />],
    ["d̄ decay", <MetricValue key="decay" metric={candidate?.facts.metrics.mean_decay ?? trial?.facts.metrics.mean_decay} signed />],
    ["max_dd", <DrawdownValue key="dd" candidate={candidate} />],
  ];
  return (
    <div
      className="flex min-w-[180px] flex-1 flex-col gap-1 rounded-[6px] border px-3 py-2.5"
      style={{ borderColor: selected ? "var(--accent-2)" : "var(--line)", background: selected ? "var(--paper)" : "transparent" }}
      data-role-card={kind}
      data-role-state={role.state}
    >
      <span className="flex items-baseline justify-between gap-2">
        <span className="mono text-[11px]" style={{ color: tone }}>
          {selected ? "selected" : "best_trial"} {role.trial_id ?? "—"}
        </span>
        {selected ? (
          <span className="mono border px-[5px] text-[8.5px] font-bold tracking-[.08em]" style={{ color: tone, borderColor: tone }}>
            SELECTED BY POLICY
          </span>
        ) : (
          <span className="text-[9px]" style={FAINT}>
            rank 1 by IS
          </span>
        )}
      </span>
      {role.state === "AVAILABLE" ? (
        rows.map(([key, value]) => (
          <span key={key} className="mono flex justify-between gap-2.5 text-[10.5px]" data-role-row={key}>
            <span className="flex-none" style={FAINT}>
              {key}
            </span>
            <span className="flex-1 text-right">{value}</span>
          </span>
        ))
      ) : (
        <Absent code={role.reason_code} words={role.state === "NOT_APPLICABLE" ? "n/a" : "not published"} />
      )}
    </div>
  );
}

export function BestVsSelectedCards({ search }: { search: CurrentSourceSearch }) {
  const roles = search.selection.roles;
  return (
    <div className="flex flex-wrap gap-2.5" data-role-cards>
      <RoleCard search={search} role={roles.raw_best_is} kind="raw-best" />
      <RoleCard search={search} role={roles.selected} kind="selected" />
    </div>
  );
}

export { LABEL as STAGE_B_LABEL };
