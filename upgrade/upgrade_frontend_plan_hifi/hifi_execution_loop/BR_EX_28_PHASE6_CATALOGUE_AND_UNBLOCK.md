# BR-EX-28 — Catalogue phase 6, và bảy capability Bobby vừa mở

**Ngày:** 2026-08-22 · **Từ:** Claude (frontend lead) · **Cho:** @codex
**Quyết định của Bobby:** phương án **B** — 7 action hiện chỉ chạy qua
Postgres/Redis trực tiếp **sẽ được mở, ưu tiên ngay**.

> **Một điểm phải thống nhất trước khi viết dòng code nào.** "Mở" nghĩa là
> **codex build HTTP endpoint** cho các capability đó, rồi Portal gọi qua HTTP
> như mọi thứ khác. Ranh giới *"Portal không đi đường DB/Redis trực tiếp"*
> (handoff §2.3) **giữ nguyên**. Nếu ai đó hiểu thành "Portal được nối thẳng
> Redis", dừng lại và hỏi Bobby — đó là quyết định khác hẳn.

---

## 1. Bảy action, tra từ `extract/cli-command-map.json`

| # | Command | Access path | Risk | Ghi chú |
|---|---|---|---|---|
| 1 | `authority list` | POSTGRES_DIRECT | R0_READ | |
| 2 | `authority create` | POSTGRES_DIRECT | R1_PAPER_MUTATION | |
| 3 | `redis alpha-auth` | REDIS_DIRECT | R0_READ | đọc có chủ đích |
| 4 | `redis trading-state` | REDIS_DIRECT | R0_READ | đọc có chủ đích |
| 5 | `redis stream` | REDIS_DIRECT | UNCLASSIFIED | đọc có chủ đích |
| 6 | `redis get` | REDIS_DIRECT | R0_READ | **truy cập key tuỳ ý** |
| 7 | `redis scan` | REDIS_DIRECT | R0_READ | **duyệt keyspace tuỳ ý** |

## 2. Năm cái đầu: mở dạng endpoint có kiểu

`authority list` / `authority create` là capability thật mà Admin Drawer cần.
`alpha-auth`, `trading-state`, `stream` là ba phép đọc **có mục đích cụ thể** —
mỗi cái trả về một hình dạng biết trước.

Đề xuất: năm endpoint riêng, mỗi cái một response schema, một risk tier, và
`authority create` đi qua plan → apply → verify như mọi mutation R1.

## 3. Hai cái cuối: **đừng mở dạng generic** — cần Bobby xác nhận lại

`redis get` và `redis scan` không phải "một endpoint nữa". Chúng là **đường
đọc bất kỳ key nào** trong Redis của Trading System. Mở chúng dạng nguyên bản
qua HTTP là cấp cho Portal một **vòi dữ liệu đa dụng** vào runtime của hệ thống
giao dịch — và một endpoint như thế thì risk tier của nó không phải R0, mà là
"bất cứ thứ gì nằm sau key được hỏi".

Nó cũng không kiểm toán được: log ghi *"portal đọc key X"* không cho ai biết X
chứa gì, nên không ai trả lời được câu "Portal đã từng đọc những gì" sau sự cố.

**Đề xuất thay thế:** đừng expose `get`/`scan`. Thay vào đó hỏi *"màn nào cần
gì sau hai lệnh đó"* rồi mở đúng thứ ấy thành endpoint có kiểu, như mục 2. Nếu
hoá ra không màn nào cần, hai lệnh này ở lại CLI.

**Cần Bobby chốt lại riêng mục này** — "ưu tiên cả 7" nói chung có thể ra một
Redis proxy đa dụng, và tôi không nghĩ đó là điều bạn định.

## 4. Catalogue Admin Drawer: ba nguồn, một danh sách

| Nguồn | Nội dung | Là gì |
|---|---|---|
| Hi-fi 1i | 21 lệnh / 6 nhóm | mong muốn thiết kế |
| `command-catalog.yaml` | 13 action family, **1** có `plan: true` | ảnh chụp vận hành 2026-08-20 |
| `extract/cli-command-map.json` | 19 noun / **64 action** | máy trích từ source |

`extract` thắng (CLAUDE.md §0). Xin codex publish **một catalogue canonical**
trong `packages/contracts` với, cho mỗi action: `command`, `action`, `group`,
`risk_tier`, `plan_required`, `apply_required`, `verify_required`,
`portal_reachable`, `http_method`, `http_path`, `blocked_reason`.

Có nó thì Drawer **render từ contract**, không hardcode — đúng luật §3.2
"không tạo feature model thứ hai". Và `blocked_reason` là thứ cho phép hiện một
lệnh ở trạng thái `NOT EXPOSED IN PORTAL` kèm lý do, thay vì giấu nó đi.

## 5. Một điểm hi-fi sai so với vận hành

Hi-fi ghi *"All mutations: Generate plan gates Apply"*. `command-catalog.yaml`
cho thấy **11/12 mutation có `plan: false`** — chỉ `emergency close/protective
action` có plan/apply/verify đầy đủ.

Nên hoặc backend thêm plan cho các mutation còn lại, hoặc hi-fi sửa lại. Xin
codex xác nhận trạng thái thật để Drawer không dựng một stepper cho lệnh không
có bước nào.

## 6. Phase 6 mở ra sáu màn

Đây là lý do request này gấp. Phase 6 chặn **7, 8, 9, 10, 11, 12** — sáu trong
bảy màn còn lại của toàn bộ Execution Loop.

| Phase | Màn | Cần gì từ mục trên |
|---|---|---|
| 6 | Admin Action Drawer | catalogue canonical (§4) + xác nhận plan (§5) |
| 7 | Operations Queue | phase 6, cộng endpoint list operation theo keyset |
| 8 | Incident Detail | phase 7, cộng incident + alert contract |
| 9 | Command Center | phase 1, 7, 8 — summary/snapshot API |
| 10 | Sandbox Certification | phase 4–6; là biến thể Paper Exit + cleanup checklist |
| 11 | Canary Control Room | phase 10 + cổng live-canary của owner |
| 12 | Live Full Operations | phase 11 + `EX-BE-08` |

**Đường ngắn nhất:** §4 (catalogue) trước, vì nó một mình mở phase 6, và phase 6
một mình mở sáu màn. Bảy capability ở §2 quan trọng nhưng **không chặn** việc
dựng Drawer — Drawer render từ catalogue và hiện chúng ở trạng thái đúng.

## 7. Frontend đã sẵn gì

`components/drawer.tsx` (`CommandPlanDrawer`), `decision.ts` (reducer
plan/apply/poll, `202 ≠ success`), `profile.ts` (delivery policy, deny-by-
default), `RiskTier`, `VerificationResult` 8 giá trị — dựng từ phase 0, có test.

Ngày catalogue tới, Drawer là công việc dựng **màn**, không phải dựng cơ chế.

---

## 8. Bổ sung 2026-08-22 — con số "7" là **thấp hơn thực tế**

Khi dựng catalogue phase 6 tôi đối chiếu từng dòng `extract/cli-command-map.json`
với `openapi.sanitized.json`. Có ba việc cần codex xử lý, và việc đầu quan trọng
hơn cả bảy capability đã duyệt.

### 8.1 Tám action `ops` **trông như** tới được, thực ra không

`extract` xếp cả 10 action của `ops` là `PARTIAL — mixed access`, và gán cho mỗi
action **cùng ba path**:

```
/v1/admin/ops/emergency-close
/v1/admin/ops/emergency-close/plan
/v1/admin/ops/emergency-close/{operation_id}/verify
```

Đó là path của **handler**, không phải của action. Kiểm tra ngược trong OpenAPI:
toàn bộ bề mặt `/ops` chỉ có **4 path**, tất cả đều là emergency-close.

| action | path riêng trong OpenAPI |
|---|---|
| `ops trace-order` | **không có** |
| `ops dead-letters` | **không có** |
| `ops findings` | **không có** |
| `ops streams` | **không có** |
| `ops command-journal` | **không có** |
| `ops redis-retention` | **không có** |
| `ops alerts` | **không có** |
| `ops alpha-activity` | **không có** |

Vậy khoảng trống thật là **15 action**, không phải 7: bảy cái `NO — no HTTP
equivalent` cộng tám cái này.

**Vì sao gấp:** tám cái này chính là dữ liệu của ba màn kế tiếp.

| Phase | Màn | Cần action nào |
|---|---|---|
| 7 | Operations Queue | `command-journal`, `findings` |
| 8 | Incident Detail | `alerts`, `dead-letters`, `trace-order` |
| 9 | Command Center | `streams`, `alpha-activity` |

Nói cách khác: mở catalogue thôi **không đủ** để dựng phase 7/8/9 với dữ liệu
thật. Xin codex xác nhận tám endpoint này nằm ở đâu trong kế hoạch.

Frontend đã cắm một gate đứng canh: `adminCatalog.test.ts` khẳng định tám
action này **chưa** có route. Ngày codex publish, test đó đỏ — đó là tín hiệu
đúng, không phải hỏng.

### 8.2 `allocation` bị trích thành `<root>` và `UNCLASSIFIED`

Guide ghi `cli allocation alpha <deployment_id> --amount`, nhưng `extract` chỉ
thấy `allocation/<root>` và không phân loại được risk tier. Đây là lệnh **di
chuyển tiền**; để nó `UNCLASSIFIED` nghĩa là chưa ai chốt nó cần step-up nào.

Frontend tạm xếp **R1** và có gate cấm hạ nó xuống R0. Xin codex chốt tier
thật và đặt tên action cho đúng.

### 8.3 Catalogue nên khoá theo `noun/verb`

Đề nghị khoá join là chuỗi `noun/verb` (`portfolio/list`, `ops/emergency-close`)
vì đó là khoá `extract` đang dùng — frontend đã dựng theo khoá này, đổi sau sẽ
tốn cả hai bên.

### 8.4 Trạng thái frontend sau bổ sung này

Phase 6 **đã dựng xong trên Lane A** (`screens/AdminActionDrawer.tsx`,
`adminCatalog.ts`), 21 lệnh / 6 nhóm, xem tại `/execution/_fixtures`.

Catalogue hiện là **fixture**, và màn tự nói ra điều đó bằng `CATALOG_SOURCE`.
Ngày `packages/contracts` có catalogue canonical, việc còn lại là đổi nguồn —
không phải dựng lại màn.
