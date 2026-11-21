# Rà soát tính khả thi triển khai Score v1.1

**Ngày:** 2026-10-15 · **Phạm vi:** đọc đủ 1.605 dòng của `SCORE_REGIME_PROPOSAL_v1.1(1).md`; chạy lại reference tests trên máy cloud. Không trực tiếp audit repository/VPS, sửa code ứng dụng, cấu hình hoặc dịch vụ. Mục 6 ghi nhận kết quả audit source read-only được cung cấp bổ sung; không coi đó là kiểm chứng runtime. File score người dùng gửi được giữ nguyên; bản FINAL chỉ được harden reference Python và bổ sung test provenance như mục 8.

## 1. Kết luận

**Có thể triển khai. Phần công thức nhẹ; phần khó là nguồn dữ liệu kinh tế, đồng bộ thời gian và provenance.** Giữ nguyên một phương án đã chọn: F = 0,45P + 0,30R + 0,25B; P = 0,70 net-excess-TWR score + 0,30 Sharpe score; R = 0,60 MDD score + 0,40 ADD score; B = 0,50 positive-block score + 0,50 additional-cost-stress-TWR score. Bands giữ nguyên 0/40/60/75/90/100.

- **PASS số học:** chạy lại đúng Python của bản người dùng gửi sau khi đọc kiểm tra: **44/44 tests PASS**. Reference block trong bản FINAL đã harden thêm bảo vệ số và đạt **47/47 tests PASS**, giữ nguyên 44-test provenance (mục 8). Fixture 73,30; partial bounds [62,50; 76,00]; allocation 65,60 và direct portfolio 76,760969 đúng.
- **Chưa xác minh dữ liệu thật:** source audit read-only bổ sung ở mục 6 chưa chứng minh runtime; chưa có calibration anchors/delta/block horizon, shadow replay, permission tests hoặc benchmark hạ tầng. Không ghi chúng là PASS.
- **Chưa chứng minh tác dụng dự báo:** điểm này mô tả chất lượng kết quả đã quan sát theo policy; smoke tests không chứng minh chọn alpha có lợi nhuận tương lai tốt hơn.
- Không cần ML, optimizer, kernel execution/backtest mới hoặc thêm penalty. Không mở lại công thức hay bands. Anchors, stress delta, block horizon, math tolerances và maturity/freshness cần được hoàn thiện trong runtime calibration artifact như tài liệu đã quy định.

## 2. Kiểm tra toán và các giới hạn phải giữ nguyên

### 2.1 Range, chiều tăng và bù trừ

Sáu atomic weights là 0,315 / 0,135 / 0,180 / 0,120 / 0,125 / 0,125; đều không âm và tổng bằng 1. Khi normalized components hợp lệ, F thuộc [0,100] và không giảm nếu chỉ một normalized component tăng, các component khác cố định. Clipping tạo plateau nên không bảo đảm tăng nghiêm ngặt. Tính chất này **không** đồng nghĩa tăng một return trong raw path luôn làm mọi thành phần hay F tăng; Sharpe, block và drawdown cùng phụ thuộc đường đi.

Đây là composite cộng có bù trừ, đúng lựa chọn đã chốt:
- P=0 thì điểm tối đa theo component bounds là 55.
- R=0 thì điểm tối đa là 70; B=0 thì điểm tối đa là 75.
- Riêng stress component=0 vẫn có thể đạt tối đa 87,5 theo atomic bounds. Vì vậy band Tốt không chứng minh vượt stress; phải hiển thị stress/raw risk/breaches riêng.

Các mức trên là bounds của công thức, không khẳng định mọi vector component đều có thể sinh ra từ cùng một economic path. Calibration cần tìm profile thực hiện được, nhất là return gần cash, turnover cao, clipped risk và lợi nhuận tập trung ở ít block. Không tự thêm cap, multiplier hoặc sửa weights để che trade-off.

### 2.2 TWR, Sharpe, ADD và mẫu ngắn

- Chênh lệch cumulative TWR của subject và cash là đúng định nghĩa đã chọn; không thay bằng compounding arithmetic excess returns. Deposit/transfer cần flow-adjusted subperiod returns. GIPS Handbook mô tả geometric linking và valuation quanh cash flow, nhưng việc dùng nguyên tắc này không phải chứng nhận GIPS: [CFA Institute, phần Input Data and Calculation Methodology](https://www.gipsstandards.org/standards/gips-standards-for-firms/gips-standards-handbook-for-firms/).
- Sharpe dùng sample standard deviation, cùng frequency, n≥2 và std>0. Hai observations có thể tính được nhưng chưa tạo bằng chứng mạnh. Khi thêm một completed block vào K block hiện có, riêng contribution consistency có thể đổi tới 12,5/(K+1) điểm; từ một block thắng sang một thắng/một thua là giảm 6,25 điểm, chưa tính thay đổi các metrics khác. Exact zero variance trả partial, không infinity hoặc điểm thay thế. Near-zero variance cần kiểm tra precision/quantization; không tự thêm một epsilon làm thay đổi semantics mà chưa có policy.
- ADD là trung bình mọi drawdown trên grid, có cả DD=0, loại E0 khỏi denominator. Do đó 0≤ADD≤MDD<1 trên exact positive-wealth path. MDD/ADD là theo score window; operational drawdown since-inception vẫn giữ riêng.
- **Rolling window không được cập nhật ADD bằng cách chỉ trừ DD cũ và cộng DD mới.** Khi cửa sổ dịch, baseline/peak có thể đổi và toàn bộ DD còn lại có thể phải tính lại. Dựng lại đúng window là implementation MVP dễ kiểm chứng nhất.
- Provisional được công bố và vào allocation aggregate khi đủ math/data, approved runtime config và cùng effective window/basis. Không đợi nhiều năm/trades một cách tùy ý; cũng không dùng score 5 ngày thay 30 ngày. Maturity đổi badge/status, không discount điểm.

### 2.3 Stress: đúng phạm vi, không mở rộng thành mô phỏng kinh tế

Công thức đã chọn r_stress,j = r_net,j − delta_bps × G_j / (10.000 × V_start,j) tính được nếu V_start,j dương, gross executed notional đầy đủ, cùng economic scope và đúng instrument/FX. Actual baseline costs đã nằm trong net NAV; chỉ trừ incremental burden, không trừ lại fees/slippage.

**Baseline opening capital** khiến đây là normalized-return sensitivity theo fixed path, không phải ledger mô phỏng stressed wealth. Ví dụ hai subperiod baseline r=0, vốn baseline=100 ở mỗi đầu kỳ, mỗi kỳ thêm chi phí 1: công thức cho 0,99²−1=−1,99%; nếu thực sự khấu trừ tiền cố định 1+1 khỏi vốn 100 thì kết quả là −2%. Khác biệt này phù hợp caveat tại 5.4, không là lỗi cần đổi công thức.

Trên mọi subperiod có gross notional>0, điều kiện positive stress factor tương đương delta_bps < 10.000×(1+r_net,j)×V_start,j/G_j. Nếu đạt/vượt biên ở bất cứ subperiod nào, trả INVALID_STRESS_PATH và breach; không compound số âm. Monotonicity của stress chỉ được phát biểu trên miền path hợp lệ. Missing turnover không đồng nghĩa turnover=0.

Cash-flow/event grid, quy tắc ghi nhận costs và timestamps phải được khóa trước: cùng một tổng turnover nhưng chia subperiod khác nhau có thể cho stressed compounded return khác nhau. Không tính turnover cả tháng trên vốn cuối tháng. Stress scope của portfolio phải dedupe exchange fills; split attribution hoặc internal capital transfer không tạo thêm turnover.

### 2.4 Portfolio độc lập và coverage

PortfolioScore cần economic NAV path của chính portfolio/book. Không thể suy nó từ weighted alpha scores, HHI hoặc số lineage. Fixture đã kiểm chứng: composition 72,754793516 khác direct portfolio 76,760969082.

Thiếu q_i hoặc grouping không tự làm mất direct score nếu portfolio NAV/cost/benchmark/turnover vẫn đủ. Ngược lại, đủ q_i không thay thế được portfolio NAV. AlphaScore thiếu positive-allocation q phải null + coverage/bounds, không hidden renormalization. Assigned capital và current-NAV partition là hai basis khác nhau; allocation coverage NAV chỉ tính khi chứng minh partition.

## 3. Dependencies và độ phức tạp MVP

| Tầng | Inputs/đầu ra chính | Đánh giá |
|---|---|---|
| A. Reference calculator | Policy hợp lệ, returns/cash aligned, turnover ratios, block manifest → metrics/F/bands/status/bounds | Thấp; deterministic arithmetic, không ML. |
| B. Economic adapters | Valuations, external/internal flows, required costs, fills/notional, FX, ownership/dedupe | Cao nhất nếu nguồn thiếu. Dữ liệu quyết định tính exact/provisional/partial, không phải formula. |
| C. Allocation + portfolio | Verified capital snapshots, compatible q; consolidated portfolio NAV độc lập | Vừa nếu ledger tốt; cao nếu shared collateral chưa có partition. |
| D. Read model/UI/revisions | Sealed watermark, cache, authorization, original/restated, stage provenance | Vừa; cần integration và security tests thật. |
| E. Regime Fit riêng | Bound historical features/outcomes, temporal split, support/calibration | Triển khai sau; không phải dependency để xuất F. No-ML descriptive matching v1 đủ. |

Gọi n là số observations trong một window, m là cost/flow/fill subperiod events cần xử lý, a là số alpha, g là số lineage groups, h là số horizons và s là số subjects:
- Dữ liệu đã align/sắp xếp: metrics + stress + block summary **O(n+m)** cho một subject/window; fixed F/band O(1). Input chưa sorted cần thêm sorting/join cost, không được gọi toàn pipeline O(n) vô điều kiện.
- Allocation, coverage, score dispersion và grouped HHI **O(a+g)** trên snapshots đã hợp lệ. Consolidation event work và source IO là chi phí riêng.
- Một pass có thể dùng O(1) working accumulators ngoài dữ liệu đầu vào/manifest; rolling/replay cần giữ O(n) window data hoặc đọc lại từ source. Audit snapshots/retention tốn storage riêng.
- Growing fixed-start path có thể cập nhật nhiều moments/peaks/block counters incremental. **Rolling exact MDD/ADD không được coi là O(1) mặc định**; MVP rebuild O(n) mỗi affected subject/window, rồi tối ưu nếu profiling cho thấy cần.
- Full rebuild toàn bộ subject/horizon có quy mô O(Σ(n+m)); đồng nhất kích thước thì khoảng O(s×h×(n+m)). Không chạy mỗi browser request hoặc mỗi tick; tính khi sealed watermark/cost correction/allocation change thực sự ảnh hưởng dependency.
- Regime v1 scan k reference windows với d≤3 features có distance work O(kd); top-neighbor selection/sorting là chi phí bổ sung tùy policy. Đây không phải lý do đưa matching vào order path.

**Không có số máy/CPU/RAM/độ trễ hoặc ngày công đáng tin cậy trước khi biết s, grid, n, m, update cadence, source IO và correction rate.** Đây là complexity analysis, chưa phải benchmark hoặc sizing production.

## 4. Lộ trình và guardrails

1. **Audit inputs/config:** lập dependency matrix theo source authority; xác minh fees/funding/borrow nào bắt buộc, FX, flows, notional và ownership. Chỉ xuất raw/partial nơi còn gap; production config chưa duyệt giữ policy_pending.
2. **Shared calculator/shadow:** triển khai đúng F và bands, rolling rebuild đơn giản, precision contracts, immutable snapshots và các tests mục 11. Stress và ADD không cần engine mới. Integration phải kiểm chứng common-basis, costs dependency và độc lập PortfolioScore, không chỉ arithmetic.
3. **Read model/UI:** compute ngoài order path, sealed watermark, cache keys đủ scope/policy/revision; không thêm gate score vào close/reduce-risk. Same-window comparison, provisional weight và missing reasons hiển thị rõ.
4. **Calibration/release read-only:** freeze anchors theo horizon, delta, block origin/horizon và maturity/freshness; dùng temporal replay, failed/inactive alphas, sizing/turnover/tail/near-cash cases. Báo clipping, rank/band jumps, cost saturation và correction effects. Không fit lại anchors theo current table và không gọi fixture là calibration.
5. **Regime Fit:** thêm sau với binding/no-leakage/support gates riêng. Không ảnh hưởng F, permissions hoặc khả năng hiển thị economic score.

Release gate phải tách **math PASS**, **data/integration PASS**, **runtime-config approval** và **empirical usefulness**. Đổi từ shadow sang read-only production không tự cấp quyền trade/rebalance/Live.

## 5. Làm rõ kỹ thuật không đổi nghĩa công thức

Có thể đưa vào implementation guide, không cần mở lại quyết định score:
1. Đặt tên stress output rõ là fixed-path normalized-return sensitivity; công bố baseline capital/event grid và không gọi stressed cash NAV.
2. Ghi rõ rolling ADD/MDD rebuild peak từ E0 của window; thêm regression test khi peak cũ rời window.
3. Dependency matrix: missing required baseline costs vô hiệu các affected net metrics; missing turnover chỉ ảnh hưởng stress khi những source khác thực sự độc lập.
4. Reference smoke chỉ là fixtures: chưa hiện thực complete-block missingness, policy approval, identity/basis validation hoặc authorization. Không copy nguyên script rồi gọi production engine.
5. Precision/overflow/underflow phải fail closed: kiểm tra intermediate factors/equity/statistics và serialization, không chỉ finite inputs. Band dựa canonical value theo precision policy; các giá trị sát biên cần regression tests riêng.

**Tình trạng cuối:** tài liệu đủ nhất quán để dùng làm thiết kế đã chốt. Chưa có mâu thuẫn toán buộc đổi F/bands. Rủi ro chủ yếu là feed/ledger chưa đủ, cách triển khai rolling/stress sai semantics và gắn nhãn PASS quá rộng.


## 6. Cập nhật dependency matrix từ audit source read-only

Bằng chứng dưới đây là **source hiện diện/candidate contracts**, không chứng minh publisher đang chạy, dữ liệu đầy đủ hoặc kinh tế đã reconcile. PortalResearchBE được repin ở `d5d31cbd7adf3db658508b3cc9aedb280c1be2f1`; `fdea081` trong score là ghi nhận audit lịch sử. PM ở `d16aa2b` theo biên bản bổ sung. Các đường dẫn ghi TS trong audit dưới đây thuộc repository TScore; không đồng nhất toàn bộ TScore với riêng tradingEdge. Dòng có thể thay đổi ở revision khác.

| Dependency | Bằng chứng source được ghi nhận | Phần còn thiếu trước numeric production |
|---|---|---|
| NAV snapshots và dedupe ownership | TScore `init-db/10-performance.sql:74–102`, `init-db/19-performance-pnl-ops.sql:9–44`; `services/performance/repository.py:508–660`, reject ambiguous ownership ở 515–580 | Có snapshot và consolidation logic chưa đủ để suy exact flow-adjusted returns. Kiểm tra publisher, valuations quanh flow, continuity và real-data reconciliation. |
| Certified returns / Sharpe / DD | `native_owner.py:39–48,147–150` nêu point-in-time equity, không phải capital-flow returns; PM `operator_reports_contract.py:174–202` để `UNAVAILABLE_METHOD_NOT_CERTIFIED` | Không dùng equity snapshot growth làm TWR. Đây là dependency kinh tế thực sự của P/R/blocks và direct PortfolioScore. |
| External/internal capital flows | PM candidate CapitalFlow `FUND`/`RETURN`, internal pairing/elimination ở `operator_reports_contract.py:313–379` | Candidate contract chưa là runtime publisher; xác minh flows effective-time, completeness và phạm vi external của sleeve/portfolio/manager. |
| Baseline costs | TScore `services/performance/repository.py:844–893` projection fill fees/funding; `domain/economic_facts.py:77–91,1013–1075` có fee actual/pending và FUNDING/BORROW/REPAY/INTEREST | Chưa chứng minh borrow/interest aggregation đầy đủ và chưa kiểm tra real snapshots. Required-cost missingness phải truyền xuống affected net metrics. |
| Gross executed notional / stress | TScore `05-trading-core-v2.sql:146–187` fill facts; instrument multiplier/currency ở 77–101 | Chưa thấy canonical executed_notional hoặc QBTS interval aggregate. Có thể dựng adapter từ fills + instrument/FX đúng authority, nhưng phải xác minh contract types, dedupe và coverage; không coi thiếu feed là 0. |
| Allocated economic capital | N11 `catalogue.py:233–248` bounded deployment/portfolio attribution | Publication/ownership partition chưa được xác minh; không dùng margin/exposure/target budget thay economic capital. |
| Revision/continuity | `durable_economics_contract.py:31–86,266–285` | Candidate contract cần chứng minh immutable snapshots, available-at, corrections và replay thực thi. |
| Research provenance | ResearchBE release candidate `43–60,469–496,621–638` có run/params pins | Chưa tìm thấy binding sang TScore. Cần cho Regime Fit/research evidence; **không phải blocker chung cho PortfolioScore từ ledger hợp lệ**. |
| Runtime score config | Chưa có approved anchors/delta artifact được xác nhận | Formula đã chốt; runtime score vẫn policy_pending tới khi profile/horizon config được phê duyệt, không lấy fixture làm production. |

**Kết luận cập nhật:** đã có nguyên liệu và contracts ứng viên để triển khai, nhưng hiện chưa đủ bằng chứng cấp numeric production. Nút thắt gần nhất là certified cash-flow-adjusted returns, required-cost coverage, interval notional và approved policy artifact. Thiếu research binding chỉ chặn phần phụ thuộc research, không thay thế các điều kiện ledger độc lập của portfolio.

## 7. Kết quả kiểm tra bổ sung và giới hạn reference code

Bằng chứng số: `SCORE_REVIEW_NUMERICAL_CHECKS_v1.0.json`; script gốc trích nguyên từ appendix: `score_v1_1_review_smoke.py`.

- **PASS:** 1.000 paths giả lập có seed cố định, kiểm tra delta 5→10 bps không làm stress score/F tăng trên positive paths; P/R giữ nguyên khi chỉ đổi stress; F trong [0,100]; 0≤ADD≤MDD<1. Đây là property fixtures, không market validation.
- **PASS:** các direct scores trong fixture 7.5 khớp đến tolerance 1e−9; composition=72,75479351637497 và portfolio=76,76096908199985.
- **PASS:** strict stress boundary và finite extreme Sharpe; rolling-window counterexample xác nhận phải rebase/rebuild. Ví dụ window returns [−50%;+20%;−10%] có ADD≈45,333%; cửa sổ sau [+20%;−10%;0%] có ADD≈6,667%, không được giữ DD cũ.
- **Giới hạn reference float tìm thấy:** 400 returns −90% làm product underflow về 0 và hàm reference trả TWR=−1 dù exact wealth vẫn dương. Runtime phải phát hiện numeric underflow/representation loss, hoặc dùng stable higher-precision/log representation có kiểm tra range; không silently xuất path như dữ liệu hoàn chỉnh.
- **Giới hạn reference normalization tìm thấy:** x=1e308, L=−1e308, U=1e308 đều finite nhưng hiệu số float overflow khiến helper trả 0 thay vì endpoint 100. Đây là anchors phi thực tế nhưng chứng minh finite-input validation chưa đủ; xử lý endpoint/range/intermediate arithmetic an toàn là hardening cần có.

Hai hạn chế trên thuộc code minh họa số học, không phải lý do đổi formula/bands. Không sửa score gốc hoặc ghi 44 smoke tests thành bằng chứng production-safe numerics.


## 8. Hardening reference block trong bản FINAL

Chỉ cập nhật block Python và test provenance của `SCORE_REGIME_SPECIFICATION_v1.1_FINAL_VI.md`; file upload `SCORE_REGIME_PROPOSAL_v1.1(1).md`, script gốc và JSON kiểm tra gốc được giữ nguyên. Không sửa repository, VPS hoặc implementation đang chạy.

- `normalize`: xử lý x≤L và x≥U trước phép trừ; với interior, dùng Decimal trong local precision context để tính đúng cùng linear map mà không overflow hiệu hai finite floats cực lớn. Không đổi anchors hoặc mapping.
- `twr`: giữ positive return-factor validation; thêm `NUMERIC_OUT_OF_RANGE` cho compound overflow/underflow và trường hợp positive wealth bị float round thành cumulative return −1. Trạng thái này là lỗi biểu diễn số, không phải bằng chứng vốn kinh tế bằng 0.
- Thêm 3 regression tests: extreme finite endpoints, extreme finite interior/midpoint và positive-wealth numeric range (400 kỳ −90%, 20 kỳ −90% mất độ phân giải ở phép trừ 1, compound overflow). Tổng **47/47 PASS**; 44 tests gốc vẫn được chạy trong bộ mới.
- Script trích chính xác từ FINAL: `score_v1_1_final_hardened_smoke.py`. Receipt riêng: `SCORE_FINAL_HARDENING_TEST_RECEIPT_v1.0.json`, gồm hashes bảo toàn source/script gốc, hash script mới, kết quả và phạm vi chưa chạy.

Hai lỗi biểu diễn đã quan sát ở mục 7 được xử lý trong reference FINAL; mục 7 và JSON gốc vẫn là provenance của kiểm tra bản upload. Hardening này không biến reference fixtures thành production kernel, không thay F/weights/bands và không thay thế source-to-runtime validation/calibration.
