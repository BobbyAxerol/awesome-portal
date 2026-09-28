# P23-T08/W06 — Library concurrency gradient during a real WFO

2026-09-28 · Codex · `docs/research-loop-plan` · **diagnostic, not an SLO acceptance receipt**.

The unchanged, clean, seven-service owned P23 cell on loopback `:8096` ran one
real public-admitted Advanced WFO from the pinned `19a8e813` Control API image.
The run `rrun_df4ef888b5a89f367c88f6c69caefcfd` reached `RUNNING` with
source sequence >0 and later `COMPLETED/READY`. Twenty distinct authenticated
reader identities each made one bounded, complete-body GET of the same named
Run Library path in four successive cohorts. Every cohort began and ended
while the source run was still `RUNNING`; no synthetic DB rows, direct engine
calls or request shortcuts were used.

| Simultaneous readers | HTTP 200 | p50 | p95 | Source sequence before→after |
|---:|---:|---:|---:|---:|
| 1 | 20/20 | 67 ms | 94 ms | 2→10 |
| 4 | 20/20 | 87 ms | 142 ms | 10→10 |
| 8 | 20/20 | 99 ms | 177 ms | 10→10 |
| 20 | 20/20 | 373 ms | **547 ms** | 10→10 |

Private aggregate-only receipt, mode `0600`:
`/home/bobby/.local/state/portal-research-p23/20260927/runtime/library-gradient-20260928c.json`;
SHA-256 `774ea2f3cbbbcee9896cd075e6b9dcd2e290c96fa15040029e6abd656fada901`.
The separate private run receipt retains the actual producer/progress path.
All seven cell services were healthy afterwards. No shared preview, dev,
Execution or Production service was changed; no session or business body is
stored in Git.

This shows the 500-ms **warm** Library target is crossed even with only one
running WFO when 20 readers arrive together. The earlier five-intent W06
natural-expiry retake was worse (773-ms p95; 120/120 GET 200), while its first
attempt also had three Library 503s. The sequential gradient is not W06:
cohorts did not include four queued intents or simultaneous six-route reads,
and this run did not measure cgroup time series. It therefore does not close
T01/T08/W06 or locate the bottleneck by itself.

Source-boundary review: Library calls workspace authorization, the throttled
`reconcileBestEffort`, then `ResearchRunLibraryRepository.list` under a
finite four-active/sixteen-queued admission lane and the shared ten-client
pool. The observed gradient is consistent with contention among these stages
but proves none is dominant. The source owner must measure admission wait,
pool acquisition, scoped SQL, reconciliation and mapping separately on the
same 20-reader + one-active/four-queued W06 input before changing a limit or
SLO. Codex then retakes the exact candidate with complete-body warm/cold SLO,
five-intent queue and overlapping cgroup samples. Do not bypass membership,
snapshot consistency or the reserve left for Execution/identity reads.
