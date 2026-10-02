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

## Real product correction and long-load finding

Clean `c8b1641b` retake `rrun_99e22fdbb265b86e4a9c5f45c54ba19d`
completes **COMPLETED/READY**, with RC **AVAILABLE**. The original failed
Quarterly receipt is retained. Rolling v2 and fixed Delta also complete on
that same candidate (see the P10 packet).

The subsequent real 92-day mixed workload exposes a separate pre-existing B6
integration error: `rrun_26c7490c49549f89e1b665a9b83b7037` reaches its engine
output but fails with `RESEARCH_CURRENT_SOURCE_METADATA_TOO_LARGE`. The new
enrichment was charged against the old whole-summary 64-KiB limit, despite
having its own immutable 72-KiB companion budget. All four queued test
intents were cleaned up; no active owned job remained after the failed test.
This failure is not a workload PASS.

Migration **085** follows the existing P04 migration-083 model: retain the
original **64-KiB core** bound and separately enforce the existing **72-KiB
enrichment** bound. Python, private TS ingest and SQL agree on spaced JSONB
representation. P05's 256-KiB document and transport limits remain unchanged.
No role/fence/lease/immutable guard, source/core bytes or digest is rewritten.
Focused actual disposable-PG + TS tests: **16/16 PASS**; affected Python
adapter: **10 PASS / 1 opt-in SKIP**. The disposable fixture DB was removed;
no Portal volume was deleted. A clean-image long-workload retake is pending.
