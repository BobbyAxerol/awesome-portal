# C2 checkpoint column ACL and routine observation — 2026-11-05

**SOURCE ONLY; NOT A RESTORE/CUTOVER AUTHORIZATION.** Branch
`docs/research-loop-plan`, committed HEAD
`2faa8968fddbde59b2e59525e334ba3d83886144`. Source, tests and this receipt
remain in the shared uncommitted WIP. No product database, source permission,
runtime, grant or Edge service was changed.

## Change

The fixed C2 inventory digest now includes per-column ACL as well as table
ACL, and observes C2/local-write-fence functions and procedures including
their identity, owner, EXECUTE ACL, security-definer flag, configuration and
definition. The routine list is bounded at 10,000 and unsupported
aggregate/window routine kinds fail closed rather than being omitted.

The inventory digest is domain-separated as `candidate.v3`: a previous v2
capture must not be silently presented as the new observation. Existing
checkpoint events are not rewritten; replaying an earlier operation against
changed inventory may conflict. Compatibility, an approved forward strategy
and exact dependencies need review before installation or receipt reuse.

This is **observational only**: table SHARE locks do not stop role changes,
routine DDL, privileged changes, old database clones, source/recipient ACKs
or in-flight HTTP. The routine query does not cover all public-schema code,
role membership, external authorities or independent administration. It does
not qualify a definer or establish the correctness of a function. Do not
activate restore, cutover or an issuer from this digest.

## Verification

- `bash scripts/test-elp2-restore-checkpoint-pg.sh`: final retake **8/8 PASS**,
  exit 0, with two disposable PostgreSQL clusters, synthetic identities and
  a separate disposable database with the repository migrations and candidate
  schema. The focused case checks column-only grant, non-trigger function
  body and EXECUTE-ACL drift, unsupported aggregate refusal and restoration
  to the baseline; the existing freeze, unresolved and replay tests remain.
- An intermediate retake was **7/8, exit 1**: the test incorrectly expected
  `REVOKE` followed by `GRANT` to reproduce an implicit PostgreSQL ACL byte
  representation. The test now preserves this conservative distinction and
  recreates only its own `TEST_ONLY` routine to restore baseline. The final
  retake above includes that correction. No failed run is counted as PASS.
- Strict focused TypeScript check for `restore-c2-inventory.ts`: exit 0.
  `git diff --check`: exit 0. No full project typecheck or normal hook ran.
- Test containers and network were absent after the final harness exit;
  pre-test filesystem was 57% used, 270 GiB free. No volume was removed.

| File | SHA-256 |
| --- | --- |
| `restore-c2-inventory.ts` | `499ab07e55a8a5d47fa774e2947f406cc5cdc72a078aca8d5bdbe4b1e124b4ca` |
| `restore-checkpoint-authority.ts` | `52265367d3f11b773fc9b166deb00b9d54caa7c988e66e0bfee09d5368bb5ce3` |
| `restore-checkpoint-authority-pg.spec.ts` | `17dd14a763489ae8982749ba62f9f74965e378aec337eeb6c1b3272cc4279262` |
| `test-elp2-restore-checkpoint-pg.sh` | `37b4c824a46fc1bc6eff4392e277da20fed472a8c5353913639527998991c50e` |

## Next and handoff

Core still needs independently controlled authority and key/role boundaries,
old-holder and HTTP fencing, complete source/recipient terminal and ACK census,
and representative restore with final candidate/schema. V2 restore remains
refused. P7/A2, financial/source connection, G2 and browser acceptance remain
open. No public contract or frontend consumer change is introduced.
