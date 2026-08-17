/**
 * Frame 01C — First-login Password Change (v0.4 §21.1).
 *
 * Reached when the BFF reports `PASSWORD_CHANGE_REQUIRED`. There is deliberately
 * no "Skip": the wireframe rules it out, and so does the state machine — context
 * keeps returning this state until the password is set.
 *
 * The BFF clears the session cookies on success, so this frame does NOT continue
 * into the shell. It hands control back to the login frame, which is the honest
 * reading of "password success rotates the app session".
 *
 * Local validation only prevents obviously wasted round-trips (length, match).
 * The real policy lives on the server, and its rejection copy is shown verbatim
 * so this screen never has to describe the blocklist.
 */
import { useState } from "react";

import { AuthRequestError, changePassword, logout } from "./authApi";

/** From the wireframe: "15+ characters". Server policy remains authoritative. */
const MIN_LENGTH = 15;

export function PasswordChangeScreen({
  username,
  email,
  onPasswordChanged,
  onSignOut,
}: {
  username: string | null;
  email: string | null;
  onPasswordChanged: () => void;
  onSignOut: () => void;
}) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);

  const localProblem =
    next && next.length < MIN_LENGTH
      ? `Password cần ít nhất ${MIN_LENGTH} ký tự.`
      : next && confirm && next !== confirm
        ? "Hai lần nhập password không khớp."
        : null;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting || localProblem || !next || !confirm) return;
    setSubmitting(true);
    setError(null);
    setRequestId(null);
    void changePassword(current, next)
      .then(() => onPasswordChanged())
      .catch((failure: unknown) => {
        if (failure instanceof AuthRequestError) {
          setError(failure.message);
          setRequestId(failure.requestId);
        } else {
          setError("Không đổi được password.");
        }
        setNext("");
        setConfirm("");
      })
      .finally(() => setSubmitting(false));
  };

  return (
    <div className="auth-screen" data-testid="password-change-screen">
      <section className="auth-panel auth-panel-centered">
        <h2 className="auth-panel-title">Bảo mật tài khoản</h2>
        <p className="auth-panel-sub">
          <span className="mono">{username ?? "tài khoản của bạn"}</span>
          {email ? <> · identity đã xác thực: <span className="mono">{email}</span></> : null}
        </p>

        <p className="auth-body">
          Credential một lần đã được chấp nhận. Bạn phải đặt password riêng trước khi vào
          Portal.
        </p>

        <form onSubmit={submit} noValidate>
          <div className="auth-field">
            <label htmlFor="auth-current">Credential hiện tại</label>
            <input
              id="auth-current"
              className="input"
              type="password"
              autoComplete="current-password"
              required
              autoFocus
              value={current}
              onChange={(event) => setCurrent(event.target.value)}
            />
          </div>

          <div className="auth-field">
            <label htmlFor="auth-new">Password mới</label>
            <input
              id="auth-new"
              className="input"
              type="password"
              autoComplete="new-password"
              required
              aria-describedby="auth-policy"
              value={next}
              onChange={(event) => setNext(event.target.value)}
            />
          </div>

          <div className="auth-field">
            <label htmlFor="auth-confirm">Nhập lại password mới</label>
            <input
              id="auth-confirm"
              className="input"
              type="password"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
            />
          </div>

          <p className="auth-hint" id="auth-policy">
            Tối thiểu {MIN_LENGTH} ký tự · giá trị phổ biến hoặc đã rò rỉ sẽ bị từ chối ·
            password manager và paste đều dùng được.
          </p>

          {localProblem ? (
            <div className="auth-error" role="alert">
              <p>{localProblem}</p>
            </div>
          ) : null}

          {error ? (
            <div className="auth-error" role="alert">
              {/* Server copy verbatim: it is written to avoid revealing the
                * blocklist internals. */}
              <p>{error}</p>
              {requestId ? <p className="mono auth-error-request">request_id {requestId}</p> : null}
            </div>
          ) : null}

          <button
            type="submit"
            className="btn-primary auth-submit"
            disabled={submitting || Boolean(localProblem) || !next || !confirm}
          >
            {submitting ? "Đang đặt password…" : "Đặt password và vào Portal"}
          </button>
        </form>

        <div className="auth-panel-foot">
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              void logout().finally(onSignOut);
            }}
          >
            Đăng xuất
          </button>
        </div>
      </section>
    </div>
  );
}
