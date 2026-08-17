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
  | "SESSION_EXPIRED"
  | "IDENTITY_UNAVAILABLE";

interface Presentation {
  title: string;
  body: string;
  action: { kind: "access-logout" | "retry" | "none"; label: string };
}

const PRESENTATION: Record<AccessProblem, Presentation> = {
  ACCESS_REQUIRED: {
    title: "Identity chưa được xác thực",
    body:
      "Cloudflare Access chưa xác thực được identity của bạn, hoặc identity này không nằm trong policy truy cập Portal. Liên hệ admin nếu bạn cho rằng đây là nhầm lẫn.",
    action: { kind: "access-logout", label: "Đăng xuất Access" },
  },
  ACCOUNT_DISABLED: {
    title: "Account đã bị thu hồi truy cập",
    body: "Quyền truy cập Portal của account này đã bị thu hồi. Liên hệ admin để biết thêm.",
    action: { kind: "access-logout", label: "Đăng xuất" },
  },
  SESSION_EXPIRED: {
    title: "Phiên Portal đã hết hạn",
    body: "Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại để tiếp tục.",
    action: { kind: "retry", label: "Đăng nhập lại" },
  },
  IDENTITY_UNAVAILABLE: {
    title: "Không xác minh được identity",
    body:
      "Dịch vụ xác minh identity hiện không phản hồi. Đây không phải lỗi tài khoản của bạn — thử lại sau, kèm request ID nếu cần hỗ trợ.",
    action: { kind: "retry", label: "Thử lại" },
  },
};

/** Maps a context state onto the problem this frame presents. */
export function problemForState(state: AuthState): AccessProblem | null {
  if (state === "ACCESS_REQUIRED") return "ACCESS_REQUIRED";
  if (state === "ACCOUNT_DISABLED") return "ACCOUNT_DISABLED";
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
