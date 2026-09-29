# F3 exact-cell route and publication bridge checkpoint — 2026-09-29

This is a scoped, read-only browser/API checkpoint, **not** the 54/54 F3 lane,
F5, T15, P23 or P24 acceptance. The owned P23 loopback cell was built from
clean `74abadd4` with seven pinned images; no dev/production runtime or
business/source data was changed.

## Research product routes

`node scripts/research-p23/f3-product-route-real.mjs --home=<private P23 home>`
passed **30/30** cold browser deep links (S00–S14 at 1280 and 660 px), with
real same-origin API responses, zero page errors, off-origin requests,
horizontal overflow or implicit jobs. Owned workspace job count stayed
`158 → 158`. Private 0600 receipt:
`f3-product-route-real.json`, SHA-256
`c7cd3009ba3a725465c41e82b098241a161a88cf788583ef5a967cfd2b7818aa`.
This proves route render/API reachability, **not** that every panel has complete
data, every refusal is rendered correctly, or the full HiFi journey passes.

## Publication to Governance R1

The sealed RC `rc_06GE8RZMKKJKK9WD166GZZ1EN0` reads as `DELIVERED` with an
`APPROVED` R1 mirror. The named Governance R1 API returns the same approval ID,
status and evidence-set hash. The first browser bridge run failed **0/2**:
S11's link had the correct `/governance/approvals/<id>/r1` href, but after click
the product shell said “No feature in the current registry claims this route.”
Private 0600 receipt: `f3-publication-governance-real.json`, SHA-256
`ecb4a8f162ceb5d7f097bde5e2173ca314ad59597c02e97159f468c3b51f8552`.

This is a test-cell **build-profile mismatch**, not evidence of a broken R1 API:
the Research-only web image was compiled with
`EXECUTION_PREVIEW_ENABLED=false`. `PortalRoutes.tsx` mounts the Execution
preview router only if `VITE_EXECUTION_PREVIEW_ENABLED=true`; the web Dockerfile
and Compose default the build argument to `false`. The P23 private environment
did not override that default. Preserve this failed receipt. Retake only in
the isolated P23 cell with `PORTAL_EXECUTION_PREVIEW_ENABLED=true` at web build
time, from a clean source pin. This does **not** enable commands or change
production feature profiles. The prior private identity was archived as
`identity-research-only-74abadd4.json` before the variant build.

## Remaining acceptance

F3 stays **OPEN**: the canonical 54/54 real-API browser lane, refusal/negative
rendering, visual/HiFi review and exact candidate parity are not established
by these scripts. The publication/R1 bridge must be retaken on the
Execution-route-enabled test-only build. P23 T07/T12/T13/T14/T15 and P24
remain open independently. The original 500-ms W06 target has already passed
twice on the current candidate; Bobby's permitted 500–600-ms relaxation was
not needed and is not applied here.
