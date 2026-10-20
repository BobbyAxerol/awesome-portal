# ELP2-10 — Kế hoạch đóng T10-01…T10-14 (Claude, 2026-10-20)

Owner Claude (backend writer; giao việc của Bobby 2026-10-20, handoff `/home/bobby/portal-research/upgrade/execution_loop/evidence/ELP2-10/CLAUDE_ALL_BACKEND_HANDOFF_2026-10-20.md` §3.F và §5, đọc chỉ-đọc).
Base `be6d98d1` (`claude/fe-parity`). **Tài liệu và phân tích đọc-nguồn duy nhất**: không chạy runtime, SSH, Docker, test, đo; không ghi `/home/bobby/portal-research`; không số liệu bí mật.
Không sửa `UNIFIED_IMPLEMENTATION_PLAN.md` / `FRONTEND_BACKEND_SYNC.md`: đề xuất cập nhật nằm ở §6. Tier R0 (docs).
Đi kèm: [budget calibration](ELP2-10_BUDGET_CALIBRATION_PROPOSAL_2026-10-20.md) (T10-13/T10-08), [measurement protocols](ELP2-10_MEASUREMENT_PROTOCOLS_2026-10-20.md) (M-1…M-7).
**Kết luận: ELP2-10 vẫn `NOT_MET`, ELP2-11 `NOT_ENTRY_READY`. Hôm nay 0/14 gate là `CONNECTED_VERIFIED`, 0/14 là `OWNER_ACCEPTED`.** Không số nào dưới đây là production budget.

## 1. Từ vựng và hai kiểu chạy (không trộn)

Nhãn trạng thái: `SOURCE_ONLY` < `FIXTURE_VERIFIED` < `INSTALLED` < `CONNECTED_VERIFIED` < `OWNER_ACCEPTED`; `BLOCKED` là trạng thái chặn kèm lý do. `INSTALLED` ở đây chỉ nghĩa code nằm trong image Core đã cài (`sha256:7b2c7f34…`, build từ `7818d563`) nhưng **chưa compose/mount** (Core009 chưa composed, 0 policy/0 grant, handoff §4.1).

| Tiêu chí | Capped correctness | Absolute latency / capacity measurement |
| --- | --- | --- |
| Envelope | 2 CPU / 1.5 GiB / 300 s ban đầu, 1 worker, mạng nội bộ, không host port (Core cell, `CORE_EDGE_REQUEST_008_009_RETURN_2026-10-19.md:165`); cell test control-api của repo là 3+1 CPU / 3+1 GiB (`scripts/control-api-test.sh:81,127,149`), xem C-3 | Cửa sổ độc quyền do owner nguồn cấp; không đồng chạy TS/DL/Research khác |
| Khóa đo | Không lấy measurement lock; không giữ lock chờ peer (Core009 handoff §1; handoff §6: root `AGENTS.md` §34b trên HK, **chưa đọc lại ở round này**) | Kiểm lease root/user + job đang chạy trên HK ngay trước khi chạy; lease vắng ≠ host rảnh; hết hạn lease ≠ đặt chỗ (`source-alignment.md:85-87`) |
| Khóa nặng SGP | `/tmp/portal-heavy.lock` chỉ khi dùng Docker/PG/visual/hook (rules §10.10a); vitest/tsc/Playwright V2 không khóa, `--maxWorkers=3` | Như trái, cộng cửa sổ độc quyền |
| Được kết luận | Đúng/sai (digest, số SELECT, fence, no-ACK, typed refusal); tripwire không bị phá | p50/p95/p99, throughput, CPU/RSS/WAL, freshness, coexistence B0/B1/B2, P184 G2 |
| Không được kết luận | Năng lực, SLO, "đạt budget" | Chỉ hợp lệ với budget đã duyệt (T10-08) và workload/config/hardware ghim cùng nhau |

## 2. Bảng trạng thái và blocker

Nguồn trạng thái gốc: `evidence/ELP2-10/README.md:254-269` (bảng 14 gate), guide v1.2 `:1506-1510` (định nghĩa `ELP2-T10-01…14`). Mốc code: `169195ca` (backend slice + hook PASS), `12a6412b` (commissioning + Score precomputed), `7818d563` (Core008 installed). Cột "OWNER" là chủ mở khóa blocker, không phải chủ implementation (implementation: Claude, handoff §3).

| ID | Yêu cầu (packet) | Trạng thái hôm nay | Blocker chính xác | OWNER mở khóa |
| --- | --- | --- | --- | --- |
| T10-01 | cashflow-only (nạp/rút) không thành lãi | FIXTURE_VERIFIED (oracle `apps/control-api/test/elp210-performance.spec.ts`, hook `169195ca`); connected BLOCKED | Chưa có publication tài chính đủ chuẩn cho scope Research đã cài: chưa chọn `profile_id`/catalogue/schema/producer (`c7-priority-round-2026-10-19.md:259-269`); ELP2-REQ-05-001, 06-002 | PM/Edge (nguồn cashflow, writer, barrier) + Claude (writer/series) |
| T10-02 | methodology thiếu ⇒ unavailable, chỉ metric phụ thuộc | FIXTURE_VERIFIED (`manager-model.ts` guard; `METHODOLOGY_NOT_PUBLISHED`); source methods chưa có | Phương pháp PnL/return thật chưa publish; 05/06 authority | PM/Edge |
| T10-03 | FX/aggregate/quality chính xác | FIXTURE_VERIFIED (reuse ELP2-06 exact decimal, dedup, cursor); không đoán FX | Không có FX rate nguồn đã qualified; chưa có nguồn tài chính connected | PM/Edge |
| T10-04 | nguồn gọi bị chặn khi browser tăng | FIXTURE_VERIFIED local: 20 reader → 1 SELECT (`measurements.md:23-28`) + FE FIXTURE_LAB 138 pass (UXM-10 README:185). Code INSTALLED, unmounted. Browser→source `NOT_MEASURED` | Core009 chưa composed, chưa có READ/STREAM thật; Edge chưa có đếm source-call theo yêu cầu browser (gap G-2) | Claude (Core009 PREPARED, BE-P10) → Edge (cửa sổ finite) |
| T10-05 | tải hỗn hợp query + ingest/export | FIXTURE_VERIFIED local PG (1 successor + 20 đọc revision cũ, digest/head parity); export `N/A` (không có route export) | Không có writer mounted, không có nguồn connected | Claude + PM/Edge |
| T10-06 | coexistence Research/TS/DL | BLOCKED, `NOT_RUN` | 14 nhóm budget `approval_ref:null`; không có B0/B1/B2 ghép đôi; cần cửa sổ độc quyền; ELP2-REQ-10-002 | Bobby (rule), Edge/TS/DL (cửa sổ), PM (`72 PASS/1 FAIL MIXED_WORKLOAD_INCOMPLETE`, handoff §5) |
| T10-07 | lease/retention/DR | FIXTURE_VERIFIED (PG thật dùng-một-lần: race, takeover, autocommit, expiry-at-COMMIT, ABA, restore epoch); host DR `NOT_RUN`. **Code lease đổi sau receipt** (xem §5) | Chưa có restore thật, chưa có role ops được duyệt cho `resetAfterRestore`, retention/RPO/RTO chưa duyệt | Bobby (RPO/RTO), Core ops, Claude |
| T10-08 | ngưỡng latency/lag/storage/error được duyệt | BLOCKED_APPROVED_SCOPE_BUDGETS | Manifest 42×3 toàn null; 14 nhóm Edge không có `approval_ref` | Bobby (một lần, xem proposal) + Edge/TS/DL |
| T10-09 | funding bucket, không bịa PnL, mẫu số đúng | FIXTURE_VERIFIED (oracle source-zero/absent/capital-movement); lot attribution `LOT_ATTRIBUTION_METHOD_NOT_APPROVED` | Phương pháp lot/cohort chưa duyệt; nguồn tài chính chưa connected | Bobby/PM (phương pháp), Claude |
| T10-10 | canonical Research reuse, cửa sổ đầu vào cô lập | FIXTURE_VERIFIED (Q03/Q13/Q19, source-grid, continuity, ownership); pin hash `152fcc02…` **đã cũ** | Số fixture không phải bằng chứng thời gian/P3; bị chặn bởi 06-002 và T10-13 | Claude (re-pin), PM/Edge |
| T10-11 | recompute có giới hạn, không analytics đắt trên TS | SOURCE_ONLY/FIXTURE_VERIFIED phía đọc (flight 4, pending 32); worker `NOT_MOUNTED` | ELP2-REQ-06-002: chưa có materializer/worker được qualified | Claude (implementation) + PM/Edge (nguồn) |
| T10-12 | performance G2 (P184) tách khỏi mainnet G2 tùy chọn | BLOCKED, `NOT_RUN` | Cần receipt performance G2 đúng quần thể per-feed (p95≤500 ms, trade max<1500 ms, quote/mark max<1000 ms, `source-alignment.md:82-84`); cửa sổ độc quyền | Edge (apparatus P184), Bobby (cửa sổ) |
| T10-13 | artifact calibration P3 theo horizon | BLOCKED_APPROVED_CALIBRATION_ARTIFACT | Chưa có anchors/stress/block/grid/maturity đã duyệt; census lịch sử chỉ 4 run COMPLETED, 14 ngày OOS, 4 hash quan sát **giống hệt** (`commissioning-followthrough.md:521-538`) | Bobby (người duyệt độc lập), Research data owner |
| T10-14 | tách fixture/source/runtime/browser; reuse có dependency impact | FIXTURE_VERIFIED (nhãn per-run, manifest, absence chỉ phụ thuộc). Browser/FE `NOT_RUN` | FE owner acceptance không suy từ tsc/số test; cần bảng impact (§5) và receipt browser connected | Claude (FE+BE), Codex review độc lập |

## 3. Từng gate: Claude làm ngay (capped), cần nguồn HK, cần cửa sổ, exit evidence

"Commit" = commit có sẵn đã giao phần đó; packet này không tạo commit code. Mọi việc "local" dưới đây là **kế hoạch chưa chạy**, cần round có quyền runtime (lane R3 focused, `--no-verify` không dùng cho R3).

| ID | Claude làm được ngay (capped, local) | Cần nguồn HK / Edge / PM | Cần cửa sổ đo | Exit evidence |
| --- | --- | --- | --- | --- |
| T10-01 | Mở rộng oracle sang Manager series (BE-P4/BE-P8): chuỗi chỉ-nạp tiền ⇒ RETURN/NET_PNL không dương. Commit nền: `169195ca`, series `4ecef0f8…9fca133e` (BE-P4), `9e219e44` (BE-P8) | Publication cashflow + economic revisions đủ chuẩn; chọn profile/catalogue/schema/producer | Không | Receipt CONNECTED: cashflow-only trên dữ liệu thật qualified, hash source/barrier/schema/config, đọc API→UI |
| T10-02 | Chạy lại guard phụ thuộc trên tip (dependent-only null, balance/NAV/fee vẫn đọc được) | Phương pháp thật + tên method | Không | `METHODOLOGY_NOT_PUBLISHED` chỉ ở metric phụ thuộc trên dữ liệu connected |
| T10-03 | Re-run exact-decimal/FX/dedup/partial sau thay đổi MD-5 (`a7094697`), FE-013 (`9e219e44`) | FX rate + ownership/dedup physical account | Không | FX provenance + total tie-out connected; không FX đoán |
| T10-04 | Re-run `elp210-performance.spec.ts` (+161 case pure) trên tip; viết kịch bản đếm (M-2) | Edge xuất đếm source-call theo yêu cầu; Core009 composed; READ/STREAM thật | **Có** cho phần tuyệt đối; phần "số lần gọi nguồn không tăng theo tab" chỉ cần đếm, capped đủ | Đồ thị source-calls vs số tab/người dùng (M-2) phẳng; không per-browser ingest |
| T10-05 | Re-run mixed local PG trên tip (successor + 20 đọc) với cell 2 CPU/1.5 GiB | Writer mounted + nguồn đủ ingest | **Có** (p95 thật) | M-4: mixed workload connected, pass rule đã duyệt, WAL/CPU/RSS/lag |
| T10-06 | Chuẩn bị plan JSON `portal.elp2-10.coexistence-plan.v1` + metric catalogue (readiness tool) | Edge/TS/DL đặt stage order, cửa sổ, B0 baseline | **Bắt buộc, độc quyền** | `qualification-readiness.mjs` trả `READY_FOR_MEASUREMENT_REVIEW`, rồi receipt B0/B1/B2 lặp ≥2 (M-5) |
| T10-07 | Re-run lease/restore-epoch PG trên tip (đã thấy `renew(…, notAfterMs)` đổi, §5) | Role ops, receipt restore thật, nguồn epoch/generation | Tùy: drill restore đo RTO cần cửa sổ | M-6: drill thật + `resetAfterRestore` CAS + chứng minh holder cũ không commit/ACK |
| T10-08 | Trình Bobby quy tắc margin + catalogue (proposal), một lần | Edge cấp scalar decomposition cho bound composite | Số điền từ M-n | Catalogue `portal.elp2-10.budget-metric-catalogue.v1` + 14 nhóm có `approval_ref`, readiness tool qua |
| T10-09 | Test funding-bucket không bịa PnL trên series | Phương pháp lot/cohort; nguồn funding | Không | Bucket connected hoặc typed absence; mẫu số = NAV đúng |
| T10-10 | Re-pin hash `manager-score.ts` (nay `63faf1d9…`) và re-run Q03/Q13/Q19 + restatement | Quần thể/cửa sổ canonical của Research | Không | Receipt reuse có dependency impact (§5), không tính lại công thức |
| T10-11 | Thiết kế worker bounded theo checklist ELP2-REQ-06-002 (BE-P8); chưa mount | Nguồn publication qualified | Có, khi mount | Worker mounted + lease + checkpoint + đo (M-4) |
| T10-12 | Không có phần Portal tự chạy | Edge chạy P184 đúng apparatus | **Bắt buộc, độc quyền** | M-7 receipt performance G2 per-feed |
| T10-13 | Chuẩn bị đầu vào census (`scripts/execution-v2/calibration-census.mjs`) | Research chọn quần thể, horizon 7/30/90 | Không (offline) | Artifact `portal.execution.manager-score-policy-runtime.v1` + approval độc lập + loader receipt READY |
| T10-14 | Viết bảng dependency impact; mỗi receipt reuse ghi mức (fixture/source/runtime/browser) | — | Không | Bảng impact ký bởi reviewer độc lập; FE acceptance qua browser connected, không từ tsc |

## 4. Thứ tự đề xuất (mở khóa nhiều gate nhất trước)

1. Core009 (BE-P10, ưu tiên đầu): sửa 3 CHANGES_REQUESTED của Edge (`UNIFIED…` addendum `be6d98d1`: token cleanup, short-write ack, dry-run-before-DB) → PG thật → R3 → image → cửa sổ finite. Mở T10-04 (số nguồn gọi), phần connected của 05/09.
2. Bobby duyệt **một lần** proposal (T10-08 quy tắc + guard + cap) → mở đường điền số từ M-n mà không hỏi lại.
3. Re-run capped trên tip: `elp210-performance`, `elp206-manager-*`, `elp2-read-projection` (T10-02/03/04/05/07/10 dependency impact).
4. Nguồn tài chính qualified (T10-01/02/03/09/11) — việc dài nhất, do PM/Edge; Claude chuẩn bị writer và checklist.
5. Cửa sổ độc quyền: M-5 (coexistence) rồi M-7 (G2); M-6 (DR) xếp cạnh nhưng ngoài cửa sổ nếu không đo thời gian.
6. T10-13 calibration: nhánh song song, không chờ nguồn Core.

## 5. Dependency impact đã kiểm (chỉ-đọc, `git diff 169195ca be6d98d1`)

| Receipt cũ | Pin/ghi chú | Thay đổi thật trên tip | Hệ quả |
| --- | --- | --- | --- |
| T10-10 "REUSE unchanged `manager-score.ts` `152fcc02…`" (`README.md:265`) | Hash tại `169195ca` = `152fcc02c10726f4…` (xác nhận) | Hash nay `63faf1d9fa9d2acc…`; +20 dòng tham số `ManagerQualityRestatementEvaluation` (`0aad2697`) | Claim "unchanged" **hết hiệu lực**; công thức/trọng số không đổi (diff chỉ thêm đường restatement), nhưng phải re-run và re-pin |
| T10-07 lease (`README.md:262`) | `169195ca` | `manager-lease.ts` +12 dòng: `renew(…, notAfterMs?)`, `LEAST(…)` trong SQL (`12a6412b`) | Re-run PG lease; chưa có receipt nào cho nhánh `notAfterMs` trong packet này |
| T10-04/05 coalescing (`measurements.md`) | run1 trên candidate trước `169195ca`; `elp210-performance.spec.ts` không đổi từ `169195ca` | `manager-model.store.ts` +3 dòng (`12a6412b`); `manager-model.ts` +140 dòng qua 8 commit (`12a6412b`, `fdab164c`, `322e2347`, `e19ad906`, `7818d563`, `b9d1de8b`, `a7094697`, …) | Số 20→1 và p95 là **quan sát cũ**; test không đổi nhưng code dưới test đổi ⇒ giữ như bằng chứng cơ chế, không như số hiện hành |
| UXM-10 BUDGET (e2e spec) | tip `claude/fe-parity` 2026-10-20 | Đã chạy lại: 138 pass, 0 fail, 6.0 min (README:185) | FIXTURE_LAB hợp lệ cho tip lúc đó; bảng ngắn §2.1 của README **cũ** (C-4) |

## 6. Đề xuất cập nhật sổ (không sửa file ở round này)

- `UNIFIED…` §14 ELP2-10: thêm một dòng "T10-08 quy tắc + guard chờ Bobby duyệt một lần; T10-13 tách riêng (calibration artifact)".
- `FRONTEND_BACKEND_SYNC.md`: ELP2-REQ-10-002 thêm "gap G-1…G-4 của protocols doc"; ELP2-REQ-10-001 giữ `AWAITING_CONSUMER_REVIEW`.
- Source Truth Board hàng 10 (Manager series/Score): ghi hash `manager-score.ts` mới.

## 7. Mâu thuẫn (Contradictions)

| # | Vị trí A | Vị trí B | Tác động / đề nghị |
| --- | --- | --- | --- |
| C-1 | Handoff `:177-179`: "T10-13: artifact **budget/calibration**" | Guide v1.2 `:1506` (`-08` ngưỡng/budget được duyệt) và `:1510` (`-13` calibration P3); `README.md:263,268` | Budget thuộc T10-08 + ELP2-REQ-10-002; T10-13 chỉ là calibration Score. Proposal xử lý hai thứ riêng; đề nghị sửa nhãn handoff |
| C-2 | Handoff `:61`, `:60`: dẫn rules §10.13 và anchor Unified `#execution-loop-v2-claude-all-backend-20261020` | `AGENT_WORKING_RULES.md` trên base `be6d98d1` kết thúc ở §10.12 (`:655-676`); `grep` anchor trong `UNIFIED…` = 0; handoff không có trong tree | Cả ba chỉ nằm ở checkout canonical `/home/bobby/portal-research` (`AGENT_WORKING_RULES.md:669`, `UNIFIED:12680`) chưa nhập vào nhánh này. Không phải sai nội dung; là điều kiện hạ cánh |
| C-3 | `README.md:139-143` và `measurement-manifest.json isolated_cell` (Node 3 CPU/3 GiB + PG 1 CPU/1 GiB = 4/4) | Handoff `:253-254`, `CORE_EDGE_REQUEST_008_009_RETURN:165` (trần 2 CPU/1.5 GiB) | Hai envelope cùng tồn tại; script repo không có tham số đổi (`control-api-test.sh:81,127,149`). Đề nghị: 2/1.5 cho cell mới do Claude khởi chạy, 4/4 chỉ cho hook. Cần Codex xác nhận |
| C-4 | UXM-10 `README.md:34-50` (overview 10 req/119,484 B; 72 asset; khoảng 5–13 req, 36–76 file) | Spec `execution-v2-coexistence.spec.ts:147-263` (overview 11/121,575; 88 file; khoảng 6–14 req, 42–93 file, 1.08–3.25 MB) | README tự nhận cũ tại `:185`. Dùng bảng spec; đề nghị cập nhật README |
| C-5 | `README.md:262` "T10-07 PASS lease component run1" | `measurements.md:6-9`: run1 355/356, 1 fail, restore chưa chạy | Giải quyết ở `README.md:184-193` (hook `169195ca` PASS). Dùng terminal, không dùng run1 |
| C-6 | `useRevision.ts:61-66` 15 s "mirrors … 15 s on dev" | `source-alignment.md:115-120`: 15 s là cài đặt SGP lịch sử, **không quan sát lại** | 15 s của FE là kế thừa, không phải budget; xem proposal §5 |

## 8. Không xác định được ở round này

- Trạng thái lease/job HK hiện tại: hai lock đã ghi (`claude-burst-b16-a1parity` đến 2026-10-16T13:48:52Z; `claude-dl-roll` đến 19:13:22 UTC, `authority-continuation.md:170`) đều lịch sử; hiện hành UNKNOWN, phải repin trước mọi đo.
- Nội dung root `AGENTS.md` §34b trên HK (chỉ biết qua trích dẫn của handoff).
- Trần 2 CPU/1.5 GiB áp cho cell nào ngoài Core cell (C-3).
- Số người dùng/tab đồng thời mục tiêu của release đầu: không có trong packet nào (cần Bobby, proposal D5).
- SHA nguyên các commit trích từ packet (`5291a80f`, `fa857b85`, …) không kiểm lại ở đây; chỉ kiểm `169195ca`, `12a6412b`.
