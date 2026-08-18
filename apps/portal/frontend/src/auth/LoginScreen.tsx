/**
 * Frame 01B — Portal local sign-in (v0.4 §21.1).
 *
 * Cloudflare Access has already verified who the browser belongs to; this frame
 * is the app's own second factor of authorisation. The interaction rules from
 * the wireframe are load-bearing, not cosmetic:
 *
 *  - the verified email is rendered from context and is read-only — it is not an
 *    input, because the user does not get to choose it;
 *  - the error is generic and carries a request id, so support can correlate
 *    without the screen revealing whether an account exists;
 *  - no role or capability of the *account* is shown before sign-in;
 *  - submit is a real form submit so Enter works, and it cannot double-submit;
 *  - password managers and paste are allowed (no `onPaste` blocking).
 *
 * The plate states what the visitor is about to enter rather than selling it.
 * It carried a display-serif slogan with an italic accent clause and a bulleted
 * capability list, both of which were written rather than read — the list in
 * particular was a constant standing in for the Feature Registry. What replaces
 * them is the authorisation chain the visitor is standing in the middle of, and
 * the versions of the services that will answer them, which is the question an
 * operator actually has at a sign-in screen.
 */
import { Lock, ShieldCheck } from "lucide-react";
import { useState } from "react";

import { ACCESS_LOGOUT_PATH, AuthRequestError, login, type AccessIdentity } from "./authApi";
import { useDeploymentFacts } from "./deployment";

/**
 * The walk-forward split, as the plate motif.
 *
 * The one diagram this product is about: train on in-sample windows, measure on
 * the out-of-sample window that follows, keep a holdout nobody tunes against.
 * It is a diagram of the method and the caption says so — no visitor should read
 * a number into it.
 */
const FOLD_RIBBON: { span: number; kind: "is" | "oos" | "holdout" }[] = [
  { span: 3, kind: "is" },
  { span: 1, kind: "oos" },
  { span: 3, kind: "is" },
  { span: 1, kind: "oos" },
  { span: 2, kind: "is" },
  { span: 1, kind: "oos" },
  { span: 2, kind: "holdout" },
];

const FOLD_LEGEND: { kind: "is" | "oos" | "holdout"; label: string }[] = [
  { kind: "is", label: "in-sample" },
  { kind: "oos", label: "out-of-sample" },
  { kind: "holdout", label: "holdout" },
];

function FoldRibbon() {
  return (
    <figure className="auth-ribbon" aria-labelledby="auth-ribbon-caption">
      <div
        className="auth-ribbon-track"
        role="img"
        aria-label="Walk-forward split: alternating in-sample and out-of-sample windows, ending in a holdout"
      >
        {FOLD_RIBBON.map((block, index) => (
          <span
            key={`${block.kind}-${index}`}
            className="auth-ribbon-block"
            data-kind={block.kind}
            style={{ flexGrow: block.span }}
          />
        ))}
      </div>
      <ul className="auth-ribbon-legend mono">
        {FOLD_LEGEND.map((item) => (
          <li key={item.kind}>
            <span className="auth-ribbon-swatch" data-kind={item.kind} aria-hidden="true" />
            {item.label}
          </li>
        ))}
      </ul>
      <figcaption id="auth-ribbon-caption" className="auth-ribbon-caption">
        A diagram of the walk-forward method — not data from any run.
      </figcaption>
    </figure>
  );
}

/**
 * The authorisation chain, with the visitor's position marked.
 *
 * Two factors in sequence is unusual enough that a visitor who has already
 * passed a Cloudflare login reasonably wonders why a second form is in front of
 * them. Naming both steps and marking which one is outstanding answers that
 * before it becomes a support question.
 */
function AuthorisationChain() {
  const steps = [
    {
      key: "access",
      label: "Cloudflare Access",
      // Not the email: it is rendered once, below, as the read-only output the
      // frame contract requires. Printing it twice makes the copy the reader
      // trusts ambiguous.
      detail: "verified",
      done: true,
    },
    { key: "portal", label: "Portal credential", detail: "this step", done: false },
    { key: "session", label: "Portal session", detail: "issued on success", done: false },
  ];
  return (
    <ol className="auth-chain" aria-label="Authorisation steps">
      {steps.map((step) => (
        <li key={step.key} data-done={step.done} data-current={!step.done && step.key === "portal"}>
          <span className="auth-chain-mark" aria-hidden="true">
            {step.done ? "✓" : "○"}
          </span>
          <span className="auth-chain-body">
            <span className="auth-chain-label">{step.label}</span>
            <span className="mono auth-chain-detail">{step.detail}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Which build of each service is answering — read live, never asserted. */
function ServiceStrip() {
  const facts = useDeploymentFacts();
  return (
    <div className="auth-services">
      <p className="mono-label">Services</p>
      {facts === null ? (
        <p className="mono auth-services-pending">reading…</p>
      ) : (
        <dl className="auth-services-grid">
          {facts.map((fact) => (
            <div key={fact.name} data-reachable={fact.reachable}>
              <dt className="mono">{fact.name}</dt>
              <dd className="mono">{fact.reachable ? (fact.version ?? "no version") : "unreachable"}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

export function LoginScreen({
  accessIdentity,
  onAuthenticated,
}: {
  accessIdentity: AccessIdentity | null;
  onAuthenticated: () => void;
}) {
  const [username, setUsername] = useState("");
  const [credential, setCredential] = useState("");
  const [reveal, setReveal] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<AuthRequestError | null>(null);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    void login(username, credential)
      .then(() => onAuthenticated())
      .catch((failure: unknown) => {
        setError(
          failure instanceof AuthRequestError
            ? failure
            : new AuthRequestError(0, "NETWORK", "The sign-in service could not be reached.", null),
        );
        // The credential is cleared on failure; the username is kept so a typo
        // in one field does not cost both.
        setCredential("");
      })
      .finally(() => setSubmitting(false));
  };

  return (
    <div className="auth-screen auth-screen-plate" data-testid="login-screen">
      <div className="auth-split">
        <aside className="auth-narrative auth-plate">
          <p className="mono-label auth-eyebrow auth-plate-masthead">PrimusSpark · Quant Platform</p>

          <div className="auth-plate-body">
            <div>
              <h1 className="auth-narrative-title">Portal</h1>
              <p className="auth-plate-lede">
                Backtesting, walk-forward validation and delivery planning for systematic
                strategies. Every figure on screen names the artifact it was read from.
              </p>
            </div>
            <FoldRibbon />
          </div>

          <ServiceStrip />
        </aside>

        <section className="auth-panel auth-panel-lift">
          <h2 className="auth-panel-title">Sign in</h2>
          <p className="auth-panel-sub">
            <ShieldCheck size={13} aria-hidden="true" />
            Protected by Cloudflare Zero Trust.
          </p>

          <AuthorisationChain />

          <div className="auth-identity">
            <span className="mono-label">
              <Lock size={10} aria-hidden="true" />
              Verified identity
            </span>
            {/* Read-only: this comes from the verified Access assertion. */}
            <output className="mono auth-identity-email">
              {accessIdentity?.email ?? "no email could be read from Access"}
            </output>
          </div>

          <form onSubmit={submit} noValidate>
            <div className="auth-field">
              <label htmlFor="auth-username">Username</label>
              <input
                id="auth-username"
                className="input"
                autoComplete="username"
                autoFocus
                required
                value={username}
                onChange={(event) => setUsername(event.target.value)}
              />
            </div>

            <div className="auth-field">
              <label htmlFor="auth-credential">Password or activation credential</label>
              <div className="auth-credential-row">
                <input
                  id="auth-credential"
                  className="input"
                  type={reveal ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={credential}
                  onChange={(event) => setCredential(event.target.value)}
                  // A masked field cannot show the user what caps lock did to
                  // their input, and the generic error afterwards will not tell
                  // them either.
                  onKeyUp={(event) => setCapsLock(event.getModifierState?.("CapsLock") ?? false)}
                  onBlur={() => setCapsLock(false)}
                />
                <button
                  type="button"
                  className="btn-ghost"
                  aria-pressed={reveal}
                  onClick={() => setReveal((current) => !current)}
                >
                  {reveal ? "Hide" : "Show"}
                </button>
              </div>
              {capsLock ? (
                <p className="auth-hint auth-hint-warn" role="status">
                  Caps Lock is on.
                </p>
              ) : null}
              <p className="auth-hint">Your first sign-in uses the one-time activation credential.</p>
            </div>

            {error ? (
              <div className="auth-error" role="alert">
                <p>{error.message}</p>
                {error.requestId ? (
                  <p className="mono auth-error-request">request_id {error.requestId}</p>
                ) : null}
              </div>
            ) : null}

            <button type="submit" className="btn-primary auth-submit" disabled={submitting}>
              {submitting ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <div className="auth-panel-foot">
            {/* Clears the Access session too — only Cloudflare can do that, so
              * this is a navigation, not a fetch. */}
            <a href={ACCESS_LOGOUT_PATH}>Use a different Access identity</a>
          </div>
        </section>
      </div>
    </div>
  );
}
