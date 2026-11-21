# C2 independent custody: original terminal binding — 2026-11-05

**SOURCE_ONLY; NOT COMMISSIONED; NOT RESTORE CUTOVER.** On
`docs/research-loop-plan`, base `2faa8968fddbde59b2e59525e334ba3d83886144`
plus shared uncommitted WIP. No runtime, grant, source, TLS or database was
changed. The static A2 candidate previously delivered to Edge is unchanged.

## Change

The custody candidate now checks a source-signed terminal against Core's
locked original lease, including its pinned source key, workspace, environment,
workload, request, attempt, state and, where already settled, the terminal
receipt digest. A signed COMMITTED for an unentered original or a different
attempt is rejected. For the original already entered before a drain/revoke,
this check does **not** require a still-active human grant: its signed terminal
may still be recorded and resolved. The source lease lock is retained until the
independent custody transaction commits; this is a local race fence, not an
external checkpoint or authorization to restore.

## Evidence

- `bash scripts/test-elp2-independent-custody-pg.sh`: final run exit 0,
  **4/4 tests**, on two disposable PostgreSQL clusters. Scenarios include
  rejected unentered COMMIT and wrong attempt, same-original lost-response
  replay, terminal replay after Core resolve, and the original ENTERed before
  drain whose COMMITTED terminal is stored and resolved after drain. All
  principals, source proofs and receipts in this test are synthetic.
- The first run after the change timed out because the old lock scenario tried
  to append an already-ENTERED lease. Its test fixture was corrected to use a
  distinct ISSUED lease; subsequent runs passed. No result from that failed
  run is counted as PASS.
- Focused strict TypeScript check of the issuer/custody transitive imports
  exited 0 with the repository-compatible decorator and interop options; this
  is not the complete project typecheck or normal hook.
- Runner cleanup and read-only container/network checks found no
  `elp2-custody-*` resources left. No unrelated resource was removed.

| Input | SHA-256 |
| --- | --- |
| `apps/control-api/src/execution-v2/restore-independent-custody-candidate.ts` | `c375b7d82ddb770455fdbe52b25618bb1bac709060e82cc57ba01c72219bc857` |
| `apps/control-api/test/restore-independent-custody-candidate-pg.spec.ts` | `6425131564ad30caa27b4545467988a964dcb83c23ef590d6ff48c415e782ec0` |

These pins supersede the respective pins in
`CORE_C2_CUSTODIED_ISSUER_RESUME_20261105.md`.

## Still open

This code is unmounted. The raw issuer has not been made an exclusive runtime
path; P7 preparation remains explicitly **NOT_AUTHORIZED**, and source
registration/revocation is not yet fenced against the real source authority.
There is no custody held through real HTTP output, no independently qualified
no-gap checkpoint, old-holder fence, full post-snapshot terminal/ACK census,
or restore/cutover proof. Real P7 acceptance, source registration, live mTLS
listener, P8 and A2 remain uncommissioned; B2 is not signed. Full integrated
review, normal hook, safe landing and connected acceptance remain open.
No frontend changes, push, dev/main/stable, command or Live activation.
