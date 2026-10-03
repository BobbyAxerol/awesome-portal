# P23 — mixed-load optimization and historical test-manifest accounting

Codex · Bobby approved 2026-10-03 · `codex/be-gaps`, landing branch
`docs/research-loop-plan`. **Implementation/focused tests in progress;
clean-candidate runtime acceptance pending.** This is not full P23/P24 GO.

## 1. Scope and baseline

Read root AGENTS, Research working rules A13, Unified P23, the full Guide
P23 matrix/§16.3 and the latest temporal candidate packet. Latest official
mixed-load baseline: Library **538 ms**, Progress **568 ms**, targets **500
ms**; far-seek, utility and outage have separate accepted receipts. Do not
repeat those drills just to increase test counts.

Only owned `portal-research-p23-ol12` / loopback :8096 is used. Original DB,
artifact volumes, backups and rollback images are retained. No frontend,
shared :8095, Execution/Trading System, production or remote mutation.

## 2. Actual performance diagnosis and repair

The first actual 20-principal diagnostic, dirty source explicitly recorded,
returned all 120 reads 200 and completed one real 92-day WFO with one heavy
slot/four queued intents. It **failed** latency: Library 811, Progress 605,
Evidence 602 ms. Peak 791,539,712 bytes. Preserve
`p23-tuned-diagnostic-workload.json`, `*-read.json`, `*-resource-series.json`
privately; this is not an official clean acceptance receipt.

A separate read-only stage probe found Library 585 ms total with one shared
SQL page (~100 ms) and aggregate (~36 ms). The remaining synchronous
per-viewer mapping/validation was the dominant cost. Progress's direct
repository burst was 244 ms; HTTP/other-read contention matters too. Query
timings are diagnostic, not a replacement for the authenticated full-body
latency sampler.

Repairs:

- Progress sets the same five transaction-local budgets/actor/workspace
  values in one round trip; runtime role, repeatable read and error mapping
  stay unchanged.
- Library validates identical DB-returned requested-spec/progress JSON
  once using weak object-identity keys, freezing source and parsed facts.
  A new object/string never inherits verification from a digest or run ID.
- Shared in-flight Library rows are immutable. Rows with different
  actor-owned RC drafts get different identities. Each actor still passes
  fresh membership/RLS checks in the original bounded read transaction.
- Library maps/validates one identical immutable card once. Mutable inputs,
  independent snapshots and changed Date values undergo normal validation.
  P19's mapRow remains the normal uncached validator. Facets, timestamps,
  page bounds, 4-active/16-queued lane and data/auth freshness are unchanged.

No persistent data, authorization or cross-request digest-keyed cache was
added. Weak keys disappear with the actual DB snapshot population.

## 3. Historical DR exception, not byte recovery

These exact old disposable-test losses retain their original revision 1,
expected manifest digests and ten part records each:

| Artifact | Run | Expected manifest SHA-256 |
| --- | --- | --- |
| `rart_0a356b7ee5c8e6f85ebeeb9ca416c1a347229b0f` | `rrun_1690a9830787332de93d93d457c8aa0e` | `56c8b524678fadc63d9dd6c03b3c566197648a3a7699828fa75d00a3cdd17039` |
| `rart_64469653604a37d46833ed048ba75c1d7e864b60` | `rrun_e2c3a4d31decb9f5d77b77fe49616fdb` | `1a19fbcd9a32ebe38b1a87267060eb1441e59ba2dcfb1ecdb9f96fd3cd626866` |
| `rart_830fa0d721d3817db2c4881b54c1cd84fa3306a0` | `rrun_c93896666b0f3f1647aaa4967ce8c792` | `1bec68a3dee37597557a42fa10a0af5b258e09a516a7367dcd4e92363be47a53` |

Actual readback refines the old "zero references" description: zero P05
retention pins, RC/publication/promotion/selection/exposure/audit links, but
**one retained DB seal and one frozen Report per run**. Those copies are
preserved/disclosed, not claimed as proof of lost artifact byte custody.

The explicit `--account-exact-historical-test-loss` mode requires partial
capture and an exact three-ID/run/workspace/revision/digest/part-count set.
It verifies all nine dependency counts and full DB/artifact parity before
accounting for the known losses. A changed count/digest, missing dependency
proof, duplicate/fourth loss, corrupt present part or foreign cell refuses.

Default strict integrity remains unchanged. Even accepted accounting leaves
`full_store_integrity_passed=false`, `byte_recovery_performed=false`, and the
restore CLI's `passed=false`/exit 1. No row deletion, reseal, hash rewrite or
synthetic byte recovery is performed. Distinguish coherent restoration of
the verified population from irrecoverable original test-byte loss.

## 4. Tests, identity hygiene and required final receipt

First six focused Control suites: 56/56 PASS. The first build exposed a
generic Zod input/output inference error; the parser now explicitly accepts
unknown input with the schema's actual output, and the build passes. Added
projection-sharing/actor-draft/fresh-snapshot/Date regressions are being run
before the normal grouped hook. Node restore/exception/mixed/identity harness
files pass; negative fixtures never substitute for actual restoration.

Recreated isolated bootstrap left twenty retired readers ACTIVE with
must-change-password. Their old passwords therefore could not authenticate.
No logs or credential store were mined: normal owner activation/reissue and
password-change APIs recovered only these QA accounts, keeping tokens in
0600 state. Actual enable receipt records **20 QA activation reissues**;
never claim that no credentials changed. Bobby/Stan/Thanhvuong are untouched.
Final C4 must disable all 21 non-owner QA accounts, revoke sessions, preserve
the owner anchor and remove only owned cell containers/network, no volumes.

Next: commit the coherent implementation via normal hooks, name the clean
candidate/images, retake mixed-load without concurrent builds/faults, then
coherent restore/exception accounting on that same candidate. Record real
latency/resource/hash/restore outcomes and failures here before closeout.
P23 engine-two, independent WFO/browser and P24 remain separate.
