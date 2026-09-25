/**
 * W3b · which lane answers a run's facts, and the run identity a retained WFO
 * run is read against.
 *
 * Screens 04–08 each have two sources for the same facts: the P04 fixed-profile
 * hub (P13–P17 reads, `PORTAL_PERSISTED_RESEARCH`) and the RS-02 retained
 * current-source lane (`PORTAL_RETAINED_CURRENT_SOURCE`). A Delta walk-forward
 * run is never published through the hub — the hub answers it with its own
 * NOT_PUBLISHED codes (`P13_SOURCE_EVIDENCE_NOT_PUBLISHED`,
 * `P14_SOURCE_SPLIT_RECEIPT_NOT_PUBLISHED`, `P15_CURRENT_P04_SOURCE_…`), which
 * describe the hub, not the run. Once the retained lane answered AVAILABLE for
 * a run, that lane is the authority for every panel it covers, and a panel it
 * does not cover shows the retained lane's own typed absence — never a hub
 * reason (Research rule: never claim absence of a fact the server published).
 *
 * The run's identity (protocol, mode, schedule, instrument, declared folds,
 * engine release, config digest) comes from the P11 progress read, and the
 * walk-forward window from the admitted requested spec (CG-P11-07). Both are
 * read once per run and cached for the session: they are immutable for a
 * terminal run.
 */

import { useEffect, useState } from "react";

import { progressApi, type ProgressRead, type RunRequestedSpec } from "./progressClient";

export const RETAINED_AUTHORITY = "PORTAL_RETAINED_CURRENT_SOURCE";

/** Whether a current-source body is the retained lane answering this run. */
export function isRetainedAnswer(body: unknown): boolean {
  if (typeof body !== "object" || body === null) return false;
  const value = body as { read_authority?: unknown; availability?: { state?: unknown } | null };
  return value.read_authority === RETAINED_AUTHORITY && value.availability?.state === "AVAILABLE";
}

/**
 * Reason codes that describe the P04 hub lane rather than the run. A panel on
 * a retained run must never print one; tests and probes assert on it.
 */
export const HUB_LANE_REASON = /\b(P13_SOURCE_EVIDENCE_NOT_PUBLISHED|P14_SOURCE_SPLIT_RECEIPT_NOT_PUBLISHED|P15_CURRENT_P04_SOURCE_RECEIPT_NOT_PUBLISHED|P16_DELTA_WFO_PROFILE_USES_RETAINED_CURRENT_SOURCE_FREEZE|P04_SOURCE_DID_NOT_PUBLISH_[A-Z_]+)\b/;

export function isHubLaneReason(code: string | null | undefined): boolean {
  return typeof code === "string" && HUB_LANE_REASON.test(code);
}

/* ------------------------------------------------------------ run identity */

export interface RunIdentity {
  progress: ProgressRead | null;
  requested: RunRequestedSpec | null;
}

export type RunIdentitySlot =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "ready"; identity: RunIdentity };

const identities = new Map<string, RunIdentity>();

/** Test seam. */
export function forgetRunIdentities(): void {
  identities.clear();
}

/**
 * The progress read and the requested spec for a run, asked only when
 * `enabled` (the retained lane answered). Either may be refused; the slot is
 * still `ready` with that half null, and each panel shows its own absence.
 */
export function useRunIdentity(runId: string, workspaceId: string | undefined, enabled: boolean): RunIdentitySlot {
  const key = `${workspaceId ?? ""}|${runId}`;
  const [slot, setSlot] = useState<{ key: string; identity: RunIdentity } | null>(() => {
    const known = identities.get(key);
    return known ? { key, identity: known } : null;
  });

  useEffect(() => {
    if (!enabled) return;
    if (identities.has(key)) {
      setSlot({ key, identity: identities.get(key)! });
      return;
    }
    const controller = new AbortController();
    Promise.all([
      progressApi.read(runId, workspaceId, controller.signal).catch(() => null),
      progressApi.requestedSpec(runId, workspaceId, controller.signal).catch(() => null),
    ]).then(([progress, requested]) => {
      if (controller.signal.aborted) return;
      const identity: RunIdentity = { progress, requested };
      if (progress !== null || requested !== null) identities.set(key, identity);
      setSlot({ key, identity });
    });
    return () => controller.abort();
  }, [enabled, key, runId, workspaceId]);

  if (!enabled) return { state: "idle" };
  if (slot?.key !== key) return { state: "loading" };
  return { state: "ready", identity: slot.identity };
}

/* ------------------------------------------------------------- decisions */

/**
 * The run's readiness on the retained lane: READY when the attempt resolved
 * from its source, materialized READY and sealed its mandatory bundle.
 * `null` when the progress read is not in hand — the caller says so.
 */
export function retainedReadiness(progress: ProgressRead | null): "READY" | "NOT_READY" | null {
  if (progress === null) return null;
  const sealed = progress.progress?.readiness?.mandatory === "SEALED";
  return progress.current.terminal_materialization === "READY" && sealed ? "READY" : "NOT_READY";
}

export interface WalkForwardWindow {
  protocol: string | null;
  frequency: string | null;
  windowMode: string | null;
  start: string | null;
  endExclusive: string | null;
  seed: number | null;
  trials: number | null;
}

/** The walk-forward block of the admitted requested spec, field by field; absent fields stay null. */
export function walkForwardOf(requested: RunRequestedSpec | null): WalkForwardWindow {
  const spec = (requested?.requested_spec ?? null) as Record<string, unknown> | null;
  const wf = (spec?.walk_forward ?? null) as Record<string, unknown> | null;
  const str = (value: unknown) => (typeof value === "string" && value.length > 0 ? value : null);
  const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);
  return {
    protocol: str(spec?.protocol),
    frequency: str(wf?.frequency),
    windowMode: str(wf?.window_mode),
    start: str(wf?.start),
    endExclusive: str(wf?.end_exclusive),
    seed: num(spec?.random_seed),
    trials: num(spec?.optuna_trials),
  };
}

/** `advanced walk-forward · weekly · expanding`, from the published tokens only. */
export function protocolLabel(window: WalkForwardWindow, protocol: string | null): string | null {
  const kind = protocol ?? window.protocol;
  if (kind === null) return null;
  const head = kind === "advanced" ? "advanced walk-forward" : kind;
  return [head, window.frequency, window.windowMode].filter((part): part is string => part !== null).join(" · ");
}
