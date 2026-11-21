# G3 · D1-O1 — the run label on a cold deep link (S09, S11, S13) and on Stages 1-4 (S05-S08)

Claude · 2026-09-30 · branch `g3-d1o1-cold-deeplink-label`, from
`origin/docs/research-loop-plan@d3d99f26`. **Not committed** — left in the
worktree for the owner's batched commit (owner directive, 2026-09-30: no hook
and no commit from this worktree).

Closes **D1-O1** of `D1_E13_RUN_LABEL_LINEAGE_CLAUDE_2026-09-26.md` §6, and the
follow-up the coordinator added mid-task: Stages 1-4 on a fixed-profile run had
the same gap.

**No migration was taken.** Nothing here needed one (the label is derived at
read time by `run-display-label.ts`, exactly as in D1).

---

## 1. Where the label rides on each read

The derivation is D1's, unchanged and called, never copied:
`runDisplayOrdinalSql()` for the ordinal, `runDisplayLabel()` /
`runDisplayOrdinal()` for the token. Required, nullable, the same
`^R-[A-Z0-9]{1,8}-[0-9]{3,6}$`. An unmapped profile, a child run or a run with
no producer row yields `null`.

| Read | Field | How the repository gets it |
|---|---|---|
| `GET /quantbt/runs/{id}/report` (S09) | top-level `display_label`, beside `run_id`, **outside `frozen_core`** | `manifestSelect()` LEFT JOINs `research.runs` and `research.run_producers` (both keyed workspace+run, so neither can multiply a manifest row) and adds the shared ordinal fragment |
| `GET /quantbt/runs/{id}/release-candidate` (S11 composition) | `run.display_label`, beside `run.id` | the existing snapshot query already joins `run` and `producer`; one more column |
| `GET /research/release-candidates/{id}` (S11 sealed pack) | top-level `display_label`, beside `run_id`, **outside `frozen_core`** | `packSelect()` LEFT JOINs the same two tables |
| `GET /research/alphas/{id}/compare` (S13) | `display_label` on the shared `Run` shape, so it covers attempts, market cards and both sides of a pair | the snapshot query's `primary_run` lateral now also selects `workspace_id` and `relationship_kind`, which the fragment needs |

Not changed on purpose: the seal `POST` response (a write, not a read), the
JSON/CSV report exports, and the P22 publication read (Codex's).

## 2. The frozen-core decision — what I did and why

**Outside the core, as a read-time field beside it.** Checked, not assumed. A
label inside `frozen_core` would have moved four things at once:

1. `report_revision` is `p18r1_` + sha-256 of the core's canonical bytes, so
   **every already-sealed report would have changed revision**;
2. `ResearchReportRepository.seal` re-verifies the stored digest and answers
   409 on a mismatch, and every core schema is `.strict()`, so a stored core
   with an extra key stops parsing (503);
3. `releaseCandidateSourceFingerprint` includes `report_revision` and
   `frozen_core_digest`, so **every draft would have been fenced stale and every
   sealed Release Candidate would read "evidence changed"**;
4. the export documents embed the core verbatim beside `frozen_core_sha256`.

The RC pack is the same shape: `pack_digest` is the digest of `frozen_core`, so
its label is beside `run_id` and not inside it. The RC source fingerprint
enumerates its fields explicitly and was **not** given the label.

**How that was verified** (tests, not reasoning alone):

* A control run. I regenerated the report fixtures from a pristine
  `git archive` of `d3d99f26` (none of this change in it) and from this branch:
  the four revisions are identical
  (`p04 15c53ec8…`, `wfo 9cdb7a7e…`, `scratch d6f24dbd…`, `failed f70013c1…`),
  and `sha256(canonical(frozen_core)) == report_revision` for each. Those four
  are pinned in `research-w6a-report.spec.ts` and `research-report.service.spec.ts`.
* The P04 Release Candidate golden (`research-w7-release-candidate-p04.golden.json.gz`)
  is **byte-identical and untouched**. Every variant's source now carries a
  label, and the composition, fingerprint, sealed frozen core, pack digest and
  pins still match it byte for byte; the one new field, `run.display_label`, is
  set aside in `observe()` and asserted in the service spec.
* Same core, three labels (`R-P04-001`, `R-P04-042`, `null`) → one revision, one
  digest, one canonical core; an export never contains `display_label`.

**One finding that is not D1-O1's, disclosed.** The WFO and scratch report
fixtures committed at `d3d99f26` were **older than their builder**: the builder
already emitted two `source_absences` keys (`in_sample_account`,
`rolling_sharpe`) that the committed files lacked. Re-deriving them through the
service, as asked, folds that in, so those two files' `report_revision` moved
`a3d25fcf…→9cdb7a7e…` and `5a74f333…→d6f24dbd…`. The control run above proves
it is the base builder, not the label. `p04` and `failed` did not move.
`research-report.export-jobs.valid.json` changed only because it embeds the WFO
revision.

**One decision beyond the letter, for the owner to confirm.** The report's HTTP
entity tag was the bare quoted `report_revision`. A read-time field would have
let a browser holding a report cached **before** this change revalidate, be
told `304`, and keep a label-less body: the cold-link gap, still there for
exactly the reports a person already opened. RF-05 solved the same problem for
Split, Search and the evidence series (a tag that names the representation), so
`etag` is now `p18r1_` + sha-256 of the whole served representation (versioned
`research.report-detail.v1+d1o1.1`). The shape is unchanged
(`^"p18r1_[0-9a-f]{64}"$`); the identity of the sealed core is `report_revision`,
which did not move. Side effect: a future change to the approval annotation now
also busts the tag. To revert: one function in `report.service.ts`, at the price
of the stale-copy gap. The P18 README's sentence "exact private ETag/304 only for
the sealed revision" (Codex's file, not edited) is therefore superseded.

Compare needed nothing like it: its `etag` already hashes the whole result, so
the label changes it. Its **projection cache** is keyed by the source binding
digest, which now includes the label; a projection cached before the field
cannot parse (the field is required), so it is recomputed and never served, and
it cannot shadow the correct one for the 15-minute TTL.

## 3. Contract changes (none hand-edited)

| File | Change |
|---|---|
| `openapi/research-report.openapi.json` | `ReportDetail.display_label` (required, nullable); `ReportEtag` and the `304` text now describe a representation tag |
| `openapi/research-release-candidate.openapi.json` | `ComposeRun.display_label`, `PackResponse.display_label` |
| `openapi/research-compare.openapi.json` | `Run.display_label` |
| `generated/research-{report,release-candidate,compare}.d.ts` | regenerated with the pinned `openapi-typescript 7.13.0`; each diff is 2-7 lines |
| `contracts-snapshot.json` | regenerated with `tooling/snapshot.py`; six lines; `--check` matches 216 files |

Zod: `report.contract.ts`, `compare.contract.ts`, `release-candidate.contract.ts`.

**Fixtures** were re-derived through the services (`W6A_WRITE_FIXTURES=1`,
`W7_WRITE_FIXTURES=1`), not edited:

* `research-report.{p04-fixed-profile,wfo-retained,wfo-scratch,wfo-failed,wfo-32-folds,export-jobs}` — label, etag, and the drift in §2;
* `research-compare.{attempts,markets,pair-ok,pair-nocorr}` — exactly the label plus the revision/etag it feeds (`pair-mismatch` and `problems` carry no run);
* `research-release-candidate.wfo-retained{,-declared}` — a one-line diff each, `run.display_label`;
* **new** `research-release-candidate.wfo-retained-pack.valid.json` — there was no canonical sealed pack; the frontend built one by hand. It is derived through the service from the same real run (seal, store, read back) and checked against `PackResponse`, with `sha256(frozen_core) == pack_digest`.

Labels in the fixtures are not typed by hand: `runDisplayLabel(profile, ordinal)`.
Compare's four runs use ordinals the repository's `count(*)` would give in a
workspace holding exactly those runs; a test recomputes them.

## 4. Frontend

The registry (`runLabels.ts`) is fed from the read each screen already makes,
the way the four D1 reads feed it:

* `reportClient.detail` — a `304` teaches nothing (the copy in hand already did);
* `releaseCandidateClient.compose`, `.patchDraft`, `.pack`;
* `compareClient.get` — every run of an attempts ladder, a market card or a pair; a refused pair carries no run.

An absent field (an older server) is remembered as no label, never a number.

**What was not enough.** `ShortId` renders the registry label, and S09 uses
`ShortId`, so S09 needed only the feed. **S11 and S13 do not use `ShortId`**:
they call the plain `shortId()` function, so feeding the registry alone would
still have printed `rrun_e1fa9e5c`. Smallest fix, two print sites of a new
helper `runLabelOrShortId()`:

* S13: the local `sid()` body (one function; the card layout is untouched);
* S11: three sites — the breadcrumb run, the composition rail's `run` node
  (only `key === "run"`), and the pack rail's run node.

A ladder card's head is the **attempt** id by design; the run reads on its run
line beneath it. Nothing in `ShortId`, `ReportDetail` or the card layouts moved.

### Stages 1-4 (S05-S08) — the coordinator's follow-up

The D1 record said these get the label "through `useRunIdentity`". Measured on
the unmodified branch, cold page, against the real preview API:

| | P04 (`rrun_464bf9c3…`, `R-P04-018`) | WFO retained (`rrun_e1fa9e5c…`, `R-WFO-016`) |
|---|---|---|
| S03 progress, S04 evidence | label | label |
| S05 split, S06 search, S07 freeze, S08 execute | **short id — gap** | label |
| S09 report, S11 release candidate | short id — gap (this task) | short id — gap (this task) |

So the D1 claim is **true on the retained WFO lane** (the identity read a
retained answer triggers feeds the registry) and **false on the P04 hub lane**:
those four screens read only P14-P17, which name the run by id, and
`useRunIdentity` is deliberately never asked for a P04 run ("a P04 run never
asks"). Their breadcrumbs already use `ShortId`, so nothing on those screens
needed to change except the registry.

Those screens make **no read that carries the label** on that lane, so a new
request was unavoidable without adding the field to four more backend reads.
It is one row: `GET /quantbt/runs?ids=<run_id>` (the Run Library's
poll-by-ids, which already carries `display_label` and already feeds the
registry), fired **by the shell** for those four screens only
(`RUN_LABEL_READ_SEGMENTS` in `researchRunCrumb.ts`, `useRunLabelRead.ts`,
two lines in `TopBar.tsx`), and only when no read has told the registry about
the run. No stage screen, hook or route was touched, which is why this does not
collide with the parallel S06/S08/S09 work and no route test sees a new fetch.

Cost, stated plainly: on a **WFO** stage screen the same one-row read is
redundant (the identity chain would have named it a beat later). The shell
cannot tell the lane before those reads land, and per-screen lane logic would
have meant editing four hooks other agents are working in. Verified: one
answered read per stage screen (the second in the dev log is React StrictMode's
aborted duplicate).

## 5. Tests — exact counts

Backend (`apps/control-api`), every PG-backed spec against a **disposable
PostgreSQL 16** (image pinned by the same digest `control-api-test.sh` uses,
127.0.0.1:55461, removed afterwards). The full pre-commit hook was **not** run.

| Set | Result |
|---|---|
| The 15 spec files this change touches or that read the changed classes | **111 passed, 0 failed** |
| the whole `test/research` (87 files, PG included) | **86 passed, 1 skipped; 605 tests passed, 1 skipped** |

New cases: 25 (`research-report.service` +7, `research-release-candidate.service` +6, `research-compare.service` +5, `research-release-candidate.contract` +2, `research-w6a-compare` +2, `research-w6a-report` +1, `research-w7-release-candidate-retained` +1, `research-compare-migration` +1), plus assertion blocks in three existing specs:

* `research-w7-release-candidate-migration` (PG) — real SQL, runtime role: the composition, the sealed pack and the report repository all publish `R-WFO-001` for the seeded run, digests unchanged; then five more runs are added with explicit creation times and read back: a later run takes the next number and renumbers nothing (`R-WFO-002`), two runs created at the same instant are ordered by run id (`003`, `004`), the P04 run counts from 1 on its own (`R-P04-001`), an audit child gets `null` though its producer names a mapped profile;
* `research-compare-migration` (PG) — the same rules through the compare service, plus "the label is in the cache key" (revision changes after a third run);
* `research-report-migration` (PG) — a run with no producer row has a `null` label, the row is not duplicated, the digest is untouched.

Data the PG specs pin stays inside the declared ranges: run ids match the
run-id grammar, ordinals are ≥ 1, profile ids and digests are the two the
CHECK constraints allow (`p04.fixed-qualification.v1` with a null digest, the
locked WFO digest), timestamps are ordinary `timestamptz`.

Frontend (`apps/portal/frontend`), the touched files, final run:

| File | Passed |
|---|---|
| `research/reportDetail.test.tsx` | 68 (+4 D1-O1) |
| `research/releaseCandidateDetail.test.tsx` | 67 (+4) |
| `research/compareDetail.test.tsx` | 48 (+6) |
| `research/runLabels.test.tsx` | 11 (+3) |
| `app/researchRunCrumb.test.ts` | 8 (+2) |
| `app/topBarRunLabel.test.tsx` (new) | 13 |
| `app/PortalShell.test.tsx` | 18 |
| **total** | **233 passed, 0 failed** |

The S09/S11/S13 tests **load the canonical fixtures** and start cold (empty
registry, no prior navigation); they assert the label, the id kept in
`title`/`aria-label`, that a `null` or an absent field stays the short id, that
attempt ids and the other rail nodes are unchanged, and that a `304` does not
un-teach. The stage-screen tests exercise the shell against the label the
canonical report fixture's run carries.

Earlier in the session, the whole `src/research src/app src/portal` suite ran
once before the owner directive: **53 files, 1563 passed, 3 skipped, 1 failed**;
the one failure was `PortalShell.test.tsx › translates a legacy Planning hash
link`, a lazy-load `waitFor` timeout under concurrent load (the backend suite
was running); it passes alone, 18/18, and again in the final run above. It is
the same class of flake D1 recorded. The whole suite was not re-run after that.

Contracts: `packages/contracts` vitest **16 files, 191 passed**;
`snapshot.py --check` matches 216 files; the three `.d.ts` regenerate byte
identical. Not run: `scripts/contracts-test.sh` (it provisions `node_modules`
in Docker over the network); the pinned local `openapi-typescript 7.13.0` was
used instead and the result is the file.

`tsc`: backend `tsc -p tsconfig.build.json --noEmit` exit 0. Frontend
`tsc -b --noEmit`: **0 errors** outside `features/roadmap-task-board` (96
lines there, pre-existing: its `node_modules` is not provisioned in this
worktree). Backend `tsc --noEmit` including tests has 185 pre-existing error
lines; the new ones I added are copies of existing patterns in test files (a
missing `workspace_id` on a query literal), which the gate does not compile;
I removed the ones in my new code, and did not re-run the full count after the
last tidy.

## 6. Screenshots — fixture versus real

Vite dev server on 5233 from this worktree, proxying `/api` to the preview.
**The preview was only read, never written to.** Every shot is a **fresh page**
(no prior navigation), logged in once per width. Files are in the session
scratchpad (`g3-d1o1/shots/`), not committed. sha-256, first 16 hex:

**FIXTURE** — the preview is `d3d99f26` and has none of the backend change, so
its reads carry no label; the canonical fixtures were served in place of the
reads (Playwright route interception). Page, components and shell are this
branch's real code.

| Shot | Size | sha256 |
|---|---|---|
| `g3-s09-report-1440` | 1440×3558 | `45bf67e78bfd6d55` |
| `g3-s09-report-660` | 660×5328 | `5d3be8cc2d160cfc` |
| `g3-s11-compose-1440` | 1440×2252 | `6fbb027b5e357d32` |
| `g3-s11-compose-660` | 660×3274 | `d176b909addb8b5d` |
| `g3-s11-pack-1440` | 1440×2273 | `6a66be8b94fbba79` |
| `g3-s11-pack-660` | 660×3191 | `f6da90f6ab254d88` |
| `g3-s13-attempts-1440` | 1440×1274 | `ce0a1ffa79008f93` |
| `g3-s13-attempts-660` | 660×1952 | `bd1febac7dc95190` |
| `g3-s13-pair-1440` | 1440×1420 | `4d93e00f9de300c9` |
| `g3-s13-pair-660` | 660×1765 | `fe6e61ada1994579` |
| `g3-s13-markets-1440` | 1440×900 | `a9fde3a554665ccb` |
| `g3-s13-markets-660` | 660×1318 | `280ffdca8053d5fc` |

**REAL** — the real preview API for the P04 run `rrun_464bf9c3…`; the label
comes from the Run Library's ids read, which the preview already serves:

| Shot | Size | sha256 |
|---|---|---|
| `g3-real-p04-split-1440` / `-660` | 1440×1177 / 660×1729 | `f85a96437e417fc5` / `ad7480a17ff9bc7d` |
| `g3-real-p04-search-1440` / `-660` | 1440×1508 / 660×2310 | `96e6390ec81f3683` / `cf71d3c32a588449` |
| `g3-real-p04-freeze-1440` / `-660` | 1440×2232 / 660×2705 | `c96b5f8226d02202` / `33844ca2006d93b5` |
| `g3-real-p04-execute-1440` / `-660` | 1440×2015 / 660×2860 | `f94c7895612ae5cc` / `5761ddda4f5e0359` |

What I looked at (top of S09 at 660, S11 at 1440 and 660, S11 pack, S13
attempts at 1440, S13 pair at 660, S08 and S05): no header broke.

* S09: topbar `Research / QuantBT Backtest / R-WFO-001 / Run Report`; the run chip reads `R-WFO-001` beside the title at 1440 and wraps under it at 660; the footer reads `R-WFO-001 · report …`.
* S11: crumb `Evidence Flow / R-WFO-001 / …`, the rail `RUN / ATTEMPT` node `R-WFO-001` over `ratt_e1fa9e5c` (attempt id unchanged); the pack route's rail node and crumb read the label as well.
* S13: run lines `R-P04-001 / R-WFO-003 / R-WFO-002`, pair heads `A · R-WFO-002`, `B · R-WFO-003`, legend `R-WFO-002 · av_1_0_0 (…)`; card heads are attempt ids, unchanged.
* S05-S08 (P04): topbar `… / R-P04-018 / Stage 4 · Execute`, body crumb `R-P04-018`.

`documentElement.scrollWidth === clientWidth` on **all 20 shots** (1440/1440
and 660/660): no horizontal overflow. No page error and no unserved API response
on any (the sealed-pack shot's publication read is deliberately 404). Truth
table before the shell change, for the record, is in §4.

## 7. What is left open

| # | Item | Why |
|---|---|---|
| G3-O1 | **The preview must be rebuilt from this branch** to show S09/S11/S13 labels for real. | Its API is `d3d99f26`; those three shots are fixture. Stages 1-4 (P04) already work against it. |
| G3-O2 | **Stages 1-4 on the P04 lane carry the label through a shell-issued one-row read**, not through their own reads. | Adding `display_label` to the P14-P17 hub reads (three of them share `ResearchSplitRepository.hub`; replay reads through the evidence hub) would remove the request and the WFO redundancy. Bigger diff, four more fixtures and their frontend tests, in files under parallel edit; not done. |
| G3-O3 | The P18 README line "exact ETag/304 only for the sealed revision" is superseded by §2. | `upgrade/**` is Codex's; not edited. Confirm the RF-05-style tag, or say revert. |
| G3-O4 | A run on `p16.delta-whatif-grid.v1` still has no label (D1-O3, unchanged). | The map knows two profiles; a token invented for a third would be a guess. |
| G3-O5 | Seal `POST` response and the P22 publication read do not carry the label. | Not reads of a run's identity; the second is Codex's. |
| G3-O6 | Full hook not run; full frontend suite not re-run after the last edits. | Owner directive, 2026-09-30. |
| D1-O2 | Screen 01's card still prints its own short id. | Untouched, as in D1. |

## 8. Rollback

The change is one uncommitted diff (or one commit once batched). Reverting the
frontend alone leaves the servers publishing a field nobody reads; reverting
the backend alone leaves the screens on their short id, today's behaviour.
No migration, no data change, no flag. The one behavioural change with a
memory is the report `etag` (§2): reverting it restores the bare revision tag.
