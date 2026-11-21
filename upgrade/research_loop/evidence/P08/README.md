# P08 evidence — immutable data snapshots, effective spec and preflight

Status: `BACKEND_AND_TYPED_CONTRACT_COMPLETE; COMPONENT_FIXTURE_BROWSER_RECEIPT_COMPLETE; PRODUCT_ROUTE_AND_P10_WORKER_PENDING_BY_PHASE_OWNER` — 2026-09-20.

P08 implements a narrow, same-origin Research preflight authority. It reads
only the already-approved Historical Market Data (HMD) adapter through a fixed
private Portal API route, seals one shared content-addressed snapshot, derives
the effective specification and fold topology, then persists only bounded
manifest metadata behind an actor-scoped opaque token.

It does **not** submit a QuantBT run, execute an imported Alpha, start a
worker, evaluate a holdout, expose candles/Parquet/source paths to the browser,
activate a Data Catalog UI, change Execution Loop, deploy a service or access a
database outside the existing Portal boundary.

Read this packet in order:

1. [phase-report.md](./phase-report.md) — delivered authority and exact phase
   boundary.
2. [test-results.json](./test-results.json) — commands, counts, P08 test map
   and truthful non-run gates.
3. [acceptance-lanes.json](./acceptance-lanes.json) — separate Delta,
   direct/Portal, persistence/API and UI/browser evidence states.
4. [frontend-handoff-claude.md](./frontend-handoff-claude.md) — generated,
   typed Screen 02/05 consumer contract. Claude owns HIFI composition and
   browser/dev receipt; no UI was changed in P08 backend.
5. [changes.json](./changes.json), [resource-cleanup.json](./resource-cleanup.json),
   [rollback.md](./rollback.md) and [debt-register.json](./debt-register.json).
6. [frontend-hifi-browser-audit.md](./frontend-hifi-browser-audit.md) —
   browser/HIFI reconciliation across the P03–P08 composition slices; it
   distinguishes fixture proof from product-route acceptance.

This packet is secret-free. Raw HMD frames, Parquet bytes, source credentials,
cookies, snapshots, traces and screenshots do not belong in Git evidence.

An opaque `dss_…` reference in this packet is provenance metadata, not a data
read capability: legacy generic Data Catalog list/quality/series routes hide
the P08 Research snapshot family and return `404` before opening its frame.
