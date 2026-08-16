# Research–Execution Dual-Cell & Institutional UI/UX Adjustment Guide v0.5

> **Đường dẫn đề xuất trong repository:** `upgrade/RESEARCH_EXECUTION_DUAL_CELL_AND_INSTITUTIONAL_UIUX_ADJUSTMENT_GUIDE_v0.5_vi.md`
> **Trạng thái:** Architecture adjustment baseline; không sửa hoặc thay thế lịch sử của guide v0.4
> **Ngày rà soát:** 2026-08-16
> **Nhánh được rà soát:** `dev`
> **Public entry đã khóa:** `https://portal.primusspark.com`
> **Cloudflare team:** `primussparkquant.cloudflareaccess.com`
> **Access AUD:** `564a9f0023fbaa7af966e1056687ae4f6d9523f052b75b83be623678ac70684e`

---

## 1. Mục đích và phạm vi điều chỉnh

Tài liệu này bổ sung một quyết định triển khai còn thiếu trong
[`quantbt_portal_architecture_uiux_final_v0.4_vi.md`](./quantbt_portal_architecture_uiux_final_v0.4_vi.md):

```text
Một logical Portal
Một monorepo và một design system
Một domain cho người dùng
Hai runtime cell có authority tách biệt
```

Hai cell:

```text
Research Cell  — DigitalOcean Singapore
Execution Cell — AWS Hong Kong
```

Mục tiêu vận hành:

1. Mọi phát triển chính vẫn diễn ra trong monorepo trên Research SGP.
2. Code được commit, review và đẩy lên Git trước khi bất kỳ release nào đi xuống AWS HK.
3. AWS chỉ nhận phần release cần cho Execution; không nhận working tree chưa review.
4. Người dùng bình thường chỉ dùng `portal.primusspark.com` và một trải nghiệm Portal thống nhất.
5. Execution giữ độc lập về runtime, secrets, database, risk và live authority.
6. UI/UX được phát triển từ component QuantBT hiện có và tổng hợp có chủ đích từ `Design/`; không tạo giao diện generic hoặc có dấu hiệu “AI-generated”.
7. Từng màn hình sâu được khóa concern, schema và authority sau; màn chưa có backend thật phải giữ trạng thái `COMMISSIONED` hoặc `PROTOTYPE`, không bịa dữ liệu.

Tài liệu này **không**:

- sửa guide v0.4;
- rewrite QuantBT;
- cho phép Portal trở thành execution hot path;
- cho phép Research truy cập broker secret hoặc ghi trực tiếp Execution DB;
- tuyên bố Paper/Sandbox/Live đã production-ready chỉ vì foundation class/test đã tồn tại.

---

## 2. Thứ tự authority khi agent làm việc

Khi có xung đột, dùng thứ tự sau:

1. `AGENTS.md` và quyết định trực tiếp của owner.
2. Tài liệu adjustment này đối với **dual-cell topology, release flow và UI synthesis từ `Design/`**.
3. `upgrade/UNIFIED_IMPLEMENTATION_PLAN.md` đối với phase/exit gate đang active.
4. `upgrade/quantbt_portal_architecture_uiux_final_v0.4_vi.md` đối với domain model, screen inventory, security và UI foundation.
5. `upgrade/BACKEND_ARCHITECTURE_IMPLEMENTATION_GUIDE.md` và từng `upgrade/backend/BAR_*.md` đối với backend slice.
6. `apps/portal/registry/FRONTEND_HANDOFF.md`, canonical schemas, fixtures và code hiện hành.

Nếu code và tài liệu không khớp, agent phải ghi nhận discrepancy và đưa evidence; không tự chọn mô tả thuận tiện hơn.

---

## 3. Kết luận kiến trúc

### 3.1 Một product, không phải hai product Portal

Hai server đều có Portal runtime, nhưng không được phát triển thành hai sản phẩm độc lập.

```text
Shared source
├── shared Portal shell
├── shared identity vocabulary
├── shared design tokens/components
├── shared contracts
└── deployment profiles
    ├── research_full
    └── execution_ops
```

**Research deployment** là trải nghiệm chính:

- Command Center;
- Alpha Pool/Research/Mining/Import;
- QuantBT/WFO/Run Library/Comparison/Audit;
- Data Catalog ở research scope;
- Planning/Roadmap/Task Board;
- các màn Paper/Sandbox/Canary/Live và Operations lấy authoritative state từ AWS.

**Execution deployment** là cùng product language nhưng scope hẹp:

- Deployments;
- Accounts;
- Portfolios;
- Orders/Fills/Positions;
- Risk;
- Reconciliation;
- Incidents;
- protective actions và emergency operations.

Execution deployment không có Alpha Mining, notebook, arbitrary strategy editing hoặc historical research workflow.

### 3.2 Một domain cho user

Luồng bình thường:

```text
Browser
  → Cloudflare Access
  → portal.primusspark.com
  → Research Portal Web/BFF tại DO SGP
      ├── Research services local
      └── secure inter-cell client
           → Execution Gateway tại AWS HK
```

Browser không cần biết màn hình nào thuộc cell nào. Không cho browser query trực tiếp Execution DB hoặc tự ghép response từ hai authority.

Target resilience:

```text
portal.primusspark.com/ops/emergency/*
  → Cloudflare path policy + edge routing
  → Execution Ops Console tại AWS HK
```

Đây vẫn là **cùng domain và cùng design system**, nhưng path emergency không phụ thuộc Research Cell. Chỉ kích hoạt sau khi Access policy mạnh hơn, session/audit và failure test hoàn chỉnh.

---

## 4. Runtime ownership

| Concern | Research Cell — DO SGP | Execution Cell — AWS HK |
|---|---|---|
| Portal shell chính | Authority | Ops-only fallback/profile |
| Identity UI/session entry | Authority bình thường | Emergency session validation/profile |
| Alpha source/research | Authority | Chỉ nhận approved artifact reference |
| `alpha_id`, `alpha_version_id` | Authority | Reference bất biến |
| QuantBT/WFO/mining | Authority | Không chạy research sweep |
| Backtest artifact/evidence | Authority | Pull evidence cần cho promotion |
| Approval workflow | Request/review authority | Re-validate approval và local policy |
| Paper operational runtime | Projection/UI | Authority |
| Sandbox/Canary/Live runtime | Projection/UI | Authority |
| `deployment_id` | Reference/projection | Authority |
| `account_id`, `portfolio_id` | Reference/projection | Authority |
| Order/fill/position/balance | Không authority | Authority |
| Risk/routing/reconciliation | Không authority | Authority |
| Broker/exchange secrets | Cấm | Authority, local secret store |
| Planning/Roadmap | Authority | Read-only link khi cần |
| Execution incident truth | Projection | Authority |

### Invariant bắt buộc

```text
Research outage ≠ Execution outage
Portal outage ≠ automatic flatten
WAN partition ≠ permission bypass
Projection state ≠ authoritative live state
ADMIN role ≠ bypass risk/approval policy
```

---

## 5. Giao tiếp giữa hai cell

Nguyên tắc:

> **Rich communication, narrow authority.** Có thể truyền nhiều state, event và telemetry; chỉ state-changing authority phải hẹp, versioned và fail-closed.

### 5.1 Network baseline

Khuyến nghị production:

```text
Human ingress:
  Cloudflare Access + Tunnel → Research/Execution web gateways

Inter-cell service traffic:
  WireGuard site-to-site DO SGP ↔ AWS HK
  + application mTLS
  + signed delegated actor assertion cho user action
```

Cloudflare service token có thể dùng cho bootstrap/fallback service route, nhưng không thay app-level authorization. Execution API chỉ bind vào private interface/loopback hoặc `wg0`; không mở API public trực tiếp.

### 5.2 Bốn channel chính

#### A. Query API

Dùng cho dữ liệu cần authoritative freshness:

- current positions/open orders;
- account/portfolio state;
- deployment state;
- risk utilization;
- reconciliation và incident detail.

Baseline: HTTPS/JSON có OpenAPI. Chuyển gRPC/Protobuf chỉ khi contract ổn định và profiling cho thấy lợi ích.

Mọi response phải có:

```text
source_authority
as_of
source_sequence hoặc aggregate_version
freshness_state
request_id / traceparent
```

#### B. Command API

Dùng cho side effect:

- create/start/pause/rollback deployment;
- promote Paper/Sandbox/Canary/Live;
- update allocation;
- acknowledge incident;
- protective action hoặc kill-switch workflow.

Canonical command phải mang tối thiểu:

```json
{
  "command_id": "cmd_...",
  "command_type": "deployment.pause",
  "actor_id": "usr_...",
  "workspace_id": "ws_...",
  "resource_id": "dep_...",
  "idempotency_key": "...",
  "expected_aggregate_version": 17,
  "approval_id": "approval_...",
  "reason": "operator supplied reason",
  "issued_at": "UTC timestamp",
  "expires_at": "short TTL",
  "payload_schema_version": "1"
}
```

Execution phải kiểm tra lại:

```text
service identity
AND delegated actor signature
AND scope/resource permission
AND expected version
AND approval/evidence
AND local account/portfolio/risk state
AND command expiry/idempotency
```

#### C. Durable events

Execution phát event qua transactional outbox. Consumer Research phải idempotent và hỗ trợ replay.

Ví dụ:

```text
deployment.*
order.*
fill.*
position.*
portfolio.*
risk.*
incident.*
reconciliation.*
```

Mỗi event giữ canonical envelope tại `packages/contracts`:

```text
event_id
aggregate_id
aggregate_version
source_sequence
schema_version
correlation_id
causation_id
occurred_at
recorded_at
producer
traceparent
```

Giai đoạn đầu có thể dùng outbox → authenticated relay. Khi production traffic đủ rõ, dùng NATS JetStream local theo cell và relay/leaf topology qua private link. Không kéo một shared database hoặc synchronous distributed transaction qua WAN.

#### D. Artifact distribution

Execution pull immutable release/alpha artifact từ registry/object store:

```text
artifact URI
OCI/image/wheel digest
config digest
runtime compatibility
approval/evidence digest
signature/provenance
```

Không gửi source tree hoặc Python code tùy ý qua API. Không rebuild alpha khi chuyển Paper → Live.

### 5.3 Delegated actor assertion

Research BFF ký assertion ngắn hạn bằng asymmetric key; Execution giữ public key/JWKS.

Claims tối thiểu:

```text
iss = research-control-plane
aud = execution-control-plane
sub = portal user id
session_id
roles/scopes
resource ids
approval id nếu cần
jti chống replay
iat/exp, TTL khoảng 30–60 giây
```

Không forward raw browser role header và không tin `X-User-Role` do upstream tự đặt.

---

## 6. Consistency model

### 6.1 Không dùng chung PostgreSQL qua WAN

```text
Research PostgreSQL
  owns research/alpha/backtest/planning/control projections

Execution PostgreSQL
  owns deployment/account/portfolio/order/fill/position/risk/reconciliation
```

Research lưu execution read model kèm:

```text
last_event_at
last_source_sequence
projection_lag_ms
freshness_state
is_stale
```

UI phải hiện `STALE`/`UNAVAILABLE` rõ ràng, không hiển thị projection cũ như live truth.

### 6.2 Các loại consistency

| Loại | Cơ chế |
|---|---|
| Code | Một monorepo, một reviewed commit |
| Contract | `packages/contracts`, schema snapshots, cross-language fixtures |
| Release | Build một lần, deploy theo immutable digest |
| Command | Idempotency + optimistic concurrency + expiry |
| Event | Outbox + sequence + idempotent consumer + replay |
| Projection | Eventual consistency + freshness metadata |
| Broker truth | Reconciliation, không chỉ event delivery |

---

## 7. Source, Git và deployment workflow

### 7.1 Phát triển chính trên Research SGP

Workflow bắt buộc:

```text
SGP working branch
  → local verify/test/smoke
  → push branch
  → PR vào dev
  → CI + review
  → merge dev
  → release PR dev → main hoặc signed release tag
  → build immutable artifacts
  → deploy đúng profile tới từng cell
```

Lệnh tham chiếu:

```bash
git switch dev
git pull --ff-only
git switch -c feat/<scope>

./scripts/portal verify
./scripts/contracts-test.sh
./scripts/control-api-test.sh
# tests/build của frontend/backend bị ảnh hưởng
./scripts/portal smoke

git push -u origin feat/<scope>
```

### 7.2 Target bắt buộc trước Sandbox/Canary/Live: image pull

Repo hiện đã có hướng đúng: production Compose image-only và image tag `sha-<commit>`. Cần mở rộng thành hai deployment profile và pin bằng digest trong release manifest.

```text
CI builds once from reviewed commit
  ├── research images
  ├── shared web/control images
  └── execution images

DO pulls research release digest
AWS pulls execution release digest
```

AWS không chạy `git pull main` như production deployment authority.

### 7.3 Transitional source-pull mode — chỉ prototype

Owner có thể giữ cách “Git trước, AWS pull source cần thiết” trong giai đoạn prototype, nhưng phải làm an toàn:

```bash
git fetch origin --tags --prune
git checkout --detach <APPROVED_RELEASE_SHA>
git status --porcelain  # phải sạch
# verify commit/tag, lockfiles, contracts và protected hashes
# build chỉ execution profile từ exact SHA
```

Cấm:

```text
git pull origin dev trên runtime live
auto-deploy khi branch đổi
checkout tag `latest`
SSH từ nút bấm Portal để pull/restart
build lại cùng version từ source khác
đặt database/secrets/artifacts trong checkout
```

Nếu dùng sparse checkout, chỉ bật sau khi dependency graph của execution profile đã được khóa. Trước đó clone full monorepo nhưng chỉ build/start execution services sẽ ít rủi ro hơn việc bỏ sót shared contract/package.

### 7.4 Repo deployment layout cần bổ sung

```text
deploy/
├── compose.research.production.yaml
├── compose.execution.production.yaml
├── env/
│   ├── research.production.example
│   └── execution.production.example
├── manifests/
│   ├── release-manifest.schema.json
│   └── deployment-profile.schema.json
├── nginx/
├── systemd/
└── runbooks/
    ├── research-deploy.md
    ├── execution-deploy.md
    ├── inter-cell-partition.md
    └── execution-emergency.md
```

Local/CI có thể tiếp tục dùng một all-in-one `compose.yaml`; production phải tách profile.

---

## 8. Rà soát backend BAR-01 → BAR-16

### 8.1 Quy tắc đọc status mới

Từ `Complete` trong một BAR chỉ có nghĩa **slice được mô tả đã pass test**, không đồng nghĩa toàn phase/product/production đã hoàn tất.

Dùng vocabulary sau trong handoff:

```text
CONTRACT_COMPLETE
FOUNDATION_COMPLETE
INTEGRATION_PENDING
PRODUCTION_INACTIVE
OPERATIONAL_EVIDENCE_PENDING
PRODUCT_COMPLETE
```

### 8.2 Audit matrix

| BAR | Evidence hiện có | Đánh giá đúng | Agent cần làm tiếp |
|---|---|---|---|
| 01–03 | Registry/summary/parity/ingress contracts và tests | `CONTRACT_COMPLETE` | Giữ contract; nối vào mother shell và production gateway |
| 04 | NestJS/Fastify auth BFF, PostgreSQL identity, JWT/JWKS, session/RBAC tests | `FOUNDATION_COMPLETE`, `INTEGRATION_PENDING` | Wire gateway; chạy auth thật sau Cloudflare; không để Python nhận raw JWT/password |
| 05–06 | Reproducibility freeze + canonical contracts | `FOUNDATION_COMPLETE` | Bổ sung inter-cell command/event/artifact schemas và release digest manifest |
| 07 | Control API façade, workspaces, run read model, audit/outbox, proxy | `FOUNDATION_COMPLETE` | Browser cutover chưa hoàn chỉnh; mở route có kiểm soát và rollback flag |
| 08 | Run/attempt, lease, NATS/MinIO/worker smoke | `FOUNDATION_COMPLETE` | Production object-store adapter, outbox relay, persistence/recovery và profile deploy còn thiếu |
| 09 | Engine manifest + **2** certified capabilities | `FOUNDATION_COMPLETE` | Không gọi là full QuantBT support; certify từng capability/endpoints còn lại |
| 10 | 11 data-family descriptors; immutable snapshot framework | `FOUNDATION_COMPLETE` | Không family nào `AVAILABLE` tới khi có real digest/quality evidence |
| 11 | Một alpha registry entry và read-only APIs | `FOUNDATION_COMPLETE` | Import/build/scan/version workflow, pool/research UX và real alpha schemas còn thiếu |
| 12 | Approval/promotion state machine + deterministic PaperLedger | `FOUNDATION_COMPLETE` | Chưa phải operational paper/sandbox; phải nối live feed, account/portfolio, execution/reconciliation authority |
| 13 | Signed intent/dual approval/step-up/fail-closed/incident foundations | `FOUNDATION_COMPLETE` | Chưa nối private trading system; cần Execution Gateway và real risk/ack telemetry |
| 14 | Benchmark p95 dưới gate; Rust không khởi động | `CONTRACT_COMPLETE` | Giữ nguyên; chỉ mở Rust khi heavier-path evidence vượt gate |
| 15 | Export/import/reconcile/cutover tooling | `FOUNDATION_COMPLETE` | Production PostgreSQL adapter và cutover thật chưa làm |
| 16 | Release report, secret scan, DR checklist | `FOUNDATION_COMPLETE` | Restore drill, owner-run game day, dual-cell rollback và evidence thật chưa làm |

### 8.3 Các discrepancy phải sửa

1. Phase map trong `UNIFIED_IMPLEMENTATION_PLAN.md` vẫn ghi nhiều phase `NOT STARTED`, trong khi phần `Đã làm` và `upgrade/backend/README.md` đã ghi foundation hoàn tất. Agent phải reconcile status bằng vocabulary trên.
2. `compose.yaml` local đã có `control-api`, PostgreSQL, NATS, MinIO và quant worker; `deploy/compose.production.yaml` hiện vẫn chỉ deploy Portal API, Roadmap API và web. Vì vậy các BAR mới **chưa production-active**.
3. `publish-images.yml` chưa publish `control-api` và execution-cell images.
4. `deploy.yml` hiện có một production host/environment; cần tách Research và Execution deployment authority/secrets/approvals.
5. Root CI hiện không gọi rõ `scripts/control-api-test.sh` và `scripts/contracts-test.sh`; phải đưa hai gate này vào CI, không chỉ kiểm tra file tồn tại.
6. Frontend hiện vẫn là QuantBT application với `TopBar`, `RunPassport`, `NavTabs` và các result tabs; mother shell đầy đủ chưa xuất hiện.
7. Không được dùng `Runway complete BAR-00→16` để tuyên bố portal end-to-end đã deployed.

---

## 9. Backend runway bổ sung

Không sửa lịch sử BAR-01→16. Tạo các deep dive mới khi owner activate:

### BAR-17 — Dual-Cell Deployment & Release Authority

Deliverables:

- Research/Execution deployment profiles;
- release manifest theo commit + image/artifact digest;
- service/data/secret ownership matrix;
- CI path/dependency graph;
- rollback độc lập từng cell;
- local all-in-one parity test.

Exit gate:

- cùng release manifest deploy được hai profile;
- AWS không cần Research working tree;
- không có shared DB hoặc shared mutable volume;
- rollback execution không rollback research và ngược lại.

### BAR-18 — Inter-Cell Gateway & Contract Authority

Deliverables:

- Query/Command/Event/Artifact contracts trong `packages/contracts`;
- Execution Gateway/Agent tại AWS;
- mTLS service identity;
- delegated actor assertion;
- idempotency, expected revision, expiry và audit;
- outbox/event relay + stale projection model.

Exit gate:

- replay/duplicate/out-of-order/expired/forged command tests;
- WAN partition test;
- Research cannot bypass execution risk/approval;
- trace/correlation end-to-end.

### BAR-19 — Single-Domain Routing & Emergency Operations

Deliverables:

- normal path qua Research Portal/BFF;
- `/ops/emergency/*` same-domain path đến AWS profile;
- stronger Cloudflare Access policy, short session, step-up/dual approval;
- minimal ops UI và independent health path;
- no cross-origin browser contract.

Exit gate:

- Research Cell down nhưng Execution runtime và emergency read/protective flow còn hoạt động;
- emergency action có immutable audit và observed acknowledgement;
- browser không thấy internal execution hostname/token.

### BAR-20 — Production Activation, DR & Documentation Reconciliation

Deliverables:

- publish all production images;
- Research/Execution GitHub environments và separate secrets;
- production Compose smoke;
- backup/restore/game-day;
- update phase map, AGENTS/runtime docs và BAR status;
- exact release evidence.

Exit gate:

- dual-cell deployment, partition, rollback và restore được owner/SRE chạy thật;
- docs khớp runtime, không còn “complete” mơ hồ.

---

## 10. UI/UX creative direction cho Claude

### 10.1 Bắt buộc đọc trước khi vẽ

Claude phải đọc theo thứ tự:

1. `CLAUDE.md`, `AGENTS.md`.
2. Guide adjustment này.
3. `upgrade/UNIFIED_IMPLEMENTATION_PLAN.md` phase active.
4. Guide v0.4: P0, §17, Screens 01–26, §§25–27.
5. `apps/portal/registry/FRONTEND_HANDOFF.md`, schemas và fixtures.
6. Source hiện hành:
   - `apps/portal/frontend/src/App.tsx`;
   - `components/shell.tsx`;
   - `components/ui.tsx`;
   - `components/ChartFigure.tsx`;
   - `components/FoldGantt.tsx`;
   - `charts/theme.ts`;
   - `styles/tokens.css`, `base.css`, `print.css`;
   - từng feature `overview`, `optimization`, `parameters`, `execution`, `audit`, `runs`.
7. Toàn bộ `Design/binance_design.md`, `blackrock.md`, `ibm_design.md`, `spaceX_design.md`.
8. Planning design-system/catalog docs trước khi hợp nhất Planning.

Không thiết kế lại từ ảnh tưởng tượng khi component và state thật đã có trong source.

### 10.2 Design synthesis — tham khảo có chọn lọc

**Fund Paper hiện tại là token authority.** `Design/` là nguồn nguyên lý, không phải palette để copy.

| Nguồn | Lấy gì | Không lấy gì |
|---|---|---|
| QuantBT hiện tại | Paper surface, serif narrative, mono data voice, IS/OOS/Holdout semantics, report/audit discipline | Không giữ app shell nhỏ hẹp như product cuối |
| Binance | Data density, tabular number voice, up/down semantics, hairline, compact trading states, small radius | Không dùng yellow làm brand takeover; không clone exchange UI |
| IBM | Modular grid, enterprise hierarchy, accessibility, predictable component/state system | Không biến Portal thành generic Carbon clone |
| BlackRock | Calm institutional tone, restrained asset-management confidence, ít trang trí | Không copy corporate marketing hoặc token mù quáng |
| SpaceX | Technical/industrial restraint, strong hierarchy, absence of glow/gradient | Không full-bleed photo, uppercase toàn hệ thống hoặc marketing hero trong app |

Hướng tổng hợp:

```text
Research mode:
  publication-grade, light Fund Paper, evidence-first

Operations mode:
  dark institutional workstation, compact, high contrast, risk/state-first

Shared:
  cùng spacing, typography roles, component anatomy, interaction states,
  audit/freshness/authority vocabulary
```

### 10.3 Không để giao diện có “AI look”

Cấm mặc định:

- gradient blob, neon glow, glassmorphism;
- purple/blue AI palette không có semantic;
- hero headline quá lớn trong product app;
- grid toàn generic cards với icon ngẫu nhiên;
- fake KPI, fake PnL, fake live status;
- gauge/radial chart chỉ để trang trí;
- emoji, sparkles, robot/AI copy;
- quá nhiều pill, radius lớn, shadow mềm;
- chart smooth/interpolate làm sai data;
- copy kiểu “unlock insights”, “supercharge alpha” không mang nghĩa vận hành;
- component mới chỉ để bọc `padding`, `margin`, `border` một lần.

Mọi screen phải giống phần mềm được analyst/operator sử dụng hàng ngày, không giống landing page hoặc mockup sinh tự động.

---

## 11. Reuse và component promotion gate

### 11.1 Component hiện tại phải được ưu tiên

Giữ và refactor có chủ đích:

```text
TopBar
RunPassport
NavTabs
StateView
Badge / Chip
SegmentedControl
DefinitionList
MetricHero
ChartFigure
FoldGantt
EChart wrapper/theme
current run/result feature views
```

Không xoá toàn bộ để thay bằng một UI kit generic.

### 11.2 Khi nào được tạo shared component

Một component chỉ được promote vào shared library khi thỏa ít nhất một điều kiện:

1. Dùng ở từ hai screen/domain trở lên và có API ổn định.
2. Encode domain semantics như freshness, authority, lifecycle, risk hoặc evidence.
3. Encode accessibility/interaction phức tạp cần test tập trung.
4. Encode chart/table contract hoặc destructive-action safety.

Các candidate hợp lý:

```text
EnvironmentBadge
AuthorityBadge
FreshnessIndicator
MetricStrip
EvidenceDrawer
LifecycleRail
RiskStateBanner
RunSegmentLegend
DecimalCell
DataQualityBadge
ActionReviewPanel
ChartViewportController
CommissionedFeaturePreview
```

Không tạo `FancyCard`, `GradientPanel`, `MagicMetric`, `AIInsightBox` hoặc wrapper không có domain semantics.

### 11.3 Reuse report bắt buộc trong mỗi PR UI

```text
Reused components:
Refactored components:
New components + lý do promotion:
One-off composition kept local:
Removed/deprecated components:
Backend requests:
Visual/state tests:
```

---

## 12. Chart production contract

### 12.1 Authority

- Chart chỉ render versioned artifact/query envelope.
- Metric QuantBT không được tính lại ở browser.
- Execution chart dùng state/event từ Execution authority; Research projection phải có freshness.
- `null`, denied, stale hoặc unavailable không được đổi thành `0`.

### 12.2 Envelope tối thiểu

```text
schema_version
source_artifact_digest hoặc source authority/sequence
run_id/deployment_id/portfolio_id khi phù hợp
segment/environment
timezone
units/currency
as_of
source_rows/returned_rows
downsample method
warnings/data-quality flags
```

### 12.3 Visual rules

- Primary line: khoảng 1.5px; secondary/benchmark nhẹ hơn và khác dash/shape.
- Không smoothing làm thay đổi extrema, drawdown hoặc event timing.
- Missing interval phải tạo visible gap; không tự nối đường.
- Drawdown giữ trục âm rõ; zero baseline hiển thị khi có ý nghĩa.
- Log scale phải có nhãn và explicit user control; không tự bật.
- IS/OOS/Holdout/Paper/Sandbox/Live dùng semantic nhất quán và luôn có text/legend.
- Good/bad color không phải kênh duy nhất; dùng sign, icon, dash hoặc label.
- Tooltip hiển thị timestamp đầy đủ, unit, full precision hợp lý, segment và provenance.
- Benchmark, fee/slippage/funding, orders/fills và incident annotations phải tách lớp rõ.
- Không dùng area opacity dày che series; không dùng 3D chart.
- Export PNG/SVG/CSV và print layout phải giữ title, source, as-of, units và warnings.

### 12.4 Performance baseline

- Server downsample/range query trước khi vào browser.
- Baseline interactive view: tối đa khoảng 5.000 điểm/series; vượt mức phải progressive/query-level.
- Large fills/orders/trials dùng virtual table và server-side filter/sort.
- Chart không block main thread lâu; zoom/pan/tooltip phải phản hồi tức thời ở target workstation.
- Payload/query metrics được đo; Rust chỉ mở khi BAR-14 gate bị vượt bằng evidence.

---

## 13. Numbers, tables và financial formatting

- Mọi number trong metric/table dùng mono hoặc numeric face với `tabular-nums`.
- Numeric columns right-aligned; label left-aligned.
- Decimal qua service boundary là string; format ở presentation boundary bằng explicit precision policy.
- Percent, bps, currency, quantity, price và duration là các formatter khác nhau.
- Không viết `1.2M` trong audit/blotter; abbreviation chỉ dùng summary và phải có full-value tooltip.
- Negative value dùng dấu `−`; parenthesis chỉ khi report policy quy định.
- Zero là dữ liệu; missing/denied/stale là state riêng.
- Price precision theo instrument metadata; không hard-code 2 decimals.
- Timestamp luôn có timezone/context; relative time đi cùng absolute tooltip.
- Table có sticky header; sticky identifier chỉ khi hữu ích; keyboard focus và column semantics rõ.
- Checkbox/row action chỉ xuất hiện khi action thật tồn tại và user có quyền.
- Destructive action không nằm cạnh row action thông thường hoặc trong unlabeled overflow.

---

## 14. Screen-by-screen workflow cho Claude

Không làm toàn bộ 26 màn trong một pass. Dựng IA và prototype chung trước, sau đó khóa từng screen.

Mỗi screen phải có một `Screen Concern Pack`:

```text
1. User/persona và quyết định cần đưa ra
2. Cell/authority sở hữu dữ liệu
3. IDs và source of truth
4. Read/write API cần có
5. Permissions và dangerous actions
6. loading/empty/partial/stale/denied/unavailable/error states
7. hierarchy và wireframe 1440/1280/mobile-relevant
8. component reuse map
9. chart/table/number contract
10. responsive/accessibility/keyboard
11. audit/provenance/freshness
12. Backend request còn thiếu
13. Figma frame/prototype link
14. implementation + visual regression evidence
```

Claude được sáng tạo về:

- composition và information hierarchy;
- density và spatial rhythm;
- drill-down/drawer/bottom-panel flow;
- chart layering và cross-filter interaction;
- transition/motion vừa phải;
- cách hợp nhất Research và Operations trong cùng product language.

Claude không được sáng tạo về:

- metric/data không có nguồn;
- role/permission tự bịa;
- trạng thái live giả;
- endpoint/schema tự thêm;
- business gate hoặc risk rule;
- component dư thừa chỉ để “trông hiện đại”.

---

## 15. Work order đề xuất

### Track A — Documentation and backend truth

1. Merge guide này vào `upgrade/`.
2. Reconcile phase/BAR status terminology.
3. Add BAR-17 deep dive; chưa code dual-cell trước contract.
4. Add explicit ownership and inter-cell schemas.
5. Add Control API/contracts tests vào root CI.

### Track B — Unified UI foundation

1. Capture golden screens của QuantBT và Planning hiện tại.
2. Audit tokens/components; không redesign ngay.
3. Lập design synthesis matrix từ `Design/`.
4. Dựng mother shell, Portal Map và commissioned previews từ registry.
5. Embed QuantBT, giữ parity.
6. Embed Planning, giữ parity/cross-links.

### Track C — Production Research profile

1. Wire gateway → Control API bằng feature flag.
2. Activate Cloudflare auth/session theo v0.4.
3. Publish Control API image.
4. Mở Research production Compose có PostgreSQL/NATS/object store/worker đúng gate.
5. Không activate execution feature giả.

### Track D — Execution cell

1. BAR-17 profile/release boundary.
2. BAR-18 Execution Gateway + inter-cell contracts.
3. Pull approved artifact/release by digest.
4. Integrate private trading schema do owner cung cấp.
5. Paper operational trước; sau đó Sandbox, Canary, Live.
6. BAR-19 emergency Ops profile/path.

### Track E — Institutional screen program

Thứ tự hợp lý:

```text
Command Center / Portal Map
→ Alpha Pool / Alpha Detail
→ QuantBT Run Detail / Compare / WFO
→ Approval Inbox
→ Paper Operations
→ Account / Portfolio / Deployment views
→ Sandbox / Canary
→ Live Operations / Risk / Reconciliation / Incident
```

Screen chưa có contract giữ `COMMISSIONED`, màu giảm emphasis, click mở concern/evidence/roadmap; không render dead page hoặc fake dashboard.

---

## 16. Acceptance gates

### Architecture

- Một public user domain và một logical navigation.
- Research/Execution DB, secrets và authority tách biệt.
- AWS tiếp tục chạy approved deployments khi SGP hoặc WAN lỗi theo policy.
- Không có raw order API từ normal Portal UI.
- Command/event/artifact có schema, identity, audit và replay behavior.

### Release

- Mọi deployment trace về reviewed commit + immutable digest.
- Research và Execution profile rollback độc lập.
- Source-pull transitional mode không được dùng cho Canary/Live.
- Production pipeline publish/test đúng image của Control/Execution services.

### Backend truth

- BAR status không còn mơ hồ giữa foundation và production.
- Root CI chạy contracts và Control API tests.
- Production Compose phản ánh service thực sự active.
- Paper/Sandbox/Live chỉ chuyển `AVAILABLE` sau real integration/evidence.

### UI/UX

- QuantBT parity không regression.
- Design rõ nguồn gốc nhưng không clone Binance/IBM/BlackRock/SpaceX.
- Không có fake metric hoặc generic AI-looking component.
- Chart/table/numeric rules pass visual, accessibility, print/export và performance review.
- Mỗi new shared component có reuse/domain justification.
- Mỗi dangerous action có scope, consequence, reason, policy/evidence và observed acknowledgement.

---

## 17. Stop conditions cho agent

Dừng và hỏi owner/backend lead khi:

- chưa có schema thật của `alpha_id`, `account_id`, `portfolio_id` hoặc private trading system;
- màn hình yêu cầu authority chưa tồn tại;
- cần thêm endpoint/field ngoài canonical contract;
- action có thể ảnh hưởng Paper/Sandbox/Live nhưng chưa có approval/risk/reconciliation gate;
- muốn thêm Rust mà chưa có benchmark evidence;
- muốn copy code/asset từ reference bên ngoài;
- source-pull được đề xuất cho live deployment;
- design cần bịa dữ liệu để “đẹp”.

---

## 18. Handoff format bắt buộc

Mỗi agent kết thúc slice bằng:

```text
Scope/phase/BAR:
Branch + commit:
Files changed:
Contracts changed:
Runtime cell affected:
Authority/data ownership impact:
Security/auth impact:
Components reused/new:
Screens/states covered:
Tests/benchmarks/evidence:
Deployment/rollback:
Open backend requests:
Remaining risks:
```

---

## 19. Quyết định cuối của adjustment v0.5

```text
Product UX          One unified institutional Portal
User domain         portal.primusspark.com
Source              One monorepo; development centered on DO SGP
Release authority   Git review + CI + immutable release manifest
Research runtime    DO Singapore
Execution runtime   AWS Hong Kong
Normal UI path      Research Portal/BFF proxies secure execution boundary
Emergency UI        Same code/design, execution_ops profile, same-domain path later
Inter-cell network  Private WireGuard + mTLS; app-level actor authorization
State consistency   Separate DBs + durable events + freshness projections + reconciliation
Deployment target   Each cell pulls approved images/artifacts by digest
Prototype exception Exact detached Git commit pull only; never branch pull for live
Frontend direction  Fund Paper + disciplined synthesis from Design/
Python              Quant/strategy/QuantBT compute only
TypeScript          Portal/control-plane authority
Rust                Measured query/realtime fast paths only
```

Tài liệu v0.4 tiếp tục là detailed product/screen guide. Adjustment v0.5 này là authority cho cách biến product đó thành một hệ thống hai cell dễ maintain, secure, release-consistent và có UI/UX đủ chuẩn để phát triển từng màn hình mà không phá vỡ architecture.
