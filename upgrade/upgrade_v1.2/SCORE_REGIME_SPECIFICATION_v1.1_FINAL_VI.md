# QBTS, AlphaScore, PortfolioScore và Regime Fit — Đặc tả thống nhất

**Phiên bản: 1.1 · Ngày cập nhật: 2026-10-15**  
**Bản gốc:** `SCORE_REGIME_PROPOSAL(1).md`, phiên bản 1.0 candidate.  
**Phạm vi:** scoring phục vụ quan sát, so sánh và quản trị các alpha/portfolio tại Paper, Sandbox, Canary, Live; không giới hạn ở backtest dài hạn.

**Trạng thái quyết định:** chủ hệ thống đã duyệt hướng tính trong cuộc thảo luận: một framework Performance–Risk–Robustness, raw alpha score, attribution theo allocation và PortfolioScore trực tiếp từ kết quả danh mục. V1.1 thay thế các lựa chọn công thức cạnh tranh trong v1.0 bằng **một cách tính duy nhất**. Các trọng số và band bên dưới là baseline thiết kế đã chọn để triển khai/kiểm thử, không phải kết quả thực nghiệm chứng minh tối ưu. Anchors, mức stress, block horizon và ngưỡng evidence chưa được cung cấp số production; chúng phải được điền vào calibration artifact theo quy trình ở mục 12–13, không được tự lấy số fixture làm cấu hình thật.

Tài liệu này cập nhật specification; không xác nhận đã sửa code, deploy, hiệu chỉnh bằng dữ liệu thực, thay allocation hoặc cho phép Live.

## 1. Quyết định thống nhất

### 1.1 Một công thức chất lượng, ba cách sử dụng

\[
\boxed{F_{\pi}(X)=QBTS(X)=0.45P(X)+0.30R(X)+0.25B(X)}
\]

\[
\begin{aligned}
P&=0.70N_{T}(TWR_{excess})+0.30N_{SR}(SR),\\
R&=0.60N^-_{MDD}(MDD)+0.40N^-_{ADD}(ADD),\\
B&=0.50(100p_+)+0.50N_{T}(TWR_{stress,excess}).
\end{aligned}
\]

Mọi thành phần và kết quả chất lượng nằm trong `[0,100]`. `N_T` dùng **cùng anchors** cho net excess TWR thực tế và stress excess TWR trong cùng window; không đặt anchors dễ hơn để stress nhận điểm cao hơn.

| Đánh giá / view | Công thức | Ý nghĩa |
|---|---|---|
| **AlphaScore raw / QBTS alpha** | `q_i = F_pi(X_i)` | Chất lượng kết quả của alpha/deployment/sleeve được chỉ định, chưa nhân allocation weight. |
| **Alpha score contribution** | `c_i = w_i * q_i` | Số điểm alpha đóng góp vào AlphaScore theo allocation; không phải một raw score mới. |
| **AlphaScore theo allocation của manager/portfolio** | `A = sum_i(w_i * q_i)` | Chất lượng của phần vốn đang phân bổ vào các alpha trong scope. |
| **PortfolioScore** | `q_p = F_pi(X_p)` | Chất lượng kết quả thực tế của chính danh mục từ NAV/return path của nó. |
| **Manager PortfolioScore** | `q_M = F_pi(X_M)` | Cùng công thức trên NAV hợp nhất phần vốn manager quản lý, đã loại trùng vốn và internal transfers. |

`w_i = a_i / sum_j(a_j)`; `a_i` là allocated economic capital đã xác minh, không phải margin, budget hoặc exposure. PortfolioScore **không** bằng AlphaScore sau một penalty HHI, và cũng không bằng trung bình PortfolioScore của các danh mục con.

### 1.2 Những nguyên tắc đã chốt

1. **Performance–Risk–Robustness** là ba trụ cột. Performance phải nhìn thấy hiệu quả kinh tế trên vốn, không chỉ ratio; Risk dùng cả mức drawdown cực đại và drawdown trung bình; Robustness dùng consistency theo block và sensitivity với một kịch bản chi phí bổ sung cố định.
2. Raw score không nhân allocation của manager, nhưng vẫn phản ánh sizing, leverage, cash trong sleeve và chi phí của deployment đang đo. Không tự risk-normalize sang một deployment giả định.
3. Mẫu ngắn nhưng hợp lệ và tính đủ thành phần được công bố **score sơ bộ — provisional**. Không nhân confidence tùy ý và không đồng nhất thời gian quan sát ngắn với dữ liệu sai.
4. Score sơ bộ được vào allocation aggregate **khi cùng comparison window/basis**. Công bố tỷ trọng allocation dùng evidence sơ bộ. Chưa đủ cửa sổ 30 ngày không được giả là có score 30 ngày.
5. Timeline alpha đi xuyên Paper → Sandbox → Canary → Live. Giữ nguồn gốc từng đoạn; chỉ nối return path theo continuity manifest đã xác minh, không nối virtual capital thành actual NAV hoặc lấy stage average làm track record.
6. HHI, concentration, score dispersion, correlation và risk contribution là **diagnostics riêng**; không có `lambda` trong công thức QBTS/AlphaScore/PortfolioScore v1.1.
7. Regime Fit tiếp tục là descriptive historical matching; không cộng vào QBTS, không nhân score và không trở thành xác suất có lãi.
8. Shared calculation module ngoài order path là formula authority duy nhất. Portal phục vụ read model/cache; tradingEdge phát facts. Score không được tự cấp quyền Live, tái phân bổ vốn hoặc chặn hành động close/reduce-risk đã được phép.

### 1.3 Thay đổi so với v1.0

| V1.0 | V1.1 thay thế |
|---|---|
| Ba lựa chọn QBTS A/B/C | Chỉ một composite P/R/B như mục 1.1; PSR/DSR không thuộc công thức. |
| Q = Sharpe, D = MDD, S = tỷ lệ block thắng | P = net excess TWR + Sharpe; R = MDD + ADD; B = consistency + cost stress. |
| PortfolioScore giảm theo concentration của điểm | PortfolioScore tính trực tiếp trên portfolio NAV; HHI chỉ là diagnostics. |
| Mẫu ngắn chỉ preview, không vào aggregate | Provisional numeric score được sử dụng khi tính đủ, đúng basis/window; maturity hiển thị riêng. |
| Thiếu q hoặc grouping làm mất cả hai aggregate | Thiếu q ảnh hưởng allocation-weighted AlphaScore; không tự làm mất PortfolioScore có NAV hợp lệ. Thiếu grouping chỉ ảnh hưởng diagnostics grouping. |
| Band chưa thống nhất | Năm band cố định của phiên bản này, ở mục 5.8. |
| Stage dễ trở thành ranh giới bắt buộc reset | Tách timeline, verified economic domain và continuity; đổi stage đơn thuần không reset đường actual đủ điều kiện. |

## 2. Cơ sở và giới hạn của nghiên cứu

- Sharpe là đại lượng ước lượng, có sai số mẫu; quy đổi căn bậc hai của thời gian không đúng một cách tổng quát khi returns phụ thuộc chuỗi. V1.1 giữ Sharpe theo đúng tần suất dữ liệu, công bố sample và không suy ra certainty từ một điểm số. [Andrew W. Lo, The Statistics of Sharpe Ratios, 2002](https://alo.mit.edu/publications/page/18/).
- PSR/DSR giúp xem xét độ dài mẫu, phân phối returns và bias do lựa chọn qua nhiều thử nghiệm. DSR cần thông tin về quá trình thử nghiệm; không được đặt số trial bằng 1 chỉ vì registry chưa ghi lại. [Bailey và López de Prado, The Deflated Sharpe Ratio, 2014](https://www.davidhbailey.com/dhbpapers/deflated-sharpe.pdf).
- TWR, định giá quanh cash flow và nối hình học các subperiod là cơ sở hữu ích cho return comparability. Tài liệu này chỉ mượn nguyên tắc đo lường; không tuyên bố hệ thống đạt GIPS. [CFA Institute, GIPS Standards Handbook for Firms, phần Input Data and Calculation Methodology](https://www.gipsstandards.org/standards/gips-standards-for-firms/gips-standards-handbook-for-firms/).
- HHI là tổng bình phương các tỷ trọng. Áp dụng HHI vào vốn hoặc score contribution là hai cách định nghĩa tỷ trọng khác nhau. Không lấy ngưỡng chống độc quyền hoặc ngành ngân hàng làm ngưỡng an toàn giao dịch. [BIS Data Portal, Herfindahl index](https://data.bis.org/help/glossary?item=Herfindahl+index&sel=).
- Rủi ro danh mục phụ thuộc covariance giữa các thành phần, không chỉ số lượng tên hoặc sự cân bằng trọng số. [Harry Markowitz, Portfolio Selection: Efficient Diversification of Investments, 1959, chương VII–VIII](https://www.jstor.org/stable/j.ctt1bh4c8h).
- Median/MAD cung cấp cách chuẩn hóa ít bị chi phối bởi outlier hơn mean/std trong một số dữ liệu. Đây chỉ là lý do chọn robust distance, không phải bằng chứng Regime Fit dự báo tốt. [NIST, Median Absolute Deviation](https://itl.nist.gov/div898/software/dataplot/refman2/auxillar/mad.htm).
- Scaler, feature selection và threshold phải fit trên reference/calibration đã biết trước, không trên cả tập đánh giá. [scikit-learn, Common pitfalls: data leakage](https://scikit-learn.org/stable/common_pitfalls.html#data-leakage).

Các nguồn trên được giữ từ bản gốc để giải thích nguyên tắc đo lường; chúng không xác nhận trọng số, anchors, band hoặc cost-stress policy của hệ thống. Công thức sản phẩm ở v1.1 là **quyết định thiết kế đã được chọn trong cuộc thảo luận**. PSR/DSR chỉ có thể là Research evidence diagnostics riêng khi đủ inputs; không phải lựa chọn QBTS thứ hai. Các giới hạn về uncertainty không được biến thành điều kiện đợi lịch sử dài như backtest mới cho manager nhìn score.

## 3. Từ điển: phân biệt chất lượng, attribution, kết quả kinh tế và evidence

| Khái niệm / field | Ý nghĩa | Không được diễn giải thành |
|---|---|---|
| `qbts.value` / AlphaScore raw | `F_pi(X_i)` trên scope alpha/deployment/sleeve rõ ràng | Xác suất thắng, lợi nhuận kỳ vọng, quyền Live hoặc score đã nhân allocation. |
| `alpha_score_contribution.value` | `w_i*q_i`, đơn vị điểm đóng góp | PnL contribution, risk contribution hoặc chất lượng độc lập của alpha. |
| `alpha_score.value` | Trung bình raw scores theo allocated economic capital trong scope | Portfolio TWR, Sharpe danh mục hoặc năng lực manager được chứng minh. |
| `portfolio_score.value` | `F_pi(X_p)` trên return/NAV của danh mục | Trung bình raw alpha scores, score bị trừ HHI hoặc lợi nhuận bảo đảm. |
| `manager_portfolio_score` | Cùng `portfolio_score` với `subject_type=manager_book` | Công thức thứ tư hoặc trung bình điểm danh mục con. |
| `P`, `R`, `B` | Component points: Performance, Risk, Robustness; lớn hơn là tốt hơn theo policy | `P` không là PortfolioScore; `B` không là confidence. |
| `ADD` | Average Drawdown trên toàn score window, có cả drawdown bằng 0 | Average depth theo từng drawdown episode hoặc riêng các ngày đang drawdown. |
| `TWR_excess` | Net TWR của subject trừ cash-reference TWR cùng window | Compounding chuỗi arithmetic excess returns hoặc NAV growth gồm deposit. |
| `TWR_stress,excess` | Excess TWR trên fixed-path additional-cost scenario | Kết quả đã thực hiện hoặc prediction của execution thay đổi. |
| `provisional` | Numeric score tính đủ nhưng evidence chưa đạt maturity policy | Dữ liệu giả, validation đạt hoặc missing metric được điền. |
| `partial_components` | Một số thành phần chưa tính được; full score null | Score thấp hoặc permission bị khóa. |
| `allocation_hhi` | Concentration vốn theo lineage group | Correlation/covariance hoặc an toàn giao dịch. |
| `score_contribution_hhi` | Concentration của positive score credit theo group | PnL concentration, độc lập kinh tế hoặc concentration của edge. |
| `score_dispersion` | Độ chênh lệch raw scores theo weights | Standard error hoặc confidence interval. |
| `risk_contribution` | Đóng góp vào một risk measure cụ thể | Allocation weight hoặc score contribution. |
| `stage` | Paper, Sandbox, Canary, Live | Economic domain suy từ tên stage; Research/Archive là stage thứ năm. |
| `economic_domain` | Nguồn vốn và execution environment đã xác minh: actual/virtual theo source contract | Nhãn stage do UI tự suy diễn. |
| `series_kind` | Single-domain economic path hoặc cross-stage forward observation | Một enum stage vận hành mới. |
| `lifecycle_status` | Vòng đời record/deployment, có archived khi source dùng | Tình trạng evidence hoặc market regime. |
| `MarketRegime` | Đặc trưng thị trường: volatility, trend, liquidity | TradeState của alpha. |
| `TradeState` | Trạng thái thực tế do engine báo theo contract nguồn | Nhãn thị trường bullish/bearish. |
| `RegimeFit` | Historical similarity/support và outcome summary | Xác suất alpha sắp có lãi hoặc thành phần QBTS. |

Field paths ở đây là contract đề xuất. Adapter giữ đúng tên/enum vận hành hiện hữu sau source audit, không tự tạo các TradeState/lifecycle mới. `alpha_score.value` giữ nghĩa manager/portfolio composition để không mơ hồ với `qbts.value`; UI có thể ghi “AlphaScore raw” cho `qbts.value`.

## 4. Basis chung và inputs tối thiểu

### 4.1 Một score không được tồn tại chỉ dưới dạng một con số

Tách hai định danh để các alpha khác nhau vẫn aggregate được:

**`comparable_basis_id`** nhận diện phương pháp so sánh dùng chung:

- Verified `economic_domain`, account/execution mode và `series_kind`: single-domain actual, single-domain forward simulated hoặc cross-stage forward observation được đăng ký. `evidence_kind` giữ research IS/OOS, historical simulated, forward simulated, actual; stage giữ trong provenance/breakdown. Research là evidence kind; Archive là lifecycle, không phải deployment stage.
- Stage không tự là lý do bất tương thích: Canary/Live cùng đường actual có thể chia sẻ basis nếu đo cùng phương pháp và continuity hợp lệ. Actual và virtual vẫn tách economic aggregation; mixed observational path có basis riêng.
- `window_start`, `window_end`, `observation_frequency`, session calendar, timezone, return horizon, benchmark/risk-free series và base currency.
- `metric_profile_version`, net/gross basis, required costs/cost coverage contract, valuation/FX method và external-flow treatment.
- `score_policy_version`, formula hash, normalization/calibration snapshot, cost-stress policy, block manifest và maturity/math-validity policy.
- `requested_window`, `effective_window`, duration key và comparison eligibility. Hai raw scores cùng range nhưng khác window không được dùng thay cho cùng-window scores.

**`individual_evidence_binding_id`** nhận diện bằng chứng riêng: `alpha_id`, deployment/sleeve identity, `strategy_version`, strategy `params_hash`, executable `trade_params_hash`, data/ledger snapshot, input manifests và revision. `research_binding_id` và exact `run_id` bắt buộc khi sử dụng research evidence hoặc Regime Fit; nguồn chỉ từ economic ledger phải khai báo research linkage có/không áp dụng, không bịa run ID. Research binding thiếu làm Regime Fit unbound, không tự phủ nhận một portfolio NAV đã reconcile.

Portfolio/manager dùng subject binding gồm `portfolio_id`/book ID, constituent ownership manifest và consolidated ledger snapshot, không buộc tất cả alpha phải có cùng run/version/params. Mỗi alpha có individual binding khác nhau là bình thường.

Compatibility: nếu adapter legacy vẫn trả `basis_id`, field đó chỉ là alias của `comparable_basis_id`; không bao giờ trỏ sang `individual_evidence_binding_id` hoặc chứa unique alpha/run identity.

Allocation aggregate yêu cầu **compatible comparable basis** và **từng individual binding liên quan đều hợp lệ**, không yêu cầu cùng individual binding. Hai record cùng thang 0–100 chưa đủ để cộng/trung bình. Khác basis thì giữ facets, không tự renormalize các alpha còn lại; allocation aggregate có `INCOMPARABLE_BASIS`/partial coverage theo contract. PortfolioScore được tính độc lập từ subject ledger/basis của portfolio, không phụ thuộc việc mọi alpha đã có raw score hay chưa. Không nối backtest + forward + live thành actual track record.

Economic domain phải lấy từ verified account/environment/execution provenance. Không suy ra actual money chỉ vì stage tên Canary hoặc Live. Các stage có thể trỏ cùng physical account; economic NAV/cash/capital phải dedupe theo account/ledger ownership trước khi tổng hợp. Paper/Sandbox virtual allocation không được cộng với real NAV. Forward observation xuyên stage dùng đúng công thức F_pi nhưng có continuity manifest, source-selection rule và label riêng theo mục 4.5; không đổi thành actual portfolio economic score.

Manager economic NAV/PnL có thể tổng hợp dòng tiền thực tế từ nhiều deployments khi account ledger cho phép, nhưng chỉ tính mỗi nguồn vốn một lần. Việc tổng hợp kinh tế đó không tự làm mọi raw QBTS tương thích; comparability vẫn phải được kiểm tra. PortfolioScore trực tiếp vẫn có thể tính trên NAV hợp nhất hợp lệ.

### 4.2 Inputs cần có

1. Identity: alpha/deployment/version, params hash, family/lineage mapping có hiệu lực theo thời gian, stage và binding.
2. Chuỗi net equity/NAV valuations cùng timestamp, unitized NAV hoặc đủ valuation và cash-flow ledger để xây dựng nó.
3. External flows của portfolio, internal transfers giữa alpha sleeves và timestamp hiệu lực. Một transfer là external với sleeve nhưng internal với manager.
4. Fees/commission/rebates, funding, borrow và execution-cost metadata; chỉ yêu cầu những cost áp dụng cho sản phẩm/venue đó nhưng phải khai báo đầy đủ danh sách.
5. Gross executed notional đã reconcile, instrument valuation/FX và cost-stress scenario version; turnover bằng 0 chỉ khi đã xác minh không có fill, không phải do thiếu feed.
6. Market/benchmark series và FX cùng version, frequency, calendar. Không forward-fill qua gap tùy tiện.
7. Allocation snapshot gồm `allocated_capital`, cash, reserves, manager NAV, currency, `effective_at`, snapshot id và policy định nghĩa capital.
8. Window manifest, expected/received sample counts, gap reasons, stale watermark, realized/unrealized PnL coverage và reconciliation status.
9. Với Regime Fit: market features từ trailing data đã biết ở đầu cửa sổ, outcomes của cửa sổ đã hoàn tất và evidence manifest đúng binding.

Không bắt buộc lưu full order book để làm v1. Nếu thiếu spread/depth, liquidity dimension phải công khai unavailable hoặc dùng schema nhỏ hơn đã hiệu chỉnh riêng; không âm thầm điền 0.

### 4.3 Cash-flow-adjusted returns và changing allocation

Tại mỗi external cash flow, lấy valuation ngay trước flow `V^-` và ngay sau flow `V^+ = V^- + F`. Return của một subperiod không có external flow là:

`r_j = V^-_end,j / V^+_start,j - 1`

`TWR = product_j(1 + r_j) - 1`

Xây unitized NAV `E_t = E_(t-1) * (1 + r_t)` để tính drawdown. Khi không có valuation quanh flow, chỉ dùng approximation được policy đặt tên, ví dụ Modified Dietz, kèm trạng thái approximation. Không tự gọi nó là exact TWR. Vốn/NAV không dương hoặc net liquidation phá giả định unitization phải trả metric unavailable và breach riêng.

Ví dụ: 100 tăng thành 105, nạp thêm 100 thành 205, sau đó tăng 2% thành 209.10. TWR đúng là `1.05 * 1.02 - 1 = 7.10%`. PnL là 9.10; không dùng 109.10% NAV growth hoặc 9.10% chia vốn đầu kỳ làm TWR.

Return manager phải lấy từ NAV/ledger manager, gồm cash return và costs. Không lấy trung bình full-window alpha returns theo allocation ở cuối kỳ. Nếu tái tạo theo alpha, phải dùng contemporaneous beginning-of-subperiod economic weights, sleeves không overlap, cash và reconciled transfer ledger.

Score hiện tại dùng allocation snapshot hiện tại và score window đã công bố. Biểu đồ score lịch sử dùng allocation snapshot có hiệu lực **tại từng thời điểm lịch sử**, không áp trọng số hôm nay ngược về quá khứ.

### 4.4 Cửa sổ so sánh và mẫu ngắn

Một comparison profile phải khóa observation frequency, calendar, cash reference, currency, cost basis, anchors theo horizon và block construction. UI hỗ trợ các horizon vận hành như 7/30/90 ngày khi calibration artifacts tương ứng có sẵn; đó không phải lý do tự suy ra một bộ anchors chung cho mọi horizon.

- Score window là `[window_start_ms, window_end_ms)` theo event-time convention; valuation đầu kỳ và cuối kỳ bao phủ chính xác khoảng đó. Mỗi observation return được gắn một subinterval và close cutoff rõ ràng, không nhập nhằng việc event ở biên thuộc cửa sổ nào.
- Scoring chỉ tới watermark mà valuation, fees/costs bắt buộc, FX và benchmark đã reconcile. Một live tile có thể refresh liên tục khi snapshot hoàn chỉnh mới đến; không dùng bar chưa đóng để giả là một observation đã chốt.
- Để so sánh cùng horizon H, tất cả subjects phải được tính lại trên đúng window H, không so score since-inception 5 ngày với score 90 ngày như cùng basis.
- Alpha mới chưa đủ H vẫn hiện trong **Early / Provisional** với `effective_window`, sample và raw metrics. Numeric early score chỉ được phát khi policy có anchors cho chính duration đó và đủ math inputs. Nếu chưa có duration mapping, chỉ raw components/preview, không extrapolate TWR 5 ngày thành 30 ngày.
- `provisional` không đồng nghĩa khác basis. Hai alpha có đủ cùng window 7 ngày nhưng chưa qua maturity 30 ngày có thể cùng numeric score và aggregate sơ bộ trên **window 7 ngày**. Ví dụ maturity 30 ngày chỉ minh họa quan hệ, không phải ngưỡng production đã chọn.
- Early score khác window không đi vào headline aggregate của H. Manager vẫn có PortfolioScore từ NAV của danh mục, còn composition coverage/bounds phản ánh phần raw score chưa thể so sánh.
- Biểu đồ since-inception là lịch sử mô tả. Khi duration thay đổi, normalization duration key đi cùng từng snapshot; không trình bày một sự đổi điểm do đổi horizon/anchors như alpha tự cải thiện.

Không “đủ n” bằng cách đếm tick, fills hoặc nhân số stage. Observation count thuộc return sampling grid; trade count, elapsed time và distinct episodes là diagnostics khác.

### 4.5 Timeline xuyên stage và quy tắc nối evidence

**Lịch sử quan sát được giữ liên tục; lịch sử kinh tế không được giả mạo.** Một alpha có timeline bao gồm nhiều deployment/stage với thời điểm chuyển, version, sizing/execution configuration, costs và economic domain của từng segment.

**Single-domain economic path:** khi Canary → Live chỉ đổi nhãn và cùng account/sleeve, executable configuration tương thích, accounting liên tục, không reset E_t hay MDD chỉ vì đổi stage. Stage breakdown vẫn ghi chính xác. Portfolio có nhiều alpha/version được thêm/bỏ theo thời gian vẫn có một kinh tế danh mục liên tục; thay constituent không làm reset NAV portfolio.

**Cross-stage forward observation:** cùng F_pi có thể đánh giá chuỗi unitized observation từ Paper → Sandbox → actual với những điều kiện bắt buộc:

1. Manifest giữ toàn bộ segments và không chứa research backtest được gắn lại thành forward. Mỗi segment có nguồn thật, observed start/end, available-at, version/params, verified domain và cost method.
2. Exact alpha version/strategy params/executable configuration phải đồng nhất hoặc có mapping equivalence đã xác minh trước. Đổi cấu hình có ý nghĩa tạo series boundary; timeline vẫn liền nhưng score của cấu hình mới không được kế thừa im lặng kết quả cấu hình cũ.
3. Ở mỗi khoảng thời gian, **chỉ một authoritative observation source** được chọn theo lịch nguồn được đăng ký trước khi biết outcome. Khi paper/live chạy song song, không cộng số ngày, không chọn nguồn có return đẹp hơn và không backfill gap bằng nguồn khác sau khi xem kết quả.
4. Return observations phải align cùng grid, cash reference/currency, cost completeness và score policy. Thiếu continuity, gap valuation hoặc cost mapping không rõ: không nối score; giữ segment cards.
5. Nối các subperiod net returns hợp lệ bằng `E_t=E_(t-1)*(1+r_t)`; **không nối nominal NAV/capital** giữa tài khoản virtual và actual. Transition không có holding path liên tục phải có rule handoff/rebase được chứng minh, không tạo return giả tại điểm nối.
6. `series_kind=cross_stage_forward_observation` cùng `economic_domain=mixed_observation` là analytics metadata, không phải operational enums. Label bắt buộc: **“Forward tổng hợp xuyên stage — không phải actual track record”**; stage durations/actual durations hiển thị cạnh score.
7. Mixed observational score chỉ so với cùng comparison profile và có thể đứng trong manager observational facet riêng. Không đưa virtual allocation vào actual allocation denominator; không thay actual AlphaScore/PortfolioScore headline bằng mixed score.

Ví dụ: 40 ngày Paper + 20 ngày Sandbox + 10 ngày actual không overlap = 70 ngày forward observation nhưng chỉ 10 ngày actual. Không lấy `(q_paper+q_sandbox+q_live)/3`, không tính vốn ảo vào manager NAV. Regime Fit vẫn giữ matched outcome summaries theo domain/stage như mục 9; shared timeline không cho phép trộn support weights tùy ý.

## 5. QBTS / AlphaScore raw: một công thức P–R–B

### 5.1 Policy và mapping 0–100

Formula policy: **`qbts_prb_v1_1`**. Một production config là immutable artifact chứa formula version/hash, calibration snapshot, horizon-specific anchors, block policy, cash/FX/cost treatment, additional-cost stress và maturity thresholds. UI không tự tính lại metric hoặc dùng slider sửa policy thật.

Với metric lớn hơn là tốt hơn:

\[
N_m^+(x)=100\,\operatorname{clip}\!\left(\frac{x-L_m}{U_m-L_m},0,1\right).
\]

Với loss metric lớn hơn là xấu hơn:

\[
N_m^-(x)=100-N_m^+(x),\qquad U_m>L_m.
\]

`clip(z,0,1)=min(1,max(0,z))`. `L_m/U_m` là anchors của **metric m tại đúng profile/window**, không là lower/upper confidence bounds. Với downside, loss tại/bên dưới L nhận 100; tại/bên trên U nhận 0. TWR âm là input hợp lệ, không phải data error.

| Metric | Chiều tốt | Anchors / unit |
|---|---|---|
| `TWR_excess` và `TWR_stress_excess` | Cao | Cùng `L_T`, `U_T`; return fraction, ví dụ 0.01 = 1%. |
| `SR_period` | Cao | `L_SR`, `U_SR`; ratio cùng observation frequency, không annualize mặc định. |
| `MDD` | Thấp | `L_MDD`, `U_MDD`; positive loss fraction. |
| `ADD` | Thấp | `L_ADD`, `U_ADD`; positive loss fraction, đúng định nghĩa toàn cửa sổ. |
| `p_positive_blocks` | Cao | Trực tiếp `100*p_+`, không percentile hoặc fit min/max. |

Mỗi metric có anchors riêng; không dùng anchors ADD cho MDD. Alpha và portfolio **cùng comparison profile dùng cùng anchors**, không tự nới chuẩn cho portfolio lớn, mới hoặc manager cụ thể. Strategy-class diagnostics có thể khác, nhưng không remap score chính về percentile của từng class rồi gọi là cùng thang.

Validation policy bắt buộc: anchors finite, U>L, downside anchors không âm; frequency/horizon/currency/cost/block definitions đủ; stress delta không âm; trọng số đúng bản này. Thiếu calibration của window → `policy_pending`, không lấy anchors của horizon khác.

### 5.2 Performance — hiệu quả kinh tế và hiệu quả theo volatility

Với net returns `r_t` đã điều chỉnh external flows và cash-reference returns `r_c,t` trên cùng observation grid:

\[
TWR_{net}=\prod_{t=1}^{n}(1+r_t)-1,\qquad
TWR_{cash}=\prod_{t=1}^{n}(1+r_{c,t})-1,
\]

\[
\boxed{TWR_{excess}=TWR_{net}-TWR_{cash}.}
\]

Đây là **chênh lệch hai cumulative TWR**. Không dùng `product(1+r_t-r_c,t)-1` thay cho nó. Cash reference phải có nguồn/policy và currency phù hợp; không tự coi USD và USDT là cùng currency hoặc risk-free rate bằng 0 ngoài policy/fixture xác định.

\[
e_t=r_t-r_{c,t},\quad
\overline e=\frac1n\sum_t e_t,\quad
s_e=\sqrt{\frac{\sum_t(e_t-\overline e)^2}{n-1}},\quad
SR_{period}=\frac{\overline e}{s_e}.
\]

\[
\boxed{P=0.70N_T^+(TWR_{excess})+0.30N_{SR}^+(SR_{period}).}
\]

Quy tắc:

- Tối thiểu `n>=2`, excess returns finite và `s_e>0` để Sharpe có nghĩa toán học. Tất cả excess returns bằng nhau → Sharpe undefined, không `infinity→100`, không thay bằng 0. Các metric còn tính được có thể hiện; full QBTS ở trạng thái `partial_components`.
- Không annualize score inputs. Diagnostic annualized nếu có phải đặt tên/method riêng và không thay input đã khóa. Benchmark khác cash/risk-free không được gọi ratio của nó là Sharpe trong formula này.
- Net TWR gồm realized/unrealized PnL và mọi applicable costs theo economic ledger. Deposit, withdrawal hoặc transfer vào sleeve không được làm Performance tăng giả.
- Một alpha thắng vài trade nhưng capital hiệu dụng thấp hoặc tiền idle nhiều phải được nhìn từ đúng assigned sleeve NAV. Không tự bỏ cash trong sleeve để return trông tốt hơn.
- Không cam kết score bất biến khi thay sizing/leverage: đây là chất lượng **deployment đang chạy**. Nhưng thêm allocation cho một alpha khác không được làm raw q_i thay đổi chỉ vì manager denominator thay đổi.

### 5.3 Risk — mức drawdown cực đại và drawdown trung bình

Từ unitized NAV `E_0=1`, `E_t=E_(t-1)*(1+r_t)`:

\[
H_t=\max_{0\le u\le t}E_u,\qquad
DD_t=1-\frac{E_t}{H_t},
\]

\[
MDD=\max_{1\le t\le n}DD_t,\qquad
\boxed{ADD=\frac1n\sum_{t=1}^{n}DD_t.}
\]

\[
\boxed{R=0.60N^-_{MDD}(MDD)+0.40N^-_{ADD}(ADD).}
\]

- Tính trên grid đã khóa, **gồm những observations DD=0**; `E_0` là peak baseline, không thêm một observation 0 vào mẫu ADD. Không chỉ lấy những thời điểm underwater; không trung bình độ sâu theo episodes.
- Khi đổi frequency/calendar phải đổi comparable basis. Grid irregular/gaps chưa reconcile không được âm thầm tính ADD kiểu arithmetic trên một tập đã lọc; cần resampling/valuation hợp lệ từ layer nguồn.
- Peak cho score window bắt đầu từ `E_0` của window để so sánh cùng horizon. Drawdown since-inception và operational high-water mark hiển thị riêng; rolling-window score không được xóa cảnh báo rủi ro tích lũy.
- MDD/ADD lớn hơn upper anchor nhận điểm downside bằng 0 nhưng giữ raw loss và breaches. Không lấy limit riêng do alpha khai báo làm anchor.
- Không giả rằng sampling ngày bắt được intraday liquidation/exposure breaches. Exposure, margin, stress và risk-limit facts từ execution/risk authority vẫn hiển thị riêng, không bị R hoặc QBTS cao che đi.

### 5.4 Robustness — consistency và cost sensitivity

\[
\boxed{B=0.50(100p_+)+0.50N_T^+(TWR_{stress,excess}).}
\]

**a. Consistency theo block**

`block_manifest` xác định trước origin/calendar, horizon, biên block và expected observations. Dùng K block đã hoàn tất, cùng horizon, không chồng lấn, nằm trong score window:

\[
I_k=\mathbf1\{TWR_{net,k}-TWR_{cash,k}>0\},\qquad
p_+=\frac1K\sum_{k=1}^{K}I_k.
\]

- Tie nhận 0; block không có trade nhưng có NAV/cash-reference đầy đủ vẫn nằm trong K.
- Incomplete tail block chưa tới thời điểm kết thúc được loại **theo manifest từ trước**, không phải missing block. Công bố tail duration. Completed block thiếu observations không được loại để giảm K: component consistency unavailable/partial.
- K>=1 là mức có thể tính toán; ngưỡng maturity cao hơn do policy xác định. Một block thắng có `p_+=1` nhưng evidence vẫn có thể limited. K=0 không chia 0 hoặc renormalize B theo stress.
- Positive-block ratio chỉ đo sign consistency. Không mô tả toàn bộ payoff asymmetry và không là xác suất có lãi tương lai.

**b. Một kịch bản additional-cost stress cố định**

V1.1 dùng **một kịch bản tăng thêm chi phí trên gross executed notional**, giữ nguyên path giao dịch đã quan sát. Không chọn scenario theo outcome đẹp; không chạy một optimizer stress trong dashboard.

Với cash-flow-free subperiod j:

\[
\Delta C_j=\frac{\delta_{bps}}{10^4}\,G_j,\qquad
\delta r_j=\frac{\Delta C_j}{V^+_{start,j}},\qquad
r^{stress}_j=r^{net}_j-\delta r_j.
\]

`G_j` là gross executed notional đã đổi sang base currency bằng instrument master/FX đúng thời điểm. Mỗi fill side được ghi một lần; round trip có entry và exit, không tự chia đôi. Derivatives/inverse contracts phải lấy notional từ adapter kinh tế đúng instrument, không tự coi mọi contract là `qty*price`.

Nối stress subperiods để được observations cùng score grid và:

\[
TWR_{stress,net}=\prod_j(1+r^{stress}_j)-1,\qquad
\boxed{TWR_{stress,excess}=TWR_{stress,net}-TWR_{cash}.}
\]

Quy tắc bắt buộc:

1. `delta_bps>=0` khóa chung theo comparison profile; production dùng scenario bất lợi có ý nghĩa đã qua calibration. Zero chỉ là identity fixture/diagnostic, không đủ làm bài stress phân biệt chất lượng.
2. Net path đã phản ánh actual fees, slippage trong fill prices, funding/borrow/carry áp dụng. `Delta C` chỉ là **incremental burden**, không trừ lại fees hoặc estimated slippage lần thứ hai. Rebate trong net baseline được giữ; additional stress vẫn không âm.
3. Đây là **fixed-path, normalized-return sensitivity**, dùng baseline opening capital ở từng subperiod. Không tuyên bố đã mô phỏng lại đổi order size, cash depletion, fills, market impact, liquidation hoặc feedback vào strategy. Không tạo financial execution kernel mới để làm score.
4. Portfolio dùng gross external executions của chính economic scope đã dedupe. Một exchange fill được split attribution nhiều sleeve không được tính lặp tại manager; internal capital transfer không phải turnover fill.
5. Cost/event grid chi tiết được tính trước rồi compound về observation grid. Không gộp tùy tiện turnover cả tháng chia một capital cuối tháng khi trong tháng có transfers/size changes.
6. Nếu turnover đã xác minh bằng 0 thì incremental cost=0; thiếu fill/turnover evidence là unavailable, không giả là không giao dịch. Nếu một `1+r_stress<=0` hoặc baseline capital không hợp lệ, trả `INVALID_STRESS_PATH`/breach; không compound một chuỗi NAV đổi dấu thành return đẹp.
7. Vì cùng anchors và stress chỉ thêm cost không âm trên positive wealth path, `TWR_stress_excess<=TWR_excess` và normalized stress score không lớn hơn normalized net excess TWR. Đây là invariant phải test.

Robustness B là operational proxy đã chọn, **không phải toàn bộ statistical robustness**. Time-block best-profit dependence, adverse tail và parameter sensitivity có thể drill-down riêng; chưa có penalty cho lợi nhuận tập trung của trend alpha, không thêm metric đó vào B ngoài specification này.

### 5.5 Kết quả cuối và decomposition

\[
\boxed{QBTS=0.45P+0.30R+0.25B.}
\]

Viết theo sáu thành phần nguyên tử:

\[
\begin{aligned}
QBTS={}&0.315N_T(TWR_{excess})+0.135N_{SR}(SR)\\
&+0.180N^-_{MDD}(MDD)+0.120N^-_{ADD}(ADD)\\
&+0.125(100p_+)+0.125N_T(TWR_{stress,excess}).
\end{aligned}
\]

Tổng weights = 1. Khi đủ inputs, QBTS luôn trong `[0,100]`. Lưu raw inputs, normalized points, contribution points và total trước UI rounding. Một component tăng đơn lẻ, các component khác không đổi, không được làm QBTS giảm.

Composite này **có bù trừ**; v1.1 không âm thầm thêm hard cap, geometric mean, confidence multiplier, HHI discount, regime multiplier hoặc điều kiện component minimum để vào band. Calibration phải chỉ rõ các profile bất lợi do bù trừ. Nếu cần thay formula/band eligibility sau validation, đó là một policy revision phải được duyệt, không phải agent tự sửa trọng số.

### 5.6 Numeric validity, provisional, partial và maturity

Phân biệt ba lớp: (i) inputs đủ/đúng để tính; (ii) evidence đã quan sát dài/đa dạng đến đâu; (iii) policy config đã được phát hành hay chưa.

| Tình trạng | `value` / trạng thái | Manager dùng ra sao? |
|---|---|---|
| Policy config được phát hành, đủ metric, sample qua maturity | Numeric / `available` | So sánh/aggregate trên cùng basis; không suy statistical validation hoặc quyền Live. |
| Cùng điều kiện math/data, sample chưa qua maturity | Numeric / `provisional` | Hiện band kèm “Sơ bộ”; aggregate được nếu cùng window/basis; công bố provisional weight. |
| Một atomic metric chưa tính được, những metric khác hợp lệ | Null / `partial_components` | Hiện components và bounds hợp lệ; không tự đổi weights. |
| Phí bắt buộc thiếu, dữ liệu gap/invalid, stale hoặc binding liên quan sai | Null / status+reason tương ứng | Không dùng như fresh complete score; giữ last-known snapshot có timestamp riêng. |
| Công thức chọn rồi nhưng runtime calibration/config chưa được phê duyệt đầy đủ | Null / `policy_pending` | Shadow/fixture preview riêng, không gắn nhãn production available. |

`evidence_status` gồm `limited`, `sufficient_for_display`, `insufficient`, `unknown`; không phải một probability. Maturity policy dùng `sample_count`, elapsed duration, complete blocks, coverage và diagnostics thích hợp. Math minimum là n>=2, std>0, K>=1 và inputs hữu hạn; **không mặc định yêu cầu 200 trades hoặc vài năm forward data** để có score vận hành.

Với set known atomic scores J và weights beta của mục 5.5, nếu các atomic points đã biết thực sự hợp lệ trên cùng basis:

\[
Q_{lo}=\sum_{j\in J}\beta_j s_j,\qquad
Q_{hi}=Q_{lo}+100\sum_{j\notin J}\beta_j.
\]

Đây là bounds toán học của partial composite, không phải confidence interval. Missing fees ảnh hưởng dependency của TWR/SR/DD/blocks: không giữ chúng làm “known” nếu raw inputs đã sai net basis. Full value vẫn null; không lấy midpoint của bounds làm score.

### 5.7 Anchors và hiệu chỉnh: một mapping, không nhiều phương án

Anchors không lấy từ min/max của current table, không cập nhật chỉ vì một alpha mới xuất hiện. Cùng window/basis phải dùng một calibration snapshot bất biến cho alpha và portfolio.

Calibration phải báo: profile net return gần cash, lỗ nhỏ/lớn, low turnover, sparse trading, payoff bất cân xứng, sizing scale-down, high turnover, drawdown kéo dài, phí đến trễ và stress saturation. Kiểm tra score distribution, band occupancy, rank changes, clipped-component ratios và mức score nhảy khi thêm một block.

- Policy không được thưởng alpha gần như không tạo hiệu quả lên band cao chỉ vì MDD/ADD nhỏ. Một exact flat series có undefined Sharpe và full score null, không tự nhận score Risk-only.
- Short-duration anchors không được tạo điểm cực đoan chỉ vì annualize vài giờ/ngày. Nhiều observations trong một episode không thay thế elapsed evidence.
- TWR và stress TWR cùng anchors giúp giữ cost monotonicity. Net TWR, MDD và stress effect vẫn hiển thị, kể cả khi normalized score đã clip và không còn phân biệt độ lớn raw metric.
- Nếu thực nghiệm cho thấy anchors hợp lệ không đạt mục tiêu quản trị, báo mâu thuẫn và profile cụ thể. Không tuyên bố thang điểm đã calibrated hoặc tự đổi formula đã duyệt.

### 5.8 Band 0–100 và quy tắc UI

`band_policy_version=quality_bands_v1_1`:

| Khoảng điểm không làm tròn | Code | Nhãn | Cách đọc |
|---|---|---|---|
| `[0,40)` | `weak` | Yếu | Chất lượng tổng hợp yếu theo policy/window. |
| `[40,60)` | `neutral` | Trung tính | Hiệu quả tổng hợp trung tính hoặc chưa đạt kỳ vọng. |
| `[60,75)` | `fair` | Khá | Chất lượng tổng hợp khá trong phạm vi quan sát. |
| `[75,90)` | `good` | Tốt | Chất lượng tổng hợp tốt trong phạm vi quan sát. |
| `[90,100]` | `very_good` | Rất tốt | Chất lượng tổng hợp rất tốt theo policy, không phải không có rủi ro. |

- Band tra bằng canonical unrounded value. Ví dụ 74.999 thuộc `fair` dù UI cần đủ decimals/tooltip để không trình bày “75.0 — Khá” gây hiểu nhầm; không ghi ngược rounded value vào API.
- Raw alpha và portfolio economic scores dùng cùng band khi cùng profile. Allocation-weighted AlphaScore cũng có thể gắn band này nhưng subtitle bắt buộc là **“Chất lượng trên vốn đã phân bổ”**, không gọi là kết quả danh mục.
- **Không gắn band chất lượng lên c_i**, PnL contribution, HHI hoặc score bounds. `null` nằm ngoài band, không là 0. Khi bounds hoàn toàn trong một band có thể chú thích “Khoảng quan sát nằm trong band …”, không đổi thành full score.
- Provisional numeric score vẫn nhận band toán học, thêm badge evidence và duration. Không gộp “Tốt — Sơ bộ” thành “đã được kiểm chứng tốt”.
- 80 điểm không là percentile 80, probability 80%, mức phân bổ vốn hoặc lệnh bật Live. 100 là đầu trên mapping của policy; risk breach hiển thị độc lập ngay cả khi band cao.

### 5.9 Ví dụ số đầy đủ

**Fixture minh họa phép tính, không phải anchors/mức stress production.** Giả sử cùng một window/profile có inputs đã tính hợp lệ:

| Input | Raw value | Anchors | Normalized points |
|---|---:|---|---:|
| Net excess TWR | 6% | L=-2%, U=8% | 80 |
| SR theo observation frequency | 0.12 | L=0, U=0.15 | 80 |
| MDD | 4% | L=0, U=10% | 60 |
| ADD | 1% | L=0, U=4% | 75 |
| Positive blocks | 6/8 | `100*p_+` | 75 |
| Stress excess TWR | 4.5% | **Cùng** L=-2%, U=8% | 65 |

`P=0.70*80+0.30*80=80`; `R=0.60*60+0.40*75=66`; `B=0.50*75+0.50*65=70`.

\[
\boxed{QBTS=0.45(80)+0.30(66)+0.25(70)=73.30\quad\text{— Khá}.}
\]

Nếu sample của fixture chưa qua maturity nhưng tất cả metrics/window hợp lệ: `value="73.3"`, `status=provisional`; **không đổi điểm chỉ vì maturity**. Nếu chưa tính được Sharpe nhưng năm atomic inputs còn lại thật sự hợp lệ: full value null, bounds `[62.50,76.00]`. Khi chỉ K=2 block hợp lệ, vẫn có thể tính p_+ và provisional QBTS của window đó; không lấy 6/8 của fixture để giả thêm evidence.

### 5.10 Compatibility với source/score cũ

Bản gốc ghi nhận audit trong phạm vi PortalBE commit `fdea081` và PortalFE commit `051eeb89` chưa tìm thấy công thức QBTS. Đây là ghi nhận có phạm vi của bản gốc, **không phải kết quả audit codebase hiện tại trong lần chỉnh tài liệu này**.

Engineering xác minh actual contracts trước khi implement. Nếu có legacy score, giữ `legacy_policy_version`, historical values và label riêng; migration theo mục 12. Không clip signed legacy score thành 0–100, không trộn với v1.1, không cung cấp extension signed như một lựa chọn tính mới. Output v1.1 ngoài `[0,100]` là range error.

## 6. AlphaScore raw, attribution và allocation-weighted manager view

### 6.1 Raw score không đổi nghĩa khi sang manager view

`q_i=F_pi(X_i)` là cùng raw score ở alpha detail và manager table khi cùng subject/window/basis. Không có một bản raw score khác chỉ vì viewer là manager. Permissions có thể giới hạn dữ liệu được thấy, không được thay công thức.

Một `alpha_id` chạy ở nhiều deployments phải chỉ rõ row đang đại diện cho deployment, economic sleeve hay consolidated alpha scope. Nếu consolidate nhiều deployments, dựng return/NAV path của đúng scope từ accounting đã dedupe rồi tính F_pi; **không lấy mean các deployment scores làm raw score**. Mixed-domain deployments giữ facets/observational series theo mục 4.5.

Attribution owner của nghiên cứu và người deploy là hai identity khác nhau; raw score của một deployment không tự biến thành KPI năng lực riêng của người deploy. Manager access và researcher slice theo policy quyền của hệ thống, không suy quyền từ việc biết alpha_id.

### 6.2 Allocated economic capital và công thức

`weight_basis=allocated_economic_capital`: vốn kinh tế allocator/accounting xác nhận đã phân bổ cho alpha, không âm và không overlap. Không lấy risk budget, desired budget, target allocation, margin limit, signed exposure hoặc gross leveraged notional thay thế.

Với toàn bộ alpha có `a_i>0` trong scope:

\[
A_{alloc}=\sum_i a_i,\quad w_i=\frac{a_i}{A_{alloc}},\quad
\boxed{c_i=w_iq_i,\qquad AlphaScore=\sum_i c_i.}
\]

- Mẫu số bao gồm **mọi allocation thuộc scope**, kể cả alpha thiếu/khác basis/stale score. UI filter, disabled/archived hoặc việc researcher không thấy row không làm biến mất capital khỏi manager accounting.
- Snapshot gồm `effective_at_ms`, currency, allocation source, ownership partition và revision. Historical chart dùng snapshot hiệu lực tại từng thời điểm, không dùng weights hôm nay backfill lịch sử.
- Các sleeves dùng chung collateral cần attribution partition. Chỉ khi có chứng cứ overlap ownership/attribution mới kết luận `ALLOCATION_RECONCILIATION_FAILED`; `sum assigned capital > current NAV` sau lỗ không tự là double-count.
- Raw score đo hiệu quả deployment như đang chạy. Nếu manager cấp thêm vốn khiến sizing thực tế thay đổi, raw q có thể thay đổi do path mới. Nếu chỉ đổi weight trong một calculation snapshot, raw q không tự thay đổi.

### 6.3 Coverage, cash và evidence weight

Valid raw score cho allocation aggregate là numeric `available` hoặc `provisional`, dùng approved runtime config, fresh, bound và cùng comparable basis/window. Provisional khác với missing.

\[
coverage_{score}=\frac{\sum_{i\in valid}a_i}{A_{alloc}},\qquad
weight_{provisional}=\frac{\sum_{i\in valid,\ status_i=provisional}a_i}{A_{alloc}}.
\]

Các fields đi kèm:

| Field | Quy tắc |
|---|---|
| `score_coverage_allocated` | Tỷ lệ allocation có raw score hợp lệ; không là NAV coverage. |
| `unscored_allocated_weight` | `1-score_coverage_allocated`; gồm missing/stale/incomparable, có reason breakdown. |
| `provisional_allocated_weight` | Tỷ lệ **all allocated capital** dựa trên provisional raw scores; luôn công bố khi có. |
| `mature_allocated_weight` | Tỷ lệ allocation có score available/sufficient-for-display. Không gọi là statistically proven weight. |
| `allocation_coverage_nav` | `A_alloc/K_nav` **chỉ khi** a_i là current-NAV partition không overlap, cùng valuation time/accounting basis. |
| `scored_nav_weight` | `sum_valid(a_i)/K_nav`, cùng điều kiện partition trên. |
| `idle_cash_weight` | `C_idle/K_nav` từ accounting verified; reserves/other buckets riêng. |
| `allocation_snapshot_id`, `as_of_ms` | Snapshot đã dùng; lịch sử có revision. |

Assigned capital 100 và NAV hiện tại 90 sau lỗ có thể hoàn toàn hợp lệ. Nếu assigned-capital ledger không là current-NAV partition, NAV coverage=null với `not_applicable/BASIS_MISMATCH`, không normalize để ép về `[0,1]` hoặc báo overlap giả.

Cash chưa phân bổ không có alpha QBTS và không bị gán q=0 trong AlphaScore. Headline ghi **“Chất lượng trên vốn đã phân bổ”** và cash/coverage thích hợp. Cash vẫn thuộc portfolio NAV và ảnh hưởng PortfolioScore qua kết quả danh mục; đây là hai ngữ nghĩa khác nhau, không cần thêm một headline “all-capital alpha score”.

### 6.4 Aggregate provisional và missing: không hidden renormalization

- Full compatible allocation coverage và mọi q available → AlphaScore `available`.
- Full compatible allocation coverage, có ít nhất một q provisional → AlphaScore `provisional`, value vẫn `sum(w*q)`; không discount q hoặc weights theo confidence.
- Thiếu bất kỳ q hợp lệ nào trên positive allocation → full AlphaScore null, `partial_coverage`; nếu toàn bộ nguồn khác basis thì `incomparable_basis`. Giữ missing reasons và bounds nếu còn lập được chung thang.
- `A_alloc=0` → AlphaScore null, `no_allocation`; không 0/0, không gán 0. Điều này **không** buộc PortfolioScore của cash-containing book thành no_allocation.
- Score range sai hoặc capital attribution invalid là data error, không silently treat missing=0.

Với full range `[0,100]` của q:

\[
A_{lo}=\sum_{i\in valid}w_iq_i,\qquad
A_{hi}=A_{lo}+100\sum_{i\notin valid}w_i.
\]

Đây là **bounds của allocation-weighted AlphaScore**, không phải PortfolioScore bounds và không phải confidence interval. `scored_subset_average=sum_valid(a_i*q_i)/sum_valid(a_i)` chỉ xuất hiện ở detail, có mẫu số và label, không làm headline hoặc đổi thành A.

**Điểm độc lập quan trọng:** portfolio NAV/cost/benchmark/stress path đủ thì PortfolioScore vẫn tính được dù AlphaScore đang partial do thiếu một q_i, thiếu research linkage của alpha hoặc lineage grouping chưa xong. Ngược lại, có đủ q_i không cho phép bịa PortfolioScore khi portfolio NAV thiếu.

### 6.5 Ví dụ manager attribution

| Alpha | Raw QBTS | Allocation weight | Contribution |
|---|---:|---:|---:|
| A | 88 | 20% | 17.60 điểm |
| B | 60 | 80% | 48.00 điểm |
| **AlphaScore theo allocation** | — | **100%** | **65.60 — Khá trên vốn đã phân bổ** |

A có raw quality cao hơn, B đang chi phối phần lớn quality của allocation. 48 điểm contribution không có nghĩa B tốt hơn A. Chuyển 10 điểm phần trăm weight từ B sang A, giữ q cố định, làm A tăng `0.10*(88-60)=2.8` điểm; **không phải** tăng 2.8% return hay bằng chứng quyết định tái phân bổ sẽ có lợi nhuận.

Fixture coverage giữ từ bản gốc: NAV=100, cash=20, allocation 60/20, q=90/missing. Khi partition verified: allocation NAV coverage=80%, score allocation coverage=75%, scored NAV=60%. AlphaScore null; bounds `[67.5,92.5]`, không dùng subset average 90 làm headline. Khi q thứ hai có 50, A=80. Nếu q=50 là provisional, A vẫn 80 nhưng aggregate provisional với provisional allocation weight=25%.

### 6.6 Attribution thay đổi điểm theo thời gian

Với cùng members, basis/policy và q quan sát đầy đủ ở hai snapshot, giải thích composition-score delta bằng decomposition chính xác:

\[
\Delta A=
\sum_i(w_{i,1}-w_{i,0})\frac{q_{i,1}+q_{i,0}}2
+\sum_i(q_{i,1}-q_{i,0})\frac{w_{i,1}+w_{i,0}}2.
\]

Hai phần lần lượt là **allocation effect** và **raw-score effect** theo symmetric decomposition. Chúng không phải causal investment attribution hoặc PnL attribution. New/missing member không có q ở một endpoint → báo membership/coverage change, không gán q=0 để ép phép phân rã. Đổi policy/window/revision phải hiện reason riêng, không gộp vào “alpha cải thiện”.

## 7. PortfolioScore trực tiếp và manager side

### 7.1 Dùng chính F_pi trên NAV của danh mục

\[
\boxed{PortfolioScore_p=F_{\pi}(X_p),\qquad
ManagerPortfolioScore=F_{\pi}(X_M).}
\]

`X_p/X_M` gồm flow-adjusted net returns, cash reference, unitized NAV, block returns và fixed-path additional costs của đúng portfolio/book. P/R/B/anchors/band dùng cùng version như alpha trong comparison profile.

Quy trình:

1. Lấy opening/closing valuations, cash, positions, realized/unrealized PnL, funding/fees và external-flow ledger đã reconcile từ accounting authority.
2. Dedupe economic ownership theo book/account/sleeve mapping; dựng consolidated cash-flow-adjusted return path.
3. Lấy additional-cost stress trên economic execution events của scope, không cộng duplicate fills hoặc virtual turnover vào actual book.
4. Tính TWR excess, SR, MDD, ADD, p_+, stress excess TWR trên path đó.
5. Dùng đúng F_pi → PortfolioScore, band, components, evidence và provenance.

Consolidated PnL/NAV vẫn giữ original source/currency và FX basis. USD/USDT hoặc các currency khác không được coi 1:1 theo tên gọi; base-currency policy và FX nguồn được lưu trong manifest.

### 7.2 Không thay return path bằng trung bình score

Nói chung:

\[
F_{\pi}(X_p)\ne\sum_iw_iF_{\pi}(X_i).
\]

Sharpe, drawdown, block outcome và clipping cần chính return path. Vì vậy không suy PortfolioScore từ AlphaScore, từ số lượng alpha hoặc từ một concentration discount.

Nếu reconstruct returns từ sleeves, weights là **contemporaneous beginning-of-subperiod NAV weights**, đủ cash/reserves và không overlap; không phải end-window allocated-capital weights của AlphaScore. Phải reconcile với consolidated ledger. Nếu có canonical portfolio NAV, ưu tiên path đó, không tạo financial truth thứ hai.

Không có trần điểm phụ thuộc số lineage như penalty cũ. Một portfolio chỉ có một alpha, không cash/cost/flow khác biệt, cùng exact path và basis → **PortfolioScore bằng raw QBTS**. Hai portfolio với cùng exact economic path/basis có cùng score dù registry chia alpha thành số rows khác nhau.

Cash-only/không activity không được tự gán điểm 0 hoặc 100. Tính theo cùng F_pi; nếu excess volatility bằng 0 thì Sharpe undefined và full score partial, đồng thời hiển thị cash-only/raw outcomes rõ ràng. Không thêm ngoại lệ risk-only score.

### 7.3 Manager consolidated economic view

Manager quản lý nhiều portfolio thì hợp nhất **economic valuations/flows** trước, không average PortfolioScores. Transfer từ portfolio A sang B là external đối với từng portfolio nhưng internal với manager book; deposit từ ngoài book mới là manager external flow.

Actual và virtual books không cộng chung nominal capital. Canary/Live chỉ được vào actual book khi environment/ownership chứng minh actual; Paper/Sandbox có virtual book riêng. Shared physical account được tính một lần ở manager NAV; alpha/portfolio sleeves phải có partition ledger trước khi phân rã.

Manager PortfolioScore có sample/maturity từ **manager return path**, không tự lấy maturity thấp nhất của mọi alpha. Missing alpha research score/grouping không chặn economic score; missing consolidated required costs, valuation hoặc FX thì có thể chặn vì trực tiếp ảnh hưởng X_M.

### 7.4 HHI, dispersion, correlation và risk contribution: diagnostics riêng

Nhóm theo `concentration_group_id`/lineage registry có version; không cho alpha tự tuyên bố independent group.

\[
W_g=\sum_{i\in g}w_i,\qquad H_{alloc}=\sum_gW_g^2.
\]

Với q thuộc `[0,100]`:

\[
c_g=\sum_{i\in g}w_iq_i,\quad C=\sum_gc_g=AlphaScore,\quad
p_g=\frac{c_g}{C},\quad H_{score}=\sum_gp_g^2\quad(C>0).
\]

`N_effective_score_groups=1/H_score`. C=0 → H_score null, `NO_POSITIVE_SCORE_CREDIT`; không suy không có rủi ro. Positive score credit không là positive PnL/edge; raw q có thể dương khi return âm. H_score phụ thuộc scale/zero của QBTS, chỉ so diagnostics trong cùng policy.

\[
score\_dispersion=\sqrt{\sum_iw_i(q_i-AlphaScore)^2}.
\]

Allocation HHI có thể tính khi allocation/grouping đầy đủ dù thiếu q. Score HHI cần raw-score coverage và grouping đầy đủ; dispersion chỉ cần raw-score coverage, không cần grouping. Không âm thầm renormalize valid subset rồi gắn nhãn full scope.

Khi có aligned returns/covariance và risk-weight basis hợp lệ:

\[
\sigma_p^2=v^\top\Sigma v,\qquad VC_i=v_i(\Sigma v)_i,
\qquad \sum_i VC_i=\sigma_p^2.
\]

Dùng ký hiệu v cho **risk-model weights** để tránh nhầm w của allocated capital. Fixed-v covariance là snapshot risk-model diagnostic, không thay realized portfolio path có changing weights. Relative contribution chỉ khi variance dương đủ ổn định theo policy; hedges có thể tạo signed contribution âm. Không đẩy contributions âm vào HHI vốn/score hoặc thay missing correlation bằng 0.

**Không diagnostics nào trong mục này được trừ/nhân vào PortfolioScore v1.1.** Grouping incomplete → HHI unavailable; PortfolioScore/AlphaScore vẫn do điều kiện độc lập của từng metric quyết định.

### 7.5 Clone/split và ví dụ phân biệt hai view

- Một alpha q=80, allocation=100 trong một lineage: AlphaScore=80, H_alloc=H_score=1. PortfolioScore chỉ bằng 80 nếu portfolio path/basis bằng chính alpha path; không tự giảm xuống 60.
- Tách 10 clones cùng lineage, mỗi clone 10% capital, cùng economic ownership tổng: HHI không đổi. Reconstructed portfolio economic path không được double-count; vì path không đổi nên PortfolioScore không đổi.
- q=80/20, weights=50/50: AlphaScore=50, dispersion=30, H_alloc=0.5, H_score=0.68. Không thể suy PortfolioScore từ các số này; cần portfolio returns.
- q=50/50, weights=50/50: AlphaScore=50, dispersion=0, H_score=0.5. Đây là composition khác, không tự chứng minh economic result tốt hơn.

Missing/ambiguous grouping báo riêng. Near-clone có code khác nhưng shared exposure vẫn cần correlation/position diagnostics; không coi lineage khác tên là các nguồn rủi ro độc lập.

**Fixture direct portfolio so với composition:** bốn observations, cash-reference=0, hai sleeves có beginning-of-subperiod NAV weights 50/50 ở mỗi observation, turnover/opening NAV=1 cho từng observation và incremental stress=5 bps. Dùng anchors minh họa mục 5.9 **chỉ để nghiệm toán trên fixture này**, không suy rằng bốn observations đủ calibration hoặc đủ maturity. Returns đã net mọi baseline costs theo giả định fixture; không có cash/cost bucket khác.

| Chuỗi | Bốn net returns | Net TWR | MDD | ADD | QBTS trực tiếp |
|---|---|---:|---:|---:|---:|
| Alpha A | +2%; -1.5%; +3%; -1% | 2.449259% | 1.5% | 0.625% | 70.747305 |
| Alpha B | -1%; +2.5%; -0.5%; +2% | 2.9869775% | 1.0% | 0.375% | 74.762282 |
| Portfolio | +0.5%; +0.5%; +1.25%; +0.5% | 2.7763564% | 0% | 0% | 76.760969 |

Allocation-weighted AlphaScore của fixture = `(70.747304834+74.762282199)/2 = 72.754793516`, trong khi PortfolioScore trực tiếp = **76.760969082**. Portfolio có path/downside khác từng sleeve nên hai score không trùng nhau. Cả ba raw/direct scores là **provisional** trong fixture; không suy diversification sẽ luôn cải thiện kết quả ngoài mẫu. Tổng hợp actual implementation vẫn phải lấy reconciled economic path thay vì giả định weights50/50 như fixture.

### 7.6 Bố trí view và drill-down

| View | Headline | Thông tin bắt buộc / hành động xem |
|---|---|---|
| **Alpha detail** | Raw QBTS + band + evidence badge | P/R/B, six atomic contributions, net TWR, PnL, MDD/ADD, costs/stress, window, stage timeline, deployment/version/binding. |
| **Manager alpha table** | Raw q của mỗi alpha | Allocation capital/weight, c_i, PnL/risk contribution riêng, provisional/stale reasons; sort raw và sort contribution là hai thao tác khác nhau. |
| **Portfolio detail** | Direct PortfolioScore | Actual/virtual label, P/R/B, NAV/returns, cash, exposure, allocation-weighted AlphaScore và coverage, constituent drill-down. |
| **Manager overview** | Direct consolidated PortfolioScore | Book scope/currency, NAV/PnL/risk/cash, composition AlphaScore, score contribution, source/stage breakdown, original/restated revisions. |
| **Compare alpha/portfolio** | Cùng formula/profile/window | Cùng normalization và cost-stress method; evidence duration không bị che; early/incomparable rows có nhóm/label riêng. |

Scope selector và table filter không được thay denominator của headline mà không đổi `scope_id`, label và snapshot. Sau drill-down/back, giữ comparison window, basis, selected subject và revision mode. Manager có thể xem decomposition để hiểu “raw quality tốt nhưng vốn chưa đặt ở đó” hoặc “composition khá nhưng portfolio path đang chịu downside”; không xem score là nút auto-deploy/rebalance.

## 8. Contract, policy artifacts và vị trí thực thi

### 8.1 Wire và precision

Public DTO dùng **decimal strings** cho scores, components, normalized/raw numeric metrics, returns, capital, weights, HHI, distances và kernel/effective sample size. Không dùng JavaScript Number cộng tiền/vốn. Timestamps là UTC epoch milliseconds safe integers với suffix `_ms`/`_at_ms`; counts là validated nonnegative safe integers; revisions/version counters/opaque IDs serialize strings.

Null giữ nguyên, không đổi thành `"0"`, `"NaN"` hoặc `"Infinity"`. Core có thể dùng numerics thống kê theo policy/tolerance kiểm thử, nhưng economic capital/flows phải giữ precision của accounting authority. Canonical quantization/rounding được đóng trong policy; band dựa trên canonical value trước **UI rounding**, không trên rounded display text.

### 8.2 Policy artifact bắt buộc

```yaml
formula_id: qbts_prb_v1_1
formula_weights:
  performance: "0.45"
  risk: "0.30"
  robustness: "0.25"
component_weights:
  performance: {net_excess_twr: "0.70", sharpe_period: "0.30"}
  risk: {mdd: "0.60", add: "0.40"}
  robustness: {positive_block_ratio: "0.50", stress_excess_twr: "0.50"}
normalization_method: frozen_linear_clip_0_100
stress_uses_same_twr_anchors: true
stress_method: fixed_path_incremental_gross_notional_bps
weight_basis: allocated_economic_capital
band_policy_id: quality_bands_v1_1
portfolio_method: direct_consolidated_nav_prb
```

Artifact trên chỉ ghi **phần đã chọn**. Production artifact còn phải chứa: policy/calibration IDs/hash, approval record, profile/window/duration mapping, observation grid/calendar/timezone, cash/FX/cost methods, L/U cho bốn metric families, block manifest rule, delta_bps, math/maturity/freshness thresholds, precision, economic ownership version và continuity/source-selection rules khi áp dụng. Không điền placeholder string vào field numeric rồi vẫn pass policy validation.

`formula_approved` và `runtime_config_approved` là hai thông tin khác nhau: cuộc thảo luận đã chốt cách tính; calibration/source audit/release gate không được xem như chưa chọn A/B/C. Approval tài liệu không tự cấp deployment/exchange permissions.

### 8.3 Metric dictionary

Các score objects dùng shared envelope; `subject_type` phân biệt alpha/deployment/sleeve/portfolio/manager_book, không dùng field name để đoán economic scope.

| Field | Type / nghĩa | Quy tắc |
|---|---|---|
| `*.value` | decimal string/null, points | [0,100] cho raw/composition/portfolio quality; contribution theo q*w. |
| `*.status` | enum | Theo dependency graph và ưu tiên trạng thái dưới đây. |
| `*.reason_codes` | string[] | Giữ tất cả nguyên nhân, không che invalid/stale bằng badge xanh. |
| `*.policy_version`, `formula_hash`, `policy_hash` | strings | Formula chung, config cụ thể và lineage của policy. |
| `*.approved_policy_id` | string/null | Runtime policy approval; chưa có thì numeric candidate chỉ ở `preview`. |
| `*.band_code`, `band_policy_version` | strings/null | Null khi full value null; band contribution luôn null. |
| `*.components` | object | P/R/B, raw inputs, normalized points và six atomic contributions. |
| `*.bounds` | lower/upper decimal/null | Bounds của partial metric, không confidence; null nếu không biện hộ được. |
| `*.evidence_status` | enum | limited/sufficient_for_display/insufficient/unknown. |
| `*.sample_count`, `complete_block_count`, `trade_count` | integers/null theo nguồn | Không thay thế nhau. |
| `*.observed_duration_ms`, `actual_duration_ms` | safe integers | Union thời gian có coverage; không cộng overlapping deployment durations. |
| `*.requested_window_start_ms/end_ms` | safe integers | Window manager chọn. |
| `*.window_start_ms/end_ms` | safe integers | Effective computation window. |
| `*.as_of_ms`, `knowledge_cutoff_ms`, `computed_at_ms` | safe integers | Tách thời điểm biết inputs, event window và compute. |
| `*.comparable_basis_id` | string | Shared profile, không chứa unique alpha/run identity. |
| `*.individual_evidence_binding_id` hoặc `subject_binding_id` | string | Exact subject/data/ledger binding tùy score. |
| `*.data_snapshot_id`, `revision`, `supersedes_revision` | strings | Append-only revisions, replay được. |
| `*.stage_breakdown`, `series_kind`, `economic_domain` | structured metadata | Không suy actual từ tên stage. |
| `*.cost_coverage`, `stress_policy_id` | metadata | Baseline costs và incremental scenario có provenance. |
| `alpha_score_contribution.allocation_weight` | decimal [0,1] | w_i trong full allocation scope. |
| `alpha_score_contribution.raw_score_ref` | string | Trỏ đúng q_i snapshot/version, không copy raw mơ hồ. |
| `alpha_score.allocation_snapshot_id` | string | Full denominator và effective-at. |
| `alpha_score.score_coverage_allocated` | decimal [0,1]/null | All positive allocation denominator. |
| `alpha_score.provisional_allocated_weight` | decimal [0,1]/null | Không nhân vào score. |
| `alpha_score.allocation_coverage_nav` | decimal [0,1]/null | Chỉ current-NAV partition proof, nếu không not_applicable/BASIS_MISMATCH. |
| `portfolio_score.return_source_snapshot_id` | string | Consolidated NAV/ledger authority, không raw-score list. |
| `portfolio_score.consolidation_manifest_id` | string | Dedupe accounts, flows, currencies, attribution. |
| `diagnostics.allocation_hhi/score_contribution_hhi/score_dispersion` | decimal/null + status | Không ở input của PortfolioScore. |
| `diagnostics.lineage_group_version` | string/null | Missing ảnh hưởng HHI, không tự chặn economic score. |
| `*.preview` | separately labelled object/null | Policy-pending/experimental basis; không đưa vào production aggregate. |

Không có `portfolio_score.lambda`. `qbts.observed_quality` legacy chỉ là read-compatible preview alias nếu cần; không giữ quy tắc cũ bắt mọi provisional q thành detail-only preview. Endpoint/event/table tên cụ thể phải bám source conventions sau audit; tài liệu không khẳng định chúng đã tồn tại.

### 8.4 Status resolution và dependency independence

Raw QBTS/PortfolioScore numeric states: `available`, `provisional`. Non-numeric: `policy_pending`, `unbound`, `invalid_data`, `stale`, `partial_costs`, `partial_components`, `insufficient_data`. Allocation aggregate thêm `partial_coverage`, `incomparable_basis`, `no_allocation`.

Đánh giá data/policy faults trước, maturity sau. Chọn primary status theo thứ tự: invalid policy/config-pending → required binding/data invalid → stale → missing required costs → missing required metrics/window → numeric available/provisional. Giữ tất cả reason codes, không dựa vào thứ tự này để bỏ một hard fault. Freshness stale có thể kèm last-known numeric snapshot ở một object riêng, không nhập nó vào valid set của aggregate hiện tại.

Dependency independence phải được test:

- PortfolioScore phụ thuộc portfolio NAV/cost/benchmark/stress/basis, **không phụ thuộc** all-alpha q, HHI hay Regime Fit.
- AlphaScore theo allocation phụ thuộc a_i và q_i compatible, không cần correlation/regime/grouping để có value.
- HHI/dispersion có own coverage/grouping status.
- Regime Fit có binding/features/reference status riêng; không làm authorized close/reduce-risk controls bị vô hiệu.

### 8.5 Phân công và authorization

- **tradingEdge/accounting/risk sources:** immutable event-time economic facts, valuations/flows/costs, allocated capital, execution/TradeState/lifecycle, reconciliation và binding IDs. Không chạy calibration/nearest-neighbor trong order loop, không viết lại score để quyết định TradeState.
- **QuantBT/Research-side analytics/shared calculation module:** F_pi và normalization đúng policy, score/coverage snapshots, historical runs/provenance, Regime Fit feature/reference artifacts. Reuse economic measures/ledger từ authority hiện hữu; không dựng một backtest/financial kernel cạnh tranh chỉ để tính score.
- **Canonical compute owner:** một worker/service ngoài execution path, dùng shared module. BFF có thể host worker O(n) cho allocation aggregation nhưng không viết công thức riêng trong controller/browser.
- **Portal BFF/read model:** authorize scope trước khi join/serialize, serve precomputed results/cache và staleness. Không synchronous heavy compute mỗi lần load dashboard. Researcher chỉ nhận authorized alpha/evidence slice; không rò manager totals, denominators, hidden contributions, cash, allocation hoặc error metadata qua API/export/cache.
- **Manager UI:** quality score/band, components, raw economics, evidence, coverage, cost stress, stage và revisions. Operational action permissions tách khỏi score availability/band.

Research attribution owner và operator/deployer tách field. Không dùng `researcher_id=deployer_id` mặc định để gán score/KPI khi chưa có ownership mapping.

### 8.6 Continuous aggregation, cache và revisions

Recompute khi có sealed economic/cost/benchmark observation, complete block mới, allocation snapshot, policy-approved revision hoặc source correction. Intraperiod tiles có thể cập nhật state theo feed; **score chính chỉ dựa trên watermark inputs đầy đủ đã công bố**, không nhảy sampling frequency theo feed load.

Cache keys gồm authorized scope/subject, formula+policy hash, basis/window, source revisions, allocation snapshot cho composition, consolidation snapshot cho portfolio, continuity manifest cho mixed observation và grouping version cho grouping diagnostics. Không cần một grouping update làm formula PortfolioScore đổi khi economic inputs không đổi.

Late fees/FX corrections tạo revision mới, lưu `original_as_published` và `restated`, `supersedes_revision`, reason và affected windows. Replay as-of chỉ dùng facts/policy/bindings có thể biết lúc đó. Strategy/params changes tạo alpha configuration boundary; manager/portfolio economic track record vẫn giữ liên tục các quyết định thực tế của book, không xóa lỗ của constituent cũ khi thay alpha.

## 9. Regime Fit v1: descriptive historical matching

### 9.1 Câu hỏi được trả lời

“Hoàn cảnh thị trường hiện tại giống những cửa sổ lịch sử nào của alpha phiên bản này? Có bao nhiêu bằng chứng liên quan, từ stage nào, và kết quả đã quan sát lúc đó ra sao?”

Không trả lời “xác suất có lãi ngày mai là bao nhiêu?”. Không dùng kết quả return của chính alpha để định nghĩa market regime kiểu winning/losing; như vậy sẽ circular và không thể biết label trước outcome.

### 9.2 Binding và thời gian

Manifest đầu vào bắt buộc có:

- `research_binding_id`, bound `run_id`, `strategy_version`, `params_hash`, universe/venue/data snapshot và research split manifest.
- `binding_effective_at`, `binding_created_at`, `run_completed_at`, `artifact_available_at`, evidence `available_at` và `as_of`.
- Các deployment window Paper/Sandbox/Canary/Live đúng version/params/binding, với stage nguyên gốc.

Binding deployment phải có ít nhất `deployment_id`, `alpha_id`, `strategy_version`, `params_hash`, `trade_params_hash`, `research_run_id`, `research_params_hash`, `param_mapping_version`, `effective_from`, `effective_to`, `created_at`. Strategy params và execution/trade params phải phân biệt: mapping từ QuantBT sang instrument, sizing, execution/cost assumptions được version hóa; không coi hai bộ params tương đương chỉ vì cùng tên strategy. Chưa có mapping/binding verified thì status unbound.

Mỗi `reference_window_binding` giữ `reference_window_id`, `individual_evidence_binding_id`, source kind, deployment/run id, verified economic domain/account mode, stage nếu có, strategy/trade params hashes, feature cutoff, outcome start/end, artifact available_at và manifest hash. Đây là contract bổ sung cần triển khai, không khẳng định source hiện đã có.

Khi replay tại thời điểm t, chỉ dùng bindings và artifacts đã tồn tại và có thể biết ở t. Một research run hoàn thành sau deployment start không được backdate binding rồi coi outcome cũ là prospective OOS. Có thể có retrospective analysis view riêng, được dán nhãn rõ và không ghi đè history.

Với một reference sample j:

- `feature_time = t_j`: tính features từ trailing market data có timestamp <= cutoff trước quyết định; ghi feed lag và bar-closure rule.
- `outcome_window = [t_j, t_j+H)`: outcome chỉ có sau end và sau reconciliation/availability watermark.
- Sample chỉ đủ điều kiện làm reference khi outcome window đã hoàn tất, `available_at <= as_of`, cùng target horizon và đúng binding.
- Features, quantile boundaries, scaler và support thresholds được fit/khóa từ calibration set trước evaluation. Window có outcome crossing split boundary phải purge; thời gian gap/embargo phụ thuộc lookback/holding horizon, được policy xác định, không hard-code một tỷ lệ tùy ý.
- Reusing OOS để chọn params/feature schema là một trial mới và mất tính untouched OOS của phần đó. Giữ registry những thay đổi đã thử.

Research IS/OOS/validation được tag tách; backtest không đổi thành observed paper/live. Không để hàng nghìn simulated windows lấn át vài actual windows rồi gắn nhãn “live confidence cao”.

### 9.3 Bộ feature nhỏ

Đề xuất `market_features_v1` với tối đa ba dimensions, tính trên benchmark/instrument basket được khai báo và đồng nhất với universe alpha:

1. **Volatility:** standard deviation của market log returns trên trailing L_v closed bars; giữ unit theo bar, hoặc chuẩn hóa theo scale có version. Không dùng volatility của PnL alpha làm market volatility.
2. **Trend:** `sum(r_market over L_t) / sqrt(sum(r_market^2 over L_t))`, dimensionless signed trend-strength proxy; denominator 0 → unavailable. Đây là feature thiết kế, không gọi là một indicator chuẩn đã được xác nhận.
3. **Liquidity:** median quoted spread bps, hoặc log quoted depth/notional volume proxy nếu nguồn thực có. Chọn một định nghĩa cụ thể và chiều nghĩa; volume không đồng nghĩa order-book liquidity. Không hoán đổi spread và volume trong cùng schema version.

Lookbacks, benchmark/basket construction, return definition và missingness là config versioned. Nếu chỉ có price/volume thì dùng schema `market_features_price_volume_v1` đã hiệu chỉnh riêng, hoặc price-only nếu phù hợp; ghi rõ liquidity chưa được quan sát. Schema thiếu một dimension không được so trực tiếp với distance threshold của schema đầy đủ.

Labels low/normal/high volatility hay up/flat/down chỉ là presentation từ quantiles/thresholds đã khóa trên reference. Continuous features là nguồn chính. Không đặt universal threshold “vol > X là high” cho mọi asset/frequency.

### 9.4 Robust feature distance

Từ calibration reference đã khóa, với feature dimension k:

`m_k = median(x_jk)`

`s_k = 1.4826 * median(|x_jk - m_k|)`

`z_jk = (x_jk - m_k) / s_k`

`z_now,k = (x_now,k - m_k) / s_k`

`d_j = sqrt(sum_k(omega_k * (z_now,k-z_jk)^2) / sum_k(omega_k))`

V1.1 dùng equal omega trên từng schema cố định đã phát hành. Không clip current outlier về biên reference để tạo fit giả. Khi MAD=0, dimension phải bị đánh dấu degenerate; dùng schema fallback đã chuẩn bị hoặc abstain. Một epsilon tùy ý để tạo distance hữu hạn không phải cách xử lý semantic missingness.

Distance này không mô hình hóa covariance giữa features và không chứng minh outcome stationarity. Ghi distribution drift/unsupported range bên cạnh distance; hỗ trợ gần trên một feature không đủ nếu dimensions khác ngoài support.

### 9.5 Nội suy mô tả, không ngoại suy dự báo

Lọc eligible references trong cùng verified economic-domain, stage/evidence-kind, horizon và binding; chọn neighbors theo feature distance, không theo outcome đẹp. Dùng Gaussian kernel:

`k_j = exp(-d_j^2/(2*h^2))` cho neighbor qua support filter, h>0.

`alpha_j = k_j / sum(k_j)`

Nếu không còn eligible neighbors, kernel sum bằng 0 do underflow, hoặc bất kỳ distance/weight/sum nào không finite: abstain với reason code, không chia 0 hoặc đổi thành equal weights. Có thể dùng stable log-sum-exp implementation, nhưng không dùng ổn định số để bỏ qua out-of-support gate.

`matched_outcome_mean = sum(alpha_j * y_j)`

`effective_sample_size = 1 / sum(alpha_j^2)`

Với `y_j` là realized net TWR của historical outcome window, con số mean là “trung bình lịch sử có trọng số trong mẫu tương đồng”. Nó không được đặt tên forecast/expected return và không có đơn vị “probability”. Kèm median, empirical quantiles, min/max, window IDs, date range và cost assumptions. Quantiles là phân bố mô tả historical matched windows, không phải confidence/prediction interval.

`effective_sample_size` trên chỉ đo mức tập trung trọng số; không sửa serial dependence. Phải hiển thị `distinct_episode_count`, overlap policy và số block độc lập về lịch sử có thể biện hộ. Không đếm nhiều cửa sổ chồng lấn cùng một market episode là nhiều bằng chứng độc lập.

V1 giữ summary riêng cho research OOS, Paper, Sandbox, Canary, Live. Không tự trộn actual và simulated bằng một hệ số tin cậy đặt tùy tiện. Nếu chưa có đủ actual evidence, UI nói rõ “chỉ có hỗ trợ từ nghiên cứu/mô phỏng”.

### 9.6 Support, abstention và thresholds

`regime_fit.status` gồm:

- `supported`: qua operational support policy đã được phê duyệt; không có nghĩa profitable.
- `weak_support`: có historical neighbors nhưng ít episodes/coverage hoặc nguồn chủ yếu simulated; không công bố một scalar forecast.
- `out_of_support`: current features quá xa hoặc nằm ngoài vùng support đã đăng ký; không lấy nearest điểm rất xa rồi vẫn trả fit cao.
- `insufficient_data`: thiếu current features, reference samples, complete outcomes, required costs hoặc thresholds chưa thể dùng.
- `stale`: feed/artifact/feature cutoff cũ hơn allowed freshness.
- `unbound`: thiếu binding hợp lệ hoặc mismatch strategy version/params.

Các gates `min_neighbors`, `min_effective_sample_size`, `min_distinct_episodes`, `max_distance`, `max_feature_age`, `min_current_feature_coverage` và kernel bandwidth phải nằm trong `regime_policy_version`. Chọn từ replay/walk-forward calibration và business tolerance; không có bộ số mặc định được gọi là statistically validated.

Thứ tự xác định status: unbound → stale/invalid current inputs → insufficient_data → out_of_support → weak_support/supported. Giữ tất cả reason codes; không che mismatch bằng một status xanh do có neighbors.

### 9.7 Ví dụ số Regime Fit

Fixture giải thích, chưa đạt điều kiện production support:

- Ba historical windows có distance 0, 0.5, 1.0; h=0.5.
- Kernel weights trước normalize: 1, 0.606531, 0.135335.
- Trọng số normalize: 0.574097, 0.348207, 0.077696.
- Historical net TWR tương ứng: +2%, -1%, +3%.
- Matched historical weighted mean ≈ +1.033073%; effective sample size≈2.188795.

Không hiển thị “expected return +1.03%”. Ba windows có thể cùng một episode; khi đó distinct_episode_count=1 và support vẫn yếu hoặc insufficient theo policy. Một window âm không được bỏ khỏi neighbors vì làm summary kém đẹp.

### 9.8 Regime contract

| Field | Ý nghĩa |
|---|---|
| `regime_fit.status`, `reason_codes[]` | Operational historical-support state và lý do |
| `regime_fit.policy_version`, `policy_hash`, `approved_policy_id` | Frozen features, distances, gates, kernel, missing policy; chưa approved thì chỉ candidate preview, không production supported |
| `feature_schema_version` | Feature names, units, windows, universe/basket và scaling |
| `research_binding_id`, `bound_run_id` | Exact research provenance |
| `strategy_version`, `params_hash` | Exact executable alpha identity |
| `evidence_snapshot_id` | Manifest của eligible reference windows |
| `as_of`, `feature_cutoff`, `reference_cutoff` | Khi biết kết quả và ranh giới dữ liệu |
| `distance` | Nearest eligible distance; không là similarity probability |
| `neighbor_count` | Số windows đủ điều kiện |
| `effective_sample_size` | Weight concentration diagnostic, chưa dependency-adjusted |
| `distinct_episode_count` | Số episodes theo episode policy đã khóa |
| `stage_breakdown` | Counts, coverage và summaries tách theo evidence kind/stage |
| `matched_outcome_summary` | Descriptive net TWR/quantiles/cost basis; nullable khi unsupported |
| `reference_window_ids` | Drilldown/replay; không đưa cả lịch sử vào execution path |
| `market_regime_label` | Optional presentation label, không thay TradeState |
| `revision`, `supersedes_revision` | Corrections append-only |

Không đặt tên field `win_probability` hoặc `model_confidence`. Nếu API cũ bắt buộc `confidence`, trả unknown/null cho probabilistic confidence và thêm `support_status` rõ nghĩa; không map supported thành 0.9.

### 9.9 Quan hệ với QBTS và manager view

Regime Fit không thay đổi P/R/B, không nhân score, không điều chỉnh band và không thay TradeState. `supported` có thể đi cùng historical outcomes âm; `out_of_support` không đồng nghĩa alpha sẽ thua. UI đặt similarity/support, evidence maturity và historical outcomes ở các trường riêng. Timeline xuyên stage tại mục 4.5 không cho phép trộn actual/simulated neighbors thành một confidence scalar.

Khi nghiên cứu giá trị bổ sung của matching, đối chiếu matched outcomes với historical unconditional baseline cùng alpha/binding/horizon bằng replay nhân quả; không mặc định similarity cao là incremental predictive edge. Thiếu inputs Regime Fit không làm mất một QBTS/PortfolioScore đã tính được từ economic inputs hợp lệ.


## 10. Archive monitoring

Archive là metadata/lifecycle của strategy record, không đồng nghĩa một executable job đang chạy. Một alpha archived không được tự động nhận paper evidence sau archive nếu không có deployment thật.

Nếu muốn tiếp tục quan sát, tạo **deployment Paper riêng** được người dùng phê duyệt:

- strategy version/params/binding đóng băng; có `monitoring_deployment_id`, started_at, virtual allocation, resource budget và telemetry riêng;
- parent strategy vẫn archived; permission và lifecycle của paper deployment tách biệt;
- no exchange credentials/live order path; simulated fills/cost model được ghi rõ;
- history chỉ bắt đầu từ deployment thật, không backfill rồi giả là forward paper;
- kết quả hỗ trợ review thủ công; không tự unarchive, allocate real capital, chuyển Canary hoặc Live.

Chỉ cập nhật một “watchlist” read-only không tạo paper evidence mới. Việc provision/start/stop deployment là action vận hành riêng cần approval, không nằm trong proposal scoring này.

## 11. Acceptance tests bắt buộc

Numerical fixtures là ví dụ kiểm toán công thức, **không calibration production**. Tolerance cho reference float fixtures tối đa `1e-9` khi phù hợp; implementation money/ledger dùng precision nguồn, wire decimal strings. UI rounded values không là input. Bộ smoke runnable ở Phụ lục A chỉ kiểm tra phần số học; các integration/security/replay gates dưới đây cần chạy trong codebase thật.

### 11.1 QBTS, band và accounting

| ID | Tình huống | Expected |
|---|---|---|
| Q01 | Fixture mục 5.9 | P=80, R=66, B=70, QBTS=73.3; band fair. |
| Q02 | Metric dưới/trên L/U | N đúng 0/100 theo chiều; raw metric không bị xóa. |
| Q03 | U<=L, nonfinite anchor, missing horizon config | Invalid/config pending; không production value. |
| Q04 | MDD và ADD vượt upper anchors | Hai normalized components=0; breaches/raw losses vẫn hiện. |
| Q05 | Same metrics, evidence limited thay sufficient | Value không đổi; status/badge đổi, không confidence discount. |
| Q06 | n<2 hoặc std(excess)=0 | Sharpe undefined; full score null/partial, không infinity→100. |
| Q07 | Required funding/fees thiếu | partial_costs; dependency-affected components không coi là valid net metrics. |
| Q08 | Actual fills đã có slippage trong prices | Net không bị trừ slippage estimate lần hai; stress chỉ incremental. |
| Q09 | Negative return valid | Giữ và tính; không loại alpha thua khỏi cohort. |
| Q10 | Completed block missing / incomplete tail | Missing completed block → partial; tail xử lý theo manifest, không chọn sau outcome. |
| Q11 | Deposit100 giữa đoạn +5% rồi +2% | TWR=7.1%, PnL=9.1; không NAV-growth score giả. |
| Q12 | Transfer giữa sleeves | External ở sleeve, internal ở manager; không double-count flow. |
| Q13 | NAV<=0, invalid FX/valuation hoặc gap | Invalid/unavailable, không forward-fill tùy ý. |
| Q14 | Version/params đổi giữa alpha window | Boundary/mapping rõ; không silently inherit. Portfolio book history không reset. |
| Q15 | Hourly/daily hoặc 7d/30d score | Khác basis nếu chưa cùng profile; range0–100 không đủ để aggregate. |
| Q16 | Provider q<0 hoặc q>100 | Range error, không clip provider output. |
| Q17 | E=[1,1.1,0.99,1.1] | DD observations=[0,0.1,0], MDD=.1, ADD=1/30; E0 không thêm vào n. |
| Q18 | Cash returns [1%,1%], alpha [2%,2%] | Excess TWR=.0203, không .0201 từ compound arithmetic excess. |
| Q19 | Known five atomic inputs fixture, thiếu Sharpe | Bounds[62.5,76.0], value null; không midpoint. |
| Q20 | Biên 0/40/60/75/90/100 và sát dưới biên | Band đúng half-open ranges, based on canonical before UI rounding. |
| Q21 | Zero trading được verified nhưng path flat | Stress delta=0; undefined Sharpe không được đổi thành high quality. |
| Q22 | Chỉ đổi allocation ở alpha khác | Raw q của subject giữ nguyên nếu path/basis không đổi. |
| Q23 | Cash benchmark/currency mismatch | Incomparable/invalid basis; không coi USD=USDT mặc định. |
| Q24 | Filter table hoặc thêm poor alpha vào universe | Anchors và raw scores cũ không đổi. |

### 11.2 Cost stress và robustness

| ID | Tình huống | Expected |
|---|---|---|
| S01 | Net=.01, opening capital100, gross notional200, delta5bps | Incremental cash=.10, incremental return=.001, stress return=.009. |
| S02 | Delta=0 identity fixture | Stress path=net path; không dùng fixture làm production stress mặc định. |
| S03 | Delta tăng, fixed positive path | Stress TWR/normalized stress không tăng; P/R/consistency không tự đổi. |
| S04 | No-turnover verified | G=0, cost increment=0; không phân biệt với missing G bằng cùng value0. |
| S05 | Gross notional thiếu, net NAV vẫn valid | Stress component missing; known components giữ nếu dependencies độc lập. |
| S06 | Round trip / split attribution cùng exchange fill | Mỗi fill side tính một lần; manager không đếm trùng split receipts. |
| S07 | Pure capital transfer | Không tạo gross executed notional. |
| S08 | Derivative/inverse instrument | Notional theo instrument authority; không dùng công thức spot giả. |
| S09 | Stress làm 1+r<=0 | INVALID_STRESS_PATH/breach; không compound sign-changing NAV. |
| S10 | Stress anchors khác net anchors | Invalid v1.1 config; không cho stress đạt điểm dễ hơn. |
| S11 | Ties/zero-trade completed blocks | Tie=0, vẫn giữ block; K không chỉ là blocks có trade. |
| S12 | Bằng nhau p_+ nhưng payoff khác | B khác nếu stressed outcome khác; không gọi p_+ là toàn bộ robustness. |

### 11.3 Allocation, portfolio, concentration và view independence

| ID | Tình huống | Expected |
|---|---|---|
| A01 | q88/60, weights20/80 | Contribution17.6/48, AlphaScore65.6. |
| A02 | Reweight30/70, q giữ nguyên | AlphaScore68.4, tăng2.8; không phải PnL gain. |
| A03 | q80/20, weights50/50, groups khác | A50, dispersion30, H_alloc.5,H_score.68; không suy PortfolioScore. |
| A04 | q50/50, same weights | A50,dispersion0,H_score.5; direct score cần NAV. |
| A05 | Single-alpha portfolio exact same path/cost/cash/basis | PortfolioScore=raw QBTS; không penalty xuống75% điểm. |
| A06 | q đều0, allocation>0 | A0,H_score null; PortfolioScore vẫn tính từ path, không gán0 theo A. |
| A07 | Zero allocation | AlphaScore no_allocation; portfolio có NAV được xử lý độc lập. |
| A08 | 25% allocation thiếu q | AlphaScore null,coverage.75; không hidden subset headline. |
| A09 | NAV100,cash20,a60/20,q90/missing | Bounds[67.5,92.5]; NAV coverage chỉ khi partition proof. |
| A10 | q thứ hai=50 provisional | A80 provisional; provisional allocation weight=.25. |
| A11 | Clone một lineage thành10 rows | HHI và economic PortfolioScore không đổi nếu path/ownership không đổi. |
| A12 | Reorder rows/zero-allocation rows | A/H và direct economic path không đổi. |
| A13 | Actual ownership overlap | Reconciliation fail; không normalize capital để che. |
| A14 | Negative capital / signed exposure dùng nhầm | Invalid capital, không coi short notional là negative allocation. |
| A15 | Legacy signed score | Giữ legacy version/view, reject khỏi v1.1 aggregate. |
| A16 | Thiếu grouping | Group diagnostics unavailable; không chặn A hoặc direct PortfolioScore. |
| A17 | Missing correlation | Correlation null; không giả=0 hoặc điều chỉnh PortfolioScore. |
| A18 | Weights đổi qua thời gian | Historical score dùng historical allocation snapshots. |
| A19 | Fee correction | New revision; giữ original_as_published và recompute affected scopes. |
| A20 | Actual/virtual trỏ account/stage khác nhau | Dedupe theo verified ownership/domain, không tên stage. |
| A21 | Archived alpha còn capital/exposure | Không biến mất khỏi denominator do UI/lifecycle filter. |
| A22 | Assignedcapital100,NAV90 sau lỗ, không NAV partition | A có thể hợp lệ; allocation_coverage_nav null/BASIS_MISMATCH, không overlap giả. |
| A23 | Same comparable basis, different valid individual bindings | Allocation aggregate được; không yêu cầu same run/version giữa các alpha khác nhau. |
| A24 | Một alpha mới thiếu q, portfolio ledger đầy đủ | AlphaScore partial; PortfolioScore available/provisional theo own path. |
| A25 | Đủ q_i nhưng không có portfolio NAV | AlphaScore tính được; PortfolioScore unavailable, không lấy A thay. |
| A26 | Hai portfolio cùng path, khác count/group labels | Direct PortfolioScore giống nhau. |
| A27 | Manager transfer từ portfolioA sangB | Consolidated manager TWR không có external flow giả. |
| A28 | Nhiều portfolio có cash/cost/timing khác | F(consolidated path), không average child scores. |
| A29 | Researcher đọc API/export/cache aggregate | Deny/authorized slice; không lộ denominators/hidden contributions/manager total. |
| A30 | Policy pending / score stale | Không vào valid set; last-known/preview object tách biệt. |

### 11.4 Stage, short sample và replay

| ID | Tình huống | Expected |
|---|---|---|
| E01 | Hai alpha đủ 7d window nhưng maturity limited | Numeric provisional q, aggregate provisional khi same basis. |
| E02 | Alpha5d trong compare30d | Early facet theo effectivewindow; không q30d giả hay annualization. |
| E03 | Short sample đầy đủ so với missing observations | Limited khác invalid/partial; không cùng reason/status. |
| E04 | Canary→Live chỉ đổi stage, same actual ledger/config | Không reset return path/peak trong window; stage breakdown vẫn chính xác. |
| E05 | Paper40d+Sandbox20d+actual10d không overlap | Forward70d,actual10d; không actual70d hoặc capital merge. |
| E06 | Paper/live chạy song song | Một source per interval theo predeclared manifest; không cộng observation time. |
| E07 | Chọn stage source sau khi thấy PnL | Fail look-ahead/source-selection test. |
| E08 | Cross-stage có version/gap/flow mapping không hợp lệ | Không nối full score; timeline/segment cards còn. |
| E09 | Policy calibration được tạo sau replay_as_of | Không dùng ở original replay; retrospective view label riêng. |
| E10 | Kiểm tra band/rank dùng toàn evaluation để fit anchors | Fail temporal calibration; không gọi kết quả đó là ngoài mẫu. |

### 11.5 Regime và no-leakage

| ID | Tình huống | Expected |
|---|---|---|
| R01 | Binding/version/params mismatch | unbound, không neighbors từ binding khác. |
| R02 | Artifact available sau replay as_of | Loại dù market window thuộc quá khứ. |
| R03 | Binding tạo sau deployment start | Không backdate thành prospective OOS. |
| R04 | Feature cần bar chưa close | Loại, ghi cutoff và feed lag. |
| R05 | Outcome chưa hết horizon/chưa reconcile | Chưa reference-eligible. |
| R06 | Fit scaler trên future evaluation | Fail; calibration hash/cutoff phải trước evaluation. |
| R07 | Outcome crossing split | Purge theo manifest/horizon. |
| R08 | Required liquidity missing | Insufficient/schema đã version hóa, không fill0. |
| R09 | MAD=0 | Degenerate feature, không epsilon tạo support giả. |
| R10 | Current quá xa references | out_of_support; không nearest cực xa rồi vẫn supported. |
| R11 | d0/.5/1,h=.5 | Weights≈.574097/.348207/.077696, N_eff≈2.188795. |
| R12 | Outcomes2%/-1%/3% | Descriptive mean≈1.033073%, không expected_return/probability. |
| R13 |100 overlapping windows một episode | episode_count1; không confidence tăng theo fake independence. |
| R14 | Chỉ simulated evidence | Stage/evidence labels đúng, không live-supported. |
| R15 | Neighbor âm nhưng eligible theo features | Vẫn giữ, không outcome-based selection. |
| R16 | Archive không có paper deployment | Không phát sinh forward evidence. |
| R17 | Paper monitoring approved cho archived alpha | Deployment riêng, strategy vẫn archived, no Live side effect. |
| R18 | Feature stale | Stale dù nearest distance thấp. |
| R19 | TradeState flat, trend label up | Hai field riêng; không auto-long. |
| R20 | Score/regime service down | UI stale/unavailable, không chặn authorized reduce-risk. |
| R21 | Params đổi sau xem OOS | Trial mới, không còn untouched sample. |
| R22 | Historical fee/feature correction | Append-only revision; replay không thấy facts đến sau. |
| R23 | Empty/nonfinite/kernel underflow | Abstain, không divide0/equal weights fallback. |
| R24 | Supported nhưng matched outcomes âm | Supported historical context, không band alpha được tăng. |
| R25 | Regime unavailable, economic score inputs đầy đủ | QBTS/PortfolioScore vẫn độc lập. |

## 12. Phạm vi triển khai và exit gates

Đây là kế hoạch triển khai specification đã chọn, không là danh sách phương án công thức để chọn lại. PR/branch/deployment conventions phải lấy từ repository được giao; không suy quyền ghi production từ tài liệu scoring.

### P0 — Audit inputs, policy artifact và provenance

**Làm:** audit read-only legacy QBTS/contracts, ledger/NAV/fees/turnover, actual/virtual ownership, allocated capital/current-NAV partition, binding, runtime scope và permissions. Ghi rõ verified/gap ở từng nguồn. Chuẩn bị một calibration artifact theo F_pi đã khóa, maturity, block/anchor/stress profile cho các cửa sổ được hỗ trợ.

**Đầu ra:** source/field mapping, economic dependency matrix, versioned policy schema, representative calibration profiles, scope of approval. Không hỏi người dùng “có legacy hay không”; engineering phải kiểm chứng.

**Gate:** raw economic data source đúng authority; không có silent substitution margin→capital, NAV growth→TWR hoặc virtual→actual; math/config validation pass. Anchors chưa có evidence thì chưa publish numeric production, nhưng formula đã chọn không bị mở lại A/B/C.

### P1 — Shared calculator và reference validation

**Làm:** implement F_pi, six atomic metrics, fixed-path cost stress, ADD, band, provisional/partial statuses, coverage/bounds, allocation contributions và direct economic PortfolioScore trong shared module. Không thêm HHI penalty.

**Đầu ra:** deterministic snapshots và runnable numerical/property tests; exact formulas/spec mapping, stress/count/rounding documentation, legacy comparison nếu nguồn có.

**Gate:** mọi mandatory math/data invariant liên quan pass; replay cùng inputs/policy tái hiện được; thiếu alpha q/grouping không làm mất direct economic score; zero variance/invalid stress không sinh infinity hoặc green score giả.

### P2 — Manager/researcher read model, UI và cross-stage continuity

**Làm:** read models/cache, scope authorization, Alpha/Portfolio/Manager views, components/attribution drill-down, same-window comparison, Early facet, stage continuity manifest và original/restated history. Continuous updates theo sealed input watermark; API không nặng trong order path.

**Đầu ra:** actual browser tests cho navigation/filter/window changes, missing/stale/provisional/cost states, data-to-API-to-UI parity và permission boundaries. Fixtures chỉ bổ sung; kiểm tra bằng economic snapshots thật trong môi trường được phép khi có.

**Gate:** không đổi denominator im lặng theo filter; no virtual capital merge; band/contribution labels đúng; researcher không đọc được hidden manager data; authorized close/reduce-risk không phụ thuộc analytics availability.

### P3 — Calibration replay, shadow run và Regime Fit riêng

**Làm:** temporal calibration/replay, rank/band sensitivity trên forward data hiện có, sample-length/sizing/tail/turnover profiles, corrections và stage transitions. Regime Fit giữ descriptive matching/support, no-leakage và source breakup theo mục 9; paper monitor archived alpha cần deployment approval riêng.

**Đầu ra:** calibration report, clipping/band occupancy/score stability, failure cases, acceptance matrix và release config đã freeze. Historical backfill không biến dữ liệu thành forward-as-published; actual evidence ít phải hiển thị đúng actual duration.

**Gate:** đưa policy từ shadow sang production read-only sau review evidence và technical tests phù hợp. Không yêu cầu chứng nhận chạy tiền thật hoặc bật Live mới được hoàn tất công việc analytics; scoring release không tự cho phép exchange actions. Không claim empirical validation chỉ từ smoke tests.

## 13. Quyết định đã chốt và thông số phải hiện thực hóa

### 13.1 Đã thống nhất trong v1.1

- Một F_pi: QBTS=`0.45P+0.30R+0.25B`; component weights/metrics đúng mục 5; no percentile/PSR/DSR/HHI alternative.
- Raw alpha score tách score contribution và allocation-weighted AlphaScore theo allocated economic capital.
- PortfolioScore và manager headline tính trực tiếp trên economic NAV path, không penalized composition hoặc mean child scores.
- Năm bands đã nêu, cùng meaning/profile cho raw và direct portfolio quality; contribution không có quality band.
- Provisional numeric score cho math-complete short evidence; aggregate khi compatible window/basis; partial không điền score hoặc đổi weights.
- Stage timeline liên tục với provenance; actual/virtual capital tách biệt; mixed observation label rõ.
- Diagnostics và Regime Fit không sửa công thức, không cấp quyền vận hành.

### 13.2 Calibration/config cần hoàn thiện, không tự lấy fixture làm production

Engineering đề xuất bằng evidence: horizon-specific L/U, observation grid, block horizon/origin, benchmark/currency/FX/cost method, delta_bps, maturity/freshness và quantization thresholds. Chủ hệ thống phê duyệt **config artifact và release scope**, không cần chọn lại phương án công thức đã duyệt.

Các con số production này chưa có trong bản gốc hoặc cuộc duyệt công thức, nên tài liệu không tự gán “đã duyệt” cho một bộ anchors/mức stress tưởng tượng. Fixtures bên dưới chỉ để nghiệm toán. Cấu hình phải nêu rõ time window, calibration cutoff, included failed/inactive alphas, snapshots, coverage và known trade-offs. Không rescale score để che performance/risk chưa đạt.

### 13.3 Việc kỹ thuật phải xác minh và báo cáo

Xác minh source/contract thật, legacy migration, fees/turnover/FX, physical-account dedupe và attribution capital; alpha/trade params mapping và research linkage khi áp dụng; event-time availability/replay; precision/wire format; compute authority và authorization. Báo từng test group PASS/FAIL/not-run với evidence artifact, không đổi một việc chưa kiểm chứng thành user policy decision.

Nếu discovery tìm thấy metric/data nguồn chưa hỗ trợ exact method, report gap và giữ partial/policy-pending tương ứng; không lặng lẽ thay economics. Việc hoàn tất tài liệu hoặc chạy fixtures không chứng minh production infrastructure đã sẵn sàng.

### 13.4 Migration từ v1.0 và release checklist

1. Publish formula/config version mới; legacy scores giữ policy label và original history. Không overwrite dữ liệu cũ bằng số mới cùng version.
2. Loại bỏ concentration penalty và `lambda` khỏi v1.1 compute/DTO/UI copy; HHI chuyển diagnostic scope. Không giữ code path “PortfolioScore=AlphaScore discounted” làm fallback.
3. Thay Q/D/S thành P/R/B và atomic contributions; thay old numerical expected values. Fix status semantics để provisional đủ inputs được aggregate và direct portfolio score không phụ thuộc constituent score coverage.
4. Backfill/compare trên cùng approved source windows, ghi changes do formula/config/economic revisions riêng. Backfilled v1.1 không giả là đã được biết khi quyết định cũ diễn ra.
5. Bật read-only UI theo config release; verify scope/security/stale/corrections/cost invariants. Không tự rebalance, provision monitor, switch stage hoặc bật Live.

## Phụ lục A. Numerical smoke tests có thể chạy độc lập

Script dưới đây kiểm tra đúng công thức v1.1, mapping/band, cash-flow TWR fixture, MDD/ADD, block consistency, fixed-path stress, allocation/coverage/bounds, direct-score independence, grouping diagnostics và Regime Fit fixtures. Chỉ dùng Python standard library. Capital examples dùng Decimal; statistical path fixtures dùng float với tolerance. Đây là **reference tests**, không phải implementation của accounting/backtest/execution authority.

Không đọc repository/server, không gửi lệnh/deploy, không chứng nhận anchors hoặc production readiness. Policy approval, role authorization, event-time continuity, source adapters và browser tests cần các integration tests ở mục 11. Trạng thái thực thi smoke của bản Markdown được ghi ở cuối appendix sau khi chạy chính block code này.

Lưu block thành `score_v1_1_smoke.py`, chạy `python3 score_v1_1_smoke.py` với Python 3.9 trở lên.

```python
"""Reference fixtures for SCORE_REGIME_PROPOSAL_v1.1.md, not production accounting."""
from dataclasses import dataclass
from decimal import Decimal, localcontext
from math import exp, fsum, isclose, isfinite, prod, sqrt
from statistics import mean, stdev
from typing import Mapping, Optional, Sequence
import unittest

D = Decimal
ATOMIC_WEIGHTS = {
    "net_excess_twr": .315, "sharpe_period": .135,
    "mdd": .180, "add": .120,
    "positive_block_ratio": .125, "stress_excess_twr": .125,
}


@dataclass(frozen=True)
class FixtureAnchors:
    """Illustrative only: these numbers are NOT approved production calibration."""
    twr: tuple[float, float] = (-.02, .08)
    sharpe: tuple[float, float] = (0., .15)
    mdd: tuple[float, float] = (0., .10)
    add: tuple[float, float] = (0., .04)

    def validate(self) -> None:
        for low, high in (self.twr, self.sharpe, self.mdd, self.add):
            if not (isfinite(low) and isfinite(high) and high > low):
                raise ValueError("INVALID_ANCHORS")
        if self.mdd[0] < 0 or self.add[0] < 0:
            raise ValueError("NEGATIVE_DOWNSIDE_ANCHOR")


def normalize(x: float, anchors: tuple[float, float], downside=False) -> float:
    low, high = anchors
    if not all(isfinite(v) for v in (x, low, high)) or high <= low:
        raise ValueError("INVALID_NORMALIZATION")
    # Endpoints do not need subtraction; finite extreme anchors can overflow
    # float differences. Decimal interior arithmetic keeps the same linear map.
    if x <= low:
        value = 0.
    elif x >= high:
        value = 100.
    else:
        with localcontext() as context:
            context.prec = 80
            dx, dl, du = (D.from_float(float(v)) for v in (x, low, high))
            value = float(D(100) * (dx - dl) / (du - dl))
        if not isfinite(value) or not 0. <= value <= 100.:
            raise ValueError("NUMERIC_OUT_OF_RANGE")
    return 100. - value if downside else value


def band(value: Optional[float]) -> Optional[str]:
    if value is None:
        return None
    if not isfinite(value) or not 0 <= value <= 100:
        raise ValueError("INVALID_SCORE_RANGE")
    for upper, label in ((40., "weak"), (60., "neutral"),
                         (75., "fair"), (90., "good")):
        if value < upper:
            return label
    return "very_good"


def quality(metrics: Mapping[str, Optional[float]], policy: FixtureAnchors,
            mature: bool = False) -> dict:
    policy.validate()
    points = {}
    for name in ATOMIC_WEIGHTS:
        value = metrics.get(name)
        if value is None:
            points[name] = None
            continue
        if not isfinite(value):
            raise ValueError("NONFINITE_METRIC")
        if name == "positive_block_ratio":
            if not 0 <= value <= 1:
                raise ValueError("INVALID_BLOCK_RATIO")
            points[name] = 100. * value
        elif name in ("net_excess_twr", "stress_excess_twr"):
            points[name] = normalize(value, policy.twr)
        elif name == "sharpe_period":
            points[name] = normalize(value, policy.sharpe)
        else:
            if value < 0:
                raise ValueError("NEGATIVE_DRAWDOWN")
            points[name] = normalize(value, getattr(policy, name), downside=True)
    if metrics.get("mdd") is not None and metrics.get("add") is not None:
        if metrics["add"] > metrics["mdd"] + 1e-12:
            raise ValueError("ADD_EXCEEDS_MDD")
    if metrics.get("net_excess_twr") is not None and metrics.get("stress_excess_twr") is not None:
        if metrics["stress_excess_twr"] > metrics["net_excess_twr"] + 1e-12:
            raise ValueError("STRESS_IMPROVES_NET_RETURN")
    contributions = {k: (None if points[k] is None else w * points[k])
                     for k, w in ATOMIC_WEIGHTS.items()}
    lower = fsum(v for v in contributions.values() if v is not None)
    upper = lower + 100. * fsum(ATOMIC_WEIGHTS[k] for k in points
                               if points[k] is None)
    pairs = {
        "P": (("net_excess_twr", .7), ("sharpe_period", .3)),
        "R": (("mdd", .6), ("add", .4)),
        "B": (("positive_block_ratio", .5), ("stress_excess_twr", .5)),
    }
    components = {key: (None if any(points[k] is None for k, _ in pair)
                        else fsum(w * points[k] for k, w in pair))
                  for key, pair in pairs.items()}
    complete = all(v is not None for v in points.values())
    value = lower if complete else None
    return {"value": value, "band": band(value), "points": points,
            "components": components, "contributions": contributions,
            "bounds": None if complete else (lower, upper),
            "status": ("available" if mature else "provisional")
                      if complete else "partial_components"}


def twr(returns: Sequence[float]) -> float:
    if not returns or any(not isfinite(r) or r <= -1 for r in returns):
        raise ValueError("INVALID_RETURN_PATH")
    wealth = prod(1. + r for r in returns)
    if not isfinite(wealth) or wealth <= 0.:
        raise ValueError("NUMERIC_OUT_OF_RANGE")
    value = wealth - 1.
    # Positive wealth can still round to a displayed return of exactly -1.
    # Report numerical unavailability, never fictitious bankruptcy/full data.
    if not isfinite(value) or value <= -1.:
        raise ValueError("NUMERIC_OUT_OF_RANGE")
    return value


def drawdowns(returns: Sequence[float]) -> tuple[float, float]:
    twr(returns)  # Validate the path first.
    equity, peak, losses = 1., 1., []
    for r in returns:
        equity *= 1. + r
        peak = max(peak, equity)
        losses.append(max(0., 1. - equity / peak))
    return max(losses), mean(losses)  # E0 is NOT an extra observation.


def stressed_path(returns: Sequence[float], turnover_ratios: Sequence[float],
                  delta_bps: float) -> list[float]:
    """Ratios are verified gross notional / baseline opening subperiod NAV."""
    twr(returns)
    if len(returns) != len(turnover_ratios):
        raise ValueError("STRESS_LENGTH_MISMATCH")
    if not isfinite(delta_bps) or delta_bps < 0:
        raise ValueError("INVALID_STRESS_POLICY")
    if any(not isfinite(g) or g < 0 for g in turnover_ratios):
        raise ValueError("INVALID_TURNOVER")
    stressed = [r - delta_bps / 10000. * g
                for r, g in zip(returns, turnover_ratios)]
    if any(not isfinite(r) or r <= -1 for r in stressed):
        raise ValueError("INVALID_STRESS_PATH")
    return stressed


def path_metrics(returns: Sequence[float], cash: Sequence[float],
                 turnover_ratios: Sequence[float], delta_bps: float,
                 block_size: int) -> dict:
    if len(returns) != len(cash):
        raise ValueError("CASH_LENGTH_MISMATCH")
    if not isinstance(block_size, int) or block_size <= 0:
        raise ValueError("INVALID_BLOCK_SIZE")
    net, cash_twr = twr(returns), twr(cash)
    excess = [r - c for r, c in zip(returns, cash)]
    sigma = stdev(excess) if len(excess) >= 2 else None
    sharpe = mean(excess) / sigma if sigma is not None and sigma > 0 else None
    mdd, add = drawdowns(returns)
    blocks = len(returns) // block_size  # Only predeclared complete blocks.
    positive = sum(twr(returns[k*block_size:(k+1)*block_size]) >
                   twr(cash[k*block_size:(k+1)*block_size])
                   for k in range(blocks))
    stressed = stressed_path(returns, turnover_ratios, delta_bps)
    return {"net_excess_twr": net - cash_twr, "sharpe_period": sharpe,
            "mdd": mdd, "add": add,
            "positive_block_ratio": positive / blocks if blocks else None,
            "stress_excess_twr": twr(stressed) - cash_twr,
            "complete_blocks": blocks, "positive_blocks": positive}


def aggregate(capital: Sequence[Decimal], scores: Sequence[Optional[Decimal]],
              statuses: Sequence[str]) -> dict:
    """Allocation composition ONLY; deliberately has no portfolio-score output."""
    if not len(capital) == len(scores) == len(statuses):
        raise ValueError("LENGTH_MISMATCH")
    if any(not a.is_finite() or a < 0 for a in capital):
        raise ValueError("INVALID_CAPITAL")
    active = [(a, q, s) for a, q, s in zip(capital, scores, statuses) if a > 0]
    if any(q is not None and (not q.is_finite() or not D(0) <= q <= D(100))
           for a, q, s in active):
        raise ValueError("INVALID_SCORE_RANGE")
    total = sum((a for a, _, _ in active), D(0))
    if total == 0:
        return {"value": None, "status": "no_allocation", "coverage": None}
    valid = [(a, q, s) for a, q, s in active
             if q is not None and s in ("available", "provisional")]
    covered = sum((a for a, _, _ in valid), D(0))
    provisional = sum((a for a, _, s in valid if s == "provisional"), D(0))
    lower = sum((a * q for a, q, _ in valid), D(0)) / total
    upper = lower + D(100) * (total - covered) / total
    full = covered == total  # Exact capital equality, not floating tolerance.
    return {"value": lower if full else None,
            "status": ("provisional" if provisional > 0 else "available")
                      if full else "partial_coverage",
            "coverage": covered / total, "provisional_weight": provisional / total,
            "bounds": None if full else (lower, upper)}


def group_diagnostics(capital: Sequence[float], scores: Sequence[float],
                      groups: Sequence[Optional[str]]) -> dict:
    if not len(capital) == len(scores) == len(groups):
        raise ValueError("LENGTH_MISMATCH")
    if any(not isfinite(a) or a < 0 for a in capital):
        raise ValueError("INVALID_CAPITAL")
    rows = [(a, q, g) for a, q, g in zip(capital, scores, groups) if a > 0]
    if any(not isfinite(q) or not 0 <= q <= 100 for a, q, g in rows):
        raise ValueError("INVALID_SCORE_RANGE")
    total = fsum(a for a, q, g in rows)
    if total <= 0:
        return {"allocation_hhi": None, "score_hhi": None, "dispersion": None}
    avg = fsum(a * q for a, q, g in rows) / total
    dispersion = sqrt(fsum(a / total * (q - avg)**2 for a, q, g in rows))
    if any(g is None for a, q, g in rows):
        return {"allocation_hhi": None, "score_hhi": None, "dispersion": dispersion}
    allocation_terms, credit_terms = {}, {}
    for a, q, g in rows:
        allocation_terms.setdefault(g, []).append(a / total)
        credit_terms.setdefault(g, []).append(a / total * q)
    allocation = {g: fsum(values) for g, values in allocation_terms.items()}
    credit = {g: fsum(values) for g, values in credit_terms.items()}
    credit_sum = fsum(credit.values())
    return {"allocation_hhi": fsum(w*w for w in allocation.values()),
            "score_hhi": fsum((c/credit_sum)**2 for c in credit.values())
                         if credit_sum > 0 else None,
            "dispersion": dispersion}


def nav_coverage(capital: Decimal, nav: Decimal, partition_proven: bool):
    if not capital.is_finite() or not nav.is_finite() or capital < 0:
        raise ValueError("INVALID_NAV_INPUT")
    if not partition_proven or nav <= 0:
        return None
    value = capital / nav
    if not 0 <= value <= 1:
        raise ValueError("INCONSISTENT_PARTITION_PROOF")
    return value


def historical_match(distances, outcomes, bandwidth):
    if not isfinite(bandwidth) or bandwidth <= 0 or len(distances) != len(outcomes):
        raise ValueError("INVALID_INPUT")
    if any(not isfinite(d) or d < 0 for d in distances):
        return None
    if any(not isfinite(y) for y in outcomes):
        return None
    kernels = [exp(-d*d/(2*bandwidth*bandwidth)) for d in distances]
    total = fsum(kernels)
    if total <= 0 or not isfinite(total):
        return None
    weights = [v / total for v in kernels]
    return fsum(w*y for w, y in zip(weights, outcomes)), 1/fsum(w*w for w in weights)


FIXTURE = {"net_excess_twr": .06, "sharpe_period": .12, "mdd": .04,
           "add": .01, "positive_block_ratio": .75, "stress_excess_twr": .045}
POLICY = FixtureAnchors()


class ScoreTests(unittest.TestCase):
    def close(self, a, b):
        self.assertTrue(isclose(float(a), float(b), rel_tol=1e-9, abs_tol=1e-9), (a, b))

    def test_fixture_components(self):
        q = quality(FIXTURE, POLICY)
        for key, value in {"P": 80, "R": 66, "B": 70}.items():
            self.close(q["components"][key], value)
        self.close(q["value"], 73.3)
        self.assertEqual(q["band"], "fair")

    def test_maturity_does_not_change_score(self):
        early = quality(FIXTURE, POLICY, False)
        mature = quality(FIXTURE, POLICY, True)
        self.close(early["value"], mature["value"])
        self.assertEqual((early["status"], mature["status"]), ("provisional", "available"))

    def test_partial_sharpe_bounds(self):
        q = quality({**FIXTURE, "sharpe_period": None}, POLICY)
        self.assertIsNone(q["value"])
        self.assertIsNone(q["band"])
        self.close(q["bounds"][0], 62.5)
        self.close(q["bounds"][1], 76.)

    def test_formula_atomic_equivalence(self):
        self.close(fsum(ATOMIC_WEIGHTS.values()), 1.)
        q = quality(FIXTURE, POLICY)
        self.close(q["value"], .45*q["components"]["P"] +
                   .30*q["components"]["R"] + .25*q["components"]["B"])

    def test_normalization_and_clips(self):
        for x, expected in ((-.1, 0), (-.02, 0), (.03, 50), (.08, 100), (.2, 100)):
            self.close(normalize(x, POLICY.twr), expected)
        self.close(normalize(.04, POLICY.mdd, True), 60)
        self.close(normalize(.5, POLICY.mdd, True), 0)

    def test_extreme_finite_normalization_endpoints(self):
        anchors = (-1e308, 1e308)
        for value, expected in ((-1e308, 0.), (1e308, 100.)):
            self.close(normalize(value, anchors), expected)
            self.close(normalize(value, anchors, True), 100. - expected)

    def test_extreme_finite_normalization_interior(self):
        anchors = (-1e308, 1e308)
        for value, expected in ((-5e307, 25.), (0., 50.), (5e307, 75.)):
            self.close(normalize(value, anchors), expected)
            self.close(normalize(value, anchors, True), 100. - expected)

    def test_positive_wealth_numeric_out_of_range(self):
        # 400 terms underflow the product; 20 terms keep positive wealth but
        # subtracting 1 rounds the return to -1. Neither is a valid float result.
        for path in ([-.9] * 400, [-.9] * 20, [1e308, 1e308]):
            with self.assertRaisesRegex(ValueError, "^NUMERIC_OUT_OF_RANGE$"):
                twr(path)
            with self.assertRaisesRegex(ValueError, "^NUMERIC_OUT_OF_RANGE$"):
                drawdowns(path)

    def test_bad_anchor(self):
        with self.assertRaises(ValueError): quality(FIXTURE, FixtureAnchors(twr=(1, 1)))
        with self.assertRaises(ValueError): quality(FIXTURE, FixtureAnchors(add=(-1, 1)))

    def test_nonfinite_input(self):
        with self.assertRaises(ValueError): quality({**FIXTURE, "mdd": float("nan")}, POLICY)

    def test_metric_domains(self):
        for change in ({"positive_block_ratio": 1.1}, {"mdd": -.1}, {"add": .05}):
            with self.assertRaises(ValueError): quality({**FIXTURE, **change}, POLICY)

    def test_band_boundaries(self):
        for x, expected in ((0, "weak"), (39.999, "weak"), (40, "neutral"),
                            (59.999, "neutral"), (60, "fair"), (74.999, "fair"),
                            (75, "good"), (89.999, "good"), (90, "very_good"), (100, "very_good")):
            self.assertEqual(band(x), expected)
        self.assertIsNone(band(None))
        for x in (-1, 101, float("nan")):
            with self.assertRaises(ValueError): band(x)

    def test_drawdown_includes_zero_observations(self):
        mdd, add = drawdowns([.1, -.1, 1/.9-1])
        self.close(mdd, .1)
        self.close(add, 1/30)

    def test_excess_twr_not_compound_excess(self):
        self.close(twr([.02, .02]) - twr([.01, .01]), .0203)
        self.close(twr([.01, .01]), .0201)

    def test_flow_fixture(self):
        self.close(twr([.05, .02]), .071)
        self.close(205*1.02 - 100 - 100, 9.1)

    def test_zero_variance_partial(self):
        m = path_metrics([0., 0.], [0., 0.], [0., 0.], 5., 1)
        self.assertIsNone(m["sharpe_period"])
        self.assertEqual(quality(m, POLICY)["status"], "partial_components")

    def test_constant_positive_not_infinity(self):
        m = path_metrics([.01, .01], [0., 0.], [0., 0.], 5., 1)
        self.assertIsNone(m["sharpe_period"])

    def test_one_observation_partial(self):
        m = path_metrics([.01], [0.], [0.], 5., 1)
        self.assertIsNone(m["sharpe_period"])
        self.assertIsNone(quality(m, POLICY)["value"])

    def test_blocks_and_tail(self):
        m = path_metrics([.02, -.01, 0., 0., .2], [0.]*5, [0.]*5, 5., 2)
        self.assertEqual((m["complete_blocks"], m["positive_blocks"]), (2, 1))
        self.close(m["positive_block_ratio"], .5)

    def test_no_complete_blocks_partial(self):
        m = path_metrics([.01, -.01], [0.]*2, [0.]*2, 5., 3)
        self.assertIsNone(m["positive_block_ratio"])
        self.assertIsNone(quality(m, POLICY)["value"])

    def test_invalid_return_path(self):
        for path in ([], [-1.], [float("nan")]):
            with self.assertRaises(ValueError): twr(path)

    def test_incremental_stress_fixture(self):
        self.close(stressed_path([.01], [2.], 5.)[0], .009)
        self.close(5./10000.*200., .1)

    def test_zero_stress_identity(self):
        self.assertEqual(stressed_path([.01, -.02], [2., 3.], 0.), [.01, -.02])

    def test_no_turnover_identity(self):
        self.assertEqual(stressed_path([.01, -.02], [0., 0.], 5.), [.01, -.02])

    def test_stress_monotonicity(self):
        returns, cash, turnover = [.02, -.01, .03, -.005], [0.]*4, [1., 2., 1., 2.]
        low = path_metrics(returns, cash, turnover, 5., 2)
        high = path_metrics(returns, cash, turnover, 10., 2)
        self.assertLessEqual(high["stress_excess_twr"], low["stress_excess_twr"])
        self.assertLessEqual(low["stress_excess_twr"], low["net_excess_twr"])
        self.assertLessEqual(quality(high, POLICY)["value"], quality(low, POLICY)["value"])
        for key in ("P", "R"):
            self.close(quality(low, POLICY)["components"][key], quality(high, POLICY)["components"][key])

    def test_invalid_stress(self):
        for ret, turns, bps in (([0.], [], 5.), ([0.], [-1.], 5.),
                                ([0.], [1.], -5.), ([0.], [3000.], 5.)):
            with self.assertRaises(ValueError): stressed_path(ret, turns, bps)

    def test_allocation_example(self):
        q = aggregate([D(20), D(80)], [D(88), D(60)], ["available"]*2)
        self.assertEqual(q["value"], D("65.6"))
        self.assertNotIn("portfolio", q)

    def test_reallocation_example(self):
        q = aggregate([D(30), D(70)], [D(88), D(60)], ["available"]*2)
        self.assertEqual(q["value"], D("68.4"))

    def test_allocation_partial(self):
        q = aggregate([D(60), D(20)], [D(90), None], ["available", "insufficient_data"])
        self.assertIsNone(q["value"])
        self.assertEqual(q["coverage"], D(".75"))
        self.assertEqual(q["bounds"], (D("67.5"), D("92.5")))

    def test_provisional_aggregate(self):
        q = aggregate([D(60), D(20)], [D(90), D(50)], ["available", "provisional"])
        self.assertEqual(q["value"], D(80))
        self.assertEqual(q["provisional_weight"], D(".25"))
        self.assertEqual(q["status"], "provisional")

    def test_stale_excluded(self):
        q = aggregate([D(60), D(20)], [D(90), D(50)], ["available", "stale"])
        self.assertIsNone(q["value"])
        self.assertEqual(q["coverage"], D(".75"))

    def test_zero_allocation(self):
        q = aggregate([D(0)], [None], ["insufficient_data"])
        self.assertEqual(q["status"], "no_allocation")

    def test_capital_and_score_errors(self):
        for capital, scores in (([D(-1)], [D(50)]), ([D(1)], [D(-1)]),
                                ([D(1)], [D(101)]), ([D("NaN")], [D(50)])):
            with self.assertRaises(ValueError): aggregate(capital, scores, ["available"])

    def test_row_order_and_zero_row(self):
        a = aggregate([D(20), D(80)], [D(88), D(60)], ["available"]*2)
        b = aggregate([D(80), D(0), D(20)], [D(60), None, D(88)], ["available"]*3)
        self.assertEqual(a, b)

    def test_diagnostics(self):
        h = group_diagnostics([50, 50], [80, 20], ["a", "b"])
        self.close(h["allocation_hhi"], .5)
        self.close(h["score_hhi"], .68)
        self.close(h["dispersion"], 30)

    def test_clone_invariance(self):
        one = group_diagnostics([100], [80], ["lineage"])
        clones = group_diagnostics([10]*10, [80]*10, ["lineage"]*10)
        for key in one:
            self.close(one[key], clones[key])
        self.close(one["score_hhi"], 1.)

    def test_missing_group_does_not_block_alpha_score(self):
        self.assertIsNone(group_diagnostics([100], [80], [None])["score_hhi"])
        self.assertEqual(aggregate([D(100)], [D(80)], ["available"])["value"], D(80))

    def test_zero_credit(self):
        self.assertIsNone(group_diagnostics([50, 50], [0, 0], ["a", "b"])["score_hhi"])
        self.assertEqual(aggregate([D(50), D(50)], [D(0), D(0)], ["available"]*2)["value"], D(0))

    def test_nav_coverage_partition(self):
        self.assertIsNone(nav_coverage(D(100), D(90), False))
        self.assertEqual(nav_coverage(D(80), D(100), True), D(".8"))
        with self.assertRaises(ValueError): nav_coverage(D(100), D(90), True)

    def test_same_path_same_alpha_and_portfolio_score(self):
        returns = [.02, -.01, .015, -.005]
        alpha_metrics = path_metrics(returns, [0.]*4, [1.]*4, 5., 2)
        portfolio_nav = [100.]
        for r in returns:
            portfolio_nav.append(portfolio_nav[-1] * (1+r))
        portfolio_returns = [b/a-1 for a, b in zip(portfolio_nav, portfolio_nav[1:])]
        portfolio_metrics = path_metrics(portfolio_returns, [0.]*4, [1.]*4, 5., 2)
        self.close(quality(alpha_metrics, POLICY)["value"],
                   quality(portfolio_metrics, POLICY)["value"])

    def test_missing_alpha_score_does_not_block_portfolio_math(self):
        composition = aggregate([D(100)], [None], ["partial_components"])
        metrics = path_metrics([.02, -.01, .015, -.005], [0.]*4, [1.]*4, 5., 2)
        self.assertIsNone(composition["value"])
        self.assertIsNotNone(quality(metrics, POLICY)["value"])

    def test_composite_is_not_mean_raw_scores(self):
        a = [.02, -.015, .03, -.01]
        b = [-.01, .025, -.005, .02]
        portfolio = [(x+y)/2 for x, y in zip(a, b)]  # Fixed BOP weights fixture.
        scores = [quality(path_metrics(r, [0.]*4, [1.]*4, 5., 2), POLICY)["value"]
                  for r in (a, b, portfolio)]
        self.assertFalse(isclose(scores[2], (scores[0]+scores[1])/2, abs_tol=1e-6))

    def test_allocation_delta_decomposition(self):
        w0, w1, q0, q1 = [.2, .8], [.3, .7], [88., 60.], [90., 65.]
        delta = fsum(w*q for w, q in zip(w1, q1)) - fsum(w*q for w, q in zip(w0, q0))
        allocation = fsum((b-a)*(c+d)/2 for a, b, c, d in zip(w0, w1, q0, q1))
        raw = fsum((d-c)*(a+b)/2 for a, b, c, d in zip(w0, w1, q0, q1))
        self.close(delta, allocation+raw)

    def test_endpoints_zero_and_hundred(self):
        maximum = {"net_excess_twr": .2, "stress_excess_twr": .1,
                   "sharpe_period": .3, "mdd": 0., "add": 0., "positive_block_ratio": 1.}
        minimum = {"net_excess_twr": -.5, "stress_excess_twr": -.6,
                   "sharpe_period": -1., "mdd": .5, "add": .1, "positive_block_ratio": 0.}
        self.close(quality(maximum, POLICY)["value"], 100.)
        self.close(quality(minimum, POLICY)["value"], 0.)

    def test_stress_cannot_improve_baseline(self):
        with self.assertRaises(ValueError):
            quality({**FIXTURE, "stress_excess_twr": .07}, POLICY)

    def test_regime_fixture(self):
        historical_mean, effective_n = historical_match([0, .5, 1.], [.02, -.01, .03], .5)
        self.close(historical_mean, .010330732954973661)
        self.close(effective_n, 2.18879507426527)

    def test_regime_abstention(self):
        self.assertIsNone(historical_match([], [], .5))
        self.assertIsNone(historical_match([1e6], [.02], .5))
        self.assertIsNone(historical_match([float("nan")], [.02], .5))
        self.assertIsNone(historical_match([0.], [float("nan")], .5))


if __name__ == "__main__":
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(ScoreTests)
    result = unittest.TextTestRunner(verbosity=1).run(suite)
    if not result.wasSuccessful():
        raise SystemExit(1)
    print(f"PASS: {result.testsRun} tests; QBTS PRB, bands, cost stress, allocation, "
          "direct portfolio path, coverage, group diagnostics, regime.")
```

**Provenance bản người dùng gửi:** bộ reference gốc ngày 2026-10-15 có **44/44 numerical smoke tests PASS**; lượt review đã chạy lại đúng block gốc và đạt cùng kết quả. File người dùng gửi và script gốc được giữ nguyên.

**Kết quả block reference trong bản FINAL sau hardening ngày 2026-10-15: 47/47 tests PASS** (44 tests gốc và 3 regression tests bổ sung). Normalization short-circuit tại endpoints và dùng Decimal cho phép trừ/chia interior để tránh overflow với inputs finite cực lớn. TWR trả `NUMERIC_OUT_OF_RANGE` khi compound overflow/underflow hoặc positive wealth không thể biểu diễn thành float return lớn hơn −1; không tạo bankruptcy giả hoặc complete path giả. Đây là bảo vệ biểu diễn số, không đổi F, anchors, weights, bands hoặc economic semantics. Kết quả được lưu riêng trong `SCORE_FINAL_HARDENING_TEST_RECEIPT_v1.0.json`; script trích đúng block FINAL là `score_v1_1_final_hardened_smoke.py`.

Cả hai lượt chỉ là reference numerical tests; không bao gồm integration/browser/replay/security/calibration tests tại mục 11 và không chứng nhận production financial kernel.


## Ghi chú tích hợp bộ final ngày 2026-10-15

Bản final giữ nguyên formula, weights, bands và quyết định trong file user gửi `SCORE_REGIME_PROPOSAL_v1.1(1).md`; không lấy các con số fixture làm production config. `manager_book`/book trong score chỉ là analytical subject của scope fund/root/portfolios hiện có với consolidation manifest, không thêm entity Book hoặc financial authority mới vào PM. Các tên timestamp không có hậu tố trong bảng khái niệm Regime là shorthand; wire DTO áp dụng UTC epoch-ms và suffix `_ms` theo §8.1.

Readiness/input mapping xem `REVIEW_DECISIONS_AND_PM_DELTA_v1.2_VI.md` §9 và `SCORE_IMPLEMENTATION_FEASIBILITY_REVIEW_v1.0_VI.md`. Hai backend guides v1.2, UX v1.1 và prompts v1.2 cùng dùng specification này. Lượt review giữ provenance 44/44 tests gốc; block FINAL sau hardening đạt 47/47 tests. Đây là validation số học, không phải đo resource, data certification hoặc predictive/market validation.
