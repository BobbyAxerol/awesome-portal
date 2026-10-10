# UDB-03 — Consumer review fixes and persistence ownership

2026-10-11 (Asia/Saigon) · Bobby: “Bạn làm nốt đi” after Codex's review.
Base `1c01aefb`; same `docs/research-loop-plan` branch. Scope: three consumer
correctness fixes, four table classifications, existing retained banner kept.
No design/token/typography/baseline change; no UDB-04/source/command activation,
DB migration, backend rebuild, remote push or dev/main/stable rollout.

## Delivered fixes

1. Context binds to principal ID + session ID + displayed role. A changed
   identity immediately sees an unbound/loading snapshot, never the earlier
   owner's permissions. Session expiry/logout clears context; late responses
   are generation/abort-bound and discarded. Logout failure also clears the
   client context without pretending the server revoked a session.
2. Only an initially unsupported endpoint or explicitly unconfigured profile
   permits the legacy path. Workspace-hidden404 and401/403 are terminal;
   malformed/network/502/503/timeout do not enable stream or polling. Failed
   retained refresh keeps old observations but clears effective permissions
   to **not revalidated**, with recovery only on an explicit successful read.
   Fetch deadline10s; no automatic retries. Research job polling remains on.
3. Parser validates the published v1 object boundaries/required constants,
   all permissions and revocation fields, three distinct profile bindings,
   panel/count bounds, reason enums, nullable strings and integer UTC clocks
   in `[0, 8640000000000000]`. Invalid clocks cannot reach `toISOString`.
   Generated contract types constrain policy constants; wire contract did not
   change, so regeneration/new fixtures are not needed. Existing canonical
   fixture is reused. Fetch starts in the frame's layout effect, not render.

## Four table ownership decisions

| Table | Owner / ingress | Retention and authority |
|---|---|---|
| `execution_retained_imports` | PORTAL_PROJECTION / owner-operated import | Digest/parity/idempotency lineage, retain with dataset and restore evidence; no automatic delete |
| `execution_workspace_references` | PORTAL_PROJECTION / import after Core reference check | Domain-local FK receipt, NOT identity/membership authority; retain while referenced |
| `execution_store_migrations` | MIGRATION_ONLY / owner-operated schema migration | Keep version/input digest for database lifetime; no request/worker writer |
| `execution_retained_review_access` | PORTAL_WORKFLOW / owner grant/revoke CLI | Core GET grant valid at most30days; expiry/revoke checked per request. Keep tombstones/audit to prevent implicit reissue; not a cache or Research/Governance grant |

Reverse call graph: `migrateExecutionStore`, `importRetainedStore`,
`provisionRetainedReviewAccess` and `WorkspacesRepository.canReadExecution`.
Ledger rows_dev/rows_stable remain null: classification is not a new live census.
No row deletion, permission widening or new sweeper accompanies these decisions.

## Verification and exact preview

- Scoped vitest: **4files /91tests PASS** (retained context, actual producer→
  realtime hook, ownership ledger, AuthGate); `tsc -b` PASS. Required-field
  removal, bad permissions/counts/clocks, scope change/late response, logout,
  401/403/404/502/503/network/malformed/timeout and explicit recovery covered.
- Web-only `preview.sh build portal-web` + `up portal-web`; no DB/migrate/
  bootstrap/API/worker restart. Image
  `sha256:7fc8be4e966b4336d18ed221397a2ee96b6ee6ae6cbd01a03acb3a3e665db331`,
  bundle `index-CBEWyyfN.js`, healthy. API unchanged
  `sha256:ac7bb2950ecb2b3ec4ba0542f3725ea79205acc69deeeda25b668832a2ed0acd`.
- Build stamped parent1c01aefb + dirty=true because this grouped slice had not
  committed yet. Tracked frontend+lock inputs:1311files, SHA-256
  `6b36efacacf408aba5ae32d5aa6f8895aedcbe7d3ad2c13adb4082e8fc8a52dc`.
  No frontend change after build; final commit preserves these exact inputs.
- Real public preview: Alpha Fleet, Alpha360, Paper at1280/660 = **6cells**,
  zero document overflow. One context read per document. Static idle16s
  without periodic reads; no stream/bootstrap/business write.
- Explicit context-only fault injection on that real preview:503 and invalid
  clock retain banner/observations, clear unverified access, stay quiet16s,
  recover on Refresh. Injected401 enters the existing SESSION_EXPIRED gate;
  Sign in again rebinds/re-reads context. This is **real preview + injected
  failures**, not evidence of a real server outage or actual grant revocation.
- Page errors0, unexpected console0, stream0, external business-data calls0.
  Public Cloudflare injected7 analytics script requests; these are recorded
  separately, not hidden as zero external requests. Final logout201.

Private final raw receipt/screenshots:
`/home/bobby/.local/state/portal-udb03/consumer-refine-XCIA7qmv/`.
Raw browser.json SHA-256:
`f25b9ecebbe3811df8fe1344bda0a7e09fb011a75493d4a092f77eec52290a52`.
`browser-qualification.json` verifies raw fields and screenshot hashes without
modifying the original. Status **PASS_AFTER_PUBLIC_TELEMETRY_CLASSIFICATION**.
Reproduce qualification with
`node scripts/research-udb/retained-consumer-browser.mjs --verify-receipt <private-browser.json>`.

Preliminary helper failures are preserved: the first used an already-idle
navigation wait instead of awaiting the context response; the second toggled
an already-open Details shut. Their localhost logout403 was an Origin mismatch,
not a Portal auth bug. Final public-origin run passed all functional checks,
then the harness rejected configured Cloudflare analytics. Qualification
reconciles only that telemetry assertion, keeping the raw FAIL receipt intact;
no engine/browser rerun is needed for this classification. Repo helper fixed.

## Cleanup / evidence reuse / remaining boundary

All **3/3** owned test sessions REVOKED. Public run used normal logout201;
two failed-localhost sessions were uniquely matched by exact ID, username and
creation time, then revoked via existing SessionsRepository + auth audit in a
transaction. No revoke-all/password/account/global grant change. All ordinary
sessions, source snapshots/clocks and Research artifacts are outside changes.

C4: no owned test container remains; web rollback image `fe322076…` retained
30days, active API and UDB02 rollback protected. Evidence30days; no image/cache/
volume prune. Root168GiB free≈27% observation (above20% stop), RAM≈11GiB
available. **NO_ACTION_NEEDED** for this slice's bounded teardown.

Reuse original222API/68route cells only for their unchanged backend/data/
workspace assertions, not as a new68-cell HiFi acceptance. Claude's wrap fixes
and consumer receipt remain intact. Broad HiFi/RC-real positive/cross-loop
load/auth/DR acceptance remain the separately approved UDB-04 lane. No claim
of ProductGO, visual owner acceptance or source-live. Commit through the
normal grouped hook once; no hook bypass or unsolicited push.
