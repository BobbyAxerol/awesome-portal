/**
 * The two reads behind Sandbox certification, through the `ExecutionApi` port.
 *
 * `useSandboxRead` is the version-aware certification read. It starts on mount, aborts on
 * leave, and `reload()` asks again WITHOUT blanking the screen: the previous answer stays
 * (marked `refreshing`) until the new one lands, because a note recorded against workflow
 * version 3 must be followed by a read that says whether the version moved, not by a spinner.
 *
 * `useNoteCapability` is `GET /governance/review-capture-capabilities`: which Portal actions
 * the SERVER would offer this person. The screen asks no role name (D10); it asks the server,
 * and a read that did not answer is `unknown`, never `available`.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import type { ExecutionApi } from "../../../api/ports";
import type { ReviewCaptureCapabilities } from "../../../api/reviewCapture";
import type { PanelStatus } from "../../../contracts";
import type { SandboxVersionRead, StageInclude } from "../../readers/dispatch";

/** BE-P12: the V2 screen asks for the identity of the deployment; the legacy body ignores it and the default request is otherwise unchanged. */
const SANDBOX_INCLUDE: readonly StageInclude[] = ["identity"];

export type SandboxRead =
  | { phase: "loading" }
  | { phase: "error"; status: Exclude<PanelStatus, "ok" | "loading">; reason: string }
  | { phase: "ready"; value: SandboxVersionRead; refreshing: boolean };

export function useSandboxRead(api: ExecutionApi, deploymentId: string, workspaceId: string | null): { read: SandboxRead; reload(): void } {
  const [state, setState] = useState<{ key: string; read: SandboxRead }>({ key: "", read: { phase: "loading" } });
  const [nonce, setNonce] = useState(0);
  const key = `${deploymentId}\u0000${workspaceId ?? ""}`;
  const previous = useRef<{ key: string; value: SandboxVersionRead } | null>(null);

  useEffect(() => {
    const abort = new AbortController();
    const kept = previous.current !== null && previous.current.key === key ? previous.current.value : null;
    setState({ key, read: kept === null ? { phase: "loading" } : { phase: "ready", value: kept, refreshing: true } });
    const scoped = api.withReadSignal?.(abort.signal) ?? api;
    void scoped
      .getSandboxCertificationVersioned(deploymentId, workspaceId === null ? { include: SANDBOX_INCLUDE } : { workspaceId, include: SANDBOX_INCLUDE })
      .then((result) => {
        if (abort.signal.aborted) return;
        if (result.ok) {
          previous.current = { key, value: result.value };
          setState({ key, read: { phase: "ready", value: result.value, refreshing: false } });
        } else {
          previous.current = null;
          setState({ key, read: { phase: "error", status: result.status === "loading" ? "unavailable" : result.status, reason: result.reason } });
        }
      })
      .catch(() => {
        if (abort.signal.aborted) return;
        previous.current = null;
        setState({ key, read: { phase: "error", status: "unavailable", reason: "The read failed before the Portal answered." } });
      });
    return () => abort.abort();
  }, [api, deploymentId, workspaceId, key, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  // The frame between a new key and its first effect must not show the old subject's answer.
  return { read: state.key === key ? state.read : { phase: "loading" }, reload };
}

export type NoteCapability =
  | { state: "loading" }
  /** The read did not answer, or no workspace is known: the screen cannot say whether the action is open. */
  | { state: "unknown"; reason: string }
  | { state: "unavailable"; reasonCode: string }
  | { state: "available" };

/** The SANDBOX_NOTE row of the capabilities the server published, read as words and not as booleans. */
export function noteCapabilityOf(capabilities: ReviewCaptureCapabilities): NoteCapability {
  const row = capabilities.actions.find((entry) => entry.id === "SANDBOX_NOTE");
  if (row === undefined) return { state: "unknown", reason: "The server did not list this action." };
  if (row.state === "AVAILABLE") return { state: "available" };
  return { state: "unavailable", reasonCode: row.reason_code ?? "NO_REASON_PUBLISHED" };
}

export function useNoteCapability(api: ExecutionApi, workspaceId: string | null): NoteCapability {
  const [state, setState] = useState<{ key: string; value: NoteCapability }>({ key: "", value: { state: "loading" } });
  const key = workspaceId ?? "";
  useEffect(() => {
    if (workspaceId === null) return;
    let cancelled = false;
    void api
      .getReviewCaptureCapabilities(workspaceId)
      .then((result) => {
        if (cancelled) return;
        setState({ key, value: result.ok ? noteCapabilityOf(result.value) : { state: "unknown", reason: result.reason } });
      })
      .catch(() => {
        if (!cancelled) setState({ key, value: { state: "unknown", reason: "The capabilities read did not complete." } });
      });
    return () => {
      cancelled = true;
    };
  }, [api, workspaceId, key]);
  if (workspaceId === null) return { state: "unknown", reason: "The workspace was not published for this read, so the server cannot be asked." };
  return state.key === key ? state.value : { state: "loading" };
}
