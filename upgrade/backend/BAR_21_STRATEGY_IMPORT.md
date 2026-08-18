# BAR-21 — Strategy Import & Quarantine Ingest foundation

> **Version:** 0.1<br>
> **Status:** BAR-21 foundation complete (quarantine import + digest verify + status API)<br>
> **Updated:** 2026-08-17<br>
> **Unified phase:** U14 Alpha Registry, Import & Research Platform<br>
> **Guide authority:** `upgrade/STRATEGY_IMPORT_AND_RUNTIME_CONTRACT.md` (design note), v0.4 §9 Alpha Platform

## 1. Goal and scope

BAR-21 opens the *write* path of the alpha lifecycle without letting the
browser (or any request loop) execute arbitrary source, and without touching
the immutable source registry (`alphas.v1.json` stays deploy-time only):

- `POST /api/v1/alphas/import` is **source-reference only** (R11, per
  `STRATEGY_IMPORT_AND_RUNTIME_CONTRACT.md` §5: "Không chấp nhận import trực
  tiếp file từ browser"). The client submits `{alpha_id, version,
  artifact_relpath, expected_digest, git_ref?}`; the server reads a reviewed
  artifact that CI/owner already staged in the ingest inbox
  (`PORTAL_ALPHA_ARTIFACT_ROOT`) next to its `manifest.json`, validates the
  manifest against the alpha schema, verifies the digest and lands the
  package in a **runtime quarantine store** — never in the registry. No
  bytes travel through the browser and the server never fetches an
  arbitrary remote URI (no SSRF).
- `GET /api/v1/alphas/imports` lists every import (state, digest_ok,
  received_at, reason) so the Import Wizard can render progress and failure
  reasons.
- Imported alphas are **structurally non-executable**: they have no runtime
  strategy adapter registered and never appear in the public
  `/api/v1/alphas` document, so no run can be requested against them — the
  quarantine invariant holds even with a crafted request.

Non-goals (later U14 slices): hermetic build + lock/SBOM/secret/license
scans, contract/determinism/no-lookahead/QuantBT smoke gates, signed
publication, certification/promotion of an imported alpha, Import Wizard UI
(frontend), capability-gated preflight for imported alphas.

## 2. Locked decisions

1. **Registry immutability.** Import never writes `registry/alphas.v1.json`
   or its schema. The quarantine store lives under
   `PORTAL_ALPHA_IMPORT_ROOT` (default `artifacts/alpha-imports`), which is
   runtime data and never committed.
2. **Fail closed, always.** Invalid manifest, digest mismatch, already
   registered alpha/version and duplicate in-flight imports all reject with
   a 400 and a typed `PortalErrorResponse`; only a digest-verified,
   schema-valid, non-duplicate package becomes `QUARANTINED`.
3. **Digest binds identity.** The sha256 of the uploaded artifact bytes must
   equal `manifest.artifact.digest`; a mismatch stores a `DIGEST_MISMATCH`
   record (for the UI to show the reason) but grants nothing.
4. **No code execution.** The import handler validates and stores bytes
   only; nothing is imported, compiled or run in the request loop (per
   `STRATEGY_IMPORT_AND_RUNTIME_CONTRACT.md` §5).
5. **Public document stays clean.** Imported/quarantined alphas never
   surface in `AlphaRegistryDocument`; the UI reads `/api/v1/alphas/imports`
   for in-flight state.

## 3. Implementation evidence

- [x] `services/alpha_import.py` — `AlphaImportService.submit`:
  inbox path resolution (path-traversal safe, must stay under
  `PORTAL_ALPHA_ARTIFACT_ROOT`), jsonschema validation of the manifest
  (Draft 2020-12 + FormatChecker), sha256 digest verification against both
  the submitted `expected_digest` and `manifest.artifact.digest`,
  source-registry duplicate check (via `AlphaRegistry.get_version`),
  in-flight duplicate check, quarantine store layout
  `{import_root}/{alpha_id}/{version}/{import.json, manifest.json,
  artifact.bin}` (mismatch/invalid records are returned but never stored).
- [x] States: `PENDING_DIGEST`, `DIGEST_MISMATCH`, `INVALID_MANIFEST`,
  `ALREADY_REGISTERED`, `QUARANTINED` (typed `ImportState` literal).
- [x] `GET /api/v1/alphas/imports` (declared before `/{alpha_id}` so it is
  not shadowed) + `POST /api/v1/alphas/import` JSON body
  (`AlphaImportRequest`) with typed `AlphaImportRecord` /
  `PortalErrorResponse`; the former multipart shape is rejected (422).
  Mutation of the source registry remains impossible (no write path
  exists).
- [x] Wiring: `create_app` instantiates `AlphaImportService` from
  `PORTAL_ALPHA_IMPORT_ROOT` (default `artifacts/alpha-imports`).
- [x] `python-multipart` added to backend dependencies.
- [x] BE suite: `15` import tests (source-reference service matrix + JSON
  endpoint flow + multipart-rejected) + full Portal backend regression
  `395 passed, 1 skipped`; contracts snapshot + OpenAPI regenerated;
  workspace verification passes including the protected strategy hash.
- [x] R10: second read-only fixture `visual-baseline-run-running/` (RUNNING,
  mid-study, trimmed console/trials) produced by the same exporter.

Technical debt and rollback:

- Imported artifacts are stored byte-for-byte but never scanned/built; the
  hermetic build + scan stages are the next U14 slice.
- Certification (quarantine → registered) has no command yet; until it
  lands, every import stays `QUARANTINED` by design.
- Owner-only enforcement awaits the U07/BFF auth wiring; until then the
  mutation endpoint is reachable only behind the loopback-bound public
  gateway (no public port, `deploy/nginx/portal.conf` loopback binding).
