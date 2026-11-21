# FE-W1–W5 — Thanhvuong frontend receipt

**Trạng thái:** `W1–W5 FE landed · gates đo 2026-10-03 trên bundle index-C6w4OUAn.js · NOT_VERIFIED` (print acceptance, browser acceptance của Bobby, release ký: chưa có).
Receipt chỉ ghi thay đổi frontend và evidence. Không đổi rule, contract, backend hay flag.

## 1. Git

| Mục | Giá trị |
|---|---|
| Nhánh / HEAD | `claude/fe-parity` / `c5795c71` (tree `f1d1d5ec`) |
| Base cho W4–W5 | `b2098a81` |
| Tổng `b2098a81..HEAD` | 450 file, +19352/-5529 |

## 2. Commit (numstat từ `git diff --numstat <sha>^ <sha>`)

| Gói | SHA | Nội dung | Numstat |
|---|---|---|---|
| W1 | `02e16865` | run-status trung thực, lối thoát S03–S13, link theo cursor, một humaniser, S10 view mặc định | 85 file +7234/-604 |
| W2 | `c77d4aa7` | New Run validation, history từng bước + draft, route cũ redirect, một Import refusal | 64 file +2341/-860 |
| W3 | `bfbf5ca4` | top bar mobile 56px + menu Display, bỏ chip maturity, thẻ cursor thu gọn, hit area 24/44px | 18 file +973/-78 |
| W4 | `e92f74ca` | ít chữ: một humaniser, một notice, hub = summary, tooltip | 143 file +4167/-4228 |
| W4 fix | `d1e0b839` `51dbe35d` `93acaeb2` `6a9a97cc` | đóng request backend W1/W2, read contract, copy lane | 56 / 50 / 4 / 1 file |
| W4 baseline | `f6701e77` `c1276a7d` | Research + legacy baseline (ảnh) | 27 / 71 file |
| W5 | `c4d84d1a` | một chart contract, `window` trong hash, phím transport theo phạm vi, axe S03/05/06/07/09/13 | 68 file +2468/-901 |
| W5 test | `e7414e1f` `14740755` `340dddfe` | spec W5, gate axe/chart/cursor, guard + điều hướng causal | 2 / 3 / 36 file |
| W5 fix | `a163af4b` `be1ce126` `201eed31` | landmark, heading, S07 roving tabs, contract S13/S04/S09, seq chỉ ở execute, tương phản nút/lane | 28 / 3 / 3 file |
| Token | `23ef532e` | `--ink-faint` `#5f6b80`/`#8a98ac`, `--ink-mute` `#566278` | 4 file +83/-24 |
| Baseline W5 | `1ca9d4ec` `1f6d8392` `c5795c71` | Research 16 ô, legacy 95 ô, run-audit 4 ô | ảnh |
| Sau gate | `51ea3507` `a226d1d9` `f0346ef8` | tooltip cert Lineage; S08 IS summary + bảng nến sau Data; export prepare-then-download | 3 / 5 / 5 file |
| Docs / test BE | `9589e7a8` `54030536` `ae20de6d` `b8bcf7de` `ee63e12f` | ledger, §31 addendum, WFO/P24, P23 | không thuộc FE code |

## 3. Mapping W1–W5 → màn

| Gói | Màn | Thay đổi chính |
|---|---|---|
| W1 | S03–S13 | banner một dòng cho failed/cancelled/queued/not-found/denied; RC không in verdict khi đã seal; link mang cursor; S10 mở 8 probe mới nhất |
| W2 | S00, S02, S14, Library | validation WFO, draft tự lưu, `/new→/runs/new`, `/imports→/alpha-import`; stepper S14 |
| W3 | shell, S04 | top bar 56px; thẻ cursor 39px; tab hub không có ô Promotion |
| W4 | S00–S14 | số từ giảm (S09 1330→938, S10 599→188, S11 656→246, S12 1024→352) |
| W5 | S04–S09, S13 | `useChartContract`, một tab stop mỗi chart, touch pin, reduced motion, `withWindow`/`runScreenHref` |

## 4. Quyết định đã chốt

| Quyết định | Ghi chú |
|---|---|
| `window` nằm trong hash | `?window=` được viết lại một lần |
| Link Report/RC mang `window` | không mang seq/schedule/route |
| `seq` chỉ ở stage execute | không còn P04 `seq=1` |
| `trial` không phải số bị từ chối kèm notice | đảo RF01-F5 "carry verbatim" |
| Token xám `--ink-faint`, `--ink-mute` | Bobby duyệt 2026-10-02 |

## 5. Gate đo được (2026-10-03)

| Gate | Kết quả |
|---|---|
| vitest full | 5873 passed, 1 skipped (336 file) |
| tsc | sạch |
| preview real-API lane | 105/105 |
| W5 gate `e2e/_preview-research-w5.spec.ts` | 123/123; axe 0 critical/serious/moderate |
| Phạm vi gate | S00–S14 + S04 404 × Research Light/Operations Dark × 1440/390; run thật R-WFO-023, R-WFO-027, R-P04-022 |
| Overflow ngang | 0 ở 390/360/1280/1440 |
| Tab stop thật | S06 66/57, S07 20/17, S08 85/59, S09 57/51 |
| Visual Research | 28 ô ghi (16 đổi cho W5) |
| Visual legacy `visual.spec.ts` | 101 ô (95 đổi do token xám, 4 run-audit do nút export) |
| P22 publish thật :8095 | R-WFO-027 `rc_06GG2K1TN6QQNJJN3RJ5AS5XC1`, approval `apr_06GG2K4A9Q3AHFVK0WV5GXNCY2`, receipt `91b7809f…` |

## 6. Chưa chứng minh

- Gate đo trên lane copy ở HEAD `c5795c71`; bundle `index-C6w4OUAn.js` là bundle lúc đo, chưa đối chiếu lại với HEAD sau `a226d1d9`/`f0346ef8` (xem debt `DEBT-BUNDLE-VS-HEAD`).
- Print acceptance, browser acceptance đầy đủ của Bobby, release ký: `NOT_VERIFIED`.
- S07 causal fold rows và chip claim S03 ở 360: chưa có fixture causal.


## 7. Đợt W6–W7 (2026-10-03, sau W5)

- W6: browser/print acceptance (`/home/bobby/portal-research-qa-2026-10-03/REPORT.md`), sửa D1–D8, D11 (Esc đóng drawer, `researchPrint.css`, ResearchNotFound, RunExitBar, skip link, nút menu trùng), nhãn fold `F1`, ProvenanceStrip một dòng, S12/S13/S09 chữ.
- W7: tiêu thụ Codex `d5d09875` trên S11; `useEvidenceReadsAllowed` (queued/cancelled không gọi reads bằng chứng); `humaniseTokens` + humanise tại render S04–S08/S10/S11; QA T (in theme tối → `printTheme.ts`, Pair picker, fold chart region, bảng config-diff khi in).
- Gate cuối: lane + gate 228/228 trên `index-DKkYLzA8.js`; vitest 5891 qua/1 flake khi tải nặng (qua riêng 13/13); baseline Research 28 + legacy 101 ô ghi lại.
- Vẫn `NOT_VERIFIED` ở mức sản phẩm: Bobby rà bằng mắt, release có ký, in thiết bị thật.
