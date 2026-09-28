# P23-T12 — finite preflight quota proof and exact remaining utility gaps

2026-09-28 · Codex · `docs/research-loop-plan` · owned loopback
`portal-research-p23-ol12:8096`. **T12 remains PARTIAL; P23/P24 remain OPEN.**
No shared preview, frontend, dev/stable, Production, Trading System, AWS-HK,
source artifact, account membership, or existing job was changed.

## Actual negative admission proof

Application candidate `19a8e81362e0e6aa3e09ad1a1c224db226c37455` was pinned
and clean. All seven owned containers were running with their hard cgroup
caps; active jobs and pending exports were zero. Only the existing P23 test
owner and one already-authorized P23 test reader were used. Sessions were
renewed through their existing passwords when needed; no reset or grant.

One actual P04 requested specification was sent to the named, same-origin
`POST /api/v1/research/preflights` operation, always with the exact owned
workspace. The cell's default per-actor active-manifest ceiling is **8**:

| Observation | Result |
|---|---|
| Owner requests 1–8 | Eight `201` responses and eight distinct private token hashes |
| Owner request 9 | `503 RESEARCH_PREFLIGHT_UNAVAILABLE`; owner active count stays 8 |
| Independent workspace member | `201`; own active count becomes 1, proving actor isolation |
| Durable jobs | 40 before → 40 after; active jobs 0 → 0 |
| Resources | 11 strict cgroup samples; peak **391532544 bytes**, all seven services bounded and total below 5,000,000,000 bytes |
| Wall time | 14,914 ms for the finite probe |

Nine ordinary preflight metadata/snapshot references were created; they are
subject to their normal TTL. No run or utility job was submitted, no table was
cleared and no broad cleanup was done. The private receipt is mode `0600`,
4,812 bytes, at
`/home/bobby/.local/state/portal-research-p23/20260927/runtime/t12-admission-19a8e813.json`;
SHA-256 `3fdeb191704fe6dff2c90d105373ba28d144032a34eefa79c3239aa36af52747`.
The harness records counts, status, latency, token **hashes**, cgroup samples
and candidate identity—not cookies, tokens, business rows or paths to source
data. Its stricter post-run assessor and focused tests pass **2/2**, and
`full_t12_passed:false` is intentional.

## What this does and does not prove

This proves a real **preflight metadata** admission limit and that a saturated
actor did not block another member. It does **not** prove utility-kind
quotas/backpressure or the mandatory audit lane in Guide P23-T12.
The earlier [utility receipt](./UTILITY_CHECKPOINT_2026-09-27.md) proved actual
primary + diagnostic, 81 sealed cells/63 evaluations, eight READY exports,
six MATCH verifies and capped resources. Neither receipt alone closes T12.

Source inspection gives two precise shared-≤P21 handoffs; Codex does not
silently modify that source while Claude owns it:

1. **`CG-P23-T12-01` — audit admission absent.**
   `run-create.contract.ts` admits NEW/CLONE/REPRODUCE/UPGRADE but no audit
   intent or `AUDIT_OF_SELECTION` lineage. The published controllers expose
   a child-audit **GET** of retained strategy records, not a POST that creates
   a final selection-audit child. `research.jobs` recognizes `AUDIT`, and
   Report/Lineage can read an existing audit child; that is not authority to
   create one. Add only an exact, authenticated, idempotent operation that
   pins the existing selected θ*, creates one durable
   `AUDIT_OF_SELECTION` child/job under shared resource admission, and never
   re-runs optimizer selection. If the installed QuantBT source cannot run
   that pinned evaluation, expose typed unavailability instead of a fake
   audit. Exit: generated contract, negative identity/replay/changed-target
   tests, one real child with source/lease/artifact facts and no duplicate
   parent/publication.
2. **`CG-P23-T12-02` — utility admission must be measured and bounded.**
   `whatif.service.ts` already allows one in-flight diagnostic per parent and
   the profile caps a grid at 81 evaluations. Export uses its own durable
   `run_report_export_jobs_v1` queue, a per-actor/run/revision/format dedupe
   index and a 512-KiB output cap, but `report.repository.ts::requestExport`
   has no shared pending-work quota across runs/actors. Freeze verify is an
   explicit CSRF-protected API call to the private byte observer, not a
   Research scheduler job; its response is bounded but no concurrent
   verify admission is visible at this boundary. Use the existing Research
   admission/resource model to cap aggregate and actor utility work, with
   typed saturation/timeout and fair retry; no new service or direct DB/CLI
   browser path. Exit: real negative quota and backpressure receipts beside
   one active primary, durable job/observer attribution, no API-process
   engine work, strict 5-GB/20-principal overlap and unchanged pins.

Do not infer that the observer hashes bytes inside Control API: the actual
private `ResearchArtifactVerifyClient` calls Portal API. The concern is
admission of concurrent explicit verification requests, not fabricated
in-process hashing. The source-owner return should be reviewed before a
clean-candidate retake. Historical PASS/FAIL receipts are retained.

Next independent Codex P23 work may proceed on T08/T09/T03/T07/T13; no new
phase is needed. At qualification end, revoke the exact 22 test identities
and stop only the owned project under cleanup C4. Do not prune broad images,
volumes or evidence while other gates use the cell.
