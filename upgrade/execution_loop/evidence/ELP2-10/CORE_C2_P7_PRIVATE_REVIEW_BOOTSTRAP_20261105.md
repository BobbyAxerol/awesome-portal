# C2 P7 private review bootstrap and schema fence — 2026-11-05

**SOURCE CANDIDATE ONLY. NOT INSTALLED, NOT A2, NOT AUTHORIZED.** This
follows [Research preparation composition](CORE_C2_P7_RESEARCH_COMPOSITION_20261105.md).
The existing legacy schema verifier covers `elp210_candidate`, not the
separate P7 schema and its ownership, ACLs, triggers and procedures. A private
configuration, even if correctly signed, cannot qualify those database
properties. Standalone startup therefore fails with
`C2_P7_REVIEW_SCHEMA_NOT_COMMISSIONED` when P7 is configured. There is no
environment switch to bypass the fence. The unconfigured route stays absent.

The new preparation graph accepts only two explicit private config references,
checks their content hashes and private-file constraints, verifies the source
signature and selected B1/owner/workspace/scope, and constructs the existing
review and emergency services with one target and pool. It does not sign,
publish, grant, start a listener, prove a real owner or commission a source.
Its actual main-process wiring is **guarded and not yet operable**: a P7
installation verifier and reviewed role/ACL/migration are still required.
The P7 source-verifier itself also documents that registration changes are
not an issuance fence. Issuer remains independently fail-closed.

## Focused verification

- `npm test -- test/c2-p7-review-runtime.spec.ts test/c2-p7-app-module.spec.ts
  test/c2-p7-review-candidate-composition.spec.ts`: **21/21 PASS**, exit 0.
  The graph and private files use synthetic signed input; the schema fence is
  tested directly, not by a full standalone HTTP boot or live database.
- `git diff --check`: exit 0 for tracked changes. The relevant test creates
  its own temporary directory and removes it in its `afterEach` cleanup.
- `bash scripts/execution-tracking-test.sh`: exit 0; tracking reconciliation
  passed after adding this receipt to Unified and the sync ledger.
- Focused strict test-inclusive typecheck **timed out** (exit 124); it is not
  a PASS or diagnosis of a type error. Full typecheck and normal hook remain
  required after candidate integration.

## Local, uncommitted source pins

- `apps/control-api/src/main.ts`: `efeb1554cbe3b163041c80c74998b7b3af37e53deee7dea2741f6313bbdd2643`.
- `apps/control-api/src/execution-v2/c2-p7-review-runtime.ts`: `4497b2b06c20aaae3e30f5f6804dc3d4a00fe6b05d5d28c5004bab74e5290e73`.
- `apps/control-api/test/c2-p7-review-runtime.spec.ts`: `5675f0fd0db7187384fe9c3825d986e6683728c45917d06f15eebe686ee882a4`.

These are checkout hashes, not a commit, installed schema or image. Next Core
work: qualify the P7 schema and writer ownership/ACL with a registered
installation verifier, integrate and retest actual startup, and establish
owner/source authority and issuance/revoke custody. Recovery V2, A2/P8/B2,
representative migration/rollback, integrated typecheck and hook remain open.
No frontend contract changed; Claude may continue independently. No secrets,
runtime install, database change, push, command or Live activation occurred.
