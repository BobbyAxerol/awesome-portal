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
