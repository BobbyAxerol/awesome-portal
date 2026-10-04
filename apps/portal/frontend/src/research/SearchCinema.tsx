/**
 * Screen 06 · the search cinema, as a selection story (decision 2026-10-04).
 *
 * Five beats narrate what the SERVED artifacts prove, in order. Nothing here
 * claims anything about the sampler's internals: it replays the retained
 * trials in `source_ordinal` order, the pool the server froze, the candidate
 * metrics it published, the identity of the IS best against θ*, and the hand-off
 * to Stage 3. A value the server did not publish is a typed absence in its
 * place, never a blank, 0 or dash. The browser computes nothing derived: sorting
 * by a served value, identity of two ids and the geometry of a served
 * percentage are all it does.
 *
 * Motion: autoplay only while `smokeMotionAllowed()`; otherwise the beats are
 * static and the play button steps. The pause control is always present while
 * playing (WCAG 2.2.2). The scatter is one chart-contract region (one tab stop):
 * arrows = ±1 trial, Shift = ±10, Home/End, Esc; the live node says what the
 * point's title says.
 */

import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { ResearchScopedLink as Link } from "./ResearchScopedLink";

import { smokeMotionAllowed } from "../execution/smokeMotion";
import { useChartContract } from "./chartContract";
import type { EvidenceCursor } from "./evidenceCursor";
import { humanise } from "./humanise";
import { runScreenHref } from "./runScreenHref";
import { cleanParameters } from "./searchParamText";
import type { AtlasSlot } from "./SearchFoldStrip";
import { AxisPill, RAMP, defaultAxes, pointParameters, pointTitle, two, type Surface } from "./SearchSurface";
import { FrozenAt, freezeLineLabel, selectedCandidate } from "./SearchStageB";
import type { CurrentSourceSearch } from "./searchClient";
import { Digest } from "./SplitDetail";
import { useSelectedCinemaTrial, type CinemaStudy } from "./useSelectedCinemaTrial";
import { SamplerEvidenceRead } from "./SamplerEvidenceRead";

type Point = Surface["points"][number];
type Candidate = CurrentSourceSearch["candidates"]["rows"][number];
type Metric = Candidate["facts"]["metrics"]["mean_is_sharpe"];

export const BEATS = [
  { n: 1, word: "run", what: "The retained trials, in the order the source recorded them. Colour = IS objective quintile; hollow = pruned or unscored; the ring follows the served best so far." },
  { n: 2, word: "pool", what: "The top-IS trials the server froze as the candidate pool. The rule and K are the served ones." },
  { n: 3, word: "re-score", what: "The pool's candidates, ordered by the served objective J. Values only: the screen classifies nothing." },
  { n: 4, word: "duel", what: "The raw IS best against the selected θ*: an identity comparison of two served trial ids." },
  { n: 5, word: "seal", what: "θ* and its parameters digest, handed to Stage 3 · Freeze." },
] as const;

const FAINT: CSSProperties = { color: "var(--ink-faint)" };
const SOFT: CSSProperties = { color: "var(--ink-soft)" };
const BEAT_MS = 1500;
const FRAMES = 28;

const CSS = `
.sc-card{display:flex;flex-direction:column;gap:10px;min-width:0;border:1px solid var(--line);border-radius:8px;background:var(--paper-raised);padding:14px}
.sc-head{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px}
.sc-body{display:flex;flex-wrap:wrap;gap:16px;min-width:0}
.sc-left{flex:1.6 1 340px;min-width:0;max-width:100%;display:flex;flex-direction:column;gap:8px}
.sc-right{flex:1 1 260px;min-width:0;max-width:100%;display:flex;flex-direction:column;gap:8px}
.sc-axes{display:flex;flex-wrap:wrap;align-items:center;gap:4px}
.sc-plot{position:relative;height:300px;border:1px solid var(--line);background:var(--paper-sunken);overflow:hidden;cursor:crosshair}
.sc-dot{position:absolute;border-radius:50%;pointer-events:none}
.sc-ring{position:absolute;width:18px;height:18px;margin:-9px 0 0 -9px;border:1.5px dashed var(--accent);border-radius:50%;pointer-events:none;z-index:4}
.sc-stamp{position:absolute;bottom:18px;left:8px;z-index:5;border:1.5px dashed var(--accent-2);padding:2px 8px;font-size:9.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--accent-2);background:var(--paper-raised);transform:rotate(-3deg);pointer-events:none;max-width:70%}
.sc-drop{position:absolute;width:0;border-left:2px dashed var(--accent-2);opacity:.8;pointer-events:none}
.sc-axis{position:absolute;font-size:9px;color:var(--ink-faint);pointer-events:none}
.sc-track{position:relative;height:14px;cursor:pointer;touch-action:pan-y}
.sc-track::before{content:"";position:absolute;left:0;right:0;top:6px;height:2px;background:var(--line)}
.sc-fill{position:absolute;left:0;top:6px;height:2px;background:var(--accent)}
.sc-thumb{position:absolute;top:2px;width:10px;height:10px;margin-left:-5px;border-radius:50%;background:var(--accent)}
.sc-steps{display:flex;flex-direction:column;gap:2px;list-style:none;margin:0;padding:0}
.sc-step{display:flex;gap:9px;align-items:baseline;width:100%;text-align:left;border:0;border-left:2px solid var(--line);border-radius:3px;background:transparent;padding:5px 9px;min-height:24px}
.sc-step[aria-current="step"]{background:var(--accent-soft);border-left-color:var(--accent)}
.sc-step .n{font-size:11px;font-weight:700;color:var(--ink-faint)}
.sc-step .t{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--ink-soft)}
.sc-step[aria-current="step"] .n,.sc-step[aria-current="step"] .t{color:var(--ink)}
.sc-beat{display:flex;flex-direction:column;gap:6px;min-width:0;font-size:10.5px}
.sc-rank{max-height:230px;overflow:auto;border:1px solid var(--line-soft)}
.sc-row{display:grid;grid-template-columns:44px minmax(30px,1fr) repeat(var(--cols,3),minmax(34px,auto));gap:6px;align-items:center;padding:1px 6px;font-size:9.5px}
.sc-row.head{position:sticky;top:0;background:var(--paper-sunken);color:var(--ink-faint);z-index:1}
.sc-row .num{text-align:right}
.sc-bar{display:block;height:7px;background:var(--accent-2-soft);border:1px solid var(--accent-2);min-width:2px}
.sc-duel{display:flex;flex-wrap:wrap;gap:8px}
.sc-side{flex:1 1 120px;min-width:0;border:1px solid var(--line);border-radius:6px;padding:6px 8px;display:flex;flex-direction:column;gap:2px}
.sc-side dl{margin:0;display:grid;grid-template-columns:auto 1fr;gap:1px 8px}
.sc-side dd{margin:0;text-align:right}
.sc-slot{border:1px solid var(--accent-2);border-radius:6px;background:var(--accent-2-soft);padding:6px 10px;display:flex;flex-direction:column;gap:3px}
[data-motion="on"] .sc-dot{transition:opacity .4s,width .4s,height .4s}
`;

function Absent({ code, words = "not published", ...rest }: { code: string | null | undefined; words?: string } & Record<string, unknown>) {
  return (
    <span className="italic" style={FAINT} title={code ?? undefined} data-absent={code ?? ""} {...rest}>
      {words}
    </span>
  );
}

function MetricCell({ metric }: { metric: Metric | undefined }) {
  const shown = two(metric?.value);
  return shown !== null ? <span title={metric?.value ?? undefined}>{shown}</span> : <Absent code={metric?.reason_code ?? null} words="absent" />;
}

const candidateOf = (rows: readonly Candidate[], trialId: string | null | undefined): Candidate | undefined =>
  trialId == null ? undefined : rows.find((row) => row.facts.source_trial_id === trialId);

export interface SearchCinemaProps {
  runId: string;
  cursor: EvidenceCursor;
  search: CurrentSourceSearch;
  /** The surface drawn: the run's, or the cursor's study on a causal run. */
  surface: Surface;
  /** A causal run's study the points belong to (named in the label). */
  studyLabel?: string;
  /** Exact source study/fold identities, never inferred from its display label. */
  study?: CinemaStudy;
  workspaceId?: string;
  /** Ledger parameter text for a point that carries none. */
  parametersOf: (trialId: string) => Record<string, string> | undefined;
  /** The params digest the ledger served for a trial (only a loaded page has it). */
  digestOf: (trialId: string) => string | null;
  atlas?: AtlasSlot;
}

/** The release-default sampler name, only if the Atlas read is already in hand. */
function samplerFromAtlas(atlas: AtlasSlot | undefined): string | null {
  if (!atlas || atlas.state !== "ready") return null;
  const group = atlas.doc.current_release.optimizer_defaults?.groups.find((g) => g.group_id === "sampler");
  const field = group?.fields.find((f) => f.field_id === "name");
  if (!field || field.value_source !== "RELEASE_DEFAULT") return null;
  return `${String(field.default_value)} · release default, ${field.override_state.toLowerCase()}`;
}

export function SearchCinema({ runId, cursor, search, surface, studyLabel, study, workspaceId, parametersOf, digestOf, atlas }: SearchCinemaProps) {
  const pts = useMemo(() => [...surface.points].sort((a, b) => a.source_ordinal - b.source_ordinal), [surface.points]);
  const N = pts.length;
  const [axes, setAxes] = useState(() => defaultAxes(surface.axes));
  const [beat, setBeat] = useState(1);
  const [i, setI] = useState(Math.max(0, N - 1));
  const [playing, setPlaying] = useState(false);
  const [motion] = useState(() => smokeMotionAllowed());
  const plotRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);

  const selectedId = surface.selected_trial_id;
  const knownDigest = selectedId ? digestOf(selectedId) : null;
  const selectedTrial = useSelectedCinemaTrial(runId, search, selectedId, workspaceId, study, knownDigest === null);
  const selectedDigest = knownDigest ?? (selectedTrial.state === "ready" ? selectedTrial.trial.params_digest ?? null : null);
  const bestId = surface.best_is_trial_id;
  const pool = search.pool;
  /* A causal run's candidate rows belong to the outer folds, not to the study drawn: only rows of the drawn trials count. */
  const rows = useMemo(() => {
    if (!studyLabel) return search.candidates.rows;
    const ids = new Set(surface.points.map((p) => p.trial_id));
    return search.candidates.rows.filter((r) => r.facts.source_trial_id !== null && ids.has(r.facts.source_trial_id));
  }, [studyLabel, search.candidates.rows, surface.points]);
  const poolServed = !studyLabel && pool?.rule.state === "AVAILABLE" && pool.rule.k !== null;
  const poolIds = useMemo(() => new Set(poolServed ? search.selection.roles.candidate_source_trial_ids ?? [] : []), [poolServed, search.selection.roles.candidate_source_trial_ids]);

  const pos = (point: Point) => {
    const px = point.positions[axes.x];
    const py = point.positions[axes.y];
    return px == null || py == null ? null : { left: px * 0.96 + 2, top: 98 - py * 0.96 };
  };
  const shownTo = beat === 1 ? i : N - 1;

  const titleOf = (point: Point): string => {
    const params = pointParameters(point, parametersOf);
    const role = `${point.trial_id === selectedId ? " · θ* (selected)" : ""}${point.trial_id === bestId ? " · best IS" : ""}`;
    return `${pointTitle(point, axes.x, axes.y, params.parameters)} · best so far ${two(point.best_so_far) ?? "not published"}${role}`;
  };

  const c = useChartContract({
    label: "search cinema, trials in order",
    noun: "trial",
    count: N,
    describe: (k) => titleOf(pts[k]!),
    summary: `${N} retained trials in source order, ${axes.x} by ${axes.y}. Arrow keys step one trial, Shift ten, Home and End jump, Escape returns to the last trial.`,
    controlledIndex: i,
    onIndex: (k) => {
      setPlaying(false);
      setI(k === null ? Math.max(0, N - 1) : k);
    },
    locate: (cx, cy, rect) => {
      let hit: { k: number; d: number } | null = null;
      for (let k = 0; k <= shownTo; k += 1) {
        const at = pos(pts[k]!);
        if (!at) continue;
        const d = Math.hypot((at.left / 100) * rect.width - (cx - rect.left), (at.top / 100) * rect.height - (cy - rect.top));
        if (hit === null || d < hit.d) hit = { k, d };
      }
      /* the plot owns a persistent trial cursor: a press anywhere moves it to the nearest drawn trial */
      return hit !== null ? hit.k : null;
    },
  });

  /* Autoplay: beat 1 fills in the trials, every beat holds ~1.5 s, then it stops on the seal. */
  useEffect(() => {
    if (!playing) return;
    if (beat === 1 && i < N - 1) {
      const t = setTimeout(() => setI((x) => Math.min(N - 1, x + Math.max(1, Math.ceil(N / FRAMES)))), 50);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => (beat < 5 ? setBeat(beat + 1) : setPlaying(false)), BEAT_MS);
    return () => clearTimeout(t);
  }, [playing, beat, i, N]);

  const goBeat = (n: number) => {
    setPlaying(false);
    setBeat(n);
    if (n === 1) setI(Math.max(0, N - 1));
  };
  const onPlay = () => {
    if (!motion) return goBeat(beat === 5 ? 1 : beat + 1);
    if (playing) return setPlaying(false);
    setBeat(1);
    setI(0);
    setPlaying(true);
  };
  const onTrack = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || N < 1) return;
    setPlaying(false);
    setI(Math.round(Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)) * (N - 1)));
  };

  const current = pts[Math.min(i, N - 1)];
  const thetaPoint = pts.find((p) => p.trial_id === selectedId);
  /* Beat 1: the ring sits on the latest trial whose objective IS the served best so far (string identity). */
  const ringPoint = (() => {
    if (!current) return null;
    for (let k = Math.min(i, N - 1); k >= 0; k -= 1) if (pts[k]!.objective !== null && pts[k]!.objective === current.best_so_far) return pts[k]!;
    return null;
  })();
  const ringAt = beat === 1 && ringPoint ? pos(ringPoint) : null;
  const thetaAt = thetaPoint ? pos(thetaPoint) : null;
  const stamp = beat >= 2 && pool && poolServed ? freezeLineLabel(pool) : null;
  const sampler = samplerFromAtlas(atlas);
  const samplerCode = search.diagnostics.probe.sampler.reason_code;
  const unplaced = pts.filter((p) => pos(p) === null).length;

  return (
    <section className="sc-card" data-panel="search-cinema" data-cinema="ready" data-beat={beat} data-motion={motion ? "on" : "off"} data-playing={playing ? "true" : "false"} aria-label="search cinema">
      <style>{CSS}</style>
      <div className="sc-head">
        <h3 aria-level={2} className="[font-family:var(--font-body)] text-[10px] font-medium uppercase tracking-[.07em]" style={FAINT}>
          search cinema{studyLabel ? ` · ${studyLabel}` : ""}
        </h3>
        <button
          type="button"
          className="mono border px-[12px] py-[3px] text-[10.5px]"
          style={{ borderColor: "var(--accent)", background: "var(--accent)", color: "var(--paper-raised)", borderRadius: 6, minHeight: 24 }}
          onClick={onPlay}
          aria-pressed={motion ? playing : undefined}
          data-action="cinema-play"
          title={motion ? "Autoplay the five beats; pause at any time" : "Motion is off: step to the next beat"}
        >
          {motion ? (playing ? "❚❚ pause" : "▶ play") : "step ▶"}
        </button>
      </div>

      <div className="sc-body">
        <div className="sc-left">
          <div className="sc-axes" role="group" aria-label="cinema axes">
            {surface.axes.length > 1 ? (
              <>
                <span className="mono text-[9px]" style={FAINT}>x</span>
                {surface.axes.map((name) => (
                  <AxisPill key={`x-${name}`} name={name} what="x" attr="data-cinema-axis" active={axes.x === name} onPick={() => setAxes((a) => ({ ...a, x: name }))} />
                ))}
                <span className="mono ml-2 text-[9px]" style={FAINT}>y</span>
                {surface.axes.map((name) => (
                  <AxisPill key={`y-${name}`} name={name} what="y" attr="data-cinema-axis" active={axes.y === name} onPick={() => setAxes((a) => ({ ...a, y: name }))} />
                ))}
              </>
            ) : null}
          </div>

          <div
            {...c.regionProps}
            ref={plotRef}
            className={`sc-plot ${c.regionProps.className ?? ""}`}
            style={{ ...c.regionProps.style }}
            data-cinema-plot
            data-chart-controlled="true"
            data-cinema-shown={shownTo + 1}
          >
            {pts.map((point, k) => {
              if (k > shownTo) return null;
              const at = pos(point);
              if (!at) return null;
              const theta = point.trial_id === selectedId;
              const isBest = point.trial_id === bestId;
              const inPool = poolIds.has(point.trial_id);
              const hollow = point.state === "PRUNED" || point.objective_bucket === null;
              const outlined = beat >= 2 && inPool;
              const duel = beat === 4 && (theta || isBest);
              const sealed = beat === 5 && theta;
              const size = sealed ? 12 : duel ? 10 : outlined ? 10 : hollow ? 6 : 5;
              const border = sealed
                ? "2px solid var(--accent-2)"
                : duel
                  ? `2px solid ${theta ? "var(--good)" : "var(--bad)"}`
                  : outlined
                    ? "2px solid var(--accent-2)"
                    : hollow
                      ? "1px dashed var(--ink-faint)"
                      : "0";
              const dim = (beat >= 2 && !inPool && !theta && !isBest) || (beat === 5 && !theta);
              return (
                <span
                  key={point.trial_id}
                  className="sc-dot"
                  aria-hidden="true"
                  title={titleOf(point)}
                  data-cinema-point={point.trial_id}
                  data-point-bucket={point.objective_bucket ?? ""}
                  data-point-hollow={hollow ? "true" : undefined}
                  data-point-pool={inPool && beat >= 2 ? "true" : undefined}
                  style={{
                    left: `${at.left.toFixed(2)}%`,
                    top: `${at.top.toFixed(2)}%`,
                    width: size,
                    height: size,
                    margin: `-${size / 2}px 0 0 -${size / 2}px`,
                    background: hollow ? "transparent" : RAMP[point.objective_bucket as number],
                    border,
                    opacity: dim ? 0.2 : 1,
                    zIndex: theta || isBest ? 3 : outlined ? 2 : 1,
                  }}
                />
              );
            })}
            {ringAt ? <span className="sc-ring" aria-hidden="true" data-cinema-ring={ringPoint?.trial_id} style={{ left: `${ringAt.left}%`, top: `${ringAt.top}%` }} /> : null}
            {beat === 5 && thetaAt ? <span className="sc-drop" aria-hidden="true" style={{ left: `${thetaAt.left}%`, top: `${thetaAt.top}%`, bottom: 0 }} /> : null}
            {stamp ? (
              <span className="sc-stamp mono" title={stamp.title} data-cinema-stamp>
                {stamp.text}
              </span>
            ) : null}
            <span className="sc-axis mono" style={{ left: 6, top: 5 }}>↑ {axes.y}</span>
            <span className="sc-axis mono" style={{ right: 6, bottom: 4 }}>{axes.x} →</span>
            {c.nodes}
          </div>

          <div
            ref={trackRef}
            className="sc-track"
            aria-hidden="true"
            onPointerDown={onTrack}
            data-cinema-track
            title="Trial order: click to move; focus the plot and use the arrow keys"
          >
            <span className="sc-fill" style={{ width: N > 1 ? `${(i / (N - 1)) * 100}%` : "100%" }} />
            <span className="sc-thumb" style={{ left: N > 1 ? `${(i / (N - 1)) * 100}%` : "100%" }} />
          </div>
          <span className="mono min-h-[13px] text-[9.5px]" style={SOFT} data-cinema-readout role="status" aria-live="off">
            {beat === 1 && current ? `trial ${i + 1} of ${N} · ` : ""}
            {c.text}
          </span>
          {unplaced > 0 ? (
            <span className="mono text-[9px]" style={FAINT}>
              {unplaced} not placeable on {axes.x} × {axes.y}
            </span>
          ) : null}
        </div>

        <div className="sc-right">
          <ol className="sc-steps" aria-label="beats">
            {BEATS.map((b) => (
              <li key={b.n}>
                <button
                  type="button"
                  className="sc-step mono"
                  aria-current={beat === b.n ? "step" : undefined}
                  title={b.what}
                  data-cinema-step={b.n}
                  onClick={() => goBeat(b.n)}
                >
                  <span className="n">{b.n}</span>
                  <span className="t">{b.word}</span>
                </button>
              </li>
            ))}
          </ol>
          <div className="sc-beat" data-cinema-beat={beat} aria-live="polite">
            {beat === 1 ? <BeatRun point={current} /> : null}
            {beat === 2 ? <BeatPool search={search} served={poolServed} /> : null}
            {beat === 3 ? <BeatRescore search={search} rows={rows} selectedId={selectedId} bestId={bestId} /> : null}
            {beat === 4 ? <BeatDuel search={search} rows={rows} pts={pts} selectedId={selectedId} bestId={bestId} /> : null}
            {beat === 5 ? <BeatSeal runId={runId} cursor={cursor} search={search} selectedId={selectedId} point={thetaPoint} digest={selectedId ? selectedDigest : null} resolvedParameters={selectedTrial.state === "ready" ? selectedTrial.trial.parameters : undefined} digestReason={selectedTrial.state === "absent" ? selectedTrial.reason : undefined} allowCentroid={study === undefined && studyLabel === undefined} /> : null}
          </div>
        </div>
      </div>

      <p className="mono flex flex-wrap items-baseline gap-x-2 text-[9.5px]" style={FAINT} data-cinema-absences>
        <SamplerEvidenceRead fact={search.sampler_evidence} fallbackCode={samplerCode} />
        {sampler ? (
          <span title="Atlas release metadata, not run evidence" data-sampler-default>
            {sampler}
          </span>
        ) : null}
        <span title="Replays immutable search artifacts in order; it never re-runs the sampler." aria-label="replays immutable search artifacts in order; it never re-runs the sampler" tabIndex={0}>
          (i)
        </span>
      </p>
    </section>
  );
}

function BeatRun({ point }: { point: Point | undefined }) {
  if (!point) return <Absent code={null} words="no trial published" />;
  return (
    <span className="mono" style={SOFT} data-beat-run>
      IS {two(point.objective) ?? "not published"} · best so far {two(point.best_so_far) ?? "not published"}
    </span>
  );
}

function BeatPool({ search, served }: { search: CurrentSourceSearch; served: boolean }) {
  const pool = search.pool;
  if (!pool) return <Absent code="UI_SERVER_PREDATES_E5_POOL" words="pool: not published" data-beat-absent />;
  if (!served) return <Absent code={pool.rule.reason_code ?? pool.top_is_k.reason_code} words="pool: not published for this study" data-beat-absent />;
  const label = freezeLineLabel(pool);
  const k = pool.top_is_k;
  const n = pool.trials_evaluated;
  return (
    <div className="flex flex-col gap-1" data-beat-pool>
      {k.state === "AVAILABLE" && k.value !== null && n.state === "AVAILABLE" && n.value !== null ? (
        <span className="mono" style={SOFT} data-pool-of>
          top {k.value} of {n.value}
        </span>
      ) : (
        <Absent code={k.reason_code ?? n.reason_code} words="pool size: not published" data-beat-absent />
      )}
      <span className="mono" style={FAINT} title={pool.rule.expression ?? undefined} data-pool-rule>
        {label ? label.text : "pool: not published"}
        {pool.rule.expression ? ` · ${pool.rule.expression}${pool.rule.top_is_fraction ? ` · ${pool.rule.top_is_fraction}` : ""}` : ""}
      </span>
      <FrozenAt pool={pool} />
    </div>
  );
}

function BeatRescore({ search, rows, selectedId, bestId }: { search: CurrentSourceSearch; rows: readonly Candidate[]; selectedId: string | null; bestId: string | null }) {
  const kind = rows[0]?.facts.objective_kind ?? null;
  const ranked = useMemo(() => {
    const has = (row: Candidate) => row.objective !== null && Number.isFinite(Number(row.objective));
    return [...rows].filter(has).sort((a, b) => Number(b.objective) - Number(a.objective));
  }, [rows]);
  if (rows.length === 0) {
    return <Absent code={search.candidates.availability?.reason_code ?? search.pool?.rule.reason_code ?? null} words="candidates: not published" data-beat-absent />;
  }
  const J = ranked.map((row) => Number(row.objective));
  const lo = Math.min(...J);
  const hi = Math.max(...J);
  /* A column no candidate has a value for is one caption, not a column of absences. */
  const cols = (
    [
      ["IS", (r: Candidate) => r.facts.metrics.mean_is_sharpe],
      ["OOS", (r: Candidate) => r.facts.metrics.mean_oos_sharpe],
      ["decay", (r: Candidate) => r.facts.metrics.mean_decay],
    ] as const
  ).map(([name, get]) => ({ name, get, any: ranked.some((r) => two(get(r)?.value) !== null), code: ranked.map((r) => get(r)?.reason_code).find(Boolean) ?? null }));
  const shown = cols.filter((col) => col.any);
  return (
    <div className="flex flex-col gap-1" data-beat-rescore>
      <div className="sc-rank" tabIndex={0} role="group" aria-label="pool candidates ranked by J" style={{ ["--cols" as string]: shown.length + 1 }}>
        <div className="sc-row head mono">
          <span>trial</span>
          <span aria-hidden="true" />
          <span className="num" title={kind ?? undefined}>J</span>
          {shown.map((col) => (
            <span key={col.name} className="num">{col.name}</span>
          ))}
        </div>
        {ranked.map((row) => {
          const id = row.facts.source_trial_id ?? row.candidate_id;
          const theta = id === selectedId;
          const best = id === bestId;
          const w = hi > lo ? ((Number(row.objective) - lo) / (hi - lo)) * 100 : 100;
          return (
            <div
              key={row.candidate_id}
              className="sc-row mono"
              data-rescore-row={id}
              data-rescore-role={theta ? "theta" : best ? "best" : undefined}
              title={`trial ${id} · J ${row.objective}${theta ? " · θ* (selected)" : ""}${best ? " · best IS" : ""}`}
              style={theta ? { background: "var(--accent-soft)" } : undefined}
            >
              <span>{id}{theta ? " θ*" : best ? " IS" : ""}</span>
              <span className="sc-bar" style={{ width: `${Math.max(2, w)}%` }} aria-hidden="true" />
              <span className="num">{two(row.objective)}</span>
              {shown.map((col) => (
                <span key={col.name} className="num">
                  <MetricCell metric={col.get(row)} />
                </span>
              ))}
            </div>
          );
        })}
      </div>
      <span className="mono text-[9.5px]" style={FAINT} data-rescore-caption>
        J · {kind ? humanise(kind) : "objective kind not published"}
        {cols.filter((col) => !col.any).map((col) => (
          <span key={col.name}>
            {" · "}
            <Absent code={col.code} words={`${col.name} not published`} />
          </span>
        ))}
      </span>
    </div>
  );
}

function Side({ role, id, candidate, point, tone }: { role: string; id: string | null; candidate: Candidate | undefined; point: Point | undefined; tone: string }) {
  const m = candidate?.facts.metrics;
  const isText = two(m?.mean_is_sharpe?.value) ?? (candidate ? null : two(point?.objective));
  return (
    <div className="sc-side" style={{ borderColor: tone }} data-duel-side={role}>
      <span className="mono font-bold" style={{ color: tone }}>
        {role} · {id !== null ? `trial ${id}` : "not published"}
      </span>
      <dl className="mono">
        <dt style={FAINT}>IS</dt>
        <dd>{isText !== null ? isText : <Absent code={m?.mean_is_sharpe?.reason_code} words="absent" />}</dd>
        <dt style={FAINT}>OOS</dt>
        <dd>{candidate ? <MetricCell metric={m?.mean_oos_sharpe} /> : <Absent code="UI_NOT_IN_POOL_LEDGER" words="not in pool" />}</dd>
        <dt style={FAINT}>decay</dt>
        <dd>{candidate ? <MetricCell metric={m?.mean_decay} /> : <Absent code="UI_NOT_IN_POOL_LEDGER" words="not in pool" />}</dd>
        <dt style={FAINT}>J</dt>
        <dd>{candidate && two(candidate.objective) !== null ? <span title={candidate.objective ?? undefined}>{two(candidate.objective)}</span> : <Absent code={candidate ? null : "UI_NOT_IN_POOL_LEDGER"} words={candidate ? "absent" : "not in pool"} />}</dd>
      </dl>
    </div>
  );
}

function BeatDuel({ search, rows, pts, selectedId, bestId }: { search: CurrentSourceSearch; rows: readonly Candidate[]; pts: readonly Point[]; selectedId: string | null; bestId: string | null }) {
  if (selectedId === null || bestId === null) {
    return <Absent code={search.selection.availability?.reason_code ?? null} words="IS best or θ*: not published" data-beat-absent />;
  }
  const same = selectedId === bestId;
  const theta = search.selection.selected_trial_id === selectedId
    ? selectedCandidate(search) ?? candidateOf(rows, selectedId)
    : candidateOf(rows, selectedId);
  return (
    <div className="flex flex-col gap-2" data-beat-duel data-duel={same ? "same" : "overruled"}>
      <div className="sc-duel">
        {same ? null : <Side role="IS best" id={bestId} candidate={candidateOf(rows, bestId)} point={pts.find((p) => p.trial_id === bestId)} tone="var(--bad)" />}
        <Side role={same ? "IS best · θ*" : "θ*"} id={selectedId} candidate={theta} point={pts.find((p) => p.trial_id === selectedId)} tone="var(--good)" />
      </div>
      <span className="mono" style={SOFT} data-duel-sentence>
        {same ? "the IS best was selected" : "selection overruled the IS best"}
      </span>
    </div>
  );
}

function BeatSeal({ runId, cursor, search, selectedId, point, digest, resolvedParameters, digestReason, allowCentroid }: { runId: string; cursor: EvidenceCursor; search: CurrentSourceSearch; selectedId: string | null; point: Point | undefined; digest: string | null; resolvedParameters?: Record<string, string>; digestReason?: string; allowCentroid: boolean }) {
  const centroid = allowCentroid && selectedId === null && search.selection.selected_trial_id === null
    && search.selection.roles.centroid.state === "AVAILABLE" && Object.keys(search.selection.parameters).length > 0;
  if (selectedId === null && !centroid) return <Absent code={search.selection.availability?.reason_code ?? null} words="θ*: not published" data-beat-absent />;
  const params = cleanParameters(point?.parameters ?? resolvedParameters ?? (search.selection.selected_trial_id === selectedId ? search.selection.parameters : undefined));
  return (
    <div className="sc-slot mono" data-beat-seal>
      <span style={{ color: "var(--accent-2)" }} className="font-bold">
        {centroid ? "❖ θ* · centroid · no source trial" : `❖ θ* · trial ${selectedId}`}
      </span>
      {params ? (
        <span style={SOFT} data-seal-params>
          {Object.entries(params).map(([k, v]) => `${k} ${v}`).join(" · ")}
        </span>
      ) : null}
      <span style={SOFT}>
        params digest {digest ? <Digest value={digest} data-seal-digest /> : <Absent code={centroid ? "UI_SEARCH_READ_PUBLISHES_NO_CENTROID_PARAMS_DIGEST" : digestReason ?? "UI_DIGEST_NOT_IN_LOADED_LEDGER_PAGE"} words={centroid ? "not published for centroid" : "not in the loaded ledger page"} />}
      </span>
      <span style={SOFT}>
        sealed at <Absent code="UI_SEARCH_READ_PUBLISHES_NO_SEAL_CLOCK" data-seal-at="absent" />
      </span>
      <Link to={runScreenHref(runId, "freeze", cursor, { stage: "freeze" })} className="mono" style={{ color: "var(--accent)" }} data-action="cinema-to-freeze" title="Open S3 · Freeze — the sealed θ* and its digest chain">
        Stage 3 · Freeze →
      </Link>
    </div>
  );
}
