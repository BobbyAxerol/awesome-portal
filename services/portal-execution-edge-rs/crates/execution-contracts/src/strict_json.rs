//! Reject ambiguous object members before a typed decoder can discard them.
//! Callers retain their transport byte/deadline limits and domain validation.

use std::{collections::BTreeSet, fmt};

use serde::{de, Deserialize};

/// Decode the ORIGINAL bytes after a recursive unique-member preflight.
/// The preflight retains only object keys, not a second payload tree. Typed
/// decoding still sees the original numeric tokens, never an intermediate
/// floating-point `Value`. Escaped aliases count as the same decoded key;
/// identical names in different objects remain independent.
///
/// # Errors
/// Rejects malformed/trailing/deep JSON, duplicate members at any depth, and
/// the target type's own schema violations. Duplicate errors contain no key or
/// value; callers should map parser errors to their existing safe error code.
pub fn from_slice<T: de::DeserializeOwned>(body: &[u8]) -> serde_json::Result<T> {
    let mut parser = serde_json::Deserializer::from_slice(body);
    UniqueMembers::deserialize(&mut parser)?;
    parser.end()?;
    serde_json::from_slice(body)
}

struct UniqueMembers;

impl<'de> Deserialize<'de> for UniqueMembers {
    fn deserialize<D: de::Deserializer<'de>>(parser: D) -> Result<Self, D::Error> {
        struct Visitor;
        impl<'de> de::Visitor<'de> for Visitor {
            type Value = UniqueMembers;

            fn expecting(&self, out: &mut fmt::Formatter<'_>) -> fmt::Result {
                out.write_str("JSON with unique object members")
            }

            fn visit_bool<E: de::Error>(self, _: bool) -> Result<Self::Value, E> {
                Ok(UniqueMembers)
            }

            fn visit_i64<E: de::Error>(self, _: i64) -> Result<Self::Value, E> {
                Ok(UniqueMembers)
            }

            fn visit_u64<E: de::Error>(self, _: u64) -> Result<Self::Value, E> {
                Ok(UniqueMembers)
            }

            fn visit_f64<E: de::Error>(self, _: f64) -> Result<Self::Value, E> {
                Ok(UniqueMembers)
            }

            fn visit_str<E: de::Error>(self, _: &str) -> Result<Self::Value, E> {
                Ok(UniqueMembers)
            }

            fn visit_unit<E: de::Error>(self) -> Result<Self::Value, E> {
                Ok(UniqueMembers)
            }

            fn visit_seq<S: de::SeqAccess<'de>>(self, mut seq: S) -> Result<Self::Value, S::Error> {
                while seq.next_element::<UniqueMembers>()?.is_some() {}
                Ok(UniqueMembers)
            }

            fn visit_map<M: de::MapAccess<'de>>(self, mut map: M) -> Result<Self::Value, M::Error> {
                let mut seen = BTreeSet::new();
                while let Some(key) = map.next_key::<String>()? {
                    if !seen.insert(key) {
                        return Err(de::Error::custom("DUPLICATE_JSON_MEMBER"));
                    }
                    map.next_value::<UniqueMembers>()?;
                }
                Ok(UniqueMembers)
            }
        }
        parser.deserialize_any(Visitor)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{json, Value};

    #[test]
    fn duplicate_members_are_rejected_recursively_before_normalization() {
        for body in [
            r#"{"x":1,"x":2}"#,
            r#"{"x":1,"x":1}"#,
            r#"{"x":1,"\u0078":2}"#,
            r#"[{"outer":{"x":1,"x":2}}]"#,
            r#"{"x":null,"x":false}"#,
        ] {
            assert!(from_slice::<Value>(body.as_bytes()).is_err(), "{body}");
        }
    }

    #[test]
    fn member_scope_arrays_and_original_numeric_precision_are_preserved() {
        let body = br#"{"a":{"id":18446744073709551615},"b":{"id":9007199254740993},"c":[null,true,false,-9,1.25,1e-3],"d":"12.500000000000000001","\u0065":1,"f":2}"#;
        assert_eq!(
            from_slice::<Value>(body).unwrap(),
            serde_json::from_slice::<Value>(body).unwrap()
        );
        assert_eq!(
            from_slice::<u64>(b"18446744073709551615").unwrap(),
            u64::MAX
        );
        assert_eq!(
            from_slice::<i64>(b"-9223372036854775808").unwrap(),
            i64::MIN
        );
        assert_eq!(
            from_slice::<Value>(br#"{"b":2,"a":1}"#).unwrap(),
            json!({"a":1,"b":2})
        );
    }

    #[test]
    fn malformed_trailing_and_excessively_deep_json_are_rejected() {
        for body in ["", "{", "[1,]", "{\"x\":NaN}", "{} {}", "null true"] {
            assert!(from_slice::<Value>(body.as_bytes()).is_err());
        }
        let body = format!("{}0{}", "[".repeat(129), "]".repeat(129));
        assert!(from_slice::<Value>(body.as_bytes()).is_err());
    }

    #[test]
    fn typed_schema_and_record_free_duplicate_errors_remain_enforced() {
        #[derive(Deserialize)]
        #[serde(deny_unknown_fields)]
        struct Wire {
            amount: String,
        }
        assert_eq!(
            from_slice::<Wire>(br#"{"amount":"1.00"}"#).unwrap().amount,
            "1.00"
        );
        assert!(from_slice::<Wire>(br#"{"amount":1}"#).is_err());
        assert!(from_slice::<Wire>(br#"{"amount":"1","extra":true}"#).is_err());
        let error = from_slice::<Value>(
            br#"{"PRIVATE_TEST_KEY":"PRIVATE_TEST_VALUE","PRIVATE_TEST_KEY":2}"#,
        )
        .unwrap_err()
        .to_string();
        assert!(error.contains("DUPLICATE_JSON_MEMBER"));
        assert!(!error.contains("PRIVATE_TEST_KEY") && !error.contains("PRIVATE_TEST_VALUE"));
    }
}
