# P23 / P24 — what is still open, read from Codex's packets (Claude, frontend lead, 2026-10-07)

Read: `P23_QUALIFICATION_CLOSEOUT_2026-10-05.md`, `P24/V1_ACCEPTANCE.md` (15-ID denominator), `P24_REMAINING_SCENARIO_ACCEPTANCE_2026-10-04.md`, `FE_SCREEN_ACTION_MATRIX_2026-10-04.md`, board rows P23/P24 in Unified §13. Nothing here claims a release: Codex's own verdict is "not automatically GO".

## Who decides / who works

| Group | Item | State | Owner |
|---|---|---|---|
| **Bobby decides** | P24-T15 product review, visual review and signed release | OPEN_OWNER_PRODUCT_REVIEW; strict 83/86 stays (three-manifest exception accepted) | Bobby |
| **Claude (frontend), no one to wait for** | P24-T09 / T13 15-screen matrix | **Re-run 2026-10-08 on the clean bundle built from `938fa74d`: 73 cells, 613 PASS / 0 FAIL / 69 NA** (GET/navigation only; one first-pass harness failure fixed and re-run, see [rerun note](./FE_SCREEN_ACTION_MATRIX_RERUN_2026-10-08.md)). READY_FOR_BOBBY_REVIEW | Claude |
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

## Codex implementation/acceptance clarification — 2026-10-07

This append-only note supersedes the stale asks above without deleting the
original frontend findings. Parameters fix `6b3f6a2d` is retained in the shared
branch and rebuilt on Research preview. **BR-S02-14…17 are implemented**:
current enabled Atlas recipes, native UTC normalization, optional source-bound
native facts on Progress, and Position regimes (engine) semantics on S04.
Three real native runs have matching Progress/Hub facts; the new S04 label is
verified at1280/660. No frontend source/layout/token/baseline was edited.

[Full repair receipt and remaining FE integration](../P10/S02_NATIVE_TRUTH_REPAIR_2026-10-07.md).

- **T07:** restored-browser evidence exists in `V1_ACCEPTANCE.md` and
  `../P23/WORKSPACE_AND_LINKED_AUDIT_CONSUMER_2026-10-04.md`. Bobby accepted the
  exact-three historical-test missing-manifest exception; strict83/86 remains.
  Do not wait for fabricated/recovered bytes or claim full-store86/86.
- **T12:** `P24_REMAINING_SCENARIO_ACCEPTANCE_2026-10-04.md` records all24
  dispositions. Reconcile expansion-affected profile/route dispositions; this
  is not an instruction for24 new engine runs or a Cartesian qualifier.
- **T02/T14:** whole final-candidate journey/authority bundle still needs its
  own final evidence. This twelve-view GET-only repair is not that whole gate.
- **Claude:** changed73-cell matrix, S02 recorder/baseline review and new
  optional Progress/Atlas field consumption remain the frontend lane. Backend
  repair is delivered, not delegated back to Claude. Bobby's product/release
  decision and no-publication boundary are unchanged.

## Update 2026-10-08 (real-run gates) — see [FE_REAL_RUN_GATES_AND_CAPACITY_2026-10-08.md](./FE_REAL_RUN_GATES_AND_CAPACITY_2026-10-08.md)

- **Pending-run Holdout:** PASSED on a real run (`RUN_NOT_COMPLETED_WINDOW_PROTECTED` while RUNNING/FINISHING, `AVAILABLE` on COMPLETED). Closed.
- **6,400-row ledger:** a real 16-fold × 400-trial run was admitted and executed, then FAILED at retention (`RESEARCH_CURRENT_SOURCE_METADATA_TOO_LARGE`, 64 KiB sealed summary). Not verifiable; new Codex request **BR-S02-22** (§48).
- **Limit / OCO:** Codex asked to propose the smallest recipe with a real Limit/OCO journal (**BR-S02-21**, §47).
- **Agent authentication (AI Native Loop):** Bobby deferred; keep the current permission model while the QuantBT loop is finished.
