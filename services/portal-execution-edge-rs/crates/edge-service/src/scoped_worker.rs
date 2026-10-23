//! Executable, bounded financial source lifecycle, not a source permit issuer.
//!
//! The owner must commission the independent authority below. HTTPS delivery,
//! a request assertion or a decoded digest NEVER creates `Verified<T>`. There
//! is deliberately no accepting implementation or invented ACK endpoint here.
//! One worker owns one exact stream; browser requests never construct workers.

use std::{future::Future, pin::Pin, time::Duration};

use authoritative_event_core::bootstrap::{
    Binding, DeltaChunk, DeltaGroup, Manifest, SnapshotPage, Verified,
};
use projection_core::resources::ResourceError;
use projection_store_pg::bootstrap::{BootstrapError, BootstrapHandle, BootstrapReceipt};
use thiserror::Error;
use tokio::sync::watch;
use ts_transport::{
    report_publication_http::ReportHttpError,
    report_publication_wire::{PreparedRequest, DATASET},
};

use crate::financial_projection::{
    FinancialProjection, FinancialProjectionError, PreparedFinancialDelta,
    PreparedFinancialSnapshot, SnapshotPlacement,
};

pub type AuthorityFuture<'a, T> =
    Pin<Box<dyn Future<Output = Result<T, SourceAuthorityError>> + Send + 'a>>;

/// Failures contain no assertion, source payload, URL or private reference.
#[derive(Debug, Clone, Copy, Error, PartialEq, Eq)]
pub enum SourceAuthorityError {
    #[error("SOURCE_AUTHORITY_TRANSIENT")]
    Transient,
    #[error("SOURCE_AUTHORITY_DENIED")]
    Denied,
    #[error("SOURCE_AUTHORITY_UNCOMMISSIONED")]
    Uncommissioned,
    #[error("SOURCE_AUTHORITY_INTEGRITY")]
    Integrity,
}

/// Current source-side authority/custody, supplied by the owning assembly.
/// Every method authenticates the exact original under CURRENT authority.
/// Implementations retain the actual request/attempt/receipt custody through
/// COMMIT and ACK; token freshness alone is not such custody. ACK must be
/// idempotent for the SAME original manifest/receipt after loss of response.
/// No method may turn a locally generated digest or TLS success into a proof.
pub trait FinancialSourceAuthority: Send + Sync {
    fn assertion<'a>(&'a self, request: &'a PreparedRequest) -> AuthorityFuture<'a, String>;
    fn manifest<'a>(&'a self, manifest: &'a Manifest) -> AuthorityFuture<'a, Verified<Manifest>>;
    fn page<'a>(
        &'a self,
        manifest: &'a Manifest,
        page: &'a SnapshotPage,
    ) -> AuthorityFuture<'a, Verified<SnapshotPage>>;
    fn chunk<'a>(
        &'a self,
        manifest: &'a Manifest,
        chunk: &'a DeltaChunk,
    ) -> AuthorityFuture<'a, Verified<DeltaChunk>>;
    fn group<'a>(
        &'a self,
        manifest: &'a Manifest,
        group: &'a DeltaGroup,
    ) -> AuthorityFuture<'a, Verified<DeltaGroup>>;
    fn control<'a>(&'a self, binding: &'a Binding) -> AuthorityFuture<'a, Verified<Binding>>;
    fn acknowledge<'a>(
        &'a self,
        manifest: &'a Manifest,
        receipt: &'a BootstrapReceipt,
    ) -> AuthorityFuture<'a, ()>;
}

/// Explicit owner placement; a successful network request cannot promote it.
#[derive(Clone, Copy)]
pub enum WorkerPlacement {
    Auto,
    Shadow,
}

impl WorkerPlacement {
    const fn projection(self) -> SnapshotPlacement {
        match self {
            Self::Auto => SnapshotPlacement::Auto,
            Self::Shadow => SnapshotPlacement::Shadow,
        }
    }
}

/// Never silently fetch a new snapshot/generation on process restart.
pub enum WorkerStart {
    Bootstrap {
        placement: WorkerPlacement,
    },
    /// The owner retains the original manifest, NOT a browser cursor. Actual PG
    /// state decides between same-page recovery and a committed tail checkpoint.
    Resume {
        manifest: Manifest,
        placement: WorkerPlacement,
    },
}

/// Required finite configuration, with no invented production defaults.
#[derive(Clone, Copy)]
pub struct WorkerLimits {
    pub poll_interval: Duration,
    pub authority_timeout: Duration,
    pub retry_base: Duration,
    pub retry_max: Duration,
    pub max_consecutive_failures: u32,
    /// A nonzero independent per-worker jitter seed; not cryptographic entropy.
    pub jitter_seed: u64,
}

impl WorkerLimits {
    /// # Errors
    /// Rejects absent or unbounded lifecycle budgets before source I/O.
    pub fn validate(self) -> Result<(), WorkerError> {
        if self.poll_interval < Duration::from_millis(1)
            || self.poll_interval > Duration::from_secs(3600)
            || self.authority_timeout.is_zero()
            || self.authority_timeout > Duration::from_secs(10)
            || self.retry_base < Duration::from_millis(1)
            || self.retry_max < self.retry_base
            || self.retry_max > Duration::from_secs(3600)
            || !(1..=1000).contains(&self.max_consecutive_failures)
            || self.jitter_seed == 0
        {
            return Err(WorkerError::Configuration);
        }
        Ok(())
    }
}

#[derive(Debug, Error)]
pub enum WorkerError {
    #[error("SOURCE_WORKER_CONFIGURATION")]
    Configuration,
    #[error(transparent)]
    Authority(#[from] SourceAuthorityError),
    #[error("SOURCE_WORKER_AUTHORITY_TIMEOUT")]
    AuthorityTimeout,
    #[error("SOURCE_WORKER_PROJECTION_REJECTED")]
    Projection(#[from] FinancialProjectionError),
}

impl WorkerError {
    #[must_use]
    pub const fn retryable(&self) -> bool {
        match self {
            Self::Authority(SourceAuthorityError::Transient) | Self::AuthorityTimeout => true,
            Self::Projection(error) => projection_retryable(error),
            _ => false,
        }
    }

    /// Static bounded diagnostics only; never render an upstream database error.
    #[must_use]
    pub const fn code(&self) -> &'static str {
        match self {
            Self::Configuration => "SOURCE_WORKER_CONFIGURATION",
            Self::Authority(SourceAuthorityError::Transient) => "SOURCE_AUTHORITY_TRANSIENT",
            Self::Authority(SourceAuthorityError::Denied) => "SOURCE_AUTHORITY_DENIED",
            Self::Authority(SourceAuthorityError::Uncommissioned) => {
                "SOURCE_AUTHORITY_UNCOMMISSIONED"
            }
            Self::Authority(SourceAuthorityError::Integrity) => "SOURCE_AUTHORITY_INTEGRITY",
            Self::AuthorityTimeout => "SOURCE_WORKER_AUTHORITY_TIMEOUT",
            Self::Projection(_) => "SOURCE_WORKER_PROJECTION_REJECTED",
        }
    }
}

const fn projection_retryable(error: &FinancialProjectionError) -> bool {
    match error {
        FinancialProjectionError::Http(
            ReportHttpError::QueueSaturated | ReportHttpError::RequestFailed,
        )
        | FinancialProjectionError::Store(
            BootstrapError::Database(_) | BootstrapError::Deadline | BootstrapError::FreshPending,
        ) => true,
        FinancialProjectionError::Resource(error)
        | FinancialProjectionError::Store(BootstrapError::Resource(error)) => {
            !matches!(error, ResourceError::Config)
        }
        _ => false,
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WorkerStep {
    /// Bounded local staging advanced; no public source ACK is implied.
    Progress,
    /// Empty unproved poll never advances or ACKs a source cursor.
    Idle,
    /// SQL COMMIT returned its actual receipt; source ACK is still outstanding.
    Committed,
    /// The independently commissioned source ACK completed.
    Acknowledged,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WorkerExit {
    Stopped,
    Paused { code: &'static str, failures: u32 },
}

enum State {
    FetchSnapshot,
    Snapshot {
        candidate: Box<PreparedFinancialSnapshot>,
        handle: Option<BootstrapHandle>,
        next: usize,
    },
    ResumeManifest(Box<Manifest>),
    Recover {
        handle: BootstrapHandle,
        may_stage: bool,
    },
    ResumePages {
        handle: BootstrapHandle,
        next: u64,
    },
    Tail {
        handle: BootstrapHandle,
        cursor: String,
    },
    Delta {
        handle: BootstrapHandle,
        candidate: Box<PreparedFinancialDelta>,
        next: usize,
    },
    Ack {
        handle: BootstrapHandle,
        receipt: BootstrapReceipt,
    },
}

/// Owning executable lifecycle around the actual mTLS/wire/financial/PG path.
/// Cancellation is observed at bounded operation boundaries, NOT by aborting a
/// possible COMMIT and then guessing rollback. A stopped worker can be retained
/// and run again; a restarted process uses the original committed manifest and
/// actual PG checkpoint. It never constructs a receipt or increments a cursor.
pub struct FinancialSourceWorker<'a> {
    projection: FinancialProjection<'a>,
    authority: &'a dyn FinancialSourceAuthority,
    placement: WorkerPlacement,
    limits: WorkerLimits,
    state: State,
}

impl<'a> FinancialSourceWorker<'a> {
    /// # Errors
    /// Rejects invalid limits; no source/authority operation occurs here.
    pub fn new(
        projection: FinancialProjection<'a>,
        authority: &'a dyn FinancialSourceAuthority,
        start: WorkerStart,
        limits: WorkerLimits,
    ) -> Result<Self, WorkerError> {
        limits.validate()?;
        let (placement, state) = match start {
            WorkerStart::Bootstrap { placement } => (placement, State::FetchSnapshot),
            WorkerStart::Resume {
                manifest,
                placement,
            } => (placement, State::ResumeManifest(Box::new(manifest))),
        };
        Ok(Self {
            projection,
            authority,
            placement,
            limits,
            state,
        })
    }

    /// Completes one bounded transition; failed transitions retain SAME input.
    /// In particular, ambiguous COMMIT retries the same immutable group and ACK
    /// loss retries only the same real receipt, never another snapshot/SUBMIT.
    /// # Errors
    /// Authority/integrity/schema failures fail closed; classified transient
    /// failures can be paced by `run` without changing original custody.
    pub async fn step(&mut self) -> Result<WorkerStep, WorkerError> {
        let context = StepContext {
            projection: &self.projection,
            authority: self.authority,
            timeout: self.limits.authority_timeout,
            placement: self.placement,
        };
        let transition = match &mut self.state {
            State::FetchSnapshot => context.fetch_snapshot().await?,
            State::Snapshot {
                candidate,
                handle,
                next,
            } => context.snapshot(candidate, handle, next).await?,
            State::ResumeManifest(manifest) => context.resume_manifest(manifest).await?,
            State::Recover { handle, may_stage } => context.recover(handle, *may_stage).await?,
            State::ResumePages { handle, next } => context.resume_pages(handle, next).await?,
            State::Tail { handle, cursor } => context.tail(handle, cursor).await?,
            State::Delta {
                handle,
                candidate,
                next,
            } => context.delta(handle, candidate, next).await?,
            State::Ack { handle, receipt } => context.ack(handle, receipt).await?,
        };
        if let Some(state) = transition.state {
            self.state = state;
        }
        Ok(transition.step)
    }

    /// Executes the worker, with completion-based cadence, finite retry budget
    /// and no detached tasks. Closed shutdown custody is fail-closed shutdown.
    pub async fn run(&mut self, stop: watch::Receiver<bool>) -> WorkerExit {
        let limits = self.limits;
        drive(self, limits, stop).await
    }
}

struct Transition {
    state: Option<State>,
    step: WorkerStep,
}

impl Transition {
    const fn progress() -> Self {
        Self {
            state: None,
            step: WorkerStep::Progress,
        }
    }

    const fn advance(state: State, step: WorkerStep) -> Self {
        Self {
            state: Some(state),
            step,
        }
    }

    fn finished(handle: &BootstrapHandle, receipt: Option<BootstrapReceipt>) -> Self {
        let step = snapshot_completion_step(receipt.as_ref());
        let state = receipt.map_or_else(
            || State::Recover {
                handle: handle.clone(),
                may_stage: false,
            },
            |receipt| State::Ack {
                handle: handle.clone(),
                receipt,
            },
        );
        Self::advance(state, step)
    }
}

const fn snapshot_completion_step(receipt: Option<&BootstrapReceipt>) -> WorkerStep {
    if receipt.is_some() {
        WorkerStep::Committed
    } else {
        WorkerStep::Progress
    }
}

struct StepContext<'w, 'a> {
    projection: &'w FinancialProjection<'a>,
    authority: &'w dyn FinancialSourceAuthority,
    timeout: Duration,
    placement: WorkerPlacement,
}

impl StepContext<'_, '_> {
    async fn fetch_snapshot(&self) -> Result<Transition, WorkerError> {
        let request = FinancialProjection::snapshot_request();
        let assertion = bounded_authority(self.timeout, self.authority.assertion(&request)).await?;
        let candidate = self.projection.fetch_snapshot(&assertion).await?;
        Ok(Transition::advance(
            State::Snapshot {
                candidate: Box::new(candidate),
                handle: None,
                next: 0,
            },
            WorkerStep::Progress,
        ))
    }

    async fn snapshot(
        &self,
        candidate: &PreparedFinancialSnapshot,
        handle: &mut Option<BootstrapHandle>,
        next: &mut usize,
    ) -> Result<Transition, WorkerError> {
        if let Some(current) = handle {
            if let Some(page) = candidate.pages().get(*next) {
                let proof = bounded_authority(
                    self.timeout,
                    self.authority.page(candidate.manifest(), page),
                )
                .await?;
                self.projection
                    .stage_page(candidate, *next, current, &proof)
                    .await?;
                *next += 1;
            } else {
                let control = bounded_authority(
                    self.timeout,
                    self.authority.control(&candidate.manifest().binding),
                )
                .await?;
                let receipt = self
                    .projection
                    .finish_snapshot(candidate, current, &control)
                    .await?;
                return Ok(Transition::finished(current, receipt));
            }
        } else {
            let proof =
                bounded_authority(self.timeout, self.authority.manifest(candidate.manifest()))
                    .await?;
            *handle = Some(
                self.projection
                    .begin_snapshot(candidate, &proof, self.placement.projection())
                    .await?,
            );
        }
        Ok(Transition::progress())
    }

    async fn resume_manifest(&self, manifest: &Manifest) -> Result<Transition, WorkerError> {
        let proof = bounded_authority(self.timeout, self.authority.manifest(manifest)).await?;
        if proof.value() != manifest {
            return Err(FinancialProjectionError::Binding.into());
        }
        let handle = self
            .projection
            .resume_manifest(&proof, self.placement.projection())
            .await?;
        Ok(Transition::advance(
            State::Recover {
                handle,
                may_stage: true,
            },
            WorkerStep::Progress,
        ))
    }

    async fn recover(
        &self,
        handle: &BootstrapHandle,
        may_stage: bool,
    ) -> Result<Transition, WorkerError> {
        let control = bounded_authority(
            self.timeout,
            self.authority.control(&handle.manifest().binding),
        )
        .await?;
        let receipt = match self.projection.checkpoint(handle, &control).await {
            Ok(receipt) => receipt,
            // resume_manifest authenticated the SAME writer and accepted only
            // INITIALIZING/CATCHING_UP/READY. Of those, checkpoint refuses only
            // INITIALIZING. A concurrent fence change is checked again by every
            // following operation; this never advances a RESYNC cursor.
            Err(FinancialProjectionError::Store(BootstrapError::Resync)) if may_stage => {
                return Ok(Transition::advance(
                    State::ResumePages {
                        handle: handle.clone(),
                        next: 0,
                    },
                    WorkerStep::Progress,
                ));
            }
            Err(error) => return Err(error.into()),
        };
        Ok(Transition::advance(
            State::Ack {
                handle: handle.clone(),
                receipt,
            },
            WorkerStep::Committed,
        ))
    }

    async fn resume_pages(
        &self,
        handle: &BootstrapHandle,
        next: &mut u64,
    ) -> Result<Transition, WorkerError> {
        let plan = handle
            .manifest()
            .pages
            .get(DATASET)
            .ok_or(FinancialProjectionError::Binding)?;
        if *next < plan.count {
            let request = self.projection.page_request(handle, *next)?;
            let assertion =
                bounded_authority(self.timeout, self.authority.assertion(&request)).await?;
            let page = self
                .projection
                .fetch_page(handle, *next, &assertion)
                .await?;
            let proof =
                bounded_authority(self.timeout, self.authority.page(handle.manifest(), &page))
                    .await?;
            // Seal the EXACT fetched page, not another plausible same-index one.
            if proof.value() != &page {
                return Err(FinancialProjectionError::Binding.into());
            }
            self.projection.stage_resumed_page(handle, &proof).await?;
            *next += 1;
            Ok(Transition::progress())
        } else {
            let control = bounded_authority(
                self.timeout,
                self.authority.control(&handle.manifest().binding),
            )
            .await?;
            let receipt = self
                .projection
                .finish_resumed_snapshot(handle, &control)
                .await?;
            Ok(Transition::finished(handle, receipt))
        }
    }

    async fn tail(
        &self,
        handle: &BootstrapHandle,
        cursor: &str,
    ) -> Result<Transition, WorkerError> {
        let request = self.projection.delta_request(handle, cursor)?;
        let assertion = bounded_authority(self.timeout, self.authority.assertion(&request)).await?;
        let candidate = self
            .projection
            .fetch_delta(handle, cursor, &assertion)
            .await?;
        if candidate.group().is_none() {
            return Ok(Transition {
                state: None,
                step: WorkerStep::Idle,
            });
        }
        Ok(Transition::advance(
            State::Delta {
                handle: handle.clone(),
                candidate: Box::new(candidate),
                next: 0,
            },
            WorkerStep::Progress,
        ))
    }

    async fn delta(
        &self,
        handle: &BootstrapHandle,
        candidate: &PreparedFinancialDelta,
        next: &mut usize,
    ) -> Result<Transition, WorkerError> {
        if let Some(chunk) = candidate.chunks().get(*next) {
            let proof =
                bounded_authority(self.timeout, self.authority.chunk(handle.manifest(), chunk))
                    .await?;
            self.projection
                .stage_chunk(candidate, *next, handle, &proof)
                .await?;
            *next += 1;
            Ok(Transition::progress())
        } else {
            let group = candidate.group().ok_or(FinancialProjectionError::Binding)?;
            let proof =
                bounded_authority(self.timeout, self.authority.group(handle.manifest(), group))
                    .await?;
            let receipt = self
                .projection
                .commit_group(candidate, handle, &proof)
                .await?;
            Ok(Transition::advance(
                State::Ack {
                    handle: handle.clone(),
                    receipt,
                },
                WorkerStep::Committed,
            ))
        }
    }

    async fn ack(
        &self,
        handle: &BootstrapHandle,
        receipt: &BootstrapReceipt,
    ) -> Result<Transition, WorkerError> {
        bounded_authority(
            self.timeout,
            self.authority.acknowledge(handle.manifest(), receipt),
        )
        .await?;
        Ok(Transition::advance(
            State::Tail {
                handle: handle.clone(),
                cursor: receipt.cursor().to_owned(),
            },
            WorkerStep::Acknowledged,
        ))
    }
}

async fn bounded_authority<T>(
    timeout: Duration,
    work: AuthorityFuture<'_, T>,
) -> Result<T, WorkerError> {
    tokio::time::timeout(timeout, work)
        .await
        .map_err(|_| WorkerError::AuthorityTimeout)?
        .map_err(WorkerError::Authority)
}

trait StepDriver {
    fn next(
        &mut self,
    ) -> Pin<Box<dyn Future<Output = Result<WorkerStep, WorkerError>> + Send + '_>>;
}

impl StepDriver for FinancialSourceWorker<'_> {
    fn next(
        &mut self,
    ) -> Pin<Box<dyn Future<Output = Result<WorkerStep, WorkerError>> + Send + '_>> {
        Box::pin(self.step())
    }
}

async fn drive(
    driver: &mut impl StepDriver,
    limits: WorkerLimits,
    mut stop: watch::Receiver<bool>,
) -> WorkerExit {
    let mut failures = 0_u32;
    let mut random = limits.jitter_seed;
    loop {
        if *stop.borrow() || stop.has_changed().is_err() {
            return WorkerExit::Stopped;
        }
        // Do not abort an in-progress SQL COMMIT on cancellation. Every source,
        // authority and store operation has its independent finite deadline.
        let delay = match driver.next().await {
            Ok(WorkerStep::Progress | WorkerStep::Committed) => {
                failures = 0;
                tokio::task::yield_now().await;
                continue;
            }
            Ok(WorkerStep::Idle | WorkerStep::Acknowledged) => {
                failures = 0;
                limits.poll_interval
            }
            Err(error) => {
                failures = failures.saturating_add(1);
                if !error.retryable() || failures >= limits.max_consecutive_failures {
                    return WorkerExit::Paused {
                        code: error.code(),
                        failures,
                    };
                }
                retry_delay(limits, failures, &mut random)
            }
        };
        if wait_or_stop(&mut stop, delay).await {
            return WorkerExit::Stopped;
        }
    }
}

async fn wait_or_stop(stop: &mut watch::Receiver<bool>, delay: Duration) -> bool {
    let deadline = tokio::time::Instant::now() + delay;
    loop {
        if *stop.borrow() {
            return true;
        }
        tokio::select! {
            () = tokio::time::sleep_until(deadline) => return false,
            changed = stop.changed() => {
                if changed.is_err() || *stop.borrow() {
                    return true;
                }
                // An informational false update cannot skip retry/cadence.
            }
        }
    }
}

fn retry_delay(limits: WorkerLimits, failures: u32, random: &mut u64) -> Duration {
    let ceiling = limits
        .retry_base
        .saturating_mul(1_u32 << failures.saturating_sub(1).min(20))
        .min(limits.retry_max);
    *random ^= *random << 13;
    *random ^= *random >> 7;
    *random ^= *random << 17;
    // Full jitter except zero: at least one millisecond prevents a hot retry.
    let maximum_ms = u64::try_from(ceiling.as_millis())
        .unwrap_or(u64::MAX)
        .max(1);
    Duration::from_millis(1 + *random % maximum_ms)
}

#[cfg(test)]
mod tests;
