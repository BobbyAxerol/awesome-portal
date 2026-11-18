//! `TEST_ONLY` lifecycle specimens, never source commissioning/capacity evidence.
use super::*;
use std::{
    collections::VecDeque,
    sync::{
        atomic::{AtomicUsize, Ordering},
        Arc,
    },
};

fn limits() -> WorkerLimits {
    WorkerLimits {
        poll_interval: Duration::from_millis(20),
        authority_timeout: Duration::from_millis(20),
        retry_base: Duration::from_millis(2),
        retry_max: Duration::from_millis(10),
        max_consecutive_failures: 3,
        jitter_seed: 7,
    }
}

#[test]
fn snapshot_without_actual_receipt_reports_only_progress() {
    assert_eq!(snapshot_completion_step(None), WorkerStep::Progress);
}

struct Driver {
    responses: VecDeque<Result<WorkerStep, WorkerError>>,
    starts: Vec<tokio::time::Instant>,
    work: Duration,
    stop_after: usize,
    stop: watch::Sender<bool>,
}

impl StepDriver for Driver {
    fn next(
        &mut self,
    ) -> Pin<Box<dyn Future<Output = Result<WorkerStep, WorkerError>> + Send + '_>> {
        Box::pin(async {
            self.starts.push(tokio::time::Instant::now());
            tokio::time::sleep(self.work).await;
            if self.starts.len() >= self.stop_after {
                self.stop.send(true).unwrap();
            }
            self.responses.pop_front().unwrap_or(Ok(WorkerStep::Idle))
        })
    }
}

fn driver(
    responses: Vec<Result<WorkerStep, WorkerError>>,
    stop_after: usize,
) -> (Driver, watch::Receiver<bool>) {
    let (stop, receiver) = watch::channel(false);
    (
        Driver {
            responses: responses.into(),
            starts: vec![],
            work: Duration::from_millis(1),
            stop_after,
            stop,
        },
        receiver,
    )
}

#[test]
fn configuration_has_no_implicit_unbounded_or_zero_retry_budget() {
    assert!(limits().validate().is_ok());
    for bad in [
        WorkerLimits {
            poll_interval: Duration::ZERO,
            ..limits()
        },
        WorkerLimits {
            authority_timeout: Duration::ZERO,
            ..limits()
        },
        WorkerLimits {
            retry_base: Duration::ZERO,
            ..limits()
        },
        WorkerLimits {
            retry_max: Duration::from_millis(1),
            ..limits()
        },
        WorkerLimits {
            max_consecutive_failures: 0,
            ..limits()
        },
        WorkerLimits {
            max_consecutive_failures: 1001,
            ..limits()
        },
        WorkerLimits {
            jitter_seed: 0,
            ..limits()
        },
    ] {
        assert!(bad.validate().is_err());
    }
}

#[test]
fn retries_are_nonzero_bounded_jitter_and_not_overflowing() {
    let mut random = 7;
    let mut observed = std::collections::BTreeSet::new();
    for failures in 1..=1000 {
        let duration = retry_delay(limits(), failures, &mut random);
        assert!(duration >= Duration::from_millis(1));
        assert!(duration <= limits().retry_max);
        observed.insert(duration);
    }
    assert!(observed.len() > 1);
}

#[test]
fn malformed_authority_or_source_bytes_are_not_retryable_availability() {
    for error in [
        WorkerError::Authority(SourceAuthorityError::Denied),
        WorkerError::Authority(SourceAuthorityError::Uncommissioned),
        WorkerError::Authority(SourceAuthorityError::Integrity),
        FinancialProjectionError::Binding.into(),
        FinancialProjectionError::Http(ReportHttpError::ResponseHeaders).into(),
        FinancialProjectionError::Store(BootstrapError::Resync).into(),
        FinancialProjectionError::Store(BootstrapError::Integrity).into(),
        FinancialProjectionError::Resource(ResourceError::Config).into(),
    ] {
        assert!(!error.retryable());
        assert!(!error.code().contains("TEST_ONLY-secret"));
    }
    for error in [
        WorkerError::Authority(SourceAuthorityError::Transient),
        WorkerError::AuthorityTimeout,
        FinancialProjectionError::Http(ReportHttpError::RequestFailed).into(),
        FinancialProjectionError::Store(BootstrapError::Deadline).into(),
        FinancialProjectionError::Resource(ResourceError::StorageHigh).into(),
    ] {
        assert!(error.retryable());
    }
}

#[tokio::test]
async fn terminal_denial_pauses_without_retry_or_advancement() {
    let (mut driver, receiver) = driver(vec![Err(SourceAuthorityError::Denied.into())], 100);
    assert_eq!(
        drive(&mut driver, limits(), receiver).await,
        WorkerExit::Paused {
            code: "SOURCE_AUTHORITY_DENIED",
            failures: 1
        }
    );
    assert_eq!(driver.starts.len(), 1);
}

#[tokio::test]
async fn transient_retry_budget_is_finite_and_preserves_original_step() {
    let errors = (0..3)
        .map(|_| Err(SourceAuthorityError::Transient.into()))
        .collect();
    let (mut driver, receiver) = driver(errors, 100);
    assert_eq!(
        drive(&mut driver, limits(), receiver).await,
        WorkerExit::Paused {
            code: "SOURCE_AUTHORITY_TRANSIENT",
            failures: 3
        }
    );
    assert_eq!(driver.starts.len(), 3);
    assert!(driver.starts.windows(2).all(|pair| pair[1] > pair[0]));
}

#[tokio::test]
async fn cadence_starts_after_slow_work_completes_not_before_it_started() {
    let (mut driver, receiver) = driver(vec![Ok(WorkerStep::Idle), Ok(WorkerStep::Idle)], 2);
    driver.work = Duration::from_millis(25);
    assert_eq!(
        drive(&mut driver, limits(), receiver).await,
        WorkerExit::Stopped
    );
    assert_eq!(driver.starts.len(), 2);
    assert!(driver.starts[1] - driver.starts[0] >= driver.work + limits().poll_interval);
}

#[tokio::test]
async fn shutdown_during_ack_wait_does_not_abort_or_invent_rollback() {
    let (mut driver, receiver) = driver(vec![Ok(WorkerStep::Acknowledged)], 100);
    driver.work = Duration::from_millis(20);
    let stop = driver.stop.clone();
    let job = tokio::spawn(async move {
        tokio::time::sleep(Duration::from_millis(5)).await;
        stop.send(true).unwrap();
    });
    let started = tokio::time::Instant::now();
    assert_eq!(
        drive(&mut driver, limits(), receiver).await,
        WorkerExit::Stopped
    );
    assert!(started.elapsed() >= driver.work);
    assert_eq!(driver.starts.len(), 1);
    job.await.unwrap();
}

#[tokio::test]
async fn shutdown_or_lost_shutdown_custody_prevents_any_source_operation() {
    let (mut first, receiver) = driver(vec![], 100);
    first.stop.send(true).unwrap();
    assert_eq!(
        drive(&mut first, limits(), receiver).await,
        WorkerExit::Stopped
    );
    assert!(first.starts.is_empty());
    let (sender, receiver) = watch::channel(false);
    drop(sender);
    let (mut second, _) = driver(vec![], 100);
    assert_eq!(
        drive(&mut second, limits(), receiver).await,
        WorkerExit::Stopped
    );
    assert!(second.starts.is_empty());
}

#[tokio::test]
async fn authority_operation_is_bounded_and_cancelled_without_an_ack() {
    let calls = Arc::new(AtomicUsize::new(0));
    let called = calls.clone();
    let future: AuthorityFuture<'_, ()> = Box::pin(async move {
        tokio::time::sleep(Duration::from_secs(1)).await;
        called.fetch_add(1, Ordering::SeqCst);
        Ok(())
    });
    assert!(matches!(
        bounded_authority(Duration::from_millis(1), future).await,
        Err(WorkerError::AuthorityTimeout)
    ));
    assert_eq!(calls.load(Ordering::SeqCst), 0);
}

#[tokio::test]
async fn successful_commit_is_followed_by_ack_before_next_source_poll() {
    let (mut driver, receiver) = driver(
        vec![
            Ok(WorkerStep::Progress),
            Ok(WorkerStep::Committed),
            Ok(WorkerStep::Acknowledged),
            Ok(WorkerStep::Idle),
        ],
        4,
    );
    assert_eq!(
        drive(&mut driver, limits(), receiver).await,
        WorkerExit::Stopped
    );
    assert_eq!(driver.starts.len(), 4);
    assert!(driver.starts[3] - driver.starts[2] >= driver.work + limits().poll_interval);
}

#[tokio::test]
async fn false_shutdown_updates_cannot_bypass_retry_or_poll_cadence() {
    let (sender, mut receiver) = watch::channel(false);
    let update = tokio::spawn(async move {
        for _ in 0..3 {
            tokio::time::sleep(Duration::from_millis(1)).await;
            sender.send(false).unwrap();
        }
        tokio::time::sleep(Duration::from_millis(30)).await;
    });
    let started = tokio::time::Instant::now();
    assert!(!wait_or_stop(&mut receiver, Duration::from_millis(15)).await);
    assert!(started.elapsed() >= Duration::from_millis(15));
    update.await.unwrap();
}
