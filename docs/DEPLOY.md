# Deploy — Quant Ecosystem Portal

## Cấu trúc cần chuyển lên server

| Đường dẫn | Vai trò | Bắt buộc |
|---|---|---|
| `backend/` | FastAPI + SQLite backend (audit, Discord outbox), phục vụ portal HTML + API | ✅ |
| `quant_trading_ecosystem_architecture_migration_portal_vi.html` | Portal legacy (default trang chủ) | ✅ |
| `data/` | SQLite runtime (tạo tự động, gitignore) | runtime |
| `frontend/` | Frontend V2 (tùy chọn giai đoạn này; dùng khi nào cần chế độ V2) | optional |
| `docs/`, `upgrade/` | Tài liệu migration (không cần thiết chạy nhưng nên mang theo) | optional |

## Backend (nhanh gọn)

```bash
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
PORTAL_FILE=quant_trading_ecosystem_architecture_migration_portal_vi.html \
PORTAL_HOST=127.0.0.1 PORTAL_PORT=8000 \
PORTAL_DATABASE_PATH=data/portal.db \
bash -c 'cp backend/.env.example .env && set -a && . ./.env && set +a && .venv/bin/python -m backend.app'
```

Đơn giản hơn — tự export biến môi trường như `.env.example` rồi:

```bash
.venv/bin/python -m backend.app
```

Kiểm tra: `GET /` (portal HTML), `GET /api/health` ({"ok": true}), `/api/docs` (OpenAPI).

## Sau khi đứng sau reverse proxy

Phía server public (nginx/caddy) proxy `80/443 → 127.0.0.1:8000` và set:

```
PORTAL_PUBLIC_URL=https://doma.in
PORTAL_CORS_ORIGINS=https://doma.in,https://www.doma.in
DISCORD_WEBHOOK_URL=...   # rỗng = tắt outbox
PORTAL_DEFAULT_ACTOR=local-user
```

Database tự tạo `data/portal.db`; backup bằng cách copy 3 file `portal.db*` khi service tạm dừng.

## Frontend V2 (song song, chưa phải default)

```bash
cd frontend && npm install && npm run build   # ra dist/
npm run preview -- --host 0.0.0.0 --port 5173  # proxy /api → 127.0.0.1:8000
```

Xem chi tiết vận hành ở `docs/design-system-catalog.md` và kế hoạch migration `upgrade/KE_HOACH_MIGRATION_5_PHASE.md`.

## Runbook nhỏ

- Log: tự uvicorn stdout; structured log của backend ra `data/portal-events.log` (nếu bật).
- Reset dữ liệu: tắt service, xóa `data/portal.db*`, khởi động lại.
- Thay đổi nội dung: sửa ở `server.py` static hoặc file HTML seed kèm `PORTAL_FILE`.