"""Private Research identity intake, not a listener, installer or authenticator.

The owning operator supplies the real, reviewed PM PortalHumanCandidate and
one pinned selection. No pool, credential, trust, username or scope comes from
the request. The SDK owns verification, Core ENTER, official identity resolution,
COMMIT and fenced recovery. No mapping is returned before its terminal ACK.
Importing this module performs no I/O and installs no route or business grant.
"""
from dataclasses import dataclass
import json
import re
from uuid import UUID

from services.portfolio_management.http_request_binding import http_request_digest
from services.portfolio_management.portal_human_candidate import (
    PortalHumanCandidate, SourceAttempt, SourceResolution, identifier,
)
from services.portal_execution_owner.identity.human import VerifiedHuman
from services.portal_execution_owner.identity.users import TSUser

INTAKE_PATH = b"/internal/elp210/current-human/identity"
REQUEST_SCHEMA = "pma.current-human-identity-request.v1"
RESULT_SCHEMA = "pma.current-human-identity-result.v1"
MAX_REQUEST_BYTES = 4096


class IdentityIntakeError(ValueError):
    """Closed record-free error; caller must not serialize underlying exceptions."""


def require(condition, code):
    if not condition:
        raise IdentityIntakeError(code)


@dataclass(frozen=True)
class ResearchIdentitySelection:
    issuer: str
    subject: str
    workspace_id: str
    workload_id: str

    def __post_init__(self):
        try:
            for value in (self.issuer, self.subject, self.workspace_id, self.workload_id):
                identifier(value)
        except ValueError:
            raise IdentityIntakeError("IDENTITY_INTAKE_SELECTION_INVALID") from None


def _object(pairs):
    value = {}
    for key, item in pairs:
        if key in value:
            raise ValueError("duplicate key")
        value[key] = item
    return value


def request_id(raw):
    """Closed body; its EXACT bytes, not reserialized JSON, bind the proof."""
    require(type(raw) is bytes and 0 < len(raw) <= MAX_REQUEST_BYTES,
            "IDENTITY_INTAKE_REQUEST_INVALID")
    try:
        value = json.loads(raw.decode("utf-8"), object_pairs_hook=_object)
        require(type(value) is dict and set(value) == {"schema_version", "request_id"}
                and value["schema_version"] == REQUEST_SCHEMA
                and type(value["request_id"]) is str,
                "IDENTITY_INTAKE_REQUEST_INVALID")
        identity = UUID(value["request_id"])
        require(identity.version == 4 and str(identity) == value["request_id"],
                "IDENTITY_INTAKE_REQUEST_INVALID")
        return value["request_id"]
    except (ValueError, TypeError, UnicodeError, RecursionError):
        raise IdentityIntakeError("IDENTITY_INTAKE_REQUEST_INVALID") from None


def request_digest(raw):
    request_id(raw)
    return http_request_digest("POST", INTAKE_PATH, b"", raw,
                               request_limit=MAX_REQUEST_BYTES)


async def resolve_identity(candidate, selection, human_token, raw_request):
    """One real reverse-current-human operation, never a generic user creator.

    Caller owns the candidate's real recovery listener/pool until every physical
    outcome is settled. Cancellation/UNKNOWN propagate; neither is a rollback.
    A returned identity grants no READ, STREAM, membership or financial right.
    """
    require(type(candidate) is PortalHumanCandidate
            and type(selection) is ResearchIdentitySelection,
            "IDENTITY_INTAKE_DEPENDENCIES_REQUIRED")
    nonce = request_id(raw_request)
    prepared = candidate.prepare(human_token, request_digest=request_digest(raw_request))
    attempt = prepared.attempt
    require(type(attempt) is SourceAttempt and
            (attempt.human_issuer, attempt.subject, attempt.workspace_id,
             attempt.environment, attempt.workload_id) ==
            (selection.issuer, selection.subject, selection.workspace_id,
             "paper", selection.workload_id), "IDENTITY_INTAKE_SCOPE_DENIED")
    async with prepared.authorized_identity() as (user, _conn, principal):
        require(isinstance(user, TSUser) and type(principal) is VerifiedHuman
                and (user.issuer, user.subject) == (selection.issuer, selection.subject)
                and (principal.issuer, principal.subject, principal.workspace_id,
                     principal.environment, principal.session_id, principal.session_revision,
                     principal.authority_revision, principal.token_id, principal.expires_at) ==
                    (attempt.human_issuer, attempt.subject, attempt.workspace_id,
                     attempt.environment, attempt.session_id, attempt.session_revision,
                     attempt.authority_revision, attempt.lease_id, attempt.expires_at)
                and user.status == "ACTIVE" and isinstance(user.user_id, UUID)
                and type(user.version) is int and 1 <= user.version <= 2**63 - 1,
                "IDENTITY_INTAKE_MAPPING_INVALID")
        mapping = {"ts_user_id": str(user.user_id), "mapping_version": str(user.version)}
    # This check must stay OUTSIDE the context: yielding a user is not COMMIT.
    terminal = prepared.resolution
    require(type(terminal) is SourceResolution and terminal.phase == "COMMITTED"
            and terminal.portal_acknowledged is True
            and type(terminal.source_receipt_id) is str
            and 0 < len(terminal.source_receipt_id) <= 128
            and terminal.source_receipt_id == terminal.source_receipt_id.strip()
            and not any(ord(c) < 32 or ord(c) == 127 for c in terminal.source_receipt_id)
            and type(terminal.source_receipt_digest) is str
            and re.fullmatch(r"sha256:[0-9a-f]{64}", terminal.source_receipt_digest) is not None,
            "IDENTITY_INTAKE_TERMINAL_UNCONFIRMED")
    return {"schema_version": RESULT_SCHEMA, "request_id": nonce, **mapping,
            "lease_id": attempt.lease_id, "attempt_id": attempt.attempt_id,
            "phase": "COMMITTED", "portal_acknowledged": True,
            "source_receipt_id": terminal.source_receipt_id,
            "source_receipt_digest": terminal.source_receipt_digest}
