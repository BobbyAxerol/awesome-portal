# F8 review digest — Codex contracts of 2026-10-21/22 (for Bobby)

Prepared 2026-10-22 05:25Z by a read-only Claude subagent, checked by Claude. Level: nothing delivered is CONNECTED; the highest is INSTALLED (image `a96c754d` serving, authority expired). Coverage: every 2026-10-22 Codex file and the main 10-21 returns were read in full; Edge/PM-authored files and ~70 older 10-21 returns (history) were read only by status line.

## Recommendation per file

| # | File (ELP2-10) | Rec | Note |
|---|---|---|---|
| 1 | CORE009_CURRENT_08_BINDING_RETURN | ACCEPT_WITH_NOTES | transfer "not yet" (:96) superseded by row 2; window 10:15–10:45 expired |
| 2 | CORE009_CURRENT_08_TRUST_DELIVERY_AND_BOUNDS | ACCEPT_WITH_NOTES | "unresolved8" wording (see below) |
| 3 | CORE009_P22_FACTORY_G2_INTEGRATION | ACCEPT | SOURCE_ONLY, first-run failures disclosed |
| 4 | CORE009_08_FULL_SUITE_DISPOSITION | ACCEPT | PARTIAL_READY / FULL08_NOT_MET, honest |
| 5 | CORE009_MAINLINE_COMMISSIONING | ACCEPT_WITH_NOTES | reverses the earlier "Claude owns observer"; consistent because Bobby reassigned it |
| 6 | CORE009_CLAUDE_SUPPORT_FOLLOWTHROUGH | ACCEPT | |
| 7 | CORE009_MANAGER_FINANCIAL_BUDGET_ACTIONS | ACCEPT | header time runs ahead of file mtime (cosmetic) |
| 8 | CORE_TO_EDGE_08_ACTION_HANDOFF | ACCEPT | |
| 9 | CORE_TO_EDGE_08_HASH_CONFIG_ACK | ACCEPT_WITH_NOTES | slot 13:00–13:30 VN runs under cap 32 → partial READ, not full08 |
| 10 | EDGE_TO_CORE_08_BINDING_REPLY | ACCEPT | |
| 11 | EDGE_TO_CORE_08_ACCEPTANCE_HANDOFF | ACCEPT_WITH_NOTES | §11.1 pins stale; only §11.2 order current |
| 12 | PROMPT_FOR_EDGE_08_CORE009_REPLY | ACCEPT | |
| 13 | C5_FINANCIAL_PRODUCER_REVIEW | ACCEPT_WITH_NOTES | financial source stays MISSING; reducer dark |
| 14 | CODEX_BE_P21_P22_REVIEW | CLOSED on our side | P21-1/2 fixed in `0201df80`; P22-1/2 in `bb541418` (Claude lane) and Codex `122fc5f1` |
| 15 | CODEX_PRE_WINDOW_MEASUREMENT_AND_FLEET_REVIEW | ACCEPT | FLEET-1 still needs a product-bundle browser proof |
| 16 | CORE009_COUNTED_WINDOW_AND_CAPACITY_RETURN | ACCEPT_WITH_NOTES | asks Claude to ACK/clean idle Vite processes |
| 17 | CORE009_FINITE_08_BOUNDS_PROPOSAL | ACCEPT | Bobby approved only C288 for Research |
| 18 | SUCCESSOR_INSTALLED_OWNER_RETURN / NORMAL_IMAGE_RETURN / CURRENT_READINESS | ACCEPT_WITH_NOTES | normal gate was exit 1; green rests on 62/62 retake + 91 focused (file says so) |
| 19 | CORE009_SUCCESSOR_AUTHORITY_REQUEST | historical | superseded: successor writer is Codex's |
| 20 | CORE_PARALLEL_OWNER_INPUT_REQUEST | ACCEPT | Claude items done |

## Decisions only Bobby can make (default if silent)

1. Authorize a second native domain (e.g. Sandbox, READ-only) as the "unaffected native control". Default: no; that case stays NOT_RUN, full08 cannot reach PASS.
2. When to apply C288 (approved, not applied; cap stays 32). Default: not applied; the 13:00 VN slot is a partial READ (≤3 new admissions).
3. Numeric budget/calibration (14-group budget, M5/M7 windows, independent population). Default: unapproved; M5/M7 stay NOT_RUN.
4. Manager PKI: name the real issuer/forwarding owner or approve the smallest Research-only issuer/listener package. Default: stays blocked.
5. Relay to PM/TS for the C5 mapping or a typed NOT_PUBLISHED. Default: reducer stays dark; no financial mount.
6. Missed/expired slot 13:00–13:30 VN needs a new explicit owner return. Default: no auto re-date; trust `12504f44` dies 23 Oct 10:00:58 VN.
7. Confirm Codex takes P22/G2 source (MAINLINE item 2 says Bobby assigned it). Default: accept as written.

## Contradictions / stale facts to fix by Codex

- "unresolved 8 / reserve 20" (TRUST_DELIVERY:13, FULL_SUITE:10) vs "9 retained, unresolved 0" (HASH_ACK:76, COUNTED_WINDOW:19). The "8" looks like native retained; C288 math unaffected.
- Capacity formula: FINITE_08_BOUNDS:67 (H≤16) vs FULL_SUITE:15 (H+273, H≤15). The later wins; the earlier is not marked superseded.
- Pins drift: Claude head cited as `bcdbd44e` / `2465c350`; the lane is now `99ff5990`. G2 test "bridged" (P22_G2:84-95) vs "unbridged" (MANAGER_FINANCIAL:84).
- Header timestamps ahead of file clocks in HASH_ACK and MANAGER_FINANCIAL (cosmetic; do not use for ordering).

## Claude actions that follow from this digest

- Row 16: acknowledge/clean Claude's own idle Vite processes (own resources only).
- Row 15: product-bundle browser proof for FLEET-1 stays with the preview/fleet-stream lane.
- Row 3: Codex asks for the exact quietGate helper from `90f2a2c1` on a common base; it is already in the lane.

No claim in these files is CONNECTED_READ or full08 PASS, and none claims it wrongly.

## Current dispositions, 2026-10-23 (appended; the history above is unchanged)

Source: [CODEX_TO_CLAUDE_APPROVED_CLOSEOUT_2026-10-23.md](CODEX_TO_CLAUDE_APPROVED_CLOSEOUT_2026-10-23.md) §4 (Bobby's current instruction as recorded by Codex). The seven "decisions only Bobby can make" above are no longer a reading task for Bobby; each has a disposition and the remaining input is named. None of this is CONNECTED_READ, a calibrated policy, or a full-suite PASS.

| # | Earlier question | Disposition 2026-10-23 | What remains (exact owner and input) |
|---|---|---|---|
| 1 | Second native domain as unaffected control | The missing-only native STREAM specimen and Core settlement completed (READ200, STREAM-only REVOKED before expiry, retry403, separate READ still 200; actual return `CORE_TO_EDGE_08_CORE_FIRST_ACTUAL_RETURN_2026-10-23.md`, mirrored on HK 01:45:13 VN). This does not qualify Manager financial datasets or the UI. | A truly independent economic control domain is a separate scoped authority input (Edge coordinates the owning source response). Claude prepares the target, numeric proposal, workload, stop limits, validation and rollback. |
| 2 | When to apply C288 | C288 and Codex's P22/G2 ownership were already approved. For this missing-only specimen the preparation starts H16 and requires `H + 244 + 2 + 20 = 282 <= 288`. The different full-suite formula (`H + 273`, H<=15) does not apply, and the unresolved upper bound is not today's measured count. | None for this specimen. |
| 3 | Numeric budget / calibration | Formula and contract are accepted; that is not calibrated production policy. Load/calibration numeric artifacts are a separate scoped authority input. | Claude: numeric proposal packet (target, workload, stop limits, validation, rollback) with a recommendation. Edge: the owning source response. No fixture constant is used as approved configuration. |
| 4 | Manager PKI | The Manager Research leaf was already issued using the existing CSR/key: public leaf `33015a80`, chain `665a11f7`, inactive config `153a8f0e`; the existing Paper TLS probe passed. No new issuer, keypair or blanket PKI permission is requested. | Edge: exact profile, audience/kid/overlap reconciliation, overlay installation, business read. Core mapper `3cb7f24a` is installed (source `3265ce18`, schema 149); the old `a96` serving/not-installed statements are historical; inactive config was `a814...`; a finite source-bound overlay must be identified separately. |
| 5 | C5 mapping relay | Source requests go through Edge only. The financial source stays MISSING; the reducer stays dark; no financial mount. | Edge: the C5 mapping or a typed NOT_PUBLISHED. |
| 6 | Missed 13:00-13:30 VN slot | Superseded by the actual native specimen above (a new explicit owner return exists). Trust `12504f44` expiry (23 Oct 10:00:58 VN) is historical for this round. | None for this specimen. |
| 7 | Who takes P22/G2 source | Confirmed approved: Codex. | None. |

Stale facts the closeout settles: the capacity formulas are two different cases (specimen vs full suite), not a contradiction to be resolved by Bobby; `a96` serving assertions are historical because `3cb7f24a` is installed.
