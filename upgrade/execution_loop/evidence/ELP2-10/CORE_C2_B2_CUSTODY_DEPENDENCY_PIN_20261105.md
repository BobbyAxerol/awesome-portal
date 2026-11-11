# B2 custody dependency pin — 2026-11-05

**SOURCE ONLY; A2 NOT_READY; B2 NOT_SIGNED.** `C2B2PreparationCustody`
previously used TypeScript-only private fields for its pool and trusted
verifier. They were ordinary writable JavaScript properties after startup.
The candidate now keeps the pool and selected verifier methods in ECMAScript
private fields and keeps its transaction and locked-row helpers private as
well. It binds each verifier method to the selected verifier instance, so
replacing an instance field or swapping a method on that object after
composition does not install a verifier or redirect the custody pool.

The regression uses synthetic in-memory verifier/database objects and attempts
to shadow an initially absent verifier, pool and internal helpers, then swaps
both methods on a verifier that was present at construction. The original
selected methods and database remain in use; an absent verifier still refuses
reserve. The caller must still supply a genuinely trusted verifier at startup;
private fields cannot establish that verifier's identity, immutable internal
state, external authority lease or resistance to arbitrary compromised code.

- Focused unit `npm test -- test/c2-b2-custody.spec.ts`: **10/10 PASS**.
- `bash scripts/test-elp2-c2-custody-pg.sh`: **3/3 PASS** on a disposable
  PostgreSQL database; subsequent container check for `elp2-c2-custody` empty.
- Focused strict TypeScript on the changed source and unit test: exit 0.
- Dry-run and publication-preflight tests outside the restricted sandbox:
  **7 PASS, 1 SKIP**; skipped case needs a pinned B1 test file. The earlier
  combined invocation hung inside the restricted sandbox and was interrupted
  (exit 130); it is not counted as PASS.
- `git diff --check`: exit 0 for tracked files; the source and test below are
  untracked, so that check does not cover them.
- Source SHA-256 `5876da6e714441ed45bbc022d84e06644dd2eb2dd99833976032577c3094fbe0`;
  test SHA-256 `574a2fac093ac19f309e9a9bc310a1188fe44a2a179e9c2b4a89bcf46f81bea8`.

No signature, runtime installation, source authority, actual owner acceptance
or connected acknowledgement was produced. Signer custody, A2 acceptance,
the independently fenced recovery path, representative restore, full
integration and normal hook remain outstanding. A separate release process
must verify TS acceptance and seal before any permitted one-time signing; this
candidate does not authorize it. No frontend action is requested.
