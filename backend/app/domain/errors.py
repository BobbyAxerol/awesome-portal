"""Errors whose meaning is useful at the API boundary."""


class NotFoundError(Exception):
    pass


class VersionConflictError(Exception):
    pass


class ValidationError(Exception):
    pass
