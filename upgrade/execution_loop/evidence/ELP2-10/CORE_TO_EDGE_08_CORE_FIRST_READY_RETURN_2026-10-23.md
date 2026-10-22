# Core → Edge08 — Core prepared first; source binding not armed

Recorded 2026-10-22 17:43 UTC / 2026-10-23 00:43 VN.

**Disposition: CORE_LOCAL_READY_FOR_NEW_PREPARED; SOURCE_UNBOUND / UNARMED.**
This is a readiness return, **not an ACK of any new source or window** and not
connected acceptance. Bobby will call Edge when he is ready. Do not install a
new source, issue attempts or reuse the expired `6d09378a…` PREPARED/ACK because
of this document. Full08/read09 remains **NOT_MET** until actual reconciliation.

## 1. Principal Core work finished before requesting a window

- Code commit `27111ee8615108a820ba86ea47630939bf4e774b` on
  `docs/research-loop-plan`: four public staging/safety/test files, **+662/-0**.
- Qualified mapper image is **actually installed** and healthy on Research:
  `sha256:3cb7f24af12d8228406eca9f2b800b458067bbcd1616995f51438cfa9d58d069`.
  Its application repair source remains
  `3265ce18745560cfad391e81054b7aa46eac9097`, not the whole newest campaign tree.
  Installed `dist/execution-v2/read-scope.js` SHA256 is
  `3904bf5f68c2f67fd03357be67850c6e056bd3d1d8a349ab576566d60c1bd3aa`.
- Installed runtime stays **byte-identical, expired/inactive**:
  `a8142e41fd134907251497035124cf7ad8fefe7296ac08b466a4244fd49ec168`.
  There is no new session, grant, source, attempt or authority claim this round.
- Registered schema `research-current-human.v1`, digest
  `826e4e083c8db536fc80a0f0ec272e3a71387a5e5d53a9cde48563f41fe32728`;
  migration149 already present. **No migration/schema change** in this round.
- Actual SIGTERM/clean-exit staging, healthy readback and **21/21 table digests
  unchanged**. Effective owner READ/STREAM=0, active Research acceptance
  sessions=0, pending/unresolved/unreconciled/native leases=0, active children=0.
  Original attempt/audit/custody history is preserved.
- API ceiling stays **1.5CPU/1GiB**, official CLI **0.5CPU/512MiB**. No broad
  build, load job, extra DB, background test container or provider28445 change.

The mapper is preinstalled with inactive pins because runtime construction is
inert; fresh admission still checks source/policy/session expiry. Installing the
already-qualified mapper no longer waits for a scarce connected window.

## 2. Frozen, single-entry runner and recovery

Private custody reference (no secret values):
`/home/bobby/secure/core009-core-first-20261023-Ig8Gqs/`.

Frozen runner manifest SHA256:
`eb5e9515167c1e6921dbda43799a1b222e9374700fe67c5209872ed0ab49c539`.

| Artifact | SHA256 |
| --- | --- |
| `accept.mjs` | `cf8cb4148aa0b77c5b041ef12ed2cadbdd0d4d03dce99279455937585ebde114` |
| `prepare.mjs` | `5994b19d13dcca0b36b2149ae0ea60bf1bf1684f2432637a87ce792dacf87ce3` |
| `operate.mjs` | `a271fcca98dc8bf5e040fa0b42ffcede8824757bc7deccc9c546ffaa8802ba94` |
| `stream-probe.mjs` | `f9554854cd6137e324c6c726fb21b19fe24ce522bf594ba55c6b7f1b0a2f1acb` |
| `core009-runner-safety.mjs` | `4ac3f90f247be146e2a99c8630e5051dfc6458eb3669afa91921d84e5bf10648` |
| Preserved recovery helper | `6797eed448eb473f8fc8d429671acbc756cc350b2324a3a2e18f62e45fa6d3f5` |

One explicit entry: `accept.mjs --active-revoke-only` with exact expectation,
actual READY file hashes and frozen runner-manifest hash. There is **no default
restart/full-READ scenario**, no alternate push/identity path or automatic retry.

Runner now validates READY, retired predecessors, actual target/schema, capacity,
all references and DSN before creating source-bound custody directories. It
performs official dry-runs, binds only the actual source pins, issues the exact
READ and 300s acceptance session, runs one missing-only specimen, then settles
the exact issued resources. No password/Cloudflare/human-presence proof is claimed.

STREAM dry-runs and the sole official apply use a **future start** on the original
fixed60s grant. The runner waits for that original start; the probe reuses the
same applied receipt, not a second grant/intent. This removes startup/dry-run work
from the60s active interval without extending it. Enforced probe budget is
40.25s plus10s reserve; timeout is a failed/UNKNOWN observation, not a fake close.

Standalone continuation requires the same artifact bytes/hash/revocation ID,
original dispatch, physically closed official75 and its unambiguous typed reason.
UNKNOWN never authorizes a continuation. A successful continuation is reused
during settlement rather than mistakenly dispatched again.

Removal has a separate bounded deadline, **window end +15min**, using the exact
original artifacts through the official writer. It cannot create/renew authority
or bypass source-terminal/UNKNOWN fences. Cleanup accepts a genuine remove-only
expired/no-op outcome, but **that never passes active-revoke acceptance**.
All still-open/UNKNOWN original processes prevent competing automatic cleanup.
Failure is recorded before bounded close/census observations. API returns to its
unchanged inactive configuration only after verified custody and authority closure.

## 3. Tests and actual installation evidence

All new tests are offline/fake-effects, **not connected source evidence**:

| Focused lane | Actual result |
| --- | --- |
| Inactive staging/rollback/preservation helper |32/32 PASS,0 skip |
| Runner admission/removal/known75/budget/capture guards |52/52 PASS,0 skip |
| Actual private prepare source, pure/fakeIO including late reference failure |28/28 PASS |
| Actual private probe source with fake processes/network effects |15/15 PASS |
| Actual private operator source with fake Docker/DB/files |14/14 PASS |
| Actual private entry source with fake children, including timeout/UNKNOWN |5/5 PASS |

Actual install evidence is separate: backup31,217,766bytes, SHA256
`37a2621c7e5129ef37ff49c13ad2ae1daee13f9803d7dee279b2c4eda8f3c14c`,
created17:32:57–17:33:04UTC; **not restored**. Private staging receipt
`precommission/final-receipt.json`, SHA256
`0d30a4336bb2fbee9abb5122131c606fb26cac58a3f1c5928de407973cace7c1`.
Image readback, compiled mapper hash, inactive config/schema/resources and
21-table preservation were independently rechecked after installation.

Verification lane: `scripts/select-gates.sh HEAD` selected the script-own-test
lane. §10.10c applies: focused intermediate commit, no application/contract/gate
script change or branch landing; no repeated full hook/build for this packet.
Two disjoint agent reviews plus primary source inspection found and fixed the
cleanup race and successful-recovery reuse bug. No fixture is called live proof.

## 4. Exact Edge input next — only after Bobby calls

| Owner | Required action / input |
| --- | --- |
| Edge coordinator | Return **new** exact PREPARED/source/native revision/receipt/document/fingerprint, finite window and current trust binding. Old native8/source/ACK/slots stay retired. |
| Core coordinator | Compare PREPARED to this installed image and frozen runner; issue exact ACK **before** Edge installs. Do not wait for actual READY to ACK PREPARED. |
| Edge coordinator | After matching ACK, install/bind source and return actual SDK READY, its raw hash and physical/issued census. |
| Core coordinator | Bind those actual inputs, run the one-shot specimen/settlement; return source/config/image/runner hashes and actual private receipts for Edge reconciliation. |

No timed reservation is being opened now. When scheduling, choose a finite
window with **over20min remaining at actual READY**, rather than a one-minute
response deadline; Core preparation/build/review is already complete. Max
configured source window remains2h. If source/trust expires, return a new binding;
never reuse or extend an expired grant/session/intent to fit a schedule.

Existing native CA and Core leaf were inspected: notAfter **2026-10-23 03:00:58
UTC** (10:00:58VN). This is an expiry bound, not a booked slot. A later run needs
fresh trust under the approved Research-only procedure, not a stable credential.
No new key or certificate was created this round. Source-bound runtime/config
hashes necessarily change only after actual new READY; no placeholder hash is
presented as installed.

Conservative288 retained gate remains `H +244 +2 +20 <=288`: one fixed60s
subscriber, source250ms clock, two finite controls and reserve20, no restart or
resubscribe. Do not attach the broad Manager/P22/browser conformance probe to this
minimal specimen or call its READ control a requalification of completed READ.

## 5. Parallel work / limits / cleanup

Claude lane observed `3add605806c3cf74b826f91cba4e9ffcc7f3324e`, clean;
Core did not edit its components, contracts or WIP. Its UI/fixture/visual work may
continue independently. P22 factory/cache, Manager certificate commissioning,
financial source semantics, approved budget/calibration, coexistence/G2 and
browser acceptance retain their own owners/gates; **this packet does not close
ELP2-10 or authorize ELP2-11**.

No fresh acceptance resource exists to revoke in this round. Backup, old image,
original scripts, all failed-attempt/custody/audit evidence and rollback compose
are retained. No broad prune or orphan-container removal. Research serves the
healthy inactive mapper; no test process or reserved connected window is left.
No remote push, stable/dev/main mutation, command or Live activation.

Edge checkout metadata observed read-only17:42:50UTC:
`f651a015d3dc9dcd17796ea4b0b63233b76fe4db`. This is **not** a claim that its
worktree is clean or that source is deployed. Edge remains the sole TS/PM relay.
