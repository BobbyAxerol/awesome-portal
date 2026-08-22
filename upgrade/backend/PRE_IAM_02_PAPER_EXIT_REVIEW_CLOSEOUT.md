# PRE-IAM-02 — Paper Exit Review Backend Closeout

Date: 2026-08-22  
Branch: `feat/execution_loop`  
Status: `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE`  
Scope: Portal-owned Paper Exit governance on the SGP TypeScript control plane

## 1. Acceptance decision

The backend lane of Execution product Phase 5 is accepted on SGP. The Portal
now has a source-safe Paper Exit repository, deterministic server evaluation,
canonical read/plan/apply/poll APIs and immutable decision evidence.

This does not promote or activate a deployment. A successful `PROMOTE`
decision creates one Portal-owned `promotion_authority_grant` for
`SANDBOX_VALIDATION`; it sends no command to the Trading System, broker, AWS
Portal Edge or Source Proxy. A later separately authorized promotion operation
must consume that grant. Registry delivery remains `fixture` and every
execution source, SSE and command flag remains false.

## 2. Delivered boundary

### 2.1 PostgreSQL authority

Migration `1723680000004_governance-paper-exit` adds seven typed tables:

- review aggregate and immutable artifact/R1/R2/policy/evidence-pack lineage;
- four source-attributed evidence panels and immutable findings;
- idempotent decision plans and one immutable terminal decision per review;
- one immutable, scoped promotion-authority grant for an accepted review.

Lineage, panels, findings, decisions and grants reject update/delete. The
review aggregate may only advance its explicit state/version. Exact decimal
values stay strings from repository through JSON; no browser or TypeScript
number owns a financial calculation.

### 2.2 Deterministic evidence policy

The evaluator requires exactly the four Paper panels and the five lineage
kinds defined by the HiFi. Its fail-closed precedence is:

1. `UNAVAILABLE` for an unavailable/error source panel;
2. `STALE` for any stale source/freshness state;
3. `PARTIAL` for a missing panel, lineage, evidence link/hash or incomplete
   evidence manifest;
4. `UNMET` for a blocking failure;
5. `MET` only when none of the above applies.

`WATCH` is non-blocking. A non-blocking `INSUFFICIENT` finding is preserved and
carried to Sandbox Certification. Missing data is never converted to zero or a
pass. Required finding hashes must exist in the immutable approval evidence
manifest, and both evidence-manifest and full source-snapshot hashes are
verified before a detail or plan is served.

### 2.3 Canonical HTTP contract

- `GET /api/v1/execution/governance/exit-reviews/{review_id}`;
- `POST /api/v1/execution/commands/plans` with
  `command_type=GOVERNANCE_PAPER_EXIT_DECISION`;
- `POST /api/v1/execution/operations/{operation_id}/apply`;
- `GET /api/v1/execution/operations/{operation_id}`.

The detail publishes the canonical current lifecycle
`stage=PAPER_OBSERVATION`, `review_version`, actor eligibility, all source
lineage, panel-level authority/freshness/completeness, server verdict and a
preview-only activation plan. The mutation path is session/RBAC/Origin/CSRF
protected, evidence-bound, optimistic-concurrency checked and idempotent.
Plan blockers suppress the one-operation apply token.

The three decisions write distinct Portal states:

| Decision | Portal state | External side effect |
|---|---|---|
| `PROMOTE` | `PROMOTION_AUTHORIZED` + one available scoped grant | none |
| `EXTEND_OBSERVATION` | `EXTENDED`, exactly +14 days | none |
| `REJECT` | `REJECTED_TO_PAPER_HELD` | none |

Extend and reject remain available when evidence is unavailable/partial/stale,
because both are risk-reducing decisions. Promotion remains fail-closed.

## 3. Qualification evidence

### 3.1 Fresh PostgreSQL and application gate

Command: `sudo -n ./scripts/control-api-test.sh`

- a clean PostgreSQL 16 instance applied every migration including `0004`;
- the production TypeScript build passed;
- 14 test files and 129/129 tests passed;
- Paper Exit passed 12/12 focused cases, including an explicit source `ERROR`
  fail-closed case;
- the existing 182,000-row governance/keyset corpus still passed;
- missing/partial/stale/unavailable/error, exact decimal, WATCH/carry-forward,
  RBAC, SoD, CSRF, version conflict, duplicate request, tamper, append-only and
  decision/audit/outbox/grant cardinality paths are covered.

The successful promotion test proves exactly one decision, audit record,
outbox message and grant, and proves that no execution-command event is
created. Replayed plan/apply requests do not duplicate any of them.

### 3.2 Canonical contract gate

Command: `sudo -n ./scripts/contracts-test.sh`

- 20/20 schema and fixture tests passed;
- OpenAPI, strict JSON Schema, fixture and generated TypeScript declaration are
  synchronized;
- a contract-negative test requires the server gate verdict and lifecycle
  stage and rejects any activation plan requesting an external side effect;
- the contract snapshot was regenerated after the final Claude-driven stage
  addition.

The remaining Vite CJS deprecation warning is an offline tooling-hardening item
for `PRE-IAM-04`; it did not suppress or skip a test.

### 3.3 SGP runtime gate

Only `control-api` and its one-shot migrate/bootstrap dependencies were rebuilt.

- Compose migration ledger reports
  `1723680000004_governance-paper-exit` applied at 2026-08-22 15:40 UTC;
- all seven Paper Exit tables exist;
- `portal-control-api-1` and the existing public gateway are healthy;
- `GET /api/control/healthz` through `127.0.0.1:8080` returns `status=ok`;
- unauthenticated Paper Exit through nginx returns typed 401
  `SESSION_REQUIRED`, proving the route is public-gateway reachable and
  session fail-closed;
- startup logs show the detail and canonical plan/apply/poll routes mapped with
  no migration or application error.

No runtime review was seeded, no real source read was attempted and no
credential was printed. Temporary fresh-PG/contract containers were removed by
their test harnesses. The stable v1.0.1 stack was not rebuilt.

## 4. Claude handoff before Phase 5 product activation

Claude can complete the Phase 5 screen against the published contract while
Codex starts `PRE-IAM-03`. The frontend-owned items are:

1. keep the new LifecycleRail mapping and read canonical
   `review.stage=PAPER_OBSERVATION`;
2. read optimistic concurrency from `review.review_version`, not
   `approval_version` or `expected_version`;
3. map `partial`, `stale`, `unavailable` and `error` panel states separately;
4. use server `can_extend_observation` and `can_reject`; do not enable the safe
   buttons locally when eligibility is absent;
5. dispatch Paper Exit plans through the shared canonical `/commands/plans`
   route and the Paper Exit schema/decision vocabulary, then use canonical
   apply/poll routes;
6. add same-origin double-submit `x-portal-csrf` transport for every mutation;
7. render a successful approval as “promotion authority granted; deployment
   remains in Paper”, not as Sandbox activation.

No Claude-owned frontend file was changed by this backend closeout. The
concurrent stage/rail work was read and answered at the canonical contract.

## 5. Remaining work and exact next slice

`PRE-IAM-02` is complete only at `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE`.
These are intentionally still open:

- real Paper observations are not ingested from AWS-HK; runtime source profiles
  remain off;
- no operation consumes a promotion grant or activates Sandbox;
- the frontend handoff above is not yet integrated;
- cross-cell parity/load/soak/restore and D1–D4 owner evidence remain pending.

The next item in the canonical six-phase queue is `PRE-IAM-03`: a bounded,
dark Command Center snapshot API with per-panel authority/freshness and honest
empty/partial/stale/unavailable states, without SSE or source activation.

Claude's latest `BR-EX-28` request is also accepted into the request ledger:
Portal must receive a canonical command catalogue and five typed HTTP
capabilities, never generic Redis `get`/`scan`. It is a separate Phase 6
unblocker and must be reconciled when PRE-IAM-03 composes Command Center
dependencies; it does not reopen this Paper Exit acceptance.
