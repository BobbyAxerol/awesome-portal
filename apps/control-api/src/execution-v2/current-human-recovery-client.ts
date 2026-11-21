import { createHash } from "node:crypto";
import type { ClientRequest } from "node:http";
import { request } from "node:https";
import { checkServerIdentity, type ConnectionOptions } from "node:tls";
import { z } from "zod";
import { CurrentHumanLeaseError } from "./current-human-candidate";
import type { CurrentHumanRecoveryAttempt, CurrentHumanRecoveryPort } from "./current-human-mutations";
import { parseCurrentHumanWire } from "./current-human-wire";

export interface CurrentHumanRecoveryClientConfig {
  origin: string;
  tls: Pick<ConnectionOptions, "key" | "cert" | "ca">;
  source_certificate_sha256: string;
  deadline_ms: number;
  response_bytes: number;
}
const acknowledgement = z.object({ schema_version: z.literal("pma.current-human-recover-ack.v1"),
  lease_id: z.string().min(1).max(128), attempt_id: z.string().min(1).max(128),
  phase: z.enum(["COMMITTED", "ROLLED_BACK", "UNKNOWN"]), portal_acknowledged: z.boolean(),
}).strict();
const identifier = z.string().min(1).max(128).regex(/^[^\u0000-\u001f\u007f]+$/);
const recoveryAttempt = z.object({ lease_id: identifier, attempt_id: identifier, workspace_id: identifier,
  environment: z.enum(["paper", "sandbox", "live"]), workload_id: identifier,
  request_digest: z.string().regex(/^sha256:[a-f0-9]{64}$/), human_issuer: identifier, subject: identifier,
  session_id: identifier, session_revision: z.number().int().nonnegative().safe(),
  authority_revision: z.number().int().nonnegative().safe(),
  expires_at: z.number().positive().finite().max(Number.MAX_SAFE_INTEGER),
}).strict();

/** Snapshot TLS values rather than retaining caller-owned mutable buffers or
 * arrays. Support the Node TLS key-object form while rejecting unbounded or
 * unexpected values; key bytes never enter logs or error messages. */
function snapshotPem(value: unknown): string | Buffer {
  if (typeof value === "string" && Buffer.byteLength(value) > 0 && Buffer.byteLength(value) <= 32768) return value;
  if (Buffer.isBuffer(value) && value.length > 0 && value.length <= 32768) return Buffer.from(value);
  throw new Error("INVALID_TLS_MATERIAL");
}
function snapshotCert(value: unknown): string | Buffer | Array<string | Buffer> {
  if (Array.isArray(value)) {
    if (!value.length || value.length > 8) throw new Error("INVALID_TLS_MATERIAL");
    return value.map(snapshotPem);
  }
  return snapshotPem(value);
}
function snapshotKey(value: unknown): NonNullable<ConnectionOptions["key"]> {
  const one = (item: unknown): string | Buffer | { pem: string | Buffer; passphrase?: string } => {
    if (typeof item === "string" || Buffer.isBuffer(item)) return snapshotPem(item);
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("INVALID_TLS_MATERIAL");
    const record = item as {pem?: unknown;passphrase?: unknown};
    const pem = snapshotPem(record.pem), passphrase = record.passphrase;
    if (passphrase !== undefined && (typeof passphrase !== "string" || Buffer.byteLength(passphrase) > 4096))
      throw new Error("INVALID_TLS_MATERIAL");
    return passphrase === undefined ? { pem } : { pem, passphrase };
  };
  if (Array.isArray(value)) {
    if (!value.length || value.length > 8) throw new Error("INVALID_TLS_MATERIAL");
    return value.map(one);
  }
  // Node's object-with-passphrase form is accepted only inside a key array.
  return snapshotPem(value);
}

/** Real, fixed private recovery wire. TLS trust+hostname+exact leaf are checked
 * BEFORE any attempt metadata is sent. No proxy, redirect, retry, cookies or
 * reconstructed human assertion. A plaintext ACK NEVER releases a Core lease. */
export class CurrentHumanRecoveryClient implements CurrentHumanRecoveryPort {
  readonly #url: URL;
  readonly #config: CurrentHumanRecoveryClientConfig;
  constructor(input: CurrentHumanRecoveryClientConfig) {
    try {
      const {origin,source_certificate_sha256,deadline_ms,response_bytes}=input;
      const material=input.tls;
      const tls={key:snapshotKey(material.key),cert:snapshotCert(material.cert),ca:snapshotCert(material.ca)};
      const url = new URL(origin);
      if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash
        || !/^sha256:[a-f0-9]{64}$/.test(source_certificate_sha256)
        || !Number.isSafeInteger(deadline_ms) || deadline_ms < 1 || deadline_ms > 10000
        || !Number.isSafeInteger(response_bytes) || response_bytes < 256 || response_bytes > 32768)
        throw new Error();
      this.#url = new URL("/internal/elp210/current-human/recover", url);
      this.#config = {origin,source_certificate_sha256,deadline_ms,response_bytes,tls};
    } catch { throw new CurrentHumanLeaseError("CURRENT_HUMAN_RECOVERY_CONFIG_INVALID"); }
  }

  recover(attempt: CurrentHumanRecoveryAttempt): Promise<z.infer<typeof acknowledgement>> {
    let payload: Buffer;
    let captured: z.infer<typeof recoveryAttempt>;
    try {
      // Serialize a private validated snapshot: neither an extra token/property
      // nor later mutation of a caller object may change the original or ACK
      // correlation after the HTTP request has started.
      captured = Object.freeze(recoveryAttempt.parse(attempt));
      payload = Buffer.from(JSON.stringify({ schema_version: "pma.current-human-recover.v1", attempt: captured }));
    }
    catch { return Promise.reject(new CurrentHumanLeaseError("CURRENT_HUMAN_RECOVERY_REQUEST_INVALID")); }
    if (payload.length > 8192) return Promise.reject(new CurrentHumanLeaseError("CURRENT_HUMAN_RECOVERY_REQUEST_INVALID"));
    return new Promise((resolve, reject) => {
      let settled = false;
      let req: ClientRequest | undefined;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const fail = () => {
        if (settled) return;
        settled = true; clearTimeout(timer);
        req?.destroy();
        reject(new CurrentHumanLeaseError("CURRENT_HUMAN_RECOVERY_UNAVAILABLE"));
      };
      try {
        req = request(this.#url, { ...this.#config.tls, method: "POST", agent: false,
          minVersion: "TLSv1.3", maxVersion: "TLSv1.3", rejectUnauthorized: true, maxHeaderSize: 8192,
          checkServerIdentity: (host, cert) => {
            const identityError = checkServerIdentity(host, cert);
            if (identityError) return identityError;
            if (`sha256:${createHash("sha256").update(cert.raw).digest("hex")}` !== this.#config.source_certificate_sha256)
              return new Error("CURRENT_HUMAN_RECOVERY_PEER_MISMATCH");
          },
          headers: { "content-type": "application/json", "content-length": payload.length, "connection": "close" },
        }, res => {
          let size = 0;
          const chunks: Buffer[] = [];
          const length = res.headers["content-length"];
          if (res.statusCode !== 200 || res.headers["content-type"] !== "application/json" || res.headers["content-encoding"] !== undefined
            || length !== undefined && (typeof length !== "string" || !/^(0|[1-9][0-9]*)$/.test(length)
              || Number(length) > this.#config.response_bytes)) {
            res.destroy(); fail(); return;
          }
          res.on("error", fail);
          res.on("aborted", fail);
          res.on("data", (chunk: Buffer) => {
            size += chunk.length;
            if (size > this.#config.response_bytes) { res.destroy(); fail(); } else chunks.push(chunk);
          });
          res.on("end", () => {
            if (settled) return;
            try {
              const parsed = acknowledgement.parse(parseCurrentHumanWire(Buffer.concat(chunks)));
              if (parsed.lease_id !== captured.lease_id || parsed.attempt_id !== captured.attempt_id) throw new Error();
              settled = true; clearTimeout(timer); resolve(parsed);
            } catch { fail(); }
          });
        });
        timer = setTimeout(fail, this.#config.deadline_ms);
        req.on("error", fail);
        req.end(payload);
      } catch { fail(); }
    });
  }
}
