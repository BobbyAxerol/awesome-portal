# §54 — Native Report absence and FAILED custody

## Scope and result

Codex backend only. The typed source response is delivered; shared-preview
deployment and S01 browser acceptance wait for Claude's typed consumer below.
No frontend, component, baseline, migration, runtime flag, existing recipe,
engine run, remote push, dev/main or production change is included.

The defect was real: a known native run without a full P18 Report fell through
to `404 RESEARCH_REPORT_NOT_FOUND`. It is now a successful read of a known
absence, **not** a fabricated Report or a claim that native Search/Freeze/Report
assembly has been implemented.

`researchReportDetailGetV1` keeps its operation id and route. Its 200 schema is
now generated **`ReportRead = ReportDetail | ReportUnavailable`**, narrowed by
`schema_version`. Existing `ReportDetail`, `frozen_core`, revisions and seals
remain unchanged. A present sealed Report always wins over an absence result.

For a missing native Report the reader validates the authorized run's exact
historical execution-profile id **and digest**, independently of whether that
recipe is enabled today. Response:

```json
{
  "schema_version": "research.report-unavailable.v1",
  "read_authority": "PORTAL_PERSISTED_RESEARCH",
  "run_id": "rrun_ee50cb82d6de9e495e10b32323b62f8c",
  "display_label": null,
  "run_state": "READY",
  "availability": {
    "state": "NOT_PUBLISHED",
    "reason_code": "NATIVE_REPORT_NOT_DELIVERED"
  },
  "execution_profile": {
    "id": "p10.delta-event-driven-limit-oco-search-1h.v1",
    "digest": "2b69015b8975e3097cc797999188a6d6b75e29ce52fc3ad2d4c35026ab7f0d73"
  },
  "as_of_utc_ms": 1791468771662,
  "etag": "\"p18a1_702db0689a6e1ca5fd33b54d3598486dd4394b9d666cf2c9f5069e153a4ef35e\"",
  "may_export": false
}
```

`READY` is the persisted run lifecycle, corresponding to a completed Library
run, **not** a statement that a Report is ready. `display_label: null` stays
null; the existing native profile has no published short-label kind. There is
no `frozen_core`, `report_revision` or `sealed_at_utc_ms` in this variant.
The absence has its own private representation ETag, never a forged core pin.
Membership/tenant checks precede both 200 and 304. Unknown or foreign ids stay
404 at the controller boundary; forbidden membership, disabled feature and
incompatible stored profile retain their typed refusal. Export creation for a
known absent native Report is `409 NATIVE_REPORT_NOT_DELIVERED`, with no job,
bytes, retry claim, repair or engine invocation.

## Real preview database proof

Measured **2026-10-09 05:24:17 UTC**. The compiled candidate service/repository
was executed locally against the actual Research preview DB with read-only
transactions. This is **not deployed HTTP or a browser receipt**: the old
shared backend/web remains untouched until Claude handles the new union.

- Native `rrun_ee50cb82…`: exact response above; repeated ETag stable; export
  refused without a queued job; unknown id 404; nonmember 403 at the repository.
- WFO `rrun_cf5ed033560082488b559baf29be4754`: existing Report still reads as
  `research.report-detail.v1`, revision
  `p18r1_f18276514ffb1c67f92618f43094384e9290115cbb0665eec6efddd67635c588`.
- Native/failed run state versions, updated times, Report counts, export counts
  and retry counts were unchanged before/after the proof.
- Private receipt:
  `/home/bobby/.local/state/portal-research-p23/20261009/native-report/read-only-proof.json`;
  SHA-256 `2ad1900ab56fe9dc6cf2a217a9b11630472c03587c46256861e3cef4e87b1086`.
  It records exact compiled-module hashes and deployed image ids, explicitly
  labelled `CANDIDATE_MODULES_READ_ONLY_ON_PREVIEW_DB_NOT_DEPLOYED_HTTP`.
- Reproducer: `scripts/research-p23/native-report-read-proof.mjs`; it validates
  the preview project/database, never prints credentials, and preserves pins.

## FAILED data is retained evidence, not orphan garbage

Read-only inventory of the **two reported runs only**, not a global cleanup:

| Run | Lifecycle | Current rows / seals | Window rows / batches / seals | Orphan window batches |
| --- | --- | --- | --- | --- |
| `rrun_4eab9bf92ba1a4aa00ad1bca4416b1d0` | FAILED | 9,903 / 1 | 46,377 / 232 / 1 | 0 |
| `rrun_bd5906ac9bb4b310b05f462de97ada56` | FAILED | 0 / 0 | 0 / 0 / 0 | 0 |

The first has current-source and window seals despite the later terminal
failure. Those rows remain bound to its run/artifact, immutable and forensic.
The second has an existing failed Report manifest. Neither is rewritten as
COMPLETED, resealed, deleted, anonymized or treated as disposable unreferenced
data. Existing append-only guards stay in place. The earlier window-seal retry
seam was already repaired in `05b11981` and verified by the successful 16×400
run; no rerun or lifecycle rewrite is needed here. Any future retention cleanup
must separately distinguish scratch/unsealed fragments from these sealed
records and respect artifact references/pins. This receipt does not claim a
global orphan census or cleanup authorization.

## Fold cap decision

Queue §53 explicitly records Bobby's **keep 2–16 folds / ≤6,400 trials now**.
The present shorthand request does not silently replace it. No cap, immutable
descriptor, digest, admission or total-budget change was made.

Future option B: additive qualified recipe edition toward 30 folds, keep the
6,400 total; for independent outer studies the upper bound is
`floor(6400 / admitted_study_count)` (30×213=6,390). Inner trials, audit work and
other protocol-specific work must still use their own declared budget, not be
hidden by that shortcut. Schema bounds, summary/page size and real 30-fold
retention/p95 must qualify together before activation. This is a future plan,
not a completed or enabled 30-fold capability.

## Focused gates and remaining product gate

- Control API Report service/absence/controller: **23/23 PASS**, including
  no invented seal, exact digest, unknown/foreign/member cases, private ETag,
  existing Report integrity and export fail-closed.
- Contract Report suite: **5/5 PASS**; canonical native absence fixture and
  generated union; existing frozen-core union retained; both ETag prefixes.
- Disposable-PG regression adds run-context membership/foreign-run checks to
  the existing Report migration suite; exercised by the normal commit hook.
- Normal commit hook performs the grouped build/contract/Control gates;
  final result is recorded in the commit/agent report, not claimed in advance.
- First full-suite attempt: 2,438 PASS / 3 SKIP / 1 FAIL. The failure was
  the existing LW-02 WFO test double lacking the new `runContext` method;
  production behavior and all five disposable-PG Report tests passed. Only
  that test double was updated; its focused W6a rerun is **28/28 PASS**. The
  required normal commit hook is retried, without bypass or runtime change.
- Frozen qualification receipt from migration126 remains byte-identical:
  SHA-256 `c130b772b3a9e654a8de7d96fc0408a8cb4ae699bea3fae7d889a5166a910a76`.

## Handoff / prompt for Claude

Read queue §54 and this receipt, regenerate `research-report.d.ts` with the
repo script. Backend source is on the shared Research campaign; no redesign.

1. In `reportClient.ts`, type the detail read as generated **ReportRead**, not
   a manual DTO or `ReportDetail` cast. Narrow `schema_version` before
   `reportState`, `reportAbsences` or any `frozen_core` access.
2. For `research.report-unavailable.v1`, keep the existing Report layout's
   honest unavailable/empty presentation with the server reason and run id;
   no fabricated metrics/seal, recipe-name special case or client inference.
   Keep exports disabled (`may_export:false`). `NOT_PUBLISHED` is not zero.
3. Existing `research.report-detail.v1` follows the unchanged rich path.
   Preserve component choices, layout, colors, typography and visual authority.
4. After the consumer lands, coordinate **one scoped Control API + web rebuild**
   from the same shared head; do not rerun QuantBT or migrate/reset the DB.
5. Retake **affected S01 native-first → Report**, native direct Report and one
   existing WFO Report, 1280/660. Check native200/conditional304, no console
   error/resource404, proper server reason, disabled export, real workspace
   boundary. Record run ids and exact running image/bundle identities. Do not
   mark the whole 73-cell matrix PASS from this backend service proof.
6. SL/TP-positive account levels, HiFi-vs-native route equivalence, visual
   baseline/write matrix remain their existing separate open acceptance items.

**Status: BACKEND_SOURCE_DELIVERED / PREVIEW_HTTP_AND_S01_CONSUMER_PENDING_CLAUDE.**
