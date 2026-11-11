# C2 revoke procedure with externally provisioned definer — 2026-11-05

**SOURCE-ONLY CANDIDATE. NOT A MIGRATION, RUNTIME INSTALLATION, OR RECOVERY
BARRIER.** This follows the test-only ACL limitation in
[the migrated-schema inventory receipt](CORE_C2_INVENTORY_REAL_CANDIDATE_SCHEMA_20261105.md).
The prior receipt remains accurate for that run; the separate candidate below
removes its mandatory test-database name and test-role creation from the
procedure under review, without claiming that its runtime privileges are
qualified.

The candidate requires an externally provisioned `NOLOGIN`, non-superuser
definer without elevated role membership. It creates no login, membership or
EXECUTE grant, rejects an unsafe definer, fixes the security-definer search
path, and revokes PUBLIC access. It requires a single installer transaction.
Application authentication and CSRF remain essential: passing a session ID
to this procedure is not proof that the caller possesses the session.

In the disposable migrated-schema test, an explicitly scoped synthetic role
was provisioned and temporarily given schema CREATE; the operator revoked
CREATE after installation. The test checked unsafe-superuser refusal, definer
and search-path properties, absence of PUBLIC EXECUTE, equivalence with the
previous candidate procedure body, wrong-workspace denial, successful
block-new revoke and idempotent repetition, followed by inventory/checkpoint
capture. This exercises only the declared test role and candidate schema.

- `bash scripts/test-elp2-restore-checkpoint-pg.sh`: **8/8 PASS**, exit 0,
  on two disposable PostgreSQL clusters; no `elp2-ckpt` container remained
  in the subsequent read-only inventory.
- `npm test -- test/restore-checkpoint-authority.spec.ts`: **5/5 PASS**,
  exit 0, for the focused checkpoint unit suite.
- The first run failed because the test used revision `0` after inserting an
  identity, which had correctly advanced the revision. The test was corrected
  to read the current revision from its own database; that failed run is not
  counted as PASS and the authority check was not weakened.
- `git diff --check`: exit 0 for tracked changes; the following files remain
  untracked and are not included in that check.
- Candidate SQL SHA-256:
  `82517953d95008e5a5ebf763d928fdddeb0896ee77c7da7d3860b1880bc6d7c4`.
- Test SHA-256:
  `d763b4a311b10e2913958412c69b82c017ed96fcd32bdb78a192e2252f75ddcb`.

The test definer needs UPDATE privileges for row locks; their safe scope,
ownership, role membership, installer/bootstrap ACL and restriction of direct
procedure calls remain to be reviewed and qualified. No role grants here are
approved for a shared or live database. Complete inventory coverage, physical
old-holder fencing, post-snapshot terminal/ACK reconciliation, a representative
restore drill and the integrated gate also remain open. **V2 restore remains
refused.** No frontend change, connected acceptance or A2/B2 claim follows.
