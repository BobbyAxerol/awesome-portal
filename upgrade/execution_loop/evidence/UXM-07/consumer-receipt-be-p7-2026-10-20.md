# UXM-07 — Consumer receipt: BE-P7 (FE-015/060/068, FE-057/058/038, FE-037/058), 2026-10-20

Writer: Claude (FE writer, consumer side). Consumer receipt per Rules §10.12.4 for the producer delivery
[BE-P7](../BE-CLAUDE-2026-10-20/BE-P7.md) (`10149b66` capital step-up, `594c298f` capture authority parity, `1449455e` self-context; merged on this base as
`41a72ba4`, `29ec3ef9`, `892ea030`). This is the consumer's record, **not an ACK of Bobby** (§10.3). `FRONTEND_BACKEND_SYNC.md` and
`UNIFIED_IMPLEMENTATION_PLAN.md` are **not edited here**: the proposed ledger cells are in §7.

## 0. Pin and lane

| Item | Value |
| --- | --- |
| Base | `claude/fe-parity` @ `792647d5`; commits below on worktree branch `worktree-agent-a13bcbfd43693e2f4` (not pushed, not ff-merged) |
| Contract artifacts read | `execution-access.openapi.json` (`AccessEligibilityBatch`, `AccessStepUpRequest`, `AccessStepUp`, `AccessSelfContext`, both paths), `execution-access.synthetic.valid.json` (`batch_cases`, `self_context_cases`), `packages/contracts/test/execution-access.spec.ts` (the step-up bodies), control-api `self-eligibility.ts` / `self-context.ts` / `step-up-family.ts` for the runtime rules the schema hands to the server |
| Lane | **FIXTURE_LAB** for every reader and component test (canonical fixture bodies, with only scope and clock rewritten). **BFF_DOUBLE** for the shell, port and e2e tests (in-test `fetch`, `e2e/bffDoubleSelfAccess.ts`). No `REAL_READ_*`: the installed image serves none of the three routes yet |
| Tier | **R1 only, R2 pending** (§10.10): focused vitest + `tsc` + one Playwright V2 spec. No Docker, no visual suite, no full hook |

## 1. Verdicts

| Field (BE-P7 §6) | Verdict | One line |
| --- | --- | --- |
| `GET /eligibility/batch` v2 + `challenges[2]` | **ACCEPTED** (reader + conformance, FIXTURE_LAB) | exactly two challenges in the fixed order, precondition bound to family, ALLOWED capital row beside an unmet capital challenge voids the whole read |
| step-up button (cockpit) | **ACCEPTED** model + component + port / **mount PARTIAL** | no cockpit control names a capital action today, so the rail mounts the block only when given a target (§2.2) |
| `portal.access-step-up.v1` response `family` | **ACCEPTED** | required, closed, the answer for another family is refused |
| `GET /self-context` | **ACCEPTED** (reader, port, hook, chooser) | consumed 8/8 top-level keys and every nested key |
| `self_entry.route` | **ACCEPTED** (route + rail entry) / **registry rev 7 OPEN** (Codex) | proposal in §6 |
| `account_operations` | **ACCEPTED** | token `execution.accounts.manage` removed |
| `review-capture-capabilities` `reason_code` | **ACCEPTED** | read through the stage dictionary; V1 `ReviewCapture.tsx` deliberately not edited |

No `CHANGES_REQUESTED` against the producer.

## 2. What was done, per task (commits in order)

### 2.1 `da3dbba1` · FE-015/060 batch reader v2 + step-up answer
`accessSelfBatch.ts` (schema literal v2; `challenges` = exactly `[CAPITAL_COMMAND, ACCESS_ADMIN]`, each `{family, mechanism, route, precondition, precondition_met}`
with the precondition bound to its family; the whole read is refused when an ALLOWED row of a step-up-requiring action sits beside
`CAPITAL_COMMAND.precondition_met:false` — server code `STEP_UP_CHALLENGE_ROW_DISAGREE`); new `accessStepUp.ts` (response with required `family`, request body that
always names the family, the typed outcome). `batch.v1` is typed `unsupported_shape`. `accessSelfBatch.conformance` was red-at-load on the base (UXM-10 F-15): it is now
364 tests, schema is the oracle, reader-looser-than-schema = 0 (the one rule the schema cannot say is stricter by design and marked as such). `accessStepUp.conformance` 102.
`newReads.test` KNOWN row (batch v1) now asserts the canonical v2 body is read. `testkit/schema.ts` ignores the annotation keyword `writeOnly` (one token; `AccessStepUpRequest.password`).

### 2.2 `b060a8b2` · cockpit step-up
`screens/cockpit/stepUp.ts` (re-exported by `laneModel`): a row **ALLOWED + REQUIRED** is offered a re-check only when some challenge has `precondition_met:true`, `CAPITAL_COMMAND`
preferred; NOT_REQUIRED / PLAN_DEPENDENT / ACTIVE / not allowed / no row / no challenge are sentences, never a button. `StepUp.tsx`: one password field + Confirm;
`POST /v2/step-up` through `ExecutionApi.postSessionStepUp` (CSRF header, fresh idempotency key per attempt, `Origin` by the browser, family always in the body); the password is cleared
at submit and is an argument of that one call only (test: absent from the batch ask, DOM, storage, every other call); after a 200 the batch is **re-read** (ACTIVE is never inferred);
`STEP_UP_REJECTED` / `ACCESS_DENIED` / `CURRENT_ACTOR_AUTHORITY_REQUIRED` each have a sentence; a proof for the other family is refused (port and block); late answers (scope change, unmount) are dropped
(mutation-checked: removing the guard turns 2 tests red). Tests: `stepUp.test` 27, `sessionStepUp.port.test` 14.
**Mount is PARTIAL**: `Rail` takes an optional `stepUp` target and renders the block instead of the informational "Not published (FE-015)" group only when it is given one. No cockpit decision names a capital
action today (the R2 / live decisions are `governance.*.decide`, whose rule is PLAN_DEPENDENT, and the Capital lane is `UNPUBLISHED_LANES`), so `index.tsx` passes nothing and the cockpit DOM is unchanged.

### 2.3 `66bb1a31` · self-context
`accessSelfContext.ts` strict reader (candidates unique and strictly ascending in the order published, one basis, `NONE` ⇔ the self entry `UNAVAILABLE`, `account_operations` the single typed absence with
`step_up_required:null`); `ExecutionApi.getSelfContext` (typed `unavailable` for another schema / unreadable body; fixture port: unavailable); `SelfNavigationPort.readContext` (optional: a port without it keeps a
workspace-less address idle). `useSelfContext` + `useSelfNavigation`: no `workspace_id` in the address → the context is asked (session-scoped, single flight, late answers dropped, one timeout at `valid_until_ms`, one re-read, Retry).
**RESOLVED** scopes the navigation read (the address is *not* rewritten); **AMBIGUOUS** shows the chooser, candidates in the order published, nothing read until the member picks, the choice is the address's `workspace_id`
(new history entry); **NONE** → "No workspace membership."; **UNAVAILABLE** → its reason; failed context → its reason. No default workspace is ever invented. Tests: `accessSelfContext.conformance` 287, `useSelfNavigation.context` 19,
`selfContextPort` 8, `SelfNavigationChooser` 6, `PortalShell.selfNavigation` +10 (and the one existing "no workspace → nothing is asked" test rewritten: it now asks the context, and says so).

### 2.4 `9d059e30` · self-only route and rail entry
`/administration/my-access` (+ `?workspace_id=`) registered with the `profile` flag, rendering the existing access self-view with **no `manage` prop** (the matrix stays at `/administration/profile-access` behind its owner + capability guard;
`?view=manage` on the new path asks for nothing more). `Sidebar.withSelfEntry`: one "My access" entry in the registry's Administration group and order (registry **not** edited), listed only when the shell hands an offer — a LIVE
self-navigation projection (its `self_entry.permission` is `ALLOWED`; and the context's own entry when the workspace came from it), shell flag on, `profile` flag on, an address-safe workspace, and no Profile & Access entry already listed (an admin gets no duplicate).
Loading / expired / failed / denied / choosing / absent offer none. Tests: `Sidebar.selfEntry` 15, `PortalRoutes.selfEntry` 5, `PortalShell.selfNavigation` +8.

### 2.5 `7f6aa460` · account
`ACCOUNT_CAPABILITY.manage` / `ACCOUNT_NEEDS.manage` removed (the token is gone from `src`). `rotateCredential(published)`: a published `account_operations` entry that is exactly
`REVISE_BINDING / NOT_COMMISSIONED / COMMAND_FAMILY_NOT_COMMISSIONED` → "Not offered in the portal yet" (the stage dictionary's existing sentence), no My access link; anything else, or no read → the reason the control carried before
("Not allowed. Your access does not include managing accounts." + My access link). `useAccountOperations` reads `GET /self-context` once per screen/drawer. "Rotate credential" is disabled in every case. Tests in `account.test` / `model.test`.

### 2.6 `55dc70c4` · capture reason codes
`captureReasonText(code)` in `stage/reasons.ts` reads a capabilities `reason_code` through `STAGE_REASON_WHY` (the same dictionary as the eligibility, because BE-P7 made both answer from one predicate). `ReviewNoteForm` and the cockpit rail use it.
`ReviewCapture.tsx` / `containers.tsx` are **V1-only** and untouched; `useSandboxReads.ts` still passes the code and needed no change.

### 2.7 `ac6cda4a` · UXM-10 F-11, F-12
`shell.css`: `html { scroll-padding-top: var(--topbar-h) }` (and 56px under 720px, where the bar is a fixed 56px). `v2/css/blocks.css`: `.exec-blk-replay span[class~="exec-rp-chip"] { cursor: default }` (an attribute selector because `v2Hygiene` forbids a V2 sheet
from spelling a V1 class; scoped under the V2 replay frame, spans only). `execution.css` untouched. The five `KNOWN_ACCESS` rows of `execution-v2-coexistence.spec.ts` are deleted (the object is empty). `uxm10Css.test` 8.

## 3. Copy needing Bobby's approval (every NEW sentence; everything else reuses approved text)

Reused as is: "This session has an active step-up until …", "Your password", "Confirm", "Checking…", "Enter your password first.", "Your password is with the server; wait for its answer.", "Reading", "Step-up confirmation", "My access",
"Not offered in the portal yet", "Read-only on this build", "Needs the approver grant", "Not enabled for this profile", "Not allowed. Your access does not include managing accounts.".

NEW (all advisory text, none enables anything):
1. Step-up block: "This action needs a fresh password check." · "No step-up is required for this action." · "The plan decides whether a step-up is needed." · "No step-up can be started for this session." · "No step-up is offered because this action is not allowed for you." · "The step-up state could not be read." · "The step-up state was not published for this action." · "That password was not accepted." (`STEP_UP_REJECTED`) · "A step-up is no longer open to you for this action." (`ACCESS_DENIED`) · "Your password or session changed. Sign in again, then retry." (`CURRENT_ACTOR_AUTHORITY_REQUIRED`) · "The Portal refused the step-up (CODE)." · "The step-up did not complete. Nothing was confirmed." · "The answer was for another proof than the one asked, so it is not used." · "an end time that was not published" (inside the existing "active until" sentence).
2. Workspace chooser / context: "Choose a workspace." · "You belong to more than one. Navigation loads once you choose." · group name "Workspaces" · "This workspace id cannot be put in the address." · "No workspace membership." · "Too many workspace memberships to choose from." · "The Portal did not accept this session for the workspace read (401)." · "The Portal did not permit the workspace read for this session (403)." · "The workspace read for your session ended and is no longer shown. Retry to check again." · "The answer did not match the published self-context contract." · "The answer is <schema>, which this build does not read."
3. Capture reason codes, **no new sentence**, but the mapping is a decision for Bobby: `RETAINED_REVIEW_READ_ONLY` → "Read-only on this build"; `ADMIN_ROLE_REQUIRED`, `GOVERNANCE_CAPABILITY_REQUIRED`, `GOVERNANCE_SCOPE_MISMATCH` → "Needs the approver grant";
   `CAPTURE_PROJECTION_NOT_AUTHORIZED` → "Not enabled for this profile". A role is not a grant and "scope mismatch" is more specific than "needs the grant" — if wanted, three more sentences ("Needs the Admin role", "The grant does not cover this deployment", "The paper projection is not authorised for this capture"); the cockpit rail prints `Unavailable · <words> · <CODE>` so the code stays visible either way.
4. The account fallback "Not allowed. Your access does not include managing accounts." is kept verbatim as the brief said ("otherwise today's reason") although, with the token gone, it is no longer a statement about the caller's access; suggest replacing it with the "Not published (FE-015)" sentence the token holders used to see, once Bobby agrees.

## 4. Gates

See §8 for the run record. NOT_RUN: Docker, visual pinned-image suite, full hook, `REAL_READ_*`, the whole coexistence spec (only the three `access ·` tests for the screens whose KNOWN rows were deleted), the flag-off build grep (no new chunk or lazy import was added; `PortalShell.v2Gating` and `PortalShell.flagOff` green).

## 5. Findings

- **F-15 closed** (UXM-10): the batch reader moved to v2 / `challenges[]`; the conformance suite loads.
- A capital delegate's dead step-up button (BE-P5 §6.1) is closed on the consumer side by construction: a button exists only when a challenge says it can work, and an ALLOWED capital row beside an unmet capital challenge is refused as a contradictory read.
- `GET /self-context` has `default_workspace.state=UNAVAILABLE` with `self_entry.permission=ALLOWED` (schema: only `NONE` ⇒ UNAVAILABLE). The FE offers no entry in that state because no workspace is known (the navigation is not read): consistent, but Codex may want the entry `UNAVAILABLE` there too.
- The shell lists "My access" from the **navigation** projection being live. `self_entry.permission` is always `ALLOWED` there (reader-enforced), so "live" is the only signal; if Codex later makes it conditional, `Sidebar.withSelfEntry` needs the field.
- Not wired: the cockpit step-up block has no live target (§2.2); `expected_versions` pre-fill, `paper.exit_review_request` (unchanged open items of the BE-P5 receipt).
- Pre-existing red, not from this work: `src/styles/tokens.test.ts` "keeps every raw color literal inside the declared token files" flags two comment lines in `v2/css/account.css` (hex inside a comment); I did not touch that file.

## 6. Proposal for Codex: registry rev 7 feature entry (the registry is Codex-owned; nothing is edited here)

The FE lists the entry without it by borrowing the group and icon of `PROFILE_ACCESS`. A registry entry makes the nav, breadcrumbs, palette and `featureForPath` first-class:

```json
{
  "id": "PROFILE_ACCESS_SELF",
  "label": "My access",
  "description": "What you can see and do, and the grants behind it. Only your own.",
  "group": "administration",
  "canonical_route": "/administration/my-access",
  "legacy_routes": [],
  "maturity": "AVAILABLE",
  "permissions": [],
  "environments": ["local", "research", "paper", "sandbox", "live"],
  "navigation": { "icon_key": "user-round-cog", "order": 20, "show_in_sidebar": true, "show_in_command_palette": true },
  "hidden_for_roles": [],
  "screen_ids": [],
  "source_module": null
}
```

Notes: `permissions: []` on purpose (the enforced capability list in `isNavigable` must not gate it: it is for members who do NOT hold `administration.profile_access.manage`); the FE would then drop `withSelfEntry`'s borrowed feature and list it only when the
self-navigation projection is live (the entry must remain an offer, not a static item). `PROFILE_ACCESS` and its `isNavigable` guard stay for admins. The 17 path constants that point at `/administration/profile-access` are unchanged.

## 7. Ledger cells proposed (Codex or the next round pastes; not edited here)

`FE-015 | consumer ACCEPTED (reader + model + port; cockpit mount PARTIAL: no capital target) da3dbba1 b060a8b2` ·
`FE-060 | consumer ACCEPTED` ·
`FE-068 | capture reason codes consumed 55dc70c4` ·
`FE-057 | consumer ACCEPTED self-context 66bb1a31` ·
`FE-058 | consumer ACCEPTED (self-only route + rail entry 9d059e30; token dropped 7f6aa460)` ·
`FE-038 | rail entry for ordinary members DONE on the FE; registry rev 7 OPEN (Codex)` ·
`FE-037 | execution.accounts.manage removed 7f6aa460` ·
`UXM-10 F-11 / F-12 / F-15 | closed`.

## 8. Run record

| Gate | Lane | Result |
| --- | --- | --- |
| `npx tsc --noEmit -p .` | static | exit 0, no line (run at the final tree) |
| `npx vitest run src/execution/v2 src/app --maxWorkers=2` | FIXTURE_LAB / BFF_DOUBLE | **196 files, 66,590 passed, 5 expected-fail, 3 skipped, 0 failed** (315 s). The first full run had 3 red: `linkTargets.test` (a real finding: the V2 source scan found the literal `/administration/my-access` in `accessSelfContext.ts`, a path that is mounted only with the `profile` flag, while that guard mounts with the flags off. Fixed: the reader names the route through the shell's `SELF_ENTRY_PATH`, one source, the conformance test still pins it to the schema) and two 5 s load timeouts (`account.test` "search and venue", `PortalShell.selfNavigation` "opens the self-only page"), both green solo; the second test now waits for the real self-view and has a 40 s budget |
| `PortalShell.flagOff` (6 route digests x closed/open), `PortalShell.v2Gating`, `v2Hygiene`, `failClosed`, `disabledReason` | static jsdom | green; flagOff digests **not re-pinned** |
| Playwright `chromium-v2` `execution-v2-selfnav.spec.ts` | FIXTURE_LAB / BFF_DOUBLE | **17 of 17** (1280 and 660), 1.1 min, private build on port 4286 (temporary config, deleted with its `dist`) |
| Playwright `chromium-v2` `execution-v2-coexistence.spec.ts -g "access · (portfolio-360 \| live \| alpha-replay)"` | FIXTURE_LAB / BFF_DOUBLE | **5 of 5** at 1440 / 1024 / 390 with the five `KNOWN_ACCESS` rows deleted: F-11 and F-12 no longer reproduce (portfolio-360, live; alpha-replay), no new finding |
| focused counts | | accessSelfBatch.conformance 364 · accessStepUp.conformance 102 · accessSelfContext.conformance 287 · stepUp 27 · sessionStepUp.port 14 · useSelfNavigation.context 19 · selfContextPort 8 · SelfNavigationChooser 6 · Sidebar.selfEntry 15 · PortalRoutes.selfEntry 5 · PortalShell.selfNavigation 32 · account screens 461 · uxm10Css 8 |
| **V1 / PortalShell proof for F-11** | | scroll-padding paints nothing and moves nothing at rest (it only changes where a scroll-into-view stops), the rule has one property (`uxm10Css.test` pins it), the flag-off DOM digests are unchanged, and the V1 execution rule of F-12 is the same text. The pixel claim itself is NOT proven by the visual suite (NOT_RUN, no Docker): it rests on the CSS semantics and the DOM digests |
| NOT_RUN | | Docker, visual pinned-image suite (V1 and V2), full hook (R2/R3), the whole coexistence spec (6 min) and its budget table (the Account screens now make one extra `GET /self-context` per mount: account-360 budget is 11 -> 14 requests, so it fits, but the number was not re-measured), `REAL_READ_*`, `src/styles/tokens.test.ts` (red before this work, §5), the flag-off build grep |

## 9. Rollback

Per commit, `git revert`: F-11/F-12 (two CSS rules + spec rows), capture reason codes (text only), account (the token returns; the control stays off), self-only route + rail entry (route and `withSelfEntry`; `selfEntry` stays `null`),
self-context (the hook falls back to idle on a workspace-less address; the optional port method is simply unused), cockpit step-up (the rail keeps its informational block), batch v2 reader (the conformance suite goes red again at load). Every read fails closed:
a revert leaves the screens on today's reasons and the rail on the session's own capabilities.
