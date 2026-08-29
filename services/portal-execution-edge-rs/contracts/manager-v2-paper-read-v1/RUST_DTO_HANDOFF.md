# Manager V2 Rust DTO Handoff

The canonical wire authority is `manager-v2.openapi.json`. The following is
the required Portal-side shape; it is intentionally a typed facade client
boundary, not a PostgreSQL model or direct database interface.

```rust
use std::collections::BTreeMap;

pub const MANAGER_V2_CONTRACT_VERSION: &str =
    "trading-system.portal-execution.manager-v2.v1";

pub struct ProfileId(pub String); // only PAPER_BINANCE_USDM is active
pub struct OpaqueCursor(pub String); // never inspect, parse, or synthesize
pub struct CatalogueDigest(pub String); // sha256:<64 lower-case hex>

pub enum Availability {
    Available,
    PendingTsOc03D,
    Unavailable,
    Stale,
    Partial,
}

pub enum Freshness {
    Fresh,
    Degraded,
    Stale,
    Unavailable,
    Unknown,
}

pub enum Completeness {
    Complete,
    Partial,
    Unknown,
}

pub struct ManagerEnvelope<T> {
    pub contract_version: String,
    pub authority: String, // EXECUTION_CELL
    pub profile_id: ProfileId,
    pub catalogue_sha256: CatalogueDigest,
    pub availability: Availability,
    pub freshness: Freshness,
    pub completeness: Completeness,
    pub trace_id: String,
    pub as_of: String, // RFC 3339 UTC; only present for a proven source result
    pub data: T,
}

pub struct ManagerUnavailable {
    pub contract_version: String,
    pub authority: String,
    pub profile_id: ProfileId,
    pub catalogue_sha256: CatalogueDigest,
    pub availability: Availability,
    pub reason_code: String,
    pub trace_id: String,
}

pub struct RelationId {
    pub schema: String,
    pub relation: String,
}

pub struct SafeColumn {
    pub name: String,
    pub ordinal: u32,
    pub data_type: String,
    pub nullable: bool,
}

pub struct KeyDescriptor {
    pub status: String, // PRIMARY_KEY, UNIQUE_INDEX, or PENDING_QUERY_KEY
    pub name: Option<String>,
    pub columns: Vec<String>,
}

pub struct RelationSchema {
    pub id: RelationId,
    pub kind: String,
    pub safe_columns: Vec<SafeColumn>,
    pub secret_cell_excluded_column_count: u32,
    pub key: KeyDescriptor,
    pub profile_classification: String,
    pub profile_columns: Vec<String>,
    pub query_status: String, // PENDING_TS_OC_03D at this freeze
}

pub enum ManagerValue {
    Null,
    Boolean(bool),
    Integer(i64),
    Decimal(String), // exact decimal, never f64
    Text(String),
    Timestamp(String), // RFC 3339 UTC
    Array(Vec<ManagerValue>),
    Object(BTreeMap<String, ManagerValue>), // recursively redacted
}

pub struct ManagerRecord {
    pub relation: RelationId,
    pub fields: BTreeMap<String, ManagerValue>,
}

pub struct RelationRecords {
    pub relation: RelationId,
    pub items: Vec<ManagerRecord>,
    pub next_cursor: Option<OpaqueCursor>,
}

pub struct NamedProjection {
    pub kind: String,
    pub items: Vec<ManagerRecord>,
    pub next_cursor: Option<OpaqueCursor>,
}

pub struct CatalogSnapshot {
    pub catalogue_revision: CatalogueDigest,
    pub relation_count: u32,
    pub relations: Vec<RelationSchema>,
}
```

## Required client behavior

- Treat `ManagerUnavailable` as a typed owner result, not an empty page and
  not a retry-until-success signal. Do not cache it as Trading System truth.
- Decode decimal values from strings. Do not convert a decimal to `f64`.
- Bind every opaque cursor to its original relation/catalogue/profile and pass
  it back verbatim only after TS-OC-03D publishes a qualified records route.
- `ManagerRecord.fields` keys must be checked against `safe_columns` from the
  same catalogue digest. Never render a secret-cell field, an unknown field, or
  a raw credential/configuration payload.
- The Portal client owns mTLS/JWT attachment and bounded retry/tracing only. It
  must not import a Postgres driver, Trading System DSN, raw SQL, Redis, broker,
  or CLI credential.

## Wire-to-Rust mapping

| OpenAPI schema | Rust DTO |
| --- | --- |
| `ManagerEnvelope` | `ManagerEnvelope<T>` |
| `ManagerUnavailable` | `ManagerUnavailable` |
| `CatalogSnapshot` | `CatalogSnapshot` |
| `RelationSchema` | `RelationSchema` |
| `RelationId` | `RelationId` |
| `SafeColumn` | `SafeColumn` |
| `KeyDescriptor` | `KeyDescriptor` |
| `RelationRecords` | `RelationRecords` |
| `NamedProjection` | `NamedProjection` |
| `ManagerRecord` | `ManagerRecord` |
| `ManagerValue` | `ManagerValue` |
| `OpaqueCursor` | `OpaqueCursor` |
| `Availability` / `Freshness` / `Completeness` | matching enums |

The code block is a binding blueprint. The supplied mutable Portal checkout may
add `serde` derives and HTTP-client code only after it consumes the manifest and
keeps all owner runtime flags disabled until the later qualification phases.
