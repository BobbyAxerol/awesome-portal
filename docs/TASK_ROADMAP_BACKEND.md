# Task Board và Roadmap backend

## Mục đích

`backend/` là backend nội bộ, nhẹ và độc lập với UI. Nó đưa Task Board/Roadmap từ JSON file sang SQLite có validation, concurrency control, history và Discord notification, nhưng vẫn hỗ trợ payload legacy của portal HTML hiện tại.

## Source of truth và compatibility

- `BASE_TASKS`/`ROADMAP_PHASES` và state browser hiện hữu là dữ liệu seed hoặc fallback local-first.
- Khi browser chạy cùng backend mới, `PUT /api/tasks` và `PUT /api/roadmap` import snapshot đầu tiên vào SQLite. Các lần gọi sau vẫn tương thích, đồng thời được audit.
- `/api/tasks`, `/api/roadmap`, `/api/health` giữ response shape cũ.
- UI mới phải dùng `/api/v1`; không gọi bulk snapshot cho thao tác một task/phase.

## Database model

| Table | Vai trò |
| --- | --- |
| `tasks` | payload task gốc + status/position/version/index và soft-delete state. |
| `roadmap_phases` | payload phase gốc + position/version/index và soft-delete state. |
| `activity_events` | append-only event cho mọi mutation, gồm actor, before/after snapshot và metadata. |
| `webhook_deliveries` | persisted Discord outbox; độc lập với transaction update task. |

`depends` vẫn là array string trong payload Task. Không tạo foreign key/task graph để portal không thành hệ thống issue tracking nặng.

## Mutation policy

| Thao tác | Event | Ghi chú |
| --- | --- | --- |
| Tạo | `task.created`, `roadmap_phase.created` | `version=1`. |
| Sửa | `task.updated`, `roadmap_phase.updated`/`rescheduled` | before/after lưu trong DB. |
| Kéo trong cột / đổi thứ tự phase | `task.reordered`, `roadmap_phase.reordered` | cập nhật `position`. |
| Kéo sang cột / đổi status | `task.status_changed` | status + position atomically. |
| Xóa / khôi phục | `*.deleted`, `*.restored` | soft-delete; audit không mất. |
| Legacy bulk save | `*.snapshot_replaced` | được audit để hỗ trợ client cũ. |

Các request mutation có thể gửi `expected_version`. Nếu data đã đổi, API trả `409`; client phải reload thay vì ghi đè im lặng.

## Discord outbox

Task chuyển vào `In Progress`, `Validating` hoặc `Done` tạo một delivery row cùng transaction với activity event. Worker thử gửi tối đa `DISCORD_WEBHOOK_MAX_ATTEMPTS`; lỗi Discord không rollback Task, và được lưu `last_error`/attempt count. Secret webhook chỉ lấy từ `DISCORD_WEBHOOK_URL`, không database, frontend, log payload hay Git.

## API v1

- Tasks: `GET|POST /api/v1/tasks`, `GET|PATCH|DELETE /api/v1/tasks/{id}`, `POST /transition`, `POST /move`, `POST /restore`, `GET /activity`.
- Roadmap: `GET|POST /api/v1/roadmap`, `GET|PATCH|DELETE /api/v1/roadmap/{id}`, `POST /move`, `POST /restore`, `GET /activity`.
- Full OpenAPI: `/api/docs` khi backend đang chạy.

## Local operations

```bash
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements-dev.txt
.venv/bin/python -m backend.app
.venv/bin/python -m pytest backend/tests
```

Database mặc định là `data/portal.db`. Backup bằng cách dừng server và copy database kèm file WAL/SHM nếu có; hoặc dùng SQLite `.backup` trong runbook production. Không commit các file database.
