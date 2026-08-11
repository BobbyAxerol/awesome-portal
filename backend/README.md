# Quant Ecosystem Portal backend

Backend nhẹ cho Task Board và Roadmap: FastAPI, SQLite, audit trail append-only và Discord webhook outbox. Nó phục vụ cả portal HTML hiện hữu qua endpoint compatibility lẫn API versioned cho UI component hóa sau này.

## Chạy cục bộ

Từ root repository:

```bash
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements-dev.txt
.venv/bin/python -m backend.app
```

Mở `http://127.0.0.1:8000`; API docs ở `http://127.0.0.1:8000/api/docs`.

Database mặc định: `data/portal.db`, đã được Git ignore. Sao chép `backend/.env.example` hoặc export biến môi trường để đổi đường dẫn DB, actor mặc định, CORS và Discord webhook.

## Hành vi domain

- Task/phase được create, update, move, soft-delete và restore.
- Mỗi mutation tạo `activity_events` with actor, before/after và metadata.
- Kéo task sang cột khác cập nhật status + position atomically; conflict được phát hiện bằng `version`.
- Transition vào `In Progress`, `Validating`, `Done` tạo webhook outbox. Discord failure không rollback task; retry có giới hạn.
- `/api/tasks` và `/api/roadmap` tương thích JSON với `server.py` cũ. API mới dùng `/api/v1`.

## Kiểm thử

```bash
.venv/bin/python -m pytest backend/tests
```
