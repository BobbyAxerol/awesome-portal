# HOTFIX REQUEST 2026-08-30 — @codex

## 1. `EXECUTION_ADMIN_ACTIONS.navigation.show_in_sidebar: false → true`

**File (codex-owned):** `apps/portal/registry/fixtures/registry.public.json` (+ registry nguồn
backend đang serve).

**Hiện trạng:** owner review 2026-08-30 chỉ ra nhóm ADMINISTRATION trong sidebar chỉ có
"Profile & Access" — màn Admin Actions (WF 1i, vừa recompose xong) không vào được từ sidebar.
Nguyên nhân đo được: trong 9 feature EXECUTION_* của registry, **duy nhất**
`EXECUTION_ADMIN_ACTIONS` mang `"show_in_sidebar": false` (8 feature còn lại đều `true`, cùng
maturity `COMMISSIONED`). Sidebar render thuần từ registry (rule U03 — frontend không được
hard-code nav), nên frontend không tự sửa được.

**Yêu cầu:** flip 1 flag `show_in_sidebar` → `true` cho `EXECUTION_ADMIN_ACTIONS`. Không cần đổi
gì khác — order 20 đã đặt sẵn, route `/administration/actions` đã được preview claim, command
palette đã thấy nó (`show_in_command_palette: true` — bằng chứng flag sidebar là sơ suất, không
phải chủ đích).

**Ảnh hưởng nếu không sửa:** màn WF 1i chỉ vào được bằng URL trực tiếp / palette / link từ Ops
Queue·Incident·Paper·Accounts — owner đã yêu cầu nó có mặt ở sidebar.

## 2. Registry rows cho 3 màn governance owner-commissioned (2026-08-30)

Owner giao làm ngay 3 màn (ROADMAP §H.2): **New approval request**
(`/governance/approvals/new`), **Gate LIVE review**
(`/governance/approvals/:approvalId/live`), **Waivers & Conditions**
(`/governance/waivers`). Route trong app render từ `registry.screens`, nên cần
codex thêm **3 screen row** (feature: EXECUTION_APPROVALS cho 2 cái đầu; màn
waivers có thể nằm dưới EXECUTION_APPROVALS hoặc feature governance mới —
codex quyết; nếu muốn waivers có mặt ở sidebar thì thêm feature row +
`show_in_sidebar`).

Screen id đã dùng phía frontend (giữ đúng để preview claim khớp):
`EXECUTION_NEW_APPROVAL_REQUEST_SCREEN` · `EXECUTION_GATE_LIVE_REVIEW_SCREEN`
· `EXECUTION_WAIVERS_REGISTER_SCREEN`.

**Tạm thời** frontend claim 3 path này qua `EXECUTION_PREVIEW_EXTRA_ROUTES`
(previewRegistry.ts — cơ chế preview có sẵn, gỡ ngay khi registry row về);
`previewRegistry.test.ts` ghi danh sách pending chính xác nên registry row về
là test tự bắt mình cập nhật. Đồng thời `LIVE_GATE` trong Inbox đã đổi đích
`…/r2` → `…/live` (ROADMAP §H.2.2).
