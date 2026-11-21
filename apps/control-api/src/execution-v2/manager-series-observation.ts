/**
 * BE-P16 (ELP2-05/06, ELP2-REQ-06-002): the pure first half of the Manager series writer.
 *
 * One Manager revision is reduced to OBSERVATIONS: for every subject (the fund, each portfolio), metric (NAV, NET_PNL) and
 * economic partition, either the exact decimal total of the SOURCE_VERIFIED facts of that partition at one valuation instant,
 * or a typed absence (`reason_code`). The arithmetic and the census rules are the ones the Manager dataset reader already
 * applies (`managerPartitionTotals`: exact BigInt sum, ownership de-duplication, methodology and unit identity, member census),
 * so a point can never disagree with the current value the dataset serves for the same partition.
 *
 * Nothing is invented: no FX, no rebase, no interpolation, no carried-forward value, no default methodology, no float. A
 * RETURN is not derived here (no cashflow revision, scale or denominator exists in any retained revision).
 */
import { accessDigest } from "./access-policy";
import { economicFacts, managerPartitionKey, managerPartitionTotals, managerTupleKey } from "./manager-model";
import { managerPartition, type ManagerMember, type ManagerModelDocument } from "./manager-model.contract";
import { managerScorePopulationDigest } from "./manager-score-publication";
import type { ManagerEconomicSourceRuntime } from "./manager-economic-source-runtime";

export const MANAGER_SERIES_CALCULATION_REVISION = "manager-series-materializer.v1";
export const MANAGER_SERIES_POLICY_REVISION = "manager-series-policy.v1:exact-instant-fact-sum;no-fx;no-resample;no-carry-forward";
export const MAX_SERIES_OBSERVATIONS_PER_REVISION = 128;
/** Only these two metrics are derivable from retained facts. RETURN needs inputs no revision carries (see RETURN_INPUT_ABSENCES). */
export const SERIES_FACT_KIND = { NAV: "current_nav", NET_PNL: "net_pnl" } as const;
export type DerivedSeriesMetric = keyof typeof SERIES_FACT_KIND;
export const DERIVED_SERIES_METRICS = ["NAV", "NET_PNL"] as const satisfies readonly DerivedSeriesMetric[];
export type SeriesSubjectType = "portfolio" | "manager_book";
/** What RETURN needs and no retained revision carries; owners in the BE-P16 receipt. Reported, never filled in. */
export const RETURN_INPUT_ABSENCES = ["RATIO_SCALE_NOT_PUBLISHED", "CASHFLOW_REVISION_NOT_PUBLISHED", "ECONOMIC_REVISION_NOT_PUBLISHED",
  "RETURN_DENOMINATOR_NOT_PUBLISHED", "RETURN_METHODOLOGY_NOT_PUBLISHED"] as const;
const REASON = /^[A-Z][A-Z0-9_]{2,127}$/;
const confidenceRank = { VERIFIED: 2, PROVISIONAL: 1, UNKNOWN: 0 } as const;
export type SeriesConfidence = keyof typeof confidenceRank;

export interface SeriesSubjectPopulation { subject_type: SeriesSubjectType; subject_id: string; members: ManagerMember[]; population_digest: string; }
export interface SeriesObservation {
  revision: string; subject_type: SeriesSubjectType; subject_id: string; metric: DerivedSeriesMetric; partition_key: string;
  partition: ReturnType<typeof managerPartition.parse>; population_digest: string; as_of_ms: number;
  point_ts_ms: number | null; value: string | null; reason_code: string | null;
  currency: string | null; basis: string | null; methodology_ref: string | null; origin_ms: number | null;
  source_confidence: SeriesConfidence | null; input_digest: string;
}
export interface SeriesAbsence { reason_code: string; metric: DerivedSeriesMetric | "RETURN" | null; count: number; }
export interface SeriesRevisionMarker { revision: string; supersedes_revision: string | null; source_epoch: string; projection_generation: string;
  as_of_ms: number; qualification: "SOURCE_VERIFIED" | "TEST_ONLY"; doc_completeness: string; doc_freshness: string;
  /** Internal persistence fence, never a new public financial field. */
  calculation_revision?: string; }
export interface DerivedSeriesRevision { marker: SeriesRevisionMarker; observations: SeriesObservation[]; observation_digest: string; absences: SeriesAbsence[]; }

export const observationKey = (o: Pick<SeriesObservation, "subject_type" | "subject_id" | "metric" | "partition_key">) =>
  JSON.stringify([o.subject_type, o.subject_id, o.metric, o.partition_key]);
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

/** The active members at the document cutoff, grouped the way the reader groups them: the whole fund and each portfolio. */
export function seriesPopulations(doc: ManagerModelDocument): SeriesSubjectPopulation[] {
  const active = doc.members.filter(m => m.valid_from_ms <= doc.as_of_ms && (m.valid_to_ms === null || m.valid_to_ms > doc.as_of_ms));
  if (!active.length) return [];
  const byPortfolio = new Map<string, ManagerMember[]>();
  for (const m of active) byPortfolio.set(m.tuple.portfolio_id, [...byPortfolio.get(m.tuple.portfolio_id) ?? [], m]);
  return [{ subject_type: "manager_book" as const, subject_id: doc.workspace_id, members: active, population_digest: managerScorePopulationDigest(active) },
    ...[...byPortfolio].sort(([a], [b]) => compare(a, b)).map(([id, members]) => ({ subject_type: "portfolio" as const, subject_id: id, members,
      population_digest: managerScorePopulationDigest(members) }))];
}

export class AbsenceLedger {
  private readonly counts = new Map<string, SeriesAbsence>();
  add(reason: string, metric: SeriesAbsence["metric"], count = 1) {
    const safe = REASON.test(reason) ? reason : "SOURCE_REASON_UNRECOGNIZED", key = `${metric}|${safe}`;
    const old = this.counts.get(key);
    this.counts.set(key, { reason_code: safe, metric, count: (old?.count ?? 0) + count });
  }
  merge(items: readonly SeriesAbsence[]) { for (const i of items) this.add(i.reason_code, i.metric, i.count); }
  /** Deterministic and bounded: the checkpoint column holds at most 64 entries. */
  list(limit = 64): SeriesAbsence[] {
    return [...this.counts.values()].sort((a, b) => compare(`${a.metric}|${a.reason_code}`, `${b.metric}|${b.reason_code}`)).slice(0, limit);
  }
}

const marker = (d: ManagerModelDocument): SeriesRevisionMarker => ({ revision: d.revision, supersedes_revision: d.supersedes_revision, source_epoch: d.source_epoch,
  projection_generation: d.projection_generation, as_of_ms: d.as_of_ms, qualification: d.qualification,
  doc_completeness: d.source_quality.completeness, doc_freshness: d.source_quality.freshness });
const finish = (m: SeriesRevisionMarker, observations: SeriesObservation[], ledger: AbsenceLedger): DerivedSeriesRevision => {
  const sorted = [...observations].sort((a, b) => compare(observationKey(a), observationKey(b)));
  return { marker: m, observations: sorted, absences: ledger.list(),
    observation_digest: accessDigest({ calculation: m.calculation_revision ?? MANAGER_SERIES_CALCULATION_REVISION, marker: m, observations: sorted }) };
};

/** Never throws: a document the shared aggregator refuses (for example conflicting snapshot facts) yields a known, empty revision
 * and a typed absence. A series defect must not be able to take the financial projection down with it. */
export function deriveSeriesObservations(doc: ManagerModelDocument): DerivedSeriesRevision {
  return deriveSeriesObservationsWithEconomicSource(doc);
}

/** Explicit owning adapter shared with dataset totals, including the identical
 * refusal/census semantics. The one-argument legacy API remains map()-safe. */
export function deriveSeriesObservationsWithEconomicSource(doc: ManagerModelDocument, economic?: ManagerEconomicSourceRuntime): DerivedSeriesRevision {
  try { return deriveSeriesObservationsUnsafe(doc, economic); }
  catch {
    const ledger = new AbsenceLedger(); ledger.add("SERIES_DERIVATION_REFUSED", null);
    return finish({ ...marker(doc), ...(economic ? { calculation_revision: economic.calculation_revision } : {}) }, [], ledger);
  }
}

/** Pure, deterministic, bounded: the same document always yields the same digest (idempotence of the writer rests on this). */
function deriveSeriesObservationsUnsafe(doc: ManagerModelDocument, economic?: ManagerEconomicSourceRuntime): DerivedSeriesRevision {
  const m = { ...marker(doc), ...(economic ? { calculation_revision: economic.calculation_revision } : {}) }, ledger = new AbsenceLedger();
  if (doc.qualification !== "SOURCE_VERIFIED") { ledger.add("SOURCE_NOT_QUALIFIED", null); return finish(m, [], ledger); }
  const documentUsable = doc.source_quality.completeness === "COMPLETE" && doc.source_quality.freshness === "FRESH";
  const observations: SeriesObservation[] = [];
  for (const population of seriesPopulations(doc)) {
    const tuples = new Set(population.members.map(x => managerTupleKey(x.tuple)));
    const kinds: readonly string[] = DERIVED_SERIES_METRICS.map(x => SERIES_FACT_KIND[x]);
    // Canonical order: which clone of a shared economic account is kept must not depend on the order the source listed facts in.
    const facts = doc.facts.filter(f => tuples.has(managerTupleKey(f.tuple)) && kinds.includes(f.kind)).sort((a, b) => compare(a.fact_id, b.fact_id));
    const eco = economic ? facts.filter(f => f.classification !== "CUSTODY") : economicFacts(facts);
    const totals = managerPartitionTotals(facts, kinds, tuples, economic ? { document: doc, runtime: economic } : undefined);
    const currencies = new Set(totals.map(t => t.partition.currency));
    if (currencies.size > 1) ledger.add("FX_RATE_NOT_PUBLISHED", "NAV");
    for (const total of totals) {
      const partition = managerPartition.parse(total.partition), pKey = accessDigest(managerPartitionKey(total.partition));
      for (const metric of DERIVED_SERIES_METRICS) {
        const kind = SERIES_FACT_KIND[metric], value = total.metrics[kind];
        const rows = eco.filter(f => f.kind === kind && managerPartitionKey(f.partition) === managerPartitionKey(total.partition));
        const instants = new Set(rows.map(f => f.effective_at_ms));
        const base = { revision: doc.revision, subject_type: population.subject_type, subject_id: population.subject_id, metric, partition_key: pKey, partition,
          population_digest: population.population_digest, as_of_ms: doc.as_of_ms } as const;
        let reason: string | null = null;
        if (value.value === null) reason = value.reason_code ?? "SOURCE_FACTS_NOT_PUBLISHED";
        else if (!documentUsable) reason = "SOURCE_NOT_FRESH_OR_COMPLETE";
        else if (value.unit !== "MONEY") reason = "SERIES_UNIT_NOT_MONEY";
        else if (value.currency !== partition.currency) reason = "SERIES_CURRENCY_MISMATCH";
        else if (value.basis !== partition.basis) reason = "SERIES_BASIS_MISMATCH";
        else if (!value.methodology_ref) reason = "METHODOLOGY_NOT_PUBLISHED";
        else if (value.quality.freshness !== "FRESH") reason = "SOURCE_NOT_FRESH";
        else if (instants.size !== 1) reason = "INCOMPARABLE_VALUATION_CUTOFF";
        if (reason !== null || value.value === null) {
          const safe = REASON.test(reason ?? "") ? reason! : "SOURCE_REASON_UNRECOGNIZED";
          ledger.add(safe, metric);
          // A metric the source never published for this partition has no key to keep a history for: counted, not stored.
          if (safe === "SOURCE_FACTS_NOT_PUBLISHED") continue;
          observations.push({ ...base, point_ts_ms: null, value: null, reason_code: safe, currency: null, basis: null, methodology_ref: null, origin_ms: null,
            source_confidence: null, input_digest: accessDigest({ calculation: m.calculation_revision ?? MANAGER_SERIES_CALCULATION_REVISION, revision: doc.revision,
              source_set: doc.source_set_digest, key: [base.subject_type, base.subject_id, metric, pKey], reason: safe }) });
          continue;
        }
        observations.push({ ...base, point_ts_ms: [...instants][0], value: value.value, reason_code: null, currency: value.currency, basis: value.basis,
          methodology_ref: value.methodology_ref, origin_ms: value.window?.from_ms ?? null, source_confidence: value.source_confidence,
          input_digest: accessDigest({ calculation: m.calculation_revision ?? MANAGER_SERIES_CALCULATION_REVISION, revision: doc.revision, source_set: doc.source_set_digest,
            key: [base.subject_type, base.subject_id, metric, pKey], provenance: value.provenance_refs }) });
      }
    }
  }
  if (observations.length > MAX_SERIES_OBSERVATIONS_PER_REVISION) {
    // Never keep a prefix: a truncated census would read as a complete one. The revision marker is still written (a known, empty revision).
    const dropped = new AbsenceLedger(); dropped.add("SERIES_OBSERVATION_BOUND", null);
    return finish(m, [], dropped);
  }
  return finish(m, observations, ledger);
}
