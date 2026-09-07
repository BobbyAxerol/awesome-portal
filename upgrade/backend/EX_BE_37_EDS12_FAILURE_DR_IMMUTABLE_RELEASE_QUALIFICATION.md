# EX-BE-37 — EDS-12 Failure/DR, product acceptance and immutable release qualification

Status: `STATIC_QUALIFICATION_READY / OFFLINE_DR_QUALIFIED /
DEPLOYED_EVIDENCE_PENDING`

Date: 2026-09-06

## Purpose

EDS-12 is the final release qualification layer for the already accepted
Execution Durable Streaming scope.  It does not widen source, query, SSE,
command or Live-mutation authority.  Instead it makes later promotion depend
on a small, versioned, sanitized evidence packet rather than undocumented
runtime flags.

## Delivered source artefacts

| Artefact | Responsibility |
|---|---|
| `contracts/eds12-release-qualification-v1/` | immutable profile, authority, source-extension and release-gate contract |
| `crates/eds12-qualification/` | pure Rust fail-closed authority for the committed contract |
| `scripts/execution-eds12-qualification.py` | static and sanitized deployed-evidence validator |
| `scripts/execution-eds12-qualification-test.sh` | repeatable static gate and optional isolated DR gate |
| `upgrade/execution-v1/PHASE_12_QUALIFICATION.md` | exact evidence ladder and release decision rule |
| `upgrade/execution-v1/OPERATIONS_RUNBOOK.md` | per-profile, read-only staging procedure |
| `upgrade/execution-v1/ROLLBACK_RUNBOOK.md` | profile-local reader containment and recovery procedure |

## Frozen authority and compatibility inputs

- P01/R4/R5 remains source-only at the verified integration head
  `integration/portal-r4r5-p01-final@98c47b3a66668b6082a60767cc94bfd2359a607f`;
  it is the portable-verification follow-up to integration record `1c5a7fa`.
  P01 base is `f9e3d94613b1b9421043ce38e9a778d243124c69`.
- Both activation templates must retain
  `TS_PORTAL_EVENT_LEDGER_LEASE_TTL_SECONDS=900`.
- The private Manager-v2 current-page routes, catalogue, scope, typed values
  and 48-hour cursor boundary remain unchanged.
- Commands and Live mutation are disabled.  Browser direct access to Manager,
  Source Proxy, Trading System DB, Redis, broker, CLI, mTLS material, delegated
  JWTs and opaque source cursors is forbidden.

## Claude request integration

The EDS-12 qualification explicitly carries both frontend-discovered requests:

| Request | Final truthful behavior until source evidence exists |
|---|---|
| BR-EX-80 — published alpha timeframe | preserve visibly `DERIVED` interval; a source-published vocabulary value wins only after contract proof |
| BR-EX-81 — full subject orders/fills | preserve current-page non-history disclosure; no alpha/account replay or funnel claim exceeds a verified relation/profile cursor drain and append-only mirror parity |

These are named external source evidence gates, not hidden Portal technical
debt.  A current bounded source page must never be relabelled full history.

## Evidence completed by this source slice

| Gate | Evidence | Result |
|---|---|---|
| Static contract and mutation | qualification package, manifest, Python mutation suite, pure Rust authority | `PASS` |
| N29 predecessor | `execution-n29-product-acceptance.py` | `PASS` |
| Offline DR | N17A disposable PostgreSQL PITR, encrypted logical restore, deterministic projection rebuild, rotation/rollback scenarios | `PASS` |
| Rust quality | `cargo fmt --check`, `cargo clippy -D warnings`, `cargo test -p eds12-qualification` in disposable Rust container | `PASS` |
| Workspace verifier portability | D4 credential-free scan fails closed with `rg` or portable `grep -E`; it no longer silently skips under the root Docker PATH | `PASS` |
| Runtime activation | no source request, deploy, DDL, profile activation, command or Live mutation was performed | `NOT_ATTEMPTED_BY_DESIGN` |

## Remaining release evidence (not a source-code debt)

`PRODUCT_ACTIVE` and `OPERATIONS_QUALIFIED` remain false until one sanitized
deployed-evidence packet proves all of the following against a protected-main
immutable release:

1. signed, digest-pinned images with SBOM and provenance;
2. all seven browser states for Paper, Sandbox, Canary-over-Live and Live;
3. all ten named failure/recovery paths, profile isolation and redaction;
4. zero P0/P1 integrity issues and owner visual/data/action parity;
5. accepted source contract/evidence for BR-EX-80 and BR-EX-81.

The verifier is intentionally unable to convert local or fixture evidence into
this release decision.  The next owner action is to merge the qualified change
through protected `main`, collect the workflow and deployed test evidence
outside Git, then run `verify-deployed` with the sanitized packet.
