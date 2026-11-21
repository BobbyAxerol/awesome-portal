# Paper authority and source transport follow-through — 27 October 2026

**Actual source inspection; no membership grant or runtime connection.** Bobby
asked Core to identify the correct Paper portfolio/rights and use the official
writer when its prerequisites exist, while designing a safe PM→PostgreSQL path
without changing the shared DB configuration. Scope is the existing selected
Research identity, source and Paper environment, not Live or commands.

## Bounded actual source observations

- Source is the same `live_data_executor` and installed Research reader in
  [actual installation](RESEARCH_READER_INSTALL_OBSERVATION_2026-10-27.md).
  Metadata/business checks below used peer-psql on the source host, explicit
  `BEGIN ... READ ONLY`, statement timeout 2s and `ROLLBACK`; no balances,
  secrets, credentials, user row dumps or writes.
- For the exact Research Portal user/workspace and Paper mode, a query of
  `pm_business_read.heads` joined to its current revision returned one profile
  `PAPER_BINANCE_USDM`, but its current revision is **REVOKED**. It is historical
  information, not a portfolio selection, live acceptance or transferable grant.
- Source `pm_membership.memberships` joined to `pm_membership.policy` v1
  produced aggregate counts **0 Paper heads, 0 Paper root heads, 0 Paper roots
  belonging to the protected owner**. This is a source-wide Paper membership
  count at that snapshot, not a claim about another database or future state.
  A separate current-root/revision query returned no eligible owner root.
- A bounded lookup of non-null Paper `portfolio_id` in
  `pm_capital.recipients` joined to `pm_capital.buckets` returned zero rows.
  This does **not** prove no Paper portfolio exists in other TS/Edge sources.
  Neither that result nor the old profile identifies a portfolio to grant.

## Actual writer and missing authority

`MembershipRepository.set_membership` in PM source delegates to
`membership_contract.change_membership` under its prepared authority transaction.
The requester must have an active same-scope `membership.manage` lineage rooted
in the protected owner; the selected parent must be the requester's membership,
the requested capabilities must be within its delegable ceiling, and
self-elevation/protected-owner changes are refused. The actual native-current
reader additionally requires `report.read` in the selected membership. STREAM
remains independent; `report.read` alone is not a `stream.subscribe` grant.

`membership_repository.py` explicitly states that root/policy bootstrap and
real grant provisioning are absent. `change_membership` says root changes need
a separate owner-only workflow. The successor `ScopedManagementCommands`
source labels itself not installed; source existence is not commissioned
command authority. With no protected Paper root, `SET_MEMBERSHIP` cannot
legitimately create the first root or a descendant. No official bootstrap
runtime/receipt or exact target portfolio was found in the inspected paths;
this is not a claim that no such workflow exists anywhere else.

**Action through Edge to PM/TS owner:** identify the current Paper portfolio
source/ID and the owner-only root bootstrap/import operation, trusted original
and authenticated owner actor; report their real runtime/pins and receipt.
Then use the existing prepared writer for only the selected Research target and
the minimum read capabilities supported by its parent, with audited scope,
validity and independent STREAM approval. Never insert SQL rows or treat the
revoked old profile as a new authorization. No grant was attempted here.

## Safe transport design; not commissioned

The source has PostgreSQL SSL disabled, local/127.0.0.1 HBA `trust`, remote HBA
SCRAM, and host port bound to `127.0.0.1:7654`. The PM runtime rejects plaintext
non-loopback. A proposed direct plaintext network probe was rejected by the
execution environment and **was not run**; do not retry it indirectly.

Options to assess with Edge/source owner, before a real connection:

1. Preferred when operationally supported: use an approved source-side TLS
   endpoint with independent Research credentials, pinned CA/hostname/peer and
   isolated pools. Enabling TLS or changing shared PostgreSQL/HBA may affect
   existing consumers and needs its own reviewed maintenance/change package;
   it was not changed in this task.
2. A truly host-local Unix-socket or source-local TLS proxy is a candidate only
   after the owner demonstrates isolation from the database's permissive local
   trust, peer identity enforcement, encrypted remote hop, exact listener and
   egress boundaries, tests, resource limits and teardown. Host-loopback port
   publishing by itself does not prove the complete path is local/encrypted;
   do not use shared source-container network namespaces, stable credentials,
   Docker-administrator access in PM, or a plaintext bridge as a shortcut.

Fresh candidate trust bundles exist but are uninstalled. No listener, tunnel,
new SCRAM credential or SQL role grant was created in this follow-through.
Until a secure transport and a genuine original are commissioned, connected
discovery, ROOT/CURRENT, READ/STREAM and ELP2-10 remain NOT_MET. If the existing
bounded Research reader expires before use, disable its admission via its
reviewed rollback and select a fresh finite window; do not extend old sessions.
