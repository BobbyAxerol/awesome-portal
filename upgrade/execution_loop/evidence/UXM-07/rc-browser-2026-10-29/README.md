# R-C browser acceptance, fixture lane (2026-10-29)

**Fixture lane only.** The projection is the fixture BFF's own answerer (`apps/portal/fixture-bff/equity-projection.ts`, called in-process by the spec) behind the double's other reads. There is no real source, no Edge series, no Research band, and **no approved band is shown anywhere**: the band is named "Illustrative band (fixture), not an approved band" and the section is labelled "Fixture projection". **No pixel baseline was recorded or changed.** Spec: `apps/portal/frontend/e2e/execution-v2-rc-fixture.spec.ts`; cells comparison: `execution-v2-rc-cells.spec.ts`; config `playwright.rc-fixture.config.ts` (local Vite build with the V2 screens, preview on 4184, app assets served from the build on disk).

## What is asserted (52 cases per run)

For each of Live room, Canary room, Paper workbench, Alpha 360 Performance:

- at 1440, 1024 and 660: the projection section renders, with the text "Fixture projection" and the band name above; apart from the explicit negation no "approved" wording appears in the section; the equity line and the drawdown line are attached with a non-empty `d`; document `scrollWidth <= clientWidth`; no console error; no failed API call except the double's own typed answers that are not under test (retained-review 404; manager dataset and alpha lifecycle 501);
- at 1440 and 660, the projection route answering 404 and 501: no projection section, no refusal line, the screen's own state has settled, no other failed call;
- at 1440 and 660: 403 shows the denied line (`data-word="DENIED"`); a body for another deployment shows MISMATCH wording ("another deployment"); a 5,000-point series (1m interval, built from the fixture's end state) renders, the page answers within 5 s and the chart DOM stays bounded (137 to 143 nodes in every run).

Every case waits for the real projection response and its status before asserting. `net::ERR_NETWORK_CHANGED` on lazy chunks is detected (navigation retried at most twice with an annotation, then "Environment fault"); a renderer crash is reported as an environment fault with the host's free memory and load.

## Runs

10 consecutive full runs (`--trace on`, the config's `retries: 2` available): **10 of 10 runs passed, 52 of 52 cases each, i.e. 10/10 for every case and width; 520 case results, all passed on the first attempt (none flaky), 0 harness retries.** Host load average during the runs ranged from 7 to 159 (the host is shared and was badly overloaded); see below.

`trace-sha256.txt` lists the sha256 of every trace zip (not committed), `run-summary.txt` the exit codes, `run-1.log` the Playwright output of run 1.

## Defects and faults found

- Product: none found by this spec. The Alpha 360 case needs `workspace_id=ws_TEST_ONLY` in its URL: the double's alpha resource names `workspace_execution_manager`, which the fixture projection answerer (correctly) does not serve (404, typed absence). That is a fixture-lane mismatch, not a product defect.
- Environment: earlier attempts of this same spec hit a host that was overloaded (load average 170 to 285, free memory near zero, no swap): one 5,000-point case at 660 ended with "Page crashed" and one goto crashed; two cases timed out waiting for the projection request. These were environment faults (the harness now records load and free memory per case, reports crashes as environment faults, and waits up to 45 s for the projection response); they did not reproduce in the 10 recorded runs. Whether a crash under memory pressure could also come from the page itself is not proven either way: in the recorded runs the 5,000-point chart uses 137 to 143 DOM nodes.

## V2 visual cells that differ against the fixture projection (1440)

All 23 routes of the V2 visual spec's CELLS were visited twice with the same double stubs, once with the double's 404 for the projection and once with the fixture answerer. Exactly three differ: the projection section appears (200) in **workbench-paper, live and canary**, adding height to the main region; the other 20 cells do not ask for a projection and are unchanged in height. Alpha 360 overview does not ask (several deployments in the book, none named). Screenshot sha256 of `#portal-content` (bytes not kept; the clock is not frozen, so only the height and the presence of the section are the evidence of change):

| cell | height before | height after | added | sha256 before | sha256 after |
|---|---|---|---|---|---|
| workbench-paper | 1637 | 2280 | +643 | `f21be827f8d24ec8556554718c8459e0bf888ff9f1499105c854ddb12b0dcd54` | `0eca778543b8b89a1877ab3e5ad7378818f86a3f94918c8f3e3507c3c8c2aeaa` |
| live | 2968 | 3671 | +703 | `39fe72273cb411802d5be4a62c413c8c7c945fb826f6b90d22154071f380eae6` | `b286fb468c5d96986a4e9ba4420cafedd5d88403b5305e55cb0deb7b065defd5` |
| canary | 1337 | 1723 | +386 | `c9324890b0e11cf5ffa6ada340122aa262b197f5fc413e988231d8db767645b5` | `c7d443b4901fb41dc7fb4aa991ab0d575b6127ceedc4e776e57f5649c49ec2a6` |

All 23 hashes and heights are in `visual-cells-before-after.json`. Because the pinned-image pixel baselines of these three cells were recorded without the projection, they will not match on the fixture lane; re-recording is a separate, reviewed step and was not done here.

## Not proven

Real source, real Research band lineage, field-level authority, the V2 route (not read by any screen), pixel parity in the pinned image, behaviour on a quiet host for the crash case beyond the 10 runs, and behaviour under a network change (assets are served from disk).
