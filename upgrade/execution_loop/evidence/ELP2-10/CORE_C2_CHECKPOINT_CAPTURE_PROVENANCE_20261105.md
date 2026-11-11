# C2 checkpoint capture provenance — 2026-11-05

**SOURCE ONLY. V2 restore stays refused; this is not an old-holder fence,
complete post-snapshot ACK census, production migration or cutover approval.**

## Finding and change

The checkpoint candidate previously returned the same receipt shape for a
caller-supplied digest and an inventory actually captured by Core under source
table locks. A consumer could not distinguish these two observations from the
durable event. This was an incomplete candidate design, not proof of an
exploited runtime: the component has not been installed for production use.

Candidate events and receipts now explicitly carry `CALLER_CLAIM`,
`DRAIN_BOUND_CLAIM`, or `LOCKED_SOURCE_CAPTURE`. The selected kind is
domain-separated into the version-2 event hash, checked when verifying every
event, and part of idempotent operation matching. A caller cannot request a
stronger kind by supplying an extra input field or invoking the class's
ECMAScript-private append helper. Replaying a locked-capture operation through
the caller-claim path conflicts even when the caller knows the stored digest.

`LOCKED_SOURCE_CAPTURE` says only that this code path captured its declared
local table profile while holding its stated locks. It is not protection
against a compromised process or an independently privileged authority-DB
administrator, nor proof that another cluster/failure domain is independent,
that all source ACKs are covered, or that the old holder is fenced. Source
ACL, authenticated external observations and the actual recovery barrier
still need implementation and qualification.

## Compatibility and validation

- The unmounted **candidate-only** SQL gains a non-null `capture_kind` and
  event hashing changes from v1 to v2. Existing v1 histories are **not**
  silently relabeled or migrated; the candidate is incompatible with them.
  Do not apply this SQL to an existing authority store. A separately reviewed
  migration/lineage and backup/restore plan is needed if one is ever used.
- SQL-flow unit tests: **6/6 PASS**, including kind tampering and input/helper
  shadowing. Focused strict TypeScript on the changed module and unit test:
  exit **0**; this is not the full project typecheck.
- Two disposable PostgreSQL clusters: **8/8 PASS**, including actual migrated
  Portal schema + candidate schema, lock/replay, cross-kind rejection, and
  detecting a changed stored kind. This is not a restore of representative
  production data or a qualification of an external source. Test containers
  and their named network were absent in the subsequent read-only check.
- `git diff --check` passed for tracked files; the listed candidate files are
  untracked, so that check does not cover their contents.

| Input | SHA-256 |
| --- | --- |
| `restore-checkpoint-authority.ts` | `af307d10f82ee4172602c364c429b3d01680b6702c37c7cd9c784fbead0f711f` |
| `restore-checkpoint-authority.sql` | `45c738aa01ae504aa6f0174d1435b03336726e96578c52ca89192a81f3394b33` |
| `restore-c2-inventory.ts` | `0df0416fe528752d9ba0b4217d33592325b8be85930a470b62b1e60d90520650` |
| `restore-checkpoint-authority.spec.ts` | `f8b6f06c799eb6fb297f5508eaddb446cc36226979169f04ccdb0b3902d6fc03` |
| `restore-checkpoint-authority-pg.spec.ts` | `5b3b9cad667211e4404b0c3b415dce4e5206826882e2e95eb2aa4a14816a6336` |
| `test-elp2-restore-checkpoint-pg.sh` | `37b4c824a46fc1bc6eff4392e277da20fed472a8c5353913639527998991c50e` |

No UI contract changed. Remaining work includes an independently controlled
checkpoint/old-holder fence, complete source terminal/ACK reconciliation,
real restore/restart, final-candidate review, migration and normal hook.
