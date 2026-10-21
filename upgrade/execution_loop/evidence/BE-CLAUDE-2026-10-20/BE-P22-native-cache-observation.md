# BE-P22 — Quan sát cache native riêng tư (operator-only)

Ngày 2026-10-21. Nhánh `claude/post-freeze-20261021`. Trả lời mục "Small request
to Claude — private observation only" trong
`ELP2-10/CORE009_NATIVE_OBSERVATION_REVIEW_AND_CLAUDE_REQUEST_2026-10-21.md`.
Trạng thái: **DESIGN + phần thuần đã làm; wiring vào file dùng chung = ĐỀ XUẤT,
CHƯA ÁP DỤNG, chờ Codex one-writer OK.** Không DB/Docker/hook/lock đã chạy.

## 0. Tóm tắt

- Mỗi request native finite READ sinh **một record** ≤ 768 B: `cache_state`
  (HIT/MISS/COALESCED thật từ nhánh `shared.kind`), MAC có khóa của cache key,
  MAC có khóa của native epoch, `lease_id`/`attempt_id`, `body_digest` hiện có,
  và **tên** witness egress hiện có (`FINAL_HTTP_SEND_COMPLETED` /
  `FINAL_HTTP_ABORT_CONFIRMED` / `NO_FINAL_WITNESS`).
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
egress_evidence_kind: FINAL_HTTP_SEND_COMPLETED|FINAL_HTTP_ABORT_CONFIRMED|NO_FINAL_WITNESS
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

CLI `cli/execution-native-cache-observation.ts` (FILE MỚI, bước sau): đọc
`--lease --attempt`, `find()` đúng cặp, SELECT chỉ-đọc **6 cột** obligation
(`lease_id,attempt_id,phase,body_digest,receipt_digest,source_ack_digest,source_reconciled`),
gọi `correlateNativeCacheObservation` (đã có, thuần) => in một receipt
`CORRELATED|MISMATCH`. Không in `base_body`/JWT/cookie; không liệt kê.
Cô lập: không có list/enumerate; chỉ cặp (lease_id, attempt_id) — hai UUID ngẫu nhiên
lấy từ hàng custody — mới tìm được; thư mục/tập tin phải 0700/0600 do chính uid.

## 4. Đề xuất one-writer (cần Codex OK trước khi chạm)

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
Patch dưới đây `git apply --check` sạch trên cây này và đã type-check sạch trên bản sao scratch ngoài repo (tsc scoped 3 file); chưa chạy test hiện có của các file đó.

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

## 7. Patch đề xuất cho file dùng chung (unified diff — KHÔNG ÁP DỤNG)

Gốc: `claude/post-freeze-20261021` @371224f0. Áp bằng `git apply` từ gốc repo bởi người ghi duy nhất.

```diff
--- a/apps/control-api/src/execution/current-source.proxy.ts
+++ b/apps/control-api/src/execution/current-source.proxy.ts
@@ -21,6 +21,7 @@
   SharedReadCacheValue,
   SharedReadScope,
 } from "./shared-read.repository";
+import { noteCacheBranch } from "../execution-v2/native-cache-observation";
 
 export const CURRENT_SOURCE_ENVIRONMENTS = ["paper", "sandbox", "live", "canary"] as const;
 export type CurrentSourceEnvironment = (typeof CURRENT_SOURCE_ENVIRONMENTS)[number];
@@ -1038,10 +1039,10 @@
     const shared = await this.sharedReads.begin(scope);
     if (shared.kind === "CACHE_HIT") {
       this.increment(profile.profileId, "cacheHits", telemetryOperationId);
-      return this.composedResponse(
+      return noteCacheBranch(this.composedResponse(
         requestedEnvironment, sourceEnvironment, screenId, profile.profileId,
         shared.value, "HIT", gatewayContext,
-      );
+      ), { cache_state: "HIT", cache_identity: shared.cacheKey });
     }
     if (shared.kind === "FOLLOWER") {
       this.increment(profile.profileId, "coalescedFollowers", telemetryOperationId);
@@ -1051,10 +1052,10 @@
           availability: "DEGRADED", retryable: false,
         });
       }
-      return this.composedResponse(
+      return noteCacheBranch(this.composedResponse(
         requestedEnvironment, sourceEnvironment, screenId, profile.profileId,
         value, "COALESCED", gatewayContext,
-      );
+      ), { cache_state: "COALESCED", cache_identity: shared.cacheKey });
     }
     if (shared.kind === "DENIED") {
       this.increment(profile.profileId, "admissionDenied", telemetryOperationId);
@@ -1131,10 +1132,10 @@
       }
       const value = await this.sharedReads.complete(scope, shared, source);
       sharedCompleted = true;
-      return this.composedResponse(
+      return noteCacheBranch(this.composedResponse(
         requestedEnvironment, sourceEnvironment, screenId, profile.profileId,
         value, "MISS", gatewayContext,
-      );
+      ), { cache_state: "MISS", cache_identity: shared.cacheKey });
     } finally {
       release();
       if (!sharedCompleted) {
--- a/apps/control-api/src/execution/maximum-data-operation.service.ts
+++ b/apps/control-api/src/execution/maximum-data-operation.service.ts
@@ -34,6 +34,7 @@
 } from "./eds11r-manager-relation.registry";
 import { MAXIMUM_DATA_INTAKE_V1, MaximumDataEnvironment } from "./maximum-data-intake";
 import { managerTimestamp } from "./manager-timestamp";
+import { carryCacheBranch, takeCacheBranch } from "../execution-v2/native-cache-observation";
 
 // The continuation repository emits mdc1. plus a UUID (41 ASCII bytes).
 // Reserve exactly that public size before persisting a private source cursor.
@@ -145,7 +146,9 @@
       { limit: query.limit, ...(sourceCursor ? { cursor: sourceCursor } : {}) },
       maximumDataDeploymentPolicy(query.environment),
     );
-    return this.translateDeploymentPage(response, query, scope);
+    const dto = await this.translateDeploymentPage(response, query, scope);
+    carryCacheBranch(response, dto); // in-process only; never part of the DTO
+    return dto;
   }
 
   /**
@@ -186,7 +189,9 @@
       managerRelationOperationPolicy(operation, query.environment),
       { limit: query.limit, ...(sourceCursor ? { cursor: sourceCursor } : {}) },
     );
-    return this.translateRelationPage(response, operation, query, scope, binding.profileId);
+    const dto = await this.translateRelationPage(response, operation, query, scope, binding.profileId);
+    carryCacheBranch(response, dto); // in-process only; never part of the DTO
+    return dto;
   }
 
   /** PRIVATE selected consumer preparation. Genuine selected source and actual
@@ -246,7 +251,7 @@
     const privatePrincipal={...principal,nativeEpochDigest};
     const dto=operation.kind==="DEPLOYMENTS"?await this.prepareDeploymentData(privatePrincipal,query):
       await this.prepareRelationData(privatePrincipal,relation!,query);
-    return {decision,dto,nativeEpochDigest};
+    return {decision,dto,nativeEpochDigest,cacheBranch:takeCacheBranch(dto)};
   }
 
   private async authorizeOperation(principal: MaximumDataOperationPrincipal, operation: ManagerRelationOperation,
--- a/apps/control-api/src/execution-v2/native-manager-consumer.ts
+++ b/apps/control-api/src/execution-v2/native-manager-consumer.ts
@@ -31,6 +31,7 @@
 import { nativeProfileRealtimeHeaders,type ScopedReplayBinding,type NativeProfileRealtimeHeaders } from "./realtime.contract";
 import type { ExecutionProfileProjectionRepository } from "../execution/profile-projection.repository";
 import type { ExecutionProfileRealtimeService } from "../execution/profile-realtime.service";
+import type { NativeCacheBranchCapture, NativeCacheObserver } from "./native-cache-observation";
 
 type Composition = Pick<Awaited<ReturnType<typeof composeNativeCore>>, "selectedCandidate">;
 type Selection = ReturnType<typeof selectedNativeBusinessReadSelection>;
@@ -66,7 +67,8 @@
   private realtimePreparationIdle=Promise.resolve();
   private resolveRealtimePreparationIdle?:()=>void;
   constructor(private readonly pool:Pool, private readonly operations:MaximumDataOperationService,
-    private readonly composition:Composition, selections:readonly NativeCoreSelection[], realtime?:NativeManagerRealtimeOptions) {
+    private readonly composition:Composition, selections:readonly NativeCoreSelection[], realtime?:NativeManagerRealtimeOptions,
+    private readonly cacheObserver?:NativeCacheObserver) {
     if(selections.length<1||selections.length>64)throw unavailable();
     const entries:Entry[]=[],keys=new Set<string>();
     for(const entry of selections){
@@ -143,12 +145,12 @@
     const actor:AccessActor={user_id:principal.user.userId,session_id:principal.session.sessionId,
       session_generation:principal.session.sessionVersion};
     // Genuine DB authority, not a DTO/config/nativeEpochDigest authorization.
-    const {decision,dto,nativeEpochDigest}=await this.operations.prepareNativeManagerPage(
+    const {decision,dto,nativeEpochDigest,cacheBranch}=await this.operations.prepareNativeManagerPage(
       this.pool,principal,operation,query,entry.selectedSource);
     if(decision.actor.user_id!==actor.user_id||decision.actor.session_id!==actor.session_id||
       decision.actor.session_generation!==actor.session_generation||
       decision.field_policy_sha256!==entry.source.domain.field_policy_sha256)throw denied();
-    return this.deliver(entry,candidate,principal,query,decision,nativeEpochDigest,selected.operation_id,dto,reply);
+    return this.deliver(entry,candidate,principal,query,decision,nativeEpochDigest,selected.operation_id,dto,reply,cacheBranch);
   }
 
   /** Same captured snapshot -> READ-baseline token, not an app STREAM grant.
@@ -302,7 +304,7 @@
   }
   private async deliver(entry:Entry,candidate:ReturnType<Composition["selectedCandidate"]>,principal:MaximumDataOperationPrincipal,
     query:MaximumDataDeploymentQuery,decision:ManagerDomainReadDecision,nativeEpochDigest:string,
-    operationId:string,dto:unknown,reply:FastifyReply):Promise<boolean>{
+    operationId:string,dto:unknown,reply:FastifyReply,cacheBranch?:NativeCacheBranchCapture):Promise<boolean>{
     const actor:AccessActor={user_id:principal.user.userId,session_id:principal.session.sessionId,
       session_generation:principal.session.sessionVersion};
     if(decision.actor.user_id!==actor.user_id||decision.actor.session_id!==actor.session_id||
@@ -337,15 +339,21 @@
     // No Nest/Fastify automatic writer can reply after uncertain admission.
     // hijack itself emits zero HTTP bytes. Candidate owns final physical send.
     reply.hijack();
+    let settled:Awaited<ReturnType<typeof candidate.sendNativeRead>>|undefined;
     try{
       const handle=await candidate.acquireNativeRead(actor,base,decision.scope_digest);
-      await candidate.sendNativeRead(handle,reply.raw,body);
+      settled=await candidate.sendNativeRead(handle,reply.raw,body);
     }catch{
       // Same durable key/recovery owner. Never ordinary error JSON, response
       // replay, fake terminal, TTL-as-closure or a fallback after admission.
       reply.raw.destroy();
-      await candidate.reconcileNativeRead(base.binding.lease_id).catch(()=>undefined);
+      settled=await candidate.reconcileNativeRead(base.binding.lease_id).catch(()=>undefined);
     }
+    // Private observation AFTER delivery/recovery: best effort, never throws,
+    // never changes the response or any custody state.
+    if(this.cacheObserver&&cacheBranch)await this.cacheObserver.record({lease_id:binding.lease_id,
+      attempt_id:binding.attempt_id,operation_id:operationId,capture:cacheBranch,native_epoch_digest:nativeEpochDigest,
+      body_digest:bodyDigest(body),egress_phase:settled?.state==="TERMINAL"?settled.phase:"UNKNOWN"});
     return true;
   }
   private operation(operation:NativeManagerOperation,environment:"paper"|"sandbox"|"live"){
```
