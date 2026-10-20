# Handoff → Codex: BE-P1…P14, consumer V2, RV-01…14 (2026-10-20)

Trạng thái: **READY_FOR_CODEX_REVIEW**. Không phải phase PASS, không phải connected PASS. Mọi kết quả dưới đây là FIXTURE_LAB / BFF_DOUBLE / SOURCE_ONLY trừ khi ghi khác; INSTALLED, CONNECTED_VERIFIED, OWNER_ACCEPTED: 0.

**Phân vai (Bobby, 2026-10-20; rules §10.13):** Claude **implement toàn bộ backend** (contract, migration, registry, reader, writer, fixture, gate), Codex **review** (ACCEPTED / CHANGES_REQUESTED). Ngoại lệ duy nhất cho Codex làm tay: **build ảnh + readback + hoán đổi runtime Core009** (§6). TS/PM/Edge vẫn do chủ nguồn. Landing là bước của Codex (ff-only, sau R2). Mọi chỗ cũ ghi "chờ Codex" cho backend nay đọc là "Claude implement, Codex review".

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
| 13 migration 146 | Nguồn có. Spec PG + HTTP đã viết: `apps/control-api/test/be-p13-f0-apply-attempts-pg.spec.ts` (Up/Down, ràng buộc, append-only, apply insert/replay/conflict/đồng thời, lookup NONE/FOUND/CONFLICT, cô lập actor/workspace, absence, revoke trước/sau await). **Chưa chạy trên PG** (chủ chạy: lead, khoá nặng) | SPEC_WRITTEN, PG NOT_RUN | `BE-P13.md`, spec trên |
| 14 registry | Làm (Claude): `PROFILE_ACCESS_SELF` (`/administration/my-access`) trong `registry.json`, **revision 7 → 8** (rev 7 đã dùng cho `scoped_v2_replacement` ở e19ad906 nên không thêm vào rev 7). `permissions: []`, không hiện sidebar/palette (FE chỉ mời khi self-navigation sống). Guard self/admin tách (test), fixture công khai sinh lại. FE: bỏ route sinh từ registry cho path này (route cờ `profile` giữ nguyên). Codex review | FIXTURE_VERIFIED (pytest registry + vitest app) | `registry.json`, `test_portal_registry_contract.py` |

## 4. Cần Codex ACCEPTED / CHANGES_REQUESTED (đầy đủ trong sổ từng gói)
Codex review các mục sau (không phải Codex implement):
- BE-P1: MD-4 (preset chưa publish không mang window), MD-8 (headline là đúng một partition), no schema bump. BE-P6: MD-5 chuẩn hoá `-0` khi phát (Bobby chọn C). BE-P8: `ratio_scale`, metric↔unit, no bump.
- BE-P4: luật `current_stage` + đổi một khẳng định trong `elp206-manager-model.spec.ts`. BE-P7: bằng chứng step-up theo họ (`stpcap_`), `/self-context`, route `/administration/my-access`, quy tắc workspace mặc định, `execution.accounts.manage` bỏ.
- BE-P10/11: coordinator zod-only cho revoke/session, biên nhận no-op, nhịp poll thu hồi, ai cầm tệp token. BE-P12: O1 vs O2/O3, `portfolio_name` theo `alpha.read`, thêm `portfolio_id` vào `identity` Live. BE-P13: số migration 146, `request_key` bắt buộc, fixture trích N16B giữ nguyên + fixture phục vụ mới.
- Registry rev 8 (`PROFILE_ACCESS_SELF`; số revision khác đề xuất cũ "rev 7", lý do ở bảng §3 hàng 14). Thêm `runtime_state`/phiên vào từ vựng đọc, bảng `finding_type`, schema scoped thiếu `minItems:1`: Claude implement, Codex review.

## 5. Gate (không cộng trùng)
| Gate | Kết quả |
| --- | --- |
| tsc FE | exit 0 (lần chạy tích hợp gần nhất) |
| vitest FE toàn bộ | 82.142 đạt; đỏ còn lại: `realtimeProducerConsumer` (môi trường Codex `common_1.Optional`), các ca đã sửa sau lần chạy (FE-Q, 33 file/3.712 đạt) |
| Playwright V2 | s1+links 76, coexistence 138 (BFF_DOUBLE), selfnav 17, scoped 9, command 8, alpha-scoped 9: từng lần chạy ở cấu hình cổng riêng |
| `contracts-test.sh` (Docker) | lần cuối 89 file/1.504 test, exit 0 (BE-P14) |
| Hook R2/R3 đầy đủ | Xanh trên 105775f0 (commit 30207702), xem `HOOK_RESULT_2026-10-20.md`. Tip hiện tại đã thêm RV-06/10/11/13/14, BE-P16/P17, parent Paper Exit, sửa UX, registry rev 8 + re-pin N29: cần chạy lại | Claude (lead chạy) | Chạy hook ở commit cuối của đợt này, cập nhật HOOK_RESULT |
| PG thật cho BE-P7…P13 (gồm spec migration 146 mới) | NOT_RUN ngoài hook; chủ chạy: Claude (lead, khoá nặng); Codex review kết quả |
| Visual pinned-image | NOT_RUN trên SHA cuối; chủ: Claude |
| REAL_READ_*, Core009 cài/kết nối | NOT_RUN; chủ: Claude (R3, cấu hình, phiên, consumer) ; Codex chỉ build ảnh/readback/hoán đổi runtime; Edge cấp trust + cửa sổ |

## 6. Core009
`PREPARED_SOURCE_ONLY`: BE-P9/10/11. Plan B (READ+STREAM, mỗi grant ≤ 2 giờ và ≤ hạn niềm tin), thu hồi chính thức, phiên nghiệm thu qua AuthService, ba sửa của Edge đã làm. Theo quyết định của Bobby, **chỉ phần hoán đổi runtime** thuộc Codex: build ảnh từ commit đã land, readback A–F, quiesce bootstrap bằng IPC, cài, `node dist/main.js`, cấp phiên (tệp token cho Edge). **Mọi phần còn lại là Claude**: R3 thường, cấu hình/policy/phiên, consumer, receipt, cleanup đúng phạm vi. Hạn niềm tin ứng viên đã qua (08:00:59Z): cần Edge cấp lại.

## 7. Yêu cầu mới và nợ
Yêu cầu nguồn: `REQUESTS_FOR_SOURCE_OWNERS_2026-10-20.md` (SRC-A…L). Nợ FE: `debt-register.json` (UXM-07), V1 `adminCatalog` đọc từ N16B là null (V1 chưa đụng), đo lại ngân sách sau RV-07, baseline visual chưa ghi cho các nhóm V2 mới.

## 8. Dọn dẹp và rollback
Không tài nguyên runtime nào do Claude tạo cần dọn (không container, session, grant, policy). Preview 8095: `portal-web` + `portal-fixture-bff` build từ SHA trước; `control-api` do lane C7 của Codex (không đụng; bài học trong memory). Rollback: `evidence/UXM-07/rollback.md` (theo cờ V2), migration 145 và 146 có Down, mỗi gói revert theo commit.

## 9. Tiếp theo
Backend: Codex review §4 và làm riêng phần hoán đổi runtime Core009; Claude implement và publish `runtime_state`/phiên/`finding_type`/series nguồn (Codex review). Frontend: Claude viết baseline visual sau duyệt copy/độ lệch, nối pager slice khi có port, `ChartTools` cho Account/Alpha/Workbench/Live/Canary, registry rev 8 đã làm (Codex review).

## 10. Chưa nghiệm thu
Không mục nào dưới đây được gọi là xong. "Chủ" = người làm; Codex review mọi mục backend.

| Mục | Trạng thái hiện tại | Chủ | Bước kế |
| --- | --- | --- | --- |
| Core009 `PREPARED_SOURCE_ONLY` | BE-P9/10/11 chỉ có nguồn + chuẩn bị; 0 cài, 0 kết nối; hạn niềm tin ứng viên đã qua | Claude (R3, cấu hình, phiên, consumer); Codex **chỉ** hoán đổi runtime; Edge (trust, cửa sổ) | Claude: R3 thường trên commit đã land. Codex: build ảnh + readback A–F + cài. Edge: cấp lại trust, mở cửa sổ READ/STREAM riêng. Claude: kiểm READ và STREAM, revoke/restart/recovery, dọn đúng phạm vi |
| Financial publication (ELP2-05/06) | BE-P16 (migration 147): writer NAV/NET_PNL theo fund/portfolio/partition tiền tệ, lease + checkpoint + backfill resume; RETURN, tổng đa tiền tệ, cửa sổ ALL, subject Alpha/Deployment vẫn vắng có mã lý do. Spec PG `be-p16-manager-series-pg` 14/14 xanh | Claude; chủ nguồn (methodology, cashflow, FX, economic revision, inception) | Chủ nguồn trả SRC tương ứng; Bobby/Codex quyết có mở subject Alpha/Deployment (kèm đổi reader FE đóng). Không gọi retained equity là NAV/TWR đã qualified |
| Realtime source (ELP2-09 scoped) | BE-P17: `GET /manager/fleet/realtime-snapshot` + `/stream` đã publish, hub có cap, cursor `sr1`, recheck authority; `edge_notice_source = NOT_COMMISSIONED`; stream dark vì chưa có grant `stream.subscribe`; `revokeSession` chưa nối đường revoke | Claude (contract, reader, stream, cap); Edge (nguồn) | Cấp grant `stream.subscribe` theo Plan B; nối revoke; đo M-n; Edge: nguồn notice |
| Budget / calibration (ELP2-10 D1–D7) | `PROPOSED_NOT_APPROVED`; ô thiếu cơ sở ghi `NO BASIS: needs measurement M-n` | Bobby (D1–D7 duyệt/nêu mục tiêu, người duyệt Score độc lập); Claude (đo M-1…M-7) | Bobby trả D1–D7 (D5: users × tab; D7: người duyệt calibration). Claude: xin cửa sổ độc quyền qua Edge (M-5, M-7), đo, sinh số từ receipt |
| Coexistence / G2 | 138 test là BFF_DOUBLE; chưa có mixed/coexistence/P184 performance G2 trên nguồn thật | Claude (chạy, receipt); Edge/owner TS/DL (cửa sổ) | Sau Core009 cài + financial input: chạy G2 theo `ELP2-10_MEASUREMENT_PROTOCOLS`, lưu receipt, không nới SLO |
| Visual trên SHA cuối | Đã chạy so sánh trên tip 2026-10-20: 580 đạt / 37 đỏ / 16 skip; 1 lệch ảnh thật (phase-3-gate-r2 laptop, sticky bar lệch 26px) đã ghi lại một file; 36 còn lại là kỳ vọng test cũ hoặc môi trường, đã sửa. Chưa chạy lại trên SHA cuối; baseline nhóm V2 mới chưa ghi | Claude | Chạy lại ở SHA cuối sau đợt sửa UX, xem contact sheet, ghi baseline V2 sau khi Bobby duyệt copy |
| Connected acceptance | 0/14 `CONNECTED_VERIFIED`; INSTALLED, OWNER_ACCEPTED: 0 | Claude (consumer + receipt thật); Codex (hoán đổi Core009); Edge (nguồn); Bobby (nhận) | Khi Core009 cài và có financial input: REAL_RECEIPT sạch qua cùng consumer, đối chiếu grain/time/unit/population; matrix lên từng module, không gộp |
| Hook R2/R3 đầy đủ | PENDING; `HOOK_RESULT_2026-10-20.md` chưa tồn tại | Claude (lead chạy) | Chạy hook ở commit kế tiếp, ghi kết quả thật vào file đó; không khai trước |
