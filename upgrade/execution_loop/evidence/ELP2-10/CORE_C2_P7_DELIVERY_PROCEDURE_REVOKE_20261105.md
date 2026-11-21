# C2 P7 revoke with bounded delivery procedure — 2026-11-05

**SOURCE ONLY / NOT COMMISSIONED.** On `docs/research-loop-plan` at committed
HEAD `2faa8968fddbde59b2e59525e334ba3d83886144`, this candidate and its tests
remain uncommitted. No protected database, Research runtime, Edge source,
credentials or frontend were changed.

## Change and test

The unmounted P7 delivery guard is exercised through the existing bounded
`SECURITY DEFINER` delivery procedure, using a restricted PostgreSQL login and
the local recovery generation fence. Its own separate, externally provisioned
NOLOGIN definer has only the reviewed row-lock column grants. The candidate
installer rejects a privileged owner, membership of the definer by the test
login and an additional UPDATE grant on the registration identity. It neither
creates roles nor installs grants on a product database. The preflight is a
point-in-time check; actual installation and subsequent ACL change controls
remain to be reviewed.

`bash scripts/test-elp2-restore-inventory-rls.sh c2-delivery-procedure`:
**4/4 PASS** on disposable PostgreSQL, with cleanup by the runner. The P7
test reserves one synthetic original, holds its `SENDING` transaction while a
competing revoke waits on the authority lock, rolls that transaction back and
commits the revoke. A subsequent `SENDING` and a fresh `RESERVE` are refused;
`UNKNOWN` for the same original is retained without asserting an ACK. The
test-only revoke function bypasses real human authentication solely for this
isolated race; it is not a product authority or connected acceptance receipt.

An earlier harness attempt prepared test rows as the administrator *after*
enabling the local generation fence and was correctly refused as
`V2_LOCAL_WRITE_FENCED`. Test data was moved before fencing and the isolated
revoke was invoked through the admitted test login; the fence was not relaxed.
`git diff --check` passed for the tracked worktree diff.

## Pins

| File | SHA-256 |
| --- | --- |
| `c2-p7-delivery-definer-candidate.sql` | `887dc98c851ae681316ff4f0123bfeaabbbccbd0166799ab229f36f5aff2aee9` |
| `c2-p7-delivery-fence-candidate.sql` | `d150a7d3cc36643a0e802de46bff9c2e244cc27aeeaebae7ffe1b3cda1b5be7d` |
| `c2-delivery-procedure-acl-candidate.sql` | `04c82994c7ac37c1af7ee3fcbfe47b0f67cc28c3b90bc1fa73a7e0784e6e1e6a` |
| `c2-delivery-procedure-pg.spec.ts` | `eab4a6f27aaa896b2ca5291c0a6e354791f4d2d3bbf0563be4f58b20107af329` |
| `test-elp2-restore-inventory-rls.sh` | `4ab1ab6d37df81c27b5c2238b6f2b1c67d37b9722a3eff65bee220bc99e09089` |

## Still open

The test does not hold custody through an actual HTTP write: revoke can race
after a committed DB transition. Neither a committed pre-revoke send nor the
source terminal/ACK and receipt completeness were demonstrated here. Real
owner acceptance, P7 issuer, migration/role installation and ACL drift
protection, independent recovery V2, Edge qualification and the final hook
remain open. Continue blocking V2 restore and fail closed on the issuer; do
not reinterpret `UNKNOWN` as delivery or manufacture a terminal/ACK. No UI
or frontend contract action is requested by this source-only test.
