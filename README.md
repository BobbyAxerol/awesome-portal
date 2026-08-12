# Primus Spark Quant Ecosystem — Migration Portal

Một portal tĩnh bằng tiếng Việt để lưu trữ đánh giá hiện trạng, kế hoạch acquisition/migration và bản demo Manager Portal cho hệ sinh thái giao dịch định lượng.

## Chạy cục bộ

Không cần cài dependency:

```bash
python3 server.py
```

Mở `http://127.0.0.1:8000`.

Không chạy backend, bạn vẫn có thể mở trực tiếp tệp HTML; trạng thái Task Board và Roadmap khi đó chỉ nằm trong `localStorage` của trình duyệt. Khi chạy `server.py`, hai trạng thái này được lưu cục bộ tại `data/tasks.json` và `data/roadmap.json`; đây là dữ liệu runtime nên không được đưa vào Git.

### Backend có audit trail (khuyến nghị cho Task Board/Roadmap)

Backend mới dùng SQLite, audit log và Discord outbox, đồng thời vẫn phục vụ nguyên portal HTML cùng các endpoint API cũ:

```bash
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements-dev.txt
.venv/bin/python -m backend.app
```

Mở `http://127.0.0.1:8000`; tài liệu API ở `/api/docs`. Xem [tài liệu backend](docs/TASK_ROADMAP_BACKEND.md) để biết domain, API và cấu hình Discord.

### Frontend V2 (chạy song song, chưa flip default)

Frontend mới (React + TypeScript + Vite, design system Fund Paper) chạy song song với legacy:

```bash
cd frontend && npm install && npm run dev
```

Mở `http://127.0.0.1:5173` (proxy `/api` → `127.0.0.1:8000` khi backend chạy). Nội dung docs được mang nguyên khối (byte-exact) từ bản freeze `legacy/portal.html`; xem [kế hoạch migration](upgrade/KE_HOACH_MIGRATION_5_PHASE.md), [catalog design system](docs/design-system-catalog.md) và `docs/adr/0001-portal-architecture.md`.

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
