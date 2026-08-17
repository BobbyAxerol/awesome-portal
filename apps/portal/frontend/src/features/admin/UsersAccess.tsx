/**
 * Users & Access (ADMIN).
 *
 * Everything here changes someone's ability to get in, so the screen is built
 * around consequence rather than convenience:
 *
 *  - each destructive action confirms, and the confirmation names the person and
 *    what will happen to their sessions;
 *  - a role change revokes that user's sessions server-side, so the copy says so
 *    instead of letting an admin think it takes effect at next login;
 *  - a reset returns a one-time credential which is displayed once and never
 *    stored — the screen says it will not be shown again;
 *  - the caller's own row is marked, because demoting or disabling yourself is
 *    the one mistake with no undo from this screen.
 *
 * Hiding this screen from a non-ADMIN is a courtesy. The boundary is the gateway,
 * and a 403 is surfaced as such rather than pre-empted.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, LogOut, ShieldOff } from "lucide-react";
import { useState } from "react";

import { AuthRequestError } from "../../auth/authApi";
import { useSession } from "../../auth/session";
import { Callout, Panel, SectionHeading } from "../../components/surface";
import { StateView } from "../../components/ui";
import {
  disableUser,
  listUsers,
  resetCredential,
  revokeSessions,
  setRole,
  type AdminUser,
  type UserRole,
} from "./adminApi";

/** Status as a word plus a tone; never colour alone. */
function StatusCell({ user }: { user: AdminUser }) {
  const disabled = user.status === "DISABLED" || Boolean(user.disabledAt);
  const locked = Boolean(user.lockedUntil);
  return (
    <span className="admin-status" data-disabled={disabled}>
      <span className="mono">{user.status}</span>
      {locked ? <span className="admin-flag">locked tới {user.lockedUntil}</span> : null}
      {user.mustChangePassword ? <span className="admin-flag">phải đổi password</span> : null}
    </span>
  );
}

export function UsersAccess() {
  const { principal, isAdmin } = useSession();
  const queryClient = useQueryClient();
  const [issuedToken, setIssuedToken] = useState<{ username: string; token: string } | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);

  // Not enabled for a non-ADMIN: the gateway would answer 403, and asking anyway
  // would put a forbidden request in the log for every reader who lands here.
  const users = useQuery({
    queryKey: ["admin-users"],
    queryFn: listUsers,
    enabled: isAdmin,
    retry: 1,
  });
  const rows = users.data ?? [];

  const report = (error: unknown) => {
    setFailure(error instanceof Error ? error.message : "Không thực hiện được yêu cầu.");
    setRequestId(error instanceof AuthRequestError ? error.requestId : null);
  };
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
  const clear = () => {
    setFailure(null);
    setRequestId(null);
  };

  const roleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: UserRole }) => setRole(userId, role),
    onSuccess: refresh,
    onError: report,
  });
  const revokeMutation = useMutation({
    mutationFn: (userId: string) => revokeSessions(userId),
    onSuccess: refresh,
    onError: report,
  });
  const disableMutation = useMutation({
    mutationFn: (userId: string) => disableUser(userId),
    onSuccess: refresh,
    onError: report,
  });
  const resetMutation = useMutation({
    mutationFn: (user: AdminUser) =>
      resetCredential(user.userId).then((token) => ({ username: user.username, token })),
    onSuccess: (result) => {
      setIssuedToken(result);
      refresh();
    },
    onError: report,
  });

  if (!isAdmin) {
    return (
      <div className="space-y-4">
        <SectionHeading title="Users & Access" />
        <StateView
          kind="denied"
          message="Chỉ ADMIN xem được màn này. Nếu bạn cần quyền, liên hệ owner — Portal không tự nâng quyền."
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SectionHeading
        title="Users & Access"
        description="Quản lý account, role và phiên đăng nhập. Mọi hành động ở đây đổi quyền truy cập thật."
      />

      {issuedToken ? (
        <Callout tone="warning" title={`Credential một lần cho ${issuedToken.username}`}>
          <p className="mono admin-token">{issuedToken.token}</p>
          <p>
            Chỉ hiện <strong>một lần</strong> và không được lưu ở đâu. Gửi cho người dùng qua kênh
            an toàn; họ sẽ phải đặt password riêng ở lần đăng nhập đầu.
          </p>
          <button type="button" className="btn-ghost" onClick={() => setIssuedToken(null)}>
            Đã lưu, ẩn đi
          </button>
        </Callout>
      ) : null}

      {failure ? (
        <Callout tone="danger" title="Không thực hiện được">
          <p>{failure}</p>
          {requestId ? <p className="mono field-hint">request_id {requestId}</p> : null}
        </Callout>
      ) : null}

      {users.isLoading ? (
        <StateView kind="loading" message="Đang tải danh sách user…" />
      ) : users.isError ? (
        <StateView
          kind="failed"
          message={`Không đọc được /api/admin/users. ${
            users.error instanceof Error ? users.error.message : ""
          }`}
          onRetry={() => void users.refetch()}
        />
      ) : (
        <Panel title={`${rows.length} account`}>
          <div className="table-wrap">
            <table className="admin-table" data-testid="admin-users">
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Tên</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Tạo lúc</th>
                  <th aria-label="Hành động" />
                </tr>
              </thead>
              <tbody>
                {rows.map((user) => {
                  const isSelf = principal?.username === user.username;
                  const busy =
                    roleMutation.isPending ||
                    revokeMutation.isPending ||
                    disableMutation.isPending ||
                    resetMutation.isPending;
                  const disabled = user.status === "DISABLED" || Boolean(user.disabledAt);
                  return (
                    <tr key={user.userId} data-testid={`admin-user-${user.username}`} data-self={isSelf}>
                      <td className="mono">
                        {user.username}
                        {/* The one mistake with no undo from this screen. */}
                        {isSelf ? <span className="admin-self">bạn</span> : null}
                      </td>
                      <td>{user.displayName}</td>
                      <td>
                        <select
                          className="input select-control admin-role"
                          aria-label={`Role của ${user.username}`}
                          value={user.role}
                          disabled={busy || disabled}
                          onChange={(event) => {
                            const role = event.target.value as UserRole;
                            if (role === user.role) return;
                            clear();
                            if (
                              !window.confirm(
                                `Đổi role của ${user.username} thành ${role}?\n\n` +
                                  `Mọi phiên đăng nhập hiện tại của họ sẽ bị thu hồi ngay.` +
                                  (isSelf ? `\n\nĐây là chính bạn — bạn sẽ phải đăng nhập lại.` : ""),
                              )
                            ) {
                              // Put the select back: it is a controlled value, so
                              // re-rendering from server state is enough.
                              refresh();
                              return;
                            }
                            roleMutation.mutate({ userId: user.userId, role });
                          }}
                        >
                          <option value="USER">USER</option>
                          <option value="ADMIN">ADMIN</option>
                        </select>
                      </td>
                      <td>
                        <StatusCell user={user} />
                      </td>
                      <td className="mono admin-created">{user.createdAt.slice(0, 10)}</td>
                      <td>
                        <div className="admin-actions">
                        <button
                          type="button"
                          className="btn-ghost"
                          disabled={busy || disabled}
                          onClick={() => {
                            clear();
                            if (
                              window.confirm(
                                `Cấp credential một lần mới cho ${user.username}?\n\n` +
                                  `Credential cũ sẽ không dùng được nữa và họ phải đặt password mới.`,
                              )
                            ) {
                              resetMutation.mutate(user);
                            }
                          }}
                        >
                          <KeyRound size={12} />
                          Reset credential
                        </button>
                        <button
                          type="button"
                          className="btn-ghost"
                          disabled={busy}
                          onClick={() => {
                            clear();
                            if (
                              window.confirm(
                                `Thu hồi mọi phiên của ${user.username}?\n\n` +
                                  `Họ sẽ bị đăng xuất khỏi mọi thiết bị ngay lập tức.`,
                              )
                            ) {
                              revokeMutation.mutate(user.userId);
                            }
                          }}
                        >
                          <LogOut size={12} />
                          Revoke sessions
                        </button>
                        </div>
                        {/* Destructive, and on its own rule below the ordinary
                          * actions: §13 asks that it not sit adjacent to them,
                          * and a row that scrolls the danger button off-screen
                          * would be worse than either. */}
                        <div className="admin-actions admin-actions-danger">
                        <button
                          type="button"
                          className="btn-ghost admin-danger"
                          disabled={busy || disabled}
                          onClick={() => {
                            clear();
                            if (
                              window.confirm(
                                `Vô hiệu hoá account ${user.username}?\n\n` +
                                  `Họ sẽ mất quyền truy cập Portal và mọi phiên bị thu hồi.` +
                                  (isSelf ? `\n\nĐây là chính bạn.` : ""),
                              )
                            ) {
                              disableMutation.mutate(user.userId);
                            }
                          }}
                        >
                          <ShieldOff size={12} />
                          Disable
                        </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      <Callout tone="muted">
        Portal không tạo account mới ở màn này trong v1.1 — provisioning đi qua
        <span className="mono"> deploy/control-api/bootstrap-users.yaml</span> để một account
        không thể xuất hiện mà không có bản ghi trong repo.
      </Callout>
    </div>
  );
}
