# C2 Core: Research identity observation and O-1 wire gap

**READ-ONLY OBSERVATION, NOT AN A2 AUTHORITY OR P7 ACCEPTANCE.** Core queried
only the Research preview `portal_control` database in read-only transactions.
The database system identifier was `7688673963308855330`.

The current owner anchor is `usr_5a38d5dfb08b44748f5776fbe04a1434`, active,
not archived and not awaiting a password change. Workspace
`ws_06G19F61YB8CFR7TEWMS7HQ660` exists, with policy `REVIEWED` /
`OWNER_VERIFIED` and that same protected owner. These are real Portal facts,
not yet a verified binding to the pinned TS principal. The candidate Core
global authority revision observed was `111`, not draining; this is a
point-in-time value and **must be read again under the actual P7 fence**, not
copied into a publication. No session or step-up ID, credential or token was
read: counts were zero currently active owner sessions and zero currently
active owner step-ups. Scope approval alone does not create either.

The Research database did not have `elp210_c2_p7_candidate`,
`elp210_c2_fence_candidate`, `elp210_c2_delivery_candidate` or
`portal_restore_original_custody` schemas. The last belongs in a separately
qualified authority, not implicitly in the source database. No schema, grant,
owner, session, key, service or runtime was changed. These facts narrow the
remaining installation and owner-authentication work; they do not establish
source registration, an installed listener, or recovery readiness.

## O-1: exact-request handoff is still required

Core inspected the TS-verified revision `7be9428d` through the Edge host,
without changing the TS worktree. The original
`services/portfolio_management/operator_client.py` constructs command body
bytes as `json.dumps(body, allow_nan=False).encode()` inside `call()` and
then passes those bytes to `httpx`; query/path bytes are also constructed
there. `portal_human_candidate.py` checks a token against a digest recomputed
from the actual request. The commissioning owner's `command()` takes its
token **before** calling that builder. Consequently an abstract request or a
JavaScript reserialization cannot prove the exact TS wire request: for example
JSON whitespace differs. This is an integration gap, not a license to mint a
token for a caller-supplied digest.

**Required owner action through Edge:** agree and implement an immutable
prepare/send interface on the real operator path: before minting, the same
trusted original builder captures the exact method, raw path, query and body
bytes, binds them to the current authenticated owner and request identity,
and after minting sends those identical bytes exactly once. Recovery must use
the same original; a changed request or lost outcome cannot silently retry.
Core must complete a protected session/step-up, custody and actual delivery
fence before enabling the issuer path. No command, Live operation, synthetic
acceptance or bearer was created during this observation.

The full A2, post-snapshot terminal/ACK reconciliation, G2 and connected
acceptance remain open. B2 remains unsigned until real A2 acceptance and all
other prerequisites. This finding does not invalidate the static public
bundle or the separately delivered P8 public candidate.
