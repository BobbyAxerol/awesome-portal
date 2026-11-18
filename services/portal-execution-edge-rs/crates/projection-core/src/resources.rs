//! Explicit, process-local admission. This is not a distributed lease, a disk
//! retention worker, a production budget default or a measurement of process RSS.
//! Callers must share one envelope and bind admission before acquiring a pool.

use std::sync::{Arc, Mutex, MutexGuard};
use std::time::Duration;

use chrono::{DateTime, Utc};
use thiserror::Error;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct EnvelopeLimits {
    pub max_active: usize,
    pub foreground_reserved: usize,
    pub foreground_reserved_entries: usize,
    pub foreground_reserved_bytes: usize,
    pub max_entries: usize,
    pub max_bytes: usize,
    pub storage_max_age: Duration,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WorkClass {
    LiveWrite,
    ControlRead,
    Interactive,
    BackgroundWrite,
    BackgroundRead,
}

impl WorkClass {
    const fn foreground(self) -> bool {
        matches!(self, Self::LiveWrite | Self::ControlRead)
    }

    const fn writes(self) -> bool {
        matches!(self, Self::LiveWrite | Self::BackgroundWrite)
    }
}

#[derive(Debug, Error, Clone, Copy, PartialEq, Eq)]
pub enum ResourceError {
    #[error("INVALID_RESOURCE_ENVELOPE")]
    Config,
    #[error("RESOURCE_WORK_BUSY")]
    Busy,
    #[error("RESOURCE_ENTRIES_EXHAUSTED")]
    Entries,
    #[error("RESOURCE_BYTES_EXHAUSTED")]
    Bytes,
    #[error("STORAGE_OBSERVATION_STALE")]
    StorageStale,
    #[error("STORAGE_HIGH_BACKGROUND_PAUSED")]
    StorageHigh,
    #[error("STORAGE_HARD_WRITES_PAUSED")]
    StorageHard,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct StorageObservation {
    pub observed_at: DateTime<Utc>,
    pub used_bytes: u64,
    pub free_bytes: u64,
    pub backlog_bytes: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct StorageLimits {
    pub soft_used_bytes: u64,
    pub high_used_bytes: u64,
    pub hard_used_bytes: u64,
    pub min_free_bytes: u64,
    pub max_backlog_bytes: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StoragePressure {
    Normal,
    Soft,
    High,
    Hard,
}

impl StorageLimits {
    fn validate(self) -> Result<(), ResourceError> {
        if self.soft_used_bytes == 0
            || self.soft_used_bytes >= self.high_used_bytes
            || self.high_used_bytes >= self.hard_used_bytes
            || self.min_free_bytes == 0
            || self.max_backlog_bytes == 0
        {
            return Err(ResourceError::Config);
        }
        Ok(())
    }

    const fn pressure(self, observation: StorageObservation) -> StoragePressure {
        if observation.used_bytes >= self.hard_used_bytes
            || observation.free_bytes < self.min_free_bytes
            || observation.backlog_bytes >= self.max_backlog_bytes
        {
            StoragePressure::Hard
        } else if observation.used_bytes >= self.high_used_bytes {
            StoragePressure::High
        } else if observation.used_bytes >= self.soft_used_bytes {
            StoragePressure::Soft
        } else {
            StoragePressure::Normal
        }
    }
}

/// Bounded counters and logical charges only; never payloads or identities.
/// Storage pressure describes the last observation, NOT a freshness guarantee.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub struct ResourceStats {
    pub active: usize,
    pub entries: usize,
    pub bytes: usize,
    pub background_active: usize,
    pub background_entries: usize,
    pub background_bytes: usize,
    pub peak_active: usize,
    pub peak_entries: usize,
    pub peak_bytes: usize,
    pub accepted: u64,
    pub registrations: u64,
    pub denied_busy: u64,
    pub denied_entries: u64,
    pub denied_bytes: u64,
    pub denied_storage: u64,
    pub storage_pressure: Option<StoragePressure>,
}

impl ResourceStats {
    fn denied(&mut self, error: ResourceError) {
        let counter = match error {
            ResourceError::Busy => &mut self.denied_busy,
            ResourceError::Entries => &mut self.denied_entries,
            ResourceError::Bytes => &mut self.denied_bytes,
            ResourceError::StorageStale
            | ResourceError::StorageHigh
            | ResourceError::StorageHard => &mut self.denied_storage,
            ResourceError::Config => return,
        };
        *counter = counter.saturating_add(1);
    }
}

#[derive(Debug, Default)]
struct State {
    stats: ResourceStats,
    storage: Option<(StorageObservation, StorageLimits)>,
}

#[derive(Debug)]
pub struct ResourceEnvelope {
    limits: EnvelopeLimits,
    state: Mutex<State>,
}

/// Exact process-local charge. Drop (including future cancellation) releases it;
/// sharing one reservation across object clones requires `Arc<ResourceLease>`.
#[derive(Debug)]
pub struct ResourceLease {
    envelope: Arc<ResourceEnvelope>,
    entries: usize,
    bytes: usize,
    active: bool,
    background: bool,
}

impl ResourceEnvelope {
    /// # Errors
    /// Rejects zero/exhaustive reserves, zero totals or missing finite freshness.
    pub fn new(limits: EnvelopeLimits) -> Result<Self, ResourceError> {
        if limits.foreground_reserved == 0
            || limits.foreground_reserved >= limits.max_active
            || limits.foreground_reserved_entries == 0
            || limits.foreground_reserved_entries >= limits.max_entries
            || limits.foreground_reserved_bytes == 0
            || limits.foreground_reserved_bytes >= limits.max_bytes
            || limits.storage_max_age.is_zero()
        {
            return Err(ResourceError::Config);
        }
        Ok(Self {
            limits,
            state: Mutex::new(State::default()),
        })
    }

    #[must_use]
    pub const fn limits(&self) -> EnvelopeLimits {
        self.limits
    }

    /// Fail-fast admission, with no waiter queue. Zero entry/byte charges are
    /// allowed for work which only needs an active slot. Storage is checked only
    /// for writes; existing admitted work is never silently revoked or dropped.
    /// # Errors
    /// Returns typed active/entry/byte exhaustion, or stale/high/hard storage.
    pub fn try_acquire(
        self: &Arc<Self>,
        class: WorkClass,
        entries: usize,
        bytes: usize,
        now: DateTime<Utc>,
    ) -> Result<ResourceLease, ResourceError> {
        let mut state = self.lock()?;
        let result = self.check_storage(&state, class, now).and_then(|()| {
            self.check_capacity(&state.stats, class.foreground(), true, entries, bytes)
        });
        if let Err(error) = result {
            state.stats.denied(error);
            return Err(error);
        }
        Self::charge(&mut state.stats, class.foreground(), true, entries, bytes);
        state.stats.accepted = state.stats.accepted.saturating_add(1);
        Ok(ResourceLease {
            envelope: Arc::clone(self),
            entries,
            bytes,
            active: true,
            background: !class.foreground(),
        })
    }

    /// Conservatively registers long-lived configured logical capacity. Counts
    /// as background entries/bytes but consumes NO active slot. The caller must
    /// include its maximum configured entries and serialized bytes, not usage.
    /// # Errors
    /// Rejects empty registrations and aggregate/reserved entry or byte overflow.
    pub fn try_register(
        self: &Arc<Self>,
        entries: usize,
        bytes: usize,
    ) -> Result<ResourceLease, ResourceError> {
        if entries == 0 || bytes == 0 {
            return Err(ResourceError::Config);
        }
        let mut state = self.lock()?;
        if let Err(error) = self.check_capacity(&state.stats, false, false, entries, bytes) {
            state.stats.denied(error);
            return Err(error);
        }
        Self::charge(&mut state.stats, false, false, entries, bytes);
        state.stats.registrations = state.stats.registrations.saturating_add(1);
        Ok(ResourceLease {
            envelope: Arc::clone(self),
            entries,
            bytes,
            active: false,
            background: true,
        })
    }

    /// Installs a trusted bounded storage sample, without deleting anything.
    /// Sample timestamps must advance; identical retries are idempotent. A
    /// future sample is stored but cannot authorize writes until it is current.
    /// # Errors
    /// Rejects invalid thresholds, regressing/conflicting observations or poison.
    pub fn observe_storage(
        &self,
        observation: StorageObservation,
        limits: StorageLimits,
    ) -> Result<(), ResourceError> {
        limits.validate()?;
        let mut state = self.lock()?;
        if let Some((previous, previous_limits)) = state.storage {
            if observation.observed_at < previous.observed_at
                || (observation.observed_at == previous.observed_at
                    && (observation != previous || limits != previous_limits))
            {
                return Err(ResourceError::Config);
            }
        }
        state.stats.storage_pressure = Some(limits.pressure(observation));
        state.storage = Some((observation, limits));
        Ok(())
    }

    /// # Errors
    /// Poisoned accounting fails closed; no guessed/reset usage is returned.
    pub fn stats(&self) -> Result<ResourceStats, ResourceError> {
        Ok(self.lock()?.stats)
    }

    fn lock(&self) -> Result<MutexGuard<'_, State>, ResourceError> {
        self.state.lock().map_err(|_| ResourceError::Busy)
    }

    fn check_storage(
        &self,
        state: &State,
        class: WorkClass,
        now: DateTime<Utc>,
    ) -> Result<(), ResourceError> {
        if !class.writes() {
            return Ok(());
        }
        let (observation, limits) = state.storage.ok_or(ResourceError::StorageStale)?;
        let age = now
            .signed_duration_since(observation.observed_at)
            .to_std()
            .map_err(|_| ResourceError::StorageStale)?;
        if age > self.limits.storage_max_age {
            return Err(ResourceError::StorageStale);
        }
        match limits.pressure(observation) {
            StoragePressure::Hard => Err(ResourceError::StorageHard),
            StoragePressure::High if class == WorkClass::BackgroundWrite => {
                Err(ResourceError::StorageHigh)
            }
            _ => Ok(()),
        }
    }

    fn check_capacity(
        &self,
        stats: &ResourceStats,
        foreground: bool,
        active: bool,
        entries: usize,
        bytes: usize,
    ) -> Result<(), ResourceError> {
        let limits = self.limits;
        if active
            && (stats.active >= limits.max_active
                || (!foreground
                    && stats.background_active >= limits.max_active - limits.foreground_reserved))
        {
            return Err(ResourceError::Busy);
        }
        if entries > limits.max_entries - stats.entries
            || (!foreground
                && entries
                    > (limits.max_entries - limits.foreground_reserved_entries)
                        - stats.background_entries)
        {
            return Err(ResourceError::Entries);
        }
        if bytes > limits.max_bytes - stats.bytes
            || (!foreground
                && bytes
                    > (limits.max_bytes - limits.foreground_reserved_bytes)
                        - stats.background_bytes)
        {
            return Err(ResourceError::Bytes);
        }
        Ok(())
    }

    fn charge(
        stats: &mut ResourceStats,
        foreground: bool,
        active: bool,
        entries: usize,
        bytes: usize,
    ) {
        stats.active += usize::from(active);
        stats.entries += entries;
        stats.bytes += bytes;
        if !foreground {
            stats.background_active += usize::from(active);
            stats.background_entries += entries;
            stats.background_bytes += bytes;
        }
        stats.peak_active = stats.peak_active.max(stats.active);
        stats.peak_entries = stats.peak_entries.max(stats.entries);
        stats.peak_bytes = stats.peak_bytes.max(stats.bytes);
    }
}

impl Drop for ResourceLease {
    fn drop(&mut self) {
        if let Ok(mut state) = self.envelope.state.lock() {
            let stats = &mut state.stats;
            stats.active -= usize::from(self.active);
            stats.entries -= self.entries;
            stats.bytes -= self.bytes;
            if self.background {
                stats.background_active -= usize::from(self.active);
                stats.background_entries -= self.entries;
                stats.background_bytes -= self.bytes;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn limits() -> EnvelopeLimits {
        EnvelopeLimits {
            max_active: 3,
            foreground_reserved: 1,
            foreground_reserved_entries: 2,
            foreground_reserved_bytes: 200,
            max_entries: 10,
            max_bytes: 1000,
            storage_max_age: Duration::from_secs(5),
        }
    }

    fn envelope() -> Arc<ResourceEnvelope> {
        Arc::new(ResourceEnvelope::new(limits()).unwrap())
    }

    fn at(seconds: i64) -> DateTime<Utc> {
        DateTime::from_timestamp(seconds, 0).unwrap()
    }

    fn storage(used: u64, free: u64, backlog: u64, seconds: i64) -> StorageObservation {
        StorageObservation {
            observed_at: at(seconds),
            used_bytes: used,
            free_bytes: free,
            backlog_bytes: backlog,
        }
    }

    fn storage_limits() -> StorageLimits {
        StorageLimits {
            soft_used_bytes: 500,
            high_used_bytes: 700,
            hard_used_bytes: 900,
            min_free_bytes: 100,
            max_backlog_bytes: 500,
        }
    }

    #[test]
    fn explicit_limits_reject_missing_or_exhaustive_reserves() {
        let valid = limits();
        let mut invalid = vec![EnvelopeLimits {
            max_active: 0,
            ..valid
        }];
        for reserve in [0, valid.max_active, usize::MAX] {
            invalid.push(EnvelopeLimits {
                foreground_reserved: reserve,
                ..valid
            });
        }
        for reserve in [0, valid.max_entries, usize::MAX] {
            invalid.push(EnvelopeLimits {
                foreground_reserved_entries: reserve,
                ..valid
            });
        }
        for reserve in [0, valid.max_bytes, usize::MAX] {
            invalid.push(EnvelopeLimits {
                foreground_reserved_bytes: reserve,
                ..valid
            });
        }
        invalid.push(EnvelopeLimits {
            storage_max_age: Duration::ZERO,
            ..valid
        });
        for value in invalid {
            assert_eq!(
                ResourceEnvelope::new(value).unwrap_err(),
                ResourceError::Config
            );
        }
        assert_eq!(envelope().limits(), valid);
    }

    #[test]
    fn foreground_slot_is_preserved_and_every_drop_releases() {
        let resources = envelope();
        let first = resources
            .try_acquire(WorkClass::Interactive, 1, 1, at(0))
            .unwrap();
        let second = resources
            .try_acquire(WorkClass::BackgroundRead, 1, 1, at(0))
            .unwrap();
        assert_eq!(
            resources
                .try_acquire(WorkClass::Interactive, 0, 0, at(0))
                .unwrap_err(),
            ResourceError::Busy
        );
        let control = resources
            .try_acquire(WorkClass::ControlRead, 1, 1, at(0))
            .unwrap();
        assert_eq!(resources.stats().unwrap().active, 3);
        assert_eq!(
            resources
                .try_acquire(WorkClass::ControlRead, 0, 0, at(0))
                .unwrap_err(),
            ResourceError::Busy
        );
        drop((first, second, control));
        let stats = resources.stats().unwrap();
        assert_eq!((stats.active, stats.entries, stats.bytes), (0, 0, 0));
        assert_eq!(stats.peak_active, 3);
        assert_eq!(stats.denied_busy, 2);
    }

    #[test]
    fn background_cannot_consume_foreground_entries_or_bytes() {
        let resources = envelope();
        let registration = resources.try_register(8, 800).unwrap();
        assert_eq!(
            resources
                .try_acquire(WorkClass::BackgroundRead, 1, 0, at(0))
                .unwrap_err(),
            ResourceError::Entries
        );
        assert_eq!(
            resources
                .try_acquire(WorkClass::BackgroundRead, 0, 1, at(0))
                .unwrap_err(),
            ResourceError::Bytes
        );
        let control = resources
            .try_acquire(WorkClass::ControlRead, 2, 200, at(0))
            .unwrap();
        assert_eq!(resources.stats().unwrap().entries, 10);
        assert_eq!(resources.stats().unwrap().bytes, 1000);
        assert_eq!(
            resources
                .try_acquire(WorkClass::ControlRead, 1, 0, at(0))
                .unwrap_err(),
            ResourceError::Entries
        );
        drop((registration, control));
        assert_eq!(resources.stats().unwrap().entries, 0);
    }

    #[test]
    fn foreground_does_not_unnecessarily_charge_background_share() {
        let resources = envelope();
        let control = resources
            .try_acquire(WorkClass::ControlRead, 2, 200, at(0))
            .unwrap();
        let background = resources.try_register(8, 800).unwrap();
        assert_eq!(resources.stats().unwrap().background_entries, 8);
        drop((control, background));
        assert_eq!(resources.stats().unwrap().background_bytes, 0);
    }

    #[test]
    fn registrations_are_aggregate_without_active_slots_and_arc_drop_is_exact() {
        let resources = envelope();
        let first = Arc::new(resources.try_register(4, 400).unwrap());
        let cloned = Arc::clone(&first);
        let second = resources.try_register(4, 400).unwrap();
        assert_eq!(resources.stats().unwrap().active, 0);
        assert_eq!(
            resources.try_register(1, 1).unwrap_err(),
            ResourceError::Entries
        );
        drop(first);
        assert_eq!(resources.stats().unwrap().entries, 8);
        drop(cloned);
        assert_eq!(resources.stats().unwrap().entries, 4);
        drop(second);
        assert_eq!(resources.stats().unwrap().bytes, 0);
        assert_eq!(resources.stats().unwrap().registrations, 2);
    }

    #[test]
    fn cancellation_releases_work_without_a_waiter_queue() {
        let resources = envelope();
        let lease = resources
            .try_acquire(WorkClass::BackgroundRead, 4, 400, at(0))
            .unwrap();
        let cancelled = async move {
            let _lease = lease;
            std::future::pending::<()>().await;
        };
        assert_eq!(resources.stats().unwrap().active, 1);
        drop(cancelled);
        assert_eq!(resources.stats().unwrap().active, 0);
        assert_eq!(resources.stats().unwrap().bytes, 0);
    }

    #[test]
    fn missing_stale_and_future_observations_fail_writes_not_reads() {
        let resources = envelope();
        assert_eq!(
            resources
                .try_acquire(WorkClass::LiveWrite, 1, 1, at(0))
                .unwrap_err(),
            ResourceError::StorageStale
        );
        resources
            .observe_storage(storage(100, 900, 0, 10), storage_limits())
            .unwrap();
        for now in [9, 16] {
            assert_eq!(
                resources
                    .try_acquire(WorkClass::LiveWrite, 1, 1, at(now))
                    .unwrap_err(),
                ResourceError::StorageStale
            );
        }
        drop(
            resources
                .try_acquire(WorkClass::ControlRead, 1, 1, at(16))
                .unwrap(),
        );
        drop(
            resources
                .try_acquire(WorkClass::LiveWrite, 1, 1, at(15))
                .unwrap(),
        );
        assert_eq!(resources.stats().unwrap().denied_storage, 3);
    }

    #[test]
    fn soft_and_high_pressure_keep_live_write_reserve() {
        let resources = envelope();
        resources
            .observe_storage(storage(500, 400, 0, 0), storage_limits())
            .unwrap();
        assert_eq!(
            resources.stats().unwrap().storage_pressure,
            Some(StoragePressure::Soft)
        );
        drop(
            resources
                .try_acquire(WorkClass::BackgroundWrite, 1, 1, at(0))
                .unwrap(),
        );
        resources
            .observe_storage(storage(700, 200, 0, 1), storage_limits())
            .unwrap();
        assert_eq!(
            resources
                .try_acquire(WorkClass::BackgroundWrite, 1, 1, at(1))
                .unwrap_err(),
            ResourceError::StorageHigh
        );
        drop(
            resources
                .try_acquire(WorkClass::LiveWrite, 1, 1, at(1))
                .unwrap(),
        );
        assert_eq!(
            resources.stats().unwrap().storage_pressure,
            Some(StoragePressure::High)
        );
    }

    #[test]
    fn every_hard_watermark_stops_all_writes_and_fresh_sample_resumes() {
        for observation in [
            storage(900, 100, 0, 0),
            storage(100, 99, 0, 0),
            storage(100, 900, 500, 0),
        ] {
            let resources = envelope();
            resources
                .observe_storage(observation, storage_limits())
                .unwrap();
            for class in [WorkClass::LiveWrite, WorkClass::BackgroundWrite] {
                assert_eq!(
                    resources.try_acquire(class, 1, 1, at(0)).unwrap_err(),
                    ResourceError::StorageHard
                );
            }
            drop(
                resources
                    .try_acquire(WorkClass::ControlRead, 1, 1, at(0))
                    .unwrap(),
            );
            resources
                .observe_storage(storage(100, 900, 0, 1), storage_limits())
                .unwrap();
            drop(
                resources
                    .try_acquire(WorkClass::LiveWrite, 1, 1, at(1))
                    .unwrap(),
            );
            assert_eq!(resources.stats().unwrap().active, 0);
        }
    }

    #[test]
    fn observations_are_monotonic_and_thresholds_fail_closed() {
        let resources = envelope();
        let sample = storage(700, 200, 0, 2);
        resources.observe_storage(sample, storage_limits()).unwrap();
        resources.observe_storage(sample, storage_limits()).unwrap();
        assert_eq!(
            resources.observe_storage(storage(100, 900, 0, 1), storage_limits()),
            Err(ResourceError::Config)
        );
        assert_eq!(
            resources.observe_storage(storage(100, 900, 0, 2), storage_limits()),
            Err(ResourceError::Config)
        );
        let mut invalid = storage_limits();
        invalid.high_used_bytes = invalid.soft_used_bytes;
        assert_eq!(
            resources.observe_storage(storage(100, 900, 0, 3), invalid),
            Err(ResourceError::Config)
        );
        assert_eq!(
            resources
                .try_acquire(WorkClass::BackgroundWrite, 0, 0, at(2))
                .unwrap_err(),
            ResourceError::StorageHigh
        );
    }

    #[test]
    fn oversized_registration_never_overflows_or_changes_usage() {
        let resources = envelope();
        assert_eq!(
            resources.try_register(usize::MAX, 1).unwrap_err(),
            ResourceError::Entries
        );
        assert_eq!(
            resources.try_register(1, usize::MAX).unwrap_err(),
            ResourceError::Bytes
        );
        assert_eq!(
            resources.try_register(0, 1).unwrap_err(),
            ResourceError::Config
        );
        assert_eq!(
            resources.try_register(1, 0).unwrap_err(),
            ResourceError::Config
        );
        assert_eq!(resources.stats().unwrap().entries, 0);
        assert_eq!(resources.stats().unwrap().bytes, 0);
    }
}
