# P13 · Screen 04 tab S5 Claim — real body in the HiFi shape (Claude, 2026-09-30)

Base: detached `784bb19d` (worktree `agent-a7b654da9f7219a79`). Not committed; no hook, no build, no visual lanes.

## Defect

`ClaimTab` (src/research/EvidenceFlow.tsx) drew three one-line panels:
"certification — …" (paragraph), "window disclosure" (the verbatim sentence only), and
"ARTIFACT MANIFEST — WHOLE RUN: no artifact state is published on this screen…".
The manifest claim was false: the run's progress read (P11 / E15) publishes it, and Screen 03 draws it.

HiFi: `upgrade/research_loop/release-v1.1/QuantBT 04 Evidence Flow.dc.html`, `isClaim` section
(lines 714–789): certification table (stage / condition observed / cap + resulting-level strip),
window table (IS / OOS / Holdout / Compare), manifest table (name, state chip, note, digest).

## Change

| File | +/− | What |
|---|---|---|
| `apps/portal/frontend/src/research/EvidenceFlow.tsx` | +273 / −20 | `TableCard`, `CertificationTable`, `WindowDisclosureTable`, `ArtifactManifest`; `ClaimTab` takes `retainedClaim` + `runIdentity` |
| `apps/portal/frontend/src/research/EvidenceFlowRoute.tsx` | +2 / −1 | the route asks the progress read (`useRunIdentity`) when `stage=claim`, not only for a retained run |
| `apps/portal/frontend/src/research/RunProgress.tsx` | +1 / −1 | `export` on `ArtifactsTable` (reused, not copied) |
| `apps/portal/frontend/src/research/evidenceFlow.test.tsx` | +103 / −0 | 7 tests, "S5 Claim — certification, window disclosure and the whole-run manifest" |

Sources, per block:

- **Manifest** — `ProgressRead.progress.artifacts` + `denied_artifacts` through Screen 03's `ArtifactsTable`
  (states `SEALED/WRITING/PENDING/ABORTED/DENIED`, size, `sha256:` short digest, `reader_href` never linked) +
  `ARTIFACT_NO_READER`; header meta = `mandatory_bundle` size/digest. Absences: `idle`/`loading` (not asked yet),
  `UNAVAILABLE` (read refused — no row drawn), and `progress: null` → `NOT_PUBLISHED` carrying the read's own
  `availability` (`QUEUED_NO_SOURCE`, …) as reason code.
- **Certification** — header row kept; one row `per-stage caps — not published` (the engine publishes none);
  resulting level = the hub's served `methodology_certificate` (grade chip with `CERT_TOOLTIP`, `NOT_ISSUED`, or
  `not published` with its reason code); "binding: not published" (tooltip = the verbatim rule).
- **Window disclosure** — IS: typed absence. OOS: `WINDOW_DISCLOSURE` verbatim + retained claim strip
  `validation_claim`, `oos_used_for_selection`; count = hub `fold_navigation` observed/published folds.
  Holdout: retained claim strip `holdout` (real run: `NOT_APPLICABLE`, `P10_DELTA_WFO_PROFILE_HAS_NO_HOLDOUT_SEGMENT`);
  count = progress read `denied_artifacts.length`. Compare: typed absence. No HiFi card count is printed.

## Evidence

| Gate | Result |
|---|---|
| `npx vitest run src/research/evidenceFlow src/research/runProgress` | 5 files, 281 passed, 0 failed (7 new) |
| `npx vitest run src/research/researchBoundary src/research/retainedLane src/research/queryKeys` | 3 files, 27 passed |
| `npx tsc -b --noEmit` | 0 errors outside `features/roadmap-task-board` |
| Browser, Vite 5245 → API 8095, `rrun_17f762128acf8c998ac7cc44d13f663f` `#stage=claim&fold=1` | `GET …/progress` 200; manifest `AVAILABLE`, rows `research/progress-journal.ndjson=SEALED`, `research/progress-receipt.json=SEALED`; OOS `2/2 folds`; Holdout `n/a · 0 denied`; horizontal overflow 0 at 1440 and 660; no console error |
| not run | `npm run build`, pre-commit hook, visual / lane suites (out of scope by instruction) |

Screenshots (scratchpad, not committed): `claim-1440.png` sha256 `6198f86c…db65a`,
`claim-660.png` `dbbeb148…f11e2`, `hifi-claim-1440.png` `899642b9…665c0`.

## Matches HiFi now

- Certification card: header strip + `stage / condition observed / cap` table + sunken "resulting level" strip,
  flex 1.4 beside the window card (flex 1), stacking under 800px.
- Window card: four rows IS / OOS / Holdout / Compare in role colours, right-aligned count column, footer note.
- Manifest card: header strip with right meta, one row per artifact: name · state chip with left rule · note (size + digest).

## Still differs (cause)

1. **Cap rows** — HiFi's four S1–S4 cap rows and "binding: Stage 1 …" do not exist: the engine publishes the
   certificate, not the per-stage caps (backend gap, no contract field).
2. **Window counts / IS / Compare** — "5/5 cards", "always readable", "enabled — same ComparisonContractKey" are
   published by no read on this screen; rows keep typed absences.
3. **Manifest content** — HiFi's ten engine artifacts (bars.parquet, selection_trace.json, …) with
   READY/NOT_APPLICABLE/ABSENT: the progress read publishes two SEALED P11 files for this run; the vocabulary is the
   read's (`SEALED`…`DENIED`), and there is no per-artifact description field. Digest sits in the note column
   (shared `ArtifactsTable`), not a separate right column; name column is 170px (Screen 03's), HiFi 190px.
4. **Extra panels kept** — the claim-state panel above the tables and "declared source absences" below are not in
   the HiFi tab; kept as served facts (not in scope to remove).
5. **Holdout "0 denied"** reads the progress read's denied list; HiFi's "0/5 cards" semantics is not published.
