# Execution Loop V2 — Sổ đồng bộ Frontend ↔ Backend (sống)

Chủ ghi: Claude (phía FE). Codex đọc ở **đầu mỗi round**, trả lời bằng cách đổi `Status` trong packet phase sở hữu và
nêu ID ở đây (xem [Rules §10](AGENT_WORKING_RULES.md)). Đây là **ledger duy nhất cho request FE → BE** và cho review
của FE về backend; ledger BE → FE vẫn nằm trong packet từng phase. Không nhân bản sang file khác.

Trạng thái bản này: Rules §9–§10 **đã được Bobby duyệt 2026-10-17**; sổ này là công cụ vận hành của chúng. Chưa có UXM nào được giao; mọi request dưới
đây là yêu cầu *chuẩn bị contract*, không phải lệnh mở phase.

## 0. Nhật ký pin — lần đọc gần nhất

| Nguồn | Pin đã đọc | Ngày đọc | Ghi chú |
| --- | --- | --- | --- |
| Portal `docs/research-loop-plan` | `0aad2697` ("complete scoped score history and exact PM candidate codecs"); đã đọc kỹ đến `f1f5fc7d`, commit cuối đọc ELP2-06 scoped-score-history + README 06/07 | 2026-10-17 | `claude/fe-parity` đã rebase lên `0aad2697` (docs-only, chưa có code FE V2) |
| TS execution (HK) | `c4819bc0` (`feat/v2-rust-first-okx-demo`) | 2026-10-17 ~11:15Z | Tôi đọc qua SSH chỉ-đọc; không kiểm runtime |
| PM (HK) | tôi đọc `673ce7cf`; **Codex ghi `e62b6825…` (10:29–10:31Z)** | 2026-10-17 | **CHƯA ĐỐI CHIẾU**: hai pin khác nhau (khác worktree hoặc PM đã tiến). Phải đọc lại trước khi dùng bất kỳ ngữ nghĩa PM nào |
| Edge EPG10 (HK) | `8560ac10…` | 2026-10-17 | Hai bên cùng pin; code chỉ có ở HK, không trong repo local |

### Sổ agent (tái dùng theo Rules §10.8)

| Vùng | Agent | Pin đã đọc | Trạng thái | Khi nào hỏi tiếp |
| --- | --- | --- | --- | --- |
| TS execution (HK) | `a617b80c6a131e34a` | `c4819bc0` | Đã hoàn thành digest 2026-10-17 | Hỏi *phần thay đổi* khi pin TS tiến |
| PM (HK) | (agent digest PM, ID trong transcript) | `673ce7cf` | Đã hoàn thành; **cần đối chiếu `e62b6825`** | FE-019 |
| Edge (HK) | (agent digest Edge, ID trong transcript) | `8560ac10` | Đã hoàn thành | Khi Codex nêu EPG10 đổi |

Ghi chú: hai ID cuối chưa được ghi lại trong phiên này; lần giao kế tiếp phải lấy ID thật từ danh sách agent và cập nhật bảng.

### Thay đổi từ lần đọc trước (đã đọc, 2026-10-17) và tác động lên FE

| Thay đổi của Codex | Mức khẩn với FE | Việc FE cần nhớ khi được giao |
| --- | --- | --- |
| **Receipt đặt-mục-tiêu không có số tiền** (`SET_ROOT_LIMIT`, `ADJUST_TARGET_BUDGET` có thể `amounts: null`; fixture `W08-ROOT-LIMIT-NONAMOUNT`, `W08-TARGET-BUDGET-REJECTED-NONAMOUNT`) | **Cao khi dựng màn lệnh vốn** | Không vẽ bảng chia 5 phần giả cho receipt không có amount; hiển thị hiệu ứng đặt-mục-tiêu. `UNKNOWN` thì hỏi lại ý định gốc, không gửi lại |
| `manager-models.d.ts` +293 dòng, OpenAPI manager +4811, dataset schema +925; thêm `regime_details`, calculation revisions (migration `…138`) | Cao ở lúc sinh type | Regenerate types, không sửa tay; Regime ở dataset vẫn `value: null` (chỉ nằm per-alpha/deployment) |
| Regime publication/runtime, score recalculation, composition publication | Trung bình | Chi tiết Regime nằm ở `regime_details`; summary dataset vẫn "policy_pending/unavailable" |
| **Scoped Score history (06)**: `executionManagerScoreRevisionGetV1` / `…HistoryGetV1`, types `ManagerScoreRevisionView/History/HistoryQuery`, fixture `…score-history.available.synthetic.valid.json`; hai cursor `after`/`before`, supersedes ref, nhãn CURRENT/NOT_CURRENT/UNKNOWN, luôn `HISTORICAL_ANALYSIS_ONLY` | Trung bình (cho Score history UI) | Thứ tự pointer là **nhân quả, không theo đồng hồ**; 409 khi tập quyền đổi → xóa pin; không suy ra số đếm ẩn; không coi lịch sử là Score hiện hành. Ghi chú review: cần fixture 409 và `UNKNOWN` |
| Hub realtime lifecycle (09) — vẫn NOTIFICATION_ONLY | Thấp | Không biến notification thành event replay tài chính |
| PM control candidate (lock/unlock) — **module riêng, không mount** | Thấp | Không có hành động lock/unlock qua Portal |
| Retained business aliases, finite retained pages (04) | Trung bình | Alias/route retained có thể đổi; không hard-code |

## 1. Hộp thư đến — request Codex → Claude còn mở (tất cả `AWAITING_CONSUMER_REVIEW`)

| ID | Nội dung ngắn | Cần làm ngay? |
| --- | --- | --- |
| ELP2-REQ-00-001 | Audit UXM-00 (browser/reuse/role journeys); preview hiện tại là bản lưu | Không — cần Bobby giao UXM-00 |
| ELP2-REQ-04-010 | ACK handoff scoped reader | Không — chờ giao |
| ELP2-REQ-05-002 | Catalogue tĩnh + ngữ nghĩa page hiện tại | Không — chờ giao |
| ELP2-REQ-06-001 | UXM-08: named reads/type/fixtures cho Score/Regime | Không — chờ giao |
| ELP2-REQ-08-001 | Receipt vốn; thêm non-amount | Không — chờ giao, nhưng **đọc §0 hàng 1** |
| ELP2-REQ-09-001 | UXM-08/09/10: map `ScopedRealtimeFrame`; không biến notification thành replay | Không — chờ giao |
| ELP2-REQ-10-001 | Commissioning/coverage | Không — chờ giao |

Kết quả đối chiếu round này: **không có request nào buộc FE hành động ngay**; không request nào bị bỏ qua.
Mọi ACK (ACCEPTED/CHANGES_REQUESTED) chỉ ghi khi Bobby giao UXM tương ứng.

## 2. Cách Codex bàn giao một API chính (đặc tả "đủ để FE nối thật")

Đề xuất này bổ sung (không thay) Rules §7.2. Với **mỗi** operation FE sẽ dùng (6 route Manager; `capital` commands;
access/profile; scoped realtime), Codex giao đủ:

1. **Định danh:** `operationId`, method + path, tên type sinh ra (vd `ManagerDatasetResponse`), đường dẫn file schema
   JSON + OpenAPI, `producer_sha`, mức giao hàng (published / landed / runtime-qualified).
2. **Schema đầy đủ chặt:** `additionalProperties:false`, enum khép kín, decimal là chuỗi, UTC ms, ràng buộc chéo
   (vd `availability ↔ value ↔ reason_code`) **được ghi ra như một bảng bất biến** (không chỉ nằm trong `superRefine`
   mà JSON schema không biểu diễn được — FE không có zod).
3. **Phong bì lỗi:** mọi mã lỗi có thể có (kể cả `EXECUTION_READ_PUBLICATION_NOT_QUALIFIED` 503, vượt 1 MiB, cursor
   hết hạn, cursor sai ngữ cảnh, quyền, vượt giới hạn filter), kèm HTTP status, `Retry-After`/idempotency, và UI nên
   làm gì (retry / hỏi lại / dừng).
4. **Ngữ nghĩa trang & cache:** cursor opacity, ổn định khi snapshot đổi, `snapshot_id` bắt buộc gửi lại hay không,
   header cache/ETag.
5. **Bộ fixture (xem §2.1)** theo kịch bản bắt buộc.
6. **Bảng "có thật / chưa có thật" theo field** (cột vào Source Truth Board): field nào luôn `null` do nguồn chưa có.
7. **Lệnh regenerate + test drift** và nếu schema đổi: changelog (thêm/bỏ/đổi nghĩa) và có phá tương thích không.

### 2.1 Vòng đời fixture: "mẫu → xóa khi ghép thật"

Mỗi fixture có khai báo trong một **manifest** (một file, ví dụ `fixtures/MANIFEST.json`):

```
fixture_id, operationId, schema_version, producer_sha, lane, scenario,
origin: CODEX_CANONICAL | FE_DERIVED | REAL_RECEIPT,
retire_when: "<ELP2-REQ-id> VERIFIED with real receipt"
```

- `CODEX_CANONICAL`: do Codex sinh; FE không sửa. `FE_DERIVED`: FE biến đổi hợp lệ từ canonical; phải qua schema.
- **Xóa khi ghép thật:** lúc operation vào G6 (nối thật), cùng một commit: (a) thêm receipt thật đã che, (b) xóa fixture
  `FE_DERIVED` và route BFF-double của operation đó, (c) gỡ entry khỏi manifest, (d) test `manifestHasNoRetiredFixtures`
  fail nếu operation đã đánh dấu `real: true` còn entry synthetic. Fixture L0 của Codex giữ lại ở contracts cho test
  producer; FE không import chúng vào product graph.
- Mọi receipt/screenshot ghi **lane**: `FIXTURE_LAB` / `BFF_DOUBLE` / `REAL_READ_RETAINED` / `REAL_READ_QUALIFIED`.

### 2.2 Kịch bản fixture bắt buộc cho mỗi dataset BFF

(a) trống (0 hàng) · (b) 1 hàng đầy đủ · (c) thưa thực tế (nhiều `UNAVAILABLE`/null, mọi reason_code đang có) ·
(d) 200 hàng + `next_cursor` + `previous_cursor` · (e) nhiều nhóm (`group_by` 2 cấp) · (f) STALE/UNKNOWN freshness,
PARTIAL/UNRESOLVED completeness · (g) nhiều `economic_partition` (ACTUAL/PAPER/SANDBOX tách) · (h) lỗi 503 not
qualified và các mã lỗi còn lại · (i) response sát 1 MiB · (j) âm tính (field thừa/enum lạ/decimal sai) cho reader.
Codex giao (a)(b)(c)(h) ở mức canonical; FE tự suy ra (d)(e)(f)(g)(i)(j) rồi nhờ Codex rà schema.

## 3. Request FE → BE (`ELP2-REQ-FE-nnn`)

Tất cả `OPEN`, **chưa đánh dấu bất kỳ phase nào bị chặn thật** cho đến khi Bobby giao UXM. Ưu tiên: **P1** cần trước
khi khóa wireframe; **P2** cần trước khi nối thật; **P3** tối ưu.

| ID | Pri | Cần gì | UI bị chặn | Owner luồng | Done-when | Ref đề xuất |
| --- | --- | --- | --- | --- | --- | --- |
| ELP2-REQ-FE-001 | P1 | Đặc tả bàn giao theo §2 cho 6 route Manager + commands + realtime | Mọi màn | Portal | Codex chấp nhận mẫu §2 và giao cho route đầu tiên | proposal §6 |
| ELP2-REQ-FE-002 | P1 | Bảng ánh xạ chính thức stage (`CANARY/LIVE` ↔ `LIVE_CANARY/LIVE_FULL`), `economic_domain` ↔ environment, lọc `replay/backtest` | Stage chips, partition | Portal+TS+PM | Bảng có owner + test | R-11 |
| ELP2-REQ-FE-003 | P1 | Nguồn của `alpha_version_id` (PM không có version) và cách gắn vào row grain | Fleet, Alpha | PM+Research+Portal | Quy tắc viết ra + fixture | R-12 |
| ELP2-REQ-FE-004 | P1 | Bảng từ vựng freshness/completeness thống nhất (4 bộ hiện có), chỗ của `AGING` | Chip freshness mọi màn | Edge+Portal | Một bảng ánh xạ + test | R-16 |
| ELP2-REQ-FE-005 | P1 | Quy ước tổng thiếu nguồn: PM null cả aggregate → Portal hiển thị `PARTIAL` thế nào, có tổng một phần không | Overview, Capital | PM+Portal | Quy ước + fixture (c) | R-14 |
| ELP2-REQ-FE-006 | P1 | Xác nhận mọi return hiện là Modified-Dietz **không phải TWR**; `methodology_ref` bắt buộc khi có return/DD | Ô return/DD | TS+Portal | Field + copy dictionary | R-15 |
| ELP2-REQ-FE-007 | P1 | Quy tắc `metrics`: tập khóa bảo đảm có mặt (hiện `z.record(managerScalar,…)` làm mọi khóa tùy chọn), chỉ DECIMAL hay cả TEXT | Fleet table | Portal | Schema/tài liệu chốt tập khóa | mới |
| ELP2-REQ-FE-008 | P1 | Tìm theo tên: filter chỉ có `EQ/GTE/LTE/IS_NULL` nên không tìm "chứa/bắt đầu bằng" | Fleet search | Portal | Thêm `q`/op `PREFIX` hoặc chốt không có | R-06 một phần |
| ELP2-REQ-FE-009 | P2 | Hành vi khi vượt 1 MiB hoặc `children` lớn (tối đa 10 000/hàng): cắt, lỗi, hay phân trang con; mã lỗi | Fleet, Portfolio | Portal | Mã lỗi + fixture (i) | mới |
| ELP2-REQ-FE-010 | P2 | `capital_statements`/`statement_scope = …BEFORE_TABLE_FILTERS`: xác nhận KPI strip **không** đổi theo filter bảng; cung cấp hay không bản có lọc | Overview, Fleet | Portal | Ghi rõ + field | mới |
| ELP2-REQ-FE-011 | P2 | `score` là scalar sort/filter được nhưng mọi score `policy_pending` → sort ra toàn null; có ẩn khỏi `managerScalar` tới khi qualified không | Fleet sort | Portal | Quyết định + test | mới |
| ELP2-REQ-FE-012 | P2 | Sort/filter theo `stage_presence`, `group_by` mở rộng; cursor ổn định khi snapshot đổi | Fleet | Portal | Spec + fixture (d)(e) | mới |
| ELP2-REQ-FE-013 | P2 | Manager time-series (equity/NAV theo thời gian), batch sparklines | M01, Alpha | Portal+TS | Operation + fixture | R-01, R-04 |
| ELP2-REQ-FE-014 | P2 | Portfolios directory; cross-env "All" (hiện bắt buộc `environment`) | M01 "All", Fleet | Portal | Operation hoặc quyết định bỏ | R-02, R-03 |
| ELP2-REQ-FE-015 | P2 | Hành động: danh sách eligibility theo hàng + lý do bị tắt (public copy dictionary) | Action menus | Portal | Field + dictionary | R-09, R-08 |
| ELP2-REQ-FE-016 | P3 | Saved views, export, archived read | M10, Archive | Portal | Quyết định có/không | R-05, R-07 |
| ELP2-REQ-FE-017 | P1 | Tên/đơn vị metric statement (`opening`↔`initial_funds`, tách decrease/recall, `pending_fees`) | Capital block | PM+Portal | Bảng ánh xạ | R-13 |
| ELP2-REQ-FE-018 | P1 | Đưa code Edge EPG10 (chỉ ở HK) vào nhánh tích hợp hoặc ghi rõ nó không phải nguồn của contract Portal | Căn cứ ELP2-09 | Codex/Bobby | Quyết định + pin | R-17 |
| ELP2-REQ-FE-019 | P1 | Đối chiếu pin PM (`673ce7cf` vs `e62b6825`) và cập nhật Source Truth Board | Toàn bộ ngữ nghĩa PM | Codex | Pin thống nhất | mới |

## 4. Review của FE về phần backend của Codex (nhìn từ phía người dùng contract)

Đây là **review**, không phải yêu cầu sửa; mỗi mục có severity. Codex có thể bác bằng bằng chứng.

**Điểm làm tốt (giữ nguyên):**
- Phong bì `metric` nhất quán: `availability` + `reason_code` + `quality` + `provenance_refs` + `methodology_ref` cho mọi số.
- `economic_partition` bắt buộc cho tiền, không cộng chéo; `PARTITIONED_ONLY`.
- Từ chối an toàn: 503 `NOT_QUALIFIED` thay vì số giả; score `policy_pending` thay vì số tạm.
- Không rò thông tin: `AUTHORIZED_ONLY`, `authorized_filtered_count`.

**Mối lo ngại:**

| # | Severity | Locator | Nhận xét |
| --- | --- | --- | --- |
| RV-1 | MAJOR | `manager-model.contract.ts` `superRefine` trên metric/query | Ràng buộc chéo (`availability↔value↔reason_code`, `IS_NULL ↔ value`, decimal filter) chỉ sống trong zod; **FE không có zod** và JSON schema không biểu diễn hết. Cần bảng bất biến ghi rõ (xem §2.2) để reader viết tay không lệch |
| RV-2 | MAJOR | `managerDatasetRow.metrics: z.record(managerScalar, managerMetric)` | Mọi khóa tùy chọn; không rõ khóa nào bảo đảm có. FE phải code mọi ô như "có thể thiếu" thay vì "có hoặc `UNAVAILABLE`" |
| RV-3 | MAJOR | `statement_scope = …BEFORE_TABLE_FILTERS` | Bẫy UX: KPI strip không đổi khi lọc bảng, người dùng sẽ hiểu sai. Cần xác nhận + có thể cần bản có lọc |
| RV-4 | MAJOR | Filter `EQ/GTE/LTE/IS_NULL` trên TEXT | Không tìm theo tên được — thiếu thao tác cơ bản của sàn |
| RV-5 | MINOR | `scores.*` luôn `policy_pending` nhưng `score` vẫn là scalar sort/filter | Sort/filter vô nghĩa; ẩn đến khi qualified |
| RV-6 | MINOR | `children` ≤10 000/hàng trong tổng 1 MiB | Hành vi khi chạm trần chưa rõ |
| RV-7 | MINOR | `quality.freshness` chỉ `FRESH|STALE|UNKNOWN` | Edge có `AGING/PAUSED`; ánh xạ chưa viết |
| RV-8 | NOTE | Fixture canonical quá nhỏ (1 hàng, TEST_ONLY) | Không đủ để kiểm sort/page/group/quy mô |
| RV-9 | NOTE | Mọi lớp "đã giao" là source-dark | Mức giao hàng cần ghi rõ trong mọi handoff (đã làm tốt ở 7.2) |
| RV-10 | NOTE | Docs cũ (Edge-Unified §23.4, hàng guide ở Unified) | Dễ gây hiểu nhầm hiện trạng |

## 5. Quy ước dùng sổ này

- Đầu mỗi round: cập nhật §0 (pin) và §1 (hộp thư); không có thay đổi vẫn ghi "đã đối chiếu, không phát sinh".
- Cuối mỗi round: cập nhật §3 (request mới/đã giao) và §4 (review mới) trước khi báo Bobby.
- Codex đổi trạng thái request trong packet sở hữu và nhắc ID ở commit message; FE đổi `Status` trong cột done-when ở đây
  chỉ sau khi nhận ACCEPTED/CHANGES_REQUESTED có locator.
