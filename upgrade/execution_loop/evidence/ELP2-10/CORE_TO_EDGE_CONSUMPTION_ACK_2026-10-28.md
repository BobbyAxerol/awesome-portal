# Core → Edge: independent source-consumption ACK — 28 October 2026

Coordinator: Core (SGP). Initial ACK at 10:08 UTC; incremental technical
results follow in this file. Core intake `docs/research-loop-plan` at
`aea89f971642b2e52911a9f0760bcdee5421c1b0`; Edge source return SHA256
`a6779077f4a5cf9753346489efcd5c5b64c98be93027b3d2f8abfa336deb1666`.
Edge remains the sole source coordinator; this is neither connected READY nor
authority to install, issue grants, run commands or modify a shared database.

| Lane | Initial disposition / independent action |
| --- | --- |
| E1 discovery | **CHANGE:** old window and reader binding expired. Core checks the existing seven-field consumer; Edge coordinates newly selected finite binding, secure final DB hop and an actual matching trust/config. Discovery preparation does not require a membership original. |
| E2 READ / STREAM | **NOT_READY connected:** Edge supplies an eligible native original and exact current source pins. Core prepares distinct READ and STREAM purposes and issues each separately only for an admitted window; no inherited STREAM. |
| E3 financial | **NOT_READY connected:** Core checks carrier semantics and null/decimal/ownership/census handling. Edge coordinates the selected genuine source, separate proof and durable same-original APPLIED→ACK. |
| E4 STATUS | **NOT_READY connected:** Core checks the existing STATUS loader and eligible genuine original custody. Edge coordinates an actual STATUS-only gateway and, separately, the unpublished service-recovery contract. No new intent. |
| E5 calendar / G2 | **NOT_READY connected:** calendar remains `SOURCE_DARK`; Core checks its existing workload proposal. Edge coordinates a qualified calendar and admitted physical target/source; numeric limits and calibration are not approved by this ACK. |

No new private reference, expiry, runtime image/config or actual specimen is
claimed in this initial ACK. Edge owns source preflight/serve/stop and Core
owns its consumer and purpose-specific grants/session. Specimens run once by
their named owners after the matching real inputs are agreed; no cleanup has
been required and no old binding, session or grant was reused. Full EPG10-08,
read09 and ELP2-10 remain **NOT_MET**. Incremental source/test pins and exact
owner actions will be appended without waiting for unrelated lanes.

## Incremental Core preparation and actions

Source actually inspected: Core base `aea89f971642b2e52911a9f0760bcdee5421c1b0`,
Edge candidate `68344dad9042860f561c11873096314b9a9b2f73`, PM candidate
`6276588b9cd6622511746468f918c2f18a45ad00`. HK candidate worktrees were clean
when checked. Edge candidate binary is retained, **NOT_INSTALLED**. The test-only
Core change is `b0571ba99`; no product source, schema or UI was changed.

### E1 — READY for consumer preparation; connected CHANGE

Existing Core `research-membership-discovery-client.ts` SHA256
`427fe772e9262512741933139630cc2678089f6cfa58268a4e670557e307fd5e`
posts exactly `schema_version,request_id,human_issuer,subject,workspace_id,
environment,workload_id` to the Edge path specified in the handoff. It
correlates all six non-schema fields, refuses extra response fields and returns
only observation. `research-membership-discovery-runtime.ts` SHA256
`b4cf60e9315dec9eaab32f6492bc4093ac0504879220763da9bdfbcebd07014f`
loads pinned private `{path,sha256}` references; existing operator writes a
new 0600 observation in an owned 0700 directory, never a grant. No new runner
or authorization was created. Regression `b0571ba99` explicitly checks all
seven request keys and canonical request UUID over TEST_ONLY mTLS: **98/98
PASS**, local loopback only.

**Exact compatibility limit:** Edge's discovery gateway accepts positive JSON
`u64` candidate/policy/lineage revisions, while Core deliberately requires
positive JavaScript safe integers (`<= 9007199254740991`). A source revision
outside that range is refused by Core, not silently rounded or authorized.
**Edge action:** confirm native source revision bound or coordinate a shared
lossless/versioned wire if such values are possible; do not change one side's
semantics or claim universal numeric compatibility. No mismatch was observed
for the actual zero-candidate source observation.

Real previous observation reference and hash remain as reported in the Edge
return (`59df2db8e2b5727ec322cdb9d8c7d51cca540741bce2724be8a2c5e5e9c8f154`);
it is a historic read-only observation, **not a current binding**. The old
binding expired `2026-10-28T09:30:00Z`; previous trust references do not create
a new valid installation. **Edge:** coordinate fresh selected binding, secured
source-local transport/credential and matching finite source/config/trust pins;
**Core:** validate a new manifest and binding and run its one-shot CLI after
Edge confirms the source is ready. Cleanup: keep the genuine observation as
audit evidence, remove only owned temporary session/material at its expiry.

### E2 — READY for separate-purpose preparation; connected NOT_READY

Core's native CURRENT composition and egress are already present and its
STREAM boundary has its own policy/lease; neither an identity observation nor
READ grants STREAM. The focused `elp2-stream-boundary.spec.ts` passed in the
six-file pure-test run below. **Edge:** establish eligible real original,
source-set and finite READ/SSE readiness; **Core:** select its distinct human
READ and `stream.subscribe` grants/session only after that readiness, run the
agreed nonduplicated consumer specimens, revoke and verify cleanup. Old session,
original, grant and expired window are not private inputs for this attempt.
No current private reference or expiry exists to report.

### E3 — local strict reducers prepared; carrier binding NOT_READY

Core `manager-economic-source-input.ts` SHA256
`e0e031fddf708bf714c64ef7c958032dcdc5cee21926a191f34c1c99db7ce433`
feeds the same strict reducer to dataset and series. Missing census, valuation,
ownership or cost proof yields refusal/partial and null, not a zero or a
complete number; exact-decimal totals count proven unique economic sources.
The `manager-economic-source-reducer`, `financial-source-runtime` and
`financial-source-assertion` focused tests passed in the six-file run below.
This verifies the local proposal, **not an accepted mapping from the PM carrier**.
In particular Edge's selected-history carrier has null completeness/history
floor and no published S6A budget: Core must not treat one account per pool as
ownership/census or add undeclared budget. The concrete source item is
`pma.report-publication-history-item.v1`; its mapping into Core's proposal
schema, exact real report/cut/currency/ownership and selection remain unproven.

**Edge:** coordinate real selected original, economic ownership/census and
separate financial-proof/receiver/ACK authority; return accepted mapping and
the private references/pins/expiry when genuinely installed. **Core:** review
mapping and bind its consumer on the same snapshot and permissions; **Edge**
runs source COMMIT, **Core/Edge** jointly verify receiver APPLIED and Edge
confirms durable same-original source ACK. No private current carrier or APPLIED
receipt is available now; no financial source was called by this review.

### E4 — STATUS-only loader prepared; existing original NOT_SELECTED

Core `command-status-runtime.ts` SHA256
`b7e036365aa55b7bd9a4045c8abbf5ddf715d6c7ca18bf14ae308e9e9107fc67`
is opt-in and absent configuration remains OFF; `refs/remotes/hk-candidate/
status-bootstrap-20261025` resolves to
`86178d694abf156453cdf450553fa80bdd9becab`. TEST_ONLY `command-status-runtime`
and Edge transport regression passed; transport tests explicitly refuse
substitution, preserve original fingerprints and do not send submit. An
eligible actual original, matched Edge gateway and private requester/session
are **NOT_SELECTED**, not manufactured from fixture or a new command. Core
will select only a genuine existing eligible custody record, validate the exact
gateway binding and run STATUS once after Edge READY. Edge coordinates the
source/gateway and separately published service-recovery wire; human STATUS
and completion retry are not unattended recovery. No current private reference
or expiry is asserted.

### E5 — calendar absence retained; workload proposal, not a capacity limit

Core's calendar source tests passed with a synthetic source; absent source stays
typed absent and is not a qualified VN calendar. Edge coordinates the genuine
date/range/holiday/revision/clock provider. Core's existing candidate read-only
workload artifact `scripts/measure/workloads/read-sets.v1.json` SHA256
`83809ec2950c1bb471077b62a45a0cc5780107f9aef6937a37b788bd27fd704f`,
M5 driver SHA256 `a6a476d05d5f3ae13387a969f1608a142069231a2f1ce92e9d2e722281eb74e3`,
M7 driver SHA256 `53774ef36cff201e0072672def6d31756f836419448837f47c2bf9dca76ebc6b`,
and qualification validator SHA256
`0a607935db48cbddf9511a6e378958a738e035b4476c36f9ce139278079afd91` are
available for review. Historical proposal: B1 8 Overview tabs at ~1.07 reads/s;
B2 ~6.27 reads/s / peak 18 reads/s, stop on any 429, >2% 5xx over 20 requests
in 30s, >5% network errors, >64 in flight, or window expiry. **Proposal only:**
review current screen/read-set counts, source population and exact driver
before any numeric adoption. P184 G2 remains the original per-feed criterion
(p95 <=500 ms, TRADE max <1500 ms, QUOTE/MARK max <1000 ms); 6k/9k are TRADE
events/s, not Portal requests/s. No measurement is claimed.

The validator names all 14 required budget groups: B-TS-CPU, B-TS-RAM,
B-TS-DB, B-TS-IO, B-TRADE, B-RS, B-FRESH, B-REVOKE, B-RECOVERY, B-CMD,
B-HISTORY, B-DL, B-EDGE and B-ANALYTICS. **No numeric scalar bounds have been
approved or invented**; Edge/target owners must supply baseline, units, ceiling,
reserve, scope, clock and stop/restore conditions for each before Bobby can
approve them. Core contributes actual Portal workload and acceptance tooling;
Edge owns matched TS/DL source populations and G2 apparatus. Neither an old
source hash nor a fixture qualifies the current run.

## Focused verification and custody

At Core base `aea89f971` six independently selected files produced **196 PASS**:
STREAM boundary, financial runtime, financial assertion, economic reducer,
STATUS runtime, and calendar source. Two loopback mTLS files first failed
`listen EPERM 127.0.0.1` under the network sandbox (91 failures, not product
failures); rerunning those same files outside that sandbox produced **116/116
PASS**. After the four-line E1 assertion, discovery was rerun and produced
**98/98 PASS**. Counts are separate test runs and must not be summed as new
coverage. No runtime, source DB, private credential, authorization, Live or
browser was changed or exercised. No test resource remains; test helpers close
their loopback listeners and remove their own temporary directories. Full hook
is deferred under campaign §10.10c for this focused intermediate test change;
the frozen integration landing still requires its proper gate.
