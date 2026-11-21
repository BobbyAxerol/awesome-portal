# UXM-07 — Ma trận bằng chứng L1–L3 (F5) và Access (F3), 2026-10-19 (cập nhật 2026-10-21: Workbench và kết quả create-request)

Chủ: Claude. Lane: FIXTURE_LAB / BFF_DOUBLE. Một agent chỉ-đọc dựng ma trận từ mã và test (không chạy test); ba writer sau đó đóng các khoảng trống. Số ca là số `it()` tĩnh, nhóm `it.each` nở thành nhiều ca khi chạy; số chạy thật nằm ở `test-results.json`.

L1 = ma trận trạng thái; L2 = quy mô (cap nhãn "N of total", ngân sách DOM, thời gian); L3 = âm tính (payload sai/độc hại bị từ chối; reader không nhận cái schema từ chối).

## Reader (`v2/readers`)
| Reader | L1 | L2 | L3 | Ghi chú |
| --- | --- | --- | --- | --- |
| accessEffective | đủ | đủ (200/500/501 grant, 1 MiB) | đủ, **kiểm schema OpenAPI** (mới) | AE-4 (MAX_IDS 1000→200) và AE-5 (khóa lạ bị từ chối) là hai chỗ reader nhận vượt schema, đã sửa. AE-3 (action mở) giữ có chủ ý. 17 payload hợp lệ theo schema bị reader từ chối (chặt hơn có chủ ý, đếm trong test). |
| accessSelf (eligibility, navigation) | đủ | đủ | đủ, kiểm schema | chưa nối vào màn (DEBT-UXM07-011) |
| commandCurrency | đủ | đủ | đủ, kiểm schema | chưa nối vào màn |
| dispatch (schema_version) | đủ | đủ | đủ | router, không có schema |
| governanceParents | đủ | đủ (256 findings; 257 trở lên bị từ chối) | đủ, kiểm schema | |
| liveSourceOperations | đủ | đủ | đủ, kiểm schema | |
| operationalQueue | đủ | đủ | đủ, kiểm schema | |
| managerDataset (+ `managerMetric`: `ManagerMetric`, window, partition) | đủ: metric, caveats, partition (không tổng chéo tiền tệ), `selected_window` (ALL = gap), `query_options`, page/cursor | đủ (200 hàng, 3 trang keyset, 1 MiB, 10.000 child, 200 group/partition, text 70k) | đủ, **kiểm schema OpenAPI**: reader không nhận cái schema từ chối (0/1.365 ca); 80 ca schema-hợp-lệ bị từ chối có chủ ý, 12 nhóm MD-S1..S12 có tên và đếm | **chưa nối vào màn** (FE-005/025/041). Looser có chủ ý MD-L1: `score_details`/`composition_details`/`regime_details` chỉ đếm, không đọc. Khoảng trống phía Codex ghim bằng `it.fails` MD-1..MD-8 (schema im lặng về: `returned_count` = số hàng, tiền tệ của metric trong partition, partition/row_key/group trùng, preset NOT_PUBLISHED mang window, `-0`, tiền tệ của headline). Chưa đọc: score-revision/history, scoped, realtime. Không đăng ký vào `dispatch.ts` (route mới, một schema, không có V1) |
| boundary.ts | đủ | đủ | đủ | |
| paperRead (Workbench: `readPaperWorkbenchProfile` + `buildWorkbench`) | **đủ (mới 2026-10-21)**: 40 trạng thái state x freshness x completeness; ma trận identity (9 hàng); 3 trạng thái `positions_by_side`; VN calendar | **đủ**: 200 hàng/nhánh đúng, 201 bị từ chối; 40 thành viên/hàng, mảng 100, chuỗi 8192; 20 capability; profile ~7 MiB đọc 15 ms | **đủ, schema `execution-paper-read.v1` là oracle**: 3 body, 3.285 đột biến sinh tự động (2.502 schema-invalid), **reader nhận 0 body lỏng hơn schema**; 0 body schema-valid bị từ chối ngoài sổ | `workbench.conformance.test.ts` (92 ca). Cổng schema ở `v2/readers/paperRead.ts`, dùng ở `getPaperWorkbenchProfile`; V1 không đổi (`ProfileEnvelope.schemaViolations` tùy chọn). Sổ lệch có chủ ý: S-1 (7 thành viên Full Blotter bị từ chối trong body workbench), X-1 (5 thành viên server gửi mà schema không liệt kê: `read_at_ms`, `as_of_ms`, `panels`, `history_windows`, `lineage_scoped_out`; **vấn đề schema cho Codex**), R-1 (version paper-read khác bị màn từ chối). Thành viên có reader đóng riêng (`stage_facts`, `positions_by_side`, `venue_calendar`, 5 khóa identity) hạ cấp thành "Not published" thay vì bỏ cả body (588 + 573 + 196 ca) |
| approvalCreate (kết quả `POST /governance/approvals`: created/replayed/duplicate/failed + 5xx không rõ kết cục + 409) | **đủ (mới 2026-10-21)**: 14 status x 9 dạng body (126 ca); 409 DUPLICATE/KEY_PAYLOAD_CONFLICT/SERIALIZATION/ARTIFACT_CHANGED; 5xx và 408 luôn "không rõ"; 2xx đọc không được = "không rõ" | **đủ**: message 512/code 128; Approval ở mọi cận; message 1 MiB cắt <= 402 ký tự trong 1,5 s; body 1 MiB bị từ chối trong 0,5 s | **đủ, schema `ApprovalCreateResponse` + `Problem` là oracle**: 548 + 76 đột biến, **0 body lỏng hơn schema**, 0 schema-valid bị từ chối; replay trong lookup 329 đột biến (300 schema-invalid), 0 lỏng | `request.conformance.test.ts` (176 ca) + `v2/readers/approvalCreate.ts`. Reader V1 `readApprovalCreated` lỏng (462/494 body schema-invalid được đọc là created); V1 giữ nguyên, port gắn `schemaViolations`/`untyped` và `model.readOutcome` đọc bản có đánh dấu là "không rõ"/`HTTP_<status>`. Lookup (`approvalRequestLookup`) giờ dùng reader chặt thay `readApprovalCreated`. Sổ: SI-1 (schema đòi `workspace_id`, server thì tùy chọn, client không gửi), SI-2 (`Problem` đóng nhưng server gửi `details`/`public_copy_key`/`safe_next_action`; id của approval trùng nằm ở `details.approval_id` nên liên kết tới request cũ tối: **yêu cầu Codex**), SI-3 (fixture `problem.valid.json` không phải `Problem`), S-1 (text in ra có ký tự điều khiển/bidi bị từ chối), X-2 (3 thành viên server) |

## Màn hình
| Màn | L1 | L2 | L3 | Còn thiếu |
| --- | --- | --- | --- | --- |
| Fleet, Cockpit, Portfolios, Portfolio 360, Overview, Operations, Incident, Accounts + 360, Blotter | đủ | đủ | đủ | — |
| Cockpit — pane cha governance | đủ | **đủ (mới)**: 199/200/201/256 findings đúng số, pane không cap nên không có nhãn cap | đủ | — |
| Compare | đủ | **đủ (mới)**: 99/100/101/500, nhãn "Showing 100 of N", chọn tối đa 4 | **đủ (mới)**: payload độc hại, tiền tệ lẫn, id trùng/lạ | Compare chỉ đọc list, không có series read |
| Alpha 360 | đủ | đủ | một phần | hợp đồng `alpha-resource.v1`, subject-records, observed-timeline, market-candles **không có fixture/schema đã publish**; chỉ kiểm với double viết tay `e2e/bffDoubleAlpha.ts` (nợ, yêu cầu Codex) |
| Replay | đủ | **đủ (mới)**: 199/200/201/500 fills, "Load more", 10.000 sự kiện | **đủ (mới)**, cùng hạn chế fixture như trên | `tradeReplayModel.str()` biến giá kiểu số thành chuỗi (KNOWN GAP có test ghim); `subjectActivity` coi `records` không phải mảng là rỗng |
| Admin | **đủ (mới)**: rỗng ≠ stale ≠ unavailable; refresh lỗi giữ hàng cũ, hạ cấp | **đủ (mới)**: ROW_CAP 200, nhãn "Showing 200 of N" | đủ | — |
| Users | đủ | đủ | **đủ (mới)**: reader roster chặt `rosterReader.ts` | reader V1 `accountApi.roster` có thể hiện rác (roster rỗng khi body sai, revision null thành 0); đã thay bằng reader chặt ở màn, file V1 không đổi |
| Access | đủ | **đủ (mới)**: 200/201/500/501 grants, nhãn, ngân sách DOM | đủ qua reader | ô "Not published (FE-015)" cho eligibility có thể sai chữ vì body đã publish nhưng chưa nối; đề xuất "Not read yet by this screen", chờ Bobby/Codex (DEBT-UXM07-011) |
| Paper workbench | đủ | đủ | **đủ (2026-10-21)**: `workbench.conformance.test.ts` (oracle schema), thêm `workbench.negative` | — (xem dòng paperRead ở bảng reader) |
| New request (trang + drawer) | đủ | đủ | **đủ (2026-10-21)**: `request.conformance.test.ts` (oracle schema) | — (xem dòng approvalCreate ở bảng reader) |

## F3 Access — ô "Not published" và id
FE-015 (preset, eligibility từng hành động, ai cấp), FE-026 (ma trận trường researcher), FE-037 (tên capability tạm). Cả ba có hàng trong `FRONTEND_BACKEND_SYNC.md`; test của màn Access khẳng định chữ và id. FE-052 và FE-053 trước đó chỉ nằm trong hàng gộp FE-044…055; đã thêm hàng riêng.

## Contract đã publish nhưng FE chưa đọc
- Codex-owned, chưa có consumer: manager analytics (23 file; riêng dataset đã có reader `managerDataset`, chưa nối màn), scoped-realtime (UXM-08/09/10 sau), scoped-records, retained-scoped, `execution-resource-scoped` (alpha-resource.v2 mà Alpha 360 sẽ cần; FE đang đọc v1).
- Biên nhận backend/Edge, không dành cho FE: `intercell-gateway.*`, `production-acceptance.*`, `protective-path.*`.
- Chưa phân loại: `research-*` (ngoài phạm vi Execution V2).

## Hạn chế của chính bằng chứng này
Ma trận gốc là đọc tĩnh. Phần "mới" đã được writer chạy test tập trung; số chạy toàn bộ ở `test-results.json` (khối `f5_close`).
