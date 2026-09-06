# Trading System source-completeness campaign v1

**Status:** `READY_FOR_OWNER_IMPLEMENTATION / ONE_BRANCH_ONE_RETURN / PORTAL_RUNTIME_UNCHANGED`  
**Date:** 2026-09-06  
**Requested by:** Bobby / Portal  
**Implementation authority:** Trading System owner  
**Portal consumer authority:** Portal Execution Edge and Control API only after
independent receipt validation

## 1. Decision and authority order

The Portal has already exhausted the truthful current-page surface.  It can
serve current rows, retained ranges, Portal observations and explicitly
derived views today, but it cannot manufacture facts that the source did not
retain or publish.  In particular, a current order/fill row cannot become an
immutable lifecycle event, and a current mark cannot become a candle,
benchmark, broker-ack clock or valuation provenance record.

This document turns the visible `Soon · SOURCE_GAP_CONFIRMED` backlog into
**one finite Trading System implementation campaign**.  It is a delivery map,
not a third competing protocol request:

1. [`owner-request.v3.json`](../../services/portal-execution-edge-rs/contracts/n28-missing-capability-v1/owner-request.v3.json)
   remains normative for `MC-01` through `MC-09`.
2. [EDS-09 event-source implementation addendum](./EDS_09_TRADING_SYSTEM_EVENT_SOURCE_IMPLEMENTATION_REQUEST.md)
   remains normative for the three authoritative event classes and their
   frozen envelope/snapshot-tail semantics.
3. This campaign maps every one of the 18 EDS-08 source gaps, the overlapping
   N28 entries, implementation order and the **single final handoff**.  It
   creates no new browser API, raw database path, secret or runtime authority.

The Trading System should use one feature branch, one reviewed source release
and one sanitized return root.  Its implementation may have internal commits
and test slices, but Portal must not receive a succession of partial chat
requests or be asked to activate a half-published capability.

## 2. What “complete” means

Completion means that every source-owned item below has an existing-schema,
honest disposition in the single return:

- `EVENT_SOURCE_ACCEPTED`, `CAPABILITY_ACCEPTED_NON_EVENT` or N28 `PUBLISHED`:
  a versioned, bounded, profile-scoped source contract with synthetic
  acceptance evidence; or
- `SOURCE_GAP_CONFIRMED` / N28 `TYPED_UNAVAILABLE` with an exact
  source-grain reason **and** a named, already accepted
  `AVAILABLE_DERIVED_AT_PORTAL` product replacement where that source fact is
  structurally impossible (for example a portfolio that spans profiles).

No source gap may remain a silent permanent screen state.  If a historical
fact never existed before the new journal starts, the first retained
sequence/time is the explicit pre-capture boundary.  No system can reconstruct
that lost history safely; the contract must expose it instead of pretending
that retention begins at time zero.

The campaign does **not** require a database-wide or cross-domain global
sequence.  A contiguous sequence is required **per immutable event stream and
its bound `(workspace, profile, venue, resource, filter)` scope**.  Cross-stream
relationships use immutable correlation/causation identifiers, never inferred
wall-clock ordering.  This keeps the source change practical while preserving
replay correctness.

## 3. One source-side release, four implementation bundles

The owner may implement the bundles in the order below on the same branch.
Do not deploy each bundle separately to Portal; return all finished evidence
once as one source-completeness release.

| Bundle | Completes these EDS-08 gaps | Exact source outcome |
| --- | --- | --- |
| **A. Lifecycle continuity** | `position-version-history`, `fill-correction-replay`, `risk-event-correction` | Three independent authoritative snapshot-plus-tail streams: `execution.position-lifecycle.v1`, `execution.fill-lifecycle.v1`, `risk.decision-lifecycle.v1`. |
| **B. Execution evidence and safe operations** | `order-broker-ack-clocks`, `session-funnel-and-producer-version`, `signal-intent-funnel`, `reconciliation-ack-evidence`, `command-safe-reference-payload-contract` | Bounded acknowledgement, funnel, reconciliation and terminal-evidence DTOs.  No raw command payload, shell or broker credential is exposed. |
| **C. Market context** | `market-latest-ticks`, `market-ohlcv`, `market-benchmark`, `market-session-calendar`, `market-vnm-constraints` | Typed latest observation, bounded candles, named/derived benchmark, effective-dated venue calendar and VNM constraint contracts. |
| **D. Provenance and references** | `position-mark-provenance`, `valuation-mark-provenance`, `artifact-signed-reference`, `research-run-linkage`, `portfolio-profile-equity-direct` | Explicit mark/valuation lineage, safe artifact/reference metadata, immutable research linkage and either a profile-qualified portfolio producer or a declared Portal-derived replacement. |

The same release also returns all `MC-01`…`MC-09` results.  This matters
because N28 and EDS-08 overlap but are not identical: for example,
`binding.full-exposure-population`, `admin.sizing-explanation` and
`admin.config-plan-apply` are N28 product capabilities even though they are
not separate EDS-08 event-gap IDs.

### A. Lifecycle continuity requirements

Use the already frozen EDS-09 schemas.  For every accepted stream/profile
combination, publish:

- a source epoch, exact-decimal-string contiguous sequence and immutable event
  ID/entity-version ID;
- UTC epoch-millisecond `occurred_at` and `published_at` clocks;
- explicit `UPSERT`, `CORRECTION` and `TOMBSTONE` causality where applicable;
- declared retention floor, opaque scope-bound resume cursor and explicit
  `RESNAPSHOT_REQUIRED` behavior for epoch/gap/retention discontinuities;
- snapshot high watermark `W`, followed only by tail sequence `W + 1`; and
- profile/workspace/venue/resource binding that fails closed across profiles.

An owner can implement this through an immutable journal, transactional
outbox, CDC bridge or append-only keyset source.  The choice is internal to
Trading System.  Reusing `domain_events` is valid only if the owner adds and
proves these semantics; a mutable audit row or current projection is not a
substitute.

### B. Execution evidence and safe operations requirements

Publish named, bounded reads for the following facts; values must be null plus
`completeness` when unavailable, never fabricated from `updated_at`:

- order submit/source-ack/broker-ack/terminal timestamps, clock authority and
  safe broker message reference;
- deployment session funnel counts, declared population/window and producer
  revision;
- signal → intent → submit → acknowledgement → fill funnel identities,
  deduplication rule and stage completeness;
- immutable reconciliation acknowledgement actor/time/evidence, or an explicit
  current-status-only result; and
- allowlisted command terminal evidence with payload digest, target version,
  terminal state and verification reference.

`MC-05`, `MC-07`, `MC-08` and `MC-09` use their normative N28 definitions.
In particular, config plan/apply and delegated commands remain distinct from
read publication, retain approval/step-up/idempotency semantics, and must not
be activated by this return.

### C. Market context requirements

The source owner may adapt the existing Market Data Layer rather than copy its
database or build a second market store.  The published private Edge contract
must nevertheless make these facts explicit:

- latest tick/mark/index/last with source authority, observation time,
  freshness and revision;
- viewport-bounded OHLCV by venue, instrument, interval and UTC range, with
  exact-decimal OHLCV values, candle close state, completeness and opaque
  continuation where more history exists;
- named benchmark identity or a frozen benchmark derivation recipe with all
  source series/revisions required to reproduce it;
- effective-dated session/holiday/auction calendar including venue timezone;
  and
- effective-dated VNM order/session constraints, including a truthful
  unsupported result where an order type is not executable end-to-end.

Do not push ticks, candles or calendars directly to the browser.  Portal will
read these through its server-side Edge client, retain bounded projections and
serve chart windows through same-origin BFFs.

### D. Provenance and references requirements

For every mark/equity/performance fact that claims a value, publish a typed
lineage record containing the source kind, source timestamp, valuation or mark
revision, identifier/revision of the upstream observation and completeness.
It must distinguish mark, index, last and model values without exposing raw
provider credentials or storage paths.

Artifact and research contracts expose only digest-bound metadata, retention,
expiry and a workload-scoped signed reference if one is needed.  They never
expose object-store credentials, arbitrary paths or raw research content.

`portfolio-profile-equity-direct` has a valid source-as-is replacement: a
portfolio can span several profiles/venues, so a falsely profile-qualified
row would be wrong.  The owner must either publish a real profile-qualified
producer with its grain/lineage, or return
`SOURCE_GAP_CONFIRMED` with the explicit `NO_SINGLE_PROFILE_GRAIN` reason,
then name the existing Portal exact-decimal account-input derivation and its
formula/revision in the completion index.  That closes the product need
without duplicating an impossible source fact.

## 4. Shared transport, boundedness and security

Every published read remains private server-to-server:

- TLS 1.3 mTLS plus a short-lived delegated JWT bound to exact capability,
  audience, workspace, profile and resource;
- `X-Trading-Contract-Revision` negotiation with additive compatibility;
- source-to-Portal limits of at most 5,000 rows / 8 MiB / two concurrent
  requests per identity; Portal-to-browser BFF output remains bounded to 200
  rows / 1 MiB with Portal-signed opaque continuations;
- typed `400`, `401`, `403`, `404`, `429`, `502`, `503`, partial, empty,
  stale, retention-boundary and resnapshot outcomes; and
- no browser-direct Edge access, direct Portal database/Redis/broker/CLI
  access, source secret handoff or generic relation/SQL endpoint.

The release must preserve the existing Manager-v2 current-page read plane.
Current data continues through the Portal projection/cache/BFF/SSE path while
this work is built; it is not downgraded or replaced by an event consumer.

## 5. Source-owner proof and one final return

Run source-local tests before return.  At minimum prove:

1. duplicate, gap, restart, retention-floor, epoch-reset and snapshot-to-tail
   rules for each lifecycle stream;
2. correction/tombstone causality and per-stream ordering without claiming
   cross-stream total order;
3. profile/workspace/resource isolation and positive/negative mTLS/JWT
   binding;
4. current/empty/partial/stale and body/page/concurrency bounds for every
   market, provenance and evidence DTO;
5. candle revision mismatch, calendar effective-date and VNM session-boundary
   cases;
6. missing acknowledgement stage, unknown clock, duplicate funnel member,
   terminal command ambiguity and reconciliation evidence cases; and
7. source-loss/recovery, backpressure, disk/spool bound and rollback behavior.

Return one sanitized root on the source feature branch:

```text
portal-execution-source-completeness-return-v1/
  COMPLETION_INDEX.md
  eds09-event-source-return-v1/       # existing EDS-09 return format
  n28-owner-return-v3/                # existing N28 return format
  market-provenance-contracts/         # schemas, fixtures and acceptance only
  acceptance/
  RETURN_MANIFEST.sha256
```

`COMPLETION_INDEX.md` is a human cross-reference only: it lists each of the
18 EDS-08 gaps and every MC-01…MC-09 entry, its existing-schema source status,
separate product disposition, contract revision, source commit and the nested
evidence path.  The nested EDS-09 and N28 machine schemas remain authoritative;
no new generic consumer schema is required.
All fixtures/evidence are synthetic or redacted.  The root manifest must pass
before Portal receives the branch/commit.

## 6. Portal follow-up after a valid return

Portal does not deploy or activate anything merely because the return exists.
After it independently verifies the manifest and nested schemas, it will make
one compatibility decision per accepted contract:

1. bind accepted lifecycle streams to the already source-dark Rust append
   core, perform snapshot+tail qualification, then enable a narrow read-only
   ingest window;
2. bind market/provenance/evidence DTOs to named server-side BFF operations
   and durable, bounded projections; and
3. release rich panels against those named BFFs while retaining typed
   per-panel states for any genuinely unavailable item.

Portal browser code will never see a relation name, source cursor, source URL,
JWT, certificate, direct Trading System DB path or source secret.  Command
activation remains a separate approval/change-window decision even if its
read-side terminal evidence is published here.

## 7. Copy/paste instruction for the Trading System agent

```text
Implement the Trading System source-completeness campaign on one new feature
branch from the current Trading System development baseline.  Read, in order:

1. upgrade/backend/TRADING_SYSTEM_SOURCE_COMPLETENESS_CAMPAIGN_V1.md from the
   Portal handoff commit;
2. services/portal-execution-edge-rs/contracts/n28-missing-capability-v1/
   owner-request.v3.json;
3. upgrade/backend/EDS_09_TRADING_SYSTEM_EVENT_SOURCE_IMPLEMENTATION_REQUEST.md;
4. the mirrored eds09-current-source-return-v1 owner package; and
5. the current Manager-v2 runtime/contract documentation in your repository.

Preserve all current Manager-v2 reads.  Implement the four bundles on this one
branch, using existing Trading System/Market Data sources where they already
exist.  Do not give Portal direct database, Redis, broker, CLI or browser
access.  Do not deploy Portal or activate source traffic.

For events, use the frozen EDS-09 schemas and a contiguous sequence per bound
stream, not a fictitious database-wide global sequence.  For markets and
provenance, publish typed, bounded, versioned private contracts instead of raw
tables.  Return exactly one sanitized
portal-execution-source-completeness-return-v1/ directory with the nested
existing EDS-09/N28 formats, synthetic acceptance evidence and a passing root
manifest.  Commit it with the implementation, push the branch, and report the
source commit, image digest (if built), manifest output and test summary to
Bobby/Portal.  Do not include credentials, business rows, DSNs, SQL, private
keys or live runtime inputs.
```

## 8. Scope and rollback

This campaign document changes no code, database, route, runtime flag,
container, source connection, Edge policy or credential.  Portal current-data
screens remain usable while the owner works.  Its only rollback is a normal
revert of this documentation commit; the actual source rollout has its own
Trading System change window and rollback evidence.
