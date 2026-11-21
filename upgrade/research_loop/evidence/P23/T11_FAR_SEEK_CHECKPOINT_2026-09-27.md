# P23-T11 — real twenty-reader deep inspection and far-seek checkpoint

2026-09-27 · Codex · `docs/research-loop-plan` · owned loopback
`portal-research-p23-ol12:8096`. This is **P23-T11 backend/API PASS**, not
`P23`, `V11-P23-BR` or `P24` completion. No shared preview `:8095`, Production,
AWS-HK/Trading System, frontend, research business data or image was changed.

## Actual request/authority path

The helper walks the **real** Library and WFO replay keysets, never creates a
cursor. Library page 13 uses a signed cursor returned by page 12; the sealed
WFO replay page 17 uses the cursor returned by page 16. The replay has 2,208
source observations; an actual row minted the `at` playhead at ordinal **1,650**.
An independent `at` GET returned `state_at_cursor.source_ordinal=1650`, and a
`before` GET returned a preceding page. These are the named API operations
the S08 slider uses, not raw DB/file access or a fixture.

Twenty distinct owned reader identities, each verified through
`/api/auth/context`, simultaneously issued seven named same-origin reads:
deep Library, P04 sparkline, WFO Report/Search, replay deep page, previous
page and far playhead. **140/140 GETs returned 200**; full bounded JSON bodies
were consumed, with no response over 2 MiB. Source service image IDs matched
the immutable owned candidate before and after. Zero active compute and job
count **37 → 37** prove these reads did not create implicit jobs.

| Read | Warm p95 | Guide target | Result |
|---|---:|---:|---|
| Library deep cursor | 328 ms | 500 ms | PASS |
| P04 sparkline | 226 ms | 500 ms | PASS |
| WFO report | 234 ms | 500 ms | PASS |
| WFO search | 750 ms | 750 ms | PASS, exactly at bound |
| Replay deep page | 636 ms | 1,000 ms | PASS |
| Replay previous page | 616 ms | 1,000 ms | PASS |
| Replay far playhead | 727 ms | 1,000 ms | PASS |

Twenty-four time-series cgroup samples overlap the read window. Aggregate
`memory.current`, **including page cache**, peaked at **429,371,392 bytes**;
all seven active services retained their exact hard memory/swap/PID limits,
and the measured aggregate stayed under 5,000,000,000 bytes. This is a
read-only T11 sample; the separate T01 receipt, not this one, covers a heavy
run plus four queued intents.

## Preserved failed first attempt and correction

The first attempt stopped at authentication before any load: the private
`read-manifest.json` had old cookies while `sessions.json` had already been
renewed. Twenty checks reported `APP_LOGIN_REQUIRED`; no latency/cap PASS is
claimed from that attempt. Only namespaced P23 test sessions were checked or
renewed by normal password login, then the private manifest's cookies were
synced to those same twenty principal IDs. No password/token reset, DB expiry
edit, membership change or production account was used. The failed receipt
was not overwritten. Retake used a new label and passed.

`read-load.mjs` also now classifies the actual
`/current-source/replay` route under the Guide's **1,000 ms replay SLO**,
not the 500 ms summary SLO. Focused tests exercise both 1,000 PASS and
1,001 FAIL, actual-keyset traversal/cycle refusal, named GET-only paths,
resource overlap, job count and image-pin drift: **10/10 PASS**. This is a
measurement correction, not an increased runtime budget.

## Evidence, limits and next action

Private root: `/home/bobby/.local/state/portal-research-p23/20260927/runtime/`.
Both receipts are `0600` and retain only status/latency, token **hashes**,
resource samples and counts; no cookies, cursor values or business rows are
committed. The failed `t11-farseek-19a8e813-first.json` SHA-256 is
`46b240276581b1e845c7319635ecab0148d0d946205678398ebd42c72af0385f`;
the passing `t11-farseek-19a8e813-retake.json` SHA-256 is
`a12aa369f03c7fad5e064be882a5bab7cae0006fe2e32d7b9eaab1bffebd1d9c`.
The candidate source is `19a8e81362e0e6aa3e09ad1a1c224db226c37455`;
the seven-image pin hash is
`75b7d7430ef68950a75eb6d8e3a44958810bfdc5713ef94f7916feb4a3f9b9a8`.

The run created no containers, volumes, images or business writes. Keep the
owned P23 cell and test accounts only until the remaining qualification ends;
revoke those exact identities/sessions and perform the C4 bounded inventory
then. **T15 remains Claude's browser-real reveal/cursor/deep-link check** on
one pinned candidate. T02 scratch, T05 cache/ETag, T03 disk-full, T12
audit/quota, T14 exposure/audit-child, upgrade/rollback and the rest of
P23/P24 remain open. Do not present this T11 API proof as a browser receipt.
