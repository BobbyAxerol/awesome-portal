# P22 bounded rollback and recovery

1. Stop new Research publication intake by keeping the Research Release
   Candidates feature flag dark in the intended profile. Do not remove routes
   or rewrite immutable P21 packs to simulate rollback.
2. Inspect GET publication state under the original actor/session. For
   `UNKNOWN`, retry only the original request key and payload; existing R1
   create idempotency and exact pin verification decide whether it was already
   created. Never switch to a service account or another actor.
3. Preserve `research.release_candidate_publications_v1`, P21 delivery rows,
   retention pins, and Governance R1 approval/evidence records. No truncation,
   backfill from browser guesses, R1 revocation or alternate approval create.
4. If source facts or Governance are unavailable, leave the result typed
   `UNKNOWN`/`UNAVAILABLE`, alert the operator, and resume only after the
   original authority returns. `DELIVERED` is an immutable receipt, not an
   approval verdict. Read-only mirror failure must not alter R1.
