/**
 * Session expiry signal — RF01-F3.
 *
 * A screen that receives `401` does not own the session and must not build a
 * login of its own. It reports the fact here; `AuthGate` is the one listener,
 * and it answers with the existing Frame 01D `SESSION_EXPIRED` presentation,
 * whose "Sign in again" re-reads `/api/auth/context` and walks the normal
 * 01B/01C flow.
 *
 * The return URL needs no storage: the gate replaces the shell without
 * navigating, so once the context is `AUTHENTICATED` again the router mounts at
 * the URL — hash cursor included — the reader already had.
 *
 * With no listener (tests, a screen rendered outside the gate) a report is a
 * no-op, never an error.
 */

type Listener = () => void;

const listeners = new Set<Listener>();

export function onSessionExpired(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function reportSessionExpired(): void {
  for (const listener of [...listeners]) listener();
}
