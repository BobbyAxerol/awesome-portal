# PHASE-F — machine-readable contract extraction (2026-08-21)

> Read-only. No Trading System source, container, migration, DB row, Redis key or
> credential was modified. Method guarantees are enforced in the scripts themselves,
> not merely asserted — see §5.

## 1. Why a Phase F was needed

Phases A–E answered the handoff prose questions and produced hand-written catalogs.
Two problems remained:

1. **The evidence was not machine-readable.** A `portal-execution-edge-rs` codegen step
   cannot consume a Markdown table. The OpenAPI document is the only machine-readable
   artifact, and it declares zero query parameters, zero request bodies and zero
   security schemes — so it cannot generate a working client.
2. **Several Phase A–E conclusions were wrong or stale**, and prose evidence made that
   hard to see. Phase F re-derives every claim mechanically so it can be re-run and
   diffed.

## 2. What was produced

13 read-only extraction scripts in [`../scripts/`](../scripts/), outside the Trading
System repository, producing 12 JSON + 7 Markdown artifacts in
[`../extract/`](../extract/):

| Artifact | Content |
|---|---|
| `api-surface.json` | 104 operations: auth class + gate function, path/query params, body fields, status codes, envelope keys, repository calls |
| `payload-models.json` | 85 models / 468 fields (15 Pydantic, 50 dataclass, 20 enum) with types, defaults, aliases, constraints, validators |
| `response-shapes.json` | 52 repository queries → 40 endpoints with ordered field lists; 600/637 fields typed from the live catalog |
| `db-schema.json` | 94 tables + 2 views, 1 291 columns, 123 indexes, 10 hypertables, 10 background jobs; source DDL cross-checked against the live catalog |
| `event-catalog.json` | 7 committed JSON Schemas, 5 event dataclasses, 7 emitted `event_type` literals, plus runtime aggregates for `domain_events` and 12 outbox/journal tables |
| `vocabularies.json` | 22 Python enums, 91 DB `CHECK` constraints over 33 fields, 6 venue/product profiles, HTTP header + revision matrix |
| `error-catalog.json` | 124 reason codes with call sites, HTTP status histogram, envelope contract |
| `cli-command-map.json` | 64 CLI actions × access path (HTTP / Postgres / Redis) + proposed risk tier |
| `config-surface.json` | 159 declared settings, 17 secret-shaped redacted by name |
| `freshness-authority.json` | heartbeat/feed thresholds, VN calendar, engine authority states, Portal envelope mapping |
| `runtime-probes.json` | 15 GET probes: public shapes, rejection contract, contract negotiation |
| `COVERAGE.json` | handoff §7 subsection → backing artifact |

Plus [`../CONNECTOR-CONTRACT.md`](../CONNECTOR-CONTRACT.md) (the human entry point),
`../MANIFEST.sha256` and `../REDACTION-AUDIT.json`.

## 3. Corrections to Phases A–E

| # | Previous conclusion | Phase F evidence | Correction |
|---|---|---|---|
| F-1 | Runtime = `tradingsystem-image:v1.2.0-9081397` across the board | `docker ps` 2026-08-21T07:34Z | **Stale.** `gateway_service` is `sha-8b88daa61e3`; `command_journal_service` and `market_data_service` are `sha-8c9a96cc8eb`. Gateway `/openapi.json` is byte-identical, so the route set did not move. |
| F-2 | TS-GAP-006: command_journal not running | `docker ps` + `command_journal` table | **Running**, but `COMMAND_JOURNAL_ROLLOUT="OFF"`, `ACK_REQUIRED=false`, and all 430 journal rows are `DEAD`. Gap changes shape rather than closing. |
| F-3 | `expected_aggregate_version` `CHƯA_ĐẠT` / `MISSING` | `order_group_schema.py:134,143`; `order_groups/repository.py:784`; `main.py:850` | **Wrong.** Order groups support `expected_version` with `409 VERSION_OR_STATE_CONFLICT`. `PARTIAL`, not `MISSING`. |
| F-4 | `DENIED` / `CONFLICT` / `EXPIRED` states missing | DB CHECK on `command_journal.state`, `command_ack_evidence.outcome_class`, `operator_operations.status` | **Mostly wrong.** `BUSINESS_REJECTED`→DENIED, `VERSION_OR_STATE_CONFLICT`→CONFLICT exist. Only `EXPIRED` is genuinely missing. A 9th state, `UNCERTAIN`, has no Portal equivalent and needs one. |
| F-5 | 12 event facts `CONFIRMED_SOURCE`, implying a usable relay | `SELECT event_type, count(*) FROM domain_events` | **Materially overstated.** Exactly one event type exists at runtime (`ORDER_STATUS`, 1 179 rows, last 2026-08-17, one producer). `copy_event_outbox` and `copy:events:v1` are empty. The other 11 facts have zero runtime instances. |
| F-6 | Cursor paging "not feasible adapter-side" | `event_store.py:_limit` + `query_domain_events` ordering | **Too pessimistic.** `/v1/events` is `event_ts ASC, created_at ASC`, time-filterable, limit 500/max 5000 — a usable ascending cursor. Combined with `synthetic_projection_events()` (which rebuilds lifecycle from canonical tables) the Portal can project without any Trading System change. |
| F-7 | DD-05: "LO/ATO/ATC do not exist" | `domain/enums.py:OrderType` | **Half wrong.** `ATO` and `ATC` are declared in the enum but handled by no adapter, matcher or validator — declared-unimplemented. `LO` genuinely absent (maps to `LIMIT`). |
| F-8 | DD-05: "`VN_T_PLUS` not in trading_system source" | `domain/enums.py`, `domain/settlements.py`, `paper_matcher_config` CHECK, `portfolio_management/core.py:62`, CLI `--settlement-policy`, unit tests | **Wrong.** `VN_T_PLUS` is fully implemented end to end. |
| F-9 | "retention policy 1d for snapshots" | `timescaledb_information.jobs` + `init-db/19-performance-pnl-ops.sql` | **Wrong — misread the schedule interval as the window.** Real `drop_after`: 90 days (`performance_snapshots`), 730 days (both equity snapshot tables). `orders`, `fills`, `domain_events` have no retention policy at all. |
| F-10 | Auth: "X-API-Key per alpha + route" | `engine.py:check_auth_and_rate` + runtime probe | **Understated the risk.** The key is verified **only if the header is present**; `gate:active_alphas` membership is the real gate. New **TS-GAP-008**. |

## 4. New findings

| ID | Finding | Evidence |
|---|---|---|
| TS-GAP-008 | `X-API-Key` optional — a known `alpha_id` alone authenticates 41 operations, including order submission | `engine.py:117-124`; probe `alpha_no_key_unknown_alpha` → `403 UNAUTHORIZED_ALPHA` |
| TS-GAP-009 | `GET /v1/positions` without `alpha_id` → `500` plain-text, **no** `X-Trading-*` headers | probe `alpha_positions_no_alpha_id` |
| TS-GAP-010 | OpenAPI: 0 query params, 0 request bodies, 2 component schemas, `securitySchemes: null` | `api-surface.json.spec_crosscheck` |
| TS-GAP-011 | `orders.status` has no DB `CHECK`; the 12-value `OrderStatus` is application-enforced only | `vocabularies.json` — `orders` has CHECKs on `mode` and `side` only |
| TS-GAP-012 | `ATO`/`ATC` declared, unimplemented | F-7 |
| TS-GAP-013 | 7 CLI operator actions (`authority list/create`, `redis get/scan/alpha-auth/trading-state/stream`) reach Postgres/Redis directly with no HTTP equivalent | `cli-command-map.json` |
| — | 7 fields (`status`, `state`, `mode`, …) carry **different** value sets on different tables; keying a vocabulary by column name alone invents values | `vocabularies.json.db_check_vocabularies.by_field[*].conflated` |
| — | Zero drift between the 41 `init-db` migrations and the live catalog (96 objects, no runtime-only, no source-only) | `db-schema.json.crosscheck_source_vs_runtime` |
| — | Supported contract revisions at runtime: `["order-command.v2@2.0.0", "v1"]`, authoritative `v1` | probe `unsupported_revision` → `406` |
| — | New `qdl_v2_stable_candidate` data-layer stack is live (3× Kafka, 3× rust_core, 2× query_v2, OKX ingestors) — not Trading System authority, but changes the market-data picture | `evidence/phaseF/runtime_identity.txt` |

## 5. Read-only guarantees

Enforced in code, not by convention:

- **No execution of Trading System code.** Every source-derived artifact comes from
  `ast.parse` / regex. Nothing is imported.
- **SQL.** `psql()` in `30_db_schema.py` and `40_event_catalog.py` raises on any
  statement not starting `SELECT`/`WITH`, and runs under
  `PGOPTIONS=-c default_transaction_read_only=on`.
- **HTTP.** `90_runtime_probe.py` issues `curl -X GET` only. Public bodies are reduced
  to type skeletons; scalar values survive only for an allowlist of contract fields.
- **Redis.** `XLEN`, `XINFO STREAM`, `INFO keyspace` only — no `XADD`, no key reads.
- **Secrets.** `85_config_surface.py` reads source declarations only — never the
  process environment, never `docker inspect`, never `docker compose config`, never a
  `*_FILE` target. Secret-shaped names are emitted as name + type with the value
  replaced.
- **Gate.** `98_redaction_audit.py` scans the whole pack for credentials, JWTs, PEM
  blocks, DSNs with userinfo, cloud keys, emails and public IPs, and **exits non-zero**
  on any finding. Current result: **PASS**, 70 files, 0 findings.

Read-only commands used: `git rev-parse/status/describe`, `docker ps`,
`docker image ls --digests`, `docker stats --no-stream`, `curl -X GET`,
`psql -c SELECT`, `redis-cli XLEN|XINFO|INFO`, and file reads.

Never used: `docker inspect`, `docker compose config`, `env`/`printenv`, any
POST/PUT/PATCH/DELETE, any CLI apply/reset/reconcile/close/order command, any
INSERT/UPDATE/DELETE/DDL, any Redis write or trim, any container restart.

## 6. Status

`P0_INFORMATION_COMPLETE` for §7.1–7.9, 7.11, 7.12, 7.14 at `CONFIRMED_RUNTIME` or
`CONFIRMED_SOURCE` with per-claim evidence. §7.10 (workload) and §7.13 (observability)
remain `PARTIAL`/`ESTIMATE` — measuring throughput would require load on a live trading
runtime, which is out of scope.

Five owner decisions remain open; none block Portal design work, all block Portal
integration. See [`../CONNECTOR-CONTRACT.md`](../CONNECTOR-CONTRACT.md) §10–11.

## 7. Second pass (2026-08-21, later) — closing the codegen gaps

Owner confirmed the trading_system and data_layer endpoint contracts are settled, so a
follow-up pass closed the three gaps found in the self-audit of the first pass.

| Gap found in self-audit | Before | After | How |
|---|---|---|---|
| Request body unresolved for 19 mutations | 29/48 (60%) | **46/48 (96%)** — remaining 2 verified to take no body | new `25_request_contracts.py` follows handler → repository payload access, → Pydantic model (inline, via-callee, and inline-arg forms) |
| 21 operations with no response evidence | 83/104 | **104/104 (100%)** | `80_response_shapes.py` extended with composed dict-literal returns, tuple returns from `engine.*`, `services/replay` queries, and 4 explicitly hand-verified annotations |
| Serialization semantics absent entirely | not documented | **630 fields typed** | new `35_serialization.py` |
| Reason code → endpoint unmapped | 0 | **40 codes → 37 endpoints** | `60_error_catalog.py` attributes call sites to handler line ranges |
| data_layer contract absent | — | **40 operations** | new `45_data_layer.py` |

### Findings from the second pass

| ID | Finding | Why it matters |
|---|---|---|
| TS-GAP-015 | `_jsonable()` is copy-pasted at 13 sites and the copies diverge — only `event_store.py` stringifies `UUID`; 7 other copies do not | uuid-typed fields may arrive quoted or unquoted depending on which repository served the request |
| TS-GAP-016 | `REPLAY_V2_ENABLED=false` → `POST/GET /v1/admin/replay/jobs*` and `quantbt-diff` return `503 replay v2 is disabled` | Paper Exit Review and Incident Detail lose the job API; `order-lifecycle` and `compare` still work |
| — | **63 `numeric` columns arrive as JSON strings** (`_jsonable` calls `str()` on `Decimal`) | the single most likely cause of a first-integration failure; now fully tabulated |
| — | `timestamp without time zone` columns serialize with **no offset** | a connector assuming UTC will silently shift them |
| — | data_layer's OpenAPI declares 17 operations with query params, 4 with request bodies and typed schemas | it **is** codegen-ready — the opposite of the trading_system gateway |
| — | data_layer has no `securitySchemes` and no auth dependency in its route modules; bound to `127.0.0.1:8100` | unauthenticated; the Portal edge must terminate auth |

### Honesty note on the four hand-verified endpoints

`POST /v1/admin/replay/jobs`, `GET /v1/admin/replay/jobs/{replay_id}`,
`POST /v1/admin/replay/jobs/{replay_id}/run` and `POST /v1/admin/replay/quantbt-diff`
resolve through a factory whose repository writes with `RETURNING *`, which the SQL
parser cannot turn into a field list. Rather than over-fit the extractor, they are
annotated by hand in `80_response_shapes.py` with a source citation and flagged
`hand_verified: true` in the output. They are the only non-machine-derived rows in
`response-shapes.json`.

## 8. Pre-handoff correction sweep (2026-08-21)

Phase A–E artifacts sit at the **top level** of the pack, outside `reports/` where the
superseded banner lives, so a Portal engineer opening them directly would have been
misled. Seven were corrected in place:

| File | Was | Now |
|---|---|---|
| `auth-contract.md` | verify chain described as if it always runs | ⚠ section: `X-API-Key` is optional (TS-GAP-008), with the source excerpt and the loopback mitigation |
| `workload-profile.md` | "retention policy 1d" | real `drop_after` 90 / 730 days; `orders`/`fills`/`domain_events` have none |
| `runtime-inventory.md` | `v1.2.0-9081397`, command_journal inactive | drift banner: `sha-8b88daa61e3`, command_journal **running** but `ROLLOUT=OFF` with 430 `DEAD` rows |
| `event-catalog.yaml` | `copy:events:v1` as a live transport, 12 facts | `RETIRED_BY_DESIGN` (owner-confirmed) + note that runtime has exactly one event type |
| `query-samples/*.json` (4) | unlabelled | `_provenance.kind: SYNTHETIC_EXAMPLE` + pointer to the authoritative extract |
| `event-samples/*.json` (5) | unlabelled | same, plus a note that the illustrated fact may have zero runtime instances |
| `capabilities.sanitized.json` | 2026-08-20 shape (`capabilities_summary`) | re-captured live; shape changed to `capabilities` |

`TS-GAP-002` was reframed in `CONNECTOR-CONTRACT.md` from a gap to an intentional end
state. The copy-event pipeline being empty is correct, not unfinished — treating it as a
blocker would have had the Portal team waiting on a stream that will never carry data.
