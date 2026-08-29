# EX-BE-03 / N06 Real-source Qualification and Soak

Status: `PORTAL_QUALIFICATION_AUTHORITY_COMPLETE /
OWNER_PAPER_FAST_PROFILE_APPROVED / SOURCE_DARK /
N02_N03_OWNER_BYTES_PENDING / REAL_EVIDENCE_PENDING`

Date: 2026-08-26

## 1. Outcome

Portal now owns a strict Rust evidence authority and admission wrapper for N06.
It can prove that an exact accepted N02/N03 source implementation completed the
required BUILDING shadow, parity, fault, restore and rollback corpus under one
of two explicit observation profiles before an owner reviews it:

- `PAPER_FAST_ACCEPTANCE`: at least 1,800 seconds, samples no more than 30
  seconds apart;
- `EXTENDED_24H`: at least 86,400 seconds, samples no more than 300 seconds
  apart.

The fast profile does not remove any safety category. It shortens only elapsed
observation for Paper shadow promotion; the 24-hour profile remains extended
confidence evidence for stable/release or later risk-bearing promotion.

No accepted N02 or N03 owner pack exists in this workspace or the inspected
Trading System worktrees. Bobby approved the Paper-fast promotion path on
2026-08-26, so that owner decision must not be requested again. The absent
owner-published source bytes still prevent a real window; therefore no source
request, service start, network change, AWS operation, source credential,
ACTIVE epoch or registry-profile change was attempted.

## 2. Authority boundary

N06 qualifies evidence. It does not activate a reader.

```text
accepted N02 bytes + accepted N03 bytes
                |
                v
 finite owner-approved BUILDING window
                |
                v
 Rust shared consumer -> Portal projection
                |
                v
 sanitized N06 evidence -> Rust verifier -> owner review
                |
                v
 separate N07/N13 profile decision (never automatic)
```

The browser, SGP Portal and evidence files never receive a Trading System DB
credential, service token, certificate private key, account, order, fill,
position, strategy or instrument payload. Command, Sandbox, Canary and Live
authority remain separate.

## 3. Delivered components

### 3.1 Rust qualification authority

`source-qualification::real_source` defines:

- exact schema `execution.real-source-qualification.v1`;
- fixed `PAPER_BINANCE_USDM`, `paper/BINANCE/USDM` and
  `d4.paper-read.v2` identity;
- exact N02/N03 manifest, source/Edge/Proxy image and projection-schema digests;
- BUILDING-only epoch enforcement;
- baseline, delta and deterministic replay semantic parity;
- exact twelve-drill evidence set;
- p50/p95/p99 metrics per route class;
- integer-only CPU/RSS/queue/freshness/lag/PostgreSQL/IOPS/WAL/restore bounds;
- explicit profile identity carried into both the evidence and sanitized
  report;
- minimum 1,800-second/30-second-sample Paper-fast coverage or separate
  86,400-second/300-second-sample extended coverage;
- zero source mutation, hidden full-delta scan, post-lease SELECT, gap,
  divergence, dropped page, OOM, restart and source error;
- server-side request-rate and scanned/returned amplification checks;
- typed, single-representation read-only BUILDING authority and sanitized
  metadata evidence class;
- owner review after the completed window;
- canonical evidence digest and permanently false activation fields.

Synthetic evidence can pass only `template`; it cannot pass `candidate` or
`acceptance`. Real acceptance requires byte-identical N02/N03 manifest hashes.

### 3.2 Operational verifier

The compiled binary is:

```text
source-qualification / n06_verify
```

It rejects symlinks, empty/oversized files, unknown/duplicate arguments,
unknown JSON fields, missing prerequisite digests and malformed evidence. Its
output contains only a bounded sanitized report.

The wrapper
`scripts/execution-n06-qualification-verify.sh` first runs N03 acceptance,
which itself runs N02 acceptance, computes the exact manifest byte hashes and
then invokes the Rust authority. It opens no socket and changes no state.

### 3.3 Canonical template

`crates/source-qualification/fixtures/n06-real-source-qualification.template.json`
contains a full synthetic envelope for schema and UI integration. Its origin
is `SYNTHETIC_TEMPLATE`, owner acceptance is false and it cannot be used as
operational evidence for either profile.

## 4. Qualification stages and required evidence

| Stage | Evidence | Fail-closed result |
|---|---|---|
| admission | exact accepted N02/N03 manifests, immutable images, source commit, owner window | prerequisite mismatch |
| fresh shadow | new non-nil BUILDING epoch, one fixed Paper scope | non-BUILDING rejected |
| semantic parity | baseline expected=actual, delta expected=actual, replay=projection | parity mismatch |
| fault corpus | duplicate, tombstone, gap, expiry, restart, source/cross-cell loss | missing/failed drill |
| resource envelope | per-route percentiles, amplification, request rate, Rust and PG ceilings | bounds exceeded |
| recovery | new BUILDING resync, encrypted restore and dormant rollback | missing/failed drill |
| Paper-fast steady state | at least 30 minutes and complete sampling at ≤30 seconds | fast evidence incomplete |
| extended steady state | at least 24 hours and complete sampling at ≤300 seconds | extended evidence incomplete |
| owner review | review timestamp after soak, accepted evidence digest | owner review required |

An accepted N06 report still returns:

```json
{
  "activation_authorized": false,
  "registry_profile_changed": false
}
```

## 5. Modes

### Template — available now

Build the locked verifier and validate the schema without source access:

```bash
cd /home/bobby/portal-backend-plan/services/portal-execution-edge-rs
cargo build --locked --release -p source-qualification --bin n06_verify

cd /home/bobby/portal-backend-plan
./scripts/execution-n06-qualification-verify.sh \
  --mode template \
  --evidence "$PWD/services/portal-execution-edge-rs/crates/source-qualification/fixtures/n06-real-source-qualification.template.json" \
  --verifier-bin "$PWD/services/portal-execution-edge-rs/target/release/n06_verify"
```

### Candidate — blocked until source-owner delivery/window

```bash
./scripts/execution-n06-qualification-verify.sh \
  --mode candidate \
  --evidence /absolute/sanitized/n06-evidence.json \
  --verifier-bin /absolute/immutable/n06_verify \
  --n02-pack-dir /absolute/accepted/n02-owner-pack \
  --n03-pack-dir /absolute/accepted/n03-owner-pack \
  --owner-window-evidence /absolute/sanitized/n06-owner-window.json
```

### Acceptance — owner decision already granted for Paper-fast scope

Use the same command with `--mode acceptance` only after the source owner has
reviewed the complete profile-specific evidence and recorded a review timestamp
later than the window end. Bobby's Paper-fast promotion approval is already
recorded; do not pause to request it again. Acceptance does not edit registry or
profile flags.

## 6. Test evidence

Rust tests cover:

- deterministic template digest and bounded report;
- candidate/acceptance binding to exact N02/N03 bytes;
- synthetic and unreviewed acceptance rejection;
- Paper-fast and extended duration/sampling floors;
- baseline/delta/replay parity drift;
- missing, duplicate and failed drill evidence;
- source mutation, hidden full scan and resource overflow;
- request-rate and scan-amplification limits;
- typed authority/data-class rejection before qualification;
- owner review ordering and unknown JSON fields.

The workspace gate also builds and executes `n06_verify` against the canonical
template. The shell test proves that acceptance cannot run without both owner
packs. Full Rust, strict Clippy, PostgreSQL migration/restore, tracking and
Portal verification remain required before commit.

## 7. Real activation prerequisites

The real N06 window cannot start until all of the following exist:

1. exact four-file N02 owner pack passes `--mode acceptance`;
2. exact five-file N03 implementation pack passes `--mode acceptance`;
3. Portal imports those non-secret bytes in a dedicated contract-only commit;
4. the N04 thin wire adapter is implemented against those exact bytes;
5. Bobby names a finite N06 owner window and owners for source, rollback,
   backup and observability;
6. immutable source, Edge and Proxy images plus projection schema digest exist;
7. BUILDING epoch/storage capacity and abort thresholds are admitted;
8. closeout restores the accepted dormant state.

Until then, the safe state remains fixture delivery, Query/ingestion/SSE off
and no source profile promotion.

## 8. Claude handoff

Claude may consume only the canonical template and later sanitized accepted
reports. UI must show `TEMPLATE`, `CANDIDATE`, `OWNER REVIEW REQUIRED` and
`EVIDENCE ACCEPTED` distinctly. `EVIDENCE ACCEPTED` must never be rendered as
reader active. Raw hashes should stay in an evidence drawer/copy affordance,
not primary operator copy.

## 9. Next backend phase

N07 remains blocked from real-source promotion until N06 operational evidence
is accepted. While owner bytes/window are pending, N09 Portal-owned product
gaps and N10 source-dark analytics contracts can proceed independently.
