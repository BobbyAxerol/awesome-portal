# Trading System → Portal Compatibility Discovery Handoff

> **Status:** `INFORMATION_REQUEST — READ-ONLY DISCOVERY`
>
> **Audience:** agent đang có quyền đọc Trading System tại Execution Cell AWS HK
>
> **Requested by:** Portal backend lead
>
> **Purpose:** thu thập runtime/contract evidence đủ để thiết kế `portal-execution-edge-rs` và master backend plan cho Execution Loop
>
> **This document is not an implementation authorization.**

---

## 0. Agent acknowledgement bắt buộc

Agent phía Trading System phải đọc toàn bộ tài liệu này và ghi acknowledgement
trước khi điều tra:

```text
[TS-AGENT ACK]
Agent:
UTC time:
Trading System checkout/runtime inspected:
I confirm this task is read-only: YES/NO
I confirm I will not mutate source, DB, Redis, broker, runtime or secrets: YES/NO
Local repository/agent rules read: YES/NO
```

Nếu không thể xác nhận đủ ba dòng `YES`, dừng và ghi blocker. Không tự mở rộng
quyền.

---

## 1. Context: Portal đang định xây gì

Primus Portal là một product/monorepo nhưng có hai runtime cell:

```text
Research Cell — DO Singapore
  Portal Web + TypeScript Control API/BFF
  Identity/session/RBAC
  Alpha Research + QuantBT + Planning
  Gate R1/R2, approval và promotion workflow
  Research-side execution summary projections

Execution Cell — AWS Hong Kong
  Trading System — authority cho Paper/Sandbox/Canary/Live
  Portal-owned compatibility/query/realtime layer tối thiểu
```

Normal user path:

```text
Browser
  → Cloudflare Access / portal.primusspark.com
  → Portal Web + TypeScript BFF tại SGP
      ├── research/control requests xử lý local
      ├── authoritative execution query → AWS
      ├── execution commands → AWS
      └── execution events/projections ← AWS
```

Portal dự kiến bổ sung một Rust deployable nhỏ tại AWS:

```text
portal-execution-edge-rs
├── Trading System version adapters
├── canonical Portal execution model
├── snapshot/event projection
├── read-only Portal Query API
├── SSE/WebSocket realtime fan-out
├── compatibility/capability negotiation
└── security + observability
```

Đây không phải bản sao Trading System và không được trở thành risk, execution,
accounting hoặc broker authority.

### 1.1 Mục tiêu compatibility

```text
Trading System contract v1 ─┐
                            ├── adapter ──> Portal canonical model ──> Portal API v1
Trading System contract v2 ─┘
```

Khi Trading System nâng contract, Portal thêm/thay adapter và chạy compatibility
tests. Frontend và TypeScript Control API không được phụ thuộc trực tiếp vào
schema/version nội bộ của Trading System.

---

## 2. Authority và phạm vi tuyệt đối

### 2.1 Trading System tiếp tục sở hữu

- order/risk/execution decision;
- paper matcher và working-order authority;
- canonical orders/fills;
- account, position, balance, reservation và ledger;
- strategy deployment runtime;
- broker binding, broker sync và reconciliation;
- command journal, ACK/fill evidence và operational truth;
- broker/exchange credentials;
- mọi migration/schema/runtime nội bộ của Trading System.

Ngôn ngữ implementation hiện tại hoặc tương lai của Trading System không phải
Portal concern. Trading System có thể chuyển Python sang Rust; Portal chỉ phụ
thuộc versioned contracts.

### 2.2 Portal compatibility layer được phép làm trong tương lai

- gọi versioned Query/Event/Admin APIs đã được Trading System công bố;
- normalize response/event sang Portal canonical model;
- giữ Portal-owned read projection/cache;
- query, filter, paginate, aggregate và downsample cho UI;
- fan-out SSE/WebSocket;
- chuyển Portal command đã được authorize sang API hợp lệ;
- hiển thị authority/freshness/sequence/lag/warnings;
- dùng read-only database adapter tại AWS **chỉ khi owner phê duyệt riêng**.

### 2.3 Portal compatibility layer không được làm

- import hoặc gọi internal repository/business code của Trading System;
- ghi hoặc migrate Trading System database;
- ghi trực tiếp Redis stream/cache của Trading System;
- đọc hoặc giữ broker secret;
- tự quyết risk, fill, accounting, broker truth hoặc reconciliation result;
- suy `FILLED` từ requested quantity;
- coi HTTP `202` là terminal success;
- mở shell/CLI execution từ browser;
- retry mutation mù quáng;
- biến projection cũ thành live truth;
- sửa Trading System để thuận tiện cho Portal trong task discovery này.

---

## 3. Safety rules cho agent thực hiện discovery

Task này chỉ cho phép đọc và viết câu trả lời vào tài liệu handoff.

### 3.1 Được phép

- đọc source, tests, migrations, OpenAPI, docs và config templates;
- đọc exact Git commit/tag và container image identity;
- xem service/container status bằng command read-only;
- export OpenAPI từ endpoint read-only;
- đọc schema metadata hoặc schema-only dump nếu local rules cho phép;
- dùng test fixtures đã có;
- tạo sanitized examples bằng cách thay mọi identifier/secret/PII;
- ghi `MISSING` hoặc `UNKNOWN` thay vì suy đoán.

### 3.2 Bị cấm

- edit Trading System source, migration, Compose, `.env`, secret hoặc runtime;
- restart/rebuild/recreate container/service;
- chạy admin mutation, seed/reset, reconcile apply, order submit/cancel/close;
- insert/update/delete DB;
- publish/ack/delete/trim Redis/NATS messages;
- đọc hoặc paste plaintext API key, password, token, cookie, broker credential,
  private key, OTP hoặc certificate material;
- paste `docker inspect`, expanded Compose config hoặc environment dump có thể
  chứa secret;
- paste raw production logs/payload nếu chưa redact;
- chạy load test lên runtime đang giao dịch;
- đổi firewall, security group, Cloudflare, DNS hoặc WireGuard;
- commit/push trong Trading System repo cho task này.

### 3.3 Evidence an toàn

Ưu tiên evidence theo thứ tự:

1. exact source path + symbol/test;
2. committed OpenAPI/schema/fixture;
3. sanitized response từ read-only endpoint;
4. sanitized schema metadata;
5. Markdown plan — chỉ được ghi `DOCUMENTED_ONLY`, không coi là runtime fact.

Không cần gửi secret để chứng minh auth tồn tại. Chỉ mô tả token type, header,
scope, TTL, issuer/audience và verification behavior.

---

## 4. Status vocabulary bắt buộc

Mỗi capability/endpoint/event phải dùng một status:

| Status | Nghĩa |
|---|---|
| `CONFIRMED_RUNTIME` | Đã quan sát read-only trên runtime hiện hành |
| `CONFIRMED_SOURCE` | Có source/test/schema rõ nhưng chưa xác nhận runtime |
| `DOCUMENTED_ONLY` | Chỉ có plan/guide, chưa có implementation evidence |
| `PARTIAL` | Có nhưng thiếu field/semantics/security cần thiết |
| `MISSING` | Không tồn tại |
| `UNKNOWN` | Không đủ quyền/evidence để xác định |
| `NOT_APPLICABLE` | Không thuộc Trading System |
| `OWNER_DECISION_REQUIRED` | Không được tự chọn thay owner |

Mọi `CONFIRMED_*` phải có evidence reference. Không dùng từ `DONE`, `READY` hoặc
`SUPPORTED` mà thiếu status/evidence.

---

## 5. Target protocols đã được Portal lựa chọn

Agent không cần thiết kế lại protocol. Hãy đánh giá Trading System hiện tương
thích tới đâu và ghi gap.

### 5.1 Query API

Baseline:

- HTTPS + JSON;
- OpenAPI 3.1 hoặc schema tương đương;
- request/response versioned;
- cursor/keyset pagination;
- server-side filter/range/downsample;
- gRPC/Protobuf chỉ xét sau profiling, không phải baseline.

Mọi authoritative query response của Portal cần envelope tương đương:

```json
{
  "schema_version": "portal.execution.query.v1",
  "data": {},
  "source_authority": "EXECUTION_CELL",
  "as_of": "2026-08-20T00:00:00Z",
  "source_sequence": 123456,
  "aggregate_version": 17,
  "freshness_state": "FRESH",
  "projection_lag_ms": 0,
  "warnings": [],
  "request_id": "req_example"
}
```

Trading System không bắt buộc phải trả đúng Portal envelope. Adapter Rust có
thể bổ sung envelope nếu source cung cấp đủ `as_of`, version/sequence và
authority evidence.

### 5.2 Durable event relay

Baseline:

```text
Trading System canonical commit
  → transactional outbox/versioned event
  → authenticated relay
  → Portal projection
  → SSE/WS browser fan-out
```

Không dùng shared database hoặc synchronous distributed transaction xuyên
SGP–HK. NATS có thể dùng local theo cell; không bắt buộc Trading System thay
Redis transport trong task Portal.

### 5.3 Browser realtime

- REST snapshot khi kết nối;
- SSE cho status/PnL/operation feed thông thường;
- WebSocket cho dense multi-topic order/fill/live tape;
- snapshot → cursor/sequence → delta;
- gap bắt buộc resync;
- bounded queue, backpressure và slow-consumer policy;
- không polling từng card mỗi giây.

### 5.4 Admin command

Portal gọi cùng underlying Admin/Command API mà CLI dùng; Portal không gọi shell
và không build CLI command string.

Canonical lifecycle:

```text
PLAN → APPLY → VERIFY
```

Một command cần tối thiểu:

```text
command_id
command_type
actor_id
workspace_id
resource_type/resource_id
idempotency_key
expected_aggregate_version
approval_ids khi cần
reason
issued_at/expires_at
payload_schema_version
payload
```

Trading System phải trả evidence để phân biệt:

```text
PLANNED
ACCEPTED / 202_NOT_TERMINAL
IN_PROGRESS
VERIFIED
PARTIAL
FAILED
DENIED
CONFLICT
EXPIRED
```

Nếu API hiện tại không có plan/apply/verify hoặc expected revision, ghi `PARTIAL`
hoặc `MISSING`; không sửa API trong discovery.

---

## 6. Security/authentication architecture đã chọn

Mục tiêu là defense-in-depth nhưng không thêm per-event/per-frame network round
trip làm chậm realtime.

### 6.1 Network baseline

```text
SGP ↔ AWS: private WireGuard path
service endpoint: private interface/loopback/wg0 only
application transport: TLS 1.3 + mutual TLS
public browser ingress: Cloudflare Access/Tunnel, same Portal domain
```

Execution API không mở public hostname trực tiếp. Internal database/Redis không
được expose ra SGP hoặc browser.

### 6.2 Workload identity

Mọi SGP BFF → AWS edge request:

- mTLS certificate nhận diện workload;
- short-lived asymmetric-signed workload/delegated JWT;
- Rust verify signature/JWKS local, không introspect qua WAN mỗi request;
- audience khóa vào đúng service;
- key/certificate rotation độc lập;
- clock-skew nhỏ và replay protection cho command.

Target claims:

```json
{
  "iss": "portal-control-api",
  "aud": "portal-execution-edge",
  "sub": "usr_example",
  "sid": "session_example",
  "workspace_id": "ws_example",
  "roles": ["OPERATOR"],
  "scopes": ["execution.read"],
  "resources": ["deployment:dep_example"],
  "jti": "assertion_example",
  "iat": 0,
  "nbf": 0,
  "exp": 0,
  "auth_time": 0,
  "amr": ["cloudflare_access", "portal_session"]
}
```

Không dùng shared symmetric secret giữa nhiều browser/service nếu asymmetric
JWKS giải quyết được.

### 6.3 Read/query authentication

- Browser chỉ gọi TypeScript BFF cho composed/sensitive query.
- BFF kiểm tra Portal session + RBAC/resource scope.
- BFF gọi AWS bằng mTLS và delegated read assertion TTL tối đa 60 giây.
- AWS edge xác minh local và filter đúng resource.
- Read không cần step-up nhưng vẫn phải authenticated/authorized.
- Response luôn gắn authority/freshness và audit access khi dữ liệu nhạy cảm.

### 6.4 Realtime authentication tối ưu latency

Target same-domain path:

```text
Browser
  → POST BFF xin stream grant
  → BFF set Secure + HttpOnly + SameSite=Strict cookie-ticket
     Path=/api/execution/stream; bootstrap TTL 60s
  → Cloudflare route /api/execution/stream/* tới AWS Rust gateway
  → Rust verify JWT/JWKS local
  → subscribe đúng topic/resource scope
```

Rules:

- ticket one-time hoặc nonce-bound khi handshake;
- không để long-lived token trong URL/query/access log;
- connection lifetime mặc định tối đa 15 phút rồi renew/reconnect;
- permission/incident revocation có server-side disconnect channel;
- mỗi subscription có topic/resource allowlist;
- no per-message auth call về SGP;
- message vẫn có sequence/schema/type, không tin client cursor mù quáng;
- read-only stream không cấp command scope.

Nếu Cloudflare same-domain direct stream chưa được owner bật, baseline tạm thời
là BFF/reverse proxy stream; protocol vẫn giữ nguyên để chuyển route sau.

### 6.5 Admin command authentication theo risk tier

| Tier | Ví dụ | Step-up tối thiểu | Approval |
|---|---|---|---|
| `R0_READ` | query/report/plan preview | Portal session | Không |
| `R1_PAPER_MUTATION` | seed/allocate/halt/resume Paper | recent password re-verification trong giai đoạn chuyển tiếp; target WebAuthn | Theo policy |
| `R2_SANDBOX` | broker sync/reconciliation/certification | MFA/WebAuthn | Operator + policy gate |
| `R3_LIVE_PROTECTIVE` | halt/reduce/emergency close | WebAuthn/passkey; break-glass policy nếu áp dụng | Immutable audit; risk-reducing path riêng |
| `R4_LIVE_EXPANSION` | activate/scale/promote Live | WebAuthn/passkey | Dual approval + separation of duty |

Password-only không đủ cho Canary/Live expansion.

Command path:

```text
Browser admin
  → Cloudflare Access + Portal session + CSRF
  → TypeScript RBAC/resource policy
  → step-up + approval/SoD check
  → delegated actor assertion TTL 30–60s
  → WireGuard + mTLS
  → portal-execution-edge-rs allowlisted command adapter
  → Trading System Admin API
  → Trading System local state/risk/idempotency validation
  → durable operation/ACK evidence
  → VERIFY terminal state
```

Underlying Trading System admin credential:

- riêng cho Portal edge;
- lưu local tại AWS secret store, không chuyển về SGP/browser;
- endpoint/method allowlist;
- least privilege;
- rotation/audit riêng;
- không reuse alpha gateway hoặc broker credential.

Nếu Trading System chưa nhận delegated actor assertion, Portal edge vẫn phải
giữ actor/audit, nhưng đây là một security gap cần report. Portal không được
tuyên bố Trading System đã revalidate actor nếu runtime không làm vậy.

### 6.6 Event relay authentication

- mTLS workload identity;
- service JWT audience `portal-event-relay`, TTL ngắn và verify local;
- consumer dedupe bằng event ID;
- sequence/gap detection;
- payload schema allowlist và maximum size;
- không mang browser/user credential;
- sensitive fields redact trước khi rời AWS.

### 6.7 Optional read-only DB adapter

Chỉ được thiết kế/activate khi owner phê duyệt:

- process chạy tại AWS;
- dedicated DB role `CONNECT + SELECT` trên allowlisted schema/view;
- transaction read-only;
- statement/lock timeout;
- connection pool limit;
- không quyền DDL/DML/function execution nguy hiểm;
- không broker-secret columns;
- schema version/capability check khi startup;
- query cancellation/backpressure;
- ưu tiên read replica/Portal projection để không ảnh hưởng hot execution DB.

Discovery agent chỉ report feasibility; không tạo role hoặc thay DB.

---

## 7. Required discovery response

Agent phía Trading System hãy điền trực tiếp từng subsection dưới đây. Giữ câu
hỏi và thêm câu trả lời dưới marker `[TS-AGENT RESPONSE]`.

### 7.1 Runtime identity và deployment inventory — P0

```text
[TS-AGENT RESPONSE]
Status:
Evidence:
Observed UTC:
Git commit/tag (nếu runtime trace được):
Container image names + immutable digests (không paste registry credential):
Deployment mechanism (Compose/systemd/orchestrator):
AWS region/AZ ở mức không nhạy cảm:
Active services relevant to Portal:
Inactive/planned services:
Gateway internal host/port naming (không public secret URL):
Database engine/version:
Redis/NATS/event transport active:
Known runtime drift from uploaded Markdown:
```

Hãy phân biệt source HEAD, built image và container đang chạy. Không suy runtime
từ working tree.

### 7.2 Machine-readable API authority — P0

```text
[TS-AGENT RESPONSE]
Status:
Evidence:
OpenAPI version:
OpenAPI source/runtime URL:
Sanitized OpenAPI artifact path:
SHA-256 của artifact:
Does OpenAPI match active runtime? How verified?:
Routes excluded from OpenAPI:
Known schema inaccuracies:
```

Nếu OpenAPI quá lớn, đặt sanitized artifact cạnh tài liệu và chỉ ghi path/hash.
Không paste security examples chứa credential.

### 7.3 Capability discovery — P0

Cho biết Trading System có endpoint/capability discovery hiện hành hay không:

```text
[TS-AGENT RESPONSE]
Status:
Endpoint/source:
Current contract versions:
Supported modes:
Supported venues:
Supported order types per venue:
Supported admin commands:
Feature/capability flags:
How a client detects unsupported capability:
How a breaking contract change is announced:
```

### 7.4 Query/read endpoint inventory — P0

Điền một dòng cho mỗi resource. Có thể bổ sung dòng nhưng không xóa resource:

| Resource | Status | Method/path/source | Auth | Pagination/filter | `as_of`/version/sequence | Evidence | Gap |
|---|---|---|---|---|---|---|---|
| Command Center/fleet summary | | | | | | | |
| Alpha/strategy 360° | | | | | | | |
| Portfolio 360° | | | | | | | |
| Deployment 360° | | | | | | | |
| Account 360° | | | | | | | |
| Broker binding/current state | | | | | | | |
| Execution session | | | | | | | |
| Orders | | | | | | | |
| Fills | | | | | | | |
| Positions | | | | | | | |
| Balances/reservations/ledger | | | | | | | |
| Performance/equity/PnL | | | | | | | |
| Risk utilization/grants | | | | | | | |
| Reconciliation findings | | | | | | | |
| Operator operations | | | | | | | |
| Service/readiness/heartbeats | | | | | | | |
| Order/fill lifecycle trace | | | | | | | |
| Broker exposure aggregate | | | | | | | |
| Reports/artifacts | | | | | | | |

Với endpoint list/table lớn, trả thêm:

```text
maximum/default page size
keyset/cursor semantics
sort stability
time-range maximum
server-side aggregation/downsample hiện có
timeout/rate limit
error envelope
empty vs unavailable semantics
```

### 7.5 Event/outbox/stream inventory — P0

Điền một dòng cho mỗi canonical fact cần Portal:

| Event/fact | Status | Producer | Durable source | Transport subject/stream | Ordering key | Replay cursor | Schema version | Sensitive fields | Evidence |
|---|---|---|---|---|---|---|---|---|---|
| deployment changed | | | | | | | | | |
| execution session changed | | | | | | | | | |
| order changed | | | | | | | | | |
| fill created/corrected | | | | | | | | | |
| position changed | | | | | | | | | |
| account/balance changed | | | | | | | | | |
| performance/equity changed | | | | | | | | | |
| risk state changed | | | | | | | | | |
| broker sync changed | | | | | | | | | |
| reconciliation changed | | | | | | | | | |
| operator operation changed | | | | | | | | | |
| service/health changed | | | | | | | | | |

Trả lời rõ:

```text
[TS-AGENT RESPONSE]
Delivery semantics:
Duplicate behavior:
Out-of-order possibility:
Sequence scope (global/per aggregate/per stream):
Retention:
Replay API/mechanism:
Gap recovery snapshot endpoint:
Heartbeat behavior:
Max observed payload size (sanitized measurement):
Are schema changes additive by policy?:
Current dead-letter behavior:
```

Đính kèm ít nhất một sanitized fixture cho order, fill, position, account,
reconciliation và operation nếu tồn tại. Fixture phải giữ field/type/shape nhưng
thay ID, amount nhạy cảm và raw broker payload.

### 7.6 Admin/CLI command mapping — P0

CLI chỉ là client. Hãy map command sang underlying API/domain operation:

| Command/action | Status | Risk tier | Method/path | Plan | Apply | Verify | Auth | Idempotency | Expected revision | Terminal evidence | Rollback/compensation |
|---|---|---|---|---|---|---|---|---|---|---|---|
| inspect/list/get | | R0 | | | | | | | | | |
| portfolio create/update | | R1 | | | | | | | | | |
| allocation add/change/withdraw/rebalance | | R1–R4 | | | | | | | | | |
| account create/update/seed | | R1 | | | | | | | | | |
| risk profile/limit change | | R1–R4 | | | | | | | | | |
| deployment create/configure | | R1 | | | | | | | | | |
| deployment start/resume | | R1–R4 | | | | | | | | | |
| deployment halt/reduce | | R1–R3 | | | | | | | | | |
| broker sync | | R2 | | | | | | | | | |
| reconciliation dry-run | | R2 | | | | | | | | | |
| reconciliation apply | | R2–R3 | | | | | | | | | |
| emergency close/protective action | | R3 | | | | | | | | | |
| reset/destructive lab operation | | BLOCKED | | | | | | | | | |

Trả lời thêm:

```text
[TS-AGENT RESPONSE]
What authenticates the current CLI?:
Is the CLI using HTTP only, direct DB, Redis or mixed access?:
Which CLI actions have no safe API equivalent?:
Which endpoints are safe read-only?:
Which endpoints return 202 before terminal completion?:
How is operation status queried?:
How are PARTIAL/residue states represented?:
How does retry preserve idempotency?:
How are actor/reason/approval stored?:
Can Trading System verify delegated actor assertions today?:
Does local risk/policy revalidate every command?:
```

### 7.7 Authentication hiện hành — P0

Không paste credential value. Chỉ mô tả mechanism:

| Interface | Status | Credential type | Header/protocol | Issuer/verifier | TTL/rotation | Scope model | Audit | Gap vs target §6 |
|---|---|---|---|---|---|---|---|---|
| Gateway alpha requests | | | | | | | | |
| Read/query API | | | | | | | | |
| Admin API/CLI | | | | | | | | |
| Event publisher/consumer | | | | | | | | |
| DB read access | | | | | | | | |
| Redis access | | | | | | | | |
| Broker/DNSE adapter | | | | | | | | |

Trả lời rõ liệu một Portal service account có thể được allowlist riêng mà không
reuse admin/broker/alpha credential hay không. Chỉ report; không tạo account.

### 7.8 Database/schema boundary — P0

```text
[TS-AGENT RESPONSE]
Status:
Evidence:
Canonical DB name/engine/version (no credential):
Current migration/version ledger:
Schema guide matches runtime? differences?:
Tables/views safe for read-only Portal adapter:
Tables/columns forbidden because secret/PII/raw broker payload:
Existing read replica/materialized views/continuous aggregates:
Expected schema migration cadence:
How clients can detect schema version:
Current query pressure constraints:
Is a dedicated read-only role technically feasible without source changes?:
Is it owner-approved today?: OWNER_DECISION_REQUIRED unless explicit evidence
```

Hãy đặc biệt xác nhận canonical/legacy status của:

```text
strategies
strategy_deployments
portfolios / portfolio_allocations / portfolio_capital_ledger
accounts / account policies / balances / reservations / ledgers
orders / fills / positions_v2
paper_open_orders / paper_matcher_config
execution_sessions / risk_grants
performance/account/portfolio equity snapshots
venue_accounts / broker current-state projections
reconciliation_findings
operator_operations
domain_events / event_idempotency
command_journal / command ACK evidence / outboxes
service_heartbeats
```

### 7.9 Freshness, broker truth và venue policies — P0

| Mode/venue | Authority | Freshness source | Fresh threshold | Degraded/stale threshold | Calendar-aware? | Fail-closed behavior | Evidence |
|---|---|---|---|---|---|---|---|
| Paper crypto | | | | | | | |
| Sandbox crypto | | | | | | | |
| Live crypto | | | | | | | |
| Deribit | | | | | | | |
| VN/DNSE | | | | | | | |

Trả lời cách phân biệt:

- runtime readiness;
- promotion stage;
- broker sync state;
- market/session calendar state;
- projection freshness;
- `SUSPENDED_BY_CALENDAR` với `STALE`;
- internal virtual position với physical broker exposure.

### 7.10 Workload/capacity profile — P1

Không chạy load test production. Dùng metrics hiện có hoặc estimate và ghi
`ESTIMATE`.

```text
[TS-AGENT RESPONSE]
Evidence/measurement window:
Concurrent active deployments average/peak:
Accounts/portfolios/strategies:
Orders per day average/peak:
Fills per day average/peak:
Events/sec p50/p95/peak:
Payload bytes p50/p95/max:
Open orders/positions max per account:
Order/fill retention:
Typical and maximum UI query range:
Current DB query p95/p99 if measured:
Current API p95/p99 if measured:
Known hot tables/index bottlenecks:
Available AWS CPU/RAM limits for a Portal edge container:
```

### 7.11 Failure/recovery behavior — P0

| Failure | Current Trading System behavior | Portal-observable evidence | Safe retry/recovery | Gap |
|---|---|---|---|---|
| Gateway unavailable | | | | |
| DB unavailable/read-only | | | | |
| Redis unavailable/restarted | | | | |
| Event duplicate | | | | |
| Event gap/out-of-order | | | | |
| Service restart | | | | |
| Paper matcher restart | | | | |
| Broker listener gap | | | | |
| Broker sync stale/mismatch | | | | |
| Command accepted but no terminal ACK | | | | |
| Command partially applied | | | | |
| WAN SGP↔HK partition | | | | |
| Research Portal outage | | | | |

### 7.12 Safe integration/test environment — P0

```text
[TS-AGENT RESPONSE]
Status:
Is there a staging/sandbox Trading System runtime?:
Can OpenAPI/query be tested read-only there?:
Can Paper commands be tested without broker side effects?:
Available deterministic fixtures/replay corpus:
Available mock/fake broker/data-layer modes:
Tests that prove no real order is placed:
Recommended first integration venue/mode based on current maturity:
Forbidden environments/actions:
How test data is cleaned without destructive production reset:
```

### 7.13 Observability — P1

```text
[TS-AGENT RESPONSE]
Structured log format:
Trace propagation support (`traceparent`):
Metrics endpoint/format:
Existing correlation/request/command/event IDs:
Health/readiness endpoint semantics:
Alert source:
Sensitive-field redaction rules:
Can Portal propagate trace ID through admin command today?:
```

### 7.14 Contract evolution policy — P0

```text
[TS-AGENT RESPONSE]
Current API versioning policy:
Current event versioning policy:
Additive vs breaking change rules:
Deprecation window:
N/N-1 support available?:
Capability negotiation available?:
Schema fixtures/golden tests available?:
How a consumer is notified of upgrade:
Recommended adapter identity for current runtime:
Known near-term contract migrations:
```

---

## 8. HiFi backend evidence request

Frontend visual implementation thuộc Claude. Task này chỉ cần xác định Trading
System data/command evidence để Portal backend phục vụ từng màn. Không thiết kế
CSS/layout.

Điền bảng sau. `Portal-owned` nghĩa là Trading System không cần cung cấp concern
đó; vẫn ghi rõ dữ liệu execution nào Portal cần tham chiếu.

| HiFi screen | Trading System data required | Query/event evidence hiện có | Mutation/command required | Freshness/authority concern | Missing backend capability |
|---|---|---|---|---|---|
| Approval Inbox | execution readiness summary cho R2/exit gate | | none | projected vs authoritative | |
| Gate R1 Review | artifact lineage reference only | | none | Research authority | |
| Gate R2 Review | account/portfolio/risk/capital readiness | | none; authorization is Portal-owned | authoritative preflight age | |
| Paper Workbench | deployment/session/PnL/positions/orders/gate progress | | request exit review is Portal-owned | Paper execution authority | |
| Paper Exit Review | observation/restart/drift/limits/portfolio evidence | | stage decision is Portal-owned; execution preflight needed | evidence window/coverage | |
| Admin Action Drawer | plan/apply/verify command catalog | | all allowlisted admin commands | terminal operation evidence | |
| Operations Queue | command/operation state | | retry/residue planning | sequence and PARTIAL | |
| Incident Detail | finding, sync snapshots, blast radius, operations | | resolve/protective links | broker truth | |
| Command Center | fleet/incidents/approvals/operations summaries | | none directly | projection lag | |
| Sandbox Certification | internal/broker/diff, smoke/cert steps, findings | | sync/reconcile/cert operations | broker freshness | |
| Canary Control Room | live state, canary envelope, broker sync, orders | | halt/reduce/close/scale | live broker truth | |
| Live Full Operations | account/broker/positions/orders/risk | | protective operations | MISMATCH suppresses values | |
| Paper Workbench VNM | calendar/session, VND, DNSE status, LO/ATO/ATC | | Paper operations | calendar-aware freshness | |
| Full Blotter | cursor order/fill lifecycle and timing funnel | | none | high-volume sequence | |
| Alpha 360° | per-deployment/venue/mode/account aggregate | | links to commands | scope-consistent snapshot | |
| Portfolio 360° | allocation/equity/contribution inputs | | allocation commands | multi-currency/formula version | |
| Account/Broker 360° | virtual/physical/diff/binding/sync/findings | | sync/reconcile | shared broker blast radius | |

Với mọi numeric data, report nếu source hiện không có:

```text
unit
currency
scope
formula/version
window
sample count/coverage
as_of
authority
```

Không đề xuất Portal tự tính một financial truth ở browser.

---

## 9. Sanitized artifact package

Nếu có thể tạo artifact read-only, đặt cạnh tài liệu theo layout:

```text
trading_system_portal_contract_pack/
├── README.md
├── runtime-inventory.md
├── openapi.sanitized.json
├── capabilities.sanitized.json
├── auth-contract.md
├── command-catalog.yaml
├── event-catalog.yaml
├── query-samples/
│   ├── deployment.snapshot.v1.json
│   ├── account.snapshot.v1.json
│   ├── portfolio.snapshot.v1.json
│   └── order-page.v1.json
├── event-samples/
│   ├── order.changed.v1.json
│   ├── fill.created.v1.json
│   ├── position.changed.v1.json
│   ├── reconciliation.changed.v1.json
│   └── operation.changed.v1.json
├── error-samples/
│   └── problems.v1.json
├── db-schema-version.txt
└── workload-profile.md
```

Mỗi artifact phải có SHA-256 trong `README.md`. Nếu không thể chuyển artifact,
ghi relevant schema/fields trực tiếp trong response và đánh dấu lý do.

### 9.1 Redaction checklist

- [ ] Không plaintext password/API key/token/cookie/OTP.
- [ ] Không private key/certificate content.
- [ ] Không broker credential hoặc external secret reference có thể khai thác.
- [ ] Không customer/user PII.
- [ ] Account/order/trade IDs đã thay bằng synthetic IDs nhưng giữ type/shape.
- [ ] Raw broker payload đã bỏ hoặc redact.
- [ ] Host/IP public nhạy cảm đã tổng quát hóa.
- [ ] Hash không phải password/token hash có thể replay.
- [ ] Error/stack trace không chứa env/DSN.

---

## 10. Safe read-only evidence examples

Các ví dụ dưới đây chỉ minh họa. Tuân theo local rules và không chạy nếu có khả
năng lộ secret hoặc ảnh hưởng runtime.

```bash
git rev-parse HEAD
git status --short --branch
docker compose ps
docker compose images
curl --fail --silent --show-error http://gateway_service:8000/openapi.json
```

Không chạy/paste:

```text
docker inspect
docker compose config với environment đã expand
env / printenv
psql query lấy production rows
redis-cli đọc raw live payload chưa redact
bất kỳ POST/PUT/PATCH/DELETE admin endpoint
bất kỳ CLI apply/reset/reconcile/close/order command
```

Nếu OpenAPI endpoint read-only không tồn tại, dùng committed schema/source để
report `CONFIRMED_SOURCE`; không bật endpoint hoặc restart gateway.

---

## 11. Discovery completion gate

Chỉ đánh dấu `P0_INFORMATION_COMPLETE` khi có đủ:

- [ ] runtime identity khác source identity đã được phân biệt;
- [ ] machine-readable API contract hoặc exact `MISSING` evidence;
- [ ] Query endpoint/source inventory;
- [ ] Event/outbox schema, ordering, replay và gap behavior;
- [ ] Admin/CLI → API mapping;
- [ ] current authentication mechanisms và gaps;
- [ ] DB schema/version/canonical-vs-legacy boundary;
- [ ] freshness/broker truth/venue policies;
- [ ] failure/recovery behavior;
- [ ] safe integration environment/corpus;
- [ ] contract evolution policy;
- [ ] HiFi backend evidence mapping;
- [ ] artifact redaction checklist pass;
- [ ] mọi `UNKNOWN/MISSING/PARTIAL` có impact và owner/dependency rõ.

Nếu thiếu, trả `P0_INFORMATION_INCOMPLETE` cùng danh sách blockers. Không tự
implement để lấp gap.

---

## 12. Final response block — Trading System agent điền

```text
[TS-AGENT FINAL]
Overall status: P0_INFORMATION_COMPLETE | P0_INFORMATION_INCOMPLETE
Runtime inspected:
Runtime release/image identity:
Read-only methods used:
Files/artifacts returned:
OpenAPI status:
Query contract status:
Event contract status:
Admin command contract status:
Authentication status:
Database compatibility status:
Recommended initial integration mode/venue:
Top compatibility risks:
Portal work that can start safely:
External Trading System dependencies:
Owner decisions still required:
Explicit confirmation: NO Trading System source/runtime/data was mutated: YES/NO
```

### Blocker table

| ID | Missing/partial fact | Impact on Portal | Evidence | Owner/team needed | Can Portal mock safely? |
|---|---|---|---|---|---|
| TS-GAP-001 | | | | | |

### Discrepancy table

| ID | Uploaded Markdown says | Runtime/source evidence says | Authority chosen | Portal adapter consequence |
|---|---|---|---|---|
| TS-DIFF-001 | | | | |

---

## 13. Portal next step after this handoff returns

Portal backend lead sẽ dùng response và sanitized artifacts để viết:

```text
upgrade/EXECUTION_LOOP_PORTAL_BACKEND_AND_HIFI_MASTER_PLAN.md
```

Master plan sẽ bao gồm:

1. authority/prohibited-change rules;
2. current-state reconciliation;
3. dual-cell target architecture;
4. Rust compatibility/query/realtime architecture;
5. TypeScript control-plane modules;
6. version adapters và capability negotiation;
7. Query/Command/Event/Artifact contracts;
8. projection/storage/freshness model;
9. auth/security matrix;
10. backend contract cho từng HiFi screen;
11. screen → endpoint → source → authority mapping;
12. phase priority, dependency và exit gates;
13. contract/integration/replay/load/security tests;
14. AWS/SGP deployment profiles, CI/CD, rollback và DR;
15. explicit external Trading System requests, không tự sửa Trading System.

Không bắt đầu production integration cho tới khi discovery gate và owner
decisions tương ứng được khóa.
