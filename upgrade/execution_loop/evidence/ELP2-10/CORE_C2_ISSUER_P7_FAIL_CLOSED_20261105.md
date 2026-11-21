# C2 issuer P7 admission fence — 2026-11-05

**SOURCE_ONLY / A2 NOT_READY.** This supersedes the earlier interpretation of
the prepared issuer composition as available for commissioning. The previously
reviewed static A2 partial stays byte-identical and is not full A2.

The existing candidate registration writer and P7 record writer explicitly
produce `RECORDED_NOT_AUTHORIZED` records. `lockCurrentC2Registration` checks
the candidate scope, registration, revision and expiry, but not a qualified
acceptance/delegation. Therefore `ACTIVE` alone must never issue a human token.

The public candidate composition now refuses both issuance and same-original
issuer resume with `C2_P7_AUTHORITY_NOT_COMMISSIONED`. This is an intentional
hard fence, not a configurable bypass. Its reverse terminal construction remains
available for an authenticated exact original; this distinction does not
qualify delivery or prove a real terminal ACK. Lower-level candidate APIs are
still accessible internally: they remain unmounted and **must not be used to
bypass this fence**. A future implementation must first verify genuine owner
acceptance and delegation, source registration and revocation under the same
authority fence, then replace this hard denial with that qualified check.

Focused validation on this local WIP:

- `npm test -- test/c2-human-issuer-composition.spec.ts test/c2-p7-acceptance.spec.ts test/restore-c2-original-recovery.spec.ts`: 28/28 passed.
- Strict focused semantic TypeScript for the changed source and test, with
  project decorator and `esModuleInterop` flags, exit 0. The first invocation
  omitted `esModuleInterop` and failed on the transitive argon2 import; it is
  not counted as a pass.
- Source SHA256 `c73d7e8f589e48b57c3aa387ba4d8c4baab11dbe7149822e3f2c35c888a7aa99`;
  test SHA256 `a4ea76a732ca92e3c3b374a3d3aa7bc49ed36b932c7af638e39315eebcfc1f3c`.

TS's public A2 validator checks the shape of Phase A acceptance evidence; its
own documentation explicitly says this is not owner approval or provenance.
No preparation record is promoted to real P7 on the basis of that check. A2,
issuer/listener and source registration, qualified P7/P8, complete recovery
barrier and genuine ACK remain outstanding. B2 remains unsigned pending the
required real A2 acceptance. No image, database, service, credential or shared
runtime was modified; no full hook or connected gate is claimed.
