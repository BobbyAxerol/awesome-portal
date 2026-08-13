# Roadmap & Task Board — Quant Ecosystem

> **Mục đích:** chốt phương án migration/acquisition và theo dõi task triển khai để
> **manager xem và duyệt**. Đây **không phải** trang nổi bật của hệ sinh thái quant:
> trong hệ thống cha (đường dẫn mẹ), portal này chỉ được truy cập từ **Settings**
> hoặc **mục quản lý Task** — không đặt ở top-level wireframe.
> Chi tiết: [docs/MIGRATION_TRACKER_PURPOSE.md](docs/MIGRATION_TRACKER_PURPOSE.md).

Nội dung gồm: đánh giá hiện trạng từng layer (16 tài liệu), kế hoạch 6 phase P0–P5
(Roadmap), Task Board Kanban (36 task), Evidence đối chiếu repo/artifact, Reports
tóm tắt cho manager, và một **mockup minh họa** Manager Platform (view "Portal" —
truy cập từ sidebar → Settings, không nổi bật).

Source này là một feature được track trực tiếp trong Portal monorepo. CI/CD và
release dùng workflow ở root Portal; không tạo repo Git hoặc pipeline độc lập ở
thư mục này.

## Chạy cục bộ

Không cần cài dependency:

```bash
python3 server.py
```

Mở `http://127.0.0.1:8000`.

Không chạy backend, bạn vẫn có thể mở trực tiếp tệp HTML; trạng thái Task Board và Roadmap khi đó chỉ nằm trong `localStorage` của trình duyệt. Khi chạy `server.py`, hai trạng thái này được lưu cục bộ tại `data/tasks.json` và `data/roadmap.json`; đây là dữ liệu runtime nên không được đưa vào Git.

### Backend Phase 4 có audit trail (khuyến nghị cho Task Board/Roadmap)

Backend mới dùng SQLite, audit log và Discord outbox, đồng thời vẫn phục vụ nguyên portal HTML cùng các endpoint API cũ:

```bash
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements-dev.txt
.venv/bin/python -m backend.app
```

Mở `http://127.0.0.1:8000`; tài liệu API ở `/api/docs`, readiness ở
`/api/ready`. Backend dùng SQLite migration forward-only, optimistic version,
soft-delete, activity append-only và Discord outbox lease/retry. Xem [tài liệu
backend](docs/TASK_ROADMAP_BACKEND.md) để biết domain, API, backup/restore và
cấu hình Discord.

### Frontend V2 (chạy song song, chưa flip default)

Frontend mới (React + TypeScript + Vite, design system Fund Paper) chạy song song với legacy:

```bash
cd frontend && npm install && npm run dev
```

Mở `http://127.0.0.1:5173` (proxy `/api` → `127.0.0.1:8000` khi backend chạy).
Mặc định frontend giữ adapter compatibility; chỉ đặt
`VITE_ROADMAP_TASK_BOARD_PERSISTENCE=v1` trong môi trường đã UAT để bật API
versioned. Khi database V1 trống, UI yêu cầu xác nhận khởi tạo từ local state,
không tự overwrite workspace server. Nội dung docs được mang nguyên khối
(byte-exact) từ bản freeze `legacy/portal.html`; xem [kế hoạch migration](upgrade/KE_HOACH_MIGRATION_5_PHASE.md), [catalog design system](docs/design-system-catalog.md) và `docs/adr/0001-portal-architecture.md`.

### Phase 5 release candidate

The candidate has browser parity tests, root Portal CI and an operations handoff.
Run `npm run e2e` from `frontend/` after installing Chromium, then see
[`docs/PHASE5_RELEASE_CHECKLIST.md`](docs/PHASE5_RELEASE_CHECKLIST.md) for the
parent gateway/UAT sequence. Generated output can be removed safely with
`tooling/clean-generated.sh`; use `--dependencies` only when reinstalling from
the lockfile is acceptable.

## Cấu trúc hiện tại

| Đường dẫn | Vai trò |
| --- | --- |
| `quant_trading_ecosystem_architecture_migration_portal_vi.html` | Toàn bộ nội dung, CSS và JavaScript của portal. |
| `legacy/portal.html` | Bản freeze (golden) của portal tại dòng mốc `portal-baseline-v1`. |
| `server.py` | HTTP server cục bộ và API lưu Task Board/Roadmap, chỉ dùng Python standard library. |
| `backend/` | FastAPI + SQLite backend có audit log, soft-delete và Discord webhook outbox. |
| `frontend/` | Frontend V2: React + TS + Vite, design system Fund Paper, nội dung byte-exact theo manifest. |
| `docs/RESTRUCTURING_BASELINE.md` | Bản đồ hiện trạng và các ranh giới đề xuất trước khi tách mã. |

Xem [baseline tái cấu trúc](docs/RESTRUCTURING_BASELINE.md) trước khi thay đổi cấu trúc. Mục tiêu của đợt tách đầu tiên là giữ nguyên hành vi và giao diện hiện có.
