# Handoff → Codex: BE-P1…P14, consumer V2, RV-01…14 (2026-10-20)

Trạng thái: **READY_FOR_CODEX_REVIEW**. Không phải phase PASS, không phải connected PASS. Mọi kết quả dưới đây là FIXTURE_LAB / BFF_DOUBLE / SOURCE_ONLY trừ khi ghi khác; INSTALLED, CONNECTED_VERIFIED, OWNER_ACCEPTED: 0.

## 1. Pins
| Mục | Giá trị |
| --- | --- |
| Peer | `/home/bobby/portal-research-fe`, `claude/fe-parity` |
| Base (Core đã nhập) | `7818d563` (ancestor, đã merge); Core HEAD có thể đã tiến: Claude chưa kiểm sau lần merge cuối |
| Head tại lúc viết | ghi trong commit hook R2 ngay sau file này (`git log -1`); file này thuộc cùng commit |
| Phạm vi | 344 commit từ base, 942 file, +195.271/−6.221 (gồm generated/test/docs) |
| Cây làm việc | sạch khi viết; Edge ghi thêm ghi chú vào hai file (`UNIFIED_IMPLEMENTATION_PLAN.md`, `CLAUDE_CORE009_PRIORITY_HANDOFF_*`) và đã được commit nguyên văn |
| Push / landing | không push, không land. Landing là bước của Codex khi cây Core sạch |

## 2. Tài liệu chính (cùng thư mục, đọc theo thứ tự)
1. `ACK_ALL_BACKEND_2026-10-20.md`: bảng từng ID (FE-005…072, S3-U1…U5, MD-1…8, UXM08-A…F, UXM-09…), gate level, lane.
2. `BE-P1…P14.md`: sổ từng gói (status, file, test, NOT_RUN, câu hỏi producer-receipt, thay đổi reader FE).
3. `evidence/UXM-07/consumer-receipt-*-2026-10-20.md`: biên nhận consumer (đã công bố, đã dùng, bỏ qua).
4. Đề xuất dán: `SYNC_UPDATE_PROPOSAL`, `UNIFIED_UPDATE_PROPOSAL`, `SOURCE_TRUTH_BOARD_PROPOSAL`, `REQUESTS_FOR_SOURCE_OWNERS` (SRC-A…L), `ELP2-10_CLOSEOUT_PLAN`, `ELP2-10_BUDGET_CALIBRATION_PROPOSAL`, `ELP2-10_MEASUREMENT_PROTOCOLS`.
5. `evidence/UXM-07/FLEET_BUSINESS_JOURNAL_2026-10-20.md`, `evidence/ELP2-10/CORE009_*` (chuẩn bị, runbook rev 2, owner return PREPARED).

## 3. RV-01…14 (review của Codex 20:15)
| RV | Kết quả | Mức | Ở đâu |
| --- | --- | --- | --- |
| 01 relay denial V1 | Sửa: đọc `details` của 409; regression bằng fixture chuẩn | FIXTURE_VERIFIED | `commandPlan.ts`, `commandPlan.test.ts` |
| 02 scoped identity/stage facts | Nối: reader `scopedIdentity`, Live `identity`+`stage_facts` (chỉ OPEN_FINDINGS), Sandbox/Canary `identity`, `include` opt-in | FIXTURE_VERIFIED | `consumer-receipt-be-p12` |
| 03 UNKNOWN story | Nối: Check by request key (cùng khoá), `venue_fill`/`source_rejection`/`current_primitive` từ trường có kiểu | FIXTURE_VERIFIED | `consumer-receipt-be-p13` §7 |
| 04 chart cursor | Tái hiện (jsdom) + sửa: giữ theo mốc thời gian | FIXTURE_VERIFIED | `consumer-receipt-rv04-rv08` |
| 05 axe | 7 biến thể: 10→0 node; KNOWN_AXE rỗng | FIXTURE_VERIFIED | `consumer-receipt-rv05-rv07` |
| 06 lý do chạm được | `GapWhy` (nút, aria-expanded); còn title-only ở ô bảng Workbench/Live, `NotAvailableLine`, banner Sandbox | PARTIAL | cùng receipt |
| 07 API ổn định | `useValueStableApi` mọi màn; tab đọc 0 request | FIXTURE_VERIFIED | cùng receipt |
| 08 Portfolio Table/Expand | Nối (modal, không có Export): lệch hi-fi đã ghi | FIXTURE_VERIFIED | `consumer-receipt-rv04-rv08` |
| 09 Fleet | Tuỳ chọn từ dataset; nguồn tự động; KPI toàn phạm vi + nhãn nguồn; làn theo thành viên (Bobby quyết) | FIXTURE_VERIFIED | `FLEET_BUSINESS_JOURNAL` |
| 10 Paper exit/cockpit | Điều khiển Paper exit (shut với `R2_PARENT_NOT_PUBLISHED_FOR_DEPLOYMENT`); cockpit Archive/Reactivation/Capital chọn được; `expected_versions` chưa có form | PARTIAL | `consumer-receipt-rv09-rv10` |
| 11 field audit | Bảng 14 hàng R-5…R-9; chưa triển khai producer | SOURCE_ONLY | `BE-P14.md` §3 |
| 12 fixture | 3 fixture scoped (7 kịch bản/9 trang, 100/101, 35 từ chối) + reader SS-4 sửa | FIXTURE_VERIFIED | `BE-P14.md`, `consumer-receipt-be-p14` |
| 13 migration 146 | Nguồn có; **PG/HTTP gate: xem §5** | SOURCE_ONLY | `BE-P13.md` |
| 14 registry rev 7 | CHƯA làm: registry thuộc Codex; đề xuất mục self trong `consumer-receipt-be-p7` §6 | PENDING | — |

## 4. Cần Codex ACCEPTED / CHANGES_REQUESTED (đầy đủ trong sổ từng gói)
- BE-P1: MD-4 (preset chưa publish không mang window), MD-8 (headline là đúng một partition), no schema bump. BE-P6: MD-5 chuẩn hoá `-0` khi phát (Bobby chọn C). BE-P8: `ratio_scale`, metric↔unit, no bump.
- BE-P4: luật `current_stage` + đổi một khẳng định trong `elp206-manager-model.spec.ts`. BE-P7: bằng chứng step-up theo họ (`stpcap_`), `/self-context`, route `/administration/my-access`, quy tắc workspace mặc định, `execution.accounts.manage` bỏ.
- BE-P10/11: coordinator zod-only cho revoke/session, biên nhận no-op, nhịp poll thu hồi, ai cầm tệp token. BE-P12: O1 vs O2/O3, `portfolio_name` theo `alpha.read`, thêm `portfolio_id` vào `identity` Live. BE-P13: số migration 146, `request_key` bắt buộc, fixture trích N16B giữ nguyên + fixture phục vụ mới.
- Registry rev 7 (`self_entry.route`), thêm `runtime_state`/phiên vào từ vựng đọc, bảng `finding_type`, schema scoped thiếu `minItems:1`.

## 5. Gate (không cộng trùng)
| Gate | Kết quả |
| --- | --- |
| tsc FE | exit 0 (lần chạy tích hợp gần nhất) |
| vitest FE toàn bộ | 82.142 đạt; đỏ còn lại: `realtimeProducerConsumer` (môi trường Codex `common_1.Optional`), các ca đã sửa sau lần chạy (FE-Q, 33 file/3.712 đạt) |
| Playwright V2 | s1+links 76, coexistence 138 (BFF_DOUBLE), selfnav 17, scoped 9, command 8, alpha-scoped 9: từng lần chạy ở cấu hình cổng riêng |
| `contracts-test.sh` (Docker) | lần cuối 89 file/1.504 test, exit 0 (BE-P14) |
| Hook R2/R3 đầy đủ | chạy ở commit kế tiếp: kết quả ghi trong `HOOK_RESULT_2026-10-20.md` |
| PG thật cho BE-P7…P13 | NOT_RUN ngoài hook; chủ: Claude (hook) rồi Codex |
| Visual pinned-image | NOT_RUN trên SHA cuối; chủ: Claude |
| REAL_READ_*, Core009 cài/kết nối | NOT_RUN; chủ: Codex (hoán đổi) + Edge |

## 6. Core009
`PREPARED_SOURCE_ONLY`: BE-P9/10/11. Plan B (READ+STREAM, mỗi grant ≤ 2 giờ và ≤ hạn niềm tin), thu hồi chính thức, phiên nghiệm thu qua AuthService, ba sửa của Edge đã làm. Việc kế tiếp thuộc Codex: build ảnh từ commit đã land + R3, readback A–F, quiesce bootstrap bằng IPC, cài, `node dist/main.js`, cấp phiên (tệp token cho Edge). Hạn niềm tin ứng viên đã qua (08:00:59Z): cần Edge cấp lại.

## 7. Yêu cầu mới và nợ
Yêu cầu nguồn: `REQUESTS_FOR_SOURCE_OWNERS_2026-10-20.md` (SRC-A…L). Nợ FE: `debt-register.json` (UXM-07), V1 `adminCatalog` đọc từ N16B là null (V1 chưa đụng), đo lại ngân sách sau RV-07, baseline visual chưa ghi cho các nhóm V2 mới.

## 8. Dọn dẹp và rollback
Không tài nguyên runtime nào do Claude tạo cần dọn (không container, session, grant, policy). Preview 8095: `portal-web` + `portal-fixture-bff` build từ SHA trước; `control-api` do lane C7 của Codex (không đụng; bài học trong memory). Rollback: `evidence/UXM-07/rollback.md` (theo cờ V2), migration 145 và 146 có Down, mỗi gói revert theo commit.

## 9. Tiếp theo
Backend: Codex review §4, hoán đổi Core009, publish `runtime_state`/phiên/`finding_type`/series nguồn. Frontend: Claude viết baseline visual sau duyệt copy/độ lệch, nối pager slice khi có port, `ChartTools` cho Account/Alpha/Workbench/Live/Canary, registry rev 7 cùng Codex.
