//! Opt-in logical JSON accounting, not allocator, RSS or SQL-result accounting.

use std::io::{self, Write};

use serde::Serialize;
use thiserror::Error;

/// Explicit per-record fields, retained fact and working-copy JSON limits.
/// These bounds do not estimate Rust allocation overhead or process memory.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ManagerMaterializationLimits {
    max_record_json_bytes: usize,
    max_retained_json_bytes: usize,
    max_working_json_bytes: usize,
}

impl ManagerMaterializationLimits {
    /// Creates limits without implicit production defaults.
    ///
    /// # Errors
    /// Rejects zero bounds or bounds not ordered record <= retained <= working.
    pub fn new(
        max_record_json_bytes: usize,
        max_retained_json_bytes: usize,
        max_working_json_bytes: usize,
    ) -> Result<Self, ManagerMaterializationError> {
        if max_record_json_bytes == 0
            || max_record_json_bytes > max_retained_json_bytes
            || max_retained_json_bytes > max_working_json_bytes
        {
            return Err(ManagerMaterializationError::InvalidLimits);
        }
        Ok(Self {
            max_record_json_bytes,
            max_retained_json_bytes,
            max_working_json_bytes,
        })
    }

    #[must_use]
    pub const fn max_record_json_bytes(self) -> usize {
        self.max_record_json_bytes
    }

    #[must_use]
    pub const fn max_retained_json_bytes(self) -> usize {
        self.max_retained_json_bytes
    }

    #[must_use]
    pub const fn max_working_json_bytes(self) -> usize {
        self.max_working_json_bytes
    }

    /// Counts source-record fields before materializing an owned JSON value.
    /// Fact identity/envelope bytes are accounted separately by the fact.
    ///
    /// # Errors
    /// Rejects serialization failure, arithmetic overflow or an oversized record.
    pub fn check_record_json_bytes<T: Serialize + ?Sized>(
        self,
        fields: &T,
    ) -> Result<usize, ManagerMaterializationError> {
        bounded_json_bytes(fields, self.max_record_json_bytes).map_err(|error| match error {
            ManagerMaterializationError::JsonLimitExceeded => {
                ManagerMaterializationError::RecordJsonLimitExceeded
            }
            error => error,
        })
    }

    /// Validates a previously checked sum of retained fact JSON bytes.
    ///
    /// # Errors
    /// Rejects a sum above the explicit retained limit.
    pub fn check_retained_json_bytes(
        self,
        bytes: usize,
    ) -> Result<usize, ManagerMaterializationError> {
        if bytes > self.max_retained_json_bytes {
            return Err(ManagerMaterializationError::RetainedJsonLimitExceeded);
        }
        Ok(bytes)
    }

    /// Validates checked sums/copies that coexist during materialization.
    ///
    /// # Errors
    /// Rejects a sum above the explicit working limit.
    pub fn check_working_json_bytes(
        self,
        bytes: usize,
    ) -> Result<usize, ManagerMaterializationError> {
        if bytes > self.max_working_json_bytes {
            return Err(ManagerMaterializationError::WorkingJsonLimitExceeded);
        }
        Ok(bytes)
    }
}

/// Counts serialized JSON through a fixed-state sink without retaining output.
/// The sink stops at the first write that would exceed `maximum`; serializer
/// scratch space and allocations inside a custom `Serialize` are not governed.
///
/// # Errors
/// Rejects serialization failure, count overflow or bytes above `maximum`.
pub fn bounded_json_bytes<T: Serialize + ?Sized>(
    value: &T,
    maximum: usize,
) -> Result<usize, ManagerMaterializationError> {
    let mut writer = CountingWriter {
        bytes: 0,
        maximum,
        failure: None,
    };
    if serde_json::to_writer(&mut writer, value).is_err() || writer.failure.is_some() {
        return Err(match writer.failure {
            Some(CountFailure::Overflow) => ManagerMaterializationError::ByteCountOverflow,
            Some(CountFailure::Limit) => ManagerMaterializationError::JsonLimitExceeded,
            None => ManagerMaterializationError::JsonSerialization,
        });
    }
    Ok(writer.bytes)
}

/// Adds logical JSON populations without wrapping an accumulated byte count.
///
/// # Errors
/// Rejects arithmetic overflow.
pub fn checked_json_byte_sum(
    left: usize,
    right: usize,
) -> Result<usize, ManagerMaterializationError> {
    left.checked_add(right)
        .ok_or(ManagerMaterializationError::ByteCountOverflow)
}

/// Counts simultaneously retained logical JSON copies without wrapping.
///
/// # Errors
/// Rejects arithmetic overflow.
pub fn checked_json_byte_copies(
    bytes: usize,
    copies: usize,
) -> Result<usize, ManagerMaterializationError> {
    bytes
        .checked_mul(copies)
        .ok_or(ManagerMaterializationError::ByteCountOverflow)
}

#[derive(Debug, Error, Clone, Copy, PartialEq, Eq)]
pub enum ManagerMaterializationError {
    #[error("Manager materialization limits are invalid")]
    InvalidLimits,
    #[error("Manager logical JSON serialization failed")]
    JsonSerialization,
    #[error("Manager logical JSON byte count overflowed")]
    ByteCountOverflow,
    #[error("Manager logical JSON byte limit exceeded")]
    JsonLimitExceeded,
    #[error("Manager record fields JSON byte limit exceeded")]
    RecordJsonLimitExceeded,
    #[error("Manager retained fact JSON byte limit exceeded")]
    RetainedJsonLimitExceeded,
    #[error("Manager working JSON byte limit exceeded")]
    WorkingJsonLimitExceeded,
}

enum CountFailure {
    Overflow,
    Limit,
}

struct CountingWriter {
    bytes: usize,
    maximum: usize,
    failure: Option<CountFailure>,
}

impl Write for CountingWriter {
    fn write(&mut self, buffer: &[u8]) -> io::Result<usize> {
        if self.failure.is_some() {
            return Err(io::Error::other("JSON byte accounting already failed"));
        }
        let Some(total) = self.bytes.checked_add(buffer.len()) else {
            self.failure = Some(CountFailure::Overflow);
            return Err(io::Error::other("JSON byte count overflow"));
        };
        if total > self.maximum {
            self.failure = Some(CountFailure::Limit);
            return Err(io::Error::other("JSON byte limit exceeded"));
        }
        self.bytes = total;
        Ok(buffer.len())
    }

    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn limits_are_explicit_positive_and_monotonic() {
        for (record, retained, working) in [(0, 1, 1), (1, 0, 1), (1, 1, 0), (2, 1, 2), (1, 3, 2)] {
            assert_eq!(
                ManagerMaterializationLimits::new(record, retained, working),
                Err(ManagerMaterializationError::InvalidLimits)
            );
        }
        let limits = ManagerMaterializationLimits::new(1, 2, 3).unwrap();
        assert_eq!(limits.max_record_json_bytes(), 1);
        assert_eq!(limits.max_retained_json_bytes(), 2);
        assert_eq!(limits.max_working_json_bytes(), 3);
        assert!(ManagerMaterializationLimits::new(1, 1, 1).is_ok());
    }

    #[test]
    fn json_count_matches_escaped_unicode_bytes_at_exact_boundary() {
        let value = json!({"TEST_ONLY": "\"\\\n\t\u{0000}Việt 😀"});
        let expected = serde_json::to_vec(&value).unwrap().len();
        assert_eq!(bounded_json_bytes(&value, expected), Ok(expected));
        assert_eq!(
            bounded_json_bytes(&value, expected - 1),
            Err(ManagerMaterializationError::JsonLimitExceeded)
        );
        assert_eq!(bounded_json_bytes(&value, usize::MAX), Ok(expected));
    }

    #[test]
    fn record_retained_and_working_bounds_are_inclusive() {
        let limits = ManagerMaterializationLimits::new(4, 8, 16).unwrap();
        assert_eq!(limits.check_record_json_bytes(&"ab"), Ok(4));
        assert_eq!(
            limits.check_record_json_bytes(&"abc"),
            Err(ManagerMaterializationError::RecordJsonLimitExceeded)
        );
        assert_eq!(limits.check_retained_json_bytes(8), Ok(8));
        assert_eq!(
            limits.check_retained_json_bytes(9),
            Err(ManagerMaterializationError::RetainedJsonLimitExceeded)
        );
        assert_eq!(limits.check_working_json_bytes(16), Ok(16));
        assert_eq!(
            limits.check_working_json_bytes(17),
            Err(ManagerMaterializationError::WorkingJsonLimitExceeded)
        );
    }

    #[test]
    fn checked_sums_and_copies_reject_overflow() {
        assert_eq!(checked_json_byte_sum(usize::MAX, 0), Ok(usize::MAX));
        assert_eq!(
            checked_json_byte_sum(usize::MAX, 1),
            Err(ManagerMaterializationError::ByteCountOverflow)
        );
        assert_eq!(checked_json_byte_copies(usize::MAX, 1), Ok(usize::MAX));
        assert_eq!(checked_json_byte_copies(usize::MAX, 0), Ok(0));
        assert_eq!(
            checked_json_byte_copies(usize::MAX, 2),
            Err(ManagerMaterializationError::ByteCountOverflow)
        );
        let mut writer = CountingWriter {
            bytes: usize::MAX,
            maximum: usize::MAX,
            failure: None,
        };
        assert!(writer.write(b"x").is_err());
        assert!(matches!(writer.failure, Some(CountFailure::Overflow)));
    }

    #[test]
    fn combined_populations_and_copies_share_one_working_bound() {
        let limits = ManagerMaterializationLimits::new(4, 8, 16).unwrap();
        let retained = checked_json_byte_sum(3, 5).unwrap();
        assert_eq!(limits.check_retained_json_bytes(retained), Ok(8));
        assert_eq!(
            limits.check_working_json_bytes(checked_json_byte_copies(retained, 2).unwrap()),
            Ok(16)
        );
        let with_next_record = checked_json_byte_sum(retained, 1).unwrap();
        assert_eq!(
            limits.check_working_json_bytes(checked_json_byte_copies(with_next_record, 2).unwrap()),
            Err(ManagerMaterializationError::WorkingJsonLimitExceeded)
        );
    }

    #[test]
    fn serialization_failure_does_not_expose_payload() {
        struct Invalid;
        impl Serialize for Invalid {
            fn serialize<S: serde::Serializer>(&self, _serializer: S) -> Result<S::Ok, S::Error> {
                Err(serde::ser::Error::custom("TEST_ONLY_PRIVATE_PAYLOAD"))
            }
        }
        let error = bounded_json_bytes(&Invalid, 1024).unwrap_err();
        assert_eq!(error, ManagerMaterializationError::JsonSerialization);
        assert!(!format!("{error:?} {error}").contains("TEST_ONLY_PRIVATE_PAYLOAD"));
    }

    #[test]
    fn writer_failure_is_latched_after_a_serializer_ignores_an_error() {
        struct IgnoredFailure;
        impl Serialize for IgnoredFailure {
            fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
                use serde::ser::SerializeSeq as _;
                let mut sequence = serializer.serialize_seq(Some(1))?;
                let _ignored = sequence.serialize_element("TEST_ONLY_OVERSIZE");
                sequence.end()
            }
        }
        assert_eq!(
            bounded_json_bytes(&IgnoredFailure, 4),
            Err(ManagerMaterializationError::JsonLimitExceeded)
        );
    }
}
