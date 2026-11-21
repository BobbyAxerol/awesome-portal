/**
 * RF-05 CG-P13-13 · shared revalidation for the Research read BFFs.
 *
 * `If-None-Match` uses the weak comparison function (RFC 9110 §13.1.2): a
 * gzip-encoding gateway rewrites `"x"` to `W/"x"`, and a client may send a
 * comma-separated list or `*`; each must revalidate the same representation.
 * Answers are per-session (`private`) and must be revalidated before reuse
 * (`no-cache`).
 */

import type { FastifyReply, FastifyRequest } from "fastify";

export function ifNoneMatchWeakly(header: string | string[] | undefined, etag: string): boolean {
  if (header === undefined) return false;
  const opaque = (tag: string) => tag.trim().replace(/^W\//, "");
  const current = opaque(etag);
  const candidates = (Array.isArray(header) ? header : [header])
    .flatMap((value) => value.match(/(?:W\/)?"[^"]*"|\*/g) ?? []);
  return candidates.some((candidate) => candidate === "*" || opaque(candidate) === current);
}

export function sendRevalidatable(reply: FastifyReply, request: FastifyRequest, body: { etag: string | null }) {
  reply.header("cache-control", "private, no-cache");
  if (body.etag) {
    reply.header("etag", body.etag);
    if (ifNoneMatchWeakly(request.headers["if-none-match"], body.etag)) return reply.code(304).send();
  }
  return reply.send(body);
}
