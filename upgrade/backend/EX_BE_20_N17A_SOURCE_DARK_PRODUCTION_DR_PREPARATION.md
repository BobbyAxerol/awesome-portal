# N17A — Source-dark production/DR preparation

Status: `N17A_COMPLETE_SOURCE_DARK / N17B_JOINT_PRODUCTION_ACCEPTANCE_PENDING /
PRODUCTION_INACTIVE`

Date: 2026-08-27  
Owner: Portal backend  
External contact: none  
Public/runtime changes: none  
Trading System traffic: none  
Network attempts outside the isolated Docker network: `0`

## Goal and authority boundary

N17A closes the Portal-owned production-readiness foundation without activating
production. It supplies canonical provisional latency budgets, an unclaimed
error-budget model, restore/rebuild/rotation automation, capacity/retention/cost
boundaries, owner responsibilities and a complete isolated game-day corpus.

The phase does not bind a production datasource, Prometheus/Grafana instance,
backup scheduler, certificate, credential, origin, Cloudflare route, AWS-HK
source or Trading System capability. Its OpenAPI has zero paths and servers.
Every production/source/command flag remains false.

The v0.7 latency figures are interaction/qualification budgets, not production
availability guarantees. Availability target, error-budget burn, monthly cost
ceiling and production RPO/RTO remain null and owner-gated until N17B measures
the accepted exact profile.

## Delivered architecture

### Pure Rust readiness authority

`production-readiness` validates one source-dark profile containing:

- all seven provisional query/event/command-plan latency classes;
- an explicit `NOT_MEASURED` error-budget state;
- separate control DB, projection DB and object-evidence recovery policies;
- distinct mTLS read, mTLS command, delegated JWT, Portal session and
  projection-DB identity rotations;
- the locked 182,000-row, 100-SSE-client, 140-event/minute, 5,000-chart-point
  and 150-asset qualification boundaries;
- daily-7/weekly-4 backup-retention minimums and a null owner-gated cost cap.

The crate computes nearest-rank offline p95 without ever returning a production
SLO claim. Its evidence sealer requires the exact eight scenarios to pass in
isolation with no network/source/command attempt and rejects digest tampering
after serialization/restart.

It has no listener, HTTP client, cloud SDK, credential loader or Trading System
dependency.

### Canonical contract and frontend boundary

The strict JSON Schema and fixtures define:

- `ReadinessProfile`, provisional budgets and unmeasured error budget;
- recovery, rotation, capacity/retention/cost and owner gates;
- typed `QualificationResult` and `ReadinessEvidence`;
- eight fixture-only game-day cases: partition, auth loss, source loss,
  command containment, control DB PITR, projection rebuild, release rollback
  and credential compromise.

The component-only OpenAPI generates TypeScript for Claude but mounts no API.
Fixture success means only that the UI can render the future diagnostic states;
it is not real production evidence.

### Unmounted observability and operations blueprints

`deploy/execution-readiness/` contains:

- provisional SLO recording expressions and future alert rules;
- an unbound Grafana operator dashboard for authority, latency, projection,
  SSE, command, audit/outbox/DB and recovery evidence;
- capacity/retention/cost, rotation, owner matrix and quarterly game-day
  configurations;
- a hard authority-violation alert if source-dark flags ever widen.

Prometheus, Grafana, Compose, Nginx and Cloudflare do not load these files. The
dashboard datasource is `NOT_BOUND_N17A`; no production resource is created.

### Real isolated DR rehearsal

`execution-n17a-production-dr-test.sh` creates an internal-only Docker network
and exact N17A-owned PostgreSQL resources, then proves:

1. WAL archive and physical base backup recovery to a selected LSN;
2. the accepted pre-target row survives while the post-target row does not;
3. a custom-format control DB backup is encrypted with an ephemeral key,
   decrypted, SHA-256 checked and restored independently;
4. a projection is deterministically rebuilt from a sealed event corpus;
5. old/new temporary identity fingerprints are distinct, commands are
   contained first and the old identity is represented as revoked;
6. release rollback keeps source/command activation false;
7. all eight game-day scenarios seal into digest-verified offline evidence.

The harness removes plaintext backup, ephemeral key, containers, internal
network and volumes on both success and failure. It cannot address stable/dev,
AWS-HK or Trading System resources.

This is automation evidence, not a claim that production backup storage,
cross-zone copies or real RPO/RTO have passed.

## Contract and code inventory

- schema/fixtures: `packages/contracts/schemas/execution-production-readiness.v1.schema.json`
  and `packages/contracts/fixtures/execution-production-readiness.*.valid.json`;
- component OpenAPI/generated TypeScript:
  `packages/contracts/openapi/execution-production-readiness.openapi.json` and
  `packages/contracts/generated/execution-production-readiness.d.ts`;
- Rust authority: `services/portal-execution-edge-rs/crates/production-readiness`;
- unmounted operations blueprint: `deploy/execution-readiness/`;
- operator runbook: `deploy/runbooks/portal-n17a-source-dark-production-dr.md`;
- verifier/evidence collector: `scripts/execution-n17a-readiness.py`;
- verifier mutation tests: `scripts/test_execution_n17a_readiness.py`;
- isolated operational gate: `scripts/execution-n17a-production-dr-test.sh`.

## Verification evidence

- Rust profile/SLO/recovery/rotation/evidence/tamper tests: passed;
- strict Rust format and Clippy `-D warnings`: passed;
- JSON Schema fixtures and OpenAPI-to-TypeScript parity: passed;
- source-dark static/secrets/network/address gate: passed;
- real isolated WAL PITR target test: passed;
- encrypted logical backup/decrypt/checksum/restore: passed;
- deterministic projection rebuild: passed;
- distinct-identity rotation/compromise dry-run: passed;
- eight-scenario evidence seal and revalidation: passed;
- shared contract, Rust workspace, tracking and root verification regressions:
  passed.

Exact additive test counts remain in command output rather than being frozen in
this document.

## Rollback

N17A is additive and unmounted. Rollback removes the N17A schema, fixtures,
generated types, Rust crate, operations templates, verifier, harness and docs,
then regenerates Cargo/contracts metadata. No production data/runtime/network
rollback exists because the phase changed none.

An interrupted test cleanup may remove only resources prefixed
`portal-n17a-dr-test`; it must never remove a Portal dev/stable volume.

## A result and exact B next action

| Phase | Lane A result | Exact Lane B next action |
|---|---|---|
| N17 | provisional SLO/error-budget schema, unmounted dashboard/alerts, recovery/rotation/capacity/owner contracts, actual isolated WAL PITR + encrypted restore + projection rebuild + rollback/compromise and complete source-dark game-day evidence are complete | after N13B→N16B are accepted for one exact profile and owner window, bind the real dashboards/alerts/identities/encrypted backup schedule; run bounded production traffic and joint restore/rebuild/partition/auth/source/command-containment/rotation/rollback game day; record measured p50/p95/p99, error budgets, capacity, RPO/RTO and owner/SRE/Trading System evidence; require Bobby to sign the exact final acceptance record |

No Portal-owned A phase remains after N17A. Resume at **N13B** only when the
single master Trading System owner return is accepted, then progress in order
through N17B. Do not jump directly to production acceptance.
