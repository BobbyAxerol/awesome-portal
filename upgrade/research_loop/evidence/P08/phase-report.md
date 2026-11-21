# P08 phase report — Data snapshots, effective spec and authoritative preflight

Status: `BACKEND_AND_TYPED_CONTRACT_COMPLETE` — 2026-09-20.

## Delivered authority

P08 publishes exactly two same-origin browser operations:

- `POST /api/v1/research/preflights` — create one actor/workspace-scoped,
  immutable metadata manifest after CSRF/session/origin verification.
- `GET /api/v1/research/preflights/:preflight_token` — read that actor's exact
  live metadata while it remains unexpired.

The browser never sees a Portal API origin, internal principal, HMD reader
input, raw candle, Parquet path, source credential, holdout value, worker
claim, command or execution relation. Control API signs a fixed 60-second
private principal and calls only `POST /internal/research/preflight-snapshots`.
Portal API rejects a missing/bad principal and does not mount an equivalent
public route.

## Data and manifest truth

- The private authority accepts only the P04 current, `P04_BASELINE_ONLY`
  route/admission tuple. It is explicitly `PREFLIGHT_ONLY`, not a run/job
  admission.
- It normalizes source-local/aware timestamps to UTC milliseconds, reads an
  explicit `[start,end)` HMD range plus exact warmup lookback, requires closed
  bars and records quality/gap/duplicate facts.
- Snapshot identity is content-addressed and shared: the same bounded content
  has one `dss_…` reference, never one copied frame per user. Staged directory
  publication prevents readers from observing partial snapshot files under a
  concurrent preflight burst. The certified HMD adapter validates its full
  OHLCV hot path, then P08 seals only the Alpha-declared input columns for a
  future worker; unused candle columns do not become worker input.
- A `dss_…` ID in the BFF response is provenance metadata, never a browser
  read capability. Legacy generic Data Catalog list/quality/series endpoints
  hide the `research-hmd-ohlcv` family and return `404` before opening its
  frame, so they cannot bypass the sealed-holdout boundary.
- Requested spec, effective spec, data binding, topology, snapshot facts and
  resource estimate are separately SHA-256 bound. Control API validates the
  private response again before storage, including cross-document equality of
  snapshot/hash/range/column/warmup/topology/optimizer facts, and validates
  stored metadata again before returning it to a browser.
- The OpenAPI document carries the frozen requested-spec schema from the
  self-contained contracts workspace. A contract test requires that packaged
  copy to parse identically to P02's immutable freeze evidence, so local,
  Docker/CI and release-image generation cannot resolve a different schema.
  The isolated contract-test staging receives that one read-only P02 schema
  solely for the parity assertion; it is not a runtime dependency.
- The topology is exact and bounded. A range above 128 folds is refused with
  `RESEARCH_PREFLIGHT_RESOURCE_REFUSED`; it is never silently truncated.
  Rolling windows remain `RESEARCH_PREFLIGHT_TOPOLOGY_UNSUPPORTED` because the
  frozen P02 spec has no manifest-owned train width. P10 may add that field by
  a deliberate versioned contract amendment; P08 does not invent a default.
- `sealed_holdout` is metadata-only
  (`OPAQUE_SNAPSHOT_ONLY`/`NOT_EVALUATED`). No transform, chart, score, fit or
  raw holdout data is returned or claimed by P08.
- Loader provenance is an explicit finite allowlist. Arbitrary loader metadata
  such as a DSN, credential or opaque diagnostic value cannot cross into the
  persisted/browser manifest.
- An obviously inadmissible trial budget is refused before serializing a
  shared snapshot; the final exact estimate is rechecked after serialization.
  This prevents rejected retry bursts from accumulating unreferenced frames.

## Persistence, retention and recovery

Migration `1723680000041_research-preflight-v1.sql` adds only
`research.preflight_manifests`: actor/workspace-scoped opaque token, hashes and
bounded JSON metadata. It has an immutable update trigger; the runtime role has
only `SELECT`, `INSERT`, `DELETE`. Expiry cleanup uses the bounded actor-scoped
repository operation and cannot delete shared HMD snapshots or business data.

`assertFreshForRequestedSpec()` is the only P10 handoff: a future submitter
must re-check token ownership, expiry and requested-spec digest server-side
before binding a worker input. A browser token/digest is never trusted alone.

## Exact P08 test map

| Gate | Evidence |
|---|---|
| T01 | Content-addressed snapshot survives source mutation; later source correction receives a new reference. |
| T02–T03 | UTC-naive, Vietnam-naive and aware normalization; half-open range, closed bar and warmup checks. |
| T04 | Funding and required-column gaps return fixed typed refusal codes. |
| T05/T08/T11 | Metadata has no points/raw holdout; transform/evaluation are not mounted. |
| T06/T10/T12 | Canonical cross-language SHA, persisted exact manifest, stale material edit/release/route rejection. |
| T07/T09 | RAM/scratch/CPU/fold document ceilings and trial scope are explicit; no queue/global reservation is claimed. |
| DR | HMD-shaped bounded source, private HMAC route, snapshot race and PostgreSQL immutable/actor-scope proof. |
| GX | Protected QuantBT hash, packaged-P02-schema parity, generated-contract verifier, snapshot drift check and disposable test teardown. |

## Deliberate non-claims and next ownership

The typed Screen 02/05 consumer and its labelled fixture-lane browser receipt
are now green; the cross-phase browser/HIFI audit is in
`frontend-hifi-browser-audit.md`. That is deliberately **not** a product-route
or real-API receipt. P09 owns product-route/foundation, P10 owns the full
declaration/create-run/worker binding, and P14 owns the detailed split screen.
Those named later gates are not a hidden P08 backend defect. The generated
contract now also publishes `may_create_run=false` rather than inviting the
browser to infer authority.
