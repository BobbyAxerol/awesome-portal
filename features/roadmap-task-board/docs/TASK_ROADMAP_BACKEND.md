# Backend Task Board & Roadmap — Phase 4

## Mục đích

`backend/` là persistence layer nhẹ cho **Roadmap & Task Board**: FastAPI,
SQLite, optimistic concurrency, activity audit append-only và Discord outbox.
Nó không phải Jira, workflow engine, RBAC hoặc task graph. `depends` vẫn là
một mảng ID tự do để giữ tương thích dữ liệu portal cũ.

Backend giữ hai bề mặt API cùng lúc:

- Compatibility: `GET|PUT /api/tasks`, `GET|PUT /api/roadmap`, `GET /api/health`.
  Response cũ giữ nguyên `{ initialized, items }` để HTML legacy không vỡ.
- V1: `/api/v1/*` dành cho frontend component hoá. V1 dùng row version và
  không dùng bulk snapshot cho một thao tác task/phase bình thường.

## Data & consistency contract

| Aggregate | Quy tắc |
| --- | --- |
| Task | `id`, payload gốc, `status`, `position`, `version`, timestamps, soft delete. |
| RoadmapPhase | payload phase gốc, `position`, `version`, timestamps, soft delete. |
| ActivityEvent | append-only; snapshot `before`/`after`, actor, metadata. Không có endpoint sửa/xoá audit. |
| WebhookDelivery | outbox được tạo trong **cùng transaction** với `task.status_changed`. |

- Mọi PATCH/move/transition/delete/restore có thể nhận `expected_version`.
  Khác version trả `409 version_conflict`; UI phải refresh, không ghi đè im lặng.
- Reorder làm tăng version của các item bị dịch vị trí để client cũ không thể
  ghi lại một ordering stale.
- Soft-delete không xoá row/audit. V1 list mặc định ẩn deleted; dùng
  `?include_deleted=true` để tra cứu hoặc restore.
- Gửi lại payload không đổi qua legacy `PUT` là idempotent: không tăng version
  và không tạo activity noise.
- Migration schema là forward-only, lưu trong `schema_migrations`. Bản cũ tự
  nhận thêm các cột outbox lease khi khởi động, không rewrite task/audit data.

## V1 API

| Resource | Endpoint |
| --- | --- |
| Service | `GET /api/health`, `GET /api/ready`, `GET /api/docs`, `GET /api/openapi.json` |
| Export | `GET /api/v1/export?include_deleted=false` |
| Task | `GET|POST /api/v1/tasks`; `GET|PATCH|DELETE /api/v1/tasks/{id}` |
| Task command | `POST /{id}/transition`, `POST /{id}/move`, `POST /{id}/restore`, `GET /{id}/activity` |
| Task import | `POST /api/v1/tasks/import` body `{ "items": [...], "confirm_replace": true }` |
| Roadmap | `GET|POST /api/v1/roadmap`; `GET|PATCH|DELETE /api/v1/roadmap/{id}` |
| Roadmap command | `POST /{id}/move`, `POST /{id}/restore`, `GET /{id}/activity` |
| Roadmap import | `POST /api/v1/roadmap/import` body `{ "items": [...], "confirm_replace": true }` |

`PATCH` Task không nhận `status`; đổi trạng thái phải dùng `transition` hoặc
`move`, để audit/outbox không bị bỏ qua. Roadmap phase ID bất biến ở V1 vì ID
là anchor của activity history.

Lỗi domain có envelope thống nhất và `X-Request-ID`:

```json
{
  "error": {
    "code": "version_conflict",
    "message": "This item changed elsewhere. Refresh before saving."
  },
  "request_id": "…"
}
```

## Discord outbox

Chỉ khi Task **đi vào** `In Progress`, `Validating` hoặc `Done` backend mới tạo
delivery. Webhook đọc độc quyền từ `DISCORD_WEBHOOK_URL`; không vào database,
OpenAPI, API response hay structured log. Payload không chứa `notes`, vô hiệu
Discord mentions (`allowed_mentions.parse=[]`) và mang activity ID để audit.

Worker claim delivery qua lease trước khi POST. Vì vậy hai worker cùng chạy sẽ
không lấy cùng một delivery; lease hết hạn mới cho worker khác retry. Retry là
exponential backoff, tối đa `DISCORD_WEBHOOK_MAX_ATTEMPTS`; lỗi Discord **không
rollback** mutation Task.

Không cấu hình webhook = outbox vẫn audit được nhưng không gọi Internet.

## Chạy & test local

Từ root của repository feature:

```bash
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements-dev.txt
.venv/bin/python -m backend.app

.venv/bin/python -m pytest backend/tests
```

Mặc định server ở `http://127.0.0.1:8000`; `GET /api/ready` kiểm tra SQLite,
migration và tổng outbox. Copy `backend/.env.example` vào secret store/process
manager, không commit file `.env`.

## Frontend rollout switch

Frontend mặc định giữ compatibility adapter để rollout an toàn.

```bash
# Chỉ dùng trong môi trường đã UAT backend V1.
VITE_ROADMAP_TASK_BOARD_API_BASE=/api
VITE_ROADMAP_TASK_BOARD_PERSISTENCE=v1
```

Với V1, nếu database trống UI hiển thị nút **Initialize server from local**;
không tự import browser state. Build embedded hiện tại đặt
`VITE_ROADMAP_TASK_BOARD_LOCAL_ONLY=true`, nên không vô tình gửi request sang
API QuantBT cùng hostname. Chỉ bật V1 sau khi gateway có route API riêng/được
duyệt cho backend này.

## Backup, restore & rollback

Lệnh dùng SQLite online backup API, nên backup nhất quán cả khi server đang
chạy. Thay `<db>` và `<backup>` bằng path tuyệt đối phù hợp server:

```bash
python -m backend.scripts.portal_db status --database <db>
python -m backend.scripts.portal_db backup --database <db> --output <backup>
python -m backend.scripts.portal_db restore --input <backup> --database <db> --replace
```

- `backup` không overwrite file có sẵn trừ khi truyền `--replace`.
- `restore` yêu cầu `--replace` nếu target tồn tại, ghi temporary sibling rồi
  atomic replace; luôn backup database hiện hành trước khi restore.
- Restore tự chạy migration forward-only cho backup cũ trước khi đưa live.
- Export dữ liệu qua `/api/v1/export` là rollback-friendly JSON cho
  Task/Roadmap; SQLite backup là phương án đầy đủ nhất vì giữ audit/outbox.

## Production guardrails

- `PORTAL_ENV=production`: không có CORS default. Nếu frontend khác origin,
  đặt `PORTAL_CORS_ORIGINS` là allowlist HTTPS cụ thể; `*` bị từ chối.
- Chạy sau reverse proxy/TLS; `PORTAL_PUBLIC_URL` là URL public không có secret.
- Dùng volume bền vững cho `PORTAL_DATABASE_PATH`, monitor `/api/ready`, backup
  định kỳ, và giữ artifact legacy để rollback UI trong ít nhất một release window.
- Chưa có auth/RBAC trong phase này. Chỉ expose nội bộ hoặc sau lớp access
  control của portal mẹ; không public-write endpoint ra Internet.
