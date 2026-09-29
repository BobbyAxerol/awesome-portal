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
| [P23](#rl-p23) | P11–P22 | mọi màn | 12 | **OWNED REAL QUALIFICATION IN_PROGRESS · FULL_QUALIFICATION_PENDING (2026-09-29)** — Codex / [P23 packet](./research_loop/evidence/P23/README.md): P22 real publication closed. On one clean current image, exact W06 mixed HEAVY+four queued/20 principals passed twice at the original 500-ms warm SLO; T08 cold-start mixed and W07 bounded interaction also passed in scope. [W05 storage-only scale](./research_loop/evidence/P23/W05_STORAGE_SCALE_2026-09-29.md) measured 100k trial + 100k evaluation + 1M replay rows with indexed keysets and 823-MB seven-service peak; [V11-P23-DR](./research_loop/evidence/P23/V11_DIRECT_PARITY_2026-09-29.md) proved exact direct-engine/sealed/API parity for three real P04 facts. Earlier W06 failures remain history. T03/T04/T05/T06/T09/T10/T11 have scoped receipts; **T02 scratch, T07/T13 new-engine upgrade, T12 quota/audit, T14 exposure/audit-child, T15 browser-real and full DR/BR/GX remain OPEN**. No full P23/product/deployment acceptance or SLO relaxation. |
| [P24](#rl-p24) | P23 | mọi màn | 12 | PLANNED / unassigned / — |

**P23-T15 scoped addendum 2026-09-29:** [browser-real WFO/P04 receipt](./research_loop/evidence/P23/T15_BROWSER_REAL_SCOPED_2026-09-29.md) qua 1280/660 px trên cell riêng: causal prefix 100→1→2, deep link và chuyển run đúng, zero overflow/page error, jobs 155→155. Không có cold-cache/concurrent-WFO browser window và không rebuild exact HEAD; T15/F3/F5/OL-24/P23 vẫn OPEN.

**F5/S14 scoped addendum 2026-09-29:** [S14 browser-real write receipt](./research_loop/evidence/P23/F5_S14_BROWSER_REAL_WRITE_2026-09-29.md) trên cùng cell riêng: cả 660/1280 px gọi bốn POST thật qua same-origin, parse 16 mirror rows, 7/7 gates PASS, DRAFT→ACTIVE và registry readback, jobs 155→155, overflow/page errors 0. Lượt thử 660 đầu tiên bị gate digest trùng từ chối đúng thiết kế; harness tạo artifact test riêng và giữ receipt lỗi. F5 đầy đủ, F3/OL-24, P23/P24 và exact-HEAD build vẫn OPEN; W06 đã pass 500 ms, không dùng nới 500–600 ms.

**F5/S02 scoped addendum 2026-09-29:** [S02 browser-real write receipt](./research_loop/evidence/P23/F5_S02_BROWSER_REAL_WRITE_2026-09-29.md) trên cell riêng cùng pinned image: 1280/660 px copy declaration P04 thật qua `?from=`, preflight 201, create 202, đúng một job mới/lượt và cả hai run `COMPLETED/READY`; preflight/create giữ nguyên SHA requested spec, lineage `CLONE_OF` đúng, overflow/page errors 0. Diagnostic dirty-source được giữ riêng và không tính acceptance. Positive S02/S14 write subgates có evidence; F5/FG-03 negative matrix, S00–S14 exact-HEAD lane, F3/OL-24, P23/P24 vẫn OPEN.

**F5 refusal addendum 2026-09-29:** [S02/S14 real API negatives](./research_loop/evidence/P23/F5_NEGATIVE_API_MATRIX_2026-09-29.md) trên cùng cell sạch: 10 trường hợp typed 400/401/403/404/409, stale activation không đổi DRAFT/revision, jobs 158→158; preflight quota sẵn có trả 503 ở lượt 9, actor độc lập vẫn 201, không compute. Đây là API subset, chưa phải browser refusal receipt; không có 502 nguồn thật, chưa revoke identity test và chưa đóng F5/FG-03/P23/P24. Cell đã dừng, volumes/evidence giữ lại; không đổi dev/prod.

<a id="rl-open-ledger"></a>
### 13.4.1. Sổ việc còn mở — một nguồn trạng thái duy nhất (Claude, 2026-09-26)

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
| OL-12 | P23 qualification: `CG-P23-01` (stack cô lập + cgroup 5 GB), `-02` (cô lập MinIO/file/export/cache), `-03` (corrupt-part, restore, kiểm hash/pin), `-04` (Research không ảnh hưởng Execution), `-05` (lane regression Python/QuantBT 1.1.1); T01–T15, fault/restore/upgrade/cold-cache | **IN_PROGRESS, 2026-09-27.** Clean application `b2e8b868`: 20 readers/one HEAVY/four queued, six SLOs PASS (Library **490 ms**), 618209280-byte peak, zero implicit jobs. T11 backend/API far-seek on pinned `19a8e813` PASS: 20 readers/140 GET, signed deep Library/replay cursors, real `at`/`before`, jobs 37→37, 24 cgroup samples/429371392-byte peak; T15 browser remains separate. T04 now PASS on the clean pinned cell: bounded PG refusal/recovery without Control API restart, same-intent run resumes after NATS/worker outage, original archived source/auth unchanged and all seven services restored. F4/E10 and OL-02 actual recovery/integrity PASS. T12 utility scoped PASS (81 cells/63 evaluations, eight exports/six verifies) but quota/audit remain. T14 real APPROVED R1→one promotion pick, revoked temporary grant, nonempty null-trial RC pin and fresh-volume restore **139 tables/16 artifacts/127 parts/753 files**, worker-off reads PASS; exposure and audit-child cases absent, so T14 PARTIAL. T02 scratch growth, T05 cache/ETag and other T gates remain OPEN. | Codex | [T04 clean fault](./research_loop/evidence/P23/T04_CLEAN_FAULT_CHECKPOINT_2026-09-27.md) · [T11 far-seek](./research_loop/evidence/P23/T11_FAR_SEEK_CHECKPOINT_2026-09-27.md) · [T14 graph/restore](./research_loop/evidence/P23/APPROVAL_GRAPH_RESTORE_CHECKPOINT_2026-09-27.md) · [P23 matrix](./research_loop/evidence/P23/phase-report.md); no full P23/P24 claim from this subset |
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
| CG-FG-D1-O1 | `display_label` trên ba named read sở hữu màn deep link: report (S09), release-candidate compose + pack (S11), compare (S13). Gộp `CG-FG-S09-01`, `CG-FG-S11-01`, `CG-FG-S13-01` | **BACKEND SOURCE/CONTRACT READY 2026-09-29; REAL-API/FE RECEIPT OPEN.** D1 đã làm cho Library/Progress/Evidence/Lineage (`research-attempt-lineage.d.ts:218`, `research-evidence.d.ts:215`, `research-progress.d.ts:539`, `research-run-library.d.ts:122`); ba read này chưa có. Deep link lạnh in short id (typed, an toàn); FE không suy nhãn từ cache/id | Codex | Codex commit field additive cùng rule D1 + generated d.ts + fixture thật; Thanhvuong: `PRODUCT_ROUTE_BROWSER_RECEIPT` 3 deep link sau hard refresh (fixture) + `REAL_API_E2E_RECEIPT` khi có cell. [Packet](./research_loop/evidence/FG/FG-backend-requests.md) §2 |
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
| E1 | Luật hiển thị chung (mọi màn) | id ngắn 8 hex + `title` đầy đủ cho `rrun_`/`ratt_`/digest (10-2, 11-3, 13-2/6/9); timestamp không ISO mili-giây; số đếm/bytes/float có định dạng, không số thô (01, 03, 08 ledger `equity 19996.892873321103`, drawdown 60 chữ số); enum/chuỗi server thành câu (`NOT_ISSUED`, `validation_claim=…`, `RS02_OOS_MEAN_OF_FOLDS`, `draft VIRTUAL`, `true` trần); một câu 403/404 (S03/S04 "Run not found"); link cũ "not built yet" ở S04 (08, 11 đã có route); S11 `.rc-pack .item` bị viết hoa bởi `table th`; bảng dữ liệu a11y của chart làm tròn | M | vitest + axe + ảnh 1440/660 từng màn chạm — **ĐÃ LÀM cho S01–S04, S07–S09, S11** (commit E1): `ShortId`/`shortId` (tiền tố + 8 hex, chỉ cắt đuôi hex), `claimToken`, `groupDecimalString` (nhóm số theo chuỗi, không qua float — bắt được lỗi `…993→…992` khi sửa), một câu F-04 (`REFUSAL_COPY.denied`) cho S03/S04/S05/S10/S11/S13, link S04→08/11, S11 meta + rail, S03 lỗi run = câu màn + `details`. S06/S10/S12/S13/S14 áp cùng helper trong E5/E6/E7; tràn 660 + nút ⏮/⏭ của S08 sang E2 |
| E2 | S07/S08 | S08 P04: tràn 67 px ở 660, nút ⏮/⏭ ra ô rỗng, reveal thu chart về một nến và dải toàn run lộ nến tương lai, trade anatomy rỗng tới khi bấm `#`; S07 slider what-if dùng tên demo HiFi `entry_z/atr_mult` thay vì `rvol/slpercent` của profile, thiếu lối "propose new attempt" khi what-if tắt; đánh số fold lẫn 0/1 với 1/2; bố cục S07/S08 lệch S05/S06 (offset, màu subtitle, card lồng, breadcrumb mono); S07 thiếu copy-evidence link | M | như E1 + lane real-API S07/S08 — **E2a ĐÃ LÀM:** S07/S08 dùng frame riêng như S05/S06 (`OWN_FRAME_SCREEN` thêm freeze/execute; lề 272 px đo được, trước là 304), breadcrumb/tiêu đề/subtitle cùng kiểu S05, nút copy evidence link ở S07/S08, `propose new attempt →` (`runs/new?from=`) ở S07 độc lập cờ what-if, slider what-if dùng `rvol`/`slpercent`, bỏ lý do in hai lần, nút `\|◀`/`▶\|` thay glyph thiếu font, trang `StageDenied` dùng chung cho 403/404 ở S07/S08, `foldLabel` (`fold_01` = `#fold=1`) ở S05/S07/S08/S09, trade anatomy mở sẵn transition đầu + bấm cả dòng, bảng sr-only bọc trong `div` (S08 P04 hết tràn 91 px ở 660). **E2b ĐÃ LÀM:** reveal giữ nguyên bề rộng cửa sổ (tương lai để trống, không co về một nến) và dải toàn run không còn vẽ nến sau con trỏ (8.15); trục P04 chỉ ghi tick tròn, drawdown 2 nhãn dạng % (8.7); transport P04 `\|◀ ◀◀ ▶ ▶▶ ▶\|` như WFO; S07 bỏ card FREEZE lồng, revision lên dải trạng thái. **E2c ĐÓNG:** chuỗi digest F3 ở S07 (7 mắt, mỗi mắt là field đã publish hoặc typed absence, browser không tính gì — `DigestChain.tsx`); dải IS/OOS/HOLDOUT ở S08 tô từ biên đã publish (fold train/test trên lane retained, ba cửa sổ P14 trên hub P04). Record [`P17/E2C_E16_S07_S08_CLAUDE_2026-09-26.md`](research_loop/evidence/P17/E2C_E16_S07_S08_CLAUDE_2026-09-26.md) |
| E3 | S09 sheet | notice PARTIAL nói thiếu cả nhóm khi chỉ thiếu vài mục; `break-all` cắt chữ; trục equity chỉ min/max và nhãn đáy đè đường; màu theo dấu | S | ảnh + in Letter/A4 — **ĐÃ LÀM (trừ in):** notice PARTIAL đếm đúng (`2 of 6 headline values, 4 of 10 artifact digests, 1 of 6 passport facts`); bỏ `break-all` (chỉ xuống dòng khi token tràn); headline OOS Sharpe / max DD / funding tô theo dấu; nhãn "deepest" dời xuống dưới điểm, nền giấy, không đè đường; chú thích fold dùng `fold_01`. **Còn:** trục equity 6 tick (9.10, SVG tự vẽ); ô OOS return (9.8) cần P18 `headline` thêm net OOS return → E14; qualifier "declared, not executed" cho P04 (9.7) → E14; evidence link ở provenance (9.15); chạy lại in Letter/A4 |
| E4 | S01–S04 | S01 in chữ "available" thay giá trị null-AVAILABLE; S02 màn đầu (badge PUBLISHABLE khi chưa chọn gì, lỗi validate trước khi nhập, sáu panel rỗng đè nút chính, chưa hiện warmup/required columns/step đã có trong registry); S03 claim passport thiếu 4 claim phương pháp, ô forecast rỗng khi QUEUED; S04 WFO equity vẽ đoạn phẳng trước OOS gây hiểu nhầm  — **ĐÓNG:** S01 hết in chữ "available" thay giá trị null; S02 màn đầu (chip `NO VERSION CHOSEN` thay `PUBLISHABLE · no version bound`, hiện warmup + required columns từ registry, tới được bước tham số); S03 claim passport + forecast; S04 bỏ đoạn equity phẳng trước OOS. Record [`P13/E4_E11_E12_E15_S00_S04_CLAUDE_2026-09-27.md`](research_loop/evidence/P13/E4_E11_E12_E15_S00_S04_CLAUDE_2026-09-27.md) | M | vitest + ảnh |
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
| E15 | P11 | **CLOSED backend + consumer 2026-09-27:** producer seals requested-spec, effective-spec/adapter and dataset-binding receipts together with progress journal/receipt; P04 therefore has seven real artifacts while WFO truthfully has five and typed absences for evidence/split. Files are 0600, CAS-required, and journal cursor/order are backend-owned. Records: [`P11/E15_PROGRESS_ARTIFACT_CLOSEOUT_2026-09-27.md`](research_loop/evidence/P11/E15_PROGRESS_ARTIFACT_CLOSEOUT_2026-09-27.md), [`P13/E4_E11_E12_E15_S00_S04_CLAUDE_2026-09-27.md`](research_loop/evidence/P13/E4_E11_E12_E15_S00_S04_CLAUDE_2026-09-27.md). | M | **CLOSED**; `fold_segment_observed` stays typed absent until the engine supplies segment times |
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

Trạng thái lúc ghi: lane real-API 54 ô (52 xanh so với preview `c81e8dc2` vì preview còn phục vụ
bundle trước khi sửa S00), E10-O3 đã xong. **Hai việc đang làm dở, có code trong worktree nhưng
chưa commit** — phải lấy lại, đừng làm lại từ đầu:

| Id | Việc | Ở đâu | Đã có gì | Còn gì |
|---|---|---|---|---|
| F1 | **RF-04 — mật độ S12** | — | **ĐÃ XONG, đã gộp (merge `56439458`):** S12 Modes ở 1440 từ 3.016 xuống **2.478 px** (HiFi 2.273), ở 660 từ 4.468 xuống **3.977** (HiFi 4.110 — thấp hơn HiFi). 205 px còn lại ở 1440 đã đo từng khối: chữ engine dài gấp **2,5 lần** mẫu HiFi (2.706 so với 1.082 ở phần text), không phải khoảng trắng — ghi là lệch có chủ ý | Record [`P20/RF04_S12_DENSITY_CLAUDE_2026-09-27.md`](research_loop/evidence/P20/RF04_S12_DENSITY_CLAUDE_2026-09-27.md) |
| F2 | **E16-R1 — overview OHLC cho P04** | — | **ĐÃ XONG, đã gộp** (agent bị cắt quota lúc hook đang chạy; code và test đã xanh trong worktree, tôi gộp lại): child P10 tóm tắt bar **trong lúc còn giữ tape**, migration **068**, serve đúng shape `candle_overview` của lane WFO, S08 P04 vẽ dải toàn run. Run cũ đọc `P13_SOURCE_PREDATES_RETAINED_CANDLE_OVERVIEW` mãi mãi — **không backfill**. Test: producer Python 16/16, replay 3+11+3, **PostgreSQL 4/4**, frontend S08 73/73, contracts 191/191. Bản patch dự phòng: `/home/bobby/portal-wip/e16r1-p04-candle-overview-2026-09-27.patch` | Record [`P17/E16R1_P04_CANDLE_OVERVIEW_CLAUDE_2026-09-27.md`](research_loop/evidence/P17/E16R1_P04_CANDLE_OVERVIEW_CLAUDE_2026-09-27.md) |

**Việc lớn còn lại, theo thứ tự.** Cột *Chủ* ghi rõ việc nào **Codex làm được** (backend, không đụng màn ≤P21) và việc nào là **frontend chưa xong**. Mọi việc dưới đây đều **chưa bắt đầu** — không có code dở nào ngoài những gì đã ghi.

| # | Việc | Chủ | Vì sao chưa xong |
|---|---|---|---|
| F3 | **OPEN — full exact-candidate 54/54 real-API browser lane.** The owned P23 cell has pinned images and real P04/WFO runs; S02/S14 positive browser writes have scoped receipts, but S00–S14 plus publication/Governance consumer have not been retaken on exact HEAD. The 068/069→075/076 migration upgrade path is proved separately in F6. The contributor's 2026-09-28 `BLOCKED_BY_RUNTIME` was historical, not current absence of an owned cell. | Claude FE + Codex runtime | Build one exact candidate, run the complete non-stubbed browser lane, pin image/source/migration IDs and prove the product screens. [Prior request](./research_loop/evidence/FG/FG-runtime-activation-request.md) · [current P23 receipts](./research_loop/evidence/P23/README.md) |
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
(P10, P13–P20) — **không xoá** (luật A13.1), sổ này thắng chúng.

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
