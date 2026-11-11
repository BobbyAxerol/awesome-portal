# C2 drain requires the selected delivery schema — 2026-11-05

**SOURCE CANDIDATE ONLY; NOT A RESTORE BARRIER.** The working files on
`docs/research-loop-plan` at committed HEAD `2faa8968f` are uncommitted and
uninstalled. No runtime, source authority, protected database or UI changed.

The preceding [delivery census](CORE_C2_DRAIN_DELIVERY_CENSUS_20261105.md)
treated a completely absent delivery schema as the legacy case. A restored
database could instead have lost a previously installed schema. The selected
C2 issuer composition now explicitly requires the delivery schema, and the
shared drain/recovery census fails closed if that requirement is pinned and
the schema is absent. The candidate keeps the setting in its private frozen
configuration; the original-recovery path reads the same candidate setting.
Legacy callers without the C2 selection retain the existing absent-schema
behavior. This setting is server-side, not an API field or a source grant.

## Focused evidence

- `npm test -- test/current-human-drain-counts.spec.ts test/c2-human-issuer-composition.spec.ts`:
  **28/28 passed**, including the actual composition selecting the required
  schema when its input omitted the option.
- `bash scripts/test-elp2-restore-inventory-rls.sh c2-drain-delivery`:
  **2 passed, 19 skipped** on disposable PostgreSQL. One case checks that
  missing delivery schema prevents the pinned candidate's drain and rolls
  back its authority mutation, while the legacy candidate retains legacy
  behavior. The other checks retained delivery and malformed/RLS schema.
- Focused strict TypeScript check for `current-human-drain-counts.ts` and
  `git diff --check`: exit 0. Full project typecheck and normal hook were not
  run. `bash scripts/execution-tracking-test.sh` passed. The disposable
  PostgreSQL runner reported successful cleanup; a read-only container-name
  check found no remaining container from that runner.

| File | SHA-256 |
| --- | --- |
| `current-human-drain-counts.ts` | `f334811c7d3ba2a10974a45d6f4b0f1e93119739e99283e7333130cb6da3e635` |
| `current-human-candidate.ts` | `0e51f4803851549af4b58cc688fef666553ddce87fcb24064a9a3f3b3b4ed2ce` |
| `restore-c2-original-recovery.ts` | `3467d87ce7c163fc70908ff5d5b84e5d1cbf70f656d90ebd64e2301036b1fd4c` |
| `c2-human-issuer-composition.ts` | `34e1c6be3eaf63af8cc2b1756bf5f7b2c4dc2b188415dba0cfa349a3290d2d92` |
| `current-human-drain-counts.spec.ts` | `bc8744a75b92c8f83b0399249e2b2f62c9af2b1a4106604cd8de9336abe81bb2` |
| `c2-owner-issuer-pg.spec.ts` | `af8870a5eddbc192cfb9ea7437466b7df3a781d596b9dbaff3033654081f80f2` |
| `c2-human-issuer-composition.spec.ts` | `3e5b1536933ce63e559a3d8ce9439a8e4e233e5af2387b6fa0dc5eb430719503` |
| `test-elp2-restore-inventory-rls.sh` | `a9f0b41a744f39fd10f878e9306c05b932db24b83802a0ad1a94db6334b5fb46` |

The configuration pin is not an independent installation marker: a restored
old binary or configuration could omit it. It does not prove physical fencing,
authority-store independence, schema/ACL provenance, post-snapshot terminal
and ACK completeness, or a safe cutover. V2 restore and P7 issuer remain
refused. Review the final source/dependency pins and migration on a
representative restore; do not reuse the earlier census receipt's old hashes
as current pins. No frontend contract or request is introduced.
