# BE-P22 — Quan sát cache native riêng tư (operator-only)

Ngày 2026-10-21. Nhánh `claude/post-freeze-20261021`. Trả lời mục "Small request
to Claude — private observation only" trong
`ELP2-10/CORE009_NATIVE_OBSERVATION_REVIEW_AND_CLAUDE_REQUEST_2026-10-21.md`.
Trạng thái: **ĐÃ ÁP DỤNG trên nhánh `claude/post-freeze-20261021` (one-writer ACK của Codex, CODEX_BE_P21_P22_REVIEW_AND_ONE_WRITER_RETURN_2026-10-21.md) — P22-1/P22-2 đã sửa; wiring 4 file dùng chung + CLI operator riêng đã làm; observer opt-in, MẶC ĐỊNH VẮNG MẶT, không cài runtime.** Chưa là bằng chứng nối nguồn thật (xem §6, §9). Không DB/Docker/hook/lock đã chạy ở lượt này; spec PG dành cho lead (§9).

## 0. Tóm tắt

- Mỗi request native finite READ sinh **một record** ≤ 768 B: `cache_state`
  (HIT/MISS/COALESCED thật từ nhánh `shared.kind`), MAC có khóa của cache key,
  MAC có khóa của native epoch, `lease_id`/`attempt_id`, `body_digest` hiện có,
  và **tên** witness egress hiện có (`FINAL_HTTP_SEND_COMPLETED` /
  `FINAL_HTTP_ABORT_CONFIRMED` / `NO_FINAL_WITNESS` / `EGRESS_NOT_OBSERVED_IN_RETURN` — xem §8 P22-1).
- Lưu: **JSONL append-only trong thư mục operator 0700 + CLI operator đọc** (không
  DDL, không route, không permission, không field browser). Chi tiết §3.
- Không có timestamp, không có byte count, không có thời điểm ghi vật lý (§6).

## 1. Điểm chèn (đã có sẵn trong scope; cây `claude/post-freeze-20261021` @371224f0)

Đường: `NativeManagerReadConsumer.serve` -> `MaximumDataOperationService.prepareNativeManagerPage`
-> `prepareDeploymentData|prepareRelationData` -> `ExecutionCurrentSourceProxy.request` -> `SharedReads.begin`.

| # | file:line | Đang có trong scope | Việc thêm |
| --- | --- | --- | --- |
| P1 | `execution/current-source.proxy.ts:1038` `begin()`; `:1041-1044` HIT, `:1054-1057` COALESCED, `:1134-1137` MISS | `shared.kind`, `shared.cacheKey` (sha256 N21, đã gồm `nativeEpochDigest` — `shared-read.repository.ts:748-759`), `cacheState` chuỗi | Bọc `composedResponse(...)` bằng `noteCacheBranch(resp,{cache_state,cache_identity:shared.cacheKey})`. WeakMap theo object, **không** vào JSON/DTO/cache key. Không bao giờ throw. |
| P2 | `execution/current-source.proxy.ts:1149-1196` `composedResponse` | `gateway.cache.state` đã nằm ở BFF, nhưng `translate*` chỉ đọc `bff.source` nên state bị bỏ khi dựng DTO (`maximum-data-operation.service.ts:333-370, 427-466`) | Không sửa. Đây là chỗ mất thông tin; P3 mang nó qua. |
| P3 | `execution/maximum-data-operation.service.ts:148` và `:189` (`return this.translate…`) | `response` (BFF, object đã capture) và `dto` | `carryCacheBranch(response, dto)` — chuyển capture sang object sẽ giao. |
| P4 | `execution/maximum-data-operation.service.ts:245-252` `prepareNativeManagerPage` | `dto`, `nativeEpochDigest` (đã tính ở `currentNativeManagerRead:234`) | Trả thêm `cacheBranch: takeCacheBranch(dto)` (one-shot). |
| P5 | `execution-v2/native-manager-consumer.ts:145-151` `serve` | nhận `dto,nativeEpochDigest` | Nhận `cacheBranch`, truyền xuống `deliver`. |
| P6 | `execution-v2/native-manager-consumer.ts:304-357` `deliver` | `binding.lease_id/attempt_id` (`:321`), `bodyDigest(body)` (`:52`), `nativeEpochDigest`, `operationId`, kết quả `sendNativeRead` / `reconcileNativeRead` (`NativeHTTPRecovery`: `state`, `phase`) | Giữ `settled`; **sau** send/recover: `observer.record({...,egress_phase})`. Không đổi thứ tự await, không đổi catch. |
| P7 | `execution-v2/native-manager-consumer.ts:68-69` constructor | — | Tham số optional `cacheObserver?` (mặc định undefined = hành vi y hệt hiện tại). |

Egress/custody **không sửa**: `native-read-egress.ts` (witness `LOCAL_CORE_HTTP_EGRESS_ONLY`,
`:40-73`), `current-human-candidate.ts:1149-1183` (`sendNativeRead`),
`:1203-1306` (`recoverNativeRead`; `evidence_kind` ở `:1272`), `current-human-candidate.sql:40-79,180-185`.
`egress_phase` lấy từ `NativeHTTPRecovery.phase` (SERVED/ABORTED; còn lại UNKNOWN) —
tức witness **đã được ghi vào hàng durable**, không phải suy luận mới.

Đường không qua cache (snapshot profile `serveProfileSnapshot`, STREAM frame) không
có capture => `deliver` không ghi gì; STREAM không có nhánh cache để quan sát.

## 2. Hình dạng record (`portal.native-cache-observation.v1`)

```
schema_version, lease_id, attempt_id, operation_id,
cache_state: HIT|MISS|COALESCED,
cache_identity_mac: hmac-sha256:<64hex>   # HMAC(key, schema\0cache-identity\0 cacheKey)
native_epoch_mac:   hmac-sha256:<64hex>   # HMAC(key, schema\0native-epoch\0 epoch)
body_digest: sha256:<64hex>               # đúng giá trị hàng obligation đã có
egress_evidence_kind: FINAL_HTTP_SEND_COMPLETED|FINAL_HTTP_ABORT_CONFIRMED|NO_FINAL_WITNESS|EGRESS_NOT_OBSERVED_IN_RETURN
egress_semantics: LOCAL_CORE_HTTP_EGRESS_ONLY
```

- Strict zod; thêm field lạ (`base_body`, cookie, token, `bytes`, `*_at_ms`…) => từ chối.
- Khóa 32 B ngẫu nhiên, nằm cạnh log (`observation.key`, 0600), **không bao giờ** vào
  record/log/lỗi. Cùng khóa => cùng cache entry cho cùng MAC (HIT/MISS/COALESCED
  của một entry khớp nhau); revoke đổi epoch => cả hai MAC đổi (logical invalidation,
  không phải xoá vật lý).
- Không có raw cached data, identity, epoch, session, cookie, JWT, URL.

## 3. Lưu trữ / lộ ra cho operator — chọn: JSONL private + CLI

| Phương án | DDL | File dùng chung phải sửa | Nhận xét |
| --- | --- | --- | --- |
| A. Chiếu chỉ-đọc các cột obligation/event/audit hiện có | không | 0 | **Không đủ**: `cache_state`/cache MAC/epoch chưa được lưu ở đâu (xem review: `current-source.proxy.ts:1191` ghi rồi bị bỏ ở DTO). Dùng làm nửa "custody" của receipt (§4 CLI). |
| B. Một bảng append-only trong `elp210_candidate` | **có** | `current-human-candidate.sql` + `current-human-schema.ts` (pin/hash) + candidate.ts + DB đã cài phải áp DDL | Schema candidate là "fresh disposable", đã cài cho acceptance => DDL + re-pin + cài lại. Đắt nhất. |
| **C. JSONL append-only 0600 trong thư mục 0700 + CLI** | **không** | 3 file ở §4 (P1–P7), CLI mới | **Chọn**: ít chạm nhất, không đổi schema/pin đã cài, không route/permission, mặc định tắt. |

CLI `cli/execution-native-cache-observation.ts` (FILE MỚI, ĐÃ LÀM — §8): đọc
`--lease --attempt`, `find()` đúng cặp, SELECT chỉ-đọc **7 cột** obligation
(`lease_id,attempt_id,phase,body_digest,receipt_digest,source_ack_digest,source_reconciled`),
gọi `correlateNativeCacheObservation` (đã có, thuần) => in một receipt
`CORRELATED|MISMATCH`. Không in `base_body`/JWT/cookie; không liệt kê.
Cô lập: không có list/enumerate; chỉ cặp (lease_id, attempt_id) — hai UUID ngẫu nhiên
lấy từ hàng custody — mới tìm được; thư mục/tập tin phải 0700/0600 do chính uid.

## 4. One-writer (Codex ACK 2026-10-21: Claude là người ghi duy nhất của 4 file + CLI; ACK không phải chấp nhận code)

File **mới** (Claude sở hữu, đã commit): `execution-v2/native-cache-observation.ts`,
`test/native-cache-observation.spec.ts`.

File **dùng chung**, một người ghi, theo thứ tự:

1. `execution/current-source.proxy.ts` (P1: 1 import + 3 chỗ) — ai ghi: **Codex** (hoặc Claude nếu Codex trao rõ cho đúng file này).
2. `execution/maximum-data-operation.service.ts` (P3, P4: 1 import + 3 chỗ).
3. `execution-v2/native-manager-consumer.ts` (P5–P7: 1 import, constructor, serve, deliver).
4. Kích hoạt (bước riêng, sau cùng): `execution-v2/native-core-composition.ts:44-59` nhận tham số `cacheObserver?` và nơi gọi `nativeCoreManagerReadConsumer(...)` dựng `FileNativeCacheObservationSink` + `loadNativeCacheObservationKey(dir,true)` từ một thư mục operator cấu hình. **Chưa nằm trong patch**; thiếu bước này patch 1–3 là bất hoạt (`cacheObserver` undefined; capture chỉ là WeakMap).
5. CLI mới `cli/execution-native-cache-observation.ts` — file mới, không tranh chấp.

Không chạm: `current-human-candidate.{ts,sql}`, `native-read-egress.ts`,
`shared-read.repository.ts`, `maximum-data-continuation.repository.ts`, controller,
config.ts, safe DTO, grants, cache key, custody, tài chính.

Một người ghi 1–3 trong **một commit** (3 file kiểu liên kết, type-check cùng nhau).
Đã áp dụng trong các commit ở §8 (không còn là đề xuất); kiểm chứng ở §8–§9.

## 5. Kế hoạch test

Đã có (`test/native-cache-observation.spec.ts`, 26 test, tổng hợp — **chứng minh logic observer, không phải acceptance nối nguồn**):
HIT/MISS/COALESCED từ admission fixture dùng `sharedReadIdentity()` thật; retry sau leader fail là MISS (lặp GET không phải HIT);
revoke/epoch mới => cache key + MAC đổi; MAC có khóa (không chứa identity/epoch/hash không khóa/khóa); khóa yếu bị từ chối;
redaction (field lạ/secret/raw bị từ chối, tên field sạch, không timestamp/bytes); carrier không lộ ra JSON/spread/structuredClone,
one-shot, cô lập giữa hai object; sink chỉ `find` đúng cặp, không enumerate; bound (record, FIFO, file đầy); lỗi sink không throw và không rò;
file sink 0700/0600, từ chối thư mục/khóa lỏng; receipt `CORRELATED|MISMATCH` (lease khác, body khác, phase mâu thuẫn, cột lạ bị từ chối).

Sau khi Codex OK (chạy trong lane của họ):
- proxy spec: `request()` cho CACHE_HIT/FOLLOWER/LEADER => `takeCacheBranch` ra HIT/COALESCED/MISS với `cacheKey` đúng; DTO byte-giống trước/sau.
- service spec: native page trả `cacheBranch`; legacy `deploymentPage/relationPage` công khai không đổi.
- consumer spec: `cacheObserver` undefined => hành vi byte-giống; có observer + sink ném lỗi => response/ custody không đổi; record sau recover (SERVED/ABORTED/UNKNOWN).
- Acceptance nối nguồn thật: **NOT_RUN** cho đến khi có receipt thật (HIT thật cần hai request cùng epoch trong TTL cache).

## 6. Giới hạn trung thực

- `FINAL_HTTP_SEND_COMPLETED` = egress cục bộ Core, **không** là browser ACK.
- Không lưu timestamp, byte count, thời điểm ghi vật lý: chưa có acceptance case nêu tên cần chúng; `body_digest` đã ràng buộc byte, thời điểm DB là phase, không phải ghi vật lý. Nếu một case cần, thêm là bước riêng có tên case.
- Record ghi **sau** send: crash giữa send và record mất record (observation, không phải custody). Custody/recovery không phụ thuộc nó.
- Revoke = invalidation logic (epoch đổi), không phải xoá vật lý.
- Nếu `relationFor*Operation` bọc lại response (hiện `return this.request(...)` trực tiếp ở các call-site đã xem) thì carry no-op => không có record, không bao giờ record sai.

## 7. Patch đề xuất cho file dùng chung — ĐÃ ÁP DỤNG

Patch gốc (diff đề xuất ở lượt trước) đã được áp dụng, có chỉnh sửa theo P22-1, trong các commit ở §8. Diff không còn
được chép ở đây để tránh hai bản lệch nhau; xem `git show` của các sha ở §8. Khác biệt so với đề xuất gốc:

- consumer không còn `settled?.state==="TERMINAL"?settled.phase:"UNKNOWN"`; dùng `egressPhaseOfRecovery(settled)` (P22-1);
- `settled` được gán cả ở nhánh `catch` từ `reconcileNativeRead(...).catch(()=>undefined)` — thứ tự await không đổi;
- `record(...)` được bọc thêm `.catch(()=>undefined)` (phòng thủ; `record` vốn không ném);
- `nativeCoreManagerReadConsumer(..., realtime?, cacheObserver?)` nhận observer tùy chọn; **không ai truyền** (không sửa `app.module.ts`).

## 8. Lượt 2026-10-21 (sau Codex review) — thay đổi, commit, kiểm chứng

| # | Việc | Commit |
| --- | --- | --- |
| 1 | P22-1 + P22-2 (module thuần + test) | `8de1e50f` |
| 2 | Wiring 4 file dùng chung (proxy, service, consumer, composition) | `3580ef8e` |
| 3 | CLI operator riêng + join có chặn + test CLI + test wiring thật | `fdcaf69f` |
| 4 | Receipt này | commit docs ngay sau (tip nhánh) |

### P22-1 — RECONCILED không phải "không có witness"

`current-human-candidate.ts:1358–1360/1221/1261` trả `RECONCILED` **không có phase** sau khi ghi source ACK thật. Cách sửa:

- `egressPhaseOfRecovery(ret)` ánh xạ đúng 4 hình dạng `NativeHTTPRecovery`: `TERMINAL`+`SERVED|ABORTED` -> witness có tên;
  `UNKNOWN|UNSENT_FENCED` -> `NO_FINAL_WITNESS` (chưa chốt, nói rõ); `RECONCILED`, return rỗng/không biết -> **`EGRESS_NOT_OBSERVED_IN_RETURN`**
  (không khẳng định gì). Không đọc `context`/`terminal`, không tạo/sửa custody.
- Join operator: **bảng durable là nguồn quyết định** SERVED/ABORTED. `EGRESS_NOT_OBSERVED_IN_RETURN` + durable SERVED/ABORTED -> `CORRELATED`
  (`durable_egress` ghi rõ); + hàng chưa terminal -> `durable_egress: NO_TERMINAL`. Terminal durable thiếu `receipt_digest` -> MISMATCH (mọi loại witness).
- Vẫn từ chối: lease/attempt khác, `body_digest` khác/NULL, `FINAL_HTTP_SEND_COMPLETED` vs durable ABORTED/UNKNOWN (và ngược lại),
  `NO_FINAL_WITNESS` mà durable đã terminal (giữ nghĩa "unsettled": một quan sát UNKNOWN sau đó thành SERVED sẽ báo MISMATCH — cố ý, xem §6).
- `schema_version` của record vẫn `v1`: enum chỉ được mở rộng thêm một giá trị và chưa có record nào được ghi ở đâu (không cài runtime).

### P22-2 — đọc có chặn, trên descriptor đã mở

- Key: `fstat` trên fd -> đúng 32 byte **trước** khi đọc; đọc tối đa 33 byte (`readDescriptorBounded`), 33+ -> từ chối. Key sai cỡ/oversize **không bị thay, cắt hay mint lại** (test kiểm nội dung file nguyên vẹn, cả `create=true`).
- Log: `fstat` <= 1 MiB trước khi đọc; đọc tối đa cap+1 byte nên log phình sau `fstat` không vượt cap; log > cap -> `LOG_OVERSIZE`, **không xoá/cắt/xoay**; log đầy đúng cap vẫn đọc được, `append` bị từ chối (`LOG_FULL`).
- Giữ: file thường, `O_NOFOLLOW`, đúng uid, không quyền group/other, **thêm `nlink===1`** (hard link bị từ chối). Mở log thất bại không phải `ENOENT` (symlink...) -> từ chối thay vì "rỗng". Dòng hỏng bị bỏ qua, không rò nội dung.
- Chế độ đọc operator `new FileNativeCacheObservationSink(dir,{create:false})` / `loadNativeCacheObservationKey(dir,false)` **không tạo thư mục**.

### Wiring (4 file ACK) — cái gì đổi, cái gì không

- `current-source.proxy.ts`: 3 chỗ `return noteCacheBranch(composedResponse(...), {cache_state, cache_identity: shared.cacheKey})` (HIT/COALESCED/MISS). Không vào JSON, cache value, cache key, scope.
- `maximum-data-operation.service.ts`: `carryCacheBranch(response,dto)` ở `prepareDeploymentData/prepareRelationData`; `prepareNativeManagerPage` trả thêm `cacheBranch: takeCacheBranch(dto)` (one-shot).
- `native-manager-consumer.ts`: tham số constructor `cacheObserver?` (undefined = hành vi cũ); `deliver` ghi **sau** send/recover.
- `native-core-composition.ts`: `nativeCoreManagerReadConsumer(...,realtime?,cacheObserver?)` chuyển tiếp. **Không** sửa `app.module.ts`: không có runtime installation.
- Không chạm: `current-human-candidate.*`, `native-read-egress.ts`, `shared-read.repository.ts`, continuation repo, controller, config, DTO an toàn, grants, SQL/schema custody, `access.service.ts`, `current-human-mutations.ts`, `manager-domain-successor.ts`, `cli/execution-native-successor.ts` (đường dành riêng của Codex).

### CLI operator `cli/execution-native-cache-observation.ts`

`--dir <abs 0700> --lease <uuid> --attempt <uuid>`; **không** có list/enumerate/search/range, không route/permission/field browser, không ghi, **không nạp MAC key**.
Một `SELECT` chỉ đọc 7 cột (`NATIVE_CACHE_OBLIGATION_COLUMNS`) với `lease_id=$1 AND attempt_id=$2`, trong `BEGIN READ ONLY`, cùng pool profile hash-pinned + kiểm schema đã đăng ký như các tool native offline khác
(`nativeResearchReview` + `PORTAL_ENV=local` + `AUTH_MODE=dev`). In một receipt: `CORRELATED|MISMATCH`, hoặc `NO_OBSERVATION` / `NO_CUSTODY_ROW` (nói thẳng là không chứng minh gì về cache).

### Test (không PG)

- `test/native-cache-observation.spec.ts` 42 test (26 cũ + 16: hình dạng RECONCILED thật join SERVED/ABORTED/non-terminal, UNKNOWN/UNSENT giữ nghĩa, lệch digest/lease/attempt, key/log oversize, growth sau fstat, symlink/hard link, log đầy).
- `test/native-cache-observation-wiring.spec.ts` 28 test trên **code thật** proxy `request()` + service + consumer (double chỉ ở: shared-read repo, transport h2, pool/READ evaluation, Candidate):
  HIT/COALESCED/MISS từ nhánh admission thật + cache key thật; lặp GET không phải HIT; DENIED/leader lỗi không ghi gì; response **byte-giống** có/không ghi nhánh; scope/cache key không thêm trường; service trả `cacheBranch` ngoài DTO; DTO byte-giống public `deploymentPage`;
  consumer: record đúng lease/attempt/body digest/MAC cache + epoch, ánh xạ cả 5 hình dạng return, lỗi send -> dùng return của recovery (recovery ném -> not-observed), thứ tự acquire -> send -> recovery -> observer, observer vắng/ném/reject không đổi gì, bốn request đồng thời cô lập, log không chứa secret.
  Đã kiểm chứng không vacuous: đổi nhãn COALESCED trong proxy làm 4 test đỏ.
- `test/native-cache-observation-cli.spec.ts` 20 test: argv, SQL đúng 7 cột/không `*`/không LIMIT, join, NO_OBSERVATION không chạm DB, NO_CUSTODY_ROW không tổng hợp, cột lạ bị từ chối, file sink chế độ đọc, bề mặt không list/key/write.
- Spec sẵn có của file đã chạm (non-PG), xanh: `execution-current-source`, `native-manager-preparation`, `eds11r-manager-relation-bff`, `eds11r-market-context`, `elp210-core009-composition-identity`, `elp210-native-core-runtime`, `native-profile-realtime-mount`, `native-core-bootstrap`, `elp2-stream-boundary` (9 file, 155 test). `--maxWorkers=1`, không lock.

## 9. NOT_RUN / dành cho lead

- Spec cần PG thật chạm 4 file (lead chạy trong lane có PG): `maximum-data-operation.spec.ts`, `profile-projection.spec.ts`, `elp210-native-frame-coupled.spec.ts`, `eds11r-rich-screen-warmup.spec.ts`, `elp205-current-page.spec.ts`,
  `elp204-account-policy-capture.spec.ts`, `elp204-account-sync-capture.spec.ts`, `elp204-heartbeat-capture.spec.ts`, `elp204-bracket-capture.spec.ts` (+ `elp2-product-read.fixture.ts` dùng chung); cache thật: `execution-shared-admission.spec.ts`, `execution-shared-read-cache-maintenance.spec.ts`.
- Chưa chạy: CLI với DB thật (SELECT/READ ONLY/schema assert), HIT thật qua hai request cùng epoch trong TTL cache, egress thật. Acceptance nối nguồn = **NOT_RUN** cho tới khi có receipt thật.
- Chưa có người cài observer vào runtime (cố ý). Muốn bật: dựng `loadNativeCacheObservationKey(dir,true)` + `FileNativeCacheObservationSink(dir)` + `new NativeCacheObserver(key,sink)` ở nơi gọi `nativeCoreManagerReadConsumer`, thư mục 0700 do operator cấu hình — bước riêng, có tên case.
