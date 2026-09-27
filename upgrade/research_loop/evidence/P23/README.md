# P23 backend qualification packet

**Current owned runtime checkpoint, 2026-09-27:** cell 8096 is built/running,
22 distinct test principals authenticated without auto-login, F4/E10 real
stranded-terminal/retry-expiry/live-lease preservation and OL-02 real observer
MATCH/MISMATCH on a test copy PASS. [Exact proof and safety limits](./RECOVERY_INTEGRITY_RUNTIME_CHECKPOINT_2026-09-27.md).
Full OL-12/P23 remains **NOT_QUALIFIED**: this is not 20-viewer mixed-load,
restore/cold/upgrade/browser or P24 acceptance. Historical paragraphs below
are preserved, not current absence of a cell or P22 backend.

Status: **BACKEND_RESOURCE_HARNESS_READY · NOT_QUALIFIED**. This is P23 (the
request's heading), not another P22 publication implementation. P22's real
Delta→R1 and S11 browser receipts remain prerequisites; see the P22 packet.

Current-status correction, 2026-09-27: P22's **backend real-preview** prerequisite
is satisfied by its immutable real-preview receipt. The S01/S02/S10/S11 final
candidate browser lane remains separate. Preserve the paragraph above as the
historical checkpoint, not a claim that the P22 backend must be implemented again.
Full OL-12 remains NOT_QUALIFIED. The T-id mapping/byte-hash/runtime requirements
of `qualify.mjs` are corrected and tested in the [current checkpoint](./F6_MIGRATION_VERIFIER_CHECKPOINT_2026-09-27.md).

## Delivered without changing a runtime

- `compose.research-p23-5gb.yaml` is an *opt-in, isolated-cell-only* profile.
  Its eight long-running cgroup caps total **4,600,000,000 decimal bytes**;
  the sequential migration/bootstrap cap is 350,000,000 bytes, keeping the
  maximum planned overlap below 5,000,000,000 bytes. `memswap_limit` equals
  `mem_limit`, and process counts are bounded. This does not assert a live
  workload fits; an OOM under the cap is a qualification failure, not success.
- `resource-snapshot.mjs` reads every container's `memory.current` (page cache
  included), configured memory/swap/PID limit and rejects an unexpected service,
  duplicate service, absent cap in strict mode or aggregate over 5 GB. Unlike
  `docker stats`, it does not subtract cache. It prints no env/secret.
- `read-load.mjs` issues GET-only same-origin Research reads through 20 distinct
  authenticated sessions. It verifies each session via `/api/auth/context`
  against a distinct `principalId`, so preview auto-login Bobby cannot be
  counted as 20 users. It writes only status and latency, never rows/cookies.
  A private manifest supplied at run time has `base_url`, exactly 20
  `{id,cookie}` entries, and 1–12 allowlisted `/api/v1/research/...` GET paths.

The profile is not in `preview.sh` or any production deployment. To qualify,
provision an isolated `portal-research-p23-*` Compose project with separate
volumes, loopback port `127.0.0.1:8096`, scoped credentials and the profile as the last Compose
file; run `docker compose config -q` first. Do not reuse the shared preview
database, auto-login identities or production/stable data. Capture cgroup
samples *during* real W01/W02/W06/W07/W08, not merely before/after them.
Take cold/warm measurements without host `drop_caches`; run faults only in the
isolated project. Keep 20-session manifest private (0600) and revoke all
temporary sessions after the receipt. `--require-limits` must pass on each
active runtime service; a missing cap is a refusal, even at low idle RSS.

## Acceptance boundary

This packet gives the exact backend test matrix in [phase report](./phase-report.md).
It is **not** a substitute for W01/W02 real Delta, W05 storage scale, W06 20
users plus heavy/queued work, W08 repeated jobs, W09 fault/restore, W10
upgrade, or Claude's `V11-P23-BR`. No fixture or idle baseline is called a
5 GB acceptance receipt. Full P23 remains open until all P23-T01…T15 and
V11-P23-DR/BR/GX have actual qualified evidence.

Rollback: the profile is opt-in. Stop only the isolated P23 project; retain
its evidence and any immutable source refs. No Research/Execution production
flag, approval, volume, user or release was touched in this slice.

## Qualification-tool correction — 2026-09-25

The strict cgroup receipt now rejects a missing mandatory Research service,
counts a running 350 MB migrate/bootstrap one-shot (and rejects both running
together), and can sample a bounded time series with a peak rather than
presenting one idle instant as workload evidence. Example:
`node scripts/research-p23/resource-snapshot.mjs portal-research-p23-qual --require-limits --samples=60 --interval-ms=5000`.
The 20-principal read sampler measures **complete** JSON responses up to
2 MiB, not time-to-headers followed by cancel; it refuses path-normalization
escape, non-JSON and oversized responses without printing rows or cookies.
Focused tests cover each refusal. The existing shared preview is deliberately
rejected by the strict gate (`UNBOUNDED_CGROUP:quant-worker-py`), not accepted
as a 5 GB result. No isolated load, restore or upgrade PASS is claimed.
