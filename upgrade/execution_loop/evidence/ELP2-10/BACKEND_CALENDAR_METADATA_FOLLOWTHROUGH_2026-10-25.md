# Calendar BFF wiring and exact metadata timestamps — 25 Oct 2026

## 1. Assignment / inputs / authority

Bobby requested continued backend work on the real financial/economic/health,
source metadata, calendar/notices and connected acceptance gaps. This slice
implements an unblocked **Core BFF gap** and fixes a metadata validation bug;
it does not relabel missing upstream qualification as complete.

Candidate: `/home/bobby/portal-backend-residuals-20261025`, branch
`chore/backend-residuals-20261025`, input `0e5614bd6`. Canonical Research
`685bc1915db51c7869254c1fdfa68991d7e4aae4` and Claude
`00e7f6cff2fadbd88b8ed461fa870b28ee88ad94` remain clean and unchanged.
No newer committed Claude request/ACK was present at this checkpoint.

Source commits: metadata `dc3c9015bea86f29b5e064ed48fb76f9e31a8a14`;
calendar `42c64cd74212382a76b74fa15f248a9963d4549d`. Combined
**8code/test/fixture files,+372/−10**, source tree
`773f086588de8a1ea5048969dfba25c64dc28ff7`. R1 only, not landed.

Read AGENTS, Unified, campaign §10.10c, the previous health/notice packet,
the existing public VenueCalendar contract and actual source. HK inspection
was read-only: owned Edge `86178d694abf156453cdf450553fa80bdd9becab`, clean;
peer Edge `8727e5303b1815d54bc2bdcb927a55457ff4da5b`, existing WIP preserved.
No remote file/DB/config/service or credential change.

## 2. Calendar: the previously unused mapper now reaches the BFF

Previously `venueCalendarFromSource` had tests but no caller in the actual VN
Paper Workbench. The workbench unconditionally published absence. Implemented:

- A private `createPaperVenueCalendarSource` composition and the
  `ControlApiDependencies.paperVenueCalendar` injection. No public endpoint,
  ENV switch, direct Data Layer URL, token or automatic installation.
- The workbench invokes this composition only for the VN variant **after** an
  exact deployment lookup. It passes the original user/session/workspace and
  resolved deployment/venue, not just a browser-supplied resource ID.
- Fixed workspace/Paper/profile/venue/source/catalogue binding. A mismatch
  never queries the unrelated provider; absent sources remain typed absence.
- An independently authenticated Edge adapter must lend a verified snapshot
  under current human authority, hold its source/custody fence across response
  composition, and revalidate through `assertCurrent`. READ does not confer
  STREAM or HISTORY. This interface is not itself an upstream adapter/proof.
- Closed private schema, maximum262,144UTF-8bytes, detached payload, original
  source as-of, observed/expiry checks before and after the workbench. Revoke or
  expiry during composition refuses the prepared response, with safe public
  error copy. No substitution of Portal observation time for source time.
- The existing public Fact fields and `venue.calendar` capability agree:
  AVAILABLE only if all six fields are available, PARTIAL for mixed coverage,
  UNAVAILABLE for no facts. An explicit `false` and empty holiday list survive.
  Unknown holidays or malformed sessions do not become zero/empty success.
- No configured source, non-VN route or unresolved deployment keeps the old
  behavior; no extra request/poll/cache/timer is created on the default path.

Synthetic carrier: `apps/control-api/test/fixtures/paper-venue-calendar.synthetic.json`.
It is not a live trading schedule, runtime configuration or source receipt.

**Still open:** Edge's `venues.calendar` remains SOURCE_DARK. A source-owning
adapter with verified carrier, matching catalogue/source revisions and an
original-current-human lease must be supplied/qualified before installing this
composition. This slice does not invent a new Edge wire operation or bypass it
by calling DL directly. External Edge notices also remain separately unmounted.

## 3. Source metadata timestamp correctness

Manager CURRENT Account360 used a timestamp regex plus `Date.parse`. JavaScript
normalizes impossible dates such as February30 and24:00 into a different day;
those invalid source facts previously survived. The decoder now verifies the
UTC date/time round trip before publishing. Valid leap days and source
nanoseconds remain exact strings; no DTO precision is lost or date repaired.

The source digest investigation **did not** result in a spurious hash fix:
Edge `manager_current_source.rs:578–587` projects the permitted `fields` object
but publishes the full original-row digest as `revision`. That is not the hash
of the projected response payload. Core still compares the pinned original
revision; it does not compare unlike hash scopes or invent a new receipt.

## 4. Changed paths / contract impact

- `src/execution/venue-calendar-source.ts`: private source composition.
- `src/app.module.ts`: optional server-owned dependency registration.
- `src/paper-read/paper-read.service.ts`: actual Workbench wiring and matching
  capability, preserving the absent/default path.
- `src/execution-v2/manager-current-accounts.ts`: exact timestamp validation.
- Corresponding three affected specs and one synthetic carrier fixture.

All paths above are under `apps/control-api/`. No frontend, SQL migration,
public OpenAPI/Zod/JSON schema/enum/generated type, route or policy vocabulary
changed. The existing public `VenueCalendar`/Fact contract is validated by the
new tests; regeneration is NOT_NEEDED for this slice.

## 5. Validation / resources / cleanup

Gate selector against `0e5614bd6`: **BE-PURE**, not a full hook/PG lane.

| Check | Actual result / scope |
| --- | --- |
| Focused Vitest | **5specs /147PASS**,6.67s. `venue-calendar-source`, `venue-calendar`, `paper-read`, `manager-current-accounts`, `manager-current-publication`. Source/lease and BFF fixtures, not connected acceptance. |
| Public contract | Existing stage-calendar schema and actual full Paper response schema validate in the affected tests. |
| Production-source typecheck | **PASS**, `tsc --noEmit -p tsconfig.build.json`, exit0. No output or generated build files. |
| Baseline differential | Default unconfigured Paper/VN workbench: **2PASS**, byte-identical on original `0e5614bd6` source. Original Account360 composition control: **1PASS**. Four malformed-date regressions **FAIL on the original source as expected** (it returned a body instead of rejecting), and PASS on the candidate. The old-source process exits1 intentionally, not a failed candidate gate. |
| Canonical fixture retake | **30PASS**,0.83s, only `venue-calendar-source.spec.ts` after adding one canonical round-trip case. Compatible affected union is **148unique tests**, not147+30 and not one148-test execution. No production code changed after the passed typecheck. |
| Diff / tracking / integrity | `git diff --check`, release-integrity `--check` (unchanged) and tracking PASS. Product NO_GO and inactive/unqualified source dispositions preserved. |
| PG / full hook / image / browser / load | NOT_RUN: no DB/image/UI change, no source installed; full R2 still belongs to the integration/landing candidate. No repeated unaffected qualification. |

No Docker resource, source listener, source data, session/grant or temporary
credential created. No heavy lock taken for host Vitest/typecheck. No push,
canonical/Claude edit, shared-preview/dev/main/stable/provider28445 change,
command SUBMIT or Live activation. Temporary differential probe, if used, is
removed after preserving its result; existing developer files remain intact.

## 6. Claude handoff / remaining owners / next backend

**Claude ACT_NOW:** keep the approved VN Workbench components. Consume the
existing `data.venue_calendar` Facts and matching capability; no new client or
field mapping is required. The source is currently absent, not suddenly live.
The existing public fixture is
`packages/contracts/fixtures/execution-venue-calendar.synthetic.valid.json`
(`.value`), already consumed by `stageFacts.test.ts`/`readVenueCalendar` and the
V2 workbench model. The new server carrier is internal, **not** an API response
to pass directly to that reader. A new round-trip test proves the actual server
factory produces the unchanged canonical public fixture. Reuse it and test
mixed coverage, explicit closed state and long session names for overflow.
Do not infer `is_open` from local time or treat receipt fixtures as connected
browser evidence. Return fixture ACK separately from the eventual qualified
source API/browser ACK. No component rewrite requested.

| Remaining input | Exact owner/action |
| --- | --- |
| Financial source / health publisher | Core+Edge owner must install the exact qualified same-cut financial batch and owning health axes. Previous batch writer and health migration154 remain available; this slice does not replace financial APPLIED/ACK with status heuristics. |
| Economic mapping | Edge coordinates PM's accepted economic identity namespace, census, ownership leaves and valuation/cost cut; the accepted owner return still leaves WIRE_MAPPING_OPEN. Same physical account is not a dedup rule. |
| Remaining metadata | Edge must publish/qualify original-grain fields with explicit field policy. No synthetic account credentials, inferred order VWAP, clock alias or policy expansion. |
| Calendar | Edge supplies the authenticated qualified carrier/lease described in§2; Core binds it using the new factory and takes exact-principal expiry/revoke receipts. |
| Edge notices / connected acceptance | Commission the independent Edge publication and original rights, then test finite/cache/cursor/SSE/revoke/recovery and Claude browser on the same installed candidate. The previously repaired local Fleet revisions are not Edge notices. |

**Backend next:** integrate the exact source-owning adapters when those input
contracts are supplied, not another unused calendar mapper; preserve the already
tested economic/financial/health paths. Qualification, not the new fixture,
closes the source rows. **ELP2-10 remains OPEN**. ELP2-11's existing assigned
preparation is preserved; its integrated qualification/closeout is not completed
or newly started by this slice.

## 7. Exit / rollback

Source slice exit: affected tests/typecheck/default preservation, committed
source and linked handoff. This is R1 only; R2/canonical landing is pending.
Rollback keeps `paperVenueCalendar` unconfigured and preserves original source
data, custody, grants and audit. The additive metadata validator only rejects
malformed dates; no stored timestamp/data rewrite occurs.
