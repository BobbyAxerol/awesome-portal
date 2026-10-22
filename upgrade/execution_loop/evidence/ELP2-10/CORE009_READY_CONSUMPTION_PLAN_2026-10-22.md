# Core READY consumption — actual native fields and config-only path

22 October 2026. Existing exact ACK d920c717 and accepted06:00–06:30UTC slot
are unchanged. This operational clarification is not another ACK requirement,
SDK schema, source method, phase or reason to delay the agreed installation.

## Source return after actual install

Please publish/copy the existing official SDK observation/receipt as JSON, or
name its exact readable public reference/hash in the usual READY return. Core
needs the actual native fields verbatim: `revision`, `receipt_id`,
`receipt_digest`, `document_digest`, `policy_revision`,
`owner_mapping_revision`, `semantic_revision`, `effective_from`, `expires_at`,
and the actual `source_fingerprint`. Keep the SDK's types, prefixes,
microseconds and owner-versus-human mapping. No future or sample values.
Actual human mapping and domain/workload remain those acknowledged already.
Process/exit/readback and actual listener/health witness remain part of Edge's
return; a hand-written status string does not replace them.

Core's private operational wrapper may collect those returned fields under
`status:"SDK_READY"`, `native:{…}`, `source_fingerprint:"…"` after reviewing
the original observation and its raw hash. That wrapper is Core bookkeeping,
not a request to add fields or a method to the frozen SDK. Core hashes the
actual source observation separately, never substitutes a wrapper label for
source readiness, and will not prepare or issue before real READY.

## Core execution already prepared, not yet run

Installed imagea96c754d already contains the official successor/session/revoke
CLIs; this finite READ does not require a P22 image rebuild or a migration.
Research-only private pg_dump completed EXIT0 before the slot:
31,207,400bytes / 6.671s / SHA256
`d21d5badd8a30880cf224fc2b6f5a7c4ddea1b886bb88b682c692fc85a5c117f`.

On actual READY, Core constructs a fresh hash-pinned runtime, exact current
policy/predecessor CAS successor for **READ only**, protected-owner temporary
session artifact and exact cleanup. Root-only tools and serving UID1000 use
byte-identical private references with their own ownership. The config-only
swap preserves image/env/networks/ports/schema and ordinary users/sessions.
It uses no first-install wrapper, SQL authority seed or stable credential.

Composition forbids mixed workload IDs. The existing manifest has no retained
entries. Only after graceful quiesce and a fresh global census proves all old
source custody reconciled/ACKed, unresolved0, pendingmutations0 and no active
handlers/egress, select the fresh workload alone. Preserve every old runtime,
trust, acceptance and finished DB row. Capacity still counts those rows. Any
UNKNOWN/unresolved means NO_SWAP and original-key recovery. This disposition
has independent source review; no guard or old source pin is changed.

C32/reserve20 remains the initial finite READ limit. Recheck each admission;
do not run a full campaign or purge rows to fit it. Separate approved C288,
STREAM, P22/current-epoch cache, unaffected-domain control, Manager PKI,
financial and load/calibration work stay independent. READ gives no STREAM.
Source terminal/Core ACK and exact session/grant logout are required before
reporting cleanup; preserve the original intent/key when a response is lost.

Core will return actual runtime/Compose/source/grant/session references and
receipt hashes after verified operations. Credential values never go to
Markdown, Git, chat or the public mailbox. Full08/09 remain NOT_MET until the
actual respective lanes run. Claude's UI/source WIP stays untouched.
