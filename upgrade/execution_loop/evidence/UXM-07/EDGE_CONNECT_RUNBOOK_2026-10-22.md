# How real Portal Edge data reaches the Portal (fixture to real), 2026-10-22

Level: SOURCE_ONLY / FIXTURE_VERIFIED. Nothing here connects, commissions or accepts a source. It is the procedure and the tools that make a later connection checkable.

## 1. One port, two backends
The screens read only through `ExecutionApi` (`src/execution/api/ports.ts`). The product route always builds it with `createHttpApi` (`ExecutionPreviewRoute.tsx`); there is no fixture/real flag in the frontend and a fixture is never substituted when a real read fails. "Fixture" is a different server answering the same HTTP routes:
- Preview: nginx sends `/api/v1/execution/**` to the fixture BFF (`deploy/research-preview/compose.fixture-bff.yaml`, banner "FIXTURE DATA"). Off: `scripts/research-preview/preview.sh fixture off` then `preview.sh up`.
- Real: the same routes answered by the Portal gateway/control-api, which reads Edge. Nothing in a component changes.

## 2. What the Edge must return (the contract)
Every read has a published JSON schema (`packages/contracts/schemas`, generated types in `packages/contracts/generated`). The fixture BFF is judged against them (`src/fixtureBff`, `apps/portal/fixture-bff/ROUTES.md`). The Manager dataset keys the screens already look for, and the ones the populated lane simulates, are listed in `SIMULATED_DATA_REGISTER_2026-10-22.md`; a key the Edge publishes under the same name, unit and partition rule is drawn with no code change.

## 3. Checking a real Edge (read-only)
`src/edgeConformance/edgeConformance.test.ts` (off unless `EDGE_BASE_URL` is set):
```
EDGE_BASE_URL=https://<edge host> EDGE_I_UNDERSTAND_READ_ONLY=1 EDGE_CONFIG=./edge.config.json \
EDGE_REPORT=./edge-report.json npx vitest run src/edgeConformance
```
`edge.config.json`: `{ "headers": {"cookie": "..."}, "workspaceId": "...", "environment": "paper", "ids": {"<fixture id>": "<real id>"} }`. GET only, one request per distinct URL, at most 150, spaced 250 ms; fixture ids never go to a real host (reported SKIPPED_NO_REAL_ID); the report keeps no header or token. Per route it records status, schema violations (same checker as the fixture), whether the real reader accepted the body, unread fields and fields the reader read that the schema does not publish.
Self-test, retest 2026-10-23 (lane `4997d8e7b`; fixture BFF bundle from that worktree on a loopback port, `EDGE_ALLOW_FIXTURE_IDS=1`, not the preview): **89 OK, 0 SCHEMA_VIOLATIONS, verdict PASS**. Before the fixes the same probe gave 80 OK / 9 SCHEMA_VIOLATIONS on 2026-10-23; the earlier note of 2026-10-22 said 51 OK / 9. The OK count differs between those two runs for a reason that was not investigated; the nine violations are the constant finding. This is a fixture-conformance result: it proves the doubles match the published schemas, not that a real Edge does. A connected run on a real Edge has NOT been done, and the 150-GET checker must not be pointed at the finite native08 source.

The nine dispositions (all FIXED against the published contract; negative fixtures untouched):

| # | Route | Disposition | Note |
|---|---|---|---|
| 1 | GET `/screen-contracts` | FIXED | 23 screens in the double. FINDING for Codex: the real control-api catalogue serves 25 screens against a schema maximum of 23; the double drops the two BR-EX-72 list screens. The real server still exceeds its own schema. |
| 2 | GET `/alphas/{id}/stage-drift` | FIXED, opt-in body | v2 exact decimals served with `?numeric_format=DECIMAL_STRING` (as the real control-api does); the default URL stays the v1 JSON-number body the reader consumes, and is not judged by a v2 schema. |
| 3 | GET `/resources/portfolios/{id}` | FIXED, opt-in body | v2 body for workspace `ws_TEST_SCOPED_V2`; the default body is the legacy one the screens read (no published v1 schema exists for it). |
| 4 | GET `/resources/accounts/{id}` | FIXED, opt-in body | same |
| 5 | GET `/resources/bindings/{id}` | FIXED, opt-in body | same |
| 6 | GET `/governance/approvals` | FIXED | published inbox envelope (actor, read_truth, counts, page). |
| 7 | GET `/governance/approvals/history` | FIXED | actor, read_truth, applied filters/sort. |
| 8 | GET `/governance/approvals/{id}/r1` | FIXED | published R1 envelope; the loose `sla` and `expected_version` fields are no longer served (the published Approval has none), so a screen shows an absent R1 SLA age as absent. |
| 9 | GET `/governance/waivers` | FIXED | read_truth, non-empty applied sort, filters from the query. |

Open for routes 2-5: making the DEFAULT URL v2 needs reader and screen changes (not done; ACCEPTED_FOR_IMPLEMENTATION). Hardening of the probe itself (limits, timeout, non-JSON 200, verdict, `EDGE_REQUIRE_PASS=1`) is in `edgeProbe.ts` (`ea537a9ba` to `15d73578f`); a report-only success is not a source-conformance verdict.

## 4. Per-endpoint switch-on checklist (one endpoint at a time)
1. Owner names the endpoint and its source (Source Truth Board row `EXISTS_MOUNTED` is Codex's call; a fixture result never changes it).
2. Run section 3 for that route on the real Edge: schema OK, reader accepts, `unknownReads` empty.
3. Diff the unread fields (`src/execution/v2/fieldcoverage`) and the field table in the register: decide per field whether a screen should draw it.
4. Serve it on a separate real-review lane (explicit upstream for that route only, no fallback to fixtures); browser check at 1280 and 660 with the visual harness against that lane.
5. Record the receipt (route, schema, reader, screens, date, SHA) in the phase packet; only then does the owner mark the source qualified.
Writes, commands, STREAM and Live are separate gates (C-7, C-8) and are not enabled by this procedure.

## 5. Facts the fixture simulates that the Edge must publish (or the screen keeps Not published)
See `SIMULATED_DATA_REGISTER_2026-10-22.md` sections 2 and 3, and the question BQ-FLEET-ALLOC (domain of per-alpha allocations/balances/position PnL).
