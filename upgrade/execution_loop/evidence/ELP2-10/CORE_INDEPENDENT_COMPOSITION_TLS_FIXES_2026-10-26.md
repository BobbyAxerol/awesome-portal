# Core independent composition and financial TLS fixes — 2026-10-26

Scope: candidate source on `docs/research-loop-plan`; no UI, public contract,
database, credential, grant, runtime installation or command/Live change.
These fixes do not make Accounts CURRENT or ELP2-10 connected acceptance pass.
Code commit: `3d0ee663f` (four files, +55/−6).

## Findings and changes

1. `withExistingIdentityMapping` previously dropped the optional
   `currentRelations` port if composed after the native provider. Preserve the
   same port object when present, and preserve absence when not configured.
   This is composition safety, not proof a mapping source is commissioned.
   Accounts CURRENT's existing native path does not require the plain mapping
   callback; ROOT is independently fenced. The separate command/pending and
   registration paths still require a genuinely commissioned Core–Edge–PM
   mapping and their own authority; `FOUND` is not an authorization.
2. `prepareFinancialSourceRuntime` incorrectly required the local certificate
   chain to be signed by the configured *peer* CA. Core and Edge may have
   independent issuers. Keep the local key, validity, SAN, EKU, chain order and
   signatures, and retain peer CA verification at the transport boundary;
   do not treat an independent CA as an authorization or source proof.

## Focused verification

- Mapping plus native Accounts test files: **100 passed, 17 skipped**. An
  initial sandboxed attempt failed to bind `127.0.0.1` (`EPERM`); rerun with
  loopback access succeeded. This is not a connected source receipt.
- Financial runtime, assertion transport and recovery: **102 passed**; the
  runtime file includes 15 new local-chain/independent-peer-CA regressions
  across assertion, reverse and recovery configurations.
- `git diff --check`, execution tracking reconciliation and bounded emitting
  TypeScript build passed; the latter exited 0 with a 2 GiB Node old-space cap
  and a 300-second deadline. Details: [machine-readable results](core-composition-financial-tls-20261026.test-results.json).
- The first emitting build ended without its exit code being captured; no PASS
  is inferred. The `noEmit` retry was stopped before the 3 GiB boundary at
  roughly 2.88 GiB RSS; it did not complete. The time/memory-bounded emitting
  build retake then passed.
- No full-R2, load, connected READ/STREAM, or browser qualification is claimed.

## Remaining / handoff

Research Control API continues running the previously installed image; these
source changes are **not installed**. Proceed with the exact membership-reader
and current-original discovery in [Core–Edge request](CORE_EDGE_MEMBERSHIP_READER_DISCOVERY_2026-10-26.md),
then qualify ROOT and CURRENT separately; STREAM requires its own grant and
receipts. Financial needs source proof, verifier and COMMIT→APPLIED→ACK, not a
fixture. Score calibration, approved numeric budgets, coexistence/G2 and
Claude's real-source browser acceptance remain open. No frontend change is
required solely for either internal fix.
