/**
 * The authenticated principal, for the shell.
 *
 * `AuthGate` already read it to decide which frame to render; without a context
 * the rest of the shell would have to fetch `/api/auth/context` again just to
 * learn the role, and two reads can disagree.
 *
 * `null` means "not authenticated, or auth is not wired in front of this build".
 * Neither of those is ADMIN, which is why `isAdmin` is false for both rather than
 * optimistic.
 */
import { createContext, useContext } from "react";

import type { AuthPrincipal } from "./authApi";

export interface SessionValue {
  principal: AuthPrincipal | null;
  /** True only for a real ADMIN session. Absent auth is never ADMIN. */
  isAdmin: boolean;
}

const SessionContext = createContext<SessionValue>({ principal: null, isAdmin: false });

export function SessionProvider({
  principal,
  children,
}: {
  principal: AuthPrincipal | null;
  children: React.ReactNode;
}) {
  return (
    <SessionContext.Provider value={{ principal, isAdmin: principal?.role === "ADMIN" }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionValue {
  return useContext(SessionContext);
}
