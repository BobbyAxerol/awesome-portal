# C2 original custody — authenticated journal candidate, 2026-11-06

**SOURCE/TEST ONLY. NOT independent authority, qualified P7, restore, A2, or connected acceptance.**

## Goal, scope and inputs

Follow through on the bounded SQL-writer forgery reproduced in
[the prior receipt](CORE_C2_CUSTODY_BOUNDED_WRITER_20261106.md): a writer could
append an invented event and compute an unkeyed chain. This work is in
`/home/bobby/portal-research`, `docs/research-loop-plan` at
`2faa8968fddbde59b2e59525e334ba3d83886144`, with shared tracked and untracked
WIP. It is not a frozen candidate and does not install schema or change runtime.
Only disposable local PostgreSQL clusters were used; no Edge or business data.

## Candidate implementation

- A separately selected 32-byte HMAC key authenticates each journal event's
  custody ID, both database system identifiers, operation, generation, event
  hash and key ID with domain separation. A key commitment is included in the
  new binding digest, so selecting a different key under the same ID changes
  the binding. Actual key provenance and custody are **not** established here.
- A separate additive, unmounted SQL candidate holds event authentication with
  an immutable trigger. Event and MAC are inserted in the same authority
  transaction; inventory, preflight and append reject absent or invalid MACs.
  Unsigned historical records are not retroactively authenticated or invented.
- For new C2 issuance with the C2 delivery pin, the issuer refuses a custody
  configuration without the authenticated journal. The original v1 binding is
  unchanged when that optional selection is absent. Recovery of a previously
  issued original remains tied to that exact legacy binding and lease; it is
  not silently upgraded to a new original. Legacy configuration remains for
  compatibility and is **not** an independently qualified custody path.

## Tests and disposition

| Test | Actual result and boundary |
| --- | --- |
| `bash scripts/test-elp2-c2-p7-pg.sh owner-intent` | **9/9** on disposable PG, including refusal of new unprotected issuance and recovery of the same test legacy lease/token; test fixture, not an owner acceptance. |
| `bash scripts/test-elp2-independent-custody-pg.sh` | **6/6** on two disposable PG clusters. Bounded SQL role reuses a legitimate MAC on a forged next event; inventory, preflight and append reject it. Missing privilege, wrong key and unsigned legacy journal are also refused. |
| `npm test -- test/restore-c2-journal-authenticator-candidate.spec.ts` | **2/2**, covering MAC inputs, key snapshot/commitment and invalid values. |
| Narrow strict TypeScript check for authenticator and its unit test | **Exit 0**. Not a full integrated typecheck. |

The first integration test attempt for the added legacy scenario used `false`
for a configuration that accepts only `true` or absence; it failed and caused
dependent tests to fail. The fixture was corrected to use absence. A later run
was interrupted (exit 143) and was **not** counted. The final 9/9 above is the
completed retake. The first sandboxed PG launch was denied by the environment;
the authorized isolated retake produced the results above.

## Pins

SHA-256 of local WIP inputs, not committed image/runtime pins:

| Input | SHA-256 |
| --- | --- |
| `restore-c2-journal-authenticator-candidate.ts` | `2cccd9231195eb4027d8365de3a077e807d5a3b998259c8e71feb609c7854e18` |
| `restore-c2-journal-authentication-candidate.sql` | `e6cc1cb27ebdfe4f42f3a1da4498fad13a9ac9a281f6e77e81e27a64626d0c08` |
| `restore-independent-custody-candidate.ts` | `7cfba9f03915bb1e5bf2cdb42b907ab427e661bcb13c2e648ec01c226d7520a0` |
| `current-human-candidate.ts` | `ccc2f6b084a3c847761109f41f7cf75e61464528f9a518e93b35d83a2191888c` |
| authenticator unit test | `7e8e7c9fceb295e8976b5f0b2ff8e7397551ac0739a42fbf8dcf574176f735e8` |
| custody PG test | `d24cfd5f4c89a940180a23eb3f5d49a36fac43c10f7178571821f4b587328011` |
| P7 owner-intent PG test | `7087f2b84b1699857f3e19f72dd35f70840e42974c005bbc1ee530a6f00e48f1` |
| custody PG runner | `83a59ce01c88d510b8a9aa90163b395fc5f8de3c498f457ff743c8eb269522d6` |
| P7 PG runner | `daa31f5783e43c1812dc355ab0a3e9e505aa54b3ca3b347ae544c9f3e15f60da` |

## Remaining work, rollback and handoff

A MAC prevents the demonstrated SQL-only writer from producing a valid new
event without the key; it does **not** stop denial of service, rollback to a
previous valid prefix, a compromised key/process, privilege or DDL drift, or
the omission of source terminal/ACK facts. A separately controlled key and
monotonic witness, old-holder/source/HTTP fences, real terminal/ACK tie-out,
restore rehearsal and final integration are still required. Do not deploy,
enable issuer, authorize restore, or declare P7/A2/ELP2-10/11 PASS on this test.
The additive SQL is uninstalled; rollback at this stage is simply to leave the
candidate unmounted, while preserving all originals and existing WIP. CPU/RAM
peak was not measured. Test runners own and clean their temporary resources.

No frontend contract or consumer action is requested for this backend-only
candidate. Claude may continue fixture/consumer work independently. Edge remains
the sole upstream coordination point; no new connected source receipt is
claimed. Next Core work: independently pinned monotonic witness and recovery
barrier, then reconcile/review candidate and run the affected integration gate.
Full normal hook remains pending on the frozen integration candidate.
