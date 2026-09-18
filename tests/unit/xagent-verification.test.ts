import { describe, expect, it } from "vitest";

import { AppError } from "@/lib/errors";
import { buildXagentVerification, xagentVerificationSchema } from "@/lib/xagent-verification";

// PLACEHOLDER CONTRACT: replace these expectations with the official X-Agent
// schema fixture in Milestone 6 (see src/lib/xagent-verification.ts).

const SHA = "0123456789abcdef0123456789abcdef01234567";

describe("buildXagentVerification (placeholder contract)", () => {
  it("returns exactly slug and commit when both are configured", () => {
    const document = buildXagentVerification({ xagentSlug: "settle", commitSha: SHA });
    expect(document).toEqual({ slug: "settle", commit: SHA });
    expect(Object.keys(document)).toEqual(["slug", "commit"]);
    expect(xagentVerificationSchema.safeParse(document).success).toBe(true);
  });

  it("refuses to fabricate a document when the slug is missing", () => {
    expect(() => buildXagentVerification({ xagentSlug: null, commitSha: SHA })).toThrow(AppError);
    try {
      buildXagentVerification({ xagentSlug: null, commitSha: SHA });
    } catch (error) {
      const appError = error as AppError;
      expect(appError.code).toBe("INTERNAL_ERROR");
      expect(appError.httpStatus).toBe(500);
      expect(appError.message).toContain("XAGENT_SLUG");
      expect(appError.message).not.toContain("VERCEL_GIT_COMMIT_SHA");
    }
  });

  it("refuses to fabricate a document when the commit is missing", () => {
    try {
      buildXagentVerification({ xagentSlug: "settle", commitSha: null });
      expect.unreachable("expected an AppError");
    } catch (error) {
      const appError = error as AppError;
      expect(appError.code).toBe("INTERNAL_ERROR");
      expect(appError.message).toContain("VERCEL_GIT_COMMIT_SHA");
    }
  });

  it("lists both variables when neither is configured", () => {
    try {
      buildXagentVerification({ xagentSlug: null, commitSha: null });
      expect.unreachable("expected an AppError");
    } catch (error) {
      expect((error as AppError).message).toBe(
        "X-Agent verification is not configured: missing XAGENT_SLUG, VERCEL_GIT_COMMIT_SHA",
      );
    }
  });

  it("schema rejects extra or malformed fields", () => {
    expect(xagentVerificationSchema.safeParse({ slug: "settle", commit: SHA, extra: 1 }).success).toBe(
      false,
    );
    expect(xagentVerificationSchema.safeParse({ slug: "", commit: SHA }).success).toBe(false);
    expect(xagentVerificationSchema.safeParse({ slug: "settle", commit: "abc" }).success).toBe(false);
  });
});
