# C2 inventory against migrated and candidate schema — 2026-11-05

**DISPOSABLE DATABASE ONLY; NOT A PRODUCTION PROFILE OR RESTORE GATE.** The
two-cluster checkpoint test now creates a second uniquely named database in
the disposable source container, runs the repository migrations through 0158,
and installs the current candidate SQL for current-human, P5, P7, B2,
BLOCK_NEW, delivery and the local generation extensions. It then captures and
replays the source-derived inventory checkpoint against the independent
cluster. No production, preview, stable or shared database was accessed.

Result: **8/8 PASS**, including the migrated/candidate schema test, synthetic
schema/row/limit negatives, local authority-lock contention and exact replay.
Script teardown removed its two clusters and internal network; the subsequent
read-only `elp2-ckpt` container check was empty. `git diff --check` passed for
tracked files. The repository's full typecheck, full hook and restore drill on
a representative historical copy have **not** been run here.

Important limitation discovered during this check: the current frozen C2
inventory and 18-table local-fence candidate include `procedure_scope_pin`
from `c2-block-new-procedure-acl-candidate.sql`, whose database guard and role
setup explicitly restrict it to **test-only** databases. The green result
therefore validates this particular test candidate profile only. Before any
real installation, Core must replace/review that ACL and profile under actual
ownership, permissions and lifecycle, then rerun the affected qualification;
the test-only roles/schema must not be copied to runtime.

Local uncommitted SHA256: inventory
`0df0416fe528752d9ba0b4217d33592325b8be85930a470b62b1e60d90520650`,
checkpoint `4b794927120a10bcd0d789f9f47b024c50d2eb8977139dd245f436d3fd363c5d`,
test `cf8ec6a21aa1f4b41e27738d3957ab3e4b8e0944630a5bb8a30c46ad50f7af0b`.

Still required: a qualified production schema/ACL and complete scope, an
independent old-holder/in-flight fence, source terminal and ACK census,
representative restore/restart and final integrated gate. Restore V2 remains
refused. This introduces no frontend contract or action for Claude.
