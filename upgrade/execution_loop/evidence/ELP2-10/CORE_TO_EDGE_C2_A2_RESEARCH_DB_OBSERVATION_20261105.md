# Core → Edge: C2 A2 Research database observation — 2026-11-05

**ACK remains NOT READY.** This supplements, and does not replace, the
[A2 disposition](CORE_TO_EDGE_C2_A2_DISPOSITION_20261104.md) whose SHA-256 is
`0b49241d9f826bda5cae93c1ae22692ff40f40ac13b14fcea357e8261007b2b6`.
It answers the priority request with current observations, not an A2 bundle.

At approximately 02:04 UTC, a read-only transaction on the Research preview
`portal_control` database found the `elp210_candidate` schema, an authority
singleton, the owner-anchor table and one owner-anchor row, the V2 grant and
proposal tables, and the native-schema receipt table. There were seven V2
grant rows and no V2 proposal rows. Only existence and counts were queried;
no subjects, grant facts, tokens, keys or credential values were exported.
These counts do **not** identify the C2 owner, prove its delegation or
acceptance, establish a current Research entitlement, or qualify any source.
The earlier [bootstrap observation](CORE_PREVIEW_BOOTSTRAP_COMPOSITION_20261104.md)
found the relevant native-composition configuration selectors absent from the
examined preview Node process. Schema presence must not be described as a
mounted or reachable C2 issuer/listener.

The current Core source has no matching `acceptance_id`, `delegation_id`,
`current_workload_ref` or `acceptance-evidence` implementation under the
Control API source/migrations as checked by exact text search. This does not
prove that no independent accepted record exists elsewhere; it means one has
not been established for A2 by this inspection. An accepted record must not
be fabricated from a database count or a received acknowledgement.

**Next actions, independently:**

1. Core: prepare and verify the actual Research-only issuer, TLS 1.3 endpoint,
   TS CSR/client certificate and private signer custody; return only current
   public pins and an installed-wire receipt. Identify an actual accepted
   delegation/record and signer before completing P7/P8. No ETA is asserted.
2. Edge, as sole source coordinator: reconcile P3's requested refusal of all
   RESOLVE after revocation with Core's authenticated, same-original terminal
   settlement, and P5's owner-only revision requirement with Core's
   conservative global authority revision. A resolution must not authorize a
   fresh ENTER after revocation or fabricate a rollback.
3. V2 recovery remains fail-closed in the legacy DR harness. Its independent
   current-authority checkpoint, quiescence, old-holder fencing and late
   custody/terminal reconciliation are not yet an operational barrier; the
   isolated logout retake demonstrated the stale-session risk. Do not use a
   matching STATUS ACK or a test fixture as cutover permission.

No certificate, role, grant, acceptance, DB row, configuration, runtime,
service, remote Git branch, command or Live capability was changed. B2
remains unsigned; do not proceed on an expired binding. Genuine Edge ACK,
READ/STREAM, financial/Approval, G2 and connected browser acceptance remain
separate and ELP2-10/11 remain open.
