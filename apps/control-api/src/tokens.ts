export const CONTROL_API_CONFIG = Symbol("CONTROL_API_CONFIG");
export const CONTROL_API_POOL = Symbol("CONTROL_API_POOL");
/** Portal-owned Execution data only. Identity/Governance stay on Core. */
export const EXECUTION_DATA_POOL = Symbol("EXECUTION_DATA_POOL");
/** EDS-06 transaction-bound writer; never a browser or source transport token. */
export const EXECUTION_DURABLE_MIRROR_WRITER = Symbol("EXECUTION_DURABLE_MIRROR_WRITER");
