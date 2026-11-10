# Edge to Control API consumer gap analysis (Package B2, STEP 1), 2026-11-10

Scope: read-only analysis of what the Edge publishes, what `apps/control-api` already consumes,
what the frontend needs, and the gap. Baseline: worktree at `3b0b3b291`. Author: Claude (backend role
granted by Bobby for Package B2). No network access, credential, deploy or Edge mutation was used.

Evidence rules: Edge facts come from `services/portal-execution-edge-rs` (router at
`crates/edge-service/src/main.rs:1137-1207`, contracts under `contracts/`) and the ELP2-10 notes
(`EDGE_CORE_READY_TO_CONSUME_2026-10-28.md`, `CORE_TO_EDGE_C2_*` of 4-6 Nov, `EDGE_RESEARCH_READER_*`).
Control API facts are `file:line` at the baseline. "Source-dark" means no live source is bound.

## 0. How "in flight by Codex" was determined (and its limit)

The sandbox refused `git status` against `/home/bobby/portal-research` (worktree-isolation guard), so the
in-flight set below was derived by comparing file lists against the baseline, not from `git status`.
It therefore includes Codex's committed work since `3b0b3b291` as well as uncommitted work. Treat it as a
superset. Files that differ from baseline in the Codex tree:

- `apps/control-api/src/app.module.ts`, `main.ts`
- `execution-v2/access.service.ts`, `manager-model.contract.ts` (not in the brief's list, also differs)
- `execution-v2/command-source-assertion.ts`, `command-source-assertion-transport.ts`
- `execution-v2/command-status-composition.ts`, `command-status-preparations.ts` (+ new `command-status-ack-census.ts`)
- `execution-v2/current-human-candidate.ts|.sql`, `current-human-recovery-client.ts`, `current-human-transport.ts` (+ new `current-human-drain-counts.ts`)
- `execution-v2/financial-source-assertion.ts`, `financial-source-assertion-transport.ts`, `financial-source-composition.ts`
- about 70 new `execution-v2/c2-*` and `restore-*` files (C2 custody, P5/P7/P8, delivery, checkpoint)
- `scripts/research-udb/*`, new `scripts/test-elp2-*-pg.sh`, `UNIFIED_IMPLEMENTATION_PLAN.md`
- about 60 new ELP2-10 notes up to 2026-11-06

Nothing in this task touches any of those files.

## 1. What Codex says is next (C2 notes, 4-6 Nov)

- State: **A2 NOT_READY, B2 NOT_SIGNED, no connected acceptance** (`CORE_TO_EDGE_C2_A2_OVERDUE_STATUS_20261106`).
- Owner decision 2026-11-05: on revoke stop fresh issue/ENTER at once; allow only authenticated RESOLVE of the
  same retained lease/attempt; keep Core's global authority revision for now (`CORE_TO_EDGE_C2_AUTHORITY_AND_RECOVERY_20261105`).
- Static trust partial: human issuer/audience NOT_SELECTED, JWKS candidate and proposed origin `:28444` not installed,
  genuine P7 delegation NOT_AVAILABLE (`CORE_TO_EDGE_C2_STATIC_TRUST_PARTIAL_20261105`).
- Research DB observation: schema present, no matching acceptance/delegation record (`..._RESEARCH_DB_OBSERVATION_20261105`).
- Open: P1-P6/O-1..O-4 installs, P7 owner-auth + signer custody, P8/B2 signing, STATUS/recovery fencing, connected READ/STREAM.
- Research reader: reader installed by Core, mapping ACTIVE, zero Paper heads/receipts, binding expired
  `2026-10-28T09:30Z`, Research certificates expired `2026-10-23` (`EDGE_RESEARCH_READER_OWNER_RETURN_2026-10-27`).

## 2. Interface matrix

Gap classes: **A** missing consumer; **B** consumer exists, not composed; **C** composed but dark (flag/ref off);
**D** blocked on owner decision / credential / trust; **E** in flight by Codex; **F** no Edge publication (source gap).

| # | Interface | Edge publishes | Control API consumes (file:line) | Frontend needs | Gap |
|---|---|---|---|---|---|
| 1 | QUERY current-source screens (N15B/N13B) | `GET /internal/v1/current-source/screens/:screen_id` and `/sources/:s/relations/:r` (main.rs:1142-1150). Delegated RS256 JWT + mTLS, resource `execution:current-source:<SCREEN>:read`. Live only for N15B Paper/`PAPER_TRADING_SCREEN` | `execution/current-source.proxy.ts:1872` (path), `:710` class, composed `app.module.ts:812` | Paper/Sandbox/Live profile reads (`ports.ts:374` getScreenProfile) | **C**: flags `FEATURE_EXECUTION_CURRENT_SOURCE_*` default false (`config.ts:266-271`) |
| 2 | QUERY Manager-v2 capabilities and public relations | `GET /internal/v2/manager/capabilities`, `/relations/:schema/:relation` (main.rs:1146) | capabilities `current-source.proxy.ts:1793`; relations `public` only `:1553,:1829,:1944` | `getManagerRelationPage` `ports.ts:448`, series `:455`, dataset `:466`, lists `:476-480` | **C** (dark) for `public`; non-`public` schemas deliberately not consumed |
| 3 | QUERY Manager-v2 **catalogue** | `GET /internal/v2/manager/catalogue` (main.rs:1141), envelope `ManagerEnvelope<CatalogSnapshot>`, owner contract `manager-v2-paper-read-v1` | **none** | Relation/column vocabulary for field authority and census (FE-005/012/025 "Not published") | **A** (built in STEP 2) |
| 4 | QUERY Manager-v2 **named projections** | `GET /internal/v2/manager/projections/:kind`, kinds `portfolio, account, order, fill, position, reconciliation, command_journal` (main.rs:1142-1145; qualified at TS owner loopback, `owner-runtime-overlay/qualification-result.json`: 7 projection checks) | **none** | FE-052 blotter order/fill grain, FE-067 reconciliation verdict + unknown orders, FE-072 typed positions/orders/ack latency, FE-032 command journal | **A** (built in STEP 2) |
| 5 | QUERY compatibility snapshot | `GET /internal/v1/compatibility`, `CapabilitySnapshot` (main.rs:1216; `execution-contracts/src/lib.rs:281`) | **none** | Source/capability health (`ports.ts:769` getSourceHealthRead) | **A**; no JSON schema in `contracts/`, only Rust types; not built (no stable published schema to check against) |
| 6 | QUERY market latest/candles (EDS-11R) | `GET /internal/v2/manager/market/{latest,candles}` (main.rs:1157-1166) | `execution/market-context.registry.ts:105,125`, `market-candles.service.ts:156,190`, `current-source.proxy.ts:1479` | `ports.ts:435` getMarketCandles, `:444` getMarketContextCandles | **C**: `FEATURE_EXECUTION_MARKET_CONTEXT`, `..._PUBLIC_MARKET_CANDLES` off |
| 7 | QUERY analytics screens (N25/N22) | POST/GET `/internal/v1/screens/*`, `/query-analytics/:kind/:id` (main.rs:1174-1208) | `execution/analytics.proxy.ts:46,210-286`, composed `app.module.ts:807` | `ports.ts:101,106` insight/capital-preview inputs, drift/equity reads | **C**: `FEATURE_EXECUTION_ANALYTICS_QUERY`, `..._SHADOW_QUERY` off |
| 8 | EVENT realtime (N26, `/internal/v1/realtime/*`) | `GET /internal/v1/realtime/snapshot`, `/stream` (SSE), needs activation evidence + projection PG | `execution/realtime.proxy.ts:159,213`, composed `app.module.ts:802` | Live tick/stream, `sse.ts` | **C** + **D**: `FEATURE_EXECUTION_REALTIME_SSE` off; Edge README: projection PostgreSQL placement needs owner approval |
| 9 | COMMAND (N12/N16B relay) | No HTTP route in `private_router`; `command-relay` crate is library-only, N16B accepts only `live.emergency-close` | `config.ts:673` throws if `FEATURE_EXECUTION_COMMAND_RELAY=true`; `execution-v2/edge-command-adapter.ts` ("no default gateway or AppModule registration"), `edge-command-gateway-binding.ts` | `ports.ts:714` planCommand (blocked plan only) | **B** + **D** + hard limit: relay stays off |
| 10 | ARTIFACT (N15A) | Pure reference validation in `intercell-gateway`; no route | none | none yet | typed absent by design; no work |
| 11 | Research reader / membership discovery (E1) | PM observe() reader installed; Edge route `POST /internal/elp210/current-human/membership-discovery(-v2)` (`EDGE_CORE_READY_TO_CONSUME` s2) | `execution-v2/research-membership-discovery-client.ts:84` (route `:107`), `-runtime.ts:58`, `existing-identity-mapping-client.ts:68`, CLI `cli/execution-research-membership-discovery.ts` | Identity precondition for all native reads | **B** (CLI only, not in app) + **D**: binding expired, certs expired, zero Paper heads |
| 12 | Native business read (ROOT/CURRENT/STREAM, E2) | `/internal/elp210/business-root-read/*`, `/native-relations/*`, `/native-current-relations/*`, `/internal/v2/scoped/*` | `native-business-read-client.ts:72`, `native-root-source-client.ts:72`, `native-current-relations-source-client.ts:72`, `current-view-edge-client.ts:98`; composed via `native-core-composition.ts:112`, `main.ts:23-59` behind private runtime reference files | accounts/manager lists/retained financial (`ports.ts:476-482`) | **C** (absent reference = off) + **D**: no originals/READ/STREAM authority commissioned |
| 13 | Financial source (E3) | PM carrier `POST /internal/pma11-candidate/publication/{snapshot,page,delta}`; Edge `core-financial-*` | `execution-v2/financial-source-*.ts`, `app.module.ts:269-270`, `main.ts:10-11` | FE-005/013/017/032 capital statements, `ports.ts:425,431` | **E** in flight; **D**: carrier `AS_PUBLISHED_NOT_CURRENT/PARTIAL`, S6A budget not populated |
| 14 | Command status (E4) | `/internal/elp210/core-command/{original,status}`, assertion/complete callback | `edge-command-status-transport.ts:30`, `command-status-*.ts` (`app.module.ts:552`), `command-source-assertion-transport.ts:66` | FE-032 receipt state | **E** in flight; **D**: no commissioned original; PM service-recovery transport not published |
| 15 | current-human / C2 | `/internal/elp210/current-human/{enter,resolve,recover,mapping,identity}` | `current-human-transport.ts:70`, `current-human-recovery-client.ts:37`, `-mutations.ts`, `-schema.ts` | Any command SUBMIT, step-up | **E** (C2 files) + **D**: A2 NOT_READY, B2 unsigned |
| 16 | VN calendar (E5) | No qualified provider | typed absence only | FE-070 session chip | **F** source gap (DL/TS owner) |

## 3. Frontend "Not published" gaps vs Edge publication

FE-066, 068, 069 are Portal/Core-local (no Edge dependency): Claude/Codex can do them without new Edge routes.
FE-052/067/072/032 are the ones an Edge route can feed: rows 3-4 above (projections, catalogue) are the only
published-but-unconsumed Manager surface. FE-070 (calendar), FE-071 (canary envelope), FE-021 (audit journal) have no
Edge publication: owner action on TS/DL. FE-042/043/040 are Claude's B1/B2 (not Edge).

## 4. Ranked gap table (value to FE x what unblocks it)

| Rank | Gap | Class | Blocker / owner | Unblocks |
|---|---|---|---|---|
| 1 | Research reader binding + fresh Research trust (rows 11-12) | D | Bobby/PM owner: new binding, new certs, Paper heads | every native read, FE accounts/lists live |
| 2 | C2 A2/B2 authority (row 15) | E+D | Codex; owner-auth P7, signer custody | any command SUBMIT, step-up, STATUS |
| 3 | Command STATUS original (row 14) | E+D | Codex; commissioned original; PM recovery transport | FE-032 receipt state |
| 4 | Financial source carrier (row 13) | E+D | Codex; PM S6A budget, trust | FE-005/013/017 capital figures |
| 5 | Manager named projections consumer (row 4) | A | none: **built STEP 2**; compose needs Codex's `app.module.ts`/`main.ts` + a field-authority decision | FE-052/067/072 |
| 6 | Manager catalogue consumer (row 3) | A | none: **built STEP 2**; same compose note | field authority census |
| 7 | Realtime SSE activation (row 8) | C+D | Bobby: projection PG placement; flag stays off | live tick |
| 8 | VN calendar provider (row 16) | F | DL/TS owner | FE-070 |
| 9 | Compatibility snapshot consumer (row 5) | A | needs a published JSON schema from Edge owner | source health |
| 10 | Command relay (row 9) | B+D | hard limit: off; C2 first | never in B2 |

## 5. Wire drift: openapi vs Edge runtime (exact request for the Edge/Codex owner)

The imported owner openapi (`contracts/manager-v2-paper-read-v1/manager-v2.openapi.json`) is the source-dark v1
contract; the Edge decodes and re-serialises the runtime overlay (`owner-runtime-overlay/manager-v2-runtime-qualification.json`,
`crates/manager-v2-contract/src/lib.rs`). The consumer must mirror the runtime. Differences found:

1. `contract_version`: openapi const `trading-system.portal-execution.manager-v2.v1`; Edge emits and checks
   `...manager-v2.runtime.v1` (`RUNTIME_CONTRACT_REVISION`, lib.rs:1213).
2. `ManagerRecord.record_key`: absent in openapi, **required** at runtime (lib.rs:1424) and serialised by the Edge (lib.rs:733).
3. `KeyDescriptor.status`: openapi `PRIMARY_KEY|UNIQUE_INDEX|PENDING_QUERY_KEY`; runtime enum adds
   `EXPRESSION_UNIQUE_INDEX`, `VIEW_SOURCE_COMPOSITE` (lib.rs:329) and the Edge rejects any catalogue whose
   `query_status` is not `QUALIFIED_TS_OC_03D1` (lib.rs:1313), so `PENDING_QUERY_KEY` cannot reach a consumer.
4. `ManagerUnavailable.reason_code`: openapi closed enum of 7; runtime accepts any `^[A-Z][A-Z0-9_]{0,127}$`
   (lib.rs:1643) and the Rust tests use `SOURCE_UNAVAILABLE`, which is not in the enum.
5. `ProfileId`: openapi const `PAPER_BINANCE_USDM`; runtime accepts any `[A-Z0-9_]{3,128}` bound to the deployment profile (lib.rs:1511).
6. Edge-originated problem body `{"error":{"code","message"}}` and its closed code/status set (main.rs:2313-2535) is in neither document.
   The 503 `ManagerUnavailable` body is the only documented non-200.

**Request to Edge/Codex owner:** publish a runtime-level machine-readable schema (generated from the Rust DTOs) covering items
1-6, plus a golden projection response fixture (the pack has only a catalogue fixture); until then the Control API pins the
runtime shape in `edge-manager-read-contract.ts` and a spec cross-checks it against both documents and fails on drift.

## 6. STEP 2 result

See section 7.

## 7. STEP 2: what was built (rows 3 and 4)

New files (nothing Codex edits was touched; no `app.module.ts`/`main.ts` change):

- `apps/control-api/src/execution-v2/edge-manager-read-contract.ts`: strict zod mirror of the Edge's runtime Manager envelope
  (catalogue, projection, typed unavailable, Edge problem body with its closed code->status table). Pure module.
- `apps/control-api/src/execution-v2/edge-manager-read-client.ts`: source-dark client. Branded bootstrap only
  (`edgeManagerReadBootstrap()`), injected `token_provider` (no key, no signer here), exact leaf-pin mTLS TLS1.3 GET, one fresh
  connection per call, nothing written before the pin check, no retry/redirect/log. Deny-all: no grant = typed `DENIED` and no
  network; unconfigured = `EDGE_MANAGER_READ_ABSENT` (typed `ABSENT`). `record_key` is never exposed; cells removed by the grant
  are counted (`withheld_field_cells`).
- `apps/control-api/test/edge-manager-read-client.spec.ts`: 59 tests, all passing. Cross-checks the mirror against the owner
  openapi and runtime overlay in the Edge pack (enums, patterns, documented drift, the pack's own fixtures refused unless the
  documented deltas are applied) and against `edge-service/src/main.rs` (every problem code present). Per Edge problem code a
  case over a real loopback TLS1.3/mTLS server (20 codes, plus wrong-status/unknown-code/widened body, bare 401/403, typed 503).
  Plus refusals: wrong pin, foreign CA, TLS1.2, missing client certificate, bad config (13 cases), bad kind/limit/cursor/token,
  wrong profile/version/kind/row count/digest pin, missing no-store, wrong media type, encoding, chunked, short body, redirect, BOM,
  oversize, BUSY, deadline, no secret in any error, and a source-purity guard (no env, no Nest decorator, not imported by app entries).
- `scripts/control-api-test.sh`: +8 lines, backward compatible: read-only mounts and env (`EDGE_MANAGER_V2_PACK`, `EDGE_SERVICE_MAIN`)
  so the spec runs in the Docker cell.

Rust check: `cargo test --offline -p manager-v2-contract` (scratch target dir) built in 26 s, 8/8 pass, confirming the runtime
constants the mirror pins (`RUNTIME_CONTRACT_REVISION`, `PROFILE_ID`, 200 rows, 1 MiB). No Rust file was changed.

Not built and why: row 5 (compatibility snapshot) has no published JSON schema (only Rust types); mirroring it from Rust source by
hand would not be "checked against a contract file". Needs the Edge-owner schema from section 5 first.

### Composition lines for whoever owns `app.module.ts`/`main.ts` (Codex in flight; not applied)

```ts
// app.module.ts
import { createEdgeManagerReadPort, type EdgeManagerReadBootstrap } from "./execution-v2/edge-manager-read-client";
export const EDGE_MANAGER_READ_PORT = Symbol("EDGE_MANAGER_READ_PORT");
// AppModuleOptions: edgeManagerRead?: EdgeManagerReadBootstrap;
// providers:
{ provide: EDGE_MANAGER_READ_PORT, useValue: createEdgeManagerReadPort(options.edgeManagerRead) },
```

`main.ts` passes `edgeManagerRead` only when an owner-prepared private reference exists (same shape as the command-status runtime reference),
built with `edgeManagerReadBootstrap({ origin, tls, edge_leaf_sha256, profile_id, deadline_ms, response_bytes, max_inflight,
token_provider: () => <mint resource "execution:manager-v2:read" with the existing ExecutionDelegationService>, grants })`.
No env flag may select it. Until that reference exists the port is `ABSENT`. Nothing consumes the port yet.

### Blocked, and on whom

- Field grants (which projection fields may leave): owner decision, linked to FE-026 researcher field policy and FE-052/067/072. Default stays deny-all.
- Runtime enablement: Edge Manager read-through requires a real Edge, installed trust, a delegated issuer and an accepted Paper profile (Core/Edge/Bobby; same trust window as rows 11-12). No network was attempted here.
- Wire drift request (section 5): Edge/Codex owner to publish the runtime schema and a projection golden fixture.
- Rows 11-15: Codex in flight (C2, command status, financial, current-human) and owner decisions as tabled.
- Command relay: remains off; `config.ts:673` still throws; nothing in this work composes any command path.
