import type { ControlApiConfig } from "../config";

/**
 * The durable mirror has deliberately separate write and read cutovers.
 *
 * `FEATURE_EXECUTION_DURABLE_MIRROR=true` starts mirroring accepted range
 * rows. It is not, by itself, permission for a product read to move away from
 * the compatible history table. During the warm-up/backfill window the worker
 * dual-writes so the currently served history does not become stale merely
 * because the next store is catching up.
 */
export type DurableMirrorMode = "LEGACY_ONLY" | "DUAL_WRITE_WARMUP" | "MIRROR_READ_ACTIVE";

export type DurableMirrorFlags = Pick<
  ControlApiConfig,
  "FEATURE_EXECUTION_DURABLE_MIRROR" | "FEATURE_EXECUTION_DURABLE_MIRROR_READS"
>;

export function durableMirrorWriteEnabled(config: DurableMirrorFlags): boolean {
  return config.FEATURE_EXECUTION_DURABLE_MIRROR === "true";
}

export function durableMirrorReadEnabled(config: DurableMirrorFlags): boolean {
  return durableMirrorWriteEnabled(config) && config.FEATURE_EXECUTION_DURABLE_MIRROR_READS === "true";
}

/** Keep legacy history current until the explicit read cutover. */
export function legacyHistoryWriteEnabled(config: DurableMirrorFlags): boolean {
  return !durableMirrorReadEnabled(config);
}

export function durableMirrorMode(config: DurableMirrorFlags): DurableMirrorMode {
  if (!durableMirrorWriteEnabled(config)) return "LEGACY_ONLY";
  return durableMirrorReadEnabled(config) ? "MIRROR_READ_ACTIVE" : "DUAL_WRITE_WARMUP";
}
