# P17 — Thanhvuong backend request receipt (Screen 08)

Receipt riêng cho mọi việc S08 cần từ backend (@codex) và từ Bobby. Receipt
chính: [thanhvuong-frontend-receipt.md](./thanhvuong-frontend-receipt.md).
Evidence máy đọc được: [thanhvuong-test-results.json](./thanhvuong-test-results.json),
[thanhvuong-debt-register.json](./thanhvuong-debt-register.json).

**Ngày kiểm lại:** 2026-09-23. Kiểm trên nhánh `feat/thanhvuong/research-p17-p21`
và trên baseline mới `primus-origin/docs/research-loop-plan` = `e39bacfa`
(CLAUDE.md §7.6, §7.9). Kết quả: `research-replay.openapi.json` và
`research-current-source.openapi.json` giống hệt nhau ở hai bên. Chưa có
fixture replay ở cả hai bên. Addendum RF-01/RF-02 không trả lời request nào
dưới đây. **Cả ba `CG-P17-*` vẫn mở.**

Luật ghi (handoff campaign `THANHVUONG_P17_P21_FRONTEND_HANDOFF.md` + CLAUDE.md
§5): mỗi request có locator, actual, expected, đề xuất nhỏ nhất an toàn, test
cần có. Đề xuất chỉ là đề xuất; Codex quyết. Frontend không sửa backend,
contract hay runtime để màn hình xanh.

## 1. `CG-P17-*` — khoảng trống phía consumer

### CG-P17-01 — fixture canonical cho replay

```text
Backend request
- Endpoint/field cần: fixture versioned cho researchReplayDetailGetV1
- Lý do UI: CLAUDE.md §7.8 — test phải nạp fixture đã publish, không tự dựng object
- Ảnh hưởng hiện tại: S08 test + probe đang stub theo shape của contract spec
- Đề xuất schema: không đổi schema; chỉ thêm file fixture
```

| Mục | Nội dung |
|---|---|
| Locator | `packages/contracts/openapi/research-replay.openapi.json`; `apps/control-api/test/research-replay.contract.spec.ts`; `apps/portal/registry/fixtures/` (không có replay) |
| Actual | Không có fixture replay nào trong repo. `executeReplay.test.tsx` và probe browser dựng body từ shape trong contract spec và `replay.service.ts` |
| Expected | Fixture versioned: `RETROSPECTIVE_EQUITY_ONLY` với `FULL` và `EXTREMA_BUCKET_V1`; `PENDING_SOURCE_CALLBACK`; `LEGACY_METADATA_ONLY`; `NOT_PUBLISHED`; `state_at_cursor` có chọn / `NOT_SELECTED`; Problem 400 `CURSOR_INVALID`, 403, 404, 409 `CURSOR_EXPIRED`, 503 |
| Đề xuất nhỏ nhất | Xuất các body mà contract spec đang assert ra `packages/contracts/fixtures/research-replay.*.valid.json` |
| Test khi có | Test S08 và probe nạp fixture thay cho stub; một test fixture ↔ OpenAPI |
| Fallback đang chạy | Stub theo shape spec, ghi rõ trong đầu file test |

### CG-P17-02 — biết trước run có lane retained hay không, và mã lỗi của lane đó

```text
Backend request
- Endpoint/field cần: fact typed cho biết run có retained current-source replay;
  mã lỗi RESEARCH_CURRENT_SOURCE_* trong generated contract
- Lý do UI: không bắt người dùng bấm thử để biết một lane có tồn tại
- Ảnh hưởng hiện tại: panel "retained model replay" chỉ đọc khi bấm
- Đề xuất schema: vd. replay.retained_source = { state, reason_code }
```

| Mục | Nội dung |
|---|---|
| Locator | `apps/control-api/src/research/current-source.error.ts:7–8` (mã chỉ có ở đây); `research-current-source.openapi.json` (không liệt kê mã); `replayClient.ts` `RETAINED_NOT_RETAINED` / `RETAINED_NOT_FOUND` |
| Actual | Frontend chỉ biết khi đã gửi request. 409 `RESEARCH_CURRENT_SOURCE_CONFLICT` nghĩa là "chưa có retained source" (pending retention hoặc run cũ); RF-02 tìm ra nghĩa này trên API thật. Generated contract không có tên mã nào |
| Expected | (a) Một field typed trên replay hoặc run, cho biết retained source có sẵn, đang chờ, hay không áp dụng. (b) Mã `RESEARCH_CURRENT_SOURCE_*` trong OpenAPI, để consumer không phải đọc mã từ source control-api |
| Đề xuất nhỏ nhất | (b) trước: thêm enum mã vào schema Problem của current-source. (a) sau, additive |
| Test khi có | S08 không gửi request thử cho run không có lane; exhaustiveness test mã ↔ mapper |
| Fallback đang chạy | Nút "read retained replay"; 409 → `unavailable` với câu của mapper chung; 404 → `empty` |

### CG-P17-03 — ngữ nghĩa hai số đếm sample (A09)

| Mục | Nội dung |
|---|---|
| Locator | `research-replay.openapi.json` `ReplayWindow.source_observation_count`, `.emitted_point_count` |
| Actual | Readout "sample N of M" dùng `emitted_point_count`. Màn in cả hai số, có nhãn |
| Expected | Codex xác nhận: M = `emitted_point_count` (số sample có thể replay), còn `source_observation_count` = số quan sát trước khi gộp bucket |
| Đề xuất nhỏ nhất | Một câu `description` trên hai field trong OpenAPI |
| Test khi có | Unit assert nhãn theo xác nhận |
| Fallback đang chạy | In cả hai số, có nhãn, không suy ra số thứ ba |

## 2. P17-B — capability nguồn (không cấp ID mới)

Giữ đúng tên hàng trong [source-capability-matrix.md](./source-capability-matrix.md).
Frontend chỉ giữ panel, kèm reason code nguồn trả về; không tự map, không đọc
DB/artifact/Parquet.

| Hàng matrix | Actual (field hôm nay) | Expected (tối thiểu) | Panel / fallback | Test Guide |
|---|---|---|---|---|
| account/position state at playhead | `state_at_cursor.execution_state=NOT_PUBLISHED` | snapshot position/account có revision theo event/checkpoint gốc | "execution state — not published" | T12, T14 |
| orders/fills/trades | `route_capabilities.{orders,fills,trades}=NOT_PUBLISHED` | ledger có ID gốc, scope route/fold, số lượng/giá/phí chính xác | anatomy, blotter, PnL distribution không có dòng | T01, T10 |
| event order / same timestamp | `source_absences.cross_stream_order=NOT_ASSERTED` | event stream identity, sequence scope, tie-break | event ledger in sample, ghi "samples, not events" | T05, T11 |
| OCO / partial fill / multi-leg | `NOT_PUBLISHED` | ID parent/child/leg, chuyển trạng thái | route-aware facts | T02 |
| candles / SL-TP / MAE-MFE | `NOT_PUBLISHED` | candle/trade window, quy ước intrabar, công thức MAE/MFE | chart là sample; MAE×MFE không có điểm | T02 |
| funding / capital / fold reset | `NOT_PUBLISHED` | funding rows, quy ước vốn theo fold | cost timeline; không compound equity | T03, T14 |
| child audit / reused original | `NOT_PUBLISHED` | ID gốc/con bất biến | capability gap | T14 |
| certificate badge | không có | certificate/evidence versioned | không vẽ badge | T08 |

## 3. Việc Bobby quyết (không phải backend)

| # | Việc | Lý do | Đề xuất |
|---|---|---|---|
| B1 | Tích hợp baseline `952ad48f`…`e39bacfa` | 1 xung đột ở `FreezeDetail.tsx`; S08 nên dùng `toResearchRefusal` + `recovery` | Bobby merge/rebase, hoặc cho phép Thanhvuong làm, rồi chạy lại toàn bộ test |
| B2 | Tiêu đề S08 | hi-fi và spec đều nói có order | "S4 · Execute Replay — what this source can replay" |
| B3 | LENS, dòng artifact + COPY EVIDENCE LINK, Reveal mode | không có field; copy link đổi invariant chỉ-đọc | chưa làm cho đến khi có field |
| B4 | Bật hook cho workspace thanhvuong; cách chạy axe | như P16 | — |
| B5 | Hai test S01/S06 timeout khi chạy 2 worker | ngoài diff P17 | `fix/*` riêng nếu cần |

## 4. Trạng thái

| ID | Chủ | Trạng thái 2026-09-23 |
|---|---|---|
| CG-P17-01 | Codex → Claude (W5b) | ANSWERED 2026-09-25 — `packages/contracts/fixtures/research-current-source.replay*.valid.json` (real-HMD seal), see [W5B_REPLAY_CLAUDE_2026-09-25.md §6](./W5B_REPLAY_CLAUDE_2026-09-25.md) |
| CG-P17-02 | Codex → Claude (W5b) | ANSWERED 2026-09-25 — lane state from RF-05; `ProblemCode` enum in research-current-source OpenAPI 1.4.0 |
| CG-P17-03 | Codex → Claude (W5b) | ANSWERED 2026-09-25 for the retained lane (no bucketing in the replay relation; overview carries its own counts); hub semantics unchanged |
| P17-B ×8 | Codex / source | `SOURCE_CAPABILITY_BLOCKED` |
| B1–B5 | Bobby | chờ quyết |
