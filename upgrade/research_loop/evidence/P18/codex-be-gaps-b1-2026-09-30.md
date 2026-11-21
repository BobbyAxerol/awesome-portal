# B1 P18 backend receipt

- AN-21: new P04 report seals use the issued Hub v3 `OOS_SHARPE` metric instead of a hard-coded absence. Already sealed report cores remain immutable. Focused Report 11/11.
- X7 / WS-LEAK-01: every READY report export status now carries the authorized workspace in `download_href`, including the worker-claim response. Example: `/api/v1/quantbt/runs/run_p18/report/exports/rpex_01J00000000000000000000000/download?workspace_id=p18-workspace`. Download still rechecks workspace membership and actor ownership. Report + W6a 33/33, Control API build passed.
- `ResearchReportExportStatus` stays v1; OpenAPI and Zod now require the scoped URL, canonical export fixture is generated for `ws-w6a`.

No production runtime, frontend, or source data changed.
