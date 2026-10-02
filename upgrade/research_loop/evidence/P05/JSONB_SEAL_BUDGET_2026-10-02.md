# P05 — JSONB seal budget correction

Status: IMPLEMENTED; corrected clean-image real Quarterly retake pending.

The real Quarterly v2 run `rrun_73bb0981470c1468ad92dd6ed3ff08cd`
completed its engine/P05 artifact work but failed the atomic RS-02 seal.
The immutable artifact remains recorded; the failed run is not rewritten.

Measured privately on the owned P23 cell:

| Representation | Bytes |
| --- | ---: |
| Compact canonical summary | 61,943 |
| PostgreSQL `octet_length(summary::jsonb::text)` | 66,011 |
| Existing SQL limit | 65,536 |

The producer budget counted compact wire JSON while SQL counts JSONB text,
including spaces. The correction budgets the spaced representation before
P05 writes. Unicode escaping is conservative. Only already-declared OHLC
overview sampling may coarsen; retained bars, extrema, source authority,
analytics, selection, child audit and fold facts remain intact. Oversized
authority still fails closed. No migration, bound increase or reseal.

Focused regression tests: **2/2 PASS**. One reproduces compact-pass/storage-
fail and proves display sampling shrinks; the other proves non-display
authority is never discarded. Mandatory hook and clean product retake must
be attached before this becomes an execution qualification receipt.

Affected adapter suite: **9 PASS / 1 opt-in SKIP**, exit 0. The new budget
preserves the existing typed invalid-JSON error as well as the 64-KiB limit.

Frontend: no contract/layout change. Consume the published sampling caption
and coverage as before; do not claim one bucket equals one original bar.
