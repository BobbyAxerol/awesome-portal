# P23 T14 — actual R1/publication graph and coherent restore checkpoint

2026-09-27 · Codex · `docs/research-loop-plan` · isolated project
`portal-research-p23-ol12` on loopback `127.0.0.1:8096` only. Application
candidate `19a8e81362e0e6aa3e09ad1a1c224db226c37455`; the later harness
checkout does not claim to be the application image. No shared preview 8095,
dev/main, Production, AWS-HK or Trading System mutation.

## Exact supported authority path

The existing source-backed WFO Release Candidate `rc_06GE8RZMKKJKK9WD166GZZ1EN0`
was already DELIVERED with one R1 approval PENDING@1. The owner test identity
was requester and artifact creator; it correctly could not approve its own
request. Reader-01 was already an active member of the exact test workspace
and had **no** Governance capability: its R1 detail GET returned 403. No
membership, role, owner anchor, password or expiry row was edited.

`approval-graph-receipt.mjs` used the published owner step-up and finite
`POST /api/admin/profile-access` to grant only
`governance.r1.decide` for that workspace. The USER/member's access/self read
then showed the scoped capability without owner authority, and R1 detail
reported an independent approver. Its actual evidence-set hashes fed the
published plan/apply API. One apply approved R1 at version 2/quorum 1; repeat
apply replayed the same operation. The server-owned P22 trigger appended the
immutable APPROVED@2 settlement and exactly one P19 promotion-pick fact.
The canonical publication read returned `promotion_pick.state=WRITTEN`; the
original P22 receipt/pack/RC reference bytes were unchanged.

Finally the owner revoked that **one** grant through the published DELETE
with expected revision and a distinct idempotency key. Reader R1 GET again
returned 403; active reader grants = **0**. Hashes of the original user,
membership, SEALED artifact and artifact-part rows were unchanged. This was
not a generic Trading CLI or Execution command. A prior proposal to insert
workspace membership directly into SQL was rejected and was **not run**.

## Actual DB+artifact recovery and GC readback

The P23 restore tool first refused an expired owner test session; normal
password login refreshed the existing namespaced test sessions, with no
credential reset. The retake used the existing pinned application images,
quiesced only this project, backed up the coherent DB+artifact pair and
restored to two **new, exact-label empty volumes**. It compared all 139 table
hashes plus roles, memberships, schema/constraints and functions, then
verified **16 SEALED artifacts, 127 parts and 753 files** byte-for-byte.
Five authenticated Progress/Evidence/Search/Report/Replay reads passed with
the worker off. The original volumes and seven services were restored without
`-v`, migration, bootstrap or resealing. The post-restore readback confirmed:

- R1 remains APPROVED@2, one decision, settlements PENDING@1 + APPROVED@2;
  exactly one promotion-pick fact and unchanged publication/pack/reference
  hashes.
- The actual source case has **null selected trial and null selection**;
  the RC artifact is SEALED/`RESEARCH_EVIDENCE`, has its durable
  `RELEASE_CANDIDATE` reference with no expiry, and fails the GC query's
  “no durable reference” condition. No sweep or deletion was run.
- The temporary reader capability remains revoked (R1 GET 403, active grant
  count zero) after recovery. The original user/member/artifact byte hashes
  and all restored table/artifact hashes match.

All seven restored containers have new container IDs and the **same seven
recorded image IDs**. `identity.json` is the immutable build/up-time receipt,
not a live container-ID registry; it was deliberately not rewritten after the
restore. The restore tool checks the recorded image IDs and exact original
volume mounts before and after its drill.

**Verdict:** actual nonempty R1/RC/null-trial/promotion-pin restore proof
**PASS in this scope**; **P23-T14 remains PARTIAL**, not full PASS. The
current-source cell publishes zero `exposure_facts` and zero
`AUDIT_OF_SELECTION` child runs, so it cannot prove those two mandatory T14
reference cases. A pure-policy fixture or fabricated SQL row will not be
reported as real source evidence. The final-audit child/exposure source path
must be exercised through its supported producer when available; absence is
recorded, not silently waived. Other P23 gates and P24 remain open.

## Evidence, tests and cleanup

Private 0600 root:
`/home/bobby/.local/state/portal-research-p23/20260927/runtime/`.
No cookies, apply token, raw market rows, DB dump or artifact bytes are in Git.

| Exact private receipt | SHA-256 |
|---|---|
| `approval-graph-r1-graph-19a8e813.json` | `e1130ac0e66bc37e8b64afd2edabc60de796bb417a8c5866cf55999081c52b91` |
| `restore-approved-graph-19a8e813.json` | `aaa7f6be03391542ff71163f9ec47282daa467a90121532324df7e56e1182c23` |
| `approval-graph-postrestore-19a8e813.json` | `da0ddcc42e4ae338fccd9b1e8c8b2347abc704f18c55026c507df85c2b41f60e` |

`node --test scripts/research-p23/approval-graph-receipt.test.mjs`:
**2/2 PASS**, including refusal of missing/rewritten pins, duplicate
settlement/promotion and invented selected trial. The actual approved R1 is
irreversible in this disposable cell, so after the successful runtime run
the helper received only failure-path hardening (lost grant ACK recovers the
exact active grant via owner GET before revoke); it was not replayed to create
a second approval. The retained runtime receipt and post-restore readback,
not the unit fixture, support the scoped verdict.

C4 snapshot after the drill: root available **278731616256 bytes** (59% used),
Docker images 40.27 GB/26.06 GB reported reclaimable, build cache 74.24 GB/
16.55 GB reported reclaimable; these host-wide figures are **not permission
to prune**. This project has seven active services, two exited one-shot
containers, original volumes and named restore volumes. Actual runner units
`portal-gh-ci-publish-runner.service` and `portal-gh-deploy-runner.service`
both reported active; neither was touched. A first query used the wrong
CI unit name (`portal-ci-publish-sgp1.service`) and returned inactive; it is
not treated as the runner state.
Cleanup decision: **NAMED_FOLLOW_UP `P23_FINAL_SCOPED_TEARDOWN`**, not yet due
while P23 qualification remains active. Revoke test sessions at qualification
end, retain receipt/backups until reviewed, then inventory exact project
labels/mounts/volume provenance before any approved bounded cleanup. No
material data was deleted in this checkpoint.
