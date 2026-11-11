# Core C2 — seal, approved scope and P8 progress (5 November 2026)

Disposition: **A2 NOT_READY; B2 NOT_SIGNED; recovery NOT_READY.** This is a
partial owner return, not an A2 bundle, acceptance, installation or activation.

## Source decision and exact owner scope

The `EDGE_RELAY_TS_C2_SEALED_20261105.md` snapshot, SHA256
`4a1157da632bb89586af11657b31f71aadecc36024929a0084f0d45b15f3d75c`,
reports `C2_SEALED` for TS revision
`5b7b6b866b9109fe08e5655f9651500572df088a`, source SHA256
`7d26e1491572e0badd33de2b235cf0800fb8cfa77ee22749872303967c55a044` and
image `sha256:1201c5a4f49cf006cfa3048051faf858b39d9c1fd80dcc8c7e56d63a549ca7b3`.
Core also read the appended seal in TS's `ts-to-portal/TS-ANSWERS.md` through
the Edge host; that file is append-only and its observed SHA256 was
`ad50194a72c784b2c195c9703f4cad68c0511292de8897475ba1d18dc93de66b`.
The Edge delivery status is timestamped 05:24:51 UTC, whereas the seal heading
in the delivered answer says 05:30 UTC. The ordering of those timestamps needs
Edge/TS clarification; no installed or verified TS image is implied.

Bobby approved **READ + HISTORY only** for `paper-portfolio-g1` and
`paper-root-g1`. This is scope approval, not a signed-in owner session,
source-verified identity mapping, P7 record, delegation or publication.
The staged B1 bytes are unchanged (SHA256
`409542f42012120f994f32600c7632ca3a13cfce8210c685218956a753de31fd`).

## P8 — dedicated preparation key

Core generated one new, separate Research Ed25519 P8 preparation key in
protected local storage; checked key validity, matching PEM/JWK public key,
file permissions and filesystem sync. The private key is not included in this
document, Git, or the public return. Public preparation pins:

- kid: `p8-research-8181cfdfc9858f0e`
- public SPKI DER SHA256:
  `8181cfdfc9858f0ea8bc80dff02ac16570299141eac48cf721b379543652235d`
- public JWK file SHA256:
  `0ad65ab92e0d64a62222b4a0e8980311dd51f0ea7fc7ee08246aebc2032576dc`

The key is different from the A1 source-proof key. It is **not yet registered
or accepted**, is not proven independent of the as-yet-unselected issuer key,
and has not signed B2. Independent protected custody/backup and deployment
binding still need qualification. Do not treat these provisional pins as a
delivered A2 signer or replace the key silently after A2 acceptance.

## A2 and recovery progress

An unmounted issuer composition candidate verifies pinned issuer/JWKS,
certificate and CSR, audience and workspace. Its focused tests passed 12/12;
owner-issuer tests on disposable PostgreSQL passed 5/5 and targeted source
TypeScript passed. The existing preview image lacks the OpenSSL binary used by
the preflight: the candidate is not runnable in that image. Matching identical
HTTP request bytes is not a semantic same-original fence; delivery custody,
ACK/recovery and real owner mapping remain incomplete. No listener was mounted.

An isolated checkpoint store passed 4/4 unit and 4/4 two-cluster PostgreSQL
tests, but it is not yet an independent trusted authority, old-holder fence,
writer-at-commit barrier or late terminal/ACK reconciliation. Earlier detailed
pins and cleanup are in `CORE_C2_CHECKPOINT_AND_B1_STAGING_20261105.md`.

TS subsequently states that fresh ENTER is refused on revocation while a
source-authenticated RESOLVE of the **same** original must be accepted,
including a `ROLLED_BACK` tombstone for a refused/unrecorded ENTER; UNKNOWN
remains unresolved and the ACK shape is exactly `{replayed, phase}`. Global
revision is accepted fail-closed for C2 Paper, with explicit change announcement
and republishing requirements; owner-scoped revision remains required before
multi-principal or non-Paper use. These are source requirements to implement
and test, not completed Core commitments.

## Next actions and owners

1. **Core:** implement and test P3 exact-original settlement, revision
   announcement/republication, qualified identity/session-bound P7,
   independently held checkpoint and recovery barriers. Prepare correct
   Research listener trust and verify runtime; publish installed source/image,
   config, schema and public-key pins only when actually true.
2. **Edge/TS:** clarify seal/status timestamp ordering; provide the qualified
   source mapping/proof and exact original/terminal/ACK evidence through Edge.
   The TS C2 database is not yet installed, so no current head is inferred.
3. **Core:** only after A2 is pinned and acceptance is genuine, sign B2 once
   with that exact P8 key and durable one-time custody; no one-hour delivery
   promise is made while the prerequisites remain incomplete.

Core's next progress checkpoint is **06:00 UTC, 5 November 2026**. This is
not an A2 delivery deadline: Core cannot yet give a defensible completion time
for runtime trust, qualified owner/source binding and P7. Edge can continue
its independent work without waiting for that checkpoint.

No credentials, session cookies, secret values, runtime installation, grant,
live command, production mutation or Git push are part of this return.
