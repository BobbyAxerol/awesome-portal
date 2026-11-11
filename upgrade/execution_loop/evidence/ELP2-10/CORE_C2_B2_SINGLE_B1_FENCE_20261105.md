# B2 single-B1 attempt fence — 2026-11-05

**SOURCE ONLY; no B2 signature, authority or runtime installation.** The old
candidate uniqueness rule included signer and owner, permitting a second
attempt for the same B1 if either changed. The disposable schema now allows
multiple PREPARED proposals but has a partial unique index on B1 for RESERVED,
UNKNOWN and COMPLETED. Competing candidates therefore have at most one winner;
the loser receives `C2_B2_B1_ALREADY_ATTEMPTED`. RESERVED remains ambiguous
after a crash, never permission to retry. This is a database constraint, not a
qualified authority verifier, signer, durable signature receipt, A2 acceptance,
or a guarantee against restore of an old database snapshot.

Validation: B2 focused unit **9/9**, disposable PostgreSQL **3/3** (including
two different signer/cycle plans racing for one B1), bounded strict semantic
TypeScript exit 0, `git diff --check` exit 0. The disposable B2 containers
were cleaned up; no persistent DB/runtime/grants or private keys were changed.
Separately the P7 disposable PG suite **4/4** includes two concurrent confirms
with the same key converging on one intent, and denial after intent revoke.

Local WIP SHA256:

- `c2-b2-custody.sql`: `4532bb16acc884b3c5a27c5c34ad28558ba35c6c5ac9ef172785839563ed3c71`
- `c2-b2-custody.ts`: `a31a28d5adcea1d6d30bb61258901aa356f9a79a0bc8de428d6243ba5eb71577`
- `c2-b2-custody-pg.spec.ts`: `f265588c4c776b09ff760b42f2cd4667104eb595a0ae0272591c53c77d05ff0a`
- `c2-p7-owner-intent-candidate-pg.spec.ts`: `8b61b08e03e8b2e6754ac17d80cc5ed2fb9a600c9e39b1d474b83b47342c1595`

Before production use, an independently fenced authority and durable signer
custody must be commissioned, the candidate integrated and its recovery,
restore/rollback and normal hook gates passed. B2 remains unsigned; A2 must be
accepted first. These WIP hashes are not deployment or image pins.
