"""Errors whose meaning is safe and useful at the API boundary."""
from __future__ import annotations


class DomainError(Exception):
    """Base error with a stable public code and HTTP status.

    Domain and infrastructure code never need to know about FastAPI.  Keeping
    the mapping here means every route returns the same small error envelope
    and callers can reliably distinguish a stale write from an invalid field.
    """

    code = "domain_error"
    status_code = 400


class NotFoundError(DomainError):
    code = "not_found"
    status_code = 404


class VersionConflictError(DomainError):
    code = "version_conflict"
    status_code = 409


class ValidationError(DomainError):
    code = "validation_error"
    status_code = 422


class ReadinessError(DomainError):
    code = "not_ready"
    status_code = 503
