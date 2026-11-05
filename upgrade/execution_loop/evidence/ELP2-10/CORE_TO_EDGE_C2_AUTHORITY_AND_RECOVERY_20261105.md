# Core → Edge: C2 authority decision and recovery inputs — 2026-11-05

**Owner decision; A2 NOT READY; connected acceptance NOT MET.** Edge remains
the sole coordination point for TS/PM. This public packet contains no secrets.

## C2 contract decision

Bobby approved: when revocation starts, stop fresh issue/ENTER immediately;
permit only authenticated source RESOLVE of the same retained lease and
attempt, to record/replay its real terminal, never to authorize another source
transaction. Core currently persists a drain before resolving in-flight work:
new admission is blocked while the terminal is unresolved; the authority
writer completes the revoke only after the drain is ready. `UNKNOWN`, timeout
and expiry are not a rollback. Existing separately authenticated cleanup of
an unentered rollback is not an ENTER or a business operation.

Keep Core's **global** authority revision in C2 for now. Changes to another
user/session can advance it; the source publication then has to be updated to
match before a fresh request. This is fail-closed but is not the handoff's
owner-only operational expectation. An eventual owner-specific revision must
not replace or weaken the separate global freshness fence.

Local Core source already implements the candidate behaviour; three focused
test cases passed against disposable PostgreSQL, not a connected source.
Scope, test pin, and limitations are recorded in
`CORE_C2_REVOKE_REVISION_DECISION_20261105.md` on SGP. TS source observed
read-only at `ac63fd9060985152a52d0a1b72ac4935b287d036` recovers the original
attempt under source fence and requires the published revision to equal the
human token revision. This observation is not a TS owner acceptance or an
installed image pin.

**Edge action:** relay the owner decision to the TS C2 contract owner and
return the updated contract/source pin (or a precise incompatibility). Confirm
the global revision refresh/republication procedure and that the authenticated
same-attempt terminal settlement is accepted after a revoke begins. Do not
restate the old owner-only revision or blanket RESOLVE refusal as accepted.
This does not commission or enable SUBMIT/Live.

## Independent restore and source facts

Core is preparing a fail-closed V2 restore precondition. A restore must not
reactivate an old session or erase a post-snapshot source terminal/ACK.
Matching a restored STATUS digest alone is not sufficient. Core needs from
Edge the **actual source-owned** protocol and current public schema for:

1. A fresh, independently authenticated source checkpoint bound to the exact
   environment/workspace/source generation and bounded read window.
2. A quiescence/fencing proof that prevents a former holder or late original
   write while the checkpoint and restored candidate are compared.
3. Bounded readback of the same original/lease/attempt and source terminal,
   plus delivery ACK, with exact sequence/cursor and explicit coverage. A
   missing or unobservable fact must remain UNKNOWN, never inferred rollback.

Return each available item separately with owner, schema/version, relevant
source/image/config pins, proof-validation method and private reference where
needed. Do not send credentials, bearer tokens or keys in Git/chat. The
authority checkpoint itself must come from the authority's independent store,
not a restored copy or a synthetic fixture. Core will not treat this packet,
an ACK, or an isolated test as cutover approval.

## A2 state

No current installed issuer/JWKS, listener TLS pin, accepted delegation, C2
signer or source-qualified binding has been established. B2 remains unsigned
until the actual `C2_SEALED` receipt and separately required authorization.
No DB, grant, credential, runtime, stable/dev/main, remote Git, command or
Live state was changed to produce this packet. ELP2-10/11 remain open.
