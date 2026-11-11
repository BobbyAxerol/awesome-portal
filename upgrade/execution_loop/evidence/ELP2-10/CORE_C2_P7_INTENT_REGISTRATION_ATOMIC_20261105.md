# P7 candidate intent and registration atomicity — 2026-11-05

**SOURCE ONLY, NOT INSTALLED OR AUTHORIZED.** This supersedes the open
implementation finding in `CORE_C2_P7_INTENT_REGISTRATION_ATOMICITY_GAP_20261105.md`
for newly created candidate intents only. The Research preparation service now
commits its owner intent and matching registration in one bounded PostgreSQL
transaction. The verifier checks the original proof while that same transaction
holds the existing authority/session/intent locks; both the process-local proof
and its writer copy are zeroed. A pre-COMMIT failure rolls back both writes.

If COMMIT succeeded but its response was lost, the same authenticated owner,
session, review and original idempotency key can locate the original intent and
complete the existing preparation record. No intent ID is a bearer, and resume
never creates a new intent or proof. Existing orphaned intents from older
source-only runs are not magically repaired; they cannot authorize a grant.
Any ambiguous error must be recovered by original key, not interpreted as proof
of rollback. This is preparation only: records stay NOT_AUTHORIZED, issuer
remains hard-fenced, and no real owner delegation, A2, ACK or B2 is claimed.

## Tests

- Focused owner-intent, registration, review, HTTP composition, AppModule and
  issuer suite: **53/53 passed**, exit 0.
- `bash scripts/test-elp2-c2-p7-pg.sh owner-intent`: **4/4 passed**, exit 0 on
  disposable PostgreSQL. Includes forced registration failure rolling back both
  rows, retry with the original key, simulated lost COMMIT response followed by
  same-intent recovery, different-session refusal, revoked-intent refusal and
  the existing same-lock revocation test. The transient cell was removed;
  `sudo -n docker ps -a --filter name=elp2-c2-p7` returned no containers.
- Bounded strict semantic TypeScript check of the P7 review service and its
  transitive source modules: exit 0. Full AppModule typecheck and final normal
  hook remain open; they are not implied by this focused result.
- `git diff --check`: exit 0 for tracked diff. No runtime, grants, certificates,
  shared DB, command/Live, frontend, remote Git ref or release was changed.

## Local WIP pins

- `c2-p7-owner-intent-candidate.ts`: `eee7acb1e9b28dbcff2e8bf1ff9f81f2aef113c9026663ecd69153d64808f133`
- `c2-p7-registration-writer-candidate.ts`: `6eb9f6d4a1d5c2789934638ea5aaf3688b2a5b6c7bb56214379f6c0f292bb9cd`
- `c2-p7-review-candidate.service.ts`: `2fb03c95231be74e2e441026e4585469df32fd2324396239a0e6826bc5a9ee17`
- `c2-p7-owner-intent-candidate-pg.spec.ts`: `5d93a31adda5735089bd15c082ddf907215b8265321629c2c771ce669ea41d49`
- `c2-p7-review-candidate.spec.ts`: `f2b753f16443ae6b6e861383d6d0b30e9f3e0a4442cc9bf36eb379b588e98993`

Next: qualify actual owner/source authority and connect it to the issuer's
same-fence delivery; independently complete V2 old-holder fencing and the
post-snapshot terminal/ACK census. These local tests do not replace actual
source/Edge qualification, final candidate integration, DR rehearsal or A2.
