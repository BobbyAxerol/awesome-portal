import { Inject, Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { ControlApiConfig } from "../config";
import { CONTROL_API_CONFIG } from "../tokens";
import { ExecutionSharedReadRepository, SharedReadCacheInventory, SharedReadCacheSweepBatch, SharedReadCacheSweepProfile } from "./shared-read.repository";

export type SharedReadCacheSweepOutcome = "DRY_RUN" | "DRAINED" | "TIME_BUDGET" | "CANCELLED";

export interface SharedReadCacheSweepReport {
  /** The only cache class in this worker; it is never a source/projection store. */
  cacheClass: "N21_SHARED_READ";
  workerId: string;
  mode: "DRY_RUN" | "APPLY";
  outcome: SharedReadCacheSweepOutcome;
  startedAt: string;
  finishedAt: string;
  batches: number;
  deletedRows: number;
  deletedBytes: number;
  profiles: SharedReadCacheSweepProfile[];
  before: SharedReadCacheInventory;
  after: SharedReadCacheInventory;
}

export interface SharedReadCacheSweepOptions {
  dryRun?: boolean;
  maximumRuntimeMs?: number;
  isCancelled?: () => boolean;
  workerId?: string;
}

/**
 * Run one bounded cache-maintenance cycle. It deliberately has no source,
 * browser, command, projection, migration or container dependency: all it can
 * issue are expiry-indexed deletes against Portal's recomputable cache table.
 */
export async function runSharedReadCacheSweep(
  repository: ExecutionSharedReadRepository,
  config: ControlApiConfig,
  options: SharedReadCacheSweepOptions = {},
): Promise<SharedReadCacheSweepReport> {
  const dryRun = options.dryRun ?? config.EXECUTION_SHARED_READ_CACHE_SWEEPER_DRY_RUN === "true";
  const maximumRuntimeMs = options.maximumRuntimeMs ?? config.EXECUTION_SHARED_READ_CACHE_SWEEPER_MAX_RUNTIME_MS;
  if (!Number.isInteger(maximumRuntimeMs) || maximumRuntimeMs < 50 || maximumRuntimeMs > 30_000) {
    throw new Error("shared-read cache sweep maximum runtime is invalid");
  }
  const workerId = options.workerId ?? `control-api-cache-sweeper-${randomUUID()}`;
  const started = Date.now();
  const startedAt = new Date(started).toISOString();
  const before = await repository.inventory(config.EXECUTION_SHARED_READ_CACHE_SWEEPER_BATCH_ROWS);
  if (dryRun) {
    return {
      cacheClass: "N21_SHARED_READ",
      workerId,
      mode: "DRY_RUN",
      outcome: "DRY_RUN",
      startedAt,
      finishedAt: new Date().toISOString(),
      batches: 0,
      deletedRows: 0,
      deletedBytes: 0,
      profiles: [],
      before,
      after: before,
    };
  }

  const profiles = new Map<string, SharedReadCacheSweepProfile>();
  let batches = 0;
  let deletedRows = 0;
  let deletedBytes = 0;
  let outcome: SharedReadCacheSweepOutcome = "DRAINED";
  while (true) {
    if (options.isCancelled?.()) {
      outcome = "CANCELLED";
      break;
    }
    if (Date.now() - started >= maximumRuntimeMs) {
      outcome = "TIME_BUDGET";
      break;
    }
    const batch = await repository.sweepExpiredBatch(
      config.EXECUTION_SHARED_READ_CACHE_SWEEPER_BATCH_ROWS,
      config.EXECUTION_SHARED_READ_CACHE_SWEEPER_BATCH_BYTES,
    );
    if (batch.deletedRows === 0) {
      outcome = "DRAINED";
      break;
    }
    batches += 1;
    deletedRows += batch.deletedRows;
    deletedBytes += batch.deletedBytes;
    mergeProfiles(profiles, batch);
  }
  return {
    cacheClass: "N21_SHARED_READ",
    workerId,
    mode: "APPLY",
    outcome,
    startedAt,
    finishedAt: new Date().toISOString(),
    batches,
    deletedRows,
    deletedBytes,
    profiles: [...profiles.values()].sort((left, right) => left.profileId.localeCompare(right.profileId)),
    before,
    after: await repository.inventory(config.EXECUTION_SHARED_READ_CACHE_SWEEPER_BATCH_ROWS),
  };
}

/**
 * The scheduled lifecycle is deliberately opt-in. A false flag stops the next
 * timer and a shutdown waits only for the bounded in-flight SQL cycle; neither
 * action changes cache reads, source admission, or current-source transport.
 */
@Injectable()
export class ExecutionSharedReadCacheMaintenanceWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(ExecutionSharedReadCacheMaintenanceWorker.name);
  private readonly workerId = `control-api-cache-sweeper-${randomUUID()}`;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private running: Promise<void> | null = null;

  constructor(
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
    @Inject(ExecutionSharedReadRepository) private readonly repository: ExecutionSharedReadRepository,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.enabled()) return;
    this.schedule(this.startupJitter());
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    await this.running?.catch(() => undefined);
  }

  /** Visible for isolated lifecycle tests and the explicit CLI path. */
  async runOnce(): Promise<SharedReadCacheSweepReport | null> {
    if (!this.enabled() || this.stopped) return null;
    const report = await runSharedReadCacheSweep(this.repository, this.config, {
      workerId: this.workerId,
      isCancelled: () => this.stopped,
    });
    this.logReport(report);
    return report;
  }

  private enabled(): boolean {
    return this.config.FEATURE_EXECUTION_SHARED_READ_CACHE_SWEEPER === "true";
  }

  private startupJitter(): number {
    const bound = this.config.EXECUTION_SHARED_READ_CACHE_SWEEPER_STARTUP_JITTER_MS;
    return bound === 0 ? 0 : Math.floor(Math.random() * (bound + 1));
  }

  private schedule(delayMs = this.config.EXECUTION_SHARED_READ_CACHE_SWEEPER_INTERVAL_MS): void {
    if (this.stopped || !this.enabled()) return;
    this.timer = setTimeout(() => {
      this.running = this.runOnce()
        .then(() => undefined)
        .catch((error: unknown) => this.logFailure(error))
        .finally(() => {
          this.running = null;
          this.schedule();
        });
    }, delayMs);
    this.timer.unref();
  }

  private logReport(report: SharedReadCacheSweepReport): void {
    const event = {
      event: "execution_shared_read_cache_sweep",
      cache_class: report.cacheClass,
      worker_id: report.workerId,
      mode: report.mode,
      outcome: report.outcome,
      batches: report.batches,
      deleted_rows: report.deletedRows,
      deleted_bytes: report.deletedBytes,
      oldest_expired_at_before: report.before.oldestExpiredAt,
      expired_sample_has_more_after: report.after.expiredSampleHasMore,
      active_rows_after: report.after.activeRows,
      active_bytes_after: report.after.activeBytes,
      physical_bytes_after: report.after.physicalBytes,
      capacity_state_after: report.after.capacityState,
      profiles: report.profiles.map((profile) => ({
        profile_id: profile.profileId,
        deleted_rows: profile.deletedRows,
        deleted_bytes: profile.deletedBytes,
        oldest_expired_at: profile.oldestExpiredAt,
      })),
    };
    if (report.after.capacityState === "WITHIN_LIMIT") this.logger.log(JSON.stringify(event));
    else this.logger.warn(JSON.stringify({ ...event, alarm: "N21_SHARED_CACHE_CAPACITY_ALARM" }));
  }

  private logFailure(error: unknown): void {
    const code = error instanceof Error ? error.message.split(":", 1)[0] : "UNKNOWN";
    this.logger.warn(JSON.stringify({
      event: "execution_shared_read_cache_sweep_failed",
      worker_id: this.workerId,
      error_code: code.replace(/[^A-Za-z0-9_:-]/g, "").slice(0, 160) || "UNKNOWN",
    }));
  }
}

function mergeProfiles(
  target: Map<string, SharedReadCacheSweepProfile>,
  batch: SharedReadCacheSweepBatch,
): void {
  for (const item of batch.profiles) {
    const existing = target.get(item.profileId);
    target.set(item.profileId, {
      profileId: item.profileId,
      deletedRows: (existing?.deletedRows ?? 0) + item.deletedRows,
      deletedBytes: (existing?.deletedBytes ?? 0) + item.deletedBytes,
      oldestExpiredAt: existing?.oldestExpiredAt ?? item.oldestExpiredAt,
    });
  }
}
