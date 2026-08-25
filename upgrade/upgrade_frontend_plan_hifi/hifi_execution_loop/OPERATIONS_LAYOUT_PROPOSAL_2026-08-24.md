# Operations · incident · command — layout proposal đo bằng px (EL-V2-07, §14.5)

Cùng khung 1440×900 (main 780 · rail 340 · fold 828) như Paper/Governance. Bốn màn là **một** workflow:
Command Center xếp hạng → Queue chọn dòng (rail đổi theo dòng) → Incident (containment ghim trên) →
Action Drawer (PLAN/APPLY/VERIFY trong terminal §9.2) → về Queue.

| Màn | Masthead | Strip | Canvas | Tabs | Rail |
|---|---|---|---|---|---|
| Command Center (5a) | "Good morning, Stan" · badge `BUSY · n` / `QUIET` · `n CRITICAL` · stream state | fleet health (số mono, nhãn ngắn) — **sau** danh sách | **Needs you now — ranked** (rank server; fallback severity→SLA→age; không theo thứ tự mảng) | Pinned · Today | Next = #1 + Open · Blockers = CRITICAL · Freshness = as_of/stream · Provenance = workspace/profile/epoch |
| Operations Queue (4e) | "Operations Queue" · `n NEED ATTENTION` · source | in view · total · need attention · partial · unacknowledged | bảng op·command·target·source·verify·triage·age·actor | — (filter chips) | **Next = triage của dòng đang chọn** (ack ≠ resolve) · Blockers = dòng cần attention · Alerts = "no alerts route" · Provenance = profile/sort |
| Incident (4d) | `inc_44 — title` · badge state / severity / env | severity · operations · evidence refs · events · gate | state rail forward-only (`exec-inc-rail`) + **containment hiện tại** | Evidence (source panels + refs + annotations) · Timeline · Operations | Next = containment + next action (op đầu → Drawer) · Blockers = resolution gate codes · Provenance = evidence hashes |
| Action Drawer (1i) | "Admin actions" · badge relay DISABLED · revision | actions · reachable · groups · tier filter | catalogue theo nhóm server (`exec-admin-row`) | — (tier chips) | **Command detail** (`aria-label` giữ): tier/steps/route/blocked reason + **terminal §9.2** khi có plan |

**Terminal §9.2:** `ExecutionTerminal` — toolbar (verdict · source · follow/pause · copy · export · clear · expand),
cột ts · phase · object · message; typed rows PLAN/APPLY/VERIFY/GAP/RECONNECT/ERROR; cao 220–320px expand
được; verdict `ACCEPTED` = "202 accepted — not success yet" cho tới khi outcome VERIFIED/PARTIAL/FAILED.

**Break-glass:** không có entry catalogue nào mang ceremony break-glass (contract chưa publish) ⇒ không render
nút; test âm tính khẳng định không có control nào có tên "break-glass".
