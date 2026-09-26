# P22 phase report — 2026-09-26

Owner: Codex backend. Branch: `codex/research-ol-p22-p24`. Scope: P22 backend,
generated contracts, isolated runtime evidence and documentation only; no
Research screen, Execution, Trading System, shared preview, dev or Production
change.

## Implementation

1. Canonical surface: private/no-store publication GET, CSRF-protected publish
   POST and named read by `alpha_version_id`. There is no browser-facing mirror
   route and no reconcile route.
2. Actor-bound publication intent is durable before unchanged R1 creation.
   Exact pack, final-audit run, alpha version, artifact, claim and evidence-set
   pins are checked before delivery is accepted.
3. Migrations 063 and 070–073 provide append-only publication, run-read-model
   bridge, promotion receipt and approval settlement authority. Runtime has no
   direct DML on immutable bridge/fact relations; it executes one validated
   security-definer function.
4. R1 transition reconciliation is versioned and idempotent. The immutable
   initial promotion receipt remains `PENDING`; `p22_approval_settlements_v1`
   records `PENDING@1` then `APPROVED@2`, and the composed read exposes the
   latest settlement. Only the approved settlement writes P19's fact.
5. Governance mirror mapping uses canonical decisions, conditions and
   timestamps. Unpublished assignee authority is a typed absence. RC
   supersession/currentness is derived server-side.

## Executed gates

| Gate | Result |
| --- | --- |
| Focused P22 bridge/final-audit/publication tests | PASS: 3 files, 20 tests |
| P22 disposable PostgreSQL migration/privilege gate | PASS |
| Governance R1 + RunSync regressions | PASS |
| Generated P21/P22 contracts and route inventory | PASS |
| Capability inventory `r2Ledger.test.ts` | PASS |
| Control API TypeScript build | PASS |
| Isolated historical-data WFO and P21 local seal | PASS: run `rrun_540c…a8d9`; RC `rc_06G…F7F7`; 8/2/2/0, sealable |
| Publication through unchanged R1 | PASS: one `DELIVERED`, one R1 `PENDING@1` |
| Independent owner Governance plan/apply | PASS: `APPROVED@2`, quorum 1/1, blockers 0 |
| Server reconciliation and P19 promotion pick | PASS: one `WRITTEN` fact, approval version 2 |
| Replay/idempotency cardinality | PASS: publication/bridge/receipt/fact each 1; settlements 2 authority versions; decisions 1 |
| Named alpha-version lookup | PASS: `AVAILABLE`, current RC and approval `APPROVED` |
| Negative accepted-path check | PASS: no `RUN_NOT_MIRRORED`; no `P22_GOVERNANCE_SOURCE_UNAVAILABLE` |
| Full Control API suite + PostgreSQL restore drill | PASS: 158 files, 1,218 tests; 1 intentionally skipped DR test |
| Full contract/generation suite | PASS: 16 files, 191 tests; generated clients and snapshots current |
| Repository verification | PASS: protected kernel, route inventory, offline security gates and tracking reconciliation |

The machine-readable, non-secret evidence is
[`real-preview-receipt.json`](./real-preview-receipt.json). Container image
IDs are retained there. OCI revision labels were absent and are recorded as
`NOT_PUBLISHED`, not reconstructed.

## Consumer handoff

Claude should regenerate/consume the generated declaration and keep the rich
S11 composition. S01/S02 use only the named alpha-version lookup; S10 reads the
source-backed promotion pick; S11 reads the canonical publication GET and sends
the explicit publish POST. `DELIVERED` is not `APPROVED`, and a typed denied or
unavailable R1 read must not collapse the rest of S11.

The backend real-preview gate is complete. Remaining P22 product work is the
browser/HiFi receipt owned by Claude. P23 resource/DR qualification, research-
dev activation and P24 are not claimed.

## Resource and cleanup decision

The phase-owned stack was torn down after evidence capture. Exact project `portal-research-p22-publication`, its three test volumes (`portal-artifacts`, `portal-nats-data`, `portal-postgres-data`), the two exact temporary directories, preview credentials and staged ignored HMD wheel were removed. They are disposable and not recoverable; the sanitized committed receipt is retained. No broad Docker prune, cache prune, business-data deletion or shared runtime restart occurred.
