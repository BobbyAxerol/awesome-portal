# Original08 — cache/P22 binding and independent-scope return

23 October 2026, 05:18 UTC / 12:18 Asia/Saigon.
**EDGE_OPERATOR_IMPLEMENTED_AND_UNIT_TESTED; CACHE_CONNECTED_NOT_RUN.**
The accepted native STREAM active-revoke case remains CLOSED/RETIRED. Do not
rerun it, reopen native9 or reuse its expired trust/window. Full08/read09
remains NOT_MET; this return does not certify any new runtime/specimen.
Edge checkout: /home/bobby/.worktrees/portal-execution-edge-upgrade-v1_2,
branch feat/execution-edge-upgrade-v1_2. Source hashes below identify this
tested operator slice; no source packet or runtime was copied to SGP.

## Edge work actually completed

The existing private `scripts/epg10-08/connected_read.py` now consumes Core's
existing exact-key P22 CLI receipts; no new service, public API, Rust product
contract, DB role, SQL or grant writer was introduced.

- Opt-in proof requires two distinct lease/attempts with the same cache/epoch
  MAC and an explicit HIT, individually bound to observed response bytes.
  The two body digests need not be equal: per-request metadata may differ.
- Each receipt must independently match durable SERVED, terminal receipt and
  source ACK/reconciled=true. CORRELATED alone, UNKNOWN, ABORTED, missing ACK,
  COALESCED/MISS instead of HIT, another epoch or replay cannot pass.
- Reuse the coordinator receipt verifier for an official business.read_all
  REVOKED transition of the exact grant, before expiry. No expiry/no-op/replay
  substitution. Credit cache only after actual current READ and old-cursor
  HTTP403 typed denials; a workspace404/cursor409 is not cache proof.
- Support actual EXECUTION_READ_SCOPE_REQUIRED without accepting arbitrary403.
  No extra requests are added. Independent scope/active revoke remain NOT_RUN
  in this result; action isolation is not an unaffected native-domain control.

Private input is optional `config.cache_proof={path,sha256}`. Its pinned owner
envelope has exactly schema_version=portal.execution.connected-cache-proof.v1,
baseline_sha256, producer_sha256, scope_sha256, prime={path,sha256} and
hit={path,sha256}. The references point to existing private CLI outputs, not
new Core/public wire contracts. The new private baseline checkpoint carries
prime_body_sha256 and read_body_sha256; historical checkpoints still work for
their original cases but cannot claim this new cache proof. The envelope is
owner provenance, NOT HMAC verification or a replacement for commissioning.
Never put the envelope, cursor, MACs, receipt bodies or sessions into Git.

Tests: final **149 PASS / 0 FAIL / 0 SKIP** across all three original08 Python
suites (84 driver, 65 unchanged publication/TLS guards), CPU1/512MiB, EXIT0.
These are TEST_ONLY, without external HTTP/DB/authority. First retake found one
new test setup error (82 tests/1 ERROR); corrected fixture setup, then83 PASS
and final149 PASS. Compilation2 PASS, tracking reconciliation and diffcheck
PASS. Source pins:

| Owned path | SHA256 |
| --- | --- |
| scripts/epg10-08/connected_read.py | 15c782f1d5c1abf6221a0227a28f0edb6160828549aa7e02eafa00f0741b53e1 |
| scripts/epg10-08/test_connected_read.py | 33cdd214bb7e61bde4b02b5875664b25dfc9bbeaadd69efd94cbd88bf492611d |

## Actual remaining inputs and owners

Direct SGP readback by05:18UTC: preview Control API image
3cb7f24af12d8228406eca9f2b800b458067bbcd1616995f51438cfa9d58d069,
source3265ce18745560cfad391e81054b7aa46eac9097/schema149/restart0;
active configa8142e41fd134907251497035124cf7ad8fefe7296ac08b466a4244fd49ec168.
It has zero cache_observation fields; its real /opt/control-api/dist contains
main/app modules but NO native-cache-observation.js. This is NOT_INSTALLED,
not merely an unacknowledged P22 health check. No secret values were printed.

1. **Core/Claude existing approved closeout lane:** land/qualify the reviewed
   P22 factory122fc5f1 and composition, return actual immutable image plus
   reviewed private cache_observation opt-in/config hash and bounded CLI sink
   reference. Preserve default OFF, current-human/final-COMMIT/custody fences.
   No new generic phase approval is requested; do not rerun accepted native
   active revoke as a prerequisite. Canonical remains282c7b39 at this cut;
   closeout454323456 is not an installed P22 release.
2. **Core + TS/PM:** return one genuinely different sealed native business
   domain for the SAME authorized actor as a before/after unaffected control,
   or the precise smallest source composition delta and its owner. A second
   URL/session, another principal, fixture provider or READ surviving STREAM
   revoke is not this proof. Existing single-domain selector is not loosened.
3. **Edge + Core after those inputs:** bind fresh matched source/trust/pins,
   census/bounds and a feasible new finite interval; Core owns actual current
   READ/session and official READ revoke. Prime/HIT in the current epoch, then
   revoke/read/cursor and correlate original terminal/source ACK. Keep this
   independent of command, Manager-all-mode and G2 absolute measurements.

No source/runtime/DB/credential/grant/session/config mutation occurred in this
slice. No test containers/images/build cache or SGP source packet was created.
All test-owned temporary files were cleaned by their test context; original
audit/rollback and foreign WIP remain. See the
[Edge Unified journal](../../../EXECUTION_LOOP_BACKEND_UNIFIED_PLAN_AND_GUIDE.md#original08--cache-p22-and-independent-scope-continuation)
and [original08 guide](../../../upgrade_v1.2/EXECUTION_PORTAL_EDGE_UPGRADE_GUIDE_v1.2_VI.md#epg10-08-hoàn-thiện-revocation-scope-và-tls)
for the same scoped status. No push/merge/CI.
