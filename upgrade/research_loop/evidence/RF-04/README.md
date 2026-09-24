# RF-04 checkpoint — Research Loop P01–P10 frontend

**Ngày:** 2026-09-24 · **branch:** `docs/research-loop-plan` · **code commit:** `67d041f5` · **verdict:** `WAVE_B_IN_PROGRESS / NOT_PRODUCT_ACCEPTED`.

## Authority và ranh giới

- Nguồn quyết định: [audit P01–P10](../AUDIT_P01_P10_CLAUDE_2026-09-23.md), [RF-03 request ledger](../CODEX_REQUESTS_FROM_CLAUDE_P01_P10.md), packet P01–P10 và Unified §13. DQ-01…12 đã được Bobby chấp thuận trong audit §5.
- Wave A của Claude đã đóng trước checkpoint này. Lượt này xử lý một phần Wave B trên đúng product routes 00/02/03/12/14, không đụng screens 08–11/13, không dùng legacy API để lấp fact thiếu, không deploy hoặc merge `dev/main`.
- RF-03 vẫn `IN_PROGRESS`: P10 executable WFO/P05 retained WFO, P06 child progress, P07 mirror/gates và P08 advanced preflight chưa thể giả làm fact đã publish. Mỗi UI absence tiếp tục typed/ghi nguồn thiếu.

## Delivery theo màn

| Màn | Đã thực hiện trong checkpoint | Vẫn mở |
|---|---|---|
| S00 Journey | Route resolution theo target key + run id; per-run cards không đoán id; 503 retryable dùng bundled canonical v2 snapshot với stale warning; card unavailable focusable; plain canvas, arrows còn thấy ở 660 px, mapping table, bớt inspector/hash thô. Browser probe đổi sang v2 thật: 8 phase/28 cards, không còn v1 14-card false-green. | Chưa có current-branch real-API preview receipt và Bobby visual approval. Snapshot chỉ cứu transient read, không override 401/403. |
| S02 New Run | Registry selector/passport, alpha/version prefill, links, preflight đầy đủ bằng `PreflightPanel`; timeframe chỉ từ declaration, bound mode fail-closed khi registry thiếu; review rail thêm user-declared window timeline + Atlas mode×schedule claim forecast, cert ceiling ghi NOT_PUBLISHED; `?step` chỉ nhận step typed, fresh pills không báo lỗi trước khi thăm, keyboard roving/ARIA. | Fold preview nâng cao, route detail, parameter table polish, optimizer accordion, per-account draft persistence/discard, full HiFi spacing; no source-derived cert cap. |
| S03 Progress | Bounded console initial backfill + older retained lines riêng; queue/404/cancel source-state, evidence handoff chỉ với cursor đã publish; thanh 14px có progressbar ARIA; bỏ raw retry/pending enum khỏi copy, live dot pulse có reduced-motion guard. | P13 run identity strip chưa nối; fold Gantt/child progress chỉ thể hiện fact source quan sát được, P06 còn thiếu; real-API stream/restart receipt chưa có. |
| S12 Atlas | Claim suspect red, formula border, keyboard tabs, plain outer canvas; source-mode facts không bị client tự chứng nhận. | HiFi 3-column density, header CTA, run-specific mode/schedule drill, route-row scroll/highlight và full visual parity chưa đóng. |
| S14 Import | Literal single-file `ALPHA_CONTRACT` anatomy thay copy class/dataclass sai; mirror formatted, parse/gate/registry states, DRAFT activation after reload dùng `may_activate` + exact revision, disabled/action refusal gần nút, navigation/prefill. | Browser real backend parse→gates→register→activate receipt và final HiFi visual review. |

## Verification

- Frontend `npm run build`: PASS trên source cuối, TypeScript + Vite. Large shared chunks vẫn xuất hiện trong build list; đây không phải bằng chứng chúng được tải trên từng route.
- Monorepo pre-commit khi tạo `67d041f5`: PASS; contracts 179/179, Control API 818/818, cùng static/security gates. Đây là gate code commit, không thay cho real-API browser receipt.
- Focused unit S02/S03/disabled-control: **125/125 PASS**. Capability ledger + disabled-control: **24/24 PASS** sau khi inventory bổ sung hai private P05 artifact routes (`INTENTIONALLY_UNEXPOSED`) và nút S14 nêu lý do khi busy.
- Full unit trước fix cuối: **3,095 pass, 1 skip, 2 fail** (hai fail chính là inventory/disabled reason, sau đó targeted gate của cả hai xanh). Chưa gọi full unit green sau final changes.
- Production-mode build trên loopback, Playwright BFF-double subset RF-04: **18/18 PASS** tại 1280 và 660; không console/page error hoặc overflow ở các probe. Dữ liệu ở đây là canonical fixture/BFF double, **không phải `REAL_API_E2E_RECEIPT`** trên `research-portal`.
- Đã nhìn ảnh browser S00 v2 mobile, S03, S12 và S14; S12/S02 còn visual debt liệt kê trên. 1440 px, axe, network/bundle budget và product preview thật còn phải nghiệm thu riêng.

## Exit gate và handoff

RF-04 **chưa hoàn tất**, không đánh dấu xanh trong Unified. Để đóng: (1) hoàn thiện Wave B visual/interaction IDs còn mở theo audit; (2) RF-03 publish từng fact thì regenerate và tiêu thụ ở Wave C, giữ NOT_PUBLISHED cho fact chưa có; (3) lấy real-API browser receipt ở 1440/1280/660, axe, console/network và bundle budget, đọc ảnh bằng mắt; (4) Bobby duyệt visual trên `research-portal`. Không dùng kết quả BFF-double để thay receipt thật.

Lượt này chỉ commit các path RF-04 có chủ ý; các file RF-06 Claude đang sửa trên cùng worktree được giữ nguyên, không stage chung.
