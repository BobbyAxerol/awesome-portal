# Unified Implementation Plan — QuantBT Portal v0.4

> **Research Loop V1.1 — active planning index, 2026-09-19:** xem [§13](#research-loop-v11)
> cho 24 phase P01–P24, rules phối hợp, test/exit gates và links hi-fi/guide.
> Baseline v0.4 và journal Execution bên dưới giữ nguyên lịch sử, không tự áp
> engine pin/role/status cũ cho campaign Research mới.

> **Trạng thái:** Draft để owner review và chốt thứ tự triển khai<br>
> **Cập nhật:** 2026-08-15<br>
> **Nguồn kiến trúc:** [QuantBT Portal Architecture & UI/UX Final v0.4](./quantbt_portal_architecture_uiux_final_v0.4_vi.md)<br>
> **Phạm vi:** mother Portal, QuantBT Research, Planning, identity, control plane, quant compute, data/artifact, Alpha Platform, Paper/Sandbox/Live và operations<br>
> **Engine baseline:** `quantbt-engine[optimization]==1.1.1` từ PyPI; 1.0.8
> chỉ còn là historical-reader identity khi đọc evidence cũ<br>
> **Data reader baseline:** approved code-only wheel `primus-historical-market-data==0.1.0rc3`, loader contract `hmd-loader-v1`

Tài liệu này là **execution index**, không phải bản viết lại của guide v0.4.
Mọi agent phải đọc phần guide được link trong phase đang làm. Khi có khác biệt,
thứ tự authority là: [§40 Final Configuration Lock](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#40-final-configuration-lock--agent-handoff--baseline-v04)
→ [§P0.25A Auth/Deployment](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#p025a-addendum-draft-v03--portalprimussparkcom-login-nội-bộ-và-identity-bootstrap)
→ [§29 Migration Strategy](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#29-migration-strategy-từ-portal-hiện-tại)
→ nội dung lịch sử trước đó.
Riêng concern Historical Market Data, [§P0.24A Data Consumer Contract](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#p024a-historical-market-data-consumer-contract--addendum-2026-08-15)
là authority trước các mô tả data tổng quát ở §§8, 11 và 24.

---

## 1. Mục tiêu điều hành

Xây một Portal thống nhất, mượt và có khả năng tiến hóa từ hai capability thật
đang có thành platform end-to-end:

```text
Research / Alpha
  → QuantBT Backtest / WFO / Audit
  → Approval / Promotion
  → Paper
  → Sandbox
  → Live Operations
  → Monitoring / Incident / Reconciliation

Planning / Roadmap / Task Board theo dõi toàn bộ lifecycle trên.
```

Thứ tự triển khai là **contract và backend authority trước, UI render sau** trong
mỗi bounded context. Ngoại lệ duy nhất là M-1A: dựng shell/prototype trước để
manager duyệt information architecture, maturity và luồng UX, nhưng vẫn dùng
backend hiện tại và không giả dữ liệu production.

## 2. Guide index bắt buộc cho agent

| Concern | Section phải đọc |
|---|---|
| Prototype, maturity, shell, registry | [§P0](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#p0-giai-đoạn-ưu-tiên-trước--unified-portal-prototype--current-feature-integration) |
| Feature Registry, Screen Contract | [§P0.12–P0.13](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#p012-feature-registry--contract-trung-tâm-của-prototype) |
| Current feature embedding | [§P0.9–P0.11](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#p09-cách-ghép-quantbt-research-vào-shell-chung) |
| Prototype data/fixture policy | [§P0.24](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#p024-prototype-data-và-fixture-policy) |
| Historical Market Data reader/runtime | [§P0.24A](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#p024a-historical-market-data-consumer-contract--addendum-2026-08-15) |
| Edge, login, session, bootstrap | [§P0.25A](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#p025a-addendum-draft-v03--portalprimussparkcom-login-nội-bộ-và-identity-bootstrap) |
| Architecture planes và tech stack | [§§3–6](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#3-nguyên-tắc-kiến-trúc-bắt-buộc) |
| QuantBT 1.0.8 capability | [§7](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#7-full-quantbt-108-integration) |
| Run, study, artifact | [§8](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#8-run-study-và-artifact-architecture) |
| Alpha Platform | [§9](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#9-alpha-platform-và-chuẩn-import-dự-kiến) |
| Domain/API/Paper/Live/Security | [§§10–16](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#10-domain-model-và-lifecycle-xuyên-suốt) |
| UI/UX, IA và 26 screens | [§§17–24](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#17-uiux-direction) |
| Components, responsive, Figma | [§§25–27](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#25-component-system) |
| End-to-end product flows | [§28](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#28-end-to-end-product-flows) |
| Migration M-1A → M8 | [§29](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#29-migration-strategy-từ-portal-hiện-tại) |
| Test strategy và DoD | [§31](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#31-testing-strategy-và-acceptance-gates) |
| Risks và ADR | [§§32–33](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#32-risk-register) |
| Exact v0.4 runtime values | [§40](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#40-final-configuration-lock--agent-handoff--baseline-v04) |

Agent làm screen cụ thể phải đọc thêm đúng subsection Screen 01–26 ở §§21–24;
không suy diễn layout chỉ từ tên task.

## 3. Quyết định kỹ thuật đã khóa

### 3.1 Frontend

- React 18 + Vite + TypeScript; giữ React Router trong migration có chủ đích.
- TanStack Query; thêm TanStack Table/Virtual khi bắt đầu bảng platform.
- React Hook Form + Zod/Ajv cho form sinh từ schema.
- Radix primitives + component do Portal sở hữu; CSS variables là source of
  truth. Tailwind/shadcn chỉ là implementation pattern và phải map vào token.
- ECharts cho quantitative analytics; Lightweight Charts cho candle/order/fill
  overlay. Advanced Charts chỉ mở sau license review.
- Dnd Kit cho Planning; Lucide cho icon.
- Playwright + Vitest + Testing Library + visual regression.
- Không rewrite hai frontend sang framework khác trong M-1A.

### 3.2 Product/control plane

- Node.js LTS; baseline repo hiện tại giữ Node `>=22.12 <23` tới khi có ADR nâng
  version.
- NestJS + Fastify là authoritative Control API/BFF.
- PostgreSQL là system of record cho identity, registry, workflow, audit và
  outbox.
- OpenAPI cho browser contract; Protobuf/Buf hoặc versioned JSON Schema cho
  cross-language events.
- NATS JetStream cho durable job/event; Redis chỉ ephemeral cache/rate limit,
  không làm source of truth.
- Pino structured logging + OpenTelemetry.

### 3.3 Quant compute

- Python 3.12 baseline.
- `quantbt-engine[optimization]==1.1.1` exact pin từ PyPI cho Research hiện
  hành; 1.0.8 chỉ là historical-reader identity khi đọc evidence cũ, không
  được dùng làm runtime/test interpreter của P04+.
- Pydantic v2, PyArrow/Parquet, NATS Python client, pytest/Hypothesis.
- Một heavy run trên một process/container hoặc concurrency được kiểm soát rõ.
- Python worker không sở hữu user session/RBAC, broker secret hoặc business
  state tùy ý.

### 3.3A Historical Market Data consumer

- Portal dùng approved **code-only wheel**
  `primus-historical-market-data==0.1.0rc3`; không import source checkout, không
  `pip install -e`, không tạo local `data_loader.py` và không mount source repo.
- Wheel artifact hiện hành có SHA-256
  `3b2a41b87ff834912556bb3039bf3e3c148bd859a1ced9ee4f52a3c658ca5663`.
- Canonical host storage `/srv/primus/historical-market-data/storage` chỉ được
  mount vào consumer container tại `/data:ro`; runtime đặt
  `HISTORICAL_MARKET_DATA_ROOT=/data` để bắt buộc release-manifest validation.
- `check_val=True`, explicit symbol/time window/minimal columns là default. Không
  forward-fill, sửa, thu thập hoặc suy diễn empty frame thành “zero activity”.
- Crypto naive timestamp được hiểu là UTC; VN naive timestamp được hiểu là
  `Asia/Ho_Chi_Minh`. Adapter normalize rõ ở boundary và giữ source timezone
  trong provenance.
- `quantbt-engine` và Historical Market Data reader là hai dependency độc lập:
  reader cấp immutable input; engine không được tự tìm host path.

### 3.4 Rust fast paths

- Axum + Tokio + Tower; Arrow/Parquet/DataFusion; SQLx; object_store;
  tracing/OpenTelemetry.
- Chỉ mở `artifact-query-rs`, `realtime-gateway-rs` hoặc runner supervisor khi
  benchmark/p95/p99/RSS/backpressure có evidence.
- Rust không duplicate QuantBT accounting và không làm CRUD authority.

### 3.5 Infrastructure

- Compose cho local/CI và prototype VPS; Kubernetes chỉ khi distributed
  workload thực sự cần.
- Cloudflare Access → Tunnel → Nginx loopback TLS → Portal BFF.
- PostgreSQL + S3/MinIO + NATS là nền tảng đầu; Timescale/ClickHouse optional
  theo workload evidence.
- Không thêm Java/Go trong v1, không dùng Celery làm cross-language queue, không
  dùng Kafka/ClickHouse chỉ vì dự đoán scale.

## 4. Baseline thực tế tại thời điểm lập plan

### Đã có

- Một Git monorepo và một Compose-managed stack với một public web gateway.
- QuantBT Research React/FastAPI có New Run, Library, Progress, Overview,
  Optimization, Parameters, Execution và Audit.
- `quantbt-engine==1.0.8` được cài từ PyPI và có synthetic smoke/golden tests.
- Roadmap & Task Board React/FastAPI/SQLite đã hoàn thành phase 5 riêng, được
  build/serve tại `/roadmap-task-board/` và API private qua gateway.
- Fund Paper tokens, Newsreader/Inter/JetBrains Mono, ECharts và nhiều component
  report định lượng.
- Root CI, CodeQL/Dependabot, Compose smoke, image publishing, release/deploy
  skeleton, contributor guardrails và protected branches.
- Historical Market Data có consumer contract và approved non-Deribit reader
  release. U01-BE đã tích hợp exact wheel, bounded provider, read-only mount,
  doctor và target-VPS real-reader smoke; production activation còn chờ host
  reader-group ACL và encrypted publish secret.

### Chưa có

- Hai frontend chưa dùng chung một React shell/component registry; gateway hợp
  nhất deployment nhưng UX vẫn là hai app build riêng.
- Chưa có Feature Registry, Screen Contract, Concern Registry, Command Center
  hoặc commissioned preview chuẩn.
- Chưa có Cloudflare Tunnel/Nginx/Auth implementation trong source.
- Chưa có TypeScript Control API, PostgreSQL authority, NATS, MinIO/S3 artifact
  registry hoặc isolated quant worker.
- Chưa có Engine Capability Manifest, Alpha Registry, Data Catalog, Paper,
  Sandbox, Live hay Rust fast-path services.
- Realtime feed, paper order/fill và paper account state chưa có provider trong
  Portal. Chúng không được phép dùng Historical provider làm fallback và thuộc
  service/contract riêng ở U15–U16.

## 5. Quy tắc triển khai và trạng thái phase

Trạng thái dùng trong tài liệu này:

```text
DONE         code/evidence đã có và gate đã pass
PARTIAL      có baseline nhưng còn deliverable/gate
NOT STARTED  chưa có implementation authority
EXTERNAL     phụ thuộc dashboard, credential, data service hoặc private engine
BLOCKED      dependency được xác nhận là chưa sẵn sàng
```

Mỗi phase phải cập nhật bốn mục trước khi merge:

1. `Đã làm` — commit/PR/evidence thật, không mô tả ý định.
2. `To-do` — task còn mở, mỗi task có owner và acceptance evidence.
3. `Technical debt` — debt mở mới, debt đóng và ngày/phase xử lý.
4. `Exit gate` — test/evidence bắt buộc; không hoàn thành bằng đánh giá cảm tính.

Mỗi thay đổi production phải đi theo thứ tự:

```text
contract/schema → backend/domain tests → API/read model → UI states/wireframe
→ interaction/E2E → performance/security evidence → docs/runbook
```

## 6. Phase map và critical path

| Phase | Tên | Trạng thái đầu kỳ | Outcome chính |
|---|---|---|---|
| U00 | Governance & source-of-truth | PARTIAL | Plan, IDs, ADR/backlog authority |
| U01 | Baseline inventory & golden visual evidence | PARTIAL | Không mất capability hiện tại |
| U01-BE | HMD consumer boundary & real-reader smoke | PARTIAL — CODE COMPLETE | Chờ host ACL/publish secret |
| U02 | Shared foundations & Figma-ready design system | PARTIAL | Một visual/component language |
| U03 | Unified shell, registry & Command Center | PARTIAL — CONTRACT BASELINE | Một mother Portal thật |
| U04 | QuantBT Research embedding & parity | PARTIAL | QuantBT trong shell chung |
| U05 | Planning embedding & cross-link | PARTIAL | Planning trong shell chung |
| U06 | Secure edge/origin topology | EXTERNAL | Hostname private-origin an toàn |
| U07 | Identity, local login, session & RBAC | INTEGRATION_PENDING | Foundation (BAR-04) xong; chờ wire gateway + auth thật sau Cloudflare |
| U08 | M0 reproducibility freeze | FOUNDATION_COMPLETE | Golden technical baseline (BAR-05) |
| U09 | Contract foundation & monorepo platform tooling | FOUNDATION_COMPLETE | Contract/codegen/breaking CI (BAR-06) |
| U10 | TypeScript Control API façade | INTEGRATION_PARTIAL — RUN SSE CUTOVER COMPLETE | Product browser API đi qua TS authority; Command Center/workspace product slices còn lại (BAR-07) |
| U11 | Durable quant worker & immutable artifacts | FOUNDATION_COMPLETE — PRODUCTION_INACTIVE | Compute tách, retry đúng; production adapter/outbox relay còn thiếu (BAR-08) |
| U12 | Engine Capability Registry & full QuantBT UI | FOUNDATION_COMPLETE | Capability-driven platform; certify từng capability còn lại (BAR-09) |
| U13 | Data Catalog, snapshots & query foundation | FOUNDATION_COMPLETE — OPERATIONAL_EVIDENCE_PENDING | Chưa family nào AVAILABLE tới khi có real digest/quality evidence (BAR-10) |
| U14 | Alpha Registry & research platform | FOUNDATION_COMPLETE | Alpha artifact có governance; import/build/scan workflow là slice U14 (BAR-11) |
| U15 | Approval, Paper & Sandbox | FOUNDATION_COMPLETE | Governed same-artifact promotion; chưa operational paper/sandbox (BAR-12) |
| U16 | Live control & operational safety | FOUNDATION_COMPLETE — EXECUTION GATEWAY PENDING | Live không bypass risk engine; chưa nối private trading system (BAR-13) |
| U17 | Rust fast paths & scale certification | NOT STARTED (gate chưa vượt) | Tối ưu theo evidence; BAR-14 benchmark gate giữ Rust đóng |
| U18 | Planning/Postgres cutover | FOUNDATION_COMPLETE — CUTOVER PENDING | Production adapter + cutover thật chưa làm (BAR-15) |
| U19 | Release, DR, open-source & product hardening | FOUNDATION_COMPLETE — OPERATIONAL_EVIDENCE_PENDING | Restore drill/game-day/dual-cell rollback chưa chạy thật (BAR-16) |

Critical path:

```text
U00 → U01 → U01-BE → U02 → U03 → U04/U05 → U06 → U07 → U08 → U09 → U10
→ U11 → U12 → U13/U14 → U15 → U16 → U17 → U18 → U19
```

Trạng thái phase từ U07 trở đi đọc theo vocabulary v0.5 §8.1
(`CONTRACT_COMPLETE` / `FOUNDATION_COMPLETE` / `INTEGRATION_PENDING` /
`PRODUCTION_INACTIVE` / `OPERATIONAL_EVIDENCE_PENDING`): một BAR pass test
không nghĩa phase/product production hoàn tất — audit matrix §8.2 của v0.5
liệt kê việc còn làm của từng BAR, và `deploy/compose.production.yaml` chưa
active control-api/NATS/MinIO/worker (v0.5 §8.3.2).

U01-BE chỉ khóa reader boundary và một Binance OHLCV hot path trên backend
FastAPI hiện tại; không kéo toàn bộ Data Catalog lên trước. U13 có thể chuẩn bị
schema/read model song song U11/U12 và mở rộng sang các family đã được manifest
chấp nhận. Mỗi môi trường chỉ được đánh dấu data thật `AVAILABLE` sau reader
doctor và real-reader smoke của chính environment đó pass.

Backend và cross-service implementation từ U02 trở đi phải dùng
[Backend Architecture Implementation Guide](./BACKEND_ARCHITECTURE_IMPLEMENTATION_GUIDE.md)
làm architecture runway. Các slice `BAR-*` trong guide khóa authority,
consistency, migration/rollback và agent handoff nhưng không thay số phase hoặc
cho phép dựng sớm service/datastore của phase sau.

---

## 7. Kế hoạch phase chi tiết

### Phase U00 — Governance & Source-of-Truth

**Goal**

Khóa guide v0.4, plan, ID và cách ra quyết định để nhiều agent không tạo các
kiến trúc/UI fork khác nhau.

**Guide index**

- [§P0.13 Screen Contract](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#p013-screen-contract--đơn-vị-thảo-luận-cho-các-vòng-sau)
- [§30 Epic Map](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#30-implementation-backlog-đề-xuất)
- [§33 ADR backlog](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#33-architecture-decision-records-cần-tạo)
- [§40.20 Authority order](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#4020-source-of-truth-và-handoff-conclusion)

**Đã làm**

- Guide v0.4 đã khóa M-1A/M-1B và exact Cloudflare identifiers.
- Monorepo rules, `dev`/`main`, contributor flow và commit discipline đã có.
- Unified plan này tạo phase IDs và gate chung.

**Description / To-do**

- Owner review và ghi quyết định `APPROVED` cho plan; thay đổi scope phải qua
  changelog/ADR, không sửa âm thầm phase đã chốt.
- Tạo versioned `Feature Registry`, `Screen Contract`, `Concern Registry` và
  task ID namespace (`PRT`, `UI`, `CP`, `QW`, `EC`, `AR`, `DATA`, `AP`, `DP`,
  `OP`, `PLAN`, `SEC`, `SRE`, `PERF`).
- Mỗi task phải link phase, screen, API/schema, repo scope, test evidence và
  activation gate.
- Tạo ADR-001…ADR-016 theo §33 trước khi code boundary tương ứng.

**Backend / Frontend / Wireframe**

- Không thêm runtime code trong phase này.
- Chuẩn hóa template metadata cho API concern, UI state và Figma frame.
- Khóa data-mode `REAL / FIXTURE / STATIC_PREVIEW / NONE` và maturity status.

**Exit gate**

- Owner duyệt phase order, stack lock và non-goals.
- Guide + plan được Git track, link nội bộ không hỏng.
- Mọi commissioned feature có ID và concern owner, chưa cần implementation.

**Technical debt**

- Alpha/Data/Private Trading bounded contexts chưa final; chỉ được mở sau
  deep-dive repository/contract riêng.
- Plan không thay task tracker; trạng thái phải đồng bộ với Planning ở U05.

### Phase U01 — Baseline Inventory & Golden Visual Evidence

**Goal**

Freeze chính xác những gì đang chạy để refactor shell/backend không làm mất
route, behavior, artifact, dữ liệu Planning hoặc visual quan trọng.

**Guide index**

- [§P0.2 Baseline](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#p02-baseline-thực-tế-đang-có-trong-awesome-portal)
- [§P0.27 P0-A](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#p027-implementation-sequence--thứ-tự-nên-làm-trướcsau)
- [§29.2 M0](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#292-phase-m0--baseline-inventory-và-golden-evidence)

**Đã làm**

- QuantBT backend/frontend tests, PyPI synthetic smoke và golden Parquet fixture.
- Planning backend/frontend/E2E, content-integrity manifest và Phase 5 release
  checklist.
- Root Compose smoke, health routes và current gateway route topology.

**Description / To-do**

- Inventory routes, query/hash behavior, deep links, browser actions, APIs,
  artifact schemas, SQLite counts/checksums và dependency/runtime versions.
- Capture reproducible baseline at 1440×900, 1280×720, 1024×768 và 390×844.
- Record network payload, bundle size, LCP, chart canvas size, API p95, backend
  RSS và synthetic run duration.
- Freeze accepted screenshots and trace artifacts outside normal source output;
  CI keeps only approved compact evidence.

**Backend**

- Snapshot OpenAPI for both FastAPI services.
- Pin wheel/image/config hashes and protected strategy checksum.
- Export Planning SQLite with count/hash report; no migration yet.

**Frontend / UX / Wireframe**

- Build route-action matrix for both apps.
- Annotate nested shells, inconsistent route state, focus, responsive and empty
  states as concerns—not ad-hoc fixes in this phase.
- Create Figma page `01 — Current Baseline` from sanitized screenshots.

**Exit gate**

- Clean checkout reproduces current synthetic/golden flows.
- All primary routes/actions appear in inventory and screenshot set.
- Existing completed QuantBT artifact can reopen; Planning export reconciles.

**Technical debt**

- Baseline evidence has an expiry; refresh after any dependency/runtime major
  upgrade.

### Phase U01-BE — Historical Market Data Consumer Boundary & Real-Reader Smoke

**Goal**

Khóa data input boundary đầu tiên của backend bằng approved reader wheel và
canonical storage read-only, thay cơ chế import `data_loader.py` theo host path,
đồng thời chứng minh một QuantBT Binance flow nhỏ chạy fail-closed trên VPS.
Đây là **backend phase phải làm trước U02/U03**; U13 vẫn là phase platform hóa
Data Catalog, snapshot và query sau này.

Historical boundary này chỉ cấp dữ liệu cho backtest, research và module được
grant capability rõ ràng. Nó không cấp realtime market feed, paper order/fill,
paper account state hoặc live execution; các concern đó có service/contract
riêng ở U15–U16.

**Guide index**

- [§P0.24A Historical Market Data contract](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#p024a-historical-market-data-consumer-contract--addendum-2026-08-15)
- [§8.10 Reader boundary](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#810-historical-market-data-reader-boundary)
- Operator consumer guide trên VPS:
  `/home/bobby/pool_alpha/HISTORICAL_MARKET_DATA_CONSUMER_GUIDE.md`
- Canonical source checkout `/home/bobby/historical_market_data` chỉ dùng để
  audit contract/read tests; không là runtime dependency của Portal.

**Đã làm**

- Approved wheel `primus-historical-market-data==0.1.0rc3`, SHA-256
  `3b2a41b87ff834912556bb3039bf3e3c148bd859a1ced9ee4f52a3c658ca5663`
  và loader contract `hmd-loader-v1` đã tồn tại.
- Canonical release manifest đã fail-closed theo release status, dataset family
  và supported loader contract.
- Reader doctor ngày 2026-08-15 pass từ installed site-packages wheel trên
  environment `primus-hmd-do-sgp1-20260813`, release commit
  `d9327fb2fff11d0d864c811d8286716b9b192343`; đây là audit evidence, không phải
  hard-coded runtime selector.
- Current FastAPI đã có `MarketDataProvider`, frame normalization, content hash,
  synthetic injection tests và một Binance provider seam.
- U01-BE implementation đã thay seam cũ bằng `HistoricalMarketDataProvider`,
  `MarketDataQuery`, installed-wheel provenance check, manifest compatibility,
  explicit availability/scope và worker/API dùng chung một query builder.
- Docker image verify exact wheel SHA trước install; generic local/CI dùng mode
  `disabled`, production Compose dùng `required` + `/data:ro` và fail startup
  khi reader/release incompatible.
- Portal doctor, reusable real smoke, opt-in integration test và UI unavailable
  state đã được triển khai; realtime/paper scopes bị catalog exclude rõ.

**Description / To-do**

- [x] Verify exact wheel version/SHA trong image build; không editable/source
  mount/unversioned wheel.
- [x] Pin Python/reader dependency set và giữ `quantbt-engine==1.0.8` độc lập.
- [x] Thay host-path import bằng installed-package provenance check.
- [x] Thêm bounded typed query, half-open range, minimal OHLCV projection,
  `check_val=True`, UTC source provenance và no-fill/empty semantics.
- [x] Fail closed theo release status, loader contract và declared dataset;
  local/CI advertise `UNAVAILABLE`, không fallback fixture im lặng.
- [x] Chỉ activate Binance perpetual OHLCV; family khác vẫn do U13 quản lý.
- [x] Doctor + opt-in real BTCUSDT smoke + direct-reader parity + latency/RSS.
- [x] UI công bố historical/backtest scope và chặn validate/run khi unavailable
  hoặc thiếu explicit time bounds.
- [ ] Owner cấu hình encrypted GitHub secret `HMD_READER_WHEEL_BASE64` để
  workflow publish image production có approved wheel.
- [ ] Host admin sửa/verify ACL cho numeric GID của
  `primus-market-data-readers`: storage hiện hiệu lực qua `bobby:bobby`, named
  ACL hiển thị overflow nên production Compose chưa được activate bằng GID 996.

**Backend**

- Giữ FastAPI hiện tại là first consumer để giảm blast radius; chưa cần dựng
  NestJS Control API hay NATS trong phase này.
- Khi REAL historical-data capability được enable, provider/readiness phải fail
  nếu manifest thiếu, status khác `pass`, `hmd-loader-v1` không được hỗ trợ hoặc
  dataset chưa declared. Local/CI không mount data giữ capability `UNAVAILABLE`.
- Dataset availability là capability có reason/evidence, không phải kiểm tra
  đơn giản `Path.exists()`.
- Có cleanup/bounded materialization sau large Arrow/pandas reads; không cache
  full history vô hạn trong API process.

**Frontend / UX / Wireframe**

- Không redesign dashboard trong U01-BE. Chỉ nối typed states `available`,
  `unavailable`, `incompatible`, `empty-window`, `validation-warning` vào UI
  hiện tại với provenance/freshness dễ kiểm tra.
- Data picker buộc explicit symbol/time window; unsupported family disabled với
  lý do, không ẩn lỗi hoặc thay bằng fixture im lặng.

**Exit gate**

- Unit/contract tests pass với injected fake reader, gồm timezone, duplicate,
  schema, empty frame và exact time-window behavior.
- Fail-closed tests pass cho missing/malformed/rejected manifest, incompatible
  loader contract và undeclared dataset.
- Image chứng minh import đến installed wheel, exact version/SHA; scan không có
  Portal-local `data_loader.py` hay source checkout mount.
- Target-VPS reader doctor pass; canonical storage mount được xác nhận `ro`.
- Opt-in BTCUSDT real-reader smoke pass trên một cửa sổ nhỏ, dữ liệu sorted,
  unique, OHLCV hợp lệ; artifact ghi release/provenance và performance baseline.
- Existing synthetic/golden QuantBT tests vẫn pass; thiếu canonical mount trong
  generic CI phải skip rõ `external-data-unavailable`, không giả pass real-data.

Evidence 2026-08-15: BTCUSDT `1h` `[2026-08-01, 2026-08-02)` trả 24 bars,
0 inferred gaps, content hash
`08e770725bd6fb8e46a88ac38c58e998b9f47ab8152ad53e11d6f66d06ac6438`,
reader load `0.121–0.157s` và process max RSS khoảng `165–167 MB` ở host/image
smoke trên VPS hiện tại. Đây
là first baseline, không phải SLO chung cho window lớn. Full backend đạt
`116 passed, 1 skipped` (generic suite skip đúng external real-data test),
opt-in real test đạt `1 passed`; frontend đạt `23 passed` và production build.

**Technical debt**

- BE-01 chỉ chứng nhận Binance perpetual OHLCV. Matrix, metrics, order-book,
  quarterly, spot và VN được platform hóa trong U13 theo dataset-specific
  schemas; không ép mọi output về OHLCV.
- GitHub publish hiện dùng encrypted base64 wheel secret làm immutable build
  input. Chuyển sang private package/OCI artifact registry cần ADR ở U19; checksum
  lock là yêu cầu không được hạ.
- Host storage ACL/GID repair là deployment blocker duy nhất còn mở của U01-BE;
  Portal không tự chmod/chgrp canonical data.
- NestJS BFF, immutable DatasetSnapshot identity, S3 read model và event-driven
  availability thuộc U09–U13, không nhét vào first smoke.

### Phase U02 — Shared Foundations & Figma-Ready Design System

**Goal**

Tạo một visual language/component contract chung trước khi ghép hai frontend.

**Guide index**

- [§P0.21–P0.22](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#p021-design-direction-wealthfolio-pattern--quantbt-fund-paper)
- [§17 UI/UX Direction](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#17-uiux-direction)
- [§25 Components](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#25-component-system)
- [§26–27 Responsive/Figma](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#26-responsive-mobile-và-accessibility)
- [Current UI guide](../apps/portal/uiux-design.md)
- [BAR-01 backend registry/summary contract](./backend/BAR_01_FEATURE_REGISTRY_AND_SUMMARY_CONTRACT.md)

**Đã làm**

- Fund Paper token palette, typography roles, ECharts conventions và report
  components đã tồn tại trong QuantBT.
- Planning có responsive shell, light/dark tokens và design catalog riêng.
- BAR-01-BE1 đã khóa display/capability metadata contract bằng canonical
  registry source, Draft 2020-12 schemas và integrity tests; implementation UI
  package vẫn chờ các slice U02/U03 sau.

**Description / To-do**

- Chọn Fund Paper là token authority; map token Planning vào semantic roles.
- Dựng Figma pages Foundations, Tokens, Components, Patterns và Responsive.
- Tạo foundation API cho buttons, inputs, badges, tabs, cards, tables, drawers,
  dialogs, skeletons, callouts, metric/evidence components.
- Chuẩn hóa density `comfortable / compact / operational` và themes Research
  Light / Operations Dark / Print Light.
- Reimplement Wealthfolio-inspired patterns clean-room; không copy AGPL code,
  logo hoặc asset.

**Backend**

- Định nghĩa display metadata contract: unit, timezone, segment, freshness,
  provenance, permission và source artifact digest.
- Không thêm numerical calculation vào component/presentation layer.

**Frontend / UX / Wireframe**

- Tạo token package thử nghiệm trong current frontend boundary; promote thành
  `packages/ui` chính thức ở U09 sau parity.
- Component states bắt buộc: loading, empty, partial, stale, denied,
  capability-unavailable, retryable và terminal failure.
- WCAG 2.2 AA, focus ring, reduced motion, print/export và chart text fallback.

**Exit gate**

- Visual tests ở bốn breakpoints và ba themes pass.
- Không có raw color mới ngoài documented token/visualization exception.
- Figma variables/component variants map được 1:1 sang typed React props.

**Technical debt**

- Hai legacy style systems còn tồn tại trong parity window.
- Storybook/package workspace chỉ productionize ở U09 để tránh toolchain churn
  trước khi shell được duyệt.

### Phase U03 — Unified Shell, Feature Registry & Command Center

**Goal**

Biến `apps/portal` thành mother shell duy nhất, có IA theo lifecycle và mô tả
trung thực capability hiện tại/tương lai.

**Guide index**

- [§P0.5–P0.8 Maturity, IA, shell](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#p05-maturity-model-cho-feature-và-screen)
- [§P0.12 Registry](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#p012-feature-registry--contract-trung-tâm-của-prototype)
- [§P0.14–P0.20 Wireframes](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#p014-command-center-prototype)
- [§19–20 IA/screens](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#19-information-architecture-và-route-map)
- [BAR-01 backend registry/summary contract](./backend/BAR_01_FEATURE_REGISTRY_AND_SUMMARY_CONTRACT.md)

**Đã làm**

- Root web gateway là public entry point duy nhất.
- Hai frontend cùng React/Vite nhưng vẫn build và route độc lập.
- BAR-01-BE1 đã tạo canonical Feature/Screen/Concern/Lifecycle fixture và
  source/public/summary schemas. Chỉ QuantBT Research và Planning được đánh dấu
  `AVAILABLE + REAL`; mọi capability tương lai vẫn `COMMISSIONED`.
- BAR-01-BE2 đã thêm immutable registry repository, startup/readiness
  fail-closed, public `GET /api/v1/portal/registry`, deterministic digest,
  ETag/304 và image-owned sidecar; frontend vẫn chưa có registry thứ hai.
- BAR-01-BE3 đã thêm internal read-only QuantBT summary adapter với typed
  evidence/current-run/Historical ports, exact state counts nhưng bounded
  metadata, independent failure isolation và registry-derived links. Empty
  authority là available zero; unavailable/timeout/incompatible luôn là null.
  Public summary endpoint vẫn chờ aggregator ở BE5.
- BAR-01-BE4 đã thêm bounded `planning.summary.v1` read model trong Planning
  authority và private async HTTP adapter trong Portal. API mode trả exact task
  status/roadmap counts và recent IDs; LOCAL/timeout/denied/incompatible trả
  typed null evidence. Không import Planning repository/SQLite, không mutation,
  không suy diễn current phase hoặc blocker. Public summary route vẫn chờ BE5.
- BAR-01-BE5 đã thêm deadline-aware concurrent aggregator
  (`services/portal_overview.py`) và mở read-only `GET /api/v1/portal/summary`.
  Collection chạy song song dưới một hard deadline 100–2000 ms (default
  500 ms), cancellation của client lan tới pending upstream, adapter lỗi
  không trì hoãn/xoá evidence adapter khỏe và không bao giờ biến unavailable
  thành zero. Overall availability theo available/degraded/unavailable;
  registry maturity/blocking counts chỉ từ validated public registry; priority
  merge chỉ 3 type hiện được ủy quyền theo thứ tự deep-dive; payload giới hạn
  32 sections/50 priorities với target 50 KB và hard ceiling 100 KB (quá là
  typed 500, không truncate). Endpoint trả `Cache-Control: no-store`,
  `Vary: Authorization, Cookie` và vẫn là FastAPI compatibility bridge — không
  đổi TypeScript control-plane target. BE6 (frontend handoff) pending.
- BAR-01-BE6 đã hoàn tất frontend contract handoff: canonical OpenAPI 3.1
  (`registry/openapi/portal-api.openapi.json`, regenerate bằng
  `scripts/export_handoff_contract.py`), 7 fixtures schema-validated
  (registry.public + summary healthy/empty/partial/stale/denied/unavailable)
  và `registry/FRONTEND_HANDOFF.md` (ETag/304, no-store/Vary, bảng
  FeatureMaturity vs AvailabilityState, mọi loading/empty/partial/stale/
  denied state, priority ordering/route constraints). Frontend generate types
  từ OpenAPI — không có model tay thứ hai. Backend contract BAR-01 hoàn tất;
  kế tiếp là BAR-02 (U04/U05 compatibility boundaries & parity freeze).

**Description / To-do**

- Implement typed Feature Registry; sidebar/topbar/command palette render từ
  registry, không hard-code từng nav item.
- Implement Screen/Concern registry và commissioned Feature Preview.
- Build PortalShell: product rail, topbar, breadcrumbs, module header, optional
  subnav, context drawer và responsive mobile sheet.
- Build Command Center và Portal Map từ real adapters + static lifecycle model.
- Add `Show commissioned modules` user preference và role/maturity filtering.

**Backend**

- Current FastAPI services giữ nguyên authority.
- Tạo read-only summary adapter; field chưa có trả `unavailable`, không bịa 0.
- Version registry/concern sidecar trong source với schema validation.

**Frontend / UX / Wireframe**

- One obvious primary action per screen; evidence/status nằm gần action.
- Command Center priority: critical incident → approval → failed/corrupt run →
  stale data → normal work.
- Commissioned screen click được nhưng chỉ mở brief/wireframe/dependency/task;
  destructive/compute CTA disabled với lý do cụ thể.
- URL giữ workspace/project placeholder nhưng không giả multi-tenancy backend.

**Exit gate**

- Thêm một commissioned feature chỉ bằng registry entry.
- Keyboard/sidebar/mobile drawer/deep-link/back-forward pass.
- Không có fake live/account/performance metric; fixture có banner/provenance.

**Technical debt**

- Command Center chưa có authoritative platform read model tới U10.
- Workspace/project context chỉ là single-workspace shell contract trong P0.

### Phase U04 — QuantBT Research Embedding & Parity

**Goal**

Nhúng toàn bộ QuantBT Research vào shell chung mà không đổi accounting,
selection, artifacts hoặc protected strategy kernel.

**Guide index**

- [§P0.9 QuantBT embedding](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#p09-cách-ghép-quantbt-research-vào-shell-chung)
- [§P0.17 Wireframe](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#p017-wireframe--quantbt-research-được-nhúng-trong-portal)
- [Screens 11–15](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#22-detailed-wireframes--backtest-optimization-và-approval)
- [QuantBT app rules](../apps/portal/AGENTS.md)

**Đã làm**

- Current New Run/Progress/Result tabs, SSE, artifact persistence, API tests và
  synthetic PyPI smoke hoạt động.
- Fund Paper report components và IS/OOS/Holdout semantics đã có.
- BAR-02 đã freeze parity boundary cho U04/U05: snapshot OpenAPI Portal +
  Planning + run-request schema (digest manifest tại
  `upgrade/backend/bar02/snapshots/`), thêm additive artifact provenance
  (`artifact_schema_version` + `producer`) vào mọi Portal-written JSON
  artifact (engine `manifest.json` giữ nguyên), cross-link sidecar
  `portal.links.v1` + `GET /api/v1/portal/links` với integrity block. Legacy
  routes vẫn là data từ registry; gateway giữ proxy compatibility; không
  dual-write; protected hash và Planning state không đổi.

**Description / To-do**

- Extract app body/module boundary, loại bỏ duplicated shell nhưng giữ feature
  local subnav.
- Canonical routes dưới `/research/quantbt/*`; legacy route redirect có test.
- Preserve run query/deep-link behavior trong compatibility window.
- Tạo immutable run passport strip: strategy, dataset, engine, window, hash,
  backend và data mode.

**Backend**

- Freeze current API/artifact contracts; chỉ thêm compatibility metadata.
- Không import internal QuantBT kernel; không sửa `strategy/main.py`.
- Keep current FastAPI private; all mutations retain preflight/audit behavior.

**Frontend / UX / Wireframe**

- Flow: New Run → Progress → explicit Open Results → Overview → Optimization
  → Parameters → Execution → Audit.
- Charts không remount vô ích khi đổi tab/range; stale request được abort.
- Data-unavailable và artifact-partial có explainable state, không blank canvas.

**Exit gate**

- Golden browser parity, deep links, back/forward, export và SSE reconnect pass.
- Protected source hash, backend tests, frontend tests/build và visual diff pass.
- Existing API/artifact output không đổi ngoài documented additive field.

**Technical debt**

- Query-string/legacy route adapter tồn tại tới U10/U12.
- FastAPI còn là public domain authority phía sau BFF tới strangler cutover.

### Phase U05 — Planning Embedding & Feature/Task Cross-Link

**Goal**

Đưa Docs/Roadmap/Board/Reports/Evidence vào mother shell và biến Planning thành
governance surface cho chính Portal roadmap.

**Guide index**

- [§P0.10 Planning embedding](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#p010-cách-ghép-roadmap--task-board-vào-shell-chung)
- [§P0.18 Planning wireframe](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#p018-wireframe--planning-được-nhúng-trong-portal)
- [§P0.23 Cross-link](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#p023-liên-kết-portal-feature-với-roadmaptask-board)
- [Screen 24](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#244-screen-24--roadmap--task-board)

**Đã làm**

- Planning frontend Phase 5, local/API adapter, lazy views, SQLite audit backend
  và compatibility route `/roadmap-task-board/` đã có.
- BAR-02 đã thêm versioned cross-link sidecar `portal.links.v1` (mapping
  feature/screen/concern ↔ epic/task/Figma/repository) validated lúc startup,
  served read-only qua `GET /api/v1/portal/links` với ETag/304 + integrity
  coverage block. External task-existence check chờ U05 proper; link không
  hợp lệ fail startup, không bịa task link.

**Description / To-do**

- Extract reusable Planning body; remove nested topbar/sidebar.
- Add canonical `/planning/{docs|roadmap|board|reports|interpretation|evidence}`
  routes and legacy hash/subpath adapter.
- Add versioned mapping: feature/screen/concern ↔ epic/task/Figma/repository.
- Task drawer giữ context và có `Open Portal screen`; feature preview có
  `Open roadmap epic/tasks`.

**Backend**

- Giữ FastAPI/SQLite private trong P0.
- Dùng optional metadata hoặc versioned sidecar trước schema migration.
- Validate link target/ID; broken links xuất hiện trong integrity report.

**Frontend / UX / Wireframe**

- Phân biệt Planning Reports/Evidence với QuantBT Run Report bằng breadcrumb,
  module label và source badge.
- API/LOCAL mode luôn visible; local state không giả là shared server state.
- Print/docs/Kanban/drag-drop/keyboard behavior giữ parity.

**Exit gate**

- Manager đi lifecycle → feature → task → feature không mất context.
- Planning parity tests, content-integrity, API/local modes và legacy redirects
  pass.
- Không còn nested shell.

**Technical debt**

- SQLite companion và local-first adapter tồn tại tới U18.
- Cross-link sidecar là temporary authority; sẽ migrate vào Planning/Postgres.

### Phase U06 — Secure Edge & Loopback Origin Topology

**Goal**

Publish prototype tại `portal.primusspark.com` qua deny-by-default Access/Tunnel
mà không expose web/API port của VPS.

**Guide index**

- [§40.2–40.10 exact configuration](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#402-runtime-identifiers-đã-khóa)
- [§29.0.1 M-1B.0–M-1B.4](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#2901-phase-m-1b--secure-domain-login--identity-bootstrap-trước-m0)

**Đã làm**

- Guide đã khóa hostname, team domain, issuer, AUD và `@azdag.com` boundary.
- Repo hiện có one-gateway Compose nhưng host port chưa được chuyển sang final
  loopback/Cloudflare topology.
- BAR-03 đã thêm operational ingress boundary cho backend: `X-Request-ID` +
  W3C `traceparent` correlation (middleware ASGI thuần + nginx `$request_id`
  forward, unsafe value bị thay), `/api/diagnostics` dependency states an
  toàn (không path/hostname/secret), SSE unbuffered qua gateway (headers
  `no-cache`/`X-Accel-Buffering: no` + dedicated nginx location),
  `request_id` trong mọi error envelope, redaction tests cho
  health/ready/diagnostics/error. Edge publish (Tunnel/Access/cert/firewall)
  vẫn là bước owner-operational và U07 identity là slice backend tiếp theo.

**Description / To-do**

- Owner verify Access Application hostname, login method, allow-domain policy,
  exact AUD và không có `Bypass/Everyone`.
- Bind Portal app `127.0.0.1:8080`; Nginx loopback TLS `127.0.0.1:443`.
- Install Origin CA cert/key ngoài repo; deploy Nginx config strip spoofable
  identity headers.
- Create named tunnel, exact `teamName/audTag`, catch-all 404 and systemd health.
- Route DNS qua Tunnel CNAME only after Access and origin are ready.
- Configure UFW/SSH management safely; verify public 80/443/8080 closed.

**Backend**

- Add `/health`, `/ready` and ingress diagnostics without topology/secret leak.
- Preserve SSE/upgrade/timeouts and request correlation through Nginx.

**Frontend / UX / Wireframe**

- Add external-access maintenance/error screen with request ID.
- Do not pretend Cloudflare-owned screen is a Portal React route.

**Exit gate**

- Edge/origin/network checklist in §40.16 passes.
- `noTLSVerify=false`; wrong cert/AUD/hostname fails closed.
- Stopping Tunnel makes hostname unavailable but never exposes origin.

**Technical debt**

- Single VPS/single tunnel connector has no regional HA.
- Device posture/WARP, multi-region and advanced Access policies are deferred.

### Phase U07 — Identity, Local Login, Session & RBAC

**Goal**

Hoàn thành hybrid M-1B auth: verified Cloudflare identity + local account +
opaque session + server-side permission.

**Guide index**

- [§P0.25A Auth design](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#p025a-addendum-draft-v03--portalprimussparkcom-login-nội-bộ-và-identity-bootstrap)
- [§13.9 identity profile](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#139-deployed-prototype-identity--explicit-override-cho-portalprimussparkcom)
- [§21.1 Login wireframes](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#211-screen-01--login--sso)
- [§40.11–40.17 pipeline/gates](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#4011-portal-jwt-verification-pipeline)

**Đã làm**

- Username/role and auth states are locked in guide; runtime implementation
  chưa có.
- BAR-04 đã scaffold thin auth BFF `apps/control-api/` (NestJS/Fastify,
  private trong Compose cùng `portal-postgres`): 6 bảng identity theo
  P0.25A.14 với SQL-first migrations (ADR-003), verify Cloudflare Access
  JWT/JWKS (signature/iss/aud/time/@azdag.com, key rotation), Argon2id +
  blocklist, activation credentials dùng một lần, opaque session
  `__Host-portal_session` + CSRF/origin, throttling/lockout, error generic
  không enumeration, HMAC-signed internal principal, RBAC ADMIN/USER,
  bootstrap idempotent bobby/stan/thanhvuong với one-time secret sinh
  runtime. 24 tests security matrix pass trên PostgreSQL thật; raw
  JWT/password/session không bao giờ xuống Python services. BFF chưa wire
  vào gateway (U10 façade) và không có run/data/alpha authority.

**Description / To-do**

- Bootstrap a thin NestJS/Fastify auth BFF now; it becomes U10 Control API,
  tránh viết auth production tạm trong Python rồi rewrite.
- Add PostgreSQL migrations for users, external bindings, password/activation
  credentials, sessions and auth audit.
- Verify JWT/JWKS signature, issuer, audience, times and `@azdag.com`; cache keys
  with rotation, never fallback to raw email header.
- Implement Argon2id, blocklist, one-time activation, forced password change,
  rate limit/lock, opaque `__Host-portal_session`, CSRF/origin and session revoke.
- Idempotently seed `bobby/ADMIN`, `stan/USER`, `thanhvuong/USER`; generate
  unique secrets at runtime and distribute out-of-band.

**Backend**

- `/api/auth/context|login|change-password|logout|csrf` and admin user/session
  API from guide.
- BFF overwrites internal principal headers and signs/trust-bounds downstream
  context; raw password/session/JWT never reaches QuantBT/Planning.
- Audit and metrics for all login/binding/session/role events.

**Frontend / UX / Wireframe**

- Implement Frames 01B/01C/01D, session expired, Access identity switch and
  Settings → Users & Access.
- Verified email read-only/masked; generic auth errors + request ID; no account
  enumeration; password-manager/paste accessible.
- USER deep-link to admin shows Not Authorized without data leak.

**Exit gate**

- Full §40.16 JWT/account/login/RBAC matrix passes.
- QuantBT/Planning parity through authenticated BFF passes.
- No raw token, cookie, password/hash or activation secret in repo/log/evidence.

**Technical debt**

- Prototype roles `ADMIN/USER` are intentionally coarse.
- Step-up MFA, SCIM, passkey, self-service reset and full ABAC wait for U15/U16.

### Phase U08 — M0 Reproducibility Freeze

**Goal**

Sau shell/auth ổn định, freeze lại technical baseline qua entry point thật để
mọi migration authority sau có parity và rollback.

**Guide index**

- [§29.2 M0](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#292-phase-m0--baseline-inventory-và-golden-evidence)
- [§31 tests](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#31-testing-strategy-và-acceptance-gates)

**Đã làm**

- Synthetic PyPI/golden suite và current CI đã có; chưa freeze qua unified
  shell/auth path.
- BAR-05 đã freeze technical baseline: digest manifest
  (`upgrade/backend/bar05/m0-freeze-manifest.json` — protected kernel, pins
  PyPI, OpenAPI snapshots, golden fixtures, artifact schema versions, config/
  lockfiles) regenerate được, environment report credential-free, Planning
  export có `counts` + `content_hash`, và `scripts/verify-m0-golden.sh` chạy
  golden parity + reopen suites (27 tests). Golden qua authenticated BFF
  ingress chạy khi U10 wire façade; visual/Playwright flows là slice
  frontend.

**Description / To-do**

- Freeze commits, images, config fingerprints, wheel/hash, OpenAPI, artifact
  schemas, Planning export and visual baseline.
- Add golden routes: signal_notional, intrabar, event-driven, portfolio,
  WFO/three-window using synthetic data.
- Define tolerances for metrics/series/artifacts and non-functional baselines.

**Backend**

- Verify provenance from installed distribution; no sibling source.
- Add deterministic environment report without credentials/host paths.

**Frontend / UX / Wireframe**

- Capture complete Access → Login → Command Center → QuantBT/Planning flows.
- Visual regression includes loading/empty/partial/error at supported sizes.

**Exit gate**

- Clean rebuild reproduces golden hashes/tolerances and reopens artifact.
- Authenticated parity and rollback to current Compose image are documented.

**Technical debt**

- Real data/broker evidence is explicitly absent; cannot promote a synthetic
  result as production evidence.

### Phase U09 — Contract Foundation & Monorepo Platform Tooling

**Goal**

Tạo contract/schema/codegen/tooling foundation trước khi Control API nhận
authority nghiệp vụ.

**Guide index**

- [§16 Repository/build](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#16-repository-build-và-deployment-architecture)
- [§29.3 M1](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#293-phase-m1--contract-foundation-và-shared-design-system)
- [§31.1 Contract tests](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#311-test-pyramid-theo-boundary)

**Đã làm**

- Current pyproject/package-lock/OpenAPI/test contracts exist per module.
- Shared root orchestration exists; no formal packages/contracts workspace.
- BAR-06 đã tạo `packages/contracts/`: canonical schemas (opaque IDs, UTC
  timestamps, decimals, RFC 7807 problem, command envelope với idempotency +
  optimistic concurrency, §6.7 event envelope), fixtures hợp lệ compile
  cross-language (Python jsonschema + TS ajv), `generated/portal-api.d.ts`
  từ frozen OpenAPI với sync gate, `contracts-snapshot.json` breaking-change
  gate, Python canonical models (ProblemDocument/CommandEnvelope/
  EventEnvelope), ADR-001/002/005 (Proposed). pnpm cutover và `packages/ui`
  chờ follow-up slices theo ADR-001.

**Description / To-do**

- Create `packages/ui`, `packages/contracts-ts`, generated API client and schema
  directories without nested Git.
- Publish canonical IDs, UTC timestamps, decimals, RFC7807 problem, idempotency,
  ETag/version and event envelope conventions.
- Snapshot RunSpec, artifact manifest, Engine Capability and alpha manifest.
- Introduce pnpm workspace/task graph only through ADR and lockfile migration;
  do not keep npm and pnpm authority simultaneously after cutover.
- Add OpenAPI/schema/Buf breaking CI and multi-language generated type compile.

**Backend**

- Current FastAPI OpenAPI becomes compatibility contract.
- Contract fixtures contain no business fake used to pass integration tests.

**Frontend / UX / Wireframe**

- Promote U02 components into versioned package API and visual harness.
- Generated clients replace handwritten API shape incrementally.

**Exit gate**

- Breaking contract PR fails CI.
- Current frontend consumes generated compatibility client with golden parity.
- One lock/tool authority per ecosystem; `portal doctor` reports versions.

**Technical debt**

- Old/new DTO and client coexist during strangler window.
- Alpha manifest remains draft until owner sample is deep-dived in U14.

### Phase U10 — TypeScript Control API Façade

**Goal**

Mở rộng auth BFF thành NestJS/Fastify modular monolith và đưa browser qua một
authoritative product/control boundary.

**Guide index**

- [§5.3 module boundaries](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#53-modular-monolith-boundaries-trong-control-api-ts)
- [§6.2 Control API](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#62-control-api-ts--authoritative-control-plane)
- [§11 API surface](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#11-api-surface-đề-xuất)
- [§29.4 M2](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#294-phase-m2--typescript-control-api-as-façade)

**Đã làm**

- U07 thin BFF/auth and PostgreSQL identity foundation expected.
- Current FastAPI domain semantics remain baseline.
- BAR-07 đã mở rộng BFF thành façade foundation: workspaces/memberships +
  personal workspace tự provision, run read models, product audit và
  transactional outbox; proxy authenticated (session) tới portal-api với
  signed principal, RBAC ADMIN-first, write idempotent theo command
  envelope (replay kết quả cũ, payload khác conflict 409, upstream không
  double-fire), summary passthrough giữ nguyên freshness; feature flag
  `FEATURE_PROXY_PORTAL` rollback sạch. USER đọc runs qua workspace read
  model, cross-workspace fail-closed 404. Planning façade compatibility cũng
  đã wire; organizations/projects và product tenancy UI là vertical slices sau.
- U10 run-SSE cutover ngày 2026-08-24 đã bỏ exception Nginx→Python cho
  `/api/runs/{run_id}/events`: browser đi qua session-guarded TypeScript façade,
  internal principal được ký server-side, path/run ID fail-closed, header
  connect timeout tách khỏi stream lifetime, Fastify pipe không buffer có
  backpressure/cancel và non-SSE response bị từ chối. Gateway rollback một dòng
  vẫn giữ nguyên. Client đóng EventSource trên mọi error trước/sau `open`, nên
  session 401/403 không bị native retry vô hạn; polling authoritative tiếp tục
  ở nhịp nhanh mà không cần preflight hay đổi SSE envelope. Evidence:
  TypeScript build, fresh PostgreSQL restore và Control API 173/173; durable
  event authority vẫn thuộc U11.

**Description / To-do**

- Add organizations/workspaces/projects, run registry/read models, audit and
  transactional outbox modules.
- Proxy current QuantBT/Planning APIs first; compare response/state transitions.
- Every write records actor/workspace/request/idempotency/aggregate version.
- Add feature flags and rollback adapter; FastAPI services become private.

**Backend**

- SQL-first typed query layer; module dependency rules enforced.
- OpenAPI, generated frontend client, SSE from normalized durable/read state.
- No cross-module infrastructure imports; commands/events for mutations.

**Frontend / UX / Wireframe**

- Replace direct FastAPI calls route-by-route without visual/metric change.
- Command Center starts reading authoritative summary read model with
  freshness/staleness metadata.

**Exit gate**

- All browser calls enter TS gateway; crafted permission/cross-workspace request
  denied server-side.
- Golden UI/run parity and feature-flag rollback pass.

**Technical debt**

- FastAPI compatibility endpoints remain until U11/U12 cutovers.
- PostgreSQL read models initially single-region and modest-scale.

### Phase U11 — Durable Quant Worker & Immutable Artifacts

**Goal**

Tách heavy QuantBT compute khỏi request loop, có queue/retry/cancel đúng và
artifact content-addressed có thể audit.

**Guide index**

- [§6.4 worker lifecycle](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#64-quant-worker-py)
- [§6.7 NATS](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#67-nats-và-event-semantics)
- [§8 artifact architecture](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#8-run-study-và-artifact-architecture)
- [§29.5 M3](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#295-phase-m3--worker-isolation-durable-queue-và-immutable-artifacts)

**Đã làm**

- Current async run service/artifact repository and golden tests provide
  behavior reference; no durable distributed queue/object store authority.
- BAR-08 đã thêm durable worker + immutable artifact authority: tách
  `run`/`run_attempt` với registry append-only (redelivery no-op, retry tạo
  attempt mới), claim-lease/heartbeat + standardized failure codes,
  content-addressed bundle (temp → checksums → manifest v2.0.0 → blobs
  sha256, reopen-by-digest, tamper detection, reconcile, legacy import),
  broker port in-memory + NATS JetStream, `quant-worker-py` container +
  `portal-nats` + `portal-minio` private trong Compose (ADR-004/006
  Proposed). Smoke end-to-end: three-window thật qua NATS → bundle 17 files
  → succeeded event; redelivery không duplicate. MinIO adapter swap và
  outbox→NATS relay là slice U11 sau.

**Description / To-do**

- Add NATS JetStream, S3/MinIO and one-run `quant-worker-py` container.
- Implement immutable `run`, `run_attempt`, `study`, `trial` identities; lease,
  heartbeat, cancel, retry, redelivery and standardized failure codes.
- Use transactional outbox and idempotent consumers.
- Implement temp → checksum → manifest → content-addressed finalize protocol,
  orphan/corrupt reconciler and legacy artifact importer.

**Backend**

- Worker accepts immutable RunEnvelope and exact wheel/image/data/alpha hashes.
- SSE reads durable progress/events; API remains responsive under WFO load.
- Worker non-root, resource limited, network restricted, no live secret.

**Frontend / UX / Wireframe**

- Run Queue and Progress expose queue/claim/stage/attempt/reconnect accurately.
- `FINALIZING`, `CANCELLING`, redelivery and corrupt artifact have specific
  states—not generic spinner/error.

**Exit gate**

- Kill/restart worker does not duplicate successful run.
- Cancel/retry/lease/quota/artifact checksum/reopen/fault injection pass.
- Golden numerical/artifact parity with current engine path passes.

**Technical debt**

- Initial worker scheduling is resource-class based; affinity/warm pools later.
- MinIO/NATS add backup/observability burden handled progressively in U19.

### Phase U12 — Engine Capability Registry & Full QuantBT UI

**Goal**

Support QuantBT 1.0.8 qua machine-readable capability thay vì hard-code form và
route trong React.

**Guide index**

- [§7 full QuantBT integration](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#7-full-quantbt-108-integration)
- [Screen 10 Endpoint Explorer](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#2110-screen-10--endpoint-explorer)
- [Screens 11–16](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#22-detailed-wireframes--backtest-optimization-và-approval)
- [§29.6 M4](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#296-phase-m4--engine-capability-registry-và-full-quantbt-ui)

**Đã làm**

- Current portal covers three-window/Advanced WFO and selected current routes.
- PyPI provenance and protected strategy tests exist.
- BAR-09 đã thêm engine capability authority: manifest
  `engine-capabilities.v1` (pin quantbt-engine 1.0.8 với dist-info RECORD
  sha256, 2 capability certified kèm backend/data/methodology/resource
  requirements), loader fail-closed, inspector verify installed wheel,
  capability preflight cho mọi run request (reject unadvertised/uncertified
  dù request hợp lệ; synthetic capability qua manifest-only pass mà không
  sửa dispatch code), endpoint read-only `/api/v1/portal/capabilities`.
  Endpoint Explorer UI, Generic Run API và Control API capability tables là
  slice U12 sau.

**Description / To-do**

- Build `engine-inspector-py`: exact wheel/hash, public endpoint inspection,
  schemas, optional dependency/backend probes, synthetic smoke and signed
  capability manifest.
- Register releases/capabilities/status/certification in Control API.
- Implement Generic Run API and typed preflight.
- Support stable 1.0.8 factory matrix; optional capabilities remain manifest-
  gated.

**Backend**

- Public `QuantBTEndpoint` only; no internal kernel/private backend imports.
- Preflight validates actor/quota, alpha, data, methodology, backend,
  parameters, resources and promotion constraints.
- Optimization trials use light profile; final selection requires audit replay.

**Frontend / UX / Wireframe**

- Endpoint Explorer, schema-driven eight-step Backtest Wizard, Run Queue, WFO
  Lab, Run Detail, Compare Runs and evidence-aware errors.
- Every metric shows definition/unit/segment/source/as-of; capability absent
  explains why and cannot be crafted through API.

**Exit gate**

- Synthetic new manifest capability renders without core wizard edit.
- Full route matrix/golden/holdout mutation/final-audit digest tests pass.
- Unsupported or uncertified capability fails closed.

**Technical debt**

- Experimental/native/options capability remains disabled until exact package
  manifest and certification evidence exists.
- Current specialized QuantBT components coexist with generic renderer until
  visual/interaction parity.

### Phase U13 — Data Catalog, Immutable Snapshots & Query Foundation

**Goal**

Thay host-path/latest-data assumption bằng dataset/universe/instrument identity,
quality gate và chart-ready query contract.

**Guide index**

- [§P0.24A Historical Market Data contract](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#p024a-historical-market-data-consumer-contract--addendum-2026-08-15)
- [§8.10 Reader boundary](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#810-historical-market-data-reader-boundary)
- [§8.7–8.9 storage](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#87-postgresql-timescaledb-clickhouse)
- [§11.6 Data API](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#116-data-catalog)
- [Screen 22 Data Catalog](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#242-screen-22--data-catalog--quality)
- [§15 performance/query](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#15-performance-architecture)

**Đã làm**

- Approved reader wheel/manifest contract và canonical read-only storage đã có;
  U01-BE đã chứng nhận first Portal hot path trên target VPS.
- Backend đã dùng installed-wheel `HistoricalMarketDataProvider`, bounded query,
  content hash, provenance, validation, synthetic fixtures và opt-in real smoke;
  host-path loader mechanism đã được retire.
- BAR-10 đã thêm Data Catalog + immutable snapshot authority: catalog
  `data-catalog.v1` với 11 family (candle/matrix/metrics/orderbook, quality
  profile, release-manifest provenance; fail-closed với Deribit options và
  VN raw 1m; không family activated tới khi digest manifest thật được xác
  nhận qua real smoke), loader fail-closed, `SnapshotStore` digest-addressed
  (quality block khi gap/duplicate vượt ngưỡng, open-by-digest + tamper
  detection, repair luôn tạo snapshot mới), query contract range/max_points
  với downsampling metadata, quality preflight cho historical run
  submission, 4 endpoint read-only `/api/v1/data/*`. PostgreSQL catalog
  tables, ingestion và object-store snapshot là slice U13 sau.

**Description / To-do**

- Dùng U01-BE reader/provenance contract làm ingestion boundary; không bypass
  wheel để đọc filesystem trực tiếp. Deep-dive riêng realtime/event contract
  khi service đó được mở, không làm chậm historical read-only integration.
- Register typed capabilities cho các family đã được accepted manifest:
  Binance perpetual/quarterly/spot 1m, daily matrix, futures metrics 5m,
  order-book 1h, VN equity daily, VN daily matrix và VN30F1M continuous.
- Giữ Deribit, Binance options, VN raw 1m và concrete VN contracts fail-closed
  cho tới release manifest mới chấp nhận chúng.
- Implement Dataset/Universe/Snapshot/Quality identities and immutable quality
  reports; no mutable `latest` for approved run.
- Add data-quality preflight blocking and repair → new snapshot semantics.
- Implement TS/Python query/read-model path first: pagination, range,
  downsampling metadata, object URL/export and cache key by digest.

**Backend**

- Catalog metadata in PostgreSQL; bulk immutable data/artifact in object store.
- Event/availability/ingest time, timezone, unit, gap/duplicate/repair provenance
  explicit.
- Không ép matrices/metrics/order-book vào OHLCV schema; mỗi dataset kind có
  schema/version/query adapter riêng và cùng release-manifest provenance.

**Frontend / UX / Wireframe**

- Data Catalog/Snapshot Detail/Quality evidence and clear blocked-run link.
- No fixture or missing data shown as healthy/real; display freshness/provenance.
- Tables virtualized, charts fetch viewport resolution only.

**Exit gate**

- Data-quality fail blocks crafted and UI run submission.
- Snapshot immutable hash/lineage/reopen and repaired-version flow pass.
- Real-data activation requires separate smoke; synthetic does not satisfy it.

**Technical debt**

- Historical reader không còn là blocker tổng quát sau U01-BE; realtime/event
  source và từng family chưa certified vẫn là capability-level dependency.
- Timescale/ClickHouse/Rust query are explicitly deferred by evidence gate.

### Phase U14 — Alpha Registry, Import & Research Platform

**Goal**

Tạo immutable Alpha identity/artifact/certification, Alpha Pool và workbench mà
không biến browser thành arbitrary Python editor.

**Guide index**

- [§9 Alpha Platform](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#9-alpha-platform-và-chuẩn-import-dự-kiến)
- [Screens 04–09](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#214-screen-04--alpha-pool)
- [Flow A/B](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#281-flow-a--import-một-alpha-mới-vào-alpha-pool)
- [§29.7 M5](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#297-phase-m5--alpha-registry-import-pool-và-research-workbench)

**Đã làm**

- Protected Delta-RSI strategy/current research UI provide one concrete
  reference; generic alpha contract chưa final.
- BAR-11 đã thêm Alpha Registry foundation: `registry/alphas.v1.json` theo
  draft §9.3 register `delta-rsi-polynomial` v1.0.0 (entrypoint, artifact
  digest đúng protected strategy package, family/endpoint/execution
  contracts, data requirements, manager-exposed params, lifecycle
  RESEARCH + golden-parity certification, chưa có promotion evidence),
  loader fail-closed (stage/digest/duplicate sai → app không compose),
  quarantine gate chặn run/promotion kể cả crafted request,
  `verify_artifact` so digest đăng ký với protected package (phát hiện
  drift), 3 endpoint read-only `/api/v1/alphas*` không leak
  maintainer/lock digest. Quarantine ingest/build/scan pipeline và Alpha
  Pool/Workbench UI là slice U14 sau.

**Description / To-do**

- Deep-dive owner alpha package sample, then finalize `alpha.yaml`, output
  contracts, parameter/UI schemas and certification policy.
- Build quarantine ingest → hermetic build → lock/SBOM/secret/license scan →
  contract/determinism/lookahead/QuantBT smoke → signed publication.
- Implement Alpha Pool, Alpha Detail/Version/Lineage, Import Wizard, Research
  Workbench, Mining campaign skeleton and governed Strategy Composer.

**Backend**

- Exact artifact digest and schema compatibility bind every run.
- Sandbox arbitrary package load; network denied, no live secrets.
- Lifecycle/quarantine/promotion transitions versioned and audited.

**Frontend / UX / Wireframe**

- Evidence-first catalog: lifecycle, OOS/Holdout range, drawdown, costs,
  correlation, capacity, drift, evidence age and limitations.
- Workbench shows PREVIEW watermark and exact run passport.
- Composer only exposes versioned managed operators, never arbitrary code node.

**Exit gate**

- CI publishes immutable alpha version and same digest appears in run manifest.
- Manager can adjust allowed schema fields but cannot execute arbitrary source.
- Quarantine blocks new run/promotion, even with crafted request.

**Technical debt**

- Mining/composer advanced algorithms remain commissioned until their domain
  contracts and research evidence are independently reviewed.
- A single “Alpha Score” is intentionally not introduced.

### Phase U15 — Approval, Promotion, Paper & Sandbox

**Goal**

Promote đúng một immutable artifact qua governed evidence, Paper và Sandbox;
chưa mở Live.

**Guide index**

- [§10.4–10.6 promotion/deployment](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#104-promotion-state-machine)
- [§12 Paper/Sandbox/Live semantics](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#12-paper-sandbox-và-live-operations)
- [Screens 16–18](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#226-screen-16--approval-inbox--review)
- [§29.8 M6](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#298-phase-m6--approval-paper-và-sandbox)

**Đã làm**

- Current audit artifacts provide research evidence; approval/promotion/paper
  authority chưa có.
- BAR-12 đã thêm U15 foundations: ApprovalAuthority (policy v1, approval
  request gắn immutable artifact/audit digest, separation of duties chặn
  self-approval kể cả crafted request, gate matrix §10.5 đánh giá
  server-side — thiếu evidence là denied, promotion state machine §10.4
  RESEARCH→PAPER_APPROVED→PAPER_ACTIVE→SANDBOX_APPROVED→SANDBOX_ACTIVE→
  LIVE_CANARY_APPROVED→LIVE_CANARY→LIVE_SCALED + PAUSED/ROLLED_BACK/
  RETIRED, digest đổi → invalidate), PaperLedger deterministic (cash/
  positions/orders/fills append-only, chỉ lưu secret reference không bao
  giờ credential, replay từ fills, reconciliation phát hiện drift). Live
  control và step-up là U16.

**Description / To-do**

- Implement policy/version, approval request/comment/decision/waiver and
  separation-of-duties.
- Bind approval to immutable final audit/evidence hashes; new artifact invalidates
  previous request/version.
- Implement promotion state, Paper adapter/telemetry/drift and Sandbox account
  capability/reconciliation checklist.
- Add incident links and pause/rollback game-day flows.

**Backend**

- Same artifact/config digest across Research → Paper → Sandbox.
- Account stores secret reference only; no browser/worker live credential.
- Risk/data/reconciliation gates evaluated server-side at command time.

**Frontend / UX / Wireframe**

- Approval Inbox/Review, Paper dashboard, Sandbox certification and Account
  capability views per guide.
- Disabled promotion lists exact failed gates; no opaque tooltip.
- Dangerous action drawer includes environment/scope/consequence/reason.

**Exit gate**

- Self-approval/permission/crafted promotion denied.
- Paper/Sandbox events trace to deployment/alpha/run/evidence.
- Drift/reconciliation gate and pause/rollback fault tests pass.

**Technical debt**

- Step-up and richer reviewer/operator/risk roles must finish before U16.
- Paper simulator/venue sandbox differences remain versioned evidence, not
  assumed live parity.

### Phase U16 — Live Control & Operational Safety

**Goal**

Kết nối private trading system bằng signed intent, fail-closed risk/reconciliation
và operational UX an toàn; Portal không trở thành execution hot path.

**Guide index**

- [§10.6–10.7 deployment/incident state](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#106-deployment-state-machine)
- [§12.5–12.8 live actions](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#125-live-operations-rule)
- [§13 security/governance](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#13-identity-security-và-governance)
- [Screen 19–23](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#233-screen-19--live-operations)
- [§29.9 M7](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#299-phase-m7--live-control-integration)

**Đã làm**

- Chỉ có commissioned wireframe/architecture; private engine contracts phải
  deep-dive trước implementation.
- BAR-13 đã thêm live-control foundations: signed/expiring/idempotent
  deployment intent (HMAC, nonce, TTL), dual approval + step-up grant ngắn
  hạn single-use, fail-closed khi deployment state UNKNOWN/STALE, incident
  state machine audited (OPEN→ACKNOWLEDGED→RESOLVED→RETIRED, replay bị
  chặn), break-glass luôn audit. Risk engine vẫn là final authority;
  Portal không emit raw normal-UI orders.

**Description / To-do**

- Freeze private deployment command, telemetry, account, risk, reconciliation
  and incident contract.
- Implement signed/expiring/idempotent deployment intent, canary/scale/pause/
  rollback/protective state and observed acknowledgement.
- Add dual approval, short-lived step-up grant and audited break-glass runbook.
- Separate live monitoring/risk/execution safety from Portal availability.

**Backend**

- Risk engine remains final authority; Portal cannot emit raw normal-UI orders.
- Continuous order/fill/position/cash/PnL/cost reconciliation and drift model.
- Stale/unknown/mismatch blocks new action fail-closed.

**Frontend / UX / Wireframe**

- Dark Operations workstation, persistent `LIVE` context, health/risk strip,
  virtual blotters, incident/action drawer and observed-state confirmation.
- Cancel-all/flatten is separate protected workflow, never a nearby red button.
- Mobile scope is monitoring/incident/protective action only.

**Exit gate**

- Staging/sandbox/canary tests prove Portal cannot bypass risk.
- Every operator action has actor/policy/reason/intent/ack/state/audit lineage.
- Portal outage leaves monitoring/risk/execution safety operational.

**Technical debt**

- Multi-region HA, device posture/hardware-key mandates and advanced capital
  allocation can follow after initial canary certification.
- No Live feature moves from COMMISSIONED before private contracts are signed.

### Phase U17 — Rust Fast Paths & Scale Certification

**Goal**

Tách đúng performance bottleneck sang Rust sau profiling, giữ numerical and
artifact parity.

**Guide index**

- [§4.3 Rust services](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#43-rust--backend-hiệu-năng-cao-nhưng-không-phải-crud-authority)
- [§6.5–6.6 query/realtime](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#65-artifact-query-rs)
- [§15.6–15.7 extraction/benchmark](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#156-rust-extraction-criteria)
- [§29.10 M8](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#2910-phase-m8--rust-fast-paths-và-scale-hardening)

**Đã làm**

- Chưa có Rust service; đây là chủ đích đúng cho current scale.
- BAR-14 đã dựng benchmark gate: harness đo p50/p95/p99/bytes/RSS trên query
  path 200k rows, baseline p95 87.6 ms dưới target 200 ms → **Rust NOT
  STARTED** (metadata query path trong budget; heavier artifact-series
  profiling là precondition theo §15.6 trước khi extract).

**Description / To-do**

- Run benchmark suite on TS/Python path; capture flamegraph, p95/p99, bytes,
  RSS/GC and slow-consumer evidence.
- Nếu gate đạt: implement `artifact-query-rs` for Parquet range/aggregate/
  downsample and `realtime-gateway-rs` for authorization/backpressure/replay.
- Runner supervisor chỉ khi Kubernetes/process lifecycle evidence yêu cầu.

**Backend**

- Query response includes source digest/query hash/downsample/source/returned
  rows; never silently changes units/timezone/segment.
- Durable order/fill/incident cannot be dropped; latest market/health may coalesce.

**Frontend / UX / Wireframe**

- Progressive chart fetch, virtual tables, reconnect cursor and staleness UI.
- Performance optimization must not alter metric definition or perceived state.

**Exit gate**

- Numerical/artifact/schema parity, load/fault/slow consumer pass.
- Target p95/p99/RSS achieved and old path has reversible cutover flag.

**Technical debt**

- If benchmark gate is not met, Rust remains NOT STARTED—not a failed phase.
- A new Rust service creates on-call/build/security ownership that U19 must cover.

### Phase U18 — Planning/PostgreSQL Cutover

**Goal**

Đưa Roadmap/Task Board vào Planning bounded context của Control API mà không mất
history, attachments, cross-links hoặc current UX.

**Guide index**

- [§24.4 Planning migration](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#244-screen-24--roadmap--task-board)
- [§29.11 Roadmap migration](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#2911-roadmap-task-board-migration)

**Đã làm**

- Phase 5 Planning feature, FastAPI/SQLite, audit trail, local/API adapters,
  content integrity and release checklist exist.
- BAR-15 đã thêm cutover foundation: export legacy_id + per-entity checksum,
  import idempotent (skip existing, reject tampered checksum), reconcile
  exact counts/hashes, cutover state machine NOT_STARTED→EXPORTED→
  IMPORTED→RECONCILED→ARCHIVED (transition ngoài map bị chặn). PostgreSQL
  production adapter + real cutover là slice theo sau.

**Description / To-do**

- Freeze/export schema/data/attachments; add global IDs, workspace, version and
  timestamps.
- Build idempotent importer with `legacy_id`, checksum and reconciliation.
- Implement Planning module/Postgres compatibility API.
- Dual-read comparison, controlled write freeze, final import, read-only archive
  and companion service retirement.

**Backend**

- Transactional task move/version/audit; migrate feature/screen/concern links.
- Never dual-write without reconciliation and explicit cutover state.

**Frontend / UX / Wireframe**

- Preserve Docs/Roadmap/Board/Reports/Evidence behavior and URLs.
- Upgrade board with shared DataTable/drawer/filter/saved view/accessibility only
  after persistence parity.

**Exit gate**

- Entity/attachment/count/hash/audit reconciliation is exact or documented.
- Rollback/read-only archive tested; no lost/mutated legacy evidence.
- SQLite companion removed from runtime only after signed cutover.

**Technical debt**

- Local-only offline mode may remain as explicit personal mode, never shared
  authority.
- Legacy HTML/content archive retained by retention policy.

### Phase U19 — Release, DR, Open-Source & Product Hardening

**Goal**

Đóng gói một stable Portal có release governance, operational evidence, tài
liệu onboarding và rollback/DR đủ để tiếp tục mở rộng.

**Guide index**

- [§14 Observability](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#14-observability-monitoring-và-incident-response)
- [§16.5–16.8 release/DR/DX](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#165-release-governance)
- [§31.7 Platform DoD](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#317-definition-of-done-cấp-platform)
- [§32 Risk register](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#32-risk-register)

**Đã làm**

- Root CI, image publishing, production Compose/deploy skeleton, security/
  contributing/community docs and stack smoke exist.
- Root README chưa đủ open-source/reproducible dependency guide và repo chưa có
  license file.

**Description / To-do**

- Complete OTel traces, metrics/log dashboards, alerts, SLOs and runbooks.
- Add PostgreSQL PITR/restore drill, object versioning/hash verification, NATS
  recovery, config/identity backup and game-day tests.
- Release manifest includes image/schema/migration/engine compatibility,
  SBOM/signature, feature defaults, notes and rollback.
- Upgrade root README: prerequisites, Docker/native setup, dependency matrix,
  troubleshooting, architecture/routes, tests and support.
- Owner chooses/adds license before calling repository open-source; add changelog
  and release/version policy.
- Run WCAG, visual, load/soak, security scan, backup/restore and full E2E gates.

**Backend**

- No committed secret/data/artifact; production config and migrations validated.
- Supply-chain scan/signature and compatibility matrix for Portal/engine release.

**Frontend / UX / Wireframe**

- Final usability review by manager/quant/operator; fix dead ends and unclear
  destructive flows.
- Bundle/LCP/chart/table budgets and mobile/accessibility/print evidence pass.

**Exit gate**

- `dev` complete stack green; release PR promotes exact artifacts to `main`.
- Restore/rollback/game-day and production go/no-go evidence approved.
- README/license/support/security/release notes match actual shipped stack.

**Technical debt**

- Multi-region, advanced enterprise IAM, ClickHouse and Kubernetes remain
  optional future roadmap unless measured requirements activate them.
- Technical debt accepted at release must have owner, severity and target phase.

---

## 8. UX work order và wireframe review gates

Không thiết kế đồng loạt 26 screen ở high fidelity. Thứ tự review hợp lý:

1. **Foundation:** status/data-mode, typography, spacing, form/table/chart states.
2. **Shell:** Login, Command Center, navigation, Portal Map, Profile/Access.
3. **Current capability:** QuantBT embedded và Planning embedded ở bốn viewport.
4. **Research workflow:** Alpha Pool → Detail → Workbench → Backtest Wizard.
5. **Evidence workflow:** Queue → WFO → Run Detail → Compare → Approval.
6. **Promotion workflow:** Paper → Sandbox → Live, chỉ high fidelity khi backend
   contract của môi trường đó đã khóa.
7. **Operations:** Data Quality → Monitoring/Incident → Reconciliation.
8. **Administration/Planning:** Users/Access, Accounts, Settings, Roadmap/Board.

Mỗi frame phải có:

```text
screen_id / feature_id / maturity / data_mode
permission / route / API-schema source / fixture source
loading-empty-partial-stale-denied-failure states
responsive notes / accessibility notes
primary decision / primary action / dangerous action rules
linked concern/task/ADR/evidence
```

Sáng tạo UX được khuyến khích trong ba vùng:

- Context continuity: từ lifecycle → resource → evidence → task và quay lại.
- Progressive disclosure: surface chính calm, detail/evidence mở bằng drawer/tab.
- Decision confidence: mọi action quan trọng đặt cạnh provenance, freshness,
  policy và consequence.

Không sáng tạo bằng cách đổi semantics engine, tạo fake metric, giấu environment
hoặc thu nhỏ critical confirmation.

## 9. Global Definition of Done

Một phase chỉ được `DONE` khi:

- Goal đạt bằng code/evidence, không chỉ có wireframe hoặc TODO.
- Contract/backend/domain test đi trước UI completion.
- Current capability và compatibility/rollback path pass.
- Permission/security enforced server-side.
- Loading/empty/partial/stale/denied/failure states có test.
- Desktop/tablet/mobile, keyboard, focus, contrast và reduced-motion pass theo
  scope screen.
- Performance budget và telemetry liên quan đã đo.
- Không secret, raw token, market data, runtime DB, cache hoặc generated output
  vào Git.
- Docs/runbook/task/technical debt được cập nhật và commit coherent.
- Feature maturity chỉ đổi khi activation gate và evidence tương ứng pass.

## 10. Non-goals xuyên suốt

- Không big-bang rewrite FastAPI/React hiện tại.
- Không iframe làm kiến trúc chính.
- Không reimplement QuantBT PnL/metric/selection ở TS/Rust/frontend.
- Không browser arbitrary Python trong shared/live environment.
- Không fake account, broker, live PnL, incident hoặc data quality.
- Không direct TradingView/web UI → broker; mọi intent qua risk authority.
- Không public origin port, không `noTLSVerify=true` như permanent fix.
- Không shared/default bootstrap password hoặc secret trong repo/log/task.
- Không Rust/ClickHouse/Kubernetes trước contract/profile/evidence.
- Không gọi prototype `production/live-ready` chỉ vì UI đã đẹp.

## 11. Owner review checklist cho plan

- [ ] Chấp thuận U00–U19, U01-BE và critical path.
- [x] Historical Market Data consumer authority đã được owner cung cấp; exact
  wheel, fail-closed manifest và canonical read-only storage đã được index.
- [x] Chấp thuận U01-BE là backend implementation phase đầu tiên và chỉ certify
  Binance perpetual OHLCV trước khi mở các family khác ở U13.
- [ ] Chấp thuận thin TypeScript auth BFF ở U07 để tái sử dụng thành U10.
- [ ] Chấp thuận giữ current npm locks đến U09 rồi mới quyết định pnpm workspace.
- [ ] Chấp thuận U13 ở trạng thái PARTIAL: historical reader không còn blocker
  tổng quát, nhưng availability vẫn fail-closed theo family/environment smoke.
- [ ] Xác nhận Access Dashboard state trước U06 activation.
- [ ] Xác nhận kênh giao activation credential ngoài Git/chat/task board.
- [ ] Xác nhận alpha package sample và private trading/data repository owner khi
  mở U13/U14/U16.
- [ ] Chọn license trước U19 nếu muốn public repository là open-source thực sự.

---

# 12. Execution Loop — frontend phase plan và alignment với codex

> **Owner giao 2026-08-21.** Section này do Claude (frontend lead) viết. Nó
> **chỉ thêm**, không sửa U00–U19 hay bất kỳ mục nào ở trên — `upgrade/**` vẫn
> là docs của codex và carve-out này là ngoại lệ owner cho phép, ghi lại ở
> `CLAUDE.md` §0.
>
> **Phân vai tài liệu:** section này là **cấu trúc bền** (phase nào giao gì, phụ
> thuộc gì, đóng bằng gì). **Trạng thái sống** — cái nào đang WIP, evidence nào
> đã thu — nằm ở `upgrade/upgrade_frontend_plan_hifi/hifi_execution_loop/PHASE_TRACKER.md`.
> Đừng chép trạng thái vào đây; hai bản trạng thái sẽ lệch nhau trong một tuần.

## 12.1 Quan hệ với U00–U19

Execution Loop **không phải đánh số phase mới** thay cho U. Nó là chia nhỏ theo
màn của phần công việc vốn đã nằm trong:

| Nội dung | Phase U | APX slice (spec v0.7 §25) |
|---|---|---|
| Approval Inbox, Gate R1/R2, exit review | U15 | APX-1 |
| Paper read-only, các 360° | U15 | APX-2 |
| Admin plan/apply/verify | U15 | APX-3 |
| Sandbox certification | U15 | APX-4 |
| Canary/Live governance | U16 | APX-5 |
| Portfolio intelligence, correlation | U16 | APX-6 |

19 "phase" trong `IMPLEMENTATION_PHASES.md` là **đơn vị giao hàng theo màn**, để
một màn được đóng trọn vẹn thay vì mười màn cùng dở dang. Khi report tiến độ lên
plan này, quy về U15/U16 và APX; khi làm việc hằng ngày, dùng số phase.

**Scope lock:** đợt này chỉ Execution Loop. QuantBT Research/Backtest và Planning
không đụng tới ở cả hai phía (`CLAUDE.md` §0).

## 12.2 Hai lane song song, và vì sao điều đó không phá §5

§5 quy định mọi thay đổi production đi theo thứ tự
`contract/schema → backend/domain tests → API/read model → UI states → E2E`.
Frontend đang chạy trước codex, nên phải nói rõ vì sao không mâu thuẫn:

- **Lane A — không phải production change.** Component dùng chung, contract type,
  fixture, primitive scale. Chúng không render dữ liệu thật, không có route sản
  phẩm, không đổi maturity của feature nào. Chúng là *nguyên liệu*, và §5 nói về
  *thay đổi production*.
- **Lane B — là production change, và tuân thủ §5 đầy đủ.** Mọi màn thật (phase
  1–17) chỉ bắt đầu sau khi contract của nó tồn tại, và chỉ đổi maturity sau khi
  có authority thật + runtime evidence (spec §2.3).

Ranh giới kiểm chứng được: bất cứ thứ gì Lane A tạo ra đều nằm ngoài registry và
ngoài nav. Nếu một màn Lane A xuất hiện trong sidebar, ranh giới đã bị vi phạm.

**Prop của Lane A không phải phỏng đoán.** Chúng chép từ tài liệu đã tồn tại —
envelope từ guide §5, chart envelope từ spec §16.2, bốn state field từ spec §5.2,
id từ DB schema guide, và từ 2026-08-21 là `trading_system_portal_contract_pack/extract/`.
Khi codex công bố tên field khác, chỗ sửa là `apps/portal/frontend/src/execution/contracts.ts`,
không phải 17 màn.

## 12.3 Bảng alignment 19 phase

`BE prereq` là thứ codex phải giao trước khi Lane B của phase đó bắt đầu.
`BR-EX-*` xem `EXECUTION_SCALE_AND_REFINE.md` §5.

| # | Màn (WF) | FE deliverable | BE prereq | BR-EX | Exit gate |
|---|---|---|---|---|---|
| 0 | Shell & shared components | 13 component × mọi state + fixture page; sidebar/topbar từ registry | registry rev 3/4 | — | **ĐÓNG 2026-08-21**: vitest + build + visual baseline **101/101** |
| 1 | Approval Inbox (4a) | bảng pending + recently-decided, 7 filter chip, SoD row dimmed | approvals read model | 01/02/03 | filter round-trip, SoD row không bị filter bỏ |
| 2 | Gate R1 Review (1a) | decision bar, artifact passport, checklist, conditions composer | approval decision write | — | decision ghi được, inbox phản ánh |
| 3 | Gate R2 Review (1b) | readiness checklist, R1 reference, capital preview strip | capital preview + R1 ref | — | preview recompute; R1 EXPIRED khoá cả decision bar |
| 4 | Paper Workbench (1c) | header band, lineage, rail, 5-KPI, equity + gate progress, blotter | deployment/session/PnL reads | 04 | FRESH/STALE + operatorAdmin render từ fixture |
| 5 | Paper Exit Review (4b) | 4 evidence panel 2×2, decision footer 3 nhánh | observation evidence | — | 3 outcome ghi 3 state khác nhau |
| 6 | Admin Action Drawer (1i) | catalog 21 lệnh × 6 nhóm, drawer plan→apply→verify | commands plan/apply/verify | — | một allocation chạy thật, có ledger + audit row |
| 7 | Operations Queue (4e) | bảng operation + Alert Rail 340px | operation state + alert | 01/02/09 | queue ↔ drawer ↔ incident round-trip |
| 8 | Incident Detail (4d) | state rail forward-only, evidence + operations panel | findings + operations | — | resolve ép đủ 2 precondition, không auto-resume |
| 9 | Command Center (5a) | triage ranked, fleet health, watchlist, Today strip | ranked triage + fleet | 08/10 | mọi row điều hướng; triage cùng nguồn với rail |
| 10 | Sandbox Certification (1d) | 7-step strip, triptych Internal/Broker/Diff | cert state machine + sync | — | 7 step render từ data; CRITICAL khoá exit |
| 11 | Canary Control Room (1e) | guard đôi, envelope compliance, protective vs scale | canary envelope + sync | 04 | STALE chặn scale-up, **không** chặn protective |
| 12 | Live Full Operations (1f) | guard đặc, internal-vs-broker pair | live reads + sequence | 04/11 | MISMATCH triệt tiêu mọi giá trị broker-derived |
| 13 | Paper Workbench VNM (4h) | calendar banner INFO, VND chip, LO/ATO/ATC, DNSE strip | venue calendar + precision | 12 | đồng hồ freshness dừng ngoài 09:00–14:45 ICT |
| 14 | Full Blotter (4c) | keyset table + virtualization, funnel drawer, cross-filter | cursor + filter/sort + funnel | 01/02/03/13 | đến từ màn nào thì pre-apply scope màn đó |
| 15 | Alpha 360° (2a+2b) | scope bar, deployment map, 9 tab, 12 tile preview-res | per-deployment reads + batch tile | 04/06/15 | một lần đổi scope re-filter đủ 9 tab |
| 16 | Portfolio 360° (1h→3a) | heatmap clustering + leader lens, ledger, approvals | correlation snapshot | 07/01 | cặp thiếu mẫu render INSUFFICIENT_DATA, không phải ô trắng |
| 17 | Account/Broker 360° (1g) | triptych, binding panel, linked accounts + headroom | **aggregate exposure** | 14/01/12 | headroom tính từ toàn tập, không từ một trang |
| 18 | Hardening | ECharts thay SVG, role lens, break-glass, density | analytics + role lens | 05 | caption envelope giữ nguyên văn sau khi thay chart |

> **Backend checkpoint 2026-08-23:** Phase 7 F1a đã đạt
> `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE` cho phần Portal-owned trên SGP:
> exact-count/bidirectional-keyset Operations Queue và acknowledge→resolve
> sidecar. Trading System result/source vẫn unavailable và immutable; Alert
> Rail/source-backed Incident Detail chưa được tuyên bố xong. Chi tiết:
> [`EX_BE_05B_F1A_OPERATIONS_QUEUE.md`](./backend/EX_BE_05B_F1A_OPERATIONS_QUEUE.md).

> **Backend checkpoint 2026-08-23 — EX-BE-05b/F1b Phase 8:** Portal-owned Incident
> Detail trên SGP đạt `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE` với rail
> OPEN→MITIGATED→RESOLVED, acknowledge/assign, append-only annotation/evidence,
> operation correlation, optimistic/idempotent writes và resolution bắt buộc
> clean-dry-run hash + reason. Resolve không auto-resume; outbox/source side
> effect luôn false. Bốn panel findings/alerts/dead-letters/trace-order vẫn
> typed unavailable chờ Trading System contract và D2→D4. Chi tiết:
> [`EX_BE_05B_F1B_INCIDENT_DETAIL.md`](./backend/EX_BE_05B_F1B_INCIDENT_DETAIL.md).

> **Backend checkpoint 2026-08-24 — EX-BE-02-LIVE D3:** real SGP→AWS-HK
> transport is `D3_TRANSPORT_ACCEPTED / BUSINESS_SOURCE_DARK / D2_RUNTIME_RESTORED`.
> HTTP/2, TLS 1.3 mTLS, the delegated-JWT matrix, bounded
> latency, Source Proxy loss/recovery and unchanged-D2 rollback passed. D4 is
> `D4_OFFLINE_AUTHORIZATION_PREPARED / D3_PREDECESSOR_ACCEPTED / LIVE_D4_INPUTS_BLOCKED`;
> registry stays `fixture`, and Query/analytics/SSE/
> commands/activation remain off. Detail:
> [`EX_BE_02_LIVE_D3_TRANSPORT_ACCEPTANCE.md`](./backend/EX_BE_02_LIVE_D3_TRANSPORT_ACCEPTANCE.md).
>
> D4 readiness is `D4_READINESS_AUDITED / LIVE_D4_INPUTS_BLOCKED / NO_SOURCE_READ`:
> the next external input is the owner-published mandatory-auth Paper read
> contract; the next infrastructure input is a separately encrypted projection
> store on the existing AWS-HK host. Request:
> [`EX_BE_02_LIVE_D4_READINESS_AUDIT_AND_OWNER_REQUEST.md`](./backend/EX_BE_02_LIVE_D4_READINESS_AUDIT_AND_OWNER_REQUEST.md).

> **Backend checkpoint 2026-08-24 — D4 mapper core:** status is `D4_MAPPER_CORE_OFFLINE_COMPLETE / RUNTIME_FAIL_CLOSED / LIVE_INPUTS_BLOCKED`.
> Rust exact-decimal mapping for orders/fills/positions/
> events, cross-alpha rejection, composite event cursor, sealed synthetic
> replay and fresh-PostgreSQL BUILDING-only evidence are complete. Edge
> readiness now separates store health from actual ingestion health. No live
> source call, Query/SSE/analytics/command, ACTIVE epoch or non-fixture profile
> exists. Owner identity/cursor/resync input and encrypted storage remain the
> next D4 gates. Detail:
> [`EX_BE_02_LIVE_D4_MAPPER_CORE_HARDENING.md`](./backend/EX_BE_02_LIVE_D4_MAPPER_CORE_HARDENING.md).

> **Backend checkpoint 2026-08-24 — D4 encrypted projection storage:** status is `D4_ENCRYPTED_STORAGE_BOUNDARY_PREPARED / LIVE_VOLUME_NOT_PROVISIONED / NO_SOURCE_READ`.
> The offline schema, read-only preflight and D4 Compose
> overlay now prevent root-filesystem/D2-volume reuse and require independent
> encrypted-EBS/KMS evidence plus exact mount UUID/options/ownership. No paid
> AWS resource, mount, Docker volume or source read was created. Live D4 still
> waits for owner approval/provisioning, the dedicated Paper read identity and
> the stable cursor/completeness/resync contract. Detail:
> [`EX_BE_02_LIVE_D4_ENCRYPTED_STORAGE_BOUNDARY.md`](./backend/EX_BE_02_LIVE_D4_ENCRYPTED_STORAGE_BOUNDARY.md).

> **Owner handoff 2026-08-24 — D4 inputs:** `D4_OWNER_ACTION_PACKET_PREPARED / OWNER_ACTIONS_PENDING / NO_SOURCE_READ`.
> The packet gives Bobby the exact encrypted gp3 creation/mount/evidence path
> and gives the Trading System owner agent a bounded implementation/test/
> sanitized-response contract for the dedicated Paper read identity. It grants
> neither direct database access nor runtime activation. Detail:
> [`EX_BE_02_LIVE_D4_OWNER_ACTION_PACKET.md`](./backend/EX_BE_02_LIVE_D4_OWNER_ACTION_PACKET.md).

> **Backend checkpoint 2026-08-24 — D4 source/storage reconciliation:** status
> is `D4_SOURCE_AND_STORAGE_INPUTS_RECONCILED /
> CONTRACT_ARTIFACT_IMPORT_PENDING / NO_PORTAL_SOURCE_TRAFFIC`. The owner has
> locally accepted a dedicated loopback-only, mandatory-auth Paper facade and
> prepared a separate encrypted gp3 projection filesystem. Portal authorization
> v2 now locks source commits/image, scope/bounds, revoked-key evidence and
> Source Proxy delivery. No source request, epoch, Query/SSE/analytics/command
> or registry activation occurred. Detail:
> [`EX_BE_02_LIVE_D4_SOURCE_AND_STORAGE_RECONCILIATION.md`](./backend/EX_BE_02_LIVE_D4_SOURCE_AND_STORAGE_RECONCILIATION.md).

> **Backend checkpoint 2026-08-25 — D4 first live qualification:** status is
> `D4_LIVE_ATTEMPT_FAIL_CLOSED / PORTAL_COMPATIBILITY_REMEDIATED /
> SIGNED_REPUBLISH_REQUIRED / D2_DARK_RESTORED`. Mandatory-auth Source Proxy
> and the separate encrypted BUILDING epoch were exercised without enabling
> Query, analytics, SSE, command or activation authority. Qualification found
> an undersized pagination burst and exact scientific-decimal compatibility;
> both are patched and regression-tested, and accepted D2 dark is healthy
> again. D4 is not accepted until protected-main signed images and one fresh
> finite owner window pass. Detail:
> [`EX_BE_02_LIVE_D4_QUALIFICATION_ATTEMPT_AND_REMEDIATION.md`](./backend/EX_BE_02_LIVE_D4_QUALIFICATION_ATTEMPT_AND_REMEDIATION.md).

> **Backend checkpoint 2026-08-25 — D4 Paper read shadow accepted:** status is
> `D4_PAPER_READ_SHADOW_ACCEPTED / BUILDING_ONLY / D2_DARK_RESTORED /
> BUSINESS_READER_STILL_DARK`. Protected-main signed artifacts completed a
> fresh finite mandatory-auth qualification into separately encrypted
> PostgreSQL. Replay/freshness, source and database recovery, idempotency,
> bounded load and encrypted dump/restore passed; D2 dark was restored with
> zero OOM/restarts. The D4 epoch remains BUILDING and registry remains
> `fixture`; Query, analytics, SSE, commands and activation are still off.
> Detail:
> [`EX_BE_02_LIVE_D4_PAPER_READ_SHADOW_ACCEPTANCE.md`](./backend/EX_BE_02_LIVE_D4_PAPER_READ_SHADOW_ACCEPTANCE.md).

> **Backend follow-up 2026-08-25 — D4 source-facade steady-state audit:** the
> finite shadow acceptance remains evidence-valid, but the current Trading
> System-owned facade is only a qualification bridge. Its unconditional 500 ms
> full-scope capture continues without a consumer and is not accepted for
> continuous runtime. Before any read delivery-profile promotion it must become
> dormant/lease-aware, use an owner-published incremental cursor, enforce
> time+size retention and backpressure, and pass a separate 24-hour soak. No
> source service, Portal runtime or registry flag was changed by this audit.
> Detail:
> [`EX_BE_02_D4_SOURCE_FACADE_RUNTIME_OPTIMIZATION.md`](./backend/EX_BE_02_D4_SOURCE_FACADE_RUNTIME_OPTIMIZATION.md).

> **Backend checkpoint 2026-08-23 — EX-BE-05b/F2 Phase 10:** Portal-owned
> Sandbox Certification trên SGP đạt
> `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE`: DRAFT→IN_REVIEW→APPROVED|DENIED,
> đúng bảy bước có authority/freshness/evidence, evidence-set hash chống TOCTOU,
> SoD submitter/approver và CANARY promotion plan luôn `BLOCKED`. Profile vẫn
> `fixture/UNAVAILABLE`; không có public source-evidence route, outbox, AWS-HK/
> source call, runtime activation hoặc promotion execution. Evidence: 45/45
> contracts, fresh-PG Control API 163/163, eleven migrations + dump/restore.
> Chi tiết:
> [`EX_BE_05B_F2_SANDBOX_CERTIFICATION.md`](./backend/EX_BE_05B_F2_SANDBOX_CERTIFICATION.md).

> **Backend checkpoint 2026-08-23 — EX-BE-05b/F3 Phase 11:** Portal-owned
> Canary Control Room source-dark trên SGP đạt
> `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE`. Capital envelope DRAFT là
> append-only revision, exact decimal, bind current approved F2 evidence +
> blocked CANARY plan và exact predecessor. Năm KPI và mọi source/runtime/
> positions/blotter/series/rollback value đều `fixture/UNAVAILABLE`.
> `BROKER_STALE_BLOCKS_SCALE_ONLY` giữ đúng bất đối xứng tương lai, nhưng cả
> protective lẫn scale hiện vẫn ẩn/tắt. Không source ingestion, outbox,
> activation hay command route. Chi tiết:
> [`EX_BE_05B_F3_CANARY_CONTROL_ROOM.md`](./backend/EX_BE_05B_F3_CANARY_CONTROL_ROOM.md).

> **Backend checkpoint 2026-08-23 — EX-BE-05b/F4 Phase 12:** Live Full
> Operations Lane A source-dark trên SGP đạt
> `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE`. Latest Canary envelope chỉ là
> predecessor và `active_for_live_full=false`; mọi runtime/KPI/source/positions/
> orders/open-order count/incidents/series/continuity/rollback/realtime đều
> unavailable. Broker panel bị schema suppress và source gap chặn R4; cả R3/R4
> vẫn ẩn/tắt. Canonical guard là
> `BROKER_MISMATCH_SUPPRESSES_VALUES_AND_SOURCE_GAP_BLOCKS_R4`. Không source
> call, outbox, activation, SSE hoặc command route.
> Chi tiết:
> [`EX_BE_05B_F4_LIVE_FULL_OPERATIONS.md`](./backend/EX_BE_05B_F4_LIVE_FULL_OPERATIONS.md).

> **D2 placement/resource checkpoint 2026-08-23:** toàn bộ Portal, browser BFF,
> Control API và product database vẫn chạy tại SGP Research. AWS-HK hiện hữu
> chỉ nhận Source Proxy, Rust Execution Edge, dark projection PostgreSQL và
> one-shot migrator; không tạo EC2/EIP/D1B mới. Hard ceiling được nới lên 5.00
> vCPU / 5,632 MiB lúc startup và 4.00 vCPU / 4,608 MiB khi chạy dài hạn để
> tránh OOM do limit quá nhỏ; đây không phải reservation và baseline/delta
> admission cùng Trading System rollback gate vẫn bắt buộc. Giữ IAM role D1
> hiện hữu để audit/rollback nhưng instance profile phải được detach sau khi
> harden IMDS và trước khi workload chạy. Live D2 vẫn chưa được phép cho tới
> khi exact IAM DryRun, signed images, workload PKI/JWKS và change window đều
> xanh. Chi tiết: [`EX_BE_02_D2_PLACEMENT_DECISION.md`](./backend/EX_BE_02_D2_PLACEMENT_DECISION.md).
> Canonical placement: full Portal stays on SGP; AWS-HK hosts only the minimal
> Execution Edge boundary.

> **D2 live checkpoint 2026-08-24:** minimal AWS-HK Rust Edge + Source Proxy +
> schema-only PostgreSQL đã đạt `D2_DARK_ACCEPTED / SOURCE_INACTIVE`. IMDS hop
> limit 1 và temporary instance profile detachment được verify trước startup;
> ba service healthy qua soak hơn 15 phút, zero restart/OOM/source request, và
> full rollback/redeploy giữ nguyên volume/migration 4/4 trong khi Trading
> System luôn HTTP 200. Tất cả business/source/query/analytics/SSE/command flag
> vẫn false/fixture. Phase backend kế tiếp là D3 live transport acceptance với
> một owner window mới; chưa phải D4 hoặc source activation. Chi tiết:
> [`EX_BE_02_LIVE_D2_DARK_EXECUTION_EVIDENCE.md`](./backend/EX_BE_02_LIVE_D2_DARK_EXECUTION_EVIDENCE.md).

> **Backend checkpoint 2026-08-26 — N14A Portal release authority:** status is
> `N14A_COMPLETE_SOURCE_DARK / N14B_OWNER_RELEASE_EVIDENCE_PENDING /
> PRODUCTION_INACTIVE`. A protected-main commit now produces one exact
> six-image digest manifest with SBOM/SLSA, Trivy and signature evidence;
> stable SGP consumes per-service digests and owns state distinct from dev.
> Production requires the reviewed manifest hash, vulnerability acceptance and
> a signed owner decision bound to the exact candidate. Seventeen release/
> security tests, actionlint and a real three-volume PostgreSQL dev/stable/
> restore + forward-fix rehearsal pass. No AWS-HK/Trading System traffic or
> Projection/Query/SSE/command activation occurred. N14B later binds exact
> owner source/gateway bytes after N13B target selection. Detail:
> [`EX_BE_17_N14A_PORTAL_RELEASE_AUTHORITY_SOURCE_DARK.md`](./backend/EX_BE_17_N14A_PORTAL_RELEASE_AUTHORITY_SOURCE_DARK.md).

> **Backend checkpoint 2026-08-29 — N14B current-source compatibility:**
> status is `N14B_PORTAL_COMPATIBILITY_ACCEPTED /
> PROFILE_RUNTIME_NOT_ACTIVATED`. A separate adjunct re-verifies the signed
> N14A candidate and binds the exact N13B Paper source/profile/qualification,
> Portal adapter/config bytes, three immutable service images and rollback
> chain. Candidate/rollback Compose renders and all negative/full gates pass.
> This is not runtime, registry, Query/SSE/command or Trading System release
> authority. N15B later consumed the bounded candidate. Detail:
> [`EX_BE_17_N14B_IMMUTABLE_CURRENT_SOURCE_RELEASE_COMPATIBILITY.md`](./backend/EX_BE_17_N14B_IMMUTABLE_CURRENT_SOURCE_RELEASE_COMPATIBILITY.md).

> **Backend checkpoint 2026-08-26 — N15A source-dark four-interface gateway:**
> status is `N15A_COMPLETE_SOURCE_DARK / SUPERSEDED_BY_N15B_CURRENT_ACCEPTANCE /
> PRODUCTION_INACTIVE`. Query, Command, Event and Artifact negotiate/fail/roll
> back independently, use separate read/command identities and bounded
> TLS1.3/HTTP2 policies, and have pure Event continuity plus Artifact reference
> validation. Component OpenAPI has no path/server and local fault evidence
> proves `network_attempts=0`; no AWS-HK/Trading System source, credential or
> runtime changed. N15B later accepted only the current bounded Paper Query
> path and kept the other interfaces independent. Detail:
> [`EX_BE_18_N15A_SOURCE_DARK_FOUR_INTERFACE_GATEWAY.md`](./backend/EX_BE_18_N15A_SOURCE_DARK_FOUR_INTERFACE_GATEWAY.md).

> **Backend checkpoint 2026-08-29 — N15B current-capability inter-cell
> gateway:** status is `N15B_CURRENT_QUERY_ACCEPTED /
> PRODUCT_RUNTIME_DARK`. Rust Edge and TypeScript BFF accept only
> `paper / PAPER_BINANCE_USDM / PAPER_TRADING_SCREEN` and its three current
> read capabilities, before transport. Command is deferred to N16B under a
> separate identity; Event and Artifact remain typed absent. Immutable D3 and
> Manager qualification evidence, scope/bounds/drift/rollback and full
> workspace tests pass. Candidate deployment, product BFF/profile, registry,
> SSE, Command and Trading System change remain false. Detail:
> [`EX_BE_18_N15B_CURRENT_CAPABILITY_INTERCELL_GATEWAY_ACCEPTANCE.md`](./backend/EX_BE_18_N15B_CURRENT_CAPABILITY_INTERCELL_GATEWAY_ACCEPTANCE.md).

> **Backend checkpoint 2026-08-27 — N16A source-dark emergency routing:**
> status is `N16A_COMPLETE_SOURCE_DARK /
> SUPERSEDED_BY_N16B_CURRENT_PRIMITIVE_ACCEPTANCE /
> PRODUCTION_INACTIVE`. One same-origin `/ops/emergency/*` component contract,
> server-side origin isolation, five-minute session/WebAuthn ceremony,
> command-independent typed health, immutable audit and local Research/
> Cloudflare/execution-origin/rollback drills are complete. OpenAPI has no
> path/server, the unmounted Nginx blueprint has no forwarding directive,
> N12 R3 remains unpublished and R4 resume/scale is structurally forbidden.
> No public route, Cloudflare/DNS/tunnel, AWS-HK/source/runtime changed and
> `network_attempts=0`. N16B subsequently consumed this boundary without
> mounting it. Detail:
> [`EX_BE_19_N16A_SOURCE_DARK_ROUTING_AND_EMERGENCY_POLICY.md`](./backend/EX_BE_19_N16A_SOURCE_DARK_ROUTING_AND_EMERGENCY_POLICY.md).

> **Backend checkpoint 2026-08-29 — N16B current protective primitive:**
> status is `N16B_CURRENT_PRIMITIVE_COMPATIBILITY_ACCEPTED /
> LIVE_EMERGENCY_CLOSE_ONLY / PRODUCT_RUNTIME_DARK`. Source-as-is inspection
> accepts only `live.emergency-close` for `LIVE_FULL / ACCOUNT / BINANCE /
> USD_M`; the other eight N12 commands are explicitly inactive or absent.
> Rust owns the exact command transport gate and TypeScript returns a sanitized,
> immutable blocked plan. Read identity, widened target, R4 inheritance,
> automatic retry after dispatch and premature runtime activation all fail
> closed. No public route, source call or Live mutation occurred. Detail:
> [`EX_BE_19_N16B_CURRENT_PRIMITIVE_PROTECTIVE_PATH_ACCEPTANCE.md`](./backend/EX_BE_19_N16B_CURRENT_PRIMITIVE_PROTECTIVE_PATH_ACCEPTANCE.md).

> **Backend checkpoint 2026-08-27 — N17A source-dark production/DR:** status is
> `N17A_COMPLETE_SOURCE_DARK / N17B_READY_FOR_EXACT_SET_ACCEPTANCE /
> LIVE_MUTATION_WAITING_EXACT_OWNER_WINDOW`. Pure Rust/contracts distinguish provisional budgets
> from measured production SLO/error budgets and keep production RPO/RTO/cost
> null. Unmounted observability, recovery, rotation, owner and game-day
> blueprints are complete. An internal-only Docker rehearsal passed WAL PITR
> to an exact LSN, ephemeral encrypted logical restore, deterministic
> projection rebuild, identity rotation/compromise, rollback and all eight
> fault scenarios. No runtime/source/command/AWS-HK/Trading System change was
> made. Detail:
> [`EX_BE_20_N17A_SOURCE_DARK_PRODUCTION_DR_PREPARATION.md`](./backend/EX_BE_20_N17A_SOURCE_DARK_PRODUCTION_DR_PREPARATION.md).

> **Backend checkpoint 2026-08-29 — N17B exact current set:** status is
> `N17B_EXACT_CURRENT_SET_ACCEPTED / PAPER_PRIVATE_QUERY_QUALIFIED /
> SIGNED_PRODUCT_IMAGE_NOT_PUBLISHED / LIVE_MUTATION_INACTIVE`. The Portal BFF
> now adapts only the accepted Paper screen and seven allowlisted Manager-v2
> relations, mints only the current read resource and hard-caps admission at
> 15 r/s below the source's 20 r/s limit. The real private route passed 25/25
> paced reads plus 401/403/405 negatives with zero emitted business rows,
> source mutations or command dispatches. Rust/JSON/CI pin the exact source,
> images and N13B–N17A evidence. Stable/public runtime, Sandbox/Live reads and
> all mutation flags remain false. Detail:
> [`EX_BE_20_N17B_EXACT_SET_PRODUCTION_ACCEPTANCE.md`](./backend/EX_BE_20_N17B_EXACT_SET_PRODUCTION_ACCEPTANCE.md).

## 12.4 Thứ tự slice của frontend

Lane A chạy trước; mỗi slice đóng độc lập và không slice nào chờ codex.

| Slice | Nội dung | Vì sao thứ tự này |
|---|---|---|
| **S0** `DONE` | 13 component + fixture page + Carbon surface cô lập | Nguyên liệu của mọi phase sau |
| **S1** `DONE` | **Reconcile `contracts.ts` với `extract/`** — 22 enum, 91 DB CHECK, 124 reason code, 85 payload model | Type sai thì 17 màn sai theo. Pass đầu đã bắt `BrokerSync` thiếu `ERROR`. Rẻ nhất khi làm trước, đắt nhất khi làm sau |
| **S1b** `DONE` | **Reconcile với master plan §7.1** — envelope thêm `projectionEpoch/Sequence`, `sourceCursor`, `lagMs`, `panelState`, `capabilitySnapshotId`; thêm `VerificationResult` (8), `CapabilityState` (5), `RiskTier`, `DeliveryProfile`; 3 component mới | Codex công bố envelope khác với guide §5. Chỗ sửa là `contracts.ts`, đúng như §12.2 đã hứa — không màn nào phải sửa |
| **S1c** `DONE` | **Tiêu thụ registry rev 4** — `delivery_profile` + `delivery_policy` (7 flag) trên `screens[]`; `reconcilePanelProfile` fail-closed; `commandEnabled` theo risk tier | Rev 4 về giữa slice. Profile quyết định `shadow` có bị nhầm thành production hay không; policy quyết định **nút lệnh có tồn tại hay không**. Đọc structural chứ không bám type generated, để không phải land hai thay đổi cùng lúc |
| **S2** `DONE` | **Primitive M1** — `components/table.tsx`: keyset **hai chiều**, virtualization trên 200 dòng, row cao cố định 32px, sticky header, exact count. **Không có số trang** | Phase 1/7/14/15/16/17 đều dùng. Keyset không seek được tới trang *n*, nên vẽ nút số trang là nói dối. Cửa sổ trượt, không phải scrollbar cao 182k dòng |
| **S3** `DONE` | **Adapter** `adapter.ts` — decimal giữ nguyên dạng string, envelope §7.1 → camelCase, keyset page, unknown enum thành finding | `extract/serialization-contract.json`: **63 trường numeric về dạng JSON string**. `Number("0.00100000")` là `0.001` — mất đúng phần precision nói lên tick size của instrument. Adapter không gọi `Number()` lên bất kỳ trường tiền/lượng/giá nào |
| **S3b** | **Fixture layer** từ `query-samples/`, `event-samples/` | Sample là **synthetic** (`_provenance` nói rõ), nên chỉ dùng minh hoạ hình dạng; giá trị lấy từ `extract/` |
| **S4** `DONE` | **Primitive M2/M3** — `series.ts` (thang finest-that-fits + validate cái server trả về) và `subscription.ts` (reducer thuần: gap · epoch cutover có overlap/jitter · reconnect) | Phase 4/11/12/15 dùng. Reducer thuần nên mọi transition test được mà không cần `EventSource` |
| **S5** `DONE` | Màn **bounded**: **Gate R1**, **Gate R2**, **Paper Exit Review**. Cộng **Approval Inbox** (phase 1) vì nó chỉ cần `EX-BE-04a/05a`, không cần Rust/AWS | Cardinality cố định theo artifact, không phụ thuộc quy mô; dựng được trọn vẹn trên fixture. Approval Inbox chen lên trước vì F-1 đã được nhận — nó là màn thật đầu tiên có thể nối dữ liệu |
| **S6** | **Admin Action Drawer** — renderer trên `GET /commands/catalog`, cộng cổng theo risk tier (fresh-auth R2+, second approver, WebAuthn R4) | Catalog là **dữ liệu server** (master plan §10.6), không phải danh sách 21 lệnh cứng; 21×6 của hi-fi trở thành fixture. R3 protective và R4 risk-increasing là **hai đường tách rời**, không phải một thang có ngưỡng (§9.2) |
| **S7** | **Visual baseline cho Carbon surface** | Khoá diện mạo Execution lại trước khi 17 màn dựng lên nó, đúng cách Research đã làm |

Sau S7, frontend hết việc độc lập: mọi thứ còn lại cần dữ liệu thật.

## 12.5 Definition of done — bổ sung cho §9

Ngoài §9 toàn cục, một phase Execution Loop còn phải:

- **Scale refine đủ 6 ô** (`CLAUDE.md` §8): cardinality, break point, degradation,
  server contract, invariant giữ nguyên, perf budget. Thiếu ô nào thì chưa xong.
- **Không đóng bằng "giống hi-fi ở 1440px".** Hi-fi là một mẫu viewport, không
  phải pixel spec (HANDOFF §3b).
- **Maturity chỉ đổi khi có authority thật.** Theo spec §2.3, dùng
  `CONTRACT_COMPLETE` / `FOUNDATION_COMPLETE` / `INTEGRATION_PENDING` /
  `PRODUCTION_INACTIVE` / `OPERATIONAL_EVIDENCE_PENDING` / `PRODUCT_COMPLETE`.
  Không dùng `COMPLETE` trống nghĩa. Màn chạy trên fixture giữ `PROTOTYPE` hoặc
  `COMMISSIONED` — **không render PnL/live status giả**.
- **Không tổng nào tính từ dòng browser đang giữ** (M7). Headroom, fleet count,
  gate progress, contribution share đều do server tính.
- **Ba gate xanh**: `vitest` + `npm run build` + visual baseline không drift.

## 12.6 Giao thức phối hợp với codex

- **Board chung:** `PHASE_TRACKER.md`. Codex giữ cột BE và §6; Claude giữ cột FE
  và §4/§5. Chi tiết riêng của mỗi bên ở tracking doc của bên đó
  (`FRONTEND_HANDOFF.md` §8 / `BACKEND_ARCHITECTURE_IMPLEMENTATION_GUIDE.md` §14.1).
- **Brief đã gửi:** `hifi_execution_loop/CODEX_BACKEND_PLAN_REQUEST.md`.
- **Thứ tự ưu tiên đã nêu với codex:** registry rev 3 → BR-EX-14 → BR-EX-02 →
  BR-EX-11 → phần còn lại.
- **Codex được quyền từ chối một `BR-EX-*`.** Từ chối là kết quả bình thường và
  frontend sẽ thiết kế lại màn quanh nó; thứ không xử lý được là im lặng.
- **Kiến trúc backend là quyền codex.** Frontend chỉ khẳng định màn hình cần gì.
- **Khi tài liệu lệch nhau hoặc lệch code:** ghi discrepancy kèm evidence, không
  chọn cách đọc tiện tay. `extract/` thắng mọi claim viết tay, kể cả của frontend.

## 12.7 Rủi ro và quyết định treo

| # | Vấn đề | Ảnh hưởng | Chờ ai |
|---|---|---|---|
| ~~E-1~~ | ~~Registry rev 3 chưa có~~ | **Đóng 2026-08-21** — `e78a597`, 17 route duy nhất, 4 group canonical | — |
| ~~E-11~~ | ~~**Luật ngôn ngữ mâu thuẫn với repo.** `CLAUDE.md` §3.8/§0 nói Research/Planning giữ tiếng Việt; `main` đã chuyển cả hai sang tiếng Anh từ **2026-08-18** (`2c0cf9e`, `b23619f`), tức ba ngày *trước* khi luật được viết ~~ | **Đóng 2026-08-21** — Bobby chốt: **tiếng Anh toàn bộ**, trừ tài liệu Roadmap/Task tracking vốn tiếng Việt thì giữ. `CLAUDE.md` §3.8/§0 đã viết lại; baseline đã khớp | — |
| E-2 | **Font IBM Plex chưa cài** | Surface có màu và hình học Carbon nhưng chữ Inter; DS §7 coi type mono-forward là một phần identity | Bobby (đổi lockfile) |
| E-3 | **Tỉ lệ order/fill** 1.000/ngày trên 150–500 deployment = ~2–7/deployment/ngày | Mọi ngân sách blotter, event và workbench dựng trên số này | Bobby |
| ~~E-4~~ | ~~`BrokerSync` sai~~ | **Đóng** — master plan §2.2: `ERROR/MISMATCH/OK/STALE` là của Trading System, `UNKNOWN` được phép tồn tại phía Portal như trạng thái "chưa quan sát lần nào". Đúng bằng kết luận độc lập của S1 | — |
| ~~E-5~~ | ~~15 `BR-EX-*` chưa có phán quyết~~ | **Đóng** — §15.1 phán quyết đủ 15: 11 ACCEPT, 4 MODIFY, 0 từ chối | — |
| E-6 | Gateway đang chạy **không** build từ git HEAD | Deploy phải pin image digest, không pin branch | codex/Bobby khi release |
| **E-7** | **Đường tới màn thật đang bị xếp sau đường tích hợp.** Phase 1/2 chỉ đọc-ghi bản ghi Portal (master plan §11), không cần Rust edge; nhưng build order §12.1 đặt chúng sau EX-BE-01→02→03, mà 02/03 lại chờ quyết định owner về mạng riêng SGP↔AWS | Màn có dữ liệu thật đầu tiên phải chờ một phê duyệt không liên quan đến nó | codex — đề nghị tách **EX-BE-04a** (keyset/filter/count trên control-plane Postgres, thuần TypeScript) khỏi 04b. Review F-1 |
| **E-8** | **`projection_sequence` liền mạch không chứng minh được nguồn không mất dữ liệu.** Hôm nay chỉ `ORDER_STATUS` là event-driven; phần còn lại là polling, nên một giá trị đổi rồi đổi lại giữa hai lần poll không để lại dấu vết nào | Phase 8 dựng timeline từ dữ liệu poll sẽ trình bày "khoảng trống chưa chứng minh" thành "không có khoảng trống". Luật §12.2 "gap chặn R4" không thể kích hoạt cho gap không phát hiện được | codex — BR-EX-16 |
| **E-9** | **`shadow` profile không có cách nào tới được màn hình.** Số liệu thật, hệ thống thật, màn thật, không phải production — và không có trường nào trong registry hay envelope nói điều đó | Người vận hành nhìn Canary Control Room ở shadow thấy số y hệt live | codex — BR-EX-20 |
| **E-10** | **`UNCERTAIN` chưa có luật đi kèm** | Nếu operator halt một strategy, nhận `UNCERTAIN`, nút retry bật hay tắt? Bật thì có thể halt hai lần; tắt thì có thể bị khoá khỏi việc bảo vệ một vị thế live. Cả hai đều hợp lý và frontend không được chọn | codex — BR-EX-21 |

**Bản phản biện đầy đủ:** [`hifi_execution_loop/BACKEND_PLAN_REVIEW.md`](upgrade_frontend_plan_hifi/hifi_execution_loop/BACKEND_PLAN_REVIEW.md)
— 9 finding, 7 request mới (BR-EX-16…22), và một request bị phán quyết nhầm câu hỏi (BR-EX-05).

### EX-BE-02B — Manager-v2 multi-profile read readiness (2026-08-28)

**Status:** `IMPLEMENTED / PRIVATE_READ_READY / PAPER_ACTIVE_HISTORICAL / SANDBOX_LIVE_DEPLOYMENT_READY / NO_LIVE_TRADING_TRAFFIC`.
The approved scope is the existing catalogue-bound Manager-v2 read path for
`PAPER_BINANCE_USDM`, `SANDBOX_BINANCE_USDM`, and `LIVE_BINANCE_USDM`.
Each deployed Edge/Source Proxy profile stays exact and environment-bound;
there is no caller-selected profile, direct Trading DB/SQL path, browser route,
cache/projection, Event/replay or command activation.  Canary remains a Live
governance stage, not a fake fourth database mode.  The Paper runtime stays
compatible and active.  Detailed scope, invariants, qualification and rollback
are in [EX-BE-02B — Manager-v2 Multi-profile Read Readiness](./backend/EX_BE_02B_MANAGER_V2_MULTI_PROFILE_READ.md).

Implementation now binds the exact profile in all three places that matter:
the owner facade predicate/JWT/envelope/cursor, the Portal Edge deployment and
assertion verifier, and the Source Proxy's dedicated loopback issuer/facade
pair. `manager-profile-read` permits only a verified port substitution of the
frozen five-GET route template; it cannot widen routes, admit V1/API-key
fallback, expose direct Trading DB/SQL, or activate command/broker/Redis/event
traffic. Sandbox and Live private launch inputs use isolated projects and
ports (`8123/8124`, `8223/8224`) while historical Paper stays on `8023/8024`.
The full source-to-Edge path has local/read-only evidence; Live currently has
no observed canonical rows, so a Live read returns a truthful empty bounded
result until that state exists. No production profile was auto-deployed or
restarted by this implementation.

**Final owner-policy coordination (2026-08-28):** the Trading System now also
rejects a malformed private profile identifier before issuance, verification or
source binding, using the same uppercase ASCII grammar as Edge and Control API.
The focused owner Manager suite reran at 44/44 with scoped Ruff clean; this
does not change Portal runtime configuration, routes or deployment state.

### EX-BE-02C — Maximum Data Discovery, Publication & Return (2026-09-04)

**Status:** **EX_DP_01_COMPLETE / EX_DP_02_IN_PROGRESS / OWNER_APPROVED_READ_ONLY_ALL_APPLICATION_TABLES / EXACT_READ_SCOPE_GRANT_APPLIED / NO_SERVICE_RUNTIME_MUTATION**.

**Governing request:** [Portal Execution Edge — Maximum Data Discovery,
Publication & Return Request v1](../PORTAL_EXECUTION_EDGE_MAXIMUM_DATA_DISCOVERY_PUBLICATION_AND_RETURN_REQUEST_v1.md).
This is the execution journal for that request. The request has eight named
stages (E0 through E7); the owner asked for seven approvals. E0 is the
deployed-truth prerequisite of E1, not an independent capability, so
EX-DP-01 = E0 + E1 and EX-DP-02…07 = E2…E7. No required request stage is
omitted.

#### EX-BE-02C pre-phase alignment and implementation location

The approved implementation branch is the remote-derived Portal worktree
/home/bobby/.worktrees/portal-execution-data-activation on
**feat/execution-data-activation**, initially pinned at
dcf580c826250537001f15ccba6d04e42bdef98f. It already contains the
Portal-side data-activation work; it is not a blank Manager-v2 branch.
This journal, the return pack, Portal adapters and Portal tests belong here.
Any Trading System source inspection or source-owned adapter belongs in a
separate Trading System feature worktree at the time its phase is approved;
its exact commit, read identity and evidence reference must be recorded in the
corresponding return artifact. Neither worktree identifies a deployed runtime;
E0 records the release/image/config tuple independently.

The initial plan from the older Manager worktree was corrected before any
EX-DP implementation:

1. [Source publication request 2026-09-03](./backend/EXECUTION_SOURCE_PUBLICATION_REQUEST_2026-09-03.md),
   [data-activation status](./backend/DATA_ACTIVATION_STATUS_2026-09-03.md),
   and [Execution Loop §16](./EXECUTION_LOOP_BACKEND_UNIFIED_PLAN_AND_GUIDE.md)
   are present on this branch and are evidence inputs, not missing documents.
2. The N18 96-relation census, N19–N29 contracts, N24 bounded current-state
   projection, N25 analytics, N26 realtime and deployed Portal data-activation
   work are reusable baselines. EX-DP does a runtime-verified **delta census**
   over every useful authoritative surface; it does not recreate them or
   pretend that the existing census proves unexamined Trading System sources.
3. No arbitrary version-4 route is pre-authorized. EX-DP-04 freezes a
   versioned return-pack/capability contract and reuses Manager-v2/current
   Portal contracts where semantically sufficient. A new named source route is
   considered only in EX-DP-05 after its source, profile, identity, pagination
   and semantics are proven.
4. The currently accepted transport limits remain per request/frame, not a
   hidden total-history limit: current source terms are at most 5,000 rows,
   8 MiB and two concurrent requests per identity. Opaque continuation must
   traverse the complete retained population when the source actually retains
   it. Existing tighter Portal fan-out limits remain in force unless a later
   measured change is separately approved.

This alignment is documentation only: no source query, runtime config, image,
identity, database/schema, route, cache, command, deployment, process or data
was changed.

#### EX-BE-02C global scope, invariants, and closure rules

**Outcome:** one digest-bound, sanitized
portal-execution-edge-maximum-data-return-v1 pack. It enables the Portal team
to build a storage/read-model/BFF/consumer work order without guessing a
source, join, formula, retention, empty-state or authority. It is not a
generic SQL/table browser, raw-data export, credential delivery mechanism or
implicit activation of a screen, profile or command.

- Trading System and approved producer services retain source authority.
  Portal receives only typed, allowlisted HTTPS capabilities through its
  existing server-side trust boundary; no browser-direct database/Redis/broker,
  raw SQL, DSN, issuer key, CLI credential or arbitrary source selection.
- “Maximum” means exhaustive useful-source classification, including
  relations/views, journals/outboxes/audits/ledgers, producer read models,
  source APIs, retained history, artifacts and market sources where they are
  authoritative. It never means unbounded response payloads or a promise that
  every source is currently publishable.
- Profile, mode, venue, account, deployment, portfolio, workspace and
  permission lineage are explicit. Financial numbers remain exact decimal
  strings; time uses named UtcEpochMs or an explicitly named source clock;
  mutable snapshots are never relabelled as append-only Event/replay history.
- Existing Manager-v2, N18 catalogue, N24 projection, N25/N26 read paths and
  current product APIs remain backward-compatible. Reuse a current semantic
  source before proposing a new adapter; never widen V1/D4, direct DB
  transport, raw relation browsing, browser-to-AWS-HK traffic or duplicate
  Data Layer market authority.
- A genuine absent producer, insufficient retention, inaccessible source or
  unresolved source authority becomes one typed SOURCE_OWNER_GAP with
  evidence, owner and requested decision. It is never fabricated as zero,
  empty, complete history or deterministic replay. Such an external fact is
  not technical debt; an unclassified accessible source keeps its phase open.
- Each approved phase uses bounded read-only/isolated fixtures and records
  only aliases, aggregate counts, schemas and digests in Git. It cleans only
  its exact temporary namespace. At phase closure inventory images and
  BuildKit cache, retain the active image set and explicitly named rollback
  image only, and record disk evidence; no broad prune, volume/network/source
  removal or runtime restart is implied.

| Plan phase | Request stage(s) | Result it may claim |
| --- | --- | --- |
| EX-DP-01 | E0 + E1 | DISCOVERY_COMPLETE for the observed runtime tuple and source delta census |
| EX-DP-02 | E2 | SOURCE_SEMANTICS_CONFIRMED by domain |
| EX-DP-03 | E3 | SCREEN_COVERAGE_COMPLETE |
| EX-DP-04 | E4 | CONTRACT_PUBLISHED for frozen capability/return-pack semantics, not runtime |
| EX-DP-05 | E5 | EDGE_IMPLEMENTED only for verified existing-data adapters |
| EX-DP-06 | E6 | EDGE_SHADOW_VERIFIED per accepted domain |
| EX-DP-07 | E7 | RETURN_PACK_ACCEPTED, or an explicitly lower truthful state |

#### EX-DP pre-phase alignment journal (2026-09-04)

Completed before EX-DP-01 approval:

- fetched the exact remote branch and created the dedicated data-activation
  worktree at dcf580c826250537001f15ccba6d04e42bdef98f;
- reviewed the N18 census, N19–N29/N24–N26 implementation, source-publication
  request, data-activation status, current Portal contracts and release
  manifests; the plan was changed to a delta program accordingly;
- tracked the governing request byte-for-byte from the prior approved source:
  SHA-256 is
  2f66002be69ee90a507029acf37d744cbb134fdd53840a53d087b67e28604310;
- validation passed: git diff --check; seven of seven EX-DP headings each
  contain Goal, Work, Tests/evidence, Exit gate and Rollback/debt; all
  referenced local evidence paths exist; 98 Markdown fences are balanced.

No code, image, container, database, identity, runtime or source operation was
run in this documentation-only alignment. No disposable build artifact exists,
so Docker/BuildKit cleanup is not applicable and no cleanup was performed.

#### EX-DP-01 — E0/E1 deployed truth and maximum source delta census

**Status:** **COMPLETE / DISCOVERY_COMPLETE_FOR_OBSERVED_RUNTIME_TUPLE / OWNER_APPROVED_READ_ONLY_ALL_APPLICATION_TABLES / EXACT_READ_SCOPE_GRANT_APPLIED / NO_SERVICE_RUNTIME_MUTATION**.

**Approval, implementation geography and decision boundary (2026-09-04):**
Bobby approved E0/E1, including read-only inspection of every Trading System
application table and view. Portal implementation/evidence work remains on
this branch. Trading System source work is isolated at
/home/bobby/.worktrees/trading-system-portal-execution-data-discovery on
feat/portal-execution-data-discovery, forked from the clean local dev revision
ed32039b3ec4d9eb9605a09e1d24279aa26760ed. The detached canonical Trading
System checkout and the existing Manager-facade campaign worktree are not
modified.

The new collector is a Trading-System-owned Rust adapter/one-shot CLI, not a
Portal Edge database client and not a new listener. It takes a private
read-only DSN through a secret file reference (the process environment carries
only the file path, never the credential value), opens one REPEATABLE
READ READ ONLY transaction with explicit statement/lock/idle bounds, executes
only compiled pg_catalog/information_schema/statistics queries, and writes
sanitized metadata/count/estimate/digest artifacts. It has no generic SQL
argument, no row export, no credential logging, no DDL/DML, no broker/Redis
payload access and no network listener. The pure trading-core crate remains
database-free; the adapter lives beside it in the Rust workspace and may reuse
canonical digest primitives only.

E0 captures actual release/image/config evidence separately from source
checkout state. E1 may use the dedicated read-only role to cover all current
application schemas, tables, views and materialized views, but expensive
full-table scans, raw rows and data-quality aggregation are deferred to their
named E2 semantic/quality probes. Relation size and cardinality use catalog
statistics/estimates first, so the census remains bounded and does not compete
with the trading workload. Future Portal calls remain a typed, source-owned
capability decision in EX-DP-04/05; this phase creates no Portal route.

**Test gates:** unit/golden tests for deterministic classification, redaction,
query allowlist and manifest digest; a negative no-DSN/no-unsafe-argument
matrix; live read-only role/transaction/privilege proof; actual catalog
reconciliation against the checked-in ownership baseline; artifact schema,
secret-shape and no-raw-row scans; measured bounded catalog-transaction
latency (not a business-row query plan); and source/Portal release-manifest
capture. Any failed read-only, redaction, classification or reconciliation
test blocks E1 closure.

**Rollback:** remove only the new unpublished Rust collector, isolated test
output and exact secure evidence directory. There is no migration, runtime
route, image, source-data mutation or container restart to roll back. The only
authorization mutation is the exact current-schema read extension recorded in
the Trading-System evidence; it rolls back with `REVOKE SELECT` on its two
relations followed by `REVOKE USAGE` on `portal_command`. A truly inaccessible
source is a typed owner/identity item; an accessible but unclassified source
keeps E1 open.

**Goal:** bind later conclusions to the actually deployed release tuple, then
perform a read-only maximum-source census that starts from — but is not limited
to — the N18 census and current data-activation inventory.

**Work:**

1. Capture a sanitized DEPLOYED_RUNTIME_MANIFEST.json: Edge/Source
   Proxy/Control API/worker image digests and release revisions, source
   catalogue and serving-policy digests, active profile bindings, enabled
   read/history/event/SSE/command flags, DB migration revisions, evidence
   capture time and any authority-published high-watermark/retention facts.
   Release evidence, not a checkout branch, is the runtime authority.
2. Seed SOURCE_SYSTEM_INVENTORY.json from N18, the 13 N24 feeds, N25/N26
   consumers, SGP history mirror, known source-publication request and the
   current 96-relation catalogue. Mark every inherited item VERIFIED_CURRENT,
   NEEDS_RUNTIME_RECHECK, OUTSIDE_SOURCE_SCOPE or NOT_YET_CENSUSED; do not
   silently downgrade existing working data.
3. Under a separately recorded, read-only Trading System/source identity,
   census all useful source surfaces: application schemas, tables, views and
   materialized views; history/audit/journal/outbox/ledger candidates; producer
   APIs/read models; artifact metadata; source-service/market-service
   capabilities; and only documented Redis/queue facts that carry authority.
   Record source owner/kind, stable keys/order, clocks/units, profile and
   lineage columns, sensitivity, population/retention, correction semantics,
   keyset/index viability, existing publication and candidate consumers.
4. Emit sanitized relation/column/lineage/profile artifacts and reconcile
   their counts/digests with N18 and the 2026-09-03 evidence. The Portal
   branch stores metadata and digests only; raw rows and private references
   remain with the owner evidence store.

**Tests/evidence:** deterministic manifest/digest validation; schema validation
of every generated artifact; read-only transaction/identity proof; metadata
reconciliation and duplicate/unknown relation checks; timestamp/unit/keyset
classification checks; redaction/secret-shape scan; and a negative test that
an unlisted source cannot be queried or exposed.

**Exit gate:** the deployed tuple is exact rather than inferred; every
discovered relevant source/relation/operation and time-bearing column has a
classification; all baseline discrepancies have evidence and an owner; every
inaccessible candidate has an explicit source/identity decision; and no raw
business row or secret enters Git.

**Rollback/debt:** remove only exact EX-DP-01 temporary scan artifacts on a
failed validation. The only authorization mutation is the recorded,
current-schema two-relation read extension; its exact rollback is two
`REVOKE SELECT` statements followed by `REVOKE USAGE` on `portal_command`.
There is no internal debt on closure; an external producer/permission absence
is one typed source-owner gap, while an accessible unclassified source blocks
closure.

**Incremental E0/E1 evidence (2026-09-04, metadata-only):** the configured
Manager facade login/group was proved inside `REPEATABLE READ READ ONLY` with
97 selectable `public` relations, but has neither `USAGE` nor `SELECT`
coverage for the discovered `portal_command` application schema. This is a
typed `SOURCE_IDENTITY_SCOPE_MISMATCH`, not a claim that the schema is empty
or out of scope. No business row, DSN, secret or runtime mutation was involved.
EX-DP-01 continues with the source-owned Rust collector, but cannot close
until an all-application-schema read-only identity is supplied or a separately
recorded reversible extension of the read group has been performed. It will
not substitute a command-capable or superuser identity.

**Closure record (2026-09-04):** EX-DP-01 is **DISCOVERY_COMPLETE for the
observed runtime tuple**. E0 is captured in the private Trading-System
`DEPLOYED_RUNTIME_MANIFEST.json` (SHA-256
`49f8a7121cb4a3e8da5b644769e8c31497b56b31c460f694d3df8ac320471dc9`): the
actual Trading System executor/database, Manager-v2 Paper/Sandbox/Live
facades, Portal Edge, Source Proxy and projection-store image/config tuple is
recorded separately from either checkout. The manifest deliberately labels
event/high-watermark/retention, canonical migration ledger and Control API
facts it did not observe as unasserted rather than guessing them.

E1 used the isolated Trading-System Rust `portal-source-census` owner CLI on
`feat/portal-execution-data-discovery`, never a Portal DB client or network
listener. It performs only fixed PostgreSQL catalog/statistics reads in one
bounded `REPEATABLE READ READ ONLY` transaction. The canonical private
evidence package is `all-schema-census-002`: collector manifest SHA-256
`1a13355a28e8ec40c83b74cb53e54b1916b755b67fdc45696b7304473d3a10cf`, overall
evidence manifest SHA-256
`0b198ad475fdbd3b1cdea275f1f36016971be1e267792ce1b0151e5e6e3c06e1`.
The source implementation is pinned at Trading-System commit
`c44e7adb57d09cfce4ac0973101545643bfd5b0a` on that branch.
It contains only metadata/digests and proves 99 current application relations,
1,387 columns and 255 source-operation references. Reconciliation is 96
source-baseline objects plus three hash-bound deployed runtime overlays; there
are zero baseline-missing, unowned or kind-mismatch relations. Every E1
classification gate is zero, including inaccessible relation and identity
scope gap.

The all-current-relation read proof uses the existing facade login with its
intended local read group. The only authorization change was the exact,
reversible current-schema extension for the two `portal_command` relations;
it has zero INSERT/UPDATE/DELETE/TRUNCATE privilege, no default privilege, no
role membership, DDL/DML, runtime restart or route activation. Its rollback is
the recorded two-table `REVOKE SELECT` followed by `REVOKE USAGE` on
`portal_command`.

Verification passed: Rust 1.83 focused tests **7/7**, strict Clippy, format
check, ownership generator byte-for-byte regeneration at 96 objects, isolated Timescale
integration, artifact JSON/permission/redaction scans and live full-scope
catalog capture. The live bounded transaction completed in **265 ms** with
99/99 readable; a no-local-role negative completed in 322 ms and failed closed
with exit 3 / 99 inaccessible. Its temporary output, isolated DB container,
two Rust test images and exact temporary directories were removed. Docker
inventory moved from 29 images / 18.33 GB / 58 containers to 27 images /
16.10 GB / 57 containers; shared unscoped BuildKit cache was intentionally not
broad-pruned. The subsequent full-workspace fixture check corrected an earlier
mount mistake: both `contracts/golden/phase5` inputs already existed, and the
correct repository-root Rust 1.83 invocation passed **18/18**. No fixture was
created or changed.

No Portal route, cache/projection, UI/BFF data call, source facade deployment,
command, Event/SSE, Redis/broker or business data changed. There is no internal
E0/E1 technical debt.

#### EX-DP-02 — E2 domain semantics and authority audit

**Status:** **COMPLETE / SEMANTICS_DISCOVERY_COMPLETE_FOR_OBSERVED_RUNTIME_TUPLE / BOBBY_APPROVED / READ_ONLY_ALL_CURRENT_APPLICATION_RELATIONS / NO_SERVICE_RUNTIME_MUTATION / NO_PORTAL_ACTIVATION**.

**Approval, implementation and decision boundary (2026-09-04):** Bobby
approved the semantic/authority/retention/correction/query-plan work named in
this stage. It is not a prerequisite outside E2; it is E2 itself. Source work
continues in the isolated Trading-System
`feat/portal-execution-data-discovery` worktree. It adds a separate
owner-only Rust `portal-source-semantics` CLI beside the completed E1 census,
not a Portal database client, public route or source listener.

The CLI accepts only a private read-only DSN file reference and existing local
read group. It runs a compiled domain/relation/query registry inside one
bounded `REPEATABLE READ READ ONLY` transaction. Allowed reads are fixed
catalog metadata, fixed aggregate-only semantic probes and fixed
`EXPLAIN (FORMAT JSON)` planner probes for named keyset shapes. It does not
accept caller SQL/relation/filter/profile input, return a business row, run
`EXPLAIN ANALYZE`, write data, alter a grant, query broker/Redis payloads or
start a listener. All result artifacts stay in the private owner store:
`DOMAIN_SEMANTICS_MATRIX.json`, `RELATION_SEMANTICS_CATALOG.csv`,
`QUERY_PLAN_EVIDENCE.json`, `SOURCE_OWNER_GAPS.json` and a digest manifest.

**E2 invariants and evidence plan:** every request-minimum domain must receive
an explicit `DIRECT`, `EDGE_DERIVED`, `PORTAL_DERIVED`, `CURRENT_STATE_ONLY`,
`UNSAFE` or `SOURCE_OWNER_GAP` disposition with authority, identity/tie-break,
source/effective clock, decimal/currency policy, profile/lineage, retention,
empty, mutation and correction semantics. The Rust registry/fixed-query/
redaction/time-decimal tests, isolated populated/empty/corrected/gap fixture,
live transaction/identity proof, aggregate-only scan and each named planner
probe must pass. A semantic gap blocks E2; a proven absent source is one
typed owner action. No event/replay contract, route, deployment or Portal
consumer can be activated here.

**Goal:** prove which censused facts can truthfully power each execution
domain, including current/history/event distinctions, lineage, retention,
corrections, quality and authoritative derivation.

**Work:** audit strategy/deployment/artifact; portfolio/allocation/capital;
account/binding/balance/margin/sync; positions/exposure; order/fill/conditional
lifecycle; session/cycle; signal/sizing/risk; accounting/equity/performance;
reconciliation/operations; command terminal evidence; and market context.
For each fact freeze authority, identity/tie-break, source/effective clock,
scope/join cardinality, decimal/currency units, retention, mutation/tombstone
semantics, empty meaning and disposition: DIRECT, EDGE_DERIVED,
PORTAL_DERIVED, UNSAFE or SOURCE_OWNER_GAP. Reconcile the already measured
balance lineage, portfolio-equity derivation, cursor lifecycle, marking
oscillation, empty tables, halted activity and N28 alternatives as evidence —
not as assumptions.

**Tests/evidence:** complete domain matrix; deterministic lineage and
join-cardinality checks; fixtures for current/mutable, immutable/corrected,
empty, inactive, partial and unavailable states; decimal/clock policy tests;
exact derivation oracles; and sanitized source probes that distinguish
source-empty from source-unavailable.

**Exit gate:** every required domain has an evidenced disposition; no current
row is claimed as history; every derivation lists authoritative inputs and
provenance; no domain is omitted merely because it is outside the existing
Manager catalogue; and every unresolved item has a typed status/reason/owner.

**Rollback/debt:** additive semantic evidence only. A failed or incomplete
semantic proof blocks the phase; a proven absent producer becomes one typed
external owner action rather than Portal/Edge technical debt.

**Completion record (2026-09-04).** Trading System implemented the owner-only
`portal-source-semantics` Rust CLI and compile-time E2 registry: **11**
request-minimum domains, **48** named semantic relations and **18** typed
source-owner-gap triggers. In one bounded `REPEATABLE READ READ ONLY`
transaction, the final private positive package
`/home/bobby/secure/portal-execution-data-discovery/ex-dp-02/live-semantic-audit-003`
returned `SEMANTICS_AUDIT_COMPLETE_CANDIDATE`: **99/99** current application
relations readable, **11/11** domains classified, **99** semantic relation
records and **48/48** fixed query-plan captures, with zero identity,
ownership, required-field, time/decimal or planner-capture failure. Its
manifest SHA-256 is
`b2fd7f9e60d28d01279f2283c62028beaeb166a1eb95291388059a80cb46d94b`;
registry SHA-256 is
`c1886540c91e8e96219a12684e0b42651a061236128ab92f51442d0f56493477` and
the frozen semantic contract digest is
`fa93683ed7c7cf1298b6e6943e93383a707f3beefe377df745fd909884f6dcac`.

The companion no-local-read-role package
`identity-negative-002` correctly returned `INCOMPLETE_SOURCE_IDENTITY_SCOPE`
(99 inaccessible relations and 48 scope-skipped plans), manifest SHA-256
`9ad73e8ba092eaa23a2830e99471d2e58f33a7335f82565341101b48f6125c59`.
Neither package retains DSNs, business rows or payloads. E2 establishes
authority, identity/tie-break, source clock, decimal/currency, empty,
retention and correction semantics without converting a current table into
history or an absent policy into an infinite-retention claim. Its actual
planner evidence is **5** index-backed and **43** sequential-on-observed-stats
fixed shapes. That blocks a generic/unscoped read shape; EX-DP-03 must choose
the exact screen/resource/cursor shape, and any selected sequential shape is
`UNSAFE` until separately resolved by a source-owner query/index/view/key
decision. The 18 typed gaps are visible external source-owner actions, not
hidden Portal technical debt.

Focused Rust tests passed **10/10**, strict format/Clippy passed and the full
locked Rust workspace passed **28/28**. The isolated fixture covered
populated/empty/corrected/gap/index-plan conditions but was deliberately
incomplete and never treated as live evidence. Phase cleanup removed only its
fixture container/network/automatic test volume, test image, exact temporary
paths and superseded diagnostic packages; no source/Portal service, data,
grant, route, cache/projection, Event/SSE, command or deployment changed.
E2 is therefore complete for the observed runtime tuple, but does not activate
a Portal consumer or freeze the typed return contract; that remains EX-DP-03.

#### EX-DP-03 — E3 frozen screen, field and action coverage

**Status:** **COMPLETE (2026-09-04)**.

**Execution preflight (2026-09-04).** Owner approved E3 followed by E4 in
one additive contract transaction, with E4 prohibited from starting until E3
has passed its unmapped-field/action gate. The implementation boundary is the
existing `services/portal-execution-edge-rs` Rust workspace and the checked-in
Portal screen-BFF catalogue; it adds no database client, source credential,
runtime route, listener, projection/cache, command execution, or deployment.
The E2 source-owner evidence pinned for this work is the positive semantic
audit manifest
`sha256:b2fd7f9e60d28d01279f2283c62028beaeb166a1eb95291388059a80cb46d94b`,
semantic registry
`sha256:c1886540c91e8e96219a12684e0b42651a061236128ab92f51442d0f56493477`,
and semantic contract digest
`sha256:fa93683ed7c7cf1298b6e6943e93383a707f3beefe377df745fd909884f6dcac`.
The E3 registry must bind only named screen/capability/source operations,
carry the fixed 200-row/1-MiB upstream Manager-v2 bound where applicable,
and fail closed for blank/TBD fields, unknown screen/catalogue drift,
unqualified relation shapes, a missing owner on an absence, or a read mapping
that drives an action. The acceptance suite will validate all frozen
screen/action inventory, every required field/action disposition, mapping
integrity, status semantics, and the eight required state fixtures. Rollback
is deletion of this additive, manifest-bound pack only; no active read plane
changes during this phase.

**Goal:** make every frozen Portal Execution screen/panel/field/action
traceable to a direct source, an authoritative derivation or truthful typed
absence, without forcing the browser or Portal team to infer joins/formulas.

**Work:** freeze the exact screen/action registry digest, including
Paper/Sandbox/Canary/Live, fleet/360, blotter, workbench/Trade Replay,
operations/incidents, command and VNM lanes. Produce
SCREEN_FIELD_SOURCE_COVERAGE, ACTION_CAPABILITY_COVERAGE,
DERIVED_METRIC_FEASIBILITY and PORTAL_DOWNSTREAM_WORK_ORDERS. Each mapping
declares semantic field, source/capability, profile/lineage, response shape,
pagination/stream, cursor/sequence/correction/retention behavior, recommended
SGP storage/reducer, empty/stale/gap semantics and delivery class. Existing
N20 screen contracts are input, not a ceiling.

**Tests/evidence:** referential-integrity tests against frozen screen/action
registries; delivery-class enum validation; schema checks; negative tests for
blank/TBD/missing owner and read identity driving an action; and populated,
empty, partial, stale, gap, duplicate, correction and next-page fixtures.

**Exit gate:** all required fields and actions are mapped or explicitly have a
typed absence; optional fields are deliberately classified; every absence has
consumer semantics; and each downstream work order is buildable without a
Portal-side source/formula guess.

**Rollback/debt:** remove only the exact generated mapping pack on failure.
Mapping gaps keep the phase open; proven source absence is carried as an
external owner action, not hidden technical debt.

**Completion record (2026-09-04).** E3 is closed as a contract-only additive
pack at
`services/portal-execution-edge-rs/contracts/maximum-data-return-v1/`.
`e3-coverage.manifest.json` SHA-256 is
`4df8a5438efc2878b95847dd0212ab619b888da37cbd69df459be982f9e864e6`.
It locks the E2 positive audit, semantic registry and semantic contract pins;
the exact existing 23 Screen-BFF entries; all 22 request demand surfaces; 34
field definitions expanded into **126** screen/field rows; **12** action
records; **10** metric feasibility rulings; **14** downstream work orders;
and **8** no-business-row state fixtures (populated, empty, partial, stale,
gap, duplicate, correction and next-page). The generated CSV line counts are
127, 13, 11 and 15 respectively including headers. The exit counts are
`unmapped_required_frontend_fields = 0` and
`unmapped_execution_actions = 0`.

The new Rust `maximum-data-contract` crate validates the complete registry,
manifest digests, no-placeholder/no-generic-read boundary, N20 catalogue
drift, source/delivery truthfulness, command separation, all eight state
fixtures and downstream-work-order coverage. `cargo fmt --check`, strict
`cargo clippy --locked -p maximum-data-contract --all-targets -- -D warnings`,
and `cargo test --locked -p maximum-data-contract` passed (5/5 unit tests,
binary and doctests). The isolated TypeScript check
`npx vitest run test/maximum-data-e3-contract.spec.ts --maxWorkers=1
--no-file-parallelism` passed 2/2; it compares every frozen screen operation,
response contract and read-capability list to the actual Control API
catalogue. JSON parsing and `git diff --check` also passed.

No route, listener, database client, source credential, source identity,
projection/cache, command port, runtime config, deployment, service restart
or data mutation occurred. The 43 sequential observed E2 shapes remain
truthfully `EXISTS_BUT_NOT_SAFE_TO_EXPOSE`; Market, artifact and authoritative
event-journal absence remain named external owner actions in the CSV/work-order
pack, not E3 technical debt. The purpose-built test cache directories
(`429 MiB` Cargo and `148 MiB` Node) and the two unreferenced test images
(`rust:1.85.1-slim`, `node:22.14.0-bookworm-slim`) were removed after verifying
no container referenced them. Docker post-cleanup inventory was 19 images / 57
containers / 47 volumes; no broad BuildKit prune was run (14.38 GiB cache is
outside this phase's exact cleanup scope).

#### EX-DP-04 — E4 versioned capability and return-pack contract freeze

**Status:** **COMPLETE (2026-09-04)**.

**Execution boundary precommitted (2026-09-04).** E4 starts only after the
E3 validation record proves `unmapped_required_frontend_fields = 0` and
`unmapped_execution_actions = 0`. It will publish an additive, versioned
cross-language contract/fixture/manifest pack in the same Rust Edge workspace,
reusing Manager-v2 and bounded-query conventions where semantically valid. It
must use `UtcEpochMs` newtypes and exact `{value,currency,scale}` decimals;
must bind lineage/cursor/status to named operations; and must classify missing
authoritative event history honestly rather than introduce a generic V4
endpoint, direct database access, synthetic replay, a new cache, or runtime
activation. E4 acceptance includes Rust/TypeScript/Python fixture decoding,
schema/inventory/manifest validation, negative decimal/epoch/cursor/lineage/
status cases, compatibility checks against the frozen Manager-v2 surface and
redaction scans. Its rollback remains removal of the additive contract pack
only; no runtime configuration or source authority changes are authorized.

**E4 execution preflight (2026-09-04).** E3 now records zero unmapped
required fields/actions, so E4 may begin in the same additive pack. The
implementation will extend `maximum-data-contract` with validated Rust
newtypes for `UtcEpochMs`, exact `{value,currency,scale}` decimal values,
lineage, source health, bounded continuation and typed source status. It will
add JSON Schema documents for source catalogue, domain capability, history
continuation, source health, coverage and read envelope; an operation/field
binding registry that covers all E3 fields; the mandatory event-kind coverage
matrix; and synthetic/no-business-row golden fixtures for populated, empty,
partial, stale, gap, duplicate, correction and continuation. A TypeScript
test and Python standard-library verifier will independently decode the same
fixtures and reject float timestamps/decimals, raw/ambiguous cursors, missing
profile lineage and invented event sequence. E4 will prove that it neither
changes any existing Manager-v2 file nor declares a V4 route; it only names
logical bounded operations for E5. A current source without a global ordered
journal must remain `CURRENT_STATE_ONLY`, `NOT_RETAINED` or
`SOURCE_OWNER_GAP` as appropriate. Tests must pass schema-meta validation,
Rust/TypeScript/Python golden decode, negative boundary cases, manifest
digest/redaction scans and an explicit Manager-v2 compatibility guard before
the phase can close.

**E4 implementation and cross-language validation slice (2026-09-04).** The
additive `maximum-data-contract` crate now owns the E4 contract-only DTOs:
`UtcEpochMs` serializes/deserializes only JSON integers; `ExactDecimal`
requires an exact decimal string plus uppercase currency and declared source
scale; profile/mode lineage is mandatory; and an opaque continuation is bounded
to 4,096 bytes and carried with its source/operation/profile binding. The
static pack contains seven Draft 2020-12 schemas, six source rulings, all 11 E2
domains, exactly 34 E3 field bindings, all **36** requested event kinds (the
governing request lists 36, not 34) and eight explicitly synthetic/no-business
row fixtures. No event is marked `AVAILABLE` or replay-eligible because E2 did
not prove a global ordered journal, retention floor and correction semantics.
The existing Manager-v2 entry is explicitly `PAPER_BINANCE_USDM` / `PAPER`;
this contract did not widen it to Sandbox/Canary/Live.

The E4 binding registry references either the read-envelope schema plus its
exact E3 logical operation, or the domain-capability schema plus a typed owner
absence. It never names a route, raw relation, SQL selector or credential.
Its schema manifest pins every E4 asset and the E2/E3/Manager-v2 identities;
all runtime mutation fields are `NOT_APPLIED`. The dependency-free
`tools/validate_maximum_data_e4.py`, Rust negative tests, and a new Control API
TypeScript decoder independently reject float/string timestamps, float
decimals, missing profile lineage, unbound cursor and invented replay.

Commands run for this slice and their results:

- `python3 services/portal-execution-edge-rs/tools/validate_maximum_data_e4.py`
  — PASS: 7 schemas / 34 field bindings / 36 event rulings / 8 fixtures.
- Draft 2020-12 validator over all seven schemas and 28 pack/fixture instances
  — PASS.
- `cargo fmt --check && cargo test --locked -p maximum-data-contract && cargo
  clippy --locked -p maximum-data-contract --all-targets -- -D warnings` in a
  temporary Rust 1.85.1 container — PASS: 9 Rust tests, 0 failures, Clippy
  clean.
- `npx vitest run test/maximum-data-e4-contract.spec.ts --maxWorkers=1
  --no-file-parallelism` in a temporary Node 22.14 container copy — PASS: 2/2.
  Targeted strict `tsc --noEmit` for that E4 test — PASS.
- The full existing Control API `npm run typecheck` remains red before E4 due to
  unrelated old failures in `command-center.spec.ts`, `execution-realtime.spec.ts`,
  `harness.ts` and `profile-projection.spec.ts`; the E4 test is absent from that
  error set. This is recorded baseline outside the approved E4 contract scope,
  not an E4 defect and was not changed.

**Goal:** publish the cross-language contract pack for all confirmed facts,
history/snapshot/event semantics, source health and downstream work orders
before any new route claims those semantics.

**Work:** define versioned schemas for source catalogue, domain capability,
history/continuation, source-health and coverage artifacts; enforce exact
decimal strings, named clocks, profile/lineage, empty/status and cursor
semantics; provide fixtures for populated, empty, partial, stale, gap,
duplicate, correction and continuation. Reuse stable Manager-v2/current
schemas where they already match the fact. Do not silently mutate V1/V2 or
predeclare a generic version-4 route. For Event/Trade Replay, publish an
explicit coverage matrix; if an authoritative journal lacks
sequence/retention/corrective events, state CURRENT_STATE_ONLY,
HISTORY_NOT_RETAINED or SOURCE_OWNER_GAP rather than simulate replay.

**Tests/evidence:** JSON-schema/meta-schema validation; Rust/TypeScript/Python
golden decoding; decimal/epoch/cursor/lineage/status rejection cases;
backward-compatibility diff against existing Manager-v2 contracts; fixture
coverage, manifest digest and redaction scans.

**Exit gate:** each EX-DP-03 row references a validated versioned schema and
typed operation or absence; all fixtures validate; event coverage is explicit
by entity/event kind; and no timestamp, float, identity or empty-state
ambiguity remains.

**Rollback/debt:** additive manifest-bound contracts only; no route, source,
identity, database or deployment change. A missing producer remains a
published owner action, never unfinished Edge code.

**E4 completion record (2026-09-04).** The checked-in return-pack boundary is
`services/portal-execution-edge-rs/contracts/maximum-data-return-v1/`; its
E4 manifest digest is
`sha256:87c3edf13b93d7393f66deaa7d043240e0768ce4fe495ff2318da4996cb46406`.
It has 7 Draft 2020-12 schemas, 6 source catalogue rulings, 11 domain rulings,
34/34 E3 field bindings, 36/36 request-listed event coverage rulings and eight
synthetic fixture states. The Rust contract has no database/HTTP/cache/listener
dependency; the only dependency delta is reuse of the existing workspace
`execution-contracts` exact decimal/identifier type. E4 has no active route or
runtime consumer, which is intentional: it is `CONTRACT_PUBLISHED`, not E5
adapter publication.

Final acceptance evidence: Rust 1.85.1 `cargo fmt --check`, `cargo test
--locked -p maximum-data-contract` (9 passed, 0 failed) and `cargo clippy
--locked -p maximum-data-contract --all-targets -- -D warnings` all passed;
the TypeScript E4 decoder passed 2/2 and its targeted strict `tsc --noEmit`
passed; the dependency-free Python verifier passed; and an independent Draft
2020-12 validation passed all 7 schemas against 28 pack/fixture instances.
`git diff --check` passed. E4 JSON redaction/transport scan found no secret,
DSN, SQL selector, Redis URL or V4 route string. The changed-file audit found
no Manager-v2 source or contract file changed.

Disposable test cleanup was completed before close: temporary Cargo/Node test
caches were exactly 4 KiB + 471 MiB + 191 MiB + 191 MiB + 191 MiB before
removal (about 1.02 GiB total); all five exact `/tmp/portal-e4-*` directories
were removed. No container referenced the temporary Rust/Node images, then
only `rust:1.85.1-slim` and `node:22.14.0-bookworm-slim` were removed. Docker
inventory changed from 22 images / 56 containers / 47 volumes / 15.04 GiB
Build Cache to 20 images / 56 containers / 47 volumes / 15.04 GiB Build Cache;
no broad cache prune, runtime restart, volume/network/data cleanup or deploy
occurred. The unrelated pre-existing full Control API typecheck failures named
in the implementation slice remain outside E4 and were untouched.

After final read-envelope schema hardening, the manifest was re-hashed to the
digest above and the focused Rust format/test gate was re-run successfully in
one fresh temporary 383 MiB Cargo cache. That exact cache and its only Rust
test image were removed again. Final Docker inventory was 20 images / 56
containers (52 active at the post-check) / 47 volumes / 15.04 GiB Build Cache;
no container referenced the test image and this phase neither restarted nor
changed any runtime container. No broad cache prune was authorized or run.

There is no E4 implementation debt. The classified source-owner gaps,
unqualified named query shapes and absence of a global journal are explicit
external/source facts already represented in the frozen contract; they become
input gates for E5/E6, not hidden work left in this phase.

#### EX-DP-05 — E5 existing-data adapter and publication delta

**Status:** **COMPLETE — edge implementation / source-dark (2026-09-04)**.

**E5 execution preflight (2026-09-04).** The approved implementation is an
additive Rust `maximum-data-adapter` boundary in
`services/portal-execution-edge-rs`, plus a digest-bound E5 publication
registry and synthetic source-to-contract fixtures in the existing
`maximum-data-return-v1` pack.  It will consume only the already-established
server-side boundaries: E3/E4, the authenticated N19
`ManagerCompatibilityAuthority`, the N13B current-source profile map, and
named existing Portal-control/projection/analytics capabilities.  It will not
open a Trading-System database connection, add a generic relation/SQL route,
change an existing Manager-v2/current-source route, mint identity, deploy an
image, or enable any runtime traffic.

The registry will resolve every one of the 34 frozen E3 fields through one of
four explicit outcomes: (1) four pre-existing Portal/envelope contracts, (2)
named Manager-v2 relation-page adapters for the verified current/retained
relations, (3) named Portal-derived delegate descriptors with their exact
provenance boundary, or (4) the six already-frozen typed source-owner gaps.
The available current-source plane is profile-bound for Paper, Sandbox and
Live; Canary is deliberately composed from Live facts plus Portal governance,
never a fourth Manager profile.  A retained relation whose Manager envelope
does not prove a global event sequence, correction journal or retention floor
will publish only its proven page/current-or-retained-snapshot semantics.  It
will not be relabelled Event/replay.  `canary_drift` will retain an explicit
typed unavailable result until the existing twin-comparison inputs are
qualified, rather than fabricating drift from one profile.

The adapter will accept only a selected logical operation, a deployment-bound
authenticated Manager catalogue and an already-bound opaque cursor.  It will
construct the existing authority's relation request, filter records to the
E3 field allowlist, preserve source `has_more`/opaque continuation without a
total-history ceiling, require the named primary key fields, and expose no
Manager opaque record key, raw relation selector, credential, SQL or command
surface.  E5 tests will cover every registry binding; source-page field
redaction, identity/profile/cursor rejection and multi-frame continuation;
typed direct/delegate/unavailable outcomes; current-versus-replay truth; and
static absence of database/SQL/transport authority.  E6 remains the separate
runtime/domain-acceptance gate; it is not a deferred E5 implementation defect.

**Rollback and decision boundary:** removal is limited to the new E5 crate,
publication assets and exact disposable test resources. Existing Manager-v2,
current-source, projection, analytics, control-plane and running containers
remain untouched. Any source behaviour not evidenced by the passed synthetic
contract tests is represented as a typed status in the E5 registry, not as an
unstated fallback or technical debt.

**Goal:** implement only the missing, verified existing-data adapters selected
by the EX-DP-03 map, preserving the established Manager-v2/current-source,
projection, analytics and BFF boundaries.

**Work:** choose in this order: existing Manager publication; compatible
existing Portal projection/analytics/Data Layer capability; a typed extension
of an existing contract; one named allowlisted source adapter; exact
source-local derivation with provenance; then one source-owner request after
absence is proven. Register only named capability/resource/profile bindings,
never generic relation/SQL access. History must be page-bounded yet traversable
over all retained data with opaque keyset continuation, has_more, retention
floor and typed expiry/gap behavior. Commands, shell/CLI execution, Redis
inspection and source activation remain outside this read/data phase.

**Tests/evidence:** isolated source-to-contract integration fixtures; keyset
continuation beyond one frame; no-hidden-total-cap test; profile/delegated
identity denials; allowlist and field-redaction tests; current-versus-event
semantic tests; derivation oracles/provenance; unavailable/empty/partial/gap/
correction cases; and static proof that no DB credential or SQL reaches Portal.

**Exit gate:** every DIRECT or EDGE_DERIVED EX-DP-03 item is served by a typed,
bounded adapter or reclassified with evidence; every EXISTS_NOT_PUBLISHED item
is published or has an owner decision; and no route claims Event/replay
semantics without the EX-DP-04 contract.

**Rollback/debt:** disable only newly registered versioned adapters and exact
test resources. Existing active Manager-v2/current-source planes remain
unchanged. Missing existing-source implementation keeps this phase open;
genuine producer absence is a typed external gap, not phase debt.

**E5 implementation and acceptance (2026-09-04).** The additive Rust crate
`services/portal-execution-edge-rs/crates/maximum-data-adapter` now loads a
digest-pinned publication registry and has no HTTP server/client, database,
Redis, credential, cache, listener, command or deployment capability. It
binds a Manager page only through the existing authenticated N19
`BoundManagerAuthority`, an already-validated deployment catalogue, a fixed
E4 logical operation and a source-issued opaque cursor. It never accepts a
caller-chosen relation, field list, profile, URL, SQL fragment or source
record key. Before return it enforces the source profile/relation/page bound,
requires non-null non-duplicate E3 resource keys and strips every field not
on the frozen E3 allowlist. Continuation remains source-opaque and traversable
without a synthetic total-history cap; the output explicitly preserves that
the Manager envelope does not prove a global sequence, retention floor,
correction journal or replay eligibility.

`maximum-data-return-v1/e5-existing-data-publication.v1.json` closes all 34
frozen E3 fields with exact named outcomes: four existing Portal contracts,
19 fixed Manager relation-page adapters, four named Portal-derived delegates,
one Canary-only typed unavailability and six all-profile source-owner gaps.
Paper, Sandbox and Live are bound only to their existing qualified Manager
profiles. Canary never opens a Manager read directly: it remains a named
Portal composition boundary. The companion publication/page schemas, synthetic
no-business-row fixture pack and manifest are hash-pinned; the manifest
records every runtime mutation as `NOT_APPLIED`.

**Evidence actually run:** `python3
services/portal-execution-edge-rs/tools/validate_maximum_data_e5.py` passed
with `34 fields, 19 Manager adapters, 4 delegates, 6 source gaps`.
In a fresh isolated Rust container, `cargo fmt --check`, `cargo clippy
--locked -p maximum-data-adapter --all-targets -- -D warnings`, `cargo test
--locked -p maximum-data-adapter` (**6/6**) and `cargo test --locked -p
maximum-data-contract` (**9/9**) all passed. In a disposable Node copy,
`vitest run test/maximum-data-e5-publication.spec.ts --maxWorkers=1
--no-file-parallelism` (**2/2**) and the strict targeted `tsc --noEmit`
check passed. The registry validation rechecked all four asset hashes:
`608ae536…a585c`, `e127c346…b0d8`, `332a1e9a…6e69` and
`1464a189…1a90` respectively. No source/runtime request, direct database
read, identity change, route, listener, cache/projection, command port,
deployment or existing plane was changed.

**Exit and debt ruling:** E5 is complete as the requested existing-data
adapter/publication implementation. It has no internal implementation debt.
The six `SOURCE_OWNER_GAP` results, Canary twin-comparison absence and lack of
authoritative Event/replay metadata are explicit upstream facts carried in the
typed contract, not hidden E5 work. EX-DP-06 is the separate owner-approved
domain/runtime acceptance step; it may qualify a real source path only in its
own change window and cannot be implied by this source-dark closure.

**Rollback:** remove only this new crate and the versioned E5 registry,
schemas, fixtures, validator and contract test. Since no runtime registration
or source state changed, no service restart, data rollback or producer action
is required.

**Artifact cleanup (2026-09-04):** before cleanup, the exact disposable E5
Rust target cache was **550 MiB**, the disposable Node test copy was **151
MiB**, and Docker held two unreferenced test images (`rust:1.85.1-slim` and
`node:22.14.0-bookworm-slim`). Both exact `/tmp/portal-e5-*` directories and
both image digests were removed. The cache files were root-owned by the test
containers, so deletion was performed through the same isolated container
with only those two exact paths mounted; no broad host cleanup was used.
Docker moved from 25 images / 56 containers (52 active) / 47 volumes (13
active) / 12.95 GiB images / 15.71 GiB Build Cache to 23 images / the same 56
containers (52 active) / the same 47 volumes (13 active) / 11.50 GiB images /
the same 15.71 GiB Build Cache. E5 created no BuildKit cache; the retained
shared cache predated this slice and no broad prune was authorized. No running
container, volume, network, source identity or runtime configuration changed.

#### EX-DP-06 — E6 domain acceptance and source-health qualification

**Status:** **COMPLETE / EDGE_SHADOW_VERIFIED / SAME_HOST_READ_ONLY_QUALIFIED / NO_RUNTIME_MUTATION** (2026-09-04).

**Approval, preflight and decision boundary (2026-09-04):** Bobby approved the
complete E6 slice. This is a qualification of the already active,
profile-bound Manager read plane only: one bounded catalogue read and one
`limit=1` named relation read for each of the 19 E5 Manager operations in each
of Paper, Sandbox and Live. The probes run serially below the Source Proxy
limit through each existing Edge container's own UID, supplementary mTLS group
and read-only secret mount. They persist only HTTP/contract metadata, bounded
byte counts, booleans/counts and SHA-256 body digests; no row, cursor, trace
identifier, JWT, certificate or connection value is written to Git, evidence
or terminal output. The first Paper catalogue preflight returned `200`, 96
relations and 130,537 bytes under the 1 MiB contract bound.

The implementation is an additive, offline Rust domain-acceptance verifier
and digest-bound E6 registry/evidence pack. It cross-checks all eleven E4
business domains against the frozen E5 publication map, validates the
sanitized per-profile runtime observations, and forces every unsupported
history/replay/correction/market/artifact property to remain an explicit typed
source fact with exactly one source-owner action. It has no network client,
database, credential, listener, cache, projection, command or runtime
activation authority. E5 remains source-dark in this checkout: this phase
does **not** deploy it, register an Edge route, alter a profile, mint a new
identity, perform direct DB/Redis access, execute a command or mutate source
data.

**Declared gates:** (1) catalogue/profile/19-relation runtime observation for
each active profile, with bounded envelope, relation identity, field/key and
empty/partial/freshness checks; (2) mTLS-required and method-denial negative
checks at the existing Source Proxy boundary; (3) deterministic offline domain
acceptance, source-health and malformed-evidence negative fixtures; (4) E3/E4/
E5 compatibility plus JSON/schema/manifest/redaction checks; and (5) targeted
Rust and TypeScript contract tests. A full retained-range, event/replay,
correction or business-row assertion is accepted only where the existing
authoritative E2/E4 source fact proves it; a one-row source probe never
pretends to prove it. Same-host runtime evidence is labelled as such and is
not represented as independent production/HA evidence.

**Rollback and closure rule:** no independent runtime mutation exists to
rollback. If an active profile, envelope, named relation, key, profile
isolation, read/command boundary or evidence redaction check fails, E6 stays
open and the only cleanup is its exact disposable test artifact. Otherwise
every E6 request closes as accepted current/retained bounded data or as a
prescribed typed source-owner fact; there is no internal E6 technical debt.

**Goal:** show that the accepted capabilities are useful and truthful for their
actual business domains, not merely reachable.

**Work:** run the request acceptance matrix for accounting/equity, risk,
orders/fills/replay, accounts/bindings/exposure, operations/reconciliation/
commands and market context. Validate retained-range traversal,
scope/lineage, raw-plus-derived provenance, clock/currency/formula/correction
semantics, complete empty states and source health. Use existing active
read-only path only when it is qualified; any new runtime route/profile
activation requires its own explicitly approved change window and rollback
evidence.

**Tests/evidence:** domain goldens and source-oracle parity; parent-set/orphan
and cross-profile isolation; lifecycle/replay determinism only where an
authoritative event source exists; stale/empty/inactive/partial/gap/correction
matrices; read-versus-command identity denials; and release-compatibility
checks. Same-host/rehearsal evidence is labelled accordingly and never
presented as production authority.

**Exit gate:** each requested acceptance is evidence-verified or has a
prescribed typed status with one owner action; reports/fixtures are complete;
and no consumer can confuse unavailable, current-only, empty or stale with
zero or history.

**Rollback/debt:** no independent runtime mutation is allowed without a
change-window decision. Failed parity/lineage/replay tests block closure;
only genuine source-owner work is carried forward explicitly.

**Implementation and evidence slice (2026-09-04):** the additive offline Rust crate
maximum-data-acceptance, two E6 JSON Schemas, domain-acceptance registry,
sanitized runtime-evidence registry, digest manifest, dependency-free Python
validator and Control-API contract test are now present. The source file
maximum-data-contract/src/e4.rs was updated only to pin the corrected E3
manifest. No transport, client, DB/Redis path, route, listener, cache,
projection, command port, profile flag, source identity, deployment or data
mutation was added.

The qualification found and fixed one in-scope frozen-contract defect rather
than weakening the gate: public.sizing_decisions exposes decision_id as its
actual immutable primary key, while E3 had named a non-existent
sizing_decision_id. Metadata-only runtime inspection confirmed the field name
and non-null key without retaining a value. E3 source columns/resource
identity and generated CSV/work-order wording were corrected, then the
E3→E4→E5 digest chain was regenerated and revalidated. The old E3/E4 pins
4df8a543…864e6 and 87c3edf1…46406 are superseded by
f9ba8afb…bd310 and abc4dcfe…d8984 respectively; this is a closed E6
defect correction, not residual debt.

The committed E6 evidence is a same-host, disposable-container capture using
only each already-running Edge profile's own mTLS UID/supplementary group and
read-only secret mount. It records three catalogue requests and 57 fixed
limit=1 relation requests: every catalogue was 200/AVAILABLE/FRESH/COMPLETE
with 96 relations, all 19 named E5 relations existed and bound correctly in
each profile, and all response frames were at or below 1 MiB. Observed state
counts were Paper 13 PARTIAL + 6 AUTHORITATIVE_EMPTY, Sandbox 7 PARTIAL + 1
POPULATED + 11 AUTHORITATIVE_EMPTY, and Live 3 PARTIAL + 16
AUTHORITATIVE_EMPTY. These are source-envelope states, never zero/history/
replay claims. All three no-client-certificate probes denied; all three
read-identity POST probes returned 405 before a command path. The evidence
stores hashes, counts, booleans and bounded contract metadata only—no row,
cursor, trace ID, token, certificate or secret.

Validated: E4/E5/E6 dependency-free validators passed; focused Rust
contract/adapter/acceptance tests passed 19/19; the E6 crate passed strict
Clippy with warnings denied; the new Control-API E6 Vitest passed 2/2; and
the new TypeScript test passed its standalone strict typecheck. The full
Control-API typecheck reports eight diagnostics in unchanged
command-center/execution-realtime/profile-projection tests and the existing
test harness module-resolution setup; it is recorded honestly but is neither
caused by nor used to waive an E6 assertion. Focused verification,
documentation, scoped artifact cleanup and commit are recorded in the closure
below.

**Closure (2026-09-04):** E6 is complete. The checked-in E6 return pack is
`maximum-data-acceptance` plus `e6-domain-acceptance.v1.{schema,json}`,
`e6-runtime-evidence.v1.{schema,json}` and `e6-acceptance.manifest.json`.
It is digest-pinned to the corrected E3 manifest
`sha256:f9ba8afb8acdf1f863c4de15758fa6e8b63cfd97b69ee0b43d4fc91f3bdbd310`,
E4 manifest
`sha256:abc4dcfe1f94f69099dc241f2f07c95c6976d919a8e1b7f68bd9fe88873d8984`
and E5 manifest
`sha256:57a36804838d341b6f67d4abbf15b64878743b3b58141b0af1d6934e6f189909`.
The independent `validate_maximum_data_e4.py`, E5 and E6 validators passed;
the full root-read-only Rust workspace run passed 19/19 focused tests; strict
`cargo fmt --check` and `cargo clippy -p maximum-data-acceptance --all-targets
-- -D warnings` passed; focused Control-API Vitest passed 2/2; and its
standalone strict TypeScript check passed. The full Control-API `npm run
typecheck` still reports exactly eight pre-existing, out-of-scope diagnostics
in `command-center`, `execution-realtime`, `profile-projection` and the
`node-pg-migrate` harness resolution. No E6 assertion relies on that failing
aggregate check, and no unrelated test was changed.

The only real runtime observations were the documented serial existing-Edge
mTLS reads: three catalogue responses and 57 one-row page responses across
Paper/Sandbox/Live, plus six denial checks. No runtime profile, Edge image,
Source Proxy route, database, Redis, credential, source data, command port or
deployment was changed; the active three-profile Edge/Source-Proxy/worker/
projection-Postgres service set remained up for the same 33-hour uptime after
the tests. Evidence is same-host only and must not be represented as
independent failure-domain or production-authoritative proof.

**Artifact hygiene:** pre-cleanup exact disposable caches were 680 MiB Cargo
target, 68 MiB Cargo home and 191 MiB Node workspace (939 MiB total). They
were deleted by exact path after verification. The unreferenced test-only
`rust:1.85.1-slim` and `node:22.14.0-bookworm-slim` images were removed; the
operational `qdl-v2-python:2.0.12-0843d2d` image was retained. Docker changed
from 23 images / 18 active / 11.7 GB to 21 images / 18 active / 10.26 GB; no
broad prune, volume/network removal or runtime restart occurred. Post-cleanup
BuildKit was 45 records / 15 active / 3.65 GB / 0 B reclaimable, so no
disposable cache remained to remove.

**Debt ruling and next boundary:** E6 leaves no internal implementation,
contract or cleanup debt. Missing global sequence, retention floor,
event/replay and correction observability remain explicit source-owner facts
in the accepted contract—not invented semantics or hidden E6 work—and only
govern a future event/replay surface. The next permitted work is the separately
unapproved EX-DP-07 resilience/capacity/complete-return slice; it requires new
owner approval and must not be inferred from this read-only qualification.

#### EX-DP-07 — E7 resilience, capacity and complete owner return

**Status:** **COMPLETE / RETURN_PACK_ACCEPTED_FOR_CURRENT_QUALIFIED_READS_AND_TYPED_EXTERNAL_GATES / NO_RUNTIME_MUTATION** (2026-09-04).

**Approval, preflight and decision boundary (2026-09-04):** Bobby approved
the complete E7 slice. It will finish the existing
`maximum-data-return-v1` pack and add only a Rust, digest-bound
return/qualification authority. The implementation may reuse the already
qualified `ManagerV2Client` bounded mTLS client, E5 fixed-operation adapter,
E6 accepted profile facts and existing Projection/SSE primitives, but it may
not wire a new listener, browser route, generic relation/SQL access, database
client, cache, command path, identity, deployment or source-side mechanism.
The current Manager path is a profile-bound current-page read plane, not a
global event journal; E7 must preserve that distinction rather than creating
an unconnected Tokio stream merely to imitate a future source.

The only live evidence permitted is a sanitized read-only probe through each
already-running Paper/Sandbox/Live Edge container's existing mTLS mount and
source proxy. It will use only the fixed catalogue and named E5 relation-page
requests, a `limit=1` response bound, serial requests plus at most the
published two concurrent requests per identity, and an ephemeral probe
container. It records timing/count/byte/hash/error-class metrics only; it
never writes or commits rows, cursors, trace IDs, JWTs, certificates,
credentials or connection material. Client reconnect/continuation is tested
only where an opaque continuation exists. Source outage, actual retained
event replay, SGP ingest, 1/5/30-minute production outage and live-tail
recovery cannot be induced or claimed without a separate runtime/failure
window; the final pack will carry them as exact typed external evidence
requirements rather than fabricated measurements.

**Invariants and gates:** (1) final pack must trace each frozen E3 field and
action through E4/E5/E6 to an implemented capability, named derivation,
typed unavailable state or one source-owner action; (2) every pack asset and
private owner-evidence reference is digest-bound, redacted and portable
without a private path or secret; (3) current Manager load is bounded and
profile-isolated; (4) queue saturation, bounded-frame, typed unavailable,
duplicate/gap/restart semantics are accepted only where the existing Rust
component actually implements them; (5) benchmark output labels measurement
subject and authority honestly and never establishes an unmeasured SLO; and
(6) no raw business row/secret/runtime configuration is committed. Tests
cover pack completeness/digest/redaction, E3--E6 compatibility, synthetic
isolated failure/recovery semantics, targeted Rust/TypeScript validators and
the narrow real source probe. A failed owned code/contract gate is fixed in
this phase; a missing source, independent-cell measurement or approved
failure window remains an explicit external gate.

**Rollback:** no runtime activation exists. On a failed gate, remove only the
new E7 pack/validator and exact disposable probe/build artifacts. Do not
restart or reconfigure the existing Edge, Source Proxy, Manager, database,
Redis, projection or command services.

**Goal:** harden the accepted return-pack/adapters under bounded failure and
load, then hand the Portal team one complete, digest-bound result.

**Work:** measure bounded source/Portal resource use, profile isolation,
identity denials, cursor expiry/recovery, source unavailability, partial
coverage, restart/rebuild/rollback compatibility and retention behavior for
the capabilities that EX-DP-05 actually implements. Generate the final
portal-execution-edge-maximum-data-return-v1 manifest containing deployed
truth, source/column/lineage census, domain semantics, screen/action mapping,
schemas/fixtures, capability matrix, health/acceptance reports, owner gaps,
downstream work orders, evidence digests and exact rollback notes.

**Tests/evidence:** bounded concurrency/row/byte/latency and memory tests;
profile/identity isolation; fault/reconnect/cursor recovery; contract and
release compatibility; manifest completeness/digest/redaction verification;
and a final trace from every mapped Portal requirement to source or typed
absence. Inventory Docker/BuildKit before and after any isolated build/test,
clean only disposable artifacts and record retained active/rollback images.

**Implementation and verified evidence (2026-09-04):** E7 adds the offline
`maximum-data-return` Rust crate, final portable
`contracts/maximum-data-return-v1` structure, dependency-free E7 validator
and focused Control-API fixture. It pins E3/E4/E5/E6 manifests, maps all 34
frozen fields once (22 `AVAILABLE_DIRECT`, five
`AVAILABLE_DERIVED_AT_PORTAL`, six `OWNER_ACTION_REQUIRED`, one
`CONTRACT_INCOMPATIBLE`) and carries all 18 E2 genuine source-owner gaps. The
copied E1 census is metadata-only (99 relations / 1,387 columns): its read
boundary and no-business-row provenance are checked, while the E7 runtime
manifest removes private release paths and retains only portable hashes and
image facts. `MANIFEST.sha256` indexes all 76 portable files except itself.

The permitted real probe used the existing Edge mTLS identity, source proxy,
fixed catalogue and `deployment_current` page at `limit=1`; no row, cursor,
trace ID, certificate, token, credential or configuration path was retained.
All three catalogues were `200/AVAILABLE/FRESH/COMPLETE` with 96 relations.
Paper recorded 7/8 bounded requests successful, 401,883 bytes, 4 items,
p50/p95/p99 24.099/31.666/31.666 ms and one 503 in the two-concurrent-page
sample, so the observed safe named-page concurrency is one. Sandbox recorded
7/8, 402,105 bytes, 4 items, 28.132/34.376/34.376 ms and one 503, likewise
one. Live recorded 8/8, 394,068 bytes, authoritative-complete empty
deployment pages and 26.851/73.117/73.117 ms, with two concurrent pages
successful. The source-admission setting of two is therefore not promoted to
an unmeasured SLO: clients use one Paper/Sandbox named page and two Live pages
until a new qualified measurement. A separate bounded Live `order_current`
request returned typed 503 and is preserved as `SOURCE_UNAVAILABLE_OBSERVED`,
with no automatic retry or empty substitution. Paper/Sandbox continuation was
reconnected only when the source issued one; Live had no continuation on the
empty page. This is current-page evidence only, never a global event/replay or
retention claim.

The full E4/E5/E6/E7 dependency-free validators passed. Rust format, four
focused E7 unit tests and strict E7 Clippy passed. The Control-API E7 Vitest
passed 2/2 and its standalone strict TypeScript check passed. The node package
manager reported three dependency audit advisories during its temporary,
pinned test install; `package-lock.json` was unchanged and these are neither
introduced by nor used to waive E7's assertions. E7's verifier and test pack
explicitly reject generic SQL/direct DB/Redis, source credentials, runtime
activation, replay promotion, unmeasured SLO promotion, missing file hashes,
private paths and raw connection material.

**Exit gate:** the return pack validates and is reproducible from its manifest;
all EX-DP-03 mappings reach an accepted adapter, authoritative derivation or
typed source-owner gap; measured bounds have evidence; no raw data/secret is
committed; and the handoff states exactly which capabilities are usable now,
which await owner publication and which require a separate runtime window.

**Rollback/debt:** remove only EX-DP-07 isolated benchmark/test artifacts and
inactive registrations. No broad cleanup or runtime rollback is implied.
Internal technical debt must be zero at closure; missing authoritative source,
retention or owner window remains an explicit external gate, never a concealed
completion claim.

**Closure (2026-09-04):** E7 is complete. The final handoff is
`services/portal-execution-edge-rs/contracts/maximum-data-return-v1/`, led by
`MASTER_RESPONSE.md`, `owner-response.v2.json`,
`e7-return-pack.manifest.json` and `MANIFEST.sha256`. Its acceptance is exact:
the portable return pack, all frozen E3 mappings and existing qualified current
reads are accepted; a future authoritative event producer, independent-cell
measurement or approved failure/release window remains a typed external owner
gate. It does not weaken a current source page into an event/replay promise or
require the Portal to guess absence semantics.

Validation passed after final artifact generation: E4/E5/E6/E7 dependency-free
validators; Rust `cargo fmt --check`; four `maximum-data-return` unit tests;
strict `cargo clippy -p maximum-data-return --all-targets -- -D warnings`; and
the focused Control-API E7 Vitest (2/2) plus standalone strict TypeScript
check. `git diff --check`, complete SHA-256 index validation and portable
content scanning are closure gates below. No aggregate Control-API typecheck,
browser/UI test, deployment, route binding, source query, source identity,
database, Redis, command or runtime configuration was changed or falsely
claimed by E7.

**Artifact hygiene and runtime reconciliation:** before cleanup, the exact
disposable E7 Cargo home/target and Node modules/cache were 68 MiB, 483 MiB,
148 MiB and 42 MiB respectively (741 MiB total), plus the 23 KiB temporary
read-only probe script/cache. The two temporary compiler images were exactly
`rust:1.85.1-slim` (1.12 GB) and `node:22.14.0-bookworm-slim` (325 MB). All
six exact temporary paths and both compiler images were removed; no volume,
network, source runtime state or broad prune was touched. Docker changed from
25 images before cleanup to 23 after; BuildKit remained 3.797 GB reclaimable
cache and was intentionally not broadly pruned because it predated this slice.
The active Edge image
`sha256:47ea4d78099347706710879bf26e46a15cfaf80e4ef7ac22879f0a71f12c3077`,
Source Proxy `sha256:dafa9e70a3d90cd079147d149dbbaa8ac8a3a9db079b0cf8099892a7f1d5fbe7`,
Manager and named rollback images (including operational
`qdl-v2-python:2.0.12-0843d2d`) were retained. The three Edge, three Source
Proxy and three projection services remained healthy at the same 35-hour
uptime; no restart or deployment occurred.

**Debt ruling and next boundary:** no E7 implementation, contract, evidence or
cleanup debt remains. The three package-manager dependency audit advisories
seen in the temporary pinned Control-API install were pre-existing lockfile
state; no dependency or lockfile change was made, and they are reported rather
than waived as E7 evidence. Genuine external requirements are retained in the
return pack: global event sequence/gap rate, replay retention/correction,
independent-cell SGP ingest and controlled 1/5/30-minute source outage
recovery. The next permitted runtime work is a separately approved immutable
Portal BFF/Edge release binding one named E5 operation; it is not required to
accept this offline/current-read return pack.

#### EX-DP post-closure — Portal implementer handoff and runtime-readiness publication

**Status:** **COMPLETE / PULLABLE_PORTAL_HANDOFF / RUNTIME_ALREADY_READY / NO_RUNTIME_MUTATION** (2026-09-04).

**Approval and scope:** Bobby approved one concise, pullable handoff for the
Portal Execution Edge implementer and asked that the already-qualified service
be reported as ready. This slice may add one root-level Markdown handoff,
cross-link it from this plan, validate the existing portable E7 pack and push
the current feature branch. It may inspect the running Edge containers only to
report their health, immutable image digest and boolean Manager-read gates. It
must not alter routes, images, containers, ports, identities, tokens,
certificates, Source Proxy, Trading System, database, cache, command plane or
profile configuration.

**Invariants and exit gate:** the handoff must distinguish the private Edge
route from the Source Proxy route; direct DB/SQL/browser access remains
prohibited; the only delegated resource remains GET-only
`execution:manager-v2:read`; profile, audience and mTLS stay deployment-bound;
and E7's current-page/replay distinction and typed source absence must remain
intact. Before publication, validate the E7 manifest/return pack, verify the
new document's links and redaction boundary, run `git diff --check`, commit the
plan and handoff together, then push only `feat/execution-data-activation`.
No runtime mutation is a permitted or required part of this publication.

**Rollback:** source-only: revert the single handoff commit from the feature
branch if its documentation is inaccurate. There is no runtime rollback because
this slice does not deploy or reconfigure anything.

**Implementation and evidence (2026-09-04):** added the root-level
`PORTAL_EXECUTION_EDGE_MAXIMUM_DATA_HANDOFF.md`. It gives the receiving agent a
copy/paste implementation prompt, exact read order, product-binding boundary,
current multi-profile service truth and the four private Edge GET routes. The
document deliberately sits outside the immutable `maximum-data-return-v1`
directory, so its `MANIFEST.sha256` continues to pin the accepted portable E7
return pack unchanged. It records that the BFF calls Edge
`/internal/v2/manager/...`, while Edge—not the BFF—calls the Source Proxy's
`/portal/execution/v2/manager/...` path.

Read-only Docker reconciliation found all three `execution-edge` containers
healthy on immutable image
`sha256:47ea4d78099347706710879bf26e46a15cfaf80e4ef7ac22879f0a71f12c3077`;
all three Source Proxy containers healthy; all three projection PostgreSQL
containers running; and `EDGE_MANAGER_V2_READ_ENABLED=true` for Paper,
Sandbox and Live. `EDGE_MANAGER_PROJECTION_ENABLED=false` in each profile is
intentional read-through operation, not a missing readiness configuration. No
container, image, route, port, secret, identity, source or database was
changed.

The E7 validator passed again (`34` capabilities, `18` genuine source gaps,
`3` measured profiles); `MANIFEST.sha256` verified; every local relative link
in the new handoff resolved; and `git diff --check` passed. The coherent source
commit is published only to `feat/execution-data-activation`; the next product
change is a separate immutable Portal BFF release that selects named
catalogue-bound operations. There is no implementation or cleanup debt in this
publication. The typed source/replay/independent-cell requirements already
recorded by E7 remain external facts, not handoff debt.

#### EX-DP downstream journal — Portal EDS backend campaign plan

**Status:** **PORTAL_DOWNSTREAM_EDS_PLAN_COMPLETE / NO_RUNTIME_MUTATION**
(2026-09-04).

The receiving Portal worktree was fast-forwarded to the published
`feat/execution-data-activation` head
`6f6503ea21327bc39946f48c697b4287c673f12c` before planning. The E7 validator
passed again (`34` capabilities, `18` genuine source gaps and `3` measured
profiles), and every entry in
`services/portal-execution-edge-rs/contracts/maximum-data-return-v1/MANIFEST.sha256`
verified before any document was edited.

The executable downstream sequence is now indexed at
[`EXECUTION_LOOP_BACKEND_UNIFIED_PLAN_AND_GUIDE.md` §17](./EXECUTION_LOOP_BACKEND_UNIFIED_PLAN_AND_GUIDE.md#17-eds-campaign--maximum-data-bff-durable-mirror-streaming-and-frozen-frontend-delivery-2026-09-04).
It applies
[`EXECUTION_DURABLE_STREAMING_FROZEN_FRONTEND_INTEGRATION_AND_FINANCIAL_CHART_PLAN_v1.1.md`](./EXECUTION_DURABLE_STREAMING_FROZEN_FRONTEND_INTEGRATION_AND_FINANCIAL_CHART_PLAN_v1.1.md)
without changing the accepted E7 pack. EDS-00 records the immutable intake;
EDS-01 through EDS-07 deliver the maximum honest Manager-v2 current/range
product now; EDS-08 through EDS-10 form the separately gated authoritative
event, replay and market-context lane; EDS-11 and EDS-12 complete consumer,
operations, resilience and release acceptance.

This planning slice did not change product/runtime code, dependencies,
source/profile activation, cache, command authority, runtime containers,
Trading System, Source Proxy, database or network. It only corrects the
isolated Control API test cell to mount the sanitized E7 pack read-only at the
repo-relative path required by the newly received EX-DP tests. The five
pre-existing local P4-E cadence files remain protected and intentionally
excluded from this plan commit. The next implementation phase is **EDS-01 —
Sealed Manager-v2 consumer and fixed E5 operation authority**.

#### EDS-00 downstream closure — return-pack intake and immutable Portal baseline

**Status:** **CONTRACT_LOCKED / SERVER_BASELINE_COMPLETE / NO_RUNTIME_MUTATION**
(2026-09-04).

The Portal consumer branch adds one authenticated, workspace-bound metadata
endpoint: `GET /api/v1/execution/runtime-manifest`. It compiles the accepted
E7 source/Edge/catalogue/serving-policy/E5/E6 pins, profile capacity, page
bounds and explicit external gates into a sanitized in-image baseline. It does
not read a URL, source configuration, private route, raw row, cursor, token,
certificate, database, Redis or Source Proxy at request time.

At EDS-00, the endpoint truthfully reported `EDS_00_BASELINE_ONLY` and
`named_portal_operation=NOT_YET_PUBLISHED`; it could not imply that an Edge
profile was activated or a product BFF had already queried the source. EDS-01
subsequently publishes exactly one fixed server-side E5 deployment operation
and updates that metadata without making this endpoint probe a source. A
focused contract test verifies every pinned value against the accepted owner,
deployed, E5 and E7 artifacts, confirms session/workspace access enforcement
and rejects source/secret leakage. The existing E3 drift suite remains the
single generated 23-screen inventory comparison.

EDS-00 has no implementation or cleanup debt. The retained global-sequence,
replay/correction, cross-cell ingest and outage requirements are explicit
external owner gates in E7. The next change is EDS-01 only: publish the fixed
`maximumDataDeploymentPageV1` server-side BFF operation using the existing
deployment-bound mTLS and `execution:manager-v2:read` assertion, without
changing the accepted return pack or any runtime configuration.

#### EDS-01 downstream closure — sealed E5 Manager-v2 deployment BFF

**Status:** **BFF_AUTHORITY_COMPLETE / CONTRACT_FAIL_CLOSED /
NO_RUNTIME_MUTATION** (2026-09-04).

`GET /api/v1/execution/manager/deployments` is now the sole first E5
same-origin operation. Its server-owned frozen registry fixes
`manager.deployments/public.strategy_deployments`, the accepted field map,
contract/catalogue pins, exact Paper/Sandbox/Live profile/audience/screen
binding, 200-row/1-MiB/4-KiB bounds and source/profile admission capacities.
It reuses the existing deployment-bound mTLS and short-lived
`execution:manager-v2:read` assertion; no browser request may choose a
relation/schema/source/profile/origin or see a source cursor, trace, record
key, JWT or certificate.

Portal PostgreSQL holds only short-lived, identity/workspace/profile/contract
bound opaque continuations. Source `200` empty/partial/stale semantics and
typed `400/401/403/404/502/503` refusals remain truthful. Fresh-PG,
migration/restore, E7/hash, contract drift, P/S/L, continuation, injection and
1/10/100 coalescing/admission tests are required evidence; the final gate
passed TypeScript build, 39 test files / 341 tests and the PostgreSQL restore
drill. The detailed record is
[`EDS_01_SEALED_MANAGER_V2_E5_DEPLOYMENT_BFF.md`](./backend/EDS_01_SEALED_MANAGER_V2_E5_DEPLOYMENT_BFF.md).

EDS-01 does not activate a profile, deploy a runtime image, alter Edge/Source
Proxy/Trading System/DB/Redis/broker/CLI or change command authority. Rich
screen composition is explicitly EDS-03 after EDS-02 generated product
contracts; this is planned layer sequencing rather than hidden EDS-01 debt.

---

<a id="research-loop-v11"></a>
# 13. Research Loop V1.1 — chỉ mục triển khai 24 phase, kế thừa Execution v1.1.1

**Owner:** Bobby. **Ngày lập:** 2026-09-19. **Trạng thái:** `ACTIVE / P01–P06 approved foundation outputs recorded; P03–P06 HiFi composition recovery ready for Claude`.
P01–P06 đã có evidence/commit riêng; owner amendment ngày 2026-09-20 mở
frontend composition theo contract-first vertical slice, không cấp quyền deploy.
Workspace soạn plan: `/home/bobby/portal-research`, nhánh `docs/research-loop-plan`,
base kiểm tra `533162635f56584d630e3d971d77d50860595f15`. Đây là source baseline,
không phải chứng nhận runtime production hoặc QuantBT 1.1.1 đã active.

Phần §1–12 và các journal Execution giữ nguyên lịch sử. §13 là **live phase index duy nhất**
của Research: 24 mục dưới đây giữ goal/to-do/tests/exit/handoff, link sang guide để làm chi tiết;
không tạo plan/tracker cạnh tranh và không chép nguyên guide. Các thuật ngữ version Portal
v1.1.1, Guide V1.1, QuantBT 1.1.1 và Delta strategy 1.0.0 là **bốn danh tính riêng**.

<a id="rl-authority"></a>
## 13.1. Nguồn bắt buộc và reconciliation

| Nguồn | Cách sử dụng |
|---|---|
| [Research rules A13](./research_loop/CLAUDE-FOR-thanhvuong.md#research-working-rules) | Quy trình chung Codex/Claude; A1–A12 áp dụng quyền contributor theo Linux identity, không hạn chế Bobby |
| [Guide 24 phase](./research_loop/RESEARCH_LOOP_GUIDE_V1_1_24_PHASES_vi.md#part-iv) | Toàn bộ to-do, FND/COR/DR, tests, exit gates, rollback của P01–P24 vẫn bắt buộc |
| [V1.1 Delta](./research_loop/RESEARCH_LOOP_GUIDE_V1_1_24_PHASES_vi.md#v11-delta), [browser](./research_loop/RESEARCH_LOOP_GUIDE_V1_1_24_PHASES_vi.md#v11-browser), [phase gates](./research_loop/RESEARCH_LOOP_GUIDE_V1_1_24_PHASES_vi.md#v11-phase-gates), [dev review](./research_loop/RESEARCH_LOOP_GUIDE_V1_1_24_PHASES_vi.md#v11-dev-review) | Bổ sung bắt buộc cho từng phase, không chỉ P24 |
| [Screen spec index](./research_loop/release-v1.1/docs/SPEC_INDEX.md), [IA](./research_loop/release-v1.1/docs/01_IA_AND_WIRING.md), [Alpha/RC](./research_loop/release-v1.1/docs/03_ALPHA_RC_BINDING.md), [engine routes](./research_loop/release-v1.1/docs/04_ENGINE_ROUTE_MATRIX.md) | 15 màn 00–14; mỗi phase đọc hết HTML + spec màn, handlers, panels và test cuối file |
| [Execution backend plan](./EXECUTION_LOOP_BACKEND_UNIFIED_PLAN_AND_GUIDE.md) §18–21 | Lessons/current contracts, không mở lại các phase Execution hoặc thừa hưởng quyền activate cũ |
| [Release](../docs/release-and-deployment.md), [cleanup](../docs/production-feature-profile-and-cleanup.md) C4/C6 | Build/release/data isolation và tài nguyên; facts đo ngày cũ phải đo lại khi thực thi |
| [v0.5 topology](./RESEARCH_EXECUTION_DUAL_CELL_AND_INSTITUTIONAL_UIUX_ADJUSTMENT_GUIDE_v0.5_vi.md) | Kế thừa boundaries và release discipline; target cũ không là runtime hiện tại hoặc quyền xây thêm AWS services |

**Authority theo concern:** chỉ đạo Bobby mới nhất + rules dự án; §13 quản lý phase/status/acceptance;
guide giữ chi tiết implementation; frontend HTML/spec + COR đã duyệt giữ UX; actual published
engine/Execution contract giữ computational/source authority. Không tự sửa consumer Execution
để làm mô tả Research thành đúng. Conflict chưa giải quyết đi vào decision ledger, không chọn
im lặng bản dễ làm. Các điều chỉnh dưới đây không đổi hi-fi hoặc waiver test.

| ID | Chênh lệch/lưu ý đã đọc | Xử lý trong phase |
|---|---|---|
| RL-C01 | Root rules/guide cũ ghi Claude FE-only, Research ngoài scope; Bobby hiện giao Research BE+FE | Override scoped tại root AGENTS/CLAUDE và Research A13: thế mạnh không là role cấm; sửa phần đã chốt của bên kia cần approval/handoff cụ thể |
| RL-C02 | Engine 1.0.8 trong baseline cũ; guide target 1.1.1; frontend hiện TanStack Query/ECharts6, prototype có ECharts5 CDN | P01 inventory lock/package/runtime; P04 upgrade adapter; P09 dùng libs/fonts đã cài, không downgrade/copy prototype runtime. Giữ reader/history cũ |
| RL-C03 | ZIP/prose không chứng minh deploy, source capability hay privileges hiện tại | P01 source/host ledger tách OBSERVED/NOT_VERIFIED/PLANNED; P02 spike qua current code. Không tự SSH/probe AWS để triển khai Research |
| RL-C04 | Current facade chỉ seed run khi202; RunSync hash toàn selected_params wrapper; approval-create strict và workspace optional | P02/P10/P22 chứng minh bằng exact code/tests: `apps/control-api/src/facade/proxy.service.ts`, `run-sync.service.ts`, `governance/contracts.ts`. Không hardcode workspace `primary`, invent rc_id payload hoặc đồng nhất bốn digest |
| RL-C05 | Một số README v1.0/14screens; bộ hiện có15HTML (00–14); lifecycle P-1…P-8 “implemented” là design record | P01 giữ đủ15 màn + subpanels. Không dùng trạng thái prototype làm implementation evidence. P01 source test inventory là denominator |
| RL-C06 | Report HTML gọi `doc-page.js`, chưa thấy file trong package; CSS ẩn `doc-page:not(:defined)` | P01 xác minh dependency/license/source, lập phương án harness; P09/P18 Research-owned print/render tương thích và visual review. Không chụp blank report làm baseline; không tự chép thư viện ngoài |
| RL-C07 | Contributor remote trong archive khác tên mirror trong root policy; Bobby dùng canonical origin | P01 owner provisioning xác nhận repository/URL/branch prefix/dev SHA thực tế. Không tự đổi remote hoặc dùng credential Bobby; Bobby chuyển baseline đã review cho contributor, không mirror mọi commit mặc định |
| RL-C08 | Guide cho carry bounded debt ở một số đoạn cũ | V1.1 + A5 thắng: không known unresolved in-scope defect/test thiếu trước phase sau. Work vốn thuộc phase sau khác debt; external gap ảnh hưởng required feature cần Bobby quyết scope, không tự N/A |
| RL-C09 | DR-01 holdout authority; DR-02 bound warning; DR-03 promotion_pick chưa đủ source | P02 ghi source/action bị ảnh hưởng; DR-01 đóng trước P14 mutation, DR-02 trước P13/P15/P16 copy/formula, DR-03 trước P19. Không invent gate/reset/pick hay blanket block mọi read |
| RL-C10 | Research dev hostname mới chỉ là target trong guide | P01 gom bootstrap request; P07 trở đi cần actual dev-review receipt khi UI reviewable. Env/secrets/data ngoài worktree; không deploy vào dev/prod chung để né thiếu provisioning |

### 13.2. Mục tiêu, scope và cách phối hợp

- Hoàn thiện15 màn và mọi required tab/drawer/action theo hi-fi, từ Import→Run→Evidence→RC→existing R1;
  backend thật, không “UI đẹp dùng mock” hay “API có nhưng màn envelope”.
- TS giữ actor/workspace/RBAC/control/Research workflow; Rust giữ bounded storage/query/projections;
  Python chỉ adapter/worker khi QuantBT/strategy cần. QuantBT giữ simulation/accounting/selection,
  không viết engine thứ hai để khớp UI. Reuse nền hiện có; không tạo service cho từng màn.
- Research ở SGP; **không sửa Execution/TS/Edge/AWS runtime**, không direct TS DB/Redis/broker/CLI.
  Existing publication APIs được test trong isolated authorized environment, không gửi approval production.
- Codex backend-first, Claude frontend-first, **đều được làm BE/FE theo assignment**. Mỗi slice có
  người đang sửa + file/contract revision. Trước đổi phần được bên kia/Bobby duyệt: hỏi với exact diff,
  rationale, visual/consumer impact và tests; approval cụ thể hiện có không hỏi lại. Không chia file quyền
  theo model tuyệt đối, cũng không sửa hộ âm thầm.
- Bobby có thể làm trước bất kỳ slice được giao; record phase base/head, evidence invalidation và phần còn lại.
  Thanhvuong dùng workspace Linux riêng và baseline dev được Bobby chuyển/review, không chung metadata Git,
  secrets hoặc volumes Bobby. Handoff mặc định mỗi cặp P01–02…P23–24 theo A6; chỉ Bobby merge.
- Dependencies kỹ thuật giữ nguyên. Thanhvuong chỉ chuyển phase/cặp theo A5/A6; song song subtasks
  trong phase được cấp, không suy sơ đồ dependency thành quyền mở mọi phase. Bobby có thể phân lại phạm vi
  rõ ràng. Không tạo phase25 để dời thiếu sót đã biết.
- Frontend giữ Research Light và HTML/spec; không đổi global Execution Carbon, typography hoặc routing chung.
  Đủ loading/empty/partial/stale/denied/unavailable/terminal; giữ bố cục ở mọi state.
  Sửa spacing/layout/copy khác source cần COR/owner decision trước thực hiện.

#### 13.2.1. Contract-first vertical slice — owner amendment 2026-09-20

Handoff backend **không còn là lý do để hoãn TSX/HiFi composition tới cuối
campaign**. Ngay khi một phase đã freeze named DTO, state semantics và authority
boundary, frontend có thể và phải dựng phần composition/panel/tab thuộc scope
đó song song với backend phase kế tiếp. Handoff giữ vai trò safety contract;
không phải giới hạn mỹ thuật hoặc lý do thay màn giàu thông tin bằng envelope.

Áp dụng ngay cho P03–P06 theo
[Claude P03–P06 vertical-slice brief](./research_loop/CLAUDE_P03_P06_VERTICAL_SLICE_RECOVERY_BRIEF.md):

1. **P03** dùng state/query/fixture harness đã có để dựng shared Research
   scope/refusal/panel states; browser không được tự tạo identity, workspace
   authority hay route API.
2. **P04** dựng Screen 12 Engine Atlas theo HTML/spec, dùng Atlas DTO/read
   path thật khi có; 14 cards và bốn axes luôn giữ composition kể cả refused
   state.
3. **P05** dựng reusable HIFI artifact/readiness panels từ exact state
   contract. Chưa có named DTO/action chỉ chặn fetch/download/mutation — không
   chặn panel, typed unavailable hoặc visual fixture lane được gắn nhãn.
4. **P06** dựng queue/attempt/retry/finishing panels từ scheduler contract.
   Chưa có producer/SSE chỉ chặn submit/cancel/live progress activation; không
   chặn truthful state composition.

P09 vẫn sở hữu shared Research foundation/route normalization, P10 vẫn sở hữu
named producer/BFF và P11 vẫn sở hữu Progress/SSE/readiness activation. Điều
đó không cho phép trì hoãn visual work hiện đã có stable input. Frontend không
được invent action, ETA, percent, source data hay bypass same-origin BFF để
đổi lấy UI. Khi named product DTO còn thiếu, state fixture chỉ dùng trong
isolated visual/test lane; product route giữ layout với exact typed
unavailable/denied/pending truth, không masquerade fixture thành data thật.

Đây là **composition recovery slice**, không reopen P03–P06 backend gates hay
tạo phase/tracker song song: Claude append evidence vào từng `evidence/P03` …
`evidence/P06`, cập nhật row board này, và giữ source HTML/spec/COR là UX
authority. Sau P07, mọi phase áp dụng cùng choreography: contract freeze →
HiFi composition song song → named BFF/action activation → one phase closeout.

<a id="rl-test-gates"></a>
## 13.3. Test và exit gate chung — áp dụng vào từng Pxx

**Ma trận bên dưới là phần bổ sung, không thay các test của guide/screen specs.**
Mỗi phase chạy đủ `Pxx-T01…Tnn` + `V11-Pxx-DR/BR/GX` + các source-screen test IDs áp dụng cho output hiện tại.
Link tới màn tương lai trong foundation là yêu cầu đọc/contract harness, không buộc hoàn thiện màn sớm:
P02 kiểm02/11 compatibility, P04 kiểm12 descriptor, P08 kiểm02/05 preflight; toàn bộ screen tests
đóng ở phase giao màn hoàn chỉnh tương ứng. P01 mapping test→phase giữ nguyên denominator,
không loại test tương lai hoặc gọi harness là product acceptance.
P01 inventory test IDs, P02 chốt contract vectors; chưa có runner thì đó là deliverable phải viết,
không ghi tên lệnh tưởng tượng như script hiện hữu. Chỉ `NOT_APPLICABLE_PROVEN` có predicate/source
rõ mới loại một conditional test; test required chưa chạy là gate chưa đạt.

| Gate | Backend/contract | Frontend/integration | Evidence/điều kiện |
|---|---|---|---|
| G0 — baseline & scope | Exact source/lock/schema, protected diff, kernel checksum, endpoint ownership | Đọc handoff/code mới, source HTML/spec, inventory đủ controls/states | Không sửa ngoài allowlist, không mất commit hoặc dữ liệu của agent khác |
| G1 — authority & compatibility | Session/workspace/object auth, malformed input, unauthorized/forged headers, CSRF+Origin cho writes, replay/CAS/idempotency; schema+generated drift | Canonical fixtures và generated client; errors không biến thành empty; không chọn raw relation/DB URL hoặc leak token | Auth enforcement server-side; backward reader/old client tests nơi bị ảnh hưởng |
| G2 — numeric/data truth | Direct engine→persisted→API: IDs/UTC/precision/units/null/coverage/selection; derived formula independent oracle | API→DOM/chart/table/export cùng revision; no stale resource data under new route | Fixture, binary64 tolerance và exact decimal fields phân biệt; seed/data/config pins |
| G3 — bounded cost/durability | Pagination/count/query plan/row+byte limits; TTL/retention/pins; duplicate/cancel/restart/fencing; no hidden compute in reads | 1/10/20 viewers + same-scope sharing, virtualized rows/chart windows, no implicit jobs, obsolete-response cancellation | Đo theo phase workload; aggregate5GB baseline,8GB không là waiver5GB; user quota riêng |
| G4 — UI & browser | Named DTO cho từng panel/action, đủ useful current data | Source-layout/copy; all subpanels, responsive1280/660 và viewport riêng spec; keyboard/a11y/console; deep-link/back/forward | Không sửa baseline để xanh; không thay rich screen bằng generic unavailable/JSON |
| G5 — integration & isolation | Applicable Python/Rust/Control API/PG suites; migrations fresh+upgrade; không đổi execution consumers | `VISUAL_FIXTURE`, `REAL_DELTA_E2E`, `EXECUTION_REGRESSION` tách riêng | Real lane không response stub/HAR fallback; test current unchanged Execution interfaces khi chạm boundary |
| G6 — delivered dev | Exact image/config/migration/API SHA; env ngoài checkout; host-bound project/data | Browser bundle/build flag/version, login+real route+assets/chart; refresh không trắng; same-origin | P01–P02 remain discovery/contract harness only unless owner expands scope. P03–P06 composition introduced under §13.2.1 must earn a scoped browser/dev receipt; inactive action/data lanes remain typed and do not claim full product activation |
| G7 — closeout & resources | Rollback/restore phù hợp rủi ro; scoped teardown, capacity, cache/evidence retention | FE requests read→mapped→consumed→browser verified, không chỉ một factory đổi tên | Report đủ15mục A4, debt=0 trong scope, cleanup record, coherent commit và owner checkpoint |

**Test economy:** focused gates mỗi slice; full affected-domain gates lúc đóng phase; integration/full required gates
tại checkpoint đúng scope và P23/P24. Có thể reuse exact immutable evidence khi dependency hash/input/toolchain/config
không đổi, ghi `REUSED_VERIFIED` + origin run, không giả newly run. Thay schema/auth/adapter/format/stream/projection
phải invalidate các consumer tests tương ứng. Không chạy lại compute/UI toàn bộ cho docs-only change.
Tests cơ học có thể dùng `npm test`, `npm run build` trong frontend;
`scripts/control-api-test.sh`, `scripts/contracts-test.sh`, `apps/portal/scripts/test_backend.sh`,
Rust crate tests và kernel verifier **chỉ sau đọc script, quota, ports/project và provisioning**.
Không tự chạy helper trỏ shared production; contributor không tự cài OS deps/sudo/Docker.

### 13.3.1. Browser-first HiFi reconciliation (amendment 2026-09-20)

Mỗi phase UI phải đọc HTML HiFi đúng màn, screen spec, COR và DTO/action
contract trước khi sửa; lưu mapping `HiFi element/interaction/copy →
component/panel → DTO/action → browser assertion → status/owner`. Trước closeout
phải đối chiếu bằng browser build production-like ở `1280px`, `660px` và
viewport riêng của spec; kiểm console/network, overflow, keyboard/focus,
deep-link/back/refresh và toàn bộ typed states. Evidence phải phân biệt
`COMPONENT_FIXTURE_BROWSER_RECEIPT`, `PRODUCT_ROUTE_BROWSER_RECEIPT` và
`REAL_API_E2E_RECEIPT`; fixture/mock không được nâng thành product acceptance.

HTML/spec/COR conflict là `VISUAL_DECISION_REQUIRED`, không tự chọn hoặc bịa
authority/data chỉ để giống ảnh. Screenshot/trace/storage state giữ private;
Markdown receipt ghi command, source/build SHA, route/lane, browser version,
dimensions, digest, console/network result và retention. Không update snapshot
rộng để che regression. Chỉ named product route có receipt thật mới claim
“HiFi screen complete”. Quy tắc chi tiết/mandatory cho mọi contributor nằm ở
[A13.4](./research_loop/CLAUDE-FOR-thanhvuong.md#a134-browser-first-hifi-reconciliation-và-visual-receipt-bắt-buộc);
audit baseline P03–P08 ở
[P08 evidence](./research_loop/evidence/P08/frontend-hifi-browser-audit.md).

**Bốn mốc không gộp:** code complete → tested/integrated → dev review-ready → Bobby accepted.
Production deployed chỉ sau release order riêng. Các phase foundation có output riêng, không đòi UI tương lai để đóng;
nhưng thiếu consumer test/required field của phase hiện tại không được gọi future work.

**Closeout tối thiểu:** phase source range; exact test commands/exit/counts/fail/skip/reuse; field/action/scenario matrix delta;
Delta references/tolerances; screenshot/trace **private refs**; resource before/after; protected diff; rollback;
open decisions; dev identity receipt khi applicable; next action. Small authored redacted report vào Git,
raw market/Parquet/logs/screenshots/cookies/generated test reports ngoài Git với retention đủ review.

<a id="rl-board"></a>
## 13.4. Board duy nhất và trình tự bàn giao

Mỗi phase khởi đầu ở trạng thái **PLANNED**, implementer `UNASSIGNED_BY_BOBBY`.
Trạng thái sống, implementer và receipt chính xác nằm tại từng row dưới đây; không suy
diễn trạng thái từ Guide. Khi bắt đầu/đóng, cập nhật **row này**: implementer, state,
base/head SHA, report/evidence, next/blocker.
Không chép trạng thái sống vào Guide hoặc tạo tracker riêng. Detailed entries §13.5 là yêu cầu ổn định.

| Phase | Dependency | Màn | Checkpoint | State / implementer / evidence |
|---|---|---|---|---|
| [P01](#rl-p01) | — | 00–14 inventory | 01 | TECHNICALLY_COMPLETE / Codex + Claude source review / [P01 report](./research_loop/evidence/P01/phase-report.md); matrices verified both directions, 0 defect, 0 omission; systemic `P01-FE-01` state vocabulary + immediate S02/S11 spec gaps closed by P02 amendment; screen implementation remains with owner phase |
| [P02](#rl-p02) | P01 | 02/11 harness | 01 | CONTRACT_AMENDMENT_COMPLETE / Codex + Claude review / [P02 packet](./research_loop/evidence/P02/phase-report.md); versioned `requested_spec` schema/types map all 24 S02 controls, S02/S11 state semantics specified; no producer/browser/runtime claim |
| [P03](#rl-p03) | P02 | nền | 02 | BACKEND_FOUNDATION_COMPLETE / Codex backend / [P03 packet](./research_loop/evidence/P03/phase-report.md); additive schema + scoped role + repository + T01–T11 PASS; FE_CONSUMER_HARNESS_COMPLETE / Claude — `src/research/` +663 lines. `FE_COMPOSITION_RECOVERY_READY_FOR_CLAUDE`: scope/refusal composition now proceeds under §13.2.1; generated client/action activation remains P10; FE_PANEL_BOUNDARY_COMPLETE / Claude — [composition](./research_loop/evidence/P03/frontend-composition-claude.md); **FE_COMPOSITION_RECOVERY_COMPLETE** / Claude — R1 closeout: no lease epoch/worker identity/work digest on the browser surface, boundary sweep + DOM probe |
| [P04](#rl-p04) | P02 | nền/12 | 02 | BACKEND_COMPLETE / Codex / [P04 packet](./research_loop/evidence/P04/phase-report.md); QuantBT 1.1.1+native provenance, 14-route descriptive Atlas, exact P04 admission and real Delta/resource evidence PASS; FE_ATLAS_DATA_SOURCE_COMPLETE / Claude — atlas data source +540 lines, 41/41, tsc 0. `FE_COMPOSITION_RECOVERY_READY_FOR_CLAUDE`: Screen 12 HiFi composition may start now; P09 retains shared route/foundation closure; FE_SCREEN12_COMPOSITION_COMPLETE / Claude — [Screen 12](./research_loop/evidence/P04/frontend-composition-claude.md), 3 tabs, manifest-driven, browser receipt 0 console errors; **FE_COMPOSITION_RECOVERY_COMPLETE** / Claude — R1 closeout: no lease epoch/worker identity/work digest on the browser surface, boundary sweep + DOM probe |
| [P05](#rl-p05) | P03,P04 | nền | 03 | TECHNICALLY_COMPLETE / Codex backend / bounded Parquet, immutable Control-API authority, Rust reader and recovery evidence closed; [P05 evidence](./research_loop/evidence/P05/README.md); FE_ARTIFACT_HARNESS_COMPLETE / Claude — artifact harness +337 lines. `FE_COMPOSITION_RECOVERY_READY_FOR_CLAUDE`: artifact panels may start now; named DTO/download action activation remains P10/P11; FE_ARTIFACT_PANEL_COMPLETE / Claude — [composition](./research_loop/evidence/P05/frontend-composition-claude.md); **FE_COMPOSITION_RECOVERY_COMPLETE** / Claude — R1 closeout: no lease epoch/worker identity/work digest on the browser surface, boundary sweep + DOM probe |
| [RF-01](#rl-rf-01) | P01–P05, P09, P11 | nền · 00/03/04–07/12 dùng chung | 03R | **RF01_COMPLETE** / Claude (backend + frontend, Bobby giao 2026-09-23; Q1–Q7 duyệt 2026-09-23) / [RF-01 packet](./research_loop/evidence/RF-01/README.md) · [P01–P05 audit](./research_loop/evidence/AUDIT_P01_P05_CLAUDE_2026-09-23.md): một route Atlas (`a0d0004d`), gate route sống (`e5daa7e2`), `retained_artifacts` sáu trạng thái authority→S03 (`c0166746`), codec `p02-cursor.v2` BE+FE (`c7cc1ceb`, `c9fcc7ba`), một mapper refusal + đường đăng nhập lại (`c9fcc7ba`, `50aaf532`); vitest 2957/1 skip, build, probe browser 87/87 ở 1280/660 (lane `PRODUCT_ROUTE_BROWSER_RECEIPT`, fixture); debt trong scope 0; addendum Thanhvuong đã ghi. Real-API receipt thuộc RF-02. |
| [RF-02](#rl-rf-02) | RF-01 | 02 · 12 · lane real-API | 03R | **RF02_COMPLETE · APPROVED_BY_BOBBY_2026-09-23 · REAL_API_E2E_RECEIPT 16/16** / Claude (backend + frontend; Q4–Q6 duyệt 2026-09-23) / [RF-02 packet](./research_loop/evidence/RF-02/README.md): Atlas facts có locator QuantBT 1.1.1 (`d67a0fb4`), walk-forward công bố + preflight một nguồn (`99d5b2a5`), S02 24/24 + `config_digest` (CG-P10-01, `996eef6c`), S12 theo spec 12 (`5d04e85a`, `ae5638b7`), stack preview cô lập `portal-research-preview` :8095 (`cb6d2c41`…`306ff249`), run thật đầu tiên COMPLETED, receipt real-API 16/16 ở 1280/660 (`770dfbcd`). Lane thật bắt 4 lỗi: P14 timeline (`12750366`, cần codex xem), câu refusal sai, số thập phân dài, bảng sr-only (`53bc7344`, `7de4c68f`). D-B1…D-B6 đã chốt theo uỷ quyền của Bobby (2026-09-23): D-B2 đã áp dụng, D-B1 thành bước DS-01 riêng; Bobby duyệt RF-02 ngày 2026-09-23 ("Duyệt"); danh sách lệch HiFi trong packet là checklist cho vòng sửa tiếp theo. Preview được đưa lên `research-portal.primusspark.com` (nginx đã cài; luật tunnel chờ Bobby). Chờ codex: CG-RF02-01…05. |
| [RF-03](#rl-rf-03) | RF-02 | nền · 00/02/03/05/12/14 | 03R | **RF03_CLOSED · 2026-09-25 · ONE_BOBBY_DECISION (`CG-RF02-01`)** / Claude (owner ≤P21 from 2026-09-24; Codex stopped, its P22 WIP parked on `codex/p22-wip-2026-09-24`) — every P01–P10 request DELIVERED with a commit in [request list](./research_loop/evidence/CODEX_REQUESTS_FROM_CLAUDE_P01_P10.md): W1 real Delta signal-notional WFO through P10→P06→P05 (`7009ddcb`, `0513fe29`; `CG-P10-02` Delta built-in, `CG-P05-01`, `CG-P06-03` measured), W2 live child progress (`CG-P06-02`, `CG-P10-04`, merge `1ee10002`), W4 P02/P04/P07/P08 contracts (merge `e5039ded`), `CG-RF02-02` proven in the worker image, P04 retained receipt fixed on the real stack. Open: `CG-RF02-01` narrow seccomp/AppArmor (host profile load needs Bobby) — blocks imported-source execution only. Evidence: [debt register](./research_loop/evidence/BACKEND_DEBT_P01_P21_CLAUDE_2026-09-24.md) · [W1 design + receipt](./research_loop/evidence/RF-03/W1_WFO_SPINE_DESIGN_CLAUDE_2026-09-24.md) · [W4](./research_loop/evidence/RF-03/W4_P02_P08_CLAUDE_2026-09-24.md) |
| [RF-04](#rl-rf-04) | RF-02; wave C theo từng contract RF-03 | 00/02/03/12/14 + nối 01/04–07 | 03R | **DELIVERED · BOBBY_REVIEW** / Claude — screens 00/02/03/12/14 consume every RF-03 contract: S03 W2 (`8df45ab6`), S02 v2 spec + gates + dataset catalog + `?from=` clone, S12 engine-sourced routes/OOS/claims, S14 16-row mirror + per-gate time (W4 `d957b087`). Real-API lane: see RF-06. Bobby reviews HiFi deviations listed in [W4 record](./research_loop/evidence/RF-03/W4_P02_P08_CLAUDE_2026-09-24.md) (engine-true OOS-use wording for mode_3/mode_4, L0 vs L2 event_lifecycle claim). |
| [RF-05](#rl-rf-05) | RF-03 | nền · 01/03/04/05/06 | 07R | **RF05_CLOSED · 2026-09-25** / Claude — every P11–P15 request DELIVERED with a commit in [request list](./research_loop/evidence/CODEX_REQUESTS_FROM_CLAUDE_P11_P15.md): W2 `CG-P11-03/06/07/08/09` ([record](./research_loop/evidence/RF-05/W2_P11_CLAUDE_2026-09-24.md)), W3 `CG-P13-05/07/08`, `CG-P14-02`, `CG-P15-03/04` + V11 DR receipt (exact decimal match with engine recomputation) ([record](./research_loop/evidence/RF-05/W3_P13_P15_CLAUDE_2026-09-24.md)). Debt registers P13–P17/RS-02/RS-03 corrected (GX). A12: [gate-ID mapping](./research_loop/evidence/RS-03/A12_GATE_ID_MAPPING_CLAUDE_2026-09-24.md), P13–P15 gaps closed by W3 except owner decisions DR-02 and Reveal. |
| [RF-06](#rl-rf-06) | RF-04 wave A; wave C theo RF-05 | 01/03/04/05/06 | 07R | **DELIVERED · REAL_API_E2E_RECEIPT · BOBBY_REVIEW** / Claude — screens 01/03/04/05/06 (+07/08 on WFO) read the retained lane for WFO runs: 14 display defects found on real screenshots fixed (W3b merge `28da9470`, [record](./research_loop/evidence/RF-06/W3B_WFO_LANE_SCREENS_CLAUDE_2026-09-24.md)). **REAL_API_E2E_RECEIPT 28/28** on the preview built from `4626448d` (images control-api `d51ec852`, worker `b20c94e8`, web `cb9dbc71`, last migration 062), fresh runs WFO `rrun_f558293c…` and P04 `rrun_f037e314…` both COMPLETED/READY: 16 P04 screen tests + 12 WFO tests S03–S08 at 1280/660, each WFO screen checked against the value the API served; screenshots reviewed by Claude. Bobby: HiFi deviation list in [audit §8–§9](./research_loop/evidence/AUDIT_P11_P15_CLAUDE_2026-09-24.md). |
| [P06](#rl-p06) | P03–P05 | nền/03 | 03 | TECHNICALLY_COMPLETE / Codex backend / [P06 evidence](./research_loop/evidence/P06/README.md): PostgreSQL logical-work/lease/outbox authority, real namespace-isolated QuantBT Delta child and retry/cancel/recovery proof are closed; no browser, named producer, NATS deployment or direct-submit cutover was introduced; FE_SCHEDULER_HARNESS_COMPLETE / Claude — scheduler harness +349 lines, full suite 2488 pass. `FE_COMPOSITION_RECOVERY_READY_FOR_CLAUDE`: attempt/queue panels may start now; producer/SSE/action activation remains P10/P11; FE_QUEUE_PANEL_COMPLETE / Claude — [composition](./research_loop/evidence/P06/frontend-composition-claude.md); **FE_COMPOSITION_RECOVERY_COMPLETE** / Claude — R1 closeout: no lease epoch/worker identity/work digest on the browser surface, boundary sweep + DOM probe |
| [P07](#rl-p07) | P03,P04,P06 | 14 | 04 | BACKEND_AND_CONTRACT_COMPLETE / Codex / [P07 evidence](./research_loop/evidence/P07/phase-report.md); private AST analysis, bounded source custody, seven ordered gates, immutable registry binding and ADMIN activation CAS are proven on a fresh disposable PostgreSQL cell. The five public same-origin operations and generated typed client are published. `may_activate` is required, caller-specific server admission and is evaluated by the exact same predicate as activation; **CG-P07-01 resolved**. All five Control API routes are registered with truthful P07/P09 ownership in the R2 capability inventory; **FD-P07-02 resolved**. · FE_SCREEN14_COMPOSITION_COMPLETE / Claude — Screen 14 is built against `@portal/contracts-research-alpha-import` with zero hand-written types or error strings; tsc 0, research suite 158/158, full frontend suite 158 files/0 failures, build 0 and browser probe 6/6 with 0 console output and 0 px overflow at 1280 and 660. `/research/quantbt/imports` is untouched; `ResearchAlphaAnalysis` is never imported, rendered or requested. No product route is mounted — P09 owns that — so the only render today is the labelled fixture lane. Screen 14 T07 (prefill Screen 02 from `av_`) is **NOT_RUN_BY_DESIGN**, explicitly owned by P10 New Run; it is neither a P07 pass nor a hidden failure. [Claude S14 composition](./research_loop/evidence/P07/frontend-composition-claude.md) |
| [P08](#rl-p08) | P03–P05 | 02/05 nền | 04 | BACKEND_AND_TYPED_CONTRACT_COMPLETE / Codex backend / [P08 packet](./research_loop/evidence/P08/README.md); bounded HMD private reader, shared immutable snapshot, requested→effective/fold/resource manifest, token expiry/freshness assertion and exact two-route same-origin OpenAPI are proven. No raw candle/holdout/worker path exists; generic Data Catalog routes cannot replay an opaque P08 snapshot ID. P10 owns server-side worker binding; rolling remains truthfully `RESEARCH_PREFLIGHT_TOPOLOGY_UNSUPPORTED` until a versioned manifest-owned train-width contract is approved, never inferred. · FE_PREFLIGHT_CONSUMER_COMPLETE / Claude — typed Screen 02/05 consumer from `@portal/contracts-research-preflight`, no hand-mapped field and no local payload parse: client +251, container +157, Screen 02 panel +471, Screen 05 boundary +282, tests +713, fixture lane +213, browser probe +100, boundary sweep +17/−1. `P08-T01…T12` all pass; tsc 0, research suite 198/198, build 0, browser probe 8/8 with 0 console output and 0 px overflow at 1280 and 660. `requested_spec_digest` is never sent (asserted on the POST body) and no digest is computed on the surface; any change to the requested spec drops the held token; EXPIRED/STALE/NOT_FOUND clear it rather than resending. Scope taken deliberately narrow: the eight-step declaration surface is P10's (the generated schema says the requested spec is producer-side, not a live endpoint), and Screen 05 renders the structural boundary only — purge, embargo, inner folds, θ* and the gap scan stay P14's and are named as absent rather than invented. **FD-P08-01 resolved:** both controller routes are declared in the R2 ledger and the full frontend suite is now exit 0. **CG-P08-01 resolved in P08 scope:** generated `may_create_run=false` is the explicit server fact until P10 publishes and rechecks its exact create predicate. The [browser/HIFI audit](./research_loop/evidence/P08/frontend-hifi-browser-audit.md) records a valid component-fixture receipt, not a product-route claim; P09/P10/P14 retain their route/screen ownership. [Claude P08 composition](./research_loop/evidence/P08/frontend-composition-claude.md) |
| [P09](#rl-p09) | P02,P04 | 00/12 | 05 | **P09_SCOPE_COMPLETE** / [P09 packet](./research_loop/evidence/P09/phase-report.md): Codex has proven two authenticated same-origin reads, revisioned immutable Journey descriptor, P02 inspection/cursor compatibility, bounded signed private Atlas adapter, generated declarations and R2 ledger. Claude has mounted S00 at `/research/quantbt/journey` and S12 at `/research/quantbt/atlas` inside exactly one QuantBT shell, with typed-only consumers and browser/HIFI receipts. **`CG-P09-01` resolved:** exact P04 axes, claim and evidence shapes are now generated rather than narrowed by frontend code. **`FD-P09-02` resolved:** S14's future canonical product route is `/research/quantbt/alpha-import`; legacy `/research/quantbt/imports` remains unchanged and `/research/alphas/import` stays unmounted while `ALPHA_POOL` is `COMMISSIONED`. **`S14-VIS-01` resolved:** three authority states (parse → seven gates → register/activate); Code anatomy is a presentation-only parse substage. `CG-P09-02` is an evidence-fixture improvement only: generated source fixtures are valid current evidence but must never become product truth. `FD-P09-03` remains correctly owned by P10: a preflight route requires its producer and remains `NOT ROUTED`, not `SOON`. The unrelated pre-existing visual-baseline drift is recorded in [Claude P09 composition](./research_loop/evidence/P09/frontend-composition-claude.md), not attributed to P09. |
| [P10](#rl-p10) | P06–P09 | 02 | 05 | **BACKEND_AND_TYPED_CONTRACT_COMPLETE / Codex** / [P10 packet](./research_loop/evidence/P10/README.md): exact server-owned P04 Delta binding, actor-scoped preflight re-admission, one durable intent before the signed Portal compatibility hop, isolated `quant.run.requested.research` subject and bounded P08 IS/OOS-only child are proven. Intake is **dark by default** at both services; no runtime/container/deploy change occurred. **FE_S02_PRODUCT_ROUTE_PENDING / Claude:** consume the generated same-origin client, preserve all HIFI controls and render typed current-adapter refusal; no fixture-only product receipt is claimed. · FE_NEW_RUN_MOUNTED / Claude — Screen 02 mounted at `/research/quantbt/runs/new` and Screen 14 at its canonical `/research/quantbt/alpha-import`, both inside the one QuantBT shell; legacy `/research/quantbt/imports` untouched. Typed only from `@portal/contracts-research-run-create` plus P08's `may_create_run`: composition +1156, tests +657, draft/validators/serializer +365, client +200, container +162, route +143, S14 route +43, probe +145, fixtures +12, and `atlasDocument.ts` **−70 deleted**. `P10-T01…T10` pass; tsc 0, research suite 275/275, full frontend suite **162 files / 0 failures**, build 0, product browser probe 21/21 with 0 console output and 0 px overflow at 1280 and 660 — including a real declare → preflight → create producing `QUEUED`. **One serializer** feeds preview, preflight and submit (a test asserts no second definition exists, and the probe compares the two request bodies); no untouched default is serialized and no digest is computed. The route grid is manifest-driven — a blocked route is drawn disabled with the engine's own sentence, read from the manifest at test time rather than hardcoded. `may_create_run` is rendered as display state and never gates submit, so a typed `CREATE_FORBIDDEN` is a normal atomic re-admission outcome; an unknown transport outcome is never retried, and the same `client_intent_id` is reused so the server answers `replayed`; an adapter refusal leaves rich route parameters exactly as declared. **`S14-VIS-01` confirmed on the product route**: three authority states, and a browser test asserts opening Code anatomy changes no control's enablement. **`CG-P09-01` fully closed**: `atlas.ts` now types from the contract the browser reads and the narrowing layer is gone. Four defects were found by reading the screenshots — a request for a run named `new`, a wizard bar hiding steps 1–2 behind a scrollbar, bare `×` and `PUBLISHABLE ·` separators with no value, and a pin claimed with no version bound. [Claude P10 composition](./research_loop/evidence/P10/frontend-composition-claude.md) Visual regression is **exit 1 — 33 failed / 299 passed**, identical by name to the pre-existing set measured at `cac85b43` (`comm` empty both directions), so P10 moves the baseline by zero tests. Open backend requests: **BR-P10-01** — a bound version's entrypoint, declared timeframes, `determinism.seed_required` and `parameter_space`, plus the release's trial ceiling, are not reachable from the browser, so four verbatim spec-02 validators and the sweep/pin table are inert on the product route (implemented and unit-tested, so they start firing the day the facts are published); **BR-P10-02** — the release manifest's optimizer defaults are unpublished, so §9's four grouped default tables render only their override map. · **BR-P10-01/02 consumed (2026-09-21):** the four Spec 02 validators now fire from `RegistryEntry.declaration` and `Atlas.current_release.trial_ceiling`, proven in the browser on the product route — the pin names the bound version and its declared entrypoint, the timeframe rule quotes the declared list, the ceiling quotes 4000 and the seed rule quotes the declaration. The declared parameter space is adopted, never invented, and no source/adapter/provenance field reaches the table. The `Infinity` fallback is deleted: every constraint is `null` until a response supplies it, the dependent check does not run, and a panel names exactly which facts were unread. All four `optimizer_defaults` groups render `RELEASE_DEFAULT · LOCKED` with no input on a locked row, and a test asserts the override map stays empty while they are on screen; `submission_constraints` is stated, not enforced, so the server's typed refusal stays authoritative. research suite 291/291, full frontend suite 162 files / 0 failures, tsc 0, build 0, product browser probe 23/23. Open: **CG-P10-01** — `client.config_digest` is required but unpublished, sent empty, and the browser may not compute one. Visual snapshots were not re-recorded and no threshold was widened. |
| [P11](#rl-p11) | P06,P09,P10 | 03 | 06 | **W2 DELIVERED · 2026-09-25** (Claude: `CG-P11-03/06/07/08/09`, live child channel `CG-P06-02`/`CG-P10-04`, merge `1ee10002`) — **BACKEND_AND_TYPED_CONTRACT_COMPLETE / Codex** / [P11 packet](./research_loop/evidence/P11/README.md): source-owned fsync journal + bounded recovery relay, exact P10/P06 lease ingress, immutable PostgreSQL event/snapshot materialisation, public fence-free same-origin BFF/SSE/console/cancel contract, 20-viewer cap and feature-dark overlay/runbook are proven. Fresh disposable PostgreSQL P10→P11 integration covers duplicate/gap/stale lease/restart/cancel-vs-seal; no deployment or real-run claim. **FE_S03_PRODUCT_CONSUMER_PENDING / Claude** — follow [P11 handoff](./research_loop/evidence/P11/frontend-handoff-claude.md); browser/HIFI/real activation gates remain unclaimed. · FE_RUN_PROGRESS_MOUNTED / Claude — Screen 03 mounted at `/research/quantbt/runs/:runId/progress` as a sibling of the legacy workspace (a P11 run id is not a legacy run). Typed only from the generated progress contract: composition +768, tests +731, container +382, client +217, route +35, probe +145, fixtures +32, boundary sweep +24/−2. `P11-T01…T10` pass; tsc 0, research suite 339/339, full frontend suite **163 files / 0 failures**, build 0, product browser probe 29/29 with 0 console output and 0 px overflow at 1280 and 660. **The stream is an accelerator, the poll is the floor:** a browser test deletes `EventSource` from the window and the screen still renders every block on the 5-second floor, with no banner. Seven stream exits are each tested — terminal snapshot never opens one; `run_completed`/`run_failed`, a typed gap, `auth.expired`, a transport error, unmount and a hidden tab all close it, and a gap replaces state from the snapshot rather than stitching the hole. A frame at or below the applied sequence is dropped. Nothing local makes a fact: a null `eta_s` renders 'not reported', completion requires `readiness.mandatory === "SEALED"`, decimals are printed unparsed, and a test asserts no `Date.now()` anywhere. `reader_href` is null by contract so a sealed artifact is rich and unlinked with the reason stated. No retry is offered — `P12_OWNED_NO_P11_RETRY_ROUTE` is printed instead; a cancellation CAS shows the Portal terminal truth without overwriting the source fact. The boundary sweep's blanket `EventSource` ban became a checked allowlist: one module may open one, it may contain no URL literal or scheme, and the client builds the URL from the contract's path. Two defects came from the screenshot — a running fold whose band collapsed to zero width (now bounded by the snapshot's own `updated_at_utc_ms`) and two disabled controls with no reason. **Fixture receipts only** — no worker ran; `V11-P11-DR/BR/GX`, a deployment and `PRODUCT_ACTIVE` are not claimed. **`CG-P11-01` / `CG-P11-02` resolved:** generated typed `fold_timeline` and `methodology_certificate` now carry exact source fact or explicit `NOT_PUBLISHED`; P04 remains one honest fold band/no cert until it publishes facts. See [display-fact amendment](./research_loop/evidence/P11/contract-amendment-display-facts.md). [Claude P11 composition](./research_loop/evidence/P11/frontend-composition-claude.md) |
| [P12](#rl-p12) | P05,P09–P11 | 01 | 06 | **P12_FEATURE_DARK_CLOSEOUT / Codex + Claude** — [backend packet](./research_loop/evidence/P12/README.md), [Claude Screen-01 composition](./research_loop/evidence/P12/frontend-composition-claude.md) and [current-head closure](./research_loop/evidence/P12/p12-closure-codex.md). P12 exposes only the bounded same-origin persisted-library/query/sparkline contract and remains feature-dark. Screen 01 is canonical at `/research/quantbt/runs`; the approved legacy reader is retained at `/research/quantbt/runs/legacy`. **P12-DEC-01 approved:** routing-only, reversible, no deletion/migration/runtime change; `runs/new`, `runs/:runId/progress` and `runs/:runId/*` stay disjoint. Claude's typed-only fixture receipt is retained; Codex reran the current-head P12 backend gate set: Control 23, generated contract 3, fresh tmpfs PostgreSQL 5, targeted S01/routes 50 and Control compile all pass. This re-proves P12-T08 and the backend portions of T09/T11; it does not replace separately labelled real-source/deployment evidence. **`CG-P12-01` is no new contract:** `claim_ledger` is truthful; `counters` are row-kind counts, so browser status census is not inferred. P10 config-digest, P09 canonical-fixture provenance and owner visual-baseline decisions remain explicitly out of P12 scope. No real-run/deployment/product-active claim is made. |
| [P13](#rl-p13) | P05,P09–P11 | 04 | 07 | **ASTRA_REMEDIATED · 2026-09-25 · RF-05 closed (W3 `2d186397`, W3b `28da9470`); open only owner decisions DR-02 and Reveal** — was AUDIT_REOPENED / 2026-09-22 — — [Astra checkpoint](#rl-p13-p17-audit). Retain the feature-dark immutable receipt/Hub/series foundation and [historical P13 evidence](./research_loop/evidence/P13/README.md). A01/A02/A04/A05/A07 and source-supported metric/envelope coverage need remediation; previous narrow-slice PASS does not close the original phase. FE S04 remains Claude-owned, pending named-contract integration and browser/real-API receipt. · FE_EVIDENCE_HUB_MOUNTED / Claude — Screen 04 mounted at `/research/quantbt/runs/:runId/evidence`, beside the approved legacy workspace rather than over spec 04's `/runs/{id}` root; **needs Bobby's acknowledgement** if the root is wanted instead. Screen 01's `open evidence →` is a link again. Typed only from `@portal/contracts-research-evidence` and `@portal/contracts-research-current-source`: composition +1494, tests +704, client +251, container +198, cursor +173, route +38, probe +291, fixtures +1343 — `git diff --stat` 16 files, +4541/−13. `P13-T01…T09` 42 tests pass; tsc 0, research suite 425/425, full frontend suite **165 files / 0 failures**, build 0, product browser probe **49/49** (9 of them S04) with 0 console output beyond the deliberately refused passport read and 0 px overflow at 1280 and 660. **Two contracts, two questions:** the P13 Hub is the spine (metric registry, Stage-5 claim, methodology certificate, stage timeline, four series links, declared absences); RS-02's retained passport is one lazy panel whose profile refusal stays inside that panel. **A series belongs to its revision** — one answered at another is discarded, the Hub reread and that series asked once more, then the panel states the mismatch rather than looping. Nothing is computed: exact decimal strings are printed as strings, tooltips print the string not the plotted number, the certificate is rendered and never recomputed from caps, and a claim string alone earns none. The hash cursor (spec 04 §3) is exported for 05–08: stage changes keep it, every change replaces rather than pushes, and `trial`/`params`/fold-count stay absent because no operation publishes them. **Three defects only the browser found:** the equity chart drew nothing (an axis array through a one-axis merge — now equity plus its underwater restatement, one response); the palette was ECharts' own blue and highlighter green (now chart-theme tokens, legend and zoom slider off); and two repo gates caught a hand-mixed rgba scrim and a disabled fold step with no reason. **Fixture receipts only** — no backend was called, no baseline re-recorded, no threshold widened; `REAL_API_E2E_RECEIPT`, the Astra A01/A02/A04/A05/A07 items and RS-03 journeys are not claimed. **Two focused requests to Codex:** `CG-P13-01` run identity on the Hub (status/binding/created/mode/schedule/route/config digest/seed for the spec §2.2 header) and `CG-P13-02` the fold plan (a fold count to bound the cursor, or sanction to read `researchCurrentSourceSplitGetV1` for it). Neither is worked around. [Claude P13 composition](./research_loop/evidence/P13/frontend-composition-claude.md) |
| [P14](#rl-p14) | P08,P10,P13 | 05 | 07 | **ASTRA_REMEDIATED · 2026-09-25 · RF-05 closed (W3 `2d186397`, W3b `28da9470`); open only owner decisions DR-02 and Reveal** — was AUDIT_REOPENED / 2026-09-22 — — preserve [P14 receipt](./research_loop/evidence/P14/README.md), UTC/source-digest/holdout boundaries and feature-dark defaults. A03 range-validation, warmup/data-use proof, supported fold mapping and S05 handoff require remediation. No unlock/strict-OOS/physical-I/O assertion is newly authorized. Original source/browser gates are not closed by the fixed smoke profile. · FE_SPLIT_MOUNTED / Claude — Screen 05 mounted at `/research/quantbt/runs/:runId/split`, on the shared evidence cursor so a reader arriving from the hub keeps their fold. Typed only from `@portal/contracts-research-split` and `@portal/contracts-research-current-source`: composition +741, tests +553, client +215, container +104, route +32, probe +131, fixture +110 — `git diff --stat` 18 files, +2434/−33 (includes consuming the P13 run-identity/fold amendment at `f8e2d8cf`). `P14-T01…T07` 28 tests pass; tsc 0, full frontend suite **166 files / 0 failures**, build 0, product browser probe **55/55** (6 of them S05), 0 console output beyond the deliberately refused retained-source read, 0 px overflow at 1280 and 660. **No boundary is computed:** the three windows and the holdout are placed on one axis by the single arithmetic that turns two published timestamps into an offset and a width, and a test asserts the screen contains no interval arithmetic at all. A sub-pixel window is floored to a hairline and badged rather than dropped. **The holdout is described, never opened:** it is `P08_METADATA_BOUND`, not SEALED — calling it sealed would assert a seal record the contract says it does not publish; evaluation, child-tape exposure and physical I/O stay three separate facts; the unlock affordance is a span, and a browser test clicks it and asserts no request leaves the page. **`NOT_ASSERTED` keeps its own word** for the strict outer-OOS selector, with no verdict badge. Actual folds come only from the retained-source split, whose profile refusal stays inside the fold panel. Four hi-fi elements are deliberately not drawn (seal wording, certificate-cap sentence, axis year ticks, protocol numbers) and each is recorded with its reason. **Fixture receipts only** — no backend called, no baseline re-recorded, no threshold widened; the Astra A03 items stay open for backend. **One request to Codex:** `CG-P14-01` — publish an axis tick set, or rule that generating axis labels from the timeline range is presentation rather than a computed boundary. [Claude P14 composition](./research_loop/evidence/P14/frontend-composition-claude.md) · **Re-audited 2026-09-23 (`bdeb0268`)** — published facts the first pass rendered nowhere are now on screen (provenance on all three deep dives; S05 `result_exposure_state`; S06/S07 `readiness`; S07 window `evaluation_state`, frozen `bound_state` and the verification's `freeze_revision`), spec copy corrected to verbatim where it is true and deliberately withheld where it is not, and the hard-refresh / keyboard-name / ETag checks each handoff requires are written. Suite 2920 passed, probe 74 passed. Open requests: [consolidated list](./research_loop/evidence/CODEX_REQUESTS_FROM_CLAUDE_P13_P16.md). · **`CG-P14-01`/`CG-P15-01`/`CG-P16-01` closed by Codex at `ccc4c6e5` and consumed at `c650307d`** — UTC axis ticks under the presentation ruling (with the required 1280→660 resize acceptance: labels thin, geometry, endpoints, legend and request count byte-identical), the candidate-selection metric rendered as the typed absence it is with the installed catalogue default asserted absent, and the verify result carrying its own `verification_scope` instead of the snapshot's. Suite 2928 passed, probe 77 passed. |
| [P15](#rl-p15) | P04,P05,P13,P14 | 06 | 08 | **CURRENT 2026-09-26 (Claude): W3/W3b delivered CG-P15-03/04 on the retained lane; DR-02 decided (W5a, one definition for 06/07). Open: WFO declared ranges + trial surface (B3), `pick=`/copy link (F4) — X2 in progress. See [audit P15–P23](./research_loop/evidence/AUDIT_P15_P23_CLAUDE_2026-09-26.md).** — **ASTRA_REMEDIATED · 2026-09-25 · RF-05 closed (W3 `2d186397`, W3b `28da9470`); open only owner decisions DR-02 and Reveal** — was AUDIT_REOPENED / 2026-09-22 — — [P15 fixed-run compatibility](./research_loop/evidence/P15/README.md) remains useful. A09: installed QuantBT WFO/optimizer artifacts are proven; missing Portal producer/retention/ledger integration is not a blanket engine source gap. Complete supported full-ledger/diagnostic contracts via RS-02; Claude keeps rich S06 composition and consumes generated facts. · FE_SEARCH_MOUNTED / Claude — Screen 06 mounted at `/research/quantbt/runs/:runId/search`, on the shared cursor, whose fold is sent as the contract's own `fold` selector. Typed only from `@portal/contracts-research-search` and `@portal/contracts-research-current-source`: composition +647, tests +488, client +207, container +107, route +32, probe +119, fixture +63 — `git diff --stat` 11 files, +1862/−2. `P15-T01…T06` 20 tests pass; tsc 0, full frontend suite **167 files / 0 failures**, build 0, product browser probe **61/61** (6 of them S06), 0 console output beyond the deliberately refused retained read, 0 px overflow at 1280 and 660. **A search that did not happen is not a search whose results are missing:** the Stage A / freeze line / Stage B geometry is kept, the installed source is labelled a fixed qualification rather than a switched-off optimizer, and the three absences stay three words — `NOT_APPLICABLE` (the question does not arise), `NOT_PUBLISHED` (it does and nothing answered), `NOT_ASSERTED` (nobody claimed it). The declared profile is the one panel with content: exact decimal bounds and a tick at the server's own `position_percent`, with a test asserting no arithmetic touches a declared bound. Nothing points at a trial — `selected_trial_ref` is null, so no best card, no pick, no jump-to-trial, no Freeze action — and no empty chart is drawn anywhere, because an empty axis reads as a study that found nothing. Two hi-fi elements are deliberately not built (the five-mode demo tape, the KaTeX objective formula) with reasons recorded. **One defect the browser found:** seven identical explanation paragraphs buried the per-panel reason codes; the rule is now stated once. **Fixture receipts only** — no backend called, no baseline re-recorded, no threshold widened; Astra A09 stays open for backend. **One request to Codex:** `CG-P15-01` — publish a typed `candidate_selection_metric` for a declared-not-executed request, or rule that none exists. [Claude P15 composition](./research_loop/evidence/P15/frontend-composition-claude.md) · **Re-audited 2026-09-23 (`bdeb0268`)** — published facts the first pass rendered nowhere are now on screen (provenance on all three deep dives; S05 `result_exposure_state`; S06/S07 `readiness`; S07 window `evaluation_state`, frozen `bound_state` and the verification's `freeze_revision`), spec copy corrected to verbatim where it is true and deliberately withheld where it is not, and the hard-refresh / keyboard-name / ETag checks each handoff requires are written. Suite 2920 passed, probe 74 passed. Open requests: [consolidated list](./research_loop/evidence/CODEX_REQUESTS_FROM_CLAUDE_P13_P16.md). · **`CG-P14-01`/`CG-P15-01`/`CG-P16-01` closed by Codex at `ccc4c6e5` and consumed at `c650307d`** — UTC axis ticks under the presentation ruling (with the required 1280→660 resize acceptance: labels thin, geometry, endpoints, legend and request count byte-identical), the candidate-selection metric rendered as the typed absence it is with the installed catalogue default asserted absent, and the verify result carrying its own `verification_scope` instead of the snapshot's. Suite 2928 passed, probe 77 passed. |
| [P16](#rl-p16) | P13–P15 | 07 | 08 | **CURRENT 2026-09-26 (Claude): A10a/b/c DELIVERED (W5a: byte-verify receipts, historical binding, 9×9 what-if + bounded job + sibling attempt; merge `f0a3bcd6`), T02/T11 closed (`06995a6f`). Open: CG-P16-02/03 (B4), θ* digest copy (F5) — X2. See [audit P15–P23](./research_loop/evidence/AUDIT_P15_P23_CLAUDE_2026-09-26.md) · [W5a](./research_loop/evidence/P16/W5A_A10_CLAUDE_2026-09-25.md).** — **AUDIT_REOPENED / 2026-09-22** — preserve [P16 partial binding verifier](./research_loop/evidence/P16/README.md); never relabel `PARTIAL_MATCH` as artifact integrity PASS. A10: expected-byte verification, historical bindings and supported diagnostic/reuse paths remain implementation work. P05/P11 foundations already exist. S07 FE/product receipt pending; no runtime activation. · FE_FREEZE_MOUNTED / Claude — Screen 07 mounted at `/research/quantbt/runs/:runId/freeze`, on the shared cursor. Typed only from `@portal/contracts-research-freeze` and `@portal/contracts-research-current-source`: composition +683, tests +600, client +215, container +140, route +34, probe +126, fixtures +143 — `git diff --stat` 12 files, +2138/−2. `P16-T01…T07` 23 tests pass; tsc 0, full frontend suite **168 files / 0 failures**, build 0, product browser probe **67/67** (6 of them S07), 0 console output beyond the deliberately refused retained read, 0 px overflow at 1280 and 660. **A match is only as wide as its published scope:** `PARTIAL` is rendered as `PORTAL_RETAINED_DIGEST_BINDING_ONLY` with that scope in words beside every mark, both digests are printed per check, the unattested source artifact bytes sit in the same panel as the matches, and a browser test asserts the screen never says chain intact. **`BLOCKED` empties the frozen table on purpose** and names the mismatched check with both digests. **One POST, from one click:** it carries the same-origin CSRF proof, cannot overlap itself, and rereads the snapshot only after the typed result — unit and browser tests both assert that mount, a fold-carrying hash, a fold change and repeated renders send nothing. What-if offers no control at all (`may_submit`/`may_create` pinned false), and `NOT_ASSERTED` ordering draws no verdict. Five hi-fi elements are deliberately not built, each recorded with its contract reason. **Fixture receipts only** — no backend called, no baseline re-recorded, no threshold widened; Astra items stay open for backend. **One request to Codex:** `CG-P16-01` — carry `verification_scope` on `FreezeVerification` itself so a re-read's result carries its own qualification. [Claude P16 composition](./research_loop/evidence/P16/frontend-composition-claude.md) · **Re-audited 2026-09-23 (`bdeb0268`)** — published facts the first pass rendered nowhere are now on screen (provenance on all three deep dives; S05 `result_exposure_state`; S06/S07 `readiness`; S07 window `evaluation_state`, frozen `bound_state` and the verification's `freeze_revision`), spec copy corrected to verbatim where it is true and deliberately withheld where it is not, and the hard-refresh / keyboard-name / ETag checks each handoff requires are written. Suite 2920 passed, probe 74 passed. Open requests: [consolidated list](./research_loop/evidence/CODEX_REQUESTS_FROM_CLAUDE_P13_P16.md). · **`CG-P14-01`/`CG-P15-01`/`CG-P16-01` closed by Codex at `ccc4c6e5` and consumed at `c650307d`** — UTC axis ticks under the presentation ruling (with the required 1280→660 resize acceptance: labels thin, geometry, endpoints, legend and request count byte-identical), the candidate-selection metric rendered as the typed absence it is with the installed catalogue default asserted absent, and the verify result carrying its own `verification_scope` instead of the snapshot's. Suite 2928 passed, probe 77 passed. · **P16 frontend review correction pending Codex source-capability disposition** — Thanhvuong S07 correction at `65a8acc5` (4 frontend files, +581/−96; product-route browser 82/82 on the workspace's own preview, fixture-backed); receipt, test/hook evidence and every P16-B request with `CG-P16-02`/`CG-P16-03` unchanged: [Thanhvuong review addendum](./research_loop/evidence/P16/thanhvuong-review-addendum.md). P16-B remains `SOURCE_CAPABILITY_BLOCKED`, not done. |
| [P17](#rl-p17) | P05,P11,P13,P16 | 08 | 09 | **CURRENT 2026-09-26 (Claude): A09/P17-B DELIVERED (W5b: signal-notional replay ledger, child audit T14, Reveal presentation-only, T17 at 32 folds; merges `8d7d9967`, `a3ff342f`); CG-P17-01…03 ANSWERED. Open: P04 hub replay fixtures (B6) — X2. See [audit P15–P23](./research_loop/evidence/AUDIT_P15_P23_CLAUDE_2026-09-26.md) · [W5b](./research_loop/evidence/P17/W5B_REPLAY_CLAUDE_2026-09-25.md).** — **AUDIT_REOPENED / 2026-09-22** — preserve [P17 retrospective-equity compatibility](./research_loop/evidence/P17/README.md). A05/A06/A08: revision coherence, ETag/cursor/deep-link and read-cost fixes; A09: retain/map actual route-supported outputs rather than waiting for an engine upgrade. No invented fills or execution state. Full route/FE acceptance remains open. Thanhvuong S08 frontend at `002e4098` (12 frontend files, +2182/−10; pushed to `primus-origin`, no PR; product-route browser 104/104 on the workspace own preview, API stubbed, 1280/660): [receipt](./research_loop/evidence/P17/thanhvuong-frontend-receipt.md), [backend requests](./research_loop/evidence/P17/thanhvuong-backend-requests.md) `CG-P17-01…03` OPEN, [test results](./research_loop/evidence/P17/thanhvuong-test-results.json), [implementation note](#p17-thanhvuong-frontend-implementation-note--screen-08-2026-09-23). P17-B remains `SOURCE_CAPABILITY_BLOCKED`, not done. |
| [P18](#rl-p18) | P13–P17 | 09 | 09 | **CURRENT 2026-09-26 (Claude): CG-P18-01…11 DELIVERED/DECIDED (W6a report v2 on both lanes, merge `33c46b84`); axis labels formatted (`03e1cf25`). Open: failed-run report, P18-T10, Parquet/Archive export, axe + print (B5/F6) — X2. See [audit P15–P23](./research_loop/evidence/AUDIT_P15_P23_CLAUDE_2026-09-26.md) · [W6a](./research_loop/evidence/P18/W6A_P18_P20_CLAUDE_2026-09-25.md).** — **BACKEND_AND_TYPED_CONTRACT_COMPLETE · FEATURE_DARK · S09_BROWSER_PRINT_PENDING_CLAUDE** — RS-01…03 acceptance is consumed only as the persisted P13–P17 input boundary. Immutable report + bounded JSON/CSV export are complete and proven in [P18 evidence](./research_loop/evidence/P18/README.md); no source rerun/artifact/file access, runtime activation or product receipt is claimed. Claude owns [S09 consumer/print](./research_loop/evidence/P18/frontend-handoff-claude.md). Thanhvuong S09 frontend at `548e8d29` (13 frontend files, +3004/−14; pushed to `primus-origin`, no PR; product-route browser 128/128 at `93a435bb` and on head `47165016` in the 2026-09-23 independent audit, then 129/129 at `29c28f4a` and 131/131 at `548e8d29`, workspace own preview, API stubbed, 1280/660, print Letter/A4; the two audit layout defects are fixed in `29c28f4a` — sr-only equity table no longer adds blank scroll/pages (Letter PDF 7 → 5 pages), table cells keep words whole; `548e8d29` makes the sheet follow the hi-fi geometry block by block, remaining deviations are only missing fields `CG-P18-01…07` (PDF Letter 5 → 4, A4 5 → 3) — `open_debt` empty): [receipt](./research_loop/evidence/P18/thanhvuong-frontend-receipt.md), [backend requests](./research_loop/evidence/P18/thanhvuong-backend-requests.md) `CG-P18-01…11` OPEN, [test results](./research_loop/evidence/P18/thanhvuong-test-results.json), [implementation note](#p18-thanhvuong-frontend-implementation-note--screen-09-2026-09-23). |
| [P19](#rl-p19) | P07,P10,P12,P15 | 10 | 10 | **CURRENT 2026-09-26 (Claude): CG-P19-01…14 closed (W6b lineage 1.1.0, merge `2b1243be`; DR-03 decided — pick written only by a governed approval of a sealed RC, writer = P22/Codex, typed NOT_PUBLISHED until then). Inbound links 02/04/07 (`1906dd85`). See [audit P15–P23](./research_loop/evidence/AUDIT_P15_P23_CLAUDE_2026-09-26.md) · [W6b](./research_loop/evidence/P19/W6B_P19_CLAUDE_2026-09-25.md).** — **BACKEND_AND_TYPED_CONTRACT_COMPLETE · FEATURE_DARK · S10_BROWSER_HIFI_PENDING_CLAUDE** — bounded persisted lineage, source-attested promotion-fact lane and generated client are proven in [P19 evidence](./research_loop/evidence/P19/README.md). No source-pick heuristic, UI receipt, deployment or product activation is claimed. Claude owns [Screen 10 handoff](./research_loop/evidence/P19/frontend-handoff-claude.md). Thanhvuong S10 frontend at `9c4afb18`, **aligned to hi-fi per Bobby 2026-09-24** (10 frontend files; pushed to `primus-origin`, no PR). History: product-route browser 107/117 at `30dcbdfc` (one 660 layout bug B1, fixed in `74f26200`), 119/119 at `74f26200`; an independent audit found A1 mono font, A2 loading/refusal layout, A3 403/404 badge, all fixed in `1fb29010` (134/134). R1 `c9dd195e` locks 7 visual points to the hi-fi (`VD-P19-01…07`: 4 lifecycle filters, bands in server order, wrapping chips, dot rail, promotion rule and rules verbatim, disabled probes toggle, collapsed cards). R2 receipt at `c9dd195e` (tree `46d101c0`): tsc 0, build 0, vitest 171 files · 3067 pass · 1 skip, S10 52/52 (+ boundary 66/66), whole Research probe 119/119 first pass (`--workers=1`), workspace own preview, API stubbed, 1280/660/dark, overflow 0 at 660, 120-attempt windowed tree, 16 filter combinations, GATES RESET 0 requests. R3 `9c4afb18` (tree `9f3f917f`) closes the last two spec-over-hi-fi exceptions on the hi-fi per Bobby 2026-09-24 (`VD-P19-02` bands in server order, SUPERSEDED above ACTIVE; `VD-P19-04` rail step 26px; spec T01/§9.2 differ, hi-fi wins): S10 52/52, vitest 3067 pass · 1 skip, whole Research probe 119/119 (`--workers=1`; first pass 117/119 only because the probe counted the legacy `/api/runs` 4 s poll, harness fixed, no src change). Field-driven cells stay open in `open_debt`; not `VERIFIED`, feature-dark, no `REAL_API_E2E_RECEIPT`: [receipt](./research_loop/evidence/P19/thanhvuong-frontend-receipt.md), [backend requests](./research_loop/evidence/P19/thanhvuong-backend-requests.md) `CG-P19-01…14` (11 WITHDRAWN, 13 OPEN), [test results](./research_loop/evidence/P19/thanhvuong-test-results.json), [debt register](./research_loop/evidence/P19/thanhvuong-debt-register.json), [rollback](./research_loop/evidence/P19/thanhvuong-rollback.md), [implementation note](#p19-thanhvuong-frontend-implementation-note--screen-10-2026-09-24). |
| [P20](#rl-p20) | P13,P15,P18,P19 | 13 | 10 | **CURRENT 2026-09-26 (Claude): CG-P20-01…12 DELIVERED/DECIDED (W6a, W5c `35bc34d8`); ~30 attempts fit at 660 (`80c79b10`). Open: VD-P20 copy items, back-refetch, axe — X3. See [audit P15–P23](./research_loop/evidence/AUDIT_P15_P23_CLAUDE_2026-09-26.md).** — **BACKEND_AND_TYPED_CONTRACT_COMPLETE · FEATURE_DARK · S13_BROWSER_HIFI_PENDING_CLAUDE** — [P20 evidence](./research_loop/evidence/P20/README.md) proves the bounded same-origin reader, exact raw-return correlation and operational cache. It does not claim a source rerun, product route receipt, deployment or activation. Claude owns [Screen 13 typed consumer/browser handoff](./research_loop/evidence/P20/frontend-handoff-claude.md). Thanhvuong S13 frontend `P20-A S13 frontend composed · PRODUCT_ROUTE_BROWSER_RECEIPT · pushed, no PR` at `eeeae14f` (tree `58f27644`; 6 code commits `92cdc844 → 0910ecc3 → f3d6169d → 009cedb8 → 034aef11 → eeeae14f` on `295901b7`, 10 frontend files +2900/−2; `eeeae14f` fixes independent-audit findings A1–A5, A8, A10). Canonical route `/research/quantbt/alphas/:alphaId/compare?mode=attempts\|markets\|pair&runs=`, spec route kept as resolver (unknown mode passed through to the server's 400); one generated GET `researchCompareGetV1` with ETag/304 (single-slot validator); REFUSED pair renders no hidden chart/table; correlation labelled `PORTAL_DERIVED`, absent never `0`; Δ labelled `B − A · as published` (server direction, `CG-P20-09`). Receipt at `eeeae14f`: tsc 0, build 0, vitest 172 files · 3094 pass · 1 skip, S13 + boundary 41/41, whole Research probe 162/162 (`--workers=1`), workspace own preview, API stubbed (no canonical compare fixture, `CG-P20-01`), 76 receipts (23 light gates + 15 dark gates, each at 1280/660) with overflow 0 / console 0 / mutation 0; dark-theme evidence exists only from this post-audit receipt. Hi-fi deltas recorded as `VD-P20-01…29` per Bobby 2026-09-24 (copy/layout points `REQUIRES_BOBBY_DECISION`, e.g. "two alphas", "engine-published", Δ direction; field-driven cells `03…06`). Baseline `72d2638b` not integrated (`3e7055d5` RunLibrary rewrite conflicts). Not `VERIFIED`, feature-dark, no `REAL_API_E2E_RECEIPT`, no axe, open implementation debt `S13-REFUSED-STATE-ATTR` / `S13-BACK-REFETCH` / `S13-DELTA-DIRECTION-LABEL`: [receipt](./research_loop/evidence/P20/thanhvuong-frontend-receipt.md), [backend requests](./research_loop/evidence/P20/thanhvuong-backend-requests.md) `CG-P20-01…11` (all OPEN), [test results](./research_loop/evidence/P20/thanhvuong-test-results.json), [debt register](./research_loop/evidence/P20/thanhvuong-debt-register.json), [rollback](./research_loop/evidence/P20/thanhvuong-rollback.md), [implementation note](#p20-thanhvuong-frontend-implementation-note--screen-13-2026-09-24). |
| [P21](#rl-p21) | P07,P16–P19 | 11 composer | 11 | **CURRENT 2026-09-26 (Claude): Screen 11 = Thanhvuong version (Bobby 2026-09-26); W7 retained lane DELIVERED (WFO 3/0/2/7 → 8/2/2/0, sealable; merge `0e9c23e2`); integration with P22/P23 `177df754`. Open: port W5c features + 8 P22 adapter defects + publish-intake flag (X1). See [audit P15–P23](./research_loop/evidence/AUDIT_P15_P23_CLAUDE_2026-09-26.md) · [W7](./research_loop/evidence/P21/W7_P21_RETAINED_LANE_CLAUDE_2026-09-25.md).** — **BACKEND_AND_TYPED_CONTRACT_COMPLETE · FEATURE_DARK · S11_PRODUCT_BROWSER_PENDING_CLAUDE** — Codex / [P21 packet](./research_loop/evidence/P21/README.md): same-origin bounded 17-field/12-item composer, actor-local declaration CAS, immutable Portal-local seal/pins and separate `NOT_DELIVERED`/`NOT_APPROVED` lifecycle are proven. No P22 publication, Approval mirror, Execution/QuantBT/source-byte call, deployment or browser acceptance is claimed. Claude owns [the S11 handoff](./research_loop/evidence/P21/frontend-handoff-claude.md). |
| [P22](#rl-p22) | P02,P10,P21 | 11 handoff | 11 | **BACKEND_REAL_PREVIEW_COMPLETE · PRODUCT_BROWSER_PENDING** — Codex / [P22 packet](./research_loop/evidence/P22/README.md): isolated historical-data WFO → sealed P21 pack → publication → unchanged R1 → independent owner approval → versioned settlement/promotion fact passed. Named alpha-version lookup, canonical mirror and two-route RC publication contract are generated. Claude still owns S01/S02/S10/S11 browser/HiFi acceptance; no dev/Production activation or P23 qualification is claimed. |
| [P23](#rl-p23) | P11–P22 | mọi màn | 12 | **CURRENT 2026-10-05 — QUALIFICATION_LEDGER_RECONCILED / READY_FOR_BOBBY_REVIEW**: [T01–T15 + positive sampler product receipt](./research_loop/evidence/P23/P23_QUALIFICATION_CLOSEOUT_2026-10-05.md). Actual isolated fixed-profile engine transition and linked-audit/consumer accepted; exact-three manifest exception owner accepted, strict83/86 unchanged. R-WFO-031: normal P08/P10 child/P05 COMPLETED/READY, S06 AVAILABLE 3trials/36calls, 22-file custody and1280/660 browser PASS. No unchanged load/DR rerun, rebuild, manifest/push/release/production action. **Historical prior board text (superseded only in the scopes above):** **LATEST 2026-10-04 / Codex:** S09/S11 explicit workspace + linked-audit consumer delivered; **285/285** affected FE tests, Node-22 web build and restored-proof **4/4 browser PASS**, unchanged jobs/frozen custody, QA/cell C4 complete. [Receipt](./research_loop/evidence/P23/WORKSPACE_AND_LINKED_AUDIT_CONSUMER_2026-10-04.md). Strict 83/86, genuine engine two and complete P24 remain OPEN. **Historical checkpoint retained:** **LATEST 128276d7 / 2026-10-03:** affected Report/RC 377/487 ms PASS; original non-reusable child + restart/restore accepted; exact QA/cell C4 done. New shared-workspace restored browser FAIL 404 → CG-P23-WORKSPACE-01, explicit same-actor reads 200. Strict historical 83/86, engine two and whole P24 remain OPEN. [Current receipt](./research_loop/evidence/P23/CURRENT_CANDIDATE_CLOSEOUT_AMENDMENT_2026-10-03.md). **Historical board snapshot:** **CURRENT 2026-10-03 / Codex: clean mixed-load 499/403 ms, coherent restore / exact loss accounting, independent WFO recomputation and QA teardown SCOPED_PASS. Full byte integrity, real second-engine, full current-product browser / candidate aggregation remain OPEN. [Latest P23/P24 matrix](./research_loop/evidence/P24/V1_ACCEPTANCE.md). Historical 2026-09-29 receipt scope retained below:** **OWNED REAL QUALIFICATION IN_PROGRESS · FULL_QUALIFICATION_PENDING (2026-09-29)** — Codex / [P23 packet](./research_loop/evidence/P23/README.md): P22 real publication closed. On one clean current image, exact W06 mixed HEAVY+four queued/20 principals passed twice at the original 500-ms warm SLO; T08 cold-start mixed and W07 bounded interaction also passed in scope. [W05 storage-only scale](./research_loop/evidence/P23/W05_STORAGE_SCALE_2026-09-29.md) measured 100k trial + 100k evaluation + 1M replay rows with indexed keysets and 823-MB seven-service peak; [V11-P23-DR](./research_loop/evidence/P23/V11_DIRECT_PARITY_2026-09-29.md) proved exact direct-engine/sealed/API parity for three real P04 facts. Earlier W06 failures remain history. T03/T04/T05/T06/T09/T10/T11 have scoped receipts; **T02 scratch, T07/T13 new-engine upgrade, T12 quota/audit, T14 exposure/audit-child, T15 browser-real and full DR/BR/GX remain OPEN**. No full P23/product/deployment acceptance or SLO relaxation. |
| [P24](#rl-p24) | P23 | mọi màn | 12 | **LATEST 2026-10-04 / v7:** [cinema/parameter closeout](./research_loop/evidence/P24/P24_CINEMA_CURRENT_SOURCE_CLOSEOUT_2026-10-04.md), [24 dispositions](./research_loop/evidence/P24/P24_REMAINING_SCENARIO_ACCEPTANCE_2026-10-04.md), [candidate v7](./research_loop/evidence/P24/current-source-candidate-manifest.v7.json): exact selected350 beyondpage100, immutable S03–S05 parameters, truthful sampler and centroid/no-trial; real audit GUI retry VERIFIED9fold/2508bars/optimizer0;439 affected FE cases. Current-source scenario slice READY_FOR_BOBBY_REVIEW; technical/refused/reused scopes remain explicit, not24enginePASS. QA4disabled/session0/C4complete. Local clean FF/helper preview only; owner visual/signed Portal2.0.0 remain separate. **Previous v6 checkpoint retained:** [candidate v6](./research_loop/evidence/P24/current-source-candidate-manifest.v6.json) / [actual closeout](./research_loop/evidence/P24/P24_CURRENT_CANDIDATE_CLOSEOUT_2026-10-04.md): affected reads56/56; actual Portal110→111→old reproduction3/3 and nine retained files verified; exact fixed imported GUI→one confined111 child→READY PASS with real config/byte equality; two-actor draft/actor-local CAS and late preflight/ACK PASS; publication ACK-loss/retry one intent/oneR1; post-child export/reference graph26/26 PASS. Archived Report companion-revision compatibility verifies all five source pins. Claude design/history preserved. Owner-approved exact-three exception keeps strict83/86. Remaining full24-scenario variants, owner visual review and signed release OPEN; no remote/shared preview/production operation. **Historical checkpoint retained:** [v4](./research_loop/evidence/P24/current-source-candidate-manifest.v4.json) restored-read scope; **128276d7 / 2026-10-03:** [v3](./research_loop/evidence/P24/current-source-candidate-manifest.v3.json) inherited P23 load/restore/rollback and C4; [P24 packet](./research_loop/evidence/P24/README.md) historical disposition matrix/checklist. Old engine/imported-GUI/manifest-approval blockers superseded only at the actual v6 scope. |

<a id="rl-fe-w1-w7"></a>
**UDB cross-loop upgrade board — planning approval only, 2026-10-10.**
Bobby giao ghi kế hoạch nâng cấp **cả Research và Execution Loop** vào Unified
trước khi duyệt triển khai. Thứ tự duy nhất: **UDB-01 → UDB-02 → UDB-03 → UDB-04**.
Các hàng này không mở lại hoặc thay kết quả lịch sử P01–P24; chúng bổ sung
điều kiện storage/identity/integration cho candidate mới. Chi tiết và phạm vi
phê duyệt tại [UDB addendum](#udb-upgrade-2026-10-10).

| Phase | Dependency | Màn | Checkpoint | State / implementer / evidence |
|---|---|---|---|---|
| [UDB-01](#udb-01) | Bobby duyệt UDB-01 2026-10-10 +bounded-gate refinement | Cả hai loop, nền identity/storage | UDB-1 | **PASS — PREVIEW_STORAGE_BASELINE** · 95/95 real-PG +7 config cases;8,969 changed-body writes/119 vacuum cycles/602.478s;custody unchanged,C4 done;[packet](./research_loop/evidence/UDB-01/README.md). No in-scope open debt;dev/stable/UI không đổi |
| [UDB-02](#udb-02) | UDB-01 PASS + Bobby giao 2026-10-10 | Execution read models + Research publication | UDB-2 | **PASS — ISOLATED_STORE_HYDRATED_PREVIEW** ·38/38 real-PG +7 config assertions;49,421 history/4,136 current entities,10-table parity;Core custody/independent restart/restore/rollback/C4 PASS;[packet](./research_loop/evidence/UDB-02/README.md). Retained activation/handoff hiện thuộc UDB-03 bên dưới |
| [UDB-03](#udb-03) | UDB-02 PASS + Bobby giao 2026-10-10 | Execution screens/subpanels, Research → RC → R1 | UDB-3 | **BACKEND_PASS / RETAINED_PREVIEW_REVIEW_READY / SCOPED_FE_CONSUMER_VERIFIED** · Claude13f64a3a/1c01aefb retained; Codex2026-10-11 session/failure/UTC refinement +4table owners,91targeted tests/typecheck +6affected browser cells and3explicit faults;222API/68old route gates reused only unchanged scope. No source/SSE/command/dev/stable;existing banner kept,no redesign/baseline change. [packet](./research_loop/evidence/UDB-03/README.md) · [consumer receipt](./research_loop/evidence/UDB-03/claude-consumer-receipt.md) · [review fixes](./research_loop/evidence/UDB-03/codex-consumer-refinement.md);UDB-04 mở riêng2026-10-11, không mở rộng verdict UDB-03 thành full acceptance |
| [UDB-04](#udb-04) | UDB-01…03 đạt + Bobby giao UDB-04 ngày 2026-10-11 (Asia/Saigon) | Cả hai loop + Governance | UDB-4 | **CROSS_LOOP_PREVIEW_READY_FOR_BOBBY_REVIEW** · final20realprincipals/1440full-bodyGET+64trialHEAVY/4queued: warm p95Library445/Progress224/Evidence327/Report265/CC448/Portfolio371/context265ms,500msSLO unchanged,HTTP/OOM0,hardcap4,536,870,912B.68browser/8Axe/4faultcases+32authcases/affectedfault/exportPASS;0bootstrap/stream,scopeddesign/baselinespreserved,realRC→R1workspace/reloadPASS.16MiBaggregate/2s/freshCoreauth unchanged;recovery69/69+27hashes reused only unchangedstorage/auth dependencies,83/86+exact3exceptions separate.23testidentities/20grants revoked,8services/5clonevolumes removed,remaining0;16Core/6Roadmapcustody unchanged,sixothercontainers unchanged. Normal-hook coherent commit required; image/COPY binding in [closeout](./research_loop/evidence/UDB-04/closeout-amendment.md) · [index](./research_loop/evidence/UDB-04/closeout-index.json) · [handoff](./research_loop/evidence/UDB-04/handoff.md). Prior FAILs preserved. No push/dev/main/stable/source/SSE/command/release;Bobby visualreview separate |

**Frontend board rows 2026-10-04 (FE campaign W1–W7, Claude/Thanhvuong; Codex slice marked):** sống tại [FE-W1-W5 packet](./research_loop/evidence/FE-W1-W5/thanhvuong-frontend-receipt.md); chi tiết ở [§13.4.2](#rl-fe-w1-w7-note). Mọi hàng dưới đây là `NOT_VERIFIED` ở mức sản phẩm cho tới khi Bobby rà bằng mắt; không hàng nào là `OWNER_ACCEPTED`.

| Phase | Màn | FE state | Evidence / blocker |
|---|---|---|---|
| P21 | 11 | **IMPLEMENTED · NOT_VERIFIED** (Claude). S11 gồm Codex `d5d09875` (blocked_action, stale-seal wording, rail ordinal, RC record absences) và `7d18fe4e` (workspace + linked-audit consumer, panel chỉ hỏi `/final-audit` cho `SINGLE_PARAMETER_SET`); nhánh `claude/fe-parity` đã rebase lên `be-gaps 0df6030f` | lane + gate 227/228 trên `index-Bu8sUwob.js` (1 ô là flake khi tải, 3/3 qua riêng); [receipt Codex](./research_loop/evidence/P23/WORKSPACE_AND_LINKED_AUDIT_CONSUMER_2026-10-04.md) |
| P22 | 11 handoff | **IMPLEMENTED · NOT_VERIFIED.** publish thật trên :8095 hai lần: R-WFO-027 `rc_06GG2K1TN6QQNJJN3RJ5AS5XC1` / `apr_06GG2K4A9Q3AHFVK0WV5GXNCY2` và run mới `rc_06GGABY3ZPCK8HWMA762Z327M1` / `apr_06GGAC00VHRN2Y9C34S55HEDC2`; `approval_read DENIED` có copy riêng; stale seal (R-WFO-022/023) một lối thoát `CREATE_NEW_RUN_AND_SEAL` | [journey receipt](./research_loop/evidence/P24/FE_JOURNEY_RECEIPT_2026-10-04.md); HiFi/owner chưa |
| P23 | mọi màn | **FE_QUALIFICATION_INPUT.** FE không thêm cờ/contract/migration; vitest 5918 pass/1 skip/340 file, tsc sạch, real-API + W1 + W5 gate 227/228, overflow 0 ở 390/360/1280/1440, axe 0 critical/serious/moderate | in thật trên thiết bị: `DEBT-PRINT-REALDEVICE` OPEN_LOW; baseline Research 28 + legacy 100 PNG |
| P24 | mọi màn | **Latest cinema/scenario slice:** v7 source-bound data-binding and all24 scoped dispositions delivered; focused tests/real API/browser/C4 accepted, no Claude design/golden changes. See current closeout above. Current-source unsupported/technical variants remain explicitly typed, not engine PASS. **T09/T13: READY_FOR_BOBBY_REVIEW** cho phạm vi GET/navigation của Claude (73 ô/682 kiểm = 613 PASS / 0 FAIL / 69 NA), không đổi thành full-product PASS. **LATEST:** [consumer](./research_loop/evidence/P24/P24_CONSUMER_FINISH_2026-10-04.md) real draft/CAS/late-response + exact fixed GUI child PASS; [engine](./research_loop/evidence/P24/P24_PORTAL_ENGINE_TRANSITION_2026-10-04.md) actual110→111/reproduce PASS; [write/export scope](./research_loop/evidence/P24/P24_SCENARIO_CLOSEOUT_2026-10-04.md) SC19 ACK-loss/retry + SC24 existing-child re-export/reference graph PASS. T12 keeps all24 rows and distinguishes actual/scoped/canonical/not-run. Historical full-scenario OPEN wording is superseded by the later24-row current-source disposition ledger, not blanket execution PASS. **Historical:** 1/24 PASS_REUSED, 21 NEEDS_RUN precedes these retakes. | [ma trận](./research_loop/evidence/P24/FE_SCREEN_ACTION_MATRIX_2026-10-04.md), [đối chiếu dữ liệu/bảo mật](./research_loop/evidence/P24/FE_RECONCILE_RECEIPT_2026-10-04.md), [pin FE](./research_loop/evidence/P24/FE_CANDIDATE_MANIFEST_2026-10-04.json), [amendment](./research_loop/evidence/P24/AMENDMENT_FE_2026-10-04.md); Codex §32/addendum supersede exactly proven findings, no blanket PASS |

**Frontend status 2026-09-30:** Claude's newer P15–P21 status and the remaining G1–G12 work are in [§13.4.1 G](#rl-open-ledger) and the [frontend gap evidence](./research_loop/evidence/FRONTEND_GAPS_STATUS_CLAUDE_2026-09-30.md); they supersede only the historical FE snippets in the rows above. The local P22/P23 backend acceptance rows and current P23 receipt remain authoritative. E11–E17 source/real-API closeouts below remain intact; the new E14 field record is linked from the frontend gap evidence.

**P23-T15 scoped addendum 2026-09-29:** [browser-real WFO/P04 receipt](./research_loop/evidence/P23/T15_BROWSER_REAL_SCOPED_2026-09-29.md) qua 1280/660 px trên cell riêng: causal prefix 100→1→2, deep link và chuyển run đúng, zero overflow/page error, jobs 155→155. Không có cold-cache/concurrent-WFO browser window và không rebuild exact HEAD; T15/F3/F5/OL-24/P23 vẫn OPEN.

**P23-T15 current-candidate addendum 2026-09-30:** [cold-cache/WFO/browser receipt](./research_loop/evidence/P23/T15_COLD_BROWSER_OVERLAP_2026-09-30.md) closes T15 on clean `b4e5d09b`: two viewport causal/deep-link/cross-run checks overlap one running WFO/four queued intents; 20 principals × 6 GET all 200, cold SLOs pass, seven-service peak 625,160,192 B < 5 GB. The preceding 2026-09-29 T15 `OPEN` line is historical; a warm-classified cold attempt remains FAIL and was not overwritten. No 500–600-ms warm relaxation was used. F3/F5/OL-24, T02/T07/T12/T13/T14, full DR/BR/GX, P23 and P24 remain OPEN.

**P23 F3/F5 scoped browser addendum 2026-09-30:** [exact-candidate read-only route and typed-refusal receipt](./research_loop/evidence/P23/F3_F5_SCOPED_BROWSER_2026-09-30.md) records S00–S14 deep-link 30/30 at 1280/660 and real S14-400/S02-403 visible refusals 4/4, jobs 173→173. This does not close F3 54/54 or F5's other browser/502/revocation gates; no frontend implementation, production runtime or SLO changed.

**P23 F5 auth-gate retake 2026-09-30:** [scoped browser receipt and F3 suite provenance](./research_loop/evidence/P23/F3_F5_SCOPED_BROWSER_2026-09-30.md) adds real 401 `SESSION_REQUIRED` to S02/S14 at both widths: 8/8 visible refusals on clean `64badfcc`, jobs 173→173, prior 4/8 harness-mismatch FAIL retained. AuthGate correctly shows Frame 01D rather than an in-panel alert. The existing nominal 54/54 suite still intercepts S11/S14 product APIs; it is not full real-API F3 evidence. F3/F5/OL-24/P23/P24 remain OPEN.


**F5/S14 scoped addendum 2026-09-29:** [S14 browser-real write receipt](./research_loop/evidence/P23/F5_S14_BROWSER_REAL_WRITE_2026-09-29.md) trên cùng cell riêng: cả 660/1280 px gọi bốn POST thật qua same-origin, parse 16 mirror rows, 7/7 gates PASS, DRAFT→ACTIVE và registry readback, jobs 155→155, overflow/page errors 0. Lượt thử 660 đầu tiên bị gate digest trùng từ chối đúng thiết kế; harness tạo artifact test riêng và giữ receipt lỗi. F5 đầy đủ, F3/OL-24, P23/P24 và exact-HEAD build vẫn OPEN; W06 đã pass 500 ms, không dùng nới 500–600 ms.

**F5/S02 scoped addendum 2026-09-29:** [S02 browser-real write receipt](./research_loop/evidence/P23/F5_S02_BROWSER_REAL_WRITE_2026-09-29.md) trên cell riêng cùng pinned image: 1280/660 px copy declaration P04 thật qua `?from=`, preflight 201, create 202, đúng một job mới/lượt và cả hai run `COMPLETED/READY`; preflight/create giữ nguyên SHA requested spec, lineage `CLONE_OF` đúng, overflow/page errors 0. Diagnostic dirty-source được giữ riêng và không tính acceptance. Positive S02/S14 write subgates có evidence; F5/FG-03 negative matrix, S00–S14 exact-HEAD lane, F3/OL-24, P23/P24 vẫn OPEN.

**F5 refusal addendum 2026-09-29:** [S02/S14 real API negatives](./research_loop/evidence/P23/F5_NEGATIVE_API_MATRIX_2026-09-29.md) trên cùng cell sạch: 10 trường hợp typed 400/401/403/404/409, stale activation không đổi DRAFT/revision, jobs 158→158; preflight quota sẵn có trả 503 ở lượt 9, actor độc lập vẫn 201, không compute. Đây là API subset, chưa phải browser refusal receipt; không có 502 nguồn thật, chưa revoke identity test và chưa đóng F5/FG-03/P23/P24. Cell đã dừng, volumes/evidence giữ lại; không đổi dev/prod.

<a id="rl-open-ledger"></a>
### 13.4.1. Sổ việc còn mở — một nguồn trạng thái duy nhất (Claude, 2026-09-26)

**P23 current-candidate supersession 2026-09-30:** Bobby explicitly approved Codex backend-only repairs in the formerly Claude-owned supervisor scratch and shared utility admission paths, preserving API/UI and lease/fencing. [Exact clean-cell T02/T12 receipts](./research_loop/evidence/P23/T02_T12_SOURCE_CLOSEOUT_2026-09-30.md) supersede the historical `CG-P23-T02-01` OPEN row below: **T02 PASS**, nine real WFO terminals, unchanged scratch. They also supersede the historical `CG-P23-T12-02` no-quota source claim: typed shared quota negative/recovery and the real primary + audit-reuse/what-if/verify/export overlap **PASS for the currently eligible WFO reuse profile**. A non-reusable frozen selection still requires a genuine pinned linked audit child or typed `NOT_PUBLISHED`; this candidate does not certify that profile. P23/P24 remain OPEN. No remote push or deploy.

Bobby (2026-09-26): mọi kế hoạch/request còn thiếu phải nằm ở đây để track. Mục này **thắng** các
đoạn lịch sử cũ trong §13.5, README phase, file request và debt register khi chúng nói khác —
những đoạn đó giữ lại làm lịch sử, không phải trạng thái. Code base: `080baf5d`
(W1–W7, X1, X2 + P22/P23 Codex/Thanhvuong đã gộp). Nhận xét backend của Codex ngày 2026-09-26 đã
được Claude đối chiếu với code; cột "Đối chiếu" ghi đúng/sai.

**Phân vai để không conflict:** Claude giữ ≤P21 (frontend + backend) và toàn bộ màn 00–14;
Codex giữ P22–P24 backend/runtime (publication, Governance/RunSync, qualification, release).
Codex làm trong worktree riêng, không sửa file màn Research hay service ≤P21 — cần gì thì ghi
request vào bảng dưới. Dòng board P01–P21 do Claude cập nhật, P22–P24 do Codex. Artifact sinh ra
(contracts snapshot, route ledger, R2 inventory, M0) luôn sinh lại khi merge, không sửa tay.
Migration: Claude 064–069, Codex 063 (P22, đã dùng) và ≥070. Merge vào
`docs/research-loop-plan` thường xuyên; không ai giữ commit chưa push quá một phiên.

#### A. Backend còn mở

| Id | Việc | Đối chiếu nhận xét Codex | Chủ | Điều kiện đóng |
|---|---|---|---|---|
| OL-01 | Imported/DRAFT exact-profile execution | **ISOLATED BACKEND + CONSUMER ACCEPTED, 2026-09-27.** Host has `portal-research-child (enforce)`; owned worker uses it, three DRAFT runs complete with fenced source/retention. Exact identity/hash/engine-pin consumers pass at 1280/660. Production stack was not activated and defaults remain false. | Codex approved integration · Bobby/ops Production rollout | [E17 backend receipt](./research_loop/evidence/P10/E17_IMPORTED_DRAFT_EXECUTION_BACKEND_RECEIPT_2026-09-27.md) + [final 30-cell proof](./research_loop/evidence/P17/E11_E17_INTEGRATION_ACCEPTANCE_2026-09-27.md). No Production activation claim. |
| OL-02 | P16 `source_artifact_bytes` trên lane GET | **CLOSED owned runtime, 2026-09-27.** Explicit public verify + real private observer produces six durable MATCH/MISMATCH/repeat/restore receipts; original artifact tree and seal unchanged, only test copy corrupted. GET still does not reopen bytes; no production claim. | Codex approved qualification | [Exact actual evidence](./research_loop/evidence/P23/RECOVERY_INTEGRITY_RUNTIME_CHECKPOINT_2026-09-27.md) |
| OL-03 | P19 writer cho promotion pick (`CG-P19-10`, DR-03) | **CLOSED — Codex P22.** Approval thật `PENDING@1 → APPROVED@2` append settlement và ghi đúng một `attempt_promotion_pick_facts_v1`; reread không nhân đôi. | Claude consumer | S10 render fact thật theo [`P22 real receipt`](./research_loop/evidence/P22/real-preview-receipt.json). |
| OL-04 | `CG-P22-02` — exact sealed final-audit `rrun_` vào existing `public.run_read_models` | **CLOSED — Codex P22.** Narrow security-definer bridge + immutable receipt; runtime không có direct DML. | — | Publish thật không còn `P22_GOVERNANCE_SOURCE_UNAVAILABLE`/`RUN_NOT_MIRRORED`. |
| OL-05 | Isolated P22 preview and real WFO → P21 seal → existing R1 | **CLOSED — Codex P22.** Namespaced stack, no shared `:8095`, dev or Production mutation. | — | Structured receipt retained in P22 packet. |
| OL-06 | `CG-P22-01` — methodology claim bound to sealed P21 pack/run | **CLOSED — Codex P22.** Claim is server-derived from the immutable pack binding. | Claude consumer | No browser claim selection when only one exact claim exists. |
| OL-07 | Canonical Governance mirror truth | **BACKEND CLOSED — Codex P22.** Raw/effective status, quorum, version, decisions, blockers, conditions, `created_at` and RC relation map canonically. Assignee pool is a typed `NOT_PUBLISHED`, not a fabricated team. | Claude consumer | S11 renders generated fields and typed absence. |
| OL-08 | Canonical Governance approval-create/detail fixture | **CLOSED — Codex P22.** Generated fixture and focused tests cover success/replay/refusal/conflict. | — | Contract gates green. |
| OL-09 | `conflicting_approval_href`, `details.downstream_code` | **BACKEND CLOSED — Codex P22.** Both remain typed server-owned fields. | Claude consumer | S11 preserves both fields. |
| OL-10 | Capability/route ledger | **CLOSED — Codex P22.** R2 inventory, generated route inventory and contract snapshot include the canonical P22 surface. | — | Gates green. |
| OL-11 | Canonical RC publication route model | **CLOSED — Codex P22.** Exactly `GET …/publication` + `POST …/publish`; mirror is embedded and reconcile is server-owned. Historical contributor notes are explicitly superseded, not erased. | Claude consumer | No product client calls old routes. |
| OL-13 | Named publication/approval read by `alpha_version_id` | **BACKEND CLOSED — Codex P22.** `researchAlphaVersionPublicationGetV1` returns current RC relation or typed absence; real lookup is `AVAILABLE`. | Claude consumer | S01/S02 render it without scanning RCs. |
| OL-12 | P23 qualification: `CG-P23-01` (stack cô lập + cgroup 5 GB), `-02` (cô lập MinIO/file/export/cache), `-03` (corrupt-part, restore, kiểm hash/pin), `-04` (Research không ảnh hưởng Execution), `-05` (lane regression Python/QuantBT 1.1.1); T01–T15, fault/restore/upgrade/cold-cache | **LATEST 128276d7 / 2026-10-03:** affected Report/RC p95 377/487 PASS; original pinned non-reusable child/P05 ACK/Report–RC–Lineage/restart/restore and exact cleanup accepted. Shared-workspace browser consumer FAIL 404; full DR 83/86, qualified engine two and whole P24 remain OPEN. [Later scoped amendment](./research_loop/evidence/P23/CURRENT_CANDIDATE_CLOSEOUT_AMENDMENT_2026-10-03.md). **Historical board snapshot:** **IN_PROGRESS, 2026-09-27.** Clean application `b2e8b868`: 20 readers/one HEAVY/four queued, six SLOs PASS (Library **490 ms**), 618209280-byte peak, zero implicit jobs. T11 backend/API far-seek on pinned `19a8e813` PASS: 20 readers/140 GET, signed deep Library/replay cursors, real `at`/`before`, jobs 37→37, 24 cgroup samples/429371392-byte peak; T15 browser remains separate. T04 now PASS on the clean pinned cell: bounded PG refusal/recovery without Control API restart, same-intent run resumes after NATS/worker outage, original archived source/auth unchanged and all seven services restored. F4/E10 and OL-02 actual recovery/integrity PASS. T12 utility scoped PASS (81 cells/63 evaluations, eight exports/six verifies) but quota/audit remain. T14 real APPROVED R1→one promotion pick, revoked temporary grant, nonempty null-trial RC pin and fresh-volume restore **139 tables/16 artifacts/127 parts/753 files**, worker-off reads PASS; exposure and audit-child cases absent, so T14 PARTIAL. T02 scratch growth, T05 cache/ETag and other T gates remain OPEN. | Codex | [T04 clean fault](./research_loop/evidence/P23/T04_CLEAN_FAULT_CHECKPOINT_2026-09-27.md) · [T11 far-seek](./research_loop/evidence/P23/T11_FAR_SEEK_CHECKPOINT_2026-09-27.md) · [T14 graph/restore](./research_loop/evidence/P23/APPROVAL_GRAPH_RESTORE_CHECKPOINT_2026-09-27.md) · [P23 matrix](./research_loop/evidence/P23/phase-report.md); no full P23/P24 claim from this subset |
| CG-P23-T02-01 | Shared <=P21 supervisor scratch lifecycle, discovered by W08 | **OPEN, 2026-09-27.** Six real terminal complete/fail/cancel jobs leave **+42 files/+1006525 bytes**; not a proven RAM leak. Exact Node probe/natural token-expiry pacing repaired in qualification tool. | Claude source repair; Codex runtime retake | Lease/fencing/once-only and output/audit retention preserved; three corrected real rounds meet fixed gates. [Reproduction, source locators, requirements and hashes](./research_loop/evidence/P23/PLATEAU_CHECKPOINT_2026-09-27.md). Other P23 gates proceed. |
| CG-P23-T05-01 | Shared <=P21 read cache policy and browser-visible ETag revalidation | **BACKEND SOURCE + SCOPED RUNTIME PASS, 2026-09-29.** Clean `eae7a40d`: 10/10 named owner/nonmember/anonymous reads and 12/12 existing JSON/CSV export status/download GETs meet authority and private cache checks; weak-ETag revalidation works. Full T05 remains OPEN for remaining file/object/legacy-path classification and negatives. | Codex approved shared backend repair + owned retake | [Current runtime receipt](./research_loop/evidence/P23/T03_T05_RUNTIME_RETAKE_2026-09-29.md); original failed receipt retained. |
| CG-P23-T12-01 | Explicit pinned selection-audit admission | **OPEN, 2026-09-28.** Existing run-create contract has no `AUDIT_OF_SELECTION` write; retained child-audit GET is not creation. `AUDIT` enum/read projection alone cannot satisfy P23-T12. | Claude ≤P21 source; Codex owned runtime retake | Exact authenticated/idempotent child/job from pinned θ*, shared budget/fencing; no optimizer reselection; typed source absence if impossible. Generated contract, negative tests and one real child receipt. [T12 source/running evidence](./research_loop/evidence/P23/T12_ADMISSION_QUOTA_CHECKPOINT_2026-09-28.md). |
| CG-P23-T12-02 | Shared bounded utility admission for export/verify beside primary | **OPEN, 2026-09-28.** Real preflight quota negative PASS (8×201, 9th typed 503, independent member 201, jobs unchanged, 391532544-byte peak), but it is not a utility quota. What-if is one-per-parent/81-eval bounded; export has per-actor/run/revision/format dedupe and 512-KiB output cap without shared pending-work ceiling; explicit verify calls private observer without measured concurrent admission. | Claude ≤P21 source; Codex owned runtime retake | Add minimum existing-model actor/aggregate utility bounds and typed saturation/timeout; test audit/what-if/verify/export against active primary under 5 GB, no API-process engine bypass. [Exact code locators + real private receipt hash](./research_loop/evidence/P23/T12_ADMISSION_QUOTA_CHECKPOINT_2026-09-28.md). |
| CG-P23-T03-01 | Typed disk-full across Research artifact write/seal | **BACKEND SOURCE + SCOPED RUNTIME PASS, 2026-09-29.** Clean `d4021790` on disposable 64-MiB ext4: append and 128-document manifest at zero free both return RESEARCH_ARTIFACT_DISK_FULL; original sealed SHA unchanged, staging zero, recovery seal succeeds. Focused worker terminal maps RESOURCE_EXCEEDED without private path. Full P06 durable-run/API disk-full negative is still missing; T03 remains PARTIAL. | Codex approved shared backend repair + owned retake | [Current runtime receipt](./research_loop/evidence/P23/T03_T05_RUNTIME_RETAKE_2026-09-29.md); original failing checkpoint retained. |
| CG-P23-T08-01 | Run Library warm 20-principal p95 regression during isolated cold-cache qualification | **CLOSED IN CURRENT-CANDIDATE SCOPE, 2026-09-29.** Approved P12 bounded identical-page coalescing and P13 transaction-trip reduction preserve membership/RLS, one-snapshot truth, API/UI, admission 2/18 and the original 500-ms warm SLO. Exact clean-image W06 twice returned 120/120 GET 200 with Library/Evidence p95 363/445 and 405/305 ms under one real WFO/four queued. Same-image cold GET-only and guarded cold-start mixed also pass, the latter at 414/404 ms with 617,881,600-byte peak. Earlier 709/815, 655/666 and 527/618-ms failures remain linked; no statistical all-host guarantee is asserted. | Codex approved backend-only repair + isolated runtime retakes | [W06 source/image/receipt hashes](./research_loop/evidence/P23/W06_INFLIGHT_BATCH_CHECKPOINT_2026-09-29.md#current-88be2acd-candidate--two-clean-mixed-retakes) · [T08 cold and two setup refusals](./research_loop/evidence/P23/T08_COLD_CACHE_CHECKPOINT_2026-09-28.md#current-candidate-cold-start-mixed-retake--2026-09-29); full P23 remains OPEN. |
| CG-FG-P22-01 | `details.downstream_code` ghi ở CO:39 không có trong `Problem` đã sinh (GEN:209–215); `downstream_code` nằm top-level `PublicationResponse` (GEN:176) — thêm field hoặc sửa câu CO | **OPEN — request mới 2026-09-28, chưa có nhận xét Codex.** Khác cách đọc OL-09 ("both remain typed server-owned fields"): field có, nhưng không ở vị trí CO:39 nói. FG-05 in `downstream_code` top-level | Codex | Commit contract hoặc sửa CO:39; FE đổi binding nếu cần + unit + fixture receipt. [Packet](./research_loop/evidence/FG/FG-backend-requests.md) |
| CG-FG-S02-01…02 | S02: cert ceiling theo mode × schedule trên foundation/atlas read; số bar theo cửa sổ IS/OOS/holdout | **OPEN — request mới 2026-09-28.** FE giữ typed absence "cert ceiling not published" / "not declared" | Codex | Field additive + OpenAPI + generated d.ts + contract fixture; FE bind + unit + fixture receipt, rồi real receipt khi có cell. [Packet](./research_loop/evidence/FG/FG-backend-requests.md) |
| CG-FG-S03-01…04 | S03: fold dự kiến + tổng; 4 methodology claim; "study N of M"; artifact manifest theo run | **OPEN — request mới 2026-09-28.** Typed absence / chỉ fold đã report | Codex | Như trên. [Packet](./research_loop/evidence/FG/FG-backend-requests.md) |
| CG-FG-S04-01…07 | S04: 7 field claim strip; dataset coverage; `EQUITY_IS`; per-fold metrics; benchmark/rolling/distribution; cert cap theo stage; số đếm window disclosure | **OPEN — request mới 2026-09-28.** Typed absence có reason (`source_absences`) | Codex | Như trên. [Packet](./research_loop/evidence/FG/FG-backend-requests.md) |
| CG-FG-S05-01 | S05: `SplitGuards.train_test_disjoint` (verdict + basis) | **OPEN — request mới 2026-09-28.** Hiện FE tự vẽ ✓ (FE_GAP P2 05-15, debt) | Codex | Như trên; FE đổi ✓ thành typed absence tới khi có field. [Packet](./research_loop/evidence/FG/FG-backend-requests.md) |
| CG-FG-S06-01…06 | S06: `selector_confidence`; `Parameter.levels` P04; `surface.grid`; publish `surface.interactions`; `pool.frozen_at_utc_ms`; `Trial.seed`/`params_digest` | **OPEN — request mới 2026-09-28.** Typed absence | Codex | Như trên. [Packet](./research_loop/evidence/FG/FG-backend-requests.md) |
| CG-FG-S08-01…03 | S08: `FoldSegment.params_digest`; `candle_windows` replay P04; `execution.counts` P04 | **OPEN — request mới 2026-09-28.** Typed absence / không tile trên P04 | Codex | Như trên. [Packet](./research_loop/evidence/FG/FG-backend-requests.md) |
| CG-FG-S09-02 | S09: `EquityV2.digest` + artifact path (`CG-FG-S09-01` đã gộp vào `CG-FG-D1-O1`) | **OPEN — request mới 2026-09-28.** Caption không digest | Codex | Như trên. [Packet](./research_loop/evidence/FG/FG-backend-requests.md) |
| CG-FG-S10-01…04 | S10: `PromotionPick.param_set_id`/`selected_trial_id`; `AttemptNode.lineage_status` + `superseded_by_attempt_id`; `RunFacts.claim.family`; (có điều kiện `VD-FG-01-18`/`-21`) `alpha.default_market/default_timeframe`, `counts.promotion_*` | **OPEN — request mới 2026-09-28.** S10-02: FE đang tự suy status (LD:195–210), ghi debt | Codex (+Bobby cho S10-04) | Như trên; S10-04 chỉ mở sau owner decision. [Packet](./research_loop/evidence/FG/FG-backend-requests.md) |
| CG-FG-S11-02…03 | S11: `selected_params.param_set_id` + `selected_trial_number`; (Bobby trước, `VD-FG-01-26`) `PackResponse.claim_ceiling/engine_cert/counts` (`CG-FG-S11-01` đã gộp vào `CG-FG-D1-O1`) | **OPEN — request mới 2026-09-28.** Rail in digest bundle + kind; chip pack typed absence | Codex (+Bobby cho S11-03) | Như trên. [Packet](./research_loop/evidence/FG/FG-backend-requests.md) |
| CG-FG-S12-01…02 | S12: contract fixture atlas `HISTORICAL` (`atlas: null` + `historical_identity`); từ vựng `CandidateSelector.mode` khớp atlas | **OPEN — request mới 2026-09-28.** Fixture e2e lệch union (FG-07 T8) | Codex | Fixture contract + test; FE sửa fixture e2e + fixture receipt. [Packet](./research_loop/evidence/FG/FG-backend-requests.md) |
| CG-FG-S13-02 | S13: `certification.grade` trên compare (`CG-FG-S13-01` đã gộp vào `CG-FG-D1-O1`) | **OPEN — request mới 2026-09-28.** Typed absence `P20_NO_SOURCE_PUBLISHES_A_CERTIFICATION_GRADE` | Codex | Như trên. [Packet](./research_loop/evidence/FG/FG-backend-requests.md) |
| CG-FG-S14-01…04 | S14: tên CSRF header trong contract; `may_activate_reason`; `may_create_run` theo version; `total`/cursor registry | **OPEN — request mới 2026-09-28.** Client giữ header hiện tại; FE nêu lý do ADMIN (debt 14-11); lọc client | Codex | Như trên. [Packet](./research_loop/evidence/FG/FG-backend-requests.md) |
| CG-FG-D1-O1 | `display_label` trên Report S09, RC compose/pack S11 và Compare S13; gộp S09-01/S11-01/S13-01 | **BACKEND + REAL-API FIELD DELIVERED; FE DATA-BINDING + UNIT + SCOPED COLD BROWSER PASS (2026-09-29).** Named reads trả nhãn canonical hoặc `null`; FE tiêu thụ đúng read, không tính ordinal. Focused S09/S11/S13 + registry 204/204, typecheck pass; exact-HEAD isolated P23 Chromium 5 cold deep links pass, 0 page errors, 0 implicit jobs; chưa phải full F3/P23. | Codex BE + FE logic; Claude/Thanhvuong visual acceptance | F3 exact-candidate lane và visual acceptance vẫn riêng; `null` fallback có unit coverage. [Backend packet](./research_loop/evidence/FG/FG-backend-requests.md#2-cg-fg-d1-o1--display_label-trên-ba-named-read-s09--s11--s13) · [FE receipt](./research_loop/evidence/FG/D1_O1_CLIENT_BINDING_2026-09-29.md) |
| CG-FG-R2-01 | R2 capability inventory: evidence của route `INTENTIONALLY_UNEXPOSED` `POST /internal/research/progress/sources/imported` (`capability-inventory.v1.json:1628–1637`) phải nêu lý do, hoặc nới regex của `src/execution/r2Ledger.test.ts` | **OPEN — request mới 2026-09-29.** Fail duy nhất của full suite frontend slice 2 (3930 test: 3928 pass / 1 fail / 1 skip); kế thừa từ `5a5c79b7` (tổ tiên của base `8783461e`, không của baseline `a00df203` nơi test pass 22/22). Đính chính slice 1: không phải "thiếu route P22" (`CG-P22-C`) | Codex (Bobby duyệt) | `npx vitest run src/execution/r2Ledger.test.ts` xanh, rồi full suite xanh; FE không sửa ledger. [Packet](./research_loop/evidence/FG/FG-backend-requests.md) §7 |

**OL-12 / T08 current addendum (2026-09-28):** [Exact owned cold-cache
checkpoint](./research_loop/evidence/P23/T08_COLD_CACHE_CHECKPOINT_2026-09-28.md)
proves 20-principal/six-route first-read cold SLO with isolated PostgreSQL and
artifact pagecache driven to zero, 423473152-byte capped peak and no shared
container restart. T08 remains **PARTIAL**: warm Library p95 709/815 ms exceeds
the 500-ms target and the cold reader was not simultaneous with a HEAVY+four
queued W06. No ≤P21 source change or threshold relaxation was made. Codex
profiles the Library/admission path and coordinates any source fix with Claude;
final-candidate W06/cold retake and P23/P24 remain required.
Follow-up on the unchanged pinned cell reproduced unmonitored warm Library p95
at 606/692/765 ms for 20 distinct principals (all HTTP 200). The last run is
private byte-hashed; a separate aggregate-only DB sampler found no sampled
lock wait but is diagnostic, not an acceptance result or root-cause proof.
The exact <=P21 owner handoff and source locators are appended to the T08
checkpoint; no admission limit, snapshot/RLS semantics or SLO was changed.
**T09 dynamic checkpoint (2026-09-28):** one actual HEAVY and four queued
Research intents overlapped owner/member/anonymous Execution GET authority
sentinels and same-host Portal health/identity. Those signatures stayed
unchanged; this is a scoped isolation PASS, not AWS-HK/business-read coverage.
The first W06 showed Library 3×503/p95 1263 ms and Progress/Evidence >500 ms.
The typed-error attempt hit the real eight-live-preflight actor quota; after
natural expiry a full retake got 120/120 HTTP 200 but Library still failed
warm p95 at 773 ms versus 500 ms. Unloaded 1/4/8/20-reader Library p95 was
72/109/181/375 ms; this narrows the contention hypothesis but does not prove
the stage. W06/P23 remain FAIL/OPEN; no quota, pool or SLO was changed.
[Exact private hashes, failed probe and retake](./research_loop/evidence/P23/T09_EXECUTION_ISOLATION_CHECKPOINT_2026-09-28.md).
**T13 current-route checkpoint (2026-09-28):** the pinned isolated Atlas has
verified QuantBT 1.1.1 and lists `options` as nondefault/DEFERRED. An actual
authenticated preflight refused it with typed 409 and unchanged job/preflight
counts. This proves only current-catalogue fail-closed behavior; no newer
Research-only build, in-flight pin, default rollback or archived reproduction
was exercised. T07/T13 remain OPEN. [Bounded private receipt and exact
scope](./research_loop/evidence/P23/T13_CURRENT_ROUTE_NEGATIVE_CHECKPOINT_2026-09-28.md).

#### B. Frontend / test còn mở (không phải backend)

| Id | Việc | Chủ | Điều kiện đóng |
|---|---|---|---|
| OL-20 | Gộp X3 (S13 VD-P20, một quy tắc refusal cho S02–S08, runner P23 chạy trên contract hiện tại, A12 cập nhật) — **ĐÃ GỘP** (merge `0b6b7fb8`; kèm sửa F-04 cho S09 `reportClient` 404→denied + 401→Frame 01D, và S11 đưa mã lỗi vào disclosure `details`). Record: [`P20/X3_S13_P23_CLAUDE_2026-09-26.md`](research_loop/evidence/P20/X3_S13_P23_CLAUDE_2026-09-26.md). Runner P23 lane fixture 76/78 trước khi sửa S09/S11 — đã chạy lại: **78/78** trên `396b6450` | Claude | Merge xanh |
| OL-21 | `S01-RUNLIBRARY-PAGE-GUARD`, refusal mapping S02–S05 còn lại sau X3 — **ĐÓNG**: X3 sửa fixture làm S01 crash và đưa S01/S03/S04/S05 về một mapper; runner P23 lane fixture **78/78** trên `396b6450` (vitest research 1289/1289). Câu "Run not found" còn ở S03/S04 chuyển sang E1 | Claude | Test + ảnh chụp |
| OL-22 | 33 ô visual baseline lệch (runner P23)  — **ĐÓNG 2026-09-26, không phải nợ code:** bộ visual chỉ so được trong image ghim `mcr.microsoft.com/playwright:v1.62.1-noble` (`scripts/portal-web-visual.sh`, CI chạy đúng script này). Chạy trần trên host: **28 đỏ** (cùng dạng 28 ô của P23); chạy qua script: **332 pass · 16 skip · 0 fail** trên cùng cây `1dec9d33`. Baseline đúng, cây đúng → `B-P23-06` được trả lời bằng bằng chứng, không cần Bobby quyết. Thêm guard `e2e/visualHost.ts`: chạy trần bị chặn kèm câu chỉ đúng lệnh (không nới lỏng so sánh, không sinh lại ảnh; `updateSnapshots: none` giữ nguyên). Record [`OL22_VISUAL_BASELINE_CLAUDE_2026-09-26.md`](research_loop/evidence/OL22_VISUAL_BASELINE_CLAUDE_2026-09-26.md) | Claude | Baseline cập nhật có duyệt từng ô, không `--update` mù |
| OL-23 | Receipt real-API trên preview build lại từ HEAD cho màn 01–13, run P04 + WFO (gồm S11 hợp nhất, W7, X2)  — **ĐÓNG 2026-09-26:** preview build lại từ `9f0a9066` (image chạy = tag, migration head 066; 063 của Codex áp đúng thứ tự trên DB preview), lane real-API **48/48** (1280 + 660), 0 tràn ngang, E10 hội tụ đúng dự đoán (1 COMPLETED, 3 FAILED `P06_RETRY_NOT_DISPATCHED`), S06 Stage B và S13 thấy trên dữ liệu thật. Receipt [`OL23_PREVIEW_RECEIPT_CLAUDE_2026-09-26.md`](research_loop/evidence/OL23_PREVIEW_RECEIPT_CLAUDE_2026-09-26.md). Chưa phủ: S00, S14, S08 P04 trong lane; OL-22 || Claude | Lane real-API xanh + ảnh chụp đã xem |
| OL-24 | P23 browser-real / dev-host review — **`BLOCKED_BY_RUNTIME` (FG slice 1 Thanhvuong, 2026-09-28):** chỉ chạy runner P23 lane fixture trên preview riêng 127.0.0.1:4417: 14 passed / 64 failed, cả 64 là ENOENT `research-foundation.journey-v2.valid.json` ở `e2e/fixtures.ts:262` (fixture đã xoá ở `8d5dd579`) trước assertion → không fail nào do slice, tín hiệu yếu; không có research-dev hostname hay cell được cấp. Request: [FG-runtime-activation-request.md](./research_loop/evidence/FG/FG-runtime-activation-request.md) | Codex (P23) + Claude (màn) | Receipt trên research-dev |

#### E. Gap HiFi ↔ frontend màn 00–14 (rà 2026-09-26)

Bằng chứng từng khối: [`HIFI_AUDIT_S00_S14_CLAUDE_2026-09-26.md`](research_loop/evidence/HIFI_AUDIT_S00_S14_CLAUDE_2026-09-26.md)
(chụp HiFi ↔ thật 1440/660 trên preview `:8095`, run P04 + WFO). Đếm: **100 FE · 28 BE≤P21 ·
7 BE P22+ · 22 quyết định thiết kế**; 134 lệch đã chốt chỉ trích nguồn. Số id trong ngoặc là id
dòng trong file bằng chứng.

**E-FE — Claude làm, không chờ ai**

| Id | Gói | Gồm | Cỡ | Điều kiện đóng |
|---|---|---|---|---|
| E1 | Luật hiển thị chung (mọi màn) | id ngắn 8 hex + `title` đầy đủ cho `rrun_`/`ratt_`/digest (10-2, 11-3, 13-2/6/9); timestamp không ISO mili-giây; số đếm/bytes/float có định dạng, không số thô (01, 03, 08 ledger `equity 19996.892873321103`, drawdown 60 chữ số); enum/chuỗi server thành câu (`NOT_ISSUED`, `validation_claim=…`, `RS02_OOS_MEAN_OF_FOLDS`, `draft VIRTUAL`, `true` trần); một câu 403/404 (S03/S04 "Run not found"); link cũ "not built yet" ở S04 (08, 11 đã có route); S11 `.rc-pack .item` bị viết hoa bởi `table th`; bảng dữ liệu a11y của chart làm tròn | M | vitest + axe + ảnh 1440/660 từng màn chạm — **ĐÃ LÀM cho S01–S04, S07–S09, S11** (commit E1): `ShortId`/`shortId` (tiền tố + 8 hex, chỉ cắt đuôi hex), `claimToken`, `groupDecimalString` (nhóm số theo chuỗi, không qua float — bắt được lỗi `…993→…992` khi sửa), một câu F-04 (`REFUSAL_COPY.denied`) cho S03/S04/S05/S10/S11/S13, link S04→08/11, S11 meta + rail, S03 lỗi run = câu màn + `details`. S06/S10/S12/S13/S14 áp cùng helper trong E5/E6/E7; tràn 660 + nút ⏮/⏭ của S08 sang E2 <br>**Đính chính 2026-10-01 (code `71aed3e6`, record [`f4/LEDGER.md`](research_loop/evidence/P21/audit-2026-09-30/f4/LEDGER.md)) — PARTIAL:** ~~"bảng dữ liệu a11y của chart làm tròn"~~ **chưa làm**: `EvidenceCharts.tsx:152` `ExactTable` (638/644/685/704/727/728) và S08 (`ExecuteDetail.tsx:404,827`, `ExecuteCandleReplay.tsx:559`) vẫn in ISO-ms + float đầy đủ (caption ghi "exact values"). Timestamp ISO-ms còn hiện ở S11 (`ReleaseCandidateDetail.tsx:1815,1980`) và S01 (`RunLibrary.tsx:1181`). Phần còn lại của E1 đúng (ShortId, một câu denied, `.rc-pack`, link S04). |
| E2 | S07/S08 | S08 P04: tràn 67 px ở 660, nút ⏮/⏭ ra ô rỗng, reveal thu chart về một nến và dải toàn run lộ nến tương lai, trade anatomy rỗng tới khi bấm `#`; S07 slider what-if dùng tên demo HiFi `entry_z/atr_mult` thay vì `rvol/slpercent` của profile, thiếu lối "propose new attempt" khi what-if tắt; đánh số fold lẫn 0/1 với 1/2; bố cục S07/S08 lệch S05/S06 (offset, màu subtitle, card lồng, breadcrumb mono); S07 thiếu copy-evidence link | M | như E1 + lane real-API S07/S08 — **E2a ĐÃ LÀM:** S07/S08 dùng frame riêng như S05/S06 (`OWN_FRAME_SCREEN` thêm freeze/execute; lề 272 px đo được, trước là 304), breadcrumb/tiêu đề/subtitle cùng kiểu S05, nút copy evidence link ở S07/S08, `propose new attempt →` (`runs/new?from=`) ở S07 độc lập cờ what-if, slider what-if dùng `rvol`/`slpercent`, bỏ lý do in hai lần, nút `\|◀`/`▶\|` thay glyph thiếu font, trang `StageDenied` dùng chung cho 403/404 ở S07/S08, `foldLabel` (`fold_01` = `#fold=1`) ở S05/S07/S08/S09, trade anatomy mở sẵn transition đầu + bấm cả dòng, bảng sr-only bọc trong `div` (S08 P04 hết tràn 91 px ở 660). **E2b ĐÃ LÀM:** reveal giữ nguyên bề rộng cửa sổ (tương lai để trống, không co về một nến) và dải toàn run không còn vẽ nến sau con trỏ (8.15); trục P04 chỉ ghi tick tròn, drawdown 2 nhãn dạng % (8.7); transport P04 `\|◀ ◀◀ ▶ ▶▶ ▶\|` như WFO; S07 bỏ card FREEZE lồng, revision lên dải trạng thái. **E2c ĐÓNG:** chuỗi digest F3 ở S07 (7 mắt, mỗi mắt là field đã publish hoặc typed absence, browser không tính gì — `DigestChain.tsx`); dải IS/OOS/HOLDOUT ở S08 tô từ biên đã publish (fold train/test trên lane retained, ba cửa sổ P14 trên hub P04). Record [`P17/E2C_E16_S07_S08_CLAUDE_2026-09-26.md`](research_loop/evidence/P17/E2C_E16_S07_S08_CLAUDE_2026-09-26.md) |
| E3 | S09 sheet | notice PARTIAL nói thiếu cả nhóm khi chỉ thiếu vài mục; `break-all` cắt chữ; trục equity chỉ min/max và nhãn đáy đè đường; màu theo dấu | S | ảnh + in Letter/A4 — **ĐÃ LÀM (trừ in):** notice PARTIAL đếm đúng (`2 of 6 headline values, 4 of 10 artifact digests, 1 of 6 passport facts`); bỏ `break-all` (chỉ xuống dòng khi token tràn); headline OOS Sharpe / max DD / funding tô theo dấu; nhãn "deepest" dời xuống dưới điểm, nền giấy, không đè đường; chú thích fold dùng `fold_01`. **Còn:** trục equity 6 tick (9.10, SVG tự vẽ); ô OOS return (9.8) cần P18 `headline` thêm net OOS return → E14; qualifier "declared, not executed" cho P04 (9.7) → E14; evidence link ở provenance (9.15); chạy lại in Letter/A4 |
| E4 | S01–S04 | S01 in chữ "available" thay giá trị null-AVAILABLE; S02 màn đầu (badge PUBLISHABLE khi chưa chọn gì, lỗi validate trước khi nhập, sáu panel rỗng đè nút chính, chưa hiện warmup/required columns/step đã có trong registry); S03 claim passport thiếu 4 claim phương pháp, ô forecast rỗng khi QUEUED; S04 WFO equity vẽ đoạn phẳng trước OOS gây hiểu nhầm  — **ĐÓNG:** S01 hết in chữ "available" thay giá trị null; S02 màn đầu (chip `NO VERSION CHOSEN` thay `PUBLISHABLE · no version bound`, hiện warmup + required columns từ registry, tới được bước tham số); S03 claim passport + forecast; S04 bỏ đoạn equity phẳng trước OOS. Record [`P13/E4_E11_E12_E15_S00_S04_CLAUDE_2026-09-27.md`](research_loop/evidence/P13/E4_E11_E12_E15_S00_S04_CLAUDE_2026-09-27.md) | M | vitest + ảnh<br>**Đính chính 2026-10-01 — PARTIAL:** ~~"S03 claim passport + forecast" ĐÓNG~~ **sai, S03 không có code E4**: `ClaimPassport` (`RunProgress.tsx:1474`, từ `6c3dc67a` 2026-09-24) chỉ có claim/certification/seal/hand-off; **thiếu 4 methodology claim** và run QUEUED chỉ có một câu (`RunProgress.tsx:2150-2185`), không có passport forecast. Nay **BLOCKED_BY_CODEX(CG-FG-S03-02)**; FE không tự dựng claim. S01/S02/S04 của E4 đúng (`RunLibrary.tsx:296-298`, `newRun.test.tsx:698`, `evidenceCharts.test.tsx:239`). |
| E5 | S06 Stage B | cột decay theo fold, plot S_IS×S_OOS của pool, thẻ B3 best≠selected đủ S_IS/S_OOS/decay (phần FE; max_dd ở E-BE) | M | ảnh trên preview mới (OL-23) — **ĐÃ LÀM (E5, merge vào nhánh):** B1 funnel + callout K, B2 J (KaTeX) + decay theo fold + pool S_IS×S̄_OOS, B3 thẻ đủ S_IS/S̄_OOS/d̄/max_dd; backend P15 `pool` (`top_is_k` từ ledger retained khi khớp luật QuantBT, feasible = NOT_APPLICABLE vì study không khai constraint — sửa khẳng định sai của W3), `candidates[].max_drawdown` (θ* global từ đường OOS stitched, còn lại typed absence). Record [`P15/E5_S06_STAGE_B_CLAUDE_2026-09-26.md`](research_loop/evidence/P15/E5_S06_STAGE_B_CLAUDE_2026-09-26.md). Callout K: chữ amber trên nền trắng (HiFi amber/amber 4.01:1 < AA, như VD-P20-30). Còn: ảnh dữ liệu thật sau OL-23; engine request E5-O1 (max_dd từng candidate), E5-O2 (K thật + id pool cho mode 3/4/5) |
| E6 | S14 theo HiFi | stepper, hai cột, tiêu đề + chip QUARANTINE + meta, bảng mirror 3 cột + rules footer, footer | L | ảnh + fixture lane — **ĐÃ LÀM (E6, merge vào nhánh):** stepper 3 bước (tab, giữ DOM), header + chip lifecycle từ server, bảng mirror 3 cột + rules đọc từ schema, gate card, registry + "where it goes next", footer; frame riêng (x = 272). Không đổi contract. Record [`P10/E6_S14_HIFI_CLAUDE_2026-09-26.md`](research_loop/evidence/P10/E6_S14_HIFI_CLAUDE_2026-09-26.md). Còn: 14-7 theo OL-01; E6-BR-01 chữ ký/SBOM (P22+, Codex); cap cho registry strip |
| E7 | S12/S13 mật độ | S12 bố cục 3 cột + card Routes gọn (trang 5.446 px ↔ HiFi 2.273), marker "← this run"; S13 gộp attempt không có claim thành dòng gọn (33 thẻ, 21 FAILED/QUEUED); S10 theo D8 | L | ảnh 1440/660 — **ĐÃ LÀM (E7, merge vào nhánh), gồm D8/D9/D10:** S10 một pill/attempt, hàng kỹ thuật vào disclosure, `not issued` + câu nguồn, chip nguồn ghi `PORTAL_PERSISTED_RESEARCH`, bỏ PARTIAL trùng; S12 thẻ mode 3 cột, Routes/Claims là card có tiêu đề, "← this run" từ identity của run, trang Modes 3.016 px (trước 5.446, HiFi 2.273); S13 gộp 21 attempt không claim thành dòng gọn (12 thẻ), claim = họ + một câu, scope "mean/sum of folds", fold đánh từ 1; backend P20 nhóm markets theo symbol · timeframe (run mới nhất của version ACTIVE, cap 24 → PARTIAL). Record [`P20/E7_S10_S12_S13_HIFI_CLAUDE_2026-09-26.md`](research_loop/evidence/P20/E7_S10_S12_S13_HIFI_CLAUDE_2026-09-26.md). **Còn:** S12 cao hơn HiFi 743 px vì bảng term của engine dài hơn mẫu (RF-04 chờ Bobby duyệt ảnh); ladder S13 12 thẻ còn mũi tên cuối hàng; markets nhóm chỉ thấy sau OL-23 |

**E-BE≤P21 — Claude làm (backend ≤P21)**

| Id | Phase | Việc | Cỡ | Điều kiện đóng |
|---|---|---|---|---|
| E10 | P06/P11/P12 | **Trạng thái run sai/kẹt** (ưu tiên cao nhất — là lỗi đúng/sai, không phải thẩm mỹ): một run QUEUED ở Library nhưng FINISHING ở S03 từ 2026-09-24; run RETRY_WAIT quá hạn 3 ngày không bao giờ redispatch, `may_cancel=false` nên chủ không dừng được; run FAILED không có `failed_at_stage` → trail S01 không chỉ được chỗ chết | M | Test service + receipt preview: không còn run kẹt, cancel được, stage fail tô đỏ — **ĐÃ LÀM (E10, merge vào nhánh):** nguyên nhân gốc là hai cách suy trạng thái (view library mig 045 vs progress), terminal write bị mất không có đường hội tụ, không ai dispatch `RETRY_WAIT`, cancel chỉ ADMIN. Sửa: một hàm `research.run_lifecycle_status_v1` (migration **066**) cho cả library và S03; `reconcile` hội tụ terminal bị mất (finalize hoặc FAILED `P11_TERMINAL_SIDECAR_*`); `RETRY_WAIT` quá hạn → FAILED `P06_RETRY_NOT_DISPATCHED`; chủ run cancel được mọi run chưa kết thúc; P11 `current.failed_at` + `terminal_reason`, P12 stage `blocked` đỏ, S03 pill đỏ + câu màn cho 3 mã mới. Record [`P11/E10_RUN_STATE_CLAUDE_2026-09-26.md`](research_loop/evidence/P11/E10_RUN_STATE_CLAUDE_2026-09-26.md). Claude chốt (uỷ quyền 2026-09-25, Bobby đổi được): E10-O2 giữ expire (CG-P11-07 fail closed, không retry tại chỗ); E10-O4 library không thêm FINISHING (HiFi S01 vẽ 3 trạng thái). Còn: E10-O1 receipt 4 run hội tụ sau khi build lại preview (OL-23); E10-O3 hội tụ theo lượt đọc — sweep định kỳ cần worker (ops) |
| E11 | P13 | **ISOLATED_REAL_API_AND_CONSUMER_ACCEPTED, 2026-09-27.** Library retained WFO stats/sparkline and S04 actual FIXED IS, engine rolling Sharpe63, six behaviour slots and distinct CHILD_TAPE total count are bound and browser-checked at both widths. Four audited-trade behaviours and WFO selected-candidate IS retain exact source absence. API/restart parity PASS; GET does not run engine/HMD/artifact work. | M | [Source receipt](./research_loop/evidence/P13/E11_E14_SOURCE_TIME_ANALYTICS_ACCEPTANCE_2026-09-27.md) + [final real consumer proof](./research_loop/evidence/P17/E11_E17_INTEGRATION_ACCEPTANCE_2026-09-27.md). No redesign or source fact invention. |
| E12 | P03/RF | **CLOSED code + preview 2026-09-27:** descriptor revision 3 and immutable migration **067** make S08/S09/S10/S11/S13 AVAILABLE while revisions 1/2 remain immutable; canonical v3 fixture and compatibility tests are green. Preview `c81e8dc2` opens every built screen from S00. Records: [`P09/E12_JOURNEY_DESCRIPTOR_V3_CLOSEOUT_2026-09-27.md`](research_loop/evidence/P09/E12_JOURNEY_DESCRIPTOR_V3_CLOSEOUT_2026-09-27.md), [`P13/E4_E11_E12_E15_S00_S04_CLAUDE_2026-09-27.md`](research_loop/evidence/P13/E4_E11_E12_E15_S00_S04_CLAUDE_2026-09-27.md). | S | **CLOSED**; no runtime/auth/source change |
| E13 | P19 | **ISOLATED_REAL_API_AND_CONSUMER_ACCEPTED, 2026-09-27.** Real root → clone → reproduction, all complete, exact parents and zero diff; S10 browser proves persisted depths 0/1/2 at both widths. Same-intent retries add no nodes; changed pins 409, missing parent 404, original unchanged; restart parity PASS. Thirteen immutable input pins are compared transactionally. Runtime image/dependency equivalence remains NOT_PUBLISHED, not a bitwise promise. | M | [Reproduction/negative/restart receipt](./research_loop/evidence/P19/E13_REPRODUCTION_REAL_API_ACCEPTANCE_2026-09-27.md) + [final consumer proof](./research_loop/evidence/P17/E11_E17_INTEGRATION_ACCEPTANCE_2026-09-27.md). |
| E14 | P14/P15/P18 | **ISOLATED_REAL_API_AND_CONSUMER_ACCEPTED, 2026-09-27.** WFO stitch/gap PASS; candidate drawdown/constraints preserve E5 authority/typed reasons. WFO/FIXED seals supply scoped Report net OOS, distinct from account return; FIXED remains DECLARED_NOT_EXECUTED. Real Split/Search/Report consumers pass at both widths; old reports are never rewritten. | M | [Source/API/restart evidence](./research_loop/evidence/P13/E11_E14_SOURCE_TIME_ANALYTICS_ACCEPTANCE_2026-09-27.md) + [consumer proof](./research_loop/evidence/P17/E11_E17_INTEGRATION_ACCEPTANCE_2026-09-27.md); no source upgrade/Production activation. |
| E15 | P11 | **CLOSED backend + consumer 2026-09-27:** producer seals requested-spec, effective-spec/adapter and dataset-binding receipts together with progress journal/receipt; P04 therefore has seven real artifacts while WFO truthfully has five and typed absences for evidence/split. Files are 0600, CAS-required, and journal cursor/order are backend-owned. Records: [`P11/E15_PROGRESS_ARTIFACT_CLOSEOUT_2026-09-27.md`](research_loop/evidence/P11/E15_PROGRESS_ARTIFACT_CLOSEOUT_2026-09-27.md), [`P13/E4_E11_E12_E15_S00_S04_CLAUDE_2026-09-27.md`](research_loop/evidence/P13/E4_E11_E12_E15_S00_S04_CLAUDE_2026-09-27.md). | M | **CLOSED**; `fold_segment_observed` stays typed absent until the engine supplies segment times <br>**Đính chính 2026-10-01 (phần S03 consumer):** DONE nhưng không do E15 — manifest/journal ở S03 là `ArtifactsTable` + `denied_artifacts` có từ `6c3dc67a`/`8df45ab6` (2026-09-24), E15 không thêm code S03. Manifest bảy dòng + holdout DENIED còn là `CG-FG-S03-04`. |
| E16 | P17 | **ISOLATED_REAL_API_AND_CONSUMER_ACCEPTED under E16-R1, 2026-09-27.** Canonical producer/strict parent/legacy reader reconciled. New real P04: 168 OOS bars, 42 true-OHLC buckets, independent HMD oracle and restart PASS. Route-bound seek/cursor, null fill markers and causal Reveal (complete buckets only, no future scale/extrema) pass in browser. No per-bar invention/backfill; old immutable absence preserved. | L | [Canonical/source/browser proof + preserved failure](./research_loop/evidence/P17/E11_E17_INTEGRATION_ACCEPTANCE_2026-09-27.md). Append-only migration 075/076, not historical-ledger edits. |
| E17 | P10 | **ISOLATED_REAL_API_AND_CONSUMER_ACCEPTED, 2026-09-27.** Three real imported/DRAFT HMD runs prove exact profile/admission/AppArmor/retention and six named reads. Approved consumer fixes map imported identity/source hash and published engine pin; imported Evidence/Freeze browser passes at both widths. No arbitrary execution or Production activation. | — | [Backend packet](./research_loop/evidence/P10/E17_IMPORTED_DRAFT_EXECUTION_BACKEND_RECEIPT_2026-09-27.md), [original machine receipt](./research_loop/evidence/P10/e17-backend-acceptance.v1.json), [final consumer proof](./research_loop/evidence/P17/E11_E17_INTEGRATION_ACCEPTANCE_2026-09-27.md). |

**E-BE P22+ — Codex**: rc chip ở S01 và "last published RC" ở S02 cần read publication/approval
theo `alpha_version_id` (**OL-13 mới**); S10 promotion pick = OL-03; S11 taxonomy/mirror/publish =
OL-06/07/09. Màn đã hiện chúng là typed absence, không bịa.

**E-D — Quyết định thiết kế: Claude chốt theo HiFi (uỷ quyền 2026-09-25), Bobby phủ quyết nếu khác ý**

| Id | Câu hỏi | Chốt | Vì sao |
|---|---|---|---|
| D1 | Nhãn run ngắn `R-WFO-###` + breadcrumb topbar tới run/stage (X1, X2, 10-3, 11-4, 13-2, X-1) | **Có**: server cấp `display_label` = kind + số thứ tự trong workspace (BE≤P21, P10/P13), shell breadcrumb đọc nó | **ĐÃ LÀM:** server suy `display_label` = kind (từ execution profile đã lưu) + số thứ tự trong workspace theo `created_at`, `run_id` phá hoà — **không cần migration**, không cột mới; profile lạ thì **không có nhãn** (màn quay về id ngắn) chứ không bịa `R-UNKNOWN-007`. Có trên 4 read (library, progress, evidence, lineage); `ShortId` đọc từ registry chung nên không phải sửa header từng màn; breadcrumb shell nối thêm nhãn + tên màn. Record [`P19/D1_E13_RUN_LABEL_LINEAGE_CLAUDE_2026-09-26.md`](research_loop/evidence/P19/D1_E13_RUN_LABEL_LINEAGE_CLAUDE_2026-09-26.md) |
| D2 | S00 thẻ theo run bị xám, không có lối chọn run (00-4) | Link "pick a run" sang Run Library, mang theo màn đích | Hết ngõ cụt, không đoán "run mới nhất" |
| D3 | Thanh tóm tắt S01 là claim ledger thay vì đếm trạng thái (01-11) | Dòng 1 đếm trạng thái như HiFi (server đã có count), claim ledger xuống dòng 2 | Giữ cả hai, HiFi đi trước |
| D4 | S02 prefill (02-13) | Prefill từ coverage của dataset đã chọn, sửa được; không có dataset thì để trống | Không bịa mặc định |
| D5 | S03 ARCHIVE RUN (03-9) | **Hoãn** — không có endpoint, không nằm trong hợp đồng P01–P21 | Ghi lại, mở khi có nhu cầu |
| D6 | S06 search cinema trên WFO (6.5) | **Không dựng** tới khi engine publish sampler trace | Dựng lại từ thứ tự ledger là bịa một trace |
| D7 | S08 play across folds (8.10) | Công tắc, mặc định tắt; bật thì đọc cửa sổ kế ở biên fold | Giữ luật "chỉ đọc khi bạn yêu cầu" |
| D8 | S10 (10-1, 10-5, 10-7…10-11) | Theo HiFi: bỏ market/timeframe khỏi crumb; hàng kỹ thuật vào disclosure; bỏ chip run thô (vào title); bỏ notice PARTIAL trùng pick card; giữ panel counts (như VD-P20-08); chip nguồn ghi đúng read authority; giữ "cert not published" | Khớp HiFi mà không nói sai nguồn |
| D9 | S12 mật độ 3 cột + Routes gọn (12-1, 12-5; RF-04) | Làm theo HiFi (E7) | Chờ lâu nhất trong RF-04, không có lý do giữ 2 cột |
| D10 | S13 attempt không claim, markets theo market (13-1, 13-8) | Gộp attempt không claim thành dòng gọn; markets nhóm theo phần market của ComparisonContractKey, lấy run ACTIVE/mới nhất mỗi key (composer P20, BE≤P21) | Giữ nghĩa mode "markets" |

**Lane real-API đã phủ đủ 14 màn (2026-09-27).** Thêm S00, S14 và S08 trên run P04 — lane từ 48 lên **54 ô**, `overflow` = 0 ở cả 54 receipt. Mỗi ô so với **field server trả**, không so với bản chép: S00 dựng cả cột badge từ availability đã publish rồi mở cả 21 đích để chứng minh "đã dựng" nghĩa là **có route**; S14 chặn mọi write (chỉ parse/gates/register/activate trả fixture canonical, mọi request khác bị chặn và kiểm là rỗng), rồi đọc lại danh sách alpha để chứng minh không có gì lọt xuống preview; S08 P04 kiểm không còn float thô trong chữ người đọc thấy, và nến vắng đúng mã `P04_SOURCE_DID_NOT_PUBLISH_REPLAY_CANDLE_WINDOWS`. Record [`P23/LANE_S00_S14_S08P04_CLAUDE_2026-09-27.md`](research_loop/evidence/P23/LANE_S00_S14_S08P04_CLAUDE_2026-09-27.md).

Hai việc lane hỏi, Claude đã chốt và làm luôn: S00 in `descriptor revision N` (trước đó `ResearchPanel` chỉ in `meta` ở biến thể framed, mà màn này dùng plain); `alpha_version_legacy` **không** hạ xuống PLANNED — màn đó có mount thật ở `alphas/:alphaId/:version`, cái thiếu là alpha + version, đúng ca D2 — nên nó đi qua picker Run Library và giải từ binding của dòng người đọc chọn, `JOURNEY_UNROUTED_KEYS` giờ **rỗng**.

**Ba quyết định Bobby uỷ quyền 2026-09-27 ("Bạn làm luôn nhé, đầy đủ và hết nhé") — Claude đã chốt:**

| # | Câu hỏi | Chốt | Vì sao |
|---|---|---|---|
| RF-04 | Mật độ S12 (sau E7 còn cao hơn HiFi 743 px) | **Bóc tách từng khối:** phần do khoảng cách/lặp/bố cục là lỗi, phải đóng; phần vì engine trả nhiều term hơn mẫu HiFi thì dùng luật mật độ của HiFi, disclosure, hoặc cap **có ghi rõ** ("top 10 / 214") — không cắt ngầm, không bỏ term server đã trả, không thu chữ dưới cỡ nhỏ nhất của design system. Còn cao hơn HiFi sau đó thì ghi là lệch có chủ ý kèm số đo | "Bảng dài hơn" mới là giả thuyết cho tới khi đo từng khối; im lặng cắt dữ liệu là nói dối |
| E16-R1 | Có giữ overview OHLC ở producer P10/child P06 để S08 P04 có nến? | **Có.** Giữ overview **có giới hạn**: bucket lấy high/low là cực trị thật của các bar, không nội suy, ghi kèm cỡ bucket và số bucket; dùng đúng shape `candle_overview` của lane WFO. **Không backfill** — run cũ mất tape thì vẫn typed absence. Chart nến từng bar ở P04 vẫn không có, không dựng từ overview | Không giữ gì thì S08 P04 vĩnh viễn thiếu một khối HiFi; giữ cả tape thì quá đắt. Overview là mức nhỏ nhất đủ trung thực |
| E10-O3 | Có dựng sweep định kỳ (cần worker) không? | **Không thêm worker — ĐÃ LÀM.** Sau khi `reconcileBestEffort` dọn xong workspace đang đọc, nó hỏi **một câu global có index** là workspace nào còn job không tự hội tụ được, rồi chạy `reconcile()` cũ (không sửa) cho **tối đa 2 workspace**. Chặn trên: 1 lượt hỏi / 60 s / process, ≤ 64 dòng, cùng một workspace không quét lại trong 300 s, luật cũ ≤ 1 / 10 s / workspace giữ nguyên; lease còn sống bị loại. Migration **069** thêm index từng phần trên 5 trạng thái job chưa kết thúc (**16 kB** cạnh 48 MB). Không bịa danh tính: quét dưới `jobs.requested_by_user_id`, chủ đã rời thì bỏ qua. Record [`P11/E10O3_CONVERGENCE_REACH_CLAUDE_2026-09-27.md`](research_loop/evidence/P11/E10O3_CONVERGENCE_REACH_CLAUDE_2026-09-27.md) | **Đo mới quyết được:** truy vấn stranded-terminal kiểu global **không chặn được** — anti-join trên `run_progress_snapshots` không có index global: 4.715 ms / 3.2 triệu buffer, thêm cửa sổ 7 ngày hay index riêng vẫn Seq Scan. Câu global chỉ hỏi *workspace nào* thì 0,095 ms / 7 buffer. **Sửa lại một khẳng định của chính tôi:** Control API **không** phải không có worker — `ExecutionProfileProjectionWorker` và `ExecutionSharedReadCacheMaintenanceWorker` đều tự lên lịch từ `OnApplicationBootstrap`; "không worker" là luật thiết kế của P06/P11, không phải sự thật về service |

**Thứ tự (Bobby chốt 2026-09-26: FE trước, thiếu backend thì làm luôn, không hợp thì ghi receipt/request):** E1 → các màn lớn E6/E7/E5 song song (mỗi gói một worktree) kèm backend của chính nó (D1 `display_label`, D10 nhóm markets) → E2 + E16 → E3/E4 → E11–E15. E10 chạy nền song song (agent riêng, chỉ backend). Thứ tự cũ: E10 → E1 → build lại preview + OL-23
(để thấy X2/W7/P22 trên dữ liệu thật) → E2/E3/E4 → E11/E12/E13 + D1 → E14/E15 → E5/E6/E7 →
E16 → lane real-API đủ + receipt. Mỗi gói: test đúng file chạm + ảnh màn đó; lane đầy đủ chỉ ở
mốc (rebuild preview, trước báo cáo "đóng").

#### F. Còn phải làm, chốt lúc 2026-09-27 (ghi ngay để không rơi mất)

Trạng thái lúc ghi (27/9): lane real-API 54 ô (52 xanh so với preview `c81e8dc2` vì preview còn phục vụ
bundle trước khi sửa S00), E10-O3 đã xong. F1 và F2 là hai việc bị cắt quota lúc đó — **cả hai đã xong và
gộp vào `a00df203`**; bảng ngay dưới giữ lại làm lịch sử. **Danh sách frontend còn lại cập nhật ở mục G
(2026-09-30); F4 + F5 nay gộp vào G10.**

| Id | Việc | Ở đâu | Đã có gì | Còn gì |
|---|---|---|---|---|
| F1 | **RF-04 — mật độ S12** | — | **ĐÃ XONG, đã gộp (merge `56439458`):** S12 Modes ở 1440 từ 3.016 xuống **2.478 px** (HiFi 2.273), ở 660 từ 4.468 xuống **3.977** (HiFi 4.110 — thấp hơn HiFi). 205 px còn lại ở 1440 đã đo từng khối: chữ engine dài gấp **2,5 lần** mẫu HiFi (2.706 so với 1.082 ở phần text), không phải khoảng trắng — ghi là lệch có chủ ý | Record [`P20/RF04_S12_DENSITY_CLAUDE_2026-09-27.md`](research_loop/evidence/P20/RF04_S12_DENSITY_CLAUDE_2026-09-27.md) |
| F2 | **E16-R1 — overview OHLC cho P04** | — | **ĐÃ XONG, đã gộp** (agent bị cắt quota lúc hook đang chạy; code và test đã xanh trong worktree, tôi gộp lại): child P10 tóm tắt bar **trong lúc còn giữ tape**, migration **068**, serve đúng shape `candle_overview` của lane WFO, S08 P04 vẽ dải toàn run. Run cũ đọc `P13_SOURCE_PREDATES_RETAINED_CANDLE_OVERVIEW` mãi mãi — **không backfill**. Test: producer Python 16/16, replay 3+11+3, **PostgreSQL 4/4**, frontend S08 73/73, contracts 191/191. Bản patch dự phòng: `/home/bobby/portal-wip/e16r1-p04-candle-overview-2026-09-27.patch` | Record [`P17/E16R1_P04_CANDLE_OVERVIEW_CLAUDE_2026-09-27.md`](research_loop/evidence/P17/E16R1_P04_CANDLE_OVERVIEW_CLAUDE_2026-09-27.md) |

**Việc lớn còn lại, theo thứ tự.** Cột *Chủ* ghi rõ việc nào **Codex làm được** (backend, không đụng màn ≤P21) và việc nào là **frontend chưa xong**. Mọi việc dưới đây đều **chưa bắt đầu** — không có code dở nào ngoài những gì đã ghi.

| # | Việc | Chủ | Vì sao chưa xong |
|---|---|---|---|
| F3 | **OPEN — full exact-candidate 54/54 real-API browser lane.** The owned P23 cell has pinned images and real P04/WFO runs; S02/S14 positive browser writes have scoped receipts, and exact-cell S00–S14 route smoke is 30/30 with S11→R1 bridge 2/2; these scoped read-only checks do not cover the canonical 54/54 screen/action/refusal matrix. The 068/069→075/076 migration upgrade path is proved separately in F6. The contributor's 2026-09-28 `BLOCKED_BY_RUNTIME` was historical, not current absence of an owned cell. | Claude FE + Codex runtime | Run the complete non-stubbed 54/54 browser lane on one exact candidate, pin image/source/migration IDs and prove the product screens. [Scoped real route/bridge receipt](./research_loop/evidence/P23/F3_REAL_ROUTE_AND_PUBLICATION_BRIDGE_2026-09-29.md) [Prior request](./research_loop/evidence/FG/FG-runtime-activation-request.md) · [current P23 receipts](./research_loop/evidence/P23/README.md) |
| F4 | **CLOSED owned runtime F4/E10, 2026-09-27.** New real terminal is deliberately stranded then read-recovered once; overdue retry becomes typed FAILED, another actual live lease remains byte-identical and completes after worker restoration. Public production paths, no fake source terminal/immutable rewrite. | Codex approved qualification | [Fault + actual API/DB evidence](./research_loop/evidence/P23/RECOVERY_INTEGRITY_RUNTIME_CHECKPOINT_2026-09-27.md); shared preview 8095 untouched |
| F5 | **PARTIAL real acceptance.** S02 preflight/create and S14 import/activate have positive real-browser 1280/660 receipts. The same clean cell has real typed 400/401/403/404/409 API negatives and bounded S02 503; these do not certify browser-visible refusal or a real 502. | Codex owned cell + Claude FE | Finish browser refusal presentation, source-honest 502 disposition, full same-candidate lane and disposable identity revocation. No fixture/stub result may close F5. [Positive S02](./research_loop/evidence/P23/F5_S02_BROWSER_REAL_WRITE_2026-09-29.md) · [positive S14](./research_loop/evidence/P23/F5_S14_BROWSER_REAL_WRITE_2026-09-29.md) · [negative subset](./research_loop/evidence/P23/F5_NEGATIVE_API_MATRIX_2026-09-29.md) |
| F6 | **CLOSED backend regression, 2026-09-27.** Historical 9/10 failure superseded: actual current suite first reproduced 9/11, then **11/11 PASS**. Assertions now follow published persisted/RS-02 lane identity; exact values, extrema, sealed manifest and no reader-created P13 projection remain checked. | Codex | [Checkpoint + original failure retained](./research_loop/evidence/P23/F6_MIGRATION_VERIFIER_CHECKPOINT_2026-09-27.md) |
| F7 | **E10-O3a** — nhịp 2 workspace/phút/process: 10 workspace hội tụ trong ~5 phút, 100 workspace mất ~50 phút. Quá ~30 workspace phải đo lại | Bobby quyết, rồi Claude | Đo rồi mới biết có cần đổi nhịp |
| F8 | Request cho engine/source: **E5-O1** (max_dd từng candidate), **E5-O2** (K thật + id pool cho mode 3/4/5) | Claude gửi, engine trả lời | E16 producer và engine pin không còn chờ source: Codex đã đóng bằng [real proof](./research_loop/evidence/P17/E11_E17_INTEGRATION_ACCEPTANCE_2026-09-27.md). Hai request E5 giữ đúng owner/scope cũ. |
| F9 | **D-B1** tương phản `--ink-faint` `#939db0` — ngoại lệ axe duy nhất còn lại, dùng chung cả lane | Bobby (token) | Đổi token là đụng baseline |
| F10 | **OL-01** Production activation | Bobby/ops | Host SGP đã có profile enforce và owned child đã dùng thật; không còn thiếu host profile trên máy này. Production Research flags/rollout vẫn tách riêng, không được suy từ receipt 8098. |
| F11 | **Current: OL-12 / P23 qualification.** OL-03…OL-11 and OL-13 backend are closed by the P22 real receipt; their consumer acceptance remains in F3/F5/OL-24. Historical broad OL-03→OL-13 wording is superseded, not a request to rebuild P22. | Codex | Real P23 T01–T15/DR/BR/GX evidence still required |
| F12 | **Frontend chưa xong — nhỏ, đã biết:** ladder S13 còn mũi tên `claim ↑ →` treo ở cuối hàng (12 thẻ, hàng 4); hai lane S08 có độ phân giải dải khác nhau (WFO bucket 160, P04 bucket 48 — trung thực vì caption ghi cỡ bucket, nhưng không đồng đều); S09 chưa chạy lại in Letter/A4 sau E3/E14 | Claude (frontend) | Chưa làm. **Cập nhật 2026-09-28 (FG-04, slice 1 Thanhvuong, commit `b896d98d` + `e4b9447e`):** (1) ladder S13 — FG-04a sửa `CompareDetail.tsx`: unit lane PASS; `VERIFIED — COMPONENT_FIXTURE_BROWSER_RECEIPT` (fixture lane): 1/2/4/12 thẻ × 1280/1440/660, mũi tên nhìn thấy chỉ nằm giữa hai thẻ cùng hàng, không mũi tên sau thẻ cuối, ring focus trong vùng clip, tràn 0. 4 thẻ ở 1280 xuống 3+1 **như HiFi 13** (một hàng ở 1440 như HiFi) → giữ nguyên; gate "một hàng ở 1280" của probe chặt hơn HiFi và đã rút. Connector khi xuống dòng + câu header → `VD-FG-04-01`. Resolver S13 không có Alpha (13-15) in `RESOLVER_NEEDS_ALPHA` ở attempts/markets, sửa trong cùng commit: `VERIFIED — fixture lane`. (2) S08 hai lane — PASS fixture lane (A5, 11/11): caption đúng cỡ bucket, retained seal thật phát 151 bucket (160 là trần, mâu thuẫn #18 trong FG-01); so sánh thật WFO vs P04 `BLOCKED_BY_RUNTIME`. (3) S09 in Letter/A4 — PASS fixture lane (A5): 0 request khi in, warnings + provenance có mặt; B G6 chạy lại dưới tên spec mới 11/11; một tờ vs nhiều trang → `VD-FG-04-04`/`-05`. Lane real `BLOCKED_BY_RUNTIME`; không VERIFIED ở lane real. [FG-01 matrix](./research_loop/evidence/FG/FG-01-screen-audit-matrix.md) |
| F13 | **Visual baseline** chưa chạy lại sau S08 (E16-R1 thêm một hàng) và S12 (RF-04 đổi bố cục). Chạy **chỉ** qua `./scripts/portal-web-visual.sh` (image ghim) — chạy trần sẽ ra 28 ô đỏ giả | Claude | Chưa làm. **2026-09-28 (FG-07, Thanhvuong):** chưa chạy — image ghim `mcr.microsoft.com/playwright:v1.62.1-noble` chưa có trong store rootless của contributor và việc chạy script bằng docker rootless cần Bobby xác nhận (grant G7). Không chạy trần. [FG-runtime-activation-request.md](./research_loop/evidence/FG/FG-runtime-activation-request.md) |
| F14 | **E16-R2** — publish engine pin trên freeze read P04 | **Codex — CLOSED isolated backend + consumer** | `engine_pin` generated fact/reason consumed by DigestChain; P04 + imported Freeze real browser PASS at both widths. [Receipt](./research_loop/evidence/P17/E11_E17_INTEGRATION_ACCEPTANCE_2026-09-27.md). Old records remain typed absent. |

**Checkpoint 2026-09-28 — Bobby tạm dừng goal backend, giao frontend gap closeout cho Thanhvuong.**
[P23 goal checkpoint](./research_loop/evidence/P23/BACKEND_GOAL_PAUSE_AND_RESUME_2026-09-28.md)
ghi rõ F6/migration, F4/E10, OL-02, P22 replay và các scoped P23 receipts đã sửa/chứng minh,
cùng lỗi mới `CG-P23-T02-01`, `-T03-01`, `-T05-01`, `-T12-01/02` và warm Library W06/T08
chưa đạt 500 ms. Đây là lộ trình sửa khi goal được tiếp tục, **không** phải P23 PASS hay
quyền bật runtime. [Handoff frontend `FG-01…FG-07`](./research_loop/evidence/FRONTEND_GAP_HANDOFF_THANHVUONG_2026-09-28.md)
là phạm vi hiện hành cho Thanhvuong trên `feat/gap_frontend_thanhvuong`, link tới
[rules contributor A0.1](./research_loop/CLAUDE-FOR-thanhvuong.md#rl-thanhvuong-gap-2026-09-28).
Primus `docs/research-loop-plan` còn ở `a00df203`; branch handoff chứa baseline
`2e44ffcc`, nên **chưa mở PR** vào Primus base cũ (sẽ lẫn 47 commit của Bobby/Claude).
Bobby quyết đồng bộ base hoặc nhập có chọn lọc sau review; Thanhvuong chỉ push branch riêng.
F3/F5/F12/F13 và S01/S02/S10/S11 P22 consumer được Thanhvuong audit/đóng bằng
candidate hiện tại; status trong các dòng lịch sử trên **không tự nâng thành DONE**.
`D1-O1` mới: S09/S11/S13 deep-link còn thiếu `display_label` trong chính named read;
Codex phải publish additive contract trước, Thanhvuong không suy label từ cache/id.
`E14` reference không tồn tại đã được sửa trong
[retrospective](./research_loop/evidence/P14/E14_RETAINED_INTEGRITY_AND_REPORT_CLOSEOUT_2026-09-27.md),
không tạo receipt hồi tố. `F9` contrast, S12 lệch 205 px có đo và S14 mirror deviation
chờ đúng owner visual decision; E5 source gaps giữ typed absence. Các backend/source
row P23 trong §13.4.1 vẫn thuộc owner được ghi ở đó; Thanhvuong không nhận P23 backend/P24.

<a id="fg-slice1-thanhvuong-note-2026-09-28"></a>
**FG slice 1 Thanhvuong note (2026-09-28).**

**Trạng thái:** `FG-01 FIXTURE_LANE_AUDIT_ACCEPTED · FG-04a VERIFIED — COMPONENT_FIXTURE_BROWSER_RECEIPT (fixture lane) · S13 resolver 13-15 VERIFIED — fixture lane · FG-05 S01/S02/S11 VERIFIED — fixture lane · FG-04b/c PASS_FIXTURE_LANE · FG-02/FG-03 + nửa real FG-01/04/05/06/07 BLOCKED_BY_RUNTIME · FG-06 PACKET_ONLY (CG-FG-D1-O1) · FG-07 NOT_STARTED`.

- **Phạm vi:** handoff [FRONTEND_GAP_HANDOFF_THANHVUONG_2026-09-28](./research_loop/evidence/FRONTEND_GAP_HANDOFF_THANHVUONG_2026-09-28.md) + rules contributor A0.1, trên `feat/gap_frontend_thanhvuong`, base `8783461e`. Frontend ≤P21 và màn 00–14; không backend, contract, migration, router/shell dùng chung, token toàn cục. Không PR (Primus `docs/research-loop-plan` còn ở `a00df203`), không rebase; Bobby quyết nhập/merge.
- **Goal:** đo trung thực màn S00–S14 so với HiFi và contract (FG-01), đóng các gap frontend nhỏ đã biết (FG-04 ladder S13, caption S08, in S09; FG-05 consumer P22 ở S01/S02/S11), và ghi mọi thứ cần backend/owner/runtime thành request có locator.
- **Đã giao (commit + push lên `primus-origin/feat/gap_frontend_thanhvuong`, theo A0.1 "commit + receipt sau từng slice"):**
  - `b896d98d` fix(research): ladder S13 (FG-04a) + resolver S13 in `RESOLVER_NEEDS_ALPHA` — `CompareDetail.tsx`, `compareDetail.test.tsx`.
  - `f0f7cc3d` feat(research): consumer P22 FG-05 — 8 file sửa + 2 file mới (`alphaVersionPublication.ts`, `alphaVersionPublication.fixture.ts`) dưới `src/research/`: chip RC S01 qua `researchAlphaVersionPublicationGetV1`, dòng `last published rc` S02, mirror S11 (raw + effective status, decisions, condition_count, pool typed absence, rc_superseded, conflict, intent card), 401 → `reportSessionExpired()`, 403 = 404 trên read, đọc lại sau refusal có type.
  - `e4b9447e` test(research): spec `e2e/_probe-fg04-research-s08-s09.spec.ts` + `playwright.research-fg04.config.ts` (FG-04b/c, fixture lane, không `src/**`).
  - `ecec647f` docs(research): 5 file evidence dưới [`research_loop/evidence/FG/`](./research_loop/evidence/FG/FG-01-screen-audit-matrix.md) (FG-01 matrix, CG-FG, runtime request, VD, debt).
  - Commit tài liệu này (Unified §13): xem `git log`.
- **Evidence (sha256/16, ngoài repo dưới `~/tv-shots/fg/`):** A1 matrix `51806c573d42e059` / summary `00928b608ce2d0fb`; A2 `a6f432b89fc1f0a8` / `6fb5b1f0243794f2`; A3 `3c032d8a826bf5df` / `6dd525422956755f`; A4 report `2b3592ac26b7100a`; A6 report `1f65daafe55ef699`, gap table `f7313eccb62171bd`, diff `03a65a40195813bc`; B report `a8a5b3f59739fd0d`; S13 chạy lại `f54000dfa739d711`; full vitest `7f2715c4e8a12ff7`. Build: HEAD dist `0106a2b52a4beaff`; slice build 1 `abbbe2f25b992607` (B chạy mọi gate trên build này); slice build 2 `adc6b2508bc52cce` (chỉ thêm bản sửa resolver; chỉ chạy lại probe S13). Digest build = sha256 của danh sách sha256 từng file trong `dist/` đã sắp xếp. Locator trong các file FG giữ neo "@HEAD 8783461e".
- **Test IDs:**
  - Unit: `compareDetail.test.tsx` 50/50 (47 của FG-04a, 5 mới nhạy mutation; +3 cho resolver); FG-05 rf06c (7), newRun "FG-05" (6), S11-U33/U36–U38/U40/U40b/U41/U43/U45/U52/U54–U58/U60. Full vitest trên tree cuối: 197 file (195 pass, 2 fail), 3889 test (3886 pass, 2 fail, 1 skip); 2 fail kế thừa từ HEAD (`r2Ledger` → `CG-P22-C`; token gate `AlphaImport.tsx` → `S14-ALPHAIMPORT-RAW-COLOR`); `tsc -b --noEmit` exit 0.
  - Fixture browser: A1/A2/A3 audit lanes (A2 167/167; A3 main 151/155 + supplemental 13/13, 4 timeout là lỗi probe); FG-04b/c 11/11. Gói B (chỉ lane fixture): G1 ladder 11/12 ô, fail duy nhất là gate "4 thẻ @1280 = 1 hàng" — HiFi 13 cũng 3+1 ở 1280, gate rút (quyết định lead + người dùng) → `VERIFIED — COMPONENT_FIXTURE_BROWSER_RECEIPT`; G2 resolver FAIL 0/2 → sửa trong slice → chạy lại trên build 2: 15 passed / 1 failed (fail duy nhất là gate 1280 đã rút) → `VERIFIED — fixture lane`; G3 S01 20/20; G4 S02 24/24; G5 S11 PASS mọi tiêu chí product (38 test, 35 pass, 3 ô `publish422` chỉ do bộ lọc console của harness); G6 11/11; G7a runner P23 14 passed / 64 failed, cả 64 là ENOENT journey-v2 ở `e2e/fixtures.ts:262` → tín hiệu yếu; G7b config đầy đủ NOT_RUN, 4 file tải được 51 passed / 47 failed, không fail nào quy cho slice theo diff + request log, **không A/B với build HEAD**, 5 fail S01 `NOT_ATTRIBUTED`; G8 cô lập PASS; G9 dọn dẹp PASS.
- **Not run:** `REAL_API_E2E_RECEIPT` mọi màn; axe (thiếu `@axe-core/playwright`/`axe-core`, G6); visual baseline pinned (G7); so sánh thật S08 WFO-160 vs P04-48; FG-05 trên real API; config research-probe đầy đủ; A/B với build HEAD. Danh sách đủ: FG-01 §4 và `not_run` trong [FG-debt-register.json](./research_loop/evidence/FG/FG-debt-register.json).
- **Blocked:** FG-02 (F3), FG-03 (F5), nửa real FG-01/04/05/06/07, OL-24 — `BLOCKED_BY_RUNTIME`, request [FG-runtime-activation-request](./research_loop/evidence/FG/FG-runtime-activation-request.md) (G1–G7). Không phải `BLOCKED_DEV_REVIEW` vì chưa xin hostname. FG-06 chỉ có packet `CG-FG-D1-O1`. FG-07 chưa bắt đầu; input: phát hiện lane T1–T17 (FG-01 §6, `fg07_test_lane_findings`), grant G7.
- **VD:** [FG-owner-decisions](./research_loop/evidence/FG/FG-owner-decisions.md) — `VD-FG-01-01` (server prose trong `RefusalNote`, trọng số P1, diff đề xuất cho Bobby) … `VD-FG-01-32`, `VD-FG-04-01…06`, `VD-FG-05-01…12` (`-06`/`-07` = quan sát O1/O2 của gói B trên chip S01; `-04` dùng lại và `-08…-12` = sáu lệch HiFi 11 D1–D6).
- **CG:** [FG-backend-requests](./research_loop/evidence/FG/FG-backend-requests.md) — `CG-FG-D1-O1` (gộp S09-01/S11-01/S13-01), `CG-FG-P22-01`, `CG-FG-S02…S14` (37 packet theo màn, 2 có điều kiện). Tất cả OPEN, owner Codex.
- **Debt:** [FG-debt-register.json](./research_loop/evidence/FG/FG-debt-register.json) — FE_GAP mở không sửa trong slice (P1: FE-A1-01/03/04 → đề xuất slice `FG-08-SERVER-PROSE`); fail kế thừa `r2Ledger` (`CG-P22-C`) và `S14-ALPHAIMPORT-RAW-COLOR`; 17 phát hiện lane cho FG-07; 13-15 đã đóng (`VERIFIED — fixture lane`).
- **Bobby quyết:** nhập slice 1 (5 commit trên branch; A0.1: chưa PR khi Primus base chưa bắt kịp); `VD-FG-01-01` và các VD mới `VD-FG-05-06…12`; grant G1–G7; có mở `FG-08-SERVER-PROSE` và slice nhỏ `S14-ALPHAIMPORT-RAW-COLOR` không; diff 1 dòng `e2e/fixtures.ts:262` (journey-v2 → v3) và gutter router A3 X-2 (file dùng chung, A0.1).
- **Exit gate chưa đạt:** real receipt mọi màn; axe; visual pinned; contract Codex cho các `CG-FG-*`; FG-07. Không dòng nào ở §13.4.1 được nâng thành DONE/CLOSED bởi slice này.
- **Rollback/handoff:** slice 1 là 5 commit trên `feat/gap_frontend_thanhvuong` (base `8783461e`); bỏ slice = revert đúng các commit đó (Bobby quyết; contributor không rewrite lịch sử, không force-push). Preview 4417 và file tạm của B dọn theo G9 PASS; không cell/port/volume nào của người khác bị đụng.

<a id="fg-slice2-thanhvuong-note-2026-09-29"></a>
**FG slice 2 Thanhvuong note (2026-09-29).**

**Trạng thái:** `VD-FG-05-06/-07/-02 RESOLVED_BY_OWNER (B) · implemented · VERIFIED fixture lane · VD-FG-05-11 implemented · VERIFIED fixture lane (residual P3) · FE-A1-01/03/04 FIXED · VERIFIED fixture lane (FG-08-SERVER-PROSE, chỉ S02) · FE-FG2-01…05 FIXED (FE-FG2-04/05 UNIT_ONLY) · S14-ALPHAIMPORT-RAW-COLOR FIXED (INHERITED_FROM_BASE) · full suite NOT GREEN (1 fail kế thừa, CG-FG-R2-01, owner Codex) · FG-07 runner PARTIAL — harness green, 15 cells red on an open owner decision · FG-07 visual gate FAIL — 8 snapshots · FG-02/FG-03/OL-24 + mọi lane real-API BLOCKED_BY_RUNTIME · FG-06 PACKET_ONLY`.

- **Phạm vi:** chỉ đạo của Bobby cho slice 2 — sửa chip rc S01 (effective `EXPIRED` tô xanh; loading vs denied), dòng outcome tĩnh S11 cạnh decision thật, ba defect refusal P1 S02, xác minh hai fail full-suite, rồi FG-07. Trên `feat/gap_frontend_thanhvuong`, base slice 2 `96ac0f46`; chỉ `apps/portal/frontend/src/research/`, `e2e/research-qualification/`, evidence FG và note này. Không backend, contract, registry, router/shell, token toàn cục, snapshot, `e2e/fixtures.ts`. Không PR (Primus `docs/research-loop-plan` còn ở `a00df203`), không rebase. Slice 1 không được chấp nhận là đóng gap; slice 2 cũng không đóng gap.
- **Đã giao (commit + push lên `primus-origin/feat/gap_frontend_thanhvuong`):**
  - `ad404196` fix(research): S01 chip rc theo effective status + hậu tố reading / not readable (403 = 404) / unavailable; S11 legend `possible outcomes:` chỉ khi chưa có decision, `decisions recorded: none`, separator đi cùng item trước — `RunLibrary.tsx`, `ReleaseCandidateDetail.tsx` + 2 test.
  - `a1d7bf3f` fix(research): S02 refusal in copy client, không bao giờ in server message — dataset catalog, preflight 422 (có và không `field_path`), run create, hook preflight, clone read; 403 = 404 — 8 file sửa + 4 file test mới.
  - `602e8410` fix(research): S14 `box-shadow` → `var(--shadow-e1)` (giá trị computed giống hệt) — `AlphaImport.tsx`.
  - `0607e7a7` test(research): runner qualification đọc journey v3, stub có type, ma trận 15 màn × 9 state (115 RUN / 20 N/A) — `e2e/research-qualification/`.
  - Commit evidence FG slice 2 và commit tài liệu này (Unified §13): xem `git log`.
- **Evidence (sha256/16, ngoài repo dưới `~/tv-shots/fg2/`):** [FG-slice2-receipt](./research_loop/evidence/FG/FG-slice2-receipt.md). Unit: A1 204/204 `77471054e78e733b`; A2 91/91 `a0fa93a25b8b9d4c`; A2b 145/145 `380f5c1583338e41` (mutation `0a75912abae8b857`); A3 82/82 `94ca7d782ba120bb`; full suite 201 file (200 pass / 1 fail), 3930 test (3928 pass / 1 fail / 1 skip) `a12c4e9d392aa55d`; `tsc -b --noEmit` exit 0. Fixture browser (gói B, report `b6c316d3135c5e5b`): G0 build dist `26f98b96ad6a006f`; G1 S01 27/27 `4c4a7e71d2caf79d`; G2 S11 26/26 `0de69e3eac3db6fb`; G3 S02 40/40 `a91de90fd5cd394d`; G4 S14 48/48 lượt đọc giống HEAD `0e67d6c1c65f79e1` / `717f994942fea3a6`; G5 runner 119/15 `46630124861d0ee8`, fg04 11/11 `c165b1035613d091`; G6 visual 324 pass / 8 fail / 16 skipped `37cab119e1adfc3a` — A/B trên `96ac0f46` (gói V `00d19f7d95499aa4`): cùng 8 fail, 24/24 PNG trùng → `PRE_EXISTING_ON_96ac0f46`, drift từ crumb shell `c81e8dc2` (tổ tiên của base và baseline); 8 snapshot ghi lần cuối ở `0ddda3d0` (2026-09-07). Hai fail full-suite (A3 `2f745a065fca04b1`): token gate và `r2Ledger` đều `INHERITED_FROM_BASE`; token gate có cả ở baseline và đã sửa; `r2Ledger` do `5a5c79b7`, không có ở baseline (22/22 pass). **Đính chính slice 1:** fail `r2Ledger` không phải "thiếu route P22" (`CG-P22-C`, dòng Test IDs của note slice 1) mà là rule câu chữ evidence của route `INTENTIONALLY_UNEXPOSED` `POST /internal/research/progress/sources/imported` → `CG-FG-R2-01`.
- **Not run / Blocked:** `REAL_API_E2E_RECEIPT` mọi màn; FG-02, FG-03, OL-24 và nửa real FG-01/04/05/06/07 `BLOCKED_BY_RUNTIME` (grant G1–G6; G7 visual đã chạy, không còn xin). Browser receipt cho FE-FG2-04/05 pending (sửa sau lượt B, `UNIT_ONLY`). axe NOT_RUN (G6). Suite visual không phủ S01 Run Library, S11 RC detail, S14 alpha-import wizard. FG-06 chỉ có packet `CG-FG-D1-O1`.
- **VD/CG/debt:** [FG-owner-decisions](./research_loop/evidence/FG/FG-owner-decisions.md) — `VD-FG-05-06`/`-07`/`-02` RESOLVED_BY_OWNER (B), `VD-FG-05-01` superseded bởi `-06` B, `VD-FG-05-11` implemented; mới `VD-FG-08-01…05`, `VD-FG-07-01`; `VD-FG-01-01` vẫn OPEN và chặn 15 ô runner (S01/S04/S05/S06/S07). [FG-backend-requests](./research_loop/evidence/FG/FG-backend-requests.md) — mới `CG-FG-R2-01` (owner Codex). [FG-debt-register.json](./research_loop/evidence/FG/FG-debt-register.json) — FE-A1-01/03/04 và `S14-ALPHAIMPORT-RAW-COLOR` → `resolved_in_slice_2`; thêm FE-FG2-01…05 (`resolved_in_slice_2`).
- **Bobby quyết:** `VD-FG-01-01`; `VD-FG-08-01` (wording 20 câu preflight + 13 câu run-create), `-02` (404 không code trên dataset catalog), `-03` (prose server trong payload thành công), `-04` (refusal run-create không code), `-05` (403 CSRF); `VD-FG-07-01` (8 baseline visual: re-record hay revert thay đổi shell — chỉ Bobby); nhập slice 1 + slice 2; diff 1 dòng `e2e/fixtures.ts:262` (journey-v2 → v3, đề xuất); grant G1–G6.
- **Exit gate chưa đạt:** receipt real-API mọi màn; full suite xanh (chờ `CG-FG-R2-01`); visual gate xanh (chờ `VD-FG-07-01`); 15 ô runner (chờ `VD-FG-01-01`); axe; contract Codex cho các `CG-FG-*`; FG-06. Không dòng nào ở §13.4.1 được nâng thành DONE/CLOSED bởi slice này.

**E11–E17 integration checkpoint (2026-09-27, Codex approved binding scope):**
incoming Claude `a00df203` and local `1ac1c628` are reconciled without losing
history/docs. Incoming 068/069 are appended as **075/076**, applied forward on
the owned baseline 070–074; E12 local equivalent remains 074. No migration
ledger/check-order repair. Final owned browser lane is **30/30**, not the shared
54-cell F3 lane; reference HiFi renders do not claim pixel-baseline approval.
The test project was removed without `-v`, preserving three volumes and all
private receipts. E rows above supersede pending historical checkpoints only
within their tested scope; unrelated F3/F4/F5/visual/print/P24 gates stay open.
[Full integration packet](./research_loop/evidence/P17/E11_E17_INTEGRATION_ACCEPTANCE_2026-09-27.md).

#### G. Frontend — gap còn lại, chốt 2026-09-30 (đọc lại toàn plan; lý do và bằng chứng ở [`FRONTEND_GAPS_STATUS_CLAUDE_2026-09-30.md`](research_loop/evidence/FRONTEND_GAPS_STATUS_CLAUDE_2026-09-30.md))

Gate trên HEAD `a00df203`: `tsc` exit 0 · vitest 52 file **1512 pass** / 1 skip. **Chưa chạy hôm nay:** lane real-API, visual
baseline. Preview `c81e8dc2` (đọc-only, migration 067) **không** chứa E16-R1 (068), E10-O3 (069), RF-04.

Sổ đã ghi sai/thiếu và đã sửa hôm nay: record E14 không tồn tại (đã viết); E14 ghi "ĐÓNG" quá tay (đã sửa dòng E14); đoạn mở
đầu mục F tự mâu thuẫn (đã sửa); 7 dòng board P15–P21 còn trạng thái 26/9 (đã thêm dòng NOW); OL-02, OL-24, D1-O1 rơi khỏi
mục F (vào G3, G11, G12). **Hai quyết định thiết kế đã chốt nhưng chưa ai build: D4 và D7** (G2, G1).

**(b) Claude làm được, không chờ ai**

| Id | Gap frontend | Cỡ | Điều kiện đóng |
|---|---|---|---|
| G1 | **D7** — S08 công tắc "play across folds", mặc định tắt; bật thì đọc cửa sổ kế ở biên fold | S–M | Test: không request nào khi tắt; bật thì đọc đúng một cửa sổ kế; receipt real-API |
| G2 | **D4** — S02 prefill IS/OOS từ coverage của dataset đã chọn (sửa được; không dataset thì trống). Hiện chỉ prefill theo `?alpha=&av=` | S | Test + ảnh S02 ở 1440/660 |
| G3 | **D1-O1** — nhãn `R-WFO-###` khi mở thẳng S09/S11/S13 bằng link (3 read chưa trả `display_label`; backend ≤P21 nhỏ). D1-O2 (card S01) **đã đóng** ở `05f0d6a0` | S | 3 read mang `display_label` (contract + fixture + test) + ảnh |
| G4 | Ladder S13: mũi tên `claim ↑ →` treo ở cuối hàng | S | Ảnh 1440/660 |
| G5 | S09: chạy lại in Letter/A4; nhìn lưới 6 đường trên dữ liệu thật; ô `NET_RETURN` + qualifier P04 chờ G10 | S | Ảnh + PDF hai khổ giấy |
| G6 | Visual baseline chạy lại sau S08/S12 — **chỉ** `./scripts/portal-web-visual.sh` (image ghim); ô nào lệch thì trình Bobby, không tự sinh lại | S (~18 phút chạy) | 332 pass hoặc danh sách ô lệch đã duyệt |
| G7 | Probe a11y RF-04 không thấy `[data-screen]` trên dev server (mọi màn) — lỗi harness | S | Probe chạy được, axe trên từng màn |
| G8 | S06 dải glyph theo fold "what this mode reads" (HiFi 6.4) | M | Ảnh so HiFi + test |
| G9 | S14 registry strip: cap "top N / total" (chưa cần ở 1 entry) | S | Khi > 1 màn hình entry |
| G10 | **Stack ghi được + run mới** — cổng chung cho receipt thật của E13, E14 (`NET_RETURN` + qualifier), E16-R1 (dải nến P04), E10-O1/O3, S02 create + preflight, S14 write. Gộp F4 + F5 | — | Receipt cho từng mục; **cần Bobby gật** (phương án ở file trạng thái §4a) |
| G11 | **OL-02** — receipt verify byte: MATCH + một MISMATCH có chủ ý, observer bật | S (cần G10) | Hai receipt lưu vào P16 |
| G12 | **OL-24** — P23 browser-real / research-dev | Codex + Claude | Receipt trên research-dev |

**(c) Chờ Codex** — frontend đã hiện typed absence, tự sáng khi field có: OL-13 (rc chip S01, "last published RC" S02) ·
OL-07 + OL-09 (S11: mirror + lỗi publish) · OL-03 (pick S10) · OL-05 (S11 publish thật) · E16-R2 (engine pin S07) ·
E6-BR-01 (chữ ký/SBOM S14) · E5-O1/O2 (engine).

**(a) Bobby quyết/duyệt:** gật G10 · duyệt **VD-RF04-01** (S12 cao hơn HiFi 205 px) và **VD-RF04-02** · bảng lệch HiFi S14 (E6) ·
D-B1 token `--ink-faint` · độ phân giải dải nến S08 (WFO 160 / P04 48) · mật độ S13 khi > 12 attempt có claim ·
migration cho `CLONE_OF` (E13-O3) · backfill overview P04 cũ.

**Điều kiện đóng P15–P21:** F3 (build lại preview + lane xanh 54/54) · G6 · G10 với receipt thật · G1–G4 xong hoặc Bobby chấp nhận
hoãn · các mục (a) được duyệt.

**F5 ledger — đối chiếu với code `71aed3e6`, 2026-10-01 (Claude; 50 dòng kiểm, 17 đính chính).** Append, không xoá; chi tiết + locator từng dòng: [`f4/LEDGER.md`](research_loop/evidence/P21/audit-2026-09-30/f4/LEDGER.md). Không dòng nào ở đây được nâng thành đóng chỉ vì sổ cũ ghi đóng; dòng Codex không đụng.

| Dòng | Trạng thái thật | Đính chính (sổ cũ → thật) |
|---|---|---|
| E1 | PARTIAL | "bảng a11y làm tròn" → chưa; ISO-ms còn ở S01/S11 |
| E2 | DONE | tên slider `rvol/slpercent` → nay không in tên khi server không publish slider |
| E3 | PARTIAL | "còn trục 6 tick, NET_RETURN, qualifier P04" → đã xong; còn in Letter/A4 thật |
| E4 | PARTIAL | "S03 ĐÓNG" → S03 không có code; BLOCKED_BY_CODEX(CG-FG-S03-02) |
| E5 | DONE (FE) | E5-O1/O2: BLOCKED_BY_CODEX |
| E6 | DONE (FE) | "cap registry strip còn" → xong; stepper chưa có phím mũi tên (OPEN nhỏ); E6-BR-01 BLOCKED_BY_CODEX |
| E7 | DONE (FE) | "ladder S13 mũi tên cuối hàng" → đã sửa (VD-F1-03) |
| E15 | DONE (consumer S03) | không phải do E15; manifest bảy dòng = CG-FG-S03-04 |
| D1–D3, D4, D7, D8, D10 | DONE | D4/D7 "chưa ai build" → đã build (`coveragePrefill.test.tsx`, `executePlayAcrossFolds.test.tsx`) |
| D5, D6 | WONT_DO(decision) | không có code, đúng quyết định |
| D9 | PARTIAL | chờ VD-RF04-01 |
| F1 | PARTIAL | chiều cao S12 chờ Bobby |
| F2 | DONE | — |
| F3 | OPEN | lane 54 ô chưa chạy lại; 2 ô S00 BLOCKED_BY_CODEX(CG-S00-AV-01) |
| F5 | PARTIAL | refusal chỉ có unit/fixture |
| F9 | PARTIAL | "đổi token là đụng baseline" → đã đổi trong `.research-screen` (`tokens.css:654`, 4.93:1/4.64:1); chưa axe, chưa duyệt baseline |
| F12 | PARTIAL | "mũi tên treo" → đã sửa |
| F13 | OPEN | visual chưa chạy; Bobby duyệt từng ô |
| G1, G2, G8, G9 | G1 PARTIAL (thiếu receipt real) · G2/G8/G9 DONE | "chưa build/chưa cần" → đã build |
| G3, G4 | DONE | "3 read chưa trả `display_label`" → đã trả và FE nhớ cả 3 |
| G5 | PARTIAL | in Letter/A4 mới có fixture lane |
| G6 | OPEN | = F13 |
| G7 | PARTIAL | harness đã viết lại (`ac0b3101`), chưa chạy axe |
| G10, G11 | OPEN | cần Bobby gật; G11 phụ thuộc G10 |
| G12 | BLOCKED_BY_CODEX(OL-24) | — |
| VD-RF04-01/-02 | OPEN | chờ Bobby |
| VD-F1-01…03 | DONE | — |
| VD-TEXT-01 | PARTIAL | còn `codeAnatomy.ts` và câu vắng dùng chung |
| VD-FG-01-01 | DONE | sổ B1 ghi OPEN → Bobby chốt 2026-10-01 (`f4/REFUSAL.md`, `researchPanel.refusal.test.tsx`); còn S04 passport + S14 `<details>` |
| VD-FG-07-01, VD-FG-08-01…05, VD-FG-01-17 | OPEN | chờ Bobby |
| VD-FG-04-01/-04/-05 | PARTIAL | -01 thay bằng VD-F1-03 |
| VD-FG-05-02/-06/-07/-11 | DONE (FE) | — |
| VD-FG-01-18/-21/-26 | OPEN | có điều kiện, BLOCKED_BY_CODEX(CG-FG-S10-04, CG-FG-S11-03) |

#### C. Nợ tài liệu

**Full qualification goal continuation — 2026-09-27 (Codex):** Bobby approved
all eight groups in the private goal objective: F6; migration compatibility;
F4/E10 recovery; OL-02 integrity; OL-12/P23; F3/F5/OL-24; E6-BR-01; P24.
The goal remains ACTIVE until the complete candidate is ready for Bobby review;
no push, main/dev merge or Production rollout is authorized by this checkpoint.
F6 first actual run on `decb5f6c`: 9/11 PASS, two stale assertions fail
(published `lane` omitted; RS-02 seal confused with a P13 projection).
Fixes retain strict provenance, exact source values and no-GET-recompute checks.
Migration 068/069→075/076 compatibility is IN_PROGRESS, without ledger rewrite
or deleting DB data. P23 verifier review also found mismatched T-id semantics,
unverified referenced byte hashes and optional runtime measurement; these must
be repaired in P23 before qualification, not hidden by receipt-only PASS.
Current checkpoint: F6 is CLOSED (11/11). Exact preview-ledger readback ends at
067, not the historical contributor source labels 068/069. Isolated forward
upgrade 067→076 and no-op migrator restart both PASS (2/2), preserving original
ledger/data/auth sentinels; shared preview rebuild remains F3, not claimed here.
P23 verifier repair passes 12 unit tests and its samplers pass 7 Node tests,
including canonical Library GET coverage. These are not real qualification
receipts. F4/E10, OL-02, OL-12/P23 workload, F3/F5/OL-24, E6-BR-01 and P24
remain open. [Exact evidence and next steps](./research_loop/evidence/P23/F6_MIGRATION_VERIFIER_CHECKPOINT_2026-09-27.md).

**Next runtime slice started — 2026-09-27:** checkpoint committed as `12e00e7f`
after the unbypassed whole-workspace gate (Control API 1315 PASS / one external
real-data test skipped separately, contracts 195 PASS). One owned P23 cell is
being provisioned on loopback 8096 with private random credentials, no
auto-login, 20 actual reader identities plus two test operators and the exact
5,000,000,000-byte aggregate profile. The P23-only activation overlay admits
explicit byte verification/what-if/publication; every Execution flag stays
dark. Next actual evidence is F4/E10 lost-terminal/retry-expiry/live-lease
preservation and OL-02 observer MATCH/MISMATCH on a test copy. Provisioning or
green instrumentation does not close runtime qualification or P24.

**Owned runtime checkpoint complete — 2026-09-27:** F4/E10 and OL-02 now have
actual fault/observer proofs, including intact original bytes/seals, exactly
one recovered real terminal, typed retry expiry and a byte-identical live
lease. All 22 namespaced principals used real auth lifecycle, no auto-login.
Temporary terminal fault removed, observer root restored, worker resumed.
Four of the full goal's eight scoped groups have backend proof; OL-12/P23,
F3/F5/OL-24, E6-BR-01 and P24 remain open. [Current packet](./research_loop/evidence/P23/RECOVERY_INTEGRITY_RUNTIME_CHECKPOINT_2026-09-27.md).

**Read/outage/import checkpoint — 2026-09-27 (supersedes only these statuses):**
E6-BR-01 now publishes generated source-only attestation with actual signature/
SBOM `NOT_PUBLISHED` and exact source locator; real DRAFT register/replay/list
and injection 400 pass. This closes semantics, not a signature infrastructure
or full S14 browser claim. Library admission, bounded same-snapshot card SQL,
HEAVY WFO/import queue, pool-disconnect survival and owned-gateway DNS refresh
are implemented. Actual corrected PG/NATS/worker outage and twenty-reader
warm read pass; dirty diagnostics do not close full P23. Focused 68 backend,
14 verifier and 23 Node tests pass. First full hook: 1329 pass, one fail, one
external skip; the HEAVY lineage fixture now uses fenced terminal transitions
and verifies queued same-intent retry, focused real-PG/Node-22 40/40 PASS.
Full hook retake for `4e343fe9` **PASS**: Control API 1330/one external skip,
contracts 196, 219 snapshot files MATCH, 241 routes/zero collisions. Five of eight goal groups have scoped backend
proof; OL-12/P23, full F3/F5/OL-24 and P24 remain active. Exact failed probes,
new receipts/hashes, dependency pins and cleanup boundary are in the
[new packet](./research_loop/evidence/P23/READ_OUTAGE_IMPORT_CHECKPOINT_2026-09-27.md).

**Clean mixed-load/Library repair continuation — 2026-09-27:** clean candidate
`4e343fe9` cold API-process read PASS; actual HEAVY completed with four queued
intents and twenty readers, cap/no-implicit-job PASS but Library p95 789 ms FAIL.
The target remains 500 ms. New narrow SQL removes unused 60-KiB WFO summary/
candidate transport; separate envelope validation avoids revalidating cards
already validated by the shared P12/P19 mapper. Exact public-response parity
(only transaction timestamp differs) and focused 30/P12 PG 11 tests PASS.
Diagnostic p95 341→248 ms is not a new runtime PASS. Next: commit/build exact
candidate and mixed-load; remaining P23 faults/coherent restore/isolation/
plateau/utility/upgrade/browser and P24 remain in the original full goal.

**Mixed-load/coherent-restore continuation — 2026-09-27:** application
`b2e8b868` clean build/up and actual twenty-reader mixed HEAVY workload PASS;
Library p95 **490 ms**, cap peak **618209280 bytes**, jobs **20→20**.
Cold process/pool reads PASS, not a host/HMD cache flush. Coherent DB+artifact
restore now PASS: 139 table hashes, 9 SEALED artifacts, 54 parts, 337 files;
five API reads succeed with worker off, original volumes resumed. A real
containerd index-retention issue and PostgreSQL CHECK reparse difference were
fixed in the owned tool path; failed attempts are preserved. No frontend/app/
migration changes in that harness slice. T14 stays OPEN because this cell's
selection/promotion/publication relations are empty, not a valid nonempty
reference-graph proof. Remaining plateau/disk/security/utility/scale/upgrade/
browser and P24 are unchanged; full eight-group goal stays ACTIVE.
[Exact hashes, identity boundary and cleanup](./research_loop/evidence/P23/MIXED_RESTORE_CHECKPOINT_2026-09-27.md).

**Publication/tenant continuation — 2026-09-27:** the owned current WFO public
draft→seal→publish journey created one actual RC/R1/publication. Exact retry
preserves the R1 and cardinality, but exposed terminal `replayed:false`. The
P22 service now returns true only for terminal POST replay after unchanged
actor/payload checks; GET stays false, no duplicate delivery/write. Focused
17 tests and TypeScript build PASS; clean-image runtime retake still pending
at this code checkpoint. Ten scoped nonmember/named-read/ETag checks PASS,
not full file/export isolation. Earlier restore's empty graph is historical:
the newly populated publication has not yet been restored/GC-qualified.
Full goal/P23/P24 remain ACTIVE. [Failed proof, repair and next action](./research_loop/evidence/P23/PUBLICATION_REPLAY_CHECKPOINT_2026-09-27.md).

**Actual publication/security retake — 2026-09-27:** clean owned Control API
`19a8e813`, six unchanged per-image-pinned services reused, gateway DNS refreshed.
Three retries of the existing sealed RC return `replayed:true` with one unchanged
publication/R1; GET false. Auth/membership hashes unchanged. Actual export
isolation **19 checks PASS** and publication negatives **five PASS**, additional
to the ten named-read/ETag checks. These are scoped T05 proofs, not full T05/T14.
Full hook **1333 Control API + one external skip / 196 contracts PASS**.
This supersedes pending retake above, not the historical failed assertion.

**W08/T02 started — 2026-09-27:** actual current-image WFO warmup
`rrun_0d7891d8904d2a753d87771a59ffcdde` COMPLETED/READY. The next owned
measurement fixes three complete/fail/cancel rounds, unchanged parent PID/start
identity, exact 5-GB aggregate snapshots, RSS/PSS/FD and market/supervisor
scratch inventory before execution. Fault kills only the newly admitted,
receipt/lease-bound unshare group; cancel is public API. Thresholds are fixed
before measurement: parent RSS/PSS growth ≤64 MiB and FD growth ≤4, **zero
new transient scratch bytes/files at quiescence**. No parent restart, source
rewrite, old artifact deletion or UI change. No T02 PASS before actual cycles.

**W08 actual continuation — 2026-09-27:** six actual terminal jobs complete two
rounds; scoped worker FD/RSS/PSS remains bounded, but supervisor scratch grows
42 files/1006525 bytes. Third-round admission reaches the actor's eight-live-
preflight budget, not an engine failure. Tools now wait for natural expiry and
select the actual Node process (old API PID1 was Docker init, not valid app RSS).
`CG-P23-T02-01` above is the precise Claude-owned source repair, not a new phase.
No repeated predictable failure, threshold relaxation or scratch deletion.
T02/P23/P24 remain unqualified; T03/T12/T14 continue on the owned cell. Current
capacity: active compute/exports zero, nine original seal pins unchanged.
[Actual receipt and preserved failures](./research_loop/evidence/P23/PLATEAU_CHECKPOINT_2026-09-27.md).

**T12 utility continuation — 2026-09-27:** actual scoped diagnostic exposed a
P23-only mismatch: Control API admitted what-if but worker lacked its flag,
then lease expired with source sequence zero. Fixed only the owned worker
overlay, recreated exactly one container; same images/caps/AppArmor/mounts,
six other containers and 78 original auth/membership/seal rows unchanged.
Real retake: primary and diagnostic COMPLETED/READY, 81/81 grid cells and
63/63 unique evaluations sealed, eight exports READY/six verifies MATCH,
exact parent/selection preserved; two explicit jobs, peak 656769024 bytes.
T12 stays PARTIAL pending audit/quota negatives; T02 source repair, other
P23 gates, full cross-stack and P24 stay OPEN. No application rebuild,
frontend, shared 8095, Production, dev/main or push. [Hashes, actual failures,
runtime identity and cleanup](./research_loop/evidence/P23/UTILITY_CHECKPOINT_2026-09-27.md).

**T14 actual graph/restore continuation — 2026-09-27:** the owned cell's
source-backed RC and R1 passed a supported-API independent decision:
PENDING@1→APPROVED@2, one immutable promotion pick and two versioned
settlements. An owner step-up granted one exact-workspace R1 capability to an
existing USER/member and revoked it after the decision; post-revoke R1 read
403 and active grants zero. No membership SQL edit. A fresh-volume coherent
restore then matched 139 table hashes, 16 SEALED artifacts/127 parts/753
files, and five worker-off reads; post-restore publication/pack/reference
hashes, null-trial RC pin and GC-reference refusal remained exact. **T14 is
PARTIAL**, because real exposure and AUDIT_OF_SELECTION child facts are absent
from this cell. No fabricated rows, sweeper deletion, shared preview or
Production mutation. P23/P24/full goal remain OPEN. [Exact receipt hashes,
test and scoped cleanup](./research_loop/evidence/P23/APPROVAL_GRAPH_RESTORE_CHECKPOINT_2026-09-27.md).

Đã sửa trong commit này: README P16/P17 (ghi chú 2026-09-26 cũ), file audit P15–P23 (đánh dấu
đã bị thay bởi sổ này), header request P19. Còn lại: các đoạn "chưa đóng" lịch sử trong §13.5
(P10, P13–P20) — **không xoá** (luật A13.1), sổ này thắng chúng. 2026-09-30: dòng board P15–P21 đã có dòng NOW đứng đầu; link record E14 hết gãy.

#### D. Thứ tự

1. Claude: ~~OL-20~~ ~~OL-21~~ → E10 → E1 → build lại preview → OL-23 → OL-22 → phần còn lại của mục E theo thứ tự ở E; OL-02 receipt verify.
2. Codex: OL-03…OL-11 and OL-13 backend/real-preview are closed in the P22 packet; next backend runtime scope is OL-12 (P23 qualification). Claude consumes P22 fields in S01/S02/S10/S11.
3. Bobby/ops: OL-01 phần host production.
4. P24 chỉ mở khi A và B rỗng (trừ những mục Bobby chấp nhận có chủ ý).

**P22/P23 backend gap audit (2026-09-25):** P22 closes a revoke-between-intent-and-R1
authorization race and retains one retryable intent after reversible R1 errors;
P23's strict receipt now refuses missing services and measures complete reads/peak
memory. [P22 packet](./research_loop/evidence/P22/README.md) · [P23 packet](./research_loop/evidence/P23/README.md). Neither phase is marked product-qualified without its real preview/browser and load/DR receipts.

**Status vocabulary:** `PLANNED → IN_PROGRESS → TECHNICALLY_COMPLETE → DEV_REVIEW_READY`
(khi có UI) `→ AWAITING_BOBBY_REVIEW → OWNER_ACCEPTED`; `BLOCKED` ghi exact failed/missing gate.
Bobby quyết scope tiếp; một owner approval đã có không xin lại dưới tên khác.
Phần Bobby làm trước được gắn vào chính row phase, không tạo “phase Bobby” song song.

<a id="rl-fe-w1-w7-note"></a>
### 13.4.2. FE campaign W1–W7 — implementation note (Claude, 2026-10-04; mẫu §13.6)

```text
Phase / assigned scope / effective Linux identity: P21–P24 frontend consumer; W1 run-status/exits/cursor links, W2 New Run + draft + Import, W3 shell/mobile top bar, W4 ít chữ, W5 chart contract + axe + a11y, W6 browser/print acceptance fixes, W7 Codex contract consumption + raw-token humanising + evidence-read gating; Linux user bobby
Worktree / branch / base SHA / head SHA / upstream dependencies: /home/bobby/portal-research-fe · claude/fe-parity · base b2098a81 · head 0d1b54d7 (code) · rebased on codex/be-gaps 0df6030f · depends on Codex d5d09875 (blocked_action, rail ordinal) and 7d18fe4e (workspace + linked-audit consumer)
Implementer / reviewer / cross-agent handoff approval: Claude (Thanhvuong lane) / Bobby (NOT_VERIFIED) / Codex consumer slices approved by Bobby 2026-10-04
Goal and delivered BE/FE panels/actions: FE only. Screens S00–S14 (+S04 404); G-25 search by R-label, G-26 Journey v5, B-1…B-5 and §31-1/2/3/5 bound; legacy export is prepare-then-download (f0346ef8); linked-audit panel typed "not applicable" where the server's audit_target_kind says so
Files changed + real Git additions/deletions: git diff --numstat b2098a81..HEAD -- apps/portal/frontend (awk-summed) = 228 text files + 127 baseline PNG, +11091/-5756
Contracts + numeric/source/authority mapping: no new contract authored by FE. Consumed generated types: Library q=R-… (G-25), Journey v5 (G-26), run_status/lifecycle.failed_at/report_sealed/selected_trial_ordinal(+scope/reason), blocked_action, final_audit.audit_target_kind; a real non-zero value that rounds to zero prints ≈0 (Bobby 2026-10-04)
Guide test IDs + source test IDs + actual commands/results/reused evidence: vitest full 5918 passed / 1 skipped / 340 files; tsc clean; preview lane (_preview-research-real-api + w1 + w5-gate) 227/228 on index-Bu8sUwob.js (the 1 is a load flake, 3/3 alone); P24 matrix e2e/_preview-research-p24-matrix.spec.ts 73 cells / 682 checks = 613 PASS / 0 FAIL / 69 NA; cross-screen reconcile 182 PASS / 18 FAIL / 75 NA / 6 PASS_WITH_NOTE (the 18 are the stale seals of R-WFO-022/023 plus Codex requests §32-1/2/3); no unit/Playwright result is counted for T05
Delta source/data/engine/effective-spec + direct/storage/API/DOM comparison: FE compares DOM to the served API on real runs (real-API lane, reconcile script); no engine or data recompute by FE
Visual/real/regression lane refs + copy/layout/console/network outcomes: research-loop.visual.spec.ts 28 baselines; visual.spec.ts 100 PNG; overflow 0 at 390/360/1280/1440; console 0 errors on every matrix cell
Resources + scale-refine six fields + bounded cleanup decision: no backend resources; FE cardinality limits as W4/W5 (one tab stop per chart, tables over 120 rows behind "Data"); no cache deletion
Protected Execution/kernel/shared surfaces + data/auth preservation: no Execution/kernel/backend edit; tokens --ink-faint/--ink-mute/--maturity-prototype changed with Bobby approval; no flag, contract or migration added by FE; reconcile probes read-only, negatives refused (401/403/404)
Dev URL / bundle/API/image/config/schema identity + rollback receipt: research-portal (:8095) serves index-Bu8sUwob.js; migration 094; images in ~/.config/portal-research-preview/identity.json; rollback: revert order in FE-W1-W5/thanhvuong-rollback.md
Debt / owner decisions / external dependencies: OPEN_LOW DEBT-LEGACY-ES, DEBT-PRINT-REALDEVICE (review item); DEBT-OOS-ZERO CLOSED (≈0); T05 BLOCKED_EXTERNAL (Portal gateway refuses 1.1.0; Bobby + Codex); imported-alpha execution on this stack is PREFLIGHT_ONLY (Codex §32-4); stale seals R-WFO-022/023 by design (CREATE_NEW_RUN_AND_SEAL)
Exit gate outcome / Bobby review state: READY_FOR_BOBBY_REVIEW for the frontend candidate after the final rebuild; not OWNER_ACCEPTED, not DEPLOYED beyond the research preview
Next phase/action + remaining prerequisites: Bobby by-eye review (screenshots under /home/bobby/portal-research-qa-2026-10-03); Codex answers to §32; P24-T12 scenario runs (21 NEEDS_RUN, smallest run per row in SCENARIO_MATRIX_16_6); signed release is a separate Bobby instruction
```

## 13.5. Chỉ mục thực thi từng phase

Mỗi mục dưới đây kế thừa G0–G7 và toàn bộ guide, không được dùng danh sách test tóm tắt
để bỏ test source. Foundation harness vẫn là output độc lập, nhưng sau contract freeze
không được dùng nó để trì hoãn HIFI composition đã có screen/panel semantics (§13.2.1).
Mỗi phase phải đóng **BE + consumer trong scope** trước khi bàn giao; visual recovery
được ghi as a bounded FE slice trong row/evidence phase gốc, không invent completion của
downstream BFF/action phase.

<a id="rl-p01"></a>
### P01 — Baseline, source inventory và protected boundaries

**Đọc chi tiết:** [Guide P01](./research_loop/RESEARCH_LOOP_GUIDE_V1_1_24_PHASES_vi.md#phase-p01); [toàn bộ S00–S14](./research_loop/release-v1.1/docs/SPEC_INDEX.md).
**Entry:** dependencies/assignment tại [board](#rl-board) đã đạt; [G0–G7](#rl-test-gates) áp dụng.
**Test IDs bắt buộc:** `P01-T01…T08`, `V11-P01-DR/BR/GX` và source tests applicable theo §13.3.

- **Goal:** Ghim source/engine/reader/hi-fi/permissions trước thay đổi; biết cái gì đã tồn tại và cái gì chỉ là proposal.
- **To-do BE:** Inventory producer/facade/RunSync/governance, DB/queue/storage/flags; protected manifests + Research allowlist. Pin Delta kernel/spec/snapshot permission; xác nhận quota, env location, contributor remote; gom bootstrap packet còn thiếu một lần.
- **To-do FE/consumer:** Đọc đủ15 HTML/spec và handlers, source test IDs, assets/fonts, prototype controls; lập field/action/scenario matrices. Đối chiếu Research với shell đã phát hành, không sửa Execution navigation theo sidebar SOON trong prototype.
- **Tests BE:** Hash source; protected-diff detector trên copy; secret-redaction; route collision; quyền reader; quota evidence (unknown≠measurement).
- **Tests FE/browser:** Inventory từng field/action đủ locator và trạng thái; nhận diện demo finish/publish/verify; phát hiện thiếu doc-page.js; phân biệt parsed HTML với rendered baseline.
- **Exit gate:** Baseline/allowlist/source matrix có denominator; source/identity ownership rõ. Bootstrap gaps có target phase; không tuyên bố real compute/browser PASS.
- **Rollback/handoff:** Chỉ thêm inventory/redacted evidence; không sửa server. Bàn giao P02 baseline, COR/FND/DR và exact provisioning needs.

#### P01 closeout rule and recorded result — 2026-09-19

- Codex completed the approved source/discovery scope on shared branch
  `docs/research-loop-plan`: 15/15 HTML + 15/15 specs, 73 field records, 194
  action records, 56 prototype-only records, 180 literal static route entries,
  protected-kernel SHA and all `P01-T01…T08` evidence are recorded in
  [evidence/P01](./research_loop/evidence/P01/README.md). `V11-P01-DR/BR/GX`
  are explicitly scoped: Delta source/reader mapping only, browser
  `DISCOVERY_ONLY`, no runtime/deploy claim.
- **Generated baseline rule:** the CSV/JSON files under `evidence/P01` are
  machine-derived. If any tracked source input recorded in `baseline.json`
  changes, the same coherent change must run `--write` then
  `test-p01-baseline.sh`; its capture fence rejects dirty implementation roots.
  Do not hand-edit inventory rows or promote parsed HTML to browser acceptance.
- P01 creates no runtime resource. Cleanup decision is `NO_ACTION_NEEDED`;
  the self-test removes only its own temporary copy. There is zero known
  unresolved implementation defect in P01 scope. `P01-GAP-01…07` have exact
  later-phase ownership in the decision register and are not silently waived.
- **Claude coordination:** no UI code is requested in P01. Claude may perform
  a discrepancy-only semantic/visual review of the two matrices against all
  HTML/spec pairs; they must not alter Execution Carbon, global routes,
  accepted UI or backend contract. A real browser/artifact review is a later
  approved gate, not a missing P01 visual pass.

#### P01 baseline rule amendment — RF01-B2, 2026-09-23

Bobby chọn Q2: P01 là **bản chụp lịch sử**. `p01-baseline.mjs --verify` chỉ
đúng tại commit ghi `baseline.json`; từ nay kiểm nó bằng
`scripts/research-loop-v11/test-p01-capture.sh`, chạy verifier của chính commit
đó trong một worktree tạm (PASS, T01–T08). Phần phải sống là
`test-route-inventory.sh`: không route tĩnh nào khai báo hai lần, protected
kernel khớp manifest, và tập route bằng ledger đã commit
`evidence/P01/route-inventory.live.json` (225 route tại lúc ghi). Gate này nằm
trong `scripts/verify-workspace.sh`, nên chạy ở mọi commit. Hai phép thử âm
đã chứng minh nó đỏ: một route trùng `/api/v1/research/quantbt/atlas` và một
route mới chưa ghi ledger. Một change thêm/bớt route ghi lại bằng
`p01-baseline.mjs --write-live-routes` trong chính change đó.

#### P01 Claude review result — 2026-09-19, `SOURCE_REVIEW_PASS_WITH_ONE_FINDING`

Discrepancy-only review of `screen-action-matrix.csv` and `screen-field-matrix.csv`
against all 15 HTML/spec pairs. No UI, route, token or contract was changed.

- **Matrix → source: 0 defects.** All 267 rows (194 action, 73 field) resolve to
  a real `file:line`; every non-empty `source_copy` is present in its element,
  including `<select>` rows whose copy is the space-joined option labels.
- **Source → matrix: 0 omissions.** Independently extracted every
  `<button|input|select|textarea>` across the 15 screens — 140 controls — and
  each one has a matrix or `prototype-controls.json` row within ±1 line. The
  denominator holds; screens 00 and 09 legitimately carry zero form controls.
- Three apparent mismatches were **my checker's fault**, not the baseline's:
  a ±2-line window too narrow for multi-line elements, `&quot;`-escaped JSON in
  `data-props`, and a token split that broke the joined option labels. Recorded
  so the next reviewer does not re-raise them.

**Finding P01-FE-01 — state coverage is uneven in the screen specs.** Searching
each spec for all seven required states, counting Vietnamese and English
wordings both (`đang tải/loading`, `rỗng/empty`, `một phần/partial`,
`cũ/stale`, `từ chối|403|không có quyền/denied`, `không khả dụng/unavailable`,
`lỗi|failed/terminal`):

| state | specs naming it | state | specs naming it |
|---|---|---|---|
| terminal | 15/15 | stale | 7/15 |
| loading | 11/15 | **denied** | **5/15** |
| empty | 8/15 | **unavailable** | **4/15** |
| partial | 8/15 | | |

Only `01_run_library.md` names all seven. The two weakest are exactly the pair
G4 forbids a screen from collapsing into, and RL-L02 names as the Execution
failure being inherited against. The consequential gap is
`11_release_candidate.md`, which never names a denied state although publishing
an RC is the most permission-bound action in the set; `02_new_run.md` has no
`unavailable`. This is a **specification** gap, not a defect in P01's capture:
the matrices faithfully record what the source says. It is raised here so the
owning phases (P10 for S02, P21/P22 for S11) inherit it explicitly rather than
discovering it at their own G4.

#### P01-FE-01 resolution — 2026-09-19

Bobby selected the early, narrow remedy rather than waiting until every screen
phase: [Research Screen State Semantics v1](./research_loop/release-v1.1/docs/RESEARCH_SCREEN_STATE_SEMANTICS_V1.md)
freezes the seven presentation states and their authority/transport rules; S02
and S11 now explicitly carry the immediate `denied`/`unavailable` cases and
test IDs. This prevents the security-sensitive publish screen from reaching its
implementation phase without a refusal state.

This closes the **systemic language and immediate S02/S11 specification gap**;
it does not call all 15 screens implemented. Every owning phase must link the
shared state contract and add its own field/panel/browser evidence before its
exit gate. In particular, P10 owns S02 implementation and P21/P22 own S11
implementation.

<a id="rl-p02"></a>
### P02 — Contract freeze và unchanged-Execution compatibility spike

**Đọc chi tiết:** [Guide P02](./research_loop/RESEARCH_LOOP_GUIDE_V1_1_24_PHASES_vi.md#phase-p02); [spec S02](./research_loop/release-v1.1/docs/screens/02_new_run.md) + [HTML 02](<./research_loop/release-v1.1/QuantBT 02 New Run Preflight.dc.html>); [spec S11](./research_loop/release-v1.1/docs/screens/11_release_candidate.md) + [HTML 11](<./research_loop/release-v1.1/QuantBT 11 Release Candidate and Publish.dc.html>).
**Entry:** dependencies/assignment tại [board](#rl-board) đã đạt; [G0–G7](#rl-test-gates) áp dụng.
**Test IDs bắt buộc:** `P02-T01…T13`, `V11-P02-DR/BR/GX` và source tests applicable theo §13.3.

- **Goal:** Chứng minh đường Research→existing R1 trước khi xây màn; khóa IDs, action semantics và contract ownership.
- **To-do BE:** Endpoint map/canonical request discriminator/envelopes; isolated actual facade202→RunSync→strict approval readback; bốn digest, alpha alias/claims/actor. Chốt DR01–07 bằng source, không invent holdout/promotion authority.
- **To-do FE/consumer:** Typed client/fixture harness cho wizard/RC mirror, typed conflict/unknown/reauth; URL pick/trade/study codecs; công bố handoff fields/actions, không giả UI hoàn thiện.
- **Tests BE:** 202 positive/201 negative; wrapper canonical hash Unicode/numeric/null; wrong actor/workspace/alpha/claim; duplicate/pending/timeout recovery; extra-field rejection; no protected consumer diff.
- **Tests FE/browser:** Fixture consumption/runtime validation; raw status vs display copy; cursor ambiguity/deep-link; inspection không write; UI role không vượt server permissions.
- **Exit gate:** Actual unchanged consumer spike PASS; identity/auth/hash/202 gaps không defer tới P22. Owner decisions chỉ treo feature đúng phạm vi với explicit downstream gate, không tự waive.
- **Rollback/handoff:** Rollback Research harness/schema mới; retain fixtures/protected hashes. Checkpoint01: packet P01/P02 + endpoint/identity/correction map cho Bobby.

#### P02 backend closeout rule and recorded result — 2026-09-19

- Codex completed only the approved Research-owned compatibility harness and
  evidence packet. It does not modify any Execution contract/runtime, Portal
  production runtime, database, protected QuantBT bytes, browser UI/UX or
  deployment input. `research.run-request.v1` is frozen as a future
  producer-side envelope while preserving the three legacy top-level fields
  needed by the unchanged `202` facade path.
- The exact compatibility receipt is recorded in
  [evidence/P02](./research_loop/evidence/P02/README.md): static protected
  boundary pass; 63/63 source/contract tests after the contract/spec amendment in a self-removing PostgreSQL
  16 tmpfs cell; and a read-only/no-network freeze assertion under the exact
  Python `3.12.14` runtime pin. No real-data/browser result is inferred.
- A pre-existing D4 synthetic-test cleanup failure found by the mandatory
  checkpoint hook is repaired in the same checkpoint: only its own
  root-owned `mktemp` fixture directory is removed with the authority that
  created it. This is test hygiene only; it changes no D4 runtime, contract,
  service, deployment or production data.
- P02 status is `CONTRACT_AMENDMENT_COMPLETE`. The frontend review has supplied
  its concrete contract findings and the P02 amendment closes them without a
  runtime change. Remaining entry gates are explicitly assigned: P03/P10
  producer principal/authentication, P04 actual Delta/resource evidence, and
  P10/P21/P22 screen implementation/browser evidence. See
  `evidence/P02/debt-register.json`. Those gates must not be closed by edits to
  Execution or by calling a mock result a product acceptance.
- **Claude coordination:** use
  [handoff-claude.md](./research_loop/evidence/P02/handoff-claude.md). Review
  only S02/S11 fixture/error/cursor UX, keep UI changes in a separate commit,
  and do not alter the protected runtime/contract files listed there.

#### P02 Claude frontend review result — 2026-09-19, `FE_REVIEW_COMPLETE — AMENDMENT_APPLIED`

Review of the frozen contract against what S02 and S11 must render. No file
under `apps/control-api/src/facade/**`, governance, runtime manifest, deploy
input or protected QuantBT source was read for modification or changed.

**Finding P02-FE-01 — `research.requested_spec` is the only untyped field, and
it is where the whole S02 wizard would live.** In
`scripts/research-loop-v11/p02-contract.mjs` every sibling gets a typed
validator — `identifier()` for `client_intent_id`/`alpha_version_id`,
`string(min:16,max:512)` for `preflight_token` — while `requested_spec` is
validated as a bare `record(...)` with no inner shape. `optimizer-binding.json`
already reaches inside it for `requested_spec.optimizer.trial_budget`,
`requested_spec.seeds.strategy_seed` and two more, so structure is assumed but
not declared.

The frozen envelope names **7 fields** in total (3 legacy compatibility, 4
research supplemental). P01 records **24 fields and 24 actions** on S02 alone —
fill model, same-bar resolution, tick, portfolio mode, sizing rule, engine route
R0…R3B and the rest, every one of them a `<select>` or `<input>` with a fixed
option set visible in the hi-fi. Those 24 controls have no typed home.

Why this matters before P10 rather than during it: G4 requires a **named DTO per
panel and action**, and RL-L02 records that the expensive Execution failure was a
rich screen degrading into an envelope when the response could not carry it. A
generated client cannot be produced from `record()`, so the wizard would be
hand-mapped against field names — which is the exact shape of RL-L01
("backend done, consumer not wired") and RL-L11 (provenance swapped for speed).

This was **not** a request to change the frozen envelope's top level, and not a
claim that P02's backend spike is wrong: the `202` compatibility path, the four
distinct digests and the strict-R1 readback are unaffected by it. The decision
needed was narrow — whether `requested_spec`'s inner shape was declared in P02 as
a Research-owned schema, or deferred to P10 with S02's field list as the
acceptance denominator. Bobby directed the P02 declaration; the amendment below
records the completed resolution.

**S11 note.** The same state audit above applies: `11_release_candidate.md`
never names a denied state, and S11 is where publish authority is exercised. The
strict-R1 refusal path P02 proved on the backend therefore had no specified UI
counterpart. The amendment below supplies the shared semantics and immediate
S11 spec/test cases; P21/P22 still own implementation, not an unrecorded debt.

P02 frontend review is complete. Typed fixture consumption, URL `pick`/`trade`/
`study` cursor codecs and the visual pass remain **unstarted implementation**,
correctly owned by P10 and P21/P22 — this review does not claim them.

#### P02 contract/spec amendment — `P02-FE-01` resolved now, 2026-09-19

The requested inner type is declared **in P02**, not deferred to P10:

- [`requested-spec.v1.schema.json`](./research_loop/evidence/P02/requested-spec.v1.schema.json)
  and [`requested-spec.v1.d.ts`](./research_loop/evidence/P02/requested-spec.v1.d.ts)
  define `research.requested-spec.v1` as a versioned, strict structural DTO.
  It contains the S02 payload groups, protocol/route discriminators, exact
  decimal strings, sparse configuration and client release/digest pin without
  adding a top-level field to `research.run-request.v1`.
- [`requested-spec-field-map.v1.json`](./research_loop/evidence/P02/requested-spec-field-map.v1.json)
  maps all **24/24** source form controls from P01 to a named canonical payload
  path and records the separate 24-action denominator. Thus Claude can use a
  generated client/fixture type rather than map magic field names by hand.
- The P02 validator rejects unsupported nested keys, invalid route/protocol
  discriminator combinations and disagreement between the nested schema and
  legacy `strategy_id`/`dataset_id`/`protocol` fields. It deliberately does
  not hardcode P04 manifest values or claim that the unchanged facade validates
  every future field.
- S02 and S11 now link the shared state semantics. `denied` and `unavailable`
  are specified before the screen phases, with no automatic retry leak and no
  loss of hi-fi composition. P10/P21/P22 still own real UI/BFF/browser work.

Focused P02 evidence was rerun after this amendment: static freeze `PASS` with
21 required artifacts (including the compile-only generated-type guard) and the isolated suite `PASS` at 63/63. See the packet
rather than the historical pre-amendment receipt.

<a id="rl-p03"></a>
### P03 — Research schema, identities và authorization

**Đọc chi tiết:** [Guide P03](./research_loop/RESEARCH_LOOP_GUIDE_V1_1_24_PHASES_vi.md#phase-p03); [contracts/spec index](./research_loop/release-v1.1/docs/SPEC_INDEX.md).
**Entry:** dependencies/assignment tại [board](#rl-board) đã đạt; [G0–G7](#rl-test-gates) áp dụng.
**Test IDs bắt buộc:** `P03-T01…T11`, `V11-P03-DR/BR/GX` và source tests applicable theo §13.3.

- **Goal:** Metadata durable, scoped, transactional; không state-memory hay auth riêng cạnh identity Portal.
- **To-do BE:** Research schema/repositories, FKs/unique idempotency/CAS/index; alpha/version/attempt/run/job/study/evaluation relations; existing session/workspace principal; scoped DB role/audit/pool budgets.
- **To-do FE/consumer:** Generated client/common-state harness; query keys actor/workspace/revision; wrong-workspace deep link denied, không localStorage authority; fixture foreign-object errors chuẩn.
- **Tests BE:** Fresh+upgrade+repeat migration/isolated restore; cross-workspace FK/IDOR; concurrent CAS;10autosaves+duplicate submit một intent; null selected trial; research role không ghi execution; no cascade pinned evidence.
- **Tests FE/browser:** Loading/conflict/forbidden mapping; auth-switch cache clearing; session recovery dùng flows đã có; no leaked object metadata hoặc null→0.
- **Exit gate:** Restart giữ identity/counters; schema/index và auth constraints enforce server-side; existing account/credential/grant rows không bị migrate thay đổi.
- **Rollback/handoff:** Additive migrations/versioned readers; không destructive down trên data thật. Bàn giao schema/ER/auth/query plans cho P04–06.

#### P03 backend closeout — `BACKEND_FOUNDATION_COMPLETE`, 2026-09-19

P03 delivers the durable metadata and authorization substrate without claiming
a producer, runtime service, source integration or visible screen:

- `research` is an additive schema containing alpha/version, attempt/primary
  run, job/worker retry, input/study/trial/selection/evaluation, source
  exposure, artifact, release-candidate, inspection and audit relations.
  Workspace/run composite FKs prevent cross-owner evidence/relation binding;
  nullable selected-trial is valid only for centroid/composite truth.
- The sole writer is the internal `ResearchMetadataRepository`. Every call
  derives scope from the existing Portal actor/workspace principal, verifies
  `workspace_members`, starts one transaction, uses `SET LOCAL ROLE
  portal_research_runtime`, applies local statement/lock/idle budgets and
  records a bounded audit row. The role may read only identity/workspace rows
  in `public`, insert `research.*`, and CAS-update only draft/inspection
  columns; it cannot write or alter Execution.
- Unique intent keys, immutable payload/version checks, CAS draft revisions,
  immutable evidence triggers and a four-active/twelve-queued admission gate
  eliminate silent LWW, duplicate logical runs, unbounded metadata contention
  and delete cascades through pinned evidence. The global Control API pool
  remains ten connections; P03 creates no second pool.
- `P03-T01…T11` PASS in a self-removing PostgreSQL 16 tmpfs cell: fresh,
  upgrade/repeat and isolated restore proof; scope/FK/IDOR denial; replay/CAS; role denial;
  evidence protection; index-plan/pool proof; duplicate submit/autosave/worker
  retry; nullable centroid; child/evaluation/exposure isolation; inspection
  non-mutation. The frozen P02 compatibility regression and Control API
  TypeScript build also PASS. See [P03 test receipt](./research_loop/evidence/P03/test-results.json).
- `V11-P03-GX` is satisfied by the static/protected-diff receipt.
  `V11-P03-DR` remains correctly `NOT_RUN_BY_DESIGN` (P04 actual engine
  evidence), and `V11-P03-BR` is `PENDING_OWNER_PHASE` because P03 exposes no
  browser route. They are phase-owned future gates, not P03 debt.
- P03's frontend handoff is explicit at
  [frontend-handoff-claude.md](./research_loop/evidence/P03/frontend-handoff-claude.md).
  Claude must retain the approved HIFI and P01/P02 state semantics; no frontend
  file was changed by this backend slice.
- C4 closeout recorded a self-cleaning tmpfs test cell and 51% filesystem-free
  snapshot. No phase resource remained; broad Docker/image cleanup is not
  allowed in this phase. See [resource cleanup](./research_loop/evidence/P03/resource-cleanup.json).

Rollback remains reader/image rollback only; the additive migration is not
destructively reversed after metadata can exist. Full schema/role/ER detail,
rollback and zero in-scope debt are in the
[P03 evidence packet](./research_loop/evidence/P03/README.md).

#### P03 Claude frontend closeout — `FE_CONSUMER_HARNESS_COMPLETE`, 2026-09-19

P03's FE/consumer to-do lists four items. The handoff deferred all of them to
P10 on the grounds that P03 exposes no browser route. That reason holds for the
**generated client**, which needs a published route, but not for the other
three: a common-state harness, actor/workspace/revision query keys and canonical
foreign-object fixtures are all derivable from the three refusal codes P03 froze
and need no endpoint. Deferring them wholesale would have closed P03 with known
in-scope debt, which `RL-C08` and A5 forbid. The route-dependent item remains
P10's, unchanged.

Delivered under `apps/portal/frontend/src/research/`, four new files, **+663
lines, no existing file modified**:

| file | lines | contents |
|---|---|---|
| `state.ts` | 247 | refusal/transport outcome → `ComponentState`; the 10↔7 bridge to the published envelope |
| `queryKeys.ts` | 76 | every key rooted at `["research", actor, workspace]`; draft revision inside the key |
| `fixtures.ts` | 100 | canonical foreign-object, conflict, saturated, transport, stale and partial envelopes |
| `state.test.ts` | 240 | one block per P03 FE check |

**Reuse, not a second vocabulary.** `lib/portalState.ts` already defines the
state words and already proves a missing number never becomes zero. Research maps
onto it; it does not get its own state language. Three mappings were judgement
calls and are asserted by tests rather than left to a comment:

- `RESEARCH_ADMISSION_SATURATED` → `failed-retryable`, not `unavailable`. The
  dependency answered correctly; it answered "not now". Treating a full queue
  as an outage would suppress a legitimate retry.
- An in-flight request **over content already accepted** → `stale`, not
  `loading`. Blanking a populated panel on every poll is the flicker the hi-fi
  composition rule forbids, and it is how a working screen starts looking broken.
- `RESEARCH_DRAFT_REVISION_CONFLICT` → `terminal` with `retainsContent`. The
  same revision will fail identically, so it is terminal for that attempt;
  recovery is a re-read, which is a new operation. The user's edit survives.

**The denied fixture carries no workspace id and no payload**, asserted by test:
leaking either would confirm both that the object exists and who owns it, which
is what `denied` exists to prevent. A companion test asserts `denied` and `empty`
never resolve alike, because "you may not see this" and "there are none here" are
different and only one of them is true.

**Gates, actually run** — `vitest run src/research` 22/22; full
`vitest run` 152 files, 2430 passed, 3 skipped, 0 failed; `npm run build`
(`tsc -b && vite build`) exit 0. The first build attempt reported 12 TypeScript
errors, all in `features/roadmap-task-board/**` and none in this code: that
package's dependencies were not installed in this worktree. Installing them and
rebuilding returned exit 0. Recorded because "the build was red" and "my change
broke the build" are different claims.

**Not claimed.** No route, no generated client, no Research login, no workspace
selector, no browser or visual acceptance. Type and fixture availability is not
a browser acceptance, and `V11-P03-BR` correctly stays `PENDING_OWNER_PHASE`.
Nothing under `apps/control-api/**`, governance, Execution contracts, runtime
manifests or deploy inputs was read for modification or changed. Two Codex
stashes present in the shared stack were left untouched per A13.1.

<a id="rl-p04"></a>
### P04 — QuantBT 1.1.1 adapter và resource baseline

**Đọc chi tiết:** [Guide P04](./research_loop/RESEARCH_LOOP_GUIDE_V1_1_24_PHASES_vi.md#phase-p04); [spec S12](./research_loop/release-v1.1/docs/screens/12_engine_atlas.md) + [HTML 12](<./research_loop/release-v1.1/QuantBT 12 Mode Atlas.dc.html>).
**Entry:** dependencies/assignment tại [board](#rl-board) đã đạt; [G0–G7](#rl-test-gates) áp dụng.
**Test IDs bắt buộc:** `P04-T01…T13`, `V11-P04-DR/BR/GX` và source tests applicable theo §13.3.

- **Goal:** Dùng public engine thật theo route, giữ history cũ và đo chi phí trước mở workload.
- **To-do BE:** Verify/pin installed package/native digest, adapter public endpoint mapping14routes; engine/integration/evidence/admission axes; canonical optimizer aliases/seeds; direct Delta vs Portal reference; actual memory incl native retention.
- **To-do FE/consumer:** Capability fixtures/types/Atlas data source; actual resolved-backend labels, disabled reason; không badge Rust chỉ vì wheel có native code.
- **Tests BE:** DR-SIGNAL/DIRECT/PORTAL same immutable input; selectedNone/best/centroid/per-fold; defaults/reproduce/upgrade diff; invalid mode×schedule; cold/warm resource;1.0.8 historical readers.
- **Tests FE/browser:** Descriptor→card/form states, refusal vs resource queue, engine R1≠approval R1; generated types handle unknown version without auto-enable.
- **Exit gate:** Primary supported tuples có actual output/parity/resource evidence; no fabricated selection. Delta thật bắt buộc; unsupported vs Portal adapter gap tách rõ, required gap không ghi complete.
- **Rollback/handoff:** Switch new-job engine default only, in-flight/history pin nguyên. Checkpoint02: P03/P04 + actual version/numeric/memory artifacts.

#### P04 backend closeout — `BACKEND_COMPLETE_FE_HANDOFF_PENDING`, 2026-09-19

P04 is complete as a Research backend baseline, without a runtime deployment,
new submit operation, durable artifact writer or frontend modification.

- Research now pins published `quantbt-engine==1.1.1` with its published
  `quantbt-native==0.4.2` Linux/Python-3.12 dependency. The gateway verifies
  installed distribution/RECORD provenance, rejects local import shadowing,
  and never adds a sibling engine checkout to `sys.path`. Historical 1.0.8 is
  retained as a reader identity; it is not relabeled or installed as a second
  active runtime.
- The manifest-driven, read-only
  `/api/v1/research/quantbt/atlas` exposes one safe DTO: 14 public constructor
  descriptors, five mode/schedule matrices, seven claim/never-claim records,
  current/historical release identities and a declared future evidence
  envelope. Installed-wheel provenance is measured once at controlled service
  construction, not re-hashed on every Atlas request. Wheel/RECORD hashes,
  paths and callable dispatch handles never cross the browser boundary.
- Four axes are enforced: engine availability, Portal integration, evidence
  mapping and P04 admission. Only `signal_notional` and `pct_equity` are
  baseline-admitted; the other 12 engine-visible constructors remain typed
  gaps/deferred rather than becoming implicit workload paths. `reactive` is
  explicitly the `event_driven(input_mode="strategy")` facade, never a guessed
  `reactive()` call.
- P04 declares `research-run-evidence.v1`, including exact-string financial
  summary fields and selection integrity. It is intentionally
  `P05_OWNED_NOT_ACTIVE`: P04 writes no Research artifact bundle and does not
  pretend that declaration is persistence.
- Actual protected-Delta direct-vs-adapter parity passes on the deterministic
  500-hour fixture and an approved read-only 336-bar BTCUSDT historical
  window. Resource receipts record cold/warm aggregate process RSS across
  minimal/standard/audit profiles; they are not a production capacity claim.
- QuantBT 1.1.1 expands advanced fold metadata. The established v1
  `wfo/folds.parquet` shape remains stable; additive metadata is preserved in
  versioned `wfo/folds_extension.v1.parquet`, avoiding a silent consumer break.

All P04 backend/test receipts, bounded cleanup and rollback are in
[evidence/P04](./research_loop/evidence/P04/README.md). `P04-T01…T13`,
`V11-P04-DR` and `V11-P04-GX` are satisfied by the packet. `V11-P04-BR` is
correctly `PENDING_OWNER_PHASE` for real browser activation: the P04 backend
slice made no new browser screen. Under §13.2.1, Claude may now compose Screen
12 from the specific Atlas handoff at
[frontend-handoff-claude.md](./research_loop/evidence/P04/frontend-handoff-claude.md),
without claiming a named submit/producer path. P05/P06/P10 remain explicit
owner phases for persistent artifacts, isolated work scheduling and named run
submission; they are not P04 technical debt.

#### P04 Claude frontend closeout — `FE_ATLAS_DATA_SOURCE_COMPLETE`, 2026-09-20

P04's FE to-do is "capability fixtures/types/Atlas data source" with resolved
backend labels and disabled reasons. The original handoff deferred Atlas
*composition* and browser acceptance to P09. Section 13.2.1 now opens the
bounded Screen 12 composition recovery while preserving P09's ownership of
shared route/foundation closure; the data source it composes over is not
route-dependent and is delivered now.

`apps/portal/frontend/src/research/atlas.ts` (+232) and `atlas.test.ts` (+308)
derive display facts from `ResearchEngineAtlasDocument`, consumed from the
generated OpenAPI client rather than hand-written field names, so a contract
change fails compilation instead of emptying a card.

Four rules are enforced by test rather than comment:

- **The four axes stay four facts.** `ENGINE_SUPPORTED` with `INTEGRATION_GAP`
  reports `blockedBy: "integration"` while the engine axis keeps saying it is
  supported. Collapsing that into one verdict blames the wrong component and
  hides who owns the gap. All 81 axis combinations are exercised; exactly two
  are admitted.
- **Admission is not authorization.** `RouteDisplay` has no `canSubmit`,
  `canRun` or `enabled`, asserted by a test that would fail if one were added.
- **A route's backend is its own.** The release carries `quantbt-native`, and a
  test asserts a `python` route is still labelled `python`. Badging every route
  native because the wheel ships compiled code is the mislabel P04 names.
- **An unverified version is an unknown.** `verified: false` prints a safe
  state, and a test asserts the expected version is not printed in its place —
  including when an installed string is present but unverified.

**Finding P04-FE-02.** A first implementation compared
`evidence_contract.writer_state !== "ACTIVE"`. `tsc -b` refused it: the contract
pins that field to the single literal `P05_OWNED_NOT_ACTIVE`, so no value could
ever equal `"ACTIVE"` and the check was always true — a guard in shape only, and
one `vitest` alone would have passed over. `required_fields` is likewise a fixed
enum of seven names, not free-form strings. Both are now typed against the
contract, and the function is written so that **widening the union in P05 breaks
compilation on purpose**: that is when a screen must be taught to render a
written artifact instead of a described shape.

Gates: `vitest run src/research` 41/41 at this point, `tsc -b` exit 0. No route,
no fetch, no mutation; a test greps the module for network calls and for
wheel/RECORD escape hatches and finds none.

<a id="rl-p05"></a>
### P05 — Disk-first artifacts, Parquet và bounded export

**Đọc chi tiết:** [Guide P05](./research_loop/RESEARCH_LOOP_GUIDE_V1_1_24_PHASES_vi.md#phase-p05); [contracts/spec index](./research_loop/release-v1.1/docs/SPEC_INDEX.md).
**Entry:** dependencies/assignment tại [board](#rl-board) đã đạt; [G0–G7](#rl-test-gates) áp dụng.
**Test IDs bắt buộc:** `P05-T01…T13`, `V11-P05-DR/BR/GX` và source tests applicable theo §13.3.

- **Goal:** Run đọc được khi compute đã tắt; full required evidence durable không giữ result nguyên trong API RAM.
- **To-do BE:** Chunked writers/SQL indexes, part stats/manifests; staging→fsync/seal→register + lease fence; bounded Rust reader/seek; retention/quota/pins; avoid pandas/full-bytes copy chain.
- **To-do FE/consumer:** Real sealed/partial/missing/corrupt/download harness; byte/row/coverage metadata; không link artifact chưa ready; no full-ledger browser load.
- **Tests BE:** Engine→Parquet→new-process readback; crash mỗi commit boundary, concurrent writer/retry dedup, stale fence, corrupt part/disk-full; GC pinned refs; row-group memory incl engine+exporter; scoped downloads.
- **Tests FE/browser:** Artifact readiness/no-store/security; partial vs complete, denied downloads and slow/abort client; numerical formatting roundtrip fixtures.
- **Exit gate:** Worker off vẫn đọc đúng revision/IDs/nulls/precision; bounded peak measured; no orphan publication, no shared-storage destructive cleanup.
- **Rollback/handoff:** Rollback reader version, giữ sealed bytes/refs. Handoff schema/index/retention/recovery evidence cho scheduler và screen queries.

#### P05 implementation closeout — `TECHNICALLY_COMPLETE`, 2026-09-19

Codex owns the backend foundation only. The implementation created one
Research-only artifact authority: bounded PyArrow batch writers and readers,
opaque immutable manifests, a narrow Control-API metadata authority, and a
standalone Rust reader foundation. It does **not** change an existing browser
route, the approved HIFI, Execution Loop, Trading System, broker, CLI, runtime
container, or deployment input.

The older FastAPI run/export paths remain an explicit compatibility surface
until P10 moves named producer/read operations to the new authority. They are
not used to publish P05 artifacts, and P05 must prove that the new storage
path does not retain a full result in API memory. This avoids an unsafe
mid-foundation cutover while preserving the P05 invariant for all new
Research-owned artifact writes. Claude owns the later visual/consumer harness;
P05 will provide a precise sealed/partial/missing/corrupt/download handoff
rather than alter UI composition.

P05 exit evidence is retained at
[`research_loop/evidence/P05`](./research_loop/evidence/P05/README.md): current
QuantBT 1.1.1 post-compute Delta readback, crash/fence/corruption/retention
tests, fresh/upgrade/repeat PostgreSQL authority proof, Rust full-manifest and
multi-batch cursor regressions, and C4 resource closeout. P05 uses the exact
durable state `SEALED`, not an invented `READY` alias. The actual durable child, outbox/NATS dispatch,
retry/cancel and whole-workload certification remain P06-owned downstream
gates—not P05 defects. The P09/P11 rich consumer remains Claude-owned and
`UI_NOT_YET_IN_SCOPE` for P05.

#### P05 Claude frontend closeout — `FE_ARTIFACT_HARNESS_COMPLETE`, 2026-09-20

P05 publishes no DTO and no route — P10/P11 will — but it froze the artifact
state vocabulary and the rules each state imposes. P05's FE to-do calls for a
"real sealed/partial/missing/corrupt/download harness", which is exactly the
part that needs no endpoint, so it is delivered now and P10/P11 inherit it.

`apps/portal/frontend/src/research/artifacts.ts` (+161) and
`artifacts.test.ts` (+176).

- **Five states, and `READY` is not one of them.** `WRITING`, `SEALED`,
  `CORRUPT`, `MISSING`, `ABORTED` are the exact labels; a test asserts no
  synonym is substituted and that every state retains its panel.
- **Export needs three independent facts**, not one: state `SEALED`, registered
  by the authority, and a server-published export action. A candidate sealed on
  disk but unregistered is withheld with that exact sentence, because handing
  over bytes the authority has not accepted is the failure this rule exists for.
  Every state × registered × admitted combination is exercised, and each one
  without an export carries a non-empty withheld reason.
- **Exact values survive.** Decimals stay strings; a test demonstrates that
  `Number("1234567890.123456789")` does not round-trip while `exactDecimal`
  does. Timestamps must already carry UTC milliseconds or they are returned as
  `null` rather than reformatted — a silently adjusted time is worse than an
  absent one. Null stays null, never `0` and never a dash.
- **Windows stay server-owned.** A caption reads `50 of 10000 rows`, never the
  page size alone, and the cursor is opaque — a test greps for `atob`/`JSON.parse`
  over it.

Gates: 58/58 at this point, `tsc -b` exit 0. A test greps the module for any
filesystem path, database locator, HMAC key, lease epoch or worker identity and
finds none.

<a id="rl-p01-p05-audit"></a>
### P01–P05 foundation audit checkpoint — Claude, 2026-09-23

**`AUDIT_COMPLETE · REMEDIATION_PLANNED · AWAITING_BOBBY_APPROVAL`.** Bobby giao
Claude rà soát và sửa **cả backend lẫn frontend** của P01–P05 (board không có
P00; campaign Research bắt đầu từ P01). Baseline audit: `30fb9f21` trên
`docs/research-loop-plan`. Checkpoint này chỉ đổi tài liệu; chưa có code,
runtime, flag hay deployment nào thay đổi.

**Findings chi tiết, bằng chứng và ảnh chụp:**
[P01–P05 audit](./research_loop/evidence/AUDIT_P01_P05_CLAUDE_2026-09-23.md).
Unified Plan vẫn là board sống duy nhất; file audit là phụ lục chi tiết, không
phải tracker thứ hai.

**Verdict.** Backend của P01–P05 đạt đúng phạm vi đã khai báo và contract
generated khớp OpenAPI. Lỗi nằm ở **mối nối giữa các phase** — thứ không phase
đơn lẻ nào sở hữu: một route Atlas khai báo hai lần mà gate P01 không còn bắt
được; hai bộ trạng thái artifact cho cùng một khái niệm; hai cursor khác nhau
cho cùng một journey; năm bản sao hàm map refusal không ai giữ ngữ nghĩa P03;
và harness P03/P05 được dựng nhưng màn sản phẩm không dùng. Mười sáu finding
(`B-01…B-06`, `F-01…F-10`) được chia vào hai repair phase dưới đây theo thứ tự
phụ thuộc: **RF-01** sửa contract/authority/ngữ nghĩa dùng chung; **RF-02**
hoàn tất các màn nền (S12, S02) và mở lane real-API đầu tiên.

**Bobby duyệt toàn bộ Q1–Q7 ngày 2026-09-23** theo đúng cột khuyến nghị bên dưới. Với Q7, duyệt này thay cho lock note riêng: mọi thay đổi RF ở module dùng chung chỉ additive, giữ nguyên API cũ, và được ghi thành addendum cho Thanhvuong khi RF-01 đóng.

**Quyết định (đã duyệt)**

| # | Quyết định | Khuyến nghị của Claude |
|---|---|---|
| Q1 | B-01: gỡ route Python công khai `GET /api/v1/research/quantbt/atlas` | Gỡ; giữ `/internal/research/engine-atlas` mà Control API đang dùng; ghi vào runbook rằng Research chỉ đọc qua Control API |
| Q2 | B-02: số phận gate P01 | P01 giữ là bản chụp lịch sử tại commit của nó; thêm một gate **sống** kiểm route collision/protected-kernel chạy ở mọi phase |
| Q3 | F-06: query keys P03 | Hoãn có ghi nhận, nối khi Portal có workspace selector |
| Q4 | D-1…D-4 (lệch HiFi có chủ ý của S12, xem audit §4) | Duyệt D-1…D-3; D-4 trả Rule One về vàng như HiFi |
| Q5 | Thư viện công thức cho S12 (spec 12 T02 ghi KaTeX lazy) | Duyệt thêm KaTeX như dependency pinned, lazy chunk riêng; fallback chuỗi mono |
| Q6 | Lane xem bằng mắt / real-API (P01-GAP-03) | Stack preview cô lập + hostname riêng sau Cloudflare Access — **không** dùng `dev-portal` (lý do dưới) |
| Q7 | Module dùng chung với campaign Thanhvuong | Bobby ghi lock/handoff note trước khi RF-01 chạm `ResearchPanel`, `state`, `evidenceCursor`; RF-01 chỉ thay đổi **additive**, giữ API cũ đến khi PR của Thanhvuong được tích hợp |

**Vì sao không đẩy campaign lên `dev-portal.primusspark.com`.** Hostname này
([cloudflared template](../deploy/cloudflared/config.example.yml)) trỏ vào stack
`dev` và **không có Cloudflare Access policy** — chỉ có login riêng của dev
Control API. Đẩy `docs/research-loop-plan` lên đó sẽ: (1) thay build `dev` mà
Bobby/Thanhvuong đang dùng; (2) chạy migration Research của campaign vào DB
namespace của `dev` trước khi có PR `docs/research-loop-plan → dev`, mà các
migration này additive và không có down; (3) bật `FEATURE_RESEARCH_*` trên một
host công khai; (4) đi vòng qua luồng feature → `dev` → `main`. Thay vào đó RF-02
dựng stack preview cô lập (compose project, cổng, Postgres và env riêng, host-bound
ngoài checkout) và, nếu Bobby muốn xem từ xa, một hostname một-label mới (ví dụ
`research-preview.primusspark.com`) **có Access**. `dev-portal` chỉ nhận
campaign sau khi Bobby tự merge qua PR.

<a id="rl-rf-01"></a>
### RF-01 — Foundation contract, authority và integration truth

**Đọc chi tiết:** [P01–P05 audit](./research_loop/evidence/AUDIT_P01_P05_CLAUDE_2026-09-23.md) §2–§3; [Guide P01](./research_loop/RESEARCH_LOOP_GUIDE_V1_1_24_PHASES_vi.md#phase-p01)–[P05](./research_loop/RESEARCH_LOOP_GUIDE_V1_1_24_PHASES_vi.md#phase-p05); [P01 packet](./research_loop/evidence/P01/README.md) (baseline rule, route inventory); [P02 cursor codec](./research_loop/evidence/P02/cursor-codec.md) + [contract freeze](./research_loop/evidence/P02/contract-freeze.json); [P03 schema & authorization](./research_loop/evidence/P03/schema-and-authorization.md); [Research Screen State Semantics v1](./research_loop/release-v1.1/docs/RESEARCH_SCREEN_STATE_SEMANTICS_V1.md); [P05 packet](./research_loop/evidence/P05/README.md) + migration `1723680000038_research-artifact-authority.sql`; [P09 packet](./research_loop/evidence/P09/phase-report.md) (journey cursor); [P11 packet](./research_loop/evidence/P11/README.md) + `research-progress.openapi.json`; [spec 03](./research_loop/release-v1.1/docs/screens/03_run_progress.md), [spec 04 §3](./research_loop/release-v1.1/docs/screens/04_evidence_flow.md); gateway [`portal.conf`](../deploy/nginx/portal.conf) + [`.env.production.example`](../deploy/.env.production.example); [Thanhvuong P17–P21 handoff](./research_loop/THANHVUONG_P17_P21_FRONTEND_HANDOFF.md) + [`CLAUDE-FOR-thanhvuong.md` A0](./research_loop/CLAUDE-FOR-thanhvuong.md).
**Entry:** Bobby duyệt checkpoint này và Q1, Q2, Q7; P01–P05 ở trạng thái đã đóng; lock note cho module dùng chung đã được ghi.
**Owner:** Claude, backend + frontend (Bobby giao 2026-09-23). Codex/Terra review theo regime Unified.
**Test IDs bắt buộc:** `RF01-T01…T14`, `V11-RF01-DR/BR/GX` và mọi source test của P01–P05/P09/P11 bị chạm theo §13.3.

- **Goal:** Mỗi sự thật nền chỉ có **một** authority và **một** cách hiển thị: một route Atlas, một gate route còn sống, một bộ trạng thái artifact từ bảng authority tới màn hình, một codec cursor được backend kiểm và frontend dùng chung, một ngữ pháp refusal/đăng nhập lại cho mọi màn Research. Các màn phía sau thừa hưởng hành vi đúng thay vì tự dựng lại.
- **To-do BE:**

  | ID | Finding | Việc cụ thể | Xong khi |
  |---|---|---|---|
  | RF01-B1 | B-01 | Gỡ `research_quantbt_atlas` khỏi `apps/portal/backend/src/portal_api/api/routes_research.py` và include trong `main.py`; giữ `/internal/research/engine-atlas`; regenerate `portal-api.d.ts`; ghi vào runbook rollback gateway rằng dưới `PORTAL_WEB_UPSTREAM=portal-api:8000` các route Research trả refusal có kiểu, không trả một shape khác | route inventory 0 collision; Control API Atlas không đổi byte |
  | RF01-B2 | B-02 | Theo Q2: đánh dấu `p01-baseline.mjs --verify` gắn với `source_capture_commit`; thêm `scripts/research-loop-v11/test-route-inventory.sh` (collision, protected-kernel SHA, diff route tĩnh so với allowlist commit trong repo) và gọi nó trong gate của mọi phase Research | gate sống xanh ở HEAD; cố tình thêm route trùng thì gate đỏ |
  | RF01-B3 | B-03 | `research-progress` `Artifact.state` thêm `CORRUPT`, `MISSING` (additive), lấy từ bảng authority P05 cho cùng run/artifact; luật projection: sau khi seal, trạng thái authority thắng event tiến trình; P05 README ghi `PENDING` là tiền trạng thái của mặt progress, không phải trạng thái authority; OpenAPI + generated + snapshot cũ vẫn đọc được | một artifact bị đánh `CORRUPT` ở authority xuất hiện đúng trong snapshot S03 |
  | RF01-B4 | B-05 | Codec `p02-cursor.v2`: nhận `stage` (7 giá trị, chỉ để trình bày), mọi giá trị trên dây là `Identifier` opaque — một màn chỉ được hiểu `fold` là số khi đối chiếu với tập mà contract của chính nó công bố; cập nhật `cursor-codec.md`, `p02-contract.mjs`, `foundation.contract.ts` `InspectionCursor`/`canonical_query`, OpenAPI + generated; journey endpoint nhận và trả lại `stage` | codec test (trùng, không hỗ trợ, `seq`≠`event_seq`, trial mơ hồ cần `study`, `stage`) và journey round-trip xanh |
  | RF01-B5 | B-06 | Append ghi chú đóng gate vào debt register P02–P05 (không sửa dòng cũ), trỏ tới phase/commit đã đóng | mỗi gate có trạng thái hiện tại + bằng chứng |

  **RF01-B3 implementation note (Claude, 2026-09-23 — thay cách làm, giữ mục tiêu).**
  Khi làm, hai tập "artifact" hoá ra là hai thứ khác nhau không có khoá nối:
  `progress.artifacts` là các file bundle mà source journal (`research/progress-journal.ndjson`,
  `progress-receipt.json`, `evidence-source.json`, `split-source.json`), còn `research.artifacts`
  là các bảng Parquet được giữ lại (`table_kind`). Chép `CORRUPT`/`MISSING` của authority đè lên
  file bundle sẽ là tự bịa một phép nối. Vì vậy RF01-B3 thêm một danh sách **riêng**
  `retained_artifacts` vào `research.progress-read.v1` (additive, optional cho client cũ; server
  luôn phát, `[]` khi chưa có bảng): đọc từ `research.artifacts` trong cùng transaction với
  snapshot, tối đa 128, sắp theo `table_kind` rồi `artifact_id`, sáu trạng thái của authority,
  `total_rows`/`total_bytes` là chuỗi số nguyên (không mất chính xác bigint), `sealed_at_utc_ms`,
  `reader_href: null`; **không** mang `storage_locator`, `artifact_id`, `manifest_digest`,
  `worker_attempt_id`, `lease_epoch`. `progress.artifacts` giữ nguyên nghĩa bundle-readiness.
  Điều kiện "Xong khi" đọc lại thành: một bảng bị đánh `CORRUPT` ở authority xuất hiện đúng trong
  `retained_artifacts` của read S03 — PG proof `RF01-B3` trong `p11-progress.spec.ts` chứng minh
  điều này cùng với không rò locator/digest. RF01-F6 vẽ `retained_artifacts` qua `ArtifactPanel`.

- **To-do FE/consumer:**

  | ID | Finding | Việc cụ thể | Xong khi |
  |---|---|---|---|
  | RF01-F1 | F-04 | Copy `denied` trung tính trong `state.ts` + fixtures: không xác nhận object tồn tại hay thuộc ai | test copy + ảnh fixture |
  | RF01-F2 | F-02 | `ResearchPanel` thêm prop `recovery` (additive) hiện ở `unavailable`/`failed-retryable`/`stale`; chuyển nút "reread" của S04–S07 sang đó; luật FE-P03-01 cho content action (Export) giữ nguyên | S05 gặp 503 có đúng một nút thử lại |
  | RF01-F3 | F-03 | Helper dùng chung: `401` chuyển sang luồng `AccessProblemScreen` `SESSION_EXPIRED` sẵn có, giữ return URL; không dựng màn mới | S12 gặp 401 có đường đăng nhập lại |
  | RF01-F4 | F-05 | Một `researchRefusal.ts` (`toResearchRefusal`): bảng code P03 → problem code của từng contract → status; copy trên màn cố định, text server chỉ ở phần chi tiết; thay năm bản sao ở client P12–P16, giữ tên cũ dạng re-export tới khi PR Thanhvuong vào | 503 `RESEARCH_ADMISSION_SATURATED` hiện `failed-retryable`; không màn nào in thẳng `error.message` |
  | RF01-F5 | F-01 | Một `inspectionCursor.ts` hiện thực đúng codec v2 (lỗi codec hiện thành notice trong panel, không lặng lẽ bỏ key); `evidenceCursor` thành adapter giữ API; `foundationClient` dùng chung | S00 → S04 → S07 → S00 giữ `study/pick/trade/event_seq/mode/playback_ordinal` |
  | RF01-F6 | F-07/F-08 | Sửa receipt P04 ("typed inactive") và P05 ("used by Run Progress"); S03 vẽ artifact qua `ArtifactPanel` trên bộ trạng thái đã thống nhất ở RF01-B3 | S03 hiện đủ `PENDING/WRITING/SEALED/CORRUPT/MISSING/ABORTED` |

- **Tests BE:** route-inventory gate (âm tính + dương tính); Python: route công khai đã gỡ, route internal còn phục vụ; Control API atlas byte-identical; `research-progress` contract/service test + PostgreSQL tạm (fresh + upgrade) với artifact bị đánh `CORRUPT`/`MISSING` sau seal; snapshot cũ đọc được; codec v2 unit + journey endpoint round-trip; generated-contract verifier; boundary sweep (không lease epoch/worker identity/work digest).
- **Tests FE/browser:** unit cho `researchRefusal`, `inspectionCursor`, `ResearchPanel.recovery`, copy `denied`; browser 1280/660: S05 503 → thử lại, S12 401 → đăng nhập lại, S03 artifact `CORRUPT`/`MISSING`, cursor round-trip S00↔S04–S07; mọi màn Research không in text server; 0 lỗi console, 0 tràn ngang; toàn bộ suite frontend + probe xanh; một test compile chứng minh API cũ của `ResearchPanel`/`state`/`evidenceCursor` vẫn dùng được.
- **Exit gate:** `test-route-inventory.sh` xanh và nằm trong gate phase; route Atlas Python công khai đã gỡ và runbook ghi rõ; generated contract khớp OpenAPI; một bộ trạng thái artifact từ authority → contract → S03; một codec cursor ở backend và frontend; một mapper refusal và đường đăng nhập lại dùng cho mọi màn Research; receipt browser 1280/660 ghi rõ lane (`PRODUCT_ROUTE_BROWSER_RECEIPT`); debt trong scope = 0; commit theo từng bước, push lên `origin` và `primus-origin`; **không** merge vào `dev`/`main`.
- **Rollback/handoff:** Mọi thay đổi contract là additive/versioned; migration (nếu có) chỉ thêm; revert theo từng commit. Gỡ route Python revert được bằng một commit. Handoff: ghi chú module dùng chung cho Thanhvuong (Bobby ghi lock trước, Claude ghi addendum API sau), rồi mở RF-02.

<a id="rl-rf-02"></a>
### RF-02 — Foundation consumer completeness, Atlas và real-API lane

**Đọc chi tiết:** [P01–P05 audit](./research_loop/evidence/AUDIT_P01_P05_CLAUDE_2026-09-23.md) §3–§5; [spec 12](./research_loop/release-v1.1/docs/screens/12_engine_atlas.md) + [HTML 12](<./research_loop/release-v1.1/QuantBT 12 Mode Atlas.dc.html>); [spec 02](./research_loop/release-v1.1/docs/screens/02_new_run.md) + [HTML 02](<./research_loop/release-v1.1/QuantBT 02 New Run Preflight.dc.html>); [P02 requested-spec field map](./research_loop/evidence/P02/requested-spec-field-map.v1.json); [P04 packet](./research_loop/evidence/P04/README.md) (engine catalog, 4 axes); [P09 packet](./research_loop/evidence/P09/phase-report.md) (foundation Atlas); [P10 packet](./research_loop/evidence/P10/README.md) (Atlas limits cho S02); [P01-GAP-03](./research_loop/evidence/P01/findings-decision-register.json) (lane browser thật); [cloudflared template](../deploy/cloudflared/config.example.yml); [§13.3.1 browser-first HiFi](#rl-test-gates).
**Entry:** RF-01 exit xanh; Bobby duyệt Q4, Q5, Q6; nguồn QuantBT 1.1.1 cho các fact Atlas mới đã được chỉ ra (file/section cụ thể của package hoặc tài liệu engine đã pin).
**Owner:** Claude, backend + frontend. Bobby thực hiện phần Cloudflare (DNS + Access) nếu Q6 chọn hostname.
**Test IDs bắt buộc:** `RF02-T01…T16`, `V11-RF02-DR/BR/GX`, spec 12 `T01…T10`, spec 02 các test chạm walk-forward.

- **Goal:** Hoàn tất những gì P02 và P04 hứa trên màn hình — S12 đúng spec 12 kể cả tương tác "bấm schedule, claim đổi theo", S02 phủ đủ 24/24 control của field map P02 (dựng thật hoặc từ chối có kiểu) — và tạo **receipt real-API đầu tiên** cho các màn nền trong một lane preview cô lập để Bobby duyệt bằng mắt.
- **To-do BE:**

  | ID | Finding | Việc cụ thể | Xong khi |
  |---|---|---|---|
  | RF02-B1 | B-04 | Mở rộng manifest `research-engine-catalog` và `AtlasMode` (additive): theo từng mode × schedule — `claims` (validation / chronological), `cert_cap`, `oos_use`; theo mode — `objective` (id công thức, danh sách term, hệ số gắn release), `reads` (mô tả dữ liệu dùng), `avoid_when`. **Mỗi fact có source locator** trong package/tài liệu QuantBT 1.1.1 đã pin; fact không có nguồn là `NOT_PUBLISHED`, không bịa | contract test + fixture sinh từ manifest; reviewer đối chiếu từng locator |
  | RF02-B2 | F-10 | Công bố tập giá trị hợp lệ của `walk_forward.split_mode`/`window_mode` (và mặc định) trong Atlas/preflight; preflight từ chối giá trị ngoài tập bằng refusal có kiểu | S02 lấy giá trị từ contract, không hardcode |
  | RF02-B3 | §5 / Q6 | Stack preview `portal-probe-research`: compose project, cổng, Postgres, env **riêng** (host-bound ngoài checkout); chạy migration của campaign; bật `FEATURE_RESEARCH_*` chỉ ở stack này; seed bằng một run P04 Delta thật đi qua producer P10 → P11 → P13 (hoặc phát lại receipt đã giữ); ghi image/config/migration SHA. Hostname một-label có Access nếu Q6 duyệt; **không** chạm `dev-portal` | đăng nhập + đi được S01→S07, S02, S12 bằng dữ liệu thật; teardown có ghi nhận |

- **To-do FE/consumer:**

  | ID | Finding | Việc cụ thể | Xong khi |
  |---|---|---|---|
  | RF02-F1 | F-09 | S12 theo spec 12: tab verbatim "WFO modes · Execution routes · Claims by contract"; breadcrumb "Evidence Flow / Engine Atlas"; hash `#tab=&mode=&route=` giữ đủ key; deep-link sang S06 mang mode + schedule (T03); mode card với chip schedule đổi claim/cert cap từ RF02-B1; công thức objective (KaTeX lazy theo Q5, fallback mono); bảng "when to reach for which mode"; panel release facts (`optimizer_defaults`, `submission_constraints`, `trial_ceiling`, phiên bản native); Rule One theo Q4 | spec 12 T01–T10 xanh, copy diff = 0 |
  | RF02-F2 | F-10 | S02: control `window_mode`/`split_mode` lấy giá trị từ RF02-B2; route sub-form của route chưa admitted hiện "route not admitted" có lý do, không có input; bảng 24/24 control → dựng thật hoặc từ chối có kiểu | field-map test 24/24 |
  | RF02-F3 | F-06 | Theo Q3: ghi deferral có điều kiện kích hoạt (workspace selector) vào receipt P03, hoặc nối query keys nếu Bobby chọn làm ngay | quyết định được ghi và test tương ứng |
  | RF02-F4 | P01-GAP-03 | Receipt `REAL_API_E2E_RECEIPT` trên stack preview cho S01–S07, S02, S12 ở 1280/660: đối chiếu HiFi, console/network, request chỉ tới BFF đã công bố; Bobby xem trực tiếp trên host preview | receipt real-API tách riêng khỏi fixture; ảnh + trace lưu riêng tư |

- **Tests BE:** manifest → contract → fixture cho mọi fact Atlas mới, fact thiếu nguồn phải ra `NOT_PUBLISHED`; preflight nhận/từ chối `split_mode`/`window_mode`; stack preview: migration fresh, health, login, đọc thật qua Control API, không request nào tới `/internal/*` từ browser; teardown không đụng `dev`/`stable`.
- **Tests FE/browser:** spec 12 T01–T10 (3 tab + hash, KaTeX + fallback, deep-link S06, route DEFERRED không có nút, claims đủ + footer, route thứ 15 tự mọc, bảng cuộn ở 660, axe 0 serious, reduced-motion, copy diff = 0); S02 walk-forward + route chưa admitted; lane real-API tách khỏi lane fixture; 0 lỗi console, 0 tràn ngang; toàn bộ suite xanh.
- **Exit gate:** S12 đạt spec 12 và mọi fact mới có nguồn; S02 phủ 24/24 control; stack preview tái lập được từ tài liệu và có receipt real-API đầu tiên cho các màn nền; P01-GAP-03 chuyển sang đóng với bằng chứng; Bobby xem HiFi trên host preview và ghi duyệt/lệch; debt trong scope = 0; commit theo bước, push `origin` + `primus-origin`; không merge `dev`/`main`; tài nguyên preview có quyết định giữ hoặc teardown.
- **Rollback/handoff:** Field Atlas mới là additive, client cũ bỏ qua được; tắt stack preview không ảnh hưởng `dev`/`stable`; hostname preview gỡ bằng một thay đổi Cloudflare. Handoff: receipt real-API và công thức lane preview cho P23 (verification toàn chuỗi) và cho Thanhvuong dùng lại khi test S08–S11.

**RF-02 implementation note (Claude, 2026-09-23).** Giữ mục tiêu, ghi các điểm khác plan: (1) `cert_cap` theo mode × schedule và `avoid_when` là `NOT_PUBLISHED` có lý do — QuantBT 1.1.1 chứng nhận theo execution route (`core/certification.py`), không theo mode; không chép chữ cái cap mẫu của HiFi. (2) `split_mode` không phải enum: engine nhận mốc OOS đầu (instant, tiền tố `walk_forward_` tuỳ chọn); được công bố thành luật, còn `frequency`/`window_mode` là tập giá trị có admission. (3) KaTeX pin 0.16.47 thay vì 0.16.11 của HiFi (advisory GHSA-cg87-wmx4-v546). (4) S02 trên API thật không tạo được run vì `config_digest` rỗng — Atlas giờ công bố digest cấu hình release (đóng CG-P10-01). (5) Stack preview: worker chạy seccomp/AppArmor/systempaths unconfined **chỉ ở preview** để child P06 dựng được namespace; đường production là CG-RF02-01. (6) T08 axe loại trừ đúng hai cặp màu chờ Bobby quyết (D-B1 `--ink-faint`, D-B2 vàng Rule One); T10 lệch copy spec §8 vs manifest là D-B3; animation §2 chưa dựng là D-B4. **Chốt 2026-09-23 (Bobby uỷ quyền):** D-B1 → bước DS-01 (làm đậm `--ink-faint` ≥ 4.5:1, refresh baseline một lần toàn Portal); D-B2 → chữ Rule One màu `--ink` trong khung vàng; D-B3 → spec 12 §8 hiểu là "render nguyên văn chữ của manifest"; D-B4 → chấp nhận lệch D-5; D-B5 → giữ preview, chưa tạo hostname; D-B6 → đóng RF-02, Bobby xem sau.

<a id="rl-rf-03"></a>
### RF-03 — Backend gaps P01–P10 và tuyên bố contract (Codex)

**Đọc chi tiết:** [P01–P10 audit vòng 2](./research_loop/evidence/AUDIT_P01_P10_CLAUDE_2026-09-23.md) §1–§2, §5; [request list + prompt](./research_loop/evidence/CODEX_REQUESTS_FROM_CLAUDE_P01_P10.md); packet P02, P04–P10, RF-01, RF-02; HTML + spec 00/02/03/05/12/14.
**Entry:** Bobby giao RF-03 cho Codex (2026-09-23: "codex đọc lại hết các P trước… fix hết lỗi, tuyên bố contract"). DQ-03/05/07/10/11 chặn đúng các request ghi `DQ`, không chặn phần còn lại.
**Owner:** Codex, backend + contract. Claude review phía consumer.

- **Goal:** Các màn đã dựng (00, 02, 03, 05 phần P08, 12, 14) có đủ dữ liệu thật để đạt HiFi, hoặc có lý do `NOT_PUBLISHED` có kiểu cho từng ô không thể có; backend Claude làm trong RF-01/RF-02 được Codex review.
- **To-do BE:** theo [request list](./research_loop/evidence/CODEX_REQUESTS_FROM_CLAUDE_P01_P10.md), thứ tự: (1) review `CG-RF02-06/-02/-04`; (2) bug `CG-P02-01`, `CG-P06-04`, `CG-P06-05`, `CG-P10-03`, `CG-P10-06`, `CG-P09-03`; (3) contract P04 (`CG-P04-03…07`), P05 (`CG-P05-01`, gộp `CG-RF02-03`), P06 (`CG-P06-01/02`), P07 (`CG-P07-03…06`), P08 (`CG-P08-02…06`), P09 (`CG-P09-05/06/02`), P10 (`CG-P10-04/05`), P11 (`CG-P11-03`); (4) sau DQ: `CG-P09-04`, `CG-P07-02`, `CG-P04-02`, `CG-P10-02`, `CG-P06-03`.
- **Tests BE:** mỗi contract: OpenAPI → generated → fixture → contract test; fact không có nguồn ra `NOT_PUBLISHED` có lý do; bug có test tái hiện trước khi sửa.
- **Exit gate:** mọi request trong list ở `DELIVERED <commit>` hoặc `DQ` đã có quyết định; generated contracts đồng bộ; review RF-01/RF-02 được ghi vào packet RF-02; commit theo bước, push `origin` + `primus-origin`; không merge `dev`/`main`.
- **Rollback/handoff:** thay đổi contract additive; handoff cho RF-04 wave C theo từng id đã `DELIVERED`.
- **Progress 2026-09-23:** P02 generated wire, P06 typed resource failure, P09 Journey v2/historical truth và P10 typed admission/progress đã có commit; backend review RF-02 được ghi ở [RF-03 packet](./research_loop/evidence/RF-03/README.md). Chưa đóng phase: P05 retention/artifact writer, P06 live child progress, P07/P08/P10/P11 còn contract work. Không chuyển RF-03 sang COMPLETE trước khi từng id có receipt.

**P05 checkpoint 2026-09-23 (feature-dark):** exact-lease private reserve/seal and real one-row Parquet receipt now write to `research.artifacts`; failed/expired WRITING metadata is aborted without touching SEALED evidence. S03 can read the retained receipt. `CG-P05-01` remains OPEN for S04–S07 rich current-source materialization: P10 fixed Delta has no admitted Advanced-WFO rows yet. See [RF-03 packet](./research_loop/evidence/RF-03/README.md). No runtime activation.

**P07 registry checkpoint `a1926f25`, 2026-09-23:** source-backed name, strategy ID, full digest, required columns, warmup and literal version mirror are published in generated `research-alpha-import.d.ts` with additive client rollout. `CG-P07-05` delivered by `349657bb`: immutable registration-time predecessor, typed historical-unknown, generated contract and P07 disposable PostgreSQL 9/9; P07/P08 warmup bound fixed by `348632e5`. `CG-P07-03` remains OPEN for the unverified 14-field mirror. P07 PostgreSQL 9/9, parser 9/9, contract 5/5, build, FE TypeScript and full pre-commit 813/813 Control API tests pass; no runtime activation. See [RF-03 packet](./research_loop/evidence/RF-03/README.md).

**RF-03 continuation 2026-09-24 — still IN_PROGRESS:** P07 literal mirror `VERIFY|GATED`, parse/gate TTL, optional exact source SHA-256 check and typed quarantine codes; P06 observed child liveness heartbeat; P08 release trial ceiling before snapshot seal. Focused P07 PG 9/9, parser 10/10, contracts 5/5, Control API digest 2/2, P06/P10 real-child 11/11 excluding missing local `nats-py`, P08 13/13, build/TypeScript pass. These are truthful partial deliveries, not closure of `CG-P07-03/04`, `CG-P06-02` or `CG-P08-05`; see [RF-03 continuation](./research_loop/evidence/RF-03/README.md). P10 executable WFO and P05 retained WFO remain the critical path. RF-04 is Claude-owned; Codex touched no frontend composition or visual baseline.

**P08 declared-optimization checkpoint 2026-09-24:** exact persisted AlphaVersion entrypoint/declaration now enforces required seed and declared pin/sweep domains before snapshot; the private snapshot path also enforces current-release trial ceiling. Focused generated-wire 4/4 and isolated PostgreSQL 10/10 pass. `CG-P08-05` stays OPEN for an independently sourced sweep/evaluation ceiling and advanced-WF admission. This does not widen P10; RF-04 must consume only typed current facts.

**RF-03 round-2 source probe 2026-09-24 (not an exit receipt):** the pinned HMD reader and QuantBT 1.1.1 public API completed a real read-only BTCUSDT 1h `signal_notional` WFO with two folds and three Optuna trials; the opt-in regression and exact dataset/resource facts are in [RF-03 evidence](./research_loop/evidence/RF-03/README.md). P10 private admission/child, P05 retention and the preview real-API receipt remain OPEN; this probe changes no runtime flag and does not advance RF-03/RF-04 status.

**RF-03 Signal Notional retention adapter continuation 2026-09-24 — partial, not an exit receipt:** added the separately versioned `rs02.delta-signal-notional-wfo.v1` source profile and `rs02.quantbt-signal-notional-wfo.v1` serializer adapter. `AdvancedWalkForwardRunner` retains `pct_equity` as the generic default and only selects `signal_notional` through an explicit server argument with pinned capability validation and mismatch refusal. Focused adapter/runner tests 23/23, the read-only HMD public WFO probe 1/1, and an opt-in real-HMD → QuantBT WFO → temporary local P05 Parquet seal test 1/1 passed; the latter checks multiple folds, three optimizer trials, all five retained relations and manifest byte digest. This still does not route through P10 admission, imported/DRAFT source, the P06 isolated child, Control API `research.artifacts`/RS-02 row import, or the current-branch preview. `CG-P10-02`, `CG-P05-01` and RF-03 remain open; no runtime service or flag changed. Details: [RF-03 packet](./research_loop/evidence/RF-03/README.md).

<a id="rl-rf-04"></a>
### RF-04 — Frontend P01–P10: sửa, chuẩn hoá theo HiFi, tối ưu tốc độ, nối màn (Claude)

**Đọc chi tiết:** [P01–P10 audit vòng 2](./research_loop/evidence/AUDIT_P01_P10_CLAUDE_2026-09-23.md) toàn bộ; [link audit](./research_loop/evidence/RF-02/hifi-screen-link-audit.md); HTML + spec 00/02/03/12/14; memory đo HiFi theo khối trước khi dựng.
**Entry:** RF-02 đóng (Bobby duyệt 2026-09-23). Wave B cần DQ-01, DQ-02, DQ-04, DQ-06, DQ-08; wave C cần contract tương ứng của RF-03.
**Owner:** Claude, frontend. Không nối màn 08–11, 13 (Thanhvuong / chưa dựng): link tới chúng hiện disabled kèm phase.

- **Goal:** 00, 02, 03, 12, 14 khớp HiFi về layout, typography, số đo, copy, trạng thái và link; tải nhanh (ngân sách JS theo spec); dữ liệu thật đi qua được S14 → S02 → S03 → S04.
- **Wave A — làm ngay, không phụ thuộc:** FE-S03-01 (SSE event có tên), FE-S03-02 (tab ẩn làm đứng stream), FE-S03-04 (câu claim trên run COMPLETED), FE-S02-01 (`$defs`, `strategy_id`, chỉ gửi param đã sửa, trials ≥ 1), FE-X-01…04 (lazy route, bỏ echarts khỏi màn không có chart, dừng poll `/api/runs`, KaTeX tải song song), FE-S14-07/10, FE-S12-01, FE-S12-09.
- **Wave B — sau DQ:** FE-S00-*, FE-S02-02…12, FE-S03-03/05…09/11/12, FE-S12-02…08, FE-S14-01…06/08/09/11, FE-W-01…05, FE-X-05…08.
- **Wave C — sau từng contract RF-03:** regenerate, render field mới, gỡ `not published` tương ứng; FE-S03-10 sau `CG-P06-01`.
- **Tests FE/browser:** vitest + build mỗi bước; unit test SSE dùng `addEventListener` event có tên như server; S02 tạo run thật trên preview (preflight → create → QUEUED → COMPLETED); receipt `REAL_API_E2E_RECEIPT` từng màn ở 1440/1280/660, axe, console/network, đọc screenshot bằng mắt; đo JS route trước/sau.
- **Exit gate:** không còn mục FE trong audit ở trạng thái mở ngoài những mục chờ RF-03/DQ có ghi lý do; ngân sách JS đạt hoặc có số đo và lý do; mọi link §3 giữa màn đã dựng hoạt động; Bobby xem trên `research-portal` và ghi duyệt/lệch.
- **Rollback/handoff:** mỗi wave một nhóm commit; route mới lazy nên gỡ được từng màn; handoff receipt cho P23.

<a id="rl-rf-05"></a>
### RF-05 — Backend gaps P11–P15 (Codex)

**Đọc chi tiết:** [P11–P15 audit vòng 3](./research_loop/evidence/AUDIT_P11_P15_CLAUDE_2026-09-24.md) §1, §4, §5; [request + prompt](./research_loop/evidence/CODEX_REQUESTS_FROM_CLAUDE_P11_P15.md); [checkpoint Astra](#rl-p13-p17-audit) + [Astra plan](./research_loop/P13_P17_ASTRA_AUDIT_AND_REMEDIATION_PLAN.md); packet P11–P15, RS-01…RS-03, RF-03.
**Entry:** Bobby giao sau RF-03 (2026-09-24). DQ-13 chặn riêng `CG-P11-08`.
**Owner:** Codex, backend + contract.

- **Goal:** 01/03/04/05/06 có dữ liệu thật đủ để đạt HiFi, hoặc absence có kiểu và lý do; đóng các mục Astra còn mở trong phạm vi (A02, A03, A04, A06, A09, A11, A12).
- **To-do BE:** theo request list: bug trước (`CG-P15-02`, `CG-P12-08`, `CG-P13-11`, `CG-P11-06`, `CG-P12-05`, `CG-P12-07`, `CG-P11-04`, `CG-P14-04`, `CG-P13-06`), rồi contract P11–P15; commit chỉ path của mình, không sửa `apps/portal/frontend/**`.
- **Exit gate:** mọi id ở `DELIVERED <commit>` hoặc quyết định; generated contracts đồng bộ; debt register P13–P15/RS-02/RS-03 ghi đúng nợ còn lại; commit theo bước, push hai remote.

<a id="rl-rf-06"></a>
### RF-06 — Frontend P11–P15: sửa lỗi, trạng thái, HiFi, nối màn (Claude)

**Đọc chi tiết:** [P11–P15 audit vòng 3](./research_loop/evidence/AUDIT_P11_P15_CLAUDE_2026-09-24.md) toàn bộ; HTML + spec 01/03/04/05/06; [state semantics](./research_loop/release-v1.1/docs/RESEARCH_SCREEN_STATE_SEMANTICS_V1.md).
**Entry:** RF-04 wave A xong. Wave B cần DQ-13…15; wave C theo từng contract RF-05.
**Owner:** Claude, frontend. Không nối màn 08–11, 13: link hiện disabled kèm phase.

- **Wave A — lỗi, không phụ thuộc:** FE-S03-13/14/15, FE-S01-01…10, FE-S04-01…11, FE-S05-01…04, FE-S06-01…06, FE-X-10…13.
- **Wave B — HiFi layout sau DQ:** FE-S03-16…19 + mục vòng 2 còn mở, FE-S01-11…14, FE-S04-12/13, FE-S05-05…08, FE-S06-07/08, FE-X-15.
- **Wave C — tiêu thụ RF-05:** regenerate, render, gỡ `not published` tương ứng.
- **Tests:** vitest + tsc + build mỗi bước; mỗi lỗi tương tác có test tái hiện đỏ trên code cũ; browser receipt real-API từng màn 1440/1280/660, axe, console 0 lỗi, network.
- **Exit gate:** không còn mục FE mở ngoài những mục chờ RF-05/DQ có lý do; Bobby xem trên `research-portal` và ghi duyệt/lệch.

<a id="rl-p06"></a>
### P06 — Durable scheduler, isolated workers và retry

**Đọc chi tiết:** [Guide P06](./research_loop/RESEARCH_LOOP_GUIDE_V1_1_24_PHASES_vi.md#phase-p06); [contracts/spec index](./research_loop/release-v1.1/docs/SPEC_INDEX.md).
**Entry:** dependencies/assignment tại [board](#rl-board) đã đạt; [G0–G7](#rl-test-gates) áp dụng.
**Test IDs bắt buộc:** `P06-T01…T13`, `V11-P06-DR/BR/GX` và source tests applicable theo §13.3.

- **Goal:** Một logical run có một committed effect, bounded compute và recoverable intent.
- **To-do BE:** PG intent/outbox→existing NATS IDs; leases/fencing/inbox dedup/cancel CAS; actual child process sandbox; one-heavy-slot admission/fairness; audit/diagnostic/export cũng tính quota.
- **To-do FE/consumer:** Queue/cancel/retry/finishing contract harness, worker attempts drawer data; actual progress source; không fake ETA hoặc technical retry thành research attempt.
- **Tests BE:** 20queued không20datasets; duplicate delivery/kill/lease expiry/late commit/cancel race; PG/NATS outage; malicious PID/network/files/memory; repeated job RAM/FD; optional audit không giữ primary pending mãi.
- **Tests FE/browser:** Double-submit/reconnect giữ run ID; inspect/mount/slider không submit job; queue/error/cancel truth; signed-in scope and SSE harness (chưa full03 acceptance).
- **Exit gate:** Delta qua durable worker thật, retry/failure tests PASS trong quota; no second scheduler dispatch, no API hidden heavy compute.
- **Rollback/handoff:** Pause claims/drain authorized jobs, giữ intents/outbox; teardown chỉ test jobs. Checkpoint03: P05/P06 durability + memory + recovery.

**P06 closeout (2026-09-19):** The P06 foundation is technically complete
with one PostgreSQL authority: canonical SHA-256 logical-work and command
identity, explicit `MANDATORY`/`OPTIONAL` readiness classification, requester-fair admission,
worker lease epoch/fencing, cancellation CAS, retry/recovery and an ID-only
transactional outbox. A cross-language `V11-P06-DR` receipt proves the exact
chain `claimed PostgreSQL lease → isolated Python PID/user/mount/network
namespace → pinned QuantBT 1.1.1 Delta compute → same fenced terminal
commit`; it is not a mock result or an API-thread substitute. The child has no
database, broker, Execution, Trading System or browser credential, receives
only a bounded receipt, mounts per-receipt tmpfs scratch, and reports the
enforced address-space/CPU/file/FD/process caps.

Pre-P06 compatibility rows retain no canonical work digest and are deliberately
not claimable by the P06 scheduler; P10 must supply the real named-producer
identity rather than infer it from legacy rows. The transport is deliberately a narrow publish-before-ack port, not a new
runtime NATS client. P10 alone owns wiring the existing named producer/direct
submit path and deployment-bound NATS credentials, so P06 cannot create a
second scheduler. P09/P11 own real consumer/readiness aggregation and no P06
backend browser route, timer-based progress, action or deployment claim exists.
Section 13.2.1 nevertheless permits the bounded non-actionable HIFI
queue/attempt composition from the frozen facts. These are explicit phase
ownership boundaries—not open P06 implementation debt. See
[P06 evidence](./research_loop/evidence/P06/README.md) for the test, cleanup,
rollback and Claude handoff receipts.

#### P06 Claude frontend closeout — `FE_SCHEDULER_HARNESS_COMPLETE`, 2026-09-20

The original P06 handoff said no Claude action was required. That was right
about the closed backend slice's routes, shell, tokens and HIFI layout, none of
which it touched. The 2026-09-20 amendment opens bounded composition and the
P06 FE to-do in this plan asks for a
"queue/cancel/retry/finishing contract harness, worker attempts drawer data" and
forbids a fabricated ETA — none of which needs an endpoint. Deferring it
wholesale would have closed P06 with in-scope debt that `RL-C08` and A5 forbid.

`apps/portal/frontend/src/research/scheduler.ts` (+160) and
`scheduler.test.ts` (+189) encode the three distinctions P06 warns are easy to
collapse, each of which turns a true screen into a plausible false one:

- **A logical run is not a worker attempt.** Three attempts under one `run_id`
  report `attemptCount: 3`, not three runs. Presenting attempts as runs inflates
  the research record with work the researcher never requested.
- **An optional diagnostic failure is not a primary failure.** A `SUCCEEDED`
  run with a failed `OPTIONAL` audit stays `primaryFailure: false` and reports
  the optional failure separately. Reddening the run would hide which result is
  actually untrustworthy.
- **A late worker result never overrides an authoritative terminal state.** A
  worker reporting `SUCCEEDED` after the run was `CANCELLED` keeps `CANCELLED`
  and sets `ignoredLateMessage`. Otherwise the screen tells a researcher their
  cancelled run succeeded.

Also enforced: an outbox delivery is transport and never implies completion; a
P03 compatibility row with no work digest is not a claimable P06 job; and the
browser forms no digest — a test greps for `createHash`/`subtle.digest`.

**No percent and no ETA exist in the module.** Progress prints `3 of 10` only
when the server published counts, and a test greps the source for `eta`,
`estimate`, `percent`, `elapsed /` and `Date.now`. A number invented to fill a
progress bar is a claim about work the browser cannot observe.

Gates: `vitest run src/research` 78/78; full `vitest run` 155 files, 2488
passed, 1 skipped, 0 failed; `npm run build` exit 0.

**Scope not claimed across P04–P06.** No route, generated client, screen,
visual or browser acceptance; `V11-Pxx-BR` remains `PENDING_OWNER_PHASE` for the
owning screen phases. Nothing under `apps/control-api/**`, governance, Execution
contracts, runtime manifests or deploy inputs was modified. Six new files under
`apps/portal/frontend/src/research/`, **+1226 lines, no existing file changed**.

<a id="rl-p07"></a>
### P07 — Alpha Registry, Import và immutable version binding

**Đọc chi tiết:** [Guide P07](./research_loop/RESEARCH_LOOP_GUIDE_V1_1_24_PHASES_vi.md#phase-p07); [spec S14](./research_loop/release-v1.1/docs/screens/14_alpha_import.md) + [HTML 14](<./research_loop/release-v1.1/QuantBT 14 Alpha Import.dc.html>).
**Entry:** dependencies/assignment tại [board](#rl-board) đã đạt; [G0–G7](#rl-test-gates) áp dụng.
**Test IDs bắt buộc:** `P07-T01…T12`, `V11-P07-DR/BR/GX` và source tests applicable theo §13.3.

- **Goal:** Hoàn chỉnh import .py→validate→DRAFT→authorized ACTIVE bằng bytes/entrypoint đã kiểm.
- **To-do BE:** Scoped file_ref TTL/digest/TOCTOU; AST+7 ordered sandbox gates; uniqueness/CAS; registry exact version binding; Delta wrapper nếu cần không sửa protected kernel.
- **To-do FE/consumer:** Full14 upload/paste/readonly parsed mirror/gates/logs/errors/register/activate; edit source invalidate receipt; no runtime dependency installer. Research-scoped early screen primitives, không sửa shared shell; P09 chuẩn hóa lại sau.
- **Tests BE:** Malicious top-level import/network/process/path/allocation; cross-user file_ref; duplicate/concurrent activate; modified bytes;<=12param declaration; existing runs giữ old binding; imported Delta output vs built-in.
- **Tests FE/browser:** Every S14 test; upload/paste/fail→SKIPPED/reset/keyboard; parsed fields readonly cả crafted request; DRAFT/ACTIVE/scratch copy; responsive/fonts and actual dev URL/build.
- **Exit gate:** Full14 real backend + browser/dev receipt; gate7 không false causal certificate. P07 không chờ P09 bằng fixture: chỉ tối thiểu local composition trong allowed boundary.
- **Rollback/handoff:** Disable new import nếu rollback, giữ versions/evidence; không revoke execution alpha. Handoff binding contract cho P08/P10.

**Backend checkpoint — 2026-09-20:**
`BACKEND_AND_CONTRACT_COMPLETE_FE_PRODUCT_ROUTE_PENDING`.
The P07 server slice is complete without changing the protected QuantBT kernel:
Control API owns opaque source custody/TTL/receipt/registry state, Portal API
performs only HMAC-authenticated AST + restricted-definition analysis, and the
browser never receives a path, raw stored bytes, mutable parsed contract, or
internal principal. The exact P07 `T01…T12` and `V11-P07-DR` matrix passed on
a fresh self-removing PostgreSQL cell. See the credential-free
[P07 evidence packet](./research_loop/evidence/P07/README.md) and the precise
[Claude S14 handoff](./research_loop/evidence/P07/frontend-handoff-claude.md).
The formerly missing contract is now canonical at
[`research-alpha-import.openapi.json`](../packages/contracts/openapi/research-alpha-import.openapi.json),
regenerated as
[`research-alpha-import.d.ts`](../packages/contracts/generated/research-alpha-import.d.ts).
`may_activate` is now a required caller-specific server admission on registry
and registration responses, evaluated by the exact activation predicate; all
five routes are present in the R2 capability inventory, so `CG-P07-01` and
`FD-P07-02` are closed.
Screen 14 is additive at `/research/alphas/import`; it deliberately runs in
parallel with the legacy QuantBT `/research/quantbt/imports` quarantine inbox.
No legacy import route is redirected, replaced or deleted in P07.
P09 still owns the first product-route mount and `V11-P07-BR`; Screen 14 T07
(prefill Screen 02/New Run from `av_`) remains `NOT_RUN_BY_DESIGN` until P10.
Those are explicit future delivery gates, not unrecorded P07 backend debt.

<a id="rl-p08"></a>
### P08 — Data snapshots, effective spec và preflight

**Đọc chi tiết:** [Guide P08](./research_loop/RESEARCH_LOOP_GUIDE_V1_1_24_PHASES_vi.md#phase-p08); [spec S02](./research_loop/release-v1.1/docs/screens/02_new_run.md) + [HTML 02](<./research_loop/release-v1.1/QuantBT 02 New Run Preflight.dc.html>); [spec S05](./research_loop/release-v1.1/docs/screens/05_s1_split.md) + [HTML 05](<./research_loop/release-v1.1/QuantBT 05 S1 Split.dc.html>).
**Entry:** dependencies/assignment tại [board](#rl-board) đã đạt; [G0–G7](#rl-test-gates) áp dụng.
**Test IDs bắt buộc:** `P08-T01…T12`, `V11-P08-DR/BR/GX` và source tests applicable theo §13.3.

- **Goal:** Browser preview, submitted spec và worker input là cùng manifest immutable.
- **To-do BE:** Reuse authorized code-only historical reader; minimal columns/range; snapshot/calendar/timezone/closed-bar/warmup/funding/quality; requested→effective optimizer/topology; token expiry/invalidation; storage+RAM budget.
- **To-do FE/consumer:** Data/preflight widgets/harness với quality counters, `[start,end)`, seed/pin/bounds; changed fields clear token, preserve valid edits; sealed holdout metadata không tự mở raw.
- **Tests BE:** Mutable source after pin; UTC-naive/VN-naive/aware ms boundary; funding/column gaps; future perturbation/read boundaries; config aliases and null/0/false; holdout exposure vs checksum; quota refusal truthful.
- **Tests FE/browser:** Review→payload matching, stale token/material edit, resource estimate units, reproduced-vs-upgraded config diff; widgets rebuild nếu đã được dùng bởi screen.
- **Exit gate:** Worker receives exact manifest; no silent resnapshot/default/forward-fill; required data permission/DR dependencies resolved cho exercised path.
- **Rollback/handoff:** Invalidate old token schema, retain referenced inputs. Checkpoint04: P07/P08 + import/dev receipt và reader/preflight evidence.

**P08 backend closeout (2026-09-20):** The same-origin contract is now
published at `packages/contracts/openapi/research-preflight.openapi.json`, with
generated types for every Screen 02/05 panel fact (UTC range, warmup, quality,
fold/topology, resource estimate, snapshot/data binding and effective spec).
The frozen P02 requested-spec schema is packaged and mechanically parity-checked
against P02 evidence, so generation is self-contained in local, CI and release
containers rather than depending on an incidental repository mount.
Control API owns actor-scoped immutable metadata and validates stored records
again before a response; Portal API owns only a fixed HMAC private HMD reader
and content-addressed snapshot seal. Snapshot publication is atomic under a
concurrent identical request, only declared Alpha columns are sealed after the
certified full-OHLCV adapter validation, generic Data Catalog raw routes deny
this Research snapshot family, and cross-document snapshot/topology/optimizer
facts must agree. Arbitrary loader provenance is not exposed, an obviously
inadmissible budget is rejected before serialization, and the 128-fold / 60
KiB document ceilings fail typed rather than truncate or fall through to a
database error. Full details and explicit non-run visual/worker gates are in
the [P08 evidence packet](./research_loop/evidence/P08/README.md).

**P08 authority amendment — 2026-09-20 (`FD-P08-01`, `CG-P08-01` closed in
P08 scope):** The two P08 controller routes are now declared in the R2
capability inventory with their exact interaction class, owner, test owner and
evidence; no route is silently outside the ledger.  `ResearchPreflightV1` also
now publishes required server fact `may_create_run`.  It is `false` for every
caller in P08 because P08 has no run-creation route.  This is a negative
authority statement, not a browser inference from an opaque token, object
lifecycle, preflight success or browser-held role.  P10 is allowed to return
`true` only after it publishes a durable create route whose server-side
predicate is evaluated again at the write boundary.  That predicate must bind
the authenticated actor and workspace, the exact unexpired caller-owned
preflight token, its immutable requested/effective/dataset/version digests and
the current policy grant; it must return a typed `403` on refusal and must not
trust a client-supplied `may_create_run`.  The P08 contract remains
`PREFLIGHT_ONLY`: no worker, queue, reservation or create-run action was added
by this amendment.

<a id="rl-p09"></a>
### P09 — Frontend foundation, Journey Map và Engine Atlas

**Đọc chi tiết:** [Guide P09](./research_loop/RESEARCH_LOOP_GUIDE_V1_1_24_PHASES_vi.md#phase-p09); [spec S00](./research_loop/release-v1.1/docs/screens/00_journey_map.md) + [HTML 00](<./research_loop/release-v1.1/QuantBT 00 Journey Map.dc.html>); [spec S12](./research_loop/release-v1.1/docs/screens/12_engine_atlas.md) + [HTML 12](<./research_loop/release-v1.1/QuantBT 12 Mode Atlas.dc.html>).
**Entry:** dependencies/assignment tại [board](#rl-board) đã đạt; [G0–G7](#rl-test-gates) áp dụng.
**Test IDs bắt buộc:** `P09-T01…T12`, `V11-P09-DR/BR/GX` và source tests applicable theo §13.3.

- **Goal:** Tích hợp Research design system/routes vào Portal, không đổi giao diện Execution.
- **To-do BE:** Small persisted descriptor/Journey registry, generated API client, no engine import per view; route ownership and cursor codec binding theo P02.
- **To-do FE/consumer:** Research Light scoped tokens/fonts/charts, shell-free00, route registry; all14engine routes/3Atlas tabs, current vs historical release; integrate early P07 primitives without visual regression; owned asset packaging thay prototype support.js/CDN runtime.
- **Tests BE:** Descriptor revision/ETag/auth; unknown route/release/capability; URL pick/trade/study/seq aliases and conflicts; no domain writes from Journey/Atlas.
- **Tests FE/browser:** All S00/S12 tests, links/no nested shell, English copy, real fonts/charts,1280/660 + spec viewport, keyboard/reduced-motion; Execution/Planning visual regression unchanged.
- **Exit gate:** 00/12 render bằng production-equivalent build, dev receipt; not placeholder/static prototype fallback; no unreviewed global token/router change.
- **Rollback/handoff:** Rollback lazy Research routes only, keep old shell; handoff typed components/cursor/fixture contracts cho P10–22.

**P09 backend/contract closeout — 2026-09-20:** Control API now owns only two
session-and-workspace-scoped same-origin reads: `GET /api/v1/research/journey`
and `GET /api/v1/research/quantbt/atlas`.  Journey binds the P02 opaque cursor
vocabulary, canonical `seq`/legacy `event_seq` rule and inspection-only
`pick`; Atlas makes one bounded, signed server-side read of the existing P04
catalog and never imports/dispatches QuantBT per view.  The additive immutable
descriptor registry is revisioned and content-hash pinned; generated OpenAPI,
frontend alias and the R2 capability ledger are in lockstep.  The exact
PostgreSQL/private-hop/contract/ledger proof and the completed S00/S12
browser/HIFI receipts are recorded in the [P09 evidence packet](./research_loop/evidence/P09/README.md).
P09 therefore has no untracked backend debt and is scope-complete. The one
global visual-regression baseline exception is pre-existing and documented
against its owning change; it is not masked, re-recorded or attributed to P09.

**P09/P10 route-authority amendment (2026-09-20):** `CG-P09-01` is closed by
publishing the exact P04 `CapabilityAxes`, claim and evidence-contract schemas
through the P09 private parser and generated OpenAPI; no frontend cast or
partial-string inference remains. `FD-P09-02` is also resolved without
changing Alpha Pool maturity: the canonical new S14 product route is
`/research/quantbt/alpha-import`; the existing
`/research/quantbt/imports` remains unchanged; `/research/alphas/import` is
not mounted. The future S14 route/component receipt is owned by Claude when
P10 supplies its producer; P10 may link an accepted AlphaVersion to
`/research/quantbt/runs/new` using opaque declared identifiers only and must
not infer activation from the route.

<a id="rl-p10"></a>
### P10 — New Run end-to-end và compatible creation

**Đọc chi tiết:** [Guide P10](./research_loop/RESEARCH_LOOP_GUIDE_V1_1_24_PHASES_vi.md#phase-p10); [spec S02](./research_loop/release-v1.1/docs/screens/02_new_run.md) + [HTML 02](<./research_loop/release-v1.1/QuantBT 02 New Run Preflight.dc.html>).
**Entry:** dependencies/assignment tại [board](#rl-board) đã đạt; [G0–G7](#rl-test-gates) áp dụng.
**Test IDs bắt buộc:** `P10-T01…T14`, `V11-P10-DR/BR/GX` và source tests applicable theo §13.3.

- **Goal:** Tất cả controls wizard8steps đi vào effective worker request và legacy read model đúng.
- **To-do BE:** Existing facade202 + legacy fields, durable producer intent before ACK; preflight/version binding, route validators; same client_intent_id recovery after transport timeout; old request backward compatibility. **`CG-P08-01` binding:** compute `may_create_run` from one server-owned predicate and reevaluate that exact predicate inside the create transaction; bind actor/workspace, unexpired caller-owned opaque preflight token and all immutable manifest/version digests. Browser input may request a create but can never assert admission. Publish typed denied/unavailable outcomes and preserve the P08 `false` state until this route is live.
- **To-do FE/consumer:** Full02 normal/advanced route config/presets/sweep/pin/seed/review, scratch disclosure, double-click/stale token/reload. Không bỏ trường input để POST pass; preview và serializer cùng canonical model.
- **Tests BE:** Real Delta submit→worker→storage; old/new requests; duplicate/unknown outcome; invalid bounds/schedule/aliases/null defaults; readback strategy/alpha/run seed và RunSync summary.
- **Tests FE/browser:** All S02 tests; every required control→request→effective persisted value; bound/scratch; version change preserves valid input; errors/focus/back-forward; actual no-stub journey.
- **Exit gate:** 100%required wizard mappings and real durable run; no direct compute fallback hoặc fake success; legacy consumer compatibility vẫn xanh.
- **Rollback/handoff:** Rollback wizard intake flag, giữ jobs/schema/old client. Checkpoint05: P09/P10, exact dev candidate + payload/worker parity.

#### P10 backend/contract closeout — `BACKEND_AND_TYPED_CONTRACT_COMPLETE`, 2026-09-21

P10 now provides one additive, fail-closed New Run path without changing the
legacy `/api/runs` request model or activating a runtime service:

- `POST /api/v1/research/run-producer/p04-delta/install` installs/replays the
  **one compiled, immutable** `p04.delta-rsi.v1` binding.  It accepts no
  uploaded source, path, child command, adapter ID or version selector.
- `POST /api/v1/research/runs` accepts only the P02 canonical requested spec,
  a caller-owned P08 opaque token and an idempotency intent.  The same
  server-owned predicate supplies P08's `may_create_run` fact and rechecks it
  inside creation; the browser cannot assert admission, select a worker,
  provide a snapshot path, lease, digest or private principal.
- The PostgreSQL transaction records exactly one attempt, run, job and P10
  producer bridge before the signed Portal hop.  A lost hop is the typed
  `RESEARCH_RUN_TRANSPORT_UNKNOWN`, and retrying the *same* intent reconciles
  the fenced durable job instead of creating a second logical run.
- Portal accepts the P10 envelope only with a short-lived signed internal
  principal containing `research_run_producer`, publishes only
  `quant.run.requested.research`, and never falls through to the legacy
  ProcessPool.  The actual worker keeps P10 scratch/derived tape attempt-local,
  sends only bounded P08 warmup+IS+OOS rows to the isolated Delta child, seals
  a content-addressed bundle with a sanitized audit config/receipt (never the
  preflight token, job/worker/lease fence, snapshot locator/hash or work
  digest), then removes temporary copies.  A terminal
  observation publish cannot rewrite an already sealed success/failure; P11
  owns durable event/progress projection and reconciliation.

The current installed adapter deliberately supports only the exact fixed
Delta qualification profile (`signal_notional`, `three_window_decay`, fixed
P04 parameter map).  Rich route parameters, optimization overrides,
clone/reproduce and engine-upgrade intents are retained in the canonical
requested spec but return a typed adapter-unavailable outcome until their
owner phases P12/P19 install a real, versioned adapter.  This is a truthful
current-capability boundary, not a hidden form narrowing or a generic Python
launcher.

**P10 verification:** the [P10 evidence packet](./research_loop/evidence/P10/README.md)
records a fresh disposable PostgreSQL proof (4/4), direct immutable binding,
idempotent unknown-transport recovery, real P08 snapshot→P06 isolated child,
private HTTP principal rejection/acceptance, worker subject isolation and
scratch cleanup.  It also records Control API build, contract generation/tests,
R2 ledger and P02 legacy-facade regression.  No browser component, HIFI CSS,
image build, dev-stack rebuild, deploy, broker connection or feature flag was
changed by this closeout.

**Claude handoff / P08 visual decision:** Screen 02 may now consume only
`@portal/contracts-research-run-create` through the same-origin BFF.  It must
keep the full HIFI composition, send CSRF with the canonical requested spec,
and render server denial/refusal/unknown outcomes verbatim; `may_create_run`
is display-only and submission must re-handle denial.  Do not manufacture
worker/snapshot/lease fields or a local success path.  The remaining S14/P08
visual question is resolved as `S14-VIS-01`: retain the three authority states
**parse → seven gates → register/activate**; render **Code anatomy** only as a
presentation substage below parse, never as a fourth lifecycle/API/backend
state.  Claude should acknowledge that decision in the next product-route
browser receipt rather than add a new contract.

**P10 browser-contract amendment — `BR-P10-01/02` closed, 2026-09-21:** the
generated P07 registry contract now exposes a bounded, safe Alpha-version
declaration (entrypoint, declared timeframes, `seed_required` and declared
parameter space), including normalized P04 shorthand ranges. It never projects
source bytes/path, adapter, protected-kernel or provenance fields; corrupt
stored data fails typed rather than being guessed in a browser. The P09 current
Atlas now exposes the verified finite trial ceiling (`4000`), the four named
Study/Sampler/Objective/Candidate-selection release-default groups and the
current P10 submission constraints. Those groups are all `RELEASE_DEFAULT` and
`LOCKED`; they explain the release but never authorize a browser override.
Claude must wire these generated facts into the existing Screen 02 validators
and preserve typed unavailable/partial/denied states instead of using
`Infinity` or fabricated declaration values. The exact handoff is
[P10 frontend handoff](./research_loop/evidence/P10/frontend-handoff-claude.md).

**Visual-gate correction:** `7441c572`'s broad embedded-Planning Tailwind scan
was replaced with a reviewed explicit safelist, restoring Portal scan locality
without a snapshot update or a weaker threshold. The Planning Board matrix
passes unchanged. The final immutable Chromium result is **220 pass / 28
screenshot mismatch**: three `planning-reports` Mermaid differences reproduce
at baseline commit `6a712c53`; the remaining screenshot-only baseline/renderer
differences stay visible for a separate visual-owner review with pinned
browser/font evidence. They are not relabelled as P10 passes or refreshed here.

<a id="rl-p11"></a>
### P11 — Progress, console và artifact readiness

**Đọc chi tiết:** [Guide P11](./research_loop/RESEARCH_LOOP_GUIDE_V1_1_24_PHASES_vi.md#phase-p11); [spec S03](./research_loop/release-v1.1/docs/screens/03_run_progress.md) + [HTML 03](<./research_loop/release-v1.1/QuantBT 03 Run Progress.dc.html>).
**Entry:** dependencies/assignment tại [board](#rl-board) đã đạt; [G0–G7](#rl-test-gates) áp dụng.
**Test IDs bắt buộc:** `P11-T01…T12`, `V11-P11-DR/BR/GX` và source tests applicable theo §13.3.

- **Goal:** Progress phản ánh durable lifecycle và tự phục hồi mà không leak connection/RAM.
- **To-do BE:** Structured actual stage events/sequence/snapshot/resume; bounded seek log tail, no log-as-accounting; mandatory seal controls COMPLETED; terminal auth frame/preflight theo approved transport; pacing/backpressure.
- **To-do FE/consumer:** Full03 stage/Gantt/artifact drawer, console500lines/batch100ms, poll5s transient fallback, queue/cancel/retry; auth failure closes stream/poll retry; no demo finish/timer.
- **Tests BE:** Duplicate/gap/out-of-order/stale epoch; service restart/resume; cancel vs seal; mandatory vs optional audit; large log no whole read; 20viewer buffers/requests; auth revoked/401 no retry loop.
- **Tests FE/browser:** All S03 tests; actual counters, no selected double-count; network loss/reconnect+logout terminal; visibility/unmount cleanup; new run not overwritten by old stream; sealed artifacts before complete.
- **Exit gate:** State/counters match persisted source; real reconnect and auth-stop browser evidence; all event/log buffers bounded, full history remains separately accessible.
- **Rollback/handoff:** Approved polling fallback for Research only; preserve event identity. Handoff P12/P13 real status and snapshot contracts.

**Implementation journal — 2026-09-21 (Codex backend):** P11 now has a
separate source journal rather than a console parser: explicit stage/fold/trial/
artifact/readiness events are fsync'd before a bounded private callback;
PostgreSQL accepts only the exact current P10/P06 worker lease and persists an
immutable sequence plus compact snapshot. Public DTOs and the OpenAPI never
contain the fencing fields (`attempt_id`, `lease_epoch`), private principal,
source path, broker/NATS, CLI or raw stdout. Snapshot write is tied to the
event carrying its exact latest sequence, so a callback page cannot expose
state N without the immutable event N−1. Worker restart recovery scans at most
8 journals / 4 relays, event/console pages are capped at 500, in-process
viewers at 20 and SSE live buffering at 16. The cancel CAS remains Control
API-authoritative; source completion after a winning cancellation is displayed
as a source fact with `CONTROL_CANCELLATION`, never as Portal success. The
generated public `ProgressEvent` is discriminated by `event_type`, so Screen-03
can use declared trial/artifact/budget payload fields without a handwritten
payload parser or duplicated source vocabulary.
The five-second session/membership monitor has a single-flight guard, so a
slow authorization store cannot create an unbounded per-viewer promise queue.
New terminal source facts after a terminal P06 job are rejected before the
immutable insert; the narrowly documented cancellation race is the only
exception, and it still renders `CONTROL_CANCELLATION` rather than success.
The worker fsyncs a source terminal event before making its local attempt
terminal; a redelivery of an already terminal P11 journal reconciles only the
exact immutable bundle/attempt and never runs the engine again. A reclaimed
non-terminal journal is fenced `LEASE_LOST` rather than reset or re-executed
in place: P12 owns a new-attempt retry path, so P11 cannot duplicate work or
rewrite a partially observed progress history.
Journal reopen validates its compact schema/sequence bounds and rejects a
duplicate `run_started`, so a malformed or stale local record cannot regress
an attempt back into an apparently fresh execution.
The compact snapshot has a 256 KiB source/Control/PostgreSQL cap, so declared
fold/artifact cards remain bounded while later artifact/history readers retain
their own authority for anything beyond Screen-03 progress.
P11 never publishes an artifact link (`reader_href` is exactly `null`): a
sealed-card readiness fact is not a download authorization or a source-path
disclosure; P12/P13 own a later named reader if one is needed.

**Display-fact amendment — 2026-09-21 (Codex backend):** `CG-P11-01` and
`CG-P11-02` are closed without changing the method the current source reports.
Each newly materialised fold now has a strict `fold_timeline`: the P04 source
truthfully starts at `NOT_PUBLISHED`, and only an exact
`fold_segment_observed` source event can supply a real `search`, `oos` or
`freeze_tick` timestamp. `PARTIAL` remains visibly partial; `COMPLETE` means
all three named segments are source-emitted and terminal. A separately typed
`claim.methodology_certificate` represents `NOT_PUBLISHED`, `NOT_ISSUED` or an
actual A–D `ISSUED` fact. It is deliberately not derived from claim prose,
Atlas L0–L4 capability or a methodology ceiling. The public OpenAPI remains
backward-decodable for snapshots predating this additive amendment; their
absent fields are normalised by private Control ingress to the documented
`NOT_PUBLISHED` objects before persistence/fan-out, never inferred content.
Source, Control and generated-contract tests pin both rules. See
[P11 display-fact amendment](./research_loop/evidence/P11/contract-amendment-display-facts.md)
and the amended [P11 frontend handoff](./research_loop/evidence/P11/frontend-handoff-claude.md).

**Evidence/ownership:** source journal tests 9/9 plus P10/P11 worker and
crash-window regression 26/26 using repository-pinned `quantbt-engine 1.1.1`;
disposable fresh PostgreSQL P10→P11 integration 3/3; Control contract/config/bounded-snapshot/revoked-stream/slow-auth close 18/18 and build; generated-contract
3 focused + 146 global tests; R2 route ledger 22/22; compose render-only pass.
See [P11 packet](./research_loop/evidence/P11/README.md). All four feature
flags stay false and no runtime/deploy/browser receipt is claimed. Claude owns
the complete S03 HIFI product consumer, visual browser audit, EventSource
close/poll lifecycle and real-route receipt via
[the P11 handoff](./research_loop/evidence/P11/frontend-handoff-claude.md).

<a id="rl-p12"></a>
### P12 — Run Library, search và historical browsing

**Đọc chi tiết:** [Guide P12](./research_loop/RESEARCH_LOOP_GUIDE_V1_1_24_PHASES_vi.md#phase-p12); [spec S01](./research_loop/release-v1.1/docs/screens/01_run_library.md) + [HTML 01](<./research_loop/release-v1.1/QuantBT 01 Run Library.dc.html>).
**Entry:** dependencies/assignment tại [board](#rl-board) đã đạt; [G0–G7](#rl-test-gates) áp dụng.
**Test IDs bắt buộc:** `P12-T01…T11`, `V11-P12-DR/BR/GX` và source tests applicable theo §13.3.

- **Goal:** Fast useful library trên persisted data, đầy đủ filters/actions và không N+1.
- **To-do BE:** Indexed keyset/group/sort/count,<=24point sparklines; batch projections; old-engine reader; logical run vs worker/child/draft counters; mutable mirror separate from immutable metrics.
- **To-do FE/consumer:** Full01 filters/URL/group headers/menus/compare bar, running-row10s poll visibility-aware; stable selections and scroll; real empty/stale/denied reasons.
- **Tests BE:** Cursor ties/filter mismatch/concurrent updates; exact totals/auth isolation; query plans/cold-warm under compute; no full Parquet scan; synthetic scale separately labelled.
- **Tests FE/browser:** All S01 tests; selection survives refresh; clone/reproduce IDs correct; metrics scope (full-sample≠OOS); no null→0; large rows bounded DOM; worker stopped still browsable.
- **Exit gate:** Required columns/filter/actions integrated and truthful; useful real run rows, bounded query+render; Library/Lineage counter definitions compatible.
- **Rollback/handoff:** Rollback query/projection version not metadata. Checkpoint06: P11/P12 + auth/stream/load/library dev evidence.

**P12 implementation journal — 2026-09-21:** Codex has delivered the additive,
feature-dark persisted-reader lane only: `research.run_library_rows_v1` combines
durable Research identities with the existing Portal 1.0.8 metadata reader;
trigger-maintained, display-safe trigram search documents avoid a history scan;
both list and lazy sparkline routes are named same-origin operations. A single
repeatable-read transaction pins page/count/facet/counter/`as_of_utc_ms`; opaque
cursors bind workspace, normalized filter, sort, direction and limit. The
reader uses a two-active/eight-queued admission lane, 50-row pages, a 50-ID
visible-row poll bound and no artifact/Parquet/worker/engine/source-DB access.
Missing source metrics, sparkline, RC and legacy fields remain explicit typed
absence, never zero/defaults. Fresh disposable PostgreSQL proof covers ties,
cursor mismatch, membership isolation, retry/child accounting, trigger update
and delete cleanup, index shape, runtime write denial and 80-row capped
synthetic history. See the packet for exact commands and limits. Claude owns
the rich S01 route, HiFi browser audit and product receipt; P12 does not enable
a runtime flag or claim real QuantBT/deployment evidence.

**P12 closeout amendment — 2026-09-22:** `P12-DEC-01` approves the Screen-01
canonical route `/research/quantbt/runs`; the previously approved library stays
intact at `/research/quantbt/runs/legacy`. The change is routing-only and
reversible, with no data migration, runtime feature change or removal of the
legacy component. `runs/new`, `runs/:runId/progress` and
`runs/:runId/*` remain distinct static/parameter routes. `CG-P12-01` is
resolved as **NO_NEW_CONTRACT_NEEDED**: `claim_ledger` is the published,
typed aggregate; `counters` mean logical/child/retry row classes, not lifecycle
statuses, so a browser must not synthesise the HiFi sample census. A future
status-census request is valid only if product needs it and must publish scope,
filter binding, `as_of_utc_ms`, completeness and source definitions as a new
named contract. The current-head P12 Control unit (23), generated contract
(3), fresh tmpfs PostgreSQL (5), targeted S01/route (50) and Control API build
are green; this re-proves T08 and the backend portions of T09/T11. This closes P12's feature-dark backend/typed-consumer scope; it
does not claim a real backend, a running QuantBT job, deployment activation or
visual-baseline re-record. Exact evidence and the remaining P09/P10 ownership
boundaries are in the [P12 closure addendum](./research_loop/evidence/P12/p12-closure-codex.md).

<a id="rl-p13"></a>
### P13 — Evidence Flow Hub và metric projections

**Current status — 2026-09-22: `AUDIT_REOPENED`.** The journal below records
the original narrow implementation, not full phase acceptance. Follow the
[Astra remediation checkpoint](#rl-p13-p17-audit) before claiming completion.

**Đọc chi tiết:** [Guide P13](./research_loop/RESEARCH_LOOP_GUIDE_V1_1_24_PHASES_vi.md#phase-p13); [spec S04](./research_loop/release-v1.1/docs/screens/04_evidence_flow.md) + [HTML 04](<./research_loop/release-v1.1/QuantBT 04 Evidence Flow.dc.html>).
**Entry:** dependencies/assignment tại [board](#rl-board) đã đạt; [G0–G7](#rl-test-gates) áp dụng.
**Test IDs bắt buộc:** `P13-T01…T13`, `V11-P13-DR/BR/GX` và source tests applicable theo §13.3.

- **Goal:** Tất cả7tabs/drawers/charts có exact source mapping; không một report engine thứ hai.
- **To-do BE:** Versioned evidence envelope, summary/claim/equity/drawdown/rolling/monthly/distributions/folds; metric registry units/scope/formula/null; atomic revision; lazy detail; DR02 warning definitions.
- **To-do FE/consumer:** Full04 composition incl claim/data drawers/navigation; rich panels giữ layout trong sparse/error states; no whole-route envelope; actual series plotted, inspectors don't change selected passport.
- **Tests BE:** Raw engine metrics + independent derived vectors; zero/no-loss/empty/NaN/benchmark missing; downsample extrema not metric; revision/cache concurrency; required raw-available transforms implemented.
- **Tests FE/browser:** All S04 tests and7tab network coverage; chart/tooltip/table values vs frozen reference; resource switches and stale-response rejection; fonts/a11y/overflow, no JSON-hidden proof.
- **Exit gate:** Required field/action matrix closed, browser values match raw/DTO revision; useful data rendered and all declared edge states handled; no compute on page open.
- **Rollback/handoff:** Rollback projection version/cache namespace, keep raw evidence. Handoff metric/warning registry and cursor semantics.

**P13 implementation journal — 2026-09-21:** Codex delivered a feature-dark,
additive Evidence Flow lane. The confined P04 child calculates the exact direct
and derived P13 receipt while the full result is in memory; the worker fsyncs
the bounded canonical document before P11 terminal emission, and the relay
attaches it only when the journal digest matches. Control API validates that
pair, persists immutable source/projection/four named series rows, and exposes
only a session/workspace-scoped compact Hub plus lazy `<=192` exact-value
series under an immutable revision/ETag. PostgreSQL has explicit immutable
guards, role grants, reader admission and finite transaction budgets. Current
P04 benchmark/funding/audited-fill/per-fold facts are typed absences; no
artifact, raw market data, worker identity, path, cursor, Execution or CLI
fallback is introduced. The fresh P11→P13 PostgreSQL proof, generated-contract
verification and P13-affected CI-pinned Python corpus pass. Screen-04 rich
composition/browser acceptance is Claude-owned and remains unclaimed while
the feature flag is false; see the [P13 packet](./research_loop/evidence/P13/README.md)
and [handoff](./research_loop/evidence/P13/frontend-handoff-claude.md).

**P13 contract amendment — 2026-09-22 (`CG-P13-01`, `CG-P13-02` closed):**
The one same-origin Hub now owns Screen-04's fact-shaped durable run header
(`research.runs` status/created time, reconciled producer/alpha binding and
P08 parsed mode/schedule/route id/config digest/seed) and its bounded P11
**observed** fold selector. It does not compose Screen 01 or P14/RS-02, so
one response cannot mix distinct freshness/profile/revision facts. Current
P02 still publishes no route-contract statement: that exact field remains
`NOT_PUBLISHED`, never inferred from `execution_route`. The observed fold set
is not a full source plan/boundary assertion. `revision` remains immutable
`p13r1_*` for lazy-series binding; Hub cache validation is now weak
`W/"p13h1_*"` over the complete semantic Hub snapshot. See the
[P13 contract amendment](./research_loop/evidence/P13/contract-amendment-run-identity-fold-navigation.md).
Fresh P11/P13 PostgreSQL proof now covers these joins and the corrected report
sidecar test constructor; no runtime feature was activated.

<a id="rl-p14"></a>
### P14 — Split, chronology và holdout truth

**Current status — 2026-09-22: `AUDIT_REOPENED`.** Fixed-P04 compatibility is
retained; range/data-use and original source-supported scope must be completed
under the [Astra checkpoint](#rl-p13-p17-audit). Missing adapter output is not
proof of engine-wide unavailability.

**Đọc chi tiết:** [Guide P14](./research_loop/RESEARCH_LOOP_GUIDE_V1_1_24_PHASES_vi.md#phase-p14); [spec S05](./research_loop/release-v1.1/docs/screens/05_s1_split.md) + [HTML 05](<./research_loop/release-v1.1/QuantBT 05 S1 Split.dc.html>).
**Entry:** dependencies/assignment tại [board](#rl-board) đã đạt; [G0–G7](#rl-test-gates) áp dụng.
**Test IDs bắt buộc:** `P14-T01…T13`, `V11-P14-DR/BR/GX` và source tests applicable theo §13.3.

- **Goal:** Thể hiện đúng IS/OOS/holdout và causal claims của **current
  installed P04 source**, không dựng approval mới. P14 is a source-fact
  reader, not a generic WFO, historical-candle or holdout-access feature.
- **To-do BE:** P10 records the exact semantic three-window boundaries while
  it builds the confined child tape; P11 fsyncs one bounded immutable terminal
  source sidecar and its digest; relay/Control API validate the pair and
  persist a manifest-bound immutable source/projection. Publish one named,
  session/workspace-scoped same-origin `GET /api/v1/quantbt/runs/:runId/split`
  BFF with UTC milliseconds, exact SHA-256/revision/ETag, bounded admission
  and typed availability. Current source facts are: optional warmup, IS,
  observed fixed-profile outer OOS, metadata-bound holdout not exposed to the
  child/no result, `NOT_ATTESTED` physical Parquet row-group I/O, and
  `NOT_ASSERTED` strict-OOS selection. Fold plan, purge, embargo, inner folds,
  theta, gap scan, source seal and unlock are exact `NOT_PUBLISHED` facts.
  DR01 is therefore **not an unresolved mutation**: no source actor/API exists
  today and P14 must not create one.
- **To-do FE/consumer:** Full05 timeline/windowed visual groups/quality drawer
  and valid links consume only the generated P14 client. Keep the rich Screen
  shell in all states. Use S05's protocol/fold anatomy, inner folds, holdout
  and gap-scan structure; the former Code Anatomy/import-stage instruction
  was copied from S14 and is withdrawn by audit A11. This does not introduce
  a seal or authority state. Show typed current-source absences inside panels; no
  browser date math, raw holdout request, fake fold segments or unlock button.
- **Tests BE:** Exact half-open contiguous UTC chronology; source digest
  pairing/oversize/nonterminal refusal; semantic IS/OOS child-tape counts;
  P04 real isolated child proof; manifest/lease binding; duplicate terminal
  idempotence; immutable update/delete refusal; wrong-workspace/ETag;
  physical-I/O and no-holdout/no-path/no-lease leakage. Do not claim a
  future-perturbation or strict-selector proof that the fixed source does not
  publish.
- **Tests FE/browser:** All applicable S05 tests; viewport compression cannot
  alter intervals; direct browser HiFi comparison at 1280px/660px; loading,
  pending, legacy, typed absence/error and ETag refresh; navigation never
  evaluates/reveals raw holdout. A fixture result is not product or real-source
  acceptance.
- **Exit gate:** Backend closes only when P10→P11→relay→immutable projection
  and generated contract proofs pass, feature remains dark, and every absent
  source capability has an exact typed fact rather than a placeholder. P14
  does **not** claim Screen-05 browser/product acceptance until Claude returns
  its separate receipt. A later source revision that publishes WFO/seal/unlock
  must add a versioned contract/relation and a dedicated action phase; it may
  not reinterpret P14 history.
- **Rollback/handoff:** Deploy `FEATURE_RESEARCH_SPLIT=false` only; retain
  append-only source/projection facts and P11 receipt. Never re-seal/view raw
  holdout or delete evidence. Checkpoint07: P13/P14 source/UTC/digest/holdout
  decision record; [P14 packet](./research_loop/evidence/P14/README.md).

**P14 implementation journal — 2026-09-21:** Codex delivered the additive,
feature-dark current-source backend and generated contract. P10 derives a
semantic child-tape receipt from the immutable P08 windows; P11 stores it
atomically (`0600`, canonical SHA-256, fsync) before its terminal event; the
relay attaches it only when the event digest matches. Control API validates
the terminal pairing, binds it to the exact P10 immutable manifest and worker
attempt, stores append-only source/projection rows behind scoped membership queries and runtime-role grants,
finite transaction budgets and 2-active/8-queued read admission, then exposes
one ETag-aware BFF. No direct database/source snapshot/Parquet/Execution/CLI
route, raw holdout, physical-I/O assertion, WFO fold, new governance state or
mutation was added. Python targeted source tests, Control API build/units,
generated-contract verification and a fresh disposable PostgreSQL P11→P14
proof pass. Screen-05 composition and browser/HiFi acceptance remain
Claude-owned; see [P14 handoff](./research_loop/evidence/P14/frontend-handoff-claude.md).

<a id="rl-p15"></a>
### P15 — Search, complete trial ledger và diagnostics

**Đọc chi tiết:** [Guide P15](./research_loop/RESEARCH_LOOP_GUIDE_V1_1_24_PHASES_vi.md#phase-p15); [spec S06](./research_loop/release-v1.1/docs/screens/06_s2_search.md) + [HTML 06](<./research_loop/release-v1.1/QuantBT 06 S2 Search and Selection.dc.html>).
**Entry:** dependencies/assignment tại [board](#rl-board) đã đạt; [G0–G7](#rl-test-gates) áp dụng.
**Test IDs bắt buộc:** `P15-T01…T14`, `V11-P15-DR/BR/GX` và source tests applicable theo §13.3.

- **Goal:** Đủ StageA/StageB/objectives/selection và toàn ledger, giữ inspected trial khác chosen artifact.
- **To-do BE:** Study-scoped trial/evaluation index, keyset/jump/exact totals;<=600point scatter inclusion selected/best; histograms/frequencies/pruning/progression; source objective modes/centroid/per-fold; derived diagnostics full raw khi đủ.
- **To-do FE/consumer:** Full06 three-column layout/formulas/modes/pool/funnel/ledger/keyboards; inspected cursor synchronizes detail not frozen selection; no implicit optimize when tab opened.
- **Tests BE:** SelectedNone/centroid/multiobjective/missing objective; trialID collisions; complete/pruned/feasible flags; full totals≠sample; canonical seed/constraints; categorical diagnostic no arbitrary numeric encoding.
- **Tests FE/browser:** All S06 tests; all modes/schedules supported; >sample-cap pages reachable; nonselected pick→Freeze/Report still θ*; formula labels actual config; narrow/widen boundary and responsive spec overflow.
- **Exit gate:** Every required panel/field/action closed; full-ledger source counts reconcile; derived raw-sufficient work done; no selection recomputation in query layer.
- **Rollback/handoff:** Rollback reader transform/version, retain original trial ledger. Handoff selected target/population/diagnostic schemas cho P16.

#### P15 current-source compatibility amendment — 2026-09-22

**Audit supersession:** the following is the historical fixed-profile slice
description. Its blanket `SOURCE_CAPABILITY_BLOCKED` classification does not
close the original optimizer scope: real installed-engine WFO artifacts pass
the audit probe. A09 and [RS-02](#rl-rs-02) own Portal integration; status is
`AUDIT_REOPENED`, not debt-free full P15 completion.

P04 is an installed **fixed-parameter qualification**, not a generic optimizer:
the bounded P10 admission rejects parameter overrides, random seed, early
stopping, optimizer configuration and a trial count other than one. Its P11
`trial 1/1` progress counter is an execution progress fact, **not** a study,
candidate, selected trial, raw best, objective score or historical trial
ledger. P14 additionally publishes `FIXED_PROFILE_NO_SEARCH` and does not
assert strict outer-OOS selection. Neither the browser nor this BFF may upgrade
those facts by using an old runner, a source database, a worker journal,
artifact/Parquet file or a synthetic fixture.

This makes the original generic P15 goal two explicit, non-interchangeable
gates:

| Gate | Current decision / implementation | Completion condition |
|---|---|---|
| **P15-A — fixed current-source truth** | **Complete in this phase.** `GET /api/v1/quantbt/runs/{runId}/search` consumes one session/workspace-scoped immutable P14 projection and its P10 bound contract. It publishes exact decimal fixed parameters, digest/revision/ETag, declared-but-not-executed mode/schedule, a null selected trial and individually typed `NOT_APPLICABLE` study/ledger/diagnostic panels. | Generated contract, membership/ETag/feature-dark tests, fresh PostgreSQL P10→P14→P15 proof, route ownership ledger and Screen-06 handoff all pass. No P15 source relation, cache, worker, migration or runtime service exists. |
| **P15-B — generic optimizer ledger** | **SOURCE_CAPABILITY_BLOCKED, not waived and not represented as P15-A success.** Current P04 publishes no study ID, trial/evaluation identities, raw parameter samples, objective components/directions, sampler/seed/constraint/selection trace, population totals or diagnostics. | A future installed adapter must publish a new versioned, immutable source contract and bounded retained relation for those exact facts. It must be integrated as a new reader/projection revision, with source/engine evidence, before `P15-T01…T14`, real browser Screen-06 modes or the generic P15 exit gate can be claimed. |

`P15-A` is deliberately a complete, stable compatibility surface rather than a
temporary hand-mapped UI. It verifies the immutable P04 adapter and parameter
bundle digests before exposing any static declaration; a mismatch is typed
`NOT_PUBLISHED`, never silently reinterpreted. Pending and legacy retained rows
keep their availability state inside nested absences. The feature defaults
dark (`FEATURE_RESEARCH_SEARCH=false`) and has no dependency that activates a
worker, source read, optimizer, execution profile or command.

Claude must use the generated `researchSearchDetailGetV1` type only. The
Screen-06 composition keeps the HiFi shell, but each optimizer-only panel must
render its typed source reason rather than hiding the screen or substituting a
fixture. The complete five-mode Screen-06 fixture lane may remain a clearly
labelled visual/interaction harness; it cannot be called product truth for a
P04 run.

<a id="rl-p16"></a>
### P16 — Freeze, integrity verification và what-if

**Đọc chi tiết:** [Guide P16](./research_loop/RESEARCH_LOOP_GUIDE_V1_1_24_PHASES_vi.md#phase-p16); [spec S07](./research_loop/release-v1.1/docs/screens/07_s3_freeze.md) + [HTML 07](<./research_loop/release-v1.1/QuantBT 07 S3 Freeze.dc.html>).
**Entry:** dependencies/assignment tại [board](#rl-board) đã đạt; [G0–G7](#rl-test-gates) áp dụng.
**Test IDs bắt buộc:** `P16-T01…T14`, `V11-P16-DR/BR/GX` và source tests applicable theo §13.3.

- **Goal:** Verify immutable evidence thật; diagnostic không thay frozen parameters hoặc chạy ngầm.
- **To-do BE:** Separate pool/selection/evaluation boundaries; bounded expected-digest verifier/receipt; diagnostic explicit queued job or exact-grid reuse; seed/data/objective key;81cells canonical unique-evaluation mapping.
- **To-do FE/consumer:** Full07 passport/timing/integrity/reverify/9×9lookup and sibling draft; sliders query only, missing cell labelled; preserve hi-fi interactions without fake verify timer.
- **Tests BE:** Corrupt bytes no rebaseline; skewed clocks not causal proof; reuse target/audit; clamp/step dedup; stochastic key isolation; cancel/resource bound; ΔJ correct scope.
- **Tests FE/browser:** All S07 tests; advancing fake timer cannot PASS real verifier; slider/mount no POST/job; nonselected pick still frozen passport; new intent explicit; undefined/queued grid states truthful.
- **Exit gate:** Expected bytes checked, original θ/digests immutable; diagnostic job/data/resource provenance fully traceable; DR02 copy/definition settled.
- **Rollback/handoff:** Disable diagnostic creation only, retain original/grids. Checkpoint08: P15/P16 + trial→freeze invariants and dev evidence.

#### P16 current-source compatibility amendment — 2026-09-22

**Audit supersession:** retain this historical v1 partial-verifier contract,
but not its blanket “not implementation debt” conclusion. A10 identifies
existing P05/P11 artifact foundations that must be integrated; supported
selection/diagnostic facts require A09 mapping. [RS-01/02](#rl-p13-p17-audit)
close the implementation gaps before original P16 acceptance.

The original P16 target assumes an installed optimizer source with an immutable
selection artifact, expected artifact bytes, causal wall-clock order, a
precomputed diagnostic grid and a bounded sibling-draft admission. The current
P04 adapter is a single **fixed-parameter qualification**. P10 refuses
parameter overrides, trials other than one, random seed, optimizer
configuration and early stopping; P14 explicitly says
`FIXED_PROFILE_NO_SEARCH`, `NOT_ASSERTED` strict outer-OOS, and
`NOT_ATTESTED` physical I/O. A P11 progress counter is not an optimizer pool,
selection, exact evaluation or integrity artifact.

Accordingly this phase has two exact gates, neither is silently substituted for
the other:

| Gate | Current decision / implementation | Completion condition |
|---|---|---|
| **P16-A — retained current-source Freeze verifier** | **Complete in this phase.** `GET /api/v1/quantbt/runs/{runId}/freeze` reads one session/workspace-scoped immutable P14 projection and returns frozen P04 values only when all three retained bindings match: compiled P04 adapter digest, P10 producer manifest ↔ P14 source manifest, and static P04 parameter-bundle digest. `POST …/freeze/verify` is an origin/CSRF-protected re-read only: no audit row, job, source access or mutation. A mismatch returns typed `BLOCKED`, removes the local parameter table and never remaps it over another immutable bundle. | Generated contract, feature-dark/membership/ETag/CSRF tests, capability ledger, and fresh PostgreSQL P10→P14→P16 proof pass. `PARTIAL_MATCH` remains visibly partial because P16 cannot see source artifact bytes. |
| **P16-B — full artifact integrity, causal ordering and what-if** | **SOURCE_CAPABILITY_BLOCKED, not implementation debt and not a P16-A success claim.** Current P04/P10/P11/P14 publish no source artifact byte digest/receipt, candidate population, selection artifact/reference/sequence, wall-clock source events, exact evaluation identity/grid/objective, diagnostic admission or sibling-draft relation. | A future installed source adapter must publish a new versioned immutable source contract for those facts and a bounded retained projection. It must be integrated in a distinct reader/projection revision before generic P16 `T01…T14`, a “chain intact” claim, sliders, grid preview, diagnostic job or draft action can be accepted. |

`P16-A` is intentionally a complete compatibility contract, not a temporary
manual mapping. It has one named generated GET and one explicit re-read POST;
both accept only a run, optional workspace and bounded inspection fold. No
browser can choose a source relation/revision/cursor, path, artifact, raw
market input, worker custody value, parameter override or job. The deployed
feature remains dark (`FEATURE_RESEARCH_FREEZE=false`) and is independent of
P10/P11 worker activation.

Claude must consume only `researchFreezeDetailGetV1` and
`researchFreezeVerifyPostV1`. Screen 07 retains its rich HiFi shell, but for a
real P04 run it must render static parameter/data-time facts plus typed source
gaps. `PARTIAL_MATCH` must read as “Portal retained binding matched; source
artifact bytes are not attested,” never “chain intact.” Sliders, what-if grid,
diagnostic evaluation and sibling draft are not hidden client mutations; they
stay visibly `NOT_APPLICABLE` until a versioned source contract publishes them.

#### P14–P16 consumer-contract closeout — 2026-09-23

Three focused Claude requests are closed without widening source authority or
creating a broad screen endpoint:

| Request | Decision / contract | Consumer rule |
|---|---|---|
| `CG-P14-01` | [P14 UTC axis ruling](./research_loop/evidence/P14/axis-label-presentation-ruling.md): tick placement/labels derived from published `timeline` are display-only, so no synthetic tick relation is added. | UTC labels may vary with viewport; they must never alter/recreate a source boundary, hash/request/cache/export fact or calendar/holdout inference. |
| `CG-P15-01` | [P15 amendment](./research_loop/evidence/P15/contract-amendment-candidate-selection-metric.md): `requested_optimizer.candidate_selection_metric` is required and current P04 emits typed `NOT_PUBLISHED`; `CONFIRMED` is reserved for a persisted `RUN_BOUND_ENGINE_DEFAULT`. | Do not infer from mode/schedule or a mutable engine catalogue default; show the source reason in the existing claim/formula panel. |
| `CG-P16-01` | [P16 amendment](./research_loop/evidence/P16/contract-amendment-verification-scope.md): explicit verify response owns required top-level `verification_scope`. | Render the scope returned with that user action, not a value borrowed from an old detail snapshot. |

All three amendments are additive/read-only. They add no migration, source
adapter/worker, Execution call, browser authority, runtime flag or release
activation. Their targeted backend/generated-contract gates must pass before
Claude regenerates and consumes the declarations.

**Closeout evidence:** targeted P15/P16 Control API contract/service/controller
tests (16), generated-contract tests (11), TypeScript build, full generated
output verifier, contract-snapshot check and whitespace check passed on
2026-09-23. P14 is a normative consumer presentation ruling and requires its
separate Claude browser receipt; it has no backend artifact to regenerate.

<a id="rl-p17"></a>
### P17 — Route-aware replay và state-at-cursor

**Đọc chi tiết:** [Guide P17](./research_loop/RESEARCH_LOOP_GUIDE_V1_1_24_PHASES_vi.md#phase-p17); [spec S08](./research_loop/release-v1.1/docs/screens/08_s4_execute.md) + [HTML 08](<./research_loop/release-v1.1/QuantBT 08 S4 Execute Replay.dc.html>).
**Entry:** dependencies/assignment tại [board](#rl-board) đã đạt; [G0–G7](#rl-test-gates) áp dụng.
**Test IDs bắt buộc:** `P17-T01…T14`, `V11-P17-DR/BR/GX` và source tests applicable theo §13.3.

- **Goal:** Replay evidence đã có nhanh và chính xác, không chạy lại engine khi seek.
- **To-do BE:** Actual route-discriminated orders/fills/trades/events/positions; original identity + playback ordinal, checkpoints/window queries; candles/MAE-MFE only when input sufficient; fold resets, child audit provenance.
- **To-do FE/consumer:** Full08 playback/SL-TP/legs/OCO/wake/validation panels đúng route; virtual ledger/detail drawers, trade/event deep links; causal reveal presentation-only.
- **Tests BE:** Sequential vs random/far-seek equivalence; seq{10,12,90}/same timestamp/crossstream ambiguity; partial fills/funding/OCO units; missing evidence typed; no equity→inventedfills; no compute on seek.
- **Tests FE/browser:** All S08 tests; all applicable subpanels, charts/trades synchronized; reveal hides future outcomes in playhead panels, retrospective summary labelled; deep-link fresh tab; large-window DOM/memory bounds.
- **Exit gate:** Source accounting/IDs match; seek bounded even late range; preserved layout+truthful conditional panels; observed history not relabelled authoritative Trading replay.
- **Rollback/handoff:** Rollback reader/index version, retain artifacts; handoff source order/checkpoint/financial reconciliation for Report.

#### P17 current-source compatibility amendment — 2026-09-22

**Audit supersession:** this records the v1 sampled-equity slice only.
`SOURCE_CAPABILITY_BLOCKED` is not a valid engine-wide conclusion: public
positions/returns and WFO artifacts exist but are not retained by this adapter.
A05/A06/A08/A09 and [RS-01/02](#rl-p13-p17-audit) are open. Keep retrospective
labels and preserve actual route-specific gaps; do not fabricate a ledger.

The installed `p04.delta-rsi.v1` path has exactly one sealed current-source
fact usable on Screen 08: P13's immutable OOS equity samples. It does **not**
publish an execution order/fill/trade/position/event ledger, event sequence,
same-timestamp ordering, candle/trade windows, OCO relationship, funding,
MAE/MFE, fold capital convention, child-audit replay provenance or an
execution-state snapshot. P11 progress sequence is a worker lifecycle record,
not an execution ledger, and must not be re-labelled as one.

| Slice | Decision | Completion / boundary |
|---|---|---|
| **P17-A — current-source equity playhead** | **Complete in this phase.** `GET /api/v1/quantbt/runs/{runId}/execute/replay` reads only P13 Hub + `EQUITY_OOS` through the Portal evidence service, emits at most 100 of the retained 192 display samples, uses signed revision/workspace/run-bound cursors, and supports a direct `at` playhead cursor. | The returned selected value is explicitly `RETROSPECTIVE_EQUITY_NOT_EXECUTION_STATE`; it is not an account/position/order state. Cursor seek is a read only: no engine invoke, worker, queue item, cache, table, migration, source DB/artifact/raw-market access or command. |
| **P17-B — generic route-aware execution replay** | **SOURCE_CAPABILITY_BLOCKED, not P17-A debt.** The original complete `P17-T01…T14` expectations for fills/OCO/funding/multi-leg/MAE-MFE/fold resets/event order cannot be truthfully tested against P04 because the fact set is absent. | A future versioned source receipt must publish bounded retained records with original IDs, route/fold scope, sequence ordering semantics, checkpoint/retention rules and exact financial/candle inputs. A distinct integration phase must then add a new discriminated contract; no direct worker/database/artifact read or frontend inference is allowed. |

**Contract and operational rules:** the route remains
`FEATURE_RESEARCH_REPLAY=false` by default and depends on
`FEATURE_RESEARCH_EVIDENCE=true`. `cursor`, `before`, and `at` are mutually
exclusive opaque Portal cursors, never browser-provided relation/source IDs.
Availability, sampling (`FULL` versus `EXTREMA_BUCKET_V1`), exact decimal
strings, UTC milliseconds, source observation count and the P13 revision are
preserved. A missing/changed evidence revision invalidates old cursors rather
than attempting a best-effort replay.

**Frontend handoff:** Claude owns Screen 08's HiFi composition, generated
consumer, browser audit and visual/resource receipts. The rich shell stays in
place, but all unsupported execution panels must display their named typed
reason rather than a fake ledger; local playback is presentation only and must
not issue a request per animation frame. See
[P17 handoff](./research_loop/evidence/P17/frontend-handoff-claude.md).

#### P17 Thanhvuong frontend implementation note — Screen 08 (2026-09-23)

**Trạng thái:** `P17_A_S08_FRONTEND_COMPOSED · PRODUCT_ROUTE_BROWSER_RECEIPT · NOT_VERIFIED`.
Nhánh `feat/thanhvuong/research-p17-p21`, base `21f9a98b`, code head `002e4098`,
12 file frontend (+2182/−10). Không có thay đổi contract/backend/runtime. P17-B
vẫn `SOURCE_CAPABILITY_BLOCKED`.

**Đọc chi tiết (packet):** [receipt](./research_loop/evidence/P17/thanhvuong-frontend-receipt.md)
(bảng đã đọc file@commit, mapping hi-fi → component → field → state → assertion,
so hi-fi §4.1, discrepancy §7) ·
[backend requests](./research_loop/evidence/P17/thanhvuong-backend-requests.md) ·
[test results](./research_loop/evidence/P17/thanhvuong-test-results.json) ·
[debt register](./research_loop/evidence/P17/thanhvuong-debt-register.json) ·
[rollback](./research_loop/evidence/P17/thanhvuong-rollback.md).

- **Đã giao:** route `/research/quantbt/runs/:runId/execute` (`researchReplayDetailGetV1`
  + retained RS-02 chỉ đọc khi người dùng bấm); transport chỉ chạy trên sample
  đã tải, 0 request khi play/seek; 409 `CURSOR_EXPIRED` → bỏ token, hồi phục đúng
  một lần bằng `at_ordinal`; hash `seq` chỉ ghi khi playhead dừng; mọi panel
  hi-fi giữ chỗ và in reason code (6 panel vắng, 13 route capability, 2 source
  absence); hub Stage 4 và link "next" của S07 trỏ tới S08.
- **Evidence:** tsc/build PASS; unit 2971 pass/1 skip (S08 36/36); browser toàn
  Research 104/104 trên preview riêng 4417, API stub, 1280/660; 20/20 ảnh state
  overflow 0, console sạch. Chưa có `REAL_API_E2E_RECEIPT` (feature-dark), axe.
- **Geometry hi-fi đã sửa ở `548e8d29` (rule 9):** passport ngang; identity +
  headline một hàng (6 tile 2 × 3); equity có caption hai đầu, trục từ chuỗi
  server, legend, nhãn fold, underwater 92px; certification chain + artifacts
  và promotion + provenance hai cột; 660 xếp chồng. Còn lệch chỉ vì thiếu field
  (`CG-P18-01…07`, receipt §4).
- **Lỗi tìm ra và đã sửa trong phase:** thiếu panel PnL distribution (`3cf70794`);
  retained 409 đọc sai và 403 xác nhận run tồn tại, trái addendum RF-01/RF-02
  (`002e4098`); nhãn test trùng ID Guide (`9ee85241`); 501 `/api/runs/:id` (`737d279d`).
- **Backend request (@codex), kiểm lại 2026-09-23 trên `e39bacfa`, đều OPEN:**
  `CG-P17-01` fixture replay canonical; `CG-P17-02` fact retained-lane theo run +
  mã `RESEARCH_CURRENT_SOURCE_*` trong generated contract; `CG-P17-03` ngữ nghĩa
  `emitted_point_count` / `source_observation_count`. Tám hàng P17-B giữ tên theo
  [capability matrix](./research_loop/evidence/P17/source-capability-matrix.md).
- **Bobby quyết:** tích hợp baseline `952ad48f…e39bacfa` (1 xung đột
  `FreezeDetail.tsx`; S08 → `toResearchRefusal` + `recovery`); tiêu đề S08
  (`VISUAL_DECISION_REQUIRED`); LENS / dòng artifact / COPY EVIDENCE LINK / Reveal;
  hook workspace; axe.
- **Exit gate còn lại cho P17-A frontend:** tích hợp baseline + chạy lại toàn bộ
  test; `REAL_API_E2E_RECEIPT` S08 trên lane preview RF-02 khi replay được bật ở
  đó; ba `CG-P17-*` được trả lời hoặc ghi là vắng thật; quyết định của Bobby ở trên.
- **Rollback/handoff:** revert từng commit theo
  [rollback](./research_loop/evidence/P17/thanhvuong-rollback.md); route backend
  vẫn `FEATURE_RESEARCH_REPLAY=false`. Handoff cho P18 (S09): S08 không publish
  fact nào mới; Report đọc từ contract của nó, không từ S08.

<a id="rl-p13-p17-audit"></a>
### P13–P17 cross-review checkpoint — Astra, trước P18

**2026-09-22 / `AUDIT_COMPLETE · REMEDIATION_PROPOSED · AWAITING_BOBBY_APPROVAL`.**
Bobby requested independent review before Terra continues. Audit baseline is
`742b1e9d` on shared `docs/research-loop-plan`, five backend phase commits from
`bd1d70c5`. Claude's unfinished P12 work is preserved. This checkpoint changes
documentation/status only; no code/runtime/feature/deployment change occurred.

**Detailed findings, source proof, exact to-do/tests/rollback and prompts:**
[P13–P17 Astra audit and remediation guide](./research_loop/P13_P17_ASTRA_AUDIT_AND_REMEDIATION_PLAN.md).
Keep this Unified Plan as the only live board; the linked document is its
detailed implementation/audit appendix, not a second phase tracker.

**Verdict:** do not enter P18 yet. Twelve finding groups include reproducible
monthly/histogram errors, receipt overflow, invalid split windows, incomplete
revision binding, mixed-revision Replay and ETag/cursor defects. Terminal
retry/fanout and acquire-deadline issues also need failure proof. Most
importantly, the fixed P04 smoke path has been mistaken for engine capability
limits: an existing real QuantBT 1.1.1 WFO artifact test passed locally.
Missing Portal adapters/retention/read models must not become permanent
`SOURCE_GAP` panels. Preserve genuine route/authority absences.

<a id="rl-rs-01"></a>
#### RS-01 — Correctness, immutable consistency và bounded recovery

- **Goal/owner:** Terra backend after Bobby approval; fix A01–A08 plus scoped
  historical-binding/reason corrections. Claude can finish P12/composition.
- **To-do:** independent financial/window oracles, end-to-end byte budget,
  complete immutable revision identity, coherent reads, ETag/cursor renewal,
  terminal materialisation/retry/fanout, bounded acquire/cancellation.
- **Tests:** precise reproductions in audit §3; targeted Python/TS/contracts;
  disposable PG fault/restart/membership/immutable checks; bounded read-cost.
- **Exit:** regressions fixed with new evidence, generated contract/inventory
  consistent, immutable old runs readable; no full P13–P17 completion claim.
- **Guide/rollback:** audit §5 RS-01; append versions, retain history; no runtime
  activation or global Execution pool-policy changes. **Status: BACKEND_REMEDIATED ·
  FEATURE_DARK · CLAUDE_CONSUMER_REVIEW_PENDING.**

**RS-01 delivery amendment — 2026-09-22.** A01–A08 are repaired only inside
the Research-owned Python receipt / Control-API / generated-contract boundary:
monthly returns now use prior-month close and UTC calendar periods; exact
decimal ratios and histogram closure are explicit; every R2 retained series
contributes an immutable source/transform/metric-registry/series-digest
identity; one repeatable-read bundle serves Hub/series/replay; replay is
`private, no-store` and never 304s a cursor-bearing response; cursor expiry is
typed `409 RESEARCH_REPLAY_CURSOR_EXPIRED` with safe `at_ordinal` recovery;
terminal sidecars must checkpoint before completion/fanout and an exact
redelivery re-fanouts without rerunning QuantBT; and a scoped 2-active/8-queued
Research read admission has 750 ms wait/acquire ceilings, cancellation and late
client release. R1 receipts/metric labels remain readable unchanged.

Evidence is retained in [RS-01 report](./research_loop/evidence/RS-01/phase-report.md),
[test results](./research_loop/evidence/RS-01/test-results.json) and
[Claude handoff](./research_loop/evidence/RS-01/frontend-handoff-claude.md).
The fresh disposable PostgreSQL proof, synthetic numerical proofs and focused
contract suites pass. This is **not** P13–P17/RS-02/RS-03 acceptance and does
not authorize runtime activation, source expansion, a global pool change,
deployment or a browser-complete claim.

<a id="rl-rs-02"></a>
#### RS-02 — Complete current-source adapters, retained data và screen read models

- **Goal/owner:** Terra backend after RS-01 and Bobby approval; Claude rich UI
  composition in parallel. Close A09–A11 and remaining field/action coverage.
- **To-do:** exact source→retention→DTO→panel matrix; bounded public QuantBT
  tune/WFO/route admission; reuse P05 disk-first/Rust reader, TS authority,
  Python compute adapter only; complete P13 metrics, P14 folds/data-use, P15
  full ledger, P16 artifact verifier/diagnostics, P17 actual retained replay.
- **Tests:** actual Delta/public-source integration and supplementary valid
  route profiles; full totals/numerical/selection/seek/expected-byte invariants;
  scoped budgets/auth/history. No engine-on-GET, fake ledger or new holdout gate.
- **Exit:** required source-supported fields/actions implemented, published and
  tested; no Portal implementation gap relabelled missing engine capability.
- **Guide/rollback:** audit §5 RS-02 including 2A/2B/2C; versioned/additive
  admission/artifacts/readers, preserve fixed-run v1. **Status:
  BACKEND_COMPLETE · FEATURE_DARK · DISPOSABLE_DB_GATE_PASS ·
  CLAUDE_RS03_INTEGRATION_PENDING.**

**RS-02 delivery amendment — 2026-09-22.** The additive
`research.current-source.v1` lane now admits only the installed public
QuantBT Advanced-WFO profile `rs02.quantbt-advanced-wfo.v1` /
`rs02.delta-wfo-global.v1`; it rejects legacy/fixed/wrong-mode/wrong-schedule
requests rather than falling back. Its confined Python producer reads the
P05-sealed Advanced-WFO artifact once, emits bounded relation batches
(`OBSERVATION`, `FOLD`, `TRIAL`, `CANDIDATE`, `SELECTION`) and retains them in
append-only PostgreSQL under one shared custody lock. A seal verifies dense
per-relation ordinals, contiguous batch receipts, exact table counts and a
canonical retained-import digest before any named reader can see it. The
existing P05 Rust reader remains independently conformance-tested; RS-02 does
not invent a second Rust network service or move compute/query authority out
of the bounded Python producer / TypeScript BFF boundary.

Six generated named same-origin read operations now cover S04–S08: evidence,
one series, split, full retained search ledger, local freeze verification and
retrospective replay. They preserve exact decimals, UTC milliseconds,
availability/freshness/revision metadata, 200-row/1-MiB bounds and opaque
relation-bound cursors. The browser cannot supply a raw ordinal, table name,
artifact path, source cursor or source query. Source-supported facts are
direct or seal-time derived; actual missing facts remain panel-level typed
states (for example raw source artifact bytes, WFO methodology conventions,
objective/pruning/importance and orders/fills/candles). All GETs are local
retained reads—no engine, QuantBT artifact, direct database, source, broker,
CLI or Execution request runs on behalf of a viewer.

Focused Python, Control-API, OpenAPI/generation, Rust-reader, ownership-ledger
and isolated PostgreSQL gates pass. The PostgreSQL gate used only an exact
tmpfs container name and its `EXIT` trap removed it; a post-run exact-name
query was empty. It is not a license to activate the feature: RS-03 and a
separate scoped runtime decision remain required. See
[RS-02 evidence](./research_loop/evidence/RS-02/README.md), per-screen
[coverage matrix](./research_loop/evidence/RS-02/field-action-coverage-matrix.md)
and the [Claude handoff](./research_loop/evidence/RS-02/frontend-handoff-claude.md).

<a id="rl-rs-03"></a>
#### RS-03 — Rich consumer integration, independent acceptance và P18 entry

- **Goal/owner:** Claude FE-first + Terra backend verification after named
  contracts are ready and Bobby approves this slice; no serialized UI wait.
- **To-do:** close S04–S08 per-field/action matrix; use generated facts and
  shared cursor correctly; retain HiFi layout, correct S05 handoff; browser
  compare at 1280/660 and real API cross-screen journeys; exact dev build.
- **Tests:** all 68 original P13–P17 gate IDs + 15 V11 DR/BR/GX IDs and every
  applicable screen-spec test; distinguish synthetic/source/DB/API/pixel lanes.
  Reuse sealed results, do not recompute every test or re-record global baselines.
- **Exit:** A01–A12 closed by evidence/explicit genuine authority decision;
  original phase rows/journals agree, Claude receipts reviewed, Bobby review
  before P18. Main/stable/production release remains separate authority.
- **Backend independent-acceptance amendment (2026-09-22):** one fresh,
  disposable PostgreSQL cell now proves the actual authenticated Control-API
  path from a session/workspace scope through the immutable local seal to all
  six named S04–S08 reads. It asserts 401/hidden foreign workspace, 304 only
  for immutable representations, private/no-store for renewable cursor pages,
  opaque relation-bound playheads, 200-row input rejection, exact schema
  parsing, UTC/exact strings, under-1-MiB documents and no arbitrary retained
  JSON escape. It creates no runtime feature, browser consumer, source call,
  engine run or deployment. Detailed evidence is
  [RS-03](./research_loop/evidence/RS-03/README.md).
- **Guide/rollback:** audit §5 RS-03; rollback reader/UI contract version,
  never delete evidence. **Status: BACKEND_INDEPENDENT_ACCEPTANCE_COMPLETE ·
  FEATURE_DARK · CLAUDE_RS03_INTEGRATION_PENDING.**

**Execution rule for this checkpoint:** no new P25–P27 campaign; these are
repair slices within P13–P17. Do not convert scope-reduction amendments into
original phase PASS. Actor/source/route gaps must be precise and proven;
installed-capability evidence does not itself authorize new runtime admission.
Terra/Claude prompts and audit command/results are in the appendix §§6–7.

<a id="rl-p18"></a>
### P18 — Report, print và reproducible export

**Đọc chi tiết:** [Guide P18](./research_loop/RESEARCH_LOOP_GUIDE_V1_1_24_PHASES_vi.md#phase-p18); [spec S09](./research_loop/release-v1.1/docs/screens/09_run_report.md) + [HTML 09](<./research_loop/release-v1.1/QuantBT 09 Run Report.dc.html>).
**Entry:** dependencies/assignment tại [board](#rl-board) đã đạt; [G0–G7](#rl-test-gates) áp dụng.
**Test IDs bắt buộc:** `P18-T01…T12`, `V11-P18-DR/BR/GX` và source tests applicable theo §13.3.

- **Goal:** Report giữ cùng evidence với Hub/Freeze/Replay, dùng được khi worker không chạy.
- **To-do BE:** Sealed report assembly/manifest; async bounded export/digest/download auth; no engine rerun, mutable approval annotations separate from frozen core; sanitize CSV/name inputs.
- **To-do FE/consumer:** Full09 shell-free/print page breaks/provenance/detail links/export pending/error; replace missing doc-page harness dependency via reviewed Research implementation, not blank baseline.
- **Tests BE:** Raw→Report/Hub parity; export restart/abort/diskfull/slowclient; path/CSV injection; authorization on every part; old-engine report; no recomputation after re-export.
- **Tests FE/browser:** All S09 tests; print/screen fonts/charts render real, no undefined custom-element hidden body; formatting/units/warnings/page breaks; no report θ change after trial inspect.
- **Exit gate:** Readable verified report+download complete and bounded; print fields/digests match original revision, actual browser not file-exists test.
- **Rollback/handoff:** Rollback presentation/export transformer, retain archived report bytes. Checkpoint09: P17/P18 + replay/print/export exact evidence.
- **Backend delivery (2026-09-22):** `research.report-frozen-core.v1` now seals one validated immutable Portal report from already-persisted P13–P17 current-source projections only. It stores exact source revisions/digests, UTC milliseconds and decimal strings; it never starts QuantBT, reads a worker/source/artifact filesystem or exposes source/lease/cursor authority. Current P04 identifying digests remain provenance only: because no artifact bytes are published, all physical artifact slots are explicitly `NOT_PUBLISHED`, never falsely marked `SEALED`.
- **Bounded export delivery:** `research.report-export.v1` publishes exactly JSON/CSV via one caller/revision/format-deduplicated PostgreSQL job, 512 KiB maximum, a finite 1–16-claim worker lease and server-only filenames. CSV formula and path injection are neutralized; `PARQUET`/`ARCHIVE` remain typed unavailable rather than triggering a fallback read. Approval annotation is stored separately and cannot rewrite the frozen core.
- **Evidence and handoff:** focused service/controller/config units, generated contract guard and fresh disposable PostgreSQL migration/immutability/size proof pass. The precise packet is [P18 evidence](./research_loop/evidence/P18/README.md); Claude must consume [the P18 handoff](./research_loop/evidence/P18/frontend-handoff-claude.md) for rich S09/browser/print acceptance. Feature remains dark; no deployment, runtime worker or product-route receipt is claimed.

#### P18 Thanhvuong frontend implementation note — Screen 09 (2026-09-23)

**Trạng thái:** `P18_A_S09_FRONTEND_COMPOSED · PRODUCT_ROUTE_BROWSER_RECEIPT · NOT_VERIFIED`.
Nhánh `feat/thanhvuong/research-p17-p21`, base `19310912`, code head `548e8d29`,
13 file frontend (+3004/−14; riêng `548e8d29` +590/−246). Không có thay đổi contract/backend/runtime; backend
P18 vẫn `FEATURE_DARK`. Checkpoint Astra "do not enter P18 yet" và board
`S09_BROWSER_PRINT_PENDING_CLAUDE` được xử lý như P17: frontend consumer trên
contract đã publish, không claim `VERIFIED`, Bobby quyết.

**Đọc chi tiết (packet):** [receipt](./research_loop/evidence/P18/thanhvuong-frontend-receipt.md)
(bảng đã đọc file@commit, Guide `P18-T01…T12` FE cover/PENDING, mapping hi-fi →
component → field → state → assertion, so hi-fi §4, discrepancy §4.1/§7, scale
refine §8) ·
[backend requests](./research_loop/evidence/P18/thanhvuong-backend-requests.md) ·
[test results](./research_loop/evidence/P18/thanhvuong-test-results.json) ·
[debt register](./research_loop/evidence/P18/thanhvuong-debt-register.json) ·
[rollback](./research_loop/evidence/P18/thanhvuong-rollback.md).

- **Đã giao:** route `/research/quantbt/runs/:runId/report` với 4 operation
  generated (`researchReportDetailGetV1` + ETag/304; export create kèm CSRF,
  status poll 2000 ms chỉ khi QUEUED/RUNNING và dừng khi terminal/unmount/tab
  ẩn, 409 giữ job; download chỉ qua `download_href` khi READY). Sheet in được:
  16 khối theo hi-fi, số in nguyên chuỗi `ExactDecimal`, digest/revision đầy đủ,
  equity SVG tĩnh với caption `emitted N of M · sampling`, stage không bao giờ
  in PASS, ô hi-fi không có field giữ chỗ với reason code. Warnings in trong
  sheet; approval annotation và exports chỉ trên màn hình. Print CSS scoped
  (`@page 0.55in`, thead lặp, `break-inside: avoid`), không `doc-page.js`, 0 CSS
  global. Hub "generate report → 09" và S08 "next: Run Report" thành link;
  Screen 11 vẫn refused.
- **Evidence:** tsc/build PASS; unit 170 file · 3010 pass · 1 skip (S09 39/39,
  `29c28f4a`);
  browser toàn Research 128/128 trên `93a435bb`, probe S09 chạy lại 46/46 trên
  `aea76f69` (clip `[]` ở screen/print/Letter/A4, cert box đúng chỗ); preview
  riêng 4417, API stub theo shape `report.service.ts`, 1280/660, print
  emulation 0 request, PDF Letter/A4. Audit độc lập 2026-09-23 chạy lại toàn
  bộ probe Research trên head `47165016`: **128/128**; sau khi sửa lỗi audit,
  toàn bộ probe Research trên `29c28f4a`: **129/129** (`scrollHeight` 1280
  6 049 → 3 307, PDF Letter 7 → 5 trang, A4 6 → 5, 1 `h1`, không chữ nào bị bẻ
  trong ô bảng); sau vòng geometry hi-fi (`548e8d29`): **131/131** (thêm probe
  `hifi-geometry`), unit 3015 pass · 1 skip (S09 44/44), PDF Letter 5 → 4 trang,
  A4 5 → 3. Chưa có
  `REAL_API_E2E_RECEIPT` (`FEATURE_RESEARCH_REPORTS=false`), axe.
- **Lỗi audit đã sửa ở `29c28f4a` (`open_debt` rỗng):** bảng `sr-only` điểm equity
  cao 4 818 px (thêm ~2 800 px cuộn trống và 2 trang trắng cuối PDF Letter) nay
  nằm trong wrapper clip `.rr-sr`, ẩn khi in; `.rr-table td` hết `break-all`
  (`word-break: normal; overflow-wrap: break-word`), chỉ `.rr-long` còn bẻ; title
  report là `h2` (một `h1`); verdict rule đọc từ `provenance.verdict_rule_revision`.
- **Lỗi tìm ra và đã sửa trong phase:** giá trị sealed bị cắt ở provenance line
  (`aea76f69`); cert box rớt dòng ở 1280 (`aea76f69`); PDF không lề (`aea76f69`);
  annotation mutable lọt vào bản in (`93a435bb`); nhãn "archive" (`aea76f69`).
- **Backend request (@codex), kiểm lại 2026-09-23 trên `e39bacfa` (và
  `6a87f77b`), đều OPEN:** `CG-P18-01` passport key/label; `02` certification
  grade; `03` strategy cho title; `04` cột per-fold; `05` kết quả từng stage;
  `06` IS equity series; `07` artifact filename/bytes; `08` caption params
  handoff; `09` fixture canonical P18; `10` 409 trên GET report chưa khai trong
  OpenAPI; `11` identity theo spec §16.3 + binding scratch (thêm ở audit,
  kiểm lại trên baseline `361f68b4`).
- **Bobby quyết:** tích hợp baseline `e39bacfa…6a87f77b` (file P18 chung với
  baseline chỉ `EvidenceFlow.tsx`, merge-file 0 xung đột; xung đột
  `FreezeDetail.tsx` của P17 còn; S09 → `toResearchRefusal`); tiêu đề S09 + badge
  certification (`VISUAL_DECISION_REQUIRED`); axe; PDF làm PR artifact; flake
  `PortalShell.test.tsx`; 401 → session-expired (U07).
- **Exit gate còn lại cho P18-A frontend:** tích hợp baseline
  (`361f68b4`, `QuantBTModule.tsx` merge-file 0 xung đột) + chạy lại toàn bộ unit
  và 131 probe; `REAL_API_E2E_RECEIPT` S09 (export đọc nội dung thật, Guide
  T01/T09/T12) khi cờ report bật trên lane preview RF-02; spec T03/T04/T05/T06/T08;
  `CG-P18-*` được trả lời hoặc ghi là vắng thật; quyết định của Bobby ở trên.
- **Rollback/handoff:** revert từng commit theo
  [rollback](./research_loop/evidence/P18/thanhvuong-rollback.md); backend vẫn
  `FEATURE_RESEARCH_REPORTS=false`. Handoff cho P19 (S10): S09 không publish fact
  nào mới; lineage đọc từ contract của nó, không từ S09.

<a id="rl-p19"></a>
### P19 — Attempt lineage, semantic diffs và exposure

**Đọc chi tiết:** [Guide P19](./research_loop/RESEARCH_LOOP_GUIDE_V1_1_24_PHASES_vi.md#phase-p19); [spec S10](./research_loop/release-v1.1/docs/screens/10_attempt_lineage.md) + [HTML 10](<./research_loop/release-v1.1/QuantBT 10 Attempt Lineage.dc.html>).
**Entry:** dependencies/assignment tại [board](#rl-board) đã đạt; [G0–G7](#rl-test-gates) áp dụng.
**Test IDs bắt buộc:** `P19-T01…T13`, `V11-P19-DR/BR/GX` và source tests applicable theo §13.3.

- **Goal:** Lịch sử nghiên cứu đúng ý định, không đếm infra retries hoặc chọn promotion bằng Sharpe.
- **To-do BE:** Parent graph/scoped IDs/CAS, effective spec/version/intent diff; failed/abandoned/draft/child refs; exposure facts persisted; promotion_pick from DR03 verified source only.
- **To-do FE/consumer:** Full10 tree/table/cards/diff drawer/notes/fork navigation; virtual graph, active/version/superseded distinctions; gates-reset disclosure not execution command.
- **Tests BE:** Cycles/cross-workspace/races; autosave/retry vs material seed/data/code change; counters; audit/repro children; restore/GC preserve exposure; no best/newest promotion heuristic.
- **Tests FE/browser:** All S10 tests; stable expand/focus/back-forward; counts reconcile Library definitions; missing-source pick labelled, current-vs-historical version truthful; GATES RESET click no mutation.
- **Exit gate:** Full lineage relationships source-backed; DR03 resolved for mandatory field; no omitted failed history or inferred authority; chart/graph bounded.
- **Rollback/handoff:** Rollback derived graph reader not nodes/history. Handoff same-alpha comparison/provenance and publication links.
- **Backend delivery (2026-09-22):** `research.attempt-lineage.v1` now publishes one feature-dark, same-origin, session/workspace-scoped read of Portal-persisted Alpha versions, logical attempts, explicit child relationships, persisted exposure facts and a server-normalized allow-list semantic diff. It runs in a bounded repeatable-read transaction with finite admission; it never opens QuantBT, a worker/artifact/source store, Execution transport or a browser-controlled graph/relation/cursor input.
- **Integrity and boundedness:** Migration `1723680000053` adds only lookup indexes and immutable `research.attempt_promotion_pick_facts_v1`. A pick must bind the exact same-version attempt/run and Portal runtime has `SELECT`, not write, authority. Read-time validation rejects duplicate/cyclic/cross-Alpha graph corruption. Attempts are capped at 128 with explicit `P19_BOUNDED_GRAPH_LIMIT_REACHED`; child runs are independently capped at 32 per attempt with `P19_CHILD_RUNS_BOUNDED_PER_ATTEMPT`, never silently omitted.
- **Truthful current-source gaps:** An absent DR03/source pick remains `NOT_PUBLISHED` (`P19_SOURCE_DID_NOT_PUBLISH_PROMOTION_PICK`), not newest/ACTIVE/metric/Sharpe selection. Missing persisted P08/P10 manifests remain a typed semantic-diff absence, and no Clone/Reproduce/Upgrade action is fabricated while current P10 only supports `NEW`. These are source facts/UI consumer work, not a backend waiver.
- **Evidence/handoff:** focused service/controller/contract tests, disposable PostgreSQL migration/immutability/runtime-privilege/bound proof, production-source compile, generated contract/snapshot and capability ledger are recorded in [P19 evidence](./research_loop/evidence/P19/README.md). Claude must consume [the P19 handoff](./research_loop/evidence/P19/frontend-handoff-claude.md) and return the rich S10 browser/HiFi receipt before P19 is product-close; no UI/browser/deployment acceptance is claimed by this backend delivery.

#### P19 Thanhvuong frontend implementation note — Screen 10 (2026-09-24)

**Trạng thái:** `P19_A_S10_FRONTEND_COMPOSED · PRODUCT_ROUTE_BROWSER_RECEIPT · NOT_VERIFIED`.

- Nhánh `feat/thanhvuong/research-p17-p21`, base `f37b3b75`.
- Code: `3a11bfd3` client + hook · `0ec4b6af` màn hình, route, link · `30dcbdfc` unit `S10-U01…U42` · `74f26200` sửa B1 660 · `1fb29010` sửa audit A1–A3 (tree `6b7e0419`, 3 file +163/−16) · `c9dd195e` khớp hi-fi 7 điểm (R1, tree `46d101c0`, 2 file +811/−613 và +292/−41) · `9c4afb18` thứ tự band và bước rail theo hi-fi (R3, tree `9f3f917f`, 2 file +4/−7 và +3/−3).
- 10 file frontend, +2806/−1 (riêng `74f26200` +2/−2).
- Không đổi contract, backend hay runtime. Backend P19 vẫn `FEATURE_DARK` (`CONTROL_API_FEATURE_RESEARCH_LINEAGE=false`).
- Checkpoint Astra "do not enter P18 yet" chưa gỡ, còn board ghi `S10_BROWSER_HIFI_PENDING_CLAUDE`. Xử lý như P17/P18: làm frontend consumer trên contract đã publish, không claim `VERIFIED`; Bobby quyết.

**Đọc chi tiết (packet):**
- [receipt](./research_loop/evidence/P19/thanhvuong-frontend-receipt.md): bảng đã đọc file@commit (nhánh, `9060a7c4`, `62d7d864`); Guide `P19-T01…T13` phần FE cover được; route/link; mapping hi-fi → component → field → state → assertion; spec T01–T12; so hi-fi §5.4; discrepancy §7; Reuse report §11.
- [backend requests](./research_loop/evidence/P19/thanhvuong-backend-requests.md)
- [test results](./research_loop/evidence/P19/thanhvuong-test-results.json)
- [debt register](./research_loop/evidence/P19/thanhvuong-debt-register.json)
- [rollback](./research_loop/evidence/P19/thanhvuong-rollback.md)

- **Đã giao** (mô tả bản trước R1; R1 `c9dd195e` đổi filter, band, chip, rail, copy, toggle theo ledger `VD-P19-01…07` bên dưới):
  - Route `/research/quantbt/alphas/:alphaId/lineage` (đặt trước `alphas/:alphaId/:version`), deep link `?av=` / `?attempt=`.
  - Một operation generated `researchAttemptLineageGetV1`: 1 GET, `limit` 128, không poll. Không có ETag vì contract không khai.
  - Layout 2 cột theo hi-fi (571/381 px ở 1280, hi-fi 581/387), xếp 1 cột ở 660. 9 `data-panel`, giữ đủ cả khi loading và refusal (từ `1fb29010`): header · root card với 1 band mỗi version, chip cuộn trong band, promotion pick PUBLISHED/NOT_PUBLISHED · filter + counter "showing n of m attempts · total" · cây DFS theo `parent_attempt_id` (ảo hoá khi > 40 node) · selected · diff · promotion rule · rules · counts.
  - Diff chip in nguyên từ `semantic_diff.changes`. GATES RESET là span trơ: 0 request, 0 state.
  - ABANDONED/FAILED giữ lại kèm reason.
  - `technical_retry_count` không cộng vào attempt.
  - Child runs theo `relationship_kind`; bounded coverage được disclosure.
  - Exposure NOT_PUBLISHED không in 0.
  - Ô hi-fi không có field ghi "not a field of the lineage contract".
  - Link vào từ Run Library (nhóm alpha) và Alpha Import (S14); link ra evidence/report/New Run/Alpha Import; Screen 11 vẫn refused.
- **Audit độc lập (2026-09-24) và A-fix:**
  - A1 MAJOR: reset `.ln-page button { font: inherit }` thắng class chip → chip/filter/toggle/retry 12px Inter. **Sửa ở `1fb29010`** bằng `:where(.ln-page) button`; probe computed 1280/660: chip 8.5px, filter/toggle 9.5px, retry 10.5px, đều `var(--font-mono)`.
  - A2: loading/refusal chỉ còn header · notice · rules. **Sửa ở `1fb29010`**: đủ 10 `data-panel` (9 khối + notice) ở loading và 400/401/403/404/503, mỗi khối loading/withheld, 0 chữ số.
  - A3: badge 403 ≠ 404. **Sửa ở `1fb29010`**: 404 → `denied`, cùng badge "⊘ DENIED" và câu F-04 với 403. S09 vẫn 404 → `empty` (Bobby quyết).
  - A4–A6 (docs): sửa trích dẫn subtitle hi-fi ("Immutable nodes · every config change is a sibling attempt with its own hash."), rules verbatim theo spec §2.5 (hi-fi khác), thêm bảng copy hi-fi ≠ spec; sửa Reuse report (`AbsentPanel` private trong `ExecuteDetail.tsx`, `Absent` cục bộ hợp lý); "counts reconcile Library definitions" ghi `NOT_RUN` + `CG-P19-13`.
  - Tree `6b7e0419`: tsc PASS, build PASS; vitest 171 file · 3058 pass · 1 skip; S10 43/43; probe Research **134/134** ở lượt chính thức (lượt đầu 133/134: 1 assert probe phụ thuộc cỡ chip cũ, sửa probe). Flake probe `fix-hypothesis` (audit) ghi `known_flake`.
- **Vòng khớp hi-fi (R1 `c9dd195e`, receipt R2 2026-09-24):**
  - Bobby 2026-09-24: "version này chốt theo đúng khớp với HIFI; nếu có gì không hợp lý thì mở version mới để làm gọn đúng scope; 6–7 visual decision phải ghi vào Unified plan; khi làm P20 sẽ đẻ thêm debt mới nên ghi vào handoff lẫn Unified cho các phase sau."
  - Tree `46d101c0`: tsc 0, build 0; vitest 171 file · 3067 pass · 1 skip; S10 52/52 (kèm boundary 66/66); probe Research **119/119** lượt đầu (`--workers=1`: fixtures 8, product 74, r2 37).
  - Copy title, subtitle, source chip, promotion rule, rules: probe so chuỗi hi-fi ↔ product, trùng khớp. 4 filter đúng nhãn, 16 tổ hợp: counter = số row = `aria-pressed`.
  - 1280 hai cột 571/381 (hi-fi 581/387); 660 một cột, overflow 0; chip wrap (overflow 0, 2/7 dòng); 16 rail; card đóng khi tải, click mở/đóng; toggle probes disabled `CG-P19-03`; 403 và 404 cùng một bộ (denied).
  - Không có bug làm fail assertion. Lệch còn lại phân loại ở [receipt §13](./research_loop/evidence/P19/thanhvuong-frontend-receipt.md#13-vòng-khớp-hi-fi-r1-c9dd195e-và-receipt-r2).
- **R3 — đóng 2 ngoại lệ cuối theo hi-fi (`9c4afb18`, tree `9f3f917f`, 2026-09-24):**
  - Bobby chốt: hai ngoại lệ `VD-P19-02` và `VD-P19-04` theo hi-fi. `bandOrder` trả nguyên thứ tự server (hi-fi vẽ SUPERSEDED trên ACTIVE), `RAIL_STEP` 22 → 26. **Discrepancy ghi rõ:** spec T01 (ACTIVE-first) và spec §9.2 (22px) khác hi-fi; hi-fi thắng theo Bobby 2026-09-24.
  - Gate: S10 52/52, tsc 0, build 0, vitest toàn bộ 3067 pass · 1 skip. Unit U04/U46/railWidth đổi theo.
  - Browser (preview riêng 4417, API stub): band `[SUPERSEDED, ACTIVE]` = thứ tự server ở 1280/660, sáng và tối; rail depth 1 = 60px (34 + 26), 16 rail, 0 sai; overflow 0, console 0, mutation 0 ở cả 30 receipt. Probe Research toàn bộ `--workers=1` **119/119** (fixtures 8 + product 74 + r3 37). Lượt đầu 117/119: 2 fail `gates-no-request` do probe đếm cả poll legacy `/api/runs` 4 s (B5), không do S10; sửa harness, không sửa src. Chi tiết ở [receipt §13.6](./research_loop/evidence/P19/thanhvuong-frontend-receipt.md#136-r3-9c4afb18--đóng-vd-p19-02-và-vd-p19-04-theo-hi-fi).

**Visual decision ledger (Bobby 2026-09-24: build phải khớp hi-fi; lệch → mở version mới)**

| id | điểm | bản trước (tự chọn) | bản nay (hi-fi) | cách map contract | còn treo gì |
|---|---|---|---|---|---|
| `VD-P19-01` | Filter | 6 nhóm state thô của contract (draft / in-flight / ready / failed / abandoned / cancelled), counter "· {total} total" | 4 chip `active · draft · superseded · abandoned`, bật/tắt độc lập, tắt hết = hiện hết, counter "showing n of m attempts" (+ "· {total} on record" chỉ khi bounded) | `lineageStatus`: attempt ABANDONED → ABANDONED; DRAFT/PREFLIGHT_VALID → DRAFT; version ACTIVE → ACTIVE; version SUPERSEDED/ABANDONED → SUPERSEDED; version DRAFT → DRAFT; version không trả → `null`. Chỉ chia nhóm, không so metric | Mọi attempt của version ACTIVE đều mang ACTIVE (`CG-P19-14`); chip state thô (READY/FAILED…) vẫn hiện cạnh status khi khác |
| `VD-P19-02` | Thứ tự band | Theo server (`registered_at ASC`); R1 `c9dd195e` đổi thành ACTIVE trước (spec T01) | **Theo server, như hi-fi (SUPERSEDED trên ACTIVE)** — `9c4afb18` | `bandOrder`: trả nguyên mảng server, không tách, không `.sort` | **Đã khớp hi-fi ở `9c4afb18`** (Bobby 2026-09-24). Discrepancy: spec T01 ghi ACTIVE-first ≠ hi-fi; hi-fi thắng |
| `VD-P19-03` | Attempt chip | Cuộn ngang trong band, mono 8.5px, radius 3 | Wrap (`flex-wrap`), mono 9.5px, radius 999, band là hàng trong root card | `attempts[]` nhóm theo `alpha_version_id`, thứ tự server | ID dài (ULID) wrap nhiều dòng hơn id ngắn của hi-fi (`att_01`); id ngắn là field-driven |
| `VD-P19-04` | Rail cha–con | Thụt DFS, không chấm | Rail + chấm 11px theo status, connector `::before` −13px / 12px, **bước 26px như hi-fi** (R1 22px, `9c4afb18` → 26) | `parent_attempt_id` / `parent_state`, độ sâu cap 8; rộng 34 + min(depth, 8) × 26 | **Đã khớp hi-fi ở `9c4afb18`** (Bobby 2026-09-24). Discrepancy: spec §9.2 ghi 22px ≠ hi-fi 26px; hi-fi thắng |
| `VD-P19-05` | Promotion rule | Câu viết lại theo contract (D12) | Câu hi-fi nguyên văn; pick là hàng cuối root card; NOT_PUBLISHED giữ banner + reason | Pick chỉ từ `versions[].promotion_pick`, không suy từ best/newest/ACTIVE | Câu "Only the ACTIVE attempt promotes" trong khi 3 attempt cùng hiện ACTIVE → cần status promotion cấp attempt (`CG-P19-14`) |
| `VD-P19-06` | Copy + rules footer | Title/subtitle/rules/pick theo spec 10 §2.5; counts nằm cuối | Title, subtitle, source chip, rules nguyên văn hi-fi; rules là panel cuối (… promotion-rule · counts · rules) | Copy tĩnh; `read_authority` thật (PORTAL_PERSISTED_RESEARCH) ở title và heading counts | Source chip ghi "attempts.json" (hi-fi) khác `read_authority`; panel counts không có trong hi-fi (disclosure theo handoff) |
| `VD-P19-07` | Toggle probes + card | Expand-all; card mở sẵn khi ≤ 40 attempt | Toggle "show probe attempts" đúng chỗ hi-fi, nét đứt, `disabled` + `data-reason-code` `CG-P19-03`; mỗi band có chip `+ probes` disabled; không số; card đóng khi tải, click mở | Không field: contract không phân loại storied/probe | Số probe ("+24 probes", "show 46 probe attempts") và kiểu row storied/probe chờ `CG-P19-03` |

**Rule cho các phase sau (P20+):**
- Mỗi màn phải khớp **cả hi-fi lẫn spec**. Khi hai nguồn lệch nhau, hi-fi thắng (Bobby 2026-09-24), trừ ngoại lệ đã có `VD` được Bobby duyệt.
- FE **không tự chọn** lệch. Mọi điểm lệch ghi `VD-PXX-NN` vào ledger trong note của phase đó (bảng như trên) **và** trong handoff; cần gọn scope thì mở version mới.
- Ô hi-fi không có field: giữ đúng vị trí và hình dạng hi-fi, hiện typed absence (lý do + reason code), kèm request `CG-PXX-NN` cho codex. Không in `0` / `-` / `N/A` thay số.
- Nợ mới phát sinh khi làm P20 (và các phase sau) ghi vào **cả** handoff của phase **lẫn** Unified (dòng §13 + note), không chỉ ở packet.

- **Evidence trước audit:**
  - Head `74f26200` (chạy lại 2026-09-24): tsc PASS, build PASS; vitest 171 file · 3057 pass · 1 skip, pass ngay lần đầu; S10 42/42 (kèm boundary 56/56).
  - Browser vòng 1 trên `30dcbdfc`: toàn Research 107/117. 1280 và dark đạt mọi gate. 10 fail đều do B1 ở 660.
  - Browser vòng 2 trên `74f26200`: 119/119 (chỉ probe của implementer; lượt đầy đủ của audit 124/127). Overflow 0 ở 660 cho mọi state; chip cuộn trong band (sw 2523 > cw 462, `docScrollX` 0).
  - Virtual 120 attempt: DOM 23–30 node; chip sâu được chọn và cuộn tới, focus giữ.
  - Filter × counter khớp số row DOM. `?av=` giữ qua reload và back/forward. Keyboard Tab/Enter.
  - Refusal: 400 terminal / 401 denied / 403 denied / 404 empty (nay `denied`, A3) / 503 unavailable + retry, cùng câu F-04, `leak=false`.
  - Console S10 0, mutation 0.
  - Chạy trên preview riêng 4417 với API stub theo shape `lineage.service.ts`.
  - Chưa có: `REAL_API_E2E_RECEIPT`, axe.
- **Lỗi tìm ra và đã sửa trong phase** (B1, N1 ở `74f26200`; A1–A3 ở `1fb29010`). Sau R3 `open_debt` **không rỗng** (hai ngoại lệ spec-over-hi-fi đã đóng ở `9c4afb18`): câu promotion rule vs mapping ACTIVE, các lệch "khác" ở trên và trùng lặp cục bộ — xem [debt register](./research_loop/evidence/P19/thanhvuong-debt-register.json):
  - **B1:** cột trái giãn max-content ở ≤ 900 px, trang tràn 2 029 / 7 665 / 87 px. Sửa ở `74f26200` bằng `align-items: stretch`.
  - **N1:** root in "root — no parent" hai lần. Sửa ở `74f26200`.
  - `tokens.test.ts` bắt raw color; sửa trước commit.
- **Discrepancy còn lại sau R1 (chi tiết + bằng chứng ở receipt §13):**
  - **Field-driven** (contract thiếu field, giữ vị trí hi-fi + typed absence): số probe và row storied/probe (`03`); exercised/untried (`06`); outcome "best C · promote closed" (`07`); rc chip và dòng pick "→ rc_ (draft) · gate R1 next" (`04`); cert/OOS/claim/decay/verdict (`05`); spec line và note tường thuật của card (`08`); nhãn run `R-WFO-118` (product in `run_id`); symbol/timeframe trên breadcrumb; id ngắn `att_01` và hash alpha ngắn; note tường thuật của diff; counter hi-fi chỉ đếm attempt storied; status promotion cấp attempt (`14`).
  - **Spec ≠ hi-fi, hi-fi thắng:** copy, chip 9.5px radius 999, band là hàng, opacity .82 — đã áp ở R1. Thứ tự band theo server/SUPERSEDED trên ACTIVE (`VD-P19-02`, spec T01 ACTIVE-first) và bước rail 26px (`VD-P19-04`, spec §9.2 22px) — **đã về hi-fi ở `9c4afb18`** (Bobby 2026-09-24); không còn ngoại lệ giữ spec về layout. "import new version →" chỉ có ở spec, vẫn giữ.
  - **Khác:** "cert not published" thay "cert —" (rule cấm `-`); panel counts không có trong hi-fi; chip state thô cạnh status; chrome module QuantBT phía trên breadcrumb; dark và 660 (hi-fi không có); path diff dài bẻ giữa từ; "rc & publish →" chưa route; lưới dark 602/402 vs light 571/381 cùng viewport.
  - Vẫn giữ từ trước: không ETag; 404 → `denied` như 403 (S09 vẫn 404 → `empty`); "notes/fork navigation" partial theo P10 NEW-only; `> 128` chỉ trả 128 attempt **cũ nhất**; hi-fi không responsive ở 660.
- **Backend request (@codex), kiểm lại 2026-09-24 trên `9060a7c4` và `62d7d864`; OPEN trừ `11` WITHDRAWN:**
  - `CG-P19-01` fixture canonical (healthy/partial/empty/bounded)
  - `02` ETag/304
  - `03` storied/probe
  - `04` rc ref
  - `05` cert/OOS/decay
  - `06` exercised/untried
  - `07` outcome/why superseded
  - `08` spec line
  - `09` cursor/thứ tự > 128
  - `10` lộ trình promotion pick DR-03
  - `11` badge 403/404 — WITHDRAWN (frontend sửa ở `1fb29010`)
  - `12` telemetry §12
  - `13` bảng định nghĩa counts lineage ↔ Run Library (thêm sau audit A6)
  - `14` status promotion cấp attempt, để "the ACTIVE attempt" có nghĩa (thêm ở R2; `03`/`04`/`05` mở rộng theo R1: số probe mỗi version, rc và cert theo attempt/pick)
  - Kiểm lại lần cuối ở R2 trên baseline `bb25bf39`, head `c9dd195e`.
- **Bobby quyết:**
  - Tích hợp baseline `9060a7c4 → 62d7d864 → bb25bf39`. Không file S10 nào trùng. `62d7d864` thêm field required vào `research-alpha-import.d.ts`, ảnh hưởng AlphaImport. `bb25bf39` chỉ là docs (audit P11–P15, RF-05/RF-06; chèn 2 dòng Unified ngay trên bảng §13 và 24 dòng RF-05/06, gần nhưng không chạm dòng P19 và note này). Xung đột `FreezeDetail.tsx` của P17 vẫn còn.
  - ~~`VISUAL_DECISION_REQUIRED`~~ — Bobby đã quyết 2026-09-24: khớp hi-fi; ghi ở ledger `VD-P19-01…07`. Hai ngoại lệ cuối (`VD-P19-02` thứ tự band, `VD-P19-04` bước rail) Bobby chốt theo hi-fi; đã đóng ở `9c4afb18`.
  - Đồng bộ badge 404 của S09 với S10 (S10 đã sửa).
  - axe.
  - Poll legacy `/api/runs` 4 s.
  - Flake `PortalShell` / `tradeReplayEvents`.
- **Exit gate còn lại cho P19-A frontend:**
  - Tích hợp baseline (nay `bb25bf39`), rồi chạy lại toàn bộ unit và toàn bộ probe Research (119 trên tree `9f3f917f`, như tree `46d101c0`; 134 trên tree `6b7e0419` gồm cả probe audit).
  - `REAL_API_E2E_RECEIPT` S10 khi cờ lineage và run library bật trên một lane preview. Nhánh pick PUBLISHED cần `CG-P19-10` (exit gate DR-03).
  - axe (spec T12); telemetry §12; spec T01/T02/T07/T08 theo nghĩa hi-fi khi có field.
  - `CG-P19-*` được trả lời hoặc ghi là vắng thật (kể cả `13` cho test "counts reconcile Library definitions", đang `NOT_RUN`); quyết định của Bobby ở trên.
- **Rollback/handoff:**
  - Revert 7 commit code theo thứ tự ngược (`9c4afb18` trước, rồi `c9dd195e`), theo [rollback](./research_loop/evidence/P19/thanhvuong-rollback.md). Backend vẫn `FEATURE_RESEARCH_LINEAGE=false`.
  - Handoff cho P20 (compare): S10 không publish fact mới; so sánh same-alpha đọc từ contract của P20. Link "lineage →" có thể dùng làm lối vào.

<a id="rl-p20"></a>
### P20 — Compare modes và derived correlation

**Đọc chi tiết:** [Guide P20](./research_loop/RESEARCH_LOOP_GUIDE_V1_1_24_PHASES_vi.md#phase-p20); [spec S13](./research_loop/release-v1.1/docs/screens/13_compare.md) + [HTML 13](<./research_loop/release-v1.1/QuantBT 13 Compare.dc.html>).
**Entry:** dependencies/assignment tại [board](#rl-board) đã đạt; [G0–G7](#rl-test-gates) áp dụng.
**Test IDs bắt buộc:** `P20-T01…T12`, `V11-P20-DR/BR/GX` và source tests applicable theo §13.3.

- **Goal:** Compare trong một alpha, số liệu cùng convention/window hoặc disclosure rõ.
- **To-do BE:** Attempts/markets/pair unions; ComparisonContractKey server guard, pair<=2; raw aligned returns correlation with formula/version/n/missing policy; deterministic narrative; rank by claim before metric.
- **To-do FE/consumer:** Full13 attempt ladder, market small multiples, two-color pair overlay/delta table; refusal retains designed context but no hidden incompatible metrics; URL state.
- **Tests BE:** Cross-alpha/key guard/auth; common-window/zero-overlap/zero-variance/time alignment; no forward-fill fake returns; independent numeric correlation; no source selection mutation or pair approval.
- **Tests FE/browser:** All S13 tests; mismatch hides prohibited chart/table; rank not publish pick; distinct legend/tooltip/unit and responsive; switching comparisons doesn't mix stale runs.
- **Exit gate:** Required derived fields implemented when raw exists; no correlation0 placeholder; comparison state faithful and no new governance semantics.
- **Rollback/handoff:** Rollback transform/cache version, no rerun/evidence edit. Checkpoint10: P19/P20 + graph/correlation/interaction proof.
- **Backend delivery (2026-09-22):** `research.compare.v1` now publishes a feature-dark, same-origin `attempts | markets | pair` union. The server scopes every run to one authenticated workspace/Alpha, bounds attempts to 128, markets to 24, a pair to two opaque IDs and overlays to 192 points. Generated `PairResult` is discriminated: a key mismatch is `REFUSED` with `pair:null`; comparable states carry `pair` and never a refusal.
- **Numeric/source authority:** Pair math reads only exact sealed RS-02 observation revisions whose P08/P14/run digests agree. It calculates Pearson raw-return correlation in PostgreSQL over exact timestamp inner joins, labels it `PORTAL_DERIVED` with formula/version/n/missing policy, and separately returns common-window metrics. It never forward-fills, zero-fills, substitutes P13 sampled series for raw data, relabels original P13 metrics or promotes a run. Current P14 protocol supports only conservative `WALK_FORWARD_OOS_COMPATIBILITY`; stronger source claims stay typed absent.
- **Bounded operational layer:** Migration `1723680000054` adds only an indexed, 15-minute, workspace/binding-scoped compare cache (512 KiB response cap, 64-row per-workspace expired sweep). Runtime has `SELECT`/`INSERT`/`DELETE`, not `UPDATE`; cache rows are explicitly included in disposable test cleanup and are not evidence/approval/source truth.
- **Evidence/handoff:** focused service/controller/contract/config tests, fresh disposable PostgreSQL migration/correlation/cache proof, production-source compile, generated OpenAPI/snapshot/contracts suite and capability-ledger test pass. Details are in [P20 evidence](./research_loop/evidence/P20/README.md). Claude must consume [the P20 handoff](./research_loop/evidence/P20/frontend-handoff-claude.md) for rich S13/browser/HiFi acceptance. Real Delta runtime evidence, browser evidence and activation remain separate gates and are not claimed by this backend delivery.

<a id="p20-thanhvuong-frontend-implementation-note--screen-13-2026-09-24"></a>
#### P20 Thanhvuong frontend implementation note — Screen 13 (2026-09-24)

**Trạng thái:** `P20_A_S13_FRONTEND_COMPOSED · PRODUCT_ROUTE_BROWSER_RECEIPT · NOT_VERIFIED`.

- Nhánh `feat/thanhvuong/research-p17-p21`, base `295901b7` (docs P19 R3).
- Code: `92cdc844` client + hook (tree `4a3caffc`, +480) · `0910ecc3` màn hình, route, link (tree `b3241d95`, +1643/−2) · `f3d6169d` unit `S13-U01…U23` (tree `8252a329`, +669) · `009cedb8` ladder đọc weak → strong như hi-fi (tree `686ad2df`, +20/−13) · `034aef11` nhãn ngày mini chart + copy banner markets (tree `e2d7d388`, +11/−3) · `eeeae14f` sửa audit A1–A5, A8, A10 + unit `S13-U24…U26` (tree `58f27644`, +114/−21).
- 10 file frontend, +2900/−2 (`git diff --numstat 295901b7 eeeae14f`).
- Docs: `e731cfa6` + `7800e8e2` (trước audit), `e5cf9a7f` packet sau audit + commit chứa note này (sau audit).
- Không đổi contract, backend hay runtime. Backend P20 vẫn `FEATURE_DARK` (`CONTROL_API_FEATURE_RESEARCH_COMPARE=false`). Contract `researchCompareGetV1` 1.0.0 (OpenAPI SHA-256 `cd393d5664637adc`, d.ts `6d7b51a94e8adb53`, commit cuối `a4acd5e2`).
- Như P17–P19: frontend consumer trên contract đã publish, không claim `VERIFIED`; Bobby quyết.

**Đọc chi tiết (packet):**
- [receipt](./research_loop/evidence/P20/thanhvuong-frontend-receipt.md): bảng đã đọc file@commit; Guide `P20-T01…T12` phần FE; route/link §3; mapping hi-fi → component → field → state → assertion §4; spec T01–T11 §5.3; so hi-fi G1–G19 §5.4; ledger §6; discrepancy D1–D12 §7; Reuse report §11; audit độc lập A1–A10 + C1–C6 §12.
- [backend requests](./research_loop/evidence/P20/thanhvuong-backend-requests.md)
- [test results](./research_loop/evidence/P20/thanhvuong-test-results.json)
- [debt register](./research_loop/evidence/P20/thanhvuong-debt-register.json)
- [rollback](./research_loop/evidence/P20/thanhvuong-rollback.md)
- [handoff addendum](./research_loop/evidence/P20/frontend-handoff-claude.md#thanhvuong-addendum--nợ-mới-p20-cho-các-phase-sau-2026-09-24)

- **Đã giao:**
  - Route canonical `/research/quantbt/alphas/:alphaId/compare?mode=attempts|markets|pair&runs=a,b` (đặt trước `alphas/:alphaId/:version`). Route spec `/research/quantbt/compare?alpha=&runs=` là resolver: có `alpha=` → `Navigate` sang canonical; chỉ có `runs=` → trang designed + `RESOLVER_NEEDS_ALPHA`, 0 request.
  - Một operation generated `researchCompareGetV1`: 1 GET mỗi lần đổi mode/cặp, ETag/`If-None-Match` → 304, không poll, response cũ bị bỏ khi đổi cặp (không trộn run).
  - Ba mode theo hi-fi: attempts (ladder claim, trajectory `trajectory.text`), markets (small multiples chỉ từ card server, caption no-overlay), pair (overlay 2 màu từ điểm đã giữ, bảng delta A/B/Δ, correlation card). `PairResult` REFUSED → `pair:null`: không có chart/bảng ẩn trong DOM, chip key 4 phần tô đỏ phần lệch chỉ để hiển thị.
  - Correlation `PORTAL_DERIVED` in formula · version · n · window · missing policy; `NOT_PUBLISHED` in reason code, không `0`/`NaN`.
  - Refusal HTTP 400 terminal / 401 denied / 403 = 404 denied (như S10 sau A3) / 503 unavailable + retry, giữ layout designed.
  - Link vào: Run Library CompareBar (`compareEntryHref`, thêm `alpha=` khi 2 run cùng `binding.alpha_id`) và S10 "compare →" (cạnh `.ln-links`). Link ra: Runs, lineage (S10), evidence (S04). Screen 11 chưa có route nên không vẽ link.
- **Mapping tóm tắt** (bản đầy đủ ở receipt §4): ladder ← `attempts[]` (thứ tự server, bày đảo ngược) + `claim.family/rank/origin`; market card ← `markets[]` + `caption`; overlay ← `pair.overlay` (≤ 192 điểm); delta Δ ← `pair.common_window.metrics`; A/B ← `original_metrics` (scope P13, không Δ); correlation ← `pair.correlation`; meta ← `read_authority · revision · as_of · coverage · source_absences`.
- **Evidence (receipt gói C-2 trên head `eeeae14f`, tree `58f27644`, Node v20.20.2, sau audit):**
  - tsc 0, build 0 (8.92s); vitest 172 file · 3094 pass · 1 skip, không flake `PortalShell`; S13 + boundary 41/41 (S13 27 = U01…U26, U15 each; boundary 14).
  - Probe Research toàn bộ `--workers=1` **162/162** (fixtures 8, product 74, tvp20 80), 4.4 phút; preview riêng 4417, API stub theo shape `compare.contract.ts` / `compare.service.ts`.
  - 76 RECEIPT = 23 gate theme sáng × 1280/660 + 15 gate theme tối (`data-theme=operations`) × 1280/660: overflow 0, console 0, mutation 0, request lạ 0, chữ số trần ngoài mono 0. Gate mới: hướng Δ `B − A · as published`, Δ 0 không tô, foot pair-partial không "matched", markets `[data-mini-meta]` chỉ ở card AVAILABLE, resolver `mode=foo` → 400.
  - Sửa audit C1: receipt gói C (head `034aef11`, 128/128, "42 RECEIPT") chỉ chạy theme sáng, dòng cũ ghi "(sáng/tối)" là sai; theme tối chỉ có evidence từ receipt C-2 (`~/tv-shots/p20/final2/`). Đếm "21 gate × 2" cũ cũng sai (bảng 19 hàng, 46 test).
  - Log SHA-256 (ngoài repo, `~/tv-shots/p20/final2/`): vitest `efddb2da599ef1e1`, S13 `38bbc27ad19da8d6`, playwright `fe151f443fd274a5`, probe `35e3038508ed11ad`.
  - Chưa có: `REAL_API_E2E_RECEIPT`, `V11-P20-DR`, axe, telemetry.

**Visual decision ledger `VD-P20-01…29`** (Bobby 2026-09-24: build khớp hi-fi; lệch → ghi VD, mở version mới khi cần. CLAUDE.md §3.3 hiển thị trung thực đứng trên hi-fi: copy hi-fi mâu thuẫn contract thì render đúng contract và ghi `REQUIRES_BOBBY_DECISION`)

| id | hi-fi | contract / spec | quyết định trong code | state |
|---|---|---|---|---|
| `VD-P20-01` | Mode "two alphas, one key", EChart 2, guard "both alphas", footer "Two alphas on one key" | Pair = 2 run **cùng Alpha** (spec §1/§6) | Giữ vị trí/hình hi-fi; copy "two runs, one key", overlay "Two runs, one key — overlay from retained points"; guard bỏ "both alphas" | `REQUIRES_BOBBY_DECISION` |
| `VD-P20-02` | Correlation "comparison.json · engine-published"; spec §8 "the engine did not publish one" | `source_label=PORTAL_DERIVED` + formula/version/n/window/missing policy | Card giữ hình hi-fi; meta in `PORTAL_DERIVED · formula · version · n · window · missing_policy`; absent → "correlation not derived — {reason_code}" | `REQUIRES_BOBBY_DECISION` |
| `VD-P20-03` | Cert B/C chip, sched "mode_1 × global", pill ACTIVE/SUPERSEDED, note tự do | Run không có cert, schedule, lifecycle; `claim.text` nullable | cert absent `CG-P20-03`; sched absent `CG-P20-02`; pill = `run_state` (`CG-P20-08`); note = `claim.text` hoặc absent; không viền ACTIVE | field-driven |
| `VD-P20-04` | "OOS Sharpe per fold, per attempt" + toggle 5/32 folds | Không có per-fold | Khung + caption hi-fi + absent `CG-P20-04`; không dựng toggle demo | field-driven |
| `VD-P20-05` | Config diff ở attempts "from attempts.json" | `intentional_differences` chỉ có ở pair | Khung + header hi-fi, thân absent `CG-P20-05`; nguồn ghi `PORTAL_PERSISTED_RESEARCH` | field-driven |
| `VD-P20-06` | Delta 6 hàng "engine-published" | `common_window.metrics` 3 key; `original_metrics` 5 key; không có win rate | 6 hàng A/B/Δ; Δ chỉ từ `common_window`; hàng chỉ có original → A/B + scope, Δ absent; win rate absent `CG-P20-06`; claim class `family (rank)`, Δ = `weaker_claim` | field-driven |
| `VD-P20-07` | Pair sub-toggle demo 2 cặp | Cặp chọn bằng URL `runs=` | Không dựng toggle demo; chip 2 run id từ URL | demo control |
| `VD-P20-08` | Không có dòng disclosure | Handoff "comparison state faithful" | Dòng meta mono dưới header (`read_authority · revision · as_of · coverage · source_absences`) | `AWAITING_DECISION` (nhóm `S10-COUNTS-PANEL`, B3) |
| `VD-P20-09` | Route `/compare?runs=a,b` / `?alpha=&mode=` | Contract cần `alphaId` trong path | Canonical trong Alpha; route spec làm resolver | route |
| `VD-P20-10` | Footer rules verbatim ("Two alphas", "engine-published", "the UI checks equality…") | Portal-derived; key do server so | Verbatim trừ 3 cụm: "Two runs on one key", "correlation is Portal-derived from sealed raw returns", "the UI never constructs or compares one; the server refuses". Chưa phủ (audit A7): "only the ACTIVE node may promote" giữ verbatim theo rule 2026-09-24, Bobby quyết | `REQUIRES_BOBBY_DECISION` |
| `VD-P20-11` | Subtitle "Two ideas on one key overlay…" | Như `01` | "Two runs on one key overlay…" | `REQUIRES_BOBBY_DECISION` |
| `VD-P20-12` | Không có state pair thiếu run | Pair cần đúng 2 id | Không gửi request; panel-local `PAIR_NEEDS_TWO` + link Runs, khung giữ | rule over hi-fi |
| `VD-P20-13` | Delta header "engine-published; the UI subtracts nothing else" | Common window do Portal tính | "metric deltas — server-published; the UI subtracts nothing" | `REQUIRES_BOBBY_DECISION` |
| `VD-P20-14` | Ladder weak → strong trái sang phải, "claim ↑ →", rule đọc trái sang phải | Server trả strong → weak (rank asc); spec T01 "sort đúng bậc" | `009cedb8`: bày mảng server đảo ngược (`data-ladder-order=server-reversed`, không sort số), mũi tên + rule hi-fi verbatim, nhãn "server order, read right to left · N returned" | `REQUIRES_BOBBY_DECISION` |
| `VD-P20-15` | Tag "EChart N" + narrative demo có số | Không có field tường thuật (chỉ `trajectory.text`) | Không in tag và narrative demo. Chưa phủ (audit A6): banner attempts còn số demo "1.31 … 1.19" (`ATTEMPTS_RULE`), giữ verbatim theo rule 2026-09-24, Bobby quyết | `REQUIRES_BOBBY_DECISION` |
| `VD-P20-16` | Mismatch chỉ nằm trong câu | Spec §4/§7 chip 4 phần, phần lệch đỏ; handoff: không so key ở browser | Tô đỏ bằng `===` từng phần chỉ để hiển thị; từ chối là `state=REFUSED` của server | rule over hi-fi |
| `VD-P20-17` | Claim chip không có origin | `claim.origin` (`PORTAL_DERIVED_FROM_SOURCE_PROTOCOL`) | Dòng mờ `origin {claim.origin}` dưới chip | `REQUIRES_BOBBY_DECISION` |
| `VD-P20-18` | S10 root card đúng 3 link | S13 cần lối vào từ S10 | "compare →" đặt cạnh `.ln-links` (`.ln-compare`); S10-U49 khoá 3 link | route |
| `VD-P20-19` | Rank 3 amber nhạt; nền correlation tint | Token gate U02 cấm `color-mix()` / raw color | `var(--warn)`; nền correlation `var(--accent-soft)` | rule over hi-fi |
| `VD-P20-20` | Banner markets "…Small multiples only: …" | Caption server (spec §8) đã có "small multiples only" | `034aef11`: bỏ cụm lặp | `REQUIRES_BOBBY_DECISION` |
| `VD-P20-21` | Δ đọc A − B | Server `subtractDecimal` trả right − left = B − A | `eeeae14f`: header `Δ` + `B − A · as published`, không tính lại; chờ `CG-P20-09` | `REQUIRES_BOBBY_DECISION` |
| `VD-P20-22` | Title 1 dòng, seg dưới subtitle | Bố cục | Seg cùng hàng subtitle, title 2 dòng ở 1280 (trước là debt `S13-G1-HEADER-LAYOUT`) | `REQUIRES_BOBBY_DECISION` |
| `VD-P20-23` | Không có weaker claim / intentional differences | Handoff rich composition; spec §8 | Hai khối render ở pair | `REQUIRES_BOBBY_DECISION` |
| `VD-P20-24` | Không có dòng phụ | Disclosure sampling/count | Route·protocol, sampling markets, figcaption overlay, foot common-window | `REQUIRES_BOBBY_DECISION` |
| `VD-P20-25` | Banner markets "Three different ComparisonContractKeys — …" | Caption server | Bỏ cả câu | `REQUIRES_BOBBY_DECISION` |
| `VD-P20-26` | Caption correlation "daily OOS returns · overlapping window only" | formula/n/window/missing policy | Meta `n · window · missing_policy` | `REQUIRES_BOBBY_DECISION` |
| `VD-P20-27` | Trục y overlay 5 nhãn | Dùng lại `equitySvg`, không rebase | 2 nhãn max/min | `REQUIRES_BOBBY_DECISION` |
| `VD-P20-28` | Δ tô theo tốt/xấu | FE không suy diễn "tốt hơn" | Tô theo dấu; Δ 0 không tô (`eeeae14f`) | `REQUIRES_BOBBY_DECISION` |
| `VD-P20-29` | "OOS sharpe (stitched)" | Giá trị là `original_metrics`, không stitched | "OOS sharpe" (`eeeae14f`) | `REQUIRES_BOBBY_DECISION` |

- **Audit 2026-09-24** (độc lập, trên head `7800e8e2`, chi tiết ở [receipt §12](./research_loop/evidence/P20/thanhvuong-frontend-receipt.md#12-audit-độc-lập-p20-và-commit-eeeae14f)):
  - A1 Δ không ghi hướng · A2 Δ 0 tô xanh · A3 số foot/meta không mono · A4 count `0` trong block NOT_PUBLISHED · A5 nhãn "(stitched)" · A8 aria mũi tên sai ở 660 · A10 resolver nuốt mode lạ → **sửa ở `eeeae14f`** + unit `S13-U24…U26` + probe gate a–e.
  - A6 (số demo trong `ATTEMPTS_RULE`) và A7 ("ACTIVE node" trong `COMPARE_RULES`) → giữ copy hi-fi verbatim theo rule 2026-09-24, ghi ở `VD-P20-15` / `VD-P20-10`, Bobby quyết.
  - A9 (`data-compare-state=available` khi REFUSED) → giữ theo B6, debt `S13-REFUSED-STATE-ATTR`.
  - Lệch hi-fi chưa có VD → `VD-P20-21…29`. Docs C1–C6 sửa trong packet (đếm gate, theme tối, debt rỗng, câu ETag, sort, VD-10/15).
  - Backend request mới `CG-P20-09` (hướng Δ `RIGHT_MINUS_LEFT`), `CG-P20-10` (count khi block NOT_PUBLISHED), `CG-P20-11` (khoá sort thứ hai attempts: spec OOS vs code NET_RETURN).
  - Debt mới (`open_implementation_debt`): `S13-REFUSED-STATE-ATTR` (A9, chờ B6), `S13-BACK-REFETCH` (validator ETag một slot: chỉ gửi `If-None-Match` khi quay lại đúng key vừa đọc; back/forward qua key khác đọc lại 200), `S13-DELTA-DIRECTION-LABEL` (chờ `CG-P20-09`).

- **Lỗi tìm ra và đã sửa trong phase:** token gate `color-mix()` + hex trong comment (`VD-P20-19`); S10-U49 link compare trong `.ln-links` (`VD-P20-18`); ladder ngược hướng đọc hi-fi (`009cedb8`, `VD-P20-14`); **mini chart markets 1280 nhãn trục X chồng nhau** (gói B finding 1, ảnh `575e025b89d9cd86` → `034aef11`, receipt C `45fc7c0bfd3d4e17` 2 nhãn không chồng); banner markets lặp (`VD-P20-20`); audit A1–A5, A8, A10 (`eeeae14f`).
- **Discrepancy** (bằng chứng ở receipt §7): D1 route spec ≠ contract path (`VD-P20-09`); D2 hi-fi "two alphas" ≠ pair cùng Alpha; D3 spec "engine-published" ≠ `PORTAL_DERIVED`; D4 fixture `alpha_momentum_btc` không qua regex `^[a-z][a-z0-9-]{2,63}$` (`CG-P20-07`); D5 hi-fi ECharts CDN → SVG tĩnh dùng lại `equitySvg` (S09); D6 source hôm nay chỉ `WALK_FORWARD_OOS_COMPATIBILITY`; D7 thứ tự ladder; D8 baseline `8bd81b01` 404 → terminal `notFound` ≠ S13 403 = 404 `denied`; D9 baseline DQ-08 `researchFormat.ts` ≠ S13 in Decimal nguyên chuỗi; D10 sort attempts spec OOS desc ≠ server NET_RETURN desc (`CG-P20-11`); D11 hướng Δ hi-fi A − B ≠ server B − A (`CG-P20-09`); D12 server gửi count `0` trong block NOT_PUBLISHED (`CG-P20-10`).
- **Nợ cho phase sau (P21+)** — [debt register](./research_loop/evidence/P20/thanhvuong-debt-register.json) `open_debt` không rỗng:
  - `open_implementation_debt`: `S13-REFUSED-STATE-ATTR` (gói B finding 3 = audit A9): `data-compare-state=available` cho cả pair REFUSED và zero-variance; refusal chỉ ở `data-pair-state` / `data-correlation-absent` (B6). `S13-BACK-REFETCH` (gói B finding 4 = audit C4): validator ETag một slot, back/forward qua key khác đọc lại 200 (5 GET mode-switch ở cả 1280 và 660). `S13-DELTA-DIRECTION-LABEL` (A1): nhãn hướng Δ là hằng theo code server, chờ `CG-P20-09`.
  - `S13-G1-HEADER-LAYOUT` → đã ghi thành `VD-P20-22`.
  - `S13-MINI-LABELS-UNIT`: nhãn mini chart chỉ khoá ở probe browser.
  - `S13-FIELD-DRIVEN-CELLS` (`VD-P20-03…06`) chờ `CG-P20-02…06/08`; `S13-COPY-VS-HIFI` (`VD-P20-01/02/10/11/13/14/15/17/20/21…29`) chờ B2; `S13-DISCLOSURE-LINE` (`VD-P20-08`) chờ B3.
  - Deferred: `S13-AXE` (B4), `S13-REAL-API` (B5, cờ tắt), `S13-LOCAL-DUPLICATION` (gộp `call<T>` / refusal mapper vào RF-04; baseline đã có `researchRefusal.ts`).
- **Not run:** `REAL_API_E2E_RECEIPT` S13 và `V11-P20-DR` (feature-dark, không có cặp Delta thật trên lane này); axe spec T10 (axe-core không có trong lock); telemetry; unit cho nhãn mini chart.
- **Backend request (@codex), tất cả OPEN, kiểm lại 2026-09-24 trên `bb25bf39` và `72d2638b` (`09…11` thêm sau audit, trên `eeeae14f`)** ([backend requests](./research_loop/evidence/P20/thanhvuong-backend-requests.md)):
  - `CG-P20-01` fixture canonical compare (5 case spec §10) + Problem
  - `02` schedule / mode per run
  - `03` cert per run
  - `04` OOS Sharpe per fold
  - `05` intentional differences ở attempts mode
  - `06` win rate + OOS Sharpe stitched common-window
  - `07` alpha id fixture `apps/portal/frontend/e2e/research-foundation/run-library.json` vs regex compare
  - `08` lifecycle ACTIVE/SUPERSEDED per run
  - `09` hướng Δ common-window `RIGHT_MINUS_LEFT` (field hoặc xác nhận; audit A1)
  - `10` count field khi block NOT_PUBLISHED: `null` hay rule UI (audit A4)
  - `11` khoá sort thứ hai attempts: OOS (spec) hay NET_RETURN (code) (audit C5)
- **Bobby quyết:**
  - **B1** tích hợp baseline `bb25bf39 → 72d2638b` (7 commit, chưa merge/rebase): `3e7055d5` viết lại `RunLibrary.tsx` (CompareBar thành nút disabled "not built yet") — xung đột chắc chắn với entry `alpha=` của S13; `8bd81b01` sửa `QuantBTModule.tsx` (khác vùng), 404 → `notFound`, DQ-08. Không commit nào chạm compare contract/service/evidence P20. Xung đột `FreezeDetail.tsx` (P17) và `research-alpha-import.d.ts` (P19) vẫn còn.
  - **B2** copy `VD-P20-01/02/10/11/13/14/15/17` (+ `20`, + `21…29` sau audit, + copy verbatim audit A6/A7): đề xuất mở version hi-fi mới ("two runs, one key", correlation Portal-derived, chốt hướng ladder và hướng Δ, bỏ narrative/số demo, bỏ "ACTIVE node").
  - **B3** `VD-P20-08` dòng meta (cùng nhóm `S10-COUNTS-PANEL`).
  - **B4** axe.
  - **B5** bật `CONTROL_API_FEATURE_RESEARCH_COMPARE` trên lane preview + cặp Delta thật cho `REAL_API_E2E_RECEIPT` / `V11-P20-DR`.
  - **B6** `data-compare-state` cho pair REFUSED (audit A9, debt `S13-REFUSED-STATE-ATTR`).
- **Exit gate còn lại cho P20-A frontend:** B1 rồi chạy lại toàn bộ unit + toàn bộ probe Research (162 trên tree `58f27644`, sáng + tối); `REAL_API_E2E_RECEIPT` + `V11-P20-DR` (B5); axe T10; `CG-P20-01…11` được trả lời hoặc ghi là vắng thật; B2/B3/B6; `open_implementation_debt` đóng.
- **Rollback/handoff:**
  - Revert 4 commit docs rồi 6 commit code theo thứ tự ngược (`eeeae14f` trước, `92cdc844` cuối), theo [rollback](./research_loop/evidence/P20/thanhvuong-rollback.md). Backend vẫn `FEATURE_RESEARCH_COMPARE=false`.
  - Handoff cho P21 (S11): S13 chỉ GET, không publish fact, không chọn/promote run; rank không phải publish pick. Link S13 → S11 sẽ nối khi S11 có route.

**Checkpoint tích hợp P16 review + P17–P20 frontend — 2026-09-24:** merge có hai parent, head 4ab990aa trên docs/research-loop-plan; giữ toàn bộ commits Thanhvuong tới a5455848, code/backend đã commit của Bobby/Claude, và 23 file evidence/rollback/request từ P16–P20. Bốn xung đột ở QuantBTModule, EvidenceFlow, FreezeDetail, RunLibrary được giải theo hướng giữ read-model RF-05/RF-06 mới hơn, đồng thời mở route Execute/Report/Lineage/Compare; CTA cũ "Soon" cho Report/Compare được nối route thật, P21 vẫn disabled. Link Lineage dùng helper nhẹ để không bundle cả màn S10 vào Import/Compare. Không sửa Trading System, contract, database, runtime hoặc P21.

**Gate tích hợp:** frontend build/typecheck PASS; full frontend unit 183 files, 3,458 pass/1 skip; sau helper extraction, 123 test liên quan PASS; full repository hook trên merge gốc PASS, gồm Control API 125 files/894 tests và contract/route/security guards. Commit reconcile ba commit backend mới không có overlap; không chạy lại hook 6 phút cho merge tài liệu/đường đi đã commit. origin/docs/research-loop-plan đã nhận 4ab990aa; không push primus-origin, không merge dev/main, không deploy. Các backend RF-03 đang sửa dở trong checkout chung được giữ nguyên unstaged. Đây là **code integration**, không phải REAL_API_E2E_RECEIPT, visual sign-off hoặc P17–P21 product exit.

<a id="rl-p21"></a>
### P21 — Release Candidate composer và immutable evidence pack

**Đọc chi tiết:** [Guide P21](./research_loop/RESEARCH_LOOP_GUIDE_V1_1_24_PHASES_vi.md#phase-p21); [spec S11](./research_loop/release-v1.1/docs/screens/11_release_candidate.md) + [HTML 11](<./research_loop/release-v1.1/QuantBT 11 Release Candidate and Publish.dc.html>).
**Entry:** dependencies/assignment tại [board](#rl-board) đã đạt; [G0–G7](#rl-test-gates) áp dụng.
**Test IDs bắt buộc:** `P21-T01…T14`, `V11-P21-DR/BR/GX` và source tests applicable theo §13.3.

- **Goal:** Full17fields/12evidence items đúng nguồn, không giảm RC thành params hash.
- **To-do BE:** Exact alpha/version/run/selection/audit/data/engine/revision builder; draftCAS/declarations; missing/integrity/scratch eligibility; sealed manifest and retention pins; keep four digest namespaces.
- **To-do FE/consumer:** Full11 checklist/passport/copy/declarations/UNSET deployment fields/known limitations/restrictions; local seal separate delivery/approval; renderer no fake published setState success.
- **Tests BE:** Mandatory item missing/corrupt/mismatched child audit; centroid/per-fold/null trial; ACTIVE binding vs scratch; concurrent drafts; correct pins/GC; no optimize on compose; source approval unchanged by Research integrity warning.
- **Tests FE/browser:** Composer S11 tests; each17field/12item value+link to source; missing/partial/stale-draft errors; copy/no-secret; fixtures labelled, no invented approval mirror.
- **Exit gate:** RC manifest/relations match Report/Freeze with authorized refs; local seal not downstream ACK; required fields not disguised as waiver.
- **Rollback/handoff:** Disable new compose, retain seals/pins/drafts. Handoff exact payload/mapping/auth facts to P22.
- **Backend delivery (2026-09-22):** `research.release-candidate-compose.v1` now publishes four bounded, same-origin, session/workspace-scoped operations: compose, caller-local declaration draft CAS, idempotent local seal and immutable pack read. The composer returns exactly 17 ordered source-built/YAML-identical fields and 12 ordered pack items from Portal-persisted P04/P11/P13/P14/P18/RS-02 facts. It never starts QuantBT, reads an artifact/source path, opens Execution, emits a worker command, invokes an optimizer, creates a Governance approval or accepts browser-provided source identity.
- **Immutable authority:** Migration `1723680000055` adds actor-local drafts, immutable local evidence packs, retention pins and separately mutable delivery state. A local seal is only `SEALED_LOCAL`; it retains `NOT_DELIVERED`/`NOT_APPROVED` outside its frozen core. Source fingerprint + draft revision CAS, exact final-audit/selection checks, centroid/composite provenance, malformed/corrupt source rejection and pack/pin immutability are proven on a fresh disposable PostgreSQL cell. Rollback is a flag rollback only; never delete retained packs or pins.
- **Truthful display facts:** Current fields are not falsely compared to a predecessor: `published_comparison` remains `NOT_PUBLISHED` until P22 commissions a real publication path. Methodology and engine-execution certification are separate typed axes; a source-issued methodology grade may render, whereas engine certification remains `NOT_PUBLISHED` rather than inferred from an engine release. `DEGRADED` evidence travels visibly, while `MISSING` or unresolved declaration input blocks local seal.
- **Evidence/handoff:** Focused service/contract/controller/config tests, generated OpenAPI/snapshot, capability ledger, Control API compile and migration proof pass. See [P21 evidence](./research_loop/evidence/P21/README.md) and [the Claude S11 handoff](./research_loop/evidence/P21/frontend-handoff-claude.md). Feature remains dark: Screen 11 rich browser/HiFi receipt is Claude-owned; P22 publication/Approval mirror, deployment and product activation are expressly not claimed.

<a id="rl-p22"></a>
### P22 — Publication và existing approval mirror

**§31 backend amendment — 2026-10-03:** [scoped stale-seal/guidance/read packet](./research_loop/evidence/P22/STALE_SEAL_GUIDANCE_AND_APPROVAL_READ_2026-10-03.md).
Both readers agree on `P22_CURRENT_SOURCE_CHANGED` for an existing stale seal;
typed `blocked_action` describes new-run → reviewed new candidate, never
rewriting/resealing the old actor/run draft. Rail publishes the native
ordinal/scope/reason without changing hashes/selection identity. Publisher
DELIVERED receipt + DENIED R1 mirror is separate authorization, not failed
publish; exact English copy is in the packet. Focused source/contract/build
checks pass; unchanged :8095 images do not imply new runtime/browser acceptance.
No FE, Governance grant, migration, production or P23/P24 scope change.

**Đọc chi tiết:** [Guide P22](./research_loop/RESEARCH_LOOP_GUIDE_V1_1_24_PHASES_vi.md#phase-p22); [spec S11](./research_loop/release-v1.1/docs/screens/11_release_candidate.md) + [HTML 11](<./research_loop/release-v1.1/QuantBT 11 Release Candidate and Publish.dc.html>).
**Entry:** dependencies/assignment tại [board](#rl-board) đã đạt; [G0–G7](#rl-test-gates) áp dụng.
**Test IDs bắt buộc:** `P22-T01…T14`, `V11-P22-DR/BR/GX` và source tests applicable theo §13.3.

- **Goal:** Khép Research→existing R1 bằng real compatible path, không thay consumer hoặc gate.
- **To-do BE:** Publication intent/receipt as Research saga; exact202-seeded run/alpha/claim/frozen wrapper; strict request, scoped actor, idempotency/CAS/unknown-outcome reconcile; no tokens in outbox; actual SLA/expiry/mirror reads.
- **To-do FE/consumer:** Full11 publish confirm/progress/delivery-unknown/reauth/conflict/retry/receipt links; R1/R2 view navigation existing; conditions/raw status preserved, no inline approval or automatic Paper.
- **Tests BE:** Real Delta final audit→RunSync→R1 in isolated environment; duplicate/concurrent timeout before/after downstream commit; wrong scope/hash/claims; existing open approval evidence conflict; expired auth no impersonation; protected regressions.

- **Tests FE/browser:** Remaining S11 handoff tests + composer regression; seal≠delivered≠approved; denied/changes/expired/conditional status copy from source; retry no duplicate action; no production mutation network path.
- **Exit gate:** End-to-end publication through unchanged current code, truthful actual pin scope and authorized recovery; no auth/hash/identity/consumer debt.
- **Rollback/handoff:** Stop new publish intake, retain receipts and authorized reconciliation, never revoke approvals as rollback. Checkpoint11: P21/P22 + actual API receipt.

**Backend delivery checkpoint (2026-09-25):** The private same-origin P22 GET and CSRF-protected POST are generated as `researchReleaseCandidatePublicationGetV1` / `researchReleaseCandidatePublishV1`. The server validates the current P21 local pack and final-audit mapping against RunSync-backed Governance evidence, persists one actor-bound immutable request before the unchanged R1 create call, verifies exact artifact/evidence-set pins before writing a receipt, and exposes an authorized read-only R1 mirror with raw status/SLA/expiry/conditions. `SEALED_LOCAL`, `PENDING`/`UNKNOWN`, `DELIVERED`, and `APPROVED` remain distinct; no R1/R2 decision, Execution mutation or alternative source authority was introduced. [P22 evidence](./research_loop/evidence/P22/README.md) records focused contract/controller/service, disposable PostgreSQL migration, Governance/RunSync regression, ledger and build gates. **Full P22 exit remains pending** an actual isolated Delta final-audit→RunSync→R1 preview receipt and Claude's S11 browser/HiFi receipt; backend tests are not relabeled as product evidence. Roll back by stopping new intake while retaining requests, receipts and approvals; see [runbook](./research_loop/evidence/P22/rollback.md).

**Backend real-preview closeout — 2026-09-26:** The isolated stack ran one real
historical-data WFO through the sealed P21 pack, canonical publication POST,
unchanged R1 create and an independent Bobby Governance plan/apply decision.
The server appended settlements `PENDING@1` and `APPROVED@2`, wrote one P19
promotion fact, and returned one current alpha-version publication lookup.
Repeated reads left publication/bridge/receipt/fact cardinality at one; neither
`RUN_NOT_MIRRORED` nor `P22_GOVERNANCE_SOURCE_UNAVAILABLE` occurred. See
[the structured receipt](./research_loop/evidence/P22/real-preview-receipt.json)
and [closeout](./research_loop/evidence/P22/ol03-ol13-codex-receipt.md). P22
backend real-preview is complete; Claude's browser/HiFi receipt and P23 remain.

**Backend repair:** R1 creation now rechecks workspace membership before
replay and locks that row inside its SERIALIZABLE write transaction. Reversible
R1 denial/serialization/rate-limit outcomes retain the actor-bound UNKNOWN
intent. Focused and disposable-PG regressions pass; the current shared preview
has zero sealed RC packs and lacks migration 0063, so real P22 exit is unchanged.

<a id="rl-p23"></a>
### P23 — Resource, security, recovery và upgrade qualification

**Owner amendment 2026-10-04 — exact historical scope and real two-engine qualification:** Bobby approves the exception for exactly the three old test runs listed in [owner disposition / upgrade packet](./research_loop/evidence/P23/SECOND_ENGINE_UPGRADE_AND_HISTORICAL_SCOPE_2026-10-04.md). This disposes of their historical missing-byte gate, not the bytes: strict integrity remains **83/86**, `full_store_integrity=false`, all original metadata and expected digests remain unchanged. Bobby also selects isolated qualification of the published **QuantBT 1.1.0 → 1.1.1** pins. Distinct images of 1.1.1 are not a second engine. T07/T13/P24-T05 require actual runtime/version, default/reproduction, in-flight pin and rollback evidence; they are not PASS merely because this plan is approved. Shared preview, production and production engine defaults remain untouched; no push/release authority is inferred.

**P23-T07/T13 2026-09-30 — SOURCE REPAIRED, RUNTIME OPEN:** [P04 installed-release pin packet](./research_loop/evidence/P23/T07_T13_P04_RELEASE_PIN_GAP_2026-09-30.md) preserves the pre-fix `er_quantbt_112` probe and records Bobby-approved P10 predicate repair. Matching future preflight/request release now gets a typed 409 against installed `er_quantbt_111`; 45/45 focused tests and Control API build pass, with 1.1.1 golden admission retained. A real alternate engine/default/rollback receipt is still required before T07/T13 PASS. P23/P24 stay OPEN.

**P23 F5 real revocation 2026-09-30 — SCOPED PASS:** [clean-source stale-cookie receipt](./research_loop/evidence/P23/F5_BROWSER_REVOCATION_HARNESS_2026-09-30.md) proves actual server-side logout/session revocation with S02/S14 still presenting the cookie: 4/4 typed 401 browser cases on `38f3ab5e`, jobs 194→194, no page errors, off-origin requests or overflow. Debug history is retained separately. Typed 502 and full F3/F5/P23/P24 remain OPEN.

**P23 F5 browser refusal 2026-09-30 — SCOPED PASS:** [real S02/S14 receipt](./research_loop/evidence/P23/F5_BROWSER_REFUSAL_RECEIPT_2026-09-30.md) passes 8/8 typed 400/401/403 presentation cases on clean `2bfeb53e` in the owned cell; jobs 194→194. Its historical revocation gap is superseded by the clean receipt above. Real 502 and full F3/F5/P23/P24 stay OPEN. Shared preview and Production were untouched.

**P23 upstream-connect fault 2026-09-29:** [owned-cell receipt](./research_loop/evidence/P23/GATEWAY_UPSTREAM_TIMEOUT_2026-09-29.md) records a prior 5-second/no-byte timeout, then bounded 504 in about 3 seconds on auth and Research API with Control API stopped, followed by 200/401 recovery. This is a scoped gateway fail-fast improvement, not F5 typed-502, W06 reacceptance or full P23/P24 qualification.

**P23-T09 current-candidate scoped PASS, 2026-09-29:** [same-host Execution isolation retake](./research_loop/evidence/P23/T09_EXECUTION_ISOLATION_CHECKPOINT_2026-09-28.md#current-clean-candidate-retake--2026-09-29) on clean `f5e03d0d`: one real HEAVY/four queued, unchanged Execution/health signatures before–during–after, 120/120 W06 GET 200, Library/Evidence p95 392/494 ms without SLO relaxation, 605,261,824-B peak. Two setup failures preserved. No AWS-HK or P23/P24 full qualification claim.


**P23 W07 2026-09-29:** [bounded export/seek/projection checkpoint](./research_loop/evidence/P23/W07_BOUNDED_INTERACTION_CHECKPOINT_2026-09-29.md) The corrected real WFO-overlap retake passed all 7 scoped checks: eight named 200 GETs, AVAILABLE P04 Evidence/revision, 3,046-ms bounded export stall with hash match, unchanged job count, 550,375,424-B seven-service peak. Private receipt SHA-256 `1379cfceb33aa852b356eb46b688efc054b8e3b7969e921de39b59117ca0ef71`. Scoped W07 PASS; P23/P24 stay OPEN.

**P23-T08 current-candidate scoped PASS, 2026-09-29:** [guarded cold-start
mixed receipt](./research_loop/evidence/P23/T08_COLD_CACHE_CHECKPOINT_2026-09-28.md#current-candidate-cold-start-mixed-retake--2026-09-29)
on the same Control API image as W06 evicts only P23 DB/artifact cache
(26,300,416→0 resident bytes), then runs one real WFO/four queued while
20 distinct users make 120/120 GET 200. Library/Evidence p95 414/404 ms
and aggregate peak 617,881,600 bytes meet unchanged targets. Separate
genuine cold GET-only and two clean exact W06 mixed runs also pass. Two
pre-read setup refusals and API cleanup are retained. This is a P23-only
cold-start/cache/restart scope result, not proof every page stayed cold
while WFO warmed the cell. P23/P24 overall remain OPEN.

**Current W06 candidate, 2026-09-29 (Codex):** [two exact clean-image
retakes](./research_loop/evidence/P23/W06_INFLIGHT_BATCH_CHECKPOINT_2026-09-29.md#current-88be2acd-candidate--two-clean-mixed-retakes)
on committed 88be2acd pass the original 500-ms warm summary SLO (Library /
Evidence p95 363/445 and 405/305 ms), with 120/120 GET 200 per run, one
completed real HEAVY WFO, four durable queued intents and seven-service peaks
679/620 MB. The unchanged candidate also passes the P23-only guarded
cold GET-only T08 subgate (120/120 200, all cold SLOs); simultaneous cold
HEAVY remains unmeasured. The old same-image FAIL receipts remain linked as
history, not erased. W06 current-candidate subgate PASS; T08 and P23/P24
overall OPEN for T02, T07/T13, T12, T14, T15 and DR/BR/GX. No 500–600-ms
relaxation, API/UI or dev/Production runtime change; no push.

**Latest T03/T05 scoped retake 2026-09-29:** [clean-image runtime receipt](./research_loop/evidence/P23/T03_T05_RUNTIME_RETAKE_2026-09-29.md) passes real isolated ext4 append+manifest ENOSPC recovery on `d4021790`; clean `eae7a40d` passes ten authenticated tenant/cache GETs and twelve existing JSON/CSV export status/download GETs. Full P06/API disk-full and remaining T05 private file/object/legacy-route negatives remain; W06 latency and P23/P24 remain OPEN. The source-only note below is historical.

**P23-T10 Python regression 2026-09-29:** [isolated full-suite receipt](./research_loop/evidence/P23/T10_PYTHON_BASELINE_RETAKE_2026-09-29.md) exits 0 after correcting stale P17/P13 test expectations and regenerating the canonical BAR-05 freeze manifest. This closes only the Python-suite slice; browser/engine/resource qualification on one immutable candidate and P23 remain OPEN.

**V11-P23-DR scoped direct parity 2026-09-29:** [one real P04 Delta receipt](./research_loop/evidence/P23/V11_DIRECT_PARITY_2026-09-29.md) rehashes the pinned HMD snapshot and sealed source, calls installed QuantBT 1.1.1 directly on the holdout-free 636-bar tape, then checks owner BFF `FINAL_EQUITY`, `TRADE_COUNT` and `BARS_PROCESSED`; all three numerical differences are zero. Private 0600 receipt and focused 3/3 refusal tests are recorded. This closes only that exact direct/persistence/API subset, not every WFO/source/window or browser-real `V11-P23-DR/BR/GX`; P23/P24 remain OPEN.

**V11-P23-DR WFO retained parity subset 2026-09-30:** [one real Advanced WFO receipt](./research_loop/evidence/P23/V11_WFO_RETAINED_PARITY_2026-09-30.md) rehashes all ten sealed Parquet parts and summary, checks 1,063 rows over five retained relations across manifest/DB/BFF, four exact decimal strings and immutable source pins. Focused refusal tests 5/5. This is persisted WFO truth, **not** a direct QuantBT WFO recomputation or full V11-P23-DR/P23/P24. W06 kept its original 500-ms target; no SLO relaxation or production change.

**P23-T05 file/object classification 2026-09-29:** [owned GET-only receipt](./research_loop/evidence/P23/T05_FILE_OBJECT_LEGACY_CLASSIFICATION_2026-09-29.md) confirms no raw Research artifact/object route through the P23 gateway; guessed API paths return 404 and non-API paths only the public HTML shell. Legacy `/api/runs/:run_id/export` remains a separate, mutating-on-GET non-workspace-scoped surface: absent Research run 404/401 is proved, nonempty legacy tenant isolation is **not**. T05/P23 remain PARTIAL/OPEN; do not count this as a Research file leak or a full legacy security PASS.

**P23-T05 owner scope decision 2026-09-29:** Bobby separates legacy `/api/runs/:run_id/export` into its own security slice. On clean `eae7a40d`, the published Research Report JSON/CSV and ten personalized reads plus the gateway raw-object negatives now satisfy **`T05_RESEARCH_SCOPE_PASS`**; the immutable pre-decision receipt still says `full_t05_passed:false`. No nonempty legacy export is certified, and P23 stays OPEN on T03/W06 and the other outstanding gates.

**T03/T05 backend repair 2026-09-29:** [source checkpoint](./research_loop/evidence/P23/T03_T05_SOURCE_REPAIR_2026-09-29.md) records Bobby-approved shared-backend changes and focused tests. T03/T05 remain OPEN until the clean owned-cell ext4/full-P06/API and tenant/cache retakes; three unrelated current Python-suite baseline failures are recorded, not silently waived. W06 and P23 remain OPEN.

**Checkpoint 2026-09-29:** [W06 identity-barrier retake](./research_loop/evidence/P23/READ_SLO_IDENTITY_BARRIER_2026-09-29.md) giữ Library p95 896 ms FAIL dưới một WFO thật/bốn queued và 20 principal; năm read khác cùng memory cap PASS. P23 vẫn OPEN, không nới SLO/pool hoặc gọi đây là release evidence.

**Diagnostic 2026-09-29:** [Run Library SQL/CPU boundary](./research_loop/evidence/P23/READ_SLO_SQL_CPU_DIAGNOSTIC_2026-09-29.md) confirms 20/20 GETs but unstable warm p95 (384–598 ms) without heavy compute. nginx is not established as the cause; PostgreSQL and Control API CPU are material. No admission/pool/cache/plan-policy change; W06/P23 remain FAIL/OPEN.

**T03 full durable-run checkpoint 2026-09-29:** [scoped real WFO disk-pressure/recovery receipt](./research_loop/evidence/P23/T03_FULL_DURABLE_RUN_2026-09-29.md) proves authenticated `FAILED/READY` with `RESOURCE_EXCEEDED` followed by `COMPLETED/READY` after pressure removal. The zero-free attempt did not form a durable terminal and was cancelled; it is not counted. Source repair still needs clean-commit image acceptance; W06 and full P23/P24 remain OPEN. Legacy export remains its separate security slice.

**W06 unfiltered census trial 2026-09-29:** [candidate and mixed-load receipt](./research_loop/evidence/P23/W06_UNFILTERED_CENSUS_TRIAL_2026-09-29.md) keeps current Run Library response parity except its time-issued cursor, but the real twenty-reader p95 is **686 ms FAIL** versus 500 ms. Other five reads, completed WFO and 5 GB cap pass in this scoped trial; no admission/pool/SLO or UI change. W06/P23/P24 remain OPEN pending a measured clean-image fix.

**P23-T03 clean-commit acceptance 2026-09-29:** [isolated full durable-run receipt](./research_loop/evidence/P23/T03_CLEAN_COMMIT_ACCEPTANCE_2026-09-29.md) closes the T03 backend fault/recovery subset on committed `761bc243`: `FAILED/READY`/`RESOURCE_EXCEEDED`, then a new `COMPLETED/READY` run after synthetic pressure removal. The exact test mount/image were deleted after both P23 services returned to original volume/image. W06 and remaining P23/P24 matrix remain OPEN; this is not product GO.

**P23 W06 P12 query follow-up 2026-09-29:** [two rejected isolated prototypes](./research_loop/evidence/P23/W06_UNFILTERED_CENSUS_TRIAL_2026-09-29.md#two-rejected-p12-follow-ups--2026-09-29) preserved card JSON but did not sustain 500-ms warm p95 (key-first 841 ms; one-snapshot combined 726/627/551 ms GET-only; earlier real WFO 686 ms). Both experiments were reverted, unused images removed, and the P23 cell restored. W06/P23/P24 remain OPEN; no SLO, admission, pool, contract or UI change.

**P23 W06 timing checkpoint 2026-09-29:** [twenty-principal GET-only diagnostic](./research_loop/evidence/P23/W06_UNFILTERED_CENSUS_TRIAL_2026-09-29.md#timing-only-diagnostic-after-bobby-authorized-p12-backend-repair) isolates P12 admission p95 **642 ms** versus repository work p95 190 ms; 20/20 HTTP 200 but overall p95 **992 ms**, so this is a diagnostic FAIL, not an official mixed-WFO retake. Temporary instrumentation/images were removed and the isolated service restored to the healthy pinned image. No pool/admission/SLO/UI change; W06/P23/P24 remain OPEN.

**P23 W06 clean-candidate checkpoint 2026-09-29:** [pinned source/image and private receipt hashes](./research_loop/evidence/P23/W06_INFLIGHT_BATCH_CHECKPOINT_2026-09-29.md) now supersede the dirty-image diagnostic: `2e90412d`, one real WFO/four queued/20 principals, 120/120 GET 200, Library p95 **383 ms PASS**, but Evidence p95 **571 ms FAIL** versus 500 ms; aggregate cgroup peak 704,425,984 bytes. A quota-bound attempted retake did not reach the read load and is not counted. **W06, P23 and P24 remain OPEN** pending a scoped Evidence read-path repair and exact clean-candidate mixed/cold retake; no API/UI, pool/admission cap, SLO, dev or production change.

**P23 W06 P13 candidate retake 2026-09-29:** [exact mixed receipt](./research_loop/evidence/P23/W06_INFLIGHT_BATCH_CHECKPOINT_2026-09-29.md#p13-setup-trip-candidate-and-exact-w06-retake) on clean `3f9a7fae`: 120/120 GET 200, real WFO complete, four queued, 756,875,264-byte peak; Library p95 655 ms and Evidence 666 ms FAIL even against Bobby's possible 600-ms band. Same-image GET-only comparison passes (391/313 ms), indicating compute-contention sensitivity but **not** W06 acceptance. No SLO/admission/pool/API/UI change. Natural preflight expiry is required before exact retake; P23/P24 OPEN.

**P23 W06/T08 exact same-candidate follow-up 2026-09-29:** [W06 retake](./research_loop/evidence/P23/W06_INFLIGHT_BATCH_CHECKPOINT_2026-09-29.md#clean-exact-retake-after-natural-expiry) on clean docs-only `2436b118` reused the P13 image, real HEAVY WFO/four queued/twenty principal inputs, 120/120 HTTP 200, Library/Evidence p95 **365/352 ms PASS** at original 500-ms target and 774,123,520-byte cgroup peak. Prior same-image 655/666-ms FAIL is preserved as a variance risk, not overwritten. [T08 current-candidate cold GET-only](./research_loop/evidence/P23/T08_COLD_CACHE_CHECKPOINT_2026-09-28.md#same-final-candidate-cold-subgate--2026-09-29) used guarded P23-only cache eviction (143,867,904→0 resident bytes), 120/120 GET 200/all cold p95 PASS and 420,196,352-byte peak. T08 mixed cold/WFO and full P23/P24 gates remain OPEN; no production/dev mutation or SLO relaxation.

**P23 W06 repeatability follow-up 2026-09-29:** [third exact same-image WFO/four-queued/twenty-reader receipt](./research_loop/evidence/P23/W06_INFLIGHT_BATCH_CHECKPOINT_2026-09-29.md#repeatability-retake-and-next-narrow-candidate) returned 120/120 GET 200, completed WFO and 616,951,808-byte peak but Library/Evidence p95 **527/618 ms FAIL** at 500-ms warm target (Evidence also above Bobby's possible 600-ms band). Thus the preceding PASS is a real sample, not stable W06 acceptance; W06/P23/P24 OPEN. A further P13 one-trip timestamp-row source change passes 16/16 focused tests and Control API build but has **no runtime evidence** yet. No SLO/admission/API/UI change.



**Đọc chi tiết:** [Guide P23](./research_loop/RESEARCH_LOOP_GUIDE_V1_1_24_PHASES_vi.md#phase-p23); [toàn bộ S00–S14](./research_loop/release-v1.1/docs/SPEC_INDEX.md).
**Entry:** dependencies/assignment tại [board](#rl-board) đã đạt; [G0–G7](#rl-test-gates) áp dụng.

**Test IDs bắt buộc:** `P23-T01…T15`, `V11-P23-DR/BR/GX` và source tests applicable theo §13.3.

- **Goal:** Chứng minh toàn Research chịu mixed load/failure/upgrade trong budget mà Execution không bị ảnh hưởng.
- **To-do BE:** 20user workload with1heavy+queued diagnostic/export/audit; measured aggregate<=5,000,000,000bytes including DB/queue/query/native/pagecache; disk/FD/I/O/pool budgets; backup+restore relations+bytes; historical/new release compatibility.
- **To-do FE/consumer:** Full15screen responsive/a11y/reconnect/cursor/auth-state matrix under load; measured browser heap/DOM/latency; no implicit jobs on inspect/drag; Execution/Planning regression.
- **Tests BE:** IDOR/secret/path/export isolation; corrupt artifact, PG/NATS/worker down, diskhigh/full, fencing/duplicate/resume; cacheTTL/GC pins; restore actual readback; new engine fields/defaults don't change archived reproduce.
- **Tests FE/browser:** 20authorized viewers visual+real lanes separate; source gap labels and no stale-response contamination; terminal session no reconnect storm; full relevant unit/type/build/browser gates, no baseline rewrite.
- **Exit gate:** Guide §16 resource/latency/correctness gates with actual workload pass; no hidden swap/tmpfs escape, false completion or duplicate approval; restore verifiable.8GB optional result not5GB waiver.
- **Rollback/handoff:** Research-only fault drills; drain/recover/release switch tested; cleanup isolated stacks. Handoff P24 complete qualification pack, not production activation.
**Historical backend P23 checkpoint (2026-09-25; superseded by the board and packet above):** [Packet](./research_loop/evidence/P23/README.md) and [test matrix](./research_loop/evidence/P23/phase-report.md) initially recorded only the opt-in 4.6 GB aggregate cgroup profile, pagecache-inclusive measurement, 20 distinct-principal GET-only load instrument and focused regressions. At that date an idle shared-preview reading of `441,843,712` bytes was **not** an acceptance result because its containers had no hard cap. P22 real Delta→R1 and browser receipts were then entry dependencies; P22 backend real publication has since closed. This historical instrumentation-only note is not the current P23 qualification status; no full P23/product-active claim follows from it.


**Backend repair:** The strict 5 GB instrument rejects absent mandatory
services and overlapping one-shots; bounded time-series samples capture the
peak. The 20-principal sampler times complete JSON bodies and refuses path
normalization escapes/non-JSON/oversized responses. Harness 6/6 passes; the
uncapped shared preview fails strict mode as expected. W06/fault/restore/
upgrade and browser evidence are still required for P23 qualification.

<a id="p23-thanhvuong-qualification-note-2026-09-25"></a>
#### P23 Thanhvuong qualification note (2026-09-25)

**Trạng thái:** `QUALIFICATION-PARTIAL-CONTRIBUTOR (fixture + disposable-PG lanes) / thanhvuong / STACK_LANES_BLOCKED · REQUIRES_BOBBY_DECISION (B-P23-01)`.

- **Phạm vi:** theo D3 (`0fa3c385`), P22+ là việc của Codex. Quyết định Bobby 2026-09-25 (`1ff3f2d4`) không nhắc P23. Bản này do Thanhvuong (Claude) làm theo chỉ đạo của Vuong ("tiếp tục làm P23 theo các rules cũ"), trên nhánh contributor `feat/thanhvuong/research-p17-p21`, đã push lên `primus-origin`, không PR, không merge. P23 là qualification phase: deliverable là evidence đo được + runner đã commit, không có product code, migration, flag hay service. Contributor chạy được:
  - cell PostgreSQL dùng một lần (`scripts/control-api-test.sh`, rootless Docker, network `--internal`, không host port);
  - gate static/unit/build;
  - fixture lane trên preview riêng `127.0.0.1:4417`.

  Contributor không có stack Research (portal-api + control-api + PG + NATS + MinIO + quant-worker-py), lane Python backend hay dev host. Baseline `primus-origin/docs/research-loop-plan` là `1ff3f2d4` lúc plan và `33c46b84` lúc đóng packet (27 commit W5a–W6a, trong đó có đổi locator của VD-P23-01/03 và S01). Merge-base `a5455848`. P21 + P22 + P23 của nhánh này chưa merge.
- **Goal:** đo và ghi trung thực phần qualification P23 mà một contributor chạy được. Mọi test cần stack đều `BLOCKED` kèm lý do và request, không mô phỏng, không `NOT_APPLICABLE`.
- **Đã giao:**
  - `35d0c861` (tree `5d5ffc88`, trên `29feefb8`): test(research): P23 contributor qualification runner for the Research screens (fixture lane), 9 file +2492/−0.
    - Config `apps/portal/frontend/playwright.research-qualification.config.ts`: bắt buộc có `RESEARCH_QUAL_BASE_URL` + `P23_SHOT_DIR`, không `webServer`, `workers: 1`.
    - `e2e/research-qualification/`: `_probe-p23-{matrix,load,interaction,cycles,stale}.spec.ts` (78 test), `harness.ts`, `stubs.ts` (builder typed `satisfies` theo contract sinh ra), `tsconfig.json`.
    - Runner nằm ngoài visual baseline (`testIgnore` `**/_probe*.spec.ts`) và ngoài config research-probe (`--list` 348/8 · 82/2 · 78/5, không chồng nhau).
  - Packet 5 file + handoff (docs, 2 commit; xem git log).
- **Evidence (A2 tại `29feefb8`; B tại `35d0c861`):**
  - `persistence-vs-api` PASS: cell PG thật 117/117 file · 834/834 test, exit 0.
    - Drill `pg_dump → pg_restore` so signature 56 relation (chỉ DB, không byte artifact).
    - `research-release-candidate-publication-migration.spec.ts` PASS trên PG fresh (migration 063), nên đóng `S11-P22-MIGRATION-056-UNPROVEN`.
    - PASS: auth 16, mutation-security 7, governance-token 3, a4-owner-access 33, local-read-authority 4, research-bounded-read 3, và 13 research controller spec (34 test).
  - Gate static/unit/build:
    - contracts 177/177; snapshot 198 file khớp.
    - control-api build 0. Typecheck: 0 errors in src / 0 in branch-changed files; 80 inherited test-only errors incl. 9 in 2 baseline research specs.
    - FE: tsc 0; build 0; vitest 173 file · 3153 pass · 2 fail · 1 skip ở cả 2 lần chạy. Hai fail là `r2Ledger` (`CG-P22-C`) và `PortalShell` (`S01-RUNLIBRARY-PAGE-GUARD`; chạy riêng 18/18 cả hai lần).
    - Planning: typecheck 0, test 17/17 · 99/99, build 0.
  - GX: protected diff rỗng (`e3b0c44298fc1c14`), kernel checksum khớp (`d44dad89a66db88c`), rootless, không sudo.
  - EXECUTION_REGRESSION trên preview contributor (không phải browser-real): `chromium` flag off 220/248, `chromium-preview` flag on 79/100 (16 skip theo thiết kế).
    - Mọi test không chụp ảnh đều PASS.
    - 28 + 5 = 33 ô `toHaveScreenshot` FAIL so với baseline bất biến. Rerun giống hệt, chưa chẩn đoán nguyên nhân (`S06-VISUAL-BASELINE-HOST-DRIFT`).
  - Planning e2e 2/2 PASS. Research probe P09 82/82 PASS (fixture) khi đặt `RESEARCH_SHOT_DIR`; lần đầu 33 EACCES trên `/tmp/research-shots` của bobby.
  - Runner P23 47/78:
    - matrix `FAIL (attributed VD-P23-01..03)` 30/60, 123 dòng lỗi; nửa layout/history PASS (fixture) ở 180/180 ô;
    - stale 8/9, 1 FAIL (VD-P23-04);
    - load 1/1, interaction 7/7 (15/15 dòng trong budget), cycles 1/1 (+14,2 %);
    - rerun giống hệt, 0 flaky.
  - Client cost (fixture, contributor host): load p50 3431–6376 ms, p95 5877–7074 ms (s04 34132 ms do 3 mẫu `no-finish-event`, mẫu thật lớn nhất 7080 ms), heap max 38,2 MB, DOM max 1051, writes 0.
  - Resource (contributor host; không phải cgroup stack Research; gate 5 GB **chưa đo**):
    - cell: node max 674,0 MiB, PG max 816,0 MiB (gồm tmpfs), wall 8:47;
    - peak RSS build 0,77 GB (control-api) / 1,03 GB (FE) / 0,43 GB (Planning); test 0,16 / 0,46 / 0,20 GB;
    - browser RSS max 6124 MB (một chromium, 20 context, tổng RSS là cận trên), plateau ≈ 1,0 GB.
  - Digest ở [test results](./research_loop/evidence/P23/thanhvuong-test-results.json).
- **Test IDs:**
  - `P23-T01` PARTIAL (nửa client; API p95 + 5 GB chưa đo).
  - `T02` PARTIAL (bản tương tự phía browser, heap +14,2 %; phía service chưa đo).
  - `T03` BLOCKED. `T04` BLOCKED.
  - `T05` PARTIAL (nửa FE FAIL đã quy trách nhiệm): API/DB PASS; nửa FE: writes 0 PASS, prose/401/403=404 FAIL (VD-P23-01/02/03); file/export/cache chưa đo.
  - `T06` PARTIAL (drill DB). `T07` BLOCKED. `T08` BLOCKED.
  - `T09` PARTIAL: non-screenshot regression PASS flag-off/on; 33 screenshot cells FAIL (S06).
  - `T10` FAIL (2 attributed unit + 33 visual-baseline, S06).
  - `T11` PARTIAL (writes 0, GET có giới hạn; 5 GB chưa đo). `T12` BLOCKED. `T13` BLOCKED. `T14` BLOCKED.
  - `T15` PARTIAL/FAIL: deep link/history/cursor PASS (fixture, 180/180 ô); rò chéo run FAIL trên 04 (VD-P23-04), 09/11 PASS; cold cache chưa đo.
  - `V11-P23-DR` BLOCKED.
  - `V11-P23-BR` PASS (fixture receipt: lane visual-fixture, URL 127.0.0.1:4417, build 35d0c861, dist digest 68ee0a01d1053b61, 45 shots, assertions listed). Đây không phải browser-real PASS.
  - `V11-P23-GX` PASS có debt mở (no-debt check fail theo thiết kế).
  - Lanes: delta-real-data BLOCKED, direct-vs-portal BLOCKED, persistence-vs-api PASS, api-vs-ui BLOCKED, visual-fixture FAIL (attributed VD-P23-01..04; research probe 82/82 và nửa layout/history PASS fixture), browser-real NOT_RUN, dev-host-review NOT_RUN.
  - Workload: W00 PARTIAL, W01–W05 BLOCKED, W06–W09 PARTIAL, W10 BLOCKED.
- **Not run / Blocked:**
  - lane Python backend (`CG-P23-05`);
  - delta-real-data / direct-vs-portal / api-vs-ui / browser-real / dev-host-review;
  - phép đo aggregate 5,000,000,000 bytes và mọi test cần stack (`CG-P23-01…04`);
  - chẩn đoán 33 ô ảnh lệch;
  - axe.
- **VD / CG / debt:**
  - P23 không có màn riêng. Runner đo được:
    - `VD-P23-01` (P1): prose server hiện trên 9 màn, 81 ô. Đã biết từ P16, chưa sửa, nay có số đo.
    - `VD-P23-02` (P1): 401 hiển thị thành denied.
    - `VD-P23-03` (P1): 403 ≠ 404. Lệch với receipt P21 §A5.
    - `VD-P23-04` (P2): hub 04 giữ nội dung run A.
    - `VD-P23-05` (P3): chỉ là quan sát code.
  - Quyết định: ghi lại, **không sửa trong P23**.
  - `CG-P23-01…05` + `CG-P22-C` (mang sang) ở [backend requests](./research_loop/evidence/P23/thanhvuong-backend-requests.md).
  - Debt mở: `S01-RUNLIBRARY-PAGE-GUARD`, `S02-RESEARCH-REFUSAL-PROSE`, `S03-RESEARCH-401-SESSION-STATE`, `S04-F04-403-404-DISTINGUISHABLE`, `S05-EVIDENCE-HUB-RUN-KEY`, `S06-VISUAL-BASELINE-HOST-DRIFT`.
  - Đã đóng: `S11-P22-MIGRATION-056-UNPROVEN`.
  - Downstream `P23-FE-DG-01…09` ở [debt register](./research_loop/evidence/P23/thanhvuong-debt-register.json).
- **Bobby quyết:**
  - `B-P23-01`: nhận hay bỏ bản P23 contributor làm ngoài D3.
  - `B-P23-02`: dựng stack cô lập, hoặc tự chạy các lane bị chặn bằng runner + cell script.
  - `B-P23-03`: giữ ngưỡng client tạm (8000 DOM nodes / 200 MB heap, `execution-journeys.spec.ts:771–772`) hay dùng ngưỡng §16.3.
  - `B-P23-04`: sửa FE defect `S01` + VD-P23-01..05 (`S02`–`S05`) trong `fix/*` của contributor (cần quyền đụng snapshot baseline) hay giao Codex.
  - `B-P23-05`: tích hợp baseline P21 + P22 + P23 (D1: Codex merge), rồi đo lại trên cây đã tích hợp.
  - `B-P23-06`: chạy `chromium` / `chromium-preview` trên host baseline với `35d0c861`.
- **Exit gate chưa đạt:**
  - Chưa đo (không có stack): ngưỡng §16 với workload thật, aggregate 5 GB, restore chứng minh mọi artifact được publish tham chiếu, outage/disk/upgrade/cold cache.
  - Chưa về 0 fail: FE vitest (2), runner (31), EXECUTION_REGRESSION (33 ô ảnh).
  - Không claim `VERIFIED` / `CERTIFIED`. Fixture PASS không cộng vào real PASS.
- **Rollback/handoff:**
  - Không có runtime nào để gỡ. Rollback = không merge, hoặc revert docs → runner theo [rollback](./research_loop/evidence/P23/thanhvuong-rollback.md).
  - Cell tự dọn container/network/mktemp và giữ lại 2 image trong rootless store. Preview 4417 của B đã kill theo PID; temp config đã chép `.copy` rồi xoá.
  - Không bao giờ `drop_caches`, restart service dùng chung hay revoke approval.
  - Receipt: [thanhvuong-frontend-receipt.md](./research_loop/evidence/P23/thanhvuong-frontend-receipt.md). Handoff P24: [frontend-handoff-claude.md](./research_loop/evidence/P23/frontend-handoff-claude.md).

<a id="rl-p24"></a>
### P24 — Full product acceptance, handoff và release rehearsal

**Đọc chi tiết:** [Guide P24](./research_loop/RESEARCH_LOOP_GUIDE_V1_1_24_PHASES_vi.md#phase-p24); [toàn bộ S00–S14](./research_loop/release-v1.1/docs/SPEC_INDEX.md).
**Entry:** dependencies/assignment tại [board](#rl-board) đã đạt; [G0–G7](#rl-test-gates) áp dụng.
**Test IDs bắt buộc:** `P24-T01…T15`, `V11-P24-DR/BR/GX` và source tests applicable theo §13.3.

- **Goal:** Đóng đủ24phase/15màn bằng real journey và owner-reviewable candidate, không chỉ green tests.
- **To-do BE:** Real import/bind→preflight→durable Delta→evidence→RC→existing approval; scratch/failure/retry/history cases; all FND/COR/DR closure, migrations+data/auth preservation, signed-release compatibility rehearsal.
- **To-do FE/consumer:** Every route/tab/drawer/action matrix; full actual no-stub journey + canonical visual lane, print/deep links/refresh/auth/console/chart values; owner sees exact research-dev candidate with rollback receipt.
- **Tests BE:** Full required backend/contract/Rust/Python/ControlAPI/PG and recovery gates from candidate; direct→storage→API oracle; restored artifact usability workers-off; protected code/kernel/old clients; no Trading mutation.
- **Tests FE/browser:** Full required unit/type/build + no-update visual + real Delta browser + unchanged Execution regression; source-inspected≠integrated≠browser-verified; all15screens/subpanels included, no fixture leak or blank route.
- **Exit gate:** All mandatory gates PASS with retained evidence, no known in-scope debt; report owner review separately. Deliver READY_FOR_BOBBY_REVIEW; OWNER_ACCEPTED only after Bobby verdict, DEPLOYED only actual rollout.
- **Rollback/handoff:** Checkpoint12: one acceptance packet/runbooks/repro commands + full coverage/cleanup/rollback. Main merge/signed production rollout are Bobby's separate release instruction via existing workflow; never auto-copy dev DB.

<a id="rl-decisions"></a>
## 13.6. Decision/request ledger và mẫu cập nhật phase

Ghi request tại đây trong cùng change, không tách thêm campaign hay gửi từng mẩu qua chat.
Mỗi entry có `id / phase / screen-field-action / source locator + revision /
expected-actual / classification / proposed change / owner / decision-status /
test-to-close / evidence`. Phân loại `PORTAL_IMPLEMENTATION`, `CONTRACT_MISMATCH`,
`SOURCE_CAPABILITY_GAP_PROVEN`, `PROVISIONING`, `OWNER_UX_DECISION`;
raw đủ nhưng thiếu transform thuộc implementation, không source gap.
Không đánh dấu resolved chỉ vì trả lời Claude; phải link code/test hoặc quyết định scope Bobby.

Các mục RL-C01…10 là reconciliation khi lập plan, **không phải lỗi runtime đã test**.
DR01–07 vẫn dùng ID gốc trong guide; không tạo ID thứ hai cho cùng quyết định.
Nếu Bobby/Claude đã giải quyết trước, đọc exact return/commit và cập nhật evidence, không hỏi lại.

Mẫu phase report (small authored file; trạng thái chỉ cập nhật board §13.4):

```text
Phase / assigned scope / effective Linux identity:
Worktree / branch / base SHA / head SHA / upstream dependencies:
Implementer / reviewer / cross-agent handoff approval:
Goal and delivered BE/FE panels/actions:
Files changed + real Git additions/deletions:
Contracts + numeric/source/authority mapping:
Guide test IDs + source test IDs + actual commands/results/reused evidence:
Delta source/data/engine/effective-spec + direct/storage/API/DOM comparison:
Visual/real/regression lane refs + copy/layout/console/network outcomes:
Resources + scale-refine six fields + bounded cleanup decision:
Protected Execution/kernel/shared surfaces + data/auth preservation:
Dev URL / bundle/API/image/config/schema identity + rollback receipt:
Debt / owner decisions / external dependencies:
Exit gate outcome / Bobby review state:
Next phase/action + remaining prerequisites:
```

## 13.7. Release/data safety và điểm dừng của campaign

P24 nghiệm thu **research-dev** ở `dev-portal-research.primusspark.com` sau provisioning thật.
Không thay `dev-portal.primusspark.com` hoặc `portal.primusspark.com` như một bước test.
Config/secrets/data/evidence ở approved storage ngoài ephemeral worktree; xóa worktree không được
làm runtime mất env hoặc data. Source checkout sạch không chứng minh service đúng image/flags.

Khi Bobby ra lệnh release sau review: dùng [runbook hiện có](../docs/release-and-deployment.md),
reviewed dev→main, same-commit CI→signed image/SBOM/provenance→protected deploy.
Giữ stable project/ports/volumes/Cloudflare Access/accounts/Planning/Execution overlays.
Backup PG + Roadmap SQLite nhất quán, migration append-only forward, restore/revert compatibility
được thử trong isolation. Không promote database contents, bootstrap lại user hoặc down migration phá dữ liệu.
Release flag mới cần named profile cùng evidence; không bật mọi feature chỉ vì “build đầy đủ”.

Self-hosted CI/publish và deployment dùng roles/labels hiện hành, job budgets bounded.
Docs-only không cần full compute/browser lại; workflow/schema/auth/asset-routing changes phải chạy
đúng gates liên quan. Không bỏ một required check để vượt hết minutes; thiếu capacity dùng
approved runner, không host Docker/secrets quyền rộng. Cleanup theo C4/C6, chỉ exact phase-owned
temporary assets sau job terminal, giữ rollback và retained evidence.

**Hiện tại:** chỉ plan/rules, không changes runtime, không compute/data read, không phase tests hoặc
dev deploy đã được claim. Hành động kế tiếp: Bobby giao P01 (hoặc chỉ rõ slice làm trước/người nhận);
agent theo entry/gates trong plan này.

## 13.8. Planning validation journal — 2026-09-19

- Đã kiểm tra đủ 24 entries, 168 trường goal/to-do/test/exit/handoff, test-range Pxx
  đối chiếu guide và 72 mã V11-DR/BR/GX; 162 local links/explicit anchors trong
  phần plan/rules mới đều tồn tại. Đây là kiểm tra tài liệu, không phải phase tests PASS.
- Đưa bộ guide/hi-fi/spec do Bobby cung cấp vào cùng source history để handoff không
  thiếu dependency; không đổi UI/logic/spec/support.js, không đưa `.DS_Store` vào commit.
  Chỉ bỏ một trailing space ở HTML04 dòng1310 do whitespace gate; không đổi JavaScript semantics.
- Giữ nguyên history trước §13 ngoài pointer đầu file; root rules chỉ bổ sung override
  Research. Chưa sửa product code, contracts, DB, runtime, DNS, account hoặc Execution.
- P01 còn phải xác minh archive/baseline byte-hash bằng nguồn gốc và mapping toàn bộ
  HTML handlers/tests; không coi link-check là đã browser-review cả 15 màn.
- Không tạo container/job/test account/build cache trong bước soạn plan; cleanup
  runtime `NO_ACTION_NEEDED`. Pre-commit verification nếu chạy được ghi riêng ở handoff,
  không đổi trạng thái 24 phase từ `PLANNED`.


### Selective Thanhvuong P22/P23 integration checkpoint — 2026-09-25

The contributor branch was reviewed against the canonical `docs/research-loop-plan`
head and was **not merged wholesale**. Only the contributor P22/P23 evidence packets are retained; the proposed
fixture runner was reviewed and rejected because its generated shapes are stale. The
current Codex P22 backend (two named routes, actor-bound intent, SERIALIZABLE
R1 membership and exact pin checks) and the current P21 rich S11 composition remain
the authorities.

Thanhvuong's alternate P22 three-route publication/mirror implementation and its
colliding migration are recorded as `REJECTED_INCOMPATIBLE`; the alternate Python
Atlas route is also rejected because the public Python route was intentionally
retired in favour of the Control API/internal boundary. No duplicate route,
migration, flag, provider, database, runtime or source connection was introduced.
The imported P23 Playwright lane is explicitly `FIXTURE_ONLY`, optional, and does
not qualify real API, cgroup, DR or browser-real acceptance. P22/P23 product gates
remain exactly as their canonical packets state: pending real preview/browser and
resource/DR receipts. P24 is untouched.

### P23 F3 WFO real-browser parity subset — 2026-09-30

[P23 evidence](./research_loop/evidence/P23/F3_WFO_BROWSER_PARITY_2026-09-30.md)
records 12/12 real, non-intercepted named-BFF-to-DOM cases across S03–S08 at
1280/660 px, completed WFO, clean seven-image cell `bae2a78c`, jobs 173→173,
zero page errors, off-origin requests or overflow. Two earlier failed harness
attempts are preserved with hashes. This is **scoped PASS only**: canonical
54/54 F3, F5, OL-24, remaining P23 gates and P24 stay OPEN. No dev/production
runtime, product UI, command or source system changed.

### BR-AN-01 Research descriptive analytics backend checkpoint — 2026-09-30

Bobby's D-AN-01 all-time decision supersedes older rolling/benchmark absence
assumptions without deleting historical critique. The backend source-time WFO
and fixed lanes now seal additive `research.retained-analytics.v2` facts from
admitted QuantBT results and the run's already-loaded HMD close. S01 receives
a separate last-30D block; S09 freezes the same all-time values; S13 derives
UTC-daily common-window Sharpe from exact retained matched observations. P04
single-window per-fold is NOT_APPLICABLE. V1/old seals remain readable and
immutable; no read-time HMD call or PnL/fill/objective recomputation was added.
This is a backend/contract checkpoint, **not** a 54/54 F3, preview browser,
P23/P24 or Product GO verdict. AN-25/27 remain QuantBT-owned; AN-29 old-seal
backfill awaits Bobby, with typed absence as default. Claude owns v2 FE binding.
[Exact fields, focused tests, old-seal checks and handoff](./research_loop/evidence/P13/BR-AN-01_backend_receipt_2026-09-30.md)
· [backend queue §9](./research_loop/CODEX_BACKEND_GAPS_2026-09-30.md).


### LW-01 preview 400-trial Search bound checkpoint — 2026-09-30

The B0 400-trial audit found that Search's objective probe still capped at 128
even though the isolated preview profile admits 400 trials and at most 64
candidates. Zod and OpenAPI now use the derived maximum 464; the normal
64-trial seal, 64-candidate seal, 200-row page and 1-MiB response cap stay
unchanged. A canonical 400-trial fixture and OpenAPI/Zod parity test pass.
Real isolated-preview GET now accepted R-WFO-020 with 400 distinct trial IDs
in two 200-row keyset pages, both below 1 MiB (Control API image and response
sizes in receipt). LW-01 is accepted without changing the normal profile.
[LW-01 receipt](./research_loop/evidence/P15/LW-01_search_400_trial_bound_2026-09-30.md)
· [backend queue §9](./research_loop/CODEX_BACKEND_GAPS_2026-09-30.md).

### LW-02 WFO report recovery checkpoint — 2026-09-30

Migration 079 records a bounded, workspace-scoped RETRY/FAILED/SEALED state.
The report GET may repair only a SUCCEEDED run bound to the exact Delta WFO
profile, with a persisted 60-second cooldown. Terminal sidecar failures now
write a typed failure code; report reads return 503/409 rather than a silent
permanent 404. The immutable report manifest, source retention and QuantBT
execution paths are unchanged. Control API build, focused 43/43 and disposable
PostgreSQL migration 5/5 passed. Real preview R-WFO-020 returned HTTP 200
twice with one immutable report revision; retry state SEALED, attempt 1, on
image pinned to 9ea4351e. LW-02 is accepted; no FE route was changed.
[LW-02 receipt](./research_loop/evidence/P18/LW-02_report_repair_receipt_2026-09-30.md)

### LW-03 QuantBT child-audit source boundary — 2026-09-30

QuantBT capped the lifecycle table before Portal intake and reports 2,212
dropped records. The retained 2,000 rows lack the fold OOS-generation facts;
Portal cannot prove them from an absent source row. Keep the existing typed
missing-fact verdict and do not fabricate a freeze seal. This source-owned
gap does not block unrelated current-source Search or Report acceptance.
· [backend queue §9](./research_loop/CODEX_BACKEND_GAPS_2026-09-30.md).

### LW-04 outer-test-only derived series checkpoint — 2026-09-30

WFO source-time compact monthly/rolling/distribution data now uses the
inclusive union of outer-test windows rather than the full stitched account
tape. The full tape remains immutable for Replay. New seals carry an internal
OOS scope marker; older seals without it return a typed derived-series absence
instead of a mislabeled pre-OOS chart. S01 retained sparkline samples only
OOS observations. Real preview DB read-only measurement on R-WFO-020:
2,184 full versus 1,440 OOS bars. Focused Control API 29/29 and two actual
QuantBT 1.1.1 golden WFO tests pass. Exact-HEAD preview endpoint acceptance
passed on the exact-HEAD isolated preview: Control API image
sha256:bf708bcd26d9d9ccb744e1218fd7cfb309d17192efa238c6b106acd4d7926666,
sparkline HTTP 200 with 1,440 OOS observations, and old monthly/rolling/
distribution sealed views each typed NOT_PUBLISHED (no false values).
[LW-04 receipt](./research_loop/evidence/P13/LW-04_oos_scope_2026-09-30.md)
· [backend queue §9](./research_loop/CODEX_BACKEND_GAPS_2026-09-30.md).

### LW-05 selected trial identity and objective scope — 2026-09-30

R-WFO-020's Progress trial 394 is the one-based journal ordinal for retained
Optuna source trial id 393; both name the same selected candidate. The
selection objective -4.796929242668172 is MODE_1_DECAY_J, while the raw
trial callback's +4.948278702312006 is best IS Sharpe. Public Progress now
names the source trial and objective kind only under the exact WFO profile;
producer text and read-time copies of older immutable snapshots/events label
the IS figure correctly. OpenAPI generated types and a canonical fixture
are provided for Claude; source journals and FE design remain untouched.
[LW-05 receipt](./research_loop/evidence/P11/LW-05_selection_scope_2026-09-30.md)
· [backend queue §9](./research_loop/CODEX_BACKEND_GAPS_2026-09-30.md).

### LW-06 fold trade-count scope versus audited Replay rows — 2026-09-30

Research Library and Compare use the source's sum of published OOS fold
trade counts. Replay has zero audited trade-record rows and six settled
target transitions; these are three distinct units, not conflicting copies
of one ledger. The retained Library label is now "OOS fold trades" while its
scope and definition ID remain exact. Claude should keep separate captions
for S13/S08, not synthesize fills from target transitions.
[LW-06 receipt](./research_loop/evidence/P20/LW-06_trade_scope_2026-09-30.md).

### LW-07 current Atlas Portal admission — 2026-09-30

The QuantBT release catalogue stays pinned and unchanged. The current Atlas
BFF adds a separate Portal-owned `portal_admission` descriptor for the fixed
P04 profile and gated WFO profile: exact mode/route/seed, normal three-trial
count, dev-preview 2–400 bound and disabled/source-refusal reasons. Historical
identity responses are unchanged; preflight and run admission remain
authoritative. Claude should bind S02 to the new descriptor rather than
treating the source catalogue's fixed profile as every Portal run profile.
[LW-07 receipt](./research_loop/evidence/P09/LW-07_portal_admission_2026-09-30.md).

### LW-08 Research Library versus legacy global run shell — 2026-09-30

The isolated preview showed a legacy global artifact row marked COMPLETED,
while old Research metadata for that id says QUEUED and the row is not in
the current workspace's Research Library. The backend must not import it or
fabricate status. Research Library already publishes its own workspace-scoped
count/status ledger; Claude should use it for the Research shell and keep
legacy `/api/runs` separate. The old export security slice remains gated
separately.
[LW-08 receipt](./research_loop/evidence/P12/LW-08_legacy_count_boundary_2026-09-30.md).

### B3 CG-FG-S04-02 — retained P08 dataset coverage, 2026-10-01

The P13 Evidence Hub now selects the admitted P08 snapshot in its existing
workspace/actor/preflight-token join and publishes a typed, bounded
`core.dataset_coverage`: full snapshot-query UTC range, rows, gaps,
missing-bar count and columns. No new HMD read or raw/holdout data is exposed.
Old manifests with only identity digests remain readable and answer
`NOT_PUBLISHED/P08_SNAPSHOT_COVERAGE_NOT_RETAINED`; corrupt partial metadata
fails closed. Control API build, focused Hub/contract tests and the disposable
P13 PostgreSQL test passed. Exact-HEAD isolated-preview R-WFO-020 Evidence
GET returned HTTP 200 with 2,484 source-retained rows, zero gaps/missing
bars, and a typed `AVAILABLE` coverage panel; backend fact accepted.
[B3 receipt](./research_loop/evidence/P13/CG-FG-S04-02_dataset_coverage_2026-10-01.md)

### B3 CG-FG-S08-01 — sealed fold parameter identity, 2026-10-01

Replay fold segments now carry the canonical digest of the retained global-study
selected parameter map, the same identity already visible in Progress and Freeze
on the real WFO run. This is not a false claim that the QuantBT OOS-generation
child executed those parameters; LW-03 remains a source gap. Old seals answer a
typed absence. Claude may bind the S08 strip without changing approved visuals.

### B3 CG-FG-S10-03 — structured claim family on Lineage, 2026-10-01

P19 Attempt Lineage now shares the conservative claim-family rule with P20
Compare. WFO requires an accepted RS-02 seal plus its matching SEALED P05
artifact; P04 requires a valid persisted P14 fixed-profile outer-OOS protocol.
Claim text alone never establishes family. P19's batched reads remain within
its workspace-scoped repeatable-read budget; frontend S10 stays Claude-owned.

### B3 CG-FG-S03-01 — admitted planned folds on Progress, 2026-10-01

The P11 Progress read now includes a bounded, typed `run.planned_folds` projection
from the exact P08 preflight topology retained with the run. It does not
relabel source-reported folds as planned, infer execution from a plan, or make
an extra HMD call. Historical manifests with no fold plan answer
`NOT_PUBLISHED`; malformed or mismatched immutable topology fails closed.
Claude owns the S03 Gantt binding and visual/browser acceptance.
[B3 receipt](./research_loop/evidence/P11/CG-FG-S03-01_planned_folds_2026-10-01.md)

### B3 CG-FG-S03-02 / S04-01 — shared methodology claim strip, 2026-10-01

P11 Progress now projects four mode×schedule claims from the run-pinned current
Atlas as `FORECAST`; only the matching immutable QuantBT WFO seal can change
a particular fact to `ISSUED`. The same projector gives P13 Evidence Hub all
seven S04 claim-strip cells, with honest `NOT_PUBLISHED` / `NOT_APPLICABLE`
for P04 holdout/runtime gaps. The P11 singular claim and certificate are not
parsed or multiplied into unsupported source claims. Both generated contracts
are additive for a bounded rollout. Claude owns FE binding and browser/HiFi
acceptance; no frontend file or runtime service was changed in this slice.
[B3 receipt](./research_loop/evidence/P13/CG-FG-S03-02_S04-01_claim_strip_2026-10-01.md)

### B3 CG-FG-S06-05 / S06-02 / S06-06 / S06-01 / S06-03 — source-bound Search facts, 2026-10-01

The P15 Search read now distinguishes P11 S4 completion time from an engine pool-freeze claim, publishes exact P04 parameter levels, canonical trial parameter digests, the P08 *request-scoped* seed, and selector confidence only when the sealed QuantBT metric exists. A 6×6 mean-IS-objective grid uses all retained COMPLETE trials, not the current ledger page. It is typed absent when IS objective or two declared axes are unavailable. No per-trial seed, inferred selector, or missing-trial value is fabricated.

Commit `bfee4737` closed S06-05/S06-02; commit `2d4744bc` closed S06-06/S06-01/S06-03. Full hook at the latter: 1397 Control API tests passed (1 skipped), 204 contract tests. Isolated preview `:8095` at that exact SHA returned R-WFO-020 Search HTTP 200: seed 42 scoped to admitted request, sealed selector CONFIRMED, 389 COMPLETE trials represented by 36 grid cells; both one-row and 200-row pages were <1 MiB. Claude owns the S06 typed-client binding and browser/HiFi receipt; neither frontend nor dev/stable runtime changed in this slice.

[B3 freeze/levels receipt](./research_loop/evidence/P15/CG-FG-S06-05_S06-02_backend_receipt_2026-10-01.md) · [B3 digest/selector/grid receipt](./research_loop/evidence/P15/CG-FG-S06-06_S06-01_S06-03_backend_receipt_2026-10-01.md)

### B3 CG-FG-S11-02 — compose-only selected-params truth, 2026-10-01

P21 Screen 11 now has a typed selected trial number from the retained source (one-based display) and a typed `param_set_id` absence. It never aliases a digest or selection receipt as a param-set identity. This is additive to the composer only; local sealed packs and their digests remain immutable. Claude owns the frontend binding and browser receipt.
[B3 receipt](./research_loop/evidence/P21/CG-FG-S11-02_backend_receipt_2026-10-01.md)

### B3 CG-FG-S14-04 — Alpha Registry exact total and cursor, 2026-10-01

P07 Registry emits exact workspace/filter `total` and a signed opaque `next_cursor` over a bounded 200-row page. Source timestamp microseconds plus `alpha_version_id` preserve order; count and page share one repeatable-read snapshot. Cross-workspace/filter or tampered cursors fail typed 400. Disposable PostgreSQL traversed 201 rows (200+1) without duplicate, 10/10; contract 6/6. Claude owns S14 binding, not a layout rewrite. [Receipt](./research_loop/evidence/P07/CG-FG-S14-04_backend_receipt_2026-10-01.md).

### B3 #13–14 — S02/S04 window authority and existing Portal admission, 2026-10-01

The P08 preflight already returns exact admitted `train.bars` / `outer_oos.bars` per fold. New P13 Hub `core.window_disclosure` reuses that immutable topology for S04, publishes bounded fold-window counts with overlap scope, denies P04 holdout bar count, and keeps old digest-only manifests typed absent. Focused Control API 15/15, contracts 204/204, disposable P13 PostgreSQL 5/5 passed. Exact before-preflight dataset edges are not available from the current HMD month-partition catalog; BR-D4-1 remains blocked on a bounded metadata index, not guessed from partitions. BR-D4-3 was already delivered by LW-07 through `Atlas.portal_admission`. Claude owns FE binding. [P13 receipt](./research_loop/evidence/P13/CG-FG-S04-07_window_disclosure_2026-10-01.md).

### B3 #15/#17/#18 — P04 Replay counts, WFO trial rate, single-window absence, 2026-10-01

Backend code `b4965e34` landed by fast-forward above Claude FE `8b4a7477`; no frontend file changed. P04 Replay now publishes OOS bar count and a separately scoped child-tape trade count, while order/fill/trade/event ledgers stay typed absent. The WFO producer now emits cumulative monotonic-time `rate_trials_per_s` and persists it through the P11 journal; old journals correctly have no rate. P04 per-fold metrics now read as structural `NOT_APPLICABLE`, without rewriting sealed evidence.

Full repository hook: Control API 1401 pass/1 skip, generated contracts 204/204; pinned Python progress/W2 45/45. Isolated exact-head preview image `sha256:b12fd4b213f4aa6d4e640e8dae275ab3a23d312c80b880698a7a7b97771af786` healthy. Real P04 read returned 744 OOS bars, 45 `CHILD_TAPE` trades reported, and typed ledger absences; Evidence returned P04 per-fold `NOT_APPLICABLE`. Earlier WFO progress remained rate-absent, as expected. Claude owns binding into S03/S04/S08 without layout changes.

CG-FG-S09-02 is **CODE_READY / NEW_SEAL_RECEIPT_PENDING**: P05 now hashes the actual `series/stitched.parquet` bytes and seals digest, size and logical name in its summary; P18 WFO report exposes the source-file digest with the exact `FULL_STITCHED_SOURCE_SERIES` scope. Old seals are typed absent; immutable reports are not rewritten. A fresh isolated HMD-backed WFO seal/Report read is required before product acceptance. See the [P05 digest receipt](./research_loop/evidence/P05/CG-FG-S09-02_source_series_digest_2026-10-01.md), §9 of [the backend queue](./research_loop/CODEX_BACKEND_GAPS_2026-09-30.md), and the [P17](./research_loop/evidence/P17/CG-FG-S08-03_replay_counts_2026-10-01.md), [P11](./research_loop/evidence/P11/S03_trial_rate_2026-10-01.md), and [P13](./research_loop/evidence/P13/CG-FG-S04-04_P04_fold_absence_2026-10-01.md) receipts.

### Backend-gap source/endpoint audit and B4 contract closeout, 2026-10-01

The [isolated preview census](./research_loop/evidence/P23/BE_GAPS_SOURCE_ENDPOINT_CENSUS_2026-10-01.md) found exact static parity for 48 external Research method/path pairs in 17 OpenAPI files and controllers; 29 successful read-only GETs covered 25 distinct named operations on P04/WFO real runs. This proves **route/read coverage, not universal source availability or executable admission**: P10 currently runs two declared Delta profiles, imported Alpha is declaration-bound, requested-spec v2 is planning-only, and engine/HMD facts remain typed gaps. P21 compose/pack no longer emit misleading ETags for mutable bodies; Problem `error.message` is documented as diagnostic-only, and the P22 handoff reflects the actual top-level `publication.downstream_code`. The P02 Python-pin check passed using a resolved immutable QuantBT 1.1.1 qualification image. No production/source/runtime change or remote push.

### B1 legacy export security and FE handoff checkpoint — 2026-10-01

The legacy `/api/runs/:id/export` path now has workspace/run/actor authorization in the Control API facade and a signed-ADMIN check at the private Portal API. Archive generation moved from GET to explicit CSRF-protected POST; GET reads only a prepared archive. ZIP publication is atomic and retains the last complete archive on failure. Focused Python 2/2, isolated-PostgreSQL facade 1/1, Control API build and old-seal Report test 1/1 passed. This is **CODE_READY**, not deployed or full P23 acceptance: Claude must replace the two legacy direct-download links with prepare-then-download (or typed unavailability) before product use.

Read-only migration census: preview has canonical 075/076; known dev/stable ledgers have neither old 068/069 nor 075/076. AN-29 owner decision is sidecar v2 with digest from verified retained rows, preserving original seals; implementation and historical receipts are still pending. LW-03 remains an engine-source fact gap; no Portal synthesis. The [scoped security receipt and FE field/action handoff](./research_loop/evidence/P23/LEGACY_EXPORT_SECURITY_AND_REMAINING_HANDOFF_2026-10-01.md) lists exact pending consumers and tests. No runtime, production data, frontend code or remote was changed.

#### Backend gap addendum — 2026-10-01, AN-29/LW-03

CG-P21-01 canonical fixture pack is also delivered in this backend slice: [fixture receipt](./research_loop/evidence/P21/CG-P21-01_canonical_consumer_fixtures_2026-10-01.md), Zod/OpenAPI validation and typed compose/seal/pack/refusal states for Claude's S11 consumer. This closes the missing fixture supply, with frontend adoption and real publication acceptance tracked separately.

Bobby chọn analytics v2 sidecar, giữ seal gốc. Code ở migration 081 và operator CLI chỉ đọc P05 immutable rows, viết companion một lần; Current Source Evidence và Run Library kiểm digest trước khi hiện. [AN-29 receipt](./research_loop/evidence/P13/AN-29_immutable_sidecar_v2_2026-10-01.md). Trạng thái: `CODE_READY / HISTORICAL_APPLY_PENDING`; chưa backfill preview/production. P18 Report core đã freeze không bị viết lại, FE có thể lấy supplemental analytics qua Evidence cùng typed provenance. Deploy migration trước reader.

LW-03 được khắc phục cho **run mới**: tăng bounded lifecycle ledger lên 20.000 và giữ OOS-generation trong sample 64/fold. [Receipt](./research_loop/evidence/P17/LW-03_new_run_custody_2026-10-01.md). Old QuantBT child đã drop 2.212 records không thể phục dựng; phải chạy một WFO HMD mới mới nghiệm thu S11. Backend queue [§10](./research_loop/CODEX_BACKEND_GAPS_2026-09-30.md) supersedes row cũ. Không push remote, đổi runtime hay cập nhật frontend trong slice này.

#### Backend preview follow-up — 2026-10-01

Code `999be160` đã qua hook đầy đủ (Control API 1.406 pass / 1 skip) và hạ cánh trên Claude F3 `5fad25cf`, giữ cả hai bên. Preview :8095 đã nhận migration 081 và sidecar AN-29 cho R-WFO-020; không đổi seal/report gốc. Receipt thật phát hiện Library fast-path thiếu sidecar join và WFO mới 400 trials vượt summary 64 KiB. Bản vá sửa join và chỉ giảm bucket nến hiển thị khi cần, không giảm retained data/authority hay tăng budget. Preview helper reload nginx + probe same-origin readiness để tránh static healthy/API 502 sau đổi container IP. [Receipt](./research_loop/evidence/P05/WFO_SUMMARY_BUDGET_AND_PREVIEW_GATE_2026-10-01.md) · [AN-29](./research_loop/evidence/P13/AN-29_immutable_sidecar_v2_2026-10-01.md). API trên image sửa và WFO mới vẫn chờ nghiệm thu; không ghi PASS cho run đã thất bại. Không push remote, sửa frontend hay rollout production.

#### Current-source closeout and Claude F4 sync — 2026-10-01

AN-29 đã **PREVIEW_ACCEPTED cho đúng R-WFO-020** trên image `78d69930`: Evidence/Library v2 cùng 19 điểm last-30D; seal-summary checksum, Freeze/Replay source content và frozen Report không đổi. Receipt SHA-256 `7a91ce18cf4fa75f151f26421d0cf5088fcc57e1e3d3468d8fd049de302b80ab` trong [P13 packet](./research_loop/evidence/P13/AN-29_immutable_sidecar_v2_2026-10-01.md). Supersedes API-pending note ở trên; không suy thành production/all-seal backfill.

WFO mới hoàn tất 400 trials/9 folds, retained đủ OOS-generation (source drop=0), rate thật `10.090060274`, digest Parquet equity khớp Report. Receipt phát hiện phép hash candidate của Portal làm mất kiểu Python float `1.0` → int `1`: bản vá đối chiếu theo historical child binding, giữ seal và mismatch thật, đưa ordering vào Freeze ETag. P05 sample giữ thêm witness selection-stage thật mà không tăng giới hạn 64/fold. [P16 packet](./research_loop/evidence/P16/CANDIDATE_IDENTITY_AND_CURRENT_SOURCE_CLOSEOUT_2026-10-01.md) ghi rõ còn cần corrected-image Report/S11 receipt; không viết lại report đã freeze với lỗi cũ.

Claude F4/F5 `fedfac44` đã được giữ nguyên trong baseline. Backend sửa BR-F4-01 (`1d`/`1D`) và phần caption S09 BR-TXT-02; không sửa frontend. Những request F4 còn lại vẫn nằm trong [queue §11](./research_loop/CODEX_BACKEND_GAPS_2026-09-30.md). P23/P24, T12/T14 và requested-spec v2 executor chưa được đánh dấu hoàn tất. C4: root còn 231 GiB/37%, RAM available 16 GiB, `NO_ACTION_NEEDED`; không prune tài nguyên đang dùng, không push hay rollout production.

#### Actual WFO seal/RC and P04 passport follow-up — 2026-10-01

`83201af3` đã hạ cánh trên nhánh Research chung, hook Control API 1.408 pass / 1 skip và contracts 205/205. Backend refresh giữ frontend image Claude. **R-WFO-023** (`rrun_3d5633d2adb712722fe4ba108102aa5d`) qua đúng P08 admission → isolated child → P05 retention → named API → frozen Report → RC local seal/pack: 400 trials, 9 folds, source drop=0, 9 MATCH, Stage-4 BOUND, rate `9.152993995`, digest Parquet thật khớp Report. [P16 receipt](./research_loop/evidence/P16/CANDIDATE_IDENTITY_AND_CURRENT_SOURCE_CLOSEOUT_2026-10-01.md), [queue §12](./research_loop/CODEX_BACKEND_GAPS_2026-09-30.md). LW-03 / S09 byte digest / S03 real rate đã PREVIEW_ACCEPTED cho run/profile này; global WFO vẫn non-causal đúng source, RC NOT_DELIVERED/NOT_APPROVED, old seal/report không sửa.

Regression P04 thật lộ tổng passport vượt 24 KiB sau thêm v2. Bản sửa chỉ coarsen sample hiển thị với metadata trung thực, giữ source count/metrics/digest và trần byte. Python pinned 32 pass / 1 optional skip; test HMD read-only sau đó được bật riêng và PASS. [P13 packet](./research_loop/evidence/P13/P04_COMBINED_PASSPORT_BUDGET_2026-10-01.md) ghi `PREVIEW_FIXED_RUN_PENDING` tới khi image sửa có receipt product mới. Không gọi lần chạy P04 thất bại là hoàn tất; không rebuild UI hay tác động production/remote. Backend còn lại được giữ rõ trong queue, không đóng P23/P24 bằng receipt scoped này.

#### P04 actual receipt and frontend availability handoff — 2026-10-01

Supersedes P04 pending note above: `f71f7438` đã qua hook, hạ cánh FF và chỉ build image Python. **R-P04-021** (`rrun_ece579eb6e0538ab5508f154fd3deb23`) qua actual admission/child/P05 seal/Hub/Library/Report: 744 OOS bars, analytics v2 14/14 metrics AVAILABLE, 19 điểm last-30D, Report frozen. Receipt SHA-256 `f8acd2ad0e51155f2379e4e776f910d0ed57d1c008fd67772dc02f33660e4180`; [P13 packet](./research_loop/evidence/P13/P04_COMBINED_PASSPORT_BUDGET_2026-10-01.md). BR-F4-09 đã PREVIEW_ACCEPTED cho run mới, BR-F4-01 catalog `1d` actual GET PASS, BR-F4-11 Library companion đã PASS. Không sửa seal lịch sử hay giả optimizer rate cho fixed profile.

Claude nối S04/S09 analytics all-time và S01 Library last-30D; dùng R-WFO-023 cho S03 rate/S07 binding/S09 byte digest/S11 local pack. Typed absence của seal cũ/source thiếu vẫn giữ nguyên. Remaining B3/B4/B5 và F4 được liệt kê ở [queue §12](./research_loop/CODEX_BACKEND_GAPS_2026-09-30.md), không chuyển chúng thành P23/P24 PASS. C4 root 228 GiB free, RAM available 15 GiB, không cần destructive cleanup; giữ preview cho review và mọi test cell của agent khác. Nhánh Research chung/local commit, không push remote, merge dev/main hay rollout production.

#### BR-F6-01/02 delivery plan — retained all-time distributions, 2026-10-01

Bobby giao tiếp tục queue; ưu tiên panel S04 đang trống. Codex owns backend/contract, Claude owns frontend. **Goal:** old verified WFO and R-WFO-023 expose OOS monthly returns (including the leading partial month) and all-time UTC daily-return histogram through the existing named lazy series API, without re-running optimization or changing original seals/reports.

- Add optional `distributions` in analytics v2, with versioned formula, OOS provenance/input digest, exact decimals, finite counts and ≤32 calendar points/12 bins. Leading month uses first retained OOS equity as an explicitly partial baseline; no invented pre-OOS close. Missing months are not filled; zero-variance samples remain typed N/A.
- Migration 082 adds an append-only distribution companion for already sealed runs, including runs with an existing AN-29 companion. The operator CLI verifies bounded retained OBSERVATION/FOLD rows and import hash, dry-runs then applies idempotently. Runtime SELECT-only; no update/delete of analytics, source seal or frozen Report. Source-time child uses the same calculation for future runs; GET only selects precomputed facts.
- Named MONTHLY_RETURNS/RETURN_DISTRIBUTION reads and Evidence revision/ETag include the companion. Unrelated Freeze/Replay/Report revisions remain unchanged. Old clients still accept the existing value shape; additional partial/count/basis fields and typed metadata are generated from OpenAPI, not hand-written frontend types.
- Tests: independent monthly arithmetic and daily-histogram counts, mid-month/one-month/gaps/constant/invalid/bounded inputs; schema/digest/count consistency; PostgreSQL forward migration/immutable grants and replay/conflict; old-scope refusal without companion; real preview old-WFO + R-WFO-023 read receipts, unchanged original seal/report checksums. One backend refresh only after grouped code/tests; no optimizer or frontend rebuild for this slice.
- Exit: both named series AVAILABLE with truthful scope/counts on the verified preview runs, July retained for R-WFO-023, companion idempotent, old seal/report unchanged, generated contract/FE handoff recorded. This scoped closeout does not turn remaining B3–B5/P23/P24 into PASS. No remote push or production action.

#### BR-F6 actual-image closeout — 2026-10-01

`cf8dc871` landed after Claude `7e98a18d` / `31a61da6`; both sides' docs and
frontend commits preserved. **BR-F6-01/02 PREVIEW_ACCEPTED** on twelve eligible
WFO seals (ten old + two new): migration 082 append-only companions, operator
dry/apply/idempotent retry and two named series/Hubs passed. R-WFO-023 has July
and August, first month partial, histogram 61 UTC daily returns from 1,488 OOS
bars. Independent raw-row oracle and original seal/AN-29/Report/Freeze/Replay
immutability PASS. Full hook Control API 1,411 pass/1 skip, contracts 206/206;
focused pinned Python 34/34. Exact images/hashes/Claude handoff in
[P13 receipt](./research_loop/evidence/P13/BR_F6_ALL_TIME_DISTRIBUTIONS_2026-10-01.md).

Codex changed no frontend file, ran no optimizer and rebuilt only preview backend
images. Claude can bind the new partial/basis/count and daily-grain metadata now.
The new B6 `enrich_analysis` spec survives the queue conflict intact; its full
ER-01…10 implementation (including all-time Library, P04 monthly binding and
drawdown episodes) remains next, not silently marked done. Metadata index,
executor v2, audit/exposure and whole-candidate P23/P24 still open. No remote
push, dev/main merge or production change. C4: disposable test cells cleaned,
active preview retained, 224 GiB root free / 16 GiB RAM available; no prune.

#### B6 delivery plan — shared `enrich_analysis`, 2026-10-01

Bobby approved ER-01…10 in the [service spec](./research_loop/ENRICH_ANALYSIS_SERVICE_SPEC_2026-10-01.md).
Codex owns backend/contracts; Claude owns existing UI-first consumers. Reuse
the verified analytics/distribution arithmetic through one deterministic builder,
not endpoint-specific calculations. Append-only migration 083 binds an enriched
document to the original run, source revision and source digests; runtime SELECT
only. Original source seals, analytics companions, frozen Report and exports stay
immutable. Operator dry/apply/retry uses the same builder as future source-time
production. No HMD/optimizer run or browser-side derivation for backfill.

- Publish `research.enriched-analysis.v1`, `lane`, all-time facts/curves,
  integer histogram counts, partial months, top-ten drawdown episodes plus
  open/longest-open disclosure, ≤64 extrema-preserving Library points. Report
  and P04 Hub use **top-level `enriched_analysis`**, matching current-source
  Evidence. Library uses `analytics_all_time = library_summary`; deprecated
  `last_30d` stays wire-compatible, never relabelled all-time.
- Read paths only select verified precomputed companions. Revision/ETag includes
  the supplement; Report frozen core/export revision remains unchanged. Existing
  monthly/distribution routes consume that same block. IS/Holdout remain typed
  absent when their payload was not retained. P04 historical sampled equity is
  explicitly partial; it must not pretend to be a complete daily/bar ledger.
- Tests: deterministic bytes/digests, partial/single month, daily-vs-bar grain,
  episode recovery/open/top-ten, missing benchmark/turnover/IS, bounded curves,
  strict schema/count/source binding, generated canonical fixtures, PostgreSQL
  immutable grants/migration/retry, scoped readers and ETags. Group backend
  gates before one preview refresh; reuse real R-WFO-020/023 and P04 seals for
  operator/API receipts, checking original core/seal checksums before/after.
- Exit: ER results and any truthful input absences recorded per run in P13,
  fixture/type/path handoff to Claude, scoped cleanup and exact preview identity.
  Backend acceptance does not assert visual acceptance or close metadata index,
  executor v2, audit/exposure, P23/P24. Work only on the Research lane, no remote
  push, frontend edits, dev/main merge or production rollout.

#### B6 backend acceptance — 2026-10-01

**ER-01…10 PREVIEW_ACCEPTED**, scoped to backend. Code `d16058ee` preserves
Claude `320c361d`; shared builder, migration083, source-time writer and explicit
historical companion, all-time Library, P04 and supplemental Report published.
Contracts **210/210**, required Control API hook **1,419 pass / 1 skip**, real
PostgreSQL migration/grants/writer **10/10**, pinned Python **30 pass / 2 skips**.
An operator SQL-column error found by dry-run was corrected to the immutable
producer receipt and regression-tested against actual migrated SQL.

**14/14 real preview runs** (12 WFO + P04-018/021): dry/apply/idempotent retry,
Hub/monthly/histogram/Library/Report parity, 304 validators, independent retained
WFO oracle and original seal/passport/081/082/frozen-core/Freeze/Replay authority
unchanged. P04 partial sample coverage and unavailable daily ledger/analytics
remain typed. No optimizer run, UI edit, remote push or production action.
See [complete receipt, ER table, exact identities/digests and Claude handoff](./research_loop/evidence/P13/B6_ENRICH_ANALYSIS_2026-10-01.md).
Backend is available for Claude's all-time consumer integration now; visual
acceptance is not asserted. Metadata index, executor v2, audit/exposure and
whole-candidate P23/P24 remain open; this record does not close them.

#### B7 delivery slice — indexed data declaration and enrichment absence

Owner continuation: Bobby, 2026-10-01. Read Claude's latest B6 browser record,
`BIND_B6.md`, queue and the B7 `DATA_DECLARATION_SPEC_2026-10-01.md` currently
being committed in his frontend lane. No frontend implementation is edited.

- Publish `enriched_analysis_availability` on Evidence/current-source/Report:
  available means a verified companion; missing means an explicit source-bound
  reason, not an inferred zero. Frozen core/seal authority remains unchanged.
- Implement one bounded `enrich_dataset_catalog` service and an explicit HMD
  index operator. Source reads use the approved installed reader only, in
  bounded chunks. Persist timestamps/metadata, never market prices in Git.
  Immutable revisions bind source manifest, observation clock, indexed range
  and exact target-timeframe bars. GET reads the index; it does not build it.
- Preserve v1; add a named v2 catalog and workspace-scoped symbol search/page
  contract. Exact boundaries/counts/quality expose indexed coverage explicitly;
  missing instruments, datasets and unindexed ranges are typed. Never infer
  listing/expiry/tick/lot from a symbol suffix or label a partial index complete.
- Tests: deterministic build/hash, gap/closed-edge/window/warmup semantics,
  bounds/concurrency/retry/corruption, query/cursor isolation, auth/404, schema
  and generated parity; then real preview HMD/API receipts and source immutability.
  Group focused gates before the mandatory commit hook; rebuild backend only.
- Exit for this slice is a precise field/type/API handoff plus real receipt,
  not all DR-01…10 or product acceptance. Profile-aware conditions/fold admission,
  fresh S02-created runs, executor v2, T12/T14 and aggregate P23/P24 remain
  separately tracked until their own gates run. No push or production rollout.

#### B7 index/BFF backend acceptance — 2026-10-01

Scoped slice **PREVIEW_ACCEPTED `8829f7a0`**: immutable HMD timestamp index,
three named workspace-scoped BFF reads and B6 typed enrichment absence.
29 symbols × seven intervals, 203 entries, 54,983 metadata bytes. Independent
target-reader oracle **21/21**, three IS/OOS/Holdout/warmup checks and real
same-origin preview **46/46 GETs** PASS. Mandatory hook: contracts **215/215**,
Control API **1,429 pass / 1 skip**, zero route collisions and protected hash
unchanged. Source read-only, immutable Report core equal prior B6 receipt;
backend images updated, exact frontend image preserved. No new optimizer run,
FE modification, remote push or production rollout.

Full [receipt, image/hash pins, DR table, C4 and precise Claude binding instructions](./research_loop/evidence/P13/B7_DATA_DECLARATION_INDEX_2026-10-01.md).
Claude must switch the V1/proposed S02 consumer to these generated v2/named
clients and show selected-interval quality/window facts plus truthful absence;
backend proof does not constitute browser acceptance. HMD contains other real
datasets, but Portal adapters/calendar/profile qualification are still DR-03
implementation, not missing-source claims. Official instrument facts are not
published by this installed Binance loader and are not inferred.

Still open: DR-08/09 profile-aware fold/conditions, complete DR-10 S02-created
WFO/P04/browser receipt, broader adapter qualification, requested-spec v2 executor,
T12/T14 writers and whole-candidate P23/P24. Keep original pending notes above
as history; this addendum supersedes only the proven slice, not the whole queue.

#### B7–B9 / P23–P24 continuation — Bobby approval, 2026-10-02

Owner has assigned all four remaining backend groups; no further generic
approval is needed. Codex works in `portal-research-be` / `codex/be-gaps`,
landing coherent reviewed packages on `docs/research-loop-plan` only. No
frontend edit, remote push, dev/main promotion or production change is implied.

1. **DR-08/09 and DR-03:** named metadata-only declaration estimate (actual
   indexed timestamps, existing planner, profile/seed/trial/window conditions),
   generated contract and bounded cached reads. Qualify source-specific HMD
   adapters against the approved installed reader and actual mounted source;
   never relabel a futures calendar as a different market or infer instruments.
2. **Requested-spec v2:** versioned admission/profile/worker/isolated-child
   mapping of temporal guards, rolling width and inner folds. Pin the effective
   topology at worker dispatch and retain engine facts; retain v1 byte parity.
   Preflight acceptance alone is not executable-adapter proof.
3. **T12/T14:** complete governed audit-child and exposure writer through the
   existing durable lease/fencing/budget/cancel/audit lane. No GET launches work,
   no diagnostic selection overwrite and no invented source exposure.
4. **P23/P24:** one clean candidate, real fixed/WFO write and retained/BFF
   parity, scoped fault/restart/restore/identity cleanup and resource checks;
   reuse unaffected evidence by dependency pin. P24 is a signed-release
   rehearsal/review packet, not authority to roll out production. Browser and
   visual ownership remain with Claude; missing receipts stay explicitly open.

Each package records files/line counts, focused tests, source/API/image pins,
typed absences, consumer handoff and cleanup in its packet plus queue §9.
Group tests by risk before the mandatory hook; do not repeat engine runs for
documentation or rebuild unchanged frontend. Overall completion requires the
named real gates, not a count of green fixture tests.

**2026-10-02 implementation checkpoint:** B7 fold/window/conditions now uses a
named metadata-only operation with server-owned AlphaVersion warmup, bounded
timestamp planner/cache and typed UTC alignment refusal. Additional spot/
quarterly namespaces passed 14 direct-loader oracle cases. B8 adds immutable
temporal v2 Delta/global profile with rolling width and guards end-to-end;
real HMD child/retention passed (1,056 bars, 2 folds, 3 trials, 5.277s wall).
Library enrichment absence and Atlas seed/default/version policies are now
explicit. Inner/per-fold causal retainer, calendar-correct remaining HMD
families, audit/exposure and one-candidate P23/P24 are not marked complete.
[Detailed receipt and Claude handoff](./research_loop/evidence/P10/B7_B8_TEMPORAL_EXECUTOR_2026-10-02.md).
No frontend/visual, production or remote mutation.

**T14 writer checkpoint (same package):** new WFO seals now carry a real
adapter-observed engine-call completion and actual half-open OOS range, with
source-attested role. The private importer locks the live producer/job/attempt,
uses the stored snapshot digest, and commits the immutable seal, exposure and
audit together. Identical retry adds no duplicate. It does not claim an engine
first-read timestamp or backfill an old absence. Focused tests pass; actual API
receipt and whole P23/P24 acceptance still pending.

**2026-10-02 real API continuation (supersedes pending API):**
clean c8b1641b + Claude eae8a7b5 frontend passes rolling v2
`rrun_c1ff5f12d22a86b6f1c97c6fb37f2222`, fixed Delta
`rrun_13440d54340605a7764f2b7c116084b8` and Quarterly
`rrun_99e22fdbb265b86e4a9c5f45c54ba19d`, all COMPLETED/READY.
RC v2 returns AVAILABLE with exact self-audit COMPLETE, fold stitch MATCH,
stored snapshot-bound exposure and no GET-created job. [Acceptance](./research_loop/evidence/P10/B7_B8_TEMPORAL_EXECUTOR_2026-10-02.md).
The one-candidate 92-day workload fails B6's shared summary budget, not HMD or
engine capability. Migration 085 restores separate 64-KiB core / 72-KiB
enrichment limits without rewriting old bytes; TS/PG 16/16, Python 10 pass /
1 opt-in skip. [Bounded repair](./research_loop/evidence/P05/JSONB_SEAL_BUDGET_2026-10-02.md).
P23 retake and P24 whole-product gate remain OPEN; no required test is waived.
[P24 entry assessment](./research_loop/evidence/P24/ENTRY_ASSESSMENT_2026-10-02.md).

**P23 measured continuation (2026-10-02):** clean `6726b4b5` completes the
92-day retained WFO; all mixed/far-seek reads are 200, no implicit viewer
compute, peak below 683 MB. Fresh-parent utility quota passes. Warm and
far-seek latency **fail**; preserve actual failed receipts and thresholds.
The next bounded fix removes repeated schema/hash work only for an already
verified deeply frozen enrichment object, and repairs exact-spec preflight /
fresh-parent reuse in the evidence harness. No RLS, UI, quota or SLO change.
[Detailed measurement/repair packet](./research_loop/evidence/P23/TEMPORAL_CANDIDATE_LOAD_2026-10-02.md).
P23/P24 and real second-engine T07/T13 are not marked green.

**2026-10-02 scoped read/security repair:** clean 660f4b18 brings deep Library
to 381 ms but Search/Replay still fail; failures remain in the packet. The
next finite S06 input snapshot and merged Replay count/settings queries keep
membership/RLS, repeatable-read, 2 active/18 queued, queue/DB timeouts and SLO.
Focused 70/70 and Control API image build pass. Dirty diagnostic has all 140
reads 200 and all seven targets met, but it is not clean P23 acceptance.
HTTP/parser/client compatible-major dependency pins give a dated full-lock
audit result of 0 vulnerabilities. Monthly v2 has an actual COMPLETED/READY
product receipt; fixed three-window estimate now has real 168/168/48 bars and
300/300 warmup. [Packet](./research_loop/evidence/P23/TEMPORAL_CANDIDATE_LOAD_2026-10-02.md).
Claude gets the four §17 answers in backend queue, no consumer/layout change
for this SQL patch. Full P23/P24, second-engine upgrade evidence, unsupported
non-reuse audit-child and whole frontend/browser gates remain open. Preserve
all original volumes/receipts/image pins; no remote/prod action.
### P23 single-snapshot continuation — Codex, 2026-10-02

Landed `e9c64d1c` (+433/-99, 18 files), preserving Claude `d30a201d`.
Mandatory hook: backend 1468 PASS / 1 opt-in skip; contracts 219 PASS.
Clean cell has the current frontend too. Actual 20-reader far-seek retake
returns 140 GET 200 but Library 521/500 and Search 939/750 ms still FAIL;
Replay deep/previous/far PASS. Next scoped S06 repair uses one authorized
seal+ledger snapshot and no unconsumed B6 lookup, with build/95 focused tests
PASS. No API/UI, limits, remotes, shared :8095, dev/main or production change.
P23/P24 stay OPEN until their actual remaining gates pass.

#### Current-source / P23 actual closeout checkpoint — 2026-10-02

- `65bdc8e2` landed after preserving Claude `a599bd3f` (latest chart UI).
  Docs append conflict resolved by retaining both sections; no frontend edit.
  Mandatory hook **1469 Control API PASS / 1 opt-in SKIP**, contracts **219/219**.
- Clean seven-image :8096 candidate: **far-seek PASS** (140/140 GET, Library
  192 ms / Search 494 ms p95, Replay 731–802 ms, 599 MB peak). Real 92-day
  WFO finishes READY with 4 queued intents; 120 GET all 200, but mixed
  Library **538 > 500** / Progress **568 > 500** ms => **W06 FAIL**. No SLO waived.
- Utility quota, DB/NATS/worker recovery and ten-route tenant/cache scope
  PASS. Coherent restore actually verifies **144 tables / 805 part records /
  3132 files** and 5 worker-off reads; original volumes recovered unchanged.
  Full integrity stays FAIL for **3 old T03 disposable-store manifests** lost
  when those test ext4 images were deleted. Keep exact missing IDs and failed
  strict/partial receipts, not fabricated artifacts or deleted DB history.
- Supported step-up account APIs: exactly **22 test identities' sessions
  revoked / 0 ACTIVE**, 21 test accounts disabled, test owner anchor retained.
  Owned cell down without `-v`; volumes/backups/receipts/rollback pins kept.
  Shared preview, real accounts, Execution/TS, dev/main/prod and remotes untouched.
- **P23 / P24 OPEN**: mixed SLO, old test artifact loss, real engine-2,
  whole frontend/browser/owner and signed-release proof. Current-source
  declaration/v2/self-audit/exposure scopes are delivered, not universal
  source/calendar/inner-execution/linked-audit capability.
- [P23 actual evidence](./research_loop/evidence/P23/TEMPORAL_CANDIDATE_LOAD_2026-10-02.md#final-actual-candidate--65bdc8e2),
  [P24 entry + local unsigned manifest](./research_loop/evidence/P24/ENTRY_ASSESSMENT_2026-10-02.md),
  [precise frontend handoff and remaining queue](./research_loop/CODEX_BACKEND_GAPS_2026-09-30.md#current-source-delivery-and-actual-p23-closeout-checkpoint--2026-10-02).
[Receipt](./research_loop/evidence/P23/TEMPORAL_CANDIDATE_LOAD_2026-10-02.md).

### Research FE ledger — Claude, 2026-10-02

Frontend (lane `claude/fe-parity`) đã land và chạy trên preview: B6 `enrich_analysis`, BR-F6, B7 (catalog-v2, symbols, bar-metadata, declaration-estimates), hai đợt sửa QA, chart động (draw-in, crosshair/tooltip số thật, zoom chung, vùng drawdown, tháng tốt/xấu nhất). Gate hiện tại: tsc sạch; vitest đầy đủ pass; lane real-API 54/54; axe 90/90; hook qua. Bốn lệch HiFi (warn ink `#8f6118`, faint ink Research, hai chip xám, gạch chân link S13) đã được Bobby duyệt 2026-10-02.

**F5 chưa đóng:** còn visual lane (Bobby duyệt từng ô baseline, không `--update` tự động) và receipt thật cho D7. Sổ yêu cầu backend còn mở và các câu đã được trả lời: [`CODEX_BACKEND_GAPS` §19](./research_loop/CODEX_BACKEND_GAPS_2026-09-30.md#19-sổ-yêu-cầu-backend-còn-mở--một-nguồn-claude-2026-10-02-bobby-backend-còn-thiếu-gì-thêm-vào-markdown-unified-luôn). FE state theo màn: [`FRONTEND_GAPS_FOR_SONNET`](./research_loop/FRONTEND_GAPS_FOR_SONNET_2026-09-30.md) F7.

#### Bobby-approved six-group backend repair — 2026-10-02

Base `267b8934`; status **IN_PROGRESS**. This continues B8/B9 and source
qualification within the existing phases, not a new phase or P23/P24 waiver.
Approved scope and requirement/evidence matrix:
[backend queue §20](./research_loop/CODEX_BACKEND_GAPS_2026-09-30.md#20-bobby-approved-six-group-repair--2026-10-02).

1. Cross-screen correctness and exact S13 pair failures.
2. Retained readiness, observed/planned progress and typed terminal Split.
3. Maximum source-backed analytics with immutable historical supplements.
4. Search/Freeze/Replay facts and sealed RC draft/pack consistency.
5. B9 all-time chart contracts; no browser analytics or rolling-detail change.
6. HMD remediation and separately qualified source/profile capabilities.

Bobby authorizes parallel agents. Codex root integrates disjoint backend
slices; Claude's frontend lane and staged work are preserved. Shared generated
artifacts are regenerated centrally. Focused tests precede grouped mandatory
hooks; exact real product receipts are required for closing a group. No remote
push, production rollout or shared preview mutation in this slice. Current
P23 failures, missing old test artifacts, engine-2 and P24 gates remain recorded.

Six-group scoped delivery now includes actual owned HMD Compare/Hubs and B9
immutable amendments with independent source oracle; source-seal/B6/frozen
Report unchanged. Compare both orders 200 (261/186 ms), Hub AVAILABLE/PARTIAL.
Initial disposable gate 1,549 PASS / 1 opt-in SKIP; final mandatory hook
includes late fixes: **1,570 PASS / 1 opt-in SKIP**, contracts **223/223**.
Actual API proof is scoped to owned :8096. This is **not full six-group or
P23/P24/FE acceptance**. Separate IS capture, exact shared-preview/browser,
fixed-child/RC/terminal receipts and actual VN/source/profile gates remain in
the same approved groups. [Receipt and explicit Claude field handoff](./research_loop/evidence/P13/B8_B9_SIX_GROUP_REPAIR_2026-10-02.md).
Owned test :8096 down, sessions 0 ACTIVE; volumes/backup retained. No FE edits,
remote push, dev/main or production change.

#### Six-group continuation — fresh source custody and named BFFs, 2026-10-02

Continues the same six approved groups, after `8bd781ed`; no new phase or
waiver. Fresh fixed/imported IS capture is optional and separately scoped.
087 retains full available child lifecycle rows; 088 binds fixed OOS market/
account Parquet and named observation replay to the exact fresh P05 byte seal.
Native QuantBT DEFAULT positions are preserved with a separate authenticated
market symbol. Orchestration clocks are not engine freeze/OOS-read clocks.
AVAILABLE/null guards and actual CANCELLED Library mapping are repaired;
retention cancellation now fences/joins custody threads before scratch cleanup.

Final owned :8096 API proof: fixed 168 IS + 168 OOS / five replay pages; WFO
336 OOS + two folds / 12 available audit rows / three pages. Full-OOS statistics
match an independent replay-row oracle within 1e-12. RC actual local seal,
identical retry, locked actions and post-seal PATCH 409; existing terminal
Split/console; 13 metadata cases and 11 companion negatives PASS. These are
diagnostic functional proofs, not signed/clean full P23 acceptance.

[Exact images, run IDs, hashes, tests, cleanup and Claude generated-client
handoff](./research_loop/evidence/P13/B8_FRESH_SOURCE_CUSTODY_2026-10-02.md).
No FE edit, remote push, shared :8095 or production mutation. Preserve Claude's
new commits when landing on `docs/research-loop-plan`. G-20/G-21 shared-preview
amendments/exact-pair/browser acceptance, genuine source-profile qualification
and previous P23/P24 gates stay open. Engine source omissions remain typed;
rolling remains excluded by D-AN-01. Owned :8096 stopped without deleting
volumes; zero active jobs/sessions, owner anchor and 21 disabled users preserved.

#### B8 continuation — admitted causal/inner profile, 2026-10-02

Scoped backend delivery in the same approved group 6, not a new phase or
P23/P24 waiver. Adds immutable `p10.delta-signal-notional-causal-inner.v1`
with digest `60a041b373808405f8896aee0a3421d41cc2199d516dadc9f40e1187e2fefdd1`;
installed QuantBT 1.1.1 already supplies the source capability. Fixed/global
v1/v2 digests, historical seals and existing five retained tables are unchanged.
Constraint-only migration 089 binds the exact new custody pair. Admission,
worker caps (120 CPU/240 wall), actual P08 inner topology, own-study identity,
native selection/inner tables and locked cross-relation seal validation agree.

Real producer `rrun_becde1e160a2770d49246f7f665208ce`: P08→P10→isolated
child→P05→API, COMPLETED/READY, **2 outer folds / 6 real trials / 7 inner
folds**, own selected parameters/digests and two generation-child MATCHes.
Nine named APIs 200; 13 GET-negative cases PASS without new jobs/preflights.
Causal Search surfaces are independent per study (max 48 points); no global
theta/ranking/K. Selection means LAST_FOLD_DEPLOYMENT. Replay/Report use each
fold's own params; causal verdict and decay bases explicitly separate inner
IS from outer OOS. Source clocks stay typed absent; no orchestration inference.

[Exact source/image/hash/tests, cleanup and generated-client frontend handoff](./research_loop/evidence/P10/B8_CAUSAL_INNER_CURRENT_SOURCE_2026-10-02.md);
[backend queue §25](./research_loop/CODEX_BACKEND_GAPS_2026-09-30.md#25-codex--causalinner-current-source-integration-2026-10-02).
Keep Claude's newer frontend commits and G-20 evidence intact when landing.
Frontend needs the new scoped bindings before causal browser acceptance.
G-21/G-22, genuine VN calendar/instrument/daily profile, engine source omissions,
old P23 failures/second-engine and P24 release remain separate. No FE edits,
remote push, dev/main, shared :8095 or production action. Owned test cell down,
0 active jobs/sessions, 21 accounts remain disabled; volumes/backups retained.

#### B8 continuation — independent raw-IS qualification, 2026-10-02

**IN_PROGRESS**, same approved group 3. Existing IS facts have source-time
proof; the previous independent raw numerical oracle is OOS-only. Take one
fresh fixed P08→P10→isolated child→P05→Hub/Report receipt with an opt-in,
bounded private IS witness before scratch retirement. Verify source bytes,
admitted windows/identity, return/drawdown/Sharpe, daily distribution and
benchmark independently; do not change OOS semantics or historical seals.
No new public raw-IS API, retained table, migration or frontend edit. Agents
work on helper/oracle paths; root integrates and runs one grouped hook after
focused tests and actual owned :8096 proof. Shared :8095 and P23/P24 gates
remain separate. [Scope and live ledger](./research_loop/CODEX_BACKEND_GAPS_2026-09-30.md#27-codex--independent-raw-is-qualification-2026-10-02).

**Scoped backend proof delivered:** weekly `rrun_03727c86cc06ad5067890e95182e3445`
and monthly `rrun_627bd475a5c4ae273cdc54e1d3e391b9`, same actual worker image,
both COMPLETED/READY. Weekly 168 IS rows prove typed zero variance and old
same-window OOS parity; monthly **720 IS rows / 29 daily returns**, AVAILABLE
Sharpe/distribution, independent raw-input numerical/hash/bounds oracle and
Hub/Report parity PASS. Private witnesses persist before scratch retirement;
no public raw-IS route/table/migration, seal rewrite or new FE mapping.
[Complete evidence, image identities, failed-attempt truth, existing FE handoff
and C4](./research_loop/evidence/P13/B8_INDEPENDENT_IS_ORACLE_2026-10-02.md).
One normal grouped hook gates the coherent commit. Preserve Claude's commits.
Capture restored false, cell down without volumes, 0 active jobs/sessions;
21 identities remain disabled. G-21/G-22, actual VN profile/source facts and
P23/P24 remain distinct; no push, production or shared :8095 action.

#### Group 6 continuation — profile contract parity and VN observed-date index

**IN_PROGRESS**, 2026-10-02. First repair the genuine Claude §26 contract
drift: the published admission catalogue must include the fourth causal/
inner profile already present at runtime. In parallel, qualify bounded VN
daily index infrastructure using the installed HMD reader, source-local
midnight labels and ordinal observed warmup. Calendar/session/instrument
authority stays typed absent; no 24/7 expected-bar inference.

Three agents own disjoint helper/contract/review paths; root integrates,
records an independent real source oracle and runs one coherent commit hook.
This does not activate a VN execution profile or close its P08→P10→child→P05
product gate. Existing Binance index revisions and profiles stay unchanged;
no FE, remote, production or shared :8095 action.
[Scope, required negatives and next vertical step](./research_loop/CODEX_BACKEND_GAPS_2026-09-30.md#29-codex--published-profile-parity-and-observed-vn-daily-index-2026-10-02).

**Scoped source infrastructure delivered:** exact four-profile generated
admission parity and observed VN V2 index/source-time/ordinal-warmup contracts.
Independent installed HMD oracle **661 FPT observations / 32 queries / 139
runs**, 300-predecessor/holiday/outside-range checks PASS; original UTC V1
bytes remain. [Receipt, tests, failures, C4 and FE handoff](./research_loop/evidence/P08/B8_VN_OBSERVED_INDEX_AND_PROFILE_PARITY_2026-10-02.md).

Bounded observed provider is implemented without default activation: actual
direct-reader OHLCV proof matches **661 warmup+analysis rows** and a holiday
tape of **303 rows**, with exactly 300 observed predecessors. Final focused
source/index/adapter regressions **156 PASS / 1 opt-in SKIP**. P08/P10/profile
and product proof remain the next vertical gate; do not duplicate the source
adapter or infer a session calendar from its available observations.
VN provider/profile/product activation remains the next exact vertical step;
do not infer calendar/instrument/execution authority from index availability.
Claude corrected/withdrew G-23 at `1bcee81a`: capacity 503 requires same-intent
retry and the later causal run completed. No automatic dispatch is added.
Goal/six groups/P23/P24 are not marked complete by source helper receipts.

#### Group 6 continuation — observed VN fixed product vertical

**IN_PROGRESS**, same approved scope. Reuse the verified observed VN provider;
add one exact immutable fixed profile, qualified source-aware composition,
P08 ordinal warmup/observed quality, then P10→child→P05→named reads/Replay.
Old profile/AV/seal bytes and UTC/365 analytics remain unchanged. Calendar,
session and instrument authority remain typed absent, never inferred from
available bars. Python and Control agents own disjoint paths; root owns the
additive migration, owned :8096 product proof, C4, one grouped hook and landing.
No frontend, shared :8095, production or remote push. Helper receipts alone
do not close this vertical or the six-group goal.
[Exact scope and exit evidence](./research_loop/CODEX_BACKEND_GAPS_2026-09-30.md#30-codex--observed-vn-fixed-product-vertical-2026-10-02).

#### Approved six-group backend closeout — actual VN product and exact Compare

2026-10-02: **SCOPED_BACKEND_ACCEPTED for groups 1–6**, superseding earlier
IN_PROGRESS checkpoints above, not a full Research/FE/P23/P24/release verdict.
Observed FPT fixed run `rrun_df77613b0f4ceb2dd069935f61ae75e2` is
COMPLETED/READY through real P08→P10→isolated QuantBT 1.1.1→P05→API.
Six named screen reads 200; 107 OOS rows over seven bounded replay pages;
independent installed HMD reader matches all 568 snapshot rows (300 observed
warmup + 268 analysis) and every retained OOS OHLCV/timestamp. Two actual
wrong-source/clock negative requests refuse. Runtime profile, generated
Foundation admission catalogue, P08 source metadata and downstream custody
now agree; no package/kernel or historical AV/seal bytes changed.

Real product tests found five Control/source integration defects, fixed with
strict profile guards and regressions. Original failed runs/evidence remain.
Hub's new optional observed-only quality scope preserves unknown gap counts
as null. A receipt-only assertion was corrected and resumed under a distinct
read-only proof label, reusing the successful run rather than executing it
again. [Exact hashes, receipts, tests, failures and Claude handoff](./research_loop/evidence/P10/B8_VN_FIXED_PRODUCT_VERTICAL_2026-10-02.md).

Requested R-WFO-020↔023 and 022↔023 Compare pairs now have **4/4 actual GET
proof**, both orders; same key/common-window correlation and per-run
annotations. [Read-only proof and exact QA-session cleanup](./research_loop/evidence/P20/B8_EXACT_COMPARE_PAIRS_2026-10-02.md).
G-20/G-22 closed and G-23 withdrawn by Claude's common-branch correction;
preserve those commits, no auto-dispatch. Generated VN coverage/source types
need frontend binding, not invented calendar completeness. Remaining FE
return-basis labels, genuine source omissions, P23 candidate/load/restore/
engine-two and P24 signed rehearsal stay distinct.

[Full six-group reconciliation, source exclusions and next gates](./research_loop/CODEX_BACKEND_GAPS_2026-09-30.md#31-six-group-backend-reconciliation--2026-10-02).
C4 complete: only owned :8096 stopped/removed without volumes; VN flags false,
0 active test jobs/sessions, 21 disabled test users, owner anchor and all
source/DB/artifacts/receipts/backups/rollback images retained. Root 207.5 GB
free, NO_ACTION_NEEDED beyond exact teardown. One grouped mandatory commit
hook; no frontend edit/build, shared runtime restart, push or production.

#### Claude W1/W2 request slice before P23 — 2026-10-03

**IN_PROGRESS**, baseline `b2098a81`, Codex `codex/be-gaps` only before
landing on the shared Research branch. This is not a new campaign or a
P23/P24 acceptance claim. Keep all accepted six-group receipts and Claude
W1/W2/W3 frontend commits; no remote push or dev/main/production change.

[Backend queue §32](./research_loop/CODEX_BACKEND_GAPS_2026-09-30.md#32-codex--claude-w1w2-backend-requests-before-p23-2026-10-03)
owns the exact scope: G-25 canonical Library label search (migration 091),
G-26 immutable Journey v5 (migration 092), fresh-WFO RC canonical Report
revision, and source-backed optional W1 status/failure/ordinal display facts.
Three disjoint agents handle Library, Foundation and RC; root integrates
contracts, preserved private source/seal identities, actual named read proof
on owned :8096, C4 cleanup and one grouped mandatory hook. No frontend
recomposition, re-record or QuantBT rerun is needed for read-only fixes.

Exit requires source/Zod/OpenAPI/generated agreement, historical/negative/
workspace/ETag tests and actual API proof where applicable. Claude consumes
the generated handoff and takes browser receipts afterward; source absence
does not become zero. Only then resume the already-listed genuine P23 gates.

**Delivery addendum — SCOPED_BACKEND_REQUESTS_ACCEPTED.** G-25/G-26,
W2-RC-01 and optional W1 B-1…B-5 now have generated contracts, focused
regressions and actual owned :8096 read evidence. The final candidate returned
15 valid named GETs, expected foreign-workspace 404 and ETag 304; immutable
Report/RC/retained digest unchanged, QA session logged out. Disposable P12
17/17 includes historical and concurrent-label consistency with bounded
write-side migration 093. RC 52/52 and root selection/Hub focus 74/74 pass.
[Delivered fields, exact image/hash, tests, C4 and Claude handoff](./research_loop/evidence/P21/W1_W2_BACKEND_REQUEST_CLOSEOUT_2026-10-03.md).
This addendum supersedes the checkpoint, not earlier accepted W1/W2/W3 UI.
One normal grouped hook gates commit/landing; no frontend code/baseline or
shared-preview/production change. C4 done without deleting volumes/data;
0 jobs/QA sessions, test identities disabled, owned cell removed. Claude
consumes the generated fields and takes browser receipt; P23/P24 retain their
separate genuine gates. No remote push is authorized by this delivery.

#### Broad backend request reconciliation before P23 — 2026-10-03

**IN_PROGRESS**, Codex `codex/be-gaps`, baseline `d1e0b839`; Bobby requests a
wide queue/audit/Unified cross-check, then closure of overlooked requests.
Three independent audits confirm §31/§32 accepted scopes are not reopened by
old OPEN rows. The actionable F2b/F3/B4 leftovers are Atlas typed reason codes,
Replay exact window/alpha binding metadata, P19 promotion fold/approval links
and logical-attempt presentation labels. Each joins existing facts; absence,
old seals, source authority and validators remain explicit.

[Queue §33 — exact ownership, bounds, required tests and remaining gates](./research_loop/CODEX_BACKEND_GAPS_2026-09-30.md#33-broad-request-reconciliation-before-p23--2026-10-03).
Root owns shared snapshot/docs and the grouped mandatory hook; domain agents
own disjoint backend/contracts/tests. No frontend edit, new engine run,
shared preview mutation, remote push or dev/main/production change. Claude
receives generated-field mapping and the still-unfixed legacy export
prepare→download consumer gap; do not weaken workspace/admin/CSRF guards.

The distinct remaining P23 gates are latest-candidate load/SLO, exact
historical test-store custody, engine-two T07/T13, independent WFO recompute,
negative/browser and aggregated acceptance. P24 remains downstream. Missing
source facts are typed, not an automatic request to upgrade QuantBT; a
historical audit alone is not a new implementation gap.

**Delivery addendum — SCOPED_CODE_ACCEPTED, not P23/P24/product GO.** The
broad read reconciliation adds Atlas typed absence/condition codes, Replay
window/alpha navigation in both lanes, exact P19 approval disclosure and
logical-attempt labels. It also fixes a newly confirmed S05 correctness bug:
QuantBT retained fold ends are inclusive observed bars, so a shared endpoint
is overlap; a one-bar window is valid. Split's HTTP ETag changes independently
of existing source/Report/RC pins. Source manifests/seals and all frontend
bytes remain untouched. Lineage uses immutable P22 receipt authority, no new
Governance grant; actual disposable PG 4/4 covers role and binding negatives.

[Full reconciliation, test limits, generated types and Claude mapping](./research_loop/evidence/P21/BROAD_REQUEST_RECONCILIATION_2026-10-03.md)
and [backend queue §33](./research_loop/CODEX_BACKEND_GAPS_2026-09-30.md#33-broad-request-reconciliation-before-p23--2026-10-03)
supersede stale statuses without deleting the original audit. The normal
grouped hook gates landing on `docs/research-loop-plan`; no remote push,
frontend rebuild, engine rerun, shared preview or production change.

Still genuinely open: BR-F3-02 applied purge/embargo proof (not an alias of
disjointness); P23 coherent candidate/load, original lost historical test
bytes, actual engine-two T07/T13, independent WFO recomputation and remaining
browser refusal/DR acceptance; then P24. Legacy export consumer remains a
Claude frontend handoff. BR-F3-04 old subtitles are superseded by W4B;
BR-F3-05 uses actual P11 artifacts, never ten fabricated rows. Fixed IS is
already served/consumed, while unavailable WFO IS/holdout stays typed.

Full official regeneration also reproduced/repaired an order-dependent
schema drift: the later metrics amender dropped Lineage's existing causal
source enum while runtime/type retained it. Canonical generator + published
regression now preserve that supported source. No engine data or authority
was widened, and no accepted causal implementation was removed.

**Pre-landing public-boundary correction:** the first normal hook refused
new Replay `source_locator` via the existing RS-03 anti-leak assertion.
Replay instead exposes strict public fact-class `basis` enums; no private
path/host/relation or weakened assertion. The failed attempt remains in the
receipt, and focused RS-03/Replay/contract tests plus the normal hook retry
must pass before landing. All immutable source/cursor/Report/RC pins remain
unchanged.

#### BR-F3-02 applied temporal guards — Bobby-approved, 2026-10-03

**IN_PROGRESS**, Codex backend lane. Compare retained purge/embargo windows
and configured counts to the exact sealed observation-index positions;
publish independent PASS/FAIL/NOT_CHECKABLE guards, including per-fold
counts and verified dataset-tail clipping. Disjoint train/test windows are
not an applied-guard proof. Historical missing facts stay NOT_CHECKABLE.
[Scope, tests and handoff](./research_loop/CODEX_BACKEND_GAPS_2026-09-30.md#34-br-f3-02--applied-purgeembargo-proof-2026-10-03).
No UI/immutable-source rewrite, HMD scan/compute, shared :8095, production,
push or P23/P24 acceptance is implied.

#### W5 causal cursor / RC structured numbering — Bobby-approved, 2026-10-03

**IN_PROGRESS**, exact real-read defect, not an engine upgrade. Retained causal
run handoff exposes progress ordinal 6 but Search/Freeze select local trial 3;
RC structured numbering is absent. Correct the public navigation projection
with typed source/study/scope, preserve the private journal and progress
counter, and reuse RC's existing number field. Missing bindings stay typed
absent. [Scope and actual before receipt](./research_loop/CODEX_BACKEND_GAPS_2026-09-30.md#35-w5-causal-navigation-and-rc-numbering--bobby-approved-2026-10-03).
Claude receives generated types/consumer instructions; no UI redesign, source
seal rewrite, optimizer, shared preview, remote push or P23/P24 verdict.

**Delivery addendum — BR-F3-02 and the two W5 backend issues accepted.**
Same-seal retained/native applied purge/embargo proof now exposes independent
verdicts/counts and verified tail clipping; absent historical facts remain
NOT_CHECKABLE. The actual causal handoff mismatch is corrected only in its
public projection: local trial 3 · STUDY_LOCAL, counter 6 retained separately.
RC reuses its existing selected number and adds typed scope/source/study,
without duplicate ordinal or parsing a rail. Private journal, source seals,
Report and RC pins remain unchanged. Only the Split representation ETag changes.

[Canonical packet — exact images/receipt/hash, tests, limits and Claude handoff](./research_loop/evidence/P14/BR_F3_02_APPLIED_GUARDS_AND_W5_NAVIGATION_2026-10-03.md).
Four actual retained runs, installed QuantBT 1.1.1 native oracle and 22
controls pass, including causal/global read parity and 401/404/304. Focused
Control 88/88, contract 7/7, official generation/snapshot; one normal grouped
hook gates landing. C4 complete without volume/data deletion: zero jobs/QA
sessions, 21 disabled test identities, owned :8096 containers/network removed.
No frontend/shared :8095/production/remote changes. Claude owns the browser
round trip; coherent P23 load/DR/engine-two/independent-recompute and P24
remain separate. Do not reopen this applied-proof item from a stale OPEN row.

**Pre-landing hook correction:** contracts 260/260; Control's first grouped
hook found one old W7 exact RC expectation missing the three new scope/native
fields (1,830 pass, one fail, one existing DR skip). The test asserts them
exactly, not via a weakened partial match. Public causal ordinal range is
also checked against its existing schema; W5/W7 focused 29/29 and build pass.
Corrected-image read receipt and normal hook retry gate the same landing.

#### P23 mixed-load + historical-manifest exception — Bobby approved, 2026-10-03

IN_PROGRESS, Codex backend only: reduce Library/Progress to the existing
500-ms mixed-load target, preserving actor/workspace RLS, finite admission,
exact DTOs and source freshness. A real dirty diagnostic still failed; SQL
stage profiling found repeated synchronous card projection as the Library
bottleneck. Same-object immutable projection reuse and coalesced Progress
transaction settings are implemented; clean-candidate acceptance is pending.

The exact three old disposable-test manifest losses are handled through a
bounded historical exception ledger, never fake recovery. Each still has
one retained DB seal and one frozen Report, not zero dependencies; retention/
RC/publication/promotion/selection/exposure/audit pins are zero. Preserve
those copies, expected digests and all original failures. Exact-set accounting
must not change default strict integrity or make full-store integrity PASS.

[Scope, actual diagnostic, fixed IDs/digests, tests and C4 requirements](./research_loop/evidence/P23/MIXED_LOAD_AND_HISTORICAL_MANIFEST_EXCEPTION_2026-10-03.md).
Retake only affected mixed-load/DR gates in owned :8096; shared :8095,
frontend, production and remotes stay unchanged. Other P23/P24 gates remain
separate. No source seal/DB history/artifact deletion or remote push.

**Final scoped delivery — MIXED_LOAD_PASS / HISTORICAL_EXCEPTION_ACCOUNTED,
not full P23/P24 GO.** Code candidate `b90a36a9` retains Claude's `23ef532e`
and `a163af4b`. Real clean retake: Library **538 → 499 ms**, Progress
**568 → 403 ms**, targets unchanged 500 ms; all 120 GET 200, one real WFO
completed, one heavy/four queued intents, 738,488,320-byte measured peak.
Library is only 1 ms below target, not an extended capacity/soak claim.

Coherent restore: 151 tables, 886 part records, 3,521 files, **83 verified /
86 sealed artifacts**. Three exact old test manifest losses are transparently
accounted for; no newly fabricated bytes, reseal, deleted history or changed
digest. One retained DB seal + one Report per missing run remains disclosed.
Restore parity and exact exception accounting PASS; **full-store byte
integrity stays false and strict CLI exit 1**. This does not silently exempt
missing bytes from the full integrity gate.

Focused tests/build and normal code hook passed; C4 finished with 21 QA
non-owner accounts disabled, 0 active QA sessions/nonterminal jobs and 0 owned
containers/networks. All original/restore data and backups/images retained;
~30% disk free, no swap, NO_ACTION_NEEDED for cache deletion. No frontend/API
change, :8095/production/remote action or unrelated retest. Full historical
byte recovery, engine-two/recompute/browser and P24 remain separate.
[Final receipt and hashes](./research_loop/evidence/P23/MIXED_LOAD_AND_HISTORICAL_MANIFEST_EXCEPTION_2026-10-03.md#5-clean-candidate-and-exact-immutable-image-set).

#### P23 remaining work / P24 read-preserving acceptance checkpoint — 2026-10-03

**Codex backend DELIVERED in scope, not full P23/P24 GO.** Independent direct
QuantBT 1.1.1 WFO on the identical historical snapshot passes 2,208 exact
equity/time rows, six native metrics, 13/3 counts, selected parameters and
four BFF metrics (all differences 0). No production runner self-oracle or
new job/seal/image build. [Exact receipt](./research_loop/evidence/P23/WFO_DIRECT_ENGINE_RECOMPUTATION_2026-10-03.md).

Actual isolated Python producer rollback keeping compatible Control readers
passes: three paused-create 503s, 20 historical reads 200, jobs 243→243,
artifact/seal/migration digest and outside containers/restarts unchanged.
Original configuration restored, worker OFF. Old Control `ee6d220a…` fails
the new analytics seal with genuine typed 503; an offline strict-schema check
confirms this. Current reader `edd22298…` must be retained. A producer-version
drill is not a real second-engine/default/worker execution upgrade proof.

[P24 acceptance packet](./research_loop/evidence/P24/V1_ACCEPTANCE.md) now
holds all 15 required IDs, 20 FND dispositions, unsigned candidate v2,
failure and private-byte hashes, tested rollback/one-page operating checklist
and explicit next owners. Earlier board/manifest/assessment evidence remains
history. Independent recomputation is no longer pending for this admitted
profile; full latest-product candidate/browser/visual/print, engine-two,
historical byte recovery/disposition, full scenario/owner acceptance and
signed release are not marked PASS. No new COR/waiver is invented.

Claude W5 plus baseline commits `1ca9d4ec` / `1f6d8392` are retained; Codex
changes no UI/contract/generated type/schema/migration. Claude finishes
current-product receipts and prepare→download mapping; frozen old P23 web
image is not called freshly rebuilt W5 frontend. Follow [backend queue §37](./research_loop/CODEX_BACKEND_GAPS_2026-09-30.md#37-p23-independent-wfo--p24-read-preserving-rehearsal--2026-10-03)
without reopening accepted gates from stale historical rows.

C4 verified: 0 active QA sessions/nonterminal jobs, 21 non-owner QA accounts
disabled, owner anchor retained; 0 owned :8096 containers/networks, all data/
restore volumes/backups/rollback images kept. ~30% disk free, swap 0,
NO_ACTION_NEEDED for cache deletion. Grouped focused tests + one normal hook,
no repeated load/restore/unrelated rebuild. No origin/primus-origin push,
dev/main merge, shared :8095 change or production/signed-workflow dispatch.

#### Goal continuation — pinned P22 reader receipt, 2026-10-03

Baseline `2cf6b904` contains backend `d5d09875` and the latest Claude W1–W5
source/baseline commits. Codex owns the approved **Control API-only** preview
rebuild and GET proof of R-WFO-022/023/027; all worker/web/Python/volume and
Governance rights remain unchanged. Source tested is not runtime accepted.
Old candidates are neither resealed nor republished. See [queue §38](./research_loop/CODEX_BACKEND_GAPS_2026-09-30.md#38--active-goal-continuation--p22-reader-runtime--2026-10-03).

This slice does not close linked `AUDIT_OF_SELECTION`, whole P23/P24,
three lost historical manifest bytes, second-engine qualification or signed
release. Reuse unaffected receipts; record exact service images, responses,
temporary-session cleanup and custody invariants before claiming runtime PASS.

**Delivery: P22 §31 GET reader runtime accepted on clean `2cf6b904`.** Six
actual schema-parsed GETs prove stale-reason/action agreement and native RC
ordinal/scope, retaining R-WFO-027's publication and independent R1 read
denial. Jobs 65→65, seven custody-table hashes unchanged; only Control API
container replaced and existing nginx upstream DNS reloaded. Exact temporary
session revoked, old candidates untouched. Source-stamp loss via sudo was
fixed without generic environment preservation or flag/permission changes.
[Runtime receipt / first failed-helper probe / private hashes / C4](./research_loop/evidence/P22/READER_RUNTIME_RECEIPT_2026-10-03.md).

This closes only the goal's P22 reader rebuild/GET obligation. Keep linked
audit, same-candidate P23, historical-byte recovery/disposition, second-engine
proof and P24 acceptance/release in the queue. No stale "reader not deployed"
claim, no whole-product GO, no frontend or remote/production action.

Mandatory-hook concurrency finding: a fixed contracts-test container name
collided with a foreign invocation; unconditional cleanup was unsafe. The
test helper now uses a per-invocation name and verifies ownership before
removal (3 focused stubbed-isolation cases). Do not kill foreign tests or
misreport the failed hook as PASS; retry the normal hook after the correction.

**Active-goal continuation — linked final audit, 2026-10-03.** P22 actual
reader receipt landed as `b4a6d767` (9 owned files, +518/−3), normal hook PASS,
shared Research FF; no push/deploy. Codex next implements original-byte-pinned
Delta evaluation with zero optimizer trials underneath the existing confined
child. Browser admission/budget/worker/retention/Report/RC and a real child
receipt are still required; the evaluator alone is not product GO. Preserve
per-fold targets rather than using the last causal selection. See backend
queue §39 for exact scope, negatives and remaining full-goal gates.

**Linked audit implementation checkpoint — 2026-10-03.** Authenticated named
GET/POST, actor-bound original snapshot metadata, shared quota, confined
zero-optimizer evaluation, P05 byte/fence ACK, immutable proof migration 094
and additive Report/RC/Lineage contracts are implemented in Codex's owned lane.
Focused Control 61/61, RC 22/22, disposable PG 5/5, native Python 21/21 and
canonical 5/5 pass; the normal hook/landing and actual product admission→child
→retention→read receipt remain required, not fixture-derived GO. Frontend
stays untouched. [Generated-operation handoff, limits, failures and C4](./research_loop/evidence/P23/LINKED_PINNED_AUDIT_IMPLEMENTATION_2026-10-03.md).
Preserve all latest Claude commits; remaining full P23/P24/DR/engine gates
and no-remote-push scope are unchanged.

**Linked audit runtime correction — 2026-10-03.** Implementation landed as
`576a32fe`, preserving Claude FE through `a9ff796a`. Actual owned-cell audit
admission/native/P05 ACK found a terminal routing bug: the child incorrectly
entered the fixed Report sidecar and stayed RUNNING despite its persisted
completion. Correct its exact profile routing/CPU cap, recover the same journal
without another engine execution, and keep the non-reusable gate distinct:
this parent was actually reusable. Also enforce the already published import
filename bound of 128, preventing invalid input from masquerading as an
upstream-502 case. Focused 25/25 plus Control compile PASS; normal hook and
runtime recovery remain pending. No FE, shared worker, source seal, remote or
production mutation. [Failure hashes, correction and full remaining scope](./research_loop/evidence/P23/LINKED_AUDIT_TERMINAL_RECOVERY_2026-10-03.md).

#### Current candidate audit/502/restored-browser delivery — 2026-10-03

**SCOPED_RUNTIME_ACCEPTED; full P23/P24 OPEN.** Shared/backend `4bc9cefe`
preserves Claude `59d76862` / `2f4cb81a`; 7-file correction +144/-5,
267 contracts and 1,883 Control PASS / one named skip through normal hooks.
Real existing child READY with verified P05 ACK, zero optimizer, idempotent
replay and additive Report/RC/Lineage proof; parent custody unchanged.
That parent is reusable, not the requested historical non-reuse case.
R-WFO-020 is located with nine genuinely absent generation facts and intact
selection; its bounded owned-clone run is next.

Real upstream failure produces JSON 502; S14 at 1280/660 renders it without
new jobs/imports. Coherent restored DB plus forward migration 094 passes
30/30 renders and 28 named GETs; current image/index/bundle hashes equal.
No mock, all-action/HiFi assertion, strict-83/86 integrity waiver or new
audit-proof restore claim.
[Receipts, failures, candidate pins and full remainder](./research_loop/evidence/P23/CURRENT_CANDIDATE_AUDIT_502_RESTORE_BROWSER_2026-10-03.md).

P22/load/502/restored-read acceptance is reused, not reopened from old rows.
Still required: non-reusable original proof, three original lost manifests
or explicit disposition, genuine second engine, P24 whole-product/release.
No FE/push/dev-main/production action. C4: zero active QA sessions/nonterminal
jobs, 21 disabled non-owner accounts; cell down without -v, data/backups/
rollback images kept, 181 GiB free, cache prune NO_ACTION_NEEDED.

#### Original non-reuse audit / affected-reader cost — 2026-10-03

**NON_REUSE_PRODUCT_ACCEPTED; READ_COST_REPAIR_PENDING; full P23/P24 OPEN.**
R-WFO-020 has an actual pinned child in a fresh owned clone: 9 folds/2,484
bars, optimizer 0, one idempotent child/outbox, P05 verified ACK and Report/
RC/Lineage proof. Parent frozen custody unchanged. New proof survives restart
and fresh restore with worker OFF/no engine rerun. Shared :8095 data/worker/
identities unchanged. This supersedes execution pending, not per-fold profile
limits or historical 83/86 strict-integrity failure.

New affected-only load: twenty distinct readers, 120/120 GET 200, Report p95
**547 ms**, RC **1,710 ms** versus unchanged **500 ms** targets. Repair: one
coherent RC RLS snapshot and reduced shared-proof planning complexity;
fresh membership/all source pins/immutable hashes/public DTOs retained.
Six focused files 92/92/build PASS; normal hook and clean-image retake pending.
No frontend/migration/budget/source seal/remote change.
[Exact evidence, private hashes, frontend handoff and C4 plan](./research_loop/evidence/P23/NONREUSABLE_ORIGINAL_AUDIT_AND_READ_COST_2026-10-03.md).
Fresh isolated QA/cell remain owned pending retake/cleanup. Goal retains
original lost bytes/disposition, engine two, P24/product/signed-release gates.
Reuse unaffected PASS; rebuild only changed Control, not the whole stack.

#### Exact-current JSON read-cost continuation — 2026-10-03

Backend/shared clean `4b845a3a`; normal hook 1,889 Control PASS / one named
skip. Control-only clean image passes identity/compiled/mount isolation, but
the **actual** affected 20-reader retake remains FAIL: Report 541 ms, RC
1,752 ms, targets 500 ms; 120/120 GET 200, no implicit compute/proof change.
This supersedes the pending first retake, not the SLO gate itself.

Codex repairs duplicated canonical/schema CPU, with exact-current-JSON,
bounded pure-calculation reuse and fresh per-request RLS/source/proof reads.
Canonical/DTO/hash/financial/authority semantics, source seals and Claude UI
stay unchanged. Normal coherent hook plus new clean Control-only retake and
exact QA teardown remain required. [Receipt, failures and generated Claude
handoff](./research_loop/evidence/P23/EXACT_JSON_READ_COST_REPAIR_2026-10-03.md).
No FE/push/dev-main/shared :8095/production action. Three lost original
manifests, engine-two qualification and full P24/owner/release stay OPEN;
do not recreate already accepted linked-child/P22/JSON502/restore work.

#### Exact-current 69b5a81c runtime retake — affected RC still open

Normal hook 267 contracts / 1,929 Control PASS / one named skip; clean shared
landing, Control-only build and eleven compiled hashes accepted. Actual
20-reader/120-GET retake preserves proof/core/fingerprint/jobs: Report **382 ms
PASS**, RC **510 ms FAIL**, unchanged target 500 ms, 438,124,544-byte peak.
Existing earlier failures stay recorded. Minimal residual query/verification
correction and its clean affected retake/C4 are in the
[same receipt](./research_loop/evidence/P23/EXACT_JSON_READ_COST_REPAIR_2026-10-03.md#5-clean-69b5a81c-retake--actual-partial-improvement).
No API/UI/financial/authority/SLO/budget change, remote push or production
action. Full P23/P24, strict historical 83/86 and engine two remain OPEN.

#### Clean 128276d7 acceptance / workspace consumer / C4 — 2026-10-03

**Owner amendment 2026-10-04 — affected frontend read acceptance PASS:** Bobby assigns
Codex the S09/S11 workspace binding and linked-final-audit consumer. Preserve
the accepted composition, CSS, print core, all original seals and current
membership/producer authorization. Propagate explicit `workspace_id` through
reads/writes, pack redirects and contextual links; remount on scope changes
and reject obsolete responses. Consume the generated named audit GET/POST,
server `may_create` and original target digest, never POST on mount or infer
verification from READY. Focused route/client/intent/refusal tests, exact web
build and restored-proof browser at 1280/660 are the affected acceptance.
Reuse unchanged Control/read-cost/engine proof; no unnecessary optimizer run.
Recheck original-byte recovery locations and actual second-engine pins.
Missing manifests or a second qualified engine remain independent gates;
this assignment is **not** an integrity exception or an upgrade-test waiver.
No push, production change, global styling or shared :8095 operation.

Delivered **285/285** affected FE tests, official Node-22 web build and actual
restored-proof **S09/S11 1280/660, 4/4 PASS**. Explicit member workspace reads
200; original frozen Report/VERIFIED proof/jobs unchanged; foreign workspace
refuses and refresh/navigation creates no child. Lost-response POST intent
and pack redirect are focused tests, not a fresh browser allocation claim.
HiFi reference browser captures retained, no baseline re-record. Two fresh
QA disabled/revoked; cell containers/network 0 and shared worker unchanged.
Exact original-ID scans of five additional artifact volumes find no matching
manifests. Strict **83/86**, second qualified engine and full P24/release
remain independent; owner inputs requested, not assumed. [Detailed receipt](./research_loop/evidence/P23/WORKSPACE_AND_LINKED_AUDIT_CONSUMER_2026-10-04.md)
and [unsigned candidate v4](./research_loop/evidence/P24/current-source-candidate-manifest.v4.json).

**Historical 2026-10-03 checkpoint retained below** (later amendment above wins):

**AFFECTED_READ_SLO_ACCEPTED; RESTORED_WORKSPACE_BROWSER_FAILED; full P23/P24 OPEN.**
Normal source hook 267 contracts / 1,930 Control PASS / one named skip.
Control-only clean identity and eleven compiled hashes accepted. Same twenty
QA actors: 120/120 GET 200, **Report 377 / RC 487 ms**, original 500-ms SLO,
435,445,760-byte peak; original custody/core/fingerprint/jobs/proofs unchanged.
This supersedes preceding read-cost FAIL/pending, not a whole-product GO.

Affected restored-proof S09/S11 browser returns 404: real same-actor GETs
prove personal-default 404 versus explicit authorized workspace 200. Backend
fresh membership enforcement is correct. **CG-P23-WORKSPACE-01 belongs to
Claude**: existing workspace options must propagate through route reads,
writes, pack links, deep links and cache invalidation. No RBAC fallback,
owner reset, source mutation, frontend edit or baseline change was used.
Generated linked-audit operations/proof still need product consumption.
[Full hashes/failure/handoff](./research_loop/evidence/P23/CURRENT_CANDIDATE_CLOSEOUT_AMENDMENT_2026-10-03.md).

Current C4 completed: clone 21 / restored snapshot 1 fresh QA disabled,
active QA sessions/compute 0, owned containers/network/temporary PG 0;
copied queued source history and all volumes/backups/bytes/images retained.
Root free 193,546,948,608 bytes / RAM available 12,798,124,032 bytes / swap 0,
cache prune NO_ACTION_NEEDED; source/shared :8095 worker unchanged.
[Candidate v3](./research_loop/evidence/P24/current-source-candidate-manifest.v3.json)
preserves v1/v2 and all original receipt scopes. Claude FE code remains
59d76862/2f4cb81a; d0569d49 adds only evidence JSON, not missing FE code.

Remaining actual gates: current restored cross-workspace browser consumer,
linked-audit product binding, strict historical 83/86 or Bobby disposition,
real qualified engine two T07/T13/P24-T05, full P24 field/action/scenario /
owner acceptance and authorized signed release. No remote push/dev-main/
production action or new phase; reuse unaffected accepted gates.

#### P24 §32 backend review/repair and Portal v2.0.0 target — 2026-10-04

**SCOPED_BACKEND_DELIVERED / FULL_PRODUCT_ACCEPTANCE_OPEN.** Latest addendum
supersedes stale observations above only in its scope. All six Claude commits
through `3fdd3349` are ancestors of `docs/research-loop-plan`; no frontend code
was replaced. Claude's 73-cell matrix is 613 PASS / 0 FAIL / 69 N/A; full lane
is 227/228, not 228/228. S06 isolated 3/3 does not erase the full-load flake.
Their 182/18/75 reconciliation includes expected old immutable pins as well
as digest-scope/time defects; do not call all 18 expected old-seal failures.

Bobby's next **Portal release target is v2.0.0**, including Research Loop
V1.1. Current stable Portal v1.1.1 and pinned **QuantBT 1.1.1** are different
version namespaces. This release target does not imply a QuantBT version
change. Preserve the open 1.1.0→1.1.1 Portal-transition experiment/gates until
actually bound/exercised or explicitly disposed; no false upgrade PASS.

Codex publishes Compare preflight/source manifest scopes, current-source
fact/presentation revision metadata, Report's archived revision scope,
nullable no-intent publication timestamp, and Report/RC audit applicability.
OpenAPI/types/fixtures regenerated; source seals and existing revision/cursor
semantics unchanged. Claude consumes the generated fields; null audit target
must not probe, and true applicability still is not permission to create.

One new **real imported fixed-profile** run on owned :8096,
`rrun_1a6f4a85f2f43a659ac9727607acb6bf`, proves DRAFT import → preflight
(missing pin refused / exact pin admitted) → confined QuantBT 1.1.1 child →
retention → seven downstream reads 200. No executor widening or production
flag change. Report/RC return `final_audit_applicable: false`; DRAFT still
cannot seal/publish. This does not replace final-candidate browser evidence.

Focused executions 126 PASS; mandatory coherent commit gate recorded in
[the §32 receipt](./research_loop/evidence/P24/CODEX_SECTION32_REVIEW_AND_REPAIR_2026-10-04.md).
Two new isolated QA disabled/revoked, active sessions 0; owned cell containers/
network 0, historical queued undispatched fixture and all volumes/bytes/receipts
retained. No remote push, dev/main merge, shared :8095 restart or production
operation. Remaining: affected FE mapping/reconcile/browser journey, transient
sparkline observations, S06 flake, 21 scenario receipts, owner/release acceptance.
[Live eight-request disposition](./research_loop/CODEX_BACKEND_GAPS_2026-09-30.md#32-codex-response--2026-10-04).

**Same-slice sparkline finding corrected in backend:** the intermittent 503
is a real query timeout, not stale-seal refusal. Exact authorized RLS reads
measure old 1,399–1,469 ms versus scoped materialized fold bounds 14–21 ms;
151 rows and their digest match. Product 1,500-ms timeout, scope, inclusive
OOS bounds and sampling remain unchanged. Library focused tests 45/45 PASS.
The shared preview was not deployed; take the affected HTTP/reconcile receipt
after its final single-candidate rebuild. Initial mandatory gate was not green;
additive P04 applicability golden handling corrected without rewriting seal/
baseline bytes, with focused golden PASS. Coherent corrected gate required.

#### P24 approved continuation work order — 2026-10-04

Bobby authorizes finishing the remaining implementation and acceptance in
parallel, inside the existing P24 scope. The landing branch remains
`docs/research-loop-plan`; working lane is `codex/be-gaps`. No remote push,
dev/main merge or production release is implied by this instruction.

| Lane | Exact work | Exit evidence |
|---|---|---|
| Consumer | Generated `final_audit_applicable` controls GET/creation only when true; guard nullable publication time; distinguish Compare source/preflight provenance. Preserve layout, typography, colors and approved baselines. | Affected Vitest + typecheck, real read/browser receipt, no audit probe for false/null. |
| Engine transition | Local, explicitly opted-in and independently pinned QuantBT 1.1.0 compatibility binding; default 1.1.1 unchanged. Validate actual version/native wheel and old in-flight provenance, reproduction and rollback; no false 1.1.1 stamp. | Actual confined Portal child/retention and version-transition receipt; unsupported profile refused. Direct-wheel comparison alone is not PASS. |
| Scenario acceptance | Retain all 24 guide §16.6 scenario rows, execute available real cases with explicit input/actor/workspace, HTTP mutation and custody/job oracle; distinguish fixtures and unperformed cases. | Machine receipt per scenario and honest PASS/REUSED/NOT_RUN disposition; no denominator reduction. |
| Integration | One exact candidate on the owned :8096 clone, source/image identity, affected §32 HTTP and browser retake. Reuse unchanged accepted load/DR evidence only in its recorded scope. | Candidate hashes, test results, fresh QA disabled/sessions revoked, exact owned containers/network removed without deleting volumes/data/receipts. |

The separate engine experiment may use its own :8097 cell. Shared :8095 and
Production are not changed. Original seals and the approved exact-three-test
manifest exception remain immutable; strict integrity remains 83/86, not
fabricated 86/86. Portal release target **v2.0.0** is independent of QuantBT
versioning. Owner review and signed production release are separate gates.

**Actual continuation delivery:** isolated Portal 1.1.0 → 1.1.1 → exact 1.1.0
reproduction now completes **3/3 runs**, with **9/9 retained files verified**;
the fixed-profile engine lane of P23-T07/T13/P24-T05 is accepted, not an open
owner question or direct-wheel-only claim. Production/default remains 1.1.1.
The approved exact-three-historical-manifest exception is recorded while
strict integrity remains 83/86. Historical Search400 reader/admission coupling
and conflicting study fields are repaired; actual affected GET retake is
**56/56 checks, 38 responses**, with immutable custody unchanged. S01–S08
workspace forwarding, all subordinate named reads and RC lookup scopes are
corrected without CSS/layout/baseline changes. Final browser/positive imported
run/C4 evidence and exact remaining scenario branches are consolidated in
[current-candidate closeout](./research_loop/evidence/P24/P24_CURRENT_CANDIDATE_CLOSEOUT_2026-10-04.md)
and the linked lane receipts. This does not authorize a remote push or call
the full 24-scenario/owner/signed-release denominator green.

**Final independent review / actual imported continuation:** one new real
imported DRAFT child `rrun_534c60ecb6337bb1503e48f8726142b7` completed on the
owned clone, seven named downstream API reads200 and Progress→Report→RC
browser3/3 PASS (API actor97, member reviewer99, not a full GUI-import receipt).
S06 mobile read-load gives240/240 HTTP200 in the consumer lane; it is one
principal with20 concurrent lanes, not a replacement for the W06 user/SLO gate.
Retaken workspace cold-links and breadcrumbs retain their actual API/DOM proof.

Actual child found one backend read-truth mismatch: legacy benchmark had null
value but AVAILABLE state inherited from genuine analytics-v2. Fixed to typed
`P13_LEGACY_BENCHMARK_USE_ANALYTICS_V2`, preserving v2 value/source availability.
Focused regression, affected Control-only build and actual authorized GET PASS;
no job allocation68→68. QA95/97/98/99 DISABLED/session0, worker stopped and the
historical undispatched fixture preserved. Independent reviews found no engine
default/production-policy weakening or UI/CSS/baseline changes. Two additional
SC23 consumer defects—unscoped local draft and stale create ACK after edits—are
closed with scoped persistence/relevance fences, not a schema/engine change.
Draft/create affected batch166/166 and TypeScript PASS; last guard/tooltip
retake43/43, no full frontend suite repeat. Persistence requires named actor
and explicit workspace; legacy unscoped drafts are not adopted. No late ACK/
refusal attaches to an edited form, duplicate-submit is synchronously fenced,
and the old accepted job remains discoverable without being cancelled.

The current receipt is the live disposition for these scopes. Remaining
mandatory product branches are GUI producer→effective worker round-trip,
multiuser/CAS/write-state edges, publication timeout before/after ACK, explicit
browser audit allocation and post-child re-export/GC, followed by owner review
and authorized signed release. Existing unchanged backend proofs remain valid;
neither a new phase nor a full load/visual/HMD rerun is required for these docs.

**Final candidate/C4:** [Unsigned source v6](./research_loop/evidence/P24/current-source-candidate-manifest.v6.json)
pins finalWeb/Control/Python and each receipt's real predecessor image/scope;
the SC23 final static smoke is not relabelled as full browser acceptance.
Seven owned containers removed, owned network0, ports8096/8097 free, exact
clone DB/artifact/NATS volumes and all original bytes/backups/rollback images
retained. Shared8095/dev/main/production unchanged. Successful normal grouped
commit is the commit-bound gate; fast-forward landing preserves all Claude
ancestry. No remote push is authorized. Full P24 mandatory scenario and
owner/signed-release acceptance remains explicitly OPEN, not engine-blocked.

#### P24 cinema/declaration and remaining-scenario continuation — Bobby, 2026-10-04

Baseline `de424fad` includes Claude's `5115b34e`, `1c65ff71`, `de424fad`
without dropping any earlier backend or frontend history. Bobby assigns the
following continuation before his detailed visual review. This later work order
supersedes the historical paragraph listing GUI/CAS/ACK/export as unperformed:
those exact branches already have the v6 receipts; do not rerun them merely
because their older narrative still says OPEN.

| Lane / owner | Delivery | Verification / exit |
|---|---|---|
| Codex backend | Source-bound run declaration facts for S03–S05; inspect actual QuantBT/retained sampler facts and publish only what the source supplies, with typed absence/source locator otherwise. | Generated OpenAPI/types/fixtures, focused authorization/provenance tests, exact real named reads; no sampler trace fabricated from trial order or release defaults. |
| Codex consumer | Cinema selected θ* outside the loaded ledger page via bounded named reads; declared-parameter display using Claude's existing presentation. Preserve design/CSS/goldens and the sample as an example unless an actual Bobby-owned source is supplied. | Selected trial beyond100 rows, study/scope identity, stale response/context fencing, no implicit compute, actual browser at1280/660. |
| Codex scenario | Finish the exact missing branches of Guide§16.6 using existing isolated8096 custody plus minimal new Research work where required. | Keep all24 rows; reuse unchanged passed evidence with exact scope/hash; actual results/input IDs/write/job oracles for missing branches. Source-unsupported branches require typed proof, not fake PASS/N/A. |
| Codex integration | Reconcile cinema/sample/declaration ledger, closure packet and candidate; local normal commit and clean FF landing on `docs/research-loop-plan`, then rebuild the existing Research review preview through its helper. | One grouped source gate; only affected build/browser/compute; QA disabled/session0, exact C4 test-cell teardown, retained evidence/volumes. Preserve preview DB/accounts/flags; no remote push/dev/main/production operation. |

Worktree `/home/bobby/portal-research-be`, branch `codex/be-gaps`; no parallel
writer on a shared contract/file. New outcomes are recorded in
`research_loop/evidence/P24/` and the backend queue, then linked from the board.
Portal release target2.0.0 and default QuantBT1.1.1 remain unchanged. Owner
visual verdict and signed release remain separate from this implementation/
scenario assignment. Current state **IN_PROGRESS**, not a pre-claimed gate.
The final review build uses the existing Research preview only after acceptance
and clean landing; it is not permission to change its users, data, network,
feature profile or the other Portal/Execution deployments.

**Actual final delivery:** [current cinema/declaration closeout](./research_loop/evidence/P24/P24_CINEMA_CURRENT_SOURCE_CLOSEOUT_2026-10-04.md)
and [unsigned v7](./research_loop/evidence/P24/current-source-candidate-manifest.v7.json)
now supersede the work-order IN_PROGRESS label for this slice. Source-bound
S03–S05 declaration, exact400-trial Cinema paging, typed sampler evidence and
centroid/no-trial presentation delivered; no Claude design/baseline changed.
Actual1280/660 source trial350, declaration digest matches all3 owning reads;
new GUI audit retry VERIFIED9fold/2508bar, optimizer0, original failed job kept.
All24 scenario dispositions reconciled with actual/technical/reused/refused
boundaries, not24 universal engine PASS. FE439 affected cases, backend/contract
and changed builds PASS; four QA disabled/session0, exact C4 removed only clone
containers/network and retained4volumes. Normal grouped commit/clean FF and
helper-managed review preview follow; no remote push or production release.
State **READY_FOR_BOBBY_REVIEW — current-source bounded scope**. Sampler internal
trace and Bobby canonical sample are not fabricated. Owner visual and signed
Portal2.0.0 gates remain separate. No unchanged gate suite is rerun for docs.

Final source gate hardening: public declarations/sampler carry only literal-enum
`source_ref`; exact source locators stay in evidence, not the browser. Original
RS-03 boundary test retained, targeted real PostgreSQL 11/11 PASS, affected FE
9/9 and contracts7/7 PASS. Changed Control/Web rebuilt once; no new engine job,
load/DR repeat or Python build. v7 retains earlier receipts at their original
wire/image scope and names final public-ref image/bundle separately.

**Owner continuation, 2026-10-05 — canonical Delta/RSI and sampler capture:**
Bobby authorizes a purpose-separated executable reference sample without
waiting for his own source, plus actual confined-child Optuna observation.
This stays in P24, not a new phase. The bounded pure helper loader preserves
sandbox restrictions; the reference does not claim protected-kernel parity.
New runs may publish actual calls/suggestions, not private TPE densities or
reconstructed historical trace. Preserve Claude's composition and baselines.
Plan/tests/delivery: [queue §33 amendment](./research_loop/CODEX_BACKEND_GAPS_2026-09-30.md#33-owner-amendment--canonical-deltarsi-sample-and-sampler-capture-2026-10-05).
State **SOURCE_DELIVERED**; [combined closeout](./research_loop/evidence/P24/P24_CANONICAL_SAMPLE_SAMPLER_CLOSEOUT_2026-10-05.md).
Canonical184-line source with three pure helper classes/seven methods and one
entrypoint; analyzer/child agree and pinned1.1.1 child executes exact bytes.
Actual HMD WFO2fold/3trial/36sampler calls are retained with identical source/
P05/manifest/public hash; actual TS source-block projection PASS. New observed
execution trace is displayed; old seals stay unchanged and private TPE density
is not inferred. Generated additive contract/narrow FE binding preserve Claude
composition/goldens. One normal grouped gate, clean local landing and affected
Research preview build; private runtime/browser receipt path is in the packet.
No remote push/dev/main/stable authorization; no engine upgrade needed for
these two items, no duplicate unchanged load/DR campaign.

**Preview packaging follow-up:** source `be859a1b` landed with normal hook PASS;
the Python rebuild exposed umask-0077 source copied0600/root-owned and therefore
unreadable at UID10001 through PYTHONPATH. Exact old preview images restored,
DB/users/flags preserved. Bounded image-only `COPY --chmod=0755` fixes it without
granting runtime source-write ownership or changing host permissions. This is
the same scope's packaging repair, not an engine fault/new phase. Actual image
permission/readiness/browser proof is in the combined receipt's private path.

#### P23 qualification-ledger and positive sampler product receipt — Bobby, 2026-10-05

Bobby assigns two remaining scoped obligations, without authorizing a release:
(1) reconcile P23-T01…T15 with the latest actual receipts and approved exact-three
historical test-manifest exception, preserving original failures and each image
scope; (2) one short admitted Delta WFO product run on the existing Research
preview, ordinary P08/P10 intake → confined QuantBT1.1.1 child → P05 retention →
named Search BFF → S06 actual browser `execution_trace=AVAILABLE` at1280/660.

Read-only readiness/image/capacity checks precede intake. Maximum one new job,
three trials/two weekly folds on the already-qualified BTCUSDT1h historical
window; no import/activation/publication/command, role/account reset, old-seal
write, runtime restart or new infrastructure. Use ordinary preview actor/session
and revoke only that test session. Compare retained sampler artifact SHA/size,
native study/trial counts and exact DOM text/tooltips with the named BFF; retain
UTC observations/private raw responses/screenshots outside Git. Existing old-run
missing-trace and private TPE-density absence stay distinct.

Reuse unaffected accepted load/fault/restore/engine/visual proofs, not another
full qualification run. Update P23 report/README and backend queue together;
full P24 field/visual owner review, release manifest, remote/dev/main promotion,
signed publication and production deployment remain separate and untouched.
State **QUALIFICATION_LEDGER_RECONCILED / READY_FOR_BOBBY_REVIEW**.
[Current T01–T15 matrix and real R-WFO-031 sampler receipt](./research_loop/evidence/P23/P23_QUALIFICATION_CLOSEOUT_2026-10-05.md)
record actual normal P08/P10 intake, confined child/P05 COMPLETED/READY and
named Search/S06 AVAILABLE: 2folds/3trials/36sampler calls; exact22file rehash,
desktop/mobile hash/proposal parity, own session logout201. Only one new job.
Historic source-scratch lookup failure is disclosed, not a production defect;
actual immutable P05 custody and BFF/DOM proof pass. Existing preview remains
on exact `dec91935` images, no rebuild/restart. Current T07/T13 fixed-profile
engine and linked-audit scopes are accepted; exact-three exception disclosed
with strict83/86, no forged all-PASS aggregator. Prior receipt identities and
failures retained. This slice changes only docs/evidence, no UI/backend code,
release manifest, remote push, dev/main merge or production action. Canonical
landing remains `docs/research-loop-plan`; Bobby reviews before release.

#### S02 linked-window setup refinement — Bobby, 2026-10-05

**BACKEND_CONTRACT_TESTED / FRONTEND_INTEGRATION_PENDING — one slice; no new campaign.** Bobby approves
Alpha/dataset/timeframe-bound runnable options, indexed-bar window suggestions,
and accurate admission reasons. Codex works in `portal-research-be` /
`codex/be-gaps`; land on `docs/research-loop-plan` after focused gates. No
frontend edits, profile widening, feature-flag changes, jobs, remote push or
production rollout. Claude owns the linked calendar/preset presentation.

- Publish named same-origin typed setup options distinct from the engine
  catalogue. Reuse current version/adapter eligibility and environment profile
  fences; disclose imported fixed-only/pins, timeframe, trials, seed, folds,
  range, inner-validation and requested-spec version restrictions.
- Suggest Three Window A/B/C/D from actual indexed bars, with contiguous shared
  edges and required warmup. Clamp automatic range to the selected profile;
  never silently replace explicitly requested bounds. Suggestions are editable
  heuristics, not optimal-methodology claims or execution authorization.
- Advanced estimates keep the current P08/engine planner as fold authority;
  expose bounded fold geometry for the calendar and no independent holdout.
  Keep v1 guards absent; v2 defaults are explicitly available, not fabricated
  protection. Reuse debounced read-only estimation, no compute during dragging.
- Test adapter/profile parity, auth/workspace/CSRF, v1/v2 guard semantics,
  indexed gap/warmup/date boundaries, bounded cost and refusal/absence. Generate
  OpenAPI/client and fixtures; record real-index proof separately from unit
  proof. One normal commit hook at coherent closeout, not per edit.
- Exit: backend contract/tests ready plus exact Claude handoff linked here.
  UI/calendar, real product browser receipt and deployment remain Claude's
  explicit next step; do not call the whole S02 refinement complete early.

[Backend receipt and Claude integration guide](./research_loop/evidence/P10/S02_LINKED_WINDOW_SETUP_2026-10-05.md).
Delivered two named setup reads, generated OpenAPI/types/canonical fixtures,
Alpha-bound declaration checks (including imported pins/seed), corrected
temporal-fold admission copy and additive actual fold geometry. Focused Control
API95/95, contracts16/16, Python79/79 (affected fold geometry7/7 retake), final
Control build PASS. Real pinned HMD index proof: BTCUSDT1h60-day suggestion,
1,440bars/300warmup; actual planner5folds, no new run or historical-source write.
Live route ledger, capability inventory and contracts digest record updated;
one grouped normal hook/local landing, no remote or preview/Production rollout.
Claude next: generated consumers + linked calendar/presets, v1-clone guard fix,
debounced engine timeline, actual API/browser receipt after rebuilding API,
Control and Web from the combined source. Existing passed P23 gates are not
rerun; no whole-S02/UI/deployed completion is claimed here.

**Frontend integration 2026-10-05 (Claude):** linked A/B/C/D calendar, Suggest/Apply/Reset, engine fold timeline, v1-clone guard fix and
profile-aware prefill are on the lane (`d9dc8697`, `0f4919c5`); real-API acceptance 8/8 at 1280/660, full lane 309 passed + 2 environment/budget items resolved per the notes in the
[frontend receipt](./research_loop/evidence/P10/S02_FE_INTEGRATION_RECEIPT_2026-10-05.md). `READY_FOR_BOBBY_REVIEW`; not pushed, not `OWNER_ACCEPTED`.

**S02 backend follow-up §36, 2026-10-05 — BACKEND_CONTRACT_TESTED / CLAUDE_CONSUMER_HANDOFF_READY:** Codex supplies precise
axis refusals/field paths, unopened engine-option disclosure, consistent
Conditions, a dedicated stale-options conflict and canonical fold geometry.
Scope: [queue §36](./research_loop/CODEX_BACKEND_GAPS_2026-09-30.md#36--s02-precise-refusal-and-setup-disclosure-2026-10-05).
Claude owns consumers/UI; all current profiles and admission fences stay unchanged.
[Delivery/contract examples/tests and Claude tasks](./research_loop/evidence/P10/S02_PRECISE_REFUSALS_2026-10-05.md).
Control130/130 affected cases including VN source-bound regression, contracts17/17 and Control
build pass; generated/digest verification included. No remote push or runtime
rollout. Claude next: consume precise paths/engine disclosure and classify
only stale-options409 as reload, then the affected combined preview receipt.

<a id="s02-full-support"></a>
#### S02 §37 — Full current-engine support, staged backend expansion

Bobby direction, 2026-10-05: **mở full, support full**; qualify every new exact
recipe before opening it. **PLAN_READY_FOR_BOBBY_REVIEW / NO_RECIPE_OPENED**.
This replaces waiting for a later mode/timeframe list, not qualification,
immutable source/custody, frontend ownership or release safeguards.

Detailed guide: [S02 full-support staged plan](./research_loop/S02_FULL_SUPPORT_STAGED_PLAN_2026-10-05.md).
Request/response: backend queue §37. Source reviewed at `0adff357`; existing
S02 calendar/presets and Claude receipts preserved, not retaken by this plan.

| Stage | Scope | Guide / current state |
| --- | --- | --- |
| FULL-01 | Shared versioned recipe table, common admission authority, bounded budgets/quota and historic compatibility | [Goal/to-do/tests/exit](./research_loop/S02_FULL_SUPPORT_STAGED_PLAN_2026-10-05.md#full-01) · BACKEND_DELIVERED / NO_RECIPE_OPENED · [Receipt/handoff](./research_loop/evidence/P10/FULL_01_SHARED_RECIPES_2026-10-05.md) |
| FULL-02 | Mode 1 missing schedule + optimized Three Window/global, full retained/read chain | [Goal/to-do/tests/exit](./research_loop/S02_FULL_SUPPORT_STAGED_PLAN_2026-10-05.md#full-02) · BACKEND_DELIVERED / TWO_EXACT_RECIPES_PRODUCT_RUN_QUALIFIED / RESEARCH_PREVIEW_ENABLED · [Proof, rollback, cleanup and Claude handoff](./research_loop/evidence/P10/FULL_02_MODE1_VERTICAL_2026-10-06.md) |
| FULL-03 | All actual indexed timeframes, source clocks/warmup and immutable Delta declaration extension | [Goal/to-do/tests/exit](./research_loop/S02_FULL_SUPPORT_STAGED_PLAN_2026-10-05.md#full-03) · BACKEND_DELIVERED / 28_EXACT_RECIPES_PRODUCT_RUN_QUALIFIED / RESEARCH_PREVIEW_ENABLED · [Delivery/rollback/custody/cleanup/Claude handoff](./research_loop/evidence/P10/FULL_03_INDEXED_TIMEFRAMES_2026-10-06.md), [immutable product proof](./research_loop/evidence/P10/FULL_03_PRODUCT_QUALIFICATION_2026-10-06.md) |
| FULL-04 | All other valid optimizer pairs, mode-native readers and measured slow-mode limits | [Goal/to-do/tests/exit](./research_loop/S02_FULL_SUPPORT_STAGED_PLAN_2026-10-05.md#full-04) · BACKEND_DELIVERED /35_EXACT_RECIPES_PRODUCT_RUN_QUALIFIED /RESEARCH_PREVIEW_ENABLED · [Implementation, tests, activation/rollback/C4 and Claude handoff](./research_loop/evidence/P10/FULL_04_OTHER_MODES_2026-10-06.md), [immutable35-run proof](./research_loop/evidence/P10/FULL_04_PRODUCT_QUALIFICATION_2026-10-06.md) |
| FULL-05 | Confined imported Alpha execution on compatible qualified recipes | [Goal/to-do/tests/exit](./research_loop/S02_FULL_SUPPORT_STAGED_PLAN_2026-10-05.md#full-05) · BACKEND_DELIVERED /27_PRODUCT_RUN_QUALIFIED /RESEARCH_PREVIEW_ENABLED · [Implementation/test/consumer ledger](./research_loop/evidence/P10/FULL_05_IMPORTED_ALPHA_2026-10-06.md) · FE/browser acceptance remains Claude-owned |
| FULL-06 | Remaining route families with exact inputs/cost/claims; staged batch order, no Cartesian mode/route invention | [Goal/to-do/tests/exit](./research_loop/S02_FULL_SUPPORT_STAGED_PLAN_2026-10-05.md#full-06) · 6a_BACKEND_DELIVERED /63_PRODUCT_RUN_QUALIFIED /RESEARCH_PREVIEW_ENABLED;6b–6f NOT_DELIVERED · [Batch/gates/C4/exact remaining work/Claude consumer ledger](./research_loop/evidence/P10/FULL_06_ROUTE_FAMILIES_2026-10-06.md), [immutable63-run proof](./research_loop/evidence/P10/FULL_06_PERCENT_EQUITY_PRODUCT_QUALIFICATION_2026-10-06.md) |

Exact target: five published modes / eight valid Advanced pairs. Current Three
Window remains distinct Mode 1/global with independent holdout. New profiles
need consistent expansion across setup's six-row bounds, immutable Alpha
declarations, worker/P05/readers and SQL custody constraints. Every newly
enabled recipe carries its own real P08/P10/child/P05/named-read receipt.
No enablement, run, migration, UI edit, push or deployment in this planning
change. Codex next proposed implementation: FULL-01; Claude retains design
ownership and only consumes proven named contract additions where necessary.

FULL-01 addendum, 2026-10-05 (Bobby approved implementation): six exact legacy
profiles now derive from one generated recipe table, with separate scoped
qualification references and shared bounded setup/admission/queue/child/progress
facts. Identical fresh source-revalidated unbound preflights reuse their token
without extending TTL; actor-local serialization prevents quota overshoot.
Migration **095** is append-only and applied only in disposable proof cells;
old producer bytes remain unchanged. [Receipt, tests, generated contract names,
commit locator and Claude handoff](./research_loop/evidence/P10/FULL_01_SHARED_RECIPES_2026-10-05.md).
No frontend/design changes, recipe opening, preview/production deployment,
remote push or dev/main merge. Next: FULL-02, not yet started. The historical
planning-only text above records the earlier planning turn, not this delivery.

FULL-02 addendum, 2026-10-06 (Bobby approved): Mode1/per-fold-decay Advanced
and separate optimized Three/global 1h recipes completed through real ordinary
P08→P10→confined QuantBT1.1.1→P05→named reads. Decay run
`rrun_05b84bb90e07e7a040062460ef12457f` (2 folds/6 trials), Three run
`rrun_f3fadab0bf9f450f4c7e0024a9ccb620` (3 trials + untouched Holdout): eight
HTTP200 reads each, five current-source AVAILABLE, integrity/Stage4 MATCH,
RC missing0; legacy Advanced audit remains method-scoped typed409. Append-only
096/097 keep old descriptors/seals and candidate history unchanged. Real flag-off
rollback rejects new intake while completed new runs stay AVAILABLE/MATCH.
Two byte-hashed exact qualifications now ENABLED on **Research preview only**;
20 prior seal identities/accounts preserved. Approved two FE verdict copy
maps only; frontend default/Suggest disambiguation and browser/visual receipt
are explicitly handed to Claude, not claimed as a signed/product-UI release.
No remote push, dev/main/production change. C4 owned-cell teardown/identity
revocation completed, proof volumes retained. Next proposed backend: FULL-03.
[Implementation, gates, proof hashes and handoff](./research_loop/evidence/P10/FULL_02_MODE1_VERTICAL_2026-10-06.md).

FULL-03 addendum, 2026-10-06 (Bobby approved): **BACKEND_DELIVERED /
28_EXACT_RECIPES_PRODUCT_RUN_QUALIFIED / RESEARCH_PREVIEW_ENABLED** supersedes
the earlier next-stage/planning notes, without starting FULL04–06. Actual
BTCUSDT/perpetual index/reader proof opens1m/5m/15m/30m/1h/4h/1d through a new
immutable Delta AV1.0.1 and exact global/causal/decay/Three recipes. Each has
ordinary P08→P10→confined QuantBT1.1.1→P05→eight200 reads, five current-source
AVAILABLE, custody/Stage4 MATCH, RCmissing0 and negative cursor/workspace proof.
300 target-bar warmup,100k planner ceiling, observed clocks and engine folds
remain authority. Dense1m storage and explicitly sampled display fit existing
manifest/payload budgets without dropping raw retained data. Append-only098–100
preserve old recipe/AV/seal/index bytes and immutable qualification history.
Preview28 recipes/seven setup checks, flag-off56 retained reads+create409,
20 prior seal/account/AV/index custody and test identity/cell cleanup pass.
Claude's independent S02 commit `a3b4eabd` and frontend image are preserved;
Codex changed no frontend file. FE/browser receipt remains Claude's named
handoff, not a backend release claim. No remotes, dev/main, Execution or prod.
[Delivery, tests, hashes/images, rollback/C4 and generated-type handoff](./research_loop/evidence/P10/FULL_03_INDEXED_TIMEFRAMES_2026-10-06.md),
[immutable28-run proof](./research_loop/evidence/P10/FULL_03_PRODUCT_QUALIFICATION_2026-10-06.md).
Next recommendation: Bobby approve FULL04; no unrequested stage started.

FULL-04 addendum,2026-10-06 (Bobby approved): **BACKEND_DELIVERED /
35_EXACT_RECIPES_PRODUCT_RUN_QUALIFIED /RESEARCH_PREVIEW_ENABLED** supersedes
the preceding proposed-next note. Mode3/global,Mode2/global,Mode4/global,
Mode4/causal,Mode5/global each passed ordinary P08→P10→confined QuantBT1.1.1→
P05→eight named screen reads at all seven indexed intervals. Real centroids
keep null trial identity; bootstrap remains proxy; Mode4 is IS-only without
fabricated Mode1 inner folds; Mode5 is full-sample calibration, not untouched
OOS/Final Audit. Maximum14.896CPU/15.259wall seconds/468MiB RSS stays inside
unchanged120CPU/240wall/4GiB/128MiB caps. Append101–103/71-row table preserve
old36 semantics and receipt history. Final-image280 retained reads plus named
aggregate reads, flag-off70 reads+create409, served-preview35 Atlas profiles/
seven setup/five real preflight checks,20 old seal/user/AV/index/web custody
and exact test-identity/cell teardown PASS. No broad prune, secret/data/engine
kernel changes, remote push, dev/main or prod/Execution action. Bobby-approved
five FE copy mappings only; Claude's current served web/S02 remains intact,
with real browser/native-detail rendering explicitly handed off rather than
called a backend acceptance result. [Full gate/contract/cleanup handoff](./research_loop/evidence/P10/FULL_04_OTHER_MODES_2026-10-06.md),
[immutable35-run proof](./research_loop/evidence/P10/FULL_04_PRODUCT_QUALIFICATION_2026-10-06.md).
Next proposed backend: FULL-05; not started without Bobby's named instruction.

FULL-05 addendum,2026-10-06 (Bobby approved): **BACKEND_DELIVERED /
27_EXACT_IMPORTED_RECIPES_PRODUCT_RUN_QUALIFIED /RESEARCH_PREVIEW_ENABLED**
supersedes the preceding proposed-next note. Canonical purpose-separated
Delta/RSI source was actually imported as immutable DRAFT and executed through
P07→P08→P10→confined QuantBT1.1.1→P05→216 named reads, not replaced by native
Delta. Nine method recipes at each declared/indexed1h/4h/1d now open using
source-bound numeric ranges/steps/categories and search+PIN. Historical fixed
import, DRAFT-vs-publication authority, restricted AST/no-IO, lease/fencing,
old71 recipe identities and protected strategy bytes are preserved. Append104/
105 bind27 independent proof references in the98-row table. Native centroid,
IS-only/proxy/full-sample scope and typed incompatibilities remain truthful.
Measured17.928CPU/18.233wall seconds/367.391MiBRSS fits unchanged caps.
Final retained-read parity, flag-off54 reads+create409, preview27 Conditions/
three actual may-create preflights and old20 seal/user/AV/index/web custody
PASS; no frontend replacement or production/Execution action. The Mode5
estimator scope fix is explicitly typed and does not relax WFO chronology.
[Full gates, failure ledger, operations and exact frontend handoff](./research_loop/evidence/P10/FULL_05_IMPORTED_ALPHA_2026-10-06.md),
[immutable27 imported-run proof](./research_loop/evidence/P10/FULL_05_PRODUCT_QUALIFICATION_2026-10-06.md).
Claude consumes `DECLARED_SEARCH_WITH_PINS`, native mode truth,
`SOURCE_CODE_SHA256` and typed full-sample geometry; browser acceptance is not
claimed here. No remotes/dev/main/prod. Next proposed backend FULL06 remains
unstarted until Bobby names it; no new campaign is invented.

### FULL support owner expansion — 2026-10-06

Bobby now approves widening the new recipes beyond fixed 3/5 trials,
qualification for ETHUSDT/SOLUSDT, compatible imported Alpha expansion and
the required `intrabar_bracket`, `reactive`, `event_driven` adapters. DCA,
portfolio/basket, arbitrage and options are not needed in this version; this
addendum supersedes their delivery order, without deleting the old inventory.
Current gate **BACKEND_DELIVERED /156_NEW_EXACT_RECIPES_PRODUCT_RUN_QUALIFIED /
RESEARCH_PREVIEW_ENABLED**:
153 expanded exact recipes/215 accepted product runs plus3 nativev3 recipes/
9 accepted runs (224 total), through ordinary P08→P10→QuantBT1.1.1→P05→named
reads. New 2–400 ranges (Mode3 min5) and exact total-work/resource caps are
versioned successors; every161 old descriptor/proof stays byte-identical.
Native bracket/reactive/event-driven delivery is **fixed Three Window/1h/
one execution**, not native WFO, arbitrary command tapes or a Cartesian
mode×route promise. DCA/portfolio/arb/options remain owner-deferred.

Final backend images passed1,783 retained reads without rerunning children;
flag-off rollback312 reads/7 intake negatives PASS. Research preview backend
is rolled out with candidate selectors empty; its28 setup combinations and
eight unique-family positive preflights PASS after normal token quota expiry,
without increasing quota or starting children. Twenty-two
old preview seal identities, users/AV/pointers/HMD index and Claude web
custody PASS. Test cell down,22 sessions revoked/21 temporary users disabled,
four proof volumes retained. C4 quiet cache maintenance is required before
the next heavy build; no broad prune in this slice.

Claude's accepted frontend remains protected. Percent-equity source-absent
costs stay typed absence; native input/result and route-aware immutable AV
selection/browser acceptance are explicit consumer handoff, not UI completion.
No remote push, dev/main/Production/Execution change. This latest addendum
supersedes older stage-not-started and6b–6f ordering notes only within the
approved three native families and trial expansion, not the deferred routes.
[Exact scope, sequencing, tests, activation, custody and delivery journal](./research_loop/evidence/P10/FULL_06_APPROVED_EXPANSION_2026-10-06.md).

### S02 refinement and frontend import — 2026-10-07

Bobby approved **BR-S02-06/09** and the existing two Claude frontend commits.
Codex owns version/setup contracts; Claude retains native consumer/layout.
`researchRunVersionOptionsGetV1` is a workspace/actor-fenced read before dataset
selection, using the same immutable version predicate as dataset-bound setup.
It reports compatibility, not run authorization or replacement of scalar/pct/
native versions. Additive recipe presentation owns key/family/label/display
rank outside immutable execution descriptors/proofs/seals. No new recipe,
migration, source read, preflight, child or default mutation is required.

Import original `89097619` + `532a9c85` preserving ancestry, current backend
and both request-ledger appendices; Claude's later rebased two commits have
identical frontend bytes. Uncommitted native consumer work is not staged.
BR-S02-11/12 are already delivered by `f33a0887`, not new OPEN work. Old
FULL-06 board6b–6f ordering remains historical under the owner expansion above.

Exit: generated schema/client/fixtures + route inventory, binding/flags/
workspace/refusal/compatibility and old-consumer tests, one grouped normal
hook, clean FF to `docs/research-loop-plan`, exact Claude handoff. Backend
source delivery is not preview API or browser acceptance. P23/P24/owner review
and quiet C4 maintenance are not silently converted to PASS by this slice.
[Receipt and integration journal](./research_loop/evidence/P10/S02_VERSION_RECIPE_REFINEMENT_2026-10-07.md).

### S02 native truth repair — Bobby approved, 2026-10-07

Codex implements BR-S02-14…17 on `codex/be-gaps` from `6b3f6a2d`, then lands
on the shared Research branch. Claude's fixed native Parameters consumer is
already in the base; preserve it and all UI design. Current Atlas recipe
disclosure, normalized UTC hourly windows, bounded persisted Progress native
facts and explicit engine position-regime semantics are the exact backend
scope. No new profile, engine, migration or immutable seal rewrite.

[Queue §41 implementation plan and test/capacity boundary](./research_loop/CODEX_BACKEND_GAPS_2026-09-30.md#41-implementation-addendum--codex-bobby-approval-2026-10-07).
Status **DELIVERED — BR-S02-14…17**. Control52/52, contracts21/21, Python4/4;
three existing real native runs, S03/S04 at1280/660 (12 views), Atlas200/304.
Preview includes Claude's Parameters fix; no frontend source/visual change,
profile opening, source/seal rewrite, remote push or production rollout.
[Receipt and Claude consumer handoff](./research_loop/evidence/P10/S02_NATIVE_TRUTH_REPAIR_2026-10-07.md).
Reuse unchanged T07 restore/three-manifest exception
and T12 scoped scenario evidence; candidate-final T02/T14 and changed FE
matrix/baselines are not relabelled PASS by a backend repair.

### Delta RSI 2020–2026 owner review runs — Bobby, 2026-10-07

Codex runs the existing Notional Delta edition1.0.1 on BTCUSDT/1h through
real S02 → preflight → admission → child → P05 → named screen reads, serially.
Two requested lanes: optimized Three Window and Advanced Mode1/global,
quarterly/expanding, published recipe defaults (3 trials, seed42, no parameter
or optimizer overrides). The source index currently stops2026-10-01T23:00Z;
review range uses completed days2020-01-14 →2026-10-01 (UTC/end-exclusive),
with300 actual predecessor warmup bars. No future2026 rows or invented gaps.
Three Window boundaries2024-10-01 /2026-01-01; WFO firstOOS2023-01-01,
15 quarterly outer folds expected, subject to the actual engine plan.
Also inspect S04 IS/Holdout availability against retained source facts:
do not relabel OOS as another window or a WFO fold as independent Holdout.
No new profile/default change, production, remote push or design change.
Status **OWNER_REVIEW_RUNS_COMPLETED · OVERVIEW_WINDOW_MAPPING_GAP_CONFIRMED**.
Three `rrun_338193efca9bf958fe9126f495bb37be` and WFO
`rrun_a0314cb849a692712035fcca836eb233` both completed with terminal retention
READY; WFO engine produced15/15 folds, no failed folds. Real browser S02
preflight201/create202, downstream named reads and Report readback200.
Both initial Reports and one WFO series request returned transient503 during
materialization; targeted readback recovered. Linked audit409 is explicitly
NOT_APPLICABLE, not hidden or represented as a successful audit.
Three already publishes separate IS/OOS/Holdout curves, but Overview's
enrichment/window consumer ignores these facts. Global WFO has no independent
Holdout, and its overlapping IS windows must be presented per fold. This run
receipt is not a fix for those mappings, a causal qualification, or P24 GO.
[Accepted specs, results, source hashes, window diagnosis and Claude handoff](./research_loop/evidence/P10/DELTA_LONG_RANGE_OWNER_REVIEW_2026-10-07.md).

**2026-10-07 LR-01…03 implementation approved / IN_PROGRESS.** Repair the
Overview window projection and data binding on those two completed runs.
Three Window consumes its retained, separately scoped IS/Holdout account
points and sampling facts; WFO consumes selected-trial IS facts per training
fold and explicitly reports no independent Holdout. No account is synthesized
from the stitched idle prefix, no sampled-curve financial analytics, no engine
rerun or immutable evidence rewrite. Preserve Claude's existing components,
tokens, layout and baselines. Contract generation/focused tests precede one
bounded preview rebuild and real API/browser checks at 1280/660, followed by
one normal grouped commit hook. [Exact scope/test plan](./research_loop/CODEX_BACKEND_GAPS_2026-09-30.md#42-repair--approved-overview-window-binding-2026-10-07).

**LR-01…03 delivery:** real API/browser acceptance of the requested Overview
repair, **10/10 views at1280/660** on the same completed long-range runs.
Three IS/Holdout now display their retained account curves and source bounds;
WFO displays independent selected-trial IS facts per fold, Holdout explicitly
NOT_APPLICABLE. Per-fold IS curves remain a precise source absence, never an
OOS-prefix substitute. Completed Three Hub Holdout count6552; pre-execution
seal protection preserved.0 engine reruns/product writes, immutable source
and Report equality, old/new ETag200/304. Preview Control/Web only, worker and
all data untouched. No remote/main/dev/production or P24 GO implied.
[Implementation, tests, exact fields, runtime identities and cleanup receipt](./research_loop/evidence/P13/OVERVIEW_RETAINED_WINDOWS_2026-10-07.md).

**S02 optional early stopping, 2026-10-07 — IMPLEMENTING / Bobby approved:**
Codex owns setup/preflight/admission/producer/child/retention wiring plus
minimal existing-field hint/validation, no Claude visual redesign. Optional
integer patience per study; blank stays null, recommended½…¾ trials with⅔
suggestion only. All-pass data preflight must include the distinct execution
admission verdict. Retain actual early-stopped studies, never padded trials;
null execution/history stays unchanged. Required focused tests and real
Three/WFO preview receipts precede closeout, one grouped hook. No remote
push/main/dev/production change. [Exact scope and tests, backend queue §43](./research_loop/CODEX_BACKEND_GAPS_2026-09-30.md#43--optional-per-study-early-stopping--bobby-approved-2026-10-07).

**S02 optional early stopping — REAL_PREVIEW_ACCEPTED:** generated OPTIONAL
per-study policy and display-only200–300/267 suggestion for400 trials; blank
stays null. Actual patience reaches pinned QuantBT1.1.1. P08 exposes the
separate execution-admission gate, and invalid values point to the exact
field. P05/seal/read/Progress preserve actual counts under immutable P08
authority, not padded studies. Four ordinary real runs completed/retained:
Three390/400, global5/20, per-fold4+7+6/20 each, blank3/3; final real readback
and S06 browser0 errors. Minimal existing-field binding only, no design or
baseline change. Focused tests/build/typecheck pass; one normal grouped hook
for landing. Research preview only; no remote/main/dev/production or P24 GO.
[Detailed receipt and Claude consumer rules](./research_loop/evidence/P10/OPTIONAL_EARLY_STOPPING_2026-10-07.md).

**Window analytics and execution replay completeness — BACKEND_REAL_PREVIEW_ACCEPTED / Bobby
approved, 2026-10-07:** Codex fixes P05 bar-schema selection, publishes retained
IS/OOS/Holdout descriptive analytics and Compare/Replay selectors, and retains
actual native execution journals with maximum source-backed conditional-order
DTOs. Completed Three Holdout is readable after verified execution; WFO has no
independent Holdout and IS remains fold-scoped. Historical seals stay immutable.
Claude receives generated contracts and a precise consumer/marker handoff;
Codex does not modify frontend. Real preview evidence and one grouped hook,
no remote/main/dev/production/release action.
[Delivery order and exit gates: backend queue §44 WEX addendum](./research_loop/CODEX_BACKEND_GAPS_2026-09-30.md#44-addendum--complete-window-analytics-and-source-backed-execution-replay--bobby-approved).

Backend delivery:four generated window/native reads, real Three×2/WFO/native×3
acceptance,30 final GET assertions, migration116–118/RLS and preserved30 prior
seals/accounts/HMD/web. WFO IS remains diagnostic per fold; WFO Holdout N/A;
unexecuted native Holdout/old missing custody stay typed. Frontend unchanged,
awaits Claude consumer/visual acceptance. One grouped normal hook before
ff-only shared landing; no remote/main/dev/production/release promotion.
[Backend receipt](./research_loop/evidence/P17/COMPLETE_WINDOW_EXECUTION_BACKEND_2026-10-07.md) ·
[Claude prompt and exact contract handoff](./research_loop/evidence/P17/COMPLETE_WINDOW_EXECUTION_CLAUDE_HANDOFF_2026-10-07.md).

**BR-S02-19 / WEX active protection absence — DELIVERED_SOURCE, 2026-10-07:**
Codex normalizes public SL/TP levels to null while flat/unset, with required
typed availability and exact raw `source_value` provenance. Genuine open
position levels retain original decimals. Immutable source/P05/seal/schema
custody and Claude UI stay unchanged; no engine rerun, migration or runtime
rollout. Focused Control21/21 and contracts5/5, build; normal commit hook then
ff-only shared landing. Claude takes the clean preview rebuild and real
consumer/matrix receipt; pending Holdout, Limit/OCO, S06 paging and P24 gates
are not counted as complete by this mapper fix.
[BR-S02-19 receipt and Claude handoff](./research_loop/evidence/P17/BR_S02_19_ACTIVE_LEVEL_ABSENCE_2026-10-07.md).

**BR-S02-20 / P15 pruned metrics — DELIVERED_SOURCE, 2026-10-08:** Codex repairs
the named Search read: a PRUNED trial's five completed-objective metrics are
null with `TRIAL_PRUNED_NO_OBJECTIVE`; its completed decomposition is absent
with the same reason. Raw source partial values, old seals, selection/source
identity and COMPLETE zeros stay unchanged. Ledger PRUNED also covers old
rows without fact blocks. Closed Zod/OpenAPI guard, generated
`PrunedTrialMetric`, canonical synthetic fixture, snapshot and policy-bound
public revision/ETag/cursor are delivered. Focused Control32/32, contracts4/4;
Control build and one ordinary commit hook are landing gates. No engine
rerun/UI edit/migration/runtime rebuild/remote push. Claude takes the next
clean preview/API consumer receipt on the existing 400/390-trial runs; this
does not claim the unseen 6,400-row lane or P24 release acceptance.
[Precise backend receipt and consumer handoff](./research_loop/evidence/P15/BR_S02_20_PRUNED_METRIC_ABSENCE_2026-10-08.md).

2026-10-08 Bobby-approved backend follow-up: **BR-S02-22 → BR-S02-21 / IN_PROGRESS**.
Repair bounded summary/admission without discarding 16-fold/6,400-trial
authority, then deliver and product-qualify an additive Delta Limit/OCO recipe.
AI Native authentication unchanged; Parquet compaction/retention changes remain
discussion-only. [Exact scope, tests, capacity decision and landing rules](./research_loop/CODEX_BACKEND_GAPS_2026-09-30.md#49--br-s02-22--br-s02-21-implementation--bobby-approved-2026-10-08).

**Delivery, 2026-10-08 — BACKEND_PRODUCT_QUALIFIED / DELIVERED_SOURCE.**
The new ordinary product run `rrun_3062d7a…` completed 16 folds / 6,400 trials;
32 trial pages and 13 candidate pages prove all 620 source candidates. Core
63,492 bytes and Search max 1,000,181 bytes stay inside unchanged bounds;
Freeze integrity and Stage 4 binding MATCH. Exact digest-bound population,
batch index, progress catch-up and named-read fixes preserve full retained
authority and original failures. No admitted maxima were reduced.

New immutable Limit/OCO profile/Alpha qualified on BTC/ETH/SOL: each actual
run has LIMIT entry, real parent/OCO IDs, two activated exits, TP fill and
SL sibling cancellation. Setup plus fresh preflight pass on the final compiled
candidate **without qualification selector**; migration 124 binds the frozen
real receipt. Contract/types/fixture/snapshot parity and backend builds pass.
All 22 test sessions revoked; 21 non-owner identities disabled; exact 8096
project stopped without deleting volumes, receipts or shared runtime resources.
No remote push/dev/main/release, FE design change or Parquet compaction.

Claude follows the [precise S06/S08 consumer and browser handoff](./research_loop/evidence/P24/SUMMARY_LIMIT_OCO_BACKEND_CLOSEOUT_2026-10-08.md);
the proof run IDs are in the owned cell, not the shared preview DB. Backend
qualification does not silently close P24/owner visual or browser acceptance.

**2026-10-08 / shared-preview Limit/OCO acceptance — IN_PROGRESS:** Bobby
approves backend refresh/forward migrations and an ordinary product run in
the shared Research preview only. Runtime already matches `6441e93c`/migration
124, so reuse it. Register the missing protected 1.0.12 binding through the
existing admin API; preserve all prior immutable bindings and candidate
authority. Use a verified 90-day range and affected S08 browser receipts.
The exact recipe remains fixed one trial/one entry cycle; this does not claim
many-trial or multi-cycle Limit/OCO qualification. No production/dev/main,
manual SQL writes, frontend design change or remote push.
[Scope and exit gates: backend queue §50](./research_loop/CODEX_BACKEND_GAPS_2026-09-30.md#50--shared-preview-limitoco-product-acceptance--bobby-approved-2026-10-08).

**Shared-preview backend receipt — READY, not full S08/P24 acceptance.**
Ordinary 90-day run `rrun_7c6aff8dc45f1781887527c2bf970f2c` is COMPLETED/READY;
1,944 IS/OOS bars pass complete cursor sweeps, actual LIMIT/parent/OCO journal
has 3 orders/2 fills/8 events. Existing installer adds only missing 1.0.12;
prior bindings/accounts/qualification authority and images stay unchanged.
S08 1280/660 basic real-API/browser checks pass, but served web predates
Claude `1ab33e3f` and lacks the new journal columns. Claude rebuilds web and
retakes the source parent/OCO/event rendering on this run; no engine rerun.
Exact recipe remains one fixed trial/one cycle, not many-order stress proof.
[Receipt and direct Claude handoff](./research_loop/evidence/P24/SHARED_PREVIEW_LIMIT_OCO_90D_2026-10-08.md).
# 2026-10-08 owner addendum — multi-cycle Limit/OCO

Bobby requests more than the previous one-trial/one-cycle minimal proof.
[Backend queue §51](research_loop/CODEX_BACKEND_GAPS_2026-09-30.md) owns the
additive multi-cycle native optimizer implementation and long real-run
qualification, plus current Claude web rebuild on Research preview only.
Historical recipe/receipts stay immutable; no promotion/release is implied.

**§51 backend delivered — PRODUCT_RUN_QUALIFIED / SHARED_PREVIEW_READY.**
New exact Limit/OCO optimizer: 2–400 real trials, default100, causal 48-bar
cycles. BTC/ETH/SOL each completed100 trials on90 days; 21/15/16 real parent
cycles and42/30/32 fills, full100-row P05 byte/selection custody. Only the new
exact recipe receives migration126 authority; immutable old recipe preserved.
Shared preview ordinary run `rrun_ee50cb82d6de9e495e10b32323b62f8c` is
COMPLETED/READY (100 trials,21 cycles,84 orders,42 fills). Current Claude web
rebuilt and S08 checked1280/660; no new engine run for old browser captures.
Native optimization summary is public on Progress/Evidence/Split; scalar
Search/Freeze/full native Report are typed unsupported, not invented. Narrow
FE type/Parameters mapping remains separately tracked in the handoff.
No production/dev/main/remote push or compaction; temporary QA identity
revoked and exact QA cell stopped, all data/evidence/rollback images kept.
[Complete shared receipt, limitations and Claude consumer prompt](./research_loop/evidence/P24/LIMIT_OCO_MULTICYCLE_SHARED_PREVIEW_AND_CLAUDE_HANDOFF_2026-10-08.md).

## 2026-10-08 owner addendum — S08 component integrity belongs to Claude

Bobby directs Codex to backend only and assigns S08 frontend/component fixes
to Claude using the accepted component/HiFi design. The two inconsistent
candle panels, overlapping readout and fill presentation require an affected
visual receipt; earlier §51 browser checks are functional/data evidence only,
not visual acceptance. §51 native backend qualification stays valid; do not
rerun the engine to repair frontend. Claude also owns the pending generated
RecipePins/NATIVE_OPTIMIZED and fixedNative bindings. Preserve typed
Holdout/SL/TP absence and unsupported native readers; no invented facts.
**FRONTEND_HANDOFF_READY / CLAUDE_VISUAL_ACCEPTANCE_OPEN**, not P24/release closed.
[Exact assignment, source locations, real run, DTO constraints and exit gates](./research_loop/evidence/P24/S08_COMPONENT_INTEGRITY_CLAUDE_HANDOFF_2026-10-08.md).

## 2026-10-08 Claude frontend addendum — S08 component integrity (response)

Frontend slice for the assignment above, `FRONTEND_RECEIPT_ATTACHED / OWNER_VISUAL_REVIEW_OPEN` — not P24/release closed.
Commits on the FE lane: `95b9e736` (shared candle component, readout labels, fills, `RecipePins.family`, native-searched vs fixed Parameters/Review), `6ee64787`/`d58b0adb` (one chart: order tracks, fills, cancel/expire marks, equity/position panes, OCO tree), and the native-optimization summary commit that follows this note.
Bobby's direction that the chart itself must draw orders, fills, conditional orders and order types replaced the separate "OOS observation" panel on native routes; the other fixed routes keep it. Every order, relation and end state comes from the journal's explicit `order_id` / `parent_order_id` / `oco_group_id` and lifecycle events; no role (entry / SL / TP) is stated that the source did not name. Real API on `rrun_ee50cb82…` at 1280 and 660 px: no overlapping labels, no horizontal overflow, 0 console messages, 0 responses ≥ 400; IS / OOS / Holdout (typed `FIXED_NATIVE_PROFILE_DID_NOT_EXECUTE_HOLDOUT`), bar paging and the six journal relations read. Native optimization summary on Progress, Evidence and Split (trial 41, objective as served, 100 / 100 / 100); Search keeps its typed `NATIVE_OPTIMIZER_POPULATION_SEALED_IN_P05_NOT_SCALAR_WFO_LEDGER` absence. S06: 620 / 620 candidates in 12 pages on the 16 × 400 run, candidate cursor sent alone.
Open: HiFi equivalence is not claimed (the HiFi file demonstrates `close_target_v2`); active SL/TP account levels unverified on a run that publishes them; the 73-cell matrix and visual baselines not retaken; `market` orders have no price and appear as fills/journal rows, not levels.
[Receipt, defects found on the real run and open items](./research_loop/evidence/P24/S08_COMPONENT_INTEGRITY_CLAUDE_RECEIPT_2026-10-08.md).

**§54 native Report / FAILED custody — 2026-10-09, BACKEND_SOURCE_DELIVERED:**
Codex adds generated `ReportRead` (`ReportDetail | ReportUnavailable`); exact
authorized native runs with no Report return200 typed
`NOT_PUBLISHED / NATIVE_REPORT_NOT_DELIVERED`, not a fake seal or missing run.
Existing Reports and revisions are unchanged; scope/ETag/export stay fail-closed.
Compiled candidate read on the actual preview DB PASS; no deployed HTTP/browser
claim or runtime rebuild ahead of Claude's union consumer. No frontend or
baseline edited. S01 native-first Report console gate remains pending consumer
and scoped same-candidate rebuild/receipt. Two reported FAILED runs are bound,
sealed forensic evidence (0 orphan window batches), preserved without lifecycle
rewrite or deletion. Queue§53 keeps16 folds/6,400 total; optionB30 is future,
not opened. [Response, source proof, inventory and Claude handoff](./research_loop/evidence/P18/NATIVE_REPORT_ABSENCE_AND_FAILED_CUSTODY_2026-10-09.md).

## 2026-10-09 §55 — Native Search, Freeze and full Report/export

**BACKEND_DELIVERED / DEPLOYED_PREVIEW_HTTP_PASS**. Supersedes §54's
native reader limitation for qualified/prepared data, not its unknown-run,
tenant or immutable-seal protections. Codex edited backend/contracts only;
preserved Claude S08 implementation at6fb34bd5.

Native S06 has bounded complete trial population and source plateau/medoid
metadata; S07 has selected params/digests, scoped integrity and native fields
also on Verify; full Report + JSON/CSV reuse the existing authenticated job
flow. 100 actual retained trials/98 distinct/θ*41 (ordinal42), all pages and
cross-screen digests/checksum-download PASS; three fixed-native Report
regressions also PASS. Migration127/128 append local versioned projection,
not artifact/source history. Old P05/WFO Report and lifecycle pins unchanged.

Shared preview backend-only compatible rebuild uses the existing safe helper;
flags, DB/NATS, production/dev/main and Claude web source are untouched.
Frontend mapping/affected browser+visual receipt remains Claude-owned; no
P24/product/release claim. Native source-not-executed Holdout and unavailable
sampler/member identity/wall-clock facts stay explicitly typed.
[Backend proof, gates and capacity decision](./research_loop/evidence/P18/NATIVE_SEARCH_FREEZE_REPORT_DELIVERY_2026-10-09.md).
[Claude exact contract/UI handoff](./research_loop/evidence/P18/NATIVE_READERS_CLAUDE_HANDOFF_2026-10-09.md).

Actual signed private transport and24 API readback calls PASS, including
100 trials, fresh Verify MATCH, native/fixed Report JSON/CSV downloads,
conditional304, workspace/cursor/auth negatives and own-session revocation.
Native Freeze ETag follow-up removes read-clock churn without hiding new byte
receipts. No frontend or web rebuild; DB/NATS/artifact volumes preserved.
Initial source commit748e241b; exact follow-up is in this addendum's commit.
See runtime receipt for committed checkout/image identity and full responses.

## 2026-10-09 Claude frontend addendum — native S06 / S07 / S09 consumed (§55)

`FRONTEND_CONSUMED / REAL_API_RECEIPT_ATTACHED / OWNER_VISUAL_REVIEW_OPEN` — not P24 / release closed. Wired on `docs/research-loop-plan`: `native_search` → `NativeSearchPanel` (S06), `native_freeze` + the explicit Verify → `NativeFreezePanel` (S07), `frozen_core.native_report` + the existing JSON / CSV export flow → `NativeReportBlock` (S09); the S08 chart is unchanged. A native run has no fold (the server answers 400 to any `fold`), so the screens learn it from Progress first. Real API at 1280 / 660 on `rrun_ee50cb82…`: θ* trial 41 / ordinal 42 of 100, a fresh byte receipt `MATCH` after Verify, exports whose SHA-256 equals the job's (62,301 / 12,920 bytes), three fixed-native Reports with no optimizer blocks; 0 console messages. Open: paging past 200 trials is unit-tested but not browser-exercised (this run has 100); neighbour identities and the sampler trace stay typed absences; the repeated scalar claim strip on S06 is honest but noisy.
[Receipt, defects found and open items](./research_loop/evidence/P24/NATIVE_READERS_CLAUDE_RECEIPT_2026-10-09.md).

## 2026-10-10 owner addendum — Unified Research + Execution review preview

**Bobby-approved / IN_PROGRESS.** Review all existing Research and Execution
UI on `https://research-portal.primusspark.com` from the shared
`docs/research-loop-plan` branch. No Cloudflare Access setup in this preview.
This overrides the older preview-only rule that Execution routes remain dark,
not production identity, source authority or release safeguards.

**Goal / scope:** compile the already-reviewed Execution product router;
enable the existing local Command Center snapshot and governance APIs alongside
Research. Preserve Claude's components, themes, registry, Research run/artifact
history, identities and named volumes. All stable Execution commits are already
ancestors of this branch; no main/dev merge is needed. The preview currently
has 112 Research runs and **zero** Execution projection snapshots; absence is
not a fresh/complete empty Trading System result. Do not seed fake operational
data or replace product BFFs with fixtures.

**To-do / operational boundary:** use the fixed `portal-research-preview`
helper and rebuild only web + Control API, then scoped `up` (no DB/NATS/worker
restart, bootstrap reset or migrations). The preview overlay pins external
Execution source/profile reads, projection/mirror writers and reads, Execution
SSE, upstream analytics/market feeds and command relay/R0 tasks off. Local
Research publication → existing R1 read remains available; R2/Canary/Live are
review surfaces, not fabricated operational transitions. Existing Research
progress is unchanged. TLS/SLA renewal, inter-cell activation, Cloudflare,
signed images and release acceptance happen only in separately approved
dev/main promotion under the established production rules.

**Exit gate:** configuration isolation tests; clean source/image/bundle
identity; real browser at1280/660 across Research, Execution and governance
routes, deep-link/refresh, same-origin reads and honest source-disabled
panels; an existing Research RC → actual local R1 link; no upstream stream or
command requests; preserved Research row/hash and volume/container identity.
Reuse prior engine/visual evidence because no strategy, contract or component
changes. Record named preview limitations, rollback images and C4 capacity/
cleanup in the linked receipt. This is `PREVIEW_REVIEW_READY`, not P24,
production activation or owner visual acceptance.

[Preview runbook](../deploy/runbooks/research-preview.md) ·
[Runtime receipt](./research_loop/evidence/P24/UNIFIED_RESEARCH_EXECUTION_PREVIEW_2026-10-10.md).

**2026-10-10 outcome:** `PREVIEW_REVIEW_READY / FUNCTIONAL_ROUTES_PASS` on
config commit `6640c7f9`, bundle `index-hBXCtrBk.js`. 16 routes ×1280/660 =32
rendered cells; actual existing RC→R1, required local APIs and R1 refresh PASS.
Only preview-scoped governance **read** grants were issued through the normal
owner API; no decisions/commands or broader admin rights. All112 runs/37 seals/
4 packs/2 publication row hashes and DB/NATS/worker/mount identities preserved.
AWS/source reads, Execution SSE and mutation flags remain off. No frontend
source, production/dev/main, TLS/SLA or Cloudflare Access changes.

The receipt names limitations, not a hidden full-product PASS: source-disabled
HTTP/console noise, bare R1 href's unproven cross-workspace propagation and
the existing R1 mobile sticky rail overlap. Claude retains UI refinement and
visual acceptance. R2/Canary/Live are review surfaces, not a fabricated
promotion chain. C4 local cleanup/session revocation done, rollback images
retained; no engine rerun or visual baseline rewrite.

<a id="udb-upgrade-2026-10-10"></a>
## 2026-10-10 UDB upgrade plan — Shared identity, PostgreSQL and Research/Execution integration

**Planning snapshot: PLAN_WRITTEN / AWAITING_IMPLEMENTATION_APPROVAL.** Tại
lượt planning Bobby chỉ duyệt ghi phương án vào **file này**, chưa giao triển
khai UDB nào. Snapshot planning không sửa code/OpenAPI/config/migration/hooks/
env/runtime. Sau đó Bobby đã giao UDB-01 và duyệt refinement gate ngắn;
trạng thái hiện hành ở board và implementation/closeout addendum cuối file.
Mỗi phase chỉ bắt đầu khi Bobby duyệt phase đó; không tự chạy tiếp vì thứ tự
đã được ghi. Branch chung giữ `docs/research-loop-plan`, không push remote,
merge dev/main hoặc rollout stable nếu chưa được giao.

**Mục tiêu:** đưa PostgreSQL/storage/resource hardening và unified identity
vào lần nâng cấp Portal v2.0.0 của **cả Research Loop lẫn Execution Loop**;
preview `https://research-portal.primusspark.com` hiển thị tối đa dữ liệu
Execution đã retained, giữ rich UI và luồng Research → RC → Governance.
Không đợi nguồn Trading System mới để dùng dữ liệu hiện có. Portal release
version không phải engine version hoặc PostgreSQL major version.

**Authority / supersession:** khi được duyệt triển khai, UDB thay giới hạn
preview cũ về local readers/DB restart/migrations đúng phạm vi phase được
duyệt. Giữ nguyên receipt lịch sử ngày 2026-10-10 ở trên; không sửa nó thành
đã có dữ liệu hoặc đã nghiệm thu full flow. Preview không yêu cầu Cloudflare
Access; production identity, TLS verification, signed release và dev/main
promotion vẫn theo rules. SSL hết hạn không phải boundary isolation và không
cho phép `verify=false` hoặc loop retry không giới hạn.

### UDB baseline và nguồn bắt buộc

- Đọc [AGENTS](../AGENTS.md), [Research working rules](./research_loop/CLAUDE-FOR-thanhvuong.md#research-working-rules),
  §13.3/§13.6/§13.7 của Unified, [dual-cell guide](./RESEARCH_EXECUTION_DUAL_CELL_AND_INSTITUTIONAL_UIUX_ADJUSTMENT_GUIDE_v0.5_vi.md),
  [backend architecture](./BACKEND_ARCHITECTURE_IMPLEMENTATION_GUIDE.md) và
  [cleanup C4](../docs/production-feature-profile-and-cleanup.md#c4--self-hosted-runner-docker-worktree-and-cache-hygiene).
- Kế thừa [PostgreSQL/cache hotfix + implemented outcome](./upgrade_frontend_plan_hifi/hifi_execution_loop/HOTFIX_REQUEST_2026-10-09_POSTGRES_CACHE_BLOAT.md),
  config `deploy/postgres/portal.conf`, migration `1723680000129`, commits
  `c823bda9`/`99a2eb73` và [unified preview receipt](./research_loop/evidence/P24/UNIFIED_RESEARCH_EXECUTION_PREVIEW_2026-10-10.md).
  Không viết lại bản vá đã có hoặc suy deployed từ việc file đã commit.
- Đọc code auth/owner/grants/workspace, `auth/governance-access.ts`,
  `execution/local-read-authority.ts`, `execution/delegation.ts`, resource BFFs,
  P03/P22/P23/P24 packets và các contract TS/Edge hiện được publish trước khi
  chạm đúng surface đó. TS Portfolio/Account upgrade chưa publish contract
  thì ghi riêng phần future capability, không suy đã có resource ACL.
- Read-only baseline 2026-10-10: preview/dev/stable PostgreSQL **16.15**, config
  mặc định, container chưa có hard memory cap; cache còn `relpersistence=p`,
  không table/TOAST options của migration129. Cần kiểm tra lại ledger **và**
  trạng thái DDL; migration từng ghi applied nhưng thiếu marker không được
  sửa bằng cách rewrite migration history hoặc chạy bootstrap.
- Config mới trong repo có `shared_buffers=1GB`/PG `mem_limit=4g`, nhưng
  `compose.research-p23-5gb.yaml` giới hạn PG **900,000,000 bytes**. Không áp
  config đó nguyên trạng vào P23. Research strict gate vẫn tổng
  **5,000,000,000 bytes**, bao gồm DB/queue/worker/query/page cache/one-shots.
- Dev có 3 profile snapshots, 1,078 dòng Alpha Fleet projection, 10 Portfolio,
  765 Binding; stable tương ứng 3/618/6/417; preview đều 0. Đây là **dòng
  projection**, không phải số tài nguyên duy nhất. Paper snapshot giữ 6,321
  item qua 6 relation, nguồn cuối 27/09; Sandbox/Live current snapshots không
  có item. Không dùng absence đó làm authoritative empty hoặc full coverage.
- Cache **đã có** admission reservation `hasCacheCapacityReservation()` trong
  `begin()` và advisory lock cross-replica. Prose hotfix nói thiếu logical cap
  không thắng code này. Physical reclaim chỉ TRUNCATE khi không có live entry;
  cần đo sustained churn/live-entry case, không tuyên bố hard disk cap chỉ vì
  một lần cache rỗng thu hồi thành công.

### UDB invariant — Một Portal identity, nhiều domain stores

1. **Một identity/authorization authority trong mỗi environment**, dùng chung
   cho Research và Execution: user IDs, credential/activation/session,
   owner anchor, membership, grants và audit. Không dựng login/user/grants
   riêng trong Execution DB; không dùng chung auth DB của preview/dev/stable.
2. Giữ Core + Research trên DB hiện có trong lần này. P22 publication đang
   có FK tới `portal_users`, Governance approval và Research pack; không
   tách chúng cơ học rồi mất atomicity/receipt/idempotency hoặc thêm 2PC.
   Không rename Core tables/schema chỉ để đạt sơ đồ target.
3. Tách **Portal-owned Execution data/read-model DB**: process/container,
   named volume, role, migration inventory, connection pool và resource budget
   riêng. Đây không phải Trading System authoritative DB ở AWS. BFF resolve
   principal/scope qua Core, rồi query domain repository; không SQL/FDW/dblink
   qua WAN hay để browser chọn database/relation/credentials.
4. Bobby owner được nhận diện bằng owner anchor gắn với immutable `user_id`;
   preserve toàn quyền quản trị/capability đã thiết kế, không suy owner từ
   username hay role `ADMIN`. Các rule self-approval/quorum/evidence/risk
   không bị xóa để làm flow xanh. Inventory owner-vs-membership semantics
   hiện có; không âm thầm thêm membership/grant hoặc đổi owner khi migrate.
5. Một cơ chế policy, nhưng **quyền khác nhau theo action/resource**. Research
   create/export không tự cấp Execution management hoặc Governance decide.
   TS `account_id` là trading account, không phải Portal user; TS `owner`
   hoặc endpoint đã public không tự tạo Portal grant.
6. Resource mapping phải rõ: Portal `user_id/workspace_id` → authorized action
   → TS Portfolio/Account/Binding ID → environment/profile/contract revision.
   Server kiểm tra object scope **trước** query/cache/export/command. Upstream
   service identity/projection worker không đại diện quyền của browser actor.
7. Disable user, revoke session/token hoặc thu hồi grant áp dụng cho cả loop,
   cache/download và stream đang mở. TTL delegated token phải được ghi rõ;
   không hứa revoke upstream tức thời nếu Edge hiện chỉ kiểm JWT ngắn hạn.
   UI nhận effective permissions từ server, không tự suy theo role hoặc copy.
8. Cache keys/pools/query contexts giữ workspace/profile/resource/actor scope
   cần thiết; response không được đổi provenance workspace thành personal
   workspace của viewer. `FRESH` phải dựa đúng source fact, không timestamp
   worker vừa chạy. Retained preview có `as_of` thật, stale/partial/coverage
   rõ, không được dùng để chứng minh live eligibility hay source acceptance.

<a id="udb-01"></a>
### UDB-01 — Shared identity preservation, PostgreSQL profiles and bounded storage baseline

**Implementation approval:** Bobby giao UDB-01 ngày 2026-10-10. Chỉ phase này
được triển khai; UDB-02…04 vẫn chờ duyệt. Packet: [UDB-01](./research_loop/evidence/UDB-01/README.md).

**Entry:** Bobby duyệt UDB-01; read baseline/rules/packets ở trên; lấy exact
source/runtime/migration/role/volume/resource inventory, không đang deploy,
backup hoặc migration đồng thời. Scope execution và shared infra chỉ theo
allowlist được ghi trong phase, không thay consumer contract/UI đã nghiệm thu.

**Goal:** chuẩn hóa PostgreSQL cho cả loop, bảo toàn auth/owner/Governance và
đóng configuration/resource mismatch trước khi tách dữ liệu.

**To-do BE/infra:**

- Inventory dependency/FK/transaction theo bảng: Core auth/Governance và
  Research authority ở lại; Execution read data/cache/history có thể tách;
  tables workflow/command/audit có dependencies Core không tự move hàng loạt.
  Ghi mapping role/capability/workspace và quyền owner hiện có, kèm source/test.
- Reuse hotfix129/config/ETag body reuse/quota reservation. Thiết kế common
  config + overrides theo preview/P23/dev/stable resource envelope; không
  `1GB shared_buffers × mọi stack`. Budget gồm work_mem theo query concurrency,
  autovacuum workers/maintenance, pool tổng replicas/worker/migrator, WAL/IO,
  shm/pids/CPU/timeouts và headroom cho host/builds. Giá trị là đo được, không
  tự nới P23 SLO/5GB. Không thêm PgBouncer/Redis/NATS KV nếu chưa cần bằng số đo.
- Config versioned/read-only + PG image pin; apply/restart trước trên preview
  theo helper, không đổi major version hoặc sửa tay production release dir.
  Migration forward kiểm legacy ledger/DDL, lock timeout và backup; migration
  repair dùng path kiểm chứng/idempotent, không chỉ nhìn migration number.
- Verify cache capacity/reuse/sweeper dưới nhiều replica và body đổi liên tục;
  logical quota khác physical disk size. Fix đúng thiếu sót được test chứng
  minh; chỉ cache recomputable có thể UNLOGGED/reclaim, không seals/audit/history.
  Không lấy threshold TRUNCATE làm hard cap khi live entry tồn tại mãi.
- Query/bloat/IO/pool/timeout alerts có safe metadata; retention được phân loại
  cache/scratch vs business/evidence. Runtime PostgreSQL thừa hoặc volume ẩn danh
  chỉ inventory/đề xuất target, chưa tự chuyển/xóa stack ngoài preview.

**Tests / exit gate:** `UDB01-T01` owner/users/password hashes/activation/session/
grant/membership preservation, Bobby/Stan/non-owner negative matrix;
`T02` fresh + historical forward DDL/ledger/restart actual config;
`T03` same-body TOAST reuse, body-change churn, quota concurrency, sweeper
lock/live-entry, cache crash loss không mất durable facts;
`T04` per-profile peak RAM/WAL/IO/connection/physical cache bounds trong budget.
**Bobby-approved gate refinement, 2026-10-10:** thay điều kiện chờ24h bằng
qualification theo điều kiện: ghi body gần2MiB đổi liên tục ở15requests/s qua
hai repository/pool, giữ một entry sống để không dùng TRUNCATE; ít nhất ba
chu kỳ TOAST autovacuum và plateau kích thước trong cửa sổ cuối5phút, không
vượt1GiB/row/byte/cgroup budgets. Negative pressure phải chặn leader mới nhưng
giữ fresh hit, rồi phục hồi admission khi pressure được gỡ. Dùng bounded lane
tối đa20phút, có thể kết thúc từ10phút khi đủ mọi điều kiện (≥14 measured rps).
Không đạt thì FAIL/sửa, không kéo dài để kiếm PASS. Reuse focused quota/lock/
crash/identity receipts đúng hash/input; không gọi short lane là24h soak PASS.
Extended24h chỉ là release-confidence bổ sung, không chặn UDB-01. Lane cũ
được dừng/retain dưới disposition SUPERSEDED_NOT_24H_PASS và cleanup exact.
Có thể dùng owned background lane, không lặp full suite mỗi edit.
Code/schema/auth đổi thì chạy affected gates; docs-only không rebuild engine/UI.

**Rollback/handoff:** restore config/image đã pin, pause intake đúng scope;
không down-migrate business data hoặc bootstrap lại user. Report chỉ rõ config
chưa áp ở dev/stable và resource budget bàn giao UDB-02; phase chỉ đóng khi
required tests/C4 đạt. Owner preview review không tự là production rollout.

<a id="udb-02"></a>
### UDB-02 — Isolated Execution data store, explicit pools and retained preview hydration

**Implementation approval:** Bobby giao UDB-02 ngày 2026-10-10. Supersedes
earlier approval-pending notes for this phase only. UDB-03/04, dev/stable,
upstream source/SSE/command activation and remote push remain outside scope.

**Entry:** UDB-01 đạt + Bobby duyệt UDB-02. DB/table ownership, constraints,
pool/budget/migration manifest và authorized target workspace đã chốt.

**Goal:** Research và Execution data độc lập về tải/lifecycle, nhưng cùng
Portal principal/policy; dùng local data hiện có trên preview, không mất RC/R1.

**To-do BE/infra:**

- Provision Execution PostgreSQL/private network/named volume/limited roles
  và explicit domain pool; Core + Research giữ DB/pool hiện tại. Không đổi
  global `DATABASE_URL` để redirect tất cả auth/repos sang DB mới; sửa singleton
  pool wiring nơi cần để nhiều pool thật không thay lẫn nhau hoặc leak clients.
  Không clone Core FK/grants/passwords sang Execution store để tránh sửa boundary.
- Repositories projection/current entities/timeseries/query cursors/read cache
  chuyển theo manifest; authorization vẫn qua Core. Domain tables có FK tới
  Core phải có phương án reference/receipt riêng, không bỏ constraint âm thầm.
  Giữ publication/approval/idempotency/audit authority hiện có; không duplicate
  Governance hoặc command state machine thành hệ thống quyền thứ hai.
- Snapshot read-only Portal-owned Execution data từ nguồn local được inventory
  (ưu tiên đủ coverage), import vào target preview bằng tool/forward migration
  có transaction/checksum/run ID; giữ environment/profile/workspace/catalogue,
  exact decimals/UTC/source timestamps/digests. Không SQL tay sửa authority,
  fabricate rows, promote approval, hoặc copy TS DB, secrets/users/session/grants.
- Nếu cần workspace cho viewer: normal Core provisioning API theo owner scope,
  record/audit trước sau; không đổi data workspace để khớp personal workspace.
  Chỉ chọn một compatible history reader sau count/content/range parity; không
  bật mirror reads chỉ vì mirror có rows, không nhân đôi history vô lý.
- Import bounded current/resource/history data cho màn cần review, không copy
  cache/leases/flights/cursors upstream đã hết hạn như live runtime state.
  Có source manifest, counts/hash/size/coverage và exact target rollback.

**Tests / exit gate:** `UDB02-T01` manifest/count/digest/provenance parity và
forward migration rerun; `T02` Core custody unchanged + own/wrong workspace/
account/profile negatives trên cả stores; `T03` pool separation/bounded queue,
Research load không lấy connection budget Execution; `T04` restart từng DB,
restore target và readback actual BFF, rollback preserve Research/artifact/auth.
Expected source gaps explicit, không coi sparse snapshot là full population.

**Rollback/handoff:** retain original store/volumes, switch reviewed pool/read
profile về baseline và stop only new preview intake; không delete source/data
để rollback. Giao UDB-03 actual row/window coverage và missing-source matrix.

<a id="udb-03"></a>
### UDB-03 — Maximum retained Execution reads, unified resource access and rich-screen handoff

**Implementation approval:** Bobby giao UDB-03 ngày 2026-10-10; parent
`56f2250b`, same `docs/research-loop-plan` branch. Only this phase is opened:
UDB-04, remote push, dev/main/stable, source/SSE/command activation and visual
changes remain outside scope. Read-only baseline/rules and UDB-02 handoff
reviewed before implementation; reader flags must not start a refresh worker.

**Entry:** UDB-02 đạt + Bobby duyệt UDB-03; source/profile/resource scope và
read envelopes đã freeze. Claude có thể nối presentation ngay khi DTO stable.

**Goal:** preview review được mọi panel có dữ liệu local trên cả loop, không
generic unavailable do reader bị tắt; chuẩn bị resource authorization cho
Portfolio/Account TS upgrade mà không invent upstream support.

**To-do BE/contracts:**

- Tách local reader enablement khỏi source refresh worker/upstream config;
  chế độ retained-review phải là versioned explicit profile, không giả flag
  live hoặc source qualification. Bật các named BFF/query/analytics có dữ liệu
  cho Command Center, Fleet/detail/Alpha360, Portfolio360, Account/Binding,
  Paper/Sandbox/Live/Canary composition, Blotter/Ops/Governance trong preview.
  Không unconditionally enable every flag hoặc dựa SSL expired để ngăn writes.
- Upstream unavailable vẫn hiển thị retained history với source `as_of`,
  stale/partial/coverage đúng; không update source clock hoặc mở risk/live
  eligibility bằng preview data. Source pause/circuit/backoff có limit, không
  browser read-through/retry storm; không đổi TLS verification, không TS direct DB.
  Execution command relay/mutations chưa thuộc approval này. SSE source/auth
  activation vẫn theo dev/main rules; không giả heartbeat thành dữ liệu mới.
- Freeze unified access matrix: user/session/workspace + action + resource +
  environment/profile; owner capabilities bảo toàn, non-owner deny mặc định
  nơi chưa có resource grant. Resource object resolution không thay authorization.
  Existing workspace access giữ compatibility theo matrix đã review; không
  thay quyền production cũ hay auto-grant management trong migration.
- Inventory new TS Portfolio/Account named operations/DTO/version/capability
  từ published owner contract khi có; BFF maps actor + resource identity đúng.
  Nếu contract chưa có, chỉ thiếu đúng feature đó, không chặn existing reads.
  Portal-controlled grants và TS resource/policy authority không nhập làm một;
  Edge JWT/scope narrowing phải compatible, không tự thêm claim Edge chưa hiểu.
- Trả effective per-action permissions typed, stale/source flags, denied vs
  unavailable rõ; update OpenAPI/schema/generated/fixtures khi cần. Chốt
  TTL/revoke semantics HTTP/cache/download/stream/delegation trước consumer.
  Nối RC/R1 deep link giữ explicit workspace; không đổi P22 sealed/publication
  semantics hoặc giả chuỗi R1→R2→Canary→Live đã được approve.

**FE handoff:** Claude giữ component/layout/theme/baseline HiFi đã duyệt;
chỉ bind named DTO vào panel + đúng states/permission controls, không replace
rich UI bằng envelope. Bao gồm R1 mobile rail đã ghi trong preview receipt;
visual change vẫn cần scope duyệt riêng. Every screen/subtab có matrix
`operation → resource scope → panel/state → permission → browser assertion`.
Contract available chỉ đóng sau `READ → MAPPED → CONSUMED → BROWSER_VERIFIED`.

**Tests / exit gate:** `UDB03-T01` actual retained BFF/pagination/filter/query/
UTC/decimal/coverage oracle; `T02` effective permission/action vs direct API,
wrong-resource/environment/profile, revoke/disable/cache/download and delegated
expiry tests; `T03` missing/stale nguồn không gây polling/request storm hoặc
hidden source jobs; `T04` browser1280/660 + deep-link/workspace/refresh trên
existing rich routes/subpanels. Actual empty khác not configured/source absent.
Chỉ gọi `RETAINED_PREVIEW_REVIEW_READY`, không source-live/Product GO.

**Rollback/handoff:** rollback preview read profile/pool binding không mutate
grants/artifacts/business data; preserve source/data manifest. Giao Claude
typed examples+source locators và UDB-04 exact candidate/affected-screen list.

<a id="udb-04"></a>
### UDB-04 — Cross-loop authorization, performance/DR acceptance and exact preview rebuild

**Remaining-work approval (2026-10-11):** Bobby giao Codex xử lý bốn summary
SLO, Portfolio/context burst và đúng bootstrap/accessibility trong handoff
Claude, giữ rich design. [Closeout amendment](./research_loop/evidence/UDB-04/closeout-amendment.md)
records scope, affected tests and final evidence; previous FAILs stay open
until actually retaken. No push/dev/main/stable/source/release authority added.

**Implementation approval:** Bobby giao UDB-04 ngày 2026-10-11 (Asia/Saigon).
Codex làm trên `docs/research-loop-plan`, base `16f2c18c`, giữ nguyên toàn bộ
consumer/design của Claude. [Execution packet](./research_loop/evidence/UDB-04/README.md)
ghi candidate, test allowlist, reuse/disposition và bounded teardown. Approval
chỉ mở phase preview này, không mở dev/main/stable, remote push, nguồn Edge,
SSE, command hoặc signed release.

**Entry:** UDB-01…03 đạt + Bobby duyệt UDB-04; một reviewed candidate/config/
image/migration set và FE consumer receipts khớp backend. Không qualify trên
nhiều dirty images rồi gọi là một candidate.

**Goal:** chứng minh storage upgrade + unified rights + hai loop integration
đủ cho Bobby review preview, chuẩn bị P23/P24/release packet, không tự rollout.

**To-do / tests:**

- `UDB04-T01` cross-stack authorization: Bobby owner, scoped Stan/reviewer,
  researcher/read-only/disabled/revoked users; Research → RC → real existing
  R1 + authorized R2/Canary/Live surfaces. HTTP direct vs UI eligibility,
  cross-workspace/object/profile negatives, IDOR, CSRF/idempotency/self-approval,
  cache/stream revoke và upstream TTL khác nhau phải có disposition rõ.
- `T02` mixed load: existing P23 twenty-viewer/one-heavy+queued work và
  concurrent Execution reads; Research aggregate ≤5GB, Execution budget riêng,
  whole-host RAM/pagecache/CPU/IO/pool/disk headroom đo được. Giữ latency SLO
  đã khóa; không lấy total host free RAM hoặc Docker working set thay cgroup peak.
- `T03` fault/DR: từng PG restart/outage/restore, durable artifact bytes + pins,
  auth/owner/grants/publication preservation, Execution offline retained
  continuity và source-backoff. Không restore core snapshot cũ để vô tình hồi
  sinh session/grant bị revoke; cutover cần auth custody/current-state check.
  Ba historical manifest exceptions giữ đúng phạm vi Bobby đã chốt, không
  manufacture bytes hoặc đổi strict denominator.
- `T04` exact preview rebuild qua helper, current commit/images/bundle/routes
  + config/actual DDL receipt. Browser real API hai loop, affected mobile/
  keyboard/a11y/console/deep-link/export; giữ fixture/real/retained-live lanes
  riêng và ghi mọi remaining gap. Không chạy lại engine/UI gates không đổi;
  reuse receipt phải exact hash/input/config, storage/auth đổi invalidate phần đó.
- `T05` C4 teardown/capacity/retention: exact owned test resources, protect
  active/rollback images, named volumes, backup/evidence; no broad prune,
  no VACUUM FULL/no business delete. Backend/FE report và row board cùng scope.

**Exit gate:** mọi required applicable UDB tests đạt + affected P23/P24 gates
được đối chiếu/retake, custody/rollback và cross-loop browser receipts đầy đủ.
Kết quả tối đa `CROSS_LOOP_PREVIEW_READY_FOR_BOBBY_REVIEW`, không
`OWNER_ACCEPTED`, `PRODUCT_ACTIVE` hoặc signed-release PASS từ preview.
Known in-scope fail phải fix trước đóng; source unsupported/ops/owner decisions
ghi đúng ID/disposition, không gọi technical debt đã xong chỉ vì UI hiện shell.

**Release boundary / report:** Bobby review research-portal trước; chỉ sau
lệnh mới được push/PR/dev/main. Cloudflare Access, mTLS/certificate renewal,
profile/source activation, SSE, signed images/SBOM/provenance, stable volumes/
accounts/Roadmap and forward migrations theo existing release workflow,
không config tay release dir. Postgres/cache/isolation changes được đóng gói
trong cùng release v2.0.0 candidate, không bỏ lại thành "cleanup sau".

### UDB planning receipt — 2026-10-10

**Scope thực hiện lượt này:** chỉ bổ sung bốn row vào §13.4 và addendum này
trong `upgrade/UNIFIED_IMPLEMENTATION_PLAN.md`. Không sửa frontend/backend,
config/migration/auth/grants, không restart/build/seed/copy DB, không TLS/
Cloudflare/command/SSE change, không push/merge/release. Validation docs-only:
diff whitespace, internal anchors/local references, bốn phase đúng thứ tự và
đủ entry/goal/to-do/tests/exit/rollback/handoff. Implementation tests còn
`NOT_RUN / AWAITING_PHASE_APPROVAL`, không lấy planning validation làm phase PASS.

### UDB-01 implementation checkpoint — 2026-10-10

**Historical checkpoint:** trạng thái/gate24h dưới đây đã được Bobby-approved
bounded qualification và closeout sau đó supersede;giữ để audit chronology.

Bobby đã giao UDB-01 sau planning snapshot trên. Codex làm trên cùng
`docs/research-loop-plan`, parent9745b9ef; không UI hoặc domain DB split.
Shared preview PostgreSQL16.15 đã áp `preview.conf` (256MiB buffers,
1.5GiB cgroup,60 connections,32MiB ×2 autovacuum), migrations129–130.
Core identity/grants/membership/password/activation/session và Research run/
seal/RC/publication SHA-256 trước/sau **khớp byte**,125 ledger entries sau
forward (trước123); không rewrite lịch sử hoặc bootstrap/reset tài khoản.

Focused real-PG95/95 + config/preview6/6 PASS; actual crash recovery mất
recomputable cache nhưng giữ identity/durable marker. P23 rendered long-running
budget4.6GB không đổi, PG128MiB buffers dưới900,000,000B cap. Existing quota/
ETag reuse được giữ; thêm physical-pressure leader reservation trước source I/O,
fresh hit không bị evict. Backup private0600, rollback render cùng volume và
prior image IDs; APIs/Web200 sau restart. Dev/stable PG IDs/start times vẫn cũ.

**Còn đúng gate của phase:** ≥24h cache-fixture real-PG soak đang chạy từ
2026-10-10T08:58:11.923Z, fixed15 requests/s; không Edge/TS/engine call. Lúc
09:06UTC:7,134 requests,0 denial/error, observed physical peak158,580,736B.
Đây là checkpoint, **không24h PASS**. Collector user service giới hạn25h,
đo actual cgroup charge và tự collect/teardown đúng owned test project khi
writer terminal, giữ report/backup/rollback evidence. Host không có memory.peak;
không lấy Docker working set hoặc invented kernel peak để đóng gate.

[Phase report / FK manifest / test and rollback evidence](./research_loop/evidence/UDB-01/phase-report.md).
State `IMPLEMENTED_PREVIEW / SOAK_24H_RUNNING`; required pending soak/cleanup
không được gọi phase hoàn tất. UDB-02…04 chưa được giao; chưa push/merge/release.

### UDB-01 closeout — bounded qualification approved and passed,2026-10-10

Bobby duyệt bỏ24h khỏi exit gate;dùng sustained changed near2MiB payloads,
real vacuum/plateau,pressure negatives,cgroup/custody/crash proofs. Final lane
16:35→16:45ICT:8,969 writes/602.478s,119 TOAST autovacuum cycles;physical max
318,799,872B <1GiB,PG sampled charge554,508,288B <899,997,696B,OOM0.
Fresh sentinel không mất,no TRUNCATE;pressure denies new leader but serves hit,
normal admission recovers. All predicates PASS,writer/collector exit0,hashes
verified. Exact fixture containers/network/volume đã dọn;private reports,
0600 backup và rollback image IDs giữ30days. Extended24h không được gọi PASS.

95/95 focused real-PG +7 config cases PASS,reuse đúng source/hash không chạy
lại engine/UI gates. Preview129–130/Profile đã applied,custody16tables
unchanged;common dev/stable config chỉ versioned,không rollout. Grouped local
commit qua normal hook,no bypass/push. **UDB-01 PASS / zero known in-scope
debt**;UDB-02…04 vẫn chờ Bobby duyệt từng phase. Đây không phải hydration,
cross-loop product acceptance hoặc releaseGO.
[Full test/resource/file manifest and Claude handoff](./research_loop/evidence/UDB-01/phase-report.md).

### UDB-02 closeout — isolated store and retained hydration,2026-10-10

Bobby giao UDB-02;parent4a79429a,nhánh Research chung. Preview có private
Execution PG16.15/512MiB/64MiB buffers,role hạn chế/pool6+queue12;Core +Research
giữ DSN/volume/authority. Independent ledger131.execution-store.v1 reuse16
hash-pinned DDL;27domain tables/14FKs,workspace references không là quyền.
Seven data repositories +Command Center projection dùng domain pool riêng;
auth/Governance/command/RC→R1 vẫn Core,không giả cross-DB atomicity.

Hai local-Portal read-only imports có run ID/count/hash/transaction/rerun:
3profile/6manager snapshots,254fleet rows(206unique All),174bindings,2portfolios,
49,421 bounded legacy history;thêm4,136 current entities với100batches/7revisions/
1,808observation receipts cần cho FK. Mirror history0,không duplicate history,
không cache/lease/flight/live resume state. Latest source-refused snapshots và
source_as_of null được giữ;older current facts chỉ là retained observation.

38/38 focused real-PG +7config assertions/build/syntax PASS;final live14BFF
cases +restored13cases và10-table hashes PASS. Each DB restart independent;
actual reconstructed-parent rollback/reapply giữ cả volumes/Research artifacts.
Original auth/owner/grants/19,035sessions byte hashes,112runs/37seals/4packs/
2publications/125migration entries unchanged. Chỉ thêm1audited owner workspace/
membership;12ordinary test sessions đều REVOKED,không reset account/password.
Normal grouped commit hook;no engine/visual/24h retake.

[Full receipt, historical failures/fixes and C4](./research_loop/evidence/UDB-02/phase-report.md) ·
[UDB-03/Claude exact coverage handoff](./research_loop/evidence/UDB-02/handoff.md).
Owned disposable cells/temp rollback worktree đã dọn;root27%free(~180GB),
backup/evidence/rollback aliases retain30days,no broad prune. **UDB-02 PASS /no
known in-scope debt**;UDB-03/04 chờ Bobby giao. No public DTO/UI/remote push,
dev/main/stable/source/SSE/command activation. Future split P23 budget chỉ
versioned,không lấy old qualification làm combined-stack PASS.

### UDB-03 backend closeout — retained reads / Core policy / rich handoff,2026-10-10

Addendum sau thắng trạng thái approval-pending của UDB03 trong notes lịch sử;
không đổi UDB04 thành được duyệt. Parent56f2250b,nhánh Research chung.
Preview `retained_review_v1` tách readers khỏi source workers: các resource/
stage/query/history/composition và54 named aliases đọc local across3profiles,
giữ nguyên source clock/refusal/digest,STALE/PARTIAL/uncaptured typed đúng.
Opaque page≤200rows/1MiB,exact decimals/UTC,no upstream selector/read-through.
Core forward132 thêm một audited30day GET-only grant,không clone role/grants/
membership/password; mỗi request kiểm Core session/user/resource/workspace/
profile/action. Research RC→R1 vẫn explicit workspace gốc. No-store,permission
cache0,data memo2s/max3profiles/8MiB,pool6/queue12;busy503 có Retry-After.

Final API image ac7bb295…healthy,web index-hBXCtrBk.js **không đổi**.
UDB03-T01…04 backend/existing-rich receipt PASS:222HTTP(181named pages
validate schema),68browser cells1280/660,console/fail/pageerror/stream/write/
external0. p95serial396ms **không** mixed-load/SLO. Core authority+Research
hash giữ nguyên,19,047originalsessions hash giữ nguyên,9/9review sessions revoked;
identity authority unchanged sau tách last_seen telemetry;ledger125→126 chỉ132.
OwnedPG/tool containers0,dọn đúng3unusedUDB03images,current+rollbackprotected,
không prune shared cache/volume. Một normal grouped commit hook gates landing.

**BACKEND_PASS / RETAINED_PREVIEW_REVIEW_READY / FE_HANDOFF_PENDING**;
không có known in-scope backend implementation debt. Không giả frontend đã
READ→MAPPED→CONSUMED→BROWSER_VERIFIED cho context mới: Claude nhận
FE-UDB03-01(state/permission binding),02(no stream/retained polling),03(existing
Alpha360desktop/R1mobile visual review). No frontend design/baseline edits.
[Report + private evidence hashes](./research_loop/evidence/UDB-03/phase-report.md) ·
[Per-screen matrix](./research_loop/evidence/UDB-03/screen-matrix.md) ·
[Claude prompt/handoff](./research_loop/evidence/UDB-03/handoff.md).
UDB04 chỉ mở sau Bobby giao và exact FE/candidate acceptance. No remote push,
dev/main/stable/AWS/Edge/TS/source/SSE/command/ProductGO/release activation.

### UDB-03 consumer review refinement — 2026-10-11 (Asia/Saigon)

Bobby approved finishing Codex's review of Claude13f64a3a/1c01aefb. Those
commits are preserved on the same Research branch. Delivered: context scoped
to principal/session, expiry/logout/late-response cleanup, strict published
schema/UTC reading, no stream/poll on auth/transient/malformed context failure,
and four formerly NEEDS_CODEX_REVIEW persistence tables classified by actual
owner/operator/migration call graph. No backend logic/migration/source change.

91targeted FE tests +typecheck PASS; web-only preview rebuilt with existing
design/banner, no baseline change.6affected browser cells1280/660 and3explicit
context fault injections verified; final raw receipt preserved and telemetry
classification verified separately. All3 owned test sessions revoked. No full
engine/frontend/68-cell rerun for unchanged dependencies; normal grouped
commit hook required, no bypass/push. [Exact report/images/hashes/C4](./research_loop/evidence/UDB-03/codex-consumer-refinement.md).
State **SCOPED_FE_CONSUMER_VERIFIED / RETAINED_PREVIEW_REVIEW_READY**;
UDB-04/cross-loop HiFi/ProductGO/dev/stable/release remain separately unopened.

### UDB-04 acceptance checkpoint — 2026-10-11

Supersedes only the historical "UDB-04 chưa mở" state above: Bobby has opened
UDB-04, not dev/main/stable/source/release. [Packet](./research_loop/evidence/UDB-04/README.md)
records delivered auth/data-cost/outage/workspace-link fixes, exact preview,
actual receipts, reusable byte hashes, failed attempts and bounded teardown.
28auth cases/current-auth DB cutover PASS;20reader mixed load still fails5
summary SLOs;68browser cells retain Portfolio burst, CC bootstrap and6Axe
failures. Original artifact backup68/68restore is distinct from77clone-byte
parity; next final candidate must retake corrected final archive/recovery.
No final phase/owner/P23/P24/release PASS. Source16Core/6Roadmap custody and
original identities preserved;23owned test users/20grants revoked and8services/
5clone volumes removed, original backups30days. Codex owns BE/DR remaining;
[Claude](./research_loop/evidence/UDB-04/handoff.md) owns scoped FE correction.
Normal grouped hook/commit, no remote push; post-commit actual COPY hash binds
the existing compiled image without unnecessary docs-only rebuild.

### UDB-04 later acceptance checkpoint — 2026-10-11

**Later cache amendment:** Bobby explicitly approved Codex to synchronize
backend + contract + strict frontend validator to16MiB, preserving design.
[Receipt/handoff](./research_loop/evidence/UDB-04/cache-limit-amendment.md)
supersedes the old8MiB/not-activated setting below, not the failed gates.
TTL2s, zero permission cache, exact Core authority and source/SSE/commands off
unchanged. Overall **ACCEPTANCE_OPEN_NOT_PHASE_PASS**.

The [packet](./research_loop/evidence/UDB-04/phase-report.md#later-checkpoint--same-scope-new-real-evidence)
supersedes only the earlier NOT_RETAKEN artifact state. One new real64trial
child+4queued intents,20principals/1,000GETs:HTTPerrors0/OOM0,observed cgroup
charge1,787,994,112B/hard cap4,536,870,912B. Four summary paths still FAIL
500ms:Library679/Progress631/Evidence744/CC626;Report441msPASS. No SLO relaxation.

Core outage revealed Docker DNS`EAI_AGAIN`→500; fixed to sanitized authority
503, with12unit tests and actual outage retake.28auth cases +current-auth
cutover/stale-backup rejection +27Execution table hashes +fresh-volume final
archive recovery **69/69manifests**,3,212files/72,511,079B PASS. Original68/77
proofs and83/86historical exceptions remain separate. Failed attempts/backups
preserved; final cache bound remains8MiB to match published context/FE.

Still **ACCEPTANCE_OPEN / NOT_PHASE_PASS**: four SLOs,Portfolio/context burst,
Claude retained CC bootstrap and6Axe cells; final one-candidate reconciliation.
No FE edit, source/SSE/command activation, remote push,dev/main/stable/release.

Final scoped runtime: Control4278509a/COPY7d20d6eb(549files),app-only
research preview rollout21:57UTC,cache8MiB; no shared PG restart/migration.
Final clone teardown8services/5volumes,remaining0;23test identities and20grants
revoked. Current-auth and final69manifest archive retained30days. Final shared
custody16Coregroups/6Roadmaptables PASS; disk free26.80%,no broad/image prune.
Normal root hook required for checkpoint commit; no failed gate relabelled PASS.

### UDB-04 remaining-work closeout — 2026-10-11

Bobby giao xử lý bốn summary SLO, Portfolio/context và đúng phần bootstrap/
accessibility; parent734f5c36, cùng `docs/research-loop-plan`.
[Receipt](./research_loop/evidence/UDB-04/closeout-amendment.md) /
[sanitized hash index](./research_loop/evidence/UDB-04/closeout-index.json)
supersede các OPEN/FAIL đã định danh, giữ nguyên lịch sử phép đo thất bại.

Backend: narrow claim+current enrichment trong cùng authorized snapshot,
bounded pending-only batch và exact-byte pure math reuse; Portfolio chỉ wire
200publicrows và đếm UTF8/giới hạn1MiB chính xác; aggregate16MiB/2s có
source-revision revalidation, không authority cache/TTL trượt/quota/SLO nới.
20principals/1440full-bodyGET +real64trial child/4queued: Library445,
Progress224,Evidence327,Report265,CC448,Portfolio371/context265ms p95PASS;
HTTP/OOM0,observedcgroup1,527,185,408B≠lifetimepeak,hardcap4,536,870,912B.

FE: retained/pending/denied/malformed context chặn CC bootstrap và Replay
Manager/venue source loaders/paging; không mở quyền để chữa source404.
Fleet native disclosure, SourceHealthBoard/Panel keyboard scroll region,
existing named banner/R1 contrasttokens; giữ layout/design/baselines của Claude.
68route/tab/mobilecells,8Axe,4explicitcontextfaultcasesPASS;401 unmount theo
authgate cũ,0bootstrap/stream/idleAPI/overflow/app errors,RefreshGET/contextonce.
32freshauthcases,affectedownedPGoutage/restart/exportPASS. Recovery69/69/
27hashes reuse theo unchangedstorage/auth/workerbytes,không chạy lạiengine/
restore hay trộn83/86+3exception/68/77population thành một denominator.

Preview chỉ cập nhật Control/web qua helper,6non-appcontainers không đổi,
16Core/6Roadmap/migration/FK/bindingauthoritycustodyPASS.23testidentities/
20grants revoked,2exactcloned-owner sessions revoked,không resetpassword;
8services/5ownedvolumes removed,remaining0/0,backup/evidence30days.
Không broadprune/VACUUMFULL; C4quiet-window candidateimage inventory sau
retention riêng,protectcurrent/rollback. Normal-hook commit và exactCOPYhash
check là gate cuối; không rebuild app vì thay markdown alone.
Hook attempt1 có đúng1FAIL ở admission mock chỉ nhận SQLstring; đã nhận pg
queryconfig và assert preparedname,giữ2active/18queued/overflow;targeted2/2PASS.
LogFAIL giữ riêng; retryordinaryhook,không rerunengine/load/browser/DR vìtestonly.

Verdict tối đa `CROSS_LOOP_PREVIEW_READY_FOR_BOBBY_REVIEW`; không owner visual
acceptance, nguồn/Edge/SSE/command/livecapture, push/dev/main/stable/release.
ActualStan absent→NOT_TESTED; downstreamcapture thiếu vẫn typed. Bobby review
research-portal trước khi quyết phase/release tiếp; không tự mở scope mới.

### Governance UX §56 — Optional backend source metadata (2026-10-11)

Claude's request at [backend queue §56](./research_loop/CODEX_BACKEND_GAPS_2026-09-30.md#56--governance-ux-consumer-two-optional-fields-so-r1-can-name-its-sources-and-the-new-request-entry-can-stop-typing-claims-claude-2026-10-11)
implemented on `docs/research-loop-plan`, parent`b70d0559`; delivery is gated by
one ordinary root-hook commit. [Receipt/handoff](./research_loop/evidence/P22/GOVERNANCE_UX_OPTIONAL_SOURCES_2026-10-11.md).

Existing R1 checklist gets hash-bound `evidence_ref` or null+typed reason;
existing Library gets the exact workspace/run-bound R1 intake claim ids and
typed metadata absence. No fabricated Report link, grade/state or eligible claim;
GET does not run the P22 bridge or change authorization. SQL join happens after
the bounded page, in the existing fresh authorized read-only snapshot; migration
045's existing SELECT grant suffices. No new route/migration, gate/verdict change,
frontend design/edit, engine run, runtime rebuild, Edge/SSE/command activation,
remote push, dev/main/stable/release. Backend71 and contract6 focused tests PASS;
new real-PG regressions run in the mandatory normal hook. Claude consumes generated
types and preserves workspace on navigation, then supplies affected browser receipt.
This is not a P24/product/owner acceptance or release amendment.

### Governance cross-loop repair — Bobby-approved 2026-10-12

**BACKEND_REPAIR_VERIFIED_AFTER_NORMAL_HOOK · FRONTEND_HANDOFF_OPEN.** Bobby approved
repairing the gaps found by the read-only Research→RC→Inbox→R1→R2 audit on
`docs/research-loop-plan`, base `be35972a`. No push, production/dev/main,
preview rebuild, source/SSE/Trading System command or new grant activation.

- Publish an additive, manifest-bound R1 decision context (workspace, version,
  exact unique evidence hashes and the existing named plan operation); preserve
  all CSRF/RBAC/self-approval/expiry/current-version checks on POST/apply.
- R2/Live review must not advertise executable decisions when no such executor
  exists. Publish a typed action refusal, align Inbox `needs_you`, and reject a
  misaddressed R1 command with a precise gate-mismatch reason. Do not commission
  an Execution authorization by reusing an R1 command.
- Publish bounded R2/Paper Exit capture inputs from the existing exact parent
  review and accepted Paper projection; source-off/retained/stale/missing facts
  remain explicitly blocked. No guessed portfolio/currency/grant/digest.
- Preserve explicit workspace on R2→R1 links. Give Claude a concrete handoff
  for decision hashes, capture binding and workflow-position vs verified-state
  rendering; Codex does not edit frontend source/design/baselines.
- Capture preserves the existing ADMIN prerequisite and additionally checks
  parent/target gate visibility in the exact workspace before write/replay.
  A fresh shared owner/delegated-rights read is used, never a new capability or
  cached permission. Separate UDB store reads use the Execution pool, not Core.
- Test affected contracts, real PostgreSQL/API authority/negative/replay paths
  and context bounding; regenerate types, run one ordinary coherent commit
  hook, record scoped cleanup. Existing engine/load/DR proofs are reused only
  where unchanged. Backend delivery is not browser or full active-chain proof.

Delivery: GOV-BE-01…06 in queue§57; new `DecisionContext`/`CaptureContext`, scoped
generation and canonical fixture. [Backend receipt](./research_loop/evidence/P22/GOVERNANCE_CROSS_LOOP_REPAIR_2026-10-12.md)
records54/54 final real-PG/API tests, restore,139/139 contracts/fixtures, clean FE
typecheck, first full-run test contamination and only affected retake, C4 and
derived N29/EDS-12 digest refresh (`runtime_effect:NONE`).

**Frontend consumer (Claude, 2026-10-12): FE-GOV-01…04 landed on `claude/fe-parity`** — R1 plan pins + request-changes conditions, Paper Exit digest pins,
no decision path for R2/Live, capture next-step from `capture_context`, bounded R1 backlink + workspace re-read, gate track = position. Fixture/unit 2082 pass;
browser on the retained preview 1280/660 (workspace kept on reload, 0 idle polls, 0 cross-origin). **Not observed:** real R1 plan/apply, positive capture,
409 gate mismatch (no approval/candidate on the shared preview). Open: CG-GOV-01 (Paper Exit evidence-hash set). [Receipt](./research_loop/evidence/P22/GOVERNANCE_CROSS_LOOP_CLAUDE_RECEIPT_2026-10-12.md).
[Claude FE-GOV-01…04 handoff](./research_loop/evidence/P22/GOVERNANCE_CROSS_LOOP_CLAUDE_HANDOFF_2026-10-12.md)
owns consumer hash/condition binding, captures, no R1 alias for R2, workspace and
gate-track truth. R2/source promotion remains explicitly uncommissioned; not a
P24/owner/full-chain GO. Delivery SHA is the commit containing this entry; no push.

**CG-GOV-01 backend amendment (Codex, 2026-10-12; parent`5df904bd`):** Paper Exit
now emits its own optional verified `decision_context` with exact manifest hash
list, workspace/review/version/source pins and named Paper Exit command. Earlier
lineage-pin guidance is superseded. Existing eligibility/policy and R1/R2 types
unchanged; safe extend/reject is not disabled merely because promotion is blocked.
Focused19 backend/7 contract tests PASS; isolated real-PG read→plan→apply and
lineage-set mismatch regression run once in the ordinary delivery hook.
[Receipt and Claude binding handoff](./research_loop/evidence/P22/CG_GOV_01_PAPER_EXIT_CONTEXT_2026-10-12.md).
CG-GOV-01 backend delivery is the commit containing this entry; FE mapping and
positive shared-preview browser lanes remain OPEN. No FE design edit, migration,
new rights, runtime rebuild, upstream activation, remote push or dev/main/release.

### P17 / queue §58 — Explicit split, continuous Replay and boundary facts (2026-10-14)

Codex implements CG-RP-01…05 on `docs/research-loop-plan`; concurrent Claude
`0c1a6e42` preserved, no FE source/design edits. Backend delivery SHA is the
normal-hook commit containing this entry.
[Receipt and Claude handoff](./research_loop/evidence/P17/CG_RP_01_05_REPLAY_CONTINUITY_2026-10-14.md)
· [request ledger §58](./research_loop/CODEX_BACKEND_GAPS_2026-09-30.md#58--s08-execute-replay-continuous-cross-fold-play-mode-5-shape-boundary-facts-claude--codex-2026-10-14).

- Exact served Mode5 `SINGLE_FULL_WINDOW` + full-sample ordinal span, no held-out
  OOS/Holdout. Known other protocols retain fold windows; legacy absence typed.
- Signed run-global next/previous page cursors and boundary crossing facts;
  exact adjacent selected-parameter hashes/trial/study + retained account-policy
  carry/reset/close facts. Chart appending does not imply account carry.
- Replay-only max400 bars, existing1MiB cap; byte-limited windows preserve edge
  continuity. Generic Search/journal limits remain200. Source/RC/Report revision
  pins unchanged; no source/artifact mutation, migration or engine recompute.
- Zod/OpenAPI/generated types, labelled synthetic fixtures and focused68backend /
  4contract tests PASS; Replay24/24 after the full-reader Mode5 test. Disposable
  PostgreSQL/authenticated API, build/restore/contracts run in one ordinary
  coherent commit hook, not a new preview/engine/load/visual campaign.

**Remaining owner: Claude** consumes additive fields/cursors and supplies the
affected component/browser receipt while retaining chart/clipping/UI. Runtime
preview rebuild/activation, product/owner acceptance and release are not claimed.

**§58 delivery update:** main commit`647cec8b` passed ordinary API2,562/3opt-in
SKIP, contracts343, production build/generated/restore gates; frontend `tsc -b`
PASS without FE edits. A final backend-only boundary refinement (preparation
prefix/incoming gap;6derivation and24Replay tests PASS) goes through its own
normal commit hook. C4 snapshot/teardown is recorded in the linked receipt.
CG-RP-01…05 backend DELIVERED; Claude's consumer/browser lane remains separate.

### P17 / queue §59 — Measured large Replay windows and whole-fold reads (2026-10-14)

CG-RP-06…08 backend delivery is the ordinary-hook commit containing this entry.
Baseline `ac715e6a`, lane `codex/be-gaps` → clean FF Research only. Current-source
Replay admits8,192 requested bars, retains1MiB logical JSON and exact source;
greedy packing replaces halving, proven minimum-row byte bound prevents SQL
overfetch while cursor fingerprints still bind the original requested limit.
Actual preview read-only full58,848/11,832 ordinal chains PASS in73/11responses;
projection hashes unchanged through optimization. Final two-reader p95307/280ms
replaces the observed pre-fix520ms finding, not a threshold waiver. Real-HMD
1,056-row fixture exercised via authenticated disposable-PG BFF; complete168-bar
folds fit one seek. Larger2,160+bar folds exceed1MiB and use contiguous chunks.
[Measurements, pins, regressions, C4 and Claude instructions](./research_loop/evidence/P17/CG_RP_06_08_REPLAY_WINDOW_MEASUREMENTS_2026-10-14.md).
No FE source/design, migration/profile, preview rebuild, engine/source call,
push, dev/main or production change. Claude owns max_bars consumption, measured
chart trail/markers/memory and affected browser receipt;600 trail not qualified
by backend timings. Normal commit hook/landing and final C4 are required as
recorded in the packet, not implied by the focused measurements.

### Governance → P23/P24 preview continuation — Bobby approved, 2026-10-15

Owner-approved order: existing R1/Paper Exit → Portal-local R2/Live decisions
→ dependency-scoped P23 qualification reconciliation → P24 preview acceptance.
This is a continuation of P22–P24, not a new phase or release authorization.
Base `051eeb89`, backend lane `codex/be-gaps`; preserve Claude's frontend,
land only on `docs/research-loop-plan` after normal grouped hook/clean FF.
No remote push, dev/main merge, signed release, production/source activation.

| Slice | Scope / exit | Current state |
| --- | --- | --- |
| GOV-C1 | Research RC→Inbox→independent R1/Paper Exit plan/apply, evidence/hash/CAS/idempotency/revocation/workspace controls; exact real versus technical evidence labels | BACKEND_TARGETED_PASS: 106 unique API/PG cases across scoped runs + restore; real source capture remains conditional |
| GOV-C2 | Explicit per-gate Portal decision contracts/executors for R2/Live; fresh exact capabilities, immutable evidence/lineage, quorum/audit/replay; never alias R1 or emit execution commands | R2_LOCAL_IMPLEMENTED; Live own command/read delivered but LIVE_PARENT_NOT_PUBLISHED, not commissioned |
| GOV-C3 | P23 gate→receipt→dependency hashes→reuse/invalidation matrix; accepted exact-three historical manifest exception remains 83/86, never strict PASS | MATRIX_AND_VERIFIER_DELIVERED; 15 scoped rows/23 raw hashes, no blanket current-candidate qualification |
| GOV-C4 | P24 affected preview journey/authority/protected-data T02/T14, unsigned candidate and Claude consumer handoff; max READY_FOR_BOBBY_REVIEW | PENDING_PREVIEW_AND_CLAUDE_CONSUMER; no release authority |

Capture requires accepted fresh source evidence; retained observations cannot
be promoted into live authority. Qualify source-independent Portal records in
an isolated cell, preserving the shared retained preview's read-only source
mode. Missing source-backed capture is a named disposition, never fake PASS.
Backend changes must publish generated contracts/canonical fixtures and the
exact Claude field/action/story handoff; Codex does not edit approved UI.
Focused gates per affected slice, one normal grouped commit gate; do not
repeat unchanged engine/load/DR evidence. Owned test identities/resources get
bounded C4 cleanup and private evidence retention.

Live ledger / authority matrix / receipt index:
[P22 continuation packet](./research_loop/evidence/P22/GOVERNANCE_P23_P24_CONTINUATION_2026-10-15.md).

Claude's bounded contract/story tasks:
[FE-GOV-C01…05](./research_loop/evidence/P22/GOVERNANCE_PORTAL_DECISION_CLAUDE_HANDOFF_2026-10-15.md).
P23 [dependency/custody dispositions](./research_loop/evidence/P23/GOVERNANCE_DEPENDENCY_DISPOSITION_2026-10-15.md)
preserve unchanged numerical scopes, exact83/86 exception and unresolved
image/COPY/config custody; they do not imply that all gates ran on one image.

#### Governance continuation — coherent backend / preview return, 2026-10-15

**`5ca9d167`** passed the normal grouped hook (Control API2,589 PASS /3 SKIP,
build and real PG dump/restore) and landed by clean FF on this shared branch.
Scoped Control-only preview rebuild/migration133 completed;13 protected table
fingerprints match before/after all probes,7 other services/images unchanged,
source/SSE/relay/mirror flags remain off.24 GET checks plus actual existing-R1
browser1280/660 passed; Inbox24.153ms p95 is2 rows/one reader only, not the
mixed-load gate. No web/worker rebuild, test account/grant or business seed.

| Slice | Updated exit disposition |
| --- | --- |
| GOV-C1 | BACKEND_TECHNICAL_PASS_AND_EXISTING_PREVIEW_READ_PASS; independent plan/apply/quorum/rollback is real disposable-PG HTTP, not shared-source positive capture |
| GOV-C2 | R2_LOCAL_EXECUTOR_TESTED; actual Live gate/own command/read, still LIVE_PARENT_NOT_PUBLISHED; no upstream effects |
| GOV-C3 | SOURCE_CUSTODY_MATRIX_AND_VERIFIER_DELIVERED; affected technical regressions/current preview bound, no whole-candidate P23 certificate or invented receipt reuse; historical83/86 remains |
| GOV-C4 | PENDING_CLAUDE_FE_GOV_C01_C06; actual shared preview remains entirely read-only for Execution POST; no whole-P24 READY or owner acceptance |

[Runtime/image/private-byte custody index](./research_loop/evidence/P24/governance-preview-closeout-index.json)
and [affected P24 return](./research_loop/evidence/P24/GOVERNANCE_AFFECTED_PREVIEW_ACCEPTANCE_2026-10-15.md).
Claude consumes **FE-GOV-C01…06**, including retained runtime override and
distinct Core/store workspace semantics, before affected browser acceptance.
All probe sessions logged out201. C4-GOV-CAPACITY-01 is the named, separate
cache inventory follow-up at25% root free; do not prune active/rollback assets.
No remote push, dev/main merge, signed release or production/source activation.

<a id="execution-loop-v2"></a>

# 14. Execution Loop Portal V2 — guide onboarding và authority alignment

Bobby giao ngày2026-10-15: đọc toàn bộ bundle mới, đối chiếu đúng source
worktrees trên AWS HK và thêm rules cho Claude nâng cấp UI/UX manager-first.
Prompt B/C/D và bổ sung authority của Bobby được áp dụng trong
[campaign entry point](./execution_loop/README.md) và
[shared agent / Claude rules](./execution_loop/AGENT_WORKING_RULES.md).
Không copy lại toàn guide hoặc mở implementation từ việc nhận tài liệu.

| Track | Detailed authority | Disposition hiện tại |
| --- | --- | --- |
| Portal ELP2-00…11 | [BE guide v1.2](./execution_loop/EXECUTION_LOOP_PORTAL_V2_BACKEND_DATA_CONTRACT_GUIDE_v1.2_VI.md) | 00 audit delivered;01–04 landed,04=`2ec5924d`, final hook contracts574/API3,306 PASS+3 existing skips/restore PASS.05=`c4109ef3` [catalogue/source gates](./execution_loop/evidence/ELP2-05/README.md).06=`42c39079` [Manager technical return](./execution_loop/evidence/ELP2-06/README.md).07 assigned: [trusted command/status component and exact source gaps](./execution_loop/evidence/ELP2-07/README.md); full source/operation/consumer exit NOT_MET.08…11 NOT_STARTED; no shared-runtime activation |
| Edge EPG10-00…11 | [Edge guide v1.2](./execution_loop/EXECUTION_PORTAL_EDGE_UPGRADE_GUIDE_v1.2_VI.md) | GUIDE_READ; HK inspection READ_ONLY; no Edge source/runtime changes |
| Claude UXM-00…10 | [UX guide v1.1](./execution_loop/EXECUTION_LOOP_MANAGER_UX_DESIGN_GUIDE_v1.1_VI.md) | RULES_READY; browser audit/new design/implementation not performed in this package |
| Shared score / Regime | [FINAL v1.1](./execution_loop/SCORE_REGIME_SPECIFICATION_v1.1_FINAL_VI.md) | Formula/weights/bands selected;06 pure reference/calculation tests delivered, no request-path computation. Runtime source/calibration/config and Regime inputs still pending; API scores null/policy_pending |

[Source alignment receipt](./execution_loop/evidence/SOURCE_ALIGNMENT_2026-10-15.md)
pins Portal5f3f2332, TS4e9c5f29, PMd16aa2b5, DL864774d5 with full SHAs,
dirty states, guide hashes and limitations. PM R2 is read in its own PM
worktree; TS untracked copy differs. Latest TS/DL journal advances beyond guide
pins and records stage-100 in progress; journal is not direct runtime proof.
At that inspection feasibility/lowfi were missing; the subsequent receipt
[planning addendum](./execution_loop/evidence/PLAN_ALIGNMENT_2026-10-15.md)
records their arrival and inspection. Full prompt companion and numerical
receipt/script companions remain unverified; historical missing-input evidence
above is preserved, not a current blocker for reviewing the two supplied images.

Current integration branch stays `docs/research-loop-plan`; source inspection
does not certify this checkout as deployed Execution. No main/dev merge,
remote push, build/migration, service/TLS/credential change or live activation.
Normal build/DB commit hook is PENDING under this read/docs-only package,
never bypassed. The prior Research/Governance/P23/P24 evidence is preserved,
not upgraded to complete by this new campaign. Existing §12 is historical;
this §14 is the new campaign's single live index when phases are assigned.

**Current return,2026-10-16:** Bobby assigned ELP2-00; the
[phase packet](./execution_loop/evidence/ELP2-00/README.md) now supersedes prior
source pins for next-work planning, without deleting their history. Portalbe56,
HK TS6e0244d6→e8cd7b7c dirty / PMd16aa2b5 / DL0ffdae26; source vs actual
stable/preview/Edge images distinct. Next proposed assignment is ELP2-01
schema/golden fixtures. Claude UXM-00 can be assigned independently; request001
in the packet defines exact audit/handoff. Owner acceptance still PENDING;
no phase01 implementation, remote change or activation implied.

<a id="elp2-sequencing"></a>

## 14.1 Thứ tự triển khai — contract-first, UI song song

Planning addendum theo Bobby, 2026-10-15 (Asia/Saigon). **Các phase bên dưới là
PLANNED / NOT RUN trừ explicit phase return; plan không cấp quyền runtime.** Codex
backend-first, Claude design/frontend-first; mỗi gói phải được giao trước khi
triển khai. Nhánh tích hợp giữ `docs/research-loop-plan`, không dev/main.

| Đợt | Codex/backend | Claude/frontend | Dependency để đi tiếp |
| --- | --- | --- | --- |
| A — hiểu đúng nền | ELP2-00; Score P0 inventory | UXM-00 audit/reuse, xem hai lowfi | Source/runtime tách biệt; authority/scope decisions có owner |
| B — khóa ngôn ngữ chung | ELP2-01 contracts, canonical fixtures; thiết kế identity/policy/publication | UXM-01/02 IA, metric dictionary, role journeys | Schema/field grain và restricted disclosure được review; không dựng quyền từ UI |
| C — nền dữ liệu và thiết kế | ELP2-02/03/04; ELP2-05 từng family; ELP2-06 projection và Score P1 theo inputs đủ | UXM-03/04/05 lowfi → UXM-06 HiFi được Bobby duyệt → UXM-07 fixture implementation | Có thể làm song song theo owned files; chưa mở real data/commands khi thiếu gate |
| D — nối đọc thật | ELP2-06 selected reads + ELP2-08 handoff; ELP2-09 theo stream đủ continuity | UXM-08: Overview/Portfolio → Fleet → Alpha/Account/Deployment; Score P2 | ACL + publication + metric + resource evidence từng endpoint; retained không gọi live |
| E — thao tác có authority | ELP2-07 exact operations, status/recovery; ELP2-08 workflow | UXM-09 confirmations/receipts/unknown/revoke | TS/PM authority + Edge relay/trust + approval exact operation×environment; không tự Live |
| F — nghiệm thu selected scope | ELP2-10, Score P3, rồi ELP2-11 | UXM-10 browser/accessibility/performance/handoff | Đối chiếu source/dependency hashes; release/deploy là approval riêng |

Không buộc mọi family hoàn tất trước read-only slice đầu tiên. Cũng không gọi
toàn campaign COMPLETE khi chỉ selected scope PASS. Contract/design command có
thể làm sớm sau B; runtime command cần E. Regime không là dependency của F(NAV),
và analytics thiếu không được khóa close/reduce-risk đã có quyền.

Hai ảnh là **lowfi yêu cầu dữ liệu**, chưa là approved HiFi. Giữ đủ hàng/cột,
nhưng Claude được thiết kế hierarchy và interaction theo UX guide:

- [Overview lowfi](<./execution_loop/ChatGPT Image Oct 15, 2026, 11_56_37 PM.png>):
  Initial/Added funds không tự tạo cohort PnL khi nguồn không có attribution;
  “Portfolio Score (QBTS Weighted)” phải map theo score spec thành **direct
  PortfolioScore từ NAV** và **allocation composition** riêng, không tráo tên.
- [Fleet lowfi](<./execution_loop/ChatGPT Image Oct 15, 2026, 11_56_58 PM.png>):
  giữ Alpha/Version, Owner/Portfolio, Stage, Alloc, PnL, Unrealized, Internal
  Account Balance, Equity30D, Health/Source, QBTS; All là navigation, không
  cộng actual và virtual. Sort/filter/group trên authorized full result.
- Guide bổ sung Paper/Archive và các màn detail; ảnh không phải permission
  mở mọi cột cho researcher. Chưa có HiFi cuối; UXM-06 phải publish revision
  và link vào đây trước khi gọi nghiệm thu visual.

## 14.2 Backend hiện có, khoảng thiếu và consumer

Source inspected tại `be56efdf8a44b0fd8cd44202b04ada582293a1dd`; đây không phải
deployed manifest. [Receipt](./execution_loop/evidence/PLAN_ALIGNMENT_2026-10-15.md)
ghi phạm vi kiểm và hashes. Những mục “reuse” không tự là V2 certified.

| Nền tái sử dụng | Phần V2 cần bổ sung/qualification | Consumer Claude |
| --- | --- | --- |
| `admin/owner-access.guard.ts`, `auth/owner-access.service.ts`: owner/session/CSRF, capability workspace | Stable identity mapping, ceiling/resource/mode policy, TS proposal receipts, protected lifecycle; không blanket ADMIN | M10 Profile/Access; scoped actions, pending/denied/revoked |
| `manager-lists/*`: retained snapshots, SWR/coalescing, existing Fleet/Portfolio pagination | Fleet grain V2, full-query scalar sort/filter/group, policy-before-query, economic dedupe và field coverage | M01–M07; retained/source quality, context/deep links |
| UDB isolated Execution store và read profile; Edge PG projection/checkpoint substrate | Exact publication barrier, correction/continuity proof, shared pools/retention budgets và revoke fanout theo current policy | Real reads/stream chỉ khi qualified; không polling upstream theo browser |
| `governance/*`: review context, decision grants, plan/apply, evidence và status | Phân biệt Portal decision/TS action; exact operation bridge. Edge source hiện reject `EDGE_COMMAND_RELAY_ENABLED=true` | M09 và confirmations/status; giữ Research RC → Governance workspace |
| Research retained analytics v2 / source-aware metric infrastructure | Shared canonical P/R/B calculator + economic adapters/config; analytics cũ không tự là score v1.1 | Raw/contribution/composition/direct score, per-metric absence và provenance |
| Existing Execution components, Fleet/360, retained context và Governance UX | Manager-first IA, required fields, new capital/archive/score journeys; không viết lại mọi component | Claude reuse/refine; bảo vệ Research/Planning/global tokens |

Targeted search trong `apps/control-api/src`, `services`, `packages` chưa tìm
implementation mang id `qbts_prb_v1_1`; ELP2-00/Score P0 phải hoàn tất inventory
legacy trước chọn module, không dùng tìm kiếm này làm chứng minh toàn repo không
có phép tính tương tự. Source TS/PM candidates không phải publication đang chạy.

## 14.3 Portal phase index — ELP2-00…11

Chi tiết authoritative ở [Portal guide §15](./execution_loop/EXECUTION_LOOP_PORTAL_V2_BACKEND_DATA_CONTRACT_GUIDE_v1.2_VI.md#15-kế-hoạch-12-phase-triển-khai).
Các test ranges dưới đây dùng prefix `ELP2-`; actual results nằm trong current
return/packet từng phase.01/02 đã có local contract/PG/API receipts;03/04 chưa
có implementation-test receipt. Không suy shared-runtime PASS từ local tests.
Mỗi phase tạo packet `execution_loop/evidence/ELP2-xx/` khi được giao, ghi goal,
pins, owned files, impact, receipt/test results, resources, exit, rollback và
handoff. Không tạo receipt PASS từ kế hoạch.

**Workflow bắt buộc, addendum 2026-10-16:** mọi phase áp dụng
[rules §7–8](./execution_loop/AGENT_WORKING_RULES.md#7-phase-approval-và-bàn-giao-hai-chiều-bắt-buộc)
và [packet template](./execution_loop/PHASE_PACKET_TEMPLATE.md). Sau phase phải
ghi backend next/debt, Claude next, request hai chiều và approval state theo
[§14.8](#elp2-phase-handoff). Thiếu handoff/exit evidence thì chưa ready-for-review;
Bobby duyệt từng phase, không tự chuyển phase vì bảng dependency cho phép.

<a id="elp2-00"></a>

### ELP2-00 — Chốt baseline coverage và quyết định

- **Goal/dependency:** từ bundle và source hiện hành, xác định đúng nền Portal/Edge/PM/TS/DL; không coi Research HEAD là stable deploy.
- **To-do:** repin SHA/dirty/deployed identities; route↔controller↔dataset↔authority census; legacy score inventory; quyết định XLC-01…11 và §17 guide; inventory gap có owner/locator; nguồn HK chỉ đọc, tránh measurement windows.
- **Claude:** UXM-00 audit current preview/components/deep links và reuse map; không đổi UI.
- **Tests/exit:** T00-01…08; scope/authority được owner review, ambiguity ảnh hưởng implementation được giải quyết; từng pending decision chỉ khóa feature liên quan. Preliminary source receipt không thay exit này.
- **Guide:** Portal §2, §15 ELP2-00, §17; Review decisions; UX §18 UXM-00. Rollback docs/version only.

**Return2026-10-16 — BASELINE_AUDIT_COMPLETE / READY_FOR_BOBBY_REVIEW.**
[Packet +8test dispositions](./execution_loop/evidence/ELP2-00/README.md),
[manifest](./execution_loop/evidence/ELP2-00/baseline-manifest.json),
[route/family map](./execution_loop/evidence/ELP2-00/coverage-and-route-map.md),
[XLC/DEC/request+Claude handoff](./execution_loop/evidence/ELP2-00/decisions-and-handoff.md).
112 Execution patterns/96 historical relations/54 named aliases;79 direct
OpenAPI matches,33 explicit dispositions including2 retired raw routes.
14families/11XLC/15decisions mapped, not runtime-certified. T00-01…08 audit
PASS; owner acceptance pending. N1 new source fixes do not replace journal
G2/G4/G7/G8 FAIL; PM probes do not supply deployed trust/full P16.
No application/UI/contract/DB/runtime edits, build or load; normal full commit
hook PENDING under audit-only scope, no bypass. Packet UNCOMMITTED.
ELP2-REQ-00-001…005 OPEN with owners/done-when. Backend next01 and Claude
UXM-00 need separate assignment; pending ceiling/field/calibration decisions
block only dependent activation. Existing Research/Governance evidence preserved.

<a id="elp2-01"></a>

### ELP2-01 — Chốt authority schema và contract fixtures

- **Current technical return2026-10-16:** [packet](./execution_loop/evidence/ELP2-01/README.md)
  CONTRACT_DELIVERED/READY_FOR_REVIEW;40/40 focused tests, source typecheck,
  generation and snapshot checks PASS. Schema-only API, no mounted route.
  External authority/consumer/runtime gates remain OPEN.02 dependency ready;
  frontend NOT_STARTED_BY_OWNER_DIRECTION, handoff AWAITING_CONSUMER_REVIEW.
  Local commit `700aa6a4`; normal hook388 contracts/2,606 API tests PASS,
 3 API tests skipped, restore/tracking PASS. No shared runtime change.
- **Goal/dependency:** sau 00; contract slice đủ cho FE không đoán data/quyền.
- **To-do:** identity/resource keys, decimal/UTCms, environment/stage/lifecycle, availability, revision/cursor; PM envelope/payload preservation; manager/researcher schemas; score basis/status/config schema; OpenAPI generation và fixtures FX-01…25 theo guide.
- **Claude:** UXM-01/02 map từng field/action vào generated DTO, IA/role states; draft UXM-03…05 được dùng synthetic fixtures ghi rõ.
- **Tests/exit:** T01-01…15 + schema/generation compatibility; golden fixtures/negative paths review, không relaxed type/hand parsing. Config chưa duyệt không biến fixture thành numeric production.
- **Guide:** Portal §15 ELP2-01, [Score §8](./execution_loop/SCORE_REGIME_SPECIFICATION_v1.1_FINAL_VI.md#8-contract-policy-artifacts-và-vị-trí-thực-thi), UX §16–18; Edge EPG10-02. Rollback versioned additive contract.

<a id="elp2-02"></a>

### ELP2-02 — Nâng cấp Profile identity và lifecycle

- **Current backend return2026-10-16:** [packet](./execution_loop/evidence/ELP2-02/README.md)
  records identity/session/lifecycle fixes and generated own-profile contracts.
  Landed `b448c0be655817dc49dd02f86aa2544e64c00d48`; normal hook21748 exit0,
  contracts388 PASS, API2,607 PASS/3 skipped, identity18/18 and retained-review8/8,
  clean build/PostgreSQL restore PASS. Checkpoint02→03 PASS; external mapping
  remains request003, not activated. No shared runtime changed.
  Frontend NOT_STARTED_BY_OWNER_DIRECTION; handoff AWAITING_CONSUMER_REVIEW.
- **Goal/dependency:** 01; bảo toàn users/accounts/session/owner đã có, identity đồng nhất Research/Execution.
- **To-do:** stable issuer+subject và verified researcher owner mapping; lifecycle/revoke/own-profile; protected owner recovery chỉ theo quyết định được duyệt; migration expand nếu cần, không reset users/grants.
- **Claude:** M10 identity/session states qua UXM-02/07; không suy owner từ tên/deployer.
- **Tests/exit:** T02-01…10; identity collision, CSRF/revoke/concurrency và preservation proof; chưa duyệt recovery thì không bật recovery, không gọi scope đó complete.
- **Guide:** Portal §15 ELP2-02; PM current identity contract. Rollback reader-compatible, không phục hồi revoked sessions.

<a id="elp2-03"></a>

### ELP2-03 — Capability delegation và TS membership proposal

- **Current backend return2026-10-16:** local technical checkpoint landed at
  `c1d6b2dc53f1f80ac44cdfd9d96d159c4e9aae64`; [entry/task map and final gate](./execution_loop/evidence/ELP2-03/README.md#landed-technical-checkpoint--normal-hook89719).
  Normal hook89719 exit0: contracts425/API2,758 PASS,3 API tests skipped;
  four-store row-digest dump/restore PASS. Original TS acceptance and approved
  ceiling/disclosure gates remain OPEN; no test fixture grants runtime rights.
- **Goal/dependency:** 01 cho design, 02 current identity cho runtime; một policy evaluator, app authority khác TS authority.
- **To-do:** resource×mode capability/ceiling/current revision; grants/revoke audit; Stan delegation không self-elevate; TS proposal pending/accepted/rejected; approved researcher field matrix, không dùng owner-only guard để cản mọi delegated action hoặc bỏ guard toàn bộ.
- **Claude:** access preview, pending TS acceptance, deny reason và reviewable grant diff.
- **Tests/exit:** T03-01…11; indirect escalation, stale revision, grant-of-grant, revoke-at-commit; pending proposal không thành effective TS permission.
- **Guide:** Portal §15 ELP2-03; UX §3, UXM-02. Rollback deny new grants, giữ revocation/audit.

<a id="elp2-04"></a>

### ELP2-04 — Áp quyền trên mọi read surface

- **Current entry:** [implementation packet](./execution_loop/evidence/ELP2-04/README.md)
  pinned to03 `c1d6b2dc`. Bobby's approved closeout is now implementing the
  remaining readers, finite contracts and delivery fences; see the
  [current closeout receipt](./execution_loop/evidence/ELP2-04/closeout-2026-10-16.md)
  for exact test/landing status, superseding historical D only where proved.
  History26/26 passed on G; J's12 unaffected suites passed and K's Manager23
  plus analytics12 passed with separate Core/Execution databases and restore.
  Post-K controller/cache regression and normal hook are recorded separately,
  not implied by those results. The
  [census](./execution_loop/evidence/ELP2-04/route-census-closeout.md) reconciles
  112 mounted patterns,54 aliases and10 adjacent policy routes. Typed refusals
  close unsafe fallback paths, not positive source commissioning. No runtime
  activation or next phase. [Claude handoff](./execution_loop/evidence/ELP2-04/contract-handoff.md)
  is AWAITING_CONSUMER_REVIEW; frontend remains unassigned.
- **Goal/dependency:** 02/03 proof và 01 schemas; scope trước query/aggregation, không frontend hide.
- **To-do:** list/detail/search/join/count/group/rank/export/cache/SSE field policy; linked-portfolio minimal discovery; no peer/physical/denominator leakage; current membership kiểm cả historical reads.
- **Claude:** manager/researcher variants; denied khác authorized-empty; preserved workspace/deep links.
- **Tests/exit:** T04-01…12; full-surface negative matrix, revoked/in-flight/hidden-sort inference; pending allowlist khóa đúng disclosure, không mở rộng mặc định.
- **Guide:** Portal §15 ELP2-04; UXM-02/08. Rollback fail-closed scope, không cache fallback vượt quyền.

<a id="elp2-05"></a>

### ELP2-05 — Nối catalogue và TS publication

- **Current return2026-10-16:** [packet and canonical gate/debt matrix](./execution_loop/evidence/ELP2-05/README.md),
  [read-only HK pins](./execution_loop/evidence/ELP2-05/source-alignment.md),
  [42-family/31-field inventory and Claude handoff](./execution_loop/evidence/ELP2-05/coverage-and-handoff.md).
  Technical contract/adapter work is distinct from real publication certification;
  new Edge exports stay unavailable while selected writer/trust gates are open.
- **Goal/dependency:** 01; selected Edge family publication, không chờ mọi endpoint của track khác.
- **To-do:** family/field/source manifest, grain/writer/schema/source clock/quality; named BFF adapters bounded rows/bytes/cursors; snapshot barrier/tail/correction evidence theo family; economic inputs NAV/flows/costs/notional; giữ nguồn chưa đủ typed absence.
- **Claude:** mapping source availability, freshness và read-only fixture, không tự direct upstream.
- **Tests/exit:** T05-01…13; selected family real publication/coverage/trust proof; snapshot-only không claim replay. Source row có trong DB không đồng nghĩa exported/certified returns.
- **Guide:** Portal §2.3.1, §15 ELP2-05; Edge EPG10-02…05, PM current publication. Rollback adapter/feature, giữ facts/checkpoints.

<a id="elp2-06"></a>

### ELP2-06 — Manager read models và 360 datasets

- **Current return2026-10-16:** separately assigned on `c4109ef3`; [gate / actual tests / remaining dependencies](./execution_loop/evidence/ELP2-06/README.md), [source pins](./execution_loop/evidence/ELP2-06/source-alignment.md), [generated contracts + Claude handoff](./execution_loop/evidence/ELP2-06/coverage-and-handoff.md). Technical bounded slice delivered via normal-hook commit; **full source/config/consumer exit NOT_MET**. No runtime or frontend activation;07 requires separate assignment.
- **Goal/dependency:** 01 cho design; 02/03/04 + selected 05 cho real reads. Reuse UDB/Manager infrastructure, không thêm ledger kinh tế.
- **To-do:** atomic projection+checkpoint, dedupe, full authorized sort/filter/group/stable paging; Fund/Fleet/360 and capital statements; Score P1/P2, direct NAV khác composition; correction dependency cache, bounded recompute ngoài request/tick path.
- **Claude:** UXM-08 nối Overview/Portfolio → Fleet → Alpha/Account/Deployment với context; mỗi field có unit, absence, capability, provenance.
- **Tests/exit:** T06-01…20; source→projection→API tie-out, no physical/internal/virtual double count, partial independent score, null/tie paging, crash/rebuild consistency; metric nào chưa đủ source/config không numeric production.
- **Guide:** Portal §15 ELP2-06; Score §4–8/11–12; UX §6–12. Rollback compatible reader/flag, không overwrite immutable revisions.

<a id="elp2-07"></a>

### ELP2-07 — Trusted command và status bridge

- **Current return2026-10-16:** assigned separately on `42c390796f4bd2a7de151313944b41f1245bdbc2`; [packet / actual validation](./execution_loop/evidence/ELP2-07/README.md), [HK source pins](./execution_loop/evidence/ELP2-07/source-alignment.md), [operation matrix / recovery / Claude handoff / debt](./execution_loop/evidence/ELP2-07/coverage-and-handoff.md). Four named APIs and eight candidate capital operations have a durable Portal component, **not a source-qualified dispatch**. Default adapter and retained mutation guard remain closed. Exact source receipts, other control/profile families and UXM-09 consumer remain open; no runtime/FE work or next-phase activation assigned.
- **Goal/dependency:** 01/02/03 contract/policy; mutation cần exact TS/PM operation, qualified Edge trust/relay và approval riêng.
- **To-do:** human/workload envelope, unchanged PM payload, CAS/idempotency/status lookup, commit-time policy; delivery/business/projection/venue states tách; giữ R1/R2/Live semantics; no universal1x, no auto-liquidation archive/recall.
- **Claude:** UXM-09 confirmation/receipt/retry-unknown và gate-specific disabled states; không đổi retained preview thành write permission.
- **Tests/exit:** T07-01…11; concurrent single-effect, revoke/expiry, unknown commit recovery và source receipt; exact unqualified operations bị direct API reject, không chỉ hide button.
- **Guide:** Portal §15 ELP2-07; Edge EPG10-07/08/09 và PM current R2. Rollback disable sends, giữ status/late facts, không tự đảo financial effects.

<a id="elp2-08"></a>

### ELP2-08 — Workflows và HiFi states

- **Goal/dependency:** fixture/design mở sau 01; read acceptance cần 04/05/06; command acceptance cần 07, không waterfall đợi hết backend.
- **To-do BE:** publish workflow states/fixtures, capital amount partitions, lifecycle residual/obligations, score explanations và request ledger; giữ Research RC → Approval → gate context.
- **Claude:** UXM-03…09 sở hữu UI; lowfi→approved HiFi→typed components; M01…M10, contextual controls, keyboard/responsive, short public copy/details; retain legacy deep links.
- **Tests/exit:** T08-01…17 + applicable UX-F01…40; actual browser receipt khớp contract/design, no invented success/data/score band. Fixture và real integration verdict riêng.
- **Guide:** Portal §15 ELP2-08; UX §5–18; hai lowfi tại §14.1. Rollback scoped UI/read flag, giữ shared tokens và permission guards.

<a id="elp2-08-current-return"></a>

**Current backend return2026-10-16 — riêng assignment ELP2-08:**
[packet /17-gate disposition](./execution_loop/evidence/ELP2-08/README.md),
[contract pins, text states, action/screen coverage, operator walkthrough và
Claude request](./execution_loop/evidence/ELP2-08/coverage-and-handoff.md).
Entry `3d537127313fb3c282eda054fd180499fe4732ca`, clean; branch
`docs/research-loop-plan`. Additive generated workflow contracts/fixtures and
pure read projections: separate create/FUND/grant, exact amount partitions,
four command dimensions, obligations/move receipts/terminal archive and separate
Paper-monitor lineage,12 read states,10 screen maps,24 disabled action
descriptors, canonical score Early/mixed semantics and Research→Governance
context. No new workflow endpoint, executor, migration or frontend/runtime edit.
Focused **API76/76 + contracts56/56 PASS**; failures/retests retained in packet.
Normal-hook terminal exit0 is the coherent-commit landing gate, not a
prewritten full test result. [HK current-source audit](./execution_loop/evidence/ELP2-08/source-alignment.md)
pins PM R2 unchanged and Edge `e15e7064`/EPG10-07 IN_PROGRESS/WIP; deny-default
relay remains, no real operation/runtime proof. **Full08 exit remains
NOT_MET_SOURCE_DESIGN_BROWSER.** Inherit canonical07-001/002 and06-002 debt;
no duplicate activation/formula campaign. Claude `ELP2-REQ-08-001`
AWAITING_CONSUMER_REVIEW, frontend NOT_STARTED_BY_OWNER_DIRECTION. Backend09
is next-ready after separate assignment; no09 work/goal/push/dev/main/deploy.
Old entry/planning statements elsewhere are retained history, not current08.

<a id="elp2-09"></a>

### ELP2-09 — Realtime revocation và replay

- **Goal/dependency:** selected reads 04/05/06 và relevant Edge continuity; không buộc snapshot-only endpoint mở SSE.
- **To-do:** scoped cursors, source epoch/projection generation, atomic apply/ACK, tombstones, coverage proof, revoke caches/export/stream/queued intents; bounded reconnect/slow clients.
- **Claude:** replay/resync/revoked/retained states theo typed facts; không auto poll Edge hoặc giả live từ cached snapshots.
- **Tests/exit:** T09-01…14; visible-hidden-visible không false gap/leak, actual loss vẫn detected, revoke mid-replay, filter/model scope mismatch, reconnect bounds.
- **Guide:** Portal §15 ELP2-09; Edge EPG10-03…05/08/09. Rollback stream/sends off, retain safe snapshot/ingestion/status phù hợp authority.

**Current backend return2026-10-16 — riêng assignment ELP2-09:**
[packet /14-gate disposition](./execution_loop/evidence/ELP2-09/README.md),
[generated contract / Claude handoff / canonical request ledger](./execution_loop/evidence/ELP2-09/coverage-and-handoff.md),
[replay/revoke runbook](./execution_loop/evidence/ELP2-09/replay-runbook.md).
Edge current source is **NOTIFICATION_ONLY**: snapshot barrier→notice→fresh
authorized named BFF, not financial-event replay. Added encrypted scope/policy/
field/model/epoch/generation cursors, per-write app/session/stream fence,
bounded active+pending subscriptions/bytes/coalescing/timeouts, and reused135
durable projection with post-COMMIT/release ACK. No migration/new ledger/public
SSE route/source activation/FE change. Focused25contract and68pure PASS;
canonical isolated PG focused206PASS/build+restorePASS at then-frozen source;
later local revoke trace/removal regressions are in the final normal hook,
not added to the earlier count. Terminal hook/landing receipt is required;
no prewritten full-suite PASS. Source pin audit ends at Edge `f10c15f6`, PM R2
`d16aa2b5`; implementation presence is not deployed evidence.
**Full09 NOT_MET_SOURCE_PROPAGATION_BROWSER**: inherit05-001/06-002/07 source/
trust/coverage debts, no fake remote SLA or export receipt.09-001 consumer
AWAITING_CONSUMER_REVIEW; frontend NOT_STARTED_BY_OWNER_DIRECTION.
Backend10 selected performance/coexistence is next-ready only after separate
assignment. No goal/push/dev/main/release/deploy started by this return.

<a id="elp2-10"></a>

### ELP2-10 — Performance, quality và coexistence

- **Goal/dependency:** selected changed reads/workflows/streams; approved target/quota/threshold trước load. Không dùng máy TS/DL đang đo làm test cell.
- **To-do:** query plans/pools, source amplification, queues/bytes/retention/WAL/RSS/CPU, correction cadence, lease/DR, cashflow-only oracle; Score P3 calibration; classify old receipts reusable vs impacted.
- **Claude:** UXM-10 browser latency/overflow/a11y, multi-tab/reconnect and no per-browser upstream workload.
- **Tests/exit:** T10-01…14; measured selected workload đạt approved SLO và coexistence; không tự hạ load/nới SLO. Performance G2 giữ khi applicable, optional mainnet G2 không thay thế.
- **Guide:** Portal §15 ELP2-10; Edge EPG10-01/06/09; Score §12 P3. Rollback bounded fanout/feature scope, không bỏ correctness/security/history cần thiết.

**Current return2026-10-16:** Bobby assigned10 separately on
`e6620f416e43bc8c18a044339a598c436d8556ba`.
[Local backend delivery /14gate matrix](./execution_loop/evidence/ELP2-10/README.md),
[actual bounded measurements](./execution_loop/evidence/ELP2-10/measurements.md),
[per-family/profile manifest](./execution_loop/evidence/ELP2-10/measurement-manifest.json),
[placement/lease/DR runbook](./execution_loop/evidence/ELP2-10/capacity-recovery-runbook.md)
and [Claude handoff/debt](./execution_loop/evidence/ELP2-10/coverage-and-handoff.md).
Exact scope index, finite detached immutable-document single-flight, dependent
methodology absence, additive137 DB-clock/token/epoch/COMMIT fence and
autocommit guard; old worker unchanged/unmounted new consumer. Focused PG
run1 **355/356**, one corrected typed-error assertion (public text intentionally
sanitized); actual measurement20same-key readers20→1SQL, paired p95≈2251–2266→
942–953ms on1.197MB synthetic document, **not HTTP/source SLO**. Final normal
hook/restore is landing gate; external terminal receipt is linked in packet.
Source PM R2 `d16aa2b5`, Edge `f10c15f6` plus owner WIP;14source budgets null,
HK foreign lock observed through13:48:52UTC, no host load. Full10
**NOT_MET_SOURCE_BUDGET_CALIBRATION_COEXISTENCE_BROWSER**;10-002 budget/load
window and canonical05/06/07 source gates remain open, calibrated P3 pending.
Frontend NOT_STARTED_BY_OWNER_DIRECTION,10-001 AWAITING_CONSUMER_REVIEW.
Next: selected10 operational proof after prerequisites;11 only on separate
assignment with mandatory dependencies, no silent PASS or activation.
No goal/push/dev/main/release/deploy or UI changes.

**ELP2-10 operational continuation2026-10-16, latest:** Bobby assigned remaining
qualification; [actual return / action packet](./execution_loop/evidence/ELP2-10/qualification-continuation.md)
and [observed selected-input manifest](./execution_loop/evidence/ELP2-10/qualification-input.observed.json).
Original local slice **169195ca** terminal normal hook PASS:677contracts,
3886API tests +3existing skips, build and scoped-policy restore. Application,
schema and dependency hashes unchanged here; reuse, not extra coverage.
Fresh source PM **c401a023**, Edge **efa89e34**: owner-reported connected strict
TLS nowPASS, old expired-TLS and13:48foreign-lock blockers superseded. Actual
PM providers still unconfigured, identity/fields/current native authority
owner-deferred. **Concrete Portal work remains**, not just external evidence:
trusted publication adapter not installed; normalized materializer not mounted;
runtime Score loader/calculation/result DTO not published (pure calculator
exists); six new Manager operations lack FE consumers. Canonical05-001,
06-002,00-005,10-001 refined, not duplicated.14source budgets/calibration/
paired coexistence still missing. New offline eligibility checker **58/58**
focused tests; observed input returnsBLOCKED with nine named prerequisites,
never runtime authority. Real old-preview browser4cells1280/660,0overflow/
a11y/page errors, idle16s0API, logout201;6V2 GETs404 on old5ca9d167build.
These are **not** V2positive/UXM10acceptance. Full10**NOT_MET**, no HKload,
runtime build/migration/activation, frontend change, push or11start. Backend
next is the same10selected commissioning action packet§5; Claude can map
named types/fixtures when assigned, actual runtime acceptance waits on its
real qualified source/build.10-001 remainsAWAITING_CONSUMER_REVIEW.

**ELP2-10 commissioning implementation2026-10-16, latest:** Bobby assigned the
remaining local backend commissioning; [complete return / source action bundle](./execution_loop/evidence/ELP2-10/commissioning.md).
Entry clean630eafc5, same branch. Actual registered fail-closed lifecycle and
bounded serial consumer now use existing137 lease/COMMIT fence; ACK after durable
commit, lost-ACK retry preserves identical Score/revision. Exact independently
pinned policy loader/off-request canonical calculator/result provenance and
current-policy read fence delivered; additive generated ManagerScorePublication/
score_details, same six named operations, no frontend/API-input/migration change.
Focused PG run1 buildPASS,74/77tests (3strict-fixture failures corrected; not a
whole-suitePASS). Terminal normal-hook retakes build/contracts/API/restore and
new regressions; exact result/SHA/cleanup in linked terminal receipt. Current
source PMc401a02365bbe2ae341a7a135391ce3789aeb29d / Edge
cfeeee7e6dc4680dd736ac4e4076ea997d9cbb87, ownerWIP preserved, foreign lock
through15:43:54UTC, read-only SSH/no load. Actual production current-human/
normalized publication provider remains absent; workload TLS is not that
authority. Default installation0timers/sourcecalls. Full10**NOT_MET**: needs
reviewed source provider/receipts, approved14group budgets/calibration, paired
coexistence/G2 and assigned consumer/browser proof. Canonical05-001/06-002/
00-005 refined to these real remaining inputs, not missing local wiring;
10-001AWAITING_CONSUMER_REVIEW,10-002budget/coexistence. Backend next stays10
exact selected commissioning/qualification once supplied; Claude next six
Manager/360 consumers when assigned. No goal/push/dev/main/release/deploy/11.

**ELP2-10 provider continuation2026-10-16, newest:** entry12a6412b,
[source/current-human audit, protected-root fix, validation and approval package](./execution_loop/evidence/ELP2-10/provider-continuation.md).
Real local defect10-003: installed pending business owner roots had no valid
TS receipt path; ordinary delegation deliberately cannot target the owner.
Private independently verified initial-root intake now binds policy/install/
grant digests and current human mapping/membership through COMMIT; no copied
receipt, ADMIN bypass, public route, schema migration or real source activation.
Fresh PMc401a023 source publication286/286PASS is TEST_ONLY/BOOTSTRAP_ONLY;
Edge4c6250ca plus ownerWIP preserved. Current-human/runtime provider still
absent;14budget approvals null, horizon calibration pending. Actual focused
and terminal-hook evidence goes in linked packet, not inferred PASS here.
Backend next is exact coordinated PM round3/Edge candidate integration after
remote scope/resource approval, then paired baseline/budget and calibrated
artifact acceptance; no duplicate identity system or invented source endpoint.
Claude next remains six named Manager/360 consumers when assigned; no new
binding task in this private fix. Full10**NOT_MET**,11 not started; no push,
dev/main merge, release, deployment, UI change or financial command.

**ELP2-10 candidate-only follow-through2026-10-16, latest:** Bobby approved
the exact PM/Edge isolated candidate package; [scope, implementation, actual tests and next authority package](./execution_loop/evidence/ELP2-10/source-followthrough.md).
Separate PM98dbfd8c/Edge9db77811 worktrees created, owner source/WIP untouched.
No source runtime, credential, command or Live activation. HK foreign measurement
window through17:40UTC prohibits load there; candidate correctness can use the
approved isolated SGP2CPU/1536MiB/300s envelope. Candidate PMcommit
**9c39b4663bac971d37b489445b8cfff5d2b463ad**,5files+548/−0: immutable
research/version association, explicit source evidence, current permission before
retry and deferred outer-COMMIT expiry checks. Actual final **45PASS**,15new+
30registry regressions,12.23spytest/17.009soverall; cleanup complete,8Portal
service tuples unchanged. PMowner's newer832isolatedPASS lease wrapper explicitly
does not install a genuine provider; not merged or added to candidate coverage.
Actual Portal↔PM current-human/trust/revocation-through-COMMIT compatibility is
an additional authority package proposal, not another placeholder provider.
Approved budgets/calibration/coexistence and assigned browser acceptance remain
mandatory; full10NOT_MET and11not started. No push or source runtime activation.

**ELP2-10 genuine-human authority continuation2026-10-17 Asia/Saigon, latest:**
[implementation, private wire, source transaction adapter, real test corrections and operational return](./execution_loop/evidence/ELP2-10/authority-continuation.md).
Entryfa857b85, same branch; no new goal/push/UI/runtime. Real Core user/session/
workspace/policy capture is reused, not copied identity authority. Additive
unmounted candidate issues exact Ed25519pma.identity.v1 and authenticates signed
source ENTER/terminal proofs; durable one-use leases and committed drain fence
legacy/raw DB authority writers. Unknown COMMIT remains quarantined after TTL;
fenced source readback, not cancellation, proves terminal outcome. Persisted
attempts support crash recovery; separate physical lease epoch closes a real
stale-REPEATABLE-READ snapshot race without altering signed authority revision.
PM adapter reuses actual HumanIdentityService, same-TX source marker and deferred
logical-COMMIT expiry; no Portal network holds a TS connection. No public
browser contract, numbered runtime migration, key/client/provider installation
or business grant. Qualification intake requires independent approval/actual
calibration/canonical-loader bytes, exact14-group metric catalogue and matched
repeated counterbalanced B0/B1/B2 receipts. Actual tests, final pins/normal hook
and cleanup are recorded in the linked packet, not inferred from fixture state.
05-001/06-002 remain actual provider commissioning;00-005 approved calibration;
10-002 budgets/coexistence/applicableG2;10-001 assigned consumers/browser.
Backend next stays10 and Claude next existing six named Manager/360/Score
handoff when assigned. Full10NOT_MET,11not started; no acceptance invented.
Terminal source candidate **0e7059cc968654d50e76fcc76f3a2d3aceababe3**,
5files+1369/−0;23PASS real disposable PM PostgreSQL/crypto/identity,
13.67spytest, source-client transport explicitlyTEST_ONLY. Three earlier failed
attempts and corrections preserved. Owner advanced independentlyf8ddea31,
unchanged by us. Actual Portal normal-hook terminal status/hash/cleanup is in
the linked receipt, not a fixture-derived phase PASS. Remaining backend work
is real client/trust/authority-writer/provider commissioning plus approved
budget/calibration and allocated coexistence/G2; browser remains Claude's
assigned acceptance. No public field or ELP2-11 entry introduced here.

**ELP2-10 active three-gate follow-through,2026-10-16UTC:** Bobby assigned
current-human/client/provider/authority-writer commissioning, approved numeric
budget/calibration and source-connected coexistence/G2 as one persistent goal.
[Scope card, independent task map and live gate ledger](./execution_loop/evidence/ELP2-10/commissioning-followthrough.md)
start at cleand92efc0e; prior candidate/hook receipts remain historical by their
exact dependency pins. No ELP2-11, frontend, push, dev/main, financial-command
or Live scope added. Actual trust/approval/window inputs cannot be invented;
progress and every unresolved gate remain distinct from full completion.
Optional Lifecycle/Governance/Access propose-revoke and self-logout/password
writer adapters now share exact durable drain/recovery; login activation,
lock-cleared audit and session delivery are atomic. PM owner0f008f27 adopted
candidatea03500ac and reports403 isolatedPASS including3real mTLS cases.
Latest read-only pin is ebb63cef with foreign readiness/probe WIP; actual
trust/provider remains uninstalled, not commissioningPASS.
The linked packet records independent review, corrective failures, calibration
census and the terminal normal-hook controller receipt rule; no future PASS is
predeclared. Initial hook failed14 new fixture cases (contracts678PASS,
API4179PASS/3existingSKIP); fixes and real exact-retry correction are retained.
Focused retake55/55PASS/build/scoped restore, runtime unchanged/zero leftovers;
the one coherent retry commit still requires its own terminal normal-hook PASS.
Claude has no new field/type, but pending auth-state retry behavior
needs review before activation. Backend next remains actual selected
writer/provider/trust commissioning and approved numeric capacity/calibration,
then allocated paired coexistence/G2. Full10NOT_MET;11not started.

**20:53UTC terminal and final writer-census addendum:** coherent26e688e4
landed through normal hook:678contracts/4194API PASS +3pre-existingSKIP,
build/scoped-access restore PASS, eight runtimes unchanged and zero owned
leftovers. Exact controller and28files+4387/−182 are in
[the same canonical packet](./execution_loop/evidence/ELP2-10/commissioning-followthrough.md#terminal-delivery-and-final-writer-census--2053utc).
The inventory explicitly retains purpose-specific login/first-binding,
source/operator receipt/policy, provisioning and maintenance composition gaps;
generic coordinator code is not exhaustive mounting. A bounded follow-up fixes
atomic personal workspace+membership, atomic preview-session+audit/final user
fence, and the actual503/top-levelrequest_id descriptor for9account/grant
writers, with targeted regenerated lifecycle types and synthetic fixture.
Follow-up gate remains PENDING until its own terminal controller receipt;
the prior PASS is not reused for changed bytes. Claude consumes typed503 as
unconfirmed same-key retry, no UI redesign/newscreen. Actual trust/providers,
approved budgets/calibration and allocated coexistence/G2 remain OPEN;
full10NOT_MET,11not started and no push/deploy/dev/main.

**21:19UTC terminal + current-workspace follow-through:** follow-up
`31c2322c8049b1fc74c87a8521579b41afb41c9c` landed through its normal hook:
691contracts/4207API PASS,3pre-existingSKIP, build and scoped-access restore
PASS; eight runtimes unchanged, zero owned resources and own lock released.
Exact `atomicity-land-205454` controller/hash,10files+658/−21 and source readback
are recorded in the [canonical commissioning packet](./execution_loop/evidence/ELP2-10/commissioning-followthrough.md).
The latest observed owner PMde1f75d2 still declares runtime/trust/provider/
production-authority false; Edgeec5c6c2f has14/14approval refs and32/32numeric
baseline/bounds null. Those are actual missing inputs, not another formula vote.

The next bounded same-phase batch composes actual SessionGuard personal
workspace creation with current actor/session/generation and the existing
durable coordinator. Existing owned workspaces stay DB-only reads; pending
intent recovery and FINISHED replay must not regrant membership. Candidate
schema family only, no numbered migration/runtime mount, frontend change or
public field. Its tests are NOT_RUN until its own frozen normal-hook receipt;
31c's PASS is not reused for changed code. The legacy Proxy helper has no
callers and remains maintenance, not a second mounted writer.

Read-only issuance review also identifies a concrete one-view decision: current
login stores session/CSRF hashes and has no stable browser attempt contract;
after restart it cannot recover old cookies. A separate verified-issuance actor
must not invent a prior session or store bearer/password material. Owner answer
for explicit lost-response/consumed-activation semantics is requested in the
same packet. This boundary does not block the independent workspace repair.
Actual selected trust/provider, numeric approval/calibration and allocated
source-connected coexistence/original performanceG2 remain OPEN; Claude's six
Manager/360 consumers remain AWAITING_CONSUMER_REVIEW. Full10NOT_MET;
11/dev/main/push/release/deploy/Live are not started.

**ELP2-10 continued, entry b3620cf5:** workspace composition landed via normal
hook691contracts/4233API PASS+3existingSKIP, build/scoped restore; eight runtime
tuples unchanged, no owned resources. The [same canonical commissioning packet](./execution_loop/evidence/ELP2-10/commissioning-followthrough.md#continuation-artifactsource-purpose-historical-policy-replay-entry-b3620cf5)
records the next bounded artifact/root-purpose batch, historical-policy rollback
bug, independent source review and exact test ownership. Verified artifacts and
source receipts must not be fabricated as human sessions; immutable old receipts
are read-only ACKs even when no coordinator intent existed originally. Source
fences are released before drain recovery and reacquired after it, held through
Core outcome. New code's gate is PENDING until its terminal controller receipt,
not inherited from b362's PASS. No public field/FE change or runtime installation.

Readonly HK refresh22:04UTC: PM advanced independently to4e99c5e6, clean;
TLS handoff hash unchangedc8bd50bf and Edgeec5c6c2f measurement-planaaa1c7d0
unchanged, with one foreign untracked feasibility document preserved. New PM
84af0a5c interoperability receipt reports73PASS(8newcases) at exact Core26e688e4
with real mTLS/HTTP/Core PG; its qualification explicitly excludes installed
authority/native source fences/full campaign. Unchanged byte-binding/transport/
candidate source permits scoped historical reuse, not new writer commissioning.
Readinessf236025a still has no approved target/workload/resource/SLO envelope.
Actual selected trust/provider installation, numeric budget/calibration and
allocated source-connected coexistence/originalG2 remain OPEN. Claude next is
existing six Manager/360 handoffs when assigned; full10NOT_MET,11not started.

**Purpose focus22:12UTC:** build,215/215 affected API cases and scoped PG restore
PASS on the exact freeze; eight runtime tuples unchanged, no owned leftovers.
The [canonical packet](./execution_loop/evidence/ELP2-10/commissioning-followthrough.md#focus-receipt-and-final-normal-hook-freeze-purpose-batch)
pins controller/log hashes, review correction and final eight-path landing scope.
After focus, independent review corrected pending source-receipt changed-payload
refusal503→409 and added one real-PG no-mutation/no-recovery regression; its gate
is the forthcoming `purpose-land-HHMMSS` normal hook, not the earlier215PASS.
No duplicate focused/full suites or frontend/runtime changes. Actual ELP2-10
authority/config/coexistence gates remain OPEN; next independent backend slice
is ordinary delegated receipt held-source composition, not11.

**ELP2-10 delegated receipt continuation (entry a241a587):** purpose normal
hook terminal PASS,691contracts/4259API +3existing skips, build/scoped restore,
eight runtimes unchanged/zero owned leftovers. Exact receipt/hash and local
10-004 closure in [canonical packet](./execution_loop/evidence/ELP2-10/commissioning-followthrough.md#ordinary-delegated-receipt-purpose--entry-a241a587).
New10-005 closes only the local ordinary-receipt held-source seam after its
own normal hook: separate private purpose/no fabricated session, exact complete
source proof reacquired after signed recovery outside Core and held through
physical outcome, historical ACK/no regrant,409 payload binding and uncertain
lost ACK.22 real-PG+1synthetic wrapper cases authored, NOT_RUN at preparation;
existing raw-purpose constraints expanded. No public schema/FE/runtime change.
Private `delegated-land-HHMMSS/controller.json` is the authoritative terminal
result only with committed SHA, exit0, unchanged runtime and zero leftovers.
Backend next is still10: verified-issuance one-view decision, actual selected
provider/trust, approved numeric budget/calibration, allocated coexistence/G2.
Claude six existing Manager/360 handoffs AWAITING_CONSUMER_REVIEW; no new fields
or consumer request. Full10NOT_MET;11/dev/main/release/deploy remain unopened.

**2026-10-17 — one-view login recovery decision / local10-006 (IN_PROGRESS).**
Bobby requested the safest recommendation: recover only durable COMMIT/ROLLBACK,
never reconstruct lost cookies or claim authentication from a receipt. Fresh
password login; consumed activation uses the existing authorized reissue flow.
Separate verified pre-session purpose, final current credential/identity checks
and atomic session/binding/audit are scoped in the
[canonical packet](./execution_loop/evidence/ELP2-10/commissioning-followthrough.md#verified-pre-session-issuance--owner-recommendation-accepted-2026-10-17).
Entry30162a3f, clean shared branch; one normal-hook batch, no runtime/FE/public
contract/push. Tests NOT_RUN at entry. This resolves the decision, not actual
provider commissioning or the remaining budget/calibration/coexistence/G2 gates.
Claude has no new UI/type task; ELP2-11 is not started.

**2026-10-17 — actual-provider/config/window readback after9a3a27c8.**
One-view local10-006 is VERIFIED by its terminal normal-hook receipt; no tests
repeated. [Current return and exact next package](./execution_loop/evidence/ELP2-10/commissioning-followthrough.md#elp210-actual-provider-return-20261017)
pins PM5f0d60b2/Edgef26657aa and preserves PM membership-history WIP. Actual
provider/trust remains uninstalled,14budget approvals/32metric baselines and
bounds null; HK foreign stage-100 window ends12:20:16Asia/Saigon, not a Portal
allocation. Source-specific provider implementation/installation still needs
authenticated mapping/lease inputs and separately approved trust provisioning,
not another generic scaffold. Original600s paired G2 cannot fit the approved
300s correctness cap; exact capacity/threshold/calibration inputs remain OPEN.
Two independent readonly reviews found no new local defect; no code, FE,
runtime or source changes, no test/build/load/push. This documentation update
is UNCOMMITTED/PENDING normal-hook delivery; no hook bypass or wasteful rerun.
Next backend stays ELP2-10; Claude has no new field/request; full10NOT_MET.

**2026-10-17 — approved private candidate trust construction, entry9a3a27c8.**
The expanded commissioning package is approved; do not ask for it again.
[Code, strict manifest/scope boundaries, actual failures/corrections, tests and resource receipts](./execution_loop/evidence/ELP2-10/commissioning-followthrough.md#elp210-private-installation-20261017)
deliver separate Core/PM TLS/JWT custody, exact CA/leaf/signer pins and explicit
unbound composition, not business authority or runtime activation. Corrected
Core loader focus68/68 plus real OpenSSL compatibility1/1; PM isolated52/52,
zero warnings, no network, exact cleanup/eight runtime tuples unchanged.
One normal-hook landing is still required; its actual `installation-land-*`
terminal receipt controls that result, not this pre-commit line. No FE/public
contract/startup/DB migration/push changes. PM866b8e72 has new current-authority
WIP under review, NOT_IMPORTED; PMcandidatea03500ac remains clean and the
foreign HK window is now03:48:38–05:48:38UTC. Next: accept/pin genuine source
policy/mapping/grants and private installation, then source-connected proof;
approved numeric budgets/calibration and original coexistence/G2 remain distinct
OPEN gates. Claude has no new field/request; full10NOT_MET,11 not opened.

**2026-10-17 terminal correction / current incoming-source review:** private
trust construction landed `0d8bbaee` through its original normal hook:
7files+1045/−2, contracts691PASS/API4377PASS+3existing skips, build/scoped
restore PASS. [Exact terminal receipts, monitor discrepancy reconciliation,
source WIP pins and next boundary](./execution_loop/evidence/ELP2-10/commissioning-followthrough.md#elp210-private-trust-terminal-20261017)
supersede the preceding pending-hook line. All7raw-byte committed/working hashes
match the tested freeze; eight runtime tuples unchanged, owned cell resources0.
Provisioner smoke PASS and4new transient keys retired; no runtime/source install.
PM866b8e72 now has real provider/importer/existing-mapping WIP, unqualified/
unmounted, not absent implementation. Genuine accepted source records, reviewed
installation pins/report producer and connected proof remain unmet; numeric
budget/calibration and matched originalG2 are separately open. No HK job, FE,
push/deploy/11. Claude has no new field/request and remains on owner hold.
Terminal docs await the next coherent normal hook; do not repeat unchanged
full suites just to land after-the-fact status.

**2026-10-17 parallel mapping reconciliation:** incoming Edge original08 owns
the additive existing-identity client at [§14.12.1](#elp2-10-existing-identity-mapping).
Primary withdrew only its duplicate uncommitted adapter/refactor, preserving
peer files and original recovery/installation bytes. No new tests were run or
claimed. [Static review, private draft custody and exact identity alignment](./execution_loop/evidence/ELP2-10/commissioning-followthrough.md#parallel-owner-reconciliation--2026-10-17-0435utc)
record source-only acceptance and pre-mount inflight/lifetime requirements.
Stable source issuer cannot be replaced with a fresh candidate issuer; the
reviewed real binding/acceptance and source-connected proof remain required.
This preserves one writer/adapter, not a runtime/provider qualification or
full10PASS. No FE/public fields, HK writes, push/deploy or11 start.

<a id="elp2-11"></a>

### ELP2-11 — Migration tích hợp và bàn giao release

- **Goal/dependency:** selected mandatory gates 00…10 và UX integration complete; scope loại trừ phải owner-approved, không lặng lẽ bỏ gate.
- **To-do:** expand/backfill/shadow/tie-out; identity/session/grants/financial-history preservation; real DB race/restore; exact source/image/schema/config manifest; operator runbooks; original vs restated score revisions không overwritten.
- **Claude:** final design/source/API/browser receipt và old-route regression; known disabled scopes/disclosures.
- **Tests/exit:** T11-01…15; selected source→Edge→Portal→UI, privacy, recovery/rollback và applicable trading certification; unresolved critical failures không PASS. Handoff có thể READY_FOR_BOBBY_REVIEW, không OWNER_ACCEPTED/released.
- **Guide:** Portal §15 ELP2-11/§16; Edge EPG10-10/11; UXM-10. **Dừng trước merge dev/main, signing, deploy/activation nếu chưa có approval riêng.**

## 14.4 Chỉ mục frontend giao Claude — không chờ full backend

Chi tiết mỗi phase (inputs/tasks/deliverables/tests/rollback) ở
[UX guide §18](./execution_loop/EXECUTION_LOOP_MANAGER_UX_DESIGN_GUIDE_v1.1_VI.md#18-kế-hoạch-11-phase-ux-và-frontend-handoff).
Tất cả **PLANNED / NOT RUN**; dưới đây là index, không thay yêu cầu trong guide.

| Phase | Dependency | Goal / to-do | Exit và backend consumer |
| --- | --- | --- | --- |
| UXM-00 Audit/reuse | ELP2-00 inputs, hai ảnh | Browser/source inventory; giữ/đổi/thêm, routes và persona | UX-F23; pin UI thực thấy, không source-only claim deployed |
| UXM-01 IA/dictionary | 00, ELP2-01/EPG10-02 draft | Manager hierarchy, metric/grain, global context/URL; map đủ ảnh | UX-F04/05/06/20/24; economics rõ, no weighted/direct ambiguity |
| UXM-02 Authorization states | 01 schemas/policy | Manager vs researcher, field/action ceilings, deny/revoke | UX-F01…03; disclosure approval trước real data |
| UXM-03 Overview/Portfolios lowfi | 01/02, ảnh Overview | M01/M02/M04 KPI/capital/score/drilldown | UX-F05/06/07/11; Bobby review flow trước HiFi |
| UXM-04 Fleet/detail lowfi | 01/02, ảnh Fleet | M03/M05/M06/M07 columns, server queries, nested navigation | UX-F04/19/20; complete fields, correct grain/context |
| UXM-05 Score/Regime/Archive | P/R/B + lifecycle contract | Four score semantics, continuity, historical support, M08 | UX-F08…16/25…40; honest pending config, no auto-live |
| UXM-06 HiFi/design system | approved lowfi | Responsive states/components/chart/table; annotate fields | UX-F22 + coverage; design approved; link exact HiFi revision here |
| UXM-07 Fixture implementation | approved scope, 06 + schema | Typed components/adapters, flags/deep links/saved views | Applicable UX-F01…40; fixture-browser only, no real API claim |
| UXM-08 Read-only vertical slice | ELP2-04 + selected05/06 | Source→API→UI, manager/researcher routes, freshness | UX-F02/03/04/05/07/19/21; actual selected source receipt |
| UXM-09 Commands | ELP2-07 exact operation qualified | Preview/confirmation/receipt, unknown/retry/revoke | UX-F14…18; UI-to-authority proof, other actions locked |
| UXM-10 Acceptance/handoff | selected reads/actions, budget | Accessibility, performance, regression and runbook | Selected gate matrix valid; release approval still separate |

UXM-03/04/05 độc lập sau shared IA; không chạy ba người sửa cùng components nếu
chưa chia owned paths. ELP2-08 là backend/workflow handoff chung, không phải một
frontend rewrite thứ hai ngoài UXM. Claude ghi missing fields thành request có
locator, expected DTO, blocked element và done-when, không tự bịa facts.

## 14.5 Score P0…P3 và external Edge dependencies

[Score §12](./execution_loop/SCORE_REGIME_SPECIFICATION_v1.1_FINAL_VI.md#12-phạm-vi-triển-khai-và-exit-gates)
và [feasibility §3–5](./execution_loop/SCORE_IMPLEMENTATION_FEASIBILITY_REVIEW_v1.0_VI.md#3-dependencies-và-độ-phức-tạp-mvp)
là guide chi tiết. Prefix **Score** phân biệt Research phases; không thêm formula mới.

| Score phase | Gắn Portal / Claude | To-do và exit riêng |
| --- | --- | --- |
| P0 Audit inputs/config/provenance | ELP2-00/01/05; UXM-01/05 | Source dependency matrix cho NAV, flow-adjusted return, required costs, dedup notional, FX, economic capital, continuity. Policy schema/math validation; approved config còn thiếu giữ policy_pending, không NAV-growth→TWR |
| P1 Shared calculator | ELP2-06; fixture UXM-05/07 | Fixed F/P/R/B, bounds/contributions/direct NAV, reproducible snapshots; spec §11 invariants, precision/overflow/underflow, rolling peak leaves window, stress invalid path. Không paste reference Python thành production kernel |
| P2 Read model/UI | ELP2-04/06/08/09; UXM-08 | Scope/window/basis cache, corrections/original-restated, stage continuity. Real economic snapshot-to-browser parity, no hidden denominator, same-window provisional; direct NAV score không bị research binding/Regime chặn vô lý |
| P3 Calibration/shadow + Regime lane | ELP2-10/11; UXM-05/10 | Approved horizon anchors/stress/grid/block/maturity artifact; temporal replay/clipping/rank sensitivity. Regime riêng: bound historical references/support/no leakage, không forecast. Read-only production cần review config; không tự trading activation |

Tính metrics trên inputs đã align là O(n+m), không gọi cả source IO/join O(n)
vô điều kiện. MVP rolling ADD/MDD rebuild đúng window; chỉ optimize sau profiling.
Compute theo sealed watermark/affected corrections, không mỗi browser request
hay tick. Cache đủ policy/basis/window/source/permission revisions; no fixture
constants as production config. Historical 44/47 tests trong review chưa là
campaign execution receipt; đồng thời math PASS không là data/config/empirical PASS.

External workstream chỉ là dependencies, không giao Codex tự sửa HK:

| Portal need | Edge/PM dependency | Khi chưa có |
| --- | --- | --- |
| Inventory/sizing | EPG10-00/01 và current TS/DL/PM journals | Repin source/measurement windows, không giả host capacity |
| Schemas/publication/local projections | EPG10-02…05; PM selected exporter authority | Contract/fixtures được làm; dependent runtime read typed unavailable |
| Commands | EPG10-07/08/09 + PM exact operation/trust/commit semantics | Disabled direct API; Portal approval không gọi là upstream applied |
| Revoke/replay | EPG10-03…05/08/09 | Safe snapshot scope nếu qualified; không claim global replay |
| Coexistence/cutover | EPG10-06/09/10/11, applicable TS/DL gates | Chặn affected activation, không chặn independent UI design |

## 14.6 Test impact, receipts và exit discipline

- **Mỗi slice:** requirement → file/schema/policy/dependency hash → tests →
  receipt path → verdict. Receipt reuse ghi original candidate, unchanged
  dependencies và rationale; không gộp nhiều images thành một lần chạy giả.
- **Contracts/policy:** focused schema/generation/compatibility, matrix
  positive/negative grants và economic invariants. DB concurrency/revoke/crash
  cần real isolated DB proof, unit/fixture không thay thế.
- **Projection/query:** tie-out full dataset vs page, null/unit/sort/group,
  correction/checkpoint/dedupe; bounds rows/bytes/pools/queues/recompute đo thật.
- **Frontend:** typecheck/consumer tests cho changed contracts, browser so
  approved HiFi ở desktop/narrow, keyboard/overflow/context/absence/revoke;
  fixture và real lane ghi riêng. Re-record baseline chỉ reviewed visual deltas.
- **Resource tests:** target/budget/threshold trước khi chạy; focused load/fault
  duration theo risk, không mặc định 24h soak hoặc lặp full engine/build vì docs.
  Normal hook không bypass; gom vào coherent code batch được duyệt.
- **Mỗi endpoint:** manifest có design_ready, fixture_compatible, source_ready,
  identity_policy_ready, privacy_ready, metric_ready, performance_ready,
  runtime_enabled, blockers/approver; command thêm exact operation/environment.
- **Closeout:** báo selected scope và remaining roadmap riêng; không hạ gate
  để PASS, không biến historical/calibration fixture thành deployed evidence.
  Cleanup chỉ resources tạo trong gói, không broad prune hoặc business data.

## 14.7 Gói tiếp theo đề nghị Bobby giao

**Historical sequencing khi lập plan2026-10-15:**

1. **Codex ELP2-00**, cùng **Claude UXM-00**: read-only baseline/coverage và
   browser audit/reuse. Sau đó duyệt authority/field-scope decisions còn mở.
2. **Codex ELP2-01**, Claude **UXM-01/02** song song theo schema drafts; freeze
   contract slice đầu tiên rồi Claude làm lowfi/HiFi trong gói được giao.
3. Chọn read-only vertical slice **Overview → Portfolio → Fleet → Alpha detail**;
   triển khai foundation 02…06 theo dependencies, không mở command trước trust.

**Current sequencing theo Bobby2026-10-16:** ELP2-00 đã có audit return;
đề nghị một goal backend **ELP2-01→02→03→04** theo [§14.9](#elp2-backend-batch-01-04).
Frontend/UXM **chưa bắt đầu theo chỉ đạo owner**, không tự giao Claude phase.
Vẫn viết contract/handoff sau mỗi phase để Claude nối khi Bobby giao sau;
chưa có FE acceptance không cản backend độc lập hoặc thành product complete.

Các approval còn cần theo guide: researcher exact field allowlist/delegation
ceiling; owner recovery nếu đưa vào scope; deployment/resource/retention scope;
runtime score calibration artifact; exact command activation. **Không hỏi lại
formula/weights/bands đã chốt.** Docs package này không đổi runtime, source
authority, UI, migrations hoặc grants; implementation và remote writes chờ giao gói.

<a id="elp2-phase-handoff"></a>

## 14.8 Phase delivery, next-step map và request hai chiều

Addendum Bobby 2026-10-16 (Asia/Saigon). Bảng dưới là **requirements bàn giao**,
không là kết quả đã đạt hay permission triển khai. “Next” nghĩa là có thể đề
xuất khi đủ dependencies §14.1/14.3 và Bobby duyệt; không chỉ xét phase liền trước.
Mọi UXM/Score phase cũng dùng template và cùng reporting rule, không ngoại lệ.

| Phase kết thúc | Artifact tối thiểu để giao | Backend có thể đề xuất tiếp | Claude có thể đề xuất tiếp | Nợ/dependency phải báo rõ nếu còn |
| --- | --- | --- | --- | --- |
| ELP2-00 | Baseline manifest; route/source/reuse map; decisions + owners | 01 contract slice | UXM-00 completion → 01/02 với contract drafts | Runtime identity unknown, source mismatch, scope/field-policy decisions |
| ELP2-01 | Versioned schema/generated types, canonical fixtures + negative paths, compatibility notes | Design 02/03/05/06/07 theo files độc lập | UXM-01/02 rồi lowfi03/04/05 | Config/field approval; chưa có real-source evidence không cấp runtime |
| ELP2-02 | Identity/lifecycle DTO + migration/preservation proof, deny/revoke examples | 03 effective grants; 04 khi policy đủ | M10 identity states, UXM-02/07 được duyệt | Recovery/mapping chưa duyệt; users/grants compatibility |
| ELP2-03 | Capability matrix/ceiling, proposal receipts, effective policy revision | 04 privacy; 07 contract/status | M10 grant preview, pending/rejected UX | TS accepted authority/trust hoặc exact researcher disclosure thiếu |
| ELP2-04 | Route/field matrix, query predicates và privacy negative receipts | Selected06 khi05 đủ; 09 design | UXM-08 chỉ endpoint có05/06 qualified | Export/cache/SSE/in-flight bypass còn thiếu evidence |
| ELP2-05 | Selected family manifest, publication/source/time/coverage receipts, field map | Selected06 economic/read adapters | Fixture→real consumer cho family có04/06 | Per-field source gaps, continuity/trust, economic coverage/calibration |
| ELP2-06 | Named BFF/type/query semantics, score capsules, fixtures + data tie-out | 08 integration; 09 stream; selected10 measurement | UXM-08 manager→detail, Score P2 | Missing fields/config, FE chưa nối, corrections/metric proofs chưa có |
| ELP2-07 | Exact operation/state contract, idempotency/status/recovery receipts, activation scope | 08 command workflow; 09 revoke; selected10 | UXM-09 đúng operation được phép | Upstream authority/certification; retained preview không đủ write proof |
| ELP2-08 | Consumer map, approved design pins, workflow/API/browser receipts và unresolved IDs | Affected09/10; không làm lại unchanged backend | RemainingUXM-08/09, chuẩn bị10 | BE delivered nhưng FE chưa accepted, thiếu positive lanes hoặc design review |
| ELP2-09 | Scoped stream/cursor/revoke contract, race/recovery/bounds receipts | Affected10 | UXM-08/09 reconnect/revoke states; UXM-10 | Source continuity/slow-client/revoke gaps, disabled stream scopes |
| ELP2-10 | Gate→candidate/dependency→receipt index, budget/perf/calibration verdict | 11 selected scope khi mandatory gates đủ | UXM-10 browser/resource closeout | SLO/regression/DR/config chưa đạt; không hạ gate hoặc bỏ scope âm thầm |
| ELP2-11 | Exact candidate/schema/config, migration/restore/rollback và final scope manifest | Chỉ scope follow-up được Bobby giao; release approval riêng | Final owner walkthrough và documented follow-up | Owner review/release authorization, external/optional/deferred scope còn lại |

**Quy trình phối hợp trong mỗi phase:**

1. Entry: đọc handoff/request mới nhất cả hai bên; ghi approved scope, inputs,
   owned paths và impacted tests. Backend và frontend cùng làm trên source đã
   thống nhất, không tự lấy ref cũ ghi đè shared branch.
2. Làm: primary giao subagents việc độc lập nếu hữu ích, contract/shared-file
   writer chỉ một người. Tasks có scope, acceptance và resource budget; primary
   review diff + evidence trước integration. Docs-only không cần nhiều agents.
3. Giao: producer ghi commit/type/example/fixture + exact consumer task. Consumer
   xác nhận ACCEPTED hoặc CHANGES_REQUESTED với evidence; chưa nhận phản hồi
   ghi AWAITING_CONSUMER_REVIEW. Không cần đợi agent kia online để giao packet,
   nhưng không gọi integration accepted khi chưa có proof.
4. Đóng/báo cáo: packet có requirements/test results, stats đúng baseline,
   backend next, debt IDs/owners, Claude next, new/closed requests và approval
   cần thiết. Unified cập nhật status/link ngắn cùng delivery; không tạo board
   canonical thứ hai hoặc ghi suông “done, no gaps”.
5. Chuyển phase: đề xuất một gói tiếp rõ ràng để Bobby duyệt. Nếu blocker chỉ
   ảnh hưởng một endpoint, nêu independent next work, không tự hạ exit gate.

Request ID mới dùng `ELP2-REQ-<phase>-<nnn>`; canonical details nằm trong packet
phát sinh, guide hiện hành không bị sửa âm thầm. Request BE→FE và FE→BE đều có
owner/done-when/receipt/acknowledgement. Optional/deferred cần destination và
approval; không dùng typed absence hay delivered code để che source/integration
gap chưa đóng. Khi không phát sinh request, báo đã đối chiếu và ghi rõ none.

**Historical disposition of workflow addendum:** chưa ELP2/UXM phase nào được
mở bởi riêng addendum đó. **Current update2026-10-16:** Bobby subsequently
assigned ELP2-00; read-only audit return is linked above. No implementation
task/build/write-test/merge/push/deploy. Backend next ELP2-01; Claude UXM-00
audit independently assignable; both still require assignment. Exact pending
decisions/owners and5 new requests are canonical in the ELP2-00 packet.

<a id="elp2-backend-batch-01-04"></a>

## 14.9 Backend batch — ELP2-01 → 02 → 03 → 04

**Current checkpoint — reviewed2026-10-16T02:51Z:** keep this four-phase batch;
01–03 are landed local technical checkpoints and04 has uncommitted work, not
a passing exit. The goal service currently reports **no active goal**. Bobby's
latest request is plan review before a new goal assignment, not permission to
resume implementation. Use [the current resume point](#elp2-batch-current-resume)
and [the current assignment card](#elp2-batch-next-assignment), not a restart
from01 or four replacement phases. Earlier ACTIVE/NOT_STARTED statements below
are historical. Frontend remains NOT_STARTED_BY_OWNER_DIRECTION; this return
adds only documentation and reconciles the already-finished test cell.

Bobby yêu cầu sắp xếp ngày2026-10-16 (Asia/Saigon): chuẩn bị một goal gồm
**bốn phase backend liên tục**, frontend chưa bắt đầu. **PLAN_ONLY /
NOT_STARTED**: việc sửa chỉ mục này chưa là lệnh bật goal hoặc triển khai.
Guide/exit gốc ở §14.3 và Portal guide §15 giữ nguyên; không rename phase,
không gộp bốn phase thành một verdict để bỏ journal hoặc che blocker.

**Plan review2026-10-16:** yêu cầu hiện tại là sắp xếp để Bobby giao goal sau,
không phải lệnh triển khai. Dòng draft `ACTIVE/IN_PROGRESS` trước đó được sửa
về **PLAN_ONLY / NOT_STARTED** vì không có approval triển khai trong yêu cầu
này. [ELP2-01 preparation note](./execution_loop/evidence/ELP2-01/README.md)
chỉ ghi việc đọc/chuẩn bị, không phải implementation receipt. Không suy quyền
từ trạng thái automation/goal cũ; frontend/shared runtime/push/dev/main/release
vẫn ngoài phạm vi. Khi Bobby giao goal, ghi exact approval và entry SHA mới.

### 14.9.1 Thứ tự, deliverables và gate chuyển bước

| Thứ tự | Phase / backend scope | Deliverable tối thiểu trước bước sau | Validation theo guide / dependency |
| --- | --- | --- | --- |
| 1 | [ELP2-01](#elp2-01): authority/resource/mode/lifecycle, decimal/UTCms/absence/revision, PM envelope và score/config contracts; mapping existing routes | Versioned schema/OpenAPI + generated types; field/authority dictionary; FX-01…25 gồm positive/negative/pending fixtures; compatibility map. Scope chỉ schema score, chưa tự triển khai whole calculator hoặc production calibration | T01-01…15, generation/schema drift, exact PM payload và legacy compatibility. Contract kỹ thuật được review/freeze đủ cho local implementation; external authority review chưa có vẫn ghi pending, không gọi toàn phase/full integration complete |
| 2 | [ELP2-02](#elp2-02): reuse identity/session/owner/lifecycle; verified TS/researcher mapping state; current-session revoke và allowlisted own-profile | Backend DTO/adapters, additive migration nếu thực sự cần, preservation fingerprints và lifecycle/owner/session receipts. Không reset account/grant, fuzzy-match tên hay bật owner recovery chưa duyệt | T02-01…10; real disposable PostgreSQL old→new migration/read compatibility khi có schema change, authenticated HTTP/CSRF/revoke/concurrency. Recovery disabled rõ ràng nếu chưa được duyệt; identity invariants phải đạt trước grants |
| 3 | [ELP2-03](#elp2-03): shared policy evaluator; explicit resource×mode×action ceiling; preview/grant/revoke và TS proposal/receipt state machine | Capability registry/policy revision, audit/idempotency/CAS; app vs TS-effective states; pending/rejected/unknown fail closed. Preset mapping dùng stable IDs; ceiling và researcher fields chưa duyệt không được cấp thật | T03-01…11; real DB/API negative/race/idempotency tests. Accepted TS receipt ở fixture/harness phải ghi TEST_ONLY; chưa có actual TS acceptance thì business-grant activation BLOCKED, không claim TS rejects/accepts thực |
| 4 | [ELP2-04](#elp2-04): apply current policy trước query/count/join/group/rank; field redaction, scoped cache/cursor, export/status/audit và existing stream paths | Complete route authorization matrix từ112 Execution patterns + adjacent admin/auth/facade boundaries; mỗi surface có enforced/retired/disabled/internal disposition. Current linked-slice policy, no historical-owner bypass; giữ workspace/deep-link API compatibility | T04-01…12; real scoped DB/API leakage/IDOR/revoke/in-flight tests, list/detail/totals/sort/export/cache/stream negatives. Chưa mở export/SSE thì chứng minh disabled direct API, không tạo service mới chỉ để test. Upstream replay/continuity còn thuộc05/09 |

**48 test IDs** là requirements phải map vào tests/receipts, không phải48
engine runs hoặc48 lần build. Fixture/unit/PG/HTTP/actual upstream/browser là
những proof khác nhau. N/A chỉ khi có applicability proof; không dùng
NOT_APPLICABLE để miễn gate thiếu implementation/authority.

**Bốn checkpoint để chạy liên tục, không đợi frontend:**

1. **01 → 02:** có versioned contract/generation command dùng được, FX manifest
   và compatibility/authority map; mọi ambiguity ảnh hưởng identity/money đã
   resolve hoặc khóa đúng schema/action. External TS/Edge review còn pending
   được ghi riêng; không dùng một contract đang mâu thuẫn để xây identity.
2. **02 → 03:** identity preservation, protected-owner, session/CSRF/revoke và
   verified mapping regressions đạt; không có đường owner lockout. Snapshot
   synthetic của DB cũ→mới phải giữ stable IDs, session-generation semantics,
   lịch sử/audit; test không được chỉ chạy trên DB trống khi có migration.
3. **03 → 04:** một evaluator/policy revision dùng chung, app vs TS states tách
   biệt, ceiling và revoke-at-commit đạt; chưa có approved matrix/TS receipt thì
   runtime quyền mới vẫn deny/pending. Không đợi cấp quyền thật để test privacy.
4. **04 → batch return:** mọi route trong census được disposition và có guard/
   predicate/redaction hoặc bằng chứng disabled/retired; negative tests phải
   đi qua direct API, không chỉ unit evaluator. Giao bốn packet/commits và
   consolidated debt; **chưa mở05**, chưa coi whole product/runtime complete.

Checkpoint đạt là dependency kỹ thuật để đi tiếp trong **batch được duyệt**,
không thay original full exit hoặc bỏ unresolved security invariant. Nếu một
checkpoint fail thì sửa dependency; không tự skip phase rồi báo đủ bốn phase.

### 14.9.2 Scope card cho lần duyệt goal

- **Source/target:** `/home/bobby/portal-research`, branch duy nhất
  `docs/research-loop-plan`. Dùng ELP2-00 manifest làm entry reference, repin
  HEAD/dirty/guide/dependency hashes lúc bắt đầu và trước mỗi landing. Giữ
  onboarding edits/assets và code Claude; không auto lấy old BE lane ghi đè.
- **Owned:** backend identity/policy/repository/controllers có liên quan,
  contracts/OpenAPI/generation/fixtures/tests, additive migration khi cần và
  packet `execution_loop/evidence/ELP2-01…04/` + Unified. Đọc local rules của
  module trước sửa; API cũ không được silently reinterpret hoặc thêm required
  fields làm gãy accepted consumer; schema breaking cần versioned adapter.
- **Storage/migrations:** reuse Portal identity/app-policy stores hiện có;
  không thêm auth DB hoặc business ledger TS thứ hai. Nếu cần additive schema,
  kiểm migration inventory và reserve số tiếp theo ngay trước viết để tránh
  đụng Research đang làm; không chốt số cũ từ một handoff lịch sử. Không drop,
  rename destructive hoặc seed tài khoản/quyền production trong batch này.
- **Forbidden:** `apps/portal/frontend/**`, global tokens/components/baselines,
  Research/Planning nghiệp vụ không liên quan, protected strategy, current
  users/grants/business rows trên preview/dev/stable, shared runtime volumes.
  Không mở ELP2-05…11, Score implementation/UXM hoặc Edge/TS code changes.
- **SSH HK:** chỉ repin/read source/current PM R2/journal/measurement locks và
  relevant contracts; không build/test/write/restart/migration remote. Không
  direct TS DB/Redis/broker/CLI. Source change chỉ invalidates receipts thực
  sự phụ thuộc; không kéo audit ELP2-00 chạy lại toàn bộ vô cớ.
- **Test target/budget đề xuất:** một test cell riêng cho batch, tối đa một
  PostgreSQL container tại một thời điểm, không publish public listener; DB
  credentials/schema/data synthetic riêng, không mount existing Portal data.
  Target ceiling tổng4CPU/4GiB và transient disk8GiB; test workers tối đa2,
  chỉ một heavyweight build/hook/DB suite cùng lúc. Đây là budget proposal,
  không đoán host đủ tài nguyên: kiểm capacity trước chạy, công cụ cần vượt
  budget phải báo trước, không âm thầm mượn preview hoặc TS/DL workload.
- **Runtime boundary:** local code/test/migration rehearsal khác production
  activation. Không rebuild shared preview, đổi runtime config, apply migration
  trên persistent existing DB, cấp quyền thật, renew TLS, bật relay/source/SSE,
  deploy/push/merge dev/main/sign release. Những việc đó cần gói duyệt riêng.
- **Rollback:** additive/versioned contracts, deny-default; code rollback không
  phục hồi revoked sessions/grants hoặc xoá audit. Test cell chỉ teardown đúng
  resources đã tạo, giữ receipt và hashes; no broad prune.

### 14.9.3 Pending decisions không chặn sai phần việc

Canonical decisions/requests giữ ở
[ELP2-00 register](./execution_loop/evidence/ELP2-00/decisions-and-handoff.md),
không copy thành ledger mới. Batch implement validator/state machine và tests;
**không tự duyệt values/quyền** để đạt gate:

- DEC01: owner recovery không mở; chứng minh protected-owner denial và recovery
  disabled. Không làm Bobby mất quyền đã có hoặc tạo reset/recovery backdoor.
- DEC02/11, request002: chưa có exact Stan ceiling/researcher field matrix thì
  pending/default-deny cho quyền mới; giữ quyền hợp lệ hiện tại. Positive policy
  cases dùng synthetic TEST_ONLY policy ghi rõ, không apply fixture vào users.
- DEC03, request003: hiện chưa actual TS human membership acceptance thì
  proposal/trusted-receipt adapter vẫn hoàn thiện/test được; effective TS grant
  không chuyển APPLIED chỉ vì local app applied hoặc transport ACK.
- DEC12, request005: fixed score formula/weights/bands được schema-test; config
  lifecycle vẫn policy_pending, không phát numeric production từ fixture.
- DEC09: chưa duyệt profile export thì không bật export mới. Existing surfaces
  vẫn phải được kiểm direct API/access/status/download/cache theo policy;
  `DISABLED` có receipt không phải bỏ qua surface khỏi route matrix.
- Một external review/activation gate chưa đủ: ghi **backend technical verdict
  và original phase exit riêng**. Tiếp phần độc lập đã được goal duyệt nếu
  dependency kỹ thuật đủ; không gọi phase COMPLETE khi original mandatory gate
  còn mở. Nếu identity/contract/security invariant hỏng thì dừng dependent
  implementation và sửa nguyên nhân, không tiếp bằng cast/mock/fallback broad.

### 14.9.4 Journal, commits và handoff sau từng phase

1. Trước phase: đọc packet/request mới nhất, ghi entry SHA/dirty/pins/approved
   scope, owned paths, test applicability và resource budget; nếu dùng subagents
   lập task map. Một writer shared OpenAPI/generated/migrations/Unified.
2. Trong phase: ghi requirement→code/type→test/receipt→actual verdict. Không
   dồn mọi journal đến cuối goal; báo progress/blocker ngắn trong lúc làm.
3. Trước chuyển bước: ghi packet theo template, update Unified phase row/return,
   debt/request IDs/owners/done-when và exact next phase. Commit coherent
   code+tests+docs của phase qua normal hook; chỉ stage owned paths, không
   `--no-verify`, không lẫn dirty files bên khác. Recheck HEAD trước landing.
4. Tests: focused impacted suites mỗi phase; reuse unchanged valid receipts với
   dependency hashes. Full cross-phase regression một lần cuối batch khi cần;
   không build frontend/engine/whole stack vì docs. Hook bắt buộc vẫn chạy theo
   repo; không hứa một hook cho cả batch nếu có nhiều normal commits, không tự
   sửa hook để né. Gom coherent changes để tránh hook cho từng dòng/request.
5. **Claude chưa bắt đầu:** vẫn publish handoff mỗi phase gồm operationId,
   generated type/schema/fixture hashes, example provenance, semantics/errors/
   absence/permissions, migration/runtime requirements và exact consumer tasks.
   Ack ghi `AWAITING_CONSUMER_REVIEW` / frontend `NOT_STARTED_BY_OWNER_DIRECTION`;
   không spawn/giao frontend work hoặc đợi Claude phản hồi để làm backend độc lập.
6. Cuối phase/goal: code/generated/tests/docs stats, verdict backend vs original
   full exit, còn nợ, backend next, Claude next khi được giao, request hai chiều,
   cleanup/capacity và rollback. Không có request mới cũng phải ghi đã đối chiếu.
   Cuối batch tổng hợp bốn returns, không đổi failed/blocked thành blanket PASS.

**Handoff tối thiểu riêng cho bốn phase** (Claude đọc khi được Bobby giao,
không phải lệnh frontend bắt đầu):

| Producer | Nội dung consumer phải nhận | Consumer có thể làm sau này | Giới hạn phải hiện rõ |
| --- | --- | --- | --- |
| 01 | Generated types/command, versioned examples FX-01…25, field dictionary, legacy/Edge/Portal map, exact-value/absence/error semantics | IA/role-state map và fixture-backed composition UXM-01/02 | Synthetic không là source facts; score/config và runtime readiness độc lập |
| 02 | Identity/self-profile/lifecycle operations, CSRF/revoke behavior, immutable mapping và protected-owner denial fixtures | M10 profile/lifecycle states trong UXM-02/07 | Không auth mới, không tự nhận owner/deployer từ display name; recovery chưa duyệt vẫn disabled |
| 03 | Capability/ceiling preview, policy revision, app-applied/TS-pending/accepted/rejected/unknown examples, audit/idempotency errors | Access preview/diff, pending authority và disabled actions | Button không tự suy quyền; accepted fixture chỉ TEST_ONLY, không bật command |
| 04 | Route/field allowlist, manager/restricted schemas, scoped query/paging/cache/revoke contracts và leakage receipts | Manager/researcher variants, denied vs empty, export/stream disabled states | Không dùng full payload rồi hide rows; real-source reads chờ05/06, stream qualification chờ09 |

Mỗi handoff ghi thêm **working-diff hash hoặc commit**, schema/fixture hashes,
operation nào đã mount hay chỉ contract-only, môi trường thực sự sẵn sàng,
exact consumer file/task và acceptance. Không ghi một operation minh họa như
API đã chạy; consumer chưa bắt đầu thì không mở request thiếu acknowledgement
thành blocker giả cho backend. Request mới có owner/done-when; pending policies
tham chiếu register00 thay vì copy một bảng quyền thứ hai.

### 14.9.5 Cách giao một goal cho bốn phase

Một approval nêu đích danh01→04 và scope card ở trên là assignment cho **từng
phase trong danh sách**, không phải bỏ per-phase gates. Khi Bobby bật goal,
không hỏi lại quyền chuyển bước đúng scope nếu technical dependency đã đạt.
Request hiện tại mới sắp xếp plan: **chưa có approval triển khai batch**.

Prompt Bobby có thể dùng:

> Bật goal làm backend ELP2-01 → ELP2-02 → ELP2-03 → ELP2-04 theo Unified §14.9.
> Duyệt scope local backend, generated contracts, isolated tests và budget/test
> cell đã ghi; không bắt đầu frontend, không đổi shared preview/production/HK
> runtime hay tự cấp quyền/config còn pending. Làm tuần tự, kiểm gate, journal,
> handoff và commit từng phase theo rules; không cần hỏi lại từng bước trong
> scope này. Blocker external giữ đúng gate và làm tiếp phần độc lập đã duyệt;
> không giả full completion. Cuối goal báo đủ bốn phase, debt và Claude handoff.
> Không push/merge dev/main/release/deploy.

### 14.9.6 Các điểm phải kiểm ngay khi vào implementation

- **PM wire, không sửa theo mẫu cũ:** re-read HTTP adapter và strict parser của
  PM R2 đúng source pin trước freeze. `expected_versions` của HTTP candidate là
  canonical decimal-counter strings tới `9223372036854775807`, khác opaque
  Portal revisions và Python integer nội bộ; không round-trip qua JS Number.
  Giữ actor/trusted context ngoài business payload; currency phải hỗ trợ USDT.
  Cross-check operation-specific version keys và route availability, không suy
  operation runnable chỉ vì lower-level parser nhận tên đó.
- **Guide example/source discrepancy:** exact pinned source adapter/parser và
  applicable authority contract phải được đối chiếu; ghi locator khi sample
  PM thiếu `recipient_kind` hoặc thêm `command_scope`. Không sửa guide PM bên
  HK, không thêm field vào strict payload để "khớp" ví dụ, không gọi unmounted
  candidate router là runtime support. Sai khác chưa resolve chỉ khóa action
  phụ thuộc, không chặn schema/identity độc lập.
- **Security enforcement:** inventory cả controllers, facade/named aliases và
  repository/query/cache/stream/export, không coi `SessionGuard` có mặt là đủ
  resource authorization. Grant revision/current binding phải ràng buộc cả
  in-flight results và cursors; không leak hidden totals bằng sort/rank/filter.
- **Tests/resources:** focused contract/unit trước, isolated PostgreSQL/API khi
  cần; đo capacity và cleanup đúng cell. One writer shared contracts/migrations/
  Unified, audit/test agents chỉ trong gói được giao và không tự build song song.
  Không chạy hook/build/engine chỉ để chứng minh thay đổi plan Markdown này.
- **Planning validation:** kiểm diff và local Markdown links/anchors của gói;
  đây là documentation check, không đánh dấu T01…T04 đã PASS. Commit gói plan
  vẫn phải theo normal hook; nếu hook kéo test ngoài scope thì ghi PENDING,
  không bypass hoặc đổi hook. Chưa push/merge/rebuild/runtime change.

**Planning return2026-10-16:** `git diff --check` exit0; kiểm25 local links
trong batch/entry/preparation note và4 phase anchors,0fail. Đây là docs-only
validation; application tests/build/DB/runtime NOT_RUN/NONE. Normal commit hook
và commit PENDING trong scope lập plan; không bypass. Bốn phase vẫn NOT_STARTED,
frontend NOT_STARTED_BY_OWNER_DIRECTION. Next: Bobby giao exact batch bằng prompt
§14.9.5; backend bắt đầu01, không tự mở implementation từ planning return này.

**Goal assignment (subsequent continuation,2026-10-16):** Bobby's active objective
explicitly assigns backend ELP2-01→04 with this scope/budget, sequential gates,
journal/handoff/commit per phase. Batch **ACTIVE**,01 **IN_PROGRESS**;02→04
queued. Entry source `be56efdf8a44b0fd8cd44202b04ada582293a1dd`, branch
`docs/research-loop-plan`; planning dirty paths preserved. This later assignment
does not authorize frontend, push/dev/main merges or shared runtime changes.

**ELP2-01 technical return2026-10-16:** versioned foundation/schema-only OpenAPI,
generated types, FX-01…25 and PM/legacy/Edge validators delivered locally.40/40
contract tests and source-only Control API typecheck PASS; generation/snapshot
drift checks PASS. [Packet](./execution_loop/evidence/ELP2-01/README.md) records
artifact hashes, failure/fix history, external gates and resource closeout.
Original external authority review still OPEN; no production policy/config,
grants, mounted API, source activation or consumer acceptance claimed.02 is
next under this active assignment;03/04 await its technical dependencies.

### 14.9.7 Reviewed four-phase backend runbook — frontend not started

Theo yêu cầu Bobby rà lại plan để giao một goal bốn phase: giữ nguyên thứ tự
**ELP2-01 → ELP2-02 → ELP2-03 → ELP2-04**, không kéo ELP2-05 hoặc UXM vào goal.
Mục này là rà soát/làm rõ kế hoạch, không cấp thêm quyền từ trạng thái goal hay
thay đổi đang có. Các implementation/test receipts trước đó giữ nguyên lịch sử;
chỉ dùng khi dependency hash tương thích, không gọi bốn phase đã hoàn tất.

| Checkpoint | Kết quả phải bàn giao | Được làm tiếp khi |
| --- | --- | --- |
| 01 — contracts | Authority/compatibility dictionary, generated schema/types, FX-01…25, requirement→test map; ghi rõ contract-only hay API đã mount | Contract kỹ thuật không còn mâu thuẫn identity/money; các quyết định external còn thiếu đã khóa đúng feature |
| 02 — identity | Bảo toàn users/bindings/owner/history; current-session/CSRF/revoke/concurrency; own-profile allowlist và mapping absence có kiểu | Disposable DB/API preservation và owner/session invariants đạt; recovery chưa duyệt vẫn disabled |
| 03 — policy | Một evaluator, resource×mode×action, delegation ceiling, preview/revision/idempotency/revoke audit; app-applied khác TS-effective | Policy/revoke-at-commit tests đạt; pending matrix/TS receipt không cấp quyền thật; không dùng fixture làm production policy |
| 04 — read enforcement | Route census đầy đủ, scope trước query/count/aggregate, redaction, cursor/cache/export/stream policy và in-flight revocation | Mọi surface có disposition và direct-API negative proof; thiếu nguồn/authority giữ BLOCKED đúng feature, không blanket PASS |

**Chu kỳ bắt buộc của từng phase:** đọc dependency packet/request mới nhất →
entry SHA/dirty/pins/owned paths → implementation theo scope → focused tests →
normal hook và coherent commit → journal/Unified return + handoff + debt/next.
Không bắt đầu phần phụ thuộc khi checkpoint trước hỏng. Không gom journal đến
cuối bốn phase; không lặp engine/browser/full build chỉ vì đổi Markdown.

**Return bắt buộc:** (1) đã làm và commit; (2) test mới/reuse/NOT_RUN với receipt;
(3) backend technical exit khác full-product/runtime exit; (4) backend phase nào
tiếp tục được; (5) gap/owner/done-when; (6) Claude có thể nối gì khi được giao;
(7) request hai chiều và acknowledgement; (8) resource cleanup/rollback.
Handoff ghi operation/type/schema/fixture/producer pin, field/absence/permission
mapping và consumer acceptance. Frontend **NOT_STARTED_BY_OWNER_DIRECTION**;
ack **AWAITING_CONSUMER_REVIEW**, không tự giao việc hoặc sửa UI/baseline.

Đọc-only audits/negative-test design có thể delegate theo rules §8; primary giữ
schema/generated outputs/migration numbering/Unified và integration. Không chạy
hai heavy lanes cùng lúc hoặc tăng budget theo số agent. Scope/budget/remote,
runtime và pending-decision boundaries tại §§14.9.2–14.9.3 không thay đổi.

**Điểm bắt đầu thực tế, không làm lại từ đầu:** trước khi chuyển checkpoint,
đối chiếu working tree với packet01/02. Contract01 đã có kết quả focused;
commit landing chưa đạt. Lượt normal hook kết thúc với contracts388 PASS,
Control API2603 PASS/1 FAIL/3 skipped. FAIL ở retained-review dùng lại session
sau disable→enable; session đã revoke không được sống lại. Test harness đã
được chỉnh để lấy session mới, **chưa có receipt retake** cho chỉnh sửa đó.
Không coi hook thất bại là commit thành công hoặc kéo03/04 vượt checkpoint02.

**Phân chia công việc khi goal được giao:** primary giữ contracts/generated,
migrations, journal và integration; audit độc lập có thể rà policy03 và route
matrix04 trong lúc primary chốt identity02. Không triển khai dependent policy
trước identity gate.03 phải bao gồm kiểm replay sau revoke/step-up, fingerprint
actor/session và audit before/after của grant legacy;04 kiểm cả aliases,
profile/context metadata, totals, cursor và kết quả chờ cache/in-flight, không
chỉ list/detail. Những phạm vi này nằm trong authority/privacy guide, không
phải mở thêm phase hoặc commissioning TS/Edge.

**Planning closeout:** chỉ kiểm Markdown links/anchors và diff cho runbook;
không chạy lại full suite/build/DB do sửa kế hoạch. Các receipt trên là lịch
sử hiện có, không phải test mới của lượt planning. Code đang dở được giữ nguyên;
không push, merge, rebuild shared preview hoặc bắt đầu frontend.

**Implementation continuation2026-10-16:**01 landed at
`700aa6a47cdfc72c53ced8f1851144e1ab58f3e0`; normal hook89394 exit0,
388 contracts/2,606 Control API tests PASS,3 API tests skipped; clean build,
PostgreSQL restore signature and tracking PASS. Its owned cell/network cleanup
verified. This supersedes the earlier failed-hook checkpoint without erasing
it.02 final18-case snapshot is prepared for its coherent normal-hook landing;
03/04 remain dependent, not complete. Frontend is not assigned; no push/runtime
change or production policy/TS authority is authorized by these local results.

<a id="elp2-batch-current-resume"></a>

### 14.9.8 Current resume point — rà lại batch, không chạy lại phần đã đạt

**Later approved closeout,2026-10-16:** the table below is the historical
02:51Z checkpoint, not today's final test verdict. Follow the
[closeout journal and request disposition](./execution_loop/evidence/ELP2-04/closeout-2026-10-16.md)
and [published consumer handoff](./execution_loop/evidence/ELP2-04/contract-handoff.md).
History failures have a passing retake; Manager/analytics retake and restore
also pass. The normal-hook pin belongs to the coherent commit containing this
addendum, contingent on hook success; exact logs and limitations are in the packet.
Original external policy/source gates and consumer acceptance remain distinct.
No goal or ELP2-05+ is started by this approved repair package.

Đối chiếu tại `c1d6b2dc53f1f80ac44cdfd9d96d159c4e9aae64`,
2026-10-16T02:51Z. Mục này cập nhật điểm bắt đầu thực
tế, thắng các dòng planning/pending lịch sử ở trên; không xóa receipt cũ,
không mở thêm phase, frontend hay runtime authority. Lượt rà kế hoạch này chỉ
sửa Markdown; giữ nguyên code đang dở, không chạy build/DB/hook/push.

| Phase trong goal | Trạng thái đã đối chiếu | Việc phải hoàn tất / gate để chuyển bước |
| --- | --- | --- |
| **01 — contracts** | Landed `700aa6a4`; contract/generation checkpoint PASS, external review còn OPEN | Reuse schema/FX receipts nếu dependency không đổi; không regenerate/build lại chỉ để khởi động goal. Nếu03 cần thêm schema thì additive versioned contract và impacted tests ở03 |
| **02 — identity** | Landed `b448c0be`; identity18/18, retained8/8, normal hook/PG restore PASS | Reuse preservation/current-session proof; không làm lại login/lifecycle. Verified TS mapping chưa qualified vẫn typed pending, không coi checkpoint này là TS acceptance |
| **03 — policy/delegation** | Landed `c1d6b2dc`; normal hook89719 exit0, contracts425/API2,758 PASS,3 API tests skipped; four-store row-digest restore PASS. Final affected suites70+63+42+18 are included in the API total, not extra coverage | Reuse local current-session/evaluator/revoke proof for04. Actual TS acceptance/approved preset and field policies remain gated; TEST_ONLY fixtures are not production authority. Failed packaging attempt86478 is retained in the packet |
| **04 — read enforcement** | UNCOMMITTED. Cell D build PASS;277 PASS/2 FAIL across279 cases: scope95, projection106, local alignment5 and profile compatibility50 PASS; History21/23. Restore/tracking NOT_RUN. Generated History artifacts exist but their new68-case contract suite is NOT_RUN; later History-only regex tightening is outside D's copied snapshot.112 patterns/54 aliases remain uncertified. [Exact receipt](./execution_loop/evidence/ELP2-04/README.md#elp2-04-history-cell-d) | Diagnose the two History failures without weakening refusal semantics; run the new contract suite and retake changed History dependencies only. Then finish remaining reader families → delivery surfaces → T04-01…12/census → journal/handoff/normal-hook commit. Do not repeat passing profile fanout or01–03 gates without impact. One History reader or foundation PASS cannot close04 |

**03 chia bốn gói nội bộ, không tạo phase mới:** (a) một pure evaluator + finite
capability/ceiling registry; (b) persistence/CAS/idempotent immutable receipts,
current actor/session/ancestor locks và legacy replay/audit repairs; (c) TS
proposal/verified acceptance boundary, pending/rejected/unknown không cấp quyền;
(d) HTTP/generated contract + positive/negative/concurrency proof và closeout.
Primary review lock order, canonical fingerprints và permission-on-replay trước
khi ghép các gói. Không dùng TEST_ONLY verifier hoặc Stan/researcher fixtures
để seed policy/quyền thật. Migration number phải recheck trước khi viết.

**04 chia bốn gói nội bộ:** (a) complete112-route +54-alias + adjacent/new-route
matrix; (b) authorization trước filter/sort/page/count/group/analytics input;
(c) scoped redaction/metadata/cursor/cache/export/audit/existing-stream delivery,
recheck sau await và trước trả bytes; (d) API leakage/in-flight/revoke matrix,
compatibility và closeout. Metadata/time bounds, profile counts và total/rank
cũng thuộc scope; không chỉ hide rows hoặc thêm SessionGuard. Existing closed
export/stream phải có disabled proof, không bật chúng để lấy positive receipt.

Mỗi phase vẫn kết thúc riêng theo §14.9.4 và rules §7.4: **journal + gate matrix
+ commit + handoff + debt/owner + backend-next + Claude-next + request/ack**.
Ba phase01/02/03 đã landed không thành ba phase mới để chạy lại; backend next
là04 theo ordered scope, từ producer pin `c1d6b2dc`.04 chưa COMPLETE; original
external gates của01/03 và whole-runtime/owner
acceptance vẫn riêng. Frontend `NOT_STARTED_BY_OWNER_DIRECTION`, handoff
`AWAITING_CONSUMER_REVIEW`; không giao Claude triển khai lúc này.

**Ngoại lệ không được âm thầm đóng:** exact Stan ceiling/researcher field matrix
(request002), qualified TS identity/acceptance (request003), owner recovery và
new export operating profile vẫn theo canonical00. Local technical checkpoint
cho phép phần backend độc lập đi tiếp, nhưng không tạo quyền production hoặc
chứng minh TS đã chấp nhận. Nếu mục bắt buộc bị chặn thì báo đúng feature/owner/
done-when; không sửa exit gate hoặc chuyển cả batch thành blanket PASS.

Khi dùng prompt §14.9.5, thêm: **“Tiếp tục từ checkpoint đã ghi ở §14.9.8;
không chạy lại01/02/03 đã PASS nếu dependency không đổi. Bắt đầu04 từ producer
pin `c1d6b2dc`, giữ nguyên frontend và shared runtime.”**

**Closeout of the already-running03 landing,2026-10-15T21:49Z:**39 files,
+8,974/−113; normal commit `c1d6b2dc`, no frontend changes. Exact disposable
containers/network1888374 absent after trap; host11,681MiB available and158GiB
disk free (75% used), cleanup NO_ACTION_NEEDED. Contract/API build/restore and
tracking checks are actual local evidence, not deployed or TS/consumer proof.
This journal update is documentation-only and uncommitted until the next
coherent normal-hook delivery; no duplicate full suite is run for it.
Planning validation:5 updated Markdown files,39 local links/anchors resolved,
0 errors; `git diff --check` exit0. No additional build/DB/browser test ran
for the journal update; no new application code or runtime change was made.

<a id="elp2-four-phase-execution-order"></a>

### 14.9.9 Reviewed execution order and exact resume — backend only

Bobby's latest request is a plan review for four consecutive backend phases,
not a new frontend/runtime assignment. Preserve the existing active goal and
all owned dirty code; this review itself adds only documentation. Current
checkpoint overrides historical NOT_STARTED/preparation wording above.

**Keep the four original phases, do not invent four replacements:**
01 contracts →02 identity →03 policy/delegation →04 complete read enforcement.
01–03 are landed local technical checkpoints, not full runtime/TS acceptance.
Continue from04; only reopen earlier code when an actual04 dependency changes,
with its impacted regression. No repeat of unchanged full suites or restore
drills just to make the batch look sequential again.

| Execution step within04 (not new phase/package IDs) | Deliverable / exit before the dependent step |
| --- | --- |
| 1 — security foundation (packet package04-A) | Close the [canonical draft review](./execution_loop/evidence/ELP2-04/README.md#elp2-04-prelanding-review). Cell C fixed the test fixture and passed93/93 projection cases, build and restore. The later qualified strategy→Alpha mapping changes require impacted retakes; do not repeat the fixed-password task or treat C as proof for changed code. Current pairs, exact purpose, complete-tuple DENYs, qualified binding/strategy lineage, finite fields, sticky mode and authorized-empty behavior remain prerequisites |
| 2 — query integration (packet packages04-B/C/D) | Finish the UNCOMMITTED History integration and versioned generated contract, then test its actual controller/service/repository with current scope. Preserve legacy v1; V2 has UTC-ms public values, private microsecond keysets, end-exclusive ranges and page/count on one scoped snapshot. Continue lists/detail/composition/named adapters before claiming coverage. Correlate tuples before count/sort/page/aggregation; shared-account/portfolio totals need grain-safe visibility, not a filter over global totals. Restrict query and response fields; preserve Research/Planning defaults |
| 3 — complete delivery surfaces (packet packages04-E/F) | Scope summaries, bounds/coverage/provenance and errors; bind cursors/cache to current authority; recheck in-flight/cache followers; keep uncommissioned export/stream disabled with direct proof. Preserve gate-specific Governance authorization |
| 4 — acceptance and landing (whole04 exit) | Complete112 baseline routes/54 aliases plus new/adjacent route dispositions and T04-01…12 receipts. Publish generated contracts/fixtures only where changed, real disposable DB/API proof, resource cleanup, per-phase journal/handoff and coherent normal-hook commit. Original external gates stay explicitly OPEN |

The packet's existing04-A…04-F package names remain canonical; the four rows
above are execution checkpoints, not a conflicting second04-A…04-D naming
scheme. The latest [cell C receipt](./execution_loop/evidence/ELP2-04/README.md#elp2-04-foundation-cell-c)
supersedes the older password-setup blocker for its exact source pins only;
the later helper/History changes remain unverified. This review starts no
retake or additional implementation.

Primary owns shared schema/generated outputs, integration and Unified. Once
implementation resumes, independent query/test/review work may use bounded
agents with disjoint files; no parallel heavy build/DB suites. One isolated
cell, total4CPU/4GiB,8GiB transient,≤2workers; no shared data or public port.

**Planning reconciliation2026-10-16T02:03Z:** HEAD remains `c1d6b2dc`;
01–03 are the three existing commits, not three new assignments. Current04
scope/linkage and projection-helper drafts plus their new test definitions
remain UNCOMMITTED / RETAKE_NOT_RUN. Independent review found a final topology
race, an unenforced whole-population postcondition and missing binding-grain
representation; these extend canonical04 requests001/002/004, not a new phase
or duplicate ledger. All agents have returned/stopped; no new implementation,
test cell, hook or runtime operation is started by this plan review. Preserve
their files and review them at04-A; do not describe cell A's older282/284 result
as certification of the changed snapshot. No need to create a duplicate goal.

**Every phase return remains mandatory:** commit and changed-line stats;
requirement→receipt and actual gate result; backend-next; unresolved debt with
owner/done-when; Claude-ready contracts/consumer tasks; requests and ack;
cleanup/rollback. Write these before the next dependent phase, not once at the
end. Frontend stays NOT_STARTED_BY_OWNER_DIRECTION and its handoff
AWAITING_CONSUMER_REVIEW; Claude's absence does not block independent backend
tests or become a false consumer acceptance.

**Suggested continuation:** “Tiếp tục goal backend ELP2-01→04 từ checkpoint
§14.9.8/§14.9.9. Reuse01–03 đã landed; đóng review và hoàn thiện04 theo guide,
T04-01…12, journal/handoff/normal commit. Không frontend, push, dev/main merge,
shared runtime activation hoặc05+; pending authority/config không tự cấp.”

**Validation:** the earlier23-link result remains historical. This planning
reconciliation checked33 local links/anchors across the batch index and two
entry/phase documents,0errors; `git diff --check` exit0. No application test,
build or runtime operation was run for these three Markdown edits. Documentation
remains UNCOMMITTED for the next coherent normal-hook delivery; no hook bypass,
new push or branch operation.

**Historical bounded reconciliation (before cell C / History changes):** cell B's terminal result and cleanup were
linked above; its six frozen source/test hashes still match the working tree.
Documentation validation:35 local links/anchors checked,0errors;
`git diff --check` exit0. No application suite/build/DB retake was run for this
review. The previously assigned History HTTP-test agent was stopped after its
new draft file appeared; it is UNCOMMITTED/NOT_RUN and not independently
reviewed as complete. Dependency injection and reader wiring are not yet
implemented, so it grants no route proof. All source drafts remain preserved
for the next approved implementation continuation.

**Current planning return2026-10-16T02:35Z:** retain the four original phases
and the existing goal; do not create four replacement phases or restart01–03.
The current table/checkpoints above now include cell C and the later untested
History/strategy-lineage drafts. Next implementation is the affected04
contract/reader/test package, not another password retake. This return changes
only Markdown; all21 dirty non-Markdown files are preserved. No application
test/build/hook, new agent, push, merge or runtime change is started here.
Journal/handoff and individual gate/commit returns remain mandatory even while
Claude is not assigned. Documentation awaits the next coherent normal-hook
delivery; no hook bypass or fabricated consumer acknowledgement.
Validation for this return:39 local Markdown links/anchors resolved,0errors;
`git diff --check` exit0. The21 dirty non-Markdown files have the same aggregate
SHA256 before/after (`fbdcc8c75807c1b0abec48688ad757aef17345468fabc95e0797529be880ebb4`);
no implementation changes are attributed to this documentation review.

<a id="elp2-batch-next-assignment"></a>

### 14.9.10 Current assignment card — bốn phase backend, chưa giao frontend

**Plan review2026-10-16T02:51Z; supersedes current-status wording above.**
Goal service: no active goal at this observation. This request arranges the
next assignment only. Preserve all local commits/drafts; no new implementation,
test cell, frontend work, push, merge or shared runtime change starts here.
The already-running cell D has ended; its FAIL receipt is reconciled, not rerun.

**Ordered scope stays01 →02 →03 →04.** This is one backend batch with four
separate returns, not four fresh implementations: reuse01–03 at `700aa6a4`,
`b448c0be`, `c1d6b2dc` after dependency-impact review; resume unfinished04.
Do not substitute05–08 to manufacture four unstarted phases. Full TS/Edge,
consumer and runtime acceptance are separate from these local checkpoints.

| Order / checkpoint | Next assignment must do | Before dependent work / closeout |
| --- | --- | --- |
| 01 — contract baseline | Verify delivered schema/FX pins and compatibility against04's changed dependencies; change only a proven gap | Keep existing receipt/commit; any schema delta needs generation, fixture, impacted test and updated handoff, not a full01 restart |
| 02 — identity preservation | Reuse landed issuer/subject, owner/lifecycle/session proof; review only actual04 impact | No user/grant reset or recovery activation; affected identity regression required only if its code/dependency changes |
| 03 — policy/delegation | Reuse landed evaluator/current-session/CAS/revoke proof; preserve actual-vs-TEST_ONLY distinction | Approved ceiling/field matrix and actual TS acceptance remain separately gated; no fixture policy seed or local-only business grant |
| 04 — all read surfaces | First diagnose D's two failures and run pending History contract cases; finish History, Manager lists/compositions/named reads, remaining history readers, then cache/cursor/export/stream/audit boundaries | Scope raw rows before aggregation; every112-route/54-alias/adjacent/new surface gets an explicit disposition and direct-API proof. T04-01…12, normal hook, coherent commit, journal and handoff before04 technical exit |

**04 retake policy:** triage the404 current-authority test to distinguish a
legitimate non-disclosing refusal from a broken cursor harness; diagnose the500
source-cutover case before deciding production versus fixture repair. Do not
accept arbitrary statuses or relax assertions simply to pass. Then run only
affected History/contract/security dependencies; D's unchanged50-case profile
compatibility suite (including its60s fanout) need not repeat. Full hook still
runs when the coherent change is committed; never bypass it. A broad04 exit
cannot be inferred from the History-only retake.

**Per-phase return, including reused phases:** entry/producer SHA and dependency
hashes; requirement→code/type→receipt and actual verdict; owned diff/line stats;
contract/schema/migration impact; normal-hook commit or explicit uncommitted
state; cleanup/rollback; debt owner/done-when; backend-next; Claude-ready tasks;
new/delivered requests and acknowledgement. Reuse existing packets instead of
creating duplicate journals. Update Unified in the same delivery, not only at
the end. Mandatory external gates remain OPEN, not silently deferred.

**Frontend hold:** no Claude/UXM assignment or frontend edits in this batch.
Each backend phase still publishes its pinned operation/type/fixture/field,
absence/permission/pagination mapping and consumer acceptance instructions.
Frontend `NOT_STARTED_BY_OWNER_DIRECTION`; handoff `AWAITING_CONSUMER_REVIEW`.
Write what Claude can do after Bobby assigns it, not “Claude has accepted”.

**Budget/authority unchanged:** one private PG, total4CPU/4GiB,8GiB transient,
≤2workers and one heavy lane; independent audit/tests may delegate with disjoint
files. Primary owns schema/generated/migrations/Unified/integration. No shared
preview/dev/stable/HK writes, source/SSE/TLS activation or new policy grants.
No05+, push, dev/main merge, signing or release. External blockers gate only
their dependent feature; report them honestly while continuing approved
independent backend work.

**Prompt for Bobby's next assignment:**

> Bật goal tiếp tục batch backend ELP2-01→02→03→04 theo Unified §14.9.10.
> Reuse01–03 đã landed nếu dependency không đổi; tiếp tục04 từ checkpoint cell D,
> sửa hai History failures, hoàn thiện toàn bộ read surfaces và gates theo guide.
> Duyệt local backend/contracts, isolated tests và budget §14.9.2; không frontend,
> shared runtime/HK writes hoặc quyền/config còn pending. Journal, test receipts,
> handoff, debt/next-step và normal-hook commit riêng từng phase/coherent slice.
> Không hỏi lại các bước đúng scope; không gọi full completion khi mandatory
> gates còn mở. Không push, merge dev/main, release/deploy hoặc tự mở05+.

This card is a proposed assignment, not a goal activation or implementation
receipt. The current review changes Markdown only; finished cell D remains
277 PASS/2 FAIL, not green. Documentation commit awaits a normal-hook delivery;
do not run a full application gate solely for this plan clarification.

Planning validation:38 local Markdown links/anchors resolved,0 errors;
`git diff --check` PASS. All29 dirty non-Markdown paths retain their pre-review
aggregate SHA256 `3e8eefc119c878604c4a976b6c4b3ac536f6f405f7bd23beefae426467a6b580`.
This return edits only Unified, campaign entry and04 result packet; it does not
attribute the earlier source/test work or cell D run to this planning request.
No new application tests/build/DB/hook ran. Documentation remains UNCOMMITTED;
normal-hook landing is pending, not bypassed. Backend next is04 after Bobby's
assignment; Claude next remains a pinned handoff for later owner assignment.

### 14.9.11 Approved closeout return — current implementation, 2026-10-16

Bobby subsequently approved closing existing01–04 gaps, not a new goal or05+.
This supersedes the planning-only current-status text in14.9.10; historical
failures and receipts above stay intact. Source is still
`docs/research-loop-plan`, with no frontend/runtime/remote changes.

- History's two failures have a real isolated HTTP/PostgreSQL passing retake;
  scoped Fleet/Portfolio/Binding, named/resource/analytics and delivery fences
  are implemented. Manager/analytics35/35 and scoped-policy restore PASS.
- Full normal-hook attempt1: contracts574/574 PASS; API build PASS;
  API3,281 PASS/3 FAIL/3 existing SKIP. Failed commit did not land. The three
  compatibility regressions concern Core/source workspace routing and legacy
  dark-profile reads; fixes and final terminal gate belong in the
  [closeout receipt](./execution_loop/evidence/ELP2-04/closeout-2026-10-16.md).
  Do not interpret a working-tree fix as a passing retake.
- Subsequent L build and all six affected integration suites PASS86/86;
  L's new synthetic context fixture separately failed10 setup checks and was
  corrected without changing production guards. Pure context+adapter retake
  PASS25/25; adapter15 overlap L. Source is stable for the final normal hook;
  logs/hashes and non-additive coverage are recorded in the same receipt.
- [112-pattern/54-alias census](./execution_loop/evidence/ELP2-04/route-census-closeout.md)
  distinguishes implementation, typed refusal, source qualification and actual
  test coverage. It is not112 positive runtime receipts. Parent/technical
  publication008/009 and consumer010 remain separately owned and gated.
- [Claude handoff](./execution_loop/evidence/ELP2-04/contract-handoff.md) contains
  generated types, fixtures, state/cursor/permission mappings and acceptance.
  Claude remains NOT_STARTED_BY_OWNER_DIRECTION; no acknowledgement invented.
- Backend stays on this approved repair package until normal-hook landing;
  ELP2-05 catalogue/publication is the proposed next dependency step, only
  after Bobby assigns it. No source/SSE/Live/policy activation, push, dev/main
  merge or release accompanies this closeout.

<a id="elp2-05-current-return"></a>

### 14.10 ELP2-05 — explicitly assigned catalogue/publication return, 2026-10-16

Bobby assigned05 separately after04 landed at `2ec5924d`. Current technical
delivery: [gate/receipt/debt matrix](./execution_loop/evidence/ELP2-05/README.md),
[source pins](./execution_loop/evidence/ELP2-05/source-alignment.md),
[coverage + Claude handoff](./execution_loop/evidence/ELP2-05/coverage-and-handoff.md).
This supersedes older05 NOT_STARTED text, not historical evidence/failed attempts.

- Pinned Edge EPG10-02 source contracts at `e77a8ed0`:42 logical families/31 fields,
  all new exports explicitly unqualified. Existing54 named current-page adapters
  stay separate. The existing operations GET gains additive safe generated
  catalogue metadata, not a generic proxy or permission to query new families.
- Strict qualified provider input composes current identity/policy, purpose and
  exact dataset/profile/window/revision; no fallback/cache. TEST_ONLY continuity
  tests bind W/W+1, epoch/generation/partition/snapshot; production new exports
  remain closed. No claim source ordering/durable ACK from parser tests.
- Fixed request-limit enforcement and continuation pre-persistence byte bound;
  strict RFC3339 accepts real Manager microseconds while exposing only UTC-ms.
  Canonical private timestamp identity now preserves sub-ms source grain across
  current/retained named aliases; exact-ms IDs unchanged, no replay claim.
  Focused API131/131 plus one added manifest-schema check and contract7/7 PASS
  (publication rerun25/25 overlaps24 prior cases). Normal-hook commit is the technical
  landing gate; terminal log/cleanup is referenced by the packet.
- Full05 real-source exit **NOT_MET**: source-connected selected publication,
  trust/coverage/history receipts are absent; EPG10-03 source generation fence
  has a documented counterexample. New request05-001 owns that exact source gap;
  inherited00-003 retains custody/trust ownership. Do not fabricate activation.
- Backend next:06 design/fixtures or independently qualified scoped readers,
  **only after separate assignment**. Actual new-family projection depends on
  selected-source proof, not every unrelated endpoint in TS/Edge.
- Claude next:05-002 generated catalogue consumer review; read handoff and04
  cursor/permission semantics, no direct upstream/new UI authority. Frontend
  NOT_STARTED_BY_OWNER_DIRECTION; AWAITING_CONSUMER_REVIEW. No acknowledgement
  or product acceptance invented. No goal/runtime/remote/frontend change,
  push, dev/main merge, release or06 work accompanies this delivery.

<a id="elp2-06-current-return"></a>

### 14.11 ELP2-06 — Manager models, economic partitions and score reference, 2026-10-16

Bobby assigned06 separately; source parent `c4109ef350a58c1ae3840d9c3f4c2110b312a079`,
same integration branch. [Requirement→implementation→test matrix](./execution_loop/evidence/ELP2-06/README.md)
and [consumer handoff](./execution_loop/evidence/ELP2-06/coverage-and-handoff.md)
are authoritative current return. Earlier NOT_STARTED/planning entries are historical.

- Six named scoped Fund/Fleet/Portfolio/Alpha/Account/Deployment reads publish
  generated ManagerDataset/Query/Metric/Row. Correlated tuple/field authorization
  precedes joins/counts/global exact-decimal sort/filter/groups/keyset. Full
  Fund authority, explicit full/restricted Portfolio distinction, final grant
  and head fences. No generic proxy or browser source selector.
- Partitioned typed statement fields keep capital/budget/cost/exposure separate.
  Source-ID and ownership dedupe differ; custody excluded, internal pairs require
  matching economic cut/proof. Missing member/metric census yields null, not a
  falsely complete total. All cross-profile money is still rejected; current
  ALL navigation is reused separately, not a new global financial projection.
- Additive migration135 / separately pinned isolated-store forward ledger;
  two bounded rebuildable projection tables, no identity/financial ledger.
  Existing projection/journal transaction couples optional qualified Manager
  revision/head; corrections append, A→B→A rejected, generation rebuild CAS and
  cap stop rather than delete history. No shared DB migration/runtime writer.
- Pure off-request Score P1 F(P/R/B), own path vs composition, full denominator,
  continuity/cost/stress tested with explicit TEST_ONLY config. Approved runtime
  anchors/source/calibration absent: numeric API remains policy_pending;
  fixture values are not production policy. Automatic qualified-source precompute
  adapter/recompute and real source tie-out remain open06-002, not silently done.
- Focused isolated attempt142 PASS/2 assertion failures retained;13 transaction
  and27 existing-reader tests PASS. Corrected current-grant assertion, census
  fixtures; final local reducer48/48, score54/54, service12/12; contract9/9 and
  FEledger22/22 PASS. Shared registry caught a missing schema `$id`; generator
  fixed, affected3-suite retake152/152 PASS (includes10 Manager contract cases).
  Additional transfer/parent-transaction tests run in the
  final normal hook. Full terminal counts/log are in the packet, no duplicate
  case summation or source/runtime acceptance from unit/PG fixtures.
- Read-only HK pins refreshed: committed Edge05/active dirty06 do not qualify
  new42families or current trust/source publisher fence. Canonical00-002…005,
  04-008…010 and05-001/002 remain in their original packets. No source, SSE,
  TLS/credential, upstream command, goal, push, merge dev/main or deploy.
- Frontend NOT_STARTED_BY_OWNER_DIRECTION; request06-001/handoff remains
  AWAITING_CONSUMER_REVIEW. Claude can begin UXM-08 fixture/design only when
  Bobby assigns it; exact types/routes/null/permission/paging/browser gates
  supplied. Backend07 can be proposed next, **not auto-started**; dependent06
  source/config/recompute/ALL work resumes only on compatible qualified inputs.

Normal-hook commit is the landing gate for this coherent slice. Full ELP2-06
exit remains **NOT_MET_SOURCE_CONFIG_CONSUMER**, not product available or
owner accepted. Cleanup/rollback and resource measurements stay in the packet.

<a id="elp2-10-existing-identity-mapping"></a>

### 14.12.1 Edge original08 — source-backed existing-identity mapping client

Bobby explicitly approves PM/Research producer implementation before actual
Edge08 binding; no connected09 or new phase. Source-only additive slice at
Research9a3a27c8, integration docs/research-loop-plan. Preserve all staged
current-human installation/provisioning WIP and its shared index. Main Edge
journal23.20.4 and PM58.99.1 own cross-project source pins and integration.
Guides: Execution V2 rules1–3/7–8, ELP2-10 identity/current authority, PM5.1.1/
5.2.1, Edge08/BE3/4/REVIEW3. Status IN_PROGRESS_IMPLEMENTATION.

Target owned new source/tests: concrete pinned-mTLS existing-identity mapping
client plus AccessTrust composition. Reuse existing fixed private PM recovery
listener and Research TLS safety; no new service/directory/grant engine, browser
route, DB credential or direct TS DB access. Request exact independently accepted
human issuer/Portal subject/workspace/environment/workload with nonce. PM SELECTs
only existing exact ts_users pair and returns actual UUID/version or null for
unknown/inactive. Target subject lookup does not impersonate that person's
session. Never map accepted identities using candidate .invalid PKI/issuer,
display names, static guessed UUIDs or historical receipt alone. Fresh online
mapping is preflight only: final writes retain existing held source fences
through COMMIT. No mapping cache, permission fallback or extra JWT signer.
Preserve every other AccessTrust callback and production fail-closed defaults.

Resources/validation/risk/rollback: source preparation now; no jobs under
foreign SGP correctness lease through04:39:33UTC. Focused tests when released
under an exclusive own lease, <=2CPU/1536MiB/300s, no production DB/listener,
service restart/deploy/credential rotation. Test actual TLS1.3 mutual trust,
leaf mismatch before write, exact scope/correlation/revision/null, malformed/
oversize/timeout and unchanged recovery transport. Revert only additive
unmounted composition; preserve peer staged changes and native/accepted facts.
Source-tested is not actual08 acceptance. Real current grants/trust installation
and Edge revoke/cache/cursor/SSE remain required before connected09. Primary
owns journal/contracts/resource scheduling; disjoint implementation delegated.

Peer source-only review accepts wire/TLS/mapping but identifies missing finite
aggregate inflight admission and explicit installation expiry, including post-I/O
expiry check. Fix these owned producer defects before mounting; no external-debt
label or new business grant. Required private max_inflight and accepted absolute
installation_expires_at_utc_ms, no default TTL/queue. Test denial before I/O,
concurrent overload, expiry after I/O and slot release/recovery on every exit.
First focused source freeze e22cfaf/4564126 ran full typecheck in the isolated
2CPU/1536MiB cell; explicit1024MiB Node heap exhausted at212s (SIGABRT), zero
product tests. Receipt70abb825eef0d3b63e1bca3a1fe9768165c053936df4ed0c443da008d866b2ca
retained, exact test container/lease cleaned and8runtime tuples unchanged.
Run corrected client Vitest focus within the same finite envelope; full build/
typecheck remains mandatory in the normal hook's approved4CPU/4GiB cell. Never
report this diagnostic as PASS or expand the focused resource ceiling silently.
PM existing-only producer now committedf9b5b32c with61source/PG/regressionPASS;
actual grants/issuer alignment and Edge08 remain uncommissioned. Preserve peer
commissioning/plan WIP and use only one mapping implementation/normal-hook batch.

Corrected focused source qualification:103/103PASS,0FAIL/SKIP =86mapping plus
17existing current-human transport regressions. Actual loopback TLS1.3 mutual
CA/hostname/leaf checks, exact512UTF8/UUID/BIGINT/correlation/null, busy before
metadata with noqueue, pre/post-I/O expiry and terminal slot recovery all pass.
Sourcea9e0355c1c2840c5368215b8b1e188ba10cbe87646bba73bd3083d9c99b5ac00;
test00f55371de603b0687697931741868751bb4a407ba070359118519e6a82075e2.
Controller9b7876080ba5ac497c56d64eaad7eaf182031cf1660877931847647e52e24b57;
JUnitcc44f490c6dbaab99bcb4c2f9462c1b82f039ce6c034096c10e69b80030d2013.
Existing readonly deps correctness only, not clean locked-install evidence;
full build/typecheck/locked dependencies remain normal-hook landing gates.
Own container/lease removed,8protected runtime tuples and source/dependencies
unchanged. Source-copy cleanup and exact terminal hook/commit are recorded by
Edge23.20.4 and its bounded producer qualification receipt, not predeclared here.
PM current source/importer74474c96 now292functional/25offline separately; consume
that source receipt without adding it to our103 or treating it as installed grants.
Status SOURCE_FOCUS_TESTED_NORMAL_HOOK_LANDING_GATE, actual08NOT_MET. Private
composition remains unmounted; stable issuer/trust/current-grant alignment is
not solved by candidate PKI. Backend next is exact accepted-source commissioning,
then Edge08 revoke/cache/cursor/SSE; no09, runtime/secret/grant/financial mutation.
Frontend remains NOT_STARTED_BY_OWNER_DIRECTION; no new public schema/field or
UI request. Handoff is source-only, AWAITING_CONSUMER_REVIEW, not owner acceptance.

<a id="elp2-backend-gap-batch-02-11"></a>

### 14.13 Approved remaining backend batch02–11 — 2026-10-17

Bobby's active goal explicitly assigns the remaining02–11 backend scope;
the latest request reiterates backend continuation while Claude has not started.
This supersedes earlier next-phase-not-assigned notes for this named batch,
not their failed/missing gates. Entry `8ba33de3cf2cb91a4d58bf7421c6b7b4fc5ce462`,
same `/home/bobby/portal-research`, `docs/research-loop-plan`. Preserve the four
existing recovery/docs WIP paths; no frontend, push, dev/main merge, release,
deploy, real capital command or Live activation. Full scope and remaining
requirements stay in the [canonical gap census](execution_loop/evidence/ELP2-10/commissioning-followthrough.md#elp210-backend-gap-census-20261017),
not a second request ledger.

Ordered integration:02 current scoped OwnProfile mapping;03 independent grant/
resource/environment acceptance;04 positive scoped readers/cache proof;05–06
qualified source plus Composition/Regime materialization;07–08 exact command/
workflow adapters;09 concrete notice source/coordinator;10 actual commissioning,
approved config/budgets and compatible coexistence/G2;11 integrated migration/
recovery/operator handoff after mandatory dependencies. Incomplete actual source,
calibration and browser acceptance remain explicit; typed absence is not their
completion. No upstream capability is enabled by finishing local code.

First coherent batch task map (one writer per file):

| Task / owner | Owned output | Boundary / acceptance |
| --- | --- | --- |
|ID02 / primary|OwnProfile controller/contract, application DI, profile generator/types/fixtures/tests; recovery hardening; shared packets/Unified|Fresh mapping only in a currently authorized workspace, recheck actor/session/membership after I/O; no TS→researcher inference, no role/name fallback. Preserve PATCH receipt on mapping absence; publish generated compatible states|
|ID03 / independent reviewer|Read-only exact per-grant/resource/environment compatibility design against `access-policy`, service/root/delegated fences and current PM source|Return concrete change/test plan before write; no invented source revisions or latest-receipt shortcut. Primary freezes integration shape|
|RG06 / independent writer|New internal `manager-regime.ts` and disjoint `elp206-manager-regime.spec.ts` only|Score FINAL§9/R01–R25 eligibility, robust distance/kernel/descriptive math and bounded policy/input validation. Receive frozen vectors/scaler/support config, never choose feature definitions/calibration or expose fixture-derived runtime authority. No shared schema/generator/app/worker edits|
|SRC10 / independent source audit|Read-only current PM/Edge pins, WIP hashes, producer receipts and actual live measurement handles|No remote writes/jobs/DB/business rows, credential/config/service changes; report exact missing wire/installation inputs without overwriting current owner work|

Primary integrates/reviews all changes, owns shared contracts/generation and
schedules at most one heavy lane (Core≤4CPU/4GiB/8GiB transient). Agents do not
run builds/tests/DB/Docker, commit or edit shared tracking. Recovery22 fault
cases and17 real mTLS regressions are pending, not PASS. Run impacted tests
and one normal-hook gate for the coherent batch; preserve prior valid receipts
without rerunning unchanged scopes. Source candidate resource/window and
original matched coexistence/G2 requirements remain separate. Rollback removes
only additive unmounted wiring; keep identities, grants, accepted/UNKNOWN leases,
revocations, audit and immutable projection history. Claude remains
NOT_STARTED_BY_OWNER_DIRECTION / AWAITING_CONSUMER_REVIEW.

ID02 focused gate completed13:07Asia/Saigon:19 mapping +18identity +22recovery
fault +17actualmTLS =76 relevantPASS; APIbuild/PGrestore PASS.51 initial Regime
cases in that cell are not acceptance: source review found prospective-time,
distance-cancellation and archive-history defects; writer is correcting them.
See[exact profile receipt/handoff](execution_loop/evidence/ELP2-02/current-mapping.md#focused-gate--2026-10-17-1307asiasaigon).
One coherent identity/recovery normal-hook landing is next. No source provider,
grant, calibration or frontend/runtime has been installed or activated.

Normal-hook batch includes the corrected[private Regime foundation](execution_loop/evidence/ELP2-06/regime-calculator.md)
as well as ID02/recovery: freeze source/tests/generated snapshot once, one full
gate/commit, no second hook for that independent calculator alone. It does not
close06-002/00-005 or publish a worker/API/approved runtime policy. Prospective
knowledge, pre-archive history and decimal-distance regression fixes require
terminal PASS; historical51 cases are not current qualification.

Corrected Regime local pure retake72/72PASS,0FAIL/SKIP (0.563s); source
review ACCEPT_SOURCE_ONLY. Contract snapshot regenerated from the narrow
profile generator, no unrelated published schema changed. All owned code,
tests and packets now freeze for the single normal-hook landing; exact result,
commit and cleanup are recorded by `profile-recovery-land-*` under the private
20261017 commissioning receipt root. This is component delivery only, not
02/06/10 full product/source/calibration acceptance.

#### 14.13.1 Identity/recovery/Regime landing and next04 readers

`be97b20ef994909b8f660712f1906a885f54495a`:23files,+2197/−87.
Normal hook PASS:692contracts,4576API+3existing skips, APIbuild, scoped PGrestore.
Exact terminal `profile-recovery-land-061404/controller.json` under private
`/home/bobby/.local/state/portal-execution-elp210/20261017/`; log
sha256`bde29a3f6832c07b40ee8427885d6475f0a971246be6f589de0bf9380597f3e2`.
Source unchanged through gate;8protected runtime tuples unchanged; owned
containers/network removed. No push/runtime/source/frontend change. This closes
local foundations only, not genuine provider/config/complete06 or product exit.

Next approved04 partial reader slice is documented in
[positive-readers](execution_loop/evidence/ELP2-04/positive-readers.md): strict
ecm_ operation parent reuses exact financial audit status; additive runtime V2
preserves Core vs configured storage authority and old V1. Existing04-008/009
remain open for all other parents/null aliases/source pins. Focused receipt now
passes128/128 tests/build/restore, including four actual PG physical-coalescer
current-authority cases under T04-11. Its independent-session mixed outcome is
not cross-actor/source qualification. Final test-harness deadline/listener and
static route/pin maintenance are covered by the single normal-hook landing;
packet-containing commit can land only on exit0. Exact source/runtime/cleanup
receipt is linked in that packet. Claude NOT_STARTED_BY_OWNER_DIRECTION / AWAITING_CONSUMER_REVIEW;
backend continues independently within the assigned02–11 scope.

Reader batch terminal: `68923d2912b2fa58db2789e10f559a17cf600817`,38files,
+2058/−50; normal hook698contracts/4616API PASS+3existing skips, build/PGrestore
PASS. [Exact log/controller/cleanup](execution_loop/evidence/ELP2-04/positive-readers.md#terminal-normal-hook-receipt--2026-10-17).
Runtime unchanged;04 full source/parents/consumer exit remains open.

Current06 work is the [Composition publication chain](execution_loop/evidence/ELP2-06/composition-publication.md):
separate byte-pinned full-accounting input/result, bounded existing worker and
immutable storage, Fund/Portfolio precomputed API with current-grant/final-await
fences; no request-side aggregate or researcher subset denominator. Applied code
and tests are WORKING_TREE_PENDING_GATE, not a runtime PASS. Independent source
review ACCEPT; focused integration/normal-hook pending. Regime public chain,
genuine source/config, policy-only recompute and full06-002 remain open; FE is
NOT_STARTED_BY_OWNER_DIRECTION / AWAITING_CONSUMER_REVIEW.

Backend next06 follow-through is **Composition input→bounded off-request
materializer→immutable publication→current-fenced API**, then Regime loader/
materialization. Independent review confirms this is actual missing code, not
calibration alone: existing publication/runtime slots accept only RAW/DIRECT_NAV
and Manager summary fixes Composition/Regime to absence. Reuse existing full-
denominator calculator; separate allocation/publication DTO, never PRB quality
or source JSON `verified:true` as authority. Regime still needs independently
pinned causal/reference/archive/binding inputs. Genuine source/config/issuer/
budget/G2 and frontend acceptance stay open in the canonical census; no release,
dev/main merge, source command, frontend assignment or runtime activation.

Composition focused gate now301/301PASS/build/PGrestore (23new cases included,
not added twice); exact[receipt and consumer mapping](execution_loop/evidence/ELP2-06/composition-publication.md#focused-gate-terminal--2026-10-17-1432asiasaigon).
Source bytes/runtime stable and own cells/network cleaned. One normal-hook
commit is pending; Regime chain remains implementation work, not config-only.

