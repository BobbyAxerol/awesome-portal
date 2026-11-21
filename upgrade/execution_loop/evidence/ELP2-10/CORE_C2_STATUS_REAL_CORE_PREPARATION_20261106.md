# C2 STATUS — Core preparation and recoverable call boundary

**SOURCE/TEST WIP ONLY; NOT INSTALLED OR CONNECTED.** Checkout
`docs/research-loop-plan`, committed HEAD `2faa8968f`. The P7 cell now joins
the real Core access service, current policy evaluator, command store,
original fingerprint writer, STATUS preparation/issue and C2 P7/custody
candidate. A newly assembled authority with empty in-memory contexts resumes
the same assertion and lease by reading the persisted link and the same
synthetic original. It does not create a second link or synthetic ACK.

The cell uses an explicitly synthetic TS acceptance/trust provider, command,
source-original and gateway; it sets the isolated test authority revision and
retires its own unentered test lease so later cases can run. These are **not**
native owner acceptance, a qualified source, external HTTP delivery, Edge ACK,
or OS-process restart. A separate earlier suite tested a generic recovery in a
new process, not this complete C2 composition; do not combine those results
into a connected pass. HTTP custody, true process restart of this composition,
real role/source, fencing and independent V2 restore remain open.

## Repair

With recovery bound, preparation used to accept an arbitrary call digest that
`recoverIssue` later rejected. It now refuses a noncanonical current-requester
digest **before** reserving the durable preparation or issuing a lease. The
fixture uses the exact digest constructed by `edge-command-gateway-binding`.
Recovery binding also refuses to change while a preparation or waiter is in
flight, so one attempt cannot start with a different recovery configuration.
These are unmounted candidate checks, not qualification of the issuer.

## Verification and limitations

- P7 two-disposable-PG suite `bash scripts/test-elp2-c2-p7-pg.sh owner-intent`:
  final **9/9 PASS**, exit 0. It rejects an invalid digest and a different actor
  with a correctly recomputed digest, then uses the real Core writer/authority
  and checks the exact persisted assertion/lease and same-original recovery in
  a newly constructed authority. The separate wrong-actor negative does not
  establish all workspace/revoke scenarios on an actual Edge source.
- Initial joined recovery runs failed: first because the synthetic original
  fingerprint was absent, then because the fixture used a noncanonical call
  digest. The fingerprint was created through Core's writer and the digest
  was corrected. A later **5/9** run failed because the new test compared the
  typed error code to the human-readable message; later cases depended on the
  aborted first test. The assertion now checks the error's `code` and status;
  the final 9/9 is the retake, not an additional connected run.
- `npm test -- test/command-source-assertion.spec.ts`: **80/80 PASS**, including
  bad-digest and recovery-bind race negatives. Transport and composition:
  **89/89 PASS** with authorized loopback. Their first sandbox run failed
  **53 cases with `listen EPERM`**; it is not counted as an application pass.
- Selected strict `tsc --noEmit` on the STATUS source and helper: exit 0,
  768 MiB Node heap. This is not full project typecheck, normal hook, or a
  test-inclusive build. Earlier access-boundary test-file hash is historical;
  the pins below supersede it for the current P7 fixture.
- Cell aggregate configured limit 2 CPU / 1.5 GiB; actual peaks not measured.
  Its cleanup trap completed; read-only Docker prefix checks found no
  `elp2-c2-p7-` containers or networks. Filesystem: 258 GiB free, 59% used.

## WIP file pins — SHA-256

| File | Hash |
| --- | --- |
| `apps/control-api/src/execution-v2/command-source-assertion.ts` | `7beae74e0b809093b75c1de137bc4c294f1405b9d2557c39485321a853532610` |
| `apps/control-api/test/command-source-assertion.spec.ts` | `8eb6de06f798490afe7d00581f16adf827cca54abb19cad7106b52277a782633` |
| `apps/control-api/test/c2-p7-owner-intent-candidate-pg.spec.ts` | `7545d67e608159a2d27c127e8fc6c1d15529ae8fca9686ca5d59e41c1d51a148` |
| `apps/control-api/test/fixtures/c2-status-core-authority-fixture.ts` | `b19fee45a6bae236038081216e316425f4fce466dfe026707e9cde0a068e91cc` |

## Next / Claude / rollback

Core: compose the actual P7 STATUS authority with bounded HTTP custody and a
new OS process, test same-original terminal/ACK recovery and revoke; separately
qualify the current-human provider and Edge source. Complete independent
anti-rollback authority and representative restore, review shared WIP, then
run the candidate's impacted gates and normal hook. Edge remains the sole
upstream for real source and recipient ACK. No frontend field or action is
introduced; Claude can continue existing fixture/consumer work. Keep candidate
unmounted and V2 restore refused until the required gates are satisfied.
