# P7 index-state observation — 2026-11-06

**Source/test candidate only. P7 remains fail-closed; this is not a schema
installation verifier, owner approval, A2 readiness or recovery proof.**
Checkout `docs/research-loop-plan` HEAD `2faa8968fddbde59b2e59525e334ba3d83886144`;
the referenced files are shared uncommitted WIP, not an installed runtime.

## Finding and change

The read-only P7 catalogue observer recorded `pg_get_indexdef()` but omitted
the PostgreSQL index lifecycle flags. On a disposable PostgreSQL instance,
`CREATE UNIQUE INDEX CONCURRENTLY` against duplicate rows failed and left an
invalid index. After removing the duplicate and `REINDEX INDEX CONCURRENTLY`,
the definition was unchanged, but the index became valid: **the old observer
returned the same digest for both states**. The regression reproduced before
the fix (6/7 tests passed; the fingerprint assertion failed).

The candidate observer now includes `indisvalid`, `indisready`, `indislive`
and `indcheckxmin` for ordinary and partitioned indexes. The digest input is
explicitly versioned `p7-catalogue-v2`: earlier catalogue pins are not silently
reinterpreted and must be re-observed before any future qualification. This
only exposes state drift; it **does not reject invalid indexes or qualify a
schema**, and does not close DDL races or establish owner/source authority.
The independent rights fingerprint is unchanged by this format change.

## Tests and cleanup

- `bash scripts/test-elp2-c2-p7-pg.sh schema-observation`: **7/7 PASS**, exit 0,
  isolated PostgreSQL; includes failed concurrent build, actual reindex, same
  index definition and changed digest. A first attempt asserted the wrong error
  message; it was corrected to check PostgreSQL error code `23505` before the
  before-fix reproduction. No full hook or runtime test is claimed.
- The test runner uses its own random internal network and ephemeral containers
  and cleans those resources on exit; it did not target any persistent DB.
  Configured aggregate bounds are 2 CPU / 1.5 GiB; actual peak usage was not
  measured. A read-only Docker listing after the run found no remaining
  `elp2-c2-p7` test containers. No frontend/API contract or runtime
  configuration changed.
- `git diff --check` and `bash scripts/execution-tracking-test.sh` exited 0;
  these are not integration or connected-source gates.

| Source | SHA-256 |
| --- | --- |
| `c2-p7-schema-observation.ts` | `97bc5c4cb93d7e23661e5c35f942694775536a85e0f7951ee0c26205a7efbc72` |
| `c2-p7-schema-observation-pg.spec.ts` | `6aaa00eed865d0283361b68009477152286e7156cdfbbb11605793d3f20d78b4` |
| `test-elp2-c2-p7-pg.sh` | `daa31f5783e43c1812dc355ab0a3e9e505aa54b3ca3b347ae544c9f3e15f60da` |

## Remaining work

Core must still independently qualify the installation, owner confirmation,
writer boundary and effective role, including DDL/authority races, before P7
can be commissioned. P7/A2, source-backed READ/STREAM, independent recovery
fences, actual restore and ELP2-10/11 remain open. Claude has no new frontend
action. Rollback is to leave the source candidate unmounted and retain the
existing fail-closed bootstrap; do not reuse a pre-v2 digest as a v2 pin.
