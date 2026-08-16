# BAR-11 — Alpha Registry & Research Platform foundation

> **Version:** 0.1<br>
> **Status:** BAR-11 complete (registry + digest verification + read API)<br>
> **Updated:** 2026-08-16<br>
> **Unified phase:** U14 Alpha Registry, Import & Research Platform<br>
> **Guide authority:** v0.4 §9 Alpha Platform (draft alpha.yaml contract)

## 1. Goal and scope

BAR-11 registers immutable Alpha identity/artifact/certification metadata and
digest verification without turning the browser into an arbitrary Python
editor:

- `registry/alphas.v1.json` (+ `alpha-manifest.v1` schema, the §9.3 draft)
  registers the one concrete reference alpha `delta-rsi-polynomial` v1.0.0
  with the protected strategy package digest, family/endpoint/execution
  contracts, data requirements, manager-exposed parameters and lifecycle
  metadata (`RESEARCH`, `golden-parity-v1` certification, no promotion
  evidence yet).
- `services/alpha_registry.py`: fail-closed loader (unknown stage, bad
  digest format, duplicate version all reject composition), lifecycle order
  constants, quarantine gate (`quarantine_block`) and artifact verification
  comparing the registered digest against the protected strategy package.
- Read-only endpoints: `GET /api/v1/alphas`, `/{alpha_id}/versions/{version}`,
  `/{alpha_id}/versions/{version}/verify`; no mutation endpoint, public
  projection hides maintainers/lock digests/immutable-for-live lists.

Non-goals: quarantine ingest pipeline, hermetic build/scan, Alpha Pool UI,
Import Wizard, workbench and composer (later U14 slices and frontend).

## 2. Locked decisions

1. **The manifest is metadata, not code execution.** The browser never
   receives or runs arbitrary source; only registered manifests are exposed.
2. **Digest binds runs.** The artifact digest is computed over the protected
   strategy package sources and must match the registered value; drift
   fails verification (and would quarantine in the full ingest pipeline).
3. **Quarantine blocks everything** — new runs and promotions — even with a
   crafted request, until an audited un-quarantine transition.

## 3. Implementation evidence

- [x] Alpha registry with locked identity for `delta-rsi-polynomial`
  v1.0.0 (entrypoint `strategy.delta_rsi:DeltaRsiStrategyAdapter`, artifact
  digest `sha256:4117b870…9d18` matching the protected strategy package,
  `RESEARCH` stage, quarantine false).
- [x] Fail-closed loader matrix (invalid alpha_id, bad digest, unknown
  stage, duplicate version); unregistered alpha/version 404.
- [x] `quarantine_block` rejects quarantined alphas; clean alphas pass.
- [x] `verify_artifact` matches the registered digest and detects drift.
- [x] Read-only endpoints with safe public projection (405 mutation, 404
  unknown, no maintainer/lock/immutable leaks).
- [x] BE suite: `12` tests; full Portal backend regression `353 passed,
  1 skipped`; full Planning backend `18 passed`; contracts sync + M0 freeze
  + snapshots refreshed; workspace verification passes including the
  protected strategy hash. No change was pushed or deployed.

Technical debt and rollback:

- Quarantine ingest/build/scan pipeline, promotion state machine and Alpha
  Pool/Workbench UI are later U14 slices; the draft alpha.yaml stays
  replaceable by the owner's sample package contract.
- Rollback: revert the BAR-11 commits; run flows are unchanged.

## 4. Next slice

BAR-12 (U15): paper/sandbox/live execution foundations — separate execution
ledger, reconciliation contract and environment-scoped promotion gates,
without live keys in the prototype.
