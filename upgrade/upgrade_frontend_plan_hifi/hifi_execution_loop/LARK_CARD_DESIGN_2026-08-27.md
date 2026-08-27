# Lark task card — thiết kế (đáp lại `LARK_MESSAGE_PRESENTATION_HANDOFF_2026-08-27.md`)

Claude · 2026-08-27 · **thiết kế, chưa build**. Text fallback hiện tại giữ nguyên,
không đổi một ký tự; card là lớp trình bày thêm.

## 0. Nguyên tắc

Lark **không cho nạp font**. "Terminal" của Execution Loop được tái tạo bằng ba
thứ Lark có sẵn:

1. **Mọi giá trị máy sinh nằm trong backtick** → Lark render bằng font mono của
   client. Đó là chữ `IBM Plex Mono` trên desktop Lark, đúng họ chữ portal đang
   dùng.
2. **Chữ nhỏ, không tiêu đề to**: nhãn dùng `note` (cỡ nhỏ nhất), giá trị dùng
   `div` thường. Không dùng `heading`/`text_size` lớn.
3. **Màu tiết chế**: một màu trạng thái cho header + một dải tiến trình. Không tô
   màu chữ nội dung (chữ người viết luôn màu mặc định — dễ đọc, không đánh lừa).

"Gradient" trong Lark card không có thật (header chỉ nhận `template` màu đặc).
Thay vì giả gradient bằng ảnh, dùng **dải pipeline** `▰▰▰▱` chuyển sắc theo
trạng thái — vừa là trang trí, vừa nói vị trí task trong luồng. Đẹp mà không bịa.

## 1. Bố cục (đúng thứ tự quét handoff yêu cầu)

```
┌────────────────────────────────────────────────┐
│  ▨ TASK · IN PROGRESS            ← header màu  │  ① trạng thái
├────────────────────────────────────────────────┤
│ `bobby` chuyển  `Backlog` → `In Progress`      │  ① actor + chuyển trạng thái
│ ▰▰▱▱  Backlog › In Progress › Validating › Done│     dải pipeline
│                                                │
│ Bật lại Lark cho stable                        │  ② title (đậm, cỡ thường)
│ `TASK-104` · Planning                          │     id + workstream, mono nhỏ
│                                                │
│ Kiểm tra .env stable, bổ sung ba khoá Lark rồi │  ③ mô tả, tối đa 3 dòng
│ dựng lại roadmap-task-board-api…               │
│                                                │
│ ASSIGNEE          DEADLINE                     │  ④ hai cột, nhãn note
│ @Stan             `2026-08-29 17:00` · Còn 2 ngày │
│ giao `2026-08-27 09:12`                        │
│                                                │
│ ────────────────────────────────────────────── │
│ [ Mở task ]                        Timeline W35│  ⑤ một hành động
└────────────────────────────────────────────────┘
```

Một cột trên mobile: `column_set` của Lark tự xuống dòng khi hẹp, nên hai cột
④ luôn an toàn.

## 2. Bảng màu theo trạng thái đích

| Trạng thái đích | `header.template` | Dải pipeline | Ý nghĩa |
|---|---|---|---|
| `Backlog` | `grey` | `▰▱▱▱` | chưa chạy |
| `In Progress` | `blue` | `▰▰▱▱` | đang chạy |
| `Validating` | `turquoise` | `▰▰▰▱` | chờ xác nhận |
| `Done` | `green` | `▰▰▰▰` | xong |
| `Blocked` / `Cancelled` | `red` | `▰▰✕▱` | dừng |
| khác (không map được) | `grey` | `▱▱▱▱` | **không đoán màu** |

Chữ tiêu đề header luôn `TASK · {TO_STATUS}` viết hoa, mono-hoá bằng chính font
header của Lark. Không thêm emoji nào ngoài `▨` ở đầu (một ký tự, không nhiều màu).

## 3. Card JSON (schema 1.0 — custom bot chấp nhận)

`msg_type: "interactive"`, kèm `timestamp` + `sign` như hiện tại.
`{{...}}` là chỗ backend thay giá trị.

```json
{
  "config": { "wide_screen_mode": true, "update_multi": false },
  "header": {
    "template": "{{HEADER_TEMPLATE}}",
    "title": { "tag": "plain_text", "content": "▨ TASK · {{TO_STATUS_UPPER}}" }
  },
  "elements": [
    {
      "tag": "div",
      "text": {
        "tag": "lark_md",
        "content": "`{{ACTOR}}` chuyển  `{{FROM_STATUS}}` → **`{{TO_STATUS}}`**"
      }
    },
    {
      "tag": "note",
      "elements": [
        { "tag": "lark_md", "content": "{{PIPELINE_RAIL}}  Backlog › In Progress › Validating › Done" }
      ]
    },
    { "tag": "hr" },
    {
      "tag": "div",
      "text": { "tag": "lark_md", "content": "**{{TITLE}}**" }
    },
    {
      "tag": "note",
      "elements": [
        { "tag": "lark_md", "content": "`{{TASK_ID}}` · {{WORKSTREAM}}" }
      ]
    },
    {
      "tag": "div",
      "text": { "tag": "lark_md", "content": "{{DESCRIPTION_3_LINES}}" }
    },
    { "tag": "hr" },
    {
      "tag": "column_set",
      "flex_mode": "bisect",
      "background_style": "default",
      "columns": [
        {
          "tag": "column",
          "width": "weighted",
          "weight": 1,
          "vertical_align": "top",
          "elements": [
            { "tag": "note", "elements": [ { "tag": "plain_text", "content": "ASSIGNEE" } ] },
            { "tag": "div", "text": { "tag": "lark_md", "content": "{{ASSIGNEE_MENTION_OR_NAME}}" } },
            { "tag": "note", "elements": [ { "tag": "lark_md", "content": "giao `{{ASSIGNED_AT}}`" } ] }
          ]
        },
        {
          "tag": "column",
          "width": "weighted",
          "weight": 1,
          "vertical_align": "top",
          "elements": [
            { "tag": "note", "elements": [ { "tag": "plain_text", "content": "DEADLINE" } ] },
            { "tag": "div", "text": { "tag": "lark_md", "content": "`{{DEADLINE}}`" } },
            { "tag": "note", "elements": [ { "tag": "lark_md", "content": "{{REMAINING_COLOURED}}" } ] }
          ]
        }
      ]
    },
    {
      "tag": "action",
      "actions": [
        {
          "tag": "button",
          "text": { "tag": "plain_text", "content": "Mở task" },
          "type": "primary",
          "url": "{{TASK_BOARD_URL}}"
        }
      ]
    },
    {
      "tag": "note",
      "elements": [ { "tag": "lark_md", "content": "Timeline `{{TIMELINE}}` · Workstream {{WORKSTREAM}}" } ]
    }
  ]
}
```

## 4. Placeholder → giá trị backend đã có

| Placeholder | Lấy từ `_text()` hiện tại | Khi thiếu |
|---|---|---|
| `{{ACTOR}}` | `actor` | `System` |
| `{{FROM_STATUS}}` / `{{TO_STATUS}}` | `from_status` / `to_status` | `—` |
| `{{TO_STATUS_UPPER}}` | `to_status.upper()` | `UNKNOWN` |
| `{{HEADER_TEMPLATE}}`, `{{PIPELINE_RAIL}}` | map ở §2 theo `to_status` | `grey` / `▱▱▱▱` |
| `{{TASK_ID}}` | `task_id` | `task` |
| `{{TITLE}}` | `title` | `Untitled task` |
| `{{DESCRIPTION_3_LINES}}` | `description` cắt còn ~180 ký tự | `Chưa có mô tả` |
| `{{ASSIGNEE_MENTION_OR_NAME}}` | `mention` nếu có, ngược lại `owner` **dạng plain** | `Unassigned` |
| `{{ASSIGNED_AT}}` | `assigned_at` | `Chưa ghi nhận` |
| `{{DEADLINE}}` | `deadline_text` | `Chưa đặt` |
| `{{REMAINING_COLOURED}}` | `remaining` (xem §5) | `Chưa tính được` |
| `{{TIMELINE}}` / `{{WORKSTREAM}}` | `timeline` / `workstream` | `Chưa đặt` / `General` |
| `{{TASK_BOARD_URL}}` | `task_board_url` | bỏ nút nếu URL rỗng |

**Không thêm field mới.** Card dùng đúng tập giá trị text đang dùng, nên hai kênh
luôn nói cùng một chuyện.

## 5. Màu cho phần còn hạn / quá hạn (chỗ duy nhất tô chữ)

```
Còn …      → <font color='green'>Còn 2 ngày</font>
Còn < 24h  → <font color='orange'>Còn 5 giờ</font>
Quá hạn …  → <font color='red'>Quá hạn 1 ngày</font>
Chưa tính  → để nguyên, màu mặc định
```

Đây là màu duy nhất trong thân card. Nếu client không hỗ trợ `<font>`, chữ vẫn
đọc được nguyên văn — không mất thông tin.

## 6. Escaping (bắt buộc, giữ nguyên tinh thần contract)

- `_single_line()` hiện tại đã đổi `<`/`>` — giữ.
- Với **mọi giá trị người dùng nhập** (`title`, `description`, `owner`,
  `workstream`, `timeline`) khi đưa vào `lark_md`: escape thêm `` ` ``, `*`, `_`,
  `~`, `[`, `]` (thay bằng ký tự nhìn giống hoặc thêm `\`), để không ai chèn được
  markup/mention giả. Cách rẻ nhất: đặt các giá trị đó trong phần tử
  `plain_text` khi không cần in đậm — Lark không parse markup ở `plain_text`.
- **Chỉ** `{{ASSIGNEE_MENTION_OR_NAME}}` được chứa `<at user_id="ou_...">`, và chỉ
  khi alias khớp `bobby` / `stan` / `thanhvuong`. Owner lạ → `plain_text`.
- `{{PIPELINE_RAIL}}`, backtick quanh giá trị máy sinh: do service tạo, an toàn.

## 7. Fallback

Nếu `msg_type: "interactive"` bị từ chối (`code != 0`) hoặc cấu hình tắt card:
gửi lại đúng payload text hiện tại, **cùng một delivery** — không tạo hàng outbox
mới, không đổi retry/abandon policy. Text hiện tại đã đủ mọi field của card.

Gợi ý cờ: `LARK_MESSAGE_FORMAT=card|text` (mặc định `text` cho tới khi card được
duyệt trên tenant thật).

## 8. Ba ví dụ render

**Done · Bobby thao tác · assignee Stan có mention**
```
▨ TASK · DONE                                     (header xanh lá)
`bobby` chuyển  `Validating` → **`Done`**
▰▰▰▰  Backlog › In Progress › Validating › Done
────────────────────────────────────────────
**Bật lại Lark cho stable**
`TASK-104` · Planning
Bổ sung ba khoá LARK_* vào .env stable rồi dựng lại roadmap-task-board-api.
────────────────────────────────────────────
ASSIGNEE            DEADLINE
@Stan               `2026-08-29T17:00Z`
giao `2026-08-27T09:12Z`   Còn 2 ngày        (xanh)
[ Mở task ]
Timeline `W35` · Workstream Planning
```

**In Progress · quá hạn**
```
▨ TASK · IN PROGRESS                              (header xanh dương)
`stan` chuyển  `Backlog` → **`In Progress`**
▰▰▱▱  …
…
DEADLINE  `2026-08-25T09:00Z`
          Quá hạn 1 ngày                          (đỏ)
```

**Owner lạ · thiếu deadline**
```
ASSIGNEE  external-vendor        (plain text, không mention)
DEADLINE  `Chưa đặt`
          Chưa tính được         (màu mặc định)
```

## 9. Đối chiếu acceptance contract

| Yêu cầu handoff | Cách thiết kế đáp ứng |
|---|---|
| Cùng tập field + fallback dùng được | Card đọc đúng biến của `_text()`; fallback là chính text đó |
| Không thêm quyền/mutation/credential ra browser | Card sinh ở backend; nút chỉ là URL same-origin |
| Alias bobby/stan/thanhvuong có mention, owner lạ thì không | `{{ASSIGNEE_MENTION_OR_NAME}}` dùng lại `_mention()`; owner lạ đi `plain_text` |
| Markup độc hại không render | §6: giá trị người nhập vào `plain_text` hoặc escape ký tự markdown |
| Card lỗi không rollback task | Card chỉ nằm trong `_payload()`; policy outbox không đổi |
| Không hash/ID nội bộ/JSON thô/chữ to/chữ trang trí | Card chỉ có 10 field ở §4; cỡ chữ lớn nhất là title thường |

## 10. Việc codex cần làm (ước lượng)

1. `lark.py`: tách `_fields(delivery) -> dict` từ `_text()`; `_text()` và
   `_card()` cùng ăn dict đó.
2. Thêm `_status_style(to_status) -> (template, rail)` theo §2.
3. `_payload()`: chọn `interactive` hay `text` theo `LARK_MESSAGE_FORMAT`;
   khi Lark trả `code != 0` với card → gửi lại text một lần trong cùng attempt.
4. Fixture: 3 alias + owner lạ + markup độc hại + thiếu deadline, kiểm cả hai
   dạng payload.
