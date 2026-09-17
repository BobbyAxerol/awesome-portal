/**
 * The authenticated principal and what it may actually do, for the shell.
 *
 * `AuthGate` already read the principal to decide which frame to render;
 * without a context the rest of the shell would have to fetch
 * `/api/auth/context` again just to learn who is signed in, and two reads can
 * disagree.
 *
 * A4-1 changed what "may" means here. This used to expose `isAdmin`, derived
 * from `principal.role === "ADMIN"` — a coarse product role that every
 * administrator shares, computed in the browser from a value the server sends
 * for display. §20.2 rule 1 makes authority a server fact and rule 3 makes
 * access management the owner's alone, so the shell now asks
 * `/api/admin/access/self` and renders that answer. The role is still here for
 * the places that legitimately *display* it; it no longer decides anything.
 *
 * `null` principal means "not authenticated, or auth is not wired in front of
 * this build". Neither is an owner, and neither is asked.
 */
import { createContext, useContext, useEffect, useState } from "react";

import type { AuthPrincipal } from "./authApi";
import { fetchOwnerAccess, type OwnerAccessState } from "./ownerAccess";
import { AuthRequestError } from "./authApi";

export interface SessionValue {
  principal: AuthPrincipal | null;
  /**
   * What the server says this caller may do.
   *
   * Deliberately a three-state value rather than a boolean: `loading` is not
   * `denied`, and a Portal that could not answer is not a Portal that said no.
   * A boolean would have to pick one of those to mean `false`, and every
   * choice is a lie on some screen.
   */
  access: OwnerAccessState;
}

const SessionContext = createContext<SessionValue>({
  principal: null,
  access: { kind: "unavailable", requestId: null },
});

export function SessionProvider({
  principal,
  children,
}: {
  principal: AuthPrincipal | null;
  children: React.ReactNode;
}) {
  const [access, setAccess] = useState<OwnerAccessState>(
    principal ? { kind: "loading" } : { kind: "unavailable", requestId: null },
  );
  const principalId = principal?.principalId ?? null;
  const sessionId = principal?.sessionId ?? null;

  useEffect(() => {
    if (!principalId) {
      setAccess({ kind: "unavailable", requestId: null });
      return;
    }
    let live = true;
    setAccess({ kind: "loading" });
    void fetchOwnerAccess()
      .then((value) => {
        if (live) setAccess({ kind: "ready", access: value });
      })
      .catch((error: unknown) => {
        // Never a silent downgrade to "not the owner": a read that failed is
        // reported as a read that failed, and the screens say so.
        if (live) {
          setAccess({
            kind: "unavailable",
            requestId: error instanceof AuthRequestError ? error.requestId : null,
          });
        }
      });
    return () => {
      live = false;
    };
    // Re-asked when the session itself changes: a new session can be a
    // different person, and a bumped session version can mean different
    // authority for the same one.
  }, [principalId, sessionId]);

  return (
    <SessionContext.Provider value={{ principal, access }}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionValue {
  return useContext(SessionContext);
}

/**
 * True only when the server has answered and said yes.
 *
 * A helper rather than a field so that `loading` and `unavailable` cannot be
 * quietly folded into `false` by a caller writing `!isOwner`: anyone who needs
 * to distinguish them has to read `access.kind`, and anyone who only needs the
 * gate gets the strict reading.
 */
export function isOwnerAccess(access: OwnerAccessState): boolean {
  return access.kind === "ready" && access.access.isOwner;
}
