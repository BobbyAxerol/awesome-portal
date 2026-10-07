# P23 / P24 — what is still open, read from Codex's packets (Claude, frontend lead, 2026-10-07)

Read: `P23_QUALIFICATION_CLOSEOUT_2026-10-05.md`, `P24/V1_ACCEPTANCE.md` (15-ID denominator), `P24_REMAINING_SCENARIO_ACCEPTANCE_2026-10-04.md`, `FE_SCREEN_ACTION_MATRIX_2026-10-04.md`, board rows P23/P24 in Unified §13. Nothing here claims a release: Codex's own verdict is "not automatically GO".

## Who decides / who works

| Group | Item | State | Owner |
|---|---|---|---|
| **Bobby decides** | P24-T15 product review, visual review and signed release | OPEN_OWNER_PRODUCT_REVIEW; strict 83/86 stays (three-manifest exception accepted) | Bobby |
| **Claude (frontend), no one to wait for** | P24-T09 / T13 15-screen matrix | READY_FOR_BOBBY_REVIEW on the 2026-10-04 bundle (73 cells, 613 PASS / 0 FAIL / 69 NA, GET/navigation only). **Stale since**: S02 gained run types, served recipe labels, native recipes, native parameters step and the native result panel; S03–S11 gained the native panel. Re-run the matrix on a bundle built from the final candidate | Claude |
| | Write controls `NOT_RUN_WRITE` in the matrix | OPEN: only the P22 publish and the journey receipt cover them | Claude (needs an approved real-write lane) |
| | Visual baselines for the changed S02 screens | NOT recorded in this change (recorder rules 2026-10-03) | Claude |
| | `denied` / `stale` states | do not exist on the preview; stale seals exist on R-WFO-022/023 | Claude + Codex data |
| | Operations Dark, mobile print, real-device print | covered by the QA addendum only; real-device print is a review item | Claude / Bobby |
| **Codex (backend)** | P24-T07 restored-browser receipt and full byte integrity; strict 83/86 bytes not recovered | PARTIAL | Codex |
| | P24-T02 whole latest-candidate journey; P24-T14 whole-journey authority / protected-hash bundle | PARTIAL | Codex |
| | P24-T12 full §16.6 scenario matrix (SC-01…24): dispositions are scoped, not 24/24 real-engine runs | OPEN | Codex |
| | P24-T01 other-profile variants; T04 browser allocation→verification→publish branch; T06 independent decision variants | SCOPED_PASS / OPEN variants | Codex |
| | BR-S02-13…17 (§41): registry version summary now answered by `version-options`; Atlas native routes still "not admitted"; zone-less instants on native windows; S03 has no native fact; **Bracket zero-fill vs trade count 1** | OPEN | Codex |

## What this change moved

Preview rebuilt from `bf31b377`; the frontend now consumes `version-options` and `Profile.recipe` (BR-S02-06/09); three real native runs verified on S03–S11 (receipt: `../P10/FULL06_FE_6A_RECEIPT_2026-10-06.md`, last section). This does not close any P24 ID by itself.

## Next, in this order

1. Land the native Parameters-step fix; re-run the 73-cell matrix on a rebuilt bundle (affects T09/T13 validity).
2. Record only the changed S02 baselines through the Research recorder, review contact sheets, restore zero-diff files.
3. Ask Codex for BR-S02-17 and for the restored-browser receipt (T07) before anyone says "P24 done".
