/**
 * The Compare metric cells that come from the Manager dataset (`getManagerDataset({surface: "PORTFOLIO", id})`), one read per compared
 * portfolio, on ONE basis (the currency of the first comparable pick).
 *
 * - NAV: `capital_statements[].metrics.current_nav`, one cell per economic partition of the basis currency. A capital statement is not
 *   the table's allocation or PnL and is never relabelled as such.
 * - Net PnL: the group total the dataset publishes for the portfolio (`groups[]` by `portfolio_id`, `net_pnl` per partition). The total
 *   is the SERVER's; nothing here adds rows or partitions.
 * - Return and Max drawdown: no portfolio-level key exists in the dataset (`return_30d_pct` is per alpha row; drawdown has none), so
 *   they stay `Not published` with their request ids.
 * - Score: the policy words of `scores.*`, never a number (the score policy is not set).
 *
 * A partition in another currency than the basis is not drawn; its tag is listed so the omission is visible, never converted.
 */
import type { ReactNode } from "react";

import type { ManagerDataset, ManagerScoreSlot } from "../../readers/managerDataset";
import type { ManagerPartitionedMetrics } from "../../readers/managerMetric";
import { NaWhy } from "../../blocks";
import { PartitionFigures, partitionTag } from "../fleet/PartitionFigures";
import { humanize } from "../fleet/fleetModel";
import type { DatasetReadState } from "../manager/useManagerDataset";
import { PF_FE, npText, type Unpublished } from "../portfolios/fe";
import { Absent } from "../portfolios/format";

export interface DatasetCellContext {
  /** The dataset read of each comparable portfolio, by portfolio id. */
  reads: ReadonlyMap<string, DatasetReadState>;
  /** The basis currency; partitions in another currency are not drawn. */
  currency: string | null;
}

const reasonOf = (state: DatasetReadState): string | null =>
  state.phase === "error" ? `The Manager dataset could not be read (${state.reason}).` : null;

/** Partitions on the basis currency, and the tags of those left out. */
export function onBasis(list: readonly ManagerPartitionedMetrics[], currency: string | null): { shown: readonly ManagerPartitionedMetrics[]; omitted: readonly string[] } {
  if (currency === null) return { shown: list, omitted: [] };
  return {
    shown: list.filter((entry) => entry.partition.currency === currency),
    omitted: list.filter((entry) => entry.partition.currency !== currency).map(partitionTag),
  };
}

function Figures({ list, currency, metricKey, gap, signed }: { list: readonly ManagerPartitionedMetrics[]; currency: string | null; metricKey: string; gap: Unpublished; signed?: boolean }): ReactNode {
  if (!list.some((entry) => entry.metrics.has(metricKey))) return <Absent reason={`${npText(gap)}: the dataset publishes no ${metricKey} for this portfolio.`} />;
  const { shown, omitted } = onBasis(list, currency);
  return (
    <>
      <PartitionFigures partitions={shown} metricKey={metricKey} metricKeys={null} gap={gap} signed={signed} />
      {omitted.length > 0 ? <span className="exec-pf-dim" title="Another currency is never converted or added to the basis"> Not shown on this basis: {omitted.join(", ")}</span> : null}
    </>
  );
}

function pending(state: DatasetReadState | undefined, gap: Unpublished): ReactNode | null {
  if (state === undefined) return <Absent reason={`${npText(gap)}: this portfolio is not on the comparison basis.`} />;
  if (state.phase === "idle" || state.phase === "loading") return <span className="exec-pf-dim">Loading</span>;
  // A failed read is the same absence as before the dataset existed: Not available, and the request that publishes it plus the failure.
  if (state.phase === "error") return <Absent reason={`${npText(gap)}: ${reasonOf(state) ?? ""}`} />;
  return null;
}

export function NavCell({ id, ctx }: { id: string; ctx: DatasetCellContext }): ReactNode {
  const state = ctx.reads.get(id);
  const wait = pending(state, PF_FE.nav);
  if (wait !== null || state === undefined || state.phase !== "ready") return wait;
  return <Figures list={state.value.capitalStatements} currency={ctx.currency} metricKey="current_nav" gap={PF_FE.nav} />;
}

export function NetPnlCell({ id, ctx }: { id: string; ctx: DatasetCellContext }): ReactNode {
  const state = ctx.reads.get(id);
  const wait = pending(state, PF_FE.netPnl);
  if (wait !== null || state === undefined || state.phase !== "ready") return wait;
  const dataset: ManagerDataset = state.value;
  // The portfolio's own group (the dataset was asked to group by portfolio_id); no group means no total was published.
  const group = dataset.groups.find((entry) => entry.key.length === 1 && entry.key[0]!.field === "portfolio_id" && entry.key[0]!.value === id);
  if (group === undefined) return <Absent reason={`${npText(PF_FE.netPnl)}: the dataset published no total for this portfolio.`} />;
  return <Figures list={group.economicPartitions} currency={ctx.currency} metricKey="net_pnl" gap={PF_FE.netPnl} signed />;
}

const SCORE_SLOTS = [["Raw", "raw"], ["Composition", "composition"], ["Direct NAV", "directNav"]] as const;
const slotWord = (slot: ManagerScoreSlot): string => humanize(slot.status);

/** The score is policy text, not a figure: one phrase when the three slots agree, otherwise each slot by name. */
export function ScoreCell({ id, ctx }: { id: string; ctx: DatasetCellContext }): ReactNode {
  const state = ctx.reads.get(id);
  const wait = pending(state, PF_FE.score);
  if (wait !== null || state === undefined || state.phase !== "ready") return wait;
  const scores = state.value.scores;
  const words = SCORE_SLOTS.map(([label, key]) => ({ label, word: slotWord(scores[key]) }));
  const same = words.every((entry) => entry.word === words[0]!.word);
  const text = same ? words[0]!.word : words.map((entry) => `${entry.label}: ${entry.word}`).join(" · ");
  return <NaWhy reason={`${npText(PF_FE.score)} · ${scores.reasonCode}`} text={text} className="exec-pf-dim" />;
}

export function GapCell({ fact, why }: { fact: Unpublished; why: string }): ReactNode {
  return <NaWhy className="" reason={`${npText(fact)}: ${why}`} />;
}
