#![forbid(unsafe_code)]

use std::{collections::BTreeMap, sync::Arc};

use chrono::{DateTime, Utc};
use jsonwebtoken::{decode, decode_header, jwk::JwkSet, Algorithm, DecodingKey, Validation};
use serde::{Deserialize, Serialize};
use thiserror::Error;

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
        if !(1..=60).contains(&maximum_ttl_seconds) || clock_skew_seconds > 10 {
            return Err(AuthError::UnsafeVerifierPolicy);
        }
        let set: JwkSet = serde_json::from_str(raw).map_err(|_| AuthError::InvalidJwks)?;
        let mut keys = BTreeMap::new();
        for jwk in &set.keys {
            let kid = jwk.common.key_id.as_ref().ok_or(AuthError::MissingKeyId)?;
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
            issuer: issuer.into(),
            audience: audience.into(),
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
        let header = decode_header(token).map_err(|_| AuthError::InvalidAssertion)?;
        if header.alg != Algorithm::RS256 {
            return Err(AuthError::UnsupportedAlgorithm);
        }
        let kid = header.kid.ok_or(AuthError::MissingKeyId)?;
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

        if claims.iat > claims.nbf
            || claims.exp <= claims.iat
            || claims.exp - claims.iat > self.maximum_ttl_seconds
            || claims.sid.is_empty()
            || claims.workspace_id.is_empty()
            || claims.jti.is_empty()
        {
            return Err(AuthError::InvalidAssertionLifetime);
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
    }

    fn signer() -> TestSigner {
        let private = RsaPrivateKey::new(&mut thread_rng(), 2048).unwrap();
        let public = RsaPublicKey::from(&private);
        let pem = private.to_pkcs8_pem(LineEnding::LF).unwrap();
        TestSigner {
            encoding: EncodingKey::from_rsa_pem(pem.as_bytes()).unwrap(),
            jwks: serde_json::json!({
                "keys": [{
                    "kty": "RSA",
                    "kid": "delegation-k1",
                    "use": "sig",
                    "alg": "RS256",
                    "n": URL_SAFE_NO_PAD.encode(public.n().to_bytes_be()),
                    "e": URL_SAFE_NO_PAD.encode(public.e().to_bytes_be())
                }]
            })
            .to_string(),
        }
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
                kid: Some("delegation-k1".to_owned()),
                ..Header::default()
            },
            claims,
            &signer.encoding,
        )
        .unwrap()
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
                &token(&signer, &claims(now)),
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
                &token(&signer, &wrong_audience),
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
                &token(&signer, &long_lived),
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
                &token(&signer, &no_scope),
                &RequiredRead {
                    environment: "paper",
                    resource: None,
                }
            ),
            Err(AuthError::ScopeDenied)
        );

        assert_eq!(
            verifier.verify_read(
                &token(&signer, &claims(now)),
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
                &token(&signer, &future),
                &RequiredRead {
                    environment: "paper",
                    resource: Some("alpha:alpha-paper-1"),
                },
            ),
            Err(AuthError::InvalidAssertion)
        );
    }
}
