import { randomBytes } from "node:crypto";

/** Cryptographically random, URL-safe identifier body of `byteLength` bytes. */
export function randomBase64Url(byteLength: number): string {
  return randomBytes(byteLength).toString("base64url");
}

/** Per-request correlation ID surfaced as `X-Request-Id` and in every log line. */
export function newRequestId(): string {
  return `req_${randomBase64Url(16)}`;
}
