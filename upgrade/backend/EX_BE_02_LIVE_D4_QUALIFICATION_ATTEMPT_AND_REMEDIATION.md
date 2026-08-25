# EX-BE-02-LIVE — D4 qualification attempt and compatibility remediation

Date: 2026-08-25  
Owner: Bobby  
Scope: Paper read-only projection qualification only  
Status: `D4_LIVE_ATTEMPT_FAIL_CLOSED / PORTAL_COMPATIBILITY_REMEDIATED / SIGNED_REPUBLISH_REQUIRED / D2_DARK_RESTORED`

## 1. Outcome

D3 remains accepted as
`D3_TRANSPORT_ACCEPTED / BUSINESS_SOURCE_DARK / D2_RUNTIME_RESTORED`.
The first D4 live qualification window reached the dedicated mandatory-auth
Paper facade through Source Proxy, created exactly one non-queryable
`BUILDING` projection epoch on the encrypted D4 PostgreSQL volume and then
stopped fail-closed on two Portal-side compatibility defects.

No epoch became `ACTIVE`. Query, analytics, SSE, command and activation
authority stayed false. The accepted D2 dark runtime was restored after the
attempt, with its business-source request counter still zero. The D4 volume
and failed BUILDING evidence were retained for audit; they are not served to
Portal readers.

D4 is **not accepted yet**. The remediated Edge/Source Proxy artifacts must be
published as immutable signed images from protected `main`, followed by one
fresh owner window and one fresh BUILDING epoch qualification.

## 2. Boundaries held

- Trading System code, database, Redis, CLI, broker and command paths were not
  modified or accessed.
- Source scope remained the four exact GET resources: orders, fills,
  positions and events.
- The Source Proxy alone held the dedicated read identity; the Rust Edge did
  not receive or log it.
- No credential, certificate body, DSN, business row or opaque source cursor
  was printed or copied into the repository.
- Projection storage used the separately encrypted gp3-backed PostgreSQL
  volume. The accepted D2 volume was not reused for D4 data.
- The qualifier was finite, listener-free and unable to activate an epoch.

## 3. Admission and baseline evidence

Before traffic, these gates passed:

1. D3 predecessor and immutable signed D2 image identities.
2. Dedicated read-identity readiness, including missing/wrong/revoked denial.
3. Encrypted EBS/KMS attachment and dedicated mount evidence.
4. D4 Source Proxy exact-route/mTLS/HTTP2 readiness.
5. D4 owner-window, qualifier and Compose admission.
6. D2 baseline health: Edge, PostgreSQL and Source Proxy healthy; zero OOM,
   zero restart and zero business-source requests.

The D4 PostgreSQL bootstrap initially rejected the installed initialization
script because the host file was not executable by container gid 70. The
script was corrected to `root:70` mode `0550`, then the empty D4 database was
bootstrapped and all 17 migrations applied. The repository preflight now
enforces this ownership/mode boundary before a container can start.

## 4. Fail-closed findings

### Finding 1 — snapshot pagination exhausted Nginx burst

The source contract allows a bounded snapshot to span tens of sequential
pages. The proxy had a sustained limit of 120 requests/minute but a burst of
only four. The first qualification received an HTML `429` during the snapshot;
the Rust adapter rejected it as invalid JSON. No baseline or event checkpoint
was committed.

Remediation keeps the same sustained 120 requests/minute limit and allows one
finite qualifier to consume at most one minute of capacity up front with
`burst=120 nodelay`. Preflight pins this exact value and a negative fixture
proves that the old burst of four is rejected.

### Finding 2 — exact decimal scientific notation

The published facade schema correctly represents decimals as JSON strings. A
bounded fill page contained exact `realized_pnl` strings in scientific
notation. The generic Portal decimal parser accepted only plain notation, so
the adapter rejected the page without committing it.

Remediation adds a source-compatibility parser that accepts either exact plain
or exact scientific base-10 strings, normalizes them through `rust_decimal`
without floating-point conversion and keeps canonical Portal serialization as
a decimal string. `NaN`, `Infinity`, overflow, imprecision and whitespace
remain rejected. The compatibility parser is applied only at the D4 source
adapter boundary.

## 5. Verification

The remediated branch passed:

- `./scripts/execution-d4-qualification-preflight-test.sh`
- `./scripts/execution-d4-source-proxy-test.sh`
- `./scripts/execution-edge-test.sh`
  - Rust unit/integration tests, including exact scientific-decimal cases
  - rustfmt and strict Clippy
  - fresh PostgreSQL migration, replay, restart, gap and bounded-load gates
  - PostgreSQL dump/restore signature gate

The runtime was then rolled back to the accepted D2 dark profile. D2 Edge,
PostgreSQL and Source Proxy returned healthy, with zero OOM/restarts and zero
D2 business-source requests.

## 6. Exact close procedure

No new architecture phase is required. To close D4:

1. Merge this remediation through `dev` into protected `main`.
2. Publish and cosign the remediated Edge and Source Proxy images.
3. Pin their immutable digests in a fresh owner authorization window of at
   most two hours.
4. Create one fresh BUILDING epoch; do not resume the expired attempt lease.
5. Run the finite D4 qualifier and verify complete baseline, ordered event
   replay, restart/idempotency, source-loss/recovery and bounded latency.
6. Prove Query/analytics/SSE/commands/activation remain false, retain the
   BUILDING evidence, and restore D2 dark.

Only after those checks may the backend status become
`D4_PAPER_READ_ACCEPTED / BUILDING_ONLY / BUSINESS_READER_STILL_DARK`. Lane B
frontend activation remains a later, separately approved phase.
