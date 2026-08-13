# Kế hoạch migration portal — 5 phase

> Trạng thái: **Phase 4 hoàn tất implementation local — chờ UAT gateway** · Ngày lập: 2026-08-11
> Chủ dự án đã duyệt tiếp tục Phase 4 qua yêu cầu ngày 2026-08-13. Các contract
> Phase 1–3 vẫn là ràng buộc bắt buộc; không bỏ qua integrity/rollback gate.

## 1. Mục tiêu và nguyên tắc không được vi phạm

Mục tiêu là chuyển portal hiện tại từ một HTML đơn tệp sang một ứng dụng có cấu trúc `src/`, component rõ ràng, backend task/roadmap có domain nhẹ và Discord notification—đồng thời nhúng nhẹ không gian Interpretation vào cùng portal.

Các ràng buộc là hợp đồng bắt buộc:

1. **Không sửa nội dung.** Toàn bộ text, heading, table, code block, link, thứ tự section, `id`, `data-page-id`, title và nội dung HTML của các trang tài liệu phải giữ nguyên.
2. **Không sửa Mermaid.** Mọi khối Mermaid, gồm cả whitespace/source trong `.mermaid-source`, phải giữ nguyên từng byte. Chỉ renderer/wrapper xung quanh có thể thay đổi.
3. **Giữ bố cục và luồng.** Các vùng Docs, Roadmap, Task Board, Reports, Evidence và Manager Portal vẫn ở cùng thứ tự, cùng vai trò và cùng các thao tác hiện có (theme, search, copy, print, filter, drag task, export, API/local mode).
4. **Chỉ được modernize lớp trình bày.** Có thể thay token màu, background, skin component, icon và tổ chức DOM/component. Không được thêm/bớt/nội suy nội dung của tài liệu gốc.
5. **Giữ tương thích dữ liệu.** Các khóa `localStorage` hiện hữu—`quantPortalTasksV1`, `quantPortalPhasesV1`, `quantBoardViewV1`, `quantPortalTheme`—và API cũ `/api/tasks`, `/api/roadmap`, `/api/health` được duy trì trong đợt migration đầu.
6. **Không chuyển portal thành Jira nặng.** Chỉ quản lý task, roadmap, activity log và notification; dependency giữa task vẫn là mảng ID tham chiếu, không có workflow engine, sprint, issue hierarchy hay permission matrix phức tạp.

`quant_trading_ecosystem_architecture_migration_portal_vi.html` là golden source cho nội dung. Nó vẫn được giữ nguyên cho đến khi portal mới được nghiệm thu và có phương án rollback.

## 2. Visual contract: một hệ màu, không pha trộn tùy tiện

Hai nguồn tham khảo là:

- `../InterpretationBot/index.html` và `../InterpretationBot/docs/uiux-design.md`.
- [BobbyAxerol/awesome-quant-portal frontend](https://github.com/BobbyAxerol/awesome-quant-portal/tree/main/frontend), đặc biệt `src/styles/tokens.css`, `components/ui.tsx` và `components/shell.tsx`.

Chuẩn màu duy nhất sẽ lấy từ frontend `awesome-quant-portal`; `InterpretationBot` xác nhận cùng ngôn ngữ thiết kế và catalog component. Không mang thêm palette xanh dương của portal hiện tại sang giao diện mới.

| Vai trò | Token đích | Giá trị |
| --- | --- | --- |
| Nền chính / thẻ nổi / nền chìm | `--paper` / `--paper-raised` / `--paper-sunken` | `#FAF9F5` / `#FFFFFF` / `#F4F2EC` |
| Chữ chính / phụ / mờ | `--ink` / `--ink-soft` / `--ink-faint` | `#1C2532` / `#4E5A6E` / `#939DB0` |
| Viền / viền phụ | `--line` / `--line-soft` | `#E3E0D7` / `#EFEDE4` |
| Teal cấu trúc | `--accent` / `--accent-soft` | `#0F4C5C` / `#E2EDF0` |
| Amber nhấn | `--accent-2` / `--accent-2-soft` | `#9A6A1F` / `#F4ECDB` |
| Trạng thái pass / fail | `--good` / `--good-bg`, `--bad` / `--bad-bg` | `#1E7B4F` / `#E3F1E9`, `#B43A3A` / `#F7E8E8` |

Quy tắc thực thi:

- Giá trị hex chỉ tồn tại trong `tokens.css`; component chỉ dùng semantic token.
- Giữ scale, hierarchy và vị trí shell hiện tại để nội dung không nhảy vùng; font mặc định hiện hữu được giữ ở phase đầu. Chỉ thay typography khi screenshot/layout contract chứng minh không đổi line-wrap quan trọng.
- Chuẩn hóa component theo `Card`, `Chip`, `Badge`, `Button`, `Input`, `Tabs`, `StateView`, `DefinitionList`, `Collapsible`, `ChartFigure`. Các biến thể Task/Roadmap vẫn là component domain riêng, không ép mọi thứ thành generic UI.
- Có `:focus-visible`, `prefers-reduced-motion`, responsive và print stylesheet như hai nguồn tham khảo.

## 3. Kiến trúc đích (sau khi hoàn tất cả 5 phase)

```text
MigrationAccquirePlan/
├── legacy/
│   └── portal.html                    # bản golden, byte-preserved, chỉ đọc
├── frontend/
│   ├── src/
│   │   ├── app/                        # App, router/hash compatibility, providers
│   │   ├── content/                    # raw document fragments, seed data, integrity manifest
│   │   ├── components/
│   │   │   ├── ui/                     # primitive theo design token
│   │   │   └── shell/                  # topbar, navigation, layout
│   │   ├── features/
│   │   │   ├── docs/                   # doc pages + Mermaid renderer/copy
│   │   │   ├── tasks/                  # kanban, table, editor, activity
│   │   │   ├── roadmap/                # roadmap view/editor
│   │   │   ├── reports/                # nội dung Reports hiện hữu + entry embed
│   │   │   └── interpretation/         # embedded interpretation surface, lazy loaded
│   │   ├── lib/                        # typed API, storage migration, format, errors
│   │   ├── styles/                     # tokens, base, print, feature styles
│   │   └── test/                       # helpers, fixtures, visual/layout contracts
│   ├── e2e/                            # Playwright critical-flow tests
│   └── package.json
├── backend/
│   ├── app/
│   │   ├── api/                        # routes + request/response schemas
│   │   ├── domain/                     # task, roadmap, activity, notification rules
│   │   ├── infrastructure/             # SQLite repositories, Discord client, outbox worker
│   │   └── main.py
│   ├── tests/
│   └── pyproject.toml
├── docs/                               # architecture, API, runbook, ADR
└── upgrade/                            # kế hoạch và approval record
```

Lựa chọn có chủ đích:

- **Frontend:** React + TypeScript + Vite. Đây là cùng hướng với `awesome-quant-portal`, giúp tái dùng đúng cách phân ranh shell/component/API mà không sao chép mù quáng UI của nó.
- **Backend:** FastAPI + Pydantic + SQLite. SQLite đủ cho portal nội bộ một nhóm, không cần dịch vụ database riêng; FastAPI cho OpenAPI, schema validation và test API rõ ràng.
- **Không iframe:** Interpretation được lazy-load như một feature cùng design token/shell. Iframe dễ lệch theme, focus, responsive và print. Nội dung Reports hiện hữu vẫn được giữ nguyên; entry sang embedded interpretation là bề mặt bổ sung, không thay thế hay sửa report gốc.
- **Strangler migration:** frontend/backend mới đi song song với HTML + `server.py` cũ. Chỉ đổi default sau UAT; rollback là quay về legacy artifact và JSON export, không mất nội dung.

## 4. Domain task/roadmap nhẹ

### 4.1 Aggregate và trạng thái

| Aggregate | Thuộc tính chính | Ghi chú |
| --- | --- | --- |
| `Task` | `id`, `title`, `workstream`, `phase`, `weeks`, `priority`, `owner`, `status`, `position`, `notes`, `depends`, `created_at`, `updated_at`, `deleted_at`, `version` | Giữ toàn bộ field đang có; `position` lưu thứ tự kéo-thả; `depends` chỉ là danh sách string, không enforce graph. |
| `RoadmapPhase` | `id`, `name`, `start`, `end`, `position`, `owner`, `tone`, `outcome`, `deleted_at`, `version` | Giữ schema `ROADMAP_PHASES` hiện tại; `position` chỉ phục vụ thứ tự hiển thị. |
| `ActivityEvent` | `id`, `entity_type`, `entity_id`, `type`, `actor`, `occurred_at`, `before`, `after`, `metadata` | Append-only audit chung cho Task và Roadmap; ghi snapshot/delta JSON, không cần mô hình liên kết phức tạp. |
| `WebhookDelivery` | `id`, `activity_id`, `event_type`, `status`, `attempt_count`, `last_error`, `created_at`, `sent_at` | Outbox tối giản để task update không phụ thuộc Discord đang online. |

Trạng thái canonical vẫn hiển thị đúng nhãn hiện tại: `Backlog`, `Ready`, `In Progress`, `Validating`, `Done`. Chỉ cho phép transition theo bảng sau để không sinh noise:

| Từ | Đến | Bắn Discord? |
| --- | --- | --- |
| Bất kỳ trạng thái khác `In Progress` | `In Progress` | Có |
| Bất kỳ trạng thái khác `Validating` | `Validating` | Có |
| Bất kỳ trạng thái khác `Done` | `Done` | Có |
| Các thay đổi khác, edit field, reorder | Trạng thái còn lại | Không, chỉ activity log |

Kéo thả vẫn là thao tác chính. Nếu task chuyển status, UI gửi một transition; backend kiểm tra `version` để tránh ghi đè đồng thời. Khi xung đột, UI tải lại task và thông báo rõ ràng—không tự động làm mất chỉnh sửa.

### 4.1.1 Quy tắc lưu state và audit log

Task Board và Roadmap là **dữ liệu vận hành thay đổi được**, không thuộc vùng nội dung bị freeze. Seed `BASE_TASKS` và `ROADMAP_PHASES` chỉ là baseline khởi tạo; sau lần import đầu tiên, database là nguồn state hiện hành.

| Thao tác | State hiện hành trong database | Activity event |
| --- | --- | --- |
| Tạo task/phase | Tạo row mới, khởi tạo `version=1` | `task.created` / `roadmap_phase.created` |
| Sửa title, owner, priority, note, tuần, phase, mốc roadmap… | Update row, tăng `version` | `task.updated` / `roadmap_phase.updated`, có `before`/`after` cho field đổi |
| Kéo task trong cùng cột | Update `position`, tăng `version` | `task.reordered`, có vị trí trước/sau |
| Kéo task sang cột khác | Update `status` + `position` cùng transaction | `task.status_changed`, có status/vị trí trước/sau |
| Đổi status từ table/editor | Update `status` cùng transaction | `task.status_changed`, có status trước/sau |
| Di chuyển/resize phase roadmap | Update `start`, `end` và/hoặc `position` | `roadmap_phase.rescheduled` / `roadmap_phase.reordered` |
| Xóa task/phase | Soft-delete (`deleted_at`), không mất row/audit | `task.deleted` / `roadmap_phase.deleted` |
| Khôi phục | Xóa `deleted_at`, đặt lại vị trí hợp lệ | `task.restored` / `roadmap_phase.restored` |
| Ghi hàng loạt qua API legacy | Cập nhật atomically sau validation | `task.snapshot_replaced` / `roadmap.snapshot_replaced`, kèm summary thay đổi |

`actor` ở bản đầu là danh tính phiên cục bộ cấu hình được (ví dụ `bobby`, `local-user` hoặc `system` khi import); chưa cần RBAC/SSO. Activity có thể hiển thị như history gọn ở drawer task/phase và export cùng dữ liệu để audit/rollback.

### 4.2 API và Discord

- Tương thích: duy trì `GET|PUT /api/tasks`, `GET|PUT /api/roadmap`, `GET /api/health` với JSON hiện hữu cho legacy client.
- API mới có version: `GET|POST /api/v1/tasks`, `GET|PATCH|DELETE /api/v1/tasks/{id}`, `POST /api/v1/tasks/{id}/restore`, `POST /api/v1/tasks/{id}/transition`, `POST /api/v1/tasks/{id}/move`, `GET /api/v1/tasks/{id}/activity`; `GET|POST /api/v1/roadmap`, `PATCH|DELETE /api/v1/roadmap/{id}`, `POST /api/v1/roadmap/{id}/restore`, `POST /api/v1/roadmap/{id}/move`, `GET /api/v1/roadmap/{id}/activity`.
- Request/response dùng schema Pydantic, validation rõ cho enum status, priority, `weeks`, độ dài title/notes và schema array `depends`.
- `DISCORD_WEBHOOK_URL` chỉ đọc từ environment, không commit, không trả về client. Payload có task id/title, owner, workstream, trạng thái cũ/mới, actor, timestamp và URL portal; không gửi note nhạy cảm nếu chưa có chính sách riêng.
- Outbox ghi cùng transaction với `TaskActivity`; worker retry với backoff giới hạn. Task update thành công dù Discord lỗi, và lỗi delivery được quan sát qua log/API nội bộ. Idempotency dựa trên activity id để không gửi trùng.

## 5. Kế hoạch 5 phase

### Phase 1 — Freeze, inventory và test contract

**Mục tiêu:** có baseline máy kiểm được trước khi bất kỳ component/UI nào bị tách.

**Công việc:**

1. Tag commit baseline; copy nguyên vẹn HTML hiện tại thành `legacy/portal.html` và chỉ đọc trong CI.
2. Viết extractor tạo `content-integrity-manifest.json`: SHA-256 cho từng `.doc-page` (text + markup), từng `mermaid-source`, code block, link và seed data; lưu danh sách `id`, `data-page-id`, heading, API endpoint, localStorage key và hash-route.
3. Chụp screenshot chuẩn ở 1440, 1024, 768, 390 px cho Docs, Roadmap, Board, Reports, Evidence, Portal ở light/dark. Lưu layout anchors (vị trí/kích thước shell, sidebar, header, content, board column) để đo geometry thay vì so pixel màu.
4. Ghi user-flow hiện hữu: mở tệp static/localStorage, khởi động API, chuyển view, hash navigation, Mermaid render/copy, search, đổi theme, kéo task, lọc/xuất/reset task, sửa Roadmap và print.
5. Chốt ADR: React/Vite + FastAPI/SQLite, không iframe, API compatibility, strategy rollback.

**Test/gate bắt buộc:**

- Integrity test đọc golden và tái tính toàn bộ manifest; khác dù một ký tự hay một whitespace Mermaid là fail.
- Playwright baseline smoke cho các flow trên; test server cũ `/`, `/api/health`, `/api/tasks`, `/api/roadmap`.
- UAT: chủ dự án xác nhận manifest và screenshot là baseline hợp lệ.

**Đầu ra:** `docs/adr/`, `docs/contracts/`, manifest, fixture JSON, screenshot baseline và test harness. Không thay UI production.

### Phase 2 — Frontend foundation, shell và design system thống nhất

**Mục tiêu:** tạo frontend có component/`src` rõ nhưng chỉ đổi presentation layer theo visual contract.

**Công việc:**

1. Scaffold `frontend/` với TypeScript, Vite, React, router/hash adapter, typed API client và storage adapter. Chỉ đưa dependency cần thiết: React, Mermaid, test runner và Playwright; không dùng cả framework UI nặng.
2. Thêm `tokens.css`, `base.css`, `print.css`; áp dụng palette Fund Paper ở mục 2, không raw hex trong feature/component.
3. Tạo primitive và shell: `PortalShell`, topbar, sidebar/navigation, tabs, card, button, input, badge/chip, modal, toast, state view, table wrapper, chart/diagram frame.
4. Gắn nguyên khối content document bằng raw fragment theo manifest. Component chỉ render/wire action, không convert sang prose/Markdown và không chỉnh source Mermaid.
5. Giữ URL hash cũ đọc được; mọi href/copy/print/theme behavior tương đương. Tạo build mới chạy ở mode song song (`legacy` vs `new`), chưa flip default.

**Test/gate bắt buộc:**

- Unit: token-only lint, router/hash adapter, storage adapter, Mermaid source/copy.
- Integrity manifest 100% trùng Phase 1; test DOM xác nhận tất cả page id, heading, link, table/code/Mermaid count trùng.
- Playwright geometry/screenshot review ở 4 viewport; cho phép khác màu, shadow, border radius và component skin, không cho phép mất/đảo vùng, overflow vô lý hoặc thay đổi responsive breakpoint.
- UAT: duyệt visual language trước khi chuyển Task/Roadmap sang component mới.

**Đầu ra:** frontend build chạy song song, design-system catalog, accessibility/print baseline. Chưa thay backend và chưa có Discord.

### Phase 3 — Feature migration và embedded Interpretation

**Mục tiêu:** tách các view hiện có thành domain feature, vẫn chạy local-first, thêm bề mặt Interpretation mà không làm mất Reports cũ.

**Công việc:**

1. Tách `features/docs`: page selector, context tab, TOC, search, Mermaid renderer, copy and print. Nội dung raw vẫn là nguồn duy nhất.
2. Tách `features/tasks`: Kanban + table view, filter/search, drag/drop, editor, reset/export; giữ schema data và localStorage behavior.
3. Tách `features/roadmap`: timeline, CRUD UI, local persistence/export; giữ naming, phase, colour tone semantics và input flow hiện tại.
4. Tách `features/reports`, `evidence`, `manager-portal` theo screen đang có, không đổi thứ tự/copy hiện hữu.
5. Thêm `features/interpretation` như route/subview lazy-load trong shell chung. Điểm vào được đặt cạnh Reports, nhưng Reports cũ mở đúng nội dung gốc mặc định; không iframe và không chỉnh copy report hiện có.
6. Ghi document map “legacy selector → component → test ID” để các component không lẫn vai trò.

**Test/gate bắt buộc:**

- Vitest/Testing Library cho rendering task card, status badge, drag/drop, roadmap editor, search and theme.
- Playwright E2E localStorage: edit task/roadmap → reload → state còn; export JSON; reset; navigate bằng hash; theme; Mermaid copy/render; print mode.
- Contract test khẳng định mọi content/Mermaid hash vẫn bằng baseline; test interaction không làm đổi `BASE_TASKS`/`ROADMAP_PHASES` seed.
- UAT: duyệt vị trí embedded Interpretation và tất cả task/roadmap flow trước khi đưa persistence server mới vào.

**Đầu ra:** toàn bộ UI được component hóa trong `frontend/src`; legacy page vẫn là fallback có thể chạy riêng.

### Phase 4 — Backend domain, persistence và Discord webhook

**Mục tiêu:** thay file-backed persistence bằng API có validation, audit nhẹ và notification đáng tin cậy.

**Công việc:**

1. Tạo `backend/` FastAPI: config, migrations SQLite, repositories, Pydantic schema, error envelope và OpenAPI docs.
2. Implement domain `Task`, `RoadmapPhase`, `ActivityEvent`, `WebhookDelivery`; tạo/sửa/kéo-thả/xóa mềm/khôi phục đều cập nhật state và append audit event trong cùng transaction. Import một lần dữ liệu JSON/localStorage theo thao tác rõ ràng, không tự overwrite state của người dùng.
3. Triển khai legacy adapter cho bốn endpoint đang dùng và typed `/api/v1` endpoints mới, gồm transition/move/restore/activity. Frontend có feature flag để chuyển từng view từ local adapter sang API adapter.
4. Implement transition command + optimistic version, immutable activity timeline và outbox/retry Discord. Webhook chỉ bắn khi task vào `In Progress`, `Validating`, `Done`.
5. Thêm health/readiness, structured log, export JSON, database backup/restore runbook và `.env.example` không chứa secret.

**Test/gate bắt buộc:**

- Domain unit test: create/update/move/transition/delete/restore, version conflict, soft-delete filtering, activity append-only và before/after delta, status mapping, payload redaction/idempotency.
- API integration test với SQLite tạm: schema validation, CRUD, legacy compatibility, pagination/filters nếu có, export/import và rollback.
- Webhook test bằng fake Discord endpoint: đúng event, retry/backoff, Discord fail không rollback task, không gửi trùng.
- E2E: kéo task → refresh/browser khác thấy state mới → activity hiện → fake Discord nhận một event; Roadmap update vẫn đúng.
- Security review: secret không trong git/log/API, CORS allowlist theo môi trường, loopback/dev vs production config tách biệt.

**Đầu ra:** backend có API docs, domain docs, migration scripts, runbook và alert behavior được kiểm chứng.

### Phase 5 — Parity release, migration switch và vận hành

**Mục tiêu:** nghiệm thu parity, chuyển default an toàn và để lại hệ thống dễ bảo trì.

**Công việc:**

1. Chạy full build/test/lint/typecheck, content integrity, visual/layout review và regression matrix trên browser target.
2. Dry-run migrate Task/Roadmap vào SQLite; đối chiếu số lượng, ID, status, phase và timestamp; export trước/sau migration để rollback được.
3. Progressive rollout: legacy là default, new portal opt-in; sau UAT mới flip new default. Giữ switch rollback trong ít nhất một release window.
4. Viết tài liệu: architecture, component catalog, content authoring rule, API/OpenAPI, Discord setup, local/prod runbook, backup/restore, troubleshooting và contribution guide.
5. Dọn technical debt đã được duyệt; không xóa legacy/golden source hay API compatibility trước khi có sign-off riêng.

**Test/gate bắt buộc:**

- CI phải xanh: frontend unit/type/build, backend unit/integration, integrity manifest, E2E critical flow.
- Manual UAT checklist: toàn bộ 6 view, documents, Mermaid, copy, search, print, theme, responsive; Task/Roadmap API; Discord notification cho 3 trạng thái.
- Parity sign-off: content hash 100%, Mermaid hash 100%, no regression blocker, backup/restore dry-run pass.
- Go-live chỉ sau approval của chủ dự án; nếu không đạt, bật legacy default và khôi phục DB export.

**Đầu ra:** new portal là default khi được duyệt, legacy artifact còn nguyên để rollback, toàn bộ tài liệu vận hành hoàn chỉnh.

## 6. Ma trận kiểm thử bắt buộc

| Lớp | Công cụ dự kiến | Điều cần khóa |
| --- | --- | --- |
| Nội dung | Node/Python manifest test | text/markup docs, ids, links, code blocks, seed data và Mermaid byte hash. |
| Component | Vitest + Testing Library | state, accessibility, rendering đúng các component/UI primitive. |
| API/domain | Pytest + test SQLite + fake webhook | validation, transition, activity, outbox, compatibility API. |
| Luồng người dùng | Playwright | static/local mode, API mode, task/roadmap, search/theme/print/Mermaid. |
| Bố cục | screenshot + anchor geometry snapshot | desktop/tablet/mobile không mất vùng hoặc thay đổi thông tin/lộ trình thao tác. |
| Vận hành | dry-run migrate/backup/restore | không mất task/roadmap, rollback được, Discord không block update. |

## 7. Tiêu chí nghiệm thu cuối

Chỉ chấp nhận migration khi đồng thời thỏa tất cả:

1. 100% manifest content và Mermaid trùng golden baseline.
2. Mọi luồng hiện hữu hoạt động ở browser static/local và qua API tương thích.
3. Design token chỉ dùng một hệ Fund Paper; không có màu component tự phát ngoài token.
4. Task chuyển `In Progress`, `Validating`, `Done` tạo activity và một Discord event có thể audit; lỗi Discord không làm hỏng update.
5. Source được chia theo `app/components/features/lib/styles/content`, không còn một file điều khiển toàn bộ ứng dụng.
6. Có test, API docs, runbook, backup/restore và fallback legacy đã được diễn tập.

## 8. Ngoài phạm vi (trừ khi được duyệt riêng)

- Viết lại hay biên tập bất kỳ văn bản/diagram/Mermaid/link nào trong tài liệu hiện tại.
- Thay đổi domain trading, backtest, Alpha, live execution hoặc nội dung của các repository tham chiếu.
- RBAC/SSO, workspace multi-tenant, sprint, epics, automation engine, full issue graph hoặc hàng đợi message broker.
- Gửi Discord thật trước khi có webhook URL, channel policy và approval môi trường.

## 9. Approval record

| Mục | Giá trị |
| --- | --- |
| Kế hoạch được duyệt? | Có — yêu cầu triển khai Phase 4 |
| Phase đã thực hiện | Phase 4 (backend, persistence, API adapter, runbook) — hoàn tất gate local ngày 2026-08-13 |
| Người duyệt / thời điểm | Chủ dự án · 2026-08-13 |
| Ghi chú thay đổi phạm vi | Giữ local-first/legacy default; API V1 là feature flag. Source mới chỉ được commit local; cần push/promotion và UAT gateway trước rollout parent. |

Phase 5 chỉ bắt đầu sau khi Phase 4 được UAT qua gateway, có backup/restore
dry-run và chủ dự án duyệt rollout.
