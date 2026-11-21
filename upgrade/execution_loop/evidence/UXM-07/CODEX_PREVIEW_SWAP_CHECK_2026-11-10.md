# Research preview Control API swap — independent check

2026-11-10, approximately 12:38 UTC. **NOT SWAPPED.** This receipt records
read-only observations, not an authorization, a connected-source acceptance,
or evidence that a condition requiring a count of zero has passed.

## Candidate and rollback

- Research checkout: `docs/research-loop-plan` at
  `2faa8968fddbde59b2e59525e334ba3d83886144`; unrelated WIP preserved.
- Prepared image: `local/portal-research-preview-control-api:20261110-2faa8968f`,
  ID `sha256:a5e3968cf567124c34a0ce0fefc3496d7afcdd686c2fce2706d74a30329cb241`.
- Current container image: `sha256:d65e77860860dbf24fa5bbf6ded8bc6225b063ebc15578ed6a2dd8d1e92132f8`;
  the same image is preserved under the explicit rollback tag
  `local/portal-research-preserved-control-api:d65e77860860dbf24fa5bbf6ded8bc6225b063ebc15578ed6a2dd8d1e92132f8`.
- Claude's separate image/restore rehearsal and its limits are recorded in
  `CLAUDE_TO_CODEX_PREVIEW_SWAP_RECEIPT_2026-11-10.md` on the Claude worktree.
  The mutable `rf02` tag is not a rollback pin.

## Custody / G5

Authority has a null drain, no unresolved obligation, one committed lease and
finished mutations. The current-obligations view contains zero rows and no
native-read row has `source_settled=false`. The underlying history contains
20 rows: 18 `SERVED` and two `CANCELLED`, all source-reconciled. They are not
unresolved current work; they must not be deleted, force-closed or counted as
zero historical rows.

The active API has no native-core configuration or custody mount and is not
the identity-only bootstrap. Nevertheless the referenced CORE009 runbook
explicitly says `native_read_obligations 0` in block B and says stop before a
restart if its gates fail. Its procedures concern native commissioning, but
the prepared swap handoff explicitly treats G5 as a stop condition. A scoped
owner-approved disposition is needed before treating settled retained history
as compatible with this particular non-custody swap; IPC/callback custody and
any other concurrently running authority process must also be checked. This
does not amend the commissioning runbook or authorize source commissioning.

## Run/worker

The only queued row was `rrun_5e1185f847dddd418bdbd1f9f32b87c7`, queued and
pending since 2026-10-02, with null worker attempt and zero attempt rows. It is
the explicitly named historical undispatched fixture in
`scripts/research-preview/activation-custody.mjs`; preserve its rows.
Snapshot hashes in run/job/producer order were
`712468747ae7f698cca3d7a586bebf8c`,
`3d080bd27919935a3abd9c3f0f9051cd`, and
`5d89dffe0ba2c7110c841203339f9c9d`.

The Research JetStream `QUANT_JOBS` read-only monitoring endpoint showed zero
messages, zero pending and zero ACK-pending; the worker had no QuantBT child
at inspection. This is a point-in-time observation, not an admission fence.
Repeat the official idle/fixture snapshot and broker/worker checks immediately
before any change, preserve hashes and repeat afterward. The Portal API was
restarted by another actor at 12:16 UTC; this observation does not establish
who did it or whether a coordinated maintenance window is available.

## Schema and next action

Do not apply migrations 155–158 as part of this swap: the image booted on a
restored schema at 154, but routes that depend on these migrations have not
been verified. A fresh backup/TOC check immediately before the approved swap,
an exact image/compose/rollback check, a quiet admission window and runtime
smokes remain required. The two requested routes are dark/deny-all; a mounted
route does not establish a connected source.

## Owner-approved scoped swap — 2026-11-10

Bobby explicitly approved retaining the 20 source-reconciled terminal rows
for this **one** non-custody Research Control API restart. This is not a
change to the CORE009 commissioning gate. Immediately before the swap,
authority drain was null; unresolved obligations, current native obligations,
nonterminal/unreconciled native rows, open leases and open mutations were all
zero. The historical queued fixture still matched the three hashes above,
with no attempts. Research NATS showed zero pending/ACK-pending and no QuantBT
child was observed. These were point-in-time checks, not an admission fence.

A new private backup was captured at
`/home/bobby/.config/portal-research-preview/swap-20261110-codex-JGb2Vc/portal_control.dump`,
mode 0600, size 31,278,119 bytes, SHA256
`bbc159aa05a34d35150da6bbc10813a9aef87976b5f80c5100d45a0d35e7937e`.
`pg_restore -l` succeeded; the table-of-contents output SHA256 was
`6ff09efb64f95109e6785132247805a33cfbfd8483a97a4cfad76aecba49c520`.
The earlier Claude backup was independently restored; this newer dump was not
itself restored during this swap.

At 12:56:43 UTC, Compose recreated only `control-api` with `--no-deps
--no-build --force-recreate`; it runs the pinned image
`sha256:a5e3968cf567124c34a0ce0fefc3496d7afcdd686c2fce2706d74a30329cb241`
and is healthy. `portal-api`, worker and web container start times did not
change. Nginx configuration tested cleanly and nginx was reloaded to resolve
the replacement upstream. No migration was run: DB still reports 148
migrations through `1723680000154_execution-operation-health-publication`.
The old image is preserved under the rollback tag above. No restore was done.

Direct, unauthenticated requests to the new Control API returned 401 for both
the Approval Evidence and Equity Projection Source routes, and readiness 200;
both controllers appeared in startup logs. Via preview nginx, Research Run
Library and Execution overview returned HTTP 200 HTML, fixture health and API
readiness returned 200, and unauthenticated Research Run Library API returned
401. These are HTTP smokes, not browser or authenticated functional acceptance.

**Important routing limit:** the current hybrid nginx configuration sends all
`/api/v1/execution/` traffic to the fixture BFF. The public preview's test
Approval Evidence URL consequently returned fixture HTTP 200, and its Equity
Projection Source URL returned fixture HTTP 404; neither reached the new
Control API. No nginx routing change was made in this swap. Authenticated dark
responses and browser behavior against the mounted routes remain unverified;
do not report them as publicly reachable or source-connected.

After the swap custody remained clear, the queued fixture and all three
snapshot hashes were unchanged, and the NATS queue and ACK-pending count
remained zero. An `/api/auth/context` smoke invoked the preview auto-login
behavior and created one temporary preview session at 13:00:41 UTC. Its cookie
was discarded by the probe, so it could not be logged out with that credential;
its idle expiry is 13:30:41 UTC (absolute expiry 21:00:41 UTC). No token was
logged or retained and no session was manually edited or force-revoked.
