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

/**
 * The Portal source coordinator's own health, published beside the transport by
 * BE-R2-5 (`FRONTEND_HANDOFF.md` §8.58).
 *
 * This is a **different axis** from `phase`. `phase` says whether the browser's
 * stream is delivering; this says whether the source behind it is backing off.
 * The stream can be perfectly live while the coordinator is in retry, and a
 * reader who cannot tell those apart reads a recovering screen as a fresh one.
 * So it is carried separately rather than folded into `phase`.
 *
 * `state: null` means the server said nothing, which is not the same as
 * `HEALTHY`. `availability`/`freshness` fall back to `UNKNOWN` for the same
 * reason: an unparsed field is not a healthy one.
 */
export interface SourceRecovery {
  availability: "AVAILABLE" | "DEGRADED" | "UNKNOWN";
  freshness: "FRESH" | "AGING" | "STALE" | "UNKNOWN";
  state: "HEALTHY" | "RECOVERING" | null;
  reasonCode: string | null;
  retryNotBefore: string | null;
}

export const SOURCE_UNKNOWN: SourceRecovery = {
  availability: "UNKNOWN",
  freshness: "UNKNOWN",
  state: null,
  reasonCode: null,
  retryNotBefore: null,
};

export interface ProfileRealtimeState {
  phase: ProfileRealtimePhase;
  refreshKey: number;
  cursor: string | null;
  reason: string | null;
  /** What the source coordinator says about itself; never derived from `phase`. */
  source: SourceRecovery;
  /** Named-screen invalidations; wildcard is reserved for resnapshot/legacy hints. */
  screenRefreshKeys?: Readonly<Record<string, number>>;
}

interface RealtimeEnvelope {
  event_type: "snapshot" | "delta" | "heartbeat" | "auth.expired" | "projection.gap";
  terminal: boolean;
  reconnect_required: boolean;
  cursor: string | null;
  projection_epoch: string | null;
  projection_sequence: number | null;
  source: SourceRecovery;
  payload?: Record<string, unknown>;
}

const INITIAL: ProfileRealtimeState = {
  phase: "idle", refreshKey: 0, cursor: null, reason: null, source: SOURCE_UNKNOWN,
};

function oneOf<T extends string>(raw: unknown, allowed: readonly T[], fallback: T): T {
  return typeof raw === "string" && (allowed as readonly string[]).includes(raw) ? raw as T : fallback;
}

/**
 * Reads §8.58's coordinator status off an envelope. Anything it cannot read as
 * the published shape becomes `UNKNOWN`/`null` rather than an optimistic value.
 */
export function readSourceRecovery(item: Record<string, unknown>): SourceRecovery {
  const raw = item.recovery;
  const recovery = raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : null;
  const state = recovery && (recovery.state === "HEALTHY" || recovery.state === "RECOVERING")
    ? recovery.state
    : null;
  return {
    availability: oneOf(item.availability, ["AVAILABLE", "DEGRADED", "UNKNOWN"] as const, "UNKNOWN"),
    freshness: oneOf(item.freshness, ["FRESH", "AGING", "STALE", "UNKNOWN"] as const, "UNKNOWN"),
    state,
    reasonCode: state !== null && typeof recovery?.reason_code === "string" ? recovery.reason_code : null,
    retryNotBefore: state !== null && typeof recovery?.retry_not_before === "string"
      ? recovery.retry_not_before
      : null,
  };
}

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
    source: readSourceRecovery(item),
    payload: item.payload && typeof item.payload === "object" && !Array.isArray(item.payload)
      ? item.payload as Record<string, unknown> : undefined,
  };
}

type Environment = "paper" | "sandbox" | "live";
type StateUpdate = ProfileRealtimeState | ((current: ProfileRealtimeState) => ProfileRealtimeState);
type RealtimeHub = { state: ProfileRealtimeState; listeners: Set<(state: ProfileRealtimeState) => void>; stop: () => void };
const realtimeHubs = new Map<Environment, RealtimeHub>();

/** One connection/bootstrap per profile per tab; destroyed when its last reader leaves. */
export function useProfileRealtime(environment: Environment | null, screenId?: string): ProfileRealtimeState {
  const [bound, setBound] = useState<{ environment: Environment | null; state: ProfileRealtimeState }>({ environment: null, state: INITIAL });
  useEffect(() => {
    if (!environment || typeof EventSource === "undefined") {
      setBound({ environment, state: INITIAL }); return;
    }
    let hub = realtimeHubs.get(environment);
    if (!hub) {
      hub = { state: INITIAL, listeners: new Set(), stop: () => undefined };
      realtimeHubs.set(environment, hub);
    }
    const active = hub;
    const listener = (state: ProfileRealtimeState) => {
      const visible = screenId ? { ...state, refreshKey: (state.screenRefreshKeys?.[screenId] ?? 0) + (state.screenRefreshKeys?.["*"] ?? 0) } : state;
      setBound(previous => previous.environment === environment && previous.state.phase === visible.phase &&
        previous.state.refreshKey === visible.refreshKey && previous.state.reason === visible.reason &&
        JSON.stringify(previous.state.source) === JSON.stringify(visible.source)
        ? previous : { environment, state: visible });
    };
    active.listeners.add(listener);
    listener(active.state);
    if (active.listeners.size === 1) active.stop = startProfileRealtime(environment, update => {
      active.state = typeof update === "function" ? update(active.state) : update;
      for (const notify of active.listeners) notify(active.state);
    });
    return () => {
      active.listeners.delete(listener);
      if (!active.listeners.size) { active.stop(); if (realtimeHubs.get(environment) === active) realtimeHubs.delete(environment); }
    };
  }, [environment, screenId]);
  return bound.environment === environment ? bound.state : INITIAL;
}

function startProfileRealtime(environment: Environment, setState: (update: StateUpdate) => void): () => void {
    let disposed = false;
    const bootstrapAbort = new AbortController();
    let resnapshotNotBefore: string | null = null;
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
    const affected = new Set<string>();
    const flushRefresh = () => {
      if (disposed || document.visibilityState === "hidden") return;
      const screens = [...affected]; affected.clear();
      if (!screens.length) return;
      setState(current => {
        const screenRefreshKeys = { ...current.screenRefreshKeys };
        for (const id of screens) screenRefreshKeys[id] = (screenRefreshKeys[id] ?? 0) + 1;
        return { ...current, refreshKey: current.refreshKey + 1, screenRefreshKeys };
      });
    };

    const close = () => {
      if (bumpTimer) { clearTimeout(bumpTimer); bumpTimer = null; }
      source?.close();
      source = null;
    };
    const bumpRefresh = (screens?: string[]) => {
      for (const id of (screens ?? ["*"])) if (affected.size < 128) affected.add(id);
      if (document.visibilityState === "hidden") return;
      const elapsed = Date.now() - lastBumpAtMs;
      if (elapsed >= REALTIME_COALESCE_MS) {
        lastBumpAtMs = Date.now();
        flushRefresh();
        return;
      }
      if (bumpTimer) return;
      bumpTimer = setTimeout(() => {
        bumpTimer = null;
        lastBumpAtMs = Date.now();
        flushRefresh();
      }, REALTIME_COALESCE_MS - elapsed);
    };
    /**
     * `refresh` is false for the snapshot that bootstraps the stream.
     *
     * That snapshot is a handshake, not a delta: it carries the cursor the
     * stream resumes from and says nothing has happened. Bumping on it made
     * every profile screen re-read the moment the stream connected — about a
     * second after its first read, while that read was still in flight. The
     * hook cancels an in-flight read when its deps change, so the first
     * response was discarded and the screen waited for the second.
     *
     * On the Paper Workbench, whose profile is 7 MB, the two reads queued on
     * the server and the first panel appeared after 20.6s instead of 7.5s.
     * A bootstrap after a gap is different and does refresh: data can have
     * changed while the stream was down.
     */
    const updateFrom = (event: RealtimeEnvelope, refresh = true) => {
      if (disposed) return;
      if (event.event_type === "heartbeat") {
        setState(current => ({ ...current, phase: "live" }));
        return;
      }
      const statusOnly = event.payload?.snapshot_mode === "STATUS_ONLY";
      if (!statusOnly) {
        if (event.projection_epoch !== null) epoch = event.projection_epoch;
        if (event.projection_sequence !== null) sequence = event.projection_sequence;
      }
      setState((current) => ({
        ...current,
        phase: "live",
        refreshKey: current.refreshKey,
        cursor: statusOnly ? current.cursor : event.cursor ?? current.cursor,
        reason: null,
        source: event.source,
      }));
      // A heartbeat proves liveness; it never triggers a full data reread.
      //
      // Neither does a STATUS_ONLY snapshot. §8.58 emits one when the source
      // coordinator's own state changes, not when data does: same cursor, no
      // advance of epoch or sequence. Re-reading the whole profile would ask a
      // source that has just said it is backing off to serve another full
      // read, and the status that prompted it is already on this envelope. The
      // panel keeps its last-good values and changes its indicator instead,
      // which is what the handoff asks for.
      if (refresh && !statusOnly) bumpRefresh(Array.isArray(event.payload?.affected_screen_ids)
        ? event.payload.affected_screen_ids.filter((id): id is string => typeof id === "string" && /^[A-Z0-9_]{3,128}$/.test(id)).slice(0,128)
        : undefined);
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
          credentials: "same-origin", headers: { accept: "application/json" }, signal: bootstrapAbort.signal,
        });
      } catch {
        if (!disposed) setState((current) => ({ ...current, phase: "closed", reason: "REALTIME_SNAPSHOT_NETWORK_ERROR" }));
        return;
      }
      if (disposed) return;
      if (response.status === 401 || response.status === 403) {
        setState((current) => ({ ...current, phase: "auth_expired", reason: "SESSION_EXPIRED", source: SOURCE_UNKNOWN }));
        return;
      }
      if (!response.ok) {
        setState((current) => ({ ...current, phase: "closed", reason: `REALTIME_SNAPSHOT_HTTP_${response.status}` }));
        return;
      }
      const snapshot = readProfileRealtime(await response.json().catch(() => null));
      if (disposed || bootstrapAbort.signal.aborted) return;
      if (!snapshot || snapshot.event_type !== "snapshot" || !snapshot.cursor) {
        setState((current) => ({ ...current, phase: "closed", reason: "REALTIME_SNAPSHOT_INVALID" }));
        return;
      }
      updateFrom(snapshot, recovering);
      // Kept for the next gap: the snapshot that opened this stream is the one
      // that says when a resnapshot would be welcome.
      resnapshotNotBefore = typeof (snapshot.payload?.resnapshot_not_before ?? null) === "string"
        ? String(snapshot.payload?.resnapshot_not_before)
        : null;
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
        // The source publishes `resnapshot_not_before` on the snapshot that
        // preceded this gap. Waiting a hardcoded second regardless was the
        // client deciding for itself how hard to push a source that had just
        // said when to come back.
        const delay = resnapshotDelayMs(resnapshotNotBefore, Date.now(), RECOVERY_FALLBACK_MS);
        if (!Number.isFinite(delay)) {
          setState(current => ({ ...current, phase: "closed", reason: "REALTIME_RETRY_DEFERRED" }));
          return;
        }
        recoveryTimer = setTimeout(
          () => { if (!disposed) void bootstrap(true); },
          delay,
        );
      };
      const ordinary = (message: MessageEvent<string>) => {
        if (disposed || source !== stream) return;
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
        if (event.event_type === "delta" && sequence !== null && event.projection_epoch === epoch &&
            event.projection_sequence !== null && event.projection_sequence <= sequence) return;
        if (event.event_type === "delta" && sequence !== null && event.projection_sequence !== sequence + 1) {
          terminalGap("REALTIME_SEQUENCE_GAP");
          return;
        }
        if (event.event_type === "delta" && epoch !== null && event.projection_epoch !== epoch) {
          terminalGap("REALTIME_EPOCH_CHANGED");
          return;
        }
        if (typeof event.payload?.resnapshot_not_before === "string") resnapshotNotBefore = event.payload.resnapshot_not_before;
        else if (event.source.retryNotBefore) resnapshotNotBefore = event.source.retryNotBefore;
        updateFrom(event);
      };
      stream.addEventListener("snapshot", ordinary as EventListener);
      stream.addEventListener("delta", ordinary as EventListener);
      stream.addEventListener("heartbeat", ordinary as EventListener);
      stream.addEventListener("projection.gap", ((message: MessageEvent<string>) => {
        if (disposed || source !== stream) return;
        const event = decode(message);
        if (event?.source.retryNotBefore) resnapshotNotBefore = event.source.retryNotBefore;
        terminalGap(typeof event?.payload?.reason_code === "string" ? event.payload.reason_code : "PROJECTION_GAP");
      }) as EventListener);
      stream.addEventListener("auth.expired", (() => {
        if (disposed || source !== stream) return;
        close();
        setState((current) => ({ ...current, phase: "auth_expired", reason: "SESSION_EXPIRED" }));
      }) as EventListener);
      stream.onerror = () => {
        if (disposed || source !== stream) return;
        // Critical loop breaker: native EventSource must never retry a dead
        // session every few seconds for the lifetime of the browser tab.
        close();
        if (!disposed) setState((current) => ({ ...current, phase: "closed", reason: "REALTIME_TRANSPORT_CLOSED" }));
      };
    };

    const visibility = () => { if (document.visibilityState !== "hidden" && affected.size) bumpRefresh([]); };
    document.addEventListener("visibilitychange",visibility);
    void bootstrap(false);
    return () => {
      disposed = true;
      bootstrapAbort.abort();
      document.removeEventListener("visibilitychange",visibility);
      close();
      if (recoveryTimer) clearTimeout(recoveryTimer);
      if (bumpTimer) clearTimeout(bumpTimer);
    };
}

/** One re-read per second is the ceiling a delta burst can ask of a screen. */
/** Used only when the source published no `resnapshot_not_before`. */
export const RECOVERY_FALLBACK_MS = 1_000;

/**
 * How long to wait before resnapshotting, given the source's own instruction.
 *
 * `null` or a time already past means "now"; a future time is honoured to the
 * millisecond. A far-future value closes automatic recovery instead of retrying
 * earlier than the server allowed or overflowing the browser timer.
 */
export function resnapshotDelayMs(notBefore: string | null, now: number, fallbackMs: number): number {
  if (!notBefore) return fallbackMs;
  const at = Date.parse(notBefore);
  if (!Number.isFinite(at)) return fallbackMs;
  return at - now > 2_147_483_647 ? Infinity : Math.max(0, at - now);
}

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
  screenId?: string,
): ProfilesRealtimeState {
  const paper = useProfileRealtime(environments.includes("paper") ? "paper" : null, screenId);
  const sandbox = useProfileRealtime(environments.includes("sandbox") ? "sandbox" : null, screenId);
  const live = useProfileRealtime(environments.includes("live") ? "live" : null, screenId);
  return {
    refreshKey: paper.refreshKey + sandbox.refreshKey + live.refreshKey,
    states: { paper, sandbox, live },
  };
}
