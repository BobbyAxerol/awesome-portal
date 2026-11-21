# P13–P17 — Astra cross-review và kế hoạch đóng gap trước P18

Date: **2026-09-22**. Status: **AUDIT_COMPLETE / REMEDIATION_PROPOSED — chờ Bobby duyệt từng slice**.

Live phase index: [Unified §13](../UNIFIED_IMPLEMENTATION_PLAN.md#research-loop-v11).
Đây là audit/guide bổ sung cho **P13–P17 hiện hữu**, không thay guide 24 phase,
không mở campaign hoặc tracker độc lập. Lượt này không sửa implementation,
schema, generated client, frontend, runtime hay deployment.

## 1. Kết luận và phạm vi kiểm chứng

**Chưa nên vào P18.** Foundation có giá trị và cần giữ lại, nhưng “current-source
compatibility complete” chưa tương đương hoàn thành mục tiêu P13–P17. Có lỗi
tính toán/contract tái hiện được; đồng thời adapter Portal đang chỉ khai thác
một fixed-parameter smoke path rồi coi nhiều phần chưa nối là thiếu ở engine.

Không cần viết lại hệ thống, nâng QuantBT hay yêu cầu Trading System/AWS-HK
cho những thiếu sót đã chứng minh dưới đây. Cần sửa đúng Research adapter,
retained evidence, read models và nghiệm thu theo guide gốc.

### Baseline và ownership

| Phase | Commit được audit | Surface |
|---|---|---|
| P13 | `bd1d70c5` | evidence source, metric registry, persisted Hub/series |
| P14 | `975772c6` | chronology/split source và reader |
| P15 | `ddd2cfa4` | current fixed-profile Search reader |
| P16 | `622c10c3` | retained-binding Freeze verifier |
| P17 | `742b1e9d` | sampled-equity playhead/cursors |

Worktree `/home/bobby/portal-research`, shared branch `docs/research-loop-plan`;
base trước P13 là `00b5114b`. Đối chiếu guide P13–P17, specs S04–S08, năm
handoff, implementation, migrations, generated contract/tests và P04/P05/P10/P11
boundaries. Các thay đổi P12 FE chưa commit của Claude được giữ nguyên.

Audit chạy local diagnostic tests/probes, **không** gọi production, không SSH,
không đọc business DB, không chạy worker/runtime, không mở flag. Không có
browser/HiFi receipt mới trong lượt này: P13–P17 FE chưa được nghiệm thu;
không dùng đọc HTML/spec để nhận là đã kiểm pixel.

### Phần làm tốt — không đập bỏ

- Named same-origin BFF, generated contracts, session/workspace checks;
  browser không có worker/source filesystem/DB authority.
- Immutable source receipts, terminal digest pairing, duplicate/conflict
  checks, append-only guards và role grants. Không phát hiện nhu cầu bỏ các
  hàng rào này để hoàn thành UI.
- Feature-dark defaults; không chạy engine khi mở/seek màn; giữ exact-value
  strings, UTC milliseconds, typed missing states và không bịa fills từ equity.
- `PARTIAL_MATCH` không tự xưng artifact verification; retrospective equity
  không tự xưng execution state. Giữ các phân biệt đúng này.

## 2. Source-as-is: phần nào thật sự có, phần nào chưa được chứng minh

Installed package là `quantbt-engine==1.1.1`. Public result/endpoint inspection
và một real-engine golden-fixture WFO test cho bằng chứng sau:

| Nhóm | Bằng chứng local | Phân loại đúng / việc Portal cần làm |
|---|---|---|
| Equity, returns, positions, report metrics | Public `BacktestResultV2`; probe signal-notional 40 bar trả positions 40 row, equity/returns và metric report | **Có ở engine, adapter P13–P17 đang bỏ một phần.** Retain/schema/map trong Research-owned lane |
| Search/WFO | `test_advanced_runner_completes_and_writes_artifacts` **PASS**, real QuantBT + Delta strategy trên golden synthetic market; assertions đọc selected params, stitched series, folds, trials, candidates, fold-boundary artifacts | **Không phải engine-wide source gap.** Nối public API vào isolated Research producer; không gọi lại legacy runner trên product route |
| Các route khác | Public constructors/capability contracts tồn tại; P04 qualification chỉ admit fixed Delta signal-notional | **Chưa đủ evidence cho từng route.** Qualify đúng route/profile trong ma trận guide; không suy tất cả đã chạy được chỉ từ method tồn tại |
| Orders/fills/trades cho signal-notional probe | Các tuple ledger rỗng dù report `num_trades=3` | Không dựng 3 trade rows từ aggregate. Xác định route-specific output/artifact thực; ledger của probe này chưa có |
| Byte integrity của artifact do Portal tạo | P05 disk-first manifest/reader; P11 thực sự seal bundle và phát digest/size | Có foundation và retained facts để nối verifier. **Không phải chờ engine phát một cơ chế integrity mới** |
| Benchmark, broker-grade ACK, strict causal certification, holdout unlock | Chưa được chứng minh bằng các probe này; holdout mutation còn phụ thuộc authority DR-01 | Giữ absent/unasserted đúng scope. Không biến kết quả WFO test thành chứng nhận causal, không tạo unlock/governance mới |

**Phân loại bắt buộc khi sửa:** `AVAILABLE_DIRECT`, `AVAILABLE_DERIVED`,
`PORTAL_ADAPTER_NOT_IMPLEMENTED`, `NOT_RETAINED_LEGACY`,
`NOT_APPLICABLE_TO_ROUTE`, `SOURCE_UNSUPPORTED_CONFIRMED`,
`AUTHORITY_UNRESOLVED`. Đây là vocabulary của coverage/audit; không tự đổi wire
enum v1. Wire enum mới phải version/generate/test trước khi Claude consume.

Một DTO thiếu field chỉ chứng minh **DTO chưa publish**, không chứng minh
QuantBT không có field. Run fixed đã lưu vẫn là fixed; không retroactively
gắn trial/selection/fold vào lịch sử. Facts chưa retain không được lấy lại
bằng cách ngầm rerun engine khi GET; run mới phải có intent mới.

## 3. Findings — lỗi và thiếu sót có bằng chứng

Mức **High** là chặn integrity/correctness hoặc original-scope acceptance;
**Medium** là robustness/consumer alignment cần đóng cùng slice. Không có
khẳng định production incident hoặc khai thác security trong audit này.

### A01 · High · Calendar returns, histogram và evaluation scope chưa đúng

**Locator:** [research_child.py](../../apps/portal/backend/src/portal_api/workers/research_child.py),
`_p13_evidence_source`, `_return_distribution`;
[metric registry](../../apps/control-api/src/research/evidence-metric-registry.ts).

- Monthly return tính `last / first_in_same_month - 1`, làm mất return từ
  previous-month close tới bar đầu tháng mới. Probe Jan30/Jan31/Feb1/Feb2,
  equity `[100,100,120,132]`: February trả **10%**, reference previous-close
  là **32%**. Đây là sai công thức, không phải display rounding.
- Với returns `[0,0.1]`, bucket cuối `upper_exclusive='0.1'` vẫn đếm giá trị
  `0.1`: endpoint semantics của histogram mâu thuẫn payload.
- Monthly bị cắt `[-120:]` không có coverage/truncation riêng; monthly và
  rolling dùng lại sampling metadata của equity. Count/frequency/population
  phải của đúng series, không chỉ một nhãn sample chung.
- Code review: warmup được công bố `WARMUP_NOT_SCORED`, nhưng child backtest
  nhận toàn tape warmup+IS+OOS; `bars=len(market)` và report trade count lấy
  toàn tape. Registry ghi `IS_PLUS_OOS` chưa chứng minh loại warmup. OOS return
  bắt đầu bằng first OOS equity cũng cần chốt boundary/carry convention.
  **Chưa có end-to-end warmup differential receipt**: cần test, không kết luận
  mọi OOS metric chắc chắn sai chỉ từ nhận định này.

**Đóng bằng:** independent full-resolution reference vectors, calendar UTC,
first/partial month, first OOS bar, warmup scoring/carry tests; histogram
closure rõ; coverage và sampling per series; append corrected transform
revision, không ghi đè immutable output cũ.

### A02 · High · Bounded point count không bảo đảm bounded receipt bytes

**Locator:** cùng child ở A01;
[research_progress.py](../../apps/portal/backend/src/portal_api/services/research_progress.py)
`_MAX_EVIDENCE_BYTES`, `store_evidence_source`;
[durable_worker.py](../../apps/portal/backend/src/portal_api/workers/durable_worker.py).

Probe 1.000 hourly observations với `equity=20000*(1+0.0001*i+0.002*sin(i/7))`
tạo receipt **33.542 byte** (192 equity points, 188 rolling points), lớn hơn
trần journal **28.672 byte**. Worker store receipt trước seal/completion;
store sẽ từ chối payload này dù compute đã hoàn tất. Schema point caps không
bảo vệ được valid large run khỏi late failure.

**Đóng bằng:** byte budget end-to-end (child IPC → journal → callback → DB),
worst-case decimal/timestamps/month counts; full-resolution data nằm trong
P05 retained artifacts, callback chỉ compact metadata/digests. Nếu cần budgeted
sampling của v1 thì phải deterministic, giữ required extrema/endpoints,
publish emitted/coverage và không tính metric từ sample. Không chỉ tăng trần.

### A03 · High · Split validator nhận khoảng thời gian âm

**Locator:** [progress.contract.ts](../../apps/control-api/src/research/progress.contract.ts)
`ResearchSplitRangeShape`/`ResearchSplitSourceSchema` và
[split.contract.ts](../../apps/control-api/src/research/split.contract.ts).

`timeline` dùng refined range; IS/OOS/holdout/warmup extend raw range shape
nên không kế thừa `end > start`. Probe đặt `IS.end=OOS.end+1` rồi
`OOS.start=IS.end`; giữ các equality liền kề: **source schema vẫn accept**
OOS âm. HMAC/digest chứng minh payload không đổi, không chứng minh chronology đúng.

**Đóng bằng:** shared half-open refinement cho từng window, containment,
warmup ordering/count constraints; validate fact values với retained P08/P10
manifest, không chỉ tin một `manifest_digest` echo; cross-source transform
binding. Test inverted/zero/overlap/UTC endpoints/changed receipt.

### A04 · High · Projection revision không bind toàn bộ series content

**Locator:** [evidence.service.ts](../../apps/control-api/src/research/evidence.service.ts)
`buildWrite`; [evidence.repository.ts](../../apps/control-api/src/research/evidence.repository.ts)
`persist`.

Revision hash lấy compact `projection`: không bao gồm `sourceDigest` hoặc
digests/payload của monthly/distribution/rolling series. Probe đổi riêng
monthly return thành `0.99`: source digest khác nhưng `projectionRevision`
giống nhau. Persist gặp cùng projection revision/digest thì return trước khi
kiểm toàn bộ series. Terminal duplicate khác source digest đã bị chặn — đây
**không phải** assertion bypass duplicate protection. Vấn đề là content
identity/ETag và đường correction/reprojection chưa bind đủ.

**Đóng bằng:** canonical sealed revision gồm source identity/digest,
transform/schema version, metric registry/rule version, mọi series digest và
scope; same input idempotent, any changed output → new revision; validate
stored payload integrity ở trust boundary; tamper/conflict tests.

### A05 · High · Replay có thể accept Hub và series khác revision

**Locator:** [replay.service.ts](../../apps/control-api/src/research/replay.service.ts)
`readEvidence`/`mapResponse`, evidence `series()` và hai repository reads.

Một Replay read đọc Hub, sau đó `series()` lại đọc Hub rồi series qua các
transaction riêng. Chỉ check revision có giá trị, **không check equality**;
hash hai revision không tạo thành một coherent snapshot. Probe Hub revision
`a…`, series revision `c…` vẫn trả `AVAILABLE`; fixture/test hiện hữu cũng
cho cặp revision khác nhau đi qua.

**Đóng bằng:** internal revision-pinned read bundle/single repeatable-read
snapshot, run/workspace/scope checks và typed resync khi revision không khớp.
Không chỉ yêu cầu frontend tự discard để che backend race. Test concurrent
publication + out-of-order reads + run switches.

### A06 · High · Replay ETag và cursor lifetime không cùng một contract

**Locator:** [replay.controller.ts](../../apps/control-api/src/research/replay.controller.ts),
[replay.service.ts](../../apps/control-api/src/research/replay.service.ts),
`QUERY_CURSOR_TTL_SECONDS` (default 900s).

- Các page/limit/playhead dùng cùng revision ETag dù representation khác.
  Probe page0/page1 có ordinals khác nhau nhưng cùng ETag; gửi page0 ETag
  trong request page1 nhận **304**. HTTP caches chuẩn phân biệt URL, nên đây
  không có nghĩa browser nào cũng tự reuse sai page; handoff không được dạy
  consumer dùng revision như universal response-cache key.
- Cùng URL sau 10s: body tạo signed cursor mới nhưng ETag giữ nguyên. 304
  giữ body/cursor cũ; sau TTL cursor không dùng được. Handoff fresh-tab
  deep-link chưa có stable locator/renew path hoặc typed expiry riêng.
- P15/P16 trả `requested_fold` nhưng representation ETag không bind fold;
  `as_of` read clock cũng cần tách khỏi immutable content contract.

**Đóng bằng:** tách content revision khỏi HTTP representation validator và
short-lived transport capability. Chọn một phương án nhất quán: stable
public inspection locator được server re-resolve dưới auth, hoặc typed expiry
với canonical refetch. Cursor-bearing response không trả 304 khiến consumer
giữ capability hết hạn; không bỏ TTL/signature để chữa UI. Test 304, sameURL,
different query, key rotation, expiry, backward page, changed revision và deep link.

### A07 · High · Terminal materialisation/retry có cửa sổ mất fanout

**Locator:** [progress.service.ts](../../apps/control-api/src/research/progress.service.ts)
`ingest`, [progress.repository.ts](../../apps/control-api/src/research/progress.repository.ts)
`persistIngress`.

Code commits progress event/snapshot trước evidence, split và lifecycle.
Nếu sidecar persist lỗi ở giữa, retry exact event là duplicate
`inserted=false`; dù projections hoàn thành lần retry, `fanout.publish` bị
skip. Snapshot terminal cũng có thể visible trước required materialisations.
Poll/reconnect giúp eventual recovery, nhưng không đóng real-time/ready
semantics. Đây là **code-path finding, chưa fault-inject vào PostgreSQL trong
lượt audit**; không ghi là production mất dữ liệu.

**Đóng bằng:** durable materialisation/readiness checkpoint và replayable,
idempotent notification, hoặc transaction coordinator cùng Portal DB.
Không cần distributed transaction/service mới. Source-compute terminal và
Portal-read-model ready phải phân biệt; ACK sau durable receipt, recover
không rerun QuantBT. Fault-inject từng commit boundary, retry/restart/ACK loss.

### A08 · Medium · Local admission bounded theo số lượng, chưa theo thời gian

**Locator:** `evidence.repository.ts`, `split.repository.ts` và
[shared pool](../../apps/control-api/src/db/pool.ts).

2 active / 8 queued là per-process; waiters không deadline/cancellation;
`pool.connect()` không finite timeout ở shared pool, SQL timeouts chỉ được set
sau checkout. Vì vậy có thể giữ chỗ vô hạn khi pool khác đang nghẽn. Replay
v1 dùng ba read transactions cho một selection. Chưa có measured seek/load
receipt chứng minh chi phí cần thiết và cleanup khi browser ngắt.

**Đóng bằng:** Research-owned bounded acquire deadline, disconnect cleanup,
safe release của late pool checkout, scope-preserving read bundle. Đo
1/10/20 viewers, far-seek, saturated pool, multi-instance total cap nếu deploy
nhiều instance. Không sửa global Execution pool policy hoặc thêm cache tier
mới chỉ để xử lý việc này; chỉ thêm shared read/cache nếu measurement cần.

### A09 · High · P13–P17 bị thu hẹp vào smoke adapter, chưa đủ source-as-is

**Locator:** P10/P04 binding; `research_child.py`; P13 metric registry;
[search.service.ts](../../apps/control-api/src/research/search.service.ts);
P15–P17 amendments trong Unified; source evidence ở §2.

- P15 luôn no-study/no-ledger vì P10 refuse `trials != 1`/optimizer config.
  Đây là giới hạn **Portal admission/adapter**, không phải chứng minh engine
  1.1.1 chưa có tuning/WFO. Original trial/diagnostic gates vẫn chưa làm.
- P13 giữ 4 series và số ít metrics; rolling-20 return không thay rolling
  Sharpe/beta trong S04. Metrics có ở report không được map; benchmark cần
  thực input và scope, không suy từ market close bất kỳ.
- P17 chỉ có ≤192 sampled equity observations, không full-resolution
  position/return history, original event IDs hay state checkpoints. Gắn
  retrospective label là đúng nhưng không hoàn thành original Replay goal.
- Full retained outputs bị mất ở child boundary; P05 reader chưa được nối
  vào named Research screen queries. Các phần engine có nhưng chưa retain
  là **implementation gap**, không được đóng bằng `NOT_PUBLISHED` vĩnh viễn.

**Đóng bằng:** coverage matrix từ installed API/actual output, versioned
producer admission có resource bounds; P05 retain toàn dữ liệu cần thiết,
Rust bounded read/projection, TS BFF. Giữ current fixed-run compatibility;
không thay source bằng legacy Python route, không sửa protected Delta kernel.

### A10 · High · P16 chưa thực hiện expected-byte verifier hoặc what-if lane

**Locator:** [freeze.service.ts](../../apps/control-api/src/research/freeze.service.ts)
`verify`/`integrityChecks`/`integrity`; P05/P11 artifact lifecycle.

POST verify chỉ reread ba retained binding digests; không đọc expected artifact
bytes. Điều này được label `PARTIAL_MATCH` trung thực, nhưng original P16
expected-byte/receipt tests chưa đóng. `source_artifact_bytes.reason_code`
còn dùng lý do physical Parquet row-group I/O của split — hai authority khác nhau.

Frozen parameter display so với **compiled current** P04 constants; release
thay binding có thể làm historical verified parameters biến thành blocked.
Cần registry/retained declaration theo exact historic adapter digest, không
lấy default của release mới thay tham số run cũ. Selection/grid/sibling lane
chưa được implement; một số input có qua source WFO ở §2, phần diagnostic
execution phải dùng explicit governed Research job, không engine-on-GET.

**Đóng bằng:** P05 artifact custody + expected digest verifier/receipt bounded,
historical binding lookup, corrupt bytes fail/no rebaseline; exact evaluation
reuse và explicit bounded diagnostic intent cho input đã support. Không tạo
selection/causal certificate cho fixed/no-selection run.

### A11 · Medium · Handoff và screen contract còn lệch yêu cầu Claude phải consume

- S04 chưa có đủ envelope cho passport/manifest/data drawer/fold verdict,
  nhiều nguồn đã có ở P08/P10/P11 nhưng chưa join/publish; absence map của
  P13 cũng không định danh mọi panel. Không yêu cầu Claude hand-type/hardcode
  lý do cho field không tồn tại.
- P14 handoff/Unified copy nhầm **Code Anatomy + three authority states** từ
  S14 Alpha Import sang S05 Split. S05 là protocol/fold anatomy/inner folds/
  holdout/gap scan, không có import wizard. `source.physical_io` cũng không
  là public field đúng; DTO hiện hành dùng `windows.holdout.physical_io`.
- P16 “no sliders” không được đọc thành bỏ luôn HiFi composition. Giữ card
  và disabled/noninteractive state có reason; chỉ activate control khi named
  contract hợp lệ. Không dựng metric/selection giả để làm đẹp.
- P02 public inspection cursor, original trial/trade IDs và P17 signed page
  cursors cần bridge rõ: navigation context khác data-access capability.

**Đóng bằng:** một matrix field/action → source → transform → generated DTO →
panel → test cho S04–S08; freeze generated contracts trước final wiring;
Claude chọn UI composition theo HTML/spec và browser receipts, không tự chữa BE.

### A12 · Medium · Gate coverage/status chưa đủ để nói “không technical debt”

Targeted suites xanh nhưng thiếu independent oracle, worst-case bytes,
revision-race, expiry/deep-link, partial materialisation recovery và route
coverage ở trên. Một current-source fixture pass không đóng đủ guide
`P13-T01…T13`, `P14-T01…T13`, `P15–P17-T01…T14`, `V11-*-DR/BR/GX`.

P14 journal ghi “RLS” nhưng migrations 0046/0047 có grants/immutable guards,
**không có RLS policy trên hai nhóm bảng mới**. Scoped queries + membership
checks vẫn tồn tại; audit không suy ra cross-workspace leak. Sửa evidence cho
đúng layer, test direct runtime-role privileges/isolation theo P03 model;
không blanket-add RLS qua toàn hệ thống. P17 phase report/test-results có
count 24/25 lệch, cần reconcile receipt thay vì cộng test count cho đẹp.

**Đóng bằng:** reopen exact failed/unproven gates ở original phases, map
test IDs tới command/assertion/result; tách source synthetic/real historical,
mock/DB/browser/runtime receipts. Không amend goal nhỏ lại để xóa debt.

## 4. Trạng thái gate sau audit

| Phase | Phần giữ lại | Phần cần đóng trước original-scope acceptance |
|---|---|---|
| P13 | immutable receipt + compact BFF skeleton | A01/A02/A04/A05/A07, full metric/envelope coverage, real numerical + FE receipts |
| P14 | semantic current tape + truthful holdout absences | A03, warmup/data-use verification, source-supported fold facts, correct S05 handoff |
| P15 | compatibility cho fixed/no-search run | actual source-supported study/trial/evaluation ledger, selection diagnostics, full counts/read bounds |
| P16 | partial retained-binding check | expected artifact bytes + historical binding + supported diagnostic/reuse contracts |
| P17 | equity-only retrospective compatibility | A05/A06/A08, full retained route facts/state where supported, reliable navigation and query budget |
| P18 | chưa implement | chờ RS-01…03 và Bobby review; không kế thừa sai numbers/revision vào Report |

Lịch sử “Complete” trong receipts cũ là kết quả slice hẹp tại thời điểm đó,
**không** xóa đi; current audit status là `AUDIT_REOPENED`. Source/authority gap
thực sự phải ghi exact field/route/evidence/owner decision; không đánh cả phase
`SOURCE_CAPABILITY_BLOCKED` khi có work in-scope chưa làm.

## 5. Kế hoạch remediation — ba slice, chưa có quyền thực thi trong lượt audit

Tất cả dùng shared branch hiện tại; coherent commits theo slice/substep, không
tạo nhánh mỗi Pxx. Không code hoặc commit file Claude chưa bàn giao. Schema
breaking dùng version mới/additive storage; generated operations/inventory
được publish cùng implementation, không tạo vòng CG/FD chỉ vì quên generate.

### RS-01 — Correctness, immutable consistency và bounded recovery

**Owner đề xuất:** Terra backend. **Entry:** Bobby duyệt RS-01; freeze baseline
+ preserve Claude work. **Findings:** A01–A08 và precise A10 reason/historical
binding fixes; không mở optimizer admission ở slice này.

**Thứ tự làm:**

1. Thêm regression đỏ tái hiện từng probe ở §3 trước khi sửa. Chốt window,
   previous-close/monthly/histogram closure và first OOS/carry semantics bằng
   independent vectors; không lấy chính output helper làm expected.
2. Sửa byte-budget/series coverage, range/manifest binding và source-to-series
   immutable revision. Giữ v1 historical output, sửa bằng new transform/reader
   compatibility; corrupted receipt không trở thành PASS do rehash lại nó.
3. Revision-pinned Hub/series/replay, HTTP/cursor renewal contract, typed
   expiry/resync; render/update clocks khác content revision. Schema consumer
   và generated tests cùng commit; map existing errors khi đủ, tránh enum mới
   vô nghĩa.
4. Materialisation-ready checkpoint + retry/fanout recovery; queue/pool acquire
   deadline/abort/late release. Thay đổi chỉ Research-owned path. Không sửa
   global pool behavior ảnh hưởng Execution nếu không có scoped design review.
5. Reconcile misleading docs/handoff, public fields/reason codes/old binding
   behavior, focused capability-inventory drift check. Update P13–P17 journals.

**Files/surfaces:** Research child/producer/progress adapter, Control API
`research/{progress,evidence,split,replay,search,freeze}.*`, relevant additive
migrations, contract generators/OpenAPI/generated declarations and tests.

**Tests bắt buộc:**

- Month-boundary gap `[100,100,120,132]`, first/partial month/year, zero/no-loss/
  NaN reasons, daily/intraday frequencies, histogram endpoints, monthly >120
  coverage, warmup boundary test with expected scored population.
- 1k/large allowed inputs/worst-case number text; serialized byte boundaries
  below/at/above each limit; no valid admitted run fails only at final sidecar
  storage. Disk-full/oversize rejection remains explicit and recoverable.
- Every-series mutation changes revision; duplicate unchanged receipt
  idempotent; inverted/overlap/zero windows rejected; two revisions cannot mix.
- SameURL/otherpage/limit/fold/at/304; token expiry/rotation/cross-workspace/
  cross-run/backward/changed revision; stable deep-link recovery under auth.
- Fresh disposable PostgreSQL: inject sidecar/lifecycle failure, retry and
  process restart; terminal readiness converges and viewers recover without
  re-compute; denied membership, runtime write grants, immutable protection.
- Exhaust pool + abort queued viewer → bounded timeout and no leaked slot or
  client; exact read transaction count and measured p50/p95/response bytes.

**Exit:** all confirmed correctness regressions fixed + green focused unit,
contract and DB tests; no universal “P13–17 complete” yet. New contracts handed
to Claude, test counts/limits and cleanup recorded. No deploy required just to
verify pure math/contracts; DB test only on own disposable cell.

**Rollback:** compatible reader/transform selection or feature-dark flag;
preserve old and new receipts. Additive migrations only; no update/delete
of historical evidence to retrofit numbers.

#### RS-01 delivery amendment — 2026-09-22

**Implemented by Terra after Bobby approval.** The exact delivery is recorded
in [RS-01 evidence](./evidence/RS-01/phase-report.md), not inferred from this
audit text. A01–A08 are repaired with independent Python numerical/receipt
tests, focused Control API contracts/services/controllers, fresh disposable
PostgreSQL migration/grant proof, durable retry/restart proof and generated
declarations. R1 historical receipts remain readable; R2 is additive. The
slice remains feature-dark and does not claim P13–P17, RS-02 or RS-03 product
acceptance. Original reports/handoffs are amended in the same change.

### RS-02 — Complete current-source adapters, retained data và P13–P17 read models

**Owner đề xuất:** Terra backend, Claude composition song song. **Entry:**
RS-01 accepted + Bobby duyệt RS-02. **Findings:** A09–A11, remaining A01/A10.
Đây là phần implementation thực còn thiếu, không phải vài sửa tên/type.

**2A · Freeze coverage và admission trước compute**

- Lập exact matrix cho mọi required S04–S08 field/action: scope/mode/route,
  installed API/artifact locator, direct/derived definition, retained identity,
  DTO/version, FE panel, test ID, absence classification. Join sẵn P08/P10/P11
  metadata; không request engine field đã có.
- Public QuantBT capability fixtures + bounded real executions phân biệt
  supported vs merely callable. Target tối thiểu: real Delta tune/WFO,
  nontrivial folds, fixed-run compatibility; supplementary route profiles cho
  required replay surfaces. Invalid mode/schedule trả typed refusal, không
  tự fallback fixed smoke khi request là optimizer.
- Versioned Research adapter admission thay giới hạn smoke ở chỗ đã qualify:
  exact route/mode/schedule, seed, selected strategy version/declaration,
  trial/time/RSS/disk budgets, lease/cancel/retry. Python chỉ public QuantBT
  compute/serialization adapter, không thành query/BFF authority.

**2B · Retain once, query local**

- Tái sử dụng [P05 Rust reader](../../apps/research-artifact-reader-rs/src/lib.rs)
  và [P05 writer](../../apps/portal/backend/src/portal_api/services/research_artifacts.py).
  Child xuất allowed artifact tables trong confined custody, parent seal theo
  lease; không truyền full data frame vào terminal JSON. Preserve source
  IDs/index/time/order, decimals and original engine metadata.
- Retain needed full-resolution equity/returns/positions plus study/trials/
  evals/selection/folds and route ledgers **thực sự phát ra**; manifest schema
  version/digests/counts/row groups. Raw market slices chỉ qua approved P08
  binding, không mở arbitrary path/query hay holdout data cho browser.
- Rust chịu bounded artifact reads/reducers/query-heavy work; TS giữ auth,
  orchestration, immutable metadata, named BFF. Dùng lại resource/lease/artifact
  foundation; không thêm Kafka/Redis/data lake/service orchestration mới.
- Không migrate lịch sử thiếu artifact thành fake full history. Reproject từ
  bytes retained khi đủ; thiếu thì `NOT_RETAINED_LEGACY`. Compute mới chỉ khi
  owner/user tạo new intent, không khi GET/cursor.

**2C · Hoàn tất từng read model trong original phase**

| Phase | Việc phải implement | Bằng chứng đóng |
|---|---|---|
| P13 | full passport/manifest/data drawer, direct metrics + defined derived rolling/monthly/distribution/fold summaries; lazy charts/cross-tab revision | raw → independent formula → retained projection → BFF numerical parity; sampled chart không đổi metric |
| P14 | actual supported fold plan/evaluation-use, inner/purge/embargo khi có evidence, warmup/exposure/strict-vs-selection-input labels | future-perturbation/cutoff tests cho causal claim thực sự phát; no-holdout side effects; missing authority không invented |
| P15 | complete study-scoped trials/evals; selected/raw-best/inspected/centroid khác nhau; keyset/jump/count; bounded scatter/diagnostics/mode unions | full ledger count reconcile, selected inclusion, pruned/failed/infeasible dimensions; compare with actual source, not progress `1/1` |
| P16 | expected bytes + durable scoped verify receipt; historical parameter binding; evaluation reuse/grid query; explicit diagnostic/new-intent action khi valid | corrupt bytes fail/no rebaseline; exact 81-cell unique evaluation mapping/budget; no job on mount/slider; frozen passport never changes |
| P17 | route-discriminated retained ledgers + checkpoints/state-at-cursor; positions/returns available ngay khi retain; original IDs ≠ playback ordinals | sequential/random/far seek parity; ties/seq gaps/fold capital/fees correct for actual route; no fabricated fills or authoritative live replay |

Shared envelope chỉ abstract phần thật sự chung (identity/availability/
revision/scope); không làm một mega DTO/generic table route. Propose public
named operations dựa trên UI need; private artifact paths/cursors không vào
browser. P02 inspection contract vẫn là navigation, không DB authority.

**What-if guard:** không tự chạy 81 expensive evaluations mỗi lần click. Dùng
exact existing evaluations/cache key gồm params/data/objective/seed/engine;
cell chưa có là typed missing. Explicit bounded job có admission/cancel/audit
và deterministic dedup theo guide. Nếu một requested mode thật sự không có
public capability, trình Bobby exact exclusion trước khi gọi slice complete.

**Tests/exit:** generated schema covers mọi source-supported field; actual
Delta tune+WFO → new isolated Research flow → sealed artifact → Rust reader →
TS BFF pass; fixed/historical compatibility; protected kernel unchanged;
no source computation/read per viewer. Focused route matrix satisfies guide;
whole 14-route product activation **không tự suy** từ constructor discovery.
All implementation gaps assigned above closed; remaining real owner/source
exclusions named and accepted, never hidden behind blanket `NOT_PUBLISHED`.
Update each original P13–P17 result/handoff in same implementation commit.

**Rollback:** disable newly admitted producer profile/diagnostic action and
select compatible read revision, never drop artifacts/source identities or
break old fixed-run readers. New Research feature stays dark until scoped dev
acceptance; no production/Execution activation in this slice.

**RS-02 delivery note — 2026-09-22.** The backend remediation is delivered as
an additive feature-dark lane. It admits the exact public QuantBT
Advanced-WFO profile, retains P05-verified `OBSERVATION`/`FOLD`/`TRIAL`/
`CANDIDATE`/`SELECTION` relations once under immutable local custody, and
serves six generated named S04–S08 BFF operations from PostgreSQL only. It
does not use direct Trading/Execution/database access or run an engine during
a GET. Fact gaps named in the matrix remain typed rather than inferred. Focused
source, service/controller, generated-contract, Rust-reader and route-ledger
tests pass; the isolated fresh-PostgreSQL script is committed as the remaining
environmental acceptance gate before any activation. This is not RS-03
browser/product acceptance.

### RS-03 — Claude contract integration, independent acceptance và P18 entry

**Owner đề xuất:** Claude FE-first; Terra backend verification/fixes. **Entry:**
RS-02 named contract ready per screen + Bobby duyệt RS-03. Claude không phải
đợi toàn bộ RS-02 để vẽ shell; chỉ final wiring chờ đúng DTO của panel đó.

1. Finish/retain P12 work; đọc full handoff chain và audit này. Dựng S04–S08
   đúng từng HTML/spec, không generic envelope thay màn. Correct S05 instructions;
   all navigation/claims/folds/selection/deep links theo generated source.
2. Complete field/action matrix và consumer operations cho từng màn; source
   facts available phải visible, không giấu bằng reason vốn hết đúng. Genuine
   absent states giữ rich cards/labels/disabled actions. No FE financial math,
   fake timer verify, source/cursor parsing hoặc current defaults thay history.
3. Reuse một sealed real Research evidence corpus từ RS-02 để kiểm raw →
   persistence → API → pixel; record riêng supplemental synthetic cases.
   Không chạy engine lại cho mỗi màn/browser test.
4. Browser so open HiFi vs product at 1280/660, all tabs/drawers/tooltips,
   keyboard/overflow, loading/empty/denied/unavailable, resource switch,
   historical/readiness/expiry recovery. Real API journeys: P11→Hub→Split→
   Search(nonselected pick)→Freeze→Replay→Hub; selection không đổi theo pick.
5. One exact dev build sau relevant gates; unchanged Execution boundary check
   và current visual-regression delta only. Không re-record global snapshots,
   không main/stable release, không run tất cả heavy CI trên mỗi docs edit.

**Required test inventory:**

| Source | Gate ownership / rule |
|---|---|
| Guide P13 T01–T13, P14 T01–T13, P15/P16/P17 T01–T14 | 68 base gate IDs; mỗi ID mapped tới assertion/command/result hoặc exact source/authority decision, không suy PASS từ file count |
| `V11-P13…P17-DR/BR/GX` | 15 thêm; real Delta/data, browser, protected boundary/cleanup separately labelled |
| Specs S04–S08 | Toàn bộ test tables + checklist/integration tests ở cuối spec; fixtures không thay real data receipt |
| Local failure/scale tests | byte/disk bounds, pool/queue/abort, retry/restart/304/revision, auth/revocation, large ledger/far seek; synthetic scale labelled |

**Exit / P18 entry:**

- A01–A12 có `FIXED_WITH_EVIDENCE` hoặc exact accepted source/authority exclusion,
  không implementation gap deferred mơ hồ; original P13–P17 journal/board khớp.
- Generated contracts + route inventory + named consumers khớp; all applicable
  BE/FE/DB/Rust/Python/real API tests pass, screenshots examined, relevant dev
  receipt exists. `BACKEND_REMEDIATED` khác `FE_ACCEPTED`/`OWNER_ACCEPTED`.
- Report P18 có coherent content revision, correct financial scope, retained
  artifacts và actual verifier để reuse; không nhận poisoned input debt.
- Bobby xem packet và quyết định vào P18. Không tự merge/release hoặc nâng
  thiếu authority thành PASS.

## 6. Evidence của chính lượt audit — đã chạy và chưa chạy

| Check | Actual result | Giới hạn |
|---|---|---|
| Control API: evidence/split/search/freeze/replay × contract/controller/service | **36 tests / 15 files PASS** | Suites hiện hữu; không chứng minh các counterexamples đã được fix |
| Generated contracts: five Research screens | **15 tests / 5 files PASS** | Wire shape hiện tại, không full screen coverage |
| Python numerical/size diagnostic probes | Monthly/histogram/33.542-byte findings tái hiện | Synthetic input, no worker/DB/runtime |
| TypeScript direct service/contract/controller probes | Inverted window accepted; monthly change same revision; mixed revisions accepted; page ETag/304 và regenerated cursors reproduced | Fake repositories, actual production classes/schema; concurrency DB chưa fault-inject |
| Existing real-engine WFO artifact test | **1 PASS in 4.40s** | Real installed QuantBT + Delta strategy, **synthetic golden market**; legacy test path proves available source, not new Research adapter integration |
| Full frontend/build/Playwright/production/real historical Delta | **NOT_RUN** | Không cần/không thể dùng để chốt remediation chưa implement |

Targeted unit commands (repo-relative, không gọi runtime):

```bash
# apps/control-api: Vitest, one worker; exact five prefixes and three suffixes.
npx vitest run test/research-{evidence,split,search,freeze,replay}.{contract,controller,service}.spec.ts --maxWorkers=1 --minWorkers=1

# packages/contracts: existing five generated-contract suites.
npx vitest run test/research-{evidence,split,search,freeze,replay}.spec.ts --maxWorkers=1 --minWorkers=1

# apps/portal/backend: single real-engine source-capability check.
PYTHONDONTWRITEBYTECODE=1 OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 NUMBA_NUM_THREADS=1 \
  timeout 90 ../.venv/bin/python -m pytest -p no:cacheprovider \
  tests/test_advanced_walkforward.py::test_advanced_runner_completes_and_writes_artifacts
```

Reproduction expectations để Terra viết regression trước khi fix:

```text
monthly_input=(Jan30:100, Jan31:100, Feb1:120, Feb2:132)
actual_feb=0.10000000000000009; expected_previous_close=0.32
histogram_input=[0,0.1]; last.upper_exclusive=0.1; last.count=1
evidence_1000_hourly_bytes=33542; journal_max=28672
inverted_oos_range_accepted=true
different_monthly_payload_same_projection_revision=true
mixed_hub_series_accepted=true
distinct_pages_same_etag=true; second_page_if_none_match_first_status=304
same_url_same_etag_changed_signed_cursors=true
```

Resource discipline: one worker/thread for these targeted runs; no image build,
Docker resources, active test service or background monitor created. Pytest
temporary artifacts stay in its isolated test temporary directory; no user
artifact/code/cache volume was deleted. No new secret/session/account created.
Read-only capacity snapshot: `/home/bobby`/`/tmp` còn 316 GiB (50% filesystem
used), memory available khoảng 23.399 MiB. Docker/systemd inventory bị sandbox
deny socket/bus; **không nhận đã kiểm runtime/runner health** và không nâng
quyền chỉ để prune trong audit docs-only. Audit-owned cleanup:
`NO_ACTION_NEEDED` — không có test container/image/service để teardown.
SHA-256 của cả 11 file FE dirty/untracked trước/sau audit-doc edits không đổi.
Markdown local-link check: 418 links checked, 0 missing targets/new checkpoint
anchors; `git diff --check` pass.

## 7. Prompt bàn giao sau khi Bobby duyệt

### Terra — bắt đầu RS-01, không nhảy sang RS-02/P18

> Làm trên shared branch/worktree hiện tại, không tạo nhánh mỗi phase và không
> stage/reset file Claude. Đọc Unified §13, rules A13, P13–P17 guide/handoffs và
> P13_P17_ASTRA_AUDIT_AND_REMEDIATION_PLAN.md. Bobby duyệt RS-01: reproduce rồi
> fix A01–A08 cùng scoped binding/reason corrections, test independent oracle,
> bytes, revision/ETag/cursor, chronology, fault/retry, bounded admission. Giữ
> immutable history, protected Execution/strategy và feature-dark/runtime scope.
> Publish generated contracts + inventory đồng bộ, cập nhật original phase
> journals/evidence. Không ghi full P13–P17 complete khi RS-02/03 chưa đạt.
> Báo files, regressions, actual gates, cleanup, Claude handoff và next step.

### Claude — làm song song, không sửa backend hộ để bù thiếu contract

> Đọc Unified checkpoint trước P18 và audit Astra P13–P17; finish P12 hiện tại,
> giữ toàn bộ work của bạn. Có thể dựng rich composition S04–S08 ngay theo
> HTML/spec, không đợi backend xong tất cả; fixture chỉ trong visual lane.
> Các handoff cũ là v1 partial, chưa là full field contract. S05 không có Code
> Anatomy/import stages; đó là copy nhầm từ S14, không phải UI yêu cầu mới.
> Consume additive generated contracts từng panel khi Terra publish; không
> hard-type DTO/reason, không đổi numbers/authority, không bỏ layout vì missing
> data. Dùng browser đối chiếu HiFi và implementation tại 1280/660, ghi rõ
> composition vs product vs real API receipts. Gửi consolidated missing-field
> requests vào original phase handoff với source locator/test; không tạo thêm
> blanket SOURCE_GAP vì adapter hiện chưa publish. P18 chờ RS-01…03 + Bobby review.
