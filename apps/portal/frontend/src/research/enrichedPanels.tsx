/**
 * Screen 04 — the panels drawn from the `enrich_analysis` block.
 *
 * Adapters turn the guarded block (`enrichedAnalysis.ts`) into the shapes the existing panels
 * already read, so the figure, the Behavior grid, the monthly strip and the histogram stay one
 * implementation whichever source feeds them. The only new surface is the drawdown-episodes card.
 * Nothing here computes a number: depths, durations and dates are the server's, printed as served.
 */

import { FeLocalAbsent, Withheld } from "./EvidenceFlow";
import type { EvidenceSeries, MonthlyReturnPoint } from "./evidenceClient";
import type { V2Core } from "./analyticsV2";
import {
  ENRICHED_CHIP,
  episodeLabel,
  regimeAbsence,
  type EnrichedAnalysis,
  type EnrichedEpisode,
  type EnrichedRead,
  type EnrichedRefusal,
} from "./enrichedAnalysis";
import { formatMetric, shortDigest } from "./researchFormat";
import { utcZ } from "./EvidenceCharts";

const PANEL = { borderColor: "var(--line)", background: "var(--paper-raised)", boxShadow: "var(--shadow-e1)" } as const;

/** The block's facts, curves and locators in the shape the all-time cells read. */
export function enrichedAsCore(block: EnrichedAnalysis): V2Core {
  return {
    input_digest: block.input_digest,
    scope_locator: block.scope.locator,
    benchmark_locator: block.scope.benchmark_locator,
    /* The block discloses `longest_open`; with no episodes published there is nothing to say and no mark is drawn. */
    drawdown_recovered: block.drawdown_episodes.state === "AVAILABLE" ? !block.drawdown_episodes.longest_open : null,
    metrics: block.facts.metrics,
    behaviour: block.facts.behaviour,
    strategy_curve: block.curves.strategy_rebased_100,
    benchmark_curve: block.curves.benchmark_rebased_100,
  };
}

/** A monthly value as the block serves it: the Hub's point plus the partial-month facts. */
export type EnrichedMonthPoint = MonthlyReturnPoint & {
  partial: boolean;
  observation_count: number;
  expected_observation_count: number;
};

const seriesFrame = (block: EnrichedAnalysis, kind: "MONTHLY_RETURNS" | "RETURN_DISTRIBUTION", emitted: number, sourceCount: number, values: unknown[]): EvidenceSeries =>
  ({
    schema_version: "research.evidence-series.v1",
    run_id: block.run_id,
    revision: null,
    etag: null,
    kind,
    availability: { state: "AVAILABLE", reason_code: null },
    source_sample: { source_observation_count: sourceCount, emitted_point_count: emitted, sampling: null },
    values,
  }) as unknown as EvidenceSeries;

/**
 * The monthly strip from the block, or `null` when the block does not publish it (the series
 * endpoint then stays the source and its typed absence stays the answer).
 */
export function enrichedMonthly(block: EnrichedAnalysis): EvidenceSeries | null {
  const m = block.monthly_returns;
  if (m.state !== "AVAILABLE" || m.values.length === 0) return null;
  const values: EnrichedMonthPoint[] = m.values.map((row) => ({
    month_start_utc_ms: row.month_start_utc_ms,
    return_fraction: row.return_fraction,
    partial: row.partial,
    observation_count: row.observation_count,
    expected_observation_count: row.expected_observation_count,
  }));
  return seriesFrame(block, "MONTHLY_RETURNS", values.length, block.scope.observation_count, values);
}

/** The histogram from the block, or `null` when it is not published. */
export function enrichedDistribution(block: EnrichedAnalysis): EvidenceSeries | null {
  const d = block.return_distribution;
  if (d.state !== "AVAILABLE" || d.buckets.length === 0) return null;
  const values = d.buckets.map((bucket) => ({
    lower_inclusive: bucket.lower_inclusive,
    upper: bucket.upper,
    upper_inclusive: bucket.upper_inclusive,
    /* The block's counts are integers; the shared chart reads the legacy string form, so only the type is adapted here. */
    count: String(bucket.count),
  }));
  return seriesFrame(block, "RETURN_DISTRIBUTION", values.length, d.observation_count, values);
}

/** The typed absence of a block the service served without values: its state and its own reason, never the series route's. */
export function enrichedAbsence(block: EnrichedAnalysis, kind: "MONTHLY_RETURNS" | "RETURN_DISTRIBUTION"): { state: "NOT_PUBLISHED" | "NOT_APPLICABLE"; reason_code: string | null } | null {
  const head = kind === "MONTHLY_RETURNS" ? block.monthly_returns : block.return_distribution;
  if (head.state === "AVAILABLE") return null;
  return { state: head.state, reason_code: head.reason_code };
}

/** Sampled coverage: not a complete daily ledger. Drawn only when the block declares it. */
export function SampledChip({ block }: { block: EnrichedAnalysis }) {
  if (block.scope.coverage !== "SAMPLED_RETAINED_EQUITY") return null;
  const title = `sampled · ${formatMetric(block.scope.observation_count, "count")} of ${formatMetric(block.scope.source_observation_count, "count")} source observations · not a full daily ledger`;
  return (
    <span
      className="mono rounded-[3px] border px-1.5 text-[9.5px]"
      style={{ color: "var(--accent-2)", borderColor: "var(--line-soft)" }}
      data-coverage-chip={block.scope.coverage}
      title={title}
      aria-label={title}
    >
      sampled
    </span>
  );
}

/** The provenance chip every panel drawn from the block carries; the tooltip names the service's inputs. */
export function EnrichedChip({ block, extra }: { block: EnrichedAnalysis; extra?: string }) {
  const tables = block.source_tables.map((table) => `${table.name} · ${formatMetric(table.row_count, "count")} rows · ${shortDigest(table.digest)}`);
  return (
    <span className="ml-auto inline-flex items-center gap-1">
    <SampledChip block={block} />
    <span
      className="mono rounded-[3px] border px-1.5 text-[9.5px]"
      style={{ color: "var(--ink-faint)", borderColor: "var(--line-soft)" }}
      data-enriched-chip
      title={[
        `${ENRICHED_CHIP} · ${block.scope.window} · ${formatMetric(block.scope.observation_count, "count")} observations · ${formatMetric(block.scope.fold_count, "count")} folds`,
        extra ?? null,
        block.scope.locator,
        `input ${shortDigest(block.input_digest)}`,
        ...tables,
      ]
        .filter((part): part is string => part !== null)
        .join("\n")}
    >
      portal-derived · {block.scope.window}
    </span>
    </span>
  );
}

const REFUSAL_WORDS: Record<EnrichedRefusal, string> = {
  UI_ENRICHED_ANALYSIS_NOT_AN_OBJECT: "not a block",
  UI_ENRICHED_ANALYSIS_SCHEMA_UNKNOWN: "unknown schema",
  UI_ENRICHED_ANALYSIS_BASIS_NOT_ALL_TIME: "basis is not all time",
  UI_ENRICHED_ANALYSIS_HAS_ROLLING: "carries a rolling block",
  UI_ENRICHED_ANALYSIS_SHAPE_INVALID: "shape invalid",
};

/** A served block this screen will not draw: one line, the marker in a data attribute, the path in the tooltip. */
export function EnrichedRefusedLine({ read }: { read: EnrichedRead }) {
  if (read.kind !== "refused") return null;
  return (
    <p className="text-[11px]" data-enriched-refused={read.reason}>
      <FeLocalAbsent id={read.reason} what="enrich_analysis" text={`refused — ${REFUSAL_WORDS[read.reason]}`} />
      <span className="sr-only">{read.detail}</span>
    </p>
  );
}

/* ------------------------------------------------------- drawdown episodes */

const DAY = (ms: number) => new Date(ms).toISOString().slice(0, 10);

function EpisodeRow({ block, episode, rank }: { block: EnrichedAnalysis; episode: EnrichedEpisode; rank: number }) {
  const open = episode.recovery_utc_ms === null;
  const depth = formatMetric(episode.depth_fraction, "fraction");
  const duration = formatMetric(episode.duration_seconds, "seconds");
  const label = episodeLabel(episode);
  const title = [
    `episode ${rank} · ${block.drawdown_episodes.origin.toLowerCase().replace(/_/g, "-")} · all time`,
    label !== null ? `label ${label} (descriptive, from the served path)` : null,
    episode.regime !== undefined ? `market regime not published · ${episode.regime.reason_code} · ${episode.regime.source_locator}` : null,
    `start ${utcZ(episode.start_utc_ms)}`,
    `trough ${utcZ(episode.trough_utc_ms)}`,
    open ? "recovery open at the end of the scope" : `recovery ${utcZ(episode.recovery_utc_ms)}`,
    `depth exact ${episode.depth_fraction}`,
    `duration ${formatMetric(episode.duration_seconds, "count")} s`,
    block.scope.locator,
    `input ${shortDigest(block.input_digest)}`,
  ].filter((part): part is string => part !== null).join("\n");
  return (
    <tr data-episode={rank} data-episode-open={open ? "true" : "false"} title={title} aria-label={title.replace(/\n/g, ", ")}>
      <td className="mono py-0.5 pr-2 text-[10.5px]">
        {DAY(episode.start_utc_ms)}
        {label !== null ? <span className="ml-1.5 text-[9.5px]" style={{ color: "var(--ink-faint)" }} data-episode-label>{label}</span> : null}
      </td>
      <td className="mono py-0.5 pr-2 text-right text-[10.5px] font-semibold" style={{ color: "var(--bad)", fontVariantNumeric: "tabular-nums" }} data-exact={episode.depth_fraction}>
        {depth ?? episode.depth_fraction}
      </td>
      <td className="mono py-0.5 pr-2 text-right text-[10.5px]" style={{ fontVariantNumeric: "tabular-nums" }}>
        {duration ?? `${episode.duration_seconds} s`}
      </td>
      <td className="mono py-0.5 text-right text-[10.5px]" style={{ color: open ? "var(--accent-2)" : "var(--ink)" }}>
        {open ? "open" : DAY(episode.recovery_utc_ms as number)}
      </td>
    </tr>
  );
}

/**
 * "Drawdown episodes": the deepest episodes the service published, with their recovery or "open".
 * A block with no episodes is one line of typed absence, never an empty frame. `total` is the
 * server's count of all episodes; the card says "top n / total" when it shows fewer.
 */
export function DrawdownEpisodes({ block }: { block: EnrichedAnalysis }) {
  const head = block.drawdown_episodes;
  if (head.state !== "AVAILABLE" || head.values.length === 0) {
    return (
      <p className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-[11px]" data-drawdown-episodes="absent" data-reason-code={head.reason_code ?? undefined}>
        <Withheld
          availability={{ state: head.state === "AVAILABLE" ? "NOT_PUBLISHED" : head.state, reason_code: head.reason_code }}
          what="drawdown episodes"
        />
      </p>
    );
  }
  const shown = head.values.length;
  const regime = regimeAbsence(block);
  return (
    <section
      className="flex min-w-0 flex-col gap-1.5 rounded-[8px] border p-3.5"
      data-drawdown-episodes="ready"
      style={PANEL}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[10px] font-medium uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)", fontFamily: "var(--font-body)" }}>
          drawdown episodes
        </h3>
        <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }} data-episodes-count title={`${ENRICHED_CHIP} · ${head.origin.toLowerCase().replace(/_/g, "-")}\n${block.scope.locator}`}>
          {shown < head.total ? `top ${shown} / ${formatMetric(head.total, "count")}` : formatMetric(head.total, "count")}
          {" · "}
          <span
            data-open-episode={head.open_episode_present ? "true" : "false"}
            data-longest-open={head.longest_open ? "true" : "false"}
            style={head.open_episode_present ? { color: "var(--accent-2)" } : undefined}
            title={head.open_episode_present ? "An episode is still below its prior peak at the end of the scope." : "Every episode recovered by the end of the scope."}
          >
            {head.open_episode_present ? (head.longest_open ? "open · longest" : "open") : "all recovered"}
          </span>
        </span>
      </div>
      <table className="w-full border-collapse" data-episodes-table>
        <thead>
          <tr className="text-[9px] uppercase tracking-[.06em]" style={{ color: "var(--ink-faint)" }}>
            <th className="pr-2 text-left font-normal" scope="col">start</th>
            <th className="pr-2 text-right font-normal" scope="col">depth</th>
            <th className="pr-2 text-right font-normal" scope="col">duration</th>
            <th className="text-right font-normal" scope="col">recovered</th>
          </tr>
        </thead>
        <tbody>
          {head.values.map((episode, index) => (
            <EpisodeRow key={`${episode.start_utc_ms}-${index}`} block={block} episode={episode} rank={index + 1} />
          ))}
        </tbody>
      </table>
      {regime !== null ? (
        <p className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }} data-episode-regime="NOT_PUBLISHED" data-reason-code={regime.reason_code} title={regime.source_locator}>
          market regime — not published · {regime.reason_code}
        </p>
      ) : null}
    </section>
  );
}

/** The underwater strip's points, in the shape the shared drawdown chart reads (it uses time and drawdown only). */
export function underwaterPoints(block: EnrichedAnalysis): { at_utc_ms: number; equity: string; drawdown_fraction: string }[] | null {
  const curve = block.curves.drawdown_fraction;
  if (curve.length === 0) return null;
  return curve.map((point) => ({ at_utc_ms: point.at_utc_ms, equity: point.value, drawdown_fraction: point.value }));
}
