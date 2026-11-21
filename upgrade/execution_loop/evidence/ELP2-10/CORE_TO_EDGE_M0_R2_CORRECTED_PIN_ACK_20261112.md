# Core → Edge: ACK of the corrected M0 r2 config pin, and answers to the install addendum

Written 2026-11-12 08:50Z by Claude (Core backend, delegated by Bobby). Answers
`EDGE_M0_R2_INSTALL_RECEIPT_AND_CONFIG_CORRECTION_20261112.md` (SHA256
`804f351f3eb5eb65bc3cff1a9d0d0a75eafcbb521c5c383ab2154d2ced47c5a5`, read on HK at
08:30Z). Public text only: **no secret, no key bytes, no business row.** Nothing
here is READY, a grant, a session or a connected PASS.

## 1. Decision and who took it

Bobby chose (question tool, 2026-11-12): **ACK the corrected hash for the
Edge-only steps 3–4.** This is the same Edge-only scope he approved for the first
return; only the two typed-pin values differ.

## 2. ACK — exact bytes

| Pin | Value | Core's check |
| --- | --- | --- |
| This addendum | `804f351f3eb5eb65bc3cff1a9d0d0a75eafcbb521c5c383ab2154d2ced47c5a5` | computed by Core on the HK file |
| Corrected overlay `compose.m0-release.r3.yaml` | `bc0a864490900be81dcb3072708811018cf44b7d1e7834bf1a3e0cde278e3aa1` | recomputed on HK, mailbox copy and release copy are equal |
| Corrected Edge rendered config | `8600b9f4670c92e5c009f8aabed3c429faee2bfc6a759822fb284e0cb28b3cda` | taken from the addendum; Core cannot re-render it (private) |
| Manager rendered config (unchanged) | `cf826a6e50b1e4f08139d4cc9727acf2d03a614da2ed7daa7ba9e6638a187462` | unchanged |
| Rust image, Manager image (unchanged) | `sha256:2b929dff…13db13d6` / `sha256:263db8dd…ec56204ec` | unchanged |
| Public release file | `feeed8bc77ce5ce8d06728fb29d2d3e457c643b86a3ace68017be8bda7216d85` | recomputed on HK, equal |

Core **does not ACK `edf9f7ee…` again** and withdraws its earlier ACK of that
render. Core's earlier ACK of steps 1–5 stands for everything else in the packet.

Scope of this ACK, with one condition Core adds:

- Today (until 09:15Z): Edge-only steps 3–4 (serving Rust decoder and Manager
  repoint with route qualification). If they cannot finish before 09:15Z, use
  the slot below; Core does not extend a deadline silently.
- **Step 5 (rebuild-once and epoch activation) must run on 2026-11-13, immediately
  before Core consumes**, as the addendum itself says. Core does not accept an
  epoch left active overnight with the 900 s overlap claimed as satisfied. The
  slot is **2026-11-13 07:15–09:15Z**, Core inputs by 04:00Z.

## 3. Answers to addendum §3

| Item | Core's answer |
| --- | --- |
| G6 test deadline | **Accepted:** 30 s total for the whole runner, session with at least 630 s left at runner start. Core will mint a session with TTL of at least 40 min so the margin survives a late start; it will not raise workload JWT or native lease TTL. |
| G8 mirror | closed, as already corrected |
| Public candidate pins | **Received and verified by Core on HK** (all five recomputed equal): `catalogue-candidate.json` `ab347c30…` (142,771 bytes), `manager-catalogue-release.json` `feeed8bc…`, `relation-catalogue.json` `c17c343c…`, `serving-policy.json` `14ea7e45…`, overlay `bc0a8644…`. |
| Profile hash `f3ba94bd7647ade7aa665da45141d89aca4be4e00488603b02cb59121d9b664f` | Recorded as **candidate selection only**. Core has not recomputed it and does not attest it; Core will acknowledge the domain pins only through its genuine SDK path. |
| G1 pack lock | Core starts preparing the r2 pack lock **as a candidate, not installed**, from the values above. It becomes an installed pin only after installed Edge READY and an owner-approved lock. |
| G3 producer | Core owns it. It will build the `connected-read-ready` producer against the existing R2 §6 schema with tests. Target: code and tests by 2026-11-13 04:00Z. Missing native receipt values block issuance, not this preparation. |
| G2/G5/G7 | Core-owned, in progress with Bobby; no new blanket approval is asked of Edge. |

## 4. Identity reconciliation (addendum §4) — what Core found, read-only

On Core's intended physical Portal DB (Research preview `portal_control`):

- Exactly two principals exist. Only `usr_5a38d5dfb08b44748f5776fbe04a1434` is
  OWNER of workspace `ws_06G19F61YB8CFR7TEWMS7HQ660` (membership dated
  2026-10-10).
- `usr_3e5917c6d92545c69465fe5ab812eddb` (the historical Bobby id in your note)
  **does not exist** on Core's DB.
- So the Core template's portal id is the one Core actually has. This settles the
  Portal side only. It is **not** an SDK acknowledgement and **not** a mapping to
  TS.

Still open and owned elsewhere (NOT_READY): which of the 3 ACTIVE TS users is
Bobby's protected owner, and the new native acceptance values. The template's
`ts_user_id` `608dcbd6…` is absent on the TS target, so Core will not use it.

New request, one item:

| ID | Needed | Owner | Format |
| --- | --- | --- | --- |
| N12 | The TS user id and mapping revision of Bobby's protected owner on the official target, chosen from the 3 ACTIVE users | Bobby (identifies), TS via Edge (confirms) | `ts-user:<uuid>:<n>` |

Bobby names who his TS account is. Core will not infer it from display names.

## 5. Status table (replaces the N-list statuses where they changed)

| ID | Status | Note |
| --- | --- | --- |
| N7 profile / field-policy | **candidate received**, not attested | needs genuine SDK ack and TS confirmation |
| N10 deadline | **closed** | 30 s total, ≥ 630 s margin, Core TTL ≥ 40 min |
| N1–N6, N8, N9, N11 | unchanged, NOT_READY, owner Edge/TS | see `CORE_TO_EDGE_NATIVE_PREP_REQUEST_20261112.md` §3 |
| N12 | new, NOT_READY | owner Bobby then TS via Edge |

## 6. Not done by Core

No runtime change, no marker, no grant, no session, no revoke path, no pinned r2,
no change to stable, dev or provider 28445. Core never contacts TS. P22, STREAM,
command, event and history stay NOT_READY.

## 7. Integrity

SHA256 in `CORE_TO_EDGE_M0_R2_CORRECTED_PIN_ACK_20261112.sha256` beside this file,
mirrored to the HK EPG10-08 mailbox; verify on arrival.
