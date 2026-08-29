# Chẩn đoán — Lark bot của Roadmap & Task tracking mất hiệu lực trên bản stable (2026-08-26)

> Đọc trên `main` (`1bda57d`) và trên hai stack đang chạy. **Không sửa gì**: chỉ
> `git show main:<file>`, `docker inspect`, một GET `/api/health` và một truy vấn
> SQLite mở ở `mode=ro`. Không giá trị bí mật nào được ghi vào file này.

## 1. Kết luận (root cause)

**Stack stable được khởi động với một `.env` thiếu ba biến Lark.** Compose có
truyền biến, nhưng giá trị rỗng:

| Biến | `/home/bobby/portal/.env` (dev) | `/home/bobby/portal-stable-v1.0.1/.env` (stable) |
|---|---|---|
| `PORTAL_NOTIFY_CHANNELS` | `lark` | `lark` ✅ |
| `LARK_WEBHOOK_URL` | có | **không có dòng nào** → compose thay `${LARK_WEBHOOK_URL:-}` = rỗng |
| `LARK_WEBHOOK_SIGN_SECRET` | có | **không có** |
| `LARK_MENTION_MAP` | có | **không có** |

Hệ quả trong mã (`features/roadmap-task-board/backend/app/infrastructure/lark.py`):

```python
def flush_pending(self, limit: int = 20) -> int:
    if not self.settings.lark_webhook_url:
        return 0          # ← thoát trước khi claim bất kỳ delivery nào
```

`_lark_webhook_url()` trả `None` khi biến rỗng, nên `flush_pending()` **thoát
ngay**, không claim, không gọi HTTP, **không ghi log lỗi nào**. Vì
`PORTAL_NOTIFY_CHANNELS=lark` vẫn bật, mỗi lần đổi trạng thái task vẫn ghi một
hàng `webhook_deliveries(channel='lark')` — hàng đợi cứ dài ra mà không ai rút.

Đây là **lỗi cấu hình triển khai, không phải lỗi mã**: cùng commit đó chạy đúng
trên stack dev.

## 2. Bằng chứng

| Quan sát | Stable (`portal-stable-v1-0-1-roadmap-task-board-api-1`) | Dev (`portal-roadmap-task-board-api-1`) |
|---|---|---|
| `docker inspect` env | `LARK_WEBHOOK_URL=` (rỗng), `LARK_WEBHOOK_SIGN_SECRET=` (rỗng), `LARK_MENTION_MAP=` (rỗng), `PORTAL_NOTIFY_CHANNELS=lark` | cả bốn đều có giá trị |
| `/api/health` → `outbox` | `{"pending": 7}` | `{"sent": 28}` |
| `webhook_deliveries` (đọc ro) | 7 hàng `channel='lark' status='pending'`, tạo lúc `2026-08-24T08:15:54Z → 08:16:07Z` | — |
| log 72h | **0** dòng chứa `lark` / `lark_delivery_failed` | 0 lỗi (gửi thành công) |
| compose | `/home/bobby/portal-stable-v1.0.1/compose.yaml` dòng 110–112 **có** truyền `LARK_*` | như nhau |

Nghĩa là: enqueue vẫn chạy (7 hàng chờ), **chỉ khâu gửi chưa từng được thử một
lần nào** — khớp chính xác với nhánh thoát sớm ở trên.

## 3. Vì sao `.env` stable thiếu — nguyên nhân hệ thống

`deploy/.env.production.example` trên `main` **không có** `LARK_WEBHOOK_URL`,
`LARK_WEBHOOK_SIGN_SECRET`, `LARK_MENTION_MAP` (grep `lark` = 0 dòng); nó chỉ còn
`# ROADMAP_TASK_BOARD_DISCORD_WEBHOOK_URL=` từ thời Discord. Ai dựng thư mục
release từ template đó sẽ luôn thiếu ba biến, trong khi `PORTAL_NOTIFY_CHANNELS`
lại được đặt tay thành `lark` → cấu hình "bật kênh nhưng không có đích đến".

`.env` stable ghi lúc `2026-08-24 07:03`, container khởi động `07:05` — tức là
stack chạy sai từ lần dựng đầu, không phải hỏng dần.

## 4. Vì sao lỗi này im lặng (điểm cần vá cùng lúc)

1. `flush_pending()` `return 0` không log gì → không có tín hiệu nào trong log.
2. `Settings` chấp nhận `PORTAL_NOTIFY_CHANNELS=lark` cùng lúc với
   `lark_webhook_url=None` — không có kiểm tra chéo lúc khởi động.
3. `/api/health` trả `outbox.pending` nhưng không ai theo dõi ngưỡng; 7 hàng
   pending nằm im 2 ngày.

## 5. Đề xuất vá (Bobby/codex quyết — tôi không sửa)

**Vá ngay (không cần đổi mã):** thêm ba dòng `LARK_WEBHOOK_URL`,
`LARK_WEBHOOK_SIGN_SECRET`, `LARK_MENTION_MAP` vào
`/home/bobby/portal-stable-v1.0.1/.env` (copy giá trị từ `/home/bobby/portal/.env`)
rồi `docker compose ... up -d roadmap-task-board-api`. **Lưu ý:** 7 delivery đang
chờ sẽ được gửi ngay khi worker chạy lại (mỗi 15s) — bot Lark sẽ nhận 7 tin cùng
lúc; nếu không muốn, phải quyết cách xử lý hàng cũ trước khi bật.

**Vá gốc (nên có):**
1. `deploy/.env.production.example`: bổ sung ba khoá Lark kèm chú thích "bắt buộc
   khi `PORTAL_NOTIFY_CHANNELS` chứa `lark`".
2. `config.py`: fail-fast — nếu `lark` nằm trong `notification_channels` mà
   `LARK_WEBHOOK_URL` rỗng thì `ValueError` lúc khởi động (giống cách
   `PORTAL_NOTIFY_CHANNELS` đã validate giá trị lạ). Kênh bật mà không có đích
   đến là một cấu hình sai, không phải một mặc định.
3. `lark.py`: nếu vẫn muốn thoát êm, `logger.warning("lark_disabled_no_url")`
   một lần lúc khởi động thay vì im lặng mỗi 15 giây.
4. `verify-release-channel.sh` (hoặc runbook release): kiểm tra tập khoá env bắt
   buộc theo `PORTAL_NOTIFY_CHANNELS` trước khi dựng stack.

## 6. Những thứ đã loại trừ

- **Chữ ký sai**: `_sign()` dùng `key = f"{timestamp}\n{secret}"`, message rỗng —
  đúng thuật toán custom-bot của Lark (docstring viết ngược, mã thì đúng).
- **Kênh chưa bật**: `PORTAL_NOTIFY_CHANNELS=lark` có trên stable.
- **Migration thiếu**: DB stable đủ bảng (`webhook_deliveries` có hàng
  `channel='lark'`, tức migration `0003_lark_channel` đã chạy).
- **Worker không chạy**: `_delivery_loop` vẫn được tạo trong lifespan; nó gọi
  `flush_pending()` đều đặn — chỉ là hàm thoát ngay.
- **Lark chặn/URL hết hạn**: chưa có một request nào rời máy để bị chặn.
