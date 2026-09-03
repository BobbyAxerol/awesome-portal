import { randomUUID } from "node:crypto";
import { Inject, Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from "@nestjs/common";
import { ControlApiConfig } from "../config";
import { ManagerPage, ManagerReadContext, managerPage } from "../paper-read/manager-records";
import { CONTROL_API_CONFIG } from "../tokens";
import { ExecutionCurrentSourceProxy } from "./current-source.proxy";
import { enforceProfileLineage } from "./profile-lineage";
import { profileProjectionCatalog, ProfileProjectionBinding, WARM_WINDOW_DAYS, WARM_WINDOW_MAX_ROWS } from "./profile-projection.catalog";
import {
  ExecutionProfileProjectionRepository,
  ProfileProjectionDocument,
  ProjectionCompleteness,
  ProjectionEnvironment,
  projectionDigest, ProjectionRow } from "./profile-projection.repository";

const SOURCE_CONTRACT_REVISION = "trading-system.portal-execution.manager-v2.runtime.v1";
const MAXIMUM_SOURCE_PAGES = 2;
const SOURCE_PAGE_LIMIT = 200;

@Injectable()
export class ExecutionProfileProjectionWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(ExecutionProfileProjectionWorker.name);
  private readonly ownerId = `control-api-${randomUUID()}`;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private running: Promise<void> | null = null;

  constructor(
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
    @Inject(ExecutionCurrentSourceProxy) private readonly source: ExecutionCurrentSourceProxy,
    @Inject(ExecutionProfileProjectionRepository) private readonly repository: ExecutionProfileProjectionRepository,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.enabled()) return;
    this.running = this.runOnce().catch((error: unknown) => this.logCycleFailure(error)).finally(() => {
      this.running = null;
      this.schedule();
    });
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    await this.running?.catch(() => undefined);
  }

  async runOnce(): Promise<void> {
    if (!this.enabled()) return;
    const failures: string[] = [];
    for (const profile of enabledProfiles(this.config)) {
      try {
        await this.refreshProfile(profile.environment, profile.profileId);
      } catch (error) {
        const code = safeFailureCode(error);
        failures.push(`${profile.environment}:${code}`);
        this.logger.warn(JSON.stringify({
          event: "execution_profile_projection_refresh_failed",
          environment: profile.environment,
          profile_id: profile.profileId,
          error_code: code,
        }));
      }
    }
    if (failures.length > 0) {
      throw new Error(`N31_PROFILE_PROJECTION_CYCLE_FAILED:${failures.join(",")}`);
    }
  }

  private async refreshProfile(environment: ProjectionEnvironment, profileId: string): Promise<void> {
    const workspaceId = this.config.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID!;
    const acquired = await this.repository.tryAcquireLease(
      workspaceId, environment, profileId, this.ownerId,
      this.config.EXECUTION_LOCAL_PROJECTION_LEASE_TTL_MS,
    );
    if (!acquired) return;
    try {
      // P4-D window ladder: the previous committed snapshot seeds the merged
      // time-series windows, so history accumulates locally without a second
      // request-side read — the served snapshot stays one atomic row.
      const previous = await this.repository.snapshot(workspaceId, environment, profileId).catch(() => null);
      const context: ManagerReadContext = {
        profileId: profileId as ManagerReadContext["profileId"],
        mode: environment,
        errorPrefix: environment === "paper" ? "N22" : "N23",
      };
      const results = [];
      for (const binding of profileProjectionCatalog(environment)) {
        let page: ManagerPage;
        try {
          page = await this.drain(workspaceId, environment, binding, context);
        } catch (error) {
          this.logger.warn(JSON.stringify({
            event: "execution_profile_projection_relation_failed",
            environment,
            profile_id: profileId,
            source_id: binding.sourceId,
            relation: binding.relation,
            error_code: safeFailureCode(error),
            source_reason_code: safeSourceReasonCode(error),
          }));
          if (isSourceContractUnavailable(error)) {
            results.push({
              spec: { key: binding.key, binding }, page: null,
              state: "UNAVAILABLE" as const,
              reasonCode: safeSourceReasonCode(error) ?? safeFailureCode(error),
            });
            continue;
          }
          throw error;
        }
        results.push({
          spec: { key: binding.key, binding }, page,
          state: page.items.length === 0 ? "EMPTY" as const
            : page.completeness === "PARTIAL" ? "PARTIAL" as const : "AVAILABLE" as const,
          reasonCode: page.completeness === "PARTIAL" ? "SOURCE_PARTIAL" : null,
        });
      }
      const isolated = enforceProfileLineage(results, "N30");
      const relations = Object.fromEntries(isolated.map((item) => {
        const binding = item.spec.binding;
        const key = `${binding.sourceId}:${binding.relation}`;
        const fresh = (item.page?.items ?? []).map((fields) => ({
          lineage: {
            workspace_id: workspaceId,
            profile_id: profileId,
            source_contract_revision: SOURCE_CONTRACT_REVISION,
          },
          fields,
        }));
        const merged = binding.ladder && item.page
          ? mergeTimeSeriesWindow(fresh, previous?.document.relations[key]?.items ?? [], binding.ladder)
          : { items: fresh, truncated: false };
        return [key, {
          source_id: binding.sourceId,
          relation: binding.relation,
          availability: item.page ? "AVAILABLE" as const : "UNAVAILABLE" as const,
          reason_code: item.reasonCode,
          as_of: item.page?.asOf ?? null,
          freshness: item.page?.freshness ?? "UNKNOWN" as const,
          completeness: item.page?.completeness ?? "UNKNOWN" as const,
          items: merged.items,
          ...(binding.ladder && item.page ? {
            window: {
              days: WARM_WINDOW_DAYS,
              max_rows: WARM_WINDOW_MAX_ROWS,
              basis: "MERGED_SNAPSHOT_LADDER" as const,
              truncated: merged.truncated,
            },
          } : {}),
          // P4-D lineage observability: exported on the snapshot envelope so a
          // lineage storm is a counted, visible fact for the operator view.
          ...(item.lineageRejects && Object.keys(item.lineageRejects).length > 0
            ? { lineage_rejects: item.lineageRejects } : {}),
        }];
      }));
      const document: ProfileProjectionDocument = {
        schema_version: "portal.execution.profile-projection.v1",
        workspace_id: workspaceId,
        environment,
        profile_id: profileId,
        source_contract_revision: SOURCE_CONTRACT_REVISION,
        relations,
      };
      const sourceAsOf = latestAsOf(isolated.flatMap((item) => item.page ? [item.page] : []));
      const completeness: ProjectionCompleteness = isolated.some((item) =>
        item.page?.completeness === "PARTIAL" || item.state === "PARTIAL" || item.state === "UNAVAILABLE")
        ? "PARTIAL"
        : isolated.some((item) => item.page?.completeness === "UNKNOWN") ? "UNKNOWN" : "COMPLETE";
      const sourceCursor = projectionDigest(relations);
      await this.repository.commit(document, {
        sourceEpoch: `manager-v2:${profileId}:${SOURCE_CONTRACT_REVISION}`,
        sourceCursor,
        sourceAsOf,
        receivedAt: new Date(),
        completeness,
        retentionSeconds: this.config.EXECUTION_LOCAL_PROJECTION_JOURNAL_RETENTION_SECONDS,
        maximumJournalEntries: this.config.EXECUTION_LOCAL_PROJECTION_MAXIMUM_JOURNAL_ENTRIES,
      });
    } finally {
      await this.repository.releaseLease(workspaceId, environment, profileId, this.ownerId)
        .catch(() => undefined);
    }
  }

  private async drain(
    workspaceId: string,
    environment: ProjectionEnvironment,
    binding: ReturnType<typeof profileProjectionCatalog>[number],
    context: ManagerReadContext,
  ): Promise<ManagerPage> {
    const items: ManagerPage["items"] = [];
    const cursors = new Set<string>();
    let cursor: string | undefined;
    let asOf: string | null = null;
    let freshness: ManagerPage["freshness"] = "FRESH";
    let completeness: ManagerPage["completeness"] = "COMPLETE";
    for (let pageNumber = 0; pageNumber < MAXIMUM_SOURCE_PAGES; pageNumber += 1) {
      const response = await this.source.relationForProjection(
        workspaceId, environment, binding.screenId, binding.sourceId, binding.relation,
        { limit: SOURCE_PAGE_LIMIT, ...(cursor ? { cursor } : {}) },
      );
      const page = managerPage(response, binding.relation, binding.fields, context);
      items.push(...page.items);
      asOf = [asOf, page.asOf].filter((value): value is string => value !== null).sort().at(-1) ?? null;
      freshness = worseFreshness(freshness, page.freshness);
      completeness = worseCompleteness(completeness, page.completeness);
      if (!page.nextCursor) return { items, asOf, freshness, completeness, nextCursor: null };
      if (cursors.has(page.nextCursor)) throw new Error("N31_SOURCE_CURSOR_CYCLE");
      cursors.add(page.nextCursor);
      cursor = page.nextCursor;
    }
    // A hot Portal projection is deliberately bounded. A larger source
    // population is not a failed cycle: retain the newest accepted window and
    // label it PARTIAL so product screens never confuse the window with an
    // exact historical population. The next reconciliation starts again from
    // the authoritative head; cold/full-history reads remain a later, explicit
    // query-plane concern.
    return { items, asOf, freshness, completeness: "PARTIAL", nextCursor: cursor ?? null };
  }

  private enabled(): boolean { return this.config.FEATURE_EXECUTION_LOCAL_PROJECTION === "true"; }

  private schedule(): void {
    if (this.stopped || !this.enabled()) return;
    this.timer = setTimeout(() => {
      this.running = this.runOnce().catch((error: unknown) => this.logCycleFailure(error)).finally(() => {
        this.running = null;
        this.schedule();
      });
    }, this.config.EXECUTION_LOCAL_PROJECTION_POLL_INTERVAL_MS);
    this.timer.unref();
  }

  private logCycleFailure(error: unknown): void {
    this.logger.warn(JSON.stringify({
      event: "execution_profile_projection_cycle_failed",
      error_code: safeFailureCode(error),
    }));
  }
}

/**
 * P4-D: merge the fresh time-series page with the previously committed
 * window — dedup by the relation's id field (timestamp+entity as fallback),
 * drop points older than the declared window, keep the newest rows when the
 * cap bites, ascending by timestamp. The window declares its own truncation.
 */
export function mergeTimeSeriesWindow(
  fresh: ProjectionRow[],
  previous: readonly ProjectionRow[],
  ladder: NonNullable<ProfileProjectionBinding["ladder"]>,
): { items: ProjectionRow[]; truncated: boolean } {
  const horizon = Date.now() - WARM_WINDOW_DAYS * 86_400_000;
  const keyOf = (row: { fields: Record<string, unknown> }) => {
    const id = row.fields[ladder.idField];
    if (typeof id === "string" && id.length > 0) return `id:${id}`;
    return `ts:${String(row.fields[ladder.timestampField] ?? "")}:${String(row.fields.account_id ?? row.fields.portfolio_id ?? row.fields.deployment_id ?? "")}`;
  };
  const stampOf = (row: { fields: Record<string, unknown> }) => {
    const value = row.fields[ladder.timestampField];
    const parsed = typeof value === "string" ? Date.parse(value) : Number.NaN;
    return Number.isNaN(parsed) ? null : parsed;
  };
  const byKey = new Map<string, { row: typeof fresh[number]; at: number }>();
  for (const row of [...previous, ...fresh]) {
    const at = stampOf(row);
    if (at === null || at < horizon) continue;
    byKey.set(keyOf(row), { row, at });
  }
  const ordered = [...byKey.values()].sort((left, right) => left.at - right.at);
  const truncated = ordered.length > WARM_WINDOW_MAX_ROWS;
  return { items: ordered.slice(-WARM_WINDOW_MAX_ROWS).map((entry) => entry.row), truncated };
}

function enabledProfiles(config: ControlApiConfig): Array<{ environment: ProjectionEnvironment; profileId: string }> {
  return [
    { environment: "paper" as const, enabled: config.FEATURE_EXECUTION_CURRENT_SOURCE_PAPER, profileId: config.EXECUTION_EDGE_PAPER_PROFILE_ID },
    // P4-D taxonomy: the DNSE/VN paper family projects under its own profile.
    // Inert until the Edge publishes the origin and the flag turns on; its
    // transport activation is the named follow-on slice.
    { environment: "paper" as const, enabled: config.FEATURE_EXECUTION_CURRENT_SOURCE_PAPER_DNSE, profileId: config.EXECUTION_EDGE_PAPER_DNSE_PROFILE_ID },
    { environment: "sandbox" as const, enabled: config.FEATURE_EXECUTION_CURRENT_SOURCE_SANDBOX, profileId: config.EXECUTION_EDGE_SANDBOX_PROFILE_ID },
    { environment: "live" as const, enabled: config.FEATURE_EXECUTION_CURRENT_SOURCE_LIVE, profileId: config.EXECUTION_EDGE_LIVE_PROFILE_ID },
  ].filter((item) => item.enabled === "true").map((item) => ({
    environment: item.environment, profileId: item.profileId!,
  }));
}

function latestAsOf(pages: readonly ManagerPage[]): Date | null {
  const value = pages.map((page) => page.asOf).filter((item): item is string => item !== null).sort().at(-1);
  return value ? new Date(value) : null;
}

function worseFreshness(left: ManagerPage["freshness"], right: ManagerPage["freshness"]): ManagerPage["freshness"] {
  const rank = { FRESH: 0, AGING: 1, STALE: 2, UNKNOWN: 3 };
  return rank[right] > rank[left] ? right : left;
}

function worseCompleteness(left: ManagerPage["completeness"], right: ManagerPage["completeness"]): ManagerPage["completeness"] {
  const rank = { COMPLETE: 0, PARTIAL: 1, UNKNOWN: 2 };
  return rank[right] > rank[left] ? right : left;
}

function safeFailureCode(error: unknown): string {
  const candidate = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code ?? "")
    : error instanceof Error ? error.message.split(":", 1)[0] : "";
  return /^[0-9A-Z]{5}$/.test(candidate)
    ? `POSTGRES_${candidate}`
    : /^[A-Z][A-Z0-9_]{1,95}$/.test(candidate) ? candidate : "N31_SOURCE_REFRESH_FAILED";
}

function safeSourceReasonCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("details" in error)) return null;
  const details = (error as { details?: unknown }).details;
  if (typeof details !== "object" || details === null || !("reason_code" in details)) return null;
  const reason = String((details as { reason_code?: unknown }).reason_code ?? "");
  return /^[A-Z][A-Z0-9_]{1,95}$/.test(reason) ? reason : null;
}

function isSourceContractUnavailable(error: unknown): boolean {
  const code = safeFailureCode(error);
  const reason = safeSourceReasonCode(error);
  return code === "N17B_SOURCE_RELATION_UNAVAILABLE" ||
    (code === "N17B_SOURCE_REJECTED" && reason === "MANAGER_V2_SOURCE_CONTRACT_REJECTED");
}
