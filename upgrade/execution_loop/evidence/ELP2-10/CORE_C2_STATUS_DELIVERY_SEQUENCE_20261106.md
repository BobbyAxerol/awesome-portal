# C2 STATUS delivery sequence and context expiry — 2026-11-06

**UNMOUNTED SOURCE/TEST WIP, not a migration or connected qualification.**
Base `docs/research-loop-plan@2faa8968f` plus shared uncommitted changes.
No live DB, runtime, Edge, command/Live or frontend was changed.

## Finding and candidate

The candidate delivery obligation had an original-wide uniqueness constraint,
which prevented the legitimate next STATUS delivery even after the exact
previous terminal and recipient ACK. The forward-only SQL candidate replaces
it with a generic-original fence and an immutable STATUS context/sequence
fence. The restricted reservation procedure can derive context/sequence from
the exact linked lease; it cannot create a second context from a naked original.
Successors require the exact predecessor, `UNKNOWN` delivery, terminal,
matching custody/P7/session/source lineage and persisted ACK. The trigger is
not executable by PUBLIC. The test-only definer received SELECT on the two
STATUS metadata tables; this is not qualification of a production DB role.

The new context-expiry guard revealed a real mismatch: a renewed STATUS human
assertion could have the normal lease TTL even when it outlived its durable
context. Issuance now caps assertion expiry at the context expiry as well as
the existing session, installation, P7 and TTL bounds. Generic non-STATUS
issuance retains its existing bounds. A context with less than a whole second
remaining is refused by the existing session-expiring guard.
The issuer also compares a successor's context expiry with its predecessor
inside the issuance transaction. Without this comparison the later delivery
guard would reject the altered context only after a lease had been minted.
Both generic STATUS and C2 tests now refuse that mismatch before insertion.

## Tests and limitations

- `bash scripts/test-elp2-c2-p7-pg.sh owner-intent`: final **9/9 PASS**, exit 0.
  Includes synthetic owner, P7, two isolated PG clusters, loopback TLS,
  context-expiry assertions and same-context successor checks. Before the
  expiry fix this suite was **4/9**, with the first failure
  `C2_STATUS_DELIVERY_LINK_MISMATCH` where the successor obligation outlived
  its context; the remaining failures followed aborted shared setup. Neither
  run represents a genuine Edge ACK.
- `bash scripts/test-elp2-restore-inventory-rls.sh c2-delivery-procedure`:
  final **4/4 PASS**, exit 0. Existing two synthetic obligations survive the
  candidate SQL upgrade; the restricted test procedure infers the STATUS
  link and retains raw-DML and revoke denials. The first retake's four test
  cases passed but its wrapper exited **127**, because the script was edited
  while still executing; it is not counted as a passing command.
- `bash scripts/test-elp2-restore-inventory-rls.sh status-context`: **1 PASS,
  109 skipped**, exit 0. This checks the generic STATUS context/lease expiry,
  original link and restart fence, not the entire 110-test suite.
- Selected strict `tsc --noEmit` for `current-human-candidate.ts` with a
  768 MiB Node heap: exit 0. No full project typecheck or normal hook.
- The test cells are bounded by their scripts to 2 CPU / 1.5 GiB; actual peak
  was not captured. Their containers/networks were cleaned. A separately named
  `control-api-test-postgres-17939443351070131` was already running from
  05:57 UTC; it was left untouched as unrelated to these randomized cells.

## Working-file pins

| Path | SHA-256 |
| --- | --- |
| `apps/control-api/src/execution-v2/c2-status-delivery-sequence-candidate.sql` | `6b75d5cefe634f1c1f16a7f9b4e47fbfc0c1535c357e7b051b2840bb5610be9e` |
| `apps/control-api/src/execution-v2/current-human-candidate.ts` | `2393c6c2b64b5458a19358cdb494bea6fe0a6de92a7c55f36f4c8b9e09d68be7` |
| `apps/control-api/test/c2-p7-owner-intent-candidate-pg.spec.ts` | `2f9d9c9836c9a3918c7589f6e201eeb2daec2ebe93425bcdc33219a4262aea76` |
| `apps/control-api/test/c2-delivery-procedure-pg.spec.ts` | `80b5ecf29ad3f0f724985fb41a4ff2264407f72dbdf02857176bcfd14deb6cab` |
| `apps/control-api/test/elp210-current-human-candidate.spec.ts` | `f24991db796ee6ab613eb897c4880dbdbbc75cb6dbab4566248b8a15b4aa0aa4` |
| `scripts/test-elp2-restore-inventory-rls.sh` | `012de1838287af5fb1333ad49f48bfec93fcebc4ee5be51b1e4367bc0c9c8d25` |

## Remaining / rollback

Core still needs the complete authority/HTTP-delivery composition, qualified
production writer privileges, original/lease recovery after restart, and
independent monotonic restore authority. Actual source and ACK require Edge.
Candidate integration, historical-data migration/restore review and normal
hook are still open; ELP2-07/10/11 remain open. No frontend contract or action
is introduced. Until qualification, leave the SQL and composition unmounted,
preserve existing obligations and maintain fail-closed restore.
