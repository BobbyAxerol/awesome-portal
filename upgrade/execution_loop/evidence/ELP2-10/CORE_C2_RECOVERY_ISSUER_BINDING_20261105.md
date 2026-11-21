# C2 recovery: persist the original issuer — 2026-11-05

**SOURCE_ONLY; A2 and recovery V2 remain NOT_READY.** No runtime, source
grant, database, production migration or credential was changed. Core base is
`2faa8968fddbde59b2e59525e334ba3d83886144` plus uncommitted candidate/WIP.

## Problem and change

The lease previously retained subject, workspace and request binding but not
the human-token issuer. Recovery rebuilt `human_issuer` from the current
process config; after a restart or issuer rotation this could describe a
different original. The candidate now stores the issuer in the same transaction
as ISSUE, checks it at revalidation/ENTER and exact-original recovery, and
rechecks it in the final recovery snapshot. Existing lease immutability guards
also cover the new field. Generic recovery refuses a returned unresolved row
with a missing or changed issuer instead of silently inventing one.

The fresh candidate installer includes nullable `human_issuer`; the separately
prepared `c2-human-issuer-upgrade-candidate.sql` is only for an older candidate
schema and deliberately leaves historical rows NULL. It is not a numbered
production migration, has not been installed and does not authenticate or
backfill historical issuers. Old processes must be stopped and independently
fenced before any deployment; this change alone does not prevent an old process
from inserting an unbound row. Historical originals without proof remain
quarantined, not released or assigned the current issuer.

## Focused tests and pins

- Disposable PostgreSQL issuer/upgrade suite: **14/14 PASS**, exit 0;
  includes issue binding, refusal after issuer change, preserving a simulated
  legacy row through the additive candidate upgrade, revoke, same-original
  restart and session/workspace negatives. Test-only keys and cells.
- Disposable PostgreSQL/mTLS recovery plus observation unit suite: **7/7
  PASS**, exit 0; includes issuer change/missing historical issuer, issuer
  immutability, exact-original lookup beyond 128, source response race and
  final snapshot comparisons. Synthetic source and ACK, not connected proof.
- Runner `scripts/test-elp2-restore-inventory-rls.sh`, SHA-256
  `d75b7a724936af24f3a7bccd7cf5fce9d1565f6dc85aa9a39d4d24a85b0dcc62`;
  each disposable cell used aggregate 2 CPU / 1.5 GiB and the runner's cleanup.
- `current-human-candidate.ts` SHA-256
  `49a67f048aebccbb99e8e7fcf327973969b351791b2a3c010e5646e75e54617f`;
  fresh installer SHA-256
  `6966500b8db1213449eaafbf19d9d3dbd1c338ffc7350e6ad4c968cf19684dab`;
  upgrade candidate SHA-256
  `52d1170b49b2597a3fec6d6ed290b2a128ac95686d2e582a77e3a19ab218cc7e`;
  recovery orchestrator SHA-256
  `3994925fe3a379098d90bc9e3fea92d87e7b3cc75a3f8874de52406b4bb09837`.
- Issuer test SHA-256
  `595ee7614924e910c5a5bdb04afa821983e718139b828ae35c8b74d0478b37ab`;
  PG recovery test SHA-256
  `b79a22a1bd10ab2a87a76bd5e7c3432d13ee4ebe5f16de79ef072bc59c33f5b0`;
  recovery unit test SHA-256
  `a5f866e9e1514d73c03544de0da59f51b8f07d0f0ea546cfa5b0e39c6a281177`.

These tests do not establish authentic event INSERT provenance, independent
failure-domain checkpoint, complete source terminal/ACK history, real receiver
delivery, a source fence or recovery cutover. The earlier combined semantic
typecheck exhausted the cell; final typecheck and normal hook remain open.
The issuer persistence also does not establish a real identity mapping or P7.
No B2 signature, push, UI change or release is claimed.
