# P7 issuer keyed intent and record locks — 2026-11-05

**SOURCE CANDIDATE ONLY. NOT INSTALLED, NOT COMMISSIONED.** Follow-up to
[record-lock candidate](CORE_C2_P7_RECORD_LOCK_CANDIDATE_20261105.md). The
issuer no longer uses the combined table `FOR UPDATE OF i FOR SHARE OF r`
query. It first reads a cycle's intent ID as an untrusted locator, acquires the
keyed original intent lock and then the keyed record lock, checks their IDs
match, and performs the existing source, owner, session, registration, decision,
revocation and digest checks while retaining both locks in the caller transaction.
The intent-before-record ordering matches the acceptance recovery path. Neither
function is itself an authorization decision.

`bash scripts/test-elp2-c2-p7-pg.sh owner-intent`: **8/8 PASS**, exit 0,
two disposable PG instances. It covers the existing owner/issuer, lost-response,
revoke-race and retained `UNKNOWN` drain scenarios. Two added negative probes
intercept the database response only for a test: a stale locator and a changed
locked-record link are both denied; all other statements and row locks use the
actual disposable PostgreSQL. This does not prove behavior under arbitrary
administrator-level schema mutation. Four focused acceptance/review/intent
unit suites: **41/41 PASS**, exit 0. Harness cleanup removes the test cell.

Current uncommitted SHA-256:

| Input | SHA-256 |
| --- | --- |
| `c2-p7-issuer-fence-candidate.ts` | `99af0cf69446b6ea2311a1468d70f8928f316fde8d59a6d51ca4add691a683c6` |
| `c2-p7-record-lock-candidate.sql` | `a7db0786bcb4fda25ec55b2bfd81e84edd124110991c9bb5e52a4e90bcf8d1cf` |
| `c2-p7-review-lock-candidate.sql` | `feea7cdd7bf219bcfbf094a6474ed82f816afa677698c023e94ba4ca1729d8fc` |
| `c2-p7-owner-intent-candidate-pg.spec.ts` | `5a4a7b35b002fdb77f75db8f146f2de31f325ce878181dd62dc1c2efd5fd5dfe` |

The issuer's registration `FOR SHARE`, complete restricted application role,
trusted schema/role registry and ACL-change fence still require qualification.
The composed issuer in this test uses a test admin pool; a separate subtest
exercises restricted lease writing, not the complete issuer under final grants.
No current owner/Edge authority or HTTP delivery is proven. Independent V2
recovery, representative migration/restore, final typecheck and normal hook
remain open. Startup is still fenced; no runtime, DB, frontend or Live change.
