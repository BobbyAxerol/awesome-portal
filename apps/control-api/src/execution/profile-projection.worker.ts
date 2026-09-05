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
import { DurableMirrorRelationCursor, DurableMirrorRetainedRangeRows } from "./durable-mirror.contract";

const SOURCE_CONTRACT_REVISION = "trading-system.portal-execution.manager-v2.runtime.v1";
// Owner directive 2026-09-03 ("call hết dữ liệu có thể"): every relation
// drains to the snapshot document's own 2,000-row invariant — ten pages of
// two hundred — inside the unchanged paced source admission. Larger source
// populations stay declared PARTIAL hot windows, exactly as before.
const MAXIMUM_SOURCE_PAGES = 10;
// P4-D follow-on: time-series (ladder) relations resume from a persisted
// cursor and may take a deeper page budget per cycle — that is what lets a
// 600k-row append-only relation actually reach its recent rows. The page
// budget stays inside the shared 15 r/s source admission.
// 50 pages/cycle: a backfill over a ~600k-row scoped stream completes in
// under an hour instead of days, while every page still rides the shared
// paced source admission — the budget is spent, never widened.
const LADDER_MAXIMUM_SOURCE_PAGES = 50;
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
      const previousRelations = previous?.document.relations ?? {};
      const results: Array<Parameters<typeof enforceProfileLineage>[0][number] & {
        spec: { key: string; binding: ProfileProjectionBinding };
        carryForward?: ProfileProjectionDocument["relations"][string];
      }> = [];
      const relationCursors: DurableMirrorRelationCursor[] = [];
      for (const binding of profileProjectionCatalog(environment)) {
        let page: ManagerPage;
        let resumePoint: string | null = null;
        const resumeCursor = binding.ladder
          ? await this.repository.relationCursor(workspaceId, environment, profileId, `${binding.sourceId}:${binding.relation}`)
          : null;
        try {
          const drained = await this.drain(workspaceId, environment, binding, context, resumeCursor);
          page = drained.page;
          resumePoint = drained.resumePoint;
        } catch (error) {
          if (resumeCursor !== null) {
            // A persisted cursor can outlive its signature (catalogue digest
            // rotation, TTL). Clear it so the next cycle restarts a clean
            // pass instead of failing this relation forever.
            await this.repository.saveRelationCursor(
              workspaceId, environment, profileId,
              `${binding.sourceId}:${binding.relation}`, null,
            ).catch(() => undefined);
          }
          this.logger.warn(JSON.stringify({
            event: "execution_profile_projection_relation_failed",
            environment,
            profile_id: profileId,
            source_id: binding.sourceId,
            relation: binding.relation,
            error_code: safeFailureCode(error),
            source_reason_code: safeSourceReasonCode(error),
          }));
          // An accumulated time-series window is a local mirror of rows the
          // source already accepted — one failed refresh (cursor expiry,
          // transient rejection) must defer the refresh, never erase the
          // mirror. A relation that never delivered rows keeps its honest
          // UNAVAILABLE envelope.
          const carried = binding.ladder
            ? previousRelations[`${binding.sourceId}:${binding.relation}`]
            : undefined;
          if (carried && carried.items.length > 0) {
            results.push({
              spec: { key: binding.key, binding }, page: null,
              state: "PARTIAL" as const,
              reasonCode: "N31_LADDER_REFRESH_DEFERRED",
              carryForward: carried,
            });
            continue;
          }
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
        if (binding.ladder) {
          // Drain observability: rows-per-pass is the one number that says
          // whether a backfill is actually moving or just walking cursors.
          this.logger.log(JSON.stringify({
            event: "execution_profile_projection_ladder_drained",
            environment,
            profile_id: profileId,
            relation: binding.relation,
            items: page.items.length,
            resumed: resumeCursor !== null,
            next_cursor_present: page.nextCursor !== null,
          }));
          // Mid-pass: the source cursor continues next cycle. Tail: keep the
          // last held cursor and follow the (ts, id)-ordered stream forward —
          // new rows land strictly after it, and the final page's overlap is
          // deduplicated by the ladder merge.
          relationCursors.push({
            relationKey: `${binding.sourceId}:${binding.relation}`,
            sourceCursor: page.nextCursor ?? resumePoint,
          });
        }
        results.push({
          spec: { key: binding.key, binding }, page,
          state: page.items.length === 0 ? "EMPTY" as const
            : page.completeness === "PARTIAL" ? "PARTIAL" as const : "AVAILABLE" as const,
          reasonCode: page.completeness === "PARTIAL" ? "SOURCE_PARTIAL" : null,
        });
      }
      // The lineage guard passes every entry through by spread, so the
      // carry-forward association survives it at runtime; its signature just
      // does not model extra fields.
      const isolated = enforceProfileLineage(results, "N30") as typeof results;
      const retainedRangeRows: DurableMirrorRetainedRangeRows = Object.fromEntries(isolated.flatMap((item) => {
        const binding = item.spec.binding;
        if (!binding.ladder || !item.page) return [];
        const relationKey = `${binding.sourceId}:${binding.relation}`;
        return [[relationKey, item.page.items.map((fields) => ({
          lineage: {
            workspace_id: workspaceId,
            profile_id: profileId,
            source_contract_revision: SOURCE_CONTRACT_REVISION,
          },
          fields,
        }))]];
      }));
      // The old history table remains a compatible rollback read while EDS-06
      // is dark. Once the mirror is explicitly enabled, raw accepted range
      // rows move through repository.commit() in the same transaction as the
      // snapshot, revision, and server-only cursor checkpoints.
      if (this.config.FEATURE_EXECUTION_DURABLE_MIRROR !== "true") {
        for (const item of isolated) {
          const binding = item.spec.binding;
          if (!binding.ladder || !item.page) continue;
          const rows = item.page.items.flatMap((fields) => {
            const rawId = fields[binding.ladder!.idField];
            const rowId = typeof rawId === "string" && rawId.length > 0 ? rawId
              : typeof rawId === "number" && Number.isSafeInteger(rawId) ? String(rawId) : null;
            const ts = fields[binding.ladder!.timestampField];
            return rowId !== null && typeof ts === "string" && !Number.isNaN(Date.parse(ts))
              ? [{ rowId, ts, fields }] : [];
          });
          await this.repository.appendTimeSeriesHistory(
            workspaceId, environment, profileId,
            `${binding.sourceId}:${binding.relation}`, rows,
          ).catch((error: unknown) => {
            this.logger.warn(JSON.stringify({
              event: "execution_profile_projection_history_append_failed",
              environment,
              profile_id: profileId,
              relation: binding.relation,
              error_code: safeFailureCode(error),
            }));
          });
        }
      }
      const relations = Object.fromEntries(isolated.map((item) => {
        const binding = item.spec.binding;
        const key = `${binding.sourceId}:${binding.relation}`;
        const carried = item.carryForward;
        if (carried) {
          return [key, {
            ...carried,
            reason_code: "N31_LADDER_REFRESH_DEFERRED",
            completeness: "PARTIAL" as const,
          }];
        }
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
        relationCursors,
        retainedRangeRows,
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
    resumeCursor: string | null = null,
  ): Promise<{ page: ManagerPage; resumePoint: string | null }> {
    const items: ManagerPage["items"] = [];
    const cursors = new Set<string>();
    let cursor: string | undefined = resumeCursor ?? undefined;
    // Time-series relations page by (ts, id) ascending, so the last cursor we
    // ever held IS the tail position: keeping it lets the next cycle follow
    // new rows incrementally instead of re-walking the whole history.
    let lastHeldCursor: string | null = resumeCursor;
    let asOf: string | null = null;
    let freshness: ManagerPage["freshness"] = "FRESH";
    let completeness: ManagerPage["completeness"] = "COMPLETE";
    const pageBudget = binding.ladder ? LADDER_MAXIMUM_SOURCE_PAGES : MAXIMUM_SOURCE_PAGES;
    for (let pageNumber = 0; pageNumber < pageBudget; pageNumber += 1) {
      const response = await this.source.relationForProjection(
        workspaceId, environment, binding.screenId, binding.sourceId, binding.relation,
        { limit: SOURCE_PAGE_LIMIT, ...(cursor ? { cursor } : {}) },
      );
      const page = managerPage(response, binding.relation, binding.fields, context);
      items.push(...page.items);
      asOf = [asOf, page.asOf].filter((value): value is string => value !== null).sort().at(-1) ?? null;
      freshness = worseFreshness(freshness, page.freshness);
      completeness = worseCompleteness(completeness, page.completeness);
      if (!page.nextCursor) {
        // Tail dwell: the source's cursors expire five minutes after issue,
        // and a tail page issues none — so a held position would age out and
        // force a full head re-walk. When the final page carries K > 1 rows,
        // re-reading the same position with limit K-1 forces has_more and a
        // freshly issued cursor, keeping the held position young forever at
        // the cost of one extra bounded request per cycle.
        let tailCursor = lastHeldCursor;
        if (binding.ladder && cursor && page.items.length > 1) {
          try {
            const refresh = await this.source.relationForProjection(
              workspaceId, environment, binding.screenId, binding.sourceId, binding.relation,
              { limit: page.items.length - 1, cursor },
            );
            const refreshed = managerPage(refresh, binding.relation, binding.fields, context);
            if (refreshed.nextCursor) tailCursor = refreshed.nextCursor;
          } catch {
            // The dwell keeps the older cursor; recovery handles expiry.
          }
        }
        return {
          page: { items, asOf, freshness, completeness, nextCursor: null },
          resumePoint: tailCursor,
        };
      }
      if (cursors.has(page.nextCursor)) throw new Error("N31_SOURCE_CURSOR_CYCLE");
      cursors.add(page.nextCursor);
      cursor = page.nextCursor;
      lastHeldCursor = page.nextCursor;
    }
    // A hot Portal projection is deliberately bounded. A larger source
    // population is not a failed cycle: retain the newest accepted window and
    // label it PARTIAL so product screens never confuse the window with an
    // exact historical population. The next reconciliation starts again from
    // the authoritative head; cold/full-history reads remain a later, explicit
    // query-plane concern.
    return {
      page: { items, asOf, freshness, completeness: "PARTIAL", nextCursor: cursor ?? null },
      resumePoint: lastHeldCursor,
    };
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
    if (typeof id === "number" && Number.isSafeInteger(id)) return `id:${id}`;
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
  // DR-16: a relation the proxy/edge does not accept for this screen yet is a
  // per-relation typed gap, never a whole-profile failure — a newly added
  // catalog binding must not stale-out every other relation of the profile.
  return code === "N17B_SOURCE_RELATION_UNAVAILABLE" ||
    code === "N22_PROFILE_READ_NOT_ACCEPTED" ||
    code === "N23_PROFILE_READ_NOT_ACCEPTED" ||
    (code === "N17B_SOURCE_REJECTED" && reason === "MANAGER_V2_SOURCE_CONTRACT_REJECTED");
}
