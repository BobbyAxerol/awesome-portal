# W4D — fewer words: S09 Report, S10 Lineage, S11 RC, S12 Atlas, S13 Compare, S14 copy, shared notice

Base bfbf5ca4. No commit. Words = `main.innerText` on the live preview data (1280 px); "visible" excludes `.sr-only` / `.rr-sr` data tables.

| page | before | after |
|---|---|---|
| S09 R-WFO-023 | 4783 (1330 visible) | 4379 (938 visible) |
| S09 R-P04-022 | 1122 | 740 |
| S09 failed R-P04-020 | 290 | 144 |
| S10 lineage (49 attempts) | 599 | 188 |
| S10 unknown alpha | 31 | 10 |
| S11 sealed / draft | 656 / 662 | 246 / 250 |
| S11 failed / 404 | 12 / 10 | 8 / 6 |
| S12 Atlas | 1024 | 352 |
| S13 attempts / markets | 526 / 93 | 389 / 65 |
| S13 pair / refused | 324 / 93 | 245 / 40 |
| S14 step 1 | 61 | 60 |

Shared: `ResearchNotice.tsx` (one sentence ≤ 6 words, code + request id + server sentence only in a focusable tooltip, one action). `ResearchPanel.StateNotice` and `RefusalNote` render it for states that came from a refusal (`diagnostics` key); a state a screen worded itself keeps its own reason. Lineage / Compare / RC `Notice`, RC write/read refusals use it directly. `Absence.tsx`, `humanise.ts`, `formatValue.ts` are created with W4A's signatures (`// W4A owns; identical contract`) behind `w4ShimW4D.ts`.
Shell: `markRunUnknown` / `useRunUnknown` in `researchRunCrumb.ts`; TopBar prints an unknown run as plain text. Marked by `RunNotFound` (S05-S08), the RC face and the S09 exit face.
Titles: `<Screen> · <Run label | alpha id>`, no product prefix. Spelling: Library, Journey, Evidence, Report, Lineage, Release, Atlas. "Screen NN" removed from all 16+ tooltips in these files.

NEEDS-SHARED: (1) S05-S08 404 still mounts its panels; `RunNotFound` hides their duplicate `denied` notice with a scoped `:has()` rule. SplitDetail/SearchDetail/FreezeDetail/ExecuteDetail should render only `RunNotFound` when `notFound`. (2) Test files of other groups edited for the shared notice: composition, evidenceFlow, freezeDetail, searchDetail, splitDetail (code chip -> `data-refusal-code` attribute / tooltip). (3) Not done: S12 Routes/Claims tabs copy (A10), S14 step 2-3 copy (needs a write path), tooltips of the TEXT_C shell items SH1-SH4 (W3/W4A).
Expected visual baseline changes: S09-S13 (all), 404 faces of S05-S08, S14 crumb.
