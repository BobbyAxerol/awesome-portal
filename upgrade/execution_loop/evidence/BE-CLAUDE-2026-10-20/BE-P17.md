# BE-P17 — ELP2-09 realtime scoped `alpha_fleet_overview`: snapshot + SSE publish được thật (Claude, backend/contracts/FE reader, 2026-10-20)

Base `6d87825b` (`claude/fe-parity`), nhánh `claude/be-elp2-09-realtime-scoped`, worktree riêng. Tier **R3 focused** (rules §10.10): generators `--check`, vitest non-PG (control-api, contracts, FE readers/fixtureBff), `tsc`. Hook đầy đủ **NOT_RUN**. Spec PG viết, **NOT_RUN** (không Docker). Không đụng Core009 (`core009-preparation`, `current-human-*`, `native-*`), không đổi `realtime.ts`/`realtime.contract.ts`/`scoped-replay-cursor.ts`, không migration, không cờ, không cấu hình.

Đóng dòng "Realtime source (ELP2-09 scoped)" của `HANDOFF_TO_CODEX.md` §10 ở mức **hợp đồng + dịch vụ + reader + double**. Chưa đóng: nguồn Edge (xem §6), nghiệm thu kết nối thật, đo số sản xuất (ELP2-10 M-n).

Commits: `d50012c6` (backend + contracts + spec), `4a0195a8` (FE reader + double + fixtureBff), `812160c3` (re-pin `contracts-snapshot.json` bằng `snapshot.py`, commit riêng để bỏ/sinh lại khi xung đột), commit chứa ledger này.

## 1. Đã publish (generated, qua generator)

| Thứ | Giá trị |
| --- | --- |
| Dataset | `alpha_fleet_overview` (tên thứ hai của DTO, `execution_profile_observation`, **đã** publish bằng header native + `profiles/{environment}/stream` — Core009, không lặp lại ở đây) |
| `GET /api/v1/execution/manager/fleet/realtime-snapshot` | `executionAlphaFleetRealtimeSnapshotGetV1` — barrier baseline của `GET /manager/fleet` |
| `GET /api/v1/execution/manager/fleet/stream` | `executionAlphaFleetRealtimeStreamGetV1` — `text/event-stream` của `ScopedRealtimeFrame` **nguyên bản** (không dialect thứ hai) |
| Artifact | `openapi/execution-alpha-fleet-realtime.openapi.json`, `schemas/…v1.schema.json`, `generated/…d.ts`, fixtures `…synthetic.valid.json` (5 snapshot + 8 wire) và `…synthetic.negative.json` (28 ca), mọi ca được **validator thật của producer** chứng minh trước khi ghi |
| Generator | `tooling/generate-execution-alpha-fleet-realtime.mjs` (chain sau `generate:execution-scoped-realtime`; `verify-generated.sh`, `snapshot.py` TRACKED, `contracts-test.sh` copy list đã thêm). `execution-scoped-realtime.openapi.json` giữ `paths={}` (handoff schema-only) — spec cũ khẳng định điều đó |

Snapshot (`portal.execution.alpha-fleet-realtime-snapshot.v1`, không có số tiền): `scope_fingerprint`, `baseline{revision, projection_generation, source_epoch, ordinal(chuỗi thập phân ≤19 số), catalogue_digest}`, `named_snapshot{executionManagerFleetGetV1, lineage_revision}` (bắt buộc bằng `baseline.revision` = `lineage.revision` của fleet read), `source{notice_origin: PORTAL_PUBLICATION_REVISION, edge_notice_source: NOT_COMMISSIONED, qualification: SOURCE_VERIFIED}`, `stream` = `AVAILABLE{resume_cursor, heartbeat_interval_ms, replay_window_ms, max_frame_bytes≥8192, max_streams_per_session}` | `UNAVAILABLE{reason_code ∈ WHOLE_FLEET_AUTHORITY_REQUIRED, STREAM_AUTHORITY_NOT_GRANTED, STREAM_CAPACITY_REACHED; resume_cursor:null}`, `quality` (của barrier, không phải của số liệu).

## 2. Giới hạn: đặt ở đâu, test ở đâu (`be-p16-alpha-fleet-realtime.spec.ts`, 50 ca)

| Ràng buộc | Cơ chế (có sẵn, tái dùng) | Chứng minh |
| --- | --- | --- |
| Không start-at-head | không cursor → 1 frame `resync_required/SNAPSHOT_REQUIRED` rồi đóng | "never starts at head" |
| Cursor | token `sr1` mã hoá, độ dài cố định ≤4096, hết hạn = replay window ≤300 s, buộc actor/session/policy/field policy/model/query/source set/epoch/generation/baseline | hết hạn, giả mạo, khác actor, khác env, khác policy → `resync_required/CURSOR_INVALID_OR_EXPIRED` |
| Ordinal | coordinate `mf1.` (epoch/generation băm, baseline, after); mỗi revision đẩy đúng 1 ordinal; thủng/lùi → `SOURCE_COVERAGE_UNPROVED`; epoch/generation/catalogue đổi → `GENERATION_CHANGED` (resync, không phải revoke) | gap, head lùi, 3 kiểu đổi lineage, replay `Last-Event-ID` chỉ trả phần thiếu |
| Heartbeat | Hub phát `heartbeat` mỗi poll không đổi (token xoay), `quality:null`; poll 5 s | frame đầu = heartbeat, không lặp revalidate |
| Revoke recheck | Hub resolve scope MỚI trước mỗi lần đọc nguồn và trong giao dịch DB `stream.subscribe` trước mỗi lần ghi; `revokeSession` chỉ là gợi ý purge | revoke sau open, đổi identity giữa fence đọc/ghi: 0 byte sau đó; `revokeSession` purge tức thì, không đụng session khác |
| Cap toàn sản phẩm | **một** Hub/process: `maximumClients 256`, entries 8, frame 16 KiB, client 64 KiB, tổng 16 MiB, 50 notice/lần, timeout đọc 5 s (ngân sách đã test, **không phải SLA/default sản xuất**); `max_streams_per_session` 4 (đặt chỗ trước await) | cap session, mở đồng thời không vượt cap, client N+1 bị từ chối |
| Eviction | client chậm/vượt entries/bytes → `resync_required/SLOW_CLIENT`; socket đóng; shutdown → `unavailable/STOPPED` | mỗi đường thoát trả `clients=0, queued_bytes=0, sessions=0, tracked_identities=0, timer=false` |
| Không timer khi rảnh, không poll chồng | timer chỉ khi có client; tick gặp poll đang chạy thì join | fake timers + nguồn chậm |
| Coalesce | N browser cùng scope = 1 lần đọc nguồn/tick | 5 client → `rowCalls=1` |
| no-store | `Cache-Control: private, no-store` mọi response, `X-Accel-Buffering: no` | controller spec + OpenAPI spec |
| Scope fingerprint | `scopeRealtimeIdentity` (không đổi theo revision tài liệu, đổi theo actor/session/policy/grant/resource) | PG spec §5 |
| Lỗi sau khi stream mở | luôn là frame terminal (EventSource không đọc được body lỗi); lỗi trước đó là HTTP 400/404/503 | controller spec |
| Khởi động | Hub/codec dựng lười: thiếu khoá ký không làm hỏng boot, chỉ fail-closed riêng dataset này | "boot" spec |

## 3. Nguồn thật vs. không bịa (ghi rõ)

Tín hiệu duy nhất có thứ tự bền cho dataset này hôm nay là **log revision của Manager** (`execution_manager_model_revisions`, `source_sequence` dày do `MANAGER_CHECKPOINT_GAP`). Notice = "có revision mới cùng generation". Không số, không delta, không khẳng định gì về thị trường/lệnh/TS; `quality`: `PARTIAL/UNKNOWN/AUTHORIZED_ONLY/source_as_of_ms:null/PROVISIONAL`, lý do `PORTAL_PUBLICATION_REVISION_NOTICE, NO_EDGE_NOTICE_SOURCE, SOURCE_FRESHNESS_NOT_ATTESTED`. `edge_notice_source` là **literal** `NOT_COMMISSIONED`: khi Edge cấp nguồn notice, đổi contract (version) và thay adapter sau cùng port `ScopedNoticeSource`; không trộn. Revision `TEST_ONLY` không bao giờ thành baseline (đọc scalar `payload->>'qualification'`, không tải payload).

## 4. Quyết định cần review (Codex review backend; lead chốt)

1. **Stream chỉ cho whole-fleet.** Cần business read toàn dân số tại **một** ROOT duy nhất (`ExecutionReadScopes.authorizeFleetRoot`, mới, cộng thêm) **và** grant `stream.subscribe` tại ROOT. Người xem một phần (researcher) nhận baseline + `UNAVAILABLE/WHOLE_FLEET_AUTHORITY_REQUIRED`: thông báo "fleet đổi" toàn cục sẽ lộ hoạt động của peer ẩn. Mở cho người xem một phần cần notice đã lọc theo scope — thuộc nguồn (Edge/SRC), không phải bước giả ở Portal.
2. Hôm nay chưa có grant `stream.subscribe` nào → mọi người xem root nhận `STREAM_AUTHORITY_NOT_GRANTED`: route mounted nhưng **tối** cho tới khi policy cấp STREAM.
3. `revokeSession` chưa nối vào chỗ gọi revoke nào (độ trễ thực = 1 chu kỳ poll, ≤5 s, nhờ fence mỗi poll/mỗi ghi).
4. Cap là **per process**; triển khai nhiều instance nhân cap lên N lần. Số sản xuất (clients, cadence) cần đo M-n ELP2-10, chưa bịa.
5. `max_frame_bytes` tối thiểu 8192: một frame mang token cố định ~3.8 KB.

## 5. Gates (chạy thật)

| Gate | Kết quả |
| --- | --- |
| `be-p16-alpha-fleet-realtime.spec.ts` (control-api, thật Hub/codec/source/service/controller, double ở 2 biên I/O) | 50/50; kèm `elp209-realtime`, `be-p4-manager-series`, `elp2-manager-reads`, `elp206-manager-service` xanh (228 pass, 87 skip PG) |
| contracts vitest toàn bộ (`--maxForks=2`) | 90 file, 1565 test xanh; `generate-execution-alpha-fleet-realtime.mjs --check` và `generate-execution-scoped-realtime.mjs --check` sạch; d.ts khớp `openapi-typescript` |
| FE `alphaFleetRealtime.conformance.test.ts` (L0–L3: ma trận 512 trạng thái so với schema, biên số, 20 000 lần đọc, 70 000 ký tự, 433 + 353 ca âm sinh tự động (reader nhận 0/703 payload schema-invalid), wire SSE) | 1362/1362; `scopedRealtime.conformance` + toàn bộ `readers/ realtime/ screens/slice/ testkit/` xanh (67 216), 1 ca `commandCatalogue` L3 quá 20 s khi tải nặng, chạy riêng 6662/6662 |
| FE fixtureBff (`fleetRealtime.test.ts` 24 ca + `server.test.ts` 177 ca qua HTTP thật, header lane `FIXTURE_LAB`) | xanh; `ROUTES.md` sinh bằng `FIXTURE_BFF_WRITE_ROUTES=1` |
| `tsc --noEmit` control-api (src+test) và FE | không lỗi mới ở file của gói (lỗi cũ ngoài phạm vi: `toHaveBeenCalledExactlyOnceWith`, `uplot`/`mermaid` thiếu trong worktree) |
| `scripts/refresh-release-integrity-ledgers.sh --check` | sạch (không file nào bị N29/EDS-12 pin bị đổi) |

## 6. Spec PG — đã viết, CHƯA chạy (lead chạy khi có Docker)

- `apps/control-api/test/be-p16-alpha-fleet-realtime.pg.spec.ts` — SQL thật: `revisionMetadataAfter` (tăng dần, bound, không payload, đúng 1 (epoch, generation), số lớn 19 chữ số), `revisionQualification`, `ManagerFleetNoticeSource` trên repository thật (dày, thủng, đổi generation, head lùi). DB dùng một lần, tên có kiểm tra regex trước `DROP`.
- 5 ca `BE-P16` cuối `apps/control-api/test/elp2-read-scope.spec.ts` — authority thật: `authorizeFleetRoot` (ROOT duy nhất, `stream.subscribe` là grant riêng, người xem một phần = 404), `ScopesFleetAuthority.snapshot` (3 lý do UNAVAILABLE + eligible), guard chặn sau revoke (0 byte), lineage đổi = `GENERATION_CHANGED`, identity ổn định theo revision tài liệu.
- Rủi ro đã biết khi chạy lần đầu: các ca authority dùng đường `business.read_all` + `requireWholePopulation` + `resource: ROOT` (đã đọc code ở `read-scope.ts`, chưa chạy); nếu fixture `full` không cho `wholePopulation` thì 404 trước.

## 7. FE + double

- `v2/readers/alphaFleetRealtime.ts`: reader đóng, tổng thể (không throw): snapshot (AF-1 ghép revision, AF-2 ordinal chuỗi, AF-3 không cursor khi UNAVAILABLE, AF-4 `UNSUPPORTED_SOURCE`, AF-S1…S4) + SSE (`readFleetSseBlock/Event`: id = cursor trên frame sống, không id trên frame terminal, `event` = `event_type`, chỉ `id/event/data`, delegate `readScopedRealtimeFrame`) + adapter (`baselineOf` cho `scopedStreamMachine`, `pairBaselineWithFleet`, `scopeChanged`). Không transport, không timer, không đổi màn hình. Thêm 2 export vào `scopedRealtime.ts` (`readQuality`, `readScopedCursor`); `scopedRealtime.conformance` bỏ qua họ fixture mới trong phép thử "không họ nào khác đọc thành frame" (cùng frame, cùng contract).
- Double `e2e/bffDoubleManager.ts` (`answerManagerFleetRealtime`), phục vụ qua `apps/portal/fixture-bff` với header `X-Fixture-Lane: FIXTURE_LAB`: snapshot ghép đúng `lineage.revision` của fleet double; stream là **body hữu hạn** (lane fixture không giữ kết nối), chọn biến thể bằng `workspace_id=ws_TEST_FLEET_RT_*`, chỉ đọc `?cursor=` (không đọc header `Last-Event-ID`). Không phải bằng chứng nghiệm thu.
- Chưa làm (cố ý): nối reader vào màn Fleet/Command; EventSource thật; baseline visual.

## 8. Nợ / việc tiếp (cho lead)

1. Chạy 2 spec PG ở §6; hook R2/R3 ở commit đích.
2. Edge: nguồn notice đã lọc theo scope cho người xem một phần (SRC), rồi mới mở `WHOLE_FLEET_AUTHORITY_REQUIRED`.
3. Policy: cấp `stream.subscribe` tại ROOT cho principal cần stream; nếu muốn stream cho role khác, phải quyết định riêng.
4. ELP2-10 M-n: đo cadence/clients trước khi coi 256/5 s là cấu hình.
5. Gọi `AlphaFleetRealtimeService.revokeSession` từ đường revoke/đăng xuất nếu muốn purge dưới 1 chu kỳ poll.
6. Cập nhật dòng §10 của `HANDOFF_TO_CODEX.md` (chủ: lead) theo gói này.

## 9. Receipt CR-01 (2026-10-21) — baseline ghép đúng với Fleet read thật

Codex review `ELP2-10/CODEX_CLAUDE_PRODUCER_REVIEW_2026-10-21.md` CR-01: `named_snapshot.lineage_revision` là head thô trong khi `GET /manager/fleet` trả `lineage.revision = accessDigest({scope: scope.fingerprint, source: doc.revision})`; reader FE so chuỗi đúng nên bản thật luôn `STALE_BASELINE`, double thì ghép "cố ý". **Đoạn "bắt buộc bằng `baseline.revision` = `lineage.revision`" ở §3 (dòng Snapshot) bị thay bởi mục này.**

- **Định danh ghép** = `managerLineageRevision(S, head.revision)` (`manager-model.ts`, công thức duy nhất; Fleet read cũng gọi hàm này cho `lineage.revision`/`supersedes_revision`). `S` = fingerprint của scope `alpha.read` mà `GET /manager/fleet` mint cho cùng actor/session/workspace/environment/grants/head, qua `fleetReadRequirement(dataset)` dùng chung bởi `ManagerModelService` (FLEET) và `ScopesFleetAuthority` (một nguồn, không thể lệch; trước đây nhánh người xem một phần còn thiếu `requireWholePopulation:false` nên fingerprint đã lệch).
- **Hai scope, không gộp.** STREAM vẫn gate bằng scope ROOT `business.read_all` + `stream.subscribe` (cursor, `scope_fingerprint`, identity không đổi). Ghép dùng scope `alpha.read` của named read. Với người giữ ROOT, `ScopesFleetAuthority.snapshot` mint thêm scope `alpha.read` và bọc `deliver` hai lớp (named ngoài, root trong): nếu named read không đọc được thì không phát baseline không thể ghép. `FleetSnapshotAuthorization` có thêm `named_scope_fingerprint` (không bao giờ ra wire; chỉ digest dẫn xuất ra wire). READ một mình vẫn `UNAVAILABLE`/`STREAM_AUTHORITY_NOT_GRANTED` (hoặc `WHOLE_FLEET_AUTHORITY_REQUIRED`) nhưng vẫn ghép được với read của nó.
- **Contract.** `baseline.revision` = head thô (cursor/ordinal), KHÔNG so với Fleet read. `named_snapshot.lineage_revision` đổi từ `text` sang `sha256:<64 hex>`; bỏ `superRefine` bằng-nhau (không còn quy tắc cross-field; fixture âm `revision-pairing-broken` thay bằng `lineage-revision-raw-head`, schema từ chối được). Sinh lại bằng generator: `generate:execution-alpha-fleet-realtime` (openapi, schema, d.ts, fixture valid/negative), `snapshot.py` (542 file khớp), `refresh-release-integrity-ledgers.sh --check` sạch.
- **FE.** `readAlphaFleetRealtimeSnapshot`: bỏ AF-S3 (`pairing`), `lineage_revision` phải là sha256 (`named_snapshot` nếu không); `pairsWithRevision` = lineage digest; `pairBaselineWithFleet` so chuỗi đúng như cũ. Double `e2e/bffDoubleManager.ts`: Fleet answer và snapshot cùng gọi `fleetDoubleLineageRevision(env, workspace, head)` (cùng công thức canonical-JSON sha256), `baseline.revision` giữ head thô; khác env/workspace/head thì không ghép. `ROUTES.md` sinh lại (`FIXTURE_BFF_WRITE_ROUTES=1`).
- **Test.** Mới `apps/control-api/test/be-p17-fleet-pairing.spec.ts` (1 test chéo dịch vụ, dịch vụ thật `ManagerModelService` + `AlphaFleetRealtimeService` + `ScopesFleetAuthority` + `ExecutionReadScopes` + access evaluation thật, chỉ doubled biên I/O như `elp206-manager-service.spec.ts`): cùng nguồn + cùng actor/session/workspace/env qua hai dịch vụ => bằng nhau từng byte; khác session/actor/grant/resource visible => khác; head đổi giữa hai read => stale (đọc lại barrier thì ghép lại); chỉ READ => không có stream, cursor cũ không sống sau khi mất `stream.subscribe`. Cập nhật: `be-p16-alpha-fleet-realtime.spec.ts` (double authority), `packages/contracts/test/execution-alpha-fleet-realtime.spec.ts`, FE `alphaFleetRealtime.conformance.test.ts`, `fixtureBff/fleetRealtime.test.ts`; thêm 1 assert PG trong `elp2-read-scope.spec.ts` (chưa chạy, không Docker).
- **Không đổi:** yêu cầu toàn fleet cho STREAM, READ/STREAM tách bạch, Hub/cursor/revoke per-write, partial viewer không được stream.

## 10. Nối `revokeSession` — gợi ý đóng stream cùng tick (BE-P18, 2026-10-21)

Base `799effc8` (`claude/fe-parity`). Thay §4.3 và §8.5 ("`revokeSession` chưa nối"). Tier R3 focused: `tsc -p tsconfig.build.json` (src) exit 0; vitest non-PG 9 file / 310 pass / 8 skip; `refresh-release-integrity-ledgers.sh --check` sạch. Không route, không bảng, không migration, không cờ => capability/persistence ledger **không đổi**. Không cấp grant nào: mặc định vẫn tối (`STREAM_AUTHORITY_NOT_GRANTED`). READ/STREAM tách bạch và yêu cầu toàn fleet giữ nguyên.

**Nguyên tắc.** Gợi ý chỉ là đường tắt: authority vẫn là fence mỗi poll + mỗi lần ghi của Hub. Gợi ý không bao giờ chặn/làm hỏng revoke hay logout; gọi SAU commit, ngoài transaction; thất bại = tình trạng cũ (<= 1 chu kỳ poll, 5 s).

**Cơ chế.** `auth/stream-revocation-hints.ts` (`StreamRevocationHints`, mới, không import gì): `sessionEnded(id)`, `userAuthorityChanged(id)`; toàn phần (không throw, listener ném/ reject chỉ bị đếm), tối đa 4 listener (vượt = đếm, không throw), id sai kiểu/rỗng/> 256 ký tự bị bỏ, **không lưu id nào** (chỉ 4 bộ đếm), không log, không secret. `AuthService.streamHints` là carrier; `AlphaFleetRealtimeService` (token `AuthService` `@Optional`, hoặc `options.hints`) tự đăng ký lúc dựng, huỷ ở shutdown. Trong service: `identities` map bỏ, thay bằng `opens: Set<OpenRecord>` (một bản ghi mỗi slot đã giữ, rỗng khi stream hết) => `revokeSession(sessionId)` và `revokeUser(userId)` (mới); một gợi ý đến lúc open còn đang xác thực/subscribe được đánh dấu và đóng ngay trước frame đầu (không để lọt tới poll). Hub terminal frame `access_revoked/ACCESS_CHANGED` do chính Hub ghi.

| Đường kết thúc session / grant | Nối | Gợi ý | Ghi chú |
| --- | --- | --- | --- |
| `AuthService.logout` | có | `sessionEnded(session)` sau commit | LOGOUT_SESSION_CHANGED hoặc COMMIT lỗi: không gợi ý |
| `AuthService.changePassword` | có | `userAuthorityChanged(user)` sau commit | revoke mọi session của user |
| `AuthService.retireInvalidSession` (disable / đổi `session_version` / identity) | có | `sessionEnded` trong `finally` | cả khi ghi bookkeeping bị drain guard hoãn, vì mất hiệu lực đã xác lập bằng identity |
| `AdminService.revokeSessions / disable / resetCredential` | có | `userAuthorityChanged` ngay sau câu revoke (resetCredential: sau commit) | audit lỗi không để stream mở |
| `AccountLifecycleService.executeAuthorized` (owner REVOKE_SESSIONS, DISABLE, ARCHIVE, ENABLE, ISSUE_ACTIVATION, UPDATE_PROFILE có role) | có | `userAuthorityChanged(target)` sau commit | phản chiếu `applySideEffects`; CREATE_INVITED và đổi tên không gợi ý; denial/replay-denied không gợi ý |
| `ExecutionAccessService.revoke` (grant API trực tuyến) | có | `userAuthorityChanged(grantee)` sau commit | replay cùng key và từ chối không gợi ý lần nữa; grant con ủy quyền không được gọi tên, chúng dựa vào fence |
| `ExecutionAccessService.revokeReviewedManagerDomainGrants` (official native revoke) | có | `userAuthorityChanged` cho mỗi grantee có dòng đổi (REVOKED/NARROWED) | **CLI `execution-native-revoke` là process riêng, không có listener => no-op ở đó.** Process server đang chạy vẫn dựa vào fence poll (<= 5 s) như BE-P10 mục 5. Muốn dưới 1 poll xuyên process cần DB `LISTEN/NOTIFY` (code mới, chưa làm, chưa đề xuất) |
| `revokeAcceptanceSession` (CLI) | có | `sessionEnded(session)` | cùng ghi chú: no-op trong CLI |
| `GovernanceGrantsService.revoke` | không | - | bảng governance cũ, không phải nguồn của `ExecutionReadScopes`/stream |
| hết hạn idle/absolute | không | - | thuần thời gian, do fence mỗi poll |

**Tests.** `test/be-p18-stream-revocation-hints.spec.ts` (21, Hub/codec/source/service thật; `AuthService.logout` + `AdminService` thật trên pool kịch bản): gợi ý đóng client bằng frame terminal **đồng bộ** (không await), 0 byte sau đó (publish + poll không ghi, 0 ghi authority), mọi bộ đếm về 0 (`clients/sessions/tracked_identities/queued_bytes/timer`), session khác (cả cùng user) và user khác không bị đụng và vẫn nhận `revalidate`, gợi ý theo user đóng mọi tab, gợi ý đến giữa lúc open, gợi ý không phải denylist (mở lại hợp lệ chạy), gợi ý lỗi (listener ném, Hub ném) bị nuốt và fence poll vẫn đóng stream, không id/secret trên wire hay diagnostics, huỷ đăng ký khi shutdown, carrier bị chặn/id bị bỏ; logout hint đúng thứ tự `UPDATE, COMMIT, hint`, COMMIT lỗi => không hint, listener ném không làm hỏng logout, admin hint trước audit. Thêm 3 ca vào `be-p10-manager-revoke.spec.ts` (`ExecutionAccessService` thật + FakeCoreWorld): hint grantee sau khi audit đã ghi, NARROW có hint, no-op/replay/artifact bị từ chối không hint, hint ném không đổi receipt.

**Spec PG cho lead (viết, KHÔNG chạy, không Docker):**
- `apps/control-api/test/be-p18-stream-revocation-hints.pg.spec.ts` (mới, skip nếu thiếu `TEST_DATABASE_URL`, boot Nest app thật): DI thật (service đã đăng ký vào `AuthService.streamHints`), logout / changePassword / admin revoke-disable-reset / owner lifecycle REVOKE_SESSIONS+DISABLE qua HTTP: hint đúng id, **dòng DB đã REVOKED lúc hint** (probe đọc qua kết nối thứ hai), từ chối/stale/không tồn tại => không hint, listener ném không làm đổi kết quả.
- `apps/control-api/test/elp2-access-transaction.spec.ts` (+1 ca): `ExecutionAccessService.revoke` hint đúng `subject_user_id`, stale revision và replay không hint.
Rủi ro lần chạy đầu: assert `listeners === 2` (probe + service) giả định đúng một `AlphaFleetRealtimeService` trong app; probe đọc DB bằng truy vấn khởi động đồng bộ tại hint nên giá trị đúng khi hint đến sau commit (đã chứng minh thứ tự ở spec non-PG).

**Còn nợ:** hint xuyên process (CLI -> server) = `LISTEN/NOTIFY`, ngoài phạm vi; grant con ủy quyền của grant bị revoke chỉ kết thúc bằng fence; `tsc` toàn bộ `test/` bị OOM trên máy này (chỉ chạy được src + 4 spec liên quan: một diagnostic cũ `node-pg-migrate` ở `test/harness.ts`).

### 9.1 Receipt chạy tập trung cho CR-01 (2026-10-21, DEBT-UXM07-036)

Mã được chứng: `dd9609af` (nằm trong `799effc8`). Chạy trên worktree `claude/fe-parity` @ `799effc8` cộng các commit chỉ-FE của gói UXM-07 (conformance Workbench/New request, baseline V2): `apps/control-api/` và `packages/contracts/` **không đổi** so với `799effc8`. Host, không Docker, không PG, TEST_ONLY. `node_modules` của control-api lấy từ cây `portal-research` (cài ngày 2 Oct), không phải image của hook; số dưới đây là của lần chạy này, không thay hook R2/R3.

**`apps/control-api/test/be-p17-fleet-pairing.spec.ts` chứng gì.** Một bài kiểm chéo dịch vụ: `ManagerModelService` thật (`GET /manager/fleet`), `AlphaFleetRealtimeService` thật với `ScopesFleetAuthority` thật, `ExecutionReadScopes` thật, access evaluation thật, `ScopedReplayCursorCodec` thật. Chỉ biên I/O là double (access context, publication reader, hàng định danh SQL, kho revision Manager), như `elp206-manager-service.spec.ts`. Hai dịch vụ đọc **cùng một** kho (một head, một tài liệu SOURCE_VERIFIED mỗi revision), nên hai bản sao không thể lệch nhau. Bốn ca:

1. **Cùng nguồn, cùng actor/session/workspace/environment:** `named_snapshot.lineage_revision` của barrier bằng từng byte `lineage.revision` của Fleet read; `baseline.revision` vẫn là head thô (`TEST_ONLY:r1`) và khác cả hai (head thô không còn là định danh ghép, đúng sai sót CR-01); đọc lại thì cùng giá trị; công thức là hàm `managerLineageRevision` (đầu ra dạng `sha256:<64 hex>`).
2. **Khác session, actor, grant hoặc resource nhìn thấy thì không ghép:** barrier của principal này không bằng read của principal khác, nhưng mỗi bên ghép với read của chính nó; thêm một grant đổi định danh (vẫn ghép với read mới); bớt một deployment peer khỏi tập công bố cũng đổi.
3. **Head đổi giữa hai lần đọc thì stale:** barrier cũ không bằng read mới; đọc lại barrier ở head mới thì ghép lại và `baseline.revision` là `TEST_ONLY:r2`.
4. **Chỉ READ (`business.read_all`, không `stream.subscribe`) vẫn ghép nhưng không mở stream:** `stream = {state: UNAVAILABLE, reason_code: STREAM_AUTHORITY_NOT_GRANTED, resume_cursor: null}`; thêm grant stream thì `AVAILABLE` và vẫn ghép theo read; rút grant thì cursor cũ mở ra khung terminal, không có `revalidate`/`heartbeat`.

**Kết quả chạy** (mỗi dòng là một lệnh riêng, đếm thật):

| Gate | Kết quả |
| --- | --- |
| `cd apps/control-api && vitest run test/be-p17-fleet-pairing.spec.ts` | 4/4 (20 s) |
| cùng thư mục: `test/be-p16-alpha-fleet-realtime.spec.ts` | 50/50 |
| `test/elp206-manager-service.spec.ts` (đường `GET /manager/fleet` thật) | 19/19 |
| `test/elp2-read-scope.spec.ts` | 117 skipped, 0 chạy: **cả file cần PG**, gồm assert PG của CR-01 → **NOT_RUN** |
| `cd packages/contracts && vitest run test/execution-alpha-fleet-realtime.spec.ts` | 57/57; `node tooling/generate-execution-alpha-fleet-realtime.mjs --check` exit 0 (sinh lại khớp) |
| FE: `alphaFleetRealtime.conformance.test.ts` + `fixtureBff/fleetRealtime.test.ts` | 1388/1388 (hai file) |

**Chưa chứng:** assert PG của CR-01 trong `elp2-read-scope.spec.ts` (không có PG ở lần chạy này); fingerprint scope thật trên DB; không có grant `stream.subscribe` thật nào được tạo hay xác nhận (TEST_ONLY: không qualify publication hay grant production); hook R2/R3 trên SHA đóng băng (DEBT-UXM07-037). `tsc` của control-api không chạy ở đây.
