# Đề xuất cập nhật Unified §14 / ELP2-10 — Claude, 2026-10-20

**Trạng thái:** `PROPOSAL_FOR_CODEX_TO_PASTE` · R0. **Không sửa** `upgrade/UNIFIED_IMPLEMENTATION_PLAN.md` (canonical có WIP của Codex/Edge). Đoạn dưới thay thế/bổ sung addendum
`<a id="execution-loop-v2-claude-all-backend-20261020">` ("§14 addendum — Claude tiếp nhận toàn bộ backend còn lại, 2026-10-20") và dòng trạng thái ELP2-10 trong §14.3/§14.8. Giữ nguyên các phụ lục Core009 revision 2 / Edge handback đã có (chúng là lịch sử của Edge).
Cơ sở: [ACK](ACK_ALL_BACKEND_2026-10-20.md) (pin `e1f3938e`), ledger BE-P1…P10 trong thư mục này, receipt `../UXM-07/consumer-receipt-*.md`, `../UXM-08/`, `../UXM-09/`, `../UXM-10/`. Link trong khối `PASTE START…END` tính từ `upgrade/` (vị trí của Unified), không từ file này. Vocabulary mức gate: `SOURCE_ONLY / FIXTURE_VERIFIED / INSTALLED / CONNECTED_VERIFIED / OWNER_ACCEPTED`; không dùng nhãn "done" gộp.

<!-- PASTE START -->

#### §14 addendum — trạng thái theo gói sau ACK toàn bộ backend, 2026-10-20 (Claude)

Claude đã ACK handoff ([ACK](execution_loop/evidence/BE-CLAUDE-2026-10-20/ACK_ALL_BACKEND_2026-10-20.md)); peer `claude/fe-parity` `e1f3938e` (sạch lúc bắt đầu; 259 commit trên Core `7818d563`; **chưa landing, chưa push**).
Trạng thái tổng: `HANDOFF_ACKED / AWAITING_CODEX_PRODUCER_RECEIPTS`; ELP2-10 `NOT_MET`, ELP2-11 `NOT_ENTRY_READY`. Hook R2/R3, PostgreSQL specs, image build và mọi runtime **NOT_RUN**; `REAL_READ_RETAINED`/`REAL_READ_QUALIFIED` **NOT_RUN**.

##### Trạng thái theo gói

| Gói | Phạm vi | Mức gate cao nhất | Lane | Bằng chứng | NOT_RUN / còn thiếu |
| --- | --- | --- | --- | --- | --- |
| BE-P1 | MD-1…MD-8 Manager dataset | `FIXTURE_VERIFIED` | FIXTURE_LAB | [BE-P1](execution_loop/evidence/BE-CLAUDE-2026-10-20/BE-P1.md), landed `2179c771`, `cff42287` | PG `manager-lists`/`elp206-manager-store`; Codex ACCEPTED (MD-4 đổi hành vi) |
| BE-P2 | FE-067/070/071/072 stage facts | `FIXTURE_VERIFIED` (thân V1) | FIXTURE_LAB | [BE-P2](execution_loop/evidence/BE-CLAUDE-2026-10-20/BE-P2.md), `642a7ab9`…`8cb0eb61`; receipt `consumer-receipt-be-p2-p3` | SCOPED_V2 bodies (R-1); PG `sandbox-certification`, `canary-control-room`; mọi nguồn fact |
| BE-P3 | FE-066, S3-U1…U5 | `FIXTURE_VERIFIED` | FIXTURE_LAB / BFF_DOUBLE | [BE-P3](execution_loop/evidence/BE-CLAUDE-2026-10-20/BE-P3.md), `aa1c91d3`…`77eea7d5` | SCOPED_V2 identity (R-2); alpha name (R-4); S3-U1 qualify/retire |
| BE-P4 | `current_stage` + Manager series (FE-027/012/013/033) | `FIXTURE_VERIFIED` | FIXTURE_LAB / BFF_DOUBLE | [BE-P4](execution_loop/evidence/BE-CLAUDE-2026-10-20/BE-P4.md), `b9d1de8b`, `e8fd3c2c` | nguồn series MISSING (`SERIES_SOURCE_NOT_PUBLISHED`); `entered_at_ms` |
| BE-P5 | FE-062/063/068/069 | `FIXTURE_VERIFIED` | FIXTURE_LAB | [BE-P5](execution_loop/evidence/BE-CLAUDE-2026-10-20/BE-P5.md), `7f45f663`…`19478d73` | PG discovery/stage/lookup paths; mounted HTTP; first-control discovery cần PM |
| BE-P6 | MD-5 canonical zero | `FIXTURE_VERIFIED` | FIXTURE_LAB | [BE-P6](execution_loop/evidence/BE-CLAUDE-2026-10-20/BE-P6.md), `a7094697`, oracle FE `5152cee3` | Codex ACCEPTED; PG |
| BE-P7 | capital step-up, `/self-context`, account typed absence, advisory parity | `FIXTURE_VERIFIED` | FIXTURE_LAB / BFF_DOUBLE | [BE-P7](execution_loop/evidence/BE-CLAUDE-2026-10-20/BE-P7.md), `034c463f`, `29ec3ef9`, `41a72ba4`; receipt `consumer-receipt-be-p7` | 2 test PG `elp2-access-transaction`; registry rev 7; BE-P7 Q1–Q8 |
| BE-P8 | FE-013 metric↔unit + `ratio_scale`; MD-4/FE-065 review; checklist ELP2-REQ-06-002 | `FIXTURE_VERIFIED` (checklist = tài liệu) | FIXTURE_LAB / BFF_DOUBLE | [BE-P8](execution_loop/evidence/BE-CLAUDE-2026-10-20/BE-P8.md), `b69a919e`; receipt `consumer-receipt-manager` §9 | **không có writer**: 12 đầu vào chưa có chủ |
| BE-P9 | Core009 preparation | `SOURCE_ONLY` | — | `85fc86b8`; [PREPARATION](execution_loop/evidence/ELP2-10/CORE009_PREPARATION_2026-10-20.md), [PREPARED return](execution_loop/evidence/ELP2-10/CORE009_PREPARED_OWNER_RETURN_2026-10-20.md) | PG; R3; image; owner artifacts |
| BE-P10 | Plan B, revoke chính thức, session issuer/revoker, **Revision 3** (3 điều chỉnh Edge) | `SOURCE_ONLY` | — | [BE-P10](execution_loop/evidence/BE-CLAUDE-2026-10-20/BE-P10.md), `f1d18dc5`, `110bb875`, `5ae9e17e`, `b70f8f77`, `4b2b76e0`, `81e8a546` | PG `be-p10-manager-revoke-pg.spec.ts` NOT_RUN; R3/image; runtime |
| BE-P11, P12, P13 | đang được writer khác viết | chưa đánh giá | — | — | xem ledger tương ứng khi có |

Đếm: `FIXTURE_VERIFIED` 8, `SOURCE_ONLY` 2, `INSTALLED` 0, `CONNECTED_VERIFIED` 0, `OWNER_ACCEPTED` 0 (Core008 `INSTALLED` là gói riêng của Codex, không thuộc BE-P).

##### Core009 / ELP2-REQ-10-008, 10-009 (ưu tiên B)

`PREPARED_SOURCE_ONLY`: chưa cài, chưa cấp session, chưa revoke, chưa kết nối. Identity đã COMMIT + Core ACK (không reissue). Edge revision 2: ba điều chỉnh (exact-session cleanup, verified bounded token write, offline `--dry-run`) **ACCEPTED_WITH_CHANGES ở mức nguồn**, sha256 mới `research-acceptance-session.ts` `6a4ed7dc790318d60c4fd2593e48ac1845629afde444b38b11bbfba3661d1eb3`, `execution-native-session.ts` `fa353d3398acd79fdff8525972c1130622c8978306d0c2227c2e092be4290257`, runbook rev 2 `bd9c908ba238f7cc9eabd2d2c13764ab1ab6ceee30ff1e0b22b6c129f7dcb35e`; spec 63/63 và 23/23 (fake); PG, normal R3, image build NOT_RUN.
Chuỗi tiếp theo (không vòng chờ nhau): (1) PG + R3 + image trên composition cuối; (2) Edge cấp seals/pin/trust/window (`NOT_PROVIDED`); (3) điền artifact riêng tư và validate Plan B; (4) hoán đổi zero-custody do Codex; (5) Edge chạy 08 READ/STREAM/revoke rồi read09. Không có bước nào đã chạy.

##### Backend next / Frontend next / request / blocker

| Hướng | Việc, theo thứ tự |
| --- | --- |
| **Backend next** | 1. Core009 (ở trên). 2. Chạy PG specs của BE-P1…P8, P10 trên PG dùng một lần + ordinary R3 một lần cho cây hợp nhất (đúng SHA gốc → landed ghi trong ACK §2). 3. SCOPED_V2 stage subtree: v3 hoặc field purpose cho `stage_facts`, Canary compliance, identity (R-1/R-2) — cần Codex quyết purpose. 4. Writer `precomputed_series` **sau khi** có chủ cho ≥5 đầu vào của checklist BE-P8 §4. 5. Family command còn lại (ADMIN_LOCK…RETURN_CAPITAL) contract-first sau repin PM. 6. ELP2-10 T10-xx (dưới). |
| **Frontend next** | 1. SCOPED_V2 reader cho stage body và Alpha v2 (R-1…R-3) khi Codex publish. 2. Cockpit `laneModel` nhận `challenges[]` và control `paper.exit_review_request`. 3. Form pending-control (prefill `expected_versions`). 4. Port UXM-08/UXM-09 thật chỉ khi `#A`/qualification có (hiện fixture-only). 5. Consumer receipt cho FE-044/045/052 (Codex đã giao, chưa có receipt). 6. UXM-10 F-8 (tab switch Canary/Live/Workbench/Portfolio 360) và đo lại. |
| **Request đang mở** | [SYNC proposal](execution_loop/evidence/BE-CLAUDE-2026-10-20/SYNC_UPDATE_PROPOSAL_2026-10-20.md) §4–5; [yêu cầu cho source owner](execution_loop/evidence/BE-CLAUDE-2026-10-20/REQUESTS_FOR_SOURCE_OWNERS_2026-10-20.md); [Board proposal](execution_loop/evidence/BE-CLAUDE-2026-10-20/SOURCE_TRUTH_BOARD_PROPOSAL_2026-10-20.md) |
| **Cần Bobby** | `approval_ref`/revision policy Core; duyệt copy mới còn lại (step-up, chooser, "All completed runs in this workspace", expiry; 3 câu capture đã duyệt ở `e8e5f571`); xác nhận bỏ `execution.accounts.manage`; số đo + config T10-13 **một lần**; hạ cánh/push chỉ khi Bobby cho phép |

##### Bảng gate (năm mức)

| Mức | Đạt gì thật | Chưa đạt / chủ |
| --- | --- | --- |
| `SOURCE_ONLY` | BE-P9, BE-P10 (fake-backed, `tsc` build exit 0, focused vitest) | PG, R3, image — Claude/Codex, khoá `/tmp/portal-heavy.lock` |
| `FIXTURE_VERIFIED` | BE-P1…P8: `contracts-test.sh` exit 0 (78–86 file, 1.180–1.392 test tuỳ gói), generator `--check`, reader/screen FE trên fixture canonical; FE wide `src/execution/v2 src/app` 66.590 pass / 0 fail (receipt BE-P7, cây `792647d5` + commit của receipt); Playwright V2 `FIXTURE_LAB`/`BFF_DOUBLE` (UXM-10 138/138, selfnav 17/17, scoped 9/9, command 8/8) | hook R2/R3, visual pinned-image, PG (Claude/Codex) |
| `INSTALLED` | chỉ Core008 (image `sha256:7b2c7f34…` từ `7818d563`); **chưa** có BE-P6…P10 trong image | image mới + config + policy (Codex/Claude) |
| `CONNECTED_VERIFIED` | không có | READ/STREAM thật + revoke/cursor/replay có tương quan receipt (Edge+Core, sau Core009) |
| `OWNER_ACCEPTED` | không có | Codex producer ACCEPTED từng gói; PM/Edge xác nhận nguồn; Bobby duyệt copy/quyết định |

##### ELP2-10 closeout — ánh xạ T10 (theo handoff §3F)

| Mục | Trạng thái | Ghi chú |
| --- | --- | --- |
| T10-01…03, 09…11 (đầu vào tài chính, methodology/FX/partition, funding/lot, cửa sổ chuẩn, writer/recompute) | `NOT_STARTED` ở mức writer | danh sách đầu vào = BE-P8 §4 (12 hàng); nguồn MISSING |
| T10-04…08, 12 (khuếch đại browser→nguồn, workload hỗn hợp, TS/DL/Research, lease/DR, G2) | `NOT_RUN` | UXM-10 là số đo fixture, không phải G2; số Overview 15 s/payload/asset là **số đo để tối ưu**, chưa phải budget |
| T10-13 (budget/calibration) | chờ đề xuất | Claude đề xuất số đo + config một lần cho Bobby; không lấy số fixture làm mặc định production |
| T10-14 / ELP2-REQ-10-001 | `FIXTURE_VERIFIED` ở phía consumer | receipt tái dùng phải ghi dependency impact; không suy từ `tsc`/số test |

Chi tiết T10 do writer khác viết (commit `2325dd94` trên `claude/fe-parity`, R0, mọi số `PROPOSED_NOT_APPROVED`): [closeout plan](execution_loop/evidence/BE-CLAUDE-2026-10-20/ELP2-10_CLOSEOUT_PLAN_2026-10-20.md), [budget/calibration proposal](execution_loop/evidence/BE-CLAUDE-2026-10-20/ELP2-10_BUDGET_CALIBRATION_PROPOSAL_2026-10-20.md), [measurement protocols](execution_loop/evidence/BE-CLAUDE-2026-10-20/ELP2-10_MEASUREMENT_PROTOCOLS_2026-10-20.md); bảng trên chỉ ánh xạ trạng thái, không thay các tài liệu đó.

ELP2-11 `NOT_ENTRY_READY`; không merge dev/main, không ký/deploy.

<!-- PASTE END -->
