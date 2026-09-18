import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/.well-known/xagent-verification.json/route";
import { resetConfigCache } from "@/lib/config";
import { REQUEST_ID_HEADER } from "@/lib/http";

const SHA = "0123456789abcdef0123456789abcdef01234567";

describe("GET /.well-known/xagent-verification.json (placeholder contract)", () => {
  beforeEach(() => {
    resetConfigCache();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetConfigCache();
  });

  it("returns slug and commit when both are configured", async () => {
    vi.stubEnv("XAGENT_SLUG", "settle");
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", SHA);
    const response = await GET(new Request("http://localhost/.well-known/xagent-verification.json"));
    expect(response.status).toBe(200);
    expect(response.headers.get(REQUEST_ID_HEADER)).toMatch(/^req_/);
    await expect(response.json()).resolves.toEqual({ slug: "settle", commit: SHA });
  });

  it("returns 500 rather than fabricated data when the slug is missing", async () => {
    vi.stubEnv("XAGENT_SLUG", "");
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", SHA);
    const response = await GET(new Request("http://localhost/.well-known/xagent-verification.json"));
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "INTERNAL_ERROR",
        message: "X-Agent verification is not configured: missing XAGENT_SLUG",
        retryable: false,
      },
    });
  });

  it("returns 500 rather than fabricated data when the commit is missing", async () => {
    vi.stubEnv("XAGENT_SLUG", "settle");
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "");
    const response = await GET(new Request("http://localhost/.well-known/xagent-verification.json"));
    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("INTERNAL_ERROR");
    expect(body.error.message).toContain("VERCEL_GIT_COMMIT_SHA");
  });
});
