/**
 * Stream revocation HINTS (BE-P18). A session or a grant that ends tells the realtime streams of this PROCESS, right after the revoking
 * transaction committed, so an open SSE client gets its terminal frame in the same tick instead of at the next poll.
 *
 * What this is NOT: authority. The stream's per-poll and per-write recheck of CURRENT authority stays the only source of truth. A hint
 * that is never sent, sent twice, sent to nobody (another process, a CLI), or that throws, changes nothing about who may read: the
 * worst case is the pre-existing bound of one poll cycle. So:
 * - every entry point is total: it never throws and never returns a promise the caller could have to await, and the revoking code
 *   calls it AFTER its own commit, outside the transaction, so a hint can neither block nor roll back a revoke or a logout;
 * - bounded: at most `STREAM_HINT_MAX_LISTENERS` listeners (a refused subscription is counted, not thrown), ids over
 *   `STREAM_HINT_MAX_ID_LENGTH` characters or of the wrong type are dropped, and nothing here stores an id: there is no map to grow;
 * - no secrets: callers pass only a session id or a user id (never a token, hash, cookie or grant body), and the only observable
 *   state is four counters.
 */
export const STREAM_HINT_MAX_LISTENERS = 4;
export const STREAM_HINT_MAX_ID_LENGTH = 256;

export interface StreamRevocationListener {
  /** One session ended (logout, admin revoke, expiry observed, identity or generation change). */
  sessionEnded(sessionId: string): void;
  /** Everything the user holds may have lost authority (all sessions revoked, password change, disable, grant revoked or narrowed). */
  userAuthorityChanged(userId: string): void;
}

export interface StreamRevocationHintDiagnostics {
  listeners: number; delivered: number; listener_failures: number; dropped_ids: number; refused_subscriptions: number;
}

/** Optional cross-process accelerator. It is installed only by the owning
 * application lifecycle; it never authorizes a read or participates in the
 * revoking transaction. Implementations must bound admission and settlement. */
export interface StreamRevocationHintPublisher {
  publish(kind: "SESSION_ENDED" | "USER_AUTHORITY_CHANGED", subjectId: string): void;
}

export class StreamRevocationHints {
  private readonly listeners = new Set<StreamRevocationListener>();
  private delivered = 0;
  private listenerFailures = 0;
  private droppedIds = 0;
  private refusedSubscriptions = 0;
  private publisher: StreamRevocationHintPublisher | undefined;

  setPublisher(publisher: StreamRevocationHintPublisher | undefined): void { this.publisher = publisher; }

  /** Returns the unsubscribe function. Over the bound the subscription is refused (counted) and the returned function is a no-op. */
  subscribe(listener: StreamRevocationListener): () => void {
    if (this.listeners.has(listener) || this.listeners.size >= STREAM_HINT_MAX_LISTENERS) {
      this.refusedSubscriptions++;
      return () => undefined;
    }
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  sessionEnded(sessionId: unknown): void { this.emit("SESSION_ENDED", "sessionEnded", sessionId); }
  userAuthorityChanged(userId: unknown): void { this.emit("USER_AUTHORITY_CHANGED", "userAuthorityChanged", userId); }

  /** A remote accelerator calls the same local fanout without re-publishing
   * the notification. Duplicate and lost hints are harmless; current policy
   * and the final-write fences remain the only authority. */
  receive(kind: "SESSION_ENDED" | "USER_AUTHORITY_CHANGED", subjectId: string): void {
    this.fan(kind === "SESSION_ENDED" ? "sessionEnded" : "userAuthorityChanged", subjectId);
  }

  diagnostics(): StreamRevocationHintDiagnostics {
    return { listeners: this.listeners.size, delivered: this.delivered, listener_failures: this.listenerFailures,
      dropped_ids: this.droppedIds, refused_subscriptions: this.refusedSubscriptions };
  }

  private emit(kind: "SESSION_ENDED" | "USER_AUTHORITY_CHANGED", method: keyof StreamRevocationListener, id: unknown): void {
    this.fan(method, id);
    if (typeof id !== "string" || id.length === 0 || id.length > STREAM_HINT_MAX_ID_LENGTH) return;
    try { this.publisher?.publish(kind, id); } catch { /* an accelerator can never fail a committed revoke */ }
  }

  private fan(method: keyof StreamRevocationListener, id: unknown): void {
    try {
      if (typeof id !== "string" || id.length === 0 || id.length > STREAM_HINT_MAX_ID_LENGTH) { this.droppedIds++; return; }
      for (const listener of [...this.listeners]) {
        try {
          const returned: unknown = listener[method](id);
          // A listener must be synchronous; a rejected promise from a careless one is still swallowed and counted.
          if (returned && typeof (returned as { then?: unknown }).then === "function")
            (returned as Promise<unknown>).then(undefined, () => { this.listenerFailures++; });
          this.delivered++;
        } catch { this.listenerFailures++; }
      }
    } catch { /* a hint can never fail its caller */ }
  }
}

/** The carrier is anything that exposes `streamHints` (the AuthService); a stub without it, or a hint that throws, is a no-op. */
export function hintSessionEnded(carrier: unknown, sessionId: unknown): void {
  try { (carrier as { streamHints?: StreamRevocationHints } | null | undefined)?.streamHints?.sessionEnded(sessionId); } catch { /* never fails the revoke */ }
}
export function hintUserAuthorityChanged(carrier: unknown, userId: unknown): void {
  try { (carrier as { streamHints?: StreamRevocationHints } | null | undefined)?.streamHints?.userAuthorityChanged(userId); } catch { /* never fails the revoke */ }
}
