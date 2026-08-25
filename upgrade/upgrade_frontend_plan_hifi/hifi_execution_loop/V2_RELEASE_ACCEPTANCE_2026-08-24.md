# Execution Loop V2 — release acceptance package (EL-V2-09)

Ba tầng bằng chứng, thiếu một tầng là chưa đóng (supplement V2-09):

| Tầng | Trạng thái | Nguồn |
|---|---|---|
| 1 · Máy (gates) | **xanh** — số ở §1 | chuỗi gate cuối cùng trên `feat/execution_loop` |
| 2 · Dữ liệu thật (shadow parity) | **một phần**: parity fixture ↔ extract thật trong repo đã chạy (`SHADOW_PARITY_EXTRACT_2026-08-25.md`: 0 dòng không giải thích, 1 lệch thật → BR-EX-39); parity trên **shadow epoch** chờ BE-V2-F | `scripts/shadow-parity.mjs` + test |
| 3 · Mắt owner (sign-off) | **chờ Bobby** — 10 phase, 26 route baseline, 87 crop fixtures trên dev-portal :8080 | §5 |

## 1. Gates máy (chạy thật, commit cuối)

| Gate | Kết quả | Ghi chú |
|---|---|---|
| tsc | sạch | |
| vitest | **1,660 passed / 1 skipped (81 file)** | +9 `streamHardening`, +2 `shadowParity` |
| vite build | sạch | |
| Playwright `chromium` (flag off = rollback build) | 101 QuantBT visual **không tái sinh** + 87 fixtures crop + surface audit 40 (5 breakpoint: 390 · 834 · 1280 · 1728 · 1440) + interaction audit | non-regression Research/Planning |
| Playwright `chromium-preview` (flag on) | preview + journeys 65 (6 §8.2 + fold + sticky bar + guard probe + scope + budgets 17 route) + structural sweep **0 NO-OP** | 26 baseline route `el-v2-0N-*.png` |
| Tổng Playwright | **300 passed · 0 failed · 16 skipped** | chuỗi gate cuối 2026-08-25 |
| DOM budget | max **861** node / route (ngưỡng 8000) | 17 route preview |
| JS heap | **7–11 MB / route** qua CDP `Performance.getMetrics` (ngưỡng 200 MB); max Alpha 360 11 MB | 17 route preview |
| Perf 10⁵ dòng | 41 `<tr>` resident (cap 2000) | jsdom |
| Keyboard / focus / motion / ids / contrast | audit specs xanh | `execution-interaction-audit`, `execution-surface-audit` |

Non-regression: project `chromium` (flag preview **off** = delivery profile trước) chạy **101** baseline QuantBT
Research/Planning không tái sinh + toàn bộ audit — build rollback được chứng minh mỗi chuỗi gate.

## 2. Lane B activation record — từng màn / profile

| Screen | delivery_profile hiện tại | query | SSE | Trạng thái |
|---|---|---|---|---|
| Command Center | fixture | off | off (`stream_available=false` — không EventSource) | chờ BE-V2-G |
| Operations Queue · Incident · Admin drawer | fixture | off | — | chờ BE-V2-G; command relay DISABLED (F0) |
| Approval Inbox · R1 · R2 · Exit | fixture | off | — | chờ BE-V2-G |
| Paper · Paper VNM | fixture | off | off | **ứng viên đầu tiên** (Paper read-only) — chờ BE-V2-E/F/G + Bobby duyệt |
| Sandbox · Canary · Live | fixture | off | off | chờ; commands tối |
| Alpha 360 · Portfolio 360 · Account 360 · Blotter | fixture | off | — | chờ BE-V2-E (projection page) |

Không màn nào được kích hoạt trong V2-09: registry `query_enabled`/`realtime_enabled` = 0 (kiểm 2026-08-24),
`delivery_profile` = null trong registry. Frontend không suy diễn gate backend nào là xong.

## 3. Shadow parity harness

- `apps/portal/frontend/scripts/shadow-parity.mjs <fixture.json> <shadow.json>` — 4 lens: schema · state ·
  decimal (so **chuỗi**, không bao giờ round) · completeness (`*_count/has_more/truncated/total`). Exit 1 khi
  có dòng lệch; bảng lệch in ra, không giấu.
- Test: mọi fixture contract canonical parity với chính nó = 0 dòng; 5 loại lệch được đặt tên riêng.
- **Chưa chạy trên shadow thật** — chờ BE-V2-F publish epoch BUILDING + redacted export.

## 3b. Runbook kích hoạt Lane B — một màn / một profile / một commit

1. Codex giao handoff BE-V2-G cho **một** màn (endpoint, field, `delivery_profile`, mã lỗi/freshness, activation status) → ghi nhận trong `PHASE_TRACKER.md` (rule 8).
2. Chạy parity: `node scripts/shadow-parity.mjs packages/contracts/fixtures/<contract>.valid.json <shadow-export>.json` → 0 dòng không giải thích, dispositions vào `SHADOW_PARITY_*.md`.
3. Bobby duyệt đổi registry (`delivery_profile: "shadow"` trước, rồi `"source"`; `query_enabled` sau; `realtime_enabled` sau cùng) — **codex sửa registry**, frontend không.
4. Frontend: không đổi code — banner preview đọc `delivery_profile` từ registry và nói đúng nguồn (fixture / shadow / source); envelope authority/freshness hiển thị theo response.
5. Gate: chuỗi đầy đủ (tsc · vitest · build · audit · baselines route liên quan · full) + baseline route mới ghi `el-v2-09-<screen>-<profile>.png`.
6. Một commit `feat(execution): Lane B <screen> <profile>` + một dòng evidence; rollback = revert registry (codex) hoặc rebuild flag (frontend), diễn tập §5.

## 4. Hardening đã giao trong V2-09

| Hạng mục | Kết quả |
|---|---|
| Typed 401 / auth-expiry | preflight tuỳ chọn trước EventSource (401/403 ⇒ `AUTH_EXPIRED`); transport `error` sau deadline `auth.expiring` đã publish ⇒ `AUTH_EXPIRED`; UI: badge `SESSION EXPIRED` + alert "Sign in again…", **không retry câm**. Mapper hiểu `auth.expired`/`error.auth` nhưng **không subscribe** tên chưa publish (sse.test khoá danh sách edge) — câu hỏi §8.18 với codex vẫn mở |
| Gap / cursor / epoch / reconnect | giữ M3 (đã có); `DISCONNECTED` → reconnecting/failed typed |
| Backpressure | coalesce **thông báo** trong cửa sổ 250ms khi >8 delta (reducer vẫn nhận mọi delta — không bịa gap); `coalescedEvents` hiện trên badge |
| Source-loss | reducer + UI `SOURCE LOST` (values as read, last good as_of) — **chưa có tên sự kiện wire** từ edge |
| DOM / memory budget | e2e mỗi route preview: DOM ≤ 8000 node, JS heap ≤ 200MB — đo CDP: 7–11 MB/route (log `BUDGET route nodes= heapMB=`) |
| Perf 10⁵ dòng | 41 `<tr>` resident (cap 2000) |
| Anatomy đồng bộ | Alpha 360 · Portfolio 360 · Blotter lên `ExecutionWorkspace` (masthead + rail) — hết nợ V2-08 |
| Ledger | 17 `MISS` → **0**; 118 dòng đều có disposition |

## 5. Rollback rehearsal (dev-portal `portal` stack, stable :18081 không đụng)

Cơ chế: `compose.yaml` build arg `EXECUTION_PREVIEW_ENABLED` → `VITE_EXECUTION_PREVIEW_ENABLED` (build-time). Rollback = build lại với flag `false` + `up --force-recreate`; probe = hash bundle `index-*.js` được phục vụ (esbuild gấp hằng số nên không probe được literal — diễn tập #1/#2 dùng probe sai, ghi lại ở đây để không lặp).

```
== rollback rehearsal #3 2026-08-25T02:46:39Z · commit db5cbf5 · probe = served index bundle hash ==
-- forward (flag on, current): health 200 · bundle index-UKNAYSku.js
-- ROLLBACK (flag off): health 200 · bundle index-D6lxq6TJ.js · stable :18081 200
-- ROLL-FORWARD (flag on): health 200 · bundle index-UKNAYSku.js
== done 2026-08-25T02:47:59Z · Trading System / Postgres / Redis / CLI untouched ==
```

Kết luận: bundle rollback (`index-D6lxq6TJ.js`) ≠ bundle forward (`index-UKNAYSku.js`) và forward lặp lại **cùng hash** (build tất định); health 200 hai chiều; stable :18081 không đổi. Project Playwright `chromium` (flag off) là bản rollback ở mức build: 101 baseline Research/Planning + audits xanh trong mỗi chuỗi gate.

## 6. Giới hạn còn tắt — ghi tường minh

- **Command relay DISABLED** (F0): mọi Apply/Sync/Dry-run/Halt… disabled có lý do; không đường enable từ UI.
- **Live source off**: mọi màn fixture; SSE không mở khi `stream_available=false`.
- **Chưa có contract**: equity/series (BR-EX-34), history (35), REQUEST_CHANGES (36), known_limitations (37),
  smoke plan (38), incident_id trên queue row (33), alerts route, pin/unpin persistence, role-cut per panel.
- Sidebar 4 route chưa có màn (Promotion Timeline, Waivers & Conditions, Reconciliation, Alerts) — chờ contract
  danh sách; không render giả.
- BE-V2-B…G chưa accepted ⇒ **không màn nào Lane B**.

## 7. Chữ ký owner

| Phase | Bobby duyệt | Ghi chú |
|---|---|---|
| EL-V2-00 … EL-V2-09 | ☐ | mỗi phase có close-out trong handoff; baseline route `el-v2-0N-*.png`; dev-portal :8080 |

Merge/release vào `dev`/`main` là quyền của Bobby.
