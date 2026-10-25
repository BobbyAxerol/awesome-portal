/**
 * The visit digest of the Overview ("Since your last visit"), through the typed port (Codex package 3).
 *
 * Rules, each pinned by a test:
 * - ONE read on open and one on every explicit Refresh (`nonce`): no polling, no stream, no timer;
 * - a GET never writes. The baseline moves only when the user presses "Mark as seen" (`markSeen`), only when the server said
 *   `may_mark_seen`, and with the `mark_seen` body of the digest on screen (never one built here);
 * - a second press while one is in flight is ignored;
 * - 409 (another tab acknowledged, or the source moved): the digest is read again, the user is told, and may act again; nothing is
 *   marked on their behalf;
 * - 503 or any failure to store: the digest on screen (the prior baseline) stays, with the sentence;
 * - a read that fails after a good one keeps the good one (stale), with the sentence; a first read that fails is `absent`, and the screen
 *   keeps its typed absence (the contract is not served here).
 */
import { useCallback, useEffect, useRef, useState } from "react";

import type { ExecutionApi } from "../../../api/ports";
import type { VisitDigest } from "../../readers/visitDigest";

export type VisitDigestUi =
  | { phase: "loading" }
  | { phase: "absent"; reason: string }
  | { phase: "ready"; digest: VisitDigest; marking: boolean; notice: string | null; stale: string | null };

export interface VisitDigestControl {
  ui: VisitDigestUi;
  markSeen(): void;
}

const CONFLICT = "Another tab or the source changed this digest, so it was read again. Check it and press Mark as seen again.";

export function useVisitDigest(api: ExecutionApi, workspaceId: string | undefined, nonce: number): VisitDigestControl {
  const [ui, setUi] = useState<VisitDigestUi>({ phase: "loading" });
  const busy = useRef(false);
  const live = useRef(0);
  const served = typeof api.getVisitDigest === "function" && typeof api.markVisitDigestSeen === "function";

  const read = useCallback(async (notice: string | null): Promise<void> => {
    const mine = live.current;
    const result = await api.getVisitDigest(workspaceId);
    if (mine !== live.current) return; // the question changed while it was in flight: this answer is not for the page any more
    if (result.ok && result.value.kind === "digest") {
      setUi({ phase: "ready", digest: result.value.digest, marking: false, notice, stale: null });
      return;
    }
    const reason = result.ok ? "The visit digest is a shape this build does not read." : result.reason;
    // A failed read after a good one keeps the good one and says so; a first read that fails is absent.
    setUi((previous) => (previous.phase === "ready" ? { ...previous, marking: false, notice: notice ?? previous.notice, stale: reason } : { phase: "absent", reason }));
  }, [api, workspaceId]);

  useEffect(() => {
    if (!served) {
      setUi({ phase: "absent", reason: "The visit digest is not served by this port." });
      return undefined;
    }
    live.current += 1;
    void read(null);
    return () => {
      live.current += 1;
    };
  }, [served, read, nonce]);

  const markSeen = useCallback(() => {
    if (busy.current || ui.phase !== "ready" || !ui.digest.mayMarkSeen) return;
    busy.current = true;
    const digest = ui.digest;
    setUi({ ...ui, marking: true, notice: null });
    void (async () => {
      try {
        const result = await api.markVisitDigestSeen(workspaceId, digest.markSeen);
        if (result.kind === "ok") {
          setUi({ phase: "ready", digest: result.digest, marking: false, notice: "Marked as seen.", stale: null });
        } else if (result.kind === "conflict") {
          await read(CONFLICT);
        } else {
          const sentence = result.kind === "unavailable" ? result.reason : `The Portal refused the acknowledgement (HTTP ${result.status}${result.code ? `, ${result.code}` : ""}). Nothing changed.`;
          setUi({ phase: "ready", digest, marking: false, notice: sentence, stale: null });
        }
      } catch {
        setUi({ phase: "ready", digest, marking: false, notice: "The acknowledgement could not be completed. Nothing changed.", stale: null });
      } finally {
        busy.current = false;
      }
    })();
  }, [api, read, ui, workspaceId]);

  return { ui, markSeen };
}
