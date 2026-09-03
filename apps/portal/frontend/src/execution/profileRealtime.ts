/**
 * One bounded same-origin realtime subscription per rendered profile screen.
 *
 * The browser first authenticates and pins a projection cursor with a snapshot
 * fetch. Native EventSource reconnect is explicitly disabled on every error by
 * calling close(). A terminal projection gap is allowed exactly one delayed
 * resnapshot/reconnect; auth expiry and transport errors never loop.
 */
import { useEffect, useState } from "react";

export type ProfileRealtimePhase = "idle" | "connecting" | "live" | "recovering" | "auth_expired" | "closed";

export interface ProfileRealtimeState {
  phase: ProfileRealtimePhase;
  refreshKey: number;
  cursor: string | null;
  reason: string | null;
}

interface RealtimeEnvelope {
  event_type: "snapshot" | "delta" | "heartbeat" | "auth.expired" | "projection.gap";
  terminal: boolean;
  reconnect_required: boolean;
  cursor: string | null;
  projection_epoch: string | null;
  projection_sequence: number | null;
  payload?: Record<string, unknown>;
}

const INITIAL: ProfileRealtimeState = { phase: "idle", refreshKey: 0, cursor: null, reason: null };

export function readProfileRealtime(raw: unknown): RealtimeEnvelope | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const item = raw as Record<string, unknown>;
  if (item.schema_version !== "portal.execution.profile-realtime.v1" ||
      !["snapshot", "delta", "heartbeat", "auth.expired", "projection.gap"].includes(String(item.event_type)) ||
      typeof item.terminal !== "boolean" || typeof item.reconnect_required !== "boolean") return null;
  const sequence = item.projection_sequence;
  if (sequence !== null && (!Number.isSafeInteger(sequence) || Number(sequence) < 0)) return null;
  return {
    event_type: item.event_type as RealtimeEnvelope["event_type"],
    terminal: item.terminal,
    reconnect_required: item.reconnect_required,
    cursor: typeof item.cursor === "string" ? item.cursor : null,
    projection_epoch: typeof item.projection_epoch === "string" ? item.projection_epoch : null,
    projection_sequence: typeof sequence === "number" ? sequence : null,
    payload: item.payload && typeof item.payload === "object" && !Array.isArray(item.payload)
      ? item.payload as Record<string, unknown> : undefined,
  };
}

export function useProfileRealtime(environment: "paper" | "sandbox" | "live" | null): ProfileRealtimeState {
  const [state, setState] = useState<ProfileRealtimeState>(INITIAL);

  useEffect(() => {
    if (!environment || typeof EventSource === "undefined") {
      setState(INITIAL);
      return;
    }
    let disposed = false;
    let source: EventSource | null = null;
    let recoveryTimer: ReturnType<typeof setTimeout> | null = null;
    let recoveryUsed = false;
    let epoch: string | null = null;
    let sequence: number | null = null;
    // P4-C: bounded delta coalescing. Every event still reaches the sequence
    // guard, but the screen is asked to re-read at most once per window — the
    // first event of a burst refreshes immediately, the rest fold into one
    // trailing refresh. Dropping an event would fabricate quiet; refetching
    // per event under a burst is a self-inflicted stampede.
    let lastBumpAtMs = 0;
    let bumpTimer: ReturnType<typeof setTimeout> | null = null;

    const close = () => {
      source?.close();
      source = null;
    };
    const bumpRefresh = () => {
      const elapsed = Date.now() - lastBumpAtMs;
      if (elapsed >= REALTIME_COALESCE_MS) {
        lastBumpAtMs = Date.now();
        setState((current) => ({ ...current, refreshKey: current.refreshKey + 1 }));
        return;
      }
      if (bumpTimer) return;
      bumpTimer = setTimeout(() => {
        bumpTimer = null;
        lastBumpAtMs = Date.now();
        if (!disposed) setState((current) => ({ ...current, refreshKey: current.refreshKey + 1 }));
      }, REALTIME_COALESCE_MS - elapsed);
    };
    const updateFrom = (event: RealtimeEnvelope) => {
      if (event.projection_epoch !== null) epoch = event.projection_epoch;
      if (event.projection_sequence !== null) sequence = event.projection_sequence;
      setState((current) => ({
        phase: "live",
        refreshKey: current.refreshKey,
        cursor: event.cursor ?? current.cursor,
        reason: null,
      }));
      // A heartbeat proves liveness; it never triggers a full data reread.
      if (event.event_type !== "heartbeat") bumpRefresh();
    };
    const decode = (message: MessageEvent<string>): RealtimeEnvelope | null => {
      try { return readProfileRealtime(JSON.parse(message.data)); } catch { return null; }
    };

    const bootstrap = async (recovering: boolean): Promise<void> => {
      close();
      setState((current) => ({ ...current, phase: recovering ? "recovering" : "connecting", reason: null }));
      let response: Response;
      try {
        response = await fetch(`/api/v1/execution/profiles/${environment}/realtime-snapshot`, {
          credentials: "same-origin", headers: { accept: "application/json" },
        });
      } catch {
        if (!disposed) setState((current) => ({ ...current, phase: "closed", reason: "REALTIME_SNAPSHOT_NETWORK_ERROR" }));
        return;
      }
      if (disposed) return;
      if (response.status === 401) {
        setState((current) => ({ ...current, phase: "auth_expired", reason: "SESSION_EXPIRED" }));
        return;
      }
      if (!response.ok) {
        setState((current) => ({ ...current, phase: "closed", reason: `REALTIME_SNAPSHOT_HTTP_${response.status}` }));
        return;
      }
      const snapshot = readProfileRealtime(await response.json().catch(() => null));
      if (!snapshot || snapshot.event_type !== "snapshot" || !snapshot.cursor) {
        setState((current) => ({ ...current, phase: "closed", reason: "REALTIME_SNAPSHOT_INVALID" }));
        return;
      }
      updateFrom(snapshot);
      const stream = new EventSource(`/api/v1/execution/profiles/${environment}/stream?cursor=${encodeURIComponent(snapshot.cursor)}`);
      source = stream;

      const terminalGap = (reason: string) => {
        close();
        if (recoveryUsed) {
          setState((current) => ({ ...current, phase: "closed", reason }));
          return;
        }
        recoveryUsed = true;
        setState((current) => ({ ...current, phase: "recovering", reason }));
        recoveryTimer = setTimeout(() => { if (!disposed) void bootstrap(true); }, 1_000);
      };
      const ordinary = (message: MessageEvent<string>) => {
        const event = decode(message);
        if (!event) {
          close();
          setState((current) => ({ ...current, phase: "closed", reason: "REALTIME_EVENT_INVALID" }));
          return;
        }
        if (event.terminal) {
          close();
          setState((current) => ({
            ...current,
            phase: "closed",
            reason: typeof event.payload?.reason_code === "string"
              ? event.payload.reason_code
              : "REALTIME_TERMINAL_EVENT",
          }));
          return;
        }
        if (event.event_type === "delta" && sequence !== null && event.projection_sequence !== sequence + 1) {
          terminalGap("REALTIME_SEQUENCE_GAP");
          return;
        }
        if (event.event_type === "delta" && epoch !== null && event.projection_epoch !== epoch) {
          terminalGap("REALTIME_EPOCH_CHANGED");
          return;
        }
        updateFrom(event);
      };
      stream.addEventListener("snapshot", ordinary as EventListener);
      stream.addEventListener("delta", ordinary as EventListener);
      stream.addEventListener("heartbeat", ordinary as EventListener);
      stream.addEventListener("projection.gap", ((message: MessageEvent<string>) => {
        const event = decode(message);
        terminalGap(typeof event?.payload?.reason_code === "string" ? event.payload.reason_code : "PROJECTION_GAP");
      }) as EventListener);
      stream.addEventListener("auth.expired", (() => {
        close();
        setState((current) => ({ ...current, phase: "auth_expired", reason: "SESSION_EXPIRED" }));
      }) as EventListener);
      stream.onerror = () => {
        // Critical loop breaker: native EventSource must never retry a dead
        // session every few seconds for the lifetime of the browser tab.
        close();
        if (!disposed) setState((current) => ({ ...current, phase: "closed", reason: "REALTIME_TRANSPORT_CLOSED" }));
      };
    };

    void bootstrap(false);
    return () => {
      disposed = true;
      close();
      if (recoveryTimer) clearTimeout(recoveryTimer);
      if (bumpTimer) clearTimeout(bumpTimer);
    };
  }, [environment]);

  return state;
}

/** One re-read per second is the ceiling a delta burst can ask of a screen. */
export const REALTIME_COALESCE_MS = 1_000;

export interface ProfilesRealtimeState {
  /** Sum of the member refresh keys — any profile's delta advances it. */
  refreshKey: number;
  states: Readonly<Record<"paper" | "sandbox" | "live", ProfileRealtimeState>>;
}

/**
 * P4-C: multi-profile screens (Fleet, the 360s, the portfolio register) span
 * all three projections, so their realtime truth is the union of the three
 * published streams. Three fixed hook calls — the rules of hooks forbid a
 * dynamic loop, and there are exactly three profiles by contract.
 */
export function useProfilesRealtime(
  environments: readonly ("paper" | "sandbox" | "live")[],
): ProfilesRealtimeState {
  const paper = useProfileRealtime(environments.includes("paper") ? "paper" : null);
  const sandbox = useProfileRealtime(environments.includes("sandbox") ? "sandbox" : null);
  const live = useProfileRealtime(environments.includes("live") ? "live" : null);
  return {
    refreshKey: paper.refreshKey + sandbox.refreshKey + live.refreshKey,
    states: { paper, sandbox, live },
  };
}
