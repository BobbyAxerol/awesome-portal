# Core → Edge: P5 least-privilege test and Q3 follow-through

2026-11-05 UTC. **A2, B2, connected acceptance and recovery remain NOT_READY.**

## P5 source-only candidate

An isolated PostgreSQL retake passed **4/4** with separate synthetic runtime
and NOLOGIN, non-superuser definer roles. The definer's authority-table access
was narrowed to SELECT plus UPDATE of `lease_epoch`; the runtime role had no
direct access to the candidate outbox. The tests cover revoke before and after
the 2,048-record overflow threshold, admission fencing, concurrent overflow,
transaction rollback and cleanup. SQL SHA256
`0c582715567be38f4bb6a876aef8119f7837043e5bd888f0bc5c4aaa3d9299ec`;
PostgreSQL test SHA256
`231236670b8f5dfb96d519f35ec333b02220411f59f5b1b6e5463e5241102130`.
The disposable test container and network were confirmed removed.

Read-only inspection of the Research Control API connection established that
its actual database role can SELECT the pre-existing native-obligations table,
but that role is currently a **superuser**. This is not evidence of a
least-privilege production ACL. No role or runtime was changed. Announcement
delivery/ACK, comprehensive issuer fencing, external authority and restore
remain unproven; this candidate is not a numbered or installed migration.

## Q3 and recovery completeness

TS's described source journal is bounded and deletes terminal entries after
Core ACK; the source recovery endpoint reads a specified original rather than
enumerating every post-snapshot event. Core's existing inventory also has a
bounded read without a complete cursor. **Neither can independently prove
all post-snapshot terminals and ACKs have been recovered.** Core is preparing
a bounded, fail-closed comparison; Edge/TS must provide a qualified retained
source checkpoint/enumeration and fencing contract if completeness cannot be
established from an independent Core authority. No cutover is authorized by
the inventory, a synthetic test or a matching hash alone.

## Other validation

A focused source run passed **95 tests, 2 skipped across 14 files**. The two
skipped cases were then run against the separately pinned public B1: the two
affected files passed **13/13**, including both B1 cases. The tests do not
sign B2, create P7 acceptance, install a listener or commission a source.
The staged TS client certificate was independently verified against its CSR
and CA, including the minimum 120-day remaining-validity check; it expires
2027-05-04. A real owner session and ACCESS_ADMIN step-up, workload/issuer
registration and independent P7 source verifier are still required.

No credential, private key, cookie or token is published here; no stable/dev,
production, Live or command runtime was changed.
