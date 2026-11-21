# E17 — Imported/DRAFT real backend acceptance (2026-09-27)

Verdict: **REAL_BACKEND_ACCEPTED · FRONTEND_PENDING**, not Production activation.
Machine receipt: [e17-backend-acceptance.v1.json](./e17-backend-acceptance.v1.json).

> **Later approved consumer integration:** imported identity labels, source-code
> versus protected adapter hash authority and exact engine pin are now bound;
> real imported Evidence/Freeze browsers pass at 1280/660. The original machine
> receipt stays unchanged. Separate E13 later proves reproduction; this packet's
> three-run claim still only proves clone. See [E11–E17 final receipt](../P17/E11_E17_INTEGRATION_ACCEPTANCE_2026-09-27.md).

## Implementation and authority

- Exact P07 source custody creates an immutable imported adapter binding at DRAFT.
- P08/P10 admit only the installed `p17.imported-signal-notional.v1` digest,
  one fixed `signal_notional` trial, declared pins and a fresh actor-scoped preflight.
- Worker obtains source bytes through its HMAC/current-lease internal port.
  No browser source path, raw bytes or credentials are published.
- The already loaded host AppArmor profile `portal-research-child (enforce)`
  is used by the disposable worker. Host profile absence still prevents startup.
- Restricted AST, closed-bar context, finite bounded signals, memory/CPU/wall/
  scratch caps, SHA verification and fenced retention remain enforced.
- Search/Freeze/Replay consume the immutable bound version, not the current ACTIVE
  version or the P04 parameter map. Fixed/categorical values are preserved.
- Imported execution never issues an ACTIVE/publication/release claim. WFO-only
  current-source readers return typed NOT_APPLICABLE on this fixed profile.
- Explicit public clone intent and parent are persisted; the private worker still
  receives the established NEW compute envelope, not an invented operation.

## Real receipt, not a direct-engine test

Cell: `portal-research-e17`, loopback `:8098`, separate PostgreSQL/NATS/artifacts.
Pinned QuantBT 1.1.1 reads real read-only HMD: BTCUSDT, crypto-binance-1m, 1h,
IS June 1–8, OOS June 8–15, holdout June 15–17 2026 (UTC, half-open).

Three runs in the machine receipt went through public registration/preflight/create,
confined child, durable progress and retention to **COMPLETED / READY, sequence 33**.
Evidence, Split, Search, Freeze, Replay and Report all returned HTTP 200.
The root and two CLONE_OF children were also read via the persisted lineage graph;
changing seed 7 to 8 produced server-owned semantic diffs on both seed fields.
This is not a fabricated retry/what-if cell and does not prove reproduction yet.
The final Control API image reread the existing root successfully; no engine rerun.
Private JSON hashes are retained in the machine receipt; no token/DSN/source path.

## Bugs found and corrected by the real product path

1. Progress snapshot selection omitted IMPORTED_FIXED_PROFILE, rejecting real child
   callback sequence 12. Wire and Zod now agree; optimizer objective must be null.
2. Search required a numeric range even for an actual fixed-only declaration,
   preventing Report materialization and leaving FINISHING. Fixed-only pins are
   retained without inventing a numeric search space.
3. Finite scientific-notation values became false absence. Exact decimal expansion
   now preserves the shortest binary64 text without rounding through toFixed.
4. Public clone intent hit the legacy private engine port as an unsupported kind.
   Only the compute envelope maps to NEW; public intent/digest/parent stay exact.
5. Imported sidecars could be labelled with P04 absence or hash authority. They now
   use the imported source identity; Freeze refuses a mismatched P04 sidecar.

Earlier failed runs/attempts remain failed in the disposable DB; no success states
were forced, no receipt was replaced and no terminal history was deleted.
A best-effort NATS terminal notification warning occurred on the isolated cell;
durable journal and the acknowledged callback are the proved progress authority.

## Gates

- Control API targeted suites: 100/100; later clone/wire delta: 19/19.
- Disposable PostgreSQL migration and custody tests were included, not skipped.
- Python imported/producer/supervisor/progress suites: 48 pass.
- Changed shared contracts: 23 pass; Control API build: pass.
- Real API receipt: three completed runs; final-image root reread: pass.
- Frontend typecheck: **two new missing enum-label entries**, no UI edits made.
- Mandatory commit hook is a separate gate, not inferred from focused tests.

### Full-gate regression correction

The first mandatory Control API run had 1,287 passes and five failures in
four files. E17's widened SQL CHECK allowed a NULL non-P04 profile digest
because PostgreSQL accepts UNKNOWN; the migration now requires IS NOT NULL
for WFO, what-if and imported profiles, with explicit NULL-negative tests.
The E16 overview extension is additive/optional in Zod and OpenAPI, preserving
old canonical Replay fixtures byte-for-byte. Imported preflight refusal paths
now cover literal and parameter-scoped reasons. The five affected suites,
including real disposable PostgreSQL, then passed **22/22**. No assertion was
weakened, fixture rewritten, frontend edited or hook bypassed.

## Claude handoff — exact frontend work

1. `DigestChain.tsx` and `Stage4Binding.tsx`: map generated identity rule
   `IMPORTED_SOURCE_AND_ADAPTER_SHA256_V1` to a truthful source+adapter label.
   Do not cast it to P04_ADAPTER_CONTRACT_DIGEST_V1.
2. S03 fixed selection must accept IMPORTED_FIXED_PROFILE without implying trials.
3. S06 displays `imported_alpha.parameters` for fixed/categorical pins even when
   `fixed_profile.parameters` has no numeric ranges; no empty-tab substitution.
4. S07 source-code authority is SOURCE_CODE_SHA256, not the shared adapter digest.
5. Take browser/dev receipts after consuming the generated contract. This packet
   does not certify visuals or modify `apps/portal/frontend/**`.

## Boundaries and next action

No dev/main/stable/AWS/Trading System rollout, profile reload, publication or push.
Keep the full E11–E17 goal active: E11 rich analytics, E13 reproduction, E14 net OOS
and the owner-amended E16 candle-overview consumer still require their own evidence.
Scoped test cleanup must follow C4.2; retain private receipts independently of Docker.
