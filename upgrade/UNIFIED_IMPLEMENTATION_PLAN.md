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
| [P06](#rl-p06) | P03–P05 | nền/03 | 03 | TECHNICALLY_COMPLETE / Codex backend / [P06 evidence](./research_loop/evidence/P06/README.md): PostgreSQL logical-work/lease/outbox authority, real namespace-isolated QuantBT Delta child and retry/cancel/recovery proof are closed; no browser, named producer, NATS deployment or direct-submit cutover was introduced; FE_SCHEDULER_HARNESS_COMPLETE / Claude — scheduler harness +349 lines, full suite 2488 pass. `FE_COMPOSITION_RECOVERY_READY_FOR_CLAUDE`: attempt/queue panels may start now; producer/SSE/action activation remains P10/P11; FE_QUEUE_PANEL_COMPLETE / Claude — [composition](./research_loop/evidence/P06/frontend-composition-claude.md); **FE_COMPOSITION_RECOVERY_COMPLETE** / Claude — R1 closeout: no lease epoch/worker identity/work digest on the browser surface, boundary sweep + DOM probe |
| [P07](#rl-p07) | P03,P04,P06 | 14 | 04 | BACKEND_AND_CONTRACT_COMPLETE / Codex / [P07 evidence](./research_loop/evidence/P07/phase-report.md); private AST analysis, bounded source custody, seven ordered gates, immutable registry binding and ADMIN activation CAS are proven on a fresh disposable PostgreSQL cell. The five public same-origin operations and generated typed client are published. `may_activate` is required, caller-specific server admission and is evaluated by the exact same predicate as activation; **CG-P07-01 resolved**. All five Control API routes are registered with truthful P07/P09 ownership in the R2 capability inventory; **FD-P07-02 resolved**. · FE_SCREEN14_COMPOSITION_COMPLETE / Claude — Screen 14 is built against `@portal/contracts-research-alpha-import` with zero hand-written types or error strings; tsc 0, research suite 158/158, full frontend suite 158 files/0 failures, build 0 and browser probe 6/6 with 0 console output and 0 px overflow at 1280 and 660. `/research/quantbt/imports` is untouched; `ResearchAlphaAnalysis` is never imported, rendered or requested. No product route is mounted — P09 owns that — so the only render today is the labelled fixture lane. Screen 14 T07 (prefill Screen 02 from `av_`) is **NOT_RUN_BY_DESIGN**, explicitly owned by P10 New Run; it is neither a P07 pass nor a hidden failure. [Claude S14 composition](./research_loop/evidence/P07/frontend-composition-claude.md) |
| [P08](#rl-p08) | P03–P05 | 02/05 nền | 04 | BACKEND_AND_TYPED_CONTRACT_COMPLETE / Codex backend / [P08 packet](./research_loop/evidence/P08/README.md); bounded HMD private reader, shared immutable snapshot, requested→effective/fold/resource manifest, token expiry/freshness assertion and exact two-route same-origin OpenAPI are proven. No raw candle/holdout/worker path exists; generic Data Catalog routes cannot replay an opaque P08 snapshot ID. P10 owns server-side worker binding; rolling remains truthfully `RESEARCH_PREFLIGHT_TOPOLOGY_UNSUPPORTED` until a versioned manifest-owned train-width contract is approved, never inferred. · FE_PREFLIGHT_CONSUMER_COMPLETE / Claude — typed Screen 02/05 consumer from `@portal/contracts-research-preflight`, no hand-mapped field and no local payload parse: client +251, container +157, Screen 02 panel +471, Screen 05 boundary +282, tests +713, fixture lane +213, browser probe +100, boundary sweep +17/−1. `P08-T01…T12` all pass; tsc 0, research suite 198/198, build 0, browser probe 8/8 with 0 console output and 0 px overflow at 1280 and 660. `requested_spec_digest` is never sent (asserted on the POST body) and no digest is computed on the surface; any change to the requested spec drops the held token; EXPIRED/STALE/NOT_FOUND clear it rather than resending. Scope taken deliberately narrow: the eight-step declaration surface is P10's (the generated schema says the requested spec is producer-side, not a live endpoint), and Screen 05 renders the structural boundary only — purge, embargo, inner folds, θ* and the gap scan stay P14's and are named as absent rather than invented. **FD-P08-01 resolved:** both controller routes are declared in the R2 ledger and the full frontend suite is now exit 0. **CG-P08-01 resolved in P08 scope:** generated `may_create_run=false` is the explicit server fact until P10 publishes and rechecks its exact create predicate. The [browser/HIFI audit](./research_loop/evidence/P08/frontend-hifi-browser-audit.md) records a valid component-fixture receipt, not a product-route claim; P09/P10/P14 retain their route/screen ownership. [Claude P08 composition](./research_loop/evidence/P08/frontend-composition-claude.md) |
| [P09](#rl-p09) | P02,P04 | 00/12 | 05 | PLANNED / unassigned / — |
| [P10](#rl-p10) | P06–P09 | 02 | 05 | PLANNED / unassigned / — |
| [P11](#rl-p11) | P06,P09,P10 | 03 | 06 | PLANNED / unassigned / — |
| [P12](#rl-p12) | P05,P09–P11 | 01 | 06 | PLANNED / unassigned / — |
| [P13](#rl-p13) | P05,P09–P11 | 04 | 07 | PLANNED / unassigned / — |
| [P14](#rl-p14) | P08,P10,P13 | 05 | 07 | PLANNED / unassigned / — |
| [P15](#rl-p15) | P04,P05,P13,P14 | 06 | 08 | PLANNED / unassigned / — |
| [P16](#rl-p16) | P13–P15 | 07 | 08 | PLANNED / unassigned / — |
| [P17](#rl-p17) | P05,P11,P13,P16 | 08 | 09 | PLANNED / unassigned / — |
| [P18](#rl-p18) | P13–P17 | 09 | 09 | PLANNED / unassigned / — |
| [P19](#rl-p19) | P07,P10,P12,P15 | 10 | 10 | PLANNED / unassigned / — |
| [P20](#rl-p20) | P13,P15,P18,P19 | 13 | 10 | PLANNED / unassigned / — |
| [P21](#rl-p21) | P07,P16–P19 | 11 composer | 11 | PLANNED / unassigned / — |
| [P22](#rl-p22) | P02,P10,P21 | 11 handoff | 11 | PLANNED / unassigned / — |
| [P23](#rl-p23) | P11–P22 | mọi màn | 12 | PLANNED / unassigned / — |
| [P24](#rl-p24) | P23 | mọi màn | 12 | PLANNED / unassigned / — |

**Status vocabulary:** `PLANNED → IN_PROGRESS → TECHNICALLY_COMPLETE → DEV_REVIEW_READY`
(khi có UI) `→ AWAITING_BOBBY_REVIEW → OWNER_ACCEPTED`; `BLOCKED` ghi exact failed/missing gate.
Bobby quyết scope tiếp; một owner approval đã có không xin lại dưới tên khác.
Phần Bobby làm trước được gắn vào chính row phase, không tạo “phase Bobby” song song.

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

<a id="rl-p13"></a>
### P13 — Evidence Flow Hub và metric projections

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

<a id="rl-p14"></a>
### P14 — Split, chronology và holdout truth

**Đọc chi tiết:** [Guide P14](./research_loop/RESEARCH_LOOP_GUIDE_V1_1_24_PHASES_vi.md#phase-p14); [spec S05](./research_loop/release-v1.1/docs/screens/05_s1_split.md) + [HTML 05](<./research_loop/release-v1.1/QuantBT 05 S1 Split.dc.html>).
**Entry:** dependencies/assignment tại [board](#rl-board) đã đạt; [G0–G7](#rl-test-gates) áp dụng.
**Test IDs bắt buộc:** `P14-T01…T13`, `V11-P14-DR/BR/GX` và source tests applicable theo §13.3.

- **Goal:** Thể hiện đúng IS/OOS/holdout và causal claims theo evidence, không dựng approval mới.
- **To-do BE:** Authoritative folds/windows/time roles; warmup/purge/embargo; exposure and seal read model. DR01 xác minh actual unlock actor/API trước nối mutation; không tự create governance.
- **To-do FE/consumer:** Full05 timeline/windowed folds/quality drawer/highlights and valid links; readonly seal metadata works separately; correct source state and never-claim disclosures.
- **Tests BE:** Future perturbation/prefix invariance đúng asserted route; strict selector boundaries; half-open/timezone; snapshot integrity≠evaluated≠viewed; duplicate/race/unauthorized unlock nếu actual supported.
- **Tests FE/browser:** All S05 tests; viewport compression doesn't alter intervals; real-source labels and loading/withheld states; navigating không evaluate raw sealed holdout; no fixture-success unlock.
- **Exit gate:** Chronology/fold evidence and readonly seal integration PASS; unlock/claim acceptance chỉ khi DR01 resolved. Mandatory unresolved action blocks its acceptance, không tự N/A/complete phase.
- **Rollback/handoff:** Disable Research unlock intake if rollback, never re-seal viewed data. Checkpoint07: P13/P14 + scope/numeric/holdout decision record.

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

<a id="rl-p22"></a>
### P22 — Publication và existing approval mirror

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

<a id="rl-p23"></a>
### P23 — Resource, security, recovery và upgrade qualification

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
