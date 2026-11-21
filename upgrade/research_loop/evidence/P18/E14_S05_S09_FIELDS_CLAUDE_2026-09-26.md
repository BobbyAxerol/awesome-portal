# E14 — trường còn thiếu ở S05 và S09 (Claude, viết lại 2026-09-30 từ diff và kiểm chứng)

Unified §13.4.1 E14 · dòng HiFi audit 5.11, 5.12, 9.7, 9.8, 9.10, 9.15 trong
[`HIFI_AUDIT_S00_S14_CLAUDE_2026-09-26.md`](../HIFI_AUDIT_S00_S14_CLAUDE_2026-09-26.md) · backend ≤P21 + frontend, Claude.

**Vì sao record này viết muộn.** Agent làm E14 bị cắt vì giới hạn phiên trước khi kịp viết record, và
plan lại trỏ tới file này từ ngày 27/9 — một link gãy. Nội dung dưới đây **viết từ diff đã gộp và từ
dữ liệu thật đọc lại ngày 30/9**, không từ ghi chú của agent. Chỗ nào ghi "chứng minh", test hoặc lần
đọc được nêu ngay cạnh.

## 1. Đã giao

| Dòng | Việc | Nơi | Trạng thái |
|---|---|---|---|
| 5.11 | Quét ranh giới (`gap_scan`) trên split lane retained | `current-source-split-integrity.ts` (mới, 242 dòng), `current-source.service.ts`, contract | **Xác nhận trên dữ liệu thật** |
| 5.12 | `stitch_digest` trên split | cùng chỗ | **Xác nhận trên dữ liệu thật** |
| 9.7 | Qualifier "declared, not executed" cho identity P04 (`P04_FIXED_PROFILE_RUN_DID_NOT_EXECUTE_THE_DECLARED_OPTIMIZER`) | `report-core-v2.ts:94` | **Đóng ở mức code + test, chưa thấy trên dữ liệu thật** — xem §3 |
| 9.8 | Ô `NET_RETURN` trong `headline` P18 (additive, "core seal trước E14 có sáu ô") | `report.contract.ts:87`, `report-core-v2.ts` | **Đóng ở mức code + test, chưa thấy trên dữ liệu thật** — xem §3 |
| 9.10 | Lưới equity sáu đường (`yRulePcts`), chỉ vị trí, các đường giữa không gán nhãn (VD-P20-27) | `reportEquity.ts` | Test đơn vị; **chưa xác nhận bằng mắt trên dữ liệu thật** |
| 9.15 | Dòng "evidence link" ở provenance S09 | `ReportDetail.tsx` | **Xác nhận trên dữ liệu thật** |

Diff: backend commit `3fa4c801` — 21 file, +1077/−37 (gồm `research-e14-split-integrity.spec.ts` 272 dòng,
fixture split canonical mới); frontend — 7 file, +495/−14 (`SplitDetail.tsx`, `ReportDetail.tsx`,
`reportClient.ts`, `reportEquity.ts`, `researchRefusal.ts`, hai file test). Gộp vào nhánh ở merge `00206d48`.

## 2. Bằng chứng trên preview `c81e8dc2` (đọc-only, 2026-09-30)

Preview này đã chứa `3fa4c801`. Đọc API rồi nhìn màn ở 1440:

| Kiểm | Kết quả |
|---|---|
| `GET …/current-source/split` (run WFO `rrun_e1fa9e5c…`) | `stitch_digest = 812b913261e74c50…`, `gap_scan.state = AVAILABLE`, basis `QUANTBT_ACCOUNT_EXECUTION_PLAN_BOUNDARY_EVENTS_V1`, scope `OUTER_FOLD_TEST_WINDOW_BOUNDARIES` |
| S05 trên màn | "Boundary integrity — gap scan ✓ *1 of 1 fold boundary · no gap at any of 1*"; "Stitched OOS provenance — stitch digest `812b913261e7…` *verified against fold boundaries · 2 segments, 336 retained observations*" |
| Cùng read cho run P04 | không có field — đúng: lane retained chỉ có ở WFO, P04 đi đường split P14 |
| S09 provenance (WFO) | có dòng `evidence link /research/quantbt/runs/rrun_e1fa9e5c/report?report_revision=p18r1_5ec01107` |

## 3. Vì sao ô NET_RETURN và qualifier P04 không hiện — và đó không phải lỗi

Read `GET …/runs/{id}/report` của cả hai run trên preview trả `headline` với **đúng sáu khoá**
(`OOS_SHARPE · DECAY_MEAN · MAX_DRAWDOWN · TRADES · WIN_RATE · FUNDING`), không có `NET_RETURN`; và hàng
`identity.optimization` của run P04 vẫn là `mode_1_decay × global`, `AVAILABLE`, không qualifier.

Nguyên nhân nằm ngay trong contract: `report.contract.ts:87` ghi *"`NET_RETURN` is additive — a core sealed
before E14 has six tiles"*. Report là **bất biến sau khi seal**; cả hai run trên preview được seal trước
E14, nên không thể có hai thứ này. Chúng chỉ xuất hiện ở report của **run seal sau E14**.

Hệ quả cho sổ: ngày 27/9 sổ ghi E14 là "ĐÓNG" cho 9.7/9.8. Đúng phải là **"đóng ở mức code + test;
receipt trên dữ liệu thật đang chờ một run seal sau E14"**. Preview đang chỉ-đọc nên hiện chưa có run
như vậy — đó cũng là điều kiện chung cho E13, E16-R1 và E10-O1/O3 (xem plan §13.4.1 mục G, G10).

## 4. Test

| Gate | Kết quả |
|---|---|
| Backend E14 (`research-e14-split-integrity`, `research-report.service`, `research-w6a-report`, `research-current-source.*`) | chạy trong pre-commit hook của merge `00206d48`, exit 0; **không có số theo từng file** vì agent bị cắt trước khi ghi |
| Contracts snapshot | 216/216 tại thời điểm gộp |
| Frontend vitest (`src/research` + `src/features/quantbt` + `src/app`) | 1422/1422 lúc gộp; **52 file · 1512 pass · 1 skip, exit 0** trên HEAD `a00df203` (2026-09-30) |
| `tsc -b --noEmit` | exit 0 trên HEAD |

## 5. Còn mở

1. **Receipt thật cho 9.7/9.8** — cần một run seal sau E14 (plan G10).
2. **9.10** — nhìn lưới sáu đường trên dữ liệu thật; chạy lại in Letter/A4 (plan G5).
3. E14 không đụng tới `top_is_k` / `max_drawdown` của S06 — phần đó ở [E5](../P15/E5_S06_STAGE_B_CLAUDE_2026-09-26.md).
