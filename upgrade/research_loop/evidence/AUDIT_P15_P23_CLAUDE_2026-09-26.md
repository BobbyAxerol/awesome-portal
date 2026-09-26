# Rà soát P15–P23 — frontend thiếu gì, backend còn nợ gì (Claude, 2026-09-26)

Bobby hỏi: "rà soát lại tất cả các P15 đến P23 … list lại frontend đang thiếu gì và backend đang nợ
những gì … phải luôn test bằng browser". File này là kết quả; chat chỉ trỏ tới đây.

## 0. Nguồn và cách kiểm

| Nguồn | Trạng thái |
|---|---|
| origin/docs/research-loop-plan | `03e1cf25` — W1–W6 của Claude, đã push hai remote |
| Nhánh local trong checkout dùng chung `/home/bobby/portal-research` | `50494c9c` — **17 commit chưa lên remote nào**: P22 backend (Codex), P23 harness, P22/P23 frontend Thanhvuong (tích hợp lại sau 4 commit revert) |
| Hai nhánh | Lệch nhau (17 ↔ 9 commit). **Merge thử sạch, không xung đột** (worktree tạm `portal-research-integ`, không commit) |
| W7 (P21 composer đọc lane retained cho WFO) | Nhánh riêng, 3 commit, đang làm dở — chưa vào nhánh nào |
| Preview | Image `c66836bf` — chưa có P22 backend, W7, W6b-lineage 1.1.0 (preview trả 1.0), sửa S09 |

**Browser (không rebuild preview):** frontend của cây gộp chạy Vite dev proxy tới API preview thật, font
thật (lượt đầu dùng font dự phòng vì symlink `node_modules` bị chặn — đã sửa, không tính lượt đó).

| Lane | Kết quả |
|---|---|
| Real-API lane (màn 01–13, run P04 + WFO, 1280/660) | **40/46**. 6 đỏ = test S11 của W5c, vì S11 đã được thay bằng bản Thanhvuong (không phải lỗi màn khác). 0 request `/api` lỗi, 0 tràn ngang |
| Ảnh S11 tích hợp, run WFO thật | 3 COMPLETE · 2 INPUT · **7 MISSING**, gate `P21_REFERENCED_SOURCE_INTEGRITY_FAILED`; ô mirror in "assignee pool: Quant Reviewers" — fact server không trả |
| Unit frontend research (cây gộp) | 1262 xanh, **24 đỏ** (`releaseCandidate.test.tsx` của W5c mồ côi) |
| Typecheck runner P23 (`e2e/research-qualification`) | **4 lỗi** — stub S10 thiếu field lineage 1.1.0 (W6b) |
| Snapshot contracts / route inventory (cây gộp) | 215/215 · 239 route, 0 va chạm |

## 1. Backend còn nợ

| # | Phase | Nợ | Bằng chứng | Chủ |
|---|---|---|---|---|
| B1 | P21 | Composer chưa đọc lane retained cho run WFO → WFO không seal được RC | ảnh S11 thật; W7 `19de188b` chưa merge | **Claude (W7, đang làm)** |
| B2 | P21 | `published_comparison`, `source_absences.approval_mirror` vẫn cứng `P22_*_NOT_COMMISSIONED` dù P22 đã có | `release-candidate.service.ts:264–267, 308` | Claude (P21) sau khi P22 vào |
| B3 | P15/P16 | Lane WFO không có declared range → cảnh báo biên DR-02 chỉ chạy cho P04; S06 scatter/histogram (≤600 điểm) chưa phục vụ cho WFO (trial có đủ params + objective) | `parameter-binding.registry.ts:181`; plan `:4958`, `:5018`; `SearchDetail.tsx:1251` | Claude |
| B4 | P16 | `CG-P16-02` (3 digest binding Stage-4) và `CG-P16-03` (tham số code-fixed + hash scope) chưa trả lời | `P16/thanhvuong-review-addendum.md:172–173` | Claude |
| B5 | P18 | Report cho run FAILED (spec 09 T06) chưa có; guide P18-T10 (reused-original vs linked-child) chưa có field; export Parquet/Archive vẫn unavailable; chưa có fixture 32 fold | `report.contract.ts:370`; W6A §6 | Claude |
| B6 | P17 | Không có fixture replay lane P04 (`research.replay.v1`) | W5B §6 | Claude |
| B7 | P19 | Pick khuyến mãi (DR-03) chưa có writer: P22 chỉ có bảng + read, không ghi `attempt_promotion_pick_facts_v1` | `lineage.service.ts:641` | **Codex (P22)** |
| B8 | P22 | Chưa có receipt thật Delta→RunSync→R1; **run Research (`rrun_`) có thể không bao giờ vào `run_read_models`** mà `publicationEvidence` đọc → mọi candidate thật sẽ `P22_GOVERNANCE_SOURCE_UNAVAILABLE` | `governance.service.ts:304–311` | **Codex** |
| B9 | P22 | Không có cờ riêng cho publish intake (dùng chung `FEATURE_RESEARCH_RELEASE_CANDIDATES`) → rollback không đúng plan; mirror thiếu effective_status/quorum/decision/assignee/created_at (CG-P22-03/06) | `config.ts:169`; P22 contract `:22–40` | **Codex** |
| B10 | P23 | T01–T04, T06, T08, T11, T12, T14 NOT_RUN; T05, T07, T09–T13 PARTIAL; chưa có đo 5 GB (strict mode `UNBOUNDED_CGROUP`); CG-P23-01…05 OPEN | `P23/phase-report.md:29–45` | **Codex** |

## 2. Frontend còn thiếu (so HiFi/spec)

| # | Màn | Thiếu | Bằng chứng | Chủ |
|---|---|---|---|---|
| F1 | 11 | **Hai bản S11**: bản W5c (test mồ côi, e2e real-API trỏ selector không còn) vs bản Thanhvuong tích hợp. Bản tích hợp mất: deep link `#pack=` từ chip 01, thông báo PARTIAL cấp trên, link rail alpha→10 / run→04, hộp xác nhận seal, chip `NOT_PUBLISHABLE` (spec §2.1) | agent audit + `releaseCandidate.test.tsx` 24 đỏ | Bobby chọn bản; Claude hợp nhất |
| F2 | 11 | Adapter P22 của bản tích hợp: gọi `/mirror` không tồn tại trước (404 mỗi 60 s), sự cố tạm thời biến thành "denied" vĩnh viễn và dừng poll, ghost hiện sau khi đã publish, nút publish bỏ qua `may_publish`/`blocked_reason` của P22, nút bật mà bấm không làm gì (claim rỗng), lỗi 401/403/503 bị nuốt thành NOT_PUBLISHED, browser tự bịa "decisions none recorded" và "assignee pool: Quant Reviewers" | `releaseCandidateClient.ts:301, 370–375, 426–437`; `useReleaseCandidateMirror.ts:53–58`; `ReleaseCandidateDetail.tsx:198–202, 1286–1295, 1563, 1771–1781` | Claude (frontend ≤P21 sở hữu S11) + Codex cho wire P22 |
| F3 | 11 | Hiển thị kết quả W7 cho WFO (8 COMPLETE / 2 DEGRADED / 2 INPUT), câu cho 6 mã lý do mới | W7 | Claude sau khi W7 + F1 xong |
| F4 | 06 | Click trial không ghi `pick=` vào hash (T07/T08); chưa có copy-evidence-link (T16) | `SearchDetail.tsx:733, 778` | Claude |
| F5 | 07 | Chưa copy được θ* digest (T10); wall-clock trên lane WFO là absence UI | `FreezeDetail.tsx:1447` | Claude |
| F6 | 09 | Headline cho run FAILED (T06); chưa chạy axe; chưa chạy lại print Letter/A4 cho sheet v2 | W6A | Claude |
| F7 | 13 | Chưa chạy axe; `S13-BACK-REFETCH` còn mở | P20 thanhvuong-debt-register | Claude |
| F8 | P23 | Runner qualification chỉ có lane fixture; typecheck 4 lỗi; stub S11 trỏ `/mirror`; VD-P23-01…04 (server prose, 401→denied, 403≠404, hub giữ run A); 33 ô screenshot lệch; chưa có lane browser-real | agent audit | Codex (P23) + Claude sửa lỗi ở màn ≤P21 |

## 3. Tài liệu lỗi thời (không đổi code, phải sửa để board nói thật)

Board Unified P15–P21 và §13.5 còn ghi OPEN cho những gì W3–W6b đã đóng: P16 "P16-B SOURCE_CAPABILITY_BLOCKED" (A10 đã làm), P17 `CG-P17-01…03` OPEN, P18 `CG-P18-01…11` OPEN, P19 `CG-P19-01…14` OPEN, P20 "CG-P20-01…11 all OPEN", P21 không nhắc W5c/W7; P15 "owner decisions DR-02 and Reveal" (đã quyết). README P15/P16/P17, `P17/thanhvuong-debt-register.json` (CG-P17 OPEN, P17-FE-DG-02 AWAITING), `P19` debt (`S10-DIFF-KEY-WRAP` đã sửa `1906dd85`), A12 mapping chưa cập nhật sau W3/W5a/W5b (vẫn ghi 62 GAP). Astra/RS-03: plan vẫn ghi "chưa vào P18" và RS-03 `CLAUDE_RS03_INTEGRATION_PENDING`.

## 4. Chia việc

**(a) Bobby quyết**
1. **S11 nào là bản chính** — fddea8e5 ghi "P21 rich S11 composition remains the authority" rồi 50494c9c thay bằng bản Thanhvuong. Khuyến nghị: giữ bản Thanhvuong (có publish/mirror thật cho P22), Claude đưa sang đó các phần W5c còn thiếu (F1) và sửa adapter (F2), xoá test W5c mồ côi sau khi port.
2. Cờ riêng cho publish intake (B9) — khuyến nghị: có, để rollback đúng plan.
3. Các mục copy/hiển thị đang `REQUIRES_BOBBY_DECISION`: 21 VD-P20, B2/B3/B6, VD-P22-01/04/05/06/08/12/13/14 (gồm publish một click, seal một click), B-P22-01…07, B-P23-01…06.
4. Khi nào rebuild preview — mọi receipt real-API của P19–P23 đang chờ việc này.

**(b) Claude làm, không chờ ai:** B1 (W7), B2, B3, B4, B5, B6; F1–F7; sửa toàn bộ tài liệu lỗi thời §3; cập nhật A12; đồng bộ nhánh (gộp local ↔ origin khi Codex đồng ý đẩy).

**(c) Codex (P22+):** B7 writer pick, B8 RunSync cho `rrun_` + receipt thật Delta→R1, B9 mirror fields, B10 qualification P23, F8 runner (phần P23).

## 5. Điều kiện đóng

- **P15–P21:** B1–B6 + F1–F7 xong; board/README/debt register khớp; receipt real-API trên preview build lại từ nhánh đã gộp, cho cả run P04 và WFO, màn 05–13, không test đỏ.
- **P22–P23 (Codex):** B7–B10 + F8; receipt thật Delta→R1; đo 5 GB.
- **P24:** 0 test đỏ, 0 nợ trong phạm vi, research-dev được dựng.
