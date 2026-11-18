//! Bounded Portal custody of ORIGINAL PM pins and the full latest outcome.
//!
//! This supplies storage, never source normalization, identity or authorization.
//! No TLS/token material, network call, automatic TTL or send retry belongs here.
//! Outcome custody deliberately does NOT advance generic delivery: a lost custody
//! COMMIT ACK must still let the existing claim become `DELIVERY_UNKNOWN`.

use command_relay::{
    durable::CommandIntent,
    pm_source::{decode_outcome, PmOutcome, PmSourceBinding, OUTCOME_SCHEMA},
};
use projection_core::canonical_digest;
use serde_json::{json, Value};
use sqlx::{postgres::PgRow, Row};

use crate::{
    command::{decode, validate_receipt_progress, CommandRecord, CommandStoreError},
    PgProjectionStore,
};

const MAX_OUTCOME: usize = 32_768;

/// Structural ORIGINAL source facts supplied by an authenticated owning
/// composition, not computed from current profile/aliases or returned outcomes.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct OriginalPmBinding {
    request_digest: String,
    reference: String,
    source_intent_digest: String,
    target_ref: String,
}

impl OriginalPmBinding {
    /// # Errors
    /// Rejects invalid references or original normalized digest/target pins.
    pub fn new(
        intent: &CommandIntent,
        reference: &str,
        source_intent_digest: &str,
        target_ref: &str,
    ) -> Result<Self, CommandStoreError> {
        if reference.is_empty()
            || reference.len() > 512
            || reference.trim() != reference
            || reference.chars().any(char::is_control)
        {
            return Err(CommandStoreError::Invalid);
        }
        PmSourceBinding::new(intent, source_intent_digest, target_ref)
            .map_err(|_| CommandStoreError::Invalid)?;
        Ok(Self {
            request_digest: intent.request_digest().to_owned(),
            reference: reference.to_owned(),
            source_intent_digest: source_intent_digest.to_owned(),
            target_ref: target_ref.to_owned(),
        })
    }

    #[must_use]
    pub fn reference(&self) -> &str {
        &self.reference
    }
    #[must_use]
    pub fn source_intent_digest(&self) -> &str {
        &self.source_intent_digest
    }
    #[must_use]
    pub fn target_ref(&self) -> &str {
        &self.target_ref
    }

    fn digest(&self) -> Result<String, CommandStoreError> {
        canonical_digest(
            &json!({"request_digest":self.request_digest,"reference":self.reference,
            "source_intent_digest":self.source_intent_digest,"target_ref":self.target_ref}),
        )
        .map_err(|_| CommandStoreError::Invalid)
    }

    fn source(&self, intent: &CommandIntent) -> Result<PmSourceBinding, CommandStoreError> {
        if self.request_digest != intent.request_digest() {
            return Err(CommandStoreError::Conflict);
        }
        PmSourceBinding::new(intent, &self.source_intent_digest, &self.target_ref)
            .map_err(|_| CommandStoreError::Invalid)
    }
}

impl PgProjectionStore {
    /// Atomically prepares an existing-quota command AND its original PM pins.
    /// Identical retries remain valid after claim/progress; changed pins never
    /// replace history, and a claimed generic row cannot be backfilled.
    /// # Errors
    /// Rejects ungoverned access, quota/conflict, missing historical pins or DB failure.
    pub async fn prepare_pm_command(
        &self,
        ledger: &str,
        intent: &CommandIntent,
        binding: &OriginalPmBinding,
    ) -> Result<CommandRecord, CommandStoreError> {
        binding.source(intent)?;
        let binding_digest = binding.digest()?;
        let _lease = self.command_admit(true)?;
        let mut tx = self.command_transaction().await?;
        let prepared = Self::prepare_command_in_tx(&mut tx, ledger, intent).await?;
        let current = sqlx::query(
            "SELECT * FROM portal_projection.command_relay WHERE command_id=$1 FOR UPDATE",
        )
        .bind(prepared.command_id)
        .fetch_one(&mut *tx)
        .await?;
        let record = verify_intent(&current, intent)?;
        let delivery = record.delivery.as_str();
        let previous =
            sqlx::query("SELECT * FROM portal_projection.command_pm_custody WHERE command_id=$1")
                .bind(record.command_id)
                .fetch_optional(&mut *tx)
                .await?;
        if let Some(row) = previous {
            if decode_binding(intent, &row)? != *binding {
                return Err(CommandStoreError::Conflict);
            }
        } else {
            if delivery != "PREPARED" {
                return Err(CommandStoreError::Fence);
            }
            sqlx::query("INSERT INTO portal_projection.command_pm_custody (command_id,original_reference,source_intent_digest,target_ref,binding_digest) VALUES ($1,$2,$3,$4,$5)")
                .bind(record.command_id).bind(binding.reference()).bind(binding.source_intent_digest()).bind(binding.target_ref()).bind(binding_digest)
                .execute(&mut *tx).await?;
        }
        tx.commit().await?;
        Ok(record)
    }

    /// Resolves retained original facts by the complete immutable scoped intent.
    /// The caller still owns current requester/source authorization.
    /// # Errors
    /// Missing, changed, corrupt or ungoverned bindings fail closed.
    pub async fn pm_original_binding(
        &self,
        ledger: &str,
        intent: &CommandIntent,
    ) -> Result<OriginalPmBinding, CommandStoreError> {
        let _lease = self.command_admit(false)?;
        let mut tx = self.command_transaction().await?;
        let row = sqlx::query("SELECT c.*,p.original_reference,p.source_intent_digest,p.target_ref,p.binding_digest FROM portal_projection.command_relay c JOIN portal_projection.command_pm_custody p USING(command_id) WHERE c.ledger_id=$1 AND c.request_digest=$2")
            .bind(ledger).bind(intent.request_digest()).fetch_optional(&mut *tx).await?.ok_or(CommandStoreError::NotFound)?;
        verify_intent(&row, intent)?;
        let binding = decode_binding(intent, &row)?;
        tx.commit().await?;
        Ok(binding)
    }

    /// Retains the FULL validated latest envelope before the port ACKs custody.
    /// Does not set ACKNOWLEDGED or write the generic receipt. That remains the
    /// existing relay's responsibility after a successful custody callback.
    /// # Errors
    /// Rejects missing original pins/claim, envelope bounds, corruption, changed
    /// same-revision evidence or regressing progress; COMMIT failure is UNKNOWN.
    pub async fn retain_pm_outcome(
        &self,
        ledger: &str,
        intent: &CommandIntent,
        outcome: &PmOutcome,
    ) -> Result<(), CommandStoreError> {
        let _lease = self.command_admit(true)?;
        outcome
            .receipt
            .verify_for(intent)
            .map_err(|_| CommandStoreError::Invalid)?;
        let envelope_text = encode_outcome(intent, outcome)?;
        let digest = envelope_digest(&envelope_text)?;
        let mut tx = self.command_transaction().await?;
        let row = sqlx::query("SELECT c.*,p.original_reference,p.source_intent_digest,p.target_ref,p.binding_digest,p.outcome_json,p.outcome_digest FROM portal_projection.command_relay c JOIN portal_projection.command_pm_custody p USING(command_id) WHERE c.ledger_id=$1 AND c.request_digest=$2 FOR UPDATE OF c,p")
            .bind(ledger).bind(intent.request_digest()).fetch_optional(&mut *tx).await?.ok_or(CommandStoreError::NotFound)?;
        let record = verify_intent(&row, intent)?;
        if record.delivery == "PREPARED" {
            return Err(CommandStoreError::Fence);
        }
        let binding = decode_binding(intent, &row)?;
        let validated = decode_outcome(intent, &binding.source(intent)?, envelope_text.as_bytes())
            .map_err(|_| CommandStoreError::Invalid)?;
        validate_receipt_progress(record.receipt.as_ref(), &validated.receipt)?;
        if let Some(previous) = decode_stored_outcome(intent, &binding, &row)? {
            validate_receipt_progress(Some(&previous.receipt), &validated.receipt)?;
            if previous.receipt.revision() == validated.receipt.revision()
                && row
                    .try_get::<Option<String>, _>("outcome_digest")?
                    .as_deref()
                    != Some(digest.as_str())
            {
                return Err(CommandStoreError::Conflict);
            }
        }
        sqlx::query("UPDATE portal_projection.command_pm_custody SET outcome_json=$2,outcome_digest=$3 WHERE command_id=$1")
            .bind(record.command_id).bind(envelope_text).bind(digest).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(())
    }

    /// Returns the full retained envelope after integrity/correlation checks.
    /// This is private storage readback, NOT current native/business authority.
    /// # Errors
    /// Requires governed access, exact existing scoped binding and valid stored bytes.
    pub async fn read_pm_outcome(
        &self,
        ledger: &str,
        intent: &CommandIntent,
    ) -> Result<Option<PmOutcome>, CommandStoreError> {
        let _lease = self.command_admit(false)?;
        let mut tx = self.command_transaction().await?;
        let row = sqlx::query("SELECT c.*,p.original_reference,p.source_intent_digest,p.target_ref,p.binding_digest,p.outcome_json,p.outcome_digest FROM portal_projection.command_relay c JOIN portal_projection.command_pm_custody p USING(command_id) WHERE c.ledger_id=$1 AND c.request_digest=$2")
            .bind(ledger).bind(intent.request_digest()).fetch_optional(&mut *tx).await?.ok_or(CommandStoreError::NotFound)?;
        verify_intent(&row, intent)?;
        let binding = decode_binding(intent, &row)?;
        let outcome = decode_stored_outcome(intent, &binding, &row)?;
        tx.commit().await?;
        Ok(outcome)
    }
}

fn verify_intent(row: &PgRow, intent: &CommandIntent) -> Result<CommandRecord, CommandStoreError> {
    let record = decode(row)?;
    if record.intent.request_digest() != intent.request_digest() {
        return Err(CommandStoreError::Conflict);
    }
    Ok(record)
}

fn decode_binding(
    intent: &CommandIntent,
    row: &PgRow,
) -> Result<OriginalPmBinding, CommandStoreError> {
    let binding = OriginalPmBinding::new(
        intent,
        &row.try_get::<String, _>("original_reference")?,
        &row.try_get::<String, _>("source_intent_digest")?,
        &row.try_get::<String, _>("target_ref")?,
    )?;
    if binding.digest()? != row.try_get::<String, _>("binding_digest")? {
        return Err(CommandStoreError::Invalid);
    }
    Ok(binding)
}

fn encode_outcome(
    intent: &CommandIntent,
    outcome: &PmOutcome,
) -> Result<String, CommandStoreError> {
    PmSourceBinding::new(intent, &outcome.source_intent_digest, &outcome.target_ref)
        .map_err(|_| CommandStoreError::Invalid)?;
    if outcome.authority_receipt.is_empty()
        || outcome.authority_receipt.len() > 512
        || outcome.authority_receipt.trim() != outcome.authority_receipt
        || outcome.authority_receipt.chars().any(char::is_control)
    {
        return Err(CommandStoreError::Invalid);
    }
    let raw = serde_json::to_string(&json!({"schema_version":OUTCOME_SCHEMA,"transport_payload_digest":intent.digest(),
        "source_intent_digest":outcome.source_intent_digest,"source_key":[intent.scope().authority_scope_id(),intent.operation(),intent.key()],
        "target_ref":outcome.target_ref,"authority_receipt":outcome.authority_receipt,"source_revision":outcome.receipt.revision(),
        "presentation":outcome.receipt.payload(),"projection_applied_checkpoint":null})).map_err(|_| CommandStoreError::Invalid)?;
    if raw.len() > MAX_OUTCOME {
        return Err(CommandStoreError::Invalid);
    }
    Ok(raw)
}

fn envelope_digest(raw: &str) -> Result<String, CommandStoreError> {
    let value: Value = serde_json::from_str(raw).map_err(|_| CommandStoreError::Invalid)?;
    canonical_digest(&value).map_err(|_| CommandStoreError::Invalid)
}

fn decode_stored_outcome(
    intent: &CommandIntent,
    binding: &OriginalPmBinding,
    row: &PgRow,
) -> Result<Option<PmOutcome>, CommandStoreError> {
    let Some(envelope_text) = row.try_get::<Option<String>, _>("outcome_json")? else {
        if row
            .try_get::<Option<String>, _>("outcome_digest")?
            .is_some()
        {
            return Err(CommandStoreError::Invalid);
        }
        return Ok(None);
    };
    if envelope_text.len() > MAX_OUTCOME
        || row
            .try_get::<Option<String>, _>("outcome_digest")?
            .as_deref()
            != Some(envelope_digest(&envelope_text)?.as_str())
    {
        return Err(CommandStoreError::Invalid);
    }
    decode_outcome(intent, &binding.source(intent)?, envelope_text.as_bytes())
        .map(Some)
        .map_err(|_| CommandStoreError::Invalid)
}
