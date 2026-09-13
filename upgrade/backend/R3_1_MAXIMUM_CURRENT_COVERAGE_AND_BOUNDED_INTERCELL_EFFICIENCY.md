# R3-1 — Maximum-current coverage and bounded inter-cell efficiency

**Status:** `CODE_COMPLETE_AND_VERIFIED`  
**Date:** 2026-09-12  
**Portal branch baseline:** `feat/execution-loop-next` at `91f9d765` before this change  
**Runtime action:** none — this packet is code, migration and read-only evidence only.

## 1. Outcome

R3-1 closes the Portal-owned gap between the immutable Manager-v2 catalogue and
the product BFF boundary without turning a browser into a source explorer:

- all **96** current Manager relations have an explicit server-side
  disposition;
- all **54 screen-bound** relations resolve only through a static named Portal
  operation; the remaining **42** relations remain explicitly projection,
  audit or internal-only;
- every frozen screen panel and action has a typed, server-only coverage row;
- Paper and Sandbox now have a true profile-wide one-page admission boundary,
  and Live has a true profile-wide two-page boundary across operations and
  Control API replicas;
- diagnostics expose bounded, non-secret traffic and admission telemetry, not
  relations, cursors, source paths, rows, identities or mTLS/JWT material.

The result is a reusable R3 input for frontend integration and R3-2
qualification. It does **not** activate a profile, widen a source contract,
deploy an image or enable commands.

## 2. Source baseline and authority boundary

The following checks passed before and after the implementation:

```text
python3 services/portal-execution-edge-rs/tools/validate_maximum_data_e7.py
E7 return validation passed: 34 capabilities, 18 genuine source gaps, 3 measured profiles

(cd services/portal-execution-edge-rs/contracts/maximum-data-return-v1 && sha256sum --check MANIFEST.sha256)
all checked-in return-pack artifacts: OK
```

The Portal uses only this path:

```text
Browser → same-origin named BFF → Portal PostgreSQL shared-read/projection
        → private HTTP/2 + mTLS + delegated short-lived read JWT
        → profile-bound Execution Edge Manager-v2
```

It does not connect to Trading System PostgreSQL, `live_data_executor`, Redis,
broker, Source Proxy upstream or shell/CLI.  The full coverage ledger is an
immutable TypeScript server contract at
`apps/control-api/src/execution/r3-current-source-coverage-ledger.ts`.
Browser-visible runtime metadata contains only its digest/count/bounds.

## 3. Coverage contract

`R3_CURRENT_SOURCE_COVERAGE_LEDGER` combines the frozen EDS-02 screen/action
authority with the generated Manager registry.

| Surface | Result | Browser disposition |
| --- | ---: | --- |
| Product screens | 25 | every panel/action has a stable coverage ID, named Portal operation, profile, bounded source/derivation classification, frontend field path and fixture ID |
| Screen-bound relations | 54 | `COVERED` only through one static named BFF operation per relation |
| Projection-only relations | 16 | `COVERED` only as Portal projection derivation; never browser selectable |
| Audit/internal-only relations | 26 | `NOT_APPLICABLE`; not silently exposed to product clients |
| Total immutable Manager catalogue | 96 | exact one-row disposition per relation |

Panel/action classifications are restricted to `COVERED`, `EMPTY_AUTHORIZED`,
`PARTIAL_AUTHORIZED`, `SOURCE_GAP_CONFIRMED` and `NOT_APPLICABLE`.
`SOURCE_GAP_CONFIRMED` remains an owner-visible external fact, never a fixture
or fabricated empty result.

The ledger preserves availability, freshness, completeness and `as_of` through
the named BFF envelope, exact decimal strings, UTC milliseconds, opaque
continuations and the immutable per-page limits of **200 rows** and **1 MiB**.
It makes no event-replay, correction, global-order or full-history claim.

## 4. Profile-wide efficiency correction

### Defect found

The historical shared-admission `PROFILE` key was
`<source-id>:<profile-id>`. That applied Paper/Sandbox/Live concurrency once
per named operation. A broad screen fan-out could therefore exceed the
published per-profile Edge budget even though each operation appeared locally
valid.

### Corrected invariant

`PROFILE` now uses exactly `<profile-id>`, while `SOURCE` retains the logical
operation ID. PostgreSQL locks, counts and pacing state all use the same key:

| Profile | Maximum concurrent named source pages |
| --- | ---: |
| `PAPER_BINANCE_USDM` | 1 |
| `SANDBOX_BINANCE_USDM` | 1 |
| `LIVE_BINANCE_USDM` | 2 |

Migration `1723680000033_execution-profile-wide-shared-admission.sql` removes
only legacy **ephemeral** profile admission-state keys and adds an expiry index
for profile-wide lease observation. It does not touch business rows,
projections, command records, source rows or cached payloads.

**Release-transition rule:** apply this forward migration only with a bounded
all-replica Control API replacement from one immutable image. Do not leave an
old per-operation binary and the new profile-wide binary serving traffic as a
long-running mixed fleet: the old binary cannot observe the new global key.
This is a deployment precondition, not a runtime activation, and preserves the
published profile cap through the transition.

Both source-specific and profile-wide limits remain enforced inside a database
transaction, so two Control API replicas cannot each admit their own
independent Paper page. Existing lease, cache-flight coalescing, cache identity,
cache TTL, cancellation and bounded source-page reduction remain in force.

## 5. Bounded telemetry and operating rule

The admin-safe current-source diagnostics now include, per selected profile and
static named Portal operation only:

- cache hit/leader/follower/admission-denied counts;
- source request/success/status-class counts, bounded-response reductions,
  response bytes, page-item counts and latency totals/maximum;
- local bulkhead active/queue depth and pacing wait/grant state;
- PostgreSQL cross-replica active leases, active operation count and profile
  rate/concurrency state.

No relation name, raw record, cursor, request path, principal, cache key,
origin, certificate or assertion is emitted.

### Capacity observation (read-only, 10 minutes)

The AWS-HK observation used only Docker statistics/inspect against existing
workers; it made no Manager call and changed no container/configuration:

| Worker profile | RSS observed | CPU observation | Restart/OOM |
| --- | --- | --- | --- |
| Paper | 783.8–822.5 MiB of 1 GiB (76.54–80.32%) | short periodic spikes up to about 100%, otherwise idle | 0 / false |
| Sandbox | 36.35–41.88 MiB of 1 GiB (3.55–4.09%) | near idle | 0 / false |
| Live | 12.27–13.16 MiB of 1 GiB (1.20–1.28%) | near idle | 0 / false |

All three projection workers reported image
`sha256:d6aa7a510ddfbc3fc2080b19eebfd70818377a4e59690247195ada7dd92aff2e`,
restart count `0` and `OOMKilled=false` at collection time.  Paper crossed 80%
once, not for a sustained ten-minute interval. This is a warning, not a memory
leak claim and **does not authorize** more memory, page depth or cadence.

| Signal | Required response |
| --- | --- |
| `>=80%` memory sustained for 10 min | warning; capture slope/traffic and keep current pacing |
| `>=90%`, OOM, restart, source `429`, cursor cycle or source-error growth | block cadence/page-depth expansion; diagnose before retrying qualification |
| single point-in-time CPU/RSS spike | record only; do not call it a leak or auto-tune infrastructure |

Trusted operations may repeat the observation using their established
read-only host access. R3-1 never auto-scales the Edge or increases read rate.

## 6. Verification

The R3 implementation gates are:

```text
./scripts/control-api-test.sh
  → TypeScript build, full Control API/Vitest suite,
    real disposable PostgreSQL migration and dump/restore drill: PASS

./scripts/execution-n21-shared-admission-test.sh: PASS
./scripts/execution-n20-screen-bff-test.sh: PASS
E7 validator and maximum-data-return manifest verification: PASS

./scripts/execution-n29-product-acceptance-test.sh: PASS
./scripts/execution-eds12-qualification-test.sh: PASS
./scripts/execution-edge-test.sh: PASS
```

Focused assertions cover:

- Paper/Sandbox/Live profile caps across **distinct named operations** and
  separate repository instances (the two-Control-API-process model);
- one/ten/one-hundred caller flight coalescing, profile/workspace/principal
  cache isolation, lease recovery and source pacing;
- inventory key redaction and true profile-wide database state;
- all 25 screens, every frozen panel/action and all 96 relations;
- named-operation telemetry with no source-relation/cursor/credential leakage.

Because the source proxy and its focused contract test changed, the immutable
provenance chain was refreshed in the same change: N29's exact source-boundary
and test pins, its package manifest, EDS-12's N29/current-source pins, and its
package manifest. The validations above confirm that this is a static
provenance refresh only: release remains `NO_GO`, EDS-12 remains
`DEPLOYED_EVIDENCE_PENDING`, commands remain disabled, and no profile/runtime
authority widened.

## 7. Rollback and residuals

No runtime was activated by this change. If a future dev deployment needs to
roll back code, return to the prior signed image/commit while leaving the
forward migration in place: its profile-wide limit is stricter and safe. Do
not reconstruct or delete arbitrary admission/cache rows. The ordinary TTL
sweeper handles expiring ephemeral rows.

There is no unnamed Portal-owned R3-1 data or transport debt. The only
remaining unavailable facts are the existing, explicit **external**
`SOURCE_GAP_CONFIRMED` items from the accepted source pack (for example
qualified Market Context and authoritative replay/correction semantics). They
are inputs to R3-2, not reasons to bypass the Manager boundary or delay rich
current-data consumers.

## 8. Handoff

Frontend R3-3 should bind a panel only through its `namedPortalOperationId` and
its coverage-row state. It must retain the approved rich layout and render
`EMPTY_AUTHORIZED`, `PARTIAL_AUTHORIZED`, stale and source-gap states inside the
panel; it must not introduce relation selectors or fixture fallback. R3-2 may
consume the ledger digest, profile caps and capacity rule for profile
qualification, realtime/DR and the separately governed command plane.
