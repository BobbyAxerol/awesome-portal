# Source seams and combined preview — 3 Nov 2026

Status: **IN PROGRESS / NOT CONNECTED / NOT RELEASE ACCEPTANCE**. Entry source
`docs/research-loop-plan@9ff2f08c8`; three untracked Edge mailbox files were
already present and remain untouched. Scope excludes dev/main/stable and
actual Execution command or Live activation.

## Sibling preparation

`sibling-source-seam.ts` is an **unmounted source seam**, not four completed
HTTP producers. It validates the existing four V1 shapes against their
canonical TEST_ONLY fixtures, demands an exact principal/session/workspace/
environment/target scope, checks authority before and after the awaited
source, and refuses uncommissioned source, malformed source, cross-scope
responses, and incomplete populations. Source failures do not manufacture
empty records, zero amounts or true availability. This is not an atomic
field/source authority fence held through HTTP egress. No approved ownership
or field mapping is implied. V1 has bounded arrays but no page/cursor wire:
an incomplete source is refused `SIBLING_PAGINATION_NOT_COMMISSIONED` rather
than silently truncating; design and publish an independently scoped signed
continuation contract before enabling large populations. The Edge-owned source,
field authority, producer-to-HTTP custody, actual mounting and real-source
negative tests still remain. No frontend reader or public schema was changed.

## Preview / Claude handoff

The previous fixture lane routed `/api/auth/context` to a synthetic principal
with no real session and sent unknown API paths to the fixture service. It
therefore could not use the real Research Library. A separate opt-in hybrid
overlay keeps Execution fixture reads and sends session and all QuantBT paths
to the isolated preview Control API; the existing standalone fixture mode is
unchanged. Its banner explicitly distinguishes the two lanes. A headless
Chromium read on the public preview opened `/research/quantbt/runs` without a
login; public API returned AUTHENTICATED as the local preview identity and
Run Library 200 `research.run-library.v1`. This is not evidence of Edge or
Execution business authority. Browser visual/full journey acceptance remains
for Claude; no approved component, tokens or baseline was edited.

Preview is publicly reachable and the existing local/dev-only auto-login may
allow the preview identity's authorized Research writes; do not use this
profile or its fixture bypass for production. Hybrid rollback is
`preview.sh fixture hybrid-off` then `preview.sh up --force-recreate portal-web`;
this returns to the previous fixture-only routing, not to production.

## Commissioning and qualification matrix

| Area | Current source pin / reusable evidence | Still required |
| --- | --- | --- |
| Approval Evidence | `approval-evidence.bootstrap.ts` SHA256 `22ddbf8af4d00ab1a6f0f93b9b5febdcb2e5fa1dc0e710d4e723879901d43e45`; code `2a0e00e0c`, full hook and 44/44 PG fence/restore in six-package receipt | Preview-only source-dark mount; independently commission field authority and source fence, retest rights and genuine API; no positive evidence inferred from 503. |
| Financial | `manager-runtime.ts` SHA256 `ad3a72afa608ceec269379170dee86016b39bca16b9c93cc5728b3d7939f99b3`; previous focused snapshot/currency and full-hook receipts apply to unchanged code | Qualified carrier, same snapshot/permission, ownership/census and APPLIED→ACK with Edge; re-run affected mappings and end-to-end. |
| STATUS | `command-status-composition.ts` SHA256 `a86d5707a1a66171bb5ae07069a4577be85c31f9bb8cc42f19b87c698c18018c`; see `COMMAND_STATUS_DURABLE_ACK_2026-11-02.md` | Current source/gateway binding and same-original lost-response recovery; command/Live stays disabled. |
| Restore / migration | Prior disposable PG drill in `ELP2-11/README.md`; migration 0156 rollback refusal verified in 2 Nov receipt | Rehearse forward and restore/preservation on the final candidate, exact source/schema/image hash; never down/drop custody merely to make a test pass. |
| G2 / coexistence | Previous measurements may be reused only after affected source/profile/schema/candidate impact review | Accepted target, numeric bounds, workload and Score calibration first; no fixture throughput or historical image may be labelled current G2 PASS. |

Runtime check on the shared preview found the actual `pgmigrations` ledger
ending at 0154, despite the previous `identity.json` listing a later checkout
filename. Migrations 0155/0156 are not observed applied. Scoped identity
recording is corrected to keep checkout SHA and available migration separate
from unknown image provenance and applied schema. Before any migration: take
a verified restorable backup, inspect exact target/ledger and pending SQL;
exercise forward/restore in an isolated disposable copy, verify preserved
users/grants/custody/audit, then apply only the approved Research target and
record actual ledger. 0156 intentionally refuses destructive down; recovery
is restore/forward with reconciliation, not erasing retained obligations.

## Terminal local/build and preview results

- `sibling-source-seam.ts` SHA256 `9dad81073bf07ac51f1f141e9e4241f5ec7d54118625fb27cc8f4d767cf37180`;
  its contract-vector/negative test SHA256 `45cc1fcaea4f4a690abce5439937e56fd76043d47305e431a6d15adb90ad037d`.
- Sibling, Approval Evidence, command STATUS composition/bootstrap: **104/104**
  tests passed across four files on the local test runner. The sibling file
  includes all canonical positive and negative vectors for the four schemas.
  Three preview configuration test files passed; these are not browser or
  connected-source test totals. The sibling test was then corrected to read
  the contract directory supplied to the isolated runner and retested **8/8**
  with that environment variable set. The first normal-hook attempt was
  interrupted early (exit 130) after this path problem was discovered, before
  API suite execution; it is not a PASS.
- Isolated preview image build exited 0. Web and fixture image IDs actually
  running are `sha256:f5657b7999d9f98923dd568a45213716932b4e77bd23c8f3ace5682cf28b6408`
  and `sha256:63888c8f4cf0073530f5c4193a67b49cb68447c30d6259a96a2ee666bcbca2b4`.
  Control API image `sha256:cf60a6044b8b331d834cba4e8232e581a90c90b7d3a8f8e3a83dfcef22d76971`
  was built but **not installed**: the preview DB has not applied 0155/0156.
  Its prior running API image remains `sha256:d65e77860860dbf24fa5bbf6ded8bc6225b063ebc15578ed6a2dd8d1e92132f8`.
  The web build included tracked checkout source plus this still-uncommitted
  candidate, and its stamp is dirty. No exact clean SHA/image certification is
  asserted. Old images were tagged for rollback before build.
- 1280px Chromium: `/research/quantbt/runs` opened Library with real run data,
  and `/deployments/alphas` opened populated fixture Alpha Fleet; neither
  displayed login or raised a page error. This is a smoke check only, not the
  complete browser/visual/responsive suite. No commands were sent.
- The Control API image build reported **six npm audit findings** (one high,
  four moderate, one low); no dependency upgrade was performed in this slice.
  The normal commit hook/complete suite and final schema rehearsal are separate
  from the focused checks above. No origin push or release is implied.
