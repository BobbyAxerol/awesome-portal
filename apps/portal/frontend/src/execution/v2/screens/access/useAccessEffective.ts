/**
 * The effective-access read, as a state the screen can print.
 *
 * The route is `/api/admin/**`, not the execution port, so the read lives
 * here: same-origin, `no-store`, credentials from the session cookie. Every
 * outcome is a distinct phase (loading, denied, unavailable, ready) so the
 * screen never folds "could not ask" into "no grants" or "not allowed".
 *
 * A refresh that fails after a good read keeps the last good body and says it
 * is stale; a first read that fails has nothing to keep.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { readUtcEpochMs, type UtcEpochMs } from "../../../screenDataContract";
import { accessEffectiveUrl, readAccessEffective, type AccessEffective } from "../../readers/accessEffective";

export type AccessLoad =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "denied"; status: number; code: string | null; requestId: string | null }
  | { phase: "unavailable"; reason: string; code: string | null; requestId: string | null }
  | { phase: "ready"; effective: AccessEffective; readAt: UtcEpochMs | null; stale: { reason: string; requestId: string | null } | null };

const CODE = /^[A-Z][A-Z0-9_]{2,63}$/;
const REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/;

interface Failure {
  code: string | null;
  requestId: string | null;
}

async function failureOf(response: Response): Promise<Failure> {
  let code: string | null = null;
  let requestId: string | null = null;
  try {
    const body = (await response.json()) as { error?: { code?: unknown; request_id?: unknown }; request_id?: unknown };
    if (typeof body?.error?.code === "string" && CODE.test(body.error.code)) code = body.error.code;
    const id = body?.error?.request_id ?? body?.request_id;
    if (typeof id === "string" && REQUEST_ID.test(id)) requestId = id;
  } catch {
    /* a proxy can answer with a non-JSON body; the status still counts */
  }
  const header = response.headers.get("x-request-id");
  if (requestId === null && header !== null && REQUEST_ID.test(header)) requestId = header;
  return { code, requestId };
}

export interface UseAccessEffective {
  load: AccessLoad;
  reload(): void;
  /** True while a refresh is in flight over a body already shown. */
  refreshing: boolean;
}

export function useAccessEffective(
  workspaceId: string | null,
  options: { now?: () => number; fetchImpl?: typeof fetch } = {},
): UseAccessEffective {
  const { now = Date.now, fetchImpl } = options;
  const [load, setLoad] = useState<AccessLoad>(workspaceId === null ? { phase: "idle" } : { phase: "loading" });
  const [tick, setTick] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const last = useRef<string | null>(null);
  const clock = useRef(now);
  clock.current = now;

  useEffect(() => {
    if (workspaceId === null) {
      last.current = null;
      setLoad({ phase: "idle" });
      return;
    }
    const controller = new AbortController();
    const sameWorkspace = last.current === workspaceId;
    last.current = workspaceId;
    // A different workspace never inherits the previous one's body.
    setLoad((prev) => (sameWorkspace && prev.phase === "ready" ? prev : { phase: "loading" }));
    setRefreshing(sameWorkspace);

    const failed = (next: AccessLoad, staleReason: string, requestId: string | null) =>
      setLoad((prev) => (prev.phase === "ready" ? { ...prev, stale: { reason: staleReason, requestId } } : next));

    void (async () => {
      try {
        const response = await (fetchImpl ?? fetch)(accessEffectiveUrl(workspaceId), {
          credentials: "same-origin",
          cache: "no-store",
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        if (!response.ok) {
          const failure = await failureOf(response);
          if (controller.signal.aborted) return;
          // A refusal is a fact about now, not a staleness: it replaces what was shown.
          if (response.status === 401 || response.status === 403) {
            setLoad({ phase: "denied", status: response.status, code: failure.code, requestId: failure.requestId });
            return;
          }
          failed(
            { phase: "unavailable", reason: `The Portal answered ${response.status}.`, code: failure.code, requestId: failure.requestId },
            `The Portal answered ${response.status}.`,
            failure.requestId,
          );
          return;
        }
        let body: unknown;
        try {
          body = await response.json();
        } catch {
          if (controller.signal.aborted) return;
          failed({ phase: "unavailable", reason: "The answer was not readable.", code: null, requestId: null }, "The answer was not readable.", null);
          return;
        }
        if (controller.signal.aborted) return;
        const read = readAccessEffective(body);
        if (read === null) {
          failed(
            { phase: "unavailable", reason: "The answer did not match the published access contract.", code: null, requestId: null },
            "The answer did not match the published access contract.",
            null,
          );
          return;
        }
        if (read.kind === "unsupported_shape") {
          const reason = read.schemaVersion === null
            ? "The answer carries no schema version this build reads."
            : `The answer is ${read.schemaVersion}, which this build does not read.`;
          failed({ phase: "unavailable", reason, code: null, requestId: null }, reason, null);
          return;
        }
        // The body must be for the workspace that was asked about.
        if (read.effective.workspaceId !== workspaceId) {
          failed(
            { phase: "unavailable", reason: "The answer is for a different workspace than the one asked about.", code: null, requestId: null },
            "The answer is for a different workspace than the one asked about.",
            null,
          );
          return;
        }
        setLoad({ phase: "ready", effective: read.effective, readAt: readUtcEpochMs(clock.current()), stale: null });
      } catch {
        if (controller.signal.aborted) return;
        failed(
          { phase: "unavailable", reason: "The Portal could not be reached.", code: null, requestId: null },
          "The Portal could not be reached.",
          null,
        );
      } finally {
        if (!controller.signal.aborted) setRefreshing(false);
      }
    })();

    return () => controller.abort();
  }, [workspaceId, tick, fetchImpl]);

  const reload = useCallback(() => setTick((value) => value + 1), []);
  return { load, reload, refreshing };
}
