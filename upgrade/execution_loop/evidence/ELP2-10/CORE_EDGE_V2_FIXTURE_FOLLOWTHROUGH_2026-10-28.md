# Core–Edge discovery V2 and fixture follow-through — 28 October 2026

Status: **SOURCE-ONLY / PARTIAL**. No source grant, runtime installation,
READ/STREAM acceptance, production calibration, G2 or ELP2-10/11 closure is
asserted. The Edge follow-through packet was read and its E1 correction is
accepted: the V1 Edge parser rejects unsafe JSON numbers before forwarding;
it does not round them or authorize them. Native PostgreSQL BIGINT can exceed
the V1 JavaScript-safe bound.

## E1 — coordinated opt-in wire

Core source commit `f6d16cc30` supports a separately selected `v2` private discovery wire, with
canonical positive decimal strings bounded by PostgreSQL signed BIGINT. The
default remains V1 and there is no automatic fallback. The manifest explicitly
pins the wire; the observation artifact has a V2 schema. No observation grants
authority. Core regression: **109/109**, including V1 boundary, all six V2
revision locations, invalid revisions, pinned mTLS, and V2 manifest/artifact.
After a parser-guard refinement, the affected V2/boundary subset was rerun:
**11/11**. This is a focused R1 commit; full integration hook/qualification
is still required for a final candidate. A whole-project Core typecheck was
started, but its final exit status was not retained; it is **inconclusive**
and must not be reported as passing.

Edge candidate `feat/research-discovery-lossless-v2@4cf434c45b4ea5b5d62045edcfa536298c5d1da6`
is isolated at `/home/bobby/.worktrees/edge-research-discovery-v2-20261028`
on HK. It keeps the native PM V1 exchange, validates exact scopes and native
signed-integer results, and publishes the six validated revisions as decimal
strings only on the V2 route. V1 bytes and safe-integer checks remain unchanged.
Focused gateway test in a disposable SGP source cell: **15 PASS, 1 SKIP**,
including V2 unmounted without scope and denial for the wrong workspace;
the skip still needs a genuine Core codec export. This is a local test-only
mTLS peer, not a connected source or qualification receipt. Building the cell
first exposed missing tracked contract/manifests; those failed setup attempts
were corrected and are not counted as passes.

Remaining: match actual source, trust, role and runtime pins; test the real
Core↔Edge wire with the genuine codec and actual bounded discovery; validate
membership independently before ROOT/CURRENT and READ/STREAM. The Edge
candidate is **not installed** and does not authorize those actions.

## E3 — financial carrier

Edge's selected history carrier is **historical as published**, not a current
financial snapshot or proof of ownership/census. Preserve exact nullable NAV,
currency, source/valuation times and original publication identity. Do not
infer net PnL, cashflow semantics, cost completeness, current ownership,
complete census or `PROVEN` from a selected history bundle. Existing local
financial/recovery tests are documented in the seven-package receipt; a real
carrier, same-snapshot access, APPLIED→ACK and source tie-out remain open.
Edge is the Core's integration contact for outstanding source facts.

## E5 — Canary and workloads

Core `3051ecf16` tested the actual workload convention: Canary is a stage
under the `live` profile and `ACTUAL` economic partition, not a made-up
`canary` environment. Workload compiler tests: **11/11**. This was no-I/O
preparation, not a production load measurement or approved budget. Qualified
target, numeric bounds, calibration, source, G2 and coexistence window remain
required before a real run.

## Fixture browser and integration

Fixture candidate `78b0a8477530c67de586679e449d0598d3b088b5`, based on Claude
`fc05a2478c9fdd4210ceaf48394dd9128a0f3604`, previously passed the focused
Research-stage/world tie tests **62/62**. Its isolated positive browser lane
built successfully: 121 tie checks matched, 2 were skipped; all screens
visited had zero measured horizontal overflow at 1280/660, zero bad API and
console counts. The Approval step was **NO_LINK_FOUND**, so the journey is not
an overall pass. The specific Research-stage page was not independently
asserted by this browser journey. Raw fixture-only result:
[JSON](RESEARCH_ALPHA_FIXTURE_JOURNEY_2026-10-28.json), SHA256
`b6f04e53b39e84e6e5d238ddeea8ffe565c172b79aa84e666aa1b49351695026`.

The fixture fix does not apply cleanly to Core mainline: the baseline file has
diverged materially and Claude's integration branch also has independent
commits. Do not replace the file or cherry-pick blindly. Claude should review
and integrate the candidate on her matching base, investigate the missing
Approval link, test the Research-stage route with/without workspace, and hand
off the actual integrated SHA; the integrator should then reconcile both trees.
Temporary dependency symlinks created for the browser build were removed.

## Still open, with ownership

- **Core + Edge:** install only an explicitly qualified V2 candidate after
  resolving real trust/source, and complete genuine READ/STREAM, revoke,
  restart and recovery. Historical source observations are not grants.
- **Edge/source owners + Core:** supply and qualify financial proof, economic
  ownership/census and metadata/health; tie out Accounts/Portfolio/Exposure.
- **Edge + Core:** qualify STATUS/recovery against the same original through
  the commissioned gateway; do not enable submit/Live.
- **Qualification owner:** approve target/bounds/calibration, then measure
  G2/coexistence; browser acceptance belongs to Claude on that same candidate.
- **ELP2-11:** migration/restore/rollback remains to be rehearsed against the
  final candidate and its required pins; no release is asserted here.
