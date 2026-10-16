//! Durable Portal delivery state, not capital/order business authority.
//! No transaction is held over a network call. Once claimed, an intent can only
//! be queried by the same immutable key; a crash never grants another send.
use std::{
    future::Future,
    pin::Pin,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::Duration,
};

use command_relay::{
    authority::{
        authorize, authorize_recovery, Action, AuthorityError, AuthorityProvider, RecoveryProvider,
    },
    durable::{AuthorityReceipt, BusinessState, CommandIntent, CommandScope},
};
use projection_core::{canonical_digest, resources::WorkClass};
use serde_json::Value;
use sqlx::{postgres::PgRow, Postgres, Row, Transaction};
use thiserror::Error;
use tokio::sync::Semaphore;
use uuid::Uuid;

use crate::PgProjectionStore;

const MAX_RECEIPT: usize = 1024 * 1024;

/// A server-owned authenticated TS adapter. This is NOT a network/wire schema.
/// Implementations must bind source key/digest/target before returning Receipt,
/// hold current human+workload leases through the TS commit, bound response
/// bytes, and never retry a mutation. Read transport is not such an adapter.
pub trait CommandPort: Send + Sync {
    fn send<'a>(&'a self, intent: &'a CommandIntent) -> SourceFuture<'a>;
    fn lookup<'a>(&'a self, intent: &'a CommandIntent) -> SourceFuture<'a>;
}
pub type SourceFuture<'a> = Pin<Box<dyn Future<Output = SourceReply> + Send + 'a>>;

#[derive(Debug)]
pub enum SourceReply {
    Acknowledged,
    Receipt(Box<AuthorityReceipt>),
    /// Includes post-send HTTP503/DENIED, disconnect, decode failure and timeout.
    /// None of these proves that TS did not commit.
    Unknown,
}

pub struct UnavailableCommandPort;
impl CommandPort for UnavailableCommandPort {
    fn send<'a>(&'a self, _: &'a CommandIntent) -> SourceFuture<'a> {
        Box::pin(async { SourceReply::Unknown })
    }
    fn lookup<'a>(&'a self, _: &'a CommandIntent) -> SourceFuture<'a> {
        Box::pin(async { SourceReply::Unknown })
    }
}

#[derive(Debug, Error)]
pub enum RelayError {
    #[error("command authority unavailable or denied")]
    Authority(#[from] AuthorityError),
    #[error("command storage unavailable or denied")]
    Store(#[from] CommandStoreError),
    #[error("new command admission disabled")]
    Disabled,
    #[error("command relay busy")]
    Busy,
    #[error("invalid bounded relay configuration")]
    Configuration,
}

/// Shared bounded composition for submit/status. No browser facts or arbitrary
/// SQL/CLI/URL enter here. An HTTP adapter must first install a qualified current
/// authority provider and a separately authenticated TS command/status port.
pub struct DurableCommandRelay<A, P> {
    store: PgProjectionStore,
    ledger: String,
    authority: A,
    port: P,
    sends_enabled: AtomicBool,
    admission: Arc<Semaphore>,
    deadline: Duration,
}

impl<A: AuthorityProvider, P: CommandPort> DurableCommandRelay<A, P> {
    /// This constructor does not configure schemas or activate a route. Quota
    /// must already exist; source publication is checked for every new send.
    /// # Errors
    /// Rejects unbounded concurrency/deadline or malformed ledger identity.
    pub fn new(
        store: PgProjectionStore,
        ledger: &str,
        authority: A,
        port: P,
        max_active: usize,
        deadline: Duration,
    ) -> Result<Self, RelayError> {
        if ledger.is_empty()
            || ledger.len() > 128
            || !(1..=32).contains(&max_active)
            || deadline < Duration::from_millis(50)
            || deadline > Duration::from_secs(30)
        {
            return Err(RelayError::Configuration);
        }
        Ok(Self {
            store,
            ledger: ledger.to_owned(),
            authority,
            port,
            sends_enabled: AtomicBool::new(false),
            admission: Arc::new(Semaphore::new(max_active)),
            deadline,
        })
    }

    /// Server-controlled admission only, not a proof or a feature-flag bypass.
    /// Every new send still needs a current published operation authorization.
    pub fn set_sends_enabled(&self, enabled: bool) {
        self.sends_enabled.store(enabled, Ordering::SeqCst);
    }

    fn check(&self, intent: &CommandIntent, action: Action) -> Result<(), RelayError> {
        authorize(
            &self.authority,
            intent,
            action,
            chrono::Utc::now().timestamp_millis(),
        )?;
        Ok(())
    }

    fn disclose(
        &self,
        intent: &CommandIntent,
        record: CommandRecord,
    ) -> Result<CommandRecord, RelayError> {
        self.check(intent, Action::Status)?;
        Ok(record)
    }

    /// # Errors
    /// Rechecks current authority, persists first, sends at most once, and never
    /// resends uncertain intents. Existing requests are authorized as status so
    /// their original versions can still be recovered after the TS commit.
    pub async fn submit(&self, intent: &CommandIntent) -> Result<CommandRecord, RelayError> {
        let _permit = self.admission.try_acquire().map_err(|_| RelayError::Busy)?;
        self.check(intent, Action::Status)?;
        // A rollback cannot create new intents; it must preserve status access.
        if !self.sends_enabled.load(Ordering::SeqCst) {
            let record = self
                .store
                .existing_command(&self.ledger, intent)
                .await?
                .ok_or(RelayError::Disabled)?;
            return self.disclose(intent, record);
        }
        if let Some(record) = self.store.existing_command(&self.ledger, intent).await? {
            if record.delivery != "PREPARED" {
                return self.disclose(intent, record);
            }
        }
        self.check(intent, Action::Submit)?;
        // Lookups do not acquire a send claim. Conflict detection is durable.
        let record = self.store.prepare_command(&self.ledger, intent).await?;
        if record.delivery != "PREPARED" {
            return self.disclose(intent, record);
        }
        self.check(intent, Action::Submit)?;
        if !self.sends_enabled.load(Ordering::SeqCst) {
            return Err(RelayError::Disabled);
        }
        let Some(claim) = self.store.claim_command(&self.ledger, intent).await? else {
            return self.disclose(
                intent,
                self.store.command_status(&self.ledger, intent).await?,
            );
        };
        // Final current check after durable CAS. On failure no effect is sent;
        // claim remains status-only, avoiding a dangerous later blind resend.
        if let Err(error) = self.check(intent, Action::Submit) {
            self.store.command_delivery(&claim, false).await?;
            return Err(error);
        }
        if !self.sends_enabled.load(Ordering::SeqCst) {
            self.store.command_delivery(&claim, false).await?;
            return Err(RelayError::Disabled);
        }
        let reply = tokio::time::timeout(self.deadline, self.port.send(intent))
            .await
            .unwrap_or(SourceReply::Unknown);
        let record = match reply {
            SourceReply::Receipt(receipt) => {
                self.store
                    .record_command_receipt(&self.ledger, intent, &receipt)
                    .await?
            }
            SourceReply::Acknowledged | SourceReply::Unknown => {
                self.store
                    .command_delivery(&claim, matches!(reply, SourceReply::Acknowledged))
                    .await?;
                self.store.command_status(&self.ledger, intent).await?
            }
        };
        self.disclose(intent, record)
    }

    /// # Errors
    /// Status/reconcile stays available with sends disabled, but never bypasses
    /// current identity/revocation or guesses APPLIED from a transport ACK.
    pub async fn status(
        &self,
        intent: &CommandIntent,
        reconcile: bool,
    ) -> Result<CommandRecord, RelayError> {
        let _permit = self.admission.try_acquire().map_err(|_| RelayError::Busy)?;
        self.check(intent, Action::Status)?;
        let record = self.store.command_status(&self.ledger, intent).await?;
        if !reconcile
            || record.delivery == "PREPARED"
            || record
                .receipt
                .as_ref()
                .is_some_and(AuthorityReceipt::is_terminal)
        {
            return self.disclose(intent, record);
        }
        self.check(intent, Action::Status)?;
        if let Ok(SourceReply::Receipt(receipt)) =
            tokio::time::timeout(self.deadline, self.port.lookup(intent)).await
        {
            let updated = self
                .store
                .record_command_receipt(&self.ledger, intent, &receipt)
                .await?;
            return self.disclose(intent, updated);
        }
        self.disclose(intent, record)
    }

    /// Private status-only service recovery independent of an expired human
    /// login. Returns NO receipt/public data and never acquires a send claim.
    /// # Errors
    /// Requires a separate current service authority; this is not report access.
    pub async fn recover(
        &self,
        intent: &CommandIntent,
        service: &impl RecoveryProvider,
    ) -> Result<(), RelayError> {
        let _permit = self.admission.try_acquire().map_err(|_| RelayError::Busy)?;
        authorize_recovery(service, intent, chrono::Utc::now().timestamp_millis())?;
        let record = self.store.command_status(&self.ledger, intent).await?;
        if record.delivery == "PREPARED"
            || record
                .receipt
                .as_ref()
                .is_some_and(AuthorityReceipt::is_terminal)
        {
            return Ok(());
        }
        authorize_recovery(service, intent, chrono::Utc::now().timestamp_millis())?;
        if let Ok(SourceReply::Receipt(receipt)) =
            tokio::time::timeout(self.deadline, self.port.lookup(intent)).await
        {
            authorize_recovery(service, intent, chrono::Utc::now().timestamp_millis())?;
            self.store
                .record_command_receipt(&self.ledger, intent, &receipt)
                .await?;
        }
        Ok(())
    }
}

#[derive(Debug, Error)]
pub enum CommandStoreError {
    #[error("command storage unavailable")]
    Database(#[from] sqlx::Error),
    #[error("command storage admission denied")]
    Resource(#[from] projection_core::resources::ResourceError),
    #[error("command store requires a governed pool")]
    Ungoverned,
    #[error("command ledger configuration is invalid or changed")]
    Configuration,
    #[error("command idempotency conflict")]
    Conflict,
    #[error("command ledger capacity exhausted")]
    Capacity,
    #[error("command not available")]
    NotFound,
    #[error("command dispatch or receipt fencing conflict")]
    Fence,
    #[error("command receipt or persisted intent is invalid")]
    Invalid,
}

/// A bounded immutable correlation view. It deliberately excludes identity
/// tokens, private credentials and any assertion/signing material.
#[derive(Debug, Clone)]
pub struct CommandRecord {
    pub command_id: Uuid,
    pub intent: CommandIntent,
    pub delivery: String,
    pub receipt: Option<AuthorityReceipt>,
}

/// The private token is persisted before dispatch and only returned to the CAS
/// winner. Status recovery cannot acquire a new send token.
#[derive(Debug)]
pub struct DispatchClaim {
    command_id: Uuid,
    token: Uuid,
}

impl PgProjectionStore {
    async fn command_transaction(&self) -> Result<Transaction<'_, Postgres>, CommandStoreError> {
        let mut tx = self.pool.begin().await?;
        sqlx::query("SELECT set_config('statement_timeout','2000ms',true),set_config('lock_timeout','250ms',true)")
            .execute(&mut *tx).await?;
        Ok(tx)
    }
    fn command_admit(
        &self,
        write: bool,
    ) -> Result<Option<projection_core::resources::ResourceLease>, CommandStoreError> {
        if self.resources.is_none() {
            return Err(CommandStoreError::Ungoverned);
        }
        Ok(self.admit(
            if write {
                WorkClass::LiveWrite
            } else {
                WorkClass::ControlRead
            },
            2,
            MAX_RECEIPT + 128 * 1024,
        )?)
    }

    /// Installs one immutable cross-replica quota in the Portal DB. This does not
    /// enable any operation or provision any TS identity.
    /// # Errors
    /// Requires a governed pool, bounded identifier/quota and identical retries.
    pub async fn configure_command_ledger(
        &self,
        ledger: &str,
        max_commands: i64,
    ) -> Result<(), CommandStoreError> {
        if ledger.is_empty() || ledger.len() > 128 || !(1..=1_000_000).contains(&max_commands) {
            return Err(CommandStoreError::Configuration);
        }
        let _lease = self.command_admit(true)?;
        let mut tx = self.command_transaction().await?;
        sqlx::query(
            "INSERT INTO portal_projection.command_relay_limits (ledger_id,max_commands)
            VALUES ($1,$2) ON CONFLICT (ledger_id) DO NOTHING",
        )
        .bind(ledger)
        .bind(max_commands)
        .execute(&mut *tx)
        .await?;
        let actual: i64 = sqlx::query_scalar(
            "SELECT max_commands FROM portal_projection.command_relay_limits WHERE ledger_id=$1",
        )
        .bind(ledger)
        .fetch_one(&mut *tx)
        .await?;
        if actual != max_commands {
            return Err(CommandStoreError::Configuration);
        }
        tx.commit().await?;
        Ok(())
    }

    /// Durable intent BEFORE send. Same immutable key+request returns the same
    /// record even when full; a different body/actor/scope never forks it.
    /// # Errors
    /// Returns typed conflict, quota, governance or database failures.
    pub async fn prepare_command(
        &self,
        ledger: &str,
        intent: &CommandIntent,
    ) -> Result<CommandRecord, CommandStoreError> {
        let _lease = self.command_admit(true)?;
        let mut tx = self.command_transaction().await?;
        // Serialize admission across replicas, NOT the downstream network call.
        let quota = sqlx::query(
            "SELECT max_commands,command_count FROM portal_projection.command_relay_limits
            WHERE ledger_id=$1 FOR UPDATE",
        )
        .bind(ledger)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or(CommandStoreError::Configuration)?;
        let scope = intent.scope();
        let existing = sqlx::query(
            "SELECT * FROM portal_projection.command_relay WHERE ledger_id=$1
            AND workspace_id=$2 AND environment=$3 AND profile_id=$4 AND authority_scope_id=$5
            AND operation=$6 AND idempotency_key=$7",
        )
        .bind(ledger)
        .bind(scope.workspace_id())
        .bind(scope.environment())
        .bind(scope.profile_id())
        .bind(scope.authority_scope_id())
        .bind(intent.operation())
        .bind(intent.key())
        .fetch_optional(&mut *tx)
        .await?;
        if let Some(row) = existing {
            let record = decode(&row)?;
            if record.intent.request_digest() != intent.request_digest() {
                return Err(CommandStoreError::Conflict);
            }
            tx.commit().await?;
            return Ok(record);
        }
        if quota.try_get::<i64, _>("command_count")? >= quota.try_get::<i64, _>("max_commands")? {
            return Err(CommandStoreError::Capacity);
        }
        let id = Uuid::now_v7();
        sqlx::query(
            "INSERT INTO portal_projection.command_relay (command_id,ledger_id,
            workspace_id,environment,profile_id,authority_scope_id,actor_id,workload_id,
            operation,idempotency_key,payload,payload_digest,request_digest,delivery)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'PREPARED')",
        )
        .bind(id)
        .bind(ledger)
        .bind(scope.workspace_id())
        .bind(scope.environment())
        .bind(scope.profile_id())
        .bind(scope.authority_scope_id())
        .bind(scope.actor_id())
        .bind(scope.workload_id())
        .bind(intent.operation())
        .bind(intent.key())
        .bind(intent.payload())
        .bind(intent.digest())
        .bind(intent.request_digest())
        .execute(&mut *tx)
        .await?;
        sqlx::query("UPDATE portal_projection.command_relay_limits SET command_count=command_count+1 WHERE ledger_id=$1")
            .bind(ledger).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(CommandRecord {
            command_id: id,
            intent: intent.clone(),
            delivery: "PREPARED".into(),
            receipt: None,
        })
    }

    /// # Errors
    /// Only PREPARED can win once. No automatic retry after this durable CAS.
    pub async fn claim_command(
        &self,
        ledger: &str,
        intent: &CommandIntent,
    ) -> Result<Option<DispatchClaim>, CommandStoreError> {
        let _lease = self.command_admit(true)?;
        let mut tx = self.command_transaction().await?;
        let token = Uuid::now_v7();
        let id: Option<Uuid> = sqlx::query_scalar(
            "UPDATE portal_projection.command_relay SET delivery='SENDING',
            dispatch_token=$3,updated_at=clock_timestamp() WHERE ledger_id=$1 AND request_digest=$2
            AND delivery='PREPARED' RETURNING command_id",
        )
        .bind(ledger)
        .bind(intent.request_digest())
        .bind(token)
        .fetch_optional(&mut *tx)
        .await?;
        tx.commit().await?;
        Ok(id.map(|command_id| DispatchClaim { command_id, token }))
    }

    /// # Errors
    /// ACK is transport-only. Any post-send error (including HTTP503) is UNKNOWN,
    /// never `FAILED_BEFORE_SEND`. A stale claim cannot overwrite a newer receipt.
    pub async fn command_delivery(
        &self,
        claim: &DispatchClaim,
        acknowledged: bool,
    ) -> Result<(), CommandStoreError> {
        let _lease = self.command_admit(true)?;
        let mut tx = self.command_transaction().await?;
        let count = sqlx::query(
            "UPDATE portal_projection.command_relay SET delivery=$3,updated_at=clock_timestamp()
            WHERE command_id=$1 AND dispatch_token=$2 AND delivery='SENDING' AND receipt IS NULL",
        )
        .bind(claim.command_id)
        .bind(claim.token)
        .bind(if acknowledged {
            "ACKNOWLEDGED"
        } else {
            "DELIVERY_UNKNOWN"
        })
        .execute(&mut *tx)
        .await?
        .rows_affected();
        if count != 1 {
            return Err(CommandStoreError::Fence);
        }
        tx.commit().await?;
        Ok(())
    }

    /// Read by immutable request, not a caller-selected table/SQL/source URL.
    /// An interrupted SENDING is reported as UNKNOWN without granting resend.
    /// # Errors
    /// Requires current caller authorization in the relay service before entry.
    pub async fn command_status(
        &self,
        ledger: &str,
        intent: &CommandIntent,
    ) -> Result<CommandRecord, CommandStoreError> {
        let _lease = self.command_admit(false)?;
        let mut tx = self.command_transaction().await?;
        let row = sqlx::query("SELECT * FROM portal_projection.command_relay WHERE ledger_id=$1 AND request_digest=$2")
            .bind(ledger).bind(intent.request_digest()).fetch_optional(&mut *tx).await?
            .ok_or(CommandStoreError::NotFound)?;
        let mut record = decode(&row)?;
        tx.commit().await?;
        if record.delivery == "SENDING" {
            record.delivery = "DELIVERY_UNKNOWN".into();
        }
        Ok(record)
    }

    /// Same business key is checked before freshness/re-send admission so an
    /// existing receipt is recoverable after versions have advanced.
    /// # Errors
    /// Rejects changed payload/actors for an existing key; never inserts rows.
    pub async fn existing_command(
        &self,
        ledger: &str,
        intent: &CommandIntent,
    ) -> Result<Option<CommandRecord>, CommandStoreError> {
        let _lease = self.command_admit(false)?;
        let mut tx = self.command_transaction().await?;
        let scope = intent.scope();
        let row = sqlx::query(
            "SELECT * FROM portal_projection.command_relay WHERE ledger_id=$1
            AND workspace_id=$2 AND environment=$3 AND profile_id=$4 AND authority_scope_id=$5
            AND operation=$6 AND idempotency_key=$7",
        )
        .bind(ledger)
        .bind(scope.workspace_id())
        .bind(scope.environment())
        .bind(scope.profile_id())
        .bind(scope.authority_scope_id())
        .bind(intent.operation())
        .bind(intent.key())
        .fetch_optional(&mut *tx)
        .await?;
        let record = row.as_ref().map(decode).transpose()?;
        if record
            .as_ref()
            .is_some_and(|row| row.intent.request_digest() != intent.request_digest())
        {
            return Err(CommandStoreError::Conflict);
        }
        tx.commit().await?;
        Ok(record.map(|mut record| {
            if record.delivery == "SENDING" {
                record.delivery = "DELIVERY_UNKNOWN".into();
            }
            record
        }))
    }

    /// Persist the full bounded source receipt, not the public reduced DTO.
    /// Source trust/commit-time authorization is owned by the authority adapter.
    /// # Errors
    /// Rejects mismatched intent, regression, changed revision and oversized data.
    pub async fn record_command_receipt(
        &self,
        ledger: &str,
        intent: &CommandIntent,
        receipt: &AuthorityReceipt,
    ) -> Result<CommandRecord, CommandStoreError> {
        receipt
            .verify_for(intent)
            .map_err(|_| CommandStoreError::Invalid)?;
        let bytes =
            serde_json::to_vec(receipt.payload()).map_err(|_| CommandStoreError::Invalid)?;
        if bytes.len() > MAX_RECEIPT {
            return Err(CommandStoreError::Invalid);
        }
        let digest = canonical_digest(receipt.payload()).map_err(|_| CommandStoreError::Invalid)?;
        let _lease = self.command_admit(true)?;
        let mut tx = self.command_transaction().await?;
        let row = sqlx::query("SELECT * FROM portal_projection.command_relay WHERE ledger_id=$1 AND request_digest=$2 FOR UPDATE")
            .bind(ledger).bind(intent.request_digest()).fetch_optional(&mut *tx).await?
            .ok_or(CommandStoreError::NotFound)?;
        let previous = decode(&row)?;
        if previous.delivery == "PREPARED" {
            return Err(CommandStoreError::Fence);
        }
        if let Some(old) = &previous.receipt {
            receipt
                .validate_progress(old)
                .map_err(|_| CommandStoreError::Invalid)?;
            if receipt.revision() == old.revision() && receipt.payload() != old.payload() {
                return Err(CommandStoreError::Conflict);
            }
        }
        sqlx::query("UPDATE portal_projection.command_relay SET delivery='ACKNOWLEDGED',source_ref=$3,
            source_revision=$4,business_state=$5,receipt=$6,receipt_digest=$7,updated_at=clock_timestamp()
            WHERE ledger_id=$1 AND request_digest=$2")
            .bind(ledger).bind(intent.request_digest()).bind(receipt.source_ref()).bind(receipt.revision())
            .bind(receipt.state().as_str()).bind(receipt.payload()).bind(digest).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(CommandRecord {
            command_id: previous.command_id,
            intent: previous.intent,
            delivery: "ACKNOWLEDGED".into(),
            receipt: Some(receipt.clone()),
        })
    }
}

fn decode(row: &PgRow) -> Result<CommandRecord, CommandStoreError> {
    let scope = CommandScope::new(
        &row.try_get::<String, _>("workspace_id")?,
        &row.try_get::<String, _>("environment")?,
        &row.try_get::<String, _>("profile_id")?,
        &row.try_get::<String, _>("authority_scope_id")?,
        &row.try_get::<String, _>("actor_id")?,
        &row.try_get::<String, _>("workload_id")?,
    )
    .map_err(|_| CommandStoreError::Invalid)?;
    let intent = CommandIntent::new(
        scope,
        &row.try_get::<String, _>("idempotency_key")?,
        &row.try_get::<String, _>("operation")?,
        row.try_get::<Value, _>("payload")?,
        &row.try_get::<String, _>("payload_digest")?,
    )
    .map_err(|_| CommandStoreError::Invalid)?;
    if intent.request_digest() != row.try_get::<String, _>("request_digest")? {
        return Err(CommandStoreError::Invalid);
    }
    let receipt = if let Some(payload) = row.try_get::<Option<Value>, _>("receipt")? {
        let digest = canonical_digest(&payload).map_err(|_| CommandStoreError::Invalid)?;
        if Some(digest) != row.try_get::<Option<String>, _>("receipt_digest")? {
            return Err(CommandStoreError::Invalid);
        }
        let state = BusinessState::parse(&row.try_get::<String, _>("business_state")?)
            .map_err(|_| CommandStoreError::Invalid)?;
        Some(
            AuthorityReceipt::new(
                &intent,
                &row.try_get::<String, _>("source_ref")?,
                row.try_get("source_revision")?,
                state,
                payload,
            )
            .map_err(|_| CommandStoreError::Invalid)?,
        )
    } else {
        None
    };
    Ok(CommandRecord {
        command_id: row.try_get("command_id")?,
        intent,
        delivery: row.try_get("delivery")?,
        receipt,
    })
}
