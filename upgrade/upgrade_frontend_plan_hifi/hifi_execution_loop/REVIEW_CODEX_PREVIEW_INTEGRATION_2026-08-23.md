# Rà soát `feat/execution-preview-integration` của codex — 2026-08-23

Commit `08b986e feat(execution): expose fixture-only dev preview`, 13 file, +492/−37.

Cách rà: **merge thử vào nhánh của tôi rồi chạy thật**, không đọc chay. Nhánh `verify/codex-preview`.

## Kết luận: **làm đúng.** Ba điểm cần sửa, không điểm nào chặn.

---

## Điều họ làm đúng, đã kiểm chứ không tin nhãn

### Cổng chặn có **bốn tầng**, tầng nào cũng fail-closed

| Tầng | Mặc định |
|---|---|
| `deploy/images/portal-web.Dockerfile` | `ARG EXECUTION_PREVIEW_ENABLED=false` |
| `compose.yaml` | `${PORTAL_EXECUTION_PREVIEW_ENABLED:-false}` |
| `.env.example` | `false`, kèm chú thích "Keep false for stable publication" |
| `previewRegistry.ts` | `=== "true"` — so sánh chuỗi nghiêm ngặt, mọi giá trị khác đều là tắt |

Cờ là **build-time** (`import.meta.env`), nên bản build production không mang code preview theo bất kỳ
đường nào khác.

### Lane A được chứng minh ở **tầng mạng**, không phải bằng lời

`execution-preview.spec.ts` lắng nghe mọi request và assert **không request nào tới `/api/v1/execution`**
trên 24 route. Đó đúng là cách chứng minh "fixture-only" — mạnh hơn đọc code.

### Stop gate realtime được tôn trọng, hai lớp

`<CommandCenterLive snapshot={...} />` **không truyền `factory`**, nên hook của tôi từ chối mở
EventSource; và fixture `CC_FIXTURES.busy` mang `stream_available: false`, nên `streamGate` cũng đóng.
Không có cách nào mở stream từ đường này.

### Không va vào QuantBT / Planning

Bảy feature id trong `EXECUTION_PREVIEW_FEATURE_DEFAULTS` — kể cả ba cái không có tiền tố
(`PAPER_TRADING`, `SANDBOX_TRADING`, `LIVE_OPERATIONS`) — đều trỏ vào `/deployments/*` và
`/governance/*`. Không route nào của Research hay Planning bị thay.

### Merge với việc của tôi: sạch

Một xung đột duy nhất, do cả hai cùng nối mục vào `FRONTEND_HANDOFF.md`. Sau merge:
**tsc sạch · vitest 1.500 passed (68 file) · build sạch · Playwright 204 passed.**

---

## Ba điểm cần sửa

### F1 — Banner preview viết **tiếng Việt**, vi phạm §3.8

```
Dữ liệu fixture cục bộ · không kết nối AWS-HK, Trading System, broker hoặc realtime ·
mọi thao tác chỉ mô phỏng trong trình duyệt.
```

CLAUDE.md §3.8 chốt **UI copy tiếng Anh toàn bộ**; ngoại lệ duy nhất là *nội dung tài liệu*
Roadmap/Task-tracking, không phải chrome UI. Banner này là UI.

Sửa nó phải sửa **hai chỗ**, vì `execution-preview.spec.ts` đang ghim luôn câu tiếng Việt:
`await expect(banner).toContainText("không kết nối AWS-HK")`.

### F2 — `playwright.config.ts` bật preview cho **toàn bộ** suite

```diff
-    env: { VITE_ROADMAP_TASK_BOARD_LOCAL_ONLY: "true" },
+    env: { ..., VITE_EXECUTION_PREVIEW_ENABLED: "true" },
```

101 baseline QuantBT là **exit gate U02** — chúng tồn tại để chứng minh *thứ sẽ ship*. Chạy chúng trên
một bản build có cờ dev bật nghĩa là gate không còn kiểm cấu hình production nữa.

**Hôm nay chưa gây hại**: tôi đã chạy cả hai cấu hình — cờ tắt cho 203 passed, cờ bật cho 204 passed,
cùng bộ baseline. Nhưng đó là **may mắn về việc route nào bị thay**, không phải một bảo đảm. Nếu sau này
một route Research lọt vào bảng preview, baseline sẽ đổi và người ta sẽ `--update-snapshots` cho qua.

Đề nghị: đưa `VITE_EXECUTION_PREVIEW_ENABLED` vào riêng project/spec của preview, hoặc thêm một assert
rằng preview không bao giờ mount trên route ngoài Execution.

### F3 — Hai mục cùng đánh số `### 8.18`

Của họ (2026-08-24, preview) và của tôi (2026-08-23, U10 SSE) va nhau do làm song song. Tôi sẽ đổi số
mục của mình khi tích hợp.

---

## Một quan sát, không phải lỗi

Preview mount màn Execution lên **route sản phẩm** (`/execution`, `/governance/approvals`,
`/deployments/...`), không phải một route `_preview` riêng. Về chữ nghĩa thì đó là địa chỉ của Lane B —
nhưng Lane B nghĩa là **dữ liệu thật** trên route sản phẩm, mà ở đây dữ liệu là fixture, cờ registry vẫn
tắt, và có banner. Nên tôi không coi là vi phạm stop gate; ghi lại để sau này không ai đọc nhầm
"đã lên route sản phẩm" thành "đã kích hoạt".
