# Current-human PostgreSQL regression — 2026-11-05

**SOURCE_ONLY; NOT CONNECTED ACCEPTANCE.** Branch `docs/research-loop-plan`,
base `2faa8968fddbde59b2e59525e334ba3d83886144` plus shared uncommitted WIP.

The 110 current-human tests previously skipped without `TEST_DATABASE_URL`
were run against a fresh disposable PostgreSQL cluster using the isolated
`scripts/test-elp2-current-human-pg.sh` runner (2 CPU aggregate, 1,280 MiB
container memory caps). No Portal runtime, real identity or persistent volume
was used. The runner tears down only its uniquely named test containers and
internal network.

The first execution was **109/110**: the rotated signing-key test expected a
late `CURRENT_HUMAN_ASSERTION_CHANGED`, while the source now rejects an
unmatched pinned key earlier with `CURRENT_HUMAN_ENTRY_NOT_AVAILABLE`. The test
was updated to assert that actual fail-closed response and verify no replacement
lease was created. The full final rerun exited 0: **110/110**; duration 74.58 s.
This verifies the disposable candidate, not a real source ACK, A2, or G2.

| Input | SHA-256 |
| --- | --- |
| `scripts/test-elp2-current-human-pg.sh` | `cc00ebfd92b9501074a6a16232c43f6cb9f2e311844835db478651c515a9472c` |
| `elp210-current-human-candidate.spec.ts` | `d61b8185c430c7df809f4074e4ccf12cafd8a71ca6eed8098357a7f6dd94de7f` |
| `current-human-candidate.ts` | `5fcc10b4520bb0c8f3614c972a24bb9747829ede9ac7b0b2cd1c76103004e990` |

Final candidate integration, normal hook, qualified custody/ACL, real source
and owner acceptance, recovery fencing and connected A2 remain open. No B2
signature or release is asserted.
