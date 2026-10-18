# B1 handoff: operations queue V2, FE-042 (incident links) và FE-043 (status_counts)

Giao theo Rules §7.2 / §10.11. Producer: Claude (backend slice B1). Reviewer: Codex (packet phase 04).
Mức giao: **contract published (nhánh) / code landed: CHƯA, UNCOMMITTED / runtime qualified: KHÔNG / consumer accepted: KHÔNG**.
Working-tree chưa commit; không coi là artifact tái lập. Primary commit theo đường dẫn (danh sách ở cuối).

## 1. Phạm vi và operation

- Route: `GET /api/v1/execution/operations` (`listExecutionOperationsQueue`), body `portal.execution.operational-queue.v2`
  (cũng nằm trong `compositions/operations` qua `OperationalQueueV2`). KHÔNG đổi `schema_version`.
- Amendment **cộng thêm, optional, có tài liệu**. Thêm 4 $defs: `OperationalIncidentLinkV2`, `OperationalIncidentLinksV2`,
  `OperationalStatusCountsV2`, `OperationalQueueRowV2`. `OperationalQueueItemV2` KHÔNG đổi (workflow detail vẫn dùng nó và vẫn từ chối `incident_links`).
- Không migration mới, không thêm tên vào `PORTAL_CAPABILITIES`, không sửa execution-v2/**, PM/Manager, command, realtime.

## 2. Contract (tên field và kiểu chính xác)

`page.rows[]` (= `OperationalQueueRowV2`) có thêm field **optional** `incident_links`:

```
incident_links: {
  basis: "CURRENT_LINK_ROWS_AUTHORIZED_INCIDENTS_ONLY",
  bound: 3,                                  // const
  authorized_link_count: int >= 0,           // chỉ đếm link tới incident mà caller được phép; không bao giờ là số toàn cục
  truncated: boolean,                        // == authorized_link_count > items.length
  items: (LINKED | NOT_ATTESTED)[]           // maxItems 3, mới nhất trước (linked_at desc, incident_id desc theo byte order "C")
}
LINKED:       { state:"LINKED", incident_id, relationship:"TRIGGERED_BY"|"MITIGATES"|"RELATED", linked_at (ISO µs UTC),
                incident:{ target:{type,id}, environment, severity, workflow_state:"OPEN"|"MITIGATED"|"RESOLVED" },
                link_history:{ availability:"NOT_PUBLISHED", reason_code:"ORIGINAL_INCIDENT_TARGET_NOT_ATTESTED" } }
NOT_ATTESTED: { state:"NOT_ATTESTED", reason_code:"INCIDENT_LINK_IDENTITY_NOT_REPRESENTABLE", link_history:{...như trên} }
```

`page` có thêm field **optional** `status_counts`:

```
status_counts: {
  basis: "SAME_SNAPSHOT_AUTHORIZED_SCOPE_AND_FILTERS_EXCLUDING_OWN_DIMENSION",
  succeeded_means: "PORTAL_QUEUE_RECORD_STATE_ONLY",           // const
  dimensions: { triage_state, verification_result, source_status, severity }   // đúng 4, mỗi cái:
     { own_filter_applied: boolean, total: int, counts: { <mọi giá trị của miền đóng>: int } }   // zero-filled
}
```

Ngữ nghĩa (đã ghi trong description của schema/OpenAPI/d.ts):
- FE-042: phải được ủy quyền **cả hai đầu**. Operation: dòng nằm trong scope audit đã mint. Incident: bộ ba target_type/target_id/environment **của chính incident** nằm trong CÙNG scope đã mint (kiểm bằng SQL, độc lập với operation). Không chọn "incident đầu tiên", hàng không có `incident_id` đơn.
  Link tới incident ngoài scope (kể cả loại target SYSTEM/ORDER/BROKER_BINDING, vốn không bao giờ cấp quyền được ở đây) bị **bỏ khỏi danh sách và KHÔNG đếm**, nên danh sách rỗng/ngắn không chứng minh "không có incident khác" (tránh rò rỉ tồn tại).
  Bound 3 áp **sau** ủy quyền (link không được phép không chiếm slot).
- `link_history` luôn là typed absence: link là con trỏ hiện tại, KHÔNG chứng thực target của incident lúc ghi link (đúng với `historical_children` của incident root và comment migration 141). `NOT_ATTESTED` giữ chỗ và giữ trong count cho link đã được phép nhưng id/thời gian không biểu diễn chính xác được (không bao giờ drop, không đoán).
- FE-043: mọi count (và total/filtered/page/links) đọc trong **một** transaction REPEATABLE READ READ ONLY của `ControlPlaneQueryService`, cùng scope và cùng filter. Mỗi dimension đếm tập được phép dưới **mọi filter áp dụng TRỪ filter của chính nó** (để ô KPI đang chọn vẫn thấy anh em). Bất biến (kiểm ở runtime zod, FE reader, và test): `sum(counts)==total`; `total<=total_count`; không có filter riêng → `total==filtered_count`; có filter riêng → `counts[giá trị đã chọn]==filtered_count` và `total>=filtered_count`; `own_filter_applied` khớp `applied_filters`. Count không phụ thuộc cursor/limit/sort. Predicate hỗ trợ = đúng 4 field (request schema đã là enum đóng nên giá trị ngoài miền bị 400). `environment`, `target_type`, `target_id`, `command_key` là filter nhưng không phải dimension.
- "SUCCEEDED" (source_status hoặc verification_result) chỉ là trạng thái bản ghi queue của Portal: **không** phải APPLIED tài chính, **không** phải hội tụ projection, **không** phải thành công trên sàn. Ghi trong description của `OperationalQueueV2`, `OperationalStatusCountsV2`, route GET, và const `succeeded_means`.

## 3. Producer files

Dòng (wc -l sau sửa): operational-read.contract.ts 154 · operational-read.repository.ts 108 · operational-read.service.ts 177 · query/contracts.ts 217 · query/postgres.ts 666 · generator execution-operational-current-reader.mjs 170 · fixture mới 274 · test API elp204-operational-current.spec.ts 852 · test contract execution-operation-reader.spec.ts 372 · FE operationalQueue.ts 639 / .test.ts 361. Điểm chính:
- `apps/control-api/src/query/{contracts,postgres}.ts`: thêm `ControlPlaneQueryService.listWithSnapshot()` (+ `PostgresSnapshotReader`, `GroupedCountSpec`). `list()` giữ nguyên hành vi (gọi cùng `execute`). Reader chạy trong tx của page trước COMMIT; `groupedCounts` dùng lại đúng workspace/visibility/rowScope/filters của page, cột phải là cột của một filter đã khai báo, tối đa 64 nhóm, vượt = lỗi fail-closed (503).
- `operational-read.repository.ts`: `incidentLinks()` (SQL tĩnh, mọi giá trị bind; hai EXISTS scope; window `row_number` bound 3 sau scope).
- `operational-read.service.ts`: nối link + count vào `prepareQueue`; mọi đường finish/fence ủy quyền hiện có giữ nguyên (thu hồi giữa chừng → 409/404 như cũ).

## 4. Fixture

- MỚI: `packages/contracts/fixtures/execution-operational-queue-links-counts.synthetic.valid.json` (sinh bởi `operationalLinksCountsFixture()`; TEST_ONLY, runtime_qualified=false): 3 hàng (4 link bị cắt còn 3; 1 slot NOT_ATTESTED; 0 link), filter `severity=WARNING`, total 6 / filtered 3, đủ 4 dimension (severity có own filter).
- `execution-operational-current.synthetic.valid.json` KHÔNG đổi (không có hai field mới, vẫn hợp lệ: optional).

## 5. Regenerate

```
cd packages/contracts && node tooling/execution-operation-reader.mjs          # schema, openapi, fixtures
openapi-typescript openapi/execution-operations.openapi.json -o generated/execution-operations.d.ts
python3 tooling/snapshot.py                                                  # contracts-snapshot.json
```
(`openapi-typescript` 7.13.0 từ /tmp/portal-phase2-contract-deps, đúng version trong package-lock; `--check` của generator và `snapshot.py --check` đều xanh.)

## 6. Test và kết quả

Tất cả chạy FOCUSED, từng cái một, bọc `flock /tmp/portal-heavy.lock`. Không chạy hook R2/R3, không chạy full suite.

| Gate | Lệnh | Kết quả |
|---|---|---|
| API (PG thật, Docker cell) | `scripts/control-api-test.sh test/elp204-operational-current.spec.ts` | exit 0, 73/73 (56 cũ + 17 mới; 9 case cũ phải sửa 1 assertion: `detail.operation` so với hàng queue không còn `incident_links`) |
| Engine dùng chung | `scripts/control-api-test.sh test/query.spec.ts test/elp2-query-scope.spec.ts test/elp204-f0-collection.spec.ts` | exit 0, 120/120 (`list()` không đổi hành vi) |
| Contract | `vitest run test/execution-operation-reader.spec.ts` (packages/contracts, deps tạm qua symlink, đã gỡ) | 86/86 (vitest 2.1.9 từ /tmp/portal-phase2-contract-deps, không phải 4.1.11 của lockfile) |
| Generator | `node tooling/execution-operation-reader.mjs --check` | exit 0 |
| Snapshot | `python3 tooling/snapshot.py --check` | exit 0 (471 file) |
| control-api tsc | `tsc --noEmit -p tsconfig.json` | 0 lỗi trong `src/**` và trong `elp204-operational-current.spec.ts`; còn 328 lỗi CÓ SẴN ở các test khác (không thuộc B1) |
| FE reader | `vitest run src/execution/v2/readers/operationalQueue.test.ts` | 73/73 (+~50 mới) |
| FE tsc | `tsc --noEmit -p tsconfig.json` (apps/portal/frontend) | exit 0, 0 lỗi |

Test âm tính API mới: caller được phép operation nhưng không được phép incident (rỗng, không rò id); được phép incident nhưng không được phép operation (hàng không trả); incident loại SYSTEM / sai environment / sai target bị loại và không đếm; workspace khác (cùng tên target) không xuất hiện + `workspace_id` lạ → 400; thu hồi grant ĐẦU INCIDENT hoặc ĐẦU OPERATION giữa chừng khi giữ body → 409 `OPERATIONAL_READ_CHANGED`; bound 3 áp sau ủy quyền + tie-break byte order; slot NOT_ATTESTED (incident_id 200 ký tự); count nhất quán với filter (1 filter, 2 filter, 4 filter, filter + environment), count không đổi theo limit/cursor/sort; một ghi commit giữa lệnh page và lệnh count KHÔNG lọt vào (cùng snapshot `txid_current_snapshot`, `repeatable read`); hàng ẩn không đổi count; predicate lạ (`assigned_to`, `status_counts=`) vẫn bị 400; bản copy "SUCCEEDED không phải APPLIED/convergence/venue" (const `succeeded_means`, text schema, và schema từ chối `FINANCIAL_APPLIED`); worst case 250 hàng × 3 link id 191 ký tự < 1 MiB. Revoke "giữa request" dùng cơ chế prepare→revoke→finish có sẵn của harness (không có hook giữa câu SQL).

## 7. Giới hạn / bound

- links: 3 / operation, 250 hàng / trang → tối đa 750 link; response vẫn bị chặn 1 MiB (`bounded()`); test tính trường hợp xấu nhất (250 hàng, id dài 191 ký tự, 3 link mỗi hàng) < 1 MiB (~0.75 MiB).
- Số câu SQL / request: total + (filtered nếu có filter) + page + ≤2 edge probe + 4 grouped count + 1 links, tất cả trong 1 tx, `statement_timeout` 2s mỗi câu.
- Index: `execution_incident_operation_links` PK `(incident_id, operation_id)`; truy vấn theo `(workspace_id, operation_id = ANY)` không có index riêng → có thể seq scan bảng link (nhỏ, bị statement_timeout chặn). Cần index thì phải migration: KHÔNG làm (ngoài phạm vi), xin Codex quyết (câu hỏi 2).

## 8. KHÔNG khẳng định

- Không có nguồn thật: toàn bộ chứng minh bằng PostgreSQL dùng một lần và fixture TEST_ONLY. Không runtime qualification, không đã deploy, không consumer accepted.
- Không khẳng định lịch sử link/incident được chứng thực; không khẳng định SUCCEEDED là kết quả tài chính/projection/sàn.
- Không khẳng định danh sách link là đầy đủ (chỉ incident được phép, tối đa 3).
- Không đụng quyền/grant/capability; không phát hiện thay đổi migration.

## 9. Câu hỏi cho Codex

1. `link_history` hiện là hằng typed-absence trên mọi link. Không có tín hiệu chứng thực động nào trong schema hiện tại (event CORRELATE_OPERATION không ghi target). Codex có chấp nhận hằng này, hay muốn nguồn chứng thực thật (cần migration, nên dừng và báo)?
2. Index `(workspace_id, operation_id)` trên `execution_incident_operation_links`: cần một migration của Codex không, hay chấp nhận seq scan có giới hạn thời gian?
3. Link tới incident ngoài scope bị im lặng loại và không đếm (chống rò rỉ). Codex có muốn một cờ boolean "có link không đọc được" (rò rỉ tồn tại nhưng không rò id) không? Mặc định: không.
4. Always-on vs opt-in: server luôn gửi cả hai field (thêm ≤7 SQL/request). Có muốn tham số query opt-in (`include=`) không? Mặc định: không.
5. Quy tắc "dimension bỏ qua filter của chính nó" có khớp ý định KPI của Codex không (thay vì áp mọi filter)?
6. `composite_revision`/`workflow_digest` của composition thay đổi do body queue lớn hơn: chấp nhận?

## 10. FE đã nối (chỉ reader)

`apps/portal/frontend/src/execution/v2/readers/operationalQueue.ts` (+ test): `OperationV2.incidentLinks?`, `QueuePageV2.statusCounts?`; absent = `undefined` ("Not published (FE-042/FE-043)"), present nhưng sai = cả trang `null`. Chưa sửa màn hình (primary nối).

## 11. File đã đổi (để primary commit theo đường dẫn)

Backend + contract (B1): `apps/control-api/src/query/contracts.ts`, `apps/control-api/src/query/postgres.ts`,
`apps/control-api/src/operations/operational-read.{contract,repository,service}.ts`,
`apps/control-api/test/elp204-operational-current.spec.ts`,
`packages/contracts/tooling/execution-operational-current-reader.mjs`, `packages/contracts/tooling/snapshot.py`,
`packages/contracts/openapi/execution-operations.openapi.json`, `packages/contracts/schemas/execution-operations.v1.schema.json`,
`packages/contracts/generated/execution-operations.d.ts`, `packages/contracts/contracts-snapshot.json`,
`packages/contracts/test/execution-operation-reader.spec.ts`,
`packages/contracts/fixtures/execution-operational-queue-links-counts.synthetic.valid.json` (MỚI), file này (MỚI).
FE reader: `apps/portal/frontend/src/execution/v2/readers/operationalQueue.ts` và `.test.ts`.
