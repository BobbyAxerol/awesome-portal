# C2 recovery: actual issuer assertion in independent custody — 2026-11-05

**SOURCE-ONLY, NOT CUTOVER.** On `docs/research-loop-plan`, base
`2faa8968fddbde59b2e59525e334ba3d83886144` plus the existing shared WIP.
This does not install an issuer, listener, schema, policy, grant, or runtime.

The isolated custody candidate previously accepted an invented
`pma.restore-original-candidate.v1` envelope. It now accepts the existing
`pma.identity.v1` assertion emitted by `CurrentHumanCandidate`, using its
actual `jti` as lease ID and `sid` as session ID. It checks strict claims,
signature, key and owner/workspace/workload pins, then verifies the matching
durable lease and human signing-key fingerprint in the source cluster. A new
append requires the observed lease to be `ISSUED`; an exact already-committed
operation can be retried after phase advancement. Terminal custody still needs
the same lease, workspace, workload and request digest. It stores claim fields
and the proof hash, not the bearer assertion or terminal token.

Test on two newly created disposable PostgreSQL clusters, ephemeral test keys
and the real Core issuer implementation: `bash
scripts/test-elp2-independent-custody-pg.sh` **2/2 passed**, including wrong
owner, nonexistent original, exact replay versus altered proof, generation and
terminal mismatch, ambiguous commit, late first custody after phase change,
capacity and chain tampering. This is synthetic test data, not owner consent,
source qualification, an Edge terminal or ACK. The runner used an internal
network, bounded containers and its cleanup trap; it exited 0. Focused semantic
typecheck of the custody source exited 0 with the 384 MiB old-space limit.
The wider candidate typecheck and normal hook have not been rerun.

Pins (SHA-256):

- source `ec2df6d5a4f6cade335ea7acbf1117035c291a8747f15f05d086e5ffb4735ebf`
- candidate SQL `73f159c7a94dcb55d26c11eb837da75032e04d7b0a26d03217cf6e89a4c3eff2`
- test `63d2d50580ab9cf1ead6d827570fb2f113dbaf926ec139d88b019c395b181f56`
- runner `83a59ce01c88d510b8a9aa90163b395fc5f8de3c498f457ff743c8eb269522d6`

## Still required

- The source-row check and independent append are **not atomic**. The actual
  issuer/transport is not wired to wait for durable custody before sending;
  no complete no-gap checkpoint, independent failure-domain qualification,
  source readback of all post-snapshot terminals, ACK reconciliation or
  old-holder fencing follows from this test. `pg_control_system()` privilege
  for an intended least-privilege production role is also unqualified.
- Research owner/workspace/policy matched in read-only inspection, but no
  active owner session or valid step-up was observed and candidate P7 tables
  were not installed. This is not acceptance, a delegation or authorization
  to synthesize either. Full A2 and B2 remain NOT_READY; B2 stays unsigned.
- The public static A2 candidate was independently rechecked in both the Edge
  mailbox and write-once TS relay: manifest
  `17aa02dd1a9470fcd7e0c6101dff518b73c7e55b9b42dc0de71786083db60541`,
  six checksums OK at each location. It is not installed or accepted A2.

No frontend contract change. Cleanup: test runner exited with its exact-name
container/network cleanup; root filesystem was 56% used after the test.

## Follow-through: source lock and independent inventory (09:25 UTC)

This addendum supersedes the source/test pins above. For a new original
assertion, the candidate now holds shared locks on the source authority and
lease while the independent authority commits, and refuses a changed global
revision or an active drain. This closes the *local concurrent update window*
during that append; it does **not** make two databases a distributed atomic
transaction or put custody ahead of the actual HTTP send. If a commit response
is lost, only the same operation/proof can be retried. A read-only,
repeatable-read inventory validates the bounded chain from the independent
cluster without opening the source DB; it is explicitly diagnostic and never
returns a cutover authorization.

`bash scripts/test-elp2-independent-custody-pg.sh`: **2/2 passed**, adding
concurrent authority-update and lease-update lock timeouts, stale-revision rejection, original
retry after revision/phase change, source-unavailable inventory and tamper
refusal. Focused strict semantic typecheck of the source: exit 0. For the final
run these were sequential. One earlier development run briefly overlapped the
384 MiB host typecheck with the bounded test cell; it was not used as a
resource qualification. Both named test containers and the internal network
were absent after the final run. No runtime was touched.

Current SHA-256: source
`2ed3a9e1c5423c5997c4a855b7528438c75da9116ccc83715473503b6723a778`;
test `fb37e5e1f650b6e0702f92416a64aeddc012b3a816dfe56bd5da2dbd57cf2461`.
Candidate SQL and runner remain at the pins above. The existing hash chain
detects non-coordinated tampering but is not immutable against an authority
administrator rewriting the chain, a signature-retention/readback proof, a
complete source census, a trusted-clock/physical failure-domain proof, or an
ACK. None of the A2, B2, connected acceptance or restore gates is closed.
