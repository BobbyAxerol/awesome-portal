# C2 delivery fence follow-through — 2026-11-05

## Scope and status

SOURCE_ONLY, disposable candidate; **not installed or commissioned**. The public
`a2-static-r1` bundle was delivered separately; it does not constitute full A2.
This change does not mount an issuer, deliver a token, authenticate a real source,
prove HTTP custody, close recovery, or authorize B2 signing.

## Change

The prior delivery obligation checked that a scope was `OPEN`, but a scope can
remain open after its registration expires or the global authority revision
changes. Before reserving or transitioning an obligation to `SENDING`, the
candidate trigger now checks the exact registration identity, active state and
expiry, the lease and registration revisions against the locked current
authority revision, and that no drain is active. The delivery validity is also
bounded by registration expiry. `UNKNOWN` remains available for the same exact
obligation after loss of authority: it does not assert delivery or source ACK.
Actual authenticated owner/session validation and HTTP boundary custody still
must be composed separately; this SQL is not sufficient authority to send.

## Pins

- `apps/control-api/src/execution-v2/c2-delivery-obligation-candidate.sql`:
  `caeddead23601720e2082a0631f6e09a20c660b6177a6826611bd1fa679f608a`.
- `apps/control-api/test/c2-delivery-obligation-pg.spec.ts`:
  `4bf82827c60b1b154037f22c56a241bd11504fa7b1f0e5296d090db14a504b33`.
- `apps/control-api/test/c2-delivery-procedure-pg.spec.ts`:
  `140538332675cbee002fcd1898ad12003af22f0ec92be25155b666f1d7103089`.

## Verification and limits

- Bounded disposable PostgreSQL: `c2-delivery` **5/5**; includes registration
  expiry, payload bound, revision/drain refusal, concurrent revoke and UNKNOWN.
- `c2-delivery-procedure` **3/3**; initial run failed in fixture setup because
  the fixture hard-coded revision zero after identity mutations. It was corrected
  to use the actual candidate authority revision and rerun; no failed or skipped
  tests are counted as PASS.
- `restore-delivery-fence` **2/2**; tests local generation fencing only, not a
  complete independent recovery barrier.
- Bounded strict semantic TypeScript checks separately passed for
  `current-human-candidate.ts` SHA256
  `86cc0fc022f3b2f3ed19e0ae8eff839ecf0691d851889bac9e67c5a61b71e69a` and
  `c2-p7-review-candidate.service.ts` SHA256
  `ea4cb120e6f400e13bf85d2fc906740ca2f756d49c8ae24b81851e7fe76b370a`.
  The controller-root check exceeded the 1024 MiB Node heap and exited 134;
  full typecheck, full integration and normal hook have **not** passed here.
- Tests used isolated containers/network with bounded CPU/memory and cleanup
  traps. No shared runtime, persistent database or credentials were changed.

## Next

Core must compose a genuine owner/session and registered-source acceptance with
the issuer and HTTP custody; commission Research trust/listener and prove P7/P8
before full A2. Independent checkpoint/fencing and source terminal/ACK
completeness must be proven before recovery cutover. Edge/TS can inspect the
already delivered static bundle independently; no B2 signature before genuine
A2 acceptance and the sealed-contract prerequisites.
