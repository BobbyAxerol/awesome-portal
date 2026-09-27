# P23 T05 — real tenant/cache read checkpoint and source repair request

2026-09-27 · Codex · `docs/research-loop-plan` · owned loopback
`portal-research-p23-ol12:8096`, clean application image/source candidate
`19a8e81362e0e6aa3e09ad1a1c224db226c37455`. This is **not T05 PASS**.
No shared preview, Production, AWS-HK/Trading System, frontend, DB membership,
artifact or runtime config was changed. The probe issues GET only.

## Actual result

`tenant-cache-receipt.mjs` checked ten current product reads: Library,
sparkline, Split, Freeze, current-source Evidence/Search/Freeze, Report,
sealed RC pack and publication. The owner is an actual member of the named
test workspace; `p23-approver` is an authenticated **nonmember**. Each owner
request returned 200, the same exact request as nonmember returned 404, and
the anonymous request returned 401, even with the owner's ETag sent in
`If-None-Match`. **10/10 authority boundaries PASS; no cross-tenant leak was
observed.** This does not replace the prior 19 actual export status/download
checks or prove every private artifact/file surface.

The same-origin response headers exposed two narrow defects:

| Route | Observed | Required correction |
|---|---|---|
| Library list, sparkline, Freeze | Owner 200 lacks `Cache-Control` | `private, no-store` for unversioned reads; `private, no-cache` for Freeze with ETag, on success/304. Keep refusal non-cacheable. |
| Freeze, Report | Browser-visible ETag is weak (`W/"…"`); sending it in `If-None-Match` returns 200 with the **same** ETag | Compare the actual browser-visible validator under HTTP weak comparison, or emit/handle one consistent validator. After workspace authority check, unchanged read should return 304; foreign user must remain 404, anonymous 401. |

For **both Freeze and Report**, the retained control probe sent the strong
`body.etag` and got **304**; sending the actual weak ETag emitted in the HTTP
response got **200** with the unchanged ETag. Thus the validator exists, but
ordinary browser revalidation does not use it successfully.
The RC pack has `private, no-store` and intentionally returns 200 despite
an ETag; it is **not** counted as a revalidation defect.

The runtime helper deliberately exited 1 with:
`member_boundary_passed=true`, `cache_policy_passed=false`,
`revalidation_passed=false`, `missing_policy=[library,sparkline,freeze]`,
`bad_revalidation=[freeze,report]`. The failure is preserved, not renamed a
PASS. Focused classification unit tests: **2/2 PASS**. Private 0600 receipt:
`/home/bobby/.local/state/portal-research-p23/20260927/runtime/`. The first
`t05-cache-19a8e813.json` has SHA-256
`2a2d972f3f28baa1d93871d0841410e044e8fbc70a3faab162a71d23a93e89f4`;
the stronger `t05-cache-etag-19a8e813.json` has SHA-256
`fdcb157cb5e15924085b90e2bb4d83bbf9a832af0c3572fc36860537bff0c59a`.
Both failed receipts remain 0600. They contain status/header/body hashes,
not business payloads or credentials.

## `CG-P23-T05-01` — request to the shared ≤P21 source owner

Source locators: `run-library.controller.ts:38–60` returns both personalized
reads without setting response cache policy; `freeze.controller.ts:31–50`
omits policy and compares `If-None-Match` to `body.etag` literally;
`report.controller.ts:37–52` has `private` policy but makes the same literal
comparison. Codex does **not** edit these shared ≤P21 files under the P23
ownership split. Claude should make the smallest server-side repair, preserving
all current DTOs, layout, ETag revision content and authorization ordering.

Done-when: focused controller tests assert exact headers on 200/304 and
unchanged 200→304 for the ETag copied from the HTTP response; nonmember
If-None-Match stays 404, anonymous stays 401, no cross-workspace 304 or
cached body. Codex then builds only the changed owned Control API/gateway if
needed, reruns this helper with a **new** label, and adds the remaining
artifact/file-negative evidence before declaring full T05. Do not overwrite
the failed receipt or run a generic file/DB access path to satisfy the test.
