# P23 F3/F5 scoped real-browser checkpoint — 2026-09-30

The owned `portal-research-p23-ol12` cell at `127.0.0.1:8096` ran seven
content-addressed services with `dirty=false`. Candidate source was
`0e81ad28a382cc639e5ac962d5bbd63ae8944b14`; the identity receipt SHA-256
is `6c369967bcee3b68771bd9731140a2546b988f77ec8317fe804525f42f724e91`.
The same runtime image set as the preceding T15 receipt was reused; the
candidate changed only in documentation. No shared preview/dev/prod service
or database was used.

## F3 read-only product route sweep

`node scripts/research-p23/f3-product-route-real.mjs` navigated S00–S14 by
deep link, once at 1280 px and once at 660 px, in 30 fresh browser contexts.
Result: **30/30 PASS**. Every root mounted, horizontal overflow was 0 px,
page errors/off-origin requests were absent, and no unexpected auth/server
refusal appeared. The browser made no implicit product write; owned-workspace
jobs remained **173 → 173**. Private 0600 receipt:
`/home/bobby/.local/state/portal-research-p23/20260927/runtime/f3-product-route-real-20260930-a.json`,
SHA-256 `8d3c25b217924fd210ffe42b5e9b89d26e5fb1d00b6df33b45c47600184a2f2e`.

This closes only the exact-candidate S00–S14 read-only route subgate. It is
not the complete 54/54 F3 lane or a visual-baseline approval.

## F5 browser-visible typed refusals

`node scripts/research-p23/f5-browser-refusals.mjs` used the real browser,
real same-origin API and no request interception. At **both 1280 and 660 px**:

| Screen | Stimulus in owned cell | HTTP/code | Browser result |
| --- | --- | --- | --- |
| S14 | Submit a non-`.py` source file | 400 `RESEARCH_ALPHA_IMPORT_INVALID` | Typed alert visible with client-owned copy; server detail not rendered as copy. |
| S02 | Keep authenticated session but remove only CSRF cookie, then preflight a valid copied declaration | 403 `RESEARCH_PREFLIGHT_INVALID` | Typed refusal visible beside preflight with client-owned copy; server detail not rendered as copy. |

Result: **4/4 PASS**, 0 px overflow, no page errors/off-origin requests,
no unexpected write, and jobs **173 → 173**. Private 0600 receipt:
`/home/bobby/.local/state/portal-research-p23/20260927/runtime/f5-browser-refusals-20260930-a.json`,
SHA-256 `25e112f242ab721f3aef4bbcd9e59ff853239643430d1d57ce8b80055bb1f58e`.
The prior real-API negative matrix covers 401/404/409 and preflight 503;
these were not silently promoted to browser receipts by this test.

## F5 auth-gate retake and F3 suite provenance — 2026-09-30

The first eight-case browser attempt on clean `76d82ce5` was **FAIL 4/8**:
all four new 401 API calls returned typed `SESSION_REQUIRED`, but the harness
incorrectly waited for an in-panel alert. The existing AuthGate contract
replaces the shell with Frame 01D on 401. The failed private receipt is retained
at `f5-browser-refusals-20260930-b.json`, SHA-256
`bfac0f339a1f05a046e4c500e52ae2c1206ad93cddcdbc90e8720f90ab8b90ca`.

After test-only correction `64badfcc`, the same seven pinned runtime images
on the isolated `:8096` cell gave **PASS 8/8** at 1280 and 660 px. S14 400
and S02 403 stayed visible in their panels; S14/S02 401 showed the global
`SESSION_EXPIRED` Frame 01D with the original deep link preserved and the
old shell unmounted. Every case had 0 px overflow, no page errors or off-origin
requests. Jobs stayed **173 → 173**. Clean candidate source:
`64badfcc63273865f7252bd7b52f985e5762e487`; private 0600 receipt
`/home/bobby/.local/state/portal-research-p23/20260927/runtime/f5-browser-refusals-20260930-c.json`,
SHA-256 `ec799909a6a31497a2637852b47b13296d4f90c1e1b64df1d931762e295066df`.
No product frontend or image was changed. This closes only the browser-visible
400/403/401 subset, not full F5.

The existing `_preview-research-real-api.spec.ts` is **not a non-stubbed 54/54
receipt**: its S11 draft/seal/publication cases intercept product API calls
with `page.route()` (around lines 447–460 and 539–541), and its S14 case
intercepts four writes (around line 947). Those fixture/mixed cases remain
valid UI tests but cannot be counted as real-API acceptance. F3 requires an
exact-candidate browser lane with real writes/reads for these actions, no
product-API interception, and pinned source/image/migration IDs. Existing
separate real S02/S14 write and S11→R1 bridge receipts are scoped evidence,
not a replacement for that complete lane.

## Still open

F3 still needs its complete 54/54 same-candidate lane and product/visual
review. F5 still needs remaining browser-visible refusal cases, a
**source-honest real typed 502** disposition, and revocation of disposable
qualification identities after the full campaign. An upstream-connect fault
previously produced gateway 504 HTML, not Research JSON 502; relabeling it
would be false. P23/P24, OL-24 and production activation remain open. No
SLO was relaxed to 600 ms, and no rollout, push or merge was performed.
