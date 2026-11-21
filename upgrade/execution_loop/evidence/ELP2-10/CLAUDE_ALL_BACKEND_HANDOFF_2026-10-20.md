# Bàn giao toàn bộ backend Portal còn lại cho Claude — 2026-10-20

**Disposition:** `HANDOFF_WRITTEN / AWAITING_CLAUDE_ACK`; không phải phase PASS.
**Owner implementation:** Claude, theo giao việc mới nhất của Bobby. Codex review/integration;
Edge/PM vẫn là owner source bên HK. Không còn giới hạn Claude chỉ làm backend B1/B2.
**Phạm vi round lập tài liệu:** đọc source, commit, packet và SSH public receipts; không chạy
test sản phẩm, build, DB mutation, commissioning, merge hoặc push.

## 1. Kết luận và pins đã kiểm

ELP2-10 còn mở, ELP2-11 `NOT_ENTRY_READY`. Không mở campaign/phase mới để đổi tên debt.
Claude **đã làm backend thật** BE-P1…P5 và các consumer; phần còn thiếu là một tổ hợp:
bug authority, contract scoped/consumer, nguồn tài chính, composition runtime và qualification.
Không được gộp tất cả thành “chờ Edge”, cũng không gọi tất cả là “frontend chưa làm”.

| Checkout | Pin tại lần đọc | Hiện trạng |
| --- | --- | --- |
| `/home/bobby/portal-research` — `docs/research-loop-plan` | `7818d5631e0da37563bca5715fd46d40b66ef1de` | Có WIP tài liệu Core/Edge; không stash/reset/ghi đè |
| `/home/bobby/portal-research-fe` — `claude/fe-parity` | `e4383f22d852d7b1d256acee4f4a32d43f462f4c` | Sạch lúc đọc; canonical là ancestor; ahead 183 commit, behind 0, **chưa nhập về canonical** |
| HK Edge — `feat/execution-edge-upgrade-v1_2` | `0af33fdf97861edde07a5ca85e367dc9a315a092` | Có WIP, đang tiếp tục runner connected-read |
| HK PM — `feat/portfolio-account-v1_1-parallel` | `73473c9122dab888d5de23bff4e1f93391028df4` | Có WIP; không nhận sửa hộ/ghi đè source |

SSH audit nguồn lúc **12:48–12:50 ngày 20/10/2026, giờ Việt Nam**; đọc lại public receipt
trực tiếp sau kết quả agent. Pins là snapshot, không phải giấy phép dùng mọi WIP làm runtime.
Diff hash HK tại snapshot: Edge `ba1d5f3e3675d16b26eeb4db995ff556c78111c0a7dd04a210876e0cd4852917`,
PM `ad2af8ec900d16b3c707fcda5bc370a2246ed0bc8ad6c5234f09457b5e71cb68`.
Mỗi round repin SHA + dirty state + journal; không dùng tên branch để suy bản đang chạy.

**Delta khi khóa báo cáo:** peer đã tiến thêm 4 commit tới
`b7a43d634ca2fc6fbe2ef051bd2ebf2fd1fc0a66` (cây sạch; ahead187/behind0):
strict command-catalogue reader + story consumer (`7f493c42`, `15718e88`, `6874ab01`),
và sửa reader stage eligibility fail-closed (`b7a43d63`). **Không giao viết lại strict
catalogue reader**; receipt mới vẫn `ACCEPTED_FIXTURE_ONLY`, chưa connected port/R2.
Commit cuối cũng chứa [priority handoff Core009 từ Edge/Bobby](/home/bobby/portal-research-fe/upgrade/execution_loop/evidence/ELP2-10/CLAUDE_CORE009_PRIORITY_HANDOFF_2026-10-20.md).
Đọc nguyên packet đó; raw hash `ccdfb4d714deedb8cc66f2beee5189c8dc07c985de85f7cbded9cb738056bb7f`.
**B/Core009 là ưu tiên đầu**, A có thể chạy song song, không để frontend/Manager đẩy009 xuống cuối.
Giao việc toàn bộ backend trong packet này rộng hơn assignment009 cụ thể; cả hai cùng giữ
authority và giới hạn runtime. File đã đặt chưa phải Claude ACK/đã triển khai009.

### Không giao làm lại

- Core 008 đã normal-hook/R3 và cài Research: commit `7818d563`, image
  `sha256:7b2c7f34f134323201f447084440973b9aefd22318fdb09ff1e1bc35c4c4395d`.
  [Installed return](CORE_008_INSTALLED_READY_009_RETURN_2026-10-19.md) chứa backup,
  config/bootstrap, private references, cleanup; installation này **không cần migration mới**.
- Identity thật đã **COMMITTED + Core ACK**, source role retired, Core FINISHED,
  unresolved/callback bằng 0. Đây là cập nhật sau installed return; **không issue identity lại**.
- Manager MD-1/2/3/4/6/7/8 và ba mismatch reader đã được consumer sửa/accept.
  MD-4 vẫn cần producer review semantics; MD-5 chưa quyết/đóng.
- Manager series đã nối HTTP port → **Overview, Portfolio 360, Compare**.
  Thiếu hiện nay là qualified series publication và một số invariant, không phải chưa có UI NAV.
- FE-063/069 đã có backend/consumer; FE-062/068 có phần contract/readers.
  FE-066/067/070/071/072, S3-U2/U3/U4 có delivery BE-P2/P3; phân biệt fact còn thiếu
  với schema chưa làm. FE-054 exact-decimal không mở lại.
- UXM-08 eviction và UXM-09 command story đã có browser **FIXTURE_LAB**; không coi là
  connected source acceptance, cũng không ghi “chưa bắt đầu UXM” như note lịch sử.

## 2. Đọc theo thứ tự, không bỏ consumer review mới

1. Root `AGENTS.md`, `CLAUDE.md`, [campaign rules §10.13](../../AGENT_WORKING_RULES.md),
   [Unified §14](../../../UNIFIED_IMPLEMENTATION_PLAN.md#execution-loop-v2-claude-all-backend-20261020).
2. Hai guide backend v1.2 và Manager UX v1.1, Score specification v1.1,
   feasibility/review-decisions trong `upgrade/execution_loop/`; source authority hierarchy giữ nguyên.
3. [Sổ đồng bộ](../../FRONTEND_BACKEND_SYNC.md), [Source Truth Board](../SOURCE_TRUTH_BOARD.md),
   packet ELP2-02…10 theo phần chạm; đọc cả request mới cuối consumer receipt.
4. **Tài liệu đã nằm ở peer, chưa nằm hết trong canonical** tại pin `e4383f22`:
   - [BE-P1 tại checkout peer](/home/bobby/portal-research-fe/upgrade/execution_loop/evidence/BE-CLAUDE-2026-10-20/BE-P1.md).
   - `/home/bobby/portal-research-fe/upgrade/execution_loop/evidence/BE-CLAUDE-2026-10-20/BE-P1.md` … `BE-P5.md`.
   - `evidence/UXM-07/consumer-receipt-manager-2026-10-20.md` §7 và addendum cuối.
   - `evidence/UXM-07/consumer-receipt-be-p5-2026-10-20.md` §6–8.
   - `evidence/UXM-07/consumer-receipt-self-navigation-2026-10-20.md` §7.
   - `evidence/UXM-08/README.md`, `UXM-09/README.md`, `UXM-10/README.md`.
   Các locator tương đối trong nhóm này resolve từ `upgrade/execution_loop/` của **peer**.
5. [Core ACK/008/009 return](CORE_EDGE_REQUEST_008_009_RETURN_2026-10-19.md),
   [Edge request](EDGE_TO_CORE_EPG10_08_REQUEST_2026-10-19.md), installed return và §4 dưới đây.
6. HK: Edge Unified mới nhất → guide EPG v1.2 → catalogue/Manager/max-data →
   PM guide R2 đang triển khai/journal/discovery/history/command. Không lấy guide Library cũ đè R2.

## 3. Hàng đợi thực hiện — dùng ID cũ, không nhân bản ledger

Các nhóm A…F dưới đây chỉ là thứ tự làm việc, **không phải phase mới**.
Claude sở hữu implementation của toàn bộ nhóm; gửi source request cụ thể cho Edge/PM khi cần,
không chờ Codex code. Producer review/owner acceptance vẫn độc lập.

### A. Bug quyền và contract chặn consumer; chạy song song B/Core009 ưu tiên

| ID / phần | Việc còn làm, source locator | Exit gate tối thiểu |
| --- | --- | --- |
| FE-015/060/068 — capital step-up | `access.service.ts:568`, `self-eligibility.ts:543`: actor có `capital.*` nhưng không có access.grant/revoke không qua re-auth. Cho challenge theo action thực được phép, **không cấp quyền access-admin** | Delegated-capital-only positive; deny/expiry/revoke, session khác, password đổi; CSRF/current-session/freshness; parity batch ↔ command route |
| FE-037/058 — account action | `execution.accounts.manage` chưa có family/operation authority hợp lệ; chốt tên canonical, target, step-up, disabled reason theo operation thật | Schema/reader thống nhất; token điều hướng không mở mutation; family chưa commission vẫn khóa |
| FE-057/058/038 — self navigation | Server chưa publish current/default authorized workspace, `self_entry.route:null`; view self-only có nhưng thiếu entry riêng; screen-local execution.* guards có thể vẫn chặn sau rail | Không đoán workspace; session/membership/revoke/late-response tests; route self-only không tháo admin guard; kiểm rail → màn cùng scope |
| FE-068 — advisory | Capture-capability và stage-action eligibility có thể bất đồng sandbox note; role không đồng nghĩa grant | Dùng cùng predicate authority; advisory chỉ giải thích; parity từng action với route thực; không mở Canary/Live bằng advisory |
| FE-013 / Manager series | `manager-series.contract.ts:123` chưa ràng buộc metric ↔ unit; RETURN chưa nêu ratio scale, trong khi FE đang kiểm unit và in plain ratio | Negative NAV/RATIO và RETURN/MONEY; scale lấy từ authority, publish generated/fixtures; không tự đoán phần trăm |
| MD-4/MD-5/FE-065 | Review unresolved preset và lifecycle semantics; negative zero và currency text là các quyết định độc lập | Ghi ACCEPT/CHANGE; nếu chọn canonical zero, chỉ normalize boundary được duyệt, không sửa shared decimal/hash lịch sử; không tự thu hẹp currency nguồn |
| BE-P1…5 | Test producer thực ↔ canonical fixture; P3 có 7 probe BFF double sai schema; PG-backed tests và normal R3 còn NOT_RUN | Sửa double theo contract, không sửa contract để chiều fixture sai; ghi đúng original SHA → landed SHA; chạy gate bị ảnh hưởng trên cây thống nhất |

Locator code của bảng này tính từ `apps/control-api/src/` trên peer; tìm đường dẫn chính xác
bằng `rg` trước sửa. Các verdict test đỏ ở snapshot cũ **không chứng minh HEAD hiện tại vẫn đỏ**.
Không lặp full suite từng docs commit; áp dụng R0/R1/R2/R3 trong rules, không bypass R3.

### B. C7/008/009 — ưu tiên phối hợp Edge ngay, không đợi xong mọi màn

Đọc §4. Identity prerequisite đã đạt, nhưng **Core009 chưa compose và policy Research chưa cài**.
Chuẩn bị owner artifact/current policy/standard app composition ngay trong quyền Research đã duyệt;
gửi PREPARED + các input cần Edge để hai bên chọn finite window mới. Không tạo deadlock
“Core phải hoàn toàn installed trước khi Edge đưa pin” hoặc ngược lại.

008 vẫn phải phân biệt positive COMMIT/ACK với fault-path lost issue-response cleanup:
reuse focused tests đúng source hash; nếu connected negative chưa có thì giữ `NOT_RUN`, phối hợp
runner Edge để kiểm trong window, không tạo attempt/receipt/ACK giả hay reissue identity đã commit.

**Exit:** READ thật và independent STREAM thật theo subset đã qualified; revoke/expiry/cache/cursor,
no-late-SSE, genuine source-update frame, replay/restart/recovery, terminal ACK và drain/logout
có correlation. Một HTTP 200/TLS pass hoặc parser pass không đủ đóng.

### C. Manager/stage — khai thác tối đa nguồn, nối đúng scoped contracts

| ID / phần | Việc cần làm | Exit / consumer |
| --- | --- | --- |
| FE-066, S3-U5; BE-P2/P3 | Stage facts + identity mới chỉ nằm legacy body. `canary.service.ts:93`, `sandbox-certification.service.ts:179`, `live-operations.service.ts:68` rẽ SCOPED_V2 trước composer | Mở rộng purpose/field-policy seal đúng nguồn; hidden-peer/portfolio negatives, V1 compatibility; không fallback legacy để lách quyền |
| FE-027/028/030/031/034/039 | Current-stage đã có; entry time/days, ordered transitions, gate-state, criteria còn thiếu hoặc chưa qualified | Multi-stage ambiguity, selected env và stage filter; không dùng binding date/approval date làm entered_at |
| Stage source facts | Runtime+since, session/reconciliation binding, finding class, venue calendar, risk limits, rollback facts, stage series | Mỗi field có source locator + qualification; absence đúng reason, không tự dựng lịch phiên/limit |
| Manager dataset | Reader đã cập nhật nhưng chưa có `getManagerDataset` port/screen consumer; Fleet/Cockpit sort/group current_stage chưa nối | Canonical dataset → HTTP/query port → screen; paging/filter/group/scope negative tests; giữ statement-before-filters semantics |
| Manager series / ELP2-REQ-06-002 | Reader mới đọc `precomputed_series` nhưng chưa có qualified publication/writer | NAV/NET_PNL/RETURN đúng population/window/basis/currency/quality; restricted population trước aggregate; real API→UI receipt |
| Existing shadow | ShadowPanel S3-U1 vẫn OFF/unqualified, route cũ là passthrough POST upstream | Không bật để né Paper payload lớn; chỉ thay bằng local/scoped bounded projection sau contract và qualification |

Financial qualification phải chỉ rõ cashflow/economic revisions, FX, cost/funding, direct
portfolio semantics, denominator NAV, dedup physical account, quality và original/restated
lineage. Retained equity không tự trở thành certified NAV. Không bắt basic qualified reads
đợi toàn bộ Score/Regime, nhưng không gán production calibration bằng constants fixture.

### D. Commands/workflows — contract trước, authority thực vẫn theo từng family

- FE-062: discovery mới là **Portal-controlled recalls**, không tìm recall chưa từng có control.
  Cần qualified PM remainder-read, original-command correlation, identity và **five CAS**.
  FE-063 đã có status reader; còn form/status, expected_versions prefill và retry/reload/UNKNOWN.
- FE-068: batch 1–8 resource/1–16 action đã có; cockpit còn dùng constant step-up.
  Nối `step_up_state/session_step_up` và Paper Exit verdict vào control đúng lane.
- UXM-09 / FE-015/020/032/037: clarify F0 success vs DENIED-only, operation/idempotency key,
  lookup sau response loss, source rejection/replay, venue partial quantities, cost/impact hoặc
  typed absence. Publish OpenAPI/generated/fixtures rồi real HTTP port; không dùng fake ACCEPTED
  để chứng minh command source. Strict catalogue V2 reader/story đã vào delta `b7a43d63`;
  còn connected HTTP port và qualification, không viết lại reader.
- Các family còn lại trong [remaining-source review](../ELP2-07/remaining-source-families-review.md):
  ADMIN_LOCK/UNLOCK, REALLOCATE_BUDGET, BIND/REVISE_BINDING, MOVE_ASSIGNMENT/CANCEL_MOVE,
  physical-profile transitions, lifecycle/archive/monitor, RETURN_CAPITAL/SET_RISK_LIMITS.
  Repin PM trước kết luận thiếu nguồn; implementation theo exact catalogue và held-COMMIT authority.
  Không alias family qua HALT/RESUME hoặc recall+FUND.
- Mỗi family: current-human, separate economic authority, scope/target/env, expected version,
  original immutable intent, durable intake, authenticated result, same-key recovery, audit.
  **Bobby giao toàn bộ backend không phải bật command/Live trong window READ/STREAM.**

### E. FE ↔ BE còn lệch phải đóng bằng consumer receipt

| Backend/contract | Việc frontend còn làm | Nghiệm thu |
| --- | --- | --- |
| BE-P2/P3 stage subtrees và identity | Nối typed fields mới vào stage readers/screens; legacy envelope đang được dùng không có nghĩa subtree mới được dùng | Published/consumed/intentional omission census; scope/absence cases |
| Manager dataset và series | Dataset port/screen còn thiếu; series UI đã có, chờ nguồn và scale | Source→contract→reader→screen; không lập lại NAV components |
| Self-entry/batch/pending | Entry người thường, screen-local gates, cockpit step-up, recall form/status | Revoked/unknown/reload, no write from advisory or stale CAS |
| UXM08-A/C/F | Named snapshot/stream operation, baseline generation/source-set và fixture đa scope | Map vào transport sẵn có trước khi thêm route; first-frame mismatch, replay cursor, restricted changes |
| UXM08-B/E | Frame dataset/subscription nếu multiplex; nếu one-connection/one-dataset thì ghi explicit binding; thêm Source Truth row | Không suy dataset từ UI hiện tại; multi-env/portfolio/currency/shared-account fixtures |
| UXM09 | Fake port → real HTTP khi đủ qualification; instance-registration/pending-control form | UNKNOWN/no ID, same-key replay, late result, CSRF/revoke |
| UXM10 (frontend-only) | Esc bị stopPropagation; Accounts overflow ở 1024; Workbench focus bị che; axe contrast/nested interactive/scroll focus | Focused browser + pinned visual nếu pixel đổi; không bắt backend “sửa bằng data” |

UXM10 hiện có fixture performance/a11y receipts, không phải G2 nguồn thật.
Polling Overview 15s, payload/decoded assets và duplicate Sandbox request là **số đo để tối ưu/
đề xuất budget**, không phải budget đã duyệt. Đo lại đúng phần ảnh hưởng; không ghi 73 ô/15 màn
Research hay fixture Execution thành một chứng nhận chung runtime mới.

### F. ELP2-10 closeout và điều kiện sang ELP2-11

1. T10-01…03/09/10/11: qualified financial inputs, methodology/FX/partition, funding/lot,
   canonical windows, bounded writer/recompute; ghi source/barrier/schema/config hashes.
2. T10-04…08/12: browser-source amplification, mixed workload, TS/DL/Research coexistence,
   lease/retention/DR và performance G2 theo đúng workload/ResourceEnvelope.
   Capped correctness khác absolute latency measurement; repin host rules/leases trước chạy.
3. T10-13: artifact budget/calibration thực được duyệt. Formula/weights/bands Score v1.1 đã chốt,
   không hỏi lại. Claude đề xuất số đo + config cụ thể để Bobby duyệt **một lần**, không để
   “chờ budget” vô hạn và không lấy số fixture làm production defaults.
4. T10-14/ELP2-REQ-10-001: receipt reused phải có dependency impact, fixture/source/runtime/
   browser tách mức; FE owner acceptance không suy từ tsc hay test counts.
5. ELP2-11 chưa được gọi full PASS/entry-ready; khi mandatory gates đủ mới báo Bobby mở phase.
   Chưa merge dev/main, signed release/deploy. Research P23/P24 vẫn là downstream acceptance,
   gồm final-candidate T02/T14; giữ ngoại lệ lịch sử 83/86 đã duyệt, không hỏi lại hay sửa bytes.

## 4. Core ↔ Edge: facts mới và giao nhận để chạy tiếp

### 4.1 Receipt có thể reuse, không phải authority còn hiệu lực

SSH `bobby@16.163.212.33`; Edge root
`/home/bobby/.worktrees/portal-execution-edge-upgrade-v1_2`.

| Public path tại Edge root | Fact và hash |
| --- | --- |
| `upgrade/integration/execution-native-read-v1/research-identity-intake/connected-source-return.json` | Identity COMMITTED/Core ACK true, mapping TS `608dcbd6-e8df-4aa4-b0fc-bc0881d0aafd` v1; SHA256 `48ab20cd89d813346d6d5a7f106294f90e3ee7acb9e09feb1155f96246fa6ec9` |
| `upgrade/integration/execution-native-read-v1/research-identity-intake/finite-source-closeout.json` | 28446 drained/removed; acceptance revision 2 **revoked**, old revision 1 is historical only; SHA256 `caedd55ede397800a0050250739d49dc6385655fb371050de1e5b6395a8ed113` |
| `upgrade/evidence/execution-edge-v1_2/EPG10-08/core009-readonly-preflight.json` | Observed 12:45:21 VN: image 008 unchanged/restarts 0, no native config, exact Research workspace **0 policy/0 grant/0 event**; SHA256 `5ba33abd95611b855761b8b2740437e3549cc40559d713aef7b6f6b7369101fe` |
| `upgrade/evidence/execution-edge-v1_2/EPG10-08/CONNECTED_READ_BINDING_OWNER_ACTION.md` §5–6 | Current owner action; Core preparation → new source window → connected acceptance |

Runtime facts above are **Edge-published observations read directly**, not new Core DB/Docker
queries by this audit. Edge journal lines 24220/24234 cover identity/ACK; 24577/24618 record
resume and connected-read runner work. Old “PAUSED/DL lock until 20:54/Core008 not installed”
is superseded. PM has its own pause/capacity issue; do not infer Edge resumed means PM can mutate.

The identity source receipt `c257e2d3-d753-4398-a906-8e4867e54f3c` has digest
`sha256:d499fb96835040c73391771805c2db8610818ea77dc7736491e59f9f51e13d86`.
The old acceptance `b922c105-4e99-4830-8be2-bb2e1f41b5d9` is revoked at revision 2.
Trust last observed expires **15:00:59 ngày 20/10 giờ Việt Nam**. Verify renewal/current
acceptance before any use; do not reuse expired trust or replay retired revision 1.

### 4.2 Claude/Core chuẩn bị và trả trước

1. Read installed return and exact current state; preserve physical Research DB
   `7688673963308855330`, user `usr_5a38d5dfb08b44748f5776fbe04a1434`, workspace
   `ws_06G19F61YB8CFR7TEWMS7HQ660`, environment paper/profile `PAPER_BINANCE_USDM`.
   These public IDs identify a target, **not authentication**.
2. Prepare reviewed private `portal.private-owner-manager-commissioning.v1`, current domain/
   field seals and private `portal.native-core-runtime.v1`. Independent artifact/hash review,
   exact DB/login/protected-owner identity and finite validity; never commit keys/session/DSN.
3. Existing installer only: `privateOwnerCommissioning` / `installOwnerPolicies` /
   `installReviewedManagerDomainPolicy`. Fresh-policy-only; exact immutable replay allowed;
   nonempty/different policy → typed conflict, not destructive overwrite or manual SQL seed.
4. Explicit READ `business.read_all`; **separate** STREAM `stream.subscribe`. Same exact
   reviewed domain/profile/subject; neither becomes entity/root/financial/command permission.
5. Compose `main → prepareNativeCoreRuntime → composeNativeCore → AppModule` on **same actual
   Pool, trust, current-human mutation coordinator and recovery registry**. Reverse bootstrap
   currently only injects identity mutations, so existence of module is not installed009.
6. Send PREPARED source/bootstrap/config/schema hashes, required source observation pins,
   policy/grant plan and bounded window requirements to Edge. After matched pins are installed,
   send INSTALLED/READY actual image/config/policy/grant revisions and private-reference
   locations through approved channel, never credential contents.

### 4.3 Edge/PM input and joint exit

- Edge supplies fresh current-head CAS acceptance, finite candidate runtime window, observer/
  receipt/source/config pins and compatible trust; does not keep 28446 open while waiting.
  Existing 28445 stable bindings remain untouched. Native authority transport is **not**
  the Manager data HTTP service or normalized financial projection writer.
- Use existing Manager/Source Proxy/Rust data plane for actual authorized data ingestion.
  Exact positive READ, wrong subject/workspace/profile/issuer/audience/cert/expiry denies.
- Revoke both source acceptance and Core grant; stale cache/cursor denied, no late restricted
  SSE; independent unaffected scope remains readable. Genuine newly ingested frame, reconnect/
  replay/restart, lost-response same-key recovery, source physical receipt/Core terminal ACK.
- Stop new admission on failure; preserve UNKNOWN custody, original key/process/pool/recovery.
  Timeout/expiry does not mean rollback. No fabricated terminal row, force-kill/reissue workaround.
- Drain handlers/pools/listener, officially retire finite window and revoke/logout temporary
  session; retain immutable audit/receipts and required recovery records. Report exact cleanup.
- Reuse 008 source/focused proof when compatible, **not** as claim connected lost-response
  unused-identity case passed. Record which original08 cases remain; connected09 is separate.

Bobby already allowed Research-only Paper READ/STREAM commissioning, exact account mapping,
temporary test credential when necessary with cleanup, bounded candidate resources. Do not ask
again generically for that scope. Existing candidate ceiling remains 2 CPU/1.5 GiB and bounded
test windows; do not silently raise it. Renewed source/trust/window must have source owner
confirmation; production budgets/calibration and command/Live are not included.

## 5. Max-data source map — no “catalogue = mounted” shortcut

Read latest HK contracts, not only the copied contract pack on SGP:

| Surface | Current fact | Claude action / request to Edge |
| --- | --- | --- |
| Edge `contracts/execution-catalogue-v1/registry.json` under `services/portal-execution-edge-rs/` | 42 logical families, all UNAVAILABLE; new runtime exports disabled | List exact family/operation/schema/purpose; do not claim 42 live endpoints |
| Manager DTO + maximum-data-return-v1 | Historical E6: 19 named relations × 3 profiles = 57 bounded page observations; E7: 34 fields/18 gaps | Revalidate selected operation/profile/source pins. 200 rows/1 MiB is a **page** bound, not authority to truncate all history |
| PM `pma11-14-dataset-discovery.json` | **18** descriptors now: original 17 qualified subset, Research-monitor #18 PREPARED_NOT_RUN; discovery opt-in UNMOUNTED/runtime false | Board includes #18 with correct status; ask actual mount/receipt, not merely request descriptor again |
| PM `pma11-13-selected-history-export.json` | 17 selected datasets, PARTIAL history; not whole census/snapshot B/generation/retention floor/authenticated delivery | Request precise missing history/barrier/coverage fact; bounded cursor traversal, no generic SQL proxy |
| PM `pma11-14-edge-command-handoff.json` | Isolated TEST_ONLY; owning Outcome/commit-time lease provider unconfigured; qualified native targets empty | Source owner supplies exact operation/environment/target qualification and held-COMMIT proof before real commands |
| Financial/resource publication | EPG publisher/writer, normalized finance and matched resource/budget inputs remain open | Pin writer/barrier/generation, methodology and measured configuration; native identity/READ proof is not financial qualification |

PM root: `/home/bobby/.worktrees/trading-system-pm-v1_1`; three JSON files above are under
`contracts/baseline/portfolio-account-v1_1/`. Original17 discovery digest
`128f429d05987e13158fbc00aa68e09f979ee3cfb063eddd68140f5212a15886`;
prepared18 digest `792b311cc586b0e5b51ff199e303d53dae6c327152c42d8944f3ba442ab0704e`.
Metadata census 99 relations/1387 columns is not permission to disclose all fields.
PM current capacity successor **72 PASS/1 FAIL**, `MIXED_WORKLOAD_INCOMPLETE[OTHER_EXCEPTION]`;
do not erase original failed receipt or call PM/whole system qualified.

For each Source Truth Board row, record:
`family → named operation → grain/schema → source current/retained/history → writer/barrier/
generation → cursor & row/byte bounds → clock/freshness/quality → actor/domain/field-policy →
commit/config/runtime → Portal DTO → consumed fields/screen → receipt → missing owner input`.
Peer board now has **17 rows**, not old12; source columns 13–17 still need filling. Add Manager
series/scoped realtime coverage if not represented; keep old observations with timestamps.
Every NOT_PUBLISHED UI field needs an exact reason and owner row; do not duplicate endpoint
work already available from a qualified surface.

## 6. Landing, tests, resources and return protocol

- This handoff and Core post-install docs are currently canonical WIP; Claude reads the absolute
  path now. **Do not checkout/reset/stash canonical**, and do not lose peer BE/FE/evidence.
  Coordinate one integrator for these docs, preserving both branches' appendices.
- Continue in `/home/bobby/portal-research-fe` unless a new isolated backend lane is explicitly
  coordinated. One writable branch/worktree per concurrent writer; subagents use independent
  refs/files or read-only reviews, not concurrent commits/reset on the same branch.
- Before landing: inventory WIP, source and receipt hashes, shared migrations/generated files;
  regenerate via repo scripts, never resolve generated output with whole-file ours/theirs.
  Main is currently ancestor, but **ff is not authorization or a passing gate**.
- Normal R3 for backend/contracts/infra; R2 before landing/push as campaign rules require.
  Existing BE-P packets' NOT_RUN stays until actually run. Scope tests to changed semantics;
  run shared heavy gate once per coherent candidate, not once per Markdown paragraph.
- SGP heavy work uses `/tmp/portal-heavy.lock`. HK reread `AGENTS.md` §34b: capped correctness
  may coexist, exclusive window for absolute performance; check root/user leases and active
  jobs. Observed absent user lease is not proof host is idle or a standing reservation.
- No source writes in peer worktrees, no production/dev/main, stable28445 replacement, remote
  pushes or release. Preserve all business data, audit, unknown custody and rollback images.
- Each package updates owner packet + Unified + sync IDs, not just chat. Report goal/pins,
  paths/commit, schema/generated types/canonical example, tests actual vs NOT_RUN, runtime level,
  resource metrics/cleanup, rollback, blockers, **backend next / frontend next / source request**.
- Producer receipt and consumer receipt remain separate even when Claude authors both sides:
  code author cannot invent source owner ACK; Codex/reviewer can independently accept/change.
  REVIEW_PENDING does not stop unrelated code work.

### First return requested from Claude

1. ACK this handoff with current peer SHA/WIP and a concise disposition per existing FE/request ID.
2. Prioritize B/Core009 and send exact PREPARED owner-return to Edge; run A's authority/contract
   bugs in parallel if files/resources are independent. Do not wait for Manager/UI work.
3. Mark old sync OPEN rows superseded where BE-P delivery/consumer proof exists; register new
   requests from self-navigation §7, BE-P5 §6–8, Manager §7, UXM08/09 without losing original IDs.
4. Return contract-ready slices to own FE lane immediately; qualified-source absence stays typed.
5. End with a gate table: SOURCE_ONLY / FIXTURE_VERIFIED / INSTALLED / CONNECTED_VERIFIED /
   OWNER_ACCEPTED. No single “done” label across these levels.

### Audit method and limitation

Three read-only subagents used: existing `c7_current_owner_delta` (BE-P2/P3/P4 + consumer),
existing `c7_request_audit` (BE-P1/P5 + authority), and `edge_handoff_refresh` for live HK delta.
Main cross-checked the four decisive Edge public artifacts directly. No secrets read or copied.
This packet is an evidence-backed handoff, not a fresh product test or independent full security
certification. Any new peer commit/runtime change after pins above requires a delta check.

Kiểm chứng tài liệu của round này: `git diff --check` PASS; local link targets trong
handoff/addenda tồn tại; `bash scripts/execution-tracking-test.sh` PASS
(`Execution tracking reconciliation passed.`). Không chạy lại product gates vì chỉ đổi Markdown.
Không commit riêng khi canonical còn WIP của owner khác; không bypass hook, không push.
