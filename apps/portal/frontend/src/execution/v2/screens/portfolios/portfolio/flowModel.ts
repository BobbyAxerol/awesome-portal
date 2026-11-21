/**
 * The capital flow of one environment, as `CapitalFlow` blocks (concept C2, hi-fi "Allocations": funds in, NAV, approved budget,
 * alpha, deployment). Pure: published figures in, nodes and edges out. Nothing here is added, converted or derived.
 *
 * - One block per economic partition (one currency, one domain); a block is never merged with another and no amount crosses blocks.
 * - Funds in: `initial_funds` and `added_funds` of the statements; NAV: `current_nav`; Returned: `returned_capital`.
 *   A budget is a LIMIT, not cash: NAV to Approved budget (`current_budget`) is a dashed `limit` edge, never a band.
 * - Alpha nodes: the server's group by `alpha_id` (`allocation` of the partition). Deployment nodes: the deployment's own published
 *   allocation. Exposure, margin and Net PnL of a deployment are table columns (`flowRows`), each the published string of its source.
 * - A node whose figure is not published is drawn as an absence with its request id; no node is invented to make the sums close.
 * - Headroom: the statements' own `headroom` (hatched, "not deployed"); Net external flows and Recalling are table facts.
 * - TIME (UXM-07 WP-2): each flow states WHEN its amount took effect, from the figure's own published `effective_at_ms` (funding and return
 *   receipts, the budget approval, an alpha's allocation) and, for a deployment, from the last allocation leg of the capital ledger the same tab
 *   reads. A time that is not published says so ("Not published"; a published zero flow says "No receipt"): it is never inferred, and NAV, headroom
 *   and the other derived figures have none of their own. Formatted by `formatInstant` (UTC).
 */
import type { FlowBlock, FlowEdge, FlowNode, FlowTime } from "../../../charts";
import type { CapitalLedger } from "../../../../analytics";
import { formatInstant } from "../../../boundary";
import type { ManagerDataset, ManagerGroup } from "../../../readers/managerDataset";
import type { ManagerMetricRead, ManagerPartition, ManagerPartitionedMetrics } from "../../../readers/managerMetric";
import { DOMAIN_WORD } from "../PartitionFigures";
import { unreadEntries, type AccountView, type DeploymentView, type Environment } from "./model";
import { notPublishedText } from "../../../blocks";

const GAP = notPublishedText("FE-017");
const exact = (metric: ManagerMetricRead | undefined): string | null => (metric !== undefined && metric.kind === "value" ? metric.exact : null);
const partitionKey = (p: ManagerPartition): string => `${p.economicDomain}|${p.currency}|${p.basis}|${p.nativeProfileRef}`;
const sameBook = (a: ManagerPartition, b: ManagerPartition): boolean => partitionKey(a) === partitionKey(b);

const NOT_PUBLISHED_TIME: FlowTime = { text: "Not published", short: null };
const NO_RECEIPT_TIME: FlowTime = { text: "No receipt", short: null };

/** A published instant as the flow prints it: the whole house-style text, and the date part as the diagram caption. */
export function flowTimeOf(ms: number | null | undefined): FlowTime {
  if (ms === null || ms === undefined) return NOT_PUBLISHED_TIME;
  const text = formatInstant(ms);
  return text === "not published" || text === "unreadable instant" ? NOT_PUBLISHED_TIME : { text, short: text.split(" ").slice(0, 2).join(" ") };
}

/** The time of one statement figure: its published `effective_at_ms`; a published exact zero with none is a flow that never happened ("No receipt"), not a missing time. */
function metricTime(metric: ManagerMetricRead | undefined): FlowTime {
  if (metric === undefined) return NOT_PUBLISHED_TIME;
  if (metric.effectiveAtMs !== null) return flowTimeOf(metric.effectiveAtMs);
  return metric.kind === "value" && metric.zero ? NO_RECEIPT_TIME : NOT_PUBLISHED_TIME;
}

/**
 * When each account's allocation last took effect, from the capital ledger the tab already reads: the latest INCREASE leg (initial allocation or
 * allocation) of that account. Only from a COMPLETE ledger (a bounded read may be missing the later leg), and only for an account that serves one
 * deployment of the environment (a shared account's legs belong to no single deployment). Anything else has no entry: not published.
 */
export function allocationTimesByAccount(ledger: CapitalLedger | null, deployments: readonly DeploymentView[]): ReadonlyMap<string, number> {
  const out = new Map<string, number>();
  if (ledger === null || ledger.bounded.hasMore || unreadEntries(ledger) !== 0) return out;
  const users = new Map<string, number>();
  for (const d of deployments) if (d.accountId !== null) users.set(d.accountId, (users.get(d.accountId) ?? 0) + 1);
  for (const bucket of ledger.buckets) for (const entry of bucket.entries) {
    if (entry.direction !== "INCREASE" || (entry.movementType !== "INITIAL_ALLOCATE" && entry.movementType !== "ALLOCATE") || entry.occurredAt === null || users.get(entry.accountId) !== 1) continue;
    const at = Date.parse(entry.occurredAt);
    if (Number.isFinite(at) && at > (out.get(entry.accountId) ?? -Infinity)) out.set(entry.accountId, at);
  }
  return out;
}

/** Deployments of the environment (a canary deployment is in `live`). */
export const deploymentsOf = (deployments: readonly DeploymentView[], environment: Environment): readonly DeploymentView[] =>
  deployments.filter((d) => d.environment === environment);

export interface FlowBlockModel {
  /** The CapitalFlow block. */
  block: FlowBlock;
  partition: ManagerPartition;
  /** Facts that have no band (net external flows, recalling, headroom) as published exact strings, for the table under the diagram. */
  facts: readonly { label: string; value: string | null; time: FlowTime }[];
}

function groupsOf(alphas: ManagerDataset | null): readonly ManagerGroup[] {
  return alphas === null ? [] : alphas.groups.filter((g) => g.key.length === 1 && g.key[0]!.field === "alpha_id" && g.key[0]!.value !== null);
}

/**
 * Blocks of one environment. `statements` is the environment's dataset (its `capital_statements`, one entry per partition);
 * `alphas` its read grouped by `alpha_id`. With no statement entry there is no block (the caller says so once).
 */
export function flowBlocks(environment: Environment, statements: ManagerDataset | null, alphas: ManagerDataset | null, deployments: readonly DeploymentView[], allocationAt: ReadonlyMap<string, number> = new Map()): readonly FlowBlockModel[] {
  if (statements === null) return [];
  const alphaGroups = groupsOf(alphas);
  const deps = deploymentsOf(deployments, environment);
  return statements.capitalStatements.map((entry: ManagerPartitionedMetrics): FlowBlockModel => {
    const partition = entry.partition;
    const id = `${environment}:${partition.economicDomain}:${partition.currency}`;
    const initial = exact(entry.metrics.get("initial_funds"));
    const added = exact(entry.metrics.get("added_funds"));
    const returned = exact(entry.metrics.get("returned_capital"));
    const nav = exact(entry.metrics.get("current_nav"));
    const budget = exact(entry.metrics.get("current_budget"));
    const headroom = exact(entry.metrics.get("headroom"));
    const initialAt = metricTime(entry.metrics.get("initial_funds"));
    const addedAt = metricTime(entry.metrics.get("added_funds"));
    const returnedAt = metricTime(entry.metrics.get("returned_capital"));
    const budgetAt = metricTime(entry.metrics.get("current_budget"));
    const simulated = partition.economicDomain !== "ACTUAL";
    const tone = simulated ? ("sim" as const) : undefined;
    const nodes: FlowNode[] = [];
    const edges: FlowEdge[] = [];
    const node = (n: FlowNode) => nodes.push({ ...n, ...(tone ? { tone } : {}) });
    node({ id: "initial", label: simulated ? "Virtual funds" : "Initial funds", column: 0, value: initial, absent: GAP, tone: tone ?? "series-2", time: initialAt });
    node({ id: "added", label: simulated ? "Virtual funds added" : "Added funds", column: 0, value: added, absent: GAP, tone: tone ?? "series-2", time: addedAt });
    node({ id: "nav", label: "NAV", column: 1, value: nav, absent: GAP });
    node({ id: "returned", label: "Returned", column: 1, value: returned, absent: GAP, tone: tone ?? "series-3", time: returnedAt });
    node({ id: "budget", label: "Approved budget", column: 2, value: budget, absent: GAP, time: budgetAt });
    edges.push({ id: "e-initial", from: "initial", to: "nav", value: initial, time: initialAt });
    edges.push({ id: "e-added", from: "added", to: "nav", value: added, time: addedAt });
    edges.push({ id: "e-returned", from: "nav", to: "returned", value: returned, time: returnedAt });
    edges.push({ id: "e-limit", from: "nav", to: "budget", kind: "limit", value: budget, label: "Limit, not cash", time: budgetAt });
    if (headroom !== null) {
      node({ id: "headroom", label: "Headroom", column: 3, value: headroom, hatched: true, note: "Not deployed" });
      edges.push({ id: "e-headroom", from: "budget", to: "headroom", value: headroom });
    }
    const labelOf = new Map(deps.filter((d) => d.strategyId !== null).map((d) => [d.strategyId as string, d.alphaLabel]));
    for (const group of alphaGroups) {
      const alphaId = group.key[0]!.value as string;
      const line = group.economicPartitions.find((p) => sameBook(p.partition, partition));
      if (line === undefined) continue;
      const nodeId = `alpha:${alphaId}`;
      const value = exact(line.metrics.get("allocation"));
      const alphaAt = metricTime(line.metrics.get("allocation"));
      node({ id: nodeId, label: labelOf.get(alphaId) ?? alphaId, column: 3, value, absent: GAP, time: alphaAt });
      edges.push({ id: `e-${nodeId}`, from: "budget", to: nodeId, value, time: alphaAt });
      for (const dep of deps.filter((d) => d.strategyId === alphaId && d.currency === partition.currency)) {
        const depId = `dep:${dep.deploymentId}`;
        const depAt = flowTimeOf(dep.accountId === null ? null : allocationAt.get(dep.accountId));
        node({ id: depId, label: dep.deploymentId, column: 4, value: dep.allocation, absent: GAP, note: [dep.venue, dep.accountId].filter(Boolean).join(" · ") || undefined, time: depAt });
        edges.push({ id: `e-${depId}`, from: nodeId, to: depId, value: dep.allocation, time: depAt });
      }
    }
    return {
      partition,
      block: { id, label: `${DOMAIN_WORD[partition.economicDomain]} · ${partition.currency}`, basis: simulated ? "simulated" : "real", nodes, edges },
      facts: [
        { label: "Net external flows", value: exact(entry.metrics.get("net_external_flows")), time: metricTime(entry.metrics.get("net_external_flows")) },
        { label: "Recalling", value: exact(entry.metrics.get("recalling")), time: metricTime(entry.metrics.get("recalling")) },
        { label: "Headroom", value: headroom, time: metricTime(entry.metrics.get("headroom")) },
      ],
    };
  });
}

export interface FlowRow {
  deploymentId: string;
  alpha: string;
  account: string | null;
  currency: string | null;
  /** The deployment's budget (its published allocation). */
  budget: string | null;
  exposure: string | null;
  /** The ACCOUNT's initial margin in the deployment's currency (an account may serve several deployments), or `null`. */
  margin: string | null;
  /** The deployment's own position PnL, a current fact. */
  pnl: string | null;
  /** When the deployment's allocation took effect (the ledger's last allocation leg), or why that is not published. */
  time: FlowTime;
}

/** One row per deployment of the environment: the three columns of the hi-fi flow's right edge. Each figure is a published string. */
export function flowRows(environment: Environment, deployments: readonly DeploymentView[], accounts: readonly AccountView[], allocationAt: ReadonlyMap<string, number> = new Map()): readonly FlowRow[] {
  return deploymentsOf(deployments, environment).map((dep) => {
    const account = accounts.find((a) => a.accountId === dep.accountId);
    const margin = account?.margins.find((m) => m.currency === dep.currency)?.initial ?? null;
    return { deploymentId: dep.deploymentId, alpha: dep.alphaLabel, account: dep.accountId, currency: dep.currency, budget: dep.allocation, exposure: dep.exposure, margin, pnl: dep.positionPnl, time: flowTimeOf(dep.accountId === null ? null : allocationAt.get(dep.accountId)) };
  });
}
