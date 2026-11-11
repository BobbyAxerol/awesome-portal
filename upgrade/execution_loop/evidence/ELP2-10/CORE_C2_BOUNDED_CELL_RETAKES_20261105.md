# Core C2 — bounded cell retakes, 2026-11-05

The first independent-custody two-PostgreSQL runner had aggregate container
limits of 4 CPU/3 GiB, above the candidate's 2 CPU/1.5 GiB cap. It finished
and cleaned up, but that run is **not** claimed as meeting the resource gate.
The runner was changed to an aggregate 2 CPU/1536 MiB, including both DBs and
the test process; tmpfs is charged to the container memory limits.

- Independent custody, bounded runner SHA256
  `83a59ce01c88d510b8a9aa90163b395fc5f8de3c498f457ff743c8eb269522d6`:
  **2/2 PASS, exit 0**, isolated synthetic original/terminal proofs and two
  disposable PG clusters, including lost response after commit and exact replay.
  Different cluster IDs alone do not establish independent failure domains.
- Owner/ACL, bounded runner `scripts/test-elp2-restore-inventory-rls.sh`:
  a run printed 13/13 but exited 127 because the runner was edited while it was
  executing; that run is **not a gate**. The stable runner was rerun and the
  same **13/13 PASS, exit 0** result was obtained. This tests candidate source,
  not an installed issuer or actual owner grant.
- 21-table local fence: initial **0/2 FAIL** because the fixture's lease TTL
  exceeded the schema maximum; its second failure depended on the first test's
  unfinished setup. After correcting the fixture and making the second test
  independent, bounded retake **2/2 PASS, exit 0**. This covers mutation in the
  named test schema only, not public identity, a stale DB clone, or HTTP/Edge.
- Delivery authority-first procedure: a setup run failed on duplicate scope
  forbidden by the real unique constraint; another setup run correctly hit the
  P5 unknown-reason issuance fence; a further run lacked the definer's minimal
  privilege needed for lease row locking. After correcting the setup and
  definer-only grant, bounded retake **3/3 PASS, exit 0**. The later exact
  UNKNOWN replay revision also passed **3/3, exit 0**, SQL SHA256
  `4d70e55fb318613d9386a6f439552aa13bf25ec7d8f1719752a5d194de6bb5d9`, test
  SHA256 `457c12ecd40e6d9d4820e6bb1760d07905e0122376abf0a4c73a570cde3f1c51`.
  It does not turn replay into a recipient ACK or permit fresh ISSUE.
- The first targeted P7 TypeScript check found eight constructor initialization
  errors. The constructors were fixed and P7 focused tests retaken **20/20**.
  A subsequent explicit-root TypeScript check exited 2 because it omitted the
  project Fastify cookie ambient types. A retake with the actual package's
  `@fastify/cookie/types/index.d.ts` included alongside five P7 source roots,
  eight P7 test roots and their transitive dependencies passed **exit 0**.
  This targeted check is not the full project build or normal hook; neither
  earlier failure is presented as PASS. It preceded the later P7 preview and
  recovery source edits, so it is not a check of the final candidate SHA.

## Subsequent focused source-only work

- P7 preview now discloses the authenticated binding's issuer, subject, TS
  user and workload reference for owner review. Focused unit, codec and HTTP
  tests passed **16/16**; the HTTP sessions and attestor key are synthetic.
  Service SHA256 `ea4cb120e6f400e13bf85d2fc906740ca2f756d49c8ae24b81851e7fe76b370a`.
  The route is unmounted and this is not owner acceptance or authority.
- Exact-original recovery now supports replay after the local terminal has
  been written and a response lost, including an unentered rollback backed by
  its recorded event. Unit tests **8/8** and a disposable PostgreSQL/mTLS cell
  **4/4, exit 0**. The cell uses synthetic source proofs and ACKs; candidate
  event INSERT privileges and source provenance are not yet qualified.
  Current-human source SHA256 `6325a06e6ea6c20e60b5ea59475170fa67dd21a7f027906899ee8efd3c594558`,
  recovery SHA256 `a1b27c8555c88565d5db5683c8530ddd037e491e7967f6f852d1ff6038aa3eef`.
  Two attempted test launches ran no tests because an outer flock conflicted
  with the script's own lock; the direct script invocation above exited 0.
- The legacy inventory now refuses known unsupported C2/fence/checkpoint
  schemas and extra candidate relations, and includes retained-review access.
  Unit tests **13/13** and disposable PostgreSQL **2/2, exit 0**, including
  real catalog negatives for an extra authority table and C2 schema. The PG
  test SHA256 is `d9db359964663540d2f4060f1433d0a40c42850e9c3ce01511a389b76024836f`.
  Old unmarked inventories cannot be compared; a legacy
  DB missing the retained-review table needs the proper schema before capture.
  The marker is not a signed proof; other unknown authority, schema owner/ACL,
  function ACL and role memberships are not comprehensively covered. It remains
  diagnostic only and the V2 restore refusal stays in force.

All disposable cell containers/networks were cleaned by their own traps. No
credentials, live tokens or unapproved DB mutations are involved. Tests remain
source-only; no A2, P7 acceptance, B2, connected ACK, production ACL, recovery
barrier or cutover is claimed.
