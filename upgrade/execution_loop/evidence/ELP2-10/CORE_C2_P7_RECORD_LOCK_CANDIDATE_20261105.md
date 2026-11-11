# P7 immutable record lock candidate — 2026-11-05

**SOURCE CANDIDATE ONLY. NOT INSTALLED OR COMMISSIONED.** The P7 acceptance
writer previously selected an immutable record `FOR SHARE`, requiring an UPDATE
privilege that conflicts with the restricted application-role negative policy.
It now uses a keyed candidate function inside the same transaction, retaining
all existing owner, session, source, intent, revocation, digest and expiry
checks. The function returns only the selected cycle and is not authorization.

The function is created as `SECURITY INVOKER` and revoked from PUBLIC. A
separate candidate installer verifies a NOLOGIN owner, membership and dangerous
privileges, exact function body, type, language and pinned search path before
switching it to `SECURITY DEFINER`. It creates no grants or roles. Application
startup does not install it. The existing startup schema fence remains closed.

## Results

- `bash scripts/test-elp2-c2-p7-pg.sh schema-observation`: **5/5 PASS**, exit 0.
  The disposable PG test verifies direct `FOR SHARE` is denied to the test
  login, selected function holds the actual record against a competing update
  lock, invalid cycle returns no row, and the installer rejects superuser,
  changed body and a login able to assume the definer.
- `bash scripts/test-elp2-c2-p7-pg.sh acceptance`: **6/6 PASS**, exit 0.
- `bash scripts/test-elp2-c2-p7-pg.sh owner-intent`: **8/8 PASS**, exit 0,
  using two disposable PG instances, including the `UNKNOWN` drain negative.
- P7 acceptance/review/composition focused tests: **36/36 PASS**, exit 0.
  Harnesses clean their isolated containers/network. None of these exercises an
  installed Research runtime, genuine owner approval, or an Edge ACK.

## Current uncommitted pins (SHA-256)

| Input | SHA-256 |
| --- | --- |
| `c2-p7-record-lock-candidate.sql` | `a7db0786bcb4fda25ec55b2bfd81e84edd124110991c9bb5e52a4e90bcf8d1cf` |
| `c2-p7-record-lock-definer-candidate.sql` | `4d957cfda9b7ff9c0e5d02e2c36ee2292e4d6de8bf2d12b2ac47c9967ba1f1a1` |
| `c2-p7-acceptance.ts` | `80509d43bcd680818b633b8ae1cb5f509d6d8a356ce4d53ec1cc6208163a2743` |
| `c2-p7-schema-observation-pg.spec.ts` | `bbac64b7cef2ea25f59087c6218315c60346a7fbf1f587de5f47b6725e92bcf9` |
| `c2-p7-acceptance-pg.spec.ts` | `14508e1793f045bc2d04679d49eb807dba27f9dee8f6693ca8ee0108cfeafbc0` |
| `c2-p7-owner-intent-candidate-pg.spec.ts` | `23fce8ba657022c83cfce5a81ffbeac4d0686a0a6734c3c3428f287eb462ed74` |

## Remaining

The issuer fence still has a combined `FOR UPDATE OF i FOR SHARE OF r` query
and has **not** been changed to this restricted-role lock path. The registry
lock, complete service grant set, trusted schema/role verifier, concurrent ACL
drift, final migration and HTTP custody remain to be qualified. Do not claim
the 8/8 owner test proves the full service under its final restricted role: it
contains a restricted-login subtest but its composed service uses a test admin
pool. Real P7 acceptance, source/ACK, independent recovery barrier, final
integration hook, runtime installation and connected acceptance remain open.
No frontend contract, product DB, runtime, stable/dev/main or Live was changed.
