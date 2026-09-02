# Phase 3 — Rich UI integration, product acceptance and dev release closeout

Date: 2026-09-02  
Branch: `feat/execution-data-activation`  
Implementation decision: `RICH_UI_BFF_INTEGRATION_ACCEPTED /
DEV_RELEASE_CANDIDATE / OWNER_UI_REVIEW_READY`  
Product decision: `PRODUCT_GO_PENDING_BOBBY_UI_REVIEW /
PROTECTED_MAIN_PROMOTION_NOT_AUTHORIZED`

## 1. Delivered boundary

Phase 3 binds Claude's reviewed rich Execution Loop composition to the
same-origin Portal BFF delivered in Phases 1 and 2. It does not replace a rich
screen with a generic envelope when a branch is empty, partial, stale, denied
or unavailable. Fixture producers remain confined to the explicitly routed
Fixture Lab and the controlled browser double.

```text
browser rich screen
  -> same-origin /api/v1/execution/*
  -> authenticated TypeScript Screen BFF
  -> bounded SGP PostgreSQL projection / governance repositories
  -> Rust Execution Edge only on the independently admitted source path
```

No browser route calls AWS-HK, Trading System, the Edge, PostgreSQL or a
fixture producer directly. Source mutation and Live mutation remain false.

## 2. Screen integration matrix

| Product surface | Canonical consumer and Phase 3 behavior |
|---|---|
| Command Center, Operations Queue, Incident Detail | Existing governance/operations BFF; reviewed composition retained and cross-screen links remain active. |
| Approval Inbox, R1, R2, Live Review, Waivers, Exit Review | Existing repository-backed governance contracts; server verdict and refusal remain authoritative. |
| Paper Overview | `GET /screens/paper`; real deployments, balances, sessions, positions and freshness populate the rich stage overview. |
| Paper Workbench and VNM Workbench | `GET /screens/paper/{deployment}`; source fields map to real orders, fills, positions, sessions, accounting and lineage without client-side financial derivation. |
| Sandbox Overview and Certification | `GET /profiles/sandbox` and certification BFF; real sparse source truth stays inside the approved layout. |
| Live Overview, Canary and Live Full | `GET /profiles/live` plus governance contracts; valid empty populations render as empty panels rather than generic unavailable screens. |
| Full Blotter | `GET /screens/blotter`; server status buckets, exact total, filtered total, aggregates and bidirectional opaque cursors drive the rich table. |
| Alpha Fleet and Alpha 360 | Fleet v2 is the current-source spine; analytics remains additive and cannot erase identity/deployment panels when unavailable. |
| Portfolio 360 | Portfolio query/analytics BFF populates supported panels; missing series remain panel-local typed states. |
| Accounts & Bindings and Account/Broker 360 | List/detail BFF plus canonical Account 360 profile; exact balance, margin, exposure-headroom, sync and reconciliation facts are preserved as strings. |
| Admin Action Drawer | Server task catalogue is authoritative. Only four `CONNECTED` local R0 reads render a run control and every receipt proves `source_request_sent=false`. |

The canonical catalogue remains 23/23 `AVAILABLE`. Availability means a
screen contract exists; it never fabricates a missing branch or source row.

## 3. Realtime and interaction discipline

- every profile screen performs one authenticated same-origin snapshot before
  opening EventSource;
- that realtime handshake is cursor/provenance-only and bounded below 2 KiB;
  the rich screen data remains in its canonical Screen BFF response, so a
  page mount never downloads the complete hot projection twice;
- native EventSource retry is disabled by `close()` on transport failure,
  session expiry, malformed frames and ordinary terminal frames;
- an epoch/sequence/projection gap receives at most one delayed resnapshot;
  a repeated gap closes permanently until an explicit page lifecycle restarts;
- snapshot/delta refreshes the existing rich panel tree; heartbeat does not
  trigger a full data reread;
- the structural browser sweep reloads each control in isolation and records
  property state as well as visible DOM state, so select/input interactions
  cannot be mislabeled or hidden as no-ops.

## 4. Contract and backend amendments

- Paper blotter accepts only the canonical order-status vocabulary and four
  server-owned status buckets;
- the cursor fingerprint includes the selected bucket, preventing a cursor
  from being replayed into another filtered query;
- `projected_total_items`, `filtered_total_items`, window aggregates and the
  previous cursor survive Manager decoding through the BFF contract;
- Account/Broker 360 has a canonical valid ready fixture and structured
  scalar/object branches in schema, OpenAPI and generated TypeScript;
- the N29 Rust product-acceptance authority now matches the already accepted
  23 available screen roots and 35 digest-bound evidence entries. The nine
  external capability gaps remain branch-local and non-release-blocking.
- the N21 shared-read follower performs a final cache read after observing a
  completed PostgreSQL flight, closing the commit-between-two-reads race that
  could otherwise return a false cache miss under a source-read stampede.

## 5. Verification evidence

| Gate | Result |
|---|---|
| Frontend production build | PASS |
| Frontend Vitest | 95 files, 1,803 passed, one deliberate inverse skip, zero failures and zero React/DOM warnings |
| Entry bundle budget | PASS; eager entry graph below 140 KiB gzip and ECharts absent from first-paint graph |
| Frontend production dependency audit | 0 vulnerabilities |
| Control API | 31 suites, 281 tests, fresh PostgreSQL migration and dump/restore parity PASS |
| Contracts | 115 tests, schema/OpenAPI/generated-type parity PASS |
| Contracts dependency audit | 0 vulnerabilities after moving the test runner to Vitest 4.1.11 |
| Control API production dependency audit | 0 vulnerabilities |
| Structural browser interaction gate | PASS; 17 product routes, every enabled control produces navigation, state, surface or announcement |
| N29 fail-closed product authority | PASS; 96 relations, 31 requests, 27 reads, 9 commands, 23 screen roots, zero unnamed debt |
| Git whitespace/patch integrity | PASS |

The checked-in visual baselines changed only where real BFF shape changed:
Paper, VNM, Alpha 360/Fleet, Blotter, Account 360 and Admin Action Drawer.
They were generated once and then verified by a clean non-update run.

## 6. Security, rollback and release authority

Independent rollback switches remain:

1. disable `CONTROL_API_FEATURE_EXECUTION_LOCAL_R0_TASKS` to remove the four
   local read controls;
2. disable the realtime feature to return profile screens to bounded snapshot
   reads without changing their layout;
3. disable local projection reads or an individual Paper/Sandbox/Live profile
   without enabling direct source read-through;
4. redeploy the preceding content-addressed dev images while retaining
   projection journal, governance, operation and audit evidence;
5. keep `FEATURE_EXECUTION_COMMAND_RELAY=false` and Live mutation false.

No Phase 3 in-scope Portal technical debt remains. The one remaining action is
an owner product decision, not engineering debt: Bobby must inspect the rebuilt
dev Portal and record Product GO or concrete screen findings. Only after that
review may this feature be merged through protected `dev` and proposed to
protected `main`; only the `main` workflow may create signed images, SBOM and
provenance. Stable remains untouched by this phase.

## 7. Dev runtime materialization

The accepted source commits are `c542cf9` (rich UI/BFF integration),
`4472d3e` (bounded realtime handshake) and `fe40f0b` (shared-flight race
closeout). The dev-only Compose stack was rebuilt from
`/home/bobby/portal-dev` with the current-source, manager-realtime and
local-projection overlays:

- Portal web image: `sha256:1cbc121d21927dda500039d1dc0176f36c5aff96b46e7dfa921389a556bd1bff`;
- Control API image: `sha256:651c1909654d7a12c2fa4088633347ce12d46667d94690eeff541e0d67d74de6`;
- both dev containers reported `healthy`;
- `/`, `/execution` and `/api/control/readyz` returned HTTP 200 on loopback;
- `https://dev-portal.primusspark.com/` and
  `https://dev-portal.primusspark.com/execution` returned HTTP 200.

An ephemeral Bobby dev session was created for loopback-only verification and
deleted immediately afterwards (`temporary_sessions_remaining=0`). The
authenticated response matrix returned HTTP 200 for Fleet, Paper, Sandbox,
Live, Blotter, Bindings, command tasks and Paper realtime snapshot. The final
realtime snapshot was 784 bytes, declared
`portal.execution.profile-realtime.v1`, carried `CURSOR_ONLY`, and contained no
projection document.

The stable `v1.0.1` containers were not recreated: their web and Control API
container/image identities remained respectively `938a745`/`8bf2dbd` and
`aedc7f0`/`ee6bb8d`, with Compose working directory
`/home/bobby/portal-stable-v1.0.1`.

The source-owned `manager.performance:portfolio_equity_snapshots` relation is
still truthfully represented as `MANAGER_V2_SOURCE_CONTRACT_REJECTED`; it is a
panel-local external capability state already recorded by Phase 1, not hidden
Portal technical debt and not a reason to erase any rich product screen.
