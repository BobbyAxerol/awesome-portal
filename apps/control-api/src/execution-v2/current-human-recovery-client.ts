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

/** Real, fixed private recovery wire. TLS trust+hostname+exact leaf are checked
 * BEFORE any attempt metadata is sent. No proxy, redirect, retry, cookies or
 * reconstructed human assertion. A plaintext ACK NEVER releases a Core lease. */
export class CurrentHumanRecoveryClient implements CurrentHumanRecoveryPort {
  private readonly url: URL;
  private readonly config: CurrentHumanRecoveryClientConfig;
  constructor(input: CurrentHumanRecoveryClientConfig) {
    try {
      const url = new URL(input.origin);
      if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash
        || !/^sha256:[a-f0-9]{64}$/.test(input.source_certificate_sha256)
        || !input.tls.ca || !input.tls.cert || !input.tls.key
        || !Number.isSafeInteger(input.deadline_ms) || input.deadline_ms < 1 || input.deadline_ms > 10000
        || !Number.isSafeInteger(input.response_bytes) || input.response_bytes < 256 || input.response_bytes > 32768)
        throw new Error();
      this.url = new URL("/internal/elp210/current-human/recover", url);
      this.config = { ...input, tls: { ...input.tls } };
    } catch { throw new CurrentHumanLeaseError("CURRENT_HUMAN_RECOVERY_CONFIG_INVALID"); }
  }

  recover(attempt: CurrentHumanRecoveryAttempt): Promise<z.infer<typeof acknowledgement>> {
    let payload: Buffer;
    try { payload = Buffer.from(JSON.stringify({ schema_version: "pma.current-human-recover.v1", attempt })); }
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
        req = request(this.url, { ...this.config.tls, method: "POST", agent: false,
          minVersion: "TLSv1.3", maxVersion: "TLSv1.3", rejectUnauthorized: true, maxHeaderSize: 8192,
          checkServerIdentity: (host, cert) => {
            const identityError = checkServerIdentity(host, cert);
            if (identityError) return identityError;
            if (`sha256:${createHash("sha256").update(cert.raw).digest("hex")}` !== this.config.source_certificate_sha256)
              return new Error("CURRENT_HUMAN_RECOVERY_PEER_MISMATCH");
          },
          headers: { "content-type": "application/json", "content-length": payload.length, "connection": "close" },
        }, res => {
          let size = 0;
          const chunks: Buffer[] = [];
          const length = res.headers["content-length"];
          if (res.statusCode !== 200 || res.headers["content-type"] !== "application/json" || res.headers["content-encoding"] !== undefined
            || length !== undefined && (typeof length !== "string" || !/^(0|[1-9][0-9]*)$/.test(length)
              || Number(length) > this.config.response_bytes)) {
            res.destroy(); fail(); return;
          }
          res.on("error", fail);
          res.on("aborted", fail);
          res.on("data", (chunk: Buffer) => {
            size += chunk.length;
            if (size > this.config.response_bytes) { res.destroy(); fail(); } else chunks.push(chunk);
          });
          res.on("end", () => {
            if (settled) return;
            try {
              const parsed = acknowledgement.parse(parseCurrentHumanWire(Buffer.concat(chunks)));
              if (parsed.lease_id !== attempt.lease_id || parsed.attempt_id !== attempt.attempt_id) throw new Error();
              settled = true; clearTimeout(timer); resolve(parsed);
            } catch { fail(); }
          });
        });
        timer = setTimeout(fail, this.config.deadline_ms);
        req.on("error", fail);
        req.end(payload);
      } catch { fail(); }
    });
  }
}
