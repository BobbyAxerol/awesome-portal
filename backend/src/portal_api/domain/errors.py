from __future__ import annotations


class PortalDomainError(ValueError):
    """Base error for safe, user-facing domain validation failures."""

    code = "DOMAIN_VALIDATION_FAILED"


class DataSchemaError(PortalDomainError):
    code = "DATA_SCHEMA_INVALID"


class DateRangeError(PortalDomainError):
    code = "DATE_RANGE_INVALID"


class DatasetNotFoundError(PortalDomainError):
    code = "DATASET_NOT_FOUND"


class ParameterSpaceError(PortalDomainError):
    code = "PARAMETER_SPACE_INVALID"


class ArtifactPathError(PortalDomainError):
    code = "ARTIFACT_PATH_INVALID"


class StrategyExecutionError(PortalDomainError):
    code = "STRATEGY_EXECUTION_FAILED"


class QuantBTValidationError(PortalDomainError):
    code = "QUANTBT_VALIDATION_FAILED"


class WfoError(PortalDomainError):
    code = "WFO_FAILED"


class ArtifactSerializationError(PortalDomainError):
    code = "ARTIFACT_SERIALIZATION_FAILED"


class RunCancelledError(PortalDomainError):
    code = "RUN_CANCELLED"


class InternalPortalError(PortalDomainError):
    code = "INTERNAL_ERROR"
