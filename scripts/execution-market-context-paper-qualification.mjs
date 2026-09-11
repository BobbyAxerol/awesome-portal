#!/usr/bin/env node
// BE-R2-4 one-shot Paper qualification for the two sealed Market Context
// Manager routes. It persists no raw response, credential, cursor or token.
// Run inside the existing Control API container through stdin so the private
// mTLS/JWT files remain in its secret mount and no test code is copied there.

import { createHash, randomUUID } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { connect } from "node:http2";
import { isIP } from "node:net";
import { importPKCS8, SignJWT } from "jose";

const RESOURCE = "execution:manager-v2:read";
const CONTRACT_REVISION = "trading-system.portal-execution.market-context.v1";
const ADAPTER_REVISION = "portal.execution.market-context-data-layer.v1";
const PROFILE = "PAPER_BINANCE_USDM";
const ENVIRONMENT = "paper";
const AUDIENCE = "portal-execution-edge-paper";
const ISSUER = "portal-control-api";
const LATEST_PATH = "/internal/v2/manager/market/latest?venue=BINANCE&instrument=BTCUSDT";
const MAX_LATEST_BYTES = 1_048_576;
const MAX_CANDLES_BYTES = 8_388_608;

class QualificationError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function required(name) {
  const value = process.env[name];
  if (typeof value !== "string" || value.length === 0) throw new QualificationError(`MISSING_${name}`);
  return value;
}

function exact(name, expected) {
  const value = required(name);
  if (value !== expected) throw new QualificationError(`INVALID_${name}`);
  return value;
}

function absolutePath(name) {
  const value = required(name);
  if (!value.startsWith("/")) throw new QualificationError(`INVALID_${name}`);
  return value;
}

async function regularReadable(path, name, { secret = false } = {}) {
  const metadata = await lstat(path);
  if (!metadata.isFile() || metadata.isSymbolicLink()) throw new QualificationError(`UNSAFE_${name}`);
  if (metadata.size <= 0 || metadata.size > 64 * 1024) throw new QualificationError(`INVALID_${name}_SIZE`);
  if (secret && (metadata.mode & 0o007) !== 0) throw new QualificationError(`WORLD_READABLE_${name}`);
  return readFile(path);
}

function parseOrigin(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new QualificationError("INVALID_MARKET_CONTEXT_QUAL_ORIGIN");
  }
  if (
    url.protocol !== "https:" || url.username || url.password || url.search || url.hash ||
    (url.pathname !== "" && url.pathname !== "/")
  ) throw new QualificationError("INVALID_MARKET_CONTEXT_QUAL_ORIGIN");
  return url;
}

function utcMilliseconds(value, code) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 8_640_000_000_000_000) {
    throw new QualificationError(code);
  }
  return value;
}

function decimal(value, code) {
  if (typeof value !== "string" || !/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(value)) {
    throw new QualificationError(code);
  }
  return value;
}

function asObject(value, code) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new QualificationError(code);
  return value;
}

function summarizeLatest(body) {
  const root = asObject(body, "LATEST_ENVELOPE_INVALID");
  const data = asObject(root.data, "LATEST_DATA_INVALID");
  if (
    root.schema_version !== "trading-system.portal-execution.market-context-envelope.v1" ||
    root.contract_revision !== CONTRACT_REVISION ||
    root.authority !== "EXECUTION_CELL" ||
    root.profile_id !== PROFILE ||
    root.availability !== "AVAILABLE" ||
    !["FRESH", "AGING", "DEGRADED", "STALE"].includes(root.freshness) ||
    root.completeness !== "POLL_BOUNDED" ||
    data.operation_id !== "managerMarketContextLatestV1" ||
    !Array.isArray(data.items) || data.items.length > 200
  ) throw new QualificationError("LATEST_ENVELOPE_INVALID");
  utcMilliseconds(root.as_of_ms, "LATEST_AS_OF_INVALID");
  for (const item of data.items) {
    const observation = asObject(item, "LATEST_OBSERVATION_INVALID");
    if (
      observation.venue !== "BINANCE" || observation.instrument !== "BTCUSDT" ||
      !["TRADE", "MARK", "INDEX", "BAR_CLOSE"].includes(observation.observation_kind) ||
      typeof observation.quote_currency !== "string" || observation.quote_currency.length === 0 ||
      typeof observation.provider !== "string" || observation.provider.length === 0
    ) throw new QualificationError("LATEST_OBSERVATION_INVALID");
    decimal(observation.value, "LATEST_DECIMAL_INVALID");
    utcMilliseconds(observation.observed_at_ms, "LATEST_TIMESTAMP_INVALID");
  }
  return {
    operation_id: data.operation_id,
    item_count: data.items.length,
    availability: root.availability,
    freshness: root.freshness,
    completeness: root.completeness,
    as_of_ms: root.as_of_ms,
  };
}

function summarizeCandles(body, fromMs, toMs) {
  const root = asObject(body, "CANDLES_ENVELOPE_INVALID");
  const data = asObject(root.data, "CANDLES_DATA_INVALID");
  if (
    root.schema_version !== "trading-system.portal-execution.market-context-envelope.v1" ||
    root.contract_revision !== CONTRACT_REVISION ||
    root.authority !== "EXECUTION_CELL" ||
    root.profile_id !== PROFILE ||
    root.availability !== "AVAILABLE" ||
    !["FRESH", "AGING", "DEGRADED", "STALE"].includes(root.freshness) ||
    root.completeness !== "POLL_BOUNDED" ||
    data.operation_id !== "managerMarketContextCandlesV1" ||
    data.venue !== "BINANCE" || data.instrument !== "BTCUSDT" || data.interval !== "1m" ||
    data.coverage !== "UNKNOWN" || data.sampling !== "SOURCE_BOUNDED" ||
    !Array.isArray(data.items) || data.items.length > 200
  ) throw new QualificationError("CANDLES_ENVELOPE_INVALID");
  utcMilliseconds(root.as_of_ms, "CANDLES_AS_OF_INVALID");
  let previousOpen = -1;
  for (const item of data.items) {
    const candle = asObject(item, "CANDLE_INVALID");
    const openMs = utcMilliseconds(candle.open_ms, "CANDLE_TIMESTAMP_INVALID");
    const closeMs = utcMilliseconds(candle.close_ms, "CANDLE_TIMESTAMP_INVALID");
    if (openMs < fromMs || closeMs > toMs || closeMs < openMs || openMs <= previousOpen) {
      throw new QualificationError("CANDLE_RANGE_INVALID");
    }
    previousOpen = openMs;
    for (const field of ["open", "high", "low", "close", "volume"]) decimal(candle[field], "CANDLE_DECIMAL_INVALID");
  }
  return {
    operation_id: data.operation_id,
    item_count: data.items.length,
    availability: root.availability,
    freshness: root.freshness,
    completeness: root.completeness,
    as_of_ms: root.as_of_ms,
    coverage: data.coverage,
    sampling: data.sampling,
  };
}

async function request({ origin, tls, path, token, maximumBytes }) {
  return new Promise((resolve, reject) => {
    const session = connect(origin.origin, {
      ...tls,
      rejectUnauthorized: true,
      ALPNProtocols: ["h2"],
      minVersion: "TLSv1.3",
      maxVersion: "TLSv1.3",
      servername: isIP(origin.hostname) === 0 ? origin.hostname : undefined,
    });
    let stream;
    let timer;
    let settled = false;
    const settle = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (stream) stream.close();
      session.close();
      if (error) reject(error);
      else resolve(result);
    };
    timer = setTimeout(() => settle(new QualificationError("MARKET_CONTEXT_PROBE_TIMEOUT")), 8_000);
    session.once("error", () => settle(new QualificationError("MARKET_CONTEXT_TLS_OR_TRANSPORT_REJECTED")));
    session.once("connect", () => {
      const socket = session.socket;
      if (socket.alpnProtocol !== "h2" || socket.getProtocol() !== "TLSv1.3") {
        settle(new QualificationError("MARKET_CONTEXT_TLS_OR_HTTP_VERSION_INVALID"));
        return;
      }
      stream = session.request({
        ":method": "GET",
        ":path": path,
        accept: "application/json",
        authorization: `Bearer ${token}`,
      });
      let status = 0;
      let contentType = "";
      let size = 0;
      const chunks = [];
      stream.once("response", (headers) => {
        status = Number(headers[":status"] ?? 0);
        contentType = String(headers["content-type"] ?? "");
        const length = Number(headers["content-length"] ?? 0);
        if (Number.isFinite(length) && length > maximumBytes) {
          settle(new QualificationError("MARKET_CONTEXT_RESPONSE_BOUND_EXCEEDED"));
        }
      });
      stream.on("data", (chunk) => {
        size += chunk.byteLength;
        if (size > maximumBytes) {
          settle(new QualificationError("MARKET_CONTEXT_RESPONSE_BOUND_EXCEEDED"));
          return;
        }
        chunks.push(Buffer.from(chunk));
      });
      stream.once("error", () => settle(new QualificationError("MARKET_CONTEXT_STREAM_REJECTED")));
      stream.once("aborted", () => settle(new QualificationError("MARKET_CONTEXT_STREAM_REJECTED")));
      stream.once("end", () => {
        const body = Buffer.concat(chunks);
        if (body.includes(Buffer.from(token))) {
          settle(new QualificationError("MARKET_CONTEXT_ASSERTION_REFLECTED"));
          return;
        }
        settle(undefined, {
          status,
          content_type_json: contentType.startsWith("application/json"),
          response_bytes: body.byteLength,
          response_sha256: `sha256:${createHash("sha256").update(body).digest("hex")}`,
          body,
          tls_version: socket.getProtocol(),
          http_version: socket.alpnProtocol,
        });
      });
      stream.end();
    });
  });
}

function parseJson(response, code) {
  if (!response.content_type_json) throw new QualificationError(code);
  try {
    return JSON.parse(response.body.toString("utf8"));
  } catch {
    throw new QualificationError(code);
  }
}

function typedFailureCode(response) {
  if (!response.content_type_json) return "NON_JSON";
  try {
    const body = asObject(JSON.parse(response.body.toString("utf8")), "FAILURE_ENVELOPE_INVALID");
    const candidate = body.reason_code ?? asObject(body.error ?? {}, "FAILURE_ENVELOPE_INVALID").code;
    return typeof candidate === "string" && /^[A-Z0-9_]{1,128}$/.test(candidate)
      ? candidate
      : "UNCLASSIFIED";
  } catch {
    return "UNCLASSIFIED";
  }
}

function sanitizedResponse(response, summary) {
  return {
    http_status: response.status,
    response_bytes: response.response_bytes,
    response_sha256: response.response_sha256,
    ...summary,
  };
}

async function run() {
  const origin = parseOrigin(required("MARKET_CONTEXT_QUAL_ORIGIN"));
  exact("MARKET_CONTEXT_QUAL_ENVIRONMENT", ENVIRONMENT);
  exact("MARKET_CONTEXT_QUAL_PROFILE_ID", PROFILE);
  exact("MARKET_CONTEXT_QUAL_AUDIENCE", AUDIENCE);
  exact("MARKET_CONTEXT_QUAL_ISSUER", ISSUER);
  const changeWindow = required("MARKET_CONTEXT_QUAL_CHANGE_WINDOW");
  if (!/^BE-R2-4-PAPER-[A-Za-z0-9._:-]{1,96}$/.test(changeWindow)) {
    throw new QualificationError("INVALID_MARKET_CONTEXT_QUAL_CHANGE_WINDOW");
  }
  const [ca, cert, key, privateKeyPem, keyIdRaw] = await Promise.all([
    regularReadable(absolutePath("MARKET_CONTEXT_QUAL_CA_FILE"), "CA_FILE"),
    regularReadable(absolutePath("MARKET_CONTEXT_QUAL_CLIENT_CERT_FILE"), "CLIENT_CERT_FILE"),
    regularReadable(absolutePath("MARKET_CONTEXT_QUAL_CLIENT_KEY_FILE"), "CLIENT_KEY_FILE", { secret: true }),
    regularReadable(absolutePath("MARKET_CONTEXT_QUAL_DELEGATION_PRIVATE_KEY_FILE"), "DELEGATION_PRIVATE_KEY_FILE", { secret: true }),
    regularReadable(absolutePath("MARKET_CONTEXT_QUAL_KEY_ID_FILE"), "KEY_ID_FILE", { secret: true }),
  ]);
  const keyId = keyIdRaw.toString("utf8").trim();
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(keyId)) throw new QualificationError("INVALID_KEY_ID");
  const privateKey = await importPKCS8(privateKeyPem.toString("utf8"), "RS256");
  const now = Math.floor(Date.now() / 1_000);
  const issue = async (profileId) => new SignJWT({
    sid: `be-r2-4-${randomUUID()}`,
    workspace_id: "be-r2-4-paper-qualification",
    roles: ["ADMIN"],
    scopes: ["execution.read"],
    resources: [RESOURCE],
    environment: ENVIRONMENT,
    profile_id: profileId,
    auth_time: now - 1,
    amr: ["operator_change_window", "mtls"],
  })
    .setProtectedHeader({ alg: "RS256", kid: keyId, typ: "JWT" })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setSubject("be-r2-4-paper-qualifier")
    .setJti(`be-r2-4-${randomUUID()}`)
    .setIssuedAt(now)
    .setNotBefore(now)
    .setExpirationTime(now + 45)
    .sign(privateKey);
  const valid = await issue(PROFILE);
  const wrongProfile = await issue("PAPER_MARKET_CONTEXT_WRONG");
  const tls = { ca, cert, key };
  const toMs = Date.now();
  const fromMs = toMs - 90 * 60 * 1_000;
  const candlesPath = `/internal/v2/manager/market/candles?venue=BINANCE&instrument=BTCUSDT&interval=1m&from_ms=${fromMs}&to_ms=${toMs}&point_limit=200`;
  // Run the four GET-only checks serially. This is a qualification proof, not
  // a load test: serial execution respects the two-route source budget and
  // prevents a rejection from amplifying traffic during a change window.
  const latest = await request({ origin, tls, path: LATEST_PATH, token: valid, maximumBytes: MAX_LATEST_BYTES });
  if (latest.status !== 200) throw new QualificationError(`MARKET_CONTEXT_LATEST_HTTP_${latest.status}_${typedFailureCode(latest)}`);
  const candles = await request({ origin, tls, path: candlesPath, token: valid, maximumBytes: MAX_CANDLES_BYTES });
  if (candles.status !== 200) throw new QualificationError(`MARKET_CONTEXT_CANDLES_HTTP_${candles.status}_${typedFailureCode(candles)}`);
  const invalidInterval = await request({
    origin,
    tls,
    path: "/internal/v2/manager/market/candles?venue=BINANCE&instrument=BTCUSDT&interval=1m%2F&from_ms=1&to_ms=2&point_limit=1",
    token: valid,
    maximumBytes: 64 * 1024,
  });
  if (invalidInterval.status !== 400) throw new QualificationError(`MARKET_CONTEXT_INVALID_INTERVAL_HTTP_${invalidInterval.status}_${typedFailureCode(invalidInterval)}`);
  const profileMismatch = await request({ origin, tls, path: LATEST_PATH, token: wrongProfile, maximumBytes: 64 * 1024 });
  if (profileMismatch.status !== 403) throw new QualificationError(`MARKET_CONTEXT_WRONG_PROFILE_HTTP_${profileMismatch.status}_${typedFailureCode(profileMismatch)}`);
  const latestSummary = summarizeLatest(parseJson(latest, "LATEST_JSON_INVALID"));
  const candlesSummary = summarizeCandles(parseJson(candles, "CANDLES_JSON_INVALID"), fromMs, toMs);
  const transport = { tls_version: latest.tls_version, http_version: latest.http_version, mtls: true };
  if (transport.tls_version !== "TLSv1.3" || transport.http_version !== "h2") {
    throw new QualificationError("MARKET_CONTEXT_TRANSPORT_DRIFTED");
  }
  return {
    schema_version: "portal.execution.market-context-paper-qualification.v1",
    observed_at_utc: new Date().toISOString(),
    change_window_id: changeWindow,
    scope: "PAPER_GET_ONLY_FIXED_MARKET_CONTEXT",
    decision: "ACCEPTED",
    runtime_mutation: false,
    browser_direct_access: false,
    raw_market_payload_persisted: false,
    delegated_resource: RESOURCE,
    adapter_revision: ADAPTER_REVISION,
    contract_revision: CONTRACT_REVISION,
    profile: { environment: ENVIRONMENT, profile_id: PROFILE, audience: AUDIENCE },
    transport,
    operations: [
      sanitizedResponse(latest, latestSummary),
      sanitizedResponse(candles, { ...candlesSummary, requested_from_ms: fromMs, requested_to_ms: toMs, requested_point_limit: 200 }),
    ],
    negative_matrix: {
      invalid_interval_http_status: invalidInterval.status,
      wrong_profile_http_status: profileMismatch.status,
    },
    deployment_feature_activated: false,
  };
}

try {
  const evidence = await run();
  process.stdout.write(`${JSON.stringify(evidence)}\n`);
} catch (error) {
  const code = error instanceof QualificationError ? error.code : "MARKET_CONTEXT_QUALIFICATION_FAILED";
  process.stdout.write(`${JSON.stringify({
    schema_version: "portal.execution.market-context-paper-qualification.v1",
    decision: "REJECTED",
    rejection_code: code,
    runtime_mutation: false,
    raw_market_payload_persisted: false,
  })}\n`);
  process.exitCode = 3;
}
