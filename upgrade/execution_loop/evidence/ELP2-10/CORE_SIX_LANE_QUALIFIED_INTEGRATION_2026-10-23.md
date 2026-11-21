# Core six-lane integration — actual validation, 23 October 2026

## Source and scope

Integrator parent `4543234567c28fbadb454745df386665b6cbce29`; Claude frozen
parent `2f9ca2dc8f6769ea91f7d123083c2f6d4805c730`. Preserve both ancestries,
all frontend baseline/test/doc files and Core gateway/recovery changes.
Canonical inbound Markdown at `a0a810e2bf7c02e33994a36f9694fee24a09e702` is
reconciled separately before canonical fast-forward. No push/dev/main/Live.

## Actual corrections and evidence

1. Fleet ALL retains every contributing environment as a final authorization
   obligation. Revoke, expiry, source head/generation drift and invalidated
   Score/Composition/Regime refuse the whole response, not leak earlier rows.
   Generic composition still requires its original same-binding fence.
2. Owner roster publishes the latest successful same-user login audit event,
   excluding preview auto-login, acceptance sessions, failures and another
   actor. Paged/unpaged reads agree; unknown history stays absent. Immutable
   account lifecycle projections are not rewritten.
3. Three focused tests now honor `PORTAL_CONTRACTS_DIR` in the isolated cell;
   a Paper history test principal has the two required account-lifecycle fields.
   The first isolated run exposed these fixture path errors; it was not PASS.
4. Successful normal TypeScript build output can be captured only after tests
   and both real PostgreSQL restore/hash checks. Packaging verifies the frozen
   source inputs and compiled bytes and retains the exact original runtime
   stage. No `noCheck`, weakened compiler or repeated identical OOM build.
5. Inactive image-only rollout accepts an explicit old/new image and original
   compose digest. It still pins inactive configuration, schema, resources,
   zero active authority and all 21 immutable custody-table digests; no new
   runtime flag, mount, grant or acceptance session is implied.

Actual focused results, not summed as distinct coverage:

| Check | Result |
| --- | --- |
| Fleet/read scope focused regressions | 130/130 PASS |
| Roster/login focused regressions | 31/31 PASS |
| Qualified artifact + runner safety tests | 91/91 PASS |
| Inactive image-only rollout regressions | 38/38 PASS |
| Isolated normal build + 14 selected Control API test files | 388/388 PASS |
| Real PostgreSQL roster, including paged/unpaged HTTP and 40,121-user query fixture | 11/11 within those 388; indexed page bounded to 51 rows |
| Dump/restore, counts and four scoped-access row digests | PASS after tests, before artifact capture |
| Contract snapshot | 558 tracked files MATCH |
| Live route census / protected kernel | 320 routes, zero collisions, protected hash MATCH |
| N29/EDS12 generated integrity ledger | Refreshed/check PASS; runtime effect NONE, release remains NO_GO |

The roster EXPLAIN is not a large-audit performance qualification. Synthetic
tests and restore proof are not connected Edge/Manager acceptance.

## Qualified build artifact

- Frozen input tree: `7a01f5dc07e08fd178428fd38102064f2a06fab5`.
- Image source-input digest:
  `5f88e179c560848e3eed2ef708f80faef165011c9faa15dff1d943cc2d3edabe`.
- Capture receipt SHA256:
  `25ff58d107852553bc1278663d98279692b80f0070c3878b6bd5ff37151526ff`.
- 652 compiled files; operator provenance, not independent attestation.
- Private artifact reference: `/tmp/portal-qualified-closeout-iAv65a`.
- Pinned Node image: `node@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32`.
- Pinned PostgreSQL image: `postgres@sha256:44c4ee9810eff91f7eab4d822642e01115b1a9eccce4bcbdde7604752d68eac6`.
- One heavy job under `/tmp/portal-heavy.lock`; disposable test cells/network
  removed by runner cleanup. The retained capture is needed for packaging.

Later receipt/tooling-only changes do not change the captured runtime inputs;
verify that equality before image build/installation. Image packaging, runtime
installation and final normal landing hook are **PENDING** at this revision.

The first normal landing hook stopped at the contracts cell: 95 suites and
1,656 tests passed, but incident-eligibility could not load its real pure
producer because the explicit non-secret copy list omitted that file. This
was an existing runner dependency omission, not a failing eligibility assertion.
Added only that producer to the existing operations copy list; no fixture or
schema weakened. Retake the affected contract before the normal landing hook.
The affected contract retake passed 8/8 (847 ms). The normal hook is retried
only after that diagnosis/fix, not to hide an unexplained failure.

### Subsequent normal result and focused repair — not a landing PASS

That normal hook completed, not RUNNING: contracts **96 files /1,664 tests
PASS**, normal TypeScript build PASS; Control API **497 files PASS /8 FAIL
/4 skipped**, **10,175 tests PASS /23 FAIL /7 skipped**. Its 3,756-second
duration is not an SLO/load result. Do not relabel this as a passing gate.

The failing assertions were22 economic-source cases using an unavailable
relative contracts path and one optional-purpose test pooling six full HTTP
authorization cases into one20-second timeout. The repair keeps the original
canonical fixtures and assertions, honors `PORTAL_CONTRACTS_DIR`, and makes
the six purpose/anchor pairs independent tests at the unchanged default
timeout. Five affected Financial/Command/queue files retook **118/118 PASS**
on the host (18 seconds); this is synthetic functional proof, not PG/source
qualification. The isolated PG retake remains pending at this entry.

Subsequent isolated build and all six selected files passed **424/424**,
including306 actual-PG/HTTP parent cases; tests took739.44 seconds. However,
this invocation then exited127 before restore (`L: command not found`). The
integrator had edited the running Bash runner to add the Paper dependency
closure, changing its file offsets after the long subprocess. This operator
error is not a passing runner/restore gate. Its trap removed the owned cell;
do not claim that invocation restored anything. Keep the runner frozen for
the two Paper suites and their restore drill, and for the final normal hook.
The earlier388-test build/restore receipt remains separately pinned and valid,
not relabelled as this later run. Do not rerun424 passing tests solely to hide
an already explained runner error; the final normal gate will cover them.

Module-only collection of all host specs also exited0. It executes no tests
or PostgreSQL hooks and is not acceptance. Two Paper-history suites import
actual pure browser readers/models; the isolated cell omitted that dependency
tree. A read-only check inside the owned cell confirmed those import targets
absent. The runner now copies their explicit14-file framework-free closure,
not env files, the whole frontend workspace, dependency caches or fixture
implementations. An isolated retake of both Paper suites is still required.
No approved frontend component, history assertion or source policy changed.

The frozen-runner retake then completed with exit 0: both Paper suites passed
**37/37**, including retained-history HTTP cases at 100,000 rows. Normal build,
migrations through 149 and real PostgreSQL dump/restore with all four scoped
row digests passed. This repairs the two omitted imports without dropping
their actual browser-consumer dependencies or weakening any assertion.
Owned disposable containers/network/tmp were removed by the runner trap;
the small log is retained as evidence, not market data:

- Paper/restore log: `/tmp/core-six-lane-paper-Wetcmm.log`, SHA256
  `d9248faa017b7ab34126559bc741de018c792b411220a970353d27d0a73c2e7e`.
- Previous 424-test log (operator-error terminal, not restore PASS):
  `/tmp/core-six-lane-focused-xHCs56.log`, SHA256
  `67342c2cda54f5831fa43913a406f76d1ba0b269fa00e4526dee0b813cb453ab`.

The 118 host tests overlap the 424 isolated tests; do not add them as separate
coverage. Final normal landing hook remains required on the reconciled frozen
source. No image was built/installed, authority issued, command enabled or
remote pushed by these focused repairs.

### Bounded proposal checker — usable tooling, no budget approval

Added `scripts/measure/qualification-plan.mjs` and the pure
`lib/qualification-reservation.mjs`, tested by
`test/qualification-reservation.test.mjs` (**12/12 PASS**). CLI usage:

```sh
node scripts/measure/qualification-plan.mjs --public-plan /path/to/public-plan.json
```

Only a public planning JSON may be supplied, never session/trust/authorization
files. The input must explicitly declare the four structural workload fields,
M2 durations/tab ladder, M5 stage orders/stabilization/margin, window scope and
retained scenarios. It uses the existing workload driver's tab census and
validates safe integer arithmetic, explicit scope, malformed/accessor inputs,
unknown fields, symlinks, file type,1MiB size and input changes during reading.
It performs no requests, writes, session issuance, load or clock-based expiry.
Independent read-only review accepted the14-file Paper closure and requested
one planner correction: each stage must reference an own declared workload
set, not an inherited `toString`/`constructor` property or a coercible object.
The new regression failed against the old code, then the bounded-string /
own-key repair passed with all12 tests. This is not a runtime budget change.

- Actual checked-in B2 census is28 tabs, not16.
- Existing M2 guards reserve19 minutes per cell:95 minutes for five cells.
  These are current driver's guards, not a newly mandated soak or optimum.
- The reviewed M5 proposal reserves90 minutes before explicit margin; combined
  with M2 it is185 minutes **before margin**, not a two-hour reservation.
- Current H21 full historical suite requires294 retained slots with reserve20,
  exceeding C288. Historical H16 remaining-case282 is not current authority;
  current remaining-case287 has one slot headroom only if its inputs remain
  valid. The calculator neither deletes custody nor renews old grants.

Even numerically consistent output always reports
`PLANNING_ONLY_NOT_AUTHORIZED`, `authority_verified=false`,
`execution_authorized=false`, `approved_budget=false` and
`calibration_evidence=false`. Target/source/numeric owner acceptance, fresh
window/pins, collector, stop/restore and calibration gates remain independent.

## Producer / consumer / remaining authority

See [Claude follow-through](CODEX_TO_CLAUDE_SIX_LANE_REVIEW_2026-10-23.md),
[Manager offline checks](CORE_MANAGER_OFFLINE_RECONCILIATION_2026-10-23.md) and
[numeric/source review](CODEX_NUMERIC_AND_FINANCIAL_REVIEW_2026-10-23.md).
The original actual active STREAM revoke is accepted/retired; do not repeat.
Fresh cache/cursor source binding, loaded Manager overlap/business READ,
commissioned Edge command gateway, source financial inputs, approved numeric
bounds/calibration/workload and browser acceptance remain separate obligations.
ELP2-10 is not full-PASS and ELP2-11 is not opened by this receipt.

Rollback retains both branch parents and all historical receipts. Image-only
installation must back up Research and preserve old compose bytes, current
inactive config/schema, zero authority census and custody hashes. No deleting
custody to fit capacity; no fixture values used as financial calibration.
