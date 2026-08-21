# Phase B — Query/Read Endpoint Inventory, Admin/CLI Mapping, Authentication

> Handoff sections: 7.4, 7.6, 7.7 | Status: `CONFIRMED_RUNTIME` / `CONFIRMED_SOURCE`
> Evidence: `evidence/phaseA/gateway_openapi_runtime.json` (91 paths, 104 operations), source `services/gateway/core/engine.py`, `services/gateway/security/api_keys.py`, `cli/__main__.py`

## 7.4 Query/read endpoint inventory — `CONFIRMED_RUNTIME`

Nguồn: runtime `/openapi.json` (semantic identical với committed) — 104 operations trên 91 paths. Phân loại:

| Nhóm | Số ops | Path prefix | Loại |
|---|---|---|---|
| Admin | 53 | `/v1/admin/*` | Admin CLI/ops (X-Admin-Token) |
| Orders | 6 | `/v1/orders`, `/v1/orders/{id}` | C+R+U |
| Execution sessions | 5 | `/v1/execution-sessions*` | Read |
| Order brackets | 5 | `/v1/order-brackets*` | CRUD |
| Order groups | 5 | `/v1/order-groups*` | CRUD |
| Performance | 6 | `/v1/performance/*` | Read |
| Sizing | 3 | `/v1/sizing/*` | Read |
| Accounts | 2 | `/v1/accounts*` | Read |
| Order packages | 1 | `/v1/order-packages` | Read |
| Portfolio | 2 | `/v1/portfolio*`, `/v1/portfolio-targets` | Read |
| Fills | 1 | `/v1/fills` | Read |
| Positions | 1 | `/v1/positions` | Read |
| Market | 2 | `/v1/market/*` | Read |
| Replay | 2 | `/v1/replay/*` | Read (admin-scoped) |
| Events | 1 | `/v1/events` | Read (admin-scoped) |
| Contracts | 1 | `/v1/contracts` | Public |
| Health | 2 | `/v1/health`, `/v1/health/capabilities` | Public |
| Alpha gateway | 5 | `/submit`, `/bulk`, `/cancel`, `/update` (order-command.v2), `/health` | Order entry |

Full path table: `evidence/phaseB_path_table.txt` (91 dòng, sẽ đưa vào artifact pack).

**Alpha-facing (46 routes theo baseline)** = orders/fills/positions/sessions/brackets/groups/sizing/market + order-command v2; còn lại admin/public.

## 7.6 Admin/CLI command mapping — `CONFIRMED_SOURCE`

CLI `cli/__main__.py` (2847 dòng, argparse). 3 nhóm transport:

| Nhóm | Lệnh | Transport |
|---|---|---|
| HTTP admin API | `health`, `alpha`, `portfolio`, `deployment`, `allocation`, `capital`, `broker`, `account`, `risk`, `copy`, `performance`, `sizing`, `replay`, `order-group`, `bracket-audit`, `authority` | HTTP → gateway `/v1/admin/*` |
| Direct Redis | `redis get/scan/alpha-auth/trading-state/stream` | Redis direct (ops) |
| Direct DB | `ops trace-order/dead-letters/findings/streams/command-journal/retention/alerts` | Postgres direct |
| PLAN/APPLY/VERIFY | chỉ `config plan/apply` + `emergency-close` | HTTP admin |

Toàn bộ thao tác CLI đều là read/query, trừ: `config apply` (plan gated), `emergency-close` (plan/apply/verify), `broker reconcile-*`, `account sync/reconcile-*`, `seed-paper` — các lệnh mutation phải qua plan/verify.

## 7.7 Authentication hiện hành — `CONFIRMED_RUNTIME` + `CONFIRMED_SOURCE`

| Cơ chế | Chi tiết | Evidence |
|---|---|---|
| Public (no auth) | `/v1/health`, `/v1/health/capabilities`, `/v1/contracts`, `/openapi.json`, `/docs` — đã GET 200 không key | runtime |
| Alpha API key | Header `X-API-Key`; verify: `gate:active_alphas` SISMEMBER → `gate:apikeys` HGET → `verify_api_key` (sha256$v1$ hoặc hmac-sha256$v1$ với server pepper, so sánh `hmac.compare_digest` constant-time; legacy plaintext có upgrade-on-auth nếu enable) | `security/api_keys.py`, `core/engine.py:102-170` |
| Rate limit | Sliding-window bucket `rl:gateway:{route}:{alpha_id}:{mode}:{venue}:{account_id}:{epoch_sec}`, default 300 req/s, TTL 2s, 429 kèm `retry_after_seconds` | `core/engine.py` |
| Admin | `X-Admin-Token` hoặc user/pass qua middleware; 503 nếu chưa configure | `main.py:343` |
| Không có | JWT, mTLS, delegated actor, per-scope key | `MISSING` |

> Ghi chú Portal: OpenAPI runtime `securitySchemes: []` — auth nằm ở middleware/dependency, không khai báo trong spec. Read/query cho Portal không cần key ngoài admin-scope; mọi alpha-facing endpoint yêu cầu alpha active + API key hợp lệ.