# P23 — current candidate, workspace diagnosis and exact C4

2026-10-03 · Codex · **AFFECTED_READS_ACCEPTED / RESTORED_WORKSPACE_BROWSER_FAILED**.
This is a later amendment, not a new phase or whole-product GO. Preserve all
earlier receipts and their denominators. Private root:
`/home/bobby/.local/state/portal-research-p23/20261003/nonreuse-r020`.

## 1. Source and actual accepted changes

Backend/shared clean `128276d70a8f0d47e69617d8dcaedf4fed05cfde`; previous
`69b5a81c` / `4b845a3a` failures remain separate. New coherent source repair:
five files **+95/-12**, one fresh seal-bound RLS companion query, exact-current
pure verification reuse, and regression for changed current bytes with the
same advertised digest. No authority/source/actor cache, UI/hash/financial/
SLO/budget/DTO/migration alteration. Normal hook **267 contracts / 1,930
Control PASS / one named skip**. No second manual full suite.

Control-only clean build and eleven compiled hashes match. Actual new
twenty-user HTTP: **Report 377 ms / RC 487 ms**, original 500-ms targets,
120/120 responses 200, unchanged original Report/RC fingerprint and jobs/proofs.
Peak **435,445,760 bytes**. [Full read-cost evidence](./EXACT_JSON_READ_COST_REPAIR_2026-10-03.md#6-clean-128276d7-retake--affected-report-and-rc-accepted).

Web remains `9490db8b…`, bundle `index-C41KmM2A.js`; exact script SHA-256
`215b10a6ee9c90832b0b61f2531d07cc2efdb2a15d2913709a9a06fd7203ad28`,
index `558c8b22fb0dcf078c64653beb77326b33cd2f3f71eea2589b15db56331dd649`.
No frontend/Python/roadmap source diff from `4bc9cefe`. Claude `59d76862` /
`2f4cb81a` is included; newer `d0569d49` contains only two evidence JSONs.
Its reported 228/228 lane and W5 counts are acknowledged, not presented as a
fresh full P24 run on the new backend. All seven pins and per-evidence scopes
are in [candidate v3](../P24/current-source-candidate-manifest.v3.json).

## 2. Affected restored-proof browser — actual failure and diagnosis

Reused the already verified new-proof restore volumes, worker OFF, current
Control image and exact index/bundle. No new backup/engine/admission/reseal.
The first S09 named response was **404**, so the four planned S09/S11
viewport routes did not earn a PASS. Normal browser logout and original
clone DB/artifact mount/custody restoration completed in `finally`.

Read-only confirmation on the same existing QA actor, using normal password
login and explicit normal logout, yields:

| Named read | Personal workspace default | Explicit run workspace |
| --- | --- | --- |
| Report | 404 `RESEARCH_REPORT_NOT_FOUND` | 200 |
| RC compose | 404 `RESEARCH_RELEASE_CANDIDATE_NOT_FOUND` | 200 |

The actor already belongs to the run's workspace but owns a different
personal workspace. No membership/role/owner/password was changed.
`SessionGuard` intentionally attaches personal workspace; Report/RC
controllers accept and validate explicit `workspace_id` and fresh membership.
This is **not** evidence of missing source data, failed restoration or a
reason to widen RBAC. Older 30/30 restored-browser receipt remains accepted
for its own personal-workspace fixtures; it does not prove this new
cross-workspace non-reusable-parent journey.

### CG-P23-WORKSPACE-01 — precise frontend handoff, Claude-owned

Preserve rich composition/design. In `ReportRoute.tsx`, carry the authorized
selected workspace into `useReport` and `useReportExport`. In
`ReleaseCandidateRoute.tsx`, carry the same scope into `useRunStatus`,
`useReleaseCandidate`, pack/publication reads and explicit writes. Hooks and
generated clients already accept workspace. Preserve scope through run/pack
links, back/refresh and deep links; do not scan every membership, choose the
first accessible workspace or infer it from a run label.

Done when: normal actor's own workspace still works; a member opens this
existing shared-workspace run via an explicit scoped link; S09/S11 at
1280/660 send that exact workspace and render 200 on restored proof; changing
workspace invalidates held/ETag/status state; removed/foreign membership
still refuses; reads create no jobs. No fixture/HAR/network rewriting, owner
impersonation, UI baseline update or granting Governance approval rights.
If no selected-workspace route context has been agreed, Claude records that
contract/design decision rather than manufacturing cross-workspace authority.
Codex has not edited `apps/portal/frontend/**` in this slice.

Existing separate handoff: generated `researchLinkedFinalAuditGetV1` /
`researchLinkedFinalAuditCreateV1` and additive proof are published. Product
must consume them explicitly with `may_create`/target digest/idempotency;
never start a child on mount. Backend child acceptance is not button receipt.

## 3. Exact private receipts, no business bytes or secrets in Git

| File | SHA-256 | Actual disposition |
| --- | --- | --- |
| `read-cost-v3-candidate-identity.json` | `f2409208ce77f9ad8aa972a2708ab5859797bd1572a24012445f379c83fb6735` | Clean source / eleven compiled modules / other images unchanged |
| `linked-report-read-load-companions-clean.json` | `f3f97668ffe3bc50a20a1438516b3d582b2cc6117288b3abb3cbaea93ca16dae` | Affected SLO PASS |
| `current-restored-audit-browser.json` | `d982d786e58d52a41a1c05b62b531af3a2404aa942baf647dce69eaa8bce26a7` | FAIL 404; session and original mounts restored |
| `workspace-reader-confirmation.json` | `233d02090d1429b0d039325f6ac880de3a3161ca023252f2c0a01fbb1f266a6b` | Four actual scoped reads / normal logout PASS |
| `restored-proof-qa-cleanup.json` | `e00c2e7c0fc0a32445b3d038ecc69e9b36c2acc91ad101acc6ccb6d06e538e5b` | One restored QA disabled, sessions/compute 0, custody unchanged |
| `clone-source-receipt.json` | `abb6bb2cfad4bc32e52284da42983f26aa0c16a6276911d9ec90187b2ca9957b` | Final cleanup appended: 21 clone QA disabled; shared source/worker unchanged |
| `completion-capacity.json` | `582e553c178ff7afc16f29958f037997c3ffc0fc38837f7265b39e8ec865fd92` | Owned containers/networks 0; no prune |

Earlier helper failures are not product PASS: stale QA cookie yielded 401
before a read; an empty JSON logout body yielded 400; immediate inspection
after Docker auto-remove observed a terminal removal race. Corrections used
normal existing credential login, `{}` logout JSON, and bounded terminal
observation. Restored cleanup was then verified read-only, not performed a
second time. Raw failed/actual evidence stays private; no original receipt
is overwritten as a success.

## 4. C4 and full requested goal

Clone: exactly **21 newly created QA identities disabled**, active QA sessions
0, running/claimed/cancel-requested compute 0. Restored snapshot contained
only **one** of those new QA identities: disabled, active QA sessions 0,
active compute 0; immutable proof/Report custody matches its pre-cleanup
digest `0f96946ab70b30fd031feb6d70d4c3b1770da5f4ad32d8357df24196c9ee75d2`.
Copied source QUEUED history is retained, not called zero nonterminal jobs.

Owned :8096 containers/networks and temporary restore-PG container **0**;
all source/clone/restore volumes, archives, failure evidence and current /
rollback images preserved. No password resets, activation, original owner /
Bobby/Stan/Thanhvuong changes or shared :8095/Production restart.
Capacity 22:40:07 UTC: **193,546,948,608 bytes disk free**, 71% used,
**12,798,124,032 bytes memory available**, swap 0. Cache deletion
`NO_ACTION_NEEDED`.

Accepted within exact scopes: original non-reusable admitted child/P05 ACK/
Report–RC–Lineage and restart/fresh restore; P22 six-GET runtime; genuine
JSON502/browser; prior 30-route restored read/render; new affected-read SLO.
Not complete: the new restored cross-workspace browser consumer; original
three lost historical manifests or Bobby disposition (**strict 83/86 false**);
real second qualified engine T07/T13/P24-T05; full P24 field/action/scenario /
owner acceptance and existing signed-release/SBOM/provenance workflow.
No remote push, dev/main merge, release dispatch or production action.
