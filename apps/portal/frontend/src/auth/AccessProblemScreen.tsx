/**
 * Frame 01D — Denied / error states (v0.4 §21.1).
 *
 * The table in the wireframe maps each state to copy and one primary action.
 * What it also fixes is what must NOT appear: no raw JWT, no policy internals,
 * no statement about whether an account exists, no stack trace. So this frame
 * takes a state and renders from a fixed table — it never formats a message out
 * of an error object it does not recognise.
 */
import { ACCESS_LOGOUT_PATH, type AuthState } from "./authApi";

/** Problems this frame can present, beyond the two context states. */
export type AccessProblem =
  | "ACCESS_REQUIRED"
  | "ACCOUNT_DISABLED"
  | "ACTIVATION_RECOVERY_REQUIRED"
  | "SESSION_EXPIRED"
  | "IDENTITY_UNAVAILABLE";

interface Presentation {
  title: string;
  body: string;
  action: { kind: "access-logout" | "retry" | "none"; label: string };
}

const PRESENTATION: Record<AccessProblem, Presentation> = {
  ACCESS_REQUIRED: {
    title: "Identity not verified",
    body:
      "Cloudflare Access could not verify your identity, or this identity is not covered by the Portal access policy. Contact an admin if you believe this is a mistake.",
    action: { kind: "access-logout", label: "Sign out of Access" },
  },
  ACCOUNT_DISABLED: {
    title: "Account access revoked",
    body: "This account's access to the Portal has been revoked. Contact an admin for details.",
    action: { kind: "access-logout", label: "Sign out" },
  },
  /*
   * A4-1 · a dead end, stated as one.
   *
   * Deliberately `none`: this is the one state on this frame that the person
   * reading it cannot act their way out of. A "Retry" would re-run a check
   * whose answer cannot change, and a "Sign in again" would send them back to
   * a form no credential satisfies — both would read as hope. The one route
   * forward is a person, so the copy names that route and stops.
   *
   * It names no username, no owner, no expiry time and no reason the
   * credential stopped working. Expired, revoked and already-used are
   * different facts server-side; to the holder they are the same fact, and the
   * difference would only tell them whether somebody acted on their account.
   */
  ACTIVATION_RECOVERY_REQUIRED: {
    title: "Activation credential no longer usable",
    body:
      "Your identity is verified, but the one-time activation credential for this account can no longer be used. Nothing you enter here will work until a new one is issued. Contact the Portal owner to have your access reset.",
    action: { kind: "none", label: "" },
  },
  SESSION_EXPIRED: {
    title: "Portal session expired",
    body: "Your session has expired. Sign in again to continue.",
    action: { kind: "retry", label: "Sign in again" },
  },
  IDENTITY_UNAVAILABLE: {
    title: "Identity could not be verified",
    body:
      "The identity verification service is not responding. This is not a problem with your account — try again shortly, and quote the request ID if you need support.",
    action: { kind: "retry", label: "Retry" },
  },
};

/** Maps a context state onto the problem this frame presents. */
export function problemForState(state: AuthState): AccessProblem | null {
  if (state === "ACCESS_REQUIRED") return "ACCESS_REQUIRED";
  if (state === "ACCOUNT_DISABLED") return "ACCOUNT_DISABLED";
  if (state === "ACTIVATION_RECOVERY_REQUIRED") return "ACTIVATION_RECOVERY_REQUIRED";
  return null;
}

export function AccessProblemScreen({
  problem,
  requestId,
  onRetry,
}: {
  problem: AccessProblem;
  requestId?: string | null;
  onRetry?: () => void;
}) {
  const presentation = PRESENTATION[problem];

  return (
    <div className="auth-screen" data-testid="access-problem-screen" data-problem={problem}>
      <section className="auth-panel auth-panel-centered">
        <p className="mono-label">PrimusSpark / Quant Portal</p>
        <h2 className="auth-panel-title">{presentation.title}</h2>
        <p className="auth-body">{presentation.body}</p>

        {/* The correlation id is the only technical detail this frame shows. */}
        {requestId ? (
          <p className="mono auth-error-request">request_id {requestId}</p>
        ) : null}

        <div className="auth-panel-foot auth-panel-foot-start">
          {presentation.action.kind === "access-logout" ? (
            <a className="btn-primary" href={ACCESS_LOGOUT_PATH}>
              {presentation.action.label}
            </a>
          ) : presentation.action.kind === "retry" ? (
            <button type="button" className="btn-primary" onClick={onRetry}>
              {presentation.action.label}
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );
}
