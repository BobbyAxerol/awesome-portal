# Native ROOT coordinator repair — 25 October 2026

## Verdict and scope

SOURCE_IMPLEMENTED / FOCUSED_BUILD_PG_RESTORE_PASS / NOT_INSTALLED.
This closes the concrete ROOT coordinator source-review findings in
[the finite-runtime return](CORE_FINITE_RUNTIME_COMPOSITION_2026-10-25.md),
not connected acceptance or the full ELP2-10 gate.

Bobby's continuing candidate-only package applies. No UI, public API DTO,
OpenAPI/generated contract, migration, source grant/session, command SUBMIT,
Live, shared preview, stable/dev/main/provider28445 or remote push changed.

Core source commit: **90585527bed09c0f6fb67530ddcfbfadd06bc9be**,
branch chore/core-provider-assembly-20261025, worktree
/home/bobby/portal-core-provider-assembly-20261025.
Input d7e890d04c63658390948a46477a9507ce20fae3; canonical input
538b934a934f9c71639e5f9f6067ae401d9f5641. Source commit:
16 code/test files, **+710/-55**. Canonical receives the report only until the
integrated normal R2 passes. This is not a claim that source is already landed.

Claude was rechecked at clean 00e7f6cff2fadbd88b8ed461fa870b28ee88ad94;
no new committed consumer request. Owned Edge ef4945fae32abe3820b870ab893ff639dca9aef2
and PM fad5e3fd876460f3aecfcf8ebd57a66610b6069c were re-pinned;
peer Edge8727e530/PM6f474c72 WIP remains untouched.

## Requirement to implementation and test

| Finding | Repair | Evidence |
| --- | --- | --- |
| ROOT152 missing from mutation drain | Same-pool ROOT recovery participant plus global unresolved census, including old/unmounted configs; expiry stays UNKNOWN, recovery return is not ACK | Coordinator15 + existing mutation105 |
| Own COMMIT would self-deadlock | Only the registered provider's opaque, carried fence can exempt its exact ENTERED row, after locking/validating full context; forged/foreign provider or fence cannot exempt | Provider14; real PG and local mTLS |
| QUALIFY could race authority drain | Provider takes authority lock first; QUALIFY requires no drain, COMMIT requires exact PENDING intent/drain | Provider14 |
| FINISHED could reacquire source or reapply | Fresh serialized FINISHED check skips acquire/ENTER; ROOT replay reads the exact immutable receipt and verifies terminal digest | Coordinator15, root receipt65 |
| Lost ENTER/restart could deadlock the next QUALIFY | Actual recovery precedes qualification; only a full serialized zero-obligation census can suspend a settled ROOT drain. Retry reuses original intent/key and reauthorizes; another drain is never overwritten | Provider restart/lost-ENTER cases and coordinator15 |
| Recovery could tombstone a live holder | Active-holder tracking, one verification, same-original recovery single-flight and release ownership | Provider14 |
| Shutdown could outlive transport/pool | Stop admission, join operations/holders/recovery and physical client close; failure is not reported as successful disposal | Provider14, client10, runtime/bootstrap56 |

Pre-acquire, catch cleanup and abandoned recovery never use the own-fence
exemption. COMMITTED-but-unACKed custody remains unresolved. Suspension is not
a fabricated source terminal, grant, application or replacement attempt.
Normal application writes and immutable event readback remain distinct.

Main/AppModule prepare the independent ROOT provider before trust composition
and register that exact object with the shared coordinator. The trust is
composed before owner intake and Manager WeakMap capture. Optional
CONTROL_API_NATIVE_ROOT_CONFIG_FILE/SHA256 remains default OFF. Target,
schema, private references and pool profiles must match; startup does not
perform ISSUE, grant intake or automatic DDL.

## Actual verification

Official selector, one bounded disposable PostgreSQL cell:

- elp210-native-root-provider: **14/14 PASS**.
- elp210-native-root-coordinator: **15/15 PASS**.
- elp210-root-receipt: **65/65 PASS**.
- elp210-current-human-candidate: **105/105 PASS**.
- elp210-native-core-obligations: **31/31 PASS**.
- elp210-native-current-relations-provider: **15/15 PASS**.
- elp210-auth-issuance: **26/26 PASS**.
- elp210-auth-logout: **9/9 PASS**.

Total **280/280 PASS**, 8 files; Vitest111.89s, tests74.65s. Production
TypeScript build, additive migrations through153, actual dump/restore and
versioned identity/session/command/custody preservation all PASS; runner exit0.
External PM replies/registrations are explicitly synthetic component inputs:
real PG/TLS/HTTP do not make them genuine Research authority.

Separate runtime/config/bootstrap: 19+15+22 = **56 unique PASS**.
Initial sandbox run was54PASS/2FAIL because root-directory metadata was
mapped to nobody; the exact unmodified bootstrap selector passed22/22 with
real host metadata. No ownership guard or assertion was weakened.
Separate actual loopback ROOT client: **10/10 PASS**, 08:17:04UTC,1.03s;
initial sandbox listen EPERM was retaken with the permitted loopback scope.
Client success is retained in tool transcript session71902/chunk287108, not
an invented log file. Do not count the overlapping bootstrap retake twice.

Initial PG attempt was operator-stopped at TypeScript build (exit137);
no PG test had run. An unlocked120s compiler trace also timed out while
progressing through unchanged Research files. Neither is PASS or proof of
a ROOT-specific compiler defect. The final official whole-source build above
supersedes the unresolved build gate; it does not erase either attempt.
An explicit factory interface was added without changing runtime validation.

Independent read-only final review: ACCEPT for opaque fence, lock ordering,
restart/suspension, FINISHED replay and physical shutdown. Three existing
helpers reused; none newly spawned. Primary owns shared docs and gate scheduling.

## Receipts, resources and preservation

Artifact directory: /home/bobby/.local/state/portal-integrations/20261025/.

| Artifact | SHA256 |
| --- | --- |
| core-root-coordinator-pg-final.log | cb0a49df67d9ff1221df45a3f5cbb6873490f9744e8a20a6e8fda30c7a0bcf6a |
| core-root-runtime-wiring-unit.log (initial sandbox result) | c5cbb938fa7d792105747f14ee8ba7d0040248cc0f7b71015ef46c4a985db1ba |
| core-root-bootstrap-host-retake.log | 1df0c20cc7e1a3996b75bb81c36a93629ec6c62f14b93f5d5f254b60ada68b3f |
| core-root-coordinator-90585527.bundle | 96beae4b242e78da6216d63c604b6c34e6693f477ab0d427a07bcc7dc508e0f2 |

Bundle requires0fae408ee0340f27546b3687b19bd1cb196267f7 and verifies.
Source does not depend solely on /tmp. The official cell uses pinned Node and
PostgreSQL images from scripts/control-api-test.sh, internal test network,
Node3CPU/3GiB and PG1CPU/1GiB. Observed Node99.46%CPU/1.393GiB and PG68.41MiB;
these are sample observations, not maxima or production calibration.

Runner cleanup verified: no owned container/network for suffix18014892918130170
or the stopped suffix1759776286416536 remains; dependency scratch removed by
the trap. Root filesystem67%used,207GiB free: NO_ACTION_NEEDED. No unrelated
container, volume, backup, source custody or evidence was pruned.
N29/EDS-12 integrity refresh/check PASS, unchanged/runtime_effect NONE.

Verification tier: focused intermediate source under campaign10.10c.
Normal integrated landing R2 remains NOT_MET; no full hook/build is repeated
for this Markdown. Documentation uses R0 explicit path/diff/link/tracking checks.

## Next owned work and bidirectional handoff

- Core integrator: preserve this source with the already frozen Claude cut;
  resolve recorded normal R2/visual findings before any ff-only landing.
- Core installer: after that candidate is qualified, backup/apply official
  schema/migrations and select independent ROOT/CURRENT originals in the
  approved isolated target. Do not replace the shared preview in this slice.
- Concrete new Edge source finding: CommandStatusServer has no owning
  loader/CLI callsite at ef4945fa. Candidate-only STATUS check/serve/lifecycle
  wiring is being implemented separately; it is not an external window wait
  and is not included in this Core commit/test result.
- Source commissioning through Edge: require actual independent accepted
  ROOT/CURRENT correspondence/originals, exact trust and per-action permissions.
  Financial needs real original/verifier and transaction group before
  COMMIT→APPLIED→durable source ACK. STATUS needs an existing authorized
  original; a zero-command source cannot supply a positive specimen.
- Claude: no new public field/enum/schema or component rewrite in this slice.
  Keep accepted UI/fixtures. After qualified installation, take exact
  principal/workspace API/browser receipts only for the surfaces actually
  mounted; source delivery is not consumer ACK.
- Full ELP2-05/06/07/09/10 remains incomplete; ELP2-11 not entry-ready.
  Financial proof, gateway commissioning, budget/calibration, coexistence/G2
  and actual browser acceptance remain separate exit requirements.

Rollback: leave optional manifests unselected; preserve originals, intent IDs,
unknown/unACKed custody, schema history, grants and audit. Do not resolve
uncertainty by deleting rows, extending old leases or manufacturing receipts.

