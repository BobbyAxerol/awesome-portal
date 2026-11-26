/**
 * The two reads behind the Paper workbench: the deployment profile and the
 * execution-quality derivation, each read ONCE through the ExecutionApi port.
 *
 * The profile is the heavy one (about 7.4 MB and ~6 s on dev, S3 plan D11/D12),
 * so this hook does not poll and does not refresh by itself. It reads when the
 * screen opens (or the deployment changes) and again only when `refresh()` is
 * called. A refresh keeps the answer on screen: the old value stays, the screen
 * says it is refreshing, and a refresh that fails keeps the old value and
 * reports its own failure beside it. At most one request per read is in flight,
 * so a double click on Refresh is one request.
 *
 * Three phases, never folded together: `loading` (first answer pending),
 * `ready` (a value, perhaps refreshing, perhaps with a failed refresh) and
 * `error` (no value, with the typed status and the Portal's reason).
 */
import { usePaperProfile } from "../../../paperProfile";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { DeploymentQuality } from "../../../api/derivations";
import type { ExecutionApi, Result } from "../../../api/ports";
import type { ProfileEnvelope } from "../../../api/profileRead";
import type { PanelStatus } from "../../../contracts";

export type ReadFailure = { status: Exclude<PanelStatus, "ok" | "loading">; reason: string };

export type ReadState<T> =
  | { phase: "loading" }
  | { phase: "error"; failure: ReadFailure }
  | { phase: "ready"; value: T; refreshing: boolean; refreshFailure: ReadFailure | null };

function failureOf(result: Extract<Result<unknown>, { ok: false }>): ReadFailure {
  return { status: result.status === "loading" ? "unavailable" : result.status, reason: result.reason };
}

const BROKEN: ReadFailure = { status: "unavailable", reason: "The read failed before the Portal answered." };

interface Keyed<T> {
  key: string;
  api: ExecutionApi;
  state: ReadState<T>;
}

/** One keyed read with a refresh that keeps the last good value. */
function useRefreshableRead<T>(
  api: ExecutionApi,
  key: string,
  run: (scoped: ExecutionApi) => Promise<Result<T>>,
): { state: ReadState<T>; refresh(): void } {
  const [held, setHeld] = useState<Keyed<T>>({ key, api, state: { phase: "loading" } });
  const runRef = useRef(run);
  runRef.current = run;
  const live = useRef<{ key: string; abort: AbortController | null }>({ key, abort: null });
  const inFlight = useRef(false);

  const start = useCallback(
    (refreshing: boolean) => {
      live.current.abort?.abort();
      const abort = new AbortController();
      live.current = { key, abort };
      inFlight.current = true;
      const scoped = api.withReadSignal?.(abort.signal) ?? api;
      const settle = (apply: (previous: ReadState<T>) => ReadState<T>) => {
        if (abort.signal.aborted) return;
        inFlight.current = false;
        setHeld((current) => (current.key === key && current.api === api ? { key, api, state: apply(current.state) } : current));
      };
      void runRef
        .current(scoped)
        .then((result) =>
          settle((previous) =>
            result.ok
              ? { phase: "ready", value: result.value, refreshing: false, refreshFailure: null }
              : previous.phase === "ready" && refreshing
                ? { ...previous, refreshing: false, refreshFailure: failureOf(result) }
                : { phase: "error", failure: failureOf(result) },
          ),
        )
        .catch(() =>
          settle((previous) =>
            previous.phase === "ready" && refreshing ? { ...previous, refreshing: false, refreshFailure: BROKEN } : { phase: "error", failure: BROKEN },
          ),
        );
    },
    [api, key],
  );

  // First read, and a new subject or a new port is another question: forget the old answer.
  useEffect(() => {
    setHeld({ key, api, state: { phase: "loading" } });
    start(false);
    return () => {
      live.current.abort?.abort();
      inFlight.current = false;
    };
  }, [api, key, start]);

  const refresh = useCallback(() => {
    if (inFlight.current) return;
    setHeld((current) =>
      current.key === key && current.api === api && current.state.phase === "ready"
        ? { ...current, state: { ...current.state, refreshing: true, refreshFailure: null } }
        : current,
    );
    // An error with no value reads again from `loading`.
    setHeld((current) => (current.key === key && current.api === api && current.state.phase === "error" ? { key, api, state: { phase: "loading" } } : current));
    start(true);
  }, [api, key, start]);

  // Hide an old answer for the frame after the subject changed.
  const state: ReadState<T> = held.key === key && held.api === api ? held.state : { phase: "loading" };
  return { state, refresh };
}

export interface WorkbenchReads {
  profile: ReadState<ProfileEnvelope>;
  quality: ReadState<DeploymentQuality>;
  /** Re-read both. A read already in flight is not started twice. */
  refresh(): void;
  /** Either read is mid-refresh. */
  refreshing: boolean;
}

export function useWorkbenchReads(api: ExecutionApi, deploymentId: string, variant: "paper" | "vnm"): WorkbenchReads {
  // The selected Paper profile is part of the read's identity: another profile is another subject, never a refresh of this one.
  const { selected: paperProfile } = usePaperProfile();
  const profile = useRefreshableRead<ProfileEnvelope>(api, `profile:${deploymentId}:${variant}:${paperProfile ?? ""}`, (scoped) => scoped.getPaperWorkbenchProfile(deploymentId, variant));
  const quality = useRefreshableRead<DeploymentQuality>(api, `quality:${deploymentId}:${paperProfile ?? ""}`, (scoped) => scoped.getDeploymentQuality(deploymentId, "paper"));
  const refreshProfile = profile.refresh;
  const refreshQuality = quality.refresh;
  const refresh = useCallback(() => {
    refreshProfile();
    refreshQuality();
  }, [refreshProfile, refreshQuality]);
  const refreshing = (profile.state.phase === "ready" && profile.state.refreshing) || (quality.state.phase === "ready" && quality.state.refreshing);
  return useMemo(() => ({ profile: profile.state, quality: quality.state, refresh, refreshing }), [profile.state, quality.state, refresh, refreshing]);
}
