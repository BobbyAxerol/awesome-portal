# P16 contract amendment — verify response owns its scope

**Status:** `CODEX_BACKEND_COMPLETE_PENDING_CLAUDE_CONSUMER`  
**Date:** 2026-09-23  
**Closes:** `CG-P16-01`  
**Contract:** `research-freeze.openapi.json` → generated
`research-freeze.d.ts`

## Additive field

`researchFreezeVerifyPostV1` now returns a required top-level
`verification_scope` beside `result`:

```json
{
  "result": "PARTIAL_MATCH",
  "verification_scope": "PORTAL_RETAINED_DIGEST_BINDING_ONLY"
}
```

The value is captured by the same server-side re-read that produces this
verification response. It is deliberately not borrowed by the client from a
separately cached `FreezeDetail` document. `FreezeDetail.integrity` retains
its own scope for the snapshot/integrity panel; it is not removed or
reinterpreted.

## Exact semantics

| `result` | valid `verification_scope` today | Meaning |
|---|---|---|
| `PARTIAL_MATCH` | `PORTAL_RETAINED_DIGEST_BINDING_ONLY` | All three Portal-retained bindings matched; source artifact bytes, causal ordering and selection remain unattested. |
| `BLOCKED` | `PORTAL_RETAINED_DIGEST_BINDING_ONLY` | The same bounded retained-binding check found a mismatch. |
| `NOT_PUBLISHED` | `NONE` | The re-read had no complete retained binding scope to verify. |

## Consumer rule

Regenerate `research-freeze.d.ts`. Render the response's top-level scope next
to the user-triggered verify result. Do not read a previous snapshot merely to
find it, do not replace it with `chain intact`, and do not infer a source-byte
or causal certificate.

This is a response-shape amendment only: no new POST behavior, audit row, job,
worker, source call, mutation, migration or runtime activation was added.

## Verification

The targeted P15/P16 amendment gate passed on 2026-09-23: Control API
contract/service/controller tests (16 tests), generated-contract tests (11
tests), Control API TypeScript build, generated-output verifier, snapshot
check and whitespace check. The service tests cover both a partial retained
binding and `NOT_PUBLISHED → verification_scope=NONE` on the verify response.
