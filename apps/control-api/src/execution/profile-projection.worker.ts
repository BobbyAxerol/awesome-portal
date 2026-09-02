import { randomUUID } from "node:crypto";
import { Inject, Injectable, OnApplicationBootstrap, OnApplicationShutdown } from "@nestjs/common";
import { ControlApiConfig } from "../config";
import { ManagerPage, ManagerReadContext, managerPage } from "../paper-read/manager-records";
import { CONTROL_API_CONFIG } from "../tokens";
import { ExecutionCurrentSourceProxy } from "./current-source.proxy";
import { enforceProfileLineage } from "./profile-lineage";
import { profileProjectionCatalog } from "./profile-projection.catalog";
import {
  ExecutionProfileProjectionRepository,
  ProfileProjectionDocument,
  ProjectionCompleteness,
  ProjectionEnvironment,
  projectionDigest,
} from "./profile-projection.repository";

const SOURCE_CONTRACT_REVISION = "trading-system.portal-execution.manager-v2.runtime.v1";
const MAXIMUM_SOURCE_PAGES = 10;
const SOURCE_PAGE_LIMIT = 200;

@Injectable()
export class ExecutionProfileProjectionWorker implements OnApplicationBootstrap, OnApplicationShutdown {
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
    this.running = this.runOnce().catch(() => undefined).finally(() => {
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
    for (const profile of enabledProfiles(this.config)) {
      await this.refreshProfile(profile.environment, profile.profileId);
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
      const context: ManagerReadContext = {
        profileId: profileId as ManagerReadContext["profileId"],
        mode: environment,
        errorPrefix: environment === "paper" ? "N22" : "N23",
      };
      const results = [];
      for (const binding of profileProjectionCatalog(environment)) {
        const page = await this.drain(workspaceId, environment, binding, context);
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
        return [key, {
          source_id: binding.sourceId,
          relation: binding.relation,
          as_of: item.page!.asOf,
          freshness: item.page!.freshness,
          completeness: item.page!.completeness,
          items: item.page!.items.map((fields) => ({
            lineage: {
              workspace_id: workspaceId,
              profile_id: profileId,
              source_contract_revision: SOURCE_CONTRACT_REVISION,
            },
            fields,
          })),
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
      const sourceAsOf = latestAsOf(isolated.map((item) => item.page!));
      const completeness: ProjectionCompleteness = isolated.some((item) =>
        item.page!.completeness === "PARTIAL" || item.state === "PARTIAL")
        ? "PARTIAL"
        : isolated.some((item) => item.page!.completeness === "UNKNOWN") ? "UNKNOWN" : "COMPLETE";
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
    throw new Error("N31_SOURCE_POPULATION_EXCEEDS_BOUND");
  }

  private enabled(): boolean { return this.config.FEATURE_EXECUTION_LOCAL_PROJECTION === "true"; }

  private schedule(): void {
    if (this.stopped || !this.enabled()) return;
    this.timer = setTimeout(() => {
      this.running = this.runOnce().catch(() => undefined).finally(() => {
        this.running = null;
        this.schedule();
      });
    }, this.config.EXECUTION_LOCAL_PROJECTION_POLL_INTERVAL_MS);
    this.timer.unref();
  }
}

function enabledProfiles(config: ControlApiConfig): Array<{ environment: ProjectionEnvironment; profileId: string }> {
  return [
    { environment: "paper" as const, enabled: config.FEATURE_EXECUTION_CURRENT_SOURCE_PAPER, profileId: config.EXECUTION_EDGE_PAPER_PROFILE_ID },
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
