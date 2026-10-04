# P24 — generated consumer completion after §32

2026-10-04 · Codex delegated frontend logic/data-binding slice.

## Identity, scope and authority

- Worktree `/home/bobby/portal-research-be`, branch `codex/be-gaps`, base
  `b7e0b867`; shared landing remains `docs/research-loop-plan`.
- Bobby requested finishing the remaining work using parallel agents. This
  slice repairs the named §32 consumer mappings, not Claude's approved design.
- Root owns the coherent commit, Unified/queue update and final candidate
  browser/API acceptance. This subagent did not stage, commit, push, merge,
  restart a preview, create a user, change a feature flag or deploy.
- No CSS, colors, typography, spacing, chart geometry, image or visual baseline
  was edited. Frozen Report/RC/source bytes and authority stay unchanged.

## Sources read

- Root `AGENTS.md`, `CLAUDE.md`, `apps/portal/AGENTS.md`.
- Research `CLAUDE-FOR-thanhvuong.md` A13.1–A13.4 and Unified P24/§13.6–13.7.
- `CODEX_SECTION32_REVIEW_AND_REPAIR_2026-10-04.md`, including the full
  generated-read handoff, real imported profile and sparkline diagnosis.
- P24 `README.md`, frontend journey, screen/action matrix, reconciliation
  receipt and append-only frontend amendment.
- P18/P20/P21 frontend handoffs and current P22
  `frontend-handoff-codex-closeout.md` (the contributor sketch is historical).
- S06/S09/S11/S13 screen specifications and the corresponding HiFi
  provenance/identity/audit sections. This is not a new full HiFi/browser
  acceptance claim; the parent lane owns final browser checks.
- Generated `research-report`, `research-release-candidate`,
  `research-release-candidate-publication`, `research-compare` declarations.

## Delivered mappings

| Surface | Generated fact | Consumer behavior / regression |
|---|---|---|
| S11 UNKNOWN publication intent | nullable `updated_at_utc_ms` | Null/undefined renders existing `not published`, never `1970-01-01` or observation time. Two regressions added. |
| S09 linked audit | `ReportDetail.final_audit_applicable` | Only `=== true` enables one GET. False is `NOT_APPLICABLE`; null/omitted is `NOT_PUBLISHED`. No inference from a kind/string. |
| S11 composition linked audit | `ComposeResponse.final_audit_applicable` | Uses the composition fact directly. Does not launch a redundant Report read to infer the same fact. Immutable pack route may read the named Report because that pack has no new applicability field. |
| Linked audit permissions | audit GET `may_create` + explicit applicability | Applicability only admits GET. An explicit button/confirmation and server `may_create` remain required for POST. Mount/reread never allocates a child. |
| Obsolete applicability | hook `enabled` fence | Disabling applicability clears/fences the old read/write and guards `create`; a late permitted answer cannot revive the old action. |
| S13 retained identity | `provenance.source_manifest_digest` | Existing run tooltip/data attributes disclose retained artifact identity separately from preflight dataset/spec `manifest_digest`. Null stays absent; there is no fallback to the older digest. No new visible panel/node. |

Source/presentation distinction: the current Report UI prints its frozen pins
and does not compare them to current views. Existing cursor/revision semantics
are retained. The false cross-scope equality was in
`scripts/research-preview/p24-reconcile.mjs`, not a required UI computation:
line 197 used `manifest_digest` as artifact identity and lines 249–256 compared
archived read representation pins unconditionally to current representations.
Root/scenario lane was notified to repair its new receipt, not rewrite old
Reports or turn those differences into authority.

## Changed files and line counts

Before this authored receipt, exactly ten frontend files: **+116 / −30**.

| File under `apps/portal/frontend/src/research/` | + / − |
|---|---:|
| `CompareDetail.tsx` | 10 / 2 |
| `LinkedAuditConsumer.tsx` | 11 / 10 |
| `ReleaseCandidateDetail.tsx` | 1 / 1 |
| `ReleaseCandidateRoute.tsx` | 2 / 2 |
| `ReportRoute.tsx` | 1 / 1 |
| `compareDetail.test.tsx` | 17 / 0 |
| `p24ad.test.tsx` | 13 / 5 |
| `releaseCandidateDetail.test.tsx` | 10 / 0 |
| `useLinkedAudit.ts` | 3 / 3 |
| `workspaceAudit.test.tsx` | 48 / 6 |

## Focused execution

One successful affected batch, using the existing Node 22 image and installed
dependencies (no network, no reinstall):

```text
node node_modules/vitest/vitest.mjs run
  src/research/p24ad.test.tsx
  src/research/workspaceAudit.test.tsx
  src/research/compareDetail.test.tsx
  src/research/releaseCandidateDetail.test.tsx
&& node node_modules/typescript/bin/tsc -b --pretty false
```

- Vitest **4 files / 201 tests PASS**, 14.61 seconds.
  Suite counts: 7 + 29 + 57 + 108. This is affected fixture/unit evidence,
  not 201 real product/browser checks.
- Node 22 TypeScript project build: **exit 0**, no diagnostics.
- `git diff --check` on frontend files: **exit 0**.
- First harness attempts failed before tests: the backend worktree's
  `node_modules` is an absolute symlink into the shared Research checkout;
  mounting only `/workspace` made `npx` attempt network resolution. After
  explicitly mounting existing dependencies, read-only Vite temporary cache
  caused `EROFS`. The corrected bounded batch mounted that cache normally,
  used direct `node` commands and did not install/change dependencies.
- No manual full Vitest, mandatory hook, browser rebuild or broad snapshot
  update was launched by this subagent. Root consolidates the candidate gate.

## S06 mobile flake disposition

The historical packet retains **227/228**, with `S06 on real reads at mobile`
passing 3/3 alone. Its failed trace/error was not located in retained
`test-results` or the supplied packet. The real-API test waits root visibility
and `networkidle`, then checks overflow/noise; those alone do not identify the
failed assertion or distinguish a transient backend refusal from a layout
failure. No assertion, timeout, refusal allowlist or baseline was weakened,
and no speculative S06 code fix is claimed. The exact final candidate's
full-load browser run must determine whether this cell is stable; isolated
passes do not erase that historical failure.

## Resource/cleanup and remaining gate

- Owned `portal-p24-consumer-tests` ran with `--rm`; final exact-name inventory
  was empty. Earlier harness containers also terminated; no runtime service,
  volume, source data, release image or backup was deleted.
- Capacity after tests: filesystem **178 GiB available / 621 GiB**, 72% used;
  memory **14 GiB available**. **NO_ACTION_NEEDED**, no prune.
- Slice status: **AFFECTED_CONSUMER_UNIT_AND_TYPECHECK_PASS**.
- Final compiled bundle, real API/browser mapping, S06 full-load retake,
  engine transition and outstanding §16.6 scenarios remain the parent P24
  acceptance work. This receipt does not grant OWNER_ACCEPTED/Product GO or
  production release authority.

## Final-candidate affected browser harness — prepared, not yet run

`scripts/research-preview/p24-consumer-real.mjs` is a separate, bounded
real-API receipt lane; it does **not** retake or replace the historical
228-cell gate. It refuses any project/origin except the owned `:8096`
qualification cell, requires the exact final Control API and Web image IDs,
and uses the shared ephemeral QA identity from the private owner config.
Only one browser/context/page runs, without test workers or product writes.

The planned denominator is **16 affected cells**:

- S09 and S11 on fixed, causal and global runs at 1280/660 px: **12 cells**.
  Explicit `final_audit_applicable === true` must produce exactly one audit
  GET; false/null/omitted must produce zero. Mount cannot confirm/create an
  audit. False/unknown retain their typed panel states.
- S13 attempts: **1 cell** compares the current API's retained artifact pin
  and preflight dataset/spec pin to their separate existing tooltip/data
  attributes. Missing artifact identity has no preflight fallback.
- S06 mobile at 660 px: **3 rounds**, each with 20 concurrent GET lanes,
  four bounded Library/Progress reads per lane (**80 reads/round**). This is
  one QA principal, not 20 users, not the W06 SLO gate and not HEAVY admission.
  Search must reach its named readiness/card facts with no horizontal
  overflow, JS errors or unexpected console noise; all concurrent reads
  must return 200. The harness waits source-state markers, not sleeps.

The query helper preserves the hash cursor and binds each run's own
workspace. Before/after hashes cover jobs, selection records, seals,
Report manifests, RC packs and publications. No DB/source mutation is used
to manufacture a browser receipt. Parent owns temporary-user expiry after
all coordinated lanes and final runtime cleanup.

Focused harness checks: direct Node invocation reports **8/8 PASS**,
`node --check` exit 0; no dependency install/container rebuild/full gate.
Tests cover owned-cell/final-image guards, exact applicability, independent
manifest scopes, named bounded read routes, mutation refusal, workspace/hash
preservation, exact typed-409 resource-console classification and raw-byte
SHA-256. A refusal console line is expected only when its exact final-audit
URL returned typed `409 RESEARCH_FINAL_AUDIT_NOT_APPLICABLE`; generic 4xx/5xx,
React warnings and all S06 noise remain failures.

State here: **HARNESS_READY_PENDING_FINAL_CANDIDATE_BROWSER**. The scenario
lane runs first; no old-image browser receipt is substituted. The final
browser result and its private JSON byte hash will be appended after the
coordinated run.

### Additional actual workspace binding defect — corrected before Web rebuild

Preparing the real browser revealed that S13 `CompareRoute` and neighboring
S10 `LineageRoute` ignored explicit URL `workspace_id` even though their
existing hooks/generated clients support it. The S13 legacy resolver also
discarded that scope during its redirect. Parent explicitly authorized these
exact binding repairs. Both named reads now receive the URL workspace, both
route containers reset on scope identity, and the resolver preserves it.
No backend permission, contract, visual composition or interaction design
was changed. Three regressions cover the canonical reads and resolver.

One additional affected batch: Compare **59/59** + Lineage **58/58**, total
**117/117 PASS**, 7.08 seconds; TypeScript build **exit 0**. Existing offline
Node 22 container ran with `--rm`, no services restarted. Scope-check changes
bring this slice's total frontend diff to **13 files, +149 / −35**. This
includes the earlier ten-file repairs; these two batch counts are not
additive independent product acceptance counts.

Harness API probes retain the exact owned browser session explicitly for
Playwright's HTTP-loopback API transport, which otherwise withholds Secure
`__Host-` cookies. The real Secure/HttpOnly cookie remains unchanged and its
value is never persisted or printed. The browser itself remains the product
consumer. API reads cannot be sent until the real owned cookie is present.

Scope note reported to parent: some older outbound S10/S13 run/compare links
do not carry explicit workspace despite the receiving routes supporting it.
This authored slice fixes current deep-link **read binding** only; it does
not claim a full cross-screen navigation audit or silently expand design.

### Outgoing S10/S13 scope closeout — later approved addendum

Parent then explicitly approved closing that concrete outgoing-link gap
before the single final Web rebuild. `ResearchScopedLink.tsx` wraps only the
existing links of `CompareDetail`/`LineageDetail` and S13's lightweight
lineage links. It preserves their single anchor DOM, props/ref, original
copy, query/hash and any explicit destination workspace. External,
relative, object and other-domain destinations are not rewritten. The
original shared `LineageLink` used by Alpha Import is unchanged. S13's pair
picker now also scopes its existing options GET and resulting pair
navigation; no extra read or interaction was introduced.

Final affected scope batch: **123/123 PASS** (Compare 60, Lineage 58, helper
5), 7.33 seconds; same-batch `tsc -b` **exit 0**, diff check **exit 0**. A
first strict run failed one scope assertion because the lightweight lineage
link bypassed the ordinary Link wrapper; it remained an actual failure until
corrected, not an allowlisted skip. The final slice includes **16 frontend
files, +257 / −41**, including the two new helper/test files. Earlier
line-count snapshots above are historical, not the final total.

The prepared real browser denominator is extended to **17 affected cells**:
the original 16 plus one S10 named-read/outgoing-scope cell. S13 also checks
outgoing scopes and only checks provenance tooltips for the claimed READY
attempts actually drawn on the accepted ladder; unclaimed attempts remain
counted in their existing collapsed group, not forced into new cards. These
checks still do not replace the historical 228-cell matrix or grant release
acceptance. Final Web source is frozen and reported ready to parent; browser
execution waits the new image IDs and coordinated scenario turn.

### S14 supported workspace binding — same explicit approval

The scenario lane found S14 `AlphaImportRoute` invoking
`useAlphaImport(undefined, initialAlpha)` despite the URL carrying a target
workspace. Parent authorized the identical narrow correction: the existing
hook now gets that workspace for registry/parse/gates/register/activate,
and its container remounts on workspace identity so a previous workspace's
quarantined source/receipt cannot be reused. No supported operation or
permission was added. The existing S14 outbound Lineage/New Run links now
use the same scoped lightweight-link wrapper, with the old no-Router anchor
fallback retained for standalone presentational panels. The underlying
shared `LineageLink` is still unchanged.

Focused S14/link batch: **23/23 PASS** (S14 17, helper 6), 2.70 seconds;
same-batch TypeScript build **exit 0**, reported ready to parent.
Tests prove explicit workspace on the registry GET and parse POST request
body, version/new-run/lineage link scopes and unchanged standalone anchor
props/DOM. The parse POST here is a fixture/unit request, not a claimed
real-server import receipt. Parent's final scenario lane owns that proof.
Final authored frontend diff is now **19 files, +304 / −45**, including the
two new helper/test files. No layout, color, copy, typography or baseline
has been changed.

### Systematic Research workspace forwarding repair (final source freeze)

The real scenario retake found S06 returning a run refusal while the same
named Manager/Portal read with explicit workspace returned 200. This was
not an engine-data gap. Parent approved a single exhaustive audit of route
containers, subordinate readers and outgoing named Research navigation.

Implemented only data/logic binding:

- S01 passes workspace to Library list, selected-row lookup, polling,
  sparklines and P22 version-publication lookup; filter/selection/paging
  rewrites preserve it instead of reverting to actor-default scope.
- S02 passes workspace to Atlas, registry, catalog, clone/fork, label,
  preflight/create hooks, declaration estimate, per-window bar metadata,
  symbol search/pagination and P22 publication lookup. Start-over and
  post-create navigation retain that scope. This adds no operation or
  permission; the existing server still enforces every action.
- S03–S08 route/container keys include run plus explicit workspace.
  S04 hub/series/passport/handoff, S05 split, S06 retained identity/declared
  space/mode/fold ledger/pagination, S07 verify/what-if/identity and S08
  replay/split-band requests use the same existing supported workspace
  options. StageRunBar Library/failed-stage reads also receive it.
- Journey/Atlas readers remount on scope change. Existing named links in
  headers, exits, stages, lineage, sibling and reports preserve workspace,
  query/hash and any destination's explicit scope. Native anchors stay
  native; standalone presentational fallback, DOM, styles and copy remain
  unchanged. Hash-only, external, object/unrelated destinations and
  artifact/download URLs are not rewritten.
- Optional trailing workspace parameters were added only to the two local
  estimate hooks and requested-spec clone reader where forwarding was
  missing. No OpenAPI/schema/authority change was required.

Regression record (fixture/unit, not product receipt):

1. Consolidated affected 12-file batch: 562 existing cases passed; new
   scope tests initially had two invalid fixture setups (unsealed/null RC,
   hub-only replay). These stayed failures until corrected, not skipped.
2. The next new scope run found one genuine unscoped StageRunBar GET in
   S08. Corrected all four stage-bar callers and S06 pagination forwarding.
3. Affected six-file retake **297/297 PASS**, 13.82 seconds; the single
   deferred `tsc -b` **exit 0**. Includes eight product-route regressions:
   actual issued subordinate requests, late prior-workspace hub response
   cannot win/old request aborts, no cross-scope ETag, Library filter+clear,
   New Run clone+start-over, and scoped outgoing links.
4. Final exhaustive callsite scan found S01/S02 P22 lookup options still
   absent; parent approved both supported-option forwards. Their focused
   retake **2/2 PASS**, 0.277-second tests/6.35-second process. Other eight
   cases deliberately excluded by `-t`, already passed above. Earlier
   test failures were setup mistakes: missing required alpha+av pairing,
   incorrect registry test path, and unsealed candidate fixture.
5. Browser harness safety tests **9/9 PASS**, syntax and diff check exit 0.
   No full hook, Execution/Planning visual suite or baseline re-record ran.

Final authored FE diff at source freeze: **52 files, +657 / −154**,
including new `ResearchScopedLink.tsx`, its tests and
`workspaceRoutes.test.tsx`. The first build had already copied source when
the two lookup omissions were found; parent correctly requested a cached
Web rebuild. Do not claim that there was only one build or that the stale
image proves these final corrections. Browser execution awaits the final
image IDs and completion of the coordinated scenario lane.

The prepared browser receipt now has **20 affected cells**, not the
historical 228-cell gate: 12 Report/RC applicability cells, Library filter
scope, New Run clone scope, Evidence deep link, Compare/Lineage scope and
three S06 mobile concurrency rounds. Parent approved only the exact named
metadata-read POST `/api/v1/research/datasets/declaration-estimates` in the
New Run clone cell. Source proof: Control
`dataset-index.controller.ts:67–103` reads scope/Alpha/Atlas; Python
`routes_research_internal.py:163–185` reads the metadata index and runs a
bounded metadata-only estimate cache (`enrich_dataset_catalog.py:270`).
It creates no preflight token, job, registration, seal or publication.
The harness still rejects every other API POST/PUT/PATCH/DELETE, preserves
the before/after custody oracle and records this read by operation name.

### Real candidate consumer receipt — first run and exact scope diagnosis

Owned isolated origin: `http://127.0.0.1:8096`; worker stayed off. Exact
Control image `sha256:108c7d604b67ad34f201bbb0c485ad1770e0db7cecab3042900ab80e94cc07c0`,
Web image `sha256:f7500cdf503b6f94d9edeaa330436af265ef37302382e5761b12c8accfb5827e`,
served bundle `/assets/index-DJk17BDR.js`. The temporary QA95 actor was
authenticated by the real Secure/HttpOnly session. No credential/cookie
bytes are published in this packet.

First actual 20-cell run: **18 PASS / 2 FAIL**. The failure receipt is retained,
not overwritten or reclassified as green:

- All 12 Report/RC cells passed at 1280/660. Fixed/causal WFO facts publish
  `final_audit_applicable=false` and issued **zero** final-audit GETs;
  global WFO publishes `true` and issued exactly **one GET** per screen,
  rendering `READY_TO_ADMIT` without an audit-confirm POST.
- Clone, Compare artifact-versus-preflight provenance, Lineage and all
  three S06 mobile read-load rounds passed. Each round ran 20 concurrent
  lanes with four reads each: **240/240 HTTP 200**, maximum observed
  durations 429/323/229 ms across rounds, zero horizontal overflow.
  This is one actor and a scoped load check, **not** a W06 p95 or
  multi-user/heavy-admission claim. It does not establish the historical
  S06 flake's root cause; that original trace was unavailable.
- Library's harness wrongly expected the `clear filters` control while
  filtering to nonempty `R-WFO` results. The accepted control exists only
  in the empty-result state. A two-cell retake used an unmatched text
  filter and the actual accessible button name: Library **PASS**, including
  seven scoped reads, scoped filter/clear navigation and outgoing links.
  No UI/filter implementation was changed to satisfy the test.
- Evidence's 9 named reads and 22 in-screen links were scoped correctly,
  but the **shell run breadcrumb** outside the Research screen was not.
  `app/TopBar.tsx` linked `runCrumb.route` without the URL workspace;
  its cold S05–08 label read also omitted the hook's existing workspace
  option. This is an actual navigation/read-binding defect, not an
  artifact/external link to exempt from the assertion. Reported exact
  locations to parent before editing outside original Research-only scope.

No product API writes were attempted; no JS page errors or console errors
were observed. Both runs preserved before/after counts+hashes for jobs,
selections, seals, Report manifests, RC packs and publications. One browser
ran at a time after the scenario lane closed; both consumers closed their
contexts/processes. Parent still owns final QA revocation.

Private raw receipts (owner-local, not copied into Git):

| Run | Outcome | Raw JSON SHA-256 |
| --- | --- | --- |
| `p24-consumer-final-01` | 18/20 PASS | `fe9b1186e02e97fc9c1fc882311434170279f9912cda5426524c552cb311f264` |
| `p24-consumer-scope-retake-02` | Library PASS; Evidence shell link FAIL | `a0dae8af8f08f6d8cf806ac0211a0a3437638e8d2dd0607ea5179bc73dbd9cac` |

Harness safety checks at this point: **10/10 PASS**, syntax exit 0. The
two-cell retake did not repeat the already-passing applicability or load
cells. Await parent approval/final image for the exact shell forwarding
repair; product acceptance is not silently declared complete here.

### Exact shell follow-up — authorized, no redesign

Parent approved the previously reported shell forwarding defect. `TopBar`
now derives only the explicit URL workspace, passes it to the existing
cold-stage label reader, and applies the existing pure Research-only href
helper to its original registry/run breadcrumb destinations. Other routes
remain untouched; labels, anchor DOM, classes, layout and permissions are
unchanged. One regression asserts the actual label query's complete key
set, both Research breadcrumb destinations, and that `/execution` remains
unmodified. A first test run failed only because the new assertion assumed
query-parameter order; it was corrected to assert exact parsed keys, not to
relax scope. Focused existing/new TopBar file: **14/14 PASS**, 2.54 seconds.

This adds two authored frontend files beyond the 52-file snapshot above.
Product source is frozen again. Parent owns one cached Web-only rebuild;
Control/Python/worker and all Research composition files remain identical
to the `f7500cdf` receipt candidate. Therefore the prior affected
composition, exact applicability and 240-read load proofs are retained
without repeating them; the new image must prove only the changed shell
binding and the previously failing Evidence outgoing breadcrumb. This is
an incremental affected-path receipt, not a fabricated single-image
full-matrix rerun. The next two-cell retake starts a fresh browser context
without priming the run-label registry and prohibits all product writes.

### Final exact shell candidate — affected browser acceptance complete

Parent's final Web-only candidate:
`sha256:eaf966b9c7833a041d665a7527984e11726759289dfd0e261abe32f16e0bbdfe`;
Control image remained `108c7d604b67…` above. No further product edits,
runtime writes or scope expansion occurred during these retakes.
Both final browsers served `/assets/index-CxbZjo0l.js`; the cold-only
receipt records eight named requests and ten correctly scoped Research
outgoing links. Final harness safety unit checks remain **10/10 PASS**;
authored-path whitespace check exit 0.

1. `p24-consumer-shell-final-03`: Evidence **PASS**, including the nine
   named reads and **23** outgoing Research links (22 in-screen plus the
   shell breadcrumb). Cold S05 showed the correct source label and scoped
   reads, but failed the harness's newly introduced count assumption
   `2 !== 1`. The raw failure remains retained, not rewritten.
2. Source review demonstrated two existing independent bounded readers:
   `useRunLabelRead.ts:32` names the run for TopBar;
   `SplitDetail.tsx:450–451` / `useRunStatus.ts:71` reads its StageRunBar
   status. Both use the same list-by-id operation. Parent approved making
   the oracle assert exactly those **two** owners, rather than incorrectly
   attributing both network requests to the shell or redesigning dedupe.
3. `p24-consumer-cold-final-04`: the only retaken cell **PASS**, fresh
   browser/context, real published label, exact two bounded readers, all
   subordinate reads and outgoing links scoped. No earlier Report/RC,
   Compare/Lineage, Library or 240-read load gate was rerun.

Both final retakes: no page/console errors, zero attempted product API
writes, custody counts+hashes unchanged; browsers/contexts closed. Parent
was notified before handing the browser turn to the imported-run lane.
No claim is made that the initial run was 20/20 or that the historical
228-cell/73-cell full matrix was rerun. The authored affected-path consumer
repairs are **accepted by focused real receipts**; final P24/owner/release
verdict belongs to parent/Bobby.

| Run | Outcome | Raw JSON SHA-256 |
| --- | --- | --- |
| `p24-consumer-shell-final-03` | Evidence PASS; cold-count oracle FAIL | `21aabdfc5270db449cfcc90fdc38a0369ce1a43bcd451609b230c5be0a981e58` |
| `p24-consumer-cold-final-04` | Cold shell/stage scope PASS | `141518d20f1d4668655ea970fc3c147b3afc7265d909bfc1d95d5c333876a13b` |

Final authored frontend delta: **54 files, +682 / −159**. Of these the
last shell change is two files, **+25 / −5**. No layout/styles/colors,
typography, copy or visual goldens were edited. The separate harness and
this authored packet are additional paths, not included in that FE total.
No git staging/commit/push was performed by this consumer agent.

### Final SC23 draft custody and create-response relevance repair

Scenario review identified two concrete consumer defects after the browser
receipts above: one global `sessionStorage` draft crossed actor/workspace
contexts, and a pending create response could attach to a subsequently
edited declaration. Parent explicitly approved these narrow persistence
and data-binding corrections; no additional API, roles, design or runtime
identity was introduced.

- Draft persistence now requires the existing named authentication
  `principalId` **and an explicit URL workspace**. The version-2 storage
  key and envelope bind both facts. Reads validate envelope custody and
  never read or migrate the old unscoped version-1 key. Missing either fact
  disables persistence rather than guessing the server's default workspace.
  Restore, autosave, start-over, post-create clearing and the Library draft
  chip all use that same scope. The form remounts on actor/workspace change.
- New Run still works without persistence context. There is no autosaved
  status label to invent; the existing Start-over button's tooltip uses
  neutral declaration wording in this case rather than claiming a saved
  draft. DOM, classes, visible label and layout are unchanged.
- Create has a synchronous single-request lock, pending submit admission,
  and generation/declaration/workspace relevance checks for both accepted
  and refused responses. Editing A into B clears A's displayed receipt but
  does not cancel or delete an accepted A job: it remains available through
  the Library. A late response cannot attach to B. An unchanged declaration
  can recheck the exact original intent after refusal. Unmount invalidates
  response relevance; `finally` releases its own lock without setting state
  on an unmounted consumer.

Focused validation, using the existing offline disposable Node 22 image
and installed dependencies:

| Gate | Exact scope | Result |
| --- | --- | --- |
| Grouped affected tests | scope store/chip, create relevance, QA02b autosave, W2a New Run, existing New Run, W2b Library | **166/166 PASS**, six files, 6.89 s |
| Frontend typecheck | `tsc -b --pretty false` following that same batch | **exit 0** |
| Final directly affected retake | relevance/unmount and disabled-persistence tooltip only | **43/43 PASS**, two files, 4.21 s |

New regressions prove A-save/B-restore absence, other-actor absence,
original-A resume, scoped Library chip, missing context, forged envelope,
scope-specific clear, stale accepted/refused create after edit, duplicate
submit suppression, same-intent recheck and late resolve/reject after
unmount. These are focused consumer tests, **not** a claim that SC23's
real multiuser/CAS scenario or a full product matrix was rerun. QA identities
were already expired and no additional real job, actor, API write, browser
or runtime mutation was created for this correction. Parent owns final Web
build, mandatory grouped hook, candidate closure and cleanup.

Final authored FE delta including this follow-up: **61 files, +895 / −193**;
five new files are included by their actual line counts, not omitted from
`git diff --stat`'s tracked-only view. The previous 54-file slice remains
historical evidence, not the final total. Layout/styles/colors/typography,
visual baselines and unrelated Execution/Planning components remain
untouched. Consumer source is frozen; this additive packet is the only
subsequent authored edit. No staging, commit or push by this agent.

### SC23 follow-up — preflight token relevance, not only create relevance

Read-only scenario mapping found that a pending preflight A response could
arrive after the form changed to B and adopt A's token: the old invalidation
effect had seen no issued token while A was pending. Parent approved repairing
this exact logic defect rather than declaring the scenario closed.

`usePreflight` now captures generation, structural requested-spec equality,
workspace and mounted context for both create and reopen. The structural
equality helper remains the original client-only value comparison, never a
browser digest. A late accepted/refused response from a preceding context is
ignored; one active-request lock suppresses duplicate allocation, and a held
token invalidates on workspace change. Cleanup cannot set state after unmount.
API payloads, generated contracts, copy and layout are unchanged.

Focused batch: **139/139 PASS** in preflight (47, including nine new deferred
regressions), create relevance (5) and existing New Run (87), 4.78 seconds.
Typecheck initially found only two dynamic-spy deferred test promises inferred
as `Promise<unknown>`; both were explicitly bound to the generated
`PreflightResponse`. No product code changed for that typing correction and
the already-passing tests were not repeated. **tsc-only retake exit 0**.
Authored-path whitespace check also passes. No actor, job, browser or runtime
operation was performed in this follow-up.

These focused tests establish spec/scope/mount relevance and duplicate request
admission, not real two-user browser CAS or GUI-to-effective-worker equality.
RC drafts are actor-local, keyed by `(workspace,run,actor)`; a legitimate
two-user receipt must prove isolation, with revision conflicts tested using
two tabs of the **same** actor. It must not falsely expect distinct actors'
independent draft saves to conflict. Remaining actual scenario branches stay
separately identified until executed on the final owned candidate.

Updated final authored FE delta: **63 paths, +993 / −219**; the preflight
follow-up itself is two paths, **+98 / −26**. Source is frozen. Parent owns
normal commit, final Web image and any approved isolated browser continuation.

### Approved real SC23 continuation — restored declaration pin preservation

The first owned-browser attempt failed before any product cell because the
harness incorrectly required login HTTP 200; the existing normal login returns
201. The oracle now accepts exactly 200/201 and still requires the Secure,
HttpOnly normal session cookie. Its raw failed receipt is retained with zero
draft/preflight/create writes (`98c43795b23627ad448dded1e4c5b1e5e967de60760094b4573c44e5e3d7d411`).

Attempt `consumer-browser-r02` proved **SC23 real draft custody PASS**: three
autosaves, reload/resume, Library chip isolation, alternate-workspace absence,
same-storage actor switch absence and original-actor resume. The next outgoing
preflight was refused by the harness's exact-pin safety guard **before it was
forwarded to the backend**: its body had no `scale=1000` override. No preflight,
run or RC write was accepted. The intermediate raw receipt is retained
(`3342648550114075b88c0ec2e89b1a39b715a5731aa48fbd7bf1ea64df8f753e`); it is not
relabeled a successful lane. The route guard now catches and records failures
and closes held responses/contexts rather than letting an assertion escape.

Read-only comparison of the two existing named APIs proved that the immutable
clone DTO carries `[{"name":"scale","kind":"pin","value":1000}]` and its
bound Registry declaration publishes `scale` as the range 100–1000, step 100.
The defect was in restored-form adoption, not fixed-profile admission or the
serializer: a restored draft had parameters while the Registry was still
pending, so the previous effect erased them and marked the declaration adopted.
Parent approved the exact consumer repair. `NewRunRoute` now waits for its bound
Registry entry and reapplies the initial scoped draft's exact overrides; an
explicit clone remains authoritative, another alpha version cannot inherit
those overrides, and what-if cell pins retain their established precedence.
No request is rewritten by the harness and no admission, API or UI is loosened.

Focused QA02b + W2a tests: **65/65 PASS**. The added route regression exercises a
restored explicit pin with a deferred Registry response and verifies the same
serialized override before and after arrival. The first combined typecheck
session ended without recoverable exit output after compaction; its tests were
not repeated, and a typecheck-only recovery is recorded separately below once
its exit is available. The recovery returned **tsc exit 0**. The final owned-browser retake remains pending the
parent's exact rebuilt Web pin. No second job, unrelated runtime or visual
baseline is introduced by this repair.

### Real SC23 receipt r03 — three positive cells, producer correctly denied

On Web `08f4df00dc80e4b3f708e57e141ee3c2881db32c1f9524474e4509ea0ac175ae`
and Control `47a6cd0241358bc6249538d483809eba02ec21ae33ba120a523e5d1cddcc2ce3`,
the normal ordinary USER actors produced three real **PASS** cells:

1. Scoped browser draft save/resume and Library chip across workspace and actor
   switches, including a return to the original saved declaration.
2. A real HTTP 201 preflight response held until declaration A became B;
   its delivered token was not adopted and B could not create from it.
3. Two tabs of actor A read revision 0; the first actor-local RC draft PATCH
   succeeded (200), the stale tab refused (409). Actor B's distinct draft
   independently succeeded (200); IDs, text and revision were isolated, and
   the source fingerprint did not change.

The GUI producer cell stopped before create because the second real preflight
truthfully published `may_create_run=false`. Subsequent **named GET readback**
of both immutable actor-scoped preflights returned 200 and
`run_admission.code=RESEARCH_RUN_CREATE_FORBIDDEN`. This is the existing
ADMIN-only P10 admission (`run-admission.service.ts`), not a reason to promote
the ordinary SC23 actors or bypass the gate. Actual effects: **3 RC draft
PATCHes, 2 preflights, 0 create/jobs**; no guard errors, page errors or forbidden
writes. Browser contexts were normally logged out and closed.

Parent approved a separate, narrowly bounded `GUI_ONLY` continuation with a
fresh normally provisioned `p24-edge-producer` ADMIN in this clone's imported
workspace. It permits exactly one new actor-bound preflight and at most one
cheap pinned fixed GUI job; it skips all prior draft/CAS/preflight cells.
USER denial remains preserved as a real negative result. Role is read from
normal `/api/auth/context`; the worker stays OFF until parent accepts the
exact persisted intake and the separate publication/export lane is finished.

Raw r03 SHA-256: `a7394cfbfd4036d6e16d73385c27b408b7b1c0997136270c74d0a2f17f030fb4`;
named admission readback: `f7b98af5394e2d0afc323ad16a384e6421b8de6af316ae42ebe393b1a438b462`.

### Eligible GUI producer continuation — actual child complete

The single `GUI_ONLY` cell **PASS** on the same final candidate, using the
distinct normally authenticated, parent-provisioned `p24-edge-producer` ADMIN
in only the imported workspace. No ordinary SC23 actor was promoted and no
backend RBAC/admission rule changed.

| Fact | Actual receipt |
| --- | --- |
| Candidate Web / Control / Python | `08f4df00dc80…` / `47a6cd024135…` / `c939a7b5639a…` (full hashes in private raw receipt) |
| New actual run | `rrun_144e04e13c07b5d65ca5a915b6e4e743` |
| Bound alpha / executor | `av_p23_section32_imported_0_1_0` / `p17.imported-signal-notional.v1` |
| Read-only history | `crypto-binance-1m`, `BTCUSDT`, `1h`; IS June 1–8, OOS June 8–15, opaque holdout June 15–17, 2026 UTC |
| Exact fixed declaration | `signal_notional`, `three_window_decay`, `mode_1_decay`, `global`, `scale=1000` pin, 1 trial, seed 42 |
| Requested-spec digest | `a468999626234d6643e9a4d031fc19703632e9b9d95ab05f3ea28c3e3da91f19` |
| Effective-spec digest | `5f43669f41cce6c32212669b6a28ab5df7b1bde660585854cc535d40ac0de1d9` |
| Actual product effects | 0 RC PATCH, 1 eligible actor-bound preflight, 1 GUI create; double-click allocated exactly one run |
| End state | Real named Progress read `COMPLETED` / terminal materialization `READY` |

The browser cloned the real immutable DTO without modifying its requests,
received the real preflight and 202 create responses, then edited declaration A
into B before the held 202 was delivered. The old accepted A receipt did not
attach to or navigate B; B's create control stayed disabled. The raw browser
requested/effective values and all four manifest/dataset/spec digests matched
the immutable preflight and persisted producer row. Only after the validated
intake marker did parent start one pinned worker, following completion of the
separate publication/export lane. Engine-agent independent readback of actual
child bytes remains a separate receipt, not inferred from this browser's 202.

No page/guard errors or forbidden API writes; Browser/context normally logged
out and closed at `2026-10-04T11:19:44.735Z`. Parent retains responsibility for
normal disable/revoke of the four temporary actors and stopping the exact owned
worker/cell. Raw GUI-only receipt SHA-256:
`8bd763ae1b5826582cc04f55e558214b625955a003f2b0fb9ccb912ca6eb9bad`.
The original USER-denied cell stays a negative result; the three prior SC23
cells and this one GUI-only cell are scoped incremental acceptance, not a
claim that all §16.6 or the historical visual matrix was rerun.
