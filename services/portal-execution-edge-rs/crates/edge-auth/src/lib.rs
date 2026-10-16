#![forbid(unsafe_code)]

use std::{collections::BTreeMap, sync::Arc};

use chrono::{DateTime, Utc};
use jsonwebtoken::{decode, decode_header, jwk::JwkSet, Algorithm, DecodingKey, Validation};
use serde::{Deserialize, Serialize};
use thiserror::Error;

const MAX_ASSERTION_BYTES: usize = 16 * 1_024;
const MAX_JWKS_BYTES: usize = 64 * 1_024;
const MAX_JWKS_KEYS: usize = 16;
const MAX_KEY_ID_BYTES: usize = 128;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DelegatedClaims {
    pub iss: String,
    pub aud: String,
    pub sub: String,
    pub sid: String,
    pub workspace_id: String,
    pub roles: Vec<String>,
    pub scopes: Vec<String>,
    pub resources: Vec<String>,
    pub environment: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub profile_id: Option<String>,
    pub jti: String,
    pub iat: i64,
    pub nbf: i64,
    pub exp: i64,
    pub auth_time: i64,
    pub amr: Vec<String>,
}

impl DelegatedClaims {
    #[must_use]
    pub fn expires_at(&self) -> Option<DateTime<Utc>> {
        DateTime::from_timestamp(self.exp, 0)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RequiredRead<'a> {
    pub environment: &'a str,
    pub resource: Option<&'a str>,
}

#[derive(Clone)]
pub struct DelegationVerifier {
    keys: Arc<BTreeMap<String, DecodingKey>>,
    issuer: String,
    audience: String,
    maximum_ttl_seconds: i64,
    clock_skew_seconds: u64,
}

impl DelegationVerifier {
    /// Loads a local JWKS snapshot. No network lookup occurs during verification.
    ///
    /// # Errors
    ///
    /// Returns an error when the JWKS is malformed, empty, lacks a `kid`, or
    /// contains a key that cannot verify RS256 assertions.
    pub fn from_jwks_json(
        raw: &str,
        issuer: impl Into<String>,
        audience: impl Into<String>,
        maximum_ttl_seconds: i64,
        clock_skew_seconds: u64,
    ) -> Result<Self, AuthError> {
        let issuer = issuer.into();
        let audience = audience.into();
        if !(1..=60).contains(&maximum_ttl_seconds) || clock_skew_seconds > 10 {
            return Err(AuthError::UnsafeVerifierPolicy);
        }
        if !bounded_text(&issuer, 2_048) || !bounded_text(&audience, 2_048) {
            return Err(AuthError::UnsafeVerifierPolicy);
        }
        validate_jwks_metadata(raw)?;
        let set: JwkSet = serde_json::from_str(raw).map_err(|_| AuthError::InvalidJwks)?;
        let mut keys = BTreeMap::new();
        for jwk in &set.keys {
            let kid = jwk.common.key_id.as_ref().ok_or(AuthError::MissingKeyId)?;
            if !bounded_text(kid, MAX_KEY_ID_BYTES) {
                return Err(AuthError::InvalidJwks);
            }
            let key = DecodingKey::from_jwk(jwk).map_err(|_| AuthError::InvalidJwks)?;
            if keys.insert(kid.clone(), key).is_some() {
                return Err(AuthError::DuplicateKeyId);
            }
        }
        if keys.is_empty() {
            return Err(AuthError::InvalidJwks);
        }
        Ok(Self {
            keys: Arc::new(keys),
            issuer,
            audience,
            maximum_ttl_seconds,
            clock_skew_seconds,
        })
    }

    /// Verifies an audience-bound R0 read assertion and its resource scope.
    ///
    /// # Errors
    ///
    /// Returns a typed fail-closed error for missing/unknown keys, invalid
    /// signature or registered claims, excessive TTL, scope, environment, or
    /// resource mismatches. The raw token is never retained in the error.
    pub fn verify_read(
        &self,
        token: &str,
        required: &RequiredRead<'_>,
    ) -> Result<DelegatedClaims, AuthError> {
        if token.is_empty() || token.len() > MAX_ASSERTION_BYTES {
            return Err(AuthError::InvalidAssertion);
        }
        let header = decode_header(token).map_err(|_| AuthError::InvalidAssertion)?;
        if header.alg != Algorithm::RS256 {
            return Err(AuthError::UnsupportedAlgorithm);
        }
        let kid = header.kid.ok_or(AuthError::MissingKeyId)?;
        if !bounded_text(&kid, MAX_KEY_ID_BYTES) {
            return Err(AuthError::InvalidAssertion);
        }
        let key = self.keys.get(&kid).ok_or(AuthError::UnknownKeyId)?;
        let mut validation = Validation::new(Algorithm::RS256);
        validation.set_issuer(&[self.issuer.as_str()]);
        validation.set_audience(&[self.audience.as_str()]);
        validation.leeway = self.clock_skew_seconds;
        // `jsonwebtoken` does not validate `nbf` by default. Requiring the
        // claim without enabling this check would accept a correctly signed
        // assertion before its delegated authorization window begins.
        validation.validate_nbf = true;
        validation.set_required_spec_claims(&["exp", "nbf", "iss", "aud", "sub"]);
        let claims = decode::<DelegatedClaims>(token, key, &validation)
            .map_err(|_| AuthError::InvalidAssertion)?
            .claims;

        let ttl = claims.exp.checked_sub(claims.iat);
        if claims.iat < 0
            || claims.auth_time < 0
            || claims.auth_time > claims.iat
            || claims.iat > claims.nbf
            || claims.nbf >= claims.exp
            || claims.exp <= claims.iat
            || ttl.is_none_or(|ttl| ttl > self.maximum_ttl_seconds)
            || claims.expires_at().is_none()
            || claims.sid.is_empty()
            || claims.workspace_id.is_empty()
            || claims.jti.is_empty()
        {
            return Err(AuthError::InvalidAssertionLifetime);
        }
        if !bounded_claims(&claims) {
            return Err(AuthError::InvalidAssertion);
        }
        if claims.environment != required.environment {
            return Err(AuthError::EnvironmentDenied);
        }
        if !claims.scopes.iter().any(|scope| scope == "execution.read") {
            return Err(AuthError::ScopeDenied);
        }
        if let Some(resource) = required.resource {
            if !claims.resources.iter().any(|allowed| allowed == resource) {
                return Err(AuthError::ResourceDenied);
            }
        }
        Ok(claims)
    }
}

fn bounded_text(value: &str, maximum_bytes: usize) -> bool {
    !value.is_empty() && value.len() <= maximum_bytes && !value.chars().any(char::is_control)
}

fn bounded_list(values: &[String], maximum_entries: usize, maximum_bytes: usize) -> bool {
    values.len() <= maximum_entries
        && values
            .iter()
            .all(|value| bounded_text(value, maximum_bytes))
}

fn bounded_claims(claims: &DelegatedClaims) -> bool {
    bounded_text(&claims.iss, 2_048)
        && bounded_text(&claims.aud, 2_048)
        && [&claims.sub, &claims.sid, &claims.workspace_id, &claims.jti]
            .into_iter()
            .all(|value| bounded_text(value, 256))
        && bounded_text(&claims.environment, 32)
        && claims
            .profile_id
            .as_deref()
            .is_none_or(|value| bounded_text(value, 256))
        && bounded_list(&claims.roles, 64, 128)
        && bounded_list(&claims.scopes, 64, 256)
        && bounded_list(&claims.resources, 256, 512)
        && bounded_list(&claims.amr, 16, 128)
}

fn validate_jwks_metadata(raw: &str) -> Result<(), AuthError> {
    if raw.len() > MAX_JWKS_BYTES {
        return Err(AuthError::InvalidJwks);
    }
    let value: serde_json::Value = serde_json::from_str(raw).map_err(|_| AuthError::InvalidJwks)?;
    let keys = value["keys"].as_array().ok_or(AuthError::InvalidJwks)?;
    if keys.is_empty() || keys.len() > MAX_JWKS_KEYS {
        return Err(AuthError::InvalidJwks);
    }
    for key in keys {
        if key["kty"] != "RSA"
            || key.get("alg").is_some_and(|value| value != "RS256")
            || key.get("use").is_some_and(|value| value != "sig")
            || key
                .get("key_ops")
                .is_some_and(|value| value != &serde_json::json!(["verify"]))
            || ["d", "p", "q", "dp", "dq", "qi", "oth", "k"]
                .into_iter()
                .any(|field| key.get(field).is_some())
        {
            return Err(AuthError::InvalidJwks);
        }
    }
    Ok(())
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum AuthError {
    #[error("delegation JWKS is invalid")]
    InvalidJwks,
    #[error("delegation key is missing a key ID")]
    MissingKeyId,
    #[error("delegation JWKS contains a duplicate key ID")]
    DuplicateKeyId,
    #[error("delegation verifier policy exceeds the R0 read boundary")]
    UnsafeVerifierPolicy,
    #[error("delegated assertion is invalid")]
    InvalidAssertion,
    #[error("delegated assertion uses an unsupported algorithm")]
    UnsupportedAlgorithm,
    #[error("delegated assertion references an unknown key ID")]
    UnknownKeyId,
    #[error("delegated assertion lifetime is invalid")]
    InvalidAssertionLifetime,
    #[error("delegated assertion environment is denied")]
    EnvironmentDenied,
    #[error("delegated assertion scope is denied")]
    ScopeDenied,
    #[error("delegated assertion resource is denied")]
    ResourceDenied,
}

#[cfg(test)]
mod tests {
    use std::sync::OnceLock;

    use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
    use jsonwebtoken::{encode, Algorithm, EncodingKey, Header};
    use rand::thread_rng;
    use rsa::{
        pkcs8::{EncodePrivateKey, LineEnding},
        traits::PublicKeyParts,
        RsaPrivateKey, RsaPublicKey,
    };

    use super::*;

    struct TestSigner {
        encoding: EncodingKey,
        jwks: String,
        kid: &'static str,
    }

    fn make_signer(kid: &'static str) -> TestSigner {
        let private = RsaPrivateKey::new(&mut thread_rng(), 2048).unwrap();
        let public = RsaPublicKey::from(&private);
        let pem = private.to_pkcs8_pem(LineEnding::LF).unwrap();
        TestSigner {
            encoding: EncodingKey::from_rsa_pem(pem.as_bytes()).unwrap(),
            jwks: serde_json::json!({
                "keys": [{
                    "kty": "RSA",
                    "kid": kid,
                    "use": "sig",
                    "alg": "RS256",
                    "n": URL_SAFE_NO_PAD.encode(public.n().to_bytes_be()),
                    "e": URL_SAFE_NO_PAD.encode(public.e().to_bytes_be())
                }]
            })
            .to_string(),
            kid,
        }
    }

    fn signer() -> &'static TestSigner {
        static SIGNER: OnceLock<TestSigner> = OnceLock::new();
        SIGNER.get_or_init(|| make_signer("delegation-k1"))
    }

    fn next_signer() -> &'static TestSigner {
        static SIGNER: OnceLock<TestSigner> = OnceLock::new();
        SIGNER.get_or_init(|| make_signer("delegation-k2"))
    }

    fn claims(now: i64) -> DelegatedClaims {
        DelegatedClaims {
            iss: "portal-control-api".to_owned(),
            aud: "portal-execution-edge".to_owned(),
            sub: "usr_test".to_owned(),
            sid: "session_test".to_owned(),
            workspace_id: "ws_test".to_owned(),
            roles: vec!["USER".to_owned()],
            scopes: vec!["execution.read".to_owned()],
            resources: vec!["alpha:alpha-paper-1".to_owned()],
            environment: "paper".to_owned(),
            profile_id: None,
            jti: "assertion_test".to_owned(),
            iat: now,
            nbf: now,
            exp: now + 60,
            auth_time: now - 10,
            amr: vec!["portal_session".to_owned()],
        }
    }

    fn token(signer: &TestSigner, claims: &DelegatedClaims) -> String {
        encode(
            &Header {
                alg: Algorithm::RS256,
                kid: Some(signer.kid.to_owned()),
                ..Header::default()
            },
            claims,
            &signer.encoding,
        )
        .unwrap()
    }

    fn verifier(raw: &str) -> DelegationVerifier {
        DelegationVerifier::from_jwks_json(
            raw,
            "portal-control-api",
            "portal-execution-edge",
            60,
            0,
        )
        .unwrap()
    }

    fn read_requirement() -> RequiredRead<'static> {
        RequiredRead {
            environment: "paper",
            resource: Some("alpha:alpha-paper-1"),
        }
    }

    #[test]
    fn exact_read_scope_is_accepted() {
        let signer = signer();
        let verifier = DelegationVerifier::from_jwks_json(
            &signer.jwks,
            "portal-control-api",
            "portal-execution-edge",
            60,
            3,
        )
        .unwrap();
        let now = Utc::now().timestamp();
        let verified_claims = verifier
            .verify_read(
                &token(signer, &claims(now)),
                &RequiredRead {
                    environment: "paper",
                    resource: Some("alpha:alpha-paper-1"),
                },
            )
            .unwrap();
        assert_eq!(verified_claims.sub, "usr_test");
    }

    #[test]
    fn audience_scope_resource_and_ttl_fail_closed() {
        let signer = signer();
        let verifier = DelegationVerifier::from_jwks_json(
            &signer.jwks,
            "portal-control-api",
            "portal-execution-edge",
            60,
            3,
        )
        .unwrap();
        let now = Utc::now().timestamp();

        let mut wrong_audience = claims(now);
        wrong_audience.aud = "some-other-service".to_owned();
        assert_eq!(
            verifier.verify_read(
                &token(signer, &wrong_audience),
                &RequiredRead {
                    environment: "paper",
                    resource: None,
                }
            ),
            Err(AuthError::InvalidAssertion)
        );

        let mut long_lived = claims(now);
        long_lived.exp = now + 61;
        assert_eq!(
            verifier.verify_read(
                &token(signer, &long_lived),
                &RequiredRead {
                    environment: "paper",
                    resource: None,
                }
            ),
            Err(AuthError::InvalidAssertionLifetime)
        );

        let mut no_scope = claims(now);
        no_scope.scopes.clear();
        assert_eq!(
            verifier.verify_read(
                &token(signer, &no_scope),
                &RequiredRead {
                    environment: "paper",
                    resource: None,
                }
            ),
            Err(AuthError::ScopeDenied)
        );

        assert_eq!(
            verifier.verify_read(
                &token(signer, &claims(now)),
                &RequiredRead {
                    environment: "paper",
                    resource: Some("alpha:another-alpha"),
                }
            ),
            Err(AuthError::ResourceDenied)
        );
    }

    #[test]
    fn future_not_before_fails_closed_outside_clock_skew() {
        let signer = signer();
        let verifier = DelegationVerifier::from_jwks_json(
            &signer.jwks,
            "portal-control-api",
            "portal-execution-edge",
            60,
            3,
        )
        .unwrap();
        let now = Utc::now().timestamp();
        let mut future = claims(now);
        future.nbf = now + 30;
        future.exp = now + 45;

        assert_eq!(
            verifier.verify_read(
                &token(signer, &future),
                &RequiredRead {
                    environment: "paper",
                    resource: Some("alpha:alpha-paper-1"),
                },
            ),
            Err(AuthError::InvalidAssertion)
        );
    }

    #[test]
    fn wrong_issuer_expired_assertion_and_wrong_signature_are_denied() {
        let signer = signer();
        let verifier = verifier(&signer.jwks);
        let now = Utc::now().timestamp();
        let mut wrong_issuer = claims(now);
        wrong_issuer.iss = "untrusted-control-api".to_owned();
        let mut expired = claims(now - 120);
        expired.exp = now - 60;
        for denied in [wrong_issuer, expired] {
            assert_eq!(
                verifier.verify_read(&token(signer, &denied), &read_requirement()),
                Err(AuthError::InvalidAssertion)
            );
        }

        let incorrectly_signed = encode(
            &Header {
                alg: Algorithm::RS256,
                kid: Some(signer.kid.to_owned()),
                ..Header::default()
            },
            &claims(now),
            &next_signer().encoding,
        )
        .unwrap();
        assert_eq!(
            verifier.verify_read(&incorrectly_signed, &read_requirement()),
            Err(AuthError::InvalidAssertion)
        );
    }

    #[test]
    fn signed_extreme_or_inconsistent_times_fail_without_arithmetic_overflow() {
        let signer = signer();
        let verifier = verifier(&signer.jwks);
        let now = Utc::now().timestamp();
        for (iat, nbf, exp, auth_time) in [
            (i64::MIN, now, now + 60, now - 10),
            (now, now, i64::MAX, now - 10),
            (now, now, now + 60, -1),
            (now, now, now + 60, now + 1),
            (now, now + 1, now + 1, now - 10),
        ] {
            let mut denied = claims(now);
            denied.iat = iat;
            denied.nbf = nbf;
            denied.exp = exp;
            denied.auth_time = auth_time;
            assert!(verifier
                .verify_read(&token(signer, &denied), &read_requirement())
                .is_err());
        }
    }

    #[test]
    fn signed_principal_and_collection_bounds_fail_closed() {
        let signer = signer();
        let verifier = verifier(&signer.jwks);
        let valid = claims(Utc::now().timestamp());
        let mut denied = Vec::new();
        let mut value = valid.clone();
        value.sub.clear();
        denied.push(value);
        let mut value = valid.clone();
        value.sid = "x".repeat(257);
        denied.push(value);
        let mut value = valid.clone();
        value.workspace_id = "workspace\nforged-log-record".to_owned();
        denied.push(value);
        let mut value = valid.clone();
        value.profile_id = Some(String::new());
        denied.push(value);
        let mut value = valid.clone();
        value.roles = vec!["USER".to_owned(); 65];
        denied.push(value);
        let mut value = valid.clone();
        value.resources = vec!["alpha:alpha-paper-1".to_owned(); 257];
        denied.push(value);
        let mut value = valid.clone();
        value.scopes.push("x".repeat(257));
        denied.push(value);
        let mut value = valid;
        value.amr = vec!["portal_session".to_owned(); 17];
        denied.push(value);
        for value in denied {
            assert_eq!(
                verifier.verify_read(&token(signer, &value), &read_requirement()),
                Err(AuthError::InvalidAssertion)
            );
        }
    }

    #[test]
    fn oversized_assertion_and_keyset_are_rejected_before_decoding() {
        let verifier = verifier(&signer().jwks);
        assert_eq!(
            verifier.verify_read(&"x".repeat(MAX_ASSERTION_BYTES + 1), &read_requirement()),
            Err(AuthError::InvalidAssertion)
        );
        assert!(matches!(
            DelegationVerifier::from_jwks_json(
                &" ".repeat(MAX_JWKS_BYTES + 1),
                "portal-control-api",
                "portal-execution-edge",
                60,
                0,
            ),
            Err(AuthError::InvalidJwks)
        ));
    }

    #[test]
    fn keyset_rejects_conflicting_usage_algorithm_and_private_material() {
        let original: serde_json::Value = serde_json::from_str(&signer().jwks).unwrap();
        for (field, value) in [
            ("alg", serde_json::json!("RS512")),
            ("use", serde_json::json!("enc")),
            ("kty", serde_json::json!("EC")),
            ("key_ops", serde_json::json!(["sign"])),
            ("key_ops", serde_json::json!(["verify", "encrypt"])),
            ("d", serde_json::json!("TEST_ONLY_NOT_A_PRIVATE_KEY")),
            ("kid", serde_json::json!("x".repeat(MAX_KEY_ID_BYTES + 1))),
        ] {
            let mut denied = original.clone();
            denied["keys"][0][field] = value;
            assert!(matches!(
                DelegationVerifier::from_jwks_json(
                    &denied.to_string(),
                    "portal-control-api",
                    "portal-execution-edge",
                    60,
                    0,
                ),
                Err(AuthError::InvalidJwks)
            ));
        }
    }

    #[test]
    fn absent_optional_jwk_metadata_remains_compatible_with_rs256() {
        let signer = signer();
        let mut keyset: serde_json::Value = serde_json::from_str(&signer.jwks).unwrap();
        let key = keyset["keys"][0].as_object_mut().unwrap();
        key.remove("alg");
        key.remove("use");
        let verifier = verifier(&keyset.to_string());
        assert!(verifier
            .verify_read(
                &token(signer, &claims(Utc::now().timestamp())),
                &read_requirement(),
            )
            .is_ok());
    }

    #[test]
    fn duplicate_missing_and_excessive_key_ids_fail_closed() {
        let original: serde_json::Value = serde_json::from_str(&signer().jwks).unwrap();
        let mut duplicate = original.clone();
        duplicate["keys"]
            .as_array_mut()
            .unwrap()
            .push(original["keys"][0].clone());
        assert!(matches!(
            DelegationVerifier::from_jwks_json(
                &duplicate.to_string(),
                "portal-control-api",
                "portal-execution-edge",
                60,
                0,
            ),
            Err(AuthError::DuplicateKeyId)
        ));
        let mut missing = original.clone();
        missing["keys"][0].as_object_mut().unwrap().remove("kid");
        assert!(matches!(
            DelegationVerifier::from_jwks_json(
                &missing.to_string(),
                "portal-control-api",
                "portal-execution-edge",
                60,
                0,
            ),
            Err(AuthError::MissingKeyId)
        ));
        let excessive =
            serde_json::json!({"keys": vec![original["keys"][0].clone(); MAX_JWKS_KEYS + 1]});
        assert!(matches!(
            DelegationVerifier::from_jwks_json(
                &excessive.to_string(),
                "portal-control-api",
                "portal-execution-edge",
                60,
                0,
            ),
            Err(AuthError::InvalidJwks)
        ));
    }

    #[test]
    fn key_rotation_overlap_and_removal_preserve_exact_principal_scope() {
        let first = signer();
        let second = next_signer();
        let old: serde_json::Value = serde_json::from_str(&first.jwks).unwrap();
        let new: serde_json::Value = serde_json::from_str(&second.jwks).unwrap();
        let overlap =
            verifier(&serde_json::json!({"keys": [old["keys"][0], new["keys"][0]]}).to_string());
        let retired = verifier(&second.jwks);
        let original = claims(Utc::now().timestamp());
        for signer in [first, second] {
            assert_eq!(
                overlap.verify_read(&token(signer, &original), &read_requirement()),
                Ok(original.clone())
            );
        }
        assert_eq!(
            retired.verify_read(&token(first, &original), &read_requirement()),
            Err(AuthError::UnknownKeyId)
        );
        assert_eq!(
            retired.verify_read(&token(second, &original), &read_requirement()),
            Ok(original)
        );
    }

    #[test]
    fn role_labels_do_not_substitute_for_a_read_grant() {
        let signer = signer();
        let verifier = verifier(&signer.jwks);
        let mut denied = claims(Utc::now().timestamp());
        denied.roles = vec!["OWNER".to_owned(), "ADMIN".to_owned()];
        denied.scopes = vec!["execution.command".to_owned()];
        assert_eq!(
            verifier.verify_read(&token(signer, &denied), &read_requirement()),
            Err(AuthError::ScopeDenied)
        );
    }

    #[test]
    fn algorithm_confusion_is_rejected_before_key_use() {
        let assertion = encode(
            &Header {
                alg: Algorithm::HS256,
                kid: Some(signer().kid.to_owned()),
                ..Header::default()
            },
            &claims(Utc::now().timestamp()),
            &EncodingKey::from_secret(b"TEST_ONLY_NOT_A_SERVICE_SECRET"),
        )
        .unwrap();
        assert_eq!(
            verifier(&signer().jwks).verify_read(&assertion, &read_requirement()),
            Err(AuthError::UnsupportedAlgorithm)
        );
    }

    #[test]
    fn verifier_rejects_empty_or_unbounded_identity_policy() {
        for (issuer, audience) in [
            (String::new(), "portal-execution-edge".to_owned()),
            ("portal-control-api".to_owned(), "x".repeat(2_049)),
        ] {
            assert!(matches!(
                DelegationVerifier::from_jwks_json(&signer().jwks, issuer, audience, 60, 0),
                Err(AuthError::UnsafeVerifierPolicy)
            ));
        }
    }

    #[test]
    fn delegated_read_profiles_do_not_gain_cross_environment_access() {
        let signer = signer();
        let verifier = verifier(&signer.jwks);
        for environment in ["paper", "sandbox", "live"] {
            let mut granted = claims(Utc::now().timestamp());
            granted.environment = environment.to_owned();
            let assertion = token(signer, &granted);
            assert_eq!(
                verifier.verify_read(
                    &assertion,
                    &RequiredRead {
                        environment,
                        resource: None
                    }
                ),
                Ok(granted)
            );
            assert_eq!(
                verifier.verify_read(
                    &assertion,
                    &RequiredRead {
                        environment: "other",
                        resource: None
                    }
                ),
                Err(AuthError::EnvironmentDenied)
            );
        }
    }
}
