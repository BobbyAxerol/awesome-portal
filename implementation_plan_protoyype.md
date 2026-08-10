# QuantBT Backtest Portal Prototype - Implementation Plan

## 1. Muc Tieu

Xay dung mot portal noi bo de manager co the xem mot alpha duoc nghien cuu,
toi uu va backtest nhu the nao ma khong can doc notebook hoac Python code.

Portal dau tien chi phuc vu strategy `delta-rsi-polynomial-alpha`, nhung cac
contract phai duoc tach dung de co the them strategy khac ma khong sua UI core.

Muc tieu quan trong nhat:

- cung cap mot protocol mac dinh ba cua so ro rang: IS, OOS va Holdout Live;
- cho thay tung trial duoc optimize tren IS, shortlist, replay tren OOS va chon
  params theo decay nhu the nao;
- dong bang dung mot bo params sau selection va replay bo params do tren ca IS,
  OOS va Holdout Live;
- van cung cap Advanced Walk-Forward cho toan bo mode/schedule ma QuantBT public
  API dang support;
- cho thay params, trial distribution, candidate distribution va qua trinh chon
  params ma khong buoc manager phai doc code;
- cho thay equity, drawdown, position, target transition, fee/funding/margin neu
  backend thuc su cung cap;
- bao toan toan bo audit metadata cua QuantBT;
- khong tinh lai PnL, Sharpe hoac selection objective trong frontend;
- khong bien portal thanh mot strategy editor hoac mot notebook thu hai.

Portal la presentation va orchestration layer. QuantBT van la source of truth
cho sizing, accounting, WFO selection va metrics.

### 1.1. Task Boundary Bat Buoc

Trong toan bo task portal:

- `/root/bobby/pool_alpha/quantbt` la protected read-only dependency;
- khong sua, commit, format, generate file hoac thay dependency cua QuantBT;
- portal chi duoc dung public API da ton tai cua package;
- neu gap limitation can sua QuantBT, ghi thanh integration gap va dung lai;
- chi duoc sua QuantBT khi user phe duyet mot task/scope rieng bang loi ro rang.

Frontend khong phai noi giai thich moi assumption cua backend. UI uu tien actual
results, charts, filters va tables. Provenance/domain metadata van duoc luu day
du trong artifact de debug, nhung chi hien trong audit details khi can.

---

## 2. Audit Hien Trang

Thu muc hien tai chi co:

```text
strategy/main.py
strategy/params.py
quantbt_kernel_wrapper/wrapper.py
```

### 2.1. Strategy

`strategy/main.py` da co core Numba va Python adapter de tao:

- `pos_weight`;
- `exit_type`;
- `exit_price`.

Thesis structural dang duoc encode truc tiep:

- Delta-RSI dao ham bac hai;
- long entry bang signal-line crossing;
- short entry va indicator exit bang direction change;
- ATR filter;
- relative-volume filter;
- hard stop-loss;
- khong trailing stop;
- khong take-profit.

Search surface chi con tam scalar params trong `strategy/params.py`:

```text
window
rsi_l
signalLength
len_atr1
len_atr2
rvol
len_vol
slpercent
```

Day la mot diem tot: structural thesis khong bi lap lai trong Optuna search.

### 2.2. Wrapper

`quantbt_kernel_wrapper/wrapper.py` hien la notebook code duoc paste vao module,
chua phai service. Cac blocker:

- absolute `sys.path.append`;
- import `QuantBTEndpoint` lap lai;
- tham chieu global `data_eth`, `param_ranges`, `generate_delta_rsi_signals`;
- chay WFO ngay khi import module;
- dung `display`, `print`, matplotlib va global result variables;
- tron data split, strategy adapter, WFO, report va plot trong mot file;
- output chi ton tai trong process memory;
- khong co typed request/response contract;
- khong co job status, cancellation, artifact persistence hoac error taxonomy;
- mot so label cu van ghi Mode 5 trong khi logic da la Mode 1;
- frontend se buoc phai hieu truc tiep pandas va object noi bo QuantBT.

Wrapper nay se duoc thay bang service orchestration; khong patch dan de bien no
thanh API handler.

---

## 3. Pham Vi Prototype

### 3.1. In Scope

- mot strategy registry voi Delta-RSI la strategy dau tien;
- mot market-data provider local;
- protocol `three_window_decay` la default manager workflow;
- ba cua so IS/OOS/Holdout Live co date role explicit va khong overlap;
- IS-only Optuna search, OOS candidate replay/decay selection, Holdout Live final
  evaluation;
- mot bo selected params duoc dong bang va replay tren ba segment;
- Advanced Walk-Forward workspace expose cac option ma QuantBT support matrix tra
  ve, khong hardcode mot subset tuy y;
- result segments duoc tao theo run configuration da phe duyet;
- explicit parameter-selection/deployment policy, khong suy dien tu fold cuoi;
- asynchronous run lifecycle;
- persisted run artifacts;
- overview, WFO, parameters, execution va audit views;
- export JSON/CSV/Parquet cho audit;
- localhost deployment.

### 3.2. Out Of Scope

- strategy source editor tren browser;
- arbitrary user-supplied Python;
- multi-user permissions;
- distributed Optuna workers;
- live trading va order submission;
- public IP deployment truoc khi co auth, TLS va reverse proxy;
- tinh lai metrics trong JavaScript;
- thay doi objective/domain logic trong QuantBT;
- bat ky thay doi nao trong repository QuantBT khi chua duoc phe duyet rieng;
- hien thi order/fill neu endpoint `pct_equity` khong cung cap audited fills.

---

## 4. Kien Truc Duoc Chon

```text
React Portal
    |
    | HTTP + SSE
    v
FastAPI Application
    |
    +-- RunService / JobService
    +-- StrategyRegistry
    +-- MarketDataProvider
    +-- QuantBTAdapter
    +-- ArtifactRepository
             |
             v
     QuantBTEndpoint + strategy kernel
```

### 4.1. Backend

Chon:

- Python 3.12;
- FastAPI;
- Pydantic v2;
- Uvicorn;
- pandas/NumPy tai QuantBT boundary;
- PyArrow/Parquet cho time-series artifact;
- JSON cho manifest, metrics va audit metadata;
- `ProcessPoolExecutor` mot worker trong prototype de WFO khong block API loop.

Ly do:

- strategy va QuantBT da la Python/Numba;
- khong can serialize market tape sang ngon ngu khac;
- Pydantic tao contract ro va sinh OpenAPI cho frontend;
- process worker cach ly RSS/Numba compile cua mot WFO run;
- FastAPI phu hop voi polling/SSE va typed error response.

### 4.2. Frontend

Chon:

- React + TypeScript;
- Vite;
- Tailwind CSS;
- Apache ECharts qua React adapter;
- TanStack Query;
- TanStack Table;
- Lucide icons;
- Vitest + React Testing Library;
- Playwright cho visual/E2E gate;
- TanStack Router (typed search params, chot tai §27.5);
- openapi-typescript (API client typegen tu OpenAPI backend, xem §27.5).

ECharts duoc chon vi mot library co the xu ly:

- linked time-series zoom;
- line/area equity va drawdown;
- scatter IS/OOS;
- heatmap params theo fold;
- parallel coordinates;
- bar/boxplot/distribution;
- candlestick hoac close-price overlay;
- dataset lon hon chart DOM thong thuong.

Khong chon Streamlit cho implementation chinh. Streamlit phu hop demo nhanh
nhung kho giu typed API boundary, background job lifecycle, linked chart state,
URL-deep-link va UI polish can thiet cho stakeholder portal.

---

## 5. Cau Truc Thu Muc Dich

```text
backtest_portal_prototype/
  backend/
    pyproject.toml
    src/portal_api/
      main.py
      api/
        routes_health.py
        routes_strategies.py
        routes_runs.py
        routes_artifacts.py
      domain/
        enums.py
        requests.py
        responses.py
        artifacts.py
        errors.py
      services/
        run_service.py
        job_service.py
        artifact_builder.py
        progress_service.py
      adapters/
        quantbt_adapter.py
        market_data.py
      repositories/
        artifact_repository.py
      workers/
        run_worker.py
  strategy/
    __init__.py
    delta_rsi.py
    specification.py
    params.py
    registry.py
  frontend/
    package.json
    src/
      app/
      api/
      components/
      features/overview/
      features/walkforward/
      features/parameters/
      features/execution/
      features/audit/
      charts/
      types/
  tests/
    backend/
    strategy/
    integration/
    fixtures/
  artifacts/
    .gitignore
  scripts/
    run_dev.sh
    run_smoke.py
  implementation_plan_protoyype.md
```

`strategy/main.py` va wrapper cu se khong con la runtime entry points sau khi
refactor. Khong xoa chung truoc khi golden parity pass.

---

## 6. Strategy Contract

Strategy khong duoc import QuantBT, FastAPI hoac frontend code.

### 6.1. Strategy Specification

```python
@dataclass(frozen=True)
class StrategySpecification:
    strategy_id: str
    display_name: str
    version: str
    timeframe: str
    required_columns: tuple[str, ...]
    structural_contract: dict[str, object]
    parameter_space: dict[str, object]
```

`structural_contract` chi la provenance de UI/audit hien thi. No khong duoc
dung de re-implement signal logic.

### 6.2. Strategy Functions

```python
def generate_signals(data: pd.DataFrame, params: Mapping[str, object]) -> pd.DataFrame:
    ...

def build_walkforward_signal(
    data,
    params,
    train_index,
    test_index,
    fold,
) -> pd.Series:
    ...
```

Rules:

- no `display`, `print` hoac plotting;
- no mutable module globals;
- no absolute path;
- params thieu phai fail ro;
- output index phai dung `test_index`;
- OHLCV input phai float64, sorted, unique;
- Numba warm-up duoc worker thuc hien mot lan truoc timed run;
- structural behavior phai parity voi strategy da paste.

### 6.3. Golden Strategy Fixture

Tao mot market fixture co:

- trend tang;
- trend giam;
- high-vol reversal;
- low-volume period;
- hard-SL hit.

So sanh cu va moi cho:

```text
pos_weight
exit_type
exit_price
```

Parity phai exact hoac theo tolerance duoc dinh nghia ro cho floating point.

---

## 7. Data Contract

Frontend khong upload DataFrame trong prototype. `RunRequest` chi chon
`dataset_id` va date windows; backend provider doc du lieu.

Default runtime provider dung dataset dong `crypto-binance-1m`. UI truyen
`symbol` va `timeframe`; adapter goi truc tiep
`CryptoBinance1m.load_resampled(..., check_val=True, engine="duckdb")` tu data
service chinh cua Pool Alpha. Portal khong copy storage, khong doc raw 1m bang
pandas truoc khi resample va khong expose local path. Manifest provider van la
fallback tuy chon cho fixture/dataset co dinh.

Required schema:

```text
DatetimeIndex UTC, monotonic, unique
open: float64
high: float64
low: float64
close: float64
volume: float64
```

Validation:

- `high >= max(open, close)`;
- `low <= min(open, close)`;
- OHLC finite va positive;
- volume finite va non-negative;
- duplicate timestamps rejected;
- missing-bar count reported;
- timezone normalized once;
- IS/OOS/live ranges non-overlapping;
- requested range nam trong dataset.

Data provenance:

```text
dataset_id
source_uri (server-side only)
symbol
venue
timeframe
first_timestamp
last_timestamp
rows
content_hash
missing_bar_count
loaded_at
```

`source_uri` khong duoc expose neu no chua secret/local path.

### 7.1. Default Three-Window Protocol

Portal co mot protocol mac dinh rieng cho workflow manager:

```text
protocol = "three_window_decay"
```

Day la fixed holdout protocol, khong phai rolling WFO. Vi vay o che do mac dinh:

- khong dung `optimization_schedule`;
- khong dung `split_frequency`;
- khong dung `window_mode` hoac `train_window`;
- cac field tren bi an/disable tren UI, khong gui gia tri gia vao backend;
- backend tao dung mot IS/OOS calibration pair va mot Holdout Live bat bien.

Manager co the goi day la "ba fold lon" tren trao doi, nhung artifact/domain
phai goi la ba `window/segment`: Holdout Live khong phai optimization fold va
khong duoc xuat hien trong `fold_table` cua QuantBT.

Default boundary dung half-open interval de khong trung mot bar:

```text
IS           [2020-01-01 00:00 UTC, 2024-01-01 00:00 UTC)
OOS          [2024-01-01 00:00 UTC, 2025-07-01 00:00 UTC)
Holdout Live [2025-07-01 00:00 UTC, dataset_end]
```

Nhu vay "OOS den het 06/2025" va "Holdout Live tu 07/2025" co nghia duy
nhat. Tat ca moc deu editable qua date/time picker. UI hien ngay inclusive de
de doc, nhung API luu `start_inclusive` va `end_exclusive`. Default protocol
bat buoc ba cua so lien tuc, co thu tu va khong overlap.

Ky hieu bo tham so la \(\theta\), objective IS do QuantBT tra ve la
\(J_{IS}(\theta)\), va Sharpe da ap trade-count penalty la
\(S_{IS}(\theta)\), \(S_{OOS}(\theta)\).

Flow selection:

1. Optuna sample va score moi \(\theta_i\) chi tren IS.
2. Lay top \(q\%\) trial theo IS objective thanh tap candidate
   \(\mathcal{C}\).
3. Chi replay \(\mathcal{C}\) tren OOS; khong re-fit va khong tao trial moi
   bang OOS.
4. Tinh decay cho candidate:

   \[
   d(\theta) = S_{IS}(\theta) - S_{OOS}(\theta)
   \]

5. Chon \(\theta^*\) bang Mode 1 robust-decay contract cua QuantBT. Portal
   khong tu tinh lai objective; cong thuc tren chi mo ta artifact can audit.
6. Dong bang \(\theta^*\). Sau diem nay khong optimization, reselection hay
   calibration nao duoc phep.
7. Replay \(\theta^*\) tren IS, OOS va Holdout Live de tao ba result segment.

Khong chon `argmin(abs(decay))` don thuan: mot candidate cung te tren IS va OOS
co decay gan 0 nhung khong co gia tri. QuantBT robust-decay objective phai can
bang OOS performance, IS-to-OOS deterioration va trade-count penalty; portal
chi hien dung source values cua selector do.

OOS trong protocol nay la validation window co tham gia candidate selection.
Holdout Live moi la cua so chua tung duoc dung de chon params. Provenance nay
phai nam trong artifact/audit; main UI chi dung nhan ngan `IS`, `OOS` va
`Holdout Live`.

### 7.2. Anti-Leakage Invariants

Backend phai cat tape truoc khi goi calibration:

```text
calibration_tape = IS + OOS
holdout_tape     = Holdout Live
```

Khong duoc truyen full dataset vao calibration roi chi hy vong endpoint bo qua
Holdout Live. Invariants bat buoc:

- `max(calibration_tape.index) < holdout_start`;
- Holdout hash khong nam trong optimization input hash;
- thay doi moi OHLCV trong Holdout Live khong duoc lam thay selected params,
  IS trial table, OOS candidate table hoac decay selection;
- thay doi OOS co the lam thay final selection, nhung khong duoc lam thay trial
  suggestions va IS scores da sinh tu IS;
- ba evaluation segment dung cung \(\theta^*\);
- strategy indicator co the doc warm-up history toi truoc segment start, nhung
  account/PnL cua moi segment bat dau tai segment boundary;
- Holdout Live chi chay sau khi selected params da serialize/freeze.

### 7.3. Evaluation And Equity Contract

Moi segment chay mot fresh account voi cung account/execution config. Day la
cach so sanh hieu qua regime ma khong de PnL cua IS phong dai notional OOS.

Portal tao hai presentation artifact, khong thay doi accounting:

1. `calendar_equity`: ba equity series tren cung calendar axis, moi series co
   fresh initial capital va co `null` tai boundary de khong noi mot duong gia.
2. `rebased_equity`: moi segment bat dau tai 100 de so sanh hinh dang/decay tren
   indexed-time axis.

Metrics table luon dung equity goc do QuantBT tra ve, khong dung rebased series.
Neu sau nay can continuous-capital replay, no phai la artifact tuy chon co ten
rieng; khong duoc ghep ba fresh-account segment thanh mot equity gia.

---

## 8. Run Request Contract

```python
class PortalRunRequest(BaseModel):
    strategy_id: str
    dataset_id: str
    symbol: str
    timeframe: str
    protocol: Literal["three_window_decay", "advanced_walk_forward"]
    parameter_space: ParameterSpaceConfig
    calibration: ThreeWindowConfig | AdvancedWalkForwardConfig
    account: AccountConfig
    execution: ExecutionConfig
```

`ParameterSpaceConfig` chi cho phep key da dang ky boi strategy specification.
Moi key dung mot discriminated spec:

```text
fixed(value)
int_range(low, high, step)
float_range(low, high, step)
categorical(values)
```

Unknown key, empty range, invalid step hoac type mismatch fail preflight. Delta-
RSI prototype expose tam scalar search params tu `strategy/params.py`; structural
thesis khong duoc bien thanh UI toggle.

`ThreeWindowConfig`:

```text
is_start
is_end_exclusive
oos_start
oos_end_exclusive
holdout_start
holdout_end_exclusive | null (= dataset end)
optimization_mode = mode_1_decay
optuna_trials
optuna_early_stopping
random_seed | null
top_is_fraction
candidate_selection_metric = robust_decay
decay_lambda
decay_gamma
scoring_trading_days
min_trades_per_year
trade_penalty_factor
use_numba
```

`optimization_mode` va `candidate_selection_metric` cua default protocol bi
khoa tai `mode_1_decay`/`robust_decay`. Top fraction va decay weights van
editable, co typed bounds va reset-to-default.

`AdvancedWalkForwardConfig` expose cac field public QuantBT support:

```text
optimization_mode
optimization_schedule
split_mode
split_frequency
window_mode
train_window
min_train_bars
min_test_bars
target_mode
fill_value
fold_boundary_position_policy
optuna_trials
optuna_early_stopping
random_seed | null
top_is_fraction
top_is_k
candidate_selection_metric
decay_lambda
decay_gamma
candidate_decay_lambda / candidate_decay_gamma
flat_eps / flat_min_samples
flat_top_fraction / flat_selector
plateau_* fields
sbb_* fields
regime_* fields
garch_* fields
is_subperiods
q25_weight / dispersion_penalty
temporal_weight / plateau_weight
use_bootstrap_penalty
use_complexity_penalty
min_trades_per_year
trade_penalty_factor
scoring_backend
scoring_trading_days
use_numba
```

Current capability values can render initially as:

```text
optimization_mode:
  none
  mode_1_decay
  mode_2_sbb
  mode_3_flat_minima
  mode_4_is_only_robust
  mode_5_full_robust

optimization_schedule:
  global
  per_fold_decay   # Mode 1 only
  per_fold_causal  # Mode 4 only
```

Day la initial schema snapshot, khong phai frontend constant vinh vien. API
capability response van la source of truth de QuantBT them support ma UI khong
can sua scattered constants.

Danh sach value va combination hop le phai lay tu
`walkforward_support_matrix()` va typed backend schema. UI disable combination
khong support; khong de user submit roi moi nhan traceback.

Account fields:

```text
initial_capital
leverage
maintenance_ratio
contract_size
alloc_per_trade
canonical_one_way_fee_rate
slippage
funding_enabled
funding_rate
use_pyramiding
```

API khong expose mot dict tu do cho phase dau. Field nao duoc UI thay doi phai
co type, bounds, default va tooltip domain ro.

### 8.1. Configuration UX Contract

Config drawer dung segmented control:

```text
Three-Window | Advanced Walk-Forward
```

`Three-Window` la default va chi hien:

- dataset, symbol, timeframe;
- ba row IS/OOS/Holdout Live voi date pickers;
- Optuna budget;
- Mode 1 candidate/decay controls;
- account, fee, slippage, funding va sizing.

`Advanced Walk-Forward` hien day du:

- split/schedule/window controls;
- optimization mode 1-5;
- conditional controls cua mode dang chon;
- target/backend/account/execution controls;
- generated fold preview truoc khi run.

Field khong lien quan phai bien mat, khong chi bi grey-out thanh mot form dai.
Moi field co concise tooltip; khong chen methodology paragraph vao form.

---

## 9. Run Lifecycle

`POST /api/runs` tra `202 Accepted` va `run_id`, khong giu request mo den khi
WFO xong.

State machine:

```text
QUEUED
VALIDATING_DATA
WARMING_KERNEL
OPTIMIZING_IS
RANKING_IS_CANDIDATES
REPLAYING_CANDIDATES_ON_OOS
SELECTING_PARAMS
FREEZING_PARAMS
BACKTESTING_IS
BACKTESTING_OOS
BACKTESTING_HOLDOUT_LIVE
BUILDING_ARTIFACTS
COMPLETED
FAILED
CANCELLED
```

Advanced WFO co the emit them `RUNNING_FOLD`, `STITCHING_OOS` va
`SELECTING_DEPLOYMENT_PARAMS`; state payload co `protocol` va `fold_id` optional.

Prototype progress la stage-accurate. Khong fabricate per-trial percent neu
QuantBT chua expose observer callback.

SSE endpoint:

```text
GET /api/runs/{run_id}/events
```

Event payload:

```json
{
  "run_id": "...",
  "state": "OPTIMIZING_IS",
  "stage_index": 3,
  "stage_count": 11,
  "message_code": "IS_OPTIMIZATION_RUNNING",
  "started_at": "...",
  "elapsed_seconds": 18.2
}
```

Neu public QuantBT API chua expose live fold/trial callback, prototype chi hien
stage progress trung thuc. Khong copy Optuna/WFO logic sang portal chi de tao
progress bar. Moi de xuat them observer vao QuantBT phai la task rieng duoc user
phe duyet; no khong nam trong scope portal.

Terminal panel chi render structured events co timestamp. Trong luc Optuna dang
chay, no hien stage va cac event public API thuc su cung cap. Sau khi study hoan
tat, `trial_table` va `candidate_table` duoc nap thanh log truy van/loc chi tiet.
Khong parse stdout hoac fabricate mot trial stream. Neu can callback live tung
trial, ghi integration gap de xin phe duyet QuantBT rieng.

---

## 10. QuantBT Adapter

`QuantBTAdapter` la noi duy nhat duoc phep hieu object noi bo QuantBT.

Flow:

1. Validate parameter space, data schema va support matrix.
2. Build date windows theo explicit run request.
3. Neu protocol la `three_window_decay`, tao calibration tape chi gom IS+OOS.
4. Goi public `QuantBTEndpoint.train_test_split(...)` voi `test_start` bang OOS
   start va `optimization_mode="mode_1_decay"`.
5. Lay result, metrics, `trial_table`, `candidate_table`, selected trial va raw
   metadata ma public endpoint tra ve.
6. Normalize artifacts ma khong doi gia tri/objective.
7. Freeze selected params thanh immutable JSON artifact truoc khi doc Holdout.
8. Tao signal va goi public `QuantBTEndpoint.pct_equity(...)` rieng cho IS, OOS
   va Holdout Live bang dung frozen params/account config.
9. Reconcile metrics/equity va build `calendar_equity`/`rebased_equity` chi cho
   presentation.
10. Neu protocol la `advanced_walk_forward`, route qua public
    `QuantBTEndpoint.walk_forward(...)` voi option da validate.
11. Build immutable `PortalRunArtifact`.

Trong default protocol, deployment params la selected params cua single
IS/OOS Mode 1 study. Trong Advanced WFO, params semantics phai lay tu QuantBT
metadata va explicit policy cua request; khong hardcode latest fold.

Adapter phai luu raw lineage ma QuantBT tra ve. Portal khong duoc tu sort lai
trial roi tu chon params, khong tinh lai robust-decay, va khong duoc truyen
Holdout Live vao call calibration.

Portal khong duoc goi internal private QuantBT kernel.

---

## 11. Artifact Contract

Moi run duoc luu tai:

```text
artifacts/runs/{run_id}/
  manifest.json
  strategy.json
  data_quality.json
  config.json
  metrics.json
  audit.json
  wfo/folds.parquet
  wfo/fold_selection.parquet
  wfo/trials.parquet
  wfo/candidates.parquet
  wfo/params_by_fold.json
  selection/selected_params.json
  selection/selection_trace.json
  series/is.parquet
  series/oos.parquet
  series/holdout_live.parquet
  presentation/calendar_equity.parquet
  presentation/rebased_equity.parquet
```

### 11.1. Manifest

```text
run_id
status
created_at / started_at / completed_at
strategy id/version/hash
quantbt version
portal version
dataset hash
config hash
random seed
protocol
backend/mode/sizing
artifact schema version
warnings
failure code/message
```

### 11.2. Segment Series

Columnar fields, neu source result co:

```text
timestamp
open/high/low/close
signal_target
accepted_position
equity
returns
drawdown
fee
funding
initial_margin
maintenance_margin
available_equity
exit_type
exit_price
```

Field khong co audited source phai omitted/null kem capability flag. Khong suy
dien fills tu signal transition roi goi no la audited fill.

### 11.3. Metrics

Moi segment co standard QuantBT report:

```text
initial_capital
final_equity
total_return_pct
cagr_pct
sharpe
sortino
calmar
omega
max_drawdown_pct
avg_drawdown_pct
max_dd_duration_days
profit_factor
long_hitrate_pct
short_hitrate_pct
avg_win_pct
avg_loss_pct
expectancy_pct
num_trades
liquidated
```

### 11.4. WFO Artifact

Expose:

```text
fold_table
fold_selection_table
fold_boundary_table
params_by_fold
trial_table
candidate_table
selected trial records returned by the configured protocol
optimization_schedule
validation_claim
causality_claim
oos_used_for_selection
params_semantics
n_folds
n_studies
trials scope
prepared context/profile metadata
```

Default `selection_trace.json` phai noi duoc mot candidate di qua pipeline:

```text
trial_id
params
is_objective
is_sharpe_raw / is_sharpe_penalized
is_trade_count / is_trade_penalty
is_rank
is_top_candidate
oos_sharpe_raw / oos_sharpe_penalized
oos_trade_count / oos_trade_penalty
decay
candidate_objective
selected
```

Field nao QuantBT khong tra ve thi omitted/null kem `capabilities`; portal khong
duoc tu suy dien gia tri thay the.

DataFrame/datetime/NumPy values phai serialize qua mot canonical serializer.
Khong return Python repr hoac arbitrary metadata object.

---

## 12. API Surface

```text
GET  /api/health
GET  /api/strategies
GET  /api/strategies/{strategy_id}
GET  /api/datasets
GET  /api/capabilities/walk-forward
POST /api/runs/preflight
POST /api/runs
GET  /api/runs
GET  /api/runs/{run_id}
GET  /api/runs/{run_id}/events
POST /api/runs/{run_id}/cancel
GET  /api/runs/{run_id}/summary
GET  /api/runs/{run_id}/wfo/folds
GET  /api/runs/{run_id}/wfo/trials
GET  /api/runs/{run_id}/wfo/candidates
GET  /api/runs/{run_id}/wfo/parameters
GET  /api/runs/{run_id}/selection/trace
GET  /api/runs/{run_id}/series/{segment}
GET  /api/runs/{run_id}/audit
GET  /api/runs/{run_id}/export
```

Trial endpoint support server-side filters:

```text
fold_id
stage
pruned
top_n
sort_by
sort_order
```

Time-series endpoint support:

```text
start
end
max_points
```

Server downsample cho overview nhung export van giu full fidelity.

---

## 13. Portal Information Architecture

First screen la actual run workspace, khong phai landing page.

Top bar:

- strategy selector;
- dataset/timeframe;
- run selector;
- run status;
- primary Run command;
- export menu.

Primary navigation:

```text
Overview
Optimization
Parameters
Execution
Audit
```

Config mo trong side panel, khong chiem dashboard khi da chay xong.

### 13.1. Run Configuration Workspace

Khi chua co result, first screen la config workspace, khong phai landing page.
Desktop chia hai vung unframed:

```text
Config rail 360px | Data-window preview + run preflight
```

Config order:

1. Strategy, dataset, symbol, venue, timeframe.
2. Protocol segmented control.
3. Data windows.
4. Search space.
5. Optimization settings.
6. Account and execution settings.
7. Preflight summary and Run command.

Three-window editor dung ba row co cung layout:

```text
IS            start [date/time]  end [date/time]  bars [computed]
OOS           start [date/time]  end [date/time]  bars [computed]
Holdout Live  start [date/time]  end [latest]     bars [computed]
```

Ben phai la timeline preview theo ty le thoi gian, hien gap/overlap ngay khi
edit. Preflight phai pass data schema, boundary, row count va parameter-space
validation truoc khi Run button enabled.

Advanced WFO thay ba-row editor bang fold preview. Cac option duoc group theo
`Split`, `Optimization`, `Selection`, `Account`, `Execution`; moi group co the
collapse, nhung group co validation error tu mo.

Sau khi submit, config rail thu gon thanh drawer. Main surface chuyen sang run
progress/result, nhung user co the xem immutable submitted config bat ky luc nao.

---

## 14. Overview View

Muc tieu: manager hieu ket qua va pham vi validation trong mot man hinh.

Components:

- KPI strip: final equity, total return, Sharpe, max drawdown, trades;
- segment control `IS | OOS | Holdout Live | Compare`;
- equity chart co ba non-connected calendar traces va boundary dividers;
- toggle `Capital`/`Rebased 100` cho cung chart;
- underwater drawdown linked voi segment dang chon;
- ba vertical window bands dung role color nhe;
- compact monthly return heatmap;
- metric comparison matrix IS/OOS/Holdout Live voi delta columns;
- selected params summary tu frozen artifact;
- concise selection strip:

  ```text
  IS search -> OOS candidate replay -> Frozen params -> Holdout Live
  ```

Overview khong hien methodology disclaimer dai, backend assumption hoac badge
giai thich cach selection. Ten period ngan gon va actual metrics la du.

---

## 15. Optimization View

Day la man hinh trung tam cua portal.

### 15.1. Process Timeline

Default protocol hien mot horizontal process voi actual status/count:

```text
Optimize IS -> Top IS Candidates -> Replay OOS -> Select -> Freeze -> Evaluate
```

Click mot stage de filter log, chart va table lien quan. IS/OOS/Holdout timeline
nam ngay ben duoi va dung chung colors voi Overview.

Advanced WFO hien fold timeline:

- horizontal chronological timeline;
- train window va test window co mau khac nhau;
- click fold de filter toan bo charts;
- hien train/test dates, seed, trial count va selected trial;
- boundary marker cho target carry/reversal/flat.

### 15.2. Selection Pipeline

Hien actual counts:

```text
sampled trials -> valid trials -> candidates -> selected params
```

Stage label va count duoc tao tu actual artifact. UI khong hardcode Mode 1,
top 10% hoac robust-decay neu backend run dung protocol khac.

### 15.3. Candidate Metrics

- grouped IS/OOS Sharpe bars cho top candidates;
- decay lollipop/line voi selected marker;
- candidate objective distribution;
- selected candidate marker;
- trade-count penalty marker.

Click candidate phai highlight cung `trial_id` tren scatter, table, parallel
coordinates va parameter distribution. Main chart khong dua ra ket luan text.

### 15.4. Trial Explorer

- scatter full trials theo `IS objective` va trial id;
- candidate-only scatter `IS Sharpe` vs `OOS Sharpe`;
- color = objective;
- shape = selected/candidate/pruned;
- best-so-far convergence theo trial id;
- table co params, metrics, stage va selection metadata;
- click trial de highlight tren parameter charts.

### 15.5. Compact Run Details

Mac dinh collapsed. Khi user mo, chi hien metadata thuc te:

```text
optimization schedule
validation claim
causality claim
OOS used for selection
params semantics
trials per study
fold boundary policy
```

Khong them doan giai thich methodology tren main chart surface.

### 15.6. Parameter Selection Trace

Mot selected-candidate rail noi cac gia tri ma backend cung cap:

```text
IS rank -> IS score -> OOS score -> decay -> candidate score -> selected params
```

Day la audit visualization, khong phai noi frontend tinh objective. Hover/click
mo raw row va params JSON; mac dinh chi hien nhung so can de manager theo doi.

### 15.7. Structured Optimization Log

Terminal-style panel dung mono text, co filter theo stage/trial/candidate. Mot
record co the gom:

```text
timestamp | stage | trial_id | IS objective | status | elapsed
timestamp | OOS replay | candidate_id | decay | candidate objective
timestamp | selected | trial_id | frozen params hash
```

Trong khi run, panel chi stream event backend thuc su biet. Khi study ket thuc,
trial/candidate records duoc nap vao cung panel de inspect. Download action xuat
structured JSONL; log khong phai scraped console text.

---

## 16. Parameters View

Muc tieu: giai thich stability, khong chi khoe best params.

Charts:

- search-space coverage histogram cho tung scalar parameter;
- objective-vs-parameter scatter/boxplot;
- pairwise sensitivity heatmap/contour cho hai params duoc chon;
- parallel coordinates cho top IS candidates va OOS-replayed candidates;
- selected params table va percentile position trong search range;
- normalized params-by-fold heatmap cho Advanced WFO;
- selected param trajectory theo fold cho Advanced WFO;
- per-parameter trial distribution;
- objective response scatter cho mot selected parameter;
- selected/deployment params table theo explicit backend policy;
- param delta giua cac fold hoac selection records neu available.

Categorical/structural thesis nam trong mot immutable contract section. Scalar
search params nam trong calibration section. Khong tron hai loai voi nhau.

---

## 17. Execution View

Muc tieu: noi signal voi account result.

Charts:

- close price voi long/short entry-exit target markers;
- position regime strip;
- equity va drawdown linked zoom;
- turnover va cost timeline;
- funding/margin timeline neu available;
- transition table theo timestamp.

Marker duoc tao tu signal/accepted-position transition phai co label
`Target transition`. Chi dung `Fill` neu QuantBT result co audited fill record.

---

## 18. Audit View

Expose:

- immutable run manifest;
- full account/execution/WFO config;
- strategy structural contract;
- data quality report va content hash;
- QuantBT/backend/version;
- selected/deployment params provenance;
- warnings, fallback/capability flags;
- artifact download links;
- reconciliation checks.

Reconciliation checks:

```text
series start/end match segment contract
final series equity == metrics final equity
drawdown recomputation parity
selected params == explicit backend policy output
result windows == run request windows
artifact metadata == public QuantBT result metadata
```

---

## 19. UI Design Direction

Portal la operational quant workspace voi publication-grade report surface,
tham chieu truc tiep `uiux-design.md`; khong phai marketing dashboard.

### 19.1. Visual System

- paper/near-white canvas, ink/soft/faint text hierarchy;
- toi da mot structural accent, mot highlight accent va good/bad semantic pair;
- khong hardcode raw colors trong components; dung design tokens;
- display serif cho page/section heading, sans cho body, mono cho tat ca metric,
  timestamp, ticker, param va table number;
- desktop-first 12-column content grid;
- compact top bar va predictable tabs;
- page sections unframed, cards chi dung cho KPI/repeated items/modal;
- card radius toi da 8px va shadow rat nhe;
- tabular numerals, right-aligned numeric cells;
- letter spacing bang 0;
- icon buttons dung Lucide va tooltip;
- chart heights/aspect ratio co dinh de tab/filter khong lam layout shift;
- no nested cards, no gradient/orb decoration;
- loading, empty, failed, cancelled va partial-artifact states day du.

### 19.2. Reused Reference Components

Ap dung co chon loc tu reference:

- metric hero strip cho Overview KPI;
- horizontal stepper cho optimization process;
- generic/sticky tables cho trial/candidate explorer;
- chart figure frame co title va export action;
- chips cho symbol, timeframe, strategy va protocol;
- collapsible cho advanced config va raw audit;
- comparison matrix cho IS/OOS/Holdout Live metrics;
- fee-drag waterfall neu cost artifact co du;
- parameter sensitivity contour cho Optuna analysis.

Khong reuse cover/abstract/key-finding theo kieu static report tren run workspace.
Chung chi phu hop khi export stakeholder report sau nay.

### 19.3. Chart Contract

- Apache ECharts la Tier 1 interactive chart engine;
- linked zoom/crosshair giua equity, drawdown va execution;
- canvas renderer cho trial/series lon;
- server downsample series, nhung selected/event points luon duoc preserve;
- positive/negative mau theo semantic token;
- legend, tooltip va axis dung terminology ngan gon;
- moi chart co data source id va export CSV/PNG action;
- no result narrative paragraph tren chart surface.

### 19.4. Responsive, Print And Accessibility

- <1080px: config rail thanh drawer;
- <780px: chart 2-column thanh mot cot;
- table rong dung horizontal scroll, khong co text overlap;
- `focus-visible`, keyboard tab order va tooltip accessible bat buoc;
- ton trong `prefers-reduced-motion`;
- print mode an controls, mo audit details, avoid page break trong chart/table;
- Playwright screenshot gate cho 1440x900, 1280x720 va 390x844.

---

## 20. Error And Warning Contract

Error codes, khong parse string traceback tren frontend:

```text
DATASET_NOT_FOUND
DATA_SCHEMA_INVALID
DATE_RANGE_INVALID
PARAMETER_SPACE_INVALID
STRATEGY_EXECUTION_FAILED
QUANTBT_VALIDATION_FAILED
WFO_FAILED
ARTIFACT_SERIALIZATION_FAILED
RUN_CANCELLED
INTERNAL_ERROR
```

Backend luu traceback server-side. API tra safe message, error code, run id va
stage. UI co retry cho transient error, khong retry domain-validation error.

---

## 21. Performance Rules

- load/normalize market tape mot lan moi worker run;
- warm Numba kernel truoc khi bao timed progress;
- khong JSON serialize full hourly tape trong summary endpoint;
- dung Parquet artifact va columnar chart payload;
- downsample chi presentation series, khong downsample metrics/accounting;
- pagination/filter trial table tai server;
- mot WFO worker mac dinh de tranh RSS competition;
- config hash co the reuse completed artifact, nhung khong reuse failed/partial run;
- process state phai duoc cleanup sau success/failure/cancel;
- frontend chart data duoc memoize theo `run_id + segment + range`.

---

## 22. Security And Deployment

Localhost la deployment dau tien:

```text
backend: 127.0.0.1:8000
frontend: 127.0.0.1:5173
```

Khong bind `0.0.0.0` tren public VPS trong prototype mac dinh.

Truoc public IP:

- authentication;
- TLS reverse proxy;
- restricted CORS;
- rate limits;
- artifact access authorization;
- no local source/data paths in responses;
- no arbitrary file path from request;
- no arbitrary Python execution;
- secrets through environment only.

---

## 23. Test Strategy

### 23.1. Strategy Tests

- old/new signal parity;
- deterministic params;
- required-column validation;
- hard-SL path;
- no mutation of input DataFrame;
- repeated-run/Numba parity.

### 23.2. Backend Tests

- request validation;
- data boundary and timezone;
- QuantBT wrapper smoke voi trials nho;
- run windows match exact half-open request;
- default three-window preflight rejects overlap, gap va invalid order;
- selected/deployment params match explicit backend policy;
- metrics and equity reconciliation;
- segment backtests use identical frozen params;
- each segment resets account to configured initial capital;
- calendar equity has explicit null breaks at segment boundaries;
- rebased equity does not feed any metric;
- artifact round-trip;
- failed job cleanup;
- repeated run isolation;
- API schema snapshots.

### 23.3. Three-Window Domain Tests

- calibration endpoint receives only IS+OOS rows;
- Holdout is loaded/evaluated only after selected params are frozen;
- mutating every Holdout OHLCV value leaves IS trials, OOS candidates and
  selected params bitwise/equivalent unchanged;
- mutating OOS leaves IS trial suggestions and IS scores unchanged, while final
  candidate selection is allowed to change;
- only top IS candidates receive OOS metrics;
- OOS replay never emits new Optuna trial ids;
- selected params equal QuantBT Mode 1 selected record;
- direct `QuantBTEndpoint.train_test_split` parity for trial/candidate metadata;
- direct `QuantBTEndpoint.pct_equity` parity for IS, OOS and Holdout metrics;
- final equity in every segment equals last equity point;
- no timestamp appears in more than one segment;
- exact June/July 2025 boundary test at hourly and daily timeframe;
- random-seed deterministic replay when seed is not null;
- `seed=None` is recorded as non-deterministic search provenance.

### 23.4. Advanced WFO Tests

- fold count/date correctness;
- capability endpoint matches `walkforward_support_matrix()`;
- unsupported mode/schedule combinations fail preflight;
- study lifecycle/count matches `optimization_schedule`;
- trial/candidate count matches the configured protocol;
- selected trial/objective matches QuantBT metadata;
- `params_by_fold` and selected params semantics match public metadata;
- stitched target/account parity;
- configured fold-boundary policy is preserved without fabricated trades;
- no frontend transform changes trial/candidate values.

### 23.5. Frontend Tests

- metric formatting;
- chart series transform;
- protocol switch shows only relevant controls;
- three-window date editor blocks overlap and previews row counts;
- Advanced WFO renders every capability returned by API;
- process timeline follows structured run events;
- Compare chart never connects fresh-account segment boundaries;
- fold selection cross-filter;
- trial filters;
- loading/failed/cancelled states;
- accessibility labels/tooltips;
- no text overflow;
- responsive screenshots.

### 23.6. E2E Gate

Playwright desktop and mobile:

1. open actual run workspace;
2. choose dataset/symbol/timeframe and edit three windows;
3. pass preflight and submit smoke run;
4. observe IS optimization, OOS replay and Holdout stages;
5. open completed Overview and compare three equity segments;
6. inspect selected params and candidate trace;
7. verify trial/parameter cross-filter;
8. reopen immutable submitted config;
9. verify audit manifest and export;
10. switch to Advanced WFO and verify conditional options;
11. assert no overlap, blank canvas or console error.

### 23.7. Real Strategy Certification

Tren Delta-RSI data that:

1. run default dates voi reduced trials cho smoke;
2. run production trial budget mot lan de luu stakeholder fixture;
3. compare portal artifact voi direct notebook-equivalent QuantBT calls;
4. verify Holdout mutation invariant tren mot copy cua data;
5. archive config, selected params, trial/candidate tables va segment metrics;
6. record wall time, peak RSS, artifact size va chart payload size.

---

## 24. Implementation Phases

> Trang thai brief/duyet/report cua tung phase duoc track tai §27.8; thu tu
> thuc thi da khoa tai §27.6. Pre-P0 da hoan thanh; P0-P7 chua bat dau.

### Pre-P0 - Backend Foundation And Repository Safety

Status: **Completed on `dev`**.

Muc tieu cua pre-phase la tao mot backend base co the giao cho agent khac ma
khong cho phep no sua strategy core hoac QuantBT.

Deliverables:

- repository rieng voi `main` va `dev`;
- root `AGENTS.md`, `.gitignore`, protected-source checksum va commit discipline;
- installable `backend/` package theo src layout;
- typed protocol/window/parameter/account/execution request contracts;
- pure data validation va three-window partitioning;
- read-only Delta-RSI adapter/registry boc `strategy/main.py`;
- lazy QuantBT capability gateway, khong import heavy kernel luc API startup;
- filesystem artifact repository voi atomic writes va path containment;
- FastAPI app factory voi health, strategy, capability va preflight routes;
- unit/API tests cho import safety, contracts, boundary va protected files.
- dynamic Binance provider goi canonical `CryptoBinance1m` DuckDB hot path;
- market smoke script ghi rows, range, content hash, missing bars va load time.

Gate:

```text
strategy/main.py checksum unchanged;
no QuantBT source file changed;
backend imports without running strategy/WFO;
three-window preflight is deterministic and rejects invalid boundaries;
API smoke and backend tests pass;
main remains baseline and all implementation commits live on dev.
```

Pre-P0 khong chay production WFO va khong thay the cac Phase P0-P7. No chi tao
foundation, contracts va safety gates de cac phase sau implement domain runner,
artifacts va UI tren mot architecture on dinh.

Completion evidence:

```text
backend tests: 30 passed;
protected strategy checksum: pass;
actual local QuantBT capability rows: 9;
backend wheel build: pass;
ETHUSDT 1h real data: 57,914 bars, 0 missing, 0.981s loader time;
main branch remains baseline;
implementation commits are isolated on dev.
```

### Phase P0 - Protocol Freeze, UI Reference Map And Golden Baseline

Deliverables:

- freeze current strategy behavior;
- create mock/real-small fixture;
- capture golden signals and current QuantBT result;
- freeze exact three-window half-open date contract;
- freeze Mode 1 IS-search/OOS-selection/Holdout-evaluation flow;
- define Pydantic discriminated request/artifact schemas;
- define data provider protocol;
- map `uiux-design.md` tokens/components to portal screens (da ghi tai
  §27.2-27.4 trong planning 2026-08-10, P0 khong lap lai);
- document capability gaps from public QuantBT results;
- record that QuantBT remains read-only.

Gate:

```text
strategy golden parity passes;
three-window boundaries and anti-leakage invariants are executable tests;
current QuantBT metadata can be serialized without repr fallback;
no UI code yet.
```

### Phase P1 - Strategy Package And Market Data Foundation

Deliverables:

- clean strategy package;
- strategy registry;
- market-data adapter;
- remove notebook display/plot/global execution from runtime path;
- typed strategy/data specifications;
- data provenance/hash/quality report;
- Numba warm-up hook;
- strategy parity and data-boundary tests.

Gate:

```text
strategy import has no side effects;
old/new pos_weight, exit_type and exit_price pass golden parity;
provider returns deterministic UTC OHLCV windows and provenance.
```

### Phase P2 - Three-Window QuantBT Orchestration

Deliverables:

- `ThreeWindowRunner` and `QuantBTAdapter`;
- IS+OOS-only calibration tape;
- public `train_test_split(mode_1_decay)` integration;
- selected-params freeze artifact;
- fresh-account IS/OOS/Holdout replay;
- selection trace, metrics and raw series artifacts;
- calendar/rebased presentation series;
- domain, leakage-mutation and direct-QuantBT parity tests.

Gate:

```text
mutating Holdout cannot change selected params or calibration artifacts;
selected params exactly match public QuantBT metadata;
three segment metrics/equity match direct pct_equity runs;
no equity line is fabricated across account resets.
```

### Phase P3 - Advanced WFO Compatibility And Artifact Schema

Deliverables:

- capability adapter over `walkforward_support_matrix()`;
- typed Advanced WFO request for every supported option;
- conditional validation by mode/schedule;
- normalize fold/trial/candidate/params metadata;
- immutable schema-versioned artifact repository;
- export JSON/CSV/Parquet;
- regression tests for supported mode/schedule matrix.

Gate:

```text
unsupported combinations fail preflight;
supported combinations route unchanged to public QuantBT API;
serialized values preserve QuantBT source values and semantics;
completed artifact can be reopened without QuantBT rerun.
```

### Phase P4 - API, Jobs, Persistence And Progress

Deliverables:

- FastAPI application;
- run process worker;
- filesystem repository;
- status state machine;
- SSE stage updates;
- list/read/export endpoints;
- OpenAPI contract tests;
- safe error handling.

Gate:

```text
API remains responsive during WFO;
run survives browser refresh;
completed artifacts can be reopened without rerun;
failed workers release process/memory state.
```

### Phase P5 - Configuration Workspace And Run UX

Deliverables:

- React/Vite/Tailwind scaffold;
- typed API client;
- Three-Window/Advanced WFO segmented config;
- dataset/symbol/timeframe controls;
- date-window editor and proportional timeline preview;
- conditional WFO option groups;
- account/execution controls;
- preflight validation;
- structured run stepper and terminal panel;
- loading/error/empty states.

Gate:

```text
manager can configure and launch both protocols without code;
default form cannot submit overlapping windows;
every visible option maps to typed API fields;
run progress never fabricates trial-level events.
```

### Phase P6 - Result, Optimization And Execution Analytics

Deliverables:

- Overview comparison surface;
- Optimization process timeline and selection funnel;
- trial/candidate explorer;
- parameter sensitivity/distribution/parallel-coordinate charts;
- Execution target/account charts subject to capability flags;
- Audit view and artifact exports;
- linked filters, zoom and selected-trial state;
- component/unit/accessibility tests.

Gate:

```text
all displayed numbers originate from artifact/API;
IS/OOS/Holdout comparison uses correct segment series;
candidate click cross-filters every related chart/table;
missing fill/margin capabilities are omitted, not invented.
```

### Phase P7 - Real Strategy Certification, Visual QA And Handoff

Deliverables:

- full smoke on the real Delta-RSI dataset;
- production-budget stakeholder run;
- Holdout mutation certification;
- backend/frontend/E2E regression;
- Playwright screenshots desktop/mobile;
- chart pixel/nonblank checks;
- performance and RSS report;
- README with local startup commands;
- artifact schema and API docs;
- known limitations.

Gate:

```text
golden parity passes;
real run completes and reopens from artifacts;
no frontend overlap/blank chart/console error;
claims match QuantBT validation metadata;
localhost workflow is reproducible from a clean environment.
```

---

## 25. Acceptance Criteria

Prototype duoc coi la hoan thanh khi:

- backend khong con phu thuoc notebook globals;
- strategy parity voi source da paste;
- manager co the chay mot run tu UI;
- run co progress va khong block API;
- default run optimize IS, select bang OOS decay va evaluate Holdout Live;
- Holdout mutation test chung minh Holdout khong tham gia selection;
- mot immutable selected-params artifact duoc replay tren ca ba segment;
- result periods va charts match backend artifacts;
- three-window va Advanced WFO configs deu co typed preflight;
- WFO fold/trial/candidate/params history drill-down duoc;
- selected/deployment params provenance co trong audit artifact;
- equity va metrics parity voi QuantBT;
- chart khong tinh lai domain metrics;
- artifact co version/hash/config day du;
- reload browser khong mat completed result;
- full test va visual gate pass.

---

## 26. Quyet Dinh Can Giu Nguyen Khi Implement

1. Backend contract lam truoc frontend.
2. QuantBT la accounting/selection source of truth.
3. Portal khong duplicate WFO objective.
4. Strategy code pure va khong co presentation side effect.
5. Long-running run la asynchronous job.
6. Filesystem artifact repository du cho prototype; chua can database.
7. Frontend uu tien actual charts/results va khong day backend assumptions ra
   main UI.
8. Default parameter policy la single IS/OOS Mode 1 robust-decay selection;
   Advanced WFO dung params semantics/policy explicit tu QuantBT metadata.
9. Holdout Live khong bao gio duoc dua vao calibration call.
10. QuantBT repository la read-only trong task nay.
11. Khong public VPS truoc auth/TLS hardening.

Day la baseline implementation plan. Bat ky thay doi nao lam frontend tinh lai
PnL/metrics, portal tu chon params, hoac can sua QuantBT deu phai dung lai va
review lai domain contract/scope voi user truoc khi code tiep.

---

## 27. Execution Plan Post Pre-P0 (chot 2026-08-10)

Muc nay chot phan con thieu sau Pre-P0, design system cua portal UI va thu tu
phase da khoa. No khong thay cac contract phia tren; no dinh nghia cach build
chung theo dung thu tu.

### 27.1. Backend Gap Audit

Da co tren `dev` (da verify bang doc code + chay test):

- typed request contracts: `PortalRunRequest`, `ThreeWindowConfig`,
  `AdvancedWalkForwardConfig`, `ParameterSpec`, `AccountConfig`,
  `ExecutionConfig`;
- data validation, three-window partition, provenance/content hash;
- market providers: dynamic `CryptoBinance1m` DuckDB (default), manifest,
  in-memory;
- `StrategyRegistry` + `DeltaRsiStrategyAdapter` (lazy import kernel);
- `QuantBTGateway` lazy: support matrix, `validate_param_ranges`,
  `train_test_split`, `pct_equity`;
- `ArtifactRepository`: atomic JSON/Parquet, path containment;
- API: health, strategies, datasets, capabilities, runs/preflight;
- error taxonomy mot phan (5/10 ma cua §20);
- 30 backend tests + protected checksum gate.

Con thieu, map theo phase:

| # | Gap | Phase | Contract ref |
|---|-----|-------|--------------|
| B1 | golden signal fixture (trend up/down, high-vol reversal, low-volume, hard-SL) + old/new parity harness | P0 | §6.3 |
| B2 | canonical serializer cho QuantBT metadata/DataFrame/Timestamp, khong repr fallback | P0 | §11.4 |
| B3 | capability-gap note tu public QuantBT result (field nao co/khong tra ve) | P0 | §11.2 |
| B4 | strategy package layout (`strategy/delta_rsi.py`, `specification.py`, `registry.py`) + Numba warm-up hook; `main.py` giu protected, chi wrap | P1 | §5, §6 |
| B5 | `ThreeWindowRunner`/`QuantBTAdapter`: calibration tape = IS+OOS only, `train_test_split(mode_1_decay)`, freeze `selected_params.json` truoc khi doc Holdout | P2 | §7.2, §10 |
| B6 | fresh-account replay `pct_equity` cho IS/OOS/Holdout bang frozen params; metrics + raw series | P2 | §7.3 |
| B7 | `calendar_equity` (null break tai boundary) + `rebased_equity` (base 100, khong feed metric) | P2 | §7.3 |
| B8 | leakage-mutation tests + direct-QuantBT parity tests | P2 | §23.2, §23.3 |
| B9 | Advanced WFO routing qua `walk_forward` + conditional validation theo support matrix | P3 | §8, §10 |
| B10 | artifact schema version + full layout §11 + export JSON/CSV/Parquet | P3 | §11 |
| B11 | run state machine + `RunService`/`JobService` + mot `ProcessPoolExecutor` worker | P4 | §4.1, §9 |
| B12 | SSE `/api/runs/{id}/events` stage-accurate, khong fabricate trial progress | P4 | §9 |
| B13 | full run API: POST /api/runs, list/detail/summary, cancel, `wfo/*`, `series/{segment}`, audit, export; server-side filter/downsample | P4 | §12 |
| B14 | hoan thien 10 error codes + safe message + server-side traceback | P4 | §20 |

### 27.2. Portal Design System — "Fund Paper"

Ba nguyen tac: (1) provenance first — moi con so truy duoc ve artifact;
(2) honest surface — thieu capability thi omit, khong lap day; (3) quiet
precision — khong decoration, nhip doc nhu bao cao quy.

Color tokens (vai tro giu dung `uiux-design.md`):

```text
--paper          #FAF9F5   nen trang
--paper-raised   #FFFFFF   the noi / chart frame
--paper-sunken   #F4F2EC   vung chim nhe: table stripe, code block
--ink            #1C2532   chu chinh
--ink-soft       #4E5A6E   chu phu
--ink-faint      #939DB0   chu mo / label
--line           #E3E0D7   vien chinh
--line-soft      #EFEDE4   vien nhat / chart grid
--accent         #0F4C5C   structural petrol dam
--accent-soft    #E2EDF0
--accent-2       #9A6A1F   highlight gold duc
--accent-2-soft  #F4ECDB
--good           #1E7B4F   --good-bg #E3F1E9
--bad            #B43A3A   --bad-bg #F7E8E8
--ink-panel      #161E2A   be mat toi duy nhat: LedgerTerminal
--ink-panel-fg   #C9D4E3   chu tren ink-panel
```

`--ink-panel` la mo rong co y thuc cua `uiux-design.md`: mot be mat toi duy
nhat cho structured terminal; khong dung cho bat ky noi dung nao khac.

Chart tint scales (chi cho heatmap/sequential/band, khong dung cho UI chrome):

```text
accent-100 #E7F0F2  accent-300 #A8C6CE  accent-500 #4E8697
accent-700 #226173  accent-900 #0F4C5C
good/bad co buoc tint tuong ung (100..900) cho PnL alpha scaling
```

Window role colors (semantic rieng cua portal, co dinh tren moi view/chart):

```text
IS            #7A8699   band 6% alpha, hairline 1px
OOS           #0F4C5C   = accent
Holdout Live  #9A6A1F   = accent-2
```

Selection semantics: selected = ink diamond filled; candidate = accent circle
outline; pruned = ink-faint `x`. Khong them mau ngoai bang tren; SVG
dark-theme rieng van duoc phep cho overlay chart dac thu nhu reference.

Typography (self-host qua Fontsource: Newsreader, Inter, JetBrains Mono;
khong CDN):

| Token | Font | Size/Line | Weight | Dung cho |
|---|---|---|---|---|
| display-2xl | Newsreader | 32/40 | 500 | view title |
| display-xl | Newsreader | 24/32 | 500 | section heading |
| display-lg | Newsreader | 18/26 | 500 | card/panel title |
| dek | Newsreader italic | 15/24 | 400 | mo ta ngan duoi heading |
| body | Inter | 14/22 | 400 | noi dung |
| body-sm | Inter | 13/20 | 400 | phu de, dense form |
| label | JetBrains Mono | 11/16 | 500 uppercase | eyebrow, table header, chip |
| data | JetBrains Mono | 13/20 | 400 | table number, timestamp |
| data-lg | JetBrains Mono | 20/28 | 600 | KPI value |
| data-xl | JetBrains Mono | 28/36 | 600 | MetricHeroStrip value |

Rules: so luon mono + `font-feature-settings: "tnum"`, can phai; heading serif;
letter-spacing 0 ke ca uppercase label (§19.1); khong dung serif cho so.

Spacing / radius / elevation / motion:

```text
spacing: 4pt grid (4/8/12/16/24/32/48); section gap 40px; card padding 16-20px
radius: 4 input/chip; 6 popover; 8 card (max); badge/flag = pill 999
elevation:
  e1 0 1px 2px rgba(28,37,50,.05)    card
  e2 0 4px 12px rgba(28,37,50,.08)   drawer/popover
  e3 0 10px 28px rgba(28,37,50,.12)  modal
motion: 120ms hover / 200ms state / 320ms drawer; ease cubic-bezier(.2,.6,.2,1);
  khong spring/bounce; ton trong prefers-reduced-motion
```

Chart language (mot module duy nhat `charts/theme.ts` chua ECharts defaults):

- grid: dashed 1px `--line-soft`; axis label mono 11 `--ink-faint`; axis line
  `--line`;
- tooltip: `--paper-raised`, border `--line`, shadow e2, value mono; trigger
  axis-cross cho time series;
- legend: top-left, mono 11, inactive `--ink-faint`;
- line widths: primary 1.75; secondary 1.25 dashed `--ink-faint`;
- drawdown area: `--bad` 12% alpha, khong line;
- window bands: role color 6% alpha + hairline 1px role color + flag label mono
  10px tren top edge;
- dataZoom: inside + slider 18px, brush `--ink-faint`;
- canvas renderer khi >5k points; progressive cho scatter lon;
- empty chart: dashed frame + mono note "Khong co du lieu cho segment nay";
- moi chart co fig number (EChart N), title, `data-source-id`, export CSV/PNG.

Number & time format (mot module duy nhat `lib/format.ts`):

- percent: 2dp, co dau cho delta (`+12.40%` / `-3.10%`);
- currency: thousand separator, 0dp cho equity lon, 2dp khi <1000;
- ratio (Sharpe/Sortino/PF): 2dp; decay: 3dp;
- hash: 8 ky tu dau + copy button; timestamp: `YYYY-MM-DD HH:mm UTC`;
- duration: compact (`3m 42s`); bars count: thousand separator.

Tailwind: token CSS dat trong `src/styles/tokens.css` (`:root`), Tailwind theme
tham chieu `var(--token)`; component khong chua hex (CI frontend co lint check
cho rule nay). Dark mode: out of scope prototype.

Layout: desktop-first 12-col, max content 1440px; top bar compact; config la
drawer; card radius <=8px, shadow rat nhe; page sections unframed; chart
heights co dinh (equity 420, underwater 160, explorer 360–480) de filter/tab
khong gay layout shift. Breakpoint, print va a11y theo §19.4.

### 27.3. Signature Components (fund-grade, dung chung nhieu view)

1. **RunPassport** — sticky provenance strip ngay duoi TopBar tren moi result
   view: `[status badge] run_id mono-8 | strategy chip | symbol/timeframe chip |
   protocol chip | config hash mono-8 + copy | submitted_at mono`. Moi man hinh
   tra loi duoc "dang xem run nao, tu config nao" trong mot dong.

2. **VerdictChain** — selection provenance chain ngang tren Overview:
   `IS Search (n trials) -> Top Candidates (n) -> OOS Replay (n) -> Frozen theta*
   (trial_id + hash) -> Holdout Verdict (Sharpe, MaxDD)`. Moi node: label mono
   uppercase + value `data-lg` + underline role color; edge = hairline + arrow;
   node Holdout dung gold. Chi hien so that tu artifact; thieu so thi node
   hien `--`, khong suy dien.

3. **ChartFigure** — frame chuan cho moi chart: `fig-num` mono highlight, title
   `display-lg`, note slot, export menu (CSV/PNG), fixed height; footer chua
   `data-source-id` + artifact hash mono-8. Publication cadence trong mot app
   operational.

4. **MetricHeroStrip** — 5 KPI (Final Equity, Total Return, Sharpe, MaxDD,
   Trades): label mono uppercase + value `data-xl` + sub-row mono nho
   (target/percentile) + sparkline 80x24 (SVG polyline, role color theo segment
   dang chon).

5. **ComparisonMatrix** — rows = metric, cols = IS/OOS/Holdout; delta columns
   co mui ten + good/bad tint; cot "prefer" (segment tot nhat theo metric) nen
   `--good-bg` nhe; so mono can phai; row hover `--paper-sunken`.

6. **WindowTimelineEditor** — ba cua so: 3 row date/time picker la source of
   truth; proportional timeline ben phai cho drag boundary handle snap-to-bar;
   overlap hien hatch `--bad`, gap hien hatch `--accent-2` ngay khi keo; bars
   count mono duoi moi vung. Drag la enhancement, khong thay picker.

7. **LedgerTerminal** — structured run log tren `--ink-panel` (be mat toi duy
   nhat trong app): mono 12px, timestamp column fixed-width, stage chip role
   color, filter bar theo stage/trial, JSONL download. Cam giac desk terminal
   nhung chi render structured events, khong parse stdout.

8. **TermSheet** — preflight summary kieu term sheet: definition list 2 cot
   (dt mono uppercase / dd `data`), tung muc co badge pass/fail, config hash o
   cuoi + Run CTA primary voi keyboard hint `Cmd+Enter`.

9. **SignoffSheet** — audit reconciliation dang bang "ky duyet": check name,
   expected vs actual (mono), badge pass/fail, verified-at timestamp; print
   friendly (day la trang audit in duoc).

10. **FoldGantt** (Advanced WFO) — moi fold mot hang: train bar `--accent-soft`,
    test bar `--accent` solid, boundary marker theo policy; click fold
    cross-filter toan view; tooltip mono dates/trials/seed.

11. **DecayLollipop** — stem + dot per candidate (selected = ink diamond),
    threshold band `--accent-2-soft` cho vung decay chap nhan duoc; axis mono.

12. **StateViews** — empty (placeholder dashed + guideline italic), loading
    (skeleton shimmer 1200ms, tat khi reduced-motion), failed (error code chip
    + safe message + retry neu transient), cancelled, partial-artifact
    (banner `--accent-2-soft` ghi ro phan artifact con thieu).

### 27.3.1. Per-View Mapping

Shell:

| Component | Vai tro |
|---|---|
| TopBar | strategy selector, dataset/symbol/timeframe chip, run selector, RunStatusBadge, Run CTA, ExportMenu |
| NavTabs | Overview / Optimization / Parameters / Execution / Audit |
| ConfigDrawer | config rail 360px -> drawer sau submit; submitted config immutable, xem lai bat ky luc |
| RunStatusBadge | mau theo state machine §9 |
| WindowRoleChip | chip IS/OOS/Holdout dung role color |

Config workspace (P5):

| Component | Ghi chu |
|---|---|
| ProtocolSegmentedControl | Three-Window default; Advanced WFO |
| ThreeWindowEditor | 3 row dong bo: start/end picker + computed bars; block overlap/gap ngay khi edit |
| WindowTimelineEditor | = signature #6; timeline ti le thoi gian ben phai, drag handle snap-to-bar, gap/overlap realtime |
| SearchSpaceEditor | 8 scalar params, kind-aware input (int/float range, fixed, categorical), reset-to-default |
| OptionGroup collapsible | Split/Optimization/Selection/Account/Execution; group co loi tu mo |
| FoldPreview | Advanced WFO: fold preview tu capability/config truoc khi run |
| TermSheet | = signature #8; checklist schema/boundary/rows/params + config hash; Run CTA disabled den khi pass |

Run progress (P5):

| Component | Ghi chu |
|---|---|
| RunStepper | stage state machine; stage-accurate, khong fake percent |
| LedgerTerminal | = signature #7; structured event stream mono, filter theo stage; JSONL download |

Overview (P6):

| Component | Ghi chu |
|---|---|
| MetricHeroStrip | uiux §7.1: 5 KPI + sparkline equity chuan hoa |
| SegmentControl | IS \| OOS \| Holdout Live \| Compare |
| EquityChart | 3 trace khong noi (null break), window bands role color, boundary dividers, toggle Capital/Rebased-100 |
| UnderwaterChart | linked zoom voi equity |
| MonthlyReturnHeatmap | compact, theo segment dang chon |
| ComparisonMatrix | = signature #5; rows = metric §11.3, cols = IS/OOS/Holdout + delta arrow |
| SelectedParamsCard | frozen params tom tat |
| VerdictChain | = signature #2; IS search -> candidates -> OOS replay -> frozen theta* -> Holdout verdict |

Optimization (P6):

| Component | Ghi chu |
|---|---|
| ProcessTimeline | Optimize IS -> Top Candidates -> Replay OOS -> Select -> Freeze -> Evaluate; click stage = filter |
| SelectionFunnel | sampled -> valid -> candidates -> selected, actual counts |
| CandidateSharpeBars | grouped IS/OOS Sharpe top candidates |
| DecayLollipop | decay per candidate, marker selected |
| ObjectiveDistribution | candidate objective histogram |
| TrialScatter | objective theo trial id, canvas renderer, shape = selected/candidate/pruned |
| CandidateScatter | IS Sharpe vs OOS Sharpe; click cross-filter toan bo |
| ConvergenceChart | best-so-far theo trial id |
| TrialTable | TanStack Table, server-side filter §12; click = highlight |
| ParallelCoordinates | top candidates, brush link voi Parameters view |
| SelectionTraceRail | IS rank -> IS score -> OOS score -> decay -> candidate score -> selected |
| LedgerTerminal | = signature #7; terminal mono + filter stage/trial; JSONL export |
| RunDetailsCollapsible | schedule/validation_claim/causality_claim/params_semantics; default collapsed |

Parameters (P6):

| Component | Ghi chu |
|---|---|
| CoverageHistogram | search-space coverage tung scalar param |
| ObjectiveVsParam | scatter/boxplot objective theo param |
| PairwiseContour | heatmap/contour 2 params duoc chon — cau tra loi truc tiep cho overfitting |
| ParallelCoordinates | candidates IS + OOS replayed |
| SelectedParamsTable | gia tri + percentile trong range |
| ParamsByFoldHeatmap | normalized, Advanced WFO |
| ParamTrajectory | selected param theo fold, Advanced WFO |
| StructuralContractPanel | immutable thesis, tach khoi calibration params |

Execution (P6):

| Component | Ghi chu |
|---|---|
| PriceTargetChart | close + long/short entry-exit markers, label `Target transition`; chi goi `Fill` khi co audited fills |
| PositionRegimeStrip | strip trang thai position |
| EquityDrawdownLinked | linked zoom |
| CostTimeline | fee/funding/margin neu capability co; thieu thi omit |
| TransitionTable | theo timestamp |

Audit (P6):

| Component | Ghi chu |
|---|---|
| ManifestPanel | immutable run manifest |
| ConfigSnapshot | full submitted config readonly |
| DataQualityPanel | content hash, missing bars, range |
| SignoffSheet | = signature #9; badge pass/fail cho cac checks §18, print friendly |
| CapabilityFlagsPanel | warnings/fallback flags |
| ArtifactDownloadList | JSON/CSV/Parquet links |

Moi view co day du state: loading / empty / failed / cancelled /
partial-artifact. Moi chart co: fig title, data-source id, export CSV/PNG,
fixed height.

### 27.4. View Blueprints (wireframe chuan de implement)

Config workspace (first screen, chua co run):

```text
┌ TopBar: strategy | dataset/symbol/timeframe | run selector | status | Run | Export ┐
├ Config rail 360px ────────────────┬ Preview + preflight ──────────────────────────┤
│ 1 Strategy / dataset chips        │ WindowTimelineEditor (proportional)           │
│ 2 ProtocolSegmentedControl        │   IS slate | OOS petrol | Holdout gold        │
│ 3 ThreeWindowEditor (3 rows)      │   bars count mono duoi moi vung               │
│ 4 SearchSpaceEditor (8 params)    │ TermSheet:                                    │
│ 5 Optimization group (collapsed)  │   [pass] schema  [pass] boundaries            │
│ 6 Account/Execution group         │   [pass] rows    [pass] parameter space       │
│ 7 Advanced WFO: FoldPreview       │   config hash mono-8        [ Run  Cmd+Enter ]│
└───────────────────────────────────┴───────────────────────────────────────────────┘
```

Overview (manager value cao nhat, build dau tien trong P6):

```text
TopBar
RunPassport
MetricHeroStrip (5 KPI + sparkline)
SegmentControl [IS | OOS | Holdout Live | Compare]      toggle [Capital | Rebased 100]
┌ EquityChart 420px: window bands, boundary flags, null breaks, linked zoom ┐
┌ UnderwaterChart 160px (linked) ────────────────┬ MonthlyReturnHeatmap ────┤
ComparisonMatrix (metrics x segments + delta)
VerdictChain (5 nodes, actual counts)
SelectedParamsCard (frozen theta*)
```

Optimization (man hinh trung tam):

```text
RunPassport
ProcessTimeline: Optimize IS -> Top Candidates -> Replay OOS -> Select -> Freeze -> Evaluate
┌ CandidateScatter IS x OOS (canvas) ─────────────┬ SelectionFunnel counts ─┤
┌ DecayLollipop (threshold band) ─────────────────┬ CandidateSharpeBars ────┤
┌ TrialScatter objective x trial_id (canvas) ─────┬ ConvergenceChart ───────┤
TrialTable (server-side filter, click = cross-highlight)
ParallelCoordinates (top candidates, brush link)
SelectionTraceRail (IS rank -> ... -> selected params)
RunDetailsCollapsible (collapsed) | LedgerTerminal (structured events, JSONL)
```

Parameters:

```text
RunPassport
SelectedParamsTable (value + percentile trong range)
┌ CoverageHistogram grid (8 scalar params) ──────────────────────────────────┐
┌ ObjectiveVsParam (param picker, scatter/box) ───┬ PairwiseContour (A x B) ─┤
ParallelCoordinates (IS candidates + OOS replayed)
StructuralContractPanel (immutable thesis) — tach biet calibration params
[Advanced WFO] ParamsByFoldHeatmap + ParamTrajectory
```

Execution:

```text
RunPassport + SegmentControl
┌ PriceTargetChart (close + Target transition markers, khong goi Fill) ──────┐
┌ PositionRegimeStrip 40px ──────────────────────────────────────────────────┐
┌ EquityDrawdownLinked ────────────────────────────┬ CostTimeline* ──────────┤
TransitionTable (timestamp, target, position, exit_type, exit_price)
* chi render khi capability co fee/funding/margin; thieu thi omit + flag
```

Audit:

```text
RunPassport
┌ ManifestPanel (immutable) ────────────┬ DataQualityPanel (hash, bars) ─────┐
┌ ConfigSnapshot (readonly JSON cua submitted config) ───────────────────────┐
SignoffSheet (reconciliation checks, badge pass/fail, print friendly)
CapabilityFlagsPanel | ArtifactDownloadList | StructuralContractPanel
```

### 27.5. Frontend Architecture Decisions

- Stack dung §4.2; router chon TanStack Router de co typed search params:
  `run_id`, segment, selected trial/candidate, chart range nam tren URL
  (deep-link, refresh-safe).
- API client: typegen tu FastAPI OpenAPI (`openapi-typescript`) + fetch wrapper
  + TanStack Query hooks; backend schema la single source of truth.
- Charts: `echarts` core modular import + thin React wrapper (~50 LOC,
  resize-observer, canvas renderer cho series lon); khong dung wrapper package
  nang.
- SSE: `EventSource` tren `/api/runs/{id}/events`, fallback polling 2s khi mat
  ket noi.
- Chart option memo theo `run_id + segment + range` (§21); frontend khong tinh
  domain metric.
- Folder theo §5, voi `features/optimization` thay `features/walkforward` de
  trung ten nav; styles tach `tokens.css` / `base.css` / `print.css`.
- Test: Vitest + RTL cho transform/state; Playwright visual gate
  1440x900 / 1280x720 / 390x844 (§19.4).

### 27.6. Thu Tu Phase Da Khoa

Thu tu tuyen tinh, khong song song hoa frontend voi backend vi §26.1
(contract-first) va vi chart P6 can artifact that tu P2/P3 de khoi phai viet
lai transform tren mock:

| Order | Phase | Scope chinh | Gate/verify chinh | Size |
|---|---|---|---|---|
| 1 | P0 | B1 golden fixture + parity harness, B2 canonical serializer, B3 capability-gap note (design map da hoan thanh: §27.2-27.5; P0 khong code UI) | golden parity pass; serializer khong repr; `./scripts/test_backend.sh` xanh | S–M |
| 2 | P1 | B4 strategy package layout + Numba warm-up hook | strategy import no side-effect; parity giu nguyen | S |
| 3 | P2 | B5–B7 orchestration + freeze + 3-segment replay + presentation series; B8 leakage/parity tests | Holdout mutation khong doi selected params; metrics parity voi `pct_equity` truc tiep | L |
| 4 | P3 | B9 Advanced WFO routing + conditional validation; B10 artifact schema version + export | unsupported combo fail preflight; artifact reopen khong can QuantBT rerun | M–L |
| 5 | P4 | B11–B14 state machine + worker + SSE + full run API + error taxonomy | API responsive trong luc WFO; run song lai sau refresh; failed worker giai phong RSS | L |
| 6 | P5 | frontend scaffold + tokens + config workspace + run UX | manager config + launch ca 2 protocol khong code; overlap bi block | M–L |
| 7 | P6 | Overview -> Optimization -> Parameters -> Execution -> Audit | moi so lieu tu artifact/API; cross-filter hoat dong; thieu capability thi omit | L |
| 8 | P7 | real-data certification + visual QA + handoff docs | golden parity + real run reopen + screenshot gate + reproducible | M |

Trong P6, thu tu view: Overview truoc (manager value cao nhat), Optimization
thu hai (man hinh trung tam), sau do Parameters, Execution, Audit.

### 27.7. UI Working Agreements (bat buoc khi build P5/P6)

1. Component chi dung token; khong hex trong component (lint check).
2. Moi so mono + tabular; table number can phai.
3. Moi chart: fixed height, fig title, data-source id, export CSV/PNG.
4. Khong narrative text tren chart surface; methodology nam trong collapsible.
5. Missing capability -> omit component + capability flag, khong invent data.
6. loading/empty/failed/cancelled/partial states cho moi view truoc khi goi la
   xong view do.
7. focus-visible, keyboard order, reduced-motion, print rules cho moi component
   moi (theo uiux §3, §8).
8. Khong reuse cover/abstract/key-finding tren run workspace (§19.2).
9. Chart style chi qua `charts/theme.ts`; number/time format chi qua
   `lib/format.ts`; khong inline style ad-hoc.
10. Be mat toi `--ink-panel` chi cho LedgerTerminal; khong lan sang noi dung
    khac.

### 27.8. Phase Report Workflow Va Status Board

Workflow bat buoc (theo yeu cau cua user, 2026-08-10):

1. Truoc moi phase: dang **Phase Brief** ngan (scope, deliverables, gate, rui
   ro) cho user phe duyet. Khong code khi chua duoc duyet.
2. Implement dung brief; chay gate; neu phai lech brief thi dung lai va bao
   truoc khi tiep tuc.
3. Ghi **Phase Report** vao muc nay (delivered, gate evidence = lenh chay +
   ket qua, deviations), cap nhat status board.
4. User phe duyet report -> mo brief phase tiep theo.

Report template:

```text
#### Phase PX Report (YYYY-MM-DD)
- Delivered: ...
- Gate evidence: `<command>` -> ket qua
- Deviations: ...
- Cho phe duyet de bat dau P(X+1).
```

Status board:

| Phase | Trang thai | Brief duyet luc | Report | Phe duyet luc |
|---|---|---|---|---|
| P0 | cho duyet brief | - | - | - |
| P1 | khoa | - | - | - |
| P2 | khoa | - | - | - |
| P3 | khoa | - | - | - |
| P4 | khoa | - | - | - |
| P5 | khoa | - | - | - |
| P6 | khoa | - | - | - |
| P7 | khoa | - | - | - |
