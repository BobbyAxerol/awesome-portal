# C2 P7 Research preparation composition — 2026-11-05

**SOURCE ONLY; NOT INSTALLED; P7 AND A2 NOT READY.** The Research AppModule can
now accept explicitly injected P7 preparation and emergency-reduction services.
Without private bootstrap injection, both controllers remain absent. There is
no configuration flag or request parameter which selects or enables them.
An enabled service must use the configured Research workspace and exact pool;
the preparation graph additionally requires the identical source verifier,
registration key and owner-intent instance throughout. A separately enabled
emergency reduction remains independent of the preparation/source graph.

This makes the preparation endpoint mountable, not commissioned. Its successful
result remains `P7_PREPARATION_RECORDED_NOT_AUTHORIZED`. Real owner acceptance,
source trust and their same-authority issuance fence are not proved. The
issuer composition still returns `C2_P7_AUTHORITY_NOT_COMMISSIONED`; no listener,
source registration or grant has been installed, and B2 was not signed.

## Validation

- `npm test -- test/c2-p7-app-module.spec.ts test/c2-p7-review-candidate.spec.ts
  test/c2-p7-review-candidate-http.spec.ts test/c2-p7-review-candidate-composition.spec.ts
  test/c2-human-issuer-composition.spec.ts`: **50/50 passed**, exit 0.
- New synthetic module tests verify default absence, separately injected
  routes, rejected environment/workspace/pool/spoof/disabled service and nine
  mixed pool, source, intent or registration-key compositions. Existing HTTP
  tests cover preparation auth, not full AppModule runtime commissioning.
- `git diff --check`: exit 0 for tracked diff. Tests do not constitute real
  owner authentication, live PostgreSQL authority, deployed route, A2, or
  recovery cutover.
- A strict check rooted at `app.module.ts` and its test grew to approximately
  2.4 GiB and exceeded two minutes; it was interrupted to protect shared
  resources (exit 130). It is **not a PASS**. Full candidate typecheck and
  normal integration hook are still required on the final frozen candidate.
- A bounded strict semantic TypeScript check rooted at
  `c2-p7-review-candidate.service.ts` passed (exit 0; Node heap 1024 MiB).
  It does not typecheck the full AppModule and all of its dependencies.

## Source pins

- `apps/control-api/src/app.module.ts`: SHA256 `ab6160fdd6dcdfbd36fe52b215dd6af95325620a5b11ec7b3719003ae51b985e`.
- `apps/control-api/src/execution-v2/c2-p7-review-candidate.service.ts`: `befa8db7509187ec38cb940b2bc4a1131b31ca5046e6bee8fcd22de18b796275`.
- `apps/control-api/src/execution-v2/c2-p7-owner-intent-candidate.ts`: `b9430f60d72b6fae5e358467ed012b2dbddf11b8dfe827459e20d8aa1ea4197d`.
- `apps/control-api/src/execution-v2/c2-p7-registration-writer-candidate.ts`: `e8d6071837b9f3bfde8c7dca987113071aa6cbffd094eae13953e91eaa6cbd33`.
- `apps/control-api/src/execution-v2/c2-p7-acceptance.ts`: `7bd31980411b69c6d59e1add63c6b8159609f6cfde10599e41c6bf744e5c53ed`.
- `apps/control-api/test/c2-p7-app-module.spec.ts`: `12e72fa2cfa9470360d5ab0867efcfb03ca32189fe33264acbc45ba0dac1e280`.

These are uncommitted checkout pins, not image, runtime, schema or deployed
source pins. Before any issuer commission, verify the actual source attestor,
owner session and step-up, accepted authority and its revoke/issuance fence;
finish independent restore fencing, integrate and validate the candidate, and
reconcile source trust and A2 with Edge. No UI changes are required by this
preparation-only slice. Claude can continue fixture work independently.
