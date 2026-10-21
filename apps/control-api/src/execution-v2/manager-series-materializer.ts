/**
 * BE-P16 (ELP2-05/06, ELP2-REQ-06-002): the pure second half of the Manager series writer.
 *
 * Turns the OBSERVATIONS of the retained revisions (plus the one derived from the revision being published) into
 * `ManagerSeriesPublication`s, the stored form `manager-series.ts` selects and never computes. It publishes a series only when
 * the publication contract can be satisfied from facts alone and states, instead of filling, everything it cannot:
 *
 *  - points are the exact decimal totals at their own valuation instants; equal instants must agree, else NO series;
 *  - a series has one methodology, one origin and one population: observations of another one are excluded and said so;
 *  - a break in the revision chain, a revision that could not be valued, or a projection generation change inside the window is a
 *    stated gap (`SOURCE_GAP` / `PROJECTION_DISCONTINUITY`), never an interpolated point;
 *  - a window the history does not reach back to is `PARTIAL` with the reason, never `COMPLETE`;
 *  - the windows are the Portal's own presets (7D/30D/90D) resolved by `resolveManagerWindow`, the same function the reader uses
 *    for the exact-window match; ALL needs an inception witness nobody publishes, so it is a typed absence;
 *  - RETURN is never produced (no scale, cashflow revision, economic revision, denominator or return methodology exists).
 */
import { accessDigest } from "./access-policy";
import type { ManagerModelDocument } from "./manager-model.contract";
import { resolveManagerWindow } from "./manager-query-p1";
import { MAX_SERIES_GAPS, MAX_SERIES_POINTS, managerSeriesPublication, seriesStagesFor, validateManagerSeriesPublications,
  type ManagerSeriesPublication } from "./manager-series-publication.contract";
import { AbsenceLedger, DERIVED_SERIES_METRICS, MANAGER_SERIES_CALCULATION_REVISION, MANAGER_SERIES_POLICY_REVISION, RETURN_INPUT_ABSENCES,
  deriveSeriesObservations, observationKey, seriesPopulations, type DerivedSeriesRevision, type SeriesAbsence, type SeriesConfidence,
  type SeriesObservation, type SeriesRevisionMarker } from "./manager-series-observation";

export const SERIES_WINDOW_PRESETS = ["7D", "30D", "90D"] as const;
export type SeriesWindowPreset = typeof SERIES_WINDOW_PRESETS[number];
export interface ManagerSeriesConfig {
  /** Explicit, non-empty. Only these windows are published; a reader asking for another one gets EXACT_METRIC_WINDOW_NOT_PUBLISHED. */
  windows: readonly SeriesWindowPreset[];
  /** Bounds the points of ALL series of one document so it cannot exceed the projection byte cap. */
  maximum_total_points: number;
  /** Bounds the rows one materialization may read back. Over it: nothing is published, never a truncated history. */
  maximum_history_rows: number;
}
export const DEFAULT_SERIES_BOUNDS = Object.freeze({ maximum_total_points: 20_000, maximum_history_rows: 50_000 });
export function validateSeriesConfig(c: ManagerSeriesConfig): ManagerSeriesConfig {
  if (!Array.isArray(c.windows) || c.windows.length < 1 || c.windows.length > 3 || new Set(c.windows).size !== c.windows.length ||
    c.windows.some(w => !SERIES_WINDOW_PRESETS.includes(w))) throw new Error("MANAGER_SERIES_CONFIG_INVALID");
  if (!Number.isSafeInteger(c.maximum_total_points) || c.maximum_total_points < 1 || c.maximum_total_points > 100_000 ||
    !Number.isSafeInteger(c.maximum_history_rows) || c.maximum_history_rows < 1 || c.maximum_history_rows > 200_000)
    throw new Error("MANAGER_SERIES_CONFIG_INVALID");
  return Object.freeze({ ...c, windows: Object.freeze([...c.windows]) as readonly SeriesWindowPreset[] });
}

export interface SeriesHistory { revisions: SeriesRevisionMarker[]; observations: SeriesObservation[]; }
export interface MaterializedSeries { publications: ManagerSeriesPublication[]; absences: SeriesAbsence[]; current: DerivedSeriesRevision; }
const DAY = 86_400_000;
const compare = (a: number | string, b: number | string) => a < b ? -1 : a > b ? 1 : 0;
const rank: Record<SeriesConfidence, number> = { VERIFIED: 2, PROVISIONAL: 1, UNKNOWN: 0 };

/** Exact decimal equality without float: "1.0" and "1" are the same value. */
function sameDecimal(a: string, b: string): boolean {
  const split = (v: string) => { const neg = v.startsWith("-"), [w, f = ""] = (neg ? v.slice(1) : v).split("."); return { neg, w, f: f.replace(/0+$/, "") }; };
  const x = split(a), y = split(b), zero = (s: ReturnType<typeof split>) => /^0*$/.test(s.w) && s.f === "";
  if (zero(x) && zero(y)) return true;
  return x.neg === y.neg && BigInt(x.w) === BigInt(y.w) && x.f === y.f;
}

export function materializeManagerSeries(doc: ManagerModelDocument, history: SeriesHistory, config: ManagerSeriesConfig): MaterializedSeries {
  const cfg = validateSeriesConfig(config), current = deriveSeriesObservations(doc), ledger = new AbsenceLedger();
  ledger.merge(current.absences);
  const result = (publications: ManagerSeriesPublication[]): MaterializedSeries => ({ publications, absences: ledger.list(), current });
  const populations = seriesPopulations(doc);
  if (populations.length) for (const reason of RETURN_INPUT_ABSENCES) ledger.add(reason, "RETURN", populations.length);
  ledger.add("ALPHA_DEPLOYMENT_SUBJECT_NOT_IN_CONTRACT", null);
  ledger.add("ALL_HISTORY_WINDOW_NOT_PUBLISHED", null);
  if (doc.qualification !== "SOURCE_VERIFIED" || doc.source_quality.completeness !== "COMPLETE" || doc.source_quality.freshness !== "FRESH") {
    if (doc.qualification === "SOURCE_VERIFIED") ledger.add("SOURCE_NOT_FRESH_OR_COMPLETE", null);
    return result([]);
  }
  if (history.observations.length > cfg.maximum_history_rows) { ledger.add("SERIES_HISTORY_BOUND", null); return result([]); }

  // The revision chain, oldest first, with the revision being published as its end.
  const chain = [...history.revisions.filter(r => r.revision !== doc.revision), current.marker]
    .sort((a, b) => compare(a.as_of_ms, b.as_of_ms) || compare(a.revision, b.revision));
  const index = new Map(chain.map((r, i) => [r.revision, i]));
  const byKey = new Map<string, SeriesObservation[]>();
  for (const o of [...history.observations.filter(o => o.revision !== doc.revision), ...current.observations])
    byKey.set(observationKey(o), [...byKey.get(observationKey(o)) ?? [], o]);

  const publications: ManagerSeriesPublication[] = [];
  let totalPoints = 0, bounded = false;
  for (const preset of cfg.windows) {
    let window: { from_ms: number; to_ms: number } | null = null;
    try { window = resolveManagerWindow(doc.as_of_ms, preset)?.resolved ?? null; } catch { window = null; }
    if (!window) { ledger.add("WINDOW_BEFORE_EPOCH", null); continue; }
    for (const population of populations) for (const metric of DERIVED_SERIES_METRICS) {
      for (const cur of current.observations.filter(o => o.subject_type === population.subject_type && o.subject_id === population.subject_id && o.metric === metric)) {
        if (cur.value === null || cur.point_ts_ms === null) continue; // a current absence is already in the ledger; a stale tail is not published as current
        if (publications.length >= 256 || bounded) { bounded = true; continue; }
        const rows = byKey.get(observationKey(cur)) ?? [];
        const inWindow = rows.filter(o => o.value !== null && o.point_ts_ms !== null && o.point_ts_ms >= window.from_ms && o.point_ts_ms <= window.to_ms);
        const sameBasis = inWindow.filter(o => o.population_digest === cur.population_digest && o.methodology_ref === cur.methodology_ref && o.origin_ms === cur.origin_ms);
        const excluded = inWindow.length - sameBasis.length;
        if (excluded) ledger.add("SERIES_OBSERVATIONS_EXCLUDED_DIFFERENT_BASIS", metric, excluded);
        if (!sameBasis.some(o => o === cur)) { ledger.add("NO_VALUED_OBSERVATION_IN_WINDOW", metric); continue; }
        // One instant, one value.
        const points = new Map<number, string>(); let conflict = false;
        for (const o of sameBasis) {
          const seen = points.get(o.point_ts_ms!);
          if (seen !== undefined && !sameDecimal(seen, o.value!)) conflict = true;
          if (seen === undefined) points.set(o.point_ts_ms!, o.value!);
        }
        if (conflict) { ledger.add("CONFLICTING_OBSERVATIONS_AT_INSTANT", metric); continue; }
        const ordered = [...points].sort(([a], [b]) => a - b);
        if (ordered.length > MAX_SERIES_POINTS) { ledger.add("SERIES_POINT_BOUND_EXCEEDED", metric); continue; }
        if (totalPoints + ordered.length > cfg.maximum_total_points) { ledger.add("SERIES_DOCUMENT_BOUND", metric); bounded = true; continue; }

        // First revision that carried each instant: the chain position the gaps are measured between.
        const firstAt = new Map<number, number>();
        for (const o of sameBasis) {
          const at = index.get(o.revision);
          if (at !== undefined && (firstAt.get(o.point_ts_ms!) ?? Infinity) > at) firstAt.set(o.point_ts_ms!, at);
        }
        const valuedRevisions = new Set(sameBasis.map(o => o.revision));
        const gaps: Array<{ from_ms: number; to_ms: number; reason: "SOURCE_GAP" | "PROJECTION_DISCONTINUITY" }> = [];
        for (let i = 1; i < ordered.length; i++) {
          const a = firstAt.get(ordered[i - 1][0]), b = firstAt.get(ordered[i][0]);
          if (a === undefined || b === undefined) continue;
          let reason: "SOURCE_GAP" | "PROJECTION_DISCONTINUITY" | null = null;
          for (let k = a + 1; k <= b; k++) {
            const r = chain[k], p = chain[k - 1];
            if (r.source_epoch !== p.source_epoch || r.projection_generation !== p.projection_generation) reason = "PROJECTION_DISCONTINUITY";
            else if (reason === null && (r.supersedes_revision !== p.revision || k < b && !valuedRevisions.has(r.revision))) reason = "SOURCE_GAP";
          }
          if (reason === null) continue;
          const last = gaps[gaps.length - 1], from = ordered[i - 1][0], to = ordered[i][0];
          if (last && last.to_ms === from) { last.to_ms = to; if (reason === "PROJECTION_DISCONTINUITY") last.reason = reason; }
          else gaps.push({ from_ms: from, to_ms: to, reason });
        }
        if (gaps.length > MAX_SERIES_GAPS) { ledger.add("SERIES_GAP_BOUND_EXCEEDED", metric); continue; }

        // Completeness is about what the history can vouch for, not what the latest value looks like.
        const reasons: string[] = [];
        let broken = false;
        for (let k = Math.max(1, chain.findIndex(r => r.as_of_ms >= window.from_ms)); k < chain.length; k++)
          if (chain[k].supersedes_revision !== chain[k - 1].revision || chain[k].source_epoch !== chain[k - 1].source_epoch ||
            chain[k].projection_generation !== chain[k - 1].projection_generation) broken = true;
        if (!chain.some(r => r.as_of_ms <= window.from_ms)) reasons.push("HISTORY_STARTS_AFTER_WINDOW_START");
        // CR-03: a revision MARKER proves the chain, not that this subject/metric was observed. From the revision that reaches the window
        // start (or the oldest one retained) up to the first published point, every revision must itself carry a usable observation of
        // this key (valued, same basis; its instant may precede the window: nothing is carried into it). Otherwise the prefix is missing.
        const usable = new Set<number>();
        for (const o of rows) {
          const at = index.get(o.revision);
          if (at !== undefined && o.value !== null && o.population_digest === cur.population_digest && o.methodology_ref === cur.methodology_ref &&
            o.origin_ms === cur.origin_ms) usable.add(at);
        }
        let anchor = -1;
        for (let k = 0; k < chain.length; k++) if (chain[k].as_of_ms <= window.from_ms) anchor = k;
        const firstPoint = Math.min(...[...firstAt.values()]);
        let leadingMissing = false;
        for (let k = Math.max(anchor, 0); k < firstPoint; k++) if (!usable.has(k)) leadingMissing = true;
        if (leadingMissing) reasons.push("OBSERVATIONS_MISSING_BEFORE_FIRST_POINT");
        if (broken) reasons.push("REVISION_CHAIN_BREAK");
        if (gaps.length) reasons.push("GAPS_STATED");
        if (excluded) reasons.push("OBSERVATIONS_OF_ANOTHER_BASIS_EXCLUDED");
        const otherPopulation = rows.some(o => o.population_digest !== cur.population_digest && o.as_of_ms >= window.from_ms);
        if (otherPopulation) reasons.push("POPULATION_CHANGED_IN_WINDOW");
        const confidence = sameBasis.reduce<SeriesConfidence>((worst, o) => o.source_confidence !== null && rank[o.source_confidence] < rank[worst] ? o.source_confidence : worst, "VERIFIED");
        const inputDigest = accessDigest({ calculation: MANAGER_SERIES_CALCULATION_REVISION, policy: MANAGER_SERIES_POLICY_REVISION,
          window, key: observationKey(cur), inputs: sameBasis.map(o => o.input_digest).sort(), gaps });
        const publication: ManagerSeriesPublication = { binding: { subject_type: population.subject_type, subject_id: population.subject_id,
          tuple_population_digest: population.population_digest, stage_filter: seriesStagesFor(doc.environment), metric, partition: cur.partition,
          window_start_ms: window.from_ms, window_end_ms: window.to_ms },
        series: { unit: "MONEY", currency: cur.currency!, ratio_scale: null, basis: cur.basis!, methodology_ref: cur.methodology_ref!,
          points: ordered.map(([ts_ms, value]) => ({ ts_ms, value })), gaps },
        quality: { completeness: reasons.length ? "PARTIAL" : "COMPLETE", freshness: "FRESH", reasons },
        source_confidence: confidence,
        provenance: { scope: { workspace_id: doc.workspace_id, environment: doc.environment, profile_id: doc.profile_id, catalogue_digest: doc.catalogue_digest },
          source_revision: doc.revision, source_set_digest: doc.source_set_digest, source_qualification: "SOURCE_VERIFIED", input_digest: inputDigest,
          calculation_revision: MANAGER_SERIES_CALCULATION_REVISION, policy_revision: MANAGER_SERIES_POLICY_REVISION, source_as_of_ms: doc.as_of_ms } };
        const parsed = managerSeriesPublication.safeParse(publication);
        if (!parsed.success) { ledger.add("SERIES_PUBLICATION_INVALID", metric); continue; }
        publications.push(parsed.data); totalPoints += ordered.length;
      }
    }
  }
  if (bounded) ledger.add("SERIES_DOCUMENT_BOUND", null);
  // The document-level binding rules the stored contract also applies at admission. If they ever disagree, publish nothing: a
  // series bug must never make the financial revision itself unadmittable.
  const issues: string[] = [];
  validateManagerSeriesPublications({ workspace_id: doc.workspace_id, environment: doc.environment, profile_id: doc.profile_id,
    catalogue_digest: doc.catalogue_digest, revision: doc.revision, source_set_digest: doc.source_set_digest, as_of_ms: doc.as_of_ms,
    precomputed_series: publications }, { addIssue: i => { issues.push(i.message ?? "MANAGER_SERIES_INVALID"); }, path: [] });
  if (issues.length) { ledger.add("SERIES_PUBLICATION_INVALID", null, issues.length); return result([]); }
  return result(publications);
}
