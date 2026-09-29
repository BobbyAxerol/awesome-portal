# P23 W06 read SLO checkpoint — 2026-09-29

Status: **FAIL / diagnostic, not OL-12 or P23 qualification**. Scope is only the isolated `portal-research-p23-ol12` cell on loopback port 8096; no dev, main, shared preview or production mutation.

## What changed

- The P23 read sampler now authenticates all 20 distinct principals before starting the timed named-read burst. Previously each principal started its read immediately after its own `/api/auth/context`, so identity warm-up overlapped other readers' timed GETs. The route, admission budget and 500 ms warm SLO were not changed.
- Added a regression test proving 19 validated identities cannot start a named read until the twentieth is validated. `node --test scripts/research-p23/read-load.test.mjs`: 9/9 PASS.

## Actual cell evidence

- Before the barrier, an isolated 20-principal Library-only read had 20/20 HTTP 200, p95 612 ms. Direct 20-principal GET without identity preflight measured p95 359 ms, which was diagnostic only.
- With the barrier, Library-only warm repeats measured p95 535 ms (FAIL) and 387 ms (PASS). This variability is not an accepted W06 receipt.
- The official mixed workload admitted one real heavy Advanced WFO and four distinct queued intents. At sampling, the first job was RUNNING and four remained QUEUED; it later COMPLETED. Queue cleanup cancelled only the four owned queued intents. Twenty distinct authenticated readers returned 200 on all six named paths; no read created an implicit job.
- Mixed-load p95 in milliseconds: Library **896** (warm target 500, FAIL); Progress 297; Evidence 326; Search 305 (target 750); Report 320; Replay 317 (target 1000). Peak aggregate cgroup `memory.current` was 674643968 bytes, under 5,000,000,000. The complete workload verdict remains FAIL because of Library.
- Raw private receipts remain under `/home/bobby/.local/state/portal-research-p23/20260927/runtime/` with basename `library-barrier-20260929a-{workload,read,resource-series}.json` and SHA-256 respectively `43832124722ce4311284744d3eb0d79bd52c86f100de5bf9ed0dbff70e90196a`, `766f21337156e1a81f6ce4aba043546d0c0cc169d07334f5d932faf0a4462f18`, `de8eea0fb17f4e1cb3cda85830a08358c437f7184265703ce389785f3c23608c`. No cookie, token, row payload or environment secret is copied into Git.

## Diagnosis boundary and next action

- The cell has 53 Library rows before this WFO batch. A read-only EXPLAIN of the exact page SQL after the batch reported 23.848 ms planning and 17.108 ms execution on warm buffers (21 page rows, 1288 shared hits). This was a direct DB diagnostic without the runtime RLS role, controller/session path or WFO CPU contention; it does **not** prove the source of the 896 ms tail.
- The 4-active/16-queued Library admission and shared 10-connection pool remain unchanged. Do not raise active slots or relax p95 on this evidence. Next: instrument queue wait, scoped transaction stages and API serialization in the isolated cell, then retake the same W06 under one real heavy/four queued with a pinned committed sampler. If the source change is in the shared <=P21 Library owner path, coordinate before editing.
- Other P23 T02/T03/T05/T12/T14 and P24 gates remain OPEN. No release or product qualification follows from this checkpoint.
