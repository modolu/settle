/**
 * X-Agent verification document — PLACEHOLDER CONTRACT.
 *
 * The official X-Agent verification JSON schema and the final registered slug
 * were not available when this was written (ARCHITECTURE.md §14, §18). Until
 * Milestone 6 this module carries a deliberately minimal internal schema
 * exposing only the two values the product brief requires: the registered
 * slug and the exact deployed commit. No other fields are invented.
 *
 * This module is the ONLY place that knows the document's shape. To adopt the
 * official schema in Milestone 6:
 *   1. copy the official schema/example into a test fixture;
 *   2. replace `xagentVerificationSchema` and `buildXagentVerification`;
 *   3. update `tests/unit/xagent-verification.test.ts` against the fixture.
 * The route handler and configuration should not need to change.
 */
import { z } from "zod";

import type { AppConfig } from "./config";
import { AppError } from "./errors";

export const xagentVerificationSchema = z
  .object({
    slug: z.string().min(1),
    commit: z.string().regex(/^[0-9a-f]{40}$/),
  })
  .strict();

export type XagentVerification = z.infer<typeof xagentVerificationSchema>;

/**
 * Builds the verification document, or throws `INTERNAL_ERROR` when the slug or
 * commit is unavailable. Fabricated values are never returned.
 */
export function buildXagentVerification(
  config: Pick<AppConfig, "xagentSlug" | "commitSha">,
): XagentVerification {
  const missing: string[] = [];
  if (config.xagentSlug === null) {
    missing.push("XAGENT_SLUG");
  }
  if (config.commitSha === null) {
    missing.push("VERCEL_GIT_COMMIT_SHA");
  }
  if (missing.length > 0) {
    throw new AppError(
      "INTERNAL_ERROR",
      `X-Agent verification is not configured: missing ${missing.join(", ")}`,
      { context: { missing } },
    );
  }

  return xagentVerificationSchema.parse({
    slug: config.xagentSlug,
    commit: config.commitSha,
  });
}
