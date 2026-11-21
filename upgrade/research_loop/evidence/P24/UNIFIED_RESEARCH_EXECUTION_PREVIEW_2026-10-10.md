# Unified Research + Execution preview — 2026-10-10

Verdict: **PREVIEW_REVIEW_READY / FUNCTIONAL_ROUTES_PASS**, with the limitations
below. Not P24 acceptance, source activation, console-clean product acceptance,
owner visual approval or a signed release. Bobby approved the public preview
without Cloudflare Access; dev/main/stable and the AWS cell were not changed.

## Delivery and identity

- Shared branch: `docs/research-loop-plan`; config commit
  `6640c7f9825b6546de077b7fc3006914e630c338`.
- Site: <https://research-portal.primusspark.com>. Web entry:
  `/assets/index-hBXCtrBk.js`.
- Existing reviewed components and same-origin BFF consumers are unchanged.
  `EXECUTION_PREVIEW_ENABLED=true` is a build argument, not a fixture switch.
- Rebuilt only web and Control API with the existing preview helper. Scoped
  `up` excludes migrations, bootstrap and DB/NATS/worker restarts. A later
  Control-only source-stamp update reused the **same tested image**, then
  rechecked four required API reads and R1 hard-refresh. No second engine run,
  application rebuild or full browser rerun was needed for that metadata change.
- Application inputs were HEAD `99a2eb73` during the initial build. The overlay
  was committed as `6640c7f9` after its normal hook passed; its four changed
  files contain no application source edits. Runtime/identity now names
  `6640c7f9`. This receipt's later documentation/harness commit does not alter
  either application image; do not substitute its SHA as a newly built image.

| Service | Actual Docker image ID |
| --- | --- |
| Web | `sha256:83d003dd2b32ca3667b95300862a107253f519c15a6626c15330454fe370cdf4` |
| Control API | `sha256:6f0f20cba133e2292c9aeb6863696b4e773f668b9124731316e59e14bc0b95e5` |
| Unchanged Portal API / worker | `sha256:20da76618efb92e1b8930339a6797aba3b5bc72849bdf5173c62617cf554b2b5` |

Local Command Center snapshot is enabled. External Edge/profile reads,
projection/mirror writes and reads, Execution SSE, upstream analytics/market
feeds, command relay and R0 tasks are explicitly **false** in the tracked
overlay, regardless of private host-env values. Research flags are preserved.
No TLS/SLA renewal or new AWS/source request was made.

## Real browser and local bridge

Chromium `151.0.7922.34`: 16 routes × 1280/660 = **32 rendered cells**,
with screenshots and SHA-256. Every cell's document width equals its viewport;
no uncaught JavaScript error or blank main content. Research Library/Atlas,
Execution Command Center/Operations, Approval Inbox/Waivers, Alpha/Portfolio/
Account/Paper/Sandbox/Live/Blotter and Admin Actions are mounted. This is a
render/transport receipt, not a renewed 73-cell visual baseline.

Eight required GETs passed, including local Command Center/catalogue,
Paper/Sandbox/Live typed-unavailable envelopes, an existing publication and
its **actual** R1. RC navigation was clicked at both widths; explicit-workspace
R1 deep-link and refresh also passed. No approval was fabricated or decided.

- Run: `rrun_73bc3a98cb77edfbe2c0cb9597254d93`.
- RC: `rc_06GGABY3ZPCK8HWMA762Z327M1`.
- R1: `apr_06GGAC00VHRN2Y9C34S55HEDC2`.
- Workspace: `ws_06GCVTHWC9WVPGEPR85AB15K82`.
- [Research RC](https://research-portal.primusspark.com/research/quantbt/runs/rrun_73bc3a98cb77edfbe2c0cb9597254d93/release-candidate?workspace_id=ws_06GCVTHWC9WVPGEPR85AB15K82).
- [Existing R1](https://research-portal.primusspark.com/governance/approvals/apr_06GGAC00VHRN2Y9C34S55HEDC2/r1?workspace_id=ws_06GCVTHWC9WVPGEPR85AB15K82).

The preview automation account initially had no gate-read grants: publication
correctly returned `approval_read=DENIED`. Bobby's **existing preview account**
used the normal owner login, step-up, Origin/CSRF and idempotent grant API to
grant `governance.r1.read`, `r2.read`, `canary.read`, `live.read` to
`claude-preview` in **only this workspace**. Four audited `APPLIED` responses
declare `external_effect=NONE`. No `.decide`, administrative capability,
membership change, owner reassignment or SQL write was used. Public auto-login
remains `claude-preview`, never Bobby. Both owner/test sessions were revoked.
For rollback, Bobby can revoke these exact four grants through Profile Access;
IDs/revisions/event receipts are in the private `read-grants.json`.

Browser observed **0 product writes, 0 Execution stream requests and 0 external
product API requests**. The existing Cloudflare-injected beacon made 34 asset
requests to `static.cloudflareinsights.com`; it is recorded separately, not
hidden or called an AWS/Execution source connection. No Cloudflare setting
was changed. Existing Research progress transport is unchanged.

## Data custody and honest absence

| Research table | Rows before/after | Unchanged row-content MD5 |
| --- | --- | --- |
| `runs` | 112 | `f172cd3b8612ffe84c7f91507c42d7ab` |
| `current_source_seals_v1` | 37 | `8208bf1fea0db013870295ecf08a6d7c` |
| `release_candidate_packs_v1` | 4 | `fe0c32a96704a897e0c6cbbb8663c176` |
| `release_candidate_publications_v1` | 2 | `2640ea548f705304789bf8ddd4b2571e` |

DB/NATS/Portal API/worker/Roadmap container IDs, images and mounts are unchanged.
Execution projection snapshots remain **0**, not a fresh authoritative empty
Trading System result. No production data or fake operational rows were copied.
The two existing accounts remain; the full user-row hash changed during the
owner's normal password login (`resetLoginCounters` updates `updated_at`).
The original hash is retained, not rewritten as a false custody PASS. The
browser lane subsequently preserved the complete post-login user-row hash.
No password reset, credential rotation or bootstrap/activation was run.

## Named review limitations / Claude handoff

1. **Source-off HTTP noise:** 84 failed HTTP reads / matching browser resource
   console messages were recorded across 32 cells. No React/DOM exception.
   Typed reasons include `EDS11R_PANEL_REQUIRES_PROJECTION`,
   `N31_PROFILE_NOT_CONFIGURED`, `N13B_PROFILE_NOT_ACTIVATED` and
   `EDS05_PROJECTION_WORKSPACE_NOT_FOUND`. Also observed: mirror-integrity
   `404 REQUEST_REJECTED` and equity-sparklines `404 WORKSPACE_NOT_FOUND`.
   Do not describe this as zero console warnings. Separate missing preview
   data/profile from any workspace/default or route-alignment defect before
   the next Execution integration slice; never silence it with fixture data.
2. **Explicit workspace propagation:** the publication mirror returns a bare
   R1 href; `ReleaseCandidateDetail.tsx` uses it verbatim. This passes for
   the automation account's own workspace, but **does not prove** cross-workspace
   RC navigation. The Execution router already forwards a supplied
   `workspace_id`. A later approved binding fix must preserve the RC workspace
   in the link and prove a non-default-workspace round-trip; do not broaden
   backend membership/read authorization to work around the missing query.
3. **R1 mobile review:** at660, the existing sticky decision rail covers some
   content while scrolling. Screenshot `660-31.png` records it. Claude should
   evaluate the approved composition/rail in the UI refinement, not Codex
   redraw its component. No design, token or baseline was edited in this slice.
4. **R2/Canary/Live are review surfaces**, not a proven automatic RC promotion
   chain. No operational rows/decisions were manufactured. R1 retains creator
   self-approval refusal. Rich populated reference designs remain separately
   labelled under `/execution/_fixtures`; product pages use real local BFFs.

## Tests, private evidence and cleanup

- Targeted config/source-stamp tests: PASS; web TypeScript/Vite and Control API
  builds: PASS; normal config commit hook: PASS, including 2,450 Control API
  tests (3 skipped) and the existing offline contract/authority gates.
- No strategy/engine run, visual baseline re-record, CI dispatch, remote push,
  dev/main merge or signed deployment in this slice.
- Evidence directory (mode0700):
  `/home/bobby/.local/state/portal-research-unified-preview/20261010`.
  Preserve `before.json`, initial failed attempts, `read-grants.json`,
  `2026-10-10T07-21-31.174Z/receipt.json`/32 screenshots and `post-stamp.json`.
  Both failed and passing attempts stay separately named, not overwritten.
- Passing 32-cell JSON SHA-256:
  `eddf9a337998696d682a6c0883d5d4804ac2bb34e736b675469532b142eee859`.
- Post-stamp JSON SHA-256:
  `c28d7e7964156bace9d3976d16acf554429a8d64d0356c0adedc211838b8a733`.
- C4: normal hook trap removed its exact disposable test containers; owned
  browser processes are closed and sessions revoked. Keep the preview running
  for Bobby. Root170GB free (~27%), RAM13Gi available; deploy runner `active`.
  Docker inventory: images87.79GB, volumes30.76GB, BuildKit191.1GB
  (61.99GB reclaimable is **not** deletion authority). `NO_ACTION_NEEDED` for
  phase-local cleanup. No broad prune, backup/volume/image deletion or runner
  restart. A global cache maintenance window is separate from this build.
- Preserve prior rollback images: web
  `sha256:52286243d156b95c4bfe2adb62ef3368d7138612dca3ea93d556f96c9ab861df`;
  Control `sha256:23bb143bb1bee1b216662ccbe9383aca325ee8945786d9304f0ba65a2af9ec38`.

[Unified owner scope](../../../UNIFIED_IMPLEMENTATION_PLAN.md#2026-10-10-owner-addendum--unified-research--execution-review-preview)
· [Preview runbook](../../../../deploy/runbooks/research-preview.md).
