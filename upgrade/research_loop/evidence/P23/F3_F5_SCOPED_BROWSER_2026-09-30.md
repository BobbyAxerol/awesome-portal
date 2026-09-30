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

## Still open

F3 still needs its complete 54/54 same-candidate lane and product/visual
review. F5 still needs remaining browser-visible refusal cases, a
**source-honest real typed 502** disposition, and revocation of disposable
qualification identities after the full campaign. An upstream-connect fault
previously produced gateway 504 HTML, not Research JSON 502; relabeling it
would be false. P23/P24, OL-24 and production activation remain open. No
SLO was relaxed to 600 ms, and no rollout, push or merge was performed.
