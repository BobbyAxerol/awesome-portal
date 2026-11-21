# UDB-04 — Remaining acceptance repair

Bobby assigned the remaining summary SLOs, Portfolio/context burst and scoped
Command Center bootstrap/accessibility corrections on 2026-10-11. Parent
`734f5c36`, same `docs/research-loop-plan`; no push, dev/main/production,
upstream/source/SSE/command or release activation.

## Plan / exit

1. Preserve 16 MiB aggregate data cache/2 s TTL and fresh Core authorization.
   Measure the existing mixed-load profile before adding unnecessary changes;
   optimize only demonstrated local read costs. Pool 6/queue 12 and summary
   p95 500 ms remain unchanged. No permission cache or invented freshness.
2. Block the separate Command Center stream hook during retained/loading/
   failed context, close a withdrawn channel and reject late bootstrap replies.
3. Repair the six named accessibility cells using existing components/tokens.
   Preserve layout, text, colors outside these locators, and navigation.
4. Pin one app candidate and retake affected load/burst/keyboard/Axe/browser
   gates at 1280/660. Reuse unchanged authority/DR/export proofs explicitly by
   dependency/image binding; retain old FAIL receipts and populations.
5. Revoke owned identities, terminate only owned cell resources, retain private
   evidence/backups 30 days and record capacity. One grouped normal-hook commit.

Maximum verdict: `CROSS_LOOP_PREVIEW_READY_FOR_BOBBY_REVIEW`, only after all
applicable remaining gates pass; never owner acceptance or release approval.

## Scoped HiFi / consumer matrix and reuse

Authority: Execution design guide §4/6/8/9 and HiFi Command Center WF5a,
Gate R1 WF1a; Fleet is the existing approved expandable register. Retained
banner/context is the approved UDB-03 extension, not sample HiFi source data.

| Element | Existing component / contract | Required assertion |
|---|---|---|
| Static retained CC | `useCommandCentreStream`, `retained-review.v1` | No bootstrap, stream or idle read; explicit absent context preserves legacy live gate |
| Banner Details/Inspector | existing details elements / retained metadata | Keyboard disclosure and contrast ≥4.5, no global token edits |
| Fleet expansion / navigation | existing row + alpha/deployment links / fleet.v2 | Real table row; independent keyboard toggle, links do not toggle row |
| Source health horizontal table | `SourceHealthTile` / derivation.v1 | Named focusable scroll region, same table/content |
| R1 typed unavailable title | `PanelState` / existing refusal | Contrast ≥4.5; refusal remains visible, no fake permission |

Raw API/body/screenshot/session data stays private; repository receives hashes,
counts and sanitized results only. Baselines are not re-recorded.

## Results

**CROSS_LOOP_PREVIEW_READY_FOR_BOBBY_REVIEW.** Named final load, fresh-authority,
affected fault/export/browser and cleanup receipts supersede the earlier
SLO/burst/bootstrap/Axe failures. The coherent commit must pass the normal
mandatory hook; its successful commit/returned SHA is that final gate receipt.
No owner visual acceptance, source activation or release approval is inferred.

### Measured failures retained during repair

The full-body mixed lane now includes the actual Portfolio list **and**
Portfolio resource/detail, not bindings as a proxy. Twenty distinct real
principals get a measured identity-cold lane before the warm lane; the
per-principal Atlas cache is no longer incorrectly labelled warm after warming
only one viewer. No samples, errors or profile refusals are discarded.

| Attempt | Library / Progress / Evidence / Report / CC p95 ms | Result |
|---|---|---|
| 1 |780 /566 /658 /377 /457|Three summary failures; no HTTP errors/OOM|
| 2 |688 /438 /614 /542 /535|Four summary failures; no HTTP errors/OOM|
| 3 |599 /343 /509 /452 /545|Three summary failures; no HTTP errors/OOM|
| 4, added real Portfolio burst |1917 /1236 /1763 /1880 /1732|Four HTTP503; Portfolio detail1751/list1298; no OOM|
| 5, after Evidence join/prepared SQL |532 /317 /399 /271 /325|Only Library misses500ms; Portfolio481/context268; HTTP/OOM0|
| 6, after native JSON calculation keys |597 /425 /342 /292 /394|Library and Portfolio detail731ms fail; context256ms; HTTP/OOM0|

These are explicitly failed candidates, not performance evidence for the final
image. Childs completed and queued owned jobs were cancelled. Read-only CPU
diagnostics then isolated repeated Portfolio payload bounding/wiring and sort
serialization; no extra engine child was run merely for profiling.

### Delivered corrections under test

- Narrow claim facts join the already-authorized Progress/Evidence snapshot,
  avoiding repeated full multi-MiB seal/analytics parsing. Library validates
  the same exact enrichment bytes, shares only privately frozen children and
  avoids constructing missing-analytics errors. No authorization cache.
- Identical retained history SQL+values share **pending data only**. Context's
  nine domain metadata queries execute serially instead of holding three
  domain connections per miss. Pool6/queue12 stay unchanged.
- Resource identity/counts still inspect the entire accepted snapshot, but
  copy only the first200 public scoped rows. Sort keys/array byte sizes and
  UTC wire facts are computed once per read. A20ms bounded pending data batch
  shares identical workspace/resource/profile/exact-document preparation:
  max16keys/64followers, fresh actor/read clock attached separately. Capacity
  refusal uses the existing typed503. The initial pending-only diagnostic
  still missed500ms; the later correction below supersedes its no-template-
  reuse implementation, never its failed measurements.
- CC journal timestamp parsing reuses only exact fields/timestamp; its rolling
  read-time filter remains fresh. Streams are blocked on retained, pending,
  malformed or denied context; source mode is not activated.
- Fleet keeps the existing table/links and gains a native keyboard disclosure;
  CC scrolling table gains a named focus region. Existing banner/R1 selectors
  use the existing readable token; no global token, layout or baseline change.

Focused data-batch/wire tests17/17PASS, including actor/scope/document
isolation, fresh next batch, bounded followers and error recovery. One test
expectation assumed `stale` despite missing relations requiring `partial`;
corrected to assert actual scoped data rather than weakening product state.
Full candidate mixed load/browser, authorization retake and cleanup are still
required; direct diagnostics alone never close the phase.

### Final bounded representation correction

The prepared **data** representation is reusable for at most2s, at most4
entries, within the **same aggregate16MiB** budget as retained documents.
Keys include workspace/resource/environment and exact loaded document identity
+all source/projection clock metadata. Every request still loads the current
snapshot before a template lookup and checks Core authority independently.
Templates exclude actor and use sentinel read-time0; actual actor/root/panel
read clocks are attached after the lookup. A hit does not extend TTL. A later
successful DB revision check may renew the **same** raw snapshot's validation
deadline, and its exact-source template can reuse only that validated deadline.
Weak source references do not retain evicted raw documents. Changed/evicted
documents, metadata, refusals and errors cannot renew a template; source
or authority failures still fail closed. Snapshot insertion evicts templates
first when sharing the budget, not fresh authority or business rows.

The byte counter measures exact JSON UTF-8 once per graph, including duplicated
panel/legacy branches, Unicode and escaping; it is not a char-count estimate.
Evidence dispatches explicit-state canonical candles directly to their strict
canonical validator instead of producing hundreds of legacy bucket errors.
Legacy tapes remain supported/validated; malformed states stay typed absent.
Affected Resource/cache/Evidence tests30/30PASS. No contract/layout change,
no additive cache beyond the published16MiB, no permission cache.

Evidence's remaining584ms read-only diagnostic prompted one further scoped
correction: the source-bound supplement is joined into the existing authorized
repeatable-read Hub query instead of issuing a second SQL read. Fixed prepared
SQL reuses planning only; latest-source predicates, full current supplement
byte/run/digest verification, RLS and membership still execute for every reader.
No result/authority cache or2active/18queued admission increase. The affected
transaction/readiness/service tests59/59PASS, including mismatched-current-
bytes→sanitized503/rollback and fresh nonmember403 before the Hub query.
The584ms diagnostic remains failed, not relabelled as a final SLO PASS.

Attempt5 left Library532ms. Its exact-current card mapping now uses the
existing bounded pure-JSON calculation mechanism (Research4MiB/32entries/
30s, not Execution's16MiB data-view cache). Keys include every fresh row and
retained fact, dates normalized without loss, and the viewer-owned draft.
Every read still executes fresh DB membership/RLS/page/counts/draft selection;
changed state/time/draft/current bytes cause validation again. Mutable callers
and non-plain inputs bypass this calculation reuse. This does not cache a
Library response, its transaction clock/cursors, membership or authority.
The first calculation-reuse diagnostic still missed596ms. Its repeated
JavaScript fragment encoding was replaced by native JSON encoding after the
same plain/finite/no-Date/no-class/no-toJSON gate, preserving identical key
bytes. Private cloned-root encoding reuse and all resource limits remain.
Exact-current calculation/Library mapping tests24/24PASS; this diagnostic
failure is retained separately, not qualified or hidden by running an engine.

Attempt6 exposed periodic template expiry and skew in the twenty-reader Library
batch. Exact-source template renewal now follows only successful raw DB revision
validation, never hits or errors (still2s/aggregate16MiB). Library's pending-only
collection is40ms instead of20ms, still20 principals and4active/16queued;
membership/RLS/owned drafts execute freshly. No SLO relaxation. Affected
batch/cache/resource tests22/22PASS, including changed/evicted source rejection,
no sliding hits and staggered reader batching.

### Qualified backend candidate

Control image `5e5519716042` (full ID in closeout index), Docker COPY inputs
550files/SHA-256 `2e318ff7a5dec92779dafe6a5d9d4ee1573970ad8433bf54a957cc5059b260b1`.
Real20principal/64trial child +4durably queued intents,240identity-cold +
1200warm full-body reads (1440total), unchanged hard aggregate cap
4,536,870,912B. Warm p95ms:

| Library | Progress | Evidence | Report | CC | Portfolio list/detail | Context | Search/replay |
|---|---|---|---|---|---|---|---|
|445|224|327|265|448|210 /371|265|250 /370|

All cold/warm SLOs PASS (warm summary500ms unchanged), HTTPerrors0/OOM0.
Observed periodic cgroup maximum1,527,185,408B includes pagecache; kernel
lifetime peak unavailable, **not** claimed as lifetime peak or24hsoak.
Real child `rrun_95040380ee01328ea62dce0708d78a48` SUCCEEDED; exact4queued
jobs CANCELLED via normal API. Failed earlier images/receipts stay separate.

Fresh-authority retake32/32PASS, including new narrow Progress/Evidence
facts' wrong-workspace/nonmember negatives. Actual independent owned PG
outages/restarts13HTTP assertions +Execution independently ready PASS:
expired data fails closed, Core outage denies even warm Portfolio, Research
does not depend on Execution outage. No full DB restore rerun.
Prepare→finite worker→download82,416B SHA-256
`839b8db076074cb67587a2224e92fdb4a36e55b6970170ac2fe8f6f3016255b1`
matches, wrong actor404, no implicit GET writer/new engine.

Shared preview app-only helper applied this Control candidate and web:
six DB/NATS/API/worker/Roadmap containers unchanged. Custody16Coregroups/
6Roadmaptables +migrations/FKs/binding authority PASS. No shared bootstrap,
migration, credentials reset, grants or source clocks changed.

First affected browser retake correctly FAILED after3cells: the Source Health
**Board** used by live CC had not received the Panel's keyboard-region fix.
Added the same named native-focus scroll wrapper to the actual Board;
13affected consumer tests PASS. This is not a data absence or a weakened
browser assertion. Only web rebuilt; qualified backend untouched. Final
browser/cleanup required before the verdict below can supersede OPEN.

### Final browser, recovery reuse and closeout

Qualified Control `5e5519716042`; final web `2b5846bb6ff0`, bundle
`/assets/index-CcYTFVZV.js`, includes Board and retained Replay loader corrections. No
backend API/data behavior changed, so exact unchanged Control load and
auth/fault/export receipts are reused rather than rerunning the engine.

- Real API68route/tab/viewport cells1280/660 PASS;8Axe cells0violations,
  keyboard FleetEnter/Space expansion, Source Health focus, retained Details,
  overflow0. Real RC→R1click/reload preserves published workspace.
-0pageerrors/application warnings/unexpected HTTP errors/external requests/
  business writes/bootstrap/stream calls; idle16s0API calls. Explicit Refresh
  is GET-only and reads context exactly once. Session logout201.
-4explicit browser fault cases503/malformed200/401/403 PASS with300ms
  pending context: zero bootstrap/stream, zero application errors.401 correctly
  unmounts the protected shell and shows the existing session-expiry/re-login
  screen; the first harness incorrectly expected the protected shell to stay.
  Only the exact injected HTTP refusal console is classified separately.
- Prior browser attempt2 had one Market Context404; follow-up confirmed it
  was `WORKSPACE_NOT_FOUND`, not runtime-off. No error is suppressed or source
  activated to make it pass. Retained Replay had still attempted fresh Manager/
  venue candles from retained fill times. Both loaders/paging now honor the
  server's explicit retained/pending/failed context and show typed absence,
  without widening membership.15affected Replay testsPASS, including pending/
  retained/403/503/malformed blocks and explicit-absent legacy compatibility.
  The final browser also requires0source candle reads, with strict0HTTP/app
  errors (no404 allowlist). Source-enabled Market workspace binding must be
  separately qualified when that disabled source lane is reopened.
- A subsequent final-web attempt completed68cells/8Axe clean but failed on
  one retained-context503; nearby server analytics logs showed bounded
  `EXECUTION_POOL_BUSY`. Its exact refusal body was not captured, so that
  correlation is not presented as a proven per-request code. This attempt
  is retained as FAIL (`source-closed-browser`), not suppressed or folded into
  PASS. After the fault-injection harness was terminal, the unchanged final
  web's standalone retake (`isolated-source-closed-browser`) passed68/68,
  all8Axe cells, strict0HTTP/console/source reads. The independent controlled
  20-principal mixed/burst receipt remains PASS. This does not promise absence
  of typed capacity refusals under arbitrary shared-preview concurrency or
  increase pool6/queue12; every observed failed candidate/attempt stays visible.
- Browser-rendered HiFi CC/R1 and final scoped screenshots inspected. The
  approved rich components/table/layout/type scale remain; only named existing
  readable tokens/native focus semantics differ. No visual baseline rerecord,
  blanket design rewrite or claim of pixel parity with mock source data.

**Recovery reuse is dependency-scoped, not a new final-image recovery claim.**
Since `45821580`, auth/admin/error-filter, migrations, artifact byte verifier/
repository/client/restore harness, report export worker and QuantBT worker
remain byte-identical. Those named earlier real proofs cover current-auth
cutover rejection,27Execution hashes and fresh-volume69/69manifests,
3,212files/72,511,079B; archive/tree hashes stay in the historical index.
Pure Report calculation reuse changed, so current Report/export and current
authority/outage reads were retaken. Original68/68 and77/77 populations and
P23historical83/86+exact3Bobby-approved test exceptions remain separate.
No replayed archive byte is manufactured; no repeat engine/restore gate for
unchanged storage. This is preview qualification, not full source-live proof.

C4 complete:23owned test identities disabled/all sessions revoked;
20review grants revoked; only2exact original-clone test sessions revoked,
no password/global-session reset. Eight owned services/five labelled clone
volumes removed; remaining0/0. Current-auth dump and this lane's later
artifact archive retained30days (39,588,265B, hash in index), **backup custody
only**, not a new restore assertion. Shared16Coregroups/6Roadmaptables,
migrations/FKs and binding authority unchanged. Diskfree176,870,891,520B/
665,811,062,784B (26.56%);9distinct current/rollback image IDs resolvable,
failed candidates retained. No image pruning/VACUUMFULL/business deletion.
Named follow-up: bounded quiet-window candidate image inventory after30day
evidence retention; active/rollback pins remain protected.

Mandatory hook attempt1:2505Control testsPASS/3skip/1FAIL; the one failure
was an old admission mock assuming SQL string rather than the new pg prepared
query config. Updated the test adapter and asserted the prepared name on every
Evidence client, preserving2active/18queued/overflow/exact-release assertions;
targeted2/2PASS. Failed hook log retained, then ordinary hook retried. No app
bytes/images changed, so load/browser/auth/export/unchanged DR are not repeated.

No remaining implementation gap in the assigned SLO/burst/bootstrap/Axe
scope. Actual Stan absent → NOT_TESTED; missing downstream captures/source
activation stay typed and do not imply permission or lifecycle completion.
Bobby review and future P24/dev/main/stable/Cloudflare/source/SSE/command/
signed release are separate decisions. Sanitized hashes/counts are in
[closeout index](./closeout-index.json); raw data/cookies/DB backups remain
private0700/0600 under `acceptance-closeout-20261011`, never in Git.
