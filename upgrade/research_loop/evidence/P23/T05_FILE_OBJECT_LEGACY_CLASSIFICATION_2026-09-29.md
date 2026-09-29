# P23-T05 file/object/legacy route classification — 2026-09-29

This is a **GET-only negative and route-classification receipt** on the owned
P23 cell, not full T05. The clean deployed candidate was `eae7a40d`, with a
private `identity.json` reporting `dirty:false`; only loopback `:8096` was
contacted. No archive was created, no business byte was printed, and no
production/dev/shared-preview service or volume was changed.

Private 0600 receipt:
`/home/bobby/.local/state/portal-research-p23/20260927/runtime/t05-file-object-legacy-eae7a40d.json`,
SHA-256 `b49e52a7f300fd38d1c2d35be54ab3d7c5a6ee9f1a47487f8af8e0ce53b8928c`.
It retains per-response byte hashes and the real sealed artifact locator
without putting that locator or any response body in Git.

The existing Research Report controller publishes one file-serving route:
`GET /api/v1/quantbt/runs/:runId/report/exports/:jobId/download`. Its two
already READY JSON/CSV exports previously passed owner 200, foreign
workspace/nonmember 404, anonymous 401, `private,no-store` and exact byte
hash checks in [the clean runtime retake](./T03_T05_RUNTIME_RETAKE_2026-09-29.md).

For a real sealed artifact ID from the P23-owned run, bounded GETs with owner,
nonmember and no session gave:

| Guessed path shape | Owner | Nonmember | Anonymous | Meaning |
| --- | ---: | ---: | ---: | --- |
| `/api/v1/research/artifacts/{artifact}/manifest.json` | 404 | 404 | 404 | No raw Research artifact API |
| `/api/v1/quantbt/runs/{run}/artifacts/{artifact}/manifest.json` | 404 | 404 | 404 | No run-local raw artifact API |
| `/api/minio/{artifact}/manifest.json` | 404 | 404 | 404 | No object proxy API |
| `/artifacts/{artifact}/manifest.json` | 200 | 200 | 200 | All three bodies had the exact SHA-256 of public `/` HTML shell, **not** artifact bytes |
| `/minio/{artifact}/manifest.json` | 200 | 200 | 200 | Same public HTML shell hash, **not** object bytes |

`portal-minio` has only an internal Compose `expose: 9000`, no host-published
port, and no MinIO container was running in this P23 cell. These facts prove
that the tested gateway routes did not expose object bytes; they do not prove
every conceivable path or any separate direct MinIO endpoint.

The legacy `GET /api/runs/:run_id/export` is **not** the Research Report API.
It passes through the older facade to Python `export_bundle`, which removes
and recreates a run's `export/` directory on GET. Therefore a positive GET
would be a filesystem mutation, not a read-only T05 probe. Before probing,
`GET /api/runs` returned an empty legacy registry; the exact owned Research
`rrun_` was absent. Its legacy export then returned 404 to the owner and
nonmember, 401 anonymously. No ZIP-writing branch was reached. The first
attempt stopped at an expired owner session before issuing any export GET;
the two owned test sessions were renewed by ordinary password login with
their existing credentials, no reset, expiry override or privilege change.

**Remaining boundary:** this empty legacy registry cannot prove that a
nonempty legacy run is tenant-isolated. The legacy `RunManager` resolves
artifact paths without a Research workspace key, and the facade currently
allows authenticated read access to legacy runs. Do not relabel that surface
as a Research-authorized file API or call all T05 PASS. A nonempty legacy
export needs a separate product/security decision and safe read model; do not
exercise its mutating GET in this qualification cell. P23-T05 remains PARTIAL.
