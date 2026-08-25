# Unified Implementation Plan — QuantBT Portal v0.4

> **Trạng thái:** Draft để owner review và chốt thứ tự triển khai<br>
> **Cập nhật:** 2026-08-15<br>
> **Nguồn kiến trúc:** [QuantBT Portal Architecture & UI/UX Final v0.4](./quantbt_portal_architecture_uiux_final_v0.4_vi.md)<br>
> **Phạm vi:** mother Portal, QuantBT Research, Planning, identity, control plane, quant compute, data/artifact, Alpha Platform, Paper/Sandbox/Live và operations<br>
> **Engine baseline:** `quantbt-engine[optimization]==1.0.8` từ PyPI<br>
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
- `quantbt-engine[optimization]==1.0.8` exact pin từ PyPI.
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
  vẫn giữ nguyên. Evidence: TypeScript build, fresh PostgreSQL restore và
  Control API 173/173; durable event authority vẫn thuộc U11.

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
