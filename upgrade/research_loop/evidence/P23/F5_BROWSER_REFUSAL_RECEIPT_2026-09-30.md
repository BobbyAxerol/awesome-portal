# P23 F5 — real S02/S14 browser-refusal subset

2026-09-30 · Codex · `docs/research-loop-plan` · **8/8 PASS in scope; full F5/P23 OPEN**.

The isolated `portal-research-p23-ol12` cell at `http://127.0.0.1:8096` was
built from clean source `2bfeb53e3bb967df1bb71fe373119c72166e6a34` and
ran seven pinned, memory-bounded images. `scripts/research-p23/f5-browser-refusals.mjs`
used real login/session cookies, same-origin routes and Chromium at 1280 and
660 px. It did not stub an API response, read source data directly, change
the shared preview at `:8095`, or touch dev/Production.

Private mode-0600 receipt:
`/home/bobby/.local/state/portal-research-p23/20260927/runtime/f5-browser-refusals-2bfeb53e.json`
with SHA-256 `875701335135012b12ee8f74eb253b4736ac3e0e434cffd3195ecbd3eae13af4`.
The exact image IDs are retained in the adjacent private `identity.json`; its
`dirty` field is `false` and its source SHA equals the receipt. This file
records no credential, cookie, market row or server error prose.

| Screen / case | 1280 px | 660 px | Expected visible behavior |
| --- | --- | --- | --- |
| S14 invalid Alpha source | 400 `RESEARCH_ALPHA_IMPORT_INVALID` | same | Typed alert, no raw server message |
| S02 missing CSRF | 403 `RESEARCH_PREFLIGHT_INVALID` | same | Typed refusal copy, no raw server message |
| S14 expired Portal session | 401 `SESSION_REQUIRED` | same | `SESSION_EXPIRED` frame and preserved deep link |
| S02 expired Portal session | 401 `SESSION_REQUIRED` | same | `SESSION_EXPIRED` frame and preserved deep link |

Every one of eight browser cases passed. There were zero page errors,
off-origin requests and horizontal-overflow pixels. Workspace job count stayed
**194 → 194**; no implicit compute was created. The cell was stopped with
`cell.mjs down` **without `-v`** after the receipt, preserving its private
evidence and volumes; the shared preview remained running.

This closes only the real-browser rendering subset named above. The receipt
itself has `full_f5_passed:false` and `full_p23_passed:false`. Real typed 502,
identity revocation, the canonical 54/54 cross-stack browser lane and the
remaining P23/P24 matrix still need their own evidence. A simulated failure
or this four-case matrix must not be relabelled as those gates.
