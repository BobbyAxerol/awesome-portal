/**
 * Portfolio 360's correlation and capital ledger, served from the Portal's own
 * data instead of an upstream that answers 503 on this profile.
 *
 * Both screens' panels were typed-unavailable on dev because
 * `/internal/v1/screens/portfolio-360/{id}/correlation` and `/capital-ledger`
 * return 503 there. The facts, though, are already inside the Portal:
 *
 *   * correlation comes from the same 90-day daily closes the analytics
 *     envelope computes its pairs from, scoped to the strategies this
 *     portfolio actually deploys;
 *   * the capital ledger comes from the `portfolio-capital-ledger` relation,
 *     which answers — it is what the Overview's Configuration log already
 *     draws.
 *
 * Two rules this file holds to, because both decide whether a number is
 * trustworthy rather than merely present:
 *
 *   1. **`direction` is read from the allocation, not the amount.** The
 *      contract's own reader refuses a direction the client would have to
 *      guess, and warns that the sign of `amount` is not the movement. Here it
 *      is decided by comparing the published `before_allocated` with the
 *      published `after_allocated` — two figures the source states — and where
 *      either is missing the entry is dropped rather than guessed at.
 *   2. **Gross totals describe the validated population**, not the page. A
 *      screen saying "12 of 4,180" beside a total is only honest if the total
 *      counts all 4,180, so the counts and the totals are taken from the same
 *      set of rows the walk actually validated, and `has_more` says whether
 *      more exist.
 */
import { Inject, Injectable, Optional } from "@nestjs/common";

import { AnalyticsProxyError } from "./analytics.proxy";
import {
  LocalQueryAnalyticsService,
  compareDecimal,
} from "./local-query-analytics.service";
import {
  MaximumDataOperationError,
  MaximumDataOperationService,
} from "./maximum-data-operation.service";
import { ExecutionProfileProjectionRepository, ProjectionEnvironment } from "./profile-projection.repository";
import { CONTROL_API_CONFIG } from "../tokens";
import type { ControlApiConfig } from "../config";
import type { AuthSession, PortalUser } from "../domain";

export interface Portfolio360Principal {
  user: PortalUser;
  session: AuthSession;
  workspaceId: string;
}

/** One relation page's worth of rows, already unwrapped from the record envelope. */
type Row = Record<string, unknown>;

const text = (row: Row, key: string): string | null => {
  const value = row[key];
  return typeof value === "string" && value.length > 0 ? value
    : typeof value === "number" && Number.isFinite(value) ? String(value) : null;
};

const DECIMAL = /^-?\d+(\.\d+)?$/;

/** A published decimal, or null. Never coerced: a value we cannot read is absent. */
const decimalOf = (row: Row, key: string): string | null => {
  const raw = row[key];
  return typeof raw === "string" && raw.length <= 128 && DECIMAL.test(raw) ? raw : null;
};

const millis = (row: Row, key: string): number | null => {
  const value = row[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const at = Date.parse(value);
    if (Number.isFinite(at)) return at;
  }
  return null;
};

/** Exact decimal addition on strings — no float ever touches a capital figure. */
function addExact(left: string, right: string): string {
  const scale = Math.max(
    (left.split(".")[1] ?? "").length,
    (right.split(".")[1] ?? "").length,
  );
  const lift = (value: string): bigint => {
    const negative = value.startsWith("-");
    const [whole, fraction = ""] = (negative ? value.slice(1) : value).split(".");
    const digits = BigInt(whole + fraction.padEnd(scale, "0"));
    return negative ? -digits : digits;
  };
  const total = lift(left) + lift(right);
  if (scale === 0) return total.toString();
  const negative = total < 0n;
  const digits = (negative ? -total : total).toString().padStart(scale + 1, "0");
  return `${negative ? "-" : ""}${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
}

const MOVEMENTS = new Set(["INITIAL_ALLOCATE", "ALLOCATE", "WITHDRAW", "REBALANCE", "ADJUST"]);

/** The relation page cap this service walks with. */
const LEDGER_PAGE = 200;
const LEDGER_MAX_PAGES = 8;

/** The retained relation the equity standings are read from. */
const PORTFOLIO_EQUITY_RELATION = "manager.performance:portfolio_equity_snapshots";

@Injectable()
export class Portfolio360LocalService {
  constructor(
    @Inject(LocalQueryAnalyticsService) private readonly analytics: LocalQueryAnalyticsService,
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
    @Inject(ExecutionProfileProjectionRepository)
    private readonly projections: ExecutionProfileProjectionRepository,
    @Optional()
    @Inject(MaximumDataOperationService)
    private readonly operations?: MaximumDataOperationService,
  ) {}

  enabled(): boolean {
    return this.analytics.enabled();
  }

  /**
   * Pairwise return correlation among the strategies this portfolio deploys.
   *
   * The coefficients are the ones the analytics envelope already publishes;
   * nothing is recomputed here, only selected. A portfolio deploying fewer
   * than two strategies with overlapping history has no pair to show, and says
   * so as an empty ranked set rather than an error.
   */
  async correlation(principal: Portfolio360Principal, portfolioId: string, environment: ProjectionEnvironment = "paper"): Promise<Record<string, unknown>> {
    const context = await this.portfolioContext(principal, portfolioId, environment);
    const { statistics, strategies, version, readAt } = context;
    const mine = new Set(strategies);
    const pairs = (statistics?.correlation.pairs ?? [])
      .filter((pair) => mine.has(pair.left_alpha) && mine.has(pair.right_alpha))
      .sort((left, right) => Math.abs(right.correlation) - Math.abs(left.correlation))
      .map((pair) => ({
        left_id: pair.left_alpha,
        right_id: pair.right_alpha,
        // The reader takes coefficients as exact decimal strings.
        coefficient: pair.correlation.toFixed(6),
        sample_count: pair.overlapping_days,
      }));

    return this.envelope({
      formulaVersion: "portfolio-correlation-returns.v1",
      ...context,
      environment,
      panelState: pairs.length > 0 ? "ok" : "empty",
      version,
      readAt,
      windowDays: statistics?.window.days ?? null,
      data: {
        portfolio_id: portfolioId,
        labels: [...mine].sort().map((id) => ({ entity_id: id, display_name: id })),
        // Clustering is a judgement about which alphas belong together, and no
        // source publishes one. An empty list is the honest answer; inventing
        // clusters from the coefficients would be this service deciding the
        // portfolio's structure.
        clusters: [],
        representation: { kind: "RANKED_PAIRS", pairs },
      },
    });
  }

  /**
   * Phase 1: every portfolio's first and last published equity, in one read.
   *
   * The Overview's Cross-portfolio panel used to build this in the browser by
   * draining the whole equity relation. On dev that is 6,918 rows over 35
   * pages and 37 seconds, and the panel sat in `loading` the whole time — the
   * one state a reader cannot act on, because it promises an answer that never
   * came. The store answers the same question with two ordered index walks.
   *
   * Rows are keyed by **(portfolio, currency)**. `portfolio_types_pool`
   * publishes a USDT and a VND series on dev, and a per-portfolio row would
   * pair a first equity in one currency with a last equity in the other.
   */
  async crossEquity(principal: Portfolio360Principal, portfolioId: string, environment: ProjectionEnvironment = "paper"): Promise<Record<string, unknown>> {
    const context = await this.portfolioContext(principal, portfolioId, environment);
    const { version, readAt } = context;
    const workspaceId = this.config.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID;
    const profileId = environment === "paper" ? this.config.EXECUTION_EDGE_PAPER_PROFILE_ID
      : environment === "sandbox" ? this.config.EXECUTION_EDGE_SANDBOX_PROFILE_ID : this.config.EXECUTION_EDGE_LIVE_PROFILE_ID;
    if (!workspaceId || !profileId) {
      throw new AnalyticsProxyError("PHASE2_PROJECTION_PROFILE_NOT_CONFIGURED", 503);
    }
    const standings = await this.projections.portfolioEquityStandings(
      workspaceId, environment, profileId, PORTFOLIO_EQUITY_RELATION,
    );
    return this.envelope({
      formulaVersion: "portfolio-cross-equity.v1",
      ...context,
      environment,
      panelState: standings.length > 0 ? "ok" : "empty",
      version,
      readAt,
      windowDays: null,
      data: {
        portfolio_id: portfolioId,
        // The reader takes every figure as the source published it; this
        // service does no subtraction, and `net_pnl` is the engine's own.
        rows: standings.map((row) => ({
          portfolio_id: row.portfolioId,
          currency: row.currency,
          first_equity: row.firstEquity,
          last_equity: row.lastEquity,
          net_pnl: row.netPnl,
          point_count: row.points,
          first_at: row.firstTs,
          last_at: row.lastTs,
          is_self: row.portfolioId === portfolioId,
        })),
        row_count: standings.length,
      },
    });
  }

  /**
   * The portfolio's capital movements, bucketed by the currency they were
   * moved in — never summed across currencies.
   */
  async capitalLedger(principal: Portfolio360Principal, portfolioId: string, environment: ProjectionEnvironment = "paper"): Promise<Record<string, unknown>> {
    const context = await this.portfolioContext(principal, portfolioId, environment);
    const { version, readAt } = context;
    const { rows, hasMore, freshness, asOf, complete, reason } = await this.ledgerRows(principal, portfolioId, environment);

    const buckets = new Map<string, {
      entries: Record<string, unknown>[];
      grossIncrease: string;
      grossDecrease: string;
    }>();
    for (const row of rows) {
      const currency = text(row, "currency");
      const ledgerId = text(row, "capital_ledger_id") ?? text(row, "ledger_id");
      const accountId = text(row, "account_id");
      const movement = text(row, "movement_type");
      const amount = decimalOf(row, "amount");
      const before = decimalOf(row, "before_allocated");
      const after = decimalOf(row, "after_allocated");
      if (!currency || !ledgerId || !accountId || !movement || !MOVEMENTS.has(movement)) continue;
      if (amount === null || before === null || after === null) continue;

      // Direction from the two published allocations, never from the amount's
      // sign: a withdrawal and a deposit can both carry a positive amount.
      const delta = compareDecimal(after, before);
      const direction = delta > 0 ? "INCREASE" : delta < 0 ? "DECREASE" : "UNCHANGED";

      const bucket = buckets.get(currency) ?? { entries: [], grossIncrease: "0", grossDecrease: "0" };
      bucket.entries.push({
        ledger_id: ledgerId,
        allocation_id: text(row, "allocation_id"),
        account_id: accountId,
        movement_type: movement,
        direction,
        amount,
        before_allocated: before,
        after_allocated: after,
        occurred_at: millis(row, "created_at") === null
          ? null
          : new Date(millis(row, "created_at")!).toISOString(),
      });
      if (direction === "INCREASE") bucket.grossIncrease = addExact(bucket.grossIncrease, amount);
      if (direction === "DECREASE") bucket.grossDecrease = addExact(bucket.grossDecrease, amount);
      buckets.set(currency, bucket);
    }

    const entryCount = [...buckets.values()].reduce((total, bucket) => total + bucket.entries.length, 0);
    const visibleIds = new Set([...buckets.values()].flatMap(bucket => bucket.entries)
      .sort((left,right) => String(right.occurred_at ?? "").localeCompare(String(left.occurred_at ?? "")) ||
        String(left.ledger_id).localeCompare(String(right.ledger_id)))
      .slice(0,250).map(entry=>entry.ledger_id));
    return this.envelope({
      formulaVersion: "portfolio-capital-ledger.v1",
      ...context,
      environment,
      inputAsOf: asOf,
      inputFreshness: freshness,
      inputCompleteness: complete && entryCount === rows.length ? "COMPLETE" : "PARTIAL",
      panelState: entryCount > 0 ? "ok" : "empty",
      version,
      readAt,
      windowDays: null,
      data: {
        portfolio_id: portfolioId,
        buckets: [...buckets.entries()]
          .sort((left, right) => right[1].entries.length - left[1].entries.length)
          .map(([currency, bucket]) => ({
            currency,
            entry_count: bucket.entries.length,
            gross_increase: bucket.grossIncrease,
            gross_decrease: bucket.grossDecrease,
            // Newest first: an operator asking what changed reads downwards.
            entries: bucket.entries.filter(entry=>visibleIds.has(entry.ledger_id)).sort((left, right) =>
              String(right.occurred_at ?? "").localeCompare(String(left.occurred_at ?? ""))),
          })),
        entry_count: entryCount,
        returned_entry_count: visibleIds.size,
        has_more: hasMore || entryCount > visibleIds.size,
        window: "LATEST",
        rejected_row_count: rows.length - entryCount,
        reason_code: reason,
      },
    });
  }

  /** Walk the ledger relation for one portfolio, bounded. */
  private async ledgerRows(
    principal: Portfolio360Principal,
    portfolioId: string,
    environment: ProjectionEnvironment,
  ) {
    if (!this.operations) throw new AnalyticsProxyError("ANALYTICS_LEDGER_NOT_CONFIGURED", 503);
    const rows: Row[] = [];
    let freshness = "OK";
    let asOf: string | null = null;
    let complete = true;
    let reason: string | null = null;
    const result = (hasMore: boolean) => ({ rows, hasMore, freshness, asOf, complete: complete && !hasMore, reason });
    let cursor: string | undefined;
    for (let page = 0; page < LEDGER_MAX_PAGES; page += 1) {
      let response: Record<string, unknown>;
      try {
        response = await this.operations.relationPage(
          principal,
          "portfolio-capital-ledger",
          { environment, limit: LEDGER_PAGE, ...(cursor ? { cursor } : {}) },
        ) as Record<string, unknown>;
      } catch (error) {
        // A refused page is not an empty ledger. Rows already read are kept and
        // reported as incomplete; nothing is invented for the pages we lost.
        if (error instanceof MaximumDataOperationError) {
          if (rows.length === 0) throw new AnalyticsProxyError("ANALYTICS_LEDGER_SOURCE_UNAVAILABLE", 503);
          reason = "ANALYTICS_LEDGER_PAGE_UNAVAILABLE";
          freshness = "UNKNOWN";
          return result(true);
        }
        throw error;
      }
      const records = Array.isArray(response.records) ? response.records : [];
      const metadata = (response.source_health ?? {}) as Record<string, unknown>;
      if (metadata.freshness === "STALE") freshness = "STALE";
      else if (metadata.freshness !== "FRESH" && metadata.freshness !== "AGING" && freshness !== "STALE") freshness = "UNKNOWN";
      complete = complete && metadata.completeness === "COMPLETE";
      const stamp = metadata.as_of_ms;
      if (typeof stamp === "number" && Number.isSafeInteger(stamp) && Math.abs(stamp) <= 8.64e15) {
        const value = new Date(stamp).toISOString();
        if (asOf === null || value < asOf) asOf = value;
      } else { complete = false; freshness = freshness === "STALE" ? freshness : "UNKNOWN"; }
      for (const record of records) {
        const values = (record as Record<string, unknown> | null)?.values;
        if (typeof values !== "object" || values === null) continue;
        const row = values as Row;
        if (text(row, "portfolio_id") === portfolioId) rows.push(row);
      }
      const pageInfo = (response.page ?? {}) as Record<string, unknown>;
      const next = typeof pageInfo.next_cursor === "string" ? pageInfo.next_cursor : null;
      if (pageInfo.has_more !== true) return result(false);
      if (!next || next === cursor) { reason = "ANALYTICS_LEDGER_CONTINUATION_MISSING"; return result(true); }
      cursor = next;
    }
    reason = "ANALYTICS_LEDGER_BOUNDED_POPULATION";
    return result(true);
  }

  /** The portfolio's strategies and the fleet statistics, from one snapshot read. */
  private async portfolioContext(principal: Portfolio360Principal, portfolioId: string, environment: ProjectionEnvironment) {
    if (!this.enabled()) throw new AnalyticsProxyError("ANALYTICS_DISABLED", 404);
    const view = await this.analytics.portfolioView({ workspaceId: principal.workspaceId }, portfolioId, environment);
    return { ...view, readAt: new Date().toISOString() };
  }

  /** The analytics envelope every 360 panel reads its provenance from. */
  private envelope(input: {
    formulaVersion: string;
    panelState: string;
    version: string;
    readAt: string;
    windowDays: number | null;
    data: Record<string, unknown>;
    environment: ProjectionEnvironment;
    inputAsOf: string | null;
    inputFreshness: string;
    inputCompleteness: string;
  }): Record<string, unknown> {
    const [epoch, sequence] = input.version.split(":");
    return {
      schema_version: "portal.execution.portfolio-360-local.v1",
      environment: input.environment,
      epoch_id: epoch ?? null,
      source_snapshot_id: input.version,
      capability_snapshot_id: input.version,
      // Named so a reader can tell this apart from the upstream analytics cell
      // without having to compare numbers to find out.
      source_profile: "PORTAL_LOCAL_PROJECTION",
      projection_sequence: Number.isFinite(Number(sequence)) ? Number(sequence) : null,
      freshness_policy_version: "portal.execution.local-projection.v1",
      read_at: input.readAt,
      analytics: {
        schema_version: "execution.analytics.v1",
        formula_version: input.formulaVersion,
        source_authority: "DERIVED",
        input_freshness_floor: input.inputFreshness,
        panel_state: input.panelState,
        input_completeness: input.inputCompleteness === "COMPLETE" && input.data.has_more !== true ? "COMPLETE" : "PARTIAL",
        input_as_of: input.inputAsOf,
        ...(input.windowDays === null ? {} : { window: `${input.windowDays}d` }),
        warnings: [],
        data: input.data,
      },
    };
  }
}
