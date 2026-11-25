# Codex → Claude: tiếp quản toàn bộ backend đang làm và còn trong kế hoạch

Ngày bàn giao: **2026-11-25 UTC**. Bobby yêu cầu Claude nhận lại toàn bộ phần
Codex đang làm/dở để **lập lại kế hoạch rồi triển khai**, không chỉ nhận UI.
Trạng thái: **PUBLISHED_FOR_CLAUDE / AWAITING_ACK**. File này là điểm vào bàn
giao và đối chiếu, không tạo thêm một request ledger song song.

## 1. Quyền sở hữu và điều phải phân biệt

- Claude tiếp quản implementation backend Portal, contracts/generated/fixtures,
  consumer, review và lập lịch tích hợp; không phải đợi Codex sửa từng request
  thuộc các gói còn lại. Codex không triển khai tiếp trong lượt bàn giao này.
- Không tự mở rộng sang thay business authority TS/PM, quyền stable, deploy,
  grant/session, command/Live hoặc release. Các thao tác runtime vẫn cần đúng
  target, phạm vi và approval còn áp dụng; bàn giao công việc không là deploy approval.
- Nền API, quyền, luồng và khai thác dữ liệu thật là công việc chính; fixture
  phong phú là làn hỗ trợ bên cạnh để nghiệm thu UI độc lập. Dùng chung port/
  reader/DTO, không viết lại component khi chuyển nguồn. Không thêm banner vàng.
- Source committed, source đã qua R2, code landed, runtime installed, source
  qualified, consumer ACK và browser acceptance là các mức khác nhau.
- **Không có goal đang hoạt động** theo công cụ tại lượt bàn giao. Không tạo
  task nền mới, không SSH, build, đổi DB/quyền/dịch vụ hay dọn worktree.

## 2. Đọc theo thứ tự — tránh dùng ghi chú OPEN đã lỗi thời

1. Root `AGENTS.md`, `CLAUDE.md`, Unified §14 và
   [campaign rules](../../AGENT_WORKING_RULES.md), nhất là §7, §10.10c/d,
   §10.13 (Claude được giao cả backend) và §10.14 (fixture đủ dữ liệu).
2. File này, rồi
   [kế hoạch G0–G7 gốc tại Research](/home/bobby/portal-research/upgrade/execution_loop/evidence/ELP2-10/CODEX_CLAUDE_BACKEND_CONTINUATION_PLAN_20261124.md).
   Addendum mới thắng dòng lịch sử; không xóa failed attempts.
3. [G1 source/receipt](CODEX_G1_QUANTBT_IMPLEMENTATION_20261124.md),
   [G2 source/receipt](CODEX_G2_IMPLEMENTATION_20261124.md),
   [G3 source/receipt](CODEX_G3_IMPLEMENTATION_20261124.md) và
   [G3 consumer/producer/restore checklist](CODEX_G3_FINAL_CLAUDE_HANDOFF_20261124.md).
4. Các quyết định/thiết kế 23 Nov tại Research:
   `OWNER_DECISION_ACCESS_ROLES_20261123.md`,
   `CORE_DESIGN_ORDINARY_QUALIFIED_READ_PATH_20261123.md`,
   `CORE_DESIGN_ORDINARY_OWNER_COMMISSIONING_20261123.md`,
   `CORE_DESIGN_OBSERVED_MODE_20261123.md`.
   Formula Score đã chọn; không hỏi lại formula hoặc Paper OKX PnL đã trả lời.
5. Packet phase sở hữu và latest consumer receipt/request trước mỗi gói.
   Đọc `evidence/UXM-07/backend-requests.md`, `debt-register.json`,
   Source Truth Board và sync trên **nền source hiện hành**, không biến toàn bộ
   danh sách C1–C7/R-A…D tháng10 thành việc phải viết lại.

## 3. Source chính, mailbox và checkpoint

| Vai trò | Worktree / branch | Pin trước lượt docs này |
| --- | --- | --- |
| Source mới, nơi tiếp tục code | `/home/bobby/portal-t3-core-20261122` · `integrate/v13-candidate-20261122` | `78f3d01b65354011262c36c748d427a5cd1707aa`, tracked/untracked sạch |
| Historical Research / mailbox Edge | `/home/bobby/portal-research` · `docs/research-loop-plan` | `9d6a52b7624791a7808b0979da3f15419170f601`, 1 tracked WIP +595 untracked |
| Common Git repository | `/home/bobby/portal` | Các worktree dùng chung refs, không phải repo độc lập |

G1/G2/G3 và restore follow-through đều đã xác minh là ancestor của source78f.
Research chỉ nhận bản sao tài liệu; **không có nghĩa code mới đã được merge
vào cây Research cũ**. Không merge toàn lịch sử Research vào v1.3, không tự
cherry-pick lại code Access/Observed đã tích hợp. Claude tiếp tục từ checkpoint
source trên; nếu tách làn thì giữ baseline này và một người tích hợp.

Diff tổng hợp `cc861d38e..78f3d01b6`: **130 file, +16.033/−88**. Đây là kết quả
gộp code Claude/Codex/tests/generated/docs, không phải toàn bộ code do Codex
viết mới. Phân nhóm theo path (mỗi path chỉ một nhóm):

| Nhóm | File | + / − |
| --- | ---: | ---: |
| Core source/migration | 42 | 3.453 /47 |
| Core/FE/Portal test paths | 40 | 3.606 /15 |
| Contracts/generated/fixtures | 31 | 7.382 /17 |
| Frontend binding/routing source | 2 | 37 /4 |
| Portal Python source | 1 | 19 /4 |
| Tooling | 2 | 25 /0 |
| Docs/indices | 12 | 1.511 /1 |

Đây là diff giữa hai checkpoint, **không cộng shortstat từng commit** có sửa
trùng file để báo tổng. Không thay layout, màu, typography hoặc baseline.

## 4. Đã hoàn thành ở mức source — không làm lại

| Gói | Commit source | Thực sự đã có | Giới hạn còn lại |
| --- | --- | --- | --- |
| G1 QuantBT | `14368c9c3876bc289a08feac0018cd0e27e2f4ae` | Producer Overview dùng EvidenceFlow thay legacy; exact definite pre-dispatch refusal settle transaction; UNKNOWN không tạo run mới | Orphan cũ và browser/runtime pairing chưa xử lý; không suy SQL thành engine outcome |
| G2 Access/Observed | `e89b223996d5ebc191460ca44944230ea7ca80cb` | Exact identity/owner ceiling, bounded file intake/CLI, offline lifecycle; same-MVCC capture, census/freshness, lossless IDs; canonical contract | Access chưa install, Observed OFF; consumer ACK/browser/production coverage riêng |
| G3 authority/profile | `d402a594e28984498b9d36efbe90599ac7d9c394` | Migration159; ordinary DB CAS/immutable lineage; renewable/hot-add/delegation; explicit profile selection/budgets; producer seam | Chưa installed authority, producer nguồn thật hay accepted Edge wire |
| G3 restore follow-through | `be26f15bb6ca2ba091981c563b7832530dae0707` | Independent checkpoint capture/ordinary inventory; stale same-name clone bị verifier mới từ chối; legacy inventories không âm thầm bỏ ordinary | R1, UNMOUNTED; MATCH_NOT_CUTOVER, chưa full V2 recovery fence |

### Test đã chạy — reuse đúng dependency, không cộng trùng

- G1 normal R2 hook exit0: contracts1.962, Core12.813 PASS /
  1 expected-fail /166 SKIP; build/PG restore/tracking PASS. Focused
  FE166/Core54/Python5/PG7 nằm trong receipt, không cộng thành coverage mới.
- G2 normal R2 hook exit0: contracts1.978; Core12.947 PASS /
  1 expected-fail /166 SKIP; build/restore/tracking PASS. A1–A4/O1–O6 đã có
  disposition source ACCEPTED, **không còn là các bug chưa sửa**.
- G3 d402 normal R2 hook exit0: contracts1.995; Core13.101 PASS /
  1 expected-fail /166 SKIP; build/restore/tracking PASS.
- G3 be26 mới hơn lần R2 đó: ordinary real-PG7 unique PASS, legacy PG10 PASS,
  pure21 PASS, cả hai Core typecheck project exit0. **Chưa R2 trên combined
  be26+consumer candidate**; không mượn hook d402 để chứng minh code be26.
- Các lần fail/retake được giữ trong receipt. Không chạy lại full hook chỉ
  để ghi tài liệu này. Runtime thật, browser và source authority không được
  chứng minh bằng các test trên.

## 5. Những việc đang dở — thứ tự Claude nên lập lại kế hoạch

Từng hàng dưới là phần còn lại của G0–G7, không phải một campaign mới hoặc
quyết định tự mở tất cả runtime. Với mỗi hàng, trả riêng source/consumer/runtime
disposition, owner, test và exit. Làm lane độc lập, không chờ đủ cả Edge bundle.

| Ưu tiên / owner kế tiếp | Việc phải làm | Exit / bằng chứng cần |
| --- | --- | --- |
| P0 · Claude consumer | G3 `profile_id`: cả dataset/series strict readers, encoder, query match, Fleet filters **và publication probe**, workspace/profile/cursor/cache identity; pending Paper A→B, revoke | Old/new bodies và canonical vectors qua reader; wrong workspace/profile/ALL negatives; consumer ACK trước API rollout. Giữ component/design |
| P0 · Claude Core | Preserve/validate metadata vật lý trong `paper-read/manager-records.ts`; `execution/profile-projection.worker.ts` không stamp legacy catalogue constant thành physical source proof | Bounded genuine metadata/provenance, exact snapshot/current head và publication pair; source mismatch/changed head/revoke negatives. Không `verify=>true` |
| P1 · Claude G3 producer | Map existing authoritative Edge export thành normalized Manager identity/Fleet producer theo profile; reuse source-as-is adapter nếu tương thích | Full correlated population tại cut, binding/assignment revisions, currentness/rebuild semantics; real source qualification. Không ép TS ký wire mới chỉ vì signed factory là proposal |
| P1 · Claude G2 consumer | Separate Observed port/adapter theo generated type + fixtures; giữ SCOPED_V2 typed409 không legacy fallback, per-currency census/coverage và source clocks | Parser/query/negative tests + ACK; flag vẫn OFF đến activation đúng scope. Actual browser khác unit fixture |
| P1 · Claude G1 follow-through | R-P04-001 orphan `rrun_8b7b1831d95c38e2ff1a509288356848`: kiểm lease/worker/artifact mới, dùng official cancel nếu được phép; R-P04-002 `rrun_ee2a335d9de38bf91477910e20a7b43c` cho Overview/Report | Runtime disposition có reason, không ép FAILED từ 503 cũ. Reuse run thành công, không chạy engine lại vô ích. Stable QuantBT enablement là gói riêng |
| P1 · Claude G4 | Accounts/Portfolio/Exposure/listFigures cùng snapshot/quyền/currency; Contributors group pagination, dataset/series NET_PNL và shared-account ownership/census; Core PARTIAL/cursor/ladder xử lý đúng | Exact decimals/null/dedup, authorized query totals, source/revision tie-out; thiếu carrier/census vẫn typed absence, không đổ Core mid-drain cho Edge |
| P1 · Claude G4 | Finite readers/sibling, Approval Evidence/equity: rà actual HTTP mount/composition/custody đã có rồi hoàn thiện field authority/mapping còn thiếu; metadata account/order/session, fees/VWAP/timing và health | Principal/workspace/resource/field fence đến lúc HTTP send; source-dark safe, revoke/cursor/export/cache negatives. Không viết lại bốn route như thể chưa tồn tại |
| P1 · Claude G5 | STATUS/recovery: reuse durable context–original–lease và OS-process tests; hoàn thiện giao gateway/terminal/ACK cùng original, capacity/idempotency/custody | Mất response/restart/retry không intent mới; ACK thật và terminal đối chiếu qua Edge mới là connected PASS; không bật submit/Live |
| P1 · Claude G5 | Recovery V2: independent nonrollbackable authority floor, quiescence/fencing, old holder/HTTP delivery, post-snapshot terminal/ACK reconciliation | Populated source/custody drill và prevented stale authority, không chỉ MISMATCH diagnostic. New ordinary verifier không thay C2 barriers |
| P2 · Claude G4/G7 | History lớn/byte budget/HISTORY độc lập; Operations health đúng toàn tập; Calendar provider; Score input/calibration/horizon/population | Real source + permission + pagination/recovery/tie-out. Calendar vẫn nguồn chưa xác nhận trong checkpoint, không fake AVAILABLE; formula Score không đổi |
| P2 · Claude phối hợp Edge G6 | Ordinary data path theo family/profile; native READ/STREAM/HISTORY riêng, strict active-revoke, HTTP/drain, cache/cursor/restart/recovery | Core chuẩn bị đủ trước window; paired current trust/source/right receipts. Không dùng expired binding, NOOP_EXPIRED hoặc stream đã đóng làm PASS |
| Cuối · Claude G7 | ELP2-10 gate→source/dependency hash→receipt reuse/retake; target/bounds/calibration, coexistence/G2; browser UXM-08/09/10 | Mỗi gate có disposition kiểm chứng được. Approved target/bounds trước tải; fixture/source/connected/browser riêng |
| Cuối · Claude G7 | ELP2-11 migration159 impact + representative historical clone, ownership/ACL/trigger/compatibility/restore/rollback, final integration candidate/manifest | Final selected source/dependency pins, actual rehearsal/gates. Không tự merge dev/main, tag, signed release hoặc deploy |

### G3 consumer checklist chính xác

Đọc nguyên §2 của [G3 handoff](CODEX_G3_FINAL_CLAUDE_HANDOFF_20261124.md).
Các file tương đối dưới `apps/portal/frontend/src/execution/v2/`:

1. `readers/managerDataset.ts` và `readers/managerSeries.ts`: optional
   `profile_id` không thành key bắt buộc; expose opaque `profileId`.
2. `api/managerDatasetQuery.ts`, `ports.ts`, `httpApi.ts`, `fixtureApi.ts`:
   encoder, response match và workspace đúng, omitted default hợp lệ.
3. `screens/fleet/fleetDatasetModel.ts`, `screens/fleet/useFleetDataset.ts`
   và callers: dataset **và useDatasetPublication** cùng profile/workspace.
4. JSON query/full-URL cache đã có identity; không cần rewrite toàn bộ cache.
   Không tự union hai Paper profile, không suy profile ID từ environment/venue.
5. Contract/fixtures ở `packages/contracts/{generated,fixtures}/` đã publish.
   API concrete response sẽ thêm profile_id ngay cả omitted query; closed old
   parser từ chối nên **không cài backend mới trước compatibility ACK**.

## 6. Request Claude/Edge còn cần giữ nguyên ID và semantics

- R-A/B/C và FE-xxx/DEBT-xxx tháng10: đọc latest follow-through/consumer receipt
  trước triage. Contract/fixtures/routes phần lớn đã có; không reopen chỉ từ
  `CLAUDE_TO_CODEX_OPEN_REQUESTS_2026-10-29.md`. R-B snapshot/visibility và
  R-C source qualification vẫn phải đối chiếu thực tế; fixture nối màn không
  là evidence producer thật. R-D nếu tái hiện giữ nguyên assertion, calls và
  worker count; không nới assertion để xanh.
- G4 giữ original IDs: FE-CAT-4/DEBT-052 (Accounts batch), FE-067/072 (scoped
  runtime/session), FE-050/051/052 (metadata), DEBT-029 (NET_PNL),
  FE-CAT-2 (health). Những dòng đã delivered có locator thì reuse, không
  sinh request trùng; actual remaining gate là qualification/runtime tie-out.
- Research P23/P24 và Governance đọc
  [queue gốc](/home/bobby/portal-research/upgrade/research_loop/CODEX_BACKEND_GAPS_2026-09-30.md)
  §60/latest receipts, không suy closed từ release v1.3.0. T02/T14, cross-loop
  journey và actual writes/SoD/access cần đúng candidate/runtime scope.
  Giữ ngoại lệ **83/86 đúng ba manifest test**, không rewrite thành 86/86.
  Những gate đã PASS không đổi dependencies không chạy lại toàn bộ.
- Revoke decision Bobby đã chốt: chặn ENTER mới; cho authenticated RESOLVE
  **terminal-only của đúng transaction đã vào** để không bỏ treo committed work.
  Revision hiện global là hàng rào bảo thủ; owner-local revision là slice riêng,
  không âm thầm thay semantics để khớp nguồn.
- C2/A2/B2: giữ latest source/trust/authority contracts và seal actual, không
  ký B2 trước C2_SEALED hoặc dùng static validation làm full A2 READY.
  Receipt/cert/window cũ phải revalidate; tài liệu bàn giao không tái cấp quyền.

### Edge — một đầu mối, chỉ hỏi delta còn thiếu

Research mailbox là `/home/bobby/portal-research/upgrade/execution_loop/evidence/ELP2-10/`.
Latest local source returns đã đọc: `CORE_REQUEST_TS_EDGE_REMAINING_GAPS_20261123.md`
và `CORE_REPLY_TO_TS_ANSWERS_20261123.md`. Chúng **báo** Paper21/21 mỗi profile,
Sandbox15/15, Live17/17; lượt này không đọc runtime lại và không qualification mới.

- Đã nhận ba physical pin triples trong `access-profile-pins.ts`; không xin
  gửi lại OKX/Paper Binance/Sandbox. Live profile-selection artifact còn thiếu
  là blocker riêng Live, không chặn ba profile kia.
- `command_journal` PARTIAL là Core ladder mid-drain; durable history mirror
  là Core, không tự gọi missing Edge history route. OKX zero rows được báo true-empty.
- Cần locator/export/schema/example **đang có** cho Fleet member tuple,
  owner/binding/assignment revision, full population tại cut/currentness/rebuild;
  chỉ xin field/proof thật sự chưa có. 21 bounded relations không tự thành
  normalized `alpha_fleet_overview`.
- Financial chỉ thêm ownership/census/valuation proof cho facts đang publish;
  identity-only Fleet không đợi Score/financial đầy đủ. Calendar provider
  chưa xác nhận; gateway STATUS cần original/right/terminal/ACK thật.
- Ordinary worker→Edge data path liên tục **khác** native08/read09 finite window.
  READ không cấp STREAM/HISTORY, grant không tự tạo source-qualified producer.
- Kênh hiện hành **pull-only**, không lặp SSH polling HK. Claude dùng bridge
  `bridge:session_01KJ3q3D7MxRhDR25YURnNEm` nếu công cụ thực sự có và file
  mailbox công khai. Server accepted không là delivery confirmed.
  Lượt này chỉ publish local, chưa gửi/nhận remote ACK. Không gửi secret values.

## 7. Work-in-progress phải giữ — đã kiểm trực tiếp lượt này

### Hai làn Claude gần nhất

Access `feat/access-profiles-offline-20261123@cc861d38e` hiện **10 untracked**
(tăng so với original7 trong receipt G2): toàn bộ10 file byte-identical với
source78f. Bao gồm Access artifact/operator/files/pins, build/install CLI,
ordinary install dry-run và3 test/fixture. Không merge/commit lại chúng đè source.

Observed `feat/observed-mode-20261123@b34eb1582` hiện **6 tracked +1 untracked**:
service, figures, manager-records và4 test files. Năm file giống hệt source;
hai khác biệt đã đọc: figures chỉ extra blank line, figures test thiếu hai
assertion/census fixture corrections đã sửa trong source. **Không có backend
delta mới cần nhập từ các file này ở checkpoint này.** Giữ nguyên bản gốc.

### Historical Research và các làn cũ

- Research1 tracked WIP:
  `upgrade/execution_loop/evidence/ELP2-10/CORE_ACCEPTANCE_REMAINING_MAP_V2_20261115.md`,
  SHA256 `1a655f6c335151a5249a68d943fd47afcf7266f67fc6b523a41130ba57da0c35`.
  Không sửa/stage nó trong lần bàn giao.595 untracked là backlog nhiều gói,
  không phải595 file đã review/được phép commit. Chọn từng public artifact khi cần.
- `portal-research-fe`: 3 tracked (`be-p23-users-roster-keyset.pg.spec.ts`,
  Unified, sync) +8 untracked public receipts tháng10; không blanket stage.
- `portal-research-ft`:3 untracked nginx ordinary/backup include files;
  source bytes không tự là config được cài hoặc được phép dùng lại.
- `portal-elp2-integrate-20261028`:3 tracked FE canary/Fleet tests; cần
  nội dung/diff review nếu lấy, không coi là component redesign.
- `portal-core009-revoke-denial-20261022`:2 tracked
  `read-scope.ts`/`native-manager-preparation.spec.ts`; source commit ancestor
  không chứng minh **working diff** đã tích hợp.
- `portal-elp204-fixture-repair`:2 tracked PG fixture/runner files;
  `portal-contract-elp210`:1 tracked Unified +2 untracked receipts.
- Root `portal`, native-semantic lane và successor lane còn untracked;
  UXM07-RA có16 tracked/590 untracked. Dev/main checkouts có nhiều tracked
  differences: **không gộp, reset, stash hoặc dọn các checkout đó**. Counts
  trong appendix không phải kết luận ai sở hữu hoặc tất cả đều cần merge.
- AI Native branches là scope riêng; giữ commits nhưng không tự đưa vào gói
  Manager/QuantBT chỉ vì dùng cùng repository.

### Quy trình không mất code

Pin SHA + dirty-path/digest trước mutation; đọc patch-equivalence/content
thay vì chỉ nhìn ahead count. Lấy từng checkpoint source cần thiết, hòa giải
semantics hai phía; generated outputs sinh lại bằng script repo, không ours/theirs
cả file. Không drop/reset/stash chung, không bỏ docs/evidence. Tách original WIP
ra khỏi code đã landed. Cuối cùng một candidate sạch + một R2 phù hợp trên
code tree đã đóng băng trước hạ cánh; docs-only không lặp full hook.

## 8. Lịch làm gọn, test, tài nguyên và rollback

Đề nghị Claude replan thành ba lane, primary giữ contracts/generated/migration
numbering/index/integration, **một writer mỗi file**:

1. Consumer G3+Observed và tests; không thay accepted design.
2. Core metadata/provenance và normalized identity producer; tài chính triển khai
   sau khi semantics rõ, không chặn lane1.
3. STATUS/DR qualification preparation, độc lập với consumer/identity; source
   missing chỉ chặn connected lane tương ứng.

Chỉ spawn/reuse agent cho approved disjoint work, không chia shared contract
cho nhiều writer. Focused tests theo gói, một integration R2 cuối; test đã xanh
và unchanged dependency thì reuse có giải thích. Mọi heavy build/test phải qua
`/usr/local/bin/primus-build -- COMMAND ARGS...` (không sudo launcher), aggregate
3CPU / memory.high6GiB / memory.max8GiB; exit75 thì đợi, không bypass.
Không chạy G2 thật với fixture constants hoặc proposal bounds chưa được duyệt.

Ordinary restore overlay hiện độc lập và **không cài**. Đừng chạy migration
trên shared DB chỉ vì file159 đã commit. Rehearsal dùng disposable DB/volumes,
kiểm owner/ACL/trigger/dữ liệu/custody/dump restore và cleanup đúng cell.
Source rollback khác DB rollback; immutable audit/grants không được xóa để rollback.

Giữ archive/receipts và rollback images, chỉ dọn tài nguyên mình tạo đã xác định.
Lượt này không tạo container/image/server/test DB, không broad prune và không
chạm process của người khác. Các cell G1/G2/G3 trước đã có cleanup receipt;
không gọi số capacity point observation là SLO/G2 measurement.

## 9. Evidence và private references — không cần xin lại token

Public source receipts §2 giữ exact commands, failed attempts, dependency hashes,
resource/cleanup và limitations. Local task state:

- `/home/bobby/.local/state/portal-integrations/20261124-g2-implementation/`:
  ACCESS_WIP_ORIGINAL manifest/archive, G2 source bundle và normal-hook.log.
- `/home/bobby/.local/state/portal-integrations/20261124-g3-implementation/`:
  test-results.json, ordinary/legacy/pure restore logs, final typecheck, failed
  retakes, `g3-ordinary-restore-source.bundle`.
- G3 source bundle SHA256:
  `10f658372cb1d7fa05446bc2b653e5478042785e3188ff7be6395992b7c27bde`;
  source `be26f15bb`, prerequisite `974b0435b`, prior verify PASS.
  Bundle không thay full repo baseline hoặc chứng minh runtime install.

Không đọc/in cookie, token, private key hoặc mật khẩu vào handoff/log/Git.
Gói trust thật nằm kênh riêng, chỉ ghi path/hash/expiry đúng quyền; private
reference cũ không tự là còn hạn. Deployment/tag v1.3.0 được journal báo trước
đó; **lượt này không kiểm actual image/config/schema của host nào**.
Không kết luận backend mới đã lên dev/stable/research từ release version.

## 10. Claude trả ACK và kế hoạch lại như thế nào

Đầu round trả source/worktree/full SHA/dirty state đã đọc và:
`ACCEPTED_TAKEOVER` hoặc `CHANGES_REQUESTED` với locator. Tiếp đó cập nhật
**các packet/ledger gốc**, không tạo một board OPEN khác:

- Mỗi G1…G7: ALREADY_DELIVERED_WITH_LOCATOR / ACT_NOW / NEXT_GATE /
  NEEDS_OWNER_DECISION; người làm, source/consumer/runtime riêng.
- Ba gói đầu, file allowlist từng writer, test tối thiểu, dependency/exit,
  request thật còn thiếu qua Edge, browser Claude nối được gì ngay.
- Cuối mỗi slice: đã sửa/commit/stat; actual tests và cleanup; nợ owner/action;
  backend next, consumer next, request/ACK và gate chưa chạy.
- Source đã đủ an toàn mà còn dark có thể tích hợp theo approved lane/gates;
  không bắt chờ toàn bộ connected source. Nhưng không đổi dark thành qualified,
  không tuyên bố đóng ELP2-10/11 hoặc release khi mandatory gate còn mở.

Verification lượt bàn giao: **R0 Markdown only**. Kiểm links mới, tracking và
staged diff trước commit; không chạy lại full build/hook. Kết quả publication
được ghi trong commit message và sync; Claude/Edge ACK vẫn cần phản hồi thật.

Kết quả R0 thực tế: diff whitespace PASS;26 local links (gồm10 index entries)
ở hai checkout PASS, hai bản handoff byte-identical; execution tracking
PASS ở cả hai checkout. Plan addendum liên kết đúng file này. WIP Research hash
không đổi, source HEAD không đổi trong lúc kiểm. Commit chỉ explicit Markdown;
full hook/build/browser NOT_RUN vì không đổi code/dependency/runtime.

## Appendix — toàn bộ worktree đã thấy, không phải lệnh merge/dọn

Snapshot read-only 25Nov2026. T/U = tracked/untracked differences.
N = commits HEAD không reachable từ source78f; **không phải số feature còn thiếu**:
cherry-pick/squash/historical divergence có thể đã giữ nội dung. N0 cũng không
chứng minh dirty patch đã được nhập. Short SHA chỉ cho sơ đồ; full source pins
ở §3, full branch refs đọc lại trước khi sửa. Tất cả paths dưới `/home/bobby/`.

| Path | Branch (hoặc detached) | HEAD | T/U | N |
| --- | --- | --- | ---: | ---: |
| portal | fix/stan-context-password-change-origin | 87d9d98c3 | 0/244 | 0 |
| .worktrees/portal-execution-native-core-integration | feat/execution-native-read-integration | b87f73dbd | 0/0 | 1 |
| portal-ai-native-integration | chore/ai-native-integration-20261104 | d8c465fe2 | 0/0 | 379 |
| portal-ainative-merge-20261122 | integrate/ai-native-on-research-20261122 | efaec6f5a | 0/0 | 380 |
| portal-alpha-fixture-fix | fix/fixture-research-alpha-stage | 78b0a8477 | 0/0 | 135 |
| portal-alpha-stage-followthrough | fix/research-alpha-stage-followthrough | 837eae444 | 0/0 | 138 |
| portal-contract-elp210 | chore/elp210-served-contracts-frozen | a5194757e | 1/2 | 2 |
| portal-core-small-20261121 | integrate/core-small-20261121 | 14939e362 | 0/0 | 20 |
| portal-core009-integration | chore/core009-connected-20261021 | 9d88e40a9 | 0/0 | 2 |
| portal-core009-revoke-denial-20261022 | chore/core009-revoke-denial-20261022 | 29f57e363 | 2/0 | 0 |
| portal-core009-successor | chore/core009-successor-20261021 | 3d4164bdf | 0/1 | 0 |
| portal-dev-certified | dev | b58d21e54 | 810/0 | 0 |
| portal-dev-port-20261116 | proposal/okx-paper-profile-slot-20261118 | 73dfbf9fc | 0/0 | 14 |
| portal-domain-events | proposal/census-versioned-compiler-20261116 | 6adb3808d | 0/0 | 3 |
| portal-edge-scoped-notices-20261026 | chore/manager-scoped-notices-20261026 | 151f55afc | 0/0 | 20 |
| portal-elp2-candidate-20261104 | codex/elp2-candidate-20261104 | c61f60b8e | 0/0 | 0 |
| portal-elp2-integrate-20261028 | chore/elp2-integrate-20261028 | 9b8d4ed2c | 3/0 | 203 |
| portal-elp204-fixture-repair | chore/elp204-target-expiry-fixture | 734353113 | 2/0 | 1 |
| portal-fixture-support | chore/complete-fixture-review-20261023 | af51059b1 | 0/0 | 19 |
| portal-integration | docs/consolidation-closeout-20260919 | c43ee0317 | 0/0 | 2 |
| portal-main-release | main | 226dc6005 | 813/0 | 0 |
| portal-native-semantic-review | fix/native-semantic-roundtrip-20261025 | 56f4cf4b6 | 0/1 | 0 |
| portal-paper-okx-p2-20261119 | proposal/paper-okx-phase2-20261119 | 21cd66cf8 | 0/0 | 19 |
| portal-pin-allowlist-20261122 | integrate/pin-allowlist-20261122 | d680c482f | 0/0 | 1 |
| portal-research | docs/research-loop-plan | 9d6a52b76 | 1/595 | 255 |
| portal-research-be | codex/be-gaps | d5d31cbd7 | 0/0 | 0 |
| portal-research-fe | claude/post-freeze-20261021 | 3aaf24f4e | 3/8 | 0 |
| portal-research-fe2 | claude/step-b-integrate | 69122c46f | 0/0 | 1 |
| portal-research-ft | claude/slice-followthrough | 98eb28341 | 0/3 | 4 |
| portal-research-okx-20261118 | proposal/research-okx-20261118 | 6f325eafb | 0/0 | 7 |
| portal-research-ol-p22-p24 | codex/research-ol-p22-p24 | 73af8d21e | 0/0 | 0 |
| portal-research-pristine-20261118 | detached | 600a58825 | 0/0 | 0 |
| portal-t3-core-20261122 | integrate/v13-candidate-20261122 | 78f3d01b6 | 0/0 | 0 |
| portal-tsc-base-20261116 | detached | c43ee0317 | 0/0 | 2 |
| portal-uxm07-ra | fix/uxm07-ra-variant-20261029 | d67730fe5 | 16/590 | 0 |
| portal-vis-6c3-20261122 | detached | a16dfdd9b | 0/0 | 0 |
| portal/.claude/worktrees/agent-a32d32e549a677a8b | feat/observed-mode-20261123 | b34eb1582 | 6/1 | 1 |
| portal/.claude/worktrees/agent-a70f0c149da09bdaf | feat/access-profiles-offline-20261123 | cc861d38e | 0/10 | 0 |
| release-v120-20261119/wt | main | 226dc6005 | 0/0 | 0 |

