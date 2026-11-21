// Build a write-once, public-only C2 static *candidate* for Edge review.
// This does not install trust, select an issuer/audience, grant rights, or make A2.
import { readFileSync, writeFileSync, mkdirSync, lstatSync } from 'node:fs';
import { createHash, X509Certificate, createPublicKey } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { isAbsolute, join } from 'node:path';

const [input, output, csr] = process.argv.slice(2);
if (!input || !output || !csr || ![input, output, csr].every(isAbsolute)) throw Error('absolute input/output/CSR paths required');
const sha = data => createHash('sha256').update(data).digest('hex');
const inputs = [
  ['jwks.composition-v1.public.json', 'human-token-jwks.json', 'c2be5bf172d2e16b7fdb048431295c7caa67c1e869b94e8ed547eaa7aff35f25'],
  ['ca.crt.pem', 'portal-ca.pem', 'e205fbef9c9dc4d290d66f5c86ed185115909db6ff5baf6c2dee551eeaa58acf'],
  ['server.crt.pem', 'portal-server-cert.pem', '6875237dcb0fe3c405bc3d1bdfa0c199c9f8f93d10d5ad48b7d89d1e59798225'],
  ['ts-mtls-client.crt.pem', 'ts-mtls-client.crt.pem', 'f4f4cca4ac60ff44162794eef74f24ef945c7ab466bf9e39bf9355071d54eaa3'],
];
const files = new Map();
for (const [source, target, expected] of inputs) {
  const path = join(input, source);
  if (!lstatSync(path).isFile()) throw Error('public input is not a regular file');
  const bytes = readFileSync(path);
  if (sha(bytes) !== expected) throw Error(`public pin mismatch: ${source}`);
  files.set(target, bytes);
}
const jwks = JSON.parse(files.get('human-token-jwks.json').toString('utf8'));
if (!Array.isArray(jwks.keys) || jwks.keys.length !== 1 || Object.keys(jwks).join() !== 'keys') throw Error('invalid public JWKS');
const key = jwks.keys[0];
if (key.kty !== 'OKP' || key.crv !== 'Ed25519' || key.alg !== 'EdDSA' || key.use !== 'sig' ||
    key.kid !== 'research-candidate-064b8dc9-17a8-4305-9b7f-d5c7524245e6' ||
    !/^[A-Za-z0-9_-]{43}$/.test(key.x) || Object.keys(key).sort().join() !== 'alg,crv,kid,kty,use,x')
  throw Error('invalid public key');
const ca = new X509Certificate(files.get('portal-ca.pem'));
const server = new X509Certificate(files.get('portal-server-cert.pem'));
const client = new X509Certificate(files.get('ts-mtls-client.crt.pem'));
const now = Date.now();
if (!ca.ca || !server.verify(ca.publicKey) || !client.verify(ca.publicKey) || !server.checkIP('10.70.0.1') ||
    [ca, server, client].some(c => now < Date.parse(c.validFrom) || now >= Date.parse(c.validTo)) ||
    sha(server.raw) !== 'fefa26e5d6fea081fab431a3bec2bb9dd0f60e05b7dd48bce09a285478b87012')
  throw Error('candidate certificate validation failed');
const csrPublicPem = execFileSync('openssl', ['req', '-in', csr, '-pubkey', '-noout'], {maxBuffer:8192});
const csrSpki = createPublicKey(csrPublicPem).export({type:'spki', format:'der'});
if (sha(csrSpki) !== '6a016a6f5029cc9b1f9425189f5ad343a76f5170f1a8d290985787ba7c3a7df2' ||
    !csrSpki.equals(client.publicKey.export({type:'spki', format:'der'}))) throw Error('client CSR mismatch');

const status = {schema:'portal.c2-static-trust-candidate.v1', bundle_kind:'a2-static-r1',
  disposition:'CANDIDATE_NOT_INSTALLED_NOT_A2', owner:'Portal Core',
  source:{core_git_base:'2faa8968fddbde59b2e59525e334ba3d83886144', candidate_changes:'UNCOMMITTED',
    a1_manifest_sha256:'7b063476b5daf2218382b31166f48a73218e09befd7804b0eb018b11fc642ab4'},
  human_policies:[{state:'CANDIDATE_ONLY', issuer:{state:'NOT_SELECTED',value:null},
    audience:{state:'NOT_SELECTED',value:null}, key_id:key.kid, keyset_ref:'human-token-jwks.json',
    keyset_sha256:sha(files.get('human-token-jwks.json')),
    maximum_token_lifetime_seconds:{state:'SOURCE_LIMIT_NOT_INSTALLED_POLICY',value:60}}],
  portal:{state:'CANDIDATE_NOT_INSTALLED', origin:'https://10.70.0.1:28444',
    server_leaf_der_sha256:sha(server.raw), server_certificate_ref:'portal-server-cert.pem',
    ca_ref:'portal-ca.pem', ca_der_sha256:sha(ca.raw), ts_client_certificate_ref:'ts-mtls-client.crt.pem',
    ts_client_csr_spki_sha256:sha(csrSpki), not_before:server.validFrom, not_after:server.validTo},
  delegation:{state:'NOT_AVAILABLE',owner_subject:null,acceptance_ref:null,delegation_ref:null,
    reason:'Owner session-bound P7 and source registration are not commissioned'},
  next_checkpoint_utc:'2026-11-05T12:00:00Z', coordination_target_utc:'2026-11-06T08:00:00Z',
  target_is_not_readiness_or_authority_extension:true};
files.set('identifiers.json', Buffer.from(JSON.stringify(status, null, 2)+'\n'));
const entries = [...files].map(([path, bytes]) => ({path,bytes:bytes.length,sha256:sha(bytes)}));
const manifest = Buffer.from(JSON.stringify({schema:'portal.c2-static-trust-manifest.v1',bundle:'a2-static-r1',
  disposition:'CANDIDATE_NOT_INSTALLED_NOT_A2',files:entries}, null, 2)+'\n');
files.set('MANIFEST.json', manifest);
const checksums = Buffer.from([...files].map(([path, bytes]) => `${sha(bytes)}  ${path}\n`).join(''));
files.set('SHA256SUMS', checksums);

// Do not merge with or overwrite a prior publication. Readers must wait for
// the final SHA256SUMS and verify it before accepting this local output.
mkdirSync(output, {mode:0o700});
for (const [path, bytes] of files) writeFileSync(join(output,path), bytes, {mode:0o600,flag:'wx'});
console.log(JSON.stringify({directory:output, manifest_sha256:sha(manifest), files:[...files].map(([path,bytes])=>({path,bytes:bytes.length,sha256:sha(bytes)}))}, null, 2));
