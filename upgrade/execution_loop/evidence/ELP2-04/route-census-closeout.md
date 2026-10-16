# ELP2-04 — Route census closeout (source review, still OPEN)

Final source refresh: 2026-10-16T05:15:09.662Z (initial review 04:09:42 UTC). **Not a whole-phase PASS, deployed identity, or production qualification.**
The machine-readable [complete census](route-census-closeout.json) lists every baseline route, all named aliases, implementation/test locators and inspected source SHA-256 values. Compare with [the original authorization plan](route-authorization-plan.md); the source review supersedes only the corresponding implementation observations, not its exit gates.

## Inventory reconciliation

- Baseline **112** Execution route patterns; current mounted **112**; **0 added / 0 removed**. AST extraction includes only controllers mounted in AppModule, not every file on disk.
- **54** concrete aliases behind `GET /api/v1/execution/manager/current/:operationId`, listed individually; these do not add 54 independent Nest route patterns.
- **10** adjacent Profile/ExecutionAccess identity-policy patterns are recorded separately; they are not Execution financial-data reads.
- Route dispositions on the frozen source: **43 scoped-wired**, **32 unqualified-source blocked**, **26 mutation/outside read census**, **8 static/public metadata-or-price paths**, **2 retired**, **1 legacy-gate preserved**. Static ADMIN catalogues remain authenticated/ADMIN-gated; this disposition does not mean anonymous public access. Two POST analytics previews are read-like blocked transports, explaining 26 rather than all 28 POSTs in the mutation category.
- “Scoped-wired” means implementation present, **not** every screen/alias/runtime receipt complete. Each route retains an OPEN final-receipt disposition. Public venue prices are public DATA, not financial account data or merely static metadata.

## Concrete gap found and repaired during this review

The generic named-alias action fallback was `alpha.read`; an ALL-business population bypasses row-anchor tests by design, so missing anchors alone did **not** prove technical/audit/custody aliases inaccessible.

The approved follow-up now gives all 54 aliases an explicit finite classification in [retained-operation-page.ts](../../../../apps/control-api/src/execution/retained-operation-page.ts). **21 business purposes** remain usable with exact qualified dataset/tuple/field policy. **33** technical/audit/custody/parent-only/public-market aliases await their own purpose and finite contract, and return `503 EXECUTION_NAMED_PURPOSE_NOT_COMMISSIONED` before raw rows, publication lookup or upstream—even for business-all. Explicit legacy behavior remains intact. This is a **closed authorization ambiguity but OPEN positive feature coverage**, not delivery of all aliases.

The code changes are limited to `retained-operation-page.ts`, `maximum-data-operation.service.ts` and `elp2-product-reads.spec.ts`. Shared Product relation-purpose behavior is unchanged; this classification applies only to named Manager operations. No blanket business-reader denial was added.

## Evidence, with limits

| Suite | Result | Meaning |
| --- | --- | --- |
| Product/named boundary | **54/54 PASS**, 2026-10-16 04:08:30 UTC; 11.06 s | Real service/policy logic with TEST_ONLY mocked storage/authority. Includes all 33 uncommissioned alias negatives, scoped Orders/account positives, cursor/revoke and hidden-peer metadata. **Not 54 positive source qualifications.** |
| Product/named compatibility follow-up | **59/59 PASS**, 04:59:21 UTC; 11.33 s | Five additional cases: two legacy dark-profile routes keep the source reason, V2 no-upstream, sticky activation/deletion delivery refusal, retained/local exact-workspace preservation. Pure service tests, not the N22 HTTP retake. |
| Resource360 boundary | **16/16 PASS**, 03:56:54 UTC | Strict V2 raw panels, linked shell, visible-only digest, per-profile isolation, source/authority fences. No actual TS evidence. |
| Resource V2 contract | **29/29 PASS**, 03:55:15 UTC | JSON Schema and generated runtime Zod, synthetic contract fixtures. No browser receipt. |

**Integration observations (read from logs; no tests executed by this census):**

- **Cell I: compile FAIL**, missing `ProfileReadPrincipal.viewerWorkspaceId`; primary fixed the optional trusted property.
- **Cell J: 277 PASS / 23 FAIL**, 12 suites passed and 2 failed. The failed attempt remains historical; Manager failures include the fixture isolation guard `EXECUTION_DATABASE_MUST_BE_ISOLATED`.
- **Cell K: build PASS, Manager 23/23 + Analytics 12/12 = 35/35 PASS, PostgreSQL restore including four scoped-access row digests PASS.** Log: `/tmp/elp204-scoped-read-k-20261016.log`; 04:33:22 UTC, tests 22.72 s. The JSON pins log SHA-256.
- **After K: host 24/24 PASS** — 10 new controller-context tests plus 14 existing UDB compatibility tests, 12.66 s, 04:38:21 UTC. These cover trusted `viewerWorkspaceId` passthrough in Resource/MaximumData/Paper/Profile/Composition and `private, no-store` before authentication/refusal on Execution paths. Log `/tmp/elp204-controller-context-20261016.log`, SHA-256 `2caa1ec2ef0e23cbd80d80ddae3c2c43ed89ba1c2f4ecccd3f317eca833e78e3`. Historical initial UDB **13/14** remains recorded: Canary expected four arguments, while the approved trusted viewer context legitimately adds a fifth; the stale test expectation was corrected before retake. This host receipt is separate from K's earlier source copy.
- **Normal hook attempt 1 FAILED:** contracts **574 PASS**; Control API **3281 PASS / 3 FAIL / 3 existing SKIP**, 302 files, 923.95 s. Preserved log `/tmp/elp204-normal-hook-attempt1-20261016.log`, SHA-256 `a26cc9fe247f2d89820eecebe45d5828c0217379671404cfaef08736a360bfdc`. The three compatibility regressions are not erased by subsequent fixes.
- **Compatibility fixes:** MaximumData nonlocal/current legacy scope no longer requires a retained workspace and preserves `N13B_PROFILE_NOT_ACTIVATED`; V2 still refuses before upstream. R0 adapter/task and Command Center separate Core identity from independently authorized source workspace and keep final fences. All three earlier hook integration regressions now pass in the affected Cell L suites.
- **Cell L: build PASS, six suites/86 tests PASS, one pure context suite/10 tests FAIL; overall attempt remains failed.** The10 failures were fixture isolation configuration; restore **NOT RUN**. Log `/tmp/elp204-compatibility-l-20261016.log`, SHA `23c722a0bcebc9998574284f49a53fe9c6945d160d6bd87c2a555b33e50de0cc`, 59.15 s. Do not relabel L as96/96 or restore PASS.
- **Separate host retake: context10 + adapter15 =25/25 PASS**, two files,12.12 s,05:14:24 UTC. Only pure fixture configuration changed after L; no runtime source changes or weaker isolation validation. Log `/tmp/elp204-context-adapter-pure-20261016.log`, SHA `7e2d1defe137353386dbadb5a550c10674b89ec0d2a80eab303d3ce789e0717b`. This separate receipt does not erase L's failure.
- **Final normal hook pending:** `/tmp/elp204-normal-hook-20261016.log`; commit remains contingent on successful normal hook.

**There is no 112-route HTTP/runtime proof in these results.** K covers two focused suites with isolated TEST_ONLY authority/storage, not actual TS membership or deployed behavior. Historical unit receipts are not promoted to one all-green current-candidate result.

## Actionable residuals, in priority order

1. **Core parent lineage:** current source now fences Incident, Paper Exit, standalone operation list/detail **and operational composition** independently, alongside inbox/R1/R2/Live, Canary/Sandbox/Live and Activation. V2 parent evidence is refused before unqualified reads, while explicit legacy gate checks remain. This closes the source-routing bypass, **not** positive V2 parent publication: exact current-resource lineage and finite field contracts remain OPEN. Task/command catalogue and action drawer were reviewed as static ADMIN metadata, not parent data or effective execution grants; their composition's source health/journal still uses its separate scoped readers.
2. **Named aliases:** qualify/open the 33 individually, with correct audit/technical/custody/public or parent-child semantics. For the 21 mapped aliases, retain exact field/identity tests and real source qualification; generic Orders proof is not all-alias coverage.
3. **Cache/revocation matrix:** match final source hashes to relevant focused PG/API leader/follower/cache/revoke/source-cutover receipts. Product59 and all3 affected integration regressions now pass; L's pure fixture failures and corrected host25 result remain separate. Final normal hook is pending. These focused results do not prove all112 routes at runtime.
4. **Static versus technical metadata:** runtime manifest now uses `coreSelectionMode`, refuses V2 mixed technical fields before service work, and rechecks explicit legacy delivery. Its **positive finite V2 technical DTO** remains OPEN; the previous unclassified source delivery is no longer the current behavior. Screen-contract `ready` remains role/catalogue readiness, not current effective V2 data permission. Static ADMIN task metadata is not an execution grant.
5. **Transport/exports:** remote Analytics/private Market Context and V2 stream are intentionally uncommissioned. No Execution export/download route exists in current112; do not invent a positive export receipt or count Research export as Execution coverage.
6. **Final contracts/consumer acceptance:** publish new typed reason and generated scoped DTO handoff. Source contract publication is not Claude browser acceptance, and synthetic qualification is not an actual TS grant.

The JSON provides controller method/source/test locators and per-alias action/null mapping. **89 referenced/shared source and test hashes** were refreshed at final source freeze, including the corrected pure Command Center fixture. Historical concurrent deltas, failed attempts and previous pins remain preserved. Cell L and separate host results are attached; primary must attach the final normal-hook verdict. No code, tests, production/dev/main, deployment, source activation, Git, database or runtime mutation was performed by this refresh; only these two census files changed. **Docs frozen for staging.**

## Next owner handoff

- **Backend:** primary attaches the final source-compatible focused receipt. Keep positive parent/alias/technical commissioning separate from implemented safety boundaries, and resolve or explicitly disposition every OPEN exit requirement; no whole-phase PASS is inferred here. No next phase automatically authorized.
- **Claude:** consume explicitly scoped/partial DTOs and the new safe commissioning absence; never turn an uncommissioned alias into empty/zero or use catalogue `ready` as a data grant. UI remains under the existing owner direction; no FE changes here.
- **Bidirectional request:** primary must acknowledge the 33 feature-blocked aliases and the final candidate/test impact; consumer acknowledgement remains pending.
