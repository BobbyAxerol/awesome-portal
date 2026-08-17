/**
 * Auth gate — chooses which of Frames 01B/01C/01D stands in front of the shell.
 *
 * The state machine belongs to the BFF: this reads `/api/auth/context` and
 * renders what it is told. It never decides it can skip a step, and an
 * unrecognised answer resolves to the most restrictive frame rather than to the
 * shell (see `fetchAuthContext`).
 *
 * The deep link survives on its own: the router is inside `children`, so once
 * the state becomes AUTHENTICATED the shell mounts at whatever URL the browser
 * already has. That is v0.4's "deep link chỉ restore sau authorization" without
 * the frontend storing a redirect target anywhere.
 *
 * When auth is not wired (`vite dev` against portal-api directly, or the
 * rollback `PORTAL_WEB_UPSTREAM=portal-api:8000`), `/api/auth/context` is not
 * served. That is not a locked door — it is a Portal without the identity BFF in
 * front — so the shell renders and says so, instead of showing a login form no
 * backend can answer.
 */
import { useCallback, useEffect, useState, type ReactNode } from "react";

import { StateView } from "../components/ui";
import {
  AuthRequestError,
  fetchAuthContext,
  logout,
  type AuthContext,
} from "./authApi";
import { AccessProblemScreen, problemForState } from "./AccessProblemScreen";
import { LoginScreen } from "./LoginScreen";
import { SessionProvider } from "./session";
import { PasswordChangeScreen } from "./PasswordChangeScreen";

type Phase =
  | { kind: "loading" }
  | { kind: "ready"; context: AuthContext }
  /** The identity BFF is not in front of this build. */
  | { kind: "unwired"; detail: string }
  /** The BFF is there but could not answer. */
  | { kind: "unavailable"; requestId: string | null };

export function AuthGate({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });

  const read = useCallback(() => {
    setPhase({ kind: "loading" });
    void fetchAuthContext()
      .then((context) => setPhase({ kind: "ready", context }))
      .catch((error: unknown) => {
        // 404/501 means nothing is serving the auth route: the gateway is not
        // in front. Any other failure is a real outage of a route that exists.
        if (error instanceof AuthRequestError && (error.status === 404 || error.status === 501)) {
          setPhase({
            kind: "unwired",
            detail:
              "Identity BFF không có ở build này (dev server hoặc rollback upstream). Portal chạy không có session.",
          });
          return;
        }
        setPhase({
          kind: "unavailable",
          requestId: error instanceof AuthRequestError ? error.requestId : null,
        });
      });
  }, []);

  useEffect(read, [read]);

  if (phase.kind === "loading") {
    return (
      <div className="auth-screen">
        <StateView kind="loading" message="Đang kiểm tra phiên đăng nhập…" />
      </div>
    );
  }

  if (phase.kind === "unavailable") {
    return (
      <AccessProblemScreen
        problem="IDENTITY_UNAVAILABLE"
        requestId={phase.requestId}
        onRetry={read}
      />
    );
  }

  if (phase.kind === "unwired") {
    return (
      <SessionProvider principal={null}>
        {/* Said out loud rather than hidden: a Portal with no session in front
          * is a different product from the deployed one, and a reader must be
          * able to tell which they are looking at. */}
        <div className="auth-unwired mono no-print" role="status">
          {phase.detail}
        </div>
        {children}
      </SessionProvider>
    );
  }

  const { state, principal, accessIdentity } = phase.context;

  if (state === "AUTHENTICATED") {
    // The role travels with the shell so no screen has to re-read
    // /api/auth/context and risk disagreeing with this decision.
    return <SessionProvider principal={principal}>{children}</SessionProvider>;
  }

  if (state === "APP_LOGIN_REQUIRED") {
    return <LoginScreen accessIdentity={accessIdentity} onAuthenticated={read} />;
  }

  if (state === "PASSWORD_CHANGE_REQUIRED") {
    return (
      <PasswordChangeScreen
        username={principal?.username ?? null}
        email={accessIdentity?.email ?? null}
        // The BFF clears the cookies on success, so re-reading context lands on
        // the login frame. That is the session rotation, not a bug.
        onPasswordChanged={read}
        onSignOut={read}
      />
    );
  }

  const problem = problemForState(state);
  return (
    <AccessProblemScreen
      problem={problem ?? "IDENTITY_UNAVAILABLE"}
      onRetry={() => {
        void logout().finally(read);
      }}
    />
  );
}
