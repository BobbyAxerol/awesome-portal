import { useCallback, useEffect, useRef, useState } from "react";
import { linkedAuditApi, linkedAuditFailure, type LinkedAuditRead, type LinkedAuditCreate, type LinkedAuditFailure } from "./linkedAuditClient";
import type { RcWriter } from "./useReleaseCandidate";

/** One GET on arrival; user-triggered re-read. No polling or automatic compute. */
export function useLinkedAudit(runId: string | null, options: { workspaceId?: string; writer?: RcWriter; writesLocked?: boolean; onSettled?: () => void } = {}) {
  const [read, setRead] = useState<LinkedAuditRead | null>(null);
  const [failure, setFailure] = useState<LinkedAuditFailure | null>(null);
  const [busy, setBusy] = useState(false);
  const [generation, setGeneration] = useState(0);
  const ownWriter = useRef(false);
  const writer = options.writer ?? ownWriter;
  const pending = useRef<LinkedAuditCreate | null>(null);
  const fence = useRef(0);
  const writeAbort = useRef<AbortController | null>(null);
  const callback = useRef(options.onSettled);
  callback.current = options.onSettled;
  const { workspaceId, writesLocked = false } = options;
  useEffect(() => {
    fence.current += 1;
    pending.current = null;
    setRead(null); setFailure(null); setBusy(false);
    return () => { fence.current += 1; writeAbort.current?.abort(); };
  }, [runId, workspaceId]);
  useEffect(() => {
    if (!runId) return;
    const controller = new AbortController();
    const current = fence.current;
    linkedAuditApi.read(runId, { workspaceId, signal: controller.signal })
      .then(answer => { if (!controller.signal.aborted && current === fence.current) { setRead(answer); setFailure(null); } })
      .catch(error => { if (!controller.signal.aborted && current === fence.current) { setRead(null); setFailure(linkedAuditFailure(error)); } });
    return () => controller.abort();
  }, [runId, workspaceId, generation]);
  const create = useCallback(() => {
    if (!runId || !read?.may_create || writesLocked || writer.current || failure && !failure.retryable) return;
    // Retrying a lost answer reuses the original intent and target. A changed target requires a new click/intent.
    if (!pending.current || pending.current.target_digest !== read.target_digest)
      pending.current = { client_intent_id: `audit:${crypto.randomUUID()}`, target_digest: read.target_digest };
    const controller = new AbortController(); writeAbort.current = controller;
    const current = ++fence.current;
    writer.current = true; setBusy(true); setFailure(null);
    linkedAuditApi.create(runId, pending.current, { workspaceId, signal: controller.signal })
      .then(answer => { if (!controller.signal.aborted && current === fence.current) { setRead(answer); callback.current?.(); } })
      .catch(error => { if (!controller.signal.aborted && current === fence.current) setFailure(linkedAuditFailure(error)); })
      .finally(() => { writer.current = false; if (!controller.signal.aborted && current === fence.current) setBusy(false); });
  }, [runId, read, workspaceId, writer, writesLocked, failure]);
  return { read, failure, busy, create, retry: useCallback(() => setGeneration(n => n + 1), []) };
}
