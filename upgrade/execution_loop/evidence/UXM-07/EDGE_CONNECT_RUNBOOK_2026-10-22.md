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
Self-test on 2026-10-22 against the populated fixture BFF on loopback (`EDGE_ALLOW_FIXTURE_IDS=1`): 51 OK, 9 SCHEMA_VIOLATIONS, which are the doubles' known drift from the published schemas (ROUTES.md DRIFT rows). A connected run on a real Edge has NOT been done.

## 4. Per-endpoint switch-on checklist (one endpoint at a time)
1. Owner names the endpoint and its source (Source Truth Board row `EXISTS_MOUNTED` is Codex's call; a fixture result never changes it).
2. Run section 3 for that route on the real Edge: schema OK, reader accepts, `unknownReads` empty.
3. Diff the unread fields (`src/execution/v2/fieldcoverage`) and the field table in the register: decide per field whether a screen should draw it.
4. Serve it on a separate real-review lane (explicit upstream for that route only, no fallback to fixtures); browser check at 1280 and 660 with the visual harness against that lane.
5. Record the receipt (route, schema, reader, screens, date, SHA) in the phase packet; only then does the owner mark the source qualified.
Writes, commands, STREAM and Live are separate gates (C-7, C-8) and are not enabled by this procedure.

## 5. Facts the fixture simulates that the Edge must publish (or the screen keeps Not published)
See `SIMULATED_DATA_REGISTER_2026-10-22.md` sections 2 and 3, and the question BQ-FLEET-ALLOC (domain of per-alpha allocations/balances/position PnL).
