# BE-P16 — Financial publication: writer + lease + checkpoint cho series NAV / NET_PNL (ELP2-05/06, ELP2-REQ-06-002) (Claude, 2026-10-20)

Owner Claude (backend, Bobby giao ALL remaining backend). Codex chỉ review. Nhánh `claude/be-p16-financial-publication`, base `6d87825b` (`claude/fe-parity`). Tier **R3 focused**: vitest non-PG, `tsc`, `snapshot.py --check`, `refresh-release-integrity-ledgers.sh --check`.
**NOT_RUN: mọi spec PostgreSQL (lead chạy dưới heavy lock), Docker, full hook, generators contracts (không đụng file contract nào; `contracts-test.sh` provision node_modules trong Docker).** Không nguồn/HK/SSH/credential. Mọi giá trị fixture là `TEST_ONLY`/`SYNTHETIC`; không số nào ở đây là sự kiện tài chính.

## 1. Cái đã dựng

Slot **opt-in** `series` trong `ExecutionManagerRuntime` (không timer, không route, không ACK, không checkpoint nguồn mới; đi chung tick, lease và transaction của `ManagerProjectionConsumer`). Không cài => hành vi cũ nguyên vẹn (có test).

| Pha | Nơi | Làm gì |
| --- | --- | --- |
| Quan sát (thuần) | `manager-series-observation.ts` | Một revision -> observation theo (subject = fund + từng portfolio, metric NAV/NET_PNL, partition kinh tế): **tổng decimal chính xác (BigInt)** của fact `SOURCE_VERIFIED`, hoặc `reason_code`. Dùng chính `managerPartitionTotals` / `economicFacts` của reader dataset (xuất thêm 3 symbol từ `manager-model.ts`, không đổi hành vi) nên điểm không thể lệch giá trị hiện hành. Xác định, thứ tự fact không ảnh hưởng digest. Không bao giờ throw: aggregator từ chối -> revision rỗng + `SERIES_DERIVATION_REFUSED`. |
| Dựng series (thuần) | `manager-series-materializer.ts` | Observation (lịch sử đã lưu + revision hiện tại) -> `ManagerSeriesPublication` đúng contract đã có. Cửa sổ = preset 7D/30D/90D của chính Portal (`resolveManagerWindow`, cùng hàm reader dùng để khớp). Tự kiểm bằng `managerSeriesPublication` + `validateManagerSeriesPublications`; sai -> không publish gì (series không bao giờ làm revision tài chính không admit được). |
| Lưu (PG) | `manager-series.store.ts` + migration `1723680000147` | 3 bảng: `execution_manager_series_revisions` (marker chuỗi revision, kể cả revision rỗng để nêu gap), `..._observations`, `..._checkpoints`. Append-only (trigger), CHECK: value XOR reason, value luôn có `point_ts_ms`/currency/basis/methodology. |
| Ghi LIVE | `ManagerSeriesRuntime.lifecycle().persistAttached` | Trong **cùng transaction + lease fence** với revision, sau `SAVEPOINT`: series có thể từ chối (ghi `last_error_code`) nhưng **không bao giờ làm hỏng revision tài chính**. Mất lease KHÔNG bị nuốt (deferred fence vẫn fail COMMIT). |
| BACKFILL | `lifecycle().idle` -> `store.backfill` | Khi nguồn không có gì mới: replay revision đã giữ mà writer chưa thấy, tối đa `maximum_backfill_revisions` (1..16) mỗi tick, mỗi revision một transaction fence lease riêng, con trỏ keyset `(created_at, revision)` -> **resume sau restart**; revision đọc không được (digest lệch, parse fail) bị bỏ qua có mã, không chặn các revision sau, thành gap nêu rõ. |
| Checkpoint | `execution_manager_series_checkpoints` | head đã quan sát, con trỏ backfill + trạng thái (`NOT_STARTED/IN_PROGRESS/COMPLETE`), absences gần nhất (đếm theo reason, <= 64), lỗi gần nhất + revision, fencing token người ghi. Không phải checkpoint/ACK nguồn. |

Bất biến: **idempotent** (PK + digest; lost ACK / restart replay đúng bytes, không ghi thêm; digest khác -> `DIGEST_MISMATCH`, không ghi đè); **bounded** (tối đa 128 observation/revision, không cắt prefix — vượt thì revision rỗng + `SERIES_OBSERVATION_BOUND`; 2000 điểm/series, 256 series/doc, `maximum_total_points`, `maximum_history_rows`, trần byte document: vượt thì **không publish**, không cắt); **không float, không FX, không rebase, không nội suy, không carry-forward**.

Quy tắc điểm: một điểm = tổng chính xác tại **một** thời điểm định giá (các fact khác `effective_at_ms` -> `INCOMPARABLE_VALUATION_CUTOFF`); một series có đúng một methodology / origin / population (observation khác bị loại và nêu); hai revision bất đồng về một thời điểm -> không series (`CONFLICTING_OBSERVATIONS_AT_INSTANT`; `1.0` và `1` là cùng giá trị); gap nêu rõ (`SOURCE_GAP`, `PROJECTION_DISCONTINUITY` thắng gap thường); lịch sử không với tới đầu cửa sổ -> `PARTIAL` + `HISTORY_STARTS_AFTER_WINDOW_START` (series đầu đời luôn PARTIAL, không bao giờ COMPLETE giả).

## 2. Sản xuất ra gì / còn vắng gì

| Hạng mục | Trạng thái | Lý do / reason code | Chủ nguồn cấp |
| --- | --- | --- | --- |
| NAV series (fund, từng portfolio, từng partition tiền tệ) | **SẢN XUẤT** khi có fact `current_nav` SOURCE_VERIFIED, FRESH, COMPLETE, cùng instant, có `methodology_ref` | thiếu -> `METHODOLOGY_NOT_PUBLISHED`, `INCOMPARABLE_VALUATION_CUTOFF`, `SOURCE_FACT_CENSUS_INCOMPLETE`, `SOURCE_NOT_FRESH`, `SERIES_UNIT_NOT_MONEY`, `SOURCE_FACTS_NOT_PUBLISHED`... (mỗi cái là observation null + đếm trong checkpoint) | — (đã có trong fact) |
| NET_PNL series | **SẢN XUẤT** tương tự từ fact `net_pnl` (origin = `window.from_ms`, phải hằng số trong series) | như trên; "net của những gì" (#9) chỉ là `methodology_ref` của nguồn, không máy đọc được | PM/Edge: danh sách đóng lớp chi phí |
| RETURN | **VẮNG** (không bao giờ sinh) | `RATIO_SCALE_NOT_PUBLISHED`, `CASHFLOW_REVISION_NOT_PUBLISHED`, `ECONOMIC_REVISION_NOT_PUBLISHED`, `RETURN_DENOMINATOR_NOT_PUBLISHED`, `RETURN_METHODOLOGY_NOT_PUBLISHED` (đếm mỗi revision, mỗi subject) | PM/Edge: scale, revision cashflow ledger + economic fact (cần thêm trường `cashflow_revision`/`economic_revision` additive vào publication — contract change, Claude làm khi có id), denominator; Core/Edge: methodology registry |
| Tổng quy đổi nhiều tiền tệ (fund cross-currency) | **VẮNG**; chỉ series theo partition | `FX_RATE_NOT_PUBLISHED` | Core/PM: nguồn tỷ giá + policy, hoặc ghi "không bao giờ" |
| Cửa sổ ALL | **VẮNG** | `ALL_HISTORY_WINDOW_NOT_PUBLISHED` (không có chứng tích inception) | Edge/PM |
| Cửa sổ custom (from/to tùy ý) | **VẮNG** | reader chỉ khớp cửa sổ chính xác đã publish: chỉ 7D/30D/90D cấu hình | — (thiết kế) |
| Series theo Alpha / Deployment | **VẮNG** | `ALPHA_DEPLOYMENT_SUBJECT_NOT_IN_CONTRACT`: contract series chỉ có subject `portfolio`/`manager_book` (FUND/PORTFOLIO). Fact có tuple alpha/deployment nên dựng được, nhưng thêm subject = đổi schema + FE reader đóng (allowlist) | Codex/Bobby quyết có mở subject không; FE reader đi kèm |
| Series stage (deployment equity FE-072, SRC-D8) | **VẮNG** | không phải đường này: cần relation equity/PnL series Canary/Live từ nguồn | Edge/PM |
| Lineage original/restated của series (#12) | **VẮNG** | không có `supersedes`/custody cho series; series gắn revision tài liệu | Core |
| Dedup tài khoản vật lý của series (#11) | **một phần** | NAV: reader dedupe snapshot theo `economic_account_ref`+`ownership_partition_ref` (đã dùng). NET_PNL: reader **không** dedupe theo ownership (chỉ theo `fact_id` ở prepare) — nếu nguồn gửi hai fact PnL cho một account chung thì tổng gấp đôi, giống reader hiện hành | Core/PM: statement đếm mỗi account một lần |
| Population digest | **giả định** | dùng đúng `managerScorePopulationDigest(thành viên active)` như selector; Core/PM chưa xác nhận đó là định nghĩa quần thể của producer (#1) | Core/PM |
| Quần thể hạn chế (restricted) | giữ nguyên | reader vẫn trả `SERIES_SCOPE_NOT_AUTHORIZED` trước mọi aggregate; writer chỉ tính trên quần thể active đầy đủ | — |

Hệ quả: ngay khi nguồn publish fact đầy đủ, NAV/NET_PNL xuất hiện **không cần đổi code**; RETURN và các hàng vắng vẫn typed absence, không số nào bị đoán. Series đầu tiên của một scope là PARTIAL cho tới khi lịch sử với tới đầu cửa sổ.

## 3. Kích hoạt (không tự bật)

`ManagerRuntimePartition.series = { runtime: new ManagerSeriesRuntime(pool, { windows:["30D"], maximum_total_points, maximum_history_rows, maximum_backfill_revisions }) }`, do bên dựng `ManagerRuntimeInstallation` (Core009 composition, BE-P10) đặt. Chưa ai đặt. Migration 147 phải chạy trước (bảng chỉ thêm, không đụng bảng cũ; Down là no-op có chủ ý, như 135/137). `MANAGER_RETENTION_CAP_REACHED` (1024 revision/scope) cũng là trần của lịch sử series; chưa có chính sách retention/downsample (xem rủi ro 2).

## 4. Rủi ro / việc cần Codex xem

1. Số migration `147` lấy theo "kế tiếp sau 146 (BE-P13)"; nếu nhánh khác cũng lấy 147, đổi tên số (file đứng một mình, test chỉ yêu cầu duy nhất + liền sau 146).
2. Cadence revision cao (vài giây) => > 2000 điểm/30D => `SERIES_POINT_BOUND_EXCEEDED`, không series. Cần quyết định owner về lấy mẫu (vd. cuối ngày theo quy ước ngày #2): đó là phép biến đổi, Claude không tự chọn.
3. Fact định giá phải cùng `effective_at_ms` trong một partition; nguồn gửi per-account instant khác nhau sẽ cho `INCOMPARABLE_VALUATION_CUTOFF` (nghiêm có chủ ý, cùng luật reader dùng cho `current_nav`).
4. `ManagerCalculationLifecycle` được `export` từ `manager-consumer.ts`; wrapper series bọc lifecycle Score/custody nếu có, chỉ thêm ghi series + backfill ở idle.
5. Backfill dùng `created_at` của revision (tuần tự dưới advisory lock mỗi scope); chuỗi thật được kiểm bằng `supersedes_revision`/epoch/generation, nên thứ tự sai chỉ ra gap chứ không ra điểm sai.

## 5. Tests

| Gate | Kết quả |
| --- | --- |
| `test/be-p16-manager-series-materializer.spec.ts` (mới, không PG): derive chính xác/xác định/null có mã, TEST_ONLY, bound 128, series từ lịch sử, reader đọc ra đúng, gap/discontinuity/loại basis/conflict, bounds + config, slot không throw (history fail, savepoint, abort), vệ sinh migration 147 | **36 / 36** |
| Hồi quy control-api: `elp206*`, `elp210*`, `native-manager*`, `manager-observation*`, `be-p4*`, `elp2-manager*` (`--maxWorkers=2`) | 56 file pass, 18 skip (PG), **1,969 pass** |
| `tsc -p tsconfig.build.json --noEmit` | exit 0; `tsc --noEmit` toàn dự án: 0 lỗi ở file mới/đổi (lỗi cũ ở spec cũ không đổi) |
| `python3 packages/contracts/tooling/snapshot.py --check` / `scripts/refresh-release-integrity-ledgers.sh --check` | khớp 536 file / ledger hiện hành (không cần `--write`) |
| Generators contracts `--check` | **NOT_RUN** (không file contract nào đổi; môi trường không có node_modules contracts) |

### PG specs lead cần chạy (heavy lock, `TEST_DATABASE_URL`, tự tạo/xóa DB `be_p16_series_<uuid>`)

`apps/control-api/test/be-p16-manager-series-pg.spec.ts` (14 test, đang skip không có URL):
1. **DDL**: append-only (UPDATE/DELETE bị chặn), value XOR reason, point-không-value, regex decimal/digest, FK revision.
2. **Live record**: RECORDED -> DUPLICATE -> `DIGEST_MISMATCH` (không ghi đè); head không lùi khi ghi revision cũ; lease cũ bị fence (`MANAGER_LEASE_LOST`), không để lại hàng.
3. **History + parity**: `history` bounded (max+1 để lộ tràn), loại revision đang publish, có revision liền trước floor; series dựng từ DB == dựng từ bộ nhớ, và document admit được.
4. **Backfill resume**: N revision/lần, holder mới + store mới tiếp tục từ con trỏ, COMPLETE rồi NO_WORK; revision đã ghi live không replay; revision hỏng bị bỏ qua có mã; deadline/abort dừng giữa các revision.
5. **Consumer TEST_ONLY**: marker commit cùng revision; lost ACK -> DUPLICATE_CURRENT không ghi thêm; series từ chối (trigger `SERIES_BOOM`) mà revision vẫn commit + ACK; idle backfill theo lô.
6. **ExecutionManagerRuntime thật** (SOURCE_VERIFIED dưới commissioning SYNTHETIC): idle tick backfill r0..r2, revision r3 publish **kèm** 4 series (fund+portfolio x NAV/NET_PNL, COMPLETE, không RETURN), lost ACK + restart dùng lại đúng bytes (series trong đó), không hàng mới; không bật slot -> không series, không hàng series.

Lệnh gợi ý: `cd apps/control-api && TEST_DATABASE_URL=… npx vitest run test/be-p16-manager-series-pg.spec.ts --maxWorkers=1`. Nếu test 6 đỏ ở bước publication/commissioning (fixture dựng theo `elp206-restatement-runtime.spec.ts`, chưa chạy được ở đây) thì đó là fixture chứ chưa chắc code; đọc thông báo `MANAGER_*` đầu tiên.

## 6. File

Mới: `migrations/1723680000147_execution-manager-series-observations.sql`, `src/execution-v2/manager-series-{observation,materializer,runtime}.ts`, `src/execution-v2/manager-series.store.ts`, `test/be-p16-manager-series-{materializer,pg}.spec.ts`, receipt này. Sửa: `manager-runtime.ts` (slot `series`, bảo vệ `MANAGER_SERIES_WORKER_RESULT_REQUIRED`, lost-ACK mang `precomputed_series`, series không gate revision tài chính), `manager-model.ts` (xuất `managerTupleKey`, `economicFacts`, `managerPartitionTotals`; không đổi logic), `manager-consumer.ts` (xuất type `ManagerCalculationLifecycle`).

## 7. Đề xuất cho lead (không sửa ở round này)

`HANDOFF_TO_CODEX.md` §10 hàng "Financial publication (ELP2-05/06)": "writer/materializer bounded **có** (BE-P16, opt-in, PG NOT_RUN); NAV/NET_PNL sinh từ fact khi nguồn đủ; RETURN, FX, ALL, subject Alpha/Deployment, lineage restated vẫn typed absence; chờ PG gate + quyết định lấy mẫu + chủ nguồn #7/#9/#10/#11/#12".

## 8. Receipt CR-02 / CR-03 (Claude, 2026-10-21; review: CODEX_CLAUDE_PRODUCER_REVIEW_2026-10-21.md)

Không migration mới (148 không dùng): marker "cần sửa" là cột đã có `backfill_state`, con trỏ keyset là cao điểm (high-water).

**CR-02 — phục hồi có biên sau một lần từ chối ghi live.**
- `recordFailure` (chạy trong transaction của revision tài chính, sau ROLLBACK TO SAVEPOINT) nay lật `COMPLETE -> IN_PROGRESS` và GIỮ con trỏ. Revision tài chính, head, ACK, hàng bất biến, lease fence không đổi.
- Idle tick: trạng thái COMPLETE vẫn là một point-read. Sau khi mở lại, `backfill` chỉ replay các revision SAU con trỏ chưa có hàng series (anti-join `LIMIT 1`, 1..16 revision/tick, mỗi cái một transaction có fence lease), rồi `finish` kiểm lại dưới advisory lock "manager-model" và đưa con trỏ tới revision mới nhất đã lưu (lần mở lại sau chỉ quét phần mới hơn). Sống sót qua restart vì marker nằm trong DB.
- Thử lại có biên: ghi replay bị từ chối (có thể tạm thời) => ghi disposition `SERIES_REPAIR_RETRY_n`, con trỏ đứng yên, một lần thử mỗi tick; sau `SERIES_REPAIR_ATTEMPTS = 3` => `SERIES_REPLAY_REFUSED`, revision thành khoảng trống đã nêu, con trỏ đi qua (không vòng lặp, không chặn các revision sau). Lỗi tất định (payload không parse / lệch digest) vẫn bỏ qua ngay như trước.
- Repair thành công (RECORDED) xóa `last_error_*` của đúng revision đó (trừ `SERIES_DIGEST_MISMATCH`).
- `DIGEST_MISMATCH`: đường live (`recordLive`) và đường replay của backfill đều ghi disposition tường minh `SERIES_DIGEST_MISMATCH` (không mở lại backfill, không ghi đè, không coi là replay tương thích); replay của backfill còn đẩy con trỏ qua revision và đếm `failed`.

**CR-03 — marker không chứng minh đã quan sát.**
- `history()` trả thêm các observation của revision neo (revision cuối trước floor), không chỉ marker.
- Materializer: từ revision neo (hoặc revision cũ nhất còn giữ) tới revision mang điểm đầu tiên trong cửa sổ, mỗi revision phải có observation dùng được của đúng key (có giá trị, cùng population/methodology/origin; instant có thể trước cửa sổ, không mang vào cửa sổ). Thiếu => `PARTIAL` + lý do `OBSERVATIONS_MISSING_BEFORE_FIRST_POINT`. Không nội suy, không carry-forward, không điểm biên bịa; không giả định nhịp ngày. Lịch sử thưa nhưng quan sát đủ và gap trong cửa sổ giữ nguyên kết quả cũ.

**Tests.** Không PG: `be-p16-manager-series-materializer.spec.ts` 42/42 (4 test CR-03 mới, 2 test runtime CR-02 mới; hai test CR-03 chính đỏ khi bỏ fix). `tsc` xem commit. PG (lead chạy, `TEST_DATABASE_URL`, `--maxWorkers=1`): `be-p16-manager-series-pg.spec.ts` — mới: "CR-02 recovery and dispositions at the store" (4 test: live digest mismatch, replay digest mismatch, thử lại có biên 3 lần, repair có lease fence + holder mới), và trong "end to end": "CR-02: backfill COMPLETE -> ... -> exactly one immutable observation set". Sửa kỳ vọng: history trả observation của revision neo; test consumer "series writer can refuse" nay thấy `SERIES_REPAIR_RETRY_1` (lần thử repair đầu cùng tick idle) thay vì `SERIES_REPLAY_REFUSED`. Chưa chạy PG ở đây.

## 9. CR-02 follow-up: ngân sách repair theo từng revision (Claude, 2026-10-21; review: CODEX_CLAUDE_PRODUCER_REVIEW_2026-10-21.md, addendum `ec228e53`)

**Lỗi Codex nêu.** `repairAttempt` suy số lần thử chỉ từ `last_error_code/last_error_revision` của checkpoint, mà một lần fail live của revision khác ghi đè hai cột đó: repair(r3)->RETRY_1, live fail(r4), repair(r3)->lại RETRY_1. Ngân sách ba lần bị reset lặp lại và có thể bỏ đói mọi lỗ phía sau.

**Thiết kế (cần migration; không có hàng append-only nào dùng lại được).** Revision bị từ chối ghi thì CHÍNH NÓ không có hàng marker/observation nào để mang trạng thái; `last_absences` là dữ liệu khác. Nên:
- Migration additive `1723680000148_execution-manager-series-repair-attempts.sql`: một cột `repair_attempts jsonb NOT NULL DEFAULT '[]'` trên `execution_manager_series_checkpoints`, CHECK `array` và `jsonb_array_length <= 16` (trần cứng). 145-147 không đụng. Down: giữ cột.
- Luật thuần trong `manager-series-repair.ts`: `refuse(entries, revision)` -> `{attempt, exhausted, entries}`; `settle`; `parseRepairEntries` (đọc phòng thủ). Thêm entry mới khi vượt 16 thì loại entry cũ nhất (chỉ làm revision bị loại bắt đầu lại ngân sách; repair xử lý từng revision một nên trần chỉ là chặn lưu trữ).
- Store: `chargeRefusal` (trong CÙNG transaction có fence lease, `SELECT ... FOR UPDATE`) tính attempt từ MAP, ghi `SERIES_REPAIR_RETRY_n` làm chẩn đoán và ghi map; lần thứ 3 -> exhausted: không ghi gì, `skip` nêu khoảng trống `SERIES_REPLAY_REFUSED`, đẩy con trỏ và xóa entry. `last_error_*` chỉ còn là chẩn đoán, không còn là bộ đếm.
- Chỉ xóa entry của ĐÚNG revision: repair thành công (`replay`: RECORDED/DUPLICATE/DIGEST_MISMATCH), ghi live thành công (`recordRevision` upsert checkpoint), khoảng trống đã nêu (`skip`). Xóa `last_error_*` khi repair thành công vẫn chỉ nếu nó thuộc revision đó và không phải `SERIES_DIGEST_MISMATCH`; một lỗi của revision khác không bị đụng.
- Giữ nguyên: 3 lần/revision, `SERIES_REPLAY_REFUSED` sau lần cuối, bỏ qua tất định cho digest/parse (không tiêu ngân sách), fence lease (mọi ghi trong `withFencedTransaction`), bất biến (observation/revision vẫn append-only), `COMPLETE` = một point-read mỗi tick (`backfill` thoát ngay trước khi đọc `repair_attempts`). Ledger: ghi chú hàng `execution_manager_series_checkpoints` trong `r2_ledger/persistence-ownership.v1.json` (không bảng mới).

**Tests.**
- Không PG, `test/be-p16-manager-series-repair.spec.ts` (mới): máy trạng thái (giới hạn 3, interleave r3/r4 không reset/không tiêu hao, settle chỉ xóa một revision, trần 16, đọc phòng thủ), vệ sinh migration 148, hồi quy mã nguồn (không còn `repairAttempt(`, ba chỗ xóa entry, COMPLETE thoát sớm). Chạy: repair + materializer + be-p4 = 3 file / 132 test PASS (vitest, 20.7s). `tsc --noEmit` không báo lỗi ở file nào của BE-P16 (lỗi có sẵn ở nơi khác, ví dụ `be-p4-manager-series.spec.ts:396` không phải do round này).
- PG (`be-p16-manager-series-pg.spec.ts`, đã viết, **NOT_RUN**): (1) store: "CR-02 interleave ..." — r3 fail live -> repair 1 bị từ chối -> r4 fail live xen vào (map r3=1 còn nguyên) -> đổi lease (holder cũ bị fence, không đổi gì) -> holder mới repair 2 (không về 1) -> r4 fail xen thêm -> lần 3: r3 thành khoảng trống đã nêu, con trỏ qua r3, r4 có ngân sách RIÊNG (RETRY_1) -> bỏ lỗi -> r4 ghi, COMPLETE, r3 vẫn là khoảng trống, `NO_WORK` và snapshot không đổi; (2) end to end qua `ExecutionManagerRuntime`: backfill COMPLETE -> r3 live fail -> repair 1 -> r4 live fail xen -> repair 2 của r3 -> bỏ lỗi -> một tick idle sửa cả r3, r4 -> COMPLETE, mỗi revision đúng một bộ observation và digest, restart hai tick không ghi lại gì; (3) test thử-lại-3-lần cũ nay kiểm thêm `repair_attempts` theo revision.
- **Chưa chạy được PG trong round này**: `flock -w 600 /tmp/portal-heavy.lock` chờ đủ 10 phút (08:50-09:00 UTC) mà khóa vẫn do `./full.sh` (be-p18-b1-explain) giữ và `portal-web-visual-record-v2.sh` đã xếp hàng trước; theo AGENT_WORKING_RULES §10.10b dừng và báo, không chen hàng. Lệnh cần chạy, đúng MỘT lệnh bọc khóa, từ gốc repo:
  `PATH=<dockerbin>:$PATH CONTROL_API_EXECUTION_EDGE_SECRET_DIRECTORY=/srv/primus/control-api/execution-edge-secrets EXECUTION_EDGE_ORIGIN=https://10.70.0.2:8443 EXECUTION_EDGE_DELEGATION_AUDIENCE=portal-execution-edge-paper PORTAL_RUNTIME_GID=991 scripts/control-api-test.sh test/be-p16-manager-series-pg.spec.ts test/be-p16-manager-series-materializer.spec.ts test/be-p4-manager-series.spec.ts` (script `run-pg.sh` ở scratchpad đã đóng gói sẵn). CR-02 chưa được coi là đóng cho tới khi PG này xanh.

File: mới `migrations/1723680000148_...sql`, `src/execution-v2/manager-series-repair.ts`, `test/be-p16-manager-series-repair.spec.ts`; sửa `manager-series.store.ts`, `test/be-p16-manager-series-pg.spec.ts`, `r2_ledger/persistence-ownership.v1.json` (ghi chú), receipt này.
