/**
 * Frame 01B — Portal Local Login (v0.4 §21.1).
 *
 * Cloudflare Access has already verified who the browser belongs to; this frame
 * is the app's own second factor of authorisation. The interaction rules from
 * the wireframe are load-bearing, not cosmetic:
 *
 *  - the verified email is rendered from context and is read-only — it is not an
 *    input, because the user does not get to choose it;
 *  - the error is generic and carries a request id, so support can correlate
 *    without the screen revealing whether an account exists;
 *  - no role or capability of the *account* is shown before login. The
 *    capability list on the left describes the product, not the user;
 *  - submit is a real form submit so Enter works, and it cannot double-submit;
 *  - password managers and paste are allowed (no `onPaste` blocking).
 */
import { Lock, ShieldCheck } from "lucide-react";
import { useState } from "react";

import { ACCESS_LOGOUT_PATH, AuthRequestError, login, type AccessIdentity } from "./authApi";

/** Product capabilities, from the wireframe. Not the signed-in user's rights. */
const CAPABILITIES: { label: string; available: boolean }[] = [
  { label: "QuantBT Research", available: true },
  { label: "Roadmap / Task Board", available: true },
  { label: "Các module khác đang commissioned", available: false },
];

/**
 * The walk-forward split, as the plate motif.
 *
 * The panel next to a login form is usually filled with decoration. This draws
 * the one diagram this product is actually about — train on in-sample windows,
 * measure on the out-of-sample window that follows, keep a holdout nobody tunes
 * against — so the plate says what the Portal is for instead of merely occupying
 * space.
 *
 * It is a diagram of the method, labelled as such. It is not a run, and the
 * caption says so: no visitor should read a number into it.
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
      <div className="auth-ribbon-track" role="img" aria-label="Sơ đồ chia walk-forward: các cửa sổ in-sample, out-of-sample xen kẽ, kết thúc bằng holdout">
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
        Sơ đồ phương pháp walk-forward — không phải dữ liệu của một run nào.
      </figcaption>
    </figure>
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
            : new AuthRequestError(0, "NETWORK", "Không kết nối được dịch vụ đăng nhập.", null),
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
          <p className="mono-label auth-eyebrow">PrimusSpark · Quant Ecosystem</p>
          <h1 className="auth-narrative-title">
            Nghiên cứu alpha,
            <br />
            <em>bằng chứng đi kèm từng số.</em>
          </h1>
          <p className="auth-plate-lede">
            Một Portal cho toàn bộ đường đi của một alpha: research, walk-forward, planning,
            rồi paper → sandbox → live. Mỗi con số trên màn hình đều truy được về nguồn.
          </p>

          <FoldRibbon />

          <p className="mono-label auth-capability-label">Capability hiện có</p>
          <ul className="auth-capabilities">
            {CAPABILITIES.map((capability) => (
              <li key={capability.label} data-available={capability.available}>
                {/* Glyph plus text, never colour alone. */}
                <span aria-hidden="true">{capability.available ? "●" : "○"}</span>
                {capability.label}
              </li>
            ))}
          </ul>
        </aside>

        <section className="auth-panel auth-panel-lift">
          <h2 className="auth-panel-title">Đăng nhập Portal</h2>
          <p className="auth-panel-sub">
            <ShieldCheck size={13} aria-hidden="true" />
            Được bảo vệ bởi Cloudflare Zero Trust.
          </p>

          <div className="auth-identity">
            <span className="mono-label">
              <Lock size={10} aria-hidden="true" />
              Identity đã xác thực
            </span>
            {/* Read-only: this comes from the verified Access assertion. */}
            <output className="mono auth-identity-email">
              {accessIdentity?.email ?? "chưa đọc được email từ Access"}
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
              <label htmlFor="auth-credential">Password hoặc activation credential</label>
              <div className="auth-credential-row">
                <input
                  id="auth-credential"
                  className="input"
                  type={reveal ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={credential}
                  onChange={(event) => setCredential(event.target.value)}
                />
                <button
                  type="button"
                  className="btn-ghost"
                  aria-pressed={reveal}
                  onClick={() => setReveal((current) => !current)}
                >
                  {reveal ? "Ẩn" : "Hiện"}
                </button>
              </div>
              <p className="auth-hint">Lần đăng nhập đầu dùng credential một lần.</p>
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
              {submitting ? "Đang đăng nhập…" : "Đăng nhập"}
            </button>
          </form>

          <div className="auth-panel-foot">
            {/* Clears the Access session too — only Cloudflare can do that, so
              * this is a navigation, not a fetch. */}
            <a href={ACCESS_LOGOUT_PATH}>Đổi Access identity</a>
          </div>
        </section>
      </div>
    </div>
  );
}
