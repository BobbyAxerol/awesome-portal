/** Read already-validated sealed scalars; never calculate from display curves. */
import type { ResearchEnrichedAnalysis } from "./enriched-analysis.contract";
import { ResearchRetainedAnalyticsV2FactSchema, type ResearchRetainedAnalyticsV2 } from "./retained-analytics-v2.contract";

export type SealedPerformanceMetric = "sharpe" | "sharpe_decay";
export interface SealedMetricSources {
  /** The caller verifies the supplement's canonical hash and immutable run/source binding. */
  enriched?: ResearchEnrichedAnalysis;
  /** A schema-validated embedded seal, or a digest-verified retained companion. */
  analyticsV2?: ResearchRetainedAnalyticsV2 | null;
}

export const SEALED_PERFORMANCE_DEFINITIONS = Object.freeze({
  engineSharpe: "research.metric.analytics-v2.sealed-oos-engine-sharpe",
  portalSharpe: "research.metric.analytics-v2.sealed-oos-portal-sharpe",
  engineDecay: "research.metric.analytics-v2.sealed-is-minus-oos-engine-sharpe",
  portalDecay: "research.metric.analytics-v2.sealed-is-minus-oos-sharpe",
});

/**
 * Call only after preserving an available original engine/selected-trial fact.
 * Sharpe is the sealed all-time OOS reporting fact, not a selected-trial mean
 * across folds. Decay is the sealed IS-minus-OOS fact, not mean fold decay.
 * Stored origins remain literal, including older PORTAL_DERIVED Sharpe facts
 * whose locator is quantbt.full_report.sharpe. No quantmethod is redefined.
 */
export function resolveSealedPerformanceMetric(key: SealedPerformanceMetric, sources: SealedMetricSources) {
  const candidates = [
    { block: sources.enriched, fact: sources.enriched?.facts.metrics[key], source: "ENRICHED_ANALYSIS" as const },
    { block: sources.analyticsV2, fact: sources.analyticsV2?.metrics[key], source: "SUMMARY_ANALYTICS_V2" as const },
  ].flatMap(({ block, fact, source }) => {
    const parsed = ResearchRetainedAnalyticsV2FactSchema.safeParse(fact);
    return block && parsed.success && parsed.data.input_digest === block.input_digest
      ? [{ fact: parsed.data, source }]
      : [];
  });
  const found = candidates.find(({ fact }) => fact.state === "AVAILABLE" && fact.origin === "ENGINE_DIRECT")
    ?? candidates.find(({ fact }) => fact.state === "AVAILABLE")
    ?? candidates[0];
  if (!found) return undefined;
  const engine = found.fact.origin === "ENGINE_DIRECT";
  return {
    ...found.fact, source: found.source,
    definition_id: key === "sharpe"
      ? engine ? SEALED_PERFORMANCE_DEFINITIONS.engineSharpe : SEALED_PERFORMANCE_DEFINITIONS.portalSharpe
      : engine ? SEALED_PERFORMANCE_DEFINITIONS.engineDecay : SEALED_PERFORMANCE_DEFINITIONS.portalDecay,
  };
}
