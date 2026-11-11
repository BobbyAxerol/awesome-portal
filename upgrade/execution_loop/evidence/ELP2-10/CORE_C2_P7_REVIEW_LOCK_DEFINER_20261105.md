# P7 review row-lock definer candidate — 2026-11-05

**SOURCE CANDIDATE ONLY; NOT INSTALLED OR WIRED.** PostgreSQL requires UPDATE
privilege even for `SELECT ... FOR UPDATE`. The existing P7 review writer uses
that lock on append-only owner intents, while the restricted-login negative
policy rejects direct UPDATE. The earlier restricted-role PASS therefore did
**not** demonstrate that the P7 writer works with that role.

Added two narrowly keyed owner-intent row-lock functions, initially SECURITY
INVOKER and revoked from PUBLIC. A separate candidate installer checks the
function owner is a restricted NOLOGIN role not assumable by an ordinary
login, rejects excessive schema/table/column privileges and verifies the SQL
language, exact function body, return type and search path before making the
functions SECURITY DEFINER. The installer creates no role or grant. It is not
used by the application or run on a product DB.

`bash scripts/test-elp2-c2-p7-pg.sh schema-observation`: **4/4 PASS**, exit 0,
on a disposable PostgreSQL cluster. Test proves direct app `FOR UPDATE` is
denied, a selected definer function returns and holds the same original row
lock against a competing transaction, and malformed proof returns no row. It
also rejects superuser installation, a login able to assume the definer,
definer DELETE, and a changed function body. The first body-validation retake
failed (3/4) because `btrim` does not remove newlines; the fixed retake above
passed. Harness removed its isolated containers/network. `git diff --check`
passed; no full typecheck or integration hook ran.

Uncommitted checkout SHA256:

- Functions SQL: `feea7cdd7bf219bcfbf094a6474ed82f816afa677698c023e94ba4ca1729d8fc`.
- Definer installer SQL: `26af999afc10c9af117d87103a15d854f30cb53af3c64949eae78cb4e8facfa0`.
- PostgreSQL test: `ecacb8f35380d9145bd4f0d00914047f2be7c65c9e7347f02534787d26911e96`.
- Harness: `daa31f5783e43c1812dc355ab0a3e9e505aa54b3ca3b347ae544c9f3e15f60da`.

Remaining: integrate these functions into the actual review writers while
retaining same-transaction source/session/revoke validation; handle the other
locked tables and their explicit grants; qualify trusted schema/role registry,
revoke-race and concurrent privilege changes. The caller must validate returned
fields and use the same transaction; these functions do not authorize any
request. P7 startup and issuer stay fenced; recovery, migration and final gate
remain open. No frontend contract, runtime, external database, push or Live
state changed.
