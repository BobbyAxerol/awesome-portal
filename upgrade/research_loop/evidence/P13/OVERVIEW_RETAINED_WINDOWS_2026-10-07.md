# LR-01…03 — retained Overview window binding

Status: **REAL_API_BROWSER_ACCEPTED for this read-side repair**, not P24,
signed release, causal qualification or new engine/profile acceptance.
Bobby authorized fixing enrichment/data binding while preserving Claude's
design. Base `947929e9`, backend lane `codex/be-gaps`; landing branch
`docs/research-loop-plan`. No remote push or production operation.

## Delivered truth

| Window | Source and visible result |
|---|---|
| Three IS | Existing `protocol_disclosure.window_series.is`, bounds and sample metadata. Separate IS equity/drawdown panels;41,328 retained observations,17 display points. No OOS curve relabelled IS. |
| Three independent Holdout | Same named retained role;6,552 observations,14 display points. Frozen-parameter account, not used for selection, explicitly evaluated after freeze. Both panels and UTC/end-exclusive bounds visible. |
| WFO IS | New optional generated `WindowViews.is` is `FOLD_FACTS`: each actual P05 fold's training bounds, bar count, selected-trial penalized/raw IS Sharpe and engine trade count. Cursor uses source ordinal+1, not verdict ordering or the engine's string fold id.15 distinct windows, never compounded as one account. |
| WFO Holdout | `NOT_APPLICABLE / WFO_PROTOCOL_HAS_NO_INDEPENDENT_HOLDOUT`. No locked/denied copy or fabricated independent window. |
| Completed Three Holdout count | Hub6552, after actual COMPLETED/READY, SEALED artifact/producer binding, terminal checkpoint and exact retained protocol/preflight range/count validation. Pre-execution P08 remains denied; no preflight/seal mutation or authorization bypass. |

Real WFO examples: display fold1 / source id`0` has25,992 training bars,
IS Sharpe`0.5940860206458951`,481 engine trades. Display fold15 / source id`14`
has56,640 training bars, IS Sharpe`0.26716671633543054`,1111 engine trades.
Bounds identify **first/last actual training bar inclusive**; Three bounds
remain **start-inclusive/end-exclusive**. These are not interchangeable.

The generic enrichment, original account sources and frozen Reports are
immutable. The additive window projection takes precedence for **window
access/rendering**, not for financial definitions. Sampled points are not a
complete Sharpe/distribution ledger. WFO's retained source does not contain
separate per-fold IS account curves: that panel remains
`WFO_RETAINED_FOLD_HAS_NO_SEPARATE_IS_ACCOUNT_CURVE`, alongside available fold
facts. Never substitute the idle prefix of stitched OOS or claim the
overlapping training population is unique history. No fabricated metric0.
This closes the requested Overview binding; it does not fabricate the missing
WFO curve or claim an independent Holdout.

## Contract and implementation

- `current-source-window-views.ts` builds only from authorized, already read
  P05 summary/fold rows; strict closed schema, dense ordered fold identity.
  No new table, migration, engine/HMD call, full ledger fetch or browser math.
- `current-source.contract.ts`, generated `research-current-source.d.ts` and
  OpenAPI expose optional `WindowViews`; older responders/fixtures remain
  compatible. Canonical synthetic fixture and generator/contract tests added.
- Browser DTOs carry only closed public `source_ref` enums. Internal P05
  record/field locators above describe the server mapping, not browser inputs.
- Evidence read's presentation ETag includes the window-view version, while
  immutable source/cursor revision stays unchanged. Actual old ETag returns200,
  actual new ETag returns304 for both runs.
- Hub joins retained protocol through its existing scoped seal/artifact proof.
  Only completed, range/count-matched Three disclosure may publish count.
  The generated Hub contract now has an exact available-count union.
- `EvidenceFlow.tsx` binds roles/fold facts and reuses existing tiles/figures;
  `EvidenceCharts.tsx` adds role labels for series/tooltips/accessibility while
  preserving all default OOS labels, colors and chart dimensions. No CSS,
  token, navigation redesign, baseline update or Claude source deletion.
- Preview helper accepts named build services and a **control-api/web-only
  --no-deps rollout**, so this read-side patch cannot inadvertently restart
  worker/DB/NATS or invoke migration/bootstrap.

## Verification — affected surface only

- Control API focused suite: **56/56**, including full02 retained read models,
  completed/preflight disclosure and Hub mapping. Latest bounds-proof follow-up
  **8/8** (overlaps the56; not summed). Control API build PASS.
- Contracts: **10/10**; generation/check reproducible, optional compatibility,
  closed states/fields and old IS contracts retained.
- The first commit hook stopped before test execution on the stale contract
  snapshot. Regenerated the publication digest with the repo script and added
  the new window fixture/generator to its tracked set; no application rebuild
  or repeat engine run is needed for this bookkeeping correction.
- The first complete Control gate passed 2334 tests but caught one existing
  RS-03 public-boundary assertion: the new DTO used `source_locator`. Changed
  it to closed public `source_ref` enums (no source path/table inputs), keeping
  that security assertion unchanged. This small representation fix requires
  refreshed read-side images/browser proof; no new engine jobs.
- Frontend affected suite: **55/55** (window selection, chart names, existing
  IS and OOS behaviors); final fixture follow-up **2/2**, not additional unique
  tests. Production-like image `tsc -b` + Vite build PASS.
- Initial build caught an incorrectly partial new test fixture; fixed using
  the canonical common provenance fixture. No runtime was rolled out until
  corrected images passed. This is recorded, not hidden as a first-pass build.
- S04 HiFi/spec/COR and P13/RS handoff inspected. HiFi opened in Chromium at
  **1280/660**; same accepted figure/panel grammar reused. No broad visual
  re-record or claim of whole-product pixel acceptance.
- Existing real runs, **10/10 browser views** at1280/660, Three IS/Holdout and
  WFO fold1/fold15/Holdout, with hard-refresh/deep-link preservation.
  **0 page errors,0 failed API responses,0 product writes/new engine jobs**.
  Read-side rollout only; existing review account reused, browser closed.
- Exact `provenance`, `passport`, `protocol_disclosure`, generic
  `enriched_analysis`, frozen Report core and Report revision match original
  receipts for both runs. Job census unchanged:7 CANCELLED,21 FAILED,
  1 QUEUED,57 SUCCEEDED. The pre-existing queued job was not touched.

Browser command (real upstream, no fixture interception):

```bash
node scripts/research-preview/long-range-delta.mjs windows \
  /home/bobby/.local/state/portal-research-p23/long-range-delta-20261007/overview-repair-final \
  rrun_338193efca9bf958fe9126f495bb37be \
  rrun_a0314cb849a692712035fcca836eb233
```

Private receipt root is0700, JSON0600; response bodies/screenshots not in Git.
The hashes below preserve the first read-side browser proof; its wire DTO was
subsequently corrected to public enum references by the unchanged RS-03 gate.
`receipt.json` SHA-256:
`675b43f1a9d16899c84bf84e70ca551a5ef879bc2ae34f3d9b3b9ce582be816d`.
Three retained response SHA-256:
`fbebe8a3d9cd9a9dfe16dfd190f5cac4e682b8ffa0bff8a081cb58e9136ef6b0`.
WFO retained response SHA-256:
`785df016bab69780f0c0ebd10c3a051e9cfbecaab50d9739855606be13915645`.

## Runtime identity, cleanup and remaining scope

Initial diagnostic preview only, loopback8095 /
`research-portal.primusspark.com` (images below precede the public-ref correction):

- Control image `sha256:078b2c1e807fe7826c2e7f41369cbb470b4e515005d65e961d70e09f76961355`.
- Web image `sha256:8d3da8a588e63e417835a1c346290cbe5898033338abe9407c421cfa4b289e4a`.
- Portal API/worker unchanged:
  `sha256:94cb3637cec343de5f50fd90f145c9c028196a80b924b030ec842afb918123ee`,
  original start times06:17:32Z; no worker recreation.
- Diagnostic images built from947929e9 plus this working diff, not signed
  release candidates. Preserve source hash and subsequent delivery commit;
  do not mislabel a dirty build as an immutable clean candidate.

Capacity decision was recorded **before** the two-image build. Root available
108,101,873,664bytes before →107,647,127,552 after, still16.17% free.
Cached Roadmap frontend stage reused; no Portal API/QuantBT/worker or Roadmap
API build. Browser sessions closed; no new test stack, credential, scratch
volume or artifact deletion. Protect active/new and previous rollback images,
data and receipts. **NO_DESTRUCTIVE_ACTION_NEEDED** for this slice; retain the
separate C4 quiet-window cache inventory follow-up before another heavy build.

## Public-wire acceptance before landing

The corrected DTO uses public enum references and a new presentation ETag
(`OVERVIEW_RETAINED_WINDOWS_PUBLIC_REF_V1`). Do not transfer acceptance from
the earlier wire representation without running the same ten browser views.
The refreshed proof must additionally reject locator-shaped window metadata,
return 200 for both the original and earlier diagnostic ETags, and return304
for its own ETag. Existing manifests, Report core/revision and job census must
remain unchanged. Actual refreshed image identities and receipt live together
under the private root `long-range-delta-20261007/overview-public-ref/`.
This is a prerequisite to shared-branch landing, not a new engine run or P24.

This delivery uses one grouped normal commit with the mandatory hook, then
fast-forward landing on the clean shared Research branch. The delivery commit
and hook result are the landing receipt; no remote push is authorized. Do not
rerun unchanged full engine qualification, DR, load or73-cell visual gates.
Remaining broader P23/P24/owner release gates and optional WFO IS curve capture
are separate from this accepted current-data Overview repair.
