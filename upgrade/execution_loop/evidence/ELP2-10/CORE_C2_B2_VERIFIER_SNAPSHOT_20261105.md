# C2 B2 custody: verifier fact snapshot — 2026-11-05

**SOURCE ONLY; A2 NOT_READY, B2 NOT_SIGNED.** The unmounted B2 preparation
custody previously kept verifier-owned release and receipt objects across an
await before writing them. A caller retaining those objects could change the
acceptance, seal or receipt digest after validation but before database write.
The candidate now copies and freezes the verified facts before any await and
freezes the parsed plan passed to the verifier. This is a local consistency fix,
not a qualified authority verifier, signing implementation, permission to sign,
or proof of delivery.

Validation on this checkout:

- Regression reproduced before the fix: 1 failing, 8 passing in
  `test/c2-b2-custody.spec.ts`; the stored acceptance digest had changed.
- `npm test -- test/c2-b2-custody.spec.ts`: **9/9 passed**, exit 0. The new
  test mutates the verifier-owned objects when database acquisition starts and
  checks the original acceptance, seal and receipt digests are stored.
- Focused strict semantic TypeScript for source and test, with the project
  interop/decorator flags: exit 0.
- The initial combined and separate dry-run invocations did not complete
  inside the restricted sandbox and were interrupted (exit 130); neither is
  counted as a PASS. A subsequent `npm test -- test/c2-b2-dry-run.spec.ts
  test/c2-b2-publication-preflight.spec.ts` outside that sandbox completed:
  **7 passed, 1 skipped**, exit 0. The skipped case requires a real pinned B1
  test file; the real-signer, source, browser and integration gates remain open.
- SHA-256 source `72038a0367db8ffe29193844e6f8933df1251351434c5b7bc6e0d1cc98bb42b7`;
  test `10fe9eca6f1235d87dcf74d50c6e87bfdada7b6acadd317056592e6741a1ec5c`.

The change is uncommitted in the shared WIP. No B2 signature, runtime, database,
grant, private material, UI, remote branch, or release state was changed.
Independent authority, real P7 and qualified P8 custody, post-snapshot ACK
census, final candidate review, migration/restore and normal hook remain open.
