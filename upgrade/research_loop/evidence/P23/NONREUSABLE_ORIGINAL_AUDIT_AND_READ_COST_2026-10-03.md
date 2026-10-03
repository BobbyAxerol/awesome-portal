# P23 — original non-reusable audit and affected read cost

2026-10-03 · Codex · **NON_REUSE_PRODUCT_ACCEPTED / READ_COST_REPAIR_PENDING**.
Supersedes the R-WFO-020 execution-pending statements in the
[earlier packet](./CURRENT_CANDIDATE_AUDIT_502_RESTORE_BROWSER_2026-10-03.md),
not the full P24/DR/second-engine denominator.

## 1. Original source and isolation

Original R-WFO-020 `rrun_3258a4c450816129d2d285f25b801061`, selected native
trial 393, has nine genuinely absent OOS-generation records and null
optimizer-reinvoked evidence. No generation fact was removed to manufacture
the case. Copy the Portal DB and artifacts read-only into fresh owned
volumes, project `portal-research-p23-ol12`, loopback :8096. Original :8095
worker/parent custody and all shared users/grants/source facts are unchanged.
Fresh isolated NATS starts empty; RUN_SYNC is disabled; the copied queued
source job is not dispatched.

Runtime is the exact clean **4bc9cefe** seven-image candidate from the earlier
packet, including Claude **59d76862/2f4cb81a**. Docs-only **3a295c39** changes
no runtime. Raw replies, credentials, SQL plans and backups stay private at
`/home/bobby/.local/state/portal-research-p23/20261003/nonreuse-r020`.

## 2. Authenticated product child, not a direct-engine substitute

**19:51:04.128–19:51:18.603 UTC**, actual named prepare/read and explicit
POST admission → confined published QuantBT **1.1.1** → P05 verified ACK:

- Child `rrun_b47b38cc8abc73eda542da734c827197`, READY / AUDIT /
  AUDIT_OF_SELECTION; job SUCCEEDED; one outbox and immutable proof.
- Same intent returns the same child. Original snapshot/config/parameters
  stay pinned; **9 folds, 2,484 bars, optimizer_trials=0**,
  optimizer_reinvoked=false. No optimization, reselection or new data.
- Artifact `rart_887d5b9adde33eb533d4343e11330463f6080a24`, manifest
  `86d8bb2f7e7b529c659621d8d4ad90e4ba7c4b895287302cde843eacd88ec167`;
  verified result `7f93b08e04f86626137a1f4e3af29fe936a7f25b699d8ec56df8c87454d92ed8`.
- Actual Report/RC/Lineage bind this proof. Original parent artifact/parts/
  frozen Report unchanged; custody before/after
  `4d39ea873f8910b905e3f00056b193f885f3e5ab04d8e9499d31ae2ab0fad29f`.

Private `linked-audit-product-original-r020.json` SHA-256
`b26ccac6a63bcb6097241c186afff327aa63c9980fd1c179baadac3cfa9251b3`.
All five checks and **required_non_reuse_gate_passed PASS**. Earlier reusable
boundary proof remains distinct; per-fold causal targets are not flattened
into this global single-target profile.

## 3. New proof restart / coherent fresh restore

**19:59:00.602–20:00:20.497 UTC**: exact API restart, then stop owned
writer/worker, capture coherent DB/artifacts and restore into fresh volumes.
Twelve named GETs across original/restart/restore preserve the proof and
frozen parent core; restored worker OFF. Actual artifact-store verification
checks parent and child manifest/part bytes. Original clone custody/mounts
restored; no engine rerun or manually written READY.

`nonreuse-proof-restart-restore-close-sockets.json` SHA-256
`c6722fae0a9f60c78ade22e7e4a99b68ebfbc9f688ed6f056efecdcc389016f7`;
all six scoped checks **PASS**. Earlier failed helpers (ambiguous SQL column,
stale keepalive across gateway recreation) remain failures. Qualified SQL
and connection-close fixed the harness, not product authority/status.

## 4. New affected-reader load — actual FAIL

**20:02:15.994–20:02:35.835 UTC**: twenty distinct new isolated USER actors,
three bursts/read, **120/120 GET 200**, exact proof and job/proof counts
unchanged. No implicit compute. Seven bounded services; peak **421,879,808 bytes**.

| Read | Requests | p95 | Unchanged target | Verdict |
| --- | ---: | ---: | ---: | --- |
| Report | 60 | 547 ms | 500 ms | FAIL |
| RC | 60 | 1,710 ms | 500 ms | FAIL |

`current-linked-report-read-load.json` SHA-256
`5080d5e9a17b0fbec38aea19224f9f7f6dbc8ed0746d7aa748b9e5d508051d5d`.
Older Library/Progress PASS does not close these new paths. The earlier
Evidence-specific 500–600-ms permission is not an RC SLO waiver.

Actual-role proof EXPLAIN: **20.393 ms planning / 0.691 ms execution**.
RC acquires four separate transactions per detail. Changed-query attribution
is **4.964 ms planning / 0.694 ms execution**, not clean-runtime SLO PASS.

## 5. Minimal backend repair / tests

RC detail now reads source, actor-local draft, latest immutable pack and
P22 publication facts in **one repeatable-read read-only RLS snapshot**.
Membership is freshly checked, and all five settings/timeouts remain
transaction-local in one set_config round trip. Existing mutation fences
and separate read helpers remain; no cross-request authorization cache.

Shared proof query materializes only requested target/receipt candidates
before the remaining authority joins. Every READY/AUDIT/relationship/profile,
own and original sealed artifact, latest parent revision, target/parameters
digest and schema/binding check is retained. No cached/prepared actor plan,
new index/migration, DTO/hash/financial semantic or frontend change.
Report gets the shared query improvement without rewriting its frozen core.

Six focused service/repository/golden files **92/92 PASS**, build PASS.
Disposable RC + retained-RC migration groups **2/2 PASS**. Added proof matrix
keeps membership/workspace, parent/child mapping, duplicate bounds and eight
changed-authority negatives. Initial fixture attempts correctly hit existing
profile-pair CHECKs and same-manifest UNIQUE: use a valid alternate diagnostic
profile and a new seal with its own digest, never drop constraints to pass.
Corrected proof matrix **6/6 PASS** (including all eight changed-authority
cases); the two other real-PG files remain 2/2 PASS. Normal grouped hook gates
commit; clean-image affected-read retake is pending.

## 6. Handoff, C4 and full remainder

Claude consumes existing generated final-audit operations: explicit POST
only when may_create/target digest agree, never on mount. Additive Report/RC/
Lineage proof does not change the promoted parent selection. No UI/layout/
baseline overwritten. This profile does not admit per-fold causal audits.

Next: normal hook/landing, build **only Control**, preserve six other images
and all data; retake these two paths with the same twenty actors. Then revoke/
disable only the twenty-one fresh isolated QA actors and tear down owned cell
without -v. Preserve source/clone/proof-restore volumes, immutable bytes,
backups, failure evidence and runnable rollback images. The current owned
cell/identities await retake/cleanup, not an already-claimed C4 PASS.

Accepted: P22, real JSON 502, restored browser, original non-reuse child and
new proof recovery. OPEN: read SLO/candidate aggregation, three missing
original test manifests (83/86 strict integrity false), real second qualified
engine T07/T13/P24-T05, full P24 scenario/field/action/owner and signed release.
No remote push, dev/main, shared worker or production activation.
