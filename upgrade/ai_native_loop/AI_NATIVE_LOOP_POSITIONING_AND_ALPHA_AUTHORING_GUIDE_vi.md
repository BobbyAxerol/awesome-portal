# AI Native Loop — Định vị, kết nối QuantBT Research Loop và hướng dẫn viết Alpha

> **Trạng thái:** tài liệu định hướng (discovery + ý tưởng), **chưa phải spec đã chốt**.
> **Ngày:** 2026-10-07 · **Soạn:** Claude (frontend lead, QuantBT Research Loop), theo yêu cầu của Bobby.
> **Người đọc kế tiếp:** một agent khác sẽ đi sâu hơn: HiFi, spec chi tiết, ý tưởng UI, tích hợp TradingView/MCP, kiến trúc agent.
> **Vị trí:** `upgrade/ai_native_loop/` — *không* thuộc luồng chính `upgrade/research_loop/`. AI Native Loop là phần **đứng trước** QuantBT Research Loop; tài liệu này chỉ mô tả giao diện giữa hai bên.

## 0. Cách đọc tài liệu này

### 0.1 Nhãn độ tin cậy

Mọi khẳng định kỹ thuật dưới đây mang một trong ba nhãn. Agent kế tiếp **phải giữ nguyên các nhãn khi trích lại**.

| Nhãn | Nghĩa |
|---|---|
| **[ĐÃ KIỂM]** | Đọc trực tiếp từ code/contract trong repo, hoặc đã chạy thử (ví dụ ở §8 đã chạy qua analyzer và loader thật của backend). Có đường dẫn file. |
| **[SUY RA]** | Suy từ nguồn gián tiếp (ví dụ mã nguồn engine ở bản sao ngoài repo, doc cũ). Cần xác minh bằng một run thật trước khi dựa vào. |
| **[ĐỀ XUẤT]** | Ý tưởng/thiết kế mới của AI Native Loop. Chưa có người duyệt, chưa có code. |

### 0.2 Thứ tự uy tín khi nguồn mâu thuẫn

1. Code đang chạy + contract sinh ra (`packages/contracts/**`, `apps/control-api/src/research/**`, `apps/portal/backend/src/portal_api/**`).
2. Receipt/evidence mới nhất trong `upgrade/research_loop/evidence/**`.
3. `upgrade/research_loop/RESEARCH_LOOP_GUIDE_V1_1_24_PHASES_vi.md` và `UNIFIED_IMPLEMENTATION_PLAN.md` §13.
4. Các design note cũ — **đặc biệt `upgrade/STRATEGY_IMPORT_AND_RUNTIME_CONTRACT.md` (2026-08-16) đã lỗi thời so với cái đang chạy** (xem §4.1). Đừng dùng nó để viết alpha.

### 0.3 Ba điều agent kế tiếp phải nhớ ngay từ đầu

1. **Hợp đồng alpha thật không phải "pandas + `pos_weight`".** Alpha import là **một file Python thuần giới hạn (restricted Python), không cho `import` bất kỳ thứ gì** (không numpy, pandas, math, random). Nó có một dict `ALPHA_CONTRACT` literal và một hàm nhận `context`, trả về một dict `signal_notional`. Chỉ alpha Delta built-in mới dùng pandas và `pos_weight`; đó là *protected kernel*, không import được.
2. **QuantBT là nguồn sự thật duy nhất cho kết quả.** Mô phỏng trên chart của AI Native Loop chỉ là *bản phác (preview)*, không phải bằng chứng. Mọi con số "lãi/lỗ/Sharpe" đưa cho người dùng phải đến từ một run QuantBT có run id.
3. **Hôm nay imported alpha chỉ chạy route `signal_notional`, nhưng đó là *trạng thái hiện tại*, không phải giới hạn thiết kế.** QuantBT Backtest Loop đi theo hướng **hỗ trợ tối đa** và sẽ **mở dần** các route/endpoint (bracket, orders, portfolio…). AI Native Loop vì vậy **được phép (và nên) khai báo toàn bộ endpoint QuantBT mà alpha có thể dùng**, và tham chiếu thẳng vào QuantBT theo từng version khi viết alpha. Xem §4.7. Những chỗ đang bị "đóng" trong tài liệu này là *chưa mở*, không phải *cấm vĩnh viễn*.

---

## 1. Định vị (Positioning)

### 1.1 AI Native Loop là gì

**AI Native Loop** là không gian nghiên cứu nơi người dùng làm việc *cùng* một nhóm agent AI để đi từ **ý tưởng giao dịch** đến **một file alpha Python đạt chuẩn import**, với chart kiểu TradingView làm bề mặt chính: xem giá, vẽ indicator, thấy tín hiệu vào/ra được mô phỏng ngay trên chart, đối thoại với agent, rồi **nộp** alpha cuối cùng vào QuantBT Research Loop để được kiểm chứng bằng engine thật.

Nó trả lời câu hỏi *"Tôi nên thử alpha nào, và nó nên được viết thế nào?"*. QuantBT Research Loop trả lời câu hỏi *"Alpha này, đã khai báo như vậy, chạy ra kết quả gì và đáng tin tới đâu?"*.

### 1.2 Vị trí trong hệ thống

```text
 Ý tưởng / quan sát thị trường / paper / tín hiệu từ người dùng
                    │
                    ▼
┌───────────────────────────────────────────────────────────────┐
│ AI NATIVE LOOP  (phần đứng trước — tài liệu này)               │
│  Chart + TA + Indicator Lab + Strategy Lab + Agent             │
│  → phác thảo, thử nhanh (preview, KHÔNG phải bằng chứng)       │
│  → soạn file alpha.py (ALPHA_CONTRACT + generate_signals)      │
└───────────────┬───────────────────────────────────────────────┘
                │  nộp: parse → 7 gates → register (DRAFT)  [§4]
                ▼
┌───────────────────────────────────────────────────────────────┐
│ QUANTBT BACKTEST / RESEARCH LOOP  (luồng chính đang làm)       │
│  S02 New Run → S03 Progress → S04 Evidence Hub → S05 Split →   │
│  S06 Search → S07 Freeze → S08 Replay → S09 Report →           │
│  S10 Lineage / S13 Compare → S11 Release Candidate             │
│  Engine: quantbt-engine==1.1.1 (er_quantbt_111)                │
└───────────────┬───────────────────────────────────────────────┘
                │  đọc lại: kết quả đã chạy, các version trước, lineage  [§6]
                ▼
        AI NATIVE LOOP học từ bằng chứng → version kế tiếp
```

Hai chiều của vòng lặp:

- **Xuôi:** AI Native Loop → alpha source → Import → Research Loop.
- **Ngược:** Evidence Hub, Lineage, Compare, Report → ngữ cảnh cho agent → giả thuyết và version mới.

### 1.3 Nguyên tắc định vị (không thương lượng)

| # | Nguyên tắc | Hệ quả thiết kế |
|---|---|---|
| P1 | **AI đề xuất, QuantBT phán quyết.** | Agent không bao giờ báo "alpha này lãi X" nếu không có run id + revision. |
| P2 | **Sketch ≠ Evidence.** | Mọi marker/đường equity mô phỏng trên chart phải mang nhãn "Preview — chưa phải kết quả QuantBT". Khi có run thật, hiển thị **cạnh nhau** (xem §2.4). |
| P3 | **Một file, đúng chuẩn, bất biến.** | Đầu ra cuối là đúng một `.py` theo `research.alpha-source.v1`. Mỗi thay đổi code ⇒ version semver mới. Không "sửa tại chỗ" version đã đăng ký. |
| P4 | **Con người giữ cổng quyết định.** | Activate là ADMIN-only; publish release candidate đi qua luồng P22. Agent không tự activate/publish. |
| P5 | **Trung thực về sự vắng mặt.** | `NOT_PUBLISHED`, `NOT_APPLICABLE`, `PENDING_*` là trạng thái có nghĩa, không phải số 0. Agent phải giữ nguyên khi tóm tắt. |
| P6 | **Không chạm kernel bảo vệ.** | `apps/portal/strategy/**` (Delta RSI) là protected kernel; agent không sửa, không sao chép logic bên trong nó để "đóng gói lại" mà không có duyệt. |
| P7 | **Đo trước khi tin.** | Trước khi hứa một ngữ nghĩa (đơn vị notional, thời điểm khớp), chạy một run thăm dò rẻ và đọc kết quả. Bài học trực tiếp: lỗi Bracket (§5.5). |

### 1.4 Khác biệt với những thứ đã có

| So với | Khác biệt |
|---|---|
| TradingView | TV mô phỏng strategy bằng engine của TV và không có bằng chứng out-of-sample có chữ ký. AI Native Loop chỉ *phác* trên chart; chuẩn xác nhận là QuantBT với protocol Three Window / Walk-forward, seal bất biến và typed absence. |
| Alpha Mining / Alpha Pool (mục sidebar Research) | Đó là các luồng khai thác/kho alpha cho vận hành. AI Native Loop là **nơi tạo** alpha mới có hỗ trợ AI, và đầu ra của nó đi vào cùng cửa Import. |
| QuantBT Import Wizard (S14) | Wizard là cửa nộp bằng tay: dán file → gates → đăng ký. AI Native Loop dùng *lại chính các endpoint đó* làm cổng ra, không tạo đường chạy song song. |

---

## 2. Ý tưởng tổng thể (đề xuất — thoải mái sáng tạo, nhưng tách bạch với sự thật)

> Toàn bộ §2 là **[ĐỀ XUẤT]**, trừ các chỗ ghi rõ nguồn.

### 2.1 Các cửa sổ built-in (workbench)

| Cửa sổ | Việc nó làm | Nguồn dữ liệu có sẵn |
|---|---|---|
| **Chart** (kiểu TradingView) | Nến OHLCV, zoom/pan, nhiều timeframe (1h/4h/1d), lớp phủ indicator, marker vào/ra, vùng tô IS/OOS/Holdout/fold. | `GET /api/v1/research/datasets/catalog-v2`, `.../symbols`, `.../bar-metadata` (dataset `crypto-binance-1m`; bar 1h/4h/1d được resample từ 1m). **[ĐÃ KIỂM]** |
| **Indicator Lab** | Viết/thử indicator thuần (SMA, ATR, RSI, độ biến động…) và xem vẽ trên chart. | Xem §2.3: helper tĩnh của alpha chính là indicator có thể vẽ. |
| **Strategy Lab** | Soạn logic vào/ra (target notional theo thời gian), xem entry/exit ghost trên chart, chỉnh tham số bằng slider trong khoảng `parameter_space`. | Preview executor, §2.2. |
| **Hypothesis Board** | Thẻ giả thuyết ("momentum chỉ ăn khi vol cao"), trạng thái (nháp / đã thử / bác bỏ / còn mở), liên kết tới run id. | Lineage `exercised` / `untried`, §6. |
| **Evidence Reader** | Kéo S04/S06/S07 vào ngay trong workbench: fold bands, selected θ*, what-if grid, drawdown episodes. | Evidence Hub, §6. |
| **Run Inspector** | Tiến độ run (S03), hàng đợi, quota preview, tạo run từ recipe. | S02/S03. |
| **Lineage Map** | Cây attempt/version với `semantic_diff`, và đâu là nhánh chưa thử. | `GET /research/alphas/{id}/lineage`. **[ĐÃ KIỂM]** |
| **Agent Panel** | Hội thoại với các agent; hiện công khai từng bước đã làm (đọc run nào, viết file nào, chạy gate nào). | Mới. |

### 2.2 "Preview parity" — ý tưởng chủ chốt: chạy **đúng file alpha** ngay trên chart

Vì alpha là một ngữ pháp Python **rất nhỏ và tất định** (không import, không IO, không random, tuple float vào, một số ra), có thể chạy *chính file đó* để vẽ chart mà không cần "bản dịch sang Pine":

- **Phương án A (khuyên dùng):** dịch vụ preview phía server dùng **cùng loader** với worker thật (`load_research_alpha_definition`), chạy qua các bar đã index, trả chuỗi `signal_notional` + một tài khoản mô phỏng đơn giản. Ưu điểm: *byte-parity* với child. Cần backend (Codex) cho endpoint mới, ví dụ `POST /api/v1/research/alpha-preview`. **[ĐỀ XUẤT]**
- **Phương án B:** chạy trong trình duyệt (Pyodide hoặc trình thông dịch tập con AST). Nhanh, offline, nhưng phải có test parity chống lại loader thật, nếu không preview sẽ nói dối.

Dù chọn gì, **preview phải khai rõ** cái nó *không* mô phỏng: engine thật tính phí, trượt giá, leverage, funding, lô tối thiểu theo cách riêng (xem §5.3). Preview là *hình dạng của tín hiệu*, không phải PnL.

Đo thử đã chạy cho thấy chi phí thực thi rất rẻ: ví dụ §8 chạy ~1.900 bar với warmup 96 hết ~10 ms **[ĐÃ KIỂM]**, nên preview tương tác (kéo slider tham số, vẽ lại) khả thi.

### 2.3 Indicator Lab miễn phí từ ngữ pháp helper

Ngữ pháp cho phép **helper class chỉ chứa `@staticmethod` thuần** (§4.3). Mỗi static method là một hàm thuần `(tuple, số) -> số`. Workbench có thể:

1. Phân tích AST để liệt kê các helper (`Indicators.sma`, `Indicators.mean_abs_return`…).
2. Chạy từng helper trượt qua chuỗi giá để **vẽ nó như một indicator** (đường, histogram, band) mà agent không cần khai báo thêm kênh "plot" nào trong hợp đồng.
3. Cho người dùng bật/tắt từng helper trên chart để *thấy tại sao* tín hiệu ra như vậy.

Điều này giữ nguyên hợp đồng (file nộp không có kênh plot riêng) nhưng vẫn cho trải nghiệm "vẽ indicator". **[ĐỀ XUẤT]**

### 2.4 Lớp "Preview vs Engine" (đối chiếu sự thật)

Sau khi một run thật hoàn tất, chart hiện thêm các lớp *từ QuantBT*, đặt cạnh preview:

| Lớp | Nguồn thật |
|---|---|
| Equity OOS / drawdown | `GET /api/v1/quantbt/runs/{id}/evidence/series?kind=EQUITY_OOS` (tối đa 192 điểm, có nhãn lấy mẫu) |
| Fold windows IS/OOS/Holdout | S05 Split + `fold_navigation` |
| Replay mô hình hoá (không phải broker) | S08 `execute/replay` hoặc `current-source/replay` |
| Selected θ* và đường tham số | S06/S07, chỉ xem là *"đã chọn"*, không phải *"tối ưu"* |

**Độ lệch giữa preview và engine** (số lệnh, thời điểm khớp, PnL) là một chỉ báo chất lượng của chính preview: nếu lệch lớn, agent phải nói *preview chưa mô hình đúng*, không được che. **[ĐỀ XUẤT]**

### 2.5 Vòng đời một alpha trong AI Native Loop

```text
1 Ý tưởng        người dùng + Hypothesis agent
2 Phác           Chart + Indicator Lab (preview)
3 Soạn           Coder agent viết alpha.py theo §7, tự lint bằng parse + gates (§4.2)
4 Thử rẻ         đăng ký DRAFT → run fixed 1 trial (recipe p17) để kiểm đơn vị/khớp lệnh (P7)
5 Tìm kiếm       chọn recipe search (Three Window / Walk-forward, 2–400 trial) + khai báo parameter_space hẹp, hợp lý
6 Đọc bằng chứng Evidence analyst agent theo playbook §6
7 Phản biện      Critic agent săn lookahead, overfit, claim quá lời
8 Version mới    sửa code ⇒ semver mới ⇒ lại bước 3
9 Thăng cấp      người dùng ADMIN activate; publish RC qua P22 (con người quyết)
```

### 2.6 Đội agent đề xuất

| Vai | Việc | Công cụ nó được dùng |
|---|---|---|
| Orchestrator | Giữ mạch, chia việc, giữ "nhật ký nghiên cứu" cho mỗi alpha. | Mọi API đọc. |
| Hypothesis | Đề xuất giả thuyết từ dữ liệu + lineage `untried`. | Đọc Evidence/Lineage, chart. |
| Coder | Viết/sửa `alpha.py` đúng ngữ pháp. | parse + gates, preview. |
| Critic | Tìm rò rỉ tương lai, overfit, claim quá mức; từ chối bàn giao nếu thiếu bằng chứng. | Checklist §7.8, Evidence. |
| Evidence analyst | Đọc kết quả theo đúng ngữ nghĩa claim (§6.4), tóm tắt trung thực. | Evidence Hub, Compare. |

### 2.7 Ý tưởng mở rộng (để agent kế tiếp cân nhắc)

- **Nhật ký nghiên cứu theo alpha:** mỗi attempt/version kèm giả thuyết, thay đổi (`semantic_diff`), kết quả, bài học. Là *bộ nhớ* cho agent giữa các phiên.
- **"Ngân sách thử nghiệm" hiển thị trước:** cho thấy quota preview (8 manifest đang hoạt động/actor), khoảng trial, tổng trần 6.400 theo fold, để agent không đốt ngân sách vô ích.
- **Đối chiếu nhiều symbol/timeframe:** tận dụng `Compare mode=markets` để kiểm một ý tưởng có phải chỉ khớp một cặp.
- **Kiểm tra độ bền tham số:** dùng what-if grid 9×9 của S07 để thấy đỉnh nhọn hay cao nguyên (Mode 3 flat minima), từ đó khuyên thu hẹp `parameter_space`.
- **Mẫu (template) alpha có chú thích:** bộ khung SMA/mean-reversion/vol-gate đã qua gates, để Coder agent bắt đầu từ cái đã hợp lệ.
- **Hành vi "nhắc tên giả thuyết trong version_note":** `version_note` là văn bản tự do, không cổng nào đọc nó; dùng nó để ghi giả thuyết và run id nguồn.

---

## 3. Hiện trạng QuantBT Research Loop — có gì, khai thác ở đâu

### 3.1 Màn hình và dữ liệu (đều là **[ĐÃ KIỂM]**, trừ khi ghi khác)

Tất cả đường dẫn nằm dưới `/api/v1/…`. Xác thực bằng **session cookie** (`__Host-portal_session`); POST/PATCH cần header CSRF `x-portal-csrf`. Mọi route nhận `workspace_id` tùy chọn (mặc định workspace cá nhân; người không thuộc workspace nhận **404**, không phải 403).

| Màn | Việc | Endpoint chính |
|---|---|---|
| S00 Journey | Bản đồ hành trình | `GET /research/journey` |
| S12 Engine Atlas | Danh mục route/mode/claim của engine (catalogue, **không phải** quyền chạy) | `GET /research/quantbt/atlas` |
| S01 Run Library | Danh sách run, lọc theo `alpha[]`, `status[]`, `mode[]`, `ids[]`, `q` | `GET /quantbt/runs` |
| S02 New Run | Chọn version, dataset, recipe, cửa sổ; preflight; tạo run | `GET /research/runs/version-options`, `GET /research/runs/setup-options`, `POST /research/runs/window-suggestions`, `POST /research/preflights`, `POST /research/runs` |
| S03 Progress | Tiến độ, hàng đợi, console, `requested-spec` | `GET /research/runs/{id}/progress`, `/events` (SSE), `/console`, `/requested-spec` |
| S04 Evidence Hub | Chỉ số lõi, series, claim, native facts | `GET /quantbt/runs/{id}/evidence`, `.../evidence/series?kind=` |
| S05 Split | Cửa sổ IS/OOS/Holdout, fold plan | `GET /quantbt/runs/{id}/split` |
| S06 Search | Bảng trial, chẩn đoán (scatter, importance, prune) | `GET /quantbt/runs/{id}/search?fold=` |
| S07 Freeze | Tham số được chọn, what-if grid | `GET /quantbt/runs/{id}/freeze` |
| S08 Execute | Replay mô hình hoá | `GET /quantbt/runs/{id}/execute/replay` |
| S09 Report v2 | Báo cáo đóng băng, xuất file | `GET /quantbt/runs/{id}/report` |
| S10 Lineage | Cây attempt/version | `GET /research/alphas/{alphaId}/lineage` |
| S13 Compare | So sánh attempts / markets / cặp run | `GET /research/alphas/{alphaId}/compare?mode=attempts\|markets\|pair` |
| S11 Release Candidate | Soạn/seal/publish RC | `GET /quantbt/runs/{id}/release-candidate`, P22 publication |
| S14 Import | Nộp alpha | `POST /research/alphas/import/{parse,gates,register}` |

Mỗi run có hai họ đọc: **lịch sử** (`/quantbt/runs/{id}/…`, `read_authority: PORTAL_PERSISTED_RESEARCH`) và **retained current-source** (`/quantbt/runs/{id}/current-source/…`, `PORTAL_RETAINED_CURRENT_SOURCE`). Chúng có thể khác nhau; không trộn revision (§6.5).

### 3.2 Engine và dữ liệu

| Mục | Giá trị | Nguồn |
|---|---|---|
| Engine | `quantbt-engine==1.1.1`, release `er_quantbt_111` | `portal_api/adapters/quantbt.py` |
| Dataset | `crypto-binance-1m` (nến 1m Binance futures) | recipe table |
| Timeframe cho imported | **chỉ 1h, 4h, 1d** (resample cố định UTC từ 1m; không sinh/sửa bar thiếu) | FULL_05 |
| Cột | `open high low close volume` | contract |
| Symbol có biên nhận cho imported | **BTCUSDT** (Delta built-in thì BTC/ETH/SOL) | FULL_05, NATIVE_ROUTE_PRODUCT_QUALIFICATION |
| Trần dữ liệu | `planning_max_bars` 100.000; `max_span_days` 3.650; WFO folds 2–16; warmup ≤ 4.096 | recipe table |
| Dữ liệu VN (`vn-stock-daily`) | chỉ Delta fixed; imported bị từ chối `IMPORTED_SOURCE_PROFILE_UNQUALIFIED` | FULL_05 |

### 3.3 Protocol, mode, schedule mà imported alpha được chạy

| Protocol | Mode / schedule (trong recipe) |
|---|---|
| Three Window (IS/OOS/Holdout độc lập) | `mode_1_decay / global` |
| Advanced Walk-forward | `mode_1_decay / global`, `per_fold_decay`, `per_fold_causal`; `mode_2_sbb / global`; `mode_3_flat_minima / global`; `mode_4_is_only_robust / global` và `per_fold_causal`; `mode_5_full_robust / global` |

- Mỗi (protocol, mode, schedule) × 3 clock (1h/4h/1d) = một **recipe** cố định (55 recipe cho imported: 27 v1, 27 v2, 1 fixed `p17`). Recipe là descriptor bất biến theo digest.
- **Trial:** v1 đúng 3 (Mode 3 là 5); **v2: 2–400** (Mode 3 từ 5); fixed `p17` đúng 1.
- **Seed khoá = 42** cho mọi recipe search (`ALPHA_RANDOM_SEED_REQUIRED` nếu khác). Recipe fixed thì từ chối seed null khi alpha khai `determinism.seed_required: true`.
- **Ghi đè `parameter_space` chỉ được THU HẸP**, không mở rộng/phát minh (§5.4).
- **Trần tổng trial theo fold:** `trials × số fold ngoài ≤ 6.400` ở các recipe per-fold (xem S02). **[ĐÃ KIỂM]** ở phía giao diện.
- `early_stopping`, `route_params`, `optimization_config` phải rỗng.

### 3.4 Các route của engine — và cái nào dành cho imported

| Route | Imported alpha | Ghi chú |
|---|---|---|
| `signal_notional` | **Có (duy nhất)** | tín hiệu = target notional có dấu |
| `pct_equity` | Không | chỉ Delta built-in (alloc 10% equity) |
| `intrabar_bracket`, `reactive`, `event_driven` | Không | chỉ Delta built-in, BTC/ETH/SOL 1h, 1 lần chạy cố định, ≤ 92 ngày |
| `dca_ladder`, `basket`, `arbitrage`, `portfolio`, `orders`, `fill_replay`, `options`, `nautilus_dca_grid`, `native_event_lifecycle` | Không | engine có, Portal chưa admit cho imported |

> `upgrade/research_loop/evidence/P10/FULL_05_IMPORTED_ALPHA_2026-10-06.md` ghi: "FULL06 other route families remain a separate named, unstarted phase" cho imported: tức là **đã được đặt tên là pha kế tiếp**, chưa bắt đầu. Cột "Imported alpha" ở trên là ảnh chụp hôm nay; Bobby sẽ mở dần. Cách AI Native Loop chuẩn bị cho việc đó: §4.7.

### 3.5 Các quy tắc vận hành ảnh hưởng thiết kế agent

- **Quota preview:** tối đa **8 preflight/manifest đang hoạt động chưa gắn run** cho mỗi actor, TTL 10 phút. Vượt ⇒ `503 RESEARCH_PREFLIGHT_UNAVAILABLE`, `details.gate = preflight_manifest_quota`, có `retry_after_seconds`. Đọc lịch sử **không** tốn quota; tạo preview/run thì có.
- **Hàng đợi/ngân sách tính toán:** recipe v1 CPU 120 s / wall 240 s / RAM 4 GiB; v2 CPU 1.800 s / wall 2.400 s.
- **Hoạt động duy nhất có thật cho tự động hoá:** đăng nhập như một người dùng thật. **Không có MCP, API token, service account** cho Research (đã grep xác nhận), xem §9.3.

---

## 4. Hợp đồng Alpha Import (đang chạy)

### 4.1 Cảnh báo lỗi thời

`upgrade/STRATEGY_IMPORT_AND_RUNTIME_CONTRACT.md` mô tả `alpha.yaml`, entrypoint `pkg.module:Class`, wheel + SBOM + chữ ký, `supported_endpoint_ids`. **Không cái nào trong đó được triển khai cho luồng Research.** Hợp đồng đang chạy là `research.alpha-source.v1` dưới đây. `apps/portal/backend/.../services/alpha_import.py` (quarantine wheel) là đường cũ, alpha vào đó **không bao giờ chạy được**.

### 4.2 Luồng nộp (3 bước + activate)

Controller: `apps/control-api/src/research/alpha-import.controller.ts`, gốc `/api/v1/research/alphas`. **[ĐÃ KIỂM]**

| Bước | Endpoint | Việc |
|---|---|---|
| 1 Parse | `POST /import/parse` | Gửi `{original_filename, source_text, expected_source_digest?, workspace_id?}`. Server lưu nguyên byte, gọi analyzer (HMAC, không bao giờ `import`/thực thi source), trả `research.alpha-source.v1` gồm `source_file_ref`, `source_digest`, `analysis_digest`, `parse_ok`, `mirror[]`, `expires_at_utc_ms`. |
| 2 Gates | `POST /import/gates` | Gửi `{source_file_ref}`. Trả `research.alpha-import-gates.v1`: 7 cổng có thứ tự, fail-closed (cổng sau bị `SKIPPED` nếu cổng trước hỏng), `gate_receipt_id`, `all_pass`. |
| 3 Register | `POST /import/register` | Gửi `{source_file_ref, alpha_id, gate_receipt_id?}`. Chạy lại analyzer và kiểm lại. Tạo version **DRAFT**. Idempotent (replay trả `replayed: true`). |
| Activate | `POST /{alpha_version_id}/activate` | `{expected_alpha_revision}`. **ADMIN-only**, compare-and-swap. DRAFT → ACTIVE, ACTIVE cũ → SUPERSEDED. |
| Danh sách | `GET /research/alphas?workspace_id=` | Registry (bắt buộc `workspace_id`), 200/trang. |

**Giới hạn:** `original_filename` khớp `^[A-Za-z0-9][A-Za-z0-9._-]{0,127}[.]py$`; `source_text` 1 B – 256 KiB; TTL nguồn đã parse mặc định 600 s (60–3600); timeout phân tích 1.500 ms (250–5.000); tối đa 8 nguồn đang hoạt động/actor.

> **Dùng cho AI Native Loop:** `parse` + `gates` là bước **lint** gần như không tác dụng phụ (chỉ lưu nguồn có TTL). Workbench nên chạy chúng liên tục khi agent soạn file, trước khi `register`. **[ĐỀ XUẤT]**

**Bảy cổng (`alpha-import.service.ts:36-44`):**

| # | Cổng | Mã quarantine | Kiểm gì |
|---|---|---|---|
| 1 | `contract-complete` | `QUARANTINED_CONTRACT` | đủ 8 trường của `ALPHA_CONTRACT` |
| 2 | `entrypoint-importable` | `QUARANTINED_ENTRYPOINT` | loader restricted nạp được định nghĩa thuần (không gọi strategy) |
| 3 | `digest-unique` | `QUARANTINED_DIGEST_ALREADY_REGISTERED` | **cùng byte đã đăng ký** ⇒ từ chối ("bump the code, not the label") |
| 4 | `parameter-space-sane` | `QUARANTINED_PARAMETER_SPACE` | ≤ 12 tham số, kind hợp lệ |
| 5 | `determinism-declared` | `QUARANTINED_DETERMINISM` | `determinism` đúng `{"seed_required": bool}` |
| 6 | `data-contract-known` | `QUARANTINED_DATA_CONTRACT` | cột ⊆ OHLCV, timeframe đúng cú pháp |
| 7 | `no-lookahead-static-scan` | `QUARANTINED_LOOKAHEAD` | *heuristic* tên, **không phải chứng chỉ nhân quả** |

### 4.3 Cấu trúc file alpha (ngữ pháp)

**Module scope chỉ được có:** docstring; **một** phép gán literal `ALPHA_CONTRACT = {...}`; các định nghĩa hàm/lớp. Nguồn: `portal_api/services/research_alpha_analyzer.py`, `research_alpha_definition.py`. **[ĐÃ KIỂM]**

**Cấm hoàn toàn:**

- `import` / `from … import` (không có allowlist: *không có thư viện nào*).
- Các node cú pháp: `Import ImportFrom AsyncFunctionDef Lambda With AsyncWith Try Raise Global Nonlocal Yield YieldFrom Await While Delete NamedExpr Match AnnAssign`.
- ⇒ **không `while`, không `try`, không `lambda`**. Vòng lặp dùng `for` + `range`/`enumerate`/`zip`. Comprehension/generator **[SUY RA]**: không nằm trong danh sách cấm và mẫu Delta dùng generator expression, nhưng chưa có test riêng; kiểm bằng gate nếu dùng.
- Tên bắt đầu `__`, và `open eval exec compile globals locals getattr setattr delattr vars dir input breakpoint memoryview`.
- Thuộc tính truy cập tuỳ ý (`.append`, `.shift`, `.iloc`): **chỉ cho phép gọi helper tĩnh đã khai báo** (`Class.method(...)`).
- Đệ quy/vòng tròn giữa các helper; hàm lồng nhau; decorator (trừ `@staticmethod` trong helper class).
- Tham số mặc định, `*args`, `**kwargs`, annotation trên hàm. **Gọi hàm chỉ bằng đối số vị trí** (không keyword, không `*args`).

**Được phép gọi:** `abs bool enumerate float int len max min range round sum zip`, helper có tên của chính file, và `Class.method`.

**Hình dạng hợp lệ:**

- *Dạng đơn:* đúng một hàm entrypoint nhận một tham số vị trí `context`.
- *Dạng tách mục đích:* tối đa **12 hàm module** và **4 helper class**; helper class chỉ chứa `@staticmethod` (tối đa 20 method), không base, không decorator khác, không state.

**Giới hạn kích thước:** 256 KiB; 20.000 node AST; sâu 96; tối đa 12 tham số; không giới hạn số dòng.

### 4.4 `ALPHA_CONTRACT` — 8 trường bắt buộc

| Trường | Quy tắc |
|---|---|
| `schema_version` | đúng `"research.alpha-source.v1"` |
| `version` | semver `^[0-9]+[.][0-9]+[.][0-9]+$`. Nhãn version hiển thị `av_<semver với . → _>`; **không có nhãn tự đặt**. |
| `entrypoint` | tên hàm module-level, một identifier `^[A-Za-z][A-Za-z0-9_]{0,127}$`, phải khớp một `def` trong file |
| `timeframes` | 1–12 chuỗi duy nhất `^[1-9][0-9]*(m\|h\|d\|w)$`. Chỉ `1h/4h/1d` chạy được trong recipe imported. |
| `required_columns` | tập con không rỗng, không trùng của `open high low close volume`. **Chỉ các cột khai ở đây được đưa vào `history`** nên chỉ khai cái cần. |
| `warmup_bars` | số nguyên ≥ 0. Analyzer cho tới 100.000 nhưng **runtime từ chối > 4.096** (`IMPORTED_WARMUP_EXCEEDS_EXECUTOR_LIMIT`). **Luôn giữ ≤ 4.096**; recipe search yêu cầu 1–4.096. |
| `determinism` | đúng `{"seed_required": true|false}` |
| `parameter_space` | dict, ≤ 12 tên khớp `^[A-Za-z][A-Za-z0-9_]{0,63}$` |

`version_note` (tuỳ chọn): văn bản tự do, không cổng nào đọc.

> **Đã giải:** `version` là **bắt buộc** (`research_alpha_analyzer.py` `_validate_contract` liệt kê nó trong tập `required`), và nhãn version được suy từ nó. **[ĐÃ KIỂM]**

**Các kind tham số:**

| Kind | Dạng |
|---|---|
| `fixed` | `{"kind":"fixed","value":…}` |
| `int_range` | `{"kind":"int_range","low":int,"high":int,"step":int}` (cả ba là số nguyên; `low ≤ high`, `step > 0`) |
| `float_range` | `{"kind":"float_range","low":số,"high":số,"step":số}` (hữu hạn) |
| `categorical` | `{"kind":"categorical","values":[1..64 phần tử]}` |

Tham số **được khai báo, không được tự khám phá** từ chữ ký hàm hay thân hàm. Control API cũng nhận dạng tắt cũ `{minimum,maximum,step}` (từ các đăng ký P04), nhưng file mới nên dùng dạng trên.

### 4.5 Hàm entrypoint: context vào, envelope ra

Nguồn: `portal_api/workers/research_child.py:1039-1152`; `services/research_imported_search.py`. **[ĐÃ KIỂM]**

**Vào** (gọi **một lần cho mỗi bar**):

```python
context = {
  "schema_version": "research.imported-alpha-context.v1",
  "timestamp_utc_ms": <int>,
  "bar_index": <int>,
  "history": { "<cột>": (float, float, ...) },   # tuple, chỉ cột trong required_columns
  "parameters": { "<tên>": <số vô hướng> },
  "random_seed": <int>,                           # search: cố định 42; fixed: theo receipt
}
```

- `history[col]` là lát cắt `[index - warmup_bars : index + 1]` (tối đa `warmup_bars + 1` phần tử): **chỉ quá khứ + bar hiện tại, tuyệt đối không có tương lai**.
- Bar có `index < warmup_bars`: **hàm không được gọi**, tín hiệu = 0.0 cưỡng bức.
- Không có state giữa các lần gọi (mỗi bar nhận cửa sổ mới). Muốn trạng thái ⇒ **tính lại từ cửa sổ** (§7.4).

**Ra** (đúng hai khoá):

```python
{"schema_version": "research.imported-signal-notional-output.v1",
 "signal_notional": <int|float hữu hạn, |x| <= 1e12, KHÔNG phải bool>}
```

Mọi thứ khác ⇒ `ALPHA_OUTPUT_CONTRACT_REJECTED` (search) hoặc `ValueError` (fixed).

### 4.6 Vòng đời version

| Trạng thái | Ý nghĩa |
|---|---|
| `DRAFT` | Vừa đăng ký. **Đã chạy được cho evidence run** (adapter gắn lúc đăng ký). Chưa thể publish. |
| `ACTIVE` | Sau activate (ADMIN). Cần để publish release candidate. |
| `SUPERSEDED` | Bị version ACTIVE mới thay thế. |
| `ABANDONED` | Có trong kiểu, chưa thấy chuyển trạng thái nào dẫn tới. |

- Đăng ký luôn tạo `DRAFT` với `supersedes` = version ACTIVE hiện tại của alpha (hoặc null).
- **Bất biến:** cùng `alpha_version_id` + byte/contract khác ⇒ `409 RESEARCH_IMMUTABLE_ALPHA_VERSION_CONFLICT`. Cùng byte ⇒ cổng 3 từ chối. Vì vậy **mỗi thay đổi code cần một `version` semver mới trong file**.
- `alpha_id` khớp `^[a-z][a-z0-9-]{2,63}$`; `alphaVersionId = av_<alpha_id với - → _>_<version với . → _>`.
- **Chữ ký/SBOM:** đang `NOT_PUBLISHED` có chủ ý trong `import_attestation`.

### 4.7 Hướng mở rộng: khai báo tối đa endpoint QuantBT, tham chiếu QuantBT theo từng version

**Nguyên tắc (Bobby, 2026-10-07):** QuantBT Backtest Loop luôn đi theo hướng *hỗ trợ tối đa*; các giới hạn hiện nay là *tạm thời* và sẽ được mở dần. Do đó:

1. **Được phép khai báo hết các endpoint/route QuantBT mà alpha có thể dùng**, kể cả cái Portal chưa admit. Khai báo là *ý định và khả năng* của alpha. **Admission thật vẫn do Portal quyết** (setup-options → preflight → run-admission), nên một route chưa mở sẽ trả **lý do có kiểu** (`PROFILE_NOT_OPENED`, `ALPHA_EXECUTOR_MISMATCH`…), **không** làm hỏng việc đăng ký alpha. Khi route được mở, alpha đã khai sẵn không phải viết lại.
2. **Agent soạn alpha tự tham chiếu vào QuantBT theo đúng version engine** để biết route nào có, cần đầu vào gì, ngữ nghĩa khớp lệnh ra sao, thay vì dựa vào bản tóm tắt trong tài liệu này. Nguồn tham chiếu trong repo, đều theo version:
   - **Engine pin:** `quantbt-engine==1.1.1`, release `er_quantbt_111` (`portal_api/adapters/quantbt.py`). Release kế tiếp sẽ có id mới; agent phải đọc id đang áp dụng, không cứng hoá.
   - **Bề mặt route công khai:** `QuantBTGateway.public_route_surface()` và `route_endpoint(route_id, **kwargs)` (14 route: `signal_notional`, `pct_equity`, `intrabar_bracket`, `dca_ladder`, `reactive`, `event_driven`, `native_event_lifecycle`, `orders`, `fill_replay`, `basket`, `arbitrage`, `portfolio`, `nautilus_dca_grid`, `options`). **[ĐÃ KIỂM]**
   - **Engine Atlas** (`GET /api/v1/research/quantbt/atlas`): mỗi route có `execution_contract`, `required_input_class`, `report_levels`, `engine_facts` kèm **source locator** (file, khoảng dòng, digest của wheel RECORD, chuỗi xuất hiện trong khoảng đó) và, từ 2026-10-07, `recipes_enabled` + `axes_scope`. Đây là cách *tra cứu có bằng chứng* từ chính engine. **[ĐÃ KIỂM]**
   - **Capability manifest:** `apps/portal/registry/engine-capabilities.v1.json` (protocol/endpoint được certify).
   - **Mã nguồn engine theo version** (gói đã cài; đọc `endpoint.py`, `core/execution_contract.py`, `core/intrabar_reference.py`…) để biết đơn vị và khớp lệnh. **Bài học Bracket (§5.5):** ngữ nghĩa đơn vị phải *đọc từ engine hoặc đo*, không đoán.
3. **Ranh giới an toàn giữ nguyên:** admission, recipe bất biến theo digest, seal, typed absence và claim không bị nới. "Hỗ trợ tối đa" nghĩa là *mở rộng những gì được phép thử*, không phải bỏ kiểm chứng.

**Điểm mở rộng đã có sẵn trong code [ĐÃ KIỂM]:** analyzer trả "mirror" 14 hàng; bốn hàng `structural_contract`, `supported_endpoint_ids`, `execution_contracts`, `output_contract` hiện có trạng thái `not_in_contract` kèm ghi chú "not in v1" (`research_alpha_analyzer.py` ~dòng 557). Đây chính là chỗ hợp đồng v2 sẽ khai: alpha hỗ trợ route nào, hợp đồng thực thi nào, dạng đầu ra nào. Design note cũ (`STRATEGY_IMPORT_AND_RUNTIME_CONTRACT.md` §2) đã phác các trường tương ứng (`supported_endpoint_ids`, `execution_contracts`, `output_contract`, `structural_contract`) và có thể dùng làm điểm xuất phát, *đã lỗi thời ở các phần khác*.

**Đề xuất hợp đồng v2 (chưa có người duyệt, chưa có code) [ĐỀ XUẤT]:**

```python
ALPHA_CONTRACT = {
    # ... 8 trường v1 giữ nguyên ...
    "supported_endpoint_ids": ["signal_notional", "intrabar_bracket", "orders"],   # khai tối đa
    "execution_contracts":    {"signal_notional": "close_target_v2",
                               "intrabar_bracket": "intrabar_bracket_v1"},
    "output_contract":        {"signal_notional": "research.imported-signal-notional-output.v1",
                               "intrabar_bracket": "<schema do QuantBT/Portal công bố>"},
    "structural_contract":    {...},   # bất biến theo version, để audit
}
```

- Mỗi route khai phải có **hàm đầu ra tương ứng** (ví dụ `generate_intents(context)` cho bracket) hoặc một envelope do Portal công bố; ngữ pháp sandbox mở rộng tương ứng.
- Cổng mới đề xuất: *route-declared-known* (route có trong `public_route_surface` của release đang áp dụng) và *output-contract-per-route* (đúng schema). Route đã khai nhưng chưa mở ⇒ **cảnh báo**, không chặn.

**Điều agent kế tiếp phải biết ngay hôm nay (v1):** analyzer **không** từ chối khoá lạ ở top-level `ALPHA_CONTRACT` (chỉ kiểm tập bắt buộc). Khoá lạ được mang trong `declared_contract` (làm đổi `analysis_digest`) nhưng phép chiếu khai báo phía Control API có thể bỏ qua chúng, và không ai đọc. ⇒ **Đừng đặt `supported_endpoint_ids`… vào file nộp thật cho tới khi schema v2 tồn tại**; ghi ý định vào `version_note` (văn bản tự do) và vào tài liệu thiết kế. Khi v2 ra, agent soạn alpha dùng chính bộ khai báo ở trên.

**Việc cần phối hợp:** hợp đồng v2, cổng mới và việc mở route cho imported là backend (Codex) + quyết định của Bobby; AI Native Loop chỉ cần giữ alpha *sẵn sàng* và tham chiếu QuantBT theo version.

---

## 5. Alpha thực sự chạy thế nào

### 5.1 Đường thực thi và sandbox **[ĐÃ KIỂM]**

1. Worker lấy **đúng byte bất biến** của source qua lệnh gọi nội bộ gắn lease (`POST /internal/research/progress/sources/imported`), kiểm sha256/entrypoint/kích thước.
2. Child process chạy bằng `unshare -Urnmpf --mount-proc python -I …` (namespace user/net/mount/pid ⇒ **không có mạng**), rlimit CPU/RAM/file/fd, tmpfs scratch.
3. Loader AST nạp chỉ các định nghĩa đã duyệt; `__builtins__` chỉ gồm tập an toàn + `staticmethod`.
4. Hàm được gọi từng bar; chuỗi tín hiệu đưa vào endpoint `signal_notional` của QuantBT. **QuantBT sở hữu khớp lệnh, phí, kế toán.**

### 5.2 Hệ quả cho "thư viện"

pandas, numpy, scipy, `ta`, `math`, `random`, `time`, `os`: **không dùng được**. Muốn RSI/ATR/EMA/độ lệch chuẩn… **phải tự viết bằng Python thuần trên tuple**, như mẫu Delta (`DeltaRsiIndicators`). Không có `math.sqrt`/`math.log`: dùng `x ** 0.5`, và với log/exp phải tự xấp xỉ hoặc tránh. Có comprehension và `sum/min/max/abs/round/zip/enumerate/range`.

> **[ĐỀ XUẤT yêu cầu backend]** Một bộ helper số học chuẩn "được duyệt sẵn" (log, exp, sqrt, EMA…) có thể được đưa vào ngữ pháp, nếu muốn Coder agent viết TA phong phú mà không tự phát minh lại. Cần Codex + review an ninh.

### 5.3 Kế toán và thời điểm khớp lệnh

Tài khoản của route imported `signal_notional` **[ĐÃ KIỂM]** (`research_child.py:1118-1124`): vốn đầu 20.000; đòn bẩy 3; `alloc_per_trade` 2.000; phí một chiều 0,0005 (5 bp); funding tắt; trượt giá mặc định của `ExecutionConfig` 0,0001 (1 bp) cho signal_notional **[ĐÃ KIỂM]**, riêng recipe pct_equity của Delta ghim 0.

**Thời điểm khớp (hợp đồng `close_target_v2`) [SUY RA — từ mã nguồn engine ở bản sao ngoài repo, chưa có doc trong repo]:** `signal_phase = BAR_CLOSE`, `entry_fill_phase = SAME_CLOSE`. Nghĩa là mục tiêu tính từ lịch sử *bao gồm close của bar t* sẽ **khớp tại close của bar t**; engine **không** tự thêm độ trễ một bar. Mẫu Delta trả về target của bar *trước* để giữ nhân quả.

> **Hệ quả bắt buộc cho agent:** mặc định, **tính tín hiệu từ lịch sử đã loại bar hiện tại** (`close[:-1]`) trừ khi có lý do chủ ý và có bằng chứng rằng khớp tại close hiện tại là thực tế được. Đây vừa là kỷ luật nhân quả, vừa tránh một kiểu rò rỉ tinh vi mà gate tĩnh không bắt được.

**Đơn vị notional của `signal_notional` [CHƯA KIỂM TRỰC TIẾP — phải đo]:** một báo cáo nói notional hiệu dụng là chính giá trị `signal_notional` (mẫu phát ±1000), không nhân với `alloc_per_trade`. Nhưng **bài học Bracket** cho thấy một tham số nhân (`entry_size × alloc_per_trade`) có thể làm một route không khớp lệnh nào. ⇒ **Trước khi tin ngữ nghĩa kích cỡ, chạy một run `p17` cố định 1 trial và đối chiếu equity/replay.**

### 5.4 Ghi đè tham số khi chạy

Nguồn: `portal_api/domain/research_imported_search.py:85-148`, `run-admission.service.ts`. **[ĐÃ KIỂM]**

- Ghi đè chỉ được **thu hẹp**: `fixed` chỉ nhận `pin` bằng đúng giá trị; `categorical` chỉ `pin` vào một giá trị đã khai; `int_range`/`float_range` nhận `pin` nằm trên lưới, hoặc `sweep` có `low`/`high` đều nằm trên lưới và `low ≤ high` (bước kế thừa).
- Tên lạ ⇒ `ALPHA_PARAMETER_NOT_DECLARED`. Ngoài khai báo ⇒ `ALPHA_PARAMETER_OUTSIDE_DECLARATION`.
- **Chỉ tham số số vô hướng được search:** string/bool/null ⇒ `IMPORTED_NON_NUMERIC_SEARCH_NOT_QUALIFIED`; categorical lẫn int/float ⇒ `IMPORTED_MIXED_NUMERIC_CATEGORY_NOT_QUALIFIED`; categorical không pin dưới `mode_3_flat_minima` ⇒ `IMPORTED_CATEGORICAL_CENTROID_NOT_APPLICABLE`.
- **Recipe fixed `p17`:** mọi tham số không `fixed` **phải được pin** (`IMPORTED_PARAMETER_PIN_REQUIRED`); không sweep.

### 5.5 Bài học Bracket: "đơn vị là một phần của hợp đồng"

Route `intrabar_bracket` của Delta từng cho **0 fills ở 13 run thật** vì adapter đặt `entry_size = 2000` trong khi chế độ `fixed_notional` hiểu `entry_size` là *hệ số nhân* (`notional = alloc_per_trade × |entry_size|`). Bobby xác nhận trực tiếp trên QuantBT (package đúng). Chi tiết ở `upgrade/research_loop/CODEX_BACKEND_GAPS_2026-09-30.md` §44 (BR-S02-18). **Hai bài học cho agent:**

1. Một kết quả "0 giao dịch" không có nghĩa "không có tín hiệu"; kiểm đơn vị và cấu hình endpoint trước khi kết luận.
2. Đừng suy diễn từ nhãn: số đếm "Position regimes (engine)" ≠ số lệnh khớp.

---

## 6. Đọc dữ liệu để học từ run và version trước (Evidence Hub playbook)

### 6.1 Điều kiện truy cập

- Chỉ **session cookie** của một người dùng thật; luôn gửi `workspace_id` tường minh. Actor = người dùng đăng nhập; **P22 quy định không service account nào được đóng vai người khác**.
- Đọc lịch sử **không tiêu quota preview**.
- Giới hạn byte/đếm: series tối đa 192 điểm; quan sát tối đa 2M; tham số trial tối đa 24; fold tối đa 256 (4.096 trong compare); Run Library 50/trang; Search/Replay ≤ 200/trang; Lineage ≤ 128/trang; số thập phân là **chuỗi** ≤ 96 ký tự, không bao giờ float.
- Mọi đọc có thể `304` theo ETag (`W/"p13h1_…"`, `"p13r1_…"`); đọc đã seal là bất biến.

### 6.2 Thứ tự đọc khuyên dùng

```text
Bước 1  Tìm run liên quan      GET /quantbt/runs?alpha[]=<alpha_id>&status[]=COMPLETED
                               (không có filter version: lọc theo alpha rồi đọc binding.alpha_version_id)
Bước 2  Bối cảnh version       GET /research/alphas/{alphaId}/lineage
                               → attempts[].semantic_diff, versions[].exercised / untried
Bước 3  Tổng quan một run      GET /quantbt/runs/{id}/evidence       (Hub)
                               → core, metrics[], claims, stages, run_declaration, native_execution
Bước 4  Độ bền theo fold       evidence → fold_verdicts (decay, oos_trades, drawdown, verdict, failed_criteria)
Bước 5  Không gian tìm kiếm    GET /quantbt/runs/{id}/search?fold=N
                               → diagnostics: scatter, parameter_frequency, progression, prune_reasons, importance, interactions
Bước 6  Tham số được chọn      GET /quantbt/runs/{id}/freeze
                               → frozen_selection, parameter_authority {declared, code_fixed}, what_if (9×9)
Bước 7  Hành vi thực thi       GET /quantbt/runs/{id}/execute/replay (mô hình hoá, không phải broker)
Bước 8  So sánh                GET /research/alphas/{alphaId}/compare?mode=pair&runs=a,b  hoặc mode=markets
Bước 9  Tái hiện               GET /research/runs/{id}/requested-spec  (→ `clone` để dựng lại declaration)
```

### 6.3 Những tín hiệu giàu thông tin nhất cho việc *cải thiện alpha*

| Tín hiệu | Nguồn | Gợi ý cho giả thuyết mới |
|---|---|---|
| **Decay IS→OOS** theo fold | `fold_verdicts[].decay`, `oos_sharpe` vs `is_sharpe` | Decay lớn ở mọi fold ⇒ nghi overfit tham số; thu hẹp `parameter_space`, giảm số tham số. |
| **Một vài fold thua nặng** | `worst_return_fraction`, `max_drawdown_fraction`, `drag_target` | Có thể là regime (vol/xu hướng); thử cổng chế độ. |
| **`parameter_frequency`, `importance`, `interactions`** | S06 `diagnostics` | Tham số nào thật sự quan trọng; bỏ/ghim tham số vô nghĩa. |
| **`prune_reasons`** | S06 | Vùng tham số hay bị cắt sớm ⇒ không gian khai báo quá rộng/vô lý. |
| **Plateau vs đỉnh nhọn** | S07 what-if 9×9 (`NONE_SNAP_TO_NODE`, `MODE_1_DECAY_J`) | Đỉnh nhọn ⇒ mong manh; ưu tiên Mode 3 flat minima. |
| **`exercised` / `untried`** | lineage theo version | Khoảng trống chưa thử (route/mode/dải tham số): nguồn giả thuyết tự nhiên. |
| **`semantic_diff`** giữa attempt cha-con | lineage | Học "thay đổi nào làm kết quả đổi". |
| **Trade/regime count thấp** | `TRADE_COUNT` = *position regimes*, `oos_trades` | Quá ít sự kiện ⇒ kết quả không có sức nặng thống kê. |
| **Chi phí** | `native_execution.fees`/`funding` (Delta native), metrics | Alpha giao dịch dày dễ bị phí 5 bp + trượt 1 bp ăn hết. |

### 6.4 Quy tắc diễn giải claim — agent **không được** nói quá

Từ `claim-family.ts`, `methodology-claims.ts`, guide §6.3: **[ĐÃ KIỂM]**

- **"Tốt nhất" thô ≠ "được chọn".** Per-fold selected **không** phải một θ* toàn cục.
- Bậc claim: `STRICT_OUTER_OOS` (hạng 4) chỉ khi nguồn nói `strict_nested_fold_local_retraining`; `WALK_FORWARD_OOS_COMPATIBILITY` (hạng 3); còn lại `NOT_PUBLISHED`.
- OOS dùng để chọn phải được công bố; kết quả hồi cứu không phải strict outer OOS; **Mode 5 là hiệu chỉnh trên toàn mẫu, không có OOS độc lập**; Mode 2 IS-only không phải bằng chứng OOS.
- **Holdout đã dùng thì không "chưa đọc"**; mở khoá không nâng claim.
- What-if grid là *xem trước*, snap vào nút; replay là mẫu mô hình, **không phải trạng thái broker**.
- Chứng nhận trong Report hiện luôn `NOT_PUBLISHED` (`P18_NO_SOURCE_PUBLISHES_A_CERTIFICATION_GRADE`); không suy ra từ release engine.
- `NOT_PUBLISHED`/`NOT_APPLICABLE`/`PENDING_*` giữ nguyên; **vắng mặt không bao giờ là 0**.
- `FORECAST` (Atlas) chỉ đúng cho đúng release/mode/schedule, không phải sự thật đã phát hành.

### 6.5 Hai quy tắc kỹ thuật khi đọc

1. **Không trộn revision:** series có `revision` khác Hub ⇒ bỏ và đọc lại Hub. Đừng ghép dữ liệu `historical` với `current-source`.
2. **Dùng đúng đường đọc:** run ngoài profile được admit trả `200 research.current-source-not-applicable.v1` (typed), và `409 RESEARCH_CURRENT_SOURCE_CONFLICT` kèm `details.lane_state` (`PENDING_SOURCE`, `PENDING_RETENTION`, `NOT_RETAINED_LEGACY`, `NOT_RETAINED_TERMINAL`).

---

## 7. Hướng dẫn và quy tắc cho Authoring Agent (Coder + Critic)

### 7.1 Mục tiêu và phong cách

**Mục tiêu:** một file `.py` **nhỏ, đọc được, tất định, nhân quả**, có ít tham số có ý nghĩa, đi qua 7 gates, và đủ "trung thực" để protocol Walk-forward của QuantBT đánh giá công bằng.

**Phong cách (mượn từ mẫu Delta RSI):**

- **Tách mục đích:** `ALPHA_CONTRACT` → các helper class tĩnh (`Parameters`, `Indicators`, `Policy`) → hàm entrypoint mỏng chỉ ghép các phần.
- **Đọc tham số tường minh** (`int(parameters["window"])`), **không có giá trị mặc định ngầm**.
- **Tính lại từ cửa sổ:** tính chỉ báo và state từ đầu cửa sổ `history` mỗi lần gọi.
- **Trả về tín hiệu chuẩn hoá** (ví dụ trọng số −1/0/+1 nhân một notional cố định đã khai `fixed`).
- **Đặt tên trung tính:** không dùng `future`, `lead`, `lookahead` làm tên biến/thuộc tính (gate tĩnh khớp đúng các tên này, không khớp chuỗi con).

### 7.2 Quy tắc cứng (vi phạm ⇒ gate hỏng hoặc run hỏng)

| # | Quy tắc |
|---|---|
| R1 | **Không `import`.** Mọi indicator viết tay bằng Python thuần trên tuple. |
| R2 | Không `while/try/lambda/with/global/yield/await/match`, không keyword argument, không default/`*args`. |
| R3 | Entrypoint đúng tên khai trong `ALPHA_CONTRACT["entrypoint"]`, **một tham số `context`**. |
| R4 | `ALPHA_CONTRACT` **literal**, gán đúng một lần, **không đọc nó trong thân hàm**. |
| R5 | Khai `required_columns` **tối thiểu cần dùng**; chỉ cột đó vào `history`. |
| R6 | `warmup_bars` ≥ lookback dài nhất thực sự dùng **và ≤ 4.096**. Bar `< warmup` bị ép 0 mà không gọi hàm. |
| R7 | Trả về **đúng** `{schema_version, signal_notional}`; `signal_notional` hữu hạn, không bool, `|x| ≤ 1e12`. |
| R8 | Không dùng bất kỳ nguồn ngẫu nhiên/thời gian/IO nào (đằng nào cũng không tồn tại). Tất định theo `context`. |
| R9 | **Mỗi thay đổi code ⇒ `version` semver mới.** Không sửa version đã đăng ký; không đăng ký lại byte giống hệt. |
| R10 | `parameter_space` ≤ 12 tham số; tham số search phải là **số vô hướng**; không lẫn int/float trong categorical. |
| R11 | Không phụ thuộc state ngoài cửa sổ (không biến toàn cục, không class có state). |
| R12 | Thời gian chạy: mỗi lần gọi nên O(warmup). Ngân sách child 120 s CPU (v1) / 1.800 s (v2) cho toàn bộ số bar × trial. |

### 7.3 Khai báo `parameter_space` cho tìm kiếm có nghĩa

- **Ít mà chắc:** 3–6 tham số có ý nghĩa kinh tế rõ; mỗi tham số thêm là một chiều overfit.
- **Dải hợp lý, không cực rộng:** ghi đè chỉ thu hẹp được, nên khai dải *đủ rộng cho nghiên cứu* nhưng không phi lý (tránh vùng mà `fast ≥ slow`; nếu không tránh được thì xử lý trong code bằng nhánh trả 0, như mẫu §8).
- **`step` có nghĩa:** lưới thô để tối ưu hoá hội tụ và plateau đọc được; `step` quá nhỏ chỉ tạo nhiễu.
- Dùng `fixed` cho mọi hằng số "kích thước/đơn vị" (ví dụ `notional`) để chúng không bị quét.
- Với recipe fixed `p17` mọi tham số không `fixed` **phải pin**; hãy kèm trong ghi chú các pin gợi ý.

### 7.4 Mẫu thiết kế khi không có state

QuantBT không giữ state giữa các lần gọi. Với logic có trạng thái (trailing stop, giữ vị thế N bar, vào/thoát có trễ):

- **Phát lại máy trạng thái trên cửa sổ:** `for i in range(...)` đi từ đầu cửa sổ tới bar hiện tại, cập nhật `position`, `entry_price`, `bars_held`, và trả `position * notional` ở cuối. Chi phí O(warmup) mỗi bar, chấp nhận được.
- **Mô phỏng stop/take-profit ở mức bar-close:** so sánh `close` với mức vào ± phần trăm *trong vòng lặp phát lại*. **Không có khớp nội bar** (route bracket đóng với imported); phải ghi rõ trong `version_note` rằng đó là xấp xỉ.
- Cần `warmup_bars` đủ dài để máy trạng thái "hội tụ" độc lập với điểm bắt đầu cửa sổ.

### 7.5 Tính nhân quả — danh mục kiểm

- Mọi chỉ báo chỉ dùng dữ liệu **≤ bar quyết định**. Khuyên: dùng `known = close[:-1]` (bar đã đóng *trước* bar hiện tại) vì khớp là `SAME_CLOSE` **[SUY RA]**.
- Không `shift(-n)`; không chỉ số dương vượt cuối cửa sổ.
- Không chuẩn hoá bằng thống kê trên *toàn chuỗi* (chỉ trong cửa sổ).
- Không dùng chính `timestamp_utc_ms` hay `bar_index` để "nhớ" thông tin ngoài dữ liệu (ví dụ cứng hoá ngày sự kiện biết trước).
- Gate tĩnh chỉ bắt tên `lookahead/future/lead` và `shift(-n)`: **không đủ**. Critic phải xem xét thủ công, và cách thật sự bảo đảm là cấu trúc: hàm chỉ nhận lịch sử quá khứ + hiện tại.

### 7.6 Thiết kế thân thiện với Walk-forward

- Tín hiệu **ổn định theo tham số**: nếu đổi `slow` 40→42 làm kết quả sụp đổ, đó là đỉnh nhọn; Mode 3 flat minima sẽ phơi bày.
- Tránh số giao dịch quá ít: quá ít "position regimes" ⇒ không đủ sức thống kê trong từng fold OOS.
- Cân nhắc chi phí: phí 5 bp/chiều + trượt 1 bp làm chết chiến lược đổi vị thế mỗi vài bar; thêm **vùng chết (hysteresis)** hoặc thời gian giữ tối thiểu.
- Mỗi protocol có ý nghĩa khác: Three Window cần cửa sổ đủ dài cho IS/OOS/Holdout; Walk-forward cần đủ fold (2–16) với frequency/window mode phù hợp.

### 7.7 Quy trình soạn → nộp

```text
1. Soạn file theo mẫu §8 (bắt đầu từ cái đã hợp lệ, sửa dần).
2. Lint liên tục: POST /import/parse rồi /import/gates (đọc từng gate; sửa theo message).
3. Đo rẻ: preview (nếu có) → đăng ký DRAFT → run p17 fixed, 1 trial, một cửa sổ ngắn.
   Kiểm: có giao dịch không? Đơn vị notional khớp kỳ vọng? Tín hiệu có lệch 1 bar không?
4. Tìm kiếm: chọn recipe search; thu hẹp parameter_space nếu cần; seed khoá 42.
5. Đọc bằng chứng theo §6; Critic phản biện (§7.8).
6. Sửa ⇒ version mới ⇒ lặp. Chỉ trình người dùng ACTIVATE khi có bằng chứng đáng tin.
```

### 7.8 Checklist của Critic (phải qua hết trước khi bàn giao)

- [ ] Không `import`/cú pháp cấm; **7/7 gates pass** trên đúng byte sắp nộp.
- [ ] `warmup_bars` ≤ 4.096 và ≥ lookback lớn nhất; chỉ khai cột cần.
- [ ] Không rò rỉ tương lai; đã dùng `close[:-1]` hoặc có lý do ghi rõ; không tên cấm.
- [ ] Đã có **một run thăm dò** xác nhận: có giao dịch, đơn vị đúng, số bar/giao dịch hợp lý.
- [ ] Số tham số ≤ 6 (khuyến nghị), dải hợp lý, `fixed` cho hằng số.
- [ ] `version` mới; `version_note` ghi giả thuyết + run id nguồn.
- [ ] Mọi con số trong báo cáo cho người dùng có `run_id` + `revision`; không có từ "tối ưu" cho kết quả per-fold/raw-best.
- [ ] Đã nêu rõ giới hạn: chỉ `signal_notional`, bar-close, BTCUSDT/1h-4h-1d, không có khớp nội bar.

### 7.9 Phác thảo "system prompt" cho Coder agent (để agent kế tiếp tinh chỉnh)

```text
Bạn viết MỘT file Python alpha cho QuantBT Research Loop theo `research.alpha-source.v1`.

BẠN PHẢI:
- Không import gì cả. Tự viết indicator bằng Python thuần trên tuple float.
- Có đúng một ALPHA_CONTRACT literal với 8 trường (schema_version, version, entrypoint,
  timeframes, required_columns, warmup_bars<=4096, determinism, parameter_space<=12).
- Một hàm entrypoint nhận `context`, trả {"schema_version":"research.imported-signal-notional-output.v1",
  "signal_notional": <float hữu hạn>}.
- Chỉ dùng: abs bool enumerate float int len max min range round sum zip, helper tĩnh của chính file.
- Không while/try/lambda/with/keyword-args/default-args. Chỉ for/if/comprehension.
- Tính tín hiệu từ lịch sử ĐÃ ĐÓNG trước bar hiện tại (close[:-1]) trừ khi được yêu cầu khác.
- Mỗi thay đổi code => tăng semver `version`.

BẠN KHÔNG ĐƯỢC:
- Hứa lãi/Sharpe/"tối ưu" nếu không có run_id + revision từ QuantBT.
- Dùng chart preview làm bằng chứng.
- Sửa kernel Delta RSI, activate hay publish.

TRƯỚC KHI BÀN GIAO: chạy parse+gates, một run p17 thăm dò, đưa checklist §7.8.
```

---

## 8. Mẫu alpha tối thiểu (đã kiểm)

**Đã chạy:** qua `analyze_alpha_source` của backend thật ⇒ `parse_ok = True` và **cả 6 gate của analyzer đều đạt**; nạp bằng `load_research_alpha_definition`, chạy qua 1.904 bar tổng hợp (có nhánh vào lệnh long, trả đúng envelope). **Chưa** chạy qua QuantBT engine; đây là *mẫu hình dạng*, **không phải một alpha có edge**. File cùng nội dung: [`examples/sma_regime_example.py`](./examples/sma_regime_example.py).

```python
"""Minimal valid imported alpha: SMA crossover with a volatility gate (illustrative template)."""

ALPHA_CONTRACT = {
    "schema_version": "research.alpha-source.v1",
    "version": "1.0.0",
    "entrypoint": "generate_signals",
    "timeframes": ["1h", "4h", "1d"],
    "required_columns": ["close"],
    "warmup_bars": 96,
    "determinism": {"seed_required": False},
    "parameter_space": {
        "fast": {"kind": "int_range", "low": 5, "high": 20, "step": 1},
        "slow": {"kind": "int_range", "low": 24, "high": 80, "step": 2},
        "gate": {"kind": "float_range", "low": 0.002, "high": 0.02, "step": 0.002},
        "notional": {"kind": "fixed", "value": 1000},
    },
}


class Indicators:
    @staticmethod
    def sma(values, length):
        return sum(values[-length:]) / length

    @staticmethod
    def mean_abs_return(values, length):
        window = values[-(length + 1):]
        total = 0.0
        for index in range(1, len(window)):
            total = total + abs(window[index] / window[index - 1] - 1.0)
        return total / length


def generate_signals(context):
    close = context["history"]["close"]
    parameters = context["parameters"]
    fast = int(parameters["fast"])
    slow = int(parameters["slow"])
    gate = float(parameters["gate"])
    notional = float(parameters["notional"])
    known = close[:-1]
    target = 0.0
    if fast < slow and len(known) > slow:
        if Indicators.mean_abs_return(known, slow) >= gate:
            if Indicators.sma(known, fast) > Indicators.sma(known, slow):
                target = notional
            else:
                target = -notional
    return {"schema_version": "research.imported-signal-notional-output.v1", "signal_notional": target}
```

**Điểm cần chú ý trong mẫu:** không import; helper tĩnh thuần; gọi bằng đối số vị trí; `fast < slow` được bảo vệ trong code vì dải tham số chồng nhau; dùng `close[:-1]`; `notional` là `fixed`; `warmup_bars` (96) ≥ `slow` lớn nhất (80) + 1 bar so sánh.

**Mẫu tham chiếu đầy đủ trong repo:** `apps/portal/frontend/src/research/samples/deltaRsiReference.py` (+ `upgrade/research_loop/examples/DELTA_RSI_REFERENCE.md`): 8 tham số, ba helper class tĩnh, warmup 256, pin gợi ý `window=32, rsi_l=20, signalLength=9, len_atr1=10, len_atr2=42, rvol=1.6, len_vol=16, slpercent=1.3`. Đây **không** byte/parity-identical với kernel Delta bảo vệ.

---

## 9. Đề xuất kiến trúc kết nối

### 9.1 Các điểm tích hợp (tất cả dùng API sẵn có)

| Việc | Dùng | Ghi chú |
|---|---|---|
| Lint alpha | `POST /research/alphas/import/parse`, `/gates` | không tác dụng phụ ngoài lưu nguồn có TTL (600 s) |
| Đăng ký | `POST /research/alphas/import/register` | tạo DRAFT, không activate |
| Chọn recipe/cửa sổ | `GET /research/runs/version-options`, `setup-options`, `POST window-suggestions` | `version-options` không cần dataset (đọc sớm) |
| Chạy | `POST /research/preflights` → `POST /research/runs` | tiêu quota (8 preflight/actor) |
| Theo dõi | `GET /research/runs/{id}/progress`, SSE `events` | |
| Học | Evidence Hub, Search, Freeze, Lineage, Compare | §6 |
| Thăng cấp | Activate (ADMIN), P22 publish | **con người** |

### 9.2 Dịch vụ mới cần có (đề xuất, thuộc backend)

| Mã | Mô tả | Lý do |
|---|---|---|
| AN-BE-01 | `POST /research/alpha-preview`: chạy cùng loader với worker trên bar đã index, trả chuỗi `signal_notional` + tài khoản mô phỏng đơn giản. | Preview parity (§2.2) |
| AN-BE-02 | Endpoint nhẹ "dry-run 1 bar/1 cửa sổ" cho đo đơn vị notional, không tạo run bền vững. | Giảm đốt quota khi thăm dò |
| AN-BE-03 | Mở dần route khác cho imported (bracket/orders…) theo hợp đồng v2 (§4.7), hoặc một "bộ stop/TP khai báo". | Mô phỏng vào/ra như TradingView |
| AN-BE-04 | Bộ helper số học duyệt sẵn (log/exp/sqrt/EMA) trong ngữ pháp. | TA phong phú, ít sai |
| AN-BE-05 | Cơ chế **ủy quyền cho agent** (xem §9.3). | Hiện chưa có |

### 9.3 Vấn đề xác thực của agent (quyết định cho Bobby/Codex)

Hiện **không có MCP, API token hay service account** cho Research; chỉ có session cookie người dùng + CSRF. P22 cấm service account đóng vai người khác. Các lựa chọn **[ĐỀ XUẤT]**:

1. **Agent chạy trong phiên của chính người dùng** (trình duyệt/proxy phía client), mọi thao tác thuộc về actor đó. Đơn giản nhất, an toàn nhất; hạn chế khi chạy nền dài.
2. **Token ủy quyền phạm vi hẹp, gắn actor + workspace, chỉ đọc + các thao tác "nháp"** (parse/gates/register DRAFT/preflight/run), tuyệt đối không activate/publish, có audit "do agent thực hiện thay actor X". Cần quyết định an ninh vì chạm nguyên tắc P22.
3. **MCP server của Portal** bọc các API trên, dùng cơ chế (1) hoặc (2) bên dưới.

Với TradingView MCP bên ngoài: coi đó là *nguồn ý tưởng/vẽ*, không phải nguồn dữ liệu chuẩn; dữ liệu chuẩn cho nghiên cứu luôn là catalog `crypto-binance-1m` đã được QuantBT kiểm chứng. Vấn đề giấy phép chart/TradingView cần xem riêng.

### 9.4 Pha triển khai gợi ý (để agent kế tiếp chỉnh)

| Pha | Nội dung | Phụ thuộc |
|---|---|---|
| AN-0 | Thiết kế: HiFi workbench, spec, mô hình agent, quyết định xác thực | tài liệu này |
| AN-1 | Chart + dữ liệu catalog + Indicator Lab (chưa agent) | catalog API |
| AN-2 | Strategy Lab + lint (parse/gates) + mẫu alpha | AN-1 |
| AN-3 | Preview service (AN-BE-01) + lớp Preview vs Engine | AN-BE-01, Codex |
| AN-4 | Agent đọc Evidence + Lineage; Hypothesis Board; nhật ký nghiên cứu | §6, quyết định §9.3 |
| AN-5 | Vòng tự động có người duyệt: soạn → thăm dò → tìm kiếm → đọc → version mới | AN-2…4 |
| AN-6 | Mở rộng route/ngữ pháp cho imported (AN-BE-03/04) | Codex + Bobby |

---

## 10. Khoảng trống, rủi ro, quyết định cần Bobby

### 10.1 Khoảng cách giữa tầm nhìn và hiện thực

| Tầm nhìn | Hiện thực | Hệ quả |
|---|---|---|
| "Lệnh ra/vào mô phỏng như TradingView strategy" (stop/TP, limit, đảo chiều) | Hôm nay imported chỉ có `signal_notional` ở bar-close, khớp `SAME_CLOSE` **[SUY RA]**. QuantBT sẽ **mở dần** các route (hướng "hỗ trợ tối đa"). | Tạm thời không có khớp nội bar; stop/TP chỉ là xấp xỉ bar-close trong code. Khai báo sẵn route mong muốn theo §4.7; AN-BE-03 là việc mở dần. |
| "TA phong phú (numpy/pandas)" | Cấm mọi import. | Phải tự viết; chi phí O(warmup); cần AN-BE-04. |
| "Đa symbol, đa timeframe" | Imported: 1h/4h/1d, BTCUSDT có biên nhận; một symbol mỗi run. | Cần mở rộng qualification trước khi hứa. |
| "Agent tự động" | Không token/MCP/service account. | Quyết định §9.3. |
| "Preview trên chart bằng chính file alpha" | Chưa có dịch vụ preview. | AN-BE-01. |

### 10.2 Rủi ro cần canh

- **Rò rỉ tương lai tinh vi** (không bị gate tĩnh bắt): kỷ luật `close[:-1]` + Critic.
- **Overfit do quá nhiều tham số/dải quá rộng**: giới hạn 6 tham số, Mode 3, what-if.
- **Claim quá lời**: luật §6.4 là điều kiện của agent Evidence/Critic.
- **Preview lệch engine** làm người dùng tin sai: luôn gắn nhãn + đối chiếu.
- **Đốt quota** 8 preflight/actor: agent phải biết ngân sách và chờ TTL 10 phút.
- **Đơn vị/khớp lệnh sai thầm lặng** (xem Bracket): luôn có run thăm dò.

### 10.3 Mâu thuẫn nguồn đã phát hiện (agent kế tiếp nên xác minh)

1. `warmup_bars`: analyzer cho ≤ 100.000, worker/recipe chỉ ≤ 4.096.
2. ~~`version` bắt buộc hay tuỳ chọn~~ — **đã giải: bắt buộc** (§4.4).
3. Đơn vị notional hiệu dụng của `signal_notional` so với `alloc_per_trade` 2.000: chưa đo trực tiếp.
4. Thời điểm khớp `SAME_CLOSE`: chỉ suy ra từ mã nguồn engine ngoài repo.
5. Fixture Atlas trong repo (`research-foundation.atlas-current.valid.json`) là góc nhìn P04 baseline cũ; admission chạy thật do preflight/run-admission quyết định.
6. Imported search có `random_seed` cố định 42 trong khi `determinism.seed_required` do alpha khai: hai cơ chế khác nhau cho recipe fixed vs search.

### 10.4 Việc Bobby cần quyết

1. **Cơ chế xác thực cho agent** (§9.3): phiên người dùng, token ủy quyền hẹp, hay MCP.
2. **Thứ tự mở route cho imported alpha** (bracket/stop-TP trước hay orders trước…); Bobby đã chốt hướng *mở dần, hỗ trợ tối đa*, còn cần chốt thứ tự và hợp đồng v2 (§4.7).
3. **Có đưa bộ helper số học duyệt sẵn vào ngữ pháp** không.
4. **Preview ở server hay trình duyệt** (A vs B, §2.2).
5. **Phạm vi symbol/timeframe** cho AI Native Loop ở phiên bản đầu.
6. **Ai sở hữu** AI Native Loop về backend (Codex?) và frontend.

---

## Phụ lục A — Mã lý do (reason codes) hay gặp

| Mã | Ý nghĩa |
|---|---|
| `ALPHA_EXECUTOR_MISMATCH` | Version không chạy được recipe này (khác executor). |
| `ALPHA_RANDOM_SEED_REQUIRED` | Seed phải đúng 42 (search) hoặc non-null khi `seed_required`. |
| `ALPHA_TIMEFRAME_NOT_DECLARED` | Timeframe yêu cầu không có trong `declaration.timeframes`. |
| `IMPORTED_WARMUP_EXCEEDS_EXECUTOR_LIMIT` | `warmup_bars` ngoài 1–4.096 (search) / 0–4.096 (fixed). |
| `ALPHA_DECLARATION_NOT_PUBLISHED` / `…_DIGEST_MISMATCH` / `ALPHA_SOURCE_DIGEST_MISMATCH` | Khai báo/nguồn không khớp digest đã đăng ký. |
| `ALPHA_PARAMETER_NOT_DECLARED` / `…_OUTSIDE_DECLARATION` / `…_BINDING_MISMATCH` | Tham số ngoài khai báo. |
| `ALPHA_REQUIRED_COLUMNS_NOT_AVAILABLE` | Cột yêu cầu không có trong dữ liệu. |
| `ALPHA_HISTORY_OUTSIDE_PROFILE` | Index không UTC/tăng/duy nhất hoặc > 100.000 bar. |
| `ALPHA_OUTPUT_CONTRACT_REJECTED` | Hàm trả sai envelope/giá trị. |
| `IMPORTED_RECIPE_AXIS_NOT_ADMITTED` | Yêu cầu khác recipe chính xác (engine, route, dataset, trial, early stopping…). |
| `IMPORTED_PARAMETER_PIN_REQUIRED` | Recipe fixed cần pin mọi tham số không `fixed`. |
| `IMPORTED_SOURCE_PROFILE_UNQUALIFIED` | Dataset không được qualify cho imported (ví dụ `vn-stock-daily`). |
| `PROFILE_NOT_OPENED` | Recipe/profile chưa được mở. |
| `RESEARCH_ALPHA_IMPORT_GATES_REQUIRED` (409) | Đăng ký khi gate chưa đạt. |
| `RESEARCH_IMMUTABLE_ALPHA_VERSION_CONFLICT` (409) | Cùng version, byte/contract khác. |
| `RESEARCH_ALPHA_IMPORT_ACTIVATION_CONFLICT` (409) | Activate sai `expected_alpha_revision`. |
| `RESEARCH_PREFLIGHT_UNAVAILABLE` (503, `preflight_manifest_quota`) | Hết quota preview. |

## Phụ lục B — Chỉ mục file nguồn để đọc tiếp

| Chủ đề | File |
|---|---|
| Import (control-api) | `apps/control-api/src/research/alpha-import.{controller,contract,service}.ts`, `alpha-analysis.client.ts`, `alpha-version-declaration.ts`, `imported-alpha.profile.ts` |
| Analyzer / loader | `apps/portal/backend/src/portal_api/services/research_alpha_analyzer.py`, `research_alpha_definition.py` |
| Thực thi | `apps/portal/backend/src/portal_api/workers/research_child.py`, `adapters/quantbt.py`, `services/research_imported_search.py`, `domain/research_imported_search.py` |
| Recipe/route | `domain/research_execution_recipes*.py`, `adapters/research_native_routes.py` |
| Mẫu | `apps/portal/frontend/src/research/samples/deltaRsiReference.py`, `upgrade/research_loop/examples/DELTA_RSI_REFERENCE.md` |
| Kernel bảo vệ (không sửa) | `apps/portal/strategy/**` |
| Hợp đồng sinh ra | `packages/contracts/openapi/research-*.openapi.json`, `packages/contracts/fixtures/research-alpha-import.*.valid.json` |
| Evidence/Claim | `apps/control-api/src/research/evidence.*`, `claim-family.ts`, `methodology-claims.ts`, `apps/portal/frontend/src/research/evidenceClient.ts` |
| Hành trình/phase | `upgrade/research_loop/RESEARCH_LOOP_GUIDE_V1_1_24_PHASES_vi.md`, `upgrade/UNIFIED_IMPLEMENTATION_PLAN.md` §13 |
| Qualification mới nhất | `upgrade/research_loop/evidence/P10/FULL_05_IMPORTED_ALPHA_2026-10-06.md`, `EXPANDED_TRIAL_PRODUCT_QUALIFICATION_2026-10-06.md`, `NATIVE_ROUTE_PRODUCT_QUALIFICATION_2026-10-06.md`, `S02_NATIVE_TRUTH_REPAIR_2026-10-07.md` |
| Sổ yêu cầu backend | `upgrade/research_loop/CODEX_BACKEND_GAPS_2026-09-30.md` |
| Design note cũ (lỗi thời) | `upgrade/STRATEGY_IMPORT_AND_RUNTIME_CONTRACT.md` |

## Phụ lục C — Thuật ngữ

| Từ | Nghĩa |
|---|---|
| Alpha | Một chiến lược được đăng ký với `alpha_id`. |
| Alpha version | Một bản bất biến (`av_<alpha>_<semver>`), có `DRAFT/ACTIVE/SUPERSEDED`. |
| Recipe | Tổ hợp cố định protocol × mode × schedule × trial × clock mà server cho phép chạy, bất biến theo digest. |
| Preflight | Bước xác nhận cấu hình trước khi tạo run; có quota; luôn là nguồn quyết định cuối. |
| Three Window | Protocol IS / OOS / Holdout độc lập. |
| Walk-forward (WFO) | Protocol nhiều fold theo thời gian. |
| θ* | Bộ tham số được chọn (per-fold hoặc global, tuỳ protocol; *không* mặc định là "tối ưu"). |
| Position regimes | Bộ đếm của engine (kể cả trạng thái vị thế ban đầu), **không** phải số lệnh khớp. |
| Typed absence | Vắng mặt có kiểu (`NOT_PUBLISHED`, `NOT_APPLICABLE`, `PENDING_*`), không bao giờ là 0. |
| Retained / current-source lane | Họ đọc dữ liệu giữ lại cho run hiện hành, khác họ lịch sử. |
